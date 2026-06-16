import Head from 'next/head'

import { MonitorState, MonitorTarget } from '@/types/config'
import { maintenances, pageConfig } from '@/uptime.config'
import OverallStatus from '@/components/OverallStatus'
import Header from '@/components/Header'
import MonitorList from '@/components/MonitorList'
import { Center, Text } from '@mantine/core'
import MonitorDetail from '@/components/MonitorDetail'
import Footer from '@/components/Footer'
import type { Env } from '@/worker/src'
import { loadMonitorState } from '@/worker/src/store'

export const runtime = 'edge'

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

      <main>
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

        <Footer />
      </main>
    </>
  )
}

export async function getServerSideProps() {
  const { workerConfig } = await import('@/uptime.config')
  // Build the full MonitorState directly from the normalized D1 tables.
  const state = await loadMonitorState((process.env as any as Env).UPTIMEFLARE_D1)

  // Only present these values to client
  const monitors = workerConfig.monitors.map((monitor) => {
    return {
      id: monitor.id,
      name: monitor.name,
      // @ts-ignore
      tooltip: monitor?.tooltip,
      // @ts-ignore
      statusPageLink: monitor?.statusPageLink,
      // @ts-ignore
      hideLatencyChart: monitor?.hideLatencyChart,
    }
  })

  return { props: { state, monitors } }
}
