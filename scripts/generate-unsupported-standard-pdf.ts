/**
 * ============================================================================
 * NormScale 测试用例资产生成脚本：未收录执行标准 (Out-of-Scope Standard) 质保书
 * ============================================================================
 * 
 * 1. 业务目标与测试场景：
 *    - 测试目标：验证质保证书中声明的执行标准（Declared Standard）不在本项目
 *      当前已收录的标准库（data/standards：GB/T 13296-2023、NB/T 47019.5-2021）
 *      范围内时，系统的拦截诊断、防呆控制与工作流状态机表现。
 *    - 业务断言：
 *      a. 工作流在「节点 3：检索标准规则库 (retrieve-standard)」阶段精准识别并阻断；
 *      b. 状态置为 failed，输出明确诊断信息：
 *         "未收录标准 [ASTM A312 / A312M]，请检查标准代号或在标准库中补充配置"；
 *      c. 验证质检员通过强制指定系统已收录标准时具备安全恢复流转的能力。
 * 
 * 2. 模拟质保证书核心参数：
 *    - 声明执行标准：ASTM A312 / A312M (奥氏体不锈钢无缝/焊接钢管，外来美标典型代表)
 *    - 声明材质牌号：TP316L (UNS S31603)
 *    - 证书编号：MTC-2026-ASTM-A312-901
 *    - 规格尺寸：1" NPS Sch 10S (OD 33.40mm x WT 2.77mm x L 6000mm)
 *    - 包含熔炼化学成分、室温拉伸力学性能、工艺性能（压扁/扩口/水压）与无损检测（UT/ET/晶间腐蚀）
 * 
 * 3. 命令行执行方式：
 *    $ pnpm tsx scripts/generate-unsupported-standard-pdf.ts
 * 
 * 4. 编译产物输出路径：
 *    - public/samples/astm_a312_tp316l_unsupported_standard.pdf
 * 
 * 5. 配套自动化测试用例：
 *    $ pnpm vitest run tests/workflow/unsupported-standard.test.ts
 * 
 * 6. 技术实现特点：
 *    - 基于原生 PDF 1.4 规范与 Standard 14 Type 1 字体（Helvetica / Helvetica-Bold）；
 *    - 跨平台 WinAnsiEncoding 编码，零外部字体库依赖，绝对无乱码或丢失字形；
 *    - 采用 4 行自适应弹性栅格，严格控制文本边界与印章安全间距，保证工业级视觉质感。
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';

/**
 * 转义 PDF 字符串中的特殊字符
 */
function escapePdfString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export interface UnsupportedStandardMtcData {
  title: string;
  certNo: string;
  standard: string;
  grade: string;
  supplier: string;
  dimensions: string;
  heatNo: string;
  batchNo: string;
  deliveryCondition: string;
  issueDate: string;
  chemItems: Array<{ el: string; val: string }>;
  mechItems: Array<{ name: string; val: string; unit: string }>;
  processLines: string[];
}

/**
 * 构造符合 PDF 1.4 规范的工业矢量质保证书 (Mill Test Certificate)
 * 纯 Type 1 字体 (Helvetica, Helvetica-Bold) 与 WinAnsiEncoding 编码，
 * 绝无字库缺失风险，排版工整清晰。
 */
