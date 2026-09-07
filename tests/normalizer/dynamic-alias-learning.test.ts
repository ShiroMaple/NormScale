import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PropertyKeyNormalizer } from '@/normalizer/property-key-normalizer';
import { WorkflowEngine } from '@/workflow/workflow-engine';

describe('动态别名自学习与质检经验反哺闭环测试 (Phase 4)', () => {
  const tempStoragePath = path.resolve(process.cwd(), 'tests/test_learned_aliases_temp.json');

  beforeEach(() => {
    // 切换测试专用隔离文件路径并清空
    PropertyKeyNormalizer.initLearnedAliases(tempStoragePath);
    PropertyKeyNormalizer.clearLearnedAliases();
  });

  afterEach(() => {
    // 清理测试临时文件
    if (fs.existsSync(tempStoragePath)) {
      try {
        fs.unlinkSync(tempStoragePath);
      } catch {
        // ignore
      }
    }
    // 恢复默认
    PropertyKeyNormalizer.initLearnedAliases();
  });

  it('质检员确认的长尾别名成功注册并立即在 Tier 1 归一化中生效', () => {
    const rawUnknown = '特约非标微区抗剪切应力';

    // 1. 注册前：识别为未知沙箱项
    const beforeNorm = PropertyKeyNormalizer.normalize(rawUnknown);
    expect(beforeNorm.is_known).toBe(false);
    expect(beforeNorm.is_sandbox).toBe(true);

    // 2. 质检员确认并注册沉淀别名
    PropertyKeyNormalizer.registerLearnedAlias(
      rawUnknown,
      'shear_stress',
      'mechanical',
      '剪切应力',
      true
    );

    // 3. 注册后：无需 LLM 推断，直接以 O(1) 命中并识别为标准规范指标
    const afterNorm = PropertyKeyNormalizer.normalize(rawUnknown);
    expect(afterNorm.is_known).toBe(true);
    expect(afterNorm.property_key).toBe('shear_stress');
    expect(afterNorm.category).toBe('mechanical');
    expect(afterNorm.display_name).toBe('剪切应力');
    expect(afterNorm.is_learned).toBe(true);
  });

  it('沉淀的别名具备本地文件持久化能力，服务重启重新加载后依然命中', () => {
    const rawCustom = '供应商特约超声纵波微缺陷探伤';

    // 注册并持久化
    PropertyKeyNormalizer.registerLearnedAlias(
      rawCustom,
      'ultrasonic_test',
      'ndt',
      '超声检测',
      true
    );

    // 验证文件已被创建写入
    expect(fs.existsSync(tempStoragePath)).toBe(true);
    const content = fs.readFileSync(tempStoragePath, 'utf8');
    expect(content).toContain('供应商特约超声纵波微缺陷探伤');
    expect(content).toContain('ultrasonic_test');

    // 模拟应用重启重载
    PropertyKeyNormalizer.initLearnedAliases(tempStoragePath);
    const reloadNorm = PropertyKeyNormalizer.normalize(rawCustom);
    expect(reloadNorm.is_known).toBe(true);
    expect(reloadNorm.property_key).toBe('ultrasonic_test');
    expect(reloadNorm.category).toBe('ndt');
  });

  it('全链路端到端验证：HITL 人工确认属性映射后，下次相同质保书直通 Tier 1 Fast-Path', async () => {
    const engine = new WorkflowEngine();
    const sessionId = 'SES-LEARN-LOOP';
    const batchNoRound1 = 'BATCH-R1';
    const batchNoRound2 = 'BATCH-R2';

    // 构造包含未知力学项目的载荷
    const customPropName = '特约微区拉伸极限极限强度';
    const payloadRound1 = {
      header: {
        certificate_no: 'CERT-LOOP-01',
        declared_standard: 'GB/T 13296-2023',
        declared_grade: '06Cr19Ni10',
      },
      test_records: [
        { raw_property_name: 'C', raw_value: '0.04' },
        { raw_property_name: 'Cr', raw_value: '18.5' },
        { raw_property_name: 'Ni', raw_value: '8.2' },
        { raw_property_name: 'Rp0.2', raw_value: '220' },
        { raw_property_name: 'A', raw_value: '45' },
        // 未知力学属性，预期第一轮触发人机协同
        { raw_property_name: customPropName, raw_value: '560', raw_category: 'mechanical' },
      ],
    };

    // 第一轮：提交核验，因未识别该属性触发挂起
    const res1 = await engine.submitAudit(JSON.stringify(payloadRound1), {
      sessionId,
      batchNo: batchNoRound1,
    });

    expect(res1.status).toBe('suspended_hitl');
    expect(res1.hitlContext?.reason).toBe('PROPERTY_AMBIGUITY');

    // 质检员确认恢复：指定该属性映射至 tensile_strength
    const resumed = await engine.resumeAudit(res1.taskId, {
      corrected_property_keys: {
        [customPropName]: 'tensile_strength',
      },
    });

    expect(resumed.status).toBe('completed');

    // 第二轮：相同未收录属性再次提交核验
    const payloadRound2 = {
      ...payloadRound1,
      header: {
        ...payloadRound1.header,
        certificate_no: 'CERT-LOOP-02',
      },
    };

    const res2 = await engine.submitAudit(JSON.stringify(payloadRound2), {
      sessionId,
      batchNo: batchNoRound2,
    });

    // 核心验证：第二轮无需质检员介入，直接在 Tier 1 自动完成！
    expect(res2.status).toBe('completed');
    expect(res2.finalReport).toBeDefined();

    // 验证抗拉强度已正确评估
    const tsItem = res2.finalReport?.item_results.find((r: any) => r.property_key === 'tensile_strength');
    expect(tsItem).toBeDefined();
    expect(tsItem?.actual_value_text).toContain('560');
    expect(tsItem?.status).toBe('PASS');
  });
});
