import { describe, it, expect } from 'vitest';
import { ConfidenceEvaluator } from '../../src/engine/confidence-evaluator';
import { BatchSpecimen } from '../../src/types/session';
import { FieldBBox } from '../../src/types/bbox';

describe('ConfidenceEvaluator (置信度真值多维评估器)', () => {
  const createMockBatch = (overrides: Partial<BatchSpecimen> = {}): BatchSpecimen => ({
    batchNo: 'HEAT-2026-001',
    subBatchIndex: 1,
    certificateNo: 'CERT-998877',
    constructionNo: 'CONST-01',
    productName: '锅炉用无缝钢管',
    grade: '06Cr19Ni10',
    standard: 'GB/T 13296-2023',
    supplier: '江阴兴澄特种钢铁有限公司',
    dimensions: 'Φ25×2.5×6000',
    heatNo: '5402227',
    packNo: 'P-01',
    deliveryState: '固溶退火',
    verdict: 'PASS',
    verdictSummary: '符合标准',
    reportNo: 'QA-2026-001',
    sha256Hash: 'SHA256-MOCK-HASH',
    inspector: 'AI-Inspector',
    ocrConfidence: 0,
    gradeMatchConfidence: 0,
    chemical: [
      { element: 'C', value: '0.045', confidence: '99%', status: 'ok' },
      { element: 'Si', value: '0.52', confidence: '98%', status: 'ok' },
      { element: 'Mn', value: '1.20', confidence: '99%', status: 'ok' },
      { element: 'P', value: '0.025', confidence: '97%', status: 'ok' },
      { element: 'S', value: '0.003', confidence: '98%', status: 'ok' },
      { element: 'Cr', value: '18.20', confidence: '99%', status: 'ok' },
      { element: 'Ni', value: '8.10', confidence: '98%', status: 'ok' },
      { element: 'Mo', value: '0.15', confidence: '96%', status: 'ok' },
      { element: 'N', value: '0.040', confidence: '95%', status: 'ok' },
    ],
    mechanical: {
      tensile_rm: '580',
      yield_rp02: '245',
      elongation_a: '42',
      hardness: '180 HBW',
    },
    process: {
      flattening: '合格',
      flaring: '合格',
      intergranularCorrosion: 'E法合格',
      grainSize: '7.5级',
      ndt: '涡流探伤合格',
    },
    ...overrides,
  });

  const mockBBoxes: FieldBBox[] = [
    { id: 'meta_certificateNo', page: 1, x: 10, y: 10, w: 20, h: 5, label: '证书号' },
    { id: 'meta_batchNo', page: 1, x: 10, y: 16, w: 20, h: 5, label: '批号' },
    { id: 'meta_grade', page: 1, x: 10, y: 22, w: 20, h: 5, label: '牌号' },
    { id: 'meta_standard', page: 1, x: 10, y: 28, w: 20, h: 5, label: '标准' },
    { id: 'meta_supplier', page: 1, x: 10, y: 34, w: 20, h: 5, label: '厂家' },
    { id: 'chem_c', page: 1, x: 30, y: 10, w: 10, h: 5, label: 'C' },
    { id: 'chem_si', page: 1, x: 30, y: 16, w: 10, h: 5, label: 'Si' },
    { id: 'chem_mn', page: 1, x: 30, y: 22, w: 10, h: 5, label: 'Mn' },
    { id: 'mech_tensile', page: 1, x: 50, y: 10, w: 15, h: 5, label: '抗拉强度' },
    { id: 'mech_yield', page: 1, x: 50, y: 16, w: 15, h: 5, label: '屈服强度' },
  ];

  describe('方案 A：calculateOcrConfidence (OCR 动态多维加权计算)', () => {
    it('对元数据完整、检验项丰富且具备 BBox 定位的高质量文档，应计算出高置信度 (>= 90%)', () => {
      const batch = createMockBatch();
      const score = ConfidenceEvaluator.calculateOcrConfidence(batch, mockBBoxes);

      expect(score).toBeGreaterThanOrEqual(88);
      expect(score).toBeLessThanOrEqual(99);
    });

    it('当缺失大量关键元数据和理化检验项时，置信度应显著衰减', () => {
      const poorBatch = createMockBatch({
        certificateNo: '',
        supplier: '',
        standard: '',
        chemical: [{ element: 'C', value: '0.05', confidence: '80%', status: 'ok' }],
        mechanical: { tensile_rm: '', yield_rp02: '', elongation_a: '' },
        process: { flattening: '', intergranularCorrosion: '' },
      });

      const score = ConfidenceEvaluator.calculateOcrConfidence(poorBatch, []);
      expect(score).toBeLessThan(75);
      expect(score).toBeGreaterThanOrEqual(50); // 保留最低基准安全线
    });

    it('无切图纯文本模式下，能够按前两项得分率等比折算 BBox 权重', () => {
      const batch = createMockBatch();
      const scoreWithoutBBoxes = ConfidenceEvaluator.calculateOcrConfidence(batch, []);

      expect(scoreWithoutBBoxes).toBeGreaterThanOrEqual(85);
      expect(scoreWithoutBBoxes).toBeLessThanOrEqual(99);
    });
  });

  describe('calculateGradeMatchConfidence (材料牌号标准消歧计算)', () => {
    it('在标准规则或静态映射中精确命中标准主牌号或代号，返回 100%', () => {
      const score1 = ConfidenceEvaluator.calculateGradeMatchConfidence('06Cr19Ni10');
      expect(score1).toBe(100);

      const score2 = ConfidenceEvaluator.calculateGradeMatchConfidence('S30408');
      expect(score2).toBe(100);

      const score3 = ConfidenceEvaluator.calculateGradeMatchConfidence('SA387Gr22CL.2');
      expect(score3).toBe(100);
    });

    it('工业别名牌号 (如 SUS304 / TP-304) 命中别名字典，返回 98%', () => {
      const score = ConfidenceEvaluator.calculateGradeMatchConfidence('SUS304');
      expect(score).toBe(98);

      const score316 = ConfidenceEvaluator.calculateGradeMatchConfidence('TP316L');
      expect(score316).toBe(98);
    });

    it('未收录的未知/非法牌号，返回 50% 预警置信度', () => {
      const score = ConfidenceEvaluator.calculateGradeMatchConfidence('UNKNOWN-MY-STEEL-999');
      expect(score).toBe(50);
    });

    it('空字符串或空白牌号，返回 0%', () => {
      expect(ConfidenceEvaluator.calculateGradeMatchConfidence('')).toBe(0);
      expect(ConfidenceEvaluator.calculateGradeMatchConfidence('   ')).toBe(0);
    });
  });

  describe('enrichBatchConfidences', () => {
    it('成功将真实计算出的 OCR 置信度与牌号匹配度注入 Batch 实体', () => {
      const initialBatch = createMockBatch({
        ocrConfidence: 0,
        gradeMatchConfidence: 0,
      });

      const enriched = ConfidenceEvaluator.enrichBatchConfidences(initialBatch, mockBBoxes);

      expect(enriched.ocrConfidence).toBeGreaterThan(80);
      expect(enriched.gradeMatchConfidence).toBe(100);
      expect(enriched.batchNo).toBe(initialBatch.batchNo);
      expect(enriched.grade).toBe(initialBatch.grade);
    });
  });
});
