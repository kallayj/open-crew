export type PermissionState = 'pending' | 'granted' | 'denied';

// Time-constant parameters — rate-independent across 10–60 Hz devices
const GRAVITY_TAU_S = 3.0;          // gravity filter: tracks orientation drift, ignores motion
const STROKE_TAU_S = 0.08;          // stroke signal smoothing (~80 ms)
const AXIS_TAU_S = 2.0;             // dominant horizontal axis tracking
const SETTLE_TIME_MS = 1500;        // wait for gravity filter to stabilise
const DISAMBIG_WINDOW_MS = 3000;    // collect signal to resolve forward/backward orientation
const MOTION_TIMEOUT_MS = 500;      // clear hasMotion after this long below threshold
const MIN_STROKE_INTERVAL_MS = 800; // cap at ~75 SPM
const NOISE_THRESHOLD = 1.5;        // m/s² linear accel magnitude for hasMotion
const BUFFER_SIZE = 4;              // intervals averaged for SPM output

// Hermsen §4.4.2 dynamic threshold parameters
const THRESHOLD_FLOOR = -0.3;       // m/s² — prevents threshold drifting toward zero at rest
const THRESHOLD_MULTIPLIER = 0.6;   // threshold = deepest_recent_trough × 0.6
const THRESHOLD_BUFFER_SIZE = 5;    // rolling window of recent trough minima

const REST_TIMEOUT_MS = 6000;       // clear stale SPM after 6 s without a stroke

export class MotionSensor {
  spm = $state<number | null>(null);
  strokePeriodMs = $state<number | null>(null);
  hasMotion = $state(false);
  permissionState = $state<PermissionState>('pending');

  private gravity = { x: 0, y: 0, z: 0 };
  private gravityInitialized = false;
  private listenStartTime: number | null = null;
  private lastSampleTime: number | null = null;
  private lastMotionTime: number | null = null;

  // Dominant horizontal axis (slow EMA of |component|; highest = surge axis)
  private axisAbsEma = { x: 0, y: 0, z: 0 };

  // Forward/backward disambiguation (one-time at startup, Hermsen §4.3)
  private signFlip = 1;
  private disambigMax = -Infinity;
  private disambigMin = Infinity;
  private disambigDone = false;

  // Signed stroke signal
  private smoothedSignal = 0;

  // Dynamic threshold state (Hermsen §4.4.2)
  private threshold = THRESHOLD_FLOOR;
  private windowMin = Infinity;       // most negative value since last trough
  private recentMinima: number[] = [];

  // Crossing-point timing
  private belowThreshold = false;
  private tCrossDown: number | null = null;

  // Stroke tracking
  private lastPeakTime: number | null = null;
  private intervals: number[] = [];

  private listener: ((e: DeviceMotionEvent) => void) | null = null;

