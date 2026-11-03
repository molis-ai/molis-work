# 需求来源与批次映射

[执行目录](../spec.md) · [Reference 分类](../spec.md#reference)

<a id="section-3"></a>
<a id="section-3-9"></a>

## 从原需求找到交付批次

这里只维护“原需求 → 批次”、类型和未决入口；实施顺序、逐项交付与前置只写在批次详情。类型用法见[开发手册 §1.2](development-workflow.md)。原需求书仍是行为与验收的依据，表中有去处不代表已实现。历史核查状态移到[基线与历史](baseline-and-history.md#source-status-history)。

<a id="section-3-1"></a>

### 核回、归档与待验收来源

| 原需求／来源 | 类型 | 对应批次 | 待决、暂停或验收边界 |
| --- | --- | --- | --- |
| [diff-frame-performance](../../diff-frame-performance/spec.md)、[long-turn-performance](../../long-turn-performance/spec.md)、[attention-aggregate-performance](../../attention-aggregate-performance/spec.md) | 体验与效果（性能） | [01](batches-01-02.md#batch-01) | 沿原需求与批次条件 |
| [pr-review-remediation](../../pr-review-remediation/spec.md) | 底层与架构 | [01](batches-01-02.md#batch-01) | 沿原需求与批次条件 |
| [repository-cleanup](../../repository-cleanup/spec.md) | 底层与架构 | [01](batches-01-02.md#batch-01) | 沿原需求与批次条件 |
| [status-ring-system](../../status-ring-system/spec.md) | 横向能力（公共组件）、体验与效果 | [01](batches-01-02.md#batch-01) | 本人视觉验收或明确委托 |
| [plugin-tab-groups](../../plugin-tab-groups/spec.md) | 产品线（工作台） | [01](batches-01-02.md#batch-01) | 沿原需求与批次条件 |
| [empty-goal-create](../../empty-goal-create/spec.md)、[quiet-home-refresh](../../quiet-home-refresh/spec.md)、[onboarding-intake-progress](../../onboarding-intake-progress/spec.md)、[onboarding-model-link](../../onboarding-model-link/spec.md)、[onboarding-folder-places](../../onboarding-folder-places/spec.md) | 体验与效果、产品线（引导、Goals） | [01](batches-01-02.md#batch-01) | 先核替代成果，未交付与待体验分别保留 |
| [issue-home-v0](../../issue-home-v0/spec.md) | 产品线（Issue 插件） | [01](batches-01-02.md#batch-01) | BL-149 去向核实后再归档 |
| [computer-use](../../computer-use/spec.md) | 产品线（助理） | [01](batches-01-02.md#batch-01) | BL-325 真机验收；BL-326／327 留 Backlog |
| [ai-development-handbook](../../ai-development-handbook/spec.md) | 横向能力（AI 方法） | [01](batches-01-02.md#batch-01)、[09](batches-03-27.md#batch-09) | BL-320 本人验收；ADH-23／BL-321 在 09 |
| 防腐线自己的四份：repository-anti-corruption、[plugin-project-database](../../plugin-project-database/spec.md)、[dual-instance-plugins](../../dual-instance-plugins/spec.md)、[plugin-project-partition](../../plugin-project-partition/spec.md) | 底层与架构 | [01](batches-01-02.md#batch-01) | 沿原需求与批次条件 |
| BACKLOG「待你验收」BL-001～017、105、109、111、320、325、400、401 | 跨线 | [01](batches-01-02.md#batch-01) | [决定 12](decisions.md#decision-12) |
| 右栏选一段放进文稿（产品建议 F1；#712、#720） | 产品线（工作台）、横向能力（落点） | [01](batches-01-02.md#batch-01) | 真实材料实走后再定下一个落点 |

<a id="memory-paused"></a>

**Memory 未完成且暂停。** [P0 形成、召回及 SDK 接入](../../prologue-memory-strategy/spec.md)不归入完成项；原负责人和暂停边界保留。对应 [24](batches-03-27.md#batch-24)、[31](batches-28-56.md#batch-31)、[63](batches-57-75.md#batch-63)，恢复授权前不启动，独立工作继续。原 PR 状态在历史快照中，开工时再核。

<a id="section-3-2"></a>

### 已有工作与后续余项

| 原需求／来源 | 类型 | 对应批次 | 待决、暂停或验收边界 |
| --- | --- | --- | --- |
| [visual-ui-experience](../../visual-ui-experience/spec.md)；VUX-16～18、VUX-33、VUX-35、VUX-51～59 | 体验与效果、横向能力（文案与按需帮助） | [03](batches-03-27.md#batch-03)、[10](batches-03-27.md#batch-10)、[16](batches-03-27.md#batch-16)、[27](batches-03-27.md#batch-27)、[40](batches-28-56.md#batch-40)、[55](batches-28-56.md#batch-55)、[56](batches-28-56.md#batch-56)、[75](batches-57-75.md#batch-75)、[82](batches-76-89.md#batch-82) | UI 定样与本人验收按原需求；性能缺口保留 |
| [ai-input-receipts](../../ai-input-receipts/spec.md)；BL-314、BL-315、BL-316、BL-317、BL-319、BL-148、BL-162、BL-318 | 产品线（助理）、横向能力（回执） | [32](batches-28-56.md#batch-32)、[52](batches-28-56.md#batch-52)、[63](batches-57-75.md#batch-63)、[88](batches-76-89.md#batch-88) | 沿原需求与批次条件 |
| [prologue-adoption](../../prologue-adoption/spec.md)；BL-309、BL-301、BL-302、BL-303、BL-307、BL-308、BL-306 | 横向能力（AI 运行时）、底层与架构 | [09](batches-03-27.md#batch-09)、[24](batches-03-27.md#batch-24)、[31](batches-28-56.md#batch-31)、[61](batches-57-75.md#batch-61)、[81](batches-76-89.md#batch-81) | 沿原需求与批次条件 |
| [ai-interaction-experience](../../ai-interaction-experience/spec.md)；BL-341、BL-343、BL-344、BL-345、BL-340、BL-342 | 产品线（助理、各插件）、横向能力（卡片撤销合同） | [11](batches-03-27.md#batch-11)、[52](batches-28-56.md#batch-52)、[65](batches-57-75.md#batch-65) | BL-344 看实物；其余按已定合同 |
| [context-program](../../context-program/spec.md) 及 [context-toolbar](../../context-toolbar/spec.md)、[quick-create](../../quick-create/spec.md)、[side-shelf](../../side-shelf/spec.md)；BL-330、BL-331、BL-332、BL-333、BL-174、BL-334、BL-335、BL-336、BL-337、BL-338、BL-339 | 产品线（工作台、各插件）、横向能力（落点、情境动作） | [45](batches-28-56.md#batch-45)、[52](batches-28-56.md#batch-52)、[54](batches-28-56.md#batch-54)、[68](batches-57-75.md#batch-68)、[88](batches-76-89.md#batch-88) | 沿原需求与批次条件 |
| [assistant-service-connections](../../assistant-service-connections/spec.md)（产品建议 A3）；ASC-38～44、BL-060、BL-062、BL-180、BL-181、BL-690 | 横向能力（服务接入）、产品线（助理） | [13](batches-03-27.md#batch-13)、[26](batches-03-27.md#batch-26)、[60](batches-57-75.md#batch-60)、[61](batches-57-75.md#batch-61) | 正式 OAuth、服务资格和真实账号只挡对应服务 |
| [coding-plugin 下一阶段](../../coding-plugin/next-requirements.md)；BL-050；Q1～Q8 已定，E2～E5／ACP 沿[暂缓项](deferred.md#section-8) | 产品线（Coding） | [12](batches-03-27.md#batch-12)、[33](batches-28-56.md#batch-33)、[35](batches-28-56.md#batch-35)、[53](batches-28-56.md#batch-53)、[64](batches-57-75.md#batch-64)、[65](batches-57-75.md#batch-65)、[66](batches-57-75.md#batch-66)、[83](batches-76-89.md#batch-83) | 沿原需求与批次条件 |
| 个人云同步（`personal` 分支上的 `specs/personal-cloud-sync/`、`plugin-sync-foundation/`、`personal-plugin-replication/` 等六份）；范围与旧分支状态在原需求，隔离分项通过不等于正式交付 | 横向能力（同步）、底层与架构、产品线（同步） | [SRV-1](server-batch.md#srv-1)、[SRV-2](server-batch.md#srv-2)、[SRV-5](server-batch.md#srv-5) | [决定 24](decisions.md#decision-24)、[决定 13](decisions.md#decision-13) |
| CGS 自媒体创作（`codex/cgs-formal-integration-20261013` 分支的 `specs/cgs-formal-integration/`） | 产品线（自媒体场景）、横向能力（技能包、场景组装） | [71](batches-57-75.md#batch-71)、[81](batches-76-89.md#batch-81) | [决定 14](decisions.md#decision-14) |

<a id="section-3-3"></a>

### 平台与产品需求

| 原需求／来源 | 类型 | 对应批次 | 待决、暂停或验收边界 |
| --- | --- | --- | --- |
| [unified-input-voice](../../unified-input-voice/spec.md) | 横向能力（输入组件）、产品线（助理、Coding、首页）、体验与效果 | [03](batches-03-27.md#batch-03)、[10](batches-03-27.md#batch-10)、[11](batches-03-27.md#batch-11)、[53](batches-28-56.md#batch-53) | 输入定样；H4 对外术语 |
| [skill-packs](../../skill-packs/spec.md) | 横向能力（技能包、合同） | [08](batches-03-27.md#batch-08)、[09](batches-03-27.md#batch-09)、[72](batches-57-75.md#batch-72) | 沿原需求与批次条件 |
| [work-brief](../../work-brief/spec.md) | 产品线（首页与简报）、横向能力（公共来源与呈现） | [15](batches-03-27.md#batch-15)、[19](batches-03-27.md#batch-19)、[37](batches-28-56.md#batch-37)、[51](batches-28-56.md#batch-51)、[63](batches-57-75.md#batch-63) | 综合首页定样 |
| [观测和采集层](../../observation-collection/spec.md) | 横向能力（采集）、底层与架构 | [21](batches-03-27.md#batch-21)、[28](batches-28-56.md#batch-28)、[29](batches-28-56.md#batch-29) | 沿原需求与批次条件 |
| [平台端到端效果评测](../../proactive-assistant/spec.md#14-molis-work-的端到端效果评测) | 横向能力（评测） | [21](batches-03-27.md#batch-21)、[30](batches-28-56.md#batch-30)、[62](batches-57-75.md#batch-62)、[75](batches-57-75.md#batch-75) | 沿原需求与批次条件 |
| [proactive-assistant](../../proactive-assistant/spec.md)及 [#1730 增量][PAEXT]（合入状态开工时核回） | 产品线（助理）、横向能力（后台任务） | [03](batches-03-27.md#batch-03)、[21](batches-03-27.md#batch-21)、[24](batches-03-27.md#batch-24)、[32](batches-28-56.md#batch-32)、[51](batches-28-56.md#batch-51)、[56](batches-28-56.md#batch-56)、[63](batches-57-75.md#batch-63)、[75](batches-57-75.md#batch-75) | 交互定样；Memory 暂停只挡相关能力 |
| [coding-harness-optimization](../../coding-harness-optimization/spec.md) | 体验与效果（性能、可靠性）、产品线（Coding） | [12](batches-03-27.md#batch-12)、[33](batches-28-56.md#batch-33)、[43](batches-28-56.md#batch-43)、[47](batches-28-56.md#batch-47)、[65](batches-57-75.md#batch-65)、[66](batches-57-75.md#batch-66)、[82](batches-76-89.md#batch-82)、[85](batches-76-89.md#batch-85) | 沿原需求与批次条件 |
| [agent-approval](../../agent-approval/spec.md) | 横向能力（授权与人审）、底层与架构 | [02](batches-01-02.md#batch-02)、[24](batches-03-27.md#batch-24)、[32](batches-28-56.md#batch-32)、[39](batches-28-56.md#batch-39)、[64](batches-57-75.md#batch-64)、[65](batches-57-75.md#batch-65) | 沿原需求与批次条件 |
| [subagent-interaction](../../subagent-interaction/spec.md) | 产品线（助理、Coding）、横向能力（Prologue 子代理） | [31](batches-28-56.md#batch-31)、[57](batches-57-75.md#batch-57)、[58](batches-57-75.md#batch-58) | 父子导航与直接对话定样 |
| [coding-quality-assurance](../../coding-quality-assurance/spec.md) | 产品线（Coding） | [65](batches-57-75.md#batch-65) | 沿原需求与批次条件 |
| [automation-recommender](../../automation-recommender/spec.md) | 产品线（Coding） | [39](batches-28-56.md#batch-39)、[60](batches-57-75.md#batch-60) | 沿原需求与批次条件 |
| [code-modernization](../../code-modernization/spec.md) | 产品线（Coding） | [84](batches-76-89.md#batch-84) | 沿原需求与批次条件 |
| [product-flow-governance](../../product-flow-governance/spec.md) | 跨线：体验与效果、横向能力（资料、目录、工作台） | [03](batches-03-27.md#batch-03)、[05](batches-03-27.md#batch-05)、[06](batches-03-27.md#batch-06)、[07](batches-03-27.md#batch-07)、[12](batches-03-27.md#batch-12)、[13](batches-03-27.md#batch-13)、[33](batches-28-56.md#batch-33)、[39](batches-28-56.md#batch-39)、[40](batches-28-56.md#batch-40)、[56](batches-28-56.md#batch-56) | 改变现行规则的整改沿原授权 |
| [onboarding-coverage](../../onboarding-coverage/spec.md) | 产品线（引导）、横向能力（场景与设置） | [04](batches-03-27.md#batch-04)、[12](batches-03-27.md#batch-12)、[13](batches-03-27.md#batch-13)、[20](batches-03-27.md#batch-20)、[33](batches-28-56.md#batch-33)、[35](batches-28-56.md#batch-35)、[36](batches-28-56.md#batch-36)、[37](batches-28-56.md#batch-37)、[38](batches-28-56.md#batch-38)、[43](batches-28-56.md#batch-43)、[44](batches-28-56.md#batch-44)、[45](batches-28-56.md#batch-45)、[56](batches-28-56.md#batch-56)、[72](batches-57-75.md#batch-72) | [决定 19](decisions.md#decision-19) |
| [font-and-skin-system](../../font-and-skin-system/spec.md) | 横向能力（外观与语言）、体验与效果 | [14](batches-03-27.md#batch-14)、[16](batches-03-27.md#batch-16)、[55](batches-28-56.md#batch-55)、[70](batches-57-75.md#batch-70) | [决定 23](decisions.md#decision-23) |
| [risk-plugin](../../risk-plugin/spec.md) | 产品线（风险插件） | [03](batches-03-27.md#batch-03)、[17](batches-03-27.md#batch-17)、[19](batches-03-27.md#batch-19) | 风险总览与复查定样 |
| [prologue-skill-strategy](../../prologue-skill-strategy/spec.md) | 横向能力（AI 运行时） | [41](batches-28-56.md#batch-41)、[42](batches-28-56.md#batch-42)、[61](batches-57-75.md#batch-61) | [决定 9](decisions.md#decision-9) |
| [prologue-context-strategy](../../prologue-context-strategy/spec.md) | 横向能力（AI 运行时） | [61](batches-57-75.md#batch-61) | [决定 9](decisions.md#decision-9) |
| [prologue-mcp-strategy](../../prologue-mcp-strategy/spec.md) | 横向能力（AI 运行时） | [60](batches-57-75.md#batch-60)、[61](batches-57-75.md#batch-61) | [决定 9](decisions.md#decision-9) |
| [prologue-tool-strategy](../../prologue-tool-strategy/spec.md) | 横向能力（AI 运行时） | [61](batches-57-75.md#batch-61) | [决定 9](decisions.md#decision-9)、[决定 16](decisions.md#decision-16) |
| [intelligent-surfaces](../../intelligent-surfaces/spec.md) | 横向能力（呈现与组合）、产品线（工作台、助理） | [03](batches-03-27.md#batch-03)、[05](batches-03-27.md#batch-05)、[15](batches-03-27.md#batch-15)、[52](batches-28-56.md#batch-52)、[62](batches-57-75.md#batch-62)、[63](batches-57-75.md#batch-63)、[67](batches-57-75.md#batch-67)、[75](batches-57-75.md#batch-75)、[82](batches-76-89.md#batch-82) | 呈现形态定样；归属沿原安排至明确交接 |
| [work-mainline](../../work-mainline/spec.md) | 产品线（工作台）、横向能力（主线服务） | [03](batches-03-27.md#batch-03)、[36](batches-28-56.md#batch-36)、[37](batches-28-56.md#batch-37)、[52](batches-28-56.md#batch-52)、[63](batches-57-75.md#batch-63)、[SRV-5](server-batch.md#srv-5) | 事项切换器定样 |

<a id="section-3-4"></a>

### 重做、场景与团队需求

同步与团队的模块入口：[同步复制](../../../docs/modules/sync-replication.md)、[身份与访问](../../../docs/modules/identity-team-access.md)；实现与覆盖开工时核回。

| 原需求／来源 | 类型 | 对应批次 | 待决、暂停或验收边界 |
| --- | --- | --- | --- |
| [Sessions 重做](../../sessions-rebuild/spec.md)（BL-177） | 产品线（Sessions）、横向能力（会话历史与控制） | [22](batches-03-27.md#batch-22)、[34](batches-28-56.md#batch-34)、[35](batches-28-56.md#batch-35)、[59](batches-57-75.md#batch-59) | [决定 11](decisions.md#decision-11) |
| 首日旅程（产品建议 A6、I1、I10） | 产品线（引导） | [04](batches-03-27.md#batch-04)、[44](batches-28-56.md#batch-44) | 并入 Onboarding，不另建需求 |
| [插件创作工作台升级](../../plugin-builder-upgrade/spec.md)（BL-377）；BL-010、035、306；BL-040、055、113、114、125、132、245、373、551、712 与 BL-341 的创作台部分 | 产品线（创作台）、横向能力（场景组装） | [03](batches-03-27.md#batch-03)、[46](batches-28-56.md#batch-46)、[47](batches-28-56.md#batch-47)、[67](batches-57-75.md#batch-67)、[71](batches-57-75.md#batch-71)、[72](batches-57-75.md#batch-72)、[76](batches-76-89.md#batch-76)、[77](batches-76-89.md#batch-77)、[81](batches-76-89.md#batch-81)、[82](batches-76-89.md#batch-82) | 原 spec §7 的合同与交互；原负责人保留 |
| [团队协作首版](../../team-collaboration/spec.md)（产品建议 I8；BL-071、BL-013） | 产品线（团队）、横向能力（同步与实时编辑）、底层与架构 | [SRV-1](server-batch.md#srv-1)、[SRV-3](server-batch.md#srv-3)、[SRV-4](server-batch.md#srv-4)、[SRV-6](server-batch.md#srv-6) | [决定 24](decisions.md#decision-24)、[决定 11](decisions.md#decision-11) |
| [团队记忆](../../team-memory/spec.md)（BL-022） | 产品线（团队）、横向能力（记忆） | [SRV-1](server-batch.md#srv-1)、[SRV-4](server-batch.md#srv-4)、[SRV-7](server-batch.md#srv-7) | [决定 24](decisions.md#decision-24)、[决定 11](decisions.md#decision-11)；所需 Memory 已具备且原暂停解除 |
| 分享做法与成品（产品建议 G3、I2） | 横向能力（导入导出） | [69](batches-57-75.md#batch-69)、[72](batches-57-75.md#batch-72) | 公开页与市场仍暂缓 |

<a id="section-3-5"></a>

### 发布与系统集成

发布原要求见 [C 端 M1／M2](../../repository-anti-corruption/c-end-readiness.md)，本表不另设发行门槛。

| 原需求／来源 | 类型 | 对应批次 | 待决、暂停或验收边界 |
| --- | --- | --- | --- |
| 签名与公证（BL-021；产品建议 A1） | 发布、系统能力 | [26](batches-03-27.md#batch-26)、[56](batches-28-56.md#batch-56) | 现有个人 Apple 账号已定，凭据与产物仍需验证 |
| [升级持续可用 U0～U7](../../upgrade-continuity/spec.md)；BL-413、BL-583、BL-487 随真实 Home 重建核回；BL-157 已移出 Backlog | 底层与架构、升级 | [02](batches-01-02.md#batch-02)、[05](batches-03-27.md#batch-05)、[25](batches-03-27.md#batch-25)、[26](batches-03-27.md#batch-26)、[56](batches-28-56.md#batch-56)、[72](batches-57-75.md#batch-72)、[SRV-8](server-batch.md#srv-8) | 真实 Home 重建另等原授权；升级起点已定 |
| 运行条件：常驻、休眠后补跑、错过的怎样显示（产品建议 A5；BL-030、BL-645、BL-352） | 发布、系统能力 | [25](batches-03-27.md#batch-25) | 沿原需求与批次条件 |
| 对外许可口径（产品建议 A4，在官网仓库） | 发布、系统能力 | [02](batches-01-02.md#batch-02) | 官网许可口径待定 |
| 原生组件随包预置与首次自检（产品建议 H14） | 发布、系统能力 | [26](batches-03-27.md#batch-26)、[53](batches-28-56.md#batch-53)、[56](batches-28-56.md#batch-56) | 沿原需求与批次条件 |
| 「需要你」的菜单栏角标与系统通知（产品建议 B3），连同 Attention 还没有的稍后提醒与定时唤醒（[attention-resumption](../../../docs/modules/attention-resumption.md)） | 发布、系统能力 | [55](batches-28-56.md#batch-55) | 通知定样 |
| [合同兼容起点](../../../docs/system/CONTRACT-CHANGES.md)：M1 外发时记录版本、日期与提交 | 发布、系统能力 | [26](batches-03-27.md#batch-26)、[56](batches-28-56.md#batch-56) | [决定 18](decisions.md#decision-18) |
| 在别的应用里选中送进 Work：macOS App Intents、服务菜单、快捷指令（产品建议 F3） | 发布、系统能力 | [74](batches-57-75.md#batch-74) | 沿原需求与批次条件 |
| 本机诊断（C-5A，M1）：结构化脱敏日志、落盘／轮转、Node／Rust 崩溃捕获、发布符号与诊断包 | 发布、系统能力 | [26](batches-03-27.md#batch-26)、[56](batches-28-56.md#batch-56) | BL-812 本机边界；不等联网方案 |
| 自动更新、定时在线备份、可选崩溃上报（M2；BL-115） | 发布、系统能力 | [SRV-8](server-batch.md#srv-8) | [决定 24](decisions.md#decision-24) |
| 经同意、存在本机的使用统计（产品建议 I9；BL-169），建在工作记录上 | 发布、系统能力 | [74](batches-57-75.md#batch-74) | 沿原需求与批次条件 |

<a id="section-3-6"></a>

### 体验债与插件小功能

| 原需求／来源 | 类型 | 对应批次 | 待决、暂停或验收边界 |
| --- | --- | --- | --- |
| [产品建议第一批](../../../docs/product-operations/产品优化建议.md)；Feed 失败提示露原码与两个提示框 BL-094、添加来源的按钮与默认源 BL-095、露内部值 BL-096、首次打开慢 BL-097、Inbox 刷新整页重画 BL-131、刷新失败少一句 BL-134、过程文字露内部标识与夹英文 BL-091、BL-103、窄屏面板盖住确认卡 BL-102、Jelly 日程被叫成文件 BL-092、搜索结果在指针下移动 BL-112、记忆开关的说明（产品建议 H23）、出网清单（H18）、灵光把「不可信」声明写在用户可改的指令里 BL-183、#784 QA 记录里还开着的 QA-029～034（#784 合入时把它新加的 BL 号改到不和现有的撞） | 体验与效果、产品线（各插件） | [27](batches-03-27.md#batch-27) | 沿原需求与批次条件 |
| [产品建议第二批](../../../docs/product-operations/产品优化建议.md)；按月/季/年重复（H10、J3）、在等的按人分组与等了几天（J2、J4）、Dataset 汇总行与追加行（H12、H21）、问卷存成数据表后自动追加（H15）、没连 TypeSafe 时的判断规则（H13）、Dataset 大数据性能（harness R9）、Shelf 轮盘与快捷键 BL-053、「以上期要求新建一期」（D1；先用现有能力连做两期，摩擦成立再做）、待办整理准确率的样本集（J1）、工作流的查询类步骤 BL-043、项目资料的旧 Office 格式与关窗不停下载 BL-397、BL-398 | 体验与效果、产品线（各插件） | [43](batches-28-56.md#batch-43)、[54](batches-28-56.md#batch-54) | 沿原需求与批次条件 |
| [产品建议第三批](../../../docs/product-operations/产品优化建议.md)；本机规则版脱敏（H9）、Gmail 附件与全文（H11、H19）、PPT 图片与图表（H16）、Pages 个人模板（H17）、YouTube 字幕（H20）、固定版之间的逐段差异（D6）、出处一路跟到底（D3）、材料变了哪些结论要重看（D2；先做 Cognia 内部的只读清单）、导出 Word 与按固定版导出（D4）、规划方法扩行业 BL-056 | 体验与效果、产品线（各插件） | [69](batches-57-75.md#batch-69) | 沿原需求与批次条件 |

<a id="section-3-7"></a>

### 平台小项与审查来源

| 来源 | 对应批次／条件 |
| --- | --- |
| 翻译：BL-118、BL-455～464、BL-545、BL-546、BL-567 | [16](batches-03-27.md#batch-16)、[55](batches-28-56.md#batch-55) |
| 写后检查：BL-160、BL-171、BL-220、BL-390，以及 BL-301～303 | [24](batches-03-27.md#batch-24)、[31](batches-28-56.md#batch-31) |
| Prologue 上游：BL-031、BL-137、BL-172、BL-173、BL-175、BL-176 | [31](batches-28-56.md#batch-31)、[61](batches-57-75.md#batch-61)；最近的实际换包窗口 |
| 记忆误记与默认：BL-037、BL-093 | [24](batches-03-27.md#batch-24)、[31](batches-28-56.md#batch-31)；[Memory 原暂停](#memory-paused) |
| 模型能力：BL-089、BL-104 | 沿“模型能力问题不打补丁”，不单独排 |
| [术语表](../../../docs/system/GLOSSARY.md) §5～6 的 R-A／R-B／R-C 与文档旧称 | [02](batches-01-02.md#batch-02)、[27](batches-03-27.md#batch-27)；R-A 按所在包改；R-B1～8 不做，R-B9 存量随真实 Home 重建、不迁移 |
| 助理对外用词（H4）：工作、工作简报、任务、受托工作、子工作 | [10](batches-03-27.md#batch-10)；实施前定并写术语表 |
| 工程流程：W2-16 与新成员从零上手（[并行开发 §12](../../../docs/system/PARALLEL-DEVELOPMENT.md)） | [02](batches-01-02.md#batch-02)；统筹负责，不占产品轨道 |
| [对抗式审查台账 R1～R8／N1～N56](../../../docs/reviews/adversarial-review-2026-11-01.md)、版本归一与重复调用整治 | [01](batches-01-02.md#batch-01)、[02](batches-01-02.md#batch-02)、[05](batches-03-27.md#batch-05)、[06](batches-03-27.md#batch-06)、[07](batches-03-27.md#batch-07)、[27](batches-03-27.md#batch-27)、[46](batches-28-56.md#batch-46)；N12／N14 先定主人／合同，N3／N16 等未定门禁仍待决；#1727 实际采用先核回，N56 与宿主首片同 PR；[PR 对照](requirement-prs.md#recent-requirement-prs) |

<a id="section-3-8"></a>

### BACKLOG 其余条目

保留编号用于核回；历史已交项先找实际成果，不重新实现。每项实现与验收仍由原需求及所在包负责。

| 来源组 | 条目 | 批次／条件 |
| --- | --- | --- |
| 随防腐线收 | BACKLOG §8 全部：BL-080、081、085、086、088、117、121～124、127、324、531、532、635、637～639、646、647、657、680、695；§5、§7 里挂着防腐切片或 PG 的：BL-072、130、136、178、375、378、381、382、386、500、505、507、508、520、522、525～527、530、550、568、575～577、579～582、584、586～589、616、617、619～623、625～628。其中 BL-130 随 W6-03 的 Skill 重写一起核 | [01](batches-01-02.md#batch-01)、[02](batches-01-02.md#batch-02) |
| A 助理与输入 | BL-033（确认卡与建议卡的 Tab 顺序）、BL-393（输入法用例，已随 T-044 做完）；BL-032（只说不做时续做一次）、BL-042（真实模型跑搜索）；BL-038（动态交互的待定参数）、BL-101（侧栏浏览器的输入） | [10](batches-03-27.md#batch-10)、[32](batches-28-56.md#batch-32)、[63](batches-57-75.md#batch-63) |
| B Coding | BL-246（问卷回执一闪而过）、BL-310～313（QA-009～012 的真实链路证明）、BL-540（判断一轮被切断的时间界限）；BL-051（子任务预算与重试）、BL-182（重试记成本人的补充）、BL-566（成果正文的读取边界）；BL-141（Coding 客户端翻译）随 16 的 C 段 | [12](batches-03-27.md#batch-12)、[16](batches-03-27.md#batch-16)、[33](batches-28-56.md#batch-33) |
| C 平台与 Prologue | BL-323（`remember` 待认可时的工具结果）、BL-367（插件 `stop` 钩子没有时限）、BL-569（安全不变量门禁漏扫 e2e 用例）、BL-392（Runtime 显示名散在几处）；BL-371（运行时能力加会话间发信，随子代理）、BL-034（没接的 Prologue 能力，按窗口清单逐项挑）；BL-052（五家原生 Agent 实操，随 Sessions 重做）、BL-166（技能包定制）、BL-128（引用声明的语义一致性，等你定） | [24](batches-03-27.md#batch-24)、[27](batches-03-27.md#batch-27)、[31](batches-28-56.md#batch-31)、[59](batches-57-75.md#batch-59)、[61](batches-57-75.md#batch-61) |
| D 外观与语言 | BL-041（无项目时没有搜索入口）、BL-138（窄问卷卡的标题）、BL-543（设置地址把查询参数原样带过去）、BL-544（侧视图插件框没加载完就能点）；BL-139（「开始」译成 Started）随 C 段 | [07](batches-03-27.md#batch-07)、[16](batches-03-27.md#batch-16)、[27](batches-03-27.md#batch-27) |
| E 插件 | BL-129（首页事项不分撤不回，随情境 W4）；BL-039（片段级动作只有四个插件提供，随 W5、W6） | [45](batches-28-56.md#batch-45)、[68](batches-57-75.md#batch-68) |
| F 首次使用与发布 | BL-106、BL-107（引导里的项目简介与后台继续，随 onboarding-coverage）、BL-108（MCP 启动器找不到 Home 的服务）；BL-110（桌面里管理项目导航卡住）、BL-126（维护六收尾核对，随真实 Home 维护） | [04](batches-03-27.md#batch-04)、[25](batches-03-27.md#batch-25)、[26](batches-03-27.md#batch-26)、[44](batches-28-56.md#batch-44)、[56](batches-28-56.md#batch-56) |
| 服务端批（[服务端批](server-batch.md#server-batch)） | BL-070（Outbox，随同步合同） | [SRV-1](server-batch.md#srv-1) |
| 工程流程（统筹） | BL-142、BL-143、BL-412（偶发失败的用例）、BL-565（共享核心 PR 的全量证据进 required CI）、BL-328（真实模型小评测的命令） | [02](batches-01-02.md#batch-02) |
| 11-03 补点名 | BL-880：07 随 Feed／工作台迁移，门禁决定只挡该片；BL-900：05 区分非持久编辑器字段与持久化结果合同后整理，原 R-B 不改决定保留；BL-925：仅第三个双实例插件出现时再评，见 [暂缓与条件项](deferred.md#section-8) | [05](batches-03-27.md#batch-05)、[07](batches-03-27.md#batch-07) |
| 11-02 补点名 | 随防腐线收（用户 10-30 定 PG-011、PG-017 的余项做完再关行）：BL-491、493、710、711、713、714，以及 PG-017 关行前要核的 BL-916；BL-701、910、915、918（沙箱包的可选权限、终端、卸载、生图上限），BL-812（平台包吞掉的错误）、BL-814（Runtime 动作调用的成本）、BL-901（插件包 `./contract` 的 API 快照）、BL-911（委托调用的受众）、BL-913（终端记录的坏值）；BL-692～694（外部集成，随服务接入收尾）；BL-912（Home 包在标签条上的图标）；BL-803、819、821（Goals 认本人、读坏时的报错） | [01](batches-01-02.md#batch-01)、[27](batches-03-27.md#batch-27)、[60](batches-57-75.md#batch-60)、[61](batches-57-75.md#batch-61) |

[PAEXT]: https://github.com/molis-ai/molis-work/blob/bd6090ab468522ce57092e3d240e7e8254cd0b16/specs/proactive-assistant/spec.md
