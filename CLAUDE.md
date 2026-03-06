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
1. Gravity vector estimated with a very slow EMA (GRAVITY_ALPHA=0.02) seeded from the first sample.
2. Linear accel = `accelerationIncludingGravity` − gravity. Works on Android (no `e.acceleration`).
3. Vertical component (dot product with gravity unit) is subtracted from linear accel → horizontal (surge) vector.
4. horizMag = magnitude of surge vector — one peak per stroke drive phase, orientation-independent, phone fixed to boat.
5. Surge magnitude smoothed (SMOOTHING_ALPHA=0.2), peak-detected with amplitude gate (MIN_PEAK_AMPLITUDE=0.5 m/s²).
6. SPM = 60000 / rolling mean of last BUFFER_SIZE=4 inter-peak intervals.
7. `hasMotion` = linear accel magnitude > NOISE_THRESHOLD (1.5 m/s²), debounced over 10 samples.
8. Stroke detection skips first SETTLE_SAMPLES=60 samples (~1s) while gravity filter stabilises.

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
