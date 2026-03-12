import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MotionSensor } from './motion.svelte';
import { GpsSensor, MIN_ACCURACY_M } from './gps.svelte';

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

// ---------------------------------------------------------------------------
// GpsSensor — accuracy state and pace gating
// ---------------------------------------------------------------------------

describe('GpsSensor accuracy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function setGeolocation(impl: Partial<Geolocation> | undefined) {
    Object.defineProperty(navigator, 'geolocation', {
      value: impl,
      writable: true,
      configurable: true,
    });
  }

  /** Returns callbacks to fire success/error on the mock watchPosition. */
  function makeGeoMock() {
    let fireSuccess!: (pos: GeolocationPosition) => void;
    let fireError!: (err: GeolocationPositionError) => void;
    setGeolocation({
      watchPosition: vi.fn((onSuccess, onError) => {
        fireSuccess = onSuccess;
        fireError = onError;
        return 1;
      }),
      clearWatch: vi.fn(),
    });
    return {
      fireSuccess: (pos: GeolocationPosition) => fireSuccess(pos),
      fireError:   (err: GeolocationPositionError) => fireError(err),
    };
  }

  function makePosition(
    accuracy: number,
    { lat = 0, lon = 0, altitude = null, timestamp = Date.now() }:
    { lat?: number; lon?: number; altitude?: number | null; timestamp?: number } = {}
  ): GeolocationPosition {
    return {
      coords: { accuracy, latitude: lat, longitude: lon,
        altitude, altitudeAccuracy: null, heading: null, speed: null,
        toJSON: () => ({}) },
      timestamp,
      toJSON: () => {},
    } as unknown as GeolocationPosition;
  }

  it('accuracy starts as null', () => {
    expect(new GpsSensor().accuracy).toBeNull();
  });

  it('accuracy is updated when a position fires', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    fireSuccess(makePosition(15));
    expect(sensor.accuracy).toBe(15);
  });

  it('accuracy is updated again on subsequent positions', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    fireSuccess(makePosition(30));
    expect(sensor.accuracy).toBe(30);
    fireSuccess(makePosition(8));
    expect(sensor.accuracy).toBe(8);
  });

  // --- isGpsFix detection via altitude ---

  it('isGpsFix starts as null', () => {
    expect(new GpsSensor().isGpsFix).toBeNull();
  });

  it('isGpsFix is true when altitude is present', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    fireSuccess(makePosition(10, { altitude: 14.3 }));
    expect(sensor.isGpsFix).toBe(true);
  });

  it('isGpsFix is false when altitude is absent', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    fireSuccess(makePosition(500, { altitude: null }));
    expect(sensor.isGpsFix).toBe(false);
  });

  it('isGpsFix updates on subsequent positions', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    fireSuccess(makePosition(500, { altitude: null }));
    expect(sensor.isGpsFix).toBe(false);
    fireSuccess(makePosition(10, { altitude: 5.0 }));
    expect(sensor.isGpsFix).toBe(true);
  });

  // --- waitForFirstFix ---

  it('waitForFirstFix resolves with accuracy when a position fires', async () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const promise = sensor.waitForFirstFix(5000);
    fireSuccess(makePosition(12));
    expect(await promise).toBe(12);
  });

  it('waitForFirstFix resolves immediately when accuracy is already known', async () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    fireSuccess(makePosition(8));
    expect(await sensor.waitForFirstFix(5000)).toBe(8);
  });

  it('waitForFirstFix: position arriving after timeout does not reject', async () => {
    vi.useFakeTimers();
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const promise = sensor.waitForFirstFix(3000);
    vi.advanceTimersByTime(3000);
    await promise;
    expect(() => fireSuccess(makePosition(10))).not.toThrow();
  });

  it('waitForFirstFix resolves null on timeout', async () => {
    vi.useFakeTimers();
    makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const promise = sensor.waitForFirstFix(3000);
    vi.advanceTimersByTime(3000);
    expect(await promise).toBeNull();
  });

  // --- pace gating on accuracy ---

  it('pace remains null when accuracy > MIN_ACCURACY_M', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const t = Date.now();
    fireSuccess(makePosition(MIN_ACCURACY_M + 1, { lat: 0,     lon: 0,     timestamp: t }));
    fireSuccess(makePosition(MIN_ACCURACY_M + 1, { lat: 0.001, lon: 0,     timestamp: t + 5000 }));
    expect(sensor.pace).toBeNull();
  });

  it('pace is computed when accuracy <= MIN_ACCURACY_M', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const t = Date.now();
    fireSuccess(makePosition(MIN_ACCURACY_M, { lat: 0,     lon: 0, timestamp: t }));
    fireSuccess(makePosition(MIN_ACCURACY_M, { lat: 0.001, lon: 0, timestamp: t + 5000 }));
    expect(sensor.pace).not.toBeNull();
  });

  it('pace is cleared when accuracy degrades above MIN_ACCURACY_M', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const t = Date.now();
    fireSuccess(makePosition(MIN_ACCURACY_M, { lat: 0,     lon: 0, timestamp: t }));
    fireSuccess(makePosition(MIN_ACCURACY_M, { lat: 0.001, lon: 0, timestamp: t + 5000 }));
    expect(sensor.pace).not.toBeNull(); // established

    fireSuccess(makePosition(MIN_ACCURACY_M + 1, { lat: 0.002, lon: 0, timestamp: t + 10000 }));
    expect(sensor.pace).toBeNull();
  });

  // --- fix quality permutations for startup degradation logic ---

  it('good GNSS fix: accuracy <= MIN_ACCURACY_M and altitude present → no degradation', async () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const promise = sensor.waitForFirstFix(5000);
    fireSuccess(makePosition(MIN_ACCURACY_M, { altitude: 12.0 }));
    expect(await promise).toBeLessThanOrEqual(MIN_ACCURACY_M);
    expect(sensor.isGpsFix).toBe(true);
  });

  it('poor GNSS fix: accuracy > MIN_ACCURACY_M and altitude present → not network', async () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const promise = sensor.waitForFirstFix(5000);
    fireSuccess(makePosition(150, { altitude: 5.0 }));
    expect(await promise).toBeGreaterThan(MIN_ACCURACY_M);
    expect(sensor.isGpsFix).toBe(true);
  });

  it('network fix: altitude absent → isGpsFix false regardless of reported accuracy', async () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const promise = sensor.waitForFirstFix(5000);
    fireSuccess(makePosition(10, { altitude: null })); // high accuracy but no altitude
    await promise;
    expect(sensor.isGpsFix).toBe(false);
  });

  it('zero accuracy with altitude present: isGpsFix true, accuracy 0 (browser bug)', async () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const promise = sensor.waitForFirstFix(5000);
    fireSuccess(makePosition(0, { altitude: 8.0 }));
    expect(await promise).toBe(0);
    expect(sensor.isGpsFix).toBe(true);
  });
});
