# 材料牌号推荐算法动态化与静态 Mock 根治实施方案 (修订版)

## 一、用户反馈与核心决策调整

针对用户的指导意见，对本方案进行两项关键原则明确与架构定调：

### 1. 严禁硬编码任何规格切片范围 (100% 动态规则库驱动)
- **原则**：随着 Phase 11 多品类标准扩展（管材、板材、锻件、紧固件等）与企业规则库扩充，标准库切片数量必然是动态演进的；
- **落地**：推荐引擎不包含任何预设钢级常量或固定列表，**100% 通过 `IRuleStore.getCompleteStandard(standardId)` 动态获取当前标准所装载的全部真实切片（`slices`）**。新增或扩展任意标准与牌号，推荐系统即时无感知自动生效。

### 2. HITL 推荐节点：纯逻辑匹配 vs. LLM 介入的必要性论证
- **结论：当前 HITL 推荐节点【纯逻辑匹配】不仅完全可行，而且在工业可用性与安全性上显著优于调用 LLM**。
- **原因剖析**：
  1. **零幻觉与标准可闭环性**：LLM 存在“幻觉编造”风险，可能推荐一个理论上存在但在系统当前标准库中**尚未收录切片规则**的牌号，导致质检员选择后后续核验因查无规则切片而崩溃；而纯逻辑匹配从当前 `RuleStore` 的真实切片池中反向打分，**100% 保证推荐出的每一个候选钢级都必定拥有真实完备的规则切片**；
  2. **极速交互响应（< 1ms vs. 2~3s）**：质检员进入工作台步骤 3 遇到阻断时，抽屉需要瞬间滑出。化学成分数学区间判定（$C \le 0.08\%$, $Cr \in [18, 20]\%$）在纯 TypeScript 代码中遍历全量切片耗时 **< 1ms**，零 Token 消耗、零网络等待；若每次挂起都串行发起 LLM 推理，会造成界面明显卡顿；
  3. **工业法律级可解释性与责任链追溯**：纯逻辑给出的推荐依据是客观透明的（如：“实测 7 项元素全部落入该钢级标准区间，碳含量处于中段，别名包含 304”），审计日志清晰透明；LLM 的黑盒概率输出在工业合规审查中无法提供确定性数学依据；
  4. **LLM 的合理边界**：当且仅当纯逻辑匹配得分均极低（如全部低于 30%，代表质保证书可能完全错版跨品类），或者质检员在界面上主动点击【AI 辅助牌号溯源】时，再按需触发 LLM 进行材料背景知识分析，不作为挂起主链路的强依赖。

---

## 二、算法设计：纯逻辑动态双标尺推荐模型 (Pure-Logic Dynamic Recommender)

```
                       质保书原始输入
         (声明牌号: SUS 304H-SpecialX, 实测化学成分 C/Si/Mn/Cr/Ni 等)
                              │
                              ▼
        动态调用 store.getCompleteStandard(declaredStandard)
         (从当前规则库实时获取所有 SpecificationSlice 切片)
                              │
       ┌──────────────────────┴──────────────────────┐
       ▼                                             ▼
【标尺 1：字符词根与别名倒排索引】             【标尺 2：实测化学成分区间落入度】
Token / Jaro-Winkler 相似度                 纯数学区间比对 (min <= val <= max)
命中切片 aliases (如 S30409 别名 SUS304H)     全部落入 = 100%; 超标/缺特征元素惩罚
       │                                             │
       └──────────────────────┬──────────────────────┘
                              │
                              ▼
              加权综合得分 = 0.4 × 标尺1 + 0.6 × 标尺2
                              │
                              ▼
                降序排列，截取 Top 3 输出
             (仅包含当前规则库实际收录的真实钢级)
```

### 1. 动态切片池获取
- 通过 `await ruleStore.getCompleteStandard(standardId)` 动态获取标准下所有收录的切片 `SpecificationSlice[]`；
- 若标准不存在切片，安全返回空数组，引导质检员手动指定。

