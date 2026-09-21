# 平台型竞品：把熟悉的工具骨架，变成可持续推进的工作面

观察日期：2026-09-21。范围：Paperclip、monday.com、Taskade Genesis、Fibery、Commonly、Multica。

这组产品最值得借鉴的，不是「更多 Agent」或「更丰富的看板」，而是三个设计动作：**让工作对象持续留在原处；让需要人处理的事具备具体原因和下一步；让上下文、产物与执行过程围绕同一对象出现。** Molis 可以在这个骨架上做出更鲜明的「目标—差距—下一步—结果」体验。

## 证据和适用范围

- 本文实际阅读了官方帮助文档、公开仓库，并在浏览器观察了官方产品截图、产品导览或公开工作面。没有登录六家产品创建真实任务，没有验证协作、权限、恢复、性能和完整交付链路。
- 「共性」「用户可能熟悉」是基于多个产品采用相似模式的设计假设。它不等于做过用户研究，也不意味着用户已经理解 Molis 的 Goal、要求、完成和 Runtime 边界。
- 对界面的解释均注明为设计推断；截图中的内容和文档声明不等于独立验收结论。官方网页会更新，引用是本次观察的入口。
- Molis 的当前边界已对照 [PRODUCT.md](../../../PRODUCT.md)、[SSOT-MATRIX.md](../../SSOT-MATRIX.md) 和本地参考 `docs/design/taste.md`（不随本次提交）：当前是本地工作台；Server、Exchange、团队身份权限与同步未实现。远期方向另参考 [将来的功能规划](../../future-feature-planning.md)，这是工作草案，里面部分旧执行术语不能覆盖当前事件协议。
- 本研究不修改规格、不增加新的业务状态，也不把设计 Demo 中的团队场景当作已上线能力。

| 产品 | 本次直接观察到的视觉证据 | 交互依据 | 证据边界 |
| --- | --- | --- | --- |
| Paperclip | 官方 17 秒导览中约 5 秒的 Issues 分组列表、约 11 秒的 Org Chart | 官方 Issues、Dashboard、Blocked Inbox 文档 | 导览里的样例内容较早；当前文档更丰富，不能假定全部已呈现在导览中 |
| monday.com | 官方 Item Card 文章内的主表＋右侧详情图、字段选择设置动图 | 官方 Item Card、Board Views 文档 | 官方示例截图；没有登录操作 |
| Taskade Genesis | 官方新 UI 文章的 Workspace Layout 图：左 EVE、右工作区 | 同一官方指南中 Context Pills、Element Selector、导航说明 | 官方演示图；未运行生成和发布 |
| Fibery | 官方公开 User Guide 本身运行在 Fibery 中；观察实体标题、面包屑、左侧目录及嵌入的视图切换图 | 当前 Multiple Entity Views 文档与官方变更说明 | 公开只读文档面可见；未编辑私有数据库 |
| Commonly | 官网原图：Pod 列表、中央多人/Agent 对话、右侧 Overview/Members/Tasks/Manage 及成果 | 官方仓库的 Pod/Seat、连接说明 | 官网产品实例图；没有加入 Pod 或触发 Agent |
| Multica | 官方 Issues 文章内详情图：正文/Activity 与右侧 Properties、Execution log、Token usage | 官方 Issues、Agent 配置文档 | 官方示例图；未派单或运行 |

## 共性骨架：可以借用什么，仍需教会什么

