import { NextRequest } from 'next/server'
import type { Env } from '@/worker/src'
import { getLastIncident } from '@/worker/src/store'

export const runtime = 'edge'

type BadgePayload = {
  schemaVersion: 1
  label: string
  message: string
  color: string
  isError?: boolean
}

const jsonHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
}

function errorBadge(label: string, message: string): BadgePayload {
  return {
    schemaVersion: 1,
    label,
    message,
    color: 'lightgrey',
    isError: true,
  }
}

export default async function handler(req: NextRequest): Promise<Response> {
  try {
    const url = new URL(req.url)

    const monitorId = url.searchParams.get('id')
    const label = url.searchParams.get('label') ?? monitorId ?? 'UptimeFlare'

    const upMsg = url.searchParams.get('up') ?? 'UP'
    const downMsg = url.searchParams.get('down') ?? 'DOWN'
    const colorUp = url.searchParams.get('colorUp') ?? 'brightgreen'
    const colorDown = url.searchParams.get('colorDown') ?? 'red'

    if (!monitorId) {
      return new Response(JSON.stringify(errorBadge(label, 'no-monitor')), {
        headers: jsonHeaders,
        status: 400,
      })
    }

    const db = (process.env as any as Env).UPTIMEFLARE_D1
    const last = await getLastIncident(db, monitorId)

    if (last === null) {
      return new Response(JSON.stringify(errorBadge(label, 'no-data')), {
        headers: jsonHeaders,
        status: 404,
      })
    }

    const isUp = last.incident.end !== null

    const badge: BadgePayload = {
      schemaVersion: 1,
      label,
      message: isUp ? upMsg : downMsg,
      color: isUp ? colorUp : colorDown,
    }

    return new Response(JSON.stringify(badge), {
      headers: jsonHeaders,
    })
  } catch (err) {
    console.error('Error rendering badge API:', err)
    return new Response(JSON.stringify(errorBadge('status', 'error')), {
      headers: jsonHeaders,
      status: 500,
    })
  }
}
