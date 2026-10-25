# PG-031 另一半：平台入口不再从 Goals 插件包 import 动作

状态：已合入 main（#1218，随批 PR #1224，`112114f23`，2026-10-24，防腐线 ac-kernel）。统筹 10-24 裁定用 contracts 描述符、不走目录查找（第 2 节「裁定」）。做的是 `privileges.md` PG-031 里「CLI 和 MCP 经动作目录调用，去掉 import」那一半；Goals 管理调用的提供方那一半是 BL-501（#1207，已随 batch-28 合入）。代码按 main `9ed0e7a5c` 核过。

## 1. 要解决的

平台的几个入口直接 import `@molis-ai/molis-work-plugin-goals`，从插件实现里取动作描述符：

| 文件 | 用到的 `goalsActions` |
| --- | --- |
| `apps/cli/src/command-dispatch.ts` | initialize、treeSubmit、treeRead、treeCheck、treeDecide、active、snapshot（只调用） |
| `apps/mcp/src/tool-dispatch.ts` | initialize、decide、treeDecide；还读 `decide` 的输入 schema 字段名 |
| `apps/mcp/src/goal-tools.ts` | initialize、treeDecide 的说明与输入 schema（静态工具表） |
| `apps/mcp/src/goal-event-tools.ts` | decide 的说明与输入 schema（静态工具表） |
| `apps/local-host/src/mcp-server.ts` | guidanceRead，加上插件里的 `readGoalResumeFacts` |
| `apps/local-host/src/web-onboarding.ts` | create |
| `apps/local-host/src/content-action-providers.ts` | contract，外加 `import("…plugin-goals").GoalContractView` 类型断言 |
| `apps/local-host/src/feed-goal-promotion.ts` | create、directoryItem、inputsConfirm |
| `apps/local-host/src/project-arrival-http.ts` | list、guidanceRead、state |

插件同等待遇（2026-10-18）之后，平台调某个插件的动作只该经公开合同或共同目录，不该依赖它的实现包。门禁 `scripts/gates/assembly.mjs` 的 `goals#outside-files` 现在是 45。

## 2. 做法

**选 contracts 里公开的描述符，不在运行时查目录。** 理由：

- 管理 MCP 的工具表是静态的，列工具时还没有调用上下文，要的是说明和输入 schema，不只是 id；
- 每次调用前先查目录，多一次读，取消也要多管一段（batch-28 的红就出在这里，见 BL-501 spec）；
- 已有先例：`packages/contracts/src/modules/goal-actions.ts` 的 `goalPluginActions`（list、contract、state、progress、receipt）就是插件与 Coding 共用、插件自己再引用的那份；schema 和 `goalAction` 也早已在 contracts。

具体：

0. **`goalAction` 挪进叶子文件** `packages/contracts/src/modules/goal-action-definition.ts`，由 `goal-actions.ts` 原名转出（公开 API 不变）。这样新文件取它不会和 `goal-actions.ts` 互相 import。
1. **contracts 新增一组描述符** `goalEntryActions`，放在新文件 `packages/contracts/src/modules/goal-entry-actions.ts`，由 `modules/goal-actions` 这个 subpath `export *` 出去（不新开 subpath）。收平台入口要用、现在只在插件里的 12 个：initialize、treeSubmit、treeRead、treeCheck、treeDecide、active、snapshot、decide、guidanceRead、create、directoryItem、inputsConfirm。描述符原样搬，`capability_id`、`version`、说明、schema、`audiences`、`permissions`、`intake`、`result_view` 一字不改，所以动作合同快照不变。
2. **随描述符搬进 contracts 的类型与数据**（都是纯声明）：
   - `InitializeBoardOutput`（`board-actions.ts`）；`GoalCreateActionInput`（`actions.ts`，本是 contracts 类型的 `Omit`）；`GoalDecisionActionInput`（`decision-action.ts`，同上）；
   - 结构提案：`GoalTreeProposalListQuery`、`GoalTreeProposalListResult`（`goal-tree-contract.ts`），并入 contracts `governance-collaboration`，那里已有提交、检查、决定的输入与结果；树动作的输入输出改成直接写这些类型，不再从插件的 `GoalTreeApplicationApi` 推出；
   - `GoalConfirmedInput` 与 `goals.inputs.confirm` 的两个局部 schema（`input-actions.ts`）；
   - `GOALS_TREE_INTAKE`、`GOALS_TREE_SUBMIT_RESULT`（`tree-intake.ts`，纯数据，属于 `goals.tree.submit` 的描述符）。
3. **插件改成引用这份**：`goalsActions` 里这 12 项写成 `goalEntryActions.X`，和现在 `contract: goalPluginActions.contract` 一个写法；处理器、可用性、授权检查都留在插件。插件原来导出的同名类型改成从 contracts 转出，插件内部用法不变。
4. **`readGoalResumeFacts` 搬进 contracts**（放在 `goal-actions.ts`，`goalPluginActions` 旁边）：它是 12 行、只经调用者的 `invoke` 读 list 与 directoryItem 的纯函数，符合 contracts「无副作用的小 helper」（`contracts-purity` 的 20 行线以内、没有 effects）。插件不再导出它；两份测试改从 contracts 取。
5. **平台入口改从 contracts 取**：表里 9 个文件把 import 换成 `@molis-ai/molis-work-contracts/modules/goal-actions`；`content-action-providers.ts` 用 `goalPluginActions.contract`，类型断言随之删掉。`apps/cli`、`apps/mcp` 的 `package.json` 去掉对 Goals 插件的依赖，两份 README 的依赖句跟着改。
6. **不改调用方式**：描述符只给 `capability_id@version`、说明与 schema，不带提供方；调用照旧经 `LocalHost` 的动作网关分发。CLI 与管理 MCP 仍经 `bindGoalsManagementActions`，按 #1207 精确钉随宿主发布的 Goals（`allowed_actions` 不放宽，第三方提供方由分发器拒）；其余几个入口（引导、Feed 升格、到达页、Feed 关联上下文、MCP 上下文）用的客户端和授权也原样不动，本片既不给它们新加钉、也不放宽。放宽钉死等 ac-trust 的同意清单（R-45）。分发之前不加任何查目录或别的会被取消的步骤，取消与拒绝照旧走中央结算、只留「未执行」行（batch-28 那次红的教训）。

