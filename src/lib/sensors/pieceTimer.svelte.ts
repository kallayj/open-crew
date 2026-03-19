// Slowest stroke rate we expect at piece start (determines confirmation timeout).
const MIN_ROWING_SPM = 15;
const STROKE_CONFIRM_TIMEOUT_MS = 60000 / MIN_ROWING_SPM;

// GPS speed above this threshold means the boat is under way — rowing is certain,
// so stroke confirmation is not needed to guard against false-positive jolts.
const MIN_UNDERWAY_SPEED_MS = 0.5;

/**
 * Owns the stopwatch lifecycle and the two-stage auto-start:
 *   pending  → motion detected while armed; starts confirmation timeout
 *   running  → first stroke trough confirmed; timer backdated to pendingStartTime
 *   discard  → timeout fires before confirmation; pending window closed
 *
 * Consumers (Stopwatch display, Distance integrator) subscribe to the reactive
 * $state fields.  +page.svelte feeds sensor events via onMotionDetected() and
 * onStrokeConfirmed(), called from $effects that track the sensor outputs.
 */
export class PieceTimer {
  watchState = $state<'ready' | 'running' | 'paused'>('paused');
  elapsed = $state(0);

  /**
   * Non-null while the pending confirmation window is open.
   * Becomes null atomically with watchState → 'running' (confirmed) or on
   * timeout / manual cancel (false positive).
   * Distance integrators should start buffering GPS samples when this opens.
   */
  pendingStartTime = $state<number | null>(null);

  /** Increments on every reset(). Subscribe to detect resets reactively. */
  resetCount = $state(0);

  private _startTime: number | null = null;
  private _pausedAt: number | null = null;
  private _rafId: number | null = null;
  private _confirmTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private _clearPending(): void {
    this.pendingStartTime = null;
    if (this._confirmTimeoutId !== null) {
      clearTimeout(this._confirmTimeoutId);
      this._confirmTimeoutId = null;
    }
  }

  /**
   * Call from a reactive effect when hasMotion becomes true.
   * Pass the current GPS speed so that a moving boat skips stroke confirmation.
   */
  onMotionDetected(speedMs: number | null): void {
    if (this.watchState !== 'ready') return;
    if (speedMs !== null && speedMs >= MIN_UNDERWAY_SPEED_MS) {
      // Boat is already under way — no jolt ambiguity, start immediately.
      this._startFrom(performance.now());
    } else if (this.pendingStartTime === null) {
      this.pendingStartTime = performance.now();
      this._confirmTimeoutId = setTimeout(
        () => this._clearPending(),
        STROKE_CONFIRM_TIMEOUT_MS,
      );
    }
  }

  /** Call from a reactive effect when lastStrokeTime becomes non-null. */
  onStrokeConfirmed(): void {
    if (this.watchState !== 'ready') return;
    if (this.pendingStartTime !== null) {
      const t = this.pendingStartTime;
      this._clearPending();
      this._startFrom(t);
    } else {
      // hasMotion was already true when ready was entered, so onMotionDetected
      // never fired and pendingStartTime was never set. A confirmed stroke is
      // sufficient evidence of rowing — start from now.
      this._startFrom(performance.now());
    }
  }

  private _tick(): void {
    if (this._startTime !== null) {
      this.elapsed = performance.now() - this._startTime;
    }
    this._rafId = requestAnimationFrame(() => this._tick());
  }

  private _startFrom(fromTime: number): void {
    this._startTime = fromTime;
    this.elapsed = performance.now() - fromTime;
    this._pausedAt = null;
    this.watchState = 'running';
    this._rafId = requestAnimationFrame(() => this._tick());
  }

  private _startNow(): void {
    if (this._pausedAt !== null) {
      this._startTime = performance.now() - this._pausedAt;
    } else {
      this._startTime = performance.now();
      this.elapsed = 0;
    }
    this._pausedAt = null;
    this.watchState = 'running';
    this._rafId = requestAnimationFrame(() => this._tick());
  }

  pause(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._pausedAt = this.elapsed;
    this.watchState = 'paused';
  }

  reset(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._clearPending();
    this.elapsed = 0;
    this._startTime = null;
    this._pausedAt = null;
    this.watchState = 'paused';
    this.resetCount++;
  }

  toggleRunning(): void {
    if (this.watchState === 'running') {
      this.pause();
    } else if (this.watchState === 'paused' && this.elapsed > 0) {
      this._startNow();
    } else if (this.watchState === 'paused') {
      this.watchState = 'ready';
    } else if (this.watchState === 'ready') {
      this._clearPending();
      this.watchState = 'paused';
    }
  }
}
