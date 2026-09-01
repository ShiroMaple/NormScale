# Phase 2 技术实施方案：标准规则库存储、规格切片 (Specification Slice) 架构与全量入库管线

## 1. 目标与背景

在 Phase 1 中，我们已完成元模型建模、工业修约与确定性规则核验引擎，并通过了 5 组黄金用例测试。
**Phase 2 的核心目标**：
1. **架构升维（Specification Slice 规格切片）**：将底层规则存储从狭义的“材料牌号（Grade）”解耦泛化为“规格切片（Specification Slice）”，统一抽象支撑**金属牌号、紧固件性能等级（8.8/10.9）、法兰压力等级（PN16/Class 150）与密封件胶料代号（NBR 70）**。
2. **规则存储与检索层（`RuleStore` 仓库模式）**：构建基于模块化文件与内存倒排索引的秒级检索仓库 `FileRuleStore`，支持 $O(1)$ 级别按标准号与别名/代号动态切片加载，同时通过抽象接口解耦底层存储。
3. **《GB/T 13296-2023》全量 31 个钢级规则落地**：对照 [GB 13296-2023.pdf](file:///Users/shiromaple/Github/NormScale/docs/GB%2013296-2023.pdf) 原文，完整录入全部 31 个牌号（28 个奥氏体、3 个铁素体）的理化、力学、工艺、无损与豁免规则，以及表 1 / 表 2 的外径与壁厚公差矩阵。
4. **离线 ETL 与标准校验 CLI 工具**：提供 `pnpm standard:validate` 等自动化工具链，实现标准入库前的强类型契约校验与索引构建。

---

## 2. 系统设计与技术方案

### 2.1 模块化规格切片目录体系

```
data/standards/
└── GB_T_13296_2023/
    ├── meta.json                    # 标准元数据、适用形态及表1/表2几何尺寸公差表
    ├── clauses.json                 # 全文定性条款与工艺说明集合 (供语义 RAG 检索)
    └── slices/                      # 31 个钢级规格切片 (单文件 80~150 行，维护极轻量)
        ├── S30408_06Cr19Ni10.json
        ├── S30403_022Cr19Ni10.json
        ├── S31608_06Cr17Ni12Mo2.json
        ├── S31603_022Cr17Ni12Mo2.json
        ├── S32168_06Cr18Ni11Ti.json
        ├── S32169_07Cr19Ni11Ti.json
        ├── S34778_06Cr18Ni11Nb.json
        ├── S39042_015Cr21Ni26Mo5Cu2.json (904L)
        ├── S11710_10Cr17.json
        └── ... (共 31 个切片文件)
```

---

### 2.2 核心架构接口定义 (Repository Pattern)

```typescript
// 1. 统一规格切片模型定义
export interface SpecificationSlice {
  spec_key: string;                          // 切片唯一标识，如 "S30408" 或 "Class_8.8"
  spec_type: 'grade' | 'property_class' | 'pressure_class' | 'material_group';
  display_name: string;                      // 界面展示名，如 "06Cr19Ni10 (S30408)"
  unified_code?: string;                     // 统一代号
  aliases: string[];                         // 别名字典 ["SUS304", "TP304", "0Cr18Ni9"]
  description?: string;
  applicability_scope?: ApplicabilityScope;
  evaluation_rules: EvaluationRule[];        // 本切片包含的全部原子比对规则
}

// 2. 规则仓库标准抽象契约
export interface IRuleStore {
  // 按照标准代号与规格主键/别名快速定位切片
  resolveRuleSlice(standardId: string, routingKey: string): Promise<SpecificationSlice | undefined>;
  
  // 获取标准元数据与全局尺寸公差表
  getStandardMeta(standardId: string): Promise<StandardMeta | undefined>;
  
  // 组装完整标准规则集 (兼容现有 ComplianceEngine.evaluate 纯函数)
  getCompleteStandard(standardId: string): Promise<StandardRuleSet | undefined>;
  
  // 列出当前库中已收录的所有标准与切片清单
  listAvailableStandards(): Promise<Array<{ standard_id: string; standard_name: string; slice_count: number }>>;
}
```

---

### 2.3 尺寸公差匹配评估器 (`tolerance-evaluator.ts`)
根据质保书提取的公称外径 $D$、壁厚 $S$ 及制造工艺（冷拔 W-C / 热轧 W-H），自动匹配《GB/T 13296-2023》表 1（最小壁厚交货偏差）或表 2（公称壁厚交货偏差），生成尺寸合规判定。

---

## 3. 拟实施的具体变更

### 3.1 元模型扩展
#### [MODIFY] [standard.schema.ts](file:///Users/shiromaple/Github/NormScale/src/schemas/standard.schema.ts)
- 增加 `SpecificationSliceSchema` 与 `DimensionToleranceTableSchema` 强类型定义。
- 保持向后兼容现有 `GradeRuleSchema`。

---

### 3.2 规则仓库实现
#### [NEW] [rule-store.interface.ts](file:///Users/shiromaple/Github/NormScale/src/repository/rule-store.interface.ts)
- 定义 `IRuleStore` 抽象接口契约。

#### [NEW] [file-rule-store.ts](file:///Users/shiromaple/Github/NormScale/src/repository/file-rule-store.ts)
- 实现基于文件系统 + 内存索引缓存的 `FileRuleStore`：
  - 启动时预建 `standard_id + normalized_alias -> slice_path` 内存倒排哈希表；
  - 查询时间复杂度 $O(1)$，无磁盘冗余遍历；
  - 支持热重载与按需惰性加载。

#### [NEW] [tolerance-evaluator.ts](file:///Users/shiromaple/Github/NormScale/src/engine/tolerance-evaluator.ts)
- 实现依据表 1、表 2 尺寸公差区间的自动匹配与核验。

---

### 3.3 全量标准数据录入与拆分
#### [NEW] `data/standards/GB_T_13296_2023/meta.json`
- 存放《GB/T 13296-2023》元信息与表 1 / 表 2 完整尺寸公差矩阵。

#### [NEW] `data/standards/GB_T_13296_2023/slices/*.json` (共 31 个牌号切片)
- **奥氏体 28 个**：S30210, S30408, S30403, S30409, S30458, S30453, S30920, S30908, S31020, S31008, S31608, S31603, S31609, S31668, S31658, S31653, S31688, S31683, S39042, S31708, S31703, S32168, S32169, S34778, S34779, S38148, S31252, S38367。
- **铁素体 3 个**：S11710 (10Cr17), S12791 (008Cr27Mo), S11306 (06Cr13)。
- 每一项指标均严格对应 `GB 13296-2023.pdf` 的表 3、表 4、表 5 及对应文本条款。

#### [DELETE] [data/standards/GB_T_13296_2023.json](file:///Users/shiromaple/Github/NormScale/data/standards/GB_T_13296_2023.json)
- 将单体测试 JSON 平滑迁移为模块化切片目录结构。

---

### 3.4 离线校验与 ETL CLI 工具
#### [NEW] [validate-standards.ts](file:///Users/shiromaple/Github/NormScale/src/tools/validate-standards.ts)
- 遍历 `data/standards/` 目录，执行 Zod 强类型校验、别名冲突扫描与公式语法静态检查。
- 配置 npm script: `pnpm standard:validate`。

---

## 4. 验证计划

### 4.1 自动化单元测试与集成测试
1. **`tests/repository/file-rule-store.test.ts`**：
   - 验证 31 个牌号任意主牌号、统一数字代号、国际别名（SUS304, TP316L, 904L, S32168 等）的 $O(1)$ 准确命中。
   - 验证大小写不敏感、中划线/下划线模糊容错。
   - 验证未知牌号与错误标准号的优雅处理。
2. **`tests/engine/tolerance-evaluator.test.ts`**：
   - 验证冷拔/热轧管、公称外径与壁厚公差阶梯区间判断。
3. **`tests/engine/compliance-engine.test.ts`**：
   - 适配 `FileRuleStore` 数据源，保持 5 组黄金用例 100% 通过。
4. **全量规则一致性校验**：
   - 运行 `pnpm standard:validate` 确保 31 个切片 JSON 文件 100% 符合 Zod Schema 且无逻辑死锁。

### 4.2 质量与门禁基准
- `pnpm test`：100% 通过。
- `pnpm typecheck`：0 报错，无 `any`。
- `pnpm test:coverage`：核心模块覆盖率 > 90%。
