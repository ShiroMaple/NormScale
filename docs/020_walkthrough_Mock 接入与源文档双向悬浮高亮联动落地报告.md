# 真实质保书.pdf (镇海石化建安 S32168) Mock 接入与源文档双向悬浮高亮联动落地报告

## 🎯 任务概述

用户提供了一份真实的工业质量证明书：[`docs/test/质保书.pdf`](file:///Users/shiromaple/Github/NormScale/docs/test/质保书.pdf)（镇海石化建安工程股份有限公司制管厂，3页，包含 3 个炉批 `Z26022C-DB7`、`Z26022C-DB8`、`Z26022C-E1`）。
本轮迭代的核心目标是：
1. **保留现有 Mock 数据**：现有 3 份历史演示文档（宝武、太钢、武钢）全部保留，将《质保书.pdf》作为第 1 份默认激活文档（`doc_zpje_01`）加入两层树状 Session 体系；
2. **高精度源文档多页连续渲染**：利用 macOS 原生 `PDFKit` 将《质保书.pdf》提取为 3 页高保真 2x Retina PNG（`public/samples/zpje/page-[1-3].png`），左侧视窗支持纵向平铺与比例自适应展示；
3. **精准 BBox 百分比坐标字典与跨炉批垂直偏移**：定义 `src/types/bbox.ts`，涵盖元数据、9大化学元素、拉伸/硬度力学指标、金相晶粒度、压扁/扩口工艺试验、尺寸/表面检验与清单；针对 3 个炉批在第 2 页和第 3 页的不同表格行计算精准垂直偏移；
4. **双向悬浮高亮与平滑滚动联动**：
   - **右到左（Right-to-Left）**：鼠标悬浮右侧任一 4x3 元数据输入框或全部实测项表格行，左侧视窗平滑滚动至对应页并聚焦脉冲高亮（Pulse & Glow）对应 BBox；
   - **左到右（Left-to-Right）**：鼠标悬浮左侧任一 BBox 标注框，右侧对应的输入框或实测表格行同步点亮高光背景。

---

## 🛠️ 核心实施要点

### 1. 真实文档高清多页切图提取
通过 macOS 原生 Swift `PDFKit` 脚本，将 [`docs/test/质保书.pdf`](file:///Users/shiromaple/Github/NormScale/docs/test/质保书.pdf) 渲染为 2x Retina 超清资产：
- `public/samples/zpje/page-1.png` (2.3 MB, 1189.5 × 1683 像素，涵盖表头元数据、化学成分分析表与工艺/检验结论)
- `public/samples/zpje/page-2.png` (2.0 MB, 1189.5 × 1683 像素，涵盖拉伸性能、维氏硬度与晶粒度实测值表)
- `public/samples/zpje/page-3.png` (1.6 MB, 1189.5 × 1683 像素，涵盖产品清单、施工号与几何外径壁厚明细)

### 2. 百分比自适应 BBox 契约定义与多炉批行计算 (`src/types/bbox.ts`)
```typescript
export interface FieldBBox {
  id: string;          // 关联字段唯一 ID，如 "chem_Cr", "mech_tensile", "meta_batchNo"
  page: number;        // 所在 PDF 物理页码 (1, 2, 3)
  x: number;           // 左上角 X 轴百分比 (0.0 ~ 100.0)
  y: number;           // 左上角 Y 轴百分比 (0.0 ~ 100.0)
  w: number;           // 宽度百分比 (0.0 ~ 100.0)
  h: number;           // 高度百分比 (0.0 ~ 100.0)
  label: string;       // 浮层显示的人类可读标签
  category: 'meta' | 'chemical' | 'mechanical' | 'process' | 'metallographic' | 'corrosion' | 'ndt';
}
```
- **多炉批行垂直偏移计算**：
  在 Page 2 中，`Z26022C-DB7`（第 1 行，拉伸 $y=22.8\%$，硬度 $y=38.6\%$），`Z26022C-DB8`（第 2 行，拉伸 $y=24.8\%$，硬度 $y=40.6\%$），`Z26022C-E1`（第 3 行，拉伸 $y=26.8\%$，硬度 $y=42.6\%$）；
  在 Page 3 中，产品明细行按批次索引对应偏移（$y=29.0\% + \text{idx} \times 2.0\%$）。

### 3. 工作台两层树状 Session 接入 (`src/types/session.ts`)
- 将 `doc_zpje_01` 插入 `DEFAULT_INSPECTION_SESSION.documents` 首位，包含全部 3 个炉批完整实测数据；
- 扩展 `SessionDocument` 支持 `samplePages?: string[]`，当存在切图时自动启用多页真实图层，无切图时平滑回退至纸张排版。

### 4. 双向交互与视窗平滑滚动 (`src/components/WaterfallWorkbench.tsx`)
- **左侧视窗**：
  - 纵向连续平铺 3 张高清页面，右上方显示页码徽章（如 `第 1 / 3 页`）；
  - 顶部工具栏 `< 1 / 3 >` 控制翻页与平滑跳转；
  - 覆盖绝对定位的百分比 BBox 框，激活时带 `ring-2 ring-primary ring-offset-1 bg-primary/25 border-2 border-primary z-20 shadow-md animate-pulse` 脉冲效果与顶部悬浮 Label 胶囊。
- **右侧输入框与表格行**：
  - 4x3 网格中的 9 个元数据与批次号输入框均绑定 `handleFieldHover` 与动态高光样式；
  - 全部实测项总览表格行绑定 `handleFieldHover(row.fieldId)`；
  - 分类视图（化学元素表格、力学性能卡片、工艺试验卡片、金相组织卡片等）均实现双向联动。

### 5. 左右双栏独立滚动条与单侧定向平滑滚动
- **消除外部全局滚动条**：将 Step 2 整体外层卡片设置为 `overflow-hidden flex flex-col h-full`，顶部 `BatchContextBar` 独立置顶 `shrink-0`，确保外层主页面无论视口高度如何均绝无多余滚动条；
- **左右视窗挂载独立滚动条**：
  - 左侧 PDF 视窗：`pdfScrollContainerRef` 挂载 `flex-1 overflow-y-auto custom-scrollbar`，支持 3 页连续平铺与鼠标自由滚动；
  - 右侧核对卡片：`rightScrollContainerRef` 挂载 `flex-1 overflow-y-auto custom-scrollbar`，支持元数据与多类实测数据独立滚动。
- **单侧精准定向滚动（彻底杜绝全局页面随动）**：
  - 移除原 `scrollIntoView({ behavior: 'smooth', block: 'center' })`，避免跨祖先容器冒泡导致全局视口位移；
  - **Hover 右侧 $\to$ 仅滚动左侧**：`scrollToLeftBBox(fieldId)` 通过 `pdfScrollContainerRef.current.scrollTo` 精准将目标 BBox 居中，右侧面板及外部页面完全静止；
  - **Hover 左侧 $\to$ 仅滚动右侧**：`scrollToRightField(fieldId)` 通过 `rightScrollContainerRef.current.scrollTo` 精准将目标数据行/输入框居中（若已在可见区则不抖动），左侧视窗及外部页面完全静止。

### 6. 双炉号追溯复合单元格与独立 BBox 联动
- **4×3 网格空间保持**：将第 4 行第 1 列的“冶炼炉号”单元格升级为“双炉号追溯 (Heat / Pack No.)”，维持 4×3 矩形对齐与 12 槽位对称；
- **内部双胶囊独立输入与高亮**：
  - `冶炼 Heat:` (`right-field-meta_heatNo`)：独立绑定 Hover 联动源文档 Page 1 左侧原材料炉号 BBox；
  - `热处理 Pack:` (`right-field-meta_packNo`)：独立绑定 Hover 联动源文档 Page 1 右侧钢管热处理炉号 BBox；
  - 源文档 Page 1 上分别悬浮两个不同的炉号 BBox 时，平滑滚动至该单元格并分别仅高亮对应的半边输入框。

### 7. PDF 原件视窗高亮停留 1s 原位平滑放大 200% 与即时缩回复原
- **原位整页平滑缩放（Canvas Scale）**：
  - 计算当前高亮 BBox 几何中心点 `(originX, originY) = (box.x + box.w/2, box.y + box.h/2)`；
  - 使用 GPU 加速的 CSS `transform: scale(2)` 与 `transform-origin`，实现聚焦中心原地向外平滑展开；
  - 仅作用于左侧 PDF 视窗内部（`overflow-x-auto`），被放大页挂载 `z-30 shadow-2xl ring-2 ring-primary/60` 与“聚焦放大 200%”徽标，全局页面与其他分栏完全静止。
- **防晕眩 1000ms 延迟与离开即时缩回复原调度**：
  - 统一在 `handleFieldHover` 与 `scrollToRightField` 中注入 1000ms 防抖倒计时：快速划过表格行不触发缩放，仅稳定停顿 $\ge 1$ 秒后激活 200% 聚光灯效果；
  - 鼠标离开（`handleFieldHover(null)`）立即撤销放大，通过 `cubic-bezier(0.16, 1, 0.3, 1)` 在 250ms 内极速平滑缩回原尺寸；
  - 独立于右上角全局手动缩放基准值，复原时无缝保持原有缩放设置。

### 8. 高亮框单实线重构、零遮挡优化与坐标回归第一版成熟基准
- **高亮边框视觉降噪与零遮挡**：
  - 移除 `ring-2 ring-offset-1`，改为单实线 `border-2 border-primary`，消除双层线条和外膨胀压线；
  - 背景调优为清透的 `bg-primary/10`，底层印章、文字与表格线 100% 清晰可辨；
  - 消除原本叠加在单元格上方的 `-top-7` 悬浮 Tooltip（杜绝遮挡上一行表头），改为在 PDF 页面左上角空白边距呈现 `已定位 / 聚焦放大 200%` 状态徽标。
- **BBox 坐标回归第一版成熟基准**：
  - 全面回滚 Page 1、Page 2、Page 3 至用户认可的第一版成熟 Y 坐标基准（彻底消除由于全局测量重算导致整体上浮 1 行的偏差）；
  - 仅对延伸率进行细微的 X 轴收拢微调（`x: 68.8, w: 19.8`），解决第一版中延伸率左边框轻微跨越列分界线的问题，其余所有字段均保持第一版的准确对齐。

### 9. 解析数据展示栏置信度列移除、试验方法去伪求真与依据/结果纯文本独立 BBox 溯源
- **移除冗余置信度列**：
  - 从解析数据总览大表及化学成分卡片中彻底剔除“置信度”一列，横向空间等比释放给“检验项目”、“测得值”与“依据标准”，彻底消除长标准代号与长数值字符串折行问题；
- **试验方法客观求真（消除脑补幻觉）**：
  - 化学成分 9 元素由于源文档（`质保书.pdf`）未打印独立方法标准，如实客观展示为 `-`（依据产品总标准），彻底根除此前脑补的 `GB/T 4336` 幻觉；
- **依据与结果纯文本独立 BBox 溯源（无图标、无边框）**：
  - 将表格中同一行的【提取测得值 / 试验结果】与【试验依据方法 / 标准】解耦为两个独立的交互项；
  - 彻底去除外围边框与图标，保留纯净自然的工业排版排版风格；
  - Hover 测得值文本：左侧 PDF 视窗精准高亮原件数值（如 `621、620` 或 `合格 OK`）；
  - Hover 试验依据文本：左侧 PDF 视窗精准高亮原件方法标准区域（如 Page 2 表头 `GB/T 228.1-2021` 或 Page 1 下部的执行标准列）。

---

## 🧪 自动化测试与质量验收

```bash
$ pnpm typecheck
$ tsc --noEmit
# Exit code 0 (严格模式下零类型错误)

$ pnpm test
# Exit code 0
# Test Files  23 passed (23)
#      Tests  111 passed (111)
```

- **测试用例校验**：[`tests/extractor/zpje-bbox.test.ts`](file:///Users/shiromaple/Github/NormScale/tests/extractor/zpje-bbox.test.ts)
  - 验证新增的独立方法标准 BBox（`method_tensile`、`method_hardness`、`method_grain`、`method_proc_flattening`、`method_proc_flaring` 等）在字典中全部完整映射且坐标合法；
  - 验证全部 19+ 个业务字段与各方法标准映射无缺失。

---

## 📋 关联代码清单

| 文件 | 变更说明 |
|---|---|
| [`src/components/WaterfallWorkbench.tsx`](file:///Users/shiromaple/Github/NormScale/src/components/WaterfallWorkbench.tsx) | 修改：移除置信度列；化学成分方法标为 '-'；测得值与依据方法拆分独立 hover；去除图标与边框按钮样式，保持极简排版 |
| [`src/types/bbox.ts`](file:///Users/shiromaple/Github/NormScale/src/types/bbox.ts) | 修改：Page 1 下表拆分 Col 2 标准与 Col 3 结果独立 BBox；Page 2 新增拉伸、硬度与晶粒度方法标准表头 BBox |
| [`tests/extractor/zpje-bbox.test.ts`](file:///Users/shiromaple/Github/NormScale/tests/extractor/zpje-bbox.test.ts) | 修改：补充 10 个独立方法标准 BBox 的测试断言，确保全流程数据字典契约一致 |
| [`cairn/LOG.md`](file:///Users/shiromaple/Github/NormScale/cairn/LOG.md) | 修改：追加置信度列移除、试验方法求真与独立 BBox 溯源落地的记录 |
