# 04 第二次主验收：恢复与历史合同仍需修正

2026-09-09。Grok 首轮修正已停止。主独立 build / boundary 通过；本次定向回归 78 pass / 1 fail / 0 skip（79 个用例）。原 HTTP 非法 kind、旧记录分页/来源复现通过；原浏览器复现中表单、普通补充、首屏内选择保留、已知保存成功后的读回重试、取消后继续入口均通过。**04 仍未验收，05 未开始。**

本次是对 [review.md](review.md) 中已有字段、历史、来源、恢复合同的复核，不增加产品范围。停止继续在 DOM 上逐点补条件：先把每组失败的输入/索引/读取/状态恢复调用链梳理清楚，补必要关键决策后集中修正。主 Session 另行调度一次独立 finish review，结果合并到同一修正批。

## 可复现证据

均从仓库根目录运行 `node --import tsx --input-type=module < /private/tmp/molis-work-grok/<脚本>`，使用隔离 SQLite / HTTP / Chrome；没有用户数据迁移。日志前缀 `04-recheck-`。

- `04-recheck-build.log` / `04-recheck-boundary.log`：主独立通过。
- `04-recheck-tests.log`：79 个定向用例的完整结果。失败在 `goal-event-document.e2e.test.ts:145`，前一行等待旧 toast 的“已保存”后过早点击历史，目标处于替换/隐藏过程。
- `04-review-http.mjs`、`04-review-history.mjs` 重跑通过，日志 `04-recheck-http.log` / `04-recheck-history.log`。
- `04-recheck-browser.mjs`：原 6 场景 5 通过；Concern 仍只有 `要求 restart`，缺少可读要求名称。日志及 results.json 已保存。
- `04-recheck-edges.mjs`：真实点击复现合法字段碰撞、首屏外选择丢失、分页筛选不一致、unknown 错写“报告满足”；已完成目标两次相同 HTTP 继续请求为 200 / 409。完整结果见 `04-recheck-edges-results.json`。
- `04-recheck-history-cap.mjs`：写入 5001 条真实报告，遍历 timeline 到 next_cursor=null；最早报告不在索引，却能按原 ID GET 200。实际 51 页、索引 5001 项（含 journal），`oldest_report_in_index=false`。这是源码 50×100 截断的边界复现，不是人为要求固定记录数。
- `04-recheck-response-loss.mjs`：空白目标首次记录进展返回“不能引用尚未发生的事件游标”；另一个已具备合法依据的 POST 实际保存成功后只丢弃响应，点击重试则进入通用 409 版本冲突，当前顶部仍是旧值、没有重试读取入口，记录数保持 1。两个失败均真实复现，见 results.json。

## 集中修正范围

### 1. [P1] 报告控件和合法内容字段仍混用名字

`buildPayload(report)` 已用 `data-report-field` 序列化内容，但又用 `FormData.get("requirement_id") / get("verdict")` 读判断。合法内容字段使用这两个 ID 时，原文被当成判断，普通报告被 400 拒绝。复现提示 `要求判断无效: 原文 verdict`。标题也应按明确控件定位。让内容和控制项的 DOM 身份一致地区分；所有 01 已支持的字段 ID 均可保存，默认零 judgments，不只换几个保留名。测试通过真实表单写入并断言原文和零判断。

### 2. [P1] 混合历史先拉 50 页再切片，静默丢记录

`collectWorkTimeline` 固定最多读取 5000 条后停止；后面的混合分页最终返回结束，永久漏掉更早工作事件。不要简单把 50 调大，也不要继续让每次 UI 翻页拉完全部工作历史。以受影响 Goal 的有界索引查询和稳定游标完成混合页，保留 Runtime 正向分页；服务端查询在所有页上不重不漏，按 ID 仍直接读取。必要的轻量索引接口放在已有 owner，不新增第二事实源或永久两套存储。

### 3. [P1] 阅读选择与筛选仍依赖首屏 DOM

按 ID 定位首屏外记录会创建临时 button；`captureRestore` 只从真实 nav 的 aria-current 读取，随后保存就丢掉原 ID，跳到新补充。分页追加又只创建普通 timeline-entry，不带成果/决定分类，也不应用当前筛选：成果筛选下加载更早记录会显示普通记录，再切一次筛选则交付记录也消失。统一轻量索引字段、行渲染和独立的阅读状态；选择须保留真实 item ID，即使不在当前 DOM。服务端首屏、客户端分页、切换筛选/空筛选、保存刷新按同一规则工作，不凭显示文案猜类型。

