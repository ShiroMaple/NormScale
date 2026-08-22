import { MemorySaver, Command } from '@langchain/langgraph';
import { buildAuditStateGraph, AuditGraphDependencies } from './audit-graph';
import { QualityAuditState, WorkflowOptions, HumanCorrectionInput, HitlInterruptContext } from './state.interface';
import { AuditReport } from '../schemas/report.schema';
import { MemoryTraceCollector } from '../logger/trace-collector';
import { logger } from '../logger';

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
    const taskId = options?.contextId || `TASK-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
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
