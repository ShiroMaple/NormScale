# 系统管理页面优化与实时系统运行日志控制台落地总结

## 变更概览

根据 `/grill-me` 达成的共识，本次工作对「系统管理」模块进行了全景重构与工业级视觉与运维能力升级：

1. **新增专职「系统运行日志」控制台**：
   - 后端基于 `DefaultDomainLogger` 构建了 1000 条上限的无锁内存环形缓冲池（Ring Buffer）；
   - 提供 `/api/admin/logs/stream` 原生 Server-Sent Events (SSE) 长连接流式分发与心跳保活；
   - 提供 `/api/admin/logs` 接口支持实时读取历史缓冲日志并动态下发全局日志输出级别（`debug` / `info` / `warn` / `error` / `silent`）；
   - 前端封装了 [`SystemLogViewer.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/SystemLogViewer.tsx)，配备呼吸灯连接指示、级别过滤胶囊、模块标签下拉、关键字模糊检索、容器内独立平滑滚动、暂停/恢复、一键清屏与日志文件导出；
2. **「参数设置」页面重构与五五开排版**：
   - 原「大模型路由与参数设置」更名为「参数设置」，图标更新为齿轮 `settings`；
   - 业内网格布局由原 7:5 改为 1:1 五五开（`grid-cols-1 lg:grid-cols-2`），左右对称舒展；
   - Tab 切换栏按照业务直觉重新排布：`[参数设置] -> [系统运行日志] -> [动态别名白盒知识库]`；
3. **精简冗余面板**：
   - 彻底移除了模型计费面板（`appConfig.llm.pricing`）；
   - 彻底移除了原右侧底部占位简易的「领域引擎运行状态」日志面板，使参数设置页专注于参数与版本管理；
4. **模型配置容器视觉全面升级**：
   - 采用工业级微服务卡片设计，默认推理模型享有左侧高质感主色 Accent 导光条与立体浮雕微边框；
   - 卡片 Header 配备芯片徽标、行内微编辑名称、ID 胶囊与立体状态药丸；
   - API Base URL 与 API Key 环境变量输入框分别增设 `link` 链接前缀与 `$` 环境变量图标，排版呼吸感更强。
5. **全页面 `font-mono` 彻底清理与中文字体回退治理**：
   - 根因消除：彻底清除下拉框、输入框、表头、卡片徽标及统计数值中残留的 `font-mono`，根治 Windows 平台下西文等宽字体（Consolas / Courier New）导致汉字恶性回退为「中易宋体 / 新宋体」的排版割裂问题；
   - 现代无衬线统一：文本、选项与表单控件统一采用现代无衬线字体（`font-sans`，优先匹配微软雅黑 / PingFang SC），数值等宽对齐采用 CSS `tabular-nums`，兼顾等宽排版与优美字形；
   - 治理范围：覆盖 [`SystemLogViewer.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/SystemLogViewer.tsx)、[`AdminConsole.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/AdminConsole.tsx) 及会话确认弹窗，相关文件中的 `font-mono` 出现次数归零。
6. **日志持久化、热重载隔离与前端 Keep-Alive 闭环落地**：
   - 根除文件变动误触重编译：在 [`next.config.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/next.config.ts) 中配置 Webpack `watchOptions.ignored`，彻底排除 `**/.cache/**` 与 `**/config.json`，解决工作台解析质保书落盘导致 Next.js 开发服务器静默重启的致命根因；
   - 级别持久化至配置：在 [`config.json`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/config.json) 扩展 `"logging": { "level": "..." }` 节点，动态调级接口与日志器初始化双向同步；
   - 全局单例与磁盘日志流：[`src/logger/index.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/logger/index.ts) 挂载至 `globalThis` 防止重载重复实例化，并追加流至 `.cache/logs/system.log`（启动自动预填最近历史）；
   - 前端视图保活：在 [`src/app/page.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/page.tsx) 中对 `AdminConsole` 启用 CSS `hidden` 保活，切到工作台期间 SSE 保持连接，切回毫秒级呈现完整轨迹。

---

## 核心实现代码指针

