<script lang="ts">
  let { pace, permissionState }: {
    pace: string | null;
    permissionState: 'pending' | 'granted' | 'denied';
  } = $props();
</script>

<div class="instrument">
  <div class="label">BOAT SPEED</div>
  <div class="value" class:active={pace !== null}>{pace ?? '--:--'}</div>
  <div class="unit">/500m</div>
  {#if permissionState === 'denied'}
    <div class="status error">GPS denied</div>
  {:else if permissionState === 'pending'}
    <div class="status muted">Acquiring GPS&hellip;</div>
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
  }

  .value.active {
    color: var(--accent);
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
