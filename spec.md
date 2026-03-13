# Rowing Shell PWA — Design Specification

## Overview

A free, open-source progressive web app displaying real-time rowing metrics on a mobile device fixed in a rowing shell. The device may be mounted at an arbitrary location and orientation, and may be repositioned during a session.

---

## Display

Primary display, landscape orientation, full screen. Metrics:

* Stroke rate
* Interval time
* Speed
* Heading
* Vectors to obstacles and waypoints
* Roll variance
* Absolute roll angle (optional, see below)

---

## Architecture

### Type
Single-page application with a minimal PWA layer: home screen manifest for full-screen launch and offline load after first visit. Service worker limited to app shell caching; added once the app is stable.

### Dev workflow
- Desktop browser for layout and non-sensor logic
- Phone on localhost for sensor development
- Deployed build (GitHub Pages or equivalent) for iOS and PWA validation
- Mock data mode for desktop sensor simulation

### Storage
- IndexedDB for session logging
- Asynchronous write queue to avoid blocking the sensor loop
- Export via File System Access API or Blob URL download (CSV or JSON)

### External control
Media Session API integration for start/reset via Bluetooth or headphone remotes to avoid interaction with a damp touchscreen. Optional, as users may prefer to listen to music or to not have intervals paused by incoming phone calls.

---

## Sensors

### Required
| Sensor | API | Use |
|---|---|---|
| Accelerometer | `DeviceMotion` | Stroke rate, forward axis detection, roll angle |
| GPS | `Geolocation` | Position, speed, track heading |

### Optional / conditional
| Sensor | API | Use |
|---|---|---|
| Magnetometer | `DeviceOrientationAbsolute` | Heading while stationary |
| Gyroscope | `DeviceMotion` | Repositioning detection |

---

## Sensor Logic

### Forward axis and stroke rate

The device's forward axis is the horizontal axis of greatest periodic acceleration, detected automatically from the accelerometer during rowing. Stroke rate is derived from the same signal; the two cannot be separated.

The forward *direction* (bow vs. stern) cannot be determined from the accelerometer alone without ambiguity — backing strokes produce the same signal as forward strokes with an inverted sign. It is instead derived from the GPS track at speed (see Heading below).

#### Algorithm

All time-sensitive parameters use time constants (not per-sample alphas) — rate-independent across 10–60 Hz devices. Based on Hermsen (2013) §4.3.2 + §4.4.2; see README for divergences.

1. Gravity vector seeded from first sample, updated with time-constant filter (GRAVITY_TAU_S = 3 s).
2. Linear accel = `accelerationIncludingGravity` − gravity. Works on Android (no `e.acceleration`).
3. Vertical component subtracted → horizontal (surge) vector (3D, perpendicular to gravity).
4. Dominant horizontal axis tracked via slow EMA of |component| (AXIS_TAU_S = 2 s). Current value of dominant axis signs the horizontal magnitude → **signed** surge signal.
5. Signed signal smoothed (STROKE_TAU_S = 0.08 s). Stroke detection (Hermsen §4.4.2):
   - Dynamic threshold = deepest of 5 recent troughs × 0.6, floor −0.3 m/s²
   - Peak time = midpoint of threshold down-crossing and up-crossing (more stable than raw minimum)
6. SPM = 60000 / rolling mean of last BUFFER_SIZE inter-peak intervals.
7. SPM cleared after 6000 ms with no stroke (Hermsen §4.5).
8. `hasMotion` = linear magnitude > 1.5 m/s², cleared after 500 ms of stillness.

### GPS speed and pace

#### Algorithm

- Rolling average of `GeolocationCoordinates.speed` (m/s) samples over a BUFFER_TIME_MS window.
- Fixes with accuracy > `MIN_ACCURACY_M` (20 m) or null speed are ignored.
- Average speed converted to min:sec per 500 m (pace) for display.

### Heading

- **Underway:** GPS track heading, once speed exceeds threshold (~0.5–1 m/s). Available immediately; unambiguous about which end is the bow.
- **At rest:** IMU absolute orientation (`DeviceOrientationAbsolute`) corrected by the boat-device heading offset. Only available after the offset has been established (see Calibration). Falls back to GPS track if offset is not yet established.
- **Sanity check:** Large divergence between IMU heading and GPS track at speed indicates sensor error (GPS multipath, magnetometer interference); flag but do not use as switch condition.

The order of availability is intentional: GPS track heading comes first, IMU heading at rest is a derived capability that requires a prior forward rowing stint at speed.

### Repositioning detection

Angular velocity from the gyroscope significantly above ~12°/s (the maximum boat turn rate for a shell taking at least 30 seconds to spin 360°) indicates device repositioning rather than boat turning. On detection, invalidate the boat-device heading offset; it will be re-derived on the next above-threshold forward rowing stint.

This feature requires `DeviceOrientationAbsolute` only insofar as heading-at-rest requires it. If absolute orientation is unavailable, repositioning detection is relevant only for roll.

### Roll variance

Optionally displayed during rowing as a feel/feedback metric, more meaningful as post-session analysis of logged data rather than a primary live display. No zero reference needed.

### Roll offset (list angle) 
Absolute angle from level, useful for resolving disagreement about the direction and magnitude of chronic list. Requires parallel-edge mounting constraint to provide a gravity-referenced zero. 

---

## Waypoints and Obstacles

UI treatment of waypoints and obstacles is similar but they have opposite intents: boats navigate to waypoints but want to avoid obstacles.

### Goals
Not to produce a full-featured navigation app, but to facilitate collision avoidance, keeping boats together during practices, and emergency navigation in low-visibility conditions (fog).

