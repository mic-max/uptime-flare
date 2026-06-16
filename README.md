# ✔[UptimeFlare](https://github.com/lyc8503/UptimeFlare)

A more advanced, serverless, and free uptime monitoring & status page solution, powered by Cloudflare Workers, complete with a user-friendly interface.

📢 **[[SECURITY ADVISORY](https://github.com/lyc8503/UptimeFlare/security/advisories/GHSA-36q9-v7p3-vj6v) 2026/03/04]** A vulnerability (CVE-2026-29779) that could expose monitor configuration and credentials in `uptime.config.ts` to clients was fixed. Versions between 2025-09-21 (from commit `41257c6`) and 2026-03-04 are affected. **Affected users are strongly advised to upgrade to the latest version.**

🎉 **[UPDATE 2026/01/03]** I have just migrated UptimeFlare from KV to D1 Database. I also updated the Terraform Cloudflare provider to v5 and improved the deployment process. The data structure has been optimized to resolve long-standing performance issues.

New users can deploy directly, while existing users can have a simple auto migration process (upgrade docs below)! Feel free to open an issue if you run into any trouble deploying.

## ⭐Features

- Open-source, easy to deploy (in under 10 minutes, no local tools required), and free
- Monitoring capabilities
  - Up to 50 checks at 1-minute intervals
  - Geo-specific checks from over [310 cities](https://www.cloudflare.com/network/) worldwide
  - Support for HTTP/HTTPS/TCP port monitoring
  - Up to 90-day uptime history and uptime percentage tracking
  - Customizable request methods, headers, and body for HTTP(s)
  - Custom status code & keyword checks for HTTP(s)
  - Downtime notification supporting [100+ notification channels](https://github.com/caronc/apprise/wiki)
  - Customizable Webhook
  - Multi-language support (English/Chinese)
- Status page
  - Interactive ping (response time) chart for all types of monitors
  - Scheduled maintenances alerts & Incident history page
  - Responsive UI that adapts to your system theme
  - Customizable status page
  - Use your own domain with CNAME
  - Optional password authentication (private status page)
  - JSON API for fetching realtime status data

## 👀Demo

My status page: https://status.micmax.pw

## ⚡Quickstart / 📄Documentation

Please refer to [Wiki](https://github.com/lyc8503/UptimeFlare/wiki)

## 🚀Upgrade existing deployments

Get the latest features right away with [simple upgrade process](https://github.com/lyc8503/UptimeFlare/wiki/Synchronize-updates-from-upstream)

## ⚙️Docs for developer

To contribute new features or customize your deployment furthermore, see [here](https://github.com/lyc8503/UptimeFlare/wiki/How-to-develop).

## New features (TODOs)

- [x] Specify region for monitors
- [x] TCP `opened` promise
- [x] Use apprise to support various notification channels
- [x] ~~Telegram example~~
- [x] ~~[Bark](https://bark.day.app) example~~
- [x] ~~Email notification via Cloudflare Email Workers~~
- [x] Improve docs by providing simple examples
- [x] Notification grace period
- [ ] SSL certificate checks
- [x] ~~Self-host Dockerfile~~
- [x] Incident history
- [x] Improve `checkLocationWorkerRoute` and fix possible `proxy failed`
- [x] Groups
- [x] Remove old incidents
- [x] ~~Known issue~~: `fetch` doesn't support non-standard port (resolved after CF update)
- [x] Compatibility date update
- [x] Scheduled Maintenance
- [x] Add docs for dev
- [x] Migration to Terraform Cloudflare provider version 5.x
- [x] Cloudflare D1 database
- [x] Scheduled maintenances (via IIFE)
- [x] Simpler config example
- [x] Upcoming maintenances
- [x] Universal Webhook upgrade
- [x] i18n...? (maybe)
- [ ] ICMP via proxy?
- [x] Add default UA
- [x] Customizable footer
- [x] New header logo
- [x] Improve CPU time usage
- [x] Local deployment (docs WIP)

## MicMax Setup

### First-time setup (one time only)

The GitHub Actions deploy no longer creates the D1 database on every run. Before
the first deploy, create the database once and store its id as a secret.

1. Create the database (pick one):
   - `npx wrangler d1 create uptimeflare_d1`, then copy the printed `database_id`, **or**
   - run `python deploy/init_d1.py` with `CLOUDFLARE_API_TOKEN` and
     `CLOUDFLARE_ACCOUNT_ID` set — it creates the DB, prints the id, and creates the tables.

   You can also find the id later under Dashboard → Workers & Pages → D1 →
   `uptimeflare_d1`, or via `npx wrangler d1 list`.

2. Store the id as a GitHub Actions secret so Terraform can import the existing DB:

   `gh secret set CLOUDFLARE_D1_ID --body "<the-database-id>"`

You don't need to create the tables manually — the worker's `ensureSchema()` runs
`CREATE TABLE IF NOT EXISTS` on its first scheduled tick (within ~1 minute of deploy).

### Adding Pushover
`cd worker`
`npx wrangler secret put PUSHOVER_TOKEN --name uptimeflare_worker`
`npx wrangler secret put PUSHOVER_USER_KEY --name uptimeflare_worker`
