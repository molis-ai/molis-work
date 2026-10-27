# 规格书怎么放

根目录只放三样：**在做的** spec、**现行规范**、[统一待办清单](BACKLOG.md)。其余都在 [`archive/`](archive/)。

## 在做的

- [product-flow-governance](product-flow-governance/spec.md)：全平台产品与架构系统性审查和优化——覆盖全部功能、入口、设置、交互与公共机制，核功能完整性、流程依赖、AI 效果和检查审查；Onboarding 与服务连接为已暴露案例，全平台覆盖与优化验证后才算专项完成。2026-10-27 需求已整理，全面核查与整改未开始；需求维护 Codex，专项执行待分配。

- [plugin-builder-upgrade](plugin-builder-upgrade/spec.md)：插件创作工作台整体升级；首要解决用户至今未跑通的端到端交付与整体体验，平台同时提供手动／个人助理共用的场景组装能力，保留新能力插件的创作，Alchemist 并为完整落地场景；2026-10-27 需求已整理，尚未实现。需求维护 Codex，实现待分配；与三项场景包／Onboarding 需求独立。

- [diff-frame-performance](diff-frame-performance/spec.md)：大型代码变更逐帧高亮性能；负责人 Codex，Work #996 合入后独立修复全量性能失败，执行中。

- [empty-goal-create](empty-goal-create/spec.md)：进入 Goals 且当前列表为空时，自动打开已有的新建弹窗；2026-10-22 实现，待验收。
- [prologue-memory-strategy](prologue-memory-strategy/spec.md)：以记忆更精准、好用、省 token 为目标；App 自定义分类与读写策略矩阵、Prologue 多策略组合、首期质量闭环及 40 项验收。C0/Q0 已独立交付，Prologue C0 与 S1 版本恢复/分类授权已合并；M1 配置采用 PR 的完整回归与产品验收仍待完成。
- [pr-review-remediation](pr-review-remediation/spec.md)：最近三天 PR 复审确认的 P1 安全边界、P2 功能/合同问题、P3 文档与验收、合并门禁；2026-10-20 新立，实现完成，待评审（PR #901；QA-017 本机 Chrome 未跑通，Product subset 待跑）。
- [unified-input-voice](unified-input-voice/spec.md)：统一输入体验与本地语音输入；需求已整理，尚未实现。
- [proactive-assistant](proactive-assistant/spec.md)：主动式助理与场景 Skill；需求已整理，尚未实现。2026-10-18 补充工作记忆初始化、每日例程、前门路由、从一次对话生成 Skill 与跨源搜索规划。
- [work-brief](work-brief/spec.md)：工作简报内容插件；用户已确认纳入，需求已整理，尚未实现。2026-10-18 补充 living page、一页式脉搏、使用回顾与交互式报告页。
- [long-turn-performance](long-turn-performance/spec.md)：长对话单节点样式测量修复；本地及与 #1010 的组合验证完成，待合入 #1017。负责人：Codex。
- [coding-harness-optimization](coding-harness-optimization/spec.md)：Coding 与平台性能；需求已整理，尚未实现。
- [attention-aggregate-performance](attention-aggregate-performance/spec.md)：attention/Home 聚合及同类项目状态查询性能修复；本地实现和隔离对比通过，PR #1073 的 CI 与评审跟进中。负责人：Codex。
- [visual-ui-experience](visual-ui-experience/spec.md)：视觉细节、个人助理信息与 UI 性能；50 项验收与 20 组设计机制。实现中（九十八片，前七十五片已全部合入或正在合入 main），输入框的低频设置与引用（VUX-16 其余、VUX-17）、VUX-33 其余与本人验收未做。负责人：Claude（2026-10-19 起接手实现）。
- [font-and-skin-system](font-and-skin-system/spec.md)：字体、皮肤与语言系统；需求已整理，尚未实现。
- [assistant-service-connections](assistant-service-connections/spec.md)：助理统一服务接入；Codex 实施中，交互切片和连接侧首组回归已完成，37 项整体验收仍未完成；2026-10-18 补充内容层连接器占位符与未支持工具的接入路径（ASC-38–44，未验证）；2026-10-27 补服务连接页面的默认直接连接、技术配置收起及连接后可用要求（ASC-45～50，需求阶段）。
- [subagent-interaction](subagent-interaction/spec.md)：个人助理与 Coding 的子代理固定入口、直接对话和父子动线；明确 Prologue/Molis Work 分工，需求已整理，尚未实现。
- [ai-development-handbook](ai-development-handbook/spec.md)：内部 AI 能力开发手册；context over control、prompt/Skill/context/tool 分工、基础实现与评测方法，手册正文已写入 `docs/platform/PROLOGUE-AI.md` 第二部分（2026-10-16），存量清理清单已做完。2026-10-18 补充技能包渐进披露、从一次过程生成 Skill、评测循环与作者侧校验，正文 2026-10-19 写入（第 13.2、13.5、16.6、16.7 节），一个技能包在两处各用一次那条等技能包实现；用户验收未做（BL-320）。
- [status-ring-system](status-ring-system/spec.md)：统一轻量环刻状态组件、规格板与适用业务场景；本分支已实现，待合入。
- [ai-input-receipts](ai-input-receipts/spec.md)：输入回执与会话排队；SDK S1–S4 已在 Prologue main，Molis 现用的过渡包带 S1–S3，Molis 接入（阶段 1）进行中。
- [prologue-adoption](prologue-adoption/spec.md)：Prologue 完整能力采用——原 1–23 项及存储/预算决定，加 TaskBoard 统一协作与零模型外部等待；P1–P4、A0、A1、A2-1、A2-2、A2-3 已合；采用线 2026-10-20 交接，换包 #887 已合，接续见 spec 开头的「交接（2026-10-20）」与 BL-301～309。
- [context-program](context-program/spec.md)：情境动作完整总纲与分期；W0 原型已实操；W1、W2（浮条取代底栏、Pages 迁移）已在交接分支 #411 里通过工程用例，未验收。接续入口见第 20 节「远端交接」。
- [context-toolbar](context-toolbar/spec.md)：选区/对象浮条、面板槽、能力家族及存量接入；完整需求保留。
- [quick-create](quick-create/spec.md)：推荐创建、一句话新建、追加/批量与工作流；完整需求保留。
- [side-shelf](side-shelf/spec.md)：右栏、Shelf、落点、拖放与助理接入；完整需求保留。
- [issue-home-v0](issue-home-v0/spec.md)：个人 Home 的 Issue 插件；补齐 Home Runtime 与插件 SQLite 服务，接通页面、助理和 MCP。
- [repository-anti-corruption](repository-anti-corruption/spec.md)：系统性代码与架构防腐整理（防腐收尾第二步）。
- [repository-cleanup](repository-cleanup/spec.md)：Work 与 Prologue 存量代码一次性清理，负责人 Codex；本地清理完成，Prologue 已由用户合入，Work #996 已合入 main（已实现）。覆盖全部包/模块；基线失败、环境跳过和具体保留依据见同目录 inventory。
- [coding-quality-assurance](coding-quality-assurance/spec.md)：Coding 质量保证（已定方向，防腐收尾后做）。2026-10-18 补充多代理 PR 评审、置信分、安全评审、真人批准门、有界迭代与对抗验证。
- [risk-plugin](risk-plugin/spec.md)：专门记录风险的插件（风险已移出 Goals）。
- [plugin-tab-groups](plugin-tab-groups/spec.md)：插件标签与按插件着色的标签组，取代「插件默认页不占标签」；实现中。
- [ai-interaction-experience](ai-interaction-experience/spec.md)：跨插件 AI 交互；I0 预览已在工作台框架里按实物重做并走查，待用户看实物；共享组件与产品接入未开始。
- [computer-use](computer-use/spec.md)：个人助理的完整 Computer Use——操作 macOS 桌面应用，过程与结果在侧栏的「电脑」「文件」与对话里交给用户（等真机验收，BL-325）。能力切片已合入，门禁与全量由 CI 证明；二十步、带截图的 Shelf、五类拒绝和同进程 sheet 等真机验收。
- [skill-packs](skill-packs/spec.md)：技能包（内容包）与个人助理 / Coding 的装配；只有内容、没有运行时/动作/存储的包可以安装，两边共享一份目录；2026-10-18 新立，尚未实现。
- [agent-approval](agent-approval/spec.md)：Agent 产出的变更与外部效果的真人批准门；N 个有写权限的真人、`/approve <sha>` 绑定 head、push 后过期、Agent/bot 不计；2026-10-18 新立，尚未实现。
- [automation-recommender](automation-recommender/spec.md)：项目自动化建议；只读扫描项目，按 hooks/技能包/MCP/子代理/命令各推荐 1–2 个，有证据、可保存、不自动安装；2026-10-18 新立，尚未实现。
- [plugin-project-database](plugin-project-database/spec.md)：项目库里的插件表——插件在 Manifest 里声明，平台第一次打开时建表、记账本、核对发布者与版本，项目身份改成 `project_root`（PG-020、PG-021）；L1a 已做（声明、检查与打开函数），宿主还不按它建表。S8 让 Goals 的 31 张表（含 `boards`）也改由 Goals 自己声明（待审，与 L1b 同批）。
- [code-modernization](code-modernization/spec.md)：代码现代化工作流；评估 → 地图 → 业务规则 → 计划批准 → 增量改造 → 行为等价证明 → 报告；2026-10-18 新立，尚未实现。
- [onboarding-coverage](onboarding-coverage/spec.md)：先接通真实文件选择、模型整理、失败恢复与材料进入项目/Coding；再扩场景包、动态引导、全局/项目/任务设置、项目助理团与 AI 交互首页；2026-10-27 需求整合，整项尚未实现，本轮只改文档，F 轨统筹。
- [onboarding-intake-progress](onboarding-intake-progress/spec.md)：引导来源页去掉已废止的 200 份 / 50 MB / 20 MB 文案；大文件夹先按条目显示清点进度，再保存清单。2026-10-25，待验收。
- [onboarding-model-link](onboarding-model-link/spec.md)：引导里选文件和连接文字模型是前后两步；第二步用模型设置的保存和读取，版式仍是引导的左右栏，不进入设置。2026-10-25，待验收。
- [onboarding-folder-places](onboarding-folder-places/spec.md)：桌面引导里下载、文稿、桌面和其他文件夹改成一列，并且可以同时选。2026-10-25，待验收。
- [plugin-frame-desktop-load](plugin-frame-desktop-load/spec.md)：桌面 WebKit 里沙箱插件框要能加载脚本；页面策略写上本次请求自己的回环 origin。2026-10-26，待验收。
- [dual-instance-plugins](dual-instance-plugins/spec.md)：同一个插件同时有 Home 实例和项目实例（Shelf 迁 Plugin Runtime 的前提）；用户已定授权与范围（U1、U2），S0-2a（本机页面调用按各库记录授权）进行中，S0-2b-1、S0-2b-2、S0-2c 随后；2026-10-20 新立。
- [plugin-project-partition](plugin-project-partition/spec.md)：Home 级插件的库按调用所在的项目分开（S0a，Alchemist 的前提）；平台按项目打开、闲置关闭、删项目时关库删目录，插件 API 不变；用户 2026-10-20 定，执行中。
- [prologue-skill-strategy](prologue-skill-strategy/spec.md)：Prologue Skill 的选择、唤起、组合与观测；独立需求，需求已整理，待评审后实施。
- [prologue-tool-strategy](prologue-tool-strategy/spec.md)：Prologue Tool 的工具面、搜索、结果预算与观测；独立需求，需求已整理，待评审后实施。
- [prologue-mcp-strategy](prologue-mcp-strategy/spec.md)：Prologue MCP 的服务器信任、发现、健康与认证；独立需求，需求已整理，待评审后实施。
- [prologue-context-strategy](prologue-context-strategy/spec.md)：Prologue Context 的来源预算、trace、新鲜度与压缩剖面；独立需求，需求已整理，待评审后实施。
- [post-anticorruption-roadmap](post-anticorruption-roadmap/spec.md)：防腐收尾之后全部未完成需求的清单与实现路径——按依赖分五段、按文件分七条轨道；2026-10-27 补材料基础路径优先、场景引导、项目助理团和生成交互首页的前置与顺序，原轨道归属保留，防腐线收尾后执行。
- [quiet-home-refresh](quiet-home-refresh/spec.md)：项目首页后台刷新停在当前画面上，日期条和标题没变就不重画，也不先换成「正在读取事项…」；第一次进入和点「重新读取」仍显示加载。2026-10-22，待验收。

