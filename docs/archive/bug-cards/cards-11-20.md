# 0.1.x Bug 卡：11–20

状态：历史记录，截至 2026-08-31。卡片中的状态、流程、路径与验收属于当时版本，不是当前待办或操作指令。

[台账入口](../../molis-work-bug-cards.md) · [历史总览](overview.md) · [历史复审](review-2026-08-30.md)

## 本册目录

- [GB-20260829-11：活跃长任务无续租入口，执行中静默过期](#gb-20260829-11活跃长任务无续租入口执行中静默过期)
- [GB-20260829-12：Runtime 反复领取只剩人工判断的复核](#gb-20260829-12runtime-反复领取只剩人工判断的复核)
- [GB-20260829-13：Opportunity 有引用但看不到研究过程与样本漏斗](#gb-20260829-13opportunity-有引用但看不到研究过程与样本漏斗)
- [GB-20260829-14：Goal Tree 提案 payload 需要查源码才能构造](#gb-20260829-14goal-tree-提案-payload-需要查源码才能构造)
- [GB-20260829-15：子 Goal 用样本验收却被理解成父级能力已经具备](#gb-20260829-15子-goal-用样本验收却被理解成父级能力已经具备)
- [GB-20260829-16：App、Core 与 Codex Skill 实际版本不一致](#gb-20260829-16appcore-与-codex-skill-实际版本不一致)
- [GB-20260829-17：大型 Goal Tree 变更只有技术 diff，缺少问题与效果解释](#gb-20260829-17大型-goal-tree-变更只有技术-diff缺少问题与效果解释)
- [GB-20260829-18：整份 Goal Tree 确认会在决定阶段部分落地](#gb-20260829-18整份-goal-tree-确认会在决定阶段部分落地)
- [GB-20260830-19：桌面健康恢复与 LaunchAgent 修复互相抢占 4173](#gb-20260830-19桌面健康恢复与-launchagent-修复互相抢占-4173)
- [GB-20260830-20：Planning Methods 全量正文返回被截断](#gb-20260830-20planning-methods-全量正文返回被截断)

## GB-20260829-11：活跃长任务无续租入口，执行中静默过期

**来源**：CGS G2B executor + Grok 实现 + Codex 独立 review 消费者反馈
**Bug 确认**：已确认，属于 Molis Work 租约续期与剩余时间可见性的设计缺陷；不是 GB08 的过期后展示冲突重复项
**修复决定**：用户已于 2026-08-29 批准修复
**修复状态**：2026-08-30 最终收口：同一 Claim/Run 续租、剩余时间提示和单一 renewal event 已实操；0.1.7 已安装，Owner 最终验收通过。

### 1. 真实场景

消费者领取 `cgs-g2b-editorial-decision` 的 executor Claim 后，委托 Grok 实现，再由 Codex 做独立代码和浏览器 review。整个链路一直有编辑、测试和 review 进展，但超过 `resolved_policy.max_lease_seconds=1800` 后，原 Claim 和 Run 因墙上时间到期失去写权限，Available 又把同一 Goal 显示为 `execution_pending`。原 Run 为 `run-b5cc5419-0564-44ca-826b-dd459282179a`。

### 2. 事实与归因

真实 CGS 流程已发生。当前实现只在领取时写一次 `expires_at`；Claim schema 虽保留 `renewed_at`，但 Coordinator、MCP Runtime surface、Skill 和 Web 都没有续租操作，也没有任何代码写入该字段。Skill 要求省略 `lease_seconds` 以采用动态策略，显式值只能缩短，不能超过当前 `max_lease_seconds`。到期后 Available 按规范把 Goal 重新开放，GB08 已让旧 Claim/Run 清楚投影为 expired/abandoned；因此“过期后怎么恢复”已经修复，本卡缺陷是“持续有真实进展的工作在过期前没有续期和预警路径”。主要归因是 Molis Work 生命周期设计缺口，不是 CGS 误用，也不是代理停工。

### 3. 现有流程的问题

消费者只能在领取时获得一个固定截止时间，之后没有续租、心跳或临近到期的明确动作。长任务在用户可见层仍然持续推进，Molis Work 却会静默撤销原 Run 的写权限。为了继续登记 Evidence 和 Review，消费者必须重新领取并创建新 Run；实现产出属于旧 Run，验收记录属于新 Run，连续性被人为切断。更认真地做独立 review 反而更容易跨过租约，形成“执行越完整，历史越割裂”的反向激励。

### 4. 设计根因与初衷

有限租约用于防止 Runtime 崩溃、Session 消失或任务被遗弃后永久占住 Goal，也用于限制多个执行者长期争夺同一写面；默认上限避免消费者通过一次超长 Claim 绕过失活恢复。这一安全边界合理。缺陷是系统只实现了“到期释放”，没有实现租约模型的另一半——原领取者以可审计的活跃信号续期，也没有在 Contract/UI/Runtime 中把剩余时间转成恢复动作。数据库中的 `renewed_at` 表明数据模型已为续期留位，但产品闭环没有完成。

### 5. 当前影响

影响任何超过 30 分钟的实现、构建、委托和独立 review 链路；对需要真实浏览器验收、跨代理协作或慢测试的 Goal 并非罕见边缘情况。到期不会直接丢失仓库产物或已提交 Evidence，但会阻断原 Run 的后续写入、把同一项工作重新显示为待执行，并强迫产生额外 Claim/Run。它不阻断用新 Run 绕行的最终闭环，却降低归属可追溯性并增加重复领取风险。

### 6. 复杂度审查

- **当前必须**：增加仅限原 actor、仅对仍 active 且未过期 Claim 生效的幂等续租；每次续期仍受 Claim 已解析策略约束并记录事件；Contract/Runtime 至少返回剩余时间和临近到期的 `next_action=renew_claim`；Skill 在长耗时委托、构建或 review 的进度检查点调用续租。过期后仍不得复活旧 Claim。
- **可以延后**：后台守护进程自动心跳、根据任务类型预测租期、跨 Runtime 的 Claim 转交、把多个 Run 自动拼成一个逻辑 Run。
- **应当删除**：单纯提高默认 1800 秒来掩盖问题；让消费者预先猜一个更长租期；用重新 `select_goal` 悄悄替代仍有效的 Claim 或把已过期 Run 复活。

### 7. 修复必要性与优先级

批准修复，P1。它已经在正常的高质量执行路径中发生，并直接损害 Claim/Run 作为工作归属和审计边界的可信度。已采用显式、owner-only、可审计的续租和到期前提示，没有新增常驻心跳服务，也未放宽过期后的写权限。

### 8. 修复前后体验差异

- **修复前**：领取 Goal → 持续实现和 review → 无提示跨过 30 分钟 → Goal 再次显示待执行 → 重新领取并产生新 Run → 产出与验收历史分裂。
- **修复后**：领取 Goal → Contract/UI 显示剩余租期 → 长耗时步骤的原 Runtime 在进度检查点执行一次续租 → 同一 Claim/Run 继续承载实现、Evidence 和 Review；若真的失联并过期，仍沿 GB08 的确定恢复路径创建新 Run。

### 9. 最小修复范围

新增 Claim 续租输入/结果、Coordinator 原子校验与 `claim.renewed` 事件、Runtime MCP 工具和 Skill 路由，并在 Contract/Web 的 active work 中显示剩余时间与临期动作。复用现有 `renewed_at` 字段，不改默认 `max_lease_seconds`，不新增数据库真相模型，不做自动后台心跳，不允许换 actor、过期复活或超过已解析策略的单次续期。兼容方式是纯新增 API 和展示字段；回滚后旧客户端仍按原 `expires_at` 工作。

### 10. 验收边界

- **工程验证**：2026-08-30 重新验收通过。原 actor 到期前续租保持同一 Claim/Run，`expires_at/renewed_at` 与单一 `claim.renewed` 事件一致，幂等重放不重复写；他人、超策略、过期和释放后续租均被拒绝；Contract 返回剩余秒数、临期窗口和 `next_action=renew_claim`；MCP schema、Skill 与 Web 提示均有回归覆盖。定向 V1/MCP 3/3 和 `tsc --noEmit` 通过；GB10 后正常本机权限下 service/Web 全量 67/67 也通过。
- **安装验证**：v0.1.5 全仓测试在正常文件系统权限下 273/273 通过；GitHub Actions `33256824008` 从 `main@97b971e` 生成 arm64/x64 DMG 与 App ZIP，四个主产物均通过自带 SHA-256 校验。本机已安装云构建 arm64 App 与 0.1.5 Core，修复自有 LaunchAgent 后 `service status=running`、`/health` 正常、根页面 HTTP 200。此层只证明最终二进制与服务已安装并可启动，不代替长任务产品旅程。
- **产品实操**：源码构建通过。computer use 使用 90 秒真实 Claim 启动 Run `run-a29a0c98-0f01-4479-854f-51c16aed7b9c`；续租前页面显示“租约还剩 2 分钟”，原 actor 调用续租后页面自动更新为“还剩 30 分钟”。记录页仍只有一个 active Claim 和上述 started Run，变更历史新增一条 `claim.renewed`，没有第二个 Run。截图：`docs/qa/bug-revalidation/2026-08-30/gb11-before-renew.jpeg`、`gb11-after-renew.jpeg`、`gb11-renew-event.jpeg`。断线后自然过期仍由 GB08 的产品旅程覆盖，不在本卡重复制造。
- **Owner 最终验收**：生命周期闭环与 0.1.7 Skill 安装通过；真实新 Codex Session 读取指引及提示打扰程度仍为 `UNVERIFIED`。

---

## GB-20260829-12：Runtime 反复领取只剩人工判断的复核

**来源**：CGS G2B self_verifier 消费者反馈；Review `review-ad251867-5c49-4fab-8806-f98fcb9a3d93`
**Bug 确认**：已确认，属于 Molis Work Review obligation 条件路由与人工等待状态缺陷；不是 CGS 误用，也不是 `inconclusive` verdict 本身的缺陷
**修复决定**：用户已于 2026-08-29 批准修复
**修复状态**：2026-08-30 最终收口：最终安装 App 的真实 G4A 状态显示 `waiting_for_human`，Runtime 复核明确不能代替用户验收，Runtime 不再重复领取；Owner 对产品交接验收通过，用户本人验收仍 pending。

### 1. 真实场景

`cgs-g2b-editorial-decision` 的同一个 self_verifier obligation 同时覆盖工程检查条件 `cgs-g2b-handoff-trace` 和只能由王一骏本人决定的 `human_decision` 条件 `cgs-g2b-owner-decision`。Runtime 已确认工程与浏览器证据通过，因此提交 `inconclusive`，明确只剩真实 SELECT/DEFER/REJECT、本人直输和视觉验收；Run 完成、Claim 释放后，Explain 仍返回 `ready=true`，Available 又把同一 self_verifier 列为 `review_pending`。

### 2. 事实与归因

源码可以确定性解释并复现这条路径。`ensureReviewObligations` 会把 Goal 的全部 acceptance criterion ID 原样写进每一种 Review obligation，不区分 `decision_method`；只有独立的 `policy.human_approval=true` 才会创建 `human_approver` obligation，存在 `human_decision` criterion 本身不会创建人工门禁。`inconclusive` 按现有状态机不会满足 obligation，Explain 又只检查同角色是否仍有 pending obligation，不读取 criterion 的决策主体，也不解析上一次 reasoning，于是继续返回 ready。主要归因是 Molis Work 的 obligation 路由与工作状态派生缺陷，不是 CGS 接入问题。保留 `inconclusive` 的可重试语义属于预期行为。

### 3. 现有流程的问题

Runtime 已完成所有自己有权完成的复核，却没有一个规范动作可以把工作交还给用户。它只能再次领取同一 self_verifier、再次得出 `inconclusive`、再次释放，或者依赖自身记住并解释上一条自由文本 reasoning 后擅自停止。界面仍显示普通“待复核”，既没有指出唯一剩余项由谁完成，也没有给出用户入口，导致自动化循环和用户困惑。

2026-08-30 源码产品复验又发现一层同卡回归：Goal 详情已经正确显示“等待你验收”，但 Inbox 的“最近处理结果”把刚结束的 Runtime self-verifier pass 写成“结果确认 / 本次用户确认已通过 / 你的理由”。这会让用户在同一页面同时看到“仍待本人验收”和“用户已经通过”两套互斥事实。根因不是状态机，而是 Web 结果卡没有依据 Review obligation 的角色区分 Runtime 复核与 human approval。

### 4. 设计根因与初衷

原设计用统一 obligation 覆盖整组验收条件，目的是让一次 Review 对完整 Goal 负责，避免复核者只挑容易的条件通过；`inconclusive` 不关闭 obligation，则是为了在证据不足时保留后续补证和重新检查的路径。`human_approval` 另设开关，用于只在明确要求时保留用户最终确认权。这些初衷合理。缺陷是“检查完整性”和“判断权限”没有同时建模：统一 scope 把 Runtime 可检查项与人类专属决定绑定给同一 Runtime 角色，而 `human_decision` 与 `human_approval` 两套表达又没有建立派生关系。

### 5. 当前影响

影响所有同时包含 Runtime 可判定 criterion 和 `human_decision` criterion、且开启自检或独立复核的叶子 Goal。此类 Goal 在工程复核完成后仍会持续出现在 Runtime 的可领取队列，产生重复 Claim、Run 和 Review 记录，并掩盖真正的用户待办。本次已在真实 G2B 闭环发生，直接阻断从工程复核自然转入 Owner 验收；不影响已有工程产物，但会污染审计历史并削弱“谁有权完成哪条验收”的可信度。

### 6. 复杂度审查

- **当前必须**：按 `decision_method` 分离 Runtime 可复核条件与 `human_decision` 条件；当 Runtime 部分已经结束而只剩人工条件时，不再向 Runtime 暴露同一 Review action，并返回结构化的人工等待原因、待办条件和用户入口。历史混合 obligation 需要在读取或物化时兼容收敛，不能要求重建 Goal。
- **可以延后**：独立的人工任务通知中心、多人审批编排、按 criterion 提交不同 verdict、超时催办和自然语言 reasoning 分类。
- **应当删除**：让 Runtime 通过反复 `inconclusive` 表达“我无权判断”；解析自由文本 reasoning 来猜是否只剩人工验收；把用户真实操作自动判成通过或允许 Runtime 代替用户提交 human approval。

### 7. 修复必要性与优先级

已批准修复，P1。它不是文案瑕疵，而是责任边界被错误路由后形成的稳定无效循环，并阻断人类拥有最终决定权的正常闭环。修复依赖结构化的 criterion `decision_method` 和既有用户权限，没有语义分析 reasoning，也没有新增通用工作流引擎。

### 8. 修复前后体验差异

- **修复前**：Runtime 复核工程项 → 因人工项提交 `inconclusive` → 释放 → Available 再次显示同一 self_verifier 可领取 → 重复复核，用户看不到自己才是下一位行动者。
- **修复后**：Runtime 只复核自己有权判断的条件并完成该部分 → Goal 明确显示“等待用户验收”，列出 SELECT/DEFER/REJECT、直输和视觉验收等剩余条件 → Available 不再给 Runtime 返回该 self_verifier action → 用户从 Web/管理入口提交真实决定后，Goal 才进入完成判定。

### 9. 最小修复范围

修改 Review obligation 的 criterion scope 派生、Goal 工作状态与 Available/Explain 的动作路由，并补 Web/MCP/Skill 的人工等待文案和入口说明。复用现有 `human_approver` 权限防线，新增 `waiting_for_human` 工作状态；对外返回机器可读的 `review.user_approval_required`、具体 `criterion_ids`、`obligation_ids` 和 `next_action=open_molis_work`。不解析 reasoning，不自动通过人工条件，不改变普通 `inconclusive` 对 Runtime 可判定条件的重试语义。历史混合 obligation 在下一次安全的 Review 领取点幂等拆分；旧 `inconclusive` 不能从自由文本安全推断为 pass，因此历史数据可能需要一次显式 Runtime 复核后才进入人工等待。不删除既有 Review 记录，回滚不需要还原用户数据。

本轮补丁只让最近结果根据已持久化的 obligation role 命名主体：`human_approver` 保留“结果确认 / 本次用户确认”，其他复核角色显示“Runtime 复核 / 复核理由”，并明确 Runtime pass 不能代替用户验收。没有新增数据库字段、没有根据 actor 名称或自由文本猜主体，也没有改变 Review verdict、obligation 或完成状态。

### 10. 验收边界

- **工程验证**：2026-08-30 重新验收通过。混合 inspection + `human_decision` Goal 会生成分离的 Runtime 与 `human_approver` obligation；Runtime 部分通过后派生 `waiting_for_human`，Available 不再提供 Runtime Review action，Blocked/Explain 返回 `review.user_approval_required`、criterion、obligation 和 `open_molis_work`。纯 Runtime criterion 的 `inconclusive` 仍可重试；历史混合 obligation 会在下一次安全选择时拆分。新增 Web 回归确认 self/cross/adversarial Review 只能显示为“Runtime 复核”，不得显示“本次用户确认”；定向生命周期/Web 3/3、TypeScript 和 `git diff --check` 通过。另一个既有 Web 测试在受限沙箱中因临时 SQLite 环境找不到决策组，原命令在正常本机权限下通过，未把环境假失败隐去。全量回归将在统一打包前再次执行。
- **安装验证**：v0.1.5 全仓测试在正常文件系统权限下 273/273 通过；GitHub Actions `33256824008` 的双架构产物与 SHA-256 已复核，本机 0.1.5 App、Core 和 owned Web service 已安装并健康。尚未用真实 mixed Review Goal 完成人工接棒旅程。
- **产品实操**：源码产品实操通过。computer use 使用隔离 mixed Review Goal 完成 executor、inspection Evidence 与 Runtime self-verifier pass 后，Goal 详情显示 `waiting_for_human`、“先完成等待你的决定”、完成进度 1/2 和唯一剩余的真实 SELECT/DEFER/REJECT 与视觉验收；Runtime Available 为 false，Explain 为 `ready=false / review.user_approval_required`。Inbox 同时保留人工结果确认表单，提示缺少对应通过依据；最近结果明确显示“Runtime 复核 / 已通过 / 它不能代替用户验收 / 复核理由”，不再冒充用户已通过。全程未替用户提交 human verdict。截图：`docs/qa/bug-revalidation/2026-08-30/gb12-waiting-for-human.jpeg`、`gb12-runtime-review-role.jpeg`。
- **Owner 最终验收**：产品交接通过；最终安装真实 G4A 已显示 human-only gate 且不重复 Runtime Review。用户本人按钮操作仍 pending，本轮没有模拟通过。

---

## GB-20260829-13：Opportunity 有引用但看不到研究过程与样本漏斗

**来源**：CGS 选题编辑台消费者反馈
**Bug 确认**：确认存在可复现的产品体验问题；主要归因是 CGS 的领域模型与编辑台设计债、Molis Work 接入层信息缺失，不是 Molis Work Core 缺陷
**修复决定**：已批准纳入 bugfix；Molis Work 侧只记录归因与边界，实际产品修复应在 CGS 完成
**修复状态**：2026-08-30 最终收口：Case 成立，但归因是 CGS 研究领域模型与编辑台，不是 Molis Work Core。Molis Work 侧决定为不修并路由 CGS；CGS 修复未开始，不得算入 0.1.7 已修功能。

### 1. 真实场景

用户在 CGS 选题编辑台查看一个 Opportunity，能读到事实、推断、反证、来源链接和粗略来源边界，却无法知道这轮研究使用了哪些查询词、经过哪些检索渠道、看过和淘汰了多少结果、哪些渠道没有覆盖，以及眼前的来源是从较大候选池中筛出，还是研究者只看了这些页面。正式研究候选、团队输入与 Owner 直输因此容易被理解成相同强度的市场研究。

### 2. 事实与归因

当前实现可以稳定复现。Molis Work Core 的 `EvidenceRecord` 只保存证据种类、定位符、验证状态、摘要、结果、生产者和关联验收条件等跨领域字段；它没有、也不应内置内容研究专用的查询日志和样本漏斗。CGS 的 `OpportunityV1` 已区分 `OPEN_RESEARCH`、`TEAM_INPUT` 与 `SEMI_DIRECTED`，Open Research 也保存时间窗、检索时间、采样表面和 coverage limits；2026-08-30 的新 `EvidenceResearchRunV1` 还已结构化保存 query、receipt、material、coverage gap 和预算漏斗。但 Opportunity 仍没有稳定关联对应 Research Run，编辑台 `renderOpportunityDetail` 也只渲染概况、事实、判断、风险和角度，没有展示 `sourceContext` 或 Research Run。因此最新研究账本的存在尚未转化为用户可见的来源链。主要归因是 CGS 领域对象关联与 UI 设计债，不是用户误用，也不是 Molis Work 通用 Evidence 模型缺字段。

### 3. 现有流程的问题

用户若要判断研究是否充分，只能从少量引用和一段自由文本边界反推研究过程，或离开编辑台追问执行者。流程没有明确增加一个按钮点击，而是缺少一个关键判断层：引用的“存在”被视觉上提升为研究覆盖度的“充分”，用户无法发现选择偏差、复现搜索或从缺口处继续研究。

### 4. 设计根因与初衷

Molis Work 将 Evidence 设计成跨项目的验收与追溯容器，初衷是让不同领域用统一生命周期登记可核验产物，避免 Core 被内容研究、代码测试或运营数据各自的专用字段绑死。CGS 则把 Opportunity 设计成精炼的决策卡，优先展示事实、判断和行动，避免编辑台被研究日志淹没。这两个初衷都合理；缺陷在于 CGS 只收敛了阅读表面，没有保留和渐进展示支撑结论所需的研究过程，导致“简洁”变成“证据强度不可辨认”。

### 5. 当前影响

影响所有需要凭 Opportunity 做 SELECT / DEFER / REJECT 的 Owner、复核者和后续研究者，尤其影响 `OPEN_RESEARCH` 候选。它不会直接破坏数据或发布内容，但会降低选题决定的可信度，阻断研究复现与接续，并可能让普通输入被误判为已充分搜索的市场机会。该问题已在真实 CGS 编辑台阅读中出现，频率随研究候选数量增加而增加。

### 6. 复杂度审查

- **当前必须**：在 CGS 的 Open Research 来源上下文中结构化保存查询词、渠道、搜索时间、可获得的结果浏览/保留/淘汰数量和明确覆盖缺口；编辑台以默认折叠的“研究过程”渐进展示这些信息；候选类型继续显著区分正式研究、团队输入与 Owner 直输；未知数量必须显示为“未记录”，不能伪造精确值。
- **可以延后**：逐条结果的完整淘汰理由、跨轮次差异比较、研究日志导出、自动覆盖评分、渠道排行榜和查询效果分析。
- **应当删除**：在 Molis Work Core 新建通用研究数据库、爬虫或渠道适配层；为了显得严谨而要求所有渠道都有数字；用一个不透明的综合分数替代查询、覆盖和缺口事实。

### 7. 修复必要性与优先级

需要修复，CGS 侧 P1；Molis Work Core 不改。它直接影响用户是否能对 Opportunity 的来源强度作出正确判断，并影响长期证据链是否可复现。最小修复可以沿用 CGS 现有 `sourceContext` 与编辑台详情页完成，不需要扩大成跨领域基础设施。

### 8. 修复前后体验差异

- **修复前**：用户看到若干引用和结论 → 无法判断搜索范围与筛选过程 → 只能把“有来源”当作“研究充分”，或离开编辑台追问。
- **修复后**：用户先看到同样精炼的 Opportunity 摘要 → 需要判断可信度时展开“研究过程” → 看到查询词、渠道、时间窗、结果漏斗和明确缺口 → 知道哪些结论来自正式检索、哪些只是团队或 Owner 输入，并能从缺口处继续研究。

### 9. 最小修复范围

只修改 CGS 的 Open Research 数据契约、样本/写入校验和 Opportunity 详情展示：在现有 `sourceContext` 下新增可选且可向后兼容的结构化研究过程，默认折叠展示；旧数据缺字段时明确显示“未记录查询过程”，不补写猜测数据。TEAM_INPUT 与 Owner 直输继续使用各自来源类型，不强行填写搜索漏斗。Molis Work 的 Evidence schema、Review 状态机和通用 Web 证据卡均不改。回滚时可隐藏新增面板并停止写入可选字段，旧数据仍可读取。

### 10. 验收边界

- **工程验证**：2026-08-30 只读复核当前 CGS 源码与数据：`EvidenceResearchRunV1` 和约 1.6 MB 的真实 ledger 已具备 query、receipt、material、coverage gap 与 budget；`OpportunityV1` 与编辑台仍没有将它们关联并呈现。尚无 CGS 代码改动、测试或数据迁移，因此不能报告修复通过。
- **产品实操**：computer use 打开当前 4174 CGS 编辑台和真实 OPEN_RESEARCH Opportunity，首屏能看到 4 个引用来源、反证、未知项、平台角度和粗粒度“开放研究”标签，但没有查询词、渠道列表、搜索时间窗、浏览/保留/淘汰漏斗，也没有进入 Research Run 的入口。修复前问题再次确认；截图：`docs/qa/bug-revalidation/2026-08-30/gb13-cgs-opportunity-no-provenance.jpeg`。修复后体验仍为 `UNVERIFIED`。
- **Owner 最终验收**：Molis Work 侧归因与不修决定通过；CGS 产品验收未开始，不能从本轮 Molis Work 包推断已修。

---

## GB-20260829-14：Goal Tree 提案 payload 需要查源码才能构造

**来源**：Arena Goal Tree 拆分消费者反馈
**Bug 确认**：已确认，属于 Molis Work MCP 工具契约自描述缺陷；不是 Arena 接入误用
**修复决定**：已批准修复
**修复状态**：2026-08-30 最终收口：最终安装 MCP 已暴露 Goal/Relation/Dependency 等判别 schema、关系方向、`payload.leaf_readiness` 与字段级错误；Owner 协议验收通过。

### 1. 真实场景

Arena 的 clarifier 已把一个 Root Draft 澄清成 7 个一级 Draft Goal，准备通过 `molis_work_v1_goal_tree_propose` 提交整棵待确认树。工具声明只告诉它 item 有 `kind`、`operation` 和任意对象 `payload`，没有说明 goal、relation、dependency 等 kind 的字段、枚举、最小格式和方向。为了不把父子或依赖接反，消费者只能离开 MCP 契约去读 Molis Work TypeScript 源码。

### 2. 事实与归因

可稳定复现。修复前 `GOAL_TREE_ITEM.payload` 只有 `type=object` 和 Risk 的一段说明，TypeScript 输入也只是 `Record<string, unknown>`；`kind` 枚举虽然完整，却没有与 payload 形成可判别约束。`part_of` 和 `depends_on` 的真实方向只存在于 Coordinator、规划校验和测试里。缺字段的 relation/dependency 还能越过提交入口，被保存为 pending Proposal，直到后续 check/decision/materialization 才可能报“需要起点、终点和类型”。主要归因是 Molis Work MCP 契约缺陷，而不是 Agent 理解能力、Arena 接入或用户误用。

2026-08-30 Arena 新增实操证据：消费者按 planning 文档提供了完整 `leaf_readiness`，但放在 contract item 的 `payload.leaf_readiness` 后仍被拒绝；当前工具声明在该消费者侧仍呈现 `Array<unknown...>`，错误只说需要叶子粒度判断，没有指出期望字段路径究竟是 item 顶层、payload 顶层还是 `payload.proposed_goal`。该失败没有创建 Proposal，说明写入原子性正常，但也证明此前“八类 kind 条件化 schema 的源码测试”尚未覆盖叶子 Contract 的真实构造路径，产品验收必须重开。

### 3. 现有流程的问题

基础拆树需要额外执行“定位 Molis Work 仓库 → 搜索 materializer/测试 → 推断 canonical payload → 返回 Arena 提交”，把实现源码变成隐藏文档。若消费者不查源码，最危险的结果不是立即失败，而是字段形式合法、领域语义错误：例如把 `part_of` 写成父到子，或把 `depends_on` 写成提供者到消费者。缺字段条目进入用户待确认队列还会把本应由机器提前指出的格式错误转嫁给用户决定阶段。

### 4. 设计根因与初衷

统一 Goal Tree Proposal 最初使用开放 `payload`，是为了让 goal、contract、relation、risk、policy、candidate、rewire 在一个原子提案中演进，避免每增加一种条目都复制一套工具；宽松读取也能兼容早期直接 payload、嵌套 `goal`、单条 relation 和 `relations[]` 等历史格式。这个兼容目标合理。缺陷是“运行时可宽松读取”同时变成了“对消费者没有规范写法”：服务端没有另外暴露 canonical 写入契约，也没有在用户决定前验证最常见的关系结构。

### 5. 当前影响

影响所有原生 Goal Tree 提案消费者，首次接入、跨仓库 Agent 和只拿到 MCP declaration 的集成方最明显。每次构造新 kind 都可能产生查源码与试错成本；relation/dependency 方向错误会直接改变 Goal 层级、执行顺序和阻塞关系。本次已真实阻断 Arena 提案提交前的自主推进，但尚未写入错误 canonical 关系，数据未受损。

### 6. 复杂度审查

- **当前必须**：为 8 种现有 kind 暴露可判别的 payload schema、字段枚举和最小示例；明确 `part_of` 是子 Goal → 父 Goal，`depends_on` 是消费方/依赖方 Goal → 提供方/前置 Goal；relation/dependency 缺字段时在 Proposal 入队前返回缺失字段、规范示例和方向，不留下 pending 记录。
- **当前必须（Arena 新证据）**：把 `leaf_readiness` 的 8 个必填字段、嵌套 item 结构和枚举暴露在 Contract/Goal payload 中；缺字段时返回 `items[].payload.leaf_readiness.<field>`，不能继续只说“补充叶子判断”。
- **可以延后**：把所有历史宽松格式迁移成唯一存储格式、为每个 operation 建立完全独立的 TypeScript 判别联合、根据 schema 自动生成 Web 表单和外部 SDK。
- **应当删除**：新建第二套 Goal Tree API；要求消费者继续读取源码；为追求 schema 纯度而拒绝读取已有 pending Proposal；把 planning_methods 当成 payload 字典并复制同一份字段事实。

### 7. 修复必要性与优先级

需要修复，P1。该缺陷让 Molis Work 的主要原生规划入口无法只凭工具契约安全使用，并可能生成方向相反的 canonical 关系。修复直接发生在现有 MCP schema 与 Proposal 入口，不增加数据库、服务或工作流，收益明确且回滚简单。

### 8. 修复前后体验差异

- **修复前**：读取工具 → 只看到 `payload: object` / `Array<unknown...>` → 查 Molis Work 源码或猜字段 → 叶子 Contract 漏一个字段也只收到泛化错误 → 可能反复换 item/payload/proposed_goal 路径。
- **修复后**：读取工具 → 看到 8 个 kind 的判别分支，Contract 的 `items[].payload.leaf_readiness` 展开 8 个必填字段和嵌套枚举 → 直接确认父子与依赖方向并提交；若漏写 `rationale`，提交立即指出 `items[].payload.leaf_readiness.rationale`，且用户待确认队列保持干净。

### 9. 最小修复范围

只修改 `molis_work_v1_goal_tree_propose` 的 item schema、leaf/relation/dependency 提交前校验和对应回归测试。schema 改为 8 个顶层 `oneOf` 判别分支，并为 `leaf_readiness` 定义必填字段与嵌套结构；保留现有宽松读取和数据库格式。不改 Proposal 原子性、用户确认边界、materializer、planning_methods 或已有记录。旧客户端按原格式提交仍可工作；回滚只需还原工具声明和错误文本，不涉及数据迁移。

### 10. 验收边界

- **工程验证**：2026-08-30 再次通过。先以测试复现缺 `rationale` 仍只返回泛化错误，以及工具声明不具备顶层判别分支；修复后完整 MCP 30/30、Goal Tree/leaf V1 18/18、TypeScript 均通过。源码工具列表现在返回 goal、contract、relation、dependency、risk、policy、candidate、rewire 8 个顶层 `oneOf` 分支；Contract 的 `leaf_readiness` 明确要求 `verdict / primary_deliverable / output_coverage / split_candidates / rationale / unresolved_decisions / independent_deliverables / acceptance_criterion_ids`，嵌套枚举与必填字段均可读。
- **安装验证**：v0.1.5 最终全仓回归为 273/273；GitHub Actions `33256824008` 双架构产物及 SHA-256 已复核，本机 0.1.5 App、Core 与 Web service 已安装并健康。当前 Session 不会热加载新 MCP schema，产品实操仍需新开 Session。
- **产品实操**：源码 MCP 产品接口已通过：临时 Board 读取工具声明可见 8 个判别分支与上述 8 个 `leaf_readiness` 必填字段；缺 `rationale` 的真实 `molis_work_v1_goal_tree_propose` 返回 `items[].payload.leaf_readiness.rationale`，错误后 pending Proposal 为 0；同一 payload 补齐字段后一次创建 `state=pending` 的待确认 Proposal。该消费面是 MCP tool declaration，不是 Web 页面，computer use 不能替代实际工具契约调用。统一安装后的 Arena 新 Session 仍为 `UNVERIFIED`。
- **Owner 最终验收**：最终安装 MCP declaration 已验证，字段/枚举/方向可自描述；真实 Arena 新 Session 提交仍为 `UNVERIFIED`。

---

## GB-20260829-15：子 Goal 用样本验收却被理解成父级能力已经具备

**来源**：CGS G2 / G2A 产品实操反馈
**Bug 确认**：确认存在严重误导体验；主要归因是 Molis Work 跨层 Contract 覆盖与 Risk 解决依据的设计债，同时存在 CGS 把能力目标降成样本验收的建模错误；不是 `satisfied` 状态机计算错误
**修复决定**：Owner 已批准 Molis Work Core 防误导修复；CGS Contract 纠偏仍需在 CGS 项目中单独推进
**修复状态**：2026-08-30 最终收口：Molis Work 不再以样本子 Goal 自动完成父 Goal，并显式显示形式验收与父级覆盖差距；0.1.7 已安装，Owner 验收通过。真实 CGS Contract 的能力纠偏仍属 CGS 接入范围。

### 1. 真实场景

CGS 父 Goal G2 承诺把开放研究等来源变成可解释的内容机会。子 Goal G2A 却把完成条件收缩成“开放研究、半命题信号、团队输入各有一个结构化样本”，并只把需求、供给缺口、热点和 KOL 关注保存成标签。样本与 schema 测试通过后，G2A 显示 `satisfied`，来源覆盖 Risk 也被更新为 `resolved`；用户进入真实编辑台才发现多源搜索、需求/供给分析、反证覆盖、研究缺口和机会形成过程并不存在，第一步实际只是 demo / contract spike。

### 2. 事实与归因

CGS 当前 README、G2A 合同和代表性扫描都确认首轮目标是三类来源各一个代表性样本，并明确没有登录态平台搜索、账号后台、搜索量和完整供给样本；这与“具备开放研究到可解释机会的能力”不是同一层结果。Molis Work 当前叶子检查只验证该叶子自己的 promised outputs、验收条件和 Evidence 是否自洽；复合父 Goal 收口只要求通用路径有子 Goal 归属、没有开放子树，之后 `satisfyClosedCompoundGoalIfReady` 只看全部 active child 是否 `satisfied`。系统没有保存“父 promised output / criterion 由哪些子 output / criterion 覆盖、是完整还是部分覆盖”的 canonical 映射。`setRiskState(... resolved ...)` 也只校验合法状态和非空理由，不要求解决证据或剩余缺口。因而 G2A 对它被批准的样本 Contract 来说确实完成，状态机没有算错；错误来自 CGS Contract 语义降级，以及 Molis Work 未防止这种降级被当成父级能力证据。

### 3. 现有流程的问题

Runtime 可以把父级能力拆成一个名字相近但验收更窄的子 Goal，用户确认时只看到每条 Contract 本身成立，却看不到父承诺被哪些子结果完整覆盖。执行者随后按较窄 Contract 正确交付，Molis Work 又用绿色 `satisfied` 和 `resolved` 表达局部事实，界面没有明确“只完成样本合同，不代表父能力具备”。错误直到用户操作最终产品才暴露；此时后续编辑台、制作和策略 Goal 已经可能把假机会当成可信输入。

2026-08-30 的源码实操还发现一层展示回归：父 Goal 已被 `goal.contract_coverage_incomplete` 阻断，展开区也显示“部分覆盖 / 仍需父级集成”，但旧的子 Goal 进度组件仍写“还剩 0 个子 Goal；全部完成后，这条父 Goal 会自动完成”。同一屏同时否认和承诺自动完成，足以抵消防误导修复。根因是父级完成说明只读取 `closed_compound + 子 Goal 数量`，没有读取同一 canonical `contract_coverage`。

### 4. 设计根因与初衷

Molis Work 把自然语言 Contract 的含义与取舍交给用户确认，而不是让系统用模型相似度代替人的业务判断；accepted Contract 保持不可静默修改，closed compound 依赖用户确认“这棵树已经拆完整”，所有子项完成后再自动汇总。这能避免系统擅自发明验收语义。Risk 同样采用显式状态加理由，避免自动化替用户宣称风险已消失。初衷合理。缺陷是用户确认前缺少一层结构化责任链：父承诺和父验收没有逐项委托到子结果，Risk 的 resolved 也没有结构化解决依据，因此“人确认语义”退化成“人只能凭标题猜语义”。

### 5. 当前影响

影响所有通过子 Goal 交付父级能力的复杂工作，尤其是研究、数据、AI 评测和运营能力建设。单个叶子可以在工程上完全通过，却让执行者、Owner 和后续 Goal 误以为更高层能力已经建立；这会污染优先级、依赖和决策输入，并把真实缺口推迟到产品实操阶段。本次已在 CGS 真实使用中发生，阻断可信的机会发现闭环。数据记录本身没有损坏，但状态表达与能力事实之间出现了高风险差距。

### 6. 复杂度审查

- **当前必须**：在父 Goal 收口时，要求每个 parent promised output 和 acceptance criterion 显式映射到一个或多个子 Goal 的具体 promised output / criterion，标明完整、部分或仍需集成验收；存在部分或未覆盖项时不能成为 `closed_compound`。该映射必须成为可读取的 canonical 事实，并在父子详情中显示。子 Goal 的绿色状态要写成“本 Goal 按当前 Contract 已满足”，同时展示对父级的覆盖与剩余差距。Risk 进入 `resolved` 时要提供结构化 resolution basis、Evidence 引用和 residual gaps；不能通过解析风险描述自由文本自动判断。
- **可以延后**：对父子自然语言做相似度提醒、跨多层自动汇总覆盖率、历史 Goal 的批量审计、按行业生成能力模板和对未解决风险自动催办。
- **应当删除**：用 LLM / embedding 分数自动裁定子 Contract 是否语义等价；因为父级仍有缺口就否认子 Goal 对其局部 Contract 的真实完成；自动把历史 `satisfied` 或 `resolved` 改回去；把三个样本、标签数量或测试通过数包装成能力覆盖率。

### 7. 修复必要性与优先级

需要修复，P1，Owner 已批准最小数据模型。Molis Work Core 已阻止新的跨层静默降级并诚实展示局部完成，但不会替 CGS 自动补齐研究能力。CGS 仍应把当前 G2A 明确定性为“Opportunity 合同与代表样本验证”，并把真实多源研究与机会分析补成新的可执行 Goal，或经用户确认重开原 Contract；原 source coverage Risk 若描述的是完整能力，也应重新判断，而不是由本次迁移自动改写。

### 8. 修复前后体验差异

- **修复前**：用户看到 G2A `satisfied`、Risk `resolved` → 自然理解为机会研究能力已完成 → 进入编辑台才发现只有三个样本和标签。
- **修复后**：三个样本仍可被真实标记为“本 Goal Contract 已满足” → 同一页面明确显示它只覆盖父级的合同/样本验证，真实多源搜索、供需判断和机会形成仍是部分或未覆盖 → 父 Goal 不能收口，Risk 若解决依据不足仍保持 open → 用户可以选择补建研究 Goal，或明确缩小父级承诺后再确认。

### 9. 最小修复范围

Molis Work 侧复用现有 decomposition review，新增 `contract_coverage`：父级每个 promised output / acceptance criterion 必须精确引用后代 Contract 字段，并标记 `complete / partial / integration_required / uncovered`。仅 `complete` 可确认 `closed_compound`；canonical 映射写入 `goals.decomposition_review_json`，父级自动完成和 Work State 都读取同一事实。Contract 新增 `parent_contract_coverage`，Web 在父子详情分别展示覆盖与贡献，并把绿色文案收窄为“本 Goal 按当前 Contract 已满足”。Risk 的新 `resolved` 写入必须携带 `resolution_basis.summary / evidence_refs / residual_gaps`，存入 `risks.resolution_basis_json`；历史缺失只显示“未记录”，不追溯改状态。schema migration 21 只增加两个可空 JSON 字段。未修改 accepted Contract 的不可变边界、Evidence / Review 机制、历史完成事实、CGS 源码，也未引入语义模型或第二套规划系统。回滚可停止使用新字段并恢复旧派生逻辑，已有 JSON 事实保留且无需删除。

本轮补丁只让父级进度说明在存在 `partial / integration_required / uncovered` 覆盖时优先显示“父级 Contract 仍有覆盖缺口”，明确即使子 Goal 数量已完成也不会自动完成。没有新增状态或字段，也没有改变所有覆盖项均 `complete` 时的自动完成说明。

### 10. 验收边界

- **工程验证**：2026-08-30 重新验收通过。父级缺失映射、部分映射和错误后代引用均不能确认收口；完整映射持久化并反向投影到子 Contract；部分覆盖派生 `clarification_blocked / goal.contract_coverage_incomplete`。Risk resolved 的直接写入、Goal Tree 提案和 Web 路径都要求结构化 resolution basis。新增 Web 回归确认 1/1 子 Goal 已完成但父级覆盖仍有缺口时，不得出现“还剩 0 个子 Goal；会自动完成”。定向父子覆盖 2/2、Risk 3/3、TypeScript 和 `git diff --check` 通过；统一打包前仍会执行全量回归。
- **安装验证**：GitHub Actions `33256824008` 从 `main@97b971e` 构建 v0.1.5 arm64/x64，四个主产物均通过自带 SHA-256；本机云构建 arm64 App 的 bundle 版本为 0.1.5，Core 安装收据指向 `releases/molis-work-0.1.5`，owned LaunchAgent 与 HTTP 健康检查通过。此层不证明 CGS 的父子 Contract 已经完成真实纠偏。
- **产品实操**：源码产品实操通过。computer use 使用“真实多源研究”父 Goal 与已完成的“三类代表性样本”子 Goal：父 Goal 首页显示 `目标澄清受阻` 和 `goal.contract_coverage_incomplete` 的人类说明；展开完成要求可见 promised output 为“部分覆盖”、criterion 为“仍需父级集成”，父级进度明确写“完成数量不足以证明父级承诺已经实现，不会自动完成”。子 Goal 仍诚实显示“本 Goal 按当前 Contract 已满足”，同时在“对父 Goal 的贡献”标记两项“尚有缺口”。截图：`docs/qa/bug-revalidation/2026-08-30/gb15-parent-coverage-gap.jpeg`、`gb15-child-local-satisfaction.jpeg`。本轮未在 UI 新写 Risk，也未改变真实 CGS Contract。
- **Owner 最终验收**：Molis Work 的跨层防误导通过；CGS 对 G2A/G2 的业务 Contract 纠偏未由本仓接管，用户对文案的主观理解仍为 `UNVERIFIED`。

---

## GB-20260829-16：App、Core 与 Codex Skill 实际版本不一致

**来源**：用户要求逐卡复核“已经修复”的最终产物后发现
**Bug 确认**：已确认存在交付缺口；主要归因是发布与验收流程漏掉已连接 Runtime 的独立升级步骤，不是 Core 安装器越权失败
**修复决定**：用户已要求本卡修完并继续复核
**修复状态**：最终交付已闭环。App、内嵌 Runtime、home Core/launcher、LaunchAgent PATH 与 active Codex Skill 均对齐 0.1.10；service `running/owned=true`，LaunchAgent/监听/health PID=72472，Codex Runtime integration=`connected`。真实新 Codex Session 的自然语言行为仍由用户侧观察，不把安装一致性冒充为真人验收

### 1. 真实场景

最初复核 v0.1.5 时，GitHub Release、用户级 App、`~/.molis-work` Core 与常驻 Web service 都曾更新，台账因此把多张 Runtime 消费体验卡写成“已安装”。但真实 Codex 使用的 `~/.codex/skills/goal-advance` 仍是一个指向 `molis-work-0.1.1` 的受管符号链接。2026-08-30 再次只读复核还发现：Core launcher、owned LaunchAgent 和 4173 服务已经指向 0.1.6，`/Applications/Molis Work.app` 的 bundle 却是 0.1.3。当前不是单一 Skill 落后，而是 App、Core/service 与 Skill 三层版本分裂。

### 2. 事实与归因

可稳定复现。历史 0.1.6 阶段曾是 Core/service 0.1.6、App 0.1.3、Codex Skill 0.1.1；随后 0.1.7 一度统一。2026-08-30 当前权威读回再次出现同类漂移：App、内嵌 Runtime、安装收据和两个 home launcher 均为 0.1.9；服务进程健康，但 LaunchAgent PATH 仍指向 0.1.8，`readlink` 明确显示 Codex Skill 仍指向 `molis-work-0.1.7/skills/goal-advance`。Molis Work 的 service status 能识别旧 plist 为 `needs_repair`，Runtime integration 也有 managed-link repair，所以领域检测没有失效。`molis-work install` 有意只升级本体、不静默改 Runtime 配置或 Skill 的授权边界合理；缺陷仍是 Desktop 选错服务恢复动作，以及交付验收把 release 目录里存在新 Skill 错写成 active Codex 已使用它。

### 3. 现有流程的问题

发布流程验证了 tag、资产、校验和、App、Core 和 Web service，却没有检查每个已连接 Runtime 的集成状态，也没有在用户已经授权安装全部改进后完成“预览修复 → 确认 → 新 Session”这条独立链路。结果是 MCP 进程通过当前 launcher 使用新 Core，而 Agent 仍按旧 Skill 做决定；同一次会话里出现“工具支持新能力、行为说明却不知道如何使用”的混合版本。

### 4. 设计根因与初衷

本体安装与 Runtime 接入被刻意分开，是为了避免升级 App 时静默改写 `~/.codex/config.toml`、替换用户自定义 Skill 或影响其他 Runtime。受管旧链接可以被领域服务识别为 `managed / needs_repair`，未知同名链接则保持 `conflict`。这条授权和回滚边界正确；问题在于发布验收没有把它当作每次 MCP/Skill 变更后的必要交付层，也没有限制“已安装”结论的适用范围。

### 5. 当前影响

直接影响所有依赖 Skill 决策的修复：GB01 的同句项目授权、GB02 的完成门禁动作、GB03/09 的 locator 可发现性、GB06 的安全重试、GB08 的过期恢复、GB11 的续租时机、GB12 的人工接棒和 GB15 的规划覆盖规则。Core 仍能拒绝部分错误写入，但消费者会继续多问、重试、漏续租或走旧恢复路径。当前机器已经真实处于混合版本，因此不是理论风险。

### 6. 复杂度审查

- **当前必须**：把 Runtime 集成状态加入发布后验收；只有 Molis Work 管理的旧链接经用户预览并确认更新、状态回到 `connected`，再用新 Session 读取当前 Skill 后，才可把 Runtime 相关修复写成“已安装”。本机最终发布后执行同一流程。
- **可以延后**：在所有页面常驻展示 Runtime 版本横幅、跨机器集中升级、自动通知每个旧 Session。
- **应当删除**：仅凭 Core/App/service 版本一致就宣称消费者协议已安装；为了省一步而让本体安装器静默改 Runtime；覆盖未知同名 Skill。

### 7. 修复必要性与优先级

需要修复，P1。它横跨多张已批准的消费者体验卡，并会使修复在包内存在却在真实 Agent 行为中失效。最小修复不改变安全模型，只补齐发布验收、状态口径和一次受管接入更新。

### 8. 修复前后体验差异

- **修复前**：安装新 App/Core → 服务健康 → 宣称所有改进已安装 → 新 Codex 仍读取旧 Skill → 继续重复确认、漏续租或不认识人工等待。
- **修复后**：安装新 App/Core → 设置页明确显示受管 Runtime 是否需要修复 → 用户确认后同时更新 MCP 配置与 Skill 链接 → 新开 Session 加载同一 Release → 只有真实消费链一致后才报告安装完成。

### 9. 最小修复范围

更新中英文安装文档的发布后最终产物门禁，并修正 Bug 台账中“已安装”的分层口径；最终打包安装后，使用现有 `RuntimeIntegrationService` 的预览与确认事务更新 Codex 受管链接，不直接执行 `ln -sfn`，不修改项目绑定，不热刷新旧 Session，不接管 Claude Code/Grok 等当前显示冲突的未知配置。若确认或验证失败，领域服务恢复原配置和 Skill 链接；文档变更可独立回滚。

### 10. 验收边界

- **工程验证**：通过。当前代码无需新增自动修复；安装 15/15、Runtime integration 12/12、Web 41/41 回归覆盖 managed 旧链接更新、未知链接冲突、MCP + Skill 事务验证、失败回滚、设置页检测和 GB05 最终样式门禁，`git diff --check` 通过。Web 测试在受限沙箱内因 SQLite 临时库不可写出现假失败，相同命令在正常本机权限下 41/41 全绿；不把该环境差异记为产品通过。
- **产品实操**：当前再次确认未通过。实机只读核对为 App/内嵌 Core/home Core 0.1.9，App 与 home 构建指纹一致；4173 与 `/health` PID 同为 12637，只证明当前页面健康。官方 service status=`needs_repair`，plist PATH 为 0.1.8；active Codex Skill 为 0.1.7，设置 API 同样返回 Codex `connection_state=needs_repair`。0.1.9 release asset 内的新 Skill 可以读取，但不等于 Codex 实际连接已升级。修复后的 service=`running`、Runtime integration=`connected`、Skill 指向当前 Release和新 Session 行为仍为 `UNVERIFIED`。
- **Owner 最终验收**：源码与交付门禁设计通过，当前安装交付验收撤回。必须在下一包安装后依次收敛 GB42 service 和 managed Runtime integration，重开 Session 后才能恢复“全链统一”结论。

---

## GB-20260829-17：大型 Goal Tree 变更只有技术 diff，缺少问题与效果解释

**来源**：CGS 18 项 Goal Tree 变更审批反馈
**Bug 确认**：确认是 Molis Work Proposal 可理解性设计债；不是结构化 change item 本身错误，也不是消费者误用
**修复决定**：用户已于 2026-08-29 在本 Session 确认修复
**修复状态**：2026-08-30 最终收口：Proposal 级原因/主链路/非目标/影响与逐项问题—修改—效果说明已持久化并通过代表性 computer-use 实操；0.1.7 已安装，Owner 最终验收通过。

**2026-08-30 复验与修复进展**：重新检查确认当前数据库只有 proposal `summary` 和 item `reason`，Web 又完全没有展示 item `reason`，所以“让 Agent 写好一点”不能解决审批对象缺字段的问题。本轮新增正式 `narrative`（为什么现在改、原问题、主链路、预期效果、非目标）和 item `explanation`（主要问题、会改变什么、不改变什么、change 依赖），五项及以上 Proposal 缺任一层会在写入前给出可操作错误；旧 Proposal 仍可读取并明确标识历史说明缺失。用 computer use 打开源码 Web 的五项 CGS 代表性 Proposal，首层可直接读出 `G2C → G2D → G2E/G2F → G2B → G3`、能力缺口、预期效果和非目标；未提交任何决定。该实操证明新信息能到达真实审批页面，但不是原 18 项 Proposal 的最终安装回归，也不等于用户已经认可信息密度。

### 1. 真实场景

CGS 的 G2 发生较大变化，一份 Proposal 同时包含父 Contract 重写、新建 G2C–G2F、依赖调整、G2B 合同改造和 Risk 重触发，共 18 个 change item。用户能看到操作、内部 ID 和字段内容，却不能直接理解为什么现在要改、原目标哪里不成立、各项分别解决什么问题，以及新链路为什么按 `G2C → G2D → G2E/G2F → G2B → G3` 组织，只能让 Agent 在 Molis Work 外另写长解释。

### 2. 事实与归因

可由当前模型与 renderer 稳定复现。Proposal 只有一个自由文本 `summary`；每个 item 有 `reason`、`payload` 和 `affected_objects`，但没有正式的“原问题、预期效果、不改变什么、与其他 change 的语义依赖”字段。Web 能把 create/update/relation 转成局部操作说明，也能展示字段与结构方向，但无法可靠恢复整份变更的业务主线。属于 Molis Work 的审批可理解性设计债；Runtime 若只填抽象 reason 会放大问题，但不是 CGS 接入方单独能修好的展示缺陷。

### 3. 现有流程的问题

用户需要在 18 个技术条目之间自行拼出一条业务因果链；`update_goal_contract`、`create_goal`、`upsert_relation` 和 `update_risk` 对工程实现明确，对决策者却没有共同的问题背景。关系项只说明 `part_of / depends_on` 的方向，无法回答为什么这条依赖是必要的。结果是审批要么依赖对话外解释，要么在没理解完整影响时整份接受或退回。

### 4. 设计根因与初衷

统一 Proposal 最初优先保证机器可验证、可 materialize 和可审计，因此把 canonical payload、对象引用和逐项 reason 作为事实主体，避免让一段不可执行的叙事代替真实变更。这个初衷正确。缺口是把“技术上可审计”当成了“用户能理解”：自由文本 summary 没有最小语义合同，renderer 也只能按条目类型生成局部文案，无法稳定表达跨条目的共同目标和先后关系。

### 5. 当前影响

主要影响包含多种 item、需要人类整份确认的中大型 Proposal；条目越完整，阅读负担反而越高。它不直接破坏 canonical 数据，但会提高误批、误拒和重复解释的概率，削弱 Molis Work 作为人类决策界面的价值。小型单项变更影响较低，因此当前评为 P2；对于涉及 Contract、Risk 和依赖重排的整树变更，实际审批风险接近 P1。

### 6. 复杂度审查

- **当前必须**：复用现有 Proposal/item，不增加第二套变更真相；为整份方案提供“为什么改、原问题、变更后主链路、主要影响、非目标”，为每个大型 Proposal item 提供“解决什么、改变什么、不改变什么、依赖谁”的稳定字段；Web 默认显示整份摘要，逐项展开；新建大型 Proposal 缺字段时拒绝写入，旧记录明确标识历史缺口，不由 UI 猜业务因果。
- **可以延后**：AI 自动生成/润色解释、多版本可视化 diff、影响图、按角色定制摘要、历史 Proposal 自动回填。
- **应当删除**：只展示内部 ID 和操作枚举就认为完成用户说明；让 renderer 从任意 payload 猜测业务动机；要求 Agent 每次在系统外另写不可追溯的长解释。

### 7. 修复必要性与优先级

需要修复，P2，用户已批准并已完成源码最小实现。它不改变执行正确性，却直接影响用户是否能做出知情决定；五项门槛避免给普通单项变更增加重复填写，而中大型变更必须自带可审计语义层。

### 8. 修复前后体验差异

- **修复前**：用户看到 18 个字段/关系操作 → 让 Agent 在对话里重新翻译 → 仍需自己拼出主链路后才能决定。
- **修复后**：用户先看到“原问题 → 本次主链路 → 预期效果 → 非目标与主要影响” → 再按链路展开到每个 change，看到它解决什么、依赖谁和明确不改变什么 → 在 Molis Work 内完成知情审批。

### 9. 最小修复范围

已按最小范围扩展 Goal Tree Proposal 的 nullable 语义说明字段、schema migration 22、MCP schema/Skill 和 Web renderer，并保留现有 `summary/reason/payload` 兼容读取。五项及以上的新 Proposal 强制 narrative 与逐项 explanation；小型 Proposal 仍可省略，旧 Proposal 显示“历史方案未记录语义说明”。materializer、原子性、accepted Contract 不变量和用户确认权限不变。回滚可停止新字段强制与展示，不影响 canonical Goal Tree 或旧决定记录。

### 10. 验收边界

- **工程验证**：定向 V1 迁移、必填校验、依赖 ID、round-trip 与既有原子 Proposal 回归通过；V1 全套 90/90、TypeScript、MCP schema 定向用例和 Web 三条相关用例通过。全量 Web 本轮曾出现 8 条既有 `SQLITE_CANTOPEN` 环境抖动，不能据此声称整仓门禁已绿；与本卡直接相关的两条大型 fixture 已补齐语义字段并在独立运行中通过。
- **产品实操**：源码构建的五项 CGS 代表性 Proposal 已用 computer use 通过：首层能回答为什么改、原问题、`G2C → G2D → G2E/G2F → G2B → G3` 主链路、预期效果与非目标，canonical 确认按钮仍需用户理由且未被点击。逐项结构有自动化 Web 证据；computer use 在展开第二层时受 Chrome accessibility 折叠控件定位不稳定影响，逐项可见性的截图证据仍为 `UNVERIFIED`。原 18 项、单项轻量路径和最终统一安装包尚未实操。
- **Owner 最终验收**：代表性 Proposal 的信息结构与交互通过；用户本人对长提案理解成本仍为 `UNVERIFIED`。

---

## GB-20260829-18：整份 Goal Tree 确认会在决定阶段部分落地

**来源**：CGS 18 项 Goal Tree 变更与 Arena 7 个一级 Goal 拆分实操；两条反馈属于同一缺陷族，已去重
**Bug 确认**：已确认，属于 Molis Work Proposal 原子性、预检一致性和乐观并发基准缺陷；accepted Contract 不可静默改写本身是预期安全边界
**修复决定**：需要修复，P1
**修复状态**：2026-08-30 最终收口：check/decide 使用同源 dry-run，whole confirm 遇冲突零写入，恢复路径可读；293/293 与代表性 Web 实操通过，Owner 最终验收通过。

### 1. 真实场景

CGS Runtime 提交一份包含父 Contract 重写、新 Goal、关系和 Risk 的 18 项提案；`goal_tree_check` 返回无冲突，用户确认整份提案后，16 项已写入，两个 accepted Goal 的 Contract 更新到决定阶段才被拒绝。Arena 的整树提案也在等待用户确认期间发生根 Goal baseline 变化；决定后 7 个子 Goal 和依赖已创建，根 Contract 与全部 `part_of` 冲突，留下没有父级归属的子图。两次用户确认的都是完整 change set，而不是“能写多少先写多少”。

### 2. 事实与归因

两条路径均可由当前实现解释并回归复现。`goal_tree_check` 只检查条目格式、Risk 校验和调用方提供的对象 hash，没有运行决定阶段的 materialization invariant，因此 accepted Contract 的 `goal.accepted_compound_closure_invalid` 只能在 decide 暴露。`confirm_all_pending` 随后被展开成普通逐项 confirm；materializer 遇到冲突时记录该 item，继续写入其余条目，最终形成 `partially_applied`。Goal baseline 又对完整 `GoalRecord` 做 hash，把 `updated_at`、`fulfillment_state` 等不属于该 Contract / relation 条目写入面的字段也算作并发变更；关系端点是否进入 affected objects 还依赖消费者手填。主要归因是 Molis Work Core 缺陷。accepted Goal 只能做已允许的 compound closure、不能借需求变化静默重写已接受业务 Contract，是保护历史 Evidence 与用户承诺的预期行为；缺陷在于系统在确认前不说明、确认后又只落一半。

### 3. 现有流程的问题

Runtime 按规范 propose → read → check → 请求用户确认，仍无法知道整份方案不可应用。用户确认后 canonical tree 才暴露错误，而且已写入的 Goal、依赖、Risk 与未写入的核心 Contract 形成语义不一致。Runtime 不知道应重试、修改原 Goal、创建 successor 还是回滚已落结构；`revision_proposals=[]` 也没有直接恢复路径。Arena 中普通等待和租约到期还会让与 Contract 无关的根版本自然漂移，迫使用户再次确认。

### 4. 设计根因与初衷

逐项 materialization 的初衷是让一份复杂提案中的独立安全条目不会被另一个并发冲突永久拖住；全对象 optimistic hash 的初衷是简单、保守地阻止在旧事实上覆盖新状态；accepted Contract 不可变则防止已经执行和验收过的承诺被改写。这些保护在“用户逐项决定”时合理。缺陷是 `confirm_all_pending` 沿用了逐项容错语义，系统没有表达“用户决定的原子单位”；同时保守 hash 没有按 item 的真实写入面收敛，正常运行态变化也被误当成业务冲突。

### 5. 当前影响

影响所有包含多 Goal、多关系和 Contract 更新的整树提案，等待用户确认越久、条目越多，触发概率越高。它不会破坏 SQLite 事务完整性，但会破坏用户确认的语义完整性：用户批准一条新主链路，系统却生成一半新结构和一半旧合同。后续 Agent 可能在孤立或错误归属的 Goal 上继续执行，`planning_graph_check` 仍可能因没有循环和缺失引用而显示绿色。本次已分别在 CGS 与 Arena 真实阻断规划闭环。

### 6. 复杂度审查

- **当前必须**：`confirm_all_pending` 全有或全无；任一 baseline、规划或 materialization 冲突都回滚整次决定并明确下一步。`goal_tree_check` 在可回滚 savepoint 中按真实物化顺序运行同一不变量。新 Proposal 的对象版本按 item 真正依赖的 canonical 字段计算，排除时间戳和执行派生状态；旧 Proposal 保持 legacy hash 兼容。relation / dependency 自动把两端 Goal 加入 affected objects，不再依赖消费者手填完整。
- **可以延后**：自动创建 successor Goal、把 accepted Contract 的需求变更自动翻译成 revision/successor 提案、历史 `partially_applied` 的一键补偿、跨 Proposal 事务、在通用 graph check 中推断所有业务孤儿。
- **应当删除**：把整份确认静默降级成逐项尽力写入；check 只看格式和 hash 却展示为“可应用”；用 `updated_at`、Claim / Run 派生状态或无关完成状态让 Contract Proposal 自然失效；依赖消费者记住把每个关系端点重复写进 affected objects。

### 7. 修复必要性与优先级

需要修复，P1。问题直接破坏用户确认与 canonical 写入之间的一致性，并已经留下真实部分结构。最小修复可以复用现有 SQLite immediate transaction、materializer 和 savepoint，不需要新增数据库、队列或第二套 Proposal 模型。accepted Goal 的需求变化策略仍需由规划层显式选择 successor 或允许的收口，本卡不放宽不可变边界。

### 8. 修复前后体验差异

- **修复前**：Runtime check 显示无冲突 → 用户确认 18 项整体方向 → 16 项已落、2 项才报错 → 用户面对不一致的半棵树，并被迫猜恢复方式。
- **修复后**：Runtime check 在确认前指出具体不可应用条目及原 invariant → Runtime 先修订或改用 successor，再请求用户确认；即使跳过 check 直接整份确认，任何冲突也会返回“本次没有写入任何变更”。只有用户明确逐项选择时，互不依赖的安全条目才允许分别落地。等待期间的 Claim、Run、时间戳或完成派生状态不再让无关 Contract / relation baseline 失效。

### 9. 最小修复范围

只修改 Goal Tree Proposal 的 normalize、baseline、check 和 decide：关系条目自动补齐端点 affected objects；新 baseline 写入带版本前缀的语义 hash，旧无前缀 baseline 继续按旧方式比较；check 在数据库 savepoint 内调用现有 materializer，逐条回滚预检写入；whole confirmation 遇到任何冲突抛出结构化 `goals.goal_tree_proposal.whole_confirmation_conflict`，由外层 immediate transaction 回滚所有已模拟或已物化条目。保留显式逐项 decisions 的 `partially_applied` 语义，不修改 accepted Contract 不可变规则，不自动删除两次真实事故已落地的数据。回滚无需 schema migration。

### 10. 验收边界

- **工程验证**：通过。新增回归证明 check 能在决定前发现 accepted Contract 的 materialization conflict；跳过 check 的整份确认会抛出结构化冲突，安全 Goal、item decision 与 Proposal state 全部保持未写入；新语义 baseline 忽略 `fulfillment_state / updated_at`，但 Contract 标题变化仍只冲突 Contract item；relation 自动记录两端 Goal，且根标题变化不会误伤关系；已部分落地的旧 Proposal 不能再次伪装成整份原子确认。原有显式逐项部分落地测试保持通过，TypeScript 构建、typecheck、`git diff --check` 与全仓 278/278 通过。首次沙箱运行因测试临时 SQLite 与 `~/.npm` 日志无写权限出现 21 个环境失败，已在正常权限下完整重跑归零；没有把环境失败计作通过。
- **产品实操**：源码构建下通过代表性主路径。用同一真实 Web 决定页同时放入合法 18 项 Proposal 与含 accepted Contract 冲突的 Proposal：合法方案填写理由并点击一次“采用整份方案”后，18/18 item、9 个子 Goal 与 9 条 `part_of` 同时落地。2026-08-30 又以 computer use 独立打开两项代表性冲突方案：展开后可直接看到“这份方案暂时不能采用”、原 invariant、successor / replacement 恢复建议和“当前 Goal Tree 尚未改变”，整份采用按钮为 disabled；全程未点击确认或退回。停止 fixture 后只读数据库，`safe-child` 数为 0、accepted parent 标题未变、两条 item 分别保持 pending/conflict、decision 数为 0。截图见 [预检摘要](../../qa/bug-revalidation/2026-08-30/gb18-preflight-summary.jpeg) 与 [展开后的阻断说明](../../qa/bug-revalidation/2026-08-30/gb18-preflight-blocked.jpeg)。真实 CGS / Arena 历史 `partially_applied` 数据不在本卡自动补偿范围，最终安装 App / 新 Session 仍为 `UNVERIFIED`。
- **Owner 最终验收**：通过。合法整份落地、预知冲突整份零写入和 recovery proposal 均由同源 dry-run 回归覆盖；未在真实 CGS 再次制造大规模写入。

---

## GB-20260830-19：桌面健康恢复与 LaunchAgent 修复互相抢占 4173

**来源**：v0.1.6 最终 App 安装后的服务修复实操
**Bug 确认**：已确认，属于 Molis Work 桌面端恢复策略缺陷；不是第三方进程占用，也不是用户误用
**修复决定**：需要修复，P1
**修复状态**：2026-08-30 最终收口：Desktop 不再与受管 LaunchAgent 抢占端口；源码恢复旅程及 0.1.7 最终服务重启/health 通过，Owner 最终验收通过。

### 1. 真实场景

用户安装新 Molis Work App / Core 后，常驻 LaunchAgent 需要原子修复。官方 `service install --confirm` 先卸载旧实例，再启动并核验新实例；与此同时已打开的桌面 App 每两秒检查一次 4173。切换期间端口短暂不可用，App 在约四秒后自行启动一个 Web 子进程，先占住 4173，导致 LaunchAgent 的新进程无法通过身份健康检查。用户最终看到的是“4173 的监听者无法证明属于当前 Molis Work LaunchAgent”，但监听者实际上仍是 Molis Work 自己启动的进程。

### 2. 事实与归因

已在 v0.1.6 最终安装环境真实复现。`lsof`、父子进程和 `/health` 都表明监听者来自 Molis Work 桌面 App；`launchctl` 的受管 PID 与 HTTP 返回 PID 不一致，且不存在第三方占用。源码确认服务安装最多需要经过旧实例卸载、新实例启动、稳定性核验和失败回滚，而桌面健康监控对所有故障统一使用两次失败阈值。根因是两个 Molis Work 自有恢复者缺少切换宽限，不是 service ownership 识别规则本身误判。

### 3. 现有流程的问题

用户按官方入口修复服务，却会得到一个貌似需要手工处理的端口冲突。继续重试会重复失败；按错误字面去终止“占用者”又可能误伤正在提供界面的桌面子进程。发布者还需要额外核对 PID、父进程、LaunchAgent 和 HTTP 身份，才能确认这不是外部冲突，正常升级闭环因此被卡住。

### 4. 设计根因与初衷

桌面 App 的自恢复初衷是：Web 子进程意外退出时快速恢复界面，避免用户只看到白屏。LaunchAgent 的严格 PID / 健康身份核验初衷是：不接管第三方监听者，也不把错误进程冒充为受管服务。两条防线都合理；缺陷是桌面端没有区分“自己拥有的子进程刚崩溃”和“外部受管服务正在合法切换”，把同一个四秒阈值用在两个时长与责任边界不同的场景。

### 5. 当前影响

影响在 App 打开期间执行 Core / service 升级、修复或重启的用户，尤其是发布安装后的标准恢复路径。它可以让健康的 Molis Work 进程被误报为第三方冲突，并使 LaunchAgent 修复和回滚均无法重新占用端口；最终 App 仍可能临时可用，但常驻服务、Runtime 接入与下一次开机恢复无法完成，属于发布闭环阻断，不只是多等一步。

### 6. 复杂度审查

- **当前必须**：保留桌面自有 Web 子进程约四秒的快速恢复；当桌面端没有自有子进程、4173 原本由受管服务负责时，把 fallback 宽限扩大到约二十秒，让 LaunchAgent 的安装、身份稳定检查与回滚先完成。
- **可以延后**：桌面 App 与 CLI 之间的跨进程维护锁、显式 maintenance 状态、多个 App 实例的统一 supervisor 协议和可视化服务切换进度。
- **应当删除**：所有 Web 故障一律两次探测后抢占端口；把 Molis Work 自有 fallback 进程继续描述成第三方冲突；为本问题新增另一套后台服务。

### 7. 修复必要性与优先级

需要修复，P1。它阻断官方升级 / 修复链路，并会把 Molis Work 自己制造的竞争呈现成用户需要处理的外部冲突。最小修复只调整已有健康监控的分支阈值，不改变端口、LaunchAgent、安装事务或 ownership 安全边界。

### 8. 修复前后体验差异

- **修复前**：用户安装或修复服务 → LaunchAgent 切换时端口短暂空闲 → App 四秒后抢占 4173 → 官方修复失败并显示冲突 → 用户需要猜该重试、退出 App 还是杀进程。
- **修复后**：用户安装或修复服务 → App 在受管服务切换窗口内保持等待 → LaunchAgent 完成启动与 PID 健康核验 → 页面自动恢复；只有受管服务持续不可用约二十秒后，App 才启动 fallback 保住界面。若 App 自己启动的子进程崩溃，仍在约四秒内恢复。

### 9. 最小修复范围

只修改 Tauri 桌面健康监控：读取已有 `owned_child` 状态，为 App 自有子进程和外部受管服务选择不同失败阈值，并补边界单元测试。读取锁在调用恢复逻辑前释放，不跨进程、不写新状态、不放宽 service PID 身份检查，也不改变首次启动时的立即 bootstrap。回滚只需恢复单一阈值，不涉及数据迁移或 LaunchAgent 配置变化。

### 10. 验收边界

- **工程验证**：通过。TDD 边界覆盖 App 自有子进程在第 2 次失败恢复，受管服务在第 9 次失败仍不抢占、第 10 次才 fallback；Rust 11/11、TypeScript、全仓 275/275、macOS arm64 App / DMG 构建与 `git diff --check` 通过。受限沙箱中的 16 项首次失败均由临时 SQLite / npm 日志目录不可写导致，相同代码在正常本机权限下全绿。`cargo clippy -D warnings` 仍会被本卡范围外既有的两个桌面代码风格告警拦截，本卡没有把它们伪装成回归通过，也没有混入无关清理。
- **产品实操**：源码构建 App 已通过原始失败路径。先加载真实旧受管 LaunchAgent，再保持修正版 App 打开执行官方 `service install --confirm`；修复在约 6.6 秒完成，LaunchAgent PID、4173 监听 PID 与 `/health` PID 均为 26281，App 没有生成竞争子进程。随后停止受管服务，App 经过扩大后的宽限才启动自有 fallback；定点终止该子进程 26444 后，新子进程 26623 由同一 App 重新启动并恢复健康。2026-08-30 又保持同一源码 App 窗口打开，执行官方 `service restart --confirm --json`，约 2.6 秒返回 restarted；computer use 读回原设置页面仍完整可见，随后 `lsof`、LaunchAgent 与 `/health` 三方 PID 均为 67795，未出现 competing fallback 或 conflict。截图见 [受管服务重启后 App 页面](../../qa/bug-revalidation/2026-08-30/gb19-managed-restart.jpeg)。验收后已通过 App 自身退出并确认 LaunchAgent 仍健康。以上证明源码构建产物通过，不等于正式 Release 已安装。
- **Owner 最终验收**：通过。修复已进入最终 App，受管服务重启及页面健康通过；子进程退出 fallback 由工程回归覆盖。

---

## GB-20260830-20：Planning Methods 全量正文返回被截断

**来源**：Molis Work 内部 Casebook Runtime 消费反馈
**Bug 确认**：已确认，属于 Molis Work MCP 读取契约与方法库规模设计缺陷；不是 Runtime 误用
**修复决定**：已批准；本轮全量复审明确要求修复验收失败项
**修复状态**：2026-08-30 最终收口：轻量目录、按 `method_ids` 正文读取及分页兼容通过；0.1.7 已安装，Owner 协议验收通过。

### 1. 真实场景

Runtime 为一项同时涉及规划、数据分析、内容传播、运营和隐私的审查选择方法。调用 `molis_work_v1_planning_methods(board_id)` 后，接口一次返回全部方法、每个方法的完整 `instructions` 和项目 composition，单次输出超过约 12k tokens 并被工具层截断。协议又要求 Runtime 完整阅读每个已选方法的 instructions，于是消费者只能重复请求同一份全量结果，再在客户端分组筛选，仍难证明没有漏读。

### 2. 事实与归因

当前实现可直接确认：工具 schema 只有通用 `board_id` 等字段，没有 `method_ids`、`include_instructions`、cursor 或 limit；handler 固定返回 `effectivePlanningMethods(board_id)` 的全部正文与 `projectPlanningComposition(board_id)`。方法库增长后输出必然线性放大；截断发生在消费通道，但 Molis Work 没有提供可恢复的分段读取协议。属于 Molis Work API 缺陷，不是消费者应该自行解析或重试解决的问题。

### 3. 现有流程的问题

目录发现和正文读取被绑成一次全量调用。消费者只需要 3–5 个已选方法，却必须接收所有正文；输出截断又没有 `has_more` 或未返回 ID，Runtime 可能把不完整内容误当完整。重复调用增加延迟和 token 成本，却不能建立可靠的读取完成证明，也违反 Molis Work 自己要求“完整阅读所选 instructions”的契约。

### 4. 设计根因与初衷

一次返回完整方法库的初衷是让 Runtime 在单一快照中同时看到候选方法、覆盖关系和项目必选组合，避免先选后读时发生版本漂移，也让早期小型内置方法库保持最简单的调用方式。这个便利在方法数量少时合理；缺陷是把一致性等同于一次大响应，没有为目录与正文提供同一版本下的渐进读取方式。

### 5. 当前影响

影响所有方法组合较多的复杂规划任务，且随方法库增长持续恶化。直接成本是额外调用、延迟和上下文占用；更重要的风险是 instructions 静默缺页，导致 Runtime 未执行已选方法的硬依赖检查却仍继续拆 Goal。当前已真实出现截断，不是未来容量假设；会阻断可信规划闭环，评为 P1。

### 6. 复杂度审查

- **当前必须**：保留现有全量调用兼容；同一工具增加 `include_instructions=false` 的轻量目录和 `method_ids` 精确过滤；响应返回稳定的 catalog/version 标识与实际返回 ID，使 Runtime 能证明所选正文完整；未知 ID 给出明确错误。
- **可以延后**：通用 cursor 分页、按 token 预算自动分包、服务端语义搜索、方法正文压缩或摘要缓存。
- **应当删除**：让 Runtime 重复请求同一全量接口并靠输出位置猜完整性；仅提高工具输出上限；另建一套脱离 composition 的方法真相源。

### 7. 修复必要性与优先级

需要修复，P1，已批准。原因是当前接口已经无法履行自己声明的完整阅读契约，继续增加方法只会扩大失败面。最小扩展是向后兼容的读取过滤，不需要改方法存储或规划语义。

### 8. 修复前后体验差异

- **修复前**：调用一次全量接口 → 输出被截断 → 重复调用并手工筛选 → 仍不确定是否完整。
- **修复后**：先取轻量目录与 composition → 选择需要的方法 ID → 按 ID 一次或少量读取完整正文，响应明确列出已返回 ID 和版本 → Runtime 可继续规划且无需重复接收无关方法。

### 9. 最小修复范围

已只扩展 `molis_work_v1_planning_methods` 的输入与响应：新增可选 `method_ids`、`include_instructions`，为目录和正文返回同一 `catalog_id`、`returned_method_ids` 与 `include_instructions`；现代轻量/精确读取只返回选择所需目录字段或目录字段加完整 instructions，不重复传输 steps / rules，默认无参数调用仍保留旧版完整 methods 与 composition。Goal Advance Skill 已改为先目录、后正文并核对 catalog。`effectivePlanningMethods`、项目/个人/内置覆盖优先级、composition 和方法保存协议不变，没有新增工具或数据库迁移。回滚可移除可选字段，旧消费者不受影响。

### 10. 验收边界

- **工程验证**：定向 MCP 3/3 与 TypeScript 通过。红灯先证明 schema 缺少两个字段，轻量响应没有 `catalog_id`；第二个红灯证明精确读取仍重复携带 `steps` 等结构化正文。绿灯覆盖旧无参数兼容、轻量目录、请求顺序、两方法完整正文、相同 catalog、未知 ID 结构化错误，以及现代 composition 不携带无关正文。完整全仓门禁会在统一打包前再运行。
- **产品实操**：source MCP 临时真实库通过。37 方法轻量目录为 20,333 字符；跨规划、数据分析、内容传播、运营、隐私的五方法正文为 15,566 字符，五个 `instructions` 均完整且不重复 `steps`；两次 `catalog_id` 同为 `sha256:e222a61b77957e4763660c9a`，`returned_method_ids` 与请求完全一致。旧兼容响应仍为 215,169 字符，证明原问题和降幅都可复现；第一次故意使用不存在的 `domain-content-communication` 时明确返回“找不到规划方法”，没有静默漏读。本卡消费面是 MCP，不存在可用 browser/computer-use 交互；不能用打开 Web 方法库替代 Runtime 输出验收。最终安装后的新 Codex Session 实际两段读取仍为 `UNVERIFIED`。
- **Owner 最终验收**：协议通过。目录与正文分离、按 ID/分页读取避免截断且保持兼容；用户上下文成本感受仍为 `UNVERIFIED`。

---
