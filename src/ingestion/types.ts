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
}

// S2 规格切片草稿：gates 通过并剥离 source_clause 后落盘为 SpecificationSlice
export interface DraftSlice {
  spec_key: string;
  spec_type?: string;
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

// S2 全量提取草稿
export interface ExtractionDrafts {
  meta: Record<string, unknown>;
  slices: DraftSlice[];
  clauses: DraftClause[];
}

// S2 可注入聊天客户端签名：便于测试注入预制响应，默认实现走 OpenAI 兼容接口
export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export type ChatTask = 'meta' | 'slices_chemical' | 'slices_mechanical' | 'clauses';

export interface ChatCallOptions {
  task: ChatTask;
}

export type ChatClient = (messages: ChatMessage[], opts: ChatCallOptions) => Promise<string>;
