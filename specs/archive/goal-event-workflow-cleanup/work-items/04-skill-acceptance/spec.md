# 04 Skill、文档与内部完整验收

状态：执行完成，主验收通过，2026-09-11；最终证据见[总验收](../../acceptance.md)。depends_on：01–03 主验收及实际最终接口。主需求：[../../spec.md](../../spec.md) C5 与总验收；审查 F7/all。完成等级：4（内部完整），不等于安装/发布完成。

C2d集中复核后的具体收尾：`proposal-client.ts`仍注入Contract/Candidate/Rewire三类旧表单提交分支，调用已经退役的HTTP地址。主检索这三个data属性仅剩此客户端文件，没有现行表单生产者。随本项既有死胶水清理范围删除这三段、仅供其调用的`submitDecisionForm`和选择器项，保留当前Goal/Relation提案、原因校验、失败保留输入、幂等重试、刷新及回执。无需全面重扫或重做决定体验。C2d恢复的`goals-proposal.e2e.test.ts`是这条当前生产路径的回归；采用时回执焦点仍需保持，最后一个提案被拒绝后列表为空则可使用已有明确toast反馈，真实持久状态和reload必须保持一致。

C2d集中补正构建、27定向、真实Chrome提案测试通过；主英语探针`03-c2d-resume-root-language.log`通过。最后两项小的测试完整性补正在04一并完成，避免再开C2微批次：`runtime-skill-flow.test.ts`不能用可选database_path条件跳过最终持久状态断言，应确定读取实际临时项目，断言重启重放后Goal/原note只有一份、原文保持、无Claim/Run；`evidence-verification-module.test.ts`补保留原有`getReviewReference`读取真实提交事件序号的断言，使用原v35事件与Evidence ID核对，不能仅检查非空字段。

主读取确认剩余`goals-draft.e2e`、`goals-safety.e2e`、`goals-project-policy.e2e`仅验证已退役的Draft编辑、Risk创建和旧Policy角色/租约写表单，可实际删除并补入03c映射；当前约定表单、历史Risk/Policy阅读和项目guidance仍保留。其余全仓失败仍按实际业务分类，不按文件名批量退役。`event-document-forms/client/ui`里旧continue转交分支已被记录为04死胶水检查对象，只删除当前模型不再产生的分支；真实completed/cancelled resume与理由保持。普通界面继续指引使用用户可点击的动作，不展示MCP工具名或open/unmet内部状态；Handoff/Skill中的实际工具指引按其Runtime读者保留。

主对`event-document-model.ts:transferFor`进一步核实：`!owned`仍返回旧`continue_open/reopen_completed`，会让仅供历史读取的无事件owner Goal出现通向已退役HTTP的转交表单。按总合同的单一事件当前流程／历史只读边界，这一分支应不再提供转交动作；移除其独占view种类和表单/client胶水，保留旧正文及真实当前owner的completed/cancelled resume。已有HTTP历史GET/旧POST404测试可同时确认历史页不再输出旧continue表单，不新增迁移或兼容协议。这是上述具体清理的调用链补证。

04构建后的主实际HTTP补证：`04-historical-readonly-inspection.log`使用初始化后创建的隔离历史Goal，页面/fragment读取不改变owner；返回`owner:null, can_record:false`，却仍显示“补充一条”及note表单。带真实保护token与有效幂等键提交得到400 `event_state.not_owner`，SQLite快照保持原样。按既有历史只读边界，未归入当前事件工作的历史页应仅显示正文、历史、原要求、规划的阅读入口；隐藏无法执行的记录/类型/约定/决定/收尾入口及其独占表单，下一步明确历史阅读。当前event-owned Goal的普通记录/各表单和completed/cancelled继续保持。仅修当前renderer的真实权限呈现，不新增迁移、写协议或兼容层；针对真实无owner历史夹具验证原文阅读、无虚假写操作和无写入，不能以现在已是event-owned的demo V1冒充该夹具。

最新同一反例 `04-root-final-historical-readonly.log`按“不得提供不可执行写操作”断言真实失败，并显示无owner历史Draft头部仍有`data-open-goal-edit`“修改草稿”按钮，而旧编辑正文/提交已经退役。这个按钮及其独占`legacyDraftEditorAvailable`判断一并清理；正文/历史/回收站等真实职责继续保留。不得通过恢复旧Draft编辑协议来修此阅读页面。

