import { WorkflowEngine } from '../workflow/workflow-engine.ts';
import { FileRuleStore } from '../repository/file-rule-store.ts';
import { ClauseStore } from '../repository/clause-store.ts';
import { MockCertificateExtractor } from '../extractor/mock-extractor.ts';
import { MemorySaver } from '@langchain/langgraph';

/**
 * ============================================================================
 * 服务端工作流与规则仓库单例容器 (Server Singleton Container)
 * ============================================================================
 * 
 * 职责：在 Next.js 服务端进程中持久维护状态图 Checkpointer、规则仓库缓存与提取适配器。
 * ============================================================================
 */

// 全局内存 Checkpointer (支持长连接任务挂起与跨 HTTP 路由恢复)
const globalCheckpointer = new MemorySaver();
const globalRuleStore = new FileRuleStore();
const globalClauseStore = new ClauseStore();
const globalExtractor = new MockCertificateExtractor();

export const serverWorkflowEngine = new WorkflowEngine({
  ruleStore: globalRuleStore,
  clauseStore: globalClauseStore,
  extractor: globalExtractor,
  checkpointer: globalCheckpointer,
});

export const serverRuleStore = globalRuleStore;
export const serverClauseStore = globalClauseStore;
export const serverExtractor = globalExtractor;
