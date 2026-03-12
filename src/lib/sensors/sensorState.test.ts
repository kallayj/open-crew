import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MotionSensor } from './motion.svelte';
import { GpsSensor } from './gps.svelte';

// ---------------------------------------------------------------------------
// MotionSensor — permission state
// ---------------------------------------------------------------------------

describe('MotionSensor permission state', () => {
  beforeEach(() => {
    delete (DeviceMotionEvent as unknown as Record<string, unknown>).requestPermission;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts as pending', () => {
    expect(new MotionSensor().permissionState).toBe('pending');
  });

  it('grants on non-iOS devices (no requestPermission API)', async () => {
    const sensor = new MotionSensor();
    await sensor.requestPermission();
    expect(sensor.permissionState).toBe('granted');
  });

  it('grants when iOS requestPermission resolves granted', async () => {
    (DeviceMotionEvent as unknown as Record<string, unknown>).requestPermission =
      vi.fn().mockResolvedValue('granted');
    const sensor = new MotionSensor();
    await sensor.requestPermission();
    expect(sensor.permissionState).toBe('granted');
  });

  it('denies when iOS requestPermission resolves denied', async () => {
    (DeviceMotionEvent as unknown as Record<string, unknown>).requestPermission =
      vi.fn().mockResolvedValue('denied');
    const sensor = new MotionSensor();
    await sensor.requestPermission();
    expect(sensor.permissionState).toBe('denied');
  });

  it('denies when iOS requestPermission throws', async () => {
    (DeviceMotionEvent as unknown as Record<string, unknown>).requestPermission = vi
      .fn()
      .mockRejectedValue(new Error('user gesture required'));
    const sensor = new MotionSensor();
    await sensor.requestPermission();
    expect(sensor.permissionState).toBe('denied');
  });
});

// ---------------------------------------------------------------------------
// GpsSensor — availability and permission state
// ---------------------------------------------------------------------------

describe('GpsSensor permission state', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setGeolocation(
    impl: Partial<Geolocation> | undefined,
  ) {
    Object.defineProperty(navigator, 'geolocation', {
      value: impl,
      writable: true,
      configurable: true,
    });
  }

  it('starts as pending', () => {
    expect(new GpsSensor().permissionState).toBe('pending');
  });

  it('denies immediately when geolocation API is unavailable', () => {
    setGeolocation(undefined);
    const sensor = new GpsSensor();
    sensor.start();
    expect(sensor.permissionState).toBe('denied');
  });

  it('grants when geolocation is available', () => {
    setGeolocation({ watchPosition: vi.fn().mockReturnValue(1), clearWatch: vi.fn() });
    const sensor = new GpsSensor();
    sensor.start();
    expect(sensor.permissionState).toBe('granted');
  });

  it('transitions granted → denied when watchPosition fires a PERMISSION_DENIED error', () => {
    let fireError: ((err: GeolocationPositionError) => void) | null = null;
    setGeolocation({
      watchPosition: vi.fn((_, onError) => { fireError = onError; return 1; }),
      clearWatch: vi.fn(),
    });
    const sensor = new GpsSensor();
    sensor.start();
    expect(sensor.permissionState).toBe('granted'); // geolocation started OK

    fireError!({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    expect(sensor.permissionState).toBe('denied');
  });

  it('stays granted when watchPosition fires a non-permission error', () => {
    let fireError: ((err: GeolocationPositionError) => void) | null = null;
    setGeolocation({
      watchPosition: vi.fn((_, onError) => { fireError = onError; return 1; }),
      clearWatch: vi.fn(),
    });
    const sensor = new GpsSensor();
    sensor.start();
    fireError!({ code: 2, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    expect(sensor.permissionState).toBe('granted');
  });
});
