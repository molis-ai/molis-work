# WK3 — Work Native Plugin 迁移验收

核对日期：2026-09-05。对应 `goal-reorg-wk3` Contract revision 1。只验收 Work 既有用例迁移，不宣布整体重组或最终用户验收完成。

## Boundary

- Work 拥有 Session 创建/发现、内容/恢复、交接、TUI 记录、工作目录变更应用编排，以及对应 UI/HTTP 用例。目录关系失败的补偿恢复由 `workspace-actions.ts` 负责。
- Session、内容和 Handoff 事实仍归 Private Work Context。Work 只引用 Contracts 的 `WorkSessionApi` / Query / Command，无数据库驱动、SQL、Repository 或 legacy src import。
- Project/workspace membership 仍归 Projects。Desktop Panel 状态仍归 Desktop service，跨界类型和既有操作统一为 `platform/app-host` 的 `DesktopPanelApi`，Work 不复制事实。
- Runtime 调用通过 `RuntimeHostApi`。Codex app-server、PTY 进程归 Runtime Host；浏览器连接、面板恢复和用户操作归 Work。
- Workbench 通过 UI Host 注册 Session/Terminal 两个 Work contribution，决定挂载位置；浏览器 bootstrap 只调用公开 `terminal-client`。xterm 依赖和终端英文目录跟随 Work。
- Web Server 提供鉴权后的请求、事实查询/命令、资源生命周期和 filesystem/Runtime/Feed/Goal 端口。`render.ts` 只把 Goals 的既有状态展示转换为 Work 输入，不维护终端模板。
- 最终边界检查：48 packages、236 source files、537 imports、62 dependency edges、30 Contract subpaths；`errors: []`。无 deep import、跨 owner Store 或 Plugin implementation 互相依赖。

对应 `wk3-boundary`。

## Legacy exit

caller 清零后删除：

- `src/sessions/content.ts`、`directory.ts`、`handoff.ts`、`registry-fallback-adapter.ts`、`tui-recorder.ts`。
- `src/web/project-session-workspaces.ts`、`src/web/pty-client.ts`、`src/web/workspace-project-actions.ts`。
- 无生产用途的 `src/sessions/registry.ts`、`content-store.ts`、`codex-transport.ts`、`adapters.ts`；测试也切到正式 owner。

不是整文件改名：Handoff 分成 draft/application、delivery/recovery、package rendering；Session UI 分成模板、样式和内容/目录/新建/关联/交接控制器；终端分成页面装配（480 行）、面板生命周期（391 行）、自动填入（221 行）、xterm 显示（126 行）、连接（103 行）。页面数据组装与 HTTP 路由也分责。

对应 allowlist 已移除，边界脚本拒绝重新引入退休的 Registry/内容/Adapter 出口。`src/sessions/compatibility.ts` / `types.ts` 仍服务 MCP/Host 环境识别和类型别名，不承载 Work UI、resume 或 handoff 实现；后续开发者入口/Cutover 处理其剩余 caller。

对应 `wk3-legacy-exit`。

## Checks

- `pnpm workspace:verify`：通过，包括工作区 typecheck/build 和依赖边界。日志 `/private/tmp/molis-work-wk3-final-workspace.log`。
- `CI=true pnpm test`：535 tests，535 pass，0 fail/cancelled/skipped，70.5 秒。日志 `/private/tmp/molis-work-wk3-final-tests.log`。
- 随后仅把已有工作目录补偿恢复实现转入 Work 并调整类型/import，再跑包构建、根 typecheck、`pnpm boundary:check` 和全部 Session/Work/工作目录/终端定向回归：90 tests，90 pass。日志 `/private/tmp/molis-work-wk3-post-cleanup.log`。
- `git diff --check`：通过。
- 既有 Session HTTP/E2E 覆盖创建/发现、native/fallback 内容和恢复、项目隔离、归档、handoff 草稿/投递/失败/重启恢复、隐私和 TUI 记录。工作目录测试核对持久化关系、失败回滚、身份保留及不触碰真实工作文件。
- 既有 Desktop HTTP 覆盖 Goal-bound panel 创建/列表/退出/重开、父 Goal 只读、目录限制、跨项目拒绝、Feed/Onboarding prompt 和控制通道鉴权。
- 新 Work UI 测试实际调用 Workbench/UI Host 注册入口；完整生产浏览器脚本的 resume 点击覆盖成功、unsupported、失败反馈及按钮恢复。
- 新终端测试直接调用生产控制器：认证去重、断线恢复、跨 Goal 迟到响应丢弃、attach 不启动进程、显式 reopen、重连回放；Feed 填入去重/失败保留后重试；Onboarding 等用户启动确认，拒绝来源不匹配消息和父 Goal 启动，填入不发送。

对应 `wk3-result`。

## Limits

证据包含真实本地 HTTP、SQLite 和既有 PTY 进程测试，以及浏览器控制器交互测试。Codex 使用协议替身；控制器使用窄 DOM/WebSocket ports，不冒充真人浏览器操作或真实账号推理。

不扩展未来 Plugin 安装、Team 同步或模型选择。包为 `partial` 表示已有职责真实落地，不表示未来产品能力已实现。全部开发结束后仍按总 spec 第 24 节模拟用户验证前后端，再清理、复测，并审计最初的边界、Huge Class、调用链、分包与开发规范。
