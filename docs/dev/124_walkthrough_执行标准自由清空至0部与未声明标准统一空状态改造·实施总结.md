# 执行标准自由清空至 0 部与未选/未声明标准统一空状态改造 · 实施总结

## 1. 核心改进成果

### 1. 彻底移除强制 fallback，允许清空至 0 部标准
- **成因根治**：彻底移除了 `WaterfallWorkbench.tsx` 中取消标准时自动塞入 `catalog[0]` 的硬编码逻辑，取消已选标准时直接剔除，允许 `selectedStandardIds = []`；
- **状态联动**：当清空至 0 部时，批次写入 `overrideStandard: ''`，重置裁决状态为 `UNAUDITED` 并清除异常缓存；
- **重置保真**：重置按钮严格忠实于原件基准。原件有声明标准时点击重置恢复原件声明；原件无声明标准时保持 0 部，重置按钮置灰（不可重置）。

### 2. 统一未选与未声明标准的待选空状态
- **选择器展示**：`selectedStandardIds.length === 0` 时，选择器徽章显示“已选 0 部”，触发框内展示灰色占位文本“请选择执行标准”；
- **中央空状态**：表格中央在未选择标准时（无论是原件未声明还是用户清空），优先渲染统一引导卡片：
  - 图标：`menu_book`
  - 标题：**尚未选择执行标准**
  - 描述：**请在上方选择至少一部标准以开始合规比对**
  - 操作：提供“选择执行标准”快捷按钮，点击一键展开选择器下拉菜单；
- **核验按钮保护**：右上角“开始核验”按钮在已选 0 部标准时禁用（`disabled`），鼠标悬停提示“请先选择至少一部执行标准”。

### 3. 全链路防空守卫
- 在 `useBatchStreamAuditor.ts` 的 `evaluateBatches` 头部与 `WaterfallWorkbench.tsx` 的自动核验副作用中增加防空守卫（`if (!stdIds || stdIds.length === 0) return;`），阻断空标准发起网络请求。

---

## 2. 验证与回归测试结果

| 验证项 | 指标要求 | 实测结果 | 结论 |
|---|---|---|---|
| **TypeScript 静态检查** | 0 error / no emit | `pnpm exec tsc --noEmit` 耗时 3s 0 错误通过 | ✅ PASS |
| **工程卫生与纯洁度审计** | 无样本泄漏、零伪造兜底 | `pnpm audit:hygiene` 验证通过 | ✅ PASS |
| **单元测试回归** | 覆盖空标准防御逻辑 | `tests/unit/useBatchStreamAuditor.test.ts` 新增空标准测试用例通过 | ✅ PASS |
| **全量自动化测试套件** | 86 files / 535 tests | 86 passed / 535 passed (100% 绿灯) | ✅ PASS |
