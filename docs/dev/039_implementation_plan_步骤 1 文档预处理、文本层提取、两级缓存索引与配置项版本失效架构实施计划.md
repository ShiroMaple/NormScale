# 步骤 1 文档预处理、文本层提取、两级缓存索引与配置项版本失效架构实施计划

## 背景与目标

根据您对步骤 1 确立的 9 条核心准则及最新关于**配置项版本（Parser/Schema/Prompt Version）**的控制要求，本次重构将建立高内聚、低耦合、可追溯且具备完整日志埋点的文档预处理与两级缓存架构：

1. **格式准入**：仅支持 PDF 及主流图片格式（PNG / JPEG / JPG / BMP）；图片直接缓存至 `.cache/uploads/{md5}.{ext}`；
2. **文本分离**：检测 PDF 文本层，提取并分离为 `text.txt`；
3. **分页切图**：PDF 统一按页渲染为 PNG 高清图片，与 `text.txt` 共同存入 `.cache/preprocessed/{md5}/`；
4. **统一索引**：建立原件、MD5、preprocessed 产物与模型解析结果的自包含清单索引；
5. **双重命中**：点击历史缓存卡片与上传相同 MD5 文件均能准确识别命中状态；
6. **两级复用**：默认优先复用模型解析数据（秒级就绪）；未解析或强制重解析时复用预处理产物（跳过切图直接调用模型）；
7. **配置项版本失效门禁（NEW）**：
   - 引入由运维管理员维护的配置项版本号（`parserConfigVersion`，绑定 `certificate.schema.ts` 结构与 Prompt 迭代）；
   - 缓存数据中持久化记录当时的配置项版本；
   - 仅当**记录的配置项版本与当前系统运行版本完全一致**时，才允许复用解析结果；若版本升级或不一致，解析缓存自动失效，无缝复用预处理产物重新调用最新 Prompt 与 Schema 进行抽取；
8. **级联删除**：删除历史缓存时级联清理原件、切图与解析缓存，严禁污染历史检验台账；
9. **工程规范**：高内聚服务设计，全流程统一接入系统日志；
10. **大模型兼容**：绕过第三方私有文件接口，采用标准双模态融合输入。

---

## 详细架构设计与变更清单

### 1. 配置项版本与系统管理层 (`config.json` & `src/components/AdminConsole.tsx`)

#### [MODIFY] [config.json](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/config.json)
- 增加 `parser` 配置节：
  ```json
  "parser": {
    "version": "1.0.0",
    "description": "工业 MTC 质保书通用提取 Schema 与双模态 Prompt V1"
  }
  ```

#### [MODIFY] [route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/admin/config/route.ts)
- `AdminConfigSchema` 扩展对 `parser` 配置节（`version`, `description`）的 Zod 校验与持久化。

#### [MODIFY] [AdminConsole.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/AdminConsole.tsx)
- 在系统管理界面中增加**“抽取模型与 Prompt 配置项版本”**卡片，允许运维管理员查看并手动升级版本号（升级后全量旧解析缓存安全失效并自动触发新版 Prompt 重解析）。

---

### 2. 预处理与两级缓存仓储层 (`src/services/` & `src/repository/`)

#### [NEW] [document-preprocessor.service.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/services/document-preprocessor.service.ts)
- 职责：管理 `.cache/uploads/` 原件与 `.cache/preprocessed/{md5}/` 产物（`page-1.png`, `page-2.png`, `text.txt`）。
- 接口：
  - `saveUploadedOriginal(md5: string, ext: string, buffer: Buffer): string`
  - `savePreprocessedAssets(md5: string, pages: string[] | Buffer[], text?: string): { dir: string, images: string[], textFile?: string }`
  - `getPreprocessed(md5: string): { dir: string, images: string[], text?: string, isTextBased: boolean } | null`
  - `deletePreprocessedAndUploads(md5: string): void`
- 埋点：全量操作调用 `DefaultLogger.info / warn / error` 记录执行耗时与落盘状态。

