# 0.1.x Bug 卡：31–40

状态：历史记录，截至 2026-08-31。卡片中的状态、流程、路径与验收属于当时版本，不是当前待办或操作指令。

[台账入口](../../molis-work-bug-cards.md) · [历史总览](overview.md) · [历史复审](review-2026-08-30.md)

## 本册目录

- [GB-20260830-31：replacement Goal 已生效，旧 Goal 仍进入 Ready](#gb-20260830-31replacement-goal-已生效旧-goal-仍进入-ready)
- [GB-20260830-32：leaf_readiness 非法枚举被误报为“没写判断”，无 clarification Run 也缺恢复动作](#gb-20260830-32leaf_readiness-非法枚举被误报为没写判断无-clarification-run-也缺恢复动作)
- [GB-20260830-33：单轮 Run 收口后只汇报过去，不交代或继续下一轮](#gb-20260830-33单轮-run-收口后只汇报过去不交代或继续下一轮)
- [GB-20260830-34：跨仓库 Goal 的本地 Evidence 无法诚实落档](#gb-20260830-34跨仓库-goal-的本地-evidence-无法诚实落档)
- [GB-20260830-35：依赖视图顶部工作区标签重叠，标题无法辨认](#gb-20260830-35依赖视图顶部工作区标签重叠标题无法辨认)
- [GB-20260830-36：Available 未暴露关键 scope 冲突，消费者领取后才发现 Goal 不承接当前产物](#gb-20260830-36available-未暴露关键-scope-冲突消费者领取后才发现-goal-不承接当前产物)
- [GB-20260830-37：已有可消费上游产物时，下游已归属修复仍从 Available 完全消失](#gb-20260830-37已有可消费上游产物时下游已归属修复仍从-available-完全消失)
- [GB-20260830-38：accepted 未完成 Goal 的局部纠偏被迫手工扩成整图 successor 迁移](#gb-20260830-38accepted-未完成-goal-的局部纠偏被迫手工扩成整图-successor-迁移)
- [GB-20260830-39：唯一整份 Proposal 已明确询问并获简短确认，decide 仍拒绝 whole confirmation](#gb-20260830-39唯一整份-proposal-已明确询问并获简短确认decide-仍拒绝-whole-confirmation)
- [GB-20260830-40：executor Run completed 后 Review 隐藏且“执行收尾”不说明要 release](#gb-20260830-40executor-run-completed-后-review-隐藏且执行收尾不说明要-release)

## GB-20260830-31：replacement Goal 已生效，旧 Goal 仍进入 Ready

**来源**：CGS AI KOL 研究消费者反馈
**Bug 确认**：已确认是 Molis Work Ready/Available/select 没有消费 canonical active `replaces` 关系的派生生命周期缺陷，不是 CGS 提案漏退役
**修复决定**：已修复；保留旧 Goal 全部历史，用 active `new → replaces → old` 关系派生 `work_state=replaced`，禁止新领取并提供替代 Goal 与撤销关系的恢复说明
**修复状态**：最终交付已闭环。0.1.10 安装 Core 对真实 CGS 只读 Available 复验：旧 `cgs-g2g-ai-kol-quality-roster` 不在 Available，投影为 `work_state=replaced`，返回 active relation 与 replacement_goal_id=`cgs-g2g-ai-kol-quality-roster-v2`；UI 同时保留旧 Goal 历史并标为“已被替代”。未创建 Claim/Run 或修改 CGS 数据

### 1. 真实场景

CGS 已创建并切换到新版 `cgs-g2g-ai-kol-quality-roster-v2`，新范围要求七个平台各 50+，且商业化本身不降权。旧 Goal `cgs-g2g-ai-kol-quality-roster` 理应被替代，但 executor 调用 `molis_work_v1_ready` 时，旧 Goal 仍以可领取项返回；其 Contract 仍写“固定人数 out_of_scope”和“商业污染”，与用户最新确认范围冲突。

### 2. 事实与归因

Owner 已核对真实 canonical：旧 Goal `accepted / closed_leaf / unmet / valid`，新版为 `accepted / closed_compound / unmet / valid`；active Relation 为 `cgs-g2g-ai-kol-quality-roster-v2 → replaces → cgs-g2g-ai-kol-quality-roster`，且旧 Goal 原 part_of、depends_on 和 9 条旧子关系均在同一恢复时间失活，新版父子/下游关系均 active。提案没有漏掉 replacement 或关系迁移。原 `evaluate` / Ready 只检查 Goal 自身状态、依赖、Risk、Policy 和 Claim，没有检查 incoming active `replaces`；Available 的 work-state 派生也同样忽略它。因此归因是 Molis Work 缺陷。graph check 不报错本身合理：图结构有效；缺的是工作生命周期投影，不是图不变量。

### 3. 现有流程的问题

Runtime 无法只靠 Ready 判断哪个 Contract 是当前有效版本，必须额外读取关系图和两份 Contract，并自行推断用户最新授权。若照官方队列领取旧 Goal，会投入真实搜索与证据工作，却按已经过期的数量和商业化口径交付；若两个 Runtime 分别领取新旧 Goal，还会产生冲突证据与重复成本。

### 4. 设计根因与初衷

Molis Work 将 Relation 与 Goal 生命周期分离，初衷是保留历史、避免一条关系在用户未确认时隐式篡改 Goal 的 canonical 状态；`replaces` 可表达版本谱系，但不一定自动等同于 invalid/archived。该边界保护了审计和可逆性。当前缺口候选是 replacement 决定没有一个明确、原子、可恢复的“新 Goal 生效 + 旧 Goal 不再可领取”语义，Ready 也没有根据生效 replacement 派生过期状态。

### 5. 当前影响

已影响 CGS 的真实 executor 选择，错误领取会直接交付与用户当前范围相反的 KOL 名单，属于高代价正确性风险，不只是文案摩擦。触发频率取决于 replacement Goal 数量；一旦发生，每次 Ready 都可能重复暴露旧工作。最新一轮消费者已主动拒绝领取错误旧 Goal，并在生命周期外完成 B 站与知乎观测，说明错误队列已实际迫使工作脱离 Molis Work；虽未产生错误旧 Goal Evidence，流程和审计链已被破坏，优先级升为 P0。

### 6. 复杂度审查

- **当前必须**：核对 replacement 的 canonical 事实；让已被生效 replacement 明确替代的旧 Goal 不进入 Ready/Available/select，或提供同等强度的过期状态与拒绝码；read/check/graph 解释退役路径。
- **可以延后**：通用 Goal 版本树、自动迁移历史 Evidence、跨多代 replacement 的可视化时间线。
- **应当删除**：按标题相似度猜替代；静默删除旧 Goal；只在 Web 隐藏而让 MCP 仍可领取；要求 Runtime 每次自行比较自然语言 Contract。

### 7. 修复必要性与优先级

必须修，P0，已完成源码修复。这是执行正确性与审计链问题：官方队列曾直接引导 Runtime 领取与用户现行范围相反的 Contract，并已迫使真实研究脱离生命周期。修复只消费正式 active `replaces`，不按标题或时间猜测，也不扩大为通用版本系统。

### 8. 修复前后体验差异

- **修复前**：创建新版并建立替代语义 → Ready 同时返回新旧两版 → Runtime 可能领取旧范围。
- **修复后候选**：replacement 决定原子生效 → 旧 Goal 显示被哪条新 Goal 替代且不可领取 → Ready 只返回当前版本；若 replacement 尚未完成退役步骤，Proposal/check 在用户决定前明确提示并阻止“已切换”结论。

### 9. 最小修复范围

复用现有 active `replaces` Relation 作为唯一 canonical 退役事实，不新增第二个可变状态，也不把旧 Goal 改成 invalidated/archived。Work state 派生为 `replaced`；Ready、Available、explain、select 和 Web 共用该判定。Available 将旧 Goal放在不可领取的 blocked 摘要中，并返回 relation id、replacement goal id/title 与恢复说明；Web 保留旧 Contract、历史和关系，明确显示“已被替代”。停用该 relation 后旧 Goal 自动恢复原 work state。暂不迁移 Evidence、不删除 Goal、不按标题推断、不自动撤销替代前已经存在的活跃 Claim；后者若真实发生再单独定义交接策略。

### 10. 验收边界

- **工程验证**：通过（源码）。V1/MCP/Web/i18n 相关全量 178/178，TypeScript 通过。回归覆盖 replacement 生效前旧 Goal 可领取、生效后 Ready/Available 删除可执行入口、blocked/explain 精确指向替代 Goal、select 原子拒绝且不产生 Claim/Run、旧 Goal/关系历史保留，以及停用 relation 后旧 Goal 恢复 `execution_pending`。Web 回归覆盖 `replaced` 状态、新版仍可执行和旧 Contract 可读。
- **产品实操**：通过（真实 CGS 数据安全副本，源码服务）。源码 Runtime 读回旧 Goal=`replaced`、V2=`waiting_children`；旧 Goal 不在 Ready/Available，select 返回 `goal.replaced`，前后 Claims/Runs 均为 0。Safari computer use 打开旧 G2G 后，顶栏显示“已被替代”，下一步是“转到替代 Goal 继续”，正文明确显示新版 `建立七个平台各 50+ 的高质量 AI KOL 详细基线名单` 和“旧 Contract/历史保留但不再允许 Runtime 领取”；关系页仍可打开替代 Goal并看到 12 条已解除历史关系。截图：`docs/qa/bug-revalidation/2026-08-30/gb31-replaced-goal-retired.png`、`gb31-replacement-relation.png`。
- **Owner 最终验收**：通过。最终 0.1.10 安装 Core 对真实 CGS 的 Available 只读复验确认旧 G2G 不在可领取项，返回 `work_state=replaced`、active relation 与 V2 replacement；最终安装 App 同时把旧 Goal 保留为“已被替代”。本次未调用 select、未创建 Claim/Run；直接 select 零写入边界由完整 338/338 回归承担。

---

## GB-20260830-32：leaf_readiness 非法枚举被误报为“没写判断”，无 clarification Run 也缺恢复动作

**来源**：CGS Goal Tree closed_leaf 提案消费者反馈；2026-08-30 来自 `01a04df5-64d8-72e3-ae79-455907c85e86` 的再次提报已去重到本卡
**Bug 确认**：已确认，其中 schema 不可读部分与 GB14 重复且当前源码已修；非法 `decision=defer` 的错误归因和缺少 clarification recovery hint 是仍可复现的 Molis Work 输入校验/恢复提示缺陷
**修复决定**：已授权自主评估与修复，不阻塞 CGS
**修复状态**：2026-08-30 最终收口：0.1.7 MCP schema 显示 `items[].payload.leaf_readiness.split_candidates[].decision = keep | split`；非法枚举返回字段路径、收到值、允许值和 deferred/out_of_scope 建议，无 active clarification Run 返回 `draft_dialogue_resume` recovery hint。Owner 协议验收通过。

### 1. 真实场景

消费者为 closed_leaf Goal 构造 `goal_tree_propose`，把明确排除到未来的候选工作写入 `leaf_readiness.split_candidates`，并给出 `decision: defer` 与理由。服务端只接受 `keep | split`，却返回“候选工作没有写清要留在当前 Goal，还是拆成独立 Goal”；另一次在没有 active clarification Run 时只返回“找不到澄清 Run”。

### 2. 事实与归因

源码复核确认：当前 `molis_work_v1_goal_tree_propose` declaration 已由 GB14 改为 8 个 item kind 的顶层判别分支，`leaf_readiness.split_candidates[].decision` 明确暴露 `keep | split`；消费者看到 `Array<unknown & ...>` 属于旧安装/旧 Session，纳入最终统一安装复验，不重复实现。服务端 `readLeafReadiness` 仍会把任意 decision 强转字符串，随后把非法枚举、缺 work_item 和缺 reason 合并成同一个 `leaf_split_candidate_invalid`，只返回“没有写清”；`requireActiveClarificationProposalRun` 对不存在、非 active 或 Claim 过期也只返回失败文案，没有结构化 next action。前两者均已在当前源码独立确认。

### 3. 现有流程的问题

消费者会重复修改 work_item 与理由，却始终不知道合法值；最终只能离开 MCP 契约查源码。没有 Run 时也不知道应先恢复 Draft dialogue，容易把正常门禁误判成提案 payload 继续有错。

### 4. 设计根因与初衷

`keep | split` 强迫 closed_leaf 对每项候选工作做二分边界，避免把“以后再说”悄悄留在叶子 Goal 中；要求 active clarification Run 则保证提案来自受审计的澄清生命周期。初衷合理，缺陷候选在于 schema 和错误没有把这两个约束自描述出来。

### 5. 当前影响

影响所有通过原生 Goal Tree 接受 Draft 的 Runtime。它不会写坏 canonical 数据，但会阻断提案、增加源码依赖和反复试错；当前 CGS 已绕过，不阻塞主线，优先级暂定 P1。

### 6. 复杂度审查

- **当前必须**：schema 暴露深层 enum；非法值错误包含精确路径、收到值、允许值和“延后项放 out_of_scope/deferred 说明”的恢复建议；无 active Run 错误返回 `draft_dialogue_resume` 路径。
- **可以延后**：正式新增第三种 deferred 领域状态、跨 Proposal 的延期队列。
- **应当删除**：把非法枚举伪装成缺少理由；要求消费者查 TypeScript 源码。

### 7. 修复必要性与优先级

需要修，P1。枚举 schema 已由 GB14 覆盖；本卡只修仍存在的 validator 与结构化 recovery，不扩展 Goal 状态机。旧安装看不到新 schema 的问题合并到 GB14 / GB16 的统一安装复验。

### 8. 修复前后体验差异

- **修复前**：提交 `defer` → 被告知“没有写清” → 改文案/查源码；缺 Run 时也只知道失败。
- **修复后**：提交即看到 `items[0].payload.leaf_readiness.split_candidates[1].decision=defer; allowed: keep, split`，并知道延后项应移出 split_candidates；缺 Run 时直接得到先恢复 dialogue 的下一动作。

### 9. 最小修复范围

已复用 GB14 的 Goal Tree item 判别 schema，并补强 `decision` 字段说明；leaf validator 现在为每个非法枚举返回精确 item/candidate path、收到值与 allowed values，Coordinator 把这些结构化 details 透传到 MCP。缺失、非 active 或 Claim 已失效的 clarifier Run 统一返回 `draft_dialogue_resume`、目标 Goal（可得时）、重试工具和“使用 returned run.run_id”。`goal-advance` planning 参考同步说明延期项的正确位置。暂不支持 `defer` 枚举，不改 CGS Goal，不创建延期系统。

### 10. 验收边界

- **工程验证**：通过（源码）。TDD 红灯先复现 `defer` 被泛化为 `leaf_split_candidate_invalid`、缺 Run 只返回“找不到”；绿灯后 TypeScript 通过，完整 V1/MCP 126/126。回归覆盖 schema 的 `keep | split` 与延期说明、非法值的精确 `items[0].payload.leaf_readiness.split_candidates[0].decision` / received / allowed、缺 Run 的结构化 resume/retry、合法 `keep/split` 原行为，以及两类失败均零 Proposal 写入。
- **产品实操**：通过（源码 MCP 消费面）。实际 `tools/call` 先用不存在 Run 提交，响应直接给出 `molis_work_v1_draft_dialogue_resume` 和 `next_action=draft_dialogue_resume`；随后用真实 `draft_dialogue_start` 返回的 Run 提交 `decision=defer`，消费者收到精确路径、`received_value=defer`、`allowed_values=[keep,split]` 和 `out_of_scope` 修正建议，数据库回读 Proposal 数仍为 0。该问题的最终用户界面是 MCP tool declaration/response，computer use 无法替代协议实操；尝试通过 computer use 打开 Terminal/Codex 可见输出被宿主安全策略禁止，因此没有把一张转录页面冒充产品验收。统一安装后的新 Session 仍为 `UNVERIFIED`。
- **Owner 最终验收**：通过。二分约束未放宽，最终安装 schema、精确错误和 recovery hint 均已核对；用户对提示易懂性的主观判断仍为 `UNVERIFIED`。

---

## GB-20260830-33：单轮 Run 收口后只汇报过去，不交代或继续下一轮

**来源**：CGS 消费者反馈（会话 `01a04fb1-96a1-74b3-9836-604f28f87521`）
**Bug 确认**：已确认，但修正为 Molis Work Skill + MCP handoff 可发现性设计债；消费者遗漏是直接触发，不是 Runtime 状态机错误
**修复决定**：已按 Owner 当前授权批准自主修复，P1
**修复状态**：最终交付已闭环。0.1.10 active Skill 已明确 release 后刷新 Available，并固定汇报下一 Goal、action、why-now 和 continuation boundary；安装 Core 的 Run→release→Available 协议实操通过。当前任务不会热加载新 Skill，真实新 Codex Session 的自然语言汇报表现仍待用户侧观察；未 push

### 1. 真实场景

CGS Runtime 完成一轮 executor Run，登记 Evidence、提交 `needs_changes` Review 并释放 Claim。随后只向用户汇报“本轮做了什么、为何 Goal 仍未完成”，没有在同一汇报中说明最新 Available 的下一项工作，也没有在授权范围内继续。用户必须追问“然后呢，下一步做什么”。

### 2. 事实与归因

消费者提供了完整生命周期顺序和用户追问，足以确认存在真实体验摩擦。源码核对发现：`execution.md` 只要求进度报告包含业务结果、当前阶段、下一动作/owner 和 blocker，却没有把“成功 release 后立即重读 Available”写入正常收口顺序；`molis_work_v1_release` 的 tool description 只有“由领取者释放 Claim”，成功响应也只含 Claim、cursor 和 replayed。与此同时，Available 已提供完整标题、`next_action`、`why_now`、阻塞摘要与并行建议，Web Capsule 也已有“短暂显示刚完成，再切到权威下一项”的回归测试。故主要归因是 Skill + MCP handoff 可发现性设计债，消费者没有报告下一动作是直接触发；不是 CGS 接入、Web 或 Goal 生命周期派生错误。

### 3. 现有流程的问题

单轮状态收口被误当成会话终点。汇报只解释过去，没有固定回答下一目标、下一动作、为何现在做、能否自主继续和无法继续时的替代路径，用户需要额外唤醒一次本可连续推进的工作。

### 4. 设计根因与初衷

Molis Work 将 Claim/Run 做成有限租约并要求显式 release，初衷是及时释放写入所有权；Available 刻意不“派发唯一下一任务”，是为了保留 Runtime 基于能力、优先级、风险与用户授权做选择的责任。这两个边界合理。设计缺口是正常完成顺序停在 release，且 release 返回没有要求回到 Available，导致“Molis Work 不自动派发”被消费者误解成“本轮之后不需要给出去向”。

### 5. 当前影响

影响使用 Molis Work 连续推进长期 Goal 的用户和 Runtime。每个局部 Run 都可能多产生一次“然后呢”的追问；不直接破坏 canonical 数据，但会切断自主推进感，并让用户误以为 Molis Work 机制只负责记账、不负责给出去向。

### 6. 复杂度审查

- **当前必须**：成功 release 后返回只读 Available handoff；Skill 固定 cycle checkpoint 字段，并规定在现有授权内继续、需要新授权或人类决定才停。
- **可以延后**：把完整下一项直接嵌入 release 响应；这需要携带 Runtime capabilities 并耦合选择逻辑，当前无必要。
- **应当删除**：不新增“自动派发下一任务”的后台调度器，不把 checkpoint 变成无限执行授权，也不为一次汇报遗漏改造 Core 生命周期状态机。

### 7. 修复必要性与优先级

需要修，P1。它不破坏 canonical 数据，但每一轮 Run 都可能重复发生，直接损害 Molis Work“持续推进”的产品承诺。最小修复是增强现有协议与成功响应的可发现性，不改变 Goal/Claim/Run 状态机。

### 8. 修复前后体验差异

- **修复前**：用户收到本轮静态报告，再追问“下一步是什么、还会不会继续”。
- **目标体验**：同一 checkpoint 先说明本轮业务结果与边界，再明确下一 Goal 的完整标题、具体动作、现在做的原因和是否会自主继续；只有真实的人类决策、权限或不可替代输入才停下。

### 9. 最小修复范围

修改 `goal-advance` 的执行参考：release 后立即用 summary Available 刷新；cycle checkpoint 固定说明本轮结果与边界、下一 Goal 完整标题、具体动作、why-now、能否自主继续、缺少的人类决定/权限/输入和安全替代项；授权范围内继续，不因 Run 结束停下。给 `molis_work_v1_release` 增加向后兼容的结构化 handoff，明确下一步是只读 `molis_work_v1_available`，读取本身无需确认，真正选择仍受当前用户授权约束；同步 tool description。Web 已有正确切换行为，不改；不让 release 自行查询或选择下一 Goal。

### 10. 验收边界

- **工程验证**：TDD RED 先以真实 Coordinator 调用确认旧 `releaseClaim` 的 `handoff=undefined`；实现后新增 Coordinator 回归覆盖首次释放与幂等重放，MCP 回归覆盖 `tools/list` 可发现说明和真实 JSON-RPC release 响应。最新完整 `pnpm test` 为 327/327、0 fail，`pnpm typecheck` 与 `git diff --check` 通过。验证过程没有隐藏失败：第一次全量运行受沙箱 SQLite 临时目录权限影响出现 `SQLITE_CANTOPEN`；切到正常本机权限后通过。清理 RED 阶段类型强转时曾漏一个右括号，下一轮完整测试在解析阶段发现，修正后重新从头运行并得到上述 327/327。
- **产品实操**：安装协议通过。0.1.10 安装 Core 的隔离旅程中，Run report、Contract 和 blocked overview 都返回精确 release handoff，release 后 self_verifier 进入 Available；active 0.1.10 Skill 明确要求随后输出下一 Goal 完整标题、动作、why-now 和 continuation boundary。新 Codex Session 是否稳定按自然语言格式汇报仍为用户侧 `UNVERIFIED`。
- **Owner 最终验收**：通过。最终安装 Core 与 active Skill 已形成同一交接契约；修复不自动选择、领取或执行，不放宽项目绑定、用户决策、Claim ownership 与 blocker。
- **用户验收**：待新版本发布并由用户在真实连续推进会话中确认，不以 Owner 验收代替。

---

## GB-20260830-34：跨仓库 Goal 的本地 Evidence 无法诚实落档

**来源**：Molis Work 内部 Casebook 消费者反馈（会话 `01a04e4e-f21d-7950-94de-c4d5d1446d14`）
**Bug 确认**：已确认；项目外文件不可 verified 是合理限制，但 `file:` 在 opaque UNVERIFIED 分支前被硬拒绝，与工具承诺矛盾
**修复决定**：已按 Owner 当前授权批准自主修复，P2；先补只登记、不读取的 `file:` locator，不新增多仓验证权限
**修复状态**：最终交付已闭环。0.1.10 安装 Core 隔离实操确认：外部 `file:` locator 与调用方 digest 原样登记为 UNVERIFIED，Molis Work 不读盘、不声称文件存在或 digest 已核验，并返回如何获得 verified 的恢复说明；active Skill 已对齐 0.1.10。多 workspace verified 能力仍按本卡明确延后；未 push

### 1. 真实场景

Runtime 当前 canonical workspace 是 Molis Work 仓库，但 Goal `casebook-private-foundation` 的已确认跨仓库产物位于私有仓库 `molis-work-casebook`。消费者以五个 `file:///.../molis-work-casebook/...` locator 和 SHA-256 提交 Evidence，均收到“不能指向项目范围外的本地文件”；在尚无 commit/push 授权时，也不能用 GitHub commit URL 冒充已发布证据。

### 2. 事实与归因

已用当前 locator 校验器稳定复现：同一个项目外文件写成 `file:///...` 返回 400“项目范围外”；写成 `artifact://molis-work-casebook/...` 会原样保存为 UNVERIFIED；裸绝对路径也按项目外拒绝。源码显示 `file:` 与 Windows 盘符在 opaque protocol 判定前被特判抛错，而 MCP description 明确承诺“外部或不透明 locator 也会保留”。因此问题成立为 Molis Work locator 分类和恢复契约缺陷。项目 catalog 的确能让一个 Molis Work 项目关联多个 workspace，但当前 Evidence 只使用本次 Runtime 的 canonical workspace；把所有历史关联目录都变成当前可读取根会扩大本地文件访问权，不是本轮最小修复。

### 3. 现有流程的问题

当前可验证路径只承认 canonical workspace 内文件，这一点正确；问题是显式表达“仅登记这个本地位置”的标准 `file:` URI 也被当成越界读取请求拒绝，错误没有告诉消费者可用什么不透明格式。消费者只能把同一路径改写成自造 scheme 试错，或伪造尚不存在的远端 URL。

### 4. 设计根因与初衷

初衷是把项目内只读预检限制在明确 canonical workspace 中，防止任意本机文件读取、路径逃逸和把外部内容冒充 verified；`file:` 的早期拒绝延续了这一保守规则。这个读取边界合理，但“允许登记”和“允许读取/验证”被错误耦合：系统已经用 UNVERIFIED 表达 HTTP、自定义协议和过大项目文件，却没有把同一语义用于显式 `file:` URI。

### 5. 当前影响

影响实现跨多个本地仓库、但 Molis Work 项目只绑定一个 canonical workspace 的 Goal。它不阻止产物生成，但会让真实本地 Evidence 无法以清晰、稳定、可审计的 locator 落档，并把“未由 Molis Work 预检”误解成“不能登记”。

### 6. 复杂度审查

- **当前必须**：把 `file:` 作为仅登记的机器本地 locator 原样保存为 UNVERIFIED；明确未读取、未确认存在、未核验 digest，并让 Web 只复制不打开。同步 MCP 和 Skill 的恢复说明。
- **可以延后**：Goal/Project 正式关联多个可验证 workspace，或从项目 membership 中选择第二个验证根；只有用户明确需要 Molis Work 打开并校验第二仓文件时再评估其授权模型。
- **应当删除**：不允许任意 `file://` 绕过范围检查，不因同机路径存在就标为 verified，不把未 push 的本地文件伪装成 GitHub Evidence。

### 7. 修复必要性与优先级

需要修，P2。跨仓产物常见且现有 UNVERIFIED 模型已经能安全表达，不修只会迫使消费者发明 scheme、重复提交或留下虚假远端地址；但已有 opaque workaround，且不阻断产物本身，所以不是 P0/P1。

### 8. 修复前后体验差异

- **修复前**：跨仓本地路径被当作越界读取直接拒绝，消费者靠猜测 locator 或虚构远端地址才能继续。
- **修复后**：系统明确区分“当前项目内、可预检”与“项目外、仅登记且 UNVERIFIED”；后者保留 locator 和 digest，并清楚说明未读取、未验哈希和如何升级为受控验证。

### 9. 最小修复范围

复用现有 Evidence 字段与 UNVERIFIED 状态：仅把 `file:` 从硬拒绝分支移入独立的外部本地 locator 分支，保留原 locator 与 digest，返回明确原因；同步 MCP description、Skill 和 Web 安全回归。裸绝对项目外路径、Windows 本地路径、symlink 逃逸仍拒绝；不新增多仓权限表、跨仓文件打开、自动 digest 校验或远端发布假设。

### 10. 验收边界

- **工程验证**：TDD RED 已证明旧行为的三个边界：Core 抛 `evidence.locator_outside_project`、Web POST 返回 400、MCP schema 缺少 `file:` 恢复方式。最小实现后同三条 GREEN 3/3：Core 原样保留 locator/digest 且不记录 verified workspace，MCP 明确 `file:///` 仅登记规则，Web 显示 UNVERIFIED 并且不生成 `file:` 链接或项目引用打开端点。最新完整 `pnpm test` 为 328/328、0 fail，`pnpm typecheck` 与 `git diff --check` 通过；原项目内 absolute/`project://`/`repo:`、裸项目外路径拒绝、symlink 逃逸、大文件和项目引用打开回归均保留。
- **产品实操**：通过源码真实路径。使用实际 `~/adeptify-home/repos/molis-work-casebook/README.md` 和 SHA-256 `4f8194b4e27027ec866fdc65a028b40601f7a5390df3a279251e39c3d1096134`，在临时 Molis Work 数据库、当前 workspace=`molis-work` 下提交：`file:///.../molis-work-casebook/README.md` 一次创建为 UNVERIFIED，locator 与 digest 原样保留、`locator_workspace_id=null`；同轮 `molis-work/README.md` 规范化成 `project://README.md` 并 verified，跨仓裸绝对路径继续返回 `evidence.locator_outside_project`。随后 computer use 打开“记录 → 执行与检查”，页面可见完整 locator、UNVERIFIED、digest、未读取/未核验和升级说明；该 locator 是“复制引用”按钮，不是链接，也没有项目引用打开入口。临时数据和服务已清理，Casebook 仓库未修改。
- **Owner 最终验收**：通过。修复消除了协议矛盾并保留原安全目标：`file:` 不触发 `realpath/stat/read`，不验证存在或 digest，不记录 verified workspace，也不能从 Web 打开；裸项目外路径和 symlink 逃逸仍拒绝。多 workspace verified 能力不在本次范围。
- **用户验收**：最终 0.1.10 安装 Core 已用等价跨仓 `file:` locator 实操通过，active Skill 也已对齐；真实 Casebook 新 Session 的自然语言使用感受仍由消费者后续观察。

---

## GB-20260830-35：依赖视图顶部工作区标签重叠，标题无法辨认

**来源**：Molis Work Owner 在「Molis Work 内部 Casebook」真实 Web 使用中的直接反馈与截图
**Bug 确认**：已确认，Molis Work 共享工作区标签栏的响应式布局缺陷；真实 Casebook 的 Web 与桌面 0.1.8 均稳定复现
**修复决定**：已按 Owner 当前授权批准自主最小修复，P1；保留共享 UI 和横向滚动设计，只修标签 flex 收缩边界
**修复状态**：最终交付已闭环。修复已进入 0.1.10；最终安装 App 的真实 CGS 多个长工作标签保持各自可读宽度并横向承载，没有文字互相覆盖。此前真实 Casebook Web/Desktop 复验仍保留；未推送或发布 GitHub Release

### 1. 真实场景

用户在「Molis Work 内部 Casebook」项目打开 Goal Tree，从列表视图切换到依赖/关系视图。主区域顶部同时打开多条 Goal 工作区标签后，右上方各标签的名称和状态文字堆叠到相邻标签上，无法辨认当前打开项和各标签边界。

### 2. 事实与归因

用户提供的 Web 截图已直接显示多个标签标题、状态圆点与文字发生横向重叠；Owner 又在 Chrome 打开真实 Casebook、切到依赖视图并依次打开 4 个 Goal，实际像素截图再次出现第 1、2 个标签内容覆盖。随后在安装版桌面 0.1.8 以同一项目、同一依赖视图、同样 4 个 Goal 标签复测，桌面顶部也出现相同覆盖，故问题属于共享 Web UI，不是某一外壳独有。源码显示父容器 `.desktop-work-tabs` 已设置 `overflow-x:auto`，设计本应在空间不足时滚动；但子项 `.desktop-work-tab` 同时使用 `min-width:0` 且未禁止默认 `flex-shrink:1`。标签被压到小于内部固定 24px 关闭列和文字网格所需宽度后，内容画出自身盒子并覆盖相邻项。根因是滚动容器与可收缩子项的约束相互抵消。

### 3. 现有流程的问题

切换依赖视图后，用户无法可靠判断当前选中的 Goal、相邻标签分别是什么，也无法安全切换或关闭目标标签；必须根据正文或反复点击猜测，破坏了多 Goal 对照工作流。

### 4. 设计根因与初衷

现有顶部工作区让多个 Goal 保持上下文并快速切换；容器刻意启用横向滚动并隐藏滚动条，初衷是在不增加多行高度的前提下容纳更多标签。实现时为支持标题省略给标签和按钮设置了 `min-width:0`，却没有为外层 flex item 设置不可继续压缩的可读宽度；默认收缩优先发生，导致原本的滚动降级从未被触发。这是合理初衷下的 CSS 约束遗漏。

### 5. 当前影响

直接影响使用关系图同时查看多个 Goal 的 Web 用户；若桌面端复现，则影响共用该 UI 的全部桌面用户。当前证据表明阅读与切换受到实质影响，但是否导致误关、误选或数据写错尚无证据，不扩大为数据正确性故障。

### 6. 复杂度审查

- **当前必须**：双端复现；找出真实宽度与 CSS 约束；保证标签标题不互相覆盖，当前标签和关闭/状态控件可辨认。
- **可以延后**：标签拖拽排序、持久化宽度、自定义多行标签或完整标签管理器。
- **应当删除**：不为单个响应式故障重做整个工作台，不复制一套桌面专属标签实现，不以隐藏标题或减少可打开 Goal 数量掩盖问题。

### 7. 修复必要性与优先级

需要修，P1 视觉可用性问题。它已在真实 Casebook 的两个正式入口复现，核心导航名称不可读且关闭/切换目标难以区分，不是轻微对齐偏差；修复只需恢复既有横向滚动设计，风险和复杂度都低。

### 8. 修复前后体验差异

- **修复前**：空间不足时相邻标签内容覆盖，用户看不清当前和目标标签，只能猜测切换。
- **目标体验**：标签在同样窗口与同样数量下采用明确的截断、最小宽度或横向滚动策略；任何标签的文字和控件都不会画到相邻标签上，当前项仍清楚可见。

### 9. 最小修复范围

只调整共享 `.desktop-work-tab` 的 flex basis/收缩与可读最小宽度，让 `.desktop-work-tabs` 在超出容量时按既有设计横向滚动，并补 CSS 回归测试。Web 与桌面继续共用同一实现；不改变 Goal Tree、关系图、标签数据模型、打开/关闭语义、标签数量上限或桌面壳层。

### 10. 验收边界

- **工程验证**：通过（本地源码）。TDD RED 先证明工作区样式只有滚动容器、标签仍可默认收缩且缺少可读宽度约束；最小修复为 `.desktop-work-tab` 增加 `flex: 0 0 clamp(132px, 16vw, 190px)`，既有标题省略与关闭列不变。回归已进入默认 `tests/web.test.ts`，相关测试、TypeScript、`git diff --check` 和完整 `pnpm test` 329/329 均通过。`tests/visual-foundation.test.ts` 有两条与本卡无关且在 HEAD 已存在的陈旧断言（颜色 token 与 workbench grid 列数）未被默认测试脚本收录，本卡没有顺手改写或把它们冒充通过。
- **产品实操**：通过（真实 Casebook 数据）。修复前分别用 Chrome Web 与安装版桌面 0.1.8 打开真实「Molis Work 内部 Casebook」关系视图并保留 4 个长标题标签，两端都稳定复现相邻标题覆盖。源码修复后以同一项目、同一关系视图和同样 4 个标签复测通过。2026-08-30 又用 computer use 直接打开 `/Applications/Molis Work.app`，Info.plist 为 0.1.9，服务 launcher 也指向 `molis-work-0.1.9` 且 `/health` 正常；真实 Casebook 保留 5 个长标题标签并切到“可视化工作区”后，各标签仍有独立盒子，长标题只在自身范围内省略，关闭按钮与当前选中态清楚，没有再重叠。
- **Owner 最终验收**：通过（含安装 App）。根因、最小 diff、Web/桌面真实像素结果和安装产物均已独立检查；不扩展为标签系统重构。
- **用户验收**：待用户在最终安装包中确认标签可读与切换体验。

---

## GB-20260830-36：Available 未暴露关键 scope 冲突，消费者领取后才发现 Goal 不承接当前产物

**来源**：CGS 消费者反馈（会话 `01a04fb1-96a1-74b3-9836-604f28f87521`）
**Bug 确认**：已确认，属于 Runtime Skill / MCP 工具说明的领取顺序缺陷；不是 Available Core 应自动理解自然语言意图的缺陷
**修复决定**：已按 Owner 授权批准自主最小修复，P2；把选中候选的 Contract scope 核对移到原子创建 Claim/Run 之前，并补领取工具的边界提示
**修复状态**：最终交付已闭环。0.1.10 active Skill 与 MCP 工具说明均要求先把 Available 项作为候选、只读完整 Contract 并核对当前请求与 in/out scope，再原子 Select；安装 Skill 已与 release SHA-256 一致。真实新 Codex Session 是否遵守该顺序仍待用户侧观察；未推送或发布 GitHub Release

### 1. 真实场景

用户当前授权动作是把 G2F「明确选题竞争力分析」产生的候选 Content Bet 接入既有选题编辑台。Runtime 读取 Available 后只看到可执行的 G2E「开放研究发现机会」，随即领取；领取后读取完整 Contract 才发现 G2E 的 `out_of_scope` 明确排除了「明确选题 Report」。Runtime 最终把误领 Run 标为 `abandoned`，未提交 G2E Evidence，产品接入在 Goal 生命周期外完成。

### 2. 事实与归因

消费者提供了请求、Available 选择、Contract 边界和 abandoned 收口，足以确认一次真实误领与额外 Run 噪声。源码与正式 Skill 核对显示，Available 默认摘要只返回 Goal ID、标题、角色、动作、依赖/Risk 和规划摘要，不携带完整 Contract；这符合既有的输出体积控制。真正缺陷在官方执行顺序：`execution.md` 第 5 步要求对非 complete 项先调用 `molis_work_v1_select_goal`，下一段才要求“选中后调用 Contract before acting”。`select_goal` 会原子创建 Claim 与 Run，因此 Contract 的 `out_of_scope` 只能在审计记录已经产生后才被看到；同一段又要求按 Contract 选择候选，前后语义矛盾。这不是消费者单纯误用，也不是 Available Core 能在没有接收当前自然语言意图时自行判断的内容路由问题。

### 3. 现有流程的问题

消费者在候选选择阶段只看到“可执行”，没有看到当前产物与 Goal scope 的冲突；完整边界直到创建 Claim/Run 后才出现。纠正虽然没有污染 Evidence，却多出一次领取、Run、abandon 和解释成本，并使真正的跨 Goal 接入动作仍没有 canonical 承接者。

### 4. 设计根因与初衷

Available 的初衷是从 canonical 状态、依赖、Risk、角色和优先级派生“哪些 Goal 可以被领取”，而不是理解任意对话任务或替 Runtime 做业务归属判断；默认 summary 也用于控制输出体积，避免项目 Goal 较多时再次出现超长响应和截断。这些边界合理。缺陷来自两阶段读取的顺序写反：为了紧凑而把 Contract 留到候选选中后读取是合理的，但“选中候选”不应等同于立即写入 Claim/Run；Runtime 应先把它作为 tentative candidate 只读核对 Contract，再执行原子领取。

### 5. 当前影响

影响一个项目中存在相邻但边界不同的 Goal、并需要把上游产物接入下游界面的消费者。直接影响是重复 Claim/Run 和审计噪声；如果消费者没有像本次一样及时 abandoned，还可能把 G2F 产物错误登记成 G2E Evidence，污染验收真相。当前没有证据表明 canonical 已被污染。

### 6. 复杂度审查

- **当前必须**：将正式 Skill 改为 `available summary → 暂选候选 → contract scope 核对 → select_goal`；明确当前请求命中 `out_of_scope` 时不得领取，并说明无匹配 owner 时不制造 Run；同步 Available / Select 工具说明，使 Runtime 在只看工具契约时也不会写反顺序。
- **可以延后**：给 Available 增加可选的结构化 `current_intent` 或单独的 scope-match 能力；只有多次证明客户端 Contract 核对仍不足时再评估。
- **应当删除**：不让 Core 猜测未传入的自然语言意图，不把所有 Goal 的完整 Contract 重新塞回 Available，不为一次跨 Goal 接入新建自动路由系统。

### 7. 修复必要性与优先级

需要修，P2 流程正确性问题。它不会使不合适的 Goal 在 canonical 资格判断上变成“错误 Ready”，但官方顺序会诱导创建错误 Claim/Run，并带来 Evidence 归属污染风险。修复不涉及 Core 状态机和数据迁移，只纠正只读核对与原子领取的先后关系。

### 8. 修复前后体验差异

- **修复前**：看到首个 `execute` 就领取，创建 Run 后才发现当前产物被该 Goal 明确排除，只能 abandoned。
- **目标体验**：领取前即可看到与选择相关的关键 scope 警示，或被协议强制先核对选中 Goal Contract；没有匹配 owner 时明确返回“当前 Available 无承接 Goal”和下一恢复动作，而不是制造错误 Run。

### 9. 最小修复范围

复用现有紧凑 Available 与单 Goal Contract：修改 `goal-advance` 执行顺序，要求暂选候选后先只读 Contract，并在当前请求不属于 `in_scope`、命中 `out_of_scope` 或没有 canonical owner 时禁止 `select_goal`；同步 `molis_work_v1_available` 与 `molis_work_v1_select_goal` 的工具说明。暂不向 summary 增加完整 scope 字段，不修改 CGS Goal、不自动迁移 Evidence、不增加服务端自然语言分类器。

### 10. 验收边界

- **工程验证**：通过（本地源码）。TDD RED 先证明 MCP 工具说明和正式 Skill 仍要求 `available → select_goal`，且不存在“暂选候选、先读 Contract、核对 scope”门禁；修复后相关 MCP/Skill 回归通过，完整 `pnpm test` 329/329、TypeScript 和 `git diff --check` 均通过。Core Available、Contract 数据模型、Claim/Run 原子性与紧凑 summary 均未改变。
- **产品实操**：安装协议通过。0.1.10 active Skill 与安装 MCP tool description 均明确 `available → contract → select_goal`，命中 `out_of_scope`、Contract 矛盾或没有 canonical owner 时不得创建 Claim/Run；Codex integration=`connected` 且 active Skill 与 release SHA-256 一致。真实新 Session 的自然语言遵循仍由用户侧观察。
- **Owner 最终验收**：通过（含安装产物协议边界）。只纠正只读 scope 核对与原子领取的顺序，不让 Core 猜自然语言、不把所有 Contract 塞回 Available，也不自动创建新 Goal。
- **用户验收**：若进入发布，待真实 CGS 新 Session 在同类 handoff 中确认不再误领。

---

## GB-20260830-37：已有可消费上游产物时，下游已归属修复仍从 Available 完全消失

**来源**：CGS 消费者反馈（会话 `01a04fb1-96a1-74b3-9836-604f28f87521`）
**Bug 确认**：部分成立。普通 dependency/review blocker 从 Available 完全不可发现是 Molis Work 可见性缺陷；三条 active 依赖仍未满足时不自动放行 G2B 是正确门禁，不能由仓库里存在 fresh Report 推翻
**修复决定**：已按 Owner 授权批准最小修复，P1/P2；增加紧凑 `blocked_overview` 并要求明确 owner 缺席时先 Explain，不增加 artifact-level dependency 或自动绕过依赖
**修复状态**：Core/MCP/Skill 最小实现、完整工程验证、真实 CGS 安全副本协议实操与 Web computer-use 核对通过；实际提交为 `a638d67`。修复已进入此前安装的本机 0.1.9，安装产物隔离实操通过；未推送或发布 GitHub Release

### 1. 真实场景

用户在真实 G2B 选题编辑台看到：团队已有推荐 angle 与研究理由，Owner 仍被要求从空白 textarea 重填，并直接看到英文 Zod 错误。该最小修复已经由用户批准，且消费者判断它落在 G2B「让账号 Owner 无重复操作地决定内容机会并交给创作」的既有 `in_scope` 与 business logic 内；但 `molis_work_v1_available` 既不返回 G2B，也不将其列入 blocked，只有另行 Explain 才能看到 G2D/G2E/G2F 尚未 fulfillment 的依赖门禁。

### 2. 事实与归因

Owner 已只读绑定真实 CGS 并复核 canonical 数据。G2B 是 `accepted / closed_leaf / unmet / valid`，当前 `work_state=review_blocked`，有 1 个 pending self-verifier obligation；Explain 返回 G2D、G2E、G2F 三条 `dependency.unsatisfied`。这三条 active `depends_on` 均在 2026-08-29 15:49 后生效，而 G2B 的 8 条 passed Evidence、最近 executor/self-verifier Run 与 4 次 Review 都更早；现有 Evidence 因此不能证明新增依赖已满足。Available 的 `blocked` 只收 `completion_blocked / waiting_for_human / replaced`，真实 G2B 既不在 available，也不在 blocked，只有知道稳定 ID 后另调 Explain 才可发现。故可见性缺陷可复现；“fresh G2F Report 已存在，所以应允许执行”的归因证据不足，文件或局部输出不等于三条 provider Goal 已 canonical satisfied。

### 3. 现有流程的问题

严格按 Available 的 Runtime 无法发现这个局部修复已有 G2B owner；若直接在仓库修会形成生命周期外工作，若领取相邻 G2E/G2F 又会污染 Evidence。消费者还必须额外猜到并调用 Explain，才能知道 G2B 不是不存在，而是被依赖门禁隐藏。

### 4. 设计根因与初衷

依赖门禁的初衷是防止下游在 provider 结果尚未可信完成时提前执行，避免以半成品输入形成错误验收。待审查的设计点有两个：Available 是否过度过滤而没有保留 dependency-blocked 摘要；`depends_on` 是否只能表达“provider 整体完成”而不能表达“某个可消费输出已可用，但 provider 仍有其他未完成工作”。

### 5. 当前影响

直接影响已 accepted、已有真实局部输入、需要修复自身 UI 的下游 Goal。当前证据支持一次真实绕行风险和 owner 不可发现；尚无证据表明应普遍放宽所有依赖，也不把“fresh Report 存在”自动等同于已 canonical、可信且满足 G2B 所需输入。

### 6. 复杂度审查

- **当前必须**：让普通 phase/dependency blocker 以紧凑 overview 保持可发现；当前请求明确属于某个 owner 时，先 Explain 该 Goal，而不是领取相邻 Goal；保留完整依赖门禁。
- **可以延后**：引入显式 provider output readiness / artifact-level dependency，以及“只修既有实现但不消费上游业务输出”的 maintenance/rework 模式；只有更多真实案例证明 Goal 级依赖过粗且可定义安全验收时再评估。
- **应当删除**：不因一个 UI 缺陷就普遍忽略未完成依赖，不让 Runtime 用仓库文件存在性自行宣布上游可消费，不创建第二套隐形任务账本。

### 7. 修复必要性与优先级

需要修可发现性，P1/P2；不修自动放行。用户正在真实 G2B 页面且 Contract 明确承接窄 UI/恢复，说明 owner 归属可信；但 Molis Work 不能据此宣布三条上游依赖满足。最小修复应阻止“owner 消失后误领最近 Goal”，而不是为解决一次 UI 缺陷削弱全局依赖语义。

### 8. 修复前后体验差异

- **修复前**：Available 看不到 G2B，也看不到它为何不可执行；Runtime 只能额外 Explain、账本外修复或误领相邻 Goal。
- **目标体验**：Available 至少显示 G2B 的 dependency-blocked 摘要与恢复动作；若 canonical 已证明 G2B 所需输入可消费，则同一 G2B 可合法承接局部修复，否则清楚说明缺少哪项 provider 输出，而不是只给整体 fulfillment。

### 9. 最小修复范围

在 Core `queryAvailable` 增加与完整 `blocked` 分离的紧凑 `blocked_overview`：只列普通 clarification/waiting-children/execution/review/revalidation/invalidated 阶段的 Goal 标题、状态、原因 code/message、priority 和 `next_action=explain`；MCP summary 保持紧凑，Skill 规定明确 owner 缺席时先看 overview 并 Explain。现有 `blocked` 继续承载 completion/human/replaced 的完整恢复事实；不修改 CGS Goal、Evidence、Review 或 relation，不自动解除依赖，不扩展自然语言路由器。

### 10. 验收边界

- **工程验证**：通过（本地源码）。TDD RED 先证明 dependency-blocked accepted leaf 的 `blocked_overview` 为 undefined；实现后 Core、MCP summary、tool description 与正式 Skill 回归通过，要求 overview→Explain→不得领取相邻 Goal。完整 `pnpm test` 329/329、TypeScript 和 `git diff --check` 均通过；MCP 全文件在受限沙箱首次受 SQLite 临时目录影响，正常本机权限下完整归零。
- **产品实操**：通过（真实 CGS 只读事实 + 安全副本源码协议 + 安装产物隔离协议）。官方 0.1.8 MCP 中 G2B 在 Available/blocked 缺席，Explain 返回三条真实依赖；Contract/历史时间线证明现有通过证据早于新依赖。用 SQLite 在线只读 backup 生成临时 CGS 副本后，源码返回 `available=7 / blocked=4 / blocked_overview=13`，其中 G2B 为 `review_blocked / next_action=explain` 并保留三条依赖摘要；尝试选择 G2B 返回 `allowed=false`，Claim/Run 增量均为 0。computer use 又核对真实 G2B Web 状态。2026-08-30 直接使用已安装 0.1.9 dist 创建隔离 provider/consumer 依赖：consumer 出现在 `blocked_overview`，`work_state=execution_blocked`、`next_action=explain`、reason=`dependency.unsatisfied`，不进入 Available 且 select `allowed=false`。未修改 CGS。
- **Owner 最终验收**：通过（含安装产物）。既有 owner 现在可在紧凑协议中被发现，消费者有确定的 Explain 动作；真实依赖与禁止领取边界均保留。明确拒绝把 fresh 文件存在性升级为 provider fulfillment，也不把局部 UI owner 归属误解为依赖已满足。
- **用户验收**：若发布，待真实 CGS 新 Session 确认 G2B owner 与阻塞原因可见，且不会误放行不可信输入。

---

## GB-20260830-38：accepted 未完成 Goal 的局部纠偏被迫手工扩成整图 successor 迁移

**来源**：CGS 消费者反馈（会话 `01a04fb1-96a1-74b3-9836-604f28f87521`）
**Bug 确认**：部分成立。accepted Contract 不可原地改写是必要审计边界，不是 Bug；真实缺陷是 closed leaf 被错误归为 compound closure、文案误称“父 Goal”，且强制 successor 时只给抽象动作，不提供 canonical 关系迁移清单与可复用骨架
**修复决定**：保留不可变设计，最小修复现有冲突契约与恢复信息；不新增 Contract revision 状态，不自动迁移关系，不改 CGS canonical 数据
**修复状态**：本地源码已修复并完成全量工程验证与已安装 0.1.9 隔离产品实操；已进入本节所在的本地合并 bugfix commit。此前安装的 0.1.9 已包含本卡实现，本轮没有重新构建；真实 CGS 新 Session 与用户主观验收仍待后续

### 1. 真实场景

用户纠正 CGS 的 Opportunity、Content Bet 与写作 angle 边界后，Runtime 在既有 clarifier Run 中提议更新仍未完成的 G2 父 Goal和 G2B closed leaf。`goal_tree_propose` 成功，`goal_tree_check` 对两项均以 `goal.accepted_compound_closure_invalid` 拒绝，要求创建 replacement Goal、增加 `replaces` 并迁移关系；G2B 明明是 `closed_leaf`，错误仍称“已接受父 Goal”。

### 2. 事实与归因

源码核对确认 `acceptedCompoundClosureConflict` 同时承接 accepted leaf 与 compound 变化，旧实现让 closed leaf 也落入 `goal.accepted_compound_closure_invalid`，且 recovery 只有 `create_replacement_goal / migrate_relations=true`。但 accepted Contract 不可变仍保护执行、Evidence 和 Review 所依据的历史承诺；不能因为 Goal 尚未 satisfied 就原地改写。因此归因为恢复契约缺陷，不把不可变设计本身判成 Bug。

### 3. 现有流程的问题

一次已确认的局部语义纠偏无法直接得到可执行恢复方案：消费者只收到抽象动作名称，必须自行枚举 `part_of`、`depends_on`、下游关系和 replacement item ID，容易漏迁移；错误又把 leaf 误称为父 Goal，增加误诊。为避免高成本，Runtime 可能绕过 Molis Work 在仓库外修复，或提交不完整 successor 图。

### 4. 设计根因与初衷

accepted Contract 不可变的初衷是避免执行和验收所依据的承诺被原地改写，保留“当时同意了什么”的历史真相；replacement + `replaces` + relation migration 让需求变化显式形成新版本。当前待查的是：同一不变量是否使用了过窄错误码/文案，以及 Molis Work 既然强制 successor，是否缺少把 canonical 图转换成安全迁移草案的恢复能力。

### 5. 当前影响

影响已经 accepted 但尚未 satisfied、且用户在真实使用中继续纠偏的 Goal。直接代价是增加 proposal item、关系枚举、技术 ID 和再次核对成本，并引入漏迁移造成孤立/双真相的风险；本次 check 尚未改变 canonical tree，因此没有已发生的数据损坏证据。

### 6. 复杂度审查

- **当前必须**：区分 leaf/compound 的准确错误码与文案；返回必须处理的 active relations、受影响 Goal 与确定 recovery action；验证 check 与 decide 使用同一不变量。
- **可以延后**：自动创建或自动提交完整 successor Proposal；为 accepted+unmet 引入受审计 Contract revision，只有证明人工确认后的 replacement 仍长期阻碍正常纠偏且审计语义可保持时再评估。
- **应当删除**：不直接放开 accepted Contract 原地覆盖，不让系统猜测关系迁移方向，不为单一 CGS 案例建立第二套 Contract 版本模型。

### 7. 修复必要性与优先级

需要修复，P1；已经完成本地最小修复。它影响每次 accepted Goal 需求变化的合法恢复，错误关系迁移会形成双真相。没有必要放宽不可变性或增加 revision 状态机。

### 8. 修复前后体验差异

- **修复前**：check 只说创建 replacement、replaces、迁移关系，leaf 还被称为父 Goal；消费者需查图并手写大提案。
- **目标体验**：check 准确说明哪个不变量被触发、当前 Goal 是 leaf 还是 compound、哪些 active relations 必须保留/迁移，并给可直接用于下一步的结构化恢复清单；仍需用户确认新的业务语义，但不再靠猜内部图结构。

### 9. 最小修复范围

复用现有 replacement 机制：closed leaf 返回准确的 `goal.accepted_contract_immutable`，compound 保留 closure 语义；冲突中增加 `current_goal`、`successor_outline` 与按 active canonical relation 生成的 `relation_migration_candidates`。候选明确旧/新端点、关系类型、停用时机和 `requires_review`，但不自动决定、不自动 materialize、不放宽历史不可变性。

### 10. 验收边界

- **工程验证**：通过。accepted closed leaf 回归确认错误码、当前 Goal、new goal/criterion ID 要求、`replaces` 骨架、`part_of` / `depends_on` 逐关系迁移候选与 check 零写入；whole-confirm 同源预检回归同时通过。2026-08-30 最终整合态 `pnpm typecheck && pnpm test` 在正常本机权限下 331/331、0 fail；受限沙箱曾因 SQLite 临时目录权限出现 `unable to open database file`，同一代码在沙箱外完整归零，未把环境假失败计为代码回归。
- **产品实操**：通过（已安装 0.1.9 隔离项目）。直接加载本机 `molis-work-0.1.9/dist` 创建 accepted/closed_leaf Goal，并保留一条 `depends_on` 与一条 `part_of` active relation；从正式 clarification Run 提交局部 Contract update，再执行 check，实际返回 `goal.accepted_contract_immutable`、`current_goal.decomposition_state=closed_leaf`、replacement 的 `replaces` 骨架，以及按 `depends_on`、`part_of` 排列的两条 relation migration candidates。check 没有修改 canonical Goal/Relation；未触碰真实 CGS proposal。
- **Owner 最终验收**：通过（含安装产物）。设计边界、最小 diff、具体 recovery plan 与零写入预检均已复核。
- **用户验收**：待最终安装版由真实 Runtime 确认无需查源码或手工猜迁移项。

---

## GB-20260830-39：唯一整份 Proposal 已明确询问并获简短确认，decide 仍拒绝 whole confirmation

**来源**：CGS 消费者反馈（会话 `01a04fb1-96a1-74b3-9836-604f28f87521`），为 GB38 successor 恢复旅程中的后续独立故障
**Bug 确认**：已确认。Runtime 已提交明确 whole-confirm 标志和目标 proposal_id；源码却用 Board 全局 pending Proposal 数量代替“上一问点名哪一份”的授权事实，无关待审提案会制造虚假歧义
**修复决定**：P1，保留简短确认安全门禁，把 Runtime attestation 精确绑定到本次 `proposal_id`；不解析自然语言，不把确认扩展到其他 Proposal
**修复状态**：本地源码已修复并完成全量工程验证与已安装 0.1.9 隔离产品实操；已进入本节所在的本地合并 bugfix commit。此前安装的 0.1.9 已包含本卡实现，本轮没有重新构建；真实 CGS 新 Session 与用户主观验收仍待后续

### 1. 真实场景

successor Proposal 已通过 `goal_tree_check`。Runtime 上一条消息把这一份 Proposal 作为唯一待决定项，并明确询问“确认按这份 Goal 变更落地吗？”，用户回复“好的”。调用 `goal_tree_decide(confirm_all_pending=true, whole_confirmation_prompted=true)` 仍被拒绝，要求说明确认哪些条目；消费者改成对同一 7 项逐项 `decisions=confirm` 后才成功。

### 2. 事实与归因

源码确认 Runtime wrapper 会从宿主 Session 生成 `conversation_ref`、从 `confirmation_summary` 生成 attestation，并把 `whole_confirmation_prompted` 传入 Core；但 Core 又要求整个 Board 的 active Proposal 数量恰为 1。这个条件既不能证明上一问，也会被无关 Proposal 破坏。归因是 Molis Work 授权绑定缺陷，不是用户确认不足，也不是 CGS 误用。

### 3. 现有流程的问题

标准“展示唯一整份提案 → 明确询问 → 用户简短确认”不能一次落地，Runtime 必须把整份授权机械展开成 7 个逐项决定。额外复杂度会诱发漏 item、错误理由或把整份授权误解为独立逐项授权，也让用户误以为还需重复确认。

### 4. 设计根因与初衷

简短确认门禁的初衷是防止把脱离上下文的“好的”扩大解释成对多项写入的授权；只有上一问明确、唯一且完整时才允许 whole confirmation。当前待查的是 Runtime 能否向 Molis Work 提供并持久核对这一上一问，还是服务端要求了调用方无法可靠证明的会话事实。

### 5. 当前影响

影响包含多 item 且采用自然对话确认的 Goal Tree Proposal。直接代价是重复 payload 和授权表达；本次逐项路径已成功落地，没有未应用或部分应用损坏证据，但绕行降低了 whole-confirm API 的可信度。

### 6. 复杂度审查

- **当前必须**：把上一问精确绑定到本次 `proposal_id`；attestation digest 覆盖 proposal、whole-confirm 标志与确认摘要；错误返回预期/收到的 Proposal 和确定 remediation；保证授权不被扩大到其他 Proposal。
- **可以延后**：由宿主自动签名/绑定完整会话 turn；只有现有 message refs 无法稳定表达时再扩展协议。
- **应当删除**：不因为用户说“好的”就取消歧义保护，不让 Runtime 自行声明不存在的上一问，不把逐项 decisions 永久作为 whole confirmation 的替代。

### 7. 修复必要性与优先级

需要修复，P1；已经完成本地最小修复。它不造成部分写入，但会让正确的唯一点名授权失效，并迫使消费者机械展开逐项决定。

### 8. 修复前后体验差异

- **修复前**：用户已经回答唯一整份确认，Runtime 仍需把 7 项逐项展开后再调用。
- **目标体验**：唯一 Proposal、明确上一问和当前用户确认能一次原子落地；若证据不足，错误准确指出缺少的上一问/message ref/summary，且不写入任何条目。

### 9. 最小修复范围

在现有 authority 中增加 `prompted_proposal_id`。Runtime wrapper 只在 `whole_confirmation_prompted=true` 时把当前调用的 `proposal_id` 写入 attestation，并把 proposal、whole 标志、确认摘要纳入 digest；Core 只接受精确 ID 匹配。管理/Web 入口继续使用原有显式 authority。没有新增会话存储，不修改已 materialize 的 CGS 数据。

### 10. 验收边界

- **工程验证**：通过。覆盖未提示 whole confirmation 拒绝、错误 proposal 绑定拒绝、同一 Board 另有 pending Proposal 时精确目标整份确认成功、目标条目落地且无关 Proposal 保持 pending；既有 whole-confirm 原子预检同时通过。2026-08-30 最终整合态 `pnpm typecheck && pnpm test` 在正常本机权限下 331/331、0 fail；没有依靠逐项 decisions 冒充 whole confirmation。
- **产品实操**：通过（已安装 0.1.9 隔离项目）。同一 Board 创建 A、B 两份 pending Proposal，用 `authority_source=runtime_dialogue`、`whole_confirmation_prompted=true`、`prompted_proposal_id=B` 对 B 一次 `confirm_all_pending`；实际只应用 B 的唯一 item，B Goal 创建成功，A Goal 不存在且 A Proposal 仍为 pending。没有展开逐项 decisions，也没有把 A 的存在当成确认歧义。
- **Owner 最终验收**：通过（含安装产物）。精确 proposal 授权、原子应用和无关 pending 保留边界均已复核。
- **用户验收**：待最终安装版由真实新 Session 确认不再重复授权。

---

## GB-20260830-40：executor Run completed 后 Review 隐藏且“执行收尾”不说明要 release

**来源**：CGS 消费者反馈（会话 `01a04fb1-96a1-74b3-9836-604f28f87521`），Goal `cgs-g2b-content-bet-decision-v2`
**Bug 确认**：部分新增成立。completed Run 保持 active Claim 是必要写权交接边界，不应自动释放；当前源码的 GB37 已让 `review_blocked` 进入 `blocked_overview`，所以“完全消失”是尚未安装该修复的旧运行态，不重复计 Bug。新增真实缺陷是 Run report、Contract、Available 与 Skill 都没有明确唯一剩余动作，Skill 甚至把 Review 排在 executor release 之前
**修复决定**：P1，保留显式 release，复用 GB33 handoff 与 GB37 blocked overview，统一返回精确工具、Claim、理由和 release 后 Available 动作；不修改 CGS 数据
**修复状态**：最终交付已闭环。0.1.10 安装 Core 隔离实操：completed Run 返回 `molis_work_v1_release`、claim/actor/建议理由及 release 后 Available；Contract/blocked_overview 给出同一动作；release 后 self_verifier 进入 Available。保留显式 release 的写权边界，不自动释放

### 1. 真实场景

executor 已调用 `molis_work_v1_run_report(state=completed)`，随后仍在同一 active Claim 下成功提交工程 Evidence。Contract 此时返回 `work_state=review_blocked`、reason=`work.handoff_pending`，只说“结果已提交，正在进入检查 / 当前执行收尾后即可开始检查”；executor Claim 仍 active，Available 完全不显示 pending self_verifier。消费者靠额外搜索工具列表才发现必须显式调用 `molis_work_v1_release`；release 后同一 Goal 才进入 self_verifier Available。

### 2. 事实与归因

消费者给出了 Run、Evidence、Contract、Available 和 release 前后状态变化，足以确认交接动作不可发现的真实摩擦。源码核对确认：`reportRun` 的 completed 响应原来只返回 Run/cursor；`work.handoff_pending` 明说“收尾后系统会继续”，但实际没有后台自动动作；当前本地 GB37 会把 `review_blocked` 放入 `blocked_overview`，却只投影 code/message；Skill 的 normal order 又把 review/complete 放在 release 之前。`completed` 后保留 Claim 的设计是正确的，因为 reviewer 不应和 executor 的最后 Evidence 写入并发。

### 3. 现有流程的问题

系统知道 active executor Claim 是 self-verifier 唯一剩余门禁，却只写抽象“收尾后”，不说明需要哪个动作、由谁执行、使用哪个 claim_id。用户和 Runtime会误以为自动交接尚在等待，或误诊 Review 丢失；只有盲搜工具才能继续，直接破坏 Run→Evidence→Release→Review 的连续推进。

### 4. 设计根因与初衷

显式 release 的初衷应是让当前 writer 在 Run 终态后仍能补齐 Evidence、确认报告与释放理由，并留下明确的写权交接事件；self-verifier 在 writer 放权前不可并发进入，避免边审边改和证据竞态。缺陷候选不是这条安全边界，而是 handoff 状态没有把必要 release 动作做成正式恢复契约。

### 5. 当前影响

影响所有 executor 完成后需要独立 Review 的正常闭环；频率等于每轮需复核的 Run。它不会直接丢数据，但会让自主推进静默停止、增加工具搜索和误操作，并让用户误以为 Molis Work 会自动交接。

### 6. 复杂度审查

- **当前必须**：当 completed Run 只差 release 时，`run_report`、Contract 和 Available/blocked handoff 返回同一个 `molis_work_v1_release`、`claim_id`、actor、建议理由和 release 后 Available 动作；Skill 顺序与状态机一致。
- **可以延后**：可配置 auto-release；只有证明不存在 completed 后补 Evidence/报告的合法路径时再评估。
- **应当删除**：不把“自动释放”直接当默认答案，不新增第二套 handoff 状态，不让 self-verifier 在 executor Claim active 时并发领取。

### 7. 修复必要性与优先级

需要修复，P1；已经完成本地最小修复。它是每个需独立 Review 的 Run 都会遇到的高频闭环断点。Available 可见性本身复用 GB37，不重复扩展 full blocked 列表。

### 8. 修复前后体验差异

- **修复前**：Run completed → Contract 只说“收尾后” → Review 从 Available 消失 → Runtime 等待或盲搜 → 猜到 release → Review 出现。
- **目标体验**：Run completed 后仍允许补 Evidence；每个相关返回都明确“当前 executor 仍持有 Claim，调用 release(claim_id) 完成交接；随后重新读取 Available 获取 self_verifier”，消费者无需猜工具，也不会误以为系统自动等待。

### 9. 最小修复范围

扩展既有 `work.handoff_pending` facts/remediation 和 completed run report：统一返回 `action=release_claim`、`tool=molis_work_v1_release`、goal/run/claim/actor、建议 release reason 和 `after_release=read_available`。GB37 的 `blocked_overview` 对该特定 reason 保留 facts/remediation 并把 next_action 写成 `release`；其他普通 blockers 仍保持紧凑。Skill 改成 executor completed→Evidence→release→Available→独立 reviewer，不改变 Claim/Run 状态、不自动释放、不修改 Review eligibility。

### 10. 验收边界

- **工程验证**：通过。红灯先证明 completed 响应没有 handoff；绿灯覆盖 completed 后 Claim 仍 active、Evidence 仍可提交、Run report/Contract/Available 返回同一 release 契约、release 前 self-verifier 不可领取、release 后立即 Available。实际 Runtime MCP 回归还覆盖默认 summary 保留 claim/tool、Skill 顺序，以及中英文 Web 状态“等待交接”。首次整仓运行暴露 1 条旧文案断言，修正为精确 release 契约后重新从头运行。提交前差异审查又发现 Web 会直接显示 MCP 工具名，把人类界面改为“释放当前工作并刷新”；随后再发现通用 handoff 被写成 executor 专属“交给独立检查”，以红灯证明后改为角色无关的“释放当前工作进入下一步”。Web/i18n、Core/MCP 定向回归通过后，2026-08-30 再次从头执行 `pnpm typecheck && pnpm test`，最终整合态 331/331、0 fail。
- **产品实操**：通过。最终 0.1.10 安装 Core 的隔离旅程读回：completed 后 Claim 保持 active、Evidence 可补；Run/Contract/Available 都明确 `molis_work_v1_release`、claim_id、actor、建议理由和 release 后 Available；release 后 self_verifier 立即进入 `review_pending`。
- **Owner 最终验收**：通过。最终安装行为与设计一致：保留 completed 后最后写入窗口，同时消除“等待系统自动交接”的歧义。
- **用户验收**：最终安装版主观是否足够直白仍为 `UNVERIFIED`；当前暂停新包构建。

---
