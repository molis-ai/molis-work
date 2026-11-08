# 需求来源与批次映射

[执行目录](../spec.md) · [参考分类](../spec.md#reference)

<a id="section-3"></a>
<a id="section-3-9"></a>

## 从原需求找到交付批次

这里只维护“原需求 → 批次”、类型和决策；实施顺序、逐项交付与前置以批次详情为准，同步、智能呈现、升级三段「怎样接进来」只说明各片落在哪条轨道。类型与决策（直接做／要决策：什么）的写法见[需求开发流程 §1.2](development-workflow.md#12-分类与决策)，每行都标；新需求立项时一起标。原需求书仍是行为与验收的依据，表中有去处不代表已实现。历史核查状态移到[基线与历史](baseline-and-history.md#source-status-history)。

<a id="section-3-1"></a>

### 核回、归档与待验收来源

[01 按最终主线逐项结算](batches/01.md#baseline-01)；[本人操作单](acceptance-01.md)。

| 原需求／来源 | 类型 | 对应批次 | 决策 |
| --- | --- | --- | --- |
| [diff-frame-performance](../../archive/diff-frame-performance/spec.md)、[long-turn-performance](../../archive/long-turn-performance/spec.md)、[attention-aggregate-performance](../../archive/attention-aggregate-performance/spec.md) | 体验与效果（性能） | [01](batches/01.md) | 已核对并归档 |
| [pr-review-remediation](../../archive/pr-review-remediation/spec.md) | 底层与架构 | [01](batches/01.md) | 已归档 |
| [repository-cleanup](../../archive/repository-cleanup/spec.md) | 底层与架构 | [01](batches/01.md) | 已归档 |
| [status-ring-system](../../archive/status-ring-system/spec.md) | 横向能力（公共组件）、体验与效果 | [01](batches/01.md) | 工程归档；本人看实物 BL-945 |
| [plugin-tab-groups](../../plugin-tab-groups/spec.md) | 产品线（工作台） | [01](batches/01.md) | 既有工程已合；现行合同及新增整合保留，PTG-10 待本人 |
| [empty-goal-create](../../archive/empty-goal-create/spec.md)、[quiet-home-refresh](../../archive/quiet-home-refresh/spec.md)、[onboarding-intake-progress](../../archive/onboarding-intake-progress/spec.md)、[onboarding-model-link](../../archive/onboarding-model-link/spec.md)、[onboarding-folder-places](../../archive/onboarding-folder-places/spec.md) | 体验与效果、产品线（引导、Goals） | [01](batches/01.md) | 五项均已承接并归档；BL-946～950 分开试 |
| [issue-home-v0](../../archive/issue-home-v0/spec.md) | 产品线（Issue 插件） | [01](batches/01.md) | BL-149 已随 #819 合入，已归档 |
| [computer-use](../../computer-use/spec.md) | 产品线（助理） | [01](batches/01.md) | 要决策：BL-325 真机验收（你）；BL-326／327 留 Backlog |
| [ai-development-handbook](../../ai-development-handbook/spec.md) | 横向能力（AI 方法） | [01](batches/01.md)、[09](batches/09.md) | 要决策：BL-320 你验收；ADH-23／BL-321 在 09 直接做 |
| 防腐线自己的四份：repository-anti-corruption、[plugin-project-database](../../archive/plugin-project-database/spec.md)、[dual-instance-plugins](../../archive/dual-instance-plugins/spec.md)、[plugin-project-partition](../../archive/plugin-project-partition/spec.md) | 底层与架构 | [01](batches/01.md) | 四份已归档，部分实现的余项仍在 BACKLOG |
| BACKLOG「待你验收」BL-001～017、105、109、111、320、325、400、401、929、940 及本批新增本人项 | 跨线 | [01](batches/01.md) | 按条件试；已接受、已委托和须等真实 Home 的项目单列 |
| [prologue-memory-strategy](../../prologue-memory-strategy/spec.md) | 横向能力（记忆）、底层与架构 | [24](batches/24.md)、[31](batches/31.md)、[63](batches/63.md) | 要决策：恢复授权前不启动（原暂停），见下 |
| 右栏选一段放进文稿（产品建议 F1；#712、#720） | 产品线（工作台）、横向能力（落点） | [01](batches/01.md) | 要决策：BL-952：真实材料和 QA-030 复验后再定下一个落点 |

<a id="memory-paused"></a>

**Memory 未完成且暂停。** [P0 形成、召回及 SDK 接入](../../prologue-memory-strategy/spec.md)不归入完成项；原负责人和暂停边界保留。对应 [24](batches/24.md)、[31](batches/31.md)、[63](batches/63.md)，恢复授权前不启动，独立工作继续。原 PR 状态在历史快照中，开工时再核。

<a id="section-3-2"></a>

### 已有工作与后续余项

| 原需求／来源 | 类型 | 对应批次 | 决策 |
| --- | --- | --- | --- |
| [visual-ui-experience](../../visual-ui-experience/spec.md)；VUX-16～18、VUX-33、VUX-35、VUX-51～59 | 体验与效果、横向能力（文案与按需帮助） | [03](batches/03.md)、[10](batches/10.md)、[16](batches/16.md)、[27](batches/27.md)、[40](batches/40.md)、[55](batches/55.md)、[56](batches/56.md)、[75](batches/75.md)、[82](batches/82.md) | 要决策：本人验收；新增文案与帮助的界面定样；性能缺口保留 |
| [ai-input-receipts](../../ai-input-receipts/spec.md)；BL-314、BL-315、BL-316、BL-317、BL-319、BL-148、BL-162、BL-318 | 产品线（助理）、横向能力（回执） | [32](batches/32.md)、[52](batches/52.md)、[63](batches/63.md)、[88](batches/88.md) | 直接做；阶段 6 各场景写小 spec 时再定 |
| [prologue-adoption](../../prologue-adoption/spec.md)；BL-309、BL-301、BL-302、BL-303、BL-307、BL-308、BL-306 | 横向能力（AI 运行时）、底层与架构 | [09](batches/09.md)、[24](batches/24.md)、[31](batches/31.md)、[61](batches/61.md)、[81](batches/81.md) | 直接做：按换包窗口 |
| [ai-interaction-experience](../../ai-interaction-experience/spec.md)；BL-341、BL-343、BL-344、BL-345、BL-340、BL-342 | 产品线（助理、各插件）、横向能力（卡片撤销合同） | [11](batches/11.md)、[52](batches/52.md)、[65](batches/65.md) | 要决策：同排推荐看实物（BL-344）；其余按已定合同直接做 |
| [context-program](../../context-program/spec.md) 及 [context-toolbar](../../context-toolbar/spec.md)、[quick-create](../../quick-create/spec.md)、[side-shelf](../../side-shelf/spec.md)；BL-330、BL-331、BL-332、BL-333、BL-174、BL-334、BL-335、BL-336、BL-337、BL-338、BL-339 | 产品线（工作台、各插件）、横向能力（落点、情境动作） | [45](batches/45.md)、[52](batches/52.md)、[54](batches/54.md)、[68](batches/68.md)、[88](batches/88.md) | 要决策：W4 起各片的界面定样 |
| [assistant-service-connections](../../assistant-service-connections/spec.md)（产品建议 A3）；ASC-38～44、BL-060、BL-062、BL-180、BL-181、BL-690 | 横向能力（服务接入）、产品线（助理） | [13](batches/13.md)、[26](batches/26.md)、[60](batches/60.md)、[61](batches/61.md) | 要决策：正式 OAuth 与真实账号（你办），只挡对应服务 |
| [coding-plugin 下一阶段](../../coding-plugin/next-requirements.md)；BL-050；Q1～Q8 已定，E2～E5／ACP 沿[暂缓项](deferred.md#section-8) | 产品线（Coding） | [12](batches/12.md)、[33](batches/33.md)、[35](batches/35.md)、[53](batches/53.md)、[64](batches/64.md)、[65](batches/65.md)、[66](batches/66.md)、[83](batches/83.md) | 直接做：Q1～Q8 已定 |
| 个人云同步（`personal` 分支上的 `specs/personal-cloud-sync/`、`plugin-sync-foundation/`、`personal-plugin-replication/` 等六份）；范围与旧分支状态在原需求，隔离分项通过不等于正式交付 | 横向能力（同步）、底层与架构、产品线（同步） | [SRV-1](batches/srv-1.md)、[SRV-2](batches/srv-2.md)、[SRV-5](batches/srv-5.md) | 要决策：服务端批何时开工（[决定 24](decisions.md#decision-24)）；合入方式（[决定 13](decisions.md#decision-13)）；部署与账号（你办） |
| CGS 自媒体创作（`codex/cgs-formal-integration-20261013` 分支的 `specs/cgs-formal-integration/`） | 产品线（自媒体场景）、横向能力（技能包、场景组装） | [71](batches/71.md)、[81](batches/81.md) | 要决策：插件本体重做、改成场景组装还是放下（[决定 14](decisions.md#decision-14)），81 开工前定 |

**个人云同步怎样接进来。** 它要服务端（账号、Worker、云上存储），和团队协作、团队记忆、M2 一起放进[服务端批](server-batch.md#server-batch)，排在 01～89 之后，开工时间由你定（用户 2026-11-03）。它和防腐收尾撞在同一处：同步适配写在各插件的存储上，而防腐线把插件的表改成 Manifest 声明（PG-020、PG-021）、Home 插件按项目分库、同一插件分出 Home 与项目两个实例。所以不把分支整个变基进来，而是按收尾后的形状重接，原来的适配和用例当参照：

1. SRV-1：拿当时的 main 对一遍分支，列出哪些适配还成立、哪些要重写；你定合入方式（[决定 13](decisions.md#decision-13)）。再与团队实时协作共同设计身份、对象版本、访问、并发与断线恢复，然后定个人同步合同，避免把整对象覆盖当作所有内容的协作语义。同步合同单独一个 PR——插件在 Manifest 里声明哪些表、哪些对象要同步，平台提供同步服务，不按插件名单接（插件同等待遇）；Outbox（BL-070）随它一起定。这时 M1 已经发出，同步声明按合同变更流程的过渡期加，带读取兼容。
2. SRV-2：平台同步服务、账号、Worker，加核心插件（Goals、待办、文稿、成果库）的声明。字体皮肤语言的切换已在 16 完成，声明直接按新格式写，不再有切换窗口。
3. SRV-5：其余插件的声明、整项目复制与回收、两台真电脑验收。部署正式 Worker、开真实账号只能你办。

完整个人同步也是团队产品的前置；批内的共同设计与关键协作验证不等个人同步全部交付：[sync-replication](../../../docs/modules/sync-replication.md) 和 [identity-team-access](../../../docs/modules/identity-team-access.md) 两个模块都还没有实现，团队那份副本要建在个人同步上（[重做、场景与团队需求](#section-3-4)）。

<a id="section-3-3"></a>

### 平台与产品需求

| 原需求／来源 | 类型 | 对应批次 | 决策 |
| --- | --- | --- | --- |
| [unified-input-voice](../../unified-input-voice/spec.md) | 横向能力（输入组件）、产品线（助理、Coding、首页）、体验与效果 | [03](batches/03.md)、[10](batches/10.md)、[11](batches/11.md)、[53](batches/53.md) | 要决策：界面定样；助理对外用词 H4 在 10 开工前定；其余 10-27 已定 |
| [skill-packs](../../skill-packs/spec.md) | 横向能力（技能包、合同） | [08](batches/08.md)、[09](batches/09.md)、[72](batches/72.md) | 直接做 |
| [work-brief](../../work-brief/spec.md) | 产品线（首页与简报）、横向能力（公共来源与呈现） | [15](batches/15.md)、[19](batches/19.md)、[37](batches/37.md)、[51](batches/51.md)、[63](batches/63.md) | 要决策：综合首页的界面定样 |
| [观测和采集层](../../observation-collection/spec.md) | 横向能力（采集）、底层与架构 | [21](batches/21.md)、[28](batches/28.md)、[29](batches/29.md) | 直接做：合同按 C1 排队 |
| [平台端到端效果评测](../../proactive-assistant/spec.md#14-molis-work-的端到端效果评测) | 横向能力（评测） | [21](batches/21.md)、[30](batches/30.md)、[62](batches/62.md)、[75](batches/75.md) | 直接做 |
| [proactive-assistant](../../proactive-assistant/spec.md)及 [#1730 增量][PAEXT]（合入状态开工时核回） | 产品线（助理）、横向能力（后台任务） | [03](batches/03.md)、[21](batches/21.md)、[24](batches/24.md)、[32](batches/32.md)、[51](batches/51.md)、[56](batches/56.md)、[63](batches/63.md)、[75](batches/75.md) | 要决策：交互切片的界面定样；Memory 暂停只挡相关能力 |
| [coding-harness-optimization](../../coding-harness-optimization/spec.md) | 体验与效果（性能、可靠性）、产品线（Coding） | [12](batches/12.md)、[33](batches/33.md)、[43](batches/43.md)、[47](batches/47.md)、[65](batches/65.md)、[66](batches/66.md)、[82](batches/82.md)、[85](batches/85.md) | 直接做 |
| [agent-approval](../../agent-approval/spec.md) | 横向能力（授权与人审）、底层与架构 | [02](batches/02.md)、[24](batches/24.md)、[32](batches/32.md)、[39](batches/39.md)、[64](batches/64.md)、[65](batches/65.md) | 直接做：10-28 已对齐 |
| [subagent-interaction](../../subagent-interaction/spec.md) | 产品线（助理、Coding）、横向能力（Prologue 子代理） | [31](batches/31.md)、[57](batches/57.md)、[58](batches/58.md) | 要决策：入口与动线（父子导航、直接对话）的界面定样 |
| [coding-quality-assurance](../../coding-quality-assurance/spec.md) | 产品线（Coding） | [65](batches/65.md) | 直接做 |
| [automation-recommender](../../automation-recommender/spec.md) | 产品线（Coding） | [39](batches/39.md)、[60](batches/60.md) | 直接做 |
| [code-modernization](../../code-modernization/spec.md) | 产品线（Coding） | [84](batches/84.md) | 直接做 |
| [product-flow-governance](../../product-flow-governance/spec.md) | 跨线：体验与效果、横向能力（资料、目录、工作台） | [03](batches/03.md)、[05](batches/05.md)、[06](batches/06.md)、[07](batches/07.md)、[12](batches/12.md)、[13](batches/13.md)、[33](batches/33.md)、[39](batches/39.md)、[40](batches/40.md)、[56](batches/56.md) | 要决策：改变现行规则的整改 |
| [onboarding-coverage](../../onboarding-coverage/spec.md) | 产品线（引导）、横向能力（场景与设置） | [04](batches/04.md)、[12](batches/12.md)、[13](batches/13.md)、[20](batches/20.md)、[33](batches/33.md)、[35](batches/35.md)、[36](batches/36.md)、[37](batches/37.md)、[38](batches/38.md)、[43](batches/43.md)、[44](batches/44.md)、[45](batches/45.md)、[56](batches/56.md)、[72](batches/72.md) | 要决策：首日旅程的界面定样；场景闭环是否拆分见[决定 19](decisions.md#decision-19) |
| [font-and-skin-system](../../font-and-skin-system/spec.md) | 横向能力（外观与语言）、体验与效果 | [14](batches/14.md)、[16](batches/16.md)、[55](batches/55.md)、[70](batches/70.md) | 要决策：皮肤方向定样；资源／字体与维护条件（[决定 23](decisions.md#decision-23)）；首批语种已定：只做中文和英文（[需求书 §12](../../font-and-skin-system/spec.md#12-决策记录)，2026-11-04） |
| [risk-plugin](../../risk-plugin/spec.md) | 产品线（风险插件） | [03](batches/03.md)、[17](batches/17.md)、[19](batches/19.md) | 要决策：总览与复查的高保真定样 |
| [prologue-skill-strategy](../../prologue-skill-strategy/spec.md) | 横向能力（AI 运行时） | [41](batches/41.md)、[42](batches/42.md)、[61](batches/61.md) | 要决策：四份策略整体评审（[决定 9](decisions.md#decision-9)） |
| [prologue-context-strategy](../../prologue-context-strategy/spec.md) | 横向能力（AI 运行时） | [61](batches/61.md) | 要决策：四份策略整体评审（[决定 9](decisions.md#decision-9)） |
| [prologue-mcp-strategy](../../prologue-mcp-strategy/spec.md) | 横向能力（AI 运行时） | [60](batches/60.md)、[61](batches/61.md) | 要决策：四份策略整体评审（[决定 9](decisions.md#decision-9)） |
| [prologue-tool-strategy](../../prologue-tool-strategy/spec.md) | 横向能力（AI 运行时） | [61](batches/61.md) | 要决策：四份策略整体评审（[决定 9](decisions.md#decision-9)）；引用声明的语义一致（[决定 16](decisions.md#decision-16)） |
| [intelligent-surfaces](../../intelligent-surfaces/spec.md) | 横向能力（呈现与组合）、产品线（工作台、助理） | [03](batches/03.md)、[05](batches/05.md)、[15](batches/15.md)、[52](batches/52.md)、[62](batches/62.md)、[63](batches/63.md)、[67](batches/67.md)、[75](batches/75.md)、[82](batches/82.md) | 要决策：呈现形态定样；负责人（沿原安排至明确交接） |
| [work-mainline](../../work-mainline/spec.md) | 产品线（工作台）、横向能力（主线服务） | [03](batches/03.md)、[36](batches/36.md)、[37](batches/37.md)、[52](batches/52.md)、[63](batches/63.md)、[SRV-5](batches/srv-5.md) | 要决策：切换器的界面定样 |

**字体、皮肤与语言分五段**（[实现方案](../../font-and-skin-system/implementation-plan.md) 第 11 节）：

| 段 | 做什么 | 去处 |
| --- | --- | --- |
| A 合同与共享文件工具 | 文件格式、文字引用、快照与资源协议进 UI 与插件合同；SDK `/ui` 与共享工具；从现有值提出完整的基线文件 | 1·D（合同先行，赶在 M1 之前） |
| B 基线与真实切片 | 宿主一侧、首屏、共同组件与规格板、Soft 与 Folio、字体，加一个插件的切片，在隔离 Home 的真实工作台上验 | 1·D（16）；方案里创作台那一片挪进创作台重做（阶段 4），因为创作台本轮不迁 |
| C 全入口与文案转换 | 现存插件、嵌入、稳定键、目录与状态、公开 SDK；各包分头准备，整合后一次切换 | 1·D（16）：B 段验完即一次切换（用户 2026-11-03 定前移，不按插件逐个切），翻译余项一起清；前提是防腐线的 PG-070、PG-071 已落；此后新入口直接按新格式写 |
| D 自定义与助理 | 编辑、导入、库、校验、预览、应用、撤销、恢复；助理的制作 Skill | 3·D |
| E 整体交付 | 全量回归、所有入口、发行物与手册；真实 Home 的存量维护（先备副本，动手前弹窗问） | 3·D 末 |

动作文字与结果摘要（FSS-40、FSS-41）你 10-23 定暂不实现。语言覆盖和翻译缺口记在该 spec 的 §6.1，随 C 段一起收。按实现方案 §12.2，14 先给资源登记／预算方案与实测节省，16 前确定 Folio 真实字体及分发依据；中英文完整覆盖（首批语种已定：只做中文和英文，[需求书 §12](../../font-and-skin-system/spec.md#12-决策记录)，2026-11-04），额外语种未指定就保留未指定，不能宣称完成。新增资源／门禁和真实 Home 文案转换分别沿原批准边界，70 核最终发行物；这些待决只暂停依赖的部分（[决定 23](decisions.md#decision-23)）。

**智能呈现怎样接进来。** 按 [intelligent-surfaces](../../intelligent-surfaces/spec.md) §13 的四片排，前两片只用确定组合，不等模型、技能包或采集：

1. **1·C1/C3/D/B/E，A 落对话那处**：
   - C1 在 05 先交呈现声明和组合服务的公开合同，在 Manifest 里自成一段声明（[轨道规则](tracks.md#section-5) 1）；作者和平台共用的声明校验工具放 SDK。14 的文字合同就绪后，C3 在 15 建独立 `horizontal/` 组合服务包，确定组合在该服务内完成，宿主只装配；服务先于本批各位置与插件消费者，均排在 M1 之前；
   - D 做名字片、行、卡片、速览四种形态与组件板「呈现形态」一节，和 Work Brief、基础首页要的公共呈现组件是同一套，与 1·C/D 那份公共来源／呈现一起设计，不做两套；
   - Goals、Inbox 的声明在 E，Coding 的声明在 B；
   - 对话里的对象引用由 A 落（规则 7）；项目讨论（`packages/im-ui`，不归任何轨道独占）和等你随 D 落。
2. **2·D/E，A 接决定请求与验收卡**：
   - D 做活卡、嵌入、证据链、交接卡、决定请求、验收卡，以及首页、Shelf 与插件之间的挂载位；
   - E 补 Pages、Dataset、待办、Feed、工作流程的声明；
   - 决定请求与验收卡接 2·C 的显式人审合同和个人助理的逐项交付与返工，由 A 接进对话；
   - 证据链读 2·C 接通的采集与历史；
   - 声明里的显示文字从第一片起就用 `ui.messages` 的稳定键，C 段切换窗口里 E 不改这些声明（规则 3）。
3. **3·C2/C3/A/E**：
   - C3 在 63 扩展 15 已有的组合服务，助理组合经 C2 的 `horizontal/agent-host` 调模型；不新开第二套组合服务或把确定组合搬回 SDK；
   - 跨插件与 MCP、Skill 的操作面要等技能包与 MCP、Tool 两份策略，并与 3·A 主动助理用同一份交付体验；
   - 外部 Agent 读到的文本形态随动作目录一起出；
   - 3·C 的端到端评测接住「呈现、采用、纠正」；
   - 其余插件的声明在 3·E 补完。
4. **3·D/E 到阶段 4**：
   - 生成插件与创作台声明呈现，要等创作台与生成插件迁到 Plugin Runtime（图中 PBR）；
   - 操作面保存成视图或生成页面，复用 2·C 的生成页面运行时；
   - 导出形态和创作台整体升级一起在阶段 4 收尾。

每片落完，按该 spec §14 的 IUI 编号验收；`[人工]` 几条在每片末尾的本人验收单里。

<a id="section-3-4"></a>

### 重做、场景与团队需求

同步与团队的模块入口：[同步复制](../../../docs/modules/sync-replication.md)、[身份与访问](../../../docs/modules/identity-team-access.md)；实现与覆盖开工时核回。

| 原需求／来源 | 类型 | 对应批次 | 决策 |
| --- | --- | --- | --- |
| [Sessions 重做](../../sessions-rebuild/spec.md)（BL-177） | 产品线（Sessions）、横向能力（会话历史与控制） | [22](batches/22.md)、[34](batches/34.md)、[35](batches/35.md)、[59](batches/59.md) | 要决策：会话交互与技术方案（[决定 11](decisions.md#decision-11)） |
| 首日旅程（产品建议 A6、I1、I10） | 产品线（引导） | [04](batches/04.md)、[44](batches/44.md) | 要决策：界面定样（并入 Onboarding，不另建需求） |
| [插件创作工作台升级](../../plugin-builder-upgrade/spec.md)（BL-377）；BL-010、035、306；BL-040、055、113、114、125、132、245、373、551、712 与 BL-341 的创作台部分 | 产品线（创作台）、横向能力（场景组装） | [03](batches/03.md)、[46](batches/46.md)、[47](batches/47.md)、[67](batches/67.md)、[71](batches/71.md)、[72](batches/72.md)、[76](batches/76.md)、[77](batches/77.md)、[81](batches/81.md)、[82](batches/82.md) | 要决策：合同与交互（该 spec 第 7 节）；原负责人保留 |
| [团队协作首版](../../team-collaboration/spec.md)（产品建议 I8；BL-071、BL-013） | 产品线（团队）、横向能力（同步与实时编辑）、底层与架构 | [SRV-1](batches/srv-1.md)、[SRV-3](batches/srv-3.md)、[SRV-4](batches/srv-4.md)、[SRV-6](batches/srv-6.md) | 要决策：服务端批何时开工（[决定 24](decisions.md#decision-24)）；协作协议与细粒度规则（[决定 11](decisions.md#decision-11)） |
| [团队记忆](../../team-memory/spec.md)（BL-022） | 产品线（团队）、横向能力（记忆） | [SRV-1](batches/srv-1.md)、[SRV-4](batches/srv-4.md)、[SRV-7](batches/srv-7.md) | 要决策：随服务端批开工（[决定 24](decisions.md#decision-24)）；形成、融合与使用策略（[决定 11](decisions.md#decision-11)）；所需 Memory 已具备且原暂停解除 |
| 分享做法与成品（产品建议 G3、I2） | 横向能力（导入导出） | [69](batches/69.md)、[72](batches/72.md) | 直接做；公开页与市场仍暂缓 |

<a id="section-3-5"></a>

### 发布与系统集成

发布原要求见 [C 端 M1／M2](../../archive/repository-anti-corruption/c-end-readiness.md)，本表不另设发行门槛。

| 原需求／来源 | 类型 | 对应批次 | 决策 |
| --- | --- | --- | --- |
| 签名与公证（BL-021；产品建议 A1） | 发布、系统能力 | [26](batches/26.md)、[56](batches/56.md) | 要决策：凭据接入（你办）；现有个人 Apple 账号已定 |
| [升级持续可用 U0～U7](../../upgrade-continuity/spec.md)；BL-413、BL-487 随真实 Home 重建核回；原 BL-581／583 的旧目录维护已随 2026-11-07 的整体备份与搬开完成；BL-157 已移出 Backlog | 底层与架构、升级 | [02](batches/02.md)、[05](batches/05.md)、[25](batches/25.md)、[26](batches/26.md)、[56](batches/56.md)、[72](batches/72.md)、[SRV-8](batches/srv-8.md) | 升级链起点已于 2026-11-07 登记；要决策：更新／回退界面定样；具体门禁改动按开发流程处理 |
| 运行条件：常驻、休眠后补跑、错过的怎样显示（产品建议 A5；BL-030、BL-645、BL-352） | 发布、系统能力 | [25](batches/25.md) | 直接做 |
| 对外许可口径（产品建议 A4，在官网仓库） | 发布、系统能力 | [02](batches/02.md) | [A4](decisions.md#policy-a4) 文案已合入官网 main。用户 11-04 决定，官网正式发布与线上验收留到产品完整开发后安排 |
| 原生组件随包预置与首次自检（产品建议 H14） | 发布、系统能力 | [26](batches/26.md)、[53](batches/53.md)、[56](batches/56.md) | 直接做 |
| 「需要你」的菜单栏角标与系统通知（产品建议 B3），连同 Attention 还没有的稍后提醒与定时唤醒（[attention-resumption](../../../docs/modules/attention-resumption.md)） | 发布、系统能力 | [55](batches/55.md) | 要决策：界面定样 |
| [合同兼容起点](../../../docs/system/CONTRACT-CHANGES.md)：M1 外发时记录版本、日期与提交 | 发布、系统能力 | [26](batches/26.md)、[56](batches/56.md) | 要决策：M1 的范围（[决定 18](decisions.md#decision-18)） |
| 在别的应用里选中送进 Work：macOS App Intents、服务菜单、快捷指令（产品建议 F3） | 发布、系统能力 | [74](batches/74.md) | 直接做 |
| 本机诊断（C-5A，M1）：结构化脱敏日志、落盘／轮转、Node／Rust 崩溃捕获、发布符号与诊断包 | 发布、系统能力 | [26](batches/26.md)、[56](batches/56.md) | 直接做：本机能力核回后补缺；日志端口沿 BL-812 决定，不等联网方案 |
| 自动更新、定时在线备份、可选崩溃上报（M2；BL-115） | 发布、系统能力 | [SRV-8](batches/srv-8.md) | 要决策：服务端批何时开工（[决定 24](decisions.md#decision-24)）；账号与服务你办 |
| 经同意、存在本机的使用统计（产品建议 I9；BL-169），建在工作记录上 | 发布、系统能力 | [74](batches/74.md) | 直接做 |

**升级后持续可用怎样接进来。** [upgrade-continuity](../../upgrade-continuity/spec.md) 承诺：装上新版本后，旧 Home、库、插件和保存的引用都接着能用。用户 11-02 同意，库的升级链从统一起点（真实 Home 清空重建、各库回到第 1 版）起算，不等 M1；动作与 Manifest 仍按[对抗式审查台账](../../../docs/reviews/adversarial-review-2026-11-01.md) N35 的决定，阶段一在原版本上直接改，从 M1 起开过渡期。分八片：

2026-11-05 一骏确认，[第 02 批③的版本归一与清理](batches/02.md#origin-reset-preflight)在隔离候选上立即实施和验证。真实 Home 的切换及 U0 起点仍按维护清单的现场前置登记。

1. **阶段 0（C1）——U0 规则。** 与版本归一、真实 Home 重建同一批，改合同变更流程 §3 第 4 条、`AGENTS.md`、c-end-readiness C-2 的起点。
2. **阶段 0 末到 1 前段，统一起点后第一次改库结构之前必须就位：**
   - **U1 升级链机制（C1，`packages/storage`）：** 宿主启动与打开库的那几处按规则 4 一起落；
   - **U2 金样 Home 与回放（C1 写回放，F 管发版留金样）：** 样本准备与 U1 设计可并行，实现由 C 轨写手按 storage 共用文件排队，门禁等 U1 合入后再打开。
3. **阶段 1 后段：**
   - **U3 按主人隔离、较新的库只拒绝这一个（C1 与 D）**；
   - **U4 插件声明升级段（C1）：** 走 Manifest 的合同快照排队，可延到阶段 2 前段。
4. **阶段 2，M1 之前就位：**
   - **U5 合同过渡期（C1；A、E 接各自的保存引用）：** M1 当天生效，可独立设计；实现与 U1～U4 按同一份合同快照排队；
   - **U6 演练与回退（F）：** M1 的前置，与签名公证同在 F 轨。
5. **阶段 3：**
   - U6 接自动更新（M2，服务端批 SRV-8）；
   - **U7 整份导出与导入（F 与 C1）：** 和引导的完整导入导出一起。

依赖：U0 → U1 → U3、U4、U6 → M1；U2 样本可与 U1 设计并行，回放依赖 U1；U5 没有等待 U1～U4 全部完成的功能依赖，但共享合同与实现不能并写，M1 前会合。换包窗口（规则 2）要先过金样回放；个人同步（服务端批）的协议要接受上一版客户端。

<a id="section-3-6"></a>

### 体验债与插件小功能

| 原需求／来源 | 类型 | 对应批次 | 决策 |
| --- | --- | --- | --- |
| [产品建议第一批](../../../docs/product-operations/产品优化建议.md)；Feed 失败提示露原码与两个提示框 BL-094、添加来源的按钮与默认源 BL-095、露内部值 BL-096、首次打开慢 BL-097、Inbox 刷新整页重画 BL-131、刷新失败少一句 BL-134、过程文字露内部标识与夹英文 BL-091、BL-103、窄屏面板盖住确认卡 BL-102、Jelly 日程被叫成文件 BL-092、搜索结果在指针下移动 BL-112、记忆开关的说明（产品建议 H23）、出网清单（H18）、灵光把「不可信」声明写在用户可改的指令里 BL-183、#784 QA 记录里还开着的 QA-029～034（#784 合入时把它新加的 BL 号改到不和现有的撞） | 体验与效果、产品线（各插件） | [27](batches/27.md) | 直接做：独立片，照组件板已有控件改 |
| [产品建议第二批](../../../docs/product-operations/产品优化建议.md)；按月/季/年重复（H10、J3）、在等的按人分组与等了几天（J2、J4）、Dataset 汇总行与追加行（H12、H21）、问卷存成数据表后自动追加（H15）、没连 TypeSafe 时的判断规则（H13）、Dataset 大数据性能（harness R9）、Shelf 轮盘与快捷键 BL-053、「以上期要求新建一期」（D1；先用现有能力连做两期，摩擦成立再做）、待办整理准确率的样本集（J1）、工作流的查询类步骤 BL-043、项目资料的旧 Office 格式与关窗不停下载 BL-397、BL-398 | 体验与效果、产品线（各插件） | [43](batches/43.md)、[54](batches/54.md) | 直接做：独立片，照组件板已有控件改 |
| [产品建议第三批](../../../docs/product-operations/产品优化建议.md)；本机规则版脱敏（H9）、Gmail 附件与全文（H11、H19）、PPT 图片与图表（H16）、Pages 个人模板（H17）、YouTube 字幕（H20）、固定版之间的逐段差异（D6）、出处一路跟到底（D3）、材料变了哪些结论要重看（D2；先做 Cognia 内部的只读清单）、导出 Word 与按固定版导出（D4）、规划方法扩行业 BL-056 | 体验与效果、产品线（各插件） | [69](batches/69.md) | 直接做：独立片，照组件板已有控件改 |

<a id="section-3-7"></a>

### 平台小项与审查来源

| 来源 | 对应批次／条件 | 决策 |
| --- | --- | --- |
| 翻译：BL-118、BL-455～457、BL-459～464、BL-545、BL-546、BL-567 | [16](batches/16.md)、[55](batches/55.md) | 直接做 |
| 写后检查：BL-160、BL-171、BL-220、BL-390，以及 BL-301～303 | [24](batches/24.md)、[31](batches/31.md) | 直接做 |
| Prologue 上游：BL-031、BL-137、BL-172、BL-173、BL-175、BL-176 | [31](batches/31.md)、[61](batches/61.md)；最近的实际换包窗口 | 直接做 |
| 记忆误记与默认：BL-037、BL-093 | [24](batches/24.md)、[31](batches/31.md)；[Memory 原暂停](#memory-paused) | 直接做 |
| 模型能力：BL-089、BL-104 | 沿“模型能力问题不打补丁”，不单独排 | 直接做 |
| [术语表](../../../docs/system/GLOSSARY.md) §5～6 的 R-A／R-B／R-C 与文档旧称 | [02](batches/02.md)、[27](batches/27.md)；R-A 按所在包改；R-B1～8 不做，R-B9 存量随真实 Home 重建、不迁移 | 直接做 |
| 助理对外用词（H4）：工作、工作简报、任务、受托工作、子工作 | [10](batches/10.md)；实施前定并写术语表 | 要决策：用词在 10 开工前定，写进术语表 |
| 工程流程：W2-16 与新成员从零上手（[并行开发 §12](../../../docs/system/PARALLEL-DEVELOPMENT.md)） | [02](batches/02.md)；统筹负责，不占产品轨道 | 直接做：统筹做 |
| [对抗式审查台账 R1～R8／N1～N56](../../../docs/reviews/adversarial-review-2026-11-01.md)、版本归一与重复调用整治 | [01](batches/01.md)、[02](batches/02.md)、[05](batches/05.md)、[06](batches/06.md)、[07](batches/07.md)、[27](batches/27.md)、[46](batches/46.md)、[55](batches/55.md)（N22 余片）；N12／N14 先定主人／合同，N3／N16 范围已定，分别在 27／06 实施；#1727 实际采用先核回，N56 与宿主首片同 PR；[PR 对照](requirement-prs.md#recent-requirement-prs) | 要决策：N12 文档记录协议归谁、N14 版本字段的合同、N47 由 Runtime 主人定、BL-880 的门禁改动；N34 复位 0.1.0 前你先删 GitHub 旧 release 与 tag；其余按台账已定的做 |

<a id="section-3-8"></a>

### BACKLOG 其余条目

保留编号用于核回；历史已交项先找实际成果，不重新实现。每项实现与验收仍由原需求及所在包负责。决策：直接做，按轨道填空；工程流程由统筹做；BL-128 要你定（[决定 16](decisions.md#decision-16)）。

| 来源组 | 条目 | 批次／条件 |
| --- | --- | --- |
| 随防腐线收 | BACKLOG §8 全部：BL-080、081、085、086、088、117、121～124、127、324、531、532、635、637～639、646、647、657、680、695；§5、§7 里挂着防腐切片或 PG 的：BL-072、130、136、178、375、378、381、382、386、500、505、507、508、520、522、525～527、530、550、568、575～577、579～582、584、586～589、616、617、619～623、625～628。其中 BL-130 随 W6-03 的 Skill 重写一起核；11-03 新加进 §8 的 BL-927、928、930～944 与 §1 的 BL-929 同样在内，逐条去处写在 [02](batches/02.md) 第 1、3 项 | [01](batches/01.md)、[02](batches/02.md) |
| A 助理与输入 | BL-033（确认卡与建议卡的 Tab 顺序）、BL-393（输入法用例，已随 T-044 做完）；BL-032（只说不做时续做一次）、BL-042（真实模型跑搜索）；BL-038（动态交互的待定参数）、BL-101（侧栏浏览器的输入） | [10](batches/10.md)、[32](batches/32.md)、[63](batches/63.md) |
| B Coding | BL-246（问卷回执一闪而过）、BL-310～313（QA-009～012 的真实链路证明）、BL-540（判断一轮被切断的时间界限）；BL-051（子任务预算与重试）、BL-182（重试记成本人的补充）、BL-566（成果正文的读取边界）；BL-141（Coding 客户端翻译）已做（11-04 提前作为 B 轨真缺陷做掉，键仍是现行的 `coding.*`，16 的 C 段照常一起切换） | [12](batches/12.md)、[16](batches/16.md)、[33](batches/33.md) |
| C 平台与 Prologue | BL-323（`remember` 待认可时的工具结果）、BL-367（插件 `stop` 钩子没有时限）、BL-569（安全不变量门禁漏扫 e2e 用例）、BL-392（Runtime 显示名散在几处）；BL-371（运行时能力加会话间发信，随子代理）、BL-034（没接的 Prologue 能力，按窗口清单逐项挑）；BL-052（五家原生 Agent 实操，随 Sessions 重做）、BL-166（技能包定制）、BL-128（引用声明的语义一致性，等你定） | [24](batches/24.md)、[27](batches/27.md)、[31](batches/31.md)、[59](batches/59.md)、[61](batches/61.md) |
| D 外观与语言 | BL-041（无项目时没有搜索入口）、BL-138（窄问卷卡的标题）、BL-543（设置地址把查询参数原样带过去）、BL-544（侧视图插件框没加载完就能点）；BL-139（「开始」译成 Started）随 C 段 | [07](batches/07.md)、[16](batches/16.md)、[27](batches/27.md) |
| E 插件 | BL-129（首页事项不分撤不回，随情境 W4）；BL-039（片段级动作只有四个插件提供，随 W5、W6） | [45](batches/45.md)、[68](batches/68.md) |
| F 首次使用与发布 | BL-106、BL-107（引导里的项目简介与后台继续，随 onboarding-coverage）、BL-108（MCP 启动器找不到 Home 的服务）；BL-110（桌面里管理项目导航卡住）、BL-126（维护六收尾核对，随真实 Home 维护） | [04](batches/04.md)、[25](batches/25.md)、[26](batches/26.md)、[44](batches/44.md)、[56](batches/56.md) |
| 服务端批（[服务端批](server-batch.md#server-batch)） | BL-070（Outbox，随同步合同） | [SRV-1](batches/srv-1.md) |
| 工程流程（统筹） | BL-142、BL-143、BL-412（偶发失败的用例）、BL-565（共享核心 PR 的全量证据进 required CI）、BL-328（真实模型小评测的命令） | [02](batches/02.md) |
| 11-03 补点名 | BL-880：Feed 投影随 #1725 迁回插件，门禁改动用户 2026-11-04 确认接受，07-3 已完成；BL-900：05 区分非持久编辑器字段与持久化结果合同后整理，原 R-B 不改决定保留；BL-925：仅第三个双实例插件出现时再评，见 [暂缓与条件项](deferred.md#section-8) | [05](batches/05.md)、[07](batches/07.md) |
| 11-03 补点名（连接器与门禁） | BL-914（安全不变量门禁核对「代码」列点名的文件存在、证据片段出现在点名的测试里，与 BL-569 同片）、BL-919（Feed 的测试夹具与 e2e 改按记录绑定驱动账号来源，只动测试）、BL-920（连接用途报告显示插件名、槽的用途说明和项目名）：27；BL-917（Feed 的目录连接器账号来源，如 Notion）：60，随服务矩阵先定哪些连接器能按来源拉取 | [27](batches/27.md)、[60](batches/60.md) |
| 11-02 补点名 | PG-011、PG-017 的 BL-491、493、710～714、916 已在 01 [核回](batches/01.md#baseline-01)；BL-814 已在 02 [核回夜间耗时](batches/02.md#r72-timing)；另有未完成的BL-701、910、915、918（沙箱包的可选权限、终端、卸载、生图上限），BL-812（平台包吞掉的错误）、BL-901（插件包 `./contract` 的 API 快照）、BL-911（委托调用的受众）、BL-913（终端记录的坏值）；BL-692～694（外部集成，随服务接入收尾）；BL-912（Home 包在标签条上的图标）；BL-803、819、821（Goals 认本人、读坏时的报错） | [01](batches/01.md)、[27](batches/27.md)、[60](batches/60.md)、[61](batches/61.md) |

[PAEXT]: https://github.com/molis-ai/molis-work/blob/bd6090ab468522ce57092e3d240e7e8254cd0b16/specs/proactive-assistant/spec.md
