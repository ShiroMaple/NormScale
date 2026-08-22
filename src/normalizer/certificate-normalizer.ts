import { CertificateExtract, CertificateExtractSchema, TestRecord } from '../schemas/certificate.schema';
import { RawCertificatePayload, RawTestRecordItem } from '../extractor/extractor.interface';
import { IRuleStore } from '../repository/rule-store.interface';
import { GradeNormalizer, NormalizedGradeResult } from './grade-normalizer';
import { PropertyKeyNormalizer } from './property-key-normalizer';
import { UnitNormalizer } from './unit-normalizer';
import { QualitativeNormalizer } from './qualitative-normalizer';
import { DimensionNormalizer } from './dimension-normalizer';

export interface NormalizationAuditLog {
  /** 转换时间戳 */
  timestamp: string;
  /** 牌号归一化结果详情 */
  grade_normalization: NormalizedGradeResult;
  /** 发生的物理量单位转换记录清单 */
  unit_conversions: Array<{
    property_key: string;
    from_unit?: string;
    to_unit: string;
    raw_value: unknown;
    converted_value: number;
    formula?: string;
  }>;
  /** 转换过程产生的警告/提示清单 (如未知牌号、无法识别的检验项、低置信度字段) */
  warnings: string[];
  /** 综合质检数据平均置信度 */
  overall_confidence: number;
}

export interface NormalizationResult {
  /** 100% 符合强类型契约的标准化质检对象 (可直接送入 ComplianceEngine) */
  certificate: CertificateExtract;
  /** 详尽的清洗转换审计日志 */
  audit_log: NormalizationAuditLog;
}

/**
 * ============================================================================
 * 质保书确定性归一化总控流水线 (Certificate Normalization Master Pipeline)
 * ============================================================================
 * 
 * 统筹调度 GradeNormalizer、PropertyKeyNormalizer、UnitNormalizer、
 * QualitativeNormalizer 与 DimensionNormalizer，将任意上游（DocEx / LLM）抽取的
 * 脏数据载荷转换为符合国家标准规范的 CertificateExtract 对象。
 * ============================================================================
 */
export class CertificateNormalizer {
  private gradeNormalizer: GradeNormalizer;

  constructor(ruleStore?: IRuleStore) {
    this.gradeNormalizer = new GradeNormalizer(ruleStore);
  }

  /**
   * 执行全量确定性清洗与归一化
   */
  public async normalize(payload: RawCertificatePayload): Promise<NormalizationResult> {
    const warnings: string[] = [];
    const unitConversions: NormalizationAuditLog['unit_conversions'] = [];

    // 1. 抬头信息 (Header) 清洗与牌号消歧
    const rawHeader = payload.header || {};
    const rawDeclaredStandard = String(this.unwrapValue(rawHeader.declared_standard) || 'GB/T 13296-2023').trim();
    const rawDeclaredGrade = String(this.unwrapValue(rawHeader.declared_grade) || '06Cr19Ni10').trim();

    // 牌号消歧
    const gradeRes = await this.gradeNormalizer.normalize(rawDeclaredGrade, rawDeclaredStandard);
    if (!gradeRes.is_matched) {
      warnings.push(gradeRes.message);
    }

    const cleanHeader = {
      certificate_no: String(this.unwrapValue(rawHeader.certificate_no) || 'UNKNOWN-NO').trim(),
      supplier_name: this.unwrapOptionalString(rawHeader.supplier_name),
      purchase_order_no: this.unwrapOptionalString(rawHeader.purchase_order_no),
      declared_standard: rawDeclaredStandard,
      declared_grade: gradeRes.primary_grade, // 统一使用消歧后的主牌号
      heat_number: this.unwrapOptionalString(rawHeader.heat_number),
      lot_number: this.unwrapOptionalString(rawHeader.lot_number),
      material_form: this.unwrapOptionalString(rawHeader.material_form),
      manufacturing_process: this.unwrapOptionalString(rawHeader.manufacturing_process),
      delivery_state: this.unwrapOptionalString(rawHeader.delivery_state),
      issue_date: this.unwrapOptionalString(rawHeader.issue_date),
      inspector_name: this.unwrapOptionalString(rawHeader.inspector_name),
      dimensions: DimensionNormalizer.normalize(
        payload.dimensions as Record<string, unknown> | undefined
      ),
    };

    // 2. 检验项目清单 (Test Records) 逐项归一化
    const cleanTestRecords: TestRecord[] = [];
    const rawRecords = payload.test_records || [];

    for (const item of rawRecords) {
      const normalizedItem = this.normalizeSingleRecord(item, unitConversions, warnings);
      if (normalizedItem) {
        cleanTestRecords.push(normalizedItem);
      }
    }

    const certExtractCandidate: CertificateExtract = {
      header: cleanHeader,
      test_records: cleanTestRecords,
    };

    // 3. 经过 Zod Schema 契约校验
    const validatedCertificate = CertificateExtractSchema.parse(certExtractCandidate);

    return {
      certificate: validatedCertificate,
      audit_log: {
        timestamp: new Date().toISOString(),
        grade_normalization: gradeRes,
        unit_conversions: unitConversions,
        warnings,
        overall_confidence: payload.overall_confidence ?? 0.95,
      },
    };
  }

