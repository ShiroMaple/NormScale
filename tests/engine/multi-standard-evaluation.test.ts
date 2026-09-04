import { describe, it, expect, beforeAll } from 'vitest';
import { ComplianceEngine } from '@/engine/core';
import { FileRuleStore } from '@/repository/file-rule-store';
import { CertificateExtract } from '@/schemas/certificate.schema';
import { CompositeSlice } from '@/engine/multi-standard-composer';

describe('ComplianceEngine 多标准双标尺合规评定与剪刀差追溯测试', () => {
  let store: FileRuleStore;
  let compositeSlice: CompositeSlice;

  beforeAll(async () => {
    store = new FileRuleStore();
    const slice = await store.resolveCompositeSlice(
      ['GB/T 13296-2023', 'NB/T 47019.5-2021'],
      'S32168'
    );
    if (!slice) throw new Error('未能解析出 GB+NB S32168 合成切片');
    compositeSlice = slice;
  });

  it('Case 1: 全合格样本 (A=42.5% >= 40% 订货标)，双标准均判定 PASS', () => {
    const cert: CertificateExtract = {
      header: {
        certificate_no: 'QS-DOUBLE-001',
        declared_standard: 'GB/T 13296-2023、NB/T 47019.5-2021',
        declared_grade: '06Cr18Ni11Ti (S32168)',
        dimensions: { outer_diameter_mm: 25.0, wall_thickness_mm: 2.0 },
      },
      test_records: [
        { category: 'chemical', property_key: 'C', measured_value_num: 0.042, unit: '%' },
        { category: 'chemical', property_key: 'Si', measured_value_num: 0.55, unit: '%' },
        { category: 'chemical', property_key: 'Mn', measured_value_num: 1.20, unit: '%' },
        { category: 'chemical', property_key: 'P', measured_value_num: 0.028, unit: '%' },
        { category: 'chemical', property_key: 'S', measured_value_num: 0.008, unit: '%' },
        { category: 'chemical', property_key: 'Ni', measured_value_num: 10.5, unit: '%' },
        { category: 'chemical', property_key: 'Cr', measured_value_num: 18.3, unit: '%' },
        { category: 'chemical', property_key: 'N', measured_value_num: 0.02, unit: '%' },
        { category: 'chemical', property_key: 'Ti', measured_value_num: 0.45, unit: '%' },
        { category: 'mechanical', property_key: 'tensile_strength', measured_value_num: 565, unit: 'MPa' },
        { category: 'mechanical', property_key: 'yield_strength_rp02', measured_value_num: 230, unit: 'MPa' },
        { category: 'mechanical', property_key: 'elongation_A', measured_value_num: 42.5, unit: '%' }, // >= 40%
        { category: 'mechanical', property_key: 'hardness', sub_property: 'HRB', measured_value_num: 82, unit: 'HRB' },
        { category: 'process', property_key: 'flattening_test', qualitative_result: 'PASS' },
        { category: 'process', property_key: 'flaring_test', qualitative_result: 'PASS' },
        { category: 'metallographic', property_key: 'grain_size', measured_value_num: 7.0, unit: '级' },
        { category: 'corrosion', property_key: 'intergranular_corrosion', qualitative_result: 'PASS' },
        { category: 'ndt', property_key: 'eddy_current_test', measured_level_claimed: 'E2H', qualitative_result: 'PASS' },
        { category: 'ndt', property_key: 'ultrasonic_test', measured_level_claimed: 'U2', qualitative_result: 'PASS' },
        { category: 'surface', property_key: 'surface_quality', qualitative_result: 'PASS' },
      ],
    };

    const report = ComplianceEngine.evaluateSlice(compositeSlice, cert);
    expect(report.summary.overall_status).toBe('PASS');

    const elongResult = report.item_results.find(r => r.property_key === 'elongation_A');
    expect(elongResult).toBeDefined();
    expect(elongResult?.status).toBe('PASS');
    expect(elongResult?.dual_standard_requirement_text).toBeDefined();
    expect(elongResult?.multi_standard_evaluations?.length).toBe(2);

    // 验证多标准逐项独立评估结论均为 PASS
    const gbEval = elongResult?.multi_standard_evaluations?.find(e => e.standard_id.includes('13296'));
    const nbEval = elongResult?.multi_standard_evaluations?.find(e => e.standard_id.includes('47019'));
    expect(gbEval?.status).toBe('PASS');
    expect(nbEval?.status).toBe('PASS');
  });

  it('Case 2: 剪刀差边界失效 (A=38.0%: 满足 GB/T 13296 的 35%，但不达 NB/T 47019.5 的 40%)', () => {
    const cert: CertificateExtract = {
      header: {
        certificate_no: 'QS-SCISSORS-002',
        declared_standard: 'GB/T 13296-2023、NB/T 47019.5-2021',
        declared_grade: '06Cr18Ni11Ti (S32168)',
        dimensions: { outer_diameter_mm: 25.0, wall_thickness_mm: 2.0 },
      },
      test_records: [
        { category: 'chemical', property_key: 'C', measured_value_num: 0.042, unit: '%' },
        { category: 'chemical', property_key: 'Si', measured_value_num: 0.55, unit: '%' },
        { category: 'chemical', property_key: 'Mn', measured_value_num: 1.20, unit: '%' },
        { category: 'chemical', property_key: 'P', measured_value_num: 0.028, unit: '%' },
        { category: 'chemical', property_key: 'S', measured_value_num: 0.008, unit: '%' },
        { category: 'chemical', property_key: 'Ni', measured_value_num: 10.5, unit: '%' },
        { category: 'chemical', property_key: 'Cr', measured_value_num: 18.3, unit: '%' },
        { category: 'chemical', property_key: 'N', measured_value_num: 0.02, unit: '%' },
        { category: 'chemical', property_key: 'Ti', measured_value_num: 0.45, unit: '%' },
        { category: 'mechanical', property_key: 'tensile_strength', measured_value_num: 565, unit: 'MPa' },
        { category: 'mechanical', property_key: 'yield_strength_rp02', measured_value_num: 230, unit: 'MPa' },
        // 关键剪刀差数据：A=38.0% (大于国标 35%，但小于订货标 40%)
        { category: 'mechanical', property_key: 'elongation_A', measured_value_num: 38.0, measured_value_raw: '38.0%', unit: '%' },
        { category: 'mechanical', property_key: 'hardness', sub_property: 'HRB', measured_value_num: 82, unit: 'HRB' },
        { category: 'process', property_key: 'flattening_test', qualitative_result: 'PASS' },
        { category: 'process', property_key: 'flaring_test', qualitative_result: 'PASS' },
        { category: 'metallographic', property_key: 'grain_size', measured_value_num: 7.0, unit: '级' },
        { category: 'corrosion', property_key: 'intergranular_corrosion', qualitative_result: 'PASS' },
        { category: 'ndt', property_key: 'eddy_current_test', measured_level_claimed: 'E2H', qualitative_result: 'PASS' },
        { category: 'ndt', property_key: 'ultrasonic_test', measured_level_claimed: 'U2', qualitative_result: 'PASS' },
        { category: 'surface', property_key: 'surface_quality', qualitative_result: 'PASS' },
      ],
    };

    const report = ComplianceEngine.evaluateSlice(compositeSlice, cert);

    // 总体判定因订货加严未满足而触发一票否决
    expect(report.summary.overall_status).toBe('FAIL');
    expect(report.summary.fail_count).toBe(1);

    const elongResult = report.item_results.find(r => r.property_key === 'elongation_A');
    expect(elongResult).toBeDefined();
    expect(elongResult?.status).toBe('FAIL');

    // 验证核心剪刀差判定标识与责任归因
    expect(elongResult?.is_scissors_difference).toBe(true);
    expect(elongResult?.strict_standard_id).toBe('NB/T 47019.5-2021');
    expect(elongResult?.scissors_attribution).toContain('满足 GB/T 13296');
    expect(elongResult?.scissors_attribution).toContain('未满足 NB/T 47019.5');
    expect(elongResult?.scissors_attribution).toContain('责任归属于 NB/T 47019.5');

    // 验证逐标独立评估清单：GB 为 PASS，NB 为 FAIL
    const gbEval = elongResult?.multi_standard_evaluations?.find(e => e.standard_id.includes('13296'));
    const nbEval = elongResult?.multi_standard_evaluations?.find(e => e.standard_id.includes('47019'));
    expect(gbEval?.status).toBe('PASS');
    expect(nbEval?.status).toBe('FAIL');
    expect(nbEval?.is_governing).toBe(true);
  });

  it('Case 3: 双不达标样本 (A=30.0%: 既不满足国标 35% 也不满足订货标 40%)', () => {
    const cert: CertificateExtract = {
      header: {
        certificate_no: 'QS-BOTH-FAIL-003',
        declared_standard: 'GB/T 13296-2023、NB/T 47019.5-2021',
        declared_grade: '06Cr18Ni11Ti (S32168)',
        dimensions: { outer_diameter_mm: 25.0, wall_thickness_mm: 2.0 },
      },
      test_records: [
        { category: 'chemical', property_key: 'C', measured_value_num: 0.042, unit: '%' },
        { category: 'mechanical', property_key: 'elongation_A', measured_value_num: 30.0, measured_value_raw: '30.0%', unit: '%' },
      ],
    };

    const report = ComplianceEngine.evaluateSlice(compositeSlice, cert);
    const elongResult = report.item_results.find(r => r.property_key === 'elongation_A');

    expect(elongResult?.status).toBe('FAIL');
    // 双不达标不属于剪刀差区间 (因为没有任何标准通过)
    expect(elongResult?.is_scissors_difference).toBe(false);

    const gbEval = elongResult?.multi_standard_evaluations?.find(e => e.standard_id.includes('13296'));
    const nbEval = elongResult?.multi_standard_evaluations?.find(e => e.standard_id.includes('47019'));
    expect(gbEval?.status).toBe('FAIL');
    expect(nbEval?.status).toBe('FAIL');
  });

  it('Case 4: 包含技术协议放宽法定底线（P放宽至0.040%），实测0.038%在放宽区间，生成双层主结论与风险预警', () => {
    // 模拟合成切片中 P 元素被技术协议放宽至 0.040% (国标基准为 0.035%)
    const relaxedSlice: CompositeSlice = {
      ...compositeSlice,
      evaluation_rules: compositeSlice.evaluation_rules.map(r => {
        if (r.property_key === 'P') {
          return {
            ...r,
            criteria: { min: null, max: 0.040, unit: '%' },
            composite_trace: {
              canonical_property_key: 'P',
              display_name: '磷含量 P',
              governing_standard_id: 'TA-2026-WELD',
              is_tightened: true,
              is_statutory_relaxation_risk: true,
              statutory_baseline: '法定标准底线要求：≤0.035%',
              statutory_relaxation_warning: '高优先级采购技术协议放宽了法定标准底线要求',
              dual_standard_requirement_text: '≤ 0.040% [TA] / ≤ 0.035% [GB]',
              arbitration_reason: '技术协议优先采纳 (放宽法标风险)',
              sources: [
                {
                  standard_id: 'TA-2026-WELD',
                  standard_short_code: 'TA',
                  rule_id: 'TA_P',
                  requirement_level: 'MANDATORY',
                  requirement_text: '≤ 0.040%',
                  min: null,
                  max: 0.040,
                  is_governing_strict: true,
                  raw_rule: {
                    rule_id: 'TA_P',
                    category: 'chemical',
                    property_key: 'P',
                    display_name: '磷 P',
                    rule_type: 'numeric_range',
                    requirement_level: 'MANDATORY',
                    criteria: { min: null, max: 0.040 },
                  },
                },
                {
                  standard_id: 'GB/T 13296-2023',
                  standard_short_code: 'GB',
                  rule_id: 'GB_P',
                  requirement_level: 'MANDATORY',
                  requirement_text: '≤ 0.035%',
                  min: null,
                  max: 0.035,
                  is_governing_strict: false,
                  raw_rule: {
                    rule_id: 'GB_P',
                    category: 'chemical',
                    property_key: 'P',
                    display_name: '磷 P',
                    rule_type: 'numeric_range',
                    requirement_level: 'MANDATORY',
                    criteria: { min: null, max: 0.035 },
                  },
                },
              ],
            },
          };
        }
        return r;
      }),
    };

    const cert: CertificateExtract = {
      header: {
        certificate_no: 'QS-RELAX-004',
        declared_standard: 'GB/T 13296-2023、TA-2026-WELD',
        declared_grade: '06Cr18Ni11Ti (S32168)',
        dimensions: { outer_diameter_mm: 25.0, wall_thickness_mm: 2.0 },
      },
      test_records: [
        { category: 'chemical', property_key: 'P', measured_value_num: 0.038, unit: '%' },
        { category: 'mechanical', property_key: 'tensile_strength', measured_value_num: 565, unit: 'MPa' },
        { category: 'mechanical', property_key: 'elongation_A', measured_value_num: 42.0, unit: '%' },
      ],
    };

    const report = ComplianceEngine.evaluateSlice(relaxedSlice, cert);
    const pResult = report.item_results.find(r => r.property_key === 'P');

    expect(pResult).toBeDefined();
    expect(pResult?.status).toBe('PASS');
    expect(pResult?.is_statutory_relaxation_risk).toBe(true);
    expect(pResult?.statutory_baseline).toContain('0.035');
    expect(pResult?.message).toContain('合同放宽法标底线');

    // 验证双层主结论与全局风险标记
    expect(report.statutory_risk_flag).toBe(true);
    expect(report.standard_compliance_verdict).toBe('FAIL'); // 国标 P=0.038% > 0.035% 不合格
    expect(report.agreement_compliance_verdict).toBe('PASS'); // 技术协议 P=0.038% <= 0.040% 合格
  });

  it('Case 5: 判定逻辑精炼格式验证 (消除"满足所有标准综合严苛要求"等套话，精准呈现数值比对)', () => {
    const cert: CertificateExtract = {
      header: {
        certificate_no: 'QS-REFINED-005',
        declared_standard: 'GB/T 13296-2023、NB/T 47019.5-2021',
        declared_grade: '06Cr18Ni11Ti (S32168)',
        // 不提供尺寸，验证纯真实数据输入
      },
      test_records: [
        { category: 'chemical', property_key: 'C', measured_value_num: 0.018, measured_value_raw: '0.018', unit: '%' },
        { category: 'mechanical', property_key: 'elongation_A', measured_value_num: 57.5, measured_value_raw: '57.5、61.5 %', unit: '%' },
      ],
    };

    const report = ComplianceEngine.evaluateSlice(compositeSlice, cert);

    // 1. 验证碳 C 元素
    const cResult = report.item_results.find(r => r.property_key === 'C');
    expect(cResult).toBeDefined();
    expect(cResult?.status).toBe('PASS');
    expect(cResult?.message).not.toContain('满足所有标准综合严苛要求');
    expect(cResult?.message).toContain('合格: 实测值 0.018');
    expect(cResult?.message).toContain('≤ 0.08 % [NB/T 47019.5-2021]');
    expect(cResult?.message).toContain('≤ 0.08 % [GB/T 13296-2023]');

    // 2. 验证断后伸长率
    const aResult = report.item_results.find(r => r.property_key === 'elongation_A');
    expect(aResult).toBeDefined();
    expect(aResult?.status).toBe('PASS');
    expect(aResult?.message).not.toContain('满足所有标准综合严苛要求');
    expect(aResult?.message).toContain('合格: 实测值 57.5、61.5 %');
    expect(aResult?.message).toContain('≥ 40 % [NB/T 47019.5-2021]');
    expect(aResult?.message).toContain('≥ 35 % [GB/T 13296-2023]');
  });
});
