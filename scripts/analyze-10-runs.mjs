import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve(process.cwd(), '.cache/test-10-runs');
const TOTAL_RUNS = 10;

const runs = [];
for (let i = 1; i <= TOTAL_RUNS; i++) {
  const filePath = path.join(OUTPUT_DIR, `run-${i}.json`);
  if (fs.existsSync(filePath)) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    runs.push({ index: i, data: raw });
  }
}

if (runs.length === 0) {
  console.error('未找到测试结果文件，请先运行 run-10-repeats.mjs');
  process.exit(1);
}

console.log(`成功读取 ${runs.length} 次测试结果，开始深度多维分析...\n`);

// 1. 基础元数据比对
const headers = runs.map(r => {
  const doc = r.data.result?.sessionDocument;
  const b0 = doc?.batches?.[0];
  return {
    run: r.index,
    success: r.data.success,
    batchesCount: doc?.batches?.length || 0,
    batchNos: (doc?.batches || []).map(b => b.batchNo).join(', '),
    certNo: b0?.certificateNo || '--',
    grade: b0?.grade || '--',
    standard: b0?.standard || '--',
    heatNo: b0?.heatNo || '--',
    constructionNo: b0?.constructionNo || '--',
    deliveryState: b0?.deliveryState || '--',
  };
});

// 2. 化学成分全集与各次提取
const allChemElementsSet = new Set();
runs.forEach(r => {
  const b0 = r.data.result?.sessionDocument?.batches?.[0];
  (b0?.chemical || []).forEach(c => {
    if (c.element) allChemElementsSet.add(c.element);
  });
});
const allChemElements = Array.from(allChemElementsSet).sort();

const chemTable = allChemElements.map(el => {
  const row = { element: el, counts: 0, values: [] };
  runs.forEach(r => {
    const b0 = r.data.result?.sessionDocument?.batches?.[0];
    const match = (b0?.chemical || []).find(c => c.element === el);
    if (match && match.value !== undefined && match.value !== null && match.value !== '') {
      row.counts++;
      row.values.push(match.value);
    } else {
      row.values.push('MISSING');
    }
  });
  return row;
});

// 3. 力学性能比对 (检查 3 个批次的数据完整性)
const mechSummary = runs.map(r => {
  const doc = r.data.result?.sessionDocument;
  const bList = doc?.batches || [];
  return {
    run: r.index,
    batches: bList.map(b => ({
      batchNo: b.batchNo,
      tensile_rm: b.mechanical?.tensile_rm || '--',
      yield_rp02: b.mechanical?.yield_rp02 || '--',
      elongation_a: b.mechanical?.elongation_a || '--',
      hardness: b.mechanical?.hardness_hv || b.mechanical?.hardness || '--',
      grain_size: b.mechanical?.grain_size || b.process?.grain_size || '--',
    })),
  };
});

// 4. 工艺性能与检验项目 (压扁, 扩口, 涡流, 超声, 晶间腐蚀, 尺寸, 表面)
const processItemsToCheck = [
  { key: 'flattening', alias: ['flattening'], name: '压扁试验' },
  { key: 'flaring', alias: ['flaring'], name: '扩口试验' },
  { key: 'ndt_et', alias: ['ndt_et', 'ndt'], name: '涡流探伤 (ET)' },
  { key: 'ndt_ut', alias: ['ndt_ut', 'ndt'], name: '超声波探伤 (UT)' },
  { key: 'intergranularCorrosion', alias: ['intergranularCorrosion', 'intergranular_corrosion'], name: '晶间腐蚀 (方法E)' },
  { key: 'dimensions', alias: ['dimensions', 'geo_dimensions'], name: '尺寸检验' },
  { key: 'surfaceQuality', alias: ['surfaceQuality', 'surface_quality', 'geo_surface_quality'], name: '表面质量' },
];

const processTable = processItemsToCheck.map(item => {
  let foundCount = 0;
  const values = [];
  runs.forEach(r => {
    const b0 = r.data.result?.sessionDocument?.batches?.[0];
    const p = b0?.process || {};
    const addTests = b0?.additionalTests || [];

    let val = undefined;
    for (const k of item.alias) {
      if (p[k] && p[k].trim() !== '') {
        val = p[k];
        break;
      }
    }

    if (!val) {
      // 检查 additionalTests
      const matched = addTests.find(t =>
        (t.name && (t.name.includes(item.name.slice(0, 2)) || item.name.includes(t.name.slice(0, 2)))) ||
        item.alias.some(a => t.key && t.key.includes(a))
      );
      if (matched) {
        val = matched.result || String(matched.value_num || '合格');
      }
    }

    if (val && val !== '--') {
      foundCount++;
      values.push(val);
    } else {
      values.push('MISSING');
    }
  });

  return {
    name: item.name,
    key: item.key,
    foundCount,
    values,
    rate: `${((foundCount / runs.length) * 100).toFixed(0)}%`,
  };
});

