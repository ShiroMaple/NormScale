# 系统运行日志持久化、热重载隔离与端到端协同治理实现方案

解决用户在「系统运行日志」调整输出级别为 `DEBUG` 后切换至工作台执行质检，由于 `.cache/` 运行时文件写入触发 Next.js 开发服务器热重载、日志实例非全局单例、日志级别未持久化及前端组件卸载，导致日志清空与级别回退的问题。

## User Review Required

> [!IMPORTANT]
> - **持久化位置确认**：遵循用户明确指示，日志级别将保存在 [config.json](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/config.json) 的 `"logging": { "level": "..." }` 节点中，任何界面调整或重启都将与该配置同步。
> - **文件系统监听配置**：在 [next.config.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/next.config.ts) 中配置 Webpack `watchOptions.ignored`，彻底排除 `**/.cache/**` 和 `**/config.json`，确保工作台质检解析落盘不会导致开发服务器静默重编译。

## Open Questions

- 无。方案已在上一轮与用户讨论充分并全部获批。

---

## Proposed Changes

### 1. 开发服务器与文件系统隔离

#### [MODIFY] [next.config.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/next.config.ts)
- 在开发模式下为 Webpack 添加 `watchOptions.ignored` 规则：
  - 忽略 `**/.cache/**`（质保书上传原件、MD5 缓存索引、切片图、审计台账）；
  - 忽略 `**/config.json`（避免动态更新日志级别或大模型配置时触发重编译）。

---

### 2. 配置文件模式扩展与持久化

#### [MODIFY] [config.json](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/config.json)
- 新增 `"logging": { "level": "info" }` 节点，作为系统启动时的基准日志级别。

#### [MODIFY] [src/app/api/admin/config/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/admin/config/route.ts)
- 更新 `AdminConfigSchema`，增加 `logging` 节点支持与默认值校验；
- `POST` 保存配置时保留并同步 `logging.level`。

#### [MODIFY] [src/app/api/admin/logs/route.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/api/admin/logs/route.ts)
- 在 `POST /api/admin/logs` 更新日志级别时，同步读写 [config.json](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/config.json)，将 `newLevel` 持久化到 `"logging": { "level": newLevel }` 中。

---

### 3. 日志基础设施加固（全局单例 + 磁盘追加流）

#### [MODIFY] [src/logger/index.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/logger/index.ts)
- 引入 `globalThis.__normscale_logger__` 全局单例保护，避免 Next.js 模块热重载或跨 Chunk 重复实例化导致环形缓冲池被覆盖。

#### [MODIFY] [src/logger/default-logger.ts](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/logger/default-logger.ts)
- 构造函数初始化时，优先从环境变量 `LOG_LEVEL` 或 [config.json](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/config.json) 读取 `level`；
- 实现 `appendLogToDisk(event: LogEvent)`：以追加写入（Append-only）形式落盘至 `.cache/logs/system.log`（单测环境自动跳过），提供离线审计回溯能力；
- 构造函数若发现内存环形缓冲为空且存在磁盘日志文件，自动装载最近 200 条作为初始缓冲，保证全生命周期无缝衔接。

---

### 4. 前端视图生命周期保活（Keep-Alive）

#### [MODIFY] [src/app/page.tsx](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/src/app/page.tsx)
- 将 `activeTab === 'admin'` 的条件渲染改造为与 `WaterfallWorkbench` 一致的 CSS 显隐切换：
  ```tsx
  <div className={`w-full h-full ${activeTab === 'admin' ? 'block' : 'hidden'}`}>
    <AdminConsole />
  </div>
  ```
- 保持 `AdminConsole` 与其内部 `SystemLogViewer` 的 SSE 长连接在后台不中断；当用户在工作台执行解析比对时，日志实时推流并持续累积，切回时毫秒级呈现完整轨迹。

---

## Verification Plan

### Automated Tests
- 执行 `pnpm test tests/api/admin-logs.test.ts` 与 `pnpm test tests/api/admin-config-route.test.ts`；
- 执行 `pnpm test` 全量 52 个测试套件，确保 258 项测试保持 100% 绿灯；
- 执行 `pnpm exec tsc --noEmit` 确保零 TypeScript 编译错误。

### Manual / Browser Verification
- 启动无头浏览器模拟真实用户流程：
  1. 访问系统管理，将日志级别切换为 `DEBUG`；
  2. 验证 [config.json](file:///c:/Users/gaoft/Documents/CodeSpace/NormScale/config.json) 中 `"level": "debug"` 已成功写入；
  3. 切换至工作台，执行一次质检样例（触发文件预处理与规则比对）；
  4. 切回系统管理，截屏验证：
     - 输出级别下拉框严格保持 `DEBUG`；
     - 日志流窗口实时保留并展现刚才在工作台执行的完整执行轨迹与详细 `DEBUG` 判定信息，无任何白屏、清空或回退。
