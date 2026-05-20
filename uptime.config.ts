import { MaintenanceConfig, PageConfig, WorkerConfig } from './types/config'

const pageConfig: PageConfig = {
  title: "MicMax's Status",
  links: [
    { link: 'https://github.com/mic-max', label: 'GitHub' },
    { link: 'mailto:yo@micmax.pw', label: 'Email Me', highlight: true },
  ],
  // [OPTIONAL] Set the path to your favicon, default to '/favicon.png' if not specified
  // favicon: 'https://example.com/favicon.ico',
  // [OPTIONAL] Set the path to your logo, default to '/logo.svg' if not specified
  // logo: 'https://example.com/logo.svg',
  customFooter: '',
}

const workerConfig: WorkerConfig = {
  monitors: [
    {
      id: 'micmax_pw_blog',
      name: 'MicMax Blog',
      method: 'GET',
      target: 'https://micmax.pw',
      statusPageLink: 'https://micmax.pw',
      expectedCodes: [200],
      timeout: 10000,
      headers: {
        'User-Agent': 'Uptimeflare',
      },
    },
    {
      id: 'maxwellmade_site',
      name: 'Maxwell Made',
      method: 'GET',
      target: 'https://maxwellmade.ca',
      statusPageLink: 'https://maxwellmade.ca',
      expectedCodes: [200],
      timeout: 10000,
      headers: {
        'User-Agent': 'Uptimeflare',
      },
    },
    {
      id: 'cluster_test_site',
      name: 'Cluster Site',
      method: 'GET',
      target: 'https://site.micmax.pw',
      statusPageLink: 'https://site.micmax.pw',
      expectedCodes: [200],
      timeout: 10000,
      headers: {
        'User-Agent': 'Uptimeflare',
      },
    },
    {
      id: 'mumble_server',
      name: 'Mumble Server',
      method: 'TCP_PING',
      target: 'mumble.micmax.pw:64738',
      timeout: 10000,
      headers: {
        'User-Agent': 'Uptimeflare',
      },
    },
    // Example TCP Monitor
    // {
    //   id: 'test_tcp_monitor',
    //   name: 'Example TCP Monitor',
    //   // `method` should be `TCP_PING` for tcp monitors
    //   method: 'TCP_PING',
    //   // `target` should be `host:port` for tcp monitors
    //   target: '1.2.3.4:22',
    //   tooltip: 'My production server SSH',
    //   statusPageLink: 'https://example.com',
    //   timeout: 5000,
    // },
  ],
  // [Optional] Notification settings
//   notification: {
//     // [Optional] Notification webhook settings, if not specified, no notification will be sent
//     // More info at Wiki: https://github.com/lyc8503/UptimeFlare/wiki/Setup-notification
//     webhook: {
//       // [Required] webhook URL (example: Telegram Bot API)
//       url: 'https://api.telegram.org/bot123456:ABCDEF/sendMessage',
//       // [Optional] HTTP method, default to 'GET' for payloadType=param, 'POST' otherwise
//       // method: 'POST',
//       // [Optional] headers to be sent
//       // headers: {
//       //   foo: 'bar',
//       // },
//       // [Required] Specify how to encode the payload
//       // Should be one of 'param', 'json' or 'x-www-form-urlencoded'
//       // 'param': append url-encoded payload to URL search parameters
//       // 'json': POST json payload as body, set content-type header to 'application/json'
//       // 'x-www-form-urlencoded': POST url-encoded payload as body, set content-type header to 'x-www-form-urlencoded'
//       payloadType: 'x-www-form-urlencoded',
//       // [Required] payload to be sent
//       // $MSG will be replaced with the human-readable notification message
//       payload: {
//         chat_id: 12345678,
//         text: '$MSG',
//       },
//       // [Optional] timeout calling this webhook, in millisecond, default to 5000
//       timeout: 10000,
//     },
//     // [Optional] timezone used in notification messages, default to "Etc/GMT"
//     timeZone: 'Asia/Shanghai',
//     // [Optional] grace period in minutes before sending a notification
//     // notification will be sent only if the monitor is down for N continuous checks after the initial failure
//     // if not specified, notification will be sent immediately
//     gracePeriod: 5,
//   },
}

// You can define multiple maintenances here
// During maintenance, an alert will be shown at status page
// Also, related downtime notifications will be skipped (if any)
// Of course, you can leave it empty if you don't need this feature

// const maintenances: MaintenanceConfig[] = []

const maintenances: MaintenanceConfig[] = []

// Don't edit this line
export { maintenances, pageConfig, workerConfig }
