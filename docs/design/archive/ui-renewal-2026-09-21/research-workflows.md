# 工作流与人机协作产品的界面研究

研究日期：2026-09-21。范围：Asana、Atlassian Rovo + Forge、Airtable、Retool、OpenAgents、Tability、Fram；另以 Linear、Codex App 校准成熟工具交互。

本文为 UI 升级的研究输入，不是产品能力验收或正式规格变更。已读本仓库 `docs/design/taste.md` 和 `PRODUCT.md`，并核对用户指定任务「调研 molis-work 竞品」中的逐家定位及其留存研究稿。公开产品文档、官网截图与研究者判断分别标明；没有登录这些产品跑完整真实任务，所有端到端可靠性仍为 `UNVERIFIED`。

## 先给设计判断

这组产品最值得学习的不是某一种皮肤，而是它们把复杂工作放进用户可以预测的空间：**左边找对象，中间看工作，详情按需展开；代理的活动归回原对象，重要决定留在结果旁边。** 这是多家产品重复使用的模式，因而是“目标用户可能已经熟悉”的候选，不是已经验证过的用户研究结论。

对 Molis，视觉升级应把“可信的当前状态”做成第一眼就能读懂的设计：我正在看哪个 Goal、哪项要求仍未满足、谁或什么在等我、这次决定影响哪里。把数据库的每个字段排得更漂亮，仍不能达到这个目标。

建议保留连续工作面、插件身份色、紧凑列轨、按需详情与明确返回。可以突破的是：让 Goals 的当前差距、Inbox 的决定后果、Feed 的来源与去向、Session 的执行归属形成各自鲜明的阅读秩序，而不是所有模块都铺成同一种表格或聊天。

## 共性模式：可以复用，但先验证是否真的省力

| 模式 | 已观察依据 | 为什么常见（设计推断） | Molis 的处理 |
| --- | --- | --- | --- |
| 稳定侧栏 + 对象列表 + 主工作面 | Asana 项目与任务截图、OpenAgents 线程截图、Airtable Record review | 定位与处置可以在同一空间连续完成 | 保留插件轨与当前目录；不能切目录后还留着旧插件正文 |
| 列表、看板等视图共享同一对象 | Linear List/Board、Asana 视图标签、Airtable 数据与 Interfaces | 视图改变阅读方式，避免产生第二份事实 | 列表/画布/看板只改变呈现；打开后进入同一 Goal Frame |
| 快速预览与正式打开分开 | Linear Peek、Airtable 左列切换详情 | 扫描大量事项时不需要每次进入并返回 | 可探索 Space 预览要求和最新依据；要处置再正式打开 |
| 通知队列和对象本体分开 | Linear Inbox、OpenAgents Inbox/Tasks | 清空注意力不应该删除业务对象 | 已读、已处理、Goal 完成必须使用不同文案和动作 |
| 相关动作贴着对象 | Airtable 审核按钮、Codex diff 行内评论、Rovo 上下文技能 | 缩短看证据到作决定的距离 | 待决定置于事实旁；“采用/退回”不能远在页面底部 |
| 活动按需展开、来源可回看 | Asana 任务评论、Retool 活动、Codex diff | 默认关注结果，需要时解释过程 | 正文先给当前事实；来源、事件与技术记录逐层展开 |
| Agent 有明确身份但仍嵌在工作中 | Asana AI Teammate 标签、Linear Delegate、OpenAgents Agents | 辨认执行者，减少“这是谁做的”歧义 | 明确提出者、执行 Runtime、用户决定；不能只放一个 AI 闪光图标 |

这些模式不是必须凑齐的功能清单。当前必须先把位置、状态、结果和动作对齐；跨设备在线人员轨、复杂协作路由、组织图应延后到真实团队底座可用时。

## 1. Asana：组织关系直接变成 AI 工作上下文

官网：[Asana](https://asana.com/)。

**对 Molis 意味着什么。** Asana 的优势是用户原来的项目、任务、负责人和协作关系已经存在，AI 可以在这些关系内工作。Molis 需要减少重复说明目标与要求的成本；“我们也有 Goal”本身不足以带来迁移动机。

**界面与路径（已观察）。** 本次查看了 [AI Teammates 官方页面](https://asana.com/product/ai/ai-teammates) 的任务截图：窄功能轨后是项目与分组列表，标题下有 List、Board、Timeline、Gantt、Calendar 视图标签，右边打开具体任务。人类评论、AI 同事回复和工作的补充要求处在同一活动面；AI 身份以文字标签区分，任务工具条与参与者处于顶部。它没有把 AI 的结果另放到一个脱离任务的机器人房间。

**独特设计与原因（推断）。** “交给同事”的既有语言被延伸给 AI：角色、工作、指导、访问范围各有入口。这样主要学习成本是怎样带好这个角色，而不是先理解工具调用。活动流保留人类补充和 AI 响应，让他人中途加入时能沿原任务追溯。

**Agent、人审和回溯（官方说明）。** AI 同事可像成员一样接收任务；[访问和批准文档](https://help.asana.com/s/article/understanding-access-control-for-ai-teammates?language=en_US) 将批准与动作后果关联，例如给新成员增加任务可见性。另一个限定在 Client Management 的流程，会产生交给人审核的子任务，不能将这个特定行为扩写为所有 Asana 任务的统一规则。[Client Management 指南](https://help.asana.com/s/article/getting-started-with-ai-teammates-in-client-management?language=en_US)

**可吸收。** Goal 活动中的“Codex · 提交结果”“你 · 确认要求”采用同一时间与对象体系；仍清晰区分哪条是建议、哪条已生效。需要用户介入时，在同一个对象顶部给出明确的审核项，而不是一条不起眼的普通评论。

**不照搬。** 当前 Molis 为本地、Runtime-neutral 真相源，不应做出“分派给 AI 同事后自动开工”的假象；拟人角色卡、组织头像墙也不应侵占专业工作面。当前阶段先呈现实际 Session/Runtime 归属，团队身份与权限是后续能力。

**证据边界。** 官方截图与说明能支持入口和呈现判断；AI 实际完成质量、权限边界执行和持续协作未实操。

## 2. Atlassian Rovo + Forge：在原工作对象旁提供上下文能力

官网：[Rovo](https://www.atlassian.com/software/rovo)。

**对 Molis 意味着什么。** 这是已有工作入口与知识关系的竞争：Jira/Confluence 用户不一定愿意为了 AI 另开一个工作空间。它提示 Molis 的专业插件与 Agent 应在 Goal、资料或记录现场生效。

**导航、主内容与详情（官方文档）。** Rovo 能在多个 Atlassian 产品中使用；[Rovo button](https://support.atlassian.com/rovo/docs/the-rovo-button/) 位于角落，展开后依据“阅读/编辑当前页”等状态给出不同技能。Confluence 提及 Agent 后可在侧面开启对话，原文仍是主工作对象。[Confluence 协作入口](https://support.atlassian.com/confluence-cloud/docs/collaborate-on-confluence-content-with-ai-agents/) 搜索与对话也被区分：找已知对象时使用结果列表和筛选，综合、生成或执行时使用 Chat。[官方使用指南](https://www.atlassian.com/software/rovo/guides/end-user-guide/how-to-use-rovo)

**独特设计与原因（推断）。** 它把 AI 做成“当前工作可调用的能力”，缩小空白对话框的提示词负担。上下文技能比全局固定按钮更有意义：用户读一条 Feed 时可能需要核对来源，编辑 Goal 时需要检查要求缺口，这不是同一组动作。

**Agent、人审与扩展。** [Rovo Agent 模块](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/) 和 [Action 模块](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/) 说明 Agent 的声明、技能与实际执行动作。动作具有用户可读名称；官方当前文档对自动化触发的写动作有具体限制。Forge 是扩展底座，不应被误写成某一种固定用户界面，也不能由“有插件 SDK”推导出所有调用都有相同批准体验。

**可吸收。** Molis 的窄对话入口可以附“将使用：当前 Goal、3 条要求、2 份资料”的可点上下文清单；按钮写“检查遗漏要求”“解释这个阻塞”，比“Ask AI”更能说明价值。执行前后在原对象显示结果和真实来源。

**不照搬。** 不把持续提醒、建议气泡和全局 Chat 挤入首页；不为每页都配置一个 AI 侧栏。Molis 当前并无 Atlassian 式组织权限与知识图谱，不能靠界面暗示已能访问团队全部资料。

**证据边界。** 本项主要为官方入口和开发文档研究；没有登录 Jira 实际操作，视觉细节及所有动作的批准样式未证实。

## 3. Airtable：为同一份业务数据提供专门的处置工作面

官网：[Airtable](https://www.airtable.com/)。

**对 Molis 意味着什么。** 对研究、内容、运营等专业插件而言，真正的替代品可能是一套持续维护的记录与专门界面。它证明用户未必需要知道平台架构，只需要一页能完成当下工作的 UI。

**导航、主内容与详情（官方文档）。** [Record review](https://support.airtable.com/articles/4384405105-airtable-interface-layout-record-review) 把待处置记录列表与当前记录详情相邻放置。列表可展示标题、两项预览信息、分组和筛选；详情提供字段、相关记录、评论、修订历史和操作按钮。它将“定义数据”“制作界面”“日常使用”分成不同角色与入口。[Record detail](https://support.airtable.com/articles/5805061650-airtable-interface-layout-record-detail)

**独特设计与原因（推断）。** Record review 不是只读详情页，而是围绕连续处理很多条记录设计：左边始终保留队列，右边只呈现这次判断必要的信息。其 [内容审核示例](https://www.airtable.com/guides/collaborate/interface-designer-record-review) 先过滤当前审核人、待审核状态，再摆内容和反馈入口，减少“一堆记录中找哪条需要我”的耗时。

**Agent、人审与回溯。** [Field agents](https://support.airtable.com/articles/8052242094-using-airtable-ai-in-fields) 将 AI 置于字段中，支持单条运行和按过期、错误等范围批量运行。重要启发是状态与失败具体落在受影响记录上。字段产生结果本身不等于有人审核；若要批准，还需业务字段与操作规则承担。

**可吸收。** Inbox 应为“需要我作哪类判断”的专门视图；左列短句写进入原因，右侧先给证据和可选处置。Feed 则以阅读正文为主，不能复制 Inbox 的审核布局。来自同一事实源的不同视图无需复制数据。

**不照搬。** 不给普通用户塞进拖拽编辑器或泛化字段配置；不把“打勾字段”直接当 Molis 的可信批准。Molis 的决定需要保留对象、版本与后果，审批按钮只能绑定已有真实决定语义。

**证据边界。** 文档有明确的新旧布局之分；旧的自由元素 Record review 已非主开发方向。本研究未将旧教程截图当当前所有版本的准确 UI，也未实操权限、撤销与批量生成。

## 4. Retool：让重要判断进入专业界面，让执行过程可追查

官网：[Retool](https://retool.com/)。

**对 Molis 意味着什么。** 专业插件的价值不是给聊天换一个壳，而是把审核与异常处置做得比聊天更清楚。研发者、日常操作人和偶尔审核者需要不同的阅读密度。

**导航、主内容与详情（已观察/官方说明）。** 本次查看 [Agents 页面](https://retool.com/build-enterprise-apps/agents) 的官方界面裁片：Configuration 编辑指导；Add tool 显示动作名称与描述；Activity 用紧凑动作条呈现“Create document”，下方直接显示成果名称和“Google Doc created”收据。页面同时展示全体 Agent 监视与单个 Agent 下钻的概念。注意这些是官网裁片，并非本次操作了生产应用。

**独特设计与原因（推断）。** 它把搭建、执行、观察分离，而用同一业务数据连接三者。对操作人而言，应该先看这份结果和该作的决定；只有异常时才需要查执行细节。监视页的成本或轨迹有用途，但不能成为所有工作对象的默认首页。

**Agent、人审与回溯。** [产品说明](https://retool.com/use-cases/ai-agents-intelligent-automation) 描述可配置的人审节点与执行回放；[Agent 开发文章](https://retool.com/blog/how-agents-in-retool-solves-hard-parts-of-agent-development) 具体给出工具动作审阅和执行追踪。它们证明的是设计能力声明，不证明某个业务应用已正确配置，也不应把厂商所谓 reasoning 日志当成模型内部推理的可靠全貌。

**可吸收。** Molis 决定详情可以是“建议改什么 → 依据 → 影响哪些 Goal → 用户选项”，而不是批准一段长总结。成果旁的收据说明实际发生了什么：已生成草稿、已写入哪份文件、是否还有外部步骤；用户可顺着收据回到来源。

**不照搬。** 不把 Graph、trace、token 和成本仪表盘放进每个 Goal；不为了方案引入一个新的流程编排器。Molis 已有事件、要求与可信决定，先用这些既有语义做完整界面。

**证据边界。** 官方示意与文章已核对；没有生产数据、实际审批故障或重放恢复证据。不能因此宣称 Retool 的 UI 已替每个团队解决审核质量。

## 5. OpenAgents：线程、共享物与 Agent 连接在一个协作空间

官网：[OpenAgents](https://openagents.org/)。

**对 Molis 意味着什么。** 这是跨 Agent 工作空间的直接近邻。“不同 Agent 共同处理研究、代码和文件”不能直接当作市场空白。真正要比较的是结果能否被看懂、接续和复用。

**导航、主内容与详情（已观察）。** [Workspace 官方文档](https://openagents.org/docs/en/workspace/what-is-workspace) 的截图为浅色连续三列：窄侧栏列工作空间、Threads、Agents 与在线状态，中列是带搜索和筛选的线程列表，右侧为当前对话。线程上方有 Agent 引导内容，输入在底部。官方说明还列出 Files、Knowledge、Browser、Tasks、Workflows、Routines、Inbox 等视图；本次截图只直接观察了线程页，不能声称逐一看过这些模块。

**独特设计与原因（推断）。** 用人们熟悉的协作聊天承接多 Agent，并让文件与持续知识有独立入口，避免所有产物都沉在长对话里。在线状态与 Agent 名录回答“现在谁可以接住这件事”。这对团队产品有价值，对当前单人本地 Molis 则不必常驻一整栏。

**Agent、人审与回溯。** [Working with Agents](https://openagents.org/docs/en/workspace/multi-agent-collaboration) 描述线程内的动态、主从、工作流三种协作方式；Tasks 中先入 Backlog，点击 Run 才执行，卡片有 Needs input 与 Open chat。它明确区分“跟踪一项工作”和“真正启动”。人可进入线程纠正方向，尚不能据此推断它具有 Molis 同样的版本化 Goal 接受或显式完成门禁。

**可吸收。** Session 目录行区分“已连接”“正在执行”“等你输入”；Goal 详情保留关联 Session 和成果入口。任何“继续”动作先显示目标 Runtime 与工作目录，让归属连续可见。当前本地结果不能伪装成团队共享成果。

**不照搬。** 不把 Molis 变成又一个 Slack；Goal 当前要求和决定不能依赖完整聊天才能读懂。协作路由选择也不该成为普通人开始一项工作的必填项。

**证据边界。** 当前文档更新于 2026-09-20，产品命名已从早期 Studio/Network SDK 演进；应以 Workspace 实际资料为准。已看官方线程截图，其他模块与团队端到端实操未证实。

## 6. Tability：把做事的热闹和目标的变化分开

官网：[Tability](https://www.tability.io/)。

**对 Molis 意味着什么。** 目标管理必须影响下一步，而不只是任务上方增加分类。它是检验 Goal 页究竟有没有帮助人改变行动的参照。

**导航、主内容与详情（已观察）。** 官网 Goals and OKRs 截图中，左栏分 My Focus、Work、Reports、Org；主区标题下有 Overview、Tasks、Cascade、Notes、Retrospectives。目标以可展开层级行呈现，标题在左、负责人和状态/变化在固定右列；少量连线解释父子。汇总区将剩余时间、总体进度、任务完成和置信度分开显示，不把它们混成同一种数字。详情 Check-in 入口与变化图表由 [check-in 指南](https://guides.tability.io/docs/tutorials/track-progress-with-check-ins) 说明。

**独特设计与原因（推断）。** 一次更新同时问实际数值、置信度和原因。数字上涨不一定代表能准时实现目标，做完任务也未必改善结果；不同信号并置可以减少虚假乐观。[置信度指南](https://guides.tability.io/docs/tutorials/track-progress-with-check-ins/check-ins-best-practices) 也明确其并非永久评分。

**Agent 与人的介入。** 当前 [Agent Manager 页面](https://www.tability.io/ai/ai-agent-manager) 已公开描述目标、拆计划、招募专长 Agent、报告和评论反馈的流程。历史竞品稿将其写成待发布能力，这一描述已需更新；但本次只证实当前官方页面宣称，并未实操证明招聘、持续执行或完成可靠性。

**可吸收。** Molis 用“要求得到哪些支持、哪些被反证、哪些未知”和“待验收”说明离完成的距离；有真实业务指标的 Goal 才增加趋势。最近成果与尚缺依据相邻，让用户自然看见下一个动作。层级列表保留整齐列轨，密度不会损害结构理解。

**不照搬。** 不把子任务勾选数换算为 Goal 完成率；不因有一个漂亮百分比就宣称正在接近结果。更不能把“分配 Agent Manager”引入当前不派单的 Molis 工作语义。管理层仪表盘也不适合替代日常工作台。

**证据边界。** 已观察官网完整 OKR 视图；没测试真实 check-in 或 Agent。官网信息有宣传性且会更新，当前功能成熟度不能由它的文字单独认定。

## 7. Fram：把主动提案变成可讨论、可批准、可追到结果的对象

官网：[Fram / forwardby.io](https://forwardby.io/)。

**对 Molis 意味着什么。** Fram 与长期目标、Agent 主动推进、人类关键决定有接近之处。它最值得借鉴的是一段建议怎样变成可检查的工作，而非首页视觉上的新鲜感。

**导航、主内容与详情（已观察）。** 官方桌面截图使用深暖色：左栏 Home、Inbox、Tasks 和目标集合；主内容上方是一排人/Agent，其下是图像化目标轨，再下是连续 Feed。帖子包含发出者、Agent 标识、所属目标、正文与证据截图，评论和反应位于底部。移动端延续同样的人员轨、目标轨与 Feed，而非把桌面表格压窄。

**独特设计与原因（推断）。** 它借用社交阅读习惯提高持续回访意愿，并用一个目标与度量约束讨论。对需要长期陪伴和共同推进的项目，这比偶尔打开的管理表更有生命感；代价是需要主动过滤噪音，可能让人不断追 Feed。

**Agent、人审与回溯（官网示例）。** 页面展示 Agent 提案、人的评论与选定方向，再连到 GitHub PR 收据；还用 local/cloud 身份解释为何某个 Agent 能操作本机。这个示例最有价值的不是“Approve”按钮，而是批准后去向仍然可追踪。官网展示的场景并非本次验收成功的任务。

**可吸收。** Molis 的 Inbox 可以把建议变成一个有标题、依据、范围和后果的决定对象。完成处理后，用安静收据保留“你选择了什么、关联 Goal、后续状态”；从成果回到当时决定也要成立。Feed 中图片确实承担证据时可展开，别把所有消息变成卡片海报。

**不照搬。** 不把人员故事圈、目标封面轨和社交反应常驻在 Molis 默认工作台；当前用户要求保护注意力、密集处理。对于没有可量化业务指标的设计/研究目标，不能强制“数字＋截止日”。持续调度、多人共享及云执行只属于后续产品探索。

**证据边界。** 本次真实观看官网桌面和 iOS 截图；未登录、未验证其长期可靠性、各端一致性或批准后的外部执行。只引用其公开设计表达，不认定商业成熟。

## 8. Linear 与 Codex App：两条应当保留的成熟参照

### Linear：短暂查看不打断当前位置

[Peek 文档](https://linear.app/docs/peek) 明确支持 Space 临时预览与上下连续切换；[Inbox](https://linear.app/docs/inbox) 将通知操作与原 Issue 操作放在一起，但保留两者语义。对 Molis 的启发是：浏览、处置、持续工作可有不同深度，不能所有单击都新开标签，也不能全靠弹窗承载。

[Agents](https://linear.app/docs/agents-in-linear) 与 [Assign and delegate](https://linear.app/docs/assigning-issues) 的区分也值得关注：委托 Agent 后，人的 My issues 仍能跟踪这项工作。**设计判断：执行者变化不等于人的责任消失。** Linear 官方明确保留人的责任；Molis 未来团队版应让提出者、负责者、执行 Runtime 和批准者各有准确位置，当前原型不必制造不存在的团队身份。

### Codex App：结果有独立的检查表面

本宿主已提供项目/任务组织与 review 面板能力；为核对公开使用语义又查了 [项目与任务文档](https://learn.chatgpt.com/docs/projects) 和 [Code review](https://learn.chatgpt.com/docs/code-review)。官方说明 review pane 展示实际 Git 差异，支持按范围查看和行内反馈。它最值得借鉴的是：对话用于解释、引导，真实结果在适合该结果的视图里检查。

对 Molis，可将 Goal 的成果预览、证据与要求对照置于同一工作面；用户直接指着要求或成果反馈，不必复制到聊天再解释。代码用 diff，研究用来源与论点，内容用正文与批注，不强行把所有成果压成统一聊天气泡。当前官方文档有路径迁移和 Codex/ChatGPT 共同叙述，应只引用明确内容；本次未操作用户当前 Codex 窗口做体验验收。

## 这次升级可以做出的 Molis 特别设计

以下是基于研究的候选设计，不是确认增加的产品能力。优先映射当前已有数据和操作。

| 候选设计 | 用户真实问题 | 最小完整表现 | 为什么属于 Molis | 当前与未来边界 |
| --- | --- | --- | --- | --- |
| “距离完成还差什么” | 过程很多，却不知道能不能收尾 | Goal 标题下展示未满足要求、待决定、真实阻塞；点项展开证据 | 直接将权威真相源变为可读价值 | 使用既有要求/事件语义；不要新造完成算法 |
| 决定的前后对照 | 一段建议看不出实际后果 | 现状、建议变化、受影响 Goal、选择后果；处理后留下可回看收据 | Candidate/Rewire/可信决定本来就有此责任 | 先做已有决定类型；团队审批链后续再议 |
| 来源到成果的轻量路径 | 不知道结论来自哪，也找不到用到哪 | Feed → 资料/Goal → 事件 → 成果用短关联行连接，逐步展开 | 已有来源、Goal、事件、Artifact 引用可以共同解释工作 | 没有真实引用时显示未知；不凭 UI 推断知识图谱 |
| 保留位置的快速查看 | 逐条返回列表太累 | 列表内 Peek；Esc 返回；正式打开保留目录和滚动 | 当前 Frame 与列表可共用对象身份 | 原型验证键盘与单击预期后再入规格 |
| 运行归属常驻、过程按需 | 多个 Runtime 容易串 Goal 或误以为已启动 | 明示当前 Goal、Session、工作目录和连接/运行状态；操作有实际动词 | Runtime-neutral，打开不执行是核心边界 | 当前只显示真实本地归属；在线团队状态不伪装 |
| 有意义的视觉色彩 | 纯灰太干，彩色太乱 | 插件颜色用于找路；状态带文字与图标；成果缩略图仅在有内容价值时出现 | 同一套壳里各专业模块仍可辨认 | 不采用每插件一套背景皮肤、彩虹依赖线或装饰图表 |

## Demo 应检验什么

综合研究后的主线已落实为：新反馈 → 当前与候选要求对照 → 采用或暂缓 → 编辑原稿 → 交回成果版本 → 段落反馈 → 返回修订。它检验选择是否真正改变下一步，而不仅是改变一个状态标签。具体取舍见[主方案第三节](proposal.md#3-关键设计取舍研究如何改变产品)，操作与已验证边界见[运行说明](README.md)和[验证记录](verification.md)。

重点观察：不用解释能否找回工作；采用前能否看清影响与保留部分；修改时依据是否可查；草稿保存与成果提交是否分清；旧版意见是否仍归旧版；返工能否回到对应段落。Feed 的阅读与处理、个人 Shelf 的副本处理是独立的配套流程，不要求每份材料都进入 Goal。主观质感、真实中文输入法、连续使用负担及团队协作仍需后续真实验证。

## 本次直接观察的界面证据索引

| 产品 | 本次直接看过的图 | 本次观察方式 | 不应外推的部分 |
| --- | --- | --- | --- |
| Asana | Regulatory Compliance Tracker 任务列表与任务评论，AI Teammate 与人共同回复 | 独立浏览器标签查看官方产品页截图 | 并未创建或审批任务 |
| Tability | Marketing OKRs：层级列表、固定右列、Overview 指标与主侧栏 | 独立浏览器标签查看官网截图 | 并未操作 Check-in/Agency |
| Fram | 桌面 Home 与对应 iOS Feed、人员与目标轨、证据图 | 独立浏览器标签查看官网截图 | 不证明跨端同步与批准后执行 |
| OpenAgents | Workspace 线程三列、Agent 名录、会话和输入区 | 独立浏览器标签查看官方文档截图 | 其他模块主要来自文档，非逐页实操 |
| Retool | Configuration、Add tool、Activity 成果收据三个官方裁片 | 独立浏览器标签查看产品页 | 裁片为演示，非完整生产 App |
| Rovo / Airtable / Linear / Codex | 相应官方交互与帮助文档 | 联网核对一级来源 | 本次没有登录进行完整产品任务 |

所有页面于本研究日访问。以上引用是设计依据；本报告提出的可借鉴点是设计判断，不能反过来当作竞品已具有 Molis 同等业务语义的证明。
