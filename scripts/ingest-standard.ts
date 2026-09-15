import fs from 'node:fs';
import path from 'node:path';
import { ingestStandard, GarbledTextLayerError } from '../src/ingestion/ingest-pipeline.ts';

/* ==========================================================================
   标准文档 PDF 离线入库 CLI
   用法: node --experimental-strip-types scripts/ingest-standard.ts <pdf路径> [--out <根目录>] [--force]
   - 脚本及其依赖链仅使用相对路径 + 显式 .ts 扩展名 import（Node type stripping 要求）
   - 默认输出到 data/standards；--out 可指向临时目录（E2E 验证严禁覆盖已入库数据）
   ========================================================================== */

interface CliArgs {
  pdfPath: string;
  outRoot?: string;
  force: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { pdfPath: '', force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--out') {
      args.outRoot = argv[++i];
    } else if (arg === '--force') {
      args.force = true;
    } else if (!arg.startsWith('--') && args.pdfPath.length === 0) {
      args.pdfPath = arg;
    } else {
      throw new Error(`无法识别的参数: ${arg}`);
    }
  }
  if (args.pdfPath.length === 0) {
    throw new Error('缺少 PDF 路径参数。用法: node --experimental-strip-types scripts/ingest-standard.ts <pdf路径> [--out <根目录>] [--force]');
  }
  return args;
}

// 加载 .env（仅判断存在性，KIMI_API_KEY 等由默认聊天客户端解析，不读取打印）
try {
  if (fs.existsSync(path.join(process.cwd(), '.env')) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch {
  // .env 加载失败不阻断：密钥缺失时由 LLM 客户端显式抛错
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log('🔍 开始执行标准文档 PDF 离线入库管线...');
  console.log('📄 PDF: ' + path.resolve(args.pdfPath));

  const result = await ingestStandard({
    pdfPath: args.pdfPath,
    outRoot: args.outRoot,
    force: args.force,
    onProgress: (msg) => console.log('  ▸ ' + msg),
  });

  if (result.status === 'MANUAL_REVIEW') {
    console.error('❌ 质量门禁未通过，已标记 MANUAL_REVIEW，未写入正式库:');
    result.issues.forEach((e) => console.error('  - [' + e.code + '] ' + e.message));
    console.error('📋 抽检报告: ' + result.reportPath);
    process.exit(1);
  }

  console.log('✅ 入库完成: ' + result.stdDir);
  if (result.validation) {
    console.log('📊 回归校验: 发现 ' + result.validation.totalStandards + ' 部标准，' + result.validation.totalSlices + ' 个规格切片，' + (result.validation.success ? '全部通过' : '存在错误'));
    if (!result.validation.success) {
      result.validation.errors.forEach((e) => console.error('  - ' + e));
      process.exit(1);
    }
  }
  console.log('📋 抽检报告: ' + result.reportPath);
}

main().catch((err) => {
  if (err instanceof GarbledTextLayerError) {
    console.error('❌ ' + err.message);
  } else if (err instanceof Error) {
    console.error('❌ 入库失败: ' + err.message);
  } else {
    console.error('❌ 入库失败: ' + String(err));
  }
  process.exit(1);
});