### 4. [P1] 不同判断被正文渲染成相同的满足文案

真实 unknown 报告渲染为 `long：unknown · 报告满足，未独立核对`；contradicts 也走相同固定文案。按每条实际 verdict 展示支持/未达到/无法判断及来源，不允许“未知”又写“满足”。Scope、用户决定效果、相关依据使用人类可读标签和可定位原记录，保留 ID 作为辅助，不让裸 ID / enum 代替用户内容。Concern 的要求名称属于这项已知正文缺口。保留共同正文 renderer，不能另写一套客户端判断。

### 5. [P1] 项目观察游标不能作为 Goal 的进展依据

状态 `observed_event_cursor` 是 board 观察游标；进展命令只接受当前 Goal 的实际工作事件游标或空白时 0。表单直接把前者传给 based_on_cursor，所以空白首次进展必然失败；其他 Goal 刚变化后也可能失败。保留原 03 的归属校验，明确提供/消费当前 Goal 的依据游标，不降低校验、不读取任意其他 Goal 的事件冒充依据。覆盖空白首次进展、当前 Goal 有历史而另一个 Goal 后更新的情况。

### 6. [P1] 丢失 POST 响应后的重试不是版本冲突

当前只修了“已读到成功回执，随后 GET 失败”。若业务已保存但 POST 响应丢失，原 key 重试会被 Host `web-http.ts` 的一次性键 guard 拒绝；客户端把所有 409 都当成约定变化，提供换 key 再写，既不能恢复当前状态，又可能让下一次确认生成重复事实。

沿 HTTP 可信身份/Origin/控制 token → 幂等业务命令 → 回执 → 读回链处理，同一请求不能因响应丢失变成第二条事实。不要取消任何身份/权限校验或放宽其他旧 Web 命令。区分真实版本冲突与重复/已保存请求，提供正确恢复。已完成目标的 event-resume 还按当前状态动态选择 reopen/resume，重试/重启后需保持同一请求的原语义；不要只靠浏览器记忆掩盖 HTTP/业务幂等边界。验收以“丢失响应后重试恢复当前事实，零重复”作为用户结果，不强求重用旧 Host 一次性命令的响应格式。

### 7. [P1] 验证必须等待本次写入，不能读取旧 toast

现有新增 e2e 仍大量等待 `toast.includes('已保存')`，甚至 `... || 某个旧按钮存在`，一轮通过、一轮隐藏点击失败。以本次真实事实/版本/当前页面替换完成作为等待条件，然后实际点击保存和下一步，不使用 requestSubmit 绕过保存按钮可见性。不得延长固定睡眠或放宽正文正则来掩盖失败。重跑主复现时只允许修正确定的测试前置或异步等待，不能把 expected 改成当前错误输出。

## 视觉与主题证据

主 Session 已查看当前桌面、规划、类型、报告、522px 阅读区、390px 手机时间线/正文/表单/返回，以及旧 V1 历史。`04-ui/mobile-390-form-top.png` 已含完整表单；`form-bottom` 仍裁切，不用于通过结论。原 `desktop-dark.png` 只临时改属性，不能证明主题；主脚本保存真实 `molis-work:theme=dark` 并刷新后获得有效 `04-recheck-ui/desktop-real-dark.png`（resolvedTheme dark、paper #1b1b1e）。新表面静态 detector 运行一次，结果 `04-design-detector.json = []`，不代表视觉已验收。

独立 finish review 在全新 Grok 4.6/xhigh 只读会话中进行，评审输入与已看截图明确；不得因此宣称 04 已完成。待主 Session 合并评审修正再执行一批，不重新探索视觉方向，不将以上功能缺口移交 05。

## 已交回的独立视觉结论

[finish-review.md](finish-review.md) 完整五段结论为 `fix`，不是重建方向。P1 合并到本批：正文/索引用中文业务名称，原 ID 辅助显示；规划阅读区只留一次返回；522px / 390px 折叠概况保留下一步和责任人（未知时明确待接续）；创建类型默认展示一个可编辑字段，不静默补字段，类型/要求/字段 ID 自动生成且已有记录 ID 稳定；手机提交区上下排列，按钮占满宽度。原型已有这些交互，属于本次生产实现补齐。字段移除在最少一项的明确约束下工作，不修改 01 的 ID 校验或 03 的权限语义。

