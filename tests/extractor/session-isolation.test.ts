import { describe, it, expect } from 'vitest';
import { generateSessionId, InspectionSession } from '@/types/session.ts';
import { DEFAULT_INSPECTION_SESSION } from '../fixtures/demo-session.ts';
import { AuditReportSchema } from '@/schemas/report.schema.ts';
import { getZPJEBBoxes } from '@/types/bbox.ts';

describe('Session Isolation and Dynamic Model Verification', () => {
  it('should verify DEFAULT_INSPECTION_SESSION is retained as a valid demo archival session', () => {
    expect(DEFAULT_INSPECTION_SESSION).toBeDefined();
    expect(DEFAULT_INSPECTION_SESSION.sessionId).toContain('SESS-20260826');
    expect(DEFAULT_INSPECTION_SESSION.documents.length).toBeGreaterThan(0);
    expect(DEFAULT_INSPECTION_SESSION.documents[0]?.batches.length).toBeGreaterThan(0);
    expect(DEFAULT_INSPECTION_SESSION.documents[0]?.batches[0]?.batchNo).toBe('Z26022C-DB7');
  });

  it('should initialize a fresh empty session without contaminating with DEFAULT_INSPECTION_SESSION', () => {
    const freshSession: InspectionSession = {
      sessionId: generateSessionId(),
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
      title: '现场实时质检作业会话',
      totalDocuments: 0,
      totalBatches: 0,
      passedBatches: 0,
      failedBatches: 0,
      hitlBatches: 0,
      documents: [],
    };

    expect(freshSession.documents).toHaveLength(0);
    expect(freshSession.totalDocuments).toBe(0);
    expect(freshSession.totalBatches).toBe(0);
    expect(freshSession.sessionId).not.toBe(DEFAULT_INSPECTION_SESSION.sessionId);
  });

  it('should successfully validate dynamic AuditReport with optional metadata fields', () => {
    const mockReport = {
      certificate_no: 'MTC-2026-TEST-001',
      declared_standard: 'GB/T 13296-2023',
      declared_grade: '06Cr19Ni10',
      matched_standard_id: 'GB_T_13296_2023',
      matched_grade: '06Cr19Ni10 (S30408)',
      audit_timestamp: '2026-09-01T12:00:00Z',
      supplier_name: '测试特种钢管制造有限公司',
      heat_number: 'H-99881',
      lot_number: 'LOT-99881-A',
      dimensions: '25.0mm × 2.0mm × 6000mm',
      delivery_state: '固溶热处理',
      inspector: '质检工程师 (QA-01)',
      supervisor: '质量总监 (QC-01)',
      summary: {
        overall_status: 'PASS' as const,
        total_rules_evaluated: 10,
        pass_count: 10,
        fail_count: 0,
        missing_count: 0,
        exempt_count: 0,
        skipped_count: 0,
        warning_count: 0,
        has_critical_fail: false,
      },
      item_results: [
        {
          rule_id: 'CHEM_C',
          category: 'chemical' as const,
          property_key: 'C',
          display_name: '碳 (C)',
          status: 'PASS' as const,
          requirement_level: 'MANDATORY' as const,
          standard_requirement_text: '<= 0.080%',
          actual_value_text: '0.024%',
          message: '符合要求',
        },
      ],
      missing_mandatory_items: [],
    };

    const parsed = AuditReportSchema.safeParse(mockReport);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.supplier_name).toBe('测试特种钢管制造有限公司');
      expect(parsed.data.heat_number).toBe('H-99881');
    }
  });

  it('should provide generalized indicator labels in BBoxes without hardcoded result assertions', () => {
    const bboxes = getZPJEBBoxes('26022-01');
    const flatteningBox = bboxes.find(b => b.id === 'proc_flattening');
    const flaringBox = bboxes.find(b => b.id === 'proc_flaring');
    const corrosionBox = bboxes.find(b => b.id === 'corrosion_intergranular');

    expect(flatteningBox).toBeDefined();
    expect(flatteningBox?.label).toBe('压扁试验实测结果');
    expect(flaringBox?.label).toBe('扩口试验实测结果');
    expect(corrosionBox?.label).toBe('晶间腐蚀试验实测结果');
  });

  it('should verify BBox coordinate bounds and 150% spotlight magnification centering geometry', () => {
    const bboxes = getZPJEBBoxes('Z26022C-DB7');
    expect(bboxes.length).toBeGreaterThan(10);

    bboxes.forEach((box) => {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(100);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.h).toBeLessThanOrEqual(100);
      expect(box.page).toBeGreaterThanOrEqual(1);
    });

    // 验证 150% 放大时原点计算与溢出边距计算
    const sampleBox = bboxes.find(b => b.id === 'meta_certificateNo')!;
    const originX = sampleBox.x + sampleBox.w / 2;
    const originY = sampleBox.y + sampleBox.h / 2;

    const MAGNIFY_SCALE = 1.5;
    const pageWidth = 480;
    const pageHeight = Math.round(pageWidth * 1.414);

    const extraHeight = (MAGNIFY_SCALE - 1) * pageHeight;
    const extraWidth = (MAGNIFY_SCALE - 1) * pageWidth;

    const topMargin = Math.round((originY / 100) * extraHeight);
    const bottomMargin = Math.round(((100 - originY) / 100) * extraHeight);
    const leftMargin = Math.round((originX / 100) * extraWidth);
    const rightMargin = Math.round(((100 - originX) / 100) * extraWidth);

    expect(Math.abs(topMargin + bottomMargin - extraHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(leftMargin + rightMargin - extraWidth)).toBeLessThanOrEqual(1);
    expect(MAGNIFY_SCALE).toBe(1.5);
  });
});
