# 彻底移除 `filename.includes('质保书')` 硬编码条件与建立纯动态 BBOX 架构

## 目标与背景

在现有的解析流水线和工作台中，代码中存在 `filename.includes('质保书')` 的特化硬编码判断，导致系统在解析特定文件名的文档时自动注入了测试用基准坐标 `getZPJEBBoxes`，而在解析其他文件时产生逻辑断层。
通过本次重构，将彻底移除生产代码中的文件名硬编码与静态 BBox 兜底后门，建立 100% 服务端/模型解析响应驱动的纯动态 BBox 架构。

## 用户已确认的决策项（通过 /grill-me 对齐）

1. **BBOX 供给源策略**：
   - 服务端若无真实 OCR 坐标则返回空数组 `[]`；前端 100% 严格消费服务端返回的 `bboxes`，无坐标时平稳展示 PDF 原件与右侧解析表格。
2. **`getZPJEBBoxes` 代码管理**：
   - 保留在 `src/types/bbox.ts` 中并明确标注为“单测与算法基准标定数据”，生产业务代码中完全解除调用。
3. **无 BBOX 时的 UI 呈现**：
   - 保持极简纯净：工具栏仅显示缩放与翻页按钮，不显示多余告警；悬浮/聚焦右侧字段仅高亮表格当前行，左侧原件保持平稳不跳动。

## 详细变更方案

### 1. 服务端解析接口 (`src/app/api/documents/parse/route.ts`)

#### [MODIFY] [route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/parse/route.ts)
- 移除 `import { getZPJEBBoxes }`。
- 移除 `filename.includes('质保书')` 分支。
- 直接从大模型抽取结果中透传真实视觉坐标：`const bboxes = (rawResult as any).bboxes || [];`。

---

### 2. 前端工作台核心组件 (`src/components/WaterfallWorkbench.tsx`)

#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 移除顶部 `import { getZPJEBBoxes }`。
- 将 `bboxes` 的计算精简为 100% 依赖 `docBboxesMap` 与 `ocrStatus`：
  ```typescript
  const bboxes: FieldBBox[] = useMemo(() => {
    if (!currentDoc || currentDoc.ocrStatus !== 'DONE') {
      return [];
    }
    return docBboxesMap[currentDoc.docId] || [];
  }, [currentDoc, docBboxesMap]);
  ```

---

### 3. 类型与测试文件

#### [MODIFY] [bbox.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/types/bbox.ts)
- 补充 JSDoc 说明：`getZPJEBBoxes` 为单元测试与算法基准标定治具，生产代码已完全解耦。

---

## 验证计划

### 自动化测试
- 运行 `pnpm typecheck`：确保全量 TypeScript 严格类型检查 0 错误。
- 运行 `pnpm test`：运行 28 个测试套件（126 个单元测试），确保全部 100% 通过。
