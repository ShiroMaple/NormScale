# 034 · Phase 9 真实文档解析闭环、BBOX 像素级贴合与新 Agent 阶段交接报告

> **文档定位**：记录 Phase 9 真实物理质保书解析闭环、全工程特化 Mock 债务彻底清零、PDF 客户端高保真栅格化与 BBOX 像素级贴合成果，并作为接棒新 Agent 的全景交接指南。

---

## 一、 项目定位与技术栈约束 (Tech Stack Constraints)

- **项目定位**：基于工业国家/行业执行标准的质量证明书（MTC）合规检验引擎与智能比对系统。
- **运行时环境**：Node.js 22 LTS（严格版本 `>=22.0.0 <23.0.0`）。
- **包管理器**：**严格仅使用 `pnpm`**（严禁执行 `npm`、`npx`、`yarn`；使用 `pnpm dlx` 替代 `npx`）。
- **前端技术栈**：Next.js 15 (App Router only, React 19), TypeScript (Strict Mode, 0 `any`), Tailwind CSS。
- **知识管理体系**：使用 Project Cairn 标准；`AGENTS.md` 是规则入口，`cairn/` 是知识层与唯一真相层。

---

## 二、 核心架构与流水线机制 (Core Architecture)

```
       Step 1: 上传/缓存选择 ──▶ Step 2: 结构化核对 ──▶ Step 3: 全景比对矩阵 ──▶ Step 4: 报告与归档
       (按文件名去重与持久化)   (Pages 高保真/BBox联动)   (确定性计算+HITL抽屉)   (双轨制电子签名导出)
```

1. **Step 1（文档入库与缓存层）**：
   - 存储路径：本地文件解析缓存统一持久化在 `.cache/parses/<md5>.json`；
   - 去重机制：`ParseCacheStore` 与 `GET /api/documents/cached` 实现了**同名文件自动覆盖与列表聚合去重**，杜绝同一文档产生多张历史卡片。
2. **Step 2（高保真视窗与双向 BBox 联动）**：
   - **页面栅格化机制**：真实 PDF 上传时，客户端通过 `src/utils/pdf-renderer.ts` 自动将 PDF 各页栅格化为高清图像列表，挂载至 `currentDoc.pages`；
   - **双向联动**：页面采用原生 `<img>` 结合百分比 BBox 图层，右侧字段 hover 时平滑滚动居中并停留 1 秒激活 200% 聚光灯聚焦放大；左侧抓手拖拽平移（`cursor-grab`）与 50%~300% 缩放绝对物理对齐；
   - **状态保护**：`handleDocumentParsed` 回调中显式保护已有 `pages`，防止大模型后端空响应覆盖清空；同时在视窗增加 `fallbackBlobUrl` 原件保底渲染层，杜绝无响应卡死。
3. **Step 3（全景合规比对与 HITL 人机协同）**：
   - **理化指标确定性计算**：化学成分（`chemical.map`）、力学性能、尺寸公差均走 TypeScript 代码级确定性计算与 GB/T 8170 规则修约，零幻觉；
   - **HITL 抽屉彻底动态化**：`HitlDrawer.tsx` 100% 动态读取 `hitlContext` 及当前批次数据，任务号（`TK-${batchNo}`）、条款依据与审批事实全部实时动态驱动；
   - **解析中状态隔离**：通过 `isHitl = currentBatch.verdict === 'MANUAL_REVIEW' && !isDocParsing` 确保流式解析阶段绝对不误弹 HITL 介入按钮。
4. **Step 4（双轨制判定与报告）**：
   - 区分系统客观计算结论（`PASS`/`FAIL`）与质检员终审背书（`APPROVE`/`REJECT`/`CONCESSION_RELEASE`），详细契约见 `cairn/dual-track-verdict.md`。

---

## 三、 本阶段已彻底清理的重大技术债务

| 历史隐患 / 硬编码 | 根因与风险 | 当前真相与重构规范 |
|---|---|---|
| `docId === 'doc_zpje_01'` 特化分支 | 早期针对镇海石化标杆样本写死了尺寸、表面及坐标字典判断，导致新文件无法联动。 | **全量拔除**。统一为 `docBboxesMap: Record<string, FieldBBox[]>` 与 `currentBatch.dimensions` 动态属性。 |
| `batchNo.includes('DB7')` 假超标判定 | 在牌号 Override 逻辑中写死了针对 DB7 批次的假 Cr 含量超标与 Mo 缺失判定。 | **全量拔除**。改为由当前选中国标规则切片纯动态核验。 |
| 初始批次号假数据 `GR2026-2-01` 与 `"待提取"` | 上传文件时由文件名拼接假批次号，未提取字段填入“待提取”。 | **全量拔除**。初始未提取项统一留空（`''`）且使用统一占位符，提取结果统一定制为主题蓝字号加粗样式。 |
| HITL 写死条款与假工号 `JAQA-8888` | 抽屉卡片直接写死 GB/T 13296 第 7.5 条涡流代水压与虚拟工号。 | **全量拔除**。100% 由 `hitlContext.alternative_details` 动态注水。 |
| 渲染体内内联调用 `URL.createObjectURL` | 流式解析（30ms/次）触发父组件 re-render，导致 iframe 高频重载剧烈闪烁。 | **全量拔除**。采用 `uploadedFileUrls` 单次创建与卸载销毁缓存机制。 |

---

## 四、 给接棒新 Agent 的核心工作守则 (Critical Guardrails)

1. **Zero-Mock by Default（严禁任何业务假数据兜底）**：
   - 严禁在非测试文件中写死任何具体的炉批号（如 `DB7`）、施工号（如 `26XXX`）、质保书号、厂家名称或假检验数据；
   - 未提取字段遵循自然留空，严禁编写 `value || '合格'` 形式的假数据补丁。
2. **Schema-First 驱动（严禁编写任何 ID 特化分支）**：
   - 所有 UI 组件与数据转换函数必须严格基于标准 TypeScript 接口（`SessionDocument`, `BatchSpecimen`, `FieldBBox`），严禁包含 `if (docId === 'xxx')`。
3. **命名契约规范**：
   - 页面图像列表统一使用 `currentDoc.pages`（`SessionDocument.pages?: string[]`），旧 `samplePages` 仅作为兼容别名存在。
4. **Git 提交门禁**：
   - 变更前请务必确认用户是否允许提交 Git（用户明确要求不提交时不执行 `git commit`）。

---

## 五、 自动化测试与工程验证基线

接棒 Agent 在完成任何修改后，必须运行以下命令进行闭环验证，确保 100% 绿色通过：

```bash
# 1. 严格 TypeScript 类型检查 (必须 0 错误)
pnpm typecheck

# 2. 全量 Vitest 单元与集成测试 (当前基线: 27 个测试套件，121 个用例全部通过)
pnpm test
```

---

## 六、 下一步路线图任务 (Roadmap Actions)

根据 `cairn/ROADMAP.md`，接下来的核心聚焦点为 **Phase 10（多标准引用规则叠加与双标尺透明追溯引擎）**：
1. **多标准切片合成算法**：完善 `composeMultiStandardSlices()`，实现多个标准叠加时“共有指标取严苛交集（包络线原则）、非共有项取并集”；
2. **Step 3 全景比对矩阵双标尺透出**：在全景矩阵与报告中展示双标准条款依据与剪刀差归因（详见 `cairn/multi-standard-engine.md`）；
3. **双轨制放行仲裁矩阵数据持久化**：打通质检员特批放行/一票否决与电子签名存证（详见 `cairn/dual-track-verdict.md`）。
