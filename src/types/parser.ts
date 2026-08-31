/**
 * NormScale 多文档异步并发解析任务状态与 Token 指标数据类型
 */

export type DocumentParsingStatus = 'queued' | 'parsing' | 'ready' | 'error';

export interface DocumentParsingTask {
  docId: string;
  filename: string;
  fileSize?: string;
  status: DocumentParsingStatus;
  progress: number;            // 0 ~ 100
  streamingJson: string;       // 当前累积流式输出的结构化 JSON 文本
  stepPhase: string;           // 当前微步阶段描述
  inputTokens: number;         // 该文档输入 Token 开销
  outputTokens: number;        // 该文档输出 Token 开销
  durationSeconds: number;     // 该文档解析耗时 (秒)
  completedAt?: string;        // 完成时间戳
  errorMsg?: string;
}

export interface SessionTokenMetrics {
  totalInputTokens: number;    // 当前 Session 所有已处理/处理中文档累计输入 Token
  totalOutputTokens: number;   // 当前 Session 所有已处理/处理中文档累计输出 Token
  totalDurationSeconds: number;// 累计耗时 (秒)
  activeConcurrency: number;   // 当前正在并发解析的线程数 (如 2~3)
  readyDocsCount: number;      // 已经解析就绪的文档数
  totalDocsCount: number;      // 总文档数
}
