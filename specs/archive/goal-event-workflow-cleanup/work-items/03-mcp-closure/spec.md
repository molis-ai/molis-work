# 03 MCP 收敛与日常记录闭环

状态：A/B主验收通过，C内部清理与历史夹具适配执行中，2026-09-10。B生产边界/身份/演示/检查已完成，原writer正常退出；当前测试与历史阅读保留要求见文末。depends_on：01/02 主验收（均已通过）。主需求：[../../spec.md](../../spec.md) C1–4/6；审查 F6/F8。完成等级：4 的本项切片。B交回见 [b-handoff.md](b-handoff.md)。

## 用户行为

绑定项目后，Runtime 明确选择 goal_id 即可读取和记录。普通笔记不需要注册局部类型；一批工作更新可带多个事实和进展说明，回执给出紧凑当前状态、要求差距与游标。完成与取消都可明确继续新一轮，必须给原因，重试不重复；普通无关记录不会自动重开。

Runtime 工具清单只有新协议所需用途；旧名字既不出现在 discovery，也不能通过 dispatch、CLI、Web 或 Host capability 继续执行旧工作流。普通上报、正式约定和结构事实继续由各自有限 typed 接口表达，不能浓缩为任意 action/payload 的万能 JSON 工具。

## 已有调用证据与清理范围

- `apps/mcp/src/tool-catalog.ts` 当前 Runtime 57 工具；`goal-tools.ts`/`goal-event-tools.ts`/`context-tools.ts` + `tool-schemas.ts` 构成 schema。旧 execution/draft/legacy proposal 在 `tool-dispatch.ts` 显式构造 handler 并 switch dispatch。
- `apps/local-host/src/project-capabilities.ts` 注册实际旧写入；`goal-project-application.ts` 构造旧 execution validation/draft/legacy proposal 服务，`web-request.ts` 把旧决定 handler 传给 Native Goals Web。只删工具白名单不算完成。
- `apps/cli/src/{execution,draft-dialogue,legacy-proposal}-commands.ts` 与 `goal-commands.ts`/dispatch 仍可执行同一旧协议；这些不是保留旧生产实现的理由。`apps/local-host/src/demo-seed.ts` 的旧 Claim/Run/Evidence/Review seed 必须改用当前事件真实故事，保留有用演示结果。
- 历史查询/旧数据库升级/文件阅读与真实 Runtime Session、终端进程另有现有职责，应按实际调用保留。不能因类名里有 execution/run 而误删平台进程能力。

应移除的公共旧工具：claim/select_goal/claim_renew/release/revoke_claim/run_start/run_report/evidence_submit/evidence_correct/review_submit/revalidate/rework_request/complete；draft_dialogue_start/turn/resume；contract_propose/decide/candidate_submit/decide/dependency_propose/rewire_confirm；旧 ready/available/contract/explain 工作入口及其专属 schema/handler/adapter。管理旧 create_goal 不得成为第二套创建，02 后可删除同义入口，保留唯一 intent 创建。全量 snapshot 若仅用来公开旧执行 projection，则退出普通 Runtime；备份/诊断读取可在管理保留并说明实际消费者。

其余规划方法、项目指导、回收站、结构/历史工具按实际用户用途保留，给出最终名单及理由；不设工具数目标。旧图/规划读结果不得再次携带固定拆分、角色或叶子执行门禁。

## 项目与身份注入

Runtime 普通工具 schema 不要求也不接受 `board_id`、`database_path`、`web_base_url`、`actor_id`/`actor_kind`/`runtime_actor_id` 等覆盖字段。Host 从已绑定 connection 注入项目，从 Session 上下文注入操作者；调用者仍显式给 goal_id。即使传入与当前值相同，也明确拒绝覆盖字段。缺连接或 Session 不猜测身份，给出现有 context_resolve/重连恢复动作；Session 切换后先 resolve，再用原幂等键重试，不重新 bind 或机械询问用户。

管理入口显式 project/actor 和受保护用户决定保留。context_* 项目选择工具在未绑定时运行，维持已有独立合同，不能把普通工具的 board 注入逻辑误套到项目选择。Runtime 不可用 user_confirmed/文字摘要伪造对具体约定或树变更的用户授权。

