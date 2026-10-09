# 完成确认与管理入口身份

状态：待验收（2026-10-08）。2026-10-07 在旧 main（d81b12cb）上做成，2026-10-08 重做到 main 1d891c8b 之上并重新验证；与旧版的差异见文末「合入主线时的调整」。评审后补了 typed 入口对插件的边界和结构提案检查的输入类型，见文末「评审后的补充」。再次评审后补了完成确认的回归测试，见文末「第二次评审后的补充」。第三次评审指出授权完成的决定放行得太久，按用户 2026-10-08 的决定改成只对当时的约定和那一轮工作有效，见文末「第三次评审后的补充」。

## 背景

三处行为跟界面或工具说明不一致。

1. 项目规则「完成前必须你点头」能保存、也能在界面上看到，但收尾时写死了不需要人工验收。单条要求上的「需要用户验收」是另一件事，它已经会拦住完成。
2. CLI 和有类型的 Host 客户端走管理入口。这个入口没有调用者身份，却把参数里的 `actor_id` / `actor_kind` 当成操作者。冒充用户就能跳过「Runtime 改约定必须引用用户决定」。
3. 管理 MCP 工具 `molis_work_v1_event_decide` 的 schema 把 `actor_id` 列为必填，处理函数却把这个字段当成不允许的参数。按 schema 调用一定失败。

## 目标

- 项目规则解析出的 `human_approval` 进入现有完成检查。打开时，完成前要有仍然有效的可信用户结论：某条要求上已接受且仍然成立的用户结论，或当前决定授权了 `complete`。点「完成」的人是用户，本身不算这条结论。
- 授权 `complete` 的决定只对做出它时的约定和那一轮工作有效：约定变了，或 Goal 被继续、重新打开之后，更早的授权不再算，要重新授权（用户 2026-10-08 的决定，见文末）。某条要求上的接受结论仍按原来的规则。
- 管理入口的写入固定记本机这个人（`web-user`），参数里带 `actor_id` 或 `actor_kind` 就拒绝。范围：创建意图、配置、报告、约定、收尾、继续、便笺、设当前目标、结构提案检查，以及同一扇门上的进展、问题、请求决定、引用决定。
- 决策工具的公开 schema 不再包含 `actor_id`。处理函数继续不接受这个字段，并仍以本机这个人记录决定。
- 管理入口的 typed 入口只给 Host 自己的调用方：声明 `host_only`，插件即使在 Manifest 的 `capabilities.consumes` 里列出也被拒绝，不会被记成本机这个人。
- 这些入口的输入类型不含 `actor_id`、`actor_kind`，按类型写的调用不会被宿主拒绝。结构提案检查的领域输入保持原样，管理入口另有自己的输入类型。

## 不做

- 不改动作目录那条路的身份。Web 和 Runtime 仍从调用上下文取操作者；Runtime 改约定仍要引用用户决定。
- 不把「点完成的人」当成验收。
- 不恢复风险阻塞完成。风险存储已在 2026-10-05 去掉。
- 不改回执查询、项目引导、规划保存、结构提案提交。这些不在这扇门里。
- 领域方法和动作处理函数仍从调用上下文拿 `actor_id`。管理入口不再替它们转发参数里的身份。

## 行为

