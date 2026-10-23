# R8：agent 宿主的 typed 能力分批改登记成动作（PG-035、BL-364、BL-365）

状态：第 1 批评审修复已完成本地验证（2026-10-23，防腐线 ac-kernel 片，Codex 接续修复），第 2 批（§8）已实现、在评审；验收 RAC-188～190、RAC-197 的定向回归通过，共享核心全量与浏览器验证留统一集成窗口，未宣称整线完成。

## 1. 目标

- **BL-364 第 1 批**：`agentHostCapabilities` 里 37 条 typed 宿主能力，先转其中 7 条，按 PG-035 的写法（`specs/repository-anti-corruption/privileges.md` PG-035 行；设计短稿在协调分支 `coordination/2026-10-14/notes/pg035-typed-to-action-design.md` 第 Q2 节）。
- **BL-365**：scheduler 的 4 条 typed 能力 #1018 已删（`schedule.register/cancel/setEnabled/list`，插件现经 `services.scheduler`），这一片只删掉还写着它们的待办行和三处文档。

## 2. 这一批选哪几条

选「只有 Coding 用、不要权限、输入里不读身份」的 7 条，转了不用新定信任边界：

| 描述符 | id | 种类 |
| --- | --- | --- |
| `readMessages` | `agent.messages.read.v1` | 查询 |
| `prioritizeSession` | `agent.messages.prioritize.v1` | 命令 |
| `sendPeopleMessage` | `agent.messages.send.v1` | 命令 |
| `actOnPeopleMessage` | `agent.messages.act.v1` | 命令 |
| `cancelMessage` | `agent.messages.cancel.v1` | 命令 |
| `readBackground` | `agent.background.read.v1` | 查询 |
| `stopBackground` | `agent.background.stop.v1` | 命令 |

留到后面的批：

- `listRuntimes`、`listActions`：Characters 的宿主提供方以 `user` 受众调它们，改成只给插件就会拒掉它，先要统筹定谁能调。
- `listActions`、`availableRoles`、`pluginFor` 从输入读 `pluginId` 的那一支：转的时候删掉，身份改从调用者取，单独一批。
- 两个 `wait`（`awaitContinuations`、`waitRun`）：动作只有 query / command，先定等待怎样表达。
- 其余读会话、跑轮次的 20 余条：调用点多（Coding 十几个文件），按主人再分批。

## 3. 写法

1. **描述符**（`packages/contracts/src/services/agent-host.ts`）：类型从 `HostCapabilityDefinition` 换成 `ActionDefinition`，带 `action` 元数据。id 与版本不变（「改形态不改名」），输入仍是原来的元组。
   - 谁能调：`scope: "project"`、`audiences: ["plugin"]`、`permissions: []`、`subject_kinds: []`——只有 Manifest `capabilities.consumes` 列了它的插件经自己的动作客户端调得到，人、Agent、工作流、MCP 看不到也调不了。
   - 输入的 schema（draft-07 元组：`items: [...]` 加 `additionalItems: false`）：Runtime id 1～200 字，会话、信、命令的 id 1～500 字；一封信的字段照 `AgentPeopleMessageInput` 列全、不收别的字段，正文 1～1,000,000 字，`kind` 只收 `request`、`reply`，附件至多 50 件；处理一封信的步骤只收六个，`detail` 只收 `event`（≤200 字）、`note`（≤100,000 字）、附件。处理器里原有的检查留作纵深。
   - 输出：按 `AgentSessionMessage` 和 `AgentBackgroundTask` 的真实映射约束读取列表、发送和处理结果，包含附件、历史和可选字段；不套输入长度上限。`prioritizeSession`、`stopBackground` 保留现有输出 schema，`cancelMessage` 仍返回 void、不改成 null。
