# 质检批次 OCR 置信度与材料牌号匹配度真值化实施方案

彻底废除当前系统中固定硬编码的静态常数（`ocrConfidence: 95`, `gradeMatchConfidence: 95`），建立基于真实数据质量与国家/行业标准的动态真值评估体系。

## 核心设计决策

### 1. 当前批次 OCR 置信度（方案 A：动态多维综合加权评估）
由于大语言模型/多模态视觉 API 仅输出 JSON 文本流，不提供底层的字符级 OCR 几何分值，建立**工业级数据抽取质量与定位覆盖率多维综合评分模型**：
- **维度 1：基础元数据完整率 (30% 权重)**
  - 核心溯源 5 项：证书号 (20分)、批号/炉号 (25分)、牌号 (25分)、供货厂家 (15分)、执行标准 (15分)；按非空且有效文本比例折算得分。
- **维度 2：理化与力学检验项丰富度与格式合规性 (45% 权重)**
  - 化学成分 (25%)：主量元素（C, Si, Mn, P, S 等）有效抽取项数与数值解析合法性（具备有效数值每项加分，超过 5 项满分；数值非法乱码扣分）；
  - 力学与工艺性能 (20%)：屈服强度、抗拉强度、伸长率与工艺/冲击/无损有效提取情况。
- **维度 3：视觉图层 BBox 锚点对齐覆盖率 (25% 权重)**
  - 提取字段在真实 PDF/切图中的视觉定位匹配率 (`matchedBBoxes / totalExtractedFields`)；
- **综合得分**：加权求和后取整，客观区间通常为 `[50, 99]` 分，杜绝千篇一律的 95%。

### 2. 材料牌号匹配度（Grade Match Confidence 真实消歧对齐）
彻底接入既有的标准消歧归一化引擎 [`GradeNormalizer`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/grade-normalizer.ts)：
- **100% (精确命中)**：在标准规格切片库（GB/T 13296、ASME SA387 等）中精准检索到该牌号的规格切片（`is_matched === true` 且切片存在）；
- **98% (别名映射)**：命中工业通用别名字典（如 `SUS304` → `06Cr19Ni10`、`TP316L` → `022Cr17Ni12Mo2`）；
- **50% (未知/未收录)**：标准库中尚未收录的非法或特殊牌号，提示质检员人工复核；
- **0% (空牌号)**：未能提取出任何材料牌号。

---

## 拟定修改清单

### 1. 核心计算引擎层 [NEW]
#### [`src/engine/confidence-evaluator.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/confidence-evaluator.ts)
- 实现 `calculateOcrConfidence(batch: BatchSpecimen, bboxes?: FieldBBox[]): number`；
- 实现 `calculateGradeMatchConfidence(grade: string, standard?: string, ruleStore?: IRuleStore): Promise<number>`；
- 实现 `enrichBatchConfidences(batch: BatchSpecimen, bboxes?: FieldBBox[], ruleStore?: IRuleStore): Promise<BatchSpecimen>`。

### 2. 大模型解析与数据交付层 [MODIFY]
#### [`src/extractor/openai-compatible-extractor.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/openai-compatible-extractor.ts)
- 废除 `ocrConfidence: 95` 与 `gradeMatchConfidence: 95` 的写死代码；
- 引入 `ConfidenceEvaluator` 进行即时真值赋能。

#### [`src/app/api/documents/parse/route.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/parse/route.ts)
- 在流式 `complete` 与静态返回时，结合生成的 `bboxes` 和标准库上下文，对所有批次注入真实计算的 `ocrConfidence` 与 `gradeMatchConfidence`，并同步持久化落盘至 `.cache/parses/`。

### 3. 工作台前端交互层 [MODIFY]
#### [`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 在用户在线原位修改牌号、执行标准或检验数值时，联动触发 `ConfidenceEvaluator` 实时重新计算当前批次的真实 OCR 置信度与牌号匹配度徽章；
- 优化置信度颜色等级：≥95% 翠绿，80%~94% 优雅蓝，<80% 琥珀黄警告。

---

## 验证计划

### 1. 自动化测试
- 编写专门的单元测试 [`tests/engine/confidence-evaluator.test.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/engine/confidence-evaluator.test.ts)，全面覆盖：
  - 完整质保书（18项元素 + 完整力学 + 高 BBox 覆盖率）的高置信度（≥96%）；
  - 关键元数据缺失或元素乱码时的梯度扣减（例如仅有残缺数据时降为 60%~75%）；
  - 精确牌号（SA387Gr22CL.2 / 06Cr19Ni10）的 100% 匹配；
  - 别名牌号（SUS304 / TP316）的 98% 匹配；
  - 未知杂牌号的 50% 匹配；
- 运行 `pnpm test` 保证全量 34 个套件无回归。

### 2. 真实场景验证
- 载入 `测试质保书4.pdf`（江阴兴澄特钢 SA387Gr22CL.2），验证界面上显示的 OCR 置信度为根据其 18 项化学元素 + 力学 + 36 个 BBox 算出的真实分数，材料牌号匹配度反映其真实标准命中率；
- 运行 `pnpm typecheck` 确认 TypeScript 0 错误。
