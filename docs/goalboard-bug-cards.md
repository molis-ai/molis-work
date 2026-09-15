# Molis Work Bug 卡台账

更新时间：2026-08-31

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

**当前不一致**：服务进程与 `/health.service_process_id` 同为 12637，页面健康且 home launcher 执行 0.1.9；但官方 service status 为 `needs_repair`，LaunchAgent `PATH` 仍从 `molis-work-0.1.8/runtime` 开始，这正是 GB42 的修复前现场。active Codex Skill `/Users/oreal/.codex/skills/goal-advance` 仍链接 **0.1.7**；官方只读 `/api/settings/runtimes` 也把 Codex 判为 `needs_repair`，而不是未知 conflict，证明后续可以走受管 repair 事务。0.1.9 release 目录内虽然包含 GB33–GB39 的协议/Skill 资产，当前 Codex 新 Session 也不会自动消费它们。当前状态绝不能表述为 App/Core/service/Skill 已统一。

**工程验证**：GB38–GB41 合并态完整 `pnpm typecheck && pnpm test` 为 **331/331**；GB42 增加 Desktop 升级交接回归后，Desktop Rust 为 **12/12**，Web service 状态机为 **23/23**，TypeScript typecheck、Rust format 与 diff check 通过。`cargo clippy --all-targets -D warnings` 仍被本卡范围外两条既有 warning 阻断，未冒充为绿。

**2026-08-30 当前整合门禁**：GB24/GB43 合并进当前工作树后首次完整 `pnpm test` 未通过，准确暴露 2 条整合缺口：Desktop TUI 回归仍把 GB43 已删除的 334px 分栏硬上限当作契约；GB24 新增的焦点兜底文案“待处理决定”缺少英文翻译。两项均归回原 Case，不新增编号：删除重复的旧 CSS 源码断言，由 GB43 的真实浏览器宽度/换行回归承担行为门禁；补齐英文可访问名称。GB44 加入同仓 worktree Evidence 回归后，第一次完整门禁又暴露本机 npm cache 权限与沙箱内 Headless Chrome 启动限制；相关失败脱离限制后均通过。最终改用隔离临时 npm cache 并允许真实 Headless Chrome 后，从头完整 `pnpm test` 为 **335/335、0 fail**；TypeScript typecheck、Desktop Rust 12/12、Rust format 与 `git diff --check` 通过。该证据只支持当前源码整合态，不等于已构建或安装新发布包。

**产品与协议实操**：0.1.9 安装 App 已用真实 Casebook 验证 GB35 的 Web/Desktop 共用标签布局；0.1.9 release asset/隔离项目已验证 GB36–GB39 的 Contract-before-Select、blocked overview、accepted successor 恢复和 proposal 精确整份确认。GB33/GB34 的实现可从 0.1.9 release asset 读回，但 active Codex Skill 仍是 0.1.7，真实新 Session 消费未通过。GB24 先在当前安装 App 的真实 CGS / G4A 复现旧问题，随后在 4175 源码服务的真实 CGS 数据副本中用 Safari 通过普通 Web 与 `?desktop=1` 桌面壳深链实操：目标 Inbox 项、对话验收原话、Evidence、理由和一次提交表单均直接进入视区且获得焦点，没有提交或改写 CGS 数据。GB43 已在安装 App 与 4173 Web 双端复现旧问题，并在同一源码服务的真实 CGS 数据上验证标题完整换行、分栏 334→520 和桌面壳一致性。GB44 已对来源真实 worktree 文件完成只读验证，并用临时真实 Git worktree 跑通 Coordinator → Evidence → Web 打开及删除后 404 的完整源码旅程。GB24、GB40、GB42、GB43、GB44 都是 0.1.9 构建之后的本地修复，当前 App/Core 不包含。

**剩余边界**：2026-08-30 再按总览逐项审计，GB01–GB44 中没有“已经成立、仍缺 Molis Work 源码实现”的 Case；GB13 正确路由 CGS，GB41 不成立为新 Risk Bug，其余成立项均已达到各卡记录的源码/工程/隔离产品层边界。尚未闭环的是最终交付层：用户已明确暂停新包构建，因此不生成 0.1.10/替代 0.1.9，不修改真实 LaunchAgent，也不擅自改 Runtime 接入。下一份经用户明确发起的包至少需要包含 GB24、GB40、GB42、GB43、GB44 与远端 main；安装后再修复 owned service、经用户确认升级 Codex MCP/Skill、重开 Session，并分别复验 GB24、GB31、GB33、GB34、GB36、GB37、GB38、GB39、GB40、GB41、GB42、GB43、GB44。G4A 的最终真人确认动作和主观易懂性仍由用户验收。

</details>

## 总览

