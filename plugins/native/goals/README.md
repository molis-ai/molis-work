# 目标用例与原生界面

Goals 是每个项目都带的内置插件，是 Goal 的产品 owner；Goal 事实本身由本包的 `src/module/` 保存（见 [SSOT-MATRIX](../../../docs/SSOT-MATRIX.md)），本插件在它之上组合。它把 Goal 的当前约定、要求、工作记录和可信决定组合成可操作的工作流，提供目标目录、时间线、树结构和历史正文界面；其他插件经它公开的动作读取，不碰它的存储。

包名：`@molis-ai/molis-work-plugin-goals`。工作区内部包，通过仓库构建和 Host 装配使用。

历史迁移目标：`goal-reorg-f2`、`goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8`、`goal-reorg-gw1`、`goal-reorg-gw2`、`goal-reorg-gw3`、`goal-reorg-gw4`、`goal-reorg-gw5`、`goal-reorg-ex3`、`goal-reorg-ex4`（gw1–gw3、ex3 随 Goal 与 Governance 两个模块并入本包，S9-3）。当前完整迁移范围以 `specs/action-architecture/spec.md` 为准。

## 一次典型调用

Host 注入各 Module 的公开端口，Goals 用 `createGoalsApplication` 在包内组装自己的应用（内部类不从 `index.ts` 导出）。其中 `goalEvents` 连接创建、普通笔记、类型与要求、上报、决定、收尾和明确继续；`goalQueries` 提供项目指导和历史读取。提案的提交与决定写完后各自结算对应 Goal 的决定提醒（Inbox 只读这条引用）；项目打开时 `projectOpened` 补对一次，页面请求与 Inbox 列表不再对账。HTTP handler 与 UI contribution 将同一当前事实交给各 App，目录和正文无需重建旧 Claim/Run 动作状态。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/goal-event-application.ts](src/goal-event-application.ts) | 当前事件工作流与紧凑状态回执 |
| [src/goal-query-application.ts](src/goal-query-application.ts) | 目标读取 |
| [src/goal-tree-decision.ts](src/goal-tree-decision.ts) | 目标树确认 |
| [src/document-collection.ts](src/document-collection.ts) | 文档列表投影 |
| [src/http/index.ts](src/http/index.ts) | 页面操作的路由处理 `goalsRoutes`：[src/manifest.ts](src/manifest.ts) 的 `routes` 每声明一条，这里一个处理（PG094-09）；页面经插件前缀 `/api/plugins/io.molis.work.goals/<路径>` 调它们，Runtime 分发核对安装授权（S-15），宿主不再有旧地址 `/api/<路径>` 的改写 |

可对照现有调用方 [src/plugin.ts](src/plugin.ts) 阅读装配方式。

完成卡的「去 Goals 确认」定位到本次提案；列表中的待确认区也包含未关联现存 Goal 的提案。采用或退回仍由原受保护决定入口处理，刷新后已决定提案离开待确认区，原 Goal 详情入口继续可用（context-program W4-2-13）。

## 接入与边界

`goalsActions` 当前提供 65 项 project 动作（2026-10-07 从构建产物数出），由 Manifest 声明并在项目动作服务中注册，其中 59 项可按授权供 MCP 使用，6 项仅供受保护的用户操作；另有 2 项 Home 动作 `personalPlanningActions`（见下文个人方法）：

