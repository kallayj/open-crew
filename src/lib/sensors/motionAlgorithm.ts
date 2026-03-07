// Pure, side-effect-free stroke-rate algorithm extracted from MotionSensor.
// All timing uses sample.timestamp (ms) — no performance.now(), no setTimeout.

// Time-constant parameters — rate-independent across 10–60 Hz devices
export const GRAVITY_TAU_S = 3.0;
export const STROKE_TAU_S = 0.08;
export const AXIS_TAU_S = 2.0;
export const SETTLE_TIME_MS = 1500;
export const DISAMBIG_WINDOW_MS = 3000;
export const MOTION_TIMEOUT_MS = 500;
export const MIN_STROKE_INTERVAL_MS = 800;
export const NOISE_THRESHOLD = 1.5;
export const BUFFER_SIZE = 4;

export const THRESHOLD_FLOOR = -0.3;
export const THRESHOLD_MULTIPLIER = 0.6;
export const THRESHOLD_BUFFER_SIZE = 5;

export const REST_TIMEOUT_MS = 6000;

export interface MotionSample {
  x: number;
  y: number;
  z: number;
  timestamp: number; // milliseconds
}

export interface AlgorithmState {
  // Initialization / timing
  gravity: { x: number; y: number; z: number } | null;
  settleStartTime: number | null;
  lastSampleTime: number | null;

  // Dominant horizontal axis tracking
  axisAbsEma: { x: number; y: number; z: number };

  // Forward/backward disambiguation (Hermsen §4.3)
  signFlip: 1 | -1;
  disambigMax: number;
  disambigMin: number;
  disambigDone: boolean;

  // Signed stroke signal (smoothed)
  smoothedSignal: number;

  // Dynamic threshold (Hermsen §4.4.2)
  threshold: number;
  windowMin: number;
  recentTroughs: number[];

  // Threshold crossing state
  belowThreshold: boolean;
  crossDownTime: number | null;

  // Stroke tracking
  lastPeakTime: number | null;
  intervalBuffer: number[];

  // Outputs
  spm: number | null;
  strokePeriodMs: number | null;

  // Motion detection
  lastMotionTime: number | null;
  hasMotion: boolean;
}

export function createInitialState(): AlgorithmState {
  return {
    gravity: null,
    settleStartTime: null,
    lastSampleTime: null,

    axisAbsEma: { x: 0, y: 0, z: 0 },

    signFlip: 1,
    disambigMax: -Infinity,
    disambigMin: Infinity,
    disambigDone: false,

    smoothedSignal: 0,

    threshold: THRESHOLD_FLOOR,
    windowMin: Infinity,
    recentTroughs: [],

    belowThreshold: false,
    crossDownTime: null,

    lastPeakTime: null,
    intervalBuffer: [],

    spm: null,
    strokePeriodMs: null,

    lastMotionTime: null,
    hasMotion: false,
  };
}

/**
 * Process one accelerometer sample. Mutates and returns `state`.
 * No side effects — safe to use in tests and workers.
 */
