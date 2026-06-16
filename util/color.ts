// Maps an uptime percentage to one of a few discrete status levels. Components
// translate the level into a CSS class (see styles/StatusBar.module.css) instead
// of computing an inline color string per element.
export type StatusLevel = 'excellent' | 'good' | 'fair' | 'down' | 'noData'

function getStatusLevel(percent: number | string): StatusLevel {
  const p = Number(percent)
  if (Number.isNaN(p)) return 'noData'
  if (p >= 99.9) return 'excellent'
  if (p >= 99) return 'good'
  if (p >= 95) return 'fair'
  return 'down'
}

export { getStatusLevel }