- 本地管理：`goals.board.initialize`（版本 2：输入只有 `idempotency_key`，项目的名字是项目目录的，Goals 的看板不再记它，S8），只接受可信 management 用户上下文。CLI 与管理 MCP 经宿主造的管理动作端口调用这一动作，已登记且连接到 Home 的项目转交常驻宿主，身份由宿主定为本机这个人（`LOCAL_PERSON_ACTOR_ID`），输入不带 `actor_id`；普通 MCP/Agent/插件不获管理权。原初始化回执与禁止覆盖保持。V3 导入已删（2026-10-04，用户决定不留旧数据入口）。
- 目录、创建、便笺：`goals.list`、`goals.create`、`goals.note`。
- 对象上下文、搜索与片段：`goals.subject.read`（目标上下文，供调用者明确引用）、`goals.search.entries`（系统搜索条目）、`goals.fragment.offers`（按选中的片段准备本插件真实动作的参数，不执行）。这三项与 `goals.list`、`goals.note` 同样向已安装插件开放。
- 资料与成果输入：`goals.inputs.bind`、`goals.inputs.release`、`goals.inputs.list` 把文档、演示稿、问卷、数据表、Shelf 材料等记为目标的绑定资料，不复制、不移动原对象；`goals.inputs.confirm` 由拥有来源的插件（目前是 Feed 的「升格为 Goal」）调用，让 Goals 记下：这条来源按确认时内容的摘要，是这个目标的输入（重复确认返回原记录，写的是 Goals 自己的回执，记在调用者的身份下）。它是普通的 Goals 命令（权限 `goals:write`，受众 user、agent、workflow、mcp，声明 `authorship: "session"`），可单独授权、被 MCP 与内置 Agent 直接调用；只有用户（本人）调用时记为已确认，助理、Agent、工作流和外部工具调用只记为待确认（`proposed`）。本人直接调用 Feed 的升格、Feed 经动作目录转来的调用（S-43）也算本人：Goals 只看 Host 在委托调用上设的 `delegated_by`、`delegated_audience`，不看输入；场景运行、两跳委托和 Feed 自己的定时调用不算（`personAsked`，`goals.create` 的创建渠道同样只许本人指定），与成果库的条目一样；待确认的输入由本人在 Goals 里认可（`goals.inputs.accept`，受众只有 user，`proposed` 记为 `confirmed`）或用 `goals.inputs.release` 移除（它也能停用来源材料的输入；已确认的来源输入只有用户能移除，其他调用者只能撤回待确认的提议），Goal 的输入列表写「待确认／已确认」并给「认可这条输入」「移除」两个按钮（页面经 `POST /api/plugins/io.molis.work.goals/goals/{id}/inputs`）；本人对一条还在待确认的来源再调 `goals.inputs.confirm` 会被拒绝（`goals.input_proposed`），要先认可；Goals 不核对来源是否存在，也不核对摘要真伪，只收严格形状的输入：摘要必须是 `sha256:` 加 64 位小写十六进制，理由 1–300 字，名称与来源标识各 1–200 字，来源种类目前只有 `feed_item`；`goals.deliverables.add`、`.remove`、`.list`、`.pin`、`.candidates` 与 `goals.artifact_inputs.add`、`.remove`、`.list`、`.pin` 把成果库里的一版记为目标的交付物或输入，或把资料当前内容固定成新的一版再记入。助理、Coding、工作流或 MCP 调用时只记为提议（附理由），等用户确认；移除已确认的条目只有用户能做。
- 结构提案：`goals.tree.submit`、`goals.tree.read`、`goals.tree.check`、`goals.tree.decide`。提交只保存提案，检查保存检查结果并回滚预检变更；审批为受保护的用户操作。已决定的提案保持可读。
- 目标生命周期：`goals.active.set`、`goals.archive.set`、`goals.trash.set`、`goals.trash.list`。当前目标不启动工作；归档须已完成；回收站操作须明确确认，保留阻塞、完整历史及关系恢复结果。
- 关系与规则：`goals.relations.list`、`goals.relations.add`、`goals.relations.deactivate`、`goals.policy.history`、`goals.policy.resolve`、`goals.policy.save`。三项查询可按授权供 MCP 使用；建立/解除关系与保存项目默认规则是受保护的用户操作。模型需使用结构提案。
- 项目长期说明：`goals.guidance.read`、`goals.guidance.add`、`goals.guidance.update`。读取完整修订与提示词；新增/编辑/停用/恢复保留明确确认、原因、确认摘要、原去重及幂等回执。
- 工作记录与状态写入：`goals.events.configure`、`goals.events.report`、`goals.progress.record`、`goals.concerns.apply`、`goals.decisions.request`、`goals.decisions.cite`、`goals.agreement.set`、`goals.closure.submit`、`goals.work.resume`。
- 项目规划：`goals.planning.catalog`（只读列出可用方法与已启用的组合，不含正文）、`goals.planning.read`、`goals.planning.save`、`goals.planning.apply`、`goals.planning.impact`、`goals.planning.graph.check`。方法与组合、版本、事件类型及默认要求沿用原 Planning Engine；保存/采用要求明确确认，每次保存生成新版本，不自动重试。
- 完整资料（`goals.snapshot.read`、`goals.contract.read` 与下面的 `goals.collection.read` 在 S8 升到版本 2：看板不再带 `title`）：`goals.snapshot.read` 返回项目快照（目标、关系、规划方法、项目指导与目标树提案），`goals.contract.read` 返回单个目标的约定、上级约定覆盖、关系、生效规则、项目指导与目标树提案。CLI/typed 快照均调用共同动作；网页 Session 交接同时读取授权约定与当前状态，失败不创建交接包。
- 完整集合：`goals.collection.read` 返回当前/归档/回收站集合、历史、覆盖和输入/规则绑定；整页、Board JSON、fragment 和复用页面资料的消费者等待同一动作，缓存命中仍重新校验权限。
- 目标正文：`goals.document.read`，组合当前状态、原始说明、混合历史首屏、关系、关注项、规划方法与继续方式。网页完整页和正文 fragment 与标准 MCP 共同读取，归档/回收站历史保持。
- 当前状态与目录项：`goals.state.read`、`goals.directory.read`。
- 进展保存回执：`goals.progress.receipt`，按可信调用者、目标和原幂等键读取；不存在时返回 null，不接受指定其他作者。
- 用户决定：`goals.decisions.record`，仅 user audience、`goals:decide` 权限和 Host 提供的用户操作出处共同满足时执行；原 Governance 和 Goal 事务保持不变。
- 事件原文与索引：`goals.events.list`（正序）、`goals.events.latest`（倒序）、`goals.events.read`、`goals.timeline.list`（紧凑索引），分页使用数字事件游标。
- 完整历史：`goals.history.list`、`goals.history.read`，合并当前事件与 Journal 记录，分页使用返回的字符串游标。历史正文保留来源和 HTML 转义；目录项或历史条目不存在时返回 null。