## 现行规范

仍被 `AGENTS.md`、SSOT、Skill 或包 README 引为现行规则的 spec。它们不归档；改规则就改它们。

- [action-architecture](action-architecture/spec.md)：能力怎样注册、发现、调用、授权（§3「基本合同」）。
- [plugin-platform-v2](plugin-platform-v2/spec.md)：插件能声明什么、宿主怎么装配、插件之间怎么交换。2026-10-18 补充 Skill Pack、目录元数据、hooks 与 LSP 声明。
- [molis-work-architecture-reorganization](molis-work-architecture-reorganization/spec.md)：架构与包重组基线。
- [coding-plugin](coding-plugin/spec.md)：Coding 的单一需求来源，下一阶段见 [next-requirements.md](coding-plugin/next-requirements.md)（2026-10-18 补充 LSP 声明、钩子规则、多代理评审、真人批准门、结构化输出、有界迭代与计划页）。
- [craft-finish](craft-finish/spec.md)：界面设计规范。
- [ui-craft-floor](ui-craft-floor/spec.md)：界面工艺底线。
- [shell-page-exceptions](shell-page-exceptions/spec.md)：哪些页面可以整页打开；从 artifact-positioning §4 拆出，`AGENTS.md` 与 `tests/shell-page-gate.test.ts` 引用。

