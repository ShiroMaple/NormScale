import { AuditReport } from '@/schemas/report.schema.ts';
import { HitlInterruptContext, HumanCorrectionInput, WorkflowOptions } from '@/workflow/state.interface.ts';
import { RawCertificatePayload } from '@/extractor/extractor.interface.ts';

export interface StandardOverviewDto {
  standard_id: string;
  standard_name: string;
  version: string;
  status: string;
  slice_count: number;
  available_slices: string[];
}

export interface PresetSampleDto {
  id: string;
  title: string;
  category: string;
  declared_grade: string;
  expected_outcome: 'PASS' | 'FAIL' | 'AWAITING_HUMAN_REVIEW';
  description: string;
  tags: string[];
}

export interface AuditApiResponse {
  success: boolean;
  taskId: string;
  status: 'completed' | 'suspended_hitl' | 'failed';
  finalReport?: AuditReport;
  hitlContext?: HitlInterruptContext;
  error?: string;
}

/**
 * ============================================================================
 * 前端 API 交互客户端 (Type-Safe Frontend API Client)
 * ============================================================================
 */
export const apiClient = {
  /** 获取标准规则库概览 */
  async getStandards(): Promise<{ total_standards: number; total_slices: number; standards: StandardOverviewDto[] }> {
    const res = await fetch('/api/standards', { cache: 'no-store' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '获取标准列表失败');
    return json.data;
  },

  /** 获取预设测试样本列表 */
  async getSamples(): Promise<PresetSampleDto[]> {
    const res = await fetch('/api/samples', { cache: 'no-store' });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || '获取样本列表失败');
    return json.data;
  },

  /** 提交质保书核验任务 */
  async submitAudit(params: {
    sampleId?: string;
    rawPayload?: RawCertificatePayload;
    options?: WorkflowOptions;
  }): Promise<AuditApiResponse> {
    const res = await fetch('/api/audit/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      cache: 'no-store',
    });
    const json = await res.json();
    return json;
  },

  /** 恢复挂起的任务 (质检员提交人工修正) */
  async resumeAudit(taskId: string, correction: HumanCorrectionInput): Promise<AuditApiResponse> {
    const res = await fetch(`/api/audit/resume/${encodeURIComponent(taskId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(correction),
      cache: 'no-store',
    });
    const json = await res.json();
    return json;
  },

  /** 查询任务状态快照 */
  async getTaskStatus(taskId: string): Promise<AuditApiResponse> {
    const res = await fetch(`/api/audit/status/${encodeURIComponent(taskId)}`, {
      cache: 'no-store',
    });
    const json = await res.json();
    return json;
  },
};
