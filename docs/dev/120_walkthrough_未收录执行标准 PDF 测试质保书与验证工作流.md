# 未收录执行标准 PDF 测试质保书与验证工作流 Walkthrough

针对测试目标 **“质保书中提及的执行标准不在本项目当前标准库的涵盖范围内”**，本项目已完成高保真工业级 PDF 测试质保书的设计与生成，并配套完成了端到端自动化测试验证。

---

## 1. 核心产物清单

### 1.1 独立 PDF 生成脚本
- **文件路径**：[generate-unsupported-standard-pdf.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/scripts/generate-unsupported-standard-pdf.ts)
- **技术规范**：遵循 PDF 1.4 规范与 Standard 14 Type 1 字体（Helvetica / Helvetica-Bold），跨平台 WinAnsiEncoding 编码，零字库依赖与零排版乱码风险；
- **版式结构**：工业边框、EN 10204 3.1 声明栏、基础元数据九宫格、熔炼化学成分表、室温拉伸力学性能表、工艺与无损检验汇总、质检放行结论与 QA 红色验讫印章。

### 1.2 编译输出的 PDF 测试文件
- **文件路径**：`public/samples/astm_a312_tp316l_unsupported_standard.pdf` (7,075 字节)
- **核心业务要素**：
  - 声明执行标准：`ASTM A312 / A312M`（标准库未涵盖）
  - 声明材质牌号：`TP316L (UNS S31603)`
  - 证书编号：`MTC-2026-ASTM-A312-901`
  - 几何规格：`1" NPS Sch 10S (OD 33.40mm x WT 2.77mm x L 6000mm)`
  - 理化数据：C 0.022%, Cr 17.35%, Ni 12.18%, Mo 2.12%, Rm 565 MPa, Rp0.2 252 MPa, A 46.0%, HRB 81 等。

### 1.3 自动化测试用例
- **文件路径**：[unsupported-standard.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/workflow/unsupported-standard.test.ts)
- **覆盖场景**：
  1. **负向拦截**：当质保书声明标准未被标准库收录时，工作流在「节点 3：检索标准库 (retrieve-standard)」精确识别，状态置为 `failed`，阻断下游核验，并输出明确诊断：`未收录标准 [ASTM A312 / A312M]，请检查标准代号或在标准库中补充配置`；
  2. **正向恢复**：当调用方或质检员在核验选项中显式映射系统收录标准（如 `forcedStandardId: 'GB/T 13296-2023'`）时，工作流可越过标准缺失阻断正常执行，完成全规则比对并产出合格报告。

### 1.4 Cairn 知识与协作日志
- **文件路径**：[cairn/LOG.md](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/LOG.md)（顶部追加本次进展与验证记录）。

---

## 2. 验证与测试结果

| 验证项 | 执行命令 | 结果 |
| :--- | :--- | :--- |
| **PDF 生成验证** | `pnpm tsx scripts/generate-unsupported-standard-pdf.ts` | 成功输出 7,075 字节矢量 PDF |
| **类型门禁** | `pnpm exec tsc --noEmit` | **0 错误 (Pass)** |
| **代码纯洁度与架构防伪门禁** | `pnpm audit:hygiene` | **Pass (未发现任何硬编码假数据与特定样本泄漏)** |
| **专属测试套件** | `pnpm vitest run tests/workflow/unsupported-standard.test.ts` | **2 passed (100%)** |
| **系统全量回归测试** | `pnpm test` | **86 passed (86 文件), 534 passed (534 用例)** |

---

## 3. 使用与验证指引

1. **直接查看/下载测试 PDF**：可在项目的 `public/samples/astm_a312_tp316l_unsupported_standard.pdf` 直接查阅。若启动 Next.js 本地开发服务（`pnpm dev`），可通过浏览器访问 `http://localhost:3000/samples/astm_a312_tp316l_unsupported_standard.pdf`；
2. **在质检工作台中上传测试**：在步骤 1（文件解析与入库）直接拖拽上传该 PDF 文件，可验证从上传、OCR/多模态提取到标准检索阻断的完整业务闭环；
3. **重新生成/调整参数**：如需定制修改标准代号或实测数值，可直接修改并执行 `pnpm tsx scripts/generate-unsupported-standard-pdf.ts`。