实现位置是实际 `mcp-authority.ts`/`mcp-event-identity.ts`/`LocalMcpServer.callV1Tool` -> scoped dispatch；schema 与运行检查一致。避免另造重复身份模型或按每个工具手写不一致 fallback。

## 上报与继续

1. 选择一处有限的普通笔记入口（如 event_note）接入现有 `recordNote`；无 types/config 时可保存、读取和重启恢复。
2. report 沿用现有整批事务语义：本次任何一个事实非法则整批回滚；已成功提交的其它历史批次保留。这里的“部分结果可以先保存”指用户可以报告尚未全部完成的工作，不指同一失败批次逐项落地。`event-facts.ts` 当前先 prepare 全部再写入，现有 MCP 回归明确断言非法批次回滚，不为回执完善另造部分成功协议。新增可选紧凑进展字段或沿用已有 progress 能力时说明一次调用如何保存工作更新；不可把普通笔记包装成假类型/空字段报告。
3. 返回 saved facts/当前 work_status/必要 gaps/游标与 replayed；不附全量历史或多个同义 current_agreement/legacy projection。失败说明哪项输入有问题，本批次无写入；可修正后重新提交，已成功调用的同键相同输入不重复、不同输入拒绝。正式 CAS 不扩大到日常记录。
4. `event_resume` 统一 completed/cancelled 的明确继续，原因必填。已有新状态重放返回原结果，不因状态已变化而失败；对 open 的新请求明确报无须重开，不伪造新一轮。Web 也用同一个应用入口，删除 reopen_completed/resume_kind 等同义旧调用胶水。此次不重做时间线视觉。

## 允许修改与边界

允许 MCP/CLI schema/dispatch/adapter、Local Host capabilities/composition/identity、Native Goals 退役写入服务与相关 HTTP、Goals/Governance/Execution/Evidence 仅在确无新写入职责时删除退役代码/类型/exports，保留实际历史仓储/升级/查询；事件 notes/report/resume API 与这些行为的测试。按02交付后的真实引用更新 scoped plan，先列旧调用的最终去向，再执行删除。

不包含 Skill/全部文档重写、依赖升级、真实安装/数据迁移、外部发布、重做UI。生产删除造成的 README/CLI help 明显失真可同步最小入口说明；完整中英文和 Skill 归04。

## 验收与 handoff

- 公开 Runtime MCP 从真实连接开始，用不带项目/身份字段的最短参数跑 list/create/state/note/configure/report/agree/decision request/close/resume；错误覆盖字段拒绝且无写入/焦点变化；管理入口仍可做真实用户决定。
- 每个退役工具通过 discovery 与真实 dispatch 验证不可调用；CLI/HTTP/Host 注册无同义旧后门。不是只匹配 source 字符串宣称清理。
- 无配置笔记在历史可读；一次报告多个事实及进展，回执与后续 state 一致；非法批次整批回滚、此前成功批次仍在，同键重试及重启不重复；输入失败不能伪成功。
- completed 与 cancelled 的明确继续、原因缺失、普通无关报告不重开、重试与重启全部验证。
- build、boundary、针对性回归通过。删除/改写的旧测试逐类说明退役功能/新行为承接；旧测试生成历史数据可改为明确历史 fixture，不能因此留整套旧执行生产代码。全仓留04。

交回 technical-plan.md 与实现后 handoff.md：最终 Runtime/管理工具名单、生产调用链及保留职责、删除测试的映射、真实命令结果/日志与未完项。主总状态文件仅由主更新。临时日志 `/private/tmp/molis-work-flow-cleanup/03-*`。

## 技术方案主裁决（2026-09-10）

采用 [technical-plan.md](technical-plan.md) 的有限输入、紧凑回执、单一resume、最终工具用途与A/B/C串行顺序。以下澄清在实现前确定，不是新用户审批：

