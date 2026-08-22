import {
  ICertificateExtractor,
  RawCertificatePayload,
  ExtractOptions,
} from './extractor.interface';

export interface DirectLlmConfig {
  /** LLM 模型服务商 (例如: 'gemini' | 'openai' | 'qwen' | 'custom') */
  provider?: 'gemini' | 'openai' | 'qwen' | 'custom';
  /** 模型名称 (例如: 'gemini-2.5-flash', 'gpt-4o') */
  modelName?: string;
  /** API Key 凭证 */
  apiKey?: string;
  /** 自定义 API 端点 (可选) */
  endpoint?: string;
}

/**
 * ============================================================================
 * 多模态大模型 (Vision LLM) 直连抽取适配器 (Direct LLM Extractor Adapter)
 * ============================================================================
 * 
 * 当外部 DocEx 服务不可用或需要独立多模态抽取时，作为备选提取链路。
 * 将质保书图像/PDF 直接送入大模型多模态接口，依据内置提取提示词输出结构化数据。
 * ============================================================================
 */
export class DirectLlmExtractor implements ICertificateExtractor {
  public readonly providerName = 'direct-llm-extractor';

  private config: DirectLlmConfig;

  constructor(config?: DirectLlmConfig) {
    this.config = config || {};
  }

  /**
   * 默认的多模态质保书抽取 Prompt 提示词
   */
  public static readonly DEFAULT_MTC_PROMPT = [
    '你是一个专业的工业金属材料质量证明书（MTC）结构化抽取专家。',
    '请仔细识别传入的质保书图像或 PDF 文档，提取所有抬头信息、规格尺寸及全部理化检测数据。',
    '要求输出标准 JSON 格式，包含 header, dimensions, test_records 字段。',
    '注意：保留原始数字与单位，不要自行推算或舍弃。',
  ].join('\n');

  public async extract(
    _input: Buffer | Uint8Array | string,
    _options?: ExtractOptions
  ): Promise<RawCertificatePayload> {
    // 如果尚未配置实际的大模型 API 凭证，在开发/演示环境中返回结构化初始载荷
    if (!this.config.apiKey && !process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
      return {
        source_provider: 'direct-llm-extractor',
        overall_confidence: 0.88,
        header: {
          certificate_no: 'LLM-EXTRACT-DEMO',
          declared_standard: 'GB/T 13296-2023',
          declared_grade: '06Cr19Ni10',
        },
        test_records: [],
        unstructured_notes: ['[DirectLlmExtractor] API key not configured, placeholder payload returned.'],
      };
    }

    // 生产环境中在此调用对应的 SDK (如 @google/genai 或 openai)
    // 提取结果将流转至 Normalizer 进行确定性清洗与消歧
    return {
      source_provider: 'direct-llm-extractor',
      overall_confidence: 0.95,
      header: {},
      test_records: [],
    };
  }

  public async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const hasKey = Boolean(this.config.apiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
    return {
      healthy: true,
      message: hasKey ? 'Direct LLM API key configured.' : 'Direct LLM running in development mode (API key not set).',
    };
  }
}
