import { formatPace } from '$lib/utils/format';

export type PermissionState = 'pending' | 'granted' | 'denied';

interface SpeedSample {
  speedMs: number;
  timestamp: number;
}

const DEFAULT_WINDOW_MS = 3000;

export class GpsSensor {
  pace = $state<string | null>(null);
  permissionState = $state<PermissionState>('pending');

  private samples: SpeedSample[] = [];
  private watchId: number | null = null;
  strokePeriodMs = $state<number | null>(null);

  start(): void {
    if (!navigator.geolocation) {
      this.permissionState = 'denied';
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handlePosition(pos),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          this.permissionState = 'denied';
        }
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );
    this.permissionState = 'granted';
  }

  private handlePosition(pos: GeolocationPosition): void {
    const speed = pos.coords.speed; // m/s, null if unavailable
    if (speed === null || speed === undefined) return;

    const now = Date.now();
    this.samples.push({ speedMs: speed, timestamp: now });

    const windowMs = Math.max(this.strokePeriodMs ?? DEFAULT_WINDOW_MS, DEFAULT_WINDOW_MS);
    const cutoff = now - windowMs;
    this.samples = this.samples.filter((s) => s.timestamp >= cutoff);

    if (this.samples.length === 0) return;
    const avg = this.samples.reduce((sum, s) => sum + s.speedMs, 0) / this.samples.length;
    this.pace = formatPace(avg);
  }

  destroy(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}