查询需要 `goals:read`，普通工作写入需要 `goals:write`；MCP 客户端须显式授权精确动作。输入不接受 project、actor 或权限，Host 从项目与调用上下文绑定。有幂等合同的写入沿用原事务及 idempotency key，各入口读写同一记录；记录便笺不代表完成目标或作出用户决定。输出合同包含完整类型定义、报告原文和历史状态字段。

对应 typed Capability、Coding 目标目录/状态/进展、项目恢复目录与焦点查询、Web 创建/便笺/工作操作/状态/事件/历史及首页胶囊目录已经转调统一动作。MCP 只经动作工具（`molis_work_v1_action_goals.<动作>__v1`）调用 Goals，逐客户端授权、由常驻 Host 执行；旧的 30 个兼容名称已删除（#269），不再有通过名称指定数据库或自填作者的入口。Runtime 的写入保留可信 Runtime Session 作者及原幂等域，其他调用保留客户端作者；权限始终按客户端与项目判断。可信调用者未记录 actor kind 时保持未知分类，不补写成用户身份。

Coding 的进展回执查询也转入统一动作，保留原保存回执和重启恢复行为。进展附带的成果来源是提交者的引用，不表示系统已验证成果内容，也不构成用户授权。

用户决定的 Web、CLI 和管理 MCP 共用注册动作。Web 的直接事件端口及同步观察包装已删除。管理 MCP `event_decide` 从同一动作派生业务 schema，不能作为普通 MCP 授权能力导出；工具不接受 `authority`，由 Host 固定本人和 management 出处。

