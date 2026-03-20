<script lang="ts">
  import { untrack, onMount } from 'svelte';
  import { MotionSensor } from '$lib/sensors/motion.svelte';
  import { GpsSensor } from '$lib/sensors/gps.svelte';
  import { HeadingSensor } from '$lib/sensors/heading.svelte';
  import { PieceTimer } from '$lib/sensors/pieceTimer.svelte';
  import { PieceAccumulators } from '$lib/sensors/pieceAccumulators.svelte';
  import StrokeRate from '$lib/instruments/StrokeRate.svelte';
  import BoatSpeed from '$lib/instruments/BoatSpeed.svelte';
  import Stopwatch from '$lib/instruments/Stopwatch.svelte';
  import Distance from '$lib/instruments/Distance.svelte';
  import StrokeCount from '$lib/instruments/StrokeCount.svelte';
  import Heading from '$lib/instruments/Heading.svelte';
  import StartupScreen from '$lib/startup/StartupScreen.svelte';

  const motion = new MotionSensor();
  const gps = new GpsSensor();
  const heading = new HeadingSensor();
  const pieceTimer = new PieceTimer();
  const piece = new PieceAccumulators(pieceTimer, gps);

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
      untrack(() => {
        pieceTimer.onStrokeConfirmed();
        piece.onStrokeConfirmed();
      });
    }
  });

  let showStartup = $state(true);

  let audioEl = $state<HTMLAudioElement | null>(null);
  let showAudio = $state(false);
  let audioStream = $state<MediaStream | null>(null);

  function startAudio() {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(dest);
    src.start();
    audioStream = dest.stream;
    showAudio = true;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Row' });
    }
  }

  $effect(() => {
    if (audioEl && audioStream) audioEl.srcObject = audioStream;
  });

  $effect(() => {
    if (!audioEl || pieceTimer.watchState === 'paused') {
      audioEl?.pause();
      return;
    }
    audioEl.play();
  });

  function onStartupContinue(mediaSession: boolean) {
    showStartup = false;
    if (mediaSession) startAudio();
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

<!--
  Landscape: heading HUD row spanning all 3 columns, then
             StrokeRate | accum-group (Stopwatch/Distance/StrokeCount) | BoatSpeed
  Portrait:  heading row, then StrokeRate, Stopwatch, Distance, StrokeCount, BoatSpeed
             (accum-group uses display:contents so its children join the grid directly)
-->
<div class="panel-grid">
  <div class="panel panel-hud">
    <Heading heading={heading.heading} source={heading.source} boatDeviceOffset={heading.boatDeviceOffset} />
  </div>

  <div class="panel p-stroke-rate">
    <StrokeRate spm={motion.spm} permissionState={motion.permissionState} />
  </div>

  <div class="accum-group">
    <div class="panel p-stopwatch">
      <Stopwatch {pieceTimer} />
    </div>
    <div class="panel p-distance">
      <Distance {pieceTimer} distanceM={piece.distanceM} />
    </div>
    <div class="panel p-stroke-count">
      <StrokeCount {pieceTimer} strokeCount={piece.strokeCount} />
    </div>
  </div>

  <div class="panel p-boat-speed">
    <BoatSpeed pace={gps.pace} permissionState={gps.permissionState} accuracy={gps.accuracy} isGpsFix={gps.isGpsFix} />
  </div>
</div>

{#if showAudio}
  <audio
    bind:this={audioEl}
    controls
    style="position:fixed;bottom:0;left:0;width:100%;z-index:50"
  ></audio>
{/if}

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
    gap: 1px;
    background: var(--border);
  }

  /* Landscape: heading HUD spans full width above three instrument columns */
  @media (orientation: landscape) {
    .panel-grid {
      grid-template-columns: 1fr 1fr 1fr;
      grid-template-rows: 1fr 3fr;
    }

    .panel-hud {
      grid-column: 1 / -1;
    }

    .accum-group {
      display: flex;
      flex-direction: column;
      gap: 1px;
      background: var(--border);
      /* Reduce value font size to fit three instruments in the stacked cells */
      --instrument-value-size: clamp(1.4rem, 14dvh, 3.5rem);
    }
  }

  /* Portrait: heading row then five instrument rows */
  @media (orientation: portrait) {
    .panel-grid {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr 2fr 2fr 2fr 2fr 2fr;
    }

    /* Flatten the group so its children are direct grid items in rows 3–5 */
    .accum-group {
      display: contents;
    }
  }

  .panel {
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    /* flex:1 applies when .panel is a child of .accum-group in landscape */
    flex: 1;
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
