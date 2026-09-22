# 04：真实 GoalDetail、历史阅读与旧入口切换

状态：已验收（2026-09-10）。depends_on：03-state-and-decisions（已验收）。最终证据见 [acceptance.md](acceptance.md) 和 [finish-verdict.md](finish-verdict.md)。直接 Grok CLI grok-4.6 / xhigh 执行，主 Session 已独立完成当前影响面的验收；继续05清理与全仓验收。以下首轮失败记录保留为问题演变证据，以最终验收为准。

首轮主 Session 独立验收未通过，正在同一 CLI 会话集中修正。以 [review.md](review.md) 的真实复现、根因范围和恢复验收补充本文；104 项基础回归通过不代表内部完整。05 尚未开始。

首轮修正交回后，主复核结果见 [review-2.md](review-2.md)：基础路径已有改善，但字段控件、较早历史、筛选、判断文案、Goal 依据游标和响应丢失恢复仍失败。当前先合并独立 finish review，再按明确根因集中修正，尚未验收。

## 用户结果与设计基线

真实项目中的 GoalDetail 使用已批准的第三版布局：顶部看当前结果、下一步和风险；左侧是密集时间索引；右侧完整阅读所选事件、工作规划或填写表单。用户可以实际登记类型、提交工作报告、定位相关要求与材料、作决定并显式收尾。刷新和重启后的事实保持一致。

视觉基线是本目录 `../../DESIGN.md` 与 `../../prototype/`，不重新探索视觉方向，不直接复制原型示例数据或 sessionStorage 作为生产数据。保留中性白灰、系统中文字体、克制蓝色、细线分隔和独立滚动。桌面索引约 302px、窄屏为时间线到事件的单栏往返；顶部当前事实不跟随历史选择改变。设计细节以原型和 DESIGN 为准。

## 当前实现证据

Workbench 的 `goal-document-panels.ts` 组装旧进展/完成/记录等面板，`focus-sections.ts` 生成旧卡片切换，`goals-document-routes.ts` 与 `goals-fragment-renderer.ts` 负责页面/片段。`scripts/work-tabs.ts`、`scripts/client/documents-state.ts` 等管理切换。Native Goals 的 `document-projection.ts`、`document-read-ports.ts`、`document-view.ts` 从旧 Claim/Run/Evidence/Review 派生文档。不能只换 HTML 而继续拿旧 action projection 决定新版状态。

`projectGoalDocument` 目前由 `GoalsDocumentReadPorts` 消费全 Board snapshot、旧 work/action projections，并按 Goal/风险/Run/Evidence/Review/提案 ID 汇集 journal。Host `web-goals-read.ts` 调用 `readWebView` 后组装文档与 lazy panel；这是接入新读模型与删除旧片段路由的实际边界。全局树只需紧凑当前状态；所选 Goal 的时间线/正文按需有界读取，不把每个 Goal 的完整历史塞入整个 Board 的初始页面。

接续入口也需要同步：`apps/desktop/src/advance-prompt.ts` 的 onboarding 提示仍强制每次问一个问题、读取规划并形成 Proposal；`plugins/native/work/src/handoff-package.ts` 只消费旧 work_state/Run/Evidence/待检查角色，输入为 `SessionHandoffGoalContext`，Host `web-request.ts` 从旧 readGoalContract 提供。新事件 Goal 的继续/交接必须消费 03 当前状态、要求、决定、最近结果和时效；不要让同一个 Goal 换入口后回到已退役流程。运行服务与真实消息发送机制本身沿用，不新增 Session 或自动发送来演示功能。

现有 `tests/goals-document.e2e.test.ts` 验证 lazy load 失败重试、刷新选择、迟到请求不覆盖新 Goal、桌面/手机；这些有效的异步与恢复约束应进入新界面验收，旧五个 tab 的选择器和行为应删除或重写。

