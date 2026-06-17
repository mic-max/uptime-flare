// `process.env` is provided to the Worker at runtime by the `nodejs_compat`
// compatibility flag (see deploy.tf). Only env-var access is used (e.g. the
// Pushover secrets in uptime.config.ts), so we declare just that rather than
// pulling in all of @types/node.
declare const process: { env: Record<string, string | undefined> }
