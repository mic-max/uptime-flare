import { NextRequest } from 'next/server'
import type { Env } from '@/worker/src'
import { getLatencyDeltas, loadMonitorState } from '@/worker/src/store'

export const runtime = 'edge'

const headers = {
  'Content-Type': 'application/json',
  // Background poll; let shared caches briefly coalesce bursts.
  'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=15',
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

  const state = await loadMonitorState(db)
  const latency = charts.length > 0 ? await getLatencyDeltas(db, charts, since) : {}

  const dbMs = Date.now() - t0
  return new Response(JSON.stringify({ state, latency }), {
    headers: { ...headers, 'Server-Timing': `d1;dur=${dbMs};desc="refresh"` },
  })
}
