# 02 统一新建、结构、发现与恢复

状态：A–F 修正及主验收通过，2026-09-10。depends_on：01 主验收（已通过）。主需求：[../../spec.md](../../spec.md) B 段，审查 F3/F4/F5。完成等级：4 的本项切片。

## 结果与已有证据

用户从 Web、新项目引导、Feed/Inbox 或 Runtime 创建 Goal 后即可记录和工作；可选树结构由真实 Runtime/Session 提议，经受保护的用户决定落地。列表、单 Goal 和项目恢复读取同一事件当前事实，不出现旧角色可领取/可澄清/Contract 状态。

已证根因：`http/create.ts` 与 `createGoalCapability` 直接调用 `goals.commands.createGoal`；onboarding 间接走这个旧 capability，Feed `goal-promotion.ts` 也直接调用旧 command。只有 `GoalEventApplication.createIntent` 采用事件状态；它当前不接 priority/why/business_logic/入口来源，不能简单换名字后丢字段。树 `goal-tree-submission.ts` 强制 active Run + 角色/leaf/decomposition gate，materializer 调旧 accepted contract lifecycle。项目恢复 `projectResumeFactsCapability` -> `buildMcpResumeView` 用旧 action projection。

## 行为与取舍

1. `GoalEventApplication.createIntent` 是新建应用入口；可选的用户原文、上下文、priority、来源、要求和关系保留真实职责。底层 Goals command 仅负责持久化基础身份。Web 创建关联与要求必须与创建作为同一个可重试应用操作，关联失败不留下半个 Goal/重复关系；Feed 升格的链接、输入绑定与幂等语义保留。没有填写的要求/规划不生成假的默认值。
2. 新 Goal 的输出与视图只表达意图、当前约定和事件工作状态；不把旧 draft/abstract/accepted 当执行门槛。移除新入口的“转交事件记录”、澄清 Run 提示。低层历史 GoalRecord 若仍有旧列，只作历史/迁移字段，不扩散到新 Runtime 状态别名。
3. 结构提案去掉 `discovered_in_run_id` 输入及派生角色权限；提交身份由绑定 Host 注入 Runtime/Session（管理/用户来源沿用保护入口）。提案明确 root 或项目范围、新 Goal 内容、父子与依赖关系、相关对象基线、理由。没有现成 Goal 时也不要求先创建临时 Goal 以拿 Run。
4. 优先让结构入口只承担新 Goal 和关系的创建/调整；已有结果与要求修改统一用 01 的 typed agreement。不要把旧 Contract/Policy/Risk/Candidate 的万能 payload 一并搬成新树协议。若保留某种条目，须给出此项用户结果所需的真实生产职责和有限类型，不能只因旧代码/测试存在。Concern/用户验收已有事件入口。
5. 保留图循环、跨 Board 引用、失效对象、相关基线变化、用户部分/整组决定、事务和幂等；用户批准的是展示的具体内容，禁止批准后替换内容。仅相关对象变化导致冲突，普通无关笔记不机械打掉结构方案。历史旧提案可读，不再从新 check/decide 走旧协议落地。
   当前 Host 没有可信用户消息通道；旧 Runtime `goal_tree_decide` 中的 `user_confirmed`/`confirmation_summary` 不能继续充当受保护写入的授权。用户经现有 Web/管理入口决定并落地，Runtime 读取结果；若保留引用入口，必须引用已经保存的那份具体提案决定，不得增加布尔自证通路。
6. 增加简洁 `goal_list` 公共读入口，按有限的状态/分页或数量过滤，输出 ID、标题、当前状态、必要待办提示和游标；没有旧 available/ready/contract/explain 别名。状态读取只留一份当前约定。目录、详情与 project_resume 消费相同事实/摘要；保留 Host 焦点与 Session 焦点的明确优先序，读取/切换 Goal 不自动改终端绑定、不发消息。
   当前 Skill 的打开入口从 contract 取 goal_url；删除旧 contract 后由 MCP 的当前 Goal/列表呈现层提供可信 Goal URL，沿用已绑定 Host 的 base URL/项目上下文，不把 URL 拼接职责塞入 Goals 状态 Module，也不让 Runtime 猜地址。
