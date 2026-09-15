import fs from 'node:fs';
import path from 'node:path';
import type {
  BlockType,
  ChatClient,
  ChatMessage,
  DraftClause,
  DraftSlice,
  ExtractionDrafts,
  TextBlock,
} from './types.ts';

/* ==========================================================================
   S2 有界 LLM 提取 (LLM Extract)
   - 聊天客户端可注入：签名 (messages, opts) => Promise<string>，测试可注入预制响应
   - 默认实现读取 config.json 默认 LLM 配置，走 OpenAI 兼容 /chat/completions
     （temperature 必须为 1：Kimi 等推理模型否则返回 HTTP 400）
   - 按块类型分别提取：化学成分表/力学表 -> 切片草稿；范围/前言 -> meta 草稿；
     正文 -> clauses 草稿。每条规则强制携带 source_clause 供 S3 溯源断言
   - 有限重试（最多 2 次，携带上次错误上下文），绝不静默吞错
   ========================================================================== */

export class MissingApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingApiKeyError';
  }
}

export class ModelApiExecutionError extends Error {
  public statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'ModelApiExecutionError';
    this.statusCode = statusCode;
  }
}

interface LlmConfigItem {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  isDefault?: boolean;
}

interface AppConfigShape {
  llm?: {
    timeoutMs?: number;
    /** 离线入库管线专用超时（非流式大 JSON 提取）；缺省 300s，独立于在线流式 timeoutMs */
    ingestTimeoutMs?: number;
    configs?: LlmConfigItem[];
  };
}

const MAX_RETRY = 2;
// 离线入库为非流式大 JSON 提取（思考强度高、整表输出），默认超时需显著大于在线流式场景
const DEFAULT_TIMEOUT_MS = 300000;

// 各块类型参与 LLM 提取的路由表
const EXTRACTABLE_TYPES: Record<string, BlockType[]> = {
  meta: ['scope_text'],
  slices_chemical: ['chemistry_table'],
  slices_mechanical: ['mechanical_table'],
  clauses: ['process_ndt_clauses'],
};

function loadDefaultLlmConfig(): { baseUrl: string; model: string; apiKey: string; timeoutMs: number } {
  const configPath = path.join(process.cwd(), 'config.json');
  let appConfig: AppConfigShape = {};
  if (fs.existsSync(configPath)) {
    appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as AppConfigShape;
  }
  const configs = appConfig.llm?.configs || [];
  const active = configs.find((c) => c.isDefault) || configs[0];
  if (!active) {
    throw new MissingApiKeyError('config.json 未配置任何 LLM 配置项 (llm.configs 为空)。');
  }
  return {
    baseUrl: active.baseUrl,
    model: active.model,
    apiKey: active.apiKey,
    timeoutMs: appConfig.llm?.ingestTimeoutMs || DEFAULT_TIMEOUT_MS,
  };
}

