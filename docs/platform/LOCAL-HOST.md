# Local Host 与 Host Client

## 白话说明

DV1 的项目命令不再从 `withProject` 拿 Coordinator 或 availability：管理 MCP 通过宿主构造的管理动作端口；命令行（`molis-work v1`）不再经 Host Client 的 typed 能力，由 Host 造一个管理调用者（`apps/local-host/src/goal-callers.ts` 的 `bindGoalsManagementActions`：本机这个人、出处 management、一次一个 Goals 动作），每条命令调 Goals 的一个动作（W3-07 PR-3，链路见 `docs/system/CALL-CHAINS.md` 链 8），所以一条命令在调用记录里只留一行动作记录，不再另有 typed 能力的一行。`withScope` 只保持打开 Runtime 到响应完成的资源周期，不暴露 Store，也不把整个 callback 放进串行队列；内部具名 invoke 仍按原队列执行。Available+projection、trash+work state、planning methods+composition 分别是一个 Host 组合操作，避免异步迁移拆开原有一致性。初始化、快照、恢复事实、回收站等行为归官方 Goals Plugin 的动作实现；公共输入输出合同归 contracts，由 owner 使用。Host 注册动作提供方，不再登记这些 Goals typed 桥。DV1 已通过复核；逐项证据见 `specs/molis-work-architecture-reorganization/dv1-validation.md`。

Goals 的项目初始化、Goal 创建、说明、结构提案与事件决定统一消费 Goals owner 的动作；Coding 的目录、约定、状态、进展与回执按动作 id 和版本调用 Goals 的五个插件动作（Goals 的合同在 `plugins/native/goals/src/contract/`，Coding 就地声明用到的字段，PG-111），原四个 typed 依赖已删除；四项受限读写要求宿主当前运行且声明消费的内置实例，生成插件仍被拒绝。网页与管理 CLI/MCP 从真实调用上下文取得各自权限，不另留管理 typed 桥。管理决定的操作者固定为本机这个人，输入里的身份与出处不授予权力；出处由受保护 Host 调用者构造。插件开发改走隔离 Host 的 `developInPrivateHost`，不登记 typed 开发能力。剩余 typed 家族仍在统一 Host registry 注册，其消费者与退场按防腐线 W3-07-PR-9 核对。

Local Host 是本地产品的“总装配间”。以前 Web、CLI、MCP 各自打开数据库、创建 Store 和 Coordinator；同一个 Project 可能同时出现多份业务运行对象。AP2 把这件事收回到一个地方：入口只描述要连接哪个 Project，再通过 Host Client 调用能力。

这不是新增一个总管所有业务的 Coordinator。Goal、Project、Feed 等规则仍归各自 Module；Host 只负责把实现装起来、复用同一份 Runtime，并在关闭或重启时统一释放资源。

## 当前真实实现

- `packages/contracts/platform/app-host` 定义 versioned Capability、Project reference、Host Client 和状态类型。
- `packages/kernel` 提供 Provider-neutral `CapabilityRegistry`；它只做注册、查找和调用，不保存业务事实。
- `apps/local-host` 按 `storage_key` 发现 Project Runtime。并发连接同一 Project 只调用一次 factory，Capability 调用按 Project 串行，关闭会等待正在使用的 Runtime。
- 装配点：`apps/local-host/src/local-host.ts`（Runtime 发现、串行队列、动作注册与调用）、`project-host.ts`（`MolisWorkLocalHost`：项目 Runtime、系统动作、插件准备、Agent 服务）、`web-composition.ts`（Web 入口的组合）。Store 与 Coordinator 只在这里创建；Web、CLI、MCP 不各自构造。
- Web 的 Feed scheduler 复用 Host 已打开的同一 Store，不再为一个 Project 额外创建第二个 writer。
- Desktop 当前通过它启动的 Web/Workbench 进程使用同一 Host，没有另建业务 Store。

## 动作客户端与宿主内服务

