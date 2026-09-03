import { BatchSpecimen } from '../types/session';
import { FieldBBox } from '../types/bbox';
import { GradeNormalizer } from '../normalizer/grade-normalizer';
import { IRuleStore } from '../repository/rule-store.interface';

/**
 * ============================================================================
 * 质检批次 OCR 置信度与材料牌号匹配度真实多维评估器 (ConfidenceEvaluator)
 * ============================================================================
 * 
 * 核心设计原则：
 * 1. 彻底废除写死的静态常数 (95%)，建立基于数据质量与标准消歧的真值模型；
 * 2. OCR 置信度采用方案 A：元数据完整度 (30%) + 理化检验丰富度 (45%) + 视觉锚点覆盖率 (25%)；
 * 3. 牌号匹配度联动 GradeNormalizer：标准规格切片命中 (100%)、别名映射 (98%)、未收录 (50%)、空值 (0%)。
 * ============================================================================
 */
export class ConfidenceEvaluator {
  /**
   * 工业常见压力容器/合金结构钢/碳钢扩展知名主牌号字典 (同步快速匹配)
   */
  private static readonly EXTENDED_KNOWN_GRADES: Record<string, { primary: string; isStandardPrimary?: boolean }> = {
    // ASME / ASTM 铬钼钢与压力容器用钢 (如江阴兴澄特钢质保书常用 SA387Gr22CL.2)
    'SA387GR22CL2': { primary: 'SA-387 Gr.22 Cl.2', isStandardPrimary: true },
    'SA387GR22CL1': { primary: 'SA-387 Gr.22 Cl.1', isStandardPrimary: true },
    'SA387GR11CL2': { primary: 'SA-387 Gr.11 Cl.2', isStandardPrimary: true },
    'SA387GR12CL2': { primary: 'SA-387 Gr.12 Cl.2', isStandardPrimary: true },
    'SA516GR70': { primary: 'SA-516 Gr.70', isStandardPrimary: true },
    'SA516GR60': { primary: 'SA-516 Gr.60', isStandardPrimary: true },
    'SA106B': { primary: 'SA-106B', isStandardPrimary: true },
    'SA106C': { primary: 'SA-106C', isStandardPrimary: true },
    'SA335P22': { primary: 'SA-335 P22', isStandardPrimary: true },
    'SA335P91': { primary: 'SA-335 P91', isStandardPrimary: true },
    'SA335P11': { primary: 'SA-335 P11', isStandardPrimary: true },

    // GB 压力容器用钢与合金管
    'Q245R': { primary: 'Q245R', isStandardPrimary: true },
    'Q345R': { primary: 'Q345R', isStandardPrimary: true },
    'Q355R': { primary: 'Q355R', isStandardPrimary: true },
    '15CRMO': { primary: '15CrMo', isStandardPrimary: true },
    '12CR1MOV': { primary: '12Cr1MoV', isStandardPrimary: true },
    '15CRMOG': { primary: '15CrMoG', isStandardPrimary: true },
    '12CR1MOVG': { primary: '12Cr1MoVG', isStandardPrimary: true },
    '20G': { primary: '20G', isStandardPrimary: true },
    'Q235B': { primary: 'Q235B', isStandardPrimary: true },
    'Q345B': { primary: 'Q345B', isStandardPrimary: true },
    'Q355B': { primary: 'Q355B', isStandardPrimary: true },
  };

  /**
   * 方案 A：动态多维综合评估当前批次的 OCR 抽取置信度 (0~100)
   */
  public static calculateOcrConfidence(batch: BatchSpecimen, bboxes?: FieldBBox[]): number {
    if (!batch) return 0;

    // 1. 核心元数据完整度得分 (满分 30 分)
    let scoreMeta = 0;
    if (batch.certificateNo && batch.certificateNo.trim().length > 0) scoreMeta += 6;
    if ((batch.batchNo && batch.batchNo.trim().length > 0) || (batch.heatNo && batch.heatNo.trim().length > 0)) scoreMeta += 8;
    if (batch.grade && batch.grade.trim().length > 0) scoreMeta += 8;
    if (batch.supplier && batch.supplier.trim().length > 0) scoreMeta += 4;
    if (batch.standard && batch.standard.trim().length > 0) scoreMeta += 4;

    // 2. 理化与力学检验项丰富度与格式合规性 (满分 45 分)
    let scoreChemical = 0;
    const chemicalItems = Array.isArray(batch.chemical) ? batch.chemical : [];
    let validChemicalCount = 0;
    for (const item of chemicalItems) {
      const valStr = String(item.value || '').trim();
      const numVal = parseFloat(valStr);
      if (valStr.length > 0 && !isNaN(numVal)) {
        validChemicalCount++;
      }
    }
    // 每一个有效数字元素计 3 分，上限 25 分 (9项以上满分)
    scoreChemical = Math.min(25, validChemicalCount * 3);

    let scoreMechanical = 0;
    const mech = batch.mechanical || {};
    if (mech.tensile_rm && String(mech.tensile_rm).trim().length > 0) scoreMechanical += 6;
    if (mech.yield_rp02 && String(mech.yield_rp02).trim().length > 0) scoreMechanical += 6;
    if (mech.elongation_a && String(mech.elongation_a).trim().length > 0) scoreMechanical += 4;

    // 工艺、冲击、硬度或附加检验项
    const proc = batch.process || {};
    const hasProcess = Boolean(
      proc.flattening || proc.flaring || proc.intergranularCorrosion || proc.grainSize || proc.ndt || proc.ndt_et || proc.ndt_ut
    );
    const hasAdditional = Array.isArray(batch.additionalTests) && batch.additionalTests.length > 0;
    if (hasProcess || hasAdditional || mech.hardness) scoreMechanical += 4;

    const scoreProperties = scoreChemical + scoreMechanical;

    // 3. 视觉图层 BBox 锚点对齐覆盖率 (满分 25 分)
    let scoreBBox = 0;
    const totalExtractItems = 5 + chemicalItems.length + 4; // 基准核心项总计

    if (bboxes && bboxes.length > 0) {
      // 若提供了视觉定位框，计算视觉锚点覆盖率
      const ratio = Math.min(1.0, bboxes.length / totalExtractItems);
      scoreBBox = Math.round(ratio * 25);
    } else {
      // 若无切图 (纯文本场景)，按前两项得分率等比折算 25 分
      const baseRatio = (scoreMeta + scoreProperties) / 75;
      scoreBBox = Math.round(baseRatio * 25);
    }

    const totalRaw = scoreMeta + scoreProperties + scoreBBox;
    // 工业规范：置信度最高 99% (留出容错空间)，最低 50% (存在基础实体)
    return Math.max(50, Math.min(99, totalRaw));
  }

