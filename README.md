# open-crew
Free and open source rowing instrument web app

Measuring stroke rate and boat speed for a rowing shell used to require specialized hardware, including a seat magnet, impeller, and a purpose-built electronic device (i.e. the Cox Box, made by Nielsen Kellerman) to receiving the instrument signals over wired connections and translate them into readings on its display. Today the hardware required for the same functionality is packed into every smartphone, and the signals are available to any web app running in a modern browser. This project implements those rate, speed, and stopwatch instruments in a static web app running entirely in the browser. For any rower with a smartphone, having these instruments is now only a matter of mounting the phone and protecting it from the elements, not purchasing specialized electronics or paying for an app.

## Instruments

### Stroke Rate (SPM)
Reads the phone's accelerometer via the `DeviceMotion` API and counts strokes per minute.

**Algorithm** (based on Hermsen 2013, §4.3.2 and §4.4.2):

1. A very slow time-constant filter (τ = 3 s) tracks the gravity vector as the phone's orientation drifts. Seeded from the first sample — no calibration period needed.
2. Linear acceleration = `accelerationIncludingGravity` − gravity. Works on all devices including Android phones that do not expose `DeviceMotionEvent.acceleration`.
3. The vertical component is removed, leaving the *horizontal (surge) vector* — the fore-aft acceleration of the hull, perpendicular to gravity. Assumes the phone is fixed to the boat.
4. The dominant horizontal axis is identified from a slow EMA of each component's absolute value (τ = 2 s). The current sign of that axis is applied to the horizontal magnitude, giving a **signed surge signal**.
5. The signed signal is smoothed (τ = 80 ms). Strokes are detected as threshold crossings using a dynamic threshold (deepest of the 5 most recent troughs × 0.6, floor −0.3 m/s²).

> **Divergence from Hermsen §4.3:** Hermsen adds a disambiguation window to pin the signal sign (catch = negative peak) for inter-node timestamp consistency. This app does not need that: SPM is a period measurement, so the sign does not affect it. The forward direction (bow vs. stern) is needed for the boat-device heading offset, but cannot be determined from the accelerometer alone — backing strokes produce the same signal as forward strokes with an inverted sign. Instead, the forward direction is derived from the GPS track at the first above-threshold speed after startup or a gyro-detected repositioning. The disambiguation window and `signFlip` state are therefore removed entirely.
7. Peak time is estimated as the midpoint of the threshold down-crossing and up-crossing, which is more stable than the raw signal minimum.
8. SPM = 60000 / rolling mean of the last 4 inter-stroke intervals. Cleared after 6 s with no stroke.

**Tunable constants** (`src/lib/sensors/motion.svelte.ts`):

All time-sensitive parameters use time constants, so behaviour is consistent regardless of whether `DeviceMotion` fires at 10 Hz or 60 Hz (which varies by device and browser).

| Constant | Default | Effect |
|---|---|---|
| `GRAVITY_TAU_S` | 3 s | Gravity filter time constant. |
| `STROKE_TAU_S` | 0.08 s | Surge signal smoothing. Larger = smoother but laggier. |
| `AXIS_TAU_S` | 2 s | Dominant axis tracking. Larger = more stable but slower to adapt. |
| `SETTLE_TIME_MS` | 1500 ms | Wait before stroke detection (gravity filter settling). |
| `THRESHOLD_FLOOR` | −0.3 m/s² | Minimum dynamic threshold depth (prevents noise triggers at rest). |
| `THRESHOLD_MULTIPLIER` | 0.6 | Dynamic threshold = deepest recent trough × this value. |
| `THRESHOLD_BUFFER_SIZE` | 5 | Number of recent troughs used to set the dynamic threshold. |
| `MIN_STROKE_INTERVAL_MS` | 800 ms | Minimum time between counted strokes (~75 SPM cap). |
| `NOISE_THRESHOLD` | 1.5 m/s² | Linear acceleration threshold for "motion detected". |
| `MOTION_TIMEOUT_MS` | 500 ms | Time below threshold before `hasMotion` clears. |
| `REST_TIMEOUT_MS` | 6000 ms | SPM cleared after this long with no detected stroke. |
| `BUFFER_SIZE` | 4 | Intervals averaged for SPM output. |

**`hasMotion` flag:** set true immediately when linear acceleration magnitude exceeds `NOISE_THRESHOLD`, cleared after `MOTION_TIMEOUT_MS` of sustained stillness. Used by the stopwatch to record a candidate start time when motion is first detected.

### Boat Speed / Pace
Uses the `Geolocation` API (`watchPosition` with high accuracy) and displays speed as a split time in min:sec per 500 m — the standard rowing pace unit.

**Algorithm:** rolling average of speed samples over a `BUFFER_TIME_MS` (10 s) window. Each GPS fix reports speed directly via `GeolocationCoordinates.speed` (m/s). Samples are buffered and averaged; the result is converted to min:sec per 500 m for display. Fixes with accuracy worse than `MIN_ACCURACY_M` (20 m) or null speed are ignored.

### Stopwatch
Tap **Start** to arm the stopwatch. Auto-start uses a two-stage detection:

1. **Candidate start** — when `hasMotion` first goes true while armed, the current time is recorded as the candidate start time. This corresponds to the beginning of the first drive off the catch.
2. **Confirmation** — when the stroke detection algorithm completes its first threshold trough (up-crossing of the smoothed surge signal), rowing is confirmed and the stopwatch starts, backdated to the candidate start time. This separates stroke *confirmation* from SPM *measurement*: SPM requires two troughs for an interval; confirmation requires only one.

If no stroke trough is detected within one maximum stroke period (`STROKE_CONFIRM_TIMEOUT_MS = 60000 / MIN_ROWING_SPM`), the candidate start is discarded as a false positive. Low acceleration between strokes (e.g. the boat coasting after the release) does not trigger a false positive — only the absence of a confirmed stroke within the timeout does.

Tap **Pause** to pause; tap **Resume** to re-arm and wait for motion again. Tap **Reset** to return to the initial state.

**Stopwatch tunable constants** (`src/lib/instruments/Stopwatch.svelte`):

| Constant | Default | Effect |
|---|---|---|
| `MIN_ROWING_SPM` | 15 SPM | Slowest expected stroke rate. Sets the false-positive timeout to one full stroke period at this rate. |

## Deployment
The app is a fully static SvelteKit build. A GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages on manual trigger. The base path (`/repo-name`) is injected automatically from the repository name.

To deploy to a custom domain or a root path, set `BASE_PATH=` (empty) in the workflow environment and configure your hosting accordingly.

## Development

```sh
yarn dev      # local dev server
yarn check    # svelte-check type checking (run before committing)
yarn build    # production build
```

Requires HTTPS on mobile for `DeviceMotion` and Fullscreen APIs. Use `npx local-ssl-proxy` or similar to test on a physical device against the local dev server.
