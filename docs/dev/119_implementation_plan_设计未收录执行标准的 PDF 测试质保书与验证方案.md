# 设计未收录执行标准的 PDF 测试质保书与验证方案

本项目当前标准库（`data/standards`）仅收录了 `GB/T 13296-2023` 与 `NB/T 47019.5-2021` 两部标准。
本方案旨在为系统设计并生成一份真实的工业级 PDF 格式质量证明书（MTC），其声明标准为国际主流但当前未入库的 `ASTM A312 / A312M`（牌号 TP316L），用以精准测试与验证工作流在检索标准阶段对“未收录标准”的拦截捕获、审计轨迹记录与防呆诊断能力。

## User Review Required

> [!NOTE]
> 经过前序问答确认，本次设计决策如下：
> 1. **执行标准与牌号**：选用国际主流标准 `ASTM A312 / A312M`，材质为 `TP316L (UNS S31603)`；
> 2. **存储路径**：PDF 二进制文件保存至 `public/samples/astm_a312_tp316l_unsupported_standard.pdf`；
> 3. **交付组件**：包含独立可重用的 PDF 生成脚本、PDF 二进制文件，以及配套的 Vitest 自动化拦截测试套件。

## 架构与数据设计

### 1. 质保书元数据与检测数据设计

- **证书大标题**：INSPECTION CERTIFICATE EN 10204 3.1 / MILL TEST CERTIFICATE
- **证书编号**：`MTC-2026-ASTM-A312-901`
- **声明执行标准 (Declared Standard)**：`ASTM A312 / A312M`（标准库未涵盖）
- **声明材质牌号 (Declared Grade)**：`TP316L (UNS S31603)`
- **制造厂家 (Manufacturer)**：`Global Special Alloy Piping Industries Co., Ltd.`
- **规格尺寸 (Dimensions)**：`1" NPS Sch 10S (OD 33.40mm x WT 2.77mm x L 6000mm)`
- **炉批号 (Heat / Lot No)**：`Heat No: H-ASTM-2688 / Lot No: LOT-2026-09A`
- **交货状态 (Delivery Condition)**：`Solution Annealed & Pickled (1080°C Water Quenched)`
- **化学成分 (Chemical Composition, %)**：
  - C: `0.022`, Si: `0.45`, Mn: `1.38`, P: `0.028`, S: `0.003`, Cr: `17.35`, Ni: `12.18`, Mo: `2.12`, N: `0.048`
- **力学性能 (Mechanical Properties)**：
  - Tensile Strength Rm: `565 MPa`
  - Yield Strength Rp0.2: `252 MPa`
  - Elongation A (2 inch / 50mm): `46.0 %`
  - Hardness HRB: `81 HRB`
- **工艺性能与无损探伤 (Technological & NDT Inspection)**：
  - Flattening Test (ASTM A312/A999 Section 18): `PASS - No cracks, breaks or lamination`
  - Flaring Test (ASTM A312/A999 Section 19): `PASS - Flaring rate 20%, Sound and defect-free`
  - Hydrostatic Pressure Test (ASTM A999 Section 20): `PASS - 21.5 MPa Held for 10s, No leakage`
  - Eddy Current & Ultrasonic Testing (ASTM E426 / E213): `PASS - Acceptance standard Level 1 / Class U2`
  - Intergranular Corrosion Test (ASTM A262 Practice E): `PASS - No intergranular attack detected`
- **签发签章**：QA Supervisor 签名及质检放行章 (`QA PASSED / MILL TEST PASSED`)

---

## Proposed Changes

### 1. 脚本与 PDF 资产

#### [NEW] [generate-unsupported-standard-pdf.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/scripts/generate-unsupported-standard-pdf.ts)
- 基于纯 TypeScript + 原生 PDF 1.4 矢量规范（Helvetica / Helvetica-Bold Type 1 字体，WinAnsi 编码，无系统字库依赖），生成符合工业美观规范的 MTC 矢量 PDF；
- 运行后自动将 PDF 编译写入 `public/samples/astm_a312_tp316l_unsupported_standard.pdf`。

#### [NEW] `public/samples/astm_a312_tp316l_unsupported_standard.pdf`
- 编译生成的真实二进制 PDF 测试文件，支持在浏览器中直接预览、下载及在工作台文件上传控件中测试。

---

### 2. 自动化测试套件

#### [NEW] [unsupported-standard.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/workflow/unsupported-standard.test.ts)
- 基于 Vitest 构建工作流端到端测试用例；
- 验证当证书声明标准为 `ASTM A312 / A312M` 时：
  1. 归一化节点正确提取并保留原始声明标准；
  2. 标准检索节点（Node 3: `retrieve-standard`）正确识别未入库状态；
  3. 系统中断或判定失败，输出包含“`未收录标准 [ASTM A312 / A312M]，请检查标准代号或在标准库中补充配置`”的明确诊断错误信息；
  4. 审计日志轨迹（`traces`）完整记录拦截过程，无静默吞掉异常或死循环。

---

### 3. 项目知识与协作规则沉淀 (Project Cairn)

#### [MODIFY] [cairn/LOG.md](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/LOG.md)
- 按照 Project Cairn 规则，在顶部记录新增未收录标准测试用例资产与验证结论的日志条目。

---

## Verification Plan

### Automated Tests
1. 运行生成脚本编译 PDF：
   ```bash
   pnpm tsx scripts/generate-unsupported-standard-pdf.ts
   ```
2. 检查输出文件大小与 PDF 有效性；
3. 运行新增的自动化测试套件：
   ```bash
   pnpm vitest run tests/workflow/unsupported-standard.test.ts
   ```
4. 运行全量测试确保无回退：
   ```bash
   pnpm test
   ```

### Manual Verification
1. 确认生成的 PDF 文件可在 Windows / 浏览器中正常打开并具有清晰的工业版式；
2. 验证 PDF 内容中包含标准 `ASTM A312 / A312M` 与材质 `TP316L` 的文字及表格项。
