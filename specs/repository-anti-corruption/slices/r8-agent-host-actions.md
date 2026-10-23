# R8 第 1 批：agent 宿主的会话间的信与后台命令改登记成动作（PG-035、BL-364、BL-365）

状态：开发完成、等评审（2026-10-23，防腐线 ac-kernel 片）；验收 RAC-188～190 的测试在 `tests/agent-host-actions.test.ts`，全量与统一验证窗口后补。

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
   - 输出：`prioritizeSession`、`stopBackground` 写了输出 schema；返回信、命令列表的几条不写（形状由 Runtime 给，宿主不改写）。
2. **登记**：不改。`apps/local-host/src/agent-host-composition.ts` 的适配器已经按定义上有没有 `action` 分到 `registerAction`，`horizontal/agent-host/src/capability-registration.ts` 的处理器原样复用。
3. **调用方**：Coding 从 `services.capabilities.invoke` 换成 `services.actions.invoke(definition, input)`（`background-state.ts`、`delegation-dispatch.ts`、`routes-delegations.ts`、`routes-timeline.ts`、`routes-sessions.ts`、`session-observation.ts`、`start-round.ts`、`wake-loop.ts`）。Manifest 的 consumes 不变（已是 `Object.values(agentHostCapabilities)`）。
4. **测试夹具**：`tests/fixtures/plugin-actions.ts` 加 `fakeAgentHostActions`，把这 7 条动作交给测试原有的 agent 宿主假实现应答，五个 Coding 测试改用它。

## 4. 验收

- **RAC-188** 这 7 条是只给插件、不要权限的项目动作；消费它的插件经自己的动作客户端调得到每一条，处理器在宿主启动它的那个项目里运行。
- **RAC-189** 没有消费它的插件调不到（`actions.forbidden`）；人、Agent、工作流、MCP 都看不到也调不了；被拒的调用到不了 Runtime。
- **RAC-190** schema 拒绝的输入（空或超长的 id、元组多一项或少一项、信里多出的字段、空正文、只有 Runtime 发的 `kind`、51 件附件、没有的步骤、超长的说明、步骤不收的字段）是 `actions.input_invalid`，到不了 Runtime；上限本身（50 件附件、100,000 字说明）收下。

## 5. 门禁与合同

- typed 能力的计数：`packages/contracts/src/services/agent-host.ts` 的 `#type-refs` 少 7。
- 公开 API 快照（`tooling/gates/api/contracts/services/agent-host.txt`）与动作快照（`tooling/gates/actions/`）随这一片刷新：多 7 个只给插件的动作，调用方只有 Coding。
- 对调用方的影响：只有 Coding；它的 Manifest 不变。外部插件若经 `services.capabilities` 调这 7 条，要换成 `services.actions.invoke` 并在 Manifest consumes 里列出（现在没有外部插件调它们）。
