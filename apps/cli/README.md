# CLI 命令适配

把终端参数转换为 Molis Work 的公开操作，并按 CLI 协议输出结果。维护命令、参数优先级、帮助信息或退出行为时，从这里开始。

包名：`@molis-ai/molis-work-app-cli`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

根 apps/desktop/launchers/cli/main.ts 提供启动环境，Local Host 注入项目与安装操作，dispatchCli 分发命令；项目命令拿到 Host 造的管理调用者（`CliManagementActions`：本机这个人、出处 `management`、一次一个 Goals 动作），调用 Goals 的初始化、快照、当前目标与目标树提案动作。JSON/file 输入解析与错误呈现留在 CLI，状态改变由实际 owner 完成。

所有命令端口（含 `plugin`）的同步抛错与异步拒绝都由 dispatchCli 输出一次现有错误文本并返回 1；成功时保留端口的返回码和输出。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/dispatch.ts](src/dispatch.ts) | dispatchCli：顶层分发与注入端口 |
| [src/command-dispatch.ts](src/command-dispatch.ts) | 项目命令路由：把 JSON 载荷换成一个 Goals 动作的输入 |
| [src/protocol.ts](src/protocol.ts) | 参数和输出协议 |

可对照现有调用方 [apps/local-host/src/cli-host.ts](../local-host/src/cli-host.ts) 阅读装配方式。

## 接入与边界

这个包不是数据库入口。新增命令应调用所有者的动作（经 Host 造的管理调用者），避免在命令处理器直接打开 Store、自带 Host 客户端或自己构造身份。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-goals`。其他运行依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-app-cli typecheck
pnpm --filter @molis-ai/molis-work-app-cli build
```

已有行为示例与回归：[cli-protocol.test.ts](../../tests/cli-protocol.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/cli-protocol.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：终端参数解析、命令分发与 CLI 输出协议。
- 不负责：业务决定、Module Store、重复的应用规则。
- 公开入口：`@molis-ai/molis-work-app-cli`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/app-host`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-goals`。方向：apps → 组合根 → 公开合同（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 不是数据库入口：命令调 Goals 的动作，不在处理器里直接打开 Store；不自己构造调用者（身份与出处由 Host 的 `bindGoalsManagementActions` 定，门禁 `checkGoalTransportCallers`：`command-dispatch.ts` 只引 action 合同、Goals 包的 `{ goalsActions }` 和自己的 `protocol.js`，不论 `import *`、`export … from`、子路径、`import()` 还是 `require()`，也不持有任何 Host 客户端）。
  - JSON 与文件输入的解析、错误呈现留在 CLI；状态变化由实际 owner 完成。
  - 参数优先级、输出格式与退出码按 `src/protocol.ts`，改动同步更新协议测试。
  - 项目命令必须有明确的 `--db PATH`，没有默认路径：不按当前目录猜库，没给（缺值、空白，或后面紧跟另一个 `--` 旗标）就在打开任何东西之前报错。
项目管理命令的 Local Host 接线会只读匹配当前 Home 目录；登记数据库借常驻 Host（`MOLIS_WORK_WEB_URL`）执行，别名使用目录路径。未连接或独立数据库保留进程内执行；明确拒绝、取消、送出后结果未知不回退。`--db`、JSON 与成功 stdout 格式保持。

- 改动后必跑：`node scripts/run-tests.mjs tests/cli-protocol.test.ts tests/goal-management-identity.test.ts tests/goal-read-entry.test.ts tests/proposal-entry-chain.test.ts tests/management-door-identity.test.ts tests/cli-goals-actions.test.ts tests/goals-query-boundaries.test.mjs tests/command-entry-chain.test.ts`
- 相关手册：[docs/cli-and-development.md](../../docs/cli-and-development.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/cli-and-development.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/app-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-dv1`, `goal-reorg-gw4`, `goal-reorg-ex4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
