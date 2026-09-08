# 手动输入钢级代号多维模糊匹配与键盘操作体验交付报告

## 1. 核心需求与完成情况

针对质检员在材料牌号消歧抽屉中“手动输入其他标准钢级代号”的交互场景，本次开发完成了全链路体验升级：
1. **优先锁定生效标准切片库**：构建当前勾选执行标准（如 GB/T 13296、NB/T 47019.5）下的合法钢级切片词典，确保质检员选中的牌号 100% 有规可循、能够立即完成数值核验；
2. **多维模糊匹配算法**：支持统一数字代号（如输入 `316` 匹配 `S31603`）、化学牌号子串（如输入 `17Ni12` 匹配 `022Cr17Ni12Mo2`）以及切片内置常见别名（如输入 `TP316L` 命中 `022Cr17Ni12Mo2` 并展示别名提示）；
3. **工业级键盘双模交互**：
   - 输入时在输入框下方自动弹出绝对定位浮层，展示标准全称、别名提示及所属标准；
   - 支持键盘 `ArrowDown` / `ArrowUp` 循环高亮选项；
   - 支持 `Enter` 回车键快速选择；
   - 支持 `Escape` 或点击浮层外部自动收起；
   - 输入框右侧常驻一键清空按钮；
4. **双轨回填与提交容错**：
   - 选中下拉项后，输入框回填标准全称（如 `022Cr17Ni12Mo2 (S31603)`），底层提交规范主牌号；
   - 若质检员手动自由输入未选择下拉项，则提交输入的原始文本，保留非标提交的自由度与兜底容错。

---

## 2. 变更文件清单

| 文件路径 | 变更类型 | 核心变更点 |
| :--- | :--- | :--- |
| [`src/repository/rule-store.interface.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/repository/rule-store.interface.ts) | 修改 | 新增 `StandardSliceOverview` 并在 `StandardOverview` 增加 `slice_details` 字段 |
| [`src/repository/file-rule-store.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/repository/file-rule-store.ts) | 修改 | `listAvailableStandards` 装载每个切片的 `spec_key`、`primary_grade`、`unified_code`、`display_name` 与 `aliases` |
| [`src/lib/api-client.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/lib/api-client.ts) | 修改 | 增加 `StandardSliceOverviewDto` 并在 `StandardOverviewDto` 增加 `slice_details` 类型声明 |
| [`src/utils/grade-fuzzy-matcher.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/utils/grade-fuzzy-matcher.ts) | 新增 | 候选钢级池构建、多维模糊检索打分与排序工具库 |
| [`tests/normalizer/hitl-fuzzy-grade.test.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/normalizer/hitl-fuzzy-grade.test.ts) | 新增 | 覆盖指定标准过滤、统一代号、化学式、别名匹配及排序 7 大单测场景 |
| [`src/components/HitlDrawer.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/HitlDrawer.tsx) | 修改 | 引入模糊搜索状态机、绝对定位浮层、键盘监听与回填提交逻辑 |
| [`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx) | 修改 | 挂载 `<HitlDrawer>` 时透传 `selectedStandardIds` 与 `availableStandards` |
| [`cairn/hitl-scenarios-and-drawer.md`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/hitl-scenarios-and-drawer.md) | 修改 | 沉淀踩坑 6：手动输入牌号多维模糊匹配与键盘交互规范 |
| [`cairn/LOG.md`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/LOG.md) | 修改 | 顶部追加进展记录 |

---

## 3. 验证结果

- **单元测试**：`pnpm test` 全量 **47 个测试套件、230 个测试（新增 7 个）全部通过**；
- **类型检查**：`pnpm exec tsc --noEmit` 0 错误；
- **生产构建**：`pnpm run build` Next.js 15 App Router 打包构建成功。
