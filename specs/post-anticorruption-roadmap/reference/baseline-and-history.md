# 基线与历史

[执行目录](../spec.md) · [参考分类](../spec.md#reference)

<a id="section-1"></a>

## 起点：防腐收尾之后的代码

现行基线是 [01 逐项核账](batches/01.md#baseline-01)，以下保留路线书起草时的预期与 11-02 历史快照，不当作当前主线事实。

防腐线的收口范围是 §1 的 2026-10-18 那一行：W5、W6 全做完，[privileges.md](../../archive/repository-anti-corruption/privileges.md) 的行全部清掉。按这个范围，后面的需求面对的是这样一份代码：

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

- 防腐线还没收尾：[privileges.md](../../archive/repository-anti-corruption/privileges.md) 的 114 行里还有 11 行待做（PG-011、017、045、046、060、064、070、078、093、094、111）；W6 收口 #1725（954 个文件）在跑全量；真实 Home 清空重建和本人验收的窗口还没开。
- PG-070 还剩 Characters 的样式留在两张共用表里（`apps/workbench/src/characters/styles.ts`、`apps/workbench/src/page-assets.ts`），字体皮肤语言 C 段的前提还没满足。
- 构建期装配名单只剩 Alchemist 与插件创作台（`tests/builtin-plugin-assembly-gate.test.ts` 的 `APPROVED_BUILD_TIME_EXCEPTIONS`）。宿主 `apps/local-host/src` 仍有 692 个文件、约 6.8 万行。
- `personal` 分支比 main 多 24 个提交、少 554 个（[需求清单 2](requirements.md#section-3-2)的 175 是 10-26 的数）；CGS 分支少 1538 个。
- [轨道与冲突规则](tracks.md#section-5)的独占文件变了三处：`apps/local-host/src/coding-surface.ts` 与 `plugins/native/coding/src/client.ts` 已不在；`assistant-island.ts` 已拆成 `apps/workbench/src/scripts/client/assistant-*.ts` 共 24 个文件；助理的 `methods()` 现在在 `apps/local-host/src/assistant/assistant-work-reads.ts`。[轨道与冲突规则](tracks.md#section-5)已按此改，热点也重量了。
- BACKLOG 有 23 行本文没有点名，多数是 10-28 之后新加的沙箱包与 Home 包余项；去处补在 [需求清单 8](requirements.md#section-3-8)末行。
- 依赖图补上了原来只写在正文里的几条边（M1 之前要落的合同、换包窗口一、创作台迁到 Plugin Runtime），去掉了「核心插件同步 → 语言与样式整体切换」这条互等。C 轨按包拆成三个写手，这改了原来「C 轨一个写手」的安排，确认前按原安排执行（[决策记录](decisions.md#section-7)第 17 项）。

## 排期调整记录

以下保留各次记录的原时间与核查范围；历史数量和状态不代表当前实况，现行顺序以执行目录及批次详情为准。

状态：规划（2026-11-03 更新；本轮需求与排期维护：Codex，实施沿原负责人及待分配状态）。在防腐线（[repository-anti-corruption](../../archive/repository-anti-corruption/spec.md)）收尾之后执行；在那之前只作排期参考，不开工。本文只排先后、分轨道、定每一段和每批的交付，不改原需求的内容和验收：那些仍以各自的 spec 和 [统一待办清单](../../BACKLOG.md) 为准。起草时读的是 main `0d8388b09`（batch-42，#1311）。10-26 复查：补进个人云同步与 CGS 两条 main 之外的线、产品建议的余项、BACKLOG 全部条目的去处（[需求清单 8](requirements.md#section-3-8)），字体皮肤语言按段写开，并修了几处轨道借文件和兼容起点的排序。

**执行入口：[01～89 执行目录](../spec.md#execution-batches)；要服务端的需求在[服务端批](server-batch.md#server-batch)。** 阶段 0～4 是总览，批次才是逐项推进的顺序。11-03 对照现行需求与 10-31 以来的改动，纳入全产品文案与引导、智能呈现、主线、升级持续可用、平台余项及开发流程；修正同步与字体切换、SDK 缺口与消费者之间的依赖。11-03 再逐 PR 复核，补入 #1730、版本归一与调用整治的具体交付，修正文字合同顺序、服务互等和评测多余等待；来源对照见 [近期 PR 来源对照](requirement-prs.md#recent-requirement-prs)。本次再按原验收补齐组合服务、创作台 C1～C5、视觉与性能余项、字体资源待决及本机诊断，统一正文与批次的顺序；每项开工前按开发流程 §2.1 说明具体工作。11-03 用户又定两项：恢复一条轨道一个写手、轨道之间并行；字体皮肤语言 C 段前移到 16，B 段验完即把现有入口一次切换（[决策记录](decisions.md#section-7) 第 20 项）。11-03 用户再定：个人同步、团队协作、团队记忆与 M2 都要服务端，移出 01～89，独立成[服务端批](server-batch.md#server-batch)，开工时间由用户定，以后有服务端需求都加在这一批；同步声明在 M1 之后按兼容流程加。只更新文档，未启动这些产品实现。



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
| [diff-frame-performance](../../archive/diff-frame-performance/spec.md)、[long-turn-performance](../../archive/long-turn-performance/spec.md)、[attention-aggregate-performance](../../archive/attention-aggregate-performance/spec.md) | #1010、#1017、#1073 都已合入 main；2026-11-03 已核对并同步状态句，历史验证与未验证范围保留在各 spec | 0：核对后归档 |
| [pr-review-remediation](../../archive/pr-review-remediation/spec.md) | #901 已合入 | 0：归档，QA-017 没跑通的进 BACKLOG |
| [repository-cleanup](../../archive/repository-cleanup/spec.md) | 状态句已写「已实现」 | 0：归档 |
| [status-ring-system](../../archive/status-ring-system/spec.md) | #488 已合入 main，2026-11-03 已同步状态句；用户视觉验收仍待进行 | 0：核对后归档，视觉验收进「待你验收」 |
| [plugin-tab-groups](../../plugin-tab-groups/spec.md) | PTG 用例在 main | 0：核对后归档 |
| [empty-goal-create](../../archive/empty-goal-create/spec.md)、[quiet-home-refresh](../../archive/quiet-home-refresh/spec.md)、[onboarding-intake-progress](../../archive/onboarding-intake-progress/spec.md)、[onboarding-model-link](../../archive/onboarding-model-link/spec.md)、[onboarding-folder-places](../../archive/onboarding-folder-places/spec.md) | 原列待验收；10-28 核实 #1306 已关闭、未合入 | 0：逐项核对成果是否由其他提交承接，保留未交付与待体验项；不再等待 #1306 合入 |
| [issue-home-v0](../../archive/issue-home-v0/spec.md) | V0 与首期体验按工程验证完成（用户 10-12 定）；BL-149 的分支待评审 | 0：BL-149 合入或关掉后归档 |
| [computer-use](../../computer-use/spec.md) | 能力已合入，等真机（BL-325） | 0：真机验收后归档；BL-326、BL-327 留在 BACKLOG |
| [ai-development-handbook](../../ai-development-handbook/spec.md) | 正文已写 | 0：BL-320 你验收；BL-321（ADH-23）随技能包在 1·C 做 |
| [prologue-memory-strategy](../../prologue-memory-strategy/spec.md) | #1101、#1059 在途，P0 的形成、召回、SDK 接入未完 | 0：两个 PR 收掉；P0 余项仍属 1·C；沿原暂停边界，恢复授权前不启动 |
| 防腐线自己的四份：repository-anti-corruption、[plugin-project-database](../../archive/plugin-project-database/spec.md)、[dual-instance-plugins](../../archive/dual-instance-plugins/spec.md)、[plugin-project-partition](../../archive/plugin-project-partition/spec.md) | 随 W6-06 收尾 | 防腐线自己归档 |
| BACKLOG「待你验收」BL-001～017、105、109、111、320、325、400、401 | 已合入，只差你试用 | 0：一张验收单，一次走完 |
| 右栏选一段放进文稿（产品建议 F1；#712、#720） | 已合入；没用真实材料走过，落点只有 Pages | 0：真实 Shelf → Pages 走一遍，连同 #784 的 QA-030 复验；下一个落点等走完再定 |

拆分前第 3.2～3.5 节的表也留在这里，供 01 核账与 SRV-1 对账：是 11-03 拆分时的原文，“1·C”“2·A”是“阶段·轨道”写法，指向路线书本身的节号已换成链接。

### 原 3.2 做了一半、交接后停下的需求线

| 需求 | 剩什么 | 去处 |
| --- | --- | --- |
| [visual-ui-experience](../../visual-ui-experience/spec.md) | 原一百一十一片记录保留；VUX-16～18、VUX-33、VUX-35 与本人验收未完；新增全产品文案与按需帮助 VUX-51～59 尚未实现 | 原输入余项 1·A、视觉/性能余项 1·D；1·D/F 共同设计文案与引导，2·D 统筹各入口落实、F 接续准备流程，各功能轨道改自己的表面；全产品逐项验收 |
| [ai-input-receipts](../../ai-input-receipts/spec.md) | Goal 页「来自对话的输入」BL-314；交付说明入口 BL-315、步骤板 BL-316；有效要求的评测 BL-317；浏览器实走 BL-319；跨轮 BL-148；补充改了哪些文件 BL-162；阶段 5、6（BL-318） | 2·A；阶段 5 并进主动助理（3·A），阶段 6 各场景各写小 spec |
| [prologue-adoption](../../prologue-adoption/spec.md) | A5 重核（原 BL-309，第 24 批做完）；写后检查进时间线与截图（原 BL-301、BL-303，第 24 批做完）、子任务写后检查 BL-302；P5 协作 BL-307；P6 旧路径退出 BL-308；结构化生成 BL-306 | BL-302 在 1·C；BL-307、BL-308 进换包窗口一（2·C）；BL-306 随工作台升级的 Alchemist 场景（阶段 4） |
| [ai-interaction-experience](../../ai-interaction-experience/spec.md) | 第二批入口 BL-341（PPT、Pages、Cognia）；卡片撤销 BL-343（合同改动）；同排推荐 BL-344（你看实物）；验证 BL-345；键盘多选 BL-340；Coding 目标芯片 BL-342 | BL-343、BL-344 在 2·A；BL-341、BL-340 在 2·E；BL-342 在 2·B（用新输入框） |
| [context-program](../../context-program/spec.md) 及 [context-toolbar](../../context-toolbar/spec.md)、[quick-create](../../quick-create/spec.md)、[side-shelf](../../side-shelf/spec.md) | W4：一句话新建 BL-330、`attach` 的 `find` BL-331、批量创建 BL-332、内容站与「放进 Inbox」BL-333、无模型去处 BL-174、覆盖率门禁 BL-334；W5 拖放 BL-335；W6 Shelf 动作与材料篮 BL-336；W7 起 BL-337；实走与收尾 BL-338、BL-339 | W4 在 2·E；W5、W6 在 3·E；W7 起在阶段 4 |
| [assistant-service-connections](../../assistant-service-connections/spec.md)（产品建议 A3） | 37 项整体验收、ASC-38～44、真实账号 BL-060、正式 OAuth BL-062、发起者核对 BL-180、loader 名单 BL-181、导入方式核对 BL-690 | BL-062 在 1·F 先送审（审核慢）；其余 3·C |
| [coding-plugin 下一阶段](../../coding-plugin/next-requirements.md) | 保留范围见 BL-050；C5 多模型对比取消、页面沿 Character 选择；Q1 已定公开查询默认、项目/任务关闭及平台公共搜索、统一默认来源，Q2 命令默认受限且沿用项目目录、长期规则经用户明确同意保存、获准开发任务下载所需公开依赖已定，可选 AI 低风险自动审批已定，Q3 钩子首次确认、变更重新确认及停用已定，Q4 记忆沿原方案接入已定，Q5 代码分析工具按需隔离下载已定，Q6 已收口：取消多模型对比，语音沿既有本地输入方案；Q7 GitHub 复用连接与按任务授权已定，Q8 已定本阶段不做 VS Code 扩展／Tab 补全／行内编辑，ACP 仍未排期；Q1～Q8 已收口，各项只等实际依赖 | A 期 2·B；B 期 3·B；C、D 期阶段 4；E1 语音并进 53 统一输入，E6 有界迭代与 E8 代码简化／安全专科评审并进 65，E7 交互计划页在 83；E2～E5 与 ACP 仍按[暂缓项](deferred.md#section-8)暂缓或不在本期 |
| 个人云同步（`personal` 分支上的 `specs/personal-cloud-sync/`、`plugin-sync-foundation/`、`personal-plugin-replication/` 等六份） | 账号、同步 Worker（D1、R2）、双 Home 同步与撤销，以及 Todo、Pages、Goals、Images、Alchemist、Cognia、Feed、Shelf 等的适配，已在隔离环境分项验证；整体没交付、没部署、没在两台真电脑上验过，整项目复制与项目级回收的闭环没完。下一阶段的范围你 10-17 定了：设备间自动与手动同步、全部插件、每个账号 100 MB、保留 30 天 | 移到[服务端批](server-batch.md#server-batch)（用户 2026-11-03 定）：SRV-1 对账、定合入方式与合同，SRV-2 核心插件，SRV-5 其余插件与真机；见[需求来源](requirements.md)里的「个人云同步怎样接进来」 |
| CGS 自媒体创作（`codex/cgs-formal-integration-20261013` 分支的 `specs/cgs-formal-integration/`） | 10-14 的基线上做完阶段 0、1：七项创作 Skill，作者在项目里带材料讨论、比较候选、定主稿、出各平台稿；没合主线、没发布。研究、选题、栏目、发布回执、数据复盘不在已做范围 | 分支不合；和 Alchemist 一起作为场景需求放进 81（阶段 4，用户 2026-11-03 定）：先盘点分支，七项 Skill 改成内容技能包，用同一场景组装能力配成场景；插件本体按新 SDK 重做、改成场景组装还是放下，由你定（[决定 14](decisions.md#decision-14)） |

### 原 3.3 需求已整理、还没开工

| 需求 | 一句话 | 去处 |
| --- | --- | --- |
| [unified-input-voice](../../unified-input-voice/spec.md) | 平台统一输入组件的整体交互与 UI；首页、助理、Coding 首批接入，向所有适用插件／组件开放注册扩展，加本机语音（10-27 已定，§2.1～2.2） | 文字与公共扩展部分 1·A；语音 2·A（要真机验麦克风与中文输入法） |
| [skill-packs](../../skill-packs/spec.md) | 只有 Manifest 的内容插件，助理和 Coding 共用一份方法目录；纯内容的包助理看得见（产品建议 G1），从 Claude Code、Codex 导入的 Skills 直接变成技能包（G2） | 1·C（`assistant-service.ts` 那处改动由 A 轨落，见[轨道规则](tracks.md#section-5) 7） |
| [work-brief](../../work-brief/spec.md) | 可选的项目综合首页与简报插件；未安装时保留平台基础首页，共用公开来源／呈现，承接生成页面与原简报版本能力（10-27 已定） | 1·C/D 公共合同、组件与基础首页，1·E 综合首页及简报核心；2·D/E/F 生成首页接续、2·A 每日简报；3·A 周期报告 |
| [观测和采集层](../../observation-collection/spec.md) | 全平台获准的用户行为、过程、结果与当时内容；公共查询、覆盖、历史证据及维护；需求已独立，尚未实现 | 1·C 盘点设计，2·C 先接通真实事实、历史读取与恢复；各轨道持续接入，不等主动助理建成 |
| [平台端到端效果评测](../../proactive-assistant/spec.md#14-molis-work-的端到端效果评测) | 独立消费采集证据，负责样本、预期、判定、比较与隔离回放；覆盖手动及各类 AI 工作 | 1·C 准备案例与方法，2·C 接通最小真实评测路径，3·C 扩展整体及主动效果；Coding R12 仍在 3·B |
| [proactive-assistant](../../proactive-assistant/spec.md)及 [#1730 增量][PAEXT]（未合入） | 主对话、连续交办、后台可视化、场景 Skill 与工作记忆；新增逐项交付／返工、准备与通知分开判断、观察试用 | 1·A/D 设计、C 核公共能力；2·A 在 32 交明确任务和 PWA-144～147、56 验真实闭环；3·A/C 在 63 交 PWA-141～143、75 验效果。记忆沿原暂停，明确交办不等完整采集与评测 |
| [coding-harness-optimization](../../coding-harness-optimization/spec.md) | Coding 可靠性与性能：A 批 P0、B 批闭环、C 批渲染与 Dataset、D 批 Computer Use 与 Git/PR/CI、E 批评测、F 批效率实验 | A、C 批 1·B（Dataset 那半 2·E）；B 批 2·B；D 批与 R12 3·B；R11 并进创作台重做；F 批阶段 4 |
| [agent-approval](../../agent-approval/spec.md) | 有效授权持续执行，明确需人审的范围按人员和版本校验；Coding 可选低风险 AI 审批单独记录来源 | 0 对齐新旧要求，1·C 设计公共边界，2·C 接通审查合同及 BL-359、BL-360；3·B 接 Coding 专项，不作为所有功能的共同前置 |
| [subagent-interaction](../../subagent-interaction/spec.md) | 助理与 Coding 里固定的子代理入口、直接对话、父任务获知变化 | Prologue 那半进换包窗口一（2·C）；产品那半 3·A、3·B |
| [coding-quality-assurance](../../coding-quality-assurance/spec.md) | 自检、交叉评审、对抗评审、安全评审、批准门、有界迭代 | 3·B |
| [automation-recommender](../../automation-recommender/spec.md) | 读项目，推荐值得加的 hooks、技能包、连接、角色、命令；保持只读推荐、不自动安装 | 引导需要的读取/推荐片提前到 2·C；完整能力仍为 3·C |
| [code-modernization](../../code-modernization/spec.md) | 评估 → 地图 → 业务规则 → 计划批准 → 增量改造 → 行为等价证明 | 4·B |
| [product-flow-governance](../../product-flow-governance/spec.md) | 全平台配置、工作衔接与审批治理；已定公共资料／目录、Files 退役、标签分屏统一；真实整改未做 | 1·C/D 与 B/F 先接资料、目录、工作台导航及恢复；1～2 阶段迁完消费者、历史引用与过程项后退役 Files；其余沿治理 §6，全平台覆盖才算整体完成 |
| [onboarding-coverage](../../onboarding-coverage/spec.md) | 先修顺多位置/真实文件支持、步骤与恢复、材料采用及 Coding 接续；再扩场景包、动态引导、全局/项目/任务设置、项目助理团与新交互首页 | 本轮完成需求整合；1·F 贯穿设计与设置映射，1～2·F 沿原主人完成材料基础路径；1～2·C/D/E 场景公共能力，2·F 场景闭环及任务复用；持续工作与完整导入导出随阶段 3 |
| [font-and-skin-system](../../font-and-skin-system/spec.md) | 字体、皮肤、语言三套系统 | 分五段，跨阶段 1～3 的 D 轨，见表后 |
| [risk-plugin](../../risk-plugin/spec.md) | 专门记风险的插件 | 1·E（收尾后第一个按新标准从零写的插件） |
| [prologue-skill-strategy](../../prologue-skill-strategy/spec.md) | Skill 的选择、唤起、组合与观测 | 评审后 2·C，紧跟技能包 |
| [prologue-context-strategy](../../prologue-context-strategy/spec.md) | 来源预算、trace、新鲜度、压缩 | 评审后 3·C，配合主动助理 |
| [prologue-mcp-strategy](../../prologue-mcp-strategy/spec.md) | MCP 服务器信任、发现、健康、认证 | 评审后 3·C，配合服务接入收尾 |
| [prologue-tool-strategy](../../prologue-tool-strategy/spec.md) | 工具面、搜索、结果预算 | 评审后 3·C |
| [intelligent-surfaces](../../intelligent-surfaces/spec.md) | 智能呈现与操作层（11-02 新增）：插件声明对象能怎样展示、能做什么、别人能放在它哪里；平台先做确定组合，助理再把插件内容、平台内容与 MCP、Skill 组合成此刻的操作面，注入插件内外、对话、项目讨论、等你与首页 | 分四片，跨阶段 1～4，见表后 |
| [work-mainline](../../work-mainline/spec.md) | 主线（11-02 新增）：用户把手头的事项（平台的轻量容器，Goal、待办等可以变成事项）按自己的分组和顺序排好，从顶部像切换项目那样切到一件事，主区、标签、右侧、助理范围和等你一起换；事项容器与排列归新的主线服务，插件对象的内容仍归插件 | 1·D 与 PFG 的工作台统一一起设计；2·C1 合同（M1 之前）、2·C3 主线服务包、2·D 切换器与按事项的工作台状态、2·E/B Goals 与 Coding 来源；整理视图与助理范围 2～3·A/D/E；助理建议 3·A，跨设备随服务端批（SRV-2、SRV-5） |

### 原 3.4 重做与新方向

| 事项 | 包含 | 去处 |
| --- | --- | --- |
| [Sessions 重做](../../sessions-rebuild/spec.md)（BL-177） | 国内外主流公司的 AI 开发工具都覆盖；冷启动导入、持续了解进展、直接控制外部会话三类都做，回到会话、搜索、消息与跨 Runtime 交接均保留，逐产品／入口记录能力和缺口，不以两家通过代表整体完成；产品建议 B2 挂在这里 | 1·C 盘点来源与历史读取合同；2·C/F 做历史发现、读取、项目归属及引导接续；3·C 完成持续跟进、会话控制和跨工具交接，逐产品／入口验收完整范围 |
| 首日旅程（产品建议 A6、I1、I10） | 已合进 onboarding-coverage：目的/材料起步 → 动态补问 → 场景与配置预览 → 采用 → 真实第一件事；包含项目助理团、新交互首页与获准的规则/Skills 导入 | 不另写第二份需求；1·F 设计，公共能力就绪后 2·F 实现；新项目、已有项目增加场景和单次任务共同覆盖 |
| [插件创作工作台升级](../../plugin-builder-upgrade/spec.md)（BL-377） | 原工作台从真实想法到可用插件的完整交付、体验与恢复；平台场景组装：手动／个人助理组合已有插件，与新能力插件创作共用工作台；Alchemist 为完整落地场景，承接 BL-010、035、306；保留 harness R11、R12、产品建议 C1～C5、字体皮肤语言 §7.2、BL-040、055、113、114、125、132、245、373、551、712 与 BL-341 的创作台部分 | 1·C/D/E 诊断真实断点、核能力并做交互切片；2～3·C/D/E 做通新能力插件创作、安装、独立使用和修订；3·C 细化组装合同，4 完成组装与 Alchemist；三项引导仍独立，整体未完成 |
| [团队协作首版](../../team-collaboration/spec.md)（产品建议 I8） | 多成员与 AI 共用项目资料、任务和结果，首版包含实时共同编辑、成员光标与交错修改保护，整体参考 Codex Projects；BL-071、BL-013；BL-022 团队记忆已独立成文。10-28 已定按项目明确共享，个人空间、其他项目和个人外部 AI 会话不自动公开，记录与简报遵守同一范围；首版项目级查看／编辑／管理三档、后续插件／资产细化已定，统一访问入口保留资源和操作；团队记忆的发布、融合与使用转独立需求，本项负责身份和访问衔接；细粒度规则与同步交互待细化。要先有个人云同步和身份与团队权限（今天两个模块都没有实现） | 移到[服务端批](server-batch.md#server-batch)（用户 2026-11-03 定）：SRV-1 共同设计访问、同步与实时编辑，SRV-3 验证关键并发／断线路径，SRV-4 收拢剩余交互，SRV-6 交付完整团队产品；实现待分配 |
| [团队记忆](../../team-memory/spec.md)（BL-022） | 像持续在线的 PMO 观察获准项目、沟通和工作，筛选可复用的决策、风险、知识、偏好和协作模式，减少三类上下文交接；助理／Skill 消费以支持主动协作、习惯和交付质量改善。成员个人发布需最终确认并告知不可撤回，管理员维护，个人与团队可采用不同策略；复用公共采集和记忆能力，不扩大原记忆 P0 | 随团队放进服务端批：SRV-1 核团队来源、用途与访问边界，SRV-4 细化形成／融合与使用方案，团队身份／同步、公共采集及所需记忆能力具备后在 SRV-7 实施；未实现，不启动暂停的 Memory P0 |
| 分享做法与成品（产品建议 G3、I2） | 技能包、工作流程、生成的插件导出成一个文件，导入时展示内容与权限；带出处的报告导出成文件。公开页和市场以后再谈 | 导出导入 3·C（技能包之后）；报告导出随 D4（3·E）；公开页不排（[暂缓项](deferred.md#section-8)） |

### 原 3.5 发布就绪

| 事项 | 去处 |
| --- | --- |
| 签名与公证（BL-021；产品建议 A1） | 1·F；2026-10-27 已定使用现有个人 Apple Developer 账号，凭据接入与发行物验证待实施 |
| 数据升级链与升级前自动备份（产品建议 A2、C-2），从各库的第 1 版起算。真实 Home 按用户 10-30 的决定清空重建、不迁移（旧 Home 整个搬开，不删），由你说「开始」；旧单曾列 BL-413 的 v8 → v9 迁移、BL-583 的目录改名与 BL-487 的 Sessions 清理。当前由 BL-928 做完整备份与干净重建，BL-413 接安装验收；BL-487 的副本清理保留单独授权，BL-157 已不在 BACKLOG | 重建随防腐收尾；升级链及其余按 [upgrade-continuity](../../upgrade-continuity/spec.md) 分八片，见[需求来源](requirements.md)里的「升级后持续可用怎样接进来」 |
| 运行条件：常驻、休眠后补跑、错过的怎样显示（产品建议 A5；BL-030、BL-645、BL-352） | 1·F |
| 对外许可口径（产品建议 A4，在官网仓库） | 0 |
| 原生组件随包预置与首次自检（产品建议 H14） | 2·F |
| 「需要你」的菜单栏角标与系统通知（产品建议 B3），连同 Attention 还没有的稍后提醒与定时唤醒（[attention-resumption](../../../docs/modules/attention-resumption.md)） | 2·F；Attention 那一半在 C 轨 |
| 兼容起点：M1 发出那天把版本、日期、提交写进 [合同变更流程](../../../docs/system/CONTRACT-CHANGES.md)，此后合同改动带读取兼容 | 2·F，随 M1 |
| 在别的应用里选中送进 Work：macOS App Intents、服务菜单、快捷指令（产品建议 F3） | 3·F |
| 本机诊断（C-5A，M1）：结构化脱敏日志、落盘／轮转、Node／Rust 崩溃捕获、发布符号与诊断包 | 26 核回防腐已交能力并补缺；56 验安装产物、真实崩溃／恢复与脱敏包；联网上报在服务端批 SRV-8，本机部分不等它 |
| 自动更新、定时在线备份、可选崩溃上报（M2；BL-115） | 服务端批 SRV-8（用户 2026-11-03 定整个移入）；桌面一侧由 F 轨落 |
| 经同意、存在本机的使用统计（产品建议 I9；BL-169），建在工作记录上 | 3·F |

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
| G 服务端 | 同步 Worker（`personal` 分支上的 `apps/sync-worker/`）、平台同步服务与团队协作服务（新的 `horizontal/` 包，见 C3 一行的用户决定）；各插件 Manifest 里的同步声明按规则 4 一起落；M2 的桌面一侧在 `apps/desktop/`，由 F 落（规则 7） | [服务端批](server-batch.md#server-batch)：同步合同、Worker、各插件接入、两台真电脑验收，团队协作与团队记忆，M2 的服务一侧；01～89 期间不开工 | 接着 `personal` 分支原来的会话做，合同由 C 轨评审；开工时间、部署和真实账号只能你办 |

[PAEXT]: https://github.com/molis-ai/molis-work/blob/bd6090ab468522ce57092e3d240e7e8254cd0b16/specs/proactive-assistant/spec.md
