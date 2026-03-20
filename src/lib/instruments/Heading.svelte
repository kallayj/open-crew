<script lang="ts">
  import { formatHeading, headingToCardinal } from '$lib/utils/format';
  import BoatOrientation from './BoatOrientation.svelte';

  let { heading, source, boatDeviceOffset }: {
    heading: number | null;
    source: 'gps' | 'imu' | null;
    boatDeviceOffset: number | null;
  } = $props();

  let cardinal = $derived(heading !== null ? headingToCardinal(heading) : null);
  let label = $derived(source === 'gps' ? 'COG' : 'HEADING');
</script>

<div class="instrument">
  <div class="label">{label}</div>
  <div class="value" class:active={heading !== null}>
    {formatHeading(heading)}
  </div>
  <div class="unit">{cardinal ?? '\u00a0'}</div>
  <div class="orientation">
    <BoatOrientation offset={boatDeviceOffset} />
  </div>
</div>

<style>
  .instrument {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
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

  .orientation {
    position: absolute;
    right: clamp(0.5rem, 3vw, 2rem);
    top: 50%;
    transform: translateY(-50%);
    height: clamp(40px, 60%, 80px);
    aspect-ratio: 1;
  }


</style>
