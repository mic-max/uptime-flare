import { DurableObject } from 'cloudflare:workers'
import { MonitorTarget } from '../../types/config'
import { workerConfig } from '../../uptime.config'
import { doMonitor, getStatus } from './monitor'
import { formatAndNotify, getWorkerLocation } from './util'
import {
  INCIDENT_RETENTION_SECONDS,
  LATENCY_RETENTION_SECONDS,
  deleteOldClosedIncidents,
  deleteOldLatency,
  ensureSchema,
  getFirstIncident,
  getLastIncident,
  insertIncident,
  insertLatency,
  migrateLegacyBlobIfNeeded,
  updateIncident,
} from './store'
import pLimit from 'p-limit'

export interface Env {
  REMOTE_CHECKER_DO: DurableObjectNamespace<RemoteChecker>
  UPTIMEFLARE_D1: D1Database
}

const Worker = {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const workerLocation = (await getWorkerLocation()) || 'ERROR'
    console.log(`Running scheduled event on ${workerLocation}...`)

    const db = env.UPTIMEFLARE_D1

    // Make sure the relational tables exist (self-healing for existing deployments)
    // and import the legacy compacted blob on first run after upgrading.
    await ensureSchema(db)
    await migrateLegacyBlobIfNeeded(db)

    const currentTimeSecond = Math.round(Date.now() / 1000)

    // Parallel check multiple monitors
    // Max concurrent connection is 6 limited by Cloudflare Workers, we use 5 here to be safe
    type CheckResult = { id: string; location: string; status: { ping: number; up: boolean; err: string } }
    let checkQueue: Promise<CheckResult>[] = []
    let checkResult: Record<string, CheckResult> = {};
    const limit = pLimit(5);
    for (const monitor of workerConfig.monitors) {
      checkQueue.push(limit(() => doMonitor(monitor, workerLocation, env)))
    }
    for (const result of await Promise.all(checkQueue)) {
      checkResult[result.id] = result
    }

    // Update each monitor's state based on check results
    for (const monitor of workerConfig.monitors) {
      console.log(`Processing monitor result: ${monitor.name} (${monitor.id})`)

      let monitorStatusChanged = false
      const { location: checkLocation, status } = checkResult[monitor.id]

      // Update incidents
      // Create a dummy incident to store the start time of the monitoring and simplify logic,
      // so that `lastIncident` below is never null.
      let last = await getLastIncident(db, monitor.id)
      if (last === null) {
        const dummy = { start: [currentTimeSecond], end: currentTimeSecond, error: ['dummy'] }
        last = { id: await insertIncident(db, monitor.id, dummy), incident: dummy }
      }
      let lastIncident = last.incident

      if (status.up) {
        // Current status is up
        // close existing incident if any
        if (lastIncident.end === null) {
          lastIncident.end = currentTimeSecond
          // write back the modified last incident
          await updateIncident(db, last.id, lastIncident)

          monitorStatusChanged = true
          try {
            if (
              // grace period not set OR ...
              workerConfig.notification?.gracePeriod === undefined ||
              // only when we have sent a notification for DOWN status, we will send a notification for UP status (within 30 seconds of possible drift)
              currentTimeSecond - lastIncident.start[0] >=
                (workerConfig.notification.gracePeriod + 1) * 60 - 30
            ) {
              await formatAndNotify(monitor, true, lastIncident.start[0], currentTimeSecond, 'OK')
            } else {
              console.log(
                `grace period (${workerConfig.notification?.gracePeriod}m) not met, skipping webhook UP notification for ${monitor.name}`
              )
            }

            console.log('Calling config onStatusChange callback...')
            await workerConfig.callbacks?.onStatusChange?.(
              env,
              monitor,
              true,
              lastIncident.start[0],
              currentTimeSecond,
              'OK'
            )
          } catch (e) {
            console.log('Error calling callback: ')
            console.log(e)
          }
        }
      } else {
        // Current status is down
        // open new incident if not already open
        if (lastIncident.end !== null) {
          const opened = { start: [currentTimeSecond], end: null, error: [status.err] }
          last = { id: await insertIncident(db, monitor.id, opened), incident: opened }
          lastIncident = opened
          monitorStatusChanged = true
        } else if (lastIncident.end === null && lastIncident.error.slice(-1)[0] !== status.err) {
          // append if the error message changes
          lastIncident.start.push(currentTimeSecond)
          lastIncident.error.push(status.err)

          // write back the modified last incident (start_time / start[0] is unchanged)
          await updateIncident(db, last.id, lastIncident)
          monitorStatusChanged = true
        }

        const currentIncident = lastIncident
        try {
          if (
            // monitor status changed AND...
            (monitorStatusChanged &&
              // grace period not set OR ...
              (workerConfig.notification?.gracePeriod === undefined ||
                // have sent a notification for DOWN status
                currentTimeSecond - currentIncident.start[0] >=
                  (workerConfig.notification.gracePeriod + 1) * 60 - 30)) ||
            // grace period is set AND...
            (workerConfig.notification?.gracePeriod !== undefined &&
              // grace period is met
              currentTimeSecond - currentIncident.start[0] >=
                workerConfig.notification.gracePeriod * 60 - 30 &&
              currentTimeSecond - currentIncident.start[0] <
                workerConfig.notification.gracePeriod * 60 + 30)
          ) {
            if (
              currentIncident.start[0] !== currentTimeSecond &&
              workerConfig.notification?.skipErrorChangeNotification
            ) {
              console.log(
                'Skipping notification for following error reason change due to user config'
              )
            } else {
              await formatAndNotify(
                monitor,
                false,
                currentIncident.start[0],
                currentTimeSecond,
                status.err
              )
            }
          } else {
            console.log(
              `Grace period (${workerConfig.notification
                ?.gracePeriod}m) not met or no change (currently down for ${
                currentTimeSecond - currentIncident.start[0]
              }s, changed ${monitorStatusChanged}), skipping webhook DOWN notification for ${
                monitor.name
              }`
            )
          }

          if (monitorStatusChanged) {
            console.log('Calling config onStatusChange callback...')
            await workerConfig.callbacks?.onStatusChange?.(
              env,
              monitor,
              false,
              currentIncident.start[0],
              currentTimeSecond,
              status.err
            )
          }
        } catch (e) {
          console.log('Error calling callback: ')
          console.log(e)
        }

        try {
          console.log('Calling config onIncident callback...')
          await workerConfig.callbacks?.onIncident?.(
            env,
            monitor,
            currentIncident.start[0],
            currentTimeSecond,
            status.err
          )
        } catch (e) {
          console.log('Error calling callback: ')
          console.log(e)
        }
      }

      // append to latency data (one row per check; no cooldown, so no samples are dropped)
      await insertLatency(db, monitor.id, {
        loc: checkLocation,
        ping: status.ping,
        time: currentTimeSecond,
      })

      // discard old latency data outside the retention window
      await deleteOldLatency(db, monitor.id, currentTimeSecond - LATENCY_RETENTION_SECONDS)

      // discard old (closed) incidents outside the retention window
      await deleteOldClosedIncidents(db, monitor.id, currentTimeSecond - INCIDENT_RETENTION_SECONDS)

      // re-anchor the dummy incident so the 90-day bar always spans the full window
      const incidentCutoff = currentTimeSecond - INCIDENT_RETENTION_SECONDS
      const first = await getFirstIncident(db, monitor.id)
      if (
        first === null ||
        (first.incident.start[0] > incidentCutoff && first.incident.error[0] != 'dummy')
      ) {
        // put the dummy anchor incident back at the start of the window
        await insertIncident(db, monitor.id, {
          start: [incidentCutoff],
          end: incidentCutoff,
          error: ['dummy'],
        })
      }
    }
  },
}

export default Worker

export class RemoteChecker extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  async getLocationAndStatus(
    monitor: MonitorTarget
  ): Promise<{ location: string; status: { ping: number; up: boolean; err: string } }> {
    const colo = (await getWorkerLocation()) as string
    console.log(`Running remote checker (DurableObject) at ${colo}...`)
    const status = await getStatus(monitor)
    return {
      location: colo,
      status: status,
    }
  }

  async kill() {
    // Throwing an error in `blockConcurrencyWhile` will terminate the Durable Object instance
    // https://developers.cloudflare.com/durable-objects/api/state/#blockconcurrencywhile
    this.ctx.blockConcurrencyWhile(async () => {
      throw 'killed'
    })
  }
}
