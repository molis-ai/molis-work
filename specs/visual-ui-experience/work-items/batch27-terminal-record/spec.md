# 第 27 批终端记录读取

状态：本片已合回批次分支，定向验证通过，待整批集成验证（2026-11-09；负责人：Codex 第 27 批统筹）。完成程度沿用第 27 批 Runtime、Goals 与沙箱余项的交付要求；已有证据覆盖 Goals 实际 HTTP 路径的坏记录拒绝和修正后恢复，不代替整批验收。

## 目标与边界

属于 [27-4](../../../post-anticorruption-roadmap/reference/batches/27.md#batch-27-item-4) 的 BL-913（已做完删除）。基点 `d2cae4ec8` 上，终端记录的 `launch_args` 经过 `record()` 解码。合法 JSON 的值不符合字符串数组形状时，目录抛出 `actions.execution_failed`。JSON 语法损坏时，裸解析抛出 `SyntaxError`，列出时被当成目录不可用，按原 key 重开时也丢失记录损坏的原因。

依赖基点已具备的终端目录、本人动作和 Goals 路由（T-137、T-148 及第 02／07 批的相关前置），可以独立验证。本片与在途 #1999 的终端启动安全检查、#2001 的 Projects／Context 合同按文件隔离。写手只改 `apps/local-host/src/plugin-terminal-panels.ts`、`tests/goals-terminal.test.ts` 和本规格，由第 27 批主会话集成和统一关闭待办。

在目录的共同解码点，将 JSON 语法损坏送入现有字符串数组检查的拒绝分支。两种坏值都返回同一个现有码和说明，正常读取仍交付原字符串数组。调用方共用这次判定。数据库结构、动作、权限和启动流程沿用现行设计。坏记录由维护步骤另行修正，本片只负责读取与拒绝。

## 验收与验证

| 编号 | 可观察结果 |
| --- | --- |
| BTR-01 | Goals 的终端列表和同 key 重开对坏 JSON 和形状错误的 JSON 都返回 HTTP 500、`actions.execution_failed` 与「终端面板的启动参数记录无效」。 |
| BTR-02 | 拒绝期间没有启动进程。面板、别名及终端项目事件保持原状，坏值仍在原行。 |
| BTR-03 | 修正原行后列表显示同一面板和原启动参数。同 key 重开确实启动原命令，复用同一面板及业务记录。 |

用隔离 Home 经现有 Goals HTTP 入口正常建立终端并停止进程，再将故障注入该目录的 SQLite 记录。基线保留生产解码器并运行新增用例以确认失败。修复后执行 `pnpm build`，再运行 `node scripts/machine-slot.mjs run browser --label "27-4 BL-913 tests" -- node scripts/run-tests.mjs --jobs 1 tests/goals-terminal.test.ts`。交回前运行 `node scripts/machine-slot.mjs run build --label "27-4 BL-913 health" -- node scripts/check-health-gates.mjs --base origin/main` 和 `git diff --check`。相关包回归由主会话在整批头统一安排。此处的实操为临时 Home 中的真实 Host、HTTP 和受控本地终端，不涉及用户数据。

基线新增用例确认坏 JSON 使列表返回 503 和 `actions.unavailable`，重开返回 500 和解析器原文。修复后整体构建通过，Goals 终端用例 5 项通过。BTR-01 两个入口对两类坏值返回同一个记录错误，BTR-02 启动次数及原记录、别名和终端项目事件没有变化，BTR-03 修正后读回原参数并启动同一面板。

## 开工前检查

| 项 | 判定 |
| --- | --- |
| 1 事实主人 | 面板和别名仍归平台终端目录。Goals 通过 `services.terminal` 访问。 |
| 2 插件同等待遇 | 修复作用于共享目录，沿用 Plugin Runtime 装配及同一 SDK 服务。 |
| 3 能力注册 | 不涉及。沿用已登记动作、调用上下文身份和现有调度。 |
| 4 合同 | 不涉及。复用现行错误码与分类，动作与持久化形状沿用。 |
| 5 包与分层 | 修复在 Local Host 终端目录的现有解码点。 |
| 6 表与存储 | 不涉及。沿用目录表，仅测试向临时 Home 注入坏文本。 |
| 7 兼容与迁移 | 不涉及。读时拒绝坏值，有效格式照常读取。 |
| 8 安全边界 | 不涉及。授权、目录检查和启动条件沿用，坏值在启动前拒绝。 |
| 9 调用次数 | 列出和重开分别沿用当前请求、目录和授权路径，每行解析一次。 |
| 10 升级与数据 | 原键、记录和有效启动参数继续使用。读取失败保留原始记录。 |
| 11 成果与过程项 | 不涉及。此处只读终端状态。 |
| 12 页面与文字 | 不涉及。复用已有错误说明和传输响应，界面资源与交互沿用。 |
| 13 错误 | 复用现有 `ActionError` 和 `actions.execution_failed`。 |
| 14 冲突面 | 只写上述三个路径。启动安全检查、Projects／Context 与共享索引由各自会话负责。 |
| 15 全局最优 | 插件共用目录读取。平台在解码处统一处理，比在 Goals 或服务的各个调用点加捕获少一次判断维护。助理和 Agent 不涉及，终端动作只对本人开放。工作流、MCP、搜索等平台能力沿用原入口。后续终端检查沿同一解码点，无需为本片增加合同或升级步骤。 |
