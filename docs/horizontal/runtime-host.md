# Runtime Host

**提供：** 本机终端（PTY）进程的启动、接入、写入、缩放、结束，有限回放与退出清理。

**技术状态：** 进程句柄、回放缓冲和 spawn 参数；不保存业务状态。

**不拥有：** Goal、Session、workspace、conversation lineage 或 Artifact。

**Adapter：** Terminal/PTY 实现放在 `horizontal/runtime-host/src/adapters/`，不建立顶层 adapters package。Codex app-server 会话适配器与 `RuntimeHostRouter` 随 Sessions 插件下线一起删除；Sessions 重做时按新的合同再设计，见 `specs/BACKLOG.md` 的 BL-177。

## 当前实现

- `adapters/terminal-pty.ts` 负责本地命令发现、环境隔离、spawn/attach/write/resize/kill、有限 replay 与退出清理。
- `apps/local-host/src/pty-socket.ts` 负责 WebSocket 鉴权和 UI 消息翻译，经公开入口调用 `MolisWorkPtyHost`。

## 公开调用规则

调用者只依赖 `@molis-ai/molis-work-service-runtime-host` 或 `@molis-ai/molis-work-contracts/services/runtime-host`（`PtySpawnRequest`、`PtySpawnResult`、`PtyHostHandlers`）。禁止导入 `horizontal/runtime-host/src/**`，也禁止 Runtime Host 导入 Web Server 或任何业务 Store。

当前自动化验证见 `tests/runtime-host.test.ts` 与 `tests/desktop-tui.test.ts`。
