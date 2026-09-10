import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:3000/api/documents/parse';
const MD5 = '8d566b296d4110c544e8bd1b6b6136d5';
const FILENAME = '测试质保书1.pdf';
const TOTAL_RUNS = 10;
const OUTPUT_DIR = path.resolve(process.cwd(), '.cache/test-10-runs');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log(`=======================================================`);
console.log(`开始执行【测试质保书 1】大模型重复 10 次稳定性压测`);
console.log(`目标文档 MD5: ${MD5}`);
console.log(`模型解析端点: ${API_URL}`);
console.log(`结果缓存目录: ${OUTPUT_DIR}`);
console.log(`=======================================================\n`);

const runResults = [];

for (let i = 1; i <= TOTAL_RUNS; i++) {
  console.log(`[${i}/${TOTAL_RUNS}] 正在发起第 ${i} 次大模型解析 (forceReparse: true)...`);
  const startTime = Date.now();

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        md5: MD5,
        filename: FILENAME,
        forceReparse: true,
      }),
    });

    const duration = Date.now() - startTime;
    if (!res.ok) {
      const errText = await res.text();
      console.error(`  ❌ 第 ${i} 次请求失败 (HTTP ${res.status}):`, errText);
      runResults.push({ runIndex: i, success: false, duration, error: errText });
      continue;
    }

    const data = await res.json();
    const sessionDoc = data.result?.sessionDocument;
    const tokens = data.result?.metrics || {};

    const summary = {
      runIndex: i,
      success: true,
      durationMs: duration,
      tokens: {
        input: tokens.inputTokens || 0,
        output: tokens.outputTokens || 0,
      },
      batchesCount: sessionDoc?.batches?.length || 0,
      batchNos: (sessionDoc?.batches || []).map(b => b.batchNo),
      header: {
        certificateNo: sessionDoc?.batches?.[0]?.certificateNo,
        grade: sessionDoc?.batches?.[0]?.grade,
        standard: sessionDoc?.batches?.[0]?.standard,
        heatNo: sessionDoc?.batches?.[0]?.heatNo,
        constructionNo: sessionDoc?.batches?.[0]?.constructionNo,
        dimensions: sessionDoc?.batches?.[0]?.dimensions,
        deliveryState: sessionDoc?.batches?.[0]?.deliveryState,
      },
      // 收集第 1 个批次的详细数据供横向比对
      batch0: sessionDoc?.batches?.[0] ? {
        chemicalElements: (sessionDoc.batches[0].chemical || []).map(c => ({
          element: c.element,
          value: c.value,
        })),
        mechanical: sessionDoc.batches[0].mechanical || {},
        process: sessionDoc.batches[0].process || {},
        additionalTests: (sessionDoc.batches[0].additionalTests || []).map(t => ({
          key: t.key || t.name,
          name: t.name,
          result: t.result,
        })),
      } : null,
      rawDoc: sessionDoc,
    };

    // 保存单次完整原始响应
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `run-${i}.json`),
      JSON.stringify(data, null, 2),
      'utf-8'
    );

    console.log(`  ✅ 第 ${i} 次解析成功 | 耗时: ${(duration / 1000).toFixed(1)}s | 批次数: ${summary.batchesCount} | 化学元素数: ${summary.batch0?.chemicalElements?.length || 0}`);
    runResults.push(summary);
  } catch (err) {
    console.error(`  ❌ 第 ${i} 次网络或执行异常:`, err.message);
    runResults.push({ runIndex: i, success: false, durationMs: Date.now() - startTime, error: err.message });
  }

  // 间隔 1.5 秒发起下一次请求，避免 API 速率限制
  if (i < TOTAL_RUNS) {
    await new Promise(r => setTimeout(r, 1500));
  }
}

// 保存汇总数据
fs.writeFileSync(
  path.join(OUTPUT_DIR, 'summary-10-runs.json'),
  JSON.stringify(runResults, null, 2),
  'utf-8'
);

console.log(`\n=======================================================`);
console.log(`10 次重复解析全部执行完毕！开始生成横向对比报告...`);
console.log(`=======================================================\n`);