| ID | 标题 | 主要归因 | Bug 确认 | 修复决定 | 修复状态 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| GB-20260828-01 | 当前消息已明确项目仍被重复确认 | Molis Work Skill 授权识别缺陷 | 已确认 | 已修复 | 0.1.7 Skill/Core 已安装并做 fresh MCP 协议验收；真实新 Codex Session 待用户侧观察 | P1 |
| GB-20260828-02 | 已完成执行被 Available 误导为再次执行 | Molis Work 派生状态缺陷 | 已确认 | 已修复 | 293/293 与隔离生命周期实操通过；0.1.7 构建指纹一致，Owner 验收通过 | P1 |
| GB-20260828-03 | 项目内绝对路径被误报为项目范围外 | Molis Work locator 设计缺陷 | 已确认 | 已修复 | 项目内路径/anchor、安全越界与 symlink 边界通过；0.1.7 已安装，Owner 验收通过 | P1 |
| GB-20260828-04 | 同一 LaunchAgent PID 被误报为端口冲突 | Molis Work 服务归属兼容缺陷 | 已确认 | 已修复 | 最终服务 `running/owned=true`，监听与 LaunchAgent PID 同为 11021；Owner 验收通过 | P1 |
| GB-20260828-05 | 对话使用 G2A/G2B，Goal Tree 隐藏对应 ID | Molis Work Desktop CSS 与短引用碰撞缺陷 | 已确认 | 已修复 | 最终安装 App 真实 CGS、286px 窄栏实操通过；唯一短引用与中文标题同时可读 | P1 |
| GB-20260828-06 | 已绑定 Session 的生命周期调用偶发误报未连接 | Molis Work 连接缓存与恢复语义缺陷 | 已确认 | 已修复 | 工程与重试契约通过，0.1.7 已安装；真实新 Codex Session 连续推进待用户侧观察 | P1 |
| GB-20260828-07 | 内嵌 Node 测试把 Homebrew Node 误当成可搬移运行时 | Molis Work 测试夹具可移植性缺陷 | 非产品 Bug、工程缺陷 | 已修复 | 最终嵌入 Runtime、293/293 与打包门禁通过；Owner 验收通过 | P1（发布门禁） |
| GB-20260829-08 | 租约过期后 Contract 同时显示失效与 active/started | Molis Work 租约派生与物化一致性缺陷 | 已确认 | 已修复 | 过期投影、恢复动作与 Web 读取工程/产品实操通过；0.1.7 已安装 | P1 |
| GB-20260829-09 | `repo:` 项目内 Evidence 被降级且没有可修正格式 | Molis Work locator 协议可发现性设计债 | 设计债 | 已修复 | `repo:` 文件与 anchor 验证、规范化和错误建议通过；0.1.7 已安装 | P2 |
| GB-20260829-10 | 升级后的旧服务配置允许 restart 但无法完成修复 | Molis Work 服务恢复动作缺陷 | 已确认 | 已修复 | 隔离 repair 旅程与最终服务健康通过；未知第三方监听安全分支保留为 `UNVERIFIED` | P1 |
| GB-20260829-11 | 活跃长任务无续租入口，执行中静默过期 | Molis Work 租约续期与可见性设计缺陷 | 已确认 | 已修复 | 同 Claim/Run 续租、提示和事件实操通过；0.1.7 已安装 | P1 |
| GB-20260829-12 | Runtime 反复领取只剩人工判断的复核 | Molis Work Review 条件路由与人工等待状态缺陷 | 已确认 | 已修复 | 最终安装 App 真实 G4A 显示 waiting-for-human，Runtime 不再重复领取；用户本人验收仍 pending | P1 |
| GB-20260829-13 | Opportunity 有引用但看不到研究过程与样本漏斗 | CGS 领域模型与编辑台设计债 | 设计债、接入问题 | 不在 Molis Work 修复 | 真实问题成立；Molis Work 侧结案并路由 CGS，CGS 修复未开始 | P1（CGS） |
| GB-20260829-14 | Goal Tree 提案 payload 需要查源码才能构造 | Molis Work MCP 契约自描述缺陷 | 已确认 | 已修复 | 最终安装 MCP 判别 schema、字段路径与方向说明通过；Owner 协议验收通过 | P1 |
| GB-20260829-15 | 子 Goal 用样本验收却被理解成父级能力已经具备 | Molis Work 跨层 Contract 覆盖设计债 + CGS 建模错误 | 设计债、接入问题 | Molis Work 部分已修复 | 父级不再被样本子 Goal 自动完成并显式显示覆盖缺口；CGS Contract 语义纠偏仍属 CGS | P1 |
| GB-20260829-16 | App、Core 与 Codex Skill 实际版本不一致 | 发布与 Runtime 接入验收缺陷 | 已确认 | 已修复并安装 | App/Core/home launcher/LaunchAgent PATH/Codex Skill 全部对齐 0.1.10；服务 running/owned，Runtime connected | P1 |
| GB-20260829-17 | 大型 Goal Tree 变更只有技术 diff，缺少问题与效果解释 | Molis Work Proposal 可理解性设计债 | 设计债 | 已修复 | 结构化语义摘要、逐项影响与代表性 computer-use 实操通过；0.1.7 已安装 | P2 |
| GB-20260829-18 | 整份 Goal Tree 确认会在决定阶段部分落地 | Molis Work Proposal 原子性与预检一致性缺陷 | 已确认 | 已修复 | check/decide 同源预检、whole-confirm 零部分写入与恢复契约通过；Owner 验收通过 | P1 |
| GB-20260830-19 | 桌面健康恢复与 LaunchAgent 修复互相抢占 4173 | Molis Work Desktop 恢复策略缺陷 | 已确认 | 已修复 | 源码 App 恢复旅程与最终受管服务重启/健康通过；Owner 验收通过 | P1 |
| GB-20260830-20 | Planning Methods 全量正文返回被截断 | Molis Work MCP 读取契约与规模设计缺陷 | 已确认 | 已修复 | 轻量目录、按 method_ids 正文读取与分页工程/协议验收通过；0.1.7 已安装 | P1 |
| GB-20260830-21 | 大型项目内 Evidence 因不可全文打开而无法登记 | Molis Work Evidence 预检与登记耦合缺陷 | 已确认 | 已修复 | 大文件 locator+digest 登记、preview_unavailable 与修复建议通过；0.1.7 已安装 | P1 |
| GB-20260830-22 | Legacy Proposal 可统一读取但 read/check/decide handle 不可组合 | Molis Work 兼容视图与提案 API 不可组合 | 已确认 | 已修复 | Rewire/Contract raw 与 synthetic handle 的 read/check/decide 组合回归通过；0.1.7 已安装 | P0（解除 Arena 阻塞） |
| GB-20260830-23 | Available 默认展开全部 Contract 导致输出截断 | Molis Work MCP 默认读取粒度缺陷 | 已确认 | 已修复 | 最终安装 MCP schema 确认 summary 默认，full 显式展开；Owner 协议验收通过 | P1 |
| GB-20260830-24 | 对话已完成人工验收，Inbox 仍要求重复填写且深链找不到表单 | Molis Work 人工验收交接与 Decision 深链缺陷 | 已确认 | 已修复并安装 | 0.1.10 真实 CGS/G4A 深链自动展开并预填结论、原话、来源、Evidence 与理由；未替用户提交 | P0 |
| GB-20260830-25 | 范围纠偏后历史 Run blocker 仍像当前有效阻塞 | Molis Work 当前阻塞派生与历史展示缺陷 | 已确认 | 已修复 | blocker supersession/历史降级与当前真相展示工程、computer-use 实操通过 | P1 |
| GB-20260830-26 | 大型 Proposal 预检漏掉不可变与唯一约束，决定后才部分失败 | Molis Work Proposal 唯一约束与恢复诊断缺陷；原子性部分与 GB18 去重 | 已确认部分成立 | 已修复 | accepted/unique/原始数据库错误转换、replacement 指引和零写入恢复通过 | P1 |
| GB-20260830-27 | 新反证出现后，完成门禁中的 unmet Goal 无法返回 executor 返工 | Molis Work 生命周期恢复提示缺陷；原 claim-gate 归因不成立 | 已确认（修正归因） | 已修复 | 最终安装 Core 对真实 G2D 返回 rework_request 恢复；未修改 CGS 数据 | P0 |
| GB-20260830-28 | Compaction 后续租只有 claim_id，无法从 context 得到正确 actor | Molis Work 租约恢复错误契约设计债 | 已确认 | 已修复 | context/错误返回 owner 与 remediation，真实 MCP 恢复实操通过；0.1.7 已安装 | P2 |
| GB-20260830-29 | Draft 每轮写入与恢复都返回完整历史，长对话输出被截断 | Molis Work clarification 默认响应粒度缺陷 | 已确认 | 已修复 | 默认增量响应、显式 history 分页与 12 轮 MCP 实操通过；0.1.7 已安装 | P1 |
| GB-20260830-30 | Contract Proposal 缺字段时抛出 undefined.trim 裸异常 | Molis Work Contract schema 与运行时输入校验缺陷 | 已确认 | 已修复 | 完整 schema、字段路径、失败零写入与 Arena 成功恢复证据通过；0.1.7 已安装 | P0（解除 Arena 阻塞） |
| GB-20260830-31 | replacement Goal 已生效，旧 Goal 仍进入 Ready | Goal replacement 生命周期与 Ready 过滤缺陷 | 已确认 | 已修复并安装 | 0.1.10 对真实 CGS 返回旧 G2G `replaced`、replacement_goal_id=V2，且不在 Available | P0 |
| GB-20260830-32 | leaf_readiness 非法枚举被误报为“没写判断”，无 clarification Run 也缺恢复动作 | Goal Tree 输入校验与恢复提示缺陷 | 已确认 | 已修复 | 最终安装 MCP schema 显示 `keep | split`，精确错误与 resume hint 回归通过 | P1 |
| GB-20260830-33 | 单轮 Run 收口后只汇报过去，不交代或继续下一轮 | Molis Work Skill + MCP handoff 可发现性设计债，消费者遗漏为直接触发 | 已确认（修正归因） | 已修复并安装 | 0.1.10 active Skill 明确 release 后刷新 Available、汇报下一 Goal/动作/why-now 并在授权内继续；新 Session 自然语言表现待用户观察 | P1 |
| GB-20260830-34 | 跨仓库 Goal 的本地 Evidence 无法诚实落档 | Evidence locator 分类与恢复契约缺陷；多 workspace 验证属延后能力 | 已确认 | 已修复并安装 | 0.1.10 安装 Core 实操：外部 `file:`+digest 原样登记 UNVERIFIED、不读盘，并返回 verified 恢复建议 | P2 |
| GB-20260830-35 | 依赖视图窄窗口顶部工作区标签文字互相重叠 | Web/Desktop 共用布局缺陷 | 已确认 | 已修复并安装 | 0.1.10 真实 CGS 多个长工作标签保持可读并滚动，不再互相覆盖 | P1 |
| GB-20260830-36 | Available 候选未提示请求产物与 Goal out_of_scope 冲突 | 消费顺序与范围可发现性设计债 | 已确认（修正归因） | 已修复并安装 | 0.1.10 active Skill 要求 Available → 完整 Contract scope check → Select；out_of_scope 不再靠误领发现 | P1 |
| GB-20260830-37 | 依赖阻塞的 accepted leaf 从 Available 完全消失 | Available 受阻入口可发现性缺陷 | 已确认 | 已修复并安装 | 0.1.9 隔离协议实操显示 `blocked_overview`、依赖链和 Explain 恢复动作 | P1 |
| GB-20260830-38 | accepted Goal 局部纠偏只返回抽象 successor 指令 | 错误归类与 successor 恢复信息缺陷；不可变设计本身成立 | 已确认（部分成立） | 已修复并安装 | 0.1.9 隔离实操通过 leaf 文案、successor 骨架、逐关系迁移候选与零 canonical 写入 | P1 |
| GB-20260830-39 | 精确整份 Proposal 已获确认仍因 Board 其他待审项被拒绝 | whole-confirmation 授权绑定缺陷 | 已确认 | 已修复并安装 | 0.1.9 隔离实操一次确认只应用目标 Proposal，无关 Proposal 保持 pending | P1 |
| GB-20260830-40 | executor Run completed 后 Review 隐藏且“执行收尾”不说明要 release | Run→Review 交接动作可发现性缺陷；列表隐藏部分与 GB37 去重 | 已确认（部分新增） | 已修复并安装 | 0.1.10 安装 Core 实操：Run/Contract/Available 返回精确 release handoff；release 后 self_verifier 可见 | P1 |
| GB-20260830-41 | V2 KOL 子 Goal 被 completion-only Risk 挡出 executor Available | 旧 Session、真实依赖与相关 Risk 呈现被混读 | 非新 Bug（已完成真实 reason 复验） | 不新增修复 | 0.1.10 真实 CGS：G2E 在 completion Risk 下可执行；V2 子 Goal 实际被 schema 依赖阻塞；旧 Goal 另归 GB31 | 去重 |
| GB-20260830-42 | App/Core 升级后健康服务仍携旧 release PATH 并显示 needs_repair | Desktop 升级后的服务交接缺陷 | 已确认 | 已修复并安装 | 0.1.10 LaunchAgent PATH、launcher 与 Core 对齐；service running/owned，LaunchAgent/监听/health PID=72472 | P1 |
| GB-20260830-43 | 窄栏 Goal Tree 标题全部省略且分栏无法继续拉宽 | Goal Tree 响应式可读性与分栏约束缺陷 | 已确认 | 已修复并安装 | 0.1.10 真实 CGS App 分栏 300→520；长中文标题完整换行、短编号和状态同时可读 | P1 |
| GB-20260830-44 | 同仓库隔离 Git worktree 的真实文件无法成为 verified Evidence | Evidence workspace 与 Git worktree 身份连续性缺口 | 已确认 | 已修复并安装 | 0.1.10 安装 Core 实操：registered worktree 未提交文件 verified、记录实际根并可读取；跨仓边界保留 | P1 |
| GB-20260830-45 | Native Proposal 无法 supersede 可统一读取/决定的 Legacy Contract Proposal | Goal Tree legacy handle 可组合性与恢复契约缺陷 | 已确认 | 已修复并安装 | 338/338；0.1.10 安装 Core raw/synthetic 两条旅程均为旧 superseded、新 pending、canonical Draft 未提前改写 | P1 |
| GB-20260831-46 | Native Proposal 无法把 Legacy Contract Proposal 作为 `supersedes_proposal_id` | GB45 的独立消费复现；Arena 旧 Session 未消费已安装修复 | 体验现象成立，非新 Bug | 与 GB45 去重，不重复改码 | 当前源码 1/1；0.1.10 安装 Core raw/synthetic 2/2 通过；Arena 需新 Session 加载 | P1 |
| GB-20260831-47 | 对话中已明确人工确认，仍必须到 Inbox 重复表达 | Molis Work Core/Skill 未连接明确对话确认与 GB24 安全预填入口 | 已确认（修正方案） | 已修复源码；不授予 Runtime 人类审批权 | 唯一待决 exact-quote handoff、多个待决失败关闭与 Inbox 预填工程/源码产品旅程通过；已进入 0.1.11 发布候选，真实新 Session 待用户观察 | P0 |
| GB-20260831-48 | Goal Tree 变更落地后不主动召回受影响祖先、消费者与相邻依赖 | Goal Tree materialization 后缺少默认语义复核 handoff | 已确认 | 已修复源码；不自动改树 | 结构应用与 semantic review 分离，影响子图和后续动作写入决定/事件；CGS G3 代表性回归通过，已进入 0.1.11 发布候选 | P1 |
| GB-20260831-49 | 用户确认双轨主线，但 Goal Tree 将九个结果平铺为一级 Goal | 待核实：战略分组语义未进入规划方法与 Proposal preflight | 分析中 | 成立即做最小防遗漏修复；不自动造文件夹 Goal | 已登记；正在核对 decomposition 方法、narrative/review 与 Web 表达边界 | P1 |
| GB-20260831-50 | Skill 允许跨仓 `file:///` 登记 UNVERIFIED，但当前 Runtime 仍拒绝 | 待核实：GB34 修复未被当前 Session 消费或安装/运行态不一致 | 分析中 | 按用户要求只分析，暂不修复 | 已登记；待核对 Session 加载版本、安装 Core 与 locator 分支 | P1 |

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

