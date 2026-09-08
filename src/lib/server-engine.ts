import { WorkflowEngine } from '../workflow/workflow-engine.ts';
import { FileRuleStore } from '../repository/file-rule-store.ts';
import { ClauseStore } from '../repository/clause-store.ts';
import { MemorySaver } from '@langchain/langgraph';

/**
 * ============================================================================
 * 服务端工作流与规则仓库单例容器 (Server Singleton Container)
 * ============================================================================
 * 
 * 职责：在 Next.js 服务端进程中持久维护状态图 Checkpointer 与规则仓库缓存。
 * 注：服务端主链路消费由前端/离线解析后经 submit 直传的结构化数据，不注入任何 Mock 伪造提取器。
 * ============================================================================
 */

// 全局内存 Checkpointer (支持长连接任务挂起与跨 HTTP 路由恢复)
const globalCheckpointer = new MemorySaver();
const globalRuleStore = new FileRuleStore();
const globalClauseStore = new ClauseStore();

export const serverWorkflowEngine = new WorkflowEngine({
  ruleStore: globalRuleStore,
  clauseStore: globalClauseStore,
  checkpointer: globalCheckpointer,
});

export const serverRuleStore = globalRuleStore;
export const serverClauseStore = globalClauseStore;
