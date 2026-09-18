import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { HitlDrawer } from '@/components/HitlDrawer.tsx';

describe('HitlDrawer 人机协同干预抽屉单元测试', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    taskId: 'TK-TEST-001',
    hitlContext: {
      reason: 'UNKNOWN_GRADE' as const,
      prompt_message: '未识别的材料牌号',
      candidate_grades: [
        { id: '06Cr19Ni10', code: '06Cr19Ni10', standard: 'GB/T 13296-2023', match: '98%' },
      ],
    },
    onSubmitResume: vi.fn().mockResolvedValue(undefined),
    isSubmitting: false,
  };

  it('渲染抽屉时包含标题、候选牌号与确认恢复流转按钮', () => {
    const html = renderToString(React.createElement(HitlDrawer, defaultProps));
    expect(html).toBeTruthy();
    expect(html).toContain('确认并恢复流转');
    expect(html).toContain('06Cr19Ni10');
  });
});
