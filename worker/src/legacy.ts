// Legacy compacted-blob state reader.
//
// Before the relational D1 migration, the entire monitor state (all incidents +
// latency for every monitor) was serialized into a single `uptimeflare` row under
// key='state' using the columnar/hex-packed `MonitorStateCompacted` format.
//
// This file exists ONLY to read that legacy blob during the one-time migration to
// the normalized `incident` / `latency` tables (see store.ts:migrateLegacyBlobIfNeeded).
// Nothing should write the compacted format anymore.

import { MonitorState, MonitorStateCompacted } from '../../types/config'

export async function getLegacyBlob(db: D1Database): Promise<string | null> {
  try {
    const result = await db
      .prepare('SELECT value FROM uptimeflare WHERE key = ?')
      .bind('state')
      .first<{ value: string }>()
    return result?.value || null
  } catch (e) {
    // The legacy `uptimeflare` table may not exist on fresh installs.
    return null
  }
}

export class LegacyCompactedState {
  data: MonitorStateCompacted

  constructor(compactedStateStr: string) {
    this.data = JSON.parse(compactedStateStr)
  }

  // Expand the compacted columnar format back into the plain MonitorState shape.
  uncompact(): MonitorState {
    const state: MonitorState = {
      lastUpdate: this.data.lastUpdate,
      overallUp: this.data.overallUp,
      overallDown: this.data.overallDown,
      incident: {},
      latency: {},
    }

    const hex2Uint8Arr = (hex: string): Uint8Array => {
      // @ts-expect-error Uint8Array.fromHex is available in the Workers runtime
      return Uint8Array.fromHex(hex)
    }

    Object.keys(this.data.incident).forEach((monitorId) => {
      state.incident[monitorId] = []
      const incidents = this.data.incident[monitorId]

      if (
        incidents.start.length !== incidents.end.length ||
        incidents.start.length !== incidents.error.length
      ) {
        throw new Error('Inconsistent legacy incident data lengths during migration')
      }

      for (let i = 0; i < incidents.start.length; i++) {
        state.incident[monitorId].push({
          start: incidents.start[i],
          end: incidents.end[i],
          error: incidents.error[i],
        })
      }
    })

    Object.keys(this.data.latency).forEach((monitorId) => {
      state.latency[monitorId] = []
      const latencies = this.data.latency[monitorId]
      const locUncompacted: string[] = []
      latencies.loc.c.forEach((count, index) => {
        for (let i = 0; i < count; i++) {
          locUncompacted.push(latencies.loc.v[index])
        }
      })

      const timeArr = new Uint32Array(hex2Uint8Arr(latencies.time).buffer)
      const pingArr = new Uint16Array(hex2Uint8Arr(latencies.ping).buffer)

      if (timeArr.length !== pingArr.length || timeArr.length !== locUncompacted.length) {
        throw new Error('Inconsistent legacy latency data lengths during migration')
      }

      for (let i = 0; i < timeArr.length; i++) {
        state.latency[monitorId].push({
          time: timeArr[i],
          ping: pingArr[i],
          loc: locUncompacted[i],
        })
      }
    })

    return state
  }
}
