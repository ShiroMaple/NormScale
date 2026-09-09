import fs from 'fs';
import path from 'path';
import { AppConfig, LlmConfigItem } from '../../extractor/openai-compatible-extractor.ts';
import { PropertyResolutionCandidate, WorkflowTokenUsage } from '../state.interface.ts';
import { logger } from '../../logger/index.ts';

export interface CandidateRuleItem {
  key: string;
  name: string;
  category: string;
  rule_type: string;
  unit?: string;
}

export interface LlmResolutionResult {
  success: boolean;
  resolutions?: Array<{
    raw_name: string;
    resolved_key: string | null;
    confidence: number;
    reasoning: string;
  }>;
  tokenUsage?: WorkflowTokenUsage;
  modelName?: string;
  error?: string;
}

/**
 * ============================================================================
 * Tier 2 大模型长尾检验项受限语义消歧服务 (LLM Property Resolver Service)
 * ============================================================================
 * 
 * 职责：
 * 1. 从系统全局配置 (config/app-config.json) 或环境变量装配活跃模型连接；
 * 2. 构造基于封闭标准切片候选集 (Constrained Candidate Pool) 的受限提示词；
 * 3. 发起 OpenAI 兼容 REST 请求并解析结构化 JSON 响应；
 * 4. 严格捕获官方真实 usage 计量，支持超时熔断与非静默降级。
 * ============================================================================
 */
export class LlmPropertyResolverService {
  private activeConfig: LlmConfigItem | null = null;
  private timeoutMs: number = 5000;

  constructor(customConfig?: LlmConfigItem, timeoutMs?: number) {
    if (customConfig) {
      this.activeConfig = customConfig;
    } else {
      this.loadActiveConfig();
    }
    if (timeoutMs) {
      this.timeoutMs = timeoutMs;
    }
  }

  /**
   * 加载系统全局活跃 LLM 配置
   */
  private loadActiveConfig(): void {
    try {
      let configPath = path.resolve(process.cwd(), 'config.json');
      if (!fs.existsSync(configPath)) {
        configPath = path.resolve(process.cwd(), 'config/app-config.json');
      }

      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed: AppConfig = JSON.parse(raw);
        if (parsed.llm?.configs && parsed.llm.configs.length > 0) {
          const defaultCfg = parsed.llm.configs.find(c => c.isDefault) || parsed.llm.configs[0];
          if (defaultCfg) {
            this.activeConfig = defaultCfg;
          }
          if (parsed.llm.timeoutMs) {
            this.timeoutMs = parsed.llm.timeoutMs;
          }
        }
      }
    } catch (err: unknown) {
      logger.warn('WORKFLOW', `[LlmPropertyResolverService] 加载配置文件异常: ${String(err)}`);
    }

    // 环境变量优先覆盖
    const envKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
    const envBaseUrl = process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL;
    const envModel = process.env.OPENAI_MODEL || process.env.LLM_MODEL;

    if (envKey && (process.env.OPENAI_API_KEY || process.env.LLM_API_KEY)) {
      this.activeConfig = {
        id: 'env-config',
        name: 'Environment LLM Config',
        provider: 'openai-compatible',
        baseUrl: envBaseUrl || this.activeConfig?.baseUrl || 'https://api.openai.com/v1',
        model: envModel || this.activeConfig?.model || 'gpt-4o-mini',
        apiKey: envKey,
      };
    }