  /**
   * 内部方法：单条检验项清洗
   */
  private normalizeSingleRecord(
    item: RawTestRecordItem,
    unitConversions: NormalizationAuditLog['unit_conversions'],
    warnings: string[]
  ): TestRecord | undefined {
    if (!item.raw_property_name) return undefined;

    // (a) 属性名与检验类别归一化
    const propRes = PropertyKeyNormalizer.normalize(item.raw_property_name, item.raw_category);
    if (!propRes.is_known) {
      warnings.push('未识别的标准检验项目: ' + item.raw_property_name);
    }

    const record: TestRecord = {
      category: propRes.category,
      property_key: propRes.property_key,
      sub_property: propRes.sub_property,
      measured_value_raw: String(item.raw_value ?? ''),
      test_method_standard: item.raw_test_method,
    };

    // (b) 根据类别进行数值/定性分支清洗
    if (propRes.category === 'chemical') {
      // 化学成分 -> 百分比含量
      try {
        const norm = UnitNormalizer.normalizePercentage(item.raw_value, item.raw_unit);
        record.measured_value_num = norm.value;
        record.unit = '%';
      } catch (err) {
        warnings.push('化学成分 [' + propRes.property_key + '] 数值解析失败: ' + String(err));
      }
    } else if (propRes.category === 'mechanical') {
      // 力学性能 -> 强度(MPa) / 伸长率(%) / 硬度
      if (propRes.property_key === 'elongation_A') {
        const norm = UnitNormalizer.normalizePercentage(item.raw_value, item.raw_unit);
        record.measured_value_num = norm.value;
        record.unit = '%';
      } else if (propRes.property_key === 'hardness') {
        // 硬度数值清洗
        try {
          const norm = UnitNormalizer.normalizeDimension(item.raw_value); // 纯数字剥离
          record.measured_value_num = norm.value;
          record.unit = propRes.sub_property || 'HRB';
        } catch {}
      } else {
        // 抗拉/屈服强度 -> MPa 转换
        try {
          const norm = UnitNormalizer.normalizeStrength(item.raw_value, item.raw_unit);
          record.measured_value_num = norm.value;
          record.unit = 'MPa';
          if (norm.is_converted) {
            unitConversions.push({
              property_key: propRes.property_key,
              from_unit: norm.original_unit,
              to_unit: norm.target_unit,
              raw_value: item.raw_value,
              converted_value: norm.value,
              formula: norm.conversion_formula,
            });
          }
        } catch (err) {
          warnings.push('力学强度 [' + propRes.property_key + '] 数值解析失败: ' + String(err));
        }
      }
    } else if (propRes.category === 'metallographic') {
      // 金相组织/晶粒度 -> 纯数值 (级)
      try {
        const norm = UnitNormalizer.normalizeDimension(item.raw_value);
        record.measured_value_num = norm.value;
        record.unit = '级';
      } catch {}
    } else {
      // 工艺、无损、腐蚀等定性项目 -> PASS / FAIL / NOT_TESTED 归一化
      const qualRes = QualitativeNormalizer.normalize(item.raw_value);
      record.qualitative_result = qualRes.qualitative_result;
      if (qualRes.claimed_level) {
        record.measured_level_claimed = qualRes.claimed_level;
      }
    }

    return record;
  }

  private unwrapValue(val: unknown): unknown {
    if (val && typeof val === 'object' && 'value' in val) {
      return (val as { value: unknown }).value;
    }
    return val;
  }

  private unwrapOptionalString(val: unknown): string | undefined {
    const v = this.unwrapValue(val);
    return v ? String(v).trim() : undefined;
  }
}
