/* ==========================================================================
   标准文档离线入库管线共享类型定义 (Standard Ingestion Pipeline Types)
   - S0 预处理 / S1 切块 / S2 LLM 提取 / S3 质量门禁 / S4 编排 全链路复用
   ========================================================================== */

// S1 切块类型路由枚举：按标准文档惯例将文本块归类
export type BlockType =
  | 'chemistry_table'    // 化学成分表（牌号 × 元素含量）
  | 'mechanical_table'   // 力学性能表（牌号 × 拉伸/屈服/伸长率/硬度等）
  | 'tolerance_table'    // 尺寸公差表（外径/壁厚允许偏差）
  | 'process_ndt_clauses'// 工艺与无损检测条款（压扁/扩口/液压/涡流/超声/晶间腐蚀等）
  | 'scope_text'         // 前言/范围/规范性引用等元信息文本
  | 'garbled'            // 文本层损坏（字体子集化无 ToUnicode，输出乱码）
  | 'other';             // 其他正文

// S1 文本块：确定性切块的最小单元
export interface TextBlock {
  blockType: BlockType;
  clauseRef: string;   // 锚点条款号，如 "7.1"、"表3"、"附录A"、"前言"
  text: string;        // 块内归一化后的完整文本
}

// S0 按页文本中间产物
export interface PageText {
  pageNumber: number;
  text: string;
}

// S0 预处理输出
export interface PreprocessOutput {
  md5: string;
  cacheDir: string;
  fullText: string;
  pages: PageText[];
}

// S2 规则草稿：在 EvaluationRule 基础上强制携带 source_clause 供 S3 溯源断言
export interface DraftRule {
  rule_id: string;
  category: string;
  property_key: string;
  display_name: string;
  description?: string;
  rule_type: string;
  requirement_level?: string;
  trigger_condition?: string;
  criteria: Record<string, unknown>;
  source_clause: string;
  /**
   * S2 内部字段（v2 工艺/探伤/公式规则）：牌号适用性，取值 "ALL" 或牌号/统一代号数组。
   * 由 S2 确定性展开挂载到对应切片草稿；S3 校验其 ⊆ 切片牌号全集（防臆造牌号），
   * 落盘时随 source_clause 一并剥离
   */
  applies_to_grades?: string[];
  /**
   * S2 内部字段（阶段 B）：确定性法条模式产出标记——同切片同 property_key 去重时
   * 确定性版本优先于 LLM 产物；落盘时随 source_clause 一并剥离
   */
  deterministic?: boolean;
}

// S2 规格切片草稿：gates 通过并剥离 source_clause 后落盘为 SpecificationSlice
export interface DraftSlice {
  spec_key: string;
  spec_type?: string;
  standard_code?: string;
  display_name: string;
  primary_grade?: string;
  unified_code?: string;
  structure_type?: string;
  aliases?: string[];
  description?: string;
  evaluation_rules: DraftRule[];
}

// S2 条款草稿：StandardClause 之上保留来源块锚点
export interface DraftClause {
  clause_id: string;
  title: string;
  text: string;
  source_block: string;
}

// S2 尺寸公差表草稿（v2 tolerance_tables 任务）：在 DimensionToleranceTable 基础上保留来源块锚点
export interface DraftToleranceTable {
  table_id: string;
  table_name: string;
  rules: Record<string, unknown>[];
  /**
   * 跨标准外部引用（如 "NB/T 47019.1 表2"）：公差条款引用外部标准表时显式记录，
   * 此时 rules 必须为空数组——严禁臆造被引标准数据；S3 据此产生 MANUAL_REVIEW 级 issue
   */
  external_reference?: string;
  /** 来源块锚点（溯源用） */
  source_block: string;
}

// S2 全量提取草稿
export interface ExtractionDrafts {
  meta: Record<string, unknown>;
  slices: DraftSlice[];
  clauses: DraftClause[];
  /** v2 尺寸公差表草稿（缺省为空数组，兼容 v1 缓存产物） */
  tolerance_tables: DraftToleranceTable[];
  /**
   * v2 牌号适用性展开后未挂载到任何切片的规则（applies_to_grades 无匹配牌号）：
   * 绝不静默丢弃，移交 S3 报 LINT_APPLIES_TO_GRADES 拦截
   */
  unmounted_rules?: DraftRule[];
}

// S2 可注入聊天客户端签名：便于测试注入预制响应，默认实现走 OpenAI 兼容接口
// 视觉转录通道：content 支持 OpenAI 兼容多模态数组（与质保书管线
// src/extractor/openai-compatible-extractor.ts 的双模态输入契约一致）
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: string } };

export interface ChatMessage {
  role: 'system' | 'user';
  content: string | ChatContentPart[];
}

export type ChatTask =
  | 'meta'
  | 'slices_chemical'
  | 'slices_mechanical'
  | 'clauses'
  | 'process_rules'      // v2：工艺/探伤/金相/腐蚀/表面规则（含牌号适用性展开）
  | 'dynamic_formulas'   // v2：化学表"其他"列动态公式规则（如 Ti ≥ 5×(C+N)）
  | 'tolerance_tables'   // v2：尺寸公差表（含跨标准外部引用显式记录）
  | 'vision_transcribe'; // v3：乱码/扫描件多模态视觉转录（逐页 PNG -> 文本）

export interface ChatCallOptions {
  task: ChatTask;
}

export type ChatClient = (messages: ChatMessage[], opts: ChatCallOptions) => Promise<string>;
