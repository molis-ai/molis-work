# BL-372（PG-054 余项）：Coding 与 Characters 不再写死运行时

状态：2026-10-24，`claude/ac-coding-bl372` 上两部分都做完（运行时声明；项目自选运行时），等 PR 位（#1185、#1191 在评审，先不开）与评审；本机没有跑浏览器用例和全量。真实 Home 不用维护（惰性建表，没有行就是默认）。

## 目标、证据与边界

PG-054 的余项：#844 已让新会话、方法、MCP、委派、整合从运行时目录里选；还剩 Coding 与 Characters 里写死 `"prologue"` 的五处：`start-round.ts`（Character 的工具限制只在 Prologue 上验证过）、`characters-client.ts`、`client.ts`（意图选项按 Prologue 的角色矩阵）、`modules/characters/src/agent-actions.ts`（内置 Agent 的动作目录只认 Prologue）、`apps/local-host/src/characters-host.ts`（向 Prologue 要动作）。

## 决定记录

统筹按用户 10-23 的委托定（10-24）：

1. 项目从平台的运行时目录选运行时。项目设了就用它，没设就用目录的 Home 默认；Coding 与 Characters 里不写死任何运行时的名字。
2. 选定的运行时不可用时拒绝，不换一个（与助理的执行方同一条原则）。
3. 只有一个运行时时界面不出选择器；要试选择，在测试目录里注册一个假的第二运行时，不需要真的第二个。
4. 不新增存储形状：要放项目级设置就用现有的项目设置机制，没设就是默认，存量数据不用维护。做不到就停下来问统筹。
5. 统筹对存储的回答（10-24）：新表 `project_runtime_settings(project_id PRIMARY KEY, runtime_id)`，放 `apps/local-host` 里与 `project_browsing_settings` 并排，`CREATE TABLE IF NOT EXISTS`，没有行就是 Home 默认，不做维护。限制：只有 local-host 读写这张表，Coding 与 Characters 经导出的函数或动作取（不写 SQL）；删除项目时行跟着走（`ProjectDeletionService` 删项目库文件，断言在 `tests/project-deletion-service.test.ts`）；库结构是合同，PR 写明影响；不用 Coding 的插件存储。解析顺序：项目的选择，然后 Home 默认，没有「Character 声明的运行时」一档；检查看运行时的描述，不看名字。选定的运行时不可用：拒绝并指向项目设置，不悄悄换；设置页在有一个以上运行时、或已选的不可用时出选择器。

本片的取舍：

- **Home 默认只有一条规则。** `defaultAgentRuntime`（`contracts/services/agent-host`）：目录顺序里第一个能开会话（`session.create` 与 `run.start` 都不是 `unsupported`）的运行时。Coding 的 `projectRuntime` 与 Characters 的动作目录读同一个函数，不再各写一份。
- **「Character 自己声明的运行时」没有做。** Character 的内容和草稿都没有运行时字段，加一个要新列和新的成果内容字段，属于决定 4 的「做不到」；而且 Character 是在已建的会话上逐轮选的，会话的运行时早已定了，Character 的声明改变不了它。所以这一档换成运行时对 Character 的声明：`AgentRuntimeDescriptor.supports_character_limits`（Prologue 的适配器声明 `true`，其余没有），Coding 在开一轮前读会话所在运行时的声明，没有声明就拒绝（`coding.server.character-unverified`，文案不再点 Prologue 的名）。
- **页面从服务端拿事实。** 角色清单的 `limits_verified`（该会话的运行时是否声明）取代客户端的 `runtime_id==='prologue'`；状态里的 `project_runtime_id` 加上会话行本来就有的 `runtime_id`，客户端按「打开的会话的运行时，没有就是项目的运行时」取角色矩阵，不再取 Prologue 的。
- **Characters 的动作目录**取项目的运行时（选择，否则 Home 默认）：它不吃动作工具（`supports_action_tools` 不是 `true`）就是空目录，否则向它自己的 id 要动作；`CharactersAgentCatalog.listRuntimes` 返回完整描述，`listActions` 带运行时 id，`pickedRuntime` 给项目的选择。
- **项目自选。** 新的两个动作在 `projectSettingsCapabilities`：`runtime`（读，`string | null`，Manifest `consumes` 声明，Coding 声明了）与 `selectRuntime`（写，本机用户 + `projects:settings`，`null` 恢复默认），由 `project-capabilities.ts` 为每个项目注册，不依赖宿主是否知道目录。表由 `ProjectRuntimeSettings`（`apps/local-host/src/project-runtime-settings.ts`）读写：第一次选择才建表（读先看 `sqlite_master`，没选过的项目库一个字节也不动），不进项目库基线、不升基线版本。解析是 `resolveProjectRuntime(目录, 选择)`（合同里一处）；Coding 经 `runtimeDirectory(api)` 取目录加选择，新会话、方法与 MCP 的读写、执行方的 `state` 都按它解析，选定的运行时不在目录里或开不了会话时，`coding.runtime_unavailable`（503）带「项目选定的运行时「X」现在不可用，请在项目设置里改选，或恢复为默认运行时」，不建会话；Characters 的动作目录用 `CharactersAgentCatalog.pickedRuntime()`（宿主端口，读同一张表），选定的不可用就是空目录，不换一个运行时的动作顶替。已建的会话仍按它建时的 `runtime_id` 跑，选择只管之后新建的。设置页：「项目设置 → 常规」多一行，由 `GET/POST /projects/<id>/api/project-settings/runtime`（只转形，调同一对动作）填，有一个以上能开会话的运行时、或已选的不可用时才出现（不可用时下拉里保留那一项，标「（不可用）」，可以改选或回到默认）。

