// Full-featured example config is available at
// https://github.com/lyc8503/UptimeFlare/blob/main/uptime.config.full.ts

import { MaintenanceConfig, PageConfig, WorkerConfig } from './types/config'

const pageConfig: PageConfig = {
  title: "MicMax's Status",
  links: [
    { link: 'https://github.com/mic-max/uptime-flare', label: 'GitHub' },
    { link: 'mailto:yo@micmax.pw', label: 'Email Me', highlight: true },
  ],
  group: {
    '☁️ Cloud': ['micmax_pw_blog', 'maxwellmade_site', 'uptimeflare'],
    '🐝 Self-Hosted': ['cluster_test_site', 'mumble_server', 'minecraft_server', 'jellyfin_server'],
  },
}

const workerConfig: WorkerConfig = {
  monitors: [
    {
      id: 'micmax_pw_blog',
      name: 'MicMax Blog',
      method: 'GET',
      target: 'https://micmax.pw',
      statusPageLink: 'https://micmax.pw',
      statusDependency: { label: 'Obsidian Status', link: 'https://status.obsidian.md/797317757' },
      checkProxy: 'worker://enam',
      hideLatencyChart: false,
      expectedCodes: [200],
      timeout: 5000,
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
      statusDependency: { label: 'GitHub Status', link: 'https://www.githubstatus.com' },
      hideLatencyChart: false,
      expectedCodes: [200],
      timeout: 5000,
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
      hideLatencyChart: false,
      expectedCodes: [200],
      timeout: 5000,
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
      hideLatencyChart: false,
      timeout: 5000,
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
      hideLatencyChart: false,
      timeout: 5000,
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
      hideLatencyChart: false,
      expectedCodes: [200],
      timeout: 5000,
      headers: {
        'User-Agent': 'Uptimeflare',
      },
    },
    {
      id: 'uptimeflare',
      name: 'UptimeFlare',
      method: 'GET',
      target: 'https://status.micmax.pw',
      statusDependency: {
        label: 'Cloudflare Status',
        link: 'https://new.cloudflarestatus.com/services',
      },
      checkProxy: 'worker://enam',
      hideLatencyChart: false,
      expectedCodes: [200],
      timeout: 5000,
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

const maintenances: MaintenanceConfig[] = [
  {
    title: 'Power outage',
    body: 'A local power outage took the self-hosted services offline. Services were restored once power returned.',
    start: '2026-06-16T07:00:00-04:00',
    end: '2026-06-16T13:00:00-04:00',
    color: 'red',
    monitors: ['cluster_test_site', 'mumble_server', 'minecraft_server', 'jellyfin_server'],
  },
  {
    title: 'Power outage - Storm',
    body: 'A local power outage took the self-hosted services offline. Services were restored once power returned.',
    start: '2026-07-01T15:50:00-04:00',
    end: '2026-07-02T10:50:00-04:00',
    color: 'red',
    monitors: ['cluster_test_site', 'mumble_server', 'minecraft_server', 'jellyfin_server'],
  },
]

export { maintenances, pageConfig, workerConfig }
