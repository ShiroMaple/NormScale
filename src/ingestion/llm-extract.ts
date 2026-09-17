import fs from 'node:fs';
import path from 'node:path';
import type {
  BlockType,
  ChatCallOptions,
  ChatClient,
  ChatMessage,
  DraftClause,
  DraftRule,
  DraftSlice,
  DraftToleranceTable,
  ExtractionDrafts,
  TextBlock,
} from './types.ts';
import { applyClausePatterns } from './clause-patterns.ts';
import type { StandardProfile } from './standard-profile.ts';
import { ZH_CN_PROFILE } from './standard-profile.ts';

/* ==========================================================================
   S2 有界 LLM 提取 (LLM Extract)
   - 聊天客户端可注入：签名 (messages, opts) => Promise<string>，测试可注入预制响应
   - 默认实现读取 config.json 默认 LLM 配置，走 OpenAI 兼容 /chat/completions
     （temperature 必须为 1：Kimi 等推理模型否则返回 HTTP 400）
   - 按块类型分别提取：化学成分表/力学表 -> 切片草稿；范围/前言 -> meta 草稿；
     正文 -> clauses 草稿；工艺/探伤条款 -> 规则草稿（v2）；化学表"其他"列 -> 动态公式草稿（v2）；
     公差表 -> 公差表草稿（v2，跨标准引用显式记录绝不臆造）。
     每条规则强制携带 source_clause 供 S3 溯源断言
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
    /** 入库管线专用 LLM 配置 id（configs 中的 id）；缺省回退 isDefault 项 */
    ingestConfigId?: string;
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
  // v2：工艺/探伤条款同时产出 clauses 文本草稿与 process_rules 规则草稿（各走独立 prompt）
  process_rules: ['process_ndt_clauses'],
  dynamic_formulas: ['chemistry_table'],
  tolerance_tables: ['tolerance_table'],
};

/**
 * 解析入库管线生效的 LLM 配置。选择优先级（高到低）：
 * 1. 显式 overrideId（CLI --llm / IngestOptions.llmConfigId）
 * 2. 环境变量 INGEST_LLM_CONFIG_ID
 * 3. config.json 的 llm.ingestConfigId（入库专用配置）
 * 4. configs 中 isDefault 项（与在线业务共用）
 */
export function resolveIngestLlmConfig(appConfig: AppConfigShape, overrideId?: string): LlmConfigItem {
  const configs = appConfig.llm?.configs || [];
  const wantedId = overrideId || process.env['INGEST_LLM_CONFIG_ID'] || appConfig.llm?.ingestConfigId;
  if (wantedId) {
    const hit = configs.find((c) => c.id === wantedId);
    if (!hit) {
      throw new MissingApiKeyError(`指定的入库 LLM 配置 id "${wantedId}" 在 config.json llm.configs 中不存在（可选: ${configs.map((c) => c.id).join(', ')}）。`);
    }
    return hit;
  }
  const active = configs.find((c) => c.isDefault) || configs[0];
  if (!active) {
    throw new MissingApiKeyError('config.json 未配置任何 LLM 配置项 (llm.configs 为空)。');
  }
  return active;
}

function loadDefaultLlmConfig(overrideId?: string): { baseUrl: string; model: string; apiKey: string; timeoutMs: number } {
  const configPath = path.join(process.cwd(), 'config.json');
  let appConfig: AppConfigShape = {};
  if (fs.existsSync(configPath)) {
    appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as AppConfigShape;
  }
  const active = resolveIngestLlmConfig(appConfig, overrideId);
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
 * 默认聊天客户端：OpenAI 兼容 /chat/completions（流式 SSE 聚合，temperature 固定 1）
 * 采用流式的原因：kimi-k3 等推理模型长思考时，非流式长挂连接会被服务端/代理掐断
 * （表现为 fetch failed/连接重置）；流式持续吐 chunk 保持连接活性，与质保书管线一致。
 * 单次调用不重试——重试策略由上层 callWithRetry 携带错误上下文执行
 */
export function createDefaultChatClient(configId?: string): ChatClient {
  const { baseUrl, model, apiKey: apiKeyField, timeoutMs } = loadDefaultLlmConfig(configId);
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  return async (messages: ChatMessage[], opts?: ChatCallOptions) => {
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
          stream: true, // 流式保活：长思考推理模型的非流式长挂连接会被掐断
          stream_options: { include_usage: false },
          // 视觉转录任务需要纯文本输出，强制 json_object 会逼模型把转录包成 JSON 形态
          ...(opts?.task === 'vision_transcribe' ? {} : { response_format: { type: 'json_object' } }),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ModelApiExecutionError(`大模型接口响应异常 [HTTP ${response.status}]`, response.status);
      }
      if (!response.body) {
        throw new ModelApiExecutionError('大模型流式响应缺少 body');
      }

      // SSE 聚合：拼接所有 chunk 的 delta.content，忽略 reasoning_content 与心跳
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const evt of events) {
          const dataLines = evt.split('\n').filter((l) => l.startsWith('data:'));
          for (const line of dataLines) {
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const chunk = JSON.parse(payload);
              const delta = chunk?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string') content += delta;
            } catch {
              // 半截 JSON 片段留待下一帧拼接（SSE 边界不保证整包）
            }
          }
        }
      }
      if (content.trim().length === 0) {
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
    '语言硬性要求：standard_name 与 description 必须使用原文中文，严禁翻译为英文（如 "锅炉、热交换器用管订货技术条件 第5部分：不锈钢"）。',
    '【文本块】',
    blockSection(blocks),
  ].join('\n');
  const parsed = await callWithRetry(chat, 'meta', SYSTEM_PROMPT, userPrompt);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ModelApiExecutionError('meta 提取结果不是 JSON 对象');
  }
  return parsed as Record<string, unknown>;
}

/* ==========================================================================
   表块行级拆批（v1.7.1，确定性纯函数）——根治大表（ASME TABLE2 数十牌号）单块提取超时：
   牌号行计数超过阈值时按完整牌号行分组拆批，每批携带表头/表题与表注上下文行，
   逐批调用提取后经 mergeSliceDrafts 按 spec_key 合并（绝不截断牌号行）
   ========================================================================== */

// 每批最大牌号行数（可配置常量；SA-213 TABLE2 真实超时案例校准：12 行/批单批输出可控）
export const GRADE_TABLE_BATCH_SIZE = 12;

