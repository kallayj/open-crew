import { untrack } from 'svelte';
import type { PieceTimer } from './pieceTimer.svelte';
import type { GpsSensor } from './gps.svelte';

/**
 * Accumulates per-piece totals that start, stop, and reset with PieceTimer:
 *   distanceM   — trapezoidal GPS integration (including the speculative pending window)
 *   strokeCount — incremented via onStrokeConfirmed(), called from +page.svelte
 *                 immediately after pieceTimer.onStrokeConfirmed() so watchState
 *                 is already updated when we read it.
 */
export class PieceAccumulators {
  distanceM = $state(0);
  strokeCount = $state(0);

  private readonly _pieceTimer: PieceTimer;

  // Non-reactive GPS integration state — modified inside untrack() blocks.
  private _pendingBuffer: Array<{ speedMs: number; ts: number }> = [];
  private _capturedPendingStartWall: number | null = null;
  private _prevSample: { speedMs: number; ts: number } | null = null;

  constructor(pieceTimer: PieceTimer, gps: GpsSensor) {
    this._pieceTimer = pieceTimer;

    // React to new GPS speed samples.
    $effect(() => {
      const spd = gps.speedMs;
      const ts = gps.speedTimestamp;
      untrack(() => {
        if (spd === null || ts === null) return;
        if (pieceTimer.watchState === 'running') {
          if (this._prevSample !== null) {
            const dt = (ts - this._prevSample.ts) / 1000;
            if (dt > 0 && dt < 15) {
              this.distanceM += ((this._prevSample.speedMs + spd) / 2) * dt;
            }
          }
          this._prevSample = { speedMs: spd, ts };
        } else if (this._capturedPendingStartWall !== null) {
          this._pendingBuffer.push({ speedMs: spd, ts });
        }
      });
    });

    // React to the pending window opening or closing, and to direct resume.
    $effect(() => {
      const pst = pieceTimer.pendingStartTime;
      const ws = pieceTimer.watchState;
      untrack(() => {
        if (pst !== null && this._capturedPendingStartWall === null) {
          this._capturedPendingStartWall = Date.now();
        } else if (pst === null && this._capturedPendingStartWall !== null) {
          if (ws === 'running') {
            this.distanceM += this._integrateBuffer(
              this._pendingBuffer,
              this._capturedPendingStartWall,
            );
            this._prevSample =
              this._pendingBuffer.length > 0
                ? this._pendingBuffer[this._pendingBuffer.length - 1]
                : null;
          }
          this._pendingBuffer = [];
          this._capturedPendingStartWall = null;
        } else if (pst === null && this._capturedPendingStartWall === null && ws === 'running') {
          // Direct resume: seed prevSample so the next fix integrates back to now.
          const spd = gps.speedMs;
          if (spd !== null) {
            this._prevSample = { speedMs: spd, ts: Date.now() };
          }
        }
      });
    });

    // On pause, clear prevSample so resumed integration doesn't span the gap.
    $effect(() => {
      if (pieceTimer.watchState === 'paused') {
        untrack(() => { this._prevSample = null; });
      }
    });

    // On reset, clear everything.
    $effect(() => {
      pieceTimer.resetCount;
      untrack(() => {
        this.distanceM = 0;
        this.strokeCount = 0;
        this._pendingBuffer = [];
        this._capturedPendingStartWall = null;
        this._prevSample = null;
      });
    });
  }

  /**
   * Call immediately after pieceTimer.onStrokeConfirmed() in the same untrack block.
   * By then watchState has already transitioned (ready → running or already running),
   * so we can safely count the stroke.
   */
  onStrokeConfirmed(): void {
    if (this._pieceTimer.watchState === 'running') {
      this.strokeCount++;
    }
  }

  private _integrateBuffer(
    buffer: Array<{ speedMs: number; ts: number }>,
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
}