  /**
   * 联动 GradeNormalizer 标准消歧知识库计算材料牌号匹配度 (0~100)
   * 支持秒级同步静态别名消歧与未知牌号防御判断
   */
  public static calculateGradeMatchConfidence(
    grade: string,
    _standard?: string,
    _ruleStore?: IRuleStore
  ): number {
    const cleanGrade = (grade || '').trim();
    if (!cleanGrade) return 0;

    const cleanStr = GradeNormalizer.cleanRawGradeString(cleanGrade);
    const normKey = cleanStr.toUpperCase().replace(/[\s\-_/\\.]/g, '');

    // 1. 优先查 GradeNormalizer 的静态工业别名消歧表
    const staticMap = (GradeNormalizer as any).STATIC_ALIAS_MAP as Record<string, { primary: string; code: string }> | undefined;
    if (staticMap && staticMap[normKey]) {
      const mapped = staticMap[normKey];
      // 若本身就是标准主牌号或统一代号，视为精确切片命中 (100%)，若是常见工业别名映射则 98%
      const normPrimary = mapped.primary.toUpperCase().replace(/[\s\-_/\\]/g, '');
      const normCode = (mapped.code || '').toUpperCase().replace(/[\s\-_/\\]/g, '');
      if (normKey === normPrimary || normKey === normCode) {
        return 100;
      }
      return 98;
    }

    // 2. 查扩展常见压力容器与合金钢标准主牌号
    if (ConfidenceEvaluator.EXTENDED_KNOWN_GRADES[normKey]) {
      const item = ConfidenceEvaluator.EXTENDED_KNOWN_GRADES[normKey];
      return item.isStandardPrimary ? 100 : 98;
    }

    // 3. 常见规则模式模糊命中 (如 SA-387 系列、06Cr 系列、S3 系列)
    if (/^SA\s*387/i.test(cleanStr) || /^S[0-9]{5}$/i.test(normKey) || /^[0-9]{2,3}CR[0-9]+/i.test(normKey)) {
      return 98;
    }

    // 4. 未收录的未知/非法杂牌号，预警 50%
    return 50;
  }

  /**
   * 异步完整版牌号匹配度计算 (当需要穿透到 IRuleStore 动态倒排索引时使用)
   */
  public static async calculateGradeMatchConfidenceAsync(
    grade: string,
    standard?: string,
    ruleStore?: IRuleStore
  ): Promise<number> {
    const cleanGrade = (grade || '').trim();
    if (!cleanGrade) return 0;

    if (ruleStore) {
      const normalizer = new GradeNormalizer(ruleStore);
      const result = await normalizer.normalize(cleanGrade, standard);
      if (typeof result.confidence === 'number') {
        return Math.round(result.confidence * 100);
      }
      return result.is_matched ? 100 : 50;
    }

    return this.calculateGradeMatchConfidence(grade, standard);
  }

  /**
   * 批量将真实计算的置信度注入批次实体
   */
  public static enrichBatchConfidences(
    batch: BatchSpecimen,
    bboxes?: FieldBBox[],
    ruleStore?: IRuleStore
  ): BatchSpecimen {
    const ocrConf = this.calculateOcrConfidence(batch, bboxes);
    const gradeConf = this.calculateGradeMatchConfidence(batch.grade, batch.standard, ruleStore);

    return {
      ...batch,
      ocrConfidence: ocrConf,
      gradeMatchConfidence: gradeConf,
    };
  }
}
