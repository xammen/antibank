import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Cloudflare Pages: webpack config pour edge runtime
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      // Exclure les modules Node.js incompatibles avec edge
      config.externals.push({
        '@prisma/client': '@prisma/client',
      });
    }
    return config;
  },
  // Cloudflare Pages: exclure le cache du build output
  outputFileTracingExcludes: {
    '*': [
      'node_modules/@swc/core-linux-x64-gnu',
      'node_modules/@swc/core-linux-x64-musl',
      'node_modules/@esbuild/linux-x64',
    ],
  },
};

export default nextConfig;