管理入口（CLI、管理 MCP）的写入由 Host 私有 `bindGoalsManagementActions` 工厂固定记本机这个人（`LOCAL_PERSON_ACTOR_ID`、`user`），权限只取该次动作自己的，身份不从输入读。结构提案的提交、检查、决定和用户决定带身份字段会以 `actions.input_invalid` 拒绝；提交另拒 `submitted_session_id`，结构决定另拒 `audit_actor_id`、`runtime_actor_id`。CLI 先核项目，管理 MCP 保留原数据库/项目绑定和参数选择顺序。首次引导调 `goals.create`（`bindGoalsWebActions`，创建渠道 `onboarding`）；Run 与助理轮次读长期说明只调 `goals.guidance.read`（`readProjectGuidance`，只授 `goals:read`）。

W3-07 PR-5 删除了余下十个 Goals typed 桥及注册/出口：初始化、快照、创建意图、用户决定、结构提案提交/读取/检查/决定、项目说明读取和设当前目标。旧 v1 引用由公开 Host/SDK 拒绝为 `actions.dependency_missing`，调用方自造描述符或去掉 `host_only` 不能恢复；`checkNoGoalTypedAdapters`（`pnpm boundary:check`）按 AST 拦重新定义、注册、导出或调用。`tests/goal-management-identity.test.ts` 走真实 Host/SDK 验十四个 literal；`tests/goals-query-boundaries.test.mjs` 验实际源码和别名/动态入口的 mutation。现行管理动作的身份、证据、幂等和重启由 `tests/management-door-identity.test.ts`、`tests/proposal-entry-chain.test.ts` 走实际 CLI/MCP 验。PR-8 已删除 Coding 的另外四个 typed 协议与注册。Coding 按动作 id 与版本调用这些动作（`plugins/native/coding/src/goals-actions.ts`，PG-111 起不再与 Goals 共用合同）；约定、状态、进展与回执要求当前宿主运行的内置实例，撤资格、停用或重启前的旧对象均不能继续调用。PR-9 将这四个 literal 与原导出名加入同一回流门禁；`tests/typed-registry-inventory.test.ts` 核实际 Host 剩余注册和动作目录。

动作输入不含调用者或项目；结构提交不含 Runtime 会话，结构检查的领域输入 `GoalTreeProposalCheckInput` 由动作处理器补作者。管理决定的两个 authority 和共用证据检查归 `src/management-evidence.ts`，仍拒证据里的 `actor_id`、`actor_kind` 或 `authority_source`。`BoardSnapshot`、`GoalContractView` 保留事实 owner 的记录形状；初始化输出 `InitializeBoardOutput` 归现有 `src/library-actions.ts`。同一幂等键只在同一作者下重放，Runtime 动作保留自己的 Session 作者。

项目规则「完成前必须你点头」（`human_approval`）进入完成检查：没有仍然有效的可信用户结论、也没有授权 `complete` 的当前决定时，收尾回执的原因是 `goals.event_closure.human_approval_required`。授权 `complete` 的决定和某条要求上的接受结论（含协议里 `requirement_acceptance` 请求的答复）都只对做出它时的约定和那一轮工作有效：约定整份承诺里任何一处变了，或 Goal 被继续、重新打开之后，要重新授权或接受。

文档页完整集合和所选正文已共用动作；Host 仅组合已授权资料，正文另读当前规划方法，个人方法更新不会被页面缓存遮蔽。初始化管理入口也已转入动作；与其他插件的剩余消费和系统生命周期仍待全量审计。MCP 连接恢复摘要已使用当前客户端的精确动作授权与常驻服务；typed 恢复和 MCP 共用原目录/焦点组合，缺权限或服务不可用时返回缺失内容原因，连接状态保持真实。同步事务和历史合并内部继续使用原业务 owner。

请求或引用决定不等于作出用户决定。普通动作不接受 actor/authority 等身份授权字段；项目规划保存/采用的 user_confirmed 只保留原业务确认前提，不产生用户决定权；用户验收、放宽约定和接受风险仍执行原领域校验。标准公共动作拒绝未授权调用，管理模式也不能自填用户作者。