### 2. 标尺 1：字符词根与别名匹配 ($S_{\text{token}} \in [0, 1]$)
- 提取待消歧牌号的主干核心字符（提取字母与数字 Token，如 `304H`, `304`, `316L`）；
- 检查候选切片的 `aliases`（别名列表）、`primary_grade`（标准主牌号）、`unified_code`（统一代号）：
  - 若别名完全包含该核心词（如 `S30409` 的别名含 `SUS304H`），赋予 0.95 高分；
  - 若命中家族代号（如 `304`），赋予 0.80 基础分；
  - 否则基于归一化 Levenshtein 距离计算相似度。

### 3. 标尺 2：实测化学成分区间落入度 ($S_{\text{chem}} \in [0, 1]$)
- 提取质保书实测记录中包含的化学元素数值（C, Si, Mn, P, S, Cr, Ni, Mo, Ti 等）；
- 对候选切片中定义了标准的每一个化学元素规则：
  - **实测值完全在 $[min, max]$ 内**：单元素得分 1.0；
  - **实测值超标**：按超差比例惩罚递减（超过 30% 扣为 0）；
  - **特征元素校验**：若切片要求某特征元素（如 Ti, Nb），而质保书未检出，惩罚扣分；
- 计算全部化学元素的加权平均落入度。

### 4. 格式化输出
- 综合得分：$S_{\text{total}} = 0.6 \times S_{\text{chem}} + 0.4 \times S_{\text{token}}$（无化学实测时退化为 $S_{\text{token}}$）；
- 降序排序，截取得分最高的前 3 项；
- 转换为 `CandidateGradeOption`，第一名赋予 `recommended: true` 与 `(推荐)` 徽章。

---

## 三、拟定代码改动清单

### 1. 核心算法层
#### [NEW] [candidate-grade-recommender.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/normalizer/candidate-grade-recommender.ts)
- 实现纯逻辑推荐引擎，不含任何写死的切片列表；
- 依赖 `IRuleStore` 接口，入参传入 `ruleStore`、`declaredStandard`、`rawGrade` 及 `testRecords`；
- 导出 `CandidateGradeRecommender.recommend()` 纯函数方法。

### 2. 工作流节点编排层
#### [MODIFY] [normalize.node.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/workflow/nodes/normalize.node.ts)
- 当 `!isGradeMatched` 时，通过节点内持有的 `ruleStore` 调用 `CandidateGradeRecommender.recommend()` 计算当前标准下的候选钢级；
- 填充进 `hitlContext.candidate_grades`，随后触发中断挂起。

### 3. 前端交互层
#### [MODIFY] [HitlDrawer.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/HitlDrawer.tsx)
- **彻底移除** `const DEFAULT_CANDIDATES: CandidateGradeOption[] = [...]` 静态 Mock 数据；
- 消费 `hitlContext?.candidate_grades || []`；
- 当有推荐候选时，默认选中第一项推荐；
- 若无推荐候选，展示空状态提示并自动聚焦到“选项 4 手动输入”。

### 4. 自动化测试层
#### [NEW] [candidate-grade-recommender.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/normalizer/candidate-grade-recommender.test.ts)
- 动态装载 `FileRuleStore`，验证无论规则库如何扩充均能动态打分；
- 测试化学指纹与词根相似度在不同场景下的打分表现；
#### [MODIFY] [four-tier-scenarios.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/e2e/four-tier-scenarios.test.ts)
- Case 1 验证挂起事件返回的 `candidate_grades` 包含真实动态数据。

---

## 四、验证计划

1. **自动化测试**：
   - `pnpm test tests/normalizer/candidate-grade-recommender.test.ts`
   - `pnpm test tests/e2e/four-tier-scenarios.test.ts`
   - `pnpm test`
2. **类型检查与打包**：
   - `pnpm exec tsc --noEmit`
   - `pnpm build`
3. **界面实机验证**：
   - 装载 Case 1，唤出抽屉，验证推荐项来自标准切片动态比对，选项 4 手动输入有效国标牌号后恢复流转并全项合格。