7. 对当前进行中的工作，明确区分“可继续记录”与“尚不可完成”的依赖/要求/待用户决定；不可因为没有 Claim 而判为不能工作。正式完成仍走 01 的门禁。

## 已有数据：单向升级，编码前定稿

本项选择一次性转入事件状态，避免旧未完成 Goal 永久失去继续工作的入口。只在临时数据库验证迁移代码，本轮不打开或升级真实用户库。

- 原始 Goal、关系、来源、Run/Evidence/Review/决定/文件与完成历史全部保留；不伪造新的 Runtime 报告、用户验收或授权。
- 旧当前结果与 acceptance criteria 复制为事件约定/当前要求，保留原 ID、statement、显式人工验收属性及来源。当前要求读取从事件表出发，不再同时拼接旧 criterion 形成第二套可修订权威。
- 未完成旧 Goal 转为事件 open，旧证据供历史阅读，不能自动伪装成当前新版 supports。原有明确依赖与阻塞事实仍参与对应检查。
- 当前完成上下文还消费 `resolveGoalPolicy().human_approval` 与 `completionRiskReasons`。技术方案须明确这些已存在的人工责任/有效阻塞如何一次转入当前要求/Concern 或保留一个有实际职责的事实读取；不能因删除旧执行器而默默取消它们，也不能留下不可修改的旧门禁。旧自动角色/租约/固定审查人数不作为新执行机制延续。
- 已有完成事实不能被数据库升级清掉。用明确的历史来源保存其现状；“明确继续”之后开启事件新一轮，重新核对当前要求。不得为了让新状态满足而编造报告/用户批准。具体如何表达迁入的完成来源与其历史入口，由 writer 在 technical-plan.md 给出最小字段/写入与读取方案，主在编码前定稿。
- 旧活动 Run/Claim 不再给予新协议权限；保留为历史。真实 Host 终端/进程与 Runtime Session 服务保持有效，不按 run 字样误删。
  迁移验证包含带旧活动 Claim/未结束 Run 的临时 Goal，证明它们不会在新协议中造成无法记录、无法继续或永远等旧租约的死路；不终止真实终端或后台进程来完成数据升级。
- 迁移为按版本一次执行、整事务、重启不重复，不新增通用兼容层/每次读取自动转换/备用旧工作协议。新项目直接创建最新 schema。

## 范围、顺序与验证

允许：contracts 的 goal/event/tree/runtime-resume 相关类型；Goals 事件创建/当前读取/迁移；Governance 树提案与受保护决定；native Goals tree/entry/HTTP/document/collection 查询与真实构造接线；Feed promotion；Local Host onboarding/project capabilities/composition/MCP resume；MCP goal_list/tree/state 合同与调用；相关 Workbench 状态和入口文案；这些行为测试。保持模块所有权，Host 不直接写 Goals 表。

不处理：全局删除旧 MCP/CLI/execution 写入及全部退役代码（03）；Skill/完整文档（04）；生产安装/迁移、重做视觉、外部发布。因本项有新消费者替换，可删除已无职责的相关旧 tree/read glue；共享协议最终清理仍由03串行完成。

先读足够相关链路，交一两页 technical-plan.md，重点是结构 typed wire/批准 materialization、单向迁入已完成的真实来源、列表与 Web 状态的唯一来源、允许删去的旧 tree 条目。主定稿后同会话立即执行。不要先写代码，再发现自己保留了两套权威。

必须真实证明：

- Web `/api/goals`（含要求/父子/依赖与错误回滚）、onboarding initialize、Feed/Inbox promotion/start-processing、MCP intent、树创建各自实际入口产生可工作的事件 Goal；不能预先 createIntent 种数据冒充这些入口。
- 没有任何 Claim/Run 可提交、检查并批准结构关系；循环/跨项目/相关陈旧基线失败无部分写入；同键重试/Host 重启保持一次落地；新增树 Goal 可直接 report。
- 同 Goal 的列表、状态、恢复和页面一致；未填规划仍可记录；完整状态不再含 legacy_claim_run、旧 role readiness 或重复 current_agreement/intent outcome 别名。
- 临时旧版本 DB 含未完成、已完成和带人工要求的 Goal：一次迁入后要求/历史/原完成不丢、不生新批准；明确继续已完成后旧完成退出当前，重启无重复。
- build、boundary 与针对性真实入口/树/恢复/数据迁移测试通过；被退役测试记录行为去向，禁 skip/放宽为绿。全仓和最终UI在04。临时日志 `/private/tmp/molis-work-flow-cleanup/02-*`。

输出本项 handoff.md：接口与迁移最终行为、实际调用链、删除/保留理由、命令证据、未完项；主共享 spec/progress/acceptance 仅由主更新。

## 技术方案主裁决（编码前，2026-09-10）

采用 [technical-plan.md](technical-plan.md) 的单一 createIntent、受保护树决定、统一事件读取和迁移 36 方案，并以本节修正草案中的遗漏；writer 先同步技术方案，再直接执行，不等待第二次批准。

1. 迁移扫描所有已有 Goal。缺 owner 的才补 owner/open 或历史完成；**所有 Goal** 尚未转入的旧 criterion、实际生效人工 policy 和完成阻塞均须转入当前事实。已有事件要求（包括退休状态）、类型、绑定、报告、用户结论、约定版本、owner 和真实 closure 不覆盖。既有事件报告对同 ID criterion 的真实支持保留；仅纯旧 Evidence/Review 不转换成新 supports。测试必须包含已 owner 但仍依赖旧 criterion/policy/risk 的混合数据。
2. 人工 policy 依据切换前 `resolveGoalPolicy(listActivePolicyBindings(board, goal)).human_approval` 的实际结果迁入，覆盖 project_default 和适用 Goal 绑定，不只迁 Goal 级 true 行；来源保存真实绑定引用。每个 Goal 一个可验收、可修订或退休的迁入人工要求即可。风险按 `completionRiskReasons` 的真实条件（包括 invalidate_on_trigger）迁入可处理 Concern。迁入 ID 含 Goal，避免同一项目 policy/风险影响多 Goal 时主键碰撞；原始行保留。
3. 迁入历史完成引用真实 completion/lifecycle journal 事实（若存在）及原 Evidence/Review；`accepted_at/by` 只表示旧 Contract 接受，不能当作完成者/完成时刻。UI 明示“迁入的历史完成”，与新 closure 区分。旧数据若仅有 fulfillment 字段就如实记录该来源，不补造完成授权。既有 event owner/closure 不被改成迁入完成。
4. 当前结果只在 `agreement.outcome` 出现。`intent` 若保留，只含身份/原始上下文，不重复 outcome。`can_record` 与生产 recordNote/report 的实际准入一致：未删除/未归档的 owned Goal 可以保存普通事实，completed/cancelled 上的普通记录不自动重开；开启新一轮仍需显式继续与原因。不能 UI 说无法记录而 API 允许，或用 can_record 混称 completion eligibility。
5. 新结构写入只用 `kind=goal`（create）和 `kind=relation`（part_of/depends_on，create/deactivate），不另留 dependency 同义 kind。为这两类定义有限 discriminated input，旧万能 Record payload 仅历史读取可留。新 goal payload 不带 board/actor/session/idempotency 嵌套覆盖；来源由 Host 注入并持久化。Runtime tree_decide 从 discovery 移除且实际调用不可写入；可信管理/Web 的批准只落地保存的具体内容。
6. 技术方案补明确关系基线：使用相关目标身份/删除归档状态、关系事实的实际版本或内容，不能用会随笔记变化的 Goal updated_at 或整个 board cursor。相关引用/关系改变要冲突；无关笔记和不影响结构的约定改变不冲突；确认所选集合时在同一事务检查最终图及全部相关基线，故障不部分落地。空项目可一次提出多个新 Goal 和相互关系。
7. createIntent 来源 source_kind 实际保存到新建来源事实，不只接收后丢掉。列表分页游标与事件游标区分用途，说明具体含义；列表/恢复/Web 都读同一摘要，保留原 Host 与 Session 焦点优先序。

新增迁移反例：旧 completed、活动 Run、人工 criterion、project_default 人工责任、多 Goal 共享风险、已有 event owner 的旧要求混合状态；只使用临时库。主保存的源库只复制，不直接用新代码打开或修改。

## 首轮主验收与修正边界（2026-09-10）

完整 build 与 boundary 已运行；writer 定向测试还有失败，尚未交回。主在首次可构建版本用真实 MCP/HTTP/Host 和临时库独立验收，不改生产代码。以下均为本项原合同的缺口，继续由唯一 Grok writer 修正，不新增用户审批。

1. **所有当前要求可修订。** `origin.kind` 新增 create_input/imported_acceptance_criterion/imported_human_approval 后，01 的 `assertRequirementTargets` 仍只允许 goal_event_requirement，导致 Web 新建要求无法修订、迁入人工 policy 要求无法退休。`plugins/native/goals/src/event-document-forms.ts` 的 `renderAgreementForm` 也用相同来源过滤，使这些要求在编辑表单消失；接口和真实表单需一起修。来源只表示来处；当前事件表中的有效要求都应走同一修订/退休/授权规则，不能用来源决定另一套可写性。历史与原来源保留。
2. **保留已有有效用户决定的作用。** 真实迁移前 mixed owner 已获同范围 authorize_action(complete)，原系统完成只受实际风险阻塞；风险解决后，迁入的新人工要求不能再要求一次批准。允许迁移一次性把仍然有效、范围适用的原批准表达为迁入人工要求的结论，须引用原 decision/actor/time，并保留原决定行和真实 closure；不得把任意历史批准、被覆盖/拒绝的决定或不相干范围套用，不新增可信用户决定。原始 Evidence 不转 supports。主保存 approved / approved-completed 两份源库作为反例。
3. **创建来源和回执真实。** Feed 来源不能因最新 40 条中不再有创建事件而变成 Web；Runtime 默认创建应持久化 runtime 来源。来源读持久事实，与历史分页无关。新建结果/HTTP onboarding 不再输出旧 definition/decomposition/fulfillment 别名，当前事件游标包含本次完整创建及其要求/关系。
4. **Web 成功重试。** 创建与树决定已具备应用幂等，HTTP 通用一次性键检查却在成功后返回 409；该真实新流程的重试应可进入已有幂等入口返回原结果。保留在途并发保护、Origin/Token 和不同输入同键拒绝，不放开所有无幂等的管理端点。树 Web 每次随机生成 authority.message_ref 又造成同一业务键请求 hash 不同，需绑定稳定请求来源；重启后重试也返回同一次落地。
5. **分页与明确恢复焦点。** `updated_at|goal_id` 分页应按所存排序锚点继续（或明确报陈旧），不能因 anchor 已更新/删除而 findIndex=-1 后返回第一页。Host/Session 明确焦点应按 ID 单独读取/校验，不受普通发现 limit=100 截断影响，且不能覆盖终端绑定或向 Runtime 发消息。
6. **完成有限类型与相关删除。** 新提交 input 必须真正引用 goal/create 与 relation/create|deactivate 的 discriminated union；只声明有限 payload interface、实际 items 仍接旧万能 kind/Record 不算完成。新协议不用的旧 MCP tree payload 不能仅增加 export 来压掉 unused 错误；去掉实际无消费者的定义和 glue。03 仍负责全局旧协议退役。

