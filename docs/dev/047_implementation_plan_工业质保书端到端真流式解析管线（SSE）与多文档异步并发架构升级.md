# 工业质保书端到端真流式解析管线（SSE）与多文档异步并发架构升级

## 概述
将当前系统基于本地定时器切片的“假流式”模拟打字机制，彻底重构为**端到端实时流式解析管线（Server-Sent Events / Web ReadableStream）**。
实现大模型 Token 级即时增量推送，进度展示与后端真实生命周期强绑定；并对命中已有解析缓存的文档实现秒级直出与静默就绪，在流式传输完成后自动进行 JSON 格式化与语法着色渲染。

---

## 经由 /grill-me 确认的核心决策

1. **协议与端点架构**：统一在 `/api/documents/parse` 采用 `ReadableStream` (`text/event-stream`)，通过标准事件通道（`cached` / `progress` / `chunk` / `complete` / `error`）传递生命周期。为兼容既有自动化测试套件，接口自适应支持标准 SSE 与静态调用。
2. **两级缓存行为细化**：
   - 若命中 `.cache/parses/{md5}.json` 有效缓存：触发 `event: cached` 秒级直出数据，跳过流式打字，直接就绪。
   - 若仅有 `.cache/preprocessed/{md5}/` 切图与文本缓存，但无 parses 缓存：复用切图与文本，但必须启动大模型真实实时流式解析。
3. **真实进度生命周期划分（五段式驱动）**：
   - `10% PREPROCESSING`: 预处理资产（切图/矢量文本）读取与校验；
   - `25% LLM_CONNECTING`: 建立大模型 API 连接，等待首字到达（TTFT 首 Token 阶段）；
   - `30%~85% GENERATING`: 真实流式输出中，根据累计传输内容平滑推进并实时追加增量字符；
   - `90% VALIDATING`: 模型输出完毕，正在执行 Zod Schema 结构化校验与 BBox 坐标关联；
   - `100% COMPLETE`: 数据校验合规并持久化入库，输出最终格式化 JSON。
4. **多文档独立并发隔离**：各文档在 2 线程并发工作池中独立持有各自的 SSE Reader，进度、阶段与流式内容完全相互隔离，互不阻塞。
5. **完成态 JSON 美化与语法高亮**：流式结束后剥离 markdown 外皮，格式化缩进排版，并在终端中对 Key、数字、字符串进行工业控制台风格语法着色。

---

## 拟定修改文件清单

### [MODIFY] [src/extractor/openai-compatible-extractor.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/openai-compatible-extractor.ts)
- 增加 `extractStream(input, options, onChunk)` 方法，启用 `stream: true`；
- 使用 fetch ReadableStream 逐行解析大模型服务端 SSE 数据流，提取 `choices[0].delta.content` 并实时触发 `onChunk` 回调；
- 累计拼接完整内容并在流结束（`[DONE]`）后执行结构解析与 Token 统计。

### [MODIFY] [src/app/api/documents/parse/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/parse/route.ts)
- 路由处理函数重构为支持 `text/event-stream` ReadableStream 输出；
- 优先检查 `.cache/parses/`：命中时输出 `event: cached` 并直接推送缓存数据；
- 未命中时推进五段真实生命周期，调用 `extractStream` 实时写出 `event: chunk`，结束时执行 Zod 校验、BBox 生成与缓存写入，推送 `event: complete`；
- 维持对未开启流式环境/单测的兼容性。

### [MODIFY] [src/hooks/useDocumentParser.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/hooks/useDocumentParser.ts)
- 彻底移除 `setInterval` 模拟打字定时器逻辑；
- 在 `executeDocumentWorker` 中使用 `res.body.getReader()` 实现真流式 SSE 消费器；
- 各文档独立消费流，收到 `chunk` 实时追加并平滑滚动，收到 `progress` 准确反映后端阶段；
- 收到 `cached` 事件直接将数据交付 `onDocumentParsed` 并标记 `ready 100%`，跳过流式动画；
- 收到 `complete` 事件触发完成回调并交付全景数据。

### [MODIFY] [src/components/LlmStreamingTerminal.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/LlmStreamingTerminal.tsx)
- 增强完成态 JSON 语法着色展示功能（保留打字时的单色控制台风格，完成后渲染彩色层级语法高亮）；
- 优化命中缓存时的折叠展示体验，确保信息传达清晰。

---

## 验证计划

### 1. 自动化单元与集成测试
- 运行 `pnpm test`，确保全套 34 个既有测试套件 149 个用例 100% 保持绿色通过；
- 补充针对 `extractStream` 与 SSE 路由的单元测试，验证断流、异常、BBox 整合与阶段事件推送。

### 2. 真实场景验证
- 针对仅存在 `.cache/preprocessed` 的真实文档，触发实时流式解析，验证大模型每吐出一个 Token 终端即时刷新；
- 针对已有 `.cache/parses` 缓存的文档，验证秒级直出，终端不走打字回放，直接就绪呈现数据；
- 针对多份文档同时解析场景，验证文档间进度与输出互不干扰。
- 运行 `pnpm typecheck` 保证 Strict Mode 下 0 错误。