主 Session 已在隔离临时数据库启动真实 Web，并查看 1440px 桌面及约 534px 内容区。桌面目录默认 320px；已有 Goal 工作模式“聚焦 / Runtime”，手机还有目录/目标/聚焦/运行导航。截图 `../../.impeccable/review/production-baseline/desktop.png` 记录旧实现基线，只用于容器及替换范围参考，不是新版验收。演示运行位置保存在临时 `/private/tmp/molis-work-grok/ui-preview.json`；该服务会随后续构建/迁移需要重启。

## 行为合同

- 一个公开当前状态读入口供 Web/MCP 共用，包含当前约定、要求和来源、当前 Concern/决定/收尾、摘要时效与 Host 信号；UI 只展示，不二次算完成。
- 顶部是当前事实。时间线保存接收顺序和日期，默认最新在前，有限分页。每行只显示时间、短标题、类型和作者；点击/键盘定位完整事件。历史正文使用原字段版本，空值说明未填写；普通文本必须转义。
- 响应式按实际 Goal 阅读面可用宽度处理。项目目录与 Runtime 终端同时打开时，即使整个窗口很宽，Goal 阅读面也可能不足双栏；不能只根据 window 宽度决定布局。沿现有浅色/深色与 Standard/Compact 设置使用系统 token，验证不会让新增白底在深色主题突兀或文字失去对比。
- 工作规划页展示实际采用来源/版本、当前要求、已登记类型与可选方法说明。无模板明确显示空白起点；登记类型和启用完成要求是分开的选择。表单按照真实定义生成，必填错误在对应位置；失败保留输入并允许重试，同请求不重复记录。
- 进展、交付、验证、Concern、决定、收尾和自定义记录有各自内容；涉及状态效果的入口消费 03 的 typed command。Runtime 报告满足明确保留作者与核对边界，不能用绿色或记录数暗示独立验收。用户介入和正式收尾使用可信服务，不从任意客户端字符串取得用户身份。
- 历史 Run/Evidence/Review/Decision 按原 ID、来源和实际状态阅读；有确切映射时提供有类型历史事件，否则中性记录展示。映射可重复执行，不复制/删除原业务记录或制造批准结论。
- 新事件本来已写入 journal，历史汇集时不能再把同一个 journal 事件映射出第二条时间点。历史更正保留原始正文与后续有效性变化，不把当前记录状态伪装成当时的判断。已完成旧 Goal 的原结论和来源保留；无法可靠映射的新支持明确未知，不编造新的检查或用户批准。
- 切换已有 Goal 时保留用户验收、依赖、开放风险和未解决决定，处理 03 的状态归属，旧写入明确路由或拒绝；不保留两套可并行改变完成状态的入口。
- 已有执行会话/终端仍由 Host 管理。切换事件归属不能删除 Run/Claim 历史、伪称进程已结束或自动重绑终端；旧 Runtime 若调用已退役写入口，收到可恢复的新版入口指引，不通过重复旧报告生成新的事实。普通事件记录不继续被旧 Claim 的角色阶段阻挡。
- 材料打开复用现有安全文件/链接能力，外部或不可访问材料保留状态，不丢整条报告。不存在附件也可正常上报。
- 空 Goal、无匹配筛选、加载失败、保存失败、版本冲突、断线、刷新及窄屏返回均有可恢复路径。晚到响应不能覆盖已切换的 Goal 或事件。键盘焦点、可见选中和必要 ARIA 沿实际交互设置。
- 幂等重放返回的是原请求回执，不代表 Goal 现在仍处于那一时刻。保存/决定/收尾后从当前权威读取刷新顶部；不会用旧回执或迟到响应覆盖后来出现的反证、待决定或其他新事实。
- 清理被替换的旧 tab、表单、样式和监听器；仍被其他有效场景用到的组件保留并写明调用者。不要等 05 才删除已无调用的整套旧 UI。
- `plugins/native/work/src/ui/terminal.ts` 的 `closed_compound` 禁用表达与 `plugins/native/goals/src/navigation-model.ts` 的父目标标志，需按 03 的唯一 owner/真实能力更新。新版父 Goal 可做自己的整合工作，不能显示仍会自动完成；切换 Goal 不改绑已经打开的终端，打开不会自动发送命令。
- 接续包与“继续推进”提示从同一当前状态读取，真实已决定内容不用再问；未报告/未知与旧协议历史保留来源。Feed 的外部数据边界及脱敏沿用，不能因为换提示正文而丢掉不可信数据标记。用现有 `tests/session-handoff.test.ts` / `session-handoff-recovery.test.ts` 的真实服务与测试 transport 验证生成内容、重试及首条输入，不创建用户可见的真实新 Codex 任务作为测试。

