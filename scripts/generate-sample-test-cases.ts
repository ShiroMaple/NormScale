import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { BatchSpecimen, SessionDocument } from '../src/types/session.ts';
import type { FieldBBox } from '../src/types/bbox.ts';
import type { CachedParseResult } from '../src/repository/parse-cache-store.ts';

/**
 * 辅助函数：将 UTF-8 字符串转换为 UTF-16BE 大端十六进制字符串 (供 PDF 标准 CJK Type0 字体使用)
 */
function toHexUtf16BE(str: string): string {
  const buf = Buffer.from(str, 'utf16le');
  for (let i = 0; i < buf.length; i += 2) {
    const tmp = buf[i]!;
    buf[i] = buf[i + 1]!;
    buf[i + 1] = tmp;
  }
  return buf.toString('hex').toUpperCase();
}

/**
 * 辅助函数：构造标准原生支持 CJK 中文字符的矢量 PDF 1.4 格式 Buffer
 * 使用 Adobe Predefined CMap (UniGB-UTF16-H) 与 STSong-Light 规范字体，彻底消除中文乱码
 */
function createMinimalVectorPdf(title: string, lines: string[]): Buffer {
  const contentStreamLines = [
    'BT',
    '/F1 15 Tf',
    '50 790 Td',
    `<${toHexUtf16BE(title)}> Tj`,
    '/F1 10 Tf',
  ];

  let currentY = 760;
  for (const line of lines) {
    currentY -= 18;
    contentStreamLines.push(`1 0 0 1 50 ${currentY} Tm`);
    contentStreamLines.push(`<${toHexUtf16BE(line)}> Tj`);
  }
  contentStreamLines.push('ET');

  const streamContent = contentStreamLines.join('\n');
  const streamLength = Buffer.byteLength(streamContent, 'utf8');

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>\nendobj'
  );
  // Type0 font for Simplified Chinese (STSong-Light with UniGB-UTF16-H)
  objects.push(
    '4 0 obj\n<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UTF16-H /DescendantFonts [5 0 R] >>\nendobj'
  );
  objects.push(
    '5 0 obj\n<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>\nendobj'
  );
  objects.push(`6 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj`);

  let header = '%PDF-1.4\n';
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
 * 辅助函数：构造高保真 SVG 质保证书渲染图 (转 Base64 供前端原位展示)
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
  specialItem?: { name: string; val: string; unit?: string; statusNote?: string };
}): string {
  const { title, certNo, standard, grade, supplier, dimensions, heatNo, batchNo, chemItems, mechItems, specialItem } = params;

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

  <!-- 工艺与无损检验汇总 -->
  <rect x="40" y="405" width="720" height="24" fill="#f1f5f9" stroke="#cbd5e1"/>
  <text x="50" y="421" font-size="11" font-weight="bold" fill="#1e293b">三、工艺性能与无损探伤检验结论</text>
  <rect x="40" y="429" width="720" height="60" fill="#ffffff" stroke="#cbd5e1"/>
  <text x="55" y="452" font-size="10" fill="#334155">压扁试验 (Flattening): <tspan font-weight="bold" fill="#15803d">合格 OK (无裂纹)</tspan></text>
  <text x="320" y="452" font-size="10" fill="#334155">扩口试验 (Flaring): <tspan font-weight="bold" fill="#15803d">合格 OK (扩口率 20%)</tspan></text>
  <text x="550" y="452" font-size="10" fill="#334155">晶间腐蚀 (IGC Method E): <tspan font-weight="bold" fill="#15803d">合格 OK</tspan></text>
  <text x="55" y="475" font-size="10" fill="#334155">涡流探伤 (Eddy Current ET): <tspan font-weight="bold" fill="#15803d">PASS (E3H 等级)</tspan></text>
  <text x="320" y="475" font-size="10" fill="#334155">超声探伤 (Ultrasonic UT): <tspan font-weight="bold" fill="#15803d">PASS (U2 等级)</tspan></text>
  <text x="550" y="475" font-size="10" fill="#334155">水压试验 (Hydrostatic): <tspan font-weight="bold" fill="#15803d">免做 (AST 涡流替代)</tspan></text>

  <!-- 签章与结论 -->
  <rect x="40" y="510" width="720" height="90" fill="#fafafa" stroke="#cbd5e1" rx="4"/>
  <text x="55" y="535" font-size="11" font-weight="bold" fill="#0f172a">综合质检判定结论：</text>
  <text x="55" y="558" font-size="10" fill="#475569">本批产品严格按照采购合同及执行技术标准进行检验，各项指标实测结果如上记录所示。</text>
  <text x="55" y="580" font-size="10" fill="#64748b">检验员 (Inspector): 张建华 · 审核主任 (Supervisor): 李振国 · 质保系统防伪校验码: NS-VALID-2026</text>

  <!-- 红色印章模拟 -->
  <circle cx="680" cy="555" r="35" fill="none" stroke="#dc2626" stroke-width="2" stroke-dasharray="6,2"/>
  <text x="680" y="550" text-anchor="middle" font-size="10" font-weight="bold" fill="#dc2626">质检合格章</text>
  <text x="680" y="565" text-anchor="middle" font-size="8" fill="#dc2626">QA PASSED</text>
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
 * 四维场景定义
 */
const SCENARIOS = [
  {
    id: 'case1_tier1_hitl_unknown_grade',
    title: '[用例1] Tier1-HITL-未收录非标牌号',
    filename: 'case1_tier1_hitl_unknown_grade.pdf',
    standard: 'GB/T 13296-2023',
    grade: 'SUS 304H-SpecialX',
    certNo: 'MTC-2026-CASE1-UNK',
    batchNo: 'BATCH-2026-01-UNK',
    supplier: '无锡某特种不锈钢管件制造厂',
    dimensions: 'Φ25.0 × 2.0 × 6000mm',
    heatNo: 'H-CASE1-991',
    description: '声明未收录的特种非标牌号 (SUS 304H-SpecialX)，在归一化阶段即识别为牌号异常，直接触发 LangGraph interrupt() 挂起并唤起人机协同抽屉。',
    tag: 'Tier1-HITL',
    expectedOutcome: 'AWAITING_HUMAN_REVIEW',
    chemItems: [
      { el: 'C', val: '0.052' }, { el: 'Si', val: '0.50' }, { el: 'Mn', val: '1.20' },
      { el: 'P', val: '0.026' }, { el: 'S', val: '0.002' }, { el: 'Cr', val: '18.25' }, { el: 'Ni', val: '8.45' }
    ],
    mechItems: [
      { name: '抗拉强度 Rm', val: '570', unit: 'MPa' },
      { name: '屈服强度 ReH', val: '250', unit: 'MPa' },
      { name: '伸长率 A', val: '45.0', unit: '%' },
      { name: '硬度 HRB', val: '80', unit: 'HRB' }
    ],
    additionalTests: [] as any[],
  },
  {
    id: 'case2_tier1_to_tier2_pass',
    title: '[用例2] Tier1-Tier2-通过-长尾光洁度达标',
    filename: 'case2_tier1_to_tier2_pass.pdf',
    standard: 'NB/T 47019.5-2021',
    grade: '06Cr18Ni11Ti',
    certNo: 'MTC-2026-CASE2-PASS',
    batchNo: 'BATCH-2026-02-PASS',
    supplier: '浙江某特种承压合金管业有限公司',
    dimensions: 'Φ19.0 × 1.5 × 6000mm',
    heatNo: 'H-CASE2-401',
    description: '常规化学与力学性能齐全，包含长尾项目「表面光洁度 0.33 μm」。Tier 1 秒级出大盘；Tier 2 语义对齐至标准粗糙度 Ra <= 0.8 μm，增量核验达标，平滑全绿。',
    tag: 'Tier2-通过',
    expectedOutcome: 'PASS',
    chemItems: [
      { el: 'C', val: '0.045' }, { el: 'Si', val: '0.55' }, { el: 'Mn', val: '1.30' },
      { el: 'P', val: '0.028' }, { el: 'S', val: '0.003' }, { el: 'Cr', val: '17.80' },
      { el: 'Ni', val: '10.20' }, { el: 'Ti', val: '0.350' }, { el: 'N', val: '0.010' }
    ],
    mechItems: [
      { name: '抗拉强度 Rm', val: '560', unit: 'MPa' },
      { name: '规定延伸 Rp0.2', val: '240', unit: 'MPa' },
      { name: '伸长率 A', val: '42.0', unit: '%' },
      { name: '硬度 HRB', val: '82', unit: 'HRB' }
    ],
    specialItem: { name: '表面光洁度', val: '0.33', unit: 'μm', statusNote: '对齐至 Ra<=0.8 达标' },
    additionalTests: [
      {
        key: '表面光洁度',
        name: '表面光洁度',
        category: 'process',
        standard: 'NB/T 47019.5-2021',
        result: '0.33 μm',
        value_num: 0.33,
        unit: 'μm',
        conclusion: 'PASS',
      }
    ],
  },
  {
    id: 'case3_tier1_to_tier2_fail',
    title: '[用例3] Tier1-Tier2-超标-长尾光洁度超差',
    filename: 'case3_tier1_to_tier2_fail.pdf',
    standard: 'NB/T 47019.5-2021',
    grade: '06Cr18Ni11Ti',
    certNo: 'MTC-2026-CASE3-FAIL',
    batchNo: 'BATCH-2026-03-FAIL',
    supplier: '江苏某换热系统承压管件实业公司',
    dimensions: 'Φ19.0 × 1.5 × 6000mm',
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
      { name: '抗拉强度 Rm', val: '560', unit: 'MPa' },
      { name: '规定延伸 Rp0.2', val: '240', unit: 'MPa' },
      { name: '伸长率 A', val: '42.0', unit: '%' },
      { name: '硬度 HRB', val: '82', unit: 'HRB' }
    ],
    specialItem: { name: '表面光洁度', val: '1.50', unit: 'μm', statusNote: '超标 (标准限值<=0.8)' },
    additionalTests: [
      {
        key: '表面光洁度',
        name: '表面光洁度',
        category: 'process',
        standard: 'NB/T 47019.5-2021',
        result: '1.50 μm',
        value_num: 1.50,
        unit: 'μm',
        conclusion: 'FAIL',
      }
    ],
  },
  {
    id: 'case4_tier1_to_tier2_hitl',
    title: '[用例4] Tier1-Tier2-HITL-特种指标语义歧义',
    filename: 'case4_tier1_to_tier2_hitl.pdf',
    standard: 'NB/T 47019.5-2021',
    grade: '06Cr18Ni11Ti',
    certNo: 'MTC-2026-CASE4-AMB',
    batchNo: 'BATCH-2026-04-AMB',
    supplier: '苏州某特种核电承压装备厂',
    dimensions: 'Φ15.0 × 0.8 × 6000mm',
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
      { name: '抗拉强度 Rm', val: '560', unit: 'MPa' },
      { name: '规定延伸 Rp0.2', val: '240', unit: 'MPa' },
      { name: '伸长率 A', val: '42.0', unit: '%' },
      { name: '硬度 HRB', val: '82', unit: 'HRB' }
    ],
    specialItem: { name: '特种微区抗剪韧度K1C', val: '85', unit: 'MPa·m^1/2', statusNote: '歧义项挂起' },
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
  console.log('[Script] 正在生成四维分层核验场景矢量 PDF 与结构化缓存...');

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
      textLines.push(`Special Inspection: ${sc.specialItem.name}: ${sc.specialItem.val} ${sc.specialItem.unit || ''}`);
    }

    textLines.push('----------------------------------------------------------------------');
    textLines.push('Quality Verdict: Fully Tested according to Contract Technical Specifications.');
    textLines.push('Certified Inspector: Zhang Jianhua    Supervisor: Li Zhenguo');

    // 1. 生成矢量 PDF Buffer
    const pdfBuffer = createMinimalVectorPdf(sc.title, textLines);
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

    // 5. 构建 SessionDocument 与 BatchSpecimen
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
        elongation_a: sc.mechItems.find(m => m.name.includes('伸长率'))?.val || '42.0',
        hardness: sc.mechItems.find(m => m.name.includes('硬度'))?.val || '82 HRB',
      },
      process: {
        flattening: '合格 OK (未见裂纹)',
        flaring: '合格 OK',
        intergranularCorrosion: '合格 OK (E法)',
        ndt_et: '合格 OK (E3H 等级)',
        ndt_ut: '合格 OK (U2 等级)',
        ndt: '合格 OK / 合格 OK',
      },
      additionalTests: sc.additionalTests as any,
      surfaceQuality: '合格 OK',
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
      { id: 'header_std', page: 1, x: 320, y: 120, w: 200, h: 20, label: '执行标准', category: 'meta' },
      { id: 'header_grade', page: 1, x: 580, y: 120, w: 150, h: 20, label: '材料牌号', category: 'meta' },
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

  console.log('[Script] 全部四维测试用例 PDF 与结构化缓存生成完毕！');
}

main().catch(err => {
  console.error('[Script] 生成失败:', err);
  process.exit(1);
});