2. **登记**：不改。`apps/local-host/src/agent-host-composition.ts` 的适配器已经按定义上有没有 `action` 分到 `registerAction`，`horizontal/agent-host/src/capability-registration.ts` 的处理器原样复用。
3. **调用方**：Coding 从 `services.capabilities.invoke` 换成 `services.actions.invoke(definition, input)`（`background-state.ts`、`delegation-dispatch.ts`、`routes-delegations.ts`、`routes-timeline.ts`、`routes-sessions.ts`、`session-observation.ts`、`start-round.ts`、`wake-loop.ts`）。Manifest 的 consumes 不变（已是 `Object.values(agentHostCapabilities)`）。受控动作客户端合并请求/作业与调用点自己的 signal，先调用点自己的 beforeEffect 再原 beforeWrite，同步检查也两边保留；透传其他 control 与 transport。委派所有读写、timeline 的信和后台命令、priority、startDelegation、失败发送后的读、后台观察和 wake cancel 均携带各自已有的 beforeWrite；后台观察用作业控制。wake cancel 的 beforeWrite 改必传，api 当时仍用于 releaseProjectRound（第 2 批把它也转成动作后删掉，见 §8）。
4. **测试夹具**：`tests/fixtures/plugin-actions.ts` 加 `fakeAgentHostActions`，把这 7 条动作交给测试原有的 agent 宿主假实现应答，五个 Coding 测试改用它。真实 SDK 集成夹具 `tests/fixtures/coding-sdk-runtime.ts` 则直接共用 LocalHost 的动作登记和调用服务：原夹具把正式动作登记到 LocalHost，却让插件借用另一份只有 knowledge 的目录；修正这处测试接线，真实路由验证经过 LocalHost 的调用上下文与 action handler。

## 4. 验收

- **RAC-188** 这 7 条是只给插件、不要权限的项目动作；消费它的插件经自己的动作客户端调得到每一条，处理器在宿主启动它的那个项目里运行。
- **RAC-189** 没有消费它的插件调不到（`actions.forbidden`）；人、Agent、工作流、MCP 都看不到也调不了；被拒的调用到不了 Runtime。非动作写入路由的请求在入口检查后撤销时，正式动作在后续副作用前拒绝，Runtime cancel/stop 零调用；正常请求可完成，取消信号也保留。
- **RAC-190** schema 拒绝的输入（空或超长的 id、元组多一项或少一项、信里多出的字段、空正文、只有 Runtime 发的 `kind`、51 件附件、没有的步骤、超长的说明、步骤不收的字段）是 `actions.input_invalid`，到不了 Runtime；上限本身（50 件附件、100,000 字说明）收下。Runtime 返回不符合 message/background 输出合同的结果时，由真实动作派发拒绝：查询是 `actions.output_invalid`，已执行的发送/处理命令是 `actions.output_invalid_after_effect`，保留不可盲目重试的错误语义；合法可选输出和超出输入限制的已存正文仍可读。

## 5. 门禁与合同

- typed 能力的计数：`packages/contracts/src/services/agent-host.ts` 的 `#type-refs` 少 7。
- 公开 API 快照（`tooling/gates/api/contracts/services/agent-host.txt`）与动作快照（`tooling/gates/actions/`）随这一片刷新：多 7 个只给插件的动作，调用方只有 Coding。
- 对调用方的影响：只有 Coding；它的 Manifest 不变。外部插件若经 `services.capabilities` 调这 7 条，要换成 `services.actions.invoke` 并在 Manifest consumes 里列出（现在没有外部插件调它们）。


## 6. 评审范围与后续边界

- 本次认领修复：恢复原 typed 请求/作业控制（挡合并 1），准确输出合同（建议 2），删除真实无用参数而保留仍使用的 api（建议 3）。不新增授权模型，不修改总 spec 或 privileges。
- 建议 1：同项目消费插件可操作其他插件的会话、信和后台任务，是原 typed 路径已有的归属缺口；主会话已交统筹 stage43 分配 BL 和 owner，目前待回复，本片不自取编号或改变该信任设计。
- 调度结论：保留默认串行。`prologue-node-port.ts` 的 priority 最多向 5 个活动会话调用 steer；已安装 SDK 的 control 只排队并等本地 prompt 回执持久化，不等模型消费或回复。background stop 经 `prologue-waits.ts` 到 SDK 的 background.stop，再到 NodeHost.cancelCommand，对进程组发 SIGKILL 后返回，不等待进程退出或外部服务。没有长等待需要新增 concurrent。
- 已核 main `c68071cdc` 仍将这 7 条登记为 typed；正式动作及其输出 schema 首次在本 PR 声明，保留 version 1，并随实际构建更新 API/动作快照。
- 定向验证：原 5 个 Coding 文件、`tests/agent-host-actions.test.ts` 和真实路由控制拒绝用例，jobs 2；构建、API/动作快照、boundary、health、页面资源、secrets、affected。共享核心 full-suite 留下一统一集成窗口，不启动全量或浏览器批。

## 7. 本地验证记录（2026-10-23）

