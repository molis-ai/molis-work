# 目标用例与原生界面

把 Goal 的当前约定、要求、工作记录和可信决定组合成可操作的工作流，提供目标目录、时间线、树结构和历史正文界面。

包名：`@molis-ai/molis-work-plugin-goals`。工作区内部包，通过仓库构建和 Host 装配使用。

Status: `partial`。插件合同：`@molis-ai/molis-work-contracts/platform/plugin`。
历史迁移目标：`goal-reorg-f2`、`goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8`、`goal-reorg-gw4`、`goal-reorg-gw5`、`goal-reorg-ex4`。当前完整迁移范围以 `specs/action-architecture/spec.md` 为准。

## 一次典型调用

Host 注入各 Module 的公开端口。`GoalEventApplication` 连接创建、普通笔记、类型与要求、上报、决定、收尾和明确继续；`GoalReadApplication` 提供项目指导和历史读取。HTTP handler 与 UI contribution 将同一当前事实交给各 App，目录和正文无需重建旧 Claim/Run 动作状态。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/goal-event-application.ts](src/goal-event-application.ts) | 当前事件工作流与紧凑状态回执 |
| [src/goal-query-application.ts](src/goal-query-application.ts) | 目标读取 |
| [src/goal-tree-decision.ts](src/goal-tree-decision.ts) | 目标树确认 |
| [src/document-collection.ts](src/document-collection.ts) | 文档列表投影 |
| [src/http/index.ts](src/http/index.ts) | Web 操作入口 |

可对照现有调用方 [apps/local-host/src/goal-project-application.ts](../../../apps/local-host/src/goal-project-application.ts) 阅读装配方式。

## 接入与边界

`goalsActions` 当前提供 50 项 project 动作，由 Manifest 声明并在项目动作服务中注册，其中 43 项可按授权供 MCP 使用，7 项仅供受保护的用户操作：

- 本地管理：`goals.board.initialize`、`goals.board.import-v3`，只接受可信 management 用户上下文。CLI/管理 MCP 和 host-only typed 入口薄转发同一动作；普通 MCP/Agent/插件不获管理权。原初始化回执、导入事务与禁止覆盖保持。
- 目录、创建、便笺：`goals.list`、`goals.create`、`goals.note`。
- 结构提案：`goals.tree.submit`、`goals.tree.read`、`goals.tree.check`、`goals.tree.decide`。提交只保存提案，检查保存检查结果并回滚预检变更；审批为受保护的用户操作。历史提案保持可读，退役类型不能重新批准。
- 目标生命周期：`goals.active.set`、`goals.archive.set`、`goals.trash.set`、`goals.trash.list`。当前目标不启动工作；归档须已完成；回收站操作须明确确认，保留阻塞、完整历史及关系恢复结果。
- 关系与规则：`goals.relations.list`、`goals.relations.add`、`goals.relations.deactivate`、`goals.policy.history`、`goals.policy.resolve`、`goals.policy.save`。三项查询可按授权供 MCP 使用；建立/解除关系与保存项目默认规则是受保护的用户操作。模型需使用结构提案。
- 项目长期说明：`goals.guidance.read`、`goals.guidance.add`、`goals.guidance.update`。读取完整修订与提示词；新增/编辑/停用/恢复保留明确确认、原因、确认摘要、原去重及幂等回执。
- 工作记录与状态写入：`goals.events.configure`、`goals.events.report`、`goals.progress.record`、`goals.concerns.apply`、`goals.decisions.request`、`goals.decisions.cite`、`goals.agreement.set`、`goals.closure.submit`、`goals.work.resume`。
- 项目规划：`goals.planning.read`、`goals.planning.save`、`goals.planning.apply`、`goals.planning.impact`、`goals.planning.graph.check`。方法与组合、版本、事件类型及默认要求沿用原 Planning Engine；保存/采用要求明确确认，每次保存生成新版本，不自动重试。
- 完整资料：`goals.snapshot.read` 返回原项目快照，`goals.contract.read` 返回目标约定及相关历史。CLI/typed 快照和旧 MCP snapshot 均调用共同动作；网页 Session 交接同时读取授权约定与当前状态，失败不创建交接包。
- 完整集合：`goals.collection.read` 返回当前/归档/回收站集合、历史、覆盖和输入/规则绑定；整页、Board JSON、fragment 和复用页面资料的消费者等待同一动作，缓存命中仍重新校验权限。
- 目标正文：`goals.document.read`，组合当前状态、原始说明、混合历史首屏、关系、风险、规划方法与继续方式。网页完整页和正文 fragment 与标准 MCP 共同读取，归档/回收站历史保持。
- 当前状态与目录项：`goals.state.read`、`goals.directory.read`。
- 进展保存回执：`goals.progress.receipt`，按可信调用者、目标和原幂等键读取；不存在时返回 null，不接受指定其他作者。
- 用户决定：`goals.decisions.record`，仅 user audience、`goals:decide` 权限和 Host 提供的用户操作出处共同满足时执行；原 Governance 和 Goal 事务保持不变。
- 事件原文与索引：`goals.events.list`（正序）、`goals.events.latest`（倒序）、`goals.events.read`、`goals.timeline.list`（紧凑索引），分页使用数字事件游标。
- 完整历史：`goals.history.list`、`goals.history.read`，合并当前事件和旧 Run、Evidence、Review、Journal，分页使用返回的字符串游标。历史正文保留来源和 HTML 转义；目录项或历史条目不存在时返回 null。

