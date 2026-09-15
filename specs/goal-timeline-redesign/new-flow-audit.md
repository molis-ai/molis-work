# 新流程逻辑审查

日期：2026-09-10。基线：`main` / `8d2abd3`。性质：只读逻辑审查与隔离复现，不修改生产代码。

## 判断与范围

**未达到“面向新逻辑、无兼容负担、MCP 简洁清晰”的完成标准。** 事件存储、类型登记、工作报告与新正文已经真实工作，但普通新建、首次使用、Feed 升格、复杂规划、工作发现和部分状态约束仍然受旧模型支配。当前是事件链路与旧生命周期并存；其中有些是此前明确保留的兼容职责，有些已经影响全新目标的正确性。

本轮按用户新边界审查：不以旧逻辑兼容作为保留理由；核对实际工具发现、Skill 及引用文档、Host/MCP/Native Goals/Module 调用、Web 创建与首次使用、状态与授权边界。历史事实不等于旧执行协议，移除旧协议并不要求删除历史数据。

上一轮验收不应被解释成这些新审查项已经通过。本轮结果应作为后续整改输入；未实施修复，也未重新发布。

## 已确认问题

### F1 / P1：结果约定变化后，旧完成结论仍生效；正式收尾能漏掉约定版本检查

真实 Runtime MCP 复现：创建“用户能完成真实购买”的新 Goal → 配置一项要求 → 报告支持 → 显式完成 → `event_agree` 将结果改成“只要展示一个购买按钮即可”。返回的 agreement 从 v1 变为 v2，`completion_effect` 仍为 true，closure 仍基于 agreement v1。

另一条新 Goal 在读取 v1 后被改成 v2；提交收尾时仅传 schema 必填的 `expected_config_version`，省略非必填的 `expected_agreement_version`，仍完成成功。配置版本没有变化，无法保护这次结果约定变更。

原因：新意图一直保持 `definition_state=draft`；`setAgreement` 的结果替换限制依赖旧 `accepted` 字段，因此不适用于所有新意图。它写入新约定后也不重新评估已有完成效果。收尾只在传入 agreement version 时才比较该版本。

位置：`modules/goals/src/event-state-effects.ts:274`、`:303`、`:338`；`apps/mcp/src/goal-event-tools.ts` 的 event_close schema；`plugins/native/goals/src/goal-event-application.ts:71`。

方向：把“当前有效约定”的版本和授权作为新流程依据；允许已获授权的修订，不能由旧 Draft/Accepted 标签决定权限。实质结果变化须使旧完成结论成为历史并重评相关要求。正式收尾必须验证实际依据的约定版本。

### F2 / P1：新要求无法表达必须人工验收，针对要求的待决定也能被绕过

新要求 schema 只有 `requirement_id / statement / bound_type_id`，没有验收责任字段。所有 event extra requirements 都被投影成 `human_decision_required=false`；只有原 acceptance criteria 的 `decision_method=human_decision` 能进入人工门禁。

真实 MCP 复现：新建要求“必须由用户亲自确认购买体验”，Runtime 报告支持后可以完成。这里不是要求系统理解文本并推断门禁，而是**当前接口没有合法字段让调用者表达用户明确要求的门禁**。直接提交额外的 `human_decision_required:true` 虽不符合发现 schema，服务端也没有明确拒绝，反而成功写入并丢掉它，容易造成调用者误以为已记录。

另一个合法调用场景：对 requirement ID 发起“请用户验收这项要求是否满足”的 decision request，scope 只列该 requirement；未有用户回答，`event_close` 仍返回 `completion_applied=true`，同时还存在一个 pending decision。原因是完成只把 `scope.action === complete` 的请求当成门禁。

位置：`apps/mcp/src/tool-schemas.ts:549`；`modules/goals/src/event-facts-validation.ts:234`；`modules/goals/src/event-facts.ts:450`；`modules/goals/src/event-state-authorization.ts:249`；`modules/goals/src/event-state-completion.ts:87`。

