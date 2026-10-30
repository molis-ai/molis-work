# PG-111：Goals 的合同归 Goals，顺带拆开事件事实的接口（T-112）

状态：两个 PR（2026-10-29，Claude（设备 A））。第一个，BL-781（第 1 节）：PR #1516 已合入 main（e75051931）；第二个，合同搬进 Goals 插件并改入口（第 2 节，分支 `task/T112b-ca`）：已合 main，开 PR 待验证与二审。方案与裁定在 #1332（【方案 T-112】、【王一骏裁定 T-112】，选 A）。

## 1. BL-781：`GoalEventFactsApi` 拆成事实、状态、意图

`GoalEventFacts`（`plugins/native/goals/src/module/event-facts.ts`）原来对合同 `GoalEventFactsApi` 的 29 个方法每个转发一次：十二个到 `GoalEventConfiguration`、`GoalEventReporting`、`GoalEventReads` 的事实方法，十二个到 `GoalEventState` 的状态方法，三个到 `GoalEventIntent` 的意图方法，另有两个自己做的（`isEventStateOwner`、`runImmediate`）。后十五个只是转发。

| 接口 | 方法 | 实现 |
| --- | --- | --- |
| `GoalEventFactsApi`（合同，留在 `modules/goals`） | `configure`、`configureRequested`、`report`、`readConfig`、`listEvents`、`listLatestEvents`、`listLatestTimeline`、`listLatestReports`、`readEvent`、`readCurrentRequirements`、`readIntentSourceKind`、`readObservedEventCursor`、`isEventStateOwner`、`runImmediate`，加成员 `state`、`intent` | `GoalEventFacts`，只装配 |
| `GoalEventStateApi`（新） | `readWorkState`、`adoptOwner`、`recordNote`、`recordProgress`、`readProgressReceipt`、`applyConcern`、`requestDecision`、`citeDecision`、`recordTrustedDecision`、`setAgreement`、`submitClosure`、`resumeWork` | `GoalEventState implements GoalEventStateApi` |
| `GoalEventIntentApi`（新） | `replay`、`remember`、`recordArtifacts`（原 `replayIntent`、`rememberIntent`、`recordIntentArtifacts`，方法在 `GoalEventIntent` 里本来就叫这个名字） | `GoalEventIntent implements GoalEventIntentApi` |

选了「状态」「意图」两个接口，没有把意图三个并进状态：它们记的是 createIntent 这一个动作的幂等回放和它留下的东西，与 Goal 的工作状态不是一回事，`GoalEventIntent` 也早就是单独的类。`isEventStateOwner` 留在事实接口里，因为它先拒绝不存在的 Goal（`requireGoal`），那一步是门面的，状态类自己没有。

- `GoalEventFacts` 的 `state`、`intent` 原来是私有字段，现在是公开的只读成员，类型是合同的 `GoalEventStateApi`、`GoalEventIntentApi`；具体的 `GoalEventState`、`GoalEventIntent` 留在私有字段里，门面外拿不到合同之外的方法（#1516 二审建议 3，在第二本里改）；门面从 29 个合同方法降到 14 个，加私有的 `readCompletionContext`，不再是巨大单元，`tooling/gates/giant-exceptions.json` 里的登记删掉（门禁说它「不再是巨大单元」）。
- 调用方：只有 `goal-event-application.ts`（`GoalEventApplication`，Goals 自己的应用层）里 15 处 `this.ports.events.X` 改成 `.state.X`、`.intent.replay` 一类；`createGoalReadServices`（Goals 包导出、只有测试 `goals-query-module` 在用的只读装配；宿主自 S12 起不再持有它，`tests/goals-host-no-direct-reads.test.ts` 钉着）把 `readWorkState` 挪到 `events.state` 下。`app.goalEvents` 是应用层，方法名与状态方法同名，**不改**。
- 测试：`tests/goal-events.test.ts` 里 6 处 `data.module.events.X` 改经 `.state`。
- 不改：动作 id、版本、权限、输入输出 schema、Manifest、库结构；`tooling/gates/actions/` 没有差异。

## 2. 合同搬进 Goals 插件

15 个合同文件（`modules/goals.ts`、`goal-*.ts` 十三个、`governance-collaboration.ts`；合计 16 个 `.ts`）用 `git mv` 搬到 `plugins/native/goals/src/contract/`，`index.ts` 汇总 `goals`、`goal-actions`（它转出 `goal-entry-actions` 与各 schema 文件）和 `governance-collaboration`；Goals 包的 `package.json` 新增 `./contract` 出口，平台合同的 `package.json` 删去 `./modules/goals`、`./modules/goal-actions`、`./modules/governance-collaboration` 三个出口，`pnpm api:update` 删去对应的三份 API 快照。搬走的文件对平台合同的引用改成包名子路径（`platform/actions`、`platform/package`、`services/agent-inputs`、`modules/artifacts`）。两个没有使用方的描述符（`modulesGoalsContract` 一类）没有带走。不留转发层。

