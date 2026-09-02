import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverWorkflowEngine } from '@/lib/server-engine.ts';

const SubmitAuditRequestSchema = z.object({
  /** 预设样本 ID (如 's30408_messy_sample', 's31603_kgf_sample') */
  sampleId: z.string().optional(),
  /** 自定义结构化原始质保书松散载荷 */
  rawPayload: z.record(z.any()).optional(),
  /** 运行期核验配置选项 */
  options: z
    .object({
      minConfidenceThreshold: z.number().min(0).max(1).optional(),
      forcedStandardId: z.string().optional(),
      skipSemanticReview: z.boolean().optional(),
      contextId: z.string().optional(),
    })
    .optional(),
});

/**
 * ============================================================================
 * POST /api/audit/submit: 提交质保证书核验任务
 * ============================================================================
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parseResult = SubmitAuditRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: '请求参数校验失败',
          details: parseResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { sampleId, rawPayload, options } = parseResult.data;

    let inputData: any;
    if (sampleId) {
      inputData = sampleId;
    } else if (rawPayload) {
      inputData = JSON.stringify(rawPayload);
    } else {
      return NextResponse.json(
        { success: false, error: '请求必须提供 rawPayload 结构化数据或 sampleId' },
        { status: 400 }
      );
    }

    const result = await serverWorkflowEngine.submitAudit(inputData, options);

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
      { success: false, error: `任务提交执行异常: ${message}` },
      { status: 500 }
    );
  }
}
