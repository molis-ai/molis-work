# Prologue 协调者与助理任务图

原 §6.0i–6.0o 的 P4 决定与实施记录，包括 MCP 注解和 App-tools 外部等待。

[返回需求书](spec.md)

- [6.0i P4-C1：协调者带板工具；Coding 一半里留下的几样（2026-10-17）](#60i-p4-c1协调者带板工具coding-一半里留下的几样2026-10-17)
- [6.0j P4-C2：人改计划走协作合同（2026-10-17）](#60j-p4-c2人改计划走协作合同2026-10-17)
- [6.0k P4 助理一半 A1：每个 Work 一块任务图，子任务是图上的步骤（2026-10-17）](#60k-p4-助理一半-a1每个-work-一块任务图子任务是图上的步骤2026-10-17)
- [6.0l App-tools 只读外部等待的统一 SDK（2026-10-17）](#60l-app-tools-只读外部等待的统一-sdk2026-10-17)
- [6.0m MCP 参数注解与派出校验的统一 SDK（2026-10-17）](#60m-mcp-参数注解与派出校验的统一-sdk2026-10-17)
- [6.0n P4 助理一半 A2：交回改用 SDK 的等待与接续（2026-10-17）](#60n-p4-助理一半-a2交回改用-sdk-的等待与接续2026-10-17)
- [6.0o P4 助理一半 A3：后台作业是工作图上的一步（2026-10-17）](#60o-p4-助理一半-a3后台作业是工作图上的一步2026-10-17)

## 6.0i P4-C1：协调者带板工具；Coding 一半里留下的几样（2026-10-17）

**统筹 10-17 定 A**（§6.0d「留到后面的」第 1 条）：Coding 的协调者角色（`coordinator`，`plugins/native/coding/src/roles.ts`，版本 13 → 14）加上 `board-read`、`board-report`。理由：孩子拿到的工具不会比父亲多（SDK T12），协调者没有板工具，它让出给的孩子就报不了交给自己的那一步，父亲那一步的等待总是 `failed`，照样往下走。

- 孩子的角色（`coding-reader`、`coding-reviewer`）和所有提示词都没改：SDK 给绑了步骤的孩子补上父亲有的这两个工具，宿主的子角色工具名单不用动。
- 边界还是宿主的板钩子（`prologue-taskboard.ts`）：只读本项目的板，只报自己持有的步骤。
- 用例 `tests/coding-coordinator-board.test.ts`（夹具模型，只引包名）。第一条（PA-11 的切片）证明三件事：
  - 让出的孩子报了自己那一步，父亲的等待 `satisfied`，接续 `eligible`；下一轮再报那一步，回 `TASKBOARD_CONFLICT`（已经结束）；
  - 读、报别的项目的板，被钩子拒（「只能读取或回报本项目的任务图」）；
  - 报同项目另一个会话持有的步骤，回 `TASKBOARD_NOT_ASSIGNED`，那个会话的计划没变。
- 第一条在 main 上是红的：协调者那一轮直接失败。
- `prologue-adoption-guard` 里 PA-23 那条的注释改成指向这条用例，断言没变：那个孩子只回答、不报步骤，等待照旧 `failed`。
- 顺带的变化：`STEP_TOOLS` 这道检查现在对协调者也通过了。人选「协作」又带着确认过的计划开跑时，以前宿主拒（「当前角色未开放计划回报工具」），现在照计划跑。统筹 10-17 要求补断言：同一文件第二条（PA-09 的计划部分），协调者带两步计划开跑，不被拒，计划的两步都归本会话，按顺序报 `running`、`succeeded`。协调者去掉板工具时，这一条以那句拒绝失败。

**§4.6.9 里 Coding 那一行，这一片核过以后留下的**（理由逐条写在这里，不留第二份实现，也不加兼容）：

| 项 | 现在 | 为什么不删 |
| --- | --- | --- |
| `following` 去抖 steer（`prologue-taskboard.ts`） | 别人改了这一跑计划里的某一步（子任务回报、交回），停 1.5 秒后给这一跑发一句「任务图有更新」 | SDK 的接续只把「等待的结果」交给活着的那一跑，子任务写回只交最终报告（`describeSubagentReport` 里没有步骤和交回）；板上步骤的变化 SDK 不送。`coding-step-claims` 断言了这句话。要删得先开一刀 Prologue，让板上的变化在模型边界交给持有者 |
| 2 小时认领过期（`CLAIM_EXPIRES_MS`） | 持有步骤的会话没有在跑、两小时没动静，就标「认领已过期」，什么也不收回 | 计划的步骤上没有等待：一跑绑的是会话那一块，不是计划的步骤，所以「代次与等待期限」在这里没有可读的。这条只改显示，规则是人定的。没有用例，列在下面「未验证」 |
| `last-start:<会话>` | 那一轮开跑时的方式（intent、模型、思考强度、目录、actor、原任务） | P3a 定了接续由 Coding 自己用请求键起跑（§4.6.10「接续起跑」）。下一轮要按同样的方式开，这些是 Coding 自己的请求内容；Run 视图冻结的开跑记录（`AgentFrozenStart`）是宿主那一半：有角色和 `model_id`，没有 intent、provider、工作区编号、actor 和 `origin_task`。不新增动作 |
| `wake-note:<等待>` | 只存「自动开始没成功：<原因>」 | 接续的 `control` 只有 `cancel-wait`、`continue-now`，没有地方记「起跑失败的原因」。C2 给 `control` 补 `retry`、`resolve-reconciliation` 时再看能不能记在接续上；被拒的开跑照旧不写 |
| 内存 `busy` / `waking` | 会话正在接收发送时不接接续；一个 runtime 一个叫醒循环 | 进程里的并发闸，不是事实；P3a 定了起跑归 Coding，叫醒循环本身留着 |

§4.6.9 写的「删除，改读等待与接续视图」，前提是宿主起跑接续；P3a 改成了 Coding 自己起跑。以 P3a 为准。

**真实模型实走**（MiniMax，按授权不再弹窗问；评测文件没入库，留在本会话的草稿里）：

```text
改动：Coding 协调者带 board-read / board-report，让出的孩子能报自己那一步
要解决的问题：让出给孩子以后，父亲那一步的等待总是 failed
环境：每轮一个临时 Home，跑完即删；MiniMax / MiniMax-M3，anthropic-messages（api.minimax.cn/anthropic）；2026-10-17
任务：协调者，「派一个代码调查子任务去读 README.md，数一下它有几个二级标题。派出去以后你这一轮就收工、把这一步交给它，不要自己去读；等它做完再接着告诉我结果。」（README 有 3 个二级标题）；审查一律批准；等待满足、接续 eligible 时开下一轮「接着做。」
次数：7
结果：7/7 答对（3 个，列出 Install / Use / License）；7 次孩子都调了 board-report 报自己那一步（让出的 2 次报成了，等待因此满足；前台的 5 次没核对回报的结果）
让出：2/7 带 yield（第 1 次、第 4 次）：等待 satisfied、接续 eligible，下一轮直接用孩子的结果作答；其余 5 次是前台派出（没带 yield、background），同一轮里拿到孩子的报告作答，没有等待
结论与未验证：让出时这一决定按设计工作（2/2）；模型多数时候不让出，见下表
```

| 失误 | 出现在 | 分类 | 依据 | 处理 |
| --- | --- | --- | --- | --- |
| 人说了「这一轮就收工、把这一步交给它」，却前台派出、同一轮等结果 | 7 次里 5 次 | 拿不准 | 协调者的提示词（`coding-coordinator` v5）没讲什么时候让出，只有工具说明里有 `yield`；分不清是提示词没写还是模型没照着人的话做。结果没有错 | 不改提示词、不加规则（§11）；要不要在协调者提示词里写让出，交 AI 手册线 |
| 第一次派出把 `tools` 写成对象，被拒后改对 | 第 5 次 | 模型能力 | 合同按 schema 拒，拒绝里有位置，模型下一次写对 | 不处理 |

- 未验证：
  - 认领过期的显示没有用例（上表第 2 行）。
  - 「人选协作并带计划」没在页面上走过（只有上面第二条非浏览器用例）。
  - 让出之后等很久（几小时）、宿主中途重启再接续，这一片没量。

## 6.0j P4-C2：人改计划走协作合同（2026-10-17）

人在任务图上改一轮的计划，从 typed 能力 `agent.run.step-board.amend.v1` 换成动作 `agent.collaboration.revise.v1`（§4.6.9「动作」一段）。阶段一不留兼容：旧 id 不留别名，typed 条目 `agentHostCapabilities.amendStepBoard`、Host 的注册与 `AgentRuntimeAdapter.amendStepBoard` 同一刀删掉（health 的 typed 能力位点 190→187）。

- **合同**（`packages/contracts/src/services/agent-collaboration.ts`）：
  - 新动作 `agent.collaboration.revise.v1`，版本 1：`kind: operation`，`operation: command`，`effect: write`，只给插件。
  - 输入：`runtime_id`、`session_id`、`run_id`、`amendment`、`expected_version`（整数，≥1）。`amendment` 用 `oneOf` 列出现有的六种修订，每种只收自己的字段：步骤引用写成 `step-N` / `user-N`，文字非空、有上限，和 Coding 页面的检查一致。
  - 输出：`{ board }`。
  - actor、项目、安装都从调用上下文来：actor 是调用的插件的 actor，读不到时用会话的主人，和旧能力一样。
  - `AgentCollaborationPort` 加 `revise(run, amendment, expectedVersion, actorId)`。
- **宿主**：
  - `session-actions.ts` 注册这个动作：先核这一轮属于这个会话、会话属于调用方的项目和插件，提交前再确认调用仍然有效，被取消、撤权的调用什么都不改。
  - 适配器的 `collaboration.revise` 沿用原来那段检查：一轮结束以后，只有它还是会话里最新的计划轮、计划图也没结束，才能改。
  - Node 组合里，`revise` 由计划步骤那一块（`stepBoards.amend`）提供，等待那一块不管它。
- **Coding**：`coding.plan-amendments` 路由改调这个动作；页面上的检查和「告诉正在跑的那一轮」都不变。
- **同一刀没做的**（§4.6.9 写过；这一刀不做，理由是现在没有调用方，加了就是没人用的合同）：
  - `control` 的 `retry`、`resolve-reconciliation`：接续停下等人的三种情况（`blocked`、`needs-reconciliation`、`eligible` 但不自动），页面现在都只给「现在开始，或取消等待」，走的是已有的 `continue-now`、`cancel-wait`。没有「重新试」「核对后继续」这样的按钮要接。
  - `revise` 的「取消节点」「重试节点」：现有六种修订里，「跳过」已经是取消；失败步骤的重试，页面上没有入口。
  - 以后页面要这几样时，再按 §4.6.9 加进这两个动作，同时升 `version`。
- **用例**：
  - `tests/agent-collaboration-revise.test.ts`（新，只引包名）：
    - 动作只给插件，schema 在任何处理之前拒掉写错形状的修订（坏引用、空白原因、不认识的种类、错的方向、`mine: false`、多出的字段、版本 0 或小数、带 `actor_id`、缺版本），六种都能通过；
    - typed 的修订已经不在了；
    - 修订带着人的改动、看到的版本和调用插件的 actor 交给那一轮；
    - 被取消、被撤权的调用，以及别的会话的轮次，都不改任何东西。
  - 改用新路径的：`coding-plan-amend-http`（路由经动作目录调 `revise`）、`prologue-step-amend`、`prologue-project-board`、`coding-step-claims`、`coding-runtime-regressions`。断言没变，只换了调用的入口，并把原来省掉的 actor 写成 `"user"`。
- **快照**：
  - `pnpm api:update` 改了 `contracts/services/agent-collaboration`（加了动作、类型和端口方法）和 `contracts/services/agent-host`（去掉了 `amendStepBoard`）；
  - `pnpm actions:update` 在宿主登记的动作里加了 `agent.collaboration.revise.v1@1`。
- **换包**（用户 10-17 弹窗同意并进采用线下一次换包；统筹定随 P4 第一个改合同的片）：
  - vendored SDK 从 parameter-branches（`4e8468dd`）换成 reference-kinds：上游 main `c673238e`（[Prologue #33](https://github.com/molis-ai/prologue/pull/33) 的合并：统筹经用户弹窗同意后合入，树与评审过的 head `a579bfea` 相同），干净 `git archive` 打两次，逐字节相同（1,190,630 字节，SHA-256 `585909b1…`）。
  - #33：App 可以在 `config.tool.askUserReferenceKinds` 列出对象引用题能要的种类，配了 `refKinds` 就是这几个名字的 `enum`，名单外的打开等待前就失败；不配时与原来逐字相同。Molis 这一刀只换包、不配名单，名单由交互线 T2 接上。
  - 验证：同一棵树上 SDK 全量 355 个文件，3949 条通过、21 条跳过、0 条失败（未跑 `desktop-computer-use.live`）；13 个消费者脚本在新包上全过。
  - 旧包和它的 `.sha256`、`.provenance.json` 删掉，记进 `patch-history.json` 的 `packagesWithoutPatch`（第 21 个），`upstream.commitsChecked` 加上 `c673238e`，逐项核对过：除三个已换掉的过渡包来源以外，都是 main 祖先。
- **对调用方的影响**：
  - 仓库里唯一的调用方是 Coding 的计划调整路由，同一刀改完；
  - 工作流程步骤、绑定、MCP 工具名、Skill 都没有点名过旧能力；
  - Coding 的 Manifest 按 `agentCollaborationActions` 全部列出，自动包含新动作。
- **验证**（变基到 main `04ab0216` 之后）：
  - `pnpm build` 通过；`affected-tests` 选的非浏览器用例，加上 vendor-provenance、S-13 `prologue-memory-boundary`、PA-12 `prologue-tool-declaration`、问卷两条与 `coding-coordinator-board`，146 个文件全过；
  - `pnpm test:security` 58/58（S-13 在新包上再过一次）；`pnpm test:contracts` 44 个文件里 43 个一次过，`action-gateway` 的「production stdio」一条在机器满载时超了 20 秒时限，单独重跑 13/13 过、那条 1.8 秒；
  - `check-health-gates --base origin/main`、`boundary:check`、`verify-release-versions`、`page-assets --base origin/main` 都过：typed 能力位点 190→187，页面资源逐项不变。
- **未验证**：浏览器用例交给全量（统筹 10-17 定）；全量由统筹跑。

## 6.0k P4 助理一半 A1：每个 Work 一块任务图，子任务是图上的步骤（2026-10-17）

§7.5 第 5 条的第 1、4、5 项。统筹 10-17 定了五条：第 1、4 条由用户在弹窗里定，第 2、3、5 条统筹照推荐定。

- 第 1 条：每个 Work 一块图，它的子任务也在这块图上，Work 之间不交接。
- 第 3 条：一次跟进一个步骤。
- 第 5 条：A1 先做。

交回与自动接着做（第 2、3 项）是 A2，后台作业是 A3。这一片还没动它们，`handed_back_run`、`hand_back_held` 和按结果键起跑都还在。W5-10 的形状照旧：

- `AssistantDelegations` 只经端口依赖宿主；
- `assistant-service.ts` 与 `AssistantStore` 的类只变小：`AssistantService` 少 3 行，`AssistantStore` 行数、方法数不变。

**合同**（`services/agent-collaboration`）：

- `AgentCollaborationPort.works?: AgentWorkGraphPort`，五个方法：
  - `open`：同一个键给同一块常驻图；根由这项工作的会话负责。
  - `add`：在根或某一步下面加一步，归某个会话。重复加不变。
  - `read`
  - `watch`
  - `end`：结束一步还没结束的。带 `actor_id` 时记为这个人的决定；不带时记为持有它的会话放弃了它。
- `AgentWorkNode`：步骤 id、上一层、标题、SDK 的状态、持有它的会话，以及「人结束的」（时刻和说明）。
- 这个端口挂在已有的协作口上，没有加在 `PrologueAgentAdapter` 上。那个类是巨大单元，不许变长。
- 助理的公开视图没变：`AssistantWork.delegated_by` 还是 `{ work_id, title, acceptance, taken_back_at? }`，其中 `work_id` 由图推出来。

**宿主**（新文件 `prologue-work-graphs.ts`）：

- 板与步骤：
  - 一块图用 `molis-work:assistant-work:<work_id>` 当幂等键开，常驻，保留最近 64 个已结束的步骤。
  - 根叫 `work`；子任务的步骤是 `p-<编号>`，挂在根下；跟进是 `<子任务>.f<n>`，人在子 Work 里自己开的一轮是 `<子任务>.r<n>`。
  - 会话在哪块工作图上，记在宿主的会话索引里（`work_graph`）。
- 一轮站在哪：这样的会话开一轮，绑在它在那块图上持有的、还没结束的那一步上（`roundBinding` 第一行）。那一步若被挂起等人，先由 `readyStep` 转回 `ready`。
- 一轮结束时：
  - 子任务那一步跟着这一轮结束（completed → succeeded，failed、cancelled 照抄），按 `attemptOf` 找到的那一代报。
  - 人中途结束了那一步，或者它已换代，这一轮就不报。
  - 根不结束：工作还在继续。
- `prologue-run.ts` 只多了这两行，加一个类型。

**助理**（`assistant-delegation.ts` 就地改）：

- 存储与看板：
  - 父 Work 存 `graph_id`，在第一轮开跑前打开（`place`，在 `dispatch` 里 `host.start` 之前）。
  - 子 Work 的 `delegated_by` 变成：图、它被派出时的那一步、父工作当时的标题、验收标准，再加 `taken_back_at`。哪项工作派的从图找；`follow_ups` 删了，从图数。
  - `delegatedBy(actor, parent)` 按图找子 Work。
  - 父工作看板上的子任务列表（`parts`）读图。
- 等待与交回：
  - `status` 等图的变化：要等的子任务都没有未结束的步骤就返回。`watchWorks` / `waitForWorkChange` 不再用于委派。
  - 子任务的一轮结束以后，交回在它那一步结束时触发，看图，不看跑的终态。宿主报那一步比跑的终态晚一点；按跑的终态触发，交回会把子任务算成还没做完，不往下走。
  - 「有子任务还没做完时不往下走」改读图（`owed`）。
- 并行上限：在做的 3 个数图上还有未结束步骤的子任务。
- 人核对后关闭子任务中断的一轮（`closeInterrupted`）：这一部分没结束的步骤由人结束，父工作可以往下走。

**定下的几件事**（记进 §7.7）：

1. **收回不交接给父会话。** §7.5 第 4 项写的是「改图交回父节点（代次 +1）」，实现是：
   - 人把这一部分还没结束的步骤结束（取消，记为人的，代次 +1，子任务那一轮再也报不了）；
   - 「这部分由父工作自己做完」记在子 Work 上（`taken_back_at`）。

   理由：
   - 父的轮站在根上。交给父会话的那一步没有轮站在上面，永远不结束：A2 在父节点上挂的等待会等不到它，父会话在图上也会一直挂着一步没做完的。
   - 已结束的子任务没有步骤可交：SDK 只交接没结束的。而界面上已完成的子任务也能收回。
   - 谁来做完这一部分，是 Work 的业务决定，和验收标准一样留在 Work 上。
2. **子任务还有没结束的步骤时，跟进被拒**（`assistant.state`）。没结束包括还在跑、等人回答或确认、被重启截断。
   - 以前会把话送进正在跑的那一轮。
   - 理由：一次跟进一个步骤（第 3 条）。送进正在跑的一轮就没有步骤可记，上限也就数不准。工具说明写的本来就是「它的下一轮」。
3. **人在子 Work 里自己开的一轮**，站在子任务下面新加的一步上，不算跟进。
4. **每个助理 Work 都有图**，回帖用的 Work 也有。Coding 执行的 Work 没有：它的轮在 Coding 会话里。「助理把工作交给编码角色时，那个会话绑在助理 Work 的子节点上」不在 A1。
5. **存量**：
   - A1 起只认现行形状。没有 `graph_id` 的旧 Work，在它下一轮开跑前开图。
   - 旧形状的子 Work（`delegated_by.work_id`）不读，由 A4 合入前的一次性脚本改（用户 10-17 第 4 条）。A4 定了改法：去掉它们的 `delegated_by`，各自成为独立的工作，正文、轮次和结果都留着（用户 10-17 弹窗定，§6.0q）。
   - 在那之前，跑新代码的 Home 上，旧的子任务不出现在父工作的看板上，也不会触发交回；Work 本身和成果都还在。
   - 真实 Home 在用户同意前不碰。用户 10-17 同意在助理库的只读拷贝上演练，结果见 §6.0q：一项 Work 也没有。

**验收**（`tests/assistant-delegation.test.ts`，夹具模型，真实 Prologue 节点适配器）：

| 编号 | 证明 |
| --- | --- |
| WG-01 | 委派后，父工作的图上有两步：根 `work`，由父会话持有，`running`；子任务那一步挂在根下，由子会话持有，跟着它的一轮 `succeeded`。子 Work 没有自己的图，图上能找到哪项工作派的 |
| WG-02 | 两次跟进各是子任务下面的一步（`.f1`、`.f2`），已结束的那一步不重开；第三次被上限拒；看板上的跟进次数从图上数 |
| WG-03 | 收回后，子任务那一步 `cancelled`，记为人结束的、带收回的说明；父会话在图上只持有根 |
| WG-04 | 七次起不来的委派，图上没有留下还没结束的步骤 |
| W2-18-DELEGATION-PLACED-01 | 人在已完成的子任务里发的一轮没开起来（没有模型）：为它新加的那一步（`.r1`）由持有它的会话结束（「这一轮没有开始」），图上没有开着的非根步骤；随后三个新子任务都能交出，父工作又被交回一次 |

原有断言照留：边界、上限、停止、归档后仍算数、交回、W2-18 的几条竞态。

回归修复（10-17，防腐线复查 #637 时发现）：发一轮的路径先在图上放好这一轮站的步骤，再开跑。开跑失败时（发送被后一次取代、Character 版本被拒、没有模型），新加的那一步没有结束，子任务在图上一直「还在做」：父工作不再被交回，名额一直被占，追加也被拒。现在由 `AssistantDelegations.startPlaced` 包住开跑：这一轮新加的步骤，开跑失败就结束；复用已有的步骤时不动。委派时第一轮起不来的那条路径本来就由 `delegate` 结束。开跑请求本身（项目、会话、角色、材料、图片、预算、浏览器、Character）搬进 `assistant-round-start.ts` 的 `roundStartInput`：它只由 Work 和这一轮的输入算出，不需要 `AssistantService`；开跑包进回调后照常写，类也跟着变小。

余项 BL-154（10-17，防腐线 §10.24 记下，统筹定了改法）：同一会话两轮同时发，前一轮加了 `.rN`，后一轮读图见它开着就沿用，前一轮随后起不来时，原来会把后一轮正在跑的这一步结束掉。现在失败分支只结束还是 `ready`（没有哪一轮在上面开始过）的那一步；已经有一轮开始了，这一步归那一轮，由它结束。看状态和结束是同一步：`AgentWorkGraphPort.end` 带 `if_ready` 时，适配器对同一次读到的图判断状态，并按那一次的版本结束，中间有变化就结束失败、这一步留着（统筹审 #665 时指出：在 Molis 这边先读再结束是两步，另一轮仍可能在两步之间从 `ready` 走到 `running`）。剩下的窗口：后一轮已经选定这一步、还没开始时前一轮结束了它，后一轮起跑时被拒（这一步已结束），人重发一次就落在新的一步上，图上不会有跑着却算「结束了」的子任务。用例 W2-18-DELEGATION-PLACED-02（两轮真的同时发）、-03（适配器：跑着的一步留着，`ready` 的结束）。

- 验证（变基到 main `5239a371` 之后）：
  - `pnpm build` 通过。`pnpm api:update` 没有再改快照：`contracts/services/agent-collaboration` 只多 `works?`、`AgentWorkGraphPort`、`AgentWorkNode`，和 §6.0j 的 `revise` 并存。
  - 助理的全部非浏览器用例，加上 §6.0j 的修订用例（`agent-collaboration-revise`、`prologue-step-amend`、`prologue-project-board`、`coding-step-claims`、`coding-plan-amend-http`、`coding-runtime-regressions`）和 `prologue-taskboard`，共 40 个文件，39 个一次过。
    - 第 40 个是 `system-search-lifecycle`：在机器满载（负载 16～21）的批次里红了三次，都是刚建的目标还没进索引，搜索就先回答了。
    - 单独跑时，这条分支和干净基线（main `446c0521`）同时各跑三次，都是 3/3 过。判为负载下的时序，不是这一片引入的。
  - 变基前跑过 `affected-tests` 选的 193 个文件，满载下 13 个红。单独重跑后过了 10 个。
    - 剩下的 `installed-plugin-host`、`prologue-documents` 是超时（30 秒、120 秒）；`system-search-lifecycle` 同上。
    - 这三个在基线上一次都过。
  - 变异：去掉 `ended()` 那一行，`assistant-delegation` 的 11 条里 7 条红。
  - `check-health-gates --base origin/main`、`boundary:check` 都过；`pnpm test:security` 58/58，`pnpm test:contracts` 44/44。
    - `AssistantService` 1643→1640 行，方法数 98 不变；`AssistantStore` 不变；`assistant-delegation.ts` 的类 293 行，在 300 以下。
- 未验证：
  - 两个浏览器用例（`assistant-handback.e2e`、`assistant-follow-live.e2e`）留给统筹排的全量。
  - 真实模型没走：这一片不改提示词，也不改工具说明。
  - 宿主中途重启以后，子任务那一步怎么对账：SDK 的重开对账照旧，Molis 这边没有单测。

## 6.0l App-tools 只读外部等待的统一 SDK（2026-10-17）

状态：本节实现与验证完成，Prologue #35 和 Molis #644 均已合入；Molis 的合并提交为 `447bec2e039aacd8b8a64438b1353c72071b87e4`，PR CI 与合并队列必需检查通过。用户已授权这份等待修复推送、开 PR、检查通过后合入并更新 Molis。原 mcp-refresh 包的 App-tools 名单拒绝 `board-wait`；统一连接功能需要同一个 Runtime 在本人操作期间停止模型调用，并由持久接续继续原任务。本次只采用上游已合入的 SDK，包含原有 MCP refresh 与对象引用题能力；不改 Molis 的 Agent 角色、提示词、业务等待存储或真实 Home。

上游合同见 [Prologue #35](https://github.com/molis-ai/prologue/pull/35) 的 `docs/slices/app-tools-waits.md`：仅绑定当前持有节点的顶层 App-tools Run 可等待 App 的只读外部检查器；命令、信封、节点和待答问题条件拒绝。沿用已有任务图、取消、权限复核与接续。公开常量新增一个工具名，参数与持久化形状不变。换包范围是 agent-host 的依赖、工作区登记、锁文件、vendor 来源与历史、来源测试及 S-13 的当前包指向；仅保留这一份 SDK。回退可由 Git 恢复上一份包及其同一组依赖文件，不引入读取兼容。

验收沿用上游 ATW-01—ATW-05（`app-mode-waits.live.test.ts`、`app-mode.live.test.ts`）：真实 Node Host 的等待、重启、单次接续、拒绝和取消通过；干净安装包的公开消费者通过。Molis 侧验证 S-13（`tests/prologue-memory-boundary.test.ts`）和 agent-host 的必跑回归，执行整体构建、merge-base health、边界、版本、资源与密钥检查。真实 MiniMax 的完整只读任务在连接功能分支中继续，累计 240 次，不作为此换包已经完成的证据。

集成回归发现 P4 工作图的绑定路径遗漏接续请求键：等待已满足后仍以新随机键开下一轮，旧接续一直 eligible，宿主会反复接续。该工作图绑定复用原 eligibleContinuation 查询，只在当前图、当前会话选取 SDK 请求键，交给原幂等启动；不新增等待或去重存储。PA-23 在项目图与工作图上分别验证撤权启动不消费接续、后续一轮消费接续、重开后没有 eligible 项或额外模型调用。新增工作图场景在旧实现失败、修复后通过；连接功能分支的四项真实 MCP 业务回归也已通过。

新增开放的 board-wait 是持久等待的登记操作；助理工作状态已有等候投影，活动列表不再把这个工具原名显示给人。沿用现有内部控制事件的省略规则，不隐藏等待状态或失败诊断；`tests/assistant-tool-words.test.ts` 验证活动呈现，完整业务回归验证工作确实处于 waiting-input。

本地验证：统一包构建、冻结离线安装、204 个相关非浏览器文件通过；补齐工作图请求键后重新整体构建，PA-23 与委派/交回三文件 18 项通过，同一修复在连接功能分支的 77 个 Agent/Prologue 及相关文件通过。merge-base health、包边界、资源预算、版本及密钥扫描通过。[Molis #644](https://github.com/molis-ai/molis-work/pull/644) 的 PR CI 全部通过，含两份安全检查与 Linux 产品子集 376/376 文件，无失败、重试后通过、跳过或隔离文件。连接功能分支随后用同一 MiniMax 跑三项全新完整只读任务，首项参数错误失败、后两项各自动接续一次并真实读取一次，零 Pages 写入；累计 235/240，本轮复验结束。原失败不改判，也不据此宣称整个连接功能已达到内部完整。

## 6.0m MCP 参数注解与派出校验的统一 SDK（2026-10-17）

状态：已合入，工程验证通过；连接功能的真实模型与体验验收另记。一骏已授权提交、合入上游修复并更新 Molis；[Prologue #36](https://github.com/molis-ai/prologue/pull/36) 已合入 `d2b3daa3de0744504b3098a17604f5f66019a29e`。真实 GitHub MCP 的 46 个工具原先因 `default` 与 `x-mcp-header` 被筛成 6 个，阻塞同一连接跨入口读取。本节更新统一 SDK、来源及历史记录、对应依赖锁，并把连接功能分支已有的 MCP 动作 schema 注解处理与生产派出回归纳入主线，不发布整个连接功能分支，不改真实 Home。

SDK 保留原始 schema 与形状指纹，只在 MCP 校验副本移除已支持的非校验注解；不补默认参数、不新增协议头映射、不放宽模型结构输出。调用前执行原有 schema 值约束，非法输入不发到远端；未知约束与畸形注解仍拒绝。公开类型与依赖不变，回退通过 Git 恢复上一份包和同组依赖文件，不增加读取兼容。

- **PA-MCP-01**：Molis 正式 Prologue HTTP 路径可发现并调用带注解的工具；撤权、取消与未知副作用仍按原合同拒绝。证明为 `tests/external-mcp-dispatch.test.ts` 与上游 MSA-01—03。
- **PA-MCP-02**：唯一包从已合入的干净提交重建，冻结离线安装、整体构建、agent-host 必跑与相关 MCP 回归、S-13、merge-base 健康/包边界/资源/密钥检查通过。来源检查为 `tests/vendor-provenance.test.ts`；整套集成按现有统筹交由 CI。真实模型复用验收继续在连接功能分支记录，不以换包通过代替。

上游证据：24 文件 299 项回归、完整类型与构建通过；13 个干净安装消费者通过；真实 GitHub 发现 46 个工具并只读 Issue #1，零写入与模型请求。合并归档独立构建与已测包字节一致。

首次 Molis 回归发现 SDK 已保留带注解的工具，但主线动作 schema 编译器仍拒绝 `x-mcp-header`，生产派出用例在可用性断言失败。沿用连接功能分支已有的 `mcpInputContract` 处理：仅从动作参数副本移除合法一级 header 注解，保留原始快照、字段值约束、重复/嵌套/畸形和未知关键字拒绝；Home MCP 与项目 MCP 共用这一处，模型 schema 不变。`tests/connector-mcp.test.ts` 验证实际业务派出为零的拒绝与成功调用；前述派出用例验证 SDK 消费路径。包边界另检出工作区登记仍指向旧包，一并更新同一依赖记录。初轮相关 58 个非浏览器文件中 57 个通过，301 项通过、1 项失败；保留首次派出用例失败。补齐动作 schema 处理后整体重建，相关三文件 29 项通过（含新增拒绝路径），工作区登记修正后的包边界及 merge-base 健康门禁通过。页面资源仍为 25 项、7,598,359 字节，版本核对通过。浏览器 MCP 冒烟及完整集成交由 CI；没有在本机启动全量。

Molis [#650](https://github.com/molis-ai/molis-work/pull/650) 于 2026-10-17 11:05 UTC 合入 `2dd7a258389fc8cdf5fb352c0d9d534984977c04`。[PR CI](https://github.com/molis-ai/molis-work/actions/runs/39026338214) 全部通过，产品子集 377/377 文件通过，无失败、重跑后通过、跳过或隔离；两份安全检查通过。[合并队列检查](https://github.com/molis-ai/molis-work/actions/runs/39027103146) 通过。合入后逐项核对主线包、依赖与 MCP 处理源码，同已验证版本一致。
## 6.0n P4 助理一半 A2：交回改用 SDK 的等待与接续（2026-10-17）

§7.5 第 5 条的第 2、3 项：子任务交回、交回后自动接着做。A1 之后，「子任务都结束了没有」读图；这一片把「等它们」和「接着做」也交给 SDK：父 Work 的根挂一个等待，等根下所有没结束的步骤，SDK 管等待和根上唯一的接续。助理自己记的那份交回状态全删：

- 存储字段 `handed_back_run`、`hand_back_held`；
- `AssistantDelegations` 的 `watch`、`settle`、`#settling`、`owed`、`resume`；
- `AssistantService` 调的 `markHandedBack`。

交回的材料和几句通知照旧。统筹审 #637 时的两条建议（10-17）也在这一片：`ended()` 只吞 `TASKBOARD_CONFLICT` 与 `TASKBOARD_STALE_GENERATION`；补一条宿主重启的用例。

**合同**（`services/agent-collaboration`）：

- `AgentWorkNode` 多两项：`ended_at`（步骤结束的时刻）和 `continuation`（根上的接续：请求键、SDK 的状态）。
- `AgentWorkGraphPort.add` 多一个可选的 `wait_reason`：带上它，交出这一步的同时，根重挂等待，等它下面现在没结束的步骤。被拒（`agent.collaboration_conflict`）时什么都不加，见第 9 条。
- `AgentWorkGraphPort` 多两个方法：
  - `hold`：取消宿主挂在根上、还开着的等待；那个等待的接续已经 `eligible` 的，挂起给人（`blocked`）；
  - `onReady`：根的接续变成 `eligible` 时通知；订阅时先把当下已经 `eligible` 的报一遍。

**宿主**：

- 新文件 `prologue-work-waits.ts`：`handOut`（带 `wait_reason` 的 `add` 走它）、`hold`、`onReady`。同一块图上的改动逐个串行：两个子任务同时交出，各自会取消对方刚挂的等待。
  - `handOut` 先查、再加步骤、再取消宿主自己开着的等待、再挂新的。加上步骤之后等待挂不上（写失败、条件超过 SDK 的 8 个），就把这一步结束掉（`cancelled`，`add` 给的 `remove`；步骤原来就在的不动），根重新等它原来等的那些，再把错误抛出去。所以不会留下一步没人等、也没有轮站在上面的子任务（统筹审 #654 时指出）。下面三种情况拒绝（`agent.collaboration_conflict`），这时还什么都没写：
    - 根的接续正被一轮收下（`claimed`）：那一轮在下一个模型边界先收到交回的结果；
    - 根上开着这一轮自己登记的等待（`by` 不是 `app`）；
    - 根上没有在做的一轮。
  - 等待的写法：`mode: all`、`until: settled`、`onFailure: continue`、`onEarlyContinue: keep`、`by: app`、`autoContinue: true`、一周期限。
- `prologue-work-graphs.ts`：
  - `binding()`：根的接续 `eligible`、目标是这个会话时，这一轮带上接续的请求键起跑，SDK 由此把接续交给这一轮；
  - `ended()`：只吞上面两种错误，别的记进诊断页的 `ledger_failures`（`work-graph-step-end-failed`）；
  - 新的 `reconcile()`：宿主打开时，工作图上一步没结束、没有活着的尝试、最后一次尝试的 Run 已经有终态（子那一轮结束了，报告没落盘），就按那一轮的结果把这一步结束。
- `prologue-collaboration.ts` 加三个函数，Coding 的项目工作板也用：
  - `holdContinuation`：把 `eligible` 的接续挂起给人；
  - `canTakeUp`：一个请求键已经被一次被拒的开跑用过（SDK 记下了它当时解析成什么），就不能再起别的。这个接续挂起给人，这一轮不带键起跑；
  - `releaseStartClaim`：开跑被拒时，SDK 自己会把它占用的接续放回 `eligible`，但调用方已经被撤权时，那一笔连同别的一起被拒，接续会停在 `claimed`，直到下次重启。`prologue-run.ts` 在这时于调用框之外把它放回，做法和 SDK 重启恢复一样，只放「这个键下、没有 Run 收下的开跑占用」。
- `prologue-node.ts`：打开时调 `reconcile()`；诊断页把工作图记下的失败并进 `ledger_failures`。

**助理**（`assistant-delegation.ts`）：

- 交出一步时挂等待（`add` 带 `wait_reason`）：新子任务的第一步（`placeOn`）、跟进的 `.f<n>`。人在子 Work 里自己开的一轮（`.r<n>`）不挂。
- `onReady` 来了，就起「（子任务都已交回）…」那一轮，助理请求号是 `hand-back-<请求键>`。只在父的上一轮 completed、至少有一个子任务不是被停掉的时候起。
- 被拒的交回告诉人原因，在这个宿主进程里不再自己重试（`#refused`，按请求键记）；接续留给这项工作的下一轮。
- 人停止父 Work：先 `hold`，再停子任务，所以子任务被停不会让接续变成 `eligible`。正在准备的交回被撤回。
- 交回材料：上一轮开始之后结束的子任务步骤（看节点的 `ended_at`）。

**定下的几件事**（记进 §7.7）：

1. **交出时挂等待，不在父那一轮结束时挂。** 子任务若在父那一轮结束前就做完，结束时才挂，登记时结果已经先到，SDK 会把接续取消（`RESULT_FIRST`），没人接着做。交出时步骤刚加上，子那一轮还没开始，所以不会先到。
2. **接续被收下时，拒绝交出新的一步。** 再挂一个等待，会把还没送到的那份结果丢掉。
3. **一次被拒的开跑用过的请求键不再用**（`canTakeUp`）：接续挂起给人，下一轮不带键起跑。SDK 对同一个键只认同一次开跑，换了内容就冲突（`RUNTIME_IDEMPOTENCY_CONFLICT`）。结果已经在会话里，这一轮的材料里也有。
4. **被撤权的开跑留下的占用，在调用框之外放回。** 动作网关撤权以后拒绝这次调用的一切写入，SDK 自己放回占用的那一笔也在其中；不放回，以后每次交出都被第 2 条拒，直到重启。这一笔只是撤销这次调用自己的占用，不是新的业务记录。
5. **被拒的交回在本进程里不自动重试。** SDK 放回接续时会再发一次 `eligible`，如果再自动起一次，人刚看到「没有自动接着做」，接着又做了。重启后 `onReady` 再报一次，所以重启后会试一次，和以前一样。
6. **重启后不另扫助理的记录**：SDK 恢复等待与接续，`onReady` 订阅时把当下 `eligible` 的报出来；子那一轮结束、报告没落盘的，由 `reconcile()` 补上。
7. **已知的两处副作用**：
   - 上一轮里用 `status` 看过的结果，下一轮的材料里还会再出现一次。
   - 宿主在子那一轮结束和报告之间停掉时，SDK 先把那一步交还父会话，`reconcile()` 再按 succeeded 结束它。所以 SDK 写进父会话的那句提示可能说等待「失败、交回了没做完的」；Molis 自己的材料写的是对的（「开头」：已完成）。
8. **存量**：老 Home 里存的 Work 正文还带 `handed_back_run`、`hand_back_held` 两个键，`publicWork` 不再剥它们。A4 的一次性脚本要把它们删掉。在那之前，这两个键会出现在助理的 Work 视图里，没有代码读它们。A4（§6.0q）起视图按合同逐项取，这两个键不再出现；存量里的由脚本删。
9. **一个步骤只有一个接续**（统筹 10-17 定）。宿主只改自己挂的等待（`by: app`）：重挂前取消的、`hold` 取消的都只有它，`hold` 挂起给人的也只是它的接续。模型自己登记的等待（`board-wait`），宿主一概不碰。
   - 根上开着这一轮自己登记的等待时，交出新的子任务被拒（可重试），图上什么都不变：不加步骤，也不碰那个等待。等那件事有了结果、这项工作的下一轮跑起来，再交出就能成。
   - 反过来，宿主的等待开着时，模型的 `board-wait` 由 SDK 拒绝（`WAIT_ALREADY_ARMED`），宿主的等待照旧。
   - 检查都在加步骤之前。先加步骤、再挂等待被 SDK 拒，会多出一步没人等的子任务（变异 O1 实测：`p-2` 留在图上，调用方拿到 SDK 的原始错误）。

**验收**（夹具模型，真实 Prologue 节点适配器）：

| 编号 | 证明 |
| --- | --- |
| （`assistant-delegation-handback` 原四条） | 父那一轮结束时根 `waiting`、接续 `armed`；交回后 `started`。人停止后，开着的等待被取消（接续 `cancelled`）。被停掉的子任务让接续 `eligible`，但不自动接着做，人的下一轮收下它，材料里有「被停止了」。被拒时接续留在 `eligible`，重启后收下一次 |
| W2-18-HANDBACK-RESTART-01 | 子进程宿主在子那一轮回答之后、写图的第一笔时被 SIGKILL。重启后那一步 `succeeded`、带 `ended_at`；交回那一轮由宿主写、材料里有子任务的结果，接续 `started`；再调一次 `attachSchedule` 不再起第二轮 |
| W2-18-HANDBACK-STEP-END-01 | 写图失败（`EIO`）时，诊断页的 `ledger_failures` 里有 `work-graph-step-end-failed`；那一步保持 `running`，根仍在等 |
| W2-18-HANDBACK-CURRENT-01 | 三个阶段的归档都挡住了自动那一轮。被拒后接续回到 `eligible`。之后人的下一轮：在前两个阶段收下接续（`started`）；在 SDK 已经提交开跑的那一阶段，请求键已用过，接续挂起（`blocked`），这一轮照样跑完 |
| W2-18-HANDBACK-CURRENT-02 | 停止：接续 `blocked`。新的一轮：`started` |
| W2-18-HANDBACK-CURRENT-03 | 开跑在占用接续之后被当前调用方拒一次：通知一次，不自己再起；接续 `eligible`，人的下一轮收下它（`started`） |
| W2-18-HANDBACK-ONE-CONTINUATION-01 | 这一轮用 `board-wait` 登记了自己的等待：这一轮还在跑时、结束以后，交出都被拒（`agent.collaboration_conflict`），图一点没变；`hold` 不取消它，它结束后也不把它的 `eligible` 接续挂起；下一轮收下接续后，交出成功，根改等新的一步 |
| W2-18-HANDBACK-ONE-CONTINUATION-02 | 宿主的等待开着时，模型的 `board-wait` 拿到 `WAIT_ALREADY_ARMED`；根上的接续仍是宿主那个 |
| W2-18-HANDBACK-ARM-FAILED-01 | 交出 8 步之后第 9 步挂不上等待（SDK 一次最多等 8 件）：交出报错，第 9 步 `cancelled`，没结束的还是那 8 步，根仍 `armed`；8 步都结束后根才 `eligible` |

**变异**（每条改回去重建、单跑对应的用例）：

| 去掉 | 红的用例 |
| --- | --- |
| `ended()` 改回全吞 | STEP-END-01 |
| `reconcile()` | RESTART-01 |
| `releaseStartClaim` | CURRENT-01（SDK 已提交开跑的那一阶段） |
| work graph `binding()` 里的 `canTakeUp` | 同上（`RUNTIME_IDEMPOTENCY_CONFLICT`） |
| `placeOn` 交出第一步时带的 `wait_reason` | `assistant-delegation-handback` 6 条全红 |
| `#refused` | 没有用例红：放回发出的 `eligible` 通常在 `#continuing` 还占着时就到了，比赛的另一种结果测试造不出来。CURRENT-03 证明行为，不证明这一行 |
| O1 `handOut` 里「这一轮自己的等待开着」那条检查 | ONE-CONTINUATION-01（拒绝的不是协作冲突：步骤先加上了，SDK 再拒挂等待） |
| O2 只取消宿主自己的等待（改成全取消） | ONE-CONTINUATION-01（`hold` 取消了模型的等待） |
| O3 `hold` 只挂起宿主等待的接续（改成都挂） | ONE-CONTINUATION-01（模型的接续成了 `blocked`） |
| O4 先查再加（把加步骤挪到检查前） | ONE-CONTINUATION-01（被拒后图上多了 `p-2`） |
| O5 `handOut` 里挂等待 | ONE-CONTINUATION-02 |
| R1 挂不上时把这一步结束 | ARM-FAILED-01（第 9 步留成 `ready`） |
| R2 挂不上时根重新等原来的 | ARM-FAILED-01（根的接续成了 `cancelled`） |

- 验证（基于 main `c276ab9c`，含 #648 与 #650 换上的 `mcp-schema-annotations` 包）：
  - `pnpm build` 通过；`pnpm api:update` 刷新了 `contracts/services/agent-collaboration` 的快照（只有上面合同里的两项、`add` 的 `wait_reason`、两个方法）。
  - `affected-tests` 选的非浏览器文件，加上全部 `prologue-*`、`coding-*`、`agent-collab*` 非浏览器用例和助理逻辑另跑的几个（undo、business-gateway、followups、memory、work-wait），连同新的 `prologue-work-waits`，共 217 个文件，一次全过。
  - `pnpm test:security` 58/58，`pnpm test:contracts` 44/44。
  - `check-health-gates --base origin/main`、`boundary:check`、`secrets:check` 都过。
    - `AssistantService` 1629→1628 行，方法数 98 不变；`AssistantStore` 不变。
    - `AssistantDelegations` 290→254 行；`createWorkGraphs` 140 行；`createWorkWaits` 53 行。
- 未验证：
  - 浏览器用例（`assistant-handback.e2e`、`assistant-follow-live.e2e`、`alchemist-client-boundaries.e2e`）和全量：`affected-tests` 判为要全量（改了共同合同，动了三个包），由统筹排。
  - 真实模型没走：这一片不改提示词，也不改工具说明。
  - 被撤权的开跑在根上留下的那一次 `dispatching` 尝试没有修。A1 起就有，SDK 重启恢复时把它关成 `refused`，不挡后面的轮。

## 6.0o P4 助理一半 A3：后台作业是工作图上的一步（2026-10-17）

§7.5 第 5 条剩下的一项：助理跟进的后台作业（动作声明了 `background_job`）。A2 之后，子任务交回读图；这一片把后台作业也放到 Work 的图上，用换包 #668 带进来的 Prologue #37（`afterwards: "end-step"`：宿主的等待结束时，步骤照等待的结果结束，不接着做任何事，也不往会话里写字）。助理自己记的那一份全删：

- `assistant.job-check` 排程和它的执行者（`#jobRunnerFor`、`#detachJobs`）；
- `watchJob`、`scheduleJobCheck`、`checkJob`；
- 存储里的 `StoredJob`、`jobs()`、`saveJob()`，`markTold` 的 `jobs`，轮材料里的 `told.jobs`。

通知、卡片结算和下一轮材料里的那几句话照旧。

**合同**（`services/agent-collaboration`）：

- `AgentWorkNode` 多一项 `job`：作业在主人那里的编号、开始跟进的时刻（宿主挂等待的那一刻），结束后再加怎样结束的（`done`、`failed`、`expired`、`unchecked`）和结束的时刻。主人说的状态不记（见第 6 条）。
- `AssistantBackgroundJob` 去掉 `last_state`：没有结构化的来源再填它（第 6 条）；工作面板的作业卡只显示进行中、完成、没完成、不再跟进。
- 新类型 `AgentWorkJobQuery`：主人的只读状态查询（精确引用）、点名这项作业的输入、回答里状态的位置、哪些状态算完成、哪些算失败。
- `AgentWorkGraphPort` 多两个方法：
  - `follow`：在根下加一步 `job.<键>`，没有会话持有它，宿主挂等待去看。同一个键再来一次什么都不变。看的节奏（`every`）和期限（`deadline_ms`）由 Work 的主人给，SDK 夹在自己的界内。
  - `onJobEnded`：作业的那一步结束时通知；订阅时先把已经结束的报一遍。
- 交回的说明改成：根等的是根下没结束的**子任务**，子任务是有会话持有的步骤，后台作业不是。

**宿主**：

- 新文件 `prologue-work-jobs.ts`：
  - `follow`：加步骤（不给持有者）→ 置为 `running` → 挂宿主的等待：`external` 条件、检查器 `molis.action-query@1`、`mode: all`、`until: success`、`onFailure: continue`、`onEarlyContinue: keep`、`autoContinue: false`、`afterwards: end-step`。等待挂不上就把这一步结束（`cancelled`），再把错误抛出去。两边同时加同一步时，后到的那个重读，步骤已在就直接用。
  - 视图：作业编号取等待的 `source`，开始跟进的时刻取等待的 `createdAtMs`，结束时刻取节点的 `endedAtMs`；SDK 不再看、把步骤挂给人（`needs-reconciliation`，不是终态，没有 `endedAtMs`）时取等待的 `settledAtMs`。没有宿主等待的那一步（等待没挂上、已被收回）不是在跟进的作业：没有 `job`，结束时也不报给 `onJobEnded`，不编一个开始时刻。SDK 不删已结束的等待，所以跟进过的作业一直读得到。
- `prologue-checkers.ts`：没有轮的宿主等待（`by: app`、`afterwards: end-step`）每次看都向 `checks.workAuthority({ graph_id, node_id })` 要跟进它的那项工作此刻的授权。工作不在了就 refused；读不到算这次不知道（SDK 再看）。查询的名字是宿主按精确引用写的 `molis-job-query:[provider, capability, version]`，检查器把它换回引用。任何一轮的工具表里都没有这种名字，所以模型的等待写它照样被拒。只读查询、不调模型、受众到 Agent 的规则不变。作业只声明了完成和失败两组状态，别的状态都算「还没好」。
- `prologue-work-waits.ts`：根的交回等待只等有会话持有的步骤。
- `prologue-waits.ts`：会话的等待视图跳过结束步骤的等待。从它不会接着做任何事，它也不能盖住根上的交回等待。
- Molis 宿主：
  - 新文件 `apps/local-host/src/agent-work-authority.ts`：按宿主登记谁给工作的授权。
  - `agent-host-composition.ts` 把它接进 `checks.workAuthority`。还没人登记时抛错，这一次算不知道。
  - `assistant-http.ts` 建好助理服务就登记 `service.jobs.authority`。Web 服务在运行时启动前就建它，所以重启后第一次看时就在。

**助理**（新协作者 `assistant-jobs.ts` 的 `AssistantJobs`，只经端口依赖宿主）：

- `follow`：动作声明了 `background_job`、输出里有作业编号时跟进。
  - 键是 `<work_id>.<提供方、状态查询、版本、作业编号的哈希>`。
  - 挂在这项工作自己的图上；子任务没有自己的图，挂在委派它的那项工作的图上。
  - 跟进前重读工作：新工作的图在第一轮之前才打开，比这一轮拿到的工作副本晚。
  - 同一个键正在跟进时，进程内合并成一次。
- 卡片：跑卡片时，动作自己的结果报告和卡片同时报同一项作业，合成一步。
  - 卡片显示「已开始，后台进行中」之后，再把 `job_step` 记到卡片上。这时作业已经结束的，卡片当场结算。
  - 另一张卡片已经拿着这一步的，这张只显示动作的结果。
- `views`：工作视图里的 `jobs` 从图上读，公开形状 `AssistantBackgroundJob` 只去掉 `last_state`。
- `material`：下一轮的「后台任务」材料，列还在进行的作业，加上上一轮开始之后结束的（看作业的结束时刻），和 A2 的交回材料一样读。
- `authority`：给检查器的，是这项工作的轮拿到的动作客户端（`ports.authority(work).actions`）。
- `attach`（在 `attachSchedule` 里）：订阅 `onJobEnded`。每项作业结束提醒一次（键 `job:<图>:<步>`），拿着它的卡片随之结算，只说完成了还是没完成。每次启动都会把结束过的作业重报一遍：已经提醒过、也没有还在进行的卡片指着它的，不读图就跳过（`AssistantStore.noticeRaised`）。
- 跟进作业的那项工作，从步骤的 id 找：`job.<work_id>.<16 位哈希>` 里取出 `work_id`，`store.get` 它，再核对作业挂在它的图上；找不到就是真的不在了。不按最近变过的若干项工作去找。
- 轮的 `started_at` 改记成读材料的那一刻，原来是开跑之后。
- `hasTimedWork`：图只有运行时读得到，于是改成「6 小时内有工作变过或有卡片动过」（`AssistantStore.activeSince`）。
- 工作面板的长等待也听工作图的变化，作业一结束面板就更新。

**定下的几件事**（记进 §7.7）：

1. **一项后台作业是根下没人持有的一步，不是子任务。** 交回等待只等会话持有的步骤。轮只站在自己会话持有的步骤上（`binding()` 用 `assignedTo`），所以从不站到作业那一步上，也不随轮结束而结束它。
2. **结束只看引用，由 Work 自己从图上读**（统筹 10-17 定）。下一轮的标注材料里放上一轮开始之后结束的作业，按步骤的状态和结束时刻读。没有第二份记录，也没有「已告诉」标记。
   - 一轮只在开跑成功后才记下，所以开跑失败那一次不算告诉过，下一次再算。
   - 轮的开始时刻记成读材料那一刻，所以读材料到开跑之间结束的作业落到下一轮。正好一次。
3. **每次看都用这项工作此刻的授权**：受众 Agent，减去人对助理关掉的动作。以前 `checkJob` 用人的客户端（`scopeActions`）。所以状态查询要对 Agent 开放；只给人用的查询现在会被拒，作业记成不能再查看。
4. **节奏和期限照旧**：15 秒起，每次翻倍，最多 5 分钟一次；6 小时期限。SDK 的默认最长间隔是 1 小时，所以节奏由 Work 的主人在 `follow` 里给。
   - 和以前不同的一处：以前读不到就一直重试到 6 小时。现在连续 5 次读不到（SDK 的上限，调不大）或被拒，就不再跟进，步骤 `needs-reconciliation`，人收到「不能再查看它的状态」。
5. **存量**：
   - `assistant_jobs` 表留在 2 号基线里，不再写。工作或项目删掉时照样删它的行。A3 不改基线、不写维护。
   - **未决项，用户 10-17 定「以后的一片」**：那一片加 3 号基线，它的维护和维护八在同一次安装里跑（维护清单的条目用 BL-157 的表格式）。维护先把还挂在表里作业上、仍是 `running` 的卡片结掉（「升级后不再跟进，请到原处查看」），再删表。
   - 升级前还在跟进的作业，升级后不再跟进。不迁移：合同只认现行形状。
6. **主人说的状态不记**（统筹审 #675 定）。原来从等待观察记录的说明（`note`）里找「」回答 」，把后面那段当成状态：这是按措辞取事实（和 D2，#592 定的方向相反），说明有长度上限，状态里带「，」也会被截掉，SDK 也写明说明不放主人自己的内容。现在通知、卡片和下一轮的材料只说完成了还是没完成。以后真要显示，得有结构化的来源（比如请 Prologue 给 `ConditionObservation` 加一个有界的值，随下次换包），开写前先报统筹。

**验收**（夹具模型，真实 Prologue 节点适配器）：

| 编号 | 证明 |
| --- | --- |
| W2-18-JOB-STEP-01 | 跟进的作业是根下没人持有、`running` 的一步。同一个键再跟进一次，图不变。看时带上点名作业的输入。作业完成后步骤 `succeeded`，`ended: done`，有结束时刻，开始时刻不变。之后不再看。结束只通知一次。不调模型。每次看都按这一步要授权 |
| W2-18-JOB-STEP-02 | 交出 `p-1` 后根只等 `p-1`。之后再跟进的作业不盖住会话的等待。`p-1` 结束、作业还在跑时，根的接续 `eligible`。下一轮站在根上，作业那一步仍 `running`、没人持有 |
| W2-18-JOB-STEP-03 | 宿主重启后照样去看，用的是工作的授权。作业完成后步骤结束 |
| W2-18-JOB-STEP-04 | 宿主停着的时候作业失败：再起来后步骤 `failed` 一次，订阅时立刻报出来，之后图不再变，也不再看 |
| W2-18-JOB-STEP-05 | 工作不在了：一次都不看，步骤挂给人，`ended: unchecked` |
| W2-18-JOB-01 | 一轮开始的作业在新工作的图上跟进。完成后提醒一次。第二轮的材料里有「（任务 job-1）：已完成」，第三轮没有。卡片开始的作业，卡片一直显示进行中，作业失败后卡片显示「后台没有完成」 |
| W2-18-JOB-02 | 卡片开始的作业只有一步，归这张卡片。完成后卡片显示「后台已完成」。在同一个 Home 上重建助理（如同重启），还是只有一条提醒 |
| W2-18-JOB-03 | 开跑失败（没有模型）的那一次什么都没告诉。下一次开跑的那一轮听到这项作业，再下一轮不再听到（`assistant-undo`） |
| W2-18-JOB-04 | 跟进作业的那项工作后面又建了 500 项工作（它不在最近的 500 项里）：作业照样按它的授权看到结束，卡片显示「后台已完成」，人收到提醒 |
| W2-18-JOB-STEP-06 | 等待挂不上（期限已过，SDK 拒绝）的那一步被收回（`cancelled`），没有 `job`，也不报给 `onJobEnded`，一次都没看 |
| S-27 JOB-01 | 模型的等待写宿主那种作业查询的名字，登记时被拒，什么动作都没调 |
| S-27 JOB-02 | 看过一次之后收回授权：下一次看被拒，步骤挂给人（`unchecked`），被拒的那一次和之后都没再调用查询，也没有模型调用 |

**变异**（每条改回去重建、单跑对应的用例）：

| 变异 | 变红的用例 |
| --- | --- |
| M1 根的交回等待不看持有者 | STEP-02 |
| M2 会话的等待视图不跳过结束步骤的等待 | STEP-02 |
| M3 宿主的等待不走 `workRound` | STEP-01、-03、-04 |
| M4 作业那一步派给根的会话 | STEP-01～05 |
| M5 「上一轮开始」取成第一轮的开始 | JOB-01、JOB-03 |
| M6 提醒的键每次不同 | JOB-01、JOB-02 |
| M7 挂给人的一步不取等待的 `settledAtMs` | STEP-05 |
| R2 没有等待的那一步照旧给 `job`，开始时刻编成 1970 年 | STEP-06 |
| R2b `onJobEnded` 不看有没有等待 | STEP-06 |
| R3 跟进的工作只在最近的 500 项里找 | JOB-04 |

没有用例看住的四处：
- 重报时已经提醒过就跳过（R4，去掉它 52/52 仍过）：只省读图和扫卡片，提醒本来就按键只发一次。
- 轮的开始时刻记在读材料那一刻：改回开跑之后，只有在读材料和开跑之间结束的作业会漏掉，用例造不出这个时序（去掉它 51/51、5/5 仍过）。
- 卡片记上 `job_step` 时作业已经结束、当场结算：只有作业比卡片的写入还快才走到，用例造不出这个时序（去掉它 51/51 仍过）。
- `#following` 的进程内合并：适配器对同一步本来就重读、直接用，去掉也不变红；它省的是一次多余的加步骤（51/51 仍过）。

- 验证（叠在 #665 合上 main 的 `72db37a47` 上：main `250814e3d` 已含 #654 与 #668）：
  - `pnpm build` 通过；`pnpm api:update` 刷新了 `contracts/services/agent-collaboration`（`AgentWorkNode.job`、`AgentWorkJobQuery`、`follow`、`onJobEnded`）和 `contracts/services/assistant`（去掉 `last_state`）的快照；工作台脚本小了 55 字节，`page-assets.json` 跟着降。
  - `affected-tests` 选的非浏览器文件，加上全部 `prologue-*`、`assistant-*`、`agent-collab*`、`coding-*` 非浏览器用例和 `security-invariants-doc`，第一版 239 个文件一次全过；按统筹审查改完之后（加上工作台脚本带出的用例）共 268 个文件，一次全过。
  - `pnpm test:security` 59/59，`pnpm test:contracts` 44/44。
  - `check-health-gates --base origin/main`、`boundary:check`、`secrets:check` 都过。
    - `AssistantService` 1628→1555 行，方法数 98→94；`AssistantStore` 267 行、39 个方法，与 main 相同（去掉作业的读写，加上 `noticeRaised`）。
    - `composeAgentHost` 不变（查登记的那几行放进 `agent-work-authority.ts` 的 `workAuthorityCheck`）；`AssistantJobs` 所在文件 179 行，`prologue-work-jobs.ts` 86 行。
- 未验证：
  - 浏览器用例和全量：改了共同合同和三个包，由统筹排。
  - 真实模型没走：这一片不改提示词，也不改工具说明。
