import { describe, expect, it } from 'vitest';
import {
  BUFFER_SIZE,
  MIN_STROKE_INTERVAL_MS,
  REST_TIMEOUT_MS,
  SETTLE_TIME_MS,
  createInitialState,
  processMotionSample,
  type MotionSample,
} from './motionAlgorithm';

// ---------------------------------------------------------------------------
// Synthetic signal helpers
// ---------------------------------------------------------------------------

/**
 * Generate samples at `hz` Hz for `durationMs` ms starting at `startMs`.
 * Surge signal on x or y axis; z = 9.8 (gravity).
 */
function sineSamples(
  startMs: number,
  durationMs: number,
  hz: number,
  strokesPerMin: number,
  amplitudeMs2 = 2.5,
  opts: { axis?: 'x' | 'y' } = {},
): MotionSample[] {
  const { axis = 'x' } = opts;
  const dt = 1000 / hz;
  const f = strokesPerMin / 60;
  const samples: MotionSample[] = [];
  for (let t = 0; t <= durationMs; t += dt) {
    const surge = amplitudeMs2 * Math.sin(2 * Math.PI * f * (t / 1000));
    samples.push({
      x: axis === 'x' ? surge : 0,
      y: axis === 'y' ? surge : 0,
      z: 9.8,
      timestamp: startMs + t,
    });
  }
  return samples;
}

