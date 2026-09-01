# NormScale Industrial UI/UX 设计方案 (Stitch Gemini 3.1 Pro 生成)

---

## 1. 设计系统概览 (Design System: NormScale Industrial)

- **设计定位**：工业级合规检验引擎与物资验收决策看板（Clinical, Authoritative, High Data-Density）；
- **核心主色**：天青蓝 `#38bdf8`（交互聚焦与品牌色）、暗夜黑 `#090d16`（主背景，缓解长效质检视觉疲劳）；
- **语义状态色**：
  - **合格 (PASS)**：翡翠绿 `Emerald-500`（#10b981）
  - **否决 (FAIL)**：玫瑰红 `Rose-500`（#f43f5e）
  - **警示 / 挂起 (WARNING / HITL)**：琥珀金 `Amber-400`（#fbbf24）
- **排版字体**：
  - UI 导航与正文：`Inter`
  - 测得值、公差边界、标准代号、时间轴：`JetBrains Mono`（等宽字体对齐）
- **几何语言**：直角微倒角设计（Sharp Geometry），强化严谨的工业标准质感。

---

## 2. 生成的高保真屏幕设计 (Screens & Assets)

### 屏幕 1：质检工作台 (Workbench Screen)
* **Screen ID**：`032fd77f98814117b09fece01c70b4bb`
* **设计截图预览**：
  [![NormScale 质检工作台截图](https://lh3.googleusercontent.com/aida/AEtjO1VAtVadnJ3V1PPfv7uMC8d5IyDhgkFhexoWgd1NQ-9mWLcAURPdmuP1tE_NCpSl4LcG4qamjAxXOy61MhVidbV6M9ds4H1HtqViR7y-TT1TSJLLG_rpo9a_XwCh_lwl4zg5JYeirUUNTir4D9FfJrGBxLxvGfsUtl1ceavPID1QhyHVVvaP3aZ5ZKvS-k-17wTN-WhE5IQAJkcClWLBrlTKFwPA7SHna6dwT3BQGQFganJjX_hXhnPQpC9O)](https://lh3.googleusercontent.com/aida/AEtjO1VAtVadnJ3V1PPfv7uMC8d5IyDhgkFhexoWgd1NQ-9mWLcAURPdmuP1tE_NCpSl4LcG4qamjAxXOy61MhVidbV6M9ds4H1HtqViR7y-TT1TSJLLG_rpo9a_XwCh_lwl4zg5JYeirUUNTir4D9FfJrGBxLxvGfsUtl1ceavPID1QhyHVVvaP3aZ5ZKvS-k-17wTN-WhE5IQAJkcClWLBrlTKFwPA7SHna6dwT3BQGQFganJjX_hXhnPQpC9O)
* **前端 HTML 代码包**：[下载 HTML 模板](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzRiNDdiZDcwNTU3YjQ2MjQ4NTQ0MjI5YmYzNzM4MjZhEgsSBxDViabNiggYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTQzMzE1ODE5MDA1MzAyMTc0MQ&filename=&opi=96797242)

---

### 屏幕 2：人机协同复核抽屉 (Human-in-the-Loop Review Screen)
* **Screen ID**：`52423eb025f24f0db2f86b7c9005ab24`
* **设计截图预览**：
  [![NormScale 人机协同复核抽屉截图](https://lh3.googleusercontent.com/aida/AEtjO1UHhdYeAsuBnwjPqIfUU8VJ0eDs4eIX1r_TCgm0pjJZNi4KmKVj8SFpSOgHX40T25gjRq5-4Khe5yuy6dCW28tkrOL_pe8GOD_3Um_F8wzIFflcjfYIAPB3QAr3YV_jd6gDCP2fqgCLCYVjbRvUkGyornbd0K6ZpcL42MWi2aQXJWyL8tys1fjw8I2nIj4Hz7fDpbDY1K-JcR2Vg5B3ShY91sfTSKLgw45yPTs6QbaH4A2B96-aMyNvI5rZ)](https://lh3.googleusercontent.com/aida/AEtjO1UHhdYeAsuBnwjPqIfUU8VJ0eDs4eIX1r_TCgm0pjJZNi4KmKVj8SFpSOgHX40T25gjRq5-4Khe5yuy6dCW28tkrOL_pe8GOD_3Um_F8wzIFflcjfYIAPB3QAr3YV_jd6gDCP2fqgCLCYVjbRvUkGyornbd0K6ZpcL42MWi2aQXJWyL8tys1fjw8I2nIj4Hz7fDpbDY1K-JcR2Vg5B3ShY91sfTSKLgw45yPTs6QbaH4A2B96-aMyNvI5rZ)
* **前端 HTML 代码包**：[下载复核抽屉 HTML 代码](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzgzZmVkNzAyZjExNDRhMGNhYzZjMzllMmQwMjgzYjRiEgsSBxDViabNiggYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTQzMzE1ODE5MDA1MzAyMTc0MQ&filename=&opi=96797242)

---

### 屏幕 3：纵向瀑布流质检工作台全流程 (Vertical Waterfall Workbench & Explicit Stage Separation)
* **Screen ID**：`fab8251edfd44aa1b4564137c63dcb8e`
* **设计意图纠偏与领域模型映射**：
  - **Stage 02（文档解析核对与归一化）**：源文档与 BBox 坐标框（黄/青色方框）的对照**严格在此阶段完成**。质检员在此核验 OCR 准确性与单位换算，一旦确认便生成符合 `certificate.schema.ts` 的 `CertificateExtract` 标准数据，作为后续流水线的**唯一真理来源 (Single Source of Truth)**。
  - **Stage 04（国家标准合规比对与裁决处置）**：此阶段不再回溯 OCR 原件，而是**纯粹将 Stage 02 产生的归一化真理数据与国家标准切片规则要求进行确定性比对**（包含 GB/T 8170 进舍修约、动态 AST 公式边界、缺项扫描与一票否决），并提供导出放行单与生成不合格拒收处置单入口。
* **设计截图预览**：
  [![NormScale 纵向瀑布流核验工作台截图](https://lh3.googleusercontent.com/aida/AEtjO1U8Dk5GhdEKtMl_yPVc3Y-Nc9FeuELP5xcKb6fum3RGXT8NH8bXBkuD9NrvEy24sLgulWq5KObs8fD3miLASftuQIrp0HmX2JanzwOafBtd17hmwGoqEiphlfzREMTM4iUtpTqli_5OJiILRpABBSj60fj_xYBvvbSOgLcie9mmP2Evrnv2Xmh-HUHbV__cRXapJxLN2C3t8QlSjJqVl8kU3Uh2Cq2YpgEYaEJExCmVbtTUqtAglEB_-qE)](https://lh3.googleusercontent.com/aida/AEtjO1U8Dk5GhdEKtMl_yPVc3Y-Nc9FeuELP5xcKb6fum3RGXT8NH8bXBkuD9NrvEy24sLgulWq5KObs8fD3miLASftuQIrp0HmX2JanzwOafBtd17hmwGoqEiphlfzREMTM4iUtpTqli_5OJiILRpABBSj60fj_xYBvvbSOgLcie9mmP2Evrnv2Xmh-HUHbV__cRXapJxLN2C3t8QlSjJqVl8kU3Uh2Cq2YpgEYaEJExCmVbtTUqtAglEB_-qE)
* **前端 HTML 代码包**：[下载修正版瀑布流工作台 HTML 代码](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2Q2OWExZTRjMGIwNzQ1MzNiNzU3ZWIwODgzZTBmOWVlEgsSBxDViabNiggYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTQzMzE1ODE5MDA1MzAyMTc0MQ&filename=&opi=96797242)

---

### 屏幕 4：物资不合格拒收处置通知书 (Material Rejection & Disposition Notice)
* **Screen ID**：`9e4bf3f22f674b40be12c98523a9ee62`
* **设计截图预览**：
  [![NormScale 物资不合格拒收通知书截图](https://lh3.googleusercontent.com/aida/AEtjO1VzKZRdqf4C-vc5n17qZ-X-ZO53_loOpDSVE4OP90Jri88NNLaqJhvWun7VwMRStqKagdtNfEyRs-w8h1MWYsf1oebFOG9W-fleHgRaYdsXN7_Q8_nD1b0YcfoHtx1Jo7IW2N2onR-lCpCg8iPV7GVF2MRn4kHUTpKjntgNYpILXq1aho-0ERNH0vyX66J_l9SCrlrlNnZDQ5Y5-o2Do_5JmEJ3jWBOUPPRbSJsuZ-V9XgpbZjkARQ_yDc)](https://lh3.googleusercontent.com/aida/AEtjO1VzKZRdqf4C-vc5n17qZ-X-ZO53_loOpDSVE4OP90Jri88NNLaqJhvWun7VwMRStqKagdtNfEyRs-w8h1MWYsf1oebFOG9W-fleHgRaYdsXN7_Q8_nD1b0YcfoHtx1Jo7IW2N2onR-lCpCg8iPV7GVF2MRn4kHUTpKjntgNYpILXq1aho-0ERNH0vyX66J_l9SCrlrlNnZDQ5Y5-o2Do_5JmEJ3jWBOUPPRbSJsuZ-V9XgpbZjkARQ_yDc)
* **前端 HTML 代码包**：[下载拒收通知书 HTML 代码](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzRiZWQ3OWNhYjEzOTQ3MTVhYjQwYjQ5ZjcxZGY2ZDBkEgsSBxDViabNiggYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTQzMzE1ODE5MDA1MzAyMTc0MQ&filename=&opi=96797242)

---

### 屏幕 5：物资进货检验合格放行通知单与导出界面 (Inbound Pass Release Certificate Modal)
* **Screen ID**：`56cddba301d24af196c3c868606321c7`
* **设计意图与特点**：
  - **全中文工业正式公文排版**：大尺寸居中模态框，包含 4 列物资与质保书基本信息网格、15 项理化检验全项达标判定表格（全绿标【合格】）；
  - **低饱和度视觉**：采用 `#059669` 低饱和度翡翠绿作为合格放行章与结论标签；
  - **多重防伪与签章**：质检工程师数字签名、质保主管审核、SHA-256 存证哈希与防伪验真二维码；
  - **动作集成**：支持导出防篡改 PDF、一键打印 A4 标准放行单、复制结构化 JSON 数据。
* **设计截图预览**：
  [![NormScale 物资进货检验合格放行通知单截图](https://lh3.googleusercontent.com/aida/AEtjO1UaJVDobLR9ameJEV11PQ052edyC_IWPCZ27Ui8Z6fSQXlJX8OTqX7nWfPolSB_hmAF9dYbcsbqTU39YVQR0cwONXslEYqiwAIhX2N_-7_CeMxXXpBRh6q_18fZPEjSd6KOuadgl9c9bjNbin9RkFeGP8_hij2B8KdJ19HuvO0YX1xpjkiihQwABZRfetRrpbOcDdEQVW50JHztA6SUNuY-ADXVT_ocvpurCA8NO4M9N7_1gaZYQjen4uot)](https://lh3.googleusercontent.com/aida/AEtjO1UaJVDobLR9ameJEV11PQ052edyC_IWPCZ27Ui8Z6fSQXlJX8OTqX7nWfPolSB_hmAF9dYbcsbqTU39YVQR0cwONXslEYqiwAIhX2N_-7_CeMxXXpBRh6q_18fZPEjSd6KOuadgl9c9bjNbin9RkFeGP8_hij2B8KdJ19HuvO0YX1xpjkiihQwABZRfetRrpbOcDdEQVW50JHztA6SUNuY-ADXVT_ocvpurCA8NO4M9N7_1gaZYQjen4uot)
* **前端 HTML 代码包**：[下载合格放行通知单 HTML 代码](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzBiOTE1Mzk0YmM4MTQ3OWFhMzM0Yzc4ZWJhNWUyY2NlEgsSBxDViabNiggYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTQzMzE1ODE5MDA1MzAyMTc0MQ&filename=&opi=96797242)

---

### 屏幕 6：国家标准知识库与规格切片浏览器 (National Standard Knowledge Base & Slice Explorer)
* **Screen ID**：`092fb569d903430c85de81ba2045ce65`
* **设计意图与特点**：
  - **分栏知识架构**：左侧 28% 标准-钢级切片目录树（GB/T 13296-2023 全量 31 个钢级快速检索与切换），右侧 72% 切片详细技术规范；
  - **多维度规范详情**：化学成分限值表（含 GB/T 8170 修约精度）、力学性能指标卡（Rm, Rp0.2, A, 硬度）、工艺检验条款（压扁公式 H, 扩口, 水压/涡流/超声, 晶间腐蚀）、AST 动态跨元素公式计算器（如钛稳定化 $Ti \ge 4 \times (C+N)$）；
  - **全中文工业化风格**：低饱和度深色，无衬线 UI 标签结合等宽字体数据。
* **设计截图预览**：
  [![NormScale 标准知识库浏览器截图](https://lh3.googleusercontent.com/aida/AEtjO1UVgWcA-1wASieZ9y93dD9XY-tVazRyLOf2SkGnUENpcYo4hSV3PcmkxP9jnEdY2Zu31vTby23-RViAkDkZZzQErbDitPS7w3GJJK-GywBRRGYpmi-oSgyentdumn0QG-wLYGWggVgtC3ysiSyhSNJtoB2MD5Eh7EcfKRsWsiWExH9nILeeB0GgrnSComS0lBiNapIQoA1psJ_NC3SUhtY8nl7vzIqF1d5A_l2g2WsFNF_TK4Br_RucQDY)](https://lh3.googleusercontent.com/aida/AEtjO1UVgWcA-1wASieZ9y93dD9XY-tVazRyLOf2SkGnUENpcYo4hSV3PcmkxP9jnEdY2Zu31vTby23-RViAkDkZZzQErbDitPS7w3GJJK-GywBRRGYpmi-oSgyentdumn0QG-wLYGWggVgtC3ysiSyhSNJtoB2MD5Eh7EcfKRsWsiWExH9nILeeB0GgrnSComS0lBiNapIQoA1psJ_NC3SUhtY8nl7vzIqF1d5A_l2g2WsFNF_TK4Br_RucQDY)
* **前端 HTML 代码包**：[下载标准知识库浏览器 HTML 代码](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2NiMTU1Y2ZhN2Y1ODQzOWFhOWJlNmZiNTUxNGJlMWMzEgsSBxDViabNiggYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTQzMzE1ODE5MDA1MzAyMTc0MQ&filename=&opi=96797242)

---

### 屏幕 7：系统管理与运维配置控制台 (System Admin & Configuration Console)
* **Screen ID**：`229333422fa04ebca03b760517ff4dda`
* **设计意图与特点**：
  - **大模型与解析引擎配置**：内建解析引擎与外部接口单选、主备大语言模型下拉配置（Gemini 3.1 Pro / Claude 3.7）、API Key 掩码管理、OCR 置信度阈值滑块；
  - **全局运行日志与微秒级监控**：深黑控制台终端日志流，支持按模块与日志级别实时过滤，显示今日核验吞吐量与平均耗时（1.25ms）；
  - **质检员权限与电子签章体系**：质检工程师/主管角色表格、CA 数字证书绑定状态、权限粒度控制。
* **设计截图预览**：
  [![NormScale 系统管理控制台截图](https://lh3.googleusercontent.com/aida/AEtjO1WCK1fO5ADxgI-hbR1XthqJOaQXd0bB4oy1uTA_ev8Rom54YEPHXv6BMb-yJpnTY_zFJVEuOERTIVzCi_ejbULTF1OiSV96BuMoziW6CqAoGkzxndxI5NvqJGdP-g-UHC0WlAMXqZ04gByNBDVoFdKFPXV3UmUN9EuTEoGXFDxr0Aa0TEbR8UmkJtpzBSLEmiOMBHfZj43ETu8rOVRe0ibVdV0JF8WhpWvu_X_O0_oPu7lZIe1RIg02EwhO)](https://lh3.googleusercontent.com/aida/AEtjO1WCK1fO5ADxgI-hbR1XthqJOaQXd0bB4oy1uTA_ev8Rom54YEPHXv6BMb-yJpnTY_zFJVEuOERTIVzCi_ejbULTF1OiSV96BuMoziW6CqAoGkzxndxI5NvqJGdP-g-UHC0WlAMXqZ04gByNBDVoFdKFPXV3UmUN9EuTEoGXFDxr0Aa0TEbR8UmkJtpzBSLEmiOMBHfZj43ETu8rOVRe0ibVdV0JF8WhpWvu_X_O0_oPu7lZIe1RIg02EwhO)
* **前端 HTML 代码包**：[下载系统管理控制台 HTML 代码](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2ZkNzk4OWVkMjJkNzRhMDM5YmJkMWVlYTcyNDA4NzhlEgsSBxDViabNiggYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTQzMzE1ODE5MDA1MzAyMTc0MQ&filename=&opi=96797242)
