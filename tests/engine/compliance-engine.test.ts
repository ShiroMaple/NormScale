import { describe, it, expect } from 'vitest';
import { ComplianceEngine } from '@/engine/core';
import { StandardRuleSet, StandardRuleSetSchema } from '@/schemas/standard.schema';
import { CertificateExtract, CertificateExtractSchema } from '@/schemas/certificate.schema';
import { AuditReportSchema } from '@/schemas/report.schema';
import standardJson from '../../data/standards/GB_T_13296_2023.json';

describe('ComplianceEngine 核心核验引擎黄金基准测试集 (GB/T 13296-2023)', () => {
  // 校验基准标准规则是否符合 Zod Schema
  const standardRuleSet: StandardRuleSet = StandardRuleSetSchema.parse(standardJson);

  it('标准规则库通过 Zod 强类型解析校验', () => {
    expect(standardRuleSet.standard_meta.standard_id).toBe('GB/T 13296-2023');
    expect(standardRuleSet.grade_rules.length).toBe(2);
  });

  describe('Case 1: 全合格标准质保书 (S30408 冷拔管，涡流代替水压合格)', () => {
    const certExtract: CertificateExtract = {
      header: {
        certificate_no: 'QS-202608-001',
        supplier_name: '某特种钢管制造有限公司',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: '06Cr19Ni10',
        material_form: 'tube_seamless',
        manufacturing_process: 'cold_drawn',
        delivery_state: '固溶酸洗',
        dimensions: {
          outer_diameter_mm: 25.0,
          wall_thickness_mm: 2.0,
          length_mm: 6000,
        },
      },
      test_records: [
        { category: 'chemical', property_key: 'C', measured_value_num: 0.042, measured_value_raw: '0.042%', unit: '%' },
        { category: 'chemical', property_key: 'Si', measured_value_num: 0.55, measured_value_raw: '0.55%', unit: '%' },
        { category: 'chemical', property_key: 'Mn', measured_value_num: 1.20, measured_value_raw: '1.20%', unit: '%' },
        { category: 'chemical', property_key: 'P', measured_value_num: 0.028, measured_value_raw: '0.028%', unit: '%' },
        { category: 'chemical', property_key: 'S', measured_value_num: 0.008, measured_value_raw: '0.008%', unit: '%' },
        { category: 'chemical', property_key: 'Ni', measured_value_num: 8.15, measured_value_raw: '8.15%', unit: '%' },
        { category: 'chemical', property_key: 'Cr', measured_value_num: 18.30, measured_value_raw: '18.30%', unit: '%' },
        { category: 'mechanical', property_key: 'tensile_strength', measured_value_num: 565, measured_value_raw: '565 MPa', unit: 'MPa' },
        { category: 'mechanical', property_key: 'yield_strength_rp02', measured_value_num: 230, measured_value_raw: '230 MPa', unit: 'MPa' },
        { category: 'mechanical', property_key: 'elongation_A', measured_value_num: 42.5, measured_value_raw: '42.5%', unit: '%' },
        { category: 'mechanical', property_key: 'hardness', sub_property: 'HRB', measured_value_num: 82, measured_value_raw: '82 HRB', unit: 'HRB' },
        { category: 'process', property_key: 'flattening_test', qualitative_result: 'PASS', conclusion_text: '压扁试验两平板间距H合格，无裂口' },
        { category: 'ndt', property_key: 'eddy_current_test', measured_level_claimed: 'E3H', qualitative_result: 'PASS', conclusion_text: '涡流探伤符合E3H级' },
        { category: 'ndt', property_key: 'ultrasonic_test', measured_level_claimed: 'U2', qualitative_result: 'PASS', conclusion_text: '超声波探伤符合U2级' },
        { category: 'corrosion', property_key: 'intergranular_corrosion', qualitative_result: 'PASS', conclusion_text: '按GB/T 4334 E法进行，无晶间腐蚀倾向' },
      ],
    };

    it('所有单项均判定通过，总体状态为 PASS，且输出通过 AuditReportSchema 校验', () => {
      const validCert = CertificateExtractSchema.parse(certExtract);
      const report = ComplianceEngine.evaluate(standardRuleSet, validCert);

      expect(() => AuditReportSchema.parse(report)).not.toThrow();
      expect(report.summary.overall_status).toBe('PASS');
      expect(report.summary.fail_count).toBe(0);
      expect(report.summary.missing_count).toBe(0);
      expect(report.summary.has_critical_fail).toBe(false);
      expect(report.missing_mandatory_items.length).toBe(0);
    });
  });

  describe('Case 2: 碳含量微小超标 (C=0.086% > 0.08%)', () => {
    const certExtract: CertificateExtract = {
      header: {
        certificate_no: 'QS-202608-002',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: 'S30408', // 别名路由
        dimensions: { outer_diameter_mm: 25.0, wall_thickness_mm: 2.0 },
      },
      test_records: [
        { category: 'chemical', property_key: 'C', measured_value_num: 0.086, measured_value_raw: '0.086%', unit: '%' },
        { category: 'chemical', property_key: 'Si', measured_value_num: 0.55, unit: '%' },
        { category: 'chemical', property_key: 'Mn', measured_value_num: 1.20, unit: '%' },
        { category: 'chemical', property_key: 'P', measured_value_num: 0.028, unit: '%' },
        { category: 'chemical', property_key: 'S', measured_value_num: 0.008, unit: '%' },
        { category: 'chemical', property_key: 'Ni', measured_value_num: 8.15, unit: '%' },
        { category: 'chemical', property_key: 'Cr', measured_value_num: 18.30, unit: '%' },
        { category: 'mechanical', property_key: 'tensile_strength', measured_value_num: 565, unit: 'MPa' },
        { category: 'mechanical', property_key: 'yield_strength_rp02', measured_value_num: 230, unit: 'MPa' },
        { category: 'mechanical', property_key: 'elongation_A', measured_value_num: 42.5, unit: '%' },
        { category: 'mechanical', property_key: 'hardness', sub_property: 'HRB', measured_value_num: 82, unit: 'HRB' },
        { category: 'process', property_key: 'flattening_test', qualitative_result: 'PASS' },
        { category: 'ndt', property_key: 'eddy_current_test', measured_level_claimed: 'E3H', qualitative_result: 'PASS' },
        { category: 'ndt', property_key: 'ultrasonic_test', measured_level_claimed: 'U2', qualitative_result: 'PASS' },
        { category: 'corrosion', property_key: 'intergranular_corrosion', qualitative_result: 'PASS' },
      ],
    };

    it('判定为 FAIL，精准指出碳含量超标 +0.006%', () => {
      const report = ComplianceEngine.evaluate(standardRuleSet, certExtract);

      expect(report.summary.overall_status).toBe('FAIL');
      expect(report.summary.fail_count).toBe(1);

      const cResult = report.item_results.find(r => r.property_key === 'C');
      expect(cResult).toBeDefined();
      expect(cResult?.status).toBe('FAIL');
      expect(cResult?.rounded_value).toBe(0.086);
      expect(cResult?.deviation).toBeCloseTo(0.006, 5);
      expect(cResult?.message).toContain('超出标准上限 0.08%');
    });
  });

  describe('Case 3: 动态跨字段公式不达标 (S32169 Ti 含量不足)', () => {
    const certExtract: CertificateExtract = {
      header: {
        certificate_no: 'QS-202608-003',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: '07Cr19Ni11Ti',
      },
      test_records: [
        { category: 'chemical', property_key: 'C', measured_value_num: 0.06, unit: '%' },
        { category: 'chemical', property_key: 'N', measured_value_num: 0.03, unit: '%' },
        // 动态下限: 4 * (0.06 + 0.03) = 0.36%
        // 实测 0.30% < 0.36% (不达标)
        { category: 'chemical', property_key: 'Ti', measured_value_num: 0.30, measured_value_raw: '0.30%', unit: '%' },
        { category: 'metallographic', property_key: 'grain_size', measured_value_num: 6.0, unit: '级' },
      ],
    };

    it('计算得出 Ti 下限为 0.36% 并判定实测 0.30% 为 FAIL', () => {
      const report = ComplianceEngine.evaluate(standardRuleSet, certExtract);

      expect(report.summary.overall_status).toBe('FAIL');
      const tiResult = report.item_results.find(r => r.property_key === 'Ti');
      expect(tiResult).toBeDefined();
      expect(tiResult?.status).toBe('FAIL');
      expect(tiResult?.standard_min).toBe(0.36);
      expect(tiResult?.deviation).toBeCloseTo(0.06, 5);
    });
  });

  describe('Case 4: 条件触发跳过 (SKIPPED) 与标准豁免 (EXEMPT)', () => {
    it('薄壁管 (S=1.5mm < 1.7mm) 未测硬度判定为 SKIPPED 而非 MISSING', () => {
      const thinWallCert: CertificateExtract = {
        header: {
          certificate_no: 'QS-202608-004A',
          declared_standard: 'GB/T 13296-2023',
          declared_grade: '06Cr19Ni10',
          dimensions: { outer_diameter_mm: 25.0, wall_thickness_mm: 1.5 }, // S=1.5 < 1.7
        },
        test_records: [
          { category: 'chemical', property_key: 'C', measured_value_num: 0.042, unit: '%' },
          { category: 'chemical', property_key: 'Si', measured_value_num: 0.55, unit: '%' },
          { category: 'chemical', property_key: 'Mn', measured_value_num: 1.20, unit: '%' },
          { category: 'chemical', property_key: 'P', measured_value_num: 0.028, unit: '%' },
          { category: 'chemical', property_key: 'S', measured_value_num: 0.008, unit: '%' },
          { category: 'chemical', property_key: 'Ni', measured_value_num: 8.15, unit: '%' },
          { category: 'chemical', property_key: 'Cr', measured_value_num: 18.30, unit: '%' },
          { category: 'mechanical', property_key: 'tensile_strength', measured_value_num: 565, unit: 'MPa' },
          { category: 'mechanical', property_key: 'yield_strength_rp02', measured_value_num: 230, unit: 'MPa' },
          { category: 'mechanical', property_key: 'elongation_A', measured_value_num: 42.5, unit: '%' },
          // 未测硬度
          { category: 'process', property_key: 'flattening_test', qualitative_result: 'PASS' },
          { category: 'ndt', property_key: 'eddy_current_test', measured_level_claimed: 'E3H', qualitative_result: 'PASS' },
          { category: 'ndt', property_key: 'ultrasonic_test', measured_level_claimed: 'U2', qualitative_result: 'PASS' },
          { category: 'corrosion', property_key: 'intergranular_corrosion', qualitative_result: 'PASS' },
        ],
      };

      const report = ComplianceEngine.evaluate(standardRuleSet, thinWallCert);
      expect(report.summary.overall_status).toBe('PASS');

      const hardnessResult = report.item_results.find(r => r.property_key === 'hardness');
      expect(hardnessResult?.status).toBe('SKIPPED');
      expect(hardnessResult?.message).toContain('未激活');
    });

    it('07Cr19Ni11Ti 晶间腐蚀自动标记为 EXEMPT', () => {
      const s32169Cert: CertificateExtract = {
        header: {
          certificate_no: 'QS-202608-004B',
          declared_standard: 'GB/T 13296-2023',
          declared_grade: '07Cr19Ni11Ti',
        },
        test_records: [
          { category: 'chemical', property_key: 'C', measured_value_num: 0.06, unit: '%' },
          { category: 'chemical', property_key: 'N', measured_value_num: 0.03, unit: '%' },
          { category: 'chemical', property_key: 'Ti', measured_value_num: 0.45, unit: '%' },
          { category: 'metallographic', property_key: 'grain_size', measured_value_num: 5.5, unit: '级' },
        ],
      };

      const report = ComplianceEngine.evaluate(standardRuleSet, s32169Cert);
      expect(report.summary.overall_status).toBe('PASS');

      const exemptResult = report.item_results.find(r => r.property_key === 'intergranular_corrosion');
      expect(exemptResult?.status).toBe('EXEMPT');
      expect(exemptResult?.requirement_level).toBe('EXEMPT');
    });
  });

  describe('Case 5: 强制项漏检 (未做超声波探伤 -> MISSING 拦截)', () => {
    const missingNdtCert: CertificateExtract = {
      header: {
        certificate_no: 'QS-202608-005',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: '06Cr19Ni10',
        dimensions: { outer_diameter_mm: 25.0, wall_thickness_mm: 2.0 },
      },
      test_records: [
        { category: 'chemical', property_key: 'C', measured_value_num: 0.042, unit: '%' },
        { category: 'chemical', property_key: 'Si', measured_value_num: 0.55, unit: '%' },
        { category: 'chemical', property_key: 'Mn', measured_value_num: 1.20, unit: '%' },
        { category: 'chemical', property_key: 'P', measured_value_num: 0.028, unit: '%' },
        { category: 'chemical', property_key: 'S', measured_value_num: 0.008, unit: '%' },
        { category: 'chemical', property_key: 'Ni', measured_value_num: 8.15, unit: '%' },
        { category: 'chemical', property_key: 'Cr', measured_value_num: 18.30, unit: '%' },
        { category: 'mechanical', property_key: 'tensile_strength', measured_value_num: 565, unit: 'MPa' },
        { category: 'mechanical', property_key: 'yield_strength_rp02', measured_value_num: 230, unit: 'MPa' },
        { category: 'mechanical', property_key: 'elongation_A', measured_value_num: 42.5, unit: '%' },
        { category: 'mechanical', property_key: 'hardness', sub_property: 'HRB', measured_value_num: 82, unit: 'HRB' },
        { category: 'process', property_key: 'flattening_test', qualitative_result: 'PASS' },
        { category: 'ndt', property_key: 'eddy_current_test', measured_level_claimed: 'E3H', qualitative_result: 'PASS' },
        // 漏检超声波探伤 (ultrasonic_test)
        { category: 'corrosion', property_key: 'intergranular_corrosion', qualitative_result: 'PASS' },
      ],
    };

    it('超声波探伤标记为 MISSING，全局判定为 FAIL 并触发告警清单', () => {
      const report = ComplianceEngine.evaluate(standardRuleSet, missingNdtCert);

      expect(report.summary.overall_status).toBe('FAIL');
      expect(report.summary.missing_count).toBe(1);
      expect(report.summary.has_critical_fail).toBe(true);

      const ndtResult = report.item_results.find(r => r.property_key === 'ultrasonic_test');
      expect(ndtResult?.status).toBe('MISSING');
      expect(report.missing_mandatory_items).toContain('超声检测 (ultrasonic_test)');
    });
  });

  describe('额外报送项 (EXTRA) 与别名解析测试', () => {
    it('支持通过各种别名 (SUS304 / TP304 / 0Cr18Ni9) 秒级命中规则切片', () => {
      expect(ComplianceEngine.resolveGradeRule(standardRuleSet, 'SUS304')?.grade_info.primary_grade).toBe('06Cr19Ni10');
      expect(ComplianceEngine.resolveGradeRule(standardRuleSet, 'tp-304')?.grade_info.primary_grade).toBe('06Cr19Ni10');
      expect(ComplianceEngine.resolveGradeRule(standardRuleSet, '0Cr18Ni9')?.grade_info.primary_grade).toBe('06Cr19Ni10');
      expect(ComplianceEngine.resolveGradeRule(standardRuleSet, 'S30408')?.grade_info.primary_grade).toBe('06Cr19Ni10');
    });

    it('对未收录的未知牌号安全抛出清晰错误', () => {
      const unknownCert: CertificateExtract = {
        header: { certificate_no: 'UNK-01', declared_standard: 'GB/T 13296-2023', declared_grade: 'UnknownGrade999' },
        test_records: [],
      };
      expect(() => ComplianceEngine.evaluate(standardRuleSet, unknownCert)).toThrow('does not contain rules for grade');
    });

    it('正确收集质保书中多报送的额外检测项 (unmatched_certificate_records)', () => {
      const extraCert: CertificateExtract = {
        header: { certificate_no: 'EXT-01', declared_standard: 'GB/T 13296-2023', declared_grade: 'S30408', dimensions: { wall_thickness_mm: 2.0 } },
        test_records: [
          { category: 'chemical', property_key: 'C', measured_value_num: 0.042, unit: '%' },
          { category: 'chemical', property_key: 'Si', measured_value_num: 0.55, unit: '%' },
          { category: 'chemical', property_key: 'Mn', measured_value_num: 1.20, unit: '%' },
          { category: 'chemical', property_key: 'P', measured_value_num: 0.028, unit: '%' },
          { category: 'chemical', property_key: 'S', measured_value_num: 0.008, unit: '%' },
          { category: 'chemical', property_key: 'Ni', measured_value_num: 8.15, unit: '%' },
          { category: 'chemical', property_key: 'Cr', measured_value_num: 18.30, unit: '%' },
          { category: 'mechanical', property_key: 'tensile_strength', measured_value_num: 565, unit: 'MPa' },
          { category: 'mechanical', property_key: 'yield_strength_rp02', measured_value_num: 230, unit: 'MPa' },
          { category: 'mechanical', property_key: 'elongation_A', measured_value_num: 42.5, unit: '%' },
          { category: 'mechanical', property_key: 'hardness', sub_property: 'HRB', measured_value_num: 82, unit: 'HRB' },
          { category: 'process', property_key: 'flattening_test', qualitative_result: 'PASS' },
          { category: 'ndt', property_key: 'eddy_current_test', measured_level_claimed: 'E3H', qualitative_result: 'PASS' },
          { category: 'ndt', property_key: 'ultrasonic_test', measured_level_claimed: 'U2', qualitative_result: 'PASS' },
          { category: 'corrosion', property_key: 'intergranular_corrosion', qualitative_result: 'PASS' },
          // 额外报送的 Cu, Mo 元素 (标准未作强制规定的项)
          { category: 'chemical', property_key: 'Cu', measured_value_num: 0.15, unit: '%' },
          { category: 'chemical', property_key: 'Mo', measured_value_num: 0.20, unit: '%' },
        ],
      };

      const report = ComplianceEngine.evaluate(standardRuleSet, extraCert);
      expect(report.summary.overall_status).toBe('PASS');
      expect(report.unmatched_certificate_records).toBeDefined();
      expect(report.unmatched_certificate_records?.length).toBe(2);
      expect(report.unmatched_certificate_records?.map(r => r.property_key)).toEqual(['Cu', 'Mo']);
    });

    it('工艺试验定性不达标 (如压扁试验开裂) 判定为 FAIL', () => {
      const failProcessCert: CertificateExtract = {
        header: { certificate_no: 'FAIL-PROC-01', declared_standard: 'GB/T 13296-2023', declared_grade: 'S30408', dimensions: { wall_thickness_mm: 2.0 } },
        test_records: [
          { category: 'chemical', property_key: 'C', measured_value_num: 0.042, unit: '%' },
          { category: 'chemical', property_key: 'Si', measured_value_num: 0.55, unit: '%' },
          { category: 'chemical', property_key: 'Mn', measured_value_num: 1.20, unit: '%' },
          { category: 'chemical', property_key: 'P', measured_value_num: 0.028, unit: '%' },
          { category: 'chemical', property_key: 'S', measured_value_num: 0.008, unit: '%' },
          { category: 'chemical', property_key: 'Ni', measured_value_num: 8.15, unit: '%' },
          { category: 'chemical', property_key: 'Cr', measured_value_num: 18.30, unit: '%' },
          { category: 'mechanical', property_key: 'tensile_strength', measured_value_num: 565, unit: 'MPa' },
          { category: 'mechanical', property_key: 'yield_strength_rp02', measured_value_num: 230, unit: 'MPa' },
          { category: 'mechanical', property_key: 'elongation_A', measured_value_num: 42.5, unit: '%' },
          { category: 'mechanical', property_key: 'hardness', sub_property: 'HRB', measured_value_num: 82, unit: 'HRB' },
          // 压扁试验开裂不合格
          { category: 'process', property_key: 'flattening_test', qualitative_result: 'FAIL', conclusion_text: '试样压扁至间距H时边缘出现裂纹' },
          { category: 'ndt', property_key: 'eddy_current_test', measured_level_claimed: 'E3H', qualitative_result: 'PASS' },
          { category: 'ndt', property_key: 'ultrasonic_test', measured_level_claimed: 'U2', qualitative_result: 'PASS' },
          { category: 'corrosion', property_key: 'intergranular_corrosion', qualitative_result: 'PASS' },
        ],
      };

      const report = ComplianceEngine.evaluate(standardRuleSet, failProcessCert);
      expect(report.summary.overall_status).toBe('FAIL');
      const flatResult = report.item_results.find(r => r.property_key === 'flattening_test');
      expect(flatResult?.status).toBe('FAIL');
    });
  });
});
