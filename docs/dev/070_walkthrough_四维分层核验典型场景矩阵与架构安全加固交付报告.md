# 四维分层核验典型场景矩阵与架构安全加固交付报告

本阶段任务针对系统的四维核验流向完成了 **【方案 A + B 结合】** 落地，并彻底消除了服务端工作流中的假数据隐雷。

---

## 一、架构安全加固：提取器彻底解耦与生产安全守卫

根据代码审阅建议，系统消除了长期遗留的假数据风险：
1. **服务端工作流单例解耦**：
   - 在 [src/lib/server-engine.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/lib/server-engine.ts) 中彻底移除 `const globalExtractor = new MockCertificateExtractor()` 与其到处传递的逻辑，服务端仅注入持久化 Checkpointer 和核心规则库；
2. **提取节点严格守卫**：
   - [src/workflow/nodes/extract.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/extract.node.ts) 移除了对 Mock 的回退，加入严格安全断言：若未显式注入 Extractor 且收到非结构化数据输入，直接抛出阻断性错误，严禁假数据流入生产流转；
3. **消除未知输入的静默回退**：
   - [src/extractor/mock-extractor.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/mock-extractor.ts) 移除了任何将未知输入静默退回至 S30408 的逻辑，未知输入坚决抛错；
4. **API 入口轻量解包**：
   - [src/app/api/audit/submit/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/audit/submit/route.ts) 针对携带 `sampleId` 的请求，直接通过纯函数 `getPresetSamplePayload(sampleId)` 解析为结构化 JSON 字符串，下层工作流消费的始终是纯净结构化数据。

---

## 二、四维分层典型核验场景矩阵（方案 A + B 结合）

构建了 4 套能够精准触发不同流转路径的测试件与全景矩阵：

| 场景标识 | 典型场景 | 核心特征与测试输入 | 预期流转路径 | 交付产物 |
|---|---|---|---|---|
| **Case 1** | **Tier 1 - HITL 人机协同** | 声明未收录的特种非标牌号 `SUS 304H-SpecialX` | 归一化即时识别牌号异常，触发 LangGraph `interrupt()` 阻断性挂起，前端滑出 480px 抽屉等待质检员指定国标牌号并恢复 | [case1 PDF](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/public/samples/case1_tier1_hitl_unknown_grade.pdf)<br/>MD5: `57cf180b3a6bf597edacb0812fa1cd87` |
| **Case 2** | **Tier 1 ➡️ Tier 2 通过** | 标准 NB/T 47019.5-2021 `06Cr18Ni11Ti`，含长尾表述“表面光洁度: 0.33 μm” | Tier 1 秒级出基础项大盘；Tier 2 语义对齐至标准粗糙度 Ra $\le$ 0.8 μm，判定达标全绿流转 | [case2 PDF](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/public/samples/case2_tier1_to_tier2_pass.pdf)<br/>MD5: `2fb1e9847a0ccf7590cae7f86d3e6032` |
| **Case 3** | **Tier 1 ➡️ Tier 2 否定 (超标)** | 声明 `06Cr18Ni11Ti`，含长尾表述“表面光洁度: 1.50 μm” | 基础项达标，Tier 2 语义对齐至标准粗糙度后判定 1.50 > 0.8 超差超标，输出红灯 FAIL 否定结论 | [case3 PDF](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/public/samples/case3_tier1_to_tier2_fail.pdf)<br/>MD5: `5c10d410095f2f28ab045b5a13ec6734` |
| **Case 4** | **Tier 1 ➡️ Tier 2 行内 HITL** | 包含高特异性非标测试项“特种非标微区抗剪切断裂韧度K1C: 85” | 标准切片中无剪切规则，Tier 2 置信度不足，触发属性级歧义挂起，比对矩阵行内就地展开 HITL 确认卡片 | [case4 PDF](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/public/samples/case4_tier1_to_tier2_hitl.pdf)<br/>MD5: `f944232d51bde0536820fbea85db5dad` |

---

## 三、前端与接口交付：一键装载与原件下载

1. **接口升级**：
   - [src/app/api/samples/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/samples/route.ts) 新增上述 4 个典型场景，包含流向说明 `tier_flow`、`md5`、`filename`、`download_url` 与详细场景介绍。
2. **工作台步骤 1「分层核验典型场景专测矩阵」组件**：
   - 在 [src/components/WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx) 的步骤 1 欢迎区新增 4 栏专测卡片网格；
   - **【一键装载】**：直接基于已生成的 `.cache/parses/` 缓存将完整结构化会话（含高保真矢量切图与真实 BBox）瞬间装载至待处理队列并选中，用户可直接进入步骤 2 / 步骤 3 体验核验；
   - **【下载原件】**：直接通过 `/samples/caseX_....pdf` 下载排版完备的工业矢量 PDF 原件，方便离线核对或真机拖拽测试。

---

## 四、全量自动化测试与工程验证

### 1. 单元与集成测试（Vitest）
* 新增端到端测试套件 [tests/e2e/four-tier-scenarios.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/e2e/four-tier-scenarios.test.ts)，完整覆盖 Case 1 ~ Case 4；
* 运行命令：`pnpm test`
* **结果**：全量 **45 个测试套件，213 个测试用例 100% 绿色全部通过**。

### 2. 类型安全检测（TypeScript）
* 运行命令：`pnpm exec tsc --noEmit`
* **结果**：严格模式 0 错误、0 警告。

### 3. Next.js 15 生产构建打包
* 运行命令：`pnpm build`
* **结果**：全部 12 个路由打包成功，耗时 2.9s，产物零冗余，静态与动态接口划分严密。

### 4. Cairn 规范同步
* 在 [cairn/LOG.md](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/LOG.md) 顶部追加记录，符合单条 $\le 20$ 行、最新优先、无表情符号规范。
