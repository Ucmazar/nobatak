import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { minimumCacheTTL: 14400 },
  async headers() {
    return [{ source: '/logo-transparent.png', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=604800' }] }];
  },
};

export default nextConfig;
