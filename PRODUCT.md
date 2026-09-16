# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

主要用户是同时使用 Codex、Claude Code、Cursor 等 AI Runtime 推进真实项目的个人开发者、产品负责人和小团队。他们需要在多个 Session 或 Runtime 之间持续工作，但不希望靠聊天记录猜测当前目标、下一步、风险和完成标准。

V1 首先服务单设备、单 Workspace 的本地使用场景。用户在正在对话的 Runtime 中调用统一 Skill。新 Goal 和已转交 Goal 经 MCP 保存意图、可选配置事件类型、上报工作事实并读取当前状态；不必先领取角色或启动 Run。CLI 是管理和调试入口。Web 是可选查看与确认界面，也是可信用户决定的入口，不是 Runtime 的必经步骤。macOS App 与浏览器打开同一套 loopback Web 工作台；Goal 页可以托管用户显式打开的本地 TUI 视口。终端栏会持续显示它属于哪条 Goal，切换 Goal 不会改绑已有终端，也不会自动发送。父 Goal 可以记录自己的整合或验收结果；子 Goal 数量不自动证明完成。未转交的历史 Goal 仍保留旧草稿和 Claim/Run 入口。打开页面不会自动绑定 Session，Board 仍不派单。

## Product Purpose

Molis Work 是 Goal 的权威真相源。它把用户意图逐步整理成可理解、可执行、可验收的 Goal Spine，并清楚显示：

- 最终想实现什么；
- 当前为什么做这一步；
- 哪些 Goal 现在可以继续（新 Goal / 已转交 Goal 走事件入口；未转交历史 Goal 仍走领取协议）；
- 哪些依赖、风险或决策正在阻塞；
- 最近做成了什么、依据是什么、还差什么；
- 当前约定、真实支持和适用阻塞满足后，才由显式收尾写入完成。

成功意味着用户不读技术协议也能在几秒内回答“现在目标是什么、接下来做什么、为什么还不能完成”。

## Positioning

Molis Work 不是另一个 Kanban，也不是 Agent 调度器。它的差异机制是：

- 叶子 Goal 是可独立交付和验收的目标节点；真正干活的工作台是独立的 Task，可以没有 Goal 就创建，一条 Goal 最多关联一条 Task；
- Plan 和 TaskBoard 都是 Goal Spine 的派生视图；
- Runtime 自己读取和上报，Board 不派单；未转交历史 Goal 仍可领取；
- 接受后的业务 Goal 不被静默改写；
- 依赖、风险、影响范围和有效决定仍是授权与完成边界。普通事件支持不自动完成；显式收尾才写入完成。未转交 Goal 仍用 Evidence/Review 门禁；
- 执行发现的新需求先作为 Candidate Goal，由用户确认后进入 Spine。

## Operating Context

V1 在本地 Workspace 中运行，共享 SQLite 保存权威状态。CLI、MCP 和 Web UI 使用同一套应用语义。

安装默认只把自包含程序、共享 Skill 和稳定启动器写入 `~/.molis-work`，不会修改项目或 Runtime 配置，也不会创建项目、关联 Session 或启动服务。Runtime 接入、项目管理和 Session 关联是安装后的独立显式流程，不能再用一个“安装后启用/启动项目”的总动作混在一起。Runtime 接入统一使用 adapter 的 `detect → plan → confirm → apply → validate → remove` 链路；当前配置 adapter 支持 Codex、Claude Code、OpenCode、Pi Agent 和 Grok Build；MCP 会话协议本身仍支持其他 Runtime。Pi 的 MCP 写入 `~/.pi/agent/mcp.json`，供官方推荐的 pi-mcp-adapter 读取。预览不返回用户配置全文，写入同时管理 MCP 与 Skill，失败自动回滚，移除只撤销 Molis Work ownership receipt 证明仍属于自己的字段和链接。macOS 常驻 Web 同样先预览再确认，使用 LaunchAgent 的 RunAtLoad/KeepAlive 和可诊断日志，并显式提供安装时 Node 的 PATH；“已加载”和“进程正在运行”必须分别判断。用户在当前对话调用 Skill 后，Molis Work 优先读取单次 MCP 调用元数据中的 Session ID，其次使用 Claude Code 等 adapter 的稳定 Session 信号；工作目录作为独立 workspace 用于查找用户以前明确关联过的项目，不伪装成 Session ID，也不是项目身份。普通选择只记录 workspace 历史；每个新 Session 仍须确认 Project，即使只有一个候选，Molis Work 不保存 workspace default。用户明确拒绝一个建议时，只在能识别该 Session 时记录本 Session 的拒绝；选择、切换、解绑和删除仍各自需要明确确认。每个 Molis Work 项目有自己的 SQLite DB，并按 `user`、`migrated_user`、`regenerable_demo` 分类；Web、CLI 和开发脚本共用同一 demo 生命周期。普通卸载先预览，只撤销 ownership receipt 仍能证明属于 Molis Work 的接入和程序，清理可再生 demo，保留用户项目、catalog、备份与日志；永久清除用户数据必须再确认精确 home 和用户项目数量。Web 可选；Runtime 不因为 Web 未打开而停止澄清或执行。服务或项目连接不可用时，Runtime 报告事实，不自行创建另一个真相源、猜测项目或改写配置。

