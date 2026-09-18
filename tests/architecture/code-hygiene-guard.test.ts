import { describe, it, expect } from 'vitest';
import path from 'path';
import { auditCodeHygiene, HYGIENE_RULES } from '../../scripts/audit-code-hygiene.ts';

describe('架构防腐与代码纯洁度门禁测试 (Architecture & Anti-Mock Guard)', () => {
  it('src/ 源码目录必须保持 100% 纯洁，严禁存在任何伪造及格、假冒标准、写死置信度或特定样本泄漏', () => {
    const srcDir = path.join(process.cwd(), 'src');
    // 仅允许明确作为前端体验展示用例的 samples 路由除外
    const allowed = ['src/app/api/samples/route.ts'];

    const violations = auditCodeHygiene(srcDir, allowed);

    if (violations.length > 0) {
      const report = violations
        .map(v => `  - [${v.patternName}] ${v.file}:${v.line} -> ${v.snippet}`)
        .join('\n');
      expect.fail(
        `🚨 发现 ${violations.length} 处违反代码卫生与反伪造规则的代码！\n` +
        `根据工程红线规范，严禁在 src/ 引入任何伪造及格兜底、假冒国标/牌号、特定企业样本数据或虚假高置信度。\n` +
        `违规清单如下：\n${report}`
      );
    }

    expect(violations).toHaveLength(0);
  });

  it('所有已定义的反伪造审计规则均有效且已激活', () => {
    expect(HYGIENE_RULES.length).toBeGreaterThanOrEqual(5);
    const ruleNames = HYGIENE_RULES.map(r => r.name);
    expect(ruleNames).toContain('FAKE_PASS_FALLBACK');
    expect(ruleNames).toContain('FAKE_STANDARD_FALLBACK');
    expect(ruleNames).toContain('FAKE_GRADE_FALLBACK');
    expect(ruleNames).toContain('SAMPLE_SPECIFIC_LEAK');
    expect(ruleNames).toContain('FAKE_CONFIDENCE_LITERAL');
  });
});
