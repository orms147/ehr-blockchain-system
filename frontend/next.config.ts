import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: Removed Cross-Origin-Opener-Policy header as it was blocking Web3Auth popup
  // Web3Auth popups need full cross-origin access

  // Hide dev indicators (error overlay, build activity)
  devIndicators: false,

  // Silence Turbopack warning (Next.js 16+)

  // Silence Turbopack warning (Next.js 16+)
  turbopack: {},

  // Webpack configuration for Node.js polyfills (Web3Auth compatibility)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
        process: false,
      };
    }
    return config;
  },
};

export default nextConfig;
