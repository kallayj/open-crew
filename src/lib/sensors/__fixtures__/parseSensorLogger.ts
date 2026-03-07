import type { MotionSample } from '../motionAlgorithm';

/**
 * Parse a Sensor Logger (Android) Accelerometer.csv export.
 *
 * Expected columns: time, seconds_elapsed, x, y, z
 *   - time: Unix epoch in nanoseconds
 *   - x, y, z: acceleration in m/s² (including gravity)
 *
 * Verify before use: at rest, z should be ≈ 9.8 (gravity included).
 * If z ≈ 0, you have a Linear Acceleration export — the algorithm needs
 * gravity-including values, so use the Accelerometer export.
 */
export function parseSensorLoggerCsv(csv: string): MotionSample[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map((s) => s.trim());
  const timeIdx = header.indexOf('time');
  const xIdx = header.indexOf('x');
  const yIdx = header.indexOf('y');
  const zIdx = header.indexOf('z');

  if (timeIdx < 0 || xIdx < 0 || yIdx < 0 || zIdx < 0) {
    throw new Error(`Missing expected columns. Found: ${header.join(', ')}`);
  }

  const samples: MotionSample[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length <= Math.max(timeIdx, xIdx, yIdx, zIdx)) continue;

    // time column is nanoseconds — too large for Number precision, use BigInt
    const timeNs = BigInt(cols[timeIdx].trim());
    const timestamp = Number(timeNs / 1_000_000n); // ns → ms

    samples.push({
      x: parseFloat(cols[xIdx]),
      y: parseFloat(cols[yIdx]),
      z: parseFloat(cols[zIdx]),
      timestamp,
    });
  }

  return samples.sort((a, b) => a.timestamp - b.timestamp);
}