对外业务入口使用 `ActionClient` 调用 owner 的动作。CLI 与管理 MCP 经 `bindGoalsManagementActions` 获取一次调用的可信管理身份；当前 Home 已登记且连接的项目交给常驻宿主，明确拒绝、取消或结果未知时不回退。未连接或未登记项目保留进程内执行。网页从其受保护入口构造本机用户身份。

`MolisWorkLocalHost.withProject` 是宿主装配的私有资源端口，复用同一 Runtime；它不授予业务调用权。`LocalHostProjectClient.invoke` 保留给 Agent、调度与工作区等宿主内服务，不能恢复已退役的 Goals 协议。`tests/typed-registry-inventory.test.ts` 对照完整装配和无工作区装配核对现存 typed 注册；健康门禁继续禁止新增 typed 定义与注册。

完整 Goal Contract、项目说明和 active-goal 使用 Goals 的动作，由 Host 注册其提供方并调用原 owner。树决定只在受保护的入口执行：Workbench 的审批表单（`POST /api/plugins/io.molis.work.goals/goal-tree-proposals/:id/decision`，Web 请求通过来源与控制令牌检查后，入口给 web 出处（消息与确认标记取请求头；项目实例的入口是 `apps/local-host/src/project-plugin-http.ts` 的 `projectRouteControl`，`bindGoalsWebActions` 仍服务页面渲染与项目说明），以及管理入口（CLI `goal-tree-decide`，经管理调用者调 `goals.tree.decide` 动作；与 MCP `molis_work_v1_goal_tree_decide`，来源为 management，`bindGoalsManagementActions`）。两条路径的决定者都固定为本机用户，请求参数里不能带身份或出处，模型 args 不会变成 Session 身份；Runtime 工具不能写入树决定。事件决定（`goals.decisions.record`，管理 MCP `event_decide` 的出口）是同一扇管理入口的另一道决定门，做法一样：`authority` 只收对话出处，决定者由宿主造出（`apps/local-host/src/goal-callers.ts` 的 `goalsManagementContext`，出处由其中的 `managementUserAction` 造出），带身份被拒绝（`goals.event_decision_authority_invalid`）。CLI/MCP 已无 `withProject` caller；Workbench 等剩余消费者另由各自迁移任务负责。

### 现存宿主内服务与生产消费者

| 家族 | 现行生产调用或声明 | 边界 |
| --- | --- | --- |
| Agent `agent.*` | Coding 的 `routes.ts`、`delegation-dispatch.ts`、`background-state.ts`；Coding、创作台、Schedule 的 Manifest 声明；Characters 的宿主提供方 `characters-host.ts`（Characters 不是插件，运行时列表与动作经组合根给的 `charactersCatalog` 端口读，不经动作） | 注册集中在 `horizontal/agent-host/src/capability-registration.ts` 与 Host 的 `agent-host-composition.ts`。全部是只给插件、不要权限的动作（PG-035、R8 第 1～4 批），身份只从调用上下文来，Coding 经 `services.actions` 调；没有 typed 条目了。助理直接消费其 Agent 服务端口，不因此算 typed 客户端。 |
| 项目工作区与设置读取 | Coding、Files、Git 的 Manifest 与路由/动作；创作台 Manifest；`web-project-platform-routes.ts` 的设置消费（项目工作区） | 只有配置工作区端口才登记。这组五项（两项工作区、三项设置）全部有动作元数据，读取和写入都不属于剩余 typed；经旧客户端调用时也是 typed 入口转动作。 |
| Git 审阅准备与结果 | Git Manifest 与 `actions.ts` | 四项现存读/准备服务由 Host 装配，实际 Git 写入仍经审阅。 |
| Writer 目录与集成 | Coding Manifest 与 `routes.ts` | 目录、准备与集成由 Host 给当前项目的原工作区，不接受另选项目的身份。 |

