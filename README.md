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
4. The dominant horizontal axis is identified from a slow EMA of each component's absolute value (τ = 2 s). The current sign of that axis is applied to the horizontal magnitude, giving a **signed surge signal** where the catch deceleration is a negative peak.
5. A 3-second disambiguation window at startup checks if |max| > |min|. If so, the signal sign is flipped — resolving the 180° forward/backward ambiguity without knowing how the phone is mounted.
6. The signed signal is smoothed (τ = 80 ms). Strokes are detected as **negative catch peaks** using a dynamic threshold (deepest of the 5 most recent troughs × 0.6, floor −0.3 m/s²). Hermsen validates the catch as the most temporally consistent feature of the stroke cycle.
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
| `DISAMBIG_WINDOW_MS` | 3000 ms | Signal collection window for forward/back orientation check. |
| `THRESHOLD_FLOOR` | −0.3 m/s² | Minimum dynamic threshold depth (prevents noise triggers at rest). |
| `THRESHOLD_MULTIPLIER` | 0.6 | Dynamic threshold = deepest recent trough × this value. |
| `THRESHOLD_BUFFER_SIZE` | 5 | Number of recent troughs used to set the dynamic threshold. |
| `MIN_STROKE_INTERVAL_MS` | 800 ms | Minimum time between counted strokes (~75 SPM cap). |
| `NOISE_THRESHOLD` | 1.5 m/s² | Linear acceleration threshold for "motion detected". |
| `MOTION_TIMEOUT_MS` | 500 ms | Time below threshold before `hasMotion` clears. |
| `REST_TIMEOUT_MS` | 6000 ms | SPM cleared after this long with no detected stroke. |
| `BUFFER_SIZE` | 4 | Intervals averaged for SPM output. |

**`hasMotion` flag:** set true immediately when linear acceleration magnitude exceeds `NOISE_THRESHOLD`, cleared after `MOTION_TIMEOUT_MS` of sustained stillness. Arms the stopwatch auto-start.

### Boat Speed / Pace
Uses the `Geolocation` API (`watchPosition` with high accuracy) and displays speed as a split time in min:sec per 500 m — the standard rowing pace unit.

**Algorithm:** distance-based rolling average. Each GPS fix is stored with its position and timestamp. The sensor maintains a buffer spanning the last `distanceWindowM` metres of travel (default 50 m). Speed = total distance in buffer / elapsed time. The buffer fills naturally from startup, so a reading appears after the first two fixes.

50 m ≈ 5 strokes at 10 m/stroke. Set `distanceWindowM` lower for a more responsive but noisier reading; higher for a smoother reading that lags more on speed changes.

Haversine formula is used for segment distances between consecutive fixes, giving accuracy to within ~1 m at the scales involved.

### Stopwatch
Tap **Start** to arm the stopwatch. It starts automatically when `hasMotion` is true (i.e. the first rowing stroke after arming). Tap **Pause** to pause; tap **Resume** to re-arm and wait for motion again. Long-press the time display (≥ 650 ms) to reset.

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