export function createUnsupportedStandardVectorPdf(sc: UnsupportedStandardMtcData): Buffer {
  const streamLines: string[] = [];

  // 1. 页面外边框与网格装饰 (A4: 595 x 842 pt)
  // 深灰工业外边框
  streamLines.push('0.15 0.20 0.28 RG 1.5 w 30 30 535 782 re S');
  // 内虚线美化边框
  streamLines.push('[3 2] 0 d 0.65 0.70 0.76 RG 0.75 w 35 35 525 772 re S [] 0 d');

  // 2. 证书标题栏区域 (Y: 745 ~ 800)
  // 浅蓝灰标题栏背景
  streamLines.push('0.93 0.95 0.98 rg 36 745 523 60 re f');
  streamLines.push('0.15 0.20 0.28 RG 1 w 36 745 m 559 745 l S');
  // 证书大标题 (Helvetica-Bold 15pt)
  streamLines.push('BT /F2 15 Tf 0.08 0.12 0.22 rg 105 782 Td (MILL TEST CERTIFICATE / QUALITY CERTIFICATE) Tj ET');
  // 英文与副标题
  streamLines.push(`BT /F2 10 Tf 0.20 0.28 0.40 rg 140 765 Td (INSPECTION CERTIFICATE EN 10204 3.1 - ${escapePdfString(sc.certNo)}) Tj ET`);
  streamLines.push('BT /F1 8 Tf 0.40 0.46 0.54 rg 170 750 Td (GLOBAL SPECIAL ALLOY PIPING INDUSTRIES CO., LTD.) Tj ET');

  // 3. 基本元数据表格 (4行自适应栅格, Y: 648 ~ 736, 高度 88pt)
  const metaTop = 736;
  const metaHeight = 88;
  const rowHeight = 22;

  // 浅灰背景与外框
  streamLines.push(`0.97 0.98 0.99 rg 45 ${metaTop - metaHeight} 505 ${metaHeight} re f`);
  streamLines.push(`0.75 0.80 0.85 RG 0.75 w 45 ${metaTop - metaHeight} 505 ${metaHeight} re S`);

  // 水平分割线
  streamLines.push(`45 ${metaTop - rowHeight} m 550 ${metaTop - rowHeight} l S`);
  streamLines.push(`45 ${metaTop - rowHeight * 2} m 550 ${metaTop - rowHeight * 2} l S`);
  streamLines.push(`45 ${metaTop - rowHeight * 3} m 550 ${metaTop - rowHeight * 3} l S`);

  // 垂直分割线
  // 第1行: 3列 (x=210, x=380)
  streamLines.push(`210 ${metaTop - rowHeight} m 210 ${metaTop} l S`);
  streamLines.push(`380 ${metaTop - rowHeight} m 380 ${metaTop} l S`);
  // 第2行: 3列 (x=210, x=380)
  streamLines.push(`210 ${metaTop - rowHeight * 2} m 210 ${metaTop - rowHeight} l S`);
  streamLines.push(`380 ${metaTop - rowHeight * 2} m 380 ${metaTop - rowHeight} l S`);
  // 第3行: 2列 (x=310)
  streamLines.push(`310 ${metaTop - rowHeight * 3} m 310 ${metaTop - rowHeight * 2} l S`);
  // 第4行: 2列 (x=360)
  streamLines.push(`360 ${metaTop - metaHeight} m 360 ${metaTop - rowHeight * 3} l S`);

  // --- 元数据文字排版 (严格计算边界与字号，绝无重叠) ---
  // 元数据第 1 行 (Y: 722) - 证书号 / 标准 / 牌号
  streamLines.push(`BT /F2 8 Tf 0.15 0.20 0.30 rg 50 722 Td (Cert No: ) Tj /F1 8 Tf 0.10 0.10 0.10 rg (${escapePdfString(sc.certNo)}) Tj ET`);
  streamLines.push(`BT /F2 8 Tf 0.15 0.20 0.30 rg 215 722 Td (Standard: ) Tj /F2 8 Tf 0.85 0.15 0.10 rg (${escapePdfString(sc.standard)}) Tj ET`);
  streamLines.push(`BT /F2 8 Tf 0.15 0.20 0.30 rg 385 722 Td (Grade: ) Tj /F2 8 Tf 0.10 0.35 0.85 rg (${escapePdfString(sc.grade)}) Tj ET`);

  // 元数据第 2 行 (Y: 700) - 炉号 / 批号 / 签发日期
  streamLines.push(`BT /F2 8 Tf 0.15 0.20 0.30 rg 50 700 Td (Heat No: ) Tj /F1 8 Tf 0.10 0.10 0.10 rg (${escapePdfString(sc.heatNo)}) Tj ET`);
  streamLines.push(`BT /F2 8 Tf 0.15 0.20 0.30 rg 215 700 Td (Lot / Batch: ) Tj /F1 8 Tf 0.10 0.10 0.10 rg (${escapePdfString(sc.batchNo)}) Tj ET`);
  streamLines.push(`BT /F2 8 Tf 0.15 0.20 0.30 rg 385 700 Td (Issue Date: ) Tj /F1 8 Tf 0.10 0.10 0.10 rg (${escapePdfString(sc.issueDate)}) Tj ET`);

  // 元数据第 3 行 (Y: 678) - 规格尺寸 / 交货状态
  streamLines.push(`BT /F2 7.5 Tf 0.15 0.20 0.30 rg 50 678 Td (Dimensions: ) Tj /F1 7.5 Tf 0.10 0.10 0.10 rg (${escapePdfString(sc.dimensions)}) Tj ET`);
  streamLines.push(`BT /F2 7.5 Tf 0.15 0.20 0.30 rg 315 678 Td (Delivery Condition: ) Tj /F1 7.5 Tf 0.10 0.10 0.10 rg (${escapePdfString(sc.deliveryCondition)}) Tj ET`);

  // 元数据第 4 行 (Y: 656) - 制造厂家 / 检验规范
  streamLines.push(`BT /F2 7.5 Tf 0.15 0.20 0.30 rg 50 656 Td (Manufacturer: ) Tj /F1 7.5 Tf 0.10 0.10 0.10 rg (${escapePdfString(sc.supplier)}) Tj ET`);
  streamLines.push(`BT /F2 7.5 Tf 0.15 0.20 0.30 rg 365 656 Td (Inspection Spec: ) Tj /F1 7.5 Tf 0.10 0.10 0.10 rg (EN 10204 3.1 Certified) Tj ET`);

  // 4. 一、化学成分表 (Y: 575 ~ 635)
  const chemSectionTop = 635;
  streamLines.push(`BT /F2 9 Tf 0.08 0.12 0.22 rg 45 ${chemSectionTop} Td (1. CHEMICAL COMPOSITION (Heat Analysis, %):) Tj ET`);
  const chemTableTop = chemSectionTop - 6;
  const chemTableHeight = 42;
  streamLines.push(`0.75 0.80 0.85 RG 0.75 w 45 ${chemTableTop - chemTableHeight} 505 ${chemTableHeight} re S`);
  streamLines.push(`0.93 0.95 0.98 rg 45 ${chemTableTop - 19} 505 19 re f`);
  streamLines.push(`45 ${chemTableTop - 19} m 550 ${chemTableTop - 19} l S`);

  const chemColWidth = 505 / sc.chemItems.length;
  sc.chemItems.forEach((c, idx) => {
    const colX = 45 + idx * chemColWidth;
    if (idx > 0) {
      streamLines.push(`${colX} ${chemTableTop - chemTableHeight} m ${colX} ${chemTableTop} l S`);
    }
    const textX = colX + chemColWidth / 2 - 5;
    streamLines.push(`BT /F2 8 Tf 0.20 0.25 0.35 rg ${textX} ${chemTableTop - 13} Td (${escapePdfString(c.el)}) Tj ET`);
    streamLines.push(`BT /F1 8 Tf 0.05 0.10 0.20 rg ${colX + 7} ${chemTableTop - 32} Td (${escapePdfString(c.val)}) Tj ET`);
  });

  // 5. 二、力学性能表 (Y: 495 ~ 560)
  const mechSectionTop = 562;
  streamLines.push(`BT /F2 9 Tf 0.08 0.12 0.22 rg 45 ${mechSectionTop} Td (2. MECHANICAL PROPERTIES & TENSILE TEST (Room Temp):) Tj ET`);
  const mechTableTop = mechSectionTop - 6;
  const mechTableHeight = 44;
  streamLines.push(`0.75 0.80 0.85 RG 0.75 w 45 ${mechTableTop - mechTableHeight} 505 ${mechTableHeight} re S`);
  streamLines.push(`0.93 0.95 0.98 rg 45 ${mechTableTop - 20} 505 20 re f`);
  streamLines.push(`45 ${mechTableTop - 20} m 550 ${mechTableTop - 20} l S`);

  const mechColWidth = 505 / sc.mechItems.length;
  sc.mechItems.forEach((m, idx) => {
    const colX = 45 + idx * mechColWidth;
    if (idx > 0) {
      streamLines.push(`${colX} ${mechTableTop - mechTableHeight} m ${colX} ${mechTableTop} l S`);
    }
    streamLines.push(`BT /F2 7.5 Tf 0.20 0.25 0.35 rg ${colX + 6} ${mechTableTop - 14} Td (${escapePdfString(m.name)}) Tj ET`);
    streamLines.push(`BT /F1 8 Tf 0.05 0.10 0.20 rg ${colX + 8} ${mechTableTop - 34} Td (${escapePdfString(`${m.val} ${m.unit}`)}) Tj ET`);
  });

  // 6. 三、工艺性能与无损探伤检验结论 (Y: 360 ~ 485)
  const procSectionTop = 485;
  streamLines.push(`BT /F2 9 Tf 0.08 0.12 0.22 rg 45 ${procSectionTop} Td (3. TECHNOLOGICAL & NON-DESTRUCTIVE INSPECTION RESULTS:) Tj ET`);
  const procTableTop = procSectionTop - 6;
  const procTableHeight = 105;
  streamLines.push(`0.75 0.80 0.85 RG 0.75 w 45 ${procTableTop - procTableHeight} 505 ${procTableHeight} re S`);
  streamLines.push(`0.98 0.98 0.99 rg 45 ${procTableTop - procTableHeight} 505 ${procTableHeight} re f`);

  // 逐行打印工艺与无损项目
  let procY = procTableTop - 15;
  for (const pLine of sc.processLines) {
    streamLines.push(`BT /F1 7.5 Tf 0.15 0.20 0.28 rg 55 ${procY} Td (${escapePdfString(pLine)}) Tj ET`);
    procY -= 14.5;
  }

  // 7. 四、综合质检评定结论与签署盖章 (Y: 245 ~ 345)
  const verdictTop = 345;
  const verdictHeight = 85;
  streamLines.push(`0.96 0.97 0.98 rg 45 ${verdictTop - verdictHeight} 505 ${verdictHeight} re f`);
  streamLines.push(`0.75 0.80 0.85 RG 0.75 w 45 ${verdictTop - verdictHeight} 505 ${verdictHeight} re S`);
  streamLines.push(`BT /F2 9 Tf 0.08 0.12 0.22 rg 55 ${verdictTop - 16} Td (4. QUALITY INSPECTION VERDICT & RELEASE:) Tj ET`);
  streamLines.push(`BT /F1 7.5 Tf 0.25 0.30 0.38 rg 55 ${verdictTop - 32} Td (We hereby certify that the material described above has been manufactured and tested in accordance) Tj ET`);
  streamLines.push(`BT /F1 7.5 Tf 0.25 0.30 0.38 rg 55 ${verdictTop - 44} Td (with the technical requirements of ASTM A312 / A312M standard and purchase contract specifications.) Tj ET`);

  // 质检责任人信息（严格控制在左侧 x<=380，与 x=440 处的印章留出 60pt 安全间距）
  streamLines.push(`BT /F2 7.5 Tf 0.15 0.20 0.30 rg 55 ${verdictTop - 62} Td (Certified Inspector: ) Tj /F1 7.5 Tf 0.1 0.1 0.1 rg (David Miller      ) Tj /F2 7.5 Tf 0.15 0.20 0.30 rg (Supervisor: ) Tj /F1 7.5 Tf 0.1 0.1 0.1 rg (Michael Schmidt) Tj ET`);
  streamLines.push(`BT /F2 7.5 Tf 0.35 0.40 0.45 rg 55 ${verdictTop - 75} Td (Verification Stamp ID: ASTM-QC-2026-VAL      Release Status: COMPLIANT) Tj ET`);

  // 红色模拟质检合格印章 (放在右侧独立区域，x=440 ~ 535)
  streamLines.push('0.85 0.15 0.15 RG 1.5 w 440 270 95 46 re S');
  streamLines.push('BT /F2 9 Tf 0.85 0.15 0.15 rg 455 298 Td (QA ACCEPTED) Tj ET');
  streamLines.push('BT /F2 7 Tf 0.85 0.15 0.15 rg 450 282 Td (MILL TEST PASSED) Tj ET');

  const streamContent = streamLines.join('\n');
  const streamLength = Buffer.byteLength(streamContent, 'utf8');

  // 构造标准 PDF 1.4 对象树
  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj'
  );
  // Standard 14 Helvetica
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj');
  // Standard 14 Helvetica-Bold
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj');
  // Content stream
  objects.push(`6 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj`);

  const header = '%PDF-1.4\n';
  const offsets: number[] = [];
  let currentOffset = Buffer.byteLength(header, 'utf8');

  let body = '';
  for (const obj of objects) {
    offsets.push(currentOffset);
    body += obj + '\n';
    currentOffset += Buffer.byteLength(obj + '\n', 'utf8');
  }

  const startXref = currentOffset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += String(off).padStart(10, '0') + ' 00000 n \n';
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, 'utf8');
}

