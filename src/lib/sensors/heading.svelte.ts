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
 * This offset is retained until a repositioning event invalidates it, at which
 * point it is re-derived on the next above-threshold GPS rowing stint.
 *
 * Repositioning detection uses DeviceMotionEvent.rotationRate, whose alpha/beta/gamma
 * are angular velocity components along the device's own axes — a different meaning
 * from the world-frame Euler angles of the same names in DeviceOrientationAbsolute.
 * However, angular velocity magnitude (sqrt(alpha²+beta²+gamma²)) is frame-invariant:
 * it equals the true total angular speed regardless of device orientation, making it
 * directly comparable to the boat's world-frame turn rate (~12°/s for a shell taking
 * ≥30 s to spin 360°). A threshold well above that but well below the rotational
 * speeds seen when a phone is picked up (~60–180°/s) cleanly separates the two cases.
 *
 * Orientation alpha convention: DeviceOrientationAbsolute alpha is treated as
 * counterclockwise from magnetic north (MDN spec), so
 * imuCompassBearing = (360 − alpha) % 360.
 * The calibration offset corrects for any implementation divergence transparently.
 */

const HEADING_SPEED_THRESHOLD_MS = 0.5; // m/s
/** Total angular speed threshold for repositioning detection (°/s). */
const REPOSITION_DPS = 30;

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
  /** Angle in degrees clockwise from the device's screen-top to the boat's bow. Null until GPS calibration establishes it. */
  boatDeviceOffset = $state<number | null>(null);

  private imuAlpha: number | null = null;
  private gpsSpeedMs: number | null = null;
  private gpsTrackHeading: number | null = null;
  private orientationHandler: EventListener | null = null;
  private motionHandler: EventListener | null = null;

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

    const motionHandler = (e: Event) => {
      const rr = (e as DeviceMotionEvent).rotationRate;
      if (!rr || rr.alpha === null || rr.beta === null || rr.gamma === null) return;
      const totalDps = Math.sqrt(rr.alpha ** 2 + rr.beta ** 2 + rr.gamma ** 2);
      if (totalDps > REPOSITION_DPS) {
        this.boatDeviceOffset = null;
        this.recompute();
      }
    };
    this.motionHandler = motionHandler;
    window.addEventListener('devicemotion', motionHandler);
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
    if (this.motionHandler) {
      window.removeEventListener('devicemotion', this.motionHandler);
      this.motionHandler = null;
    }
  }
}
