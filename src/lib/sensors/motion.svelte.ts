export type PermissionState = 'pending' | 'granted' | 'denied';

const SMOOTHING_ALPHA = 0.2;
const MIN_STROKE_INTERVAL_MS = 800; // cap ~75 SPM
const BUFFER_SIZE = 4;
const NOISE_THRESHOLD = 1.5; // m/s² magnitude above gravity baseline
const AXIS_DETECT_WINDOW_MS = 5000;

export class MotionSensor {
  spm = $state<number | null>(null);
  strokePeriodMs = $state<number | null>(null);
  hasMotion = $state(false);
  permissionState = $state<PermissionState>('pending');

  private smoothed = { x: 0, y: 0, z: 0 };
  private axis: 'x' | 'y' | 'z' = 'z';
  private axisDetected = false;
  private axisDetectStart: number | null = null;
  private axisSamples: { x: number[]; y: number[]; z: number[] } = { x: [], y: [], z: [] };

  private lastPeakTime: number | null = null;
  private intervals: number[] = [];
  private prevSmoothedAxis = 0;
  private rising = false;

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

    // Exponential smoothing
    this.smoothed.x = SMOOTHING_ALPHA * x + (1 - SMOOTHING_ALPHA) * this.smoothed.x;
    this.smoothed.y = SMOOTHING_ALPHA * y + (1 - SMOOTHING_ALPHA) * this.smoothed.y;
    this.smoothed.z = SMOOTHING_ALPHA * z + (1 - SMOOTHING_ALPHA) * this.smoothed.z;

    // Detect hasMotion: magnitude of raw accel (without gravity) above threshold
    const rawAcc = e.acceleration;
    if (rawAcc) {
      const mag = Math.sqrt((rawAcc.x ?? 0) ** 2 + (rawAcc.y ?? 0) ** 2 + (rawAcc.z ?? 0) ** 2);
      this.hasMotion = mag > NOISE_THRESHOLD;
    }

    const now = performance.now();

    // Auto-detect dominant axis in first 5 seconds
    if (!this.axisDetected) {
      if (this.axisDetectStart === null) this.axisDetectStart = now;
      this.axisSamples.x.push(x);
      this.axisSamples.y.push(y);
      this.axisSamples.z.push(z);

      if (now - this.axisDetectStart >= AXIS_DETECT_WINDOW_MS) {
        this.axis = this.pickAxis();
        this.axisDetected = true;
      }
      return;
    }

    const val = this.smoothed[this.axis];

    // Peak detection: rising edge crossing
    if (!this.rising && val > this.prevSmoothedAxis) {
      this.rising = true;
    } else if (this.rising && val < this.prevSmoothedAxis) {
      // Falling edge = peak passed
      this.rising = false;
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

    this.prevSmoothedAxis = val;
  }

  private pickAxis(): 'x' | 'y' | 'z' {
    const variance = (arr: number[]) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    };
    const vx = variance(this.axisSamples.x);
    const vy = variance(this.axisSamples.y);
    const vz = variance(this.axisSamples.z);
    if (vx >= vy && vx >= vz) return 'x';
    if (vy >= vx && vy >= vz) return 'y';
    return 'z';
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
