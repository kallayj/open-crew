export function formatSpm(spm: number | null): string {
  if (spm === null) return '--';
  return Math.round(spm).toString();
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
