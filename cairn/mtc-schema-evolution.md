---
type: project_topic
status: active
summary: "工业质保书双炉号追溯（冶炼炉号 Heat No. 与热处理装炉号 Pack No.）领域建模决策，与基于 additional_identifiers 通用扩展池和 .passthrough() 的零破坏性演进架构。"
tags:
  - mtc-schema
  - trace-identifiers
  - schema-evolution
  - zod-contract
contains:
  - decision
  - pitfall
created: "2026-08-27"
updated: "2026-08-27"
related:
  - cairn/architecture.md
authoring_mode: ai_generated
---

# 工业质保书双炉号追溯与长尾元数据扩展建模

## 1. 业务背景与工业场景痛点

在石化、特种承压设备（如《GB/T 13296》高压换热管/锅炉管）等极端严苛的工业应用场景中，质量证明书（MTC）上的追溯编号存在高度专业化的分层体系：

1. **原材料冶炼炉号（Heat No.）**：表征钢水在炼钢炉中冶炼浇铸的母批次，物理上决定了材料的**化学成分（熔炼分析）**；
2. **钢管热处理炉号 / 装炉批号（Pack No. / Heat Treatment Lot No.）**：成管后进入热处理炉（如光亮固溶退火）的加工批号，物理上决定了管材的**力学性能（屈服强度、抗拉强度、延伸率、硬度）与金相组织**。

在镇海石化建安真实质保书等生产单据中，两个炉号往往同时存在且编号不同（如冶炼炉号 `YX2602-2207`，热处理装炉号 `Z26022C`）。

同时，工业单据常出现未在初始 Schema 预期中的长尾标识，例如施工号（Construction No.）、母卷号（Coil No.）、合同号（Contract No.）及特种设备制造许可证号（TS No.）。

---

## 2. 核心架构决策：双轨制演进模式（Dual-Track Evolution）

系统摒弃了“将所有非标字段强塞入临时字段”或“每次遇到新单据全量重构 Schema”的两种极端做法，确立了**法定核心常驻 + 通用扩展池**的双轨制模型：

### 决策 1：法定核心追溯字段强类型常驻化
- 将热处理装炉号正式作为法定字段纳入 [`CertificateHeaderSchema`](file:///Users/shiromaple/Github/NormScale/src/schemas/certificate.schema.ts)：
  ```typescript
  heat_treatment_lot_number: z.string().optional(), // 钢管热处理炉号/装炉号/热处理批号 (Pack No.)
  ```
- **价值**：在前后端、核验计算引擎与放行归档报告中均获得最高优先级的类型安全保护与专属展示位。

### 决策 2：未知长尾标识通用扩展池与防腐蚀机制
- 在 `CertificateHeaderSchema` 中引入通用扩展池，并显式启用 `.passthrough()`：
  ```typescript
  additional_identifiers: z.array(z.object({
    key: z.string(),         // 字段标识，如 "contract_no", "ts_license"
    label: z.string(),       // 界面展示名称，如 "合同号", "特种设备许可证"
    value: z.string(),       // 提取数值
    confidence: z.number().min(0).max(1).optional()
  })).optional().default([]),
  ```
- **价值**：后续上游 OCR 无论提取到任何生僻的单据标识，均直接进入扩展池，Schema 契约再无须频繁改动，真正做到零破坏性演进。

### 决策 3：前端复合单元格呈现与独立视觉 BBox 联动
- **UI 布局保持规整**：在 4×3 基础元数据网格中，将第 4 行第 1 列设为“冶炼炉号/热处理炉号 (Heat/Pack No.)”双胶囊输入框，高宽与邻近控件保持严格对齐；
- **视觉 BBox 精准解耦**：
  - Hover `Heat No.` 单独高亮源文档 Page 1 左侧原材料炉号；
  - Hover `Pack No.` 单独高亮源文档 Page 1 右侧钢管热处理炉号；
  - 既保障了工作台空间的极致利用，又维持了 100% 精确的单据溯源可信度。

---

## 3. 踩坑与规避记录

| 风险/踩坑点 | 发生场景 | 根本原因 | 规避与防护原则 |
|---|---|---|---|
| **误将 Pack No. 覆写为 Heat No.** | 初版 Mock 仅定义 `heat_number` | 传统通用 OCR 无法识别冶炼与热处理的物理差异，将两个炉号混淆 | 严格按照理化机制拆分字段，力学性能比对必须关联至 `heat_treatment_lot_number` |
| **严格模式 Zod 报错丢弃数据** | 外部 OCR 传入未声明字段 | 默认 Zod 对象会 strip 掉未定义字段 | 核心 Header Schema 必须配置 `.passthrough()` 保障数据韧性 |
