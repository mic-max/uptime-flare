import { maintenances, workerConfig } from '@/uptime.config'
import { NextRequest } from 'next/server'
import type { Env } from '@/worker/src'
import { getDataSnapshot } from '@/worker/src/store'
import { devDataSnapshot } from '@/util/devData'

export const runtime = 'edge'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req: NextRequest): Promise<Response> {
  const db = (process.env as any as Env).UPTIMEFLARE_D1
  const t0 = Date.now()

  // One batched round-trip: latest latency + latest incident per monitor.
  // Falls back to sample data when there's no binding (plain `next dev`).
  const { lastUpdate, incident, latency } = db ? await getDataSnapshot(db) : devDataSnapshot()
  if (lastUpdate === 0) {
    return new Response(JSON.stringify({ error: 'No data available' }), { status: 500, headers })
  }

  let monitors: any = {}
  let overallUp = 0
  let overallDown = 0

  for (let monitor of workerConfig.monitors) {
    const last = incident[monitor.id]
    const lat = latency[monitor.id]

    const isUp = last != null && last.end !== null
    if (last != null) {
      isUp ? overallUp++ : overallDown++
    }

    monitors[monitor.id] = {
      up: isUp,
      latency: lat?.ping ?? 0,
      location: lat?.loc ?? '',
      message: isUp ? 'OK' : last?.error[last.error.length - 1] ?? 'No data',
    }
  }

  let ret = {
    up: overallUp,
    down: overallDown,
    updatedAt: lastUpdate,
    monitors,
    maintenances,
  }

  const dbMs = Date.now() - t0
  return new Response(JSON.stringify(ret), {
    headers: { ...headers, 'Server-Timing': `d1;dur=${dbMs};desc="2 queries, 1 round-trip"` },
  })
}
