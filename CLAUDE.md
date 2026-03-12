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

## Gotchas
- Variable named `state` conflicts with the `$state` rune — use `watchState` etc.
- iOS 13+ requires a user gesture before calling `DeviceMotionEvent.requestPermission()`
- Fullscreen + DeviceMotion require HTTPS on mobile
- `e.acceleration` (gravity-subtracted) is null on many Android phones — always derive from `accelerationIncludingGravity` minus the gravity filter
- Use latin alphanumeric variable names (not Greek letters like φ, Δ, λ) even in math-heavy code

