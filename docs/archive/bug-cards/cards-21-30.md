# 0.1.x Bug 卡：21–30

状态：历史记录，截至 2026-08-31。卡片中的状态、流程、路径与验收属于当时版本，不是当前待办或操作指令。

[台账入口](../../molis-work-bug-cards.md) · [历史总览](overview.md) · [历史复审](review-2026-08-30.md)

## 本册目录

- [GB-20260830-21：大型项目内 Evidence 因不可全文打开而无法登记](#gb-20260830-21大型项目内-evidence-因不可全文打开而无法登记)
- [GB-20260830-22：Legacy Rewire 可统一读取但不能用同一 handle 决定](#gb-20260830-22legacy-rewire-可统一读取但不能用同一-handle-决定)
- [GB-20260830-23：Available 默认展开全部 Contract 导致输出截断](#gb-20260830-23available-默认展开全部-contract-导致输出截断)
- [GB-20260830-24：对话已完成人工验收，Inbox 仍要求重复填写且深链找不到表单](#gb-20260830-24对话已完成人工验收inbox-仍要求重复填写且深链找不到表单)
- [GB-20260830-25：范围纠偏后历史 Run blocker 仍像当前有效阻塞](#gb-20260830-25范围纠偏后历史-run-blocker-仍像当前有效阻塞)
- [GB-20260830-26：大型 Proposal 预检漏掉不可变与唯一约束，决定后才部分失败](#gb-20260830-26大型-proposal-预检漏掉不可变与唯一约束决定后才部分失败)
- [GB-20260830-27：Completion Risk 作用域不明且错误阻止 executor 返工](#gb-20260830-27completion-risk-作用域不明且错误阻止-executor-返工)
- [GB-20260830-28：Compaction 后续租只有 claim_id，无法从 context 得到正确 actor](#gb-20260830-28compaction-后续租只有-claim_id无法从-context-得到正确-actor)
- [GB-20260830-29：Draft 每轮写入与恢复都返回完整历史，长对话输出被截断](#gb-20260830-29draft-每轮写入与恢复都返回完整历史长对话输出被截断)
- [GB-20260830-30：Contract Proposal 缺字段时抛出 undefined.trim 裸异常](#gb-20260830-30contract-proposal-缺字段时抛出-undefinedtrim-裸异常)

## GB-20260830-21：大型项目内 Evidence 因不可全文打开而无法登记

**来源**：CGS G2D 真实证据采集反馈；2026-08-30 同一路径、同一约 1.5 MB JSON ledger 再次被独立消费者调用复现
**Bug 确认**：已确认，属于 Molis Work Evidence locator 预检与 Evidence 登记耦合缺陷；不是文件无效或 CGS 误用
**修复决定**：已批准；本轮全量复审明确要求修复验收失败项
**修复状态**：2026-08-30 最终收口：大文件可登记 locator+digest 并标记 preview unavailable，不再因不可全文打开拒绝 Evidence；真实 CGS ledger 副本与 0.1.7 构建通过，Owner 最终验收通过。

### 1. 真实场景

CGS G2D 向 criterion `cgs-g2d-real-retrieval` 提交 `project://data/research/g2d-research-runs.json`。文件约 1.5 MB，包含真实搜索的 query、receipt、材料、来源家族、预算和 coverage gap，调用同时提供 SHA-256 digest。`molis_work_v1_evidence_submit` 因“项目内引用文件过大，不能在 Molis Work 中打开”直接失败，连 Evidence locator、digest 和降级状态都没有留下。

### 2. 事实与归因

可由当前源码稳定复现。`MAX_PROJECT_REFERENCE_BYTES` 固定为 512 KiB；`validateEvidenceLocator` 对项目内 locator 直接调用 `readProjectReference`，该函数在读取内容前发现超限就抛出 413；Coordinator 把异常提升为整个 Evidence 提交失败。输入中的 digest 只在验证之后写入记录，不能改变预检路径。2026-08-30 第二次消费者反馈仍以相同 G2D ledger、项目内 locator 和 digest 得到同一拒绝，说明不是一次性参数错误。文件确实位于项目内且格式/内容是否适合作为验收证据是另一层判断，因此主要归因是 Molis Work 协议缺陷，不是 CGS 提交方式错误。

### 3. 现有流程的问题

“是否能在 Web 中全文打开”被当成了“是否允许登记 Evidence”的前置条件。真实研究 ledger、构建日志和测试产物天然可能超过展示上限；消费者即使有稳定路径和 digest，也无法建立审计引用，只能另写小文档并丢失原始产物的直接关联。错误没有说明 512 KiB 上限、digest 是否被检查，也没有给 sidecar summary 的规范做法。

### 4. 设计根因与初衷

512 KiB 限制原本保护 Web 和 Runtime 不会把超大文件一次读入内存、避免二进制或日志拖垮页面，并让 Markdown anchor 校验保持有界。这一打开/预览边界合理。缺陷是 locator 验证复用了完整读取函数，没有把“路径在项目内且文件存在”“内容可全文预检”“Evidence 可登记”拆成不同能力层级。

### 5. 当前影响

直接影响研究 ledger、测试日志、构建产物、抓取结果等常见大文件；文件越真实、记录越完整，越容易被拒绝。它会阻断 Evidence 创建和后续 Review 引用，不只是显示不便。当前 CGS 已被迫改用小型审查文档并提交 inconclusive，随后同一主线又再次遇到同样拒绝，说明这是会重复出现的执行摩擦，已影响真实闭环，评为 P1。

### 6. 复杂度审查

- **当前必须**：继续校验 realpath、项目边界、普通文件和 symlink 逃逸；超出打开上限时仍创建 Evidence，保留规范 locator、digest、文件大小和检查时间，使用现有 `unverified` 状态明确“路径已确认，但内容未全文预检”；reason 返回 512 KiB 上限与 sidecar summary 建议；Web 禁止全文打开超限文件。
- **可以延后**：流式计算并比对 digest、新的 `metadata_verified` 枚举、分段预览、对象存储、大文件采样或压缩摘要生成。
- **应当删除**：因为无法全文打开就拒绝整条 Evidence；把调用方提供 digest 描述成已验证；简单提高全局内存读取上限。

### 7. 修复必要性与优先级

需要修复，P1，已批准。当前行为阻断合法证据链，且最小修复复用了现有 `unverified` 状态，没有扩展状态机或引入存储服务。

### 8. 修复前后体验差异

- **修复前**：提交 1.5 MB 项目内 ledger + digest → 整次 Evidence 创建失败 → 另写小文档并失去原始产物直接引用。
- **修复后**：提交同一 locator + digest → Molis Work 确认路径/边界并创建 Evidence，明确标注“文件超过 512 KiB，内容未全文预检，digest 仅记录” → 用户可补 sidecar summary，Review 同时引用摘要与原始产物。

### 9. 最小修复范围

已只拆分项目引用的 metadata 检查与有限内容读取：locator 校验先确认 realpath、项目范围、普通文件和字节大小；超限时构造 `unverified` 结果而非抛错，Evidence 按现有 schema 保存 locator、digest、检查时间和明确 reason。MCP / Skill 补上 512 KiB 上限、digest 只记录不核验和 sidecar 建议；Web 对这类 locator 显示复制按钮而不是可打开链接，带 Evidence 访问返回 409，原始打开仍返回带上限的 413。项目外路径、symlink 逃逸、目录、缺失文件与可读取文件中的错误 anchor 仍拒绝。没有 schema migration；回滚可恢复超限拒绝。

### 10. 验收边界

- **工程验证**：定向 V1 / Web 2/2 与 TypeScript 通过。红灯证明 512 KiB + 1 字节仍在 coordinator 与 Web 整条失败；绿灯覆盖带 digest 大文件登记、超限 anchor 降级、原 verified / repo / anchor / missing / outside / symlink / opaque 行为不回归、Web 不生成预览链接、Evidence 访问 409 和原始大文件打开 413。二进制文件仍沿用既有文本预览边界，本卡没有扩大到任意二进制内容验证；完整全仓门禁会在统一打包前再运行。
- **产品实操**：通过源码代表性真实路径。实际读取 CGS `~/adeptify-home/repos/Content Growth Studio/data/research/g2d-research-runs.json`，文件为 1,685,981 字节，SHA-256 为 `b9bea3bfd0beebf0466841d6aa3f8cb48d5023e3d37feeb99ae70c062855eb0e`；只在临时 Molis Work 库中以原 `project://data/research/g2d-research-runs.json` 和 digest 提交，CGS 文件未修改。computer use 打开记录页后可见“当前有效 / UNVERIFIED”、真实大小、512 KiB 上限、“内容未全文预检”“digest 未核验”和 sidecar 建议；locator 是“复制引用”按钮而非打开链接。带 Evidence 打开返回 409，直接打开返回 413。截图见 [真实 CGS 大文件 Evidence](../../qa/bug-revalidation/2026-08-30/gb21-large-evidence-unverified.jpeg)。最终安装后的真实 Runtime submit 仍为 `UNVERIFIED`。
- **Owner 最终验收**：通过。存在/路径安全、digest 登记与内容全文验证三层状态已分离；用户对措辞的理解仍为 `UNVERIFIED`。

---

## GB-20260830-22：Legacy Rewire 可统一读取但不能用同一 handle 决定

**来源**：CGS legacy Rewire 恢复与确认反馈
**Bug 确认**：已确认，属于 Molis Work 兼容视图与决定 API 不可组合缺陷；不是用户确认不足或 Runtime 参数误用
**修复决定**：用户已批准处理本轮全部已确认缺陷
**修复状态**：2026-08-30 最终收口：Legacy Rewire/Contract 的 raw 与 synthetic handle 可组合 read/check/decide，native 等价变更会 supersede legacy 双真相；0.1.7 已安装，Owner 协议验收通过。

### 1. 真实场景

CGS Runtime 用 `molis_work_v1_goal_tree_read(include_legacy=true, proposal_id="legacy-rewire:rewire-e41a…")` 读取到一份 pending Proposal 和 item `legacy-rewire-item:rewire-e41a…`。用户在当前会话明确确认整项变更；Runtime 把 read 返回的 proposal_id/item_id 原样交给 `molis_work_v1_goal_tree_decide`，却得到“找不到 Goal Tree 提案”，无法完成已经授权的决定。

主线随后只能在正在进行的 clarifier Run 中创建内容相同的 native Proposal `goal-tree-proposal-3147c171-f6cb-476a-94ac-dc1f471abfda`。用户确认后，两条 canonical relation 已成功 deactivated，native items 均为 applied，graph check 无问题；但原 Rewire `rewire-e41a7654-003c-4dbf-8936-1a7d63a68e6a` 仍显示 `state=pending / proposed_changes_applied=false`。同一个逻辑变更因此在 canonical graph 中已经生效，在 legacy 视图中却仍待确认。

### 2. 事实与归因

当前源码可以直接解释第一段结果。`listGoalTreeProposals` 把 native 表和 `legacyGoalTreeProposalView(snapshot)` 合并；后者为 Contract Proposal、Candidate 和 Rewire 生成 `legacy-*` proposal_id/item_id。`decideGoalTreeProposal` 随后固定调用 `readNativeGoalTreeProposal`，只查询 native proposal 表，因此所有 synthetic legacy handle 都不可能命中。Rewire 另有 `molis_work_v1_rewire_confirm`，但统一 read 结果没有正式返回该 canonical decision route。后续复现又证明 native materialization 与 legacy lifecycle 没有 supersession/reconciliation：canonical relation 已达到 Rewire 所请求的目标状态，legacy 对象仍不会被标记 applied 或 superseded。属于 Molis Work API 与兼容状态投影缺陷，不是消费者应靠源码猜另一工具，也不是 graph check 失败。

### 3. 现有流程的问题

同一命名空间把对象呈现为 pending、requires_user_confirmation，且暴露了 proposal_id/item_id，却不能把这些 handle 用于配套 decide。消费者已经获得用户确认后仍要猜 dedicated legacy 工具、重新组织参数，或创建重复 native Proposal；即使绕路成功，legacy pending 状态也不会随 canonical 结果收敛。错误只说“找不到”，没有返回 `rewire_confirm` 和原 rewire_id；Contract 又继续暴露旧待办，形成两套相互矛盾的真相。

### 4. 设计根因与初衷

统一 read 的初衷是让新客户端无损查看历史 Contract Proposal、Candidate 和 Rewire，而不迁移或重写旧事实；决定写入继续走各自成熟的 legacy handler，避免一次性改变权限和 materialization 语义。这个兼容策略合理。缺陷是只统一了读模型和 ID 外观，没有统一命令路由或显式暴露替代 handle，违反 API 可组合性。

### 5. 当前影响

当前已阻断真实 CGS Rewire 决定；绕路后 canonical graph 虽已正确更新，legacy pending 又会让用户或 Runtime 误以为仍有未处理提案，可能重复确认、重复 materialize，或继续阻断 Goal completion。相同结构也存在于 legacy Contract Proposal 和 Candidate 的 synthetic view，应一并核查，不能只修当前 ID。它直接影响历史任务恢复、完成判定和审计连续性，评为 P1。

2026-08-30 Arena 进一步证明兼容入口仍未闭环：`goal_tree_read(root_goal_id=...)` 能返回 synthetic Contract Proposal，但以原始 Contract Proposal ID 直接读取为空；`goal_tree_check` 对原始 ID 和 synthetic ID 都报 not found。根因是读取过滤只比较 synthetic ID，而预检固定只查 native 表。该证据将本卡重开并提升为阻塞 Arena 的 P0，而不是另建重复卡。

### 6. 复杂度审查

- **当前必须**：read 返回的 pending legacy handle 必须有确定可执行路径；优先让 `goal_tree_decide` 按 origin/prefix 安全分派到既有 legacy decision handler，保留同一用户 authority、reason 和 idempotency；若同一变更已由 native Proposal materialize，则 legacy 对象必须可审计地标记 `superseded` 或 `applied`，并记录替代它的 proposal_id，不能继续作为 pending gate。若某类暂不能统一决定，read 必须返回结构化 `decision_route`、canonical object ID 和 next action，且 decide 错误也带同样恢复信息。
- **可以延后**：把所有历史记录迁移成 native Proposal、跨 legacy 类型的整份原子确认、统一历史 revision、删除 dedicated legacy tools。
- **应当删除**：暴露看似 canonical 但不可写的 synthetic ID；让 Runtime 解析字符串前缀猜工具；为同一 Rewire 再创建一个重复 native Proposal。

### 7. 修复必要性与优先级

已修复，P1。问题已阻断明确授权的真实决定，且修复复用现有 handler，不迁移历史数据或放宽权限边界。

### 8. 修复前后体验差异

- **修复前**：统一 read 得到 pending legacy Proposal → 用户确认 → 同一 handle decide 报 not found → Runtime 猜入口或创建重复 native Proposal → canonical 已生效但 legacy 仍 pending。
- **修复后**：统一 read 得到 pending Proposal 与明确 decision route → 用户确认 → 同一 `goal_tree_decide` handle 直接安全分派并返回更新后的统一视图；若等价 native Proposal 已先落地，legacy 视图明确显示由哪个 Proposal 替代，不再产生第二个待确认入口。

### 9. 最小修复范围

已在 `decideGoalTreeProposal` 读取 native 前识别受支持的 legacy origin，将单项 confirm/reject 映射到现有 Contract/Candidate/Rewire 决定函数；复用其校验、事件和 materialization，不复制 SQL。native relation materialization 后只对“纯关系、变更集合完全相同、canonical 状态已满足”的 pending Rewire 写入带来源 proposal_id 的 applied/supersession 记录，反方向或含额外 Risk/Impact 的 Rewire 不误关闭。针对 Arena 新证据，统一 read 现在同时接受历史原始 ID 与 synthetic ID，并始终返回 synthetic decision handle；legacy Contract check 使用与 decide 相同的 shape、Draft、Contract 与 dependency 校验，冲突只投影在检查响应中，不改 canonical Contract。MCP 说明明确 raw/synthetic 的可组合路径。没有做全量历史迁移、跨 legacy 类型多项 whole confirmation或删除旧工具。

### 10. 验收边界

- **工程验证**：源码定向验证通过。V1 回归覆盖 legacy Contract confirm、Candidate reject、Rewire confirm、同键幂等重放，以及 native 等价 deactivation 精确 supersede、反方向 Rewire 保持 pending；新增红灯证明原始 Contract Proposal ID 读不到且 raw/synthetic check 都落到 native not found，绿灯覆盖两种 ID 统一返回 synthetic handle 并运行 Contract 决策预检。MCP 声明明确 raw/synthetic read-check-decide 关系；TypeScript 与本轮定向 3/3 通过。全仓回归仍留到统一打包前运行。
- **产品实操**：源码产品实操通过。临时 Board 先由源码 Web 显示“Goal 关系 1 / 1 项待处理”；management MCP 先用 `goal_tree_read` 读取 `legacy-rewire:*` 与 `legacy-rewire-item:*`，再把同一 handle 交给 `goal_tree_decide`，读回 `approved / applied / proposed_changes_applied=true`；相同 idempotency key 重放返回 `replayed=true`。SQLite readback 只有 1 条 active relation 和 1 个 `rewire.applied` event。computer use 刷新 Decision Center 后显示“0 项待处理”，最近结果为“Goal 关系 已应用”，并可打开双方 Goal 的同一 relation。针对 Arena 新缺口，隔离的 Draft + legacy Contract fixture 已用 raw ID 预检为零冲突并返回 synthetic handle；computer use 在源码 Decision Center 看到 1 项待处理“目标说明”，展开后能读到确认/退回后果、Contract 影响、理由输入和确认按钮，未点击决定。截图：`docs/qa/bug-revalidation/2026-08-30/gb22-legacy-rewire-pending.jpeg`、`gb22-legacy-rewire-applied.jpeg`。没有写真实 CGS 或 Arena；环境策略不允许复制 Arena SQLite，因此真实对象留给安装后的官方 MCP。
- **Owner 最终验收**：通过协议与安装交付；不再对真实 CGS 历史 Rewire重复决定。Arena 原 proposal 的新 Session 只读复验仍为 `UNVERIFIED`。

---

## GB-20260830-23：Available 默认展开全部 Contract 导致输出截断

**来源**：CGS 主线消费者反馈
**Bug 确认**：已确认，属于 Molis Work MCP 默认读取粒度缺陷；CGS Contract 体量是触发条件，不是错误归因
**修复决定**：已纳入用户要求的全量修复
**修复状态**：2026-08-30 最终收口：Available 默认 summary，full 需显式请求；最终安装 MCP schema 与真实 CGS 副本协议实操通过，Owner 最终验收通过。

### 1. 真实场景

Runtime 在 CGS 项目调用 `molis_work_v1_available` 选择下一项。项目同时存在多个 executor / clarifier Goal；消费者此时只需要 ID、标题、角色、下一动作、优先级和阻塞摘要，却收到每个 Goal 的完整 Contract、验收条件、风险、策略和规划信息，报告输出约 12.6k tokens 且后半段被截断。

### 2. 事实与归因

已独立复现。Owner 通过 SQLite online backup 把真实 CGS Board 复制到临时目录，再用当前源码只读调用 `queryAvailable`：8 个 available、2 个 blocked，完整 JSON 为 28,595 字符；8 个 available 条目本身占 22,879 字符，单条 2,561–3,317 字符。默认 MCP 没有 compact、limit、cursor 或 detail 参数，handler 原样返回 Coordinator 的完整 `GoalRecord`、验收条件、Policy、Surface 和 planning。消费者报告约 12.6k tokens 且被截断，与该规模一致。归因是 Molis Work MCP 默认读取粒度缺陷；CGS 只是正常规模的真实触发样本。

### 3. 现有流程的问题

若反馈属实，Runtime 为“先选哪个 Goal”接收了选中后才需要的完整资料；无关条目占满输出，后半段选择依据反而不可见。消费者需要重复请求、提前限制候选或靠截断前内容做决定，都会增加调用和误选风险。

### 4. 设计根因与初衷

根因是 Available 早期追求一次返回足够上下文，让 Runtime 不必为每个候选再读 Contract，并保证选择依据来自同一快照。这个初衷在候选少、Contract 小时可减少往返；CGS 的真实响应已经证明“一次自足”反而破坏“完整可比较”。Coordinator 的全量结果仍适合 Web；缺陷在 MCP 没有按“先选择、后读 Contract”的消费阶段投影响应。

### 5. 当前影响

已真实影响 CGS 的下一项选择：每次推进都重复传输 28k+ 字符，后半段可能被宿主截断；`blocked` 和 `parallel_suggestion` 位于响应尾部，存在被截断而遗漏的结构性风险。尚无实际误选证据，但高频延迟、上下文成本和选择依据缺页已成立，属于 P1 流程摩擦。

### 6. 复杂度审查

- **当前必须**：MCP 默认只返回选择所需摘要，保留 goal_id、title、角色、动作、优先级、依赖/Risk 摘要、阻塞原因和 parallel suggestion；提供显式 full 模式给兼容消费者，选中后继续用 Contract 读取详情。
- **可以延后**：通用 cursor 分页、按 token 预算自动切页、服务端排序策略定制、跨调用快照租约。
- **应当删除**：未复现前直接新增第二套 Available 工具；只提高输出上限；让 Runtime 靠截断位置或源码猜遗漏内容。

### 7. 修复必要性与优先级

需要修复，P1。默认调用已经在正常规模 CGS 中超过安全消费规模；该操作是每轮推进入口，输出截断会同时增加成本与遗漏关键尾部信号。修复只做响应投影，不改状态机、排序或数据。

### 8. 修复前后体验差异

- **修复前**：请求候选 → 收到所有候选完整 Contract → 输出截断 → 无法完整比较或需要重复读取。
- **修复后**：请求候选 → 默认得到全部可比较的紧凑条目、blocked 与 parallel suggestion → 选中后再按 ID 读 Contract；确需一次展开时显式传 `detail_level=full`。

### 9. 最小修复范围

只修改 MCP `molis_work_v1_available` 的 schema、handler 响应投影、Runtime Skill 和测试：默认 `detail_level=summary`，仅返回 Goal ID/title、role、work state、next action、priority、依赖/Risk、required capabilities、planning、blocked reasons 与 parallel suggestion；显式 `detail_level=full` 返回既有完整结构。摘要 JSON 不再为 Agent 输出保留无价值缩进。Coordinator、Web、CLI、Goal 排序、可用性推导、Contract 内容和状态机都不改。回滚只需恢复 MCP handler 原样返回，不涉及数据库迁移。

### 10. 验收边界

- **工程验证**：通过（源码）。TDD 红灯先确认默认响应没有 `detail_level` 且仍展开 Contract；绿灯后 TypeScript 与完整 V1/MCP 126/126。回归覆盖 summary schema、full 兼容、完整候选计数、blocked `goal.replaced` facts、parallel suggestion、非法 detail level 的结构化 allowed values，以及 summary 不含 acceptance criteria/Policy/Impact、full 仍含全部旧字段。
- **产品实操**：通过（真实 CGS 数据安全副本，源码 MCP）。同一 Board、同一 cursor 读取：`full=45,020` 字符，默认 `summary=7,281` 字符，下降 83.8%；8/8 available 与 3/3 blocked 均完整返回，blocked 分别保留 `risk.blocks_completion`、`goal.replaced`、`review.user_approval_required`，parallel suggestion 明确为 null。摘要 Goal 只有 ID/title，条目仍含动作、priority、依赖/Risk、capabilities 与 planning；随后对首项调用 `molis_work_v1_contract`，读回同一 Goal、2 条验收条件、完整 Policy，证明详情只是后置读取而非丢失。消费面是 MCP 响应，协议实操比 computer use 转录页更直接；最终安装后的新 Session 仍为 `UNVERIFIED`。
- **Owner 最终验收**：通过。最终安装 schema 与真实 CGS 副本证明 summary 默认、full 可回退；用户对上下文成本的感受仍为 `UNVERIFIED`。

---

## GB-20260830-24：对话已完成人工验收，Inbox 仍要求重复填写且深链找不到表单

**来源**：CGS `cgs-g4a-platform-metric-semantics` 真人验收反馈
**Bug 确认**：已确认，包含 Molis Work Decision 深链可达性缺陷、Runtime Review 与人工验收标签混淆，以及同一对话真人验收交接缺口；不把 `human_verdict` Evidence 本身等同于 canonical human approval
**修复决定**：来源任务已明确要求独立诊断、修复并验证；已授权处理
**修复状态**：最终交付已闭环。0.1.10 最终安装 App 的真实 CGS/G4A 旅程中，“处理 1 项决定”深链自动选中目标 Inbox 项、滚入并展开人类验收表单，结论、原话、对话来源、Evidence 与理由均已预填；未自动提交或写入人类 Review。工程、产品实操与 Owner 验收通过，用户本人最终提交仍保留为人工动作

**2026-08-30 续修进展**：用户已明确要求继续 GB24。当前按真实导航链重新核对“Goal 页生成 href → 浏览器保留 hash → Decision 页面目标卡是否进入 DOM → 初次 reveal/scroll → 后续渲染是否覆盖”的完整时序；先补能在旧实现上稳定失败的行为回归，再做最小修复。历史 GB01–GB34 的第三方成立性复审保留在本文末尾，不因本次续修重跑。

**2026-08-30 最终收口**：根因是 Goal 页仍输出旧的 `#decision-goal-<goal_id>` handle，而当前 Decision Center 已迁移为 Feed/Inbox：列表项使用 `decision:<goal_id>`，详情通过 `data-feed-detail` 控制显隐，页面却仍只用 `document.getElementById(hash)` 查找旧 DOM id。旧实现因此稳定选中最新的 `decision:board`，目标 Goal 详情保持隐藏。第一版补丁给新详情补回旧 id，虽能选中目标，却又触发浏览器原生锚点在应用滚动后把页面拉回卡片顶部；computer-use 零状态复验发现后撤回。最终实现改为由应用解析 legacy hash、映射 Inbox item、清除会遮住目标的筛选、选中对应详情，并把滚动目标定位到实际决定表单；不再依赖原生锚点滚动。

**2026-08-30 审查补充**：独立代码、测试与维护性审查发现，第一版最终实现只覆盖“目标 Decision 详情已在 DOM、桌面/桌面壳初次加载”的路径；若用户先切到 Feed，Decision 详情会被工作台卸载，同步 hash resolver 会返回空；移动端还可能恢复到目录视图；自动化也没有断言表单真实进入可视区，无 Chrome 时会静默略过。以上均归入 GB24 同一深链旅程继续修复，未另建 Case。现已改为在缺少详情时先切回 Inbox 并等待工作台重新加载，再解析目标；移动端强制进入决定文档视图；表单进入视区后获得可访问焦点。回归覆盖初次打开、Feed 切换后 hashchange、筛选清理和移动端恢复，且无 Chrome 时显式 skip，不再假绿。

### 1. 真实场景

用户在当前 Codex 对话中审阅 CGS V0.2 后明确回复“没问题了”。Runtime 正确把原话保存为 `human_verdict` Evidence，也没有冒充 `human_approver`。但 canonical Goal 仍为 `waiting_for_human / review.user_approval_required`。用户从 Goal 页点击“处理 1 项决定”，或打开带 `#decision-goal-cgs-g4a-platform-metric-semantics` 的 Inbox 深链后，最新版 Feed/Inbox 默认停在更新的项目级事项，目标 G4A 详情保持隐藏，人工结论、Evidence 和提交按钮都不可见；即使手工找到卡片，还要确认系统是否已采用对话原话。

### 2. 事实与归因

消费者已提供精确 Goal、canonical 状态和深链，且“Runtime 保存原话但没有人类权限”符合安全边界。2026-08-30 Owner 先通过 computer use 在最终安装 App 独立复现，再以测试 fixture 制造一个比目标 Goal 更新的项目级 Risk：旧源码打开目标 hash 后，浏览器实际选中 `decision:board`，而非 `decision:POLICY-WEB`。源码核对证实 legacy hash 和新版 `data-feed-detail="decision:<goal_id>"` 之间没有映射；这是一条确定可复现的 Molis Work 导航缺陷，不是 CGS 接入、旧 Session 或用户误用。

### 3. 现有流程的问题

用户已在对话完成一次明确判断，却被迫在另一页面重复表达同一结论、证据和理由；导航还没有把人送到实际表单。页面又用“已通过”描述 Runtime 自审结果，使用户无法判断是目标已经验收、只完成工程复核，还是仍需本人操作。真正必要的“一次明确的人类确认”被三个无价值动作包裹：找折叠卡、重选 Evidence、重写原话。

### 4. 设计根因与初衷

原设计把 Runtime Evidence、Runtime Review 和 `human_approver` Review 严格分开，避免 Agent 把转述、猜测或自审结论冒充用户授权；Web 表单要求显式选择、理由和 Evidence，也是为了留下可审计决定。这些边界必须保留。交接侧缺陷是系统原先没有定义“同一对话已经发生的真人判断如何安全预填并只确认一次”；导航侧缺陷来自 Decision Center 从独立卡片迁移到 Feed/Inbox 后仍保留旧 hash 契约，却没有同步 hash → Inbox selection 的兼容层，测试又只检查了 reveal 代码字符串和旧 DOM 结构。

### 5. 当前影响

影响所有在 Codex 对话中完成真人验收、但 canonical approval 仍要求 Web 决定的 Goal。它直接增加重复输入并隐藏必要入口，可能让用户以为已经验收而离开，也可能让 Runtime反复提醒或重新创建 Review。最新事实表明它不仅阻断 G4A 自身闭环，还沿依赖关系阻断新版 KOL schema 与 9 个平台子 Goal，使已完成的真实研究无法进入合法 Run/Evidence 链；优先级因此由 P1 升为 P0。

### 6. 复杂度审查

- **当前必须**：深链命中 Decision 时自动展开并滚动到目标卡；历史结果按 reviewer role 区分“Runtime 复核通过”和“用户验收通过”；当存在带当前对话审计来源的明确 `human_verdict` Evidence 时，人工表单预填结论、理由和相关 Evidence，用户只做一次清晰确认；最终记录保留用户原话、会话/消息来源、Evidence、操作者和时间。
- **可以延后**：跨设备签名、通用对话授权服务、任意聊天平台自动批准、批量真人验收。
- **应当删除**：把 Runtime self-verifier 的 pass 写成无角色的“结果确认：已通过”；让用户从深链后手工寻找折叠卡；要求重抄已有且可追溯的原话。

### 7. 修复必要性与优先级

需要修复，P0，已授权。它既影响完成闭环，也可能错误表达用户是否已经验收，并已沿依赖链阻断新版 KOL 子树合法执行。最小修复不放宽人类权限：Runtime 只提交可审计的验收建议/原话，最终 canonical human approval 仍由一次明确用户动作完成。

### 8. 修复前后体验差异

- **修复前**：用户在对话说“没问题了” → Runtime 保存 Evidence → Goal 仍待人工 → 深链进入折叠 Inbox → 用户找卡、重选通过、重勾 Evidence、重写理由 → 提交。
- **修复后**：用户在对话说“没问题了” → Runtime 保存带会话来源的 `human_verdict` → 深链直接展开并定位目标验收卡，预填原结论、原话和可用 Evidence → 用户核对后一次确认 → canonical human approval 与页面状态同步；若审计来源不足则不预填为已批准，只提示仍需用户判断。

### 9. 最小修复范围

复用现有 Evidence、Review obligation、Feed/Inbox 选择器和 Web Decision 表单：保留 Goal 页原有 URL 契约，由客户端把 `decision-goal-<goal_id>` 映射成 `decision:<goal_id>`，必要时清除会隐藏目标的 Inbox 筛选，选中详情并滚到第一项真实决定表单；继续使用已实现的 reviewer-role 标签和受约束 `human_verdict` 预填资格（同一 Goal、当前 pending human criterion、明确会话/消息来源、未撤回）。提交仍走既有 user actor、Evidence 校验和审计事件。暂不赋予 Runtime `human_approver` 权限，不修改 CGS KOL Goal，不引入新路由或跨平台身份系统。回滚只需移除兼容解析和表单滚动，不涉及数据迁移。

### 10. 验收边界

- **工程验证**：通过。新增真实 Chrome 行为回归先在旧实现稳定失败（实际选中 `decision:board`，期望 `decision:POLICY-WEB`）；最终覆盖初次 legacy hash、先切到 Feed 后再触发 hashchange、会隐藏目标的搜索筛选、移动端恢复旧 tree view、目标详情显隐、表单与提交按钮的真实视区位置、表单焦点，以及既有 `human_verdict` 预填、撤回、权限与审计路径。无 Chrome 环境会显式 skip，不再省略断言后报告通过。整合门禁首次运行又发现新增焦点兜底缺英文翻译；补齐后相关 Desktop/i18n/Web 91/91、当前工作树完整 333/333、TypeScript build 与 diff check 全部通过。
- **产品实操**：通过。最终 0.1.10 安装 App 直接打开真实 CGS 的 G4A Goal，点击“处理 1 项决定”；目标 hash 保留，Inbox 自动选中目标项，表单直接进入视区并获得焦点。“通过”、当前对话原话/来源、human_verdict Evidence 和必填理由全部预填，提交按钮可见；没有点击提交，也没有改写 CGS 人类 Review。
- **Owner 最终验收**：通过。导航、预填、标签与权限边界都在最终安装物成立；用户本人对最终按钮、措辞、信息密度以及是否点击提交仍为 `UNVERIFIED`，这是保留的人类权力，不是交付缺口。

---

## GB-20260830-25：范围纠偏后历史 Run blocker 仍像当前有效阻塞

**来源**：CGS `cgs-g2f-explicit-topic-competitiveness` 范围纠偏反馈
**Bug 确认**：已确认。当前 V1 状态机没有用已结束 Run 的 `block_reason` 决定 `work_state`，但 Web capsule 会在真正的当前 blocker 之前取任意最新 `started/blocked` Run 的 reason，即使对应 Claim 已释放；Goal 进展与记录页也把终态 Run 的 reason 直接写成“阻塞原因”，没有说明它只是历史报告
**修复决定**：P1，修复当前投影和历史文案；不改写不可变 Run，不新增通用 correction / supersession 状态机
**修复状态**：2026-08-30 最终收口：历史 blocker 可被 scope decision/correction 标为已失效，当前阻塞只取有效真相，历史仍保留审计；工程与 computer-use 实操通过，Owner 最终验收通过。

### 1. 真实场景

CGS G2F 曾有一个已结束、Claim 已释放的 Run，`block_reason` 记录当前验收还缺“authorized team evidence（Agent 任务、成本、返工）”。随后用户明确决定：Agent 工时、Token、返工和人工纠正成本属于延后范围，不应继续作为当前选题竞争力门槛。Molis Work 能用 Evidence correction 更正证据，却没有对应入口说明这条历史 Run blocker 已被后续范围决定取代；用户在 Contract 或历史视图仍会看到旧文本。

### 2. 事实与归因

owner 已用独立 fixture 复现：一个 executor Run 以旧范围理由 `failed` 后，Claim 自动释放，canonical `work_state=execution_pending` 且 reasons 为空；因此 Run 原文没有污染 V1 当前状态。但旧版 capsule 的 `primaryBlocker` 会先扫描任意 `started/blocked` Run，而 `failed` 终态在 Goal 进展/记录页仍以“阻塞原因”展示，消费者无法区分当时报告与当前事实。归因是 Molis Work 当前投影与历史展示缺陷，不是 CGS 误用；“必须新增 Run correction”这一初始假设不成立。

### 3. 现有流程的问题

用户做出范围纠偏后，Goal 当前状态虽然已允许继续执行，但 capsule 可能把旧 Run reason 重新提升为主 blocker；进展和记录页又把终态 Run 原文无差别写成“阻塞原因”。用户需要通读 Claim 状态和后续历史，才能判断这条文字是否仍是今天的待办。

### 4. 设计根因与初衷

Run report 采用追加式不可变历史，初衷是保留执行者当时的判断和失败原因，防止事后重写审计；Evidence correction 只纠正 Evidence，不应静默改写另一个 actor 的 Run 事实。这个审计边界合理。缺陷在读取侧：capsule 没有把 Run reason 限制到当前 active Claim，历史页也没有显式告诉用户终态 Run 原文不会自动成为当前 blocker。

### 5. 当前影响

影响发生过范围变更、验收条件删除、失败重试或 Claim 释放的长期 Goal。它不阻止数据库写入，也不改变 canonical `work_state`，但会让 capsule 和人类页面给出错误的当前解释，可能诱导重复补已经移出范围的证据。真实 CGS G2F 已触发该误导；所有保留终态 Run reason 的 Goal 都有潜在影响。

### 6. 复杂度审查

- **当前必须**：当前 blocker 优先来自 canonical 当前 reasons；只有当前 active Claim 的活跃 Run 才可作为 fallback。终态或已释放 Run 的 reason 保留原文，但明确标为“当时记录/当时报告的阻塞”，并说明不是当前 blocker。
- **可以延后**：当存在结构化 Scope Decision 时给历史 Run 加明确的 superseded-by 链接；任意 Run report 字段级 correction、通用事实图谱和历史批处理。
- **应当删除**：直接覆盖或删除旧 Run report；仅凭更新更晚就自动判定语义取代；让 Evidence correction 冒充 Run correction。

### 7. 修复必要性与优先级

需要修复，P1。旧 reason 会进入面向用户的 capsule 主 blocker，且在 Goal 页面被无时间语义地呈现；虽然不改数据库状态，但直接影响下一步判断。修复只收紧当前投影并澄清历史标签，不牺牲不可变审计。

### 8. 修复前后体验差异

- **修复前**：用户删除一项当前验收范围 → 旧 Run 仍写“缺这项证据” → 用户/Runtime 需要自行判断它是否仍有效。
- **修复后**：当前页只列 canonical 当前 blocker；已释放/终态 Run 的旧理由只在进展和记录中显示为“当时记录/当时报告的阻塞”，并紧邻说明“这不是当前阻塞” → 用户既能追溯当时判断，也不会把它当成今天的待办。

### 9. 最小修复范围

修改 `src/web/capsule.ts` 的 blocker 选择顺序与 active Claim 约束；修改 Goal 进展和记录页的终态 Run 文案及中英文翻译；补回归 fixture。V1 状态机、Run 数据、Evidence correction、CGS G2F 和自然语言识别均不改。回滚只是恢复读取侧逻辑，不涉及数据迁移。

### 10. 验收边界

- **工程验证**：通过（源码）。capsule/Web/i18n 全量 66/66、TypeScript 通过。回归证明当前 Risk blocker 不会被已释放旧 Run 抢占；无当前 reasons 时 `execution_pending` 保持无阻塞；终态 Run 原文仍完整存在且只用历史标签展示。沙箱内 SQLite 临时目录限制导致 20 项 `SQLITE_CANTOPEN`，同一命令在沙箱外为 66/66，未把环境失败误报为功能失败。
- **产品实操**：通过（源码服务，独立真实状态 fixture）。Safari computer use 实际看到“待执行”；进展页显示“当时记录：旧范围要求补 Agent 成本、Token 和返工证据。这不是当前阻塞”；展开“当前阻塞”显示“当前没有阻塞项”；记录页显示“当时报告的阻塞”并注明不会自动成为当前阻塞。证据截图：`docs/qa/bug-revalidation/2026-08-30/gb25-historical-blocker.png`。
- **Owner 最终验收**：通过。当前事实、历史原文和 supersession 审计边界清晰分离，0.1.7 已安装；用户主观措辞验收仍为 `UNVERIFIED`。

---

## GB-20260830-26：大型 Proposal 预检漏掉不可变与唯一约束，决定后才部分失败

**来源**：CGS 七平台各 50+ AI KOL 的 37 项 Goal Tree Proposal 恢复反馈
**Bug 确认**：部分成立。accepted Contract 不可变在 decide 才失败、whole confirm 产生 35/37 部分状态与 GB18 同类，当前源码已经由同一 dry-run validator 和 pristine whole-confirm 零写入修复，不能重复算新 Bug；`criterion_id` / 跨 Proposal `item_id` 仍由全局主键约束，但提交与预检没有在写入前领域化检查，仍可能暴露 SQLite 原始错误，属于新增真实缺陷。replacement 指引需要结构化；机械修复自动继承用户授权暂不成立为最小修复，因为服务端还不能证明业务语义完全未变
**修复决定**：来源任务已授权 Molis Work owner 独立评估并在确认后修复；不得改动或阻塞 CGS 当前 Goal
**修复状态**：2026-08-30 最终收口：accepted immutable、criterion/item ID 唯一性在 check 阶段与 decide 同源校验，原始数据库错误被结构化；whole confirm 零部分写入并返回 replacement/migration 恢复动作。293/293 通过，Owner 最终验收通过。

### 1. 真实场景

用户在当前对话一次确认 37 项 Goal Tree Proposal。`goal_tree_proposal_check` 报告零冲突、零规划问题，但 `goal_tree_decide` 只应用 35 项，两个 accepted 父 Contract 更新在决定阶段因 closure invariant 失败；9 个子 Goal 和关系已落地，旧父 Goal 仍保留旧 closed-leaf Contract。按 replacement Goal 恢复时，check 再次通过，decide 才暴露 `acceptance_criteria.criterion_id` 唯一约束；复用 item_id 的 superseding Proposal 又在 propose 阶段暴露 `goal_tree_proposal_items.item_id` 唯一约束。消费者必须手工理解并重命名内部 ID 才恢复。

### 2. 事实与归因

owner 已核对当前源码和现有 GB18 回归测试：accepted Contract transition、dry-run materialization 与 whole-confirm 原子失败已经共享同一检查，冲突时不会创建安全子 Goal，Proposal 仍为 pending；这一段是历史真实 Bug，但当前修复归 GB18。新增边界仍成立：验收条件 ID 是全局主键，Goal materializer 在删除目标 Goal 自身条件后直接插入，没有提前检查该 ID 是否属于另一个 Goal；Proposal item ID 同样是全局主键，normalize 只检查同一请求内重复，跨 Proposal 重用会在 INSERT 时失败。二者都是 Molis Work 缺陷，不是消费者应理解的 SQLite 细节。至于“只改技术 ID 自动沿用旧确认”，当前没有稳定语义 hash 证明内容未变，暂按安全约束保留再次确认，不把期望直接判成 Bug。

### 3. 现有流程的问题

用户在确认前得到“可以应用”的假信号；确认后才面对语义不一致的部分图。恢复工具没有给可直接执行的 replacement 方案，反而依次暴露表级唯一约束和全局 item ID 细节。用户确认的是业务变化，却可能因纯技术 ID 修正再次被要求确认；Runtime 还要猜哪些已落地、哪些应重试、怎样避免重复对象。

### 4. 设计根因与初衷

accepted Contract 的收口限制用于防止已被执行和审计的承诺被原地重写；全局唯一 criterion/item ID 用于稳定引用、事件关联与幂等；逐项 materialization 原本允许大型提案保留可独立成功的项；重新确认则防止 Runtime 借“修复”扩大用户授权。初衷均合理。候选设计缺口是 check 未复用 decide 的确定性不变量与约束预演，逐项成功策略没有表达业务原子组，底层唯一错误没有领域化，授权模型也没有区分“内容变化”与“机械修复”。

### 5. 当前影响

已在真实 CGS 大型提案造成 35/37 部分应用和一次以上恢复调用；父 Contract 与已落地子图短暂语义冲突，容易让 Runtime/用户误报目标拆分成功。影响大型需求变更、accepted Goal replacement 和任何可能复用 criterion/item ID 的提案；不是单纯多点几次，而是确认结果与 canonical truth 不一致。是否仍能在当前源码复现，以及 GB18 已修范围覆盖多少，待独立验证。

### 6. 复杂度审查

- **当前必须**：让 check 与 decide 共享 accepted transition 和唯一约束预检；任何可预知冲突在用户确认前返回结构化 item/field 位置；whole confirm 不因这些已知冲突写入部分状态；为不可变 Contract 返回最小 replacement + relation migration 恢复建议；底层 UNIQUE 错误不得裸露。
- **可以延后**：通用语义 diff 授权继承、任意 Proposal 自动重写、跨提案依赖求解器、全历史 ID 自动迁移。
- **应当删除**：让消费者手工试错数据库 ID；把 `conflict_item_ids=[]` 当成“可安全 whole confirm”却运行另一套 decide 校验；仅靠重复真人确认掩盖机械恢复缺口。

### 7. 修复必要性与优先级

按 P1 修复新增唯一约束与恢复诊断：它会让消费者在正常 revision 路径看到数据库内部错误，并破坏 check 作为确认前预演的可信度。accepted/atomic 部分作为 GB18 扩展复验，不重复改代码。replacement 指引进入最小修复；授权继承延后，除非未来先定义并验证严格的业务语义 hash，否则不能因“看起来只是改 ID”放宽真人确认。

### 8. 修复前后体验差异

- **修复前**：check 绿灯 → 用户确认 → 35/37 落地 → 阅读不可变错误 → 手工建 replacement → 再遇 SQL UNIQUE → 猜全局 ID → 可能再次确认。
- **修复后候选**：check 在确认前精确列出不可原地更新的父 Contract 与重复 ID，并给 replacement/migration 修订草案；whole confirm 要么完整落地，要么一项不写；纯机械 ID 修订若业务 payload hash 未变，可沿用原确认并留下审计，否则明确要求新确认。

### 9. 最小修复范围

复用现有 proposal dry-run/transaction validator：在 Goal/Contract materialization 前检查显式 criterion ID 是否已属于另一个 Goal，并让同一 Proposal 中前序 item 的临时写入也参与冲突判断；在 Proposal 创建前检查跨 Proposal item ID，返回 `items[index].item_id`、冲突 Proposal 和使用新稳定 ID 的动作。accepted conflict 返回 `create_replacement_goal`、`replaces` 与关系迁移提示，但不自动创建或改 CGS 数据。whole-confirm 原子性沿用 GB18，不重复实现；授权继承、模糊自动迁移和放宽 accepted immutability均不做。

### 10. 验收边界

- **工程验证**：2026-08-30 通过。TDD 先复现三类失败：accepted conflict 缺结构化 replacement 动作、criterion collision 在 check 泄漏 `SQLITE_CONSTRAINT_PRIMARYKEY`、跨 Proposal item ID 重用不是 `MolisWorkV1Error`；修复后定向 V1 3/3、实际 MCP uniqueness/clarification 流程、TypeScript 通过。完整 V1 + MCP 在沙箱内 127/128，唯一失败是测试访问真实目录的 `SQLITE_CANTOPEN`；同一命令在沙箱外 128/128 全绿。MCP 实际返回不含 `UNIQUE constraint failed`，失败 Proposal 数量不增加。
- **产品实操**：源码产品接口已通过，最终安装版 computer use 仍为 `UNVERIFIED`。实际 `tools/call` 已走通：缺 Run → resume hint；criterion collision → check 中精确字段/owner/action；item ID 重用 → propose 前领域错误且零残留。Web 复用既有冲突卡能力展示 message + recovery，并禁用整份采用；还需统一安装后用 37 项等体量安全 fixture 通过 computer use 观察确认页与结果页，不可在真实 CGS 上制造第二次部分应用。
- **Owner 最终验收**：通过。与 GB18 的原子性重叠已去重；本卡独有的唯一约束、领域错误转换和 replacement 恢复均独立覆盖，未用 GB24 的交互成功代替协议验收。

---

## GB-20260830-27：Completion Risk 作用域不明且错误阻止 executor 返工

**来源**：CGS `cgs-g2d-evidence-acquisition` completion 与 rework 两次反馈
**Bug 确认**：真实 Bug，但已纠正归因。源码核对证明 `completion` Risk 不进入 executor eligibility，也没有发现无关联 Risk 的 board-wide fallback；G2D 在 Available/explain 不可领取，是因为旧执行、Evidence 与 Review 已把它派生为 `completion_blocked`。真实缺陷是新的独立反证推翻旧验收前提后，没有受审计入口让同一 unmet Goal 返回 executor 返工
**修复决定**：已授权自主评估与修复；不得改 CGS Risk 或 Goal
**修复状态**：2026-08-30 最终收口：根因修正为“已有执行结束后恢复动作缺失”，不是 completion Risk 泄漏初次 Claim gate。0.1.7 最终安装 Core 已对真实 G2D 返回 `goal.execution_finished_rework_required`、`completion_gate_only=true` 和 `molis_work_v1_rework_request`；保留 Risk 与历史审计，未修改 CGS 数据。Owner 协议验收通过；CGS 新 Session 才能加载。

**2026-08-30 最终安装态复验补充**：用已安装 0.1.7 Core 对真实 `cgs-g2d-evidence-acquisition` 只读调用 executor explain，确认 Risk facts 已明确 `scope=direct_goal`、`association=goal_risks`、`blocking_mode=completion`；但响应仍只有 `risk.blocks_completion`，没有说明旧 Run/Evidence/Review 已结束，也没有指出新反证应走 `molis_work_v1_rework_request`。这会继续让消费者把“防止重复 Claim”误读为“completion Risk 泄漏到 executor gate”。因此整卡回退为未通过；本轮新增 `goal.execution_finished_rework_required`，在 Explain、Available blocked 和 select 拒绝中同时返回 `completion_gate_only=true`、`recovery_tool=molis_work_v1_rework_request` 及 criterion/Evidence/Available 恢复步骤，不改变 canonical 状态或 Risk。定向红灯/绿灯已完成，完整回归、重打包与真实安装态协议复验仍待执行。

**2026-08-30 恢复提示工程验证**：两个精确状态机用例先暴露既有断言只期待 `risk.blocks_completion`，更新为三个入口统一返回按 code 排序的生命周期提示与 Risk 后通过；完整 `pnpm test` 293/293 全绿。工程上已证明：初次执行仍可领取；旧执行闭环完成时不创建重复 Claim；新反证可通过 `molis_work_v1_rework_request` 回到 `execution_pending`；completion Risk 仍只阻止 complete。最终安装态仍需在真实 G2D explain 中看到新增 reason，且不得在本任务中替 CGS 提交 rework。

### 1. 真实场景

G2D 只负责有边界地采集真实证据并保留 coverage gap，两项 Evidence 与 self-verifier 曾通过；调用 complete 却被一个针对每平台 50+ 账号深核验、名单与画像质量的 triggered completion Risk 拦住。后续复核又发现旧 Evidence 不足，需要回到同一 accepted/closed_leaf/unmet Goal 修复；此时 Available 把 G2D 放进 blocked，executor explain 也因同一 `blocking_mode=completion` Risk 返回 `ready=false`。用户既看不到 Risk 与 G2D 的传播路径，也无法在完成被挡时继续做修复。

### 2. 事实与归因

`evaluate(executor)` 只消费 `blocking_mode=claim` 和 triggered `invalidate_on_trigger`；`completion` Risk 只进入 `completionRiskReasons`。当前 Risk 通过 `goal_risks` 直接关联目标，没有 board-wide fallback。旧 Run completed、旧 Evidence passed、Review obligation satisfied 后，派生状态正确地进入 `completion_blocked`，而 `executorHandoffReasons` 为避免重复执行而拒绝再领 executor。这个保护本身合理；缺陷在于新 Runtime 无权 retract 其他 producer 的 Evidence，关闭的 Review 又不能提交 `needs_changes`，系统缺少正式 counter-evidence → rework 转换。

### 3. 现有流程的问题

Risk reason 过去没有说明它通过哪条关联作用于当前 Goal，Runtime 只能凭描述猜；更关键的是，新反证出现后既不能合法重新领取同一 Goal，也不能由独立 reviewer 更正原 producer 的 Evidence。Skill 禁止绕过 Available，另建 Candidate 会复制 owner，修改 Risk 则扭曲事实。

### 4. 设计根因与初衷

Completion Risk 用于防止已知重大风险被局部证据绕过；`completion_blocked` 阻止重复 Run，是为了避免相同结果被反复执行并污染审计历史。初衷正确，但状态机只覆盖“解除完成门禁”与“原 Evidence producer 主动 correction”，没有覆盖“后来出现、由另一 Runtime 发现的新反证”。

### 5. 当前影响

已明确阻断真实 CGS G2D 的修正实现，迫使消费者在生命周期外继续、复制 Goal 或不诚实地处理 Risk。用户已授权当晚自主推进，仍不能合法创建新 Run，因此优先级为 P0。Risk 是否语义上应该关联 G2D 属于 CGS Contract/建模判断，不由本修复暗改；Molis Work 负责把直接关联与恢复动作说清楚。

### 6. 复杂度审查

- **当前必须**：为“新反证推翻旧完成前提”提供最小、受审计的 rework 请求；只使指定 criterion 的旧通过 Evidence 失效并重开 Review；Risk reason 明示 `scope=direct_goal`、`association=goal_risks` 和 affected surfaces；completion Risk 继续只挡 complete。
- **可以延后**：通用 Surface ontology、自动语义匹配 affected_surfaces、跨项目 Risk federation。
- **应当删除**：让 Runtime 改 Risk、复制 Goal或冒充原 Evidence producer 只为恢复执行；让 Runtime 从 Risk 描述猜直接关联。

### 7. 修复必要性与优先级

P0 必修。它已让同一未完成 Goal 的真实修正工作脱离生命周期；而新增入口可以在不放宽 completion Risk、不改 Contract、不删除历史的前提下最小解决。

### 8. 修复前后体验差异

- **修复前**：G2D complete 被 Risk 挡住 → 后续发现实现不足 → 同一 completion Risk 又让 executor 不可领取 → 只能改状态或复制 Goal。
- **修复后**：独立复核发现新反证 → 提交受影响 criterion、理由和反证引用的 rework request → 同一 Goal 回到 execution_pending → 新 executor 正常 select → 只接受请求后的 fresh Evidence 和 Review；原 completion Risk 仍诚实阻止 premature complete，并明确它通过 `goal_risks` 直接关联当前 Goal。

### 9. 最小修复范围

新增一个 Runtime API 和一类审计 Event，不新增数据库表或永久状态枚举。状态派生用指定 criterion 最新 `goal.rework_requested` event seq 作为 fresh Evidence 下界，并把 Review obligation 重置为 pending；下一次 executor Run 完成后再允许 Review。completion Risk reason 补直接作用域 facts。暂不做通用 Surface ontology、自动语义匹配、accepted Contract 修改或 CGS 数据迁移。

### 10. 验收边界

- **工程验证**：通过。V1/MCP 全量 123/123、Web 全量 46/46、TypeScript 均通过；精确覆盖独立 actor、幂等、非法状态、空依据、旧 Evidence 失效、Review 重开、executor 恢复、旧 Evidence 不可复用、fresh Run/Evidence/Review 闭环、completion Risk 保留和直接关联 facts。新增的 Web 回归同时证明 Risk-only 决定不会遮住 `execution_pending` 的开始入口，而 Proposal、Rewire 与真人验收仍优先。
- **产品实操**：通过（源码安全副本）。用一条 accepted/closed_leaf/unmet Goal、旧 completed Run、旧 passed Evidence/Review 和直接关联的 open completion Risk 复现 `completion_blocked`；提交 rework 后同一 Goal 变为“待执行”，页面下一步为“开始推进这条 Goal”，可直接“打开 Runtime”，而 Risk 仍显示“缓解 / 阻止完成”、受影响区域、受影响 Goal 和“当前会阻止所有关联 Goal 被标记为完成”。截图：`docs/qa/bug-revalidation/2026-08-30/gb27-rework-execution-pending.png`。
- **Owner 最终验收**：通过。最终安装 Core 对真实 G2D 的只读 Explain 已显示 rework recovery；没有放宽 Risk、删除历史或修改 CGS。新 Codex Session 读取新工具仍为消费端边界。

---

## GB-20260830-28：Compaction 后续租只有 claim_id，无法从 context 得到正确 actor

**来源**：CGS Claim 续租恢复反馈
**Bug 确认**：已确认，但属于恢复错误契约设计债，不是 Claim 权限绕过 Bug。`context_resolve` 只负责项目连接且没有足够 actor 身份证明来声明“我的 Claim”；精确 actor 校验合理。真实缺口是 `claim.not_owner` 只返回文本，已持有 claim_id 的同一 Runtime 无法从失败中安全恢复
**修复决定**：P2，保留精确 actor 校验；为 owner mismatch 返回结构化 owner、请求 actor、Goal、重试工具、下一动作和“仅同一 Runtime 连续工作可用”的边界，同时更新 MCP 描述与 Skill
**修复状态**：2026-08-30 最终收口：context/错误响应直接给出 active owner、actor 与安全 remediation，不再靠制造失败查身份；真实 MCP 恢复实操与 0.1.7 构建通过，Owner 最终验收通过。

### 1. 真实场景

长任务 compaction 后消费者保留 claim_id，但丢失领取时使用的 actor_id。`context_resolve` 只恢复项目绑定，不返回 active Claim owner；用 `runtime_id=codex` 续租失败后，必须再调用 explain，从 `claim.already_active.facts.actor_id` 找到 `codex-cgs-ai-kol-research` 才能重试。

### 2. 事实与归因

claim renew 必须由原 actor 完成是合理权限与审计约束，不能因方便而允许任意 Runtime 凭 claim_id 续租。源码核对确认 actor_id 已通过 Contract/Explain 暴露，它是审计标识而非密钥；当前 Session 也没有稳定的 actor 认证映射，因此 `context_resolve` 不能可靠声明哪个 Claim 属于“我”。成立的缺口是 owner mismatch 没有结构化恢复数据；把 owner 显示出来不新增权限，但必须注明只能用于同一 Runtime 继续同一工作，不能作为接管授权。

### 3. 现有流程的问题

消费者靠一次预期失败发现续租身份，再额外 explain 和重试；自动化无法从错误稳定决定下一步，也可能错误新领 Claim，割裂 Run。

### 4. 设计根因与初衷

context_resolve 只负责项目连接，避免把生命周期状态和授权混进绑定；Claim actor 精确匹配防止其他 Runtime 劫持租约。缺口是 compaction 恢复没有专用“我的活跃工作”摘要，且拒绝响应偏文本而非可恢复契约。

### 5. 当前影响

影响所有跨 compaction、重启或长时对话的续租，通常增加两次调用并可能产生重复 Claim/Run；不直接扩大用户权限，但会破坏运行连续性。频率随长任务增加，暂列 P2 候选。

### 6. 复杂度审查

- **当前必须**：owner mismatch 返回 `claim_id`、`goal_id`、`owner_actor_id`、`request_actor_id`、`next_action`、`retry_tool` 和同一 Runtime 连续工作边界；Skill 明确它不是接管授权。
- **可以延后**：actor alias/identity federation、跨设备 Claim handoff、自动续租 daemon。
- **应当删除**：要求消费者故意失败后再 explain；用通用 runtime_id 猜精确 actor；仅凭 claim_id 绕过 owner 校验。

### 7. 修复必要性与优先级

需要修复，P2。它不破坏 canonical 状态，但在所有跨 compaction 的长任务中制造一次额外 explain 和猜测。无需把 active Claim 塞进 context_resolve：该工具缺少 actor 身份证明，且全项目活跃工作会放大输出并混淆项目连接职责。

### 8. 修复前后体验差异

- **修复前**：续租失败 → explain → 取 actor_id → 重试。
- **修复后**：续租若误用 actor，单次错误直接返回原 owner、Goal、重试工具和 `retry_claim_renew_as_owner`；同一 Runtime 可原样重试，其他 Runtime 明确不能把该提示当作接管授权。

### 9. 最小修复范围

保留精确 actor 校验；只扩展 renew 错误 details、工具说明和 Skill 恢复路由。`context_resolve`、Contract schema、Claim 数据和续租事务均不改；不自动改 actor、不自动续租、不复活过期 Claim，也不新增 handoff/身份系统。回滚仅移除新增错误字段和说明，没有数据迁移。

### 10. 验收边界

- **工程验证**：通过（源码）。V1/MCP 全量 128/128、TypeScript 通过；错误 actor 返回 `claim.not_owner`、claim/goal/owner/request actor、重试工具、下一动作和 `same_runtime_continuation_only=true`，正确 actor 的既有续租、策略上限、过期和释放门禁保持通过。
- **产品实操**：通过（MCP 协议）。安全 fixture 用 `codex` 续租 `codex-cgs-ai-kol-research` 的 Claim，单次错误完整返回 owner 与恢复动作；按提示用原 actor 重试成功，Claim ID 未变，Run 数仍为 1。该消费者界面是 MCP response，computer use 不会比实际协议调用提供更高层证据；修复已进入最终安装 0.1.7，新 Codex Session 的自然语言消费仍为 `UNVERIFIED`。
- **Owner 最终验收**：通过。恢复调用收缩且不放宽 owner 校验；0.1.7 已安装，用户对提示易懂性的主观判断仍为 `UNVERIFIED`。

---

## GB-20260830-29：Draft 每轮写入与恢复都返回完整历史，长对话输出被截断

**来源**：Arena `goal-arena-v1-product-loop` draft clarification 消费反馈
**Bug 确认**：已确认。源码 `recordDraftDialogueTurn` / `resumeDraftDialogue` 每次构造包含全部 turns 的 view，旧 MCP 不做投影；历史随轮数线性增长。Arena 的 10k–11k token 截断与实现一致，不是消费者显式请求历史造成
**修复决定**：P1；保留 Coordinator 完整快照供内部兼容，MCP 默认只返回最新 turn、checkpoint 和 lifecycle 状态，完整历史改为显式、有界、可向前分页
**修复状态**：2026-08-30 最终收口：写入默认只回本轮 turn、checkpoint 和关键 work_state，历史由显式分页读取；12 轮真实 MCP 无线性膨胀，0.1.7 已安装，Owner 最终验收通过。

### 1. 真实场景

Runtime 对同一 Draft 连续澄清十余轮，每次只保存一条短回答。`draft_dialogue_turn` 每次都返回从第 1 轮开始的完整 `turns`、dialogue、Goal 和 work_state；`draft_dialogue_resume` 也返回全历史。到第 11–12 轮，单次响应被宿主截断。

### 2. 事实与归因

owner 已核对实现并用 12 轮真实 MCP fixture 复现旧结构的必然增长：Coordinator view 每次从 snapshot 过滤并返回该 session 全部 turns，旧 MCP 原样序列化，没有 compact 参数。修后同一 fixture 共 13 条 turns（含 rough idea），默认第 1 次与第 12 次写响应分别为 5,770 / 5,781 bytes，只增加 11 bytes；默认 resume 为 5,781 bytes，显式 13 条完整历史为 20,453 bytes，默认减少 71.7%。归因是 Molis Work MCP 默认响应粒度缺陷。

### 3. 现有流程的问题

写一条新回答却重复支付全部历史，延迟与上下文成本随轮数增长；响应尾部的 latest checkpoint、work_state 或写入结果可能被截掉，Runtime 无法可靠判断本次是否成功，只能重读或冒险继续。

### 4. 设计根因与初衷

早期自包含响应让 Runtime 无需额外读取即可恢复全部澄清语境，也让每次写入返回同一快照。对短对话有效；当历史增长时，“一次自足”损害了“本次结果完整可读”，且写路径承担了本应由分页只读查询负责的历史传输。

### 5. 当前影响

已在真实 Arena 11–12 轮对话出现截断；澄清越认真，后续每轮成本越高，且可能遗漏写失败或下一问题。影响所有长 Draft clarification，频率随轮数线性增长，P1 候选。

### 6. 复杂度审查

- **当前必须**：写入和恢复默认固定返回 latest turn、turn_count、checkpoint、claim/run/work_state、cursor；显式历史读取必须有 limit 和 before cursor；展示参数在写事务前校验。
- **可以延后**：全文搜索、语义压缩、自动摘要、无限滚动 UI、跨 Session 对话归档。
- **应当删除**：每次写入默认回传全部历史；仅提高宿主输出上限；让消费者从截断文本猜写入成功。

### 7. 修复必要性与优先级

需要修复，P1。真实 Arena 已截断，且问题随正常澄清深度放大。只改变 MCP 响应投影即可闭环，不新建第二套澄清状态机、不改 canonical 对话事实。

### 8. 修复前后体验差异

- **修复前**：写第 N 轮 → 返回 1…N 全历史 → 越来越慢并截断 → 再次读取确认。
- **修复后**：写第 N 轮 → 返回 `latest_turn`、`turn_count`、最新 checkpoint 与可执行状态，大小基本稳定 → 需要历史时设 `include_history=true`，用 `history_limit` 和 `history_before_turn_index` 分页；恢复同样默认紧凑。

### 9. 最小修复范围

在 MCP 层新增统一 response projector；`draft_dialogue_turn` / `resume` schema 暴露 `include_history=false`、`history_limit=1..100` 和 `history_before_turn_index>=1`。默认不返回 `turns`，但返回 `latest_turn`、`turn_count` 和 history 元数据；显式 history 返回最新一页并给 `next_before_turn_index`。Coordinator、数据库、start 响应和对话事实均不改。历史参数先校验再调用写操作，错误不会留下 turn。Skill 改为默认读 checkpoint、按需分页。回滚只恢复旧投影，无数据迁移。

### 10. 验收边界

- **工程验证**：通过（源码）。V1/MCP 全量 128/128、TypeScript 通过；覆盖默认无 turns、latest turn 与 checkpoint 完整、resume 紧凑、limit=1 页、next cursor、非法 limit 的结构化错误和失败零写入。Coordinator 既有完整历史测试保持通过。
- **产品实操**：通过（MCP 协议）。真实调用连续保存 12 轮短回答；默认响应始终包含第 13 条最新 turn、turn_count、dialogue、Claim/Run/work_state/cursor，且首尾只相差 11 bytes；默认 resume 比显式完整历史小 71.7%。显式 history 返回全部 13 条及分页元数据。修复已进入最终安装 0.1.7；该消费者界面是 MCP 协议，computer use 不替代真实工具调用。
- **Owner 最终验收**：通过。12 轮协议实操证明响应不再线性增长，完整原文仍可分页读取；用户主观延迟感受仍为 `UNVERIFIED`。

---

## GB-20260830-30：Contract Proposal 缺字段时抛出 undefined.trim 裸异常

**来源**：Arena `goal-arena-v1-product-loop` legacy Contract Proposal 恢复反馈
**Bug 确认**：已确认。Arena 原始 payload 的 `proposed_goal.acceptance_criteria` 是 8 条字符串；旧 MCP schema 只暴露任意对象，运行时随后读取 `criterion.statement.trim()`，因此泄露原生 TypeError
**修复决定**：已授权自主修复；恢复同一 Draft Contract 补全路径，不放宽 Contract 完整性或用户决定边界
**修复状态**：2026-08-30 最终收口：完整 Contract schema、入口 shape 校验、精确字段路径和失败零写入通过；Arena 已用纠正结构创建 pending Proposal，0.1.7 已安装，Owner 协议验收通过。

### 1. 真实场景

Arena 的统一 Goal Tree Proposal 因 leaf readiness 路径不明失败后，Runtime 对同一 Draft 改用 `molis_work_v1_contract_propose`。第一次遗漏 `goal_id` 得到可理解错误；第二次补回原 goal_id/board_id，并提供完整 Contract、8 条 acceptance criteria、field_sources 与 review_policy，却直接收到 JavaScript `undefined.trim` 裸异常，无法知道是哪一字段缺失。

### 2. 事实与归因

已从 Arena 当前任务的原始工具调用中恢复完整 payload：`proposed_goal.acceptance_criteria` 是字符串数组，其他主要 Contract 字段、field_sources、review_policy 均已提供。旧 `molis_work_v1_contract_propose` 的 `proposed_goal` schema 是 `{ [key:string]: unknown }`，没有表达 criterion 对象结构；Coordinator 又在 shape guard 之前直接进入业务 validator，最终对字符串项读取 `criterion.statement.trim()`。独立红测得到同一裸 TypeError并确认失败没有创建 Proposal。归因是 Molis Work MCP schema 与运行时输入校验共同缺陷，不是 Arena 应读源码或猜嵌套结构。

### 3. 现有流程的问题

消费者知道第一次错在 goal_id，第二次却只得到语言运行时异常；没有字段路径、合法示例、错误码或“未创建 Proposal”的确认。Runtime 只能删字段试错、查源码或停止，用户无法判断是内容不完整还是服务 Bug。

### 4. 设计根因与初衷

Contract Proposal 要求完整 Draft Contract、字段来源与 Review Policy，初衷是避免半成品直接成为 accepted leaf；内部大量 `.trim()` 假设 schema 已保证字符串完整，以减少后续分支。缺陷是 MCP JSON Schema、运行时归一化和 validator 的责任没有闭合，外部可选/错误字段触发内部假设。

### 5. 当前影响

已阻断真实 Arena Draft 接受路径；该 fallback 又是在原生 Goal Tree 路径失败后使用，导致两个官方入口同时不可操作。任何缺字段或 schema 演进不一致的 Contract Proposal 都可能得到同样裸异常，P1。

### 6. 复杂度审查

- **当前必须**：定位所有外部字段到 `.trim()` 的未守卫路径；在写事务前返回稳定错误码、精确 JSON path、缺失/类型和最小示例；确认失败不创建 Proposal或改变 Draft。
- **可以延后**：自动补写业务内容、通用 JSON Schema 代码生成器、把 legacy Contract 完全迁移到 Goal Tree。
- **应当删除**：向消费者暴露 JavaScript 堆栈/TypeError；让 Runtime逐字段二分试错；用空字符串静默通过业务必填。

### 7. 修复必要性与优先级

需要修复，P1。最小修复只是输入边界与错误领域化，不改变 accepted Contract 权限或业务校验；即使最终证明 payload 缺字段，也仍是真实 API Bug。

### 8. 修复前后体验差异

- **修复前**：提交完整候选 Contract → `undefined.trim` → 不知道改哪里。
- **修复后候选**：提交 → 若合法则创建唯一 pending Proposal；若不合法则返回如 `contract_proposal.field_missing`、精确 `proposed_goal.<field>` / `field_sources[i].<field>` 与示例，canonical 状态不变。

### 9. 最小修复范围

已为 `contract_propose` 补齐 Draft Goal、acceptance criterion、leaf_readiness、field_sources 和 review_policy 的嵌套 schema；Coordinator 在请求 hash 与写事务前运行 shape guard，错误使用稳定 `contract_proposal.field_invalid`、精确 JSON path、期望类型和 recovery。leaf readiness 共用校验器增加 payload path 参数，使该入口返回 `proposed_goal.leaf_readiness.<field>`，不再混用 Goal Tree item 路径。只补输入边界与提示，不自动生成业务内容、不修改 Arena Goal、不放宽用户确认；失败调用保持零 Proposal 写入。

### 10. 验收边界

- **工程验证**：源码定向验证通过。红灯覆盖 Arena 的字符串 criterion，实际得到 `Cannot read properties of undefined (reading 'trim')`；绿灯返回 `contract_proposal.field_invalid` 且 path=`proposed_goal.acceptance_criteria[0]`，失败前后 pending Proposal 数量不变。MCP declaration 断言完整 criterion/Goal schema；leaf readiness 缺字段返回 `proposed_goal.leaf_readiness.rationale`。定向 V1/MCP 与 TypeScript 已通过，完整回归留到统一打包前。
- **产品实操**：源码层通过，安装层待验。Arena 旧 Session 按修复后明确结构把 8 条 criterion 对象化并提供完整 leaf_readiness 后，已成功创建 pending `contract-proposal-dd02b3c4-8860-4357-a253-502cbcf6c537`，证明受支持 payload 可恢复正式路径；隔离源码 MCP 对字符串 criterion 返回精确 `proposed_goal.acceptance_criteria[0]` 且零 Proposal 写入，正确对象化 payload 创建唯一 pending Proposal。computer use 打开源码 Decision Center，看到 1 项 Arena“目标说明”，展开后确认正式 Contract 的更新对象、确认/退回效果、理由输入与明确按钮均可见，未点击决定。环境策略拒绝复制 Arena SQLite，因此真实 Proposal 的新错误实现与 raw/synthetic check 留给统一安装后的官方 MCP 新 Session。
- **Owner 最终验收**：通过。错误已对普通 Agent 可操作且不降低 Contract 完整性；Arena 已用修正结构成功恢复，0.1.7 已安装。

---
