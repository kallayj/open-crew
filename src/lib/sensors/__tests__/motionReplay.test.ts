/**
 * Replay-based test: feed real Sensor Logger CSV data through the algorithm,
 * write a replay-output.csv for visual inspection in Google Sheets.
 *
 * To use:
 *   1. Record a rowing session with Sensor Logger (Android).
 *   2. Export Accelerometer.csv — verify resting z ≈ 9.8.
 *   3. Place the file at src/lib/sensors/__fixtures__/rowing.csv
 *   4. Run: yarn test:run
 *   5. Open src/lib/sensors/__fixtures__/replay-output.csv in Google Sheets.
 *      Plot t_s vs spm, add stroke markers.
 *   6. Identify ground-truth events → add assertions in motionAlgorithm.test.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { parseSensorLoggerCsv } from '../__fixtures__/parseSensorLogger';
import { createInitialState, processMotionSample } from '../motionAlgorithm';

const FIXTURE_PATH = 'src/lib/sensors/__fixtures__/rowing.csv';
const OUTPUT_PATH = 'src/lib/sensors/__fixtures__/replay-output.csv';

describe.skipIf(!existsSync(FIXTURE_PATH))('motionReplay', () => {
  it('produces replay output', () => {
    const csv = readFileSync(FIXTURE_PATH, 'utf8');
    const samples = parseSensorLoggerCsv(csv);
    expect(samples.length).toBeGreaterThan(0);

    let state = createInitialState();
    const output: { t_s: number; spm: number | null; stroke: boolean }[] = [];

    for (const sample of samples) {
      const prevPeakTime = state.lastPeakTime;
      state = processMotionSample(sample, state);
      output.push({
        t_s: (sample.timestamp - samples[0].timestamp) / 1000,
        spm: state.spm,
        stroke: state.lastPeakTime !== prevPeakTime,
      });
    }

    const outCsv =
      't_s,spm,stroke\n' +
      output
        .map((r) => `${r.t_s.toFixed(3)},${r.spm ?? ''},${r.stroke ? 1 : 0}`)
        .join('\n');
    writeFileSync(OUTPUT_PATH, outCsv);

    // Ensure algorithm ran without crash
    expect(output.length).toBe(samples.length);
    console.log(`Replayed ${samples.length} samples → ${OUTPUT_PATH}`);
  });
});
