import { describe, expect, it } from 'vitest';
import { formatPace, formatSpm, formatStopwatch } from './format';

describe('formatSpm', () => {
  it('returns -- for null', () => {
    expect(formatSpm(null)).toBe('--');
  });

  it('rounds to integer string', () => {
    expect(formatSpm(22.4)).toBe('22');
    expect(formatSpm(22.5)).toBe('23');
    expect(formatSpm(20)).toBe('20');
  });
});

describe('formatPace', () => {
  it('returns --:-- for null', () => {
    expect(formatPace(null)).toBe('--:--');
  });

  it('returns --:-- for zero speed', () => {
    expect(formatPace(0)).toBe('--:--');
  });

  it('returns --:-- for negative speed', () => {
    expect(formatPace(-1)).toBe('--:--');
  });

  it('formats 500 m/s speed as 0:01 pace', () => {
    // 500 m/s → 1 second per 500 m
    expect(formatPace(500)).toBe('0:01');
  });

  it('formats 2 m/s (≈ typical sprint) as 4:10 pace', () => {
    // 500 / 2 = 250 s = 4 min 10 s
    expect(formatPace(2)).toBe('4:10');
  });

  it('pads seconds to two digits', () => {
    // 500 / 5 = 100 s = 1 min 40 s
    expect(formatPace(5)).toBe('1:40');
  });
});

describe('formatStopwatch', () => {
  it('formats 0 ms as 00:00', () => {
    expect(formatStopwatch(0)).toBe('00:00');
  });

  it('formats under one minute', () => {
    expect(formatStopwatch(45_000)).toBe('00:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatStopwatch(2 * 60_000 + 5_000)).toBe('02:05');
  });

  it('formats exactly one hour', () => {
    expect(formatStopwatch(3_600_000)).toBe('1:00:00');
  });

  it('formats over one hour', () => {
    expect(formatStopwatch(3_600_000 + 2 * 60_000 + 3_000)).toBe('1:02:03');
  });

  it('truncates sub-second values', () => {
    expect(formatStopwatch(999)).toBe('00:00');
    expect(formatStopwatch(1_999)).toBe('00:01');
  });
});
