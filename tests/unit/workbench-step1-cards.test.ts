import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { CachedDocsGrid } from '@/components/workbench/components/CachedDocsGrid.tsx';
import { ScenarioMatrixSection } from '@/components/workbench/components/ScenarioMatrixSection.tsx';
import { PresetSampleDto } from '@/lib/api-client.ts';

describe('Workbench Step 1 子卡片组件测试', () => {
  describe('CachedDocsGrid 历史缓存卡片列表', () => {
    it('应正确呈现缓存文档列表与 L1/L2 等级徽章', () => {
      const mockDocs = [
        { id: 'doc-1', filename: '质保书A.pdf', date: '2026/09/17', size: '1.2 MB', cacheLevel: 'L1' as const },
        { id: 'doc-2', filename: '质保书B.pdf', date: '2026/09/17', size: '2.5 MB', cacheLevel: 'L2' as const },
      ];

      const html = renderToString(
        React.createElement(CachedDocsGrid, {
          cachedDocs: mockDocs,
          onRestoreFromCache: vi.fn(),
          onDeleteCachedDoc: vi.fn(),
          onRefreshCachedDocs: vi.fn(),
        })
      );

      expect(html).toContain('历史已缓存文档');
      expect(html).toContain('质保书A.pdf');
      expect(html).toContain('L1 已解析');
      expect(html).toContain('质保书B.pdf');
      expect(html).toContain('L2 预处理');
      expect(html).toContain('2');
    });
  });

  describe('ScenarioMatrixSection 场景测试矩阵', () => {
    const mockSamples: PresetSampleDto[] = [
      {
        id: 'case-01',
        title: '06Cr19Ni10 正常承压无缝钢管',
        description: '标准化学与力学指标全项合规用例',
        category: '分层核验典型场景',
        expected_outcome: 'PASS',
        tier_flow: 'PASS 算法放行',
        declared_grade: '06Cr19Ni10',
        tags: ['NB/T 47019.5', '常温拉伸'],
      },
    ];

    it('折叠状态下应仅展示标题与展开按钮', () => {
      const html = renderToString(
        React.createElement(ScenarioMatrixSection, {
          scenarioSamples: mockSamples,
          isExpanded: false,
          onToggleExpand: vi.fn(),
          loadingScenarios: {},
          onLoadScenarioFile: vi.fn(),
        })
      );

      expect(html).toContain('典型场景测试用例');
      expect(html).toContain('个场景');
      expect(html).toContain('展开');
      expect(html).not.toContain('标准化学与力学指标全项合规用例');
    });

    it('展开状态下应展示用例卡片与装载按钮', () => {
      const html = renderToString(
        React.createElement(ScenarioMatrixSection, {
          scenarioSamples: mockSamples,
          isExpanded: true,
          onToggleExpand: vi.fn(),
          loadingScenarios: {},
          onLoadScenarioFile: vi.fn(),
        })
      );

      expect(html).toContain('典型场景测试用例');
      expect(html).toContain('收起');
      expect(html).toContain('06Cr19Ni10 正常承压无缝钢管');
      expect(html).toContain('一键装载');
    });
  });
});
