import Head from 'next/head'

import { MaintenanceConfig, MonitorTarget } from '@/types/config'
import { maintenances, pageConfig } from '@/uptime.config'
import Header from '@/components/Header'
import { Box, Center, Container, Group, Select } from '@mantine/core'
import { useState } from 'react'
import MaintenanceAlert from '@/components/MaintenanceAlert'
import NoIncidentsAlert from '@/components/NoIncidents'
import type { GetServerSidePropsContext } from 'next'

// Pages Router page rendering on the edge requires 'experimental-edge' in Next 14;
// plain 'edge' is only valid for API/route handlers (see pages/api/*).
export const runtime = 'experimental-edge'

// All incidents, newest first, with monitor ids resolved to monitor objects.
function resolveIncidents(
  incidents: MaintenanceConfig[],
  monitors: MonitorTarget[]
): (Omit<MaintenanceConfig, 'monitors'> & { monitors: MonitorTarget[] })[] {
  return incidents
    .map((e) => ({
      ...e,
      monitors: (e.monitors || []).map((id) => monitors.find((mon) => mon.id === id)!),
    }))
    .sort((a, b) => (new Date(a.start) > new Date(b.start) ? -1 : 1))
}

export default function IncidentsPage({ monitors }: { monitors: MonitorTarget[] }) {
  const [selectedMonitor, setSelectedMonitor] = useState<string | null>('')

  const allIncidents = resolveIncidents(maintenances, monitors)
  const shownIncidents = selectedMonitor
    ? allIncidents.filter((i) => i.monitors.find((e) => e.id === selectedMonitor))
    : allIncidents

  const monitorOptions = [
    { value: '', label: 'All' },
    ...monitors.map((monitor) => ({
      value: monitor.id,
      label: monitor.name,
    })),
  ]

  return (
    <>
      <Head>
        <title>{pageConfig.title}</title>
      </Head>

      <main style={{ paddingBottom: '40px' }}>
        <Header
          style={{
            marginBottom: '40px',
          }}
        />
        <Center>
          <Container size="md" style={{ width: '100%' }}>
            <Group justify="end" mb="md">
              <Select
                placeholder={'Select monitor'}
                data={monitorOptions}
                value={selectedMonitor}
                onChange={setSelectedMonitor}
                clearable
                style={{ maxWidth: 300 }}
              />
            </Group>
            <Box>
              {shownIncidents.length === 0 ? (
                <NoIncidentsAlert />
              ) : (
                shownIncidents.map((incident, i) => (
                  <MaintenanceAlert key={i} maintenance={incident} />
                ))
              )}
            </Box>
          </Container>
        </Center>
      </main>
    </>
  )
}

export async function getServerSideProps({ res }: GetServerSidePropsContext) {
  // This page is built purely from static config, so it can be cached longer.
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300')

  const { workerConfig } = await import('@/uptime.config')
  // Only present these values to client
  const monitors: MonitorTarget[] = workerConfig.monitors.map((monitor) => ({
    id: monitor.id,
    name: monitor.name,
  })) as MonitorTarget[]
  return { props: { monitors } }
}