典型流程：用户在当前 Runtime 提出粗略想法或要求继续工作 → Skill 解析经用户确认的项目 → 新意图直接保存并自动归事件 owner，可以不选规划、从局部类型开始 → 工作规划只提供可选择采用的类型与默认要求；采用版本和 Goal 局部修改持久保留，模板变化不改旧含义 → 普通报告保存部分结果和来源，支持/反证/未知只更新相关要求，普通支持不自动完成 → 读取当前约定、差距与历史 → 需要用户决定时由 Host Web/管理入口记录；Runtime 可以请求和引用已有有效决定，不能自填 user 身份；已有有效同范围授权不重复问 → 显式收尾检查当前约定、真实支持和适用阻塞；已记录与完成生效分开。无要求时可以工作，但不能宣称完成。未转交的 `legacy_claim_run` Goal 可读新时间线；要开始新版事件写入须显式「使用事件记录继续」。转交前旧草稿和 Claim/Run 仍有真实入口，不能说所有旧操作必须转交；转交后旧状态写入拒绝。Web 中，左侧保留项目与目标列表，主区是可平移、缩放的 Goal 依赖画布。从 Goal 节点的打开入口或列表项进入工作区后，内容贴齐当前标签页下的整块面板；左侧返回入口恢复原画布视角与节点布局，工作区不能拖动。Runtime 占据主区，可收起的信息侧栏呈现目标、预期结果、当前进展、要求进度、待确认和时间线，正文在对应事件下展开。记录模板、目标与要求、完成要求和表单沿用同一工作表面，固定标题与操作，长内容内部滚动；返回后恢复原入口。窄屏按需覆盖显示信息与记录内容，避免把信息、终端和时间线同时挤进页面。时间线仅保留「记一笔」，展开后说明备注、进展、问题三种用途；待决定仍按需显示，记录模板移入更多菜单，移除「设为当前 Goal」；未转交 Goal 仍保留显式转交入口。打开 Goal 不会启动终端或发送内容。需要本人判断时，进入决定中心查看问题、现在为什么要决定、是否有可靠建议，以及每个选择会带来什么结果。

Project 是内容范围，不与 Sessions 构成全局 switch。用户先选择项目，再在项目根目录中使用平级的 Goals、Sessions 与工作目录；全局 `/sessions` 与 `/workspaces` 不提供管理页面。Molis Work `session_id` 是目录、关系和 Handoff 的业务主键；`runtime_id + native_runtime_session_id` 只负责在原 Runtime 中读取、恢复和继续执行。每条 Session 最多关联一个 Project、零或一个当前 Goal，并保留 Goal 历史。Runtime adapter 明确声明原生可读、Molis Work 兜底记录或不可读取，不支持时不得猜测对话内容或伪装成可恢复。工作目录管理路径健康、显式 Project 关系和新 Session 启动；它不是 Project 身份，也不建立 Project 默认目录或目录默认 Project。跨 Runtime 继续工作只通过用户确认的 Handoff，把当前 Goal 与必要上下文交给目标 Runtime 并创建新的目标 Session；没有当前 Goal 时必须先选择 Goal。所有关联、转移、解绑、归档、路径修复、启动与 Handoff 都逐次确认；归档 Molis Work 记录不删除 Runtime 原生内容，移除工作目录记录不删除文件。

