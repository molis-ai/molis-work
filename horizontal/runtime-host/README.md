# Runtime 与终端进程适配

把 Runtime 的发现、启动、恢复、内容流、中断和停止统一到公开端口，使产品用例不绑定某个进程协议。

包名：`@molis-ai/molis-work-service-runtime-host`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

RuntimeHostRouter 选择具备所需能力的 Adapter；Codex Session Adapter 通过 app-server transport 交互，MolisWorkPtyHost 管理终端进程。Work Plugin 消费这些端口，把技术结果转成会话体验。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/runtime-router.ts](src/runtime-router.ts) | 能力选择与 Adapter 路由 |
| [src/adapters/codex-session.ts](src/adapters/codex-session.ts) | Codex 会话适配 |
| [src/adapters/codex-app-server.ts](src/adapters/codex-app-server.ts) | app-server 传输 |
| [src/adapters/terminal-pty.ts](src/adapters/terminal-pty.ts) | PTY 生命周期 |

可对照现有调用方 [apps/local-host/src/pty-socket.ts](../../apps/local-host/src/pty-socket.ts) 阅读装配方式。

## 接入与边界

Runtime Session 能力矩阵新增 `message`，Adapter 必须明确声明 native 或 unsupported。Codex 的 message 只向给定现有 threadId 调用 turn/start，收到 turn ID 才报告已接收；无回执或连接故障不能推定安全重发。它不创建 thread，不创建 Handoff 包，也不负责消息持久化或幂等去重；这些归 Work/Private Work Context owner。

Runtime 进程、Molis Work Session 和 Execution Run 是不同身份。Adapter 不创建 Goal/Claim，也不负责 Session 关联；原生终端依赖 node-pty 和可用的本机命令。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-service-runtime-host typecheck
pnpm --filter @molis-ai/molis-work-service-runtime-host build
```

已有行为示例与回归：[runtime-host.test.ts](../../tests/runtime-host.test.ts)。完成上述构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/runtime-host.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 进一步阅读

- [职责与接入说明](../../docs/horizontal/runtime-host.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/services/runtime-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-wk2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
