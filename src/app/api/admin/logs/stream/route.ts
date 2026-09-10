import { NextRequest } from 'next/server';
import { logger } from '@/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/logs/stream
 * Server-Sent Events (SSE) 实时系统运行日志流式推送端点
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeatInterval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 1. 发送连接成功握手帧
      const initialPayload = JSON.stringify({
        status: 'connected',
        timestamp: new Date().toISOString(),
        level: logger.getLevel(),
      });
      controller.enqueue(encoder.encode(`event: connected\ndata: ${initialPayload}\n\n`));

      // 2. 订阅全局日志事件广播
      unsubscribe = logger.subscribe(event => {
        try {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch {
          // 客户端断开流时可能无法写入，属于正常生命周期
        }
      });

      // 3. 心跳保活 (每 20 秒发送一次注释帧，防止网关或反向代理自动挂断)
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`));
        } catch {
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 20000);
    },
    cancel() {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  // 监听客户端主动中断断开
  request.signal.addEventListener('abort', () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // 禁用 Nginx 缓冲
    },
  });
}
