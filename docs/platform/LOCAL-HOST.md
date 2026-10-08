# Local Host 与 Host Client

## 白话说明

DV1 的 CLI/MCP 项目命令已全部通过 Host Client，不再从 `withProject` 拿 Coordinator 或 availability。`withScope` 只保持打开 Runtime 到响应完成的资源周期，不暴露 Store，也不把整个 callback 放进串行队列；内部具名 invoke 仍按原队列执行。Available+projection、trash+work state、planning methods+composition 分别是一个 Host 组合操作，避免异步迁移拆开原有一致性。初始化、快照、恢复事实、回收站等声明和完整输入输出类型归官方 Goals Plugin；Host 的 `project-capabilities.ts` 只注册原实现。DV1 已通过复核；逐项证据见 `specs/molis-work-architecture-reorganization/dv1-validation.md`。

Goal Tree 提案通过 `createGoalProposalClients` 使用正式 Host Client（只含提交、列出、检查和决定四项）；Draft、Draft resume 与旧提案组已删除。公开 capability 逐项注册到原方法，其中 Goal Tree check 会保存检查记录。App 负责 await 后展示，Host 不复制提案业务规则。

Local Host 是本地产品的“总装配间”。以前 Web、CLI、MCP 各自打开数据库、创建 Store 和 Coordinator；同一个 Project 可能同时出现多份业务运行对象。AP2 把这件事收回到一个地方：入口只描述要连接哪个 Project，再通过 Host Client 调用能力。

这不是新增一个总管所有业务的 Coordinator。Goal、Project、Feed 等规则仍归各自 Module；Host 只负责把实现装起来、复用同一份 Runtime，并在关闭或重启时统一释放资源。

## 当前真实实现

- `packages/contracts/platform/app-host` 定义 versioned Capability、Project reference、Host Client 和状态类型。
- `packages/kernel` 提供 Provider-neutral `CapabilityRegistry`；它只做注册、查找和调用，不保存业务事实。
- `apps/local-host` 按 `storage_key` 发现 Project Runtime。并发连接同一 Project 只调用一次 factory，Capability 调用按 Project 串行，关闭会等待正在使用的 Runtime。
- 装配点：`apps/local-host/src/local-host.ts`（Runtime 发现、串行队列、动作注册与调用）、`project-host.ts`（`MolisWorkLocalHost`：项目 Runtime、系统动作、插件准备、Agent 服务）、`web-composition.ts`（Web 入口的组合）。Store 与 Coordinator 只在这里创建；Web、CLI、MCP 不各自构造。
- Web 的 Feed scheduler 复用 Host 已打开的同一 Store，不再为一个 Project 额外创建第二个 writer。
- Desktop 当前通过它启动的 Web/Workbench 进程使用同一 Host，没有另建业务 Store。

## Client 与兼容端口

正式入口使用 `LocalHostProjectClient.invoke(capability, input)`。AP2 已接通项目 initialize、snapshot 和 Goal create 作为真实 typed Capability 切片，并验证 CLI、MCP 和 Workbench 风格 Client 对同一命令得到同一事实和幂等结果。

尚未迁到独立 Module 的旧调用暂时通过 `MolisWorkLocalHost.withProject` 兼容 composition 端口访问同一 Runtime。它只解决迁移期资源所有权，不是新公共业务 API；EX、WK、AP3、DV1 等 Goal 会逐步用正式 Capability 替换这些调用。

DV1 已将完整 Goal Contract、项目说明和 active-goal 三项入口接到官方 Goals Plugin 的具名 Capability，由 Host 注册并调用原 owner。树决定只在受保护的入口执行：Workbench 的审批表单（`POST /api/goal-tree-proposals/:id/decision`，Web 请求通过来源与控制令牌检查后，由 Host 注入 web 出处，`bindGoalsWebActions`），以及管理入口（CLI `goal-tree-decide` 与 MCP `molis_work_v1_goal_tree_decide`，来源为 management，`managementTreeAuthority`）。两条路径的决定者都固定为本机用户，请求参数里不能带身份或出处，模型 args 不会变成 Session 身份；Runtime 工具不能写入树决定。CLI/MCP 已无 `withProject` caller；Workbench 等剩余消费者另由各自迁移任务负责。

## Single writer 的范围

DV1 的 Runtime 项目入口额外通过 `RuntimeProjectCatalogProvider.withCatalog` 消费有界公开 catalog application。该 scope 覆盖异步结果组合，成功和失败都关闭原 catalog；它不是任意名称的执行总线，也没有创建第二个 Project Store。`RuntimeProjectConnection` 只维护当前进程的连接缓存，Session 身份变化后旧连接失效，继续采用只读 resolve、同幂等 key 重试的恢复规则，不自行写绑定。Panel alias 与原生 Session 关联由 Local Host 单独组合原 Desktop/Registry API，缺 Panel 的原错误由宿主识别，其他错误不隐藏。

AP2 保证一个 Local Host 实例内，每个 Project storage key 只有一份 Store/Coordinator Runtime；多个本地入口可以显式注入并共享这个 Host。Host 关闭后重新创建，事实从 SQLite 恢复。