这张表来自当前生产引用与调用点核查；`tests/typed-registry-inventory.test.ts` 再以完整 Host 和无工作区 Host 对照实际登记结果。表中的 Manifest 声明不单独证明运行成功。

## Single writer 的范围

DV1 的 Runtime 项目入口额外通过 `RuntimeProjectCatalogProvider.withCatalog` 消费有界公开 catalog application。该 scope 覆盖异步结果组合，成功和失败都关闭原 catalog；它不是任意名称的执行总线，也没有创建第二个 Project Store。`RuntimeProjectConnection` 只维护当前进程的连接缓存，Session 身份变化后旧连接失效，继续采用只读 resolve、同幂等 key 重试的恢复规则，不自行写绑定。Panel alias 与原生 Session 关联由 Local Host 单独组合原 Desktop/Registry API，缺 Panel 的原错误由宿主识别，其他错误不隐藏。

AP2 保证一个 Local Host 实例内，每个 Project storage key 只有一份 Store/Coordinator Runtime；多个本地入口可以显式注入并共享这个 Host。Host 关闭后重新创建，事实从 SQLite 恢复。

执行只在常驻 Web 宿主里：一个 Home 只有一个进程持有 Agent 运行锁，stdio MCP 等其他进程经本机动作网关转发（见下文「串行队列与并发声明」）。typed Host Client 本身是进程内实现；没有独立 daemon 或 Unix socket 的自动发现。CLI 与管理 MCP 对当前 Home 已登记且连接的项目走受保护常驻管理网关；未连接或未登记时才经同一 composition 在进程内打开 Host。

## 生命周期与刷新

- 同一 storage key 如果被错误映射为另一个 `project_id`，Host 拒绝连接。
- Capability ID + version 重复注册或未注册调用会给出明确错误。
- 关闭 Project Runtime 会等待当前使用者退出，再关闭 Store。
- 个人规划方法是所有 Project Runtime 的构造输入；保存后由 Web 请求 Host 统一重开已发现的 Project Runtime，避免各入口持有不同版本。

## 串行队列与并发声明

同一项目（以及 Home 级）的非并发调用按顺序执行，保证事务与处置的先后。代价是：处理器里等待模型或外部服务时，这个项目的其他所有操作都在排队；超过 20 秒会在 Host 日志里记一条「已占用项目的操作队列」（带动作、项目和秒数，见 `apps/local-host/src/host-log.ts`）。

- 等模型或外部服务、且只按读取时的版本提交（或本地不写状态）的动作，声明 `scheduling: "concurrent"`，在队列旁运行；门禁 `tests/action-model-scheduling.test.ts` 要求声明了 `model:invoke` 的动作都这样做，例外逐条写理由。
- 会挂起等待的能力（跟随一轮 Agent）声明 `operation: "wait"`。
- 并发动作不占队列，它调用的串行动作像别的调用一样排队等轮到自己，不能趁队列被占时插到前面；只有嵌套在已占着队列的调用里的调用，直接在这条队列上运行（排在自己的父调用后面会死锁）。Home 级队列同理。场景运行（判断场景的 `runScene`）是触发它的那次调用的一步，取那次调用的位置：并发动作里等模型的判断不占队列。
- 并发动作等完模型后，先 `beforeEffect()` 再写入，并只按读取时的版本提交；被取消、撤权、停用的调用不再写记录（Coding 开始一轮时等模型写历史摘要，模型写成或失败都先 `beforeEffect()` 再开始这一轮：`writeHistoryDigest`）。
- 并发动作替调用者等判断时，只判断这次调用自己产生的东西，不替别的生产方排空共享的待判断队列，否则会拿这次调用者的身份判断别人的事项（Feed 收取工作流内容用 `FeedApplication.ingestItemJudged`，试跑规则用 `evaluateItems`，入箱用限定条目的 `flushPendingInboxJudgments`）。
- 调用方不能自称并发：并发与否读的是注册时的描述符。
- 一个 Home 只有一个执行进程持有 Agent 运行锁；其他进程（stdio MCP 等）经动作网关转发给常驻 Web 宿主。

