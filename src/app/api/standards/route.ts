import { NextResponse } from 'next/server';
import { serverRuleStore } from '@/lib/server-engine.ts';

/**
 * ============================================================================
 * GET /api/standards: 检索标准规则库已收录标准与规格切片元数据
 * ============================================================================
 */
export async function GET() {
  try {
    const standards = await serverRuleStore.listAvailableStandards();

    return NextResponse.json({
      success: true,
      data: {
        total_standards: standards.length,
        total_slices: standards.reduce((sum, s) => sum + s.slice_count, 0),
        standards: standards,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `Failed to fetch standards: ${message}` },
      { status: 500 }
    );
  }
}