## GB-20260828-01：当前消息已明确项目仍被重复确认

**来源**：CGS 新 Session 消费者反馈 1
**Bug 确认**：已确认，属于 Molis Work Skill 的当前消息授权识别缺陷
**修复决定**：用户已批准
**修复状态**：2026-08-30 最终收口：0.1.7 App/Core/服务/Skill 已统一安装，fresh MCP 协议和 Skill 资产验证通过；Owner 对修复实现与安装交付验收通过。当前 Session 不会热加载，新 Codex Session 的真实自然语言绑定旅程仍标为 `UNVERIFIED`，不冒充产品实操。

**2026-08-30 复验进展**：已用 computer use 在当前 `/Applications/Molis Work.app` 打开“全局设置 → AI 与执行工具”。Codex 卡片显示“检测到旧版或不完整的 Molis Work 接入 · 需要修复”，Runtime 为“未找到可执行文件”，Skill 路径为 `/Users/oreal/.codex/skills/goal-advance`；当前 Session 的 MCP 工具说明虽已包含“当前消息明确命名且唯一匹配时直接 bind”的新规则，但这不能证明一个真实新 Session 会加载并执行同版 Skill。截图：`docs/qa/bug-revalidation/2026-08-30/gb01-current-runtime-incomplete.jpeg`。因此本卡当前只能判定源码工程层存在修复，产品验收失败；需统一安装后创建真实新 Session，分别复测明确唯一匹配、多候选、切换项目和未命名请求。

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

