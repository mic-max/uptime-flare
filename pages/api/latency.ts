import { NextRequest } from 'next/server'
import type { Env } from '@/worker/src'
import { getLatencySeries, LATENCY_DISPLAY_SECONDS } from '@/worker/src/store'
import { devLatencySeries } from '@/util/devData'

export const runtime = 'edge'

const headers = {
  'Content-Type': 'application/json',
  // Matches the cron cadence; lets shared caches serve a recent copy briefly.
  'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30',
}

// Returns the recent latency series for a single monitor, fetched on demand when
// a user expands that monitor's chart (so the page load doesn't pay for it).
export default async function handler(req: NextRequest): Promise<Response> {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) {
    return new Response(JSON.stringify({ error: 'missing id' }), { status: 400, headers })
  }

  // Optional ?hours= override; defaults to the configured display window.
  const hoursParam = Number(new URL(req.url).searchParams.get('hours'))
  const windowSeconds = hoursParam > 0 ? hoursParam * 3600 : LATENCY_DISPLAY_SECONDS
  const since = Math.round(Date.now() / 1000) - windowSeconds

  const db = (process.env as any as Env).UPTIMEFLARE_D1
  const t0 = Date.now()
  // Fall back to sample data when there's no binding (plain `next dev`).
  const series = db ? await getLatencySeries(db, id, since) : devLatencySeries(id, since)
  const dbMs = Date.now() - t0
  // `Server-Timing` shows up in the browser's Network → Timing tab so you can see
  // how much of the response time is the D1 query vs edge/network overhead.
  return new Response(JSON.stringify(series), {
    headers: { ...headers, 'Server-Timing': `d1;dur=${dbMs};desc="1 query"` },
  })
}
