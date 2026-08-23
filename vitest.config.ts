import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

// 使用 Node 22 原生方法或文件读取加载 .env
if (fs.existsSync('.env')) {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile('.env');
    } catch {
      // 忽略已加载异常
    }
  }
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      LANGSMITH_TRACING: process.env.LANGSMITH_TRACING || '',
      LANGSMITH_ENDPOINT: process.env.LANGSMITH_ENDPOINT || '',
      LANGSMITH_API_KEY: process.env.LANGSMITH_API_KEY || '',
      LANGSMITH_PROJECT: process.env.LANGSMITH_PROJECT || 'NormScale',
    },
      include: ['tests/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        include: ['src/engine/**/*.ts', 'src/schemas/**/*.ts'],
        exclude: ['src/**/index.ts', 'src/**/*.d.ts'],
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
});
