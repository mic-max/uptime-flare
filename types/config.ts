export type PageConfig = {
  title?: string
  links?: PageConfigLink[]
  group?: PageConfigGroup
  maintenances?: {
    upcomingColor?: string
  }
}

export type MaintenanceConfig = {
  monitors?: string[]
  title?: string
  body: string
  start: number | string
  end?: number | string
  color?: string
}

export type PageConfigGroup = { [key: string]: string[] }

export type PageConfigLink = {
  link: string
  label: string
  highlight?: boolean
}

export type MonitorTarget = {
  id: string
  name: string
  method: string
  target: string
  tooltip?: string
  statusPageLink?: string
  // Upstream provider this monitor depends on; rendered as a link next to the monitor.
  statusDependency?: { label: string; link: string }
  hideLatencyChart?: boolean
  expectedCodes?: number[]
  timeout?: number
  headers?: { [key: string]: string | number }
  body?: string
  responseKeyword?: string
  responseForbiddenKeyword?: string
  checkProxy?: string
}

export type WorkerConfig = {
  monitors: MonitorTarget[]
  notification?: Notification
}

export type Notification = {
  webhook?: WebhookConfig
  timeZone?: string
  gracePeriod?: number
}

type SingleWebhook = {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH'
  headers?: { [key: string]: string | number }
  payloadType: 'param' | 'json' | 'x-www-form-urlencoded'
  payload: any
  timeout?: number
}

export type WebhookConfig = SingleWebhook | SingleWebhook[]

export type IncidentRecord = {
  start: number[]
  end: number | null // null if it's still open
  error: string[]
}

export type LatencyRecord = {
  loc: string
  ping: number
  time: number
}

export type LatencyStats = {
  avg: number
  p95: number
  p99: number
}

// Lightweight page state: incidents (for status + 90-day bars), overall counts,
// last-update, and per-monitor latency stats over the display window. The full
// latency series is NOT included — it's fetched per monitor on demand via
// /api/latency only when a chart is expanded.
export type MonitorState = {
  lastUpdate: number
  overallUp: number
  overallDown: number
  incident: Record<string, IncidentRecord[]>
  stats: Record<string, LatencyStats>
  // Most recent check location per monitor. The worker stores the raw colo code
  // (e.g. "ATL"); the Pages layer maps it to a friendly name (e.g.
  // "United States/Georgia") before sending it to the client.
  location: Record<string, string>
}
