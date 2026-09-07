import { MemorySaver, Command } from '@langchain/langgraph';
import { buildAuditStateGraph, AuditGraphDependencies } from './audit-graph.ts';
import { QualityAuditState, WorkflowOptions, HumanCorrectionInput, HitlInterruptContext, PropertyResolutionCandidate } from './state.interface.ts';
import { AuditReport } from '../schemas/report.schema.ts';
import { MemoryTraceCollector } from '../logger/trace-collector.ts';
import { logger } from '../logger/index.ts';

export interface WorkflowExecutionResult {
  /** 任务唯一标识 */
  taskId: string;
  /** 执行最终状态 */
  status: 'completed' | 'suspended_hitl' | 'failed';
  /** 若执行完成，返回完整的核验报告 */
  finalReport?: AuditReport;
  /** 若触发了人机协同挂起，返回挂起提示与待核实上下文 */
  hitlContext?: HitlInterruptContext;
  /** 错误信息 */
  error?: string;
}

/** 渐进式流式事件契约 (Progressive Stream Events) */
export type WorkflowStreamEvent =
  | {
      type: 'tier1_ready';
      taskId: string;
      batchNo?: string;
      report: AuditReport;
      pendingProperties?: PropertyResolutionCandidate[];
      hasPending: boolean;
    }
  | {
      type: 'tier2_patch';
      taskId: string;
      batchNo?: string;
      finalReport: AuditReport;
      resolvedProperties?: PropertyResolutionCandidate[];
    }
  | {
      type: 'hitl_interrupt';
      taskId: string;
      batchNo?: string;
      hitlContext: HitlInterruptContext;
      partialReport?: AuditReport;
    }
  | {
      type: 'complete';
      taskId: string;
      batchNo?: string;
      finalReport: AuditReport;
    }
  | {
      type: 'error';
      taskId: string;
      batchNo?: string;
      error: string;
    };

/**
 * ============================================================================
 * NormScale 质检工作流调度总控引擎 (Workflow Engine Facade)
 * ============================================================================
 * 
 * 职责：对外部业务层提供开箱即用的高层门面 API：
 * 1. `submitAudit()`: 提交质保证书执行异步/同步核验；
 * 2. `resumeAudit()`: 针对 HITL 挂起的质检任务提交质检员人工修正并恢复执行；
 * 3. `getTaskState()`: 查询指定任务当前的状态机快照。
 * ============================================================================
 */
export class WorkflowEngine {
  private graph: ReturnType<typeof buildAuditStateGraph>;
  private checkpointer: MemorySaver;

  constructor(deps?: AuditGraphDependencies) {
    this.checkpointer = deps?.checkpointer || new MemorySaver();
    this.graph = buildAuditStateGraph({
      ...deps,
      checkpointer: this.checkpointer,
    });
  }

