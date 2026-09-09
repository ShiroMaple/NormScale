import { NextResponse } from 'next/server';
import { PropertyKeyNormalizer } from '@/normalizer/property-key-normalizer.ts';
import { logger } from '@/logger/index.ts';

/**
 * ============================================================================
 * 自学习别名白盒管理 API 路由 (/api/admin/learned-aliases)
 * ============================================================================
 * 
 * 职责：
 * 1. GET: 读取系统中全部已沉淀的动态自学习别名列表与统计（白盒化审阅）；
 * 2. POST: 执行白盒操作（撤销误判条目、恢复条目、物理删除条目），并即时刷新内存索引与磁盘。
 * ============================================================================
 */

export async function GET() {
  try {
    const list = PropertyKeyNormalizer.listAllLearnedAliases();
    const activeCount = list.filter(item => item.status !== 'revoked').length;
    const revokedCount = list.filter(item => item.status === 'revoked').length;

    return NextResponse.json({
      success: true,
      data: {
        total: list.length,
        active_count: activeCount,
        revoked_count: revokedCount,
        aliases: list,
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('NORMALIZER', `[GET /api/admin/learned-aliases] 查询失败: ${errMsg}`);
    return NextResponse.json(
      { success: false, error: `查询自学习别名失败: ${errMsg}` },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, id } = body;

    if (!action || !id) {
      return NextResponse.json(
        { success: false, error: '缺少必需的 action 或 id 参数' },
        { status: 400 }
      );
    }

    let result = false;
    if (action === 'revoke') {
      result = PropertyKeyNormalizer.revokeLearnedAlias(id);
    } else if (action === 'restore') {
      result = PropertyKeyNormalizer.restoreLearnedAlias(id);
    } else if (action === 'delete') {
      result = PropertyKeyNormalizer.deleteLearnedAlias(id);
    } else {
      return NextResponse.json(
        { success: false, error: `不支持的操作类型: ${action}` },
        { status: 400 }
      );
    }

    if (!result) {
      return NextResponse.json(
        { success: false, error: `未找到指定的别名记录: ${id}` },
        { status: 404 }
      );
    }

    const updatedList = PropertyKeyNormalizer.listAllLearnedAliases();
    logger.info('NORMALIZER', `[POST /api/admin/learned-aliases] 成功对别名 [${id}] 执行操作: ${action}`);

    return NextResponse.json({
      success: true,
      message: `操作 [${action}] 执行成功`,
      data: {
        aliases: updatedList,
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('NORMALIZER', `[POST /api/admin/learned-aliases] 操作失败: ${errMsg}`);
    return NextResponse.json(
      { success: false, error: `执行白盒操作失败: ${errMsg}` },
      { status: 500 }
    );
  }
}
