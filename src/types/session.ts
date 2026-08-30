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
  totalDocuments: 4,
  totalBatches: 12,
  passedBatches: 7,
  failedBatches: 1,
  hitlBatches: 4,
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
    {
      docId: 'doc_baosteel_01',
      filename: 'Baosteel_S30408_BoilerTube_MTC.pdf',
      fileSize: '1.2 MB',
      uploadTime: '2026-08-26 14:30',
      ocrStatus: 'DONE',
      pageCount: 3,
      batches: [
        {
          batchNo: 'HT-2026-0881',
          subBatchIndex: 1,
          certificateNo: 'MTC-2026-0881',
          constructionNo: '26XXX-0888',
          productName: '锅炉、热交换器用不锈钢无缝钢管',
          grade: '022Cr17Ni12Mo2 (S31603)',
          standard: 'GB/T 13296-2023',
          supplier: '宝武特种钢管实业有限公司',
          dimensions: 'OD 25.0mm × WT 2.0mm × L 6000mm',
          heatNo: 'HT-2026-0881',
          deliveryState: '固溶热处理 (Solution Treated)',
          verdict: 'PASS',
          verdictSummary: '全项符合 GB/T 13296-2023 锅炉管执行标准 (化学成分与力学全项合格)',
          ocrConfidence: 98,
          gradeMatchConfidence: 99,
          chemical: [
            { element: 'C', value: '0.025', confidence: '99%', status: 'ok' },
            { element: 'Si', value: '0.45', confidence: '98%', status: 'ok' },
            { element: 'Mn', value: '1.20', confidence: '97%', status: 'ok' },
            { element: 'P', value: '0.035', confidence: '82%', status: 'warn', note: '需人工核实' },
            { element: 'S', value: '0.008', confidence: '96%', status: 'ok' },
            { element: 'Ni', value: '10.20', confidence: '99%', status: 'ok' },
            { element: 'Cr', value: '16.80', confidence: '98%', status: 'ok' },
            { element: 'Mo', value: '2.05', confidence: '97%', status: 'ok' },
          ],
          mechanical: {
            tensile_rm: '58.5 kgf/mm² (573.68 MPa)',
            yield_rp02: '24.5 kgf/mm² (240.26 MPa)',
            elongation_a: '45.0 %',
            hardness: '85.0 HRB',
            astFormulaNote: '已完成涡流探伤(E3H)合格 → 依据 6.5.2 条款免做水压',
          },
          process: {
            flattening: 'PASS',
            intergranularCorrosion: 'PASS',
            ndt: '涡流探伤 (ET) 合格',
          },
          reportNo: 'QA-20260826-0881',
          sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          inspector: 'OP-9921 (QA)',
        },
        {
          batchNo: 'HT-2026-0882',
          subBatchIndex: 2,
          certificateNo: 'MTC-2026-0882',
          constructionNo: '26XXX-0888',
          productName: '锅炉、热交换器用不锈钢无缝钢管',
          grade: '022Cr17Ni12Mo2 (S31603)',
          standard: 'GB/T 13296-2023',
          supplier: '宝武特种钢管实业有限公司',
          dimensions: 'OD 32.0mm × WT 2.5mm × L 6000mm',
          heatNo: 'HT-2026-0882',
          deliveryState: '固溶热处理 (Solution Treated)',
          verdict: 'PASS',
          verdictSummary: '全项符合 GB/T 13296-2023 执行标准',
          ocrConfidence: 96,
          gradeMatchConfidence: 99,
          chemical: [
            { element: 'C', value: '0.022', confidence: '98%', status: 'ok' },
            { element: 'Si', value: '0.40', confidence: '97%', status: 'ok' },
            { element: 'Mn', value: '1.15', confidence: '99%', status: 'ok' },
            { element: 'P', value: '0.028', confidence: '95%', status: 'ok' },
            { element: 'S', value: '0.006', confidence: '96%', status: 'ok' },
            { element: 'Ni', value: '10.50', confidence: '98%', status: 'ok' },
            { element: 'Cr', value: '17.10', confidence: '97%', status: 'ok' },
            { element: 'Mo', value: '2.10', confidence: '99%', status: 'ok' },
          ],
          mechanical: {
            tensile_rm: '59.0 kgf/mm² (578.59 MPa)',
            yield_rp02: '25.0 kgf/mm² (245.17 MPa)',
            elongation_a: '44.0 %',
            hardness: '86.0 HRB',
            astFormulaNote: '已完成涡流探伤(E3H)合格 → 依据 6.5.2 条款免做水压',
          },
          process: {
            flattening: 'PASS',
            intergranularCorrosion: 'PASS',
            ndt: '超声探伤 (UT) 合格',
          },
          reportNo: 'QA-20260826-0882',
          sha256Hash: 'a7b8c91208fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b123',
          inspector: 'OP-9921 (QA)',
        },
      ],
    },
    {
      docId: 'doc_tisco_02',
      filename: 'Tisco_06Cr19Ni10_PressurePlate_MTC.pdf',
      fileSize: '3.4 MB',
      uploadTime: '2026-08-26 14:31',
      ocrStatus: 'DONE',
      pageCount: 2,
      batches: [
        {
          batchNo: 'TS-2026-9901',
          subBatchIndex: 1,
          certificateNo: 'MTC-TS-9901',
          constructionNo: '26XXX-0888',
          productName: '承压设备用奥氏体不锈钢无缝管',
          grade: '06Cr19Ni10 (S30408)',
          standard: 'GB/T 13296-2023',
          supplier: '太原钢铁不锈钢股份有限公司',
          dimensions: 'OD 50.0mm × WT 3.0mm × L 4000mm',
          heatNo: 'TS-2026-9901',
          deliveryState: '固溶酸洗 (Solution Annealed & Pickled)',
          verdict: 'FAIL',
          verdictSummary: '一票否决：缺失压扁试验与晶间腐蚀出厂强制检验报告',
          ocrConfidence: 94,
          gradeMatchConfidence: 98,
          chemical: [
            { element: 'C', value: '0.065', confidence: '98%', status: 'ok' },
            { element: 'Si', value: '0.50', confidence: '97%', status: 'ok' },
            { element: 'Mn', value: '1.40', confidence: '96%', status: 'ok' },
            { element: 'P', value: '0.030', confidence: '95%', status: 'ok' },
            { element: 'S', value: '0.010', confidence: '98%', status: 'ok' },
            { element: 'Ni', value: '8.20', confidence: '97%', status: 'ok' },
            { element: 'Cr', value: '18.30', confidence: '99%', status: 'ok' },
          ],
          mechanical: {
            tensile_rm: '52.0 kgf/mm² (509.95 MPa)',
            yield_rp02: '21.0 kgf/mm² (205.94 MPa)',
            elongation_a: '40.0 %',
            hardness: '82.0 HRB',
          },
          process: {
            flattening: 'FAIL',
            intergranularCorrosion: 'FAIL',
            ndt: '未检出',
          },
          reportNo: 'QA-REJECT-20260826-01',
          sha256Hash: 'f4e3d2c198fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b789',
          inspector: 'OP-9921 (QA)',
        },
        {
          batchNo: 'TS-2026-9902',
          subBatchIndex: 2,
          certificateNo: 'MTC-TS-9902',
          constructionNo: '26XXX-0888',
          productName: '承压设备用奥氏体不锈钢无缝管',
          grade: '06Cr19Ni10 (S30408)',
          standard: 'GB/T 13296-2023',
          supplier: '太原钢铁不锈钢股份有限公司',
          dimensions: 'OD 50.0mm × WT 3.0mm × L 4000mm',
          heatNo: 'TS-2026-9902',
          deliveryState: '固溶酸洗 (Solution Annealed & Pickled)',
          verdict: 'PASS',
          verdictSummary: '符合 GB/T 13296 执行标准',
          ocrConfidence: 97,
          gradeMatchConfidence: 99,
          chemical: [
            { element: 'C', value: '0.055', confidence: '99%', status: 'ok' },
            { element: 'Si', value: '0.45', confidence: '98%', status: 'ok' },
            { element: 'Mn', value: '1.30', confidence: '97%', status: 'ok' },
            { element: 'P', value: '0.025', confidence: '96%', status: 'ok' },
            { element: 'S', value: '0.008', confidence: '98%', status: 'ok' },
            { element: 'Ni', value: '8.50', confidence: '99%', status: 'ok' },
            { element: 'Cr', value: '18.50', confidence: '98%', status: 'ok' },
          ],
          mechanical: {
            tensile_rm: '54.0 kgf/mm² (529.56 MPa)',
            yield_rp02: '22.5 kgf/mm² (220.65 MPa)',
            elongation_a: '42.0 %',
            hardness: '84.0 HRB',
          },
          process: {
            flattening: 'PASS',
            intergranularCorrosion: 'PASS',
            ndt: '涡流探伤 (ET) 合格',
          },
          reportNo: 'QA-20260826-9902',
          sha256Hash: 'b6c5d4e398fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b456',
          inspector: 'OP-9921 (QA)',
        },
        {
          batchNo: 'TS-2026-9903',
          subBatchIndex: 3,
          certificateNo: 'MTC-TS-9903',
          constructionNo: '26XXX-0888',
          productName: '承压设备用奥氏体不锈钢无缝管',
          grade: 'SUS 304H-Special',
          standard: 'GB/T 13296-2023',
          supplier: '太原钢铁不锈钢股份有限公司',
          dimensions: 'OD 50.0mm × WT 3.0mm × L 4000mm',
          heatNo: 'TS-2026-9903',
          deliveryState: '固溶酸洗 (Solution Annealed & Pickled)',
          verdict: 'MANUAL_REVIEW',
          verdictSummary: 'HITL 待质检员裁决：材料牌号包含非标别名 (SUS 304H-Special)，无法直接加载标尺，需人工消歧指定标准钢级',
          systemVerdict: 'MANUAL_REVIEW',
          systemVerdictSummary: '牌号匹配置信度低于安全阈值 (68% < 80%)，触发人机协同规则阻断',
          hitlReason: 'UNKNOWN_GRADE',
          ocrConfidence: 96,
          gradeMatchConfidence: 68,
          chemical: [
            { element: 'C', value: '0.052', confidence: '98%', status: 'ok' },
            { element: 'Si', value: '0.50', confidence: '97%', status: 'ok' },
            { element: 'Mn', value: '1.20', confidence: '96%', status: 'ok' },
            { element: 'P', value: '0.026', confidence: '95%', status: 'ok' },
            { element: 'S', value: '0.002', confidence: '98%', status: 'ok' },
            { element: 'Ni', value: '8.45', confidence: '97%', status: 'ok' },
            { element: 'Cr', value: '18.25', confidence: '99%', status: 'ok' },
          ],
          mechanical: {
            tensile_rm: '570 MPa (待判定)',
            yield_rp02: '250 MPa (待判定)',
            elongation_a: '45.0 % (待判定)',
            hardness: '80.0 HRB',
            astFormulaNote: '涡流探伤与超声探伤合格，等待牌号消歧后计算',
          },
          process: {
            flattening: 'PASS',
            intergranularCorrosion: 'PASS',
            ndt: '涡流探伤 (ET) 与超声探伤 (UT) 双合格',
          },
          reportNo: 'QA-HITL-20260828-01',
          sha256Hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
          inspector: 'OP-9921 (QA)',
        },
        {
          batchNo: 'TS-2026-9904',
          subBatchIndex: 4,
          certificateNo: 'MTC-TS-9904',
          constructionNo: '26XXX-0888',
          productName: '锅炉及热交换器用奥氏体不锈钢管',
          grade: '06Cr19Ni10 (S30408)',
          standard: 'GB/T 13296-2023',
          supplier: '太原钢铁不锈钢股份有限公司',
          dimensions: 'OD 38.0mm × WT 2.5mm × L 6000mm',
          heatNo: 'TS-2026-9904',
          deliveryState: '固溶酸洗 (Solution Annealed & Pickled)',
          verdict: 'MANUAL_REVIEW',
          verdictSummary: 'HITL 待质检员确权：出具涡流探伤 (ET) 合格替代水压试验，需核实订货合同是否授权该替代条款',
          systemVerdict: 'MANUAL_REVIEW',
          systemVerdictSummary: '水压试验未出具独立实测试验值，报告声明依据合同技术协议替代，触发人机协同确权阻断',
          hitlReason: 'ALTERNATIVE_CLAUSE',
          ocrConfidence: 98,
          gradeMatchConfidence: 100,
          chemical: [
            { element: 'C', value: '0.045', confidence: '99%', status: 'ok' },
            { element: 'Si', value: '0.45', confidence: '98%', status: 'ok' },
            { element: 'Mn', value: '1.25', confidence: '97%', status: 'ok' },
            { element: 'P', value: '0.024', confidence: '96%', status: 'ok' },
            { element: 'S', value: '0.003', confidence: '98%', status: 'ok' },
            { element: 'Ni', value: '8.30', confidence: '99%', status: 'ok' },
            { element: 'Cr', value: '18.40', confidence: '99%', status: 'ok' },
          ],
          mechanical: {
            tensile_rm: '565 MPa',
            yield_rp02: '245 MPa',
            elongation_a: '44.0 %',
            hardness: '82.0 HRB',
            astFormulaNote: '涡流探伤已出具合格结论，等待合同替代条款确权',
          },
          process: {
            flattening: 'PASS',
            intergranularCorrosion: 'PASS',
            ndt: '涡流探伤合格 (GB/T 7735 E3H 级，待确权替代液压试验)',
          },
          reportNo: 'QA-HITL-20260828-02',
          sha256Hash: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
          inspector: 'OP-9921 (QA)',
        },
        {
          batchNo: 'TS-2026-9905',
          subBatchIndex: 5,
          certificateNo: 'MTC-TS-9905',
          constructionNo: '26XXX-0888',
          productName: '压力容器用特种超低碳不锈钢管',
          grade: '022Cr19Ni10 (S30403)',
          standard: 'GB/T 13296-2023、NB/T 47019.5-2021',
          supplier: '太原钢铁不锈钢股份有限公司',
          dimensions: 'OD 25.0mm × WT 2.0mm × L 6000mm',
          heatNo: 'TS-2026-9905',
          deliveryState: '固溶热处理 (Solution Annealed)',
          verdict: 'MANUAL_REVIEW',
          verdictSummary: 'HITL 待质检员裁定：同时执行国标与能标，两部标准对晶间腐蚀敏化制样要求互斥',
          systemVerdict: 'MANUAL_REVIEW',
          systemVerdictSummary: 'GB/T 13296 (供货态E法) 与 NB/T 47019.5 (敏化态E法) 条款互斥，需质检员指定主仲裁标尺',
          hitlReason: 'MULTI_STANDARD_CONFLICT',
          ocrConfidence: 97,
          gradeMatchConfidence: 100,
          chemical: [
            { element: 'C', value: '0.022', confidence: '99%', status: 'ok' },
            { element: 'Si', value: '0.40', confidence: '98%', status: 'ok' },
            { element: 'Mn', value: '1.15', confidence: '97%', status: 'ok' },
            { element: 'P', value: '0.025', confidence: '96%', status: 'ok' },
            { element: 'S', value: '0.002', confidence: '98%', status: 'ok' },
            { element: 'Ni', value: '9.20', confidence: '99%', status: 'ok' },
            { element: 'Cr', value: '18.60', confidence: '99%', status: 'ok' },
          ],
          mechanical: {
            tensile_rm: '550 MPa',
            yield_rp02: '235 MPa',
            elongation_a: '46.0 %',
            hardness: '79.0 HRB',
            astFormulaNote: '双标准引用：GB/T 13296 供货态 E 法合格，但未按 NB/T 47019.5 执行 650℃×2h 敏化处理',
          },
          process: {
            flattening: 'PASS',
            intergranularCorrosion: 'PASS',
            ndt: '水压试验合格 (12.5 MPa) & 涡流探伤合格',
          },
          reportNo: 'QA-HITL-20260828-03',
          sha256Hash: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
          inspector: 'OP-9921 (QA)',
        },
        {
          batchNo: 'TS-2026-9906',
          subBatchIndex: 6,
          certificateNo: 'MTC-TS-9906',
          constructionNo: '26XXX-0888',
          productName: '洁净流体管网用精密级不锈钢管',
          grade: '06Cr19Ni10 (S30408)',
          standard: 'GB/T 13296-2023',
          supplier: '太原钢铁不锈钢股份有限公司',
          dimensions: 'OD 19.0mm × WT 1.5mm × L 4500mm',
          heatNo: 'TS-2026-9906',
          deliveryState: '光亮退火 (Bright Annealed)',
          verdict: 'MANUAL_REVIEW',
          verdictSummary: 'HITL 待质检员裁定：金相显微组织定性文字描述存在语义模糊，需人工定性裁定符合性',
          systemVerdict: 'MANUAL_REVIEW',
          systemVerdictSummary: '金相组织报告记载“局部晶界可见微量细小析出”，NLP 置信度 71% 处于模糊临界区间',
          hitlReason: 'QUALITATIVE_AMBIGUITY',
          ocrConfidence: 96,
          gradeMatchConfidence: 100,
          chemical: [
            { element: 'C', value: '0.048', confidence: '98%', status: 'ok' },
            { element: 'Si', value: '0.42', confidence: '97%', status: 'ok' },
            { element: 'Mn', value: '1.18', confidence: '96%', status: 'ok' },
            { element: 'P', value: '0.028', confidence: '95%', status: 'ok' },
            { element: 'S', value: '0.004', confidence: '98%', status: 'ok' },
            { element: 'Ni', value: '8.35', confidence: '97%', status: 'ok' },
            { element: 'Cr', value: '18.15', confidence: '99%', status: 'ok' },
          ],
          mechanical: {
            tensile_rm: '575 MPa',
            yield_rp02: '255 MPa',
            elongation_a: '43.0 %',
            hardness: '83.0 HRB',
            astFormulaNote: '定性文字条款 NLP 判定模糊，等待金相显微形貌人工确认',
          },
          process: {
            grainSize: '晶粒度7.5级，局部晶界可见微量细小析出，未见网状裂纹',
            flattening: 'PASS',
            intergranularCorrosion: 'PASS',
            ndt: '水压试验合格 (10.0 MPa) & 超声探伤合格',
          },
          reportNo: 'QA-HITL-20260828-04',
          sha256Hash: 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
          inspector: 'OP-9921 (QA)',
        },
      ],
    },
    {
      docId: 'doc_wisco_03',
      filename: 'Wisco_Q345R_Custom_Specimen.pdf',
      fileSize: '800 KB',
      uploadTime: '2026-08-26 14:32',
      ocrStatus: 'DONE',
      pageCount: 1,
      batches: [
        {
          batchNo: 'WS-2026-0311',
          subBatchIndex: 1,
          certificateNo: 'MTC-WS-0311',
          constructionNo: '26XXX-0888',
          productName: '特种承压热交换不锈钢薄壁管',
          grade: '022Cr17Ni12Mo2 (S31603)',
          standard: 'GB/T 13296-2023',
          supplier: '武汉特种承压材料制造厂',
          dimensions: 'OD 19.0mm × WT 1.5mm × L 5000mm',
          heatNo: 'WS-2026-0311',
          deliveryState: '光亮退火 (Bright Annealed)',
          verdict: 'PASS',
          verdictSummary: '全项检验合格，壁厚 < 1.7mm 免做硬度检验',
          ocrConfidence: 99,
          gradeMatchConfidence: 100,
          chemical: [
            { element: 'C', value: '0.020', confidence: '99%', status: 'ok' },
            { element: 'Si', value: '0.40', confidence: '98%', status: 'ok' },
            { element: 'Mn', value: '1.10', confidence: '98%', status: 'ok' },
            { element: 'P', value: '0.022', confidence: '97%', status: 'ok' },
            { element: 'S', value: '0.005', confidence: '99%', status: 'ok' },
            { element: 'Ni', value: '10.80', confidence: '98%', status: 'ok' },
            { element: 'Cr', value: '17.30', confidence: '99%', status: 'ok' },
            { element: 'Mo', value: '2.20', confidence: '98%', status: 'ok' },
          ],
          mechanical: {
            tensile_rm: '60.0 kgf/mm² (588.40 MPa)',
            yield_rp02: '26.0 kgf/mm² (254.97 MPa)',
            elongation_a: '46.0 %',
          },
          process: {
            flattening: 'PASS',
            intergranularCorrosion: 'PASS',
            ndt: '超声探伤 (UT) 合格',
          },
          reportNo: 'QA-20260826-0311',
          sha256Hash: 'c8d7e6f598fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b321',
          inspector: 'OP-9921 (QA)',
        },
      ],
    },
  ],
};
