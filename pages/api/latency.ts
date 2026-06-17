import { NextRequest } from 'next/server'
import type { Env } from '@/worker/src'
import { getLatencySeries } from '@/worker/src/store'

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

  const db = (process.env as any as Env).UPTIMEFLARE_D1
  const series = await getLatencySeries(db, id)
  return new Response(JSON.stringify(series), { headers })
}
