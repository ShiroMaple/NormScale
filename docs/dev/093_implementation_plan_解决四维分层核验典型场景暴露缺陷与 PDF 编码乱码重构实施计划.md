# 解决四维分层核验典型场景暴露缺陷与 PDF 编码乱码重构实施计划

本计划旨在全面解决 Case 1~4 在端到端流转、PDF 栅格化渲染及数据转换漏斗中暴露出的所有结构性缺陷，彻底消除“单测靠手写假数据假自洽、现场实测全景暴雷”的双重标准，修复用户截图中出现的 PDF 预览方块乱码与文字重叠问题，并完成自动化测试与浏览器子代理实机验收。

---

## 暴露问题全景定位与根因归因

1. **PDF 编码与渲染崩溃（用户截图图示乱码）**：
   - **根因**：`scripts/generate-sample-test-cases.ts` 中的 `createMinimalVectorPdf` 构造了残缺的 Type0 `/STSong-Light` + `/UniGB-UTF16-H` 结构，既未内嵌字体，又未提供 CIDToGIDMap 和字宽（Widths）度量；且客户端 `pdf-renderer.ts` 在初始化 `pdf.js` 时未加载外部 CMap 资源包（缺少 `cMapUrl` 与 `cMapPacked`）。导致 `pdf.js` 在客户端 Canvas 栅格化切图时字形全部丢失，降级为 Missing Glyph 带叉方框（`☒` 豆腐块），且单行 Y 轴固定步长引发字体与乱码字符上下挤压踩踏重叠。
2. **国家/行业标准强制检验项物理缺失**：
   - **根因**：`scripts/generate-sample-test-cases.ts` 生成的 PDF 文本与结构化对象中，根本没有写入执行标准（GB/T 13296-2023、NB/T 47019.5-2021）强制要求的压扁试验、扩口试验、晶间腐蚀、超声波检测（UT）、液压/致密性试验，导致 Case 1 在工作台 HITL 选定牌号后，因缺项被比对引擎一票否决判定 5 项漏检（FAIL）。
3. **字段偏差在适配层截断（ReH 屈服强度漏水）**：
   - **根因**：`src/normalizer/specimen-adapter.ts` 的力学提取仅读取硬编码的 `batch.mechanical.yield_rp02`，未识别 `yield_reh` / `ReH` / `yield` / `屈服强度` 等常见别名；且将 `batch.mechanical` 中所有未知键值对静默丢弃，未将其生成 `test_record` 流入下游，导致数据在进入比对引擎和 Tier 2 语义消歧前就从漏斗外侧直接泄漏丢失。
4. **单测假自洽（双重标准）**：
   - **根因**：`tests/fixtures/scenarios/index.ts` 内置了一份精心手写的内存对象字典 `SCENARIO_PRESET_PAYLOADS` 与静态 `getScenarioCachedParseResult`，单测没有直接读取磁盘 `.cache/parses/<md5>.json`，导致单测跑在美化的假数据上显示全绿，而系统现场实际执行真实解析即刻暴雷。

---

## User Review Required

> [!IMPORTANT]
> 1. **PDF 生成架构重构**：我们将把 `scripts/generate-sample-test-cases.ts` 的 PDF 生成引擎全面升级为遵循 PDF 1.4 标准的规范工业矢量质保证书（Standard 14 Type 1 Fonts + WinAnsiEncoding 工业标准双语排版 + 矢量表格边框线与背景底色），100% 原生杜绝任何平台字库缺失与方块乱码，彻底解决用户截图中所示的渲染缺陷。
> 2. **数据源彻底统一**：我们将彻底删除 `tests/fixtures/scenarios/index.ts` 中的内存假数据字典，所有单测与前端真实消费统一读取磁盘 `.cache/parses/<md5>.json` 物理切片。重新生成 PDF 将产生全新的权威 MD5 指纹，并同步更新关联配置。

---

## Proposed Changes

### 1. PDF 渲染与样本生成模块

#### [MODIFY] [scripts/generate-sample-test-cases.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/scripts/generate-sample-test-cases.ts)
- **重构 `createMinimalVectorPdf`**：
  - 遵循 PDF 1.4 标准规范，构建包含 `Helvetica` 与 `Helvetica-Bold` 核心字体的标准资源字典。
  - 使用 WinAnsiEncoding 标准编码，通过 PDF 矢量绘图指令（`re`, `rg`, `RG`, `S`, `f`）绘制正规工业表格外框、单元格分割线与表头灰底。
  - 文本流采用规范的 `BT /F... Td (...) Tj ET` 语法，严格计算行高与列宽，确保在任何 PDF 渲染器、Canvas 栅格化及移动设备上 100% 绝对清晰无重叠、无豆腐块乱码。
- **补齐 Case 1~4 全部国标/行标强制检验项**：
  - **Case 1 (GB/T 13296-2023, SUS 304H-SpecialX -> 06Cr19Ni10)**：
    - 化学：C, Si, Mn, P, S, Cr, Ni 齐全合规；
    - 力学：抗拉强度 Rm (570 MPa)、屈服强度 ReH (250 MPa)、断后伸长率 A (45.0%)、洛氏硬度 (80 HRB)；
    - 工艺：压扁试验 (GB/T 246 合格无裂纹)、扩口试验 (GB/T 242 扩口率20%合格)；
    - 腐蚀：晶间腐蚀 (GB/T 4334 方法E 合格无倾向)；
    - 无损：超声探伤 (GB/T 5777 U2级合格)；
    - 致密性：液压试验 (GB/T 241 20MPa稳压10s无渗漏)；
  - **Case 2~4 (NB/T 47019.5-2021, 06Cr18Ni11Ti)**：
    - 完整包含压扁、扩口、晶粒度 (7.5级)、晶间腐蚀 (E法合格)、超声探伤 (U2合格)、水压试验 (20MPa合格)；
    - Case 2 叠加长尾项：表面光洁度 0.33 μm (Tier 2 对齐至 Ra <= 0.8 μm，PASS)；
    - Case 3 叠加长尾项：表面光洁度 1.50 μm (Tier 2 对齐至 Ra <= 0.8 μm，超差 FAIL)；
    - Case 4 叠加特种项：特种非标微区抗剪切断裂韧度K1C 85 MPa·m^1/2 (Tier 2 置信度不足，行内 HITL)。
