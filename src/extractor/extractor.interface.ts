/**
 * ============================================================================
 * 质保书提取抽象接口契约 (Certificate Extractor Interface Contracts)
 * ============================================================================
 * 
 * 遵循依赖倒置原则（DIP），将上游多源异构的抽取能力（如外部 DocEx 微服务、
 * 多模态大模型 Vision 直连提取、本地离线 Mock 样本）抽象为统一的契约接口。
 * 
 * 无论抽取后端为何种实现，输出均统一封装为包含 OCR 原始字段与置信度的 RawCertificatePayload，
 * 随后流转至 normalizer 归一化层进行纯代码清洗与消歧。
 * ============================================================================
 */

/**
 * 提取请求的配置选项
 */
export interface ExtractOptions {
  /** 请求超时时间（毫秒，默认 30000ms） */
  timeoutMs?: number;
  /** 是否要求提取器返回每个字段的 OCR/LLM 置信度打分（0.0 ~ 1.0） */
  enableOcrConfidence?: boolean;
  /** 自定义特定提取提示词（用于针对特殊排版质保书的增强提取） */
  customPrompt?: string;
}

/**
 * 带有置信度与原文坐标框的原始字段封装
 */
export interface RawExtractedField<T = unknown> {
  /** 提取解析出的初步值（可能包含原始异构单位或字符串） */
  value: T;
  /** OCR 识别出的未经处理的原始文本字符串（例如："520 N/mm2" 或 "Φ25×2.0"） */
  raw_text?: string;
  /** 该字段的识别置信度（0.0 ~ 1.0，低于 0.85 时可在 Phase 4 触发人机复核） */
  confidence?: number;
  /** OCR 在原始文档图像中的像素或比例坐标框 [ymin, xmin, ymax, xmax]（用于前端高亮溯源） */
  bbox?: [number, number, number, number];
  /** 位于质保书的页码（1-indexed） */
  page_index?: number;
}

/**
 * 原始质检记录条目（未经过归一化清洗前的异构数据）
 */
export interface RawTestRecordItem {
  /** 检验类别或原始分栏名（如："化学成分"、"力学拉伸"、"无损检测"） */
  raw_category?: string;
  /** 原始检验项目名称（如："C"、"屈服强度"、"ReH"、"抗拉强度"、"压扁试验"） */
  raw_property_name: string;
  /** 原始实测数值或字符串（如："520 MPa"、"0.04%"、"<0.01"、"无裂纹"） */
  raw_value: unknown;
  /** 原始标注单位（如："MPa"、"N/mm²"、"kgf/mm²"、"%"、"J"，可能为空） */
  raw_unit?: string;
  /** 原始标注的标准方法或试验条件（如："GB/T 228.1"、"Method_E"） */
  raw_test_method?: string;
  /** 该项的提取置信度 */
  confidence?: number;
}

/**
 * 质保书原始抽取结果有效载荷（Raw Extraction Payload）
 * 承载从 PDF/扫描件提取出的未清洗结构化对象
 */
export interface RawCertificatePayload {
  /** 质保书抬头信息（未清洗） */
  header?: {
    /** 质量证明书编号 */
    certificate_no?: string | RawExtractedField<string>;
    /** 生产厂家 / 供应商名称 */
    supplier_name?: string | RawExtractedField<string>;
    /** 客户采购订单号 / 合同号 */
    purchase_order_no?: string | RawExtractedField<string>;
    /** 质保书上声称执行的技术标准（如："GB/T 13296-2023"、"ASTM A213"） */
    declared_standard?: string | RawExtractedField<string>;
    /** 质保书上声称的材料牌号（如："06Cr19Ni10"、"SUS 304"、"TP-316L"） */
    declared_grade?: string | RawExtractedField<string>;
    /** 冶炼炉号（Heat / Cast Number） */
    heat_number?: string | RawExtractedField<string>;
    /** 轧制/生产批号（Lot / Batch Number） */
    lot_number?: string | RawExtractedField<string>;
    /** 产品交货形态（如："无缝钢管"、"tube_seamless"） */
    material_form?: string | RawExtractedField<string>;
    /** 制造工艺（如："冷拔"、"热轧"、"cold_drawn"） */
    manufacturing_process?: string | RawExtractedField<string>;
    /** 交货状态（如："固溶酸洗"、"光亮退火"） */
    delivery_state?: string | RawExtractedField<string>;
    /** 发货/签发日期 */
    issue_date?: string | RawExtractedField<string>;
    /** 签发质检员/质量负责人 */
    inspector_name?: string | RawExtractedField<string>;
  };
  /** 规格尺寸原始信息（可能为单一复合字符串或已拆分键值） */
  dimensions?: {
    /** 复合规格表达式（如："Φ25×2.0×6000" 或 "25*2.0*6000mm"） */
    specification_raw?: string | RawExtractedField<string>;
    /** 公称外径数值或带单位字符串 */
    outer_diameter?: number | string | RawExtractedField<number | string>;
    /** 公称壁厚数值或带单位字符串 */
    wall_thickness?: number | string | RawExtractedField<number | string>;
    /** 长度数值或带单位字符串 */
    length?: number | string | RawExtractedField<number | string>;
    /** 壁厚交货方式（如："最小壁厚"、"公称壁厚"） */
    delivery_mode?: string | RawExtractedField<string>;
  };
  /** 质保书正文实测检验项目清单（包含理化、力学、工艺、探伤等） */
  test_records?: RawTestRecordItem[];
  /** 非结构化附注条款或特殊声明文本清单 */
  unstructured_notes?: string[];
  /** 整体抽取的平均置信度（0.0 ~ 1.0） */
  overall_confidence?: number;
  /** 原始提取来源标识（如："docex-http"、"direct-llm"、"mock-fixture"） */
  source_provider?: string;
}

/**
 * 质保书提取器通用契约接口
 */
export interface ICertificateExtractor {
  /** 提取器唯一标识名称 */
  readonly providerName: string;

  /**
   * 执行质保书文档的结构化抽取
   * @param input 文件 Buffer、二进制 Uint8Array 或 Base64 编码字符串
   * @param options 提取参数选项（超时、置信度等）
   * @returns 原始抽取载荷对象 RawCertificatePayload
   */
  extract(
    input: Buffer | Uint8Array | string,
    options?: ExtractOptions
  ): Promise<RawCertificatePayload>;

  /**
   * 检查提取器服务当前的可用性与健康状态
   */
  healthCheck?(): Promise<{ healthy: boolean; message?: string }>;
}