当前 Session 已绑定 `Content Growth Studio`，canonical workspace 是 `/Users/oreal/adeptify-home/repos/Content Growth Studio`。消费者提交这个目录内真实存在的 JSON 和 Markdown 绝对路径作为 Evidence locator，却收到“不能指向项目范围外的本地文件”，无法登记 verified local Evidence。

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

最初复核 v0.1.5 时，GitHub Release、用户级 App、`~/.molis-work` Core 与常驻 Web service 都曾更新，台账因此把多张 Runtime 消费体验卡写成“已安装”。但真实 Codex 使用的 `/Users/oreal/.codex/skills/goal-advance` 仍是一个指向 `molis-work-0.1.1` 的受管符号链接。2026-08-30 再次只读复核还发现：Core launcher、owned LaunchAgent 和 4173 服务已经指向 0.1.6，`/Applications/Molis Work.app` 的 bundle 却是 0.1.3。当前不是单一 Skill 落后，而是 App、Core/service 与 Skill 三层版本分裂。

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

只修改 Goal Tree Proposal 的 normalize、baseline、check 和 decide：关系条目自动补齐端点 affected objects；新 baseline 写入带版本前缀的语义 hash，旧无前缀 baseline 继续按旧方式比较；check 在数据库 savepoint 内调用现有 materializer，逐条回滚预检写入；whole confirmation 遇到任何冲突抛出结构化 `goal_tree_proposal.whole_confirmation_conflict`，由外层 immediate transaction 回滚所有已模拟或已物化条目。保留显式逐项 decisions 的 `partially_applied` 语义，不修改 accepted Contract 不可变规则，不自动删除两次真实事故已落地的数据。回滚无需 schema migration。

