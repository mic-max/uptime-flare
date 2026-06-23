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
    let cancelled = false
    const poll = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        // Open charts are the source of truth in localStorage (see MonitorList).
        const expanded: Record<string, boolean> = JSON.parse(
          localStorage.getItem('expandedCharts') || '{}'
        )
        const openIds = Object.keys(expanded).filter((id) => expanded[id])
        const params = new URLSearchParams({ since: String(latestTsRef.current) })
        if (openIds.length) params.set('charts', openIds.join(','))

        const res = await fetch(`/api/refresh?${params.toString()}`)
        if (!res.ok || cancelled) return
        const data: { state: MonitorState; latency: Record<string, LatencyRecord[]> } =
          await res.json()
        if (cancelled) return
        latestTsRef.current = data.state.lastUpdate
        setState(data.state)
        setLiveDeltas(data.latency)
      } catch {
        /* transient network error — try again next tick */
      }
    }

    const interval = setInterval(poll, 60_000)
    // Catch up immediately when the tab regains focus after being hidden.
    const onVisible = () => document.visibilityState === 'visible' && poll()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
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
  // Build the full MonitorState directly from the normalized D1 tables.
  const state = await loadMonitorState((process.env as any as Env).UPTIMEFLARE_D1)

  // Map raw colo codes -> friendly names server-side (dynamic import keeps the
  // large iata table out of the client's initial bundle).
  const { codeToCountry } = await import('@/util/iata')
  for (const id in state.location) state.location[id] = codeToCountry(state.location[id])

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
