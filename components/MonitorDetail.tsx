import { Button, Text, Tooltip } from '@mantine/core'
import { LatencyRecord, MonitorState, MonitorTarget } from '@/types/config'
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconChevronDown,
  IconCircleCheck,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import DetailBar from './DetailBar'
import { getStatusLevel, StatusLevel } from '@/util/color'
import classes from '@/styles/app.module.css'
import { maintenances } from '@/uptime.config'

// Code-split Chart.js into its own chunk, only loaded once a user expands a chart.
// The loading placeholder reserves the chart's exact height to avoid layout shift.
const DetailChart = dynamic(() => import('./DetailChart'), {
  ssr: false,
  loading: () => <div style={{ height: '150px' }} />,
})

// StatusLevel -> uptime-percentage text-color class (see styles/app.module.css)
const textColorClass: Record<StatusLevel, string> = {
  excellent: classes.textExcellent,
  good: classes.textGood,
  fair: classes.textFair,
  down: classes.textDown,
  noData: classes.textNoData,
}

// Keep the chart bounded to the same window the server returns (see
// LATENCY_DISPLAY_SECONDS in worker/src/store.ts) so a long session doesn't grow
// the series unbounded as deltas are appended.
const CHART_WINDOW_SECONDS = 6 * 60 * 60

export default function MonitorDetail({
  monitor,
  state,
  expanded,
  onToggleChart,
  liveDelta,
}: {
  monitor: MonitorTarget
  state: MonitorState
  // When provided, the chart's expanded state is controlled by the parent (for
  // "expand all" + localStorage persistence); otherwise it falls back to local.
  expanded?: boolean
  onToggleChart?: () => void
  // New latency points from the background poll, appended to the open chart.
  liveDelta?: LatencyRecord[]
}) {
  const [internalShow, setInternalShow] = useState(false)
  const showChart = expanded ?? internalShow
  const [latency, setLatency] = useState<LatencyRecord[] | null>(null)

  // Fetch the series the first time the chart becomes visible — covers a user
  // click and an "expanded" state restored from localStorage on (re)load.
  useEffect(() => {
    if (!showChart || latency !== null) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/latency?id=${encodeURIComponent(monitor.id)}`)
        const data: LatencyRecord[] = res.ok ? await res.json() : []
        if (!cancelled) setLatency(data)
      } catch {
        if (!cancelled) setLatency([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [showChart, latency, monitor.id])

  // Append new points delivered by the background poll. Idempotent (only points
  // newer than the last one) and trimmed to the display window.
  useEffect(() => {
    if (!liveDelta || liveDelta.length === 0) return
    setLatency((prev) => {
      if (prev === null) return prev // initial fetch (in flight) will cover these
      const lastTs = prev.length ? prev[prev.length - 1].time : 0
      const fresh = liveDelta.filter((p) => p.time > lastTs)
      if (fresh.length === 0) return prev
      const cutoff = Math.round(Date.now() / 1000) - CHART_WINDOW_SECONDS
      return [...prev, ...fresh].filter((p) => p.time >= cutoff)
    })
  }, [liveDelta])

  const toggleChart = () => (onToggleChart ? onToggleChart() : setInternalShow((v) => !v))

  if (!state.incident[monitor.id])
    return (
      <>
        <Text mt="sm" fw={700}>
          {monitor.name}
        </Text>
        <Text mt="sm" fw={700}>
          No data available, please make sure you have deployed your workers with latest config and
          check your worker status!
        </Text>
      </>
    )

  let statusIcon =
    state.incident[monitor.id].slice(-1)[0].end === null ? (
      <IconAlertCircle
        className={classes.textDown}
        style={{ width: '1.25em', height: '1.25em', marginRight: '3px' }}
      />
    ) : (
      <IconCircleCheck
        className={classes.textExcellent}
        style={{ width: '1.25em', height: '1.25em', marginRight: '3px' }}
      />
    )

  // Hide real status icon if monitor is in maintenance
  const now = new Date()
  const hasMaintenance = maintenances
    .filter((m) => now >= new Date(m.start) && (!m.end || now <= new Date(m.end)))
    .find((maintenance) => maintenance.monitors?.includes(monitor.id))
  if (hasMaintenance)
    statusIcon = (
      <IconAlertTriangle
        className={classes.textFair}
        style={{
          width: '1.25em',
          height: '1.25em',
          marginRight: '3px',
        }}
      />
    )

  let totalTime = Date.now() / 1000 - state.incident[monitor.id][0].start[0]
  let downTime = 0
  for (let incident of state.incident[monitor.id]) {
    downTime += (incident.end ?? Date.now() / 1000) - incident.start[0]
  }

  const uptimePercent = (((totalTime - downTime) / totalTime) * 100).toPrecision(4)
  const stats = state.stats[monitor.id]

  // Conditionally render monitor name with or without hyperlink based on monitor.url presence
  const monitorNameElement = (
    <Text fw={700} style={{ display: 'inline-flex', alignItems: 'center' }}>
      {monitor.statusPageLink ? (
        <a
          href={monitor.statusPageLink}
          target="_blank"
          style={{ display: 'inline-flex', alignItems: 'center', color: 'inherit' }}
        >
          {statusIcon} {monitor.name}
        </a>
      ) : (
        <>
          {statusIcon} {monitor.name}
        </>
      )}
    </Text>
  )

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 'var(--mantine-spacing-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {monitor.tooltip ? (
            <Tooltip label={monitor.tooltip}>{monitorNameElement}</Tooltip>
          ) : (
            monitorNameElement
          )}
          {monitor.statusDependency && (
            <Text
              component="a"
              href={monitor.statusDependency.link}
              target="_blank"
              size="xs"
              className={classes.muted}
              style={{ whiteSpace: 'nowrap' }}
            >
              {monitor.statusDependency.label} ↗
            </Text>
          )}
          {!monitor.hideLatencyChart && (
            <Button
              variant="subtle"
              color="gray"
              size="compact-xs"
              onClick={toggleChart}
              leftSection={
                <IconChevronDown
                  size={14}
                  style={{
                    transform: showChart ? 'rotate(180deg)' : undefined,
                    transition: 'transform 150ms ease',
                  }}
                />
              }
            >
              Latency
            </Button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {stats && (
            <Text size="xs" className={classes.muted} style={{ whiteSpace: 'nowrap' }}>
              {`avg ${stats.avg} · p95 ${stats.p95} · p99 ${stats.p99} ms`}
            </Text>
          )}
          <Text
            fw={700}
            style={{ display: 'inline' }}
            className={textColorClass[getStatusLevel(uptimePercent)]}
          >
            {`Overall: ${uptimePercent}%`}
          </Text>
        </div>
      </div>

      <DetailBar monitor={monitor} state={state} />

      {showChart &&
        !monitor.hideLatencyChart &&
        (latency === null ? (
          <div style={{ height: '150px' }} />
        ) : latency.length > 0 ? (
          <DetailChart data={latency} />
        ) : (
          <Text size="sm" className={classes.muted}>
            No latency data in the retention window.
          </Text>
        ))}
    </>
  )
}
