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

// The MonitorState is now assembled directly from the normalized `incident` and
// `latency` D1 tables (see worker/src/store.ts:loadMonitorState).
export type MonitorState = {
  lastUpdate: number
  overallUp: number
  overallDown: number
  incident: Record<string, IncidentRecord[]>
  latency: Record<string, LatencyRecord[]> // recent 12 hour data, N min interval
}
