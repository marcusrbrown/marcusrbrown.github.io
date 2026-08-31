export interface LargestContentfulPaintMeasurement {
  startTime: number
}

export function smoothScrollDuration(startTime: number, endTime: number): number {
  return Math.max(0, endTime - startTime)
}

export function latestLargestContentfulPaint(entries: readonly LargestContentfulPaintMeasurement[]): number | null {
  return entries.reduce<number | null>((latest, entry) => {
    if (latest === null || entry.startTime > latest) {
      return entry.startTime
    }

    return latest
  }, null)
}