项目规划的动作、Web API、方法详情/编辑以及设置总页的实际读取入口已使用共同动作。网页复制、编辑和采用保留完整事件类型及默认要求；个人模板和项目方法保持独立版本与数据。

长期说明的 Web API、项目设置、动作、MCP、Work 提示词和 Agent 项目层共用动作。Agent 使用原修订数标识说明版本，编辑同一条也产生新的冻结版本。说明写入已成功而后续列表读取被拒绝时，HTTP 返回保存回执及独立刷新错误；不把已保存操作报成失败。长期说明变更的 user_confirmed 保留原业务确认前提，不产生用户决定权。

生命周期的 Web API、CLI 当前目标与回收站组合动作已转入动作。删除/恢复固定操作方向，拒绝输入 trashed 覆盖；work_state 从本次原回执生成，后续排队写入不会改写它。`goals.active.set` 只收 goal_id、reason、idempotency_key，身份和项目由已授权连接绑定；删除与恢复共享同一授权；原领域数据和回执保留。

目标树的动作、CLI、Web 审批与管理 `goal_tree_decide` 共用四个动作，原 Submission/Query/Check/Decision owner 保留幂等、事务、基线冲突及修订语义。新输入只允许 goal/create、relation/create|deactivate；part_of 为子目标到父目标，depends_on 为消费目标到前置目标。修订条目须使用新的稳定 item_id，修订后的提案仍需审批。schema 位于插件，不另维护 MCP 业务 schema。

`goals.tree.decide` 只接受 user audience、goals:decide 及受保护 Host 注入的用户和操作出处；普通 MCP、模型、工作流和插件不能通过自填 authority 获得审批权。管理 `goal_tree_decide` 与 CLI `goal-tree-decide` 经同一私有工厂调该动作：Host 的 `bindGoalsManagementActions` 固定本人和 management 来源（出处由入口给，`entryUserAction("management", …)`；证据检查是本包导出的 `managementEvidence`），输入的证据只能指向对话及整组确认（`conversation_ref`、`message_ref`、`whole_confirmation_prompted`、`prompted_proposal_id`），身份或来源声明返回 `goals.goal_tree_proposal.authority_source_invalid`。管理 `event_decide` 的出处同样由入口给出（`entryUserAction`），默认为 `management:<项目>` 与 `management:<键>`（原 `management-event-decision:<键>`、`management-tree-decision:<键>`、`web-decision:<键>` 一并改成这一种写法，见 CONTRACT-CHANGES §8）；共用 owner 仍以 `goals.event_decision_authority_invalid` 拒证据身份。旧 Runtime 对话自报确认帮助器已删除，历史记录中的 runtime_dialogue 来源仍保留可读。

动作提交的 submitted_session_id 从可信 ActionCallContext.runtime_session_id 注入，经常驻网关保持，插件 Agent 的一轮取宿主在启动时核过归属的那条会话（审计作者 `agent:<runtime_id>:<会话>`，幂等按会话分开）；管理入口背后没有 Runtime 会话，提案记 `submitted_session_id: null`。业务输入不能覆盖它。原始用户身份和整组提示由 user_action 提供，审计 Runtime 身份不能替代用户。

关系和项目规则的 Web 写入、规则设置页、所选目标正文均消费共同动作；原领域事务、关系方向、规则合并及历史绑定保持不变。三项直接写入要求 user audience、goals:decide、Host 提供的真实用户与 web/management 出处，普通 MCP 无法授予这些权限。原 HTTP commands/query 端口和没有调用者的 Workbench/CLI/MCP GoalsApplicationApi 转发工厂已删除。整页目录的历史组合也通过集合动作读取。

