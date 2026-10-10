# 完成确认与管理入口身份

状态：待验收（2026-10-08）。2026-10-07 在旧 main（d81b12cb）上做成，2026-10-08 重做到 main 1d891c8b 之上并重新验证；与旧版的差异见文末「合入主线时的调整」。评审后补了 typed 入口对插件的边界和结构提案检查的输入类型，见文末「评审后的补充」。再次评审后补了完成确认的回归测试，见文末「第二次评审后的补充」。第三次评审指出授权完成的决定放行得太久，按用户 2026-10-08 的决定改成只对当时的约定和那一轮工作有效，见文末「第三次评审后的补充」。第四次评审指出同一份决定里一并接受了要求的授权仍能绕过这两条限制，已补上，见文末「第四次评审后的补充」。同一次评审提出：单纯接受某条要求（没有授权 `complete`）的结论也应受这两条限制；用户 2026-10-09 决定同样限制，并且「约定」指整份承诺，已按此实现，见文末「用户的第二个决定与处理」。完整回归发现的两项失败（一项是用户决定带来的断言变化，一项是夹具里存的决定还是旧形状）见文末「完整回归后的调整」。

## 背景

三处行为跟界面或工具说明不一致。

1. 项目规则「完成前必须你点头」能保存、也能在界面上看到，但收尾时写死了不需要人工验收。单条要求上的「需要用户验收」是另一件事，它已经会拦住完成。
2. CLI 和有类型的 Host 客户端走管理入口。这个入口没有调用者身份，却把参数里的 `actor_id` / `actor_kind` 当成操作者。冒充用户就能跳过「Runtime 改约定必须引用用户决定」。
3. 管理 MCP 工具 `molis_work_v1_event_decide` 的 schema 把 `actor_id` 列为必填，处理函数却把这个字段当成不允许的参数。按 schema 调用一定失败。

## 目标

