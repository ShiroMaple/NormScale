import { describe, it, expect, beforeAll } from 'vitest';
import { CertificateNormalizer } from '@/normalizer/certificate-normalizer';
import { MockCertificateExtractor } from '@/extractor/mock-extractor';
import { FileRuleStore } from '@/repository/file-rule-store';
import { ComplianceEngine } from '@/engine/core';
import { StandardRuleSet } from '@/schemas/standard.schema';

describe('CertificateNormalizer 质保书确定性归一化与核验引擎贯通测试', () => {
  let ruleStore: FileRuleStore;
  let normalizer: CertificateNormalizer;
  let extractor: MockCertificateExtractor;
  let standardRuleSet: StandardRuleSet;

  beforeAll(async () => {
    ruleStore = new FileRuleStore();
    normalizer = new CertificateNormalizer(ruleStore);
    extractor = new MockCertificateExtractor();

    const loaded = await ruleStore.getCompleteStandard('GB/T 13296-2023');
    if (!loaded) throw new Error('Failed to load standard GB/T 13296-2023');
    standardRuleSet = loaded;
  });

  it('正确归一化 S30408 异构噪声样本并生成审计日志', async () => {
    const rawPayload = await extractor.extract('s30408_messy_sample');
    const { certificate, audit_log } = await normalizer.normalize(rawPayload);

    // 1. 验证抬头与牌号消歧 (SUS 304 -> 06Cr19Ni10)
    expect(certificate.header.declared_grade).toBe('06Cr19Ni10');
    expect(audit_log.grade_normalization.unified_code).toBe('S30408');
    expect(audit_log.grade_normalization.is_matched).toBe(true);

    // 2. 验证几何尺寸解析 (Φ25.0×2.0×6000mm)
    expect(certificate.header.dimensions?.outer_diameter_mm).toBe(25.0);
    expect(certificate.header.dimensions?.wall_thickness_mm).toBe(2.0);
    expect(certificate.header.dimensions?.length_mm).toBe(6000);

    // 3. 验证力学性能清洗 (565 MPa, 245 N/mm2 -> 245, 82 HRB)
    const rm = certificate.test_records.find(r => r.property_key === 'tensile_strength');
    expect(rm?.measured_value_num).toBe(565);
    expect(rm?.unit).toBe('MPa');

    const reh = certificate.test_records.find(r => r.property_key === 'yield_strength_rp02');
    expect(reh?.measured_value_num).toBe(245);
    expect(reh?.unit).toBe('MPa');

    const hrb = certificate.test_records.find(r => r.property_key === 'hardness');
    expect(hrb?.measured_value_num).toBe(82);
    expect(hrb?.sub_property).toBe('HRB');

    // 4. 验证定性检验项清洗 ('未见裂纹' -> PASS, 'E3H 验收合格' -> PASS / E3H)
    const flat = certificate.test_records.find(r => r.property_key === 'flattening_test');
    expect(flat?.qualitative_result).toBe('PASS');

    const et = certificate.test_records.find(r => r.property_key === 'eddy_current_test');
    expect(et?.qualitative_result).toBe('PASS');
    expect(et?.measured_level_claimed).toBe('E3H');
  });

  it('归一化后的质检对象能够直接无缝输入 ComplianceEngine 并判定合格', async () => {
    const rawPayload = await extractor.extract('s30408_messy_sample');
    const { certificate } = await normalizer.normalize(rawPayload);

    // 送入 Phase 1/2 核心判定引擎
    const report = ComplianceEngine.evaluate(standardRuleSet, certificate);

    expect(report.summary.overall_status).toBe('PASS');
    expect(report.summary.total_rules_evaluated).toBeGreaterThanOrEqual(10);
    expect(report.summary.fail_count).toBe(0);
    expect(report.summary.missing_count).toBe(0);
  });

  it('正确处理工程制单位样本 (kgf/mm² -> MPa 换算) 并贯通判定', async () => {
    const rawPayload = await extractor.extract('s31603_kgf_sample');
    const { certificate, audit_log } = await normalizer.normalize(rawPayload);

    // 1. 验证牌号消歧 (TP-316L -> 022Cr17Ni12Mo2)
    expect(certificate.header.declared_grade).toBe('022Cr17Ni12Mo2');
    expect(audit_log.grade_normalization.unified_code).toBe('S31603');

    // 2. 验证单位转换审计记录 (58.5 kgf/mm² -> 573.689 MPa)
    expect(audit_log.unit_conversions.length).toBeGreaterThanOrEqual(2);
    const rm = certificate.test_records.find(r => r.property_key === 'tensile_strength');
    expect(rm?.measured_value_num).toBeCloseTo(573.689, 2);
    expect(rm?.unit).toBe('MPa');

    // 3. 验证无损超声波等级提取 (U2)
    const ut = certificate.test_records.find(r => r.property_key === 'ultrasonic_test');
    expect(ut?.qualitative_result).toBe('PASS');
    expect(ut?.measured_level_claimed).toBe('U2');
  });
});
