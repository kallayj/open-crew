<script lang="ts">
  import { formatStopwatch } from '$lib/utils/format';

  let { hasMotion }: { hasMotion: boolean } = $props();

  let watchState: 'ready' | 'running' | 'paused' = $state('paused');
  let elapsed = $state(0);
  let startTime: number | null = null;
  let pausedAt: number | null = null;
  let rafId: number | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let holding = $state(false);
  const HOLD_MS = 650;

  // Auto-start when motion detected (only when armed)
  $effect(() => {
    if (hasMotion && watchState === 'ready') {
      startWatch();
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

  function holdStart(): void {
    if (watchState === 'ready') return;
    holding = true;
    holdTimer = setTimeout(() => {
      holding = false;
      resetWatch();
    }, HOLD_MS);
  }

  function holdEnd(): void {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    holding = false;
  }

  const displayTime = $derived(watchState === 'ready' ? 'READY' : elapsed === 0 ? '--:--.--' : formatStopwatch(elapsed));
  const btnLabel = $derived(watchState === 'running' ? 'Pause' : watchState === 'ready' ? 'Cancel' : elapsed === 0 ? 'Start' : 'Resume');
</script>

<div class="instrument">
  <div class="label">STOPWATCH</div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="value"
    class:active={watchState === 'running'}
    class:ready={watchState === 'ready' || elapsed === 0}
    class:holding
    onpointerdown={holdStart}
    onpointerup={holdEnd}
    onpointercancel={holdEnd}
    onpointerleave={holdEnd}
    oncontextmenu={(e) => e.preventDefault()}
  >
    {displayTime}
  </div>

  <div class="controls">
    <button
      class="btn"
      class:primary={watchState !== 'running'}
      onclick={toggleRunning}
    >{btnLabel}</button>
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
    cursor: default;
    user-select: none;
    touch-action: none;
    border-radius: 0.4rem;
    padding: 0.1em 0.2em;
  }

  .value.active {
    color: var(--accent);
  }

  .value.ready {
    font-size: clamp(1.2rem, 5vw, 3rem);
    letter-spacing: 0.1em;
    color: var(--text-muted);
  }

  .value.holding {
    animation: hold-fill 650ms linear forwards;
  }

  @keyframes hold-fill {
    from { background: transparent; }
    to   { background: #2a0a0a; color: #ff5252; }
  }

  .controls {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.5rem;
    min-height: 2.5rem;
    align-items: center;
  }

  .btn {
    background: #222;
    color: var(--text);
    border: 1px solid #444;
    border-radius: 0.4rem;
    padding: 0.4rem 1.2rem;
    font-family: var(--font-mono);
    font-size: clamp(0.7rem, 1.8vw, 0.9rem);
    cursor: pointer;
    touch-action: manipulation;
  }

  .btn:active {
    background: #333;
  }

  .btn.primary {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
