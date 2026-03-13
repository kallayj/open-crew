<script lang="ts">
  import { untrack } from 'svelte';
  import { formatStopwatch } from '$lib/utils/format';

  let { hasMotion }: { hasMotion: boolean } = $props();

  let watchState = $state<'ready' | 'running' | 'paused'>('paused');
  let elapsed = $state(0);
  let startTime: number | null = null;
  let pausedAt: number | null = null;
  let rafId: number | null = null;

  // Auto-start when motion is newly detected (only when already armed)
  $effect(() => {
    if (hasMotion) {
      untrack(() => {
        if (watchState === 'ready') startWatch();
      });
    }
  });

  // Media Session integration
  $effect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      if (watchState === 'paused') watchState = 'ready';
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (watchState === 'running') pauseWatch();
    });
    navigator.mediaSession.setActionHandler('stop', () => resetWatch());
    navigator.mediaSession.setActionHandler('previoustrack', () => resetWatch());

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
    };
  });

  $effect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = watchState === 'running' ? 'playing' : 'paused';
    navigator.mediaSession.setPositionState({
      duration: Infinity,
      playbackRate: 1,
      position: elapsed / 1000,
    });
  });

  function tick(): void {
    if (startTime !== null) {
      elapsed = performance.now() - startTime;
    }
    rafId = requestAnimationFrame(tick);
  }

  function startWatch(): void {
    if (watchState === 'paused' && pausedAt !== null) {
      startTime = performance.now() - pausedAt;
    } else {
      startTime = performance.now();
      elapsed = 0;
    }
    pausedAt = null;
    watchState = 'running';
    rafId = requestAnimationFrame(tick);
  }

  function pauseWatch(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    pausedAt = elapsed;
    watchState = 'paused';
  }

  function resetWatch(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    elapsed = 0;
    startTime = null;
    pausedAt = null;
    watchState = 'paused';
  }

  function toggleRunning(): void {
    if (watchState === 'running') pauseWatch();
    else if (watchState === 'paused') watchState = 'ready';
    else if (watchState === 'ready') watchState = 'paused';
  }

  const displayTime = $derived(watchState === 'ready' ? 'READY' : elapsed === 0 ? '--:--.--' : formatStopwatch(elapsed));
  const btnLabel = $derived(watchState === 'running' ? 'Pause' : watchState === 'ready' ? 'Cancel' : elapsed === 0 ? 'Start' : 'Resume');
  const showReset = $derived(watchState === 'paused' && elapsed > 0);
</script>

<div class="instrument">
  <div class="label">STOPWATCH</div>

  <div
    class="value"
    class:active={watchState === 'running'}
    class:ready={watchState === 'ready' || elapsed === 0}
  >
    {displayTime}
  </div>

  <div class="controls">
    <button
      class="btn"
      class:primary={watchState !== 'running'}
      onclick={toggleRunning}
    >{btnLabel}</button>
    {#if showReset}
      <button class="btn danger" onclick={resetWatch}>Reset</button>
    {/if}
  </div>
</div>

<style>
  .instrument {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.5rem;
  }

  .label {
    font-size: clamp(0.6rem, 1.5vw, 0.85rem);
    letter-spacing: 0.15em;
    color: var(--text-muted);
    text-transform: uppercase;
  }

  .value {
    font-size: clamp(2rem, 9vw, 5.5rem);
    font-weight: 700;
    line-height: 1;
    color: var(--text-muted);
    transition: color 0.3s;
    user-select: none;
  }

  .value.active {
    color: var(--accent);
  }

  .value.ready {
    font-size: clamp(1.2rem, 5vw, 3rem);
    letter-spacing: 0.1em;
    color: var(--text-muted);
  }

  .controls {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.5rem;
    min-height: 2.5rem;
    align-items: center;
  }

  .btn {
    background: var(--btn-bg);
    color: var(--text);
    border: 1px solid var(--btn-border);
    border-radius: 0.4rem;
    padding: 0.4rem 1.2rem;
    font-family: var(--font-mono);
    font-size: clamp(0.7rem, 1.8vw, 0.9rem);
    cursor: pointer;
    touch-action: manipulation;
  }

  .btn:active {
    background: var(--btn-hover-bg);
  }

  .btn.primary {
    border-color: var(--accent);
    color: var(--accent);
  }

  .btn.danger {
    border-color: #ff5252;
    color: #ff5252;
  }
</style>
