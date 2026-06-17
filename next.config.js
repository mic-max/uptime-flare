/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tree-shake large barrel packages so only the icons/components actually used
  // end up in the bundle (cuts "unused JavaScript").
  experimental: {
    optimizePackageImports: ['@tabler/icons-react', '@mantine/core'],
  },
}

module.exports = nextConfig