  async requestPermission(): Promise<void> {
    // iOS 13+ requires explicit permission
    if (typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === 'function') {
      try {
        const result = await (DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
        if (result === 'granted') {
          this.permissionState = 'granted';
          this.startListening();
        } else {
          this.permissionState = 'denied';
        }
      } catch {
        this.permissionState = 'denied';
      }
    } else {
      this.permissionState = 'granted';
      this.startListening();
    }
  }

  private startListening(): void {
    this.listener = (e: DeviceMotionEvent) => this.handleMotion(e);
    window.addEventListener('devicemotion', this.listener);
  }

  private handleMotion(e: DeviceMotionEvent): void {
    const ag = e.accelerationIncludingGravity;
    if (!ag) return;

    const x = ag.x ?? 0;
    const y = ag.y ?? 0;
    const z = ag.z ?? 0;
    const now = performance.now();

    // Seed gravity and timers from the first sample (phone assumed stationary at launch)
    if (!this.gravityInitialized) {
      this.gravity = { x, y, z };
      this.gravityInitialized = true;
      this.listenStartTime = now;
      this.lastSampleTime = now;
      return;
    }

    const dt = Math.min((now - this.lastSampleTime!) / 1000, 0.5);
    this.lastSampleTime = now;

    // Very slow LP filter tracks gravity direction as orientation drifts
    const gravAlpha = 1 - Math.exp(-dt / GRAVITY_TAU_S);
    this.gravity.x = gravAlpha * x + (1 - gravAlpha) * this.gravity.x;
    this.gravity.y = gravAlpha * y + (1 - gravAlpha) * this.gravity.y;
    this.gravity.z = gravAlpha * z + (1 - gravAlpha) * this.gravity.z;

    // Linear acceleration: remove estimated gravity — works without e.acceleration
    const linX = x - this.gravity.x;
    const linY = y - this.gravity.y;
    const linZ = z - this.gravity.z;
    const linMag = Math.sqrt(linX * linX + linY * linY + linZ * linZ);

    // hasMotion: set immediately, clear after sustained stillness
    if (linMag > NOISE_THRESHOLD) {
      this.hasMotion = true;
      this.lastMotionTime = now;
    } else if (this.hasMotion && now - (this.lastMotionTime ?? now) > MOTION_TIMEOUT_MS) {
      this.hasMotion = false;
    }

    if (now - this.listenStartTime! < SETTLE_TIME_MS) return;

    // Project out vertical component → horizontal (surge) vector
    const gravMag = Math.sqrt(
      this.gravity.x * this.gravity.x +
      this.gravity.y * this.gravity.y +
      this.gravity.z * this.gravity.z
    );
    if (gravMag < 1) return;

    const gx = this.gravity.x / gravMag;
    const gy = this.gravity.y / gravMag;
    const gz = this.gravity.z / gravMag;
    const vertComp = linX * gx + linY * gy + linZ * gz;
    const horizX = linX - vertComp * gx;
    const horizY = linY - vertComp * gy;
    const horizZ = linZ - vertComp * gz;
    const horizMag = Math.sqrt(horizX * horizX + horizY * horizY + horizZ * horizZ);

    // Track dominant horizontal axis via slow EMA of absolute component values
    const axisAlpha = 1 - Math.exp(-dt / AXIS_TAU_S);
    this.axisAbsEma.x = axisAlpha * Math.abs(horizX) + (1 - axisAlpha) * this.axisAbsEma.x;
    this.axisAbsEma.y = axisAlpha * Math.abs(horizY) + (1 - axisAlpha) * this.axisAbsEma.y;
    this.axisAbsEma.z = axisAlpha * Math.abs(horizZ) + (1 - axisAlpha) * this.axisAbsEma.z;

    // Sign the magnitude by the current value of the dominant axis (Hermsen §4.3.2)
    const axisSum = this.axisAbsEma.x + this.axisAbsEma.y + this.axisAbsEma.z;
    let dominantVal = 0;
    if (axisSum > 0.01) {
      if (this.axisAbsEma.x >= this.axisAbsEma.y && this.axisAbsEma.x >= this.axisAbsEma.z) {
        dominantVal = horizX;
      } else if (this.axisAbsEma.y >= this.axisAbsEma.x && this.axisAbsEma.y >= this.axisAbsEma.z) {
        dominantVal = horizY;
      } else {
        dominantVal = horizZ;
      }
    }
    const rawSignal = (dominantVal >= 0 ? 1 : -1) * horizMag;

    // Smooth with time-constant filter (consistent peak height regardless of event rate)
    const strokeAlpha = 1 - Math.exp(-dt / STROKE_TAU_S);
    this.smoothedSignal = strokeAlpha * rawSignal + (1 - strokeAlpha) * this.smoothedSignal;

    // Apply forward/backward flip then collect disambiguation data
    const val = this.signFlip * this.smoothedSignal;

    if (!this.disambigDone) {
      this.disambigMax = Math.max(this.disambigMax, val);
      this.disambigMin = Math.min(this.disambigMin, val);
      if (now - this.listenStartTime! >= SETTLE_TIME_MS + DISAMBIG_WINDOW_MS) {
        // Catch deceleration is always deeper than drive acceleration.
        // If the positive peak exceeds the negative peak, our sign is backwards.
        if (this.disambigMax > -this.disambigMin) this.signFlip = -1;
        this.disambigDone = true;
      }
      return; // don't attempt stroke detection until orientation is resolved
    }

    // Track most negative value in current inter-stroke window
    this.windowMin = Math.min(this.windowMin, val);

    // Threshold-crossing detection (Hermsen §4.4.2)
    if (!this.belowThreshold && val < this.threshold) {
      // Down-crossing: entering trough
      this.belowThreshold = true;
      this.tCrossDown = now;
    } else if (this.belowThreshold && val >= this.threshold) {
      // Up-crossing: exiting trough — peak time is midpoint (more stable than raw minimum)
      this.belowThreshold = false;

      if (this.tCrossDown !== null) {
        const peakTime = (this.tCrossDown + now) / 2;
        this.tCrossDown = null;

        // Update dynamic threshold from recent trough minima
        this.recentMinima.push(this.windowMin);
        if (this.recentMinima.length > THRESHOLD_BUFFER_SIZE) this.recentMinima.shift();
        const deepestMin = Math.min(...this.recentMinima);
        this.threshold = Math.min(deepestMin * THRESHOLD_MULTIPLIER, THRESHOLD_FLOOR);
        this.windowMin = Infinity;

        // Record stroke
        if (this.lastPeakTime !== null) {
          const interval = peakTime - this.lastPeakTime;
          if (interval >= MIN_STROKE_INTERVAL_MS) {
            this.recordInterval(interval);
            this.lastPeakTime = peakTime;
          }
        } else {
          this.lastPeakTime = peakTime;
        }
      }
    }

    // Clear stale SPM if no stroke detected for REST_TIMEOUT_MS (Hermsen §4.5)
    if (this.spm !== null && this.lastPeakTime !== null && now - this.lastPeakTime > REST_TIMEOUT_MS) {
      this.spm = null;
      this.strokePeriodMs = null;
    }
  }

  private recordInterval(interval: number): void {
    this.intervals.push(interval);
    if (this.intervals.length > BUFFER_SIZE) this.intervals.shift();
    const mean = this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length;
    this.strokePeriodMs = mean;
    this.spm = 60000 / mean;
  }

  destroy(): void {
    if (this.listener) {
      window.removeEventListener('devicemotion', this.listener);
      this.listener = null;
    }
  }
}
