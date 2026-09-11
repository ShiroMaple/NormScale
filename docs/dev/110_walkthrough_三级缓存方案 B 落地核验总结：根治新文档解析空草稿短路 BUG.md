# 三级缓存方案 B 落地核验总结：根治新文档解析空草稿短路 BUG

## 一、 修复背景与根因

用户反馈上传新质保书（如 `测试质保书1.pdf`）预处理正常落盘，但送入解析环节时数据全空。
经排查根因为：
1. `POST /api/documents/preprocess` 在预处理完成时，为了让文档在步骤 1 下方「历史已缓存文档」中可见，向 `.cache/parses/{md5}.json` 写入了一份 `cacheLevel: 'L2'`、`model: '未调用模型'` 且所有批次数据为空的初始草稿；
2. 进入解析环节调用 `POST /api/documents/parse` 时，缓存校验逻辑 `globalParseCacheStore.getValid(md5, currentConfigVersion)` 仅匹配了 MD5 与 Schema/Prompt 配置版本号，未过滤 `L2` 等级与未调用模型状态；
3. 解析接口误判为**命中有效解析缓存 (0 Token)**，直接返回空草稿，彻底绕过了大模型抽取流程。

---

## 二、 方案 B 核心实施内容

### 1. 彻底移除占位草稿写入
- 在 [`src/app/api/documents/preprocess/route.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/preprocess/route.ts) 中彻底删除了向 `.cache/parses/` 写入 L2 占位草稿的代码块；
- 预处理仅管理原件落盘（L3）与切图/文本提取（L2），并在 [`src/services/document-preprocessor.service.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/services/document-preprocessor.service.ts) 中向 `.cache/preprocessed/{md5}/meta.json` 沉淀原件文件名与大小元数据。

### 2. 加固缓存有效性校验门禁
- 在 [`src/repository/parse-cache-store.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/repository/parse-cache-store.ts) 的 `getValid()` 中注入严格准入条件：
  - 严禁将 `cacheLevel === 'L2'`、`model === '未调用模型'` 或 `ocrStatus === 'PENDING'` 判定为有效解析缓存；
  - 防御性校验批次数据真实性，若批次全为空草稿则判定无效返回 `null`；
  - 补充 `hasAny(md5)` 方法以全面感知 L1/L2/L3 任意层级缓存的存在性。

### 3. `/api/documents/cached` 实现 L1 ➔ L2 ➔ L3 降级匹配
- 在 [`src/app/api/documents/cached/route.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/cached/route.ts) 中：
  - **列表扫描（GET 无参）**：
    1. 第一优先级检索 L1 (`.cache/parses/*.json`) 真实解析文档；
    2. 第二优先级检索 L2 (`.cache/preprocessed/`) 预处理文档，动态组装为 `cacheLevel: 'L2'` 条目；
    3. 第三优先级检索 L3 (`.cache/uploads/`) 仅原件文档，动态组装为 `cacheLevel: 'L3'` 条目；
    4. 统一按时间倒序输出，前端无需任何特殊适配即可无缝展现 `L1 已解析` / `L2 预处理` 徽章。
  - **单文档恢复（GET ?md5=...）**：
    - 若无 L1 缓存，检索到 L2 资产时在内存中动态组装完整的待解析对象并附带切图 URL，**绝不回写 `.cache/parses/`**；
  - **级联删除（DELETE）**：
    - 支持对任意一级缓存（即使只有 L2 或 L3）安全级联物理清除。

### 4. 解析主入口与结果写入显式 L1 标记
- 在 [`src/app/api/documents/parse/route.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/parse/route.ts) 中：
  - 流式与非流式结果持久化时显式写入 `cacheLevel: 'L1'`；
  - `GET /api/documents/parse` 增加严格的真 L1 门禁过滤。

---

## 三、 验证结果

### 1. 自动化测试套件全绿
- 运行 `pnpm test tests/api/cached-documents-route.test.ts`：6 项单测通过（包含 L2 降级匹配、L3 降级匹配与 L2 级联删除）；
- 运行 `pnpm test tests/extractor/parse-route-no-mock.test.ts`：3 项单测通过（包含文档仅有 L2 时 parse 绝不被拦截为 cached: true）；
- 运行 `pnpm test tests/repository/parse-cache-store.test.ts`：4 项单测通过（包含 getValid 严密拦截 L2 草稿）；
- 全量回归：**54 个测试套件，270 项自动化测试 100% 绿灯通过**。

### 2. 静态类型检查
- 运行 `pnpm typecheck`：`tsc --noEmit` 0 错误。