- 没开项目规则时，完成检查与现在相同。单条要求的「需要用户验收」继续单独生效。
- 开了规则、要求本身不需要逐条验收、工作事实已经支持结果时，收尾回执 `completion_applied` 为 false，原因是 `event_closure.human_approval_required`。随后一条授权 `complete` 的可信用户决定可以让完成成立。
- 授权 `complete` 的决定记下整份约定的承诺：结果说明，和当时每一条要求的原文、是否需要用户验收、绑定的事件类型。收尾时它的承诺要和现在的约定逐字相同才放行：结果被改写，要求被新增、改写、退休，要求的验收标志或绑定的事件类型变了，都要重新授权。范围里还点了要求的授权同样记整份约定；复用它（引用决定）时仍只看范围点到的要求。
- 授权只在它做出的那一轮工作里有效。Goal 被继续（从已完成或已取消），或被后来的事实重新打开之后，更早做出的授权不再放行，要重新授权；完成之后、继续之前记下的授权也属于已经结束的那一轮。没放行的收尾（被别的原因挡住）不会用掉授权。
- 改动前记下的授权完成的决定没有记整份约定（只针对动作的，承诺里只有结果说明；范围里点了要求的，只有点到的那几条），比不上现在的约定，不再放行，要重新授权。
- 某条要求上已接受的用户结论这一支这次不动，仍按原来的规则（要求被改写、退休或之后被拒绝，它就不算）；这次的决定只管授权 `complete` 的决定。
- 管理入口不带身份字段时，写入的 `actor_id` 是本机这个人，`actor_kind` 是 `user`。同一条幂等键只在这个人身上重放。
- 管理入口带了 `actor_id` 或 `actor_kind` 时，返回 `actions.input_invalid`，不写入。先核对是不是当前项目，项目不对仍是 `actions.scope_mismatch`。
- CLI 的 `active-goal` 不再转发 JSON 里的 `actor_id`。旧脚本多写这个字段也不会被当成别人。直接调用能力时如果字段还在，宿主拒绝。
- 结构提案检查的参数里如果带了身份，宿主拒绝。检查记录记在本机这个人身上，不重放 Runtime 那次检查。
- Coding 记录进展时不再自报身份：插件调用取自己调用上下文里的人（主线 c1fae739 已做），不带调用上下文的直接调用走管理入口、记本机这个人，两者的参数里带 `actor_id` 或 `actor_kind` 都拒绝。回执查询不变：插件取调用上下文，直接调用仍点名要查的人。
- `molis_work_v1_event_decide` 的 properties 和 required 都没有 `actor_id`。
- 插件调用管理入口上的 typed 写入（十一项事件写入、设当前目标、结构提案检查），不论 Manifest 里是否列出，都返回 `actions.host_only`，不写入；插件拿到定义的副本去掉 `host_only` 也一样。事件用户决定、结构提案决定、初始化本来就是 `host_only`。`goals.progress.record.v1` 不在其中，它仍对插件开放，身份取自调用上下文。
- 结构提案检查的 typed 输入类型 `GoalTreeCheckEntryInput` 不含 `actor_id`；领域输入 `GoalTreeProposalCheckInput` 保持原样，由动作处理函数从调用上下文补上操作者。

## 验收

- `tests/goal-events-state.test.ts` 覆盖项目规则拦住完成、以及授权完成的用户决定放行；点「完成」的人不算这条结论，不论是 Runtime 还是用户（管理入口把收尾记成本机这个人，也是用户）；某条要求上已接受且仍然成立的用户结论同样放行，要求改写之后、或之后被拒绝的结论不放行。
- `tests/goal-events-state.test.ts` 还覆盖授权完成的决定只对当时的约定和那一轮工作有效：Goal 完成后又被继续、取消后又被继续、被后来的事实重新打开，更早的授权（包括完成之后继续之前记下的）都不再放行，新一轮里重新授权后放行、且随那一轮用掉；运行时新增一条要求、用户改写一条要求、改写结果说明、退休一条要求、给要求绑定事件类型，更早的授权都不再放行，对现在的约定重新授权后放行；范围里还点了要求的授权同样按整份约定算，引用它只看点到的要求；授权记下的是整份约定的承诺；授权之后的便笺、被别的原因挡住的收尾不影响授权，约定没变时放行。
- 管理入口测试改为：不带身份时记本机这个人并自我重放；带身份时拒绝；动作客户端仍记录 Runtime 并自我重放。跨入口用同一个幂等键互相重放的旧断言删掉，不放宽成「谁调用都算同一个人」。
- 决策工具测试继续证明：带 `actor_id` 被拒绝，不带时决定者是本机这个人。
- `tests/goal-management-identity.test.ts` 逐个覆盖管理入口：带 `actor_id` 或 `actor_kind` 都是 `actions.input_invalid` 且不写入，项目不对仍是 `actions.scope_mismatch`，不带身份时记本机这个人。
- `tests/mcp-action-catalog.test.ts` 证明决策工具的 properties 和 required 都没有 `actor_id`；`tests/goal-read-entry.test.ts` 证明 CLI 的 `active-goal` 不转发 JSON 里的 `actor_id`。
- `tests/goal-management-identity.test.ts` 还证明：这十三项入口在插件的 Manifest 里列出也被 `actions.host_only` 拒绝（用插件客户端、去掉标记的定义副本、带插件调用上下文的调用三种方式），拒绝后不留记录；同样的参数从 Host 自己的客户端调用，记本机这个人；`goals.progress.record.v1` 仍对插件开放。同文件里有一项类型检查：用已构建的类型声明编译一小段调用，十三项入口的输入类型都不含 `actor_id`、`actor_kind`，结构提案检查不带 `actor_id` 可以通过编译、带了不能。这两项测试都是从 Goals 插件的导出里读出所有事件写入的 typed 入口再检查，不靠手写名单：之后新增的写入没有 `host_only`、没登记进逐个覆盖的表、或输入类型带身份，测试就失败。
- `tests/goal-management-identity.test.ts` 还证明：项目规则打开时，管理入口的完成（记在本机这个人名下，`user`）、Web 的完成按钮、Runtime 的收尾都被 `event_closure.human_approval_required` 拦住，没开规则时同一扇管理入口可以完成；同一扇管理入口记录的授权完成的决定、Web 记录的某条要求上的接受结论，各自让完成成立。

验证：

```text
node scripts/run-tests.mjs tests/goal-events-state.test.ts tests/goals-actions.test.ts tests/goals-command-actions.test.ts tests/goals-mcp-actions.test.ts tests/goals-lifecycle-actions.test.ts tests/goals-tree-actions.test.ts tests/local-host.test.ts tests/host-entry-consistency.test.ts tests/goal-read-entry.test.ts tests/home-backup-recovery.test.ts tests/mcp-goal-events-state.test.ts tests/mcp-action-catalog.test.ts tests/coding-goal-context-http.test.ts tests/proposal-entry-chain.test.ts tests/casebook-interaction.test.ts tests/casebook-current-host.test.ts tests/casebook-operation-receipts.test.ts tests/project-policy-save.test.ts tests/goal-progress-plugin-identity.test.ts tests/goal-management-identity.test.ts tests/goals-board-actions.test.ts tests/goals-decision-actions.test.ts tests/plugin-capability-availability.test.ts tests/plugin-host-executor.test.ts
```

## 合入主线时的调整（2026-10-08）

旧版在 d81b12cb 上做成；main 之后有 c1fae739（`goals.progress.*` 的插件身份），按本规格的意图取舍如下。

- 主线已经做了的，丢掉旧版的对应改动：Coding 的进展路由（`plugins/native/coding/src/routes.ts`）不再带 `actor_id`、`actor_kind`，回执查询也不再带 `actor_id`。
- 合并处理：`goals.progress.record.v1` 对插件调用仍取调用上下文的身份（主线）；对其余调用方（CLI、typed Host 客户端、测试）是管理入口，记本机这个人，参数里带身份拒绝。输入类型去掉 `& GoalProgressActor`，这是 contracts 公开 API 快照里唯一的变化（`tooling/gates/api/contracts/modules/goals.txt`）；Goals 插件导出的 typed 入口（`@molis-ai/molis-work-plugin-goals`，不在快照里）的输入类型也都去掉了 `actor_id`、`actor_kind`。`goals.progress.receipt.v1` 不变。
- 旧版删掉的跨入口重放断言（本规格明确允许）：`tests/goals-actions.test.ts`（typed 创建重放动作客户端那一次）、`tests/goals-command-actions.test.ts`（动作客户端重放 typed 的报告与进展）、`tests/local-host.test.ts`（工作台客户端重放 MCP 创建的 Goal）、`tests/goals-tree-actions.test.ts`（typed 检查返回 Runtime 那次检查的结果）、`tests/proposal-entry-chain.test.ts`（Runtime 的结构检查重放 CLI 的检查）。每处都换成两件事：管理入口自己重放自己，动作客户端自己重放自己。`tests/goals-actions.test.ts` 的便笺与旧身份用例、`tests/goals-mcp-actions.test.ts` 的迁移前历史，改由动作客户端写入（管理入口不能再以 Runtime 或旧身份写）；它们的断言本身不变。
- 原先记下的缺口（`GoalTreeProposalCheckInput` 仍要求 `actor_id`，类型与宿主的拒绝不一致）已在评审后补上，见下节。

## 评审后的补充（2026-10-08）

评审指出两处，都已处理。

- 插件够得到管理入口。这些 typed 入口原先不是 `host_only`，`createPluginCapabilityClient` 放行 Manifest 的 `consumes` 里列出的任何能力，宿主又对每个调用方都记本机这个人，所以列出一项的插件，调用会被记成 `web-user`、`user`、出处 management。仓库里没有插件列出过它们，但这条路是通的，且比改动前更像冒充。处理：十一项事件写入、`setActiveGoalCapability`、`goalTreeCapabilities.checkGoalTreeProposal` 声明 `host_only`，沿用事件用户决定、结构提案决定、初始化已有的做法，不另写插件名单；宿主的入口和 Host 自己的客户端（CLI、管理 MCP、Web 创建入口）调用不受影响。没有选「给插件它调用上下文里的身份」：这些入口是管理入口，没有为插件开放的理由，插件要写进展已有 `goals.progress.record.v1`。
- 结构提案检查的类型与宿主不一致。`GoalTreeProposalCheckInput` 仍要求 `actor_id`，按类型写的调用必被拒绝；只有 CLI 在用，它传原始 JSON 所以没暴露。处理：在 Goals 插件里把管理入口的输入类型分出来（`GoalTreeCheckEntryInput`，`GoalTreeEntryApi`），`goalTreeCapabilities.checkGoalTreeProposal` 与 `createGoalProposalClients().goalTree` 改用它；领域输入、动作处理函数和 contracts 的公开 API 快照都不动。CLI 的 `createCliGoalTreeHandlers` 改收 `GoalTreeEntryApi`。

没有动的：项目引导的新增与修改、规划保存、结构提案提交（本规格「不做」）仍把参数里的 `actor_id` 当作者，插件在 Manifest 里列出它们仍能调用；它们不是记本机这个人的管理入口，要不要同样挡住，另行决定。`createGoalCapability` 有定义和导出，但宿主没有注册，调用不到。

验证补充：最初写成的两项新测试在改动前的实现（c042bd0d）上失败，失败信息分别是「入口对插件可用」（插件以 `web-user`、`user` 写进了一条便笺）和「检查入口要求 `actor_id`」。最终的整份测试文件在干净的 origin/main（230b1653）上四项失败三项：管理入口的前两项在第一次不带身份的调用上就被 `actions.unauthenticated` 拒绝，类型检查十三项入口全都还带身份；第四项是检查本身的自检，不依赖仓库行为。枚举护栏另用损坏构建产物的办法验证过：去掉一项入口的标记，或加一项没登记的新写入，测试各自失败，并说明该怎么做。

## 第二次评审后的补充（2026-10-09）

评审指出规格写明的两件事没有测试守着：一，点「完成」的人不算验收，管理入口的收尾现在都记成 `web-user`、`user`，这条更要紧；二，某条要求上已接受且仍然成立的用户结论同样放行。原有的那项测试只用 Runtime 的收尾和授权完成的决定走了一遍，把「用户的收尾算验收」或「忽略要求上的结论」放进实现，它照样通过。实现是对的（评审用临时的端到端测试确认过），缺的是测试。

补了三项测试，生产代码没有改：

- `tests/goal-events-state.test.ts` 里点完成的人那一项：用户（本机这个人，两次）、另一位用户、Runtime 逐个收尾，回执都是 `completion_applied` 为 false，原因只有 `event_closure.human_approval_required`；授权完成的决定记下后，同一个人再点一次完成成立。
- 同一文件里要求上的结论那一项：某条要求上已接受的结论放行，且这个 Goal 里没有任何关于 `complete` 的决定；结论之后要求被改写、即使后来的工作重新支持它，旧结论不再算，对改写后的要求再给结论才放行；已接受之后又被拒绝的不放行。
- `tests/goal-management-identity.test.ts` 里管理入口、Web、Runtime 那一项：真实 Host 上，管理入口、Web 动作客户端、Runtime 动作客户端各收尾一次都被拦住，管理入口那一条核对确实记在本机这个人、`user` 名下；同一扇管理入口记录授权完成的决定后完成成立；另一个 Goal 由 Web 记录要求上的接受结论后，Runtime 的收尾成立。没开规则时管理入口的收尾先作为对照成立。

验证：这三项新测试连同原有那项，在干净的 origin/main（11878059）上全部失败。`tests/goal-events-state.test.ts` 的三项（原有那项和两项新测试）失败在规则没有进完成检查：`completion_applied` 为 true、`unmet_reasons` 为空；`tests/goal-management-identity.test.ts` 的那项在第一次不带身份的管理入口调用上就被 `actions.unauthenticated` 拒绝。另在本分支的构建产物上逐项改坏，确认每项测试各自守住了什么（改完都已还原）：

| 改坏的方式 | 原有那项 | 点完成的人 | 要求上的结论 | 管理入口、Web、Runtime |
| --- | --- | --- | --- | --- |
| 规则不进完成检查（最初的缺陷） | 失败 | 失败 | 失败 | 失败 |
| 用户的收尾算验收 | 通过 | 失败 | 通过 | 失败 |
| 忽略要求上的接受结论 | 通过 | 通过 | 失败 | 失败 |
| 不看结论是接受还是拒绝 | 通过 | 通过 | 失败 | 通过 |
| 改写要求之前给的结论仍然算 | 通过 | 通过 | 失败 | 通过 |
| 忽略授权完成的决定 | 失败 | 失败 | 通过 | 失败 |

同时按开发要求（修缺陷时把规矩写进「不变量」，把守住它的测试写进「改动后必跑」）补了 `modules/goals/README.md`：不变量里加了这条规则，必跑列表加上 `tests/goal-events-state.test.ts`。

## 第三次评审后的补充（2026-10-09）

评审用真实 Host 上的临时端到端测试找到一处：项目规则打开时，授权 `complete` 的决定放行得太久。

- 授权、收尾成立、继续、再报告、再收尾：第二次收尾直接成立。授权是给上一轮的，继续之后的新一轮没有人点过头。
- 授权之后，Runtime 新增一条要求（这种变化本来就不需要引用决定），工作又支持了它，再收尾：直接成立。人授权时看到的约定里没有这条要求。

原因是同一个：完成检查取最近一条针对 `complete` 的决定，只看它是不是授权，既不看它是哪一轮做出的，也不比较它记下的承诺和现在的约定。而针对动作的授权（范围里没有点要求）原先记下的承诺只有结果说明、没有要求，拿它去比也比不出要求变了。要求结论那一支对约定的变化已经有处理：要求被改写后，旧结论按支持有效的起点自然失效，原来就有测试。

**用户的决定（2026-10-08，弹窗）**：项目规则「完成前必须你点头」打开时，授权 `complete` 的用户决定只对它做出时的约定和那一轮工作放行；Goal 被继续或重新打开，或约定（承诺）变了之后，旧的授权不再算，要重新点头。

处理（`modules/goals/src`）：

- `snapshotCommitment`（`event-state-authorization.ts`）：针对 `complete` 的决定，承诺记整份约定，结果说明加当时每一条要求。
- `listDecisionsByRound`（`event-state-repository.ts`）：按记录顺序列出这个 Goal 的全部决定，每条标记是否记在现在这一轮里，也就是最近一次 `completion_reopened` 或 `work_resumed` 事件之后（Goal 从已完成继续、被后来的事实重新打开、从已取消继续，都会写其中一个；还没有这两个事件时全部算）。写成类外的函数，因为 `GoalEventStateRepository` 已经是巨型类，健康门禁不许它再长。
- `hasCurrentHumanApproval`（`event-state-completion.ts`）：授权 `complete` 的那一支只看这一轮里最近一条针对 `complete` 的决定，并且它的承诺要和现在的约定逐字相同（`decisionCommitsToCurrentAgreement`，用已有的 `commitmentsMatch` 和 `currentCommitment`，和引用决定、约定变更授权比承诺是同一套）。要求结论那一支、「拒绝完成」的检查不动。
- `scopedRequirementCommitmentsMatch`：针对 `complete` 的决定承诺整份约定之后，引用它（`assertReusable`）仍只看范围点到的要求；否则范围里点了一条要求的授权，一引用就因为承诺里多出的要求被当成「承诺已变」。其余决定的比法不变。
- 合同类型没有改：`GoalEventAppliedDecisionView` 不加字段，变的只是 `complete` 决定里 `commitment.requirements` 的内容。

