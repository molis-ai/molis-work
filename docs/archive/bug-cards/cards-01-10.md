# 0.1.x Bug 卡：01–10

状态：历史记录，截至 2026-08-31。卡片中的状态、流程、路径与验收属于当时版本，不是当前待办或操作指令。

[台账入口](../../molis-work-bug-cards.md) · [历史总览](overview.md) · [历史复审](review-2026-08-30.md)

## 本册目录

- [GB-20260828-01：当前消息已明确项目仍被重复确认](#gb-20260828-01当前消息已明确项目仍被重复确认)
- [GB-20260828-02：已完成执行被 Available 误导为再次执行](#gb-20260828-02已完成执行被-available-误导为再次执行)
- [GB-20260828-03：项目内绝对路径被误报为项目范围外](#gb-20260828-03项目内绝对路径被误报为项目范围外)
- [GB-20260828-04：同一 LaunchAgent PID 被误报为端口冲突](#gb-20260828-04同一-launchagent-pid-被误报为端口冲突)
- [GB-20260828-05：对话使用 G2A/G2B，Goal Tree 隐藏对应 ID](#gb-20260828-05对话使用-g2ag2bgoal-tree-隐藏对应-id)
- [GB-20260828-06：已绑定 Session 的生命周期调用偶发误报未连接](#gb-20260828-06已绑定-session-的生命周期调用偶发误报未连接)
- [GB-20260828-07：内嵌 Node 测试把 Homebrew Node 误当成可搬移运行时](#gb-20260828-07内嵌-node-测试把-homebrew-node-误当成可搬移运行时)
- [GB-20260829-08：租约过期后 Contract 同时显示失效与 active/started](#gb-20260829-08租约过期后-contract-同时显示失效与-activestarted)
- [GB-20260829-09：`repo:` 项目内 Evidence 被降级且没有可修正格式](#gb-20260829-09repo-项目内-evidence-被降级且没有可修正格式)
- [GB-20260829-10：升级后的旧服务配置允许 restart 但无法完成修复](#gb-20260829-10升级后的旧服务配置允许-restart-但无法完成修复)

## GB-20260828-01：当前消息已明确项目仍被重复确认

**来源**：CGS 新 Session 消费者反馈 1
**Bug 确认**：已确认，属于 Molis Work Skill 的当前消息授权识别缺陷
**修复决定**：用户已批准
**修复状态**：2026-08-30 最终收口：0.1.7 App/Core/服务/Skill 已统一安装，fresh MCP 协议和 Skill 资产验证通过；Owner 对修复实现与安装交付验收通过。当前 Session 不会热加载，新 Codex Session 的真实自然语言绑定旅程仍标为 `UNVERIFIED`，不冒充产品实操。

**2026-08-30 复验进展**：已用 computer use 在当前 `/Applications/Molis Work.app` 打开“全局设置 → AI 与执行工具”。Codex 卡片显示“检测到旧版或不完整的 Molis Work 接入 · 需要修复”，Runtime 为“未找到可执行文件”，Skill 路径为 `~/.codex/skills/goal-advance`；当前 Session 的 MCP 工具说明虽已包含“当前消息明确命名且唯一匹配时直接 bind”的新规则，但这不能证明一个真实新 Session 会加载并执行同版 Skill。截图：`docs/qa/bug-revalidation/2026-08-30/gb01-current-runtime-incomplete.jpeg`。因此本卡当前只能判定源码工程层存在修复，产品验收失败；需统一安装后创建真实新 Session，分别复测明确唯一匹配、多候选、切换项目和未命名请求。

### 1. 真实场景

用户因为旧 Session 太乱而新开 Session，并在同一句话中明确要求“继续用 Molis Work 推进 CGS”。`context_resolve` 找到唯一现有项目 `Content Growth Studio`，但仍返回 `suggested`，消费者按协议必须再次询问是否关联，导致用户在读取 Goal 前被打断。

### 2. 事实与归因

可通过“新 Session、无 workspace 默认项目、当前消息明确命名一个现有项目、唯一候选匹配”复现。`suggested` 本身符合 Runtime 安全边界；缺陷在于 Skill 没有把当前消息中已经发生的明确选择转成这一次 `context_bind` 的用户确认。主要归因是 Molis Work Skill 缺陷，不是 CGS 接入问题，也不是用户误用。

### 3. 现有流程的问题

用户先明确说“用 Molis Work 推进 CGS”，随后还要回答“是否关联 Content Growth Studio”。多出一次同义确认，并把“新 Session 不继承旧授权”误呈现成“当前消息也没被理解”。

### 4. 设计根因与初衷

原设计把目录历史和唯一候选都视为线索而非授权，防止新 Session 静默进入旧项目、同名项目或错误目录。这条边界是必要的；问题是实现只识别 Runtime 返回的 `suggested` 状态，没有识别当前用户消息已经提供的新授权。

### 5. 当前影响

影响所有新 Session 中“明确命名现有项目并立即继续”的入口。每次多一次阻塞式问答；在用户主动重开干净 Session 时尤其破坏连续性，但不改变数据，也不会越权绑定。

### 6. 复杂度审查

- **当前必须**：仅在当前消息明确命名项目、现有项目唯一无歧义匹配、当前 Session 没有冲突绑定时，直接执行一次 Session 级绑定。
- **可以延后**：自然语言别名管理、模糊匹配、多语言实体解析增强。
- **应当删除**：在上述唯一明确场景中再次要求用户重复选择。

### 7. 修复必要性与优先级

需要修复，P1。它位于所有 Goal 读取和推进之前，出现一次就打断主流程；同时修复可以保持原有授权边界，不需要放宽默认绑定、切换项目或新建项目权限。

### 8. 修复前后体验差异

- **修复前**：用户说“继续用 Molis Work 推进 CGS” → Runtime 找到唯一 `Content Growth Studio` → 再问一次是否关联 → 用户确认后才继续。
- **修复后**：同一句明确指令直接授权本 Session 绑定唯一匹配项目 → Runtime 继续读取 Available/Contract。遇到多候选、切换项目、新建项目、只说“继续”或没有明确名称时仍会询问。

### 9. 最小修复范围

修改 `goal-advance` 的项目连接规则和项目候选匹配结果，使“当前消息明确命名 + 唯一现有匹配”可直接做 Session 级绑定。没有修改 `suggested` 的底层含义，没有增加自动默认项目，没有绕过 rebind、新建、删除或 workspace default 的独立确认。回滚时可恢复为所有 `suggested` 均询问，不影响 catalog 数据。

### 10. 验收边界

- **工程验证**：项目 catalog 与 MCP 的明确项目选择回归通过；正常本机权限下整仓门禁 261/261、TypeScript 和 Skill 校验通过。
- **产品实操**：未通过。computer use 已确认当前最终 App 将 Codex 接入标记为旧版或不完整；真实新 Session 的“明确命名 → 直接绑定 → 读取 Goal”尚不能在统一版本上执行。
- **Owner 最终验收**：实现、安装资产与 fresh MCP 协议通过；真实新 Codex Session 自然语言旅程仍为 `UNVERIFIED`，因此只结论为修复交付通过，不结论为用户侧实操通过。

---

## GB-20260828-02：已完成执行被 Available 误导为再次执行

**来源**：CGS 新 Session 消费者反馈 2
**Bug 确认**：已确认，属于 Molis Work 派生状态和恢复动作表达缺陷
**修复决定**：用户已批准
**修复状态**：2026-08-30 最终收口：293/293、隔离完整生命周期与最终 0.1.7 构建指纹一致性通过；Owner 最终验收通过。

**2026-08-30 复验进展**：没有复用当前已完成的真实 G2A 绿状态，而是在隔离 SQLite 中恢复“executor 完成 Run 与 Evidence → self-verifier pass → completion Risk 仍 open”的原始条件，并从当前源码启动真实 Web。computer use 首次打开时，Goal 状态为“完成受阻”，下一步是“先完成等待你的决定”，当前阻塞和修复动作可见，没有重新执行入口；通过正式 `setRiskState` 记录解决摘要、证据和事件后刷新，状态变为“待完成”，下一步明确为“运行完成判定”，并写明“让 Runtime 直接重试完成判定；不要重新领取或重复执行”。截图：`docs/qa/bug-revalidation/2026-08-30/gb02-completion-blocked.jpeg`、`docs/qa/bug-revalidation/2026-08-30/gb02-completion-pending.jpeg`。精确 V1 回归 1/1 通过，覆盖 blocked/pending、Available、Explain、重复 select 零新增 Claim/Run/Evidence 和最终 complete。此证据支持源码产品路径，不支持当前混合版本 App/Core/Skill 或最终 Release 已验收。

### 1. 真实场景

G2A 已有 completed executor Run、通过的 Evidence、满足要求的 Review 和完成检查记录，唯一剩余问题是 completion Risk 仍为 `open`。新 Session 读取 Available 时却看到 `role=executor / work_state=execution_pending / next_action=execute`，容易再次领取并重复执行。

### 2. 事实与归因

可用“执行、证据、复核全部完成，但 completion Risk 仍 open”稳定复现。完成判定正确地被 Risk 阻止；错误发生在无活跃 Run/Review 后的派生状态回退，它把剩余门禁误归为 `execution_pending`。主要归因是 Molis Work 的 Available 派生状态 Bug，不是缺少业务实现，也不是 CGS 误用。历史 Risk 提案物化问题可能解释门禁为何未解除，但不改变 Available 对当前 canonical 事实的错误表达。

### 3. 现有流程的问题

表层动作要求 executor `execute`，真实动作却是处理完成门禁并重试 `complete`。消费者必须深挖 Contract、Run 历史和 release reason 才能发现真相；如果只按 Available 行动，会新增重复 Claim、Run 和 Evidence，并再次撞到同一完成门禁。

### 4. 设计根因与初衷

Molis Work 原本不持久化第二套工作状态，而是从 canonical Goal、Run、Evidence、Review、Risk 动态派生，这是为了防止状态副本漂移。completion Risk 也有意不阻止初次执行，因为执行结果本身可能消除风险。缺陷是派生器缺少“执行闭环已经结束、只剩完成门禁”和“所有门禁已解除、应直接完成”两个阶段，于是错误落回执行入口。

### 5. 当前影响

影响所有已完成实现但 `complete` 被 Risk 或类似完成门禁拒绝的 Goal。它会阻断自然进入下一 Goal，并污染 Claim/Run/Evidence 历史；对新 Session 和只依赖 Available 的消费者是高频误导，对已经深读 Contract 的消费者仍可人工绕开。

### 6. 复杂度审查

- **当前必须**：从现有 canonical 事实派生 `completion_blocked` 和 `completion_pending`；阻止 executor 再次 select；给出具体门禁原因和直接完成动作。
- **可以延后**：统一所有完成门禁的专属工作台、自动修复历史 Risk 提案、完成阻塞趋势统计。
- **应当删除**：执行已结束后无条件回退到 `execution_pending` 的逻辑；通过重复 Claim/Run 恢复生命周期的路径。

### 7. 修复必要性与优先级

需要修复，P1。它会制造无意义执行历史并持续阻断后续 Goal，且修复只需补齐派生状态和动作路由，不需要新增持久化状态或重构完成判定。

### 8. 修复前后体验差异

- **修复前**：完成检查被 Risk 阻止 → 新 Session 看到“待执行” → 领取 executor → 重复核验与 Evidence → 再次完成失败。
- **修复后**：完成 Risk 仍开放时，Goal 显示“完成受阻”，出现在 Available 的 `blocked` 诊断中并给出恢复条件，不可领取 executor；Risk 被 canonical 地解除后，Goal 显示“待完成”，Available 返回 `next_action=complete / role=null`，Runtime 直接重试完成判定，不创建 Claim、Run 或重复 Evidence。

### 9. 最小修复范围

修改工作状态派生、Available/Explain/select-goal 防线、Web/胶囊状态文案和 Runtime Skill 协议。新增的是派生状态，不增加数据库列；原完成判定和 Risk canonical 状态保持不变。`blocked` 是 Available 的加法字段，旧消费者仍可读取 `available`；回滚可移除新派生分支，不需要迁移数据。

### 10. 验收边界

- **工程验证**：回归先复现 `execution_pending` 错误，再验证 Risk 开放时 `completion_blocked`、解除后 `completion_pending → complete`，且不会增加 Claim/Run；已撤回或替代的 Evidence 也不会被误算为有效。正常本机权限下整仓门禁 261/261、TypeScript 和 Skill 校验通过。
- **产品实操**：源码构建下通过隔离真实状态的两阶段旅程；当前最终安装包和真实 Runtime 的 Available → direct complete 消费路径仍为 `UNVERIFIED`。
- **Owner 最终验收**：通过。派生状态、阻止重复领取、恢复动作和零重复记录均已覆盖；最终 0.1.7 指纹与验收源码一致。

---

## GB-20260828-03：项目内绝对路径被误报为项目范围外

**来源**：CGS 新 Session 消费者反馈 3
**Bug 确认**：已确认，属于 Molis Work Evidence locator 的设计缺陷；不是旧 workspace 关联污染
**修复决定**：用户已批准
**修复状态**：2026-08-30 最终收口：项目内绝对路径与 `repo:`/anchor 已验证，项目外和逃逸 symlink 仍拒绝；0.1.7 已安装，Owner 最终验收通过。

**2026-08-30 复验进展**：在隔离项目中向真实 Evidence 提交项目内 Markdown 绝对路径，Runtime 返回 `verified` 并规范化为 `project://docs/absolute-evidence.md#Engineering-verification`；同一轮确认项目外路径和项目内 symlink 指向外部文件均以 `evidence.locator_outside_project` 拒绝。定向回归 `Evidence locator preflight verifies project Markdown anchors and marks opaque locators unverified` 通过。随后用 computer use 打开源码构建的最终 Web 路径“记录 → 执行与检查”，页面显示该 Evidence 为“当前有效 / 已验证”，保留规范化 locator 和“项目内 Markdown 文件与 anchor 已完成只读预检”原因。截图：`docs/qa/bug-revalidation/2026-08-30/gb03-absolute-evidence-verified.jpeg`。这证明源码主路径与安全边界有效，但还不能替代最终统一安装包、真实 CGS 原始 JSON/Markdown 路径和新 Session 的产品复验。

### 1. 真实场景

当前 Session 已绑定 `Content Growth Studio`，canonical workspace 是 `~/adeptify-home/repos/Content Growth Studio`。消费者提交这个目录内真实存在的 JSON 和 Markdown 绝对路径作为 Evidence locator，却收到“不能指向项目范围外的本地文件”，无法登记 verified local Evidence。

### 2. 事实与归因

已用安装版 locator 校验器复现。它在检查 `projectRoot` 之前，对所有绝对路径直接抛出同一个“项目范围外”错误；同一文件改成 `project://data/...` 或 `project://docs/...` 后均返回 `verified`。因此当前案例不是项目 workspace 归属不一致，也不是旧关联被选中；主要归因是 Molis Work 对绝对路径一刀切拒绝，以及错误文案把“绝对路径不被支持”说成“文件在项目外”。消费者没有猜测内部 `project://` 规范，不构成误用。

### 3. 现有流程的问题

Runtime 从 shell 和工具结果自然获得绝对路径，但提交时必须先知道 Molis Work 的私有相对引用格式并手工改写。失败信息还把正确项目内文件说成项目外，诱导消费者排查错误的 workspace 历史，而不是修正 locator 形式。

### 4. 设计根因与初衷

原设计只允许项目相对引用，并在 realpath 后阻止 `..`、绝对路径和 symlink 越界，目的是避免 Molis Work 读取或暴露任意本地文件。这项安全边界必要；缺陷是把“输入表示形式”当成了“访问范围”，没有先把绝对路径规范化后再做项目 containment 检查。

### 5. 当前影响

影响所有直接提交项目内绝对文件路径的 Runtime，尤其是从命令输出、编辑器或当前工作目录复制路径的场景。它不会破坏数据，但会阻止 verified Evidence，迫使消费者保留 UNVERIFIED 命令 locator、猜协议或放弃追溯；本次直接影响 G2A 完成证据质量。

### 6. 复杂度审查

- **当前必须**：接受绝对路径的前提是 realpath 后严格位于当前 Session 的 canonical workspace 内；内部规范化为项目相对引用，并继续拒绝项目外路径和 symlink 逃逸。
- **可以延后**：多 workspace root、显式外部文件授权、网络内容抓取与长期可用性验证。
- **应当删除**：在 containment 检查前拒绝全部绝对路径；把“绝对路径格式”误报成“项目范围外”。

### 7. 修复必要性与优先级

需要修复，P1，已批准。Evidence 是完成闭环的核心事实，项目内真实文件不应因表示形式失去 verified 状态。该修复保持安全边界，并减少 Runtime 对 Molis Work 私有 locator 语法的依赖。

### 8. 修复前后体验差异

- **修复前**：提交项目内绝对路径 → 立即被误报为项目外 → 用户或 Runtime 改查 workspace 关联，或手工猜成 `project://...`。
- **修复后**：提交项目内绝对路径 → Molis Work 以当前 Session workspace 做 realpath containment → 在项目内则规范化并验证，在项目外或经 symlink 逃逸仍明确拒绝。用户不需要改写路径。

### 9. 最小修复范围

只修改 Evidence locator 规范化和错误分类，并补绝对项目内、绝对项目外、symlink 逃逸、相对路径和 `project://` 的回归测试。不改变 workspace 绑定、项目 catalog 归属、外部 URL 的 UNVERIFIED 策略或历史 Evidence。可通过恢复绝对路径拒绝分支回滚，不涉及数据迁移。

### 10. 验收边界

- **工程验证**：2026-08-30 定向回归 1/1 通过；隔离真实文件验证项目内绝对路径规范化、项目外拒绝、symlink 逃逸拒绝。历史整仓门禁为 261/261、TypeScript 和 Skill 校验通过，但本轮尚未在最终整合状态重跑整仓门禁。
- **产品实操**：源码构建的隔离最终 Web 路径已用 computer use 通过，可见“当前有效 / 已验证”、规范化 locator 与预检原因；最终统一安装包及真实 CGS 新 Session 中反馈的两个原始绝对路径仍为 `UNVERIFIED`。
- **Owner 最终验收**：通过。项目内成功、项目外与 symlink 逃逸拒绝均已实测，0.1.7 已安装。

---

## GB-20260828-04：同一 LaunchAgent PID 被误报为端口冲突

**来源**：CGS 新 Session 消费者反馈 4
**Bug 确认**：已确认，属于 Molis Work Web 服务归属协议的升级兼容缺陷
**修复决定**：用户已批准
**修复状态**：2026-08-30 最终收口：0.1.7 服务实操为 `running/owned=true`，监听 PID、LaunchAgent PID 与 health PID 同为 11021；Owner 最终验收通过。

**2026-08-30 复验进展**：定向服务回归 `legacy health without identity is owned only when the listener pid matches the LaunchAgent pid` 通过，并在同一用例中覆盖旧 health 缺身份时同 PID 判 `running`、异 PID 判 `conflict`。当前安装现场的 `service status --json` 返回 `running / owned=true`；LaunchAgent PID、4173 监听 PID 和 `/health` 的 `process_id/service_process_id` 均为 26668。随后用 computer use 从当前 `/Applications/Molis Work.app` 关闭设置页并进入真实 Content Growth Studio 项目，页面直接可见且没有虚假冲突。截图：`docs/qa/bug-revalidation/2026-08-30/gb04-installed-app-opens.jpeg`。这证明当前混合安装的打开主路径有效，但未重新制造真实 OS 级异 PID 占用，也不能替代后续统一最新版安装升级后的最终实操。

### 1. 真实场景

用户明确要求“打开 Molis Work”。已安装 launcher 的 `service status --json` 返回 `state=conflict`，声称 4173 监听者无法证明属于当前 LaunchAgent；但 `launchctl` 的受管 PID、`lsof` 的 4173 监听 PID 都是 65405，HTTP 页面也健康。

### 2. 事实与归因

当前机器可稳定复现。LaunchAgent receipt/plist 归属已通过，PID 一致，根路径 200；但 `/health` 只返回 `status/project_count/desktop_tui`，缺少当前 status 实现要求的 `service_process_id/process_id`，所以 `healthyOwnedInstance` 为 false，随后只要端口在监听就进入 conflict。主要归因是 Molis Work 新旧健康协议兼容缺陷，不是第三方占用，也不是 CGS 接管进程。

### 3. 现有流程的问题

普通“打开 Molis Work”被停止在不存在的所有权冲突上。消费者必须额外运行 `lsof`、`launchctl` 和 HTTP 检查才能证明页面可开；按错误字面操作还可能诱发不必要的停止、重启或修复。

### 4. 设计根因与初衷

原设计要求 LaunchAgent receipt/plist 归属、受管 PID 和 `/health` 返回的服务 PID 一致，防止 Molis Work 因端口可访问就接管或终止第三方服务。这一防线正确。缺陷是升级后把新版 health identity 当成唯一证明方式，没有处理“受管旧进程仍健康但 health payload 尚无新字段”的兼容窗口，也没有使用已知的 LaunchAgent PID 与监听 PID 精确相等作为安全回退。

### 5. 当前影响

影响安装更新后旧常驻进程仍在运行、但磁盘代码与健康协议已经升级的用户。它阻断普通打开入口，但页面本身仍可用；严格消费者会停止，熟悉系统的消费者可以通过额外只读核验绕过。误判不直接损坏数据，错误修复操作才可能造成可用性中断。

### 6. 复杂度审查

- **当前必须**：把健康检查结果区分为“已证明归属”“已证明不匹配”“旧协议缺身份”；仅在旧协议且 LaunchAgent PID 与实际监听 PID 精确一致时接受安全兼容回退。
- **可以延后**：多端口服务、通用进程证明框架、自动无中断升级常驻进程。
- **应当删除**：把“health 缺新字段 + 端口已监听”直接等同于第三方冲突；在 PID 已精确相同时要求用户人工排查占用者。

### 7. 修复必要性与优先级

需要修复，P1，已批准。它位于“打开 Molis Work”的高频入口，并且错误信息可能引导用户做不必要的服务变更。修复保持未知监听者不接管、不停止的原安全边界。

### 8. 修复前后体验差异

- **修复前**：受管旧进程健康且监听 PID 等于 LaunchAgent PID → status 仍返回 conflict → 用户无法直接打开。
- **修复后**：新版 health PID 匹配时照常判定 running；旧 health 缺 PID 时，仅在 OS 监听 PID 与受管 PID 精确相等后判定兼容 running，并提示可在后续受控重启升级协议；PID 不同或无法查明时仍返回 conflict。

### 9. 最小修复范围

修改 Web service detection 的健康归属判断，增加只读端口监听 PID 查询和三态结果，补“旧 health + 同 PID”“旧 health + 异 PID”“新 health + 匹配/不匹配”测试。不停止、不重启、不改 LaunchAgent，不把根路径 200 单独当成归属证明。回滚只恢复严格 health identity 检查。

### 10. 验收边界

- **工程验证**：2026-08-30 定向回归 1/1 通过，单测同时覆盖旧 health 同 PID 为 `running`、异 PID 为 `conflict`。历史服务测试 22/22、整仓门禁 261/261、TypeScript 和 Skill 校验通过；本轮最终整合状态的全量门禁尚未运行。
- **产品实操**：当前混合安装下，`service status`、LaunchAgent、监听端口和 health identity 四者一致；已用 computer use 从真实 App 进入 CGS 项目且无虚假冲突。真实 OS 级异 PID 安全分支与最终统一安装升级旅程仍为 `UNVERIFIED`。
- **Owner 最终验收**：主路径通过。最终安装服务已由官方 status 证明 owned 且 PID 一致；异 PID 安全拒绝由工程回归覆盖，未制造破坏性实机冲突。

---

## GB-20260828-05：对话使用 G2A/G2B，Goal Tree 隐藏对应 ID

**来源**：用户截图直接反馈
**Bug 确认**：已确认最初是 Molis Work 可引用性设计债；v0.1.5 隐藏编号，v0.1.6 又把完整内部 ID 塞进窄栏并挤没中文标题，Goal 内容没有丢失
**修复决定**：用户已批准
**修复状态**：2026-08-30 最终收口：最终安装 App 在真实 CGS、286px 窄栏实操通过；G2A/G2B 可见，同组 G2G 子项使用最短唯一稳定引用且保留中文标题；Owner 最终验收通过。证据：`docs/qa/bug-revalidation/2026-08-30/gb05-final-installed-unique-ids.png`。

**2026-08-30 复验与补修**：用 computer use 在当前安装版打开真实 CGS Goal Tree，默认 286px 栏仍显示 `cgs-g2…` 等被截断的内部 slug，中文标题被明显挤压，确认当前产品未修复；截图：`docs/qa/bug-revalidation/2026-08-30/gb05-installed-full-ids-fail.jpeg`。随后从当前源码启动只读复制的真实 CGS 数据，在默认 310px 栏复验，发现既有短编号实现仍会把 `G2A/G2B` 视觉截成 `G…`，因此历史 355px 结论不足以支持通过。本轮把短编号设为不可压缩、不可省略，标题继续在剩余空间内省略，状态保持可见；同一真实数据的 16 条 Goal 现在能显示完整 `G1/G2/G2A-G2H/G3-G6/G4A`，中文标题仍保留可辨识前缀，完整 ID 继续存在于搜索与悬停信息。修后截图：`docs/qa/bug-revalidation/2026-08-30/gb05-source-short-ids-pass.jpeg`。

**2026-08-30 最终安装态再发现**：在 `/Applications/Molis Work.app` 0.1.7、Core/Service 0.1.7 的真实 CGS Goal Tree 中，`G2A/G2B/G2C` 已完整显示，但 `cgs-g2g-ai-kol-quality-roster-v2` 及其 8 个 `cgs-g2g-*` 子 Goal 都被同一正则截成 `G2G`。元素“可见”并不等于能够与 Runtime 一一对应；本卡最终产品实操因此回退为未通过。最小补修只调整无显式短号时的确定性消歧，不迁移 Goal ID，不改 CGS 数据；补修、重打包和最终复验正在进行。

**2026-08-30 补修工程验证**：新增同号组回归，保留唯一 `G2A`，并把真实 `cgs-g2g-*` 样例稳定区分为 `G2G`、`G2G · V2`、`G2G · SCHEMA`、`G2G · INTEGRATION`、`G2G · DOUYIN`。受限沙箱内单跑 Web 套件时，新增用例通过，20 个既有服务器用例因 SQLite 临时目录不可写返回 `unable to open database file`；在正常本机权限下重跑完整 `pnpm test` 为 293/293 全绿。产品实操仍待重打包、重装后的真实 CGS 复验，不能据此恢复“已通过”。

**2026-08-30 补修视觉复查**：第一版唯一后缀进入最终安装态后，computer use 与截图确认 `G2G · INTEGRATION` 等标签过长，在 286px 默认窄栏把部分中文标题挤到几乎不可见；虽然 AX 树能读出编号，用户视觉仍未通过。现收缩为同组内最短唯一引用 `G2G/V2`、`G2G/S`、`G2G/I`、`G2G/D`、`G2G/X`、`G2G/XI`，并增加 `X` 与 `XIAOHONGSHU` 前缀冲突回归；完整 canonical ID 仍留在搜索和悬停。该二次补修的定向红灯/绿灯已完成，完整工程与最终安装态视觉仍待复验。

### 1. 真实场景

会话里用 “G2A 已完成、G2B 已解锁”讨论下一步；用户打开 Content Growth Studio 的 Goal Tree，只看到自然语言标题，看不到哪一行对应 G2A 或 G2B，无法把会话引用和树中条目对上。

### 2. 事实与归因

最初截图与源码一致。CGS 的 canonical ID 包含 `cgs-g2a-opportunity-intelligence`、`cgs-g2b-editorial-decision`。v0.1.5 的 Desktop CSS 把 renderer 已输出的 ID 隐藏；删除隐藏规则后，v0.1.6 的真实 App 又直接常驻显示完整 canonical ID。用户 2026-08-30 的窄窗口截图复现第二层回归：标题、完整 ID 和右侧状态争夺同一行，深层 Goal 的中文标题只剩一两个字，ID 也被截成 `cgs-g2c-re…`，既不可读也不能直接对应会话中的 `G2C`。归因是同一张 bug 卡的过度修复和最终窄屏验收缺口，不是数据乱码、CGS 标题丢失或编码损坏。

### 3. 现有流程的问题

v0.1.5 时，列表没有可对应编号；v0.1.6 时，编号虽然出现，却以完整内部 slug 抢占标题空间。用户仍看不清 `G2A/G2B`，还会把大量省略号误解成乱码或数据损坏。两种状态都使 Goal Tree 无法承担人和 Runtime 之间的共同索引。

### 4. 设计根因与初衷

Goal Tree 最初为降低视觉噪音和提高窄栏密度而隐藏机器 ID；第一次修复则把“稳定 ID 可见”直接等同于“完整 canonical ID 常驻可读”。两者都忽略了用户真正需要的是会话里正在使用的短引用 `G2A/G2B`，而不是内部 slug。原测试只检查 `<small>` 没被 `display:none`，没有检查真实长中文、深层缩进、状态徽标和 320 至 355 CSS px 窄宽下的信息层级，因此把“元素存在”误报成“体验修好”。

### 5. 当前影响

影响所有在会话、文档或协作中用 Goal ID/简称讨论工作的用户。Goal 数量少时可凭标题猜测，层级变深、标题变长或多个 Goal 语义相近时频率和歧义都会上升。本次未阻断数据闭环，但已经阻断用户快速理解 G2A/G2B 在树中的位置。

### 6. 复杂度审查

- **当前必须**：从既有 canonical ID 中只提取确定的层级短编号，例如 `cgs-g2a-* → G2A`；中文标题保持主视觉，完整 ID 仍可搜索并通过悬停读取；覆盖真实长中文和窄屏。
- **可以延后**：新增可编辑的正式别名字段、编号自动分配、别名历史和跨项目唯一性治理。
- **应当删除**：完整内部 `goal_id` 在 Goal Tree 每一行常驻占位，以及所有密度模式下一律隐藏编号的规则。

### 7. 修复必要性与优先级

需要修复，P1，已批准。v0.1.6 已把核心导航显示成用户认为的“乱码”，直接破坏 Goal Tree 的可理解性；同时不应为当前案例立即引入 schema 迁移。确定性提取现有 `G2A/G2B` 是更小且可回滚的修复。

### 8. 修复前后体验差异

- **修复前（v0.1.5）**：会话说 G2A/G2B → Goal Tree 只有标题 → 用户必须猜或逐条打开。
- **错误修复（v0.1.6）**：每行显示 `cgs-g2b-editorial-decision` → 窄屏中文标题和 ID 都变成省略号，仍无法对应。
- **本次修复后**：每行只显示 `G2A/G2B` 短编号和中文标题；完整 ID 不占主布局，但仍能搜索并在悬停读取。

### 9. 最小修复范围

只新增一个纯展示映射：从 `goal_id` 的独立段中识别 `G数字+可选字母`，短 ID 如 `V1` 原样保留，其余 UUID/slug 不在树中常驻显示；完整 ID 继续进入搜索文本和 `title`。不修改 Goal schema、canonical ID、排序、标题、关系、Runtime 输出或 CGS 数据。回滚只恢复 renderer 的显示内容，不涉及数据迁移。

### 10. 验收边界

- **工程验证**：2026-08-30 补修后 Web 与视觉测试 58/58、TypeScript 通过；覆盖短编号映射以及短编号 CSS 不压缩、不省略。最终整合状态的整仓门禁尚未运行。
- **产品实操**：当前安装版已用 computer use 复现失败；补修后的源码服务已用真实 Content Growth Studio 数据在默认 310px Goal Tree 实操，完整短编号、中文标题前缀与状态同时可辨，完整 ID 仍保留在搜索和悬停属性中。新的最终 App 尚未打包安装，故最终产物仍为 `UNVERIFIED`。
- **Owner 最终验收**：通过。最终安装 App 真实 CGS 窄栏已直接观察；用户本人对主观视觉偏好仍为 `UNVERIFIED`。

---

## GB-20260828-06：已绑定 Session 的生命周期调用偶发误报未连接

**来源**：CGS 新 Session 消费者反馈 5
**Bug 确认**：已确认 Molis Work 的连接缓存与恢复语义存在缺陷；现场调用级 Session metadata 的具体断点尚无原始日志
**修复决定**：用户已批准
**修复状态**：2026-08-30 最终收口：连接刷新、同一幂等键安全重试和明确 recovery action 工程验证通过，0.1.7 已安装；真实新 Codex Session 连续推进仍标为 `UNVERIFIED`。

**2026-08-30 复验进展**：定向 MCP 回归分别验证两条边界并均通过：已绑定 Session 的身份 metadata 缺口会返回 `mcp.context_refresh_required`、`next_action=context_resolve_then_retry`、`requires_bind=false`、`requires_user_confirmation=false`、`retry_same_idempotency_key=true`，只读 resolve 后恢复为原项目 `bound` 并可重试；同一 MCP 进程中的不同 Session 仍不能串用项目连接，真正未绑定的 Session 仍返回普通“尚未连接项目”。源码 `goal-advance` 的项目连接参考也给出了“一次 resolve、bound 后复用原 idempotency key、重复失败则停止”的有界恢复规则。当前 App 的 Runtime 设置仍显示 Codex 接入不完整，实际 Skill 仍是旧版，因此没有把源码协议提升为产品实操通过；GB01 的 `gb01-current-runtime-incomplete.jpeg` 同时证明本卡的消费者指引尚未交付到当前最终环境。

### 1. 真实场景

同一个 Codex task、同一个 Content Growth Studio 工作目录中，消费者刚成功完成并 release `cgs-g2b-editorial-decision` 的计划 Claim，随即调用 `molis_work_v1_select_goal` 领取同一 Goal 的实现 Run，却收到“尚未连接项目”。消费者没有 bind，只调用一次 `context_resolve`，马上又得到同一项目 `status=bound / next_action=continue`。

### 2. 事实与归因

持久化 Session binding 没有丢失，否则后续只读 resolve 不可能在没有 bind 的情况下返回 bound。源码中，生命周期调用只检查 MCP 进程内单槽 `runtimeConnection`：如果当前调用从 `_meta` 得到的 Session ID 与缓存 key 不同或缺失，就先清空连接并直接报 `mcp.connection_incomplete`；`context_resolve` 则重新读取 catalog 的持久化 binding 并恢复缓存。已用“同一已绑定 Session 的一次调用缺少 threadId，下一次 resolve 恢复 threadId”稳定复现完全相同的 `成功 → 尚未连接 → resolve=bound` 序列。主要归因是 Molis Work 把“进程连接缓存需要刷新”与“Session 没有项目 binding”混成同一个错误。调用级 metadata 断续可能来自 Codex/MCP transport，现场具体是哪一个 `_meta` 字段缺失或变化仍证据不足，但不影响 Molis Work 错误结论与恢复表达是缺陷。

### 3. 现有流程的问题

消费者收到的是项目未连接错误，却无法知道持久化授权仍有效。它只能猜测重新 bind、重试、重新 resolve，或者再次询问用户是否选择 Content Growth Studio。多出一次失败和一次恢复调用；更严重的是，错误文案会把安全的“刷新后原样重试”误导成需要新的项目授权。

### 4. 设计根因与初衷

Molis Work 用调用级 Session key 隔离同一 MCP 进程中的不同 Runtime 会话，并在 key 不匹配时清空最后一个项目连接，原本是为了防止 Session B 误用 Session A 最近打开的数据库。新进程第一次做生命周期写入前必须先 resolve 的边界也防止静默恢复旧项目。这些初衷正确。缺陷是实现只有一个“最近连接”缓存槽，且缓存 miss、Session metadata 不连续、其他 Session 切换和真正未绑定全部落到同一 `connection_incomplete`；错误没有报告缓存层与 catalog 层的差异，也没有提供无需用户授权的恢复动作。

### 5. 当前影响

影响调用级 Session metadata 偶发缺失、字段来源切换，或多个 Session 共享同一 MCP 进程的场景。当前已有一条真实 CGS 连续推进记录和一条确定性源码复现；每次至少阻断一个 lifecycle 调用，并增加一次 resolve/retry。它没有删除 binding 或业务数据，但可能诱导重复 bind、重复向用户确认，或让消费者误判 Session 已失效，从而中断 Goal 的连续推进。

### 6. 复杂度审查

- **当前必须**：区分“持久化 context 未绑定”和“本进程连接缓存/调用身份需要刷新”；后一种返回机器可读的 `context_resolve_then_retry`，明确 `requires_bind=false`、`requires_user_confirmation=false`，并要求用同一 idempotency key 原样重试。继续保持不同 Session 不共享连接。
- **可以延后**：把单槽连接改成有界的 per-context cache、对宿主 `_meta` 字段来源做遥测、为多个并发 Runtime 做通用连接池。
- **应当删除**：在没有检查持久化 binding 是否丢失时宣称“尚未连接项目”；把 cache refresh 指导成重新 bind 或再次询问用户。

### 7. 修复必要性与优先级

已批准修复，P1。它发生在 Goal 生命周期连续切换的主路径，错误恢复若处理不当会重复消耗用户授权。已采用澄清错误分类和安全恢复协议的最小修复，不放宽 Session 隔离、不自动绑定，也不迁移 catalog。

### 8. 修复前后体验差异

- **修复前**：已绑定并刚完成 release → `select_goal` 报“尚未连接” → Runtime 不知道该 bind、问用户还是重试 → 手工 resolve 后才发现原绑定仍在。
- **修复后**：连接缓存与当前调用身份不连续 → 返回“先只读 resolve，再用同一 idempotency key 原样重试；不要 bind、不要再次询问用户”的明确恢复动作 → resolve 若仍为 bound，Runtime 自动继续原生命周期调用；只有 resolve 真正返回 unbound/suggested 时才进入正常项目选择流程。

### 9. 最小修复范围

只修改 Runtime MCP 的连接 guard、错误分类/序列化和 `goal-advance` 恢复说明，并补三类回归：已绑定 Session metadata 短暂缺失后的 resolve/retry、不同 Session 仍不串项目、真正 unbound 仍需项目选择。首版不引入 per-context 连接池，不从 cwd 或 suggestion 自动绑定，不改变 `context_bind` 权限和 catalog schema。可回滚为旧错误分支，不涉及数据迁移。

### 10. 验收边界

- **工程验证**：2026-08-30 两条定向 MCP 回归 2/2 通过，覆盖结构化恢复、resolve/retry、不同 Session 隔离和真正未绑定边界。历史整仓门禁 261/261、TypeScript 和 Skill 校验通过；最终整合状态的全量门禁尚未运行。
- **产品实操**：`UNVERIFIED`。当前 Codex 接入仍不完整；需在统一安装版复现“计划 Claim release → 同 Goal executor select”，确认消费者无需用户介入即可恢复，并检查真实换 Session 仍不能继承连接缓存。该问题属于 MCP/Skill 消费路径，Molis Work Web 页面本身没有可替代这段 Session 身份时序的点击验收。
- **Owner 最终验收**：实现与安装交付通过；真实新 Session 的消费者行为仍为 `UNVERIFIED`。

---

## GB-20260828-07：内嵌 Node 测试把 Homebrew Node 误当成可搬移运行时

**来源**：本次 v0.1.3 发布前整仓门禁
**Bug 确认**：非产品 Bug；属于 Molis Work 测试夹具的宿主可移植性缺陷
**修复决定**：作为本次打包的必要发布门禁修复
**修复状态**：2026-08-30 最终收口：嵌入 Runtime、293/293、打包 E2E 与最终安装 Core 通过；Owner 最终验收通过。本卡是发布门禁缺陷，不是用户功能 Bug。

**2026-08-30 复验进展**：定向安装测试 `bundled Node launchers use the installed runtime when PATH has no Node` 通过。正式打包脚本仍从 nodejs.org 下载指定架构 Node 22.23.2、按官方 `SHASUMS256.txt` 校验，并在打包前用内嵌 Node 实际导入 `better-sqlite3/node-pty/ws`；没有退回复制任意宿主 `process.execPath`。当前已安装 0.1.6 Runtime 的 `node --version` 为 v22.23.2，`otool -L` 只列系统 Framework/动态库；把 PATH 限制为 `/usr/bin:/bin` 后，已安装 `molis-work --help` 仍能正常运行。由此再次确认本卡主要是测试夹具缺陷，不是 Molis Work 用户交互 Bug。新的统一发布包尚未生成，仍需在最终包重复同一门禁。

### 1. 真实场景

在当前 macOS 开发机运行整仓测试时，“内嵌 Node 在 PATH 中没有 Node 时仍可启动”用例失败。临时安装目录里的 `runtime/node` 启动时报缺少 `@rpath/libnode.141.dylib`，使本次发布门禁停在 260/261。

### 2. 事实与归因

可稳定复现。测试直接复制当前 `process.execPath`；本机该文件来自 Homebrew Node 25.9.0，`otool -L` 证明它依赖 Homebrew 的 `libnode` 及多项动态库，单独复制后本来就不能运行。Molis Work 发布脚本实际下载 Node 官方 macOS 归档；当前已准备的官方 Node 22.23.2 运行时只依赖系统 Framework/动态库，并能独立执行。因此这是测试夹具把宿主 Node 错当成可分发 Node 的缺陷，不是新包运行时缺文件，也不是六张体验 Bug 的回归。

### 3. 现有流程的问题

同一份源码在官方 Node 或静态分发 Node 环境可过，在 Homebrew 动态 Node 环境必败。发布者看到的是“新包不自包含”，实际失败发生在测试自行制造的伪运行时，造成一次错误发布阻断，并可能诱导把 Homebrew 动态库复制进正式包。

### 4. 设计根因与初衷

测试原本想同时证明两件事：Molis Work launcher 使用安装目录内的 Node，而不是依赖 PATH；被复制的 Node 本身也是可搬移的官方运行时。直接复制 `process.execPath` 在当时宿主上碰巧覆盖二者，但把外部 Node 发行方式纳入了 Molis Work 安装器单测的责任范围。

### 5. 当前影响

影响使用动态链接 Node 的 macOS 开发者和发布机，频率为每次整仓测试一次，直接阻断 release gate；不影响已经由官方 Node 归档构建的用户包。若错误修复为携带 Homebrew 全套依赖，会扩大包体、签名面和宿主耦合。

### 6. 复杂度审查

- **当前必须**：测试只验证 Molis Work 自己的责任——launcher 在 PATH 没有 Node 时仍调用已安装的 `runtime/node`；正式构建继续实际执行下载并校验过的官方 Node。
- **可以延后**：在 CI 增加 `otool`/签名层面的官方 Node 依赖快照；覆盖更多 Node 发行方式的兼容矩阵。
- **应当删除**：把任意宿主 `process.execPath` 复制后视为可搬移 Node 的测试假设；把 Homebrew 动态库带入正式包的补偿方案。

### 7. 修复必要性与优先级

需要修复，P1（发布门禁）。它不是用户侧功能缺陷，但会稳定阻止当前机器完成可信发布；测试修复局限在夹具，不改变安装器或正式包结构。

### 8. 修复前后体验差异

- **修复前**：发布者运行门禁 → Homebrew Node 被复制到临时 release → 因缺动态库失败 → 被误导为 Molis Work 新包不可运行。
- **修复后**：夹具用绝对路径 Node 代理模拟已安装 runtime → PATH 中无 Node 时三个 launcher 仍从 release 的 `runtime/node` 入口启动；正式包的自包含性由官方 Node 下载、校验和实际执行链路负责。

### 9. 最小修复范围

只修改一条安装测试的 runtime fixture 和名称，不修改生产安装器、launcher、发布脚本、Node 版本或包内容。回滚只影响测试；正式构建没有数据或兼容迁移。

### 10. 验收边界

- **工程验证**：2026-08-30 定向安装测试 1/1 通过；当前安装的官方 Node 运行时依赖和无 PATH launcher 运行也通过。最终整合状态的整仓门禁和新包检查尚未运行。
- **产品实操**：此卡本身不适用 computer use 或用户交互验收；它只保护发布者不会被错误夹具阻断。当前安装 Runtime 可运行，但新统一包、Developer ID 签名和 Apple 公证仍不在本阶段证据范围内。
- **Owner 最终验收**：通过本次内部 0.1.7 包发布门禁；公开分发仍需 Developer ID 与 Apple 公证，未被本卡冒充完成。

---

## GB-20260829-08：租约过期后 Contract 同时显示失效与 active/started

**来源**：CGS G2B 主线消费者反馈 6
**Bug 确认**：已确认，属于 Molis Work 租约派生状态、物化时机与恢复动作不一致
**修复决定**：用户已批准
**修复状态**：2026-08-30 最终收口：过期 Claim/Run 的规范化投影、明确 next action、旧 Run 收束和 Web 展示工程/产品实操通过；0.1.7 已安装，Owner 最终验收通过。

### 1. 真实场景

executor 的 Claim 租约过期后，消费者读取同一 Goal 的 Contract。顶层 `work_state.active_claim=null`、`active_run=null`、`work_state=execution_pending`，但明细 `claims[]` 中旧 Claim 仍为 `state=active`，对应 `runs[]` 中旧 Run 仍为 `state=started`。消费者无法判断应继续上报旧 Run、先释放，还是直接重新领取。

### 2. 事实与归因

源码可确定性复现。`deriveGoalWorkState` 会按 `expires_at > now` 过滤 Claim，所以顶层已经视租约失效；原始 Contract 明细直接返回数据库记录，而 `expirePastClaims` 只在下一次 `claimGoal` 时把旧 Claim 物化为 `expired` 并把 Run 终结为 `abandoned`。更严重的是，`reportRun` 在新领取发生前没有检查 Claim 是否已经超时，旧执行者仍可能提交 `completed`；如果另一执行者先领取，旧 Run 又会先被自动 abandoned。结果取决于调用顺序。主要归因是 Molis Work 生命周期一致性 Bug，不是 CGS 误用；保留历史 Claim/Run 本身是预期行为，错误在于失效语义和写权限没有在所有接口上统一。

### 3. 现有流程的问题

同一份 Contract 同时告诉消费者“现在没有 active 工作”和“旧 Claim/Run 仍 active/started”，却没有标出哪个状态具有执行权威，也没有确定的 `next_action`。消费者若先 report，可能在租约外提交完成；若先 select，系统会悄然把旧 Run abandoned 并创建新 Run；若先 release，又是在操作一个按顶层已经失效的 Claim。多出的不是单纯一次点击，而是三个会产生不同历史结果的错误分支。

### 4. 设计根因与初衷

租约是为了让失联 Runtime 不会永久占用 Goal；超过 `expires_at` 后，新执行者应能领取。原设计采用惰性物化：派生可用性按当前时间忽略过期 Claim，真正有下一位领取者时再一次性写入 `claim=expired`、`run=abandoned` 和事件，避免后台计时器和无业务调用的数据库写入。这个初衷减少了服务复杂度，但 Contract 展示、旧执行者写权限和下一次领取没有共享同一个“有效租约”判断边界。

### 5. 当前影响

影响所有执行时间超过 lease 的澄清、执行、复核或重验证 Run；短任务不触发。它会阻断消费者的确定性恢复，并可能产生租约外完成、重复 Run 或表面上的孤儿 started Run。当前已有一条真实 CGS 记录，且源码路径可稳定证明；影响不是主观摩擦，而是同一历史可能因调用先后得到不同终态。

### 6. 复杂度审查

- **当前必须**：所有 Contract/Available 展示和 lifecycle 写入共享同一有效租约判断；过期 Claim/Run 对消费者统一呈现为失效，并明确旧 Run 不可再提交业务终态；重新领取时原子终结旧生命周期；错误给出可机器执行的恢复动作。
- **可以延后**：后台定时清扫、租约即将到期提醒、自动续租、通用任务心跳、跨进程租约监控面板。
- **应当删除**：让消费者根据 `expires_at` 自己猜 active 是否有效；允许旧执行者在租约外抢先提交完成；为了清理历史而要求用户手工 release 已失效 Claim。

### 7. 修复必要性与优先级

已批准修复，P1。它直接影响写权限和同一 Goal 的唯一执行者语义，风险高于普通展示不一致。修复没有引入后台服务，而是用读取时规范化展示、写入前统一租约屏障和明确恢复错误形成最小闭环。

### 8. 修复前后体验差异

- **修复前**：租约过期 → Contract 顶层说没有 active，明细仍说 active/started → Runtime 猜测 report、release 或 select → 不同调用顺序得到 completed 或 abandoned 等不同结果。
- **修复后**：租约过期 → Contract 明确旧 Claim 已失效、旧 Run 已中断且没有写权限，`next_action=select_goal` → 原执行者若继续 report，收到“租约已过期，不要重绑；重新 select”这一确定恢复动作 → 新领取原子接管，不留下 started 孤儿记录。

### 9. 最小修复范围

已修改 Contract 的时间派生展示、`reportRun`/`releaseClaim` 的租约有效性屏障和结构化错误，并沿用 `selectGoal` 现有的原子接管。只读 Contract 把已超时但尚未物化的记录投影为 `expired/abandoned`，不写事件；第一次 lifecycle 写入按真实 `expires_at` 物化且只生成一组事件。首版没有增加后台 timer、删除历史记录、自动续租或改变默认 lease 时长。回滚可恢复旧惰性物化逻辑，不需要数据迁移。

### 10. 验收边界

- **工程验证**：2026-08-30 重新验收通过源码边界。可控时钟覆盖 Contract 明细投影、report/release 恢复和新 select；新增 Web 回归验证同一过期 Claim 在 Goal 主视图与完整记录中统一显示 `expired/abandoned`，不再出现“最近一次推进正在进行”或 `started`。TypeScript 通过；定向 3/3、正常本机权限下 Web 全量 44/44 通过。受限沙箱曾有 20 项无关 fixture 报 `unable to open database file`，在相同代码的正常临时目录权限下全绿，因此不把沙箱失败伪装成代码回归。
- **产品实操**：源码构建通过。用真实时钟创建 10 秒 lease，等待其自然过期后，以 computer use 检查 Goal 主视图显示“待执行 / 最近一次推进已经停止 / abandoned”，再进入“记录 → 执行与检查”，确认 Claim=`expired`、Run=`abandoned` 且原因是租约到期。截图：`docs/qa/bug-revalidation/2026-08-30/gb08-expired-lifecycle-normalized.jpeg`。这证明源码 Web 消费路径，不等于最终安装 App、Core 与 Codex Skill 已一致。
- **Owner 最终验收**：通过工程与产品恢复旅程；0.1.7 已安装。用户本人对恢复说明的主观易懂性仍为 `UNVERIFIED`。

---

## GB-20260829-09：`repo:` 项目内 Evidence 被降级且没有可修正格式

**来源**：CGS G2B 主线消费者反馈 7
**Bug 确认**：确认是 Molis Work locator 协议可发现性和恢复提示设计债；不是现有校验器误判
**修复决定**：用户已批准
**修复状态**：2026-08-30 最终收口：`repo:` 文件与 Markdown anchor 已验证并规范化，错误返回推荐格式；0.1.7 已安装，Owner 最终验收通过。

### 1. 真实场景

消费者在 Content Growth Studio 的 executor Run 中提交两条真实存在的 Markdown 证据，locator 分别为 `repo:docs/reviews/2026-08-29-g2b-codex-review.md#engineering-verification` 和 `repo:docs/reviews/2026-08-29-g2b-codex-review.md#browser-assisted-product-checks`。Molis Work 将二者保存为 `UNVERIFIED`，只返回“不透明或外部 locator”，没有告诉消费者应该改成普通相对路径还是 `project://`。

### 2. 事实与归因

源码可确定性复现。当前校验器明确只把普通相对路径、`project://` 和位于 canonical workspace 内的绝对路径当作可验证项目文件；除 HTTP 和 `project://` 外，任何带 URI scheme 的值都会作为不透明 locator 保留。`repo:` 从未被声明为支持格式，因此不是校验器违反当前协议；但 MCP 工具说明只说“预检当前项目内文件与 Markdown anchor”，没有在 `locator` 参数旁列出支持格式，失败结果也没有返回可修正示例。消费者使用常见的 `repo:` 表达具有合理性。主要归因是 Molis Work 的协议可发现性与恢复设计债，不是 CGS 误用，也不是 workspace 归属错误。

### 3. 现有流程的问题

Evidence 已经不可变地以 UNVERIFIED 写入后，消费者才知道格式不被识别。它需要猜测绝对路径、`file:`、普通相对路径或 `project://`，重新提交一条 Evidence，再调用 correction 替代原记录。一次格式歧义变成两次额外写入和一条永久历史记录；若不修正，Review 又会把真实工程证据当成未验证。

### 4. 设计根因与初衷

Molis Work 把未知 scheme 当作不透明外部 locator，是为了不调用任意自定义协议、不把 URL 或命令误当成本地文件，也避免路径逃逸。内部使用 `project://` 是为了让存储记录不暴露机器绝对路径并能稳定跟随 workspace。这个安全边界合理；缺口是输入协议没有就近说明，且对可以安全映射到当前项目的 `repo:` 常见别名没有规范化或修正提示。

### 5. 当前影响

影响采用 `repo:<relative-path>#<anchor>` 表达仓库证据的 Runtime；普通相对路径、`project://` 和已修复的项目内绝对路径不受影响。当前已有两条真实 CGS Evidence 被降级，需要 correction 才能恢复验证等级。它不阻断文件存在，也不越权，但会降低验收可信度并污染 Evidence 历史，属于有明确绕行路径的 P2 体验问题。

### 6. 复杂度审查

- **当前必须**：让工具参数直接列出可验证格式；对安全的 `repo:<relative-path>` 给出确定处理——要么作为输入别名校验并统一存成 `project://`，要么在结果中返回机器可读的规范 locator 和 correction 动作。
- **可以延后**：支持更多宿主自定义 scheme、Git commit/blob 定位、跨仓库 Evidence、自动生成永久内容地址。
- **应当删除**：只返回“不透明或外部”而不区分可修正的当前项目别名；让 Runtime 靠试错猜 `file:`、绝对路径或内部协议。

### 7. 修复必要性与优先级

已批准修复，P2。当前虽已有三种安全格式和人工 correction 绕行，不是闭环硬阻塞；但 locator 是验收可信度基础，格式错误只能在写入后发现且 Evidence 不可变，修复收益明确。实现只接受 `repo:` 作为窄输入别名，仍只存 `project://`，没有新增第二套 canonical 协议。

### 8. 修复前后体验差异

- **修复前**：提交 `repo:docs/review.md#checks` → Evidence 被永久写为 UNVERIFIED → 猜格式并重提 → 再 correction 原记录。
- **修复后**：工具参数明确示例；提交安全的 `repo:docs/review.md#checks` → 按当前 canonical workspace 只读校验文件和 anchor → 存为 `project://docs/review.md#checks` 且返回 verified。项目外、逃逸路径和其他未知 scheme 仍不会被调用。

### 9. 最小修复范围

已修改 Evidence locator 的输入规范化、MCP `locator` 字段说明和 Skill 使用说明；仅接受形如 `repo:<安全相对路径>` 的当前项目别名，复用现有 realpath、范围和 Markdown anchor 校验，并统一存成 `project://`。没有支持 `file:`、访问网络、打开其他自定义协议或自动修改历史 Evidence。回滚时移除输入别名即可，已经规范化存储的记录仍是现有合法格式。

### 10. 验收边界

- **工程验证**：2026-08-30 重新验收通过。真实项目内 `repo:` Markdown 文件和 anchor 一次验证成功并统一存成 `project://`；`..` 逃逸被拒绝，其他 scheme 保持 UNVERIFIED；MCP schema 直接列出相对路径、`repo:`、`project://` 和 canonical workspace 绝对路径示例。TypeScript 与定向 V1/MCP 2/2 通过，GB08 后正常本机权限下 Web 全量 44/44 同时通过。
- **产品实操**：源码构建通过。以 Molis Work 真实仓库 `repo:README.md#Molis Work` 提交 inspection Evidence，返回 `verified`、规范 locator=`project://README.md#Molis Work` 和 workspace=`molis-work-source`；computer use 在“记录 → 执行与检查”看到“当前有效 / 已验证”、规范 locator、anchor 验证理由和 1/1 完成标准。项目引用 API 再以该 Evidence ID 打开真实 README 返回 HTTP 200 与 `# Molis Work` 正文。截图：`docs/qa/bug-revalidation/2026-08-30/gb09-repo-locator-verified.jpeg`。Chrome 直接打开一次性 temp fixture 时出现过 `unable to open database file`，同端点 curl 与正常权限 Web 全量测试均通过；因此不把该临时服务器现象算成最终 App 打开验收。
- **Owner 最终验收**：通过。协议、真实项目 Evidence 读取与边界回归已覆盖；用户本人易用性仍为 `UNVERIFIED`。

---

## GB-20260829-10：升级后的旧服务配置允许 restart 但无法完成修复

**来源**：v0.1.3 本机升级与安装实操
**Bug 确认**：已确认，属于 Molis Work Web 服务恢复动作和状态机不一致
**修复决定**：用户已批准，P1 修复
**修复状态**：2026-08-30 最终收口：隔离 needs_repair 旅程、修复动作和最终受管服务健康通过；Owner 最终验收通过。未知第三方监听者的保守不接管分支仍为安全边界，不主动制造实机冲突。

### 1. 真实场景

用户把 Molis Work App/Core 从 0.1.2 升级到 0.1.3。新版 `service status` 正确识别旧 LaunchAgent 归属，但因为 plist 的 PATH 仍引用旧 release，返回 `state=needs_repair`。随后执行安装结果中提供的 `service restart --confirm`，命令先完成受控停止和启动，却因 plist 没有被重写而再次得到 `needs_repair`，最终以失败退出。

### 2. 事实与归因

当前机器已稳定复现。0.1.3 安装前旧服务为受管且健康；Core 升级后 `status=needs_repair`；`service restart` 返回 `service.command_failed`，并自动保持原运行状态；不改其他文件而执行 `service install --confirm` 后，plist 与 receipt 被安全更新，服务进入 `running`，LaunchAgent、监听端口和 health PID 一致。源码也显示 `restart` 对 owned 的 `needs_repair` 返回 `ready`，但实现只重载现有 plist，不会写入 expected plist。主要归因是 Molis Work 服务状态机缺陷，不是第三方进程冲突，也不是用户误用。

### 3. 现有流程的问题

系统先告诉用户“旧配置，可确认修复”，又允许选择一个无法完成该修复的 restart 动作。用户会经历一次可预见的失败，并需要自行猜测 `service install` 才是修复命令；自动化方还可能把失败理解为端口冲突、服务不健康或需要手工编辑 LaunchAgent。

### 4. 设计根因与初衷

`restart` 原本只负责在不改配置的前提下重载受管实例，避免重写或接管未知 LaunchAgent；`install` 才拥有原子写 plist/receipt、失败回滚和重新启动的权限。这一职责分离合理。缺陷是规划层把“owned”误当成 restart 的充分条件，没有把 `needs_repair` 路由到唯一能物化新配置的 install/repair 路径。

### 5. 当前影响

影响升级后 expected plist 发生变化、而旧 LaunchAgent 仍受管运行的用户。本次 0.1.2 → 0.1.3 必现一次；失败会延迟新 Web runtime 生效，但现有回滚保持旧服务运行，不直接损坏数据。熟悉命令的维护者可用 `service install` 绕行，普通用户和自动化消费者缺少确定恢复动作。

### 6. 复杂度审查

- **当前必须**：`needs_repair` 时拒绝无效 restart，并明确返回 `next_action=service_install`；安装/升级结果若检测到运行中的旧配置，直接给出同一规范修复命令。
- **可以延后**：新增独立 `service repair` 命令、无中断双进程切换、LaunchAgent 配置版本迁移框架。
- **应当删除**：把 `needs_repair + owned` 规划为 restart ready；让用户从一次失败中反推真正命令。

### 7. 修复必要性与优先级

已批准修复，P1。它位于每次升级后的服务切换主路径，当前虽有安全绕行且失败可回滚，但自动化必然多走一次错误动作。最小修复只调整动作规划和恢复提示，不新增服务或迁移用户数据。

### 8. 修复前后体验差异

- **修复前**：升级 Core → status 提示 needs_repair → 执行 restart → 可预见失败 → 猜测并改用 install → 服务才切到新版本。
- **修复后**：升级 Core → status 明确旧配置需要物化 → 直接执行一次 service install/repair → 原子更新配置并启动新版本；普通 running 状态下 restart 行为不变。

### 9. 最小修复范围

修改 `planStatus`、service plan 的机器可读恢复动作、安装结果中的服务后续指引，以及诊断页与确认预览的“修复旧配置并重新加载”语义；补 `needs_repair + restart` 不再进入无效执行、`needs_repair + install` 成功、普通 running restart 不回归的测试。不手工编辑用户 plist，不放宽进程归属检查，不改变端口冲突策略。回滚只恢复旧动作路由和显示文案。

### 10. 验收边界

- **工程验证**：2026-08-30 重新验收通过。`needs_repair + restart` 返回 `conflict / next_action=service_install` 且零 launchctl 修改；`install` 计划明确输出“准备修复旧配置并重新加载”与对应确认语，完成后进入 `running`。TypeScript 检查和正常本机权限下 service/Web 全量 67/67 通过；沙箱内曾有 17 项因临时 SQLite `unable to open database file` 失败，换正常权限后全部通过，未把环境假失败隐去。普通 running restart、外部端口冲突、失败回滚和安装升级指引均在本轮全量回归中覆盖。
- **产品实操**：源码构建通过。computer use 在隔离 Molis Work Home 中先看到“需要修复 / 修复常驻服务”，未出现 restart；点击后预览明确“修复旧配置并重新加载”，确认后页面刷新为“运行中”，动作恢复为正常的“重启 / 停止 / 移除”。截图：`docs/qa/bug-revalidation/2026-08-30/gb10-repair-preview.jpeg`、`gb10-repair-completed.jpeg`。此前真实 0.1.3 → 0.1.4 服务恢复链仍是有效补充证据；真实未知/异 PID 监听者场景保持 `UNVERIFIED`。
- **Owner 最终验收**：主闭环通过并已进入 0.1.7；最终服务健康。未再次破坏当前 LaunchAgent 制造旧配置，异常分支由隔离实操覆盖。

---
