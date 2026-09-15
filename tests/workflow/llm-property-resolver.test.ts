import { describe, it, expect } from 'vitest';
import { createLlmPropertyResolverNode } from '@/workflow/nodes/llm-property-resolver.node';
import { FileRuleStore } from '@/repository/file-rule-store';
import { QualityAuditState } from '@/workflow/state.interface';
import { LlmPropertyResolverService, LlmResolutionResult, CandidateRuleItem } from '@/workflow/services/llm-property-resolver.service';

describe('LLM Property Resolver (Tier 2 语义消歧与双模流转测试)', () => {
  const ruleStore = new FileRuleStore();

  const noKeyService = new LlmPropertyResolverService({
    id: 'no-key-test',
    name: 'No Key Test',
    provider: 'none',
    baseUrl: 'https://none',
    model: 'none',
    apiKey: '',
  });

  it('未配置 API Key 时非静默降级：长尾项目 (表面光洁度) 命中本地规则并打标 is_degraded: true', async () => {
    // 显式无 Key service，测试纯离线降级分支
    const resolver = createLlmPropertyResolverNode(ruleStore, noKeyService);

    const mockState: Partial<QualityAuditState> = {
      options: {
        forcedStandardId: 'NB/T 47019.5-2021',
        forcedGradeKey: 'S32168',
      },
      normalizedCert: {
        header: {
          certificate_no: 'TEST-CERT-01',
          declared_standard: 'NB/T 47019.5-2021',
          declared_grade: 'S32168',
        },
        test_records: [
          {
            category: 'surface',
            property_key: '表面光洁度',
            measured_value_raw: '0.33',
            measured_value_num: 0.33,
            unit: 'μm',
          },
        ],
      },
      unresolvedProperties: [
        {
          raw_name: '表面光洁度',
          raw_value: 0.33,
          raw_category: 'surface',
          unit: 'μm',
          source_tier: 'tier1',
          confidence: 0.5,
        },
      ],
    };

    const update = await resolver(mockState as QualityAuditState);

    // 1. 验证消歧列表
    expect(update.resolvedProperties).toBeDefined();
    expect(update.resolvedProperties!.length).toBe(1);
    const firstResolved = update.resolvedProperties![0]!;
    expect(firstResolved.resolved_key).toBe('surface_roughness');
    expect(firstResolved.confidence).toBeGreaterThanOrEqual(0.85);
    expect(firstResolved.source_tier).toBe('tier2');
    expect(firstResolved.is_degraded).toBe(true); // 验证非静默降级标记

    // 2. 验证 normalizedCert 中指标升级
    expect(update.normalizedCert?.test_records[0]?.property_key).toBe('surface_roughness');

    // 3. 验证 Trace 包含降级告警
    const degradeTrace = update.traces?.find(t => t.message.includes('降级'));
    expect(degradeTrace).toBeDefined();
  });

  it('未配置 API Key 时非静默降级：未知力学非标指标触发 PROPERTY_AMBIGUITY 人机协同挂起', async () => {
    const resolver = createLlmPropertyResolverNode(ruleStore, noKeyService);

    const mockState: Partial<QualityAuditState> = {
      options: {
        forcedStandardId: 'NB/T 47019.5-2021',
        forcedGradeKey: 'S32168',
      },
      normalizedCert: {
        header: {
          certificate_no: 'TEST-CERT-02',
          declared_standard: 'NB/T 47019.5-2021',
          declared_grade: 'S32168',
        },
        test_records: [
          {
            category: 'mechanical',
            property_key: '特种非标断裂韧度K1C',
            measured_value_raw: '85',
            measured_value_num: 85,
            unit: 'MPa·m1/2',
          },
        ],
      },
      unresolvedProperties: [
        {
          raw_name: '特种非标断裂韧度K1C',
          raw_value: 85,
          raw_category: 'mechanical',
          source_tier: 'tier1',
          confidence: 0.5,
        },
      ],
    };

    const update = await resolver(mockState as QualityAuditState);

    expect(update.hitlContext).toBeDefined();
    expect(update.hitlContext?.reason).toBe('PROPERTY_AMBIGUITY');
    expect(update.hitlContext?.prompt_message).toContain('特种非标断裂韧度K1C');
    expect(update.workflowStatus).toBe('awaiting_human_review');
  });

  it('大模型高置信度返回：Case 2 表面光洁度精准对齐，产出真实 Token 开销与模型名称', async () => {
    // 构造模拟的活跃模型 Service
    const mockService = new LlmPropertyResolverService({
      id: 'mock-deepseek',
      name: 'DeepSeek-V3 Mock',
      provider: 'openai-compatible',
      baseUrl: 'https://mock.api',
      model: 'deepseek-chat',
      apiKey: 'valid-test-key',
    });

    // Mock resolveProperties 返回
    mockService.resolveProperties = async (): Promise<LlmResolutionResult> => ({
      success: true,
      modelName: 'deepseek-chat',
      tokenUsage: {
        prompt_tokens: 156,
        completion_tokens: 42,
        total_tokens: 198,
        duration_ms: 320,
      },
      resolutions: [
        {
          raw_name: '表面光洁度',
          resolved_key: 'surface_roughness',
          confidence: 0.96,
          reasoning: '表面光洁度即粗糙度旧称，单位为微米',
        },
      ],
    });

    const resolver = createLlmPropertyResolverNode(ruleStore, mockService);

    const mockState: Partial<QualityAuditState> = {
      options: {
        forcedStandardId: 'NB/T 47019.5-2021',
        forcedGradeKey: 'S32168',
      },
      normalizedCert: {
        header: {
          certificate_no: 'CASE2-CERT',
          declared_standard: 'NB/T 47019.5-2021',
          declared_grade: 'S32168',
        },
        test_records: [
          {
            category: 'surface',
            property_key: '表面光洁度',
            measured_value_raw: '0.33',
            measured_value_num: 0.33,
            unit: 'μm',
          },
        ],
      },
      unresolvedProperties: [
        {
          raw_name: '表面光洁度',
          raw_value: 0.33,
          raw_category: 'surface',
          unit: 'μm',
          source_tier: 'tier1',
          confidence: 0.5,
        },
      ],
    };

    const update = await resolver(mockState as QualityAuditState);

    expect(update.resolvedProperties).toBeDefined();
    expect(update.resolvedProperties!.length).toBe(1);
    const resolved = update.resolvedProperties![0]!;
    expect(resolved.resolved_key).toBe('surface_roughness');
    expect(resolved.confidence).toBe(0.96);
    expect(resolved.is_degraded).toBe(false); // 真实模型对齐，无降级
    expect(resolved.model_name).toBe('deepseek-chat');

    // 验证真实 Token 透传
    expect(update.tokenUsage).toBeDefined();
    expect(update.tokenUsage?.prompt_tokens).toBe(156);
    expect(update.tokenUsage?.completion_tokens).toBe(42);
    expect(update.tokenUsage?.total_tokens).toBe(198);
  });

  it('大模型低置信度/不匹配返回：Case 4 特异非标项触发 PROPERTY_AMBIGUITY 挂起', async () => {
    const mockService = new LlmPropertyResolverService({
      id: 'mock-openai',
      name: 'GPT-4o Mock',
      provider: 'openai-compatible',
      baseUrl: 'https://mock.api',
      model: 'gpt-4o',
      apiKey: 'valid-test-key',
    });

    mockService.resolveProperties = async (): Promise<LlmResolutionResult> => ({
      success: true,
      modelName: 'gpt-4o',
      tokenUsage: {
        prompt_tokens: 210,
        completion_tokens: 30,
        total_tokens: 240,
        duration_ms: 450,
      },
      resolutions: [
        {
          raw_name: '特种非标微区抗剪切断裂韧度K1C',
          resolved_key: null,
          confidence: 0.3,
          reasoning: '标准规则池中无任何微区抗剪切规则',
        },
      ],
    });

    const resolver = createLlmPropertyResolverNode(ruleStore, mockService);

    const mockState: Partial<QualityAuditState> = {
      options: {
        forcedStandardId: 'NB/T 47019.5-2021',
        forcedGradeKey: 'S32168',
      },
      normalizedCert: {
        header: {
          certificate_no: 'CASE4-CERT',
          declared_standard: 'NB/T 47019.5-2021',
          declared_grade: 'S32168',
        },
        test_records: [
          {
            category: 'mechanical',
            property_key: '特种非标微区抗剪切断裂韧度K1C',
            measured_value_raw: '85',
            measured_value_num: 85,
            unit: 'MPa·m1/2',
          },
        ],
      },
      unresolvedProperties: [
        {
          raw_name: '特种非标微区抗剪切断裂韧度K1C',
          raw_value: 85,
          raw_category: 'mechanical',
          source_tier: 'tier1',
          confidence: 0.5,
        },
      ],
    };

    const update = await resolver(mockState as QualityAuditState);

    expect(update.hitlContext).toBeDefined();
    expect(update.hitlContext?.reason).toBe('PROPERTY_AMBIGUITY');
    expect(update.hitlContext?.prompt_message).toContain('特种非标微区抗剪切断裂韧度K1C');
    expect(update.workflowStatus).toBe('awaiting_human_review');
    expect(update.tokenUsage?.total_tokens).toBe(240);
  });

  it('大模型调用异常或超时时平滑非静默降级为本地规则', async () => {
    const mockService = new LlmPropertyResolverService({
      id: 'mock-fail',
      name: 'Fail Mock',
      provider: 'openai-compatible',
      baseUrl: 'https://mock.api',
      model: 'fail-model',
      apiKey: 'valid-test-key',
    });

    // 模拟网络异常
    mockService.resolveProperties = async (): Promise<LlmResolutionResult> => ({
      success: false,
      error: 'TIMEOUT_AFTER_5000MS',
    });

    const resolver = createLlmPropertyResolverNode(ruleStore, mockService);

    const mockState: Partial<QualityAuditState> = {
      options: {
        forcedStandardId: 'NB/T 47019.5-2021',
        forcedGradeKey: 'S32168',
      },
      normalizedCert: {
        header: {
          certificate_no: 'TIMEOUT-CERT',
          declared_standard: 'NB/T 47019.5-2021',
          declared_grade: 'S32168',
        },
        test_records: [
          {
            category: 'surface',
            property_key: '表面光洁度',
            measured_value_raw: '0.33',
            measured_value_num: 0.33,
            unit: 'μm',
          },
        ],
      },
      unresolvedProperties: [
        {
          raw_name: '表面光洁度',
          raw_value: 0.33,
          raw_category: 'surface',
          unit: 'μm',
          source_tier: 'tier1',
          confidence: 0.5,
        },
      ],
    };

    const update = await resolver(mockState as QualityAuditState);

    // 验证降级成功解析
    expect(update.resolvedProperties).toBeDefined();
    expect(update.resolvedProperties![0]?.resolved_key).toBe('surface_roughness');
    expect(update.resolvedProperties![0]?.is_degraded).toBe(true);

    // 验证 Trace 记录降级警告
    const trace = update.traces?.find(t => t.message.includes('降级告警'));
    expect(trace).toBeDefined();
  });

  it('启发式边界加严：proc_hydraulic (液压试验) 绝不误匹配粗糙度 (杜绝 hydRAulic 包含 RA 陷阱)', async () => {
    const resolver = createLlmPropertyResolverNode(ruleStore, noKeyService);

    const mockState: Partial<QualityAuditState> = {
      options: {
        forcedStandardId: 'NB/T 47019.5-2021',
        forcedGradeKey: 'S32168',
      },
      normalizedCert: {
        header: {
          certificate_no: 'HYDRAULIC-TEST-CERT',
          declared_standard: 'NB/T 47019.5-2021',
          declared_grade: 'S32168',
        },
        test_records: [
          {
            category: 'process',
            property_key: 'proc_hydraulic',
            measured_value_raw: '20 MPa 稳压 10s 无渗漏合格',
            measured_value_num: 20,
            unit: 'MPa',
          },
        ],
      },
      unresolvedProperties: [
        {
          raw_name: 'proc_hydraulic',
          raw_value: '20 MPa 稳压 10s 无渗漏合格',
          raw_category: 'process',
          unit: 'MPa',
          source_tier: 'tier1',
          confidence: 0.5,
        },
      ],
    };

    const update = await resolver(mockState as QualityAuditState);

    // 验证 resolvedProperties 中绝不包含 surface_roughness
    const matchedRoughness = update.resolvedProperties?.find(r => r.resolved_key === 'surface_roughness');
    expect(matchedRoughness).toBeUndefined();

    // 验证 normalizedCert 中 proc_hydraulic 绝不会被覆写为 surface_roughness
    expect(update.normalizedCert?.test_records[0]?.property_key).not.toBe('surface_roughness');
  });

  it('fill-only 核心槽位保护：LLM 高置信指向已被占用槽位 (yield_rp02) 时放弃覆写，原 334 MPa 记录不变并转入待决池', async () => {
    const mockService = new LlmPropertyResolverService({
      id: 'mock-slot-guard',
      name: 'Slot Guard Mock',
      provider: 'openai-compatible',
      baseUrl: 'https://mock.api',
      model: 'gpt-4o',
      apiKey: 'valid-test-key',
    });

    mockService.resolveProperties = async (): Promise<LlmResolutionResult> => ({
      success: true,
      modelName: 'gpt-4o',
      tokenUsage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        duration_ms: 200,
      },
      resolutions: [
        {
          raw_name: '复合拉伸屈服综合试验项',
          resolved_key: 'yield_rp02',
          confidence: 0.96,
          reasoning: '语义指向规定塑性延伸强度',
        },
      ],
    });

    const resolver = createLlmPropertyResolverNode(ruleStore, mockService);

    const mockState: Partial<QualityAuditState> = {
      options: {
        forcedStandardId: 'NB/T 47019.5-2021',
        forcedGradeKey: 'S32168',
      },
      normalizedCert: {
        header: {
          certificate_no: 'SLOT-GUARD-CERT',
          declared_standard: 'NB/T 47019.5-2021',
          declared_grade: 'S32168',
        },
        test_records: [
          {
            category: 'mechanical',
            property_key: 'yield_strength_rp02',
            measured_value_raw: '334',
            measured_value_num: 334,
            unit: 'MPa',
          },
          {
            category: 'mechanical',
            property_key: '复合拉伸屈服综合试验项',
            raw_property_name: '复合拉伸屈服综合试验项',
            measured_value_raw: '268',
            measured_value_num: 268,
            unit: 'MPa',
          },
        ],
      },
      unresolvedProperties: [
        {
          raw_name: '复合拉伸屈服综合试验项',
          raw_value: 268,
          raw_category: 'mechanical',
          unit: 'MPa',
          source_tier: 'tier1',
          confidence: 0.5,
        },
      ],
    };

    const update = await resolver(mockState as QualityAuditState);

    // 1. 高置信 LLM 结果被 fill-only 守卫拦截：不进入 resolvedList
    expect(update.resolvedProperties).toBeDefined();
    expect(update.resolvedProperties!.length).toBe(0);

    // 2. 该项转入待决池，reason 说明槽位已被占用
    expect(update.unresolvedProperties).toBeDefined();
    expect(update.unresolvedProperties!.length).toBe(1);
    const ambiguous = update.unresolvedProperties![0]!;
    expect(ambiguous.raw_name).toBe('复合拉伸屈服综合试验项');
    expect(ambiguous.reasoning).toContain('占用');

    // 3. 长尾 record 未被改写
    expect(update.normalizedCert?.test_records[1]?.property_key).toBe('复合拉伸屈服综合试验项');
    expect((update.normalizedCert?.test_records[1] as Record<string, unknown> | undefined)?.['provenance']).toBeUndefined();

    // 4. 原 334 MPa 的 yield_strength_rp02 记录保持不变
    expect(update.normalizedCert?.test_records[0]?.property_key).toBe('yield_strength_rp02');
    expect(update.normalizedCert?.test_records[0]?.measured_value_num).toBe(334);
  });

  it('候选池扣除：已在 test_records 中匹配到值的规则 key 不出现在传给 LLM service 的 candidateRules 中', async () => {
    const mockService = new LlmPropertyResolverService({
      id: 'mock-pool-deduction',
      name: 'Pool Deduction Mock',
      provider: 'openai-compatible',
      baseUrl: 'https://mock.api',
      model: 'gpt-4o',
      apiKey: 'valid-test-key',
    });

    let capturedCandidates: CandidateRuleItem[] | undefined;
    mockService.resolveProperties = async (
      _unresolved,
      candidates
    ): Promise<LlmResolutionResult> => {
      capturedCandidates = candidates;
      return {
        success: true,
        modelName: 'gpt-4o',
        tokenUsage: {
          prompt_tokens: 80,
          completion_tokens: 10,
          total_tokens: 90,
          duration_ms: 150,
        },
        resolutions: [
          {
            raw_name: '特种非标断裂韧度K1C',
            resolved_key: null,
            confidence: 0.3,
            reasoning: '标准规则池中无任何韧度规则',
          },
        ],
      };
    };

    const resolver = createLlmPropertyResolverNode(ruleStore, mockService);

    const mockState: Partial<QualityAuditState> = {
      options: {
        forcedStandardId: 'NB/T 47019.5-2021',
        forcedGradeKey: 'S32168',
      },
      normalizedCert: {
        header: {
          certificate_no: 'POOL-DEDUCTION-CERT',
          declared_standard: 'NB/T 47019.5-2021',
          declared_grade: 'S32168',
        },
        test_records: [
          {
            category: 'metallographic',
            property_key: 'grain_size',
            measured_value_raw: '7.0',
            measured_value_num: 7,
            unit: '级',
          },
          {
            category: 'mechanical',
            property_key: '特种非标断裂韧度K1C',
            measured_value_raw: '85',
            measured_value_num: 85,
            unit: 'MPa·m1/2',
          },
        ],
      },
      unresolvedProperties: [
        {
          raw_name: '特种非标断裂韧度K1C',
          raw_value: 85,
          raw_category: 'mechanical',
          source_tier: 'tier1',
          confidence: 0.5,
        },
      ],
    };

    await resolver(mockState as QualityAuditState);

    // 捕获到候选池，且已被 grain_size 占用的 key 已被扣除
    expect(capturedCandidates).toBeDefined();
    expect(capturedCandidates!.length).toBeGreaterThan(0);
    expect(capturedCandidates!.some(c => c.key === 'grain_size')).toBe(false);
  });

  it('fill-only 空槽正常填充：目标槽位未被占用时改写正常发生并打标 provenance: tier2_resolved', async () => {
    const mockService = new LlmPropertyResolverService({
      id: 'mock-fill-empty-slot',
      name: 'Fill Empty Slot Mock',
      provider: 'openai-compatible',
      baseUrl: 'https://mock.api',
      model: 'deepseek-chat',
      apiKey: 'valid-test-key',
    });

    mockService.resolveProperties = async (): Promise<LlmResolutionResult> => ({
      success: true,
      modelName: 'deepseek-chat',
      tokenUsage: {
        prompt_tokens: 156,
        completion_tokens: 42,
        total_tokens: 198,
        duration_ms: 320,
      },
      resolutions: [
        {
          raw_name: '表面光洁度',
          resolved_key: 'surface_roughness',
          confidence: 0.96,
          reasoning: '表面光洁度即粗糙度旧称，单位为微米',
        },
      ],
    });

    const resolver = createLlmPropertyResolverNode(ruleStore, mockService);

    const mockState: Partial<QualityAuditState> = {
      options: {
        forcedStandardId: 'NB/T 47019.5-2021',
        forcedGradeKey: 'S32168',
      },
      normalizedCert: {
        header: {
          certificate_no: 'FILL-SLOT-CERT',
          declared_standard: 'NB/T 47019.5-2021',
          declared_grade: 'S32168',
        },
        test_records: [
          {
            category: 'surface',
            property_key: '表面光洁度',
            measured_value_raw: '0.33',
            measured_value_num: 0.33,
            unit: 'μm',
          },
        ],
      },
      unresolvedProperties: [
        {
          raw_name: '表面光洁度',
          raw_value: 0.33,
          raw_category: 'surface',
          unit: 'μm',
          source_tier: 'tier1',
          confidence: 0.5,
        },
      ],
    };

    const update = await resolver(mockState as QualityAuditState);

    // 1. 空槽正常填充：record 被改写至 surface_roughness
    expect(update.resolvedProperties).toBeDefined();
    expect(update.resolvedProperties!.length).toBe(1);
    expect(update.resolvedProperties![0]?.resolved_key).toBe('surface_roughness');

    const rewritten = update.normalizedCert?.test_records[0]!;
    expect(rewritten.property_key).toBe('surface_roughness');
    expect(rewritten.measured_value_num).toBe(0.33);

    // 2. 改写成功的 record 带 provenance: 'tier2_resolved'
    expect((rewritten as Record<string, unknown>)['provenance']).toBe('tier2_resolved');
  });

  it('LlmPropertyResolverService 密钥解析：从环境变量名解析真实 Token', () => {
    const prevKey = process.env.KIMI_API_KEY;
    try {
      process.env.KIMI_API_KEY = 'sk-test-real-kimi-token';

      // 模拟默认通过 config.json 读取 apiKey: "KIMI_API_KEY" 的情况
      const service = new LlmPropertyResolverService({
        id: 'standard',
        name: '标准配置',
        provider: 'Moonshot',
        baseUrl: 'https://api.moonshot.cn/v1',
        model: 'kimi-k2.7-code',
        apiKey: 'KIMI_API_KEY',
      });

      expect(service.getResolvedApiKey()).toBe('sk-test-real-kimi-token');
      expect(service.hasValidApiKey()).toBe(true);
    } finally {
      if (prevKey !== undefined) {
        process.env.KIMI_API_KEY = prevKey;
      } else {
        delete process.env.KIMI_API_KEY;
      }
    }
  });
});
