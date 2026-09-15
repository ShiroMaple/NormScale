import { describe, it, expect, beforeAll } from 'vitest';
import { ComplianceEngine } from '@/engine/core';
import { StandardRuleSet } from '@/schemas/standard.schema';
import { CertificateExtract, TestRecord } from '@/schemas/certificate.schema';
import { FileRuleStore } from '@/repository/file-rule-store';
import {
  annotateAdditionalTests,
  batchSpecimenToCertificateExtract,
} from '@/normalizer/specimen-adapter';

/**
 * 回归测试：测试质保书1.pdf 批次 Z26022C-E1 的 0.2 误判 FAIL 事件。
 *
 * 事故链路：LLM 将力学性能复合打包进 additional_tests（"室温拉伸试验"），
 * 旧逻辑被首数字正则抓出 0.2、Tier 2 对齐到 yield_strength_rp02 并覆写正确值 334 MPa，
 * 被 NB/T 47019.5-2021（S32168，Rp0.2 ≥ 205 MPa）判 FAIL。
 *
 * 本文件锁定三层治理行为，仅跑本地适配器与引擎，不涉及任何 LLM/网络请求。
 */

const COMPOSITE_RESULT = 'Rp0.2=334、343 MPa；Rm=675、669 MPa；A=48.0、48.0 %';

// 模拟 Z26022C-E1 批次的提取结果（字段名对齐 BatchMechanicalSchema）
const z26022cE1Batch = {
  batchNo: 'Z26022C-E1',
  certificateNo: '20260704203-E1',
  productName: '锅炉、热交换器用不锈钢无缝钢管',
  grade: '06Cr18Ni11Ti (S32168)',
  standard: 'NB/T 47019.5-2021',
  supplier: '江苏武进不锈钢股份有限公司',
  dimensions: 'OD 15.0mm × WT 0.8mm',
  chemical: [
    { element: 'C', value: '0.018' },
    { element: 'Si', value: '0.44' },
    { element: 'Mn', value: '1.16' },
    { element: 'P', value: '0.030' },
    { element: 'S', value: '0.005' },
    { element: 'Cr', value: '17.41' },
    { element: 'Ni', value: '9.08' },
    { element: 'Ti', value: '0.14' },
    { element: 'N', value: '<0.01' },
  ],
  mechanical: {
    tensile_rm: '675、669 MPa',
    yield_rp02: '334、343 MPa',
    elongation_a: '48.0、48.0 %',
    hardness: '143、145、137 HV1',
  },
  process: {
    flattening: '合格 OK',
    flaring: '合格 OK',
    intergranularCorrosion: '合格 OK（5.0%形变）',
    grainSize: '7.0 级',
    ndt_et: '合格 OK',
    ndt_ut: '合格 OK',
    surface_quality: '合格 OK',
  },
  additionalTests: [
    {
      key: 'add_1',
      name: '室温拉伸试验',
      category: 'mechanical',
      result: COMPOSITE_RESULT, // 复合打包串：力学性能被重复打包
    },
    {
      key: 'add_2',
      name: '硬度试验（HV1）',
      category: 'mechanical',
      result: '143、145、137 HV1', // 与 mechanical.hardness 同源重复
    },
  ],
};

const NB_STANDARD_ID = 'NB/T 47019.5-2021';
const NB_GRADE_KEY = 'S32168';

