import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PieceTimer } from './pieceTimer.svelte';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('PieceTimer initial state', () => {
  it('starts paused', () => {
    expect(new PieceTimer().watchState).toBe('paused');
  });

  it('starts with zero elapsed', () => {
    expect(new PieceTimer().elapsed).toBe(0);
  });

  it('starts with no pending window', () => {
    expect(new PieceTimer().pendingStartTime).toBeNull();
  });

  it('starts with resetCount 0', () => {
    expect(new PieceTimer().resetCount).toBe(0);
  });
});

describe('PieceTimer toggleRunning', () => {
  it('paused → ready on first press', () => {
    const t = new PieceTimer();
    t.toggleRunning();
    expect(t.watchState).toBe('ready');
  });

  it('ready → paused on second press (cancel)', () => {
    const t = new PieceTimer();
    t.toggleRunning();
    t.toggleRunning();
    expect(t.watchState).toBe('paused');
    expect(t.pendingStartTime).toBeNull();
  });
});

describe('PieceTimer reset', () => {
  it('increments resetCount', () => {
    const t = new PieceTimer();
    t.reset();
    expect(t.resetCount).toBe(1);
    t.reset();
    expect(t.resetCount).toBe(2);
  });

  it('returns to paused with zero elapsed', () => {
    const t = new PieceTimer();
    t.toggleRunning(); // → ready
    t.onMotionDetected(null); // → pending
    t.reset();
    expect(t.watchState).toBe('paused');
    expect(t.elapsed).toBe(0);
    expect(t.pendingStartTime).toBeNull();
  });
});

describe('PieceTimer.onMotionDetected — at rest (no GPS speed)', () => {
  it('opens pending window when armed (watchState ready)', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const t = new PieceTimer();
    t.toggleRunning(); // → ready
    t.onMotionDetected(null);
    expect(t.pendingStartTime).toBe(1000);
    expect(t.watchState).toBe('ready');
  });

  it('does nothing when not armed (watchState paused)', () => {
    const t = new PieceTimer();
    t.onMotionDetected(null);
    expect(t.pendingStartTime).toBeNull();
    expect(t.watchState).toBe('paused');
  });

  it('does not re-open pending if already open', () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValue(2000);
    const t = new PieceTimer();
    t.toggleRunning();
    t.onMotionDetected(null);
    t.onMotionDetected(null);
    expect(t.pendingStartTime).toBe(1000); // unchanged
  });

  it('clears pending on timeout (false positive)', () => {
    const t = new PieceTimer();
    t.toggleRunning();
    t.onMotionDetected(null);
    expect(t.pendingStartTime).not.toBeNull();

    vi.advanceTimersByTime(60000 / 15); // STROKE_CONFIRM_TIMEOUT_MS
    expect(t.pendingStartTime).toBeNull();
    expect(t.watchState).toBe('ready'); // still armed, just de-pending
  });
});

describe('PieceTimer.onMotionDetected — boat under way (GPS speed >= 0.5 m/s)', () => {
  it('starts immediately without pending window', () => {
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    const t = new PieceTimer();
    t.toggleRunning(); // → ready
    t.onMotionDetected(0.5);
    expect(t.watchState).toBe('running');
    expect(t.pendingStartTime).toBeNull();
  });

  it('does not start when speed is just below threshold', () => {
    const t = new PieceTimer();
    t.toggleRunning();
    t.onMotionDetected(0.49);
    expect(t.watchState).toBe('ready');
    expect(t.pendingStartTime).not.toBeNull();
  });

  it('does nothing when not armed', () => {
    const t = new PieceTimer();
    t.onMotionDetected(3.0);
    expect(t.watchState).toBe('paused');
  });
});

describe('PieceTimer.onStrokeConfirmed', () => {
  it('confirms pending → running, backdated to pendingStartTime', () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValue(1200);
    const t = new PieceTimer();
    t.toggleRunning();
    t.onMotionDetected(null); // pending opens at t=1000
    t.onStrokeConfirmed();   // confirmed at t=1200, elapsed = 1200-1000 = 200
    expect(t.watchState).toBe('running');
    expect(t.pendingStartTime).toBeNull();
    expect(t.elapsed).toBe(200);
  });

  it('starts from now when ready but no pending window (motion was already active)', () => {
    vi.spyOn(performance, 'now').mockReturnValue(5000);
    const t = new PieceTimer();
    t.toggleRunning(); // → ready (hasMotion was already true, so no pendingStartTime)
    t.onStrokeConfirmed();
    expect(t.watchState).toBe('running');
    expect(t.elapsed).toBe(0); // started from now
    expect(t.pendingStartTime).toBeNull();
  });

  it('does nothing when not armed', () => {
    const t = new PieceTimer();
    t.onStrokeConfirmed();
    expect(t.watchState).toBe('paused');
  });
});

describe('PieceTimer pause / resume', () => {
  it('running → paused on pause()', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const t = new PieceTimer();
    t.toggleRunning(); // → ready
    t.onMotionDetected(1.0); // → running immediately (under way)
    t.pause();
    expect(t.watchState).toBe('paused');
  });

  it('resumes from paused when elapsed > 0', () => {
    // First call supplies fromTime, second supplies the elapsed snapshot in _startFrom.
    vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValue(2000);
    const t = new PieceTimer();
    t.toggleRunning();
    t.onMotionDetected(1.0); // → running; elapsed = 2000 - 1000 = 1000
    t.pause();
    t.toggleRunning(); // resume
    expect(t.watchState).toBe('running');
  });
});