### 10. 验收边界

- **工程验证**：通过。新增回归证明 check 能在决定前发现 accepted Contract 的 materialization conflict；跳过 check 的整份确认会抛出结构化冲突，安全 Goal、item decision 与 Proposal state 全部保持未写入；新语义 baseline 忽略 `fulfillment_state / updated_at`，但 Contract 标题变化仍只冲突 Contract item；relation 自动记录两端 Goal，且根标题变化不会误伤关系；已部分落地的旧 Proposal 不能再次伪装成整份原子确认。原有显式逐项部分落地测试保持通过，TypeScript 构建、typecheck、`git diff --check` 与全仓 278/278 通过。首次沙箱运行因测试临时 SQLite 与 `~/.npm` 日志无写权限出现 21 个环境失败，已在正常权限下完整重跑归零；没有把环境失败计作通过。
- **产品实操**：源码构建下通过代表性主路径。用同一真实 Web 决定页同时放入合法 18 项 Proposal 与含 accepted Contract 冲突的 Proposal：合法方案填写理由并点击一次“采用整份方案”后，18/18 item、9 个子 Goal 与 9 条 `part_of` 同时落地。2026-08-30 又以 computer use 独立打开两项代表性冲突方案：展开后可直接看到“这份方案暂时不能采用”、原 invariant、successor / replacement 恢复建议和“当前 Goal Tree 尚未改变”，整份采用按钮为 disabled；全程未点击确认或退回。停止 fixture 后只读数据库，`safe-child` 数为 0、accepted parent 标题未变、两条 item 分别保持 pending/conflict、decision 数为 0。截图见 [预检摘要](/Users/oreal/adeptify-home/repos/molis-work/docs/qa/bug-revalidation/2026-08-30/gb18-preflight-summary.jpeg) 与 [展开后的阻断说明](/Users/oreal/adeptify-home/repos/molis-work/docs/qa/bug-revalidation/2026-08-30/gb18-preflight-blocked.jpeg)。真实 CGS / Arena 历史 `partially_applied` 数据不在本卡自动补偿范围，最终安装 App / 新 Session 仍为 `UNVERIFIED`。
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
- **产品实操**：源码构建 App 已通过原始失败路径。先加载真实旧受管 LaunchAgent，再保持修正版 App 打开执行官方 `service install --confirm`；修复在约 6.6 秒完成，LaunchAgent PID、4173 监听 PID 与 `/health` PID 均为 26281，App 没有生成竞争子进程。随后停止受管服务，App 经过扩大后的宽限才启动自有 fallback；定点终止该子进程 26444 后，新子进程 26623 由同一 App 重新启动并恢复健康。2026-08-30 又保持同一源码 App 窗口打开，执行官方 `service restart --confirm --json`，约 2.6 秒返回 restarted；computer use 读回原设置页面仍完整可见，随后 `lsof`、LaunchAgent 与 `/health` 三方 PID 均为 67795，未出现 competing fallback 或 conflict。截图见 [受管服务重启后 App 页面](/Users/oreal/adeptify-home/repos/molis-work/docs/qa/bug-revalidation/2026-08-30/gb19-managed-restart.jpeg)。验收后已通过 App 自身退出并确认 LaunchAgent 仍健康。以上证明源码构建产物通过，不等于正式 Release 已安装。
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
- **产品实操**：通过源码代表性真实路径。实际读取 CGS `/Users/oreal/adeptify-home/repos/Content Growth Studio/data/research/g2d-research-runs.json`，文件为 1,685,981 字节，SHA-256 为 `b9bea3bfd0beebf0466841d6aa3f8cb48d5023e3d37feeb99ae70c062855eb0e`；只在临时 Molis Work 库中以原 `project://data/research/g2d-research-runs.json` 和 digest 提交，CGS 文件未修改。computer use 打开记录页后可见“当前有效 / UNVERIFIED”、真实大小、512 KiB 上限、“内容未全文预检”“digest 未核验”和 sidecar 建议；locator 是“复制引用”按钮而非打开链接。带 Evidence 打开返回 409，直接打开返回 413。截图见 [真实 CGS 大文件 Evidence](/Users/oreal/adeptify-home/repos/molis-work/docs/qa/bug-revalidation/2026-08-30/gb21-large-evidence-unverified.jpeg)。最终安装后的真实 Runtime submit 仍为 `UNVERIFIED`。
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
- **产品实操**：通过源码真实路径。使用实际 `/Users/oreal/adeptify-home/repos/molis-work-casebook/README.md` 和 SHA-256 `4f8194b4e27027ec866fdc65a028b40601f7a5390df3a279251e39c3d1096134`，在临时 Molis Work 数据库、当前 workspace=`molis-work` 下提交：`file:///.../molis-work-casebook/README.md` 一次创建为 UNVERIFIED，locator 与 digest 原样保留、`locator_workspace_id=null`；同轮 `molis-work/README.md` 规范化成 `project://README.md` 并 verified，跨仓裸绝对路径继续返回 `evidence.locator_outside_project`。随后 computer use 打开“记录 → 执行与检查”，页面可见完整 locator、UNVERIFIED、digest、未读取/未核验和升级说明；该 locator 是“复制引用”按钮，不是链接，也没有项目引用打开入口。临时数据和服务已清理，Casebook 仓库未修改。
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