describe('回归：Z26022C-E1 批次 0.2 误判 FAIL 事件的三层治理锁定', () => {
  describe('第一层：适配层打标降级 (annotateAdditionalTests + batchSpecimenToCertificateExtract)', () => {
    it('复合打包串条目打标 is_composite 且仍保留在 additionalTests 数组中（不删除）', () => {
      const annotated = annotateAdditionalTests(z26022cE1Batch.additionalTests, z26022cE1Batch);

      // 治理原则：打标降级，禁止静默删数据 —— 两条条目都还在
      expect(annotated).toHaveLength(2);

      const composite = annotated.find((t: any) => t.key === 'add_1');
      expect(composite).toBeDefined();
      expect(composite.is_composite).toBe(true);
      expect(composite.duplicate_reason).toContain('复合打包串');
      // 复合打标在规则 1 即返回，不进入同源查重分支
      expect(composite.is_suspected_duplicate).toBeUndefined();

      const hardnessDup = annotated.find((t: any) => t.key === 'add_2');
      expect(hardnessDup).toBeDefined();
      expect(hardnessDup.is_composite).toBeUndefined();
    });

    it('extract 中复合条目的 test_record 无 measured_value_num、保留原文、provenance=additional', () => {
      const extract = batchSpecimenToCertificateExtract(
        z26022cE1Batch,
        [NB_STANDARD_ID],
        NB_GRADE_KEY
      );

      const compositeRecord = extract.test_records.find(
        (r: any) => r.raw_property_name === '室温拉伸试验'
      );
      expect(compositeRecord).toBeDefined();
      // 复合打包串绝不标量化，仅保留原文与定性结果
      expect(compositeRecord.measured_value_num).toBeUndefined();
      expect(compositeRecord.measured_value_raw).toBe(COMPOSITE_RESULT);
      expect(compositeRecord.provenance).toBe('additional');
    });

    it('硬度试验（HV1）条目与核心槽位同源，打标 is_suspected_duplicate / duplicate_of=hardness', () => {
      const annotated = annotateAdditionalTests(z26022cE1Batch.additionalTests, z26022cE1Batch);

      const hardnessDup = annotated.find((t: any) => t.key === 'add_2');
      expect(hardnessDup.is_suspected_duplicate).toBe(true);
      expect(hardnessDup.duplicate_of).toBe('hardness');
      expect(hardnessDup.duplicate_reason).toContain('hardness');
      expect(hardnessDup.result).toBe('143、145、137 HV1'); // 原值保留
    });

    it('yield_strength_rp02 的 test_record 恰 1 条且 measured_value_num === 334（core）', () => {
      const extract = batchSpecimenToCertificateExtract(
        z26022cE1Batch,
        [NB_STANDARD_ID],
        NB_GRADE_KEY
      );

      const yieldRecords = extract.test_records.filter(
        (r: any) => r.property_key === 'yield_strength_rp02'
      );
      // 复合打包串绝不能再制造第二条屈服强度记录
      expect(yieldRecords).toHaveLength(1);
      expect(yieldRecords[0].measured_value_num).toBe(334);
      expect(yieldRecords[0].measured_value_raw).toBe('334、343 MPa');
      expect(yieldRecords[0].provenance).toBe('core');
    });
  });

  describe('第二层：引擎层真实标准切片裁决 (ComplianceEngine.evaluate, NB/T 47019.5-2021 S32168)', () => {
    let nbRuleSet: StandardRuleSet;

    beforeAll(async () => {
      const store = new FileRuleStore();
      const loaded = await store.getCompleteStandard(NB_STANDARD_ID);
      if (!loaded) throw new Error(`Failed to load standard ${NB_STANDARD_ID} from store`);
      nbRuleSet = loaded;
    });

    it('屈服强度规则采用 334 判 PASS，整体无因 0.2 导致的 FAIL', () => {
      const extract = batchSpecimenToCertificateExtract(
        z26022cE1Batch,
        [NB_STANDARD_ID],
        NB_GRADE_KEY
      );
      const report = ComplianceEngine.evaluate(nbRuleSet, extract);

      const yieldItem = report.item_results.find((r) => r.property_key === 'yield_rp02');
      expect(yieldItem).toBeDefined();
      expect(yieldItem?.status).toBe('PASS');
      expect(yieldItem?.rounded_value).toBe(334);

      // 一票否决全局门禁：不得出现任何 FAIL（尤其不能是 0.2 触发的 FAIL）
      expect(report.summary.overall_status).toBe('PASS');
      expect(report.summary.fail_count).toBe(0);
      expect(report.item_results.every((r) => r.status !== 'FAIL')).toBe(true);
    });
  });

  describe('第三层：破坏变体（模拟旧缓存数据——无标记无 provenance 的污染记录）', () => {
    let nbRuleSet: StandardRuleSet;

    beforeAll(async () => {
      const store = new FileRuleStore();
      const loaded = await store.getCompleteStandard(NB_STANDARD_ID);
      if (!loaded) throw new Error(`Failed to load standard ${NB_STANDARD_ID} from store`);
      nbRuleSet = loaded;
    });

    // 旧缓存形态：Tier 2 已把复合串改写为 yield_strength_rp02=0.2，无打标无 provenance
    const legacyPolluted02: TestRecord = {
      category: 'mechanical',
      property_key: 'yield_strength_rp02',
      measured_value_num: 0.2,
      measured_value_raw: '0.2',
      unit: 'MPa',
    };
    const legacyLegit334: TestRecord = {
      category: 'mechanical',
      property_key: 'yield_strength_rp02',
      measured_value_num: 334,
      measured_value_raw: '334、343 MPa',
      unit: 'MPa',
    };

    // 从适配器输出剥离 provenance、剔除正牌屈服记录，构造"旧缓存"记录集
    const buildLegacyRecords = (): TestRecord[] =>
      batchSpecimenToCertificateExtract(z26022cE1Batch, [NB_STANDARD_ID], NB_GRADE_KEY)
        .test_records.filter((r: any) => r.property_key !== 'yield_strength_rp02')
        .map((r: any) => {
          const rest = { ...r };
          delete rest.provenance;
          return rest as TestRecord;
        });

    const buildLegacyCert = (yieldPair: TestRecord[]): CertificateExtract => ({
      header: {
        certificate_no: 'LEGACY-Z26022C-E1',
        declared_standard: NB_STANDARD_ID,
        declared_grade: NB_GRADE_KEY,
        dimensions: { outer_diameter_mm: 15.0, wall_thickness_mm: 0.8 },
      },
      test_records: [...buildLegacyRecords(), ...yieldPair],
    });

    it('同级冲突（均无 provenance）：334 在前、0.2 在后 → 先到先赢，评估用 334 判 PASS', () => {
      const report = ComplianceEngine.evaluate(
        nbRuleSet,
        buildLegacyCert([legacyLegit334, legacyPolluted02])
      );

      const yieldItem = report.item_results.find((r) => r.property_key === 'yield_rp02');
      expect(yieldItem?.status).toBe('PASS');
      expect(yieldItem?.rounded_value).toBe(334);
      expect(report.summary.overall_status).toBe('PASS');
      expect(report.summary.fail_count).toBe(0);
    });

    it('同级冲突反序：0.2 在前、334 在后（均无 provenance）→ 先到先赢，评估用 0.2 判 FAIL（历史事故形态）', () => {
      const report = ComplianceEngine.evaluate(
        nbRuleSet,
        buildLegacyCert([legacyPolluted02, legacyLegit334])
      );

      const yieldItem = report.item_results.find((r) => r.property_key === 'yield_rp02');
      expect(yieldItem?.status).toBe('FAIL');
      // 评估确实采用了 0.2 记录；rounded_value 为 0 是因该规则 rounding_decimals=0，0.2 经 GB/T 8170 修约为 0
      expect(yieldItem?.measured_value_num).toBe(0.2);
      expect(yieldItem?.rounded_value).toBe(0);
      expect(report.summary.overall_status).toBe('FAIL');
    });

    it('0.2 在前、334 补 provenance=core → 优先级裁决高于数组顺序，评估仍用 334 判 PASS', () => {
      const report = ComplianceEngine.evaluate(nbRuleSet, buildLegacyCert([
        legacyPolluted02,
        { ...legacyLegit334, provenance: 'core' },
      ]));

      const yieldItem = report.item_results.find((r) => r.property_key === 'yield_rp02');
      expect(yieldItem?.status).toBe('PASS');
      expect(yieldItem?.rounded_value).toBe(334);
      expect(report.summary.overall_status).toBe('PASS');
      expect(report.summary.fail_count).toBe(0);
    });
  });
});
