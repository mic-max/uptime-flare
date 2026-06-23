// Local-development fixtures. Used ONLY when the D1 binding is absent — i.e. plain
// `npm run dev`, which has no Cloudflare bindings — so the status page renders with
// realistic sample data without needing wrangler/D1 set up. In production the
// binding always exists, so none of this runs.
//
// Server-only: imports workerConfig. Import it from getServerSideProps / edge API
// routes only — never from a client component (see the uptime.config CVE note).
import { workerConfig } from '@/uptime.config'
import type { IncidentRecord, LatencyRecord, MonitorState } from '@/types/config'

// Raw colo codes (enriched to friendly names by the same codeToCountry path as prod).
const SAMPLE_LOCS = ['ATL', 'MIA', 'EWR', 'ORD', 'IAD']
const NOW = () => Math.round(Date.now() / 1000)

// Deterministic-ish synthetic ping so charts look real and differ per monitor.
function fakePing(id: string, t: number): number {
  const seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0)
  const base = 80 + (seed % 120)
  const wave = 40 * Math.sin(t / 600 + (seed % 7))
  const jitter = ((Math.sin(t * 12.9898 + seed) * 43758.5453) % 1) * 30
  return Math.max(1, Math.round(base + wave + Math.abs(jitter)))
}

// One monitor is shown currently-down, one with a past closed incident, rest healthy.
function devIncidents(index: number): IncidentRecord[] {
  const now = NOW()
  const start90 = now - 90 * 24 * 3600
  const incidents: IncidentRecord[] = [{ start: [start90], end: start90, error: ['dummy'] }]
  if (index === 1) {
    const s = now - 2 * 24 * 3600
    incidents.push({ start: [s], end: s + 55 * 60, error: ['Sample timeout (dev fixture)'] })
  }
  const isLast = index === workerConfig.monitors.length - 1
  if (isLast) {
    incidents.push({ start: [now - 8 * 60], end: null, error: ['Connection refused (dev fixture)'] })
  }
  return incidents
}

export function devMonitorState(): MonitorState {
  const state: MonitorState = {
    lastUpdate: NOW() - 20,
    overallUp: 0,
    overallDown: 0,
    incident: {},
    stats: {},
    location: {},
  }
  workerConfig.monitors.forEach((m, i) => {
    const incidents = devIncidents(i)
    state.incident[m.id] = incidents
    if (incidents[incidents.length - 1].end === null) state.overallDown++
    else state.overallUp++
    state.stats[m.id] = { avg: 110 + i * 15, p95: 230 + i * 20, p99: 420 + i * 25 }
    state.location[m.id] = SAMPLE_LOCS[i % SAMPLE_LOCS.length]
  })
  return state
}

export function devLatencySeries(id: string, sinceSeconds: number): LatencyRecord[] {
  const now = NOW()
  const loc = SAMPLE_LOCS[Math.abs([...id].reduce((a, c) => a + c.charCodeAt(0), 0)) % SAMPLE_LOCS.length]
  const start = Math.max(sinceSeconds, now - 6 * 3600)
  const out: LatencyRecord[] = []
  for (let t = start; t <= now; t += 60) out.push({ time: t, ping: fakePing(id, t), loc })
  return out
}

export function devLatencyDeltas(
  ids: string[],
  sinceSeconds: number
): Record<string, LatencyRecord[]> {
  const out: Record<string, LatencyRecord[]> = {}
  for (const id of ids) out[id] = devLatencySeries(id, sinceSeconds).filter((p) => p.time > sinceSeconds)
  return out
}

export function devDataSnapshot(): {
  lastUpdate: number
  incident: Record<string, IncidentRecord>
  latency: Record<string, LatencyRecord>
} {
  const state = devMonitorState()
  const incident: Record<string, IncidentRecord> = {}
  const latency: Record<string, LatencyRecord> = {}
  for (const m of workerConfig.monitors) {
    const arr = state.incident[m.id]
    incident[m.id] = arr[arr.length - 1]
    latency[m.id] = { time: state.lastUpdate, ping: state.stats[m.id].avg, loc: state.location[m.id] }
  }
  return { lastUpdate: state.lastUpdate, incident, latency }
}
