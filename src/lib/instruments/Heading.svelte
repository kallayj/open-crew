<script lang="ts">
  import { formatHeading, headingToCardinal } from '$lib/utils/format';

  let { heading, source }: {
    heading: number | null;
    source: 'gps' | 'imu' | null;
  } = $props();

  let cardinal = $derived(heading !== null ? headingToCardinal(heading) : null);
</script>

<div class="instrument">
  <div class="label">HEADING</div>
  <div class="value" class:active={heading !== null}>
    {formatHeading(heading)}
  </div>
  <div class="unit">{cardinal ?? '\u00a0'}</div>
  {#if source === 'imu'}
    <div class="status muted">compass</div>
  {/if}
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
    font-size: clamp(2.5rem, 10vw, 6rem);
    font-weight: 700;
    line-height: 1;
    color: var(--text-muted);
    transition: color 0.3s;
    font-variant-numeric: tabular-nums;
  }

  .value.active {
    color: var(--accent);
  }

  .unit {
    font-size: clamp(0.75rem, 2vw, 1.1rem);
    color: var(--text-muted);
    letter-spacing: 0.1em;
    min-height: 1.2em;
  }

  .status {
    font-size: 0.7rem;
    margin-top: 0.25rem;
  }

  .muted {
    color: var(--text-muted);
  }
</style>
