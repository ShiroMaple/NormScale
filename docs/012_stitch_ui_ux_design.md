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

### 屏幕 3：纵向瀑布流工作台与双向 BBox 溯源 (Vertical Waterfall Workbench & BBox Traceability)
* **Screen ID**：`795209b527904212af3c21c52189f4e0`
* **设计截图预览**：
  [![NormScale 纵向瀑布流工作台截图](https://lh3.googleusercontent.com/aida/AEtjO1XOCQ-yjo20p1mS0RYgGCJBQDMNKV3shAjsJqHeZJHSQA0Ulr3ze2UiIGMppwj1G7edhX2VOJA2i9bZF_M9XgSnS16_RY9CUUWpjjyfF1MM6Bf0PW5Vk0iT9waGvS1TuWSAC0tNedzWclpikC_ZWkeOIy71SDKEhxwn-zjwB5xTSS8-bxA8evkQztZ3u32hMoLI4ZiiLx8JW2_Nb3Pj-x051vd0DmaoPqPz6fmGK_F9RtVsLFFqk96tB_4_)](https://lh3.googleusercontent.com/aida/AEtjO1XOCQ-yjo20p1mS0RYgGCJBQDMNKV3shAjsJqHeZJHSQA0Ulr3ze2UiIGMppwj1G7edhX2VOJA2i9bZF_M9XgSnS16_RY9CUUWpjjyfF1MM6Bf0PW5Vk0iT9waGvS1TuWSAC0tNedzWclpikC_ZWkeOIy71SDKEhxwn-zjwB5xTSS8-bxA8evkQztZ3u32hMoLI4ZiiLx8JW2_Nb3Pj-x051vd0DmaoPqPz6fmGK_F9RtVsLFFqk96tB_4_)
* **前端 HTML 代码包**：[下载瀑布流工作台 HTML 代码](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sX2JmZGE0OTg5ZDdmNjQ5ZDI4NjFiNjgyZDBlOWMyOGEwEgsSBxDViabNiggYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTQzMzE1ODE5MDA1MzAyMTc0MQ&filename=&opi=96797242)

---

### 屏幕 4：物资不合格拒收处置通知书 (Material Rejection & Disposition Notice)
* **Screen ID**：`9e4bf3f22f674b40be12c98523a9ee62`
* **设计截图预览**：
  [![NormScale 物资不合格拒收通知书截图](https://lh3.googleusercontent.com/aida/AEtjO1VzKZRdqf4C-vc5n17qZ-X-ZO53_loOpDSVE4OP90Jri88NNLaqJhvWun7VwMRStqKagdtNfEyRs-w8h1MWYsf1oebFOG9W-fleHgRaYdsXN7_Q8_nD1b0YcfoHtx1Jo7IW2N2onR-lCpCg8iPV7GVF2MRn4kHUTpKjntgNYpILXq1aho-0ERNH0vyX66J_l9SCrlrlNnZDQ5Y5-o2Do_5JmEJ3jWBOUPPRbSJsuZ-V9XgpbZjkARQ_yDc)](https://lh3.googleusercontent.com/aida/AEtjO1VzKZRdqf4C-vc5n17qZ-X-ZO53_loOpDSVE4OP90Jri88NNLaqJhvWun7VwMRStqKagdtNfEyRs-w8h1MWYsf1oebFOG9W-fleHgRaYdsXN7_Q8_nD1b0YcfoHtx1Jo7IW2N2onR-lCpCg8iPV7GVF2MRn4kHUTpKjntgNYpILXq1aho-0ERNH0vyX66J_l9SCrlrlNnZDQ5Y5-o2Do_5JmEJ3jWBOUPPRbSJsuZ-V9XgpbZjkARQ_yDc)
* **前端 HTML 代码包**：[下载拒收通知书 HTML 代码](https://contribution.usercontent.google.com/download?c=CgthaWRhX2NvZGVmeBJ8Eh1hcHBfY29tcGFuaW9uX2dlbmVyYXRlZF9maWxlcxpbCiVodG1sXzRiZWQ3OWNhYjEzOTQ3MTVhYjQwYjQ5ZjcxZGY2ZDBkEgsSBxDViabNiggYAZIBJAoKcHJvamVjdF9pZBIWQhQxMTQzMzE1ODE5MDA1MzAyMTc0MQ&filename=&opi=96797242)
