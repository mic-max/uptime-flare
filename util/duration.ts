// Human-readable duration like "2 hours 30 minutes" (replaces moment.preciseDiff).
export function humanizeDuration(totalSeconds: number): string {
  const units: [number, string][] = [
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ]
  let remaining = Math.round(totalSeconds)
  const parts: string[] = []
  for (const [size, name] of units) {
    const value = Math.floor(remaining / size)
    if (value > 0) {
      parts.push(`${value} ${name}${value === 1 ? '' : 's'}`)
      remaining -= value * size
    }
  }
  return parts.length > 0 ? parts.join(' ') : '0 seconds'
}
