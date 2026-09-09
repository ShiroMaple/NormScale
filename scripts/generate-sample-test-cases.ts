import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { BatchSpecimen, SessionDocument } from '../src/types/session.ts';
import type { FieldBBox } from '../src/types/bbox.ts';
import type { CachedParseResult } from '../src/repository/parse-cache-store.ts';

/**
 * 转义 PDF 字符串中的特殊字符
 */
function escapePdfString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * 构造符合 PDF 1.4 规范的工业矢量质保证书 (Mill Test Certificate)
 * 采用 Standard 14 Type 1 Fonts (Helvetica, Helvetica-Bold) 与 WinAnsiEncoding 编码，
 * 绝无平台缺失字库风险，绝无方块豆腐块 (Missing Glyph ☒)，排版工整清晰。
 */
function createMinimalVectorPdf(sc: {
  title: string;
  certNo: string;
  standard: string;
  grade: string;
  supplier: string;
  dimensions: string;
  heatNo: string;
  batchNo: string;
  chemItems: Array<{ el: string; val: string }>;
  mechItems: Array<{ name: string; val: string; unit: string }>;
  processLines: string[];
  specialItem?: { name: string; val: string; unit?: string };
}): Buffer {
  const streamLines: string[] = [];

  // 1. 页面边框与几何衬底 (A4: 595 x 842 pt)
  // 深灰工业外边框
  streamLines.push('0.15 0.20 0.28 RG 1.5 w 30 30 535 782 re S');
  // 内虚线美化边框
  streamLines.push('[3 2] 0 d 0.65 0.70 0.76 RG 0.75 w 35 35 525 772 re S [] 0 d');

  // 2. 证书标题与生产商徽章区域 (Y: 745 ~ 800)
  // 浅蓝灰标题栏背景
  streamLines.push('0.93 0.95 0.98 rg 36 745 523 60 re f');
  streamLines.push('0.15 0.20 0.28 RG 1 w 36 745 m 559 745 l S');
  // 证书大标题 (Helvetica-Bold 15pt)
  streamLines.push('BT /F2 15 Tf 0.08 0.12 0.22 rg 105 782 Td (MILL TEST CERTIFICATE / QUALITY CERTIFICATE) Tj ET');
  // 英文与副标题
  streamLines.push(`BT /F2 10 Tf 0.20 0.28 0.40 rg 140 765 Td (INSPECTION CERTIFICATE EN 10204 3.1 - ${escapePdfString(sc.certNo)}) Tj ET`);
  streamLines.push('BT /F1 8 Tf 0.40 0.46 0.54 rg 170 750 Td (SPECIAL HIGH-PRESSURE ALLOY & STAINLESS STEEL PIPING CORP.) Tj ET');

  // 3. 元数据信息表格 (Y: 665 ~ 735)
  streamLines.push('0.96 0.97 0.98 rg 45 665 505 70 re f');
  streamLines.push('0.80 0.84 0.88 RG 0.75 w 45 665 505 70 re S');
  streamLines.push('45 718 m 550 718 l 45 695 m 550 695 l S');
  streamLines.push('210 665 m 210 735 l 380 665 m 380 735 l S');

  // 元数据第 1 行 (Y: 723)
  streamLines.push(`BT /F2 8.5 Tf 0.10 0.15 0.25 rg 50 723 Td (Certificate No: ) Tj /F1 8.5 Tf 0.15 0.15 0.15 rg (${escapePdfString(sc.certNo)}) Tj ET`);
  streamLines.push(`BT /F2 8.5 Tf 0.10 0.15 0.25 rg 215 723 Td (Declared Standard: ) Tj /F1 8.5 Tf 0.15 0.15 0.15 rg (${escapePdfString(sc.standard)}) Tj ET`);
  streamLines.push(`BT /F2 8.5 Tf 0.10 0.15 0.25 rg 385 723 Td (Declared Grade: ) Tj /F2 8.5 Tf 0.15 0.38 0.92 rg (${escapePdfString(sc.grade)}) Tj ET`);

  // 元数据第 2 行 (Y: 703)
  streamLines.push(`BT /F2 8.5 Tf 0.10 0.15 0.25 rg 50 703 Td (Supplier: ) Tj /F1 8.5 Tf 0.15 0.15 0.15 rg (${escapePdfString(sc.supplier)}) Tj ET`);
  streamLines.push(`BT /F2 8.5 Tf 0.10 0.15 0.25 rg 215 703 Td (Dimensions: ) Tj /F1 8.5 Tf 0.15 0.15 0.15 rg (${escapePdfString(sc.dimensions)}) Tj ET`);
  streamLines.push(`BT /F2 8.5 Tf 0.10 0.15 0.25 rg 385 703 Td (Heat No: ) Tj /F1 8.5 Tf 0.15 0.15 0.15 rg (${escapePdfString(sc.heatNo)}) Tj ET`);

  // 元数据第 3 行 (Y: 673)
  streamLines.push(`BT /F2 8.5 Tf 0.10 0.15 0.25 rg 50 673 Td (Batch / Lot No: ) Tj /F1 8.5 Tf 0.15 0.15 0.15 rg (${escapePdfString(sc.batchNo)}) Tj ET`);
  streamLines.push('BT /F2 8.5 Tf 0.10 0.15 0.25 rg 215 673 Td (Delivery Condition: ) Tj /F1 8.5 Tf 0.15 0.15 0.15 rg (Solution Annealed & Pickled) Tj ET');
  streamLines.push('BT /F2 8.5 Tf 0.10 0.15 0.25 rg 385 673 Td (Issue Date: ) Tj /F1 8.5 Tf 0.15 0.15 0.15 rg (2026-09-07) Tj ET');

  // 4. 一、化学成分表 (Y: 590 ~ 650)
  streamLines.push('BT /F2 9.5 Tf 0.08 0.12 0.22 rg 45 652 Td (1. CHEMICAL COMPOSITION (Heat Analysis, %):) Tj ET');
  const chemTableTop = 645;
  const chemTableHeight = 44;
  streamLines.push(`0.80 0.84 0.88 RG 0.75 w 45 ${chemTableTop - chemTableHeight} 505 ${chemTableHeight} re S`);
  streamLines.push(`0.93 0.95 0.98 rg 45 ${chemTableTop - 20} 505 20 re f`);
  streamLines.push(`45 ${chemTableTop - 20} m 550 ${chemTableTop - 20} l S`);

  const chemColWidth = 505 / sc.chemItems.length;
  sc.chemItems.forEach((c, idx) => {
    const colX = 45 + idx * chemColWidth;
    if (idx > 0) {
      streamLines.push(`${colX} ${chemTableTop - chemTableHeight} m ${colX} ${chemTableTop} l S`);
    }
    const textX = colX + chemColWidth / 2 - 6;
    streamLines.push(`BT /F2 8 Tf 0.20 0.25 0.35 rg ${textX} ${chemTableTop - 14} Td (${escapePdfString(c.el)}) Tj ET`);
    streamLines.push(`BT /F1 8 Tf 0.05 0.10 0.20 rg ${colX + 5} ${chemTableTop - 34} Td (${escapePdfString(c.val)}) Tj ET`);
  });

  // 5. 二、力学性能表 (Y: 505 ~ 575)
  const mechSectionTop = 575;
  streamLines.push(`BT /F2 9.5 Tf 0.08 0.12 0.22 rg 45 ${mechSectionTop} Td (2. MECHANICAL PROPERTIES & TENSILE TEST (Room Temp):) Tj ET`);
  const mechTableTop = mechSectionTop - 7;
  const mechTableHeight = 46;
  streamLines.push(`0.80 0.84 0.88 RG 0.75 w 45 ${mechTableTop - mechTableHeight} 505 ${mechTableHeight} re S`);
  streamLines.push(`0.93 0.95 0.98 rg 45 ${mechTableTop - 22} 505 22 re f`);
  streamLines.push(`45 ${mechTableTop - 22} m 550 ${mechTableTop - 22} l S`);

  const mechTotalCols = sc.mechItems.length + (sc.specialItem ? 1 : 0);
  const mechColWidth = 505 / mechTotalCols;
  sc.mechItems.forEach((m, idx) => {
    const colX = 45 + idx * mechColWidth;
    if (idx > 0) {
      streamLines.push(`${colX} ${mechTableTop - mechTableHeight} m ${colX} ${mechTableTop} l S`);
    }
    streamLines.push(`BT /F2 7.5 Tf 0.20 0.25 0.35 rg ${colX + 6} ${mechTableTop - 15} Td (${escapePdfString(m.name)}) Tj ET`);
    streamLines.push(`BT /F1 8.5 Tf 0.05 0.10 0.20 rg ${colX + 8} ${mechTableTop - 36} Td (${escapePdfString(`${m.val} ${m.unit}`)}) Tj ET`);
  });

  if (sc.specialItem) {
    const colX = 45 + sc.mechItems.length * mechColWidth;
    streamLines.push(`${colX} ${mechTableTop - mechTableHeight} m ${colX} ${mechTableTop} l S`);
    streamLines.push(`0.98 0.95 0.88 rg ${colX} ${mechTableTop - mechTableHeight} ${mechColWidth} ${mechTableHeight} re f`);
    streamLines.push(`BT /F2 7.5 Tf 0.65 0.35 0.05 rg ${colX + 6} ${mechTableTop - 15} Td (${escapePdfString(sc.specialItem.name)}) Tj ET`);
    streamLines.push(`BT /F2 8.5 Tf 0.55 0.25 0.05 rg ${colX + 8} ${mechTableTop - 36} Td (${escapePdfString(`${sc.specialItem.val} ${sc.specialItem.unit || ''}`)}) Tj ET`);
  }

  // 6. 三、工艺性能与无损探伤检验结论 (Y: 385 ~ 495)
  const procSectionTop = 495;
  streamLines.push(`BT /F2 9.5 Tf 0.08 0.12 0.22 rg 45 ${procSectionTop} Td (3. TECHNOLOGICAL & NON-DESTRUCTIVE INSPECTION RESULTS:) Tj ET`);
  const procTableTop = procSectionTop - 7;
  const procTableHeight = 104;
  streamLines.push(`0.80 0.84 0.88 RG 0.75 w 45 ${procTableTop - procTableHeight} 505 ${procTableHeight} re S`);
  streamLines.push(`0.98 0.98 0.99 rg 45 ${procTableTop - procTableHeight} 505 ${procTableHeight} re f`);

  // 逐行打印工艺与无损项目
  let procY = procTableTop - 15;
  for (const pLine of sc.processLines) {
    streamLines.push(`BT /F1 8 Tf 0.15 0.20 0.28 rg 55 ${procY} Td (${escapePdfString(pLine)}) Tj ET`);
    procY -= 13.5;
  }

  // 7. 四、综合质检评定结论与签署盖章 (Y: 260 ~ 365)
  const verdictTop = 368;
  streamLines.push(`0.96 0.97 0.98 rg 45 ${verdictTop - 75} 505 75 re f`);
  streamLines.push(`0.80 0.84 0.88 RG 0.75 w 45 ${verdictTop - 75} 505 75 re S`);
  streamLines.push(`BT /F2 9.5 Tf 0.08 0.12 0.22 rg 55 ${verdictTop - 18} Td (4. QUALITY INSPECTION VERDICT & RELEASE:) Tj ET`);
  streamLines.push(`BT /F1 8 Tf 0.25 0.30 0.38 rg 55 ${verdictTop - 34} Td (We hereby certify that the material described above has been manufactured and tested in accordance) Tj ET`);
  streamLines.push(`BT /F1 8 Tf 0.25 0.30 0.38 rg 55 ${verdictTop - 46} Td (with the technical requirements of the declared standard and purchase contract specifications.) Tj ET`);
  streamLines.push(`BT /F2 8.5 Tf 0.10 0.15 0.25 rg 55 ${verdictTop - 64} Td (Certified Inspector: Zhang Jianhua       Quality Supervisor: Li Zhenguo       Code: NS-VALID-2026) Tj ET`);

  // 红色模拟质检合格印章
  streamLines.push('0.85 0.15 0.15 RG 1.5 w 440 300 90 44 re S');
  streamLines.push('BT /F2 9 Tf 0.85 0.15 0.15 rg 453 329 Td (QA ACCEPTED) Tj ET');
  streamLines.push('BT /F2 7 Tf 0.85 0.15 0.15 rg 450 312 Td (MILL TEST PASSED) Tj ET');

  const streamContent = streamLines.join('\n');
  const streamLength = Buffer.byteLength(streamContent, 'utf8');

  // 构造规范标准 PDF 1.4 对象树
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
 * 辅助函数：构造高保真中英文 SVG 质保证书矢量渲染图 (供前端原位高保真展示)
 */
function createCertificateSvg(params: {
  title: string;
  certNo: string;
  standard: string;
  grade: string;
  supplier: string;
  dimensions: string;
  heatNo: string;
  batchNo: string;
  chemItems: Array<{ el: string; val: string }>;
  mechItems: Array<{ name: string; val: string; unit: string }>;
  processLines: string[];
  specialItem?: { name: string; val: string; unit?: string };
}): string {
  const { title, certNo, standard, grade, supplier, dimensions, heatNo, batchNo, chemItems, mechItems, processLines, specialItem } = params;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1130" width="800" height="1130" style="background:#ffffff; font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Segoe UI',sans-serif;">
  <rect x="20" y="20" width="760" height="1090" fill="#ffffff" stroke="#1e293b" stroke-width="2" rx="4"/>
  <rect x="28" y="28" width="744" height="1074" fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,2"/>
  
  <!-- 标题与抬头 -->
  <text x="400" y="70" text-anchor="middle" font-size="20" font-weight="900" fill="#0f172a" letter-spacing="2">产品质量证明书 / MILL TEST CERTIFICATE</text>
  <text x="400" y="96" text-anchor="middle" font-size="13" font-weight="bold" fill="#334155">${escapeXml(title)}</text>
  <line x1="40" y1="110" x2="760" y2="110" stroke="#0f172a" stroke-width="1.5"/>

  <!-- 基本元数据网格 -->
  <g font-size="11" fill="#334155">
    <text x="50" y="135"><tspan font-weight="bold" fill="#0f172a">质保书编号：</tspan>${escapeXml(certNo)}</text>
    <text x="320" y="135"><tspan font-weight="bold" fill="#0f172a">执行标准：</tspan>${escapeXml(standard)}</text>
    <text x="580" y="135"><tspan font-weight="bold" fill="#0f172a">材料牌号：</tspan><tspan fill="#2563eb" font-weight="bold">${escapeXml(grade)}</tspan></text>

    <text x="50" y="160"><tspan font-weight="bold" fill="#0f172a">供货厂家：</tspan>${escapeXml(supplier)}</text>
    <text x="320" y="160"><tspan font-weight="bold" fill="#0f172a">产品规格：</tspan>${escapeXml(dimensions)}</text>
    <text x="580" y="160"><tspan font-weight="bold" fill="#0f172a">冶炼炉号：</tspan>${escapeXml(heatNo)}</text>

    <text x="50" y="185"><tspan font-weight="bold" fill="#0f172a">检验批号：</tspan>${escapeXml(batchNo)}</text>
    <text x="320" y="185"><tspan font-weight="bold" fill="#0f172a">交货状态：</tspan>固溶酸洗 (Solution Annealed)</text>
    <text x="580" y="185"><tspan font-weight="bold" fill="#0f172a">签发日期：</tspan>2026-09-07</text>
  </g>

  <!-- 表格 A: 化学成分 -->
  <rect x="40" y="210" width="720" height="24" fill="#f1f5f9" stroke="#cbd5e1"/>
  <text x="50" y="226" font-size="11" font-weight="bold" fill="#1e293b">一、熔炼化学成分 (Chemical Composition, %)</text>
  
  <rect x="40" y="234" width="720" height="48" fill="#ffffff" stroke="#cbd5e1"/>
  ${chemItems.map((item, i) => {
    const colWidth = 720 / chemItems.length;
    const x = 40 + i * colWidth;
    return `
      <line x1="${x}" y1="234" x2="${x}" y2="282" stroke="#e2e8f0"/>
      <rect x="${x}" y="234" width="${colWidth}" height="22" fill="#f8fafc"/>
      <text x="${x + colWidth / 2}" y="249" text-anchor="middle" font-size="10" font-weight="bold" fill="#475569">${item.el}</text>
      <text x="${x + colWidth / 2}" y="271" text-anchor="middle" font-size="11" font-weight="bold" fill="#0f172a">${item.val}</text>
    `;
  }).join('')}

  <!-- 表格 B: 力学与工艺性能 -->
  <rect x="40" y="300" width="720" height="24" fill="#f1f5f9" stroke="#cbd5e1"/>
  <text x="50" y="316" font-size="11" font-weight="bold" fill="#1e293b">二、力学及工艺性能检验 (Mechanical &amp; Process Properties)</text>
  
  <rect x="40" y="324" width="720" height="60" fill="#ffffff" stroke="#cbd5e1"/>
  ${mechItems.map((item, i) => {
    const colWidth = 720 / (mechItems.length + (specialItem ? 1 : 0));
    const x = 40 + i * colWidth;
    return `
      <line x1="${x}" y1="324" x2="${x}" y2="384" stroke="#e2e8f0"/>
      <rect x="${x}" y="324" width="${colWidth}" height="28" fill="#f8fafc"/>
      <text x="${x + colWidth / 2}" y="342" text-anchor="middle" font-size="10" font-weight="bold" fill="#475569">${escapeXml(item.name)}</text>
      <text x="${x + colWidth / 2}" y="368" text-anchor="middle" font-size="11" font-weight="bold" fill="#0f172a">${item.val} ${item.unit}</text>
    `;
  }).join('')}

  ${specialItem ? (() => {
    const colWidth = 720 / (mechItems.length + 1);
    const x = 40 + mechItems.length * colWidth;
    return `
      <line x1="${x}" y1="324" x2="${x}" y2="384" stroke="#e2e8f0"/>
      <rect x="${x}" y="324" width="${colWidth}" height="28" fill="#fef3c7"/>
      <text x="${x + colWidth / 2}" y="342" text-anchor="middle" font-size="10" font-weight="bold" fill="#b45309">${escapeXml(specialItem.name)}</text>
      <text x="${x + colWidth / 2}" y="368" text-anchor="middle" font-size="11" font-weight="bold" fill="#92400e">${specialItem.val} ${specialItem.unit || ''}</text>
    `;
  })() : ''}

  <!-- 工艺与无损检验汇总 (严格包含执行标准强制检验项) -->
  <rect x="40" y="405" width="720" height="24" fill="#f1f5f9" stroke="#cbd5e1"/>
  <text x="50" y="421" font-size="11" font-weight="bold" fill="#1e293b">三、工艺性能与无损探伤检验结论 (Mandatory &amp; NDT Results)</text>
  <rect x="40" y="429" width="720" height="146" fill="#ffffff" stroke="#cbd5e1"/>
  ${processLines.map((line, idx) => {
    const y = 448 + idx * 20;
    return `<text x="55" y="${y}" font-size="10" fill="#334155"><tspan font-weight="bold" fill="#15803d">● </tspan>${escapeXml(line)}</text>`;
  }).join('')}

  <!-- 签章与结论 -->
  <rect x="40" y="588" width="720" height="80" fill="#fafafa" stroke="#cbd5e1" rx="4"/>
  <text x="55" y="612" font-size="11" font-weight="bold" fill="#0f172a">综合质检判定结论：</text>
  <text x="55" y="634" font-size="10" fill="#475569">本批产品严格按照采购合同及执行技术标准进行检验，各项指标实测结果如上记录所示，准予出厂。</text>
  <text x="55" y="654" font-size="10" fill="#64748b">检验员 (Inspector): 张建华 · 审核主任 (Supervisor): 李振国 · 防伪校验码: NS-VALID-2026</text>

  <!-- 红色印章模拟 -->
  <circle cx="680" cy="628" r="35" fill="none" stroke="#dc2626" stroke-width="2" stroke-dasharray="6,2"/>
  <text x="680" y="623" text-anchor="middle" font-size="10" font-weight="bold" fill="#dc2626">质检合格章</text>
  <text x="680" y="638" text-anchor="middle" font-size="8" fill="#dc2626">QA PASSED</text>
</svg>`;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 四维场景规范定义 (严格补齐全部强制检验项)
 */
const SCENARIOS = [
  {
    id: 'case1_tier1_hitl_unknown_grade',
    title: '[Case 1] Tier1-HITL-Unknown Grade SUS 304H-SpecialX',
    filename: 'case1_tier1_hitl_unknown_grade.pdf',
    standard: 'GB/T 13296-2023',
    grade: 'SUS 304H-SpecialX',
    certNo: 'MTC-2026-CASE1-UNK',
    batchNo: 'BATCH-2026-01-UNK',
    supplier: 'Wuxi Special Stainless Steel Tube Corp.',
    dimensions: 'OD 25.0mm x WT 2.0mm x L 6000mm',
    heatNo: 'H-CASE1-991',
    description: '声明未收录的特种非标牌号 (SUS 304H-SpecialX)，在归一化阶段即识别为牌号异常，直接触发 LangGraph interrupt() 挂起并唤起人机协同抽屉。人工指定等效国标牌号 06Cr19Ni10 后恢复执行，全部强制检验项齐全合格全绿通过。',
    tag: 'Tier1-HITL',
    expectedOutcome: 'AWAITING_HUMAN_REVIEW',
    chemItems: [
      { el: 'C', val: '0.052' }, { el: 'Si', val: '0.50' }, { el: 'Mn', val: '1.20' },
      { el: 'P', val: '0.026' }, { el: 'S', val: '0.002' }, { el: 'Cr', val: '18.25' }, { el: 'Ni', val: '8.45' }
    ],
    mechItems: [
      { name: 'Tensile Strength Rm', val: '570', unit: 'MPa' },
      { name: 'Yield Strength ReH', val: '250', unit: 'MPa' },
      { name: 'Elongation A', val: '45.0', unit: '%' },
      { name: 'Hardness HRB', val: '80', unit: 'HRB' }
    ],
    processLines: [
      'Flattening Test (GB/T 246): PASS OK - H=(1+e)t/(e+t/D), No cracks observed',
      'Flaring Test (GB/T 242): PASS OK - Flaring rate 20%, No cracking or tearing',
      'Intergranular Corrosion (GB/T 4334 Method E): PASS OK - No corrosion trend detected',
      'Ultrasonic Testing UT (GB/T 5777): PASS OK - Acceptance Class U2 passed',
      'Hydrostatic Pressure Test (GB/T 241): PASS OK - 20.0 MPa, Held for 10s, No leakage',
      'Surface Quality (GB/T 13296): PASS OK - Sound & smooth without cracks, scabs or folds'
    ],
    additionalTests: [
      {
        key: 'pressure_tightness',
        name: '液压致密性试验',
        category: 'ndt',
        standard: 'GB/T 241',
        result: '20.0 MPa 稳压 10s 无渗漏合格',
        value_num: 20.0,
        unit: 'MPa',
        conclusion: 'PASS',
      }
    ],
  },
  {
    id: 'case2_tier1_to_tier2_pass',
    title: '[Case 2] Tier1-to-Tier2-PASS Long-tail Roughness Compliant',
    filename: 'case2_tier1_to_tier2_pass.pdf',
    standard: 'NB/T 47019.5-2021',
    grade: '06Cr18Ni11Ti',
    certNo: 'MTC-2026-CASE2-PASS',
    batchNo: 'BATCH-2026-02-PASS',
    supplier: 'Zhejiang Special Alloy Pipe Co., Ltd.',
    dimensions: 'OD 19.0mm x WT 1.5mm x L 6000mm',
    heatNo: 'H-CASE2-401',
    description: '常规化学与力学性能齐全合规，包含长尾项目「表面光洁度 0.33 μm」。Tier 1 秒级出大盘；Tier 2 语义对齐至标准粗糙度 Ra <= 0.8 μm，增量核验达标，平滑全绿。',
    tag: 'Tier2-通过',
    expectedOutcome: 'PASS',
    chemItems: [
      { el: 'C', val: '0.045' }, { el: 'Si', val: '0.55' }, { el: 'Mn', val: '1.30' },
      { el: 'P', val: '0.028' }, { el: 'S', val: '0.003' }, { el: 'Cr', val: '17.80' },
      { el: 'Ni', val: '10.20' }, { el: 'Ti', val: '0.350' }, { el: 'N', val: '0.010' }
    ],
    mechItems: [
      { name: 'Tensile Strength Rm', val: '560', unit: 'MPa' },
      { name: 'Yield Strength Rp0.2', val: '240', unit: 'MPa' },
      { name: 'Elongation A', val: '42.0', unit: '%' },
      { name: 'Hardness HRB', val: '82', unit: 'HRB' }
    ],
    processLines: [
      'Flattening Test (GB/T 246): PASS OK - Sound without cracking',
      'Flaring Test (GB/T 242): PASS OK - Flare angle 60 deg, rate 20%',
      'Grain Size Rating (GB/T 6394): PASS OK - Grain size 7.5 class',
      'Intergranular Corrosion (GB/T 4334 Method E): PASS OK - Sound without crack',
      'Ultrasonic Testing UT (GB/T 5777): PASS OK - Class U2 Acceptance passed',
      'Hydrostatic Test (GB/T 241): PASS OK - 20.0 MPa 10s pressure holding without leakage',
      'Surface Quality (NB/T 47019.5): PASS OK - Inner & outer surfaces smooth, no cracks or folds'
    ],
    specialItem: { name: 'Surface Finish', val: '0.33', unit: 'um' },
    additionalTests: [
      {
        key: '表面光洁度',
        name: '表面光洁度',
        category: 'process',
        standard: 'NB/T 47019.5-2021',
        result: '0.33 um',
        value_num: 0.33,
        unit: 'um',
        conclusion: 'PASS',
      }
    ],
  },
  {
    id: 'case3_tier1_to_tier2_fail',
    title: '[Case 3] Tier1-to-Tier2-FAIL Roughness Exceeds Limit',
    filename: 'case3_tier1_to_tier2_fail.pdf',
    standard: 'NB/T 47019.5-2021',
    grade: '06Cr18Ni11Ti',
    certNo: 'MTC-2026-CASE3-FAIL',
    batchNo: 'BATCH-2026-03-FAIL',
    supplier: 'Jiangsu Heat Exchange Alloy Tube Industries',
    dimensions: 'OD 19.0mm x WT 1.5mm x L 6000mm',
    heatNo: 'H-CASE3-772',
    description: '常规项全部合规，长尾字段为「表面光洁度 1.50 μm」。Tier 2 对齐至标准粗糙度 Ra，因 1.50 > 0.8 μm 增量核验超标超差，判定为 FAIL 报警。',
    tag: 'Tier2-超标',
    expectedOutcome: 'FAIL',
    chemItems: [
      { el: 'C', val: '0.045' }, { el: 'Si', val: '0.55' }, { el: 'Mn', val: '1.30' },
      { el: 'P', val: '0.028' }, { el: 'S', val: '0.003' }, { el: 'Cr', val: '17.80' },
      { el: 'Ni', val: '10.20' }, { el: 'Ti', val: '0.350' }, { el: 'N', val: '0.010' }
    ],
    mechItems: [
      { name: 'Tensile Strength Rm', val: '560', unit: 'MPa' },
      { name: 'Yield Strength Rp0.2', val: '240', unit: 'MPa' },
      { name: 'Elongation A', val: '42.0', unit: '%' },
      { name: 'Hardness HRB', val: '82', unit: 'HRB' }
    ],
    processLines: [
      'Flattening Test (GB/T 246): PASS OK - Sound without cracking',
      'Flaring Test (GB/T 242): PASS OK - Flare angle 60 deg, rate 20%',
      'Grain Size Rating (GB/T 6394): PASS OK - Grain size 7.5 class',
      'Intergranular Corrosion (GB/T 4334 Method E): PASS OK - Sound without crack',
      'Ultrasonic Testing UT (GB/T 5777): PASS OK - Class U2 Acceptance passed',
      'Hydrostatic Test (GB/T 241): PASS OK - 20.0 MPa 10s pressure holding without leakage',
      'Surface Quality (NB/T 47019.5): PASS OK - Inner & outer surfaces smooth, no cracks or folds'
    ],
    specialItem: { name: 'Surface Finish', val: '1.50', unit: 'um' },
    additionalTests: [
      {
        key: '表面光洁度',
        name: '表面光洁度',
        category: 'process',
        standard: 'NB/T 47019.5-2021',
        result: '1.50 um',
        value_num: 1.50,
        unit: 'um',
        conclusion: 'FAIL',
      }
    ],
  },
  {
    id: 'case4_tier1_to_tier2_hitl',
    title: '[Case 4] Tier1-to-Tier2-HITL Special Indicator Ambiguity',
    filename: 'case4_tier1_to_tier2_hitl.pdf',
    standard: 'NB/T 47019.5-2021',
    grade: '06Cr18Ni11Ti',
    certNo: 'MTC-2026-CASE4-AMB',
    batchNo: 'BATCH-2026-04-AMB',
    supplier: 'Suzhou Nuclear Power Pressure Equipment Co.',
    dimensions: 'OD 15.0mm x WT 0.8mm x L 6000mm',
    heatNo: 'H-CASE4-338',
    description: '常规项合规，包含非标特异力学项目「特种非标微区抗剪切断裂韧度K1C: 85」。标准切片中无剪切规则，Tier 2 置信度不足，触发行内 HITL 审核卡片。',
    tag: 'Tier2-HITL',
    expectedOutcome: 'AWAITING_HUMAN_REVIEW',
    chemItems: [
      { el: 'C', val: '0.045' }, { el: 'Si', val: '0.55' }, { el: 'Mn', val: '1.30' },
      { el: 'P', val: '0.028' }, { el: 'S', val: '0.003' }, { el: 'Cr', val: '17.80' },
      { el: 'Ni', val: '10.20' }, { el: 'Ti', val: '0.350' }, { el: 'N', val: '0.010' }
    ],
    mechItems: [
      { name: 'Tensile Strength Rm', val: '560', unit: 'MPa' },
      { name: 'Yield Strength Rp0.2', val: '240', unit: 'MPa' },
      { name: 'Elongation A', val: '42.0', unit: '%' },
      { name: 'Hardness HRB', val: '82', unit: 'HRB' }
    ],
    processLines: [
      'Flattening Test (GB/T 246): PASS OK - Sound without cracking',
      'Flaring Test (GB/T 242): PASS OK - Flare angle 60 deg, rate 20%',
      'Grain Size Rating (GB/T 6394): PASS OK - Grain size 7.5 class',
      'Intergranular Corrosion (GB/T 4334 Method E): PASS OK - Sound without crack',
      'Ultrasonic Testing UT (GB/T 5777): PASS OK - Class U2 Acceptance passed',
      'Hydrostatic Test (GB/T 241): PASS OK - 20.0 MPa 10s pressure holding without leakage',
      'Surface Quality (NB/T 47019.5): PASS OK - Inner & outer surfaces smooth, no cracks or folds'
    ],
    specialItem: { name: 'Shear Toughness K1C', val: '85', unit: 'MPa.m^1/2' },
    additionalTests: [
      {
        key: '特种非标微区抗剪切断裂韧度K1C',
        name: '特种非标微区抗剪切断裂韧度K1C',
        category: 'mechanical',
        standard: 'NB/T 47019.5-2021',
        result: '85 MPa·m^1/2',
        value_num: 85,
        unit: 'MPa·m^1/2',
        conclusion: 'MANUAL_REVIEW',
      }
    ],
  },
];

async function main() {
  console.log('[Script] 正在生成全新工业级标准矢量 PDF 与权威结构化缓存...');

  const publicSamplesDir = path.resolve(process.cwd(), 'public/samples');
  const cacheUploadsDir = path.resolve(process.cwd(), '.cache/uploads');
  const cacheParsesDir = path.resolve(process.cwd(), '.cache/parses');
  const cachePreprocessedDir = path.resolve(process.cwd(), '.cache/preprocessed');

  [publicSamplesDir, cacheUploadsDir, cacheParsesDir, cachePreprocessedDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  const generatedList: any[] = [];

  for (const sc of SCENARIOS) {
    const textLines = [
      `MILL TEST CERTIFICATE - ${sc.title}`,
      `Certificate No: ${sc.certNo}`,
      `Declared Standard: ${sc.standard}`,
      `Declared Grade: ${sc.grade}`,
      `Supplier: ${sc.supplier}`,
      `Dimensions: ${sc.dimensions}`,
      `Heat No: ${sc.heatNo}    Batch No: ${sc.batchNo}`,
      '----------------------------------------------------------------------',
      'Chemical Composition (%):',
      sc.chemItems.map(c => `${c.el}: ${c.val}`).join('   '),
      '----------------------------------------------------------------------',
      'Mechanical Properties:',
      sc.mechItems.map(m => `${m.name}: ${m.val} ${m.unit}`).join('   '),
    ];

    if (sc.specialItem) {
      textLines.push(`Special Item: ${sc.specialItem.name}: ${sc.specialItem.val} ${sc.specialItem.unit || ''}`);
    }

    textLines.push('----------------------------------------------------------------------');
    textLines.push('Technological & Non-Destructive Inspection:');
    sc.processLines.forEach(l => textLines.push(`  ${l}`));
    textLines.push('----------------------------------------------------------------------');
    textLines.push('Quality Verdict: Fully Tested according to Contract Technical Specifications.');
    textLines.push('Certified Inspector: Zhang Jianhua    Supervisor: Li Zhenguo');

    // 1. 生成符合 PDF 1.4 标准的矢量 PDF Buffer
    const pdfBuffer = createMinimalVectorPdf(sc);
    const md5 = crypto.createHash('md5').update(pdfBuffer).digest('hex');

    // 2. 写入 public/samples/ 与 .cache/uploads/
    const publicPdfPath = path.join(publicSamplesDir, sc.filename);
    const cachePdfPath = path.join(cacheUploadsDir, `${md5}.pdf`);
    fs.writeFileSync(publicPdfPath, pdfBuffer);
    fs.writeFileSync(cachePdfPath, pdfBuffer);

    // 3. 生成 SVG 矢量切图并转化为 Data URL
    const svgXml = createCertificateSvg(sc);
    const svgBase64 = `data:image/svg+xml;base64,${Buffer.from(svgXml, 'utf8').toString('base64')}`;

    // 4. 写入预处理目录
    const docPreDir = path.join(cachePreprocessedDir, md5);
    if (!fs.existsSync(docPreDir)) fs.mkdirSync(docPreDir, { recursive: true });
    fs.writeFileSync(path.join(docPreDir, 'text.txt'), textLines.join('\n'), 'utf8');

    // 5. 构建与执行标准严格对应的 SessionDocument 与 BatchSpecimen
    const batchSpecimen: BatchSpecimen = {
      batchNo: sc.batchNo,
      subBatchIndex: 1,
      certificateNo: sc.certNo,
      reportNo: sc.certNo,
      sha256Hash: md5,
      inspector: '张建华',
      productName: '锅炉热交换器用不锈钢无缝钢管',
      grade: sc.grade,
      standard: sc.standard,
      supplier: sc.supplier,
      dimensions: sc.dimensions,
      heatNo: sc.heatNo,
      deliveryState: '固溶退火酸洗',
      verdict: 'UNAUDITED',
      verdictSummary: '就绪待核验',
      ocrConfidence: 99,
      gradeMatchConfidence: 100,
      chemical: sc.chemItems.map(c => ({
        element: c.el,
        value: c.val,
        confidence: '99%',
        status: 'ok' as const,
      })),
      mechanical: {
        tensile_rm: sc.mechItems.find(m => m.name.includes('Rm'))?.val || '560',
        yield_rp02: sc.mechItems.find(m => m.name.includes('ReH') || m.name.includes('Rp0.2'))?.val || '240',
        yield_reh: sc.mechItems.find(m => m.name.includes('ReH'))?.val || undefined,
        elongation_a: sc.mechItems.find(m => m.name.includes('Elongation') || m.name.includes('伸长率'))?.val || '42.0',
        hardness: sc.mechItems.find(m => m.name.includes('Hardness') || m.name.includes('硬度'))?.val || '82 HRB',
      },
      process: {
        flattening: '合格 OK (未见裂纹)',
        flaring: '合格 OK (扩口率 20%)',
        grainSize: '7.5',
        intergranularCorrosion: '合格 OK (E法无倾向)',
        ndt_et: '合格 OK (E3H 等级)',
        ndt_ut: '合格 OK (U2 等级)',
        ndt: '合格 OK / 合格 OK',
        hydrostatic: '20 MPa 稳压 10s 无渗漏合格',
        pressureTest: '20 MPa 稳压 10s 无渗漏合格',
        surfaceQuality: '内外表面光洁平整合格',
      },
      additionalTests: sc.additionalTests as any,
      surfaceQuality: '内外表面光洁平整合格',
    };

    const sessionDocument: SessionDocument = {
      docId: `doc_${md5.substring(0, 8)}`,
      filename: sc.filename,
      fileSize: `${(pdfBuffer.length / 1024).toFixed(1)} KB`,
      uploadTime: '2026-09-07 16:50:00',
      ocrStatus: 'DONE',
      pageCount: 1,
      batches: [batchSpecimen],
      pages: [svgBase64],
      samplePages: [svgBase64],
      md5,
    };

    const bboxes: FieldBBox[] = [
      { id: 'header_cert_no', page: 1, x: 50, y: 120, w: 200, h: 20, label: '证书编号', category: 'meta' },
      { id: 'header_std', page: 1, x: 215, y: 120, w: 200, h: 20, label: '执行标准', category: 'meta' },
      { id: 'header_grade', page: 1, x: 385, y: 120, w: 150, h: 20, label: '材料牌号', category: 'meta' },
    ];

    const cachedParseResult: CachedParseResult = {
      md5,
      filename: sc.filename,
      fileSize: `${(pdfBuffer.length / 1024).toFixed(1)} KB`,
      parserConfigVersion: '1.1.0',
      originalFilePath: cachePdfPath,
      preprocessedDir: docPreDir,
      extractedTextPath: path.join(docPreDir, 'text.txt'),
      isTextBased: true,
      pageCount: 1,
      pageImages: ['page-1.png'],
      model: 'deterministic-generator',
      provider: 'NormScale-TestKit',
      parsedAt: new Date().toISOString(),
      tokenStats: {
        inputTokens: 1200,
        outputTokens: 1800,
        durationSeconds: 0.05,
        isFromCache: true,
      },
      rawStreamingJson: JSON.stringify(sessionDocument, null, 2),
      sessionDocument,
      bboxes,
    };

    // 6. 写入 .cache/parses/<md5>.json
    fs.writeFileSync(
      path.join(cacheParsesDir, `${md5}.json`),
      JSON.stringify(cachedParseResult, null, 2),
      'utf8'
    );

    generatedList.push({
      id: sc.id,
      title: sc.title,
      filename: sc.filename,
      md5,
      pdfPath: publicPdfPath,
      tag: sc.tag,
    });
    console.log(`  ✓ 已生成: ${sc.filename} (MD5: ${md5})`);
  }

  console.log('\n[Script] 全部四维测试用例 PDF 与结构化切片缓存生成完毕！元数据摘要：');
  console.log(JSON.stringify(generatedList, null, 2));
}

main().catch(err => {
  console.error('[Script] 生成失败:', err);
  process.exit(1);
});
