const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