### Common Features
Vectors to waypoints and obstacles will be shown on a HUD-like compass window, indicated as symbols on their compass bearings with distances below. For obstacles (see below), bearings are for the point-locations, not computed nearest point of possible collision. Waypoints and obstacles should be differentiated by color and font style. 

### Waypoints
Example use cases:

* In front of the boathouse, for getting home in emergency low-visibility conditions (fog)
* Turn-around points before an obstacle
* Meet-up point for practice/racing

Represented as point-locations, not boundaries.

### Obstacles

#### Points with Watch Circles

Things you don't want to hit. Represented as a symbol, a point, and a non-negative watch circle radius. The watch circle allows for obstacle movement (due to wind, current, and tide) or for it to occupy a circular area. Use a watch circle radius of 0 for fixed point-objects like pilings.

#### Directional marks

In marine navigation cardinal marks indicate a local boundary between safe and unsafe water, with the mark indicating on which side of it (north, south, east, or west) the safe water lies. These virtual marks give more control by allowing for the safe water to lie in any direction, not just cardinal ones. Represented as a symbol, a point, a direction, an obstruction length, and a watch circle radius. The direction and obstruction length create a "no go" semi-circle centered at the mark whose axis is perpendicular to the safe water direction. The watch circle is a convenience for areas marked by physical, moving buoys you don't want to hit, to eliminate the need for a separate point obstacle. The marked obstruction does not move with mark.

#### Possible Collision Warning

Imminent (configurable time, default 10s) collision is signalled with a flashing WAY ENOUGH! message. Collision is computed by the intersection of the GPS position circle and the area(s) represented by the obstacle (remember that a directional mark is actually two obstacles, the marked obstacle and the mark itself).

##### Possible Per-session Parameter: Bow Offset

Collision with fixed obstacles occurs at the bow, not the stern, and in an eight, the distance from the coxswain to the bow is substantial (~15m). If the configured collision warning time produces too many false positives but decreasing it leads to false negatives, a bow offset may need to be introduced.

### Provisioning

To simplify the UI, these will be defined at build time -- different versions can be distributed per club/waterway.

---

## Permissions and Sensor Availability

### Permission models

- **Geolocation:** explicit user prompt, all platforms.
- **DeviceMotion / DeviceOrientationAbsolute:** no prompt on Android; iOS 13+ requires `requestPermission()` gated on a user gesture, granted per origin.
- **DeviceOrientationAbsolute unavailable vs. denied:** functionally equivalent for degradation purposes; distinguish only to show actionable UI for permission recovery.
- iOS permission state is not queryable before requesting.

### Geolocation fix quality

The Geolocation API may return fixes from sources other than GNSS. Fix source is inferred from the presence or absence of altitude in the fix: real GNSS fixes include altitude. Empirically, the absence of altitude is determined to be a better indicator IP- and WiFi-based fixes than accuracy.

| Fix type | Detection | Consequence |
|---|---|---|
| GNSS, accuracy ≤ 20 m | altitude present, accuracy ≤ `MIN_ACCURACY_M` | Speed fully enabled |
| GNSS, accuracy > 20 m | altitude present, accuracy > `MIN_ACCURACY_M` | Speed disabled until accuracy improves; user warned |
| Network (IP/WiFi) | altitude absent | Speed disabled; user warned that a real GPS fix may not arrive |

Speed is re-enabled reactively as accuracy improves below `MIN_ACCURACY_M` (20 m default) during a session. Accuracy is displayed on the boat speed instrument and fades once a split is active.

### Degradation matrix

| Geolocation | Motion | Consequence |
|---|---|---|
| granted, good fix | granted | Full functionality |
| granted, good fix | denied/unavailable | Speed and position only; no stroke rate, no heading |
| granted, poor or network fix | granted | Stroke rate, heading, and roll; speed disabled until fix improves |
| denied/unavailable | granted | Stroke rate, heading, and roll; no speed, position, or track |
| denied/unavailable | denied/unavailable | Nonfunctional |
| granted | granted, no magnetometer | Full except heading at rest is unavailable; GPS track only |

### Startup flow

Request permissions explicitly with UI context before attempting sensor access. After grant, wait up to 3 s for the first geolocation fix and evaluate its quality. Auto-continue if all sensors are fully available; otherwise present a results screen with per-sensor status and a labelled warning for each degraded condition before the user continues. No silent failures or unexplained zeros.

Also display media session control option.

---

## Calibration

| Signal | Method |
|---|---|
| Forward axis (dominant horizontal axis) | Automatic from stroke detection; self-healing via dominant axis EMA |
| Forward direction (bow vs. stern sign) | Derived from GPS track at first above-threshold speed after app start or gyro-detected repositioning; stored until next repositioning event |
| Boat-device heading offset | Derived from forward direction + IMU absolute orientation at the moment forward direction is established; stored until next repositioning event |
| Roll variance | No calibration required |
| Roll offset (list) | Gravity-referenced zero when device edge is parallel to gunwales; no explicit zeroing required; zero resetting as an advanced optional feature |

## Miscellaneous

* If ambient light detection is available, select dark/light theme as appropriate for conditions. If no detection is available, provide a dark/light theme toggle.

## Open Questions

### Stroke rate algorithm

From the Open Source Stroke Coach (Arduino implementation):

- **IIR low-pass filter per axis** before detection — potentially cleaner than the current EMA approach.
- **3-stroke rolling average on SPM output** for display stability — currently using 4-interval rolling mean of inter-peak intervals; a separate output smoother may reduce display jitter.
- **1000 ms refractory period** as a simple and effective debounce — limits max detectable rate to 60 SPM; trade-off against catching high-rate errors.

---

## Roadmap

1. MVP (Cox Box feature parity): Stroke rate, Interval time, Speed
2. Heading
3. Obstacles and waypoints
4. Roll variance with session memory
5. Absolute roll angle (optional, see below)
