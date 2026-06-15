import { maintenances, workerConfig } from '@/uptime.config'
import { NextRequest } from 'next/server'
import type { Env } from '@/worker/src'
import { getLastIncident, getLastLatency, getLastUpdate } from '@/worker/src/store'

export const runtime = 'edge'

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req: NextRequest): Promise<Response> {
  const db = (process.env as any as Env).UPTIMEFLARE_D1

  const lastUpdate = await getLastUpdate(db)
  if (lastUpdate === 0) {
    return new Response(JSON.stringify({ error: 'No data available' }), {
      status: 500,
      headers,
    })
  }

  let monitors: any = {}
  let overallUp = 0
  let overallDown = 0

  for (let monitor of workerConfig.monitors) {
    const last = await getLastIncident(db, monitor.id)
    const latency = await getLastLatency(db, monitor.id)

    const isUp = last !== null && last.incident.end !== null
    if (last !== null) {
      isUp ? overallUp++ : overallDown++
    }

    monitors[monitor.id] = {
      up: isUp,
      latency: latency?.ping ?? 0,
      location: latency?.loc ?? '',
      message: isUp ? 'OK' : last?.incident.error[last.incident.error.length - 1] ?? 'No data',
    }
  }

  let ret = {
    up: overallUp,
    down: overallDown,
    updatedAt: lastUpdate,
    monitors,
    maintenances,
  }

  return new Response(JSON.stringify(ret), {
    headers,
  })
}
