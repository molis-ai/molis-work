# Runtime Host

**提供：** Runtime Provider 注册和能力发现；start/resume/send input/stream/interrupt/cancel/stop；deadline、resource lease、crash recovery 和技术 Receipt。

**技术状态：** process/connection handle、invocation handle、stream cursor、buffer、provider health 和资源租约。

**不拥有：** Claim、Run、Goal、Session、workspace、conversation lineage 或 Artifact。Execution/Private Work Context 收到 Receipt 后才更新正式业务状态。

**Adapter：** Local process、Terminal/PTy、Codex app-server、Remote Agent 等实现就近放在 `horizontal/runtime-host/adapters/`，不建立顶层 adapters package。

## WK2 当前实现

- `RuntimeHostRouter` 注册 Provider Adapter、校验完整 capability、提供统一调用和能力矩阵；未知 Provider 返回明确的 unsupported，不伪造成功。
- `adapters/codex-app-server.ts` 负责 app-server 子进程、JSONL 请求、事件、超时、超大响应保护、崩溃后重新启动和关闭清理；`adapters/codex-session.ts` 只做 Codex capability 翻译。
- `adapters/terminal-pty.ts` 负责本地命令发现、环境隔离、spawn/attach/write/resize/kill、有限 replay 与退出清理。
- 并发首次请求等待同一个初始化完成；初始化超时会终止该子进程，下次请求重新初始化。关闭 transport 会拒绝待处理请求并清除订阅；崩溃恢复不会自动重放先前的写操作。
- `src/web/pty-socket.ts` 仍负责 WebSocket 鉴权和 UI 消息翻译；Private Work Context 的 registry fallback 仍留在 Session 兼容编排，因为二者都会触碰业务事实。

## 公开调用规则

调用者只依赖 `@molis-ai/molis-work-service-runtime-host` 或 `@molis-ai/molis-work-contracts/services/runtime-host`。禁止导入 `horizontal/runtime-host/src/**`，也禁止 Runtime Host 导入 Session Registry、Execution Store 或 Web Server。

**迁移 Goal：** WK2 已迁 Runtime router、Codex transport/Adapter 和 PTY server host；WK3 继续迁 Work UI 与产品编排。PTY browser client 属于 Work Plugin 的 UI transport，不在 WK2 假装迁完。

当前自动化验证与剩余边界见 [WK2 验收记录](../../specs/molis-work-architecture-reorganization/wk2-validation.md)。
