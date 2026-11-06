# Molis Work Bug 卡台账

状态：历史记录。本台账是 0.1.x 时期（截至 2026-08-31）的记录，不再更新，其中的 Claim/Evidence 等流程已退役；当前未做事项以 [specs/BACKLOG.md](../../../specs/BACKLOG.md) 为准。下面的维护规则是当时的做法。

更新时间：2026-08-31

[台账入口](../../molis-work-bug-cards.md) · [历史复审](review-2026-08-30.md)

这份台账记录本轮已经分析过的 Molis Work 体验问题，无论最终是否确认是真 Bug。它是产品判断与验收记录，不以“代码已经改动”代替“产品已经可用”。

## 维护规则

- 收到一个新 Case 并开始分析时，先创建对应 Bug 卡，再进行归因、方案或实现；不得等修完后补记。
- Case 的事实补充、归因变化、审批、实现、回归、发布、安装、产品实操、回退、重开和最终验收，都必须同步更新同一张卡及总览状态。
- 同一缺陷的后续影响优先补充原卡；只有根因、修复范围或验收闭环实质不同，才新建卡并注明关联关系。
- 每次汇报和发布判断以本台账的当前状态为入口，但仍需用仓库、安装路径、运行服务和真实产品实操重新核对易变事实。

## 状态口径

- **Bug 确认**：`已确认`、`非 Bug`、`设计债`、`接入问题`、`误用`、`预期行为`、`证据不足`可以组合使用，但必须说明主要归因。
- **修复决定**：`已批准`、`待审批`、`延后`、`不修`。
- **修复状态**：`未开始`、`实现中`、`源码已实现`、`工程验证通过`、`已安装`、`产品实操通过`、`最终验收通过`逐层推进，不能跨层升级。
- **验收边界**：工程验证、最终交付物上的产品实操和 Molis Work Owner 最终验收分别报告；真人主观体验或用户本人认可另行标记。
- **当前授权（2026-08-30）**：Owner 可独立判断 Case；一旦判断成立，无需等待逐卡审批，直接修复并依次完成工程验证、产品实操和 Owner 最终验收，直到清单全部闭环。该授权不把自动化或 Owner 判断冒充为“用户本人验收”，也不授权自行 push；push 仍由用户发起。

## 2026-08-31 当前交付快照

**0.1.11 发布候选（2026-08-31）**：用户已明确发起构建、commit、push 与 GitHub Release。本地 0.1.11 发布候选包含远端 `origin/main=db0c34f876469c51225784da3fbc3093764587db`、本分支既有八个提交及当前 GB24/GB40/GB42–GB48 等未提交修复；GB49/GB50 仍只分析，没有混入修复代码。完整 `pnpm test` **338/338**、TypeScript typecheck、Desktop Rust **12/12**、Rust format、版本一致性和 `git diff --check` 通过。

**0.1.11 本地资产**：Apple Silicon DMG SHA-256 为 `23b578fd74c38f17bcf769ec57e35a17e957119574352742f7116ed40f05eab1`，App ZIP 为 `ea410987c1175a703b2ee13aa9ff6b2a1bbe3018484f1407de6f1d30c722fb8d`，两个 sidecar 复核为 OK。App short/build version 与内嵌 Core 均为 0.1.11，App 与内嵌 Node 均为 arm64，源码与包内 `source_digest` 同为 `15748454f3cd985cf41bc7e95c172c9a29016d0da1d12a3b975b18b8a9637dc9`；严格 codesign 通过。签名仍为 ad-hoc、无 TeamIdentifier，未经过 Apple 公证，只能作为 GitHub Preview，不冒充正式公证发布物。

**发布前边界**：本地资产已完成工程级包验证，但尚未在本机替换 0.1.10 安装，也尚未完成 GitHub main/tag/Release 回读。GB47 的真实新 Session 自然语言交接、GB48 的最终安装 Runtime handoff 和用户主观体验仍为 `UNVERIFIED`；GitHub Intel 资产需以 workflow_dispatch 的独立 x64 构建结果为准。

**权威最终状态（2026-08-30 23:53）**：本地未发布的 **0.1.10** 已包含远端 `origin/main=db0c34f876469c51225784da3fbc3093764587db` 与本分支全部 GB24、GB40、GB42–GB45 等本地变更；当前分支 HEAD `212567e` 相对远端 main 为 ahead 8 / behind 0，本轮没有 commit、push、merge、tag 或 GitHub Release。完整 `pnpm test` **338/338**、Desktop Rust **12/12**、Rust format、版本一致性和 `git diff --check` 均通过。

**最终资产**：`Molis Work-0.1.10-macos-arm64.dmg` SHA-256 为 `649a17cb0966db8d1c3300a6d0d238c0d2a1ccb190ff0882ca81fa04a6a6fe25`；App ZIP 为 `d03a5833f6e5c233be79b7908f52c103cc1fd58a9a42d52d4f19efe57c332545`，两个 sidecar 从发布目录复核为 OK。App short/build version 与内嵌 Core 均为 0.1.10，App 和内嵌 Node 均为 arm64，源码与包内 `source_digest` 均为 `ed345ad512ad6c1ffda71584dfab966f6d54a1572ae79c10b986210e41567737`；严格 codesign 通过。签名仍为 ad-hoc、无 TeamIdentifier，不冒充 Apple 公证的公开发布物。

