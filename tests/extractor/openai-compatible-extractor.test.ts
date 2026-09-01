import { describe, it, expect } from 'vitest';
import {
  OpenAiCompatibleExtractor,
  MissingApiKeyError,
} from '../../src/extractor/openai-compatible-extractor.ts';

describe('OpenAiCompatibleExtractor', () => {
  it('应该正确初始化并读取默认模型配置', () => {
    const extractor = new OpenAiCompatibleExtractor();
    expect(extractor.providerName).toBe('openai-compatible-extractor');
    expect((extractor as any).activeConfig.model).toMatch(/kimi-k2\.7-code/);
    expect((extractor as any).activeConfig.baseUrl).toBe('https://api.moonshot.cn/v1');
  });

  it('未配置 API Key 时调用 extract 应该抛出 MissingApiKeyError 且不执行伪造降级', async () => {
    // 强制指定一个不存在的环境变量名
    const extractor = new OpenAiCompatibleExtractor({ apiKey: 'NON_EXISTENT_ENV_KEY_12345' });
    // 临时清空可能影响测试的全局 key
    const oldKimi = process.env.KIMI_API_KEY;
    const oldMoonshot = process.env.MOONSHOT_API_KEY;
    const oldOpenAI = process.env.OPENAI_API_KEY;
    delete process.env.KIMI_API_KEY;
    delete process.env.MOONSHOT_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await expect(extractor.extract('sample text')).rejects.toThrow(MissingApiKeyError);
    } finally {
      if (oldKimi) process.env.KIMI_API_KEY = oldKimi;
      if (oldMoonshot) process.env.MOONSHOT_API_KEY = oldMoonshot;
      if (oldOpenAI) process.env.OPENAI_API_KEY = oldOpenAI;
    }
  });

  it('应该正确将结构化数据映射为 SessionDocument 实体', () => {
    const extractor = new OpenAiCompatibleExtractor();
    const rawExtract = {
      header: {
        certificate_no: 'MTC-TEST-001',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: 'S32168',
        supplier_name: '测试钢厂',
        heat_number: 'HEAT-999',
        heat_treatment_lot_number: 'LOT-888',
      },
      batches: [
        {
          batchNo: 'LOT-888-01',
          chemical: [{ element: 'C', value: '0.02', confidence: '99%' }],
          mechanical: { tensile_rm: '600 MPa', yield_rp02: '250 MPa', elongation_a: '50 %' },
        },
      ],
    };

    const doc = extractor.formatToSessionDocument('doc_test', 'test.pdf', '1.0 MB', rawExtract);
    expect(doc.docId).toBe('doc_test');
    expect(doc.filename).toBe('test.pdf');
    expect(doc.batches[0]?.certificateNo).toBe('MTC-TEST-001');
    expect(doc.batches[0]?.grade).toBe('S32168');
    expect(doc.batches[0]?.heatNo).toBe('HEAT-999');
  });
});