- 项目规则解析出的 `human_approval` 进入现有完成检查。打开时，完成前要有仍然有效的可信用户结论：某条要求上已接受且仍然成立的用户结论，或当前决定授权了 `complete`。点「完成」的人是用户，本身不算这条结论。
- 「点头」只对做出它时的约定和那一轮工作有效：约定变了，或 Goal 被继续、重新打开之后，更早的点头不再算，要重新接受或授权。点头有两种，按同一个办法判断：授权 `complete` 的决定（用户 2026-10-08 的决定），和某条要求上已接受的用户结论（用户 2026-10-09 的决定；协议里 Runtime 要人工验收时发 `purpose=requirement_acceptance` 的请求，用户答复写下的就是这种单纯的要求接受，正常流程走的是它）。同一份决定里既接受了要求又授权 `complete` 的（决定表单上同时勾了「接受这些要求」和「授权该动作」），两种都是，判断也一样。
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
- 授权 `complete` 的决定，和接受要求的决定（效果里有 `accept_requirements`），都记下整份约定的承诺：结果说明，和当时每一条要求的原文、是否需要用户验收、绑定的事件类型。收尾时它的承诺要和现在的约定逐字相同才放行：结果被改写，要求被新增、改写、退休，要求的验收标志或绑定的事件类型变了，都要重新授权或接受。范围里点了要求的（包括同一份决定里一并接受这些要求的）也记整份约定，不只记点到的那几条；复用它（引用决定）时仍只看范围点到的要求。
- 点头只在它做出的那一轮工作里有效，授权和接受一样。Goal 被继续（从已完成或已取消），或被后来的事实重新打开之后，更早做出的授权和接受不再放行，要重新授权或接受；完成之后、继续之前记下的也属于已经结束的那一轮。没放行的收尾（被别的原因挡住）不会用掉点头；一次收尾成立也不会用掉它，同一轮、同一份约定里再收尾仍然放行。
- 改动前记下的决定没有记整份约定：授权完成的决定只有结果说明，或只有范围点到的那几条要求；接受要求的决定只有点到的那几条。它们比不上现在的约定，不再放行，要重新授权或接受（约定里只有一条要求、接受的正是它时，点到的那一条恰好就是整份约定，按比较的结果仍可放行）。
- 某条要求上已接受且仍然成立的用户结论放行，要同时看写下它的那份决定，和授权一样：它是这一轮做出的，承诺和现在的约定逐字相同。要求自己的规则不变：要求被改写、退休，结果说明被改写（每条要求的支持和结论都过期），或结论之后被拒绝，这条结论本身就不在了，不算。**用户的决定（2026-10-09，弹窗）**：单纯接受某条要求、没有授权 `complete` 的结论（协议里 `requirement_acceptance` 请求的答复就是它），只对做出它时的约定和那一轮工作算数；Goal 被继续或重新打开之后，或约定里任何一处变了之后（整份承诺，不只是被接受的那条要求），要重新接受或授权。
- 授权、接受要求、同一份决定里既接受又授权，按同一个办法判断，不按写下它们的决定分情况。判断授权看决定的效果，不看范围里写的动作：范围里写了 `complete`、效果里只有接受要求的决定是接受，不是授权，接受被收回之后它不会因为范围里有 `complete` 继续放行。
- 判断看承诺，不看约定改过几次：约定改了又改回，和做出点头时逐字相同，授权重新算数；另一条要求改了又改回，接受也是。要求自己的规则已经收回的不会回来：被接受的那条要求本身被改写后再改回原文，或结果说明被改写后再改回（每条要求的结论都过期），要求上的结论已经没了，要重新接受或授权。
- 有「需要用户验收」标志的要求本身不受项目规则影响：这条要求上的结论还成立，要求就算已验收；项目规则另外要这一轮、这份约定的点头，接受它或授权 `complete` 都行。授权不能代替这条要求自己的验收。继续之后什么都不补，要求仍算已验收，收尾被项目规则拦住，原因只有 `event_closure.human_approval_required`。没开项目规则时，接受结论不受轮次和约定的限制，与现在相同。
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
- `tests/goal-events-state.test.ts` 还覆盖同一份决定里一并接受了要求的授权（决定表单上同时勾「接受这些要求」和「授权该动作」的形状，两种写法各走一遍：写明效果，或 `accepts_requirements` 加上点名了动作和要求的范围）同样只对当时的约定和那一轮工作有效：Goal 被继续之后、运行时新增一条要求之后、另一条要求被改写或退休或绑定事件类型之后，它在要求上留下的接受结论都不放行；这几处的前提（结论还在、要求仍然成立）在测试里先断言；对现在的约定重新授权后放行，随那一轮用掉，只授权不接受的新授权也放行。
- `tests/goal-events-state.test.ts` 还覆盖单纯接受要求的结论同样只对当时的约定和那一轮工作有效（用户 2026-10-09 的决定）：接受要求有三种写法，单纯接受、协议里 `requirement_acceptance` 请求的答复、范围里写了 `complete` 而效果只有接受要求，每种都走一遍。Goal 完成后又被继续（含完成之后、继续之前记下的接受）、取消后又被继续、被后来的事实重新打开，之后的收尾被拦住；运行时新增一条要求、另一条要求被改写或退休、给要求绑定事件类型、结果说明被改写，收尾也被拦住；这些地方的前提（结论还在要求上、要求仍然成立）先断言；重新接受后放行，只授权不接受的新授权也放行；同一轮里的第二次收尾、被别的原因挡住的收尾都不会用掉接受。接受记下整份约定的承诺，引用它只看点到的要求。
- 同一份测试还覆盖：约定改了又改回时点头是否重新算数，由承诺逐字相同决定（另一条要求、结果说明、被接受的要求本身，授权和三种接受各走一遍）；需要用户验收的要求（评审复现 ADV-8）授权不能代替它自己的验收，接受它两样都放行，继续之后它仍算已验收，项目规则要求重新点头；范围里写了 `complete`、效果只有接受要求的决定是接受不是授权，接受被收回之后它不放行（效果与范围的取舍由这一项守着）；没开项目规则时接受结论不受轮次和约定的限制。
- `tests/goal-management-identity.test.ts` 还在真实 Host 上证明（评审复现 ADV-2、ADV-8）：Web 的 `decide` 记录的单纯接受（`accepts_requirements` 加只点要求的范围），在 Goal 被继续之后、运行时新增一条要求之后，收尾被 `event_closure.human_approval_required` 拦住，重新接受后放行；需要用户验收的要求，授权不够、接受放行、继续之后只差点头。
- 管理入口测试改为：不带身份时记本机这个人并自我重放；带身份时拒绝；动作客户端仍记录 Runtime 并自我重放。跨入口用同一个幂等键互相重放的旧断言删掉，不放宽成「谁调用都算同一个人」。
- 决策工具测试继续证明：带 `actor_id` 被拒绝，不带时决定者是本机这个人。
- `tests/goal-management-identity.test.ts` 逐个覆盖管理入口：带 `actor_id` 或 `actor_kind` 都是 `actions.input_invalid` 且不写入，项目不对仍是 `actions.scope_mismatch`，不带身份时记本机这个人。
- `tests/mcp-action-catalog.test.ts` 证明决策工具的 properties 和 required 都没有 `actor_id`；`tests/goal-read-entry.test.ts` 证明 CLI 的 `active-goal` 不转发 JSON 里的 `actor_id`。
- `tests/goal-management-identity.test.ts` 还证明：这十三项入口在插件的 Manifest 里列出也被 `actions.host_only` 拒绝（用插件客户端、去掉标记的定义副本、带插件调用上下文的调用三种方式），拒绝后不留记录；同样的参数从 Host 自己的客户端调用，记本机这个人；`goals.progress.record.v1` 仍对插件开放。同文件里有一项类型检查：用已构建的类型声明编译一小段调用，十三项入口的输入类型都不含 `actor_id`、`actor_kind`，结构提案检查不带 `actor_id` 可以通过编译、带了不能。这两项测试都是从 Goals 插件的导出里读出所有事件写入的 typed 入口再检查，不靠手写名单：之后新增的写入没有 `host_only`、没登记进逐个覆盖的表、或输入类型带身份，测试就失败。
- `tests/goal-management-identity.test.ts` 还证明：项目规则打开时，管理入口的完成（记在本机这个人名下，`user`）、Web 的完成按钮、Runtime 的收尾都被 `event_closure.human_approval_required` 拦住，没开规则时同一扇管理入口可以完成；同一扇管理入口记录的授权完成的决定、Web 记录的某条要求上的接受结论，各自让完成成立。
- `tests/goal-management-identity.test.ts` 还在真实 Host 上证明：Web 记录的、同时接受要求并授权 `complete` 的决定（`accepts_requirements` 加上点名动作和要求的范围，评审复现的就是这一条路），在 Goal 被继续之后、运行时新增一条要求之后，收尾都被 `event_closure.human_approval_required` 拦住，重新授权后放行。

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

没有动的：项目引导的新增与修改、规划保存、结构提案提交（本规格「不做」）仍把参数里的 `actor_id` 当作者，插件在 Manifest 里列出它们仍能调用；它们不是记本机这个人的管理入口，要不要同样挡住，另行决定。（这是本规格当时的状态。其后 W2-07 已把这几项挡住：项目引导的新增与修改、规划保存、结构提案提交也声明 `host_only`，记本机这个人，参数里带 `actor_id` 就拒绝，结构提案提交的输入类型是 `GoalTreeSubmitEntryInput`，见 `plugins/native/goals/README.md` 与 `docs/platform/LOCAL-HOST.md`。）`createGoalCapability` 有定义和导出，但宿主没有注册，调用不到。

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
- `hasCurrentHumanApproval`（`event-state-completion.ts`）：授权 `complete` 的那一支只看这一轮里最近一条针对 `complete` 的决定，并且它的承诺要和现在的约定逐字相同（`decisionCommitsToCurrentAgreement`，用已有的 `commitmentsMatch` 和 `currentCommitment`，和引用决定、约定变更授权比承诺是同一套）。要求结论那一支、「拒绝完成」的检查当时不动；要求结论那一支后来先收窄了一处（授权 `complete` 的决定写下的结论不再单独放行，见「第四次评审后的补充」），再改成一律按轮次和承诺判断，见「用户的第二个决定与处理」。
- `scopedRequirementCommitmentsMatch`：针对 `complete` 的决定承诺整份约定之后，引用它（`assertReusable`）仍只看范围点到的要求；否则范围里点了一条要求的授权，一引用就因为承诺里多出的要求被当成「承诺已变」。其余决定的比法不变。
- 合同类型没有改：`GoalEventAppliedDecisionView` 不加字段，变的只是 `complete` 决定里 `commitment.requirements` 的内容。

没动的和限制：

- 改动前记下的授权完成的决定，承诺里没有整份约定的要求（只有结果说明，或只有范围点到的那几条），现在比不上整份约定，不再放行，要重新授权。这是往严的一边错；主线上规则还没有接进完成检查，没有人依赖过它们放行。读取不兜底旧形状（模块 README 的不变量），所以没有为它们另开路径。
- 要求上已接受的用户结论这一支当时没有动：用户 2026-10-08 的决定只说了授权。它后来由 2026-10-09 的第二个决定限制，见「用户的第二个决定与处理」。
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

## 第四次评审后的补充（2026-10-09）

评审在真实 Host 上用 Web 的 `decide`（`accepts_requirements: true`，范围 `{action: "complete", requirement_ids: ["G-r"]}`）复现了一处：存下的效果是 `[accept_requirements, authorize_action complete]`，决定表单上同时勾「接受这些要求」和「授权该动作」就是这个形状。

- 授权（含接受）、收尾成立、继续、再报告、再收尾：第二次收尾直接成立。
- 授权（含接受）之后，运行时新增一条要求（不引用任何决定，这是允许的）、报告、收尾：直接成立。

原因：这份决定一边授权 `complete`，一边在要求上写下已接受的结论。完成检查的要求结论那一支只看结论还在、要求仍然成立，既不看轮次也不看承诺，授权的两条限制被它绕开了。第三次评审后补的测试，收尾用到的授权效果里都只有 `authorize_action`；同时接受要求的那一份只出现在引用决定的测试里，没有走过收尾，所以没碰到这个形状。也就是说，本规格的目标、行为和 Goals 模块 README 的不变量里「授权只对当时的约定和那一轮有效」这句话，在这个形状上原先并不成立，现在成立。

处理（只改 `modules/goals/src/event-state-completion.ts`）：

- `hasCurrentHumanApproval` 的要求结论那一支，跳过由授权 `complete` 的决定写下的结论，也就是写下它的决定在效果里有 `authorize_action complete`。这份决定因此只经授权那一支判断：是这一轮做出的，承诺和现在的约定逐字相同。（这一跳过已被 2026-10-09 的第二个决定取代：要求结论那一支现在一律按轮次和承诺判断，不再区分写下它的决定，跳过因此不再需要，已删；上面的限制对这两种写法仍成立，下面的四项测试仍守着，见「用户的第二个决定与处理」。）
- 授权 `complete` 的效果必须配 `scope.action` 为 `complete`（写明效果时由 `assertEffectsMatchScope` 保证，`accepts_requirements` 时效果本来就取自范围），所以每一份授权完成的决定都在被跳过之列，没有漏过去的写法。写明效果、`accepts_requirements` 加范围、决定表单，存下来的是同一份效果。
- 没有照评审建议的「范围里写了 `complete`」来跳。范围里写了 `complete`、效果里只有接受要求（没有授权）的决定不是授权，它的结论仍是单纯的要求接受，当时归为待用户决定的事，不在这次悄悄改变（已由 2026-10-09 的决定处理，见「用户的第二个决定与处理」）。
- 其余的接受结论（没有授权 `complete` 的）按原来的规则。授权那一支和「拒绝完成」的检查都没动。

测试：`tests/goal-events-state.test.ts` 补了三项，`tests/goal-management-identity.test.ts` 补了一项真实 Host 上的（那个文件里已有的 Host 测试的准备代码顺手提成了共用的函数，断言没有动）。前三项各把两种写法（写明效果，或 `accepts_requirements` 加范围）都走一遍，每项先断言前提：这份决定存下的效果是接受加授权，要求上的结论还在、要求仍然成立；再断言收尾被拦住，原因只有 `event_closure.human_approval_required`。四项在改动前全部失败，失败都在放行的那一步；第二种写法在改动前同样失败（把两种写法的顺序倒过来单独跑确认过）。

| 测试 | 改动前 |
| --- | --- |
| 继续之后要重新点头；重新授权后放行，且随那一轮用掉；只授权不接受的新授权也放行 | 失败：继续之后的收尾 `completion_applied` 为 true |
| 运行时新增一条要求之后要重新授权，对现在的约定重新授权后放行 | 失败：同上 |
| 另一条要求被改写或退休、已接受的那条要求绑定了事件类型之后，都要重新授权，要求上的结论始终还在 | 失败：另一条要求被改写后的收尾就放行了（后两处没走到） |
| 真实 Host：Web 的 `decide` 记录这类决定，继续之后、新增一条要求之后都被拦住 | 失败：继续之后的收尾放行 |

在本分支的源码上逐项改坏，确认每项测试各自守住了什么（改完都已还原、重新构建）：

| 改坏的方式 | 失败的测试 |
| --- | --- |
| 不跳过任何结论（改动前的写法） | 四项新测试 |
| 只跳过这一轮里的授权写下的结论 | 继续之后（单元）、Host 那一项 |
| 只跳过承诺仍和现在的约定相同的授权写下的结论 | 新增一条要求、另一条要求的改动（单元两项）、Host 那一项 |
| 所有已接受的结论都不放行 | 「要求上已接受且仍然成立的结论放行」（单元）、「管理入口、Web、Runtime 的收尾都不是验收」（Host，里面有要求上的接受结论让完成成立那一段） |
| 按范围里写了 `complete` 跳过，而不是按效果 | 都通过：这几项测试里的授权是真授权，两种判法在它们身上没有区别；这个取舍当时没有测试守着，现在有了，见「用户的第二个决定与处理」 |

没动的和限制：

- 要求上的结论按每条要求最新的一条算。同一条要求先单独被接受、后来又在一份授权完成的决定里被接受（或相反），留下的是后一条，按写下它的那份决定算。2026-10-09 的决定之后两种都按轮次和承诺判断，不再有两样。
- 范围里写了 `complete`、效果里只有接受要求（没有 `authorize_action`）的决定，按单纯接受要求处理；2026-10-09 的决定之后，单纯接受要求也受轮次和承诺的限制，这一条因此不再有区别，见「用户的第二个决定与处理」。
- 过期的授权和它在要求上留下的结论，照常列在状态的 `current_decisions` 和要求的 `user_conclusion` 里；列出不等于放行，放不放行以收尾回执为准。
- 收尾回执里的原因文案没有改，仍是 `event_closure.human_approval_required`。

评审的两处复现（含接受的授权：继续之后、新增一条要求之后；写明效果和 `accepts_requirements` 两种写法，以及真实 Host 上的 Web `decide`）在改动后都是 `completion_applied` 为 false、原因只有 `event_closure.human_approval_required`；评审的原形状（纯授权）仍被拦住，重新授权后放行。其余检查：`pnpm build` 通过；本规格的验证清单（二十四个测试文件）一百一十六项全部通过；`modules/goals` README「改动后必跑」的六个文件六十四项全部通过；`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`、`node scripts/check-secrets.mjs` 通过，基线不用更新（只多了一个函数内的几行，没有巨型单元变大）。

## 用户的第二个决定与处理（2026-10-09）

第四次评审提出的待用户决定事项（单纯接受要求的结论要不要也只对当时的约定和那一轮有效）已有决定，已实现。

**用户的决定（2026-10-09，弹窗）**：项目规则「完成前必须你点头」打开时，单纯的要求接受（效果 `accept_requirements`，协议 `skills/goal-advance/references/protocol.md` 里 `purpose=requirement_acceptance` 的正常流程）和授权 `complete` 一样，只对做出它时的约定和那一轮工作算数。Goal 被继续或重新打开之后，或约定里任何一处变了之后（整份承诺，不只是被接受的那条要求），要重新接受或授权。

这个决定补上的是评审的两处复现，Goal 上都只有单纯的要求接受：

- 接受要求 r（范围里只有 `requirement_ids`）、完成、继续、再报告、再收尾：第二次收尾直接成立（复现 ADV-2）。
- 一条需要用户验收的要求在第一轮被接受后，继续这个 Goal，什么都不补，收尾直接成立（复现 ADV-8）。

改动后两处都是 `completion_applied` 为 false，原因只有 `event_closure.human_approval_required`。

处理（`modules/goals/src`）：

- `snapshotCommitment`（`event-state-authorization.ts`）多收一个 `effects`：范围是 `complete`，或效果里有 `accept_requirements`，承诺都记整份约定（`commitsToWholeAgreement`，先前只看范围）。接受要求的决定因此和授权一样，记结果说明加当时每一条要求。库里的列和合同类型都没有变，变的只是这类决定的 `commitment.requirements` 里记了多少条。
- `scopedRequirementCommitmentsMatch`：引用决定时，凡是记整份约定的决定（同一个判断）仍只看范围点到的要求，原来只对范围是 `complete` 的这样做。
- `hasCurrentHumanApproval`（`event-state-completion.ts`）：先取「这一轮里、承诺和现在的约定逐字相同」的决定（`decisionCommitsToCurrentAgreement`，没有改），两种点头都用这个集合：要求上已接受且仍然成立的结论，写下它的那份决定要在集合里；针对 `complete` 的最近一条决定，要是授权并且在集合里。第四次评审补的「跳过授权 `complete` 的决定写下的结论」删了：每一条接受结论现在都受这两条限制，不必再按写下它的决定分情况。把那段跳过放回去，单元和 Host 两个文件的六十三项照样全部通过，可见它已经多余。
- 授权按决定的效果判断（`decisionHasEffect`），不按范围里写的动作，这一点没有变；它原先没有测试守着，现在有了。

没动：要求自己的规则（`requirementCurrentlySatisfied`、`support_valid_after_seq`），「拒绝完成」的检查，合同类型，数据库，回执文案（仍是 `event_closure.human_approval_required`，点头过期和从来没点过头在回执上看不出区别），状态里的 `current_decisions`（过期的接受照常列出，放不放行以收尾回执为准）。

「约定变了」怎么算，也就是约定改了又改回算不算：按承诺逐字相同，和授权、引用决定、约定变更授权比承诺是同一套（`commitmentsMatch`）。结果：

- 约定改了又改回，和做出点头时逐字相同，点头重新算数。授权如此；接受结论也如此，只要要求上的结论本身还在，例如另一条要求被改写后又改回原文。
- 要求上的结论不在了的不会回来，那是要求自己的规则，项目规则没有改它：被接受的那条要求本身被改写后再改回，或结果说明被改写后再改回（每条要求的支持和结论都过期），结论已经没了，改回原文也不恢复，要重新接受或授权。授权不挂在要求上，仍然恢复。
- 没有改用约定版本号：版本号只往前走，约定改回去也不会回来，和授权现在的行为也不一致。

测试：先写测试，在改动前的源码上跑过，再改源码。`tests/goal-events-state.test.ts` 补了十一项（四十五项变成五十六项），`tests/goal-management-identity.test.ts` 补了一项真实 Host 上的（七项；准备代码里的 `supported` 多了一个「需要用户验收」的选项，已有断言没有动）。单元里除下面另有说明的几项外，都把接受要求的三种写法各走一遍：单纯接受；协议里 `requirement_acceptance` 请求的答复；范围里写了 `complete` 而效果只有接受要求（只能显式写效果得到）。每项先断言前提：存下的效果只有接受，要求上的结论还在、要求仍然成立；再断言收尾被拦住，原因只有 `event_closure.human_approval_required`。下表是每一项在改动前（干净地放回 13dbf4f5 的 `modules/goals/src` 三个源文件）的表现：十二项里九项失败，三项是对照，前后都通过。

