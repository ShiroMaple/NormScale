import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/logger';
import { LogLevel, LogModuleTag } from '@/logger/logger.interface';

const SetLogLevelSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error', 'silent']),
});

/**
 * GET /api/admin/logs
 * 获取系统当前日志级别与内存环形缓冲日志历史
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const levelFilter = searchParams.get('level') as LogLevel | null;
    const tagFilter = searchParams.get('tag') as LogModuleTag | null;
    const keyword = searchParams.get('search')?.trim().toLowerCase() || '';
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 100, 1), 1000) : 1000;

    const currentLevel = logger.getLevel();
    let logs = logger.getBufferedLogs();

    if (levelFilter && levelFilter !== 'silent') {
      logs = logs.filter(item => item.level.toLowerCase() === levelFilter.toLowerCase());
    }

    if (tagFilter && tagFilter !== 'SYSTEM' && tagFilter !== ('ALL' as any)) {
      logs = logs.filter(item => item.tag === tagFilter);
    }

    if (keyword) {
      logs = logs.filter(item =>
        item.message.toLowerCase().includes(keyword) ||
        item.tag.toLowerCase().includes(keyword) ||
        (item.metadata && JSON.stringify(item.metadata).toLowerCase().includes(keyword))
      );
    }

    const total = logs.length;
    const slicedLogs = logs.slice(-limit);

    return NextResponse.json({
      success: true,
      currentLevel,
      total,
      logs: slicedLogs,
    });
  } catch (error) {
    logger.error('SYSTEM', '获取系统运行日志失败', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取日志失败',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/logs
 * 动态调整系统日志输出级别
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parseResult = SetLogLevelSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: '无效的日志级别参数。可选级别: debug, info, warn, error, silent',
          details: parseResult.error.issues,
        },
        { status: 400 }
      );
    }

    const newLevel = parseResult.data.level;
    const prevLevel = logger.getLevel();
    logger.setLevel(newLevel);

    logger.info('SYSTEM', `系统运行日志输出级别由 [${prevLevel.toUpperCase()}] 动态调整为 [${newLevel.toUpperCase()}]`);

    return NextResponse.json({
      success: true,
      previousLevel: prevLevel,
      currentLevel: newLevel,
      message: `日志级别已切换为 ${newLevel}`,
    });
  } catch (error) {
    logger.error('SYSTEM', '动态更新日志级别失败', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新日志级别失败',
      },
      { status: 500 }
    );
  }
}
