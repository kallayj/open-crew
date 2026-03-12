import { formatPace } from '$lib/utils/format';

export type PermissionState = 'pending' | 'granted' | 'denied';

/** Positions with accuracy worse than this are not used for pace calculation. */
export const MIN_ACCURACY_M = 20;

/**
 * Accuracy this poor almost certainly means an IP-based location fix.
 * Real GPS, even indoors, typically comes in under a few hundred metres.
 */
export const IP_ACCURACY_M = 1000;

interface PositionSample {
  lat: number;
  lon: number;
  timestamp: number;
}

function haversine(a: PositionSample, b: PositionSample): number {
  const R = 6_371_000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const MIN_SPEED_MS = 0.5;         // m/s — below this show null rather than a nonsense split
const MAX_BUFFER_TIME_MS = 60_000; // prevent unbounded buffer growth when stationary

export class GpsSensor {
  pace = $state<string | null>(null);
  permissionState = $state<PermissionState>('pending');
  accuracy = $state<number | null>(null);

  /** Average speed over the last N metres. One rowing stroke covers ~8-10 m. */
  distanceWindowM = $state(50);

  private positions: PositionSample[] = [];
  private segmentDists: number[] = []; // segmentDists[i] = dist from positions[i] to positions[i+1]
  private watchId: number | null = null;
  private firstFixResolve: ((accuracy: number) => void) | null = null;

  start(): void {
    if (!navigator.geolocation) {
      this.permissionState = 'denied';
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handlePosition(pos),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) this.permissionState = 'denied';
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );
    this.permissionState = 'granted';
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
      this.firstFixResolve = (accuracy: number) => {
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
    const acc = pos.coords.accuracy;
    this.accuracy = acc;

    if (this.firstFixResolve) {
      this.firstFixResolve(acc);
      this.firstFixResolve = null;
    }

    // Don't compute pace from inaccurate fixes
    if (acc > MIN_ACCURACY_M) {
      this.pace = null;
      return;
    }

    const { latitude: lat, longitude: lon } = pos.coords;
    const newSample = { lat, lon, timestamp: pos.timestamp };

    if (this.positions.length > 0) {
      const d = haversine(this.positions[this.positions.length - 1], newSample);
      this.segmentDists.push(d);
    }
    this.positions.push(newSample);

    if (this.positions.length < 2) return;

    let totalDist = this.segmentDists.reduce((a, b) => a + b, 0);

    // Trim oldest segments while the remaining distance still covers the window
    while (this.segmentDists.length > 1 && totalDist - this.segmentDists[0] >= this.distanceWindowM) {
      totalDist -= this.segmentDists.shift()!;
      this.positions.shift();
    }

    // Also trim by time to prevent unbounded growth when stationary
    while (
      this.positions.length > 1 &&
      this.positions[this.positions.length - 1].timestamp - this.positions[0].timestamp > MAX_BUFFER_TIME_MS
    ) {
      totalDist -= this.segmentDists.shift()!;
      this.positions.shift();
    }

    if (totalDist < 1) return;

    const totalTime =
      (this.positions[this.positions.length - 1].timestamp - this.positions[0].timestamp) / 1000;
    if (totalTime <= 0) return;

    const speed = totalDist / totalTime;
    if (speed < MIN_SPEED_MS) {
      this.pace = null;
      return;
    }

    this.pace = formatPace(speed);
  }

  destroy(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}