方向：新要求能明确表达“Runtime 报告即可 / 独立检查 / 用户验收”等实际支持的责任，不靠自然语言推断。决定的影响必须可表达并与其关联要求一致；普通建议型决定不应一律阻塞，而要求验收型决定不能被绕开。未知控制字段明确拒绝，不能静默丢弃。继续保留可信用户身份边界。

### F3 / P1：默认新建、首次使用和 Feed 升格仍生产旧协议 Goal

真实 HTTP `POST /api/goals` 创建一个全新目标，响应 201；随即读状态得到 `protocol.kind=legacy_claim_run`、`claim_or_run_required=true`、`owner=null`。这与历史项目无关，今天的新输入仍会落回旧路径。

源码同时确认首次项目引导调用 `createGoalCapability`，Host 直接调用普通 `commands.createGoal`；Feed/Inbox 的升格或开始处理也调用普通 createGoal。只有事件 createIntent 额外调用 adoptOwner。首次使用的 Runtime 提示因此仍可能进入旧澄清/Proposal 分支。

位置：`plugins/native/goals/src/http/create.ts:62`；`apps/local-host/src/web-onboarding.ts:68`；`apps/local-host/src/project-capabilities.ts:149`；`plugins/native/feed/src/goal-promotion.ts:56`；`apps/desktop/src/advance-prompt.ts:20`。

证据等级：默认 Web 新建为真实 HTTP 复现；首次使用与 Feed 为生产调用链核对，未另跑这两条 UI。

方向：所有产品新建入口汇入同一个事件意图应用服务，保留入口自身的标题、原话、外部输入来源、关系与授权。既然不再维护兼容，不应要求新目标再执行一次“转交事件记录”。

### F4 / P1：事件目标无法通过现有 MCP 完成拆分/关系规划

真实 Runtime MCP：对两个新事件 Goal 提交合法的父子关系提案，报 `goal_tree_proposal.run_not_found`，提示恢复澄清 Run；按指引初始化同一 Goal 的 draft dialogue，又报 `draft_dialogue.claim_denied`，理由为事件目标不能领取角色或 Run。最终没有产生 Claim/Run 副作用，但业务路径走不通。

这不是只需要改 Skill：`GoalTreeSubmissionApplication` 在提交前无条件要求 active Run，而事件 owner 的 eligibility 又明确拒绝它。

位置：`plugins/native/goals/src/goal-tree-submission.ts:74`；`plugins/native/goals/src/goal-tree-run-authority.ts:18`；`plugins/native/goals/src/goal-eligibility.ts:91`；`apps/mcp/src/goal-tools.ts:416`。

方向：保留真实树结构、循环检查、跨目标归属、变更范围与用户授权；提案来源改为真实 Runtime/Session 与当前事件/约定版本，不再以 clarifier Claim/Run 作为规划前提。不要通过临时旧 Goal 绕开。

### F5 / P1：工作发现与恢复仍给新目标输出旧状态，而且同一响应自相矛盾

真实 `available` 返回两个新事件 Goal：`available_count=0`，`blocked_overview` 说 clarification_blocked；但同一响应的 `action_projections` 又标成 `display_status=continue`、`primary_action.kind=clarify`、status=ready。

`contract` 也同时返回旧 clarification_blocked 和可以澄清的 action_projection，没有事件 goal_state 的当前协议与状态作为该响应的权威。连接恢复的 `projectResumeFactsCapability → buildMcpResumeView` 消费的还是同一旧 action projections。

位置：`apps/mcp/src/availability-queries.ts:24`；`apps/local-host/src/project-capabilities.ts:135`；`apps/mcp/src/resume-view.ts:10`；`apps/mcp/src/context-presentation.ts:38`。

方向：新增或收敛为基于事件当前状态的 Goal 列表/发现入口，供连接恢复、工作选择、单 Goal 阅读使用。不能把“禁止旧 Claim”显示成“目标无法工作”，也不能在响应内保留第二套相反的 next action。

### F6 / P2：MCP 是新增工具叠加，旧执行工具没有从 Runtime 面删除

当前真实 Runtime discovery 为 **57 个工具**，其中 13 个是新增 Goal/事件工具。仍公开 12 个旧执行工具：

