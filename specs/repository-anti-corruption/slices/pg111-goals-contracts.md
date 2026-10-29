# PG-111：Goals 的合同归 Goals，顺带拆开事件事实的接口（T-112）

状态：BL-781 一半工程验证中（2026-10-29，Claude（设备 A），分支 `task/T112-ca`，已合 main，开 PR 待验证与二审）；合同搬进 Goals 插件那一半已定做法（§2），在叠在本分支上的 `task/T112b-ca`，本 PR 合入后再开。

## 1. BL-781：`GoalEventFactsApi` 拆成事实、状态、意图

`GoalEventFacts`（`plugins/native/goals/src/module/event-facts.ts`）原来对合同 `GoalEventFactsApi` 的 29 个方法每个转发一次：十二个到 `GoalEventConfiguration`、`GoalEventReporting`、`GoalEventReads` 的事实方法，十二个到 `GoalEventState` 的状态方法，三个到 `GoalEventIntent` 的意图方法，另有两个自己做的（`isEventStateOwner`、`runImmediate`）。后十五个只是转发。

| 接口 | 方法 | 实现 |
| --- | --- | --- |
| `GoalEventFactsApi`（合同，留在 `modules/goals`） | `configure`、`configureRequested`、`report`、`readConfig`、`listEvents`、`listLatestEvents`、`listLatestTimeline`、`listLatestReports`、`readEvent`、`readCurrentRequirements`、`readIntentSourceKind`、`readObservedEventCursor`、`isEventStateOwner`、`runImmediate`，加成员 `state`、`intent` | `GoalEventFacts`，只装配 |
| `GoalEventStateApi`（新） | `readWorkState`、`adoptOwner`、`recordNote`、`recordProgress`、`readProgressReceipt`、`applyConcern`、`requestDecision`、`citeDecision`、`recordTrustedDecision`、`setAgreement`、`submitClosure`、`resumeWork` | `GoalEventState implements GoalEventStateApi` |
| `GoalEventIntentApi`（新） | `replay`、`remember`、`recordArtifacts`（原 `replayIntent`、`rememberIntent`、`recordIntentArtifacts`，方法在 `GoalEventIntent` 里本来就叫这个名字） | `GoalEventIntent implements GoalEventIntentApi` |

选了「状态」「意图」两个接口，没有把意图三个并进状态：它们记的是 createIntent 这一个动作的幂等回放和它留下的东西，与 Goal 的工作状态不是一回事，`GoalEventIntent` 也早就是单独的类。`isEventStateOwner` 留在事实接口里，因为它先拒绝不存在的 Goal（`requireGoal`），那一步是门面的，状态类自己没有。

- `GoalEventFacts` 的 `state`、`intent` 原来是私有字段，现在是公开的只读成员；门面从 29 个合同方法降到 14 个，加私有的 `readCompletionContext`，不再是巨大单元，`tooling/gates/giant-exceptions.json` 里的登记删掉（门禁说它「不再是巨大单元」）。
- 调用方：只有 `goal-event-application.ts`（`GoalEventApplication`，Goals 自己的应用层）里 15 处 `this.ports.events.X` 改成 `.state.X`、`.intent.replay` 一类；`createGoalReadServices` 给宿主的只读服务把 `readWorkState` 挪到 `events.state` 下，这条宿主路径没有使用方在读它（仓库内逐个查过）。`app.goalEvents` 是应用层，方法名与状态方法同名，**不改**。
- 测试：`tests/goal-events.test.ts` 里 6 处 `data.module.events.X` 改经 `.state`。
- 不改：动作 id、版本、权限、输入输出 schema、Manifest、库结构；`tooling/gates/actions/` 没有差异。

## 2. 合同搬进 Goals 插件

王一骏 2026-10-29 选方案 A（#1332 6489805909，对应【方案 T-112】6489420863 第 3 节）：使用方按动作 id 调用、用到的字段就地声明；MCP 的工具从动作目录读说明和 schema；门禁 PG-031 的 `checkGoalTransportCallers` 改成「入口不许碰任何 Goals 合同」（比现在更严）。拆成两个 PR 串行，本 PR 只做 §1；搬家与入口改造在第二个 PR，写进本节的余下部分。

## 3. 验收

| 编号 | 可观察结果与证明 |
| --- | --- |
| RAC-1772 | `GoalEventFactsApi`、`GoalEventStateApi`、`GoalEventIntentApi` 的键与上表逐项相等，`state` 的类型就是 `GoalEventStateApi`，`GoalEventFacts` 可以赋给 `GoalEventFactsApi`（调 TypeScript 在构建出的 `.d.ts` 上做类型检查，不靠运行器）；`GoalEventFacts.prototype` 上只有事实方法和 `readCompletionContext`，那 15 个转发方法没有了（`tests/goals-contract-ownership.test.ts`） |
