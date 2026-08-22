import fs from 'node:fs';
import path from 'node:path';
import { StandardMetaSchema, SpecificationSliceSchema, StandardRuleSetSchema } from '../schemas/standard.schema';

export function validateAllStandards(standardsDir?: string): { success: boolean; totalStandards: number; totalSlices: number; errors: string[] } {
  const baseDir = standardsDir || path.resolve(process.cwd(), 'data/standards');
  const errors: string[] = [];
  let totalStandards = 0;
  let totalSlices = 0;

  if (!fs.existsSync(baseDir)) {
    return { success: false, totalStandards: 0, totalSlices: 0, errors: ['Standards directory does not exist: ' + baseDir] };
  }

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);

    if (entry.isDirectory()) {
      totalStandards++;
      const metaPath = path.join(fullPath, 'meta.json');
      if (!fs.existsSync(metaPath)) {
        errors.push('[' + entry.name + '] 缺少 meta.json');
        continue;
      }

      try {
        const metaContent = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        StandardMetaSchema.parse(metaContent);
      } catch (err) {
        errors.push('[' + entry.name + '/meta.json] Schema 校验失败: ' + String(err));
      }

      const slicesDir = path.join(fullPath, 'slices');
      if (fs.existsSync(slicesDir)) {
        const sliceFiles = fs.readdirSync(slicesDir).filter(f => f.endsWith('.json'));
        const seenRuleIds = new Set<string>();

        for (const sf of sliceFiles) {
          totalSlices++;
          const slicePath = path.join(slicesDir, sf);
          try {
            const sliceContent = JSON.parse(fs.readFileSync(slicePath, 'utf8'));
            const slice = SpecificationSliceSchema.parse(sliceContent);

            for (const r of slice.evaluation_rules) {
              if (seenRuleIds.has(r.rule_id)) {
                errors.push('[' + entry.name + '/' + sf + '] 规则 ID 重复: ' + r.rule_id);
              }
              seenRuleIds.add(r.rule_id);
            }
          } catch (err) {
            errors.push('[' + entry.name + '/slices/' + sf + '] Schema 校验失败: ' + String(err));
          }
        }
      }
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      totalStandards++;
      try {
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        StandardRuleSetSchema.parse(content);
      } catch (err) {
        errors.push('[' + entry.name + '] 单体标准 Schema 校验失败: ' + String(err));
      }
    }
  }

  return {
    success: errors.length === 0,
    totalStandards,
    totalSlices,
    errors,
  };
}

if (typeof require !== 'undefined' && require.main === module) {
  console.log('🔍 开始执行标准规则库强类型与完整性离线校验...');
  const res = validateAllStandards();
  console.log('📊 校验统计: 发现 ' + res.totalStandards + ' 部标准，' + res.totalSlices + ' 个规格切片');

  if (res.success) {
    console.log('✅ 所有标准规则元数据与规格切片 100% 通过 Zod Schema 契约校验！');
    process.exit(0);
  } else {
    console.error('❌ 发现以下校验错误:');
    res.errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  }
}