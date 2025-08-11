import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_PUBLIC_IGNORE_BUILD_ERROR === "true",
  },
  async rewrites() {
    const ponderPort = process.env.PONDER_PORT || "42069";
    const ponderHost = process.env.PONDER_HOST || "localhost";
    return [
      {
        source: "/ponder/:path*",
        destination: `http://${ponderHost}:${ponderPort}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/ponder/live/data",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          // prevent intermediary proxies from buffering SSE
          { key: "X-Accel-Buffering", value: "no" },
          // reinforce SSE response type; origin already sets this
          { key: "Content-Type", value: "text/event-stream" },
          // keep connection open for streaming
          { key: "Connection", value: "keep-alive" },
        ],
      },
    ];
  },
  webpack: config => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

const isIpfs = process.env.NEXT_PUBLIC_IPFS_BUILD === "true";

if (isIpfs) {
  nextConfig.output = "export";
  nextConfig.trailingSlash = true;
  nextConfig.images = {
    unoptimized: true,
  };
}

module.exports = nextConfig;