`claim`、`select_goal`、`claim_renew`、`release`、`run_start`、`run_report`、`evidence_submit`、`evidence_correct`、`review_submit`、`revalidate`、`rework_request`、`complete`。

另有 3 个 draft_dialogue 工具、3 个旧提案工具 `contract_propose / candidate_submit / dependency_propose`；`ready / available / contract / explain` 仍围绕旧状态。`goal_tree_*` 的当前契约还依赖旧 Run。工具定义序列化约 112,449 字符；这是本地元数据体量，不是模型 token/性能实测。

位置：`apps/mcp/src/tool-catalog.ts:10`；`apps/mcp/src/tool-dispatch.ts`；`apps/mcp/src/goal-tools.ts`。

方向：以用户“无需旧兼容”的边界删除旧 Runtime 工具及专属分发/适配/schema/Skill 分支，不仅从界面藏掉。新结构变更能力先接通，再删除其旧依赖；不把删除旧入口等同于删除 Host 终端、Session 管理或历史资料。

### F7 / P2：Skill 的入口已更新，必读引用仍把工作带回旧协议与固定规划门槛

planning.md 首先要求新想法调用 goal_intent_create、不要 draft_dialogue_start；但紧接着“每个实质回答”又要求 draft_dialogue_turn。复杂规划后段仍要求 active clarifier Run、完整叶子就绪材料、三项拆分信号至少命中两项就必须拆分。相应 Module 校验也没有删除，因此不是单纯过时措辞。

必读 protocol.md 仍要求每次 lifecycle write 消费 transition.projection，实际 event_report 并不返回它；同时说 Web 不是决定的前提，事件用户决定却只允许 Web/management。这需要一致的产品约定，不能让 Runtime 猜应该相信哪段。

位置：`skills/goal-advance/references/planning.md:7`、`:30`、叶子就绪与 Proposal 段；`skills/goal-advance/references/protocol.md:11`、`:29`、`:46`；`modules/goals/src/planning/decomposition-validation.ts:361`、`:551`。

方向：重写为一条完整事件循环。专业规划保留为按任务选用的方法；固定角色阶段、非空数组、拆分阈值降为建议或移除。用户批准仍须有真实来源；若要在 Runtime 对话内闭环，需要 Host 能提供用户确认来源，不能简单重新开放一个可自填的 user 布尔值。

### F8 / P2：新 MCP 的日常回执和能力仍不完整

真实 event_report 回执只有 `events / observed_event_cursor / replayed`，没有当前 gaps/state；Skill 却要求按返回差距继续，调用者实际还需额外读 goal_state。Web 有无需自定义类型的 recordNote，MCP 只能先定义类型再 report；Web 也能明确重开已完成 Goal，MCP 的 event_resume 只处理取消，真实调用在 completed 上报 `event_resume.not_cancelled`。

位置：`plugins/native/goals/src/goal-event-application.ts:175`；`apps/mcp/src/goal-event-commands.ts`；`plugins/native/goals/src/http/events.ts:133`；`modules/goals/src/event-state-effects.ts:464`。

方向：日常工作报告返回紧凑当前状态、差距和游标。普通笔记/进展应有立即可用的上报方式，自定义类型用于需要额外结构的任务。明确继续统一覆盖已取消和已完成状态，保持显式原因和幂等，不靠无关报告偷偷重开。

### F9 / P2：把“不改历史”实现成“新版本也不许演化”

真实 MCP 给类型登记 v2，仅将字段显示名从“结果”改成“交付内容”，返回 event_config.cannot_change_field。代码还禁止新版本移除字段、变更 format/required/purpose；采用的规划不可移除，要求只有新增与绑定，没有当前要求修订/退休的事件路径。

位置：`modules/goals/src/event-facts-validation.ts:154`、`:225`；`modules/goals/src/event-facts-config.ts:71`；`apps/mcp/src/tool-schemas.ts:549`。

方向：历史事件继续引用旧类型版本；新类型版本可以在真实授权范围内演化。对当前约定的降级、删除要求、改变验收责任使用明确正式变更与影响检查；不能因为禁止改历史，就让用户永远无法修改当前方案。

