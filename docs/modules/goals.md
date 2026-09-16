# Goals

Goals 保存 Goal 身份、当前结果约定、要求、工作事件和父子／依赖关系。`GoalsModule.events` 是当前工作状态与完成效果的唯一写入者；Native Goals 组合用户用例，Host 注入项目、身份和事务，Web/MCP 展示同一份状态。

## 当前工作路径

所有新建入口使用 `GoalEventApplication.createIntent`：网页新建、首次引导、Feed/Inbox 升格、Runtime 和已批准的树提案。普通笔记无需类型、规划模板或验收要求。类型配置、普通事实和进展可逐步补充；一批报告与其进展说明共同提交，任何非法事实都会使本批次回滚。

当前约定独立于历史 Draft/accepted 字段。要求可以新增、修订、退休；退休保留原要求和报告。`human_decision_required` 默认为 false，为 true 时必须有当前仍有效的可信用户验收。实质承诺变化须引用对具体变化的有效授权，不能通过改类型绑定或自填操作者绕过。

显式收尾读取当前约定、配置、要求、依赖和适用决定。版本缺失或过期在正式副作用前拒绝；版本正确但条件不足时可以保存收尾报告，完成效果仍为 false。普通报告不会自动完成；无关笔记或报告不会重开 completed/cancelled。有效反证可以使原完成退出当前生效，原始完成记录仍保留。继续工作统一使用 `resumeWork`，必须说明开启下一轮的原因。状态判断和差距计算留在本模块，UI 与 MCP 不复制算法。

## 公开职责

| 入口 | 用途 |
| --- | --- |
| `events` | 意图归属、局部类型版本、笔记、批量事实、进展、当前约定与要求、Concern、决定请求／引用、收尾、取消和继续 |
| `query` | Goal、关系、归档／回收站、指导、历史覆盖、原规则／风险与版本记录的读取 |
| `commands` | 底层建库、Goal／关系物化、V3覆盖导入和项目指导；由实际应用用例调用，不构成第二套 Runtime 创建协议 |
| `lifecycle` | 当前仍使用的归档、回收站和恢复行为 |
| `planning` | 规划方法与采用来源、关系图合法性、当前状态下的变化影响分析 |

`createGoal`／`addRelation` 是当前意图、树物化和历史导入使用的内部应用端口。它们不恢复旧接受 Contract、领取或完成协议。旧 Contract 修订、固定 leaf/compound 门禁、Claim/Run 动作投影与重验写入口已经退出当前工作路径。

规划是可选能力。内置、个人和项目方法的采用保留实际版本与来源；配置冲突在写入前拒绝，采用方法不等于启用全部默认要求。图分析继续检查循环、跨项目引用、祖先、上下游和拓扑顺序；可继续工作的候选与下游未完成计数使用事件当前状态，不从历史拆分或 fulfillment 字段猜测。

## 存储与历史

Goal schema、事件 schema 和本模块的历史升级由 Goals 维护。Host 在同一连接按既有顺序调用各 owner 的迁移，成功后才记录完成标记；不能拆开跨 owner 的原子事务。迁移保留原始 Goal、作者、接受时间、验收、Review、输入输出和来源，不伪造新的用户批准。

管理 `import_v3` 保留原 ID、标题、父子、输入输出、约束、coverage disposition 和导入来源，在同一事务中调用现有 `adoptOwner(source=migration)`。导入后可立刻读取当前状态和写笔记；不合成验收要求，也不要求走已经退役的接受／领取流程。重复导入不能覆盖已有 Board。旧 `coverage_items` 仍是历史覆盖记录，不改造成另一套当前要求。

输入绑定保留原来源、确认状态、作者、时间及必要的内容版本。可解析的跨模块来源通过 Context Ledger 关联；Goals 不读取其他 Module 的表，也不把 URL 自动注册为 Artifact。历史 Risk、Policy、Contract revision 与原验收记录继续可读，它们不提供旧写协议的备用入口。

## 应用与 UI 边界

`plugins/native/goals` 拥有事件正文、时间索引、说明／要求阅读器、有限树提案和实际表单。当前目录和正文直接消费事件状态；归档和回收站遵守 Goal 的实际记录。历史 Claim/Run/Evidence/Review 的正文由各 owner 的公开读接口组合，不需要构造空 action token 或旧操作列表。

真实 Runtime Session、终端进程和文件服务由 Work/Host 负责；切换 Goal 不会自动发送消息或改变终端绑定。Planning 不自行批准树变化；可信用户决定由 Governance 保存，Goals 只在相应应用事务中修改自己的事实。

真正干活的 Frame 工作台归 [Task](task.md)。Goals 只管树、关系画布、看板和记录页；点 Goal 打开的是关联 Task，不是 Goals 自己的 Frame。

当前调用示例见 [Runtime](../runtime.md)、[MCP](../mcp.md) 与[仓库 Skill](../../skills/goal-advance/SKILL.md)。本轮行为和历史兼容的验收范围见[事件工作流需求书](../../specs/goal-event-workflow-cleanup/spec.md)；早期 GW/DD/EX 迁移报告保留当时事实，不作为当前旧协议的使用指南。
