# 钛公式修约对齐与表面质量/粗糙度解耦交付报告 (Phase 1)

本报告总结了 **Phase 1（核心引擎与数据切片修正）** 的全量落地工作。
针对《测试质保书2.pdf》暴露出的钛含量公式修约不一致以及表面外观与粗糙度串项误判两大核心问题，已彻底完成切片修正、归一化引擎升级与防冲毁存储改造。

---

## 一、核心问题解决与前后对比

| 检验项目 | 重构前问题表现 | Phase 1 重构后表现 | 落地技术实现 |
| :--- | :--- | :--- | :--- |
| **钛含量 (Ti)**<br>$\ge 5 \times (\text{C}+\text{N})$ | NB 切片设置为 2 位修约（算得 0.16%），GB 切片为 3 位修约（算得 0.155%），导致两部标准预算脱节未合并折叠，误报 NB 加严。 | **两部标准统一按国标修约为 3 位小数**（均为 0.155%），计算结果严密对齐，正常紧凑折叠合并，实测 0.22% 两标均判 PASS。 | 修改 [S32168_06Cr18Ni11Ti.json](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/data/standards/NB_T_47019_5_2021/slices/S32168_06Cr18Ni11Ti.json) 中 Ti 规则的 `rounding_decimals: 3`。 |
| **表面质量与粗糙度** | 归一化层粗暴将包含“表面”字样的粗糙度一刀切为 `surface_quality`，导致用粗糙度数值（0.33 μm）去匹配定性合格文本，误判 FAIL 并冲毁表面合格记录。 | **正交解耦为定性外观与定量粗糙度**：<br>1. 表面外观（`surface_quality`）：定性匹配合格 PASS；<br>2. 表面粗糙度（`surface_roughness`）：定量判定 0.33 μm $\le$ 0.8 μm PASS。 | 切片解耦两条原子规则；归一化器特异性优先与量纲感知；存储层类型防冲毁。 |
| **长尾项目安全沙箱** | 遇到未知或非标检验项时容易错配到已有核心分类，引发虚假红灯。 | 未知非标项标记 `is_known: false` 与 `is_sandbox: true`，隔离进入安全沙箱，不参与核心标准判废。 | [PropertyKeyNormalizer](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/property-key-normalizer.ts) 沙箱打标。 |

---

## 二、四大体系化原则代码落地清单

### 1. 原则一：特异性优先分级（Specificity Hierarchy）
* **文件**：[src/normalizer/property-key-normalizer.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/property-key-normalizer.ts)
* **实现**：将 `表面粗糙度`、`Ra`、`Rz`、`光洁度` 等具有高特异性的定量指标判定前置；仅在未命中特异性词时，才由下层的宏观定性词（`表面`、`外观`）承接，彻底消除泛化词对定量指标的吞噬。

### 2. 原则二：数据类型与量纲感知校验（Type & Dimension Sensing）
* **文件**：[src/normalizer/property-key-normalizer.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/property-key-normalizer.ts)、[src/normalizer/certificate-normalizer.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/certificate-normalizer.ts)
* **实现**：`normalize` 方法引入 `NormalizationContext { measuredRaw?: unknown; unit?: string | null }`。即使原始项名称简写为模糊的“表面”，若量纲单位为 `μm` 或实测值为纯浮点数，系统自动触发反向纠偏，将其重定向至 `surface_roughness`。

### 3. 原则三：切片规则原子化解耦（Rule Atomicity）
* **文件**：[data/standards/NB_T_47019_5_2021/slices/S32168_06Cr18Ni11Ti.json](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/data/standards/NB_T_47019_5_2021/slices/S32168_06Cr18Ni11Ti.json)
* **实现**：
  * 将 `SURFACE_NB_S32168_QUALITY` 明确命名为 `表面外观质量`，规则类型为纯定性 `qualitative_pass`；
  * 新增独立的定量规则 `SURFACE_NB_S32168_ROUGHNESS`（`surface_roughness`，单位 `μm`，支持 Ra $\le$ 0.8 μm 判定）。

### 4. 原则四：记录防冲毁与非标安全沙箱（Anti-Collision & Sandbox）
* **文件**：[src/engine/core.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/engine/core.ts)、[src/app/api/audit/submit/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/audit/submit/route.ts)
* **实现**：
  * 构建实测索引映射表时，为定性与定量异构记录派生类型专用槽位（`${key}#num` 与 `${key}#qual`）；
  * 当某批次同时报送外观合格（定性）与粗糙度实测值（定量）时，两者独立建档，杜绝单键覆盖抹杀；
  * `core.ts` 规则求值器按当前规则类型优先匹配对应槽位，并兼顾通用键。

---

## 三、全量验证结果

### 1. 自动化单元与集成测试（100% 通过）
* 执行命令：`pnpm test`
* 结果：全量 **40 个测试套件，200 个测试用例全部一次性绿色通过**（新增了 `测试质保书2` 真实载荷端到端测试与四大原则单测）。

### 2. TypeScript 严格类型检查（0 错误）
* 执行命令：`pnpm exec tsc --noEmit`
* 结果：代码通过 strict 模式编译，0 类型错误。

### 3. Next.js 15 生产环境构建打包（0 错误）
* 执行命令：`pnpm build`
* 结果：12 个静态与动态 API 路由编译打包完成。

---

## 四、后续推进（Phase 2）

Phase 1 的底层正确性底座已经坚实确立，彻底根除了钛修约与表面串项的误判问题。
接下来将按照既定规划推进 **Phase 2**：
* 统一 `thread_id: ${sessionId}::${batchNo}`，落地多批次并发的 LangGraph 线程级强隔离；
* 编排 `llm-property-resolver.node.ts`，为更复杂的长尾方言提供受限候选集语义裁决。
