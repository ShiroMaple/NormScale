# 双轨制合规判定架构规范 (Auditable Dual-Track Verdict Specification)

> **归属**: NormScale 核心判定与审计追溯体系  
> **面向对象**: 前端交互层、比对引擎、后端服务接口与特种设备合规审计模块  
> **设计基准**: 依据 2026-08-28 决策，解决“系统算法客观计算”与“质检员主观操作审批”在特种设备与工业承压管领域的法律权责边界与审计双重可追溯性问题。

---

## 1. 背景与核心设计动机

在特种设备（承压锅炉管、热交换器用管等）质量证明书（MTR）检验中：
1. **防篡改与客观审计**：质检合规引擎是基于国家/行业执行标准（如 GB/T 13296、NB/T 47019.5 等）的规则切片与公差带算法自动判定。若系统允许人工审批通过直接覆盖或抹除系统的原始判定，一旦发生安全事故，审计将无法复盘当时材料的真实检验计算情况；
2. **人类专家的终审特批权**：质检员可能基于实物复验、让步接收协议（Concession）、或对缺陷的人工复核实施放行或拒收；
3. **权责解耦**：因此，必须确立**系统判定（System Verdict）**与**人工判定（Human Verdict）**并行的“双轨制（Dual-Track）”模型——**人工判定非必须、可撤销，且绝不覆盖系统判定的原始计算结果**。

---

## 2. 判定概念模型与权责边界

```
                     ┌──────────────────────────────────────────────┐
                     │           质保书原始 OCR / 测量数据          │
                     └──────────────────────┬───────────────────────┘
                                            │
                                 标准公差与规则叠加比对
                                            │
                                            ▼
                     ┌──────────────────────────────────────────────┐
                     │          系统判定 (System Verdict)           │
                     │  - 纯客观算法计算                            │
                     │  - PASS / FAIL / MANUAL_REVIEW               │
                     │  - 带有系统判定依据简述                      │
                     │  - 【绝对不可篡改，永久保留原始计算结果】    │
                     └──────────────────────┬───────────────────────┘
                                            │
                                   双轨并行呈现与流转
                                            │
                                            ▼
┌───────────────────────────────────────────┴───────────────────────────────────────────┐
│ 人工复核判定 (Human Verdict)                                                          │
│ - 质检工程师主观复核意见                                                              │
│ - 状态流转: 未签认 (null) ──▶ ✓ APPROVE (PASS) / ✗ REJECT (REJECT)                    │
│ - 交互模式: 再次点击当前激活按钮直接撤销签认，恢复未签认；无需单独撤销文字链接       │
│ - 视觉表现: 状态标签位于“人工复核”标题下方；按钮自适应充满整个卡片垂直高度            │
│ - 冲突背景: 未签认时右侧继承系统底色；当人工判定与系统冲突时（如系统PASS人工REJECT）， │
│             右侧独立突变为冲突警示背景色（左绿右红或左红右绿），形成鲜明权责警示      │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 终审放行仲裁矩阵 (Final Release Arbitration Matrix)

后续后端在执行批次流转、报告生成与归档时，遵循如下仲裁矩阵：

| 系统客观判定 (System) | 人工复核判定 (Human) | 最终流转处置 (Final Disposition) | 业务含义与审计说明 |
|---|---|---|---|
| **PASS** (全项合规) | `null` (未签认) | **放行 (RELEASE)** | 默认采纳系统合格结论，无缝流转生成放行报告 |
| **PASS** (全项合规) | `PASS` (已人工核准) | **放行 (RELEASE_VERIFIED)** | 经算法与人工双重背书的放行 |
| **PASS** (全项合规) | `REJECT` (已人工拒收) | **拒收 (REJECTED_BY_HUMAN)** | 质检员发现外观破损、包装受潮等非标准项一票否决 |
| **FAIL** (一票否决) | `null` (未签认) | **阻断拒收 (REJECTED_BY_SYSTEM)** | 系统一票否决，自动拦截 |
| **FAIL** (一票否决) | `REJECT` (已人工拒收) | **确认拒收 (REJECT_CONFIRMED)** | 人机双重确认不合格 |
| **FAIL** (一票否决) | `PASS` (已特批放行) | **特批放行 (CONCESSION_RELEASE)** | 附带特批放行批注编号 `humanVerdictSummary` |
| **MANUAL_REVIEW** (HITL) | 任何状态 | **待协同 (PENDING_REVIEW)** | 必须在人机协同抽屉中完成消歧与仲裁 |

---

## 4. 前后端数据契约对齐指南

### 4.1 TypeScript 契约模型 (`BatchSpecimen`)

```typescript
export interface BatchSpecimen {
  batchNo: string;
  heatNo: string;
  // ... 其他基础属性 ...

  // 1. 系统客观计算判定（客观真理层）
  systemVerdict?: 'PASS' | 'FAIL' | 'MANUAL_REVIEW';
  systemVerdictSummary?: string;

  // 2. 人工复核判定（主观审批层）
  humanVerdict?: 'PASS' | 'REJECT' | 'WAIVED' | null;
  humanVerdictSummary?: string;
  humanVerifiedAt?: string; // ISO 8601 时间戳
  humanVerifierId?: string; // 质检员工号 / 数字证书 ID

  // 兼容老版本只读映射
  verdict: 'PASS' | 'FAIL' | 'MANUAL_REVIEW';
  verdictSummary: string;
}
```

### 4.2 后端数据库表字段建议 (`inspection_specimens`)

| 字段名 | 类型 | 空值约束 | 说明 |
|---|---|---|---|
| `system_verdict` | `VARCHAR(20)` | `NOT NULL` | 系统算法计算结果 (`PASS`, `FAIL`, `MANUAL_REVIEW`) |
| `system_verdict_summary` | `TEXT` | `NULL` | 系统判定依据 |
| `system_evaluated_at` | `TIMESTAMP` | `NOT NULL` | 系统算法计算时间戳 |
| `human_verdict` | `VARCHAR(20)` | `NULL` | 人工签认结果 (`PASS`, `REJECT`, `WAIVED`)，未签认为 `NULL` |
| `human_verdict_summary` | `TEXT` | `NULL` | 人工批注、拒收原因或特批放行依据 |
| `human_verified_at` | `TIMESTAMP` | `NULL` | 人工签认时间戳 |
| `human_verifier_id` | `VARCHAR(50)` | `NULL` | 签认质检员工号或认证主体 |

### 4.3 后端 REST API 接口规范

- **更新人工判定接口**:
  - `POST /api/inspections/{sessionId}/batches/{batchNo}/human-verdict`
  - 请求体：
    ```json
    {
      "humanVerdict": "PASS", // 或 "REJECT", 传 null 表示撤销签认
      "humanVerdictSummary": "质检工程师人工核准通过"
    }
    ```
  - **后端实现铁律**：该接口**严禁**执行 `UPDATE inspection_specimens SET system_verdict = ...`，严禁改动任何系统计算字段！
