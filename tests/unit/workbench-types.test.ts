import { describe, it, expect } from 'vitest';
import {
  formatHitlReasonBadge,
  StandardCatalogEmptyError,
  ScenarioSampleMissingError,
} from '@/components/workbench/types.ts';

describe('workbench/types 基础契约与工具函数测试', () => {
  describe('formatHitlReasonBadge', () => {
    it('应正确转换所有已知 HITL 挂起原因码', () => {
      expect(formatHitlReasonBadge('UNKNOWN_GRADE')).toBe('材料牌号待消歧');
      expect(formatHitlReasonBadge('PROPERTY_AMBIGUITY')).toBe('非标检验项目对齐');
      expect(formatHitlReasonBadge('ALTERNATIVE_CLAUSE')).toBe('替代条款合规确权');
      expect(formatHitlReasonBadge('MULTI_STANDARD_CONFLICT')).toBe('多标准互斥仲裁');
      expect(formatHitlReasonBadge('QUALITATIVE_AMBIGUITY')).toBe('定性条款语义争议');
    });

    it('对未知原因码或 undefined 应返回默认核实文案', () => {
      expect(formatHitlReasonBadge(undefined)).toBe('待人工核实确认');
      expect(formatHitlReasonBadge('SOMETHING_ELSE')).toBe('待人工核实确认');
      expect(formatHitlReasonBadge('')).toBe('待人工核实确认');
    });
  });

  describe('领域具名异常类验证', () => {
    it('StandardCatalogEmptyError 应具备正确名称与默认消息，并支持自定义消息', () => {
      const defaultErr = new StandardCatalogEmptyError();
      expect(defaultErr.name).toBe('StandardCatalogEmptyError');
      expect(defaultErr.message).toContain('标准规则库目录未初始化或为空');
      expect(defaultErr).toBeInstanceOf(Error);

      const customErr = new StandardCatalogEmptyError('自定义目录为空提示');
      expect(customErr.message).toBe('自定义目录为空提示');
    });

    it('ScenarioSampleMissingError 应具备正确名称与默认消息，并支持自定义消息', () => {
      const defaultErr = new ScenarioSampleMissingError();
      expect(defaultErr.name).toBe('ScenarioSampleMissingError');
      expect(defaultErr.message).toContain('测试用例原件或元数据缺失');
      expect(defaultErr).toBeInstanceOf(Error);

      const customErr = new ScenarioSampleMissingError('自定义用例缺失提示');
      expect(customErr.message).toBe('自定义用例缺失提示');
    });
  });
});