// 输出分析报告为 Markdown
let md = `# 【测试质保书 1】大模型 10 次重复解析横向对比与稳定性评测报告\n\n`;
md += `> **测试对象**：\`public/samples/test/测试质保书1.pdf\` (MD5: \`8d566b296d4110c544e8bd1b6b6136d5\`)\n`;
md += `> **测试条件**：每轮均启用 \`forceReparse: true\` 绕过解析缓存，直接调用真实大模型推理 10 次\n`;
md += `> **测试总轮数**：${runs.length} 轮\n\n`;

md += `## 1. 整体成功率与核心元数据对比\n\n`;
md += `| 轮次 | 批次数量 | 识别批号列表 | 牌号 (Grade) | 执行标准 | 炉号 (Heat No.) | 施工工程号 |\n`;
md += `|:---:|:---:|:---|:---:|:---|:---:|:---:|\n`;
headers.forEach(h => {
  md += `| #${h.run} | ${h.batchesCount} | ${h.batchNos} | ${h.grade} | ${h.standard} | ${h.heatNo} | ${h.constructionNo} |\n`;
});

md += `\n## 2. 化学成分提取稳定性对比 (10 次横向)\n\n`;
md += `| 元素 | 提取成功率 | 实测值分布 (10次) | 稳定性结论 |\n`;
md += `|:---:|:---:|:---|:---:|\n`;
chemTable.forEach(c => {
  const uniqueVals = Array.from(new Set(c.values.filter(v => v !== 'MISSING')));
  const isMissing = c.counts < runs.length;
  const isConsistent = uniqueVals.length <= 1;
  let concl = '✅ 极稳定';
  if (isMissing) concl = `⚠️ 出现 ${runs.length - c.counts} 次遗漏`;
  else if (!isConsistent) concl = `ℹ️ 格式微小差异 (${uniqueVals.join(' vs ')})`;

  md += `| **${c.element}** | ${((c.counts / runs.length) * 100).toFixed(0)}% (${c.counts}/${runs.length}) | ${uniqueVals.join(' / ')} | ${concl} |\n`;
});

md += `\n## 3. 工艺性能与探伤试验项提取对比\n\n`;
md += `| 检验项目 | 提取命中率 | 10 次识别结果样本 | 遗漏评估 |\n`;
md += `|:---|:---:|:---|:---:|\n`;
processTable.forEach(p => {
  const uniqueVals = Array.from(new Set(p.values.filter(v => v !== 'MISSING')));
  const isMissing = p.foundCount < runs.length;
  md += `| **${p.name}** | ${p.rate} (${p.foundCount}/${runs.length}) | ${uniqueVals.join(' / ')} | ${isMissing ? `⚠️ 存在遗漏 (${runs.length - p.foundCount}次)` : '✅ 100% 稳定覆盖'} |\n`;
});

md += `\n## 4. 批次拆分与力学性能表现 (以各批次 Rm / Rp0.2 / A 为例)\n\n`;
md += `| 轮次 | 批次 1 (DB7) Rm / Rp0.2 / A | 批次 2 (DB8) Rm / Rp0.2 / A | 批次 3 (E1) Rm / Rp0.2 / A |\n`;
md += `|:---:|:---|:---|:---|\n`;
mechSummary.forEach(m => {
  const b1 = m.batches[0] ? `${m.batches[0].tensile_rm} / ${m.batches[0].yield_rp02} / ${m.batches[0].elongation_a}` : '--';
  const b2 = m.batches[1] ? `${m.batches[1].tensile_rm} / ${m.batches[1].yield_rp02} / ${m.batches[1].elongation_a}` : '--';
  const b3 = m.batches[2] ? `${m.batches[2].tensile_rm} / ${m.batches[2].yield_rp02} / ${m.batches[2].elongation_a}` : '--';
  md += `| #${m.run} | ${b1} | ${b2} | ${b3} |\n`;
});

const reportPath = path.join(process.cwd(), 'docs/dev/107_evaluation_测试质保书1_大模型10次解析稳定性评测报告.md');
fs.writeFileSync(reportPath, md, 'utf-8');
console.log(`\n✅ 评测报告生成成功: ${reportPath}`);
console.log(md);
