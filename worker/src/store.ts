import { IncidentRecord, LatencyRecord, LatencyStats, MonitorState } from '../../types/config'

// Retention windows (seconds). Latency is kept for charts/last-value, incidents for the 90-day bar.
export const LATENCY_RETENTION_SECONDS = 24 * 60 * 60
export const INCIDENT_RETENTION_SECONDS = 90 * 24 * 60 * 60

// How much of the (24h-retained) latency to actually surface in charts/stats.
// Decoupled from retention so we can store more than we display.
export const LATENCY_DISPLAY_SECONDS = 6 * 60 * 60

// avg / p95 / p99 of a set of ping samples (SQLite has no percentile function,
// so this is computed in JS). Includes down-samples (recorded at the timeout),
// so percentiles reflect outage spikes as well as normal latency.
function computeLatencyStats(pings: number[]): LatencyStats {
  const sorted = [...pings].sort((a, b) => a - b)
  const n = sorted.length
  const avg = Math.round(sorted.reduce((sum, v) => sum + v, 0) / n)
  const at = (p: number) => sorted[Math.min(n - 1, Math.ceil((p / 100) * n) - 1)]
  return { avg, p95: at(95), p99: at(99) }
}

// Row shapes as stored in D1.
// An "incident" row holds one logical incident. `starts`/`errors` are JSON arrays so a single
// ongoing incident can record multiple error-reason changes over time (mirroring IncidentRecord).
// `start_time` mirrors starts[0] and exists purely for chronological ordering/indexing.
type IncidentRow = { id: number; starts: string; end_time: number | null; errors: string }
type LatencyRow = { monitor_id?: string; ts: number; ping: number; loc: string }

function rowToIncident(row: IncidentRow): { id: number; incident: IncidentRecord } {
  return {
    id: row.id,
    incident: {
      start: JSON.parse(row.starts) as number[],
      end: row.end_time,
      error: JSON.parse(row.errors) as string[],
    },
  }
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

// Idempotently ensure the relational tables exist. This is the single source of
// truth for the schema; it runs cheaply on cold start so deployments self-heal
// without a separate migration step.
export async function ensureSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS latency (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitor_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        ping INTEGER NOT NULL,
        loc TEXT NOT NULL
      )`
    ),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_latency_monitor_ts ON latency (monitor_id, ts)`),
    // Index on ts alone so the retention prune (DELETE WHERE ts < ?) and the stats
    // window scan (WHERE ts >= ?) seek instead of full-scanning the table — the
    // (monitor_id, ts) index above can't serve a ts-only predicate.
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_latency_ts ON latency (ts)`),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS incident (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitor_id TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        starts TEXT NOT NULL,
        end_time INTEGER,
        errors TEXT NOT NULL
      )`
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_incident_monitor ON incident (monitor_id, start_time, id)`
    ),
  ])
}

// ---------------------------------------------------------------------------
// Per-monitor read/write helpers (used by the worker's scheduled write path)
// ---------------------------------------------------------------------------

export async function getLastIncident(
  db: D1Database,
  monitorId: string
): Promise<{ id: number; incident: IncidentRecord } | null> {
  const row = await db
    .prepare(
      `SELECT id, starts, end_time, errors FROM incident
       WHERE monitor_id = ? ORDER BY start_time DESC, id DESC LIMIT 1`
    )
    .bind(monitorId)
    .first<IncidentRow>()
  return row ? rowToIncident(row) : null
}

export async function getFirstIncident(
  db: D1Database,
  monitorId: string
): Promise<{ id: number; incident: IncidentRecord } | null> {
  const row = await db
    .prepare(
      `SELECT id, starts, end_time, errors FROM incident
       WHERE monitor_id = ? ORDER BY start_time ASC, id ASC LIMIT 1`
    )
    .bind(monitorId)
    .first<IncidentRow>()
  return row ? rowToIncident(row) : null
}

export async function insertIncident(
  db: D1Database,
  monitorId: string,
  incident: IncidentRecord
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO incident (monitor_id, start_time, starts, end_time, errors)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      monitorId,
      incident.start[0],
      JSON.stringify(incident.start),
      incident.end,
      JSON.stringify(incident.error)
    )
    .run()
  return res.meta.last_row_id as number
}

export async function updateIncident(
  db: D1Database,
  id: number,
  incident: IncidentRecord
): Promise<void> {
  await db
    .prepare(`UPDATE incident SET start_time = ?, starts = ?, end_time = ?, errors = ? WHERE id = ?`)
    .bind(
      incident.start[0],
      JSON.stringify(incident.start),
      incident.end,
      JSON.stringify(incident.error),
      id
    )
    .run()
}

// Drop incidents (across all monitors) that have been closed for longer than the
// retention window. Done globally rather than per-monitor to save round-trips.
export async function deleteOldClosedIncidents(db: D1Database, cutoff: number): Promise<void> {
  await db
    .prepare(`DELETE FROM incident WHERE end_time IS NOT NULL AND end_time < ?`)
    .bind(cutoff)
    .run()
}

// Persist this tick's latency samples and prune samples older than `pruneBefore`
// in a single batched round-trip, instead of one INSERT per monitor plus a
// separate DELETE. Called once per tick.
export async function writeLatencyBatch(
  db: D1Database,
  samples: { monitorId: string; record: LatencyRecord }[],
  pruneBefore: number
): Promise<void> {
  const statements: D1PreparedStatement[] = [
    ...samples.map(({ monitorId, record }) =>
      db
        .prepare(`INSERT INTO latency (monitor_id, ts, ping, loc) VALUES (?, ?, ?, ?)`)
        .bind(monitorId, record.time, record.ping, record.loc)
    ),
    db.prepare(`DELETE FROM latency WHERE ts < ?`).bind(pruneBefore),
  ]
  await db.batch(statements)
}

export async function getLastUpdate(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT MAX(ts) AS ts FROM latency`).first<{ ts: number | null }>()
  return row?.ts ?? 0
}

