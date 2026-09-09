import { NextResponse } from 'next/server';
import { serverRuleStore } from '@/lib/server-engine.ts';

interface RouteParams {
  params: Promise<{
    standardId: string;
  }>;
}

/**
 * ============================================================================
 * GET /api/standards/[standardId]: 获取特定标准的完整元信息、全量规格切片与条文
 * ============================================================================
 */
export async function GET(_request: Request, context: RouteParams) {
  try {
    const { standardId } = await context.params;
    if (!standardId || !standardId.trim()) {
      return NextResponse.json(
        { success: false, error: '标准代号 (standardId) 不能为空' },
        { status: 400 }
      );
    }

    const decodedId = decodeURIComponent(standardId.trim());
    const standard = await serverRuleStore.getCompleteStandard(decodedId);

    if (!standard) {
      return NextResponse.json(
        { success: false, error: `未收录标准 [${decodedId}]，请核对标准代号` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: standard,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `获取标准明细失败: ${message}` },
      { status: 500 }
    );
  }
}