## 还没做的事

都在 [BACKLOG.md](BACKLOG.md)，那是唯一来源。spec 里不再另记「未完成」。

## 规则

**开工。** 新任务在根目录建 `specs/<task>/spec.md`，第一段写状态句：`状态：<执行中/待验收/…>（日期）。`。进度与证据写在同一份 spec 里，不另开进度文件。验收标准写在标题含「验收」的一节，逐条带编号（见下面「验收编号」）。

**归档。** 任务做完（包括只差用户验收的），在开头补一句归档状态，写明判定、依据和日期，然后整个目录移到 `archive/`：

```
> 归档（YYYY-MM-DD）：判定为**已实现 / 部分实现 / 未实现 / 已被取代 / 已作废**。<依据>。剩余事项已移到统一待办清单：BL-xxx。
```

- 模板照抄：开头的 `>` 引用块和「剩余事项已移到统一待办清单：BL-xxx」那句保留（没有剩余事项就省掉后一句）；判定只用上面五个词，补充说明写在判定后面的依据里，不扩写判定词。
- 判定以 main 上的代码和真实行为为准，不只看原状态句。
- 已被取代的，写明被哪份 spec 或哪个决定取代。
- 部分实现或未实现的，先把剩下的事逐条抽进 [BACKLOG.md](BACKLOG.md)，再归档；只差用户验收的，列进清单的「待你验收」。
- 判断不了的不归档，在 BACKLOG 的「待你决定」里写明缺什么证据。
- 归档时同步改仓库里所有指向它的链接（代码注释、README、`docs/`、`skills/`、测试），再跑 `pnpm health:check`（断链、文档引用）和 `pnpm boundary:check`。

