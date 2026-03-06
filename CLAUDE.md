# open-crew

  SvelteKit 5 (runes) rowing instrument app. Static, mobile-first, landscape-primary.

  ## Stack
  - SvelteKit 5 with Svelte runes (`$state`, `$derived`, `$effect`, `$props`)
  - TypeScript, no external dependencies
  - `adapter-static`

  ## Key files
  - `src/lib/sensors/motion.svelte.ts` — DeviceMotion → stroke rate
  - `src/lib/sensors/gps.svelte.ts` — Geolocation → boat speed/pace
  - `src/lib/instruments/` — StrokeRate, BoatSpeed, Stopwatch components
  - `src/lib/utils/format.ts` — formatSpm, formatPace, formatStopwatch
  - `src/routes/+page.svelte` — panel grid, wake lock, fullscreen banner

  ## Dev
  - `npm run dev` — local dev server
  - `npm run check` — svelte-check (run before committing)

  ## Gotchas
  - Variable named `state` conflicts with the `$state` rune — use `watchState` etc.
  - iOS 13+ requires a user gesture before calling `DeviceMotionEvent.requestPermission()`
  - Fullscreen + DeviceMotion require HTTPS on mobile