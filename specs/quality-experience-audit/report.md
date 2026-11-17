# Molis Work 审查报告与优化策略

第46批本地结算：同Home草稿跨项目采用、并发模型尾写、案例与回放的事务、授权等待后的可写状态/数量均有真实反证及修复。完整构建、API生成（一个conflict错误码）、健康门禁和组合16文件189项通过；新增测试已纳入Git索引后再验门禁。当前75包/84个contracts子路径范围保持，QF-51性能、平台化后续、待批事项和准确头Full CI仍未完成，不把第45/46批当作整项结束。

第45批已在最新主干交集发现并修复 Skill 草稿输入丢失、回放事实过期和重复确认问题。main `4cf1c742e6` 经 `3f9fc4c6b4` 合入；75包、84个contracts子路径（另加根入口），全部已有成果保留。完整构建、10文件83项定向验收通过，包括6项新增真实浏览器恢复及原创建/回放/采用/版本恢复/通用包定制。采用等待中同草稿修订的独立风险还在核实，整项、最终准确头Full CI和资源验收均未完成。详见 QF-52，不能把此检查点当作原任务完成。

第41批本地结算：`apps/local-host/src/home-dock-http.ts:14` 删除两个无生产调用的Events POST转发，`web-request.ts:87` 删除其专用只读放行。公开 `home.events.read/open@1`、原事件聚合和MCP保留。旧地址带正常控制头仍404，插件reader和写入均未触发；未知插件完成后撤回、故障隐私、实际regrant撤权/恢复/停用与正式MCP独立授权通过。3个原测试通过公开Host客户端读取同一事实，不新导出内部权限适配器；HTTP session/目录捕获仍由现行HTTP消费者安全套件覆盖，不把此读取称Events HTTP验证。构建、健康和8文件50项通过（`/tmp/quality-audit-events-retirement-acceptance.log`）；BL-home-events-endpoint-unused已本地落地，待最终头CI后清理。用户路径未新增步骤，Host少维护两个无调用入口和专用方法分类。

当前包表已按登记逐项对齐75包，83个contracts子路径另加根入口；补列Sessions、automation-recommender、project-approvals并移除已退役WebQuery工厂包，相关深入结论仍见各批。另核SQLite行复制候选：Node24.15.0下原对象复用与复制在交替样本无稳定差异（`/tmp/quality-audit-sqlite-row-bench.log`），未改生产实现，不用微基准代替真实体验或新增通用优化层。

第44批本地结算：`packages/kernel/src/action-execution-context.ts:82` 单目标的反复复核继续逐条匹配，遇第二个不同目标才建原轮内索引；名单可变，不缓存首答。QEA-98经公开同步动作旧版遍历100个无关项、新版0，provider/版本/移除/恢复与原实时授权均验。完整构建、健康、12文件92项通过（`/tmp/quality-audit-allowed-list-acceptance.log`），只读复核无新增Blocker/P1。真实20条采样 allowedAction 自身3.143→0.972秒，但五样本总耗时p50=14127ms，未证端到端改善；QF-51和性能BL继续。用户等待问题尚未宣称解决，代码只减少不必要的全名单索引构建，没有承担第二份授权状态。

当前状态（2026-11-17，负责人 Codex）：**整项仍在进行中**。原六方向、逻辑 Bug、需求实现度与 BL 清理均保留。已整合 main `4cf1c742e6`，75包、84个 contracts 子路径；合并检查点 `3f9fc4c6b4` 保留此前成果。第41～44批已有本地定向验收，第45批新增 Skill 交集持续深入；QF-51端到端性能仍未关闭，以下各检查点的证据不代替最终提交的 Full CI。

第42批 / QF-51 后续：正常网络探针证明8次 Goal 刷新均来自顶层工作台（`/tmp/quality-audit-inbox-refresh-probe.log`）。`web-goals-read.ts:153` 的片段读取经 `web-request.ts:202` 重读所有显示插件舞台并渲染 Home 内容，放大 Inbox 批次成本。QEA-94 在旧构建真实 HTTP 入口失败：无关 Schedule reader 被调用一次（`/tmp/quality-audit-goal-stage-baseline.log`）。现按声明路由匹配 owner 准备舞台，保留目标正文/关系/策略/成果与创建输入所需目录；移除无生产消费者的 Inbox 摘要转发和 StagePageContext.client_data。完整构建通过、API 快照仅删除该可选字段，定向验收进行中，不预报性能通过。

第42批本地结算：上述13文件最终均有通过证据、共161项；无关 Schedule 读取从1变0，真实未知 Home 插件的“新建输入”入口保留，成果归档和输入确认后刷新正确，Feed 菜单/Goal迟到响应/原保存交错通过。二文件补验24+14项见 `/tmp/quality-audit-goal-stage-final.log`。会话滚轮测试先观察 follower 的真实落底再测量向上滚动，未修改产品滚动语义或放宽原断言。五次20条判断p50从22595ms降至10768ms，health在3–4/20条返回（`/tmp/quality-audit-goal-stage-performance.log`）；等待仍偏长，QF-51及性能BL保留。构建/API/健康/只读复核通过；离线Skill回放和替身3简报通过，真实模型因隔离Home无可用模型未运行。后续第43批复用Storage现有结构校验机制，版本/归属/授权事实继续逐次读取；整项、最终CI与资源验收均未完成。

第43批本地结算：`packages/storage/src/sqlite-baseline.ts:214` 提取现行成功结构比较，`apps/local-host/src/home-plugin-store.ts:22` 复用 exact 模式；原 Inspector 保留允许额外表及声明触发器的检查。暖读反证旧版132≠66，新版不再增加结构扫描，8次读取仍分别检查版本并关闭连接；WAL暖读后主文件字节不变但结构变化拒绝，两种比较模式互不冒充，损坏/外来归属/恢复均通过。完整构建/API/健康和14文件149项通过，日志 `/tmp/quality-audit-home-schema-acceptance.log`。未改变存储版本、授权事实或只读事务寿命。总耗时p50=11721ms，未证明优于上一批，故保留QF-51；当前CPU采样聚合显示允许动作名单匹配自身约3.14秒、SQLite行转换与get合计约2.23秒，Home开库自身约0.15秒。继续沿真实许可名单来源和当前读取核根因，不把查询数减少当作体验已达标。采样 `/tmp/quality-audit-schema-cpu/CPU.20261117.055750.75612.0.001.cpuprofile`，临时测试已清理。

主干登录交集首轮历史：9文件中8文件104项通过，子任务会话文件12/14项通过但滚轮位置验证失败（`/tmp/quality-audit-login-merge-acceptance.log`）；该观察时序问题已在第42批修正并补验14/14通过，见上文，首轮记录保留。第42批首个定向命令误用默认并发，已按本次PID终止，仅成果输入4项有效通过，其余未完成；改用公共机器槽和 `--jobs 1` 后重新执行，日志 `/tmp/quality-audit-goal-stage-acceptance-serial.log`。

最新交集记录（2026-11-17）：第39批两个新服务已沿真实生产路径核对。建议由项目到达、Assistant、创作台读取目录和 Workspace，偏好归 recommender，文稿由 Pages 按固定 request_id 保存；临时报告绑定 actor/project/incarnation 并有期限。审批经 Web/CLI/管理 MCP 和 Kernel 单次可信凭据进入原业务 owner，平台规则与决定归 project-approvals。等待后的权限与安装复核有真实边界依据；新包不是无职责转发层。静态结论不替代视觉和运行验收。

**QF-48/P1 已复现并修复，定向通过、最终验收继续：认可与平台审批跨库部分提交。** 基线 `040f161a40` 的 `apps/local-host/src/acceptance-actions.ts:100–118` 在项目库事务里调用 `modules/acceptance/src/store.ts:17–19` 的独立 Acceptance 提交，后者先 COMMIT。QEA-84 从正常 HTTP 决定入口，仅用延迟外键让项目最终 COMMIT 拒绝；返回失败后实际读取 r2.person 仍为 accepted，预期 pending。日志 `/tmp/quality-audit-acceptance-commit-baseline.log`。这违反 Acceptance README 和授权 spec 的同事务承诺，可能使用户看到失败却留下认可，且缺少可信来源账。原 INSERT 阶段的撤权反证没有覆盖此窗口。

QF-48 已实施：保留 Acceptance 原库、表、ID 和动作，用同一 attached 连接单次提交；复用现有成果固定的文件/空间校验、DELETE/EXTRA 和恢复协议，不冒充成果声明。规则和逐项状态仍归 Acceptance，平台决定仍归 project-approvals。必须同时验最终拒绝零写、同键恢复、COMMIT 后回包/清理失败与启动/U1/快照恢复，不能交换两个 COMMIT 顺序或事后删除补偿。

本批结果：完整构建通过，8个定向文件41项全部通过（`/tmp/quality-audit-acceptance-atomic-recovery.log`）。最终 COMMIT 拒绝、提交后清理故障、两个真实 SIGKILL 恢复场景、原 Dataset/Form 消费者及安全反证均已验；认可栏1440/390正常操作与回读通过。只读复核要求补强的重复记录计数和恢复后原 key 重试已通过（两文件5项，`/tmp/quality-audit-acceptance-atomic-retry.log`），未发现新增Blocker/P1。健康门禁退出0，公共API/动作/库快照无变化。用户不再需要猜测失败后的认可是否保存；开发者沿同一事务和原回执追踪结果，少维护一份独立事务提交顺序。共享核心必跑90文件已完成：88通过，版本例外遗留及 Functions 本地读取触发钥匙串两文件失败；后者在同头单独复跑稳定复现（`/tmp/quality-audit-keychain-exact-repro.log`），正在查真实调用链。最终头 CI 尚未完成。

**QF-49/P2 已实施、正常入口实操通过：认可栏文本被省略。** `apps/workbench/src/styles/work-line.ts:291,302` 把要求、理由和历史单行截断，`work-acceptance-parts.ts:52,55` 仅用 title 提供完整文案。390触屏无法悬停，用户可能须进入编辑才能读完认可依据；1440侧栏也复现。已让要求、方法/观察、决定理由与展开历史完整换行，移除以 title 代替正文的表达，沿原栏位与审批流程验证，不新增确认步骤。

主干交集首轮23文件20过/3失败：Run 时间与待核交集10项、真实恢复22项、流33项、业务 gateway80项、安装恢复41项、安装拒绝11项及三个真实审查界面已过。HTTP 旧断言409按主干现行权限拒绝保留403，修正后20项过。Goals 的16份快照反向还原已实施导入批次说明与按钮文案后均与 main 原 hash 相同；保留业务 view，合并重绘后56项过（2个生成模式默认跳过）。Feed AX读取两次出现 notRendered；后续远程对象身份核对捕获真实刷新替换。夹具现仅在原对象已脱离/被替换时重取，当前对象缺名或不可访问仍按原断言失败；全部23项通过，日志 `/tmp/quality-audit-feed-control-lifetime.log`，未改生产或放宽名称断言。提交合并后 health 已按 a717e442 重算，仅发现报告仍链接已归档 BL-360；链接已转现行授权验收，最终健康复验退出0（`/tmp/quality-audit-main-merged-health-final.log`），未改阈值。

状态：进行中，负责人 Codex。原六方向审查、逻辑 Bug、需求实现度、BL 清理和本轮改造验收均保留；不以包清单或局部测试宣称整项完成。2026-11-17 已拉取并整合 main `a717e44284`（#2105），当前登记 **75 包、83 个 contracts 子路径**。完整构建通过，公开 API、动作、存储及版本快照已重算；合并交集23文件均有通过证据（首次失败与修正详见上文），合并检查点为 `040f161a40`。

已有成果保存在原分支：Pages/共享选择 `67288d2e47`、Feed 公开 SourcePull/首次引导恢复 `29f6d1383e`、无关安装声明隔离 `03b3a58f76`，以及此前搜索、后台操作、Sessions、Git 草稿、共享材料、Coding、Memory、Workflows 批次。QF-47 本地定向已过，当前头复验中。固定 `29f6d1383e` 的205文件包回归已结束：202通过，desktop-tui/verify-release-versions因退役 Feed 版本例外失败，editor-control-names因旧控件对象读取失败；日志 `/tmp/quality-audit-feed-onboarding-required.log`。后者已在主干整合批修夹具并通过23项，前两项待已提交的门禁删除审批。旧运行不能记全绿，也不能挪作新头证据。

