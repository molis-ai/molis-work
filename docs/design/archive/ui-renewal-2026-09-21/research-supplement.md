# 历史参照补充：8 个界面与工作机制

核对日期：2026-09-21。补齐历史竞品任务早期出现的 Beads、Task Master、OpenSpec、GSD、Claude Code、Vibe Kanban、Notion、ClickUp。本文依照当前官方源码与文档，研究可见交互和工作机制；没有登录这些产品完成真实任务，产品实操均为 `UNVERIFIED`。

这组参照最有价值的共同点是：让人知道“现在是什么状态、为什么轮到这一步、从哪里继续、如何查看结果”。文件按来源分组，设计取舍统一进入[主方案](proposal.md)：Beads/GSD 参与首页接续，OpenSpec 参与变化判断，Vibe Kanban 参与版本审阅，Notion 参与保留现场的查看方式。前四个主要是 CLI、Agent 工作流或规格工具，不强行作视觉比较。以下“为什么”与 Molis 借鉴点是设计推断，不是经过用户研究确认的动机。

## 1. Beads：把“可做的事”从全部任务中分离

**类型与当前依据。** Agent 使用的结构化任务及依赖工具。旧官方仓库 `steveyegge/beads` 当前重定向至 [gastownhall/beads](https://github.com/gastownhall/beads)。研究依据为该仓库 README；其中列出的社区 UI 不代表统一的官方视觉产品。

**交互机制。** `bd ready` 列出没有未完成阻塞项的工作；`bd show` 查看单项细节与审计记录；认领、关闭任务会影响后续可执行队列。主要入口是面向动作的命令，而非一个把所有任务平铺的首页。[官方 README](https://github.com/gastownhall/beads)

**可吸收。** Molis 的“接下来”可以是有理由的候选队列：每项同时说明“依赖已满足”“等待某项结果”或“需要你决定”。详细关系按需展开，不默认把依赖图铺满主页面。这有助于用户直接决定下一步，并保留追问理由的入口。

**限制。** “没有依赖阻塞”不能等同已授权执行；关闭任务也不能等同用户验收。只借鉴 ready 队列与解释方式，不新增另一份任务事实源。

## 2. Task Master：同一个任务可以从对话与列表进入

**类型与当前依据。** 面向开发 Agent 的任务拆解及管理工具；[官方仓库](https://github.com/eyaltoledano/claude-task-master) 当前 README 的产品与文档入口已指向 Hamster，不能沿用旧资料把新品牌入口描述为另一个已验证产品。

**交互机制。** 用户可在编辑器对话中请求解析 PRD、找下一项、展开任务或查看指定 ID；CLI 同时提供 `list`、`next`、`show`、`parse-prd` 等入口。复杂任务可以先拆解，单项内容再按需展开。[官方 README 与示例](https://github.com/eyaltoledano/claude-task-master)

**可吸收。** 对话中提到的 Goal 应与列表里的 Goal 保持同一身份：点名称进入对象详情，回来仍保留原对话位置。“建议下一步”应链接具体工作及理由，允许用户直接调整，而非再生成一篇计划。复杂度逐层展开，避免首页出现整棵执行树。

**限制。** 自动拆解是草稿，不能默默替代目标范围；普通小任务无需强制 PRD 流程。这里没有验证 Hamster 的实际界面或完整商业工作流。

## 3. OpenSpec：区分生效中的规格与正在提出的变化

**类型与当前依据。** 规格与变更产物驱动的 Agent 工作流。当前 [官方仓库](https://github.com/Fission-AI/OpenSpec) 默认引导使用 `explore`、`propose`、`apply`、`archive`；不要只按早期更细碎的命令流程设计 Molis。

**交互机制。** 提案组织“为什么改、改什么”，规格表达要求与场景，设计记录做法，任务承接执行；完成后归档变更并更新规格。它通过可阅读产物串联讨论与实施，而不只依赖聊天记忆。[官方 README](https://github.com/Fission-AI/OpenSpec)、[官网](https://openspec.dev/)

**可吸收。** Goal 中可以并排呈现“当前要求”与“待确认变化”；先看改变了什么、影响哪些成果，再进入细节。变更不应淹没在活动时间线中。用户返回工作时，立即分辨哪些要求已经生效、哪些仍是建议。

**限制。** 归档是文档状态，不自动证明结果被接受。Molis 应连接现有规格与事件，不为这个视觉方案额外建立完整的规格管理系统。本文没有核实其 Dashboard 交互，不据 README 中名称推断成熟 UI。

## 4. GSD：把“回来继续”做成明确入口

**类型与当前依据。** 编码 Agent 的规划与执行工作流；当前官方仓库为 [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done)。分析依据为 [当前用户指南](https://github.com/gsd-build/get-shit-done/blob/main/docs/USER-GUIDE.md)。

**交互机制。** 讨论、计划、执行、验证有对应命令；项目、需求、路线图、状态分别保存，状态包括决策、阻塞与会话信息。`progress` 提供位置与后续动作，`resume-work` 恢复上下文，`quick` 为临时任务提供较短路径。验证环节含用户验收式检查。[官方用户指南](https://github.com/gsd-build/get-shit-done/blob/main/docs/USER-GUIDE.md)

**可吸收。** 用户重新打开一个 Goal 时，先看到简短续接信息：“上次做到哪里、发生了什么变化、当前阻塞、建议继续什么”，旁边保留成果与原始过程入口。它解决的是跨天、跨 Session 的恢复成本，不需要把全部历史重新读一遍。

**限制。** 不将编码阶段强加给所有知识工作；阶段走完不代表目标完成。建议下一步与实际触发运行分开，也不引入第二套 `.planning` 文件来复制 Molis 的状态。

## 5. Claude Code：控制权、过程与结果各有明确入口

**类型与当前依据。** 终端交互为主的编码 Agent。本项研究当前官方文档中的交互约定，不把终端外观作为 Molis 的视觉目标。

**交互机制。** 界面区分任务清单和后台运行项；用户可以中断当前工作、观察权限模式、回看差异以及恢复会话。当前快捷键与模式行为应以 [交互模式文档](https://code.claude.com/docs/en/interactive-mode) 为准，而非机械照搬历史版本的 Esc 行为。

**可吸收。** “准备做什么”“正在运行什么”“产生了什么结果”应分别可见。运行中的控制按钮放在对应运行旁；用户返回时先读简短回顾，成果进入独立审阅面。对于 Molis，AgentRun 的运行情况不应覆盖 Goal 的业务状态。

**限制。** 回退能力必须说清范围：Claude Code 的 checkpoint 主要跟踪直接编辑工具造成的文件改动，不覆盖所有 Bash 引发的外部影响。[Checkpointing 文档](https://code.claude.com/docs/en/checkpointing) Molis 不能因此承诺“任何 Agent 动作都能撤销”，也不应把查看详情变成自动重跑。

## 6. Vibe Kanban：任务、执行尝试、代码审阅彼此关联但不是同一物

**类型与当前状态。** 编码 Agent 的可视化编排与审阅工作台。核对时 [官网](https://vibekanban.com/) 明确公告项目正在 sunset，并将继续作为开源、社区维护项目；因此本次将它作为交互机制参照，不据旧材料宣称其商业服务仍按原路线持续运营。

**交互机制。** 任务看板进入工作区；工作区关联 Agent 对话与变更审阅。变更面提供文件树、diff 和行内评论；评论可收集后统一交给 Agent。一次任务可以创建新的执行尝试，选择不同 Agent 或配置，同时保留原尝试的上下文。[Changes 文档](https://vibekanban.com/docs/workspaces/changes)、[审阅代码](https://vibekanban.com/docs/reviewing-code)、[新建执行尝试](https://vibekanban.com/docs/core-features/new-task-attempts)

**可吸收。** Molis 可以在 Goal 下展示多次 AgentRun；用户先看本次成果，再沿评论回到确切的问题位置。重试按钮应清楚表达“创建新尝试”，而非让旧结果看似被覆盖。把相关修改意见汇总后继续执行，有助于减少人来回切换上下文。

**限制。** Agent 从运行变为空闲不等于 Goal 完成；代码合并也不是所有业务的验收模式。本文没有验证其当前安装版与云端迁移行为，旧文档的自动状态变化不能作为完整现状保证。

## 7. Notion：同一内容的多种视图，以及保持原位的详情

**类型与当前依据。** 文档与数据库工作空间，作为内容交互成熟参照。数据库的多种视图共享内容，但布局、排序、筛选、分组和显示属性可各自设置。[Views, filters and sorts](https://www.notion.com/en-gb/help/views-filters-and-sorts)

**交互机制。** 记录本身是页面；详情可通过 side peek、center peek 或完整页面打开。侧边展开时用户仍能操作原数据库，让列表扫描与深读彼此衔接。[数据库介绍](https://www.notion.com/help/intro-to-databases)

**可吸收。** Molis 的 Goal、成果和来源可以保留稳定身份，在主页、列表和关联处打开同一详情。短暂核查用侧边预览，持续编辑再进入完整页面；返回时保存选择与滚动位置。常规内容优先，动作在悬停或键盘聚焦时逐步显露。

**限制。** 不把所有工作都变成自由配置数据库；用户需要明确的工作对象和责任语义。可编辑的状态属性也不等于执行证据。Notion 的普及只能支持“可能熟悉”的假设，不能替代 Molis 用户测试。

## 8. ClickUp：在工作对象旁找人、记录与关联

**类型与当前依据。** 综合工作管理平台。当前任务的可折叠右侧栏集中承接评论与活动、关系、外部链接和引用等；未读计数帮助返回时定位新内容。[Tasks right sidebar](https://help.clickup.com/hc/en-us/articles/35041742373015-Tasks-right-sidebar)

**交互机制。** Agent 可在 Chat 中通过提及或私信触发；当前文档区分作为伙伴交互的 Super Agents 和依触发条件执行的 Autopilot Agents。Agent 私信头部可以打开侧栏档案，回复线程支持重试。[Agents in Chat](https://help.clickup.com/hc/en-us/articles/37131966192151-Use-ClickUp-Agents-in-Chat)

**可吸收。** Goal 的辅助信息放到按需展开的区域；评论、来源、运行与成果从具体对象进入，不要求用户先去全局找一遍。Agent 名称可点开职责与来源，但 Agent 档案无需占满主内容。提醒应回答“需要我做什么”，而不只是聚合数量。

**限制。** 大量侧栏页签和全局模块会增加查找成本，应按当前对象相关性收敛。Molis 当前本地版不能用虚构头像、权限或团队消息造成已具备团队系统的错觉；团队交互保留为未来能力。

## 对本次设计方案的直接约束

1. **首页面向继续工作。** 优先回答待决策、待审阅、被阻塞和可继续的事项；每个建议能解释来源。不要把全部任务、全部运行和全部消息平权堆叠。
2. **身份与状态保持清楚。** Goal 是工作目标，AgentRun 是一次运行，成果是可审阅对象；不能因本次运行结束就把目标标记完成。
3. **详情让人保留位置。** 支持短暂预览与持续阅读两个层级；返回后不用重新找原条目。侧栏不是同时塞入所有辅助信息的理由。
4. **变更与恢复可见。** 先显示当前有效要求、未决变化、上次停在哪，再让用户决定继续；重试、重新打开与重新执行使用不同动作。

以上以现有 Goal、Session、AgentRun、Attention／Inbox 与成果引用为表达基础。全新的团队权限、规格服务、任务数据库和通用工作流引擎均不是这次视觉 Demo 必须增加的依赖。

## 历史名单覆盖与证据深度

| 分组 | 名单 | 数量 | 本轮研究用途与边界 |
| --- | --- | ---: | --- |
| 主名单 | Paperclip、monday、Taskade Genesis、Fibery、Commonly、Multica、Asana、Atlassian Rovo + Forge、Airtable、Retool、OpenAgents、Tability、Fram | 13 | [平台研究](research-platforms.md)与[工作流研究](research-workflows.md)：官方能力与交互资料，部分产品直接观察官方界面图片；逐项写明缺口 |
| 成熟交互参照 | Linear、Codex App | 2 | 在[工作流研究](research-workflows.md)中用于稳定导航、预览、人和 Agent 责任及结果审阅 |
| 历史机制参照 | Beads、Task Master、OpenSpec、GSD、Claude Code、Vibe Kanban、Notion、ClickUp | 8 | 本文：当前官方源码／文档的短机制分析，未进行完整登录实测；非视觉产品不作视觉评分 |

**13 + 2 + 8 = 23 个独立参照，历史名单已覆盖。** 数量覆盖不等于研究深度相同；官方描述、直接观察截图、真实端到端实操和用户验收是不同证据层级。本文没有把这 23 个产品统称为“已深度实测”，也没有据缺少公开证据断言某产品不具备某项能力。
