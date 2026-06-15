-- Legacy key-value table (pre-2026 compacted blob). Kept so the worker can import
-- existing data into the normalized tables below on first run after upgrading.
CREATE TABLE IF NOT EXISTS uptimeflare (
    key VARCHAR(255) PRIMARY KEY,
    value BLOB NOT NULL
);

-- One row per check sample.
CREATE TABLE IF NOT EXISTS latency (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    ping INTEGER NOT NULL,
    loc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_latency_monitor_ts ON latency (monitor_id, ts);

-- One row per logical incident. `starts` / `errors` are JSON arrays so a single
-- ongoing incident can record multiple error-reason changes over time.
-- `start_time` mirrors starts[0] and exists for chronological ordering/indexing.
CREATE TABLE IF NOT EXISTS incident (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    starts TEXT NOT NULL,
    end_time INTEGER,
    errors TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incident_monitor ON incident (monitor_id, start_time, id);
