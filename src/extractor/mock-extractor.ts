import {
  ICertificateExtractor,
  RawCertificatePayload,
  ExtractOptions,
} from './extractor.interface';
import { logger } from '../logger';

/**
 * ============================================================================
 * 本地确定性 Mock 质保书提取器 (Mock Certificate Extractor)
 * ============================================================================
 * 
 * 专为单元测试、离线演示以及在 DocEx API 未就绪时提供确定性的质保书抽取样本。
 * 能够模拟 LLM 抽取时产生的真实噪声数据（例如带有异构单位、别名牌号与复合尺寸字符串）。
 * ============================================================================
 */
export class MockCertificateExtractor implements ICertificateExtractor {
  public readonly providerName = 'mock-extractor';

  private presetPayloads: Map<string, RawCertificatePayload> = new Map();

  constructor(customPresets?: Record<string, RawCertificatePayload>) {
    this.registerDefaultPresets();
    if (customPresets) {
      for (const [key, payload] of Object.entries(customPresets)) {
        this.presetPayloads.set(key, payload);
      }
    }
  }

  /**
   * 注册默认的真实工业质保书模拟样本
   */
  private registerDefaultPresets(): void {
    // 样本 1: 经典 S30408 质保书（带有非标单位 kgf/mm²、牌号别名 SUS304、带单位字符串与压扁试验合格）
    this.presetPayloads.set('s30408_messy_sample', {
      source_provider: 'mock-extractor',
      overall_confidence: 0.96,
      header: {
        certificate_no: 'MTC-2026-08891',
        supplier_name: '江苏某特种合金钢管制造有限公司',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: 'SUS 304', // 别名形式
        heat_number: 'H260811',
        lot_number: 'L26081101',
        material_form: '无缝钢管',
        manufacturing_process: '冷拔',
        delivery_state: '固溶酸洗',
        issue_date: '2026-08-15',
      },
      dimensions: {
        specification_raw: 'Φ25.0×2.0×6000mm', // 复合规格表达式
        delivery_mode: '最小壁厚',
      },
      test_records: [
        { raw_category: '化学成分', raw_property_name: 'C', raw_value: '0.045 %', raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'Si', raw_value: 0.52, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'Mn', raw_value: '1.25%', raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'P', raw_value: 0.028, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'S', raw_value: '<0.005', raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'Ni', raw_value: 8.12, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'Cr', raw_value: 18.35, raw_unit: '%' },
        { raw_category: '力学性能', raw_property_name: '抗拉强度 Rm', raw_value: '565 MPa', raw_unit: 'MPa' },
        { raw_category: '力学性能', raw_property_name: '屈服强度 ReH (Rp0.2)', raw_value: '245 N/mm2', raw_unit: 'N/mm2' },
        { raw_category: '力学性能', raw_property_name: '断后伸长率 A', raw_value: '45.0 %', raw_unit: '%' },
        { raw_category: '力学性能', raw_property_name: '洛氏硬度', raw_value: '82 HRB', raw_unit: 'HRB' },
        { raw_category: '工艺性能', raw_property_name: '压扁试验', raw_value: '合格 (未见裂纹)', raw_unit: '' },
        { raw_category: '无损探伤', raw_property_name: '涡流探伤 ET', raw_value: 'PASS (E3H 验收合格)', raw_unit: '' },
        { raw_category: '无损探伤', raw_property_name: '超声波探伤 UT', raw_value: 'PASS (U2 验收合格)', raw_unit: '' },
        { raw_category: '耐腐蚀性能', raw_property_name: '晶间腐蚀 (E法)', raw_value: '无晶间腐蚀倾向 (合格)', raw_unit: '' },
      ],
      unstructured_notes: ['本批钢管经 1050℃ 固溶处理，水淬冷却，经酸洗钝化处理。'],
    });

    // 样本 2: 316L 不锈钢管（使用工程制 kgf/mm² 单位、TP-316L 别名、超声波探伤）
    this.presetPayloads.set('s31603_kgf_sample', {
      source_provider: 'mock-extractor',
      overall_confidence: 0.94,
      header: {
        certificate_no: 'MTC-2026-09102',
        supplier_name: '浙江某不锈钢管道实业有限公司',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: 'TP-316L', // 别名形式
        heat_number: 'H316L-992',
        lot_number: 'LOT-99201',
        material_form: '无缝钢管',
        manufacturing_process: '冷轧',
        delivery_state: '固溶退火',
      },
      dimensions: {
        outer_diameter: '38.0mm',
        wall_thickness: '3.0mm',
        length: '6000mm',
        delivery_mode: '最小壁厚',
      },
      test_records: [
        { raw_category: '化学成分', raw_property_name: 'C', raw_value: 0.022, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'Si', raw_value: 0.45, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'Mn', raw_value: 1.10, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'P', raw_value: 0.025, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'S', raw_value: 0.003, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'Ni', raw_value: 12.30, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'Cr', raw_value: 17.20, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'Mo', raw_value: 2.15, raw_unit: '%' },
        { raw_category: '力学性能', raw_property_name: 'Tensile Strength', raw_value: 58.5, raw_unit: 'kgf/mm²' }, // 58.5 * 9.80665 ≈ 573.68 MPa
        { raw_category: '力学性能', raw_property_name: 'Yield Strength (0.2%)', raw_value: 26.0, raw_unit: 'kgf/mm²' }, // 26.0 * 9.80665 ≈ 254.97 MPa
        { raw_category: '力学性能', raw_property_name: 'Elongation', raw_value: 48, raw_unit: '%' },
        { raw_category: '力学性能', raw_property_name: '布氏硬度', raw_value: '165 HBW', raw_unit: 'HBW' },
        { raw_category: '无损探伤', raw_property_name: '超声波探伤 UT', raw_value: '合格 (U2 等级)', raw_unit: '' },
      ],
    });

    // 样本 3: 未知/非标材料牌号样本（用于测试 HITL 人机协同断点挂起与质检员修正）
    this.presetPayloads.set('unknown_grade_sample', {
      source_provider: 'mock-extractor',
      overall_confidence: 0.96,
      header: {
        certificate_no: 'MTC-2026-UNKNOWN-88',
        supplier_name: '无锡某特种不锈钢管件制造厂',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: 'SUS 304H-Special', // 未知非标牌号
        heat_number: 'H-SPEC-009',
        lot_number: 'LOT-SPEC-00901',
        material_form: '无缝钢管',
        delivery_state: '固溶处理',
      },
      dimensions: {
        outer_diameter: '25.0mm',
        wall_thickness: '2.5mm',
        length: '6000mm',
      },
      test_records: [
        { raw_category: '化学成分', raw_property_name: 'C', raw_value: 0.052, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'Si', raw_value: 0.50, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'Mn', raw_value: 1.20, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'P', raw_value: 0.026, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'S', raw_value: 0.002, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'Ni', raw_value: 8.45, raw_unit: '%' },
        { raw_category: '化学成分', raw_property_name: 'Cr', raw_value: 18.25, raw_unit: '%' },
        { raw_category: '力学性能', raw_property_name: '抗拉强度 Rm', raw_value: '570 MPa', raw_unit: 'MPa' },
        { raw_category: '力学性能', raw_property_name: '屈服强度 ReH', raw_value: '250 MPa', raw_unit: 'MPa' },
        { raw_category: '力学性能', raw_property_name: '断后伸长率 A', raw_value: '45.0 %', raw_unit: '%' },
        { raw_category: '力学性能', raw_property_name: '洛氏硬度', raw_value: '80 HRB', raw_unit: 'HRB' },
        { raw_category: '工艺性能', raw_property_name: '压扁试验', raw_value: '合格 (未见裂纹)', raw_unit: '' },
        { raw_category: '无损探伤', raw_property_name: '涡流探伤 ET', raw_value: 'PASS (E3H 验收合格)', raw_unit: '' },
        { raw_category: '无损探伤', raw_property_name: '超声波探伤 UT', raw_value: 'PASS (U2 验收合格)', raw_unit: '' },
        { raw_category: '耐腐蚀性能', raw_property_name: '晶间腐蚀 (E法)', raw_value: '合格', raw_unit: '' },
      ],
    });
  }

