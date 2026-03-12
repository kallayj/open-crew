<script lang="ts">
  declare const __BUILD_TIME__: string;
  import { onMount } from 'svelte';
  import { MotionSensor } from '$lib/sensors/motion.svelte';
  import { GpsSensor } from '$lib/sensors/gps.svelte';
  import StrokeRate from '$lib/instruments/StrokeRate.svelte';
  import BoatSpeed from '$lib/instruments/BoatSpeed.svelte';
  import Stopwatch from '$lib/instruments/Stopwatch.svelte';
  import StartupScreen from '$lib/startup/StartupScreen.svelte';

  const motion = new MotionSensor();
  const gps = new GpsSensor();

  import { browser } from '$app/environment';

  let showStartup = $state(true);

  function onStartupContinue() {
    showStartup = false;
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

    return () => {
      motion.destroy();
      gps.destroy();
      wakeLock?.release();
      screen.orientation?.removeEventListener('change', updateBanner);
      document.removeEventListener('fullscreenchange', updateBanner);
      window.removeEventListener('resize', updateBanner);
    };
  });
</script>

<svelte:head>
  <title>open-crew</title>
  <meta name="theme-color" content="#0a0a0a" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</svelte:head>

<div class="panel-grid">
  <div class="panel">
    <StrokeRate spm={motion.spm} permissionState={motion.permissionState} />
  </div>
  <div class="panel">
    <BoatSpeed pace={gps.pace} permissionState={gps.permissionState} accuracy={gps.accuracy} isGpsFix={gps.isGpsFix} />
  </div>
  <div class="panel">
    <Stopwatch hasMotion={motion.hasMotion} />
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

  /* Landscape: three columns */
  @media (orientation: landscape) {
    .panel-grid {
      grid-template-columns: 1fr 1fr 1fr;
      grid-template-rows: 1fr;
    }
  }

  /* Portrait: three rows */
  @media (orientation: portrait) {
    .panel-grid {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr 1fr 1fr;
    }
  }

  .panel {
    border: 1px solid var(--border);
    display: flex;
    align-items: stretch;
  }

  .panel:not(:first-child) {
    border-left: none;
  }

  @media (orientation: portrait) {
    .panel:not(:first-child) {
      border-left: 1px solid var(--border);
      border-top: none;
    }
  }

  /* Fullscreen banner */
  .fs-banner {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.85);
    border-top: 1px solid #333;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.6rem 1rem;
    gap: 1rem;
    z-index: 100;
    font-size: 0.8rem;
    color: #aaa;
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
    color: #666;
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
    color: #333;
    pointer-events: none;
    z-index: 10;
    letter-spacing: 0.03em;
  }

  .build-badge.dev {
    color: #555;
    font-weight: bold;
  }
</style>