**验收编号。** spec 的验收标准逐条带一个编号，测试引用它；改需求时一查编号，就知道哪些测试要跟着改。

- **写法**：验收标准在标题含「验收」的一节里（`## 验收标准`），每条以编号开头，有序列表、无序列表、表格第一格都行：`1. **DOCK-03** 静止时条目的按钮不可见……`。编号是 2 到 8 个大写字母、一个连字符、2 或 3 位数字。字母是这份 spec 的前缀（目录名的缩写）：一份 spec 一个前缀，一个前缀只属一份 spec，也不用 `BL`、`PMR`（待办与合入后审查的编号）。数字在这份 spec 里往上数。
- **不改号、不复用**：删掉一条标准，把它写成 `~~DOCK-04~~ 已取消：<理由>`，编号继续占着；改一条的内容，编号不变；新加的条目从最大的号往后排。同一个标题下只要有一条带编号，其余的列表项和表格行也都要带。
- **归档以后编号还在**：spec 移进 `archive/` 以后，它的前缀仍然属于它，别的 spec 不能再用；它的编号仍然算「有人定义」，老测试里引用的 `DOCK-03` 不会因此变成没人认的引用。检查读 `archive/<目录>/spec.md` 里的编号，只当定义用：归档的 spec 不要求测试覆盖，也不要求补编号。
- **测试引用编号**：证明这一条的测试，把编号写进测试名（`test("DOCK-03 at rest an entry shows no buttons", …)`），或写在测试旁的注释里。一个测试证明几条就写几个；写成范围（`DOCK-01..05`）只算第一个。引用的是 `tests/` 下的测试文件和各处的 `*.test.*`；任何 `fixtures/` 目录里的文件都不算，叫 `*.test.*` 也一样（`vendor/`、`node_modules/`、`dist/`、`.impeccable/` 同；这几个目录在仓库根还是嵌在哪一层都一样）。
- **不能用测试证明的**（真机、要人来判断、等用户自己试用）：在那一条里写 `[人工]`，不再要求测试，证据写进 spec 的证据节。
- **整份 spec 没有可编号的标准**（程序性的 spec，验收在别处逐项闭环）：开头状态句附近写一行 `验收编号：不适用（理由）`。
- **检查**：`node scripts/check-spec-coverage.mjs`。现在是**报告模式**，不管找到什么退出码都是 0（只有参数写错、或 git 读不了仓库才退出 2），CI 里只当信息：列出有验收一节却没有编号的 spec、没有测试引用的编号、测试里引了 spec 里没有的编号，以及重号、串用的前缀（含已归档 spec 占着的前缀）。`--strict` 是它变成门禁以后的样子；在做的 spec 都编好号、报告里没有问题之后再把 CI 那一步改成 `--strict`。