**最终安装与运行**：`/Applications/Molis Work.app`、home Core、CLI/Web launcher 与 Codex Skill 均已对齐到 0.1.10；同版本旧 App 可恢复地移到 `~/.Trash/Molis Work.app.20260830-235004`。因 Desktop 版本比较不会自动刷新同版本不同内容，最终 Core 额外通过 App 内置官方 installer 原子刷新，installation `content_digest=a346f7824e6a9fe9fca0cb0c0a813794df542bebb092b983d56b376b23493ced`，随后按官方指引重启受管服务。service status 为 `running/owned=true`，LaunchAgent `PATH` 指向 `releases/molis-work-0.1.10/runtime`，LaunchAgent/监听/health PID 同为 **72472**；`/api/settings/runtimes` 将 Codex 判为 `connected`，active Skill 与 release Skill SHA-256 一致。

**最终产品与协议实操**：在最终安装 App 的真实 CGS 上，Goal Tree 分栏从 300 拖到 520，长中文标题与 G2/G2A/G2B/C/G2G/V2 同时可读，旧 G2G/G2B 显示“已被替代”；顶部长工作标签未重叠。G4A 的“处理 1 项决定”深链自动定位并展开表单，预填对话结论、原话、来源、Evidence 和理由，未替用户提交。最终安装 Core 对真实 CGS 的 Available 只读核验确认：旧 G2G 不可领取并返回 replacement；G2E 在 completion Risk 下仍可执行；G2D 返回 `rework_request`；V2 子 Goal 的实际阻塞是 schema 依赖。隔离安装态另通过：外部 `file:` locator 原样登记为 UNVERIFIED 且不读盘；同仓 registered worktree 未提交文件为 verified 并可打开；Run completed → release → self-verifier handoff；legacy Contract raw/synthetic handle → native Proposal supersede，旧提案 superseded、新提案 pending、canonical Draft 不提前修改。

**剩余边界**：GB46 已确认为 GB45 的独立消费复现证据，不是新的源码缺口；当前源码定向回归和 0.1.10 安装 Core 的 raw/synthetic 两条隔离旅程均通过。Arena 旧 Session 需要新 Session 才能重新加载该 MCP 实现。GB47 已确认为 GB24 之上的 Core/Skill 交接缺口，并完成最小源码修复：只对唯一、完整覆盖当前人工 criteria 的 pending obligation 返回精确原话交接；多个待决项失败关闭；`human_verdict` 只预填 Inbox，最终 Human Review 仍由用户提交。该新增修复尚未进入安装包。GB13 是 CGS 领域/编辑台问题，仍不在 Molis Work 修复；GB15 的 CGS Contract 语义纠偏仍属 CGS；GB41 经最终安装 Core 和真实 CGS reason 复验后确认不是新 Risk Bug。需要真实新 Codex Session 才能观察的自然语言 Skill 行为，以及 G4A 最终真人提交/主观易懂性，继续标为用户侧 `UNVERIFIED`，不冒充产品或用户验收。

<details>
<summary>历史中间快照（已失效，仅保留排障审计）</summary>

**0.1.10 最终交付进行中**：2026-08-30 用户已明确要求闭环全部 Molis Work 最终交付层。只读 `git fetch origin --prune` 后确认 `origin/main=db0c34f876469c51225784da3fbc3093764587db`，当前修复分支相对远端 main 为 ahead 8 / behind 0，未漏远端 main 更新。现有 0.1.9 已经是旧安装物，因此本轮将版本统一提升为 0.1.10；范围为构建、资产校验、本机 App/Core/service/Codex MCP+Skill 安装及最终实操，不含 push、merge、tag 或 GitHub Release。

**0.1.10 构建进展**：四处版本源已统一为 0.1.10。首次构建被 pnpm 11 的锁文件供应链复验拦住：两个依赖实际来自仓库内固定 `vendor/*.tgz`，但复验按包名访问私有 Registry 并得到 404；`pnpm-lock.yaml` 与远端 main 一致且两个 tarball 已重新计算 SHA-256，因此仅对本次已核对锁文件执行官方 `pnpm install --trust-lockfile --frozen-lockfile`，没有全局关闭安全策略，随后源码 build 通过。第二次 Desktop 构建在内嵌 Runtime 的 npm 安装阶段被本机 `~/.npm` 历史 root-owned cache 拦住；该问题不通过改权限或覆盖用户 cache 解决，后续构建改用隔离临时 npm cache。隔离 cache 生效后，构建门禁又发现版本提升时曾机械改中 `Cargo.lock` 内无关的 `cargo-platform` 依赖版本，而应用自身锁文件版本仍少升一级；现已精确恢复依赖到 0.1.9，并只把 `molis-work-desktop` 改为 0.1.10。该错误没有生成或安装半成品，发布回归必须核对应用包条目与关键依赖锁定，而不能只 grep 首个版本号。

**0.1.10 资产已构建并通过发布前校验**：新增发布版本一致性门禁，强制 `package.json`、Tauri config、`Cargo.toml` 与 `Cargo.lock#molis-work-desktop` 四处一致，定向回归通过。最终 arm64 App/DMG 已生成；DMG SHA-256 为 `9443f666c3f329ea3f224eb744d77e78558a729b4e615a43305260d1b6cd7203`，App ZIP 为 `e7b88a07cd66c94adb23d39c0e40e41ecc4ef473a61e959924ff177b065a0965`，两个 sidecar 均复核通过。解包后 App short/build version、内嵌 Core 均为 0.1.10，App 与内嵌 Node 都是 arm64，源码和包内 `.molis-work-build.json.source_digest` 同为 `c69012fb9ba4c6b8567534256897534d3a571835957e93688a331dba2c3ed0e5`；严格 codesign 校验通过。签名仍为 ad-hoc、无 TeamIdentifier，`spctl` 未通过，因此只作为本机安装包，不冒充 Apple 公证的公开发布物。