Git 冲突主区及迟到反馈 QF-23/46 已保存于 `ff006e19f0`，冻结该头的11文件109项全部通过（`/tmp/quality-audit-git-frozen-acceptance.log`）；认可正文 QF-49 保存于 `b82dd631b3`，2文件7项通过。自动采集钥匙串 QF-50 已保存于 `d7d146a2da`，10文件73项有通过证据。仍在本轮：Inbox 阻塞 QF-51 的改造验收、平台候选/后台入口的余下深查、最新主干交集、资源和最终准确提交的 Full CI。QF-15 固定版本警告迁移及 Feed 废弃版本例外删除有具体方案待既有批准请求回复；不阻断其他工作。用户已明确延后的 PF-03 第三个会话记忆消费者条件保留，不报告为已平台化。旧头 `77e2cc0d5` 的 CI 只覆盖旧批次。草稿 [PR #2101](https://github.com/molis-ai/molis-work/pull/2101) · [需求与验收](spec.md) · [逐包覆盖](coverage.md)。

以下按发现保留代码依据与逐批证据；带旧基线的历史记录不表示当前状态。
## 早期批次判断与依据（历史基线）

2026-11-16 已整合基线：`4a08c41ca`（Sessions #2097）已整合到工作树，74包构建通过，合并提交 fc4e39e38 已保留，后续 Git 批保存于 84987a6c3 与 8ac8b806e。新增 `horizontal/sessions` 及其 UI/搜索/助理链纳入接续范围，不能继续沿用 73 包作为最新主干总数。BL-177 在该主干已改“部分实现”，保留 35/45/60 批和本人验收，不按新实现标题关闭整项。前批改造保存于 `a31a745e6`。现已保存共享输入材料检查点 `ba93f5c0b5`，并合入 `6359987103`（Sessions 合后复查 #2106 与公共子任务部件 #2108），合并提交 `31b0cba134`。两边新增的权限/会话回归均保留，公共 composer 的 ready/local placement 与本批来源/ack合同同时保留；API快照已重新生成，完整构建通过，组合验收19文件183项全部通过（13.9分钟，`/tmp/quality-audit-main-635-acceptance.log`）。新增重试用例第一次排队被主动撤下，未运行；后续已在这次组合验收实际执行通过。随后健康门禁发现 pageComposer 153行，已把独立的提交结果转换移到同文件函数，不改阈值，复验通过。QF-30 真实断连基线复现接受/拒绝晚写，最小信号修复与相关8文件96项验收通过，保存于56afa9c44e；仍不能据此将本轮全部六方向结项。QF-31读取故障、分区失败与原位重试已通过真实界面及写入读回；QF-32候选读写分离和QF-31旧入口清理也已完成本地验收，细节见各项记录。

第九批视觉补验已通过，12 张中英文/三宽/两主题截图生成，人工复核英文390深色与中文1440浅色，Git 固定差异已加载。第十/十一批14文件126项通过，第十二批11文件65项通过，具体边界见下文。英文导入中的旧中文警告另列 QF-15，未宣称语言全通过。

平台已有统一动作、授权、事务、插件装配和对象链接能力。当前重点是核实实际消费与恢复路径，而不是继续增加抽象。旧报告中有多项建议会破坏已有语义：把表单关闭设成终态会取消重新开始收集；删掉搜索的第二次目录读取会撤掉异步等待后的权限复核；审批投递失败自动重试可能重复执行已经接受的批准。

构建通过只支持工程判断，尚不能宣称整个平台内部完整。退役WebQuery后的检查点曾有73个包；整合第39批两个新服务后当前为75包；初始审查基线的统一 BL 有 527 条，其中 64 条为待本人验收、202 条明确后续做，不能直接当作死账删除。需求族判断与逐项清理决定见下文；不按条数计算完成率。

前四批成果保留；第五至十二批已落实搜索取消、Home 列表完整性、停止/切项目交错、Run 终态、三个审查 UI、导入停止/断连、五插件纯绑定迁移和正文可用性反馈，相关定向验证通过。尚未取得本次最终提交的 CI 证据，不能与旧头 CI 混算；原代表检查也不能冒称全部真实入口均已查深。Sessions 增量已补定向验收，框架材料来源、Git 冲突版式及其余未查深入口仍在原任务内按优先级推进，不以改动文件数或局部通过结项。

## 发现与处置（是否实施逐项注明）

第十二批验收：`/tmp/quality-audit-transcription-acceptance.log` 11 文件65项全部通过（10.3分钟），涵盖三个原生结果失败/恢复实操、实际原件下载、固定版本、模型同意、HTTP取消、MCP/公开动作和真实插件成果消费。API生成无新增差异，动作输出快照仅两个 import 行变化，包边界检查零错误。去掉 warnings 必填数组的两处可选链是此构建后的等价合同清理，随主干整合重新构建；最终门禁/CI仍待完成。原中文警告 QF-15 保留未解决，不用功能回归替代语言验收。

最新定向验收（第十/十一批构建）：`/tmp/quality-audit-import-binding-acceptance.log` 的 14 个文件、126 项全部通过（16.9 分钟）。其中导入队列 8 项、HTTP 断连/流上限 6 项、正常 Git 审查与 12 幅视觉采样 1 项，五个插件动作及知识/模型授权/流式生命周期回归均过。第十二批新增 `text_available` 及新断言是在该构建之后修改，须另行构建验收。构建首次发现 control 缺必填 beforeEffect，已按 signal 边界修正后重建通过；没有改公开 control 合同或加空检查来绕过类型要求。

### QF-01 / P1：资料批量导入丢失尚未处理的选择，并让重试结果错位

- 基线位置：`apps/workbench/src/browser/knowledge/import.ts:179,203-204`；`take:151-155`；目录遍历 `:24`。
- 正常链：侧栏资料 → 导入对话框 → `bindKnowledgeImport` → `/api/artifacts/import` → 成果服务保存固定版本 → 每个文件的结果行。待处理选择归工作台客户端；业务结果归成果服务。
- 触发：选择 201 份时只处理前 200 份，完成后 `picked = queue.filter(...)` 覆盖全部选择；处理中追加文件会重画结果行，持有旧行引用的异步循环继续更新已移走的节点；失败重试没有先按新队列重画，沿用旧行号。目录拖入超过 400 份时还会静默截断。
- 影响：用户重选遗漏文件、重复导入已成功项，不能信任失败标记；等待中的文件状态由数组和 DOM 类共同决定，难以追踪。
- 决定：客户端只移除明确成功的条目，处理队列与当前结果行一一对应；追加只进入下一批，尚未处理条目优先于本批失败项，避免200份全失败挡住后续；重试前重画，显示本批尚待导入数量；目录遍历先排除隐藏/依赖目录，保留其余选择。维持每批 200 份和服务端既有幂等规则。不增加平台队列或存储。评审补正：选择层不以显示文件名去重，防止同名不同正文被丢掉；重复内容是否复用仍由成果服务决定。
- 成本与验证：低，限客户端与词条。`QEA-05/06/07` 在隔离 Home 通过真实文件选择/拖入、真实 HTTP 写入和成果记录验收。基线 `QEA-06` 已复现追加使结果行失效；`QEA-07` 已复现超过 400 不可达。首轮 201 份实导超过新测试的 90 秒等待预算，只算等待不足，未冒称其失败已直接证明丢尾。

### QF-02 / P2：Feed 常驻连接监听每次唤醒遗留取消监听器

- 位置：`plugins/native/feed/src/runtime-reconcile.ts:21-30`，消费者 `keepFeedReconcile:112`。
- 触发：每轮 `next(signal)` 注册新的 `abort` 回调，正常 `changed()` 唤醒后不移除；同一个后台 job 的 signal 可活到插件停用。
- 证据：调用生产构建的 `createConnectionWatch`，连续 12 次 `next → changed → await` 后 `getEventListeners(signal, "abort").length === 12`。
- 影响：长期运行随账号连接变化累积闭包，停用时重复唤醒早已完成的等待。属于明确的资源生命周期缺陷，不需给业务另造状态机。
- 决定：正常唤醒和取消共用同一个清理出口；保留忙时通知合并与取消结束等待的语义。归 Feed 自有后台监听，不新增共享层。已修改，QEA-08 与原 FI-C-07 等 10 条定向测试通过。

### QF-03 / P2：Git 的草稿工具与实际编辑入口脱节

- 位置：`plugins/native/git/src/drafts.ts:52-108` 仅由本包导出与 `tests/git-plugin.test.ts:70-79` 使用；实际页面 `plugins/native/git/src/browser/source.ts:28-38,100-101` 只读取 Coding 交来的提交说明，`plugins/native/git/src/browser/conflicts.ts:70-86` 每次打开冲突直接用文件正文替换编辑区。
- 影响：用户自己输入的提交说明、分支/PR 表单与冲突解决文本没有共同的恢复路径；尤其再打开同一冲突文件会覆盖尚未提交的编辑。现有草稿 round-trip 单测不证明页面保留输入。这里指整页重载/重新挂载及重新打开冲突文件；同一页面内刷新 summary、隐藏再恢复 PR 表单已由 `tests/git-source-controls.e2e.test.ts:152-249` 覆盖保留，不能一概说“刷新就丢稿”。本轮已补真实 Git 与 Coding 内嵌浏览器复现：四项均有效失败，说明重载后为空、长冲突文本切文件后被原文覆盖；日志 `/tmp/quality-audit-sessions-recheck-git-baseline.log`。`parseStoredDrafts` 还截短字段为 4096，但没有实际页面调用，不能把它冒称为当前入口的数据截断事故。
- 决定：第十四批已接入 `browser/editing.ts` / `form-drafts.ts` / `draft-operations.ts` 的真实编辑路径，使用 `host.drafts`；Coding 经 `offerCommitDraft` 明确交接且不回退错误目录。正常编辑及恢复12项、原客户端生命周期14项、源码控制1项、Host操作19项、打包2项以及真实 Coding SDK/人审/模型交接1项已通过；最终头CI与资源许可仍待完成。状态归 Git 编辑器，以项目/工作目录/文件与读取修订定位；复用现有页面草稿机制前确认冲突正文大小与隐私边界。先接正常页面、切换/刷新/冲突改版实操，再删被替代的工具和镜像单测。核对 Git private 包、contracts/SDK 外部边界、全仓引用与 Home 清单后，已删除只被镜像单测调用的旧 drafts.ts/出口/format 标记，不留截短或坏值转空的替代分支。成本中。

### QF-04 / P2：Home 后台汇总把读取失败显示为空任务

- 位置：`apps/local-host/src/home-background-tasks.ts:23-36` 丢弃聚合的 `issues`，只写诊断；`apps/local-host/src/attention-http.ts:46-51` 将数组传到 Home；`apps/workbench/src/scripts/client/attention.ts:43,95-96` 收到 `[]` 就画「现在没有后台任务」。
- 触发与影响：所有已安装来源超时或报错时，用户看到“没有任务”；部分来源失败时总数也无不完整标记。与查询整体失败时返回 null、保留上次显示的策略不同。这会让仍在执行的任务看起来消失。
- 决定：补齐 Home 汇总结果合同，保留 `tasks + issues`，复用项目后台表已有的 `MainlineIssue` 语义（`horizontal/mainline/src/index.ts:116-127`），由工作台显示一次“部分任务暂时读不到”和重试入口。来源负责事实，汇总负责完整性，页面不推断任务结束。不加弹窗、不把诊断原文直接曝光。成本中，第六批已实施合同与 HTTP/UI 迁移；全失败、部分成功与恢复的定向验收通过，最终门禁/CI 待完成。未安装来源跳过，已安装但不可用仍报告问题；不把所有停用来源一律忽略。

接续真实入口补查（第六批，2026-11-16）：`apps/workbench/src/arrival/chooser.ts:137` 将 attention 绑到选中项目，旧项目入口没有 Home 后台任务；这使选择项目后的 Home 列表一直拿不到跨项目任务。新 HTTP 聚合测试已通过，但第一轮浏览器在部分恢复等不到任务、停止用例在首屏等不到按钮，属于真实入口接线缺口，不能把它们当成停止交错已复现。正在同批修正 Home 投影范围与变更订阅，保留项目助理上下文；Home 不消费项目事项线，避免重复读选中项目的任务。

复核另发现 `attention.ts` 重画会丢失停止按钮的 DOM disabled 状态；本批以页面持有的命令进行中/结果投影跨重画保留，等待真实 Home 实操。相邻项目入口 `apps/workbench/src/browser/work-task-panel.ts:191` 没有进行中保护，列为下一项真实交错检查；不把项目旧测试当作 Home 的验收证据。chooser 切换时在途 attention 的归属与迟到通知也待核对。

### QF-05 / P2：动作绑定有现成公共实现，局部包装仍重复维护

- 位置：`packages/contracts/src/platform/action-input.ts:8-12` 已提供 `bindActionHandler`；相同换参包装仍在 Dataset `plugins/native/dataset/src/actions.ts:69`、Form `plugins/native/form/src/actions.ts:84`、Todo `plugins/native/todo/src/organize-actions.ts:101`、Cognia `plugins/native/cognia/src/actions.ts:60`、Images `plugins/native/images/src/actions.ts:45`。
- 影响：各插件重复把 Kernel 已验证的 unknown 转为输入类型，后续扩执行元数据容易各自漏接；这些包装没有独立业务职责。
- 决定：直接复用现有公共绑定，不新建平台抽象；逐个迁移调用方，保留 availability。Pages/PPT 的本地包装还固定授权，Workflows 还构建业务上下文，不能用文本替换一刀切。成本低但跨包，本轮第三批已迁移 Feed 的 query-actions、inbox-actions、rule-actions 共三处纯绑定，第十一批已将上述另外五包迁到同一公开绑定，9 个 availability 调用保持，尚待构建/验收；以真实动作入口的拒绝、异步撤权和正常保存回归证明。

### QF-14 / P2（定向验收通过，待最终 CI）：转写失败的回执不足以支持准确完成提示

`apps/local-host/src/artifact-original-text.ts:36-44,62-65` 在原生读取失败/超时时返回空正文和 warning，仍可保存原件；`apps/workbench/src/browser/knowledge/import.ts` 的转写分支只用 `model_required` 是否缺省判断完成，因此可能把“仅保存原件、没有转写文字”累计为转写完成。前者是保留文件的正确业务语义，后者需要明确文本提取结果，不能由页面解析翻译后的 warning 猜测。

处置：第十二批成果 import owner 输出 `text_available`，从实际保存/复用的正文推导，工作台转写消费同一公开类型并保留无正文项重试；保留原件保存与既有取消 fence。原生失败、超时回复及空正文的正常入口旧构建 3/3 有效失败（52.0 秒），失败后原件实际下载正常，错误在重试入口消失。修复完整构建通过，11文件65项正常路径/恢复验收通过。API 生成无新增差异；两个 import 动作输出快照更新（现行阶段一原版本），没有输入、权限或持久结构变化。不增加第二套转写任务表。超时 helper 回复不等于实测平台 30 分钟截止，模型替身也不算真实语音效果验收。

### QF-15 / P2：原件提取提示仍以中文正文跨层保存并显示

位置：`apps/local-host/src/artifact-original-text.ts:18-45,65` 组装中文 warnings，`modules/artifacts/src/artifact-document-import.ts:20-35,128-147` 随固定版本保存，`apps/workbench/src/browser/knowledge/import.ts:100,232` 直接呈现。英文 390px 转写实操截图 `import-stopped-transcription-en-390-dark.png` 已出现“正文是转写出的文字，可能有错字；原件完整保存。”，因此是实际语言混用，不只是字符串扫描命中。

影响与处置：用户切到英文仍收到中文提取结果；页面不应据该文案决定状态，也不能靠翻译字符串反推失败种类。QF-14 先把完成判断交还 owner 的正文事实。提示本身应由提取 owner 提供稳定键/参数，展示时翻译；固定版本历史 warnings 的格式处理必须沿现有内容版本/升级约定，不静默改历史版本，不为英文临时覆盖原警告。此项已确认，语义迁移与历史处置尚待实施；不能把当前双语截图整体称为语言验收通过。

## 最新主干 Sessions 增量：已整合与复现，修复验收中

以下问题位置指 `origin/main=4a08c41ca` 的原实现。主干已整合到本工作区并完成 74 包构建，合并提交待验证收口。QEA-29/31 在旧构建有效复现7项失败，QEA-30/32又复现4项；追加 Droid 查询/范围变化迟到回填2项亦有效失败。修复构建后13文件首轮11文件通过：新增9个界面路径、服务与Host模型派发/缓存复核均通过。非本人 history 摘要的新增测试错把现行 `return_target:null` 当作字段缺席，已按现行合同更正，安全14项复跑通过。正常移动端旧用例暴露 loading 清空返回按钮；另补等待中返回/读取失败2项，在旧构建有效复现，修复已构建待复跑。日志前缀 `/tmp/quality-audit-sessions-`，包括 `scope-baseline`、`navigation-baseline`、`droid-baseline`、`acceptance`、`recheck-git-baseline`、`mobile-baseline`；不把局部通过写成本批全过。

| 发现 | 位置与实际路径 | 影响、归属和处置 |
| --- | --- | --- |
| QF-16 / P1 模型前缺少读取范围复核 | `horizontal/sessions/src/suggest.ts:214,232,308`：读取开头消息后调用模型，只传通用 caller.beforeEffect；`apps/local-host/src/sessions-ports.ts:401-408` 转交此闭包。Sessions 范围只在初始和模型后重读 | 在异步读取期间撤回来源，原文仍可能发给模型。Sessions owner 在实际派发前复核本批材料的当前范围，保留最终提交检查；通用动作权限不能代替业务范围。先卡住真实 adapter 读取验证模型外发为零。 |
| QF-17 / P1 列表未消费分页，旧搜索直达打不开 | `apps/workbench/src/browser/sessions/client.ts:80,107` 只读默认50条，搜索只滤当前数组；缺失 key 再读 all 第一页后静默返回 | 用户无法浏览或找到较早会话。补正常分页与完整检索；按 key 读取详情所需元数据归 Sessions 公开合同，不遍历全部列表冒充直达，不把上限改大当修复。 |
| QF-18 / P1 撤回范围后详情和迟到结果未失效 | 同 `client.ts:88,179`：列表找不到原行时不清正文，范围保存后也不递增 detailSeq；`detail-view.ts:80,89` 只有清空详情才移除助理上下文 | 已撤回原文及上下文继续展示，旧历史响应仍可回填。范围变更须取消/隔离旧读取，再按 owner 当前可读性核对所选项；当前分页没找到不等于撤权。覆盖撤回前后响应交错和仍合法的当前项。 |
| QF-19 / P1 云账号切换后再保存范围会拒绝 | `scope-sheet.ts:102-112` 遍历 owner 保留的同来源多个账号行，却从同一 entry_id 下拉取当前账号；`scope-commands.ts:273-275` 正确拒绝重复完整身份 | A→B 后再次保存或取消来源时两行都变成 B。表单只序列化实际选择的唯一目标，保留 owner 历史账号与重复拒绝，验证连续换账号、再保存、关来源。 |

三个 P2 补查均纳入本轮：范围保存后的额外 discoveryRun 已去除，实际表单验收证明没有额外调用；“开头消息”原取最新100条中的前三条用户消息（`suggest.ts:121`），真实 Claude 文件/Codex 协议两项均复现误取末尾请求，改为适配器从已解析记录选择最早三条；文件流每次注册 abort、正常结束未清监听（`apps/local-host/src/sessions-file-roots.ts:218`），完整读取/消费者取消两项实际复现残留1个，外部取消原已通过，改用 Node 流原生 signal。后两项修复构建及 QEA-36三项、QEA-37两项通过，首轮夹具根目录/空库错误不计作产品复现。日志 `/tmp/quality-audit-sessions-lifecycle-goals-baseline.log`（opening两项）和 `/tmp/quality-audit-file-goals-baseline.log`（文件两项）。

QEA-29～32 的最新界面验收 `/tmp/quality-audit-sessions-browser-final.log`：13/13通过，包括中英文、1440/1024/390、两主题零横向溢出，以及等待中返回/失败后重试。补充 `/tmp/quality-audit-sessions-lifecycle-goals-acceptance.log` 8文件94项通过，golden另有2个生成模式按默认跳过，QEA-36/37与真实HTTP/安全拒绝及Goals画布均通过；外部云/模型质量及本人验收未冒称完成。

### QF-20 / P2：Goals 无选中项时反复发出不合法的画布请求

位置：`plugins/native/goals/src/momentum-client.ts:124` 总拼接 `goal_id=`，经 `apps/local-host/src/project-stage-data.ts:39` 进入 `goals.stage.read`；`plugins/native/goals/src/stage-action.ts:20` 正确要求提供的 id 非空。真实 Sessions 搜索用例打开空项目 Goals 页面时诊断到同一 call_id 的400，随后独立正常空画布复现连续两次400；页面停在失败/重试，重试仍发空参数。修复由 Goals 客户端省略缺席的可选选择，不放宽动作约束或给平台解析加空值兜底。QEA-38正常200及已有布局/失败重试两项通过，原选中项和普通错误重试回归保留。成本低，减少用户无效重试。

### QF-21 / P1：平台草稿较早写入覆盖新编辑或复活已删除内容

位置：`apps/workbench/src/browser/plugin-frame/drafts.ts:38` 的 parent handler 对每条消息并发打开 Cache、put/delete/match；child 同文件 `:6-30` 已登记 pending 并为账号准备等待。真实 Cognia/Todo 的公开 `host.drafts` 调用，暂停最早实际 Cache.put 后，最新正文和删除结果均被旧文本覆盖（QEA-39两项旧构建有效失败，`/tmp/quality-audit-draft-order-baseline.log`）；此前夹具未截获实际 Cache wrapper 的两次失败不作为产品证据。影响所有使用该平台入口的草稿消费者，Git 接入前必须解决。

决定：现有 parent broker 只按同键串行读、写、删，完成释放队列项；保留安装/项目命名空间、写入限额、scope复核和失败回执。一次保存失败不阻止后续调用，不自动重试。合同明确调用顺序及输入时立即交给平台，避免插件私队列让账号准备漏等。成本低；完整构建通过，QEA-39新排序3项及现有插件隔离/账号准备2项、Coding草稿1项、Todo草稿15项全部通过（`/tmp/quality-audit-draft-order-acceptance.log`，4文件21项，7.1分钟），API生成0差异。单个页面的顺序保证不宣称跨页面编辑合并。

### QF-22 / P1：冲突解决后立即中止合并失败

位置：`apps/local-host/src/workspace-git-operations.ts:375-408` 的 `resolveConflict` 先将固定正文写入 blob/临时索引，再写实际文件，但原实现未补索引 stat；Host 报告成功，下一次 `merge-abort` 拒绝 Entry not uptodate。QEA-34 实操发现后，独立 QEA-40 从 owner 的 resolve/abort 入口有效复现，磁盘与暂存 blob 均为已审正文，排除正文不一致（红日志 `/tmp/quality-audit-git-abort-baseline.log`）。用户无法从正常放弃合并入口继续，系统却已报告上一操作成功。

决定：原 Host owner 发布私有索引前调用 `workspace-git.ts:70` 的无路径 `update-index --refresh`，仅匹配 stat，不更改 blob；[Git 官方语义](https://git-scm.com/docs/git-update-index#_using_refresh)。复用原过滤器禁用规则，禁止子模块检查和额外 hook。原锁、HEAD/index/文件身份复核及部分写入未知回执保留。成本低；定向2项通过，包括其他暂存文件/后续修改/缺失文件不变、无无关过滤器执行、原 hook 只执行一次。完整 Git owner 回归19项、真实编辑10项及客户端包2项通过（`/tmp/quality-audit-git-editing-acceptance2.log`）；只读复核无 Blocker/P1。这些是定向工程与隔离 Home 证据，尚非最终头 CI。

### QF-23 / P2：长冲突正文仍被挤在目录栏

位置：`plugins/native/git/src/ui.ts:49-59` 把完整冲突编辑器放在 directory；同文件 `:72-85` 的主结果区域可以承载正文却在编辑冲突时闲置。隔离 Home 的实际桌面截图 `.impeccable/qa/review/quality-audit-git/current-conflict-light-1440.png` 显示手写正文和只读当前文件均挤在窄目录栏，移动截图没有横向越界，但这不能证明长正文核对顺畅。此次草稿恢复已防止丢失，尚未改善这一版式责任。

处置：保留本轮待实施项，优先完成 P1 的 PF-02 材料交付边界后，将冲突内容放回现有 Git result 主区域；复用 `mount.ts` 的 openResult/closeResult，让独立 Git 与 Coding 内嵌使用同一内容，不做第二页面或宿主 Git 特判。需先在真实内容上提供可操作切片，核对列表返回、切文件、diff/历史切换、读取失败、审查后继续编辑和两入口桌面/移动，再判完成。成本中，不能以现有两张无越界截图关闭。

## 旧报告复核：不能直接执行的建议

| 原线索 | 当前代码与反证 | 处置依据 |
| --- | --- | --- |
| Coding 查询边读边写 | `plugins/native/coding/src/session-observation.ts:11,25,43,54,58` 默认 `persist=false`，普通查询投影不写；持久观察显式传入写入模式并复核原记录 | 删除“普通读取必写库”的缺陷结论。观察缓存是否仍必要继续按调用方审，不因为存在投影列就删库 |
| Work Brief 未知执行会重放 | `plugins/native/work-brief/src/next.ts:39-46,84-87` 拒绝 unknown，再由用户核对原主人后清除记录 | 已有保守恢复边界，不能改成后台无条件重试 |
| Form `closed` 应设成终态 | `tests/form-actions.test.ts:194-200,263-272` 明确验证关闭后重新开始收集；`FormStore.publish` 支持该路径 | 旧报告的 draft→published→closed 终态方案不符合现行产品语义。若收敛声明，必须保留 closed→published |
| 审批先消费再投递，应改成投递成功后才消费并可重试 | `horizontal/agent-host/src/adapters/prologue-approvals.ts:210-232` 保存决定并交出一次性授权；异常注明 answer 可能已提交。`reviews.ts:118-129,225` 有核对入口和投递失败结果 | 超时不证明未执行；修改必须区分“明确未送达”和“结果未知”，不能扩大批准复用。继续检查恢复真正可用性 |
| SearchService 两次 discover 属于重复查询 | `horizontal/search/src/index.ts:247-266` 第二次在 catchUp/authority.validate 后，紧接同步授权 fence；`:568-575` 索引目录也保留前后权限 | 这是 TOCTOU 边界。若优化应缓存与失效机制由原 owner 证明，不直接删复核 |
| Images 请求封装可直接换 pluginRequest | `plugins/native/images/src/browser/request.ts:10-17` 支持 DELETE；SDK `browser.ts:184` 只接受 GET/POST | 两者当前合同不完全相同。先判断是否补齐 SDK 方法集合，再迁移真实 DELETE 调用方，不能机械替换 |
| 公开 Contract 常量仓内零引用就删除 | `packages/contracts/package.json` 是对外发布入口，包外消费者不在本仓搜索范围 | 只能给出废弃候选及合同影响，不能把搜索零命中当删除证明 |
| 对象链接平台能力缺失；后台汇总只有 Coding | `packages/contracts/src/platform/object-link.ts:12-21`、`packages/plugin-sdk/src/index.ts:98` 已有共同链接；`apps/local-host/src/home-background-tasks.ts:22-37` 按声明聚合，Images `plugins/native/images/src/background.ts:13` 已贡献 | 旧报告/11-14 平台审查已部分过时；转查剩余手写地址及 Feed/Schedule 等真实缺口，不再重建底座 |

## 六个方向的独立结论

| 方向 | 检查方式与已确认结果 | 处置 |
| --- | --- | --- |
| 隐式状态 | 对照持久事实、内存执行句柄和 DOM 状态；导入队列曾由数组与 DOM 共同决定，Feed 等待没有完成清理。Coding 的业务归档和执行归档是不同 owner 的事实，不能强并 | QF-01/02 已改；Run 显示时间耦合另列 QF-06；业务状态声明按第 47 批兑现 |
| 过度防御 | 从 HTTP/动作 schema 到 owner 写入核对校验；Home 把读取故障降成空列表确实掩盖故障。Search、SQLite、RSS 的重复外观检查分别保护等待后的权限、实际 SQL 和实际网络地址 | QF-04 已补完整性并通过定向验收；保留真实信任边界，不按 catch/if 数量删代码 |
| 用户干扰 | 核资料导入/重试、任务查看、Git 编辑、模型接入返回、审批、角色启停和账号切换 | 导入减少重选与无效重试提示；“取消”仅关闭的剩余语义差异见 QF-10；审批选项 QF-07 在验收，Git 恢复 QF-03 仍待接续实施。删除、账号权限与模型下载等有实际决定的确认保留 |
| 冗余代码 | 从注册到实际调用方，区分私有重复、公共导出和未完成能力 | Feed 三处纯绑定已删；Git drafts、WebQuery/YouTube 工厂与旧 Home events 是待核退役候选，不能连仍被使用的 channel 工具一起删 |
| 边界与调用链 | UI/HTTP、Agent、后台、CLI/MCP 沿公开动作追到事务和反馈；73 包静态边界门禁通过 | 明确事实 owner、执行身份、最终写入与反馈；发现搜索取消传递中断 QF-08。没有把边界门禁通过误作所有业务正确 |
| 平台化 | 同时从平台声明向下追消费者、从插件特判向上找 owner | 下表 13 项处置逐项区分已有能力、采用缺口、合同待补、共享工具及插件业务；优先补采用，不再建第二套目录或任务事实 |

## 其他已确认问题和设计风险

### QF-06 / P2：显示时间保存影响了执行终态与下一轮准入

`horizontal/agent-host/src/adapters/prologue-run-store.ts:131-133,214-228` 在执行账本已经终结后，仍把公开 phase 暂时设为 running，等待 `saveRunTiming`；`latestEnded` 又依据该公开 phase 判断是否结束。`tests/prologue-recovery.test.ts:449` 已有用延迟提交控制这条路径的测试。因此这是现行设计耦合，不是本轮声称复现的随机卡死：非业务的显示时间写入会延长用户等待；无限等待的极端场景本轮未实测。

处置：中成本，归 agent-host。保留“执行账本提交后才终结”的正确边界，把时间元数据的保存/失败与执行终态分开；不得直接删账本等待。需验证下一轮可启动、重启后的时间未知、迟到完成不改写新 Run、取消与保存失败。第八批已实施，公开 Adapter 四终态 × 时间延迟/失败及真实 Node 恢复等共 7 文件 58 项通过；时间与启动意图在真实 Node 仍共享 index.update 队列，不承诺跳过挂起磁盘事务。最终门禁/CI 未完成。

### QF-07 / P2：当前不能批准的待审项仍有批准按钮

`horizontal/agent-host/src/reviews.ts:193-215,252-278`：当前插件操作的批准仍要求原安装持有授权；`apps/workbench/src/agent-review-surface.ts:136,240` 原来只按 pending 与文档可读提供批准/拒绝。第九批 HTTP 旧构建已复现：原 authority 失效后批准按钮仍在，服务端拒绝。

[BL-360 的现行授权验收](../agent-approval/spec.md) 的重启前提已过时：`prologue-git.ts:98-104`、`prologue-checkpoints.ts:181-189` 和 `prologue-review-documents.ts:297-304` 会撤回失去执行方的原等待。没有当前决定处理器的 raw pending 也不能称“能拒绝”。处置：队列按状态、处理器、原安装授权实时投影 `decisionOptions`，页面只画可执行按钮；保留决定与派发复核，不恢复旧授权。正常 Git 关闭最后依赖入口、重新激活后旧操作只能拒绝的实操已通过（47.5 秒），暂存区与 HEAD 不变；服务/侧栏与真实 SDK 恢复回归通过。原 BL 保留到最终资源、门禁与 CI 验收完成。

### QF-08 / P2：搜索请求取消没有穿过 HTTP 入口

`apps/local-host/src/search-http.ts` 的四条路由及 `web-project-platform-routes.ts` / `web-catalog-routes.ts` 原来都不把断连交给 BoundActionClient。[BL-search-query-abort](../backlog/BL-search-query-abort.md) 的传输缺口成立，但“每次搜索把各来源跑完”需纠正：`horizontal/search/src/index.ts` 的 `catchUp → sync → indexer` 是由 Search owner 维护、供多个查询复用的索引工作，不能随某个查询取消。`docs/horizontal/search.md` 明确没有按查询触发的外部来源协议。

2026-11-16 深查又确认两处同链缺口：`SearchService.open` 切到个人空间时整体替换 access，丢失原信号；对象读取 catch 会将取消降为不可用并继续查存在。`horizontal/search/src/references.ts:ownerRead` 则把取消吞成 null，直接服务调用方无法区分放弃与对象缺失。根因是传输生命周期、共享索引和单请求读取没有被分别保留。

处置：第五批已实施并通过定向验收。Host 采用已有 `responseAbortSignal`；Search 保留个人空间调用的原信号，并让取消越过不可用兜底；共享索引及异步后权限复核保持。修复前的隔离 Home 实操测试已复现 Home/项目 HTTP 断连后 owner 读取继续；直接服务测试复现个人空间 open 与引用读取缺少预期拒绝。共享索引测试在修复前通过：两次查询共用一次列表和正文读取，取消第一请求后第二请求取得真实落库正文，这条正确语义作为回归保留。第五批完整构建、HTTP/服务/权限与 MCP 消费者定向验证通过，明细见接续批次验证；最终整合门禁/CI 未完成。

### QF-09 / P2：需求索引与现行 spec 的阶段不一致

`specs/README.md` 的 state-machine-platform 条目仍写“尚未实现”；`specs/state-machine-platform/spec.md` 开头已明确第 26 批交付 Manifest、SDK、词表首片与只报告门禁；生产实现位于 `packages/plugin-sdk/src/state-machine.ts:16-38`。索引读者会把“采用未完成”误认为“底座未实现”，重复开工或错误清账。

处置：低成本，本轮已依据原spec校正索引，明确第26批交付范围与第47/48批接续；没有改成“全部完成”，没有更改原spec或各批验收结论。存量迁移与待本人验收继续保留在原待办。

### QF-10 / P1：导入停止与传输生命周期脱节，失败回复仍可能写入成果

`apps/workbench/src/side-panel-files.ts:78` 的取消按钮与标题栏关闭使用同一 `data-knowledge-import-close`；`apps/workbench/src/browser/knowledge/import.ts:240-241` 只执行 `dialog.close()`，busy 时还特意保留队列。`importFiles:188-210` 不检查关闭或取消，继续处理本批。QEA-06 实操证明关闭/重开后仍完成真实导入；这证明恢复原界面有效，不证明“取消操作”已提供。

影响：用户在导入中点“取消”，仍可能继续写入后续文件。第十批改为明确“停止后续”，等待当前真实回执、不再发出下一项，保留剩余与失败项；标题栏/Escape 收起可恢复，在线单项处理中页脚写“收起”。转写队列不再持有旧 DOM 行作为事实，续传前重画真实待处理项，失败与未开始项保留。两个忙碌入口归为一个当前批次对象，running/stopping 与控件从它推导。

Host JSON、原件上传原来都没有把断连传给已支持取消的 artifacts concurrent 动作；现在在 HTTP 中用既有 responseAbortSignal 和 BoundActionClient control 传入，NDJSON 超界也撤销本次控制。owner 的读取/写入前 fence、固定版本身份与临时原件 finally 清理保持原样。主动停止后续不切断当前回执，避免人为制造结果未知；真正断连发生在已提交之后仍不承诺回滚，不自动重试。旧构建 QEA-23 两项、QEA-25 两项已复现界面行为；正常初始化后 QEA-24 六项也复现：四种断连没停提取，两种流式超界返回 actions.output_invalid 后仍有真实成果版本，故传输部分升级为 P1。修复正构建，尚未计为验收完成。

### QF-11 / P2：侧栏标签的近似溢出判断漏掉真实一像素位移

- 位置：`apps/workbench/src/side-panel.ts:405-415`；真实入口为项目页顶部侧栏标签，focusin/悬停 → grow → keep → scrollLeft；锚点归侧栏控制器，滚动合法范围归浏览器。
- 证据：CI Full两次运行各自重试仍在dark@2x发现图标偏移；本机打开多个插件后逐像素调整窗口，在1408/1480宽度复现。展开后scrollWidth=301、clientWidth=300，而精确容器宽度为299.891/300.016，图标移动1.109/0.984 px，scrollLeft仍为0。
- 根因：`scrollWidth > clientWidth + 1` 用取整尺寸重复判断可滚动性，排除了正好一像素的真实溢出；原0.5 px的位移标准本身没有问题。属于第32批已有路径，本轮导入/Feed改动未涉及此逻辑。
- 决定：第四批先验证删除门槛能够修复此复现（QEA-10原位移1.125、滚动0，修复后通过）。最终同步的主干#2098包含同一修复及小于1px残余位移处理，采用其完整实现；本轮side-panel生产差异归零，只新增QEA-10回归；几何诊断最终采用#2094主干完整文件，不重复建设或重复记功。最新共享消费者、视觉与Full按PR记录验收。

### QF-12 / P1：项目任务重绘丢失停止操作的进行中状态，并保留旧命令参数

位置：`apps/workbench/src/browser/work-task-panel.ts:takeTasks/stopTask`，调用方是任务列表、任务卡及事件卡；`work-bar.ts` 从同一个 attention 回答交入投影。原 `stopTask` 每次点击都会生成新请求；`takeTasks` 只比较 `commands.length` 等局部字段，等长新命令不进入 `tasks`。前者可能重复命令，后者让用户点仍可见的按钮却被 Mainline 的当前命令检查拒绝。

依据：旧构建的真实 Coding 路径持有停止回执、刷新 owner 状态后 disabled 为 false；真实第三方插件只把命令 `input.job` 从 `export-1` 改为 `export-2`，页面已收到新回答，实际 POST 仍发 `export-1`。均为独立断言失败，不以超时推断。

处置：第七批已实现并通过定向验收，最终门禁/CI 待完成。工作台唯一面板控制器维护本页尝试，三个展示位置共用；成功后的新读取交回 owner，明确失败可由用户再试。比较完整任务投影，删除不完整缓存键；Mainline 原执行前复核保持。QEA-17 的真实停止重画、同数命令新输入及同插件双来源已通过，原真实进程停止/未知回执不自动重试继续保留。

### QF-13 / P2：切换项目后旧 attention 请求阻塞并可能覆盖新上下文

位置：`apps/workbench/src/scripts/client/attention.ts:read/listen`，真实入口 `arrival/chooser.ts:chosenRoute` 和 chooser 项目选择。原全局 reading 布尔值跨路由继续持有旧请求；成功回答无目标核对，404 分支还读取当前路由登记 gone。用户切到 B 后仍等 A，旧失败可能使 B 看起来已删除或离线。

依据：正常 chooser 持有 A 的真实回答后切 B，成功/404/网络失败三种旧结果均让 B 的读取超时；这直接证明阻塞。迟到覆盖与错误 gone 归属来自调用链检查，修复后通过释放旧回答的消费者事件断言验收，不冒称基线已动态覆盖每个副作用。

处置：第七批已实现并通过定向验收，最终门禁/CI 待完成。每个读固定地址与 AbortController，切换取消旧等待并使其回调失效，旧 finally 不能收走新请求；同地址仍合并刷新。沿原单一事件流，不新增轮询或业务状态。QEA-18 已验证切回 A、迟到错误不污染当前上下文，Home 列表回归通过。

## 平台化与通用化检查及处置

| 候选与当前实现/消费者 | 定制造成的问题 | 事实与规则 owner；处置 | 顺序/成本 |
| --- | --- | --- | --- |
| PF-01 对象引用、跨插件呈现：`packages/contracts/src/platform/object-link.ts:12`、`horizontal/surfaces/src/position.ts:20-34`、`apps/local-host/src/surface-slot-http.ts:75,122` 已有受控 plugin-slot；Inbox `plugins/native/inbox/src/browser/client.ts:40`、Risk `plugins/native/risk/src/browser/client.ts:45`、Work Brief `plugins/native/work-brief/src/browser/client.ts:22` 已使用，PPT `plugins/native/ppt/src/plugin.ts:35-45` 经 Pages 公开动作读内容 | 未发现这条 PPT→Pages 路径跨实现直连。组合槽已有 UI contribution 声明、Host 兑现和真实消费者，不能只搜 manifest.ts 就误报未采用，更不应重建底座 | 插件拥有内容/修订；平台拥有位置、身份及授权。保持 surfaceSlot 与 objectLink；新增组合沿相同入口验停用、撤权、对象删除和返回，不开放任意 iframe、不解除 mountDeclared 的 owner 限制 | 保持现有方案 |
| PF-02 输入的材料来源：旧 parent 固定 sources:false，底栏菜单和来源服务已存在；实施见 QF-24～29 | 已采用父页受控交接和 Coding 消费；首次/后续/steer、未知回执、来源撤回、混合材料失败与同child重挂已有真实验收，最终组合CI待完成 | 平台父页持本人身份获取选择，只在本人发送时交材料引用；当前 onMaterials 即时回传与 child composer-send 必须一起约束，不能让子页绕过本人发送。Coding 要实际消费 input.materials，并核首次/后续/steer 及失败引用留存；大小约束须与 owner 对齐，复用原菜单。归 [BL-composer-frame-sources](../backlog/BL-composer-frame-sources.md)，不是取消 frame 权限隔离 | P1体验/中 |
| PF-03 Memory 会话来源：`apps/local-host/src/memory/memory-sources.ts:13`、`apps/local-host/src/memory/memory-session-binding.ts:51-64`、`apps/local-host/src/memory/memory-runtime.ts:20` 点名 Coding/Assistant | 第三个插件有合法 Agent 会话也要改 Host；来源资格和业务状态检查散在宿主 | 平台拥有可信会话身份/授权与记忆策略；插件提供来源可读性/业务状态的声明 reader。随 plugin-equal-standing 收口，迁移 Coding 实际路径再删特判，不能把资格交给输入字符串 | P2/高 |
| PF-04 后台任务：`apps/local-host/src/home-background-tasks.ts:22` 与 mainline；Coding/Images 已贡献，项目引导整理仍只有后台执行 | 有工作却不在任务入口；汇总失败又看似无工作 | 任务状态仍归业务 owner，平台管发现/完整性/可执行命令。接入既有 background_tasks/reports_to，修 QF-04；引导归 [BL-107](../backlog/BL-107.md) | P1体验/中 |
| PF-05 设置：`packages/contracts/src/platform/settings.ts:16,30` 有层级/CAS/request_id；`packages/plugin-sdk/src/sandbox-agent-declarations.ts:51` 仍拒绝沙箱 settings_entries；原生插件没有声明消费者 | 有合同不等于作者可用，局部设置仍各做继承、修订、返回 | 设置值/规则归 owner，平台管声明、继承呈现和调用。先完成 Runtime 读写兑现、选一个真实设置迁入再推广；本轮不建立全局配置大仓 | P2/高 |
| PF-06 草稿/返回：Git已采用公共frame drafts，旧无生产读写工具已删除；QF-03/21/23/46 | 修复刷新/返回丢编辑、同键旧写覆盖、迟到回执干扰当前文件；独立Git及Coding内嵌的11文件109项通过，最终组合CI待完成 | 草稿文本归编辑器，平台提供按 Home/项目/安装/入口隔离与返回。Git 按工作区/文件修订接入，冲突正文不套输入框 4KB 限额；成功后才清草稿 | P1体验/中 |
| PF-07 来源拉取：Feed已沿公开SourcePull plan消费；Alchemist研究走Host Search Runtime、市场脉搏用插件来源适配器；旧WebQuery/YouTube工厂已退役，YouTube频道工具保留 | 已删除Feed重复intent/计划与两项SEL依赖，复用平台预算/来源可用性；真实Runtime与RSS安全消费者通过。退役Feed版本例外仍待已提出的审批，最终组合CI待完成 | 集成拥有 URL/cursor/格式规则，平台管受控网络/凭据/证据。优先复用已有 presentation 登记；迁移剩余专属调用方时评估声明式输入是否足够，再废弃旧词汇/工厂。先核包外导出，保留 channel 工具；RSS 固定 IP 与 OAuth 刷新不硬并成普通 fetch | P2/中高 |
| PF-08 等待/调度/取消：`packages/plugin-sdk/src/execution-lifetime.ts`、`packages/plugin-runtime/src/activation-jobs.ts`、`horizontal/scheduler/src/index.ts:252,274,392` 租约、Workflow/Alchemist 自有进程记录 | 散落的计时器容易泄漏；但不同业务终态强并会破坏恢复 | 复用资源生命期工具；业务流程状态及租约回执留原 owner。Feed QF-02 已修；不再造通用万能 Job 表 | P2/低到中 |
| PF-09 调用追踪：`packages/kernel/src/action-settlement.ts:107,152,175`、`horizontal/observation/src/records.ts:164` 已有 call_id/invocation_id/parent_invocation_id；本轮 request-failure-call-id 浏览器回归覆盖故障详情 | 这部分已有跨层身份，不是应重新建设的缺口；本轮未证明所有插件业务写入均已完整关联 | Kernel 管调用身份，owner 管 subject/revision/事务结果，Workbench 管可见反馈。保留现有观测/查询；后续按具体未关联写入补证，不把泛化风险登记成已复现缺陷，不建立第二套日志身份 | 保持现有方案 |
| PF-10 HTTP 中止：Search 入口未透传、composer 已透传 | 调用方取消了，后台继续做；重复请求叠加 | Host 负责 transport→Action signal，SDK/Runtime 负责停止和写入 fence；修 QF-08，不为每插件造 AbortController 框架 | P2/低到中 |
| PF-11 动作绑定：公共 bindActionHandler 与多插件本地副本 | 纯换参/类型断言重复、元数据接入容易漂移 | 公共合同管绑定，插件保留业务上下文。Feed query/inbox/rule 三处已验；另五插件已迁移，9 处 availability 因实际业务职责保留；QEA-26消费者定向通过，最终组合CI待完成 | 本轮已做/低 |
| PF-12 固定成果与过程项：`plugins/native/dataset/src/promote.ts`、`plugins/native/ppt/src/promote.ts` 已用 owner 事务与 artifacts 联合提交；成果导入走同一服务 | 局部再存一份最终正文或把过程项当成果，会产生两个版本主人 | 业务编辑稿归插件；固定可引用成果归 artifacts，过程项走声明。复用已有联合提交，不统一各插件的编辑状态 | 保持并检查采用/中 |
| PF-13 批量证据读取：`horizontal/evaluation/src/observation-bridge.ts:71-85` 的fetchObservationEvidenceMap对每条记录调用 `observation.evidence.get@1`；当前消费者为评测执行器 | 新main已修复500条静默截断，完整大样本随后产生N次解封动作；正确性保持，但调用成本随证据数线性增加 | 观测层拥有证据解封、用途及跨项目授权；评测拥有样本选择和unknown判定。归现有[BL-evaluation-read-cost](../backlog/BL-evaluation-read-cost.md)，补观测批量公开动作并迁移实际评测消费者；保留逐项拒绝/不可读原因，不跨读私有表、不让评测复制授权规则 | P3/中 |

PF-03/05/07/13 是采用或职责收口候选，即使目前只有一个实际消费者也须按 owner 判断；PF-08/12 同时列出不该平台化的业务部分。PF-01/09/12 是保留现有方案的判断，不冒充新发现。以上是本基线处置建议，不是全部已经交付。

## 需求整体实现度

判断：平台骨架、核心插件的大量功能已经真实实现，但整套 Molis Work 仍不能标为“内部完整”或“可发布”。这不是按代码量或 BL 数量算百分比：需求条目粒度不同，包的 production 登记也不等于整份产品需求验收。

本轮核对基线索引的 53 份活跃 spec（加本任务共 54）的状态与目标范围，并按以下12个需求族交叉查看代表实现与统一 BL；没有逐条重做53份 spec 的全部验收。可分为：

| 需求族 | 当前实现与证据层级 | 剩余实际结果 |
| --- | --- | --- |
| 动作合同、公开边界、SQL owner、升级链 | 已有生产路径与回归；本轮边界门禁和构建支持工程判断 | 存量 owner 采用、真实升级与各批最终验收不能被本轮替签 |
| 状态机平台 | 第26批已有声明/SDK/词表；本轮确认代码存在 | 第47批 Runtime 兑现、创作台、只读登记与第48批展示；144条旧盘点需逐条复核而非机械迁移 |
| 项目首页、工作线、明确交办 | 第15/32批已有实际组件、后台汇总、持续接单；最新#2098修复首屏旧版式闪现与聚焦抖动；工作线spec列了首片编号 | 事项容器/后续组合与多工作输入模型判断未完整；[BL-b32-acceptance-test-gaps](../backlog/BL-b32-acceptance-test-gaps.md) 保留 |
| Coding 与首次引导 | 新基线第33批及#2099已交上下文/完成报告、环境准备、轮次材料、ONB-35～46材料与恢复；本轮复核改动边界，沿用原批工程证据 | BL-batch33-acceptance仍待本人验收；BL-106/107已排45/57批，不因第33批完成而关闭 |
| 输入、语音、草稿和返回 | 第10/11批及 draft-and-return R0～R4 已做 | 框架来源、旧 Home 草稿版本与 DRT-21 实操/本人验收；Git 类非对话编辑器仍有缺口 |
| Account/安装/发行 | V2 登录和 Home 统一已合入；最新#2094对齐账号密码、短信/邮箱验证码合同，认证句柄与中央令牌仍归Host协调 | unified-account 仍列最终候选 Full/存量迁移/外部服务；0.3.0 候选不等于公开可发布 |
| 插件同等待遇 | 注册装配与公开服务已成主路；规划方法片已交 | Goals 平台特判、Memory 会话点名等按第44批迁移，不能宣称同等化已完成 |
| 观测/评测/Memory | 第28/29批与Memory P0/P1已有具体代码；第30批最小真实评测路径及#2100整改已随新main带入 | 已知局限、部分真实输入验证/产品入口仍在原 BL；不能用本轮静态检查替代真实模型质量 |
| 资料导入、Feed、Inbox、常用编辑插件 | 核心路径工作，本轮修复导入/后台资源并有隔离实操 | Inbox 主线程性能、通用恢复一致性、各插件独立体验验收仍需跟进 |
| 创作台/Alchemist/智能呈现 | 有沙箱、job/replay、组合首片 | 完整创作→修订→安装→长期使用闭环尚未完成；Jev 质量/延迟及后续生成页面不是“只有文档”的问题，也不是已验成品 |
| Sessions 重做、团队协作/团队记忆、主动建议、Agent 显式人审 | 各有 spec；部分底座或在途实现 | 整项未实现/未合入的部分保持原状态；在途 PR 不能计作本基线完成 |
| 同步/桌面/计算机使用 | 已有实现、隔离测试及历史实操证据 | 本轮未接真实云、系统 WebKit、真实账号/模型，不据此签发布与真实环境验收 |

## BL 与事项清理建议

基线 527 条：待本人验收 64、明确后续做 202、已知缺口 170、未实现 46、部分实现 37、待用户决定 8。这里只给经核实的清理处置；未逐条销账的 527 条不统称过时。统一待办正文仍以 `specs/backlog/` 为准。本轮没有删除用户验收项或替其他会话结项。

| 条目 | 当前证据与可清理部分 | 应保留什么/执行方式 |
| --- | --- | --- |
| [BL-1039](../backlog/BL-1039.md) | 现行首次使用按钮已区分未连接/已连接，`tests/context-onboarding-action-copy.e2e.test.ts:22` 覆盖；第27批 action-copy spec §验证已有隔离实操证据 | 可关闭“未实现”的工程记录；本人验收并入 BL-batch27-acceptance，保留原编号到墓碑，不代签本人验收 |
| [BL-1040](../backlog/BL-1040.md) | `plugins/native/git/src/browser/source.ts:103-124` 已将状态改普通文字、缺远端隐藏 PR；`tests/git-source-controls.e2e.test.ts:18` 覆盖真实本地仓库、AX 与键盘 | 可关闭重复工程记录，剩余体验认可并入第27批验收；与 QF-03 的刷新/冲突草稿恢复不是同一问题 |
| [BL-040](../backlog/BL-040.md) | `packages/contracts/src/platform/plugin-sandbox.ts:121` 和 SDK sandbox-read-protocol 已有 subject_context；“生成插件不能声明对象读取器”过宽 | 已纠正正文：保留搜索来源与创作台草稿动作层缺口，区分read_protocol与ui.subject_context，未删除整条 |
| [BL-055](../backlog/BL-055.md) | `packages/plugin-sandbox/src/runner.ts:31` 已是真实子进程沙箱，“当前进程内执行器”描述失效 | 已删除过时进程内括注；保留Jev质量/延迟、实际平台边界验证及跨项目草稿，负责人不变 |
| [BL-observation-b28-known-limits](../backlog/BL-observation-b28-known-limits.md) | 正文已记录第29批补齐①②③、后续修⑥ | 完成子项移到来源 spec 的证据段，BL 只留④⑤等当前残余；不因列表里有已做项删整条 |
| [BL-115](../backlog/BL-115.md) | 正文记录离线备份/恢复/续接已在 main，真实 Home 2026-11-07 已做 | 将已完实施转为来源说明；只保留登记覆盖核对与 C 端在线定时备份，避免再次立离线备份实现 |
| [BL-117](../backlog/BL-117.md) | 策略、版本检查与0.3.0候选已有；公开发布资格仍在发布记录 | 与发行检查单保持一个剩余清单入口，不删除 Developer ID/公证/公开发布待办 |
| [BL-943](../backlog/BL-943.md) | 第06批有70→66、68→64的历史探针；仍未到原预算 | 与 Inbox 性能项关联同一目录 owner 代次方案；合并技术实施，不删原验收约束、不删权限复核。本轮未重测这些绝对数字 |
| [BL-inbox-update-blocks-host](../backlog/BL-inbox-update-blocks-host.md) | 当前 scene→availability→安装记录链仍存在；旧实测10秒级，不是本轮新测 | 保留高优先，先复测/剖析，再做一次操作内有失效代次的复用与让出事件循环；不通过放宽 UI 超时消账 |
| BL-360（main 第39批已归档） | 最新主干已实现 owner 的 `decisions/readMany`、版本与持久决定；本轮旧投影被覆盖 | 接受主干删除，迁移并保留 QEA-21/22 的撤权、重启及三个界面反证；合并交集复验中，不复活重复待办 |
| [BL-search-query-abort](../backlog/BL-search-query-abort.md) | 第五批已补 HTTP/个人空间/引用 signal，真实取消与共享索引测试通过，见 QF-08 | 已改正文去除“每次查询把所有来源跑完”的错误前提；待最终 CI 后按原流程关闭 |
| [BL-home-events-endpoint-unused](../backlog/BL-home-events-endpoint-unused.md) | 全仓生产客户端查询无调用；路由与测试仍在。MCP 使用公开动作，不证明包外 HTTP 没人用 | 代码退役候选：核对既有外部公开约定后，路由、只读放行、专属用例一起删；目前不据零命中直接删公共端点 |
| [BL-plugin-release-module-source](../backlog/BL-plugin-release-module-source.md) | 已有明确待用户决定，涉及库内保留内容及恢复路径 | 保留决定；“现在通常用不到”不等于授权删库/兼容机制 |
| [BL-composer-frame-sources](../backlog/BL-composer-frame-sources.md) | 原固定 sources:false 已改父页受控交接，Coding first/next/steer/wait 与回执路径实施中 | 本批验收与合同检查完成后再关闭；当前保留，见 PF-02/QF-24 |
| [BL-107](../backlog/BL-107.md) | 引导已经 Host 后台执行，缺后台任务登记 | 收窄为登记/进度/返回入口，复用现有任务贡献，不新做执行引擎；新main已注明45/57批排期，保留该归属 |
| [BL-177](../backlog/BL-177.md) | Sessions 新实现有在途 PR，当前基线尚不包含其完整目标 | 保留原归属；合入并对照全部三类场景后再拆完成/剩余，不能按 PR 标题销账 |
| [BL-state-machine-migration](../backlog/BL-state-machine-migration.md) | 144/89/55/32是旧盘点口径；SDK 已有，但所有布尔组合不都是真状态机 | 按实际 owner/合法迁移/取消恢复复核，剔除纯派生与资源句柄；保留逐批迁移，不宣称本轮确认了全部144条 |
| [BL-acceptance-first-slice-limits](../backlog/BL-acceptance-first-slice-limits.md) | modules/acceptance 已有项目范围事实；个人范围及可信决定接线未齐 | 保留对39/44批的依赖，别再开第二套“要求—证据—认可”存储 |
| [BL-1064](../backlog/BL-1064.md) | 锁定 Node 已有；本轮也发现默认24.14与要求24.15不符，切换后相关初始化恢复 | 保留 Homebrew 动态库/发行入口的未验证部分；开发环境切对 Node 不能证明所有安装用户问题已解决 |
| 待本人验收64条/第32批验收缺口 | 工程通过与本人认可分开，且部分真实模型/多事项场景没有确定证据 | 不批量删除、不代签；只合并重复的“验收入口”，保留原编号与负责人 |

BL-1039/1040 可在保留第27批本人验收和墓碑映射后清理工程待办。其余条目没有足够证据整条删除；可立即做的是删除失效子描述、把已完成子项移回证据、合并同一实施路径的剩余工作。接续任务已实施 QF-04 和 QF-08，定向证据见后；QF-03/06/10 仍在本任务待实施范围。现有 BL 仍是跨任务归属，不能把这份报告当成第二套持续更新的任务台账。

PF-03 当前复核补正（6359987103）：Coding业务映射已通过 `coding.sessions.binding.read` 读取，Host没有直接读Coding表。剩余第三插件采用缺口在 `memory-sources.ts:57`、`memory-runtime.ts:17`、`memory-learning-owner.ts:93`、`memory-learning.ts:107` 与公开 `services/memory-session.ts:6` 的封闭绑定类型；不可只删白名单，把安装身份和业务授权交给输入。平台负责真实安装/generation、canonical Session、原件作者/版本、权限与SDK生命周期；Coding的归档/映射、Assistant的work/delegation/hold仍归各自业务owner。正常召回的common场景已经可用，与自动形成/Session管理的采用缺口分开。来源形成前后复核、SDK提交观察和原队列补账有实际边界依据，保留；第三插件采用需要补公开owner声明并迁移真实调用方，仍在原任务范围内。

## 分批优化策略

1. **本轮前三批**：导入队列与准确反馈 → Feed 取消监听释放 → Feed 三组动作绑定迁移。范围小、真实路径明确，不涉及库/公开 API 版本、权限或新依赖。验收以 QEA-05～09 和现有业务回归为准。CI发现的QF-11另纳入第四批，以QEA-10补齐真实一像素滚动边界。
2. **下一批用户连续性**：Git 草稿恢复、Home 任务完整性、待审项可执行决定、搜索取消、导入“收起/停止”的明确语义；先写各自输入/结果/恢复合同，再走正常入口。用户少重写、少点无效按钮、少把正在工作的任务看成消失。不同 owner 分片串行整合。
3. **下一批性能与平台采用**：优先 Inbox 主线程阻塞与目录读取代次（关联 BL-943），再做 composer 材料、设置首个真实消费者、Memory/来源声明迁移。先量一次真实操作的调用/开库/阻塞，再定缓存失效；不以删除权限检查换速度。
4. **最后退役**：迁移消费者且证明包外合同后，删除旧 factory、旧 Home events 和未用草稿工具；不要先删再给调用方加兼容兜底。大状态/存储/核心改造保留版本、连续升级与 CI Full。

## 从一次操作追到事实与反馈

| 正常入口 | 合同/编排 | 最终 owner 与写入 | 页面/开发者如何确认 |
| --- | --- | --- | --- |
| 侧栏导入 | workbench import → artifacts HTTP → importDocument | artifacts 固定版本/原件与既有去重 | 当前文件结果行、失败原因、未处理队列；测试直接读真实成果记录 |
| Feed 选消息入箱/规则 | Feed 公开动作 → Kernel schema/authority → Feed/attention | 原消息归 Feed，入箱状态归 attention；事务/版本检查 | 原条目状态与 Inbox 可见结果；已有入箱/重开/取消用例 |
| Agent 提案→用户决定 | agent-host review queue → 原授权 → Prologue answer | 决定/一次性消费归 review owner，实际执行账本归 runtime | 回执区分失败与未知；call_id 连 invocation 与父调用；不能把投递超时当没执行 |
| 后台排期 | 插件声明 → scheduler claim/lease → 公开动作 | 排期业务记录归插件，租约/唤醒记录归 scheduler | mainline/tasks 读取 owner 的实际状态和命令；Home 完整性缺口见 QF-04 |
| 跨项目复制 | placement 预览/确认 → 持久身份计划 → 各 owner prepare/apply | 各 owner 只写自己的事实，最后发布项目 | 稳定 operation 回执；失败保留未完成副本，同一身份接续 |

所有结论都以本基线为准。真实模型、外部账号、线上云同步、用户真实 Home 和本人认可没有在本轮被代替验证。

## 接续批次验证（main 70aaa976b，尚未整体验收）

- 第五批搜索：修复后 HTTP 取消 4/4、服务 37/37、Host 1/1、刷新预算 1/1、引用 4/4、对象引用权限 3/3 通过；独立重跑真实 stdio MCP 授权 12/12 通过。保留前次 7 项超时，原因未确认，不以重复通过删除记录；未调等待上限或放宽断言。Search 健康检查通过，giant 数量不增。
- 第六批 Home：构建后 7 文件 41 项通过；原 Coding 子进程停止 1/1、插件页拒绝 Home attention 扩权 34/34 通过。QEA-14～16 的来源失败、超时、恢复、实际 Home/项目入口与等待中重画均有覆盖。12 张截图与实看结果见 coverage；资源增量、其他必跑、最终 CI 待完成。
- 第七批：旧构建三项问题已复现，修复构建通过。最终 QEA-17 同插件双来源 1/1、QEA-18 三种迟到结果 3/3 通过；原 Coding 停止、Home 完整性及相关客户端/工作线/chooser 通过，详见 coverage。错误场景首轮切回失败来自测试拦截器未关闭，修正后通过；没有调整产品断言。尚无最终提交或 CI 证据。
- 第八批：公开 Adapter 的完成/失败/取消/停止 × 时间保存延迟/失败 8 项在旧构建全部复现错误 running；控制先结束但 SDK 账本未终结的拒绝边界在同一用例成立。已移除显示时间覆盖 phase 的逻辑，完整构建通过；7 文件 58 项通过（运行交错 8、恢复 22、停止 1、预算 6、SDK effects 13、运行观测 4、搜索取消 4）。只读评审未见 Blocker/P1。真实 Node 的时间与启动意图仍共用串行 index.update；本批不声称磁盘挂住时可以绕过持久队列。完整门禁/CI 未完成。
- 第九批审查选项：旧 HTTP 用例已复现撤权后仍提供批准。Queue 即时投影与 Host、主审查面、浏览器/电脑侧栏三个消费者已迁移，完整构建通过。首轮 13 文件中 9 文件通过；另外新增 HTTP 的状态码预期应为现行 409 而非 403，两个浏览器夹具分别漏一次性操作键/显式 Host，另有一个命令文件名误写，均已修正并在复验。第二轮 6 文件中 5 文件通过：侧栏 2、HTTP 11、checkpoint 4、浏览器目标 4、Coding 时间线 3；Git 实操发现测试误把隐藏独立 Git 页当停用实例，实际 Coding 仍嵌入 Git，故继续可批准正确。已加断言保留该语义，再关闭最后的 Coding 入口检验旧激活失效，待复验。原 Git 正常批准/拒绝 2、review kinds 安全 14、浏览器目标 4、电脑消费 13、审查渲染 19、SDK Git 7、反馈 2、Queue 2、standing 3 项通过；不能算新增正常入口已验收。
- 第九批正常入口补验：Git 关闭最后依赖后旧操作只能拒绝，再激活仍不能继承旧权，实际拒绝后索引/HEAD 不变，1/1 通过（47.5 秒）。四张中英文 1440/390 图已生成并查看英文390、中文1440；截图当时 diff 还在读取，已补等内容完成与1024/深浅色采样，扩大视觉复验待跑。该结果不覆盖后续新增导入改动。
- 第十批导入：旧构建 QEA-23 两项均在真实当前回执等待后复现“停止关闭窗口”；转写停止和在线 Cancel/Hide 两项也在旧构建复现。首轮 6 个 HTTP 用例尚未到达提取进程，不计作缺陷复现；补正常项目初始化后，第二轮 6 项均有效失败：四种断连后提取未退出、两种进度超界仍登记实际版本（77.8 秒）。修复构建/验收中。静态只读复核未见 Blocker/P1，指出缺少超界取消分支验证，已补 JSON/raw 两个真实 helper 超界场景；尚未运行，不能以代码评审代替通过。原件缓存与成果版本分开，断言零版本不承诺磁盘零文件。
- 第十一批公共动作绑定：Dataset、Form、Todo organizer、Cognia、Images 已迁移，删去 5 份换参/断言，保留 9 个 availability 与全部业务/授权规则。既有公开动作及实际 owner 测试标注 QEA-26，尚待构建/验收。必跑及新增验收清单累计 181 个去重文件，未将清单数量当已通过数量。
- 额外执行 `pnpm typecheck:tests` 未通过，首次有 4,095 条诊断，最新为 4,090 条；忽略行列号比较未增加诊断、消除 5 条。新审查入口及侧栏测试没有直接诊断；另移除旧 HTTP 测试中不存在且未使用的 AgentHost 导入（尚未重跑类型检查）。本轮新测试的三处直接问题（未用导入、未声明 caller 类型、旧 steer 返回形状）已修正。检查到 Coding、Host 日志、插件页及 MCP 授权的列出错误位于未修改行，但尚未完成全量基线归因，不将此命令算通过，也不把诊断条数当作业务 Bug 数。

下列记录属于接续前批次，保留原证据与限制，不能覆盖本次新改动。

## 验证记录

- 基线：`efdaa3376`；离线安装和完整构建通过。初次默认 Node 24.14.0 下，新增测试及原有成果浏览器测试均在 Goals 初始化报错；后续统一使用仓库锁定的24.15.0，不把版本不符当作确认的产品缺陷。最后一次构建包含英文按钮、公共绑定本地名称与全失败队列顺序修正。
- 浏览器使用独立 headless-shell，通过公共 test-kit 建临时资料目录与隔离 Home；未使用日常 Chrome，未修改真实4207 Home。外部模型用本地 stand-in，未据此判断真实模型质量。
- 工作台/Feed README 必跑共58文件：首轮56通过，476/479项通过。项目目录快速切换在候选与同提交干净基线均出现2～3次 brief读取而非预期1次，保留失败；测试的输入时序原因尚未证明。两项 Jelly 返回测试在干净基线定向通过、候选完整12项复跑通过，根因未确认。
- 第三批后的13文件复验：12通过，Feed界面3项超时；当时有基线冷构建重叠，日志包含CDP超时及事件循环无空闲。停止本轮其他重活后，Feed完整4项在原断言/超时下通过。没有修改超时、断言、隔离名单或产品子集清单。
- 直接消费者补验13文件/200项全部通过：导入3、Feed界面4、Feed Runtime62、同步授权22、查询消费者7、Inbox场景4、准备页20、调用记录22、翻译与资源56。工作树累计74个文件的最新结果为73通过、1个上述主干同样失败的文件；按运行器汇总699/700项，不把重复运行相加。
- `affected-tests --full` 给出140个候选文件，含按工作台目录选中的大量静态/界面用例；本地已跑包必跑、改动用例及直接动作消费者。未在本机跑Full，余下覆盖及阶段Full按仓库规则进入CI；用户于2026-11-15已授权推送/草稿PR/CI Full。CI Verify通过，Full的失败与定位见下方CI补验记录。
- 包边界检查通过：73包、4,189源文件、22,474个import。健康门禁通过，处理器输入断言从248减为245；无API、schema、动作声明或新依赖变化。最终健康复核通过；随后只将公共绑定导入为原本地名称bind，以保留所有者静态检查可识别的真实调用位置，重新整体构建、边界检查及三个动作文件36项均通过，未改门禁。整批失败阻塞的补充场景已先失败复现、修复后重跑导入3项与i18n9项通过；最终健康与边界再次通过。
- 静态资源最终比较通过：65路径、无遗漏，只有资料导入脚本+166 B。基线已由正式门禁隔离冷构建并实际测量；最终候选复用同一基线测量，仍调用原测量器和策略比较，不使用虚构尺寸或修改门禁。首屏比较另发现中英文词包内容地址更新，已于2026-11-15获用户批准；批准增量见spec与任务独立许可。最终首屏实际字节为到达/选择页冷加载中英文+48/+57 B，工作台冷加载+235/+261 B、热加载+21/+38 B，两项内容地址批准已记录；用最终真实样本重跑现行首屏策略，错误为0。CI #8009已重新构建测量并通过首屏预算。
- 首屏浏览器五页面×中英文×冷/热共20次采样完成。`audit.json` 仍列动态locale请求、attention事件等未登记GET，采样成功不等于清单完整；账号/同步接口的400发生于明确不含安装登录与账号切换的测量宿主（`scripts/visual/selected-home-server.mjs:1-3`），未据此声称真实账号流程有回归。清单与实际请求的核对作为后续测量覆盖事项，不在本任务削减清单或改门禁。

| 验收 | 结果与证据 |
| --- | --- |
| QEA-01 | 通过代表入口静态检查：73包、六方向，范围/未验证项见coverage；不等于全仓逐行审计。 |
| QEA-02 | 通过：11项问题/风险各有位置、影响、owner、处置；13项平台化判断区分应补、应采用与保持现有方案。 |
| QEA-03 | 四批定向与隔离实操通过；同名补正与新main整合6文件48项通过。基线失败已单列，最终视觉/Full结论由PR对应提交记录，不用局部通过替代。 |
| QEA-04 | 通过：53份活跃spec状态/范围分组判断及BL清理表；未代签本人验收、未批量删账。 |
| QEA-05 | 通过：201份真实文本文件分200+1导入，逐份核对title、正文和唯一成果id；第二批无须重选；200份超限文件整批失败后，下次点击仍保存后面的正常文件及准确正文，已先复现阻塞再验修复。 |
| QEA-06 | 通过：处理中追加、切换类型、关闭/重开、部分失败重试；已成功项不重复写，结果行对准文件。中英文1440/1024/390、浅深色均无横向溢出；截图复核含英文动作按钮。关闭不等于取消，剩余见QF-10。 |
| QEA-07 | 通过：真实拖入401文件的目录，依赖目录不进入选择，下一批显示200且总选择完整。 |
| QEA-08 | 通过：生产等待器连续12轮唤醒、预先/合并通知、取消均清理监听；原后台失败恢复、停止/重启用例也通过。 |
| QEA-09 | 通过：查询、入箱和规则迁移后的真实Runtime、权限拒绝、撤权、实际保存/重开、来源可用性与界面消费；有独立业务职责的包装未删除。 |
| QEA-10 | 定向回归先失败后通过；完整侧栏9项、几何783个控件状态及组件板通过，最终Full待完成。 |

可复核位置：`tests/knowledge-import-queue.e2e.test.ts`、`tests/feed-content-ledger.test.ts`、Feed动作/Runtime/授权及Inbox消费用例；截图位于已忽略的 `.impeccable/qa/review/quality-experience-audit/`。终端日志位于 `/tmp/molis-quality-*.log`，不作为持久事实源；报告保留实际结果与复现入口。没有真实模型、线上同步、安装升级、系统WebKit或本人认可的本轮证据，不签整个平台内部完整/可发布。

### CI补验（2026-11-15）

提交 `a7f6122c8` 的 [CI Verify #8009](https://github.com/molis-ai/molis-work/actions/runs/43823056147) 全部通过，包含Linux实际首屏预算。[Full #1024](https://github.com/molis-ai/molis-work/actions/runs/43823067427) 第22片在 `geometry-boundaries.e2e.test.ts` 的 dark@2x 图标聚焦检查失败：右侧图标移动1px；首次及单独复跑各自自动重试后均失败，其余47片被取消。未放宽断言或登记隔离，Full未通过。

本机 Chrome .38 与对齐CI的 .50 起初各自通过原几何检查（783个控件状态），常见宽度也未复现。随后在真实项目中打开多个插件并检查1400～1600窗口宽度，1408/1480处复现图标位移1.109/0.984 px，整数溢出仅1、scrollLeft为0，确认QF-11的范围门槛遗漏。新QEA-10在原实现稳定失败，删除原门槛后通过；不调整0.5 px容差。通用几何检查保留精确坐标输出，定位用的临时滚动采样已移除，专门回归仍检查真实滚动。

诊断提交 `9ec5b9063` 的 [CI Verify #8016](https://github.com/molis-ai/molis-work/actions/runs/43826783097) 通过。[Full #1030](https://github.com/molis-ai/molis-work/actions/runs/43826860125) 在本机根因确认后取消，待其终止再修改生产实现，不计为通过。第四批完整构建通过，31个必跑及共享消费者文件30通过；仅model-ready-surfaces中两个Jelly关闭设置后返回超时，完整文件隔离复核仍失败；新主干f45994e97的干净构建使用同版本Chrome也在相同138/180行失败（10/12通过），因此不是本轮新增回归，根因未确认。原侧栏9项、几何检查及组件板均通过。

第四批实测资源（同名补正前、初始基线）：65条路径无遗漏，资料脚本仍+166 B，工作台脚本-33 B，静态策略通过。沿用同一真实基线重测首屏：到达/选择页中英文冷加载+9/+18 B、热加载-39 B；工作台冷加载+202/+228 B、热加载+21/+38 B，已批准额度内，首屏策略错误0。

评审补正：新增同名文件回归已在修改前失败（期望保留2份、实际1份）；已删除客户端以path作为身份的去重，完整构建后导入文件4/4通过，三份同名正文均保存、再次导入成果ID集合不变。

### f45994e97阶段本地整合记录（2026-11-16）

- 合入 `f45994e97` 后，候选与干净主干完整构建均通过；包边界73包、4,189源文件、22,475个import，无错误；健康门禁通过，输入断言248→245，其余受控计数未增。
- 6文件48项通过：导入队列4、i18n9、Coding第33批10、引导第33批5、引导文档18、引导恢复界面2。前三批和第四批旧运行是历史阶段证据，不与这48项重复累加。
- 同名补正删除了选择层的路径身份假设。新增回归原实现保留1份而非2份；修复后同批两份、跨次第三份均按真实正文保存，重复选同一文件复用原成果ID。
- Jelly两个关闭设置后的返回超时，在候选完整文件复核与干净新main同版本Chrome均发生于138/180行，新main10/12通过。已证明不是本轮新增回归；未确认其根因，不用更改断言/超时换取通过。
- 最终真实资源比较以新main冷构建为基线：65路径无遗漏，资料脚本+96 B、工作台脚本−33 B；首屏到达/选择页中英文冷加载+9/+18 B、热加载−39 B，工作台冷加载+132/+158 B、热加载+21/+38 B。原批准额度内，静态与首屏策略错误均为0。
- 全壳比图在该阶段曾启动，后因同步主干取消，未生成完成报告；最终差异不再触发此项，见下方范围校正。局部导入截图和正常入口实操继续保留。
- 只读评审逐批及整体通过，审查代码头 `cb55dcdcc`；没有Blocker/P1，同名P2已修复。评审使用当前可用模型（指定Opus不可用），未替代工程/实操或本人验收。

### 同步最新侧栏实现（2026-11-16，main 0d45ba58b / #2098）

最终推送前主干合入同一VUX-07边界修复：删除整数溢出门槛，并在scrollLeft取整后对小于1px残差做图标平移。保留主干完整实现，撤去本轮重复的side-panel生产改动；新增QEA-10回归与精确几何失败坐标保留。本轮贡献不重复计为主干已有的侧栏实现。主干还修复首屏旧版式先闪现，观察器后续整理归新BL-work-line-layout-observers，本轮不接管。

原f45994e97视觉采样在基线侧进行到一部分时主动取消，不计为通过；只清理该次进程组和隔离Home。新基线的构建、共享消费者、资源与视觉将重新验证。此前f459的测量是历史记录，不当作新基线结果。

新增main事项：`BL-work-line-layout-observers` 是最新主干新增的明确后续做条目；初始527条统计不包含它。保留工作台线owner与待复现场景，不将已合入的聚焦修复等同于全部观察器整理完成。

0d45ba58b阶段验证：两边完整构建通过；静态65路径通过，仅资料脚本+96 B。本地首屏采样在基线全插件页GET超时；随后CI #8027在Linux实际重测，静态/首屏/插件样式预算全部通过，采用该正式证据，不重复本地采样或放宽超时。共享消费者5/6文件通过：Jelly12/12、几何、工作区标签2/2、导入4/4、组件板通过；侧栏8/9，唯一失败是PFG-22/24完成后的HTTP服务清理超时，其功能断言与QEA-10通过，随后QEA-10与该PFG-22/24单例隔离复核2/2通过；未修改任何清理断言或超时。

最终验证范围校正：本PR相对合并基线的生产差异只有import、locale和Feed，侧栏/共享样式/外壳差异为0。按 `docs/system/PARALLEL-DEVELOPMENT.md:138`，全壳 `visual:compare` 的触发已不适用；旧采样取消且未通过，不声称有对比报告。导入正常入口、中英文三宽两主题12张失败状态截图仍有效，另补英文390宽首批完成后剩余文件提示。只读评审已核对该范围解释，不省略局部界面实操。

最新同步bd537b7d9带入第30批评测整改（#2100），无本轮生产文件冲突：unknown、证据读取完整性、记录回填及文档索引校正采用主干；新增BL-evaluation-read-cost保留在评测owner，批量读取须先补公开合同。初始527条BL统计不包含截至bd537b7d9同步新增的两个条目。相关评测用例与最终CI覆盖整合。

### 本地验收收口（bd537b7d9整合，2026-11-16）

完整构建通过。最新UI整合的6文件中5文件通过；侧栏唯一失败为 `tests/fixtures/goal-browser.ts:38` 的HTTP服务清理5秒超时，未发生功能断言失败。随后保持原断言/超时，QEA-10及同一PFG-22/24完整单例2/2通过；原清理超时不冒称已定位或修复。Jelly完整12/12、几何、标签工作区2/2、导入4/4和组件板通过。

补充英文390宽首批完成后剩余提示，QEA-05通过真实200+1写入、整批拒绝后的尾部写入、提示文字与无溢出断言；已目视复核截图 `import-remaining-en-390-light.png`，原12张失败/重试图仍保留。新main评测整合3文件20项全部通过（service9、安全7、CLI4），覆盖完整读取、unknown、真实Todo消费、取消与隔离拒绝。

Full #1035在24片通过后暴露Goals整页的预期文案未同步，第33片失败、23片取消。独立bd537b7d9完整构建后，Goals用例56项通过、2项录制开关用例跳过，52条原快照全部匹配。沿原测试正规化，只在基线HTML替换本轮导入帮助文字和英文Import按钮，16个整页分别增加7/38字符，候选52条draw逐字节匹配派生预期、36条片段记录不变。只同步这16条快照及来源注释，不放宽断言、不使用候选RECORD模式。

同头Verify #8032首次Inbox候选目录BRC-05发生HTTP连接关闭，两次失败；同头Full第9片与本机独立文件均首次4/4通过，单独重跑失败子集后82文件通过、flaky 0，Verify成功。未修改该用例、重试次数或超时，连接关闭根因尚未确认。该Full侧栏完整9/9和几何检查首次通过，但整轮仍为失败，最终补齐后的CI由PR记录。

[CI Verify #8027](https://github.com/molis-ai/molis-work/actions/runs/43839021837) 在提交56f235922对照0d45基线全部通过；官方实际首屏最大冷增191 B、热增38 B，静态65路径通过。后续仅带入主干评测整改、补强一个已有UI测试和报告；最终提交的Verify/Full状态统一见[PR #2101](https://github.com/molis-ai/molis-work/pull/2101)，不将旧头CI冒称最终头CI。

### 最后同步main 0dceaca09（2026-11-16）

#2094的账号入口采用现行Auth合同：`apps/local-host/src/account-auth-http.ts:10-35` 三条固定可信HTTP入口，`horizontal/account/src/authentication.ts:37-65` 负责登录世代、权限/取消复核及Host句柄映射，`authentication-protocol.ts:70-77` 负责一次性授权换取，工作台只消费公共结果；中央账号与验证码事实仍在Auth。保留主干实现和原批资源许可，不将其计作本轮改造。唯一冲突在几何失败诊断，采用主干完整测试文件，QEA-10独立回归保留。新基线的构建、相关账号/正常入口回归及最终CI结果见PR。

#2102补入[后台提供方缺口](../backlog/BL-work-line-background-provider-gaps.md)、[同拍汇报合并](../backlog/BL-work-line-report-batch.md)、[本人认可入口待决定](../backlog/BL-b32-acceptance-entry.md)。分别接PF-04采用缺口、助理汇报连续性及既有可信决定依赖；不新建平行BL、不替用户作出认可入口决定。初始527条统计保持历史快照，同步累计新增的5条不混进原分类数字。

新基线完整构建、包边界和健康门禁通过（输入断言248→245）。整合6文件中5文件通过：账号client15、session23、Host安全18、几何1、Goals快照56（另2个原录制开关用例跳过）。到达页18项中16通过，方向键切换及快速切换两个场景在简介aria-busy结束前超时；保持原断言和超时单独复核，2/2通过（72.5秒）。首次超时保留为未确认根因的运行失败，不声称已修复；最终CI仍须覆盖完整到达页文件。

### 资源许可随基线校正（2026-11-16）

Verify #8036在0dceaca09基线实测：资料脚本+96 B；到达/选择页中文冷+54 B、英文冷+63 B、热0；默认/全插件工作台中文冷+171 B/热+21 B、英文冷+197 B/热+38 B。中英文词包新地址已被现有entryApprovals正确识别。相较旧基线，到达/选择页各增加6 B，超出了本任务旧逐入口记录48/57，因此该作业失败；不是新增业务资源或规则失效。

用户已明确批准同一词包新地址和首屏冷加载最多261 B、热加载最多38 B。本次最大197/38仍在已有授权内，仅将本任务四个逐入口值校正为54/63，并将脚本166→96及工作台235/261→171/197收紧到实测值；保留原审批记录，不修改门禁脚本、共享基线、入口范围或生产代码。Full #1036因需更新最终提交主动取消，不计为通过；新最终头重新运行Verify和Full，结果由PR记录。

### Feed 消费用例的刷新交错（2026-11-16）

b5e52d390 的 [Verify #8037](https://github.com/molis-ai/molis-work/actions/runs/43856421963) 全部通过，实际资源最大冷增197 B/热增38 B。其 [Full #1037](https://github.com/molis-ai/molis-work/actions/runs/43856462891) 第14片在 `tests/product-interaction.e2e.test.ts:241-248` 两次等待旧按钮被替换超时，2片通过、45片取消，整轮失败。此Feed路径与此前Full #1035首次5/5通过时没有代码差异。

旧用例先注册来源再抓按钮。宿主notice可在两步之间刷新；`plugins/native/feed/src/browser/factory.ts:75` 对相同HTML保留节点，测试可能把已经正确更新的页面判失败。隔离Home中经现有DOM通知入口制造两次真实刷新：第一次替换写入前的按钮，第二次读回相同HTML，保留写后抓到的按钮，诊断1/1通过（54.3秒）。这证明观察顺序对合法交错不成立；并未完整复原首次CI的自动通知时序。本地原样及完整自动通知尝试有60秒总超时，缩小的自动通知场景有5秒等待超时，均不计验收通过。

仅调整测试：在写入前抓旧节点，另确认新增来源实际显示；原节点替换、保存中忙碌/禁用、单次提交、草稿、真实排程写入和失败恢复断言及60秒超时全部保留。生产代码、测试清单、重试和门禁不变。临时诊断已移出仓库。补正后本地完整消费者4/5通过，排程设置仍为60秒总超时（cancelled 1、断言失败0），不能判完整通过；独立受控交错1/1通过只证明观察顺序的漏洞。只读复核认可改动及证据边界，最终头CI须完成同一完整文件，结果统一见PR。

### Goal 表单保存状态的观察窗口（2026-11-16）

07029fc93 的 [Verify #8038](https://github.com/molis-ai/molis-work/actions/runs/43861032526) 首次全部通过，两组产品子集152文件、flaky 0；[Full #1038](https://github.com/molis-ai/molis-work/actions/runs/43861248358) 的Feed完整交互首次5/5通过、所在14片44文件通过，但第11片Goal表单两次失败，整轮10片通过、37片取消，未完成全量。

`tests/goal-form-viewport.e2e.test.ts:87-95` 用800ms网络延迟假设检查时仍在保存。生产 `plugins/native/goals/src/event-document-client.ts:338-350,442-445` 在实际响应完成后恢复控件。本地只延后1秒观察，实际已持久化1条、表单hidden=true、busy=null、文案恢复、请求次数2（一次拒绝加一次重试），原inert断言失败，证明旧测试依赖短暂时间窗口；不将该受控复现冒称首次CI全部时序。

测试改为一次性挂起本次重试的真实fetch响应，确认服务端已写入后观察进行中状态、触发重复submit，在finally释放原Response；继续检查原请求次数、内容和事件流水、重载后的唯一记录。所有原断言、60秒超时及生产行为保留，无假响应或额外重试。补正后完整两宽度2/2通过（1024×400为40.6秒、390×500为32.0秒），含真实保存/刷新与无重复写入。为一次列齐剩余失败，后续Full用现有integration入口指向PR同一SHA，不改workflow或验收标准、不合并集成分支；最终CI结果以PR为准。

### 本次检查点的未完成门禁

合入 Sessions 主干后的 `pnpm typecheck:tests` 输出4,108条诊断；按实际变更行定位的两处新诊断（ArtifactImportResult断言和ArtifactVersionRecord类型）已修正，尚未重跑。没有完成所有诊断的干净主干归因，不将其算通过，也不宣称其余全部是基线。`health:check` 对4a08c41c失败于两个本轮新增 giant：bindKnowledgeImport152行、AgentReviewQueue309行26方法。已分别提取文件选择/拖放输入适配与审查状态/选项投影，所有队列/决定/权限事实仍留原owner；不改阈值或新增例外。后续 `/tmp/quality-audit-git-editing-health.log` 已通过，giant总数50无新增，handler input casts248→240；导入队列8、审查侧栏2、companion生命周期14及原Git控件1项均已通过，其他本批用例仍在运行。日志 `/tmp/quality-audit-sessions-tests-typecheck.log`、`/tmp/quality-audit-sessions-health.log`。


第十四批最新定向结果（2026-11-16）：

- 平台 QEA-39 的4文件21项、Git Host QEA-40及原操作19项、客户端包2项保留有效结果。`git-final-paths.log` 的7个通过文件另包括真实 Coding交接1项、产品HTTP1项、writer整合7项、worktrees12项、英文回执4项、Git插件9项、porcelain8项。该轮编辑文件10/11失败不隐藏：新增输入目录恢复在“设为输出”后卡在空白禁用的读取状态，独立诊断重复确认，日志 `git-input-refusal-diagnose.log`。
- 根因是冲突读取错误地依赖摘要 generation。现改为原目录/文件/ticket/可见信号；解除冲突清引用并禁用编辑器，旧文件回答不能回填。最终 `/tmp/quality-audit-git-lifecycle-acceptance.log` 3文件27项全部通过：编辑恢复12项、独立/嵌入生命周期14项、原源码控制1项。新增受控实际 owner 回答验证同目录刷新保留、切文件不覆盖和合并解除不回填；真实输入目录拒绝不写磁盘，转输出后读取新版，用户再次核对并批准才实际写入。
- 同路径还修复本批引入的未完成操作关联：尚未派出或 owner 明确因输入目录拒绝时，不等待不存在的审查；实际缓存从1条残留复现到0条，编辑正文保留，其他未知结果继续等待原 owner。重载、审查拒绝/成功、保存/删除交错、读取失败重试和目录切换由上述真实路径覆盖，不新增后台重试。
- 完整构建通过；`/tmp/quality-audit-git-final-health2.log` 对 `4a08c41ca` 健康门禁通过，50个巨大单元仍为既有登记、翻译/语法/混用构建进程均0问题，未改阈值。版本生成检查通过，删除旧无调用格式的唯一版本项；先前未删源表项造成的生成/构建失败已按原版本流程纠正，没有修改生成脚本。
- 界面生成1440/1024/390与浅深色6张真实图，已查看1440浅色、1024深色和390深色：当前文件可读、按钮可用、无横向越界。但长正文位于窄目录栏的体验问题另列 QF-23，保留本轮实施，不以截图生成宣布该问题完成。截图目录 `.impeccable/qa/review/quality-audit-git/`。
- 用户少重写提交/冲突正文，交接失败不必重新生成；开发者从提交快照可追到原 operation_id、owner 实际结果和精确草稿清理。平台统一承担草稿顺序，Git不再维护旧serializer/截短兜底，Coding不再约定Git私有storage键。范围仍为原六方向全仓审查；PF-02 已写第十六批需求，未以本批工程通过结束任务。

## 第十六批进展：共享输入来源（重试交错补验中，必跑回归与最终 CI 待完成）

### QF-24 / P1：材料来源在框架入口断开，补充与等待没有完整消费

当前位置：`apps/workbench/src/browser/plugin-frame/composer-parent.ts:216,225,313`；`plugins/native/coding/src/browser/main/composer-mount.ts:126`；`plugins/native/coding/src/routes-sessions.ts:277,355`；`plugins/native/coding/src/materials.ts:45`。原父页与Coding都关来源，onMaterials会提前交全部引用、child可代按发送；Coding submit不读input.materials，steer合同不接材料，wait分支先创建Runtime Session/改标题/入队再保存材料选择。影响是用户重复进入私有材料选择，或看似选好却未给模型；仅翻sources开关还会越过本人发送边界。

处置已写：复用父页菜单、本人动作目录、现有材料owner读及Coding回执；引用只随本人底栏发送交回，含来源时拒child代发，框架直接来源/搜索HTTP仍403。正常开轮将本次引用与已保存选择按完整ref去重，不污染长期选择；补充三种模式共用owner读取与100000字符总上限，原话保留在原Runtime原件记录，读取失败不得写业务输入。wait入队前读取，真正开轮再读，标题允许平台来源合法1000字符。调用方同批采用现行schema；不另建材料账或读取兼容。

### QF-25 / P1：迟到回执只清正文，材料残留；失败序号可能指错选择

当前位置：`plugins/native/coding/src/browser/input-receipts.ts:133,148`、`browser/main/composer.ts:58`、`browser/main/mount-composer.ts:93`；平台 `packages/design-system/src/browser/composer-send.ts:32,76`。原重试身份未包含Run/材料，bubble确认后只清文本；混合选择的失败序号被当作长期数组序号。新增本次提交成功回调，owner真实Run或queued_inputs确认后由公共组件结算原快照，旧回调/旧HTTP回包不能结算新提交；显式重试签名包含目标/模式/文本/材料。失败按原提交引用映射回来源条或长期选择，删除直接清正文和恢复按钮自动代发；用户移除后由底栏正常发送。

本批真实验收还发现 detail 把已入队且无Run的会话写成idle（`routes-timeline.ts:187`），以及请求failed遮住仍在运行的模式/停止（`packages/plugin-sdk/src/ui/composer.ts:203,227`）。实现已改从原等待事实/独立running事实计算，实际 wait 排队与运行中失败模式切换均已通过；不增加业务状态字段。

已取得的局部证据：父页来源与安全回归20项通过（`/tmp/quality-audit-frame-source-acceptance1.log`）；公共composer原18项、Coding旧回执浏览器1项通过；后端固定版本/after-run、next-boundary、interrupt及拒绝的4项通过（`/tmp/quality-audit-composer-receipts-acceptance1.log`）。同日志新增测试中的菜单丢失、队列idle是产品发现，两个浏览器等待/选择器错误已修正测试；失败日志保留，不能记作全部通过。API快照两项、动作快照仅coding.runs.control@1输入变化。最终测试、资源预算、健康门禁与当前头CI仍待完成。

### QF-26 / P1：同一输入框重挂丢选择、断开提交与草稿身份

位置：`apps/workbench/src/browser/plugin-frame/composer-parent.ts` 的 options/make（原211行）每次 shape 变化新建 draft adapter；`packages/design-system/src/browser/composer-retained.ts:20` 以 adapter 对象为草稿身份。来源、附件或停止能力变化仍属于同一 child id，但材料和 revision 被分到另一份 retained 状态。旧结果与后来编辑不能再通过同一 revision 比较。

正常框架复现：仅等来源登记变化的首个测试曾通过，但尚未证明底栏实际重挂；增加旧 file input 已卸载的断言后，QEA-45 在原实现有效失败，原附件消失（`/tmp/quality-audit-frame-remount-baseline2.log`）。最小修复由 parent 保持当前 child id 的单个 draft adapter，shape 重画继续复用，真正 drop 才释放。第七次构建通过，实际重挂、旧 ack/普通回包和新文字/附件保留已随 frame 5/5通过（`/tmp/quality-audit-composer-receipts-acceptance3.log`），同批其他验收仍在继续。

材料验收纠偏：Coding 当前引用在开新轮时读最新内容是既有明确合同，更新 Todo 后拒绝的初始断言错误，已改为真实知识排除，补断言新轮确实取得更新正文。下一轮队列在活跃Run时按 RC-18/D31 不返回；诊断确认会话 GET 持续成功，未结算并非轮询停止。验收改为结束原轮再观察 owner 队列，不为测试改运行时合同或新增轮询。这些测试假设失败不计为产品缺陷。后端材料5/5、回执客户端8/8已通过；新浏览器混合选择恢复/响应丢失已在 required 日志3/3通过。

### QF-27 / P2：把本地控件当外部正文净化，恢复操作失去绑定

已复现位置：`plugins/native/coding/src/browser/main/composer.ts:91`；净化边界 `packages/plugin-sdk/src/browser.ts:259` 按明确的 inert 合同删除任意 data-coding 属性。真实材料先删除、再恢复健康长期选择、然后排除该长期材料，HTTP 正确返回 failed_materials；界面提示中可见按钮却没有绑定所需的属性，正常点击无路可走。诊断 `/tmp/quality-audit-material-recovery-diagnosis.log` 记录实际请求、失败与 DOM，不是只有静态字符串匹配。该材料恢复调用已改用本页公共 renderer 的逐字段转义输出；不放宽正文净化白名单，真实按钮与恶意格式标题回归已在 required 日志通过，未弱化净化边界。

六处本地renderer安装已迁移：`browser/main/configuration.ts`、`run-block.ts`、`browser/subagent-cards.ts`和`subagents.ts`。模型回复、报告、外部预览与diff正文仍沿原净化边界。环境卡的创建、更新、删除统一归`drawEnvironmentReadiness`，由当前末轮和目录事实推导；删除轮次模块重复匹配/安装，修复轮次先到导致重载后缺卡的隐式顺序依赖。按钮仍只准备草稿、切换明确意图或打开原面板，不代用户执行命令。

定向验收：`/tmp/quality-audit-coding-recovery-acceptance10.log` 两个真实浏览器场景通过。QEA-47覆盖新会话、结束轮次、切回/重载及三宽两主题的实际点击，保留草稿和真实Git冲突，无额外模型或命令。QEA-48由真实SDK派发两个子任务并耗尽额度，从主卡和侧栏分别扩额度；一次真实owner写入失败后预算不变且可重试，扩额度不自动执行；明确重试沿原模型及只读权限成功，原尝试历史和实际预算可重读，进度语义及外部正文净化保留。三宽两主题图已生成，1440浅色和390深色均实看；包必跑与最终门禁待完成。

排除项：SDK `continue`明确在同一子Session发起新尝试，不重绑已经归还的task-board步骤（当前`composition/core/runtime.d.ts:260–262`）；因此重试不再有board-read/report是现行合同，不按完整工具数组相等制造回归。原只读工具上限与冻结模型仍验证。原测试的模型配置、派发审批和活跃父轮次假设已纠正，不计产品缺陷。材料失败在卡片与底栏重复说明仍待同链收敛，控件恢复不代表QF-27全部体验问题关闭。

PF-02 新增正常入口证据：`/tmp/quality-audit-composer-required.log` 15文件全部通过，含 Coding 材料3项、安全17项、设计系统与HTML边界回归。Coding 的 `+` 只随当次发送交材料、原 `@` 仍选择工作区文件、下一轮不重复来源；混合长期/临时引用去重、真实 owner 删除/排除后准确移除且不自动重发；实际已受理响应被丢弃后，原轮结束、正常读取 owner 队列结算旧材料，保留后来输入，额外POST与模型调用均0。材料恢复的桌面浅色1440与手机深色390已实看，按钮可操作、无横向越界、HTML格式标题不成为元素。另记录本轮待收敛的重复提示：同次失败在材料卡和底栏重复说明，修复控件可用不代表该体验已简化。generic frame 的系统 `@` 入口与完整5项已通过（`/tmp/quality-audit-composer-frame-final.log`）；清理诊断后的 Coding3项中2项通过，混合材料项在创建会话的测试点击安装监听时耗尽30秒预算，尚未进入本项行为（`coding-materials-final.log`），保留记录并补跑三宽截图；完整包必跑、资源与最终头CI仍待完成。

### QF-28 / P1：重试遭拒不能证明上一次未知发送未受理

位置：`plugins/native/coding/src/browser/input-receipts.ts:109–133,149–151`；真实下游 `routes-sessions.ts:355` 先读取当前材料再交 `agent.inputs.send`，后者明确同 key 异文拒绝。当前材料变化可能使派生文本变化，撤回会在读取处拒绝；原客户端将这些明确拒绝直接清空 lost item，第三次点击便换新 key，已受理的原输入可能再排一条。读取失败只证明本次尝试未完成，不能推翻前次未知结果。

旧构建调用真实客户端工厂的 QEA-45 新用例有效失败：重试拒绝后 lost bubble 消失（期望1、实际undefined），原8项仍通过，日志 `/tmp/quality-audit-lost-retry-baseline.log`。最小修复保留相同意图原 key 与先前未知事实；首次拒绝照常恢复，成功或原 owner 可见后才结算，另给准确的重试提示。合入6359987103并构建后，实际 current 修改/排除→连续重试→原轮结束→一条队列及固定原件正文通过；同一文件5项237秒全部通过，见 `/tmp/quality-audit-main-635-acceptance.log`，其余组合验收继续进行。不新增材料正文缓存或键账；SDK虽有 knownInputKeys 查询，但它不能独自证明材料不同仍是同一请求，本项不为立即回执扩平台。

### QF-29 / P2：环境检查把读取失败投影成不存在或已就绪

已实现，定向验收通过；包必跑、主干整合与最终门禁待完成。原`plugins/native/coding/src/environment-prep.ts`的三段catch把Git、目录、工作树失败回退成空事实，`routes-sessions.ts`又把外层异常转null并缓存15秒。旧构建真实binary模板、超限package.json及损坏Git索引三项均误报ready（`/tmp/quality-audit-coding-environment-failure-baseline2.log`），无法告知用户环境是否真正读过。

处置：`environment-state.ts`统一后端与界面形状，失败仅有目录身份、检查时间和unavailable，不带伪造false/0/空数组；`environment-prep.ts`按实际公开outcome判断完整性，保留非Git、合法空目录和无HEAD语义，尾部取消/授权检查继续拒绝失效调用。`routes-sessions.ts:96`按原Promise身份删除失败缓存，不吞取消。`recovery-parts.ts`与`browser/main/click-round.ts`原位显示单个重新检查入口，复用正常state读取，不改变草稿或发送任务。不新增检查任务、权限、表或宿主专路。

验证：完整构建通过，API生成0差异；QEA-54三种真实读取失败及修复后立即恢复3/3通过（`/tmp/quality-audit-coding-environment-failure-acceptance.log`）；QEA-55实际Git/文件/工作树动作拒绝、截断目录、合法空/默认未创建/无HEAD目录及服务端已观察的HTTP取消5/5通过（`coding-environment-boundaries2.log`）。隔离Home正常新会话和已结束轮次、失败重试、修复恢复、草稿/模型调用不变及三宽两主题真实点击1/1通过（`coding-environment-failure-ui.log`）。未创建默认目录的首次夹具缺少正常Host的prepareDirectory端口，补齐夹具后通过，生产未加例外。只读复核无Blocker/P1；补测确认coding.state按项目串行；按真实队列验证失败后下次读取恢复并复用成功结果，边界最终6/6通过（`coding-environment-boundaries4.log`）。最初强制超越读取的测试超时属错误调度假设，未改生产调度或放宽原断言。当前health通过（`coding-environment-final-health.log`）；最终回归与资源批准仍需完成。

### QF-30 / P1：助理候选卡的决定未接 HTTP 断连控制

正常入口 `apps/workbench/src/scripts/client/assistant-island.ts:228` → `apps/local-host/src/assistant/assistant-http.ts:503` → `settleMemoryCandidate:599` → Memory公开动作。该分支提前返回，未走原有panelWrite取消控制；bindLocalWebActions没有signal，通用JSON body读取结束后的断连不传到写入。权限撤销检查仍在，但不能替代传输取消。旧构建 QEA-49 接受/拒绝两项均有效失败：实际服务端断连后接受仍产生正式记忆、accepted 变动与候选版本2；拒绝仍写 discarded 与版本2。日志 `/tmp/quality-audit-memory-candidate-baseline.log`（测试初名 assistant-memory-candidate-cancellation，现按同一安全测试入口命名 security-invariants-assistant-memory-candidates）。

最小修复已验收：在这一入口复用现有 responseAbortSignal，把同一signal交公共绑定与原Memory提交检查；不另建取消状态或写后回滚。接受/拒绝在提交前断连时candidate与正式版本/ledger均不新增，随后新请求正常恢复，并等待正常响应 close 后确认不会误取消。QEA-49 两项通过，连同原助理输入/记忆、Memory动作、local-web-actions与框架回归8文件96项全部通过（6.5分钟，`/tmp/quality-audit-memory-candidate-acceptance.log`）。完整构建 `/tmp/quality-audit-memory-candidate-build.log` 与健康门禁 `/tmp/quality-audit-health-boundary-split.log` 均退出0；门禁未改阈值或新增例外。当前头Full CI与页面资源验收仍待执行；本片通过不关闭QF-31或整体审查。

### QF-31 / P2：助理把候选读取故障显示成没有待处理事项

原 `apps/local-host/src/assistant/assistant-memory-bridge.ts:65` 将异常转成[]，`assistant-service.ts:181` 据此省略候选分区，页面无从区分空集合与暂时读不到。旧构建正常入口故障用例有效失败（期望null、实际undefined，`/tmp/quality-audit-memory-read-baseline.log`）。已让桥保留错误，聚合只将该分区投影为null，正常空继续省略；工作台显示原位重试、移除旧决定按钮，不把整个work伪造成失败。独立候选HTTP未知错误映射为固定通用说明，合法业务拒绝保留；原始诊断只经repeatingFailure记录无正文的错误类型/码及work_id，不暴露给用户。

`/tmp/quality-audit-memory-read-final.log` 中 QEA-50 已通过真实UI故障、失败重试、恢复候选、接受后Memory公开管理读回一个正式版本1/一条accepted变动、再次故障后恢复为空，草稿保留；六张三宽两主题图已生成，复核1440浅色与390深色。最初实操因把并发日志误定为固定两段而失败，测试已改为等待在途真实成功读取后检查稳定失败期不继续增长。该批6/7文件通过，唯一未通过是主脚本773行超过原770行限制；现按原片段装配方式把待处理分区整体归既有 assistant-side-path.ts 侧栏片段，主脚本降至739行；保留可静态展开的原装配和结构断言，阈值与门禁不改。最终侧栏归并构建退出0（/tmp/quality-audit-memory-sidepath-build.log），3文件23项复验全部通过（/tmp/quality-audit-memory-sidepath-acceptance.log），健康门禁退出0（/tmp/quality-audit-memory-sidepath-health.log）。三宽两主题图均生成，另已实看1024浅色：提示与单一重试完整可见、草稿未丢。中间新增独立片段因静态展开器不认识而使健康检查失败；最终复用已有侧栏片段，未改门禁映射、阈值或例外。公开API快照已更新，当前Full CI与资源审批仍待执行。

同链清理核对：原 `apps/local-host/src/memory/memory-host.ts:419,421` 两条相同GET pairs分支，后一条不可达；原 `assistant-memory-bridge.ts:73,79` 的accept/discard方法只有 `tests/assistant-memory.test.ts:328,332,339` 调用，正常卡片已迁Memory公开动作。QEA-53现已将原本人改写认可/拒绝后不重复建议测试迁到真实注册Memory动作并携带所见版本，删除两个旧桥方法和第二条不可达GET，业务断言保留。64df918968保存清理结果，构建与6文件44项通过（/tmp/quality-audit-memory-legacy-cleanup-build.log、/tmp/quality-audit-memory-legacy-cleanup-acceptance.log）。提交后健康检查发现新安全登记未按规定格式标测试标题，已修正引文格式；最终门禁退出0（/tmp/quality-audit-memory-legacy-cleanup-health2.log），不改门禁规则。

### PF-07 来源链复核与退役边界（只读结论，未实施）

补核 `source-pull-service.ts` → Host `plugin-source-pull-service.ts` / `source-pull-intent.ts` / `source-pull-runtime.ts` → RSS/YouTube 规则与 Search Runtime → Feed `runtime-source-pull.ts` / `source-sync.ts`。Feed 拥有来源/游标/重试及提交前配置复核，平台拥有实例身份、授权与取消、正文 hold 后写入和证据清理；RSS 的 DNS/固定地址、跨主机跳转限制、ETag/304 是实际网络边界，不能因精简重复逻辑删除。presentation 已有 IntegrationRegistry，不另建平台目录。

报告此前把 Alchemist 列作 sourcePull 消费者不准确，现已纠正：`apps/local-host/src/alchemist-service-host.ts:72` → `alchemist-search.ts:20` → 共享 Search Runtime；市场脉搏由 `plugins/native/alchemist/src/studio/server/bootstrap/local-runtime.ts:140` 装配来源。Alchemist 保留自己的作业 lease/checkpoint，和 Feed 来源游标不是同一事实。复核未确认新的P1，也没有证据支持为退役工厂统一两套业务状态。

可退役对象：WebQuery 整包没有生产依赖入边；YouTube 保留包根 channel 工具及原包名，移除无调用的工厂与安装 Manifest。两包虽 private:true，旧工厂是 package exports 的包根导出，不能称为文件私有函数。YouTube 的真实 Host 调用在 source-vocabulary/source-pull-intent/source-pull-runtime，运行时依赖经 `apps/local-host/src/installer/npm-package.ts:29` 打入产物；移除 Manifest 必须同时调整 package.files，验实际产物仍能导入 channel。WebQuery 不在当前运行时依赖产物链。保留现行 Source 的 youtube_channel/web_query 数据和 SourcePullRequest，无需迁移用户来源。

实施前置已核实：`scripts/check-package-boundaries.mjs:247–274` 硬编码五个旧集成包的 Manifest/包文件/入口身份，退役需要精确移除这两个退役对象的检查，不能改成文件缺失就跳过。仓库要求门禁修改先获用户批准；先准备具体退役差异、包清单/锁文件/六个专属版本声明及生成物同步，再提交该规则调整供审阅。共享 schema/host/listener/signals 版本与仍使用的集成检查保留。BL-unused-integration-packages 此时仍未完成。

另有独立重复实现：Feed `source-request.ts:74` 生成的 intent 只用于本地指纹，`runtime-source-pull.ts:40` 的实际 pull 忽略它，Host 又生成一份；平台已有 sourcePull.plan。后续迁移实际消费者时，必须比较原 operation/key 指纹、终态重放及取消/引用回收，不能直接删掉本地检查。候选验收沿 Runtime Feed 的 YouTube 注册→实际拉取→同key重放、integration-registry/source-pull拒绝、RSS socket、AnySearch single owner及真实npm产物；目前只有静态证据，未宣称这些路径已验收。


### QF-32 / P1：仅有读取权限的候选查询会结算过期状态，期限也未使用原件事实

旧位置 `horizontal/memory/src/service.ts:659–673` 的 candidates query 按账注 created_at+14天调用 settleCandidate，写 SDK expired/version、操作marker和候选账注；`memory.candidates.list@1` 只有memory:read，Assistant聚合/独立列表和设置overview均到达该服务。SDK的manage-read不改候选state，因此分支真实可达；Assistant原服务有Host存活检查，问题不能误写成完全无控制。候选创建已保存min(正式期限,14天)，但查询忽略更短实际期限；到期pending还占提议去重和每工作三条额度。

旧构建4个有效反例均失败、原13项通过（`/tmp/quality-audit-candidate-expiry-baseline2.log`）：1天到期、精确14天仍显示；15天查询实际增加SDK版本及expired状态、operation和账注；未先打开列表时，过期同文仍拒绝新提议。第一轮反例只测精确期限，尚未到读中写分支；第二轮独立增加15天快照，才证明了实际副作用。

处置：SDK拥有期限/状态/版本；Memory query和propose复用实际期限判断，读取无写。`horizontal/memory/src/candidates.ts` 收回原件合读、条件结算和维护恢复，Service公共用例调用同一实现，主文件1269→1241行。原upkeep先处理候选独存及使用关闭的范围；固定候选expiry子操作，SDK先保留决定但终态未写时续原决定，已expired但账注仍pending时只补原投影。无新定时器、状态账或正式记忆变动计数。

角色候选独存没有正式owner，原upkeep只枚举正式owners，SDK本人管理也拒绝。现在维护合并原candidateOwners，Host仅为当前项目的本人management、candidate manage-read/delete认可该归属，target/before分别复核，不扩大正式记忆、accept/promote或模型读取。初次定向验收18/19通过，角色项揭示遗漏before围栏；修正后真实SDK的范围拒绝、读取纯度、额度释放、SDK保留决定后的实际SQLite写失败重启恢复及账注失败重启恢复，2文件42项均通过（`/tmp/quality-audit-candidate-expiry-acceptance2.log`）。完整构建2次退出0；正常HTTP/公开只读动作、实际服务器断连、维护取消/撤权后零追加写入及恢复，连同README必跑集合19文件209项全部通过（3分钟，`/tmp/quality-audit-candidate-expiry-required.log`）。两批合计21文件251项；健康检查初次仅要求登记缩小后的巨大单元实际尺寸，随后同步class 1110行/54方法→1081行/52方法、file 1270→1242，规则/阈值未改，第二次退出0（`/tmp/quality-audit-candidate-expiry-health2.log`）。本片已获本地工程及实际HTTP验收证据；当前头Full CI/跨批资源验收和整项逐包深查仍未完成。

本片不关闭角色候选的完整本人管理：没有正式owner时accept仍按原权限拒绝，已用反例保留该边界，如何接通完整认可归属另需沿真实角色入口确认。后台已开始的定时维护按原调度合同不可取消；这里验证的是受控手动维护，不新增调度承诺。

### QF-33 / P1 已修复、本地验收通过：配对查询替用户写入已处理决定，且忽略正式期限

位置：`horizontal/memory/src/service.ts:1092–1103`。公开`memory.pairs.list@1`只有读取权限，原pairs在一方缺失或非active时直接savePair(resolved)；重新启用后原冲突已永久隐藏，召回不再按pending冲突避让。正常HTTP写入两份真实SDK记忆→原upkeep形成配对→公开管理停用→只有memory:read的query，实际ledger由pending变resolved，反例有效失败（`/tmp/quality-audit-memory-pair-baseline2.log`）。首次测试从错误包根导入内部Host测试端口未启动，不算产品缺陷。

处置：查询只根据当前可读正式事实投影，不写配对。明确resolvePair拥有本人决定，已有Storage遗忘清理拥有删除后的配对回收（`memory-ledger-retention.ts:64–65`），不增加维护状态或任务。停用/启用/明确保留两条的召回效果、真实SDK读取故障和取消、成功删除清理两项已通过（`memory-management-acceptance.log`）。追加正式到期反例又证实meta仍active时，普通列表已投影disabled但pairs仍提供操作（`memory-pair-expiry-baseline.log`）；已复用现有isExpired按正式期限过滤，正常HTTP维护形成配对后的3项通过，原分页合同6项通过（`/tmp/quality-audit-memory-pair-final.log`）。分页管理页有意保留原始active并单独返回expired，设置界面按expired显示/续期；早期测试把普通list的disabled投影误套到分页，已按现行MEM-15合同修正，没有改生产分页语义。每对重复owner读取属于可优化成本，未为一行正确性修复新增跨请求缓存。

### QF-34 / P1 已修复、本地验收通过：文档保留的旧Memory写入口丢版本且未接本次取消

`apps/local-host/src/assistant/assistant-http.ts:490–499` 的memories/memory-prefs仍可达，`docs/system/CALL-CHAINS.md:291`和归档memory-system规格明确保留。现行设置已用`/api/memory/*`，模型工具另走受控memoryInvocation；未找到当前生产UI/插件/后台对旧HTTP的调用，但不能据此删公共端点。GET在mixed-input-originals仍有真实调用；旧POST的error-model测试只覆盖缺失对象和非法动作。

旧memories POST丢弃输入expected_version，Bridge.changeMemory直调service且无本次HTTP signal；GET的AssistantMemory投影也不带version。这和已修候选卡不是同一写分支，Host存活及SDK范围围栏仍存在。先用真实v1→v2和旧版本POST复现忽略确认，再暂停真实SDK提交、HTTP断连、放行核写入。保留路径的方向是GET给真实版本、POST经公共Memory动作保留原版本及信号；不得服务现读版本代替本人确认。未经动态验收不记完成。

旧memory-prefs有独立产品语义：MemoryPreferences.saveAssistantPrefs原子更新personal与project-default，现公共savePrefs写personal或具体project，不能用两次现动作冒充等价迁移。保留原主人的原子写入并核实际默认/覆写效果；不因“转发”命名删除有职责的协调，不新增第二份偏好事实。

QF-34真实反例：`/tmp/quality-audit-memory-management-baseline.log`七项均有效失败。正常保存v1→公开动作更新v2后，旧POST更新/停用/启用/删除全部返回200；GET无version。实际SDK更新等待及删除目标读取等待期间，服务端已观察HTTP断连后仍更新版本/流水或接受遗忘并删除。测试未伪造成功回执或生产结果；当前版本恢复、项目隔离与旧偏好默认/覆写已纳入后续验收。

主干4aa5496e3f已由b45f75bba1合入，完整构建通过。Coding README全部41文件加11个新增/共享消费者合计52文件全部通过（8.3分钟，`/tmp/quality-audit-coding-main-required.log`）。补强的原Session新Run/历史次数、原权限和冻结模型断言亦通过；环境失败390深色截图重取后已实看，提示和重试完整可见。此结果只关闭Coding该批包回归，不替代当前头Full CI/资源许可或整项逐包深查。

QF-34实现与证据：旧POST已迁memory.change并传原项目/版本/取消，GET投影正式version；删除Bridge.changeMemory及重复校验，原启停和失败后开轮用例迁真实注册动作。构建通过，API仅AssistantMemory增加version一项。最终定向9/9通过（`/tmp/quality-audit-memory-management-acceptance2.log`），项目隔离和偏好覆写保留；首次8/9中enable对已启用条目不会增加SDK版本，改用真实已停用v2验证重新启用，未改生产幂等语义。健康门禁通过（`/tmp/quality-audit-memory-management-health2.log`）；Host/Memory/合同必跑与相关消费者103文件全部通过：6文件定向证据加其余97文件（17.1分钟，`/tmp/quality-audit-memory-required.log`），未重复已有效通过的6文件；最终Full CI待完成。

### QF-35 / P1 已修复、本地验收通过：工作流迟到预览可能把A的内容交给B

`plugins/native/workflows/src/browser/handoff.ts:99–124`在等待preview/continue后不核导航身份；`click.ts:28–44`可打开另一实例，`nav.ts:88`只在打开成功时清handoff、不清旧busy。A回执把A正文放到共享handoff，后续表单经`root-events.ts:103`使用当前B实例；错误分支还重新打开旧实例。影响可能是目标内容错配，必须验证真实目标与handoff，不只断言标题。最小方向是原导航/实例/步骤约束所有迟到效果，沿已有navId实现，不改变owner写入合同。

### QF-36 / P1 已修复、本地验收通过：人工交接失败重载没有恢复冻结提交

`actions.ts:211–217`的preview重新读取源正文，`browser/handoff.ts:107`用input初始化；owner已有pending.output时`continuation.ts:40–42`正确拒绝不同正文。原人工改写后接收失败，重载再预览会进入内容冲突循环。preview本身读取当前源的合同正确，错误在于页面把它用于恢复已经接受的固定提交。恢复应来自当前owner的pending原提交，保留固定交接身份和幂等接收，不能删除pending或替换已发内容解锁。

### QF-37 / P1 已修复，定向通过：人工确认过程丢掉明确重试意图

`browser/click.ts:87`传retry:true，`handoff.ts:103–111`却只打开人工预览后返回；`root-events.ts:103`再提交未带该意图，最终`step-runner.ts:134–135`按结果未知拒绝。后端拒绝与显式重试合同应保留，修复页面意图随原实例、步骤、固定提交到达retry_action。验证真实首次已执行后报错及本人再次执行的目标次数。

### QF-38 / P2 已修复，定向通过：判断拦下仍提示交接成功

`browser/handoff.ts:115–119`无条件选下一站并提示交接/动作完成，实际continuation可以返回stopped且目标未执行。现有判断浏览器测试先从后台生成终态再打开，未覆盖这次点击的反馈。按返回实例当前步骤、handoff和停止事实反馈，验证零目标调用和无成功提示。上述四项已由下段正常入口反例确认，最终处置及验收见本节末。

Workflows动态证据：`/tmp/quality-audit-workflows-handoff-baseline2.log`中，B的实际handoff正文为A正文；迟到成功与真实CAS拒绝均把页面恢复为A；Pages真实接收已落一份文档、回答失败后重载，人工表单重新变为旧源正文；判断真实stopped且Pages零写，页面选中下一站。目录离开控制项通过。明确动作重试首次真实Shelf写入后丢回执，点击重试只完成preview却不出现表单/继续，实际请求完成断言进一步确认：仅preview已返回，目标次数仍为1，未派出带retry_action的continue（`/tmp/quality-audit-workflows-retry-baseline.log`）。第一轮6项夹具失败不作为产品证据。

Workflows首轮处置：`browser/nav.ts:setMode`清理离开页的临时等待/草稿；`handoff.ts:resumeRun`用原navId/实例约束预览、继续、重读、焦点和反馈，busy按原对象身份清理，切步骤使旧请求失效；继续失败读回真实owner，无pending才保留未受理草稿。pending直接展示原output并继续，无需重新改写/确认，明确retry_action到达原动作；成功提示以真实handoff、选中步骤以current为准。首轮8/9与null断言修正单项合计9项通过，18图已收集并实看代表状态；最终B在途交错、包回归、健康/资源及Full CI继续。AI型pending的模型可用性前置是相邻未验证变体，仍在本轮检查范围。

Workflows第二十五批本地验收：最终构建和健康门禁通过，README要求的23文件（含6个浏览器文件）全部通过，6.2分钟（`/tmp/quality-audit-workflows-handoff-required.log`）。补强的B仍等待时A的finally到达不解除B等待；18图已更新，去掉重复外框后的390深色待交接已复看。

QF-36扩展：`browser/state.ts:readyState`仍把原模型可用性当作已有pending的恢复条件。真实SDK已生成、Pages已写、原模型经设置HTTP停用后，继续按钮消失，反例有效失败（`workflows-pending-model-baseline2.log`）。当前站点检查保留，只有已经完成的准备条件按owner.pending跳过；真实交付进度不冒充重新生成。修复已构建，目标去重/原交接键/无新增模型请求及新实例仍需模型的验收在进行。

Workflows最终本地验收（2026-11-17）：最终构建通过；QEA-64真实SDK/配置/Pages恢复1文件通过（`/tmp/quality-audit-workflows-pending-model-acceptance.log`），随后同构建README必跑及交错23文件全部通过（6.2分钟，`/tmp/quality-audit-workflows-final-required.log`），共24文件。最终健康门禁通过（`/tmp/quality-audit-workflows-pending-model-health.log`）。18张三宽两主题图已刷新，root复看最新390深色pending：固定正文及继续按钮完整可见，没有重复准备说明。原目标仅一份、原交接键不变、模型请求不增加，新实例仍需模型。用户少重做一次人工预览/改写，后台继续由原owner决定幂等与未知结果；页面不再跨实例拥有迟到结果。当前头Full CI和整项逐包深查仍未完成。

QF-27反馈收敛（第二十七批）：旧构建新增正常入口断言有效复现重复retry（`material-feedback-baseline.log`）。SDK ComposerOutcome.failed以可选feedback:page明确已有恢复UI的归属，统一输入与框桥保留失败草稿/材料，普通错误和unknown保持；Coding只对当前会话已完整解释的材料失败采用。首版3文件30项、构建与健康通过，只读review无本片Blocker/P1。实看390深色后进一步删除材料卡内重复名称/原因长段及两语言失用词条，最终构建通过，130文件包回归进行中；新增同时失败场景在再次打开来源菜单的准备步骤超时，尚未到本次失败处理，待单独诊断，不能把首版通过当作最终全过。Skill固定答卷回放与隔离Home替身smoke3/3通过，不作为真实模型质量结论。

PF-07退役准备：已核真实注册builtin-integrations仅消费GitHub/Gmail/RSS工厂及Catalog，YouTube频道工具仍进入Host/npm产物。独立只读复核无阻塞退役的运行时P1；用户2026-11-17批准spec§28两处门禁改动，待当前回归完成后实施。另补实际采用证据：FeedSourceService的生产createRuntime仅见`plugins/native/feed/src/plugin.ts:129`，旧底层Host runtime注入仅存tests/fixtures/feed-assembly；Feed本地构造完整搜索intent再由Runtime忽略，平台sourcePull.plan/pull重建同一intent。后续迁移应让平台独有计划/指纹、取消/hold与受控读取，Feed继续拥有来源配置/游标/幂等run和写入，不移除真实网络/权限边界。该采用收敛尚未实施，工厂退役不等于PF-07全部完成。

第二十七批最终本地验收：构建、健康门禁通过；130文件运行129通过，唯一失败在新增混合失败场景的来源菜单准备步骤。补等待当前输入框/加号可操作后，最终整文件6/6通过，真实失败/草稿/删除恢复/模型次数断言保持。日志：`/tmp/quality-audit-material-feedback-required.log`、`material-feedback-final-ui.log`；另两份普通composer与框架证据有效，合计132文件有通过证据，不改写首轮失败。12张截图已生成，root实看390深色与1440浅色混合失败。共享合同仅新增可选反馈归属，不改变受理身份或未知结果；用户少看重复错误/重试，卡内亦不再重复各材料名称/原因。最终Full CI及新内容地址资源核准仍待完成。

PF-07工厂退役本地完成（2026-11-17）：按用户批准的边界删除WebQuery六文件及YouTube工厂/安装Manifest，保留频道工具原包名和真实Host/npm入边。唯一包登记同步为73包；删六个专用版本键、十六个carrier和两条失用签名例外，锁只删对应12行依赖。生成器与离线冻结安装通过；离线重算锁曾额外裁剪无关可选平台依赖，已保留原依赖解析，仅采用本批importer差异，再由frozen-lockfile验证。

构建通过；`retired-integrations-gates.log`129项通过，明确验证三个活跃集成缺Manifest及未声明安装文件均拒绝。`retired-integrations-required.log`12/12文件通过，含Runtime Feed实际YouTube频道登记/Atom拉取/正文留存/同键重放零追加抓取和写入，以及真实npm压缩包解压后通过原包名导入频道工具。公网响应为注入，不宣称真实公网/账号验收。健康门禁首次因未暂存删除、git文件清单仍包含旧Manifest失败；仅暂存删除后复验通过（`retired-integrations-health2.log`），没有第三处门禁变更。该清理让开发者少维护两套未接入安装生命周期、版本和签名；现有用户来源与数据不需操作或迁移。BL-unused-integration-packages实现可结清，最终头CI仍待；PF-07的Feed/Host计划重复另行推进，不随工厂退役关闭。

QF-39/QF-40动态确认：`/tmp/quality-audit-pages-ownership-baseline2.log`三项有效失败。真实发布409→正常GET恢复→本人改标题，另一写入者正文实际被原正文覆盖（有/无等待中输入均发生）；正常全局搜索选择B→真实GET等待期间编辑A→实际CAS保存拒绝，页面已切到B，A草稿不可见。没有伪造业务回执；第三项QF-41翻译另存仍待动态复现。

### QF-39 / P1：发布失败读回不能把旧正文配上新版本

位置：plugins/native/pages/src/browser/document.ts:170（publishPage）及editor.ts:adoptSaved/remember。正常发布等待期间另一窗口写入，真实409后catch把任意GET当成保存回执，只推进版本、不展示对应正文；本人下一次改标题实际覆盖另一窗口正文。pages-ownership-baseline2.log有/无后来输入两种实际SQLite反例。处置已实施：保存回执仍按本次draft采纳，恢复读取仅更新列表；当前原编辑代次且无后来输入才完整重画owner文稿，否则保留本人草稿和原版本。成本低，沿原CAS/owner事实，不加合并缓存或自动重试。QEA-69两种冲突及实际发布提交丢回执均通过。

### QF-40 / P1：目标读取期间的新输入必须先保存，再切换

位置：plugins/native/pages/src/browser/document.ts:206（select-item）、editor.ts:fillEditor、click.ts返回分支。原先GET前保存、GET后先切页，再异步补存A，实际拒绝后A草稿已不可见。现切换前再次等待当前草稿保存，每个等待后核原selectionSeq；返回/明确新选择先撤销旧导航资格。fillEditor不再承担离开文稿的后台补写，打开入口拥有保存与导航顺序。成本低；本人不必找回或重写刚才输入，失败留在原稿。QEA-70正常全局搜索、真实版本拒绝、成功保存、后续选择及返回交错已通过；明确重选补验随包回归。

### QF-41 / P1：翻译另存要保留候选与同一次创建身份

位置：plugins/native/pages/src/editor-ai.ts:39、browser/editor.ts的onCreateFromAi、browser/document.ts:132、editor-popup.ts:26。原候选调用void回调即关闭，真实SQL拒绝和提交成功丢回执均丢掉本人修改。处置：等待创建结果，进行中防重复点击；未知结果保留冻结正文/request_id，本人明确重试不再生成模型；明确未受理的输入错误可编辑后重试。创建POST成功与随后列表/原稿保存失败分开，后者不能释放创建身份；取消在每次导航等待后复核，不抢回页面。两条附加反例已复现旧候选取消后仍打开、同一次翻译生成第三篇文稿（pages-create-navigation-baseline.log），修复后通过。popup复用SDK placeOverlay在resize重新定位，监听随原transient释放，修复390宽重试按钮落在屏幕外。

规则与状态归Pages：候选面板拥有一次提交及导航意愿，owner拥有实际文稿与请求去重，框架不接管业务重试。成本中低，无数据库/动作合同变化。QEA-71覆盖真实拒绝、未知写入、后续4xx不误解锁、明确首次拒绝可编辑、取消/新候选、创建后导航失败、重试后保留其他写入者修改；13条Pages交错验收通过。模型正文是注入的本机回答，实际Host/Editor/SQLite路径运行，不宣称云端模型质量。6张三宽两主题截图已实看390深色和1440浅色，重试与取消均可见。用户少重跑模型、少重写候选、少清理重复文稿。

### QF-42 / P2：对象打开有两个执行者，平台会重新打开用户刚离开的对象

位置：apps/workbench/src/browser/plugin-frame/view.ts:9–34；公开说明packages/contracts/src/platform/dom-events.ts的select-item。frame先通知插件、又观察列表代点目标行；Pages读B/等A保存时本人返回，loadList出现B后平台再次clickB（pages-return-diagnosis.log明确记录实际click）。不是页面随机抖动或测试坐标问题。平台投递意图、插件执行自身保存/读取/导航，应有明确接管合同。

已补现有DOM事件的cancelable/preventDefault语义：完整处理方同步接管，框架不再代点；未接管的行驱动页继续原能力。14个迁移方：Pages、Risk、Issues、Alchemist、Shelf、灵光、Coding、Feed条目、Workflows、Todo（含batch）、Jelly、Schedule、Inbox、创作台installed open分支。各自只在原来能完整处理的分支接管，Goals仅创建对话框监听不迁。成本中，涉及公开文档/API与消费者回归；不用插件名称特判，也不新增跨框确认消息或第二套选择状态。PPT真实openRecord仍代点准确一行；Schedule真实openItem接管且零代点，原有/open标已读恰好一次。

Host侧tab-workspace-plugins.ts的jumpToRecord另有Feed来源、Characters/Sessions实际消费者，不等同当前frame分支，本批保留其职责；不据相似代码删除。既有真实消费者验收选用Risk直达、Shelf全局搜索/链接、Todo来源链、灵光直达编辑、签名插件Home对象、Coding对象标签、Feed条目标签、Workflows搜索/标签、Jelly跨插件打开等。当前279文件包要求/消费者集合的276文件正在回归，3文件同构建已有通过证据；尚不能写成全量通过或将14方均称正常搜索验收。Skill固定回放及隔离Home替身smoke通过，后者只证明接线。最终头Full CI与资源核准仍待完成。

BL复核补正：BL-record-gone-from-framed-plugins仍不能清理。当前context-child.ts:19和context.ts:62已转发的是item-unreadable（让助理不再把不可读对象当上下文）；tab-workspace.ts:141监听的record-gone（标签标已不在及退出入口）是另一份公开合同，框桥确实尚无对应通道。仓内唯一发送方仍是Goals document-client.ts:48；Pages等仅报item-unreadable。已有side-pane-workspace的窗格页转发与S-30拒绝测试证明的是同源工作台窗格，不等同不透明源插件框。原BL关于没有框内采用者的时点说明已过时，但缺口本身仍在；需要按框的可信身份报告，并从真实对象404验证，不可把403/网络故障一律标为删除。本次尚未动态验收，不标已修复。

QEA-72追加消费者：Issues与Alchemist分别通过真实Host创建→正常openPlugin/openItem链接→不透明frame→准确标题/原对象读回，均同步接管且零行代点，打开没有重建或改写对象（selection-direct-consumers.log两项通过）。这补足原有用例只覆盖失效对象/直接派发事件的不足，不冒充两者已覆盖真实全局搜索。

### QF-43 / P2：首次引导的两次启动绘制替换正在操作的欢迎区（已实施、定向通过）

正常首次进入→新journey创建/保存（`apps/workbench/src/scripts/context-onboarding.ts:601-607`）→材料恢复→启动最终绘制（`:779-785`）。restart内置render与调用方render共同维护展示顺序，快速进入语言问题后，晚到的第二次绘制替换cx-app内的欢迎区，影响焦点与连续操作。三次有目的验证定位到startup绘制栈；语言替换服务不承担该重绘。处置依据是事实由准备流程维护、可操作页面由入口完整准备后展示；删除restart的内置绘制，由两个真实调用方现有收尾负责。成本低；QEA-75/76待实施与验收，基线独立运行未完成。

### QF-44 / P1：来源已暂停后，等待中的Home持有回执仍放行正文写入（已实施、定向通过）

`plugins/native/feed/src/source-sync.ts:76-83`先登记run引用、await Home ledger，却未在等待后复查Feed来源；`apps/local-host/src/plugin-source-pull-service.ts:61-63`随后写正文，平台检查的调用身份仍有效。真实Runtime同步→Home真实写账后持有回执→正常Feed enabled动作暂停→放行：最终sync拒绝、Item与完成流水为0，但正文从不存在变为存在（`/tmp/quality-audit-feed-hold-baseline.log`）。处置：Feed在hold返回前复查原guard，平台继续负责调用身份，保留已登记引用用于恢复/清理。与PF-07合同迁移同批修复，不给平台添加Feed特判；QEA-74覆盖恢复与实际正文状态。

### QF-45 / P2：过期材料重新开始失败后，没有错误且按钮无法再按（已实施、定向通过）

`apps/workbench/src/scripts/context-onboarding.ts:745-747`手动禁用按钮，finally只render；`:403-409`缓存HTML相同就跳过绘制，无法恢复手动修改的disabled。`:385`的reselect视图未显示本次error。正常按钮→真实SQLite拒绝→HTTP400后，busy=false、按钮仍禁用、当前错误缺席；用户必须刷新才能再试。正常创建对照通过。拟将临时禁用在原finally配对恢复，再由视图决定最终状态，并以现有errorLine展示失败。属于页面行为与绘制缓存的职责问题，不新增持久状态/重试器。QEA-76最终验收待完成。

### QF-46 / P2：Git前一个文件的迟到审查回执隐藏后来文件的操作（已实施，本地验收通过）

`plugins/native/git/src/browser/diff.ts:74-93`的prepareIndex只核工作区generation；返回/切文件只改变ticket，旧回执仍写共享action.hidden和diffNotice。正常独立Git与Coding嵌入入口：文件A发起暂存审查→持有真实成功回执→返回列表→打开B→释放A，B标题仍正确但暂存按钮被隐藏（`/tmp/quality-audit-git-result-owner-baseline2.log`，两个消费者均复现）。没有批准、index未变。处置：展示反馈绑定原结果选择；后台审查事实仍保留，明确打开原结果可查看。随QF-23统一Git主结果区域归属和迟到读写验收，不在Host按插件特判。成本中，QEA-78已实施；最终冻结头11文件109项通过，当前头CI另验。

PF-05再次核对：`packages/contracts/src/platform/settings.ts:58`仍明确无仓内设置声明owner，SDK `sandbox-agent-declarations.ts:51`仍拒绝签名包的未接通设置。`BL-settings-sandbox-execution`记录的是尚缺安装私有库内同步owner事务/持久回执，路线书38-1负责现有配置采用，44-6负责公共设置呈现；它们不是重复或已完成BL，不能因为合同/SDK单测存在而清理。需要先选真实owner设置迁移、保留同事务CAS/回执/回读与撤权，再核签包执行，未用本轮审查替代该产品实现。


### 第三十一/三十二批结果：Feed 合同归属与引导恢复

`plugins/native/feed/src/source-sync.ts:31` 直接取得平台 plan 的指纹，等待后核原来源，再按原运行键决定重放/执行；`:80` 在run命名和Home hold之后复核来源，阻止暂停、改配置、删除、取消或撤权后正文迟到写入（QF-44 / P1）。来源配置与运行/CAS归Feed，计划/预算/网络/正文归平台；移除runtime-source-pull适配器、重复intent/字段转换/引用集合及空shutdown。`source-request.ts`只转换公开请求，去掉Feed两项SEL依赖；旧Host有实际测试调用的runtime保留。用户暂停后不再落下不该新增的正文，明确重试沿原身份恢复；系统少维护一份计划和两份可用性集合。退役materials_v1门禁条目待用户批准，未擅改。

`apps/workbench/src/scripts/context-onboarding.ts:601` 删除restart内绘制，首次准备完成后只展示一次可操作问题（QF-43 / P2）；`:747` 配对恢复操作按钮，`:385` reselect展示本次错误（QF-45 / P2）。保存失败后用户可直接重试，不必刷新或重新找入口；页面少承担中途绘制和依赖HTML缓存碰巧重建按钮的隐式顺序。

最终生产构建、API和健康门禁通过；Feed来源/并发/权限/实际Runtime七文件155项通过，新增custom RSS hold四种交错、plan六种交错、暂停hold及真实web query共12项通过。测试只控制网络/DNS/TLS响应，真实Runtime/Host/引用账/SQLite/正文存储执行，未声称公网可达。onboarding16项和Feed反馈3项通过，QEA-76两项补验及6张三宽两主题图通过；已实看390深色。日志分别为feed-public-acceptance、feed-hold-network、onboarding-feed-ui和onboarding-refusal-views。custom RSS首版夹具误用fetch导致四项超时，现改测实际通道，不算产品故障；全Runtime/network及包必跑尚在执行。

### QF-47 / P1：未打包生成插件的恢复顺序阻断无关插件启动（已实施、定向通过）

位置：`apps/local-host/src/surface-installation.ts:71-96`；实际正常安装链`plugins/native/plugin-builder/src/agent-workflow.ts:757` → `apps/local-host/src/plugin-builder/studio-ports.ts:113` → `installed-plugin-lifecycle.ts:154`，重启由`installed-plugin-host.ts:144`恢复。未打包生成插件在恢复reader前已有安装事实，声明目录对该无关项直接抛错；Feed仅引用自身呈现动作也因此启动失败、缺后台wake。两次Home启动的SYS-15原断言稳定失败，诊断确认Feed监督器declaration_invalid且无数据库拒绝；没有用加等待或捏造archive替代修复。处置为只承认实际可证明动作，缺声明项不冒充可用；真实引用缺失仍拒绝，且已装同ID覆盖pending的规则保留。低成本，纳入本轮QEA-81/82并验证安装/信任/包零新增及原安全套件。

PF-03 补正：`specs/backlog/BL-memory-session-kinds.md`已有用户2026-11-12的明确延后决定，触发条件是第三个真实会话记忆消费者。实际Coding/Assistant绑定通过各自公开reader，无直接跨表读取；形成前后核来源与SDK写围栏有真实职责。保留该已批例外和BL，不报已通用化，不为猜想第三消费者新增架构。未来迁移除公开绑定类型/Host映射外，还涉及`horizontal/memory/src/session-clear.ts`的持久恢复计划，须按合同整体处理。其他未获延后决定的PF候选不适用此例外。

第三十一批补验结束：完整 feed-runtime-plugin 75/75、AnySearch唯一owner 4/4、RSS真实TLS安全4/4，共3文件83项通过（`/tmp/quality-audit-feed-runtime-network-final.log`）。自定义RSS与web query真实消费覆盖已取得，包必跑205文件尚未执行。


QF-47本地实现已验证：surface-installation只在非pinned且无精确声明时贡献空动作，完整目录及pending遮盖规则保持；原安装恢复40项及新增正常lifecycle恢复通过，后者明确开启可选平台调用权限后原数据/定时/Feed wake全部成立。SCS-16整文件11项通过，包括缺失引用及同ID pending拒绝、真实安装/pin/包零新增；无新生产导出。测试首版Home unsigned/签名标签和缺可选授权被正确拒绝，修正夹具后通过，不算产品缺陷。日志surface-build、surface-acceptance、surface-targets-final、surface-refusals-final分别保留结果，最终健康与CI仍独立核对。

2026-11-17最新主干a717e44284（#2105第39批，959文件）已fetch。当前固定29f6d1383e的205文件回归继续；根主线准备整合，审查/授权/SDK及真实入口交集纳入QEA-83。此前“最新主干4aa”及包清单为历史检查点，未将旧头验收挪作新头证据；原六方向目标不变。

QF-47最终健康门禁退出0（`/tmp/quality-audit-surface-health-final.log`），测试内部导入违规已消除，未放宽规则。

PF-04 进一步沿实际入口核对：`context-onboarding-actions.ts:40` 的 start 是 Home scope，`context-onboarding-service.ts:60–64` 的 running/controllers 只是单宿主执行与取消索引，持久事实由 ContextJourneyStore 保存；`readContextJourney` 对重启后失去执行者的 reading/adopting 转为可继续的失败。`web-context-onboarding.ts:24` 的正常入口通过 latestIncomplete 提供续办。现行 `home-aggregate.ts:57` 仅枚举 openProjects，`contracts/services/mainline.ts:34` 的任务行必须有 project_id；项目尚未创建的整理不会因多声明一个项目 provider 就被发现。故原“接 background_tasks/reports_to 即可”的表述不足：该候选须补 Home scope 的发现、归属及目标定位，再让 Onboarding 按原旅程事实投影，禁止借假项目、复制 phase 或给聚合器加 Onboarding 名单。用户影响是离开引导后少一个统一任务入口，并非整理停止或记录丢失；本轮已修的重选/失败恢复与它分别验收。BL-107（Home 引导接续）和 BL-work-line-background-provider-gaps（Alchemist/平台后台作业）不是重复项，仍有不同生产 owner 与 scope 缺口，不可一并清理。PF-05 同样保留已明确后续的沙箱 owner 事务执行要求，不能把当前入口拒绝当作过度防御删除。

**QF-50/P1 已实施、定向通过：自动观测把本地只读操作变成钥匙串访问。** 入口是 `tests/secret-store-keychain-retry.test.ts:198–233` 的真实 Host/HTTP/新鲜 MCP Functions list/describe。在 `project-host.ts:565` close 时，`horizontal/observation/src/writer.ts:156` 解析证据，`keys.ts:30` 主动创建摘要密钥，`packages/storage/src/adapters/file-secret-store.ts:688` 开原密钥库，触发 Keychain；3进程各一次。临时仅写调用栈证实此链，已移除注入，没有记录参数或密钥。不是本地 Functions 业务需要凭据。处置按 spec §39 提供 Storage 原事实源上的非交互访问给自动采集，按现有缺失合同保留元数据；显式业务/证据解封仍正常请求凭据。摘要不可得时 writer 的 coalesce 不能用空摘要误并不同输入，须配对验证。自动采集不得创建替代 key、绕过 HMAC、污染真实钥匙串失败缓存。

第三十三批 Git 实施结果（QF-23/46，本地最终包验收通过）：`plugins/native/git/src/ui.ts` 将原冲突编辑、磁盘对照及草稿错误/重试移入现有 result；Git 与 Coding 实际挂载共用客户端。`browser/result-selection.ts` 一份选择管理 diff/conflict/history/review，替代 displayed/preparing/conflictPath 及分散 ticket；目录 generation 只管目录读取。prepareIndex 的 ready/waiting/review 由可辨识类型约束，waiting/review 必有 operationId，review 必有 reviewId，未知回执显式重试用原 ID，已知审查的显示失败只读。`results.ts` 的列表应用保留当前选择，save 按原工作区和审查结算，错误不串到后来行；`source.ts` 读取实际 owner 回执后反馈与清草稿，不以通知状态冒充成功。离开/隐藏统一收起主结果，重新进入可正常选文件、重开固定 diff 与保存的草稿；同目录 refresh 不等于离开。

真实入口当前22/22通过（`/tmp/quality-audit-git-result-acceptance.log`）：两个入口各覆盖旧成功/失败、同ID重试只留一条待审且批准后实际暂存；历史读取/保存有真实交错与固定成果回读；拒绝、磁盘变化、后写草稿、缓存读失败重试及成功清理保留。两入口三宽两主题12截图已生成，root实看1440浅色Git与390深色Coding的原稿/当前磁盘/动作。第二轮20/22中的两个失败为测试误把未解决冲突文件当作可暂存diff，生产按原合同拒绝；夹具先结束原合并再建立普通改动，最终两项正常导航已过。原必跑列表及新增已知review展示失败用例仍在跑，不以22项当整批/整项验收。

Git 收尾复核的两个窗口已以正常入口动态证实并修复：打开历史再返回的目录选择不复用 null，设为输出成功后的回调再次核原选择。基线4/4失败，修复后4/4通过（`/tmp/quality-audit-git-final-windows-fixed.log`），原审查依然仅一条且批准后实际提交；权限回执不再额外准备B的审查，也不重开A。第五次完整构建和最终健康门禁通过（`/tmp/quality-audit-git-result-build5.log`、`/tmp/quality-audit-git-result-health-final.log`）。此前11文件105项全过是尾部修复前的证据；最终固定 `ff006e19f0` 已重跑11文件109项全过，日志 `/tmp/quality-audit-git-frozen-acceptance.log`。资源与最终整合头CI仍独立核对。

第三十八批QEA-87：完整构建通过，认可栏与工作事件真实入口2文件7项通过（`/tmp/quality-audit-acceptance-text-ui.log`）。实际requirements/decide/read验证长要求、含连续长路径的退回理由及保存后的历史；1440中文/390英文均检查正文真实换行、字形范围不被元素裁切、原认可/退回/改要求与按钮触达。核验observed从title移到已有说明行直接显示，既有机器/本人状态不变。root实看1440首屏及390长理由/展开历史截图：用户不必进入编辑或依赖悬停才能读完整依据。机器检查证据仍为受控种子，只证明页面与决定写入，不冒称真实外部工程检查。最终资源/共享核心CI仍待完成。

QEA-88/89 本地结果：完整构建通过；10个相关文件合计73项已有通过证据。首轮9/10文件通过，新增真实Host解封用例误用本人的页面query，其结果按OCL-11只保摘要，断言被正确拒绝；改用真实MCP读取产生密文、本人公开evidence.get解封后，密钥文件整文件14/14通过（`/tmp/quality-audit-key-host-recovery.log`），其余9文件59项原通过结果保留（`/tmp/quality-audit-passive-key-acceptance.log`）。三个新鲜MCP进程的6条记录各自保留、零security访问；实际Functions调用失败仅一次原钥匙访问；同进程显式解封后新记录恢复加密，旧missing记录不改写。env/file/keychain三种原backend、无替代钥匙、用途/跨项目拒绝均已验。未知摘要误合并的旧构建反例1≠2已转通过（`/tmp/quality-audit-observation-digest-baseline.log`）。公开API生成无差异（Storage不在contracts/SDK快照范围）；健康、包要求剩余与最终CI分别结算。

QF-50最终健康门禁退出0（`/tmp/quality-audit-passive-key-health.log`），无门禁阈值调整；完整包要求和最终Full CI继续。

### QF-51 / P1：批量更新普通判断反复扫描无关目录，宿主持续阻塞（修复验收中）

现行基线 `ff006e19f0` 经 `tests/inbox-evaluate-reads.e2e.test.ts:77` 正常20条更新复现：CDP等待18.6秒，Host事件循环active18591ms/idle0、CPU15051ms，日志 `/tmp/quality-audit-inbox-performance-baseline.log`。固定规则不含模型耗时；同机竞争未排除，不能将一次样本称稳定p50，但此进程自身连续占用已证实。旧BL-inbox-update-blocks-host仍有实际依据。

代码链：Inbox `scene-runtime.ts:112` 写判断前校验 → Host `local-host-scenes.ts:51,118` 场景检查/初始绑定 → Kernel `action-service.ts:260,278,498` 已知场景兼容性与usages → 全目录可用性；Host `local-host-availability.ts:132` 依赖绑定也原先枚举所有场景。Inbox `scenes.ts:4` 是固定结果场景，只有 Kernel `actionSceneCompatibilityReason` 的 subject-offers 分支真正消费整个推荐目录。新增正常Kernel调用反例证明无关provider可用性被问4次（`/tmp/quality-audit-scene-cost-baseline.log`，4≠0）。

处置：Kernel普通场景现读已知判断和实际依赖；Host按已知场景引用先选择再运行availability/bindings，普通usages只投影实际绑定，offers继续核完整授权目录。事实仍归原注册表/插件绑定，Host策略仍现读；不缓存跨等待授权、不放宽超时、不改变判断账与事件归属。场景投影没有注册所有权，移为同文件函数，ActionService实测从474行/25方法降至468/24；仅同步缩小登记，不调阈值。代价中，跨Kernel与Host；用户少等整台宿主失去响应，代码少为无关插件重复读取可用性。

完整构建通过，只读复核未见新增Blocker/P1；10文件真实消费者/拒绝/UI回归进行中。QEA-90/91及实际回读为本批验收，不能只凭调用数下降关闭BL，也不能据此宣称BL-943双Goal窗格预算满足。

QF-50冻结头d7d146a2da包要求续跑已通过8/86文件（Home升级81项、进程删除16项、Runtime HTTP27项、维护12项、项目删除20项、删除hooks11项、Feed授权22项、维护安全9项），随后主动SIGINT释放本任务机器槽，让当前Inbox性能定位先运行；子进程均已退出。78个剩余文件未完成，日志 `/tmp/quality-audit-key-required.log`，不记全绿，后续组合头按影响面补验。

QF-51追加根因与处置：收窄目录后CPU采样仍指向项目归属/常开插件的现读链，整批本地结果连续占用微任务；不跨等待缓存这些授权。在Inbox原批读与逐项判断之间让出事件循环，整批输入仍先验证，原提交前复核保留。QEA-91旧构建反例稳定出现“Missing expected rejection”：取消排入事件循环后整批先跑完；修复后实际Host仅保留第一条账本，剩余重试各一条，三条对应事件各一次。QEA-90真实20条页面新增同Host `/health` 请求，已确认在第20条前返回，建议及完成提示顺序和单次重读保持；完整17文件仍在验。首轮BRC-05八种业务/目录预算均过，额外discover反证已正确拒绝，但断言仍匹配旧错误文字而失败；只同步该精确文字，保留受控额外读取与预算断言，整文件待复验。只读复核新增部分无Blocker/P1；不据单次HTTP响应宣称最大延迟已达标。

第四十批定向检查点已通过：17文件153项有通过证据（BRC精确报错文字修正后5/5，额外调用反证保留），完整构建/API零差异/健康通过。最新真实20条五样本中，另一个HTTP请求都在4/20条时返回，最大事件循环延迟1.09–2.65秒；但总耗时p50为22.6秒，且每批出现6–8次Goals刷新。`apps/workbench/src/scripts/client/initialization.ts:460`把非Goals舞台的全平台cursor变化转为Goals刷新，`refresh-decisions.ts:128`再读取全平台cursor；Inbox原历史事件也触发它。原连续占用遮住了这部分重复工作，故**不能宣称QF-51或BL-inbox-update-blocks-host已完成**。继续追实际Goals投影依赖及当前可见性，保留已验证的取消/写入与目录收敛，不靠放宽时限或暂停其他工作掩盖总成本。

### QF-52 / P1–P2：Skill 草稿恢复与回放事实失配（第45批本地定向通过）

入口及归属：Assistant 工作中的公开草稿动作、本人能力包页和 `/api/plugin-trust/skills/drafts/adopt` → Host Agent definitions → `SkillDraftStore`；采用继续经原签名/安装服务，正式正文和版本不写回草稿历史。最新主干 #2107 的这条真实链纳入原六方向，未把已有 BL 或主干测试通过当作无缺陷依据。

| 发现与位置 | 用户影响与处置依据 | 本次处置 |
| --- | --- | --- |
| `apps/workbench/src/browser/kit/draft-turns.ts:106`、`writing.ts:99` 忽略保存失败或直接清编辑区；`draft-editing.ts:113` 只认正在保存 | 保存失败后关闭/新建丢输入，用户被迫重写；原“不增加离开确认”的承诺须以内容已保存为前提 | `flush`绑定原编辑对象，离开核成功；未保存的失败仍保护窗口关闭，不加自动重试和新确认 |
| `draft-turns.ts:69` 迟到采用回执清当前界面；冲突后读新draft但仍保留旧fields | 旧操作关闭后来新建的草稿；下一次输入可能以他人的新版本号覆盖其正文 | 结果只更新原对象；`draft-editing.ts:75` 刷新案例/回放时核原revision，不前移本地编辑基线 |
| `apps/local-host/src/agent-definitions/skill-workshop.ts:319`、`skill-drafts.ts:186` 只核草稿修订/案例存在 | 等模型时更换已知答案，旧结果可冒作新答案的有效回放并解除采用门 | 在原存储事务比较模型实际使用的任务/材料/答案；拒旧结果，不写trial，其余案例无需重跑 |
| `apps/local-host/src/skill-authoring.ts:172` 检查所有保留回放的差异 | 最新已匹配仍再次确认，界面反馈与采用行为不一致 | 每条当前案例取最近有效回放；其他案例仍不同则仍确认 |
| `skill-drafts.ts:198` 原全草稿只留最近5次 | 反复试一条会挤掉另一条已过结果，要求无关重跑 | 原表每案例保留最近结果；最多案例数仍由原合同约束，无新表/状态/版本 |

证据：旧浏览器两条丢输入反证均失败，`/tmp/quality-audit-skill-save-baseline.log`；旧后端错收回放与历史差异两条失败，`/tmp/quality-audit-skill-replay-baseline.log`；旧保留策略真实Host反证要求重跑另一条，`/tmp/quality-audit-skill-retention-baseline.log`。修复后完整构建通过，10文件81项全过（`/tmp/quality-audit-skill-recovery-acceptance.log`），包括4项新增浏览器、3项新增Host交错/恢复及原完整创作、权限/签名、存储基线、Memory真实owner消费者。实际采用回执是在Host成功安装后延迟返回，第二份草稿的文本与真实保存仍保留；并发修订用另一真实HTTP写入，拒绝后回读对方正文与修订均未变。

边界：模型替身只证明调度、事实绑定、采用门和存储恢复，不证明模型质量。真实签名安装、HTTP与浏览器路径已经运行；本人验收没有代签。采用等待中其他入口或已开始的并发 revise 更新同一草稿后被清理的独立风险，仍在构造真实交错，不冒称由本批解决。设置遮罩缓存/深链消费还需继续核，不能把页内离开测试扩称所有导航均通过。

新增 BL 对照：`BL-b42-acceptance` 保留用户本人/真实模型验收；`BL-b42-followups` 不整项关闭。①用量应由HostCompleteText与现有Observation统一补平台合同，实际调用方为起草、修订、回放、信息动作，不在Skill另造账；②组合失败提示随词包变更合并处理；③深链消费应回到设置地址owner，包含Home回执；④页签/开关应复用现有设计系统并补id/子路径合同，不新建Skill专用组件库；⑤两份草稿覆盖现行政策已明记后续，不能与同一草稿并发丢修订混为一谈；⑥删除后仍可读/放弃的草稿有保留用户内容的职责，不能当死代码删除。①③④继续按本任务平台化方向审查并裁决批次，待实际实施/验收后才更新BL状态。

第45批补充结算：只读复核指出本次close→reload新增等待可接收新输入，正常浏览器反证确实失败；现保存成功后同步收起编辑器，再刷新当前目录。6项新增UI最终全过（`/tmp/quality-audit-skill-close-final.log`），原完整创作UI在最终生产实现上另过1项（`/tmp/quality-audit-skill-close-acceptance.log`），与先前未改后端的76项组成10文件83项。中途测试曾在目录实际重画期间点击旧节点失败，现等待该节点被真实刷新替换且新正文仍在，再严格点击；未改点击工具、时限或产品语义。保存中的后续输入实存两次修订，回退未存改动后安全离开不覆盖另一入口。API重新生成0差异。实际查看1440回放与390深色编辑截图，原布局保持；截图在已忽略的 `.impeccable/qa/review/skill-authoring/`，不代表模型质量或本人验收。

第45批最终健康门禁通过（`/tmp/quality-audit-skill-close-health-final.log`），门禁未放宽；前次仅报告中的BL简称无法解析，已改为真实条目全名后重验。第46批继续处理采用期间的写入生命周期，另发现案例写入与回放清理尚非同事务，须以实际SQL失败反证处理。

### QF-53 / P1：采用旧快照后删除已经成功的新修订（第46批验收中）

真实入口为两个项目的本人HTTP与已开始的模型修订，目标是同一Home草稿。`apps/local-host/src/skill-authoring.ts:175` 原先读取r1后等待签名/安装，随后`SkillDraftStore.adopted`无条件清草稿。Skills登记在项目system provider，实际走ProjectLine；同一Home的两个项目不共享这个排队事实，concurrent revise/trial的尾写也可穿过等待。反证在实际Home新装前、安装后返回前两处持有：采用200、revise200、另一项目update200，读到草稿r3，采用完成后404（`/tmp/quality-audit-skill-owner-baseline.log`）。这不是两份草稿覆盖政策，而是成功回执对应的用户修改被删除。

处置：`apps/local-host/src/agent-definitions/skill-drafts.ts:82` 在原单Home store 内只占用正在采用的draft，从首个await前到原安装返回及同步adopted事务结束；失败/取消finally释放。update、discard/restore、案例增改删、trial尾写和二次adopt在原写点拒绝，普通读及其他draft继续。`packages/contracts/src/services/skills.ts:569` 声明 `skills.draft_adopting`（既有conflict分类），给准确的进行中原因，页面不误说成版本已经被他人修改。API仅新增此错误码。原安装授权、回滚和发布者检查保留，没有把领域CAS塞进安装后的授权尾检，没有另建持久状态、队列或自动重试。

定向证据：新装前/后与实际换版回执通过，期间模型及另一项目写入409，正式版本仅1或2、草稿仅结算一次。失败用例覆盖每个上述写入口、等待中的trial、另一个draft正常保存，原案例与trial保持，明确恢复后安装一次。真实HTTP请求取消发生在安装前，原草稿/版本保持，随后编辑和采用正常；日志 `quality-audit-skill-adoption-recovery.log`（4项）、`quality-audit-skill-adoption-cancel.log`（1项）。不把这个进程内生命周期称作跨包安装与草稿存储的崩溃原子事务；安装实际提交后的独立故障/恢复仍需另核。当前更广16文件验收在跑，整项未完成。

### QF-54 / P1、P2：案例写入与回放清理半次成功，以及改标题强迫重跑（第46批验收中）

`apps/local-host/src/agent-definitions/skill-drafts.ts:181` 原putCase先提交答案、再删trial；removeCase同样两次独立提交。通过Storage公开连接在原表注入清理拒绝trigger后，公开动作报错但新答案已存在，或案例已被删；旧trial仍存且revision没变。前者会把旧匹配当新答案的采用依据，后者回报失败却已删除并遗留界面结果。反证的两个实际状态差异见 `quality-audit-skill-owner-baseline.log`，不是虚构无await两句之间的普通取消。

处置：复用原store事务，让案例写入和相关trial清理一起提交/回滚。`sameCaseInput`（:71）统一模型实际使用的task/material/expected，与recordTrial写入检查同口径；title仅作界面识别，改名保留有效回放。第三条旧反证显示改名后trial_id消失，修复后仍为同一记录且模型调用数不增加。SQL故障后案例、trial、修订均不变；去掉故障后明确重试成功，新答案需要重新回放才能采用，删除则一次结算。三条QEA-106及原Skill流程通过（`quality-audit-skill-owner-focused.log`）；不增加库结构、兼容reader或独立恢复账。

### QF-55 / P1：案例的可写状态与数量只在等待前判断（第46批本地定向通过）

`SkillWorkshop.putCase`原先open/数量检查后等待dispatcher的beforeEffect，`SkillDraftStore.putCase`新增分支不再核草稿事实。正常公共ActionClient在原owner已读草稿后持有最终授权等待，另一项目依次真实采用、放弃或写入第五条；旧实现仍返回成功，前两种各留1条不应写的case，第三种实际存6条（`/tmp/quality-audit-skill-late-case-baseline.log`）。不是向handler输入伪造beforeEffect，也没有替换业务处理器。

现 `apps/local-host/src/agent-definitions/skill-drafts.ts:181` 在原事务内核草稿仍存在且未放弃、读取当前数量再插入；`skill-workshop.ts:249` 删除等待前数量检查，输入文本与调用范围验证仍留真实边界。removeCase同样在写入事务核草稿可编辑，已放弃的内容留待用户恢复/清理。四项QEA-107覆盖采用后孤儿、放弃后新增、第六条与放弃后迟到删除，实际owner记录和错误码均核对。

第46批定向结算：完整构建通过；16文件185项先通过（`/tmp/quality-audit-skill-owner-acceptance.log`），增加QEA-107及修复后，受影响3文件33项补过（`/tmp/quality-audit-skill-owner-final.log`），组合覆盖16文件189项。含正常Skill完整UI、6项UI恢复、Home真实安装/升级、签名/权限、Runtime回滚、实际HTTP取消、所有草稿写入口、SQL拒绝及明确重试。API只新增`skills.draft_adopting`错误码（现有conflict分类），无库结构、状态枚举或动作输入输出变更。只读复核先指出两处缺口，均取得反证并修复；末次窄复核无新增Blocker/P1。最终健康、整合头CI、资源与原QF-51性能继续，不能据此关闭整项。

第46批最终健康通过：`/tmp/quality-audit-skill-owner-health-tracked.log`，新增生命周期测试已纳入索引。初次门禁指出第45批测试里的两次双重强转，现由同一个泛型HTTP助手正确声明各响应类型；不改测试运行、不放宽门禁。所有本次模型/安装等待在Home fixture之前注册清理，正常、失败与取消都释放；原finally仍等待请求结算。