**裁定**（统筹 10-24）：用 contracts 描述符 `goalEntryActions`，放 `modules/goal-actions` 子路径，不走目录查找。理由：有 `goalPluginActions` 的先例；MCP 工具要静态 schema；分发前不留会因取消而抛错的步骤。约束：①见第 6 步；②`readGoalResumeFacts` 守合同包规则（无副作用、无模块级可变状态、函数不到 20 行）；③改合同要跑 `pnpm api:update`，PR 里写对调用方的影响；属于共享核心，进集成批跑全量（统筹起）。

## 3. 不在本片

- **Goals 自己的宿主页面与桥**：`goals-actions.ts`（处理器装配、Manifest、权限、授权构造）、`goal-project-application.ts`、`personal-planning-actions.ts`、`project-database.ts`、`web-goals-read.ts`、`web-panel.ts`、`web-planning.ts`、`web-request.ts`、`web-view.ts`。它们用的是插件的应用、路由、Manifest 与页面模型，不只是描述符；随 Goals 迁到 Plugin Runtime（S9）一起走，本片动它们只会造一份临时转接。`apps/local-host/package.json` 因此仍依赖 Goals 插件。
- 工作台（`apps/workbench`）引 Goals 的客户端脚本和样式，不在 PG-031。
- 管理 MCP 的 Goals 工具仍是手写的静态表（读描述符的说明与 schema）。改成从共同目录生成是另一件事，记为后续，不在本片。
- 不改动作、Manifest、版本，不用新的 S 号，不加兼容或迁移逻辑。

## 4. 合同影响

- contracts 的 `modules/goal-actions` 公开 API 变大（新增 `goalEntryActions`、`readGoalResumeFacts` 与第 2 步的类型），`modules/governance-collaboration` 多两个类型：跑 `pnpm api:update` 提交快照，PR 里按 `docs/system/CONTRACT-CHANGES.md` 写影响。对插件作者是只增不减；Goals 插件包少导出 `readGoalResumeFacts`，仓库里只有两份测试用它。
- 动作合同快照（`tooling/gates/actions/`）不应变化；变了就是搬错了，以此核对。
- 改到 contracts，按共享核心算，`full`：需要。

## 5. 门禁预期

- `goals#outside-files`：实测 45 → 33（`apps/cli`、`apps/mcp` 的源文件与 `package.json`，`apps/local-host` 的 5 个源文件，`scripts/workspace-packages.mjs` 里两个应用的依赖登记，两份测试改从 contracts 取 `readGoalResumeFacts`）。
- 不加巨大单元；新文件 `goal-entry-actions.ts` 估计 60～80 行，没有 20 行以上的函数、没有可变状态。
- `as unknown as`、空 `catch` 不增；`content-action-providers.ts` 少一处类型断言。

## 5a. 跟着改的门禁规则

`scripts/check-package-boundaries.mjs` 的 `checkGoalTransportCallers` 原先写死「CLI 与管理 MCP 只从 Goals 插件包取 `goalsActions`」。规则的意思不变、严格程度不变，只把来源换成 contracts 的 `modules/goal-actions` 与 `goalEntryActions`：仍只许取这一个名字，`invoke` 仍必须点名 `goalEntryActions.<动作>`，管理 MCP 仍必须调 initialize、decide、treeDecide；Goals 插件包本身成了被拒的来源。突变用例 `tests/goals-query-boundaries.test.mjs` 同步改，并补「从插件包 import 被拒」两例。`scripts/workspace-packages.mjs` 去掉两个应用对 Goals 插件的依赖登记（与 `package.json` 一致）。

## 6. 验收

- **RAC-343**：`apps/cli/src`、`apps/mcp/src` 和第 1 节表里 local-host 的 5 个文件不再 import Goals 插件包；`apps/cli`、`apps/mcp` 的 `package.json` 不再依赖它。证明：`goals#outside-files` 下降（45 → 33），`checkGoalTransportCallers` 把插件包当作被拒的来源（`tests/goals-query-boundaries.test.mjs` 的突变用例）。
- **RAC-344**：插件的 `goalsActions` 与 contracts 的 `goalEntryActions`、`goalPluginActions` 中同名项是同一个对象，插件不另写一份。测试逐项断言 `===`，放在 `tests/goals-command-actions.test.ts`。
- **RAC-345**：管理 MCP 的 Goals 工具（initialize、goal_tree_decide、event_decide）说明与输入字段和 Goals 登记的同一动作一致（`tests/mcp-action-catalog.test.ts`）。
- 动作合同快照不变，`pnpm test:contracts` 照过。

## 7. 本机要跑的（实现时）

`pnpm build`、`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`、`pnpm api:update` 后的 `git diff tooling/gates/api`、`pnpm test:contracts`、`pnpm secrets:check`；非浏览器用例：goals-command-actions、goals-query-actions、runtime-context-entry、cli-goals-actions、cli-protocol、command-entry-chain、onboarding-goals-actions、feed-promote-mcp、goal-read-entry、goal-management-identity、goal-events-state、project-arrival-http、project-arrival。全量由统筹在集成批跑。
