# 彻底移除 `filename.includes('质保书')` 硬编码条件与纯动态 BBox 架构落地报告

## 1. 变更总结

依据与用户在 `/grill-me` 讨论对齐的方案，已彻底清零全仓库中所有 `filename.includes('质保书')` 的特化硬编码逻辑，实现纯动态数据驱动架构：

1. **服务端解耦 (`src/app/api/documents/parse/route.ts`)**：
   - 彻底移除了 `import { getZPJEBBoxes }`；
   - 移除了 `filename.includes('质保书')` 判断分支；
   - `bboxes` 字段 100% 动态透传大模型/抽取器的真实视觉解析输出 `(rawResult as any).bboxes || []`。

2. **前端工作台纯动态消费 (`src/components/WaterfallWorkbench.tsx`)**：
   - 移除了 `import { getZPJEBBoxes }`；
   - 重构 `bboxes` 计算：仅在 `currentDoc.ocrStatus === 'DONE'` 时消费 `docBboxesMap[currentDoc.docId]`；无坐标数据时返回 `[]`，彻底消除任何本地兜底逻辑；
   - 当无 BBox 坐标时，左侧 PDF 保持纯净预览，点击/悬浮右侧字段仅高亮表格当前行，原件保持平稳展示。

3. **测试治具语义明确 (`src/types/bbox.ts`)**：
   - `getZPJEBBoxes` JSDoc 注释已规范化，明确定义其仅作为单测（`zpje-bbox.test.ts`、`session-isolation.test.ts`）与坐标算法基准验证的测试标定治具，生产代码已完全解耦。

---

## 2. 验证结果

- **硬编码关键词检索**：全项目检索 `filename.includes('质保书')` 结果为 **0**；
- **TypeScript 严格类型检查**：`pnpm typecheck` **0 错误**；
- **自动化测试套件**：`pnpm test` **28 个测试套件，126 个单元测试 100% 全部通过**；
- **Project Cairn 知识库**：`cairn/LOG.md` 最新进展已同步记录。