## 验收标准

- **RAC-450**（暂定号段，统筹分配）：Home 默认是目录顺序里第一个能开会话的运行时；都不能就没有。证明：`tests/coding-runtime-declarations.test.ts`。
- **RAC-451**：Characters 的动作目录是 Home 默认运行时的，按它的 id 去要；它不吃动作工具或没有运行时就是空目录，什么也不问。证明：同上。
- **RAC-452**：运行时声明了 `supports_character_limits`，不管叫什么名字，Character 就能在它上面开轮；没声明的拒绝，拒绝发生在会话建出来之前。证明：同上。
- **RAC-453**：没有选择时，状态里 `project_runtime_id` 是 Home 默认；Coding 与 Characters 的源码里没有写死的运行时 id。证明：同上（源码扫描）。
- **RAC-454**：运行时选择是本人的项目设置：Coding 按 Manifest 声明读到，没声明的插件读不到，插件不能改；没选过的项目库没有这张表（读不建表），选了才建；另一个项目看不到；`null` 恢复默认。证明：`tests/current-project-settings.test.ts`。
- **RAC-455**：用一个假的第二运行时：项目选了它，新会话跑在它上面；它从目录里消失后，新会话与项目的 MCP 设置被拒绝（503），错误点名并指向项目设置，没有留下会话，也没有换另一个运行时；改回默认后恢复。证明：`tests/coding-runtime-declarations.test.ts`。
- **RAC-456**：Characters 的动作目录跟着项目的选择，选定的不可用就是空目录，没有向别的运行时要动作。证明：同上。
- **RAC-457**：设置页的路由（`/api/project-settings/runtime`）列出能开会话的运行时与当前选择；已选的不在目录里就报问题并点名，改回 `null` 后问题消失；不是运行时标识也不是 `null` 的输入被拒绝（400）。证明：`tests/workspace-project-actions.test.ts`。
- 删除项目带走选择：`tests/project-deletion-service.test.ts` 在删除前往项目库写一行，删除后项目库文件已不在。

## 对调用方的影响

- 合同 `contracts/services/agent-host`（API 快照已刷新）：`AgentRuntimeDescriptor` 加可选的 `supports_character_limits`；新增 `defaultAgentRuntime`、`hostsAgentSessions`。
- Coding 的 `GET /sessions/:id/characters` 返回 `limits_verified` 取代 `runtime_id`；`GET /state` 多一个 `project_runtime_id`。这两个是 Coding 自己的路由，只有 Coding 自己的页面读。
- `CharactersAgentCatalog`（Characters 模块的端口）：`listRuntimes` 返回完整描述，`listActions(runtimeId)`；唯一的实现在 `apps/local-host/src/characters-host.ts`。
- 合同 `contracts/modules/projects`（API 快照已刷新）：`projectSettingsCapabilities` 加 `runtime`、`selectRuntime`；`contracts/services/agent-host` 加 `resolveProjectRuntime`、`ProjectRuntimeResolution`。动作合同快照多两行（`projects.settings.runtime.read.v1`、`projects.settings.runtime.select.v1`，提供方都是平台，v1 新增，没有改已有动作）。
- 库结构（合同）：每个项目库在第一次选择时多一张表 `project_runtime_settings(project_id, runtime_id)`；基线版本不变，存量库不用维护，旧代码不读这张表。
- Coding 的 Manifest `capabilities.consumes` 加 `projects.settings.runtime.read.v1`；`CharactersAgentCatalog` 加 `pickedRuntime()`（唯一实现在 `apps/local-host/src/characters-host.ts`）。
- 页面：`GET/POST /projects/<id>/api/project-settings/runtime` 是新的受保护 Host UI 路由；工作台脚本 +1047 字节，已按先例一次性放行（`scripts/gates/page-assets.mjs`）。

## 验证

本机：全量 `pnpm build`；`pnpm actions:update`、`pnpm api:update`（快照已刷新）；`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`、`pnpm secrets:check`、`node scripts/gates/page-assets.mjs --base origin/main`（工作台脚本涨 1047 字节，一次性放行）、翻译门禁（在健康检查里）；`tests/current-project-settings.test.ts`、`tests/coding-runtime-declarations.test.ts`、`tests/workspace-project-actions.test.ts`、`tests/project-deletion-service.test.ts`、`tests/typed-registry-inventory.test.ts`、`tests/host-action-registration.test.ts`、`tests/web-route-table.test.ts` 和 Coding 的几个直接相关用例（`coding-state-coalesce`、`coding-session-effect-control`、`coding-message-wait`、`coding-queued-round`、`coding-characters-http`；这几个测试的运行时目录夹具补了「项目没有选择」的回答，断言没动）。没有跑浏览器用例（设置页选择器的显示/隐藏、改选后的刷新）和全量。
