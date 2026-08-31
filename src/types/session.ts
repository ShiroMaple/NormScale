/**
 * NormScale 质量证明书作业会话 (Inspection Session) 与两层树状数据模型
 * 
 * 层级关系：
 * Session (作业会话根节点，全局唯一 UUID)
 *   └─ SessionDocument (第 1 层：物理输入文档)
 *        └─ BatchSpecimen (第 2 层：各文档包含的炉批号/试样检验原子)
 */

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
  
  // 模块 C: 工艺与定性条款
  process: {
    flattening: 'PASS' | 'FAIL';
    flaring?: 'PASS' | 'FAIL';
    intergranularCorrosion: 'PASS' | 'FAIL';
    ndt: string;
    grainSize?: string;
  };
  
  // 归档存证字段
  reportNo: string;            // 质检报告号，如 "QA-20260826-0881"
  sha256Hash: string;          // 存证哈希
  inspector: string;           // 检验员 ID
}

export interface SessionDocument {
  docId: string;               // 文档 ID，如 "doc_01"
  filename: string;            // 物理文件名，如 "Baosteel_S30408_Tube_MTC.pdf"
  fileSize: string;            // 文件大小，如 "1.2 MB"
  uploadTime: string;          // 上传时间
  ocrStatus: 'DONE' | 'PROCESSING' | 'PENDING';
  pageCount: number;           // 页数
  samplePages?: string[];      // 真实高清切图 URL 列表 (如 ["/samples/zpje/page-1.png", ...])
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

/**
 * 默认初始化的预置两层树作业会话（包含 4 份文档，8 个真实工业炉批）
 */
export const DEFAULT_INSPECTION_SESSION: InspectionSession = {
  sessionId: 'SESS-20260826-143000-8F9C2E1A',
  createdAt: '2026-08-26 14:30:00',
  title: 'Area Optimization (26715-7053) · 镇海石化换热管集中入库合规检验',
  totalDocuments: 1,
  totalBatches: 3,
  passedBatches: 3,
  failedBatches: 0,
  hitlBatches: 0,
  documents: [
    {
      docId: 'doc_zpje_01',
      filename: 'ZPJE_S32168_HeatExchangeTube_MTC.pdf',
      fileSize: '650 KB',
      uploadTime: '2026-08-27 08:30',
      ocrStatus: 'DONE',
      pageCount: 3,
      samplePages: [
        '/samples/zpje/page-1.png',
        '/samples/zpje/page-2.png',
        '/samples/zpje/page-3.png',
      ],
      batches: [
        {
          batchNo: 'Z26022C-DB7',
          subBatchIndex: 1,
          certificateNo: '20260704203',
          constructionNo: '26715-7053',
          productName: '换热管 (Heat exchange tubes)',
          grade: 'S32168 (06Cr18Ni11Ti)',
          standard: 'NB/T 47019.5-2021、GB/T 13296-2023',
          supplier: '镇海石化建安工程股份有限公司制管厂',
          dimensions: 'OD 15.0mm × WT 0.8mm',
          heatNo: 'YX2602-2207',
          packNo: 'Z26022C',
          deliveryState: '光亮固溶 (Bright Solution Annealed)',
          verdict: 'PASS',
          verdictSummary: '全项符合 GB/T 13296 与 NB/T 47019.5 标准要求 (化学成分、晶间腐蚀、无损探伤全项合格)',
          ocrConfidence: 99,
          gradeMatchConfidence: 99,
          chemical: [
            { element: 'C', value: '0.018', confidence: '99%', status: 'ok' },
            { element: 'Si', value: '0.44', confidence: '98%', status: 'ok' },
            { element: 'Mn', value: '1.16', confidence: '98%', status: 'ok' },
            { element: 'P', value: '0.035', confidence: '96%', status: 'ok' },
            { element: 'S', value: '0.005', confidence: '99%', status: 'ok' },
            { element: 'Cr', value: '17.41', confidence: '99%', status: 'ok' },
            { element: 'Ni', value: '9.08', confidence: '99%', status: 'ok' },
            { element: 'Ti', value: '0.14', confidence: '74%', status: 'warn', note: '质保书公章部分遮挡该数值，置信度较低需人工核对' },
            { element: 'N', value: '<0.01', confidence: '95%', status: 'ok' },
          ],
          mechanical: {
            tensile_rm: '621、620 MPa (标准 ≥520)',
            yield_rp02: '268、267 MPa (标准 ≥205)',
            elongation_a: '57.5、61.5 % (标准 ≥40)',
            hardness: '139.3 HV1 (实测 143/145/137/132/140/139, 要求 ≤200)',
            astFormulaNote: '涡流探伤(ET)与超声探伤(UT)双探伤合格 → 依据 6.5 条款免做水压',
          },
          process: {
            flattening: 'PASS',
            flaring: 'PASS',
            intergranularCorrosion: 'PASS',
            ndt: '涡流检测 (ET) 与超声波检测 (UT) 均合格 OK',
            grainSize: '6.5 级 (GB/T 6394-2017)',
          },
          reportNo: 'QA-20260704-DB7',
          sha256Hash: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
          inspector: 'OP-ZPJE-01 (QA)',
        },
        {
          batchNo: 'Z26022C-DB8',
          subBatchIndex: 2,
          certificateNo: '20260704203',
          constructionNo: '26715-7053',
          productName: '换热管 (Heat exchange tubes)',
          grade: 'S32168 (06Cr18Ni11Ti)',
          standard: 'NB/T 47019.5-2021、GB/T 13296-2023',
          supplier: '镇海石化建安工程股份有限公司制管厂',
          dimensions: 'OD 15.0mm × WT 0.8mm',
          heatNo: 'YX2602-2207',
          packNo: 'Z26022C',
          deliveryState: '光亮固溶 (Bright Solution Annealed)',
          verdict: 'PASS',
          verdictSummary: '全项符合 GB/T 13296 标准要求',
          ocrConfidence: 98,
          gradeMatchConfidence: 99,
          chemical: [
            { element: 'C', value: '0.018', confidence: '99%', status: 'ok' },
            { element: 'Si', value: '0.44', confidence: '98%', status: 'ok' },
            { element: 'Mn', value: '1.16', confidence: '98%', status: 'ok' },
            { element: 'P', value: '0.035', confidence: '96%', status: 'ok' },
            { element: 'S', value: '0.005', confidence: '99%', status: 'ok' },
            { element: 'Cr', value: '17.41', confidence: '99%', status: 'ok' },
            { element: 'Ni', value: '9.08', confidence: '99%', status: 'ok' },
            { element: 'Ti', value: '0.14', confidence: '98%', status: 'ok' },
            { element: 'N', value: '<0.01', confidence: '95%', status: 'ok' },
          ],
          mechanical: {
            tensile_rm: '651、652 MPa (标准 ≥520)',
            yield_rp02: '297、289 MPa (标准 ≥205)',
            elongation_a: '54.0、50.5 % (标准 ≥40)',
            hardness: '147.3 HV1 (实测 149/143/150/144/154/144, 要求 ≤200)',
            astFormulaNote: '涡流探伤(ET)与超声探伤(UT)双探伤合格 → 依据 6.5 条款免做水压',
          },
          process: {
            flattening: 'PASS',
            flaring: 'PASS',
            intergranularCorrosion: 'PASS',
            ndt: '涡流检测 (ET) 与超声波检测 (UT) 均合格 OK',
            grainSize: '7.0 级 (GB/T 6394-2017)',
          },
          reportNo: 'QA-20260704-DB8',
          sha256Hash: '8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c',
          inspector: 'OP-ZPJE-01 (QA)',
        },
        {
          batchNo: 'Z26022C-E1',
          subBatchIndex: 3,
          certificateNo: '20260704203',
          constructionNo: '26715-7053',
          productName: '换热管 (Heat exchange tubes)',
          grade: 'S32168 (06Cr18Ni11Ti)',
          standard: 'NB/T 47019.5-2021、GB/T 13296-2023',
          supplier: '镇海石化建安工程股份有限公司制管厂',
          dimensions: 'OD 15.0mm × WT 0.8mm',
          heatNo: 'YX2602-2207',
          packNo: 'Z26022C',
          deliveryState: '光亮固溶 (Bright Solution Annealed)',
          verdict: 'PASS',
          verdictSummary: '全项符合 GB/T 13296 标准要求',
          ocrConfidence: 98,
          gradeMatchConfidence: 99,
          chemical: [
            { element: 'C', value: '0.018', confidence: '99%', status: 'ok' },
            { element: 'Si', value: '0.44', confidence: '98%', status: 'ok' },
            { element: 'Mn', value: '1.16', confidence: '98%', status: 'ok' },
            { element: 'P', value: '0.035', confidence: '96%', status: 'ok' },
            { element: 'S', value: '0.005', confidence: '99%', status: 'ok' },
            { element: 'Cr', value: '17.41', confidence: '99%', status: 'ok' },
            { element: 'Ni', value: '9.08', confidence: '99%', status: 'ok' },
            { element: 'Ti', value: '0.14', confidence: '98%', status: 'ok' },
            { element: 'N', value: '<0.01', confidence: '95%', status: 'ok' },
          ],
          mechanical: {
            tensile_rm: '675、669 MPa (标准 ≥520)',
            yield_rp02: '334、343 MPa (标准 ≥205)',
            elongation_a: '48.0、48.0 % (标准 ≥40)',
            hardness: '157.8 HV1 (实测 155/163/165/150/152/162, 要求 ≤200)',
            astFormulaNote: '涡流探伤(ET)与超声探伤(UT)双探伤合格 → 依据 6.5 条款免做水压',
          },
          process: {
            flattening: 'PASS',
            flaring: 'PASS',
            intergranularCorrosion: 'PASS',
            ndt: '涡流检测 (ET) 与超声波检测 (UT) 均合格 OK',
            grainSize: '7.0 级 (GB/T 6394-2017)',
          },
          reportNo: 'QA-20260704-E1',
          sha256Hash: '7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d',
          inspector: 'OP-ZPJE-01 (QA)',
        },
      ],
    },
  ],
};
