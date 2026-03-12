import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MotionSensor } from './motion.svelte';
import { GpsSensor, MIN_ACCURACY_M, IP_ACCURACY_M } from './gps.svelte';

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

  function makePosition(accuracy: number, lat = 0, lon = 0, timestamp = Date.now()): GeolocationPosition {
    return {
      coords: { accuracy, latitude: lat, longitude: lon,
        altitude: null, altitudeAccuracy: null, heading: null, speed: null,
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

  it('waitForFirstFix resolves null on timeout', async () => {
    vi.useFakeTimers();
    makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const promise = sensor.waitForFirstFix(3000);
    vi.advanceTimersByTime(3000);
    expect(await promise).toBeNull();
  });

  it('waitForFirstFix: position arriving after timeout does not reject', async () => {
    vi.useFakeTimers();
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const promise = sensor.waitForFirstFix(3000);
    vi.advanceTimersByTime(3000);
    await promise; // resolves null, not rejected
    // firing position after timeout should not throw
    expect(() => fireSuccess(makePosition(10))).not.toThrow();
  });

  // --- pace gating on accuracy ---

  it('pace remains null when accuracy > MIN_ACCURACY_M', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const t = Date.now();
    fireSuccess(makePosition(MIN_ACCURACY_M + 1, 0,       0,       t));
    fireSuccess(makePosition(MIN_ACCURACY_M + 1, 0.001,   0,       t + 5000));
    expect(sensor.pace).toBeNull();
  });

  it('pace is computed when accuracy <= MIN_ACCURACY_M', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const t = Date.now();
    fireSuccess(makePosition(MIN_ACCURACY_M, 0,     0, t));
    fireSuccess(makePosition(MIN_ACCURACY_M, 0.001, 0, t + 5000));
    expect(sensor.pace).not.toBeNull();
  });

  it('pace is cleared when accuracy degrades above MIN_ACCURACY_M', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const t = Date.now();
    fireSuccess(makePosition(MIN_ACCURACY_M, 0,     0, t));
    fireSuccess(makePosition(MIN_ACCURACY_M, 0.001, 0, t + 5000));
    expect(sensor.pace).not.toBeNull(); // established

    fireSuccess(makePosition(MIN_ACCURACY_M + 1, 0.002, 0, t + 10000));
    expect(sensor.pace).toBeNull();
  });

  // --- accuracy threshold permutations for startup degradation logic ---

  it('accuracy <= MIN_ACCURACY_M: no degradation (good fix)', async () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const promise = sensor.waitForFirstFix(5000);
    fireSuccess(makePosition(MIN_ACCURACY_M));
    const accuracy = await promise;
    expect(accuracy).not.toBeNull();
    expect(accuracy!).toBeLessThanOrEqual(MIN_ACCURACY_M);
  });

  it('accuracy between MIN_ACCURACY_M and IP_ACCURACY_M: poor fix, not IP-based', async () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const midAccuracy = Math.round((MIN_ACCURACY_M + IP_ACCURACY_M) / 2);
    const promise = sensor.waitForFirstFix(5000);
    fireSuccess(makePosition(midAccuracy));
    const accuracy = await promise;
    expect(accuracy!).toBeGreaterThan(MIN_ACCURACY_M);
    expect(accuracy!).toBeLessThan(IP_ACCURACY_M);
  });

  it('accuracy >= IP_ACCURACY_M: IP-based fix', async () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    const promise = sensor.waitForFirstFix(5000);
    fireSuccess(makePosition(IP_ACCURACY_M));
    const accuracy = await promise;
    expect(accuracy!).toBeGreaterThanOrEqual(IP_ACCURACY_M);
  });
});
