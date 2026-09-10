import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getLogs, POST as setLogLevel } from '../../src/app/api/admin/logs/route.ts';
import { GET as streamLogs } from '../../src/app/api/admin/logs/stream/route.ts';
import { logger } from '../../src/logger/index.ts';

describe('API: /api/admin/logs (系统运行日志接口契约)', () => {
  beforeEach(() => {
    logger.setLevel('info');
  });

  it('GET 应该成功返回当前日志级别与历史缓冲日志列表', async () => {
    // 预先写入一条测试日志确保缓冲池有数据
    logger.info('SYSTEM', '自动化单测预热日志');

    const req = new NextRequest('http://localhost:3000/api/admin/logs?limit=50');
    const res = await getLogs(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.currentLevel).toBeDefined();
    expect(Array.isArray(data.logs)).toBe(true);
    expect(data.logs.length).toBeGreaterThan(0);
  });

  it('GET 支持按照关键词与模块标签过滤日志', async () => {
    logger.warn('EXTRACTOR', '特殊关键词XYZ123抽取异常');

    const req = new NextRequest('http://localhost:3000/api/admin/logs?search=XYZ123&tag=EXTRACTOR');
    const res = await getLogs(req);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.logs.length).toBeGreaterThanOrEqual(1);
    expect(data.logs[0].message).toContain('XYZ123');
    expect(data.logs[0].tag).toBe('EXTRACTOR');
  });

  it('POST 传入合法级别应该成功更新当前系统日志级别', async () => {
    const originalLevel = logger.getLevel();

    const req = new NextRequest('http://localhost:3000/api/admin/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'debug' }),
    });

    const res = await setLogLevel(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.currentLevel).toBe('debug');
    expect(logger.getLevel()).toBe('debug');

    // 恢复原级别
    logger.setLevel(originalLevel);
  });

  it('POST 传入非法级别应该触发 400 防呆校验拦截', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'invalid_level' }),
    });

    const res = await setLogLevel(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('无效的日志级别参数');
  });

  it('GET /stream 端点应该返回符合 SSE 协议的标头与响应格式', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/logs/stream');
    const res = await streamLogs(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-cache');
    expect(res.headers.get('connection')).toBe('keep-alive');
    expect(res.body).toBeDefined();
  });
});
