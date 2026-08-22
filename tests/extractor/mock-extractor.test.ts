import { describe, it, expect } from 'vitest';
import { MockCertificateExtractor } from '@/extractor/mock-extractor';
import { DocExHttpExtractor } from '@/extractor/docex-http-extractor';
import { DirectLlmExtractor } from '@/extractor/direct-llm-extractor';

describe('Extractor 提取适配层多后端测试', () => {
  it('MockCertificateExtractor 支持预设样本提取与健康检查', async () => {
    const mock = new MockCertificateExtractor();
    const health = await mock.healthCheck();
    expect(health.healthy).toBe(true);

    const payload = await mock.extract('s30408_messy_sample');
    expect(payload.header?.declared_grade).toBe('SUS 304');
    expect(payload.test_records?.length).toBeGreaterThanOrEqual(10);
  });

  it('DocExHttpExtractor 客户端适配器提供接口与健康检查机制', async () => {
    const docex = new DocExHttpExtractor({ baseUrl: 'http://127.0.0.1:9999' });
    expect(docex.providerName).toBe('docex-http-extractor');

    const health = await docex.healthCheck();
    expect(health.healthy).toBe(false); // 本地无 9999 端口服务
  });

  it('DirectLlmExtractor 提供内置多模态提取 Prompt 与备用链路', async () => {
    const llm = new DirectLlmExtractor();
    expect(DirectLlmExtractor.DEFAULT_MTC_PROMPT).toContain('质量证明书');

    const payload = await llm.extract('mock-base64');
    expect(payload.source_provider).toBe('direct-llm-extractor');
  });
});