| 模式 | 本组证据 | 为什么可能降低学习成本（推断） | Molis 的吸收方式 |
| --- | --- | --- | --- |
| 左侧范围导航，中心是当前对象或列表 | Paperclip 项目/工作/Agent 分组；Commonly Pod 目录；Fibery 空间目录 | 空间位置稳定，用户知道「去哪找」和「现在在哪」 | A 保留插件轨与目录，B 比较合并文字导航；两者均保持当前对象和工作面一致 |
| 一个对象，多种视图 | monday 的 Table/Kanban 等；Multica 多视图；Fibery 同实体多布局 | 视图改变观察角度，记录身份不变 | Goal 的列表/关系图/看板保持同一选中对象、过滤和返回位置 |
| 主内容与属性分区 | Multica 正文和右侧属性；monday Item Card；Commonly 右侧资料面 | 内容可读，字段可找，避免把一页变成大表单 | Goal 主区先放未满足要求和当前成果；关系/运行身份放可收起侧栏 |
| 次要配置出现在对象现场 | monday 的卡内设置；Fibery Manage Fields & Layout；Taskade 元素选择器 | 操作对象清楚，减少去设置页再找回现场的往返 | Feed 规则从来源现场进入，Function 编辑与试跑保留该场景的样本；全局设置承接全局偏好，项目设置承接项目范围配置 |
| 活动有作者、时间、关联对象 | Commonly 对话；Multica Activity；Paperclip Activity | 用户可追问「谁说的、什么时候、依据在哪」 | 给当前结论留出处；历史可展开，不抢占当前工作首屏 |
| 需要人介入的工作单独聚集 | Paperclip Blocked Inbox；Fibery Inbox 按实体合并 | 从噪音中找出自己的动作 | Inbox 行直接说「为什么现在需要我」和具体选择，不只写「有新消息」 |
| AI 与对象上下文绑定 | Taskade Context Pills；Multica Issue 关联 Run；Commonly Pod 与 Seat | 让用户不必每次重复描述上下文 | 在输入旁显示本次使用的 Goal、材料版本和选区；明确确认后才发送/执行 |

上述模式不能替 Molis 解释：**报告成功为什么不一定完成、终端为什么不会随打开 Goal 自动启动、用户决定与实际应用为什么有时是两步。** 这些必须用产品事实和明确动作教会，不能藏到术语提示里。

## Paperclip：用任务工具承载 Agent 组织，最值得学的是「阻塞可处置」