Goals 包内 136 个文件的 193 处引用改成指向 `contract/` 的相对路径；测试 43 个文件加 4 个夹具改经 `@molis-ai/molis-work-plugin-goals/contract`。

**入口怎么调 Goals（王一骏选 A）：按动作 id 调用，用到的字段就地声明；MCP 的描述与字段从宿主自带的 Goals 定义读（与登记进动作目录的是同一份，提供方按 BL-501 固定），不查运行时目录。**

| 使用方 | 改成 |
| --- | --- |
| CLI（`apps/cli/src/command-dispatch.ts`） | 本地表 `GOALS`（七个动作的 id 与版本）；`CliManagementActions.invoke(reference, input, evidence?)` 收引用。不 import 任何 Goals 合同 |
| MCP（`apps/mcp`） | `tool-dispatch.ts` 的 `MANAGEMENT_GOAL_ACTIONS`（三个动作的 id 与版本）；`goal-tools.ts` 成了构造器 `managementGoalTools(read)`，`tool-catalog.ts` 的 `platformMcpTools(read)` 把它和连接工具合成目录；`goal-event-tools.ts` 删除。端口 `McpManagementActions` 多一个 `fields(reference)`，事件决定工具只收该动作声明的业务字段加传输的项目与数据库 |
| 宿主（`apps/local-host`） | `goal-callers.ts` 是宿主里唯一取 Goals 动作描述符的文件：导出 `goalsHostActions`（initialize、create、guidanceRead、directoryItem、list、state，带类型）、`readGoalResumeFacts`、`ProjectGuidanceFacts`、`GoalsActionReference`、`requireManagementDefinition`、`managementInputFields`；`bindGoalsManagementActions` 与常驻客户端按引用调用并先用该动作自己的输入 schema 校验。新增 `mcp-platform-tools.ts`：按引用从宿主自带的 Goals 定义读出三个 Goals 动作，调 `platformMcpTools` 得 `MCP_TOOLS`（`apps/desktop/launchers/mcp/server.ts` 与 MCP 目录、启动前校验都取它）。其余宿主文件经 `goal-callers.ts`；`web-planning.ts` 取规划方法的类型 |
| 工作台（`apps/workbench`） | 已点名 Goals 包的文件取 `/contract` 的类型；其余声明本地最小类型 |
| Coding | 新 `goals-actions.ts`：`GOALS_ACTIONS` 五个句柄（id、版本、读或写、`goals:read` 或 `goals:write`）和本地字段类型；检查输入、受众和权限的仍是 Goals 注册的动作 |
| Feed | `goal-promotion.ts` 的本地表 `GOALS`（`goals.directory.read@1`、`goals.create@1`、`goals.inputs.confirm@1`），经已有的 `directory.invoke(reference, …)` |
| `server/src/continuity` | 本地类型 `GoalStateFacts`、`GoalProgressFacts` |

### 门禁 PG-031 的改动（要评审的一处）

`checkGoalTransportCallers`（`scripts/check-package-boundaries.mjs`）原来写死「CLI 与 MCP 分发器只能从平台合同的 `modules/goal-actions` 取 `goalEntryActions`」。现在写成**入口不许碰任何 Goals 合同**，比原来更严：

- 新增 `entries`：`apps/cli/src` 与 `apps/mcp/src` 的每个文件，任何语法的引用（`import`、`export … from`、`import()`、`require()`、import 类型）指向 Goals 包（含 `/contract`）、Goals 源码路径或平台合同的旧三个子路径，都拒绝。入口文件按 `ENTRY_SOURCE_FILE`（`scripts/check-package-boundaries.mjs`）认 `.ts`、`.tsx`、`.js`、`.jsx`、`.mts`、`.cts`、`.cjs`、`.mjs`。
- CLI 分发器只许引用 `platform/actions` 与 `./protocol.js`，MCP 分发器只许引用 `platform/actions` 与 `./goal-presentation.js`；每个 `invoke` 的第一个参数必须是自己声明的表（`GOALS`、`MANAGEMENT_GOAL_ACTIONS`）的一项，表要在文件里声明，要求的调用（CLI 的 `GOALS.snapshot`，MCP 的 `initialize`、`decide`、`treeDecide`）都在。
- 宿主那一半（`checkGoalsManagementWiring`，`cli-project.ts` 与 `mcp-v1-tool.ts` 的装配）不变；因此事件决定的字段表不放进分发调用的选项里，而是放在宿主造的端口上（`fields`），那条调用文本一个字没变。

