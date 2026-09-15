import fs from 'node:fs';
import path from 'node:path';
import { ingestStandard, GarbledTextLayerError } from '../src/ingestion/ingest-pipeline.ts';
import { promoteStaging, PromoteError } from '../src/ingestion/promote.ts';

/* ==========================================================================
   标准文档 PDF 离线入库 CLI
   用法:
     node --experimental-strip-types scripts/ingest-standard.ts <pdf路径> [--out <正式库根>] [--staging-root <暂存根>] [--families <族,…>] [--force]
       —— 执行 S0-S4 管线，产物只写 staging（缺省 .cache/standard-ingest/staging/<STD_DIR>/），不触碰正式库
       —— --families 显式声明提取规则族（逗号分隔，如 chemical,mechanical），缺省 v2 全量七族
     node --experimental-strip-types scripts/ingest-standard.ts --promote <STD_DIR 或 staging 路径> [--out <正式库根>] [--force]
       —— 将 staging 产物晋级正式库：已存在标准走按规则族合并 + no-net-loss 门禁，
          净减须 --force 显式确认；完成门禁（validateAllStandards + 数据敏感测试套件）不过自动回滚
   - 脚本及其依赖链仅使用相对路径 + 显式 .ts 扩展名 import（Node type stripping 要求）
   - 默认正式库根 data/standards；--out 可指向临时目录（验证严禁覆盖已入库数据）
   ========================================================================== */

interface CliArgs {
  mode: 'ingest' | 'promote';
  pdfPath: string;
  promotePath?: string;
  outRoot?: string;
  stagingRoot?: string;
  families?: string[];
  force: boolean;
}

const USAGE =
  '用法:\n' +
  '  node --experimental-strip-types scripts/ingest-standard.ts <pdf路径> [--out <正式库根>] [--staging-root <暂存根>] [--families <族,…>] [--force]\n' +
  '  node --experimental-strip-types scripts/ingest-standard.ts --promote <STD_DIR 或 staging 路径> [--out <正式库根>] [--force]';

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { mode: 'ingest', pdfPath: '', force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--promote') {
      args.mode = 'promote';
      args.promotePath = argv[++i];
      if (!args.promotePath) {
        throw new Error('--promote 需要参数（STD_DIR 或 staging 路径）');
      }
    } else if (arg === '--out') {
      args.outRoot = argv[++i];
    } else if (arg === '--staging-root') {
      args.stagingRoot = argv[++i];
    } else if (arg === '--families') {
      const raw = argv[++i];
      if (!raw) {
        throw new Error('--families 需要参数（逗号分隔的规则族，如 chemical,mechanical）');
      }
      args.families = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
      if (args.families.length === 0) {
        throw new Error('--families 参数解析后为空（逗号分隔的规则族，如 chemical,mechanical）');
      }
    } else if (arg === '--force') {
      args.force = true;
    } else if (!arg.startsWith('--') && args.pdfPath.length === 0) {
      args.pdfPath = arg;
    } else {
      throw new Error(`无法识别的参数: ${arg}`);
    }
  }
  if (args.mode === 'ingest' && args.pdfPath.length === 0) {
    throw new Error(`缺少 PDF 路径参数。\n${USAGE}`);
  }
  if (args.mode === 'ingest' && args.promotePath) {
    throw new Error('--promote 与 PDF 路径参数互斥');
  }
  return args;
}

/**
 * 解析 --promote 目标：优先按既有目录路径（含 meta.json）解析，否则按 STD_DIR 名在 staging 根下查找
 */
function resolveStagingDir(promotePath: string, stagingRoot: string): string {
  const direct = path.resolve(promotePath);
  if (fs.existsSync(path.join(direct, 'meta.json'))) {
    return direct;
  }
  const named = path.join(stagingRoot, promotePath);
  if (fs.existsSync(path.join(named, 'meta.json'))) {
    return named;
  }
  const available = fs.existsSync(stagingRoot) ? fs.readdirSync(stagingRoot).join(', ') : '（staging 根目录不存在）';
  throw new Error(`无法定位 staging 产物: ${promotePath}\n  已尝试: ${direct}\n        ${named}\n  staging 可用产物: ${available}`);
}