## 已经正确实现、整改时应保留

本轮运行现有事件事实、规划、状态、MCP 与 HTTP 定向回归：45 pass / 0 fail / 0 skip。它们覆盖以下生产行为：

- 新意图 API 不要求完整 Contract、默认模板、Claim 或 Run；普通部分事实可落库，普通支持不会自动完成。
- 无模板不自动采用工程规划；采用模板仅启用显式选择的默认要求；既有类型历史及采用来源不被模板升级覆盖。
- 同请求重放不重复、非法批次整批回滚、跨 Goal/Board 引用与伪造 Runtime 用户身份拒绝。
- 已有人工 criterion、完成风险、适用的完成动作决定、真实依赖、相关反证与取消状态有明确处理。
- 父目标必须有自己的整合结果，不按子项数量自动完成；SQLite/Host 重启可恢复事实与当前状态。

这些保护值得保留，但不能推出 F1–F9 已通过。新人工要求测试使用的是旧 criterion，现有 HTTP 测试在进入 Web 之前直接 createIntent 构造 Goal，因此没有覆盖默认新建入口；已完成后的 outcome 替换、MCP 拆分与工作发现也未被上述回归覆盖。

## 新 MCP 收敛建议

不先追求固定工具数，先让常用路径只做必要的几次操作：连接项目 → 找到/创建 Goal → 读取当前事实 → 工作并上报 → 按差距继续 → 显式收尾。

| 能力 | 建议 |
| --- | --- |
| 项目连接与管理 | 保留明确项目选择、绑定和删除授权；把低频管理与日常工作入口区分清楚 |
| Goal 发现/创建/读取 | 用事件状态提供统一列表和单 Goal 视图，替代旧 Ready/Available/Contract/Explain 的状态分歧 |
| 普通上报 | 普通笔记、结果、依据、进展可在一次更新内保存并返回紧凑状态；按需登记局部类型 |
| 正式变更 | 约定/要求修订、决定请求/引用、收尾/继续保持清晰输入与权限；不把任意事件 JSON 当作所有正式命令 |
| 结构变更 | 父子/依赖等操作保留真实图与授权检查，彻底取消 Run/角色前置 |
| 历史阅读 | 分页与按 ID 阅读保留，历史版本不改写；不让历史协议决定今天怎么执行 |

建议顺序：先解决 F1/F2 的错误完成与验收表达；统一 F3/F4/F5 的创建、结构变更、发现和恢复；再收敛工具/Skill 及版本演化。删除旧工具必须与新路径接通一起完成，不能先删除而让关系修改、验收或恢复无处可去。

## 复现与验证记录

所有探针只使用新建临时项目、SQLite 和本机 HTTP，结束时清理数据库；没有写真实用户项目。

- `/private/tmp/molis-work-new-flow-audit.mjs` 与 `.log`：真实 Runtime MCP 和默认 Web 创建，覆盖结果修改、缺省约定版本、人工要求、pending 决定、类型演化及 MCP 继续能力。首轮 Web 操作键过短，按真实接口要求更正后完整运行成功；该输入错误不作为产品缺陷。
- `/private/tmp/molis-work-new-flow-audit-routing.mjs` 与 `.log`：真实 MCP 拆分、旧澄清门禁、工作发现和 Contract 投影；初版查询探针误用 app.snapshot，改用公开 snapshot MCP 后运行成功。
- `/private/tmp/molis-work-new-flow-audit-tests.log`：45 项现有定向回归全部通过。

回归命令：

```sh
env -u FORCE_COLOR NODE_NO_WARNINGS=1 node --import tsx --test --test-concurrency=1 \
  tests/goal-events.test.ts tests/goal-events-planning.test.ts \
  tests/goal-events-state.test.ts tests/mcp-goal-events.test.ts \
  tests/mcp-goal-events-state.test.ts tests/goal-event-http.test.ts
```

没有再次运行全仓或安装/发布；本轮没有行为代码改动，已有主链回归加针对性真实反例已经足以形成以上结论。未对未知外部连接器或真人长期使用作通过声明。
