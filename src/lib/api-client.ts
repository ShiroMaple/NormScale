import { AuditReport } from '@/schemas/report.schema.ts';
import { HitlInterruptContext, HumanCorrectionInput, WorkflowOptions, PropertyResolutionCandidate, WorkflowTokenUsage } from '@/workflow/state.interface.ts';
import { RawCertificatePayload } from '@/extractor/extractor.interface.ts';

export interface StandardSliceOverviewDto {
  spec_key: string;
  primary_grade: string;
  unified_code?: string;
  display_name: string;
  aliases?: string[];
}

export interface StandardOverviewDto {
  standard_id: string;
  standard_name: string;
  version: string;
  status: string;
  slice_count: number;
  available_slices: string[];
  slice_details?: StandardSliceOverviewDto[];
}

export interface PresetSampleDto {
  id: string;
  title: string;
  category: string;
  declared_grade: string;
  expected_outcome: 'PASS' | 'FAIL' | 'AWAITING_HUMAN_REVIEW';
  description: string;
  tags: string[];
  md5?: string;
  tier_flow?: string;
  download_url?: string;
  filename?: string;
}

export interface AuditApiResponse {
  success: boolean;
  taskId: string;
  status: 'completed' | 'suspended_hitl' | 'failed';
  finalReport?: AuditReport;
  hitlContext?: HitlInterruptContext;
  error?: string;
  durationMs?: number;
  tokenUsage?: WorkflowTokenUsage;
}

/** 渐进式流式回调监听契约 */
export interface AuditStreamCallbacks {
  /** Tier 1 确定性规则大盘结果就绪 */
  onTier1Ready?: (data: {
    taskId: string;
    batchNo?: string;
    report: AuditReport;
    pendingProperties?: PropertyResolutionCandidate[];
    hasPending: boolean;
    durationMs?: number;
    tokenUsage?: WorkflowTokenUsage;
  }) => void;
  /** Tier 2 LLM 长尾消歧补丁就绪 */
  onTier2Patch?: (data: {
    taskId: string;
    batchNo?: string;
    finalReport: AuditReport;
    resolvedProperties?: PropertyResolutionCandidate[];
    durationMs?: number;
    tokenUsage?: WorkflowTokenUsage;
  }) => void;
  /** Tier 3 触发人机协同挂起 */
  onHitlInterrupt?: (data: {
    taskId: string;
    batchNo?: string;
    hitlContext: HitlInterruptContext;
    partialReport?: AuditReport;
    durationMs?: number;
    tokenUsage?: WorkflowTokenUsage;
  }) => void;
  /** 全流程核验完成 */
  onComplete?: (data: {
    taskId: string;
    batchNo?: string;
    finalReport: AuditReport;
    resolvedProperties?: any[];
    durationMs?: number;
    tokenUsage?: WorkflowTokenUsage;
  }) => void;
  /** 异常失败 */
  onError?: (err: {
    taskId: string;
    batchNo?: string;
    error: string;
    durationMs?: number;
  }) => void;
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

  /** 提交质保书核验任务 (常规同步/等待模式) */
  async submitAudit(params: {
    sampleId?: string;
    rawPayload?: RawCertificatePayload;
    batchSpecimen?: any;
    standardIds?: string[];
    gradeKey?: string;
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

  /** 提交质保书流式渐进核验任务 (SSE 渐进式流式模式) */
  async submitAuditStream(
    params: {
      sampleId?: string;
      rawPayload?: RawCertificatePayload;
      batchSpecimen?: any;
      standardIds?: string[];
      gradeKey?: string;
      options?: WorkflowOptions;
    },
    callbacks?: AuditStreamCallbacks,
    signal?: AbortSignal
  ): Promise<AuditApiResponse> {
    try {
      const res = await fetch('/api/audit/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, stream: true }),
        cache: 'no-store',
        signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        const errMsg = `请求失败 [${res.status}]: ${errText}`;
        callbacks?.onError?.({ taskId: '', error: errMsg });
        return { success: false, taskId: '', status: 'failed', error: errMsg };
      }

      if (!res.body) {
        const errMsg = '响应体为空，无法建立流式传输';
        callbacks?.onError?.({ taskId: '', error: errMsg });
        return { success: false, taskId: '', status: 'failed', error: errMsg };
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const finalResult: AuditApiResponse = {
        success: true,
        taskId: '',
        status: 'completed',
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const block of parts) {
          const trimmed = block.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.replace(/^data:\s*/, '');
          try {
            const event = JSON.parse(jsonStr);
            if (event.taskId) finalResult.taskId = event.taskId;
            if (typeof event.durationMs === 'number') finalResult.durationMs = event.durationMs;
            if (event.tokenUsage) finalResult.tokenUsage = event.tokenUsage;

            if (event.type === 'tier1_ready') {
              callbacks?.onTier1Ready?.(event);
              finalResult.finalReport = event.report;
            } else if (event.type === 'tier2_patch') {
              callbacks?.onTier2Patch?.(event);
              finalResult.finalReport = event.finalReport;
            } else if (event.type === 'hitl_interrupt') {
              callbacks?.onHitlInterrupt?.(event);
              finalResult.status = 'suspended_hitl';
              finalResult.hitlContext = event.hitlContext;
              if (event.partialReport && !finalResult.finalReport) {
                finalResult.finalReport = event.partialReport;
              }
            } else if (event.type === 'complete') {
              callbacks?.onComplete?.(event);
              finalResult.status = 'completed';
              finalResult.finalReport = event.finalReport;
            } else if (event.type === 'error') {
              callbacks?.onError?.(event);
              finalResult.status = 'failed';
              finalResult.error = event.error;
              finalResult.success = false;
            }
          } catch (parseErr) {
            console.error('[submitAuditStream] JSON 解析异常:', parseErr, jsonStr);
          }
        }
      }

      return finalResult;
    } catch (streamErr: unknown) {
      if (signal?.aborted) {
        return { success: false, taskId: '', status: 'failed', error: '请求已取消' };
      }
      const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
      callbacks?.onError?.({ taskId: '', error: errMsg });
      return { success: false, taskId: '', status: 'failed', error: errMsg };
    }
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