个人方法读取已改为原 Catalog 的实时端口：默认 Host 使用自己的 Home，每次查询/采用读取当前版本；Web 与 MCP 不再各自装配一份默认读取规则。全局保存不再关闭项目 Runtime 或清空 Feed scheduler；项目 URL 另存为个人方法也立即影响所有打开项目的后续选择。所选正文与规划页实时读取当前方法，页面缓存不保存个人方法选择。项目覆盖副本及已保存 Goal config 保持原版本，模板编辑不会重写历史。Home 目录/保存已使用 `personalPlanningActions` 的两项共同动作（`goals.planning.personal.list/save`），Manifest 声明，Host 在启动时作为 Home 系统服务注册，无需项目或页面。全局和项目 URL 的个人保存共用原 Catalog owner；普通 MCP 经明确 Home 授权查询，保存为 user 专用，要求可信 web/management 操作出处。未配置原 Catalog 写入端口时明确不可用，不另建数据库。合计 67 项动作：65 项 project、2 项 Home，其中 60 项可按授权供普通 MCP 使用。

## 开发要求

看板可见性修复沿用 [界面体验规范](../../../specs/visual-ui-experience/spec.md)：隐藏时刷新不把零宽度当成手机布局，宽板显示前展开所有列；窄板由人折叠的列在隐藏刷新和再次显示后保持折叠。布局仍取看板所在容器的宽度，不改断点、滚轮方向或 Goal 事实。范围为 `momentum-client.ts` 与 `tests/goals-kanban-visibility.e2e.test.ts`；真实浏览器验证隐藏刷新后宽板卡片可见、窄板折叠保持，并原样回归 `tests/attention-journey.e2e.test.ts` 的列内滚动。

固定输入和交付物的动作等待 owner，因此声明并发调度；委托保留原调用的授权、取消和生命周期，owner 返回后再次检查原 beforeEffect、同步授权和 Goal 是否归档/移入回收站，再写 Ledger 关联。owner 已提交的成果保留。收尾表单遇到固定回执未知时先核对清单，同一意图不自动再次固定；已有版本可沿 reference 关联，新明确固定意图仍增版。

问题的解决/推翻提交后续事件 `supporting_event_ids` 或已有可信用户决定，拒绝时保留输入。Goal 规则只展示现行项目默认和事件记录中的完成要求；要求修改沿事件表单，项目默认沿项目设置。规划详情按请求和当前选择回写，关闭或页面拆除后忽略迟到成功与失败。