**0.1.10 本机安装与接入已对齐**：已将 `/Applications/Molis Work.app` 的 0.1.9 可恢复地移动到 `~/.Trash/Molis Work.app.20260830-233326`，安装 0.1.10；新 App 首启将 home Core 升到 0.1.10，并通过 GB42 的原子服务交接把 LaunchAgent `PATH` 更新到 `releases/molis-work-0.1.10/runtime`。官方 service status 为 `running/owned=true`，LaunchAgent、监听和 `/health.service_process_id` 均为 PID 67442。Codex 接入先预览后确认，计划只替换旧 Skill 链接和所有权收据，没有改写已正确的 MCP 配置；`/api/settings/runtimes` 现为 `connected`，active Skill 链接到 0.1.10 且文件 SHA-256 与 release 完全一致。旧 Session 不会热加载新 Skill/MCP，本记录只支持安装与接入一致，fresh Session 协议和最终 UI 实操仍需继续完成。

本节覆盖各卡片中按发生时间记录的历史安装证据，避免把旧段落里的“已安装”误读成当前统一交付。2026-08-30 再次刷新远端后，`origin/main` 与本地 `main` 均为 `db0c34f876469c51225784da3fbc3093764587db`（tag `v0.1.8`）；当前分支 HEAD 为 `212567e`，相对远端 main 为 **ahead 8 / behind 0**，八个提交均未 push。

**当前本地包与安装**：`/Applications/Molis Work.app`、App 内嵌 Runtime、`~/.molis-work/config/installation.json`、home CLI/Web launcher 均为 **0.1.9**；App 内嵌与 home Core 的构建指纹同为 `3ee421eb97219f3a9ff1e1fc97ddb079582f58ad025747fedd744f9bf24ef7ad`。`Molis Work-0.1.9-macos-arm64.app.zip` SHA-256 为 `eda561d4ab051fe507359de6efecc8b56fdf9b08df4d9653691913edfecbd895`，DMG 为 `648f8ddaabee7355304bd217ea0c4d030d3eef79890a01f8d9d7f2f62aa66c32`，两个 sidecar 复核通过；安装 App 的严格 codesign 通过，但仍是 ad-hoc 签名、没有 TeamIdentifier，不能称 Apple 公证发布。

**当前不一致**：服务进程与 `/health.service_process_id` 同为 12637，页面健康且 home launcher 执行 0.1.9；但官方 service status 为 `needs_repair`，LaunchAgent `PATH` 仍从 `molis-work-0.1.8/runtime` 开始，这正是 GB42 的修复前现场。active Codex Skill `~/.codex/skills/goal-advance` 仍链接 **0.1.7**；官方只读 `/api/settings/runtimes` 也把 Codex 判为 `needs_repair`，而不是未知 conflict，证明后续可以走受管 repair 事务。0.1.9 release 目录内虽然包含 GB33–GB39 的协议/Skill 资产，当前 Codex 新 Session 也不会自动消费它们。当前状态绝不能表述为 App/Core/service/Skill 已统一。

**工程验证**：GB38–GB41 合并态完整 `pnpm typecheck && pnpm test` 为 **331/331**；GB42 增加 Desktop 升级交接回归后，Desktop Rust 为 **12/12**，Web service 状态机为 **23/23**，TypeScript typecheck、Rust format 与 diff check 通过。`cargo clippy --all-targets -D warnings` 仍被本卡范围外两条既有 warning 阻断，未冒充为绿。

**2026-08-30 当前整合门禁**：GB24/GB43 合并进当前工作树后首次完整 `pnpm test` 未通过，准确暴露 2 条整合缺口：Desktop TUI 回归仍把 GB43 已删除的 334px 分栏硬上限当作契约；GB24 新增的焦点兜底文案“待处理决定”缺少英文翻译。两项均归回原 Case，不新增编号：删除重复的旧 CSS 源码断言，由 GB43 的真实浏览器宽度/换行回归承担行为门禁；补齐英文可访问名称。GB44 加入同仓 worktree Evidence 回归后，第一次完整门禁又暴露本机 npm cache 权限与沙箱内 Headless Chrome 启动限制；相关失败脱离限制后均通过。最终改用隔离临时 npm cache 并允许真实 Headless Chrome 后，从头完整 `pnpm test` 为 **335/335、0 fail**；TypeScript typecheck、Desktop Rust 12/12、Rust format 与 `git diff --check` 通过。该证据只支持当前源码整合态，不等于已构建或安装新发布包。

**产品与协议实操**：0.1.9 安装 App 已用真实 Casebook 验证 GB35 的 Web/Desktop 共用标签布局；0.1.9 release asset/隔离项目已验证 GB36–GB39 的 Contract-before-Select、blocked overview、accepted successor 恢复和 proposal 精确整份确认。GB33/GB34 的实现可从 0.1.9 release asset 读回，但 active Codex Skill 仍是 0.1.7，真实新 Session 消费未通过。GB24 先在当前安装 App 的真实 CGS / G4A 复现旧问题，随后在 4175 源码服务的真实 CGS 数据副本中用 Safari 通过普通 Web 与 `?desktop=1` 桌面壳深链实操：目标 Inbox 项、对话验收原话、Evidence、理由和一次提交表单均直接进入视区且获得焦点，没有提交或改写 CGS 数据。GB43 已在安装 App 与 4173 Web 双端复现旧问题，并在同一源码服务的真实 CGS 数据上验证标题完整换行、分栏 334→520 和桌面壳一致性。GB44 已对来源真实 worktree 文件完成只读验证，并用临时真实 Git worktree 跑通 Coordinator → Evidence → Web 打开及删除后 404 的完整源码旅程。GB24、GB40、GB42、GB43、GB44 都是 0.1.9 构建之后的本地修复，当前 App/Core 不包含。