## 源码分区与放置规则

`apps/local-host/src` 按文件名前缀分区，不另建子目录（整体搬迁只改路径不改职责，还会打断大量测试引用）：

| 前缀 / 目录 | 放什么 |
| --- | --- |
| `local-host.ts`、`project-host.ts`、`project-*`、`managed-project-*`、`catalog-*` | Runtime、项目生命周期、项目库与目录 |
| `action-*`、`mcp-*`、`scene-configuration-actions.ts`、`local-owner-permissions.ts` | 统一动作服务的宿主侧：系统动作、授权、调用记录、MCP 网关与目录 |
| `<插件>-actions.ts`、`<插件>-native-plugin-http.ts` | 冻结的旧装配：构建期组合的内置插件（名单冻结、只许减少，以 `tests/builtin-plugin-assembly-gate.test.ts` 为准）在这里注入存储位置、模型、Artifact 发布等端口，路由只转发到动作。**不再新增**：新的内置插件经 Plugin Runtime 装配（`project-plugins.ts` 的监督器条目），HTTP 由 Manifest 声明、挂在 `/api/plugins/<plugin_id>/`，宿主里不再为它写 `<插件>-native-plugin-http.ts` 和 `<插件>-actions.ts`（下一行的舞台渲染和端口文件今天仍要写）。业务规则留在插件包里。迁移计划见 [RUNTIME-MIGRATION.md](../system/RUNTIME-MIGRATION.md) |
| `project-plugin-stages.ts` | 项目页上运行中的插件的舞台：按 Manifest 声明从运行中的实例画（W5-06），Manifest 的 `ui.embedded_plugins` 里的插件按槽（`descriptor.slots`）填进父页（PG-036 C9：Coding 的目录与阅读器里的 Files、Git）；不认识任何插件。`coding-surface.ts` 已删 |
| `characters-host.ts`、`characters-http.ts` | Characters 不是插件（CHR-1，2026-10-22，[RUNTIME-MIGRATION.md](../system/RUNTIME-MIGRATION.md) 5.4），宿主自己提供它：`characters-host.ts` 为每个项目注册 Characters 的动作提供方（`charactersActionProvider`），开一轮时冻结某个版本的 `freezeProjectCharacter` 也在这里；`characters-http.ts` 的 `handleCharactersHttp` 是页面的 14 个地址（`/api/plugins/io.molis.work.characters/…`）的门，由 `web-request.ts` 转来，每个地址按本人身份调用一个 Characters 动作 |
| `connector-*`、`<服务>-oauth.ts`、`<服务>-connector.ts` | 服务连接、凭据、OAuth 与连接器驱动 |
| `agent-*`、`system-agent-service.ts`、`prologue-inference-host.ts`、`host-complete-text.ts`、`configured-models.ts` | Agent Host 装配、Home 推理绑定、模型选择 |
| `web-*` | Web 入口：请求路由、页面视图投影、设置页 |
| `installer/`、`plugin-builder/`、`functions-http/` | 自成体系的子系统 |

新文件按上表归入前缀。新插件的业务逻辑和路由在它自己的包里（HTTP 由 Manifest 声明），宿主里不新建 `<插件>-actions.ts`、`<插件>-native-plugin-http.ts`；今天仍要写在宿主和工作台里的接线（监督器条目、舞台渲染、名单）逐项列在 [扩展点清单](../system/EXTENSION-POINTS.md)，目标是由声明产生。

## 验证

```bash
node scripts/run-tests.mjs tests/local-host.test.ts
pnpm workspace:check
pnpm boundary:check
pnpm typecheck
pnpm test
```

`tests/local-host.test.ts` 固定并发 discovery、串行 Capability、身份冲突、CLI/MCP/Workbench 多入口、幂等结果、单次打开、重启恢复和旧入口禁止直接构造 Store/Coordinator。
