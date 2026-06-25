import Head from 'next/head'

import { LatencyRecord, MonitorState, MonitorTarget } from '@/types/config'
import { maintenances, pageConfig } from '@/uptime.config'
import OverallStatus from '@/components/OverallStatus'
import Header from '@/components/Header'
import MonitorList from '@/components/MonitorList'
import { Center, Text } from '@mantine/core'
import MonitorDetail from '@/components/MonitorDetail'
import { useEffect, useRef, useState } from 'react'
import type { Env } from '@/worker/src'
import type { GetServerSidePropsContext } from 'next'
import { loadMonitorState } from '@/worker/src/store'

// Background poll that replaces the old full-page reload: refreshes status in place
// and delta-appends latency to whatever charts are currently open.
function useLiveState(initialState: MonitorState) {
  const [state, setState] = useState(initialState)
  const [liveDeltas, setLiveDeltas] = useState<Record<string, LatencyRecord[]>>({})
  const latestTsRef = useRef(initialState.lastUpdate)

  useEffect(() => {
    // The worker cron writes new data once per WORKER_INTERVAL_S. Rather than poll
    // at a fixed cadence (and show data up to a full interval stale), we aim each
    // poll to land POLL_BUFFER_S after the next expected write — so the page
    // reflects fresh data within ~POLL_BUFFER_S of it being produced.
    //
    // Tune POLL_BUFFER_S: it must exceed the worker's run time (checks + D1 write,
    // ~a handful of seconds) to catch the new data on the first poll. Smaller =
    // fresher but more "polled too early" retries; larger = one clean poll but the
    // data shown is slightly older. Watch the worker's run duration and adjust.
    const WORKER_INTERVAL_S = 60
    const POLL_BUFFER_S = 10
    const MIN_RETRY_S = 5 // polled a bit early — try again soon
    const STALE_BACKOFF_S = 30 // data not advancing (worker delayed/down) — back off

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let staleStreak = 0

    const scheduleIn = (seconds: number) => {
      if (cancelled) return
      clearTimeout(timer)
      timer = setTimeout(poll, Math.max(1, seconds) * 1000)
    }

    const poll = async () => {
      if (document.visibilityState !== 'visible') return // paused; resumes on visibilitychange
      try {
        // Open charts are the source of truth in localStorage (see MonitorList).
        const expanded: Record<string, boolean> = JSON.parse(
          localStorage.getItem('expandedCharts') || '{}'
        )
        const openIds = Object.keys(expanded).filter((id) => expanded[id])
        const params = new URLSearchParams({ since: String(latestTsRef.current) })
        if (openIds.length) params.set('charts', openIds.join(','))

        const res = await fetch(`/api/refresh?${params.toString()}`)
        if (!res.ok || cancelled) {
          scheduleIn(MIN_RETRY_S)
          return
        }
        const data: {
          state: MonitorState
          latency: Record<string, LatencyRecord[]>
          now: number
        } = await res.json()
        if (cancelled) return

        const advanced = data.state.lastUpdate > latestTsRef.current
        latestTsRef.current = data.state.lastUpdate
        setState(data.state)
        setLiveDeltas(data.latency)

        if (advanced) {
          // Aim for POLL_BUFFER_S after the next write. Computed purely from server
          // time (lastUpdate + now), so it's immune to client clock skew.
          staleStreak = 0
          scheduleIn(data.state.lastUpdate + WORKER_INTERVAL_S + POLL_BUFFER_S - data.now)
        } else {
          // No new data yet: a couple of quick retries, then back off.
          staleStreak++
          scheduleIn(staleStreak >= 3 ? STALE_BACKOFF_S : MIN_RETRY_S)
        }
      } catch {
        scheduleIn(MIN_RETRY_S)
      }
    }

    // First poll: estimate from the client clock (only this one cycle is subject to
    // skew; every poll after locks onto server time from the response). latestTsRef
    // is seeded with the SSR lastUpdate.
    scheduleIn(
      latestTsRef.current + WORKER_INTERVAL_S + POLL_BUFFER_S - Math.round(Date.now() / 1000)
    )

    const onVisible = () => document.visibilityState === 'visible' && poll()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return { state, liveDeltas }
}

// Pages Router page rendering on the edge requires 'experimental-edge' in Next 14;
// plain 'edge' is only valid for API/route handlers (see pages/api/*).
export const runtime = 'experimental-edge'

export default function Home({
  state: initialState,
  monitors,
}: {
  state: MonitorState
  monitors: MonitorTarget[]
  tooltip?: string
  statusPageLink?: string
}) {
  const { state, liveDeltas } = useLiveState(initialState)

  // Specify monitorId in URL hash to view a specific monitor (can be used in iframe)
  const monitorId = window.location.hash.substring(1)
  if (monitorId) {
    const monitor = monitors.find((monitor) => monitor.id === monitorId)
    if (!monitor || !state) {
      return <Text fw={700}>{`Monitor with id ${monitorId} not found!`}</Text>
    }
    return (
      <div style={{ maxWidth: '810px' }}>
        <MonitorDetail monitor={monitor} state={state} liveDelta={liveDeltas[monitor.id]} />
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>{pageConfig.title}</title>
      </Head>

      <main style={{ paddingBottom: '40px' }}>
        <Header />

        {state.lastUpdate === 0 ? (
          <Center>
            <Text fw={700}>
              Monitor State is not defined now, please check your worker&apos;s status and binding!
            </Text>
          </Center>
        ) : (
          <div>
            <OverallStatus state={state} monitors={monitors} maintenances={maintenances} />
            <MonitorList monitors={monitors} state={state} liveDeltas={liveDeltas} />
          </div>
        )}

        <Center mt="xl">
          <Text
            component="a"
            href={`https://github.com/mic-max/uptime-flare/commit/${process.env.NEXT_PUBLIC_COMMIT_HASH}`}
            target="_blank"
            size="xs"
            c="dimmed"
          >
            build {process.env.NEXT_PUBLIC_COMMIT_HASH}
          </Text>
        </Center>
      </main>
    </>
  )
}

export async function getServerSideProps({ res }: GetServerSidePropsContext) {
  // The cron updates the data at most once a minute, so allow shared caches to
  // serve a recent copy for ~30s instead of doing a full D1 read on every hit.
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=30')

  const { workerConfig } = await import('@/uptime.config')
  // Build the full MonitorState from D1 — or sample data when there's no binding
  // (plain `next dev`), so the page renders locally without wrangler/D1.
  const db = (process.env as any as Env).UPTIMEFLARE_D1
  const tDb = Date.now()
  const state = db
    ? await loadMonitorState(db)
    : (await import('@/util/devData')).devMonitorState()
  const dbMs = Date.now() - tDb

  // Map raw colo codes -> friendly names server-side (dynamic import keeps the
  // large iata table out of the client's initial bundle).
  const tEnrich = Date.now()
  const { codeToCountry } = await import('@/util/iata')
  for (const id in state.location) state.location[id] = codeToCountry(state.location[id])
  const enrichMs = Date.now() - tEnrich

  // Surfaces in DevTools -> Network -> the document request -> Timing tab, so you
  // can see how much of the response is D1 vs. everything else (rendering, network).
  res.setHeader('Server-Timing', `d1;dur=${dbMs};desc="loadMonitorState", enrich;dur=${enrichMs}`)

  // Only present these values to client
  const monitors = workerConfig.monitors.map((monitor) => ({
    id: monitor.id,
    name: monitor.name,
    tooltip: monitor.tooltip,
    statusPageLink: monitor.statusPageLink,
    statusDependency: monitor.statusDependency,
    hideLatencyChart: monitor.hideLatencyChart,
  }))

  return { props: { state, monitors } }
}
