import {
  ICertificateExtractor,
  RawCertificatePayload,
  RawTestRecordItem,
  ExtractOptions,
} from './extractor.interface';
import { logger } from '../logger';
import { PerformanceProfiler } from '../logger/profiler';

export interface DocExHttpConfig {
  /** DocEx 抽取服务的基础 URL 地址 (例如: 'http://localhost:8000') */
  baseUrl?: string;
  /** 抽取服务访问 API Key / Token */
  apiKey?: string;
  /** 默认请求超时时间（毫秒，默认 45000ms） */
  defaultTimeoutMs?: number;
}

/**
 * ============================================================================
 * DocEx 外部抽取服务 HTTP REST 客户端适配器 (DocEx HTTP Extractor Adapter)
 * ============================================================================
 * 
 * 负责通过标准 HTTP REST API 与 DocEx 独立抽取微服务通信。
 * 遵循防腐层设计（Anticorruption Layer），将 DocEx 抽取的 JSON 结构隔离并
 * 映射为统一的 RawCertificatePayload。
 * ============================================================================
 */
export class DocExHttpExtractor implements ICertificateExtractor {
  public readonly providerName = 'docex-http-extractor';

  private baseUrl: string;
  private apiKey?: string;
  private defaultTimeoutMs: number;

  constructor(config?: DocExHttpConfig) {
    this.baseUrl = (config?.baseUrl || process.env.DOCEX_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
    this.apiKey = config?.apiKey || process.env.DOCEX_API_KEY;
    this.defaultTimeoutMs = config?.defaultTimeoutMs || 45000;
  }

  /**
   * 发起 HTTP 请求调用 DocEx 质保书提取端点
   */
  public async extract(
    input: Buffer | Uint8Array | string,
    options?: ExtractOptions
  ): Promise<RawCertificatePayload> {
    const timeoutMs = options?.timeoutMs || this.defaultTimeoutMs;
    const endpoint = this.baseUrl + '/api/v1/extract/mtc';

    logger.info('EXTRACTOR', `[DocExHttpExtractor] 发起远程 MTC 抽取请求: ${endpoint} (超时阈值: ${timeoutMs}ms)`);

    return (await PerformanceProfiler.profileAsync('EXTRACTOR', `DocEx 远程抽取 [${endpoint}]`, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        let body: string | FormData;
        const headers: Record<string, string> = {};

        if (this.apiKey) {
          headers['Authorization'] = 'Bearer ' + this.apiKey;
        }

        if (typeof input === 'string') {
          // Base64 编码或 JSON 文本传入
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify({
            document_base64: input,
            options: {
              custom_prompt: options?.customPrompt,
              enable_confidence: options?.enableOcrConfidence ?? true,
            },
          });
        } else {
          // 二进制 Buffer 转为 FormData 上传
          const formData = new FormData();
          const bufferData = input instanceof Uint8Array ? input : new Uint8Array(input);
          const blob = new Blob([bufferData as BlobPart], { type: 'application/pdf' });
          formData.append('file', blob, 'certificate.pdf');
          if (options?.customPrompt) {
            formData.append('custom_prompt', options.customPrompt);
          }
          body = formData;
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          logger.error('EXTRACTOR', `DocEx 服务响应异常 [HTTP ${response.status}]`, undefined, { errorText });
          throw new Error(
            'DocEx 提取服务响应异常 [HTTP ' + response.status + ']: ' + (errorText || response.statusText)
          );
        }

        const responseJson = (await response.json()) as Record<string, unknown>;
        const payload = this.mapDocExResponseToPayload(responseJson);

        logger.info(
          'EXTRACTOR',
          `DocEx 提取解析成功，获得 ${payload.test_records?.length || 0} 条检验项，声明牌号 [${payload.header?.declared_grade || '未标明'}]，OCR 置信度: ${payload.overall_confidence ?? 0.9}`
        );

        return payload;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          logger.warn('EXTRACTOR', `DocEx 请求超时 (${timeoutMs}ms) 被熔断拦截`);
          throw new Error('DocEx 提取服务请求超时 (' + timeoutMs + 'ms)');
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }, logger)).result;
  }

  /**
   * 将 DocEx 返回的原始 JSON 结构适配映射为统一的 RawCertificatePayload
   */
  private mapDocExResponseToPayload(rawResponse: Record<string, unknown>): RawCertificatePayload {
    // 若响应已是标准 payload 格式则直接返回
    if ('header' in rawResponse || 'test_records' in rawResponse) {
      return {
        ...rawResponse,
        source_provider: 'docex-http-extractor',
      } as RawCertificatePayload;
    }

    // 若为 DocEx 专有包装格式 (如 { status: 'success', data: { ... } })
    const data = (rawResponse.data || rawResponse.result || rawResponse) as Record<string, unknown>;

    return {
      source_provider: 'docex-http-extractor',
      header: (data.header as Record<string, unknown>) || {},
      dimensions: (data.dimensions as Record<string, unknown>) || {},
      test_records: (data.test_records as unknown as RawTestRecordItem[]) || [],
      unstructured_notes: (data.unstructured_notes as string[]) || [],
      overall_confidence: typeof data.confidence === 'number' ? data.confidence : 0.9,
    };
  }

  /**
   * 检查 DocEx 远程服务存活状态
   */
  public async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      const response = await fetch(this.baseUrl + '/health', { method: 'GET' });
      if (response.ok) {
        return { healthy: true, message: 'DocEx service is healthy.' };
      }
      return { healthy: false, message: 'DocEx health check failed with status ' + response.status };
    } catch (err) {
      return { healthy: false, message: 'Cannot connect to DocEx at ' + this.baseUrl + ': ' + String(err) };
    }
  }
}