/**
 * 默认未收录标准测试质保书数据集: ASTM A312 / A312M (TP316L)
 */
export const ASTM_A312_TEST_DATA: UnsupportedStandardMtcData = {
  title: 'SEAMLESS & WELDED AUSTENITIC STAINLESS STEEL PIPE INSPECTION CERTIFICATE',
  certNo: 'MTC-2026-ASTM-A312-901',
  standard: 'ASTM A312 / A312M',
  grade: 'TP316L (UNS S31603)',
  supplier: 'Global Special Alloy Piping Industries Co., Ltd.',
  dimensions: '1" NPS Sch 10S (OD 33.40mm x WT 2.77mm x L 6000mm)',
  heatNo: 'H-ASTM-2688',
  batchNo: 'LOT-2026-09A',
  deliveryCondition: 'Solution Annealed (1080 deg C Water Quenched)',
  issueDate: '2026-09-08',
  chemItems: [
    { el: 'C', val: '0.022' },
    { el: 'Si', val: '0.45' },
    { el: 'Mn', val: '1.38' },
    { el: 'P', val: '0.028' },
    { el: 'S', val: '0.003' },
    { el: 'Cr', val: '17.35' },
    { el: 'Ni', val: '12.18' },
    { el: 'Mo', val: '2.12' },
    { el: 'N', val: '0.048' },
  ],
  mechItems: [
    { name: 'Tensile Strength Rm', val: '565', unit: 'MPa' },
    { name: 'Yield Strength Rp0.2', val: '252', unit: 'MPa' },
    { name: 'Elongation A (50mm)', val: '46.0', unit: '%' },
    { name: 'Hardness HRB', val: '81', unit: 'HRB' },
  ],
  processLines: [
    'Flattening Test (ASTM A312 / A999 Section 18): PASS OK - No cracks, breaks or lamination',
    'Flaring Test (ASTM A312 / A999 Section 19): PASS OK - 20% flaring rate without cracking',
    'Hydrostatic Pressure Test (ASTM A999 Section 20): PASS OK - 21.5 MPa held for 10s, No leakage',
    'Ultrasonic Inspection UT (ASTM E213 / Class U2): PASS OK - Fully compliant without defects',
    'Eddy Current Testing ET (ASTM E426 / Level 1): PASS OK - Acceptance Level 1 passed',
    'Intergranular Corrosion Test (ASTM A262 Practice E): PASS OK - Sound & no intergranular attack',
    'Surface Quality & Visual Inspection: PASS OK - Free from injurious defects, pickling clean',
  ],
};

/**
 * 主执行函数：编译生成 PDF 并写入 public/samples/
 */
export function generateUnsupportedStandardPdf(targetPath?: string): string {
  const outputPath = targetPath || path.resolve(process.cwd(), 'public/samples/astm_a312_tp316l_unsupported_standard.pdf');
  const targetDir = path.dirname(outputPath);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const pdfBuffer = createUnsupportedStandardVectorPdf(ASTM_A312_TEST_DATA);
  fs.writeFileSync(outputPath, pdfBuffer);

  console.log(`[OK] Successfully generated unsupported standard test MTC: ${outputPath} (${pdfBuffer.length} bytes)`);
  return outputPath;
}

// 当通过命令行直接执行时
if (process.argv[1] && (process.argv[1].endsWith('generate-unsupported-standard-pdf.ts') || process.argv[1].endsWith('generate-unsupported-standard-pdf.js'))) {
  generateUnsupportedStandardPdf();
}
