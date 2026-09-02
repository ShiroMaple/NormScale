# 步骤 1 文档预处理、文本层提取、两级缓存索引与配置项版本失效架构落地报告

## 1. 核心变更概览

已全面对照您确定的 9 条核心准则以及配置项版本失效门禁机制，完成系统架构重构与落地：

| 序号 | 需求准则 | 落地文件与技术实现 |
|---|---|---|
| **1** | **格式准入与原件存储** | 在 [document-preprocessor.service.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/services/document-preprocessor.service.ts) 中实现格式校验（仅支持 PDF 与 PNG/JPEG/JPG/BMP），并将原件安全持久化落盘至 `.cache/uploads/{md5}.{ext}` |
| **2** | **PDF 文本层检测与分离** | 在 [pdf-renderer.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/utils/pdf-renderer.ts) 中通过 PDF.js 矢量文本抽取，若存在有效文本层则提取并分离为 `text.txt` 供模型作为高精度校对依据 |
| **3** | **PDF 分页切图** | 在 [pdf-renderer.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/utils/pdf-renderer.ts) 中逐页栅格化渲染 2.0x Retina PNG 高清图，与 `text.txt` 共同存入 `.cache/preprocessed/{md5}/` |
| **4** | **自包含清单索引** | 扩展 [parse-cache-store.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/repository/parse-cache-store.ts)，建立原件路径、MD5、预处理切图/文本目录、`parserConfigVersion` 及模型解析结果的统一清单索引 |
| **5** | **双重缓存识别** | 在 [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx) 中，无论是点击历史缓存卡片还是上传相同 MD5 文件，均实时智能识别并标记缓存就绪状态 |
| **6** | **两级复用策略** | 默认优先秒级复用第一级模型解析结果（0 Token 开销）；若不存在或触发强制重新解析，自动复用第二级预处理产物（切图与 `text.txt`）直连大模型，避免重复切图 |
| **7** | **配置项版本失效门禁** | 在 [config.json](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/config.json) 与 [AdminConsole.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/AdminConsole.tsx) 中引入由管理员维护的 `parserConfigVersion`（与 `certificate.schema.ts` 和 Prompt 绑定）；仅版本一致时允许复用解析结果，版本不一致时解析缓存自动失效并无缝触发重析 |
| **8** | **级联清理与台账隔离** | 在 [cached/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/cached/route.ts) 的 DELETE 接口中通过 `deleteCascade` 级联删除 `.cache/uploads/`、`.cache/preprocessed/{md5}/` 与 `.cache/parses/{md5}.json`，绝对隔离并不影响历史检验台账（`AuditLedger`） |
| **9** | **高内聚与日志埋点** | 全流程接入 [DefaultLogger](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/logger/default-logger.ts)，各模块严格按照领域职责（`EXTRACTOR`、`REPOSITORY` 等）规范埋点 |
| **10** | **大模型双模态融合** | 在 [openai-compatible-extractor.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/openai-compatible-extractor.ts) 中采用标准 OpenAI 兼容协议的多模态 Payload（文本层 Prompt + 高清切图 Base64），完全规避对第三方私有文件接口的依赖 |

---

## 2. 自动化验证与质量门禁

- **TypeScript 严格类型检查**：`pnpm typecheck` **0 错误**；
- **自动化单元测试套件**：新增 [document-preprocessor.test.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/preprocessor/document-preprocessor.test.ts) 等 **29 个测试套件，133 个单元测试 100% 绿色全部通过**；
- **知识库同步**：进展与关键架构决策已同步记录至 [LOG.md](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/LOG.md)。