1. 保留独立 `event_progress`：没有新事实时更新进展，保留其 `based_on_cursor` 语义；report的可选progress用于随本批事实一起更新，两者用途不同。组合progress只允许summary/next_step/next_actor，严格校验实际原始字段和类型，未知字段/错误类型不能静默丢弃。完整有效输入纳入同一幂等请求；本批事实、reassess与进展处于同一事务，最终游标包含本批状态和进展事件。
2. 回执采用方案的顶层紧凑字段。重放返回原保存events和现读的work_status/gaps/progress_summary/cursors/completion_effect/can_record。只从现有readState取当前事实，不另写完成或差距算法，也不增加同义agreement/projection副本。无关后来记录之后重放仍应反映现在且不产生新事件。
3. 普通Runtime全部schema去掉并实际拒绝项目/身份覆盖；保留工具里的指导、规划、回收站等写入也从Host注入操作者，不能只修event工具。context_*与project_delete维持各自项目选择合同；其余既有user_confirmed只承担该具体操作的确认，不能被复用为树/约定可信批准。Runtime tree/约定自证仍拒绝。
4. Session活动必须覆盖新note/report/resume，当前Session焦点与活动持久保存，同键只记录一次；失败输入不得改焦点或活动。主写已提交但次级Registry失败时，主事实仍成功、context读能看到该失败。保留真实Session/终端职责，不向终端发送或改变其绑定。
5. C的删除不能止于ExecutionValidationApplication和公开handlers。继续删除Module中无新职责的旧commands/lifecycle/专用types/exports及构造hooks；Goals/Governance中只服务旧Contract/Candidate/Rewire/Review/Run的写服务同样处理。保留项必须列实际生产读、迁移或当前结构/事件调用者；历史仓储或管理只读删除保护所需query不要求删除。旧测试不能成为保留写协议的理由。
6. 保留的import_v3是历史数据导入职责，导入后的Goal不能成为第二套可继续执行的旧协议；C需核对实际导入调用链，复用同一事件转换或明确历史只读方案，不另写完成算法。迁移36的原数据/批准作用/历史必须保持。项目删除的现有独立确认和只读保护本步不重设计，不能因为清理执行写入就顺带删除该保护。

A只实施日常调用、身份与统一resume；旧公共工具名字在B统一退役，整个03只在A/B/C完成后验收。A主验收用03-runtime-core-acceptance.mjs（保留所有日常闭环保护，暂不要求B的退役边界）；最终03-runtime-acceptance.mjs仍对真实discovery/dispatch做完整退役断言。

### A实施中的现有恢复行为复核

主 `03-session-repair-acceptance.mjs` 已对02构建验证通过（`03-session-repair-before.log`）：真实Runtime报告主事实已提交但Registry路径不可写时，主结果仍成功、Session活动未写、context明确报告unavailable；恢复路径后原键重试补齐当前Session焦点及恰好一条活动，主报告仍仅一份，再重试无重复。探针首次仅缺真实catalog绑定，已补上同Session项目绑定后验证，不改业务断言。A不能仅因report回执`replayed=true`就在活动提取层无条件跳过，导致已提交事实的次级记录永久缺失；沿用现有Session source_id幂等职责并保留这条可恢复路径。

主在A首个构建完成后，`03-a-root-core.log` 全部通过（真实Runtime的普通输入/身份、note、整批报告+进展、动态当前回执、反证最终游标、completed/cancelled继续及重启）；`03-a-root-agreement.log`、`03-a-root-tree.log`、`03-a-root-migration.log`也通过01/02原行为断言。Session恢复探针在新代码失败，确认无条件跳过重放是新增回归，已交writer修正。

实际Web `03-a-root-web-before.log` 验证completed/cancelled的记录、继续、重试和服务重启均通过，但新的HTTP report适配把非对象progress静默改成undefined，导致非法进展被丢弃、同批事实却返回200并落地。这与整批输入合同冲突；HTTP须保留原始progress交给同一有限校验，或在交给模块前明确拒绝，不能先过滤掉。主 `03-web-acceptance.mjs` 同时验证此失败无写入与已经通过的Web继续路径。

### A主验收通过

