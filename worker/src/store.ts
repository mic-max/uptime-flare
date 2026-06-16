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

// Drop incidents that have been closed for longer than the retention window.
export async function deleteOldClosedIncidents(
  db: D1Database,
  monitorId: string,
  cutoff: number
): Promise<void> {
  await db
    .prepare(`DELETE FROM incident WHERE monitor_id = ? AND end_time IS NOT NULL AND end_time < ?`)
    .bind(monitorId, cutoff)
    .run()
}

export async function insertLatency(
  db: D1Database,
  monitorId: string,
  record: LatencyRecord
): Promise<void> {
  await db
    .prepare(`INSERT INTO latency (monitor_id, ts, ping, loc) VALUES (?, ?, ?, ?)`)
    .bind(monitorId, record.time, record.ping, record.loc)
    .run()
}

export async function deleteOldLatency(
  db: D1Database,
  monitorId: string,
  cutoff: number
): Promise<void> {
  await db
    .prepare(`DELETE FROM latency WHERE monitor_id = ? AND ts < ?`)
    .bind(monitorId, cutoff)
    .run()
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

// ---------------------------------------------------------------------------
// Full-state read (used by the status page to build the MonitorState the UI expects)
// ---------------------------------------------------------------------------

// Reconstruct the full MonitorState from the relational tables in a single pass.
// Retention already bounds the tables (12h latency / 90d incidents), so this reads
// only the live window, not unbounded history.
export async function loadMonitorState(db: D1Database): Promise<MonitorState> {
  const state: MonitorState = {
    lastUpdate: 0,
    overallUp: 0,
    overallDown: 0,
    incident: {},
    latency: {},
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

  const latencies = await db
    .prepare(`SELECT monitor_id, ts, ping, loc FROM latency ORDER BY monitor_id, ts`)
    .all<{ monitor_id: string; ts: number; ping: number; loc: string }>()
  for (const row of latencies.results) {
    ;(state.latency[row.monitor_id] ??= []).push({ time: row.ts, ping: row.ping, loc: row.loc })
    if (row.ts > state.lastUpdate) state.lastUpdate = row.ts
  }

  // A monitor is currently up iff its most recent incident is closed.
  for (const monitorId of Object.keys(state.incident)) {
    const arr = state.incident[monitorId]
    if (arr[arr.length - 1].end === null) state.overallDown++
    else state.overallUp++
  }

  return state
}
