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

  it('应该正确将解耦的 ndt_et、ndt_ut 与 additional_tests 弹性数组装配至 BatchSpecimen', () => {
    const extractor = new OpenAiCompatibleExtractor();
    const rawExtract = {
      header: {
        certificateNo: 'MTC-2026-NDT',
        declaredStandard: 'GB/T 13296-2023',
        declaredGrade: 'S32168',
      },
      batches: [
        {
          batchNo: 'BATCH-NDT-01',
          chemical: [],
          mechanical: { tensile_rm: '620 MPa' },
          process: {
            flattening: '合格',
            flaring: '合格',
            intergranularCorrosion: '合格',
            ndt_et: '合格 (GB/T 7735)',
            ndt_ut: '合格 (GB/T 5777)',
          },
          additional_tests: [
            {
              key: 'proc_hydraulic',
              name: '水压试验',
              category: 'process',
              standard: 'GB/T 241',
              result: '20MPa 稳压 10s 合格',
              value_num: 20,
              unit: 'MPa',
              conclusion: 'PASS',
            },
            {
              key: 'ndt_pt',
              name: '渗透检测',
              category: 'ndt',
              result: '无表面裂纹及缺陷',
            },
          ],
        },
      ],
    };

    const doc = extractor.formatToSessionDocument('doc_ndt', 'ndt_test.pdf', '0.8 MB', rawExtract);
    const batch = doc.batches[0];
    expect(batch).toBeDefined();
    expect(batch?.process.ndt_et).toBe('合格 (GB/T 7735)');
    expect(batch?.process.ndt_ut).toBe('合格 (GB/T 5777)');
    expect(batch?.process.ndt).toContain('合格');

    // 验证 additionalTests 弹性数组
    expect(batch?.additionalTests).toHaveLength(2);
    expect(batch?.additionalTests?.[0]?.key).toBe('proc_hydraulic');
    expect(batch?.additionalTests?.[0]?.name).toBe('水压试验');
    expect(batch?.additionalTests?.[0]?.value_num).toBe(20);
    expect(batch?.additionalTests?.[1]?.key).toBe('ndt_pt');
    expect(batch?.additionalTests?.[1]?.result).toBe('无表面裂纹及缺陷');
  });

  it('parseCleanJson 应该安全剥离 markdown 代码块并解析对象', () => {
    const extractor = new OpenAiCompatibleExtractor();
    const markdownJson = '```json\n{"header": {"certificateNo": "TEST-123"}}\n```';
    const parsed = extractor.parseCleanJson(markdownJson);
    expect(parsed.header?.certificateNo).toBe('TEST-123');

    const rawJson = '{"valid": true}';
    expect(extractor.parseCleanJson(rawJson)).toEqual({ valid: true });

    const brokenJson = '{"broken: ';
    expect(extractor.parseCleanJson(brokenJson)).toEqual({});
  });

  it('extractStream 能够正确消费 SSE 数据流并在 onChunk 收到增量更新', async () => {
    const extractor = new OpenAiCompatibleExtractor({ apiKey: 'sk-test-mock-key' });

    // Mock global.fetch 模拟 SSE 流式传输
    const originalFetch = global.fetch;
    const makeChunk = (content: string) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

    const sseChunks = [
      makeChunk('{"header":{"certificateNo":"'),
      makeChunk('STREAM-MTC-888'),
      makeChunk('"}}'),
      'data: [DONE]\n\n',
    ];

    let chunkIndex = 0;
    const mockStream = new ReadableStream({
      pull(controller) {
        if (chunkIndex < sseChunks.length) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(sseChunks[chunkIndex]!));
          chunkIndex++;
        } else {
          controller.close();
        }
      },
    });

    global.fetch = async () => {
      return {
        ok: true,
        status: 200,
        body: mockStream,
      } as any;
    };

    try {
      const receivedDeltas: string[] = [];
      const payload = await extractor.extractStream(
        'sample text',
        { filename: 'stream.pdf' },
        (delta) => {
          receivedDeltas.push(delta);
        }
      );

      expect(receivedDeltas.length).toBeGreaterThan(0);
      expect(receivedDeltas.join('')).toContain('STREAM-MTC-888');
      expect(payload.header?.certificate_no).toBe('STREAM-MTC-888');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

