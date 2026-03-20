<script lang="ts">
  import { untrack, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { MotionSensor } from '$lib/sensors/motion.svelte';
  import { GpsSensor } from '$lib/sensors/gps.svelte';
  import { HeadingSensor } from '$lib/sensors/heading.svelte';
  import { PieceTimer } from '$lib/sensors/pieceTimer.svelte';
  import StrokeRate from '$lib/instruments/StrokeRate.svelte';
  import BoatSpeed from '$lib/instruments/BoatSpeed.svelte';
  import Stopwatch from '$lib/instruments/Stopwatch.svelte';
  import Heading from '$lib/instruments/Heading.svelte';
  import Distance from '$lib/instruments/Distance.svelte';
  import StartupScreen from '$lib/startup/StartupScreen.svelte';

  const motion = new MotionSensor();
  const gps = new GpsSensor();
  const heading = new HeadingSensor();
  const pieceTimer = new PieceTimer();

  // Feed GPS speed + heading into the heading sensor for calibration and IMU fallback.
  $effect(() => {
    heading.update(gps.speedMs, gps.trackHeading);
  });

  // Feed motion sensor events into the shared piece timer lifecycle.
  $effect(() => {
    if (motion.hasMotion) {
      untrack(() => pieceTimer.onMotionDetected(gps.speedMs));
    }
  });
  $effect(() => {
    if (motion.lastStrokeTime !== null) {
      untrack(() => pieceTimer.onStrokeConfirmed());
    }
  });

  let showStartup = $state(true);

  function startSilentAudio() {
    const ctx = new AudioContext();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(ctx.destination);
    src.start();
  }

  function onStartupContinue(mediaSession: boolean) {
    showStartup = false;
    if (mediaSession) startSilentAudio();
    checkBanner();
  }

  // Screen Wake Lock
  let wakeLock: WakeLockSentinel | null = null;

  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      // Non-fatal; continue without it
    }
  }

  // Fullscreen banner (shown post-startup if user leaves fullscreen)
  let showBanner = $state(false);
  let bannerDismissed = $state(false);

  function checkBanner() {
    if (bannerDismissed || showStartup) return;
    const isLandscape = window.matchMedia('(orientation: landscape)').matches;
    const isFullscreen = !!document.fullscreenElement;
    showBanner = isLandscape && !isFullscreen;
  }

  async function requestFullscreen() {
    try {
      await document.documentElement.requestFullscreen();
      showBanner = false;
    } catch {
      // Browser declined; keep banner visible
    }
  }

  function dismissBanner() {
    bannerDismissed = true;
    showBanner = false;
    localStorage.setItem('fsbannerDismissed', '1');
  }

  onMount(() => {
    bannerDismissed = !!localStorage.getItem('fsbannerDismissed');

    acquireWakeLock();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') acquireWakeLock();
    });

    const updateBanner = () => checkBanner();
    screen.orientation?.addEventListener('change', updateBanner);
    document.addEventListener('fullscreenchange', updateBanner);
    window.addEventListener('resize', updateBanner);

    heading.start();

    return () => {
      motion.destroy();
      gps.destroy();
      heading.destroy();
      wakeLock?.release();
      screen.orientation?.removeEventListener('change', updateBanner);
      document.removeEventListener('fullscreenchange', updateBanner);
      window.removeEventListener('resize', updateBanner);
    };
  });
</script>

<svelte:head>
  <title>open-crew</title>
  <meta name="theme-color" content="#f5f5f5" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</svelte:head>

<div class="panel-grid">
  <div class="panel panel-hud">
    <Heading heading={heading.heading} source={heading.source} boatDeviceOffset={heading.boatDeviceOffset} />
  </div>
  <div class="panel">
    <StrokeRate spm={motion.spm} permissionState={motion.permissionState} />
  </div>
  <div class="panel">
    <BoatSpeed pace={gps.pace} permissionState={gps.permissionState} accuracy={gps.accuracy} isGpsFix={gps.isGpsFix} />
  </div>
  <div class="panel">
    <Stopwatch {pieceTimer} />
  </div>
  <div class="panel">
    <Distance {pieceTimer} {gps} />
  </div>
</div>

<div class="build-badge" class:dev={__BUILD_TIME__.endsWith('-dev')}>
  {__BUILD_TIME__}
</div>

{#if showStartup}
  <StartupScreen {motion} {gps} oncontinue={onStartupContinue} />
{/if}

{#if showBanner}
  <div class="fs-banner" role="banner">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <span class="fs-banner-text" onclick={requestFullscreen}>
      Tap for fullscreen
    </span>
    <button class="fs-dismiss" onclick={dismissBanner} aria-label="Dismiss">&#x2715;</button>
  </div>
{/if}

<style>
  .panel-grid {
    display: grid;
    width: 100vw;
    height: 100dvh;
    background: var(--bg);
  }

  /* Landscape: HUD row above, four instrument columns below */
  @media (orientation: landscape) {
    .panel-grid {
      grid-template-columns: 1fr 1fr 1fr 1fr;
      grid-template-rows: 1fr 3fr;
    }
    .panel-hud {
      grid-column: 1 / -1;
    }
    /* Instrument panels share top border with HUD bottom */
    .panel:not(.panel-hud) {
      border-top: none;
    }
    /* Instrument panels 2–4 share left border with previous panel's right */
    .panel:not(.panel-hud):not(:nth-child(2)) {
      border-left: none;
    }
  }

  /* Portrait: HUD row then four instrument rows */
  @media (orientation: portrait) {
    .panel-grid {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr 2fr 2fr 2fr 2fr;
    }
    .panel:not(:first-child) {
      border-top: none;
    }
  }

  .panel {
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Fullscreen banner */
  .fs-banner {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--overlay-bg);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.6rem 1rem;
    gap: 1rem;
    z-index: 100;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .fs-banner-text {
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .fs-banner-text:hover {
    color: var(--text);
  }

  .fs-dismiss {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0.2rem 0.4rem;
  }

  .fs-dismiss:hover {
    color: var(--text);
  }

  .build-badge {
    position: fixed;
    bottom: 4px;
    right: 6px;
    font-size: 0.6rem;
    color: var(--border);
    pointer-events: none;
    z-index: 10;
    letter-spacing: 0.03em;
  }

  .build-badge.dev {
    color: var(--text-muted);
    font-weight: bold;
  }
</style>