- 固定集成基线 main `c68071cdc`；整体 `pnpm build`、boundary、health（`--base origin/main`，merge-base 仍为该提交）、页面资源门禁通过。页面仍 27 个资源、7,811,882 字节，无新增或放宽。
- 定向 13 文件、57 用例通过（jobs 2）：agent-host-actions、coding-session-effect-control、原 5 个 Coding 文件，以及 SDK 夹具 7 个直接读者的去重集合。独立只读复核未发现 Blocker/P1。
- 首轮发现并修正 3 处测试问题：新命令输出拒绝断言应为 `actions.output_invalid_after_effect`；state-coalesce 的假消息漏两个必填标题；真实 SDK 夹具接入 LocalHost 后还须组合其公开同步动作客户端。生产控制、输出合同和原成功/拒绝断言未放宽；失败文件定向复跑通过。
- API 刷新无新增变化；动作快照仅 readMessages/sendPeopleMessage/actOnPeopleMessage/readBackground 的四个输出哈希变化。7 条描述符迁移使 typed 类型引用和无 action 登记各少 7，更新本地快查；不修改门禁规则。
- affected 对整条 PR 与 main 的差异命中 shared-core 全量要求。主会话安排统一集成，当前未跑全量、README 的其他非直接用例和浏览器用例；真实安装与一骏验收不在本片证据内。

## 8. 第 2 批：项目里的工作与会话状态（RAC-197）

叠在第 1 批上，写法同 §3（描述符换 `ActionDefinition`、只给插件、登记不改、Coding 改走 `services.actions`）。选的 4 条同样只有 Coding 用、不要权限、输入里不读身份：

| 描述符 | id | 种类 | Coding 调用点 |
| --- | --- | --- | --- |
| `readSessionStatuses` | `agent.sessions.status.v1` | 查询 | `session-observation.ts`（目录与后台观察） |
| `readProjectWork` | `agent.project-work.read.v1` | 查询 | `routes-sessions.ts` 的 `overlapsFor`（发送前与「等它完成后再开始」） |
| `queueProjectRound` | `agent.project-work.queue.v1`（版本 2 不变） | 命令 | `routes-sessions.ts` 的 `coding.start-run` |
| `releaseProjectRound` | `agent.project-work.release.v1` | 命令 | `wake-loop.ts` 的 `cancel` |

- **输入 schema**：Runtime id 与 §3 相同；会话列表至多 1000 条、每条 1～500 字（处理器原有的同一检查留作纵深）；探查的 `directory` 1～4096 字、`text` 至多 1,000,000 字；排队的 `session` 只收 `session_id`、`runtime_id`，`task` 1～1,000,000 字，`title` 至多 2000 字，不收别的字段（`actor_id` 之类带不进来，排给谁仍由处理器从调用者取）；放下的说明至多 2000 字。
- **输出 schema**：按 `AgentProjectWork`、`AgentProjectWorkOverlap`、`AgentSessionStatus` 列全字段；会话状态是「状态」与「这条读不了、带原因」二选一（`oneOf`），阶段只收 `AgentRunPhase` 的取值或 `null`。
- **调用方**：四处都用调用点已有的 `beforeWrite` 包一层 `codingActions`（读也一样，取消信号与作业控制随之传下）；`overlapsFor` 与 `coding.scope-check` 因此多传 `beforeWrite`。转完以后 `readCodingSessions` 与 `wake-loop` 的 `cancel` 不再用 typed 客户端，删掉这个参数（第 1 批 §3 说「api 仍用于 releaseProjectRound」，现在不再用）。
- **测试**：`tests/agent-host-actions.test.ts` 的 RAC-197；三个 Coding 测试（`coding-queued-round`、`coding-message-wait`、`coding-state-coalesce`）已经经 `fakeAgentHostActions` 应答全部带 `action` 的描述符，不用改。

**RAC-197** 这 4 条是只给插件、不要权限的项目动作，在宿主启动插件的那个项目里运行：放下与探查交给 Runtime 的项目来自调用；另一个项目的会话，状态单独回「当前项目找不到这条会话」，排队被拒（`agent.session_unknown`），Runtime 没有被要求排队；自己项目的会话排给插件自己的 actor。没有消费它的插件、人、Agent、工作流、MCP 调不到；schema 拒绝空会话 id、排队里多出的 `actor_id`、少一项的元组，被拒的调用到不了 Runtime。

没改的：第 1 批 §6 建议 1 的归属缺口在这 4 条里同样存在——`readProjectWork` 本来就读整个项目的工作，`releaseProjectRound` 只按工作 id 放下，不核这项工作是不是调用插件的会话的；`readSessionStatuses` 与 `queueProjectRound` 核会话归属。这是原 typed 路径已有的行为，仍等统筹给的 BL 与 owner，本片不改信任设计。剩 26 条：`listActions`、`listRuntimes`、`availableRoles`（谁能调、`pluginId` 从输入读）、两个 `wait`、`listSkills` 等 7 条从输入读 `pluginId` 的、`cancelSubagent`（`actorId` 从输入读）、`listReviews`（`projectId` 从输入读），以及读会话、跑轮次的其余各条。