function replaySamples(samples: MotionSample[]) {
  let state = createInitialState();
  for (const s of samples) state = processMotionSample(s, state);
  return state;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('createInitialState', () => {
  it('initialises with null spm, hasMotion false, gravity null', () => {
    const s = createInitialState();
    expect(s.spm).toBeNull();
    expect(s.hasMotion).toBe(false);
    expect(s.gravity).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Settle period
// ---------------------------------------------------------------------------

describe('settle period', () => {
  it('does not detect strokes before settle time elapses', () => {
    // Only 1 second of data — still inside SETTLE_TIME_MS (1500 ms)
    const samples = sineSamples(0, 1000, 50, 30);
    const state = replaySamples(samples);
    expect(state.spm).toBeNull();
    expect(state.lastPeakTime).toBeNull();
  });

  it('detects strokes as soon as settle elapses', () => {
    // 6.5 s at 30 SPM: first interval available ~3.5 s after settle.
    // No disambiguation window should delay detection beyond SETTLE_TIME_MS.
    const samples = sineSamples(0, 6500, 50, 30);
    const state = replaySamples(samples);
    expect(state.spm).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Steady-state SPM from synthetic sinusoid
// ---------------------------------------------------------------------------

describe('synthetic steady-state rowing', () => {
  // settle(1500) + 4 intervals at 30 SPM (8000 ms) + margin = 20 s
  const SAMPLE_HZ = 50;
  const TARGET_SPM = 30;
  const samples = sineSamples(0, 20_000, SAMPLE_HZ, TARGET_SPM, 2.5);

  it('produces non-null SPM after warmup', () => {
    const state = replaySamples(samples);
    expect(state.spm).not.toBeNull();
  });

  it('reports SPM within ±5 of target at 30 SPM', () => {
    const state = replaySamples(samples);
    expect(state.spm).not.toBeNull();
    expect(state.spm!).toBeGreaterThan(TARGET_SPM - 5);
    expect(state.spm!).toBeLessThan(TARGET_SPM + 5);
  });

  it('produces intervalBuffer of length BUFFER_SIZE', () => {
    const state = replaySamples(samples);
    expect(state.intervalBuffer.length).toBe(BUFFER_SIZE);
  });

  it('detects hasMotion during active rowing', () => {
    const state = replaySamples(samples);
    expect(state.hasMotion).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Axis reorientation — self-healing after device is remounted or rotated
//
// A 90° yaw rotation moves the stroke signal from one horizontal axis to
// another. The dominant axis EMA (τ = 2 s) re-adapts automatically.
// Forward direction (bow vs. stern sign) is not tracked here — it is derived
// from the GPS track at speed and is outside the motion algorithm's scope.
// ---------------------------------------------------------------------------

describe('axis reorientation', () => {
  it('recovers SPM after dominant axis switches from x to y', () => {
    const TARGET_SPM = 30;

    // Warm up on x-axis for 20 s.
    const warmup = sineSamples(0, 20_000, 50, TARGET_SPM, 2.5, { axis: 'x' });
    let state = createInitialState();
    for (const s of warmup) state = processMotionSample(s, state);
    expect(state.spm).not.toBeNull();

    // Continue on y-axis. AXIS_TAU_S = 2 s, so 15 s is well past adaptation.
    const after = sineSamples(20_000, 15_000, 50, TARGET_SPM, 2.5, { axis: 'y' });
    for (const s of after) state = processMotionSample(s, state);

    expect(state.spm).not.toBeNull();
    expect(state.spm!).toBeGreaterThan(TARGET_SPM - 5);
    expect(state.spm!).toBeLessThan(TARGET_SPM + 5);
  });
});

// ---------------------------------------------------------------------------
// REST_TIMEOUT: SPM clears after prolonged silence
// ---------------------------------------------------------------------------

describe('rest timeout', () => {
  it('clears spm after REST_TIMEOUT_MS of no strokes', () => {
    const activeSamples = sineSamples(0, 20_000, 50, 30, 2.5);

    let state = createInitialState();
    for (const s of activeSamples) state = processMotionSample(s, state);

    expect(state.spm).not.toBeNull();
    const lastPeak = state.lastPeakTime!;

    const stillTimestamp = lastPeak + REST_TIMEOUT_MS + 1;
    state = processMotionSample({ x: 0, y: 0, z: 9.8, timestamp: stillTimestamp }, state);

    expect(state.spm).toBeNull();
    expect(state.strokePeriodMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MIN_STROKE_INTERVAL debounce
// ---------------------------------------------------------------------------

describe('stroke debounce', () => {
  it('does not count an interval shorter than MIN_STROKE_INTERVAL_MS', () => {
    const warmup = sineSamples(0, 20_000, 50, 30, 2.5);
    let state = createInitialState();
    for (const s of warmup) state = processMotionSample(s, state);

    const peakBefore = state.lastPeakTime;
    const bufferLenBefore = state.intervalBuffer.length;

    if (peakBefore !== null) {
      const tooSoon = peakBefore + MIN_STROKE_INTERVAL_MS - 100;
      state = processMotionSample({ x: -5, y: 0, z: 9.8, timestamp: tooSoon }, state);
      state = processMotionSample({ x: 5, y: 0, z: 9.8, timestamp: tooSoon + 50 }, state);

      expect(state.intervalBuffer.length).toBeLessThanOrEqual(bufferLenBefore);
    }
  });
});

// ---------------------------------------------------------------------------
// First-stroke detection: lastPeakTime available before spm
//
// The Stopwatch uses lastPeakTime (exposed as lastStrokeTime) to confirm
// rowing has begun after a single trough — one stroke earlier than spm,
// which requires two troughs for an interval.
// ---------------------------------------------------------------------------

describe('first-stroke detection', () => {
  it('sets lastPeakTime after the first trough without setting spm', () => {
    // At 30 SPM, settle ends at t=1500 ms. The signal is at its negative peak
    // at that moment, so the first down-crossing is registered immediately.
    // The first up-crossing (and lastPeakTime) arrives ~t=2000 ms;
    // the second up-crossing (and spm) not until ~t=4000 ms.
    // 3 s of data sits cleanly between the two.
    const samples = sineSamples(0, 3000, 50, 30);
    const state = replaySamples(samples);
    expect(state.lastPeakTime).not.toBeNull();
    expect(state.spm).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 5 placeholder: derived tests from real recording
// ---------------------------------------------------------------------------
// After visual inspection of replay-output.csv, add assertions here, e.g.:
//
// it('reports stable 22 SPM during steady-state window (t=45–90 s)', () => { ... });
// it('recovers SPM after a rest gap visible at t=105 s', () => { ... });