P2 当前判断文案不另开审美优化；如果在同一当前状态修正中能直接消除 outcome 重复和 next/risk 混用，则一起处理，否则如实保留评审范围。修正后按相同状态和视口批量复拍，提交同一 reviewer 做 verdict pass，只评分列出的修正。已经运行一次 detector，不再重跑。

## 2026-09-10 主 Session 根因复核：暂停叠加等待条件

第二修正批的原 browser/edges/response-loss/history-cap 复现已通过；主独立补充的 `04-accept-resume-restart.mjs` 与 `04-accept-cross-goal-progress.mjs` 也通过。前者真实 HTTP + SQLite 重启后同一续接请求重放、无重复事件，缺控制 token 仍 403；后者其他 Goal 后更新时页面仍使用当前 Goal 的实际依据并真实保存。

但两项组合 e2e 多次修正等待后仍失败（Hidden click target，以及收尾后页面永久停在“载入中”）。主 Session 已暂停 writer，停止继续给 DOM 等待加条件。独立 `04-accept-refresh-and-guard.mjs` 经真实 Chrome、HTTP、隔离数据库稳定复现以下两项，日志和结果 JSON 位于 `/private/tmp/molis-work-grok/`。这属于原刷新恢复及“不能放宽其他旧 Web 命令”的合同，没有新增产品范围。

1. **[P1] 定时刷新遗漏事件正文装配。** `apps/local-host/src/web-goals-read.ts` 的 `fragments` 中 document 分支调用 `withSelectedEventDocument`，refresh 分支却直接把未装配的 view 传给 renderer。`/api/board/refresh?view=current&goal_id=...` 返回 200，但当前结果是“正在读取当前事实 / 载入中”，索引 0 项。调用页面注册的真实 4000ms 定时刷新回调后，该占位片段覆盖当前页面，原选择和可操作控件消失。根因在服务端刷新片段和客户端替换生命周期，不是单纯 clientWidth=0 或等待时间太短。让普通 document、完整页面和 compact refresh 共享相同事件正文装配；实际替换后恢复已选记录、筛选和仍适用的阅读/表单状态。已有表单编辑保护按真实交互保留，不能通过禁用自动刷新、延迟到测试结束或强制整页跳转逃避。定向覆盖服务端非占位片段、真实定时刷新后当前结果更新且原历史选择保留、保存/收尾与刷新交错，以及原组合 e2e。撤掉仅用于掩盖这个错误的测试重复等待和生产恢复补丁，保留已经有独立证据的修正。

2. **[P1] 新的事件幂等重放放宽了所有旧 HTTP 命令。** `apps/local-host/src/web-http.ts` 把 `mutationKeys.has` 改成只拒绝 `in_flight`，因此所有已完成旧命令均可重复进入处理器。源码明确放开已完成键；原合同要求旧 `/api/goals` 的同键第二次请求 409 且不创建。初版 HTTP 复现的辅助函数覆盖了指定 header key，其 201 / 201 不能证明同键重放，主已纠正 header 合并顺序后重新验证，业务 expected 不变。事件业务端口已有幂等回执，重放例外只能落在已明确接通这些回执的事件写入路由；旧命令原一次性规则保持，Origin、Host、控制 token、键合法性仍先校验。保留已验证的事件 POST 响应丢失和重启续接通过结果，补旧命令拒绝且无第二条事实的回归。

所有新验收脚本都调用真实生产路径，未改变生产数据；`04-accept-refresh-and-guard.mjs` 捕获的是页面实际注册的刷新回调并在外部状态变更后调用它，不替换刷新实现。没有用延长睡眠制造通过。

视觉证据补充：主已查看 04-final-ui 桌面、报告、类型、522px、390px 时间线/正文/返回、旧历史和真实暗色。手机表单 top 截图裁掉提交按钮；bottom 贴底且标题裁切，须作为明确的上下两张视口说明或补有效完整页，不能再称单张完整表单。planning 在截图后又去掉重复标题，需仅复拍这个已变化状态。原评审要求的未知判断可使用本轮 `04-recheck-ui/desktop-real-dark.png`，主已查看，显示中文要求与“仍无法判断”。不进行新的审美搜索或第二次 detector。