## 9. 第 3 批：读会话、跑轮次（计划，待统筹在这里裁定 §9.3）

统筹 10-23 定了剩下 26 条的五条规矩，这一批按它们做：
1. 身份（调用者、项目、安装）一律从调用上下文取，输入里的不当身份。
2. 等待声明 `scheduling: "concurrent"`，带上限、可取消、写前 `beforeEffect`。
3. 列表读只给调用者看得见的。
4. 取消只许取消自己发起的。
5. 先做读会话、跑轮次这一组。

PR 等 #1121 合入再开，不开第三层。

### 9.1 范围（13 条）与归到哪条规矩

| 描述符 | 输入里的身份 | 规矩 | 改法 |
| --- | --- | --- | --- |
| `createSession` | `AgentCreateSessionInput` 带 `project_id`、`plugin_id`、`install_id`、`actor_id`，处理器 `assertInputOwner` 比对 | 1 | 动作输入去掉这四个字段，处理器只从调用者取；Coding 三处调用（`routes-sessions.ts`、`start-round.ts`、`routes-delegations.ts`）不再拼 `identity` |
| `startRun` | `AgentStartRequest` 同样带四个字段 | 1 | 同上；处理器原来「请求与会话归属一致」的检查改成「会话归属与调用者一致」，`start-round.ts` 一处 |
| `readSession`、`readRun`、`readRunReviews`、`listSubagents`、`readCommandOutput`、`inspectRecovery`、`listCheckpoints` | 只有会话、轮次引用 | 照 §3 | 处理器已经按项目与调用者核会话归属（`readScopedSession`、`requireRun`） |
| `controlRun`、`recoverRun`、`prepareRewind` | 只有会话、轮次引用 | 照 §3 | 命令，处理器已有 `beforeEffect` 与归属检查 |
| `cancelSubagent` | 输入第 4 项 `actorId` | 1、4 | 去掉 `actorId`；取消的人从调用者取；只许取消调用者自己会话里发起的子任务（`requireRun` 已核会话归属），补拒绝用例 |

`waitRun` 属规矩 2，不在这一批：先定成一条 `concurrent` 的动作，还是拆成「开始等」加「查结果」，单独一批。

### 9.2 每条要补的拒绝用例

- 另一个项目的会话或轮次：拒绝，Runtime 没被调用。
- 同项目里别的插件的会话：拒绝（`actions.forbidden` 一类）。
- 不消费它的插件，人、Agent、工作流、MCP：调不到。
- 输入里带回身份字段（`plugin_id`、`actor_id`……）：schema 拒绝（`actions.input_invalid`）。
- `cancelSubagent`：取消别人会话里的子任务被拒。

### 9.3 规矩没盖到的（统筹 10-23 裁）

1. **大视图的输出 schema。**
   - 顶层字段列全、`required`、`additionalProperties: false`。
   - 嵌套对象只列仓库里调用方（Coding 与其他调用点）真读的字段，其余只约束 `object`。
   - 只约束 `object` 的地方，动作合同快照看不出形状变化，所以只列真用的，不把没人读的字段塞进 schema。
   - 收紧记为 BL-470。去掉的条件：仓库外第一个插件读嵌套字段，或 `validateResult`（PG-047）开启。
   - 小而稳的类型照第 1 批写全：`AgentSessionRef`、`AgentRunHandle`、`AgentCheckpoint`、`AgentRecoveryReport`、命令输出。
2. **身份字段拆开。**
   - 插件给的 `*Input` 不带身份字段，就是动作的输入 schema。
   - 宿主补全后的 `Request` 只在宿主与适配器之间用，不进 SDK 公开 API。
   - 公开 API 有变化就 `pnpm api:update`，在 PR 里写对调用方的影响。
3. **plugin-builder 的 Manifest** 点名的 `createSession`、`readSession`、`startRun`、`readRun`、`controlRun` 这一批不动。
   - 这是用户 10-21 定的「创作台先绕开、以后重做」（BL-377）。
   - Manifest 里这 5 行 consumes 随创作台重做或删除一起去掉。这 5 条描述符照样转成动作（id 不变，consumes 仍然合法，Coding 照常用）；typed 计数只降不升，门禁不受影响。

先做不受这三条影响的：`readCommandOutput`、`listCheckpoints`、`inspectRecovery`、`recoverRun`、`controlRun`、`cancelSubagent`。
