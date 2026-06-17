import Head from 'next/head'

import { MonitorState, MonitorTarget } from '@/types/config'
import { maintenances, pageConfig } from '@/uptime.config'
import OverallStatus from '@/components/OverallStatus'
import Header from '@/components/Header'
import MonitorList from '@/components/MonitorList'
import { Center, Text } from '@mantine/core'
import MonitorDetail from '@/components/MonitorDetail'
import type { Env } from '@/worker/src'
import type { GetServerSidePropsContext } from 'next'
import { loadMonitorState } from '@/worker/src/store'

// Pages Router page rendering on the edge requires 'experimental-edge' in Next 14;
// plain 'edge' is only valid for API/route handlers (see pages/api/*).
export const runtime = 'experimental-edge'

export default function Home({
  state,
  monitors,
}: {
  state: MonitorState
  monitors: MonitorTarget[]
  tooltip?: string
  statusPageLink?: string
}) {
  // Specify monitorId in URL hash to view a specific monitor (can be used in iframe)
  const monitorId = window.location.hash.substring(1)
  if (monitorId) {
    const monitor = monitors.find((monitor) => monitor.id === monitorId)
    if (!monitor || !state) {
      return <Text fw={700}>{`Monitor with id ${monitorId} not found!`}</Text>
    }
    return (
      <div style={{ maxWidth: '810px' }}>
        <MonitorDetail monitor={monitor} state={state} />
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
            <MonitorList monitors={monitors} state={state} />
          </div>
        )}
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

  // Only present these values to client
  const monitors = workerConfig.monitors.map((monitor) => ({
    id: monitor.id,
    name: monitor.name,
    tooltip: monitor.tooltip,
    statusPageLink: monitor.statusPageLink,
    hideLatencyChart: monitor.hideLatencyChart,
  }))

  return { props: { state, monitors } }
}
