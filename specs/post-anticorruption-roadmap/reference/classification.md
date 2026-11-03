# 需求类型与决策分类

[执行目录](../spec.md) · [Reference 分类](../spec.md#reference)

<a id="section-3-9"></a>

### 按类型与决策

多人分头做时，每一项先看这里：它属于哪几类，开工前有没有要人定的事。类型和决策标记的写法见[需求开发流程](development-workflow.md)第 1.2 节；跨几类的都标，主要的在前。「要决策」写的是开工前或某一片之前要定的事；做的过程中碰到预警情形（流程第 6 节），照样发预警。新需求立项时在这里加一行，做完删行。

| 节 | 需求 | 类型 | 决策 |
| --- | --- | --- | --- |
| 3.1 | 三份性能 spec（diff-frame、long-turn、attention-aggregate） | 体验与效果（性能） | 直接做：核对后归档 |
| 3.1 | [pr-review-remediation](../../pr-review-remediation/spec.md)、[repository-cleanup](../../repository-cleanup/spec.md) | 底层与架构 | 直接做：归档 |
| 3.1 | [status-ring-system](../../status-ring-system/spec.md) | 横向能力（公共组件）、体验与效果 | 要决策：视觉验收（你） |
| 3.1 | [plugin-tab-groups](../../plugin-tab-groups/spec.md) | 产品线（工作台） | 直接做：核对后归档 |
| 3.1 | 空列表新建、首页静默刷新与三份引导小 spec | 体验与效果、产品线（引导、Goals） | 要决策：待体验项你验收 |
| 3.1 | [issue-home-v0](../../issue-home-v0/spec.md) | 产品线（Issue 插件） | 直接做：BL-149 合入或关掉后归档 |
| 3.1 | [computer-use](../../computer-use/spec.md) | 产品线（助理） | 要决策：真机验收（你） |
| 3.1 | [ai-development-handbook](../../ai-development-handbook/spec.md) | 横向能力（AI 方法） | 要决策：BL-320 你验收 |
| 3.1 | [prologue-memory-strategy](../../prologue-memory-strategy/spec.md) | 横向能力（记忆）、底层与架构 | 要决策：恢复授权前不启动（原暂停） |
| 3.1 | 防腐线自己的四份 | 底层与架构 | 直接做：随防腐线收 |
| 3.1 | BACKLOG「待你验收」各条 | 跨线 | 要决策：你一次走完验收单 |
| 3.1 | 右栏选一段放进文稿 | 产品线（工作台）、横向能力（落点） | 要决策：下一个落点等实走后定 |
| 3.2 | [visual-ui-experience](../../visual-ui-experience/spec.md) | 体验与效果、横向能力（文案与按需帮助） | 要决策：本人验收；新增文案与帮助的界面定样 |
| 3.2 | [ai-input-receipts](../../ai-input-receipts/spec.md) | 产品线（助理）、横向能力（回执） | 直接做；阶段 6 各场景写小 spec 时再定 |
| 3.2 | [prologue-adoption](../../prologue-adoption/spec.md) | 横向能力（AI 运行时）、底层与架构 | 直接做：按换包窗口 |
| 3.2 | [ai-interaction-experience](../../ai-interaction-experience/spec.md) | 产品线（助理、各插件）、横向能力（卡片撤销合同） | 要决策：同排推荐看实物（BL-344） |
| 3.2 | [context-program](../../context-program/spec.md) 一组 | 产品线（工作台、各插件）、横向能力（落点、情境动作） | 要决策：W4 起各片的界面定样 |
| 3.2 | [assistant-service-connections](../../assistant-service-connections/spec.md) | 横向能力（服务接入）、产品线（助理） | 要决策：正式 OAuth 与真实账号（你办） |
| 3.2 | [coding-plugin 下一阶段](../../coding-plugin/next-requirements.md) | 产品线（Coding） | 直接做：Q1～Q8 已定 |
| 3.2 | 个人云同步 | 横向能力（同步）、底层与架构、产品线（同步） | 要决策：服务端批何时开工（[决策记录](decisions.md#section-7)第 24 项）；合入方式（第 13 项）；部署与账号（你办） |
| 3.2 | CGS 自媒体创作 | 产品线（场景：自媒体创作）、横向能力（技能包、场景组装） | 要决策：插件本体重做、改成场景组装还是放下（[决策记录](decisions.md#section-7)第 14 项），81 开工前定 |
| 3.3 | [unified-input-voice](../../unified-input-voice/spec.md) | 横向能力（输入组件）、产品线（助理、Coding、首页）、体验与效果 | 要决策：界面定样；其余 10-27 已定 |
| 3.3 | [skill-packs](../../skill-packs/spec.md) | 横向能力（技能包、合同） | 直接做 |
| 3.3 | [work-brief](../../work-brief/spec.md) | 产品线（首页与简报）、横向能力（公共来源与呈现） | 要决策：综合首页的界面定样 |
| 3.3 | [observation-collection](../../observation-collection/spec.md) | 横向能力（采集）、底层与架构 | 直接做：合同按 C1 排队 |
| 3.3 | 平台端到端效果评测 | 横向能力（评测） | 直接做 |
| 3.3 | [proactive-assistant](../../proactive-assistant/spec.md) | 产品线（助理）、横向能力（后台任务） | 要决策：交互切片的界面定样 |
| 3.3 | [coding-harness-optimization](../../coding-harness-optimization/spec.md) | 体验与效果（性能、可靠性）、产品线（Coding） | 直接做 |
| 3.3 | [agent-approval](../../agent-approval/spec.md) | 横向能力（授权与人审）、底层与架构 | 直接做：10-28 已对齐 |
| 3.3 | [subagent-interaction](../../subagent-interaction/spec.md) | 产品线（助理、Coding）、横向能力（Prologue 子代理） | 要决策：入口与动线的界面定样 |
| 3.3 | [coding-quality-assurance](../../coding-quality-assurance/spec.md)、[automation-recommender](../../automation-recommender/spec.md)、[code-modernization](../../code-modernization/spec.md) | 产品线（Coding） | 直接做 |
| 3.3 | [product-flow-governance](../../product-flow-governance/spec.md) | 跨线：体验与效果、横向能力（资料、目录、工作台） | 要决策：改变现行规则的整改 |
| 3.3 | [onboarding-coverage](../../onboarding-coverage/spec.md) | 产品线（引导）、横向能力（场景与设置） | 要决策：首日旅程的界面定样 |
| 3.3 | [font-and-skin-system](../../font-and-skin-system/spec.md) | 横向能力（外观与语言）、体验与效果 | 要决策：皮肤方向定样；资源／字体／额外语种与维护条件（第 23 项） |
| 3.3 | [risk-plugin](../../risk-plugin/spec.md) | 产品线（风险插件） | 要决策：总览与复查的高保真定样 |
| 3.3 | Skill、Context、MCP、Tool 四份 Prologue 策略 | 横向能力（AI 运行时） | 要决策：四份整体评审 |
| 3.3 | [intelligent-surfaces](../../intelligent-surfaces/spec.md) | 横向能力（呈现与组合）、产品线（工作台、助理） | 要决策：呈现形态定样；负责人 |
| 3.3 | [work-mainline](../../work-mainline/spec.md) | 产品线（工作台）、横向能力（主线服务） | 要决策：切换器的界面定样 |
| 3.4 | Sessions 重做 | 产品线（Sessions）、横向能力（会话历史与控制） | 要决策：会话交互与技术方案 |
| 3.4 | 首日旅程 | 产品线（引导） | 要决策：界面定样（随 onboarding-coverage） |
| 3.4 | [插件创作工作台升级](../../plugin-builder-upgrade/spec.md) | 产品线（创作台）、横向能力（场景组装） | 要决策：合同与交互（该 spec 第 7 节） |
| 3.4 | 团队协作首版 | 产品线（团队）、横向能力（同步与实时编辑）、底层与架构（身份与访问） | 要决策：服务端批何时开工（[决策记录](decisions.md#section-7)第 24 项）；协作协议与细粒度规则 |
| 3.4 | 团队记忆 | 产品线（团队）、横向能力（记忆） | 要决策：随服务端批开工；形成、融合与使用策略 |
| 3.4 | 分享做法与成品 | 横向能力（导出导入） | 直接做 |
| 3.5 | 签名与公证 | 产品线（发布） | 要决策：凭据接入（你办） |
| 3.5 | [升级后持续可用](../../upgrade-continuity/spec.md) U0～U7 与真实 Home 重建 | 底层与架构、横向能力、产品线（发布） | 升级链起点已定；要决策：真实 Home 重建由你说「开始」，更新／回退界面定样；具体门禁改动按开发流程处理 |
| 3.5 | 运行条件、原生组件预置、App Intents、使用统计 | 产品线（发布）、底层与架构 | 直接做 |
| 3.5 | 对外许可口径 | 产品线（发布） | 要决策：口径（你） |
| 3.5 | 菜单栏角标与系统通知 | 产品线（发布）、横向能力（Attention） | 要决策：界面定样 |
| 3.5 | 兼容起点 | 底层与架构 | 要决策：M1 的范围（[决策记录](decisions.md#section-7)第 18 项） |
| 3.5 | 本机诊断（M1） | 产品线（发布）、底层与架构 | 本机能力核回后补缺；日志端口沿 BL-812 决定，不等联网方案 |
| 3.5 | 自动更新、在线备份、崩溃上报（M2） | 产品线（发布）、底层与架构 | 要决策：服务端批何时开工（[决策记录](decisions.md#section-7)第 24 项）；账号与服务你办 |
| 3.6 | 体验债三批 | 体验与效果、产品线（各插件） | 直接做：独立片，照组件板已有控件改 |
| 3.7 | 散在各处的平台小项（不含下一行） | 横向能力、底层与架构 | 直接做；助理对外用词（H4）1·A 开工前要定 |
| 3.7 | 对抗式审查整治（R1～R8、N1～N56）与版本归一 | 底层与架构、横向能力 | 要决策：N12 文档记录协议归谁、N14 版本字段的合同、N3／N16 等当时没定的门禁、N47 由 Runtime 主人定、BL-880 的门禁改动；N34 复位 0.1.0 前你先删 GitHub 旧 release 与 tag；其余按台账已定的做 |
| 3.8 | BACKLOG 其余条目 | 按所在轨道 | 直接做：按轨道填空；工程流程由统筹做 |