// 加载 .env（仅判断存在性，KIMI_API_KEY 等由默认聊天客户端解析，不读取打印）
try {
  if (fs.existsSync(path.join(process.cwd(), '.env')) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch {
  // .env 加载失败不阻断：密钥缺失时由 LLM 客户端显式抛错
}

async function runIngest(args: CliArgs): Promise<void> {
  console.log('🔍 开始执行标准文档 PDF 离线入库管线...');
  console.log('📄 PDF: ' + path.resolve(args.pdfPath));

  const result = await ingestStandard({
    pdfPath: args.pdfPath,
    outRoot: args.outRoot,
    stagingRoot: args.stagingRoot,
    declaredFamilies: args.families,
    force: args.force,
    onProgress: (msg) => console.log('  ▸ ' + msg),
  });

  if (result.status === 'MANUAL_REVIEW') {
    console.error('❌ 质量门禁未通过，已标记 MANUAL_REVIEW，未写入 staging/正式库:');
    result.issues.forEach((e) => console.error('  - [' + e.code + '] ' + e.message));
    console.error('📋 抽检报告: ' + result.reportPath);
    process.exit(1);
  }

  console.log('✅ staging 落盘完成: ' + result.stagingDir);
  console.log('📋 抽检报告: ' + result.reportPath);
  console.log('⚠️  正式库未触碰。复核无误后执行显式晋级:');
  console.log('    node --experimental-strip-types scripts/ingest-standard.ts --promote ' + result.stagingDir + (args.outRoot ? ' --out ' + args.outRoot : '') + (args.force ? ' --force' : ''));
}

function runPromote(args: CliArgs): void {
  const stagingRoot = args.stagingRoot || path.resolve(process.cwd(), '.cache/standard-ingest/staging');
  const stagingDir = resolveStagingDir(args.promotePath!, stagingRoot);
  console.log('🚀 开始 staging 晋级正式库: ' + stagingDir);

  const result = promoteStaging({
    stagingDir,
    outRoot: args.outRoot,
    force: args.force,
    onProgress: (msg) => console.log('  ▸ ' + msg),
  });

  if (result.fresh) {
    console.log('✅ 全新标准入库完成: ' + result.stdDir);
  } else {
    console.log('✅ 晋级完成: ' + result.stdDir + (result.mergedFamilies.length > 0 ? `（按规则族合并: ${result.mergedFamilies.join('/')}）` : ''));
  }
  if (result.diff) {
    console.log(`📊 与存量规则级全量 diff: 新增 ${result.diff.added.length} / 丢失 ${result.diff.lost.length} / 变更 ${result.diff.changed.length}`);
    if (result.diff.lost.length > 0) {
      result.diff.lost.forEach((e) => console.warn('  - ' + e.detail));
    }
  }
  if (result.forced) {
    console.warn('⚠️  no-net-loss 净减经 --force 放行，已在 meta 记录 forced 标记，请人工复核丢失项。');
  }
  console.log('📊 回归校验: 发现 ' + result.validation.totalStandards + ' 部标准，' + result.validation.totalSlices + ' 个规格切片，' + (result.validation.success ? '全部通过' : '存在错误'));
  console.log('📊 数据敏感套件: 退出码 ' + result.dataSensitiveTests.code + '（输出 tail 见上）');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'ingest') {
    await runIngest(args);
  } else {
    runPromote(args);
  }
}

main().catch((err) => {
  if (err instanceof GarbledTextLayerError) {
    console.error('❌ ' + err.message);
  } else if (err instanceof PromoteError) {
    console.error('❌ promote 被拒绝: ' + err.message);
  } else if (err instanceof Error) {
    console.error('❌ 入库失败: ' + err.message);
  } else {
    console.error('❌ 入库失败: ' + String(err));
  }
  process.exit(1);
});