// Snapshot for the /api/data summary: latest latency + latest incident for every
// monitor, plus lastUpdate (= newest latency ts) — all in ONE batched round-trip
// (two statements) instead of 1 + 2-per-monitor sequential queries.
export async function getDataSnapshot(db: D1Database): Promise<{
  lastUpdate: number
  incident: Record<string, IncidentRecord>
  latency: Record<string, LatencyRecord>
}> {
  const [latencyRes, incidentRes] = await db.batch([
    // Newest latency row per monitor (id is autoincrement, so MAX(id) == latest).
    db.prepare(
      `SELECT monitor_id, ts, ping, loc FROM latency
       WHERE id IN (SELECT MAX(id) FROM latency GROUP BY monitor_id)`
    ),
    // Newest incident row per monitor (same ordering as getLastIncident).
    db.prepare(
      `SELECT monitor_id, starts, end_time, errors FROM (
         SELECT monitor_id, starts, end_time, errors,
                ROW_NUMBER() OVER (PARTITION BY monitor_id ORDER BY start_time DESC, id DESC) AS rn
         FROM incident
       ) WHERE rn = 1`
    ),
  ])

  const latency: Record<string, LatencyRecord> = {}
  let lastUpdate = 0
  for (const r of latencyRes.results as unknown as {
    monitor_id: string
    ts: number
    ping: number
    loc: string
  }[]) {
    latency[r.monitor_id] = { time: r.ts, ping: r.ping, loc: r.loc }
    if (r.ts > lastUpdate) lastUpdate = r.ts
  }

  const incident: Record<string, IncidentRecord> = {}
  for (const r of incidentRes.results as unknown as {
    monitor_id: string
    starts: string
    end_time: number | null
    errors: string
  }[]) {
    incident[r.monitor_id] = {
      start: JSON.parse(r.starts),
      end: r.end_time,
      error: JSON.parse(r.errors),
    }
  }

  return { lastUpdate, incident, latency }
}

