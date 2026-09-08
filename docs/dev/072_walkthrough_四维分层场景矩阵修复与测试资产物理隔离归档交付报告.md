# 质保书四维分层场景矩阵修复与测试资产物理隔离归档交付报告

## 一、问题闭环总览

针对用户在体验质保书四维分层核验场景矩阵过程中反馈的 4 项关键问题，本轮实施已全部完成代码级修复、物理隔离归档与端到端闭环验证：

| 序号 | 用户反馈问题 | 根因定位 | 修复方案与达成效果 | 状态 |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **载入测试用例提示“未找到预设样本: [doc_f944232d]”** | `WaterfallWorkbench` 在恢复缓存或点击待处理队列卡片时触发了 `page.tsx` 遗留的 `onSelectSample={id => handleExecuteAudit(id)}`，将文档 ID 误当 mock sampleId 发起 `/api/audit/submit` 抛出 404。 | 彻底剥离 `page.tsx` 根页面的遗留拦截；待处理队列与缓存恢复收敛为工作台内聚状态管理，彻底消除虚假 404 弹窗。 | **已解决** |
| **2** | **Case 1 未按预期走到 HITL 状态由人工确认牌号** | 结构化直通分支在输入已含 `property_key` 时，硬编码 `grade_normalization: { is_matched: true }`，跳过了 `GradeNormalizer` 校验，非标牌号被误判通过后因找不到规则退化为 FAIL。 | 强制在直通分支调用 `gradeNormalizer.normalize` 校验牌号有效性；非标牌号稳定触发 `UNKNOWN_GRADE` 阻断与 480px 抽屉；完善 `handleResolveHitl` 调用 `resumeAudit` 恢复执行输出合格报告。 | **已解决** |
| **3** | **步骤 1 将“分层核验典型场景专测矩阵”移动到“历史已缓存文档”下方** | 原 DOM 结构将场景专测矩阵放置于欢迎区顶部，压制了常规业务缓存文档的呈现。 | 调整 DOM 顺序，将「历史已缓存文档」置顶，「分层核验典型场景专测矩阵」置于其下方；并在标题醒目标注 `[专用测试数据]` 徽章。 | **已解决** |
| **4** | **测试用例单独归档，走专用路径并清晰标注测试数据，支持后续清理** | 场景数据此前混入主代码库，缺乏独立归档与环境开关。 | 新建 `tests/fixtures/scenarios/` 独立归档目录；受控于 `NEXT_PUBLIC_ENABLE_TEST_FIXTURES` 开关；API 与 UI 标注 `[专用测试数据]`；清理只需关开关或删除该目录。 | **已解决** |

---

## 二、关键工程与架构变更

### 1. 测试资产物理隔离归档与受控加载
- **独立归档路径**：[tests/fixtures/scenarios/index.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/fixtures/scenarios/index.ts)
  - 集中管理 Case 1 ~ Case 4 四套场景的高保真结构化 Payload、元数据清单、PDF 原件路径；
  - 导出 `isTestFixturesEnabled()` 守卫函数与 `getScenarioFixture(id)` 提取助手。
- **环境控制开关**：
  - `process.env.NEXT_PUBLIC_ENABLE_TEST_FIXTURES !== 'false'`；
  - 设为 `'false'` 时，API 接口（`/api/samples`）与工作台组件均不载入专测矩阵，实现测试资产一键零残留卸载。
- **主抽取器瘦身**：[src/extractor/mock-extractor.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/mock-extractor.ts)
  - 剥离原有写死的场景数据，统一委托给归档模块查询，非测试或非匹配输入严禁伪造假数据。

### 2. 工作流状态机与 HITL 人机协同闭环
- **牌号消歧强制校验**：[src/workflow/nodes/normalize.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/normalize.node.ts)
  - 结构化直通分支移除硬编码 `is_matched: true`，显式调用 `this.gradeNormalizer.normalize(certificate.header.declared_grade, ...)`；
  - 对未收录牌号（如 `SUS 304H-SpecialX`），稳固标记 `is_matched: false` 并生成 `UNKNOWN_GRADE` 的 `hitlContext`，挂起 LangGraph 中断。
- **人机协同恢复流转**：[src/components/WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
  - 质检工程师在 480px 抽屉选择推荐或自定义国标牌号后，调用 `apiClient.resumeAudit(taskId, { corrected_grade, waiver_notes })`；
  - 服务端 LangGraph 状态机无缝恢复，检索对应标准规则完成合规比对，比对报告与大盘即时更新为合格放行。

### 3. 解耦消除 404 报错与欢迎区布局调序
- **消除 404 异常**：[src/app/page.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/page.tsx)
  - 剥离根页面旧有的 `onSelectSample={id => handleExecuteAudit(id)}` 回调；
  - `WaterfallWorkbench.tsx` 中缓存文档恢复与待处理队列卡片点击内聚驱动 `selectedDocId` 与 `selectedBatchNo`，不再外发虚假 sample 请求。
- **布局顺序优化**：[src/components/WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
  - 「历史已缓存文档」位于步骤 1 欢迎区上方，方便质检员快速续接既有任务；
  - 「分层核验典型场景专测矩阵」位于其下方，携带 `[专用测试数据]` 黄色高显徽标与一键装载按钮。

---

## 三、验证与测试矩阵

### 1. 自动化端到端测试 (E2E)
执行命令：
```powershell
pnpm test tests/e2e/four-tier-scenarios.test.ts
```
测试结果全部绿色通过（5/5 passed）：
- `Case 1: Tier 1 - HITL 人机协同 (未收录非标牌号阻断并支持人工修正恢复)`：PASS
- `Case 2: Tier 1 ➡️ Tier 2 - 语义对齐通过 (表面光洁度 0.33 μm 达标全绿流转)`：PASS
- `Case 3: Tier 1 ➡️ Tier 2 - 语义对齐否定 (表面光洁度 1.50 μm 超差超标红灯告警)`：PASS
- `Case 4: Tier 1 ➡️ Tier 2 - 行内 HITL (特异非标项置信度不足触发歧义挂起)`：PASS
- `Case 1 结构化直通输入防漏测: 包含 property_key 的结构化输入仍强制校验 GradeNormalizer 并触发 UNKNOWN_GRADE`：PASS

### 2. 全量单元测试回归
执行命令：
```powershell
pnpm test
```
测试结果：
- **45 个测试套件，214 个测试用例全部通过（100% 绿色）**。

### 3. 严格模式类型检查与生产打包
- **TypeScript 静态检查**：
  ```powershell
  pnpm exec tsc --noEmit
  ```
  结果：0 错误，严格类型安全。
- **Next.js 15 生产构建**：
  ```powershell
  pnpm build
  ```
  结果：12 条路由全部构建成功，零打包警告。
