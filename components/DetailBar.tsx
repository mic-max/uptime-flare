import { MonitorState, MonitorTarget } from '@/types/config'
import { getStatusLevel, StatusLevel } from '@/util/color'
import classes from '@/styles/app.module.css'
import { Box, Modal } from '@mantine/core'
import { useState } from 'react'

// Human-readable duration like "2 hours 30 minutes" (replaces moment.preciseDiff).
function humanizeDuration(totalSeconds: number): string {
  const units: [number, string][] = [
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ]
  let remaining = Math.round(totalSeconds)
  const parts: string[] = []
  for (const [size, name] of units) {
    const value = Math.floor(remaining / size)
    if (value > 0) {
      parts.push(`${value} ${name}${value === 1 ? '' : 's'}`)
      remaining -= value * size
    }
  }
  return parts.length > 0 ? parts.join(' ') : '0 seconds'
}

// StatusLevel -> day-pill background class (see styles/app.module.css)
const barColorClass: Record<StatusLevel, string> = {
  excellent: classes.barExcellent,
  good: classes.barGood,
  fair: classes.barFair,
  down: classes.barDown,
  noData: classes.barNoData,
}

export default function DetailBar({
  monitor,
  state,
}: {
  monitor: MonitorTarget
  state: MonitorState
}) {
  const [modalOpened, setModalOpened] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modelContent, setModelContent] = useState(<div />)

  const overlapLen = (x1: number, x2: number, y1: number, y2: number) => {
    return Math.max(0, Math.min(x2, y2) - Math.max(x1, y1))
  }

  const uptimePercentBars = []

  const currentTime = Math.round(Date.now() / 1000)
  const montiorStartTime = state.incident[monitor.id][0].start[0]

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  for (let i = 89; i >= 0; i--) {
    const dayStart = Math.round(todayStart.getTime() / 1000) - i * 86400
    const dayEnd = dayStart + 86400

    const dayMonitorTime = overlapLen(dayStart, dayEnd, montiorStartTime, currentTime)
    let dayDownTime = 0

    let incidentReasons: string[] = []

    for (let incident of state.incident[monitor.id]) {
      const incidentStart = incident.start[0]
      const incidentEnd = incident.end ?? currentTime

      const overlap = overlapLen(dayStart, dayEnd, incidentStart, incidentEnd)
      dayDownTime += overlap

      // Incident history for the day
      if (overlap > 0) {
        for (let j = 0; j < incident.error.length; j++) {
          let partStart = incident.start[j]
          let partEnd =
            j === incident.error.length - 1 ? incident.end ?? currentTime : incident.start[j + 1]
          partStart = Math.max(partStart, dayStart)
          partEnd = Math.min(partEnd, dayEnd)

          if (overlapLen(dayStart, dayEnd, partStart, partEnd) > 0) {
            const startStr = new Date(partStart * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
            const endStr = new Date(partEnd * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
            incidentReasons.push(`[${startStr}-${endStr}] ${incident.error[j]}`)
          }
        }
      }
    }

    const dayPercent = (((dayMonitorTime - dayDownTime) / dayMonitorTime) * 100).toPrecision(4)
    const dateStr = new Date(dayStart * 1000).toLocaleDateString()
    const isNoData = Number.isNaN(Number(dayPercent))

    // A day with any downtime at all is never "excellent" — even one small
    // incident downgrades it to "good" (uses real downtime, not the rounded %).
    let level = getStatusLevel(dayPercent)
    if (level === 'excellent' && dayDownTime > 0) level = 'good'

    // Native title tooltip (no per-pill Mantine Tooltip component -> far less main-thread work).
    const title = isNoData
      ? 'No Data'
      : `${dayPercent}% at ${dateStr}` +
        (dayDownTime > 0 ? `\nDown for ${humanizeDuration(dayDownTime)} (click for detail)` : '')

    // Only attach a click handler to days that actually had downtime.
    const onClick =
      dayDownTime > 0
        ? () => {
            setModalTitle(`🚨 ${monitor.name} incidents at ${dateStr}`)
            setModelContent(
              <>
                {incidentReasons.map((reason, index) => (
                  <div key={index}>{reason}</div>
                ))}
              </>
            )
            setModalOpened(true)
          }
        : undefined

    uptimePercentBars.push(
      <div
        key={i}
        className={`${classes.bar} ${barColorClass[level]}`}
        title={title}
        onClick={onClick}
        style={onClick ? { cursor: 'pointer' } : undefined}
      />
    )
  }

  return (
    <>
      <Modal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title={modalTitle}
        size={'40em'}
      >
        {modelContent}
      </Modal>
      {/* Fixed height + overflow keeps the row from shifting layout as it renders;
          all 90 bars are shown immediately, oldest clipping off the left on narrow
          screens (newest stay visible via flex-end). */}
      <Box
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          justifyContent: 'flex-end',
          overflow: 'hidden',
          height: '20px',
          marginTop: '10px',
          marginBottom: '5px',
        }}
        visibleFrom="540"
      >
        {uptimePercentBars}
      </Box>
    </>
  )
}