上述规则取代早期“用户可以另设 workspace default”的设想：当前产品不提供持久 workspace / Project 默认关系。普通选择只记录可追溯历史，新 Session 即使只有一个候选也由用户确认。

来源、Feed 与 Inbox 是一条信息流上的三个不同对象。来源管理账号和接入源、连接状态、配置以及手动或定时拉取计划，并采用与 Goal 相同的目录—详情工作台；Feed 保存所有来源拉取到的完整消息事实；Inbox 只保存需要用户介入的引用或内部事项，必须说明进入原因、关联对象、当前状态与下一步。Feed Item 可以手工或经明确规则进入 Inbox，也可以保存为资料、升格 Goal 或忽略；Inbox Entry 处理完成后退出默认待处理列表，但原 Feed Item、来源、Goal 和权威事件仍可追溯。桌面保持目录与详情并列，窄屏按目录、当前列表、详情逐层推进。

Molis Work 直接注册、暂停、恢复和同步公开 RSS/Atom、网页查询、YouTube，以及 GitHub/Gmail 账号来源；所有同步均有本地运行状态、幂等键、失败收据和中断恢复。保存为资料只改变 Item 的本地处理状态；“升格为 Goal”和“开始处理”会创建或复用同一条 Draft Goal，并把 Item 绑定为输入。外部标题、摘要、正文、链接、资料和来源元数据始终是不可信输入，不得直接成为 Goal、系统或 Runtime 指令。“开始处理”随后进入该 Goal 的 Runtime；用户选择 TUI 后，Molis Work 把经过控制字符清理并带有不可信数据边界的上下文填入终端，但不会自动发送。窄屏下 Feed Workbench 在 Item 列表与详情之间切换，不把两栏同时挤进视口。

## Authority and Proposal Rules

