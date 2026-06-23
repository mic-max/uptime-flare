import { LatencyRecord, MonitorState, MonitorTarget } from '@/types/config'
import { Accordion, Button, Card, Center, Text } from '@mantine/core'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import MonitorDetail from './MonitorDetail'
import { pageConfig } from '@/uptime.config'
import { useEffect, useState } from 'react'
import classes from '@/styles/app.module.css'

function countDownCount(state: MonitorState, ids: string[]) {
  let downCount = 0
  for (let id of ids) {
    if (state.incident[id] === undefined || state.incident[id].length === 0) {
      continue
    }

    if (state.incident[id].slice(-1)[0].end === null) {
      downCount++
    }
  }
  return downCount
}

// Group status color: all up -> excellent, all down -> down, otherwise partial.
// Reuses the shared text-color classes so every status color lives in one CSS file.
function getStatusTextClass(state: MonitorState, ids: string[]) {
  const downCount = countDownCount(state, ids)
  if (downCount === 0) return classes.textExcellent
  if (downCount === ids.length) return classes.textDown
  return classes.textFair
}

// Distinct colors assigned (in sorted order) to each check location so the same
// region always gets the same swatch in both the legend and the per-monitor dots.
const LOCATION_PALETTE = [
  '#4dabf7',
  '#82c91e',
  '#fab005',
  '#e64980',
  '#7950f2',
  '#15aabf',
  '#fd7e14',
  '#a9e34b',
]

export default function MonitorList({
  monitors,
  state,
  liveDeltas = {},
}: {
  monitors: MonitorTarget[]
  state: MonitorState
  // New latency points per monitor from the background poll (delta-append to charts).
  liveDeltas?: Record<string, LatencyRecord[]>
}) {
  const group = pageConfig.group
  const groupedMonitor = group && Object.keys(group).length > 0
  let content

  // Load expanded groups from localStorage
  const savedExpandedGroups = localStorage.getItem('expandedGroups')
  const expandedInitial = savedExpandedGroups
    ? JSON.parse(savedExpandedGroups)
    : Object.keys(group || {})
  const [expandedGroups, setExpandedGroups] = useState<string[]>(expandedInitial)
  useEffect(() => {
    localStorage.setItem('expandedGroups', JSON.stringify(expandedGroups))
  }, [expandedGroups])

  // Per-monitor chart expansion, persisted across the 5-minute auto-reloads so
  // open charts stay open. The "expand all" button drives the same state.
  const chartableIds = monitors.filter((m) => !m.hideLatencyChart).map((m) => m.id)
  const savedExpandedCharts = localStorage.getItem('expandedCharts')
  const [expandedCharts, setExpandedCharts] = useState<Record<string, boolean>>(
    savedExpandedCharts ? JSON.parse(savedExpandedCharts) : {}
  )
  useEffect(() => {
    localStorage.setItem('expandedCharts', JSON.stringify(expandedCharts))
  }, [expandedCharts])

  const toggleChart = (id: string) => setExpandedCharts((prev) => ({ ...prev, [id]: !prev[id] }))
  const setAllCharts = (expanded: boolean) =>
    setExpandedCharts(Object.fromEntries(chartableIds.map((id) => [id, expanded])))
  const allChartsExpanded = chartableIds.length > 0 && chartableIds.every((id) => expandedCharts[id])
  const noneChartsExpanded = chartableIds.every((id) => !expandedCharts[id])

  // Stable color per distinct check location (sorted) for the legend + dots.
  const distinctLocations = Array.from(
    new Set(monitors.map((m) => state.location[m.id]).filter(Boolean))
  ).sort()
  const locationColor = (loc?: string) =>
    loc ? LOCATION_PALETTE[distinctLocations.indexOf(loc) % LOCATION_PALETTE.length] : undefined

  if (groupedMonitor) {
    // Grouped monitors
    content = (
      <Accordion
        multiple
        defaultValue={Object.keys(group)}
        variant="contained"
        value={expandedGroups}
        onChange={(values) => setExpandedGroups(values)}
      >
        {Object.keys(group).map((groupName) => {
          const total = group[groupName].length
          const upCount = total - countDownCount(state, group[groupName])
          return (
            <Accordion.Item key={groupName} value={groupName}>
              <Accordion.Control>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    width: '100%',
                    alignItems: 'center',
                  }}
                >
                  <div>{groupName}</div>
                  <Text
                    fw={500}
                    className={getStatusTextClass(state, group[groupName])}
                    style={{
                      display: 'inline',
                      paddingRight: '5px',
                    }}
                    role="status"
                    aria-label={`${upCount} of ${total} operational`}
                  >
                    {upCount}/{total} Operational
                  </Text>
                </div>
              </Accordion.Control>
              <Accordion.Panel>
                {monitors
                  .filter((monitor) => group[groupName].includes(monitor.id))
                  .sort((a, b) => group[groupName].indexOf(a.id) - group[groupName].indexOf(b.id))
                  .map((monitor) => (
                    <div key={monitor.id}>
                      <Card.Section ml="xs" mr="xs">
                        <MonitorDetail
                          monitor={monitor}
                          state={state}
                          expanded={!!expandedCharts[monitor.id]}
                          onToggleChart={() => toggleChart(monitor.id)}
                          liveDelta={liveDeltas[monitor.id]}
                          location={state.location[monitor.id]}
                          locationColor={locationColor(state.location[monitor.id])}
                        />
                      </Card.Section>
                    </div>
                  ))}
              </Accordion.Panel>
            </Accordion.Item>
          )
        })}
      </Accordion>
    )
  } else {
    // Ungrouped monitors
    content = monitors.map((monitor) => (
      <div key={monitor.id}>
        <Card.Section ml="xs" mr="xs">
          <MonitorDetail
            monitor={monitor}
            state={state}
            expanded={!!expandedCharts[monitor.id]}
            onToggleChart={() => toggleChart(monitor.id)}
            liveDelta={liveDeltas[monitor.id]}
            location={state.location[monitor.id]}
            locationColor={locationColor(state.location[monitor.id])}
          />
        </Card.Section>
      </div>
    ))
  }

  return (
    <Center>
      <Card
        shadow="sm"
        padding="lg"
        radius="md"
        ml="md"
        mr="md"
        mt="xl"
        withBorder={!groupedMonitor}
        style={{ width: groupedMonitor ? '897px' : '865px' }}
      >
        {chartableIds.length > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 4,
              marginBottom: 'var(--mantine-spacing-xs)',
            }}
          >
            <Button
              variant="subtle"
              color="gray"
              size="compact-xs"
              onClick={() => setAllCharts(true)}
              disabled={allChartsExpanded}
              leftSection={<IconChevronDown size={14} />}
            >
              Expand all latency
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="compact-xs"
              onClick={() => setAllCharts(false)}
              disabled={noneChartsExpanded}
              leftSection={<IconChevronUp size={14} />}
            >
              Collapse all latency
            </Button>
          </div>
        )}
        {content}
      </Card>
    </Center>
  )
}