export function processMotionSample(sample: MotionSample, state: AlgorithmState): AlgorithmState {
  const { x, y, z, timestamp: now } = sample;

  // Seed gravity and settle timer from first sample (phone assumed stationary)
  if (state.gravity === null) {
    state.gravity = { x, y, z };
    state.settleStartTime = now;
    state.lastSampleTime = now;
    return state;
  }

  const dt = Math.min((now - state.lastSampleTime!) / 1000, 0.5);
  state.lastSampleTime = now;

  // Very slow LP filter tracks gravity direction as orientation drifts
  const gravAlpha = 1 - Math.exp(-dt / GRAVITY_TAU_S);
  state.gravity.x = gravAlpha * x + (1 - gravAlpha) * state.gravity.x;
  state.gravity.y = gravAlpha * y + (1 - gravAlpha) * state.gravity.y;
  state.gravity.z = gravAlpha * z + (1 - gravAlpha) * state.gravity.z;

  // Linear acceleration: remove estimated gravity — works without e.acceleration
  const linX = x - state.gravity.x;
  const linY = y - state.gravity.y;
  const linZ = z - state.gravity.z;
  const linMag = Math.sqrt(linX * linX + linY * linY + linZ * linZ);

  // hasMotion: set immediately, clear after sustained stillness
  if (linMag > NOISE_THRESHOLD) {
    state.hasMotion = true;
    state.lastMotionTime = now;
  } else if (state.hasMotion && now - (state.lastMotionTime ?? now) > MOTION_TIMEOUT_MS) {
    state.hasMotion = false;
  }

  // Wait for gravity filter to stabilise
  if (now - state.settleStartTime! < SETTLE_TIME_MS) return state;

  // Project out vertical component → horizontal (surge) vector
  const grav = state.gravity;
  const gravMag = Math.sqrt(grav.x * grav.x + grav.y * grav.y + grav.z * grav.z);
  if (gravMag < 1) return state;

  const gx = grav.x / gravMag;
  const gy = grav.y / gravMag;
  const gz = grav.z / gravMag;
  const vertComp = linX * gx + linY * gy + linZ * gz;
  const horizX = linX - vertComp * gx;
  const horizY = linY - vertComp * gy;
  const horizZ = linZ - vertComp * gz;
  const horizMag = Math.sqrt(horizX * horizX + horizY * horizY + horizZ * horizZ);

  // Track dominant horizontal axis via slow EMA of absolute component values
  const axisAlpha = 1 - Math.exp(-dt / AXIS_TAU_S);
  state.axisAbsEma.x = axisAlpha * Math.abs(horizX) + (1 - axisAlpha) * state.axisAbsEma.x;
  state.axisAbsEma.y = axisAlpha * Math.abs(horizY) + (1 - axisAlpha) * state.axisAbsEma.y;
  state.axisAbsEma.z = axisAlpha * Math.abs(horizZ) + (1 - axisAlpha) * state.axisAbsEma.z;

  // Sign the magnitude by the current value of the dominant axis (Hermsen §4.3.2)
  const axisSum = state.axisAbsEma.x + state.axisAbsEma.y + state.axisAbsEma.z;
  let dominantVal = 0;
  if (axisSum > 0.01) {
    if (state.axisAbsEma.x >= state.axisAbsEma.y && state.axisAbsEma.x >= state.axisAbsEma.z) {
      dominantVal = horizX;
    } else if (state.axisAbsEma.y >= state.axisAbsEma.x && state.axisAbsEma.y >= state.axisAbsEma.z) {
      dominantVal = horizY;
    } else {
      dominantVal = horizZ;
    }
  }
  const rawSignal = (dominantVal >= 0 ? 1 : -1) * horizMag;

  // Smooth with time-constant filter (consistent peak height regardless of event rate)
  const strokeAlpha = 1 - Math.exp(-dt / STROKE_TAU_S);
  state.smoothedSignal = strokeAlpha * rawSignal + (1 - strokeAlpha) * state.smoothedSignal;

  // Apply forward/backward flip then collect disambiguation data
  const val = state.signFlip * state.smoothedSignal;

  if (!state.disambigDone) {
    state.disambigMax = Math.max(state.disambigMax, val);
    state.disambigMin = Math.min(state.disambigMin, val);
    if (now - state.settleStartTime! >= SETTLE_TIME_MS + DISAMBIG_WINDOW_MS) {
      // Catch deceleration is always deeper than drive acceleration.
      // If the positive peak exceeds the negative peak, our sign is backwards.
      if (state.disambigMax > -state.disambigMin) state.signFlip = -1;
      state.disambigDone = true;
    }
    return state;
  }

  // Track most negative value in current inter-stroke window
  state.windowMin = Math.min(state.windowMin, val);

  // Threshold-crossing detection (Hermsen §4.4.2)
  if (!state.belowThreshold && val < state.threshold) {
    // Down-crossing: entering trough
    state.belowThreshold = true;
    state.crossDownTime = now;
  } else if (state.belowThreshold && val >= state.threshold) {
    // Up-crossing: exiting trough — peak time is midpoint (more stable than raw minimum)
    state.belowThreshold = false;

    if (state.crossDownTime !== null) {
      const peakTime = (state.crossDownTime + now) / 2;
      state.crossDownTime = null;

      // Update dynamic threshold from recent trough minima
      state.recentTroughs.push(state.windowMin);
      if (state.recentTroughs.length > THRESHOLD_BUFFER_SIZE) state.recentTroughs.shift();
      const deepestMin = Math.min(...state.recentTroughs);
      state.threshold = Math.min(deepestMin * THRESHOLD_MULTIPLIER, THRESHOLD_FLOOR);
      state.windowMin = Infinity;

      // Record stroke
      if (state.lastPeakTime !== null) {
        const interval = peakTime - state.lastPeakTime;
        if (interval >= MIN_STROKE_INTERVAL_MS) {
          state.intervalBuffer.push(interval);
          if (state.intervalBuffer.length > BUFFER_SIZE) state.intervalBuffer.shift();
          const mean = state.intervalBuffer.reduce((a, b) => a + b, 0) / state.intervalBuffer.length;
          state.strokePeriodMs = mean;
          state.spm = 60000 / mean;
          state.lastPeakTime = peakTime;
        }
        // if interval < MIN_STROKE_INTERVAL_MS: discard detection, keep old lastPeakTime
      } else {
        state.lastPeakTime = peakTime;
      }
    }
  }

  // Clear stale SPM if no stroke detected for REST_TIMEOUT_MS (Hermsen §4.5)
  if (state.spm !== null && state.lastPeakTime !== null && now - state.lastPeakTime > REST_TIMEOUT_MS) {
    state.spm = null;
    state.strokePeriodMs = null;
  }

  return state;
}
