# WK2 — Runtime Host 与平台 Adapter 验收

日期：2026-09-05。Goal：`goal-reorg-wk2`，Contract revision 1。

完成等级：当前基线功能可用的职责迁移；不是整个架构重组完成，也不是最终人工端到端验收。

## Boundary

- `horizontal/runtime-host` 唯一实现 Runtime router、Codex protocol/transport、PTY process lifecycle，通过 `@molis-ai/molis-work-service-runtime-host` 公开入口提供能力。
- RuntimeHostApi、Adapter、capability/result 和 PTY 输入输出由 `@molis-ai/molis-work-contracts/services/runtime-host` 定义。实现包仅依赖 Contracts 和 node-pty，不持有 Session Registry、Execution Store、Goal 或 Artifact。
- Web Server 初始化 Runtime Host；PTY socket 调公开入口；Session content/directory/handoff 消费 RuntimeHostApi。业务事实更新留在调用者，不由 transport 写 Store。
- `pnpm boundary:check` 通过：48 packages、195 source files、419 imports、61 dependency edges，errors 为空。检查结合实现和实际 caller 审阅，不以行数或声明字段替代职责验收。

对应：`wk2-boundary`。

## Legacy exit

- `src/sessions/adapters.ts` 为 17 行兼容 composition：组装 RuntimeHostRouter 与 Registry fallback，不再实现 Codex provider。
- `src/sessions/codex-transport.ts` 为 6 行公开包重导出；`src/web/pty-host.ts` 为 12 行公开包重导出，无子进程或 PTY 实现。
- 生产 `src/web/server.ts`、`src/web/pty-socket.ts` 直接消费 Runtime Host 公开包；旧 Session Adapter shell 的 caller 主要为现有 Session 测试，PTY shell 尚被 desktop-tui 测试引用。
- Session registry fallback、WebSocket 鉴权和 TUI 内容记录仍由业务调用层负责。WK3 迁移 Work UI/产品编排及其剩余 caller；不把浏览器 PTY client 或 Session Store 塞进 Runtime Host。

对应：`wk2-legacy-exit`。薄出口退出随 WK3 caller 切换处理，不宣称全仓兼容出口已清零。

## Checks

- `CI=true pnpm test`：521 tests，521 pass，0 fail/cancelled/skipped，83.6 秒。日志：本机 `/private/tmp/molis-work-wk2-tests-full.log`。
- `pnpm workspace:verify`：退出码 0，工作区清理与构建通过。日志：本机 `/private/tmp/molis-work-wk2-workspace-full.log`。
- `pnpm exec tsc --noEmit -p tsconfig.json`、`node scripts/verify-release-versions.mjs`、`git diff --check` 通过。
- `tests/runtime-host.test.ts`：fake Provider 注册/能力/unsupported；Codex resume 和真实回调/取消订阅；真实 PTY attach/replay/input；同 panel 异常退出后重启；Ctrl-C；kill/killAll 后通过 OS PID 检查进程退出。
- `tests/codex-transport.test.ts`：真实 Node 子进程模拟 app-server，验证初始化顺序、JSONL 流、订阅取消、初始化超时、异常退出后重新初始化、关闭拒绝 pending work、超大响应保护。
- 原 Session Adapter、resume、handoff 与恢复测试继续覆盖 native/registry fallback 的产品行为。

恢复验证时先复现两项失败：并发首次请求在初始化前发送（ready=false）；初始化超时未清理 child（killed=false）。修复后测试通过。恢复只重新建立连接，不自动重放写请求。

对应：`wk2-result`。

## 验证边界

Codex transport 测试使用真实子进程运行协议替身，不是登录账号后的真实 Codex 推理。PTY 测试使用真实 shell/process。上述证据证明本切片边界和既有行为自动回归，不证明全产品功能无损；全部开发结束后，仍按总 spec 第 24 节模拟用户操作验证前后端，再清理、复测和审计。