**剩余边界**：2026-08-30 再按总览逐项审计，GB01–GB44 中没有“已经成立、仍缺 Molis Work 源码实现”的 Case；GB13 正确路由 CGS，GB41 不成立为新 Risk Bug，其余成立项均已达到各卡记录的源码/工程/隔离产品层边界。尚未闭环的是最终交付层：用户已明确暂停新包构建，因此不生成 0.1.10/替代 0.1.9，不修改真实 LaunchAgent，也不擅自改 Runtime 接入。下一份经用户明确发起的包至少需要包含 GB24、GB40、GB42、GB43、GB44 与远端 main；安装后再修复 owned service、经用户确认升级 Codex MCP/Skill、重开 Session，并分别复验 GB24、GB31、GB33、GB34、GB36、GB37、GB38、GB39、GB40、GB41、GB42、GB43、GB44。G4A 的最终真人确认动作和主观易懂性仍由用户验收。

</details>

## 总览

| ID | 标题 | 主要归因 | Bug 确认 | 修复决定 | 修复状态 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| [GB-20260828-01](cards-01-10.md#gb-20260828-01当前消息已明确项目仍被重复确认) | 当前消息已明确项目仍被重复确认 | Molis Work Skill 授权识别缺陷 | 已确认 | 已修复 | 0.1.7 Skill/Core 已安装并做 fresh MCP 协议验收；真实新 Codex Session 待用户侧观察 | P1 |
| [GB-20260828-02](cards-01-10.md#gb-20260828-02已完成执行被-available-误导为再次执行) | 已完成执行被 Available 误导为再次执行 | Molis Work 派生状态缺陷 | 已确认 | 已修复 | 293/293 与隔离生命周期实操通过；0.1.7 构建指纹一致，Owner 验收通过 | P1 |
| [GB-20260828-03](cards-01-10.md#gb-20260828-03项目内绝对路径被误报为项目范围外) | 项目内绝对路径被误报为项目范围外 | Molis Work locator 设计缺陷 | 已确认 | 已修复 | 项目内路径/anchor、安全越界与 symlink 边界通过；0.1.7 已安装，Owner 验收通过 | P1 |
| [GB-20260828-04](cards-01-10.md#gb-20260828-04同一-launchagent-pid-被误报为端口冲突) | 同一 LaunchAgent PID 被误报为端口冲突 | Molis Work 服务归属兼容缺陷 | 已确认 | 已修复 | 最终服务 `running/owned=true`，监听与 LaunchAgent PID 同为 11021；Owner 验收通过 | P1 |
| [GB-20260828-05](cards-01-10.md#gb-20260828-05对话使用-g2ag2bgoal-tree-隐藏对应-id) | 对话使用 G2A/G2B，Goal Tree 隐藏对应 ID | Molis Work Desktop CSS 与短引用碰撞缺陷 | 已确认 | 已修复 | 最终安装 App 真实 CGS、286px 窄栏实操通过；唯一短引用与中文标题同时可读 | P1 |
| [GB-20260828-06](cards-01-10.md#gb-20260828-06已绑定-session-的生命周期调用偶发误报未连接) | 已绑定 Session 的生命周期调用偶发误报未连接 | Molis Work 连接缓存与恢复语义缺陷 | 已确认 | 已修复 | 工程与重试契约通过，0.1.7 已安装；真实新 Codex Session 连续推进待用户侧观察 | P1 |
| [GB-20260828-07](cards-01-10.md#gb-20260828-07内嵌-node-测试把-homebrew-node-误当成可搬移运行时) | 内嵌 Node 测试把 Homebrew Node 误当成可搬移运行时 | Molis Work 测试夹具可移植性缺陷 | 非产品 Bug、工程缺陷 | 已修复 | 最终嵌入 Runtime、293/293 与打包门禁通过；Owner 验收通过 | P1（发布门禁） |
| [GB-20260829-08](cards-01-10.md#gb-20260829-08租约过期后-contract-同时显示失效与-activestarted) | 租约过期后 Contract 同时显示失效与 active/started | Molis Work 租约派生与物化一致性缺陷 | 已确认 | 已修复 | 过期投影、恢复动作与 Web 读取工程/产品实操通过；0.1.7 已安装 | P1 |
| [GB-20260829-09](cards-01-10.md#gb-20260829-09repo-项目内-evidence-被降级且没有可修正格式) | `repo:` 项目内 Evidence 被降级且没有可修正格式 | Molis Work locator 协议可发现性设计债 | 设计债 | 已修复 | `repo:` 文件与 anchor 验证、规范化和错误建议通过；0.1.7 已安装 | P2 |
| [GB-20260829-10](cards-01-10.md#gb-20260829-10升级后的旧服务配置允许-restart-但无法完成修复) | 升级后的旧服务配置允许 restart 但无法完成修复 | Molis Work 服务恢复动作缺陷 | 已确认 | 已修复 | 隔离 repair 旅程与最终服务健康通过；未知第三方监听安全分支保留为 `UNVERIFIED` | P1 |
| [GB-20260829-11](cards-11-20.md#gb-20260829-11活跃长任务无续租入口执行中静默过期) | 活跃长任务无续租入口，执行中静默过期 | Molis Work 租约续期与可见性设计缺陷 | 已确认 | 已修复 | 同 Claim/Run 续租、提示和事件实操通过；0.1.7 已安装 | P1 |
| [GB-20260829-12](cards-11-20.md#gb-20260829-12runtime-反复领取只剩人工判断的复核) | Runtime 反复领取只剩人工判断的复核 | Molis Work Review 条件路由与人工等待状态缺陷 | 已确认 | 已修复 | 最终安装 App 真实 G4A 显示 waiting-for-human，Runtime 不再重复领取；用户本人验收仍 pending | P1 |
| [GB-20260829-13](cards-11-20.md#gb-20260829-13opportunity-有引用但看不到研究过程与样本漏斗) | Opportunity 有引用但看不到研究过程与样本漏斗 | CGS 领域模型与编辑台设计债 | 设计债、接入问题 | 不在 Molis Work 修复 | 真实问题成立；Molis Work 侧结案并路由 CGS，CGS 修复未开始 | P1（CGS） |
| [GB-20260829-14](cards-11-20.md#gb-20260829-14goal-tree-提案-payload-需要查源码才能构造) | Goal Tree 提案 payload 需要查源码才能构造 | Molis Work MCP 契约自描述缺陷 | 已确认 | 已修复 | 最终安装 MCP 判别 schema、字段路径与方向说明通过；Owner 协议验收通过 | P1 |
| [GB-20260829-15](cards-11-20.md#gb-20260829-15子-goal-用样本验收却被理解成父级能力已经具备) | 子 Goal 用样本验收却被理解成父级能力已经具备 | Molis Work 跨层 Contract 覆盖设计债 + CGS 建模错误 | 设计债、接入问题 | Molis Work 部分已修复 | 父级不再被样本子 Goal 自动完成并显式显示覆盖缺口；CGS Contract 语义纠偏仍属 CGS | P1 |
| [GB-20260829-16](cards-11-20.md#gb-20260829-16appcore-与-codex-skill-实际版本不一致) | App、Core 与 Codex Skill 实际版本不一致 | 发布与 Runtime 接入验收缺陷 | 已确认 | 已修复并安装 | App/Core/home launcher/LaunchAgent PATH/Codex Skill 全部对齐 0.1.10；服务 running/owned，Runtime connected | P1 |
| [GB-20260829-17](cards-11-20.md#gb-20260829-17大型-goal-tree-变更只有技术-diff缺少问题与效果解释) | 大型 Goal Tree 变更只有技术 diff，缺少问题与效果解释 | Molis Work Proposal 可理解性设计债 | 设计债 | 已修复 | 结构化语义摘要、逐项影响与代表性 computer-use 实操通过；0.1.7 已安装 | P2 |
| [GB-20260829-18](cards-11-20.md#gb-20260829-18整份-goal-tree-确认会在决定阶段部分落地) | 整份 Goal Tree 确认会在决定阶段部分落地 | Molis Work Proposal 原子性与预检一致性缺陷 | 已确认 | 已修复 | check/decide 同源预检、whole-confirm 零部分写入与恢复契约通过；Owner 验收通过 | P1 |
| [GB-20260830-19](cards-11-20.md#gb-20260830-19桌面健康恢复与-launchagent-修复互相抢占-4173) | 桌面健康恢复与 LaunchAgent 修复互相抢占 4173 | Molis Work Desktop 恢复策略缺陷 | 已确认 | 已修复 | 源码 App 恢复旅程与最终受管服务重启/健康通过；Owner 验收通过 | P1 |
| [GB-20260830-20](cards-11-20.md#gb-20260830-20planning-methods-全量正文返回被截断) | Planning Methods 全量正文返回被截断 | Molis Work MCP 读取契约与规模设计缺陷 | 已确认 | 已修复 | 轻量目录、按 method_ids 正文读取与分页工程/协议验收通过；0.1.7 已安装 | P1 |
| [GB-20260830-21](cards-21-30.md#gb-20260830-21大型项目内-evidence-因不可全文打开而无法登记) | 大型项目内 Evidence 因不可全文打开而无法登记 | Molis Work Evidence 预检与登记耦合缺陷 | 已确认 | 已修复 | 大文件 locator+digest 登记、preview_unavailable 与修复建议通过；0.1.7 已安装 | P1 |
| [GB-20260830-22](cards-21-30.md#gb-20260830-22legacy-rewire-可统一读取但不能用同一-handle-决定) | Legacy Proposal 可统一读取但 read/check/decide handle 不可组合 | Molis Work 兼容视图与提案 API 不可组合 | 已确认 | 已修复 | Rewire/Contract raw 与 synthetic handle 的 read/check/decide 组合回归通过；0.1.7 已安装 | P0（解除 Arena 阻塞） |
| [GB-20260830-23](cards-21-30.md#gb-20260830-23available-默认展开全部-contract-导致输出截断) | Available 默认展开全部 Contract 导致输出截断 | Molis Work MCP 默认读取粒度缺陷 | 已确认 | 已修复 | 最终安装 MCP schema 确认 summary 默认，full 显式展开；Owner 协议验收通过 | P1 |
| [GB-20260830-24](cards-21-30.md#gb-20260830-24对话已完成人工验收inbox-仍要求重复填写且深链找不到表单) | 对话已完成人工验收，Inbox 仍要求重复填写且深链找不到表单 | Molis Work 人工验收交接与 Decision 深链缺陷 | 已确认 | 已修复并安装 | 0.1.10 真实 CGS/G4A 深链自动展开并预填结论、原话、来源、Evidence 与理由；未替用户提交 | P0 |
| [GB-20260830-25](cards-21-30.md#gb-20260830-25范围纠偏后历史-run-blocker-仍像当前有效阻塞) | 范围纠偏后历史 Run blocker 仍像当前有效阻塞 | Molis Work 当前阻塞派生与历史展示缺陷 | 已确认 | 已修复 | blocker supersession/历史降级与当前真相展示工程、computer-use 实操通过 | P1 |
| [GB-20260830-26](cards-21-30.md#gb-20260830-26大型-proposal-预检漏掉不可变与唯一约束决定后才部分失败) | 大型 Proposal 预检漏掉不可变与唯一约束，决定后才部分失败 | Molis Work Proposal 唯一约束与恢复诊断缺陷；原子性部分与 GB18 去重 | 已确认部分成立 | 已修复 | accepted/unique/原始数据库错误转换、replacement 指引和零写入恢复通过 | P1 |
| [GB-20260830-27](cards-21-30.md#gb-20260830-27completion-risk-作用域不明且错误阻止-executor-返工) | 新反证出现后，完成门禁中的 unmet Goal 无法返回 executor 返工 | Molis Work 生命周期恢复提示缺陷；原 claim-gate 归因不成立 | 已确认（修正归因） | 已修复 | 最终安装 Core 对真实 G2D 返回 rework_request 恢复；未修改 CGS 数据 | P0 |
| [GB-20260830-28](cards-21-30.md#gb-20260830-28compaction-后续租只有-claim_id无法从-context-得到正确-actor) | Compaction 后续租只有 claim_id，无法从 context 得到正确 actor | Molis Work 租约恢复错误契约设计债 | 已确认 | 已修复 | context/错误返回 owner 与 remediation，真实 MCP 恢复实操通过；0.1.7 已安装 | P2 |
| [GB-20260830-29](cards-21-30.md#gb-20260830-29draft-每轮写入与恢复都返回完整历史长对话输出被截断) | Draft 每轮写入与恢复都返回完整历史，长对话输出被截断 | Molis Work clarification 默认响应粒度缺陷 | 已确认 | 已修复 | 默认增量响应、显式 history 分页与 12 轮 MCP 实操通过；0.1.7 已安装 | P1 |
| [GB-20260830-30](cards-21-30.md#gb-20260830-30contract-proposal-缺字段时抛出-undefinedtrim-裸异常) | Contract Proposal 缺字段时抛出 undefined.trim 裸异常 | Molis Work Contract schema 与运行时输入校验缺陷 | 已确认 | 已修复 | 完整 schema、字段路径、失败零写入与 Arena 成功恢复证据通过；0.1.7 已安装 | P0（解除 Arena 阻塞） |
| [GB-20260830-31](cards-31-40.md#gb-20260830-31replacement-goal-已生效旧-goal-仍进入-ready) | replacement Goal 已生效，旧 Goal 仍进入 Ready | Goal replacement 生命周期与 Ready 过滤缺陷 | 已确认 | 已修复并安装 | 0.1.10 对真实 CGS 返回旧 G2G `replaced`、replacement_goal_id=V2，且不在 Available | P0 |
| [GB-20260830-32](cards-31-40.md#gb-20260830-32leaf_readiness-非法枚举被误报为没写判断无-clarification-run-也缺恢复动作) | leaf_readiness 非法枚举被误报为“没写判断”，无 clarification Run 也缺恢复动作 | Goal Tree 输入校验与恢复提示缺陷 | 已确认 | 已修复 | 最终安装 MCP schema 显示 `keep | split`，精确错误与 resume hint 回归通过 | P1 |
| [GB-20260830-33](cards-31-40.md#gb-20260830-33单轮-run-收口后只汇报过去不交代或继续下一轮) | 单轮 Run 收口后只汇报过去，不交代或继续下一轮 | Molis Work Skill + MCP handoff 可发现性设计债，消费者遗漏为直接触发 | 已确认（修正归因） | 已修复并安装 | 0.1.10 active Skill 明确 release 后刷新 Available、汇报下一 Goal/动作/why-now 并在授权内继续；新 Session 自然语言表现待用户观察 | P1 |
| [GB-20260830-34](cards-31-40.md#gb-20260830-34跨仓库-goal-的本地-evidence-无法诚实落档) | 跨仓库 Goal 的本地 Evidence 无法诚实落档 | Evidence locator 分类与恢复契约缺陷；多 workspace 验证属延后能力 | 已确认 | 已修复并安装 | 0.1.10 安装 Core 实操：外部 `file:`+digest 原样登记 UNVERIFIED、不读盘，并返回 verified 恢复建议 | P2 |
| [GB-20260830-35](cards-31-40.md#gb-20260830-35依赖视图顶部工作区标签重叠标题无法辨认) | 依赖视图窄窗口顶部工作区标签文字互相重叠 | Web/Desktop 共用布局缺陷 | 已确认 | 已修复并安装 | 0.1.10 真实 CGS 多个长工作标签保持可读并滚动，不再互相覆盖 | P1 |
| [GB-20260830-36](cards-31-40.md#gb-20260830-36available-未暴露关键-scope-冲突消费者领取后才发现-goal-不承接当前产物) | Available 候选未提示请求产物与 Goal out_of_scope 冲突 | 消费顺序与范围可发现性设计债 | 已确认（修正归因） | 已修复并安装 | 0.1.10 active Skill 要求 Available → 完整 Contract scope check → Select；out_of_scope 不再靠误领发现 | P1 |
| [GB-20260830-37](cards-31-40.md#gb-20260830-37已有可消费上游产物时下游已归属修复仍从-available-完全消失) | 依赖阻塞的 accepted leaf 从 Available 完全消失 | Available 受阻入口可发现性缺陷 | 已确认 | 已修复并安装 | 0.1.9 隔离协议实操显示 `blocked_overview`、依赖链和 Explain 恢复动作 | P1 |
| [GB-20260830-38](cards-31-40.md#gb-20260830-38accepted-未完成-goal-的局部纠偏被迫手工扩成整图-successor-迁移) | accepted Goal 局部纠偏只返回抽象 successor 指令 | 错误归类与 successor 恢复信息缺陷；不可变设计本身成立 | 已确认（部分成立） | 已修复并安装 | 0.1.9 隔离实操通过 leaf 文案、successor 骨架、逐关系迁移候选与零 canonical 写入 | P1 |
| [GB-20260830-39](cards-31-40.md#gb-20260830-39唯一整份-proposal-已明确询问并获简短确认decide-仍拒绝-whole-confirmation) | 精确整份 Proposal 已获确认仍因 Board 其他待审项被拒绝 | whole-confirmation 授权绑定缺陷 | 已确认 | 已修复并安装 | 0.1.9 隔离实操一次确认只应用目标 Proposal，无关 Proposal 保持 pending | P1 |
| [GB-20260830-40](cards-31-40.md#gb-20260830-40executor-run-completed-后-review-隐藏且执行收尾不说明要-release) | executor Run completed 后 Review 隐藏且“执行收尾”不说明要 release | Run→Review 交接动作可发现性缺陷；列表隐藏部分与 GB37 去重 | 已确认（部分新增） | 已修复并安装 | 0.1.10 安装 Core 实操：Run/Contract/Available 返回精确 release handoff；release 后 self_verifier 可见 | P1 |
| [GB-20260830-41](cards-41-50.md#gb-20260830-41v2-kol-子-goal-被-completion-only-risk-挡出-executor-available) | V2 KOL 子 Goal 被 completion-only Risk 挡出 executor Available | 旧 Session、真实依赖与相关 Risk 呈现被混读 | 非新 Bug（已完成真实 reason 复验） | 不新增修复 | 0.1.10 真实 CGS：G2E 在 completion Risk 下可执行；V2 子 Goal 实际被 schema 依赖阻塞；旧 Goal 另归 GB31 | 去重 |
| [GB-20260830-42](cards-41-50.md#gb-20260830-42coreapp-升级后受管-launchagent-仍携旧-release-path健康服务被标记-needs_repair) | App/Core 升级后健康服务仍携旧 release PATH 并显示 needs_repair | Desktop 升级后的服务交接缺陷 | 已确认 | 已修复并安装 | 0.1.10 LaunchAgent PATH、launcher 与 Core 对齐；service running/owned，LaunchAgent/监听/health PID=72472 | P1 |
| [GB-20260830-43](cards-41-50.md#gb-20260830-43窄栏-goal-tree-标题全部省略且分栏无法继续拉宽) | 窄栏 Goal Tree 标题全部省略且分栏无法继续拉宽 | Goal Tree 响应式可读性与分栏约束缺陷 | 已确认 | 已修复并安装 | 0.1.10 真实 CGS App 分栏 300→520；长中文标题完整换行、短编号和状态同时可读 | P1 |
| [GB-20260830-44](cards-41-50.md#gb-20260830-44同仓库隔离-git-worktree-的真实文件无法成为-verified-evidence) | 同仓库隔离 Git worktree 的真实文件无法成为 verified Evidence | Evidence workspace 与 Git worktree 身份连续性缺口 | 已确认 | 已修复并安装 | 0.1.10 安装 Core 实操：registered worktree 未提交文件 verified、记录实际根并可读取；跨仓边界保留 | P1 |
| [GB-20260830-45](cards-41-50.md#gb-20260830-45native-proposal-无法-supersede-可统一读取决定的-legacy-contract-proposal) | Native Proposal 无法 supersede 可统一读取/决定的 Legacy Contract Proposal | Goal Tree legacy handle 可组合性与恢复契约缺陷 | 已确认 | 已修复并安装 | 338/338；0.1.10 安装 Core raw/synthetic 两条旅程均为旧 superseded、新 pending、canonical Draft 未提前改写 | P1 |
| [GB-20260831-46](cards-41-50.md#gb-20260831-46native-proposal-无法把-legacy-contract-proposal-作为-supersedes_proposal_id) | Native Proposal 无法把 Legacy Contract Proposal 作为 `supersedes_proposal_id` | GB45 的独立消费复现；Arena 旧 Session 未消费已安装修复 | 体验现象成立，非新 Bug | 与 GB45 去重，不重复改码 | 当前源码 1/1；0.1.10 安装 Core raw/synthetic 2/2 通过；Arena 需新 Session 加载 | P1 |
| [GB-20260831-47](cards-41-50.md#gb-20260831-47对话中已明确人工确认仍必须到-inbox-重复表达) | 对话中已明确人工确认，仍必须到 Inbox 重复表达 | Molis Work Core/Skill 未连接明确对话确认与 GB24 安全预填入口 | 已确认（修正方案） | 已修复源码；不授予 Runtime 人类审批权 | 唯一待决 exact-quote handoff、多个待决失败关闭与 Inbox 预填工程/源码产品旅程通过；已进入 0.1.11 发布候选，真实新 Session 待用户观察 | P0 |
| [GB-20260831-48](cards-41-50.md#gb-20260831-48goal-tree-变更后没有主动召回受影响子图复核) | Goal Tree 变更落地后不主动召回受影响祖先、消费者与相邻依赖 | Goal Tree materialization 后缺少默认语义复核 handoff | 已确认 | 已修复源码；不自动改树 | 结构应用与 semantic review 分离，影响子图和后续动作写入决定/事件；CGS G3 代表性回归通过，已进入 0.1.11 发布候选 | P1 |
| [GB-20260831-49](cards-41-50.md#gb-20260831-49明确双轨战略目标在-goal-tree-中被压平成一级列表) | 用户确认双轨主线，但 Goal Tree 将九个结果平铺为一级 Goal | 待核实：战略分组语义未进入规划方法与 Proposal preflight | 分析中 | 成立即做最小防遗漏修复；不自动造文件夹 Goal | 已登记；正在核对 decomposition 方法、narrative/review 与 Web 表达边界 | P1 |
| [GB-20260831-50](cards-41-50.md#gb-20260831-50skill-承诺跨仓-file-可登记runtime-仍按项目外文件拒绝) | Skill 允许跨仓 `file:///` 登记 UNVERIFIED，但当前 Runtime 仍拒绝 | 待核实：GB34 修复未被当前 Session 消费或安装/运行态不一致 | 分析中 | 按用户要求只分析，暂不修复 | 已登记；待核对 Session 加载版本、安装 Core 与 locator 分支 | P1 |

---

## 2026-08-29 v0.1.5 最终产物回归复核

本轮不是复查“有没有修复 commit”，而是从远端 `main`、v0.1.5 Release、本机 Core、App 内嵌 Runtime、常驻服务、Codex 实际 Skill 链接和真实 CGS 页面逐层核对。`pnpm test` 当前覆盖 274/274，但这只支持工程层；下表单独记录最终产物与真实数据看到的结果。

| Bug | 当前证据 | 回归结论 |
| --- | --- | --- |
| GB01 | v0.1.5 包内 Skill 有“当前消息明确选择则不重复确认”，但 Codex 实际 Skill 仍链接 `molis-work-0.1.1`，没有该规则 | 交付未完成，随 GB16 重开 |
| GB02 | v0.1.5 Core 保留 `completion_blocked / completion_pending` 派生与默认回归；Codex 实际执行参考仍是旧版，不认识直接 `complete` 路径 | Core 未回归，消费者交付随 GB16 重开 |
| GB03 | 直接调用 v0.1.5 安装产物的 locator 校验器，项目内绝对 `package.json` 返回 `verified` 并规范化为 `project://package.json`；旧 Skill 未说明该格式 | Core 未回归，协议发现性随 GB16 重开 |
| GB04 | 官方 `service status --json` 在最终服务返回 `running / owned=true`；当前进程已是新版 health，无法再次覆盖旧 health 兼容窗口 | 未发现回归；保留异 PID 安全分支 `UNVERIFIED` |
| GB05 | 真实 CGS HTML 含 `cgs-g2a-opportunity-intelligence` 与 `cgs-g2b-editorial-decision`，但 v0.1.5 Desktop CSS 后置规则把 `.tree-copy small` 隐藏 | 已确认回归；`48a2ca6` 已修复并合入 `main`，待新包实操 |
| GB06 | v0.1.5 MCP 保留 `context_resolve_then_retry / requires_bind=false / retry_same_idempotency_key=true`；Codex 实际项目连接参考仍是旧版 | Core 未回归，恢复指引交付随 GB16 重开 |
| GB07 | 修复提交在 v0.1.5，当前完整默认门禁通过，App/Core/服务可运行 | 未发现回归；仍不把 ad-hoc 包提升为 Apple 公证发布 |
| GB08 | v0.1.5 Core 保留过期 Claim/Run 投影与确定恢复测试；当前真实 G2B 已无原冲突顶层状态，但未重新制造一次过期旅程 | 未发现代码回归；产品恢复旅程仍 `UNVERIFIED`，Skill 随 GB16 更新 |
| GB09 | v0.1.5 locator 对 `repo:package.json` 返回 `verified`；真实 G2B 页面已有四条当前有效、可打开且 anchor 已验证的 Markdown Evidence；旧 Codex Skill 仍缺格式说明 | Core 与真实 Evidence 读取通过，消费者指引随 GB16 重开 |
| GB10 | 重新复核发现源码页把 `needs_repair` 的正确 install 路径写成“启用常驻服务”，预览又写成“安装并启动”；现已改成“修复旧配置并重新加载”，computer use 完成整条隔离恢复旅程 | 源码工程与产品实操通过；最终统一安装回归待完成，未知监听者场景仍 `UNVERIFIED` |
| GB11 | 用 90 秒真实 Claim 启动单一 Run；续租前页面显示“还剩 2 分钟”，原 actor 续租后自动刷新为“还剩 30 分钟”，记录页仍只有同一 active Claim/started Run，并新增单一 `claim.renewed` 事件 | 源码闭环通过；最终统一 Skill 与新 Session 消费仍随 GB16 回归 |
| GB12 | 真实 G2B 仍显示“待复核”；完整记录确认剩余条件是 `human_decision`，但历史 self-verifier verdict 为 `inconclusive`。源码隔离实操已走到 `waiting_for_human`；复验同时发现 Inbox 曾把 Runtime pass 误写成“本次用户确认已通过”，现按 obligation role 显示为“Runtime 复核”，并明确不能代替用户验收 | 源码工程与产品实操通过；最终统一安装、真实 CGS 历史接棒和用户本人验收仍待完成 |
| GB13 | 归因仍在 CGS；Molis Work Core 没有对应实现承诺 | 未开始，不属于“已修复”复核集合 |
| GB14 | v0.1.5 安装产物的 MCP schema 已对 8 种 kind 使用条件化 payload，并明确 `part_of / depends_on` 方向 | 未发现包内回归；Arena 新 Session 实操仍 `UNVERIFIED` |
| GB15 | 真实 G2A 的“上下文 → 完成要求”显示“本 Goal 按当前 Contract 已满足，不自动等于父 Goal 完整能力”，并明确历史父 Goal 未记录覆盖 | 防误导文案已在最终 App 可见；新拆树阻断与 CGS Contract 纠偏仍 `UNVERIFIED`，Skill 随 GB16 更新 |

---
