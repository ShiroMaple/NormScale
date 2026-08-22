import { describe, it, expect, beforeAll } from 'vitest';
import { WorkflowEngine } from '@/workflow/workflow-engine';
import { FileRuleStore } from '@/repository/file-rule-store';
import { ClauseStore } from '@/repository/clause-store';
import { MockCertificateExtractor } from '@/extractor/mock-extractor';

describe('WorkflowEngine 调度总控引擎功能测试', () => {
  let engine: WorkflowEngine;

  beforeAll(() => {
    engine = new WorkflowEngine({
      ruleStore: new FileRuleStore(),
      clauseStore: new ClauseStore(),
      extractor: new MockCertificateExtractor(),
    });
  });

  it('支持获取任务运行状态快照 (getTaskState)', async () => {
    const taskId = 'TASK-STATE-QUERY-001';
    await engine.submitAudit('s30408_messy_sample', { contextId: taskId });

    const state = await engine.getTaskState(taskId);
    expect(state).toBeDefined();
    expect(state?.taskId).toBe(taskId);
    expect(state?.normalizedCert).toBeDefined();
    expect(state?.finalReport).toBeDefined();
  });

  it('支持 skipSemanticReview 配置跳过语义条款复核', async () => {
    const result = await engine.submitAudit('s30408_messy_sample', {
      skipSemanticReview: true,
    });

    expect(result.status).toBe('completed');
    expect(result.finalReport).toBeDefined();
  });

  it('对未收录的不存在标准安全返回 failed 状态', async () => {
    const result = await engine.submitAudit('s30408_messy_sample', {
      forcedStandardId: 'NON_EXISTENT_STD_2099',
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('未收录标准');
  });
});
