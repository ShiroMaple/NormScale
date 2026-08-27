# 移除解析数据置信度列、试验方法求真与依据/结果独立 BBox 溯源联动实施方案

通过与用户的 `/grill-me` 深度访谈，本次重构旨在彻底消除解析数据中的猜测幻觉，精简界面无用信息，并打造业界领先的“**结果与依据独立双通道 BBox 原件溯源**”质检体验。

## 核心设计决策与对齐结论

1. **移除置信度列**：右侧实测表格彻底去除千篇一律的“置信度（99%、98%）”列，释放横向空间保证长标准号与实测值完全不折行；
2. **试验方法去幻觉求真**：化学成分等源文档未打印独立方法标准的项目统一标注为 `-`（依产品总标准），彻底移除“GB/T 4336 火花放电原子发射光谱法”等主观猜测；
3. **依据与结果独立双向 BBox 溯源**：
   - 同一行内将【提取测得值/结果】与【试验依据方法/标准】解耦为两个独立交互单元格；
   - Hover 测得值：左侧视窗精准高亮原件数值（如 `621、620` 或 `合格 OK`）；
   - Hover 试验依据：左侧视窗精准高亮原件表头或表格内的标准号（如 `GB/T 228.1-2021` 或 `GB/T 246-2017`）。

---

## 拟定变更明细

### 1. BBox 坐标字典扩展与拆分 ([`src/types/bbox.ts`](file:///Users/shiromaple/Github/NormScale/src/types/bbox.ts))
- **Page 1 下部综合试验表拆分**：
  - 将原跨列单框（`w: 78.5%`）拆分为：
    - `proc_*` / `ndt_*` / `corrosion_*` / `geo_*` / `surface_*`：指向 Col 3 `试验结果`（`x: 60.0, w: 28.5`，即 `合格 OK` 区域）；
    - `method_proc_*` / `method_ndt_*` 等：指向 Col 2 `执行标准`（`x: 30.2, w: 28.5`，即具体标准号区域）。
- **Page 2 力学与金相方法标准表头定义**：
  - `method_tensile`：指向拉伸表头 `执行标准 Standards: GB/T228.1-2021`（`page: 2, x: 28.0, y: 16.5, w: 42.0, h: 1.8`）；
  - `method_hardness`：指向硬度表头第二行 `GB/T4340.1-2024`（`page: 2, x: 30.0, y: 32.2, w: 29.5, h: 2.2`）；
  - `method_grain`：指向晶粒度表头第二行 `GB/T6394-2017`（`page: 2, x: 60.0, y: 32.2, w: 28.5, h: 2.2`）。

### 2. 实测数据模型与方法字段去伪求真 ([`src/components/WaterfallWorkbench.tsx`](file:///Users/shiromaple/Github/NormScale/src/components/WaterfallWorkbench.tsx))
- 在 `allExtractItems` 组装中：
  - 化学成分：`method: '-'`，`methodFieldId: undefined`；
  - 拉伸试验（Rm、Rp0.2、A）：`method: 'GB/T 228.1-2021'`，`methodFieldId: 'method_tensile'`；
  - 维氏硬度：`method: 'GB/T 4340.1-2024'`，`methodFieldId: 'method_hardness'`；
  - 晶粒度：`method: 'GB/T 6394-2017'`，`methodFieldId: 'method_grain'`；
  - 工艺与探伤：`method: 'GB/T ...'`，`methodFieldId: 'method_proc_...'`。
- 表格列定义由 5 列缩减为 4 列：
  - `类别`（80px 固宽）
  - `检验项目`（26% 宽度）
  - `提取测得值 / 试验结果`（37% 宽度，单元格挂载 `onMouseEnter={() => scrollToLeftBBox(item.fieldId)}`）
  - `试验依据方法 / 标准`（37% 宽度，单元格挂载 `onMouseEnter={() => item.methodFieldId && scrollToLeftBBox(item.methodFieldId)}`）
  - 彻底删除 `置信度` 表头 `<th>` 与内容 `<td>`。
- 同步精简分类专业视图（化学成分视图、力学视图等）中的“置信度”列与硬编码的 `GB/T 4336`。

### 3. 测试套件维护与断言补全 ([`tests/extractor/zpje-bbox.test.ts`](file:///Users/shiromaple/Github/NormScale/tests/extractor/zpje-bbox.test.ts))
- 增加对新增方法 BBox（`method_tensile`、`method_hardness`、`method_grain`、`method_proc_flattening` 等）的字段完整性测试与坐标区间校验。

---

## 验证计划

### 自动化测试
```bash
pnpm typecheck
pnpm test
```

### 交互效果验证
1. 打开 `http://localhost:3000/`；
2. 检查 Step 2 解析数据核对表：
   - 确认“置信度”一列已完全消失；
   - 确认化学成分 9 元素的“试验依据”显示为清爽的 `-`；
   - 悬停在【抗拉强度 621、620】单元格：左侧 PDF 视窗 Page 2 精准高亮该批次的数值单元格；
   - 悬停在【GB/T 228.1-2021】单元格：左侧 PDF 视窗 Page 2 精准高亮拉伸表头的方法标准单元格；
   - 悬停在【压扁试验 合格 OK】单元格：左侧 PDF 视窗 Page 1 精准高亮 Col 3 结果格；
   - 悬停在【GB/T 246-2017】单元格：左侧 PDF 视窗 Page 1 精准高亮 Col 2 标准格。
