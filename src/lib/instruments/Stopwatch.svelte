<script lang="ts">
  import { formatStopwatch } from '$lib/utils/format';
  import type { PieceTimer } from '$lib/sensors/pieceTimer.svelte';

  let { pieceTimer }: { pieceTimer: PieceTimer } = $props();

  // Media Session integration
  $effect(() => {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      if (pieceTimer.watchState === 'paused') pieceTimer.toggleRunning();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if (pieceTimer.watchState === 'running') pieceTimer.pause();
    });
    navigator.mediaSession.setActionHandler('stop', () => pieceTimer.reset());
    navigator.mediaSession.setActionHandler('previoustrack', () => pieceTimer.reset());

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
    };
  });

  $effect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState =
      pieceTimer.watchState === 'paused' ? 'paused' : 'playing';
    navigator.mediaSession.setPositionState({
      duration: Infinity,
      playbackRate: 1,
      position: pieceTimer.elapsed / 1000,
    });
  });

  const displayTime = $derived(
    pieceTimer.watchState === 'ready'
      ? 'READY'
      : pieceTimer.elapsed === 0
        ? '--:--.--'
        : formatStopwatch(pieceTimer.elapsed),
  );
  const btnLabel = $derived(
    pieceTimer.watchState === 'running'
      ? 'Pause'
      : pieceTimer.watchState === 'ready'
        ? 'Cancel'
        : pieceTimer.elapsed === 0
          ? 'Start'
          : 'Resume',
  );
  const showReset = $derived(
    pieceTimer.watchState === 'paused' && pieceTimer.elapsed > 0,
  );
</script>

<div class="instrument">
  <div class="label">STOPWATCH</div>

  <div
    class="value"
    class:active={pieceTimer.watchState === 'running'}
    class:ready={pieceTimer.watchState === 'ready' || pieceTimer.elapsed === 0}
  >
    {displayTime}
  </div>

  <div class="controls">
    <button
      class="btn"
      class:primary={pieceTimer.watchState !== 'running'}
      onclick={() => pieceTimer.toggleRunning()}
    >{btnLabel}</button>
    {#if showReset}
      <button class="btn danger" onclick={() => pieceTimer.reset()}>Reset</button>
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
    font-size: var(--instrument-value-size, clamp(2rem, 9vw, 5.5rem));
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