同一正文替换生命周期的补充实测（主，2026-09-10）：`04-accept-goal-switch.mjs` 从事件 Goal A 通过真实侧栏点击切到事件 Goal B，当前 Goal ID 已是 B，正文却为“历史记录不存在”。原因是 `event-document-client.ts` 的共享 `reading.item` 未带 Goal 归属，bind 新正文时沿用 A 的事件 ID 到 B 的历史接口。恢复同一 Goal 的状态和切换 Goal 的状态必须分开：同 Goal 刷新保留原选择；换 Goal 使用该 Goal 的有效选择/首条，不能请求其他 Goal 的原记录。这是上述第 1 项替换生命周期的作用范围，非新增产品能力。脚本使用两个真实本地 Goal 和 Chrome pointer click，日志 `04-accept-goal-switch.log`，目前失败。请与刷新绑定一并修复并补生产路径回归。

主再次暂停 writer 后的确定证据：刷新正文装配和旧命令同键保护的独立脚本已通过（201 / 409、无第二个 Goal）；继续保留。新 `04-accept-save-tree-sync.mjs` 在真实取消请求保存后、响应回到浏览器前并发创建另一个真实 Goal，再完成保存并调用页面实际刷新回调。数据库存在新 Goal，侧栏不存在（`concurrentGoalVisible=false`）。原因是 `reloadGoalEventDocument` 只替换正文，随后却读取 board cursor 并赋给 `state.snapshot.cursor`，错误声明整页已同步。删除这个无依据的游标推进；使用原整页刷新应用状态后再更新游标。若保留响应代际检查，须对应真实迟到响应，不能叠加无证据的确认请求与恢复层。

同一测试显示取消后顶部当前结果为已取消，而 header/tree 为可继续；先核对现有状态映射和原 review 的取消语义，修正这项已知显示不一致，不扩展新的状态体系。`goal-event-review.e2e.test.ts` 的收尾等待仍匹配提交前已存在的“部分受阻”，使下一次点击抢在本次 reload 前发生。必须等待本次持久事实和正文已有的 `data-goal-event-cursor` / `data-observed-cursor`，再进行真实 pointer 点击。不得为错误等待改变生产状态语义。

生命周期修正交回（主复核日志）：三个根因脚本已通过，取消标题/侧栏/正文均为已取消；两项组合文件中 review 路径与legacy路径通过，主事件全流程仍在连续保存后的隐藏点击失败。源码中大量提交仍只 `waitIdle()` 再读持久数据，没有等本次正文读回；主要求尚未完整落实。停止生产向补偿，下一步在新鲜 Grok 上下文中只统一成功提交的“提交前游标→真实点击→本次正文游标增长且busy结束”，保留业务断言和冲突场景独立等待。

本批新增 `refresh-client.ts` 按 `goal_event_cursor` 相等跳过整段正文是错误的优化范围：Goal 标题/其他合法非工作事件变化不一定增加这个游标，不能据此声明整个正文相同。删除这块补偿及调用者的条件bind，保留已证有效的Host装配、reading Goal身份、整页游标正确应用和迟到响应代际检查。不得再新增刷新跳过规则来弥补测试先后顺序。

成功提交同步已消除隐藏点击，现有全流程继续到冲突重审，断言 `reason === 旧版本收尾` 失败（实际空字符串，04-sync-e2e.log）。主独立 `04-accept-conflict-draft.mjs` 用真实 input 事件、外部配置变化、409按钮及页面实际4000ms刷新回调，在重审读取与整页刷新交错时稳定复现相同清空，日志04-accept-conflict-draft.log。不是等待不足：新表单版本已更新，旧输入已被替换掉。Workbench 当前 dirty 保护仅标记/查询 `[data-live-form]`；事件表单只按 activeElement 是否在form内保护。点击form外的冲突按钮后焦点离开form，自动刷新就替换尚未保存的输入。

这属于原“冲突保留输入”的合同。沿现有 dirty visible form 保护扩展到事件表单（真实input/change与提交失败后的保留），成功读回或用户主动离开表单后仍能正常刷新。复用已有保护职责，不新增整页游标跳过、第二套草稿协议、恢复层或关闭定时刷新。真实冲突测试应继续保留原理由、原幂等键直至用户明确重审；重审只更新预期版本/重置key，不写新事实。独立脚本已有真实input事件；仓库用例补真实输入事件或生产提交状态标记，不能放宽原输入断言。
