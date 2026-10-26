# CLI 命令适配

把终端参数转换为 Molis Work 的公开操作，并按 CLI 协议输出结果。维护命令、参数优先级、帮助信息或退出行为时，从这里开始。

包名：`@molis-ai/molis-work-app-cli`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

根 apps/desktop/launchers/cli/main.ts 提供启动环境，Local Host 注入项目与安装操作，dispatchCli 分发命令；项目命令拿到 Host 造的管理调用者（`CliManagementActions`：本机这个人、出处 `management`、一次一个 Goals 动作），调用 Goals 的初始化、快照、当前目标与目标树提案动作。JSON/file 输入解析与错误呈现留在 CLI，状态改变由实际 owner 完成。

所有命令端口（含 `plugin`）的同步抛错与异步拒绝都由 dispatchCli 输出一次现有错误文本并返回 1；成功时保留端口的返回码和输出。

`home snapshot --to <新目录> [--home <原Home>] [--json]` 由 `home` 端口交 Local Host 的离线编排，参数和同 Home 存储所有权在业务初始化前检查，不构造项目 Host；它与项目的 `v1 snapshot --db` 是不同入口。用法、原 key 依赖、恢复边界和失败处理见 [CLI 与开发](../../docs/cli-and-development.md#home-离线快照)。修改此入口加跑 `tests/home-snapshot-cli.test.ts`。

`uninstall --purge-user-data` 在活 App/离线操作占用 Home 时先拒绝，用户显式关闭后再试。成功提示为业务数据与密钥清空，Home 文件夹仍留原互斥锁骨架；不会说整个 Home 已删除。具体保留清单及数据保护见 [Host 开发要求](../local-host/README.md)。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/dispatch.ts](src/dispatch.ts) | dispatchCli：顶层分发与注入端口 |
| [src/command-dispatch.ts](src/command-dispatch.ts) | 项目命令路由：把 JSON 载荷换成一个 Goals 动作的输入 |
| [src/protocol.ts](src/protocol.ts) | 参数和输出协议 |

可对照现有调用方 [apps/local-host/src/cli-host.ts](../local-host/src/cli-host.ts) 阅读装配方式。

## 接入与边界

`molis-work memory recover-home --source-home PATH --target-home PATH --operation-id ID --confirm [--json]` 是明确的停写维护命令。两个绝对路径指向同一 Home、同一历史的工作副本，source 是较新的 T1，target 是已放回原 Home 绝对路径的 T0 工作副本；须先停止写入并另存完整备份。命令不重定位项目路径、不选择默认 Home、不停止服务、不复制备份或切换现役目录。失败后沿原操作号显式重试，不自动换号重放。`--json` 仅控制完成结果输出；失败仍按现 CLI 协议退出非零。

CLI 只解析确认后的纯数据请求并调用注入的恢复窄口，不打开普通 Catalog 或 Runtime。未装配时明确失败；LocalHost 负责取消和原失败资源关闭，Desktop 接入同一 `recoverMemoryHome`，不建立第二个恢复实现。直接回归：`tests/memory-recovery-cli.test.ts`；真实维护链还需 `tests/memory-home-recovery-entry.test.ts` 的隔离非空备份与 Desktop launcher 证据，不能以端口替身代替。

这个包不是数据库入口。新增命令应调用所有者的动作（经 Host 造的管理调用者），避免在命令处理器直接打开 Store、自带 Host 客户端或自己构造身份。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

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
- 依赖：`@molis-ai/molis-work-contracts`。方向：apps → 组合根 → 公开合同（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 不是数据库入口：命令调 Goals 的动作，不在处理器里直接打开 Store；不自己构造调用者（身份与出处由 Host 的 `bindGoalsManagementActions` 定，门禁 `checkGoalTransportCallers`：`command-dispatch.ts` 只引 action 合同、Goals 包的 `{ goalsActions }` 和自己的 `protocol.js`，不论 `import *`、`export … from`、子路径、`import()` 还是 `require()`，也不持有任何 Host 客户端）。
  - JSON 与文件输入的解析、错误呈现留在 CLI；状态变化由实际 owner 完成。
  - 参数优先级、输出格式与退出码按 `src/protocol.ts`，改动同步更新协议测试。
  - 项目命令必须有明确的 `--db PATH`，没有默认路径：不按当前目录猜库，没给（缺值、空白，或后面紧跟另一个 `--` 旗标）就在打开任何东西之前报错。
项目管理命令的 Local Host 接线会只读匹配当前 Home 目录；登记数据库借常驻 Host（`MOLIS_WORK_WEB_URL`）执行，别名使用目录路径。未连接或独立数据库保留进程内执行；明确拒绝、取消、送出后结果未知不回退。`--db`、JSON 与成功 stdout 格式保持。

只有实际进入本地后备时，Home 内（含路径别名）或本 Home 登记的数据库才取得同一 Home owner，并随该 Host 关闭而释放；快照占用期间在 `init` 建目录或打开运行环境前拒绝。外部独立数据库不绑定无关 Home，仍保留原有 `init` 在解码 JSON 前准备父目录的行为。管理入口门禁要求准确的 Home 分类、owner 前置、受限目录准备和原唯一动作端口，不能删掉 guard 或改回无 owner 的后备。

- 改动后必跑：`node scripts/run-tests.mjs tests/cli-protocol.test.ts tests/goal-management-identity.test.ts tests/goal-read-entry.test.ts tests/proposal-entry-chain.test.ts tests/management-door-identity.test.ts tests/cli-goals-actions.test.ts tests/goals-query-boundaries.test.mjs tests/command-entry-chain.test.ts`；Home 本地后备改动另跑 `node scripts/run-tests.mjs tests/cli-home-owner-entry.test.ts`。
- 相关手册：[docs/cli-and-development.md](../../docs/cli-and-development.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/cli-and-development.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/app-host`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-dv1`, `goal-reorg-gw4`, `goal-reorg-ex4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
