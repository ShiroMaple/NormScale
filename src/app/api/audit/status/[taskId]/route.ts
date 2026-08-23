import { NextResponse } from 'next/server';
import { serverWorkflowEngine } from '@/lib/server-engine.ts';

/**
 * ============================================================================
 * GET /api/audit/status/[taskId]: 查询指定任务的状态机快照
 * ============================================================================
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    // Next.js 15 强制要求 await 动态路由参数
    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: '缺少 taskId 参数' },
        { status: 400 }
      );
    }

    const state = await serverWorkflowEngine.getTaskState(taskId);

    if (!state) {
      return NextResponse.json(
        { success: false, error: `未找到任务 [${taskId}] 的状态快照` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      taskId,
      workflowStatus: state.workflowStatus,
      hasHitlContext: !!state.hitlContext,
      hitlContext: state.hitlContext,
      hasFinalReport: !!state.finalReport,
      finalReport: state.finalReport,
      error: state.error,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `查询任务状态异常: ${message}` },
      { status: 500 }
    );
  }
}
