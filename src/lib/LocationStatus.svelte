<script lang="ts">
  import { MIN_ACCURACY_M } from '$lib/sensors/gps.svelte';

  let { permissionState, accuracy, isGpsFix, variant = 'compact', faded = false }: {
    permissionState: 'pending' | 'granted' | 'denied';
    accuracy: number | null;
    isGpsFix: boolean | null;
    variant?: 'compact' | 'panel';
    faded?: boolean;
  } = $props();

  const poorAccuracy = $derived(
    accuracy !== null && (accuracy <= 0 || accuracy > MIN_ACCURACY_M)
  );

  const goodAccuracy = $derived(
    isGpsFix === true && accuracy !== null && accuracy > 0 && accuracy <= MIN_ACCURACY_M
  );

  function accuracyDesc(acc: number): string {
    return acc <= 0 ? '?' : `${Math.round(acc)}m`;
  }
</script>

{#if variant === 'compact'}
  {#if permissionState === 'denied'}
    <div class="line error">GPS unavailable</div>
  {:else if isGpsFix === false}
    <div class="line warn">Network location</div>
  {:else if poorAccuracy}
    <div class="line warn">GPS &plusmn;{accuracyDesc(accuracy!)}</div>
  {:else if goodAccuracy}
    <div class="line accuracy" class:faded>GPS &plusmn;{Math.round(accuracy!)}m</div>
  {:else if permissionState === 'pending'}
    <div class="line muted">Acquiring GPS&hellip;</div>
  {/if}

{:else}
  {#if permissionState === 'denied'}
    <div class="box error" role="alert">
      <span class="icon">&#x26A0;</span>GPS unavailable: no speed or position.
    </div>
  {:else if isGpsFix === false}
    <div class="box warn" role="alert">
      <span class="icon">&#x26A0;</span>Location is likely IP or WiFi-based. Speed will be enabled if a real GPS fix becomes available.
    </div>
  {:else if poorAccuracy}
    <div class="box warn" role="alert">
      <span class="icon">&#x26A0;</span>{accuracy! <= 0
        ? 'GPS reported zero accuracy — position is unreliable.'
        : `GPS accuracy is ${Math.round(accuracy!)}m. Speed will be enabled once accuracy improves below ${MIN_ACCURACY_M}m.`}
    </div>
  {/if}
  {#if goodAccuracy}
    <div class="panel-accuracy">GPS &plusmn;{Math.round(accuracy!)}m</div>
  {/if}
{/if}

<style>
  /* compact variant */
  .line {
    font-size: 0.7rem;
    margin-top: 0.5rem;
    text-align: center;
    letter-spacing: 0.05em;
  }

  .line.error    { color: #ff5252; }
  .line.warn     { color: #ffab40; }
  .line.muted    { color: var(--text-muted); }

  .line.accuracy {
    font-size: 0.65rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
    transition: opacity 1s;
  }

  .line.accuracy.faded { opacity: 0.3; }

  /* panel variant */
  .box {
    font-size: 0.75rem;
    padding: 0.6rem 0.75rem;
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    line-height: 1.4;
  }

  .box.error { color: #ff5252; border: 1px solid #ff5252; }
  .box.warn  { color: #ffab40; border: 1px solid #ffab40; }

  .icon { flex-shrink: 0; }

  .panel-accuracy {
    font-size: 0.75rem;
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }
</style>
