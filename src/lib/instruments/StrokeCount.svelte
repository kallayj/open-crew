<script lang="ts">
  import type { PieceTimer } from '$lib/sensors/pieceTimer.svelte';

  let { pieceTimer, strokeCount }: {
    pieceTimer: PieceTimer;
    strokeCount: number;
  } = $props();

  const isActive = $derived(pieceTimer.watchState === 'running');
  const isDim = $derived(pieceTimer.watchState === 'paused' && pieceTimer.elapsed === 0);
</script>

<div class="instrument">
  <div class="label">STROKES</div>
  <div class="value" class:active={isActive} class:dim={isDim}>
    {strokeCount}
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

  .value.dim {
    color: var(--text-muted);
    opacity: 0.4;
  }
</style>
