import { formatPace } from '$lib/utils/format';

export type PermissionState = 'pending' | 'granted' | 'denied';

/** Positions with accuracy worse than this are not used for pace calculation. */
export const MIN_ACCURACY_M = 20;

/**
 * Accuracy this poor almost certainly means an IP-based location fix.
 * Real GPS, even indoors, typically comes in under a few hundred metres.
 */
export const IP_ACCURACY_M = 1000;

const MIN_SPEED_MS = 0.5;        // m/s — below this show null rather than a nonsense split
const BUFFER_TIME_MS = 10_000;   // rolling window for pace averaging

interface SpeedSample {
  speed: number;
  timestamp: number;
}

export class GpsSensor {
  pace = $state<string | null>(null);
  permissionState = $state<PermissionState>('pending');
  accuracy = $state<number | null>(null);
  position = $state<{ lat: number; lon: number } | null>(null);
  /** True when the fix includes altitude, indicating a real GNSS fix rather than IP/WiFi. */
  isGpsFix = $state<boolean | null>(null);

  private samples: SpeedSample[] = [];
  private watchId: number | null = null;
  private firstFixResolve: ((accuracy: number | null) => void) | null = null;

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
          if (this.firstFixResolve) {
            this.firstFixResolve(null);
            this.firstFixResolve = null;
          }
        }
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );
    // permissionState is set to 'granted' in handlePosition() once we know
    // the browser actually delivered a position (iOS fires the error callback
    // with PERMISSION_DENIED if the user denies the system dialog).
  }

  /**
   * Resolves with the accuracy (metres) of the first position fix, or null if
   * no fix arrives within timeoutMs. If a fix is already available, resolves
   * immediately.
   */
  waitForFirstFix(timeoutMs: number): Promise<number | null> {
    if (this.accuracy !== null) return Promise.resolve(this.accuracy);
    return new Promise<number | null>((resolve) => {
      let settled = false;
      this.firstFixResolve = (accuracy: number | null) => {
        if (!settled) { settled = true; resolve(accuracy); }
      };
      setTimeout(() => {
        if (!settled) {
          settled = true;
          this.firstFixResolve = null;
          resolve(null);
        }
      }, timeoutMs);
    });
  }

  private handlePosition(pos: GeolocationPosition): void {
    this.permissionState = 'granted';
    const acc = pos.coords.accuracy;
    const { latitude: lat, longitude: lon } = pos.coords;
    this.accuracy = acc;
    this.position = { lat, lon };
    this.isGpsFix = pos.coords.altitude !== null;

    if (this.firstFixResolve) {
      this.firstFixResolve(acc);
      this.firstFixResolve = null;
    }

    // Don't compute pace from inaccurate or invalid fixes (acc=0 is a browser bug)
    if (acc > MIN_ACCURACY_M) {
      this.pace = null;
      return;
    }

    const spd = pos.coords.speed;
    if (spd === null || spd < 0) return;

    this.samples.push({ speed: spd, timestamp: pos.timestamp });

    // Trim samples outside the rolling time window
    while (
      this.samples.length > 1 &&
      this.samples[this.samples.length - 1].timestamp - this.samples[0].timestamp > BUFFER_TIME_MS
    ) {
      this.samples.shift();
    }

    const avg = this.samples.reduce((sum, s) => sum + s.speed, 0) / this.samples.length;
    this.pace = avg >= MIN_SPEED_MS ? formatPace(avg) : null;
  }

  destroy(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}