- 负责：Goals 的导航、界面、命令与组合（每个项目都带的内置插件）；Goals 与 Governance 在项目库里的表声明（Manifest 的 `databases.project`，即 `GOALS_PROJECT_DATABASE`，`src/project-database.ts`，建表语句在 `src/project-database-*.ts`；S8，PG-020）；Goal 约定与要求、工作事件与关注项、关系图、项目规则、生命周期、项目指导与规划事实（`src/module/`，原 `modules/goals`，S9-3 搬入）；Goal Tree 结构提案、可信用户决定与确认来源（`src/governance/`，原 `modules/governance-collaboration`，S9-3 搬入）。规划方法的内置资产在 `methods/`（37 个 Markdown，随包发）。
- 不负责：用户决定之外的 Session 与终端（归 Work 与 Runtime Host）、跨模块来源、直接修改 Artifact 或 Project 的事实、其他插件的实现。`src/module/` 与 `src/governance/` 读写这些表的 SQL 登记在 `tooling/gates/table-owners.json`。
- 公开入口：`@molis-ai/molis-work-plugin-goals`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；Goals 自己的合同（Goal、事件、状态、动作描述符与 schema、规划方法、治理协作的类型与 schema）在 `@molis-ai/molis-work-plugin-goals/contract`（`src/contract/`，PG-111 从平台合同搬来，平台合同不再有 `modules/goals`、`modules/goal-actions`、`modules/governance-collaboration`）；平台合同 `@molis-ai/molis-work-contracts/platform/plugin`。CLI、MCP、Coding、Feed 不 import 这份合同，按动作 id 与版本调用、就地声明用到的字段；宿主与工作台只有已经点名 Goals 包的文件取它的类型。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。方向：只依赖合同、SDK 与声明过的 Service/UI 包；不导入 Module 实现包，也不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1、2 节）。
- 不变量：
  - 状态变化只经 `src/module/` 的公开入口，页面不另算完成。
  - CLI 与管理 MCP 使用同一 owner 动作；有幂等合同的写入沿用原事务与幂等键。
  - 回收站操作要用户明确确认；`goals.trash.set` 可恢复，因此声明为写而不是不可撤销，并且不进生成插件。
  - MCP 只经动作工具（逐客户端授权、常驻 Host）调用 Goals，不能指定数据库或自填作者、创建渠道。
  - Goals 管理业务只走注册动作，没有 typed 管理写入桥；输入类型不含 `actor_id`、`actor_kind` 或决定 authority，结构提交不含 `submitted_session_id`，结构决定不含 `runtime_actor_id`。真实 CLI/MCP 由 Host 私有管理工厂固定本人和出处；两个管理 authority 的证据规则仍归 `src/management-evidence.ts`。`tests/management-door-identity.test.ts` 核公开入口和动作输入类型，`tests/goal-management-identity.test.ts` 核十四个旧 v1 引用即使伪造描述符也拒绝，AST 门禁不许恢复 typed 定义/注册/导出/消费者。Coding 在自己的 `goals-actions.ts` 里按动作 id 与版本就地声明（`GOALS_ACTIONS`，不 import Goals 合同）；四项受限读写核当前内置实例资格，身份仍取原调用上下文，其余测试用现行动作验证业务。
  - Feed 升格为 Goal 经 `goals.directory.read`、`goals.create`、`goals.inputs.confirm` 写 Goals（升格动作用 `required_actions` 声明了这三项，授权设置要一起授权），Feed 不写 Goals 的表；Goals 不在项目里时升格不可用，Feed 的入口也不再出现。
  - `src/module/`（原 `modules/goals`）的不变量：
    - Repository 只由包内装配；公开 Module、查询服务和只读装配不提供 `repository` 成员，调用方通过命令、查询、事件及生命周期服务工作。
    - `events` 是当前工作状态与完成效果的唯一写入者。
    - 从回收站恢复沿同一关系图校验，在原事务内逐边恢复；冲突或事件写入失败整体回滚。另一端仍在回收站的关系保持 pending，改正图后原请求可重试。定向回归：`tests/goals-lifecycle-actions.test.ts`。
    - 实质承诺变化须引用对具体变化的有效授权，不能靠改类型绑定或自填操作者绕过；版本缺失或过期在副作用前拒绝。
    - 完成只经显式收尾：普通支持不自动完成，无关笔记不重开已完成的 Goal。
    - 项目规则「完成前必须你点头」进入完成检查：打开时，完成前要有这一轮、这份约定的可信用户结论（点头）；点「完成」的人是用户，本身不算，管理入口把收尾记成本机这个人也不算。点头有两种：某条要求上已接受且仍然成立的结论，和针对 `complete` 的最近一条决定（要是授权）。两种按同一个办法判断，看写下结论的那份决定：它是在这一轮工作里做出的（Goal 被继续或重新打开之后，更早的授权和接受都不再放行），并且它记下的整份约定的承诺（授权 `complete` 和接受要求的决定都记整份：结果说明、每条要求的原文、是否需要用户验收、绑定的事件类型）和现在的约定逐字相同（有一处变了就不放行，不论谁改；改了又改回，逐字相同就又放行）。要求上的结论是否还在，仍是要求自己的规则：要求被改写、退休、结果说明被改写（每条要求的结论都过期）、结论之后被拒绝，结论就没了，改回原文也不恢复。授权按决定的效果判断，不按范围里写的动作：范围里写了 `complete`、效果只有接受要求的决定是接受，不是授权。被别的原因挡住的收尾和成立的收尾都不会用掉点头，同一轮同一份约定里可以再收尾。带「需要用户验收」的要求本身不受影响（结论还成立就算已验收），项目规则另外要点头，授权不能代替那条要求自己的验收。`tests/goal-events-state.test.ts` 守着这条，管理入口那一面在 `tests/goal-management-identity.test.ts`（`specs/archive/goal-closure-identity`）。
    - 关系图合法性、授权与事务在正式入口检查，页面和 MCP 只呈现结果。
    - 结果合同只认现行取值；存量数据由维护改成现行形状，读取不兜底历史取值。
    - 库里存的项目 JSON（`policy_json`、`in_scope_json`、`pack_json`、`source_refs_json`、`baseline_versions_json`、`scope_json` 等）与 Home 里个人方法包的 `pack_json`（`personal_planning_method_packs`）读不出来时抛 `goals.storage.record_unreadable`（`internal`），不按空值处理；SQL NULL 仍用备用值，错误不带列名、表名、行号。
  - `src/governance/`（原 `modules/governance-collaboration`）的不变量：
    - 本包直接声明并抛出共同 `ActionError`；装配不注入错误工厂，现行用户来源拒绝与聚合输入详情由本包保留。
    - 记录谁在什么来源下批准了哪一项变化，不替 Goals 计算完成。
    - Runtime 不能用自填的 `actor_kind=user`、`user_confirmed` 或对话摘要作为授权；不同范围的授权不能互相复用。
    - 跨 owner 写入走实际的决定事务，UI 与 MCP 不另写批准或完成规则。
    - 历史 self-verifier 不能展示为用户验收，旧决定不能变成当前任意变更的授权。