## 读写与分页的补充边界

当前 `GoalEventListQuery` 只有 `after_cursor`，`listEvents` 从较早记录正向读取；`listLatestReports` 只含 report，不能代表完整时间线。04 必须提供有界的“最新系统/配置/报告 → 更早页”读取方式，并继续保留 Runtime 正向接续语义。沿 Goals Module 公开查询增加必要的明确方向/游标或独立历史查询，不在浏览器拉完所有事件再逆序。时间线索引可返回轻量项目，正文根据 event ID 读取；历史映射同样保证分页顺序、无重复和来源明确。

`buildMolisWorkWebView` 目前经 `buildGoalsDocumentCollection` 为每个 Goal 调用旧 `getGoalWorkStates/getGoalActionProjections`、按全 Board journal 建索引。新 owner 的目录状态和主动作必须从事件当前状态得到，不能保留“draft 就待规划 / Claim 存在才正在推进”等旧推断。所选 Goal 的具体约定/Concern/决定/时间线按需加载；不把新事件完整正文塞入每个目录节点。既有 Feed、归档、回收站等有效职责保留，各处同一 Goal 的当前完成/取消表达应一致。

原型提供布局与阅读路径，但未实现正式用户决定、收尾及类型版本修改。生产新增这些行为时沿右侧阅读面与原有视觉层级加入有明确返回路径的表单。所需正式版本来自最新状态，冲突展示“当前约定已变化”并保留输入供对照重试；不得在后台自动改 expected version 后提交旧判断。用户决定的效果、范围和来源以 03 最终有限 Contracts 为准。

## 允许修改面与验收准备

- Workbench：`goal-document-panels.ts`、`focus-sections.ts`、`goals-document-routes.ts`、`goals-fragment-renderer.ts`、`page-view.ts`、相关 `ui-composition`/renderer 装配、`scripts/work-tabs.ts` 与 `scripts/client/` 中确切 Goal 文档状态/监听器、`styles/{base,workbench,responsive}.ts`、`renderer.ts` 的实际样式装配及相关词条；可增设按职责命名的时间线/阅读器/表单文件，不新建平行应用壳。
- Native Goals：`document-{collection,projection,read-ports,view,routes,ui,client,index}`、navigation 与旧 panels/records 的替换面、必要新的事件文档应用/历史映射/HTTP 入口、相应公开导出。
- Goals Module/Contracts：仅 04 必需的有界反向历史查询、历史归属切换/映射和对应有限输入输出；不重写 03 状态服务，新增事实或收尾仍从 03 唯一入口流过。
- Local Host：`web-view.ts`、`web-goals-read.ts`、`web-request.ts`、`workbench-renderer.ts` 和确切 HTTP/capability 装配；沿已有 token/origin/file 访问权限。
- Desktop/Work：`advance-prompt.ts`、`handoff-package.ts`、`SessionHandoffGoalContext` 的实际 contracts/装配、`ui/terminal.ts` 的父 Goal 表达；保留进程与 Session 原有 owner。
- Tests：替换实际退役的旧五 tab 用例，增加/更新真正调用公开 HTTP/浏览器/Host 的时间线、用户动作、历史归属和接续回归；可扩展 `tests/fixtures/goal-browser.ts` 支持截图/测试准备，但不改它来绕过产品失败。新增生产说明留到本项验收后由主 Session 更新共享文档，writer 仅更新所属模块的真实说明。

## 验证准备

