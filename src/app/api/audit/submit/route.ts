import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverWorkflowEngine } from '@/lib/server-engine.ts';
import { getPresetSamplePayload } from '@/extractor/mock-extractor.ts';

const SubmitAuditRequestSchema = z.object({
  /** 预设样本 ID (如 's30408_messy_sample', 's31603_kgf_sample') */
  sampleId: z.string().optional(),
  /** 自定义结构化原始质保书松散载荷 */
  rawPayload: z.record(z.any()).optional(),
  /** 工作台批次规格试样对象 (BatchSpecimen) */
  batchSpecimen: z.record(z.any()).optional(),
  /** 多份执行标准代号列表 (如 ['GB/T 13296-2023', 'NB/T 47019.5-2021']) */
  standardIds: z.array(z.string()).optional(),
  /** 材料牌号路由键 (如 'S32168') */
  gradeKey: z.string().optional(),
  /** 是否启用 SSE 流式渐进响应 */
  stream: z.boolean().optional(),
  /** 运行期核验配置选项 */
  options: z
    .object({
      minConfidenceThreshold: z.number().min(0).max(1).optional(),
      forcedStandardId: z.string().optional(),
      forcedStandardIds: z.array(z.string()).optional(),
      forcedGradeKey: z.string().optional(),
      skipSemanticReview: z.boolean().optional(),
      sessionId: z.string().optional(),
      batchNo: z.string().optional(),
      runId: z.string().optional(),
      contextId: z.string().optional(),
    })
    .optional(),
});
import { batchSpecimenToCertificateExtract } from '@/normalizer/specimen-adapter.ts';

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

    const { sampleId, rawPayload, batchSpecimen, standardIds, gradeKey, options, stream } = parseResult.data;

    let inputData: any;
    let effectiveOptions = options || {};

    if (batchSpecimen) {
      inputData = batchSpecimenToCertificateExtract(batchSpecimen, standardIds, gradeKey);
      effectiveOptions = {
        ...effectiveOptions,
        forcedStandardIds: standardIds || effectiveOptions.forcedStandardIds,
        forcedGradeKey: gradeKey || effectiveOptions.forcedGradeKey,
        batchNo: effectiveOptions.batchNo || (batchSpecimen.batchNo ? String(batchSpecimen.batchNo) : undefined),
      };
    } else if (sampleId) {
      const preset = getPresetSamplePayload(sampleId);
      if (!preset) {
        return NextResponse.json(
          { success: false, error: `未找到预设样本: [${sampleId}]` },
          { status: 404 }
        );
      }
      inputData = JSON.stringify(preset);
    } else if (rawPayload) {
      inputData = JSON.stringify(rawPayload);
    } else {
      return NextResponse.json(
        { success: false, error: '请求必须提供 batchSpecimen、rawPayload 结构化数据或 sampleId' },
        { status: 400 }
      );
    }

    // 若客户端要求启用 SSE 流式通信 (渐进式返回 Tier 1 大盘与后续增量/HITL)
    if (stream) {
      const encoder = new TextEncoder();
      const streamGenerator = serverWorkflowEngine.streamAudit(inputData, effectiveOptions);

      const customReadable = new ReadableStream({
        async start(controller) {
          try {
            for await (const event of streamGenerator) {
              if (request.signal.aborted) {
                controller.close();
                return;
              }
              const payload = `data: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(payload));
            }
            controller.close();
          } catch (err: unknown) {
            if (request.signal.aborted) {
              try { controller.close(); } catch { }
              return;
            }
            const errMsg = err instanceof Error ? err.message : String(err);
            const errPayload = `data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`;
            controller.enqueue(encoder.encode(errPayload));
            controller.close();
          }
        },
        cancel() {
          // 客户端主动断开连接，无需进一步处理
        },
      });

      return new Response(customReadable, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        },
      });
    }

    const result = await serverWorkflowEngine.submitAudit(inputData, effectiveOptions);

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