上述两处适配回归已修正。主在最终构建独立执行 `03-a-root-core-final.log`、`03-a-root-session-repair-final.log`、`03-a-root-web-final.log`、`03-a-root-agreement-final.log`、`03-a-root-migration-final.log` 全部通过。实际树提案/Host焦点回归 `03-a-root-tree.log` 在本轮身份改变后通过，该部分此后未再变更。source_id保证Session次级恢复无重复；HTTP不再丢掉非法progress。50个A定向测试通过，0失败/0skip，build与boundary通过；没有为测试省略结果说明而放宽正式完成，也没有为缺catalog绑定而放宽context恢复。

A关闭，B/C仍待完成；全仓和最终Skill/UI仍归04。diff空白检查仅 `apps/local-host/src/mcp-event-identity.ts:176` 多余EOF空行，随B对该文件的旧名字清理一并移除，不影响A行为结论。

### C实施前的实际调用补证

主只读核对确认两处当前保留功能仍消费旧状态，C实施前按本节补技术方案，不再做全面扫描：

- `apps/local-host/src/board-v3-import.ts` → Native `board-v3-import.ts` 使用 `createGoal`、`addRelation`、`importLegacyCoverage`、`completeLegacyBoardImport`。它在当前建库迁移完成后才写旧草稿、固定 `closed_leaf/closed_compound` 与合成的人工验收条件；没有把这些新导入记录交给事件状态，因此不能仅凭保留 `import_v3` 工具宣称导入已接通。C选择复用当前创建/转换路径，在同一导入事务中保留真实旧标题、树、inputs/outputs、constraints、coverage与来源；导入后的状态和普通笔记须可通过当前公开工具读写，不能要求已退役的接受/领取流程。若具体转换会新增用户承诺，先在技术方案说明映射和取舍，不把合成的旧门禁当真实用户要求。
- `planning/engine.ts` 的 `analyzeChange` 实际调用 `goal-graph.ts`；其中 `reusable_open_goal_ids` 仍过滤 `decomposition_state`，`planningMetrics` 仍消费旧 `fulfillment_state`。真实的父子/依赖图检查、受影响祖先/依赖和拓扑顺序有当前用途，应保留；继续工作的候选和状态须来自事件状态，不能由旧拆分种类或旧完成投影筛出。当前树决定的语义影响提示也消费该结果，属于同一调用链。`validatePlanningProposalGraph` 中旧 candidate/contract/dependency payload 分支需按02的有限当前提案调用者核对，不能保留为第二套任意输入协议。

验收增加：真实管理 `import_v3` 导入含父子、输入输出、约束、coverage的V3数据后，用当前 Runtime state/note工作并重启验证，旧接受/领取仍不可调用；当前结构影响分析在事件 completed/open切换后返回一致候选，旧 decomposition字段不再构成门禁。四份实际v35历史迁移探针保持原断言。

主在C实施前复现：`03-c-import-before.log` 的真实管理导入保留字段/关系/coverage及拒绝覆盖均通过，随后当前Runtime state断言失败（owner为null）；`03-c-planning-before.log` 在当前MCP创建→真实类型/要求/支持报告→完成→明确继续后，仅历史decomposition为closed_compound就漏掉当前open Goal。临时探针为 `03-import-planning-acceptance.mjs`（完整）与 `03-planning-only-acceptance.mjs`（独立图基线），均归主维护，不许writer修改。首次探针缺Web URL、首次图用例缺有效结果要求仅属主测试输入问题，已补真实参数和报告，最终上述失败才是业务反例。

### B主检查补充：保留回收站工具的嵌套身份遗漏

主 `03-b-auxiliary-before.log` 通过真实Runtime复现旧payload中的actor可写入回收站，调用没有被拒绝。根因是 `v1PayloadTool` 的嵌套actor仍在schema内，A只处理顶层字段；Host将actor注入顶层后，`goal-trash-commands.ts` 又从 `mcpBoardPayload` 读取嵌套actor，忽略了注入值。A对事件/指导/规划的顶层保护结论保留，但“全部保留写工具身份均已闭环”的结论由此补正。