| 测试 | 改动前 |
| --- | --- |
| 接受记下整份约定的承诺，不是某一条要求 | 失败：承诺里只有被接受的那一条 |
| 接受只对点到的要求引用，不对整份约定 | 失败：先断言「承诺是整份约定」就不成立 |
| 继续之后要重新接受或授权（含完成之后、继续之前记下的接受；Runtime 引用旧接受也不行；同一轮第二次收尾；换成授权也放行） | 失败：继续之后的收尾 `completion_applied` 为 true |
| 取消后又被继续 | 失败：同上 |
| 被后来的事实重新打开 | 失败：同上 |
| 另一条要求被改写或退休、事件类型被绑定、结果说明被改写、运行时新增要求之后，都要重新接受 | 失败：另一条要求被改写后的收尾就放行了（后几处没走到） |
| 约定改了又改回（另一条要求、结果说明、被接受的要求本身，授权和三种接受各走一遍） | 失败：另一条要求被改写后的收尾就放行了（后几处没走到） |
| 需要用户验收的要求（ADV-8）：授权不够，接受放行，继续之后只差点头 | 失败：继续之后的收尾放行 |
| 真实 Host：Web 的 `decide` 记录单纯接受，继续之后、新增一条要求之后都被拦住，需要用户验收的要求（ADV-2、ADV-8） | 失败：继续之后的收尾放行 |
| 约定先改、接受后给：接受点到一条要求，仍是对现在整份约定的点头；便笺、被别的原因挡住的收尾都不用掉它 | 通过（对照：不拦过头） |
| 范围里写了 `complete`、效果只有接受的决定是接受，接受被收回后它不放行 | 通过（改动前就是按效果判断，这一项让它被守住，见下表） |
| 没开项目规则时接受结论不受轮次和约定限制 | 通过（对照：不开规则时与原来相同） |

在本分支的源码上逐项改坏，确认每项测试各自守住了什么（改完都已还原、重新构建；单元为 `tests/goal-events-state.test.ts` 的五十六项，Host 为 `tests/goal-management-identity.test.ts`）：

| 改坏的方式 | 失败的测试 |
| --- | --- |
| 要求结论那一支不看轮次 | 单元五项：继续之后、取消后又被继续、被后来的事实重新打开、需要用户验收的要求，和既有的「授权并接受」的继续之后；Host 两项 |
| 要求结论那一支只看轮次，不比承诺 | 单元五项：约定里任何一处变了、约定改了又改回、需要用户验收的要求，和既有的「授权并接受」两项；Host 两项 |
| 接受要求的决定只记点到的要求 | 单元五项：整份承诺、引用、约定里任何一处变了、约定改了又改回、约定先改接受后给 |
| 引用时按记下的全部承诺比（只对范围是 `complete` 的才按点到的要求） | 引用 |
| 授权按范围里写的动作判断，不按效果 | 范围里写了 `complete` 而效果只有接受的那一项，和约定改了又改回 |
| 把第四次评审补的跳过放回去 | 都通过：跳过已经多余 |
| 点头还要求约定版本号没变 | 约定改了又改回 |
| 任何一次收尾都结束这一轮 | 四项：既有的「授权保持有效」、继续之后、约定改了又改回、约定先改接受后给 |
| 一次成立的完成就结束这一轮 | 继续之后（里面的「同一轮第二次收尾」） |

没动的和限制：

- 改动前记下的接受结论没有整份约定的承诺（只有点到的那几条），比不上现在的约定，不再放行，要重新接受或授权；约定里只有一条要求、接受的正是它时，旧形状恰好等于整份约定，按比较的结果仍可放行。这是往严的一边错；主线上规则还没有接进完成检查，没有人依赖过它们放行，读取不兜底旧形状（模块 README 的不变量）。
- 接受哪一条要求都算点头，这一点原来就是这样；点头是对整份约定的，所以接受一条要求之后别处再变，要重新点头。
- 点头仍然只来自用户本人的可信决定：Runtime 引用旧决定（`citeDecision`）可以按范围复用它，但引用不是新的结论，不会把旧的接受带进这一轮，测试守着。
- 技能文档（`skills/goal-advance`）没有改。它没有提到项目规则；Runtime 收到 `event_closure.human_approval_required` 后应像第一次那样请用户点头，要不要把这一点写进技能，另行决定。