独立证据 `/private/tmp/molis-work-flow-cleanup/02-entry-acceptance.log`、`02-tree-acceptance.log`、`02-migration-acceptance.log`（脚本同名 .mjs）。脚本在相互独立场景中累计失败并最终失败，不把继续诊断当作通过。已通过：真实引导/Web/Feed 创建与失败回滚，源/关联/要求重启保留；无 Run 树提交/检查/真实 Web 批准、部分选择、精确关系基线变化、全批循环、跨项目落地拒绝；迁移写失败回滚、四种样本原历史/支持/完成保留、明确继续；列表与单 Goal 状态一致。未通过项见上。

基线测试只用精确引用关系本身的实际变更；两个共享端点但可交换的独立关系添加不要求机械冲突。跨项目/循环提案可以保存供检查，但 check/批准必须拒绝落地且无部分业务图写入，未知控制字段/退役 kind 在新输入校验拒绝。

### 修正 A 主验收通过

2026-09-10：接口与表单均按当前要求成员资格处理。`02-a-build.log` / `02-a-boundary.log` 通过；`02-a-tests.log` 6 项通过，无 skip。主实际 Chrome 点击验证 `02-a-ui.log` 通过：1440px 新建要求改原文并设人工验收，390px 迁入人工要求退休，最终当前状态符合输入；两张截图已目视检查。01 的保护性授权与 CAS 沿用；B–F 仍待完成。

迁移回归当前还依赖本机 `/private/tmp` 的源库。B 需把真实旧版测试输入变为仓库内可复现 fixture（保留原始旧 schema/历史事实），禁止继续把本机临时文件作为测试前提。主已从四份不可变 v35 源库导出标准 SQLite SQL dump 到 `/private/tmp/molis-work-flow-cleanup/02-{legacy,mixed,approved,approved-completed}-v35.sql`，可纳入测试 fixture，在临时 DB 还原后走真实首次打开迁移；不使用新版本先迁好再伪装旧版本的测试替代物。

### 修正 B 首次独立复核

四份旧 SQL fixture 已纳入仓库。主先重新构建（包的运行入口指向 dist），`02-b-build.log` / `02-b-boundary.log` / `02-b-tests.log` 通过；`02-b-migration.log` 四份真实旧库的首次迁移、风险解决后批准复用、原历史/真实 closure 与重启全部通过。

B 尚未主验收：`02-b-scope-acceptance.mjs` 在旧版真实样本的临时副本上构造有明确 requirement scope 的历史批准，再改变该要求的当前 statement；实际首次打开后仍被迁移为有效人工结论，`02-b-scope.log` 失败。当前 helper 只比较 outcome，没有比较原批准所覆盖要求的承诺内容。修正需核对已保存 scope/commitment 中的要求仍然存在、有效且 statement/human decision/binding 等承诺相同，并按原有效完成决定规则排除后来拒绝或覆盖；不得把同结果视为所有要求均未改变。不改原始四份 fixture，不扩日常授权语义。

后续 `02-b-final-*` 构建/边界、9 定向、四库迁移及 statement 范围负例均通过。主发现快照仍漏了生产当前读取会合并的 `goal_event_requirements.bound_type_id`：`02-b-binding-acceptance.mjs` 的真实旧 schema 临时变体中，不变的直接绑定错误丢失批准，新加的直接绑定错误复用批准；`02-b-binding.log` 两例均失败。仅补齐这个既有字段与显式绑定表的去重合并，再验收 B；比较算法仍用现有 `commitmentsMatch`，不新增授权规则。

### 修正 B 主验收通过

2026-09-10：快照已合并直接类型绑定与显式绑定表，当前完成决定与完整范围承诺共同限定迁移复用。`02-b-binding-{build,boundary,tests}.log` 通过（10 定向，无 skip）。writer 退出后，主独立重跑 `02-b-root-migration.log`（四份真实旧库、回滚/批准作用/历史/重启）、`02-b-root-scope.log`（原文未变/已变）、`02-b-root-binding.log`（直接绑定未变/已变），全部通过；diff whitespace 检查通过。B 关闭，C–F 继续串行执行。

### 修正 C 主验收通过

2026-09-10：来源从持久化创建事实读取；Runtime 拒绝自带渠道并由 Host/MCP 设置 runtime；新建及 onboarding 回执移除旧状态别名，保存的游标覆盖完整创建事务。`02-c-build.log` / `02-c-boundary.log` 通过。writer 退出后，主 `02-c-root-runtime.log` 的真实 MCP 创建、要求/关系最终游标、任意渠道覆盖拒绝、45条后来源与 Host/SQLite 重启全部通过；`02-c-root-entry.log` 中实际 onboarding/Web/Feed 来源、回执与回滚通过，唯一剩余失败是 D 的成功创建重试409；`02-c-root-tree.log` 中树来源与 Runtime 回执通过，剩余失败仅D/E。

仓库相关测试18通过、1失败、0 skip；失败为树测试未绑定整组确认到具体提案（whole_confirmation_ambiguous），应在F的剩余02测试收口中按真实受保护确认合同修订，不能放宽生产授权。真实 Web 整组和部分批准在主结构探针均通过，不将此测试输入问题误作 D 的 message_ref 根因。整个02仍未主验收。

### 修正 D：HTTP 通过，补齐实际表单依赖

D 首轮构建、边界、独立脚本的 writer 执行通过：`02-d-web-retry-after.log`（真实 Web 重启、同键/新HTTP键、整组/部分/拒绝、原子副作用、Origin/Token、在途与非幂等保护）和 `02-d-entry.log` 全部通过。主尚未验收 D。

主核对实际调用方发现：`proposal-client.ts` 在有系统问题时仍允许退回理由为空，`proposal-ui.ts` 仍将理由标为可选并声称后台自动附上问题。取消后台动态改写后，这条真实界面路径会空提交失败。D 必须同步：在显示决定表单时把当前已展示的问题预填为可编辑的具体退回理由，用户看到后可直接采用或修改；提交传原理由，前端对确认/拒绝统一拦空，并移除“提交后自动附上”的过时文案。理由来自已展示问题，不新增缓存/第二套校验或恢复后台按变化后的状态改写。实际 Chrome 点击验证预填提交、用户改写、清空报错和重试保存内容一致。其它旧 Risk/固定拆分界面的全局清理仍归03。

完整调用链还包括客户端操作键：`dialogs-client.ts` 的新建和 `proposal-client.ts` 的树决定每次都直接调用 `molisWorkControlHeaders()`（该函数每次随机生成键），未像当前 `event-document-client.ts` 那样在表单保存本次幂等键。成功响应丢失后再点同一表单，会变成另一操作。D 同步采用现有表单局部键模式：首次有效提交保存键，同一未完成提交重试复用该键；成功结束后清理，新的创建意图取得新键。只有这两个已有业务幂等入口需要调整，不修改全局控制头或扩大其它管理端点权限。真实 Chrome 模拟请求已经保存但响应丢失，验证再次点击返回同一个 Goal/树决定且无重复业务副作用。

### 修正 D 主验收通过

2026-09-10：创建和树决定沿业务幂等返回原结果，可信来源随业务键稳定；实际表单保留同次未完成提交的键，成功后清理。writer 最终 build/boundary 通过。writer 退出后主独立运行 `02-d-root-web-retry.log` 与 `02-d-root-entry.log` 全部通过，覆盖实际 Web 重启、body/header 键、整组/部分/退回、不同输入拒绝、Origin/Token、在途请求和非幂等端点保护。真实 Chrome `02-d-ui-retry-after.log` 通过：两处表单均先由服务端保存，再人为丢失成功响应，点击重试取回原 Goal/决定且数据库无重复。`02-d-ui-after.log` 的 1440px/390px 预填、清空本地拦截、改写原文落地通过；截图已目视检查，无横向溢出。主探针曾修正隐藏条目选择和同页锚点导航的等待方式，未改产品行为或业务断言。E/F 继续。