  /**
   * 提交质保书核验任务
   */
  public async submitAudit(
    input: Buffer | Uint8Array | string,
    options?: WorkflowOptions
  ): Promise<WorkflowExecutionResult> {
    // 构造具备会话与批次物理隔离特性的唯一线程标识 (Session-Batch Thread Isolation)
    const threadId = (options?.sessionId && options?.batchNo)
      ? `${options.sessionId}::${options.batchNo}`
      : (options?.contextId || `TASK-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    const taskId = threadId;
    const collector = new MemoryTraceCollector(taskId);

    logger.info('WORKFLOW', `[WorkflowEngine] 接收到质保书核验任务 [${taskId}]，开始进入 LangGraph 状态图...`);

    const initialState: Partial<QualityAuditState> = {
      taskId,
      input,
      options,
      workflowStatus: 'initialized',
      collector,
    };

    const config = { configurable: { thread_id: taskId } };

    try {
      const finalState = await this.graph.invoke(initialState as any, config);

      // 检查 LangGraph 的 __interrupt__ 机制或 stateSnapshot
      const rawInterrupts = (finalState as any)?.__interrupt__;
      if (Array.isArray(rawInterrupts) && rawInterrupts.length > 0) {
        const hitlVal = rawInterrupts[0]?.value as HitlInterruptContext;
        logger.warn('WORKFLOW', `[WorkflowEngine] 任务 [${taskId}] 已在人机协同断点处安全挂起: ${hitlVal?.prompt_message}`);
        return {
          taskId,
          status: 'suspended_hitl',
          hitlContext: hitlVal,
        };
      }

      // 检查快照中的 interrupts
      const snapshot = await this.graph.getState(config);
      const taskInterrupts = snapshot?.tasks?.[0]?.interrupts;
      if (Array.isArray(taskInterrupts) && taskInterrupts.length > 0) {
        const hitlVal = taskInterrupts[0]?.value as HitlInterruptContext;
        logger.warn('WORKFLOW', `[WorkflowEngine] 任务 [${taskId}] 已在人机协同断点处安全挂起: ${hitlVal?.prompt_message}`);
        return {
          taskId,
          status: 'suspended_hitl',
          hitlContext: hitlVal,
        };
      }

      if (finalState.error) {
        return {
          taskId,
          status: 'failed',
          error: finalState.error,
        };
      }

      return {
        taskId,
        status: 'completed',
        finalReport: finalState.finalReport,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('WORKFLOW', `[WorkflowEngine] 任务 [${taskId}] 执行异常失败`, err);
      return {
        taskId,
        status: 'failed',
        error: errMsg,
      };
    }
  }

  /**
   * 提交质保书流式渐进核验任务 (Tier 1 秒级直出 -> Tier 2 增量补丁 -> Tier 3 人机协同)
   */
  public async *streamAudit(
    input: Buffer | Uint8Array | string,
    options?: WorkflowOptions
  ): AsyncGenerator<WorkflowStreamEvent> {
    const threadId = (options?.sessionId && options?.batchNo)
      ? `${options.sessionId}::${options.batchNo}`
      : (options?.contextId || `TASK-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    const taskId = threadId;
    const batchNo = options?.batchNo;
    const collector = new MemoryTraceCollector(taskId);

    logger.info('WORKFLOW', `[WorkflowEngine] 启动流式渐进式核验任务 [${taskId}]...`);

    const initialState: Partial<QualityAuditState> = {
      taskId,
      input,
      options,
      workflowStatus: 'initialized',
      collector,
    };

    const config = { configurable: { thread_id: taskId } };

    try {
      let tier1Emitted = false;
      let lastReport: AuditReport | undefined;
      let pendingProps: PropertyResolutionCandidate[] | undefined;
      let resolvedProps: PropertyResolutionCandidate[] | undefined;

      const eventStream = await this.graph.stream(initialState as any, {
        ...config,
        streamMode: 'updates',
      });

      for await (const chunk of eventStream) {
        const nodeName = Object.keys(chunk)[0];
        if (!nodeName) continue;
        const update = (chunk as Record<string, any>)[nodeName];
        if (!update) continue;

        if (update.unresolvedProperties) {
          pendingProps = update.unresolvedProperties;
        }
        if (update.resolvedProperties) {
          resolvedProps = update.resolvedProperties;
        }
        if (update.finalReport) {
          lastReport = update.finalReport;
        }

        // 当 deterministic_eval 节点产生核验报告
        if (nodeName === 'deterministic_eval' && lastReport) {
          if (!tier1Emitted) {
            tier1Emitted = true;
            const hasPending = Boolean(pendingProps && pendingProps.length > 0);
            yield {
              type: 'tier1_ready',
              taskId,
              batchNo,
              report: lastReport,
              pendingProperties: pendingProps,
              hasPending,
            };
          } else {
            // 第二次经过 deterministic_eval (Tier 2 消歧后的增量核验)
            yield {
              type: 'tier2_patch',
              taskId,
              batchNo,
              finalReport: lastReport,
              resolvedProperties: resolvedProps,
            };
          }
        }

        // 检查人机协同挂起
        if (update.hitlContext) {
          yield {
            type: 'hitl_interrupt',
            taskId,
            batchNo,
            hitlContext: update.hitlContext,
            partialReport: lastReport,
          };
          return;
        }
      }

      // stream 迭代结束后，检查快照中的中断
      const snapshot = await this.graph.getState(config);
      const taskInterrupts = snapshot?.tasks?.[0]?.interrupts;
      if (Array.isArray(taskInterrupts) && taskInterrupts.length > 0) {
        const hitlVal = taskInterrupts[0]?.value as HitlInterruptContext;
        yield {
          type: 'hitl_interrupt',
          taskId,
          batchNo,
          hitlContext: hitlVal,
          partialReport: lastReport,
        };
        return;
      }

      // 如果尚未发射 tier1_ready（例如无长尾项一次性直接跑完），先补发 tier1_ready
      const finalReport = snapshot?.values?.finalReport || lastReport;
      if (!tier1Emitted && finalReport) {
        yield {
          type: 'tier1_ready',
          taskId,
          batchNo,
          report: finalReport,
          pendingProperties: [],
          hasPending: false,
        };
      }

      if (finalReport) {
        yield {
          type: 'complete',
          taskId,
          batchNo,
          finalReport,
        };
      } else {
        yield {
          type: 'error',
          taskId,
          batchNo,
          error: snapshot?.values?.error || '未能生成最终核验报告',
        };
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('WORKFLOW', `[WorkflowEngine] 流式任务 [${taskId}] 发生异常`, err);
      yield {
        type: 'error',
        taskId,
        batchNo,
        error: errMsg,
      };
    }
  }

  /**
   * 恢复挂起的质检任务（质检员提交人工修正数据）
   */
  public async resumeAudit(
    taskId: string,
    correction: HumanCorrectionInput
  ): Promise<WorkflowExecutionResult> {
    logger.info('WORKFLOW', `[WorkflowEngine] 正在恢复挂起的质检任务 [${taskId}]...`);
    const config = { configurable: { thread_id: taskId } };

    try {
      // 通过 Command 恢复中断节点并注入用户修正数据
      const resumedState = await this.graph.invoke(
        new Command({
          resume: correction,
        }),
        config
      );

      // 检查恢复后是否再次被中断
      const rawInterrupts = (resumedState as any)?.__interrupt__;
      if (Array.isArray(rawInterrupts) && rawInterrupts.length > 0) {
        const hitlVal = rawInterrupts[0]?.value as HitlInterruptContext;
        return {
          taskId,
          status: 'suspended_hitl',
          hitlContext: hitlVal,
        };
      }

      if (resumedState.error) {
        return {
          taskId,
          status: 'failed',
          error: resumedState.error,
        };
      }

      logger.info(
        'WORKFLOW',
        `[WorkflowEngine] 任务 [${taskId}] 恢复执行成功，最终结论 [${resumedState.finalReport?.summary?.overall_status || '未知'}]`
      );

      return {
        taskId,
        status: 'completed',
        finalReport: resumedState.finalReport,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error('WORKFLOW', `[WorkflowEngine] 恢复任务 [${taskId}] 失败`, err);
      return {
        taskId,
        status: 'failed',
        error: errMsg,
      };
    }
  }

  /**
   * 查询指定任务的当前状态快照
   */
  public async getTaskState(taskId: string): Promise<QualityAuditState | undefined> {
    const config = { configurable: { thread_id: taskId } };
    const snapshot = await this.graph.getState(config);
    return snapshot?.values as QualityAuditState | undefined;
  }
}
