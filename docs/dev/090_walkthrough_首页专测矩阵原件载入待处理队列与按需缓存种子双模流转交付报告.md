# 首页专测矩阵原件载入待处理队列与按需缓存种子双模流转交付报告

## 1. 核心需求与改造亮点

针对首页「四维典型场景专测矩阵」在点击「一键装载」时提示“载入缓存失败: 未找到指定文档的解析缓存”的问题，本次开发彻底改造了装载机制，实现测试用例原件与真实生产上传完全同构的流转体验：

1. **测试用例真实 PDF 原件入队（First-Class Uploaded Files）**：
   - 弃用老旧的直接读取切片缓存 JSON 的机制；
   - 点击专测卡片「一键装载」时，前端通过 `fetch(scenario.pdf_url)` 异步拉取 `/samples/*.pdf` 真实高清矢量 PDF 二进制流并实例化为原生 `File` 对象；
   - 自动调用系统统一的 `handleRealFiles([file])` 处理流水线，完成 PDF 渲染切图、首页文本快速提取、计算真实 MD5 与预处理入队；
2. **防重校验与沉浸式操作流转**：
   - 装载前自动进行文件名比对防重：若队列中已有同名用例，自动高亮选中该项并弹出 Toast 提示，避免重复入队；
   - 装载完成后自动选中新装入的测试用例并**停留在步骤 1（文档准备与切图预览）**，质检员可直观检查切图，再点击底栏「解析文档，核对数据」继续推进；
   - 支持多个专测用例并发入队，或与用户真实上传的普通质保书混合批处理测试；
3. **服务端缓存种子按需补齐机制（Seeding on Demand）**：
   - 在 `ParseCacheStore` 中实现智能种子供给：当查询或获取对应测试场景的 MD5 缓存未命中时，系统自动将权威预置解析结果格式化为切片缓存并落盘持久化至 `.cache/parses/${md5}.json`；
   - **离线/在线双模无缝切换**：无大模型 API Key 时直接秒级命中该权威切片极速演练；在具备 API Key 时支持点击“重新解析”调用大模型进行真实文件提取；彻底根除 404 伪异常；
4. **精细化装载交互与视觉反馈**：
   - 装载过程按钮实时切换为 Loading 状态（旋转指示器 + “装载原件中...”文案）并禁用点击，防止误触重复触发；
   - 装载成功后弹出精致轻量 Toast 提示（如“已载入专测用例原件: [用例名]，可点击底栏继续解析”），卡片外观保持常规状态不变。

---

## 2. 变更文件清单

| 文件路径 | 变更类型 | 核心变更点 |
| :--- | :--- | :--- |
| [`tests/fixtures/scenarios/index.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/fixtures/scenarios/index.ts) | 修改 | 校准 Case 4 物理文件实际哈希为 `d40757c9cc2fb3856ece3c7857a3c511`；导出 `getScenarioCachedParseResult(md5)` 种子构建函数 |
| [`src/repository/parse-cache-store.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/repository/parse-cache-store.ts) | 修改 | `has(md5)` 与 `get(md5)` 增加针对专测场景的 Seeding on Demand 按需补齐与落盘机制 |
| [`src/components/WaterfallWorkbench.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/WaterfallWorkbench.tsx) | 修改 | 引入 `loadingScenarios` 状态；实现 `handleLoadScenarioFile` 抓取原件入队；专测矩阵按钮绑定新流水线 |
| [`tests/repository/parse-cache-store.test.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/repository/parse-cache-store.test.ts) | 修改 | 新增测试用例场景种子自动补齐与磁盘落盘断言测试 |
| [`cairn/langgraph-orchestration-and-fixtures.md`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/langgraph-orchestration-and-fixtures.md) | 修改 | 沉淀第 3.4 节双模装载流水线架构与第 4.3 节虚假缓存装载教训 |
| [`cairn/LOG.md`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/cairn/LOG.md) | 修改 | 顶部追加本次进展与关键决策日志 |

---

## 3. 验证结果

1. **单元测试与回归防护**：
   - 运行命令：`pnpm test`
   - 结果：**47 个测试套件，232 个测试全部通过（100% 绿色通过）**。
2. **TypeScript 严格静态类型检查**：
   - 运行命令：`pnpm exec tsc --noEmit`
   - 结果：**0 错误**，严格模式完全通过。
3. **Next.js 15 生产打包构建**：
   - 运行命令：`pnpm build`
   - 结果：**12/12 页面编译、类型检查与静态生成全绿通过**，耗时 2.8s。