- **同步输出结构化缓存**：
  - 将生成的权威 PDF 写入 `public/samples/` 与 `.cache/uploads/<md5>.pdf`；
  - 将与原件 100% 对应的结构化对象写入 `.cache/parses/<md5>.json`。

---

### 2. 客户端 PDF 栅格化增强

#### [MODIFY] [src/utils/pdf-renderer.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/utils/pdf-renderer.ts)
- 在 `renderPdfAndExtractText` 中调用 `pdfjs.getDocument` 时，显式配置：
  - `cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/'`
  - `cMapPacked: true`
- 消除任何外部带有 CJK 字符编码的 PDF 在客户端 Canvas 栅格化时因缺少 CMap 资源而回退为 Missing Glyph 的隐患。

---

### 3. 数据转换适配层（打通漏斗漏水）

#### [MODIFY] [src/normalizer/specimen-adapter.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/specimen-adapter.ts)
- **屈服强度别名全覆盖**：
  - 检查 `yield_rp02`、`yield_reh`、`yield_rel`、`yield_strength`、`yield`、`reh`、`rp02`、`屈服强度` 等多种表述；
  - 提取为 `property_key: 'yield_strength_rp02'`，同时保留 `raw_property_name`（如 `ReH` 或 `屈服强度`）；
- **长尾与未知力学项完整保全**：
  - 遍历 `batch.mechanical` 中所有未被标准四大项消费的键值对，绝不静默丢弃，统一封装为 `category: 'mechanical'` 的 `test_record` 输出；
  - 确保特种剪切韧度、特殊屈服指标等能够合法顺畅流入下游比对引擎与 Tier 2 语义消歧池，彻底杜绝数据在漏斗外侧泄漏。

---

### 4. 测试桩与同构缓存体系

#### [MODIFY] [tests/fixtures/scenarios/index.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/fixtures/scenarios/index.ts)
- **拔除手写假数据毒瘤**：
  - 移除手写的 `SCENARIO_PRESET_PAYLOADS` 与写死的 `sessionDocument` 静态分支；
  - `getScenarioCachedParseResult(md5: string)` 改造为直接从磁盘路径 `.cache/parses/${md5}.json` 读取物理切片；若磁盘不存在则抛出清晰异常指导运行生成脚本，杜绝假自洽。
- 同步更新 Case 1~4 的权威 MD5 元数据。

#### [MODIFY] [src/components/WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 同步更新 `DEFAULT_SCENARIOS` 列表中 4 个用例的最新权威 MD5 指纹，确保点击用例装载时前端与后端命中完全一致的切片缓存。

#### [MODIFY] [tests/e2e/four-tier-scenarios.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/e2e/four-tier-scenarios.test.ts)
- 更新 4 个 Case 的 MD5 引用；
- 确保测试全部基于真实物理磁盘缓存运行，断言：
  - Case 1：Tier 1 牌号挂起 -> 模拟抽屉指定 `06Cr19Ni10` -> 恢复后全项齐全，最终结果为 PASS；
  - Case 2：语义对齐表面粗糙度达标 -> 全绿 PASS；
  - Case 3：表面粗糙度 1.50 > 0.8 超标 -> 红灯 FAIL；
  - Case 4：特种剪切韧度歧义 -> 行内 HITL 挂起。

---

## Verification Plan

### Automated Tests
1. **执行用例生成脚本**：
   ```bash
   pnpm tsx scripts/generate-sample-test-cases.ts
   ```
   验证 4 个测试用例 PDF 及 `.cache/parses/<md5>.json` 真实落盘生成。
2. **运行端到端分层核验测试套件**：
   ```bash
   pnpm vitest run tests/e2e/four-tier-scenarios.test.ts
   ```
   验证所有 4 个 Case 基于生产接口真实流转全部断言通过。
3. **运行全量测试套件**：
   ```bash
   pnpm test
   ```
   确保既有 48 个测试文件、所有单元测试无一退化全部通过。

### Manual & Subagent Verification
1. **启动本地开发服务**：
   确保 `pnpm dev` 正常运行于 `http://localhost:3000`。
2. **启动 `browser_subagent` 浏览器子代理实机检验**：
   - 访问 `http://localhost:3000`；
   - 切换至工作台，装载 Case 1 测试用例原件；
   - **关键检验点 1（视觉渲染）**：检查左侧 PDF 预览视窗，截屏验证排版美观度，确认字形清晰、完全没有任何 `☒` 豆腐块乱码、无文本重叠挤压；
   - **关键检验点 2（流程闭环）**：点击开始核验，验证右侧滑出 HITL 抽屉；在推荐列表中选择指定 `06Cr19Ni10` 并提交；
   - **关键检验点 3（全景大盘）**：等待核验完成，验证全景合规矩阵所有条目（化学 7 项、力学 4 项、压扁、扩口、晶腐、超声、水压）均为绿色达标，总结论输出为 **PASS**，无任何遗留漏检报错。
