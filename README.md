# ✔[UptimeFlare](https://github.com/lyc8503/UptimeFlare)

A free and serverless uptime monitoring & status page solution
Powered by Cloudflare Workers and Pages.

## ⭐Features

- Monitoring capabilities
  - Up to 50 checks at 1-minute intervals
  - Geo-specific checks from over [310 cities](https://www.cloudflare.com/network/) worldwide
  - Support for HTTP/HTTPS/TCP port monitoring
  - Up to 90-day uptime history and uptime percentage tracking
  - Customizable request methods, headers, and body for HTTP(s)
  - Custom status code & keyword checks for HTTP(s)
  - Downtime notification supporting [100+ notification channels](https://github.com/caronc/apprise/wiki)
  - Customizable Webhook
- Status page
  - Interactive ping (response time) chart for all types of monitors
  - Scheduled maintenances alerts & Incident history page
  - Responsive UI that adapts to your system theme
  - Customizable status page
  - Use your own domain with CNAME
  - Optional password authentication (private status page)
  - JSON API for fetching realtime status data

## MicMax Setup

### First-time setup (one time only)

The GitHub Actions deploy no longer creates the D1 database on every run. Before
the first deploy, create the database once and store its id as a secret.

1. Create the database with `npx wrangler d1 create uptimeflare_d1` and copy the
   printed `database_id` (or find it later under Dashboard → Workers & Pages → D1 →
   `uptimeflare_d1`, or via `npx wrangler d1 list`).

2. Store the id as a GitHub Actions secret so Terraform can import the existing DB:

   `gh secret set CLOUDFLARE_D1_ID --body "<the-database-id>"`

You don't need to create the tables manually — the worker's `ensureSchema()` runs
`CREATE TABLE IF NOT EXISTS` on its first scheduled tick (within ~1 minute of deploy).

### Adding Pushover
`cd worker`
`npx wrangler secret put PUSHOVER_TOKEN --name uptimeflare_worker`
`npx wrangler secret put PUSHOVER_USER_KEY --name uptimeflare_worker`

### Local development
`npm run dev` runs the status page with **sample data** — no Cloudflare bindings
needed. When the `UPTIMEFLARE_D1` binding is absent (always the case under plain
`next dev`), the data layer falls back to fixtures in `util/devData.ts` (generated
from your `uptime.config.ts` monitors), so the page, charts, incidents, and
`/api/*` endpoints all render locally. In production the binding always exists, so
fixtures never run.

## TODO

add some incidents
- power outage june 16 7am to ~12pm

hide requests from uptimeflare in cloudflare dashboards?

************ make the webpage 10kb

consider connecting worker to git repository and having cloudflare do the build?
- https://dash.cloudflare.com/26ba71d2de1bd3a5c9ce1464bd265796/workers/services/view/uptimeflare_worker/production/settings

can I compress the latency information that I request from the browser.

have the entire website be loaded and generated client side.

get away from next.js since it is so bloated for the purposes of this website.

compact the data for the webpage
- incidents
- latencies

dependency-free columnar JSON I described earlier — parallel arrays (t0 + delta-dt[], ping[], locs[] + index) — gets ~half the size with zero library, and still composes with gzip on top

generate historical latency baselines (per worker location), set expected ranges, and alert on sustained out-of-range latencies
- (avg / p95 / p99 are now shown per monitor over the display window)

add a user-facing latency time-range selector (backend already supports /api/latency?hours=)

add a build step to compress all JS and HTML and CSS, simpler classnames too, etc.

use or remove maintainances feature

server-rendering the shell

https://opennext.js.org/cloudflare/get-started#existing-nextjs-apps

popular status page.
https://www.atlassian.com/software/statuspage

include histograms for latency instead of just avg/p95/p99

cache the latency?

add telemetry to this. so i can see traces, of web requests to database, etc.
export to my grafana instance?

make the latency data cacheable on my client, so if i have already loaded a timerange, it will reuse that and request only the missing latency information

improve the visibility on the incidents modal. I see time ranges with the error, but maybe also show total time and a 24 hour diagram of the up vs down time

fix mobile view with new mean,p95,p99 and external service links, etc.

add tests to the website and worker

improve CPU usage

rewrite the worker in C++ or Rust or Golang?

massive spikes to 3000ms really make the latency chart useless since all resolution is lost for everything other than that one outlier
include a chart mode that shows a running 1m/5m/10m average, so rare spikes are obtrusive

include some kind of expected floor on latency. for example from new jersey to ottawa in a straight line there and back would take light ~3ms minimum or ~15ms to and from florida 

migrate primary d1 to ENAM?
1. Export current data: wrangler d1 export uptimeflare_d1 --remote --output=backup.sql
2. Create new DB pinned to ENAM: wrangler d1 create uptimeflare_d1_enam --location=enam
3. Import: wrangler d1 execute uptimeflare_d1_enam --remote --file=backup.sql
4. Repoint: update the CLOUDFLARE_D1_ID GitHub secret to the new id, and re-import it in the Terraform step (the bindings reference the resource, so the worker/Pages pick up the new DB on deploy).
5. Optionally drop read_replication (a local primary doesn't need it).

include a timestamp next to git hash
changes to githash are not affected if I only make changes to the worker...
