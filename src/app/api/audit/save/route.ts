import { NextResponse } from 'next/server';
import { globalAuditLedgerService } from '@/services/audit-ledger.service.ts';
import { InspectionSession } from '@/types/session.ts';
import { logger } from '@/logger/index.ts';

/**
 * POST /api/audit/save: 将完整的质检作业结果持久化归档至服务端 .cache/audit/ 仓库
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const session = body as InspectionSession;

    if (!session || !session.sessionId) {
      return NextResponse.json(
        { success: false, error: '缺少必需的 sessionId 或会话数据' },
        { status: 400 }
      );
    }

    const saveResult = globalAuditLedgerService.saveSession(session);
    return NextResponse.json({
      success: true,
      sessionId: saveResult.sessionId,
      savedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error('REPOSITORY', `[API /api/audit/save] 保存台账接口异常: ${err.message}`);
    return NextResponse.json(
      { success: false, error: `保存台账失败: ${err.message}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/audit/save:
 * 1. 若传递 ?sessionId=...，返回该台账的完整结构化记录
 * 2. 否则返回历史台账摘要列表
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || searchParams.get('id');

    if (sessionId) {
      const record = globalAuditLedgerService.getSession(sessionId);
      if (!record) {
        return NextResponse.json(
          { success: false, error: '未找到指定会话的台账记录' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, session: record });
    }

    const list = globalAuditLedgerService.listSessions();
    return NextResponse.json({ success: true, sessions: list });
  } catch (err: any) {
    logger.error('REPOSITORY', `[API /api/audit/save] 读取台账接口异常: ${err.message}`);
    return NextResponse.json(
      { success: false, error: `读取台账失败: ${err.message}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/audit/save: 删除指定台账
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || searchParams.get('id');

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: '缺少必需的 sessionId 参数' },
        { status: 400 }
      );
    }

    const deleted = globalAuditLedgerService.deleteSession(sessionId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: '未找到指定台账记录' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, sessionId });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `删除台账失败: ${err.message}` },
      { status: 500 }
    );
  }
}