首次全仓完成：`04-full-suite.log`为644项、627通过、17失败、0skip，EXIT1。除三份待授权删除的纯旧表单外，其余失败场景保留并按当前合同适配：Skill/跨Web-Desktop文字断言、打包首次使用与Runtime当前协议/重启/移除/升级、事件配置与要求分离、真实历史只读阅读、显式当前Goal能力/恢复、创建要求持久化、当前状态投影/集合选择、归档网络失败与历史、Risk锚点阅读、关系方向和历史、离线Home恢复。错误中的旧创建capability或旧Draft步骤只是fixture/前置入口，不是删除整个当前业务测试的依据。仅退役旧关系直接编辑子路径时，保留关系阅读与真实提案采纳行为，并复用已通过的提案浏览器回归。类型配置不能再夹带new_requirements，应通过真实约定接口保存并校验最终当前要求。`04-boundary.log`的submitAuthorizedReview静态要求已经退役，应更新对应规则，仍保留可信authority_source/conversation_ref及原子物化的有效边界验证。

## 当前Goal与历史关系入口的具体补正

04剩余测试适配发现真实生产入口仍依赖旧Definition状态：`modules/goals/src/board-commands.ts:setActiveGoal`要求`definition_state=accepted`，而默认当前事件意图可以合法保留旧Draft字段；页面同样隐藏其“设为当前Goal”按钮。这与总合同B3/F5的“新Goal可以直接工作，显式选择当前Goal”冲突。移除这条旧接受状态限制及对应显示限制，保留Goal存在性、回收站、归档、已完成校验、原事务、幂等和真实Board焦点记录。选择当前Goal只改变项目焦点，不赋予事件写入权限，也不改绑或发送终端。通过真实当前意图→CLI/MCP显式选择→同键重放／异payload拒绝→当前state与URL→Host重启，以及不存在或回收站Goal拒绝且无副作用验证。此为原F5范围内的入口修正，不新增工作协议。

同一历史只读边界还覆盖目标说明里的关系入口：Workbench调用关系renderer时按真实event owner传入是否允许提交当前结构提案；无owner历史保留方向、来源和历史阅读，不能提供无法采用的写入口。当前owned Goal仍保留已通过的提案采纳流程。该差异随历史关系浏览器回归验证。

04集中diff复核补充：新增历史只读说明与空类型文案必须有实际英文映射，主真实英文fragment反例已复现缺失。归档浏览器用例原本验证Run/Claim/Evidence历史保存，但当前demo不再产生这些记录，不能比较两个空数组充当该场景；使用现有历史夹具补确定的原记录与正文，沿原失败／重试／reload／恢复操作核对。关系浏览器退役旧直接创建／解除表单后，仍须用真实历史inactive关系与解除原因事件保留原方向、原因、历史展开与reload阅读验证；当前提案写入另由已有goals-proposal浏览器用例承接。不新增测试框架或生产旧写协议。

## Skill 与文档的用户结果

一个新 Runtime 只读必要 Skill 指引，即可连接正确项目、发现/创建 Goal、按已有约定工作、保存普通笔记与结果、观察当前差距、处理真正需要用户的决定、明确收尾与继续。没有 Claim/Run 角色转换、续租、固定拆分阈值、强制非空输入输出数组或旧 projection。

主已读取 `/Users/yijunwang/.codex/skills/.system/skill-creator/SKILL.md` 与 `references/openai_yaml.md`，本项按其“只有会改变决策的信息、逐步读取细节、不扩用户意图、不累加通用规则”原则改写。只修改仓库 `skills/goal-advance`；不安装/同步全局 Skill，不改变用户既有调用策略。描述准确路由到明确要求使用 Molis Work，保留已有 metadata/依赖/策略；UI 文案与新能力一致。