没动的和限制：

- 改动前记下的授权完成的决定，承诺里没有整份约定的要求（只有结果说明，或只有范围点到的那几条），现在比不上整份约定，不再放行，要重新授权。这是往严的一边错；主线上规则还没有接进完成检查，没有人依赖过它们放行。读取不兜底旧形状（模块 README 的不变量），所以没有为它们另开路径。
- 要求上已接受的用户结论这一支没有动。它在 Goal 被继续之后是否还算数，没有在这次的决定里，另行决定。
- 「拒绝完成」的检查仍看全部历史：之前的拒绝要靠之后的新决定盖过，不随继续消失。
- 要求绑定的事件类型算承诺的一部分（`requirementCommitment` 本来就有），所以授权之后给要求新绑定类型也要重新授权。
- 收尾回执里的原因文案没有改，仍是 `event_closure.human_approval_required`。授权过期和从来没授权过，回执上看不出区别。
- 状态里的「有效决定」（`current_decisions`）仍按原来的规则列出：没被同范围的后来决定盖过就算。过期的授权会照常列在里面，列出不等于放行，放不放行以收尾回执为准。

验证：

评审的端到端复现在改动后，两处都是 `completion_applied` 为 false、原因是 `event_closure.human_approval_required`。`tests/goal-events-state.test.ts` 补了十二项测试，下表是每一项在改动前（干净地放回 c9dd6f74 的源码）的表现；其中十一项失败，最后一项是防拦过头的对照，前后都通过。

| 测试 | 改动前 |
| --- | --- |
| 完成后又被继续：更早的授权（包括完成之后、继续之前记下的）不放行；新一轮里重新授权后放行，且随那一轮用掉 | 失败：新一轮的收尾 `completion_applied` 为 true |
| 已取消的 Goal 被继续 | 失败：同上 |
| 完成后被后来的事实重新打开 | 失败：同上 |
| 授权记下的是整份约定的承诺，不是某一条要求 | 失败：记下的要求是空的 |
| Runtime 新增一条要求 | 失败：`completion_applied` 为 true |
| 用户改写一条要求 | 失败：同上 |
| 用户改写结果说明 | 失败：同上 |
| 用户退休一条要求 | 失败：同上 |
| 给要求新绑定事件类型 | 失败：同上 |
| 范围里还点了要求的授权，约定变了 | 失败：同上 |
| 范围里点了一条要求的完成决定，引用时只看点到的要求 | 失败：记下的承诺只有点到的那一条，不是整份约定 |
| 约定没变时授权保持有效：授权之后的便笺、被别的原因挡住的收尾不用掉它 | 通过 |

在本分支的源码上逐项改坏，确认每项测试各自守住了什么（改完都已还原、重新构建）：

| 改坏的方式 | 失败的测试 |
| --- | --- |
| 不看这一轮，所有决定都算 | 完成后被继续、已取消后被继续、被后来的事实重新打开 |
| 这一轮在完成时就结束，而不是在继续或重新打开时 | 完成后被继续（完成之后继续之前记下的那一条）、已取消后被继续 |
| 不认取消后的继续 | 已取消后被继续 |
| 只认取消后的继续 | 完成后被继续、被后来的事实重新打开 |
| 不看承诺是否还是现在的约定 | 新增、改写要求、改写结果说明、退休、绑定类型、范围里点了要求的授权 |
| 承诺只比结果说明 | 同上，除了改写结果说明 |
| 承诺比较时不看绑定类型 | 绑定类型 |
| 承诺回到只记范围点到的要求 | 十二项新测试全部，加上原有的两项授权放行测试，共十四项 |
| 只有纯动作的范围才记整份约定 | 范围里点了要求的授权、引用 |
| 引用时不按范围点到的要求比 | 引用 |

其余检查：`pnpm build` 通过；本规格的验证清单（二十四个测试文件）一百一十二项全部通过；`modules/goals` README「改动后必跑」的六个文件六十一项全部通过；`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`、`node scripts/check-secrets.mjs` 通过，基线不用更新（`GoalEventStateRepository`、`GoalEventStateEffects` 两个巨型类都没有变大）。