先红：当时（T-112 第二本合入时）同一批新用例在旧门禁上 5 个失败（`t112b-gate-red`），换上新门禁后 10 个全过（RAC-1774 加上原有用例按新表名改写）；之后该测试文件继续增加用例（T-259 #1547 之后是 11 个），不再拿总数代表现状。

### 对 MCP、CLI 工具生成的影响

- MCP 管理工具的名字、顺序、描述和输入字段与搬之前相同（RAC-1773 钉死），只是数据来源从 MCP 包编译期 import 平台合同，变成宿主按引用读它自带的 Goals 定义（与登记进动作目录的是同一份；不查运行时目录，所以 Home 没打开时也有，`mcp-start-preflight.ts` 的启动前校验照旧）；`MCP_TOOLS` 不再从 `@molis-ai/molis-work-app-mcp` 导出，改从 `@molis-ai/molis-work-app-local-host` 导出。静态启动前校验（`assertMcpStartInput`）同样用宿主的 `MCP_TOOLS`。
- 管理端事件决定工具对「运行时调用者夹带多余字段」的拒绝顺序：先判管理权限、再判字段。管理入口的行为不变；运行时受众原来先得到 `mcp.unexpected_field`，现在先得到 `mcp.authority_denied`，都是拒绝。
- CLI 的命令与输出不变（它原来读描述符只为调用）。
- 动作目录与动作合同快照 `tooling/gates/actions/` 没有差异。

## 3. 验收

| 编号 | 可观察结果与证明 |
| --- | --- |
| RAC-1772 | `GoalEventFactsApi`、`GoalEventStateApi`、`GoalEventIntentApi` 的键与上表逐项相等，`GoalEventFactsApi` 与 `GoalEventFacts` 的 `state`、`intent` 的类型就是 `GoalEventStateApi`、`GoalEventIntentApi`（不是具体类），`GoalEventFacts` 可以赋给 `GoalEventFactsApi`（调 TypeScript 在构建出的 `.d.ts` 上做类型检查，不靠运行器）；`GoalEventFacts.prototype` 上只有事实方法和 `readCompletionContext`，那 15 个转发方法没有了（`tests/goals-contract-ownership.test.ts`） |
| RAC-1770 | `@molis-ai/molis-work-plugin-goals/contract` 的运行时导出名单（100 项）与取值不变：`goalPluginActions` 五项、`goalEntryActions` 十二项的 id、版本、读写，`goalEventWorkStatuses`、`goalIntentSourceKinds`、`goalRelationTypes`；平台合同的 `package.json` 不再有 `modules/goals`、`modules/goal-actions`、`modules/governance-collaboration` 出口，按包名导入得 `ERR_PACKAGE_PATH_NOT_EXPORTED`，`packages/contracts/src/modules` 里没有 `goal*`、`governance*` 文件（`tests/goals-contract-ownership.test.ts`） |
| RAC-1771 | 除 Goals 自己的包和 `tooling/`，`apps`、`packages`、`plugins`、`server`、`horizontal`、`services`、`scripts` 里没有一个已跟踪的源文件写着旧三个子路径；CLI、MCP、Coding、Feed、`server/src` 的源文件不点名 Goals 包或它的源码路径（同上） |
| RAC-1773 | CLI 的 `GOALS`（七项）、Feed 的 `GOALS`（三项）、MCP 的 `MANAGEMENT_GOAL_ACTIONS`（三项）与 Goals 注册的 `goalEntryActions` 同名项的 id 和版本逐项相等；Coding 的 `GOALS_ACTIONS` 五项与 `goalPluginActions` 的 id、版本、读写、kind、scope、权限相等；`MCP_TOOLS` 的名字与顺序、三个管理工具的描述（手写的搬前原文）、业务字段与 required 与 Goals 登记的定义一致（同上；动作快照另由 `tests/action-contract-snapshot.test.ts` 钉住无差异） |
| RAC-1774 | 门禁拒绝旧写法：入口任一文件引用 Goals 包、`/contract`、Goals 源码路径或旧三个子路径（十种语法，CLI 与 MCP 各一个文件），拒绝旧的分发器形态（从 `goal-actions` 取 `goalEntryActions`，没有本地表），拒绝不是表项的 `invoke`；入口文件按 `ENTRY_SOURCE_FILE` 扫 `.ts/.mts/.cts/.tsx/.js/.mjs/.cjs/.jsx`，一个 `.mjs` 里的 Goals 引用被拒，`checkGoalTransportCallers` 不给 `entries` 时抛 `TypeError` 而不是通过；注释和字符串里的名字、`platform/actions` 的引用不算（`tests/goals-query-boundaries.test.mjs`） |
