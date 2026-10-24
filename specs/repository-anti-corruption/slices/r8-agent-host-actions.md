# R8：agent 宿主的 typed 能力分批改登记成动作（PG-035、BL-364、BL-365）

状态：第 1～4 批与 `waitRun` 一批已合入 main；「删 typed 通道」（§12，统筹 10-24 裁选 A）已开 [PR #1242](https://github.com/molis-ai/molis-work/pull/1242)，实现及同步 main 后的两处测试冲突解法均一轮评审可合，本轮活文档修正交增量复核；定向回归证据按各自 head 保留，共享核心全量仍待统筹在 batch-35 执行，实际合入 main 前不关闭 PG-035 整行或宣称整线完成。

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

- **归属（统筹 10-23 裁，R8 规矩 3、4，这一片一起关，不另记 BL）**：原 typed 路径上 `readProjectWork` 读整个项目的工作、`releaseProjectRound` 只按工作 id 放下，都不核这项工作是不是调用者的会话的。现在两条都只认调用者自己的会话（同一项目、插件、安装、actor，核法同 `readSessionStatuses`；`horizontal/agent-host/src/project-work-scope.ts`）：
  - `readProjectWork` 只返回调用者自己会话的工作与重叠；探查里点名的会话不是调用者的就拒绝。
  - `releaseProjectRound` 先在项目的工作里找到这一项，不在、或属于别人的会话，就按「找不到」拒绝（`agent.session_unknown`），Runtime 不被要求放下。放下别人卡住的一轮不是插件该有的能力，以后真需要，做成平台或本人的动作。
  - 没有调用者需要知道项目里别人的工作：唯一的调用者 Coding 用它找自己各会话之间的重叠、在自己的另一项工作完成后再开始。所以不给摘要，只返回自己的。以后若要不同插件的 Agent 互相避开文件，再按统筹的口径只给不含内容的摘要（id、状态、主人插件的显示名、开始时间），并在这里写明是谁要、为什么。
  - 排队另核元组里的 Runtime 与会话所在的 Runtime 一致（评审建议 1，同 `startRun`）。
- **调度**：同 §6，四条都不等模型、不等外部服务，保持默认串行；排队、放下在写之前各过一次 `beforeEffect`。

**RAC-197** 这 4 条是只给插件、不要权限的项目动作，只作用于调用者自己的会话：放下与探查交给 Runtime 的项目和放下的人来自调用；项目里别的插件会话的工作不出现在读到的工作与重叠里，放下它或不在的工作被拒，探查别人的会话被拒；另一个项目的会话，以及同一项目里别的插件、别的安装、别的人的会话，状态单独回原因，排队被拒（`agent.session_unknown`），它们的工作读不到、放不下，Runtime 没有被要求排队或放下；自己的会话排给插件自己的 actor；排到另一个 Runtime 的被拒。没有消费它的插件、人、Agent、工作流、MCP 调不到；schema 拒绝空会话 id、排队里多出的 `actor_id`、少一项的元组，被拒的调用到不了 Runtime。

剩 26 条：`listActions`、`listRuntimes`、`availableRoles`（谁能调、`pluginId` 从输入读）、两个 `wait`、`listSkills` 等 7 条从输入读 `pluginId` 的、`cancelSubagent`（`actorId` 从输入读）、`listReviews`（`projectId` 从输入读），以及读会话、跑轮次的其余各条。

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
   - 收紧记为 BL-470。动作服务本来就按 output_schema 校验返回，只约束 `object` 的嵌套对象校验得过、约束不住形状。去掉的条件：仓库外第一个插件读嵌套字段。（原先写的「或 `validateResult`（PG-047）开启」是笔误：PG-047 的 `validateResult` 指模型结果，不是动作返回。）
   - 小而稳的类型照第 1 批写全：`AgentSessionRef`、`AgentRunHandle`、`AgentCheckpoint`、`AgentRecoveryReport`、命令输出。
2. **身份字段拆开。**
   - 插件给的 `*Input` 不带身份字段，就是动作的输入 schema。
   - 宿主补全后的 `Request` 只在宿主与适配器之间用，不进 SDK 公开 API。
   - 公开 API 有变化就 `pnpm api:update`，在 PR 里写对调用方的影响。
3. **plugin-builder 的 Manifest** 点名的 `createSession`、`readSession`、`startRun`、`readRun`、`controlRun` 这一批不动。
   - 这是用户 10-21 定的「创作台先绕开、以后重做」（BL-377）。
   - Manifest 里这 5 行 consumes 随创作台重做或删除一起去掉。这 5 条描述符照样转成动作（id 不变，consumes 仍然合法，Coding 照常用）；typed 计数只降不升，门禁不受影响。

先做不受这三条影响的：`readCommandOutput`、`listCheckpoints`、`inspectRecovery`、`recoverRun`、`controlRun`、`cancelSubagent`。

### 9.4 第 3 批第一段（6 条，已做）

- **合同**：这 6 条换成 `ActionDefinition`，只给插件（`pluginOnly`），输入是定长元组：会话引用、轮次引用（`run_id`、`session_id`）、各自的参数。
  - `controlRun` 的控制是 `oneOf`：暂停、继续、停下、取消；换模型（`provider_id`、`model_id`）；回答（`pending_id`，可选 `pending_revision`、`text`、`answers`）。补充与撤回早已走 `agent.inputs.*`，不在这里。
  - `cancelSubagent` 的输入去掉第 4 项 `actorId`。
  - 输出照 §9.3① 写全：命令回执、`AgentRecoveryReport`（`recoverRun` 与 `inspectRecovery` 共用）、`AgentCheckpoint[]`。动作服务会核对输出，所以宿主把运行时给的操作记录逐字段拷出，不整个展开，免得运行时多带的字段让结果被拒。
- **处理器**：`cancelSubagent` 停下子任务的人只从调用者取；没有插件调用者就拒绝（规矩 1、4）。另外 5 条的处理器不变：`readScopedSession`、`requireRun` 已经按项目、插件、安装、actor 核会话归属。
- **Coding**：9 个调用点改经 `codingActions(context, beforeWrite).invoke`，带上路由的写前栅栏。涉及 `routes-sessions.ts`、`routes-changesets.ts`、`routes-timeline.ts`（5 处）、`routes-writers.ts`、`start-round.ts`。
- **测试**：
  - `tests/agent-host-actions.test.ts` 的 RAC-199 覆盖：只给插件；取消子任务的人是调用者；别的插件、别的项目、别的人的会话都按「找不到」拒绝，Runtime 没被问到；别处的轮次被拒；不消费的插件与人、Agent、工作流、MCP 调不到；输入带身份字段、未知控制、缺字段、非整数版本被 schema 拒绝。
  - 改过的旧用例：`coding-subagents-http`（取消不再带人）、`coding-report-persistence`、`coding-surface`、`coding-session-recovery`（假的 Agent 宿主也应答动作）、`agent-plugin-identity`（命令引用补上 `run_id`，拒绝仍是会话归属那一条）。

### 9.5 第 3 批第二段（7 条，已做）

- **合同**：`createSession`、`startRun`、`readSession`、`readRun`、`readRunReviews`、`listSubagents`、`prepareRewind` 换成只给插件的 `ActionDefinition`。
- **身份拆开（§9.3②）**：
  - 插件给的 `AgentCreateSessionInput`、`AgentStartInput` 不带项目、插件、安装、actor，`AgentStartInput` 也不带 `role`。它们就是动作的输入 schema，`additionalProperties: false`，带回这些字段的被拒。
  - 宿主补全后的 `AgentCreateSessionRequest`、`AgentStartRequest` 只在宿主与运行时适配器之间用（`AgentRuntimeAdapter.createSession`、`start`），插件 SDK 不转出。
  - 归属 `AgentSessionOwner` 一处定义，`AgentSessionView.owner` 用它。
  - 原来的 `assertInputOwner`（输入里的身份与调用者比对）删掉：处理器只从调用者取归属，没有插件调用者就拒绝。`startRun` 另核元组里的 Runtime 与会话所在的一致，会话归属仍由 `readScopedSession` 核。
- **输出（§9.3①）**：会话视图、一轮的视图、审批、子任务、回退请求的顶层字段列全，`required` 加 `additionalProperties: false`。嵌套对象（`frozen`、`turns`、`activity`、`usage`、`step_board`、审批的 `document` 等）只约束 `object`，收紧见 BL-470。
- **输入**：开始一轮的每个嵌套字段都列了形状和上限（材料、计划、工具引用、预算等），宿主原有的检查（材料长度、预算、目录授权、角色）照旧在后面。
- **Coding**：
  - 50 处调用改经 `codingActions(context, beforeWrite)`。`subagentGroups`、`reaskMaterial` 改收动作客户端或 `beforeWrite`；`coding.taskboard`、`coding.prepare-rewind` 两条路由多接 `beforeWrite`。
  - 新建会话与开始一轮不再拼 `identity`。`startRound`、`roundAfterParkedAnswer`、`runtimeSessionOf`、`goOn` 和唤醒循环不再收 actor 参数：一轮替谁开始，由宿主从调用上下文定。原来写在 `wake-loop.ts` 里「名字必须与调用者一致」的说明改成「不点名」。
  - `roundReport` 不再用 typed 客户端，删掉这个参数。
- **plugin-builder**：Manifest 里点名的 5 条 consumes 不动（§9.3③）。描述符 id 不变，consumes 仍然合法；创作台没有代码调用它们。
- **测试**：
  - RAC-180（`tests/agent-host-actions.test.ts`）：读会话、读一轮、读审批、列子任务、准备回退只给消费它们的插件；别的插件、项目、安装、人的会话一律按「找不到」拒，运行时什么也没被问到；不属于这条会话的一轮按 `agent.run_unknown` 拒；人、Agent、工作流、MCP 一律 `actions.forbidden`；输入里带身份的被 schema 拒。
  - 建会话与开始一轮的拒绝在 `tests/agent-plugin-identity.test.ts`（也标 RAC-180）：输入里伪造的归属被 schema 拒；别的插件拿到会话引用也开不了一轮。
  - S-17（RCPT-391）原来证明「开始请求里多带的会话与作者字段不进工具」，现在这些字段在 schema 就被拒，测试改成先断言拒绝、再用干净的请求证明工具只拿到宿主核过的会话。拒绝提前了，没有放宽。
  - AC-07 原来断言下一轮「以回答者的 actor 开始」是看输入里的 `actor_id`；现在输入不点名任何人，测试改成断言输入里没有 actor、也没带上被搁置那轮发起人的任何东西，替谁开始由宿主从调用上下文定。
  - `agent-plugin-identity` 里三处拒绝换了把关的地方，都还是拒绝：调用选项里伪造的 `plugin_caller` 被插件 SDK 丢掉，会话建成插件自己的（测试改成断言归属是自己的）；宿主没绑定安装的 SDK 没有调用者，由动作服务按 `actions.forbidden` 拒；停止中的安装，调用由 SDK（「已停止」）或动作服务（「没有宿主发出的有效身份」）拒。
  - 测试夹具：`withFakeAgentHost` 让 Coding 测试的假 Agent Host 同时回答这些动作；动作服务两头都校验，所以假回答缺的顶层字段由夹具补中性值（`completeView`）。

BL-364 剩 13 条（`waitRun` 转完剩 12 条，见 §10）。

## 10. `waitRun` 一批（统筹 10-23 裁定，已做）

`agent.run.wait.v1` 是第 3 批留下的唯一一条读会话、跑轮次的 typed 条目，归规矩 2：等待要么是 `concurrent` 的动作，带上限、可取消、写前 `beforeEffect`，要么拆成「开始等」加「查结果」。验收编号 RAC-181。

### 10.1 现在的样子（2026-10-23 看代码）

- **描述符**：`operation: "wait"`，没有 `action`。输入 `[session, run, since, timeoutMs]`，输出 `{ version, view }`。
- **处理器**（`capability-registration.ts` 的 `waitRun`）：
  - 先 `requireRun`，已经按项目与调用者核会话归属。
  - `timeoutMs` 被悄悄夹到 0～25 000。`observe` 一轮，第一次变化后再收 40 ms 的变化，回答最新的视图。视图里有待回答的问题时，再完整读一次。
  - 调用的 `signal` 取消时，放开观察并拒绝。
  - 注册外壳在处理器返回后调 `assertAuthorityCurrent()`，所以等待期间被撤权的调用拿不到视图。
- **宿主里 `wait` 的特殊待遇**：
  - 不进动作目录（`kernel/src/action-metadata.ts`）。
  - 不排进项目队列，关项目时先被取消（`local-host.ts` 的 `callSignal`、`withRuntime`）。
  - 调用记录里永远不留行（`action-call-log.ts` 的 `recordedOperation`）。
  - `checkActionAvailability` 遇到 `wait` 直接返回，不走 `admitPluginCall`。
- **调用方**：Coding 只有两处。
  - `routes-timeline.ts` 的 `coding.live`：页面的长轮询，每次最多 25 秒，路由自己先夹一次上限。
  - `start-round.ts` 的 `follow`：后台作业 `background.keep("follow")` 里一轮一轮地等，用安装自己的权限、作业的 `signal`。
- **测试**：`agent-run-wait`（直接调处理器）、`coding-message-wait`、`coding-material-consumption`、`coding-session-follow`、`coding-queued-round`。

### 10.2 推荐：一条 `concurrent` 的查询动作，不拆

- **为什么不拆**：现在的等待不在宿主留任何状态，「从哪个版本起等」由调用方带着 `since`。拆成「开始等」加「查结果」，就要在宿主里新存一份观察：谁开的、什么时候过期、别人能不能取消（规矩 4）、关项目时怎么收。换来的东西，长轮询本来就有。不拆，规矩 4 自然满足：没有可被别人取消的东西，取消就是调用方中止自己的调用。
- **写法**：
  - `operation: "query"`、`action.kind: "query"`、`...pluginOnly`、`scheduling: "concurrent"`，排在项目队列之外，跟现在一样。
  - `execution: { timeout_ms: 30_000 }`：处理器自己最多等 25 秒，加 40 ms 收集和一次完整读取，30 秒是宿主替它兜底的上限，超了就是 `actions.timeout`。
  - **输入**：`[sessionRef, runRef, since: string | null（maxLength 200）, timeoutMs: integer 0～25 000]`，`additionalItems: false`。超出范围由 schema 拒，不再悄悄夹；Coding 两处调用本来就先夹到 25 000，没有影响。
  - **输出**：`{ version: string, view: runViewOutput }`，顶层 `required` 加 `additionalProperties: false`，`view` 沿用第 3 批的 `runViewOutput`（BL-470）。
  - **处理器**：
    - 照旧先 `requireRun`。
    - 解出视图之后、回答之前，调 `invocation.beforeEffect()` 和 `assertAuthorityCurrent()`。这是读，没有副作用，这一步只为「撤了权就不给」：调用者在等待期间被停用或撤权，答复丢掉。注册外壳返回后已有一次 `assertAuthorityCurrent()`，这里提前到解出视图时就查，把撤权与回答放进同一个同步段。
    - 取消：调用的 `signal`（动作服务合进了宿主关项目的信号）一到就放开观察并拒绝，不再读运行时。
- **Coding**：
  - `coding.live` 改经 `codingActions(context, beforeWrite)`，`signal` 用路由调用自己的。
  - `follow` 改经 `context.services.actions`，带作业的 `signal` 和 `control.beforeEffect`。作业持有的是安装的权限，插件停用时作业的 `signal` 结束等待，和现在一样。
- **夹具**：`withFakeAgentHost` 自动多答这一条，Coding 测试里的假 `waitRun` 回答由 `completeView` 补齐顶层字段。

### 10.3 统筹 10-23 裁

整体形状照 §10.2：一条只给插件的 `concurrent` 查询，不拆。

1. **调用记录不开例外。**
   - 调用方自己取消的 `waitRun` 照平台对取消调用的通用规则办，留一行只有错误码的诊断行。不为一条动作在调用记录里开例外：会悄悄漏掉一些调用的记录本身就是隐患。
   - 防噪声靠语义：等满 `timeoutMs` 回答的是正常的「还在跑」，回最新的视图，算成功、不算取消，所以只有真被调用方取消的才留行。这一点要有测试钉住。
2. **`wait` 分支在转 `awaitContinuations` 的 PR 里删，不留兼容期。**
   - 统筹原裁「同 PR 删」。实现时发现 `agent.collaboration.await.v1`（`awaitContinuations`）也是 `operation: "wait"`，`waitRun` 转完以后平台的 `wait` 分支仍有人用，§10.2 原稿「没有 `wait` 条目了」的前提不对。
   - 统筹 10-23 改裁（①）：这个 PR 保留这些分支，第 3 批不并入 `awaitContinuations`。转 `awaitContinuations` 的同一个 PR 删掉它们，记在 BL-364，去掉的条件是「collaboration.await 已转成动作，`operation: "wait"` 没有使用者了」。
3. **并发不留隐患。**
   - 动作服务对 `concurrent` 动作没有按调用者或按安装的同时进行数上限，只有每分钟次数（`max_calls_per_minute`）。
   - 所以 `waitRun` 自己限：每个安装同时最多 8 个等待，再来的按 `agent.wait_limit_reached` 拒（`defineErrorCodes("agent", …)`，种类 `rate_limited`），带拒绝用例。等待结束（回答、取消、出错）就让出名额。

### 10.4 验收（RAC-181）

- 描述符是只给插件的 `concurrent` 查询，带 `execution.timeout_ms` 上限。
- 拒绝用例，每条都断言运行时的 `observe` 没被调用：
  - 别的插件、项目、安装、人的会话：按「找不到」拒（`agent.session_unknown`）。
  - 不属于这条会话的一轮：`agent.run_unknown`。
  - 不消费它的插件，人、Agent、工作流、MCP：`actions.forbidden`。
  - 输入里带身份字段，`timeoutMs` 超过 25 000、为负数或不是整数：`actions.input_invalid`。
- 等待中被取消：拒绝，观察被放开（`agent-run-wait` 已有的放开断言改走动作），调用记录留一行只有错误码的诊断行。
- 等满 `timeoutMs`：正常回答最新的视图，调用记录不留行。
- 同一个安装同时第 9 个等待：`agent.wait_limit_reached`，运行时没被观察；前面一个结束后再等，成功。
- 等待中被撤权：拿不到视图。
- `coding.live` 与 `follow` 的现有用例照旧通过。

### 10.5 做了什么

- **合同**：`waitRun` 是只给插件的 `concurrent` 查询，带 `execution: { timeout_ms: 30_000 }`。输入 `[sessionRef, runRef, since, timeoutMs]`，`timeoutMs` 是 0～25 000 的整数，超出由 schema 拒；输出 `{ version, view }`，`view` 用 `runViewOutput`。
- **宿主**：
  - 等待本身搬到 `horizontal/agent-host/src/run-wait.ts`（`waitForRunChange`、`runViewVersion`），每个安装的并发名额也在这里（`installationWaits(8)`，超了 `agent.wait_limit_reached`，种类 `rate_limited`）。
  - 处理器：没有插件调用者就拒 → `requireRun` → 占名额 → 等 → `beforeEffect()` 与 `assertAuthorityCurrent()` → 回答；不管怎样结束都让出名额。
- **Coding**：`coding.live` 改经 `codingActions(context, beforeWrite)`，`timeout` 先取整再夹到 25 000；`follow` 改经 `services.actions`，带作业的 `signal` 与 `beforeEffect`。
- **`wait` 分支**：`awaitContinuations` 还在用，这个 PR 不删（§10.3②，统筹 10-23 改裁①），随转它的 PR 一起删。
- **测试**：
  - RAC-181（`tests/agent-host-actions.test.ts`）：等满时间回答原样、调用记录不留行；调用方取消，调用记录留一行只有 `actions.cancelled` 的诊断行；第 9 个等待被拒、没观察任何东西，让出一个名额后再等成功；别的插件、项目、安装、人的会话按「找不到」拒；不属于这条会话的一轮按 `agent.run_unknown` 拒；人、Agent、工作流、MCP 一律 `actions.forbidden`；`timeoutMs` 超上限、为负、不是整数，以及多带身份项，都是 `actions.input_invalid`；被拒的等待没碰运行时。
  - `agent-run-wait` 的两条照旧，调用改带插件调用者。
  - 夹具 `fakeAgentHostActions` 把调用的 `signal` 交给假回答，`coding-session-follow` 的「插件停用即取消等待」靠它照旧成立。

## 11. 第 4 批：BL-364 剩下的 12 条（已实现；§11.3 统筹 10-23 已裁）

分支 `ac-kernel/r8-agent-typed-to-actions-4b`：第 3 批随 batch-26 合入后，把原分支 `…-4` 的四个提交重放到 main `1712c0331` 上（`baseline.json` 不随功能 PR 改）。验收编号 RAC-182～187。

### 11.1 范围与归到哪条规矩

| 描述符 | 现在的输入 | 规矩 | 改法 | 调用方 |
| --- | --- | --- | --- | --- |
| `awaitContinuations` | `[runtimeId, timeoutMs, exclude?]` | 2、3 | 照 `waitRun`：只给插件的 `concurrent` 查询，宿主 30 秒兜底，`timeoutMs` 0～25 000 整数由 schema 拒；回答只留调用者自己会话的接续（照 `projectWorkScope`）；占 `waitRun` 同一个每安装 8 个的名额；同一批删平台的 `wait` 分支（BL-364 的去掉条件到此满足） | Coding `wake-loop.ts` |
| `listRuntimes` | `[]` | 3 | 只给插件的查询。运行时描述是本机的公开配置，每个插件看到的都一样，没有可滤的 | Coding 11 处；Characters 宿主一处（§11.3①）；plugin-builder 的 consumes（BL-377，不动） |
| `availableRoles`、`listActions` | `[runtimeId, pluginId]` | 1、3 | 去掉 `pluginId`，角色与动作按调用者自己的声明与授权答 | Coding 6 处；Characters 宿主一处（§11.3①） |
| `listSkills`、`readSkill`、`discoverSkills`、`installSkill` | `[runtimeId, pluginId, …]` | 1 | 去掉 `pluginId`；方法库的主人就是调用者（`method_owner`）；`installSkill` 写之前 `beforeEffect` | Coding `routes-setup.ts`、`routes-sessions.ts` |
| `listMcp`、`saveMcp`、`controlMcp` | `[runtimeId, pluginId, …]` | 1 | 去掉 `pluginId`；`saveMcp` 写之前补 `beforeEffect`（现在没有）；`listMcp` 见 §11.3③ | Coding `routes-setup.ts`、`routes-sessions.ts`、`executor.ts` |
| `listReviews` | `[projectId, status?]` | 1、3 | 见 §11.3② | 仓库里没有产品调用方，只有 `tests/agent-host-wiring.test.ts` |

`pluginFor(call, pluginId)` 里「输入带 `pluginId`、与调用者比对」的分支随这一批删掉；`ports.authority` 只按调用者取。转完 `agentHostCapabilities` 里没有 typed 条目，BL-364 删行；`AgentCapabilityRegistrar` 只剩动作一种，组合根和测试里「按 `action` 分两边」的写法一起删（BL-364 原文）。

### 11.2 每条要补的拒绝用例

- 不消费它的插件；人、Agent、工作流、MCP：`actions.forbidden`。
- 输入里多带 `pluginId` 或别的身份：`actions.input_invalid`。
- `availableRoles`、`listActions`、技能、MCP：答的只是调用者自己的（另一个插件的方法库、MCP、角色读不到，也写不进）。
- `awaitContinuations`：别的插件的会话的接续不在回答里；第 9 个等待（与 `waitRun` 合计）`agent.wait_limit_reached`；`timeoutMs` 越界 `actions.input_invalid`；等满时间回答空表算成功、不留调用记录行，取消留一行。
- `saveMcp`、`installSkill`：撤权或取消发生在写之前，什么也没写。

### 11.3 规矩没盖到的（统筹 10-23 裁）

1. **Characters 是宿主自己登记的提供方，没有插件调用者。** `apps/local-host/src/characters-host.ts` 用宿主的 typed 客户端以 `io.molis.work.characters` 的名义调 `listRuntimes`、`listActions`（走 `startAuthority` 里「没有调用者就按内置名单查」那条）。动作只给插件以后，它调不到了。
   - ①（推荐）组合根直接给 Characters 一个端口（`CharactersAgentCatalog`），由 `agent-host-composition.ts` 用 Agent Host 本身实现：运行时列表照 `descriptors()`，动作照 Characters 自己的声明算。不经动作、不经 typed 客户端，也不在输入里写插件名。
   - ② Characters 改成一个真正装起来的插件，带自己的调用者。这是 Characters 去向的那条防腐线（2026-10-18 改），不在这一批。
   - **裁定（统筹 10-23 裁）：①。** `CharactersAgentCatalog` 是宿主内部的端口，只给宿主装配的 Characters 用，不对插件开放：不经动作、不经 typed 客户端，输入里没有插件名，插件拿不到它。Characters 装成插件或确认归平台以后，这个端口删掉或改归类，记 BL-520（PG-085）。
2. **`listReviews` 没有产品调用方。** 没有调用者时它把项目里所有审批都给出去；`projectId` 输入实际被忽略（取的是调用上下文的项目）。
   - ①（推荐）删掉这条描述符（现在不留兼容期），测试改断言它不再登记。插件要看自己一轮的审批，已有 `readRunReviews`。
   - ② 转成只给插件的查询：去掉 `projectId`，只给调用者自己会话的。
   - **裁定（统筹 10-23 裁）：①，删掉。** 一轮的审批由 `readRunReviews` 读；不留兼容期。
3. **`listMcp` 是查询，却会同步项目的 MCP 工具目录。** 它调 `mcpChanged`，也就是 `external-mcp-actions.ts` 的 `sync`：把这个插件的 MCP 服务器重新登记成项目里的动作提供方，并写 Home 里的「见过」记录。这不是业务数据，是宿主的目录簿记，但查询带了副作用。
   - ①（推荐）保留现状，在描述和 slice 里写明这是宿主簿记：撤权或取消的调用照样不 `sync`，因为同步排在 `beforeEffect` 之后，这一点补测试。
   - ② 让 `listMcp` 变成纯读，目录只在 `saveMcp`、`controlMcp` 和项目打开时（`restore`）同步。运行时在别处改了服务器状态时，目录要等下一次保存或重开才跟上。
   - **裁定（统筹 10-23 裁）：①，带条件。** `listMcp` 不是没有副作用的查询，描述里照实写：列的同时宿主把调用插件自己的 MCP 工具重新登记进项目的动作目录。条件与做法：
     - 只重登调用者自己那个安装的工具：同步按 `[项目, 插件]` 记，属主就是调用者的 `method_owner`，提供方是 `<插件>#mcp:<服务器>`，同步不再另收插件名；别的插件的工具一条不动。
     - 幂等：没变的工具保留原登记（`createRegistrationSet` 按指纹比），连列两次不新登记。
     - 排在 `beforeEffect` 复核授权之后；同步读完服务器的工具、写目录与 Home 里的「见过」记录之前，再同步跑一次 `assertAuthorityCurrent`。撤权、取消、停用的调用不同步，这一步失败按原错误拒绝，不当作「同步失败、列表照样成功」吞掉。
     - Home 里的「见过」记录（`config/external-mcp-tools.json`）是宿主的目录簿记，重启后用它把断开的服务器的工具标成不可用，不是业务数据。
     - 在动作模型里照样能声明成查询（`kind: "query"`，只给插件），不用改成 `concurrent`。
4. **`awaitContinuations` 的名额。** 推荐与 `waitRun` 共用每个安装 8 个的名额（统筹 10-23 裁的是「每个安装的等待」）；另一个办法是各给 8 个。
   - **裁定（统筹 10-23 裁）：共用每个安装 8 个。** RAC-185 两个方向都测：任一种占满 8 个，另一种也被拒。

### 11.4 做了什么

- 11 条转成只给插件、不要权限的动作：`listRuntimes`（输入 `[]`）、`availableRoles`、`listActions`（`[runtimeId]`）、四条技能、三条 MCP（`[runtimeId, …]`，都不再带 `pluginId`）、`awaitContinuations`（`concurrent` 查询，宿主 30 秒兜底，`timeoutMs` 0～25 000 整数，`exclude` 至多 200 条）。输出 schema 顶层列全，嵌套对象只约束 `object`（同 §9.3①、BL-470）。
- `pluginFor(call)` 不再收 `pluginId`；`ports.authority(call)` 没有插件调用者就按 `agent.session_unknown` 拒，只按调用者取声明、授权与 `method_owner`。`listActions` 先取权威再看运行时是否支持动作工具。
- 写之前补 `beforeEffect`：`installSkill`、`saveMcp`；`mcpChanged`（MCP 目录同步）排在 `beforeEffect` 之后，属主取自 `owner.plugin_id`，不再另传插件名；§11.3③（统筹 10-23 裁）同步在写之前再跑一次授权检查，失败照原错误拒绝。
- `awaitContinuations` 只回调用者自己会话的接续（照 `readScopedSession`），别的会话的接续记进 `exclude` 接着等，不提前结束（循环在 `run-wait.ts` 的 `awaitOwnContinuations`，`registerAgentHostCapabilities` 因此不变长）；与 `waitRun` 共用每个安装 8 个的名额（`installationWaits(8)`）。
- 删掉平台里只为 `wait` 留的分支：`HostCapabilityOperation` 只剩 `query | command`，内核登记拒绝 `wait`；`action-metadata.ts`、`local-host.ts` 的 `callSignal`、排队绕行与 `checkActionAvailability` 早退，`action-call-log.ts`、`typed-call-settlement.ts` 的 wait 分支都删了。可能停住的读改成声明 `scheduling: "concurrent"` 的查询。
- §11.3① Characters（统筹 10-23 裁）：`AgentHostComposition.charactersCatalog(runtime)` 给 Characters 宿主一个宿主内部的端口，运行时列表照 `descriptors()`，动作照 Characters 自己的声明算；`characters-host.ts` 不再经 typed 客户端。
- §11.3② 删掉（统筹 10-23 裁）`agent.reviews.list.v1`（描述符、处理器、包描述与 `scripts/workspace-packages.mjs` 的登记）。
- `agentHostCapabilities` 里不再有 typed 条目；`AgentCapabilityRegistrar.register` 只收 `ActionDefinition`，组合根与 6 处测试的「按 `action` 分两边」与转型一起删。BL-364 删行。
- 等待与接续的读与控（`agent.collaboration.read`、`agent.collaboration.control`，原已是动作，统筹 10-23 要求随这一批改）：读不带 `session_id` 时只回调用者自己会话的，带别人的 `session_id` 按 `agent.session_unknown` 拒；控只认调用者自己会话里的等待，别人的按 `agent.collaboration_unknown`（与项目里没有的等待一样）拒，到不了运行时（规矩 3、4）。原来不带会话的读把项目里所有会话都给出去，控也不看等待是谁的。
- Coding：所有调用经 `codingActions(…).invoke(agent.X, [runtimeId, …])`，不带插件名；`wake-loop.ts` 经 `services.actions` 等接续，带本轮的 `signal` 与 `beforeEffect`；`codingCardPorts`、`landRoundOffers`、`runsWithCards` 去掉不再用的 `api` 参数。

### 11.5 验收（RAC-182～187）

- **RAC-182** 运行时列表、角色、动作只给消费它们的插件；角色按调用者自己的声明答；输入里多带插件名一律 `actions.input_invalid`；不消费的插件、人、Agent、工作流、MCP、宿主自己的客户端一律 `actions.forbidden`；被拒的调用没问到运行时。
- **RAC-183** 方法库按调用插件的 `method_owner` 列、读、装；授权工作区之外的目录按 `agent.directory_unauthorized` 拒、没问到运行时；开始后、写之前被取消的安装是 `actions.cancelled`，方法库没被写。
- **RAC-184** MCP 服务器按调用插件列、存、控；每次列只重登调用插件自己的工具，没变时再列不新登记；授权工作区之外的本地进程按 `agent.directory_unauthorized` 拒；写之前被取消的保存什么也没存；列到一半被取消的列表，不管停在读服务器时还是读工具时，都不重登项目的 MCP 目录；读工具时插件被停用，调用被拒、什么也没登记。
- **RAC-185** 等接续是 `concurrent` 查询；别的插件会话的接续不在回答里、不提前结束等待；等满时间回空表算成功、不留调用记录行；调用方取消留一行只有 `actions.cancelled` 的诊断行；与 `waitRun` 共用名额：任一种占满 8 个，另一种的第 9 个 `agent.wait_limit_reached`、什么也没问，让出后再等成功；`timeoutMs` 越界、`exclude` 超 200 条 `actions.input_invalid`。等待与接续的读只回调用者自己会话的，点名别人的会话按找不到拒；控别人会话的等待按项目里没有这个等待拒，运行时零调用。
- **RAC-186** 没有 `wait` 这种能力：内核拒绝登记，调用方也不能把命令说成等待。
- **RAC-187** `agent.reviews.list.v1` 不再登记，调它是 `actions.dependency_missing`。
- 测试：RAC-182～185 在 `tests/agent-host-actions.test.ts`；RAC-186 在 `tests/local-host.test.ts`；RAC-187 在 `tests/agent-host-wiring.test.ts`；RAC-182 另有 `tests/agent-host-composition.test.ts`、`tests/agent-plugin-identity.test.ts` 的输入拒绝。

### 11.6 没改的、留给后面的

- typed 定义顶层的 `scheduling` 字段（`HostCapabilityDefinition`）还在，宿主里别的 typed 条目还在用；随 typed 登记口整体删除时一起去（§12 已删）。

## 12. 删 typed 通道（统筹 10-24 裁：选 A，一个 PR）

第 4 批之后注册表里已经没有 typed 条目（`tests/typed-registry-inventory.test.ts`），剩下的只是通道本身。这一片把它整个删掉，`typedCapabilities` 门禁的数字清到 0。

### 12.1 删了什么

- 合同：`HostCapabilityDefinition`、`HostMethodCapability`、`HostCapabilityInput` / `HostCapabilityOutput`、`HostCapabilityDescriptor` 顶层的 `scheduling`；`HostCapabilityCallOptions` 的 `plugin_caller` 与 `consumer`；插件侧的 `PluginCapabilityClient` 与 `PluginHostServices.capabilities`。统筹 10-24 裁定保留的是动作身份字段与输入输出类型：`ActionDefinition` 直接扩展 `HostCapabilityDescriptor`，自己带 `__types__`，不保留 `HostCapabilityDefinition` 旧名或别名。
- 宿主：`LocalHost.register`、`ProjectHost.registerCapability`、typed 调用的结算（`typed-call-settlement.ts`）与只为它留的 `host.registration_seam`；`typed-capability-invocation.ts` 只剩宿主项目客户端的调用者，改名 `project-call-caller.ts`。`LocalHost.invoke` 只走 `ActionService.invoke`：没注册的 id 答 `actions.missing`（以前 typed 兜底答 `actions.dependency_missing`），调用方自报的 `operation` 与 `wait` 不再起作用，并发只看已注册动作的 `scheduling`。
- 调用记录与结算：`path: "typed"` 字段（`CallDescription`、`ActionCallRecord`）没有人再写，删掉；内核入口不再导出 `settleCall`、`startHandler`。
- 插件运行时：`createPluginCapabilityClient`、`PluginCapabilityPort`；执行器与平台的 `capabilities` 选项改名 `dependencyCheck`（只答依赖是否可用，宿主用 `hostDependencyCheck(client)` 造）。

### 12.2 `services.actions` 怎么接替

- 调用：`services.actions.invoke(definition, input, control)`，`definition` 是 `ActionDefinition`；Manifest 仍要在 `capabilities.consumes` 列出，没列的答 `actions.forbidden`，列了没注册的答 `actions.dependency_missing`。
- 可用性：新加同步的 `services.actions.availability(reference)`，次序与原 `services.capabilities.availability` 一样：宿主没给检查答 `actions.dependency_unknown`；实例已停（含停用钩子里）答 `actions.provider_stopped`；没声明消费答 `plugin.capability_denied`（`invalid`）；其余问宿主的项目客户端（`availability(reference, { consumer: "plugin" })`）。SDK 的 `bindOwnerPluginAction` 改问它，所以依赖不在时页面目录与路由的表现不变（同一个码）。

### 12.3 验收

- 拒绝路径：`tests/plugin-capability-availability.test.ts`（声明、缺失、版本、换提供方、停用钩子、无检查、项目与提供方范围，页面目录与路由同码）、`tests/plugin-host-services.test.ts`（没声明的动作在问宿主之前拒绝）、`tests/current-project-settings.test.ts`（逐项按 Manifest 放行）、`tests/goal-management-identity.test.ts` 与 `tests/management-door-identity.test.ts`（退役的旧 id 经宿主客户端与插件客户端都拒）、`tests/host-action-registration.test.ts`（PG035-02 插件拿不到 `services.capabilities`，PG035-06 宿主上没有 `register` / `registerCapability`）。
- 门禁：`tests/health-gates-structure.test.ts` 在本仓库上找不到别名、注册口与任何计数；`node scripts/check-health-gates.mjs --base origin/main` 的 `typedCapabilities` 为 0。
- 创作台与 Alchemist：`skills/molis-plugin-dev`、`apps/local-host/src/plugin-builder/skill.ts` 的 `CHAPTERS`、`plugins/native/plugin-builder/src/agent-prompts.ts`、`examples/`、`tests/plugin-sample*` 里没有 `services.capabilities`；改的只是 `skills/molis-plugin-dev/host.md` 里不在章节里的两段说明，创作台章节与提示词没动，不需要 `pnpm studio:replay`。