    logger.info(
      'WORKFLOW',
      `[LlmPropertyResolverService] 配置装配就绪: model=${this.activeConfig?.model || 'none'}, provider=${this.activeConfig?.provider || 'none'}, hasValidKey=${this.hasValidApiKey()}`
    );
  }

  /**
   * 解析并获取当前活跃环境下的真实 API Token (支持环境变量名映射与 sk- 直通)
   */
  public getResolvedApiKey(): string {
    if (!this.activeConfig) return '';
    const envKeyName = this.activeConfig.apiKey?.trim();
    // 1. 若配置项本身指定了环境变量名 (如 'KIMI_API_KEY')
    const keyFromEnv = (envKeyName && process.env[envKeyName]) ||
      process.env.KIMI_API_KEY ||
      process.env.MOONSHOT_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.LLM_API_KEY;

    if (keyFromEnv && keyFromEnv.trim().length > 0) {
      return keyFromEnv.trim();
    }

    // 2. 若配置中的 apiKey 本身是合法的真实 token 字符串 (sk- 开头) 或单元测试 mock-key 以外的真实 key
    if (envKeyName && envKeyName.startsWith('sk-')) {
      return envKeyName;
    }

    // 3. 兼容单元测试中传入的显式非占位 key (如 'valid-test-key')
    if (envKeyName && !['KIMI_API_KEY', 'OPENAI_API_KEY', 'sk-placeholder', 'YOUR_API_KEY', 'mock-key'].includes(envKeyName)) {
      return envKeyName;
    }

    return '';
  }

  /**
   * 检查当前环境是否具备可调用的有效 API Key
   */
  public hasValidApiKey(): boolean {
    const key = this.getResolvedApiKey();
    if (!key) return false;
    if (key === 'sk-placeholder' || key === 'YOUR_API_KEY' || key === 'mock-key') return false;
    return true;
  }

  /**
   * 获取当前活跃模型名称
   */
  public getModelName(): string {
    return this.activeConfig?.model || 'unknown-model';
  }

  /**
   * 执行受限长尾消歧请求
   */
  public async resolveProperties(
    unresolvedList: PropertyResolutionCandidate[],
    candidateRules: CandidateRuleItem[],
    standardId?: string,
    gradeKey?: string
  ): Promise<LlmResolutionResult> {
    const resolvedKey = this.getResolvedApiKey();
    if (!this.hasValidApiKey() || !this.activeConfig || !resolvedKey) {
      return {
        success: false,
        error: 'MISSING_OR_INVALID_API_KEY',
      };
    }

    const startTime = Date.now();
    const prompt = this.buildConstrainedPrompt(unresolvedList, candidateRules, standardId, gradeKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const endpoint = `${this.activeConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resolvedKey}`,
        },
        body: JSON.stringify({
          model: this.activeConfig.model,
          messages: [
            {
              role: 'system',
              content:
                '你是一个钢铁工业材料执行标准与检验技术专家。你的唯一任务是将供应商质保书中的长尾或异构检验项表述，精确映射至执行标准切片给定的封闭候选规则池中的标准检验项。严禁胡乱猜测，必须输出合法的 JSON 格式。',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 1, // Kimi 及主流推理模型严格要求 temperature: 1
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const status = response.status;
        const errText = await response.text();
        return {
          success: false,
          error: `HTTP_${status}: ${errText.substring(0, 200)}`,
        };
      }

      const resJson = await response.json();
      const durationMs = Date.now() - startTime;

      // 提取真实 Token 计量
      const usage = resJson.usage;
      const tokenUsage: WorkflowTokenUsage = {
        prompt_tokens: Number(usage?.prompt_tokens) || 0,
        completion_tokens: Number(usage?.completion_tokens) || 0,
        total_tokens: Number(usage?.total_tokens) || 0,
        duration_ms: durationMs,
      };

      const content = resJson.choices?.[0]?.message?.content;
      if (!content) {
        return {
          success: false,
          error: 'EMPTY_COMPLETION_RESPONSE',
        };
      }

      const parsed = JSON.parse(content);
      const rawResolutions = parsed.resolutions || parsed.results || (Array.isArray(parsed) ? parsed : []);

      const resolutions = (rawResolutions as any[]).map(r => ({
        raw_name: String(r.raw_name || ''),
        resolved_key: r.resolved_key ? String(r.resolved_key) : null,
        confidence: typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0.5,
        reasoning: String(r.reasoning || ''),
      }));

      return {
        success: true,
        resolutions,
        tokenUsage,
        modelName: this.activeConfig.model,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort = (err as Error)?.name === 'AbortError';
      const errMsg = isAbort ? `TIMEOUT_AFTER_${this.timeoutMs}MS` : (err instanceof Error ? err.message : String(err));
      return {
        success: false,
        error: errMsg,
      };
    }
  }

  /**
   * 构建受限候选集 Prompt
   */
  private buildConstrainedPrompt(
    unresolvedList: PropertyResolutionCandidate[],
    candidateRules: CandidateRuleItem[],
    standardId?: string,
    gradeKey?: string
  ): string {
    const unresolvedJson = unresolvedList.map(item => ({
      raw_name: item.raw_name,
      raw_value: item.raw_value,
      unit: item.unit || null,
      raw_category: item.raw_category || null,
    }));

    const candidateJson = candidateRules.map(r => ({
      key: r.key,
      name: r.name,
      category: r.category,
      unit: r.unit || null,
    }));

    return `
【当前执行标准与牌号环境】
执行标准代号: ${standardId || '未指定'}
执行材料牌号: ${gradeKey || '未指定'}

【待对齐的长尾实测项清单 (Unresolved Properties)】
${JSON.stringify(unresolvedJson, null, 2)}

【标准切片封闭候选规则池 (Candidate Rules Pool)】
${JSON.stringify(candidateJson, null, 2)}

【映射研判原则与指令】
1. 逐项审视【待对齐的长尾实测项】，在【标准切片封闭候选规则池】中寻找语义、量纲与工程意义完全吻合的标准规则 key。
2. 冶金工程术语知识要求：
   - “表面光洁度”对应粗糙度（surface_roughness），单位通常为 μm；
   - “抗剪切断裂韧度”若在标准规则池中不存在任何剪切或韧度规则，绝不能硬套到拉伸或冲击规则，resolved_key 必须输出 null，置信度给出 < 0.6。
3. 只能选择候选池中存在的 key。若没有合适的项，resolved_key 设为 null，confidence 设为 < 0.6。
4. 若确凿吻合（同义词、历史别名、缩写等），confidence 应 >= 0.85。

【输出 JSON 契约格式】
必须输出如下严格 JSON：
{
  "resolutions": [
    {
      "raw_name": "待对齐的原始名称",
      "resolved_key": "选定的标准规则 key 或 null",
      "confidence": 0.95,
      "reasoning": "简明扼要的专业对齐理由（中文，20字以内）"
    }
  ]
}
`;
  }
}