// Latency series for one monitor, limited to samples at/after `sinceSeconds`.
// Fetched on demand by /api/latency when a chart is expanded.
export async function getLatencySeries(
  db: D1Database,
  monitorId: string,
  sinceSeconds = 0
): Promise<LatencyRecord[]> {
  const rows = await db
    .prepare(`SELECT ts, ping, loc FROM latency WHERE monitor_id = ? AND ts >= ? ORDER BY ts`)
    .bind(monitorId, sinceSeconds)
    .all<LatencyRow>()
  return rows.results.map((r) => ({ time: r.ts, ping: r.ping, loc: r.loc }))
}

// Latency points strictly newer than `sinceSeconds` for a set of monitors, in ONE
// query. Used by /api/refresh to deliver just the new tail for the charts a client
// has open (delta-append), rather than the whole series each poll.
export async function getLatencyDeltas(
  db: D1Database,
  monitorIds: string[],
  sinceSeconds: number
): Promise<Record<string, LatencyRecord[]>> {
  const out: Record<string, LatencyRecord[]> = {}
  if (monitorIds.length === 0) return out

  const placeholders = monitorIds.map(() => '?').join(',')
  const rows = await db
    .prepare(
      `SELECT monitor_id, ts, ping, loc FROM latency
       WHERE monitor_id IN (${placeholders}) AND ts > ?
       ORDER BY monitor_id, ts`
    )
    .bind(...monitorIds, sinceSeconds)
    .all<LatencyRow & { monitor_id: string }>()

  for (const r of rows.results) {
    ;(out[r.monitor_id] ??= []).push({ time: r.ts, ping: r.ping, loc: r.loc })
  }
  return out
}

// ---------------------------------------------------------------------------
// Page state read (used by the status page)
// ---------------------------------------------------------------------------

// Build the page's MonitorState from the incident table (+ a cheap MAX(ts) for
// lastUpdate). The latency series is deliberately NOT read here — it's large
// and only needed when a user expands a specific chart, so it's fetched lazily
// via getLatencySeries / /api/latency instead.
export async function loadMonitorState(db: D1Database): Promise<MonitorState> {
  const state: MonitorState = {
    lastUpdate: 0,
    overallUp: 0,
    overallDown: 0,
    incident: {},
    stats: {},
    location: {},
  }

  const incidents = await db
    .prepare(
      `SELECT monitor_id, starts, end_time, errors FROM incident
       ORDER BY monitor_id, start_time, id`
    )
    .all<{ monitor_id: string; starts: string; end_time: number | null; errors: string }>()
  for (const row of incidents.results) {
    ;(state.incident[row.monitor_id] ??= []).push({
      start: JSON.parse(row.starts),
      end: row.end_time,
      error: JSON.parse(row.errors),
    })
  }

  // A monitor is currently up iff its most recent incident is closed.
  for (const monitorId of Object.keys(state.incident)) {
    const arr = state.incident[monitorId]
    if (arr[arr.length - 1].end === null) state.overallDown++
    else state.overallUp++
  }

  state.lastUpdate = await getLastUpdate(db)

  // Per-monitor latency stats over the display window, plus each monitor's most
  // recent check location. One query (ping/ts/loc), grouped + reduced in JS.
  const cutoff = Math.round(Date.now() / 1000) - LATENCY_DISPLAY_SECONDS
  const pings = await db
    .prepare(`SELECT monitor_id, ts, ping, loc FROM latency WHERE ts >= ? ORDER BY monitor_id`)
    .bind(cutoff)
    .all<{ monitor_id: string; ts: number; ping: number; loc: string }>()
  const pingsByMonitor: Record<string, number[]> = {}
  const latestLoc: Record<string, { ts: number; loc: string }> = {}
  for (const row of pings.results) {
    ;(pingsByMonitor[row.monitor_id] ??= []).push(row.ping)
    if (!latestLoc[row.monitor_id] || row.ts > latestLoc[row.monitor_id].ts) {
      latestLoc[row.monitor_id] = { ts: row.ts, loc: row.loc }
    }
  }
  for (const monitorId of Object.keys(pingsByMonitor)) {
    state.stats[monitorId] = computeLatencyStats(pingsByMonitor[monitorId])
    state.location[monitorId] = latestLoc[monitorId].loc
  }

  return state
}
