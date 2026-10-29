# 终端进程适配

把本机终端（PTY）进程的启动、接入、写入、缩放、结束统一到公开端口，使产品用例不绑定某个进程实现。Codex 会话适配器与路由已随 Sessions 下线删除。

包名：`@molis-ai/molis-work-service-runtime-host`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

宿主的终端 socket 调 `MolisWorkPtyHost` 管理终端进程；Goal 终端面板和工作区终端经它启动命令。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/adapters/terminal-pty.ts](src/adapters/terminal-pty.ts) | PTY 生命周期 |

可对照现有调用方 [apps/local-host/src/pty-socket.ts](../../apps/local-host/src/pty-socket.ts) 阅读装配方式。

## 接入与边界

Runtime 进程与 Molis Work Session 是不同身份。本包不创建 Goal，也不负责会话关联；原生终端依赖 node-pty 和可用的本机命令。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-service-runtime-host typecheck
pnpm --filter @molis-ai/molis-work-service-runtime-host build
```

已有行为示例与回归：[runtime-host.test.ts](../../tests/runtime-host.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/runtime-host.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：本机终端（PTY）进程的启动、接入、写入、缩放、结束与有限回放。
- 不负责：Goal、Session、工作目录、对话谱系、Artifact。
- 公开入口：`@molis-ai/molis-work-service-runtime-host`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/services/runtime-host`。
- 依赖：`@molis-ai/molis-work-contracts`；第三方依赖见 `package.json`。方向：只依赖合同与同目录适配端口；不决定业务状态（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 终端进程退出后必须清理句柄；`killAll` 结束全部进程；重放缓冲有上限。
  - 一个面板只认它当前的进程：被 `kill` 停掉或重启时换下的旧进程，之后的输出不进重放、不转给面板，退出也不报告。
  - 外部不导入本包 `src/**`；本包也不导入 Web Server 或任何业务 Store。
- 改动后必跑：`node scripts/run-tests.mjs tests/runtime-host.test.ts tests/desktop-tui.test.ts`
- 相关手册：[docs/horizontal/runtime-host.md](../../docs/horizontal/runtime-host.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/horizontal/runtime-host.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