查询需要 `goals:read`，普通工作写入需要 `goals:write`；MCP 客户端须显式授权精确动作。输入不接受 board、actor 或权限，Host 从项目与调用上下文绑定。有幂等合同的写入沿用原事务及 idempotency key，新旧入口读写同一记录；记录便笺不代表完成目标或作出用户决定。输出合同包含完整类型定义、报告原文和历史状态字段。

对应 typed Capability、Coding 目标目录/状态/进展、项目恢复目录与焦点查询、Web 创建/便笺/工作操作/状态/事件/历史及首页胶囊目录已经转调统一动作。旧 MCP 的目录、创建、状态、事件查询、普通工作写入、项目规划、长期说明、生命周期和目标树（共 30 个兼容名称）共用逐客户端动作授权和常驻 Host，不再通过这些名称指定数据库或自填作者。旧写入口保留可信 Runtime Session 作者及原幂等域，新公共动作保留客户端作者；权限始终按客户端与项目判断。Casebook 的 Web 和 MCP 观察渠道各自保留，异步返回后只记一次结果，完整历史组合内部的查询不重复观察。可信旧调用者未记录 actor kind 时保持未知分类，不补写成用户身份。

Coding 的进展回执查询也转入统一动作，保留原保存回执和重启恢复行为。进展附带的成果来源是提交者的引用，不表示系统已验证成果内容，也不构成用户授权。

用户决定的 Web 和管理 typed 入口也使用共同动作。Web 的直接事件端口及同步观察包装已删除。管理 MCP `event_decide` 保留受保护渠道的薄适配，从同一动作派生业务 schema；它不能作为普通 MCP 授权能力导出。旧 typed 决定入口声明 `host_only`，插件即使声明 consumes 也不能使用它提交自填 authority。

文档页完整集合和所选正文已共用动作；Host 仅组合已授权资料，正文另读当前规划方法，个人方法更新不会被页面缓存遮蔽。初始化/旧数据导入管理入口也已转入动作；与其他插件的剩余消费和系统生命周期仍待全量审计。MCP 连接恢复摘要已使用当前客户端的精确动作授权与常驻服务；typed 恢复和 MCP 共用原目录/焦点组合，缺权限或服务不可用时返回缺失内容原因，连接状态保持真实。同步事务和历史合并内部继续使用原业务 owner。

请求或引用决定不等于作出用户决定。普通动作不接受 actor/authority 等身份授权字段；项目规划保存/采用的 user_confirmed 只保留原业务确认前提，不产生用户决定权；用户验收、放宽约定和接受风险仍执行原领域校验。标准公共动作和兼容名称均拒绝未授权调用，管理模式也不能通过已迁移名称自填用户作者。

