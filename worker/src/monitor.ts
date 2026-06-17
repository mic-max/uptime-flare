import { Env } from '.'
import { MonitorTarget } from '../../types/config'
import { withTimeout, fetchTimeout } from './util'

// Default per-check timeout when a monitor doesn't specify one. Shared so the
// check timeout and the "down sample = max latency" clamp in index.ts agree.
export const DEFAULT_TIMEOUT_MS = 10000

async function httpResponseBasicCheck(
  monitor: MonitorTarget,
  code: number,
  bodyReader: () => Promise<string>
): Promise<string | null> {
  if (monitor.expectedCodes) {
    if (!monitor.expectedCodes.includes(code)) {
      return `Expected codes: ${JSON.stringify(monitor.expectedCodes)}, Got: ${code}`
    }
  } else {
    if (code < 200 || code > 299) {
      return `Expected codes: 2xx, Got: ${code}`
    }
  }

  if (monitor.responseKeyword || monitor.responseForbiddenKeyword) {
    // Only read response body if we have a keyword to check
    const responseBody = await bodyReader()

    // MUST contain responseKeyword
    if (monitor.responseKeyword && !responseBody.includes(monitor.responseKeyword)) {
      console.error(
        `${monitor.name} expected keyword ${
          monitor.responseKeyword
        }, not found in response (truncated to 100 chars): ${responseBody.slice(0, 100)}`
      )
      return "HTTP response doesn't contain the configured keyword"
    }

    // MUST NOT contain responseForbiddenKeyword
    if (
      monitor.responseForbiddenKeyword &&
      responseBody.includes(monitor.responseForbiddenKeyword)
    ) {
      console.error(
        `${monitor.name} forbidden keyword ${
          monitor.responseForbiddenKeyword
        }, found in response (truncated to 100 chars): ${responseBody.slice(0, 100)}`
      )
      return 'HTTP response contains the configured forbidden keyword'
    }
  }

  return null
}

export async function getStatus(
  monitor: MonitorTarget
): Promise<{ ping: number; up: boolean; err: string }> {
  let status = {
    ping: 0,
    up: false,
    err: 'Unknown',
  }

  const startTime = Date.now()

  if (monitor.method === 'TCP_PING') {
    // TCP port endpoint monitor
    try {
      const connect = await import(/* webpackIgnore: true */ 'cloudflare:sockets').then(
        (sockets) => sockets.connect
      )
      // This is not a real https connection, but we need to add a dummy `https://` to parse the hostname & port
      const parsed = new URL('https://' + monitor.target)
      const socket = connect({ hostname: parsed.hostname, port: Number(parsed.port) })

      // Now we have an `opened` promise!
      await withTimeout(monitor.timeout || DEFAULT_TIMEOUT_MS, socket.opened)
      await socket.close()

      console.info(`${monitor.name} connected to ${monitor.target}`)

      status.ping = Date.now() - startTime
      status.up = true
      status.err = ''
    } catch (e: Error | any) {
      console.error(`${monitor.name} errored with ${e.name}: ${e.message}`)
      if (e.message.includes('timed out')) {
        status.ping = monitor.timeout || DEFAULT_TIMEOUT_MS
      }
      status.up = false
      status.err = e.name + ': ' + e.message
    }
  } else {
    // HTTP endpoint monitor
    try {
      let headers = new Headers(monitor.headers as any)
      if (!headers.has('user-agent')) {
        headers.set('user-agent', 'UptimeFlare/1.0 (+https://github.com/lyc8503/UptimeFlare)')
      }

      const response = await fetchTimeout(monitor.target, monitor.timeout || DEFAULT_TIMEOUT_MS, {
        method: monitor.method,
        headers: headers,
        body: monitor.body,
        cf: {
          cacheTtlByStatus: {
            '100-599': -1, // Don't cache any status code, from https://developers.cloudflare.com/workers/runtime-apis/request/#requestinitcfproperties
          },
        },
      })

      console.info(`${monitor.name} responded with ${response.status}`)
      status.ping = Date.now() - startTime

      const err = await httpResponseBasicCheck(monitor, response.status, response.text.bind(response))
      try {
        await response.body?.cancel()
      } catch (e) {} // Always try to cancel body, see issue #166

      if (err !== null) {
        console.error(`${monitor.name} didn't pass response check: ${err}`)
      }
      status.up = err === null
      status.err = err ?? ''
    } catch (e: any) {
      console.error(`${monitor.name} errored with ${e.name}: ${e.message}`)
      if (e.name === 'AbortError') {
        status.ping = monitor.timeout || DEFAULT_TIMEOUT_MS
        status.up = false
        status.err = `Timeout after ${status.ping}ms`
      } else {
        status.up = false
        status.err = e.name + ': ' + e.message
      }
    }
  }

  return status
}

export async function doMonitor(monitor: MonitorTarget, defaultLocation: string, env: Env) {
  let checkLocation = defaultLocation
  let status

  if (monitor.checkProxy?.startsWith('worker://')) {
    // Geo-specific check: run getStatus inside a Durable Object pinned to a region.
    try {
      console.info(`[${monitor.id}] Calling check proxy: ${monitor.checkProxy}`)
      const doLoc = monitor.checkProxy.replace('worker://', '')
      const doId = env.REMOTE_CHECKER_DO.idFromName(monitor.id)
      const doStub = env.REMOTE_CHECKER_DO.get(doId, {
        locationHint: doLoc as DurableObjectLocationHint,
      })
      // No explicit teardown: the checker holds no state, so the runtime hibernates
      // and evicts the idle instance on its own (and reuses it on the next tick).
      const resp = await doStub.getLocationAndStatus(monitor)
      checkLocation = resp.location
      status = resp.status
    } catch (err) {
      console.error(`[${monitor.id}] Error calling proxy: ${err}`)
      status = { ping: 0, up: false, err: 'Unknown check proxy error' }
    }
  } else {
    // Initiate a check from the current location.
    status = await getStatus(monitor)
  }

  console.info(
    `[${monitor.id}] Check result from ${checkLocation}: up=${status.up}, ping=${status.ping}, err=${status.err}`
  )

  return {
    location: checkLocation,
    status,
    id: monitor.id,
  }
}