其余检查：`pnpm build` 通过；本规格的验证清单（二十四个测试文件）一百二十八项，一百二十六项通过，两项被取消：`tests/goals-actions.test.ts` 的「官方 MCP 启动器」那一项和 `tests/goals-mcp-actions.test.ts` 的那一项，都在测试自带的 60 秒上限处超时。当时机器负载约 22（另有会话在跑测试），这两项都要起一个 MCP 子进程；分开重跑：后者 47 秒通过；前者单独跑在 60 秒上限处仍然超时，把上限放宽到 900 秒的临时副本（已删）上，干净的基线源码用 110 秒、本分支用 142 秒，都通过。所以是环境与时序，不是这次的改动。`modules/goals` README「改动后必跑」的六个文件七十五项全部通过；评审自己的临时对抗测试里 ADV-1 到 ADV-5、ADV-7 到 ADV-10 的输出逐项符合上面的规则（ADV-2、ADV-8 由放行变为 `completion_applied` 为 false，原因只有 `event_closure.human_approval_required`；约定改了又改回的 ADV-3 授权恢复）。`node scripts/check-health-gates.mjs --base origin/main`、`pnpm boundary:check`、`node scripts/check-secrets.mjs` 通过，基线不用更新（只多了几行函数，没有巨型单元变大，`GoalEventStateRepository`、`GoalEventStateEffects` 两个巨型类的行数没动）。

## 完整回归后的调整（2026-10-09）

完整回归在 `tests/goal-event-imported-requirements.test.ts` 里发现两项确定性失败，它们在 origin/main 上通过，因为主线上项目规则还没有接进完成检查。两项都是第二个决定带来的预期变化，不是放宽断言；下面是改动的断言清单。

1. 「real event closure stays distinct; explicit continue can reuse the same-scope approval」，改名为「…after an explicit continue the old approval no longer counts and the close waits for a fresh nod」。这是用户的决定（继续之后，更早的点头不再算）。原断言是已完成的 Goal 被继续、Concern 解决之后，收尾复用迁入的那次批准而成立；现在改成：同样的步骤之后收尾 `completion_applied` 为 false，原因只有 `event_closure.human_approval_required`；迁入的策略要求仍保留原来的结论、当前决定仍是原来那一条；人在 Web 上新记一条授权 `complete` 的决定后，收尾成立，当前决定只剩新的那一条。
2. 「still-valid same-scope complete approval satisfies imported policy after the real blocker is resolved」，断言一字未改。原因：它没有继续、约定没变，轮次是对的，收尾回执里只有 `event_closure.human_approval_required`。夹具 `tests/fixtures/goal-event-history/approved.sql` 与 `approved-completed.sql` 里存的授权完成决定是旧形状：承诺只有结果说明，`requirements` 为空；而这个 Goal 的约定有两条要求（`MIXED-C1` 和迁入的策略要求）。逐字比对不通过。代码没有判错：这条决定没有记整份约定，按本规格就不放行。仓库的规则是读取不兜底旧形状、存量由整理处理、夹具存的是当前形状，所以改夹具，不改代码：这两个夹具里该决定的 `commitment`（决定表与幂等回执各一处，共四处）改成当前形状，即结果说明加这两条要求。新值与现行代码对同一份约定记一条授权完成的决定时写下的逐字相同（用 `mixed` 夹具对照过）。这个测试按此通过。夹具 README 记了这次更新。

真实 Home 是否受影响：看了演练拷贝（`maint4/home`，只读打开）里全部 18 个项目库。项目规则「完成前必须你点头」生效的项目是 2 个，共 4 条生效的绑定，全是 Goal 范围的，没有项目默认；另有 1 个项目有一条值为 false 的绑定。已存的决定（`goal_event_trusted_decisions`、`goal_event_applied_decisions`）在这 18 个库里是 0 条，所以授权完成或接受要求的决定没有一条会因为旧形状而不再算数，不需要整理。受影响的是那 4 个 Goal：其中 2 个已经完成，之后若被继续，要重新点头；另 2 个未完成，完成前要有这一轮、对当前约定的点头，这是项目规则接进完成检查（本规格的第一个目标）带来的，不是旧形状造成的。