**看到的设计。** 官方导览的 Issues 画面用暗色连续工作面；左栏分 Projects、Work、Agents；中心按状态分组，行内对齐编号、标题、负责人、Live 标识和时间。过滤、排序、分组处于工具条右端。Org Chart 是另一张视图，节点同时放角色、Runtime 和状态点，连接线只承担汇报关系。这些是导览可见设计，不是对当前所有界面的概括。[官方产品导览](https://paperclip.ing/videos/full-tour.webm)

**独特交互。** 当前官方文档把 Blocked Inbox 的每行组织成「问题＋阻塞原因＋谁能解除＋停了多久」。空态解释什么会进入这里；同一筛选机制沿用 Issues。这里的贡献不是把红色加深，而是让阻塞变成有行动对象的记录。[Blocked Inbox](https://docs.paperclip.ing/guides/day-to-day/blocked-inbox/)

Issues 文档同时描述列选择、父子嵌套、持久化视图配置，以及 Ask / Plan / Agent 三种工作模式；模式在创建时表明期望回应的性质。[Issues](https://docs.paperclip.ing/guides/day-to-day/issues/) Dashboard 则面向运营观察：运行中的 Agent、待审事项、成本和近期活动。[Dashboard](https://docs.paperclip.ing/guides/day-to-day/dashboard/)

**为何这样设计（推断）。** 组织拥有持续自主运行的执行者，用户需要同时回答「谁在工作」和「哪里必须由我出手」。熟悉的任务列表降低了进入门槛，组织图把委派关系显性化，而 Blocked Inbox 缩短了异常处置路径。

**Molis 可吸收。** Goal 行尾给出「等你确认范围」「缺一份验证结果」「来源连接失效」这样的短原因；进入详情后直接看到对应证据和动作。把「本次只是问答/准备方案/实际执行」放到执行入口，避免使用同一个含混的发送按钮表达不同后果。实际支持哪些模式，由现有 Runtime 能力决定。

**不宜照搬。** 不把首页改成成本卡片墙，不默认以 CEO/员工组织图解释个人项目，不把打开 Goal、换负责人或改状态变成自动派单。Molis 当前也不能显示虚假的 Live Agent、团队成员或预算执行能力。文档内 Dashboard 图片链接在本次读取时返回 404，所以视觉依据取自可播放的官方导览，Dashboard 的布局细节仅按文档理解。

## monday.com：把复杂工作压缩成稳定列轨，再允许在对象内组合详情

**看到的设计。** 官方示例的主表以分组标题和左边窄色条标记类别；记录横向对齐到固定字段，负责人显示头像，字段值可以使用明显色块。右侧打开对象后，顶部仍可在 Updates、Files、Activity Log、Item Card 等页签间切换。Item Card 的字段配置在现场开启窄设置栏，通过勾选决定显示哪些列，能同时看配置和结果。[Item Card](https://support.monday.com/hc/en-us/articles/360017143959-The-Item-Card)

**独特交互。** 一个 Board 的数据可以用不同视图表达，视图位于标题下的页签，收起标题时改成切换菜单；视图可固定，个人也可调整顺序。这把「同一批工作」与「我怎么观察」分开。[Board Views](https://support.monday.com/hc/en-us/articles/360001267945-The-board-views)

**为何这样设计（推断）。** 面向运营和跨职能团队，字段同时是输入控件和扫描线索。用户不必逐条打开，就能识别谁负责、进度怎样、哪一行异常；对象详情又能承载主表放不下的沟通和关联信息。配置旁边的预览减少了试错。

**Molis 可吸收。** Feed、Goals、Schedule 等高频母页优先用列轨，让状态和事实不会随长标题漂移。展开详情后保留列表语境；只在需要对照多条对象时维持两面并列。Function 规则配置可用「条件/输出」编辑区＋一条真实样例的命中解释，让用户看见配置影响。

**不宜照搬。** 大块多色状态格、每组一个鲜艳色条会稀释 Molis 的语义色。任意 Widget 拖搭和上百种配置不是本次必须能力。可先做固定但合理的详情结构；只有真实使用证明不同角色需要不同字段，再引入更多视图。读取 monday 配置行为不代表 Molis 当前插件已有相同的可配置模型。

## Taskade Genesis：真正有价值的是「指向对象后再对话」

**看到的设计。** 官方新版指南的工作区图将 EVE 放在左边，右边承载 Preview、Projects、Agents、Automations 等工作区；面包屑承担层级回溯与快速切换。首页中央提示框用于生成应用，下方是应用缩略图入口。这是一套围绕生成产品的布局，而不是一般任务工作台的必然形态。[新版 UI 指南](https://help.taskade.com/en/articles/11967139-a-guide-to-the-new-ui) · [已观察的工作区图](https://downloads.intercomcdn.com/i/o/plyqw4hf/1911806086/ef6c736d8a09a31eee0ed9715bde/workspace-layout.jpg)

**独特交互。** Context Pills 在输入附近显示 Agent 当前感知的上下文；Element Selector 允许在 Preview 中点选具体元素，再用自然语言描述修改。用户的「这里」由选择动作消歧。这比全局聊天框更贴近实际创作动作。[Context Pills 与 Element Selector](https://help.taskade.com/en/articles/11967139-a-guide-to-the-new-ui#h_f5fd2b6bff)

发布入口会区分 Private、Secret、Public，并把完整 App 设置继续收纳到发布面中。它把预览、访问方式和发布动作放在一条连续流程。[发布说明](https://help.taskade.com/en/articles/12165353-publish-and-clone-your-apps)

**为何这样设计（推断）。** 生成式工具最大的交互歧义之一是「你到底在改哪个对象」。上下文标签与点选把语言命令锚到可见产物；并排预览让用户能在改动发生后立刻评价效果。

**Molis 可吸收。** 从 Feed 一段原文、某个要求、某份 Artifact 的精确版本上选择「交给当前工作」，输入口显示来源、选区和目标 Goal。Pages、Dataset、PPT 等未来实装 AI 编辑也应优先支持对象选择后介入。支持预览时，产物预览与修订说明并排，而不是让用户从聊天记录猜改变了什么。

**不宜照搬。** 不将 EVE 式常驻聊天占满所有插件，也不把首页换成「一句话包办」的大输入框。Molis 的各插件成熟度不同，当前 stub 不应通过视觉升级伪装成可工作的生成/发布能力。发布面启发的是后果清楚，不是现在新增云发布功能。

## Fibery：同一事实，根据当前问题显示不同的工作面

**看到的设计。** 本次打开的官方 User Guide 本身就是公开 Fibery 实体：左侧层级目录，顶部空间位置、类型和短编号；主体是连续文档，字段/关联可折叠。文档嵌入图里，同一 Feature 上方有 Default、Release Day、QA、Feedback、Customer success 页签，右上 Views 菜单负责配置。它把「一个对象、多种职责」做成工作面选择，而不是复制记录。[Multiple Entity Views](https://the.fibery.io/@public/User_Guide/Guide/Entity-View-335)

**独特交互。** 当前文档允许固定常用实体视图、调整字段与布局，也可按实体状态/用户角色等条件选择或隐藏视图。官方另有空字段收起设置；这些功能共同减少不相关字段在日常使用中反复出现。[当前实体视图指南](https://the.fibery.io/@public/User_Guide/Guide/Entity-View-335) · [隐藏空字段官方说明](https://community.fibery.io/t/july-25-2024-entity-access-explained-markdown-import-hidden-fields-section/6434)

官方对于一栏/两栏布局的说明尤其有用：窄屏、笔记本、关系表和长文内容需要更多横向空间；不是所有对象都适合永久属性栏。[一栏布局的设计说明](https://community.fibery.io/t/april-4-2024-one-column-entity-view-layout-mirrored-context-folders/6054)

**为何这样设计（推断）。** 高度可配置的关系数据库容易让每页堆满字段。Fibery 用展示层减少复杂度，让验收、写规格、看进展都围绕同一记录。代价是视图管理本身也会形成复杂度；不能把这个问题转嫁给每位普通用户。

**Molis 可吸收。** Goal 默认露出未满足要求、当前结果、待决定；历史和长属性渐进展开。进入具体创作插件时，把内容宽度还给文档/表格，Goal 依据成为可唤出的上下文面。收起的是与当前动作无关的内容，不是为了视觉简洁而隐藏关键阻塞。

**不宜照搬。** 不在本轮增加通用实体视图编辑器、按角色自动换页或数百字段能力。可以先内建「工作」「看依据」两个明确焦点，并用现有状态决定默认展开区域；它们仍是同一对象。如果继续沿用当前单工作面，甚至不需要新增页签，只需改变首屏的信息顺序。

## Commonly：让交接看得见，但聊天还需要一个稳定的工作锚点

**看到的设计。** 官网官方原图呈现四个层次：窄应用轨、按最近活动排列的 Pod/私聊目录、中央带头像和时间的多人/Agent 对话、右侧可关闭的对象资料面。右侧页签是 Overview、Members、Tasks、Manage；Overview 将 Goal 和成果附件从聊天中提取出来。中央 `.pptx` 附件和右侧成果索引同时出现，便于沿讨论找到文件，也便于跳过讨论直接找到成果。[已观察的官方 Pod 原图](https://commonly.me/assets/real-engineering-BsIcy8nR.png) · [官网产品实例](https://commonly.me/#features)

**独特交互。** 官方把 Pod 作为共享上下文范围，Seat 是具名 Agent 身份，Runtime 是另外一层连接方式；接入 UI 从 Agents → Bring your own agent 进入。工作记忆、技能和任务围绕房间和成员组织，而不是为每个执行工具建立一间封闭聊天。[官方仓库：Pod、Seat 与连接](https://github.com/Team-Commonly/commonly#what-is-commonly)

**为何这样设计（推断）。** 房间、头像、@提及和附件是聊天工具中成熟的协作语言。把 Agent 也变成具名参与者，能使“谁接走了什么”更直观；独立的成果区缓解了聊天往上滚就丢失结果的问题。

**Molis 可吸收。** Handoff 用具体人的动作语言表明「从哪个 Session 交给哪个 Runtime；带走哪份 Goal 约定和材料；下一步期望什么」。Goal 中显示相关 Session 的接续轨迹和产物版本，而不是只显示工具 logo。创作时可并排查看讨论与当前成果，讨论结束后仍有稳定成果入口。

**不宜照搬。** 不把全部工作改成 Pod 聊天，不把跨 Runtime 接续伪装成无损共享记忆。Molis 当前 Session 的身份、可读性和恢复能力受 adapter 约束；只有实际能读取的内容才可出现在交接包预览里。团队头像、私聊、在线状态和多人管理是远期能力，不属于本地 UI 换肤。官网宣传中的「真实交付」没有在本次独立复现。

## Multica：任务详情容纳执行历史，交付后给人留出判断空间

**看到的设计。** 官方 Issue 详情图的中心是标题、User request、子项和 Activity，右栏集中 Properties、Pull requests、Details、Execution log、Token usage。Agent 产出以 Activity 中的带作者消息呈现；执行记录收在另一栏。这种分工让「结果是什么」与「机器怎么跑过」都可达，但不混成一段终端输出。[Issues 与详情截图](https://multica.ai/docs/issues#parts-of-an-issue)

**独特交互。** Issue 是持续的工作记录，Run 是某一次执行；完成一次 Run 不等于 Issue 已完成。文档将交付后待人确认的状态定义为 In Review。Issue 同一批记录可切 List、Board、Table、Gantt、Swimlane。[Issues](https://multica.ai/docs/issues#issues-and-runs)

Agent 配置把具名身份/说明/技能与 Runtime 区分。会话起始建议点击后只填入输入框，允许检查与修改，不会自动开始执行；配置页可预览这个空态。[Create and configure an agent](https://multica.ai/docs/agents-create#conversation-starters)

**为何这样设计（推断）。** 任务具有长期上下文，执行可能失败、重试或换人。把二者分开，用户才能连续评价成果，而不会被某次运行成功的绿点误导。空态建议先填入草稿，也降低了“我只是探索一下却触发执行”的代价。

**Molis 可吸收。** 工作状态、当前要求支持情况、Runtime 技术状态必须分开显示。产物交回时先形成清楚的可审阅面：改了什么、产物版本、依据、还未验证什么，再提供现有协议允许的决定/收尾动作。示例提示只填草稿，显式发送才开始执行。

**不宜照搬。** Multica 中把 Issue 指派给 Agent 可以直接排队运行；Molis 不能把关联 Session 或选择 Runtime 做成同一后果。也不应照搬其所有视图数量，或照搬「合并 PR 可完成任务」来覆盖 Molis 的要求与收尾判断。当前 Goal 完成规则仍由 Goals 事件拥有。

## 建议进入 Molis Demo 的设计片段

这些是基于上述观察提取的设计机制。它们与其他研究共同进入[主方案的设计取舍](proposal.md#3-关键设计取舍研究如何改变产品)，不要求逐项新增功能，也不等于都已实现。最终 Demo 以变化判断、实际写作、版本审阅与段落返工为主线；已实现和已验证的范围分别见[运行说明](README.md)与[验证记录](verification.md)。

| 片段 | 真实用户问题 | 最小交互 | 借鉴来源 | 本轮边界 |
| --- | --- | --- | --- | --- |
| 当前工作首屏 | 昨天停在哪，今天先做什么 | 直接恢复文稿、会话或审阅位置；需要时查看关联目标；历史默认收起 | Paperclip 异常处置、Fibery 相关字段 | 聚合已有事实，不要求先经 Goal 概览，也不先造智能排序系统 |
| 带理由的注意力行 | 我为什么要现在点这个 | 行内「等你确认范围 · 影响 2 项要求」，点开即见依据与选项 | Paperclip Blocked Inbox | 原因必须有正式来源，不由视觉文案臆造 |
| 上下文就绪条 | AI 这次到底能看到什么 | 输入旁列出 Goal、选中材料和版本，可展开核对后发送 | Taskade Context Pills、Commonly 交接 | 模拟交互需标 Demo；不接通时不能显示已发送 |
| 结果与依据并排 | Agent 说做好了，我如何判断 | 左当前成果；右这次改动、要求支持、未验证项和正式动作 | Multica Activity/Execution 分区、monday 现场配置 | 不把运行完成换成验收完成 |
| 同一个对象的连续返回 | 点进详情后回去找不到原位置 | 保留选中、滚动、过滤、标签和分屏身份；从关联物返回仍在原处 | 各家稳定对象工作面 | 这是交互质量要求，不是新增业务模块 |
| 关系图的局部解释 | 整棵树过大，线太多 | 选中 Goal 时仅强调上游依据、当前依赖、受影响对象；其他关系退后 | Paperclip 关系图、Fibery 关联语义 | 图用于解释，不以动画暗示系统正在自动调度 |

需要谨慎对待的「眼前一亮」：多彩 Agent 肖像、常驻大 Chat、炫目的全景图和大数字面板容易在首次展示中抢眼，但并不直接改善工作。更有 Molis 特征的惊喜，应发生在用户打开工作的一刻：**过去的上下文已被整理到位，当前差距可看懂，下一步恰好就在手边。**

## 下一轮可验证的假设

1. 用户能否在 10 秒内从真实 Goal 判断「现在什么阻塞、由谁作决定、下一步入口在哪」。这是测试目标，不是已经达到的性能/可用性结论。
2. 在三个插件间切换并返回，是否仍能找回同一对象、滚动位置和未提交输入。
3. 从 Feed 选一段材料带入 Goal 时，用户能否准确说出 AI 会看到什么、不会自动发生什么。
4. Agent 回交成果后，用户能否区分「执行结束」「有证据支持」「已经正式完成」。
5. 视图和关联面收起后是否真的更容易阅读；尤其检查 13 英寸屏幕和 1024×400 矮窗口，不能只用宽屏截图评价。

以上需在 Molis 的交互 Demo 和之后的最终产品中分别验证；六家竞品的公开设计只能帮助形成假设，不能替代 Molis 的产品实操或用户验收。