#### [MODIFY] [parse-cache-store.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/repository/parse-cache-store.ts)
- 扩展 `CachedParseResult` 元数据结构，记录：
  - `parserConfigVersion: string`（抽取时使用的配置项版本号，如 `"1.0.0"`）
  - `originalFilePath?: string`
  - `preprocessedDir?: string`
  - `extractedTextPath?: string`
  - `pageImages?: string[]`
  - `isTextBased?: boolean`
  - `pageCount?: number`
- 新增 `getValid(md5: string, currentVersion: string)`：若版本不匹配，记录日志并返回 `null`（触发第二级预处理复用）；
- 新增 `deleteCascade(md5: string)`：级联删除原件、切图与解析缓存。

---

### 3. PDF 客户端渲染与文本层提取器 (`src/utils/`)

#### [MODIFY] [pdf-renderer.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/utils/pdf-renderer.ts)
- 扩展 `renderPdfAndExtractText(file: File | Blob)`：
  - 提取 PDF 逐页高保真 2.0x Retina PNG 切图；
  - 调用 PDF.js `page.getTextContent()` 抽取矢量文本层；若文本长度 > 20 字符则标记 `isTextBased: true` 并返回合并后的纯文本 `text`。

---

### 4. 服务端 API 流水线 (`src/app/api/`)

#### [MODIFY] [route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/parse/route.ts)
- **格式校验门禁**：仅允许 `pdf, png, jpg, jpeg, bmp`，非法格式返回 HTTP 400 与明确提示；
- **原件与切图落盘**：将原件存入 `.cache/uploads/`，将切图与文本存入 `.cache/preprocessed/{md5}/`；
- **两级缓存决策器（含版本校验）**：
  - 第一级（解析级缓存）：若 `!forceReparse` 且 `cached.parserConfigVersion === currentVersion` -> 记录命中日志并秒级返回；
  - 第二级（预处理级缓存）：若强制重解析、未解析过或版本不一致 -> 复用 preprocessed 产物，组装文本与多图双模态 Prompt 调用大模型；
- **持久化索引更新**：调用 `ParseCacheStore.set` 写入包含当前 `parserConfigVersion` 的完整元数据索引。

#### [MODIFY] [route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/cached/route.ts)
- `GET`：返回包含 `hasPreprocessed`、`hasParseResult`、`parserConfigVersion`、`isVersionMatched` 的摘要列表；
- `DELETE`：调用 `ParseCacheStore.deleteCascade(md5)` 实现原件、切图与解析缓存的级联清理（不影响台账）。

---

### 5. 抽取器双模态融合 (`src/extractor/`)

#### [MODIFY] [openai-compatible-extractor.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/openai-compatible-extractor.ts)
- 支持接收 `options.extractedText` 与 `options.pageImages`；
- 构造融合 Payload：当存在 `extractedText` 时，将其作为高保真原文字符串嵌入 Prompt，结合多页 Base64 图像进行双向交叉校对提取。

---

### 6. 前端工作台交互优化 (`src/components/` & `src/hooks/`)

#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 文件上传时计算 MD5，实时比对缓存列表与版本匹配情况：
  - 若命中当前版本解析缓存：显示 `已命中解析缓存 (v1.0.0)`（绿色 Badge），秒级就绪；
  - 若版本不一致或未解析：显示 `预处理就绪` 或 `版本升级待重析`；
  - 提供单卡片 `重新解析 (无视缓存)` 与顶栏一键强制重解析选项。

---

## 验证计划

### 1. 自动化单元测试
- 编写 [document-preprocessor.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/preprocessor/document-preprocessor.test.ts)：
  - 测试图片与 PDF 预处理与落盘；
  - 测试版本一致时复用解析结果、版本不一致时判定失效并复用预处理产物；
  - 测试级联删除操作。
- 运行 `pnpm test` 与 `pnpm typecheck` 保证 100% 绿色通过。

### 2. 真实端到端流程验证
- 上传质保书，生成 `v1.0.0` 缓存；
- 再次上传相同文档，验证秒级命中；
- 管理员在系统管理中将版本提升至 `v1.1.0`，验证旧解析缓存自动失效，重新调用大模型并生成新版本缓存；
- 删除历史缓存，验证磁盘三级目录被安全级联清理。
