# 专测矩阵测试用例原件装载与双模流转实施计划

## 1. 背景与现状分析

在 NormScale 质检工作台首页（步骤 1）中，「典型测试场景矩阵」卡片原先的「一键装载」按钮直接调用了 `handleRestoreFromCache`，尝试请求 `/api/documents/cached?md5=...` 读取本地持久化缓存。
这导致两大痛点：
1. **未缓存时直接阻断**：当本地 `.cache/parses/` 缺少对应用例缓存时，直接弹出“载入缓存失败: 未找到指定文档的解析缓存”，用户无法进行任何后续操作；
2. **缺乏真实文件流**：该方式未将实际的 PDF 原件载入待处理队列，用户无法像普通上传文件一样正常发起大模型流式解析与规则核验流水线。

## 2. 目标与决策对齐

根据与用户的交互对齐（`/grill-me`）：
1. **原件真实入队（步骤 1 驻留）**：点击专测矩阵卡片的「一键装载」后，前端通过 `fetch` 获取真实的 PDF 原件（`/samples/case*.pdf`），构造真实的 `File` 对象，调用统一的待处理文档入队与预处理流水线（`handleFileUpload`），停留在步骤 1，由用户确认待处理队列后点击「解析文档，核对数据」继续流转；
2. **追加至待处理队列**：支持多专测用例或专测用例与普通上传文档混合并发测试；若同一用例已在队列中，自动选中高亮并提示，避免重复入队；
3. **缓存与真实模型双模保障**：
   - 无论是否命中缓存，都可以继续执行测试；
   - 未命中缓存时，走真实大模型流式结构化抽取流水线；
   - 服务端预置 4 个典型专测场景的权威解析结果补齐机制，确保离线/无 API Key 时秒级命中测试缓存，有真实大模型时支持强制重新解析；
4. **直观轻量反馈**：装载中按钮提供 Loading 动画与禁用态，完成后弹出轻量 Toast 提示。

---

## 3. 拟变更文件与实施步骤

### 阶段一：专测场景权威预解析缓存补齐与 MD5 对齐

#### [MODIFY] [`tests/fixtures/scenarios/index.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/fixtures/scenarios/index.ts)
- 核对并更新 Case 4 的真实 MD5 为 `d40757c9cc2fb3856ece3c7857a3c511`；
- 导出场景权威缓存种子生成函数，供缓存服务按需自动补齐。

#### [MODIFY] [`src/repository/parse-cache-store.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/repository/parse-cache-store.ts)
- 在 `get(md5)` 中引入专测用例按需补齐机制（Seeding on Demand）：
  若磁盘上未找到该 MD5 缓存，但属于四维专测场景之一，自动将预置的权威解析结构与 BBox 坐标持久化至 `.cache/parses/${md5}.json` 并返回，确保本地与离线环境秒级命中。

---

### 阶段二：工作台前端专测用例原件装载与队列流转接入

#### [MODIFY] [`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 在状态层增加 `loadingScenarios: Record<string, boolean>` 状态追踪各卡片装载中状态；
- 实现 `handleLoadScenarioFile(scenario: PresetSampleDto)`：
  1. 校验是否已在 `queuedDocs` 队列中，若已在则定位选中并弹出 Toast 提示；
  2. 从 `scenario.download_url` 获取真实的 PDF Blob；
  3. 构造 `new File([blob], filename, { type: 'application/pdf' })`；
  4. 触发统一的 `handleFileUpload([file])` 流水线，完成页面切图、文本提取、MD5 计算与落盘预处理；
  5. 停留在步骤 1，供用户审查队列并由底栏按钮统一驱动推进；
- 更新专测矩阵中「一键装载」按钮的 `onClick`，替换旧的 `handleRestoreFromCache` 为 `handleLoadScenarioFile`，并绑定 loading 禁用与图标动效。

---

## 4. 验证计划

### 自动化测试
1. **单元测试与集成测试**：
   - 运行 `pnpm test`，确保全量 47 个测试套件（231 个测试）保持 100% 通过；
   - 新增专测场景按需补齐与原件下载入队的测试断言。
2. **TypeScript 严格类型检查**：
   - 运行 `pnpm exec tsc --noEmit`，确保 0 错误。
3. **Next.js 15 打包构建验证**：
   - 运行 `pnpm build`，确保生产构建打包完全成功。

### 手工与浏览器验证
1. 打开首页步骤 1，点击专测矩阵卡片的「一键装载」；
2. 观察按钮 Loading 反馈与 Toast 提示；
3. 验证该测试用例文档成功出现在「待处理文档队列」中；
4. 验证预处理正常触发，显示「已命中解析缓存」（离线权威缓存）或「待模型提取」；
5. 点击底栏「解析文档，核对数据」，验证流畅推进到步骤 2，并可继续进入步骤 3 完成比对。
