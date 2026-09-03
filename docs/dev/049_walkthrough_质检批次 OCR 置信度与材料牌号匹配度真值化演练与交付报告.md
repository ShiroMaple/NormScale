# 质检批次 OCR 置信度与材料牌号匹配度真值化演练与交付报告

## 概述
彻底剔除既有代码中固定硬编码的静态常数（`ocrConfidence: 95` 与 `gradeMatchConfidence: 95`），构建起基于**方案 A（数据质量与定位覆盖率多维综合评估）**与**国家/行业标准消歧知识库对齐**的工业级动态真值计算体系。

---

## 核心落地成果

### 1. 核心评估器实现 ([`src/engine/confidence-evaluator.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/confidence-evaluator.ts))
- **OCR 置信度（方案 A 真实多维动态加权）**：
  - **基础元数据完整率 (30%)**：证书号 (6分)、批号/炉号 (8分)、牌号 (8分)、供货厂家 (4分)、执行标准 (4分)；
  - **理化及力学检验项丰富度与格式有效性 (45%)**：
    - 化学成分有效元素提取数与非 NaN 数值检验（每项 3 分，9 项以上满分 25 分）；
    - 力学拉伸强度 (6分)、屈服强度 (6分)、伸长率 (4分) 及工艺/冲击/无损 (4分)；
  - **视觉图层 BBox 锚点对齐覆盖率 (25%)**：真实切图视觉标注框与提取项的重合对齐率（无切图场景自动等比折算）；
  - **科学安全区间**：总分限制在 `[50, 99]`，杜绝虚假满分与千篇一律的 95%。
- **材料牌号匹配度（标准消歧真实对齐）**：
  - **100%**：标准规则规格切片精确命中（如 `06Cr19Ni10`、`S30408`、`SA387Gr22CL.2`、`Q345R` 等）；
  - **98%**：工业通用别名消歧映射成功（如 `SUS304`、`TP316L` 等）；
  - **50%**：标准库尚未收录的非法/未知牌号（黄色预警，提示人工复核）；
  - **0%**：空牌号。

### 2. 全链路真值接入与自愈覆盖
1. **大模型格式化器 ([`src/extractor/openai-compatible-extractor.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/openai-compatible-extractor.ts))**：
   - 彻底废除 `95` 常数，初始提取时即刻调用 `ConfidenceEvaluator` 赋能。
2. **服务端解析路由与缓存自愈 ([`src/app/api/documents/parse/route.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/parse/route.ts) / [`cached/route.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/cached/route.ts))**：
   - 结合真实生成的视觉 BBox 覆盖率重新校准各批次置信度真值并持久化入库，自动升级历史旧缓存。
3. **工作台原位核对与响应式徽章 ([`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx))**：
   - 质检员在线修改任何字段时，置信度毫秒级重算；
   - 徽章颜色自适应：≥90% 翠绿已验证、75%~89% 优雅蓝正常、<75% 琥珀黄预警。

---

## 验证结论

### 1. 自动化单元测试
运行命令：
```bash
pnpm test
```
- **35 个测试套件，159 个测试用例全部绿色通过**；
- 包含专门的 [`tests/engine/confidence-evaluator.test.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/engine/confidence-evaluator.test.ts)（涵盖高品质文档、残缺文档、纯文本折算、主牌号、别名、未知牌号、全字段注入等 8 个场景）。

### 2. 静态类型检查
运行命令：
```bash
pnpm typecheck
```
- **Strict Mode 下 0 错误通过**。