B一并修正：goal_trash/goal_restore/goal_trash_list改成与其它普通工具一致的有限顶层输入；Runtime无board/actor，Host注入，管理入口在同一顶层显式提供身份；不保留旧payload信封作为别名。拒绝旧嵌套操作者请求，无Goal/审计变化。原有这些具体操作的user_confirmed合同保留，不可用来批准树/约定。验收主 `03-auxiliary-identity-acceptance.mjs` 的真实最短调用、最终审计actor、删除/恢复重试、未确认拒绝及指导持久化；原A和B探针保持。B新 `goal-command-wire.test.ts` 中 `?? 1` 兜底不能证明持久化，改为真实读取指导及其内容/归属，删除只测typeof的无意义断言。

### B补正后的主独立验证与C测试保留

`03-b-root-{auxiliary,demo,runtime,retirement,tree}-final.log` 均通过。实际回收站拒绝嵌套伪造且最终审计使用Host身份；真实demo每个Goal均为事件所有、CORE有绑定要求和支持报告后完成，重启/再次seed不改变事实。入口/Host/CLI/capsule定向17项通过、0skip（`03-b-root-entry-tests-final.log`）；writer构建与边界检查已通过。

Diff检查发现B误删 `tests/host-entry-consistency.test.ts` 原有“Host Client scope opens before adaptation and retains resources until response completion”测试。它验证当前Host请求持有资源、排队关闭、打开失败时不执行适配，属于保留的真实Host职责。主从基线取出原断言，仅去掉TypeScript语法后在当前构建运行，`03-b-root-host-scope.log`通过。C第一步恢复该原测试与LocalHost import，保留新event/trash测试；不能把它记为旧协议退役。此覆盖补回不改变已验证生产行为，也不增加新协议。

### C执行顺序收窄

C首次侦察已覆盖构造、导入、规划、类型和调用者；尚未形成代码切片且读取持续扩大。主将同一C串行拆为C1/C2，不改变总范围：C1先恢复Host原测试、接通真实V3导入的当前事件状态、让规划候选/度量使用事件事实并修正直接相关当前方法文案；以导入/规划/四库迁移/树回归验证。C2再沿已查明调用者删除Module/Application旧写服务、专属类型/exports/hooks，并完成历史夹具与当前测试映射。C整体完成后再做04全仓；不再进行C全范围初始扫描，后续读取由具体编辑或构建/测试失败驱动。

C1主复核补充：复用 `recordIntentArtifacts` 时不能省略真实来源而落入 `source_kind=web` 默认值。导入的旧原文与导入日志保留，但当前state和事件历史也要如实显示导入来源；在现有有限来源类型里补充具体导入值即可，不另造来源体系。主导入探针增加“非网页新建”与“没有合成验收要求”断言。规划metrics的唯一旧公开调用者为待C2删除的goal-availability；不要为此保留一个缺少当前状态、把所有Goal都当open的可调用API。

C1测试复核：migration30仍须用明确历史accepted Goal验证原accepted_by/accepted_at/criteria，不能改成当前demo永不进入的accepted条件分支，也不能用created_at代替accepted_at。可复用不可变v35夹具，其原文件不改。导入浏览器测试应改用真实当前笔记表单并验证刷新/持久化，不能将原浏览器提交替换为进程内Module调用后仍称端到端通过。旧Draft交互可以退役，这两类当前用户结果仍保留。

### C1主验收通过

导入最终复用现有`adoptOwner(source=migration)`及原V3日志，不新增来源枚举。主`03-c1-root-import-final.log`完整管理导入→当前Runtime笔记/来源/空要求→规划完成与继续→Host/SQLite重启原键重放通过；`03-c1-root-{planning,metrics,migration,host,tree}.log`分别验证当前图状态、三种下游状态计数、四库历史迁移、两个Host测试和真实树路径。主探针旧工具错误文本断言首次到达时未匹配既有`mcp.authority_denied`，主改为断言该确切错误码，没有改变生产语义。

两项测试现已补正并由主复核：migration30采用原approved夹具中的具体CORE，保留原accepted_by/accepted_at/criteria；导入e2e实际点击笔记表单、提交、刷新后读到正文，并核对SQLite持久化。`03-c1-root-correction-tests.log`10通过0失败0skip。C1关闭，继续C2内部删除与历史测试映射，不重复全仓初始侦察。

### C2展示接口收敛裁决

主拒绝新建`current-work-view.ts`用空Claim/Run、空action_token/actions继续拼旧GoalWorkStateView/GoalActionProjection的适配。它违反本项“无no-op adapter、删除无职责旧类型”的既定要求。剩余文档/展示消费者直接使用实际事件状态和既有eventDirectoryPresentation的有限必要字段；删除死动作/旧Contract查询胶水，一次读取当前状态供实际展示使用，不保留未被消费者需要的空旧字段或历史fulfillment回退。实际调用者均提供事件读取时不保留虚假optional依赖。历史journal/原始Review/Claim/Run读取、项目删除的历史活动保护、真实Session/PTY继续保留。这是既定清理方向的纠偏，不扩大产品行为或重做布局。


### C2测试映射补证

主沿已退役写调用检查到三项仍有当前职责的混合测试，C2/04不得整项删除：`artifact-clipboard.e2e.test.ts` 的真实浏览器复制精确Unicode引用、拒绝剪贴板权限及无业务变化；`project-catalog.test.ts` 的项目删除独立确认、历史活动保护、文件清理、解除绑定与幂等回执；`goals-command-module.test.ts` 的migration12故障注入后原Run和marker全部回滚。它们当前只在造夹具时调用旧写入口，应改为明确临时历史SQL或既有历史夹具，保留实际被测生产路径与上述断言。原四份v35夹具文件不改。独立的旧draft-dialogue MCP响应包装测试可按退役处理，不能把它和仍在使用的混合时间线／原正文阅读混为一类。

### C2旧祖先写入纠偏

主拒绝新增`lifecycle-compound.ts`／`GoalCompoundAncestorCommands`来保留历史父Goal重开算法。实际旧`lifecycle-completion.ts`的reopen/reconcile分支会在`goalHasEventStateOwner`成立时跳过；当前创建、已批准树物化、V3导入与migration36之后的Goal均走事件归属。新类仍会把历史父Goal的accepted_by/accepted_at清空，改回Draft/frontier_open并写旧重开事件，这不是历史读取职责，也不是当前关系图检查。

本项删除该新类、旧completion/revalidation/revision写服务及GoalsCommand/Archive/Host相关旧hook，归档/回收站保留自己的实际写入、关系暂停／恢复、焦点、事务、幂等和当前游标；必要历史活动只读保护保留。真实图循环／跨项目／拓扑／影响分析和已有事件状态处理保留，不发明新的自动父Goal完成／重开算法。历史schema和一次升级原样保留，不能为继续编辑历史无owner数据另开备用写协议。

前C2writer在两处把旧接口改成兼容层的方向上偏离合同，主已停止其进程并核对上述调用链。后续用简洁handoff启动同一Grok4.6/xhigh的全新CLI上下文，仍为唯一串行writer，不创建用户可见任务、不回滚有效代码、不改变总范围。

### C2串行落地顺序

新上下文已读取所需调用链，但全范围读取仍扩大且尚未编辑，主进一步收窄执行批次：C2a先完成Goals模块旧写服务／别名／规划分支删除、公开Contract收窄，并通过Contracts构建与Goals局部类型检查；C2b处理Execution/Evidence/Governance；C2c完成Native/Host实际组合和完整构建；C2d处理测试映射、边界检查与当前回归。每批沿已读事实直接修改，新增读取仅针对具体编辑或编译失败。中间批次不宣称整仓可运行，所有批次完成才验收C2。主保持串行调度，总范围不缩减。

C2调用者补证：`GoalImpactCommands`的add/update/deactivate/registerAccepted仍在Goals公开面；实际生产写调用仅来自待删除的`legacy-contract-decision.ts`、`legacy-rewire-decision.ts`及未注册旧entry adapter。当前`board-snapshot-query.ts`只消费impacts.list。因此C2c随最后旧Native调用者删除，收窄Goals影响声明为真实历史查询／schema／迁移，删除无职责写服务、写Contract和capability；不保留旧测试造数据入口。历史影响声明及其作者、来源、停用事实仍可读取。

C2a主复核通过：旧Lifecycle/祖先/Draft/Policy/规划分支与继续别名已从Goals本批范围删除，归档自身记录／关系暂停恢复与历史活动查询保留。Contracts构建、Goals类型检查与构建均EXIT0；主`03-c2a-root-metrics.log`通过三种当前状态与拓扑，diff空白检查通过。此为模块代码批次验收，不是完整用户流程或等级4；继续C2b三个模块、C2c实际组合及Impact收尾、C2d测试映射。

C2b初次复核未通过清理要求：三个模块的commands/lifecycle已删除且局部构建通过，但repository仍有旧insert/update/complete/waive方法。主沿实际调用检索，这些方法无当前生产消费者；Governance的waive只余待删除旧Native合同修订转发。原合同C6同样适用于repository，不能以隐藏commands保留旧写实现。补删对应方法和独占输入/助手，保留真实查询、schema/migrations、Governance当前树事务和appendEvent。无当前功能扩范围；补正通过后再C2c。

C2b补正后主复核通过：三个repository的上述旧写方法及独占类型/门禁助手已实际删除；diff只删相关块，原schema/mapper保留，当前Governance树事务和日志方法保留。主核对Grok命令完成输出，三模块各typecheck/build全部EXIT0；初次Contracts/Goals合同收口构建结果也已核实EXIT0。`git diff --check HEAD`通过。无整体运行结论，继续C2c实际Native/Host调用、整仓构建及边界检查。

C2d混合测试补证：`goals-document.e2e`已实际使用当前事件正文，覆盖真实已读HTTP响应延迟后的选择竞态、两个独立document client、Host before/after回调、失败后原内容保留／重试、桌面header与Feed sibling保留、390px无溢出；首个测试旧标题不能作为删除整项依据。`goals-refresh.e2e`覆盖真实外部归档恢复、刷新响应落后于Goal切换时不回退选择且后续仍能看见新增Goal、compact失败转整页刷新并保留Feed工作面，全部保留。`goals-query-facts`/`goals-query-module`混合了历史Policy/Risk/关系隔离、顺序和只读无副作用与旧explain/Policy写造数：保留历史查询真实断言，旧写造数改SQL，旧explain门禁才退役。`goals-status-ui`后两项实际集合状态／转义和可访问tab关系仍有效，只更换退役状态输入。大型`v1.test.ts`不得按文件整体删除：项目guidance及修订、首次SQLite初始化、迁移12/13/14/17/26/28/29/30、真实归档／trash关系失败回滚／双端独立恢复、历史统一提案阅读、V3导入和当前有限树图事务约束需逐项保留或明确映射到同等已有当前测试；纯Claim/Run/Review/Draft/旧树Contract等执行断言才退役。已删除Evidence提交的夹具不代表真实文件阅读／路径边界可以删除。

C2c当前展示复核范围：旧Contract/Candidate/Rewire、旧Review obligation和旧Risk可作为原始历史读取，但不得计入当前待决定数或产生当前待办，不能用“open/triggered”替代已删风险动作授权而假称仍需用户决定。旧父Goal自动完成／草稿澄清判断也不得仅改名为presentation后留在当前提示里；当前父子进度使用事件完成事实，各Goal按自己的约定显式收尾。历史详情仍展示原始正文及来源，不用只有标题和ID的空提示代替正文，不保留返回空字符串的退役UI适配。主将按最终实际调用者与公开页面行为做一次集中复核，纯历史字段与真实原文读者不因此删除。

C2c首轮整仓构建和边界检查已实际EXIT0，但主复核未通过：原始v35历史夹具出现4个伪当前待决定；真实项目HTTP生成的Handoff仍输出旧当前Run／有效Evidence／待检查角色，并引导已取消Goal直接按差距继续。其余当前Runtime、迁移、图、约定、报告、导入、目录及Session记录修复探针已通过。集中纠偏包含上述真实行为、已确认的空Draft/risk/impact适配及旧父完成提示。为保持真实Session交接，允许最小修改Native Work的当前读取类型、handoff-package和HTTP回执，以及Host对应上下文组装；不改Session发送协议、存储、既有来源校验或另建版本计数。历史仍可读且不能作为当前执行协议。


