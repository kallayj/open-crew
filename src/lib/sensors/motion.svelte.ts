export type PermissionState = 'pending' | 'granted' | 'denied';

const GRAVITY_ALPHA = 0.02;         // very slow LP filter — tracks orientation, not motion
const SMOOTHING_ALPHA = 0.2;        // stroke signal smoothing
const MIN_STROKE_INTERVAL_MS = 800; // cap at ~75 SPM
const BUFFER_SIZE = 4;
const NOISE_THRESHOLD = 1.5;        // m/s² linear accel magnitude for hasMotion
const MIN_PEAK_AMPLITUDE = 0.5;     // m/s² — gates noise peaks from counting as strokes
const MOTION_DEBOUNCE = 10;         // consecutive below-threshold samples before clearing hasMotion
const SETTLE_SAMPLES = 60;          // skip stroke detection while gravity filter settles (~1s at 60Hz)

export class MotionSensor {
  spm = $state<number | null>(null);
  strokePeriodMs = $state<number | null>(null);
  hasMotion = $state(false);
  permissionState = $state<PermissionState>('pending');

  private gravity = { x: 0, y: 0, z: 0 };
  private gravityInitialized = false;
  private smoothedHoriz = 0;
  private prevSmoothedHoriz = 0;
  private risingPeakVal = 0;
  private rising = false;
  private lastPeakTime: number | null = null;
  private intervals: number[] = [];
  private sampleCount = 0;
  private motionFalseCount = 0;

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
      // Non-iOS: just start listening
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

    // Seed gravity with first sample (phone assumed mostly stationary at startup)
    if (!this.gravityInitialized) {
      this.gravity = { x, y, z };
      this.gravityInitialized = true;
      return;
    }

    // Very slow low-pass filter tracks gravity direction as orientation drifts
    this.gravity.x = GRAVITY_ALPHA * x + (1 - GRAVITY_ALPHA) * this.gravity.x;
    this.gravity.y = GRAVITY_ALPHA * y + (1 - GRAVITY_ALPHA) * this.gravity.y;
    this.gravity.z = GRAVITY_ALPHA * z + (1 - GRAVITY_ALPHA) * this.gravity.z;

    // Linear acceleration: remove estimated gravity — works even when e.acceleration is null
    const linX = x - this.gravity.x;
    const linY = y - this.gravity.y;
    const linZ = z - this.gravity.z;
    const linMag = Math.sqrt(linX * linX + linY * linY + linZ * linZ);

    // Debounced hasMotion: set immediately, clear only after sustained stillness
    if (linMag > NOISE_THRESHOLD) {
      this.hasMotion = true;
      this.motionFalseCount = 0;
    } else if (++this.motionFalseCount >= MOTION_DEBOUNCE) {
      this.hasMotion = false;
    }

    this.sampleCount++;
    if (this.sampleCount < SETTLE_SAMPLES) return;

    // Remove vertical component to isolate horizontal (surge) acceleration.
    // Phone is assumed fixed to the boat, so surge dominates: one clean peak per stroke
    // during the drive, a smaller trough during recovery. Orientation-independent.
    const gravMag = Math.sqrt(
      this.gravity.x * this.gravity.x +
      this.gravity.y * this.gravity.y +
      this.gravity.z * this.gravity.z
    );
    if (gravMag < 1) return;

    const vertComponent = (linX * this.gravity.x + linY * this.gravity.y + linZ * this.gravity.z) / gravMag;
    const horizX = linX - vertComponent * (this.gravity.x / gravMag);
    const horizY = linY - vertComponent * (this.gravity.y / gravMag);
    const horizZ = linZ - vertComponent * (this.gravity.z / gravMag);
    const horizMag = Math.sqrt(horizX * horizX + horizY * horizY + horizZ * horizZ);

    this.smoothedHoriz = SMOOTHING_ALPHA * horizMag + (1 - SMOOTHING_ALPHA) * this.smoothedHoriz;

    const val = this.smoothedHoriz;
    const now = performance.now();

    // Peak detection with amplitude gate
    if (!this.rising && val > this.prevSmoothedHoriz) {
      this.rising = true;
      this.risingPeakVal = val;
    } else if (this.rising) {
      if (val > this.risingPeakVal) {
        this.risingPeakVal = val;
      } else if (val < this.prevSmoothedHoriz) {
        // Falling edge — peak passed
        this.rising = false;
        if (this.risingPeakVal >= MIN_PEAK_AMPLITUDE) {
          if (this.lastPeakTime !== null) {
            const interval = now - this.lastPeakTime;
            if (interval >= MIN_STROKE_INTERVAL_MS) {
              this.recordInterval(interval);
              this.lastPeakTime = now;
            }
          } else {
            this.lastPeakTime = now;
          }
        }
        this.risingPeakVal = 0;
      }
    }

    this.prevSmoothedHoriz = val;
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
