<script lang="ts">
  import { untrack } from 'svelte';
  import { formatDistance } from '$lib/utils/format';
  import type { PieceTimer } from '$lib/sensors/pieceTimer.svelte';
  import type { GpsSensor } from '$lib/sensors/gps.svelte';

  let { pieceTimer, gps }: { pieceTimer: PieceTimer; gps: GpsSensor } = $props();

  let distanceM = $state(0);

  // Non-reactive integration state — modified inside untrack() blocks.
  let pendingBuffer: Array<{ speedMs: number; ts: number }> = [];
  // Wall-clock time (Unix epoch ms, same scale as pos.timestamp) captured when
  // the pending window opens — used to integrate the leading interval before
  // the first GPS sample arrives.
  let capturedPendingStartWall: number | null = null;
  let prevSample: { speedMs: number; ts: number } | null = null;

  /**
   * Trapezoidal integration of a buffer of speed samples.
   * The leading interval (pendingStartWall → first sample) is integrated at
   * the first sample's speed (constant extrapolation backward).
   */
  function integrateBuffer(
    buffer: typeof pendingBuffer,
    pendingStartWall: number,
  ): number {
    if (buffer.length === 0) return 0;
    let dist = 0;
    const leadingDt = Math.max(0, (buffer[0].ts - pendingStartWall) / 1000);
    dist += buffer[0].speedMs * leadingDt;
    for (let i = 1; i < buffer.length; i++) {
      const dt = (buffer[i].ts - buffer[i - 1].ts) / 1000;
      if (dt > 0 && dt < 15) {
        dist += ((buffer[i - 1].speedMs + buffer[i].speedMs) / 2) * dt;
      }
    }
    return dist;
  }

  // React to new GPS speed samples.
  // Tracked: gps.speedMs, gps.speedTimestamp (change together each position fix).
  // pieceTimer state is read untracked — the GPS sample is the event trigger.
  $effect(() => {
    const spd = gps.speedMs;
    const ts = gps.speedTimestamp;
    untrack(() => {
      if (spd === null || ts === null) return;
      if (pieceTimer.watchState === 'running') {
        if (prevSample !== null) {
          const dt = (ts - prevSample.ts) / 1000;
          if (dt > 0 && dt < 15) {
            distanceM += ((prevSample.speedMs + spd) / 2) * dt;
          }
        }
        prevSample = { speedMs: spd, ts };
      } else if (capturedPendingStartWall !== null) {
        pendingBuffer.push({ speedMs: spd, ts });
      }
    });
  });

  // React to the pending window opening or closing, and to direct resume.
  // Tracked: pendingStartTime and watchState together (they change atomically on confirm).
  $effect(() => {
    const pst = pieceTimer.pendingStartTime;
    const ws = pieceTimer.watchState;
    untrack(() => {
      if (pst !== null && capturedPendingStartWall === null) {
        // Pending window opened — record wall clock for GPS timestamp alignment.
        capturedPendingStartWall = Date.now();
      } else if (pst === null && capturedPendingStartWall !== null) {
        if (ws === 'running') {
          // Confirmed: integrate speculative buffer as distance seed.
          distanceM += integrateBuffer(pendingBuffer, capturedPendingStartWall);
          prevSample =
            pendingBuffer.length > 0
              ? pendingBuffer[pendingBuffer.length - 1]
              : null;
        }
        // False positive or manual cancel: buffered samples discarded.
        pendingBuffer = [];
        capturedPendingStartWall = null;
      } else if (pst === null && capturedPendingStartWall === null && ws === 'running') {
        // Direct resume (paused → running without a pending window): the boat is
        // already under way, so seed prevSample from the current GPS speed now.
        // This means the next fix integrates back to the resume moment rather than
        // leaving a gap of up to one GPS interval (~1 s at race pace ≈ 3 m).
        const spd = gps.speedMs;
        if (spd !== null) {
          prevSample = { speedMs: spd, ts: Date.now() };
        }
      }
    });
  });

  // On pause, clear prevSample so resumed integration doesn't span the gap.
  $effect(() => {
    if (pieceTimer.watchState === 'paused') {
      untrack(() => {
        prevSample = null;
      });
    }
  });

  // On reset, clear everything.
  $effect(() => {
    // Subscribe to resetCount — fires once on mount (fine) and on each reset.
    pieceTimer.resetCount;
    untrack(() => {
      distanceM = 0;
      pendingBuffer = [];
      capturedPendingStartWall = null;
      prevSample = null;
    });
  });

  const displayDist = $derived(
    pieceTimer.watchState === 'paused' && pieceTimer.elapsed === 0 && distanceM === 0
      ? '--'
      : formatDistance(distanceM),
  );

  const isActive = $derived(pieceTimer.watchState === 'running');
  const isDim = $derived(pieceTimer.watchState === 'paused' && pieceTimer.elapsed === 0);
</script>

<div class="instrument">
  <div class="label">DISTANCE</div>
  <div class="value" class:active={isActive} class:dim={isDim}>
    {displayDist}
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

  .value.dim {
    color: var(--text-muted);
    opacity: 0.4;
  }
</style>