项目规划的 typed、Web API、方法详情/编辑以及设置总页的实际读取入口已使用共同动作。网页复制、编辑和采用保留完整事件类型及默认要求；个人模板和项目方法保持独立版本与数据。

长期说明的 Web API、项目设置、旧 typed、新旧 MCP、Work 提示词和 Agent 项目层共用动作。Agent 使用原修订数标识说明版本，编辑同一条也产生新的冻结版本。说明写入已成功而后续列表读取被拒绝时，HTTP 返回保存回执及独立刷新错误；不把已保存操作报成失败。长期说明变更的 user_confirmed 保留原业务确认前提，不产生用户决定权。

生命周期的 Web API、CLI 当前目标、typed 回收站组合及四个旧 MCP 名称已转入动作。删除/恢复旧名固定操作方向，拒绝输入 trashed 覆盖；work_state 从本次原回执生成，后续排队写入不会改写它。旧 active_goal 的任意嵌套 payload 撤下，改收 goal_id、reason、idempotency_key，身份和项目由已授权连接绑定。旧 MCP Runtime 名单从兼容动作声明派生，删除与恢复共享同一授权；原领域数据和回执保留。

目标树的 typed、CLI、Web 审批、三个普通 MCP 旧名及管理审批共用四个动作，原 Submission/Query/Check/Decision owner 保留幂等、事务、基线冲突及修订语义。新输入只允许 goal/create、relation/create|deactivate；part_of 为子目标到父目标，depends_on 为消费目标到前置目标。修订条目须使用新的稳定 item_id，修订后的提案仍需审批。schema 位于插件，不另维护 MCP 业务 schema。

`goals.tree.decide` 只接受 user audience、goals:decide 及受保护 Host 注入的用户和操作出处；`goalTreeCapabilities.decideGoalTreeProposal` 同样为 host_only，普通 MCP、模型、工作流和插件不能通过自填 authority 获得审批权。管理 `goal_tree_decide` 仅保留薄转发。旧 Runtime 对话自报确认帮助器已删除，历史记录中的 runtime_dialogue 来源仍保留可读。

旧 MCP 提交的 submitted_session_id 从可信 ActionCallContext.runtime_session_id 注入，经过常驻服务网关保持；typed 旧调用也保留原会话与回执哈希。业务输入不能覆盖该字段。原始用户身份和整组提示由 user_action 提供，审计 Runtime 身份不能替代用户。Casebook 将新入口映射至原操作记录合同，Web 保留原渠道，单次调用只记录一组尝试和结果。

关系和项目规则的 Web 写入、规则设置页、所选目标正文均消费共同动作；原领域事务、关系方向、规则合并及历史绑定保持不变。三项直接写入要求 user audience、goals:decide、Host 提供的真实用户与 web/management 出处，普通 MCP 无法授予这些权限。原 HTTP commands/query 端口和没有调用者的 Workbench/CLI/MCP GoalsApplicationApi 转发工厂已删除。整页目录的历史组合也通过集合动作读取。

个人方法读取已改为原 Catalog 的实时端口：默认 Host 使用自己的 Home，每次查询/采用读取当前版本；Web 与 MCP 不再各自装配一份默认读取规则。全局保存不再关闭项目 Runtime 或清空 Feed scheduler；项目 URL 另存为个人方法也立即影响所有打开项目的后续选择。所选正文与规划页实时读取当前方法，页面缓存不保存个人方法选择。项目覆盖副本及已保存 Goal config 保持原版本，模板编辑不会重写历史。Home 目录/保存已使用 `personalPlanningActions` 的两项共同动作（`goals.planning.personal.list/save`），Manifest 声明，Host 在启动时作为 Home 系统服务注册，无需项目或页面。全局和项目 URL 的个人保存共用原 Catalog owner；普通 MCP 经明确 Home 授权查询，保存为 user 专用，要求可信 web/management 操作出处。未配置原 Catalog 写入端口时明确不可用，不另建数据库。合计 52 项动作：50 项 project、2 项 Home，其中 44 项可按授权供普通 MCP 使用。