/**
 * 表块按牌号行确定性拆批（同输入同输出）：
 * - 首个牌号行前的行 = 表头/表题上下文，每个子批都携带；
 * - 牌号行（profile.gradeRowRe 单行匹配）开启新行组，组间非牌号行视为该行续行（如 NB 表
 *   断行 "8.00～\n12.00"、SA-213 上标折行）并入当前组——批次边界恒为完整牌号行，绝不截断；
 * - 最后一个牌号行后的行 = 表注尾部上下文，每个子批都携带（注记语义全批共享）；
 * - 牌号行数 ≤ 阈值或无法识别牌号行时原样返回单批（不拆）。
 */
export function splitGradeTableBlock(
  block: TextBlock,
  profile: StandardProfile = ZH_CN_PROFILE,
  batchSize: number = GRADE_TABLE_BATCH_SIZE,
): TextBlock[] {
  const gradeRowLineRe = new RegExp(profile.gradeRowRe.source, 'gm');
  const lines = block.text.split('\n');
  const isGradeRow = lines.map((line) => {
    gradeRowLineRe.lastIndex = 0;
    return gradeRowLineRe.test(line);
  });
  const rowCount = isGradeRow.filter(Boolean).length;
  if (rowCount === 0 || rowCount <= batchSize) return [block];

  const firstRow = isGradeRow.indexOf(true);
  const lastRow = isGradeRow.lastIndexOf(true);
  const headerLines = lines.slice(0, firstRow);
  const trailerLines = lines.slice(lastRow + 1);
  // 牌号行区间分组：牌号行开新组，续行归当前组
  const groups: string[][] = [];
  let current: string[] | null = null;
  for (let i = firstRow; i <= lastRow; i++) {
    if (isGradeRow[i]) {
      current = [lines[i]!];
      groups.push(current);
    } else {
      current!.push(lines[i]!);
    }
  }
  const header = headerLines.join('\n');
  const trailer = trailerLines.join('\n');
  const batches: TextBlock[] = [];
  for (let i = 0; i < groups.length; i += batchSize) {
    const body = groups
      .slice(i, i + batchSize)
      .map((g) => g.join('\n'))
      .join('\n');
    const text = [header, body, trailer].filter((s) => s.length > 0).join('\n');
    batches.push({ blockType: block.blockType, clauseRef: block.clauseRef, text });
  }
  return batches;
}