C2c final correction evidence: the user-approved seven-file deletion is complete. Build and boundary pass. Root's 03-c2c-corrected-root-{current-decision,current-handoff,tree-regression,current-directory,runtime,session-repair}.log all pass. The real current tree proposal enters the pending queue and leaves it after protected Web approval; original pending Candidate/self-review/Risk records remain history with zero invented current decisions.

C2d begins with one additional reproduced Handoff defect. Root's 03-handoff-history-acceptance.mjs loads original v35 CORE, retires an actual mapped requirement through trusted setAgreement, and confirms the original acceptance criteria remain unchanged. The final production handoff still shows that retired criterion in its CURRENT acceptance section, before historical reading. Log: 03-c2c-corrected-root-handoff-history.log. Current acceptance must consume only current event requirements; original statements, pass conditions and decision methods remain readable under explicit history. The root probe is read-only.

The allowed small C2d production correction is in plugins/native/work/src/handoff-package.ts and its retained tests. Also replace the internal resumeWork(reason) instruction with the actual public molis_work_v1_event_resume tool or a clear user action. Preserve the completed/cancelled boundary, Session delivery/source validation/provenance/version/storage, and the four original v35 SQL files. This is a correction within the existing current/history contract, not new product scope. C2 and overall level 4 are not yet complete.

C2d test preservation clarification: narrowing i18n.test.ts to the eight current display states is correct; deleting its `en.meaning !== zh.meaning` assertion is not. English mode must return actual English explanations. Restore that behavior assertion and correct actual missing translations, or report a concrete final04 translation gap without weakening the test. Root's temporary 04-current-language-acceptance.mjs checks the real locale/explainer path independently. This enforces the existing test rule and adds no product scope.

### C2d concentrated review and continuation

The initial C2d process reached its configured turn limit. Handoff current acceptance and its retained history tests now pass root probes; most adapted test groups and the real browser document/refresh/clipboard/import tests pass. One old Draft HTTP assertion remains. No full suite has run yet.

Thirteen retired test files were replaced with empty `export {}` modules. Empty file passes are not business verification and must not remain as the retirement strategy. Root inspected their original test bodies. Preserve the original migration-8 rollback/retry/reopen scenario in `draft-dialogue-application.test.ts` using historical SQL after the real migration; preserve the first current Goal/Relation browser decision case in `goals-proposal.e2e.test.ts`, including reason validation, network failure retaining input, atomic retry, rejection, focus and reload. Preserve the current Goal/Relation CLI/MCP decision chain in `proposal-entry-chain.test.ts` with current intent setup and Host restart. Preserve or name an exact repository replacement for the genuine public Runtime JSON-RPC connection/restart/idempotency behavior in `runtime-skill-flow.test.ts`. Preserve actual historical Evidence query/reference reading in `evidence-verification-module.test.ts`; existing v1 locator and clipboard tests cover actual locator/file behavior. Retire exclusively obsolete writer, lease, coverage, automatic-completion, old Candidate/Risk/Contract and Draft history-presentation assertions. Record each retirement and exact current replacement in 03c-handoff.md, removing genuinely obsolete test files instead of leaving empty modules. A denied deletion must stop that action, never be bypassed through truncation or another tool.

Restore the original English-versus-Chinese meaning assertion and complete current state translations. The already-scoped final04 positive current action wording in `goal-state-copy.ts` may be completed in this batch so those strings are translated only once; no layout or workflow change. Strengthen `goal-event-document-history.test.ts` to check the original review reasoning and `legacy_review` source, preserving actor/ID and both reader routes. Keep its already-valid more-than-100 pagination test. Add a focused repository regression for current decision counts: original v35 pending Candidate/self-review/open Risk remain unchanged history with zero current pending; a real current Goal/Relation proposal enters the queue and leaves after protected approval. This preserves the accepted C2c behavior; root temporary probes remain read-only.

Complete the remaining Draft HTTP retirement test and EOF whitespace corrections, run only affected groups, then write the per-business handoff. Previously passing browser, migration and Handoff groups do not need blanket repetition without affected changes. Final full suite and remaining UI/dialogue copy still belong to04.