- 用户可以直接手工录入 `draft / abstract` Goal。新意图默认用 `goal_intent_create` 保存并归事件 owner。Draft、clarifier 与 Claim 相关规则只服务未转交旧 Goal：用户在 Runtime 对未转交 Draft 提出粗略想法时，仍可通过复合 MCP 创建最小 Draft 和澄清会话，但不把推断写成 accepted Contract 或 canonical 结构。
- Runtime 发现新需求时只提交 Candidate Goal。用户是否接受 Candidate、是否确认它引起的 Rewire 是两个独立决定；接受新 Goal 不等于同意它阻塞当前 Goal。
- 用户创建 Goal 时亲自指定的 `parent / depends_on` 可以直接成为 active。用户明确选择进行 Goal Tree 拆分或关系提案时，Runtime 发现的拆分、依赖或关系变化仍只能先成为 Proposal；这不是新事件 Goal 开始记录的强制前置。
- 依赖 Proposal 不由 Molis Work 扫描代码自动产生。Runtime 先选择当前任务的工作类型、专业领域、行业与场景叠加层方法，再结合 Contract、代码、文档、测试、数据结构、业务顺序、影响冲突和风险策略，说明哪项产出被哪项工作消费；依赖方向由这条产出—消费关系推导，不能只凭时间先后或主观直觉连接。
- 规划方法按 `项目 > 个人 > 内置冷启包` 生效。内置方法分为元方法、工作类型、专业领域、行业和跨行业场景叠加层；它们是共同检查同一 Goal Tree 的正交视角，不是机械串行的阶段模板。每个内置方法只在 `skills/goal-advance/methods/` 中占一个 canonical Markdown 文件，尤其每个行业一个文件；新增行业不应要求修改 Runtime 注册代码或复制通用方法正文。遇到未知领域时，Runtime 先用元方法补齐领域边界、专业阶段、关键产物、质量门和失败模式，再提出可复用的新方法。项目与个人方法都由用户显式保存，不会自动改写 Goal Tree。
- 每轮拆分和 Rewire 都必须通过同一套整图检查：不存在缺失端点、自依赖、重复关系、父子循环、依赖循环或父子与依赖组合形成的执行循环。通过后，Coordinator 按拓扑层级、可解锁下游数量和最长后续链给出执行顺序与理由，不再由各 Runtime 各排一套顺序。
- 用户提出新要求时，Runtime 先分析直接受影响的 Goal、依赖它的下游和仍可复用的工作，只对受影响子图提交 Proposal；确认后再重新计算整图顺序。历史有效且不受影响的 Goal 不重拆、不重做。
- 正式 Dependency Proposal 必须说明 `from_goal_id`、`to_goal_id`、类型、原因、`basis`、`evidence_refs`、`impact_if_rejected`、`confidence`，以及为什么方向是 A → B 而不是 B → A。
- 已确认依赖仍是开工和完成的硬门禁。未转交 Goal 的 Claim 与完成仍受此约束；事件 Goal 的显式收尾同样检查适用依赖。代码变化只能触发 revalidation / Rewire Proposal，不能静默删除或反转 active dependency。
- 未转交旧 Goal 上，clarifier 认领手工 Draft 后，可以提出 Contract 补全建议；客观代码/文档事实可以标为 proposed/unconfirmed，业务意义、边界、优先级、验收和风险接受必须由用户确认。
- 未转交旧 Goal 的 Draft 只有在用户确认 Contract 补全后才成为 accepted/executable。未转交路径上的 accepted Contract 不原地改写；后续独立需求创建新 Goal 并重排关系。新事件 Goal 开始记录不以 Draft 澄清或 Contract 补全为强制前置。事件 Goal 在已有授权内通过 `event_agree` / `event_configure` 及返回版本维护当前约定，历史保留。
- 任何复杂 Goal 在标记为拆解完成前，都必须回到用户原始需求并逐项交代五层通用结果链：最终结果、实际流程、核心能力、基础能力与基建、质量与持续交付；不能因为最近讨论的内容很详细就默认省略支撑工作。随后再按任务补查：游戏关注玩法、玩家旅程、交互和视听；App 关注核心功能、端到端旅程、交互和信息；AI/数据关注数据质量、评测、运行成本与安全；内容/研究关注来源、方法、审核与发布；运营关注角色权限、工具流程、例外与衡量。每一项可以由同一个范围合理的子 Goal 承担，也可以说明不适用；核心能力和基础能力由不同 Goal 承担时，必须明确前者消费后者哪项结果以及依赖方向。
- 任何预计并行执行的复杂项目都先建立或核对一份大小合适的根 SSOT，只保留共同结果、非目标、全局约束、权威决定与证据位置、单元索引、跨单元契约、汇合规则和开放决定。工作单元按两条轴划分：纵向结果单元拥有一个可独立使用和验收的结果；横向共享单元拥有被至少两个纵向单元消费的方法、资产、数据、政策、标准或服务。地图稳定后，各单元 SSOT 可并行撰写，每份只维护自己的结果、消费者、职责与非职责、唯一决策和资产、输入输出、证据、例外、汇合点及 Impact surfaces。两个单元共同编写同一事实、拥有同一决定或可变资产、双向了解内部实现、形成循环或冲突写入面时必须重新划界；不同文件本身不证明正交。
- 非技术工作也使用同一逻辑，但 SSOT 形态随专业结果变化：研究可用研究协议与证据账本，增长可用项目章程、定位和度量口径，内容可用选题/叙事契约与编辑标准，运营可用服务蓝图、角色权限和例外手册。根 SSOT 或其可信增量只阻塞会改变共同边界的决定；单元执行只依赖自己的 SSOT 和真实消费的提供者结果，独立单元保持并行，最后由综合、发布、审批或运行检查点消费全部结果。
- 复杂技术项目在进入实现拆解前，必须先建立或核对仓库中的项目级 SSOT：项目结果、非目标、全局不变量、权威状态与决策位置、模块索引、跨模块契约、迁移/发布/恢复规则及验证来源。Molis Work 仍是 Goal、关系、决定和执行状态的权威真相源；仓库 SSOT 负责产品、架构和模块契约，代码、测试与运行 Evidence 负责证明实现行为，三者不得复制同一可变状态。已有且可信的 SSOT 可以复用，小型局部修复不强制重建整套文档；发现跨模块契约或所有权变化时必须回到该步骤。
- 技术模块先按两条互补轴划分：纵向模块拥有一条可独立验收的端到端用户或调用结果，横向模块向多个纵向模块提供稳定共享能力。模块地图稳定后，各模块 SSOT 可以并行撰写；每份必须声明唯一拥有的状态、数据、决策和公共契约，输入输出、消费者、异常恢复、验收以及 read/write/decide/exclusive Impact surfaces。UI、API、数据库、文件夹或团队分工本身不构成模块；两个 SSOT 或两个并行 Goal 不能共同写入或决定同一权威区域。
- 实现 Goal 只依赖自己的模块 SSOT 和它真实消费的提供者契约。契约已经稳定且消费者可用 test double、fixture 或兼容层独立验证时，提供者实现与消费者实现保持并行；集成与端到端验收再同时依赖双方可运行产物。只有无法在缺少实际提供者结果时正确开始或完成，才把提供者实现设为硬前置。文档分开不代表正交，正交必须由唯一所有权、单向产出消费、无循环和无冲突写入面共同证明。
- 一条叶子 Goal 只能承诺一个可独立交付和验收的主要结果。进入 Inbox 待决定流程前，Runtime 必须逐项说明承诺输出是主要结果、同一次验收所需的配套结果，还是应独立成 Goal 的结果；候选工作在“可单独交付、可单独验收、可独立返工”三项中满足至少两项时必须继续拆分。范围、非目标、输入、输出、验收证据或重要决定仍未写清时，它保持开放拆分，不能伪装成可直接执行的叶子。
- 一轮对话不必强行拆完整棵树，但阶段性暂停必须保留“仍需拆分”的状态，写明尚未拆完的 Goal 和下一步；只有关键路径都有明确归属且没有开放子树时，父 Goal 才能成为 `closed_compound`。

上述规则是产品 Contract。现阶段已具备事件工作入口、Candidate/Rewire、未转交路径上用户手工或对话初始化的 Draft、完整 Dependency Proposal、同一 Draft 的 Goal Tree 提案与用户原子确认，以及默认 Runtime MCP 暴露面收紧。普通 Runtime 对新 Goal 和已转交 Goal 读取、配置/上报事件、请求决定和显式收尾，不能自行裁决 canonical Goal，也不能自填 user 身份；未转交历史 Goal 仍可选择、认领、提交 Evidence 和 Runtime Review。用户确认前，当前 Draft、Policy、Impact 和 Risk 保持不变。用户确认的复合父 Goal 显示“已澄清，等待子 Goal”，确认的叶子显示“待执行”，仍未确认的 Draft 才显示“待澄清”；这是一套派生工作状态，不再另设“澄清完毕”。

父 Goal 的完成不能从子 Goal 数量直接证明。事件 owner 的父 Goal 可以记录自己的整合或验收结果。未转交且用户已确认的 `accepted / closed_compound` 仍按原生命周期协调子项；`abstract / frontier_open` 表示拆分尚未确认结束，即使当前列出的子 Goal 全部完成，父 Goal 也只表示“现有子项已完成，等待确认是否覆盖整个父目标”，不能自动完成。此时未转交路径会把父目标确认标为优先续办；用户下次要求继续时，Runtime 先回到这个父 Goal，确认收口或继续补充子 Goal，不能直接跳过。标为 `closed_leaf` 却同时包含生效子 Goal 属于结构冲突，需要先确认它究竟是独立结果还是复合父 Goal。新增子 Goal 让已完成复合父 Goal 重新打开后，同样必须再次确认扩展后的拆分完整性。

用户或 Runtime 发现结果不符合预期、逻辑错误、体验阻塞或其他会让完成结论失真的问题时，必须把它带回 Goal 生命周期，不得只留在聊天或实现备注中。先查是否已有 Goal 负责：直接影响当前验收时保持未完成，并记录失败依据或真实阻塞；已有 Goal 覆盖时更新其下一步，不重复创建；需要独立交付或验收时提出纠正 Goal 并准确关联原 Goal；只有尚未发生的不确定情况才作为 Risk。该规则适用于代码、设计、内容、研究、运营等所有任务。

未转交 Goal 在依赖或风险变化后被标记为 `needs_revalidation` 时，executor 继续被阻止；只有有效 revalidator Claim/Run 可以提交核对证据。Coordinator 在 accepted Contract、active dependencies 和 blocking Risks 全部通过时才恢复 `valid`，且该入口不能修改 Contract、关系或完成状态。事件 Goal 的反证只更新相关要求；完成仍须显式收尾。

## Capabilities and Constraints

- V1 是单设备、单 Workspace、本地优先产品。
- SQLite 是权威真相源；JSON/Markdown 只用于导入、导出和可读快照。
- Goal 必须包含面向人的 `business_logic`，不用技术术语解释业务闭环。
- Goal 逐步拆解，不要求一开始列出所有远端实现任务；但每轮暂停都要保留开放边界，正式收口前必须确认产品关键路径没有被近期讨论主题淹没。
- Runtime-neutral。网页和 App 都可以托管用户显式打开的本地 TUI 视口，仍不派单、不选择谁来做。终端必须持续显示所属 Goal，不自动发送。父 Goal 可以记录整合事实，不再把 `closed_compound` 当作“无终端”的完成算法。打开页面不等于启动 Runtime，也不自动绑定 Session。
- Molis Work 是 pull-based 真相源：Runtime 自己读取和回传，不由 Board 分发任务。新 Goal 默认走事件入口；未转交历史 Goal 仍可认领。
- Molis Work 同时提供可解释的规划层：工作规划提供可选择采用的类型与默认要求，不自动成为强制阶段。Runtime 可读取当前有效方法、整图结构问题、执行优先级和需求变化影响；它仍通过 Proposal 与用户确认改变 canonical Goal 树，不把规划建议变成自动派单或静默改树。
- 支持 self、cross、adversarial、human Review Policy，以及 Runtime Goal Mode 要求。
- Goal 画布保留真实依赖和已完成节点，箭头方向为产出提供者 → 消费者，父子归属单独表达。紧凑节点可拖动，展开工作区固定并保留桌面 18px、窄屏 10px 边距；一次只展开一条 Goal。Goal 信息、终端与时间线各自可滚动；事件正文就地展开，不设成果/决定筛选或独立正文列。配置与表单覆盖左侧，窄屏覆盖整个工作区；被覆盖内容退出键盘操作，返回后恢复焦点。
- 「目标与要求」承载目的、范围、有效决定，以及关系、风险、影响范围、Goal 级规则；已绑定资料保留原来源链接、状态、原因和 snapshot_digest。旧草稿编辑仅用于未转交 Goal；事件 Goal 用事件约定入口。「记录模板」在 Goal 信息更多菜单中承载类型与规划，「完成要求」承载当前事件要求、原验收标准（如有）及 Artifact 精确版本。「记一笔」提供带用途说明的「随手备注」「同步进展」「问题与风险」；承诺、授权或完成要求变化走事件表单或可信决定。
- 当前 Goal 画布工作区的交付等级是 3（本地功能可用）：真实画布、记录读写、时间线与既有 Goal 终端接通并完成定向验证。本次未验证安装、打包或发布，不据此称为可发布。
- 项目 Goal 主工作区从同一份 Goal 与 active 关系派生依赖画布。`depends_on` 显示为“前置提供者 → 消费者”，`part_of` 用归属说明表达；完成节点保留并弱化。画布位置与视角只属于本地界面状态，不改变关系、排期、完成判断或 Runtime 所有权；空项目和加载失败提供真实创建或重试入口。
- 项目默认工作规则属于项目设置，不混在单条 Goal 的完整记录里；单条 Goal 只能增加自己的额外要求。全局设置默认先进入项目，不把 AI Runtime 或 coding 工具当成所有项目的默认语境。
- Web UI 必须能查看 Goal Spine、当前事件状态、风险、Candidate 决策，以及未转交 Goal 的 Claim/Run、Evidence/Review 历史。原 Run/Evidence/Review/Decision 按原 ID/来源可读，不转换成伪造的批准。所有待决定事项先说明用户要回答的问题、为什么现在要回答和各选择的后果；没有可靠依据时不得假装给建议。Inbox 在决定卡片关闭后仍以 `Inbox Message · 处理结果` 展示权威事件，并提供回到具体 Goal 记录的入口；没有改变风险状态的“继续待处理”必须明确说明该事项仍会留在 Inbox，最近一次处理后才生成的待决定项必须标为新事项。风险处理类别是用户决定，页面必须直接提供选择，不能让 Runtime 用一段措施代替枚举；具体措施与处理类别分别保存。若 Molis Work 已经判定方案结构无效，页面必须说清哪条 Goal 为什么还不能直接执行，并提供“先拆成可执行 Goal”的单一路径，系统自动记录检测到的问题，用户补充说明可选；只有有效方案被用户主观退回时才要求填写理由。
- V1 不包含云端多租户、复杂权限系统、第三方项目管理同步和完整 Runtime 运维。
- Actor 身份在 V1 可先采用本地声明身份；更强凭据属于后续能力。

## Brand Commitments

产品名使用 Molis Work。界面默认中文，可切换英文；必要的协议字段保留简短英文。Goal 标题和用户正文保持原文，不随界面语言改写。

语言必须直接、具体、简洁、专业：状态名用“目标澄清中”“执行受阻”“待复核”这类短标签，需要解释时再说完整句子；避免幼稚化、过度解释，也避免“赋能、范式、编排中枢、智能协同”等空泛表达。视觉可以有鲜明个性，但不能牺牲任务、状态和操作的可读性。

工作台遵循用户确认的 Linear × coss.ui 方向：连续内容面、细分隔线、克制的中性色与统一控件，整体减弱弹窗感。新建 Goal、Feed 任务配置、Session 添加及关系编辑、Frame 内容选择贴靠工作区边缘；临时编辑仍保留模态焦点保护和取消返回。搜索和确认可以保留紧凑弹窗，空间画布节点保留真实卡片形态。

目前没有确认的 Logo、品牌字体、客户案例或商业数据，不得虚构。

## Evidence on Hand

- `specs/molis-work-mvp/molis-work.md`：开发 Goal、Coverage、Risk 和 Review 状态。
- `specs/molis-work-mvp/domain-contract.md`：Canonical Domain Contract。
- `specs/molis-work-mvp/coordinator-contract.md`：Coordinator 决策与场景。
- `modules/` 与 `apps/local-host/`：业务事实、跨模块用例装配、项目数据库和旧数据导入。
- `apps/desktop/launchers/cli/main.ts` 与 `apps/desktop/launchers/mcp/server.ts`：V1-only CLI/MCP 入口及 Runtime/management audience 边界。
- `apps/workbench/` 与 `plugins/native/goals/`：Goal Tree 与事件正文工作区。Workbench 只做通用呈现装配；完成判断不另算在 UI。
- `plugins/native/feed/`、相关 Modules 与官方 Integrations：Feed Workbench 的 Item、来源、资料、处理状态、公开来源与账号连接器运行时，以及加密本地存储。
- `apps/desktop/`：可选 macOS App 壳，复用同一套带 TUI 的 Web 工作台。
- `tests/v1.test.ts`、`tests/mcp.test.ts`、`tests/feed.test.ts`、`tests/web.test.ts`：状态门禁、权限、迁移和 UI 数据流证据。

## Product Principles

1. 先让人看懂，再让机器执行。
2. 结果和验收优先于活动记录。
3. 一个真相源，多个清晰视图。
4. 只展开眼前需要的 Goal，远端按条件再拆。
5. 所有阻塞和完成判断都要能解释原因。

## Accessibility & Inclusion

Web UI 必须支持键盘操作、清晰焦点、语义化结构、可读对比度、响应式布局和减少动态效果偏好。颜色不能成为区分 Ready、Blocked、Risk 和 Review 状态的唯一方式。