- `SKILL.md` 保持足够短的唯一主循环；首次只读 context_resolve，明确 project/Goal 选择与已有授权，普通写入无需重复审批。说明 Host 注入 board/actor，goal_id 仍由调用者明确给出。
- `references/protocol.md` 放少量真实跨工具约束：事实与完成区别、两个版本分别表示什么、正式冲突后读当前状态、幂等、非法批次整批回滚、此前成功调用保留与错误恢复、可信决定不能由 Runtime 自填。部分工作结果可先记录，不等于一个含非法事实的批次可以部分落地。
- `references/execution.md` 给实际可调用的最短普通笔记、typed 报告、human requirement/决定请求、收尾与继续示例。无需提供全部 schema 或重复主文件；示例使用03交付的真实参数，不带被拒绝的 board/actor 字段。
- `references/planning.md` 保留按任务选专业方法、明确真实依赖和结果的实质内容，删除硬编码 2/3 拆分门槛、leaf_readiness、必填规划数组、澄清 Run 与 legacy Tree/Contract 通路。无规划也可先记录；只在需要时读取规划参考。树结构变化按02实际 typed 提案 + 受保护用户决定示例。
- `references/project-connection.md` 保留明确选择与恢复的真实边界；已明确选择匹配唯一项目就 bind，不重复确认。目录只可按实际已验证关系恢复。恢复不导致终端改绑或发送。旧读取 Contract/Claim/Run 指引替换为当前入口。
- `references/service-start.md` 只保留实际服务管理和打开页面的独立职责，目标导航改用新的可信 Goal URL。普通 Goal 工作可不启动 Web；具体承诺/树变更若需要保护用户入口，应说明这一个动作在哪里决定，不能笼统承诺所有操作都完全不需 Web，也不能让普通工作停在新审批流程。
- 更新 `agents/openai.yaml` 的简短描述与 default_prompt；保留其它已有配置。无需新 assets、scripts、README 或模板来充数。

文档范围：`README.md`/`README.zh.md` 中当前协议、首次路径与实际变化处；`docs/mcp{,.en}.md`、`runtime{,.en}.md`、`cli-and-development{,.en}.md`、受影响 `docs/modules/{goals,execution,evidence-verification,governance-collaboration,attention-resumption}.md` 与必要架构边界。过去 spec/历史报告不重写成“从来没有旧协议”；明确当前文档与历史证据的区别。安装步骤仅在事实被改动时同步，不承诺未验证发布物。

## 执行和验证

本项不再开全面方案审查：01–03 handoff + 实际 MCP 名单就是输入。writer 完成 docs/Skill 与必要最终修复；生产新失败只在相关合同内修，若需新契约先交主裁决。

- 运行 skill-creator 的 `quick_validate.py skills/goal-advance`。它只验证包装，不把此结果当行为通过。
- 主按 Skill 示例从真实新临时项目通过公开 MCP 执行完整工作：连接、list/intent、无模板笔记、局部类型、要求、可选结构、报告、拒绝/接受决定、收尾、明确继续、Host/SQLite 重启。每段断言实际状态与副作用；不能只校对字符串/字段存在。
- 逐条重跑上一轮 F1/F2/F4/F5 反例的相反断言，所有新建入口真实开始，不 seed createIntent 绕过 Web/onboarding/Feed。
- 最终 build、boundary 后执行全仓测试一次；新失败对应受影响功能处理。退役测试删除有映射记录，禁止 skip/放宽约束。相关命令已过后不为凑次数再跑，只有新的代码变化才重验影响部分。
- 主在最新构建启动隔离预览，对实际变化的桌面/390px 表单、要求修订/退休、人工决定、错误返回、列表/状态、笔记/报告/继续做真实操作与截图；沿用已接受时间线布局，遵循根 DESIGN，不重做视觉。界面内容不暴露内部版本/身份实现细节，必要并发错误有可执行恢复。
- 自检 diff：覆盖总 spec，无调试/临时开关/不必要依赖/无关改动；最终旧协议代码清理名单与真实保留职责一致。提供可打开的最新预览和真实完成等级/缺口。

主维护总 acceptance.md/progress.md，每项通过/失败/未运行对应具体证据。输出本项 handoff.md + 最终 MCP/退役测试映射文档（复用03已有即可），不用额外复杂状态系统。

04 接口及文案复核补充：D 新增的理由预填/可改写文案应补齐 en.ts 映射并清理已无消费者的“后台自动附上”旧键；实际新建 dialogs-ui.ts 和 dialogs-client.ts 仍有旧 Claim/Evidence/执行门禁提示，随03退役结果改为当前行为，保留真实回收站/恢复职责，不为文案启动新视觉设计。

## 主提前准备的实际界面验收

03B收尾期间，主在上一份成功构建运行 `04-ui-current-workflow.mjs`，`04-ui-current-before.log` 的1440px/390px两条真实操作均通过：实际HTTP新建→无类型普通笔记→界面登记局部类型→新增需人工验收且绑定该类型的要求→支持报告→表单打开后发生真实并发配置修改→旧收尾拒绝且输入/状态保留→刷新后收尾仅记录未成立报告→用户拒绝再接受→正式完成→普通笔记不重开→理由必填的明确继续→重新打开页面。截图 `04-ui-{report,stale-closure-error,resumed}-{1440,390}.png`；主已查看桌面报告、390px并发错误及继续后状态，无横向溢出。

