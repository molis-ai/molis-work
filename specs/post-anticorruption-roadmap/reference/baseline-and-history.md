# 基线与历史

[执行目录](../spec.md) · [Reference 分类](../spec.md#reference)

<a id="section-1"></a>

## 起点：防腐收尾之后的代码

防腐线的收口范围是 §1 的 2026-10-18 那一行：W5、W6 全做完，[privileges.md](../../repository-anti-corruption/privileges.md) 的行全部清掉。按这个范围，后面的需求面对的是这样一份代码：

- 插件一律经 Plugin Runtime 装配，同一套 SDK、Manifest 和平台服务。Goals、Feed、Inbox 都是普通插件，构建期装配名单清空（W6-01）。新插件和新能力只有这一条路可走，没有宿主私路可抄。
- 成果库和角色是平台的一部分；Sessions 已在 SC-4 删除，重做另开（BL-177）。
- 插件样式拆成各插件按需加载的 css，英文词典随插件包、在 Manifest 里声明（PG-070、PG-071）；`workbench.css` 里不再有属于具体插件的规则。
- 项目库的表由插件声明（PG-020、PG-021）；Home 级插件可以按项目分库；同一插件可以有 Home 与项目两个实例；连接、材料、本机目录授权、沙箱服务都由平台提供。
- 目录和各种名单由各包的声明生成（W5-02）；宿主入口只导出装配接口（W5-08）；有 Home 快照命令（W5-16）。
- 插件开发 Skill 和手册按新分层重写，样例只指向迁好的插件（W6-03）。
- 例外：Alchemist 和插件创作台不迁、不删，本轮绕过（用户 10-21、10-23）；后续统一由工作台升级 BL-377 承接，Alchemist 是场景组装能力的落地场景，不再独立重做（用户 10-27）。
- main 之外还有两条没合入的线，都写在防腐收尾之前的插件数据形状上：个人云同步（`personal` 分支，比 main 多 24 个提交、少 175 个，最新 10-25，改动有四分之一在 `plugins/native/`）；CGS 自媒体创作（`codex/cgs-formal-integration-20261013`，停在 10-14，落后 main 1159 个提交）。怎样接见 [需求清单 2](requirements.md#section-3-2)。

阶段 0 的第一件事，是拿真正收尾后的 main 把这一节核一遍，对不上的地方先改本文再开工。

<a id="section-1-1"></a>

### 2026-11-02 对照代码的预核

在 main `885728c79` 上只读核了一遍；#1725 合入后，阶段 0 照此再核一次：

- 防腐线还没收尾：[privileges.md](../../repository-anti-corruption/privileges.md) 的 114 行里还有 11 行待做（PG-011、017、045、046、060、064、070、078、093、094、111）；W6 收口 #1725（954 个文件）在跑全量；真实 Home 清空重建和本人验收的窗口还没开。
- PG-070 还剩 Characters 的样式留在两张共用表里（`apps/workbench/src/characters/styles.ts`、`apps/workbench/src/page-assets.ts`），字体皮肤语言 C 段的前提还没满足。
- 构建期装配名单只剩 Alchemist 与插件创作台（`tests/builtin-plugin-assembly-gate.test.ts` 的 `APPROVED_BUILD_TIME_EXCEPTIONS`）。宿主 `apps/local-host/src` 仍有 692 个文件、约 6.8 万行。
- `personal` 分支比 main 多 24 个提交、少 554 个（[需求清单 2](requirements.md#section-3-2)的 175 是 10-26 的数）；CGS 分支少 1538 个。
- [轨道与冲突规则](tracks.md#section-5)的独占文件变了三处：`apps/local-host/src/coding-surface.ts` 与 `plugins/native/coding/src/client.ts` 已不在；`assistant-island.ts` 已拆成 `apps/workbench/src/scripts/client/assistant-*.ts` 共 24 个文件；助理的 `methods()` 现在在 `apps/local-host/src/assistant/assistant-work-reads.ts`。[轨道与冲突规则](tracks.md#section-5)已按此改，热点也重量了。
- BACKLOG 有 23 行本文没有点名，多数是 10-28 之后新加的沙箱包与 Home 包余项；去处补在 [需求清单 8](requirements.md#section-3-8)末行。
- 依赖图补上了原来只写在正文里的几条边（M1 之前要落的合同、换包窗口一、创作台迁到 Plugin Runtime），去掉了「核心插件同步 → 语言与样式整体切换」这条互等。C 轨按包拆成三个写手，这改了原来「C 轨一个写手」的安排，确认前按原安排执行（[决策记录](decisions.md#section-7)第 17 项）。

## 排期调整记录

以下保留各次记录的原时间与核查范围；历史数量和状态不代表当前实况，现行顺序以执行目录及批次详情为准。

状态：规划（2026-11-03 更新；本轮需求与排期维护：Codex，实施沿原负责人及待分配状态）。在防腐线（[repository-anti-corruption](../../repository-anti-corruption/spec.md)）收尾之后执行；在那之前只作排期参考，不开工。本文只排先后、分轨道、定每一段和每批的交付，不改原需求的内容和验收：那些仍以各自的 spec 和 [统一待办清单](../../BACKLOG.md) 为准。起草时读的是 main `0d8388b09`（batch-42，#1311）。10-26 复查：补进个人云同步与 CGS 两条 main 之外的线、产品建议的余项、BACKLOG 全部条目的去处（[需求清单 8](requirements.md#section-3-8)），字体皮肤语言按段写开，并修了几处轨道借文件和兼容起点的排序。

**执行入口：[01～89 执行目录](../spec.md#execution-batches)；要服务端的需求在[服务端批](server-batch.md#server-batch)。** 阶段 0～4 是总览，批次才是逐项推进的顺序。11-03 对照现行需求与 10-31 以来的改动，纳入全产品文案与引导、智能呈现、主线、升级持续可用、平台余项及开发流程；修正同步与字体切换、SDK 缺口与消费者之间的依赖。11-03 再逐 PR 复核，补入 #1730、版本归一与调用整治的具体交付，修正文字合同顺序、服务互等和评测多余等待；来源对照见 [近期 PR 来源对照](requirement-prs.md#recent-requirement-prs)。本次再按原验收补齐组合服务、创作台 C1～C5、视觉与性能余项、字体资源待决及本机诊断，统一正文与批次的顺序；每项开工前按开发流程 §2.1 说明具体工作。11-03 用户又定两项：恢复一条轨道一个写手、轨道之间并行；字体皮肤语言 C 段前移到 16，B 段验完即把现有入口一次切换（[决策记录](decisions.md#section-7) 第 20 项）。11-03 用户再定：个人同步、团队协作、团队记忆与 M2 都要服务端，移出 01～89，独立成[服务端批](server-batch.md#server-batch)的服务端批，开工时间由用户定，以后有服务端需求都加在这一批；同步声明在 M1 之后按兼容流程加。只更新文档，未启动这些产品实现。



10-27 本轮只更新需求与排期，不开发。[Onboarding 需求书](../../onboarding-coverage/spec.md)已合并场景与能力包、动态渐进引导、全局/项目/任务设置；秘书沿用跨项目个人助理，项目可配独立助理团，首页允许 AI 生成新的交互页面。同时纳入实际反馈的材料选择、文件支持、步骤连续性、生成失败恢复及项目/Coding 接续，先贯穿基础材料路径，再扩场景。下文按此补齐前置能力与先后，轨道负责人保留；10-26 的其他线状态未在本轮全面复核。

2026-10-27 需求调整：原工作台需整体升级与体验打磨，首要解决一骏至今未完整跑通的端到端交付问题；平台场景组装能力并入[插件创作工作台升级](../../plugin-builder-upgrade/spec.md)（BL-377），Alchemist 成为其中的完整落地场景，删除独立重做条目 BL-376。与场景／能力包设置、秘书与助理团引导、首次／项目／通用任务 Onboarding 三项独立；10-27 当时未重排这些引导需求；10-28 的顺序调整见下，防腐收尾前不开工的边界保留。

2026-10-27 采集需求独立：[观测和采集层](../../observation-collection/spec.md)承接主动助理中共用的完整工作记录与采集维护要求，成为评测和主动助理并列依赖的平台能力。只整理需求与排期，保留 C 轨归属；阶段 1 设计，阶段 2 接通事实与消费，阶段 3 验证主动建议及整体效果。评测规则与助理设计可提前准备，采集不依赖二者运行。

2026-10-28 排期复查：公共资料、目录和工作台整合进入阶段 1；Sessions 历史接续前移到阶段 2；观测和采集、最小评测先于依赖它们的报告与理解验证；同步和实时协作在阶段 1 共同设计，关键并发／断线路径在阶段 2 验证；创作台阶段 1 诊断与定样、阶段 2～3 做通新能力插件交付，阶段 4 完成场景组装与 Alchemist。批准规则按已有授权、可选 AI 低风险审批和显式人审范围对齐。原负责人、Memory 暂停、完整产品范围及防腐收尾前不开工均保留；长期效果观察与独立开发并行。本次只更新文档。

2026-10-27 治理排期补充：[全平台产品与架构治理](../../product-flow-governance/spec.md)已完成首轮静态盘点。现有各轨道实施时采用其相对顺序：先材料与已有工作恢复，再默认连接到实际使用，再同范围批准及发布启用衔接，再流程/提示词/个人设置简化，并持续补齐全部功能的真实路径。具体发现、依赖和退出条件只维护在治理需求 §6 与核查记录；这里不复制派工表，不改原负责人、Memory 暂停或防腐收尾前不开工的安排。授权规则以本轮已定需求为准：有效授权内连续执行；Coding 的可选低风险 AI 审批不替代显式要求的真人票数；团队发布等明确的人审仍保留。批准需求已同步，现有代码和仓库保护未因此改变。

11-02 只补需求：全产品文案与按需帮助并进 [visual-ui-experience](../../visual-ui-experience/spec.md#copy-guidance)，引导接续并进 [Onboarding §3.15](../../onboarding-coverage/spec.md#315-从页面帮助到渐进式引导)。新增 VUX-51～59、ONB-47～49 尚未实现或验收；需求维护 Codex，D/F 与各功能轨道保留原归属。视觉线移入部分完成清单，原有一百一十一片和局部验收不代表新增全产品要求已完成。

<a id="source-status-history"></a>

## 需求清单的历史状态快照

以下是 2026-11-03 内容整理前保留的核查记录，包含 10-28 等更早状态，不代表当前合入或验收结果；01 开工时核回。Memory 未完成且暂停，不能因旧表位置被解释为已做完。原“去处”是历史写法，现行批次只看[需求映射](requirements.md#section-3)。

| 需求 | 现状 | 去处 |
| --- | --- | --- |
| [diff-frame-performance](../../diff-frame-performance/spec.md)、[long-turn-performance](../../long-turn-performance/spec.md)、[attention-aggregate-performance](../../attention-aggregate-performance/spec.md) | #1010、#1017、#1073 都已合入 main，状态句没跟上 | 0：核对后归档 |
| [pr-review-remediation](../../pr-review-remediation/spec.md) | #901 已合入 | 0：归档，QA-017 没跑通的进 BACKLOG |
| [repository-cleanup](../../repository-cleanup/spec.md) | 状态句已写「已实现」 | 0：归档 |
| [status-ring-system](../../status-ring-system/spec.md) | 组件和 43 个状态已在 design-system，状态句还停在 10-13 | 0：核对后归档，视觉验收进「待你验收」 |
| [plugin-tab-groups](../../plugin-tab-groups/spec.md) | PTG 用例在 main | 0：核对后归档 |
| [empty-goal-create](../../empty-goal-create/spec.md)、[quiet-home-refresh](../../quiet-home-refresh/spec.md)、[onboarding-intake-progress](../../onboarding-intake-progress/spec.md)、[onboarding-model-link](../../onboarding-model-link/spec.md)、[onboarding-folder-places](../../onboarding-folder-places/spec.md) | 原列待验收；10-28 核实 #1306 已关闭、未合入 | 0：逐项核对成果是否由其他提交承接，保留未交付与待体验项；不再等待 #1306 合入 |
| [issue-home-v0](../../issue-home-v0/spec.md) | V0 与首期体验按工程验证完成（用户 10-12 定）；BL-149 的分支待评审 | 0：BL-149 合入或关掉后归档 |
| [computer-use](../../computer-use/spec.md) | 能力已合入，等真机（BL-325） | 0：真机验收后归档；BL-326、BL-327 留在 BACKLOG |
| [ai-development-handbook](../../ai-development-handbook/spec.md) | 正文已写 | 0：BL-320 你验收；BL-321（ADH-23）随技能包在 1·C 做 |
| [prologue-memory-strategy](../../prologue-memory-strategy/spec.md) | #1101、#1059 在途，P0 的形成、召回、SDK 接入未完 | 0：两个 PR 收掉；P0 余项仍属 1·C；沿原暂停边界，恢复授权前不启动 |
| 防腐线自己的四份：repository-anti-corruption、[plugin-project-database](../../plugin-project-database/spec.md)、[dual-instance-plugins](../../dual-instance-plugins/spec.md)、[plugin-project-partition](../../plugin-project-partition/spec.md) | 随 W6-06 收尾 | 防腐线自己归档 |
| BACKLOG「待你验收」BL-001～017、105、109、111、320、325、400、401 | 已合入，只差你试用 | 0：一张验收单，一次走完 |
| 右栏选一段放进文稿（产品建议 F1；#712、#720） | 已合入；没用真实材料走过，落点只有 Pages | 0：真实 Shelf → Pages 走一遍，连同 #784 的 QA-030 复验；下一个落点等走完再定 |

<a id="track-history"></a>

## 历史热点与人员建议

以下数量是原统计窗口的快照；“建议谁做”写于 10-31 设备 A 的 Codex 全线接手之前，不用于重新分配当前负责人。当前职责与交接边界看[轨道表](tracks.md#section-5)。

自 10-12 起合入 main 的 PR 里，改得最多的代码文件：`scripts/gates/page-assets.mjs`（127 次）、`apps/local-host/src/index.ts`（79）、`apps/workbench/src/scripts/client/assistant-island.ts`（55）、`tests/ci-product-subset.txt`（55）、`plugins/native/coding/src/client.ts`（47）、`packages/contracts/src/platform/plugin.ts`（46）、`apps/local-host/src/assistant/assistant-service.ts`（43）、`packages/design-system/src/styles/craft-finish.ts`（41）。防腐收尾后宿主入口会变薄，阶段 0 重新量一次；其余几处正是后面需求最密的地方，所以按它们分轨道：

11-02 重量（10-19 起 main 的 694 个提交，不算文档与快照）：`scripts/gates/page-assets.mjs` 118 次、`apps/local-host/src/index.ts` 65、`tests/ci-product-subset.txt` 36、`packages/contracts/src/platform/plugin.ts` 35、`pnpm-lock.yaml` 31、`apps/local-host/src/project-plugins.ts` 31、`packages/plugin-runtime/src/index.ts` 30、`apps/local-host/src/web-request.ts` 30、`scripts/workspace-packages.mjs` 28、`assistant-island.ts` 28。宿主入口仍是第二热的文件；宿主与工作台外壳的几个热文件不归任何轨道，按规则 4 一起落。

| 轨道 | 这条轨道独占的文件 | 主要的活 | 建议谁做 |
| --- | --- | --- | --- |
| A 助理与输入 | `apps/workbench/src/scripts/client/assistant-*.ts`（`assistant-island.ts` 已拆成 24 个）、`apps/local-host/src/assistant/`、`packages/contracts/src/services/assistant.ts`、共用输入组件、助理的词典 | 统一输入框、个人助理的引导接点、回执余项、每日简报、主动助理 | Claude（交互与视觉） |
| B Coding | `plugins/native/coding/`、Git、Diff 及 Files 退役涉及的现有消费者 | harness、下一阶段、质量保证、代码现代化 | Claude 主写，边界清楚的小片给 Codex |
| C1 合同与 SDK | `packages/contracts/src/platform/`、`packages/plugin-sdk/`（UI 子路径除外）、`packages/plugin-runtime/`、`tooling/gates/api/`、`tooling/gates/actions/` | 公共资料/目录、技能包、场景/角色/页面、授权及人审的合同，以及服务端批里的同步合同；沙箱包与 Runtime 的缺口；对抗式审查的 SDK 收拢；合同评审 | Claude（兼管合同评审） |
| C2 AI 运行时 | `horizontal/agent-host/`、`horizontal/memory/`、`vendor/prologue-sdk/` | Prologue 采用与换包窗口、记忆、Skill/Context/MCP/Tool 四份策略、子代理的 Prologue 一半 | Claude |
| C3 平台新服务 | 每项服务一个新的 `horizontal/<服务>/` 包（用户 11-01 定新的平台服务不进宿主，宿主只做装配） | 观测和采集、评测、Sessions 历史与控制、智能呈现组合服务、主线、场景与生成页面的运行时、Attention 的提醒与唤醒；按包分清主人；[决策记录](decisions.md#section-7)第 17 项确认前由 C 轨一个写手顺序实现 | 按包分派 |
| D 外观与语言 | `packages/design-system/`、`apps/workbench/src/i18n/`、ui-host、`packages/contracts/src/ui/` 与 `ui.ts`、`packages/plugin-sdk/src/ui.ts`（字体皮肤语言 A 段落在这里）、`DESIGN.md`、平台设置页 | 工作台标签/分屏/导航、公共资料呈现、VUX 收尾、字体皮肤语言、生成页面承载与交互预览、「授权与放行」一页（产品建议 H1） | Claude |
| E 插件 | Coding 一族以外的 `plugins/native/<插件>/`、新插件包 | 体验债、风险、工作简报本体、创作台的插件侧实现、场景所需插件配置与结果落点、情境 W4～W6、插件小功能 | Codex 独立片为主，界面定样由 Claude |
| F 场景引导与发布 | `apps/desktop/`、安装器、`docs/releases/`、引导页与引导路由 | 首次/项目/任务引导完整路径、设置映射、首日旅程；运行条件、签名与升级、正式 OAuth | Codex；账号、证书、真实 Home 只能你办 |
| G 服务端 | 同步 Worker（`personal` 分支上的 `apps/sync-worker/`）、平台同步服务与团队协作服务（新的 `horizontal/` 包，见 C3 一行的用户决定）；各插件 Manifest 里的同步声明按规则 4 一起落；M2 的桌面一侧在 `apps/desktop/`，由 F 落（规则 7） | [服务端批](server-batch.md#server-batch)服务端批：同步合同、Worker、各插件接入、两台真电脑验收，团队协作与团队记忆，M2 的服务一侧；01～89 期间不开工 | 接着 `personal` 分支原来的会话做，合同由 C 轨评审；开工时间、部署和真实账号只能你办 |
