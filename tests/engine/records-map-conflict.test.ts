import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { ComplianceEngine } from '@/engine/core';
import { StandardRuleSet } from '@/schemas/standard.schema';
import { CertificateExtract, TestRecord } from '@/schemas/certificate.schema';
import { FileRuleStore } from '@/repository/file-rule-store';
import { logger } from '@/logger';

/** 槽位冲突 warn 日志的 metadata 结构（kept/superseded 双方记录摘要） */
interface SlotConflictMeta {
  key: string;
  kept: { property_key: string; measured_value_num?: number | null; provenance?: string };
  superseded: { property_key: string; measured_value_num?: number | null; provenance?: string };
}

function extractSlotConflictWarns(warnSpy: ReturnType<typeof vi.spyOn>): SlotConflictMeta[] {
  return warnSpy.mock.calls
    .filter((c) => typeof c[1] === 'string' && (c[1] as string).includes('槽位冲突'))
    .map((c) => c[2] as SlotConflictMeta);
}

describe('recordsMap 槽位冲突 provenance 优先级裁决 (引擎覆写信任模型)', () => {
  let standardRuleSet: StandardRuleSet;

  beforeAll(async () => {
    const store = new FileRuleStore();
    const loaded = await store.getCompleteStandard('GB/T 13296-2023');
    if (!loaded) throw new Error('Failed to load standard GB/T 13296-2023 from store');
    standardRuleSet = loaded;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 06Cr19Ni10 全项合格基础记录集（不含屈服强度记录，由每个用例自行注入冲突记录对）
  const baseRecords = (): TestRecord[] => [
    { category: 'chemical', property_key: 'C', measured_value_num: 0.042, unit: '%' },
    { category: 'chemical', property_key: 'Si', measured_value_num: 0.55, unit: '%' },
    { category: 'chemical', property_key: 'Mn', measured_value_num: 1.20, unit: '%' },
    { category: 'chemical', property_key: 'P', measured_value_num: 0.028, unit: '%' },
    { category: 'chemical', property_key: 'S', measured_value_num: 0.008, unit: '%' },
    { category: 'chemical', property_key: 'Ni', measured_value_num: 8.15, unit: '%' },
    { category: 'chemical', property_key: 'Cr', measured_value_num: 18.30, unit: '%' },
    { category: 'mechanical', property_key: 'tensile_strength', measured_value_num: 565, unit: 'MPa' },
    { category: 'mechanical', property_key: 'elongation_A', measured_value_num: 42.5, unit: '%' },
    { category: 'mechanical', property_key: 'hardness', sub_property: 'HRB', measured_value_num: 82, unit: 'HRB' },
    { category: 'process', property_key: 'flattening_test', qualitative_result: 'PASS', conclusion_text: '压扁试验两平板间距H合格，无裂口' },
    { category: 'ndt', property_key: 'eddy_current_test', measured_level_claimed: 'E3H', qualitative_result: 'PASS', conclusion_text: '涡流探伤符合E3H级' },
    { category: 'ndt', property_key: 'ultrasonic_test', measured_level_claimed: 'U2', qualitative_result: 'PASS', conclusion_text: '超声波探伤符合U2级' },
    { category: 'corrosion', property_key: 'intergranular_corrosion', qualitative_result: 'PASS', conclusion_text: '按GB/T 4334 E法进行，无晶间腐蚀倾向' },
  ];

  const buildCert = (testRecords: TestRecord[], certificateNo: string): CertificateExtract => ({
    header: {
      certificate_no: certificateNo,
      declared_standard: 'GB/T 13296-2023',
      declared_grade: '06Cr19Ni10',
      material_form: 'tube_seamless',
      manufacturing_process: 'cold_drawn',
      dimensions: { outer_diameter_mm: 25.0, wall_thickness_mm: 2.0, length_mm: 6000 },
    },
    test_records: testRecords,
  });

  const yieldCore334: TestRecord = { category: 'mechanical', property_key: 'yield_strength_rp02', measured_value_num: 334, measured_value_raw: '334 MPa', unit: 'MPa', provenance: 'core' };
  const yieldAdditional02: TestRecord = { category: 'mechanical', property_key: 'yield_strength_rp02', measured_value_num: 0.2, measured_value_raw: '0.2', unit: 'MPa', provenance: 'additional' };
  const yieldTier2_02: TestRecord = { category: 'mechanical', property_key: 'yield_strength_rp02', measured_value_num: 0.2, measured_value_raw: '0.2', unit: 'MPa', provenance: 'tier2_resolved' };
  const yieldLegacy334: TestRecord = { category: 'mechanical', property_key: 'yield_strength_rp02', measured_value_num: 334, measured_value_raw: '334 MPa', unit: 'MPa' };
  const yieldLegacy02: TestRecord = { category: 'mechanical', property_key: 'yield_strength_rp02', measured_value_num: 0.2, measured_value_raw: '0.2', unit: 'MPa' };

  it('同构冲突：core=334 在前、additional=0.2 在后 → 屈服强度评估采用 334 判 PASS，冲突必打 warn 且记录双方', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const report = ComplianceEngine.evaluate(standardRuleSet, buildCert([...baseRecords(), yieldCore334, yieldAdditional02], 'CONF-A-001'));
    const yieldResult = report.item_results.find((r) => r.property_key === 'yield_strength_rp02');

    expect(yieldResult?.status).toBe('PASS');
    expect(yieldResult?.rounded_value).toBe(334);
    expect(report.summary.overall_status).toBe('PASS');
    expect(report.summary.fail_count).toBe(0);

    const conflicts = extractSlotConflictWarns(warnSpy);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.some((m) => m.kept.measured_value_num === 334 && m.kept.provenance === 'core'
      && m.superseded.measured_value_num === 0.2 && m.superseded.provenance === 'additional')).toBe(true);
  });

  it('同构冲突反序：additional=0.2 在前、core=334 在后 → 仍采用 334（优先级高于数组顺序）', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const report = ComplianceEngine.evaluate(standardRuleSet, buildCert([...baseRecords(), yieldAdditional02, yieldCore334], 'CONF-A-002'));
    const yieldResult = report.item_results.find((r) => r.property_key === 'yield_strength_rp02');

    expect(yieldResult?.status).toBe('PASS');
    expect(yieldResult?.rounded_value).toBe(334);
    expect(report.summary.overall_status).toBe('PASS');
    expect(extractSlotConflictWarns(warnSpy).length).toBeGreaterThan(0);
  });

  it('同级冲突：两条均无 provenance（视为 additional）→ 先到先赢（0.2 在前则判 FAIL）且打 warn', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const report = ComplianceEngine.evaluate(standardRuleSet, buildCert([...baseRecords(), yieldLegacy02, yieldLegacy334], 'CONF-A-003'));
    const yieldResult = report.item_results.find((r) => r.property_key === 'yield_strength_rp02');

    expect(yieldResult?.status).toBe('FAIL');
    expect(yieldResult?.rounded_value).toBe(0.2);
    expect(report.summary.overall_status).toBe('FAIL');
    expect(report.summary.fail_count).toBe(1);

    const conflicts = extractSlotConflictWarns(warnSpy);
    expect(conflicts.some((m) => m.kept.measured_value_num === 0.2 && m.superseded.measured_value_num === 334)).toBe(true);
  });

  it('tier2_resolved 与 core 冲突 → core 赢（评估采用 334 判 PASS）', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const report = ComplianceEngine.evaluate(standardRuleSet, buildCert([...baseRecords(), yieldCore334, yieldTier2_02], 'CONF-A-004'));
    const yieldResult = report.item_results.find((r) => r.property_key === 'yield_strength_rp02');

    expect(yieldResult?.status).toBe('PASS');
    expect(yieldResult?.rounded_value).toBe(334);
    expect(report.summary.overall_status).toBe('PASS');

    const conflicts = extractSlotConflictWarns(warnSpy);
    expect(conflicts.some((m) => m.kept.provenance === 'core' && m.superseded.provenance === 'tier2_resolved')).toBe(true);
  });

  it('异构冲突不回归：定量记录在前、定性记录在后（晶间腐蚀）→ #num/#qual 分裂仍工作，定性规则取定性记录判 PASS，无槽位冲突 warn', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const igcNumeric: TestRecord = { category: 'corrosion', property_key: 'intergranular_corrosion', measured_value_num: 0.05, measured_value_raw: '0.05 mm', unit: 'mm', provenance: 'additional' };
    const igcQual: TestRecord = { category: 'corrosion', property_key: 'intergranular_corrosion', qualitative_result: 'PASS', conclusion_text: '按GB/T 4334 E法进行，无晶间腐蚀倾向', provenance: 'core' };
    const records = baseRecords().filter((r) => r.property_key !== 'intergranular_corrosion');
    const report = ComplianceEngine.evaluate(standardRuleSet, buildCert([...records, igcNumeric, igcQual], 'CONF-A-005'));

    const igcResult = report.item_results.find((r) => r.property_key === 'intergranular_corrosion');
    expect(igcResult?.status).toBe('PASS');
    expect(extractSlotConflictWarns(warnSpy).length).toBe(0);
  });

  it('异构冲突不回归：定性记录在前、定量记录在后（晶间腐蚀）→ 定性规则仍取定性记录判 PASS，无槽位冲突 warn', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const igcNumeric: TestRecord = { category: 'corrosion', property_key: 'intergranular_corrosion', measured_value_num: 0.05, measured_value_raw: '0.05 mm', unit: 'mm', provenance: 'additional' };
    // baseRecords 中晶间腐蚀定性记录在前，追加同 key 定量记录在后
    const report = ComplianceEngine.evaluate(standardRuleSet, buildCert([...baseRecords(), igcNumeric], 'CONF-A-006'));

    const igcResult = report.item_results.find((r) => r.property_key === 'intergranular_corrosion');
    expect(igcResult?.status).toBe('PASS');
    expect(extractSlotConflictWarns(warnSpy).length).toBe(0);
  });
});