Molis Work 当前 Session 绑定项目“Molis Work 内部 Casebook”，canonical workspace 为 `/Users/oreal/adeptify-home/repos/molis-work`。为保护该目录已有脏工作树，执行者把同一 Git 仓库的实现放在隔离 worktree `/private/tmp/molis-work-casebook-authorized-export`，并尝试把其中真实测试文件 `tests/casebook-planning-export.test.ts` 登记为 Evidence。绝对 locator 被准确拒绝为“当前项目范围外”；执行者只能改用 `artifact://`，记录被降级为 UNVERIFIED。

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

## 2026-08-30 第三方观历史复审（GB01–GB42）

本节保留已经完成的 GB01–GB42 历史复审，不因收到 GB43 而从第一张重跑。判断标准只有四项：是否有可复现事实；是否增加了无必要操作、歧义或错误状态；是否影响正确性、闭环或审计；最小修复是否保留了原设计要保护的边界。GB43 及后续 Case 在各自卡片内独立完成同等标准的成立性复审。

| Case | 客观成立性 | 体验/效果证据 | 最终处理判断 |
| --- | --- | --- | --- |
| GB01 | 成立，Skill 没有消费当前消息中的明确项目选择 | 同一句话被迫做同义二次确认，阻断所有后续读取 | 修；只复用本轮明确授权，不继承旧 Session、不做模糊绑定 |
| GB02 | 成立，执行结束与完成门禁被压回 `execution_pending` | 诱导重复 Claim/Run/Evidence，并阻止自然进入下一 Goal | 修；增加派生完成阶段，不增加第二套持久状态 |
| GB03 | 成立，绝对路径支持缺失且错误归因成项目外 | 真实项目文件无法登记，使用者会错误排查 workspace 污染 | 修；规范化项目内路径，继续拒绝越界与 symlink 逃逸 |
| GB04 | 成立，服务 ownership 对同 PID 得出 false conflict | 正常打开被中断，可能诱导不必要重启或接管 | 修；使用受管 PID 证明归属，未知监听者仍保守拒绝 |
| GB05 | 成立，且首修只显示 ID 后仍有同码碰撞 | 用户无法把 G2A/G2B/G2G 口头引用对应到树节点；碰撞后仍会选错 | 修；显示最短唯一稳定引用，同时保留中文标题与完整 ID |
| GB06 | 成立，连接缓存与 resolve 看见不同真相 | 连续推进出现无意义失败，消费者可能再次打扰用户确认 | 修；刷新并给同幂等键安全重试，不自动 rebind |
| GB07 | 成立为工程缺陷，不是产品交互 Bug | 测试夹具误报会阻断正确发布或让坏包漏过 | 修发布门禁；不把它包装成用户功能改善 |
| GB08 | 成立，顶层投影与历史实体状态矛盾 | 长任务过期后不知道终结旧 Run 还是重新领取，产生孤儿记录风险 | 修规范化投影与确定恢复；保留原始审计历史 |
| GB09 | 成立为协议可发现性设计债 | 有效仓库 Evidence 被降级且只能靠试错猜 locator | 修规范格式、anchor 校验与可操作错误；不验证外部不透明内容 |
| GB10 | 成立，restart 和 repair 的动作语义混淆 | 用户按提示操作仍无法恢复旧配置 | 修最小 repair 路径；未知进程 ownership 不放宽 |
| GB11 | 成立，租约机制缺少运行中续租入口与提醒 | 认真 review 的长任务反而丢失 Run 连续性 | 修同 Claim/Run 续租与可见倒计时；不改无限租约 |
| GB12 | 成立，human criterion 仍被普通 self-verifier 路由 | Runtime 会反复领取—`inconclusive`—释放，用户看不出只剩本人 | 修 `waiting_for_human` 与主体标签；不让 Runtime 冒充用户 |
| GB13 | 问题成立，但不是 Molis Work 缺陷 | CGS 编辑台无法解释搜索覆盖、漏斗和 provenance，确实会高估研究强度 | Molis Work 不修；路由 CGS。不能因本轮 0.1.7 发布声称该体验已改善 |
| GB14 | 成立，MCP payload 契约不自描述 | Agent 必须读源码才能安全构造 Goal Tree，方向错误会写坏语义 | 修判别 schema、最小示例、方向与字段路径；不引入额外 DSL |
| GB15 | 混合成立：Molis Work 有跨层覆盖表达缺口，CGS 有 Contract 降级 | 形式样本通过被误解成父级真实能力完成，直接影响用户决策 | 修 Molis Work 防误导与父级覆盖门禁；CGS 业务合同仍由 CGS 负责 |
| GB16 | 成立，发布验收只看版本字符串而没有消费层一致性 | App/Core/service/Skill 混版会让“已修复”在真实 Session 中不存在 | 修统一指纹、安装和 health 验收；旧 Session 不热加载是保留边界 |
| GB17 | 成立为 Proposal 可理解性设计债 | 大型变更越完整越难审批，用户无法建立问题—修改—效果链 | 修正式语义摘要与逐项说明；不生成冗长外部报告替代结构字段 |
| GB18 | 成立，check 与 decide 不同源且 whole confirm 非原子 | 用户确认一份语义变化却得到半棵树，canonical 进入不一致状态 | 修同源 dry-run 与 whole-confirm 零部分写入；保留显式拆分能力 |
| GB19 | 成立，Desktop 与 LaunchAgent 同时尝试恢复 4173 | 健康服务被误抢占，导致冲突或白屏 | 修 ownership-aware 恢复顺序；不让 App 无条件接管端口 |
| GB20 | 成立，规划方法读取没有目录/正文分层 | 输出截断会让消费者误以为已完整读完方法契约 | 修轻量目录、按 ID 和分页；保留全量兼容入口 |
| GB21 | 成立，Evidence 登记与全文预览被错误耦合 | 大型 ledger/日志无法留下 locator，逼迫重复摘要并产生漂移 | 修 locator+digest 有限验证与 preview 状态；不把存在性冒充内容已核验 |
| GB22 | 成立，legacy read 返回的 handle 不能用于 check/decide | 用户已经确认仍需重建提案，形成 native/legacy 双真相 | 修 raw/synthetic alias 与 supersession；不重复应用已生效关系 |
| GB23 | 成立，Available 默认返回选择阶段不需要的完整 Contract | 12k token 截断反而让优先级、阻塞和并行建议不完整 | 修 summary 默认、full 显式；不删 Contract 读取能力 |
| GB24 | 成立，重复录入与深链折叠是同一真人验收旅程的摩擦 | 用户已在对话明确判断，却在 UI 找不到入口并被要求重写同样信息 | 修自动展开/定位/安全预填/一次确认；最终写入仍由用户点击 |
| GB25 | 成立，历史 Run blocker 缺少被后续范围决定取代的表达 | 用户会把已失效原因误认为当前阻塞，继续做已明确延后的工作 | 修 correction/supersession 展示；不删除或改写历史原文 |
| GB26 | 部分与 GB18 重复，唯一约束与恢复错误为独立真缺陷 | 原始 SQLite 错误、技术 ID 试错和重复真人确认直接阻塞恢复 | 去重原子性后修唯一性 preflight、领域错误与机械恢复授权 |
| GB27 | 原始“completion Risk 阻止初次执行”归因不成立；恢复提示缺失成立 | 真实 G2D 已完成旧执行，正确动作是带新反证 rework；旧提示只给 Risk 会误导 | 修正归因后修 rework 提示与状态机；不放宽 completion Risk 或创建重复 Goal |
| GB28 | 成立，续租恢复契约隐藏 actor | compaction 后必须故意失败再 explain 才能续租，增加错误分支 | 修直接返回 owner/remediation；不允许非 owner 接管 |
| GB29 | 成立，写响应随全部历史线性增长 | 11–12 轮即被截断，最新写入状态反而可能看不到 | 修增量默认与历史分页；不摘要或丢弃用户原话 |
| GB30 | 成立，schema 与运行时 shape guard 缺失 | `undefined.trim` 无法定位字段并阻断 Arena 正式 Goal | 修完整 schema、精确 path 与零写入；不替 Agent 自动补业务合同 |
| GB31 | 成立，Ready 没有消费 canonical `replaces` | 官方队列会引导执行过期、与现行授权相反的 Contract | 修统一派生 replaced 并禁止领取；保留旧 Goal 历史与可逆关系 |
| GB32 | 成立；schema 部分与 GB14 去重，错误归因和恢复提示独立成立 | 合法文案因非法 enum 被误报“没写清”，消费者只能查源码 | 修精确枚举错误与 resume hint；不新增未经需要的 `defer` 状态 |
| GB33 | 成立为 Skill + MCP handoff 可发现性设计债，消费者遗漏是直接触发 | 单轮 Run 收口被误当成对话终点，用户必须追问“然后呢”才能知道下一步 | 修 release 的只读 Available handoff 与固定 cycle checkpoint；不自动派发、不越授权 |
| GB34 | 成立为 locator 分类与恢复契约缺陷，不是跨仓读取权限缺失 | 同一外部本地位置换成自造 scheme 可登记，标准 `file:` 却被误当越界读取拒绝，迫使试错或虚构远端 URL | 修 `file:` 仅登记为 UNVERIFIED 并清楚说明边界；不读取第二仓、不自动信任历史 workspace 关联 |
| GB35 | 成立，Web/Desktop 共用标签轨道在窄宽度没有正确建立可滚动布局 | 真实 Casebook 依赖视图中多个标签文字互相覆盖，直接破坏当前工作区辨识 | 修共用 CSS 的最小宽度、收缩与横向滚动；不拆两套视觉 |
| GB36 | 成立为消费者协议顺序缺口，不是 Available 应理解任意自然语言 | Runtime 先领取后才从完整 Contract 发现 out_of_scope，只能 abandoned 并污染 Run 历史 | 修 Skill 强制 Available 暂选→Contract scope 核对→Select；不把请求语义匹配塞进 Core |
| GB37 | 成立，普通依赖/Review 阻塞项从 Available 完全消失 | 已有明确 owner 的 Goal 看起来不存在，消费者会误领相邻 Goal 或把工作移到账本外 | 修紧凑 `blocked_overview` 与 explain 路由；不把全部 Contract 重新塞回 Available |
| GB38 | 部分成立；accepted Contract 不可变合理，leaf 错误归类和抽象迁移提示不合理 | 小纠偏被迫查图、猜关系与技术 ID，漏迁移会形成双真相 | 保留不可变性；修准确错误与 successor/关系迁移候选，不自动迁移 |
| GB39 | 成立，Board 全局 pending 数被错误当成当前上一问的唯一性证明 | 无关 Proposal 会让精确点名的整份确认失败，消费者只能机械展开逐项决定 | 修 attestation 精确绑定 proposal_id；不解析自然语言、不扩大授权 |
| GB40 | 部分新增成立；自动 release 不合理，Review 隐藏已由 GB37 覆盖，精确交接缺失独立成立 | 每轮执行完成后都可能停在“收尾后”，Runtime 必须盲搜 release，Skill 顺序还与状态机相反 | 保留显式 release；统一 Run/Contract/Available/Skill handoff，不允许 reviewer 与 executor 并发 |
| GB41 | 当前阻塞现象存在，但“completion Risk 挡首次执行”的新 Bug 归因不成立 | 旧 Session 与真实 depends_on 门禁混在同一 Contract 中，消费者会把相关 Risk 误认成 blocker | 不新增代码；已安装 0.1.9 隔离实操证明 completion Risk 可执行，转入 GB16/GB27/GB31 的新 Session 验收 |
| GB42 | 成立，status 正确识别旧 plist，但 Desktop 升级后错误调用被协议拒绝的 restart 并吞错 | App/Core/Web 已升级且健康，LaunchAgent 仍携旧 release PATH，官方状态持续要求 repair | 修 Desktop 升级交接为现有原子 `service install`；不放宽状态检查、不接管未知服务 |

