// Full-featured example config is available at
// https://github.com/lyc8503/UptimeFlare/blob/main/uptime.config.full.ts

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
      checkProxy: 'worker://enam',
      hideLatencyChart: true,
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
      checkProxy: 'worker://enam',
      statusPageLink: 'https://maxwellmade.ca',
      hideLatencyChart: true,
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
      checkProxy: 'worker://enam',
      statusPageLink: 'https://site.micmax.pw',
      hideLatencyChart: true,
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
      checkProxy: 'worker://enam',
      statusPageLink: 'mumble://mumble.micmax.pw',
      hideLatencyChart: true,
      timeout: 10000,
      headers: {
        'User-Agent': 'Uptimeflare',
      },
    },
    {
      id: 'minecraft_server',
      name: 'Minecraft Server',
      method: 'TCP_PING',
      target: 'minecraft.micmax.pw:25565',
      checkProxy: 'worker://enam',
      statusPageLink: 'minecraft.micmax.pw',
      hideLatencyChart: true,
      timeout: 10000,
      headers: {
        'User-Agent': 'Uptimeflare',
      },
    },
    {
      id: 'jellyfin_server',
      name: 'Jellyfin',
      method: 'GET',
      target: 'https://jellyfin.micmax.pw',
      checkProxy: 'worker://enam',
      statusPageLink: 'https://jellyfin.micmax.pw',
      hideLatencyChart: true,
      expectedCodes: [200],
      timeout: 10000,
      headers: {
        'User-Agent': 'Uptimeflare',
      },
    },
  ],
  notification: {
    webhook: {
      url: 'https://api.pushover.net/1/messages.json',
      payloadType: 'x-www-form-urlencoded',
      payload: {
        user: process.env.PUSHOVER_USER_KEY,
        token: process.env.PUSHOVER_TOKEN,
        message: '$MSG',
      },
    },

    timeZone: 'America/Toronto',
    gracePeriod: 5,
  },
}

const maintenances: MaintenanceConfig[] = []

export { maintenances, pageConfig, workerConfig }
