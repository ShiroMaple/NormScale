# 材料牌号推荐算法动态化与纯逻辑架构落地交付报告

## 一、交付目标与完成情况总览

针对质检员在 Case 1 人机协同（HITL）抽屉中审查到的假数据风险与算法疑问，本轮实施彻底完成了推荐算法的动态化重构，彻底根除了静态 Mock，并确立了纯逻辑驱动的架构定调：

| 核心诉求 / 架构决策 | 落地措施与实现方案 | 达成效果 |
| :--- | :--- | :--- |
| **彻底根除静态 Mock** | 彻底删除 `HitlDrawer.tsx` 中的 `DEFAULT_CANDIDATES` 假字典；改为消费工作流节点动态计算下发的 `hitlContext.candidate_grades`。 | 抽屉候选项 100% 由后端根据真实成分与牌号计算生成，绝无硬编码假数据。 |
| **严禁硬编码规格切片** | 推荐引擎 `CandidateGradeRecommender` 100% 通过 `IRuleStore.getCompleteStandard(declaredStandard)` 动态提取切片池。 | 随着 Phase 11 多品类标准或企业规则库横向扩容，推荐算法自动生效，零代码改动。 |
| **纯代码双标尺 vs LLM 介入** | 选用确定性纯逻辑匹配（实测化学成分区间落入度 60% + 牌号别名词根倒排索引 40%），不把 LLM 作为挂起强依赖。 | 零模型幻觉、< 1ms 毫秒级极速响应，100% 确保推荐钢级在当前标准库必有规则切片可闭环。 |
| **选项 4 手动输入闭环** | 质检员手动指定标准牌号（如 `S31603` 或 `06Cr19Ni10`），提交后沿 `human_review` -> `normalize` -> `retrieve_standard` -> `deterministic_eval` 闭环重新比对。 | 成功覆盖标准钢级，重新计算全项指标并输出确定性合格报告。 |

---

## 二、关键工程实现细节

### 1. 纯逻辑动态推荐引擎：[candidate-grade-recommender.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/candidate-grade-recommender.ts)
- **动态切片加载**：通过注入的 `IRuleStore` 实例获取当前标准下的全部可用规则切片（`SpecificationSlice[]`）；
- **标尺 1（字符词根与别名倒排索引）**：
  - 提取待消歧牌号的核心词根 Token（如 `SUS304H-SpecialX` -> `['304', '304H']`）；
  - 对比候选切片的 `primary_grade`、`unified_code` 及 `aliases`；
  - 命中别名赋予 0.95 高分，命中家族系列赋予 0.80~0.90 基础分。
- **标尺 2（实测化学成分指纹数学落入度）**：
  - 提取质保书实测化学元素数值（C, Si, Mn, P, S, Cr, Ni, Mo, Ti 等）；
  - 逐项比对候选切片中的数值范围 $[min, max]$；
  - 超标按超差百分比线性扣分，特征元素缺失（如 321 缺 Ti，316 缺 Mo）实施反向惩罚；
- **加权综合评分与排序**：
  - 加权公式：$S_{\text{total}} = 0.6 \times S_{\text{chem}} + 0.4 \times S_{\text{token}}$（无化学实测时自动退化为 $S_{\text{token}}$）；
  - 降序排序后截取 Top 3，首项标记 `recommended: true` 并附加 `(推荐)` 徽章。

### 2. 工作流状态机集成：[normalize.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/normalize.node.ts)
- 当 `GradeNormalizer` 校验判定 `!isGradeMatched` 时，通过节点内注入的 `IRuleStore` 异步调用 `CandidateGradeRecommender.recommend(...)`；
- 将真实计算得出的 `CandidateGradeOption[]` 填入 `hitlContext.candidate_grades`，随 `hitl_interrupt` 事件下发给前端。

### 3. 前端交互层解耦与空状态友好处理：[HitlDrawer.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/HitlDrawer.tsx)
- 彻底移除 `DEFAULT_CANDIDATES` 常量定义；
- 优先消费 `hitlContext?.candidate_grades`；
- 当候选列表非空时，默认选中标记为推荐的首项；当列表为空时，展示空状态说明卡片，并自动导向聚焦至“手动输入其他标准钢级代号”。

---

## 三、质量门禁与测试验证

### 1. 推荐引擎专项单元测试
执行命令：
```powershell
pnpm test tests/normalizer/candidate-grade-recommender.test.ts
```
测试结果：
- 场景 1：基于化学成分与别名词根准确推荐 304 家族高匹配钢级 (PASS)
- 场景 2：纯化学成分指纹识别 (依据 Mo/Ni 特征元素准确识别 316 体系) (PASS)
- 场景 3：特征元素缺失惩罚 (若未检出 Ti，321 牌号评分被惩罚扣分) (PASS)
- 场景 4：无实测化学数据时优雅退化为纯词根与别名匹配 (PASS)
- 场景 5：防御性处理 (缺失 store、空牌号或未知标准安全返回空数组) (PASS)

### 2. 端到端流程回归验证
执行命令：
```powershell
pnpm test tests/e2e/four-tier-scenarios.test.ts
```
Case 1 成功断言挂起事件包含非空的 `candidate_grades` 且首选标记推荐，质检员指定 `06Cr19Ni10` 后流转恢复并出具合格大盘。

### 3. 全量测试套件回归
执行命令：
```powershell
pnpm test
```
**46 个测试套件，219 个测试用例全部 100% 绿色通过。**

### 4. TypeScript 严格类型检查
执行命令：
```powershell
pnpm exec tsc --noEmit
```
**0 错误，0 警告。**

### 5. Next.js 15 生产打包构建
执行命令：
```powershell
pnpm build
```
全量 12 个路由静态与动态打包构建成功，编译用时 3.5s。