### 复审结论

- 42 张卡中，38 张包含需要 Molis Work 修复的真实产品/API/工程问题；GB15、GB26、GB38 和 GB40 是部分重叠或原始方案部分不成立，GB41 是旧 Session/真实依赖被误归因为新 Risk Bug，均已按最小独立缺口去重；GB07 与 GB42 是发布/升级工程缺陷而非业务功能 Bug。
- GB13 的体验问题真实成立，但唯一主要归因在 CGS 领域模型与编辑台；Molis Work 的正确决定是明确不修并保留路由状态，而不是为了“全部修完”制造跨仓耦合。
- GB27 是本轮最重要的客观纠偏：原始 claim-gate 解释不符合真实 canonical 历史，最终只修可复现的 rework 恢复缺口，证明台账不是把每条消费者抱怨自动认定为原始描述中的 Bug。
- GB38 与 GB40 延续同一判断纪律：前者拒绝为了省事放开 accepted Contract 原地覆盖，后者拒绝 completed 后自动释放 Claim；只修两条安全设计周围可复现的错误归类、隐藏动作和恢复信息。
- 当前最小方案没有删除用户确认、项目绑定、租约 ownership、completion Risk、accepted Contract 不变量或历史审计；修复集中在消除重复操作、错误派生、不可发现协议、非原子写入和双真相。
- 工程与 Owner 验收不能代替用户本人验收。已有安装产物已完成可安全执行的 computer-use 主路径，但当前 0.1.9 的 LaunchAgent 与 active Codex Skill 仍未统一，GB40/GB42 也尚未入包；真人按钮、主观易懂性、新 Codex Session 行为和 Apple 公证继续按各卡标为 `UNVERIFIED` 或 pending。
