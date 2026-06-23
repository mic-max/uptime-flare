import { MaintenanceConfig, MonitorTarget } from '@/types/config'
import { Center, Container, Title, Collapse, Button, Box } from '@mantine/core'
import { IconCircleCheck, IconAlertCircle, IconPlus, IconMinus } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import MaintenanceAlert from './MaintenanceAlert'
import { pageConfig } from '@/uptime.config'
import classes from '@/styles/app.module.css'

export default function OverallStatus({
  state,
  maintenances,
  monitors,
}: {
  state: { overallUp: number; overallDown: number; lastUpdate: number }
  maintenances: MaintenanceConfig[]
  monitors: MonitorTarget[]
}) {
  let group = pageConfig.group
  let groupedMonitor = (group && Object.keys(group).length > 0) || false

  let statusString = ''
  let icon = <IconAlertCircle className={classes.textDown} style={{ width: 64, height: 64 }} />
  if (state.overallUp === 0 && state.overallDown === 0) {
    statusString = 'No data yet'
  } else if (state.overallUp === 0) {
    statusString = 'All systems not operational'
  } else if (state.overallDown === 0) {
    statusString = 'All systems operational'
    icon = <IconCircleCheck className={classes.textExcellent} style={{ width: 64, height: 64 }} />
  } else {
    statusString = `Some systems not operational (${state.overallDown} out of ${
      state.overallUp + state.overallDown
    })`
  }

  const [currentTime, setCurrentTime] = useState(Math.round(Date.now() / 1000))
  const [expandUpcoming, setExpandUpcoming] = useState(false)

  // Tick the clock so the "last updated X sec ago" label stays current between
  // background polls (the page no longer reloads — see useLiveState in index.tsx).
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Math.round(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  const now = new Date()

  const activeMaintenances: (Omit<MaintenanceConfig, 'monitors'> & {
    monitors?: MonitorTarget[]
  })[] = maintenances
    .filter((m) => now >= new Date(m.start) && (!m.end || now <= new Date(m.end)))
    .map((maintenance) => ({
      ...maintenance,
      monitors: maintenance.monitors?.map(
        (monitorId) => monitors.find((mon) => monitorId === mon.id)!
      ),
    }))

  const upcomingMaintenances: (Omit<MaintenanceConfig, 'monitors'> & {
    monitors?: (MonitorTarget | undefined)[]
  })[] = maintenances
    .filter((m) => now < new Date(m.start))
    .map((maintenance) => ({
      ...maintenance,
      monitors: maintenance.monitors?.map(
        (monitorId) => monitors.find((mon) => monitorId === mon.id)!
      ),
    }))

  return (
    <Container size="md" mt="xl">
      <Center>{icon}</Center>
      <Title mt="sm" style={{ textAlign: 'center' }} order={1}>
        {statusString}
      </Title>
      <Title mt="sm" className={classes.muted} style={{ textAlign: 'center' }} order={2}>
        {`Last updated on: ${new Date(state.lastUpdate * 1000).toLocaleString()} (${
          currentTime - state.lastUpdate
        } sec ago)`}
      </Title>

      {/* Upcoming Maintenance */}
      {upcomingMaintenances.length > 0 && (
        <>
          <Title mt="4px" className={classes.muted} style={{ textAlign: 'center' }} order={2}>
            {`${upcomingMaintenances.length} upcoming maintenance${
              upcomingMaintenances.length === 1 ? '' : 's'
            }`}{' '}
            <span
              style={{ textDecoration: 'underline', cursor: 'pointer' }}
              onClick={() => setExpandUpcoming(!expandUpcoming)}
            >
              {expandUpcoming ? '[Hide]' : '[Show]'}
            </span>
          </Title>

          <Collapse expanded={expandUpcoming}>
            {upcomingMaintenances.map((maintenance, idx) => (
              <MaintenanceAlert
                key={`upcoming-${idx}`}
                maintenance={maintenance}
                style={{ maxWidth: groupedMonitor ? '897px' : '865px' }}
                upcoming
              />
            ))}
          </Collapse>
        </>
      )}

      {/* Active Maintenance */}
      {activeMaintenances.map((maintenance, idx) => (
        <MaintenanceAlert
          key={`active-${idx}`}
          maintenance={maintenance}
          style={{ maxWidth: groupedMonitor ? '897px' : '865px' }}
        />
      ))}
    </Container>
  )
}
