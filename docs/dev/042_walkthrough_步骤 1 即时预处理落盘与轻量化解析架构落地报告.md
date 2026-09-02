# 步骤 1 即时预处理落盘与轻量化解析架构落地报告

## 1. 核心架构重构与优化

针对此前切图与原件落盘触发偏晚、且在 `.cache/preprocessed/` 未能即时落盘的问题，已全面完成架构升级：

| 模块 | 改进前 | 改进后（当前已落地） |
|---|---|---|
| **原件落盘时机** | 用户点击“开始解析”时触发 | **用户在步骤 1 选定文件后即时触发**（写入 `.cache/uploads/{md5}.{ext}`） |
| **切图与文本持久化** | 依赖大模型解析接口附带保存 | **选定文件后即时生成并落盘**至 `.cache/preprocessed/{md5}/`（`page-1.png`, `page-2.png`, `text.txt`） |
| **专职预处理 API** | 无（混合在 `/api/documents/parse`） | **[NEW] `POST /api/documents/preprocess`** 专职处理格式校验、MD5 提取、双落盘与缓存命中检测 |
| **解析调用开销** | 需每次重复传输大文件或数十 MB 的 Base64 图像 | **轻量化调用**：仅需传递 `md5`，服务端直接从本地 `.cache/preprocessed/{md5}/` 读取切图与文本送模型 |
| **UI 卡片交互微状态** | 仅有“就绪” | 细粒度流转：`预处理中...` $\to$ `预处理就绪 (共 N 页)` / `已命中解析缓存 (v1.0.0)` |

---

## 2. 自动化测试与质量门禁

- **全套单测 100% 绿色通过**：
  - 新增 [preprocess-route.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/api/preprocess-route.test.ts) 等 **30 个测试套件，136 个测试用例全部通过**；
- **TypeScript 严格类型检查**：`pnpm typecheck` **0 错误**；
- **知识库同步**：已同步更新至 [LOG.md](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/LOG.md) 与 [architecture.md](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/architecture.md)。
