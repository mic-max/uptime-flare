import { IncidentRecord, LatencyRecord, MonitorState } from '../../types/config'

// Retention windows (seconds). Latency is kept for charts/last-value, incidents for the 90-day bar.
export const LATENCY_RETENTION_SECONDS = 12 * 60 * 60
export const INCIDENT_RETENTION_SECONDS = 90 * 24 * 60 * 60

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

// Idempotently ensure the relational tables exist. Runs cheaply on every scheduled
// invocation so existing deployments self-heal without re-running init.sql.
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

export async function getLastLatency(
  db: D1Database,
  monitorId: string
): Promise<LatencyRecord | null> {
  const row = await db
    .prepare(`SELECT ts, ping, loc FROM latency WHERE monitor_id = ? ORDER BY ts DESC LIMIT 1`)
    .bind(monitorId)
    .first<LatencyRow>()
  return row ? { time: row.ts, ping: row.ping, loc: row.loc } : null
}

export async function getLastUpdate(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT MAX(ts) AS ts FROM latency`).first<{ ts: number | null }>()
  return row?.ts ?? 0
}

// Full latency series (within the retention window) for one monitor. Fetched on
// demand by /api/latency when a chart is expanded, not as part of the page load.
export async function getLatencySeries(
  db: D1Database,
  monitorId: string
): Promise<LatencyRecord[]> {
  const rows = await db
    .prepare(`SELECT ts, ping, loc FROM latency WHERE monitor_id = ? ORDER BY ts`)
    .bind(monitorId)
    .all<LatencyRow>()
  return rows.results.map((r) => ({ time: r.ts, ping: r.ping, loc: r.loc }))
}

// ---------------------------------------------------------------------------
// Page state read (used by the status page)
// ---------------------------------------------------------------------------

// Build the page's MonitorState from the incident table (+ a cheap MAX(ts) for
// lastUpdate). The 12h latency series is deliberately NOT read here — it's large
// and only needed when a user expands a specific chart, so it's fetched lazily
// via getLatencySeries / /api/latency instead.
export async function loadMonitorState(db: D1Database): Promise<MonitorState> {
  const state: MonitorState = {
    lastUpdate: 0,
    overallUp: 0,
    overallDown: 0,
    incident: {},
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
  return state
}
