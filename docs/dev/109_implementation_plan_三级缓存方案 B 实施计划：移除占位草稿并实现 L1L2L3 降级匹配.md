# 三级缓存方案 B 实施计划：移除占位草稿并实现 L1/L2/L3 降级匹配

## 问题根因背景

在当前系统中，用户上传新文档（如 `测试质保书1.pdf`）并完成预处理时，`POST /api/documents/preprocess` 为了在步骤 1「历史已缓存文档」中立即可见，向 `.cache/parses/{md5}.json` 写入了一份 `cacheLevel: 'L2'`、`model: '未调用模型'` 且批次为空的初始草稿。
随后进入步骤 2 调用 `POST /api/documents/parse` 时，解析路由的缓存校验门禁 `globalParseCacheStore.getValid(md5, currentVersion)` 未检查 `cacheLevel` 与真实解析数据，直接将该空草稿判定为有效解析缓存命中，**导致大模型完全未被调用，直接短路返回空数据**。

用户已明确选定**方案 B**：
1. **坚决不放占位草稿**：彻底移除预处理向 `.cache/parses/` 写入空草稿的逻辑，`.cache/parses/` 物理目录严格只存放经大模型完成解析的 L1 文件；
2. **三级降级匹配扫描**：`/api/documents/cached` 接口在扫描历史缓存列表和检索单个文档时，统一按 **L1 (已解析) ➔ L2 (预处理就绪) ➔ L3 (仅原件)** 的顺序逐步降级匹配与动态组装。

---

## User Review Required

> [!IMPORTANT]
> 方案 B 确保物理文件职责完全正交：
> - `.cache/parses/` 100% 均为有效解析结果；
> - `.cache/preprocessed/{md5}/` 存放切图与文本层，并增补轻量 `meta.json` 记录上传原始文件名与大小；
> - `.cache/uploads/` 存放原始 PDF/图片。
> 该改动完全向下兼容现有前端 `WaterfallWorkbench.tsx` 的三级缓存徽标展示逻辑与恢复交互。

---

## Proposed Changes

Grouped by component layer:

### 1. 预处理服务与路由解耦

#### [MODIFY] [document-preprocessor.service.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/services/document-preprocessor.service.ts)
- 在 `savePreprocessedAssets` 中增加将元数据（`filename`、`fileSize`、`createdAt`）持久化至 `.cache/preprocessed/{md5}/meta.json`；
- 在 `getPreprocessed` 中读取该 `meta.json`（若存在），使 L2 资产自包含原始文件名和文件大小；
- 新增 `listAllPreprocessedMd5s()` 方法，方便缓存路由高效扫描。

#### [MODIFY] [route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/preprocess/route.ts)
- **彻底删除**预处理路由中向 `globalParseCacheStore.set(md5, draftResult)` 写入 L2 草稿的代码块（原 136-209 行）；
- 预处理接口仅负责原件和切图/文本落盘，检查若无 L1 缓存则单纯返回 `cacheLevel: 'L2'`，不再污染 `.cache/parses/`。

---

### 2. 缓存仓储有效性门禁加固

#### [MODIFY] [parse-cache-store.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/repository/parse-cache-store.ts)
- 加固 `getValid(md5, currentVersion)`：
  - 显式过滤 `cacheLevel === 'L2'` 或 `model === '未调用模型'`；
  - 校验 `sessionDocument.batches` 是否包含有效解析字段（如 `grade`、`standard` 或 `chemical`），无有效批次数据判定为无效缓存；
- 在 `set(md5, data)` 时，默认赋予 `cacheLevel: 'L1'`；
- 扩展 `hasAny(md5)` 与优化 `deleteCascade(md5)`：即使用户仅上传了原件（L3）或仅切了图（L2），也能被正常检查与级联删除。

---

### 3. 历史缓存检索接口降级匹配 (L1 ➔ L2 ➔ L3)

#### [MODIFY] [route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/cached/route.ts)
- **列表扫描（GET 无参）**：
  1. **第一优先级 L1**：扫描 `.cache/parses/*.json`，已真实解析的文档记录为 `L1`，加入 `seenMd5s` 集合；
  2. **第二优先级 L2**：扫描 `.cache/preprocessed/`，过滤出未在 `seenMd5s` 中的目录，读取其 `meta.json` 和切图产物，动态组装为 `L2`（预处理就绪，`model: '未调用模型'`）摘要条目；
  3. **第三优先级 L3**：扫描 `.cache/uploads/`，过滤出既无 L1 又无 L2 的文件，动态组装为 `L3`（仅原件）摘要条目；
  4. 按时间倒序排序输出。
- **单文档详情检索（GET ?md5=...）**：
  1. 先查 L1（`globalParseCacheStore.getValid`）；
  2. 若无 L1，查 L2（`globalDocumentPreprocessorService.getPreprocessed`），在内存中动态组装完整的 `L2` `CachedParseResult`（包含切图 URL `pages`、`extractedText` 和待填写的空批次结构，`cacheLevel: 'L2'`），**不回写磁盘**；
  3. 若无 L2，查 L3（`uploads` 原件），动态组装 `L3` 响应；
  4. 均不存在时返回 404。
- **级联删除（DELETE）**：
  - 检查文档在 L1、L2、L3 任一层级是否存在，存在即调用 `deleteCascade` 清理三层产物并返回 200。

---

### 4. 解析主入口保护

#### [MODIFY] [route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/parse/route.ts)
- 解析时 `globalParseCacheStore.getValid(md5, currentConfigVersion)` 仅命中真实的 L1 缓存；
- 若仅命中 L2 或 L3，继续向下执行大模型流式调用；
- 大模型流式和非流式解析完成落盘时，显式将 `cacheItem.cacheLevel` 标记为 `'L1'`。

---

## Verification Plan

### Automated Tests
1. **单元测试与 API 契约测试**：
   - 运行 `pnpm test tests/api/preprocess-route.test.ts`（验证预处理不再写入 `.cache/parses/`）；
   - 运行 `pnpm test tests/api/cached-documents-route.test.ts`（增补测试用例：验证纯 L2 和纯 L3 文档的降级扫描与恢复返回）；
   - 运行全量测试套件 `pnpm test`（确保 54 套件 265+ 测试 100% 绿灯）。
2. **静态类型检查**：
   - `pnpm typecheck`（确保 `tsc --noEmit` 0 错误）。

### Manual Verification
1. 检查上传新质保书 PDF：
   - 观察预处理日志：只有 uploads 与 preprocessed 落盘，无 `.cache/parses/` 草稿写入；
   - 观察 `/api/documents/cached` 接口：列表中出现该文档，徽标为蓝色 `L2 预处理`；
   - 点击“开始解析”：触发真实大模型抽取，日志打印 `发起双模态大模型抽取`，正常流式输出各批次理化数据；
   - 解析完成后：查看 `.cache/parses/` 成功生成真实 L1 文件，列表中徽章升级为绿色 `L1 已解析`。
