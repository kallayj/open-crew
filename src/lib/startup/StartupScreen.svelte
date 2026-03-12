<script lang="ts">
  import type { MotionSensor } from '$lib/sensors/motion.svelte';
  import type { GpsSensor } from '$lib/sensors/gps.svelte';
  import { MIN_ACCURACY_M, IP_ACCURACY_M } from '$lib/sensors/gps.svelte';

  let { motion, gps, oncontinue }: {
    motion: MotionSensor;
    gps: GpsSensor;
    oncontinue: () => void;
  } = $props();

  type Phase = 'idle' | 'requesting' | 'degraded';
  let phase = $state<Phase>('idle');
  let mediaSession = $state(false);
  let gpsIpBased = $state(false);
  let gpsPoorAccuracy = $state(false);

  async function grantAccess() {
    phase = 'requesting';
    try { await document.documentElement.requestFullscreen(); } catch {}
    await motion.requestPermission();
    gps.start();

    if (gps.permissionState === 'granted') {
      const accuracy = await gps.waitForFirstFix(3000);
      if (accuracy !== null && accuracy > MIN_ACCURACY_M) {
        gpsIpBased = accuracy >= IP_ACCURACY_M;
        gpsPoorAccuracy = !gpsIpBased;
      }
    }

    const anyDegraded =
      motion.permissionState === 'denied' ||
      gps.permissionState === 'denied' ||
      gpsIpBased ||
      gpsPoorAccuracy;

    if (anyDegraded) {
      phase = 'degraded';
    } else {
      oncontinue();
    }
  }

  const motionState = $derived(motion.permissionState);
  const gpsState = $derived(gps.permissionState);
  const gpsNotIdeal = $derived(gpsIpBased || gpsPoorAccuracy);

  const degradeMsg = $derived.by(() => {
    const motionDenied = motionState === 'denied';
    const gpsOut = gpsState === 'denied' || gpsIpBased;
    if (motionDenied && gpsOut) return 'No sensors available — app is nonfunctional.';
    if (motionDenied) return 'Motion unavailable: no stroke rate, heading, or roll.';
    if (gpsState === 'denied') return 'GPS unavailable: no speed or position.';
    if (gpsIpBased) return 'GPS is returning an approximate location, likely IP-based. Speed will be enabled if an accurate fix becomes available.';
    if (gpsPoorAccuracy) return `GPS accuracy is currently poor (${Math.round(gps.accuracy!)}m). Speed will be enabled once accuracy improves below ${MIN_ACCURACY_M}m.`;
    return '';
  });
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Sensor setup">
  <div class="card">
    <h1 class="title">open-crew</h1>

    {#if phase !== 'degraded'}
      <!-- Idle / requesting: show what will be enabled -->
      <div class="sensor-list">
        <div class="sensor-row">
          <div class="sensor-name">Motion</div>
          <div class="sensor-desc">Stroke rate · Heading · Roll</div>
        </div>
        <div class="sensor-row">
          <div class="sensor-name">GPS</div>
          <div class="sensor-desc">Speed · Pace · Position</div>
        </div>
      </div>

      <label class="media-session-row">
        <input type="checkbox" bind:checked={mediaSession} />
        <span class="media-session-label">
          Media session controls
          <span class="media-session-desc">Start / reset via Bluetooth or headphone remote</span>
        </span>
      </label>

      <div class="actions">
        <button class="btn-primary" onclick={grantAccess} disabled={phase === 'requesting'}>
          {phase === 'requesting' ? 'Requesting…' : 'Grant Access'}
        </button>
      </div>
    {:else}
      <!-- Degraded: show what was and wasn't granted -->
      <div class="sensor-list">
        <div class="sensor-row">
          <div class="sensor-info">
            <div class="sensor-name">Motion</div>
            <div class="sensor-desc">Stroke rate · Heading · Roll</div>
          </div>
          <div class="sensor-status"
            class:granted={motionState === 'granted'}
            class:denied={motionState === 'denied'}>
            {motionState === 'granted' ? '✓' : '✗'}
          </div>
        </div>
        <div class="sensor-row">
          <div class="sensor-info">
            <div class="sensor-name">GPS</div>
            <div class="sensor-desc">Speed · Pace · Position</div>
          </div>
          <div class="sensor-status"
            class:granted={gpsState === 'granted' && !gpsNotIdeal}
            class:ip-based={gpsNotIdeal}
            class:denied={gpsState === 'denied'}>
            {#if gpsState === 'denied'}✗{:else if gpsNotIdeal}~{:else}✓{/if}
          </div>
        </div>
      </div>

      <div class="degrade-msg" role="alert">
        <span class="warn-icon">⚠</span>
        {degradeMsg}
      </div>

      <label class="media-session-row">
        <input type="checkbox" bind:checked={mediaSession} />
        <span class="media-session-label">
          Media session controls
          <span class="media-session-desc">Start / reset via Bluetooth or headphone remote</span>
        </span>
      </label>

      <div class="actions">
        <button class="btn-primary" onclick={oncontinue}>Continue</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: var(--bg);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .card {
    width: min(90vw, 360px);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .title {
    font-size: clamp(1.4rem, 4vw, 1.8rem);
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--accent);
    text-align: center;
  }

  .sensor-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    border: 1px solid var(--border);
    padding: 1rem;
  }

  .sensor-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .sensor-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    letter-spacing: 0.05em;
  }

  .sensor-desc {
    font-size: 0.7rem;
    color: var(--text-muted);
    letter-spacing: 0.05em;
    margin-top: 0.15rem;
  }

  .sensor-status {
    font-size: 1.2rem;
    min-width: 1.5rem;
    text-align: center;
    flex-shrink: 0;
  }

  .sensor-status.granted  { color: var(--accent); }
  .sensor-status.ip-based { color: #ffab40; }
  .sensor-status.denied   { color: #ff5252; }

  .degrade-msg {
    font-size: 0.75rem;
    color: #ffab40;
    border: 1px solid #ffab40;
    padding: 0.6rem 0.75rem;
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    line-height: 1.4;
  }

  .warn-icon {
    flex-shrink: 0;
  }

  .media-session-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .media-session-row input[type="checkbox"] {
    margin-top: 0.1rem;
    accent-color: var(--accent);
    flex-shrink: 0;
    cursor: pointer;
  }

  .media-session-label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .media-session-desc {
    font-size: 0.65rem;
    color: #444;
  }

  .actions {
    display: flex;
    justify-content: center;
  }

  .btn-primary {
    background: none;
    border: 1px solid var(--accent);
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.9rem;
    letter-spacing: 0.1em;
    padding: 0.65rem 2rem;
    cursor: pointer;
    text-transform: uppercase;
    transition: background 0.15s, color 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent);
    color: var(--bg);
  }

  .btn-primary:disabled {
    border-color: var(--border);
    color: var(--text-muted);
    cursor: default;
  }
</style>
