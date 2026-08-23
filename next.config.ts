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
};

export default nextConfig;
