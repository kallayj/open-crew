# open-crew
Free and open source rowing instrument web app

Measuring stroke rate and boat speed for a rowing shell used to require specialized hardware, including a seat magnet, impeller, and a purpose-built electronic device (i.e. the Cox Box, made by Nielsen Kellerman) to receiving the instrument signals over wired connections and translate them into readings on its display. Today the hardware required for the same functionality is packed into every smartphone, and the signals are available to any web app running in a modern browser. This project implements those rate, speed, and stopwatch instruments in a static web app running entirely in the browser. For any rower with a smartphone, having these instruments is now only a matter of mounting the phone and protecting it from the elements, not purchasing specialized electronics or paying for an app.

## Instruments

### Stroke Rate (SPM)
Reads the phone's accelerometer via the `DeviceMotion` API and counts strokes per minute.

**Algorithm:**
1. A very slow exponential low-pass filter (α = 0.02) tracks the gravity vector as the phone's orientation drifts. It is seeded from the first sample, so no calibration period is needed.
2. Linear (motion) acceleration is computed by subtracting the estimated gravity from `accelerationIncludingGravity`. This works on all devices, including Android phones that do not expose `DeviceMotionEvent.acceleration`.
3. The vertical component of linear acceleration (along the gravity vector) is removed, leaving the *horizontal (surge) component* — the fore-aft acceleration of the hull. The magnitude of this horizontal vector is used as the stroke signal. This is orientation-independent within the horizontal plane and assumes the phone is fixed to the boat, not worn on the rower's body.
4. The surge magnitude is smoothed (α = 0.2) and a peak detector counts each drive phase as one stroke. Peaks below 0.5 m/s² are rejected as noise; peaks closer together than 800 ms (~75 SPM) are ignored.
5. SPM is computed from the rolling mean of the last 4 inter-peak intervals.

**Tunable constants** (`src/lib/sensors/motion.svelte.ts`):

| Constant | Default | Effect |
|---|---|---|
| `GRAVITY_ALPHA` | 0.02 | Rate of gravity re-estimation. Lower = more stable but slower to adapt to orientation change. |
| `SMOOTHING_ALPHA` | 0.2 | Heave signal smoothing. Lower = smoother but laggier peak detection. |
| `MIN_PEAK_AMPLITUDE` | 0.5 m/s² | Below this the peak is ignored. Raise to suppress false strokes on flat water; lower if strokes are missed. |
| `MIN_STROKE_INTERVAL_MS` | 800 ms | Minimum time between counted strokes (~75 SPM cap). |
| `NOISE_THRESHOLD` | 1.5 m/s² | Linear acceleration threshold for "motion detected" (starts stopwatch). |
| `BUFFER_SIZE` | 4 | Number of intervals averaged for SPM. Higher = smoother but slower to update. |
| `SETTLE_SAMPLES` | 60 | Samples skipped at startup while gravity filter stabilises (~1 s at 60 Hz). |

**`hasMotion` flag:** set true when linear acceleration magnitude exceeds `NOISE_THRESHOLD`, and cleared only after 10 consecutive samples below it (debounced to avoid flickering between steps). This flag arms the stopwatch auto-start.

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