**现行规范** 不归档。规则变了就改原文；一份规范被新 spec 整体取代时，新 spec 成为现行规范，旧的按上面的规则归档。

## 梳理记录

- 2026-10-23：[系统评审问题修复](archive/system-review-fixes/spec.md)归档（本轮已实现，负责人 Codex）；#1018、#1058、#1061、#1062 已合入，#1049 收尾衔接随本 PR 合入。按一骏明确的完成边界，三项偶发测试与安装验收分别转 BL-412、BL-413。
- 2026-10-21：`logic-diagnosis-fixes`、`goal-closure-identity`、`artifact-positioning` 归档（已实现；goal 与 artifact 的用户验收见 BL-401、BL-400）；`project-knowledge` 归档（部分实现，剩余 BL-396～399）。`artifact-positioning` §4 的整页例外清单拆成现行规范 [shell-page-exceptions](shell-page-exceptions/spec.md)。
- 2026-10-17：[合作源码与商业授权](archive/commercial-source-license/spec.md)归档（已实现，负责人 Codex）；#636 已合入 main，许可、分发材料及安装器许可传递通过定向验证、PR CI 和合并队列检查。
- 2026-10-01：全量梳理根目录 193 份 spec。7 份确认为现行规范；186 份归档（已实现 104、已被取代 70、部分实现 8、已作废 4），剩余事项抽进 BACKLOG。逐份判定与依据见 [合入后审查 §8](archive/post-merge-review/spec.md#8-spec-梳理)。
- 2026-10-02：`home-one-screen` 归档（已实现，只差用户试用，BL-111；负责会话确认）。#150 带进根目录的两份归档：`performance-preserving-fixes`（部分实现，BL-109）、`project-management-freeze`（诊断记录，BL-110）。同时把仓库里 109 处指向本机路径（`/tmp`、`/Users/…`、`node_modules`）的链接改成仓库内相对链接；仓库外的只写成路径文本。
- 2026-10-10：`casebook-plugin` 归档（已作废；用户决定删除 Casebook，插件以后重做，防腐整理 §1）。
- 此前两批（158 份）按开头状态句与代码核对归档。
