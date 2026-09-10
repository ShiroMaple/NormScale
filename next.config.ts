import type { NextConfig } from 'next';

/**
 * ============================================================================
 * Next.js 15 全局配置文件 (Next.js App Router Configuration)
 * ============================================================================
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 允许服务器端包直接处理 Node 原生逻辑
  serverExternalPackages: ['@langchain/langgraph', '@langchain/core', 'bignumber.js'],
  webpack: (config, { dev, isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/.git/**',
          '**/node_modules/**',
          '**/.cache/**',
          '**/config.json',
          '**/.next/**',
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