| 模块 / 文件 | 路径 | 核心能力说明 |
|---|---|---|
| **日志缓冲与广播** | [`src/logger/default-logger.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/logger/default-logger.ts) | 引入无锁环形缓冲池（1000 条上限）与 Pub/Sub 事件发布订阅 |
| **日志查询与级别 API** | [`src/app/api/admin/logs/route.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/admin/logs/route.ts) | GET 读取历史缓冲与过滤；POST 动态更新系统全局日志严重度 |
| **SSE 实时流端点** | [`src/app/api/admin/logs/stream/route.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/admin/logs/stream/route.ts) | 原生 ReadableStream 驱动的 EventSource 流式推送与心跳保活 |
| **系统日志控制台** | [`src/components/SystemLogViewer.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/SystemLogViewer.tsx) | 全功能工业暗色终端视窗、多维组合筛选与独立容器平滑滚屏（无 `font-mono`） |
| **系统管理控制台** | [`src/components/AdminConsole.tsx`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/components/AdminConsole.tsx) | Tab 状态与图标重构、五五开布局、模型容器微服务卡片（无 `font-mono`） |
| **单元测试** | [`tests/api/admin-logs.test.ts`](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/tests/api/admin-logs.test.ts) | 覆盖日志读取、关键词过滤、动态级别修改及 SSE 端点协议测试 |

---

## 验证结论与界面展示

### 1. 自动化测试与类型检查
- **类型校验**：`pnpm exec tsc --noEmit` 严格模式 **0 错误**；
- **全量单测**：`pnpm test` 全项目 **52 个测试文件、258 项测试 100% 绿灯秒级通过**。

### 2. 真机实测截图

#### ①「参数设置」页面五五开与高质感模型微服务容器
![参数设置五五开与模型容器](/Users/gaoft/.gemini/antigravity-ide/brain/bcc8bee0-72e2-4f47-a457-f2f1e37a9f28/admin_params_settings_1789007892124.png)
- 齿轮图标「参数设置」Tab 处于激活态；
- 左右 1:1 对称五五开；
- 默认模型卡片左侧带有高质感主色导轨与立体默认徽章，输入框带有 `link` 和 `$` 符号；
- 计费面板与旧简易日志面板已完全移除。

#### ②「系统运行日志」实时流式控制台
![系统运行日志实时控制台](/Users/gaoft/.gemini/antigravity-ide/brain/bcc8bee0-72e2-4f47-a457-f2f1e37a9f28/admin_system_logs_1789008003993.png)
- 「SSE 实时流在线」绿色呼吸灯就绪；
- 动态调整日志级别为 `DEBUG` 时，服务端立即通过 SSE 推送新日志并实时打印在终端上；
- 滚动条严格限制在暗色终端内部，外层页面零抖动；
- 各级过滤器、关键词搜索与操作按钮均正常运作。

#### ③ 下拉框中文字体回退修复（微软雅黑现代无衬线）
![下拉框字体回退修复核验](/Users/gaoft/.gemini/antigravity-ide/brain/bcc8bee0-72e2-4f47-a457-f2f1e37a9f28/module_dropdown_font_check_1789009554481.png)
- 彻底移除 `font-mono` 后，下拉选项「全部模块 (ALL)」及各模块标签中的中文完全脱离了 Windows 默认的宋体/新宋体，呈现为清晰、现代、饱满的无衬线体（Microsoft YaHei）。

#### ④ 切至工作台执行质检后切回日志（级别持久为 DEBUG，捕获 114 条全量执行轨迹）
![工作台执行后切回系统管理日志流完整保留](/Users/gaoft/.gemini/antigravity-ide/brain/bcc8bee0-72e2-4f47-a457-f2f1e37a9f28/system_log_screen_1789018788893.png)
- 输出级别下拉框严格稳定保持为 `DEBUG (全量调试细节)`，未发生任何回退；
- 日志视窗内完整累积呈现 114 条日志，成功记录了刚才在工作台执行的 `ENGINE`、`WORKFLOW`、`EXTRACTOR`、`REPOSITORY` 详细判定过程与 DEBUG 级参数对比细节，无任何清空或漏包。