执行只在常驻 Web 宿主里：一个 Home 只有一个进程持有 Agent 运行锁，stdio MCP 等其他进程经本机动作网关转发（见下文「串行队列与并发声明」）。typed Host Client 本身是进程内实现；没有独立 daemon 或 Unix socket 的自动发现。CLI 独立进程仍通过同一 composition 实现打开 Host，而不是各自复制初始化规则。

## 生命周期与刷新

- 同一 storage key 如果被错误映射为另一个 `project_id`，Host 拒绝连接。
- Capability ID + version 重复注册或未注册调用会给出明确错误。
- 关闭 Project Runtime 会等待当前使用者退出，再关闭 Store。
- 个人规划方法是所有 Project Runtime 的构造输入；保存后由 Web 请求 Host 统一重开已发现的 Project Runtime，避免各入口持有不同版本。

## 串行队列与并发声明

同一项目（以及 Home 级）的非并发调用按顺序执行，保证事务与处置的先后。代价是：处理器里等待模型或外部服务时，这个项目的其他所有操作都在排队；超过 20 秒会打印「已占用项目操作队列 N 秒」。

- 等模型或外部服务、且只按读取时的版本提交（或本地不写状态）的动作，声明 `scheduling: "concurrent"`，在队列旁运行；门禁 `tests/action-model-scheduling.test.ts` 要求声明了 `model:invoke` 的动作都这样做，例外逐条写理由。
- 会挂起等待的能力（跟随一轮 Agent）声明 `operation: "wait"`。
- 调用方不能自称并发：并发与否读的是注册时的描述符。
- 一个 Home 只有一个执行进程持有 Agent 运行锁；其他进程（stdio MCP 等）经动作网关转发给常驻 Web 宿主。

## 源码分区与放置规则

`apps/local-host/src` 按文件名前缀分区，不另建子目录（整体搬迁只改路径不改职责，还会打断大量测试引用）：

| 前缀 / 目录 | 放什么 |
| --- | --- |
| `local-host.ts`、`project-host.ts`、`project-*`、`managed-project-*`、`catalog-*` | Runtime、项目生命周期、项目库与目录 |
| `action-*`、`mcp-*`、`scene-configuration-actions.ts`、`local-owner-permissions.ts` | 统一动作服务的宿主侧：系统动作、授权、调用记录、MCP 网关与目录 |
| `<插件>-actions.ts`、`<插件>-native-plugin-http.ts` | 冻结的旧装配：构建期组合的内置插件（名单冻结、只许减少，以 `tests/builtin-plugin-assembly-gate.test.ts` 为准）在这里注入存储位置、模型、Artifact 发布等端口，路由只转发到动作。**不再新增**：新的内置插件经 Plugin Runtime 装配（`project-plugins.ts` 的监督器条目），HTTP 由 Manifest 声明、挂在 `/api/plugins/<plugin_id>/`，宿主里不再为它写 `<插件>-native-plugin-http.ts` 和 `<插件>-actions.ts`（下一行的舞台渲染和端口文件今天仍要写）。业务规则留在插件包里。迁移计划见 [RUNTIME-MIGRATION.md](../system/RUNTIME-MIGRATION.md) |
| `coding-surface.ts`、`characters-host.ts` | Plugin Runtime 插件在宿主里的工作面渲染和端口（监督器条目在 `project-plugins.ts`，属 `project-*`）。今天仍按插件写，目标是由声明产生，见 [EXTENSION-POINTS.md](../system/EXTENSION-POINTS.md)。Characters 已定并进宿主（[RUNTIME-MIGRATION.md](../system/RUNTIME-MIGRATION.md) 5.4），`characters-host.ts` 里的 Characters 端口随之改写，Coding 用的 `codingCharacterPorts` 留下 |
| `connector-*`、`<服务>-oauth.ts`、`<服务>-connector.ts` | 服务连接、凭据、OAuth 与连接器驱动 |
| `agent-*`、`system-agent-service.ts`、`prologue-inference-host.ts`、`host-complete-text.ts`、`configured-models.ts` | Agent Host 装配、Home 推理绑定、模型选择 |
| `web-*` | Web 入口：请求路由、页面视图投影、设置页 |
| `installer/`、`casebook/`、`plugin-builder/`、`functions-http/` | 自成体系的子系统 |

新文件按上表归入前缀。新插件的业务逻辑和路由在它自己的包里（HTTP 由 Manifest 声明），宿主里不新建 `<插件>-actions.ts`、`<插件>-native-plugin-http.ts`；今天仍要写在宿主和工作台里的接线（监督器条目、舞台渲染、名单）逐项列在 [扩展点清单](../system/EXTENSION-POINTS.md)，目标是由声明产生。

## 验证

```bash
node --import tsx --test --test-concurrency=1 tests/local-host.test.ts
pnpm workspace:check
pnpm boundary:check
pnpm typecheck
pnpm test
```

`tests/local-host.test.ts` 固定并发 discovery、串行 Capability、身份冲突、CLI/MCP/Workbench 多入口、幂等结果、单次打开、重启恢复和旧入口禁止直接构造 Store/Coordinator。
