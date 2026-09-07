import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverWorkflowEngine } from '@/lib/server-engine.ts';
import { PropertyKeyNormalizer } from '@/normalizer/property-key-normalizer.ts';

const ResumeAuditRequestSchema = z.object({
  /** 质检员确认或修正后的标准材料牌号 (如 '06Cr19Ni10') */
  corrected_grade: z.string().optional(),
  /** 质检员修正后的实测数据项覆盖映射 */
  corrected_test_records: z.record(z.unknown()).optional(),
  /** 质检员确认或修正的长尾属性映射 (原始键 -> 标准属性键) */
  corrected_property_keys: z.record(z.string()).optional(),
  /** 质检员特批放行说明 */
  waiver_notes: z.string().optional(),
  /** 审核质检员姓名或工号 */
  inspector_id: z.string().optional(),
});

/**
 * ============================================================================
 * POST /api/audit/resume/[taskId]: 质检员提交人工修正数据并恢复状态机执行
 * ============================================================================
 */
export async function POST(
  request: Request,
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

    const body = await request.json();
    const parseResult = ResumeAuditRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: '人工修正数据格式校验失败',
          details: parseResult.error.errors,
        },
        { status: 400 }
      );
    }

    const correction = parseResult.data;
    const result = await serverWorkflowEngine.resumeAudit(taskId, correction);

    if (result.status !== 'failed' && correction.corrected_property_keys) {
      for (const [rawKey, targetKey] of Object.entries(correction.corrected_property_keys)) {
        if (rawKey && targetKey) {
          PropertyKeyNormalizer.registerLearnedAlias(rawKey, targetKey, undefined, undefined, true);
        }
      }
    }

    return NextResponse.json({
      success: result.status !== 'failed',
      taskId: result.taskId,
      status: result.status,
      finalReport: result.finalReport,
      hitlContext: result.hitlContext,
      error: result.error,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `恢复任务执行异常: ${message}` },
      { status: 500 }
    );
  }
}
