export function formatSpm(spm: number | null): string {
  if (spm === null) return '--';
  const rounded = Math.round(spm * 2) / 2;
  const whole = Math.floor(rounded);
  return rounded % 1 === 0 ? whole.toString() : `${whole} 1/2`;
}

export function formatPace(avgSpeedMs: number | null): string {
  if (avgSpeedMs === null || avgSpeedMs <= 0) return '--:--';
  const totalSeconds = 500 / avgSpeedMs;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatDistance(m: number): string {
  if (m < 10000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

const CARDINAL_DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

export function formatHeading(heading: number | null): string {
  if (heading === null) return '---';
  return String(Math.round(((heading % 360) + 360) % 360)).padStart(3, '0');
}

export function headingToCardinal(heading: number): string {
  const idx = Math.round(((heading % 360) + 360) % 360 / 22.5) % 16;
  return CARDINAL_DIRS[idx];
}

export function formatStopwatch(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
