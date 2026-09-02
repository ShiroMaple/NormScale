# 步骤 1 即时预处理流水线与轻量化解析架构实施计划

## 背景与改进目标

经过实际测试验证，用户指出当前预处理与原件落盘绑定在“点击开始解析”时触发存在延迟，且应在用户**选择文件完成入队后立即触发原件落盘与切图/文本持久化**。

本次重构目标：
1. **即时预处理（Instant Preprocessing on Select）**：用户选定文件入队后，客户端异步完成切图与文本层分离，并立即调用新端点 `POST /api/documents/preprocess` 完成原件与切图文本落盘；
2. **切图文件确认落盘**：确保 `.cache/preprocessed/{md5}/` 目录下生成物理 `page-1.png`, `page-2.png`, `text.txt` 产物；
3. **轻量化解析调用（Lightweight Parse Request）**：用户点击“开始解析”时，`/api/documents/parse` 仅需传递 `md5`，直接从本地 `.cache/preprocessed/{md5}/` 磁盘读取切图与文本发起大模型双模态抽取，彻底消除大文件上传阻塞与多模态 Base64 重复传输；
4. **微状态直观呈现**：卡片实时展示 `预处理中...` $\to$ `预处理就绪 (共 N 页)` / `已命中解析缓存 (v1.0.0)`。

---

## 详细架构与变更清单

### 1. 新建专职即时预处理 API (`src/app/api/documents/preprocess/`)

#### [NEW] [route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/preprocess/route.ts)
- **输入**：`FormData` 包含 `file`（原件）、`pageImages`（客户端渲染的 PNG Base64 数组）、`extractedText`（文本层字符串）。
- **处理流水线**：
  1. 严格格式校验（`PDF / PNG / JPEG / JPG / BMP`）；
  2. 计算文件 MD5 指纹；
  3. 调用 `saveUploadedOriginal(md5, filename, buffer)` 立即将原件存入 `.cache/uploads/{md5}.{ext}`；
  4. 调用 `savePreprocessedAssets(md5, pageImages, extractedText)` 立即将切图与 `text.txt` 存入 `.cache/preprocessed/{md5}/`；
  5. 检索是否存在当前版本的历史解析结果 `getValid(md5, currentVersion)`；
  6. 返回 `{ success: true, md5, pageCount, isTextBased, hasCachedParse, parserConfigVersion }`。

---

### 2. 优化轻量化文档解析 API (`src/app/api/documents/parse/`)

#### [MODIFY] [route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/parse/route.ts)
- 支持纯 `md5` 轻量参数调用；
- 优先直接从本地 `.cache/preprocessed/{md5}/` 磁盘加载各页切图与 `text.txt`，无需从 HTTP 请求体重读大二进制；
- 执行版本门禁校验、大模型双模态推理与 `ParseCacheStore` 索引持久化。

---

### 3. 前端工作台即时预处理与状态联动 (`src/components/` & `src/hooks/`)

#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 在 `handleRealFiles` 中：
  - 选定文件后将卡片初始标记为 `预处理中...`；
  - 立即执行 `renderPdfAndExtractText(file)`；
  - 提取完成后立即调用 `fetch('/api/documents/preprocess')` 发送原件、切图与文本至服务端落盘；
  - 接收到响应后，根据 `hasCachedParse` 动态更新状态为 `已命中解析缓存 (v1.0.0)` 或 `预处理就绪 (共 N 页)`。

#### [MODIFY] [useDocumentParser.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/hooks/useDocumentParser.ts)
- `executeDocumentWorker` 发起解析时，优先发送已就绪的 `{ md5, filename, forceReparse }`，实现秒级轻量调用。

---

## 验证计划

### 1. 自动化单元测试
- 新增 [preprocess-route.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/api/preprocess-route.test.ts)：
  - 测试即时预处理端点：原件落盘、切图文件与 `text.txt` 生成、缓存状态回传；
- 运行 `pnpm test` 与 `pnpm typecheck` 保证 100% 绿色通过。

### 2. 真实文件落盘验证
- 上传真实 PDF，直接检查 `.cache/uploads/` 与 `.cache/preprocessed/{md5}/` 是否即时生成 `page-1.png`、`page-2.png` 与 `text.txt`；
- 验证点击“开始解析”时无大文件重复上传开销。
