/**
 * NormScale 质量证明书作业会话 (Inspection Session) 与两层树状数据模型
 * 
 * 层级关系：
 * Session (作业会话根节点，全局唯一 UUID)
 *   └─ SessionDocument (第 1 层：物理输入文档)
 *        └─ BatchSpecimen (第 2 层：各文档包含的炉批号/试样检验原子)
 */

import type { AdditionalTestItem } from '@/schemas/certificate.schema';

export type { AdditionalTestItem };

export interface ChemicalElementResult {
  element: string;
  value: string;
  confidence: string;
  status: 'ok' | 'warn';
  note?: string;
}

export interface BatchSpecimen {
  batchNo: string;             // 检验批号/试样号，如 "HT-2026-0881"
  subBatchIndex: number;       // 在文档中的试样序号 (1-indexed)
  certificateNo?: string;      // 质保书编号 / 材质单号，如 "MTC-2026-0881"
  constructionNo?: string;     // 施工号 / 工程项目编号，如 "26XXX-0888"
  productName?: string;        // 产品品名，如 "锅炉、热交换器用不锈钢无缝钢管"
  grade: string;               // 材料牌号，如 "022Cr17Ni12Mo2 (S31603)"
  standard: string;            // 声称执行标准，如 "GB/T 13296-2023"
  overrideGrade?: string;      // 用户人工切换的裁决牌号 (Manual Override)
  overrideStandard?: string;   // 用户人工切换的裁决标准 (Manual Override)
  supplier: string;            // 供货厂家名称
  dimensions: string;          // 交货规格，如 "OD 25.0mm × WT 2.0mm × L 6000mm"
  heatNo: string;              // 冶炼炉号 (Heat No.)
  packNo?: string;             // 钢管热处理炉号 / 装炉号 (Pack No. / Heat Treatment Lot No.)
  deliveryState?: string;      // 交货热处理状态，如 "固溶热处理 (Solution Treated)"
  verdict: 'PASS' | 'FAIL' | 'MANUAL_REVIEW';
  verdictSummary: string;      // 判定依据简述
  hitlReason?: 'UNKNOWN_GRADE' | 'ALTERNATIVE_CLAUSE' | 'MULTI_STANDARD_CONFLICT' | 'QUALITATIVE_AMBIGUITY' | 'MANUAL_REQUEST'; // 触发 HITL 挂起的原因
  // 双轨制判定模型 (Dual-Track Verdict: 系统客观计算与人工复核审批并行，互不抹除)
  systemVerdict?: 'PASS' | 'FAIL' | 'MANUAL_REVIEW';   // 系统客观算法判定结论
  systemVerdictSummary?: string;                       // 系统判定规则依据简述
  humanVerdict?: 'PASS' | 'REJECT' | 'WAIVED' | null;  // 质检工程师人工签认结论 (非必须，不覆盖系统结果)
  humanVerdictSummary?: string;                        // 人工审批批注或特批放行依据
  humanVerifiedAt?: string;                            // 人工签认时间戳 (ISO 8601)
  ocrConfidence: number;       // 综合 OCR 视觉解析置信度 (0~100)
  gradeMatchConfidence: number;// 材料牌号标准消歧匹配度 (0~100)
  
  // 模块 A: 化学成分
  chemical: ChemicalElementResult[];
  
  // 模块 B: 力学与物理性能
  mechanical: {
    tensile_rm: string;        // 抗拉强度实测与换算值
    yield_rp02: string;        // 屈服强度实测与换算值
    elongation_a: string;      // 断后伸长率
    hardness?: string;         // 硬度 (HRB/HBW)
    astFormulaNote?: string;   // AST 公式免检提示 (如涡流探伤免做水压)
  };
  
  // 模块 C: 工艺与定性条款 (解耦探伤支持)
  process: {
    flattening: 'PASS' | 'FAIL' | string;
    flaring?: 'PASS' | 'FAIL' | string;
    intergranularCorrosion: 'PASS' | 'FAIL' | string;
    ndt?: string;              // 兼容历史单一探伤汇总
    ndt_et?: string;           // 涡流检测实测结果 (Eddy Current Testing)
    ndt_ut?: string;           // 超声波检测实测结果 (Ultrasonic Testing)
    grainSize?: string;
    surfaceQuality?: string;
  };
  additionalTests?: AdditionalTestItem[]; // 弹性长尾扩展检验项
  surfaceQuality?: string;   // 表面质量检验结果描述
  
  // 归档存证字段
  reportNo: string;            // 质检报告号，如 "QA-20260826-0881"
  sha256Hash: string;          // 存证哈希
  inspector: string;           // 检验员 ID
}

export interface SessionDocument {
  docId: string;               // 文档 ID，如 "doc_8d566b29"
  md5?: string;                // 文件真实二进制内容 MD5 哈希指纹
  filename: string;            // 物理文件名，如 "Baosteel_S30408_Tube_MTC.pdf"
  fileSize: string;            // 文件大小，如 "1.2 MB"
  uploadTime: string;          // 上传时间
  ocrStatus: 'DONE' | 'PROCESSING' | 'PENDING';
  pageCount: number;           // 页数
  pages?: string[];            // 真实高清切图 / 页面 URL 列表 (如 [dataUrl1, dataUrl2, ...] 或 ["/samples/zpje/page-1.png", ...])
  samplePages?: string[];      // 兼容旧字段别名
  extractedText?: string;      // 客户端从 PDF 文本层分离抽取的纯文本内容
  isTextBased?: boolean;       // 是否包含可提取文本层
  batches: BatchSpecimen[];    // 文档内包含的各炉批号/试样
}

export interface InspectionSession {
  sessionId: string;           // 全局唯一 Session ID，如 "SESS-20260826-154530-9B4F2C8A"
  createdAt: string;           // 创建时间 ISO 字符串
  title: string;               // 会话描述 / 项目背景
  totalDocuments: number;
  totalBatches: number;
  passedBatches: number;
  failedBatches: number;
  hitlBatches: number;
  documents: SessionDocument[];
}

/**
 * 全局唯一工业级 Session ID 生成器
 * 采用：时间戳 (年月日-时分秒) + 8位高熵随机UUID，杜绝多用户毫秒级并发碰撞
 */
export function generateSessionId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const randomSuffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8).toUpperCase()
    : Math.random().toString(36).substring(2, 10).toUpperCase();
  return `SESS-${dateStr}-${timeStr}-${randomSuffix}`;
}