- 改动后必跑：`node scripts/run-tests.mjs tests/goals-actions.test.ts tests/goals-command-actions.test.ts tests/goals-library-actions.test.ts tests/goal-event-create-flow.test.ts tests/goals-tree-actions.test.ts tests/goal-progress-plugin-identity.test.ts tests/goal-management-identity.test.ts tests/goals-guidance-actions.test.ts tests/goals-planning-actions.test.ts tests/proposal-entry-chain.test.ts tests/management-door-identity.test.ts tests/goals-query-boundaries.test.mjs tests/goals-input-confirm.test.ts tests/goal-artifact-inputs.test.ts tests/feed-goal-promotion.test.ts tests/goals-command-module.test.ts tests/goal-events.test.ts tests/goal-events-state.test.ts tests/goals-query-facts.test.ts tests/goals-storage-boundaries.test.mjs tests/goals-stored-json.test.ts tests/goals-personal-methods-stored-json.test.ts tests/governance-collaboration-module.test.ts tests/governance-provenance.test.ts`
- 相关手册：[docs/modules/goals.md](../../../docs/modules/goals.md)、[docs/modules/governance-collaboration.md](../../../docs/modules/governance-collaboration.md)、[skills/molis-plugin-dev/SKILL.md](../../../skills/molis-plugin-dev/SKILL.md)、[PRODUCT.md](../../../PRODUCT.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

共享的五个 Goals 插件动作合同与schema在 `plugins/native/goals/src/contract/goal-actions.ts`，由 Goals 自己的动作注册引用（`src/actions.ts`、`src/event-command-actions.ts`）；Coding、CLI、MCP 不 import 它，按动作 id 与版本调用、用到的字段就地声明（Coding 在 `plugins/native/coding/src/goals-actions.ts`；MCP 的描述与字段从宿主自带的 Goals 定义读，与登记进动作目录的是同一份，提供方按 BL-501 固定，不查运行时目录）。contract/state/progress/receipt的plugin受众要求Host实际登记且仍有效的内置caller，项目、操作者与安装都须一致；输入不提供资格。list与note保留原plugin边界。四个Goals context/progress typed协议已移除，Host与SDK均答不可用，不通过伪造描述符恢复。

规划检查/影响与树检查/决定的输出携带现行 goals.planning.* issue，四个动作版本为2；其他动作版本保持。review_action指向goals.planning.impact@2，固定旧版本的调用方需重新发现/授予当前动作。当前错误码按goals.<原前缀>.<原因>，缺Goal为goals.not_found；业务事件goal.trashed/goal.archived等保持。
