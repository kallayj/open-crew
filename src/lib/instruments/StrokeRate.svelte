<script lang="ts">
  import { formatSpm } from '$lib/utils/format';

  let { spm, permissionState }: {
    spm: number | null;
    permissionState: 'pending' | 'granted' | 'denied';
  } = $props();

  let formatted = $derived(formatSpm(spm));
  let isHalf = $derived(formatted.endsWith(' 1/2'));
  let whole = $derived(isHalf ? formatted.slice(0, -4) : formatted);
</script>

<div class="instrument">
  <div class="label">STROKE RATE</div>
  <div class="value" class:active={spm !== null}>
    {whole}{#if isHalf}<span class="half"> ½</span>{/if}
  </div>
  <div class="unit">spm</div>
  {#if permissionState === 'denied'}
    <div class="status error">Motion denied</div>
  {:else if permissionState === 'pending'}
    <div class="status muted">Tap to enable</div>
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
    font-size: clamp(3rem, 12vw, 7rem);
    font-weight: 700;
    line-height: 1;
    color: var(--text-muted);
    transition: color 0.3s;
  }

  .value.active {
    color: var(--accent);
  }

  .half {
    font-size: 0.5em;
    vertical-align: middle;
  }

  .unit {
    font-size: clamp(0.75rem, 2vw, 1.1rem);
    color: var(--text-muted);
    letter-spacing: 0.1em;
  }

  .status {
    font-size: 0.7rem;
    margin-top: 0.5rem;
  }

  .error {
    color: #ff5252;
  }

  .muted {
    color: var(--text-muted);
  }
</style>