使用独立临时 home 和测试项目；公开 Web launcher 支持 `--home` 与 `--port`，不接受数据库 CLI 参数。临时目录通过项目 catalog + Host 创建项目，随后启动真实网页；禁止连接或迁移用户现用 ~/.molis-work。

除构建/边界和真实 Web API 集成外，必须有浏览器关键路径、桌面和约 390px 窄屏截图及交互检查；重启服务后读回事实。最后按 Impeccable 已批准方向执行独立 finish review，具体可用评审方式遵守用户的直接 Grok CLI 执行要求。不得以 HTML 字符串存在或原型截图替代生产 UI 可用证据。


进入执行时的基础命令（03 最终 API 验收后补新用例名）：

```sh
pnpm_config_verify_deps_before_run=warn pnpm build
node --import tsx --test --test-concurrency=1 tests/goals-document-routes.test.ts tests/goals-document-ui.test.ts tests/goals-document.e2e.test.ts tests/goals-navigation-model.test.ts tests/goals-navigation.e2e.test.ts tests/goals-refresh.e2e.test.ts tests/session-handoff.test.ts tests/session-handoff-recovery.test.ts
pnpm_config_verify_deps_before_run=warn pnpm boundary:check
```

同批运行本项新增真实 HTTP/历史归属/事件 UI 集成测试；必要调整旧用例以验证替代后的实际行为，但不删除迟到响应、失败重试、恢复选择等仍有效约束。最终全套测试在 05 统一运行。现有 `goals-document.e2e` 支持 `MOLIS_WORK_TEST_CAPTURE=1` 输出临时截图，可沿真实 fixture 保存最终证据；截图位置须实际返回，不只报告“已截图”。

## 既有 Goal 的明确转交策略

所有 Goal 都可用新版时间线阅读，读取不改变 owner。未转交 Goal 的旧结果、材料和完成结论按原来源展示。新版页面不再保留旧五 tab；历史阅读不需要先转交。

- 未完成旧 Goal：在新版工作规划/继续入口提供明确的“使用事件记录继续”动作。该写操作沿已有 configure/owner 服务事务化、幂等转交，保留已有 accepted 结果/标准、人工验收、真实依赖和风险，不自动采用模板或降低约定。随后全部普通新写入进入唯一事件服务。
- 已完成旧 Goal：默认保留原完成事实与来源，供阅读；不能仅为采用新版界面就清掉完成，也不能把旧结论捏造成新要求的支持报告。用户明确“继续此目标”时，再在同一事务转交并开启新一轮工作，当前 work_status/fulfillment 一致为 open/unmet，旧完成历史仍可读。不存在第二个仍可生效的旧完成 owner。
- 已被 01–03 配置采用的 Goal 由事件 owner 管理，使用当前正式接口；不能再次转交或覆盖当前效果。转交前后的 Host 运行会话保持真实绑定和进程状态。
- 真实旧待用户处理事项保留来源和可操作入口；有可靠动作/要求范围时进入同一当前约束，不能因转交消失或被未知映射当作已解决。不要把旧默认角色义务重新引入所有新版工作。

必要的转交命令/有限输入输出可以落在 04 允许的 Goals/Native Goals 合同边界，复用既有事务和事件服务；不用页面读时迁移，不批量迁移用户数据库，不引入永久双轨状态机制。验收包含旧未完成/已完成两种 Goal 的读取不写、明确继续、幂等重试、原历史保留和一致当前状态。

## 03 已验收的生产接口

- Native `GoalEventApplication`：createIntent/readState/configure/report/listEvents/readEvent、isEventStateOwner/recordProgress/applyConcern/requestDecision/citeDecision/recordTrustedDecision/setAgreement/submitClosure/resumeWork。Host `GoalProjectApplication.goalEvents` 已装配；Web 可信决定使用 Native HTTP 入口和 Host actor，不从表单输入读取 user 身份。
- `readState` 顶层包含 owner/work_status/agreement/progress_summary/concerns/pending_decisions/applied_decisions/closure 以及 config/requirements/recent_reports/observed_event_cursor；要求 `currently_satisfied` 来自唯一状态层。applied_decisions 保留历史；若界面需要“当前有效决定”的额外视图，从同一状态服务公开当前选择，不能让浏览器另算权限。
- `setAgreement` 同时传 expected_agreement_version=`state.agreement.version` 和 expected_config_version=`state.config.version`；`submitClosure` 同样传两个当前版本。缺版本或冲突不能自动换版本后偷偷重试。
- 可信决定 `effects` 为有限列表：accept_requirements/reject_requirements（需 requirement_ids）、accept_concerns/reject_concerns（需 concern_ids）、authorize_action/deny_action（action 必须与 scope.action 一致）。只传 effects 即可；不要额外填一个不同语义的 accepts_requirements bool。当前用户操作选择明确效果与范围，UI 不让用户编辑原始 JSON。
- 系统事件 payload 以 operation 判别的有限 union，历史正文包括 progress.summary 等；按原 type version 显示动态字段。所有写回执区分 recorded 与 completion_applied；写后重新读取当前状态。当前记录按 journal_seq 排序，本次回执对应本次 event_id。
- 完成被现有明确 depends_on、人工验收、完成 Risk、相关 Concern/待决定或缺结果阻止时，报告仍可保存，UI 展示实际 unmet_reasons 并定位处理入口。不要用旧固定 Role/Review 阶段替代这些条件。

03 验收证据：独立 build、41 tests、boundary、四组真实 Host/SQLite 复现通过；详见 03 spec 和 implementation.md。新 UI 验收必须实际操作以上接口，不能用脚本写完数据后只证明静态阅读。

## 本轮关键决策（review A–F）

- **混合历史页**：文档时间线是当前 Goal 的轻量混合索引（工作事件 + Run/Evidence/Review + 相关 journal）。先收集索引、按 `received_at` / `journal_seq` / `item_id` 稳定降序，再按 `limit` 切片。`before_cursor` / `next_cursor` 是上一页最后一条的 `item_id`（不含该条）。禁止把全部 legacy 附在每个工作事件页上。Runtime `listEvents(after_cursor)` 不变。
- **去重**：仅当 journal 的 `event_id` 已在工作事件流，或类型属于 `goal.event_*` 新工作前缀时跳过。不得因 `object_id` 命中 Run/Evidence 而丢掉相关 journal 变化。
- **来源**：Review 的 `actor_kind` 由 obligation 角色判定：`human_approver`→user，`self_verifier`→runtime；不能可靠判定时为 `null`，不得把 Runtime 自检标成用户决定。
- **正文**：索引行不携带全文。`GET /api/goals/:id/history/:itemId` 按稳定原 ID 读取，服务端与页面共用同一渲染。定位要求/事件走该入口，不为定位拉完所有页。
- **普通补充**：`recordNote` 写入系统事件 `observation_note`。不改 progress_summary、不猜类型字段、不作完成判断。
- **继续**：未转交仍用 `continueWithEventWork`。已取消用既有 `resumeWork`。已完成且已是事件 owner 用 `reopenCompletedEventWork`（既有 `syncClosedState(open)` + `completion_reopened`），不改 03 完成判定。
- **HTTP 收尾**：`kind` 不是 `complete`/`cancel` 时 400 且 `event_closure.invalid_kind`，零事件、零状态变化。缺 `kind` 与未知值同等拒绝。
- **保存链**：POST 成功但读回失败时保留原幂等键，只恢复读取或原回执重放，不声称顶部已更新。刷新后恢复 Goal/事件/阅读器/筛选。版本冲突展示当前约定并保留输入，由用户明确按新版本再提交。
- **按 ID 读正文**：`GET /api/goals/:id/history/:itemId` 按稳定 `item_id` / `original_id` / `event_id` 直接解析 Run/Evidence/Review/journal/工作事件，不为定位或正文拉完全部页。
- **规划方法**：采用表单读取 Host 当前有效方法（built_in / personal / project）。只写入当前 Goal 的 `adopted_planning`，不改项目级规划设置；空白起点不自动采用。
- **冲突恢复**：409 展示当前预期结果和两个版本，保留输入；用户点“按当前版本重新审阅后提交”后才写入新 expected versions 并换幂等键。
- **读回失败**：区分未写入与已保存。读 document 失败时保留原幂等键，提供“重试读取”；成功写入后的顶部始终来自当前权威读取，不用回执覆盖后来的反证。
- **完成闭环**：受阻完成记录收尾事件但 `completion_applied=false`，展示真实 unmet，当前状态仍为 open。显式完成/取消后提供可达继续入口；继续保留原完成/取消历史。已完成事件 Goal 走 `reopenCompletedEventWork`，已取消走 `resumeWork`。
- **报告字段身份**：内容只从 `data-report-field` 读取；判断只从 `data-judgment-requirement` / `data-judgment-verdict` 读取；标题只从 `data-event-title`。01 已允许的字段 ID（含 `title`/`requirement_id`/`verdict`）原样保存，默认零 judgments。
- **有界混合索引**：每一页只向后取足够的工作事件，与该 Goal 的 legacy/journal 合并后再按 `limit` 切片。禁止 50×100 静默截断，禁止每次翻页从最新工作事件重读已经翻过的页。若 `before_cursor` 是工作事件，从该条 `journal_seq` 继续向更早取；legacy 游标才从最新工作事件扫到覆盖该时间点。混合页稳定条件是：本页最后一项不早于已取到的最旧工作事件（`compareHistoryItems(pageLast, oldestWork) <= 0`），或工作事件已耗尽。工作事件尚未耗尽时，即使本批合并结果刚好等于 `limit`，`next_cursor` 仍为本页最后 `item_id`，不得变成 null。`lane`（result/decision/problem/other）由 kind / semantic_family / system operation / source 决定，首屏与追加分页同一字段；筛选不看标题。
- **阅读状态**：selected item ID、filter、reader 独立于当前 DOM。定位首屏外记录后保存仍回到该 ID；追加行带 `data-lane` 并套用当前筛选。
- **Goal 依据游标**：`goal_event_cursor` 是当前 Goal 工作事件的最大 `journal_seq`，空白为 0。进展 `based_on_cursor` 只用它，不用 board `observed_event_cursor`。0 在无本 Goal 事件时合法；其他 Goal 的 seq 仍拒绝。
- **丢失响应**：Host 一次性键对已完成的同一 key 放行到业务幂等回放，返回原回执；仅并发 in-flight 拒绝。客户端不把“已经提交”当成约定冲突、不换键。`event-resume` 用表单 `resume_kind` 固定 reopen/resume，不按重试时的当前状态改命令。
- **类型/要求 ID**：新建时自动生成并在界面用隐藏值保存；编辑与历史保留原 ID。创建类型默认画出一条可编辑字段（名称/形式/必填/移除），至少一条，禁止 `buildPayload` 静默发明 `body`。
- **阅读文案**：索引与 meta 用中文类型名；判断按实际 verdict（支持 / 尚未达到 / 仍无法判断），unknown/contradicts 不得写“报告满足”；Scope 与依据用要求陈述并可定位，原 ID 仅辅助。

### 主根因复核补充（2026-09-10）

- compact refresh 和普通 document/完整页面必须装配相同的当前事件正文；自动刷新替换后按同一生命周期恢复阅读状态，不能把缺数据的占位正文当作有效刷新，也不能靠关闭刷新或延长等待避免失败。
- HTTP 重放例外仅限已具备业务幂等回执的事件命令；其他旧 Web 命令继续使用原一次性键保护。相同键不得在旧创建入口执行第二次写入。
- 原刷新正文装配与旧命令保护已通过主独立复现。后续只修同一阅读生命周期中已经复现的两个边界：换 Goal 不沿用其他 Goal 的记录 ID；只更新正文不得推进整页观察游标，整页状态必须在实际应用对应刷新后才更新。组合 e2e 等待本次写入及对应正文游标，不能等待保存前已经存在的状态文案。原长历史、字段/筛选/选择、响应丢失、跨 Goal 依据和重启续接的通过证据保留；04 仍未验收。
