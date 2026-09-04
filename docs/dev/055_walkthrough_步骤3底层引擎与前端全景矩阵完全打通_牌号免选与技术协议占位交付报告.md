# 步骤 3 底层引擎与工作台全景矩阵完全打通、牌号免选与技术协议占位交付报告

根据用户指令“牌号选择器的位置，留给‘应用技术协议’，以后完善，选项暂时留空不填充内容。其余无意见，按计划实施”，本项目全面完成了底层合规计算引擎与前端工作台步骤 3（比对与放行）的深度贯通，彻底废除了所有前端写死的 mock 数据与局部规则特例代码，并确立了客观裁决的牌号免选架构。

---

## 一、核心变更清单

### 1. 牌号免选原则与三层协同架构落地
- **牌号免选与客观否决**：质保书自身声明牌号是出厂合格判定的唯一法定基准。如果实测化学/力学性能与声明牌号不符，引擎直接给出客观否决（`FAIL`），严禁允许质检员在步骤 3 随意切换牌号“凑合格”。
- **三层治理分工闭环**：
  1. **步骤 2（数据核对与编辑）**：负责解决印鉴遮挡、手写模糊或 OCR 识别折损，支持质检员原位修正字符；
  2. **HITL 抽屉（人机协同）**：负责跨国/非标别名消歧（例如识别出 `TP304` / `SUS304` 映射至 `06Cr19Ni10`）；
  3. **步骤 3（比对与放行）**：只读展示质保书声明牌号胶囊（`核验牌号: ${grade}`），不提供下拉修改，由引擎执行绝对客观合规计算。
- **原牌号选择器置换为【应用技术协议】（留空占位）**：
  - 在步骤 3 控制栏原牌号下拉框位置，替换为【应用技术协议】选择卡片；
  - 触发器展示 `暂无挂接技术协议 (选项留空)` 与虚线边框；
  - 展开 Popover 明确提示“当前会话暂未挂接定制技术协议，选项留空不填充内容，留待后续完善技术协议加严调度体系”。

### 2. 后端与 LangGraph 状态图直通扩展
- **端点契约扩展**：[`src/app/api/audit/submit/route.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/audit/submit/route.ts)
  - 契约支持 `batchSpecimen`、`standardIds`、`gradeKey` 直接提交；
  - 增强 `batchSpecimenToCertificateExtract` 适配器：
    - 尺寸规范化提取（`dimensions: { outer_diameter_mm, wall_thickness_mm }`），激活依赖壁厚/管径的条件规则（如压扁试验、硬度分级要求）；
    - 承压与致密性检验（`pressure_tightness`：水压试验、涡流探伤、超声波探伤）规范化注入；
- **状态图节点短路与防御**：
  - [`src/workflow/nodes/extract.node.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/extract.node.ts)：检测到已预先完成结构化抽取的批次时，安全透传入参并兼容 JSON 序列化；
  - [`src/workflow/nodes/retrieve-standard.node.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/retrieve-standard.node.ts)：未收录标准时早返回报错（`未收录标准 [...]`），精准拦截非法请求；
  - [`src/workflow/nodes/normalize.node.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/normalize.node.ts)：识别已完备规范化的 `CertificateExtract` 数据直通下游确定性评估节点。

### 3. 前端工作台步骤 3 去硬编码与 100% 引擎驱动
- **彻底废除前端伪造 Mock**：[`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
  - 彻底删除约 275 行写死的 `chemRows`、`mechRows`、`metalloRows` 以及针对断后伸长率 35/40 的局部 if-else 特例代码；
  - 全景比对矩阵数据 100% 来源于 `currentBatch.auditReport.item_results`；
  - 漏检项自动以红标高亮展示 `【✗ 漏检/未检验】`；
  - 质保书独占的非标工程字段（如工程号、施工批号）归并于表底 `【ℹ️ 供参考】` 区域。
- **全动态执行标准数据源**：
  - 彻底废除前端静态写死的 `STANDARDS_CATALOG` 依赖，优先解构自 `standardsData`（`GET /api/standards`），全动态构建多选目录与分类徽标。
- **历史台账防重算安全机制**：
  - 载入已有 `auditReport` 的历史批次时，原汁原味渲染历史检验现场，严禁静默重算破坏历史证据；
  - 保留右侧常驻【重新核验】按键（配备 spin 动效），支持质检员显式触发复算；
  - 增设高质感 6 行骨架加载动画（Skeleton Loading），消除数据请求时的页面跳动。

---

## 二、测试与质量验证

```bash
# 1. 严格 TypeScript 类型检查 (0 错误)
pnpm run typecheck

# 2. 全量单元测试套件 (39 个测试文件，180 个测试用例 100% 绿色通过)
pnpm test
```

### 专项测试结果
- 新增集成测试 [`tests/api/audit-submit-batch.test.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/api/audit-submit-batch.test.ts)：
  - **用例 1**：直接提交批次试样对象 + 单标准（`GB/T 13296-2013`）：16 项规则（含化学成分、力学拉伸、硬度、压扁、晶粒度、晶间腐蚀、水压/涡流无损探伤等）100% 自动化精准判定通过（`PASS`）；
  - **用例 2**：多标准合成直通核验（`GB/T 13296` + `NB/T 47019.5`）：准确识别并输出 $R_p0.2$ 加严剪刀差与责任归因。

---

## 三、Project Cairn 知识沉淀
- **知识专题更新**：[`cairn/multi-standard-engine.md`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/multi-standard-engine.md) 第 6 节《前端工作台步骤 3 深度贯通、牌号免选与全景矩阵 100% 引擎驱动》；
- **项目日志同步**：[`cairn/LOG.md`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/LOG.md) 顶部记录里程碑进展；
- **路线图同步**：[`cairn/ROADMAP.md`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/ROADMAP.md) 开放问题 6 标记已闭环。
