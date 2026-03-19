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

  it('lastStrokeTime starts as null', () => {
    expect(new MotionSensor().lastStrokeTime).toBeNull();
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

  it('stays pending after start() until a position fires', () => {
    setGeolocation({ watchPosition: vi.fn().mockReturnValue(1), clearWatch: vi.fn() });
    const sensor = new GpsSensor();
    sensor.start();
    expect(sensor.permissionState).toBe('pending');
  });

  it('transitions pending → granted when watchPosition fires a position', () => {
    let fireSuccess: ((pos: GeolocationPosition) => void) | null = null;
    setGeolocation({
      watchPosition: vi.fn((onSuccess) => { fireSuccess = onSuccess; return 1; }),
      clearWatch: vi.fn(),
    });
    const sensor = new GpsSensor();
    sensor.start();
    expect(sensor.permissionState).toBe('pending');

    fireSuccess!({
      coords: { accuracy: 10, latitude: 0, longitude: 0, altitude: null,
        altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) },
      timestamp: Date.now(), toJSON: () => {},
    } as unknown as GeolocationPosition);
    expect(sensor.permissionState).toBe('granted');
  });

  it('transitions pending → denied when watchPosition fires a PERMISSION_DENIED error', () => {
    let fireError: ((err: GeolocationPositionError) => void) | null = null;
    setGeolocation({
      watchPosition: vi.fn((_, onError) => { fireError = onError; return 1; }),
      clearWatch: vi.fn(),
    });
    const sensor = new GpsSensor();
    sensor.start();
    expect(sensor.permissionState).toBe('pending');

    fireError!({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    expect(sensor.permissionState).toBe('denied');
  });

  it('stays pending when watchPosition fires a non-permission error', () => {
    let fireError: ((err: GeolocationPositionError) => void) | null = null;
    setGeolocation({
      watchPosition: vi.fn((_, onError) => { fireError = onError; return 1; }),
      clearWatch: vi.fn(),
    });
    const sensor = new GpsSensor();
    sensor.start();
    fireError!({ code: 2, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    expect(sensor.permissionState).toBe('pending');
  });

  it('PERMISSION_DENIED does not resolve waitForFirstFix early (iOS pre-check behaviour)', async () => {
    vi.useFakeTimers();
    let fireError: ((err: GeolocationPositionError) => void) | null = null;
    let fireSuccess: ((pos: GeolocationPosition) => void) | null = null;
    setGeolocation({
      watchPosition: vi.fn((onSuccess, onError) => {
        fireSuccess = onSuccess; fireError = onError; return 1;
      }),
      clearWatch: vi.fn(),
    });
    const sensor = new GpsSensor();
    sensor.start();
    const promise = sensor.waitForFirstFix(3000);

    // iOS fires pre-check PERMISSION_DENIED while dialog is showing
    fireError!({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    expect(sensor.permissionState).toBe('denied');

    // Promise is still pending — not resolved yet
    let resolved = false;
    promise.then(() => { resolved = true; });
    await Promise.resolve(); // flush microtasks
    expect(resolved).toBe(false);

    // User taps Allow → position arrives on the same watch
    fireSuccess!({
      coords: { accuracy: 8, latitude: 0, longitude: 0, altitude: 10,
        altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) },
      timestamp: Date.now(), toJSON: () => {},
    } as unknown as GeolocationPosition);
    expect(await promise).toBe(8);
    expect(sensor.permissionState).toBe('granted');

    vi.useRealTimers();
  });

  it('waitForFirstFix resolves null on timeout when user truly denies', async () => {
    vi.useFakeTimers();
    let fireError: ((err: GeolocationPositionError) => void) | null = null;
    setGeolocation({
      watchPosition: vi.fn((_, onError) => { fireError = onError; return 1; }),
      clearWatch: vi.fn(),
    });
    const sensor = new GpsSensor();
    sensor.start();
    const promise = sensor.waitForFirstFix(3000);

    fireError!({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    expect(sensor.permissionState).toBe('denied');

    vi.advanceTimersByTime(3000);
    expect(await promise).toBeNull();
    expect(sensor.permissionState).toBe('denied');

    vi.useRealTimers();
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
    { altitude = null, speed = null, timestamp = Date.now() }:
    { altitude?: number | null; speed?: number | null; timestamp?: number } = {}
  ): GeolocationPosition {
    return {
      coords: { accuracy, latitude: 0, longitude: 0,
        altitude, altitudeAccuracy: null, heading: null, speed,
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
    fireSuccess(makePosition(MIN_ACCURACY_M + 1, { speed: 2 }));
    expect(sensor.pace).toBeNull();
  });

  it('pace is computed when accuracy <= MIN_ACCURACY_M', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    fireSuccess(makePosition(MIN_ACCURACY_M, { speed: 2 }));
    expect(sensor.pace).not.toBeNull();
  });

  it('pace is cleared when accuracy degrades above MIN_ACCURACY_M', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    fireSuccess(makePosition(MIN_ACCURACY_M, { speed: 2 }));
    expect(sensor.pace).not.toBeNull(); // established

    fireSuccess(makePosition(MIN_ACCURACY_M + 1, { speed: 2 }));
    expect(sensor.pace).toBeNull();
  });

  // --- pace thresholds ---

  it('pace is null when device reports no speed', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    fireSuccess(makePosition(MIN_ACCURACY_M, { speed: null }));
    expect(sensor.pace).toBeNull();
  });

  it('pace is null when speed is below minimum (0.5 m/s)', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    fireSuccess(makePosition(MIN_ACCURACY_M, { speed: 0.4 }));
    expect(sensor.pace).toBeNull();
  });

  it('pace is computed at minimum speed (0.5 m/s)', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    fireSuccess(makePosition(MIN_ACCURACY_M, { speed: 0.5 }));
    expect(sensor.pace).not.toBeNull();
  });

  it('pace sanity: 2 m/s → 4:10 per 500 m', () => {
    const { fireSuccess } = makeGeoMock();
    const sensor = new GpsSensor();
    sensor.start();
    fireSuccess(makePosition(MIN_ACCURACY_M, { speed: 2 }));
    expect(sensor.pace).toBe('4:10');
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
