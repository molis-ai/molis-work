# 0.1.x Bug 卡：41–50

状态：历史记录，截至 2026-08-31。卡片中的状态、流程、路径与验收属于当时版本，不是当前待办或操作指令。

[台账入口](../../molis-work-bug-cards.md) · [历史总览](overview.md) · [历史复审](review-2026-08-30.md)

## 本册目录

- [GB-20260830-41：V2 KOL 子 Goal 被 completion-only Risk 挡出 executor Available](#gb-20260830-41v2-kol-子-goal-被-completion-only-risk-挡出-executor-available)
- [GB-20260830-42：Core/App 升级后受管 LaunchAgent 仍携旧 release PATH，健康服务被标记 needs_repair](#gb-20260830-42coreapp-升级后受管-launchagent-仍携旧-release-path健康服务被标记-needs_repair)
- [GB-20260830-43：窄栏 Goal Tree 标题全部省略且分栏无法继续拉宽](#gb-20260830-43窄栏-goal-tree-标题全部省略且分栏无法继续拉宽)
- [GB-20260830-44：同仓库隔离 Git worktree 的真实文件无法成为 verified Evidence](#gb-20260830-44同仓库隔离-git-worktree-的真实文件无法成为-verified-evidence)
- [GB-20260830-45：Native Proposal 无法 supersede 可统一读取/决定的 Legacy Contract Proposal](#gb-20260830-45native-proposal-无法-supersede-可统一读取决定的-legacy-contract-proposal)
- [GB-20260831-46：Native Proposal 无法把 Legacy Contract Proposal 作为 `supersedes_proposal_id`](#gb-20260831-46native-proposal-无法把-legacy-contract-proposal-作为-supersedes_proposal_id)
- [GB-20260831-47：对话中已明确人工确认，仍必须到 Inbox 重复表达](#gb-20260831-47对话中已明确人工确认仍必须到-inbox-重复表达)
- [GB-20260831-48：Goal Tree 变更后没有主动召回受影响子图复核](#gb-20260831-48goal-tree-变更后没有主动召回受影响子图复核)
- [GB-20260831-49：明确双轨战略目标在 Goal Tree 中被压平成一级列表](#gb-20260831-49明确双轨战略目标在-goal-tree-中被压平成一级列表)
- [GB-20260831-50：Skill 承诺跨仓 `file:///` 可登记，Runtime 仍按项目外文件拒绝](#gb-20260831-50skill-承诺跨仓-file-可登记runtime-仍按项目外文件拒绝)

## GB-20260830-41：V2 KOL 子 Goal 被 completion-only Risk 挡出 executor Available

**来源**：CGS KOL 消费者反馈（会话 `01a04df5-64d8-72e3-ae79-455907c85e86`），Board `project-bc1b9bac-c679-4ac5-ba00-bb51477d0008`
**Bug 确认**：不是新的 Molis Work Bug。当前源码与本机已安装的 0.1.9 都确定性允许 open/triggered 的 `completion` Risk 下首次 executor Available/select；消费者当前 Session 仍在使用安装前已启动的 MCP 进程，且同一消费者此前已报告 V2 子树存在 `depends_on` 前置未满足。当前矛盾应归入 GB16 的旧 Session 交付边界与真实 dependency gate，而不是再次归因给 completion Risk
**修复决定**：不新增状态机修复；保留现有 completion/claim 分层，要求新 Session 读取 0.1.9，并以 Contract `reasons[].code` 区分 `dependency.unsatisfied` 与 `risk.blocks_claim`。旧 Goal 仍出现的问题继续归 GB31，不在本卡重复实现
**修复状态**：最终结案为非新 Bug。0.1.10 安装 Core 对真实 CGS reason 复验：G2E 在同一 completion Risk 下仍为 executor `execution_pending`；G2D 是已结束执行后等待 `rework_request`；V2 即刻子 Goal 的 blocker 为 `dependency.unsatisfied`（schema 未完成），不是 completion Risk。旧 Goal 暴露另由 GB31 修复；未修改 CGS 数据

**2026-08-30 追加复现**：同一 CGS 消费会话补充：V2 的 9 个 child Goals 均为 `execution_blocked / next_action=execute`、无 active Claim/Run，并同时列出 `triggered/open + blocking_mode=completion` Risks；旧 Goal 仍进入 Available。前半部分与本卡已有现场相同，仍未提供 `reasons[].code`，所以不足以推翻“Risk 只是相关事实、真正 blocker 可能是 `depends_on` 或旧 Session”的既有判定；后半部分明确去重到 GB31。台账已在分析开始时同步，不新增编号，也不修改 CGS 数据。

### 1. 真实场景

canonical `cgs-g2g-ai-kol-quality-roster-v2` 的 9 个 child Goals（包括 `cgs-g2g-jike-roster`、`cgs-g2g-roster-integration`）均为 `execution_blocked`、`next_action=execute`，且没有 active Claim/Run。关联 Risk `cgs-g2-source-coverage-risk` 为 `triggered / blocking_mode=completion`，`cgs-g2g-scale-consistency-risk` 为 `open / blocking_mode=completion`。这些子 Goal 不进入 Available，Runtime 因此无法合法 select、登记 Run 或回填已存在的七平台研究 Evidence。

### 2. 事实与归因

消费者提供了具体 Board、Goal、Contract work state、Risk mode/state 和 Available 结果，证明该 Session 中确有阻塞，但没有提供 `reasons[].code`，不能由“Contract 同时列出 Risk”推导出“Risk 正在阻塞 execution”。源码 `evaluate(executor)` 只把 `blocking_mode=claim` 或 triggered `invalidate_on_trigger` 加入 `risk.blocks_claim`；`completion` Risk 只在完成阶段进入 `risk.blocks_completion`。现有 GB27/Web 回归分别证明执行结束后的 completion gate 和执行前 Risk 可见但不替换执行动作；本机已安装 0.1.9 的真实 dist 又以 open+triggered 两条 completion Risk 实操得到 `execution_pending`、Available executor 和 select allowed。当前源码与已安装 artifact 均无法复现原归因。

### 3. 现有流程的问题

当前 Session 的体验摩擦真实存在：它只展示 `execution_blocked` 和相邻 Risk，消费者自然会把两者当因果关系；旧 Session 又不会热加载安装后的 MCP，所以即使磁盘上已有修复，当前任务仍可能继续表现为旧行为。另一方面，平台子 Goal 依赖 schema、integration 依赖平台子 Goal，前置未满足本来就应阻止领取。缺少精确 reason code 时，消费者无法区分“旧 Runtime”“真实依赖门禁”和“Risk 错误阻塞”。

### 4. 设计根因与初衷

completion Risk 的初衷是允许团队继续实现和补证据，同时阻止对风险未收束的工作宣告完成；execution/dependency Risk 才应挡领取。当前实现遵守该边界。实际根因是两个既有设计边界叠加：Codex MCP 进程以 Session 为生命周期，安装新 release 不会热替换既有 Session；Goal 的 Risk 列表是相关事实，不代表每条 Risk 都是当前 work-state reason。V2 子树另有真实 `depends_on` 链，必须以 reason code 判断。

### 5. 当前影响

当前旧 Session 仍可能让 V2 子树无法形成 Run/Evidence，实际阻断 CGS canonical 闭环；但这不是当前源码仍会错误消费 completion Risk 的证据。若新 Session 返回 `dependency.unsatisfied`，阻塞是预期的 Contract 顺序；若新 Session 对无其他 blocker 的 child 返回 `risk.blocks_claim` 且 Risk mode 为 completion，才构成新的回归。CGS 不应写旧 Goal或绕过依赖。

### 6. 复杂度审查

- **当前必须**：验证当前源码与已安装 artifact；明确旧 Session 不能热加载；让消费者在新 Session 读取精确 reason code 后再判断真实依赖。
- **可以延后**：在 Contract UI 中更强地区分“相关 Risk”和“当前 blocker”；若新 Session 仍有人持续误读再作为独立可理解性 Case 提报。
- **应当删除**：不新增绕过 Available 的写入口，不把旧 Goal 当临时容器，不为已有 GB27 重复实现第二套 rework/readiness 状态机。

### 7. 修复必要性与优先级

不修新代码；归并 GB16/GB27/GB31 的发布与新 Session 验收。当前源码和已安装 0.1.9 都未复现，继续改 readiness 反而可能错误放宽真实 dependency gate。

### 8. 修复前后体验差异

- **消费者当前 Session**：只能看到旧运行态/真实依赖的混合结果，把相关 Risk 误认为 execution blocker。
- **当前 0.1.9 行为**：无其他 blocker 时，open 与 triggered completion Risk 都保持 Risk 可见，但 Goal 是 `execution_pending`、进入 Available 且可 select；有未满足前置时仍返回 `dependency.unsatisfied`，不会假装可执行；最终 complete 才消费 completion Risk。

### 9. 最小修复范围

无新增实现。继续复用 GB27 的风险阶段判断、GB37 的 blocked overview、GB16 的新 Session 交付边界和 GB31 的 replaced Goal 过滤。当前只更新台账和验收结论，不改变 Risk、Goal、Relation、Evidence 或安装内容。

### 10. 验收边界

- **工程验证**：通过。当前源码定向回归 `a completion Risk after finished work stays out...` 与 `an open completion Risk stays visible...` 2/2；整合态 typecheck 与全量测试 331/331。源码审查确认 executor evaluate 不消费 completion mode。
- **产品实操**：通过最终归因复验。0.1.10 安装 Core 对真实 CGS 只读查询：G2E 在 completion Risk 下仍是 `execution_pending/execute`；G2D 的 completion gate 明确返回 `rework_request`；V2 即刻子 Goal 的精确 blocker 是 `dependency.unsatisfied`，不是 Risk；旧 Goal 返回 `replaced`。未写入 CGS。
- **Owner 最终验收**：通过“不新增 Bug/不新增修复”的去重结论；保留 completion/dependency 安全边界。
- **用户验收**：技术归因已由真实安装 Core 确认；消费者在后续新 Session 是否能直观区分“相关 Risk”和“当前 blocker”仍可继续观察，但不再作为未修 Bug。

---

## GB-20260830-42：Core/App 升级后受管 LaunchAgent 仍携旧 release PATH，健康服务被标记 needs_repair

**来源**：Molis Work Owner 在 GB35 安装态复验中发现；本机 `/Applications/Molis Work.app`、home launcher 和实际 Web 进程均已指向 0.1.9
**Bug 确认**：已确认，属于 Desktop 升级后的服务交接缺陷；`needs_repair` 本身不是误报
**修复决定**：修。只把 App 完成 Core 升级后的受管服务动作从被协议拒绝的 `service restart` 改为能原子同步 owned plist 的 `service install`；不放宽配置一致性检查
**修复状态**：最终交付已闭环。0.1.10 App/Core/launcher 与 LaunchAgent PATH 已对齐，service `running/owned=true`；LaunchAgent、监听者和 `/health.service_process_id` 均为 PID 72472。最终同版本内容刷新后按官方 restart 事务加载新 Core，没有静默接管未知进程

### 1. 真实场景

本机已安装 Molis Work 0.1.9：App Info.plist 为 0.1.9，`~/.molis-work/bin/molis-work-web` 明确执行 `releases/molis-work-0.1.9` 的 bundled Node 与 Web server，HTTP `/health` 返回 `status=ok` 且 process/service PID 一致。与此同时 `molis-work service status --json` 返回 `state=needs_repair`、message“Molis Work Web 常驻服务使用旧配置”；LaunchAgent plist 的 `EnvironmentVariables.PATH` 仍以 `releases/molis-work-0.1.8/runtime` 开头。

### 2. 事实与归因

可稳定复现，属于 Molis Work 缺陷。Desktop 的 `ensure_molis_work_web` 在发现内嵌 Runtime 版本高于已安装版本后会先安装新 Core，随后调用 `restart_managed_web_service`；该函数固定执行 `molis-work service restart --confirm` 并吞掉失败。与此同时 service 状态机明确规定 `needs_repair` 时 restart 必须拒绝，唯一恢复动作是 `service install --confirm`。因此 status 正确识别了 release-specific bundled Node `PATH` 已过期，错误在 Desktop 选错恢复动作并静默忽略结果，不是状态比较过严。

### 3. 现有流程的问题

用户看到 App 与网页正常，但官方 status 仍要求 repair，无法判断当前 0.1.9 是否真正安装完成、是否必须再做一次服务变更，或这只是无害元数据。若每次 Core 升级都留下旧 PATH，发布验收会稳定多出 preview/confirm/restart；若忽略它，后续子进程可能从旧 release 解析命令。

### 4. 设计根因与初衷

稳定 `~/.molis-work/bin/molis-work-web` wrapper 的初衷是让 LaunchAgent ProgramArguments 不随版本变化；plist PATH 固定 bundled runtime 则用于在系统 PATH 缺 Node 时仍可运行并隔离宿主环境。service 将旧 plist 判为 `needs_repair`，并要求 `install` 而不是 `restart`，是为了只重写 Molis Work 拥有的配置、验证端口与实例身份、失败时恢复旧文件和运行态。Desktop 原本也试图在 App 已获启动/升级授权后自动刷新受管服务，但沿用了旧的 restart 动作，没有接上这条新安全协议。

### 5. 当前影响

当前 App/Web 主路径未阻断，健康检查通过；直接影响是安装完成状态不可信、打开/诊断路径持续显示 repair，可能诱发重复修复。潜在运行影响取决于旧 PATH 是否进入 PTY/子进程，目前没有失败证据，不能扩大为“0.1.9 实际运行旧 Core”。

### 6. 复杂度审查

- **当前必须**：稳定复现 status；追踪 desired plist 与 actual plist 的逐字段比较；核对 upgrade/install/service 生命周期测试；验证进程实际 release 与 PATH 消费点。
- **可以延后**：把所有服务配置改成完全版本无关；只有证明 release-specific PATH 不再提供安全价值时再评估。
- **应当删除**：不直接忽略全部 plist 差异，不无条件自动 bootout/restart，不把健康 200 当作配置一致或把 needs_repair 当作服务不可用。

### 7. 修复必要性与优先级

修，P1。Desktop 当前已经在升级后主动尝试重载服务，所以这不是要不要新增自动变更权限的问题，而是现有获权动作选错命令且吞错。若不修，每次带新 bundled Runtime 的 App 升级都会稳定留下旧 plist；若直接把 status 改成 running，又会掩盖旧 Node PATH。最小修复是复用现有 `service install --confirm` 的 ownership、冲突与回滚语义。

### 8. 修复前后体验差异

- **当前**：安装/App/health 都显示 0.1.9 可用，但 status 仍报旧配置，用户需要猜是否重新 repair。
- **修后**：App 完成新 Core 安装后，用 `service install --confirm` 同步 Molis Work 自己拥有的 plist 并重载；成功后 status 为 running、PATH 指向新 release。未知或被改写的 LaunchAgent 仍拒绝接管，失败不伪报成功。

### 9. 最小修复范围

只修改 Desktop Core 升级后的服务同步 helper 与回归测试，把 `restart` 替换为 `install`。不修改 service desired-state、status 分类、稳定 wrapper、ownership/PID 校验、未知监听者拒绝、回滚、项目数据和安装包版本；真实服务仍不在本轮自动修复。

### 10. 验收边界

- **工程验证**：通过。TDD 红灯实际记录 Desktop helper 调用 `service restart --home … --confirm`，与期望的 `install` 不同；最小修改后定向用例转绿。Desktop Rust 单测 12/12、TypeScript typecheck、Web service 状态机回归 23/23、`cargo fmt --check` 与 `git diff --check` 均通过。`cargo clippy --all-targets -D warnings` 仍被本文件既有的两条无关 warning 阻断（`needless_borrows_for_generic_args`、`collapsible_if`），本卡未改这些位置，不能把 clippy 报成绿。
- **产品实操**：通过。最终 0.1.10 安装后，LaunchAgent PATH 指向 `releases/molis-work-0.1.10/runtime`，official status=`running/owned=true`，LaunchAgent、监听与 health PID 同为 72472。同版本内容刷新后按官方 restart 事务换到最终 Core，未接管未知进程。
- **Owner 最终验收**：通过。最终 App/Core/service 已收敛，ownership、外部监听拒绝、原子写入与回滚边界由 338/338 与 Desktop 12/12 保留。
- **用户验收**：安装结果已在本机真实服务确认；用户可继续正常使用既有六个项目，本轮没有迁移或删除项目数据。

---

## GB-20260830-43：窄栏 Goal Tree 标题全部省略且分栏无法继续拉宽

**来源**：Molis Work Owner 在真实 Content Growth Studio Goal Tree 的视觉反馈，截图 `截屏2026-08-30 21.01.35.png`
**Bug 确认**：已确认。真实安装 App 和 4173 Web 均可复现；根因是共用 CSS 把 Runtime 已接受的 520px 分栏值再次 clamp 到 300/334px，同时固定行高和 `white-space: nowrap` 强制长标题单行省略。这不是“CGS 标题写得太长”或单端外壳问题
**修复决定**：P1，已获本 Session 自主修复授权。保持层级、短引用和状态徽标，最小修复标题完整可读；不把本卡扩成无限画布或整套 Goal Tree 重构
**修复状态**：最终交付已闭环。修复已进入 0.1.10；最终安装 App 的真实 CGS Goal Tree 中，分栏从 300 拖到 520，长中文标题完整换行，G2/G2A/G2B/C/G2G/V2 与状态同时可读，Web/Desktop 共用实现一致；未 push

### 1. 真实场景

用户在真实 CGS Goal Tree 列表中查看 G2、G2G/V2 及九个平台子 Goal。当前左侧树栏较窄，父子层级缩进与右侧状态徽标共同挤占标题空间，大量中文标题只剩“让 CGS 从真实研究中发现可下…”、“建立七个平台各 50+ 的高…”等片段。用户尝试拖动分栏也无法获得更多空间，因此不能在当前树中直接读懂每条 Goal。

### 2. 事实与归因

截图可直接复现用户感知结果：同一屏多数标题被省略，短引用和状态仍可见，但业务标题不可完整阅读。Owner 随后通过 computer use 在真实 0.1.9 安装 App 和 4173 Web 的同一 CGS / `cgs-g2g-jike-roster` 上分别复现；在安装态把分隔条值拖到约 519 时，实际目录仍只有约 300px。源码中 `setTreeWidth` 合法范围为 260–520px，ARIA 也回报拖动值，但最终视觉 CSS 又使用 `clamp(274px, var(--tree-width), 300px)` / `clamp(..., 334px)`；标题行同时固定为 `22px`、`nowrap` 和 ellipsis。归因确定为共用 Web 样式与 splitter 状态相互矛盾的 Molis Work 缺陷，不归咎于 CGS 标题过长。

### 3. 现有流程的问题

用户要先点击每个 Goal 或依赖 Agent 的 G2A/G2B 口头编号，才能知道被省略的完整含义；树作为总览和选择入口失去基本辨识能力。短引用、状态徽标和层级虽然存在，却不能替代业务标题。分栏无法扩宽又让用户没有自助恢复手段。

### 4. 设计根因与初衷

单行省略、固定行高和默认受限侧栏用于保持长树扫描密度、让状态徽标稳定对齐，并避免目录默认挤占右侧详情空间；层级缩进用于表达父子关系。这些初衷合理。缺陷是 CSS 把“默认宽度”误写成对用户拖动结果的硬上限，且窄栏没有完整标题的降级路径，导致 JS 明示 520px 可调、视觉却拒绝执行。

### 5. 当前影响

直接影响树中长中文标题较多、层级较深或状态徽标较宽的项目；CGS 当前真实树已大面积出现。它不破坏数据，但会导致选错 Goal、误读父子关系、频繁打开详情确认，并削弱 GB05 已建立的“短引用与中文标题可对应”体验。频率是每次浏览该树都会发生，属于高频非阻断但明显的主入口摩擦。

### 6. 复杂度审查

- **当前必须**：窄栏下标题完整可读；多行后状态徽标不覆盖文字；父子缩进和短引用仍清楚；需要更多空间时分栏能提供可预期的恢复方式；Web 与 Desktop 共用实现一致。
- **可以延后**：用户自定义每级缩进、持久化任意 pane 比例、树密度偏好、缩放、无限画布与虚拟化重构。
- **应当删除**：不要求用户逐项打开详情、猜省略号或只靠 hover；不以隐藏短引用/状态来换标题空间；不为 Web/Desktop 复制两套样式。

### 7. 修复必要性与优先级

修，P1。Goal Tree 是选择和理解工作的主入口；文字不可读会放大误选、重复点击和上下文对齐成本。最小修复应复用现有 DOM/CSS，通过多行换行、合理 flex/grid 最小宽度和 splitter 上限修正完成，不增加新数据模型。

### 8. 修复前后体验差异

- **修复前**：打开 CGS Goal Tree → 大量标题只见前半句 → 拖动分栏无效 → 必须逐条点开或询问 Agent 才知道完整 Goal。
- **修复后**：打开同一棵树 → 标题在可用宽度内完整换行，短引用与状态仍对齐；需要更宽时分栏可继续调整，窄窗口也能纵向阅读而不互相覆盖。

### 9. 最小修复范围

只改共用 Web 视觉基础和 Web 回归：让 `--tree-width` 作为用户已选宽度直接生效，保留 286–334 / 274–300 的响应式默认值；目录行改为自适应高度，标题允许自然换行并按任意长词断行。未改 splitter 的 260–520 安全范围、数据、Goal ID、树关系、状态机、图视图和发布版本，也没有为 Web/Desktop 复制第二套样式。新增真实浏览器布局回归，直接测量 519px pane 与长中文标题的行数、横向/纵向 clipping。

### 10. 验收边界

- **工程验证**：通过。RED 回归在旧 CSS 上实得 pane 300px（期望 519px）且标题 `nowrap`；修复后目标浏览器布局 2/2、TypeScript typecheck、Web 全量 53/53 通过。长深层中文标题实得多行，`scrollWidth <= clientWidth` 且 `scrollHeight <= clientHeight`。整合门禁首次运行发现 Desktop TUI 仍把旧 334px 硬上限写成源码断言；已删除该重复旧契约，真实浏览器宽度/换行门禁保留，相关 91/91 与当前工作树完整 333/333 通过。
- **产品实操**：通过。最终 0.1.10 安装 App 使用真实 CGS：AX 与实际分栏从 300 拖到 520；G2、G2E、G2C、G2B/C、G2H、G2D、G2F、G2G/V2 等长标题自然换行，短编号和状态徽标同时可读；旧 Goal 仍以历史状态显示，没有文字覆盖。
- **Owner 最终验收**：通过。最终安装物已满足“所有文字可展示且分栏能自助恢复”的核心体验；用户本人对阅读密度和主观视觉质感仍为 `UNVERIFIED`。

---

## GB-20260830-44：同仓库隔离 Git worktree 的真实文件无法成为 verified Evidence

**来源**：Molis Work 内部 Casebook / `molis-work-authorized-planning-export` 消费者反馈
**Bug 确认**：已确认，属于 Evidence workspace 与 Git worktree 身份连续性缺口，不是消费者误用，也不是任意跨仓读取诉求。只允许 canonical 路径内文件的安全初衷成立；缺陷是把同一仓库身份等同成单一目录，无法消费 Git 自身正式登记的隔离 worktree
**修复决定**：已批准并完成最小源码实现。按 Owner 既有授权直接修复，不等待逐卡审批；不扩成任意多 workspace 或跨仓验证
**修复状态**：最终交付已闭环。源码回归已纳入完整 338/338；0.1.10 安装 Core 另用真实临时 Git repository + registered worktree 实操，未提交文件规范化为 `project://`、状态 verified、记录实际 worktree root 且可读取；外部仓库仍不被提升为 verified。未修改来源 Casebook 数据，未 push

### 1. 真实场景

Molis Work 当前 Session 绑定项目“Molis Work 内部 Casebook”，canonical workspace 为 `~/adeptify-home/repos/molis-work`。为保护该目录已有脏工作树，执行者把同一 Git 仓库的实现放在隔离 worktree `/private/tmp/molis-work-casebook-authorized-export`，并尝试把其中真实测试文件 `tests/casebook-planning-export.test.ts` 登记为 Evidence。绝对 locator 被准确拒绝为“当前项目范围外”；执行者只能改用 `artifact://`，记录被降级为 UNVERIFIED。

### 2. 事实与归因

已独立核对：canonical checkout 与 `/private/tmp/molis-work-casebook-authorized-export` 的 `git-common-dir` 完全相同，后者同时出现在 canonical 仓库自己的 `git worktree list --porcelain` 中；目标测试文件真实存在且未提交。当前 locator 实现只做 canonical root 与目标文件的 `realpath` containment，因此必然拒绝。Evidence 表已经能记录提交时实际验证根，Web 也会按该根打开历史项目引用；缺的是安全解析“同仓登记 worktree”的一步，不需要新增数据库或第二套 Evidence 类型。

### 3. 现有流程的问题

标准的隔离 worktree 正是为避免污染用户脏工作树，但真实未提交文件无法进入 verified Evidence 链。消费者要么放弃隔离、要么先 commit/push、要么用不透明 locator 降级；三种路径都会削弱“在安全工作区完成修改，同时保留本地可验证证据”的正常闭环。

### 4. 设计根因与初衷

现有设计把当前 Runtime canonical workspace 作为唯一可读取根，初衷是防止 Agent 借 Evidence locator 任意读取本机文件、跨项目泄露内容或通过路径逃逸伪造 verified。这个边界必须保留。候选缺口是 workspace 身份被等同于单一路径，而 Git worktree 把“同一仓库身份”合法映射到多个受 Git 管理的工作根；系统尚未明确如何证明并记录这种连续性。

### 5. 当前影响

影响使用 Git worktree 隔离实现、且 Evidence 尚未进入远端 commit 的本地开发任务。它不会破坏产物，但会系统性把真实测试、审查文档和日志降级为 UNVERIFIED，迫使执行者在安全隔离与证据质量之间二选一。频率取决于 worktree 工作流；在 Molis Work 自身的脏主工作树维护中已经真实发生。

### 6. 复杂度审查

- **当前必须**：只在可证明同一 Git repository identity 的 worktree 内验证文件；继续要求目标位于该 worktree root 内；记录实际验证根与有限边界；worktree 不存在或证明失败时安全拒绝或降级。
- **可以延后**：任意多仓 Goal、用户维护 workspace allowlist、远端 commit 内容寻址、跨主机 Evidence、自动保留临时 worktree。
- **应当删除**：按目录名、分支名或 `.git` 文本字符串猜同仓；把所有项目 catalog 历史 workspace 自动纳入可读根；因提供 digest 就跳过路径与内容边界。

### 7. 修复必要性与优先级

需要修，P1。Git 已提供 canonical 仓库主动维护的 worktree allowlist，现有 Evidence 又能记录实际验证根，因此可以在不扩大跨仓权限的前提下恢复标准开发闭环。若不修，Molis Work owner 自己为保护脏主目录而采用的标准隔离工作流会持续把真实本地证据降级；这已影响验收审计，不只是文案摩擦。

### 8. 修复前后体验差异

- **修复前**：在同仓隔离 worktree 完成真实测试 → 绝对 locator 被判项目外 → 改用 opaque locator → Evidence 永久 UNVERIFIED。
- **目标体验候选**：提交隔离 worktree 文件 → Molis Work 证明它与 canonical workspace 共用 Git repository identity 且文件未逃出该 worktree → 记录 verified locator、实际验证根和摘要；无法证明时明确说明为什么只能 UNVERIFIED，以及可用的安全替代方式。

### 9. 最小修复范围

修改 locator 的绝对路径归一化：先保留 canonical root containment；范围外时，只调用 canonical 仓库的 `git worktree list --porcelain -z`，在其正式登记且仍存在的 worktree 根内重新做 realpath containment。verified Evidence 存储实际 worktree root，locator 仍稳定规范化为 `project://relative/path`；派生 worktree 不冒充当前 catalog workspace，所以 `locator_workspace_id=null`。同步 MCP/Skill 说明和回归测试。不新增全局文件权限、不自动关联任意仓库、不修改 Casebook 数据、不要求 commit/push，也不让 Web 打开任意 `file:` URL。

### 10. 验收边界

- **工程验证**：通过。真实 Git repository + registered worktree + 未提交文件回归通过；同仓文件规范化为 `project://` 且存储实际 worktree root，`locator_workspace_id` 不冒充 canonical workspace。不同仓库、伪造 `.git`、symlink 逃逸均保持 `evidence.locator_outside_project`；worktree 删除后历史 Evidence 保持提交时的 `verified` 审计事实，但读取明确返回根目录不可用。V1 全量 110/110、相关 Web 2/2、TypeScript typecheck、`git diff --check` 与当前工作树完整 335/335 通过。第一次全量失败来自本机 root-owned npm cache 与沙箱内 Headless Chrome，分别用隔离临时 cache 和允许真实 Chrome 后从头复验为绿，没有把环境失败隐藏成通过。
- **产品实操**：通过。除来源真实 worktree 的源码旅程外，最终 0.1.10 安装 Core 另创建真实临时 Git repository + registered worktree，提交未 commit 文件后得到 `project://tests/installed-evidence.txt`、verified、`locator_workspace_id=null`、实际 worktree root，并通过引用读取器打开原文。
- **Owner 最终验收**：通过。最终安装行为没有把同仓 worktree 扩成跨仓信任，没有把 canonical workspace_id 冒充成派生根，也不把提交时 verified 冒充为文件永久存在；不同仓库、伪造 worktree 与 symlink 逃逸由完整回归继续拒绝。

---

## GB-20260830-45：Native Proposal 无法 supersede 可统一读取/决定的 Legacy Contract Proposal

**来源**：Arena 项目 / `goal-arena-v1-product-loop` 的真实 Runtime 消费反馈
**Bug 确认**：已确认。read/check/decide 已支持 raw 与 synthetic legacy Contract Proposal handle，而 `goal_tree_propose.supersedes_proposal_id` 对同一对象返回“找不到 Goal Tree 提案”；现有 legacy 决策错误还明确要求 Runtime “创建 native Goal Tree Proposal 并引用这个历史提案”，因此属于 API 可组合性与恢复契约缺陷，不是 Arena 字段误用
**修复决定**：按本 Session 授权，成立即最小修复并验收，不等待逐卡审批
**修复状态**：最终交付已闭环。raw/synthetic legacy Contract Proposal 均可被 native Proposal 原子 supersede；旧提案保留审计并标为 `superseded`，新提案保留单一 pending 决策链。定向 5/5、完整 338/338 与 Desktop 12/12 通过；0.1.10 安装 Core 两条隔离旅程均通过，重开数据库后关联仍在且 canonical Draft 未提前改写。未修改 Arena Proposal 或 canonical Goal Tree

### 1. 真实场景

Arena 已有 pending legacy Contract Proposal `contract-proposal-dd02b3c4-8860-4357-a253-502cbcf6c537`。统一 `goal_tree_read` / `goal_tree_check` 同时接受 raw ID 和 `legacy-contract-proposal:*` synthetic ID，且检查无冲突。Runtime 要创建新的完整 native Goal Tree 修订来替代旧提案时，无论把 raw 还是 synthetic handle 传入 `supersedes_proposal_id` 都得到“找不到 Goal Tree 提案”；删掉该字段后新 native Proposal 才能创建并通过 check。

### 2. 事实与归因

已通过源码与隔离回归复现。`submitGoalTreeProposal` 原先固定调用 `readNativeGoalTreeProposal`，因此 raw Contract Proposal ID 和 synthetic compatibility handle 都必然报不存在；统一读/查/决定链则已能解析同一对象。更直接的矛盾是 legacy decide 错误正式建议调用者创建 native Proposal 并“引用这个历史提案”，但写侧并未实现该引用。跨 legacy Contract → native Proposal 的 supersession 不需要重写旧 item，只需要保留旧对象、记录替代者并原子关闭旧 pending，因此现有模型可以安全承载。

### 3. 现有流程的问题

用户必须先单独退回旧 legacy Proposal，再确认新 native Proposal，或保留两个并行待决定项；一份修订无法形成单一审计链。错误又把“不支持该类型”伪装成“不存在”，消费者会反复尝试 raw/synthetic ID。

### 4. 设计根因与初衷

native Proposal 的 supersession 初衷是让一个新 change set 明确替代旧 change set，避免双 pending 和重复确认；legacy compatibility view 的初衷是读取旧 Contract/Candidate/Rewire 而不重写历史。当前需要确认写侧是否只按 native proposal 表查找，从而漏掉 compatibility handle，以及跨类型 supersession 应怎样在不删除旧审计事实的前提下物化。

### 5. 当前影响

已阻断 Arena 把旧单 Goal Contract Proposal 收束进新的完整 Goal Tree 修订链；canonical Goal 尚未被错误修改，但会增加一次人工决定和两个待审入口。凡从 legacy Contract Proposal 迁移到 native tree 的项目都可能遇到，频率低于普通 proposal，但直接影响审批一致性。

### 6. 复杂度审查

- **当前必须**：统一解析 raw/synthetic legacy Contract handle；在创建新 pending Proposal 的同一事务中把旧提案标为 superseded，并记录双向可读的替代关系；对当前不能安全等价替代的 legacy Candidate/Rewire 返回类型化边界和唯一恢复动作。
- **可以延后**：自动把任意 legacy change set 转写成 native items、跨多个旧 Proposal 批量合并、UI 可视化迁移向导。
- **应当删除**：不隐式退回旧提案，不删除历史，不要求用户靠技术 ID 试错，不因兼容困难而接受两个同时有效的待定真相。

### 7. 修复必要性与优先级

需要修，P1。它不破坏 canonical Goal，但会制造两个并行待决定入口，并迫使用户做两次本可合并的决定；而且失败来自系统给出的正式恢复路径不可执行。修复只增加 legacy Contract 引用和状态关联，不扩大确认权限，也不自动决定新 Proposal。

### 8. 修复前后体验差异

- **当前**：旧 Proposal 可读可查，但修订时被称为“找不到” → 分别退回旧项、再确认新项。
- **目标**：新 native Proposal 明确引用并替代旧 legacy Proposal，一条 pending 决策链完成审查；或在确实不支持时一次返回精确原因和唯一受支持步骤。

### 9. 最小修复范围

已把 `supersedes_proposal_id` 接入统一 raw/synthetic handle 解析；为 native Proposal 增加单独的 legacy supersession 引用，数据库 migration 28 对新旧库补齐字段与索引；创建成功时在同一事务把 legacy Contract Proposal 标为 `superseded`，并回写 `superseded_by_goal_tree_proposal_id`。Candidate/Rewire 不假装兼容，返回 `goal_tree_proposal.legacy_supersession_unsupported`、来源类型、允许类型和 next action。MCP 描述同步说明支持边界。不修改 Arena 数据，不自动决定新 Proposal，不放宽用户确认，不重写旧 item 内容。

### 10. 验收边界

- **工程验证**：通过。先用红灯证明 raw/synthetic 都在 native-only lookup 报“找不到”；修复后统一 read/check/decide、raw/synthetic → native supersession、migration 28 和 Rewire 等价恢复共 5/5 通过。随后从头运行完整 `pnpm test` 338/338、Desktop Rust 12/12、Rust format、版本一致性与 `git diff --check`，全部通过。
- **产品实操**：通过。使用最终 0.1.10 安装 Runtime 在两个隔离 Board 分别传 raw 与 synthetic legacy Contract handle；两次均读回旧 `superseded`、`superseded_by_goal_tree_proposal_id`、新 `pending/version=2` 与 canonical synthetic supersedes handle，重开数据库仍一致；canonical Goal 保持 Draft。不操作 Arena 真实 Proposal。
- **Owner 最终验收**：通过。Case 成立，修复只连接已经承诺的 legacy Contract → native revision 路径，保留确认与 canonical 零提前写入边界；Candidate/Rewire 不被错误泛化。
- **用户验收**：不替 Arena 用户决定任何 Proposal。

---

## GB-20260831-46：Native Proposal 无法把 Legacy Contract Proposal 作为 `supersedes_proposal_id`

**来源**：Arena 项目 / `goal-arena-v1-product-loop` 的真实 Runtime 消费反馈
**Bug 确认**：体验现象成立，但不是新 Bug。该复现与 GB45 的 API、错误和修复边界完全相同；当前源码与 0.1.10 安装 Core 已同时支持 raw/synthetic legacy Contract handle。主要归因是 Arena 原 Session 未重载已安装的新 MCP 实现
**修复决定**：与 GB45 去重，不写第二套修复；把本卡作为独立消费复现与发布验收证据
**修复状态**：最终交付层已闭环。当前源码定向 1/1，0.1.10 安装 Core 的 raw/synthetic 隔离旅程 2/2 通过；Arena 旧 Session 需要新建 Session 才能加载新实现

### 1. 真实场景

Arena 的旧 pending Contract Proposal `contract-proposal-dd02b3c4-8860-4357-a253-502cbcf6c537` 已能用 raw ID 和 `legacy-contract-proposal:*` synthetic handle 进行 `goal_tree_read` / `goal_tree_check`。Runtime 想创建一份完整 native Goal Tree 修订，并用 `supersedes_proposal_id` 把旧提案收束进同一条待决策链；传 synthetic 和 raw handle 都被返回“找不到 Goal Tree 提案”。删掉 supersedes 引用后，新 native Proposal 可创建并通过 check。

### 2. 事实与归因

用户侧复现事实完整，但当前分支的 GB45 定向回归已对 raw 和 synthetic handle 跑同一个真实 Coordinator 旅程，本次新鲜复验为 1/1 通过。再用已安装 0.1.10 内嵌 Node/Core 分别创建两个隔离 Board，raw 和 synthetic 均得到旧 Proposal `superseded`、新 Proposal `pending/version=2`、canonical Draft 不变，重开数据库后关联仍在。因此当前产品仍有代码缺口的假设被否定；本卡是 GB45 在旧 Session 中的重复消费证据。

### 3. 现有流程的问题

如果该能力确实未被当前版本消费，用户必须先退回旧 legacy Proposal，再确认新 native Proposal；无法用一次 revision 保留单一待定链。错误把“类型/版本未支持”呈现为“对象不存在”，会诱导 raw/synthetic ID 试错。

### 4. 设计根因与初衷

native supersession 用于关闭被修订的旧待定项，避免双 pending；legacy compatibility handle 则用于保留旧 Contract Proposal 的审计事实。安全边界是不自动确认新提案、不提前修改 canonical Goal，而不是让写入端拒绝读取端已承诺的同一 handle。

### 5. 当前影响

当前 Arena 无法把旧单 Goal Contract Proposal 收束到新的完整 Goal Tree 修订中，需要额外一次人工决定，并可能在待办中出现两份表达同一业务修订的 Proposal。canonical Goal 尚未被错写，但审批语义与审计链不连续。

### 6. 复杂度审查

- **当前必须**：已完成当前源码和安装 Core 的 raw/synthetic 复验，并明确 Arena 旧 Session 需新 Session 重载 MCP。
- **可以延后**：任意 legacy 提案的自动转写、批量合并和 UI 迁移向导。
- **应当删除**：不重复实现 GB45，不因同一用户反馈虚增第二套状态，不删除或隐式决定旧 Proposal。

### 7. 修复必要性与优先级

原始 GB45 是 P1 且修复必要；GB46 不重复修码。当前必要动作只是让 Arena 用新 Session 加载已安装 0.1.10，再对真实提案继续决定流程；不因 Session 热加载边界再增一个 Core 状态。

### 8. 修复前后体验差异

- **修复前**：两种合法 handle 都报“找不到” → 用户分别处理旧提案与新提案。
- **修复后**：一份 native revision 直接引用并 supersede 旧 Contract Proposal，旧审计保留、新提案仍等待同一次明确确认。

### 9. 最小修复范围

不新增代码。复用 GB45 已有的统一 handle 解析、legacy Contract Proposal 状态关联、MCP 说明与回归；本次仅更新台账定性并给 Arena 明确新 Session 恢复动作。不操作 Arena 真实 Proposal，不自动决定，不修改 canonical Goal。

### 10. 验收边界

- **工程验证**：通过。当前源码定向测试 `a native Goal Tree proposal supersedes a pending legacy Contract Proposal by raw or mapped handle` 为 1/1。GB45 的完整 338/338 回归继续是该实现的集成门禁。
- **产品实操**：通过。用 0.1.10 安装包自带 Node 调用安装 Core，raw/synthetic 两个隔离 Board 都读回旧 `superseded`、新 `pending/version=2`、正确 synthetic 来源和 canonical Draft 不变，2/2 通过。用系统 Node 25 首次运行发生 Node ABI 不匹配，改用产品内嵌 Node 24 后按正式运行路径通过，未隐藏该环境误用。
- **Owner 最终验收**：通过。新反馈对“旧 Session 中的产品摩擦”成立，但不支持“当前 Core 仍有新缺口”；去重而不叠加修复是更小、可验证的正确决定。不把 Arena 用户的 Proposal 决定代为验收。

---

## GB-20260831-47：对话中已明确人工确认，仍必须到 Inbox 重复表达

**来源**：CGS / Goal `G3A` 的真实 waiting-for-human 验收旅程
**Bug 确认**：已确认，但修正了原候选方案。真实缺陷不是“缺一个让 Runtime 直接写 Human Review 的 API”，而是 Molis Work Core/Skill 没有把唯一明确对话确认接到 GB24 已有的安全预填入口
**修复决定**：已按本 Session 授权完成最小修复；保留最终用户提交，不新增 Runtime 人类审批权、不做通用自然语言审批器
**修复状态**：源码已实现，定向工程与源码产品旅程通过；已进入 0.1.11 发布候选，真实新 Codex Session 与用户主观验收待后续

### 1. 真实场景

Goal 已进入 `waiting_for_human`，只剩一个 `human_approver` obligation。Runtime 在当前已认证 Session 中解释了验收对象、标准与后果，用户针对唯一项明确回复“确认 G3A”。canonical Goal 仍要求用户转到 Inbox，再选“通过”、勾 Evidence、填理由并提交。用户连续追问验收对象及为什么不能在当前对话授权，说明责任边界没有被界面/协议解释清楚。

### 2. 事实与归因

源码和真实 CGS 数据只读核对共同复现了问题。当前 MCP 调用上下文只有宿主提供的 Session ID，没有不可伪造的用户 actor、turn/message 签名，因此 Runtime 不能安全地把一句转述直接写成 canonical Human Review。GB24 已支持带会话来源的 `human_verdict` Evidence 预填 Inbox，但 Runtime Skill 只要求“报告 criteria 并停止”，没有告诉消费者登记明确原话并进入预填表单。真实 G3A 后续由用户在 Web 手工提交 Human Review；历史中没有对应对话 `human_verdict`，印证 GB24 入口并未被消费。归因是 Molis Work Core/Skill 交接缺口，不是用户误用，也不是宿主已具备而 Molis Work 漏接的强认证能力。

### 3. 现有流程的问题

用户已表达一次明确决定，却必须在另一界面重新选结论、选 Evidence 和改写理由。这不只多一次点击：系统没有解释哪一次才是法定决定，导致用户误以为对话中的明确确认被忽略，或 Molis Work 只承认特定 UI 而不承认人的真实意思。

### 4. 设计根因与初衷

现设计把 Runtime 的工具身份与 Web 中的人类操作分开，目的是防止 Agent 把“好的”、“继续”或自己的推理伪装成用户验收，并保留最终操作人、时间、Evidence 和版本的审计链。这条边界必须保留。设计遗漏在于 GB24 已有“对话原话 Evidence → 人工表单预填”的安全中间层，却没有成为 `waiting_for_human` 的结构化恢复动作和 Skill 协议。

### 5. 当前影响

影响所有已在 Codex 对话中完成明确验收、但 Goal 仍要求 human approval 的任务。每个决定至少多一次界面切换和表达，并且用户已真实出现“到底要验收什么”的理解失败。它不会误写数据，但直接阻断 Goal completion，并容易诱导消费者为了连续性而越过人类权限。

### 6. 复杂度审查

- **当前必须**：只在一个 pending human obligation 完整覆盖当前待验收 criteria 时返回结构化 handoff；Skill 仅登记精确原话和会话来源，随后打开预填 Inbox，由用户最终提交；多个待决项、模糊结论和状态变化失败关闭。
- **可以延后**：跨宿主通用签名标准、多人审批编排、复杂决策语义的自然语言解析。
- **应当删除**：不允许 Runtime 只凭 `actor_id=human`、一段转述或含糊回复直接写入 Human Review；不在多个待决项或 Evidence 已变时猜测用户意图。

### 7. 修复必要性与优先级

需要修，P0。用户已经出现“为什么同一个决定要表达两次”的真实理解失败，并会阻断 Goal completion；但当前宿主凭证不足以支持直接审批，因此修复对象是结构化说明与 GB24 交接，而不是扩大权限。

### 8. 修复前后体验差异

- **修复前**：用户在对话中明确说“确认 G3A” → Goal 仍 waiting_for_human → 转 Inbox 重新选择、勾选、填理由、提交。
- **修复后**：Molis Work 返回唯一 obligation、criteria 和 exact-quote handoff → 用户明确批准该命名事项时，Runtime 只登记带 `conversation://` 来源的原话 Evidence → Inbox 自动预填结论、原话、来源、Evidence 和理由 → 用户只做一次最终提交。若回复含糊、存在多个待决项、结论不是通过或状态已变化，则不登记并直接回 Inbox。

### 9. 最小修复范围

在 work-state reason 中增加 `conversation_approval_handoff`，只对唯一且完整覆盖待验收 criteria 的 human obligation 返回；MCP Evidence 说明明确 `human_verdict` 只是预填证据；Goal-advance Skill 按返回的 criteria、`conversation://` 来源和用户 exact quote 登记，并明确最终 Review 必须由用户提交。复用 GB24 现有深链/预填/审计；不新增数据库状态，不让 Runtime 选择最终 Evidence 或调用 user actor Review，不修改 CGS 数据。回滚只需移除结构化 handoff 和 Skill 说明。

### 10. 验收边界

- **工程验证**：源码定向 Core 1/1 通过：唯一 obligation 返回 criteria、obligation ID、Evidence tool/kind/result、locator/digest 规则和 `runtime_can_submit_human_review=false`；人工插入第二个 pending obligation 后 handoff 消失并退回 `open_molis_work`。TypeScript build 通过。第一次误把过滤参数传给全量脚本导致默认临时目录 `SQLITE_CANTOPEN`，已改用独立可写 TMPDIR 的直接入口重跑，未把环境失败冒充代码回归。
- **产品实操**：源码侧真实 Headless Chrome 1/1 通过 GB24 完整旅程：目标 Decision 深链自动选中、表单展开/进入视区、原话与 Evidence 预填，最终用户提交边界仍在。真实 CGS 只读核对确认旧流程确实没有保存对话 `human_verdict`，后来由 Web 用户手工 Review 才越过验收；未改写 CGS。新 Skill 的自然语言识别和 handoff 尚未在最终安装包的新 Session 实操，因此当前标为 `UNVERIFIED`。
- **Owner 最终验收**：方案成立。它消除重复选择/抄写，同时没有把 Runtime Evidence 提升成人类审批；多待决项失败关闭。0.1.11 发布候选已完成包级工程验证，但尚未做最终安装态新 Session 验收。
- **用户验收**：待包含本卡的新包安装并由用户在真实新 Session 体验；不由工程测试代替。

---

## GB-20260831-48：Goal Tree 变更后没有主动召回受影响子图复核

**来源**：CGS / G3 从内容生产 Goal 重规划成 P1/P2/P3 三条生成路径后的真实规划旅程
**Bug 确认**：已确认。Molis Work 只有 Runtime 主动调用的只读影响分析，Proposal materialization 成功后没有默认返回或保存语义复核 handoff；结构合法与语义仍需复核被混成一个绿色结果
**修复决定**：已完成最小发现与交接修复；不自动改树、不把影响推断写成 canonical Goal
**修复状态**：源码已实现；定向工程与代表性 CGS G3 子图回归通过，已进入 0.1.11 发布候选

### 1. 真实场景

CGS 已确认把 G3 调整为“让团队从不同成熟度输入生成本人愿意发布的多平台内容”，并拆成 P1 已选 Content Bet、P2 粗方向、P3 成熟内容扩写三条路径。提案落地后 Molis Work 没有提示复核同层与下游；直到用户主动追问，Runtime 才调用 change impact 分析，发现 G2→G3B、G3→G4、G4→G5，以及根 Goal/G6 的视频范围可能需要重新校准。图没有环或缺失引用，但 Contract 语义与消费者假设可能已经漂移。

### 2. 事实与归因

源码核对确认：`planning_analyze_change` 只能在 Runtime 主动调用时做只读分析，Goal Tree check 只校验结构与 materialization 不变量；决定成功后此前既不保存受影响对象，也不向 Runtime 返回强制复核动作。归因是 Molis Work 规划生命周期交接缺口，不是 CGS 图结构错误，也不是用户应主动提醒的合理责任。

### 3. 现有流程的问题

用户确认一次重规划后，系统只证明“这些 change items 可以合法落地”，没有告诉用户“哪些已接受 Contract 可能因此不再成立”。用户必须自己意识到影响并追问，Runtime 也可能直接继续执行旧的下游 Goal。结构合法与语义仍需复核被混成同一个绿色结果。

### 4. 设计根因与初衷

现有 Proposal 原子预检的初衷是避免冲突、非法状态转换和部分写入；它不能凭关系图自动替用户判断业务语义。`planning_analyze_change` 保持只读和显式调用，避免每次小改动都生成噪声或擅自重写 canonical tree。可能的遗漏是：安全地“不自动改树”被实现成了“落地后也不主动请求复核”。

### 5. 当前影响

影响所有会改变 Goal Contract、替换 Goal、重拆子树或调整关系的任务。频率取决于规划变更，但一旦遗漏，执行者可能沿用过期 upstream/downstream 假设，直到真实实现或用户追问才暴露；这会污染后续 Evidence、Proposal 与排期。CGS 本例已出现用户主动追问才召回 G2/G4/G5/G6/根 Goal 的事实，不只是主观麻烦。

### 6. 复杂度审查

- **当前必须**：复用 canonical relation graph 和本次 applied change set，确定性列出直接祖先、直接/传递消费者、被替换对象与关系相邻 Goal；在 decide 成功响应和下一次 Available/规划入口中明确“结构已应用，语义复核待办”；不自动修改 Goal。
- **可以延后**：用大模型自动判断每个 Contract 是否真的需要改、跨项目影响图、长期影响分数和自动重排计划。
- **应当删除**：把所有同 Board Goal 都标成受影响；把图可达性等同于业务语义已改变；自动创建 replacement/rewire 或把推断写成 canonical Goal。

### 7. 修复必要性与优先级

需要修，P1。当前确实没有 materialization 后的默认复核 handoff；它影响规划正确性和用户确认质量，但不应阻断本次已合法 Proposal 的原子落地，也不能替用户决定重编排。

### 8. 修复前后体验差异

- **修复前**：用户确认 G3 变更 → 系统显示提案已应用 → 没有后续提示 → 用户主动问才发现 G2/G4/G5/G6/根 Goal 可能漂移。
- **目标体验**：用户确认 G3 变更 → 系统明确分开“结构应用成功”与“语义复核待完成” → 返回按传播路径组织的受影响子图和理由 → Runtime 默认逐项读取 Contract/调用影响分析并向用户提出一份重编排 Proposal → 只有用户确认后才改 canonical tree。

### 9. 最小修复范围

Proposal decide/materialization 在全部条目成功应用后派生 `semantic_review`：返回变更 Goal、直接祖先、下游消费者和相邻依赖，明确 `structural_validation=passed`、`status=required`、传播路径、下一工具与用户确认边界；同一结果写入 proposal decision JSON 和 materialized event，供恢复读取。复用 canonical graph，不新建第二套 Goal 状态，不自动改 CGS，不把受影响 Goal 直接改成 blocked。

### 10. 验收边界

- **工程验证**：定向 4/4 通过，覆盖 update Goal、结构关系变化、决定 JSON 与事件持久化，明确结构校验通过而 semantic review required，并验证没有额外 canonical 写入。
- **产品实操**：代表性 G3 子图副本已确认自动召回 G2、G4、G5、G6 与根 Goal，并排除没有传播路径的 G1/G4A；仍属于源码级隔离产品旅程，最终 App/Runtime 待 0.1.11 复验。
- **Owner 最终验收**：通过。影响路径、理由、下一工具和用户确认点清晰；系统没有冒充用户完成语义判断。
- **用户验收**：变更后无需主动追问就能理解还需复核哪些 Goal；待最终安装物真实体验。

---

## GB-20260831-49：明确双轨战略目标在 Goal Tree 中被压平成一级列表

**来源**：Arena / 已确认“双重目标、双轨主线”的根 Goal 与九个平铺一级 Goal
**Bug 确认**：分析中。canonical 文案与 depends_on 保存了双重目标，但 Web 层级无法一眼看出双轨的事实成立；尚需区分规划方法漏检、Contract/decomposition 表达不足与 Web 缺少非 Goal 分组视图
**修复决定**：不替 Arena 自动建父 Goal；若缺口成立，先做提案前语义检查与明确修订提示
**修复状态**：已登记；只读核对当前规划方法、Proposal schema/check 和 Goal Tree 表达能力中

### 1. 真实场景

Arena 用户明确提出并确认两个稳定主线：公共 AI 竞技与增长闭环，以及 Adeptify 产品公开压力测试、传播物料与改进学习闭环。已落地根 Goal 的 Contract 包含双重目标，但其下九个 Goal 全部平铺；压力测试与改进机制只是普通一级节点。`planning_graph_check` 为绿，Web Goal Tree 因而技术上合法，却无法从层级呈现用户已经确认的双轨心智模型。

### 2. 事实与归因

不是 relation 写入失败或 graph invariant 错误。初步归因是规划语义到 decomposition 表达的遗漏：现有方法关注 outcome 是否独立、依赖是否有向、leaf 是否可执行，却尚未证明会检查“用户明确确认的稳定战略分组是否在 part_of 或其他可见载体中保留”。Web 正确显示 canonical tree，不应单独为缺失结构背锅；是否需要泳道是第二层产品选择。

### 3. 现有流程的问题

用户确认的是“两条主线”，审批 Proposal 时却可能只看到九个正确但平铺的 outcome units；check 只证明无环、引用有效和状态可物化，不提示战略分组丢失。落地后用户只能靠阅读根 Contract、每个标题和 depends_on 自行重建两条主线，降低 Goal Tree 作为共同心智模型的价值。

### 4. 设计根因与初衷

Molis Work 刻意禁止只作文件夹、没有可完成结果的空 Goal，避免为了视觉整齐制造虚假工作；共享能力也只能有一个 canonical owner，不能复制到两条轨。规划器因此偏向把可执行、可验收结果平铺并用 depends_on 连接。遗漏在于没有把“稳定战略分组”作为必须显式判断的语义：它可能是可完成 compound outcome，也可能只是视图维度，但不能静默丢失。

### 5. 当前影响

影响具有两条以上长期但有限主线的项目。图仍可执行，因此不会立即报错；但用户审批、分工、范围判断和后续变更影响分析都更难，且容易把一条主线的局部完成误解成根目标接近完成。Arena 已真实出现“用户明确说双重目标，但 Molis Work 看不出来”的反馈。

### 6. 复杂度审查

- **当前必须**：规划澄清/Proposal preflight 要求对用户明确命名的战略分组做一次显式分类：可完成 compound outcome、仅描述维度、或证据不足；若判为主线而 Proposal 没有可见承载，返回语义 planning issue 和修订建议。
- **可以延后**：Web 战略泳道、交叉分组、多维标签、自动布局和任意矩阵视图。
- **应当删除**：见到“双重/两条”就机械创建两个 Goal；复制共享能力；创建没有 outcome/acceptance 的纯文件夹 Goal；只为视觉分组改写 canonical 责任链。

### 7. 修复必要性与优先级

待源码核对后定论，预判 P1。若现有 planning composition/decomposition review 没有稳定分组覆盖检查，则这是规划方法与 Proposal UX 的真实设计缺口；应优先防止静默丢失，再决定是否需要新的 Web 视图。

### 8. 修复前后体验差异

- **修复前**：用户确认双轨 → Runtime 提交九个平铺 Goal → check 绿色 → 用户在树中看不出双轨。
- **目标体验**：用户确认双轨 → 规划器明确追问/记录“主线是可完成 compound outcome 还是显示维度” → 若是 compound，Proposal 用两个有完整 Contract 的中间 Goal 承载、共享能力只保留单一 owner 并用 depends_on 跨轨消费；若只是维度，则 Proposal 明确不创建 Goal，并提供可见分组说明而非静默消失。

### 9. 最小修复范围

候选范围是 planning method/decomposition checklist、Proposal narrative/decomposition_review 输入与 check 的语义 warning；不自动修改 Arena，不新建通用标签系统，不直接实现泳道。若现有 schema 无法表达“仅为显示维度”，先用结构化规划说明和 Web Proposal 摘要呈现。

### 10. 验收边界

- **工程验证**：双轨明确且两条都是有限 compound outcome 时，平铺 Proposal 在用户决定前得到可操作 warning；纯标签、共享基础设施和没有独立完成语义的主题不被强制造 Goal。
- **产品实操**：用 Arena 副本展示两条主线、共享可运行 Arena 与跨轨首发验证的候选结构；用户能在 Proposal 决定前看出分组与共享 owner，不改真实 Arena。
- **Owner 最终验收**：规划层、canonical tree 与 Web 各自责任清楚，不以虚假 Goal 换视觉整齐。
- **用户验收**：Arena 用户最终确认哪种分组载体更符合心智模型；不由本任务代替。

---

## GB-20260831-50：Skill 承诺跨仓 `file:///` 可登记，Runtime 仍按项目外文件拒绝

**来源**：Molis Work 内部 Casebook / `casebook-authorized-case-sync` 的真实 rework Evidence 提交
**Bug 确认**：分析中；现象与 GB34 修复前行为一致，优先核对当前 Session 是否仍运行旧 MCP，不先重复认定源码缺陷
**修复决定**：按用户最新指令只分析，暂不修改代码、不构建
**修复状态**：已登记；消费者已安全退化为 opaque URN/UNVERIFIED，未伪造 verified Evidence

### 1. 真实场景

Casebook Goal 绑定的 canonical workspace 是 Molis Work 仓库，实现产物位于另一个本地仓库 `molis-work-casebook`。消费者按当前 Skill 用显式 `file:///.../tests/casebook-app.test.mjs`、SHA-256、run_id 和 criterion_id 提交，Runtime 却返回“Evidence locator 不能指向项目范围外的本地文件”；随后改用 opaque URN 成功登记为 UNVERIFIED。

### 2. 事实与归因

Skill 与当前源码对外契约明确允许跨仓 `file:///` 仅登记为 machine-local UNVERIFIED，不读盘、不验 digest、不从 Web 打开；GB34 已有 0.1.10 安装 Core 隔离实操。当前错误与该契约矛盾，但仅凭来源 Session 还不能区分旧 Session 未热加载、实际 MCP 指向旧 release、还是 locator 分支回归。先归为运行态/交付一致性待核实，不重复写修复。

### 3. 现有流程的问题

消费者严格按 Skill 仍遭拒绝，只能退回不含真实路径的 URN，损失路径级 provenance；同时“文档允许、工具拒绝”会让使用者无法判断是格式错误还是版本不一致。

### 4. 设计根因与初衷

项目外文件不能升级为 verified 是防止任意读盘的必要边界。GB34 的设计是把显式 `file:///` 放入“不读取、只登记”的 UNVERIFIED 分支。当前现象可能是消费者仍连到该分支上线前的 MCP，而不是安全边界本身错误。

### 5. 当前影响

影响跨仓但尚未推送的本地 Evidence；不会导致错误 verified，但会降低审计可追溯性，并迫使消费者发明 opaque locator。已有 workaround，不阻断主线。

### 6. 复杂度审查

- **当前必须**：只读核对当前 Session 的 MCP release、安装 Core locator 实现和同 payload 隔离结果。
- **可以延后**：跨仓 verified、多 workspace 权限和 digest 独立核验。
- **应当删除**：为了通过校验把外部仓库伪装成 canonical workspace，或捏造尚未存在的 GitHub URL。

### 7. 修复必要性与优先级

待版本归因后决定。若当前安装 Core 仍拒绝则是 P1 回归；若只有旧 Session 拒绝，则与 GB16/GB34 的热加载边界去重，只需明确新 Session 恢复，不新增代码。

### 8. 修复前后体验差异

- **当前**：`file:///真实跨仓路径` → 项目外错误 → 改用不透明 URN。
- **既有目标体验**：显式 `file:///` → locator 与调用方 digest 原样登记为 UNVERIFIED → 明确不读盘/不校验/不可 Web 打开；若要 verified，切换到该仓库作为受控 workspace。

### 9. 最小修复范围

本轮暂停实现。分析范围仅为运行态版本与分支核对；不修改 Casebook 数据、不开放跨仓读取、不构建新包。

### 10. 验收边界

- **工程验证**：待核对当前源码定向回归。
- **产品实操**：若后续获准，必须同时测当前安装 Core 与 fresh Session；旧 Session 失败不能冒充当前包失败。
- **Owner 最终验收**：待归因；当前只确认契约与现场行为不一致。
- **用户验收**：不适用当前分析阶段。

---
