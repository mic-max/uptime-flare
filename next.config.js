const path = require('path')
const { execSync } = require('child_process')

// Build-time git commit hash, surfaced on the page. CI sets GITHUB_SHA; fall back
// to a local `git` call (e.g. for `npm run dev`).
let commitHash = (process.env.GITHUB_SHA || '').slice(0, 7)
if (!commitHash) {
  try {
    commitHash = execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    commitHash = 'unknown'
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Inlined at build time so it's available client-side as process.env.NEXT_PUBLIC_COMMIT_HASH.
  env: {
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
  },
  // Tree-shake large barrel packages so only the icons/components actually used
  // end up in the bundle (cuts "unused JavaScript").
  experimental: {
    optimizePackageImports: ['@tabler/icons-react', '@mantine/core'],
  },
  webpack(config, { webpack }) {
    // Strip Next's legacy `polyfill-module` (Array.prototype.at, Object.hasOwn,
    // String.prototype.trimStart, Object.fromEntries, URL.canParse, ...), which
    // Next inlines into main.js for all browsers regardless of browserslist. Our
    // browserslist targets only modern browsers that have these natively, so we
    // replace it with an empty module. Clears the PageSpeed "Legacy JavaScript".
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /next[\\/]dist[\\/]build[\\/]polyfills[\\/]polyfill-module/,
        path.resolve(__dirname, 'empty-module.js')
      )
    )
    return config
  },
}

module.exports = nextConfig