async function extractChemicalSlices(chat: ChatClient, blocks: TextBlock[], profile: StandardProfile): Promise<DraftSlice[]> {
  const userPrompt = [
    '【任务】从化学成分表文本块中逐牌号提取化学成分规则，输出切片草稿数组。',
    '【硬性要求】',
    profile.id === 'en-asme'
      ? '1. 每个牌号一个切片草稿：' + profile.promptLocale.gradeConcepts + '，structure_type 判读（' + profile.promptLocale.structureTypeMap + '）。aliases：可填入该牌号的国际别名（模型世界知识），不确定时留空数组；别名不参与原文数值溯源，供人工抽检。'
      : '1. 每个牌号一个切片草稿：spec_key=统一数字代号（如 S30408），primary_grade=牌号（如 06Cr19Ni10），display_name="06Cr19Ni10 (S30408)"，structure_type 按组织类型映射（' + STRUCTURE_TYPE_MAP + '）。aliases：可填入该牌号的国际/历史牌号别名（模型世界知识，如 06Cr19Ni10 -> ["SUS304","TP304","0Cr18Ni9"]），不确定时留空数组；别名不参与原文数值溯源，供人工抽检。',
    '2. 每个规定了的元素一条 numeric_range 规则：category 固定 "chemical"，property_key=元素符号（C/Si/Mn/P/S/Ni/Cr/Mo/N/Ti/Nb 等）。',
    '3. 区间严格取自原文："0.04～0.10" -> min=0.04, max=0.10；单值上限 "0.08" -> min=null, max=0.08；"—" 表示标准未规定该元素，跳过。',
    '4. "其他"列的公式型条目（如 "Ti：5（C+N）～0.70"、"Nb：10C～1.10"）不在本任务范围（由专门任务提取），不得输出；仅提取主元素列（C/Si/Mn/P/S/Ni/Cr/Mo/N 等）的数值区间。',
    '5. unit 固定 "%"，rounding_decimals 取原文小数位数（如 0.030 -> 3）。',
    '6. requirement_level 固定 "MANDATORY"，rule_id 格式 "CHEM_{spec_key}_{元素符号}"，display_name 如 "C含量 (C)"。',
    '7. 每条规则 source_clause = 所在文本块的【条款号】。',
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

async function extractMechanicalSlices(chat: ChatClient, blocks: TextBlock[], profile: StandardProfile): Promise<DraftSlice[]> {
  const userPrompt = [
    '【任务】从力学性能相关文本块中提取力学性能规则（室温拉伸性能 + 硬度多选一等），输出切片草稿数组。文本块可能是拉伸性能表、硬度表或含力学条款的正文块——按块内容类型分别处理，不得因"非拉伸"跳过硬度表。',
    '【硬性要求】',
    profile.id === 'en-asme'
      ? '1. 每个牌号一个切片草稿：' + profile.promptLocale.gradeConcepts + '。aliases：可填入该牌号的国际别名（模型世界知识），不确定时留空数组；别名不参与原文数值溯源，供人工抽检。'
      : '1. 每个牌号一个切片草稿：spec_key=统一数字代号（如 S30408），primary_grade=牌号（如 06Cr19Ni10），display_name="06Cr19Ni10 (S30408)"；aliases：可填入该牌号的国际/历史牌号别名（模型世界知识，如 06Cr19Ni10 -> ["SUS304","TP304","0Cr18Ni9"]），不确定时留空数组；别名不参与原文数值溯源，供人工抽检。',
    '2. 拉伸性能（numeric_range）：category 固定 "mechanical"。property_key 映射：抗拉强度 Rm -> tensile_strength（unit "MPa"）；规定塑性延伸强度 Rp0.2 -> yield_strength_rp02（unit "MPa"）；断后伸长率 A -> elongation_A（unit "%"）。数值严格取自原文区间："520" -> min=520, max=null；"35" -> min=35, max=null；"35~50" -> min=35, max=50。忽略密度与推荐热处理制度列。',
    '3. 表注扫描（强制，不得遗漏）：块内表注/条注中的工艺偏差修正（如"热挤压钢管抗拉强度允许降低20MPa"）必须扫描并输出——写入对应指标规则的 criteria.condition_adjustments=[{when, min_offset 或 max_offset, note}]；when 用 JS 表达式惯例 "ctx.header.manufacturing_process == \'<工艺>\'"（冷拔->cold_drawn、热轧->hot_rolled、热挤压->hot_extrusion），min_offset/max_offset 为带符号修正值（降低为负），note 为原文摘要。无此类注记时不输出该字段。',
    '4. 硬度表（or_choice_group，强制）：当文本块为硬度表（含 HBW/HRB/HV 列）或条款提及硬度试验时，必须为适用牌号各输出一条 or_choice_group 规则：property_key="hardness"，category "mechanical"，requirement_level 按条款（协商/条件触发项用 CONDITIONAL 或 OPTIONAL_AGREED），trigger_condition 取对应条款中的壁厚/外径前置条件（JS 表达式惯例，如 "ctx.header.dimensions.wall_thickness_mm >= 1.7"），criteria={options:[{sub_key:"HRB"|"HBW"|"HV", rule_type:"numeric_range", criteria:{max,unit}}]}，option 数值严格取自硬度表原文。硬度表按组织类型（如"奥氏体型""其他""铁素体型"行）而非逐牌号给值时分两种情形：① 行内显式列名牌号 -> applies_to_grades 取这些牌号；② 行值为该组织类型的兜底值（如"奥氏体型 其他 ≤192 ≤90 ≤200"）-> 输出一条 applies_to_grades=["ORG:<组织类型>:OTHERS"] 的规则（组织类型取值：austenitic/ferritic/martensitic/duplex/precipitation_hardening，OTHERS 表示该组织类型中未被本表显式列名的全部牌号），由管线确定性展开挂载到对应切片。',
    '5. requirement_level 固定 "MANDATORY"（硬度等协商/条件项除外，见第 4 条），rule_id 格式 "MECH_{spec_key}_{指标}"，display_name 如 "抗拉强度 (Rm)"。',
    '6. 每条规则 source_clause = 所在文本块的【条款号】。',
    '【输出 JSON 结构】{"slices": [{"spec_key": string, "primary_grade": string, "display_name": string, "aliases": string[], "mechanical_rules": [{"rule_id": string, "category": "mechanical", "property_key": string, "display_name": string, "rule_type": "numeric_range" | "or_choice_group", "requirement_level": string, "trigger_condition"?: string, "criteria": object, "source_clause": string}]}]}',
    '【力学性能相关块】',
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

/* ==========================================================================
   v2 提取任务：工艺/探伤规则、化学动态公式、尺寸公差表
   - 三个任务均逐块调用 + 有限重试（复用 callWithRetry），聊天客户端可注入
   - 工艺/公式规则携带 applies_to_grades 牌号适用性，由 S2 确定性展开挂载：
     按牌号/统一代号匹配切片（ALL=全部切片），挂载后 rule_id 追加 _{spec_key}
     保证全局唯一；未匹配到任何切片的规则进入 unmounted 移交 S3 拦截，绝不静默丢弃
   ========================================================================== */

/** 牌号适用性归一化："ALL" 或牌号/统一代号数组；缺失/非法归一为空数组（交由 S3 拦截） */
function normalizeAppliesToGrades(raw: unknown): string[] {
  if (raw === 'ALL') return ['ALL'];
  if (Array.isArray(raw)) {
    return raw.map((g) => String(g).trim()).filter((g) => g.length > 0);
  }
  return [];
}

/**
 * property_key 闭集清单注入段（复用项目闭集白名单思路，抑制命名漂移洪水）：
 * 由既有标准库扫描目录（promote.scanPropertyKeyCatalog）按类别分组呈现；语义匹配时
 * LLM 须严格从清单选取 key，清单外新指标才允许新 key（将触发 S3 注册表 lint 人工抽检）。
 * 目录为空/缺省（首次建库）时返回空数组——不注入、不报错、不阻断。
 */
export function propertyKeyCatalogLines(catalog?: ReadonlyMap<string, { category: string; display_name: string }>): string[] {
  if (!catalog || catalog.size === 0) return [];
  const byCategory = new Map<string, string[]>();
  for (const [key, meta] of catalog) {
    const cat = meta.category || 'other';
    const label = meta.display_name ? `${key}（${meta.display_name}）` : key;
    const list = byCategory.get(cat) ?? [];
    list.push(label);
    byCategory.set(cat, list);
  }
  const lines = ['【property_key 闭集清单（来自既有标准库注册表，按类别分组）】'];
  for (const cat of [...byCategory.keys()].sort()) {
    lines.push(`${cat}: ${byCategory.get(cat)!.sort().join('、')}`);
  }
  lines.push('【选取规则】输出 property_key 时，语义匹配须严格从闭集清单中选取（一字不差）；仅当指标确属清单外全新概念时才允许新 key（新 key 将触发命名漂移注册表 lint 转人工抽检）。');
  return lines;
}

/**
 * 检验项目一览表块识别（表5/表6 类）：它们是试验项目清单而非规则本体，
 * 与正文条款（6.x）重复进入 process_rules 通道会造成同指标规则泛滥（真实 E2E 曾出现
 * 单一切片 4 条涡流规则）。形态特征：
 * - 表锚点块：表题含"检验"且含"一览表/试验项目/取样方法"；
 * - 续块（clauseRef 被误锚定的表6 残片）：≥3 行整数序号清单行 + 取样数量语境（每批/逐根/每炉 + 试样/取样）。
 * 正文条款块为小数章节号（6.6.1 等），不满足整数序号行特征，不会误排。
 */
export function isInspectionScheduleBlock(block: TextBlock): boolean {
  if (block.blockType !== 'process_ndt_clauses') return false;
  const text = block.text;
  if (block.clauseRef.startsWith('表') && /检验/.test(text) && /一览表|试验项目|取样方法|取样数量/.test(text)) {
    return true;
  }
  const itemLines = text.split('\n').filter((line) => /^\s*\d{1,2}\s+\S/.test(line)).length;
  return itemLines >= 3 && /(每批|逐根|每炉)/.test(text) && /(试样|取样)/.test(text);
}

function parseDraftRule(raw: unknown, blockRef: string): DraftRule {
  const rule = raw as Record<string, unknown>;
  if (!rule || typeof rule !== 'object') {
    throw new ModelApiExecutionError(`规则提取结果含非法条目（块 ${blockRef}）`);
  }
  const criteria = rule.criteria && typeof rule.criteria === 'object' && !Array.isArray(rule.criteria)
    ? (rule.criteria as Record<string, unknown>)
    : {};
  return {
    rule_id: String(rule.rule_id || ''),
    category: String(rule.category || ''),
    property_key: String(rule.property_key || ''),
    display_name: String(rule.display_name || ''),
    description: typeof rule.description === 'string' ? rule.description : undefined,
    rule_type: String(rule.rule_type || ''),
    requirement_level: typeof rule.requirement_level === 'string' ? rule.requirement_level : undefined,
    trigger_condition: typeof rule.trigger_condition === 'string' ? rule.trigger_condition : undefined,
    criteria,
    source_clause: String(rule.source_clause || ''),
    applies_to_grades: normalizeAppliesToGrades(rule.applies_to_grades),
  };
}

async function extractProcessRules(
  chat: ChatClient,
  blocks: TextBlock[],
  catalogLines: string[] = [],
): Promise<DraftRule[]> {
  const userPrompt = [
    '【任务】从工艺/无损检测条款文本块中提取工艺性能/金相/腐蚀/无损检测/表面质量规则，输出规则数组。',
    '【硬性要求】',
    '1. 每条规则字段：rule_id（不含牌号，如 "PROC_FLATTENING"、"NDT_ULTRASONIC"）、category（process 工艺性能 / metallographic 金相组织 / corrosion 耐腐蚀 / ndt 无损检测 / surface 表面质量）、property_key（英文蛇形，语义匹配须取自下方闭集清单）、display_name（中文）、rule_type、requirement_level（MANDATORY/CONDITIONAL/OPTIONAL_AGREED/EXEMPT）、criteria（按 rule_type 取值，见第 3 条）、source_clause（严格等于所在文本块的【条款号】）、applies_to_grades、trigger_condition?（见第 10 条）、description?（原文公式/外部引用等补充说明）。',
    '2. applies_to_grades：规则适用的牌号/统一代号数组（如 ["06Cr18Ni11Ti","S32168"]）；标准未限定牌号时为 "ALL"。严禁输出原文未出现的牌号；条款限定组织类型作用域时按第 9 条判读。',
    '3. rule_type 与 criteria 对照（数值/标准号必须与原文逐字一致，原文未给出的字段不得输出）：',
    '   - qualitative_enum（晶间腐蚀方法等定性评级）：criteria={method?, test_standard, required_level?, expected?}',
    '   - enum_acceptance（验收等级类 NDT，如超声/涡流验收等级 U2/E3H）：criteria={required_level, test_standard}',
    '   - exemption（豁免条款，见第 9 条）：criteria={reason}',
    '   - alternative_group（水压/涡流等替代检验组，强制结构见第 5 条）：criteria={group_logic:"AT_LEAST_ONE_PASS", candidates:[{candidate_key, display_name, test_standard, required_level?, calc_pressure_formula?, max_pressure_cap?, min_holding_time_s?, criteria_description?}]}',
    '   - or_choice_group（硬度 HRB/HBW/HV 多选一）：criteria={options:[{sub_key, rule_type:"numeric_range", criteria:{min,max,unit}}]}',
    '   - qualitative_and_numeric（扩口等）：criteria={cone_angle_deg?, flaring_rate_min_percent?, expected_visual_result, test_standard}',
    '   - dynamic_formula_pass（压扁等，公式可求值化见第 7 条）：criteria={formula_distance_H, expected_visual_result, test_standard}',
    '   - qualitative_pass（表面质量等）：criteria={expected}',
    '   - numeric_range（表面粗糙度等，强制结构见第 8 条）：criteria={min,max,unit,rounding_decimals?}',
    '4. 公式细节引用外部标准时（如压扁间距公式），不得臆造公式，在 criteria_description/description 中说明引用出处即可。',
    '5. 替代/组合检验结构保真（强制）：互为替代或组合的检验（典型如水压试验与涡流检测替代组）必须输出为一条 alternative_group 规则，candidates 逐项列出各替代方案——字段语义：calc_pressure_formula=试验压力计算公式（如 "P=2SR/D"），max_pressure_cap=最大试验压力上限（MPa），min_holding_time_s=最短稳压时间（s），required_level=探伤验收等级（如 E2H/U2），criteria_description=该方案判定要点原文摘要。严禁把替代组拆成独立的多条规则（如单独一条水压 qualitative_and_numeric + 单独一条涡流 qualitative_enum）。golden 范式示例（结构须对齐）：',
    '   {"rule_id":"NDT_TIGHTNESS_GROUP","category":"ndt","property_key":"pressure_tightness","display_name":"致密性/水压试验组","rule_type":"alternative_group","requirement_level":"MANDATORY","criteria":{"group_logic":"AT_LEAST_ONE_PASS","candidates":[{"candidate_key":"hydraulic_test","display_name":"逐根液压试验","test_standard":"GB/T 241","max_pressure_cap":20,"min_holding_time_s":10,"criteria_description":"试验压力按公式计算，最大试验压力不超过 20MPa，稳压时间不少于 10s 无渗漏"},{"candidate_key":"eddy_current_test","display_name":"高等级涡流探伤替代","test_standard":"GB/T 7735-2016","required_level":"E2H","criteria_description":"外径<=25mm对比样管人工缺陷通孔0.8mm；外径>25mm符合 E2H 级"}]},"applies_to_grades":"ALL"}',
    '6. 外部引用条款（原文形如"应符合 NB/T 47019.1—2021 中 7.11.4 的规定"，本文件未给出具体数值/阈值）：严禁编造阈值；输出 qualitative_pass（criteria={expected:"CLEAN_PASS"}）或 qualitative_enum，并在 description/criteria_description 中注明外部引用来源（如 "引用 NB/T 47019.1—2021 7.11.4，阈值以被引标准为准"）。',
    '7. 压扁公式可求值化（强制）：原文 "H=(1+α)S/(α+S/D)" 一类含标准给定系数（如 α=0.09）的公式，formula_distance_H 必须代入系数并转换为 JS 可求值表达式（仅 S/D 变量、数字、四则运算符与括号，显式乘号），如 "(1 + 0.09) * S / (0.09 + S / D)"；原文公式形态在 description 中保留（如 "压扁间距 H=(1+α)S/(α+S/D)，α=0.09"）。',
    '8. surface_roughness 结构保真：本文件给出数值时必须输出 numeric_range（unit 固定 "μm"，rounding_decimals 取原文小数位）；仅外部引用未给出数值时按第 6 条输出定性规则并注明引用来源。',
    '9. 组织类型作用域与豁免（强制，附判读 worked example）：① 条款限定组织类型作用域（如"其他奥氏体型钢管""铁素体型钢管"）时，applies_to_grades 必须只含该组织类型的牌号（结合化学表"组织类型"列判读），严禁给铁素体型牌号输出奥氏体型专属规则；② 豁免条款（"X、Y 等牌号可不进行/无需进行某试验"）：为每个被豁免牌号各输出一条 rule_type="exemption"、requirement_level="EXEMPT"、property_key 与被豁免检验项一致的规则，criteria={reason:原文依据句}。',
    '【判读 worked example】输入条款："牌号为 07Cr19Ni10、16Cr23Ni13、20Cr25Ni20、07Cr17Ni12Mo2、07Cr19Ni11Ti、07Cr18Ni11Nb 的钢管可不进行晶间腐蚀试验，其他奥氏体型钢管应进行晶间腐蚀试验"。判读逻辑：前半句列名的 6 个牌号是豁免对象；后半句"其他奥氏体型钢管"限定了正常检验规则的作用域——只覆盖奥氏体型牌号中除上述 6 个以外的牌号，铁素体型牌号（如 06Cr13、10Cr17、008Cr27Mo）既不在豁免名单也不在该作用域内，不输出任何规则。期望输出：① 6 条 exemption 规则（每个豁免牌号一条，applies_to_grades=[该牌号]，criteria={reason:"标准 7.7.1 明确规定该牌号可不进行晶间腐蚀试验"}）；② 1 条正常检验规则（如 {"rule_id":"CORR_INTERGRANULAR","category":"corrosion","property_key":"intergranular_corrosion","rule_type":"qualitative_enum"|"qualitative_pass","requirement_level":"MANDATORY","criteria":{"method":"Method_E","test_standard":"GB/T 4334-2020","expected":"NO_CORROSION_TREND"},"applies_to_grades":[其余全部奥氏体型牌号，不含铁素体型]})；③ 铁素体型牌号零规则。常见错误（严禁）：给豁免牌号输出 MANDATORY 检验规则；把正常规则的 applies_to_grades 写成 ALL（会误挂铁素体）。',
    '10. 前置条件 trigger_condition（强制）：条款含"壁厚/外径 ≤/≥ X 时进行/不进行"类前置条件时，必须输出 trigger_condition（JS 表达式惯例：壁厚 ctx.header.dimensions.wall_thickness_mm、外径 ctx.header.dimensions.outer_diameter_mm），如"壁厚不大于 10mm" -> "ctx.header.dimensions.wall_thickness_mm <= 10"。',
    '11. 协商/条件项区分（强制，防误伤）：无判定准则的纯兜底协商条款不输出规则（仅声明"经供需双方协商可采用其他方法"而无任何验收指标、等级或阈值者，如"可采用其他无损检测方法和验收等级"）；但带有具体指标表/验收等级的协商或条件触发项必须输出——requirement_level 用 OPTIONAL_AGREED（供需协商并在合同中注明）或 CONDITIONAL（尺寸等条件触发），并携带 trigger_condition 与具体 criteria（如硬度试验"壁厚≥1.7mm 可做布氏/洛氏/维氏硬度，值符合表N" -> or_choice_group + trigger_condition + CONDITIONAL）。',
    '12. expected_visual_result 闭集（强制）：dynamic_formula_pass / qualitative_and_numeric 的 expected_visual_result 仅允许从闭集 ["NO_CRACKS","NO_CRACKS_OR_SPLITS","NO_LEAKS","CLEAN_PASS"] 选取（无裂纹/无裂纹或裂口/无渗漏/清洁通过），严禁自造机器码；语义真相由 description 原文层承载。',
    '13. 定性规则原文双层记录（强制）：qualitative_pass / qualitative_enum / exemption 必须携带 description（或 criteria.criteria_description），保留标准原文表述（含 CJK）；机器码 criteria（expected/method/required_level/reason）仅做路由，不得替代原文层。',
    ...catalogLines,
    '【输出 JSON 结构】{"rules": [{"rule_id": string, "category": string, "property_key": string, "display_name": string, "rule_type": string, "requirement_level": string, "trigger_condition"?: string, "description"?: string, "criteria": object, "source_clause": string, "applies_to_grades": string[] | "ALL"}]}',
    '【条款块】',
    blockSection(blocks),
  ].join('\n');
  const parsed = await callWithRetry(chat, 'process_rules', SYSTEM_PROMPT, userPrompt);
  const rules = (parsed as { rules?: unknown[] })?.rules;
  if (!Array.isArray(rules)) {
    throw new ModelApiExecutionError('工艺/探伤规则提取结果缺少 rules 数组');
  }
  return rules.map((r) => parseDraftRule(r, blocks[0]?.clauseRef || ''));
}

async function extractDynamicFormulas(
  chat: ChatClient,
  blocks: TextBlock[],
  catalogLines: string[] = [],
): Promise<DraftRule[]> {
  const userPrompt = [
    '【任务】从化学成分表文本块的"其他"列与表注中提取动态公式规则（稳定化元素按碳/氮含量动态计算限值，如 "Ti：5（C+N）～0.70"、"Nb：10C～1.10"），输出规则数组。',
    '【硬性要求】',
    '1. 仅提取限值引用其他元素的公式型条目；"其他"列中的普通数值范围（如 "N：0.10～0.16"、"Cu：0.50～1.00"）不在本任务范围，不得输出。',
    '2. formula_min/formula_max 使用项目表达式惯例：元素变量写 ctx.chemical.<元素符号>（如 "5 * (ctx.chemical.C + ctx.chemical.N)"）；公式中的数值常量必须与原文逐字一致（如 5、0.70）。',
    '3. 每条规则：rule_id（不含牌号，如 "CHEM_TI_STABILIZED"）、category 固定 "chemical"、property_key=元素符号（语义匹配须取自下方闭集清单）、display_name（中文）、rule_type 固定 "dynamic_expression"、criteria={formula_min, formula_max, min, max, unit:"%", rounding_decimals, note?}、source_clause（严格等于所在文本块的【条款号】）、applies_to_grades（该公式行的牌号/统一代号数组，或 "ALL"）。',
    '4. rounding_decimals 固定取 3（公式型规则按判定精度统一 3 位修约，与原文小数位无关，如原文上限 0.70 仍为 3）。',
    '5. 原文未给出动态下限时 formula_min=null 且 min=null；未给出上限时 formula_max=null 且 max=null；"—"（标准未规定）跳过。',
    ...catalogLines,
    '【输出 JSON 结构】{"rules": [{"rule_id": string, "category": "chemical", "property_key": string, "display_name": string, "rule_type": "dynamic_expression", "criteria": {"formula_min": string|null, "formula_max": string|null, "min": number|null, "max": number|null, "unit": "%", "rounding_decimals": number}, "source_clause": string, "applies_to_grades": string[] | "ALL"}]}',
    '【化学成分表块】',
    blockSection(blocks),
  ].join('\n');
  const parsed = await callWithRetry(chat, 'dynamic_formulas', SYSTEM_PROMPT, userPrompt);
  const rules = (parsed as { rules?: unknown[] })?.rules;
  if (!Array.isArray(rules)) {
    throw new ModelApiExecutionError('动态公式提取结果缺少 rules 数组');
  }
  return rules.map((r) => parseDraftRule(r, blocks[0]?.clauseRef || ''));
}

// 公差阶梯规则中的数值字段（schema 要求 number；LLM 偶发输出字符串，确定性纠偏非臆造：
// 仅当字符串是纯数值字面量时转换，其余原样保留交由 S3 schema 校验拦截）
const TOLERANCE_NUMERIC_FIELDS = [
  'range_min',
  'range_max',
  'outer_diameter_limit',
  'plus_tolerance_value',
  'minus_tolerance_value',
] as const;

/**
 * source_clause 引用确定性归一：模型偶发把 prompt 的块标记原文抄入
 * （如 "【条款号 7.8】"），剥离标记字符与空白，使其与切块 clauseRef 精确对齐。
 * 对新鲜提取与缓存草稿幂等生效
 */
export function normalizeSourceClauseRefs(drafts: ExtractionDrafts): ExtractionDrafts {
  const clean = (ref: string): string =>
    ref.replace(/[【】]/g, '').replace(/^条款号\s*/, '').trim();
  for (const slice of drafts.slices ?? []) {
    for (const rule of slice.evaluation_rules ?? []) {
      if (typeof rule.source_clause === 'string') rule.source_clause = clean(rule.source_clause);
    }
  }
  for (const rule of drafts.unmounted_rules ?? []) {
    if (typeof rule.source_clause === 'string') rule.source_clause = clean(rule.source_clause);
  }
  return drafts;
}

/**
 * 公差表数值字段确定性纠偏：纯数值字符串（如 "0.15"、"-0.40"）转为 number。
 * 对新鲜提取与缓存草稿幂等生效；非纯数值字符串原样保留（不猜测、不截断）
 */
export function sanitizeToleranceNumericFields(drafts: ExtractionDrafts): ExtractionDrafts {
  for (const table of drafts.tolerance_tables ?? []) {
    for (const rule of table.rules ?? []) {
      const record = rule as Record<string, unknown>;
      for (const field of TOLERANCE_NUMERIC_FIELDS) {
        const v = record[field];
        if (typeof v === 'string' && v.trim().length > 0 && /^[-+]?\d+(?:\.\d+)?$/.test(v.trim())) {
          record[field] = Number(v.trim());
        }
      }
    }
  }
  return drafts;
}

async function extractToleranceTables(chat: ChatClient, blocks: TextBlock[]): Promise<DraftToleranceTable[]> {
  const userPrompt = [
    '【任务】从尺寸公差表文本块中提取公差阶梯表结构。',
    '【硬性要求】',
    '1. 常规阶梯表：table_id（可附标准号前缀，如 "TABLE_1"）、table_name（表标题原文）、rules=[{dimension_property:"outer_diameter"|"wall_thickness", process:"cold_drawn"|"hot_rolled"|"hot_extrusion"|"all", delivery_mode:"nominal_wall"|"min_wall", range_min?, range_max?, outer_diameter_limit?, plus_tolerance_value, plus_tolerance_is_percent, minus_tolerance_value, minus_tolerance_is_percent, note?}]。',
    '2. 所有数值字段必须输出 JSON number（如 0.15、-0.40），严禁输出字符串形态。',
    '3. 偏差方向取值：原文 "±0.40" -> plus_tolerance_value=0.40, minus_tolerance_value=-0.40；"正偏差…负偏差…" 按原文方向取值。',
    '4. 跨标准引用条款（如"应符合 NB/T 47019.1 中表 2 的规定"）：严禁臆造被引标准数据——输出 external_reference="NB/T 47019.1 表2" 且 rules 为空数组。',
    '5. 所有数值必须与原文逐字一致；表内未给出的阶梯字段不得输出。',
    '【输出 JSON 结构】{"tables": [{"table_id": string, "table_name": string, "rules": [...], "external_reference"?: string}]}',
    '【公差表块】',
    blockSection(blocks),
  ].join('\n');
  const parsed = await callWithRetry(chat, 'tolerance_tables', SYSTEM_PROMPT, userPrompt);
  const tables = (parsed as { tables?: unknown[] })?.tables;
  if (!Array.isArray(tables)) {
    throw new ModelApiExecutionError('尺寸公差表提取结果缺少 tables 数组');
  }
  const mapped = tables.map((t) => {
    const table = t as Record<string, unknown>;
    const rules = Array.isArray(table.rules) ? (table.rules as Record<string, unknown>[]) : [];
    return {
      table_id: String(table.table_id || ''),
      table_name: String(table.table_name || ''),
      rules,
      external_reference: typeof table.external_reference === 'string' && table.external_reference.trim().length > 0
        ? table.external_reference.trim()
        : undefined,
      source_block: blocks[0]?.clauseRef || '',
    };
  });
  // 提取侧同步纠偏数值字符串（与缓存草稿路径幂等一致）
  return sanitizeToleranceNumericFields({ meta: {}, slices: [], clauses: [], tolerance_tables: mapped }).tolerance_tables;
}

/** 切片的牌号别名集合：spec_key / primary_grade / unified_code 均视作合法匹配令牌 */
function sliceGradeTokens(slice: DraftSlice): string[] {
  return [slice.spec_key, slice.primary_grade, slice.unified_code]
    .filter((g): g is string => typeof g === 'string' && g.trim().length > 0);
}

/**
 * 组织类型兜底标记（项4，硬度表"其他"行语义）："ORG:<structure_type>:OTHERS" 表示
 * "该组织类型中未被本表显式列名的全部牌号"；由 S2 挂载时确定性展开，结构类型取值与
 * SpecificationSliceSchema.structure_type 惯例一致（austenitic/ferritic/martensitic/duplex/precipitation_hardening）
 */
const ORG_SCOPE_MARKER_RE = /^ORG:([a-z_]+):OTHERS$/;

function isOrgScopeMarker(token: string): boolean {
  return ORG_SCOPE_MARKER_RE.test(token);
}

/**
 * 牌号适用性确定性展开挂载（S2 产物契约，同输入同输出）：
 * - applies_to_grades 含 "ALL" -> 挂载到全部切片；显式牌号/统一代号按别名匹配
 * - 含 "ORG:<type>:OTHERS" -> 挂载到 structure_type === type 且未被同表显式列名的切片
 *   （"本表显式列名"= 同一批规则中同 property_key+source_clause 的显式牌号规则所覆盖的切片）
 * - 挂载后 rule_id 追加 _{spec_key}，保证跨切片全局唯一（同一 ALL 规则展开到多个切片）
 * - 未匹配到任何切片的规则进入 unmounted 移交 S3（LINT_APPLIES_TO_GRADES 拦截），绝不静默丢弃
 */
export function mountRulesByGrades(
  rules: DraftRule[],
  slices: DraftSlice[],
): { perSlice: DraftRule[][]; unmounted: DraftRule[] } {
  const perSlice: DraftRule[][] = slices.map(() => []);
  const unmounted: DraftRule[] = [];

  // 预扫：同批规则中"本表显式列名"的切片声明（同 property_key+source_clause 的显式牌号规则覆盖集），
  // ORG:OTHERS 展开时排除这些切片，保证"其他"行不覆盖显式列名牌号
  const explicitClaims = new Set<string>();
  for (const rule of rules) {
    const applies = rule.applies_to_grades ?? [];
    if (applies.length === 0 || applies.includes('ALL')) continue;
    for (const g of applies) {
      if (isOrgScopeMarker(g)) continue; // ORG 标记不是显式牌号
      slices.forEach((slice) => {
        if (new Set(sliceGradeTokens(slice)).has(g)) {
          explicitClaims.add(`${slice.spec_key}|${rule.property_key}|${rule.source_clause}`);
        }
      });
    }
  }

  for (const rule of rules) {
    const applies = rule.applies_to_grades ?? [];
    const targetIdx = new Set<number>();
    if (applies.includes('ALL')) {
      slices.forEach((_, i) => targetIdx.add(i));
    } else {
      slices.forEach((slice, i) => {
        const tokens = new Set(sliceGradeTokens(slice));
        if (applies.some((g) => tokens.has(g))) targetIdx.add(i);
      });
      for (const g of applies) {
        const orgMatch = ORG_SCOPE_MARKER_RE.exec(g);
        if (!orgMatch) continue;
        const structureType = orgMatch[1]!;
        slices.forEach((slice, i) => {
          if (slice.structure_type !== structureType) return;
          if (explicitClaims.has(`${slice.spec_key}|${rule.property_key}|${rule.source_clause}`)) return;
          targetIdx.add(i);
        });
      }
    }
    if (targetIdx.size === 0) {
      unmounted.push(rule);
      continue;
    }
    for (const i of targetIdx) {
      const specKey = slices[i]!.spec_key;
      perSlice[i]!.push({
        ...rule,
        criteria: { ...rule.criteria },
        applies_to_grades: [...applies],
        rule_id: `${rule.rule_id}_${specKey}`,
      });
    }
  }
  return { perSlice, unmounted };
}

/**
 * criteria 丰富度度量：顶层字段数优先，并列取序列化长度（确定性比较，防同分抖动）。
 * 仅用于同 property_key 重复规则的取舍，不跨 key 比较。
 */
function criteriaRichness(criteria: Record<string, unknown>): [number, number] {
  return [Object.keys(criteria).length, JSON.stringify(criteria).length];
}

function isRicherCriteria(candidate: Record<string, unknown>, current: Record<string, unknown>): boolean {
  const [cKeys, cLen] = criteriaRichness(candidate);
  const [kKeys, kLen] = criteriaRichness(current);
  return cKeys > kKeys || (cKeys === kKeys && cLen > kLen);
}

/**
 * 同切片按 property_key 确定性去重（S2 产物契约，同输入同输出）：
 * 正文条款与检验一览表重复提取时，同一切片会出现同 property_key 的多条规则（真实 E2E
 * 曾出现单切片 4 条涡流规则）；保留优先级：确定性法条模式产出（rule.deterministic）
 * 恒胜出于 LLM 产物（阶段 B，防双重产出），同级再比 criteria 更丰富者。
 * 被去重项的信息已由保留版本承载，经 progress 计数上报——不进入 unmounted
 * （unmounted 语义是无法挂载、须人工处理）。保留规则维持其原始出现位置。
 */
export function dedupeSliceRulesByPropertyKey(slices: DraftSlice[], onTask?: (message: string) => void): { kept: number; dropped: number } {
  let kept = 0;
  let dropped = 0;
  for (const slice of slices) {
    const winners = new Map<string, DraftRule>();
    for (const rule of slice.evaluation_rules) {
      const existing = winners.get(rule.property_key);
      if (!existing) {
        winners.set(rule.property_key, rule);
        continue;
      }
      const candidateDeterministic = rule.deterministic === true;
      const existingDeterministic = existing.deterministic === true;
      const candidateWins = candidateDeterministic !== existingDeterministic
        ? candidateDeterministic
        : isRicherCriteria(rule.criteria, existing.criteria);
      if (candidateWins) {
        winners.set(rule.property_key, rule);
      }
    }
    if (winners.size === slice.evaluation_rules.length) {
      kept += winners.size;
      continue;
    }
    const emitted = new Set<string>();
    const result: DraftRule[] = [];
    for (const rule of slice.evaluation_rules) {
      const key = rule.property_key;
      if (emitted.has(key)) continue;
      if (winners.get(key) !== rule) continue; // 首现但非优胜：跳过，待优胜出现时收编
      result.push(rule);
      emitted.add(key);
    }
    const sliceDropped = slice.evaluation_rules.length - result.length;
    slice.evaluation_rules = result;
    kept += result.length;
    dropped += sliceDropped;
    if (sliceDropped > 0) {
      onTask?.(`切片 ${slice.spec_key} 按 property_key 去重：丢弃 ${sliceDropped} 条重复规则（保留 criteria 更丰富者）`);
    }
  }
  return { kept, dropped };
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
 * 附录类锚点判定：附录章节与附录表格均为资料性重复内容，不参与切片提取与牌号行数
 * 对账，避免与正文表产生重复规则。具体形态由 profile.isAppendixRef 判定
 * （zh：附录A/表A.1；en：ANNEX X/APPENDIX X），缺省 zh-cn 与历史行为一致
 */
export function isAppendixLikeRef(clauseRef: string, profile: StandardProfile = ZH_CN_PROFILE): boolean {
  return profile.isAppendixRef(clauseRef);
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
      slice.description = `${stdId} ${grade} (${slice.spec_key}) 化学成分、力学性能与工艺检验规则切片`;
    }
  }
  return drafts;
}

/**
 * S2 主入口：按块类型路由执行 LLM 提取并合并草稿
 * 附录（资料性）表格不参与切片提取，避免干扰正式牌号表对账
 * v2：工艺/探伤规则与化学动态公式经 mountRulesByGrades 确定性展开挂载到切片；
 *     尺寸公差表独立成草稿（跨标准引用显式记录）；未挂载规则移交 S3 拦截；
 *     property_key 闭集清单注入 process_rules/dynamic_formulas prompt（抑制命名漂移，
 *     目录为空/缺省不注入）；检验项目一览表块排除出 process_rules 通道（清单非规则本体）；
 *     挂载后按 property_key 确定性去重（保留 criteria 更丰富者）
 */
export async function extractAll(
  blocks: TextBlock[],
  chat: ChatClient,
  onTask?: (message: string) => void,
  propertyKeyCatalog?: ReadonlyMap<string, { category: string; display_name: string }>,
  profile: StandardProfile = ZH_CN_PROFILE,
): Promise<ExtractionDrafts> {
  const pick = (task: keyof typeof EXTRACTABLE_TYPES): TextBlock[] =>
    blocks.filter((b) => !isAppendixLikeRef(b.clauseRef, profile) && (EXTRACTABLE_TYPES[task] || []).includes(b.blockType));

  const metaBlocks = pick('meta');
  const chemBlocks = pick('slices_chemical');
  const mechBlocks = pick('slices_mechanical');
  const clauseBlocks = pick('clauses');
  // 检验项目一览表（表5/表6 类）只是试验项目清单而非规则本体，排除出 process_rules 通道
  const scheduleExcluded = pick('process_rules').filter((b) => isInspectionScheduleBlock(b));
  const processBlocks = pick('process_rules').filter((b) => !isInspectionScheduleBlock(b));
  const formulaBlocks = pick('dynamic_formulas');
  const toleranceBlocks = pick('tolerance_tables');
  const catalogLines = propertyKeyCatalogLines(propertyKeyCatalog);

  onTask?.(`提取元信息（${metaBlocks.length} 个范围/前言块）...`);
  const meta = await extractMeta(chat, metaBlocks);

  // 按块逐块调用：整表合并单次调用的输出体积会超出模型输出上限导致 JSON 截断；
  // 大表（牌号行 > GRADE_TABLE_BATCH_SIZE）先行级拆批（每批携带表头/表注上下文），逐批提取后由 mergeSliceDrafts 按 spec_key 合并
  const chemSlices: DraftSlice[] = [];
  for (const [i, block] of chemBlocks.entries()) {
    const batches = splitGradeTableBlock(block, profile);
    if (batches.length > 1) {
      onTask?.(`表块 ${block.clauseRef} 拆为 ${batches.length} 批提取（每批 ≤${GRADE_TABLE_BATCH_SIZE} 牌号行）...`);
    }
    onTask?.(`提取化学成分切片（第 ${i + 1}/${chemBlocks.length} 个表块 ${block.clauseRef}${batches.length > 1 ? `，${batches.length} 批` : ''}）...`);
    for (const batch of batches) {
      chemSlices.push(...(await extractChemicalSlices(chat, [batch], profile)));
    }
  }

  const mechSlices: DraftSlice[] = [];
  for (const [i, block] of mechBlocks.entries()) {
    const batches = splitGradeTableBlock(block, profile);
    if (batches.length > 1) {
      onTask?.(`表块 ${block.clauseRef} 拆为 ${batches.length} 批提取（每批 ≤${GRADE_TABLE_BATCH_SIZE} 牌号行）...`);
    }
    onTask?.(`提取力学性能切片（第 ${i + 1}/${mechBlocks.length} 个表块 ${block.clauseRef}${batches.length > 1 ? `，${batches.length} 批` : ''}）...`);
    for (const batch of batches) {
      mechSlices.push(...(await extractMechanicalSlices(chat, [batch], profile)));
    }
  }

  const clauses: DraftClause[] = [];
  for (const [i, block] of clauseBlocks.entries()) {
    onTask?.(`提取工艺/无损检测条款（第 ${i + 1}/${clauseBlocks.length} 个条款块 ${block.clauseRef}）...`);
    clauses.push(...(await extractClauses(chat, [block])));
  }

  // v2：工艺/探伤/金相/腐蚀/表面规则与化学动态公式逐块提取，牌号适用性由 S2 确定性展开
  const appliesRules: DraftRule[] = [];
  if (scheduleExcluded.length > 0) {
    onTask?.(`检验项目一览表块排除出 process_rules 通道（${scheduleExcluded.length} 个块：${scheduleExcluded.map((b) => b.clauseRef).join('、')}）...`);
  }
  // 阶段 B：确定性法条模式预扫描（中英双语）——豁免/作用域/牌号清单限定等法条模式命中块
  // 直接从 LLM process_rules 输入剔除（避免双重产出），模式产出（deterministic 标记）与
  // LLM 产物同键冲突时由去重优先级保证确定性版本胜出
  const mergedSlices = mergeSliceDrafts(chemSlices, mechSlices);
  const clausePatterns = applyClausePatterns(processBlocks, mergedSlices);
  const llmProcessBlocks = processBlocks.filter((b) => !clausePatterns.hitClauseRefs.has(b.clauseRef));
  if (clausePatterns.rules.length > 0) {
    appliesRules.push(...clausePatterns.rules);
    onTask?.(`确定性法条模式提取 ${clausePatterns.rules.length} 条规则（${clausePatterns.hitClauseRefs.size} 个条款块未走 LLM process_rules）...`);
  }
  for (const [i, block] of llmProcessBlocks.entries()) {
    onTask?.(`提取工艺/探伤/表面规则（第 ${i + 1}/${llmProcessBlocks.length} 个条款块 ${block.clauseRef}）...`);
    appliesRules.push(...(await extractProcessRules(chat, [block], catalogLines)));
  }
  for (const [i, block] of formulaBlocks.entries()) {
    onTask?.(`提取化学成分动态公式（第 ${i + 1}/${formulaBlocks.length} 个表块 ${block.clauseRef}）...`);
    appliesRules.push(...(await extractDynamicFormulas(chat, [block], catalogLines)));
  }

  const { perSlice, unmounted } = mountRulesByGrades(appliesRules, mergedSlices);
  mergedSlices.forEach((slice, i) => {
    slice.evaluation_rules.push(...perSlice[i]!);
  });
  dedupeSliceRulesByPropertyKey(mergedSlices, onTask);

  const toleranceTables: DraftToleranceTable[] = [];
  for (const [i, block] of toleranceBlocks.entries()) {
    onTask?.(`提取尺寸公差表（第 ${i + 1}/${toleranceBlocks.length} 个表块 ${block.clauseRef}）...`);
    toleranceTables.push(...(await extractToleranceTables(chat, [block])));
  }

  return fillSliceHarnessFields({
    meta,
    slices: mergedSlices,
    clauses,
    tolerance_tables: toleranceTables,
    unmounted_rules: unmounted,
  });
}
