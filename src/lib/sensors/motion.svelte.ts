import {
  createInitialState,
  processMotionSample,
  type AlgorithmState,
} from './motionAlgorithm';

export type PermissionState = 'pending' | 'granted' | 'denied';

export class MotionSensor {
  spm = $state<number | null>(null);
  strokePeriodMs = $state<number | null>(null);
  hasMotion = $state(false);
  lastStrokeTime = $state<number | null>(null);
  permissionState = $state<PermissionState>('pending');

  private algoState: AlgorithmState = createInitialState();
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

    this.algoState = processMotionSample(
      { x: ag.x ?? 0, y: ag.y ?? 0, z: ag.z ?? 0, timestamp: performance.now() },
      this.algoState,
    );

    this.spm = this.algoState.spm;
    this.strokePeriodMs = this.algoState.strokePeriodMs;
    this.hasMotion = this.algoState.hasMotion;
    this.lastStrokeTime = this.algoState.lastPeakTime;
  }

  destroy(): void {
    if (this.listener) {
      window.removeEventListener('devicemotion', this.listener);
      this.listener = null;
    }
  }
}