function resolveApiKey(apiKeyField: string): string {
  // apiKey 字段是环境变量名；若以 sk- 开头则为字面 key
  if (apiKeyField && apiKeyField.startsWith('sk-')) {
    return apiKeyField.trim();
  }
  const candidates = [apiKeyField, 'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'OPENAI_API_KEY'];
  for (const name of candidates) {
    const value = name ? process.env[name] : undefined;
    if (value && value.trim().length > 0) return value.trim();
  }
  return '';
}

/**
 * 默认聊天客户端：OpenAI 兼容 /chat/completions（非流式，temperature 固定 1）
 * 单次调用不重试——重试策略由上层 callWithRetry 携带错误上下文执行
 */
export function createDefaultChatClient(): ChatClient {
  const { baseUrl, model, apiKey: apiKeyField, timeoutMs } = loadDefaultLlmConfig();
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  return async (messages: ChatMessage[]) => {
    const apiKey = resolveApiKey(apiKeyField);
    if (!apiKey) {
      throw new MissingApiKeyError(`未配置有效的大模型 API 凭证 (环境变量 ${apiKeyField || 'KIMI_API_KEY'} 未设置)。`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 1, // Kimi 及主流推理模型严格要求 temperature: 1
          max_tokens: 32768, // 整表结构化输出体积大，显式放宽输出上限防止 JSON 截断
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ModelApiExecutionError(`大模型接口响应异常 [HTTP ${response.status}]`, response.status);
      }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new ModelApiExecutionError('大模型返回内容为空或结构异常');
      }
      return content;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ModelApiExecutionError(`大模型调用超时 (${timeoutMs}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * 剥离代码围栏并解析 JSON，失败抛错（携带上下文供重试）
 */
export function parseJsonLoose(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  const start = cleaned.search(/[{[]/);
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start < 0 || end <= start) {
    throw new Error(`返回内容不含 JSON 对象 (前 80 字符: ${cleaned.slice(0, 80)})`);
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (err) {
    throw new Error(`JSON 解析失败: ${String(err)} (前 80 字符: ${cleaned.slice(0, 80)})`);
  }
}

/**
 * 带错误上下文的有限重试调用（最多重试 MAX_RETRY 次）
 */
async function callWithRetry(
  chat: ChatClient,
  task: Parameters<ChatClient>[1]['task'],
  systemPrompt: string,
  userPrompt: string,
): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          attempt === 0
            ? userPrompt
            : `${userPrompt}\n\n【上次输出未通过校验（第 ${attempt} 次重试）】\n错误：${lastError?.message}\n请修正后重新输出，仅输出合法 JSON。`,
      },
    ];
    try {
      const raw = await chat(messages, { task });
      return parseJsonLoose(raw);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError || new ModelApiExecutionError(`LLM 提取重试 ${MAX_RETRY} 次后仍失败`);
}

const SYSTEM_PROMPT = [
  '你是工业国家/行业标准文档结构化提取引擎，服务于质保书合规检验引擎的数据入库。',
  '只输出合法 JSON：禁止输出解释性文字、注释，以及代码围栏之外的内容。',
  '所有数值必须与原文逐字一致：禁止换算、修约、补零或臆造；原文未给出的值不得输出。',
  '每条规则必须携带 source_clause 字段，取值严格等于所给文本块标注的【条款号】，不得虚构条款号。',
].join('\n');

function blockSection(blocks: TextBlock[]): string {
  return blocks.map((b) => `【条款号 ${b.clauseRef}】\n${b.text}`).join('\n\n----\n\n');
}

const STRUCTURE_TYPE_MAP = '奥氏体型->austenitic，铁素体型->ferritic，马氏体型->martensitic，奥氏体-铁素体型/双相型->duplex，沉淀硬化型->precipitation_hardening';

async function extractMeta(chat: ChatClient, blocks: TextBlock[]): Promise<Record<string, unknown>> {
  const userPrompt = [
    '【任务】从前言/范围文本中提取标准元信息。',
    '【输出 JSON 结构】{"standard_id": string, "standard_name": string, "version": string, "description": string, "status": "CURRENT", "material_category": string, "applies_to_forms": string[]}',
    '要求：standard_id 含年份（如 "NB/T 47019.5-2021"，原文用破折号/一字线均规范为连字符）；version 为年份；description 取适用范围原文句；material_category 取 "ferrous_pipe"（钢铁管材）；applies_to_forms 取 ["tube_seamless"]（无缝管）或 ["tube_seamless","tube_welded"]（含焊接管）。',
    '【文本块】',
    blockSection(blocks),
  ].join('\n');
  const parsed = await callWithRetry(chat, 'meta', SYSTEM_PROMPT, userPrompt);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ModelApiExecutionError('meta 提取结果不是 JSON 对象');
  }
  return parsed as Record<string, unknown>;
}

async function extractChemicalSlices(chat: ChatClient, blocks: TextBlock[]): Promise<DraftSlice[]> {
  const userPrompt = [
    '【任务】从化学成分表文本块中逐牌号提取化学成分规则，输出切片草稿数组。',
    '【硬性要求】',
    '1. 每个牌号一个切片草稿：spec_key=统一数字代号（如 S30408），primary_grade=牌号（如 06Cr19Ni10），display_name="06Cr19Ni10 (S30408)"，structure_type 按组织类型映射（' + STRUCTURE_TYPE_MAP + '），aliases 留空数组。',
    '2. 每个规定了的元素一条 numeric_range 规则：category 固定 "chemical"，property_key=元素符号（C/Si/Mn/P/S/Ni/Cr/Mo/N/Ti/Nb 等）。',
    '3. 区间严格取自原文："0.04～0.10" -> min=0.04, max=0.10；单值上限 "0.08" -> min=null, max=0.08；"—" 表示标准未规定该元素，跳过。',
    '4. unit 固定 "%"，rounding_decimals 取原文小数位数（如 0.030 -> 3）。',
    '5. requirement_level 固定 "MANDATORY"，rule_id 格式 "CHEM_{spec_key}_{元素符号}"，display_name 如 "C含量 (C)"。',
    '6. 每条规则 source_clause = 所在文本块的【条款号】。',
    '【输出 JSON 结构】{"slices": [{"spec_key": string, "primary_grade": string, "structure_type": string, "display_name": string, "aliases": [], "chemical_rules": [{"rule_id": string, "category": "chemical", "property_key": string, "display_name": string, "rule_type": "numeric_range", "requirement_level": "MANDATORY", "criteria": {"min": number|null, "max": number|null, "unit": "%", "rounding_decimals": number}, "source_clause": string}]}]}',
    '【化学成分表块】',
    blockSection(blocks),
  ].join('\n');
  const parsed = await callWithRetry(chat, 'slices_chemical', SYSTEM_PROMPT, userPrompt);
  const slices = (parsed as { slices?: unknown[] })?.slices;
  if (!Array.isArray(slices)) {
    throw new ModelApiExecutionError('化学成分提取结果缺少 slices 数组');
  }
  return slices.map((s) => {
    const slice = s as Record<string, unknown>;
    return {
      spec_key: String(slice.spec_key || ''),
      primary_grade: slice.primary_grade ? String(slice.primary_grade) : undefined,
      unified_code: slice.spec_key ? String(slice.spec_key) : undefined,
      structure_type: slice.structure_type ? String(slice.structure_type) : undefined,
      display_name: String(slice.display_name || slice.spec_key || ''),
      aliases: Array.isArray(slice.aliases) ? slice.aliases.map(String) : [],
      evaluation_rules: (Array.isArray(slice.chemical_rules) ? slice.chemical_rules : []) as DraftSlice['evaluation_rules'],
    };
  });
}

async function extractMechanicalSlices(chat: ChatClient, blocks: TextBlock[]): Promise<DraftSlice[]> {
  const userPrompt = [
    '【任务】从力学性能表文本块中逐牌号提取室温力学性能规则，输出切片草稿数组。',
    '【硬性要求】',
    '1. 每个牌号一个切片草稿：spec_key=统一数字代号（如 S30408），primary_grade=牌号（如 06Cr19Ni10），display_name="06Cr19Ni10 (S30408)"，aliases 留空数组。',
    '2. 每个力学指标一条 numeric_range 规则：category 固定 "mechanical"。property_key 映射：抗拉强度 Rm -> tensile_strength（unit "MPa"）；规定塑性延伸强度 Rp0.2 -> yield_strength_rp02（unit "MPa"）；断后伸长率 A -> elongation_A（unit "%"）。',
    '3. 数值严格取自原文区间："520" -> min=520, max=null；"35" -> min=35, max=null；"35~50" -> min=35, max=50。忽略密度与推荐热处理制度列。',
    '4. requirement_level 固定 "MANDATORY"，rule_id 格式 "MECH_{spec_key}_{指标}"，display_name 如 "抗拉强度 (Rm)"。',
    '5. 每条规则 source_clause = 所在文本块的【条款号】。',
    '【输出 JSON 结构】{"slices": [{"spec_key": string, "primary_grade": string, "display_name": string, "aliases": [], "mechanical_rules": [{"rule_id": string, "category": "mechanical", "property_key": string, "display_name": string, "rule_type": "numeric_range", "requirement_level": "MANDATORY", "criteria": {"min": number|null, "max": number|null, "unit": string}, "source_clause": string}]}]}',
    '【力学性能表块】',
    blockSection(blocks),
  ].join('\n');
  const parsed = await callWithRetry(chat, 'slices_mechanical', SYSTEM_PROMPT, userPrompt);
  const slices = (parsed as { slices?: unknown[] })?.slices;
  if (!Array.isArray(slices)) {
    throw new ModelApiExecutionError('力学性能提取结果缺少 slices 数组');
  }
  return slices.map((s) => {
    const slice = s as Record<string, unknown>;
    return {
      spec_key: String(slice.spec_key || ''),
      primary_grade: slice.primary_grade ? String(slice.primary_grade) : undefined,
      unified_code: slice.spec_key ? String(slice.spec_key) : undefined,
      display_name: String(slice.display_name || slice.spec_key || ''),
      aliases: Array.isArray(slice.aliases) ? slice.aliases.map(String) : [],
      evaluation_rules: (Array.isArray(slice.mechanical_rules) ? slice.mechanical_rules : []) as DraftSlice['evaluation_rules'],
    };
  });
}

async function extractClauses(chat: ChatClient, blocks: TextBlock[]): Promise<DraftClause[]> {
  const userPrompt = [
    '【任务】从工艺/无损检测条款文本块中提取标准正文条款。',
    '【硬性要求】每个文本块输出一条：clause_id=该块【条款号】（如 "7.5.1"）；title=不超过 12 字的条款主题（如 "液压试验"）；text=块内正文（去除首行条款号前缀，合并换行，保留数值与公式）。',
    '【输出 JSON 结构】{"clauses": [{"clause_id": string, "title": string, "text": string}]}',
    '【条款块】',
    blockSection(blocks),
  ].join('\n');
  const parsed = await callWithRetry(chat, 'clauses', SYSTEM_PROMPT, userPrompt);
  const clauses = (parsed as { clauses?: unknown[] })?.clauses;
  if (!Array.isArray(clauses)) {
    throw new ModelApiExecutionError('条款提取结果缺少 clauses 数组');
  }
  return clauses.map((c) => {
    const clause = c as Record<string, unknown>;
    return {
      clause_id: String(clause.clause_id || ''),
      title: String(clause.title || ''),
      text: String(clause.text || ''),
      source_block: String(clause.clause_id || ''),
    };
  });
}

/**
 * 合并化学/力学切片草稿：按 spec_key（回退 primary_grade）归并规则
 */
export function mergeSliceDrafts(...groups: DraftSlice[][]): DraftSlice[] {
  const merged = new Map<string, DraftSlice>();
  for (const group of groups) {
    for (const slice of group) {
      const key = slice.spec_key || slice.primary_grade || '';
      if (!key) continue;
      const existing = merged.get(key);
      if (existing) {
        existing.evaluation_rules.push(...slice.evaluation_rules);
        if (!existing.structure_type && slice.structure_type) existing.structure_type = slice.structure_type;
        if (!existing.primary_grade && slice.primary_grade) existing.primary_grade = slice.primary_grade;
      } else {
        merged.set(key, { ...slice, evaluation_rules: [...slice.evaluation_rules] });
      }
    }
  }
  return [...merged.values()];
}

/**
 * 附录类锚点判定：附录章节（附录A）与附录表格（表A.1）均为资料性重复内容，
 * 不参与切片提取与牌号行数对账，避免与正文表产生重复规则
 */
export function isAppendixLikeRef(clauseRef: string): boolean {
  return clauseRef.startsWith('附录') || /^表[A-ZＡ-Ｚ]\./.test(clauseRef);
}

/**
 * 切片规则按 rule_id 去重（保留先出现者）：
 * 正文主表与续表/附录重复提取同一牌号时幂等收敛，适用于新提取与缓存草稿
 */
export function dedupeDraftRules(drafts: ExtractionDrafts): ExtractionDrafts {
  for (const slice of drafts.slices) {
    const seen = new Set<string>();
    slice.evaluation_rules = slice.evaluation_rules.filter((r) => {
      if (seen.has(r.rule_id)) return false;
      seen.add(r.rule_id);
      return true;
    });
  }
  return drafts;
}

/**
 * 切片草稿 harness 字段确定性补齐（S2 产物契约，同输入同输出）：
 * - spec_type: v1 提取通道均为牌号切片，固定 'grade'（严禁依赖 Zod 缺省值静默补齐）
 * - standard_code: 统一取自 meta.standard_id（防 LLM 逐切片漂移）
 * - description: 缺省时按标准号 + 牌号确定性生成中文描述
 * 对新鲜与缓存草稿同等生效（幂等）。
 */
export function fillSliceHarnessFields(drafts: ExtractionDrafts): ExtractionDrafts {
  const stdId = typeof drafts.meta.standard_id === 'string' ? drafts.meta.standard_id : '';
  for (const slice of drafts.slices) {
    slice.spec_type = 'grade';
    slice.standard_code = stdId;
    if (typeof slice.description !== 'string' || slice.description.trim().length === 0) {
      const grade = slice.primary_grade || slice.spec_key;
      slice.description = `${stdId} ${grade} (${slice.spec_key}) 化学成分与力学性能切片`;
    }
  }
  return drafts;
}

/**
 * S2 主入口：按块类型路由执行 LLM 提取并合并草稿
 * 附录（资料性）表格不参与切片提取，避免干扰正式牌号表对账
 */
export async function extractAll(
  blocks: TextBlock[],
  chat: ChatClient,
  onTask?: (message: string) => void,
): Promise<ExtractionDrafts> {
  const pick = (task: keyof typeof EXTRACTABLE_TYPES): TextBlock[] =>
    blocks.filter((b) => !isAppendixLikeRef(b.clauseRef) && (EXTRACTABLE_TYPES[task] || []).includes(b.blockType));

  const metaBlocks = pick('meta');
  const chemBlocks = pick('slices_chemical');
  const mechBlocks = pick('slices_mechanical');
  const clauseBlocks = pick('clauses');

  onTask?.(`提取元信息（${metaBlocks.length} 个范围/前言块）...`);
  const meta = await extractMeta(chat, metaBlocks);

  // 按块逐块调用：整表合并单次调用的输出体积会超出模型输出上限导致 JSON 截断
  const chemSlices: DraftSlice[] = [];
  for (const [i, block] of chemBlocks.entries()) {
    onTask?.(`提取化学成分切片（第 ${i + 1}/${chemBlocks.length} 个表块 ${block.clauseRef}）...`);
    chemSlices.push(...(await extractChemicalSlices(chat, [block])));
  }

  const mechSlices: DraftSlice[] = [];
  for (const [i, block] of mechBlocks.entries()) {
    onTask?.(`提取力学性能切片（第 ${i + 1}/${mechBlocks.length} 个表块 ${block.clauseRef}）...`);
    mechSlices.push(...(await extractMechanicalSlices(chat, [block])));
  }

  const clauses: DraftClause[] = [];
  for (const [i, block] of clauseBlocks.entries()) {
    onTask?.(`提取工艺/无损检测条款（第 ${i + 1}/${clauseBlocks.length} 个条款块 ${block.clauseRef}）...`);
    clauses.push(...(await extractClauses(chat, [block])));
  }

  return fillSliceHarnessFields({ meta, slices: mergeSliceDrafts(chemSlices, mechSlices), clauses });
}
