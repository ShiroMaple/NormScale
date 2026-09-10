# 文件上传 DEBUG 埋点、三级缓存架构落地与大模型解析日志增强实施方案

## 需求背景与目标
针对用户在手动测试中发现的 4 项关键问题进行闭环优化：
1. **上传过程补充细粒度 DEBUG 埋点**：在文件上传与预处理路由全流程打通高精度 DEBUG 级上下文输出（文件流大小、解析阶段、MD5计算耗时、落盘路径等）；
2. **构建三级缓存体系（方案 C）**：
   - **L1：解析缓存 (Parsed Cache)** —— 经过大模型成功抽取的结构化批次数据，直接免推理复用；
   - **L2：预处理缓存 (Preprocessed Cache)** —— 高清切图、提取文本、Tokens 坐标；
   - **L3：原件缓存 (Original Cache)** —— 本地持久化的原始二进制文件；
   - **方案 C 核心**：在步骤 1 上传文档并完成预处理落盘后，立即生成一份就绪草稿写入缓存体系，使文档在「历史已缓存文档」中立即可见，并在卡片上清晰标注缓存级别（L1 解析就绪 / L2 预处理就绪），点击恢复时按级别智能自适应；
3. **精简流式解析成功日志**：移除 `[OpenAI-Extractor-Stream]` 日志中生硬的 `(官方真实)` 与 `(备用估算)` 字样；
4. **增强解析指标输出**：在成功日志中补充模型名称、供应商、全流程耗时、首字响应延迟（Time to First Token, TTFT）及 Token 吞吐速率。

---

## 拟定变更方案

### 1. 大模型流式解析成功日志优化与可观测性增强（问题 3 & 4）
#### [MODIFY] [openai-compatible-extractor.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/extractor/openai-compatible-extractor.ts)
- **增加首字响应（TTFT）与总耗时统计**：
  - 发起网络请求前记录 `const requestStartTime = Date.now(); let ttftMs: number | null = null;`；
  - 流式响应流 `reader.read()` 循环中，在首次接收到有效内容增量 `delta` 时计算 `ttftMs = Date.now() - requestStartTime`；
  - 流式接收完毕后计算 `totalDurationMs = Date.now() - requestStartTime` 与生成速率 `tokens/s`；
- **重构流式解析成功日志格式**：
  - 去除 `(官方真实)` / `(备用估算)` 字样；
  - 格式调整为：
    ```text
    [OpenAI-Extractor-Stream] 流式解析成功 | 模型: ${model} (${provider}) | 耗时: ${durationSec}s (首字响应: ${ttftStr}, 速率: ${speedStr}) | 累计字符: ${charCount} | Token 开销: 输入 ${promptTokens} / 输出 ${completionTokens}
    ```

---

### 2. 文件上传与预处理全链路 DEBUG 埋点（问题 1）
#### [MODIFY] [preprocess/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/preprocess/route.ts)
在预处理服务端接口中注入完整的 DEBUG 级可观测性日志：
1. `[DEBUG]` 接收到客户端预处理 POST 请求：记录 Content-Type、请求来源；
2. `[DEBUG]` 文件解包完成：记录文件名、解包字节数、体积（KB/MB）、客户端预切图张数、客户端矢量文本字符数及 Token 坐标数；
3. `[DEBUG]` 格式准入校验：记录准入判定通过及检测出的文档类型；
4. `[DEBUG]` MD5 指纹计算：记录文件内容计算出的完整 MD5 指纹及计算耗时（ms）；
5. `[DEBUG]` L3 原件与 L2 预处理资产落盘细节：记录原件持久化绝对路径、切图产物目录、各页尺寸；
6. `[DEBUG]` 检索与生成缓存草稿详情。

---

### 3. 三级缓存架构（L1/L2/L3）与历史缓存联动（问题 2，方案 C）
#### [MODIFY] [preprocess/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/preprocess/route.ts)
- 当预处理（L2/L3）落盘成功后，检查 `.cache/parses/{md5}.json` 是否已存在：
  - 若不存在，立即写入一份具备完整预处理切图与文本信息的草稿结构，标明 `cacheLevel: 'L2_PREPROCESSED'`；
  - 此时历史缓存接口将立刻检索到该文档，实现“上传预处理即在缓存可见”。

#### [MODIFY] [cached/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/documents/cached/route.ts)
- 在返回的 `CachedDocSummary` 中增加 `cacheLevel: 'L1' | 'L2'` 字段；
- 根据是否包含模型实际抽取结果（`batches` 中是否有提取出的牌号/标准等）自动判定为 `L1`（已完成模型解析）或 `L2`（已就绪待解析）。

#### [MODIFY] [WaterfallWorkbench.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx)
- 在历史已缓存文档卡片上增加缓存级别徽章：
  - **L1 已解析**：绿色胶囊微标 `L1 已解析`；
  - **L2 待解析**：蓝色胶囊微标 `L2 预处理就绪`；
- 更新 `handleRestoreFromCache`：
  - 若恢复的文档为 L2 预处理就绪（未解析），载入待处理队列后状态标为 `'就绪'`，切图及原件直接就绪，用户可直接点击【解析文档，核对数据】开启检验；
  - 若为 L1 已解析，状态标为 `'已命中解析缓存'`，直接展示解析结果。

---

## 验证方案

### 自动化测试
1. **类型检查**：运行 `pnpm exec tsc --noEmit` 确保无类型错误；
2. **全量单测**：运行 `pnpm test` 确保 52 个测试套件、258 项测试 100% 绿灯。

### 浏览器端到端实测
1. 切换至 DEBUG 模式，上传一份新文档；
2. 打开「系统运行日志」，验证是否呈现完整的上传 DEBUG 日志（接收请求、解包大小、MD5计算耗时、原件落盘、切图落盘）；
3. 观察工作台步骤 1 下方的「历史已缓存文档」列表，验证刚才上传的文档是否立即呈现，并展示 `L2 预处理就绪` 徽章；
4. 点击右下角主按钮开启大模型流式解析，验证大模型流式成功日志中已去除 `(官方真实)`，并包含模型、总耗时、首字响应延迟（TTFT）与速率。