  /**
   * 模拟执行抽取
   */
  public async extract(
    input: Buffer | Uint8Array | string,
    _options?: ExtractOptions
  ): Promise<RawCertificatePayload> {
    logger.info('EXTRACTOR', `[MockCertificateExtractor] 正在提取质保书数据 (模式: 本地仿真样本)...`);

    // 若入参为指定的预设键名，则直接返回对应预设样本
    if (typeof input === 'string' && this.presetPayloads.has(input)) {
      const payload = JSON.parse(JSON.stringify(this.presetPayloads.get(input)!));
      logger.info('EXTRACTOR', `[MockCertificateExtractor] 成功加载预设样本 [${input}]，共包含 ${payload.test_records?.length || 0} 条检验项`);
      return payload;
    }

    // 默认返回首个 S30408 典型样本
    const defaultPayload = this.presetPayloads.get('s30408_messy_sample')!;
    const payload = JSON.parse(JSON.stringify(defaultPayload));
    logger.info('EXTRACTOR', `[MockCertificateExtractor] 默认加载 S30408 典型样本，共包含 ${payload.test_records?.length || 0} 条检验项`);
    return payload;
  }

  /**
   * 注册或重写自定义 Mock 样本
   */
  public registerPreset(key: string, payload: RawCertificatePayload): void {
    this.presetPayloads.set(key, payload);
  }

  public async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true, message: 'Mock extractor is always available.' };
  }
}