此处验证沿用01既有合同：缺失/过期版本拒绝且无写入；当前版本缺人工验收时保留收尾报告但不生效。主初稿误把后者也当无写入，核对01独立验收后修正探针；另一次仅等待错了提示区域（实际为data-event-conflict），不是生产失败。未改任何生产语义。此为04提前验证的基线，不代替03C后的最新构建与最终Skill/全仓验收。

## 主提前完成的Skill文档

在03B/C业务文件无重叠的情况下，主改写仅仓库 `skills/goal-advance` 的主文件、protocol/execution/planning/project-connection references，最小修正service-start导航，并用skill-creator生成器更新既有三项interface metadata。真实服务启动/修复/前台与常驻边界保留，未添加invocation policy、依赖或全局安装。Grok仍是生产代码与仓库测试唯一writer。04writer复核这些草稿与最终接口，不重启全面Skill设计；其余中英文产品/架构文档和最小UI文案仍待04实施。

`quick_validate.py skills/goal-advance`通过。主 `04-skill-examples-acceptance.mjs` 直接读取execution.md与planning.md里的JavaScript代码块，以真实Runtime MCP执行，而非复制一套可能失真的示例：新会话resolve→create_and_bind→意图→无模板笔记→类型→首次约定→两个事实和progress→人工要求/请求→真实受保护Web拒绝后接受→完成→明确继续→有限树提案/read/check/真实用户批准→Host/SQLite重开及原键重放，`04-skill-examples-before.log`通过。校验真实持久化、当前状态、关系、历史、无Claim/Run和无普通身份覆盖。

首跑发现文档树例子的空source_refs不符合既有来源合同；文档现先保存真实提案笔记，再引用返回的event_id，没有放宽生产校验或伪造来源。此Skill基线已过，C后的最终接口仍需复核。

## 主提前同步当前入口文档

C1测试补正/C2期间，主仅修改8份文档：README中英文、runtime中英文、mcp中英文、cli-and-development中英文。说明统一事件路径、无类型笔记、可选人工要求、正式版本冲突、整批报告与重试、completed/cancelled明确继续、真实用户决定、当前工具和CLI名单、V3迁入状态与旧历史读取。保留服务安装/宿主身份/项目选择、终端独立性和发布边界。README的Node最低版本依实际根package.json修正为24+，未改依赖或安装命令。MCP名单对照当前catalog，完整调用示例继续链接已执行的Skill，避免复制另一套schema。

主`git diff --check HEAD`通过。本次都是文档修改，不为此新增业务测试或重复构建。04writer以这些当前草稿为输入，按C2最终接口校正具体差异；剩余主要工作是当前模块/架构文档、少量UI文案与死胶水、最终全仓和交回。不要从头重写已验证的Skill或这8份入口文档。


## 主提前同步模块职责文档

C2继续删除生产实现期间，主只改文档：`docs/modules/{goals,execution,evidence-verification,governance-collaboration,attention-resumption}.md`、模块索引、系统架构的当前Goal调用段、SSOT相关owner行。当前工作／决定和历史查询／升级职责按已接受C2合同重写，移除旧领取、Run、Draft、Contract/Candidate/Rewire备用执行指引；真实Session／终端、历史原文和项目删除保护保留。Attention明确现有四种处置状态，未实现snooze不当作当前API。

这些为最终C2接口的文档草稿；04writer只核对具体名称／保留调用者差异，不从头重写。包README仍待最终删除结果同步，尤其NativeGoals旧ExecutionValidationApplication、Goals旧legacy_claim_run及Execution旧lifecycle文件链接。主没有修改业务代码或仓库测试。

## 主提前同步包README与最终名单核对

C2c期间主完成五个包README（Goals、Execution、Evidence、Governance、Native Goals），明确当前事件工作、历史查询与文件引用、可信决定的真实职责，移除已删除写服务链接，保留开发命令并指向当前回归路径。本地链接检查通过，文档草稿总计21份；04只按最终源码和C2d测试文件修正具体差异。实际MCP discovery与dispatch验收得到Runtime35工具、管理41工具，已逐项对照中英文MCP文档，组内名单一致。补清无关报告不重开与有效反证撤销当前完成效果的区别，已有独立Runtime反例通过；没有改生产语义或全局Skill。
