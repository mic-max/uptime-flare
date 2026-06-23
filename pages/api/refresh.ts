import { NextRequest } from 'next/server'
import type { Env } from '@/worker/src'
import { getLatencyDeltas, loadMonitorState } from '@/worker/src/store'
import { codeToCountry } from '@/util/iata'
import { devLatencyDeltas, devMonitorState } from '@/util/devData'

export const runtime = 'edge'

const headers = {
  'Content-Type': 'application/json',
  // Personalized, timing-sensitive poll: the client schedules its next poll from
  // the `now`/`lastUpdate` in the response, so a shared cache would skew that.
  'Cache-Control': 'no-store',
}

// Lightweight poll endpoint that replaces the old full-page reload. Returns the
// (small) full MonitorState plus, for any charts the client has open, only the
// latency points newer than `since` (delta-append on the client).
//   GET /api/refresh?charts=id1,id2&since=<unix seconds>
export default async function handler(req: NextRequest): Promise<Response> {
  const url = new URL(req.url)
  const db = (process.env as any as Env).UPTIMEFLARE_D1
  const t0 = Date.now()

  const charts = (url.searchParams.get('charts') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const since = Number(url.searchParams.get('since')) || 0

  // Fall back to sample data when there's no binding (plain `next dev`).
  const state = db ? await loadMonitorState(db) : devMonitorState()
  for (const id in state.location) state.location[id] = codeToCountry(state.location[id])
  const latency =
    charts.length === 0
      ? {}
      : db
        ? await getLatencyDeltas(db, charts, since)
        : devLatencyDeltas(charts, since)

  // Server time (seconds), so the client can schedule its next poll relative to
  // when the worker last wrote (state.lastUpdate) without depending on its own clock.
  const now = Math.round(Date.now() / 1000)
  const dbMs = Date.now() - t0
  return new Response(JSON.stringify({ state, latency, now }), {
    headers: { ...headers, 'Server-Timing': `d1;dur=${dbMs};desc="refresh"` },
  })
}
