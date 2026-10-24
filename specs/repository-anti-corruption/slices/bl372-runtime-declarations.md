# BL-372（PG-054 余项）：Coding 与 Characters 不再写死运行时

状态：2026-10-24，`claude/ac-coding-bl372` 上做完第一片，等 PR 位（#1185、#1191 在评审，先不开）与评审；本机没有跑浏览器用例和全量。「项目自选运行时」本身没有做，卡在存储位置（见决定记录）。

## 目标、证据与边界

PG-054 的余项：#844 已让新会话、方法、MCP、委派、整合从运行时目录里选；还剩 Coding 与 Characters 里写死 `"prologue"` 的五处：`start-round.ts`（Character 的工具限制只在 Prologue 上验证过）、`characters-client.ts`、`client.ts`（意图选项按 Prologue 的角色矩阵）、`modules/characters/src/agent-actions.ts`（内置 Agent 的动作目录只认 Prologue）、`apps/local-host/src/characters-host.ts`（向 Prologue 要动作）。

## 决定记录

统筹按用户 10-23 的委托定（10-24）：

1. 项目从平台的运行时目录选运行时。项目设了就用它，没设就用目录的 Home 默认；Coding 与 Characters 里不写死任何运行时的名字。
2. 选定的运行时不可用时拒绝，不换一个（与助理的执行方同一条原则）。
3. 只有一个运行时时界面不出选择器；要试选择，在测试目录里注册一个假的第二运行时，不需要真的第二个。
4. 不新增存储形状：要放项目级设置就用现有的项目设置机制，没设就是默认，存量数据不用维护。做不到就停下来问统筹。

本片的取舍：

- **Home 默认只有一条规则。** `defaultAgentRuntime`（`contracts/services/agent-host`）：目录顺序里第一个能开会话（`session.create` 与 `run.start` 都不是 `unsupported`）的运行时。Coding 的 `projectRuntime` 与 Characters 的动作目录读同一个函数，不再各写一份。
- **「Character 自己声明的运行时」没有做。** Character 的内容和草稿都没有运行时字段，加一个要新列和新的成果内容字段，属于决定 4 的「做不到」；而且 Character 是在已建的会话上逐轮选的，会话的运行时早已定了，Character 的声明改变不了它。所以这一档换成运行时对 Character 的声明：`AgentRuntimeDescriptor.supports_character_limits`（Prologue 的适配器声明 `true`，其余没有），Coding 在开一轮前读会话所在运行时的声明，没有声明就拒绝（`coding.server.character-unverified`，文案不再点 Prologue 的名）。
- **页面从服务端拿事实。** 角色清单的 `limits_verified`（该会话的运行时是否声明）取代客户端的 `runtime_id==='prologue'`；状态里的 `project_runtime_id` 加上会话行本来就有的 `runtime_id`，客户端按「打开的会话的运行时，没有就是项目的运行时」取角色矩阵，不再取 Prologue 的。
- **Characters 的动作目录**取 Home 默认运行时：它不吃动作工具（`supports_action_tools` 不是 `true`）就是空目录，否则向它自己的 id 要动作；`CharactersAgentCatalog.listRuntimes` 返回完整描述，`listActions` 带运行时 id。项目自选落地后，同一个选择也接到这里。
- **没做的（BL-372 剩下的）：** 项目自选本身——存哪、选择界面、选定的运行时不可用时拒绝。待统筹对存储位置的回答：建议一张和 `project_browsing_settings` 并排的 `project_runtime_settings(project_id PRIMARY KEY, runtime_id)`，`CREATE TABLE IF NOT EXISTS` 惰性建，没有行就是默认。

## 验收标准

- **RAC-450**（暂定号段，统筹分配）：Home 默认是目录顺序里第一个能开会话的运行时；都不能就没有。证明：`tests/coding-runtime-declarations.test.ts`。
- **RAC-451**：Characters 的动作目录是 Home 默认运行时的，按它的 id 去要；它不吃动作工具或没有运行时就是空目录，什么也不问。证明：同上。
- **RAC-452**：运行时声明了 `supports_character_limits`，不管叫什么名字，Character 就能在它上面开轮；没声明的拒绝，拒绝发生在会话建出来之前。证明：同上。
- **RAC-453**：状态里 `project_runtime_id` 是 Home 默认；Coding 与 Characters 的源码里没有写死的运行时 id。证明：同上（源码扫描）。

## 对调用方的影响

- 合同 `contracts/services/agent-host`（API 快照已刷新）：`AgentRuntimeDescriptor` 加可选的 `supports_character_limits`；新增 `defaultAgentRuntime`、`hostsAgentSessions`。
- Coding 的 `GET /sessions/:id/characters` 返回 `limits_verified` 取代 `runtime_id`；`GET /state` 多一个 `project_runtime_id`。这两个是 Coding 自己的路由，只有 Coding 自己的页面读。
- `CharactersAgentCatalog`（Characters 模块的端口）：`listRuntimes` 返回完整描述，`listActions(runtimeId)`；唯一的实现在 `apps/local-host/src/characters-host.ts`。
- 不碰存储，存量数据不用维护。

## 验证

本机：全量 `pnpm build`；`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`、`pnpm secrets:check`、翻译门禁；`tests/coding-runtime-declarations.test.ts` 与 29 个直接相关的非浏览器用例（`tests/coding-characters-http.test.ts` 的运行时目录夹具补了 `agent.listRuntimes`，断言没动）。没有跑浏览器用例和全量。
