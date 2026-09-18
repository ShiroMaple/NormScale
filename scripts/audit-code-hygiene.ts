import fs from 'fs';
import path from 'path';

export interface HygieneViolation {
  file: string;
  line: number;
  patternName: string;
  matchedText: string;
  snippet: string;
}

interface HygieneRule {
  name: string;
  description: string;
  regex: RegExp;
  ignoreComments?: boolean;
}

export const HYGIENE_RULES: HygieneRule[] = [
  {
    name: 'FAKE_PASS_FALLBACK',
    description: '使用 || 或 ?? 兜底默认判定为 PASS（掩耳盗铃虚假及格）',
    regex: /(?:\|\||\?\?)\s*['"]PASS['"]/,
  },
  {
    name: 'FAKE_STANDARD_FALLBACK',
    description: '使用 || 或 ?? 兜底冒充 GB/T 13296 国标',
    regex: /(?:\|\||\?\?)\s*['"]GB\/T\s*13296/,
  },
  {
    name: 'FAKE_GRADE_FALLBACK',
    description: '使用 || 或 ?? 兜底冒充 06Cr19Ni10 牌号',
    regex: /(?:\|\||\?\?)\s*['"]06Cr19Ni10/,
  },
  {
    name: 'SAMPLE_SPECIFIC_LEAK',
    description: '生产源码中包含特定质保书样本标识 (ZPJE / Z26022C / 镇海石化)',
    regex: /\b(ZPJE|Z26022C|镇海石化)\b/,
  },
  {
    name: 'FAKE_CONFIDENCE_LITERAL',
    description: '生产代码中硬编码伪造高置信度 (如 0.95 或 98%)',
    regex: /(?:overall_confidence:\s*0\.9\d*|['"]confidence['"]\s*:\s*['"]9\d%['"])/,
  },
];

/**
 * 递归扫描指定目录下的所有 TS/TSX 文件
 */
export function scanDirectory(
  dir: string,
  ignoredDirs: string[] = ['node_modules', '.next', 'tests', 'data', 'scratch', 'public', '.git']
): string[] {
  const files: string[] = [];

  function traverse(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirs.includes(entry.name)) {
          traverse(fullPath);
        }
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

/**
 * 执行代码卫生审计
 */
export function auditCodeHygiene(targetDir: string, allowedFiles: string[] = []): HygieneViolation[] {
  const files = scanDirectory(targetDir);
  const violations: HygieneViolation[] = [];

  for (const file of files) {
    const relPath = path.relative(process.cwd(), file).replace(/\\/g, '/');
    if (allowedFiles.some(af => relPath.endsWith(af) || relPath === af)) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const trimmed = line.trim();

      // 忽略纯单行注释（以 // 开头）
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      for (const rule of HYGIENE_RULES) {
        if (rule.regex.test(line)) {
          violations.push({
            file: relPath,
            line: i + 1,
            patternName: rule.name,
            matchedText: line.match(rule.regex)?.[0] || '',
            snippet: trimmed,
          });
        }
      }
    }
  }

  return violations;
}

import { fileURLToPath } from 'url';

// CLI 直接执行入口
function runCli() {
  console.log('🔍 开始对 src/ 目录执行全量代码纯洁度与反伪造审计...');
  const srcDir = path.join(process.cwd(), 'src');
  // 允许前端展示演示样本的 API 路由除外
  const allowed = ['src/app/api/samples/route.ts'];
  const results = auditCodeHygiene(srcDir, allowed);

  if (results.length === 0) {
    console.log('✅ 审计通过！src/ 源码目录中未发现任何硬编码假数据、特定样本泄漏或虚假及格兜底。');
  } else {
    console.warn(`🚨 发现 ${results.length} 处代码卫生违规项！清单如下：\n`);
    for (const v of results) {
      console.warn(`- [${v.patternName}] ${v.file}:${v.line}`);
      console.warn(`  违规内容: ${v.snippet}`);
    }
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli();
}
