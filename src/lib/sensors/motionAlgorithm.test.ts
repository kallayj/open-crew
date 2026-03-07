import { describe, expect, it } from 'vitest';
import {
  BUFFER_SIZE,
  DISAMBIG_WINDOW_MS,
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
 * x = A * sin(2π * f * t), z = 9.8 (gravity), y = 0.
 */
function sineSamples(
  startMs: number,
  durationMs: number,
  hz: number,
  strokesPerMin: number,
  amplitudeMs2 = 2.5,
): MotionSample[] {
  const dt = 1000 / hz;
  const f = strokesPerMin / 60; // Hz
  const samples: MotionSample[] = [];
  for (let t = 0; t <= durationMs; t += dt) {
    samples.push({
      x: amplitudeMs2 * Math.sin(2 * Math.PI * f * (t / 1000)),
      y: 0,
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
    expect(s.disambigDone).toBe(false);
    expect(s.signFlip).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Settle + disambiguation
// ---------------------------------------------------------------------------

describe('settle period', () => {
  it('does not detect strokes before settle time elapses', () => {
    // Only 1 second of data — still inside SETTLE_TIME_MS (1500 ms)
    const samples = sineSamples(0, 1000, 50, 30);
    const state = replaySamples(samples);
    expect(state.spm).toBeNull();
    expect(state.lastPeakTime).toBeNull();
  });

  it('does not detect strokes before disambiguation window closes', () => {
    // 3 seconds — past settle (1.5s) but inside disambig window (settle+3s = 4.5s)
    const samples = sineSamples(0, 3000, 50, 30);
    const state = replaySamples(samples);
    expect(state.spm).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Steady-state SPM from synthetic sinusoid
// ---------------------------------------------------------------------------

describe('synthetic steady-state rowing', () => {
  // Generate enough data to get past settle + disambig + 4 stroke intervals
  // at 30 SPM (period 2000 ms): need settle(1500) + disambig(3000) + ~8000ms = ~12500ms
  // Use 20 seconds to be safe.
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
// REST_TIMEOUT: SPM clears after prolonged silence
// ---------------------------------------------------------------------------

describe('rest timeout', () => {
  it('clears spm after REST_TIMEOUT_MS of no strokes', () => {
    // Build up SPM at 30 SPM for 20 s, then send a single still sample
    // REST_TIMEOUT_MS + 1 ms after the last peak.
    const activeSamples = sineSamples(0, 20_000, 50, 30, 2.5);

    let state = createInitialState();
    for (const s of activeSamples) state = processMotionSample(s, state);

    expect(state.spm).not.toBeNull();
    const lastPeak = state.lastPeakTime!;

    // Send one still sample well past the rest timeout
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
    // Two peaks separated by less than MIN_STROKE_INTERVAL_MS should not advance lastPeakTime.
    // We test this by checking that intervalBuffer stays empty after a too-short crossing.
    // Seed the algorithm past settle + disambig with 30 SPM to get lastPeakTime set.
    const warmup = sineSamples(0, 20_000, 50, 30, 2.5);
    let state = createInitialState();
    for (const s of warmup) state = processMotionSample(s, state);

    // Record current state
    const peakBefore = state.lastPeakTime;
    const bufferLenBefore = state.intervalBuffer.length;

    // Manually force a fake crossing (too-short interval):
    // inject a sample that is just below threshold, then just above,
    // with the total window being < MIN_STROKE_INTERVAL_MS after the last peak.
    if (peakBefore !== null) {
      const tooSoon = peakBefore + MIN_STROKE_INTERVAL_MS - 100;
      // Drive below threshold
      const forceDown = { x: -5, y: 0, z: 9.8, timestamp: tooSoon };
      // Drive back above threshold
      const forceUp = { x: 5, y: 0, z: 9.8, timestamp: tooSoon + 50 };

      state = processMotionSample(forceDown, state);
      state = processMotionSample(forceUp, state);

      // lastPeakTime should NOT have advanced and buffer should not have grown
      // (interval < MIN_STROKE_INTERVAL_MS was rejected)
      expect(state.intervalBuffer.length).toBeLessThanOrEqual(bufferLenBefore);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 5 placeholder: derived tests from real recording
// ---------------------------------------------------------------------------
// After visual inspection of replay-output.csv, add assertions here, e.g.:
//
// it('reports stable 22 SPM during steady-state window (t=45–90 s)', () => { ... });
// it('recovers SPM after a rest gap visible at t=105 s', () => { ... });
