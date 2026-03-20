/**
 * Heading sensor — combines GPS track heading (underway) with IMU absolute
 * orientation (at rest), calibrated by a boat-device heading offset.
 *
 * Sources in priority order:
 *   1. GPS track heading  — when speed ≥ HEADING_SPEED_THRESHOLD_MS
 *   2. IMU heading        — after a GPS-derived calibration offset is established
 *
 * Calibration: when GPS track heading is first available (and IMU alpha is known),
 * the boat-device offset is stored as (gpsHeading − imuCompassBearing) mod 360.
 * This offset is retained until destroy() is called (repositioning detection to
 * be added in a future step).
 *
 * Alpha convention: DeviceOrientationAbsolute alpha is treated as counterclockwise
 * from magnetic north (MDN spec), so imuCompassBearing = (360 − alpha) % 360.
 * The calibration offset corrects for any implementation divergence transparently.
 */

const HEADING_SPEED_THRESHOLD_MS = 0.5; // m/s

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export class HeadingSensor {
  /** Current heading in degrees clockwise from north (0–359), or null. */
  heading = $state<number | null>(null);
  /** Which source is currently driving the heading value. */
  source = $state<'gps' | 'imu' | null>(null);
  /**
   * Whether absolute IMU orientation is available on this device.
   * null = not yet determined; true = available; false = unavailable.
   */
  imuAvailable = $state<boolean | null>(null);

  private imuAlpha: number | null = null;
  private boatDeviceOffset: number | null = null;
  private gpsSpeedMs: number | null = null;
  private gpsTrackHeading: number | null = null;
  private orientationHandler: EventListener | null = null;

  start(): void {
    const handler = (e: Event) => {
      const doe = e as DeviceOrientationEvent;
      if (!doe.absolute || doe.alpha === null) return;
      this.imuAvailable = true;
      this.imuAlpha = doe.alpha;
      this.recompute();
    };
    this.orientationHandler = handler;
    window.addEventListener('deviceorientationabsolute', handler);

    // If no absolute orientation event fires in 2 s, mark as unavailable.
    setTimeout(() => {
      if (this.imuAlpha === null) this.imuAvailable = false;
    }, 2000);
  }

  /**
   * Called (via $effect in +page.svelte) whenever the GPS sensor's speed or
   * track heading changes.
   */
  update(speedMs: number | null, trackHeading: number | null): void {
    this.gpsSpeedMs = speedMs;
    this.gpsTrackHeading = trackHeading;
    this.recompute();
  }

  private recompute(): void {
    const hasGpsHeading =
      this.gpsSpeedMs !== null &&
      this.gpsSpeedMs >= HEADING_SPEED_THRESHOLD_MS &&
      this.gpsTrackHeading !== null;

    if (hasGpsHeading) {
      const gpsH = this.gpsTrackHeading!;
      // Calibrate: update boat-device offset whenever GPS heading is available and
      // IMU alpha is known.
      if (this.imuAlpha !== null) {
        const imuCompass = normalizeAngle(360 - this.imuAlpha);
        this.boatDeviceOffset = normalizeAngle(gpsH - imuCompass);
      }
      this.heading = Math.round(normalizeAngle(gpsH));
      this.source = 'gps';
      return;
    }

    if (this.imuAlpha !== null && this.boatDeviceOffset !== null) {
      const imuCompass = normalizeAngle(360 - this.imuAlpha);
      this.heading = Math.round(normalizeAngle(imuCompass + this.boatDeviceOffset));
      this.source = 'imu';
      return;
    }

    this.heading = null;
    this.source = null;
  }

  destroy(): void {
    if (this.orientationHandler) {
      window.removeEventListener('deviceorientationabsolute', this.orientationHandler);
      this.orientationHandler = null;
    }
  }
}
