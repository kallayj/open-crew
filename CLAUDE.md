# open-crew

SvelteKit 5 (runes) rowing instrument app. Static, mobile-first, landscape-primary.

## Stack
- SvelteKit 5 with Svelte runes (`$state`, `$derived`, `$effect`, `$props`)
- TypeScript, no external dependencies
- `adapter-static`
- Package manager: **yarn**

## Key files
- `src/lib/sensors/motion.svelte.ts` — DeviceMotion → stroke rate
- `src/lib/sensors/gps.svelte.ts` — Geolocation → boat speed/pace
- `src/lib/instruments/` — StrokeRate, BoatSpeed, Stopwatch components
- `src/lib/utils/format.ts` — formatSpm, formatPace, formatStopwatch
- `src/routes/+page.svelte` — panel grid, wake lock, fullscreen banner

## Dev
- `yarn dev` — local dev server
- `yarn check` — svelte-check (run before committing)
- `yarn build` — production build

## Sensor algorithms

### Motion sensor — stroke rate
All time-sensitive parameters use time constants (not per-sample alphas) — rate-independent across 10–60 Hz devices.
Algorithm closely follows Hermsen (2013) §4.3.2 + §4.4.2.

1. Gravity vector seeded from first sample, updated with time-constant filter (GRAVITY_TAU_S=3s).
2. Linear accel = `accelerationIncludingGravity` − gravity. Works on Android (no `e.acceleration`).
3. Vertical component subtracted → horizontal (surge) vector (3D, perpendicular to gravity).
4. Dominant horizontal axis tracked via slow EMA of |component| (AXIS_TAU_S=2s). Current value of dominant axis signs the horizontal magnitude → **signed** surge signal.
5. Forward/backward disambiguation (Hermsen §4.3): after SETTLE+DISAMBIG_WINDOW (1.5+3s), if |max|>|min| flip sign so catch is always the negative peak.
6. Signed signal smoothed (STROKE_TAU_S=0.08s). Stroke detection targets **negative catch peaks** (Hermsen §4.4.2):
   - Dynamic threshold = deepest_of_5_recent_troughs × 0.6, floor −0.3 m/s²
   - Peak time = midpoint of threshold down-crossing and up-crossing (more stable than raw minimum)
7. SPM = 60000 / rolling mean of last BUFFER_SIZE=4 inter-peak intervals.
8. SPM cleared after REST_TIMEOUT_MS=6000ms with no stroke (Hermsen §4.5).
9. `hasMotion` = linMag > NOISE_THRESHOLD (1.5 m/s²), cleared after MOTION_TIMEOUT_MS=500ms of stillness.

### GPS sensor — boat speed/pace
- Distance-based rolling average over last `distanceWindowM` metres (default 50 m ≈ 5 strokes).
- Buffer of `{lat, lon, timestamp}` samples; segments stored as precomputed distances (O(1) update).
- Speed = totalDist / totalTime; formatted as min:sec per 500 m (pace).
- Haversine formula for segment distances.

## Gotchas
- Variable named `state` conflicts with the `$state` rune — use `watchState` etc.
- iOS 13+ requires a user gesture before calling `DeviceMotionEvent.requestPermission()`
- Fullscreen + DeviceMotion require HTTPS on mobile
- `e.acceleration` (gravity-subtracted) is null on many Android phones — always derive from `accelerationIncludingGravity` minus the gravity filter
- Use latin alphanumeric variable names (not Greek letters like φ, Δ, λ) even in math-heavy code