### 修正 E 主验收通过

2026-09-10：列表按游标中的原排序值继续；明确焦点沿 presenter→Host capability 按 ID 读取，复用同一当前摘要，目录100上限不变。build/boundary 与7项相关仓库测试通过，无skip。writer退出后主 `02-e-root-pagination.log` 与 `02-e-root-focus.log` 全部通过，覆盖同时间戳、锚点更新/回收站、非法游标/状态、100之外 Host/真实 Session 优先与回退、Host重启，并验证Session关联及消息记录未改。diff检查仅发现新增测试文件末尾多一空行，F顺手清理；无业务缺口。F继续。

### 修正 F 首次独立复核

有限类型已落地且构建通过；主复核发现两个输入边界问题，尚未验收F。`02-f-root-tree-before.log` 在已验收的仅 `relation_id + reason` 解除具体关系路径失败：新normalizer错误要求再给两端和type。新类型必须如实表达既有行为：relation/create需要两端/type/reason；relation/deactivate可按具体relation_id/reason，或按明确两端/type/reason定位。继续使用原精确关系基线与全组原子检查，不改主探针去补冗余字段。

`02-f-wire-before.log` 通过真实Runtime MCP证明，`human_decision_required: "true"` 与对象类型title均未被拒绝。新payload组装把非法人工字段删掉、把对象转成字符串，可能把承诺输入变成另一含义。原模块明确要求人工字段为布尔；必须在提交持久化前拒绝错误类型，合法true/false原样保留。有限payload及来源字段的转换不能通过filter/String/Number或默认值吞掉错误输入；复用既有校验职责，不建立另一套任意schema。主新增独立静态探针 `02-f-types-acceptance.mts` 验证实际submit与revised_item接口，首次旧dist编译基线确认六个非法输入原来都被接受。

当前定向回归首轮为77项、69通过、8失败。主核对 `bounded latest reports`：最新55至51的断言已通过，失败是正向50条页面中除配置外又含当前owner事实，因此末条report48而旧测试期待49；仓储已经按journal_seq排序，不是最新读取顺序出错。相关分页/总条数测试应按当前真实事件内容建立独立预期，保留完整分页、唯一性、跨Goal拒绝及重启行为，不能为旧计数删除当前事实或改写排序。其余旧criterion/父结果/人工责任测试须按当前要求事实建立输入，保留相同业务保护。

### 修正 F 与02主验收通过

2026-09-10：主在修正后的真实构建独立运行 `02-f-root-wire.log`、`02-f-root-types.log`、`02-f-root-tree.log`，通过原始输入拒绝、合法人工字段保存、实际submit/revise有限类型、ID停用及全部结构保护。`02-f-root-entry.log` 与 `02-f-root-migration.log` 通过全部真实创建入口、事务、来源/要求/关系重启、四库迁移及原批准作用。入口探针首次因沙箱本机监听权限未运行，使用已授权隔离本机端口后实际通过，未改业务断言。

主 `02-f-root-ui.log` 和 `02-f-root-ui-retry.log` 通过1440px/390px真实表单、决定与丢失成功响应后的幂等重试，截图已目视检查。build/boundary通过，77定向及2个关键Web用例通过；分页断言经主复核恢复独立精确内容和顺序后，13个事件测试通过，无skip（`02-f-goal-events-review.log`）。diff空白检查通过。

A–F与02在既定范围内关闭。尚存旧Candidate/Rewire/Contract/Risk与角色拆分测试及生产入口按03退役图处理；未把整个web.test.ts或全仓测试标为通过。03继续处理公共接口与旧实现，04处理Skill与最终全仓/使用路径验收。
