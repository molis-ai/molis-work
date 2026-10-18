# Alchemist 项目分库：最终接入方案

状态：只读设计结论，未实施、未改 spec、未运行构建或浏览器。检查对象为 wt-alchemist-runtime；交给主 Session 更新 accepted spec 后实施。目标是内部完整，本文不把接口设计当作验证通过。

## 结论与边界

保留每个 Home 一个 Alchemist 安装/实例、每个项目一份 studio.sqlite，以及现有 `alchemist/projects/<encoded-project-id>/studio.sqlite` 布局。最终只使用 PluginDatabase 的 reader 与显式 transaction，不引入 borrowedSql、prepare 或驱动型临时接口。现有 `prepare()` 的 statement 会暴露 database，裁剪 TypeScript 类型不能形成运行时边界。

建议分两步：先修现有 Alchemist 与 Home executor 的撤权、完整 drain、失败可重试；然后一次迁入通用项目分库。生命周期修复不需要等待分库合同。分库后 Host 不保留 Alchemist 专用 opener、SQL/业务规则，也不把任意路径交给 Manifest。

用户已决定：重启保留任务与进度，由用户点击“继续”重新授权执行；不自动续跑、不补持久后台授权机制。启动业务 seed/default 推荐移至现有 command 初始化事务；可信生命周期已有 Images 窄恢复模式可复用，不需新维护平台。模型调用结果未知时的重试预算与旧任务输入快照缺口见末节。

## 最小合同

现有 `PluginDatabase`、`PluginDatabaseReader`、`PluginDatabaseTransaction` 不变。向可信的 `PluginDatabaseDeclaration` 增加可选字段：

```ts
readonly partition?: {
  readonly by: "project";
  readonly file_name: string;
};
```

无 partition 的现行 Home 库保持原语义。有 partition 时，目录算法固定为 `<store_name>/projects/<encodeURIComponent(project_id).replaceAll(".", "%2E")>/<file_name>`。`store_name` 继续仅允许单目录名；file_name 必须是单段 sqlite 文件名，不允许斜杠、反斜杠、点目录、绝对路径或 NUL；不要扩大为 template、callback、任意 path。Alchemist 声明为 store_name=alchemist、file_name=studio.sqlite。嵌套 declaration 在注册时复制并冻结；修改传入对象不能改变已发布实例。

这是可信 Host 目录条目的合同，不是 Manifest 扩展，不是 action 输入。存储层公开一个通用的受限项目库定位/打开函数，统一生成 writer 与 reader 的位置；无 Alchemist 分支。`home-stores` 仍登记整个 alchemist 根目录，以便整 Home purge；不要把项目分库伪装成根目录的一份 library。基线检查需要遍历的部分在 storage 的通用项目分库声明处理，不在 Host 导入插件 SQL仓库。

Home executor 给插件的 database 是作用域 façade。每次 get/all/transaction 都从 `currentPluginAction()` 获取已验证 install_id + caller.project_id，检查安装和项目状态，选中该分区；插件不能传项目 id 选库。transaction 在第一次 await 前固定分区及 generation，await beforeEffect 后再次核对同一 scope、generation 和授权，事务内不能切库。缓存的业务 repository 只能保存 façade/无权限的项目状态，不能缓存带永久权限的驱动或事务。缺少 scope/project、别的安装作用域、已撤权/删除的 generation 一律拒绝。

分区 façade 不需要新增 public `open(projectId)` / `current()` / `close()`，也不需要把项目 id 当作能力凭证。Host 内部 manager 只需 lookup(scope)、beginDrain(projectId)、drainAndClose(projectId)、closeAll；不把这个 manager 出口给插件。

## 调用链与职责

1. HomePluginHost 从可信目录登记分库 declaration；安装启动只构造 manager/façade，不枚举项目打开数据库。唯一 Home 实例仍负责插件注册。
2. 动作网关验证 caller、项目和权限，Plugin Runtime 建立 action scope。插件正常调用 database façade，Host 验证 scope 后为该项目惰性打开 reader/writer。Host 的基线创建只执行可信 schema，与业务 seed/任务恢复分开。
3. get/all 使用 SQLite readonly reader，保持 SELECT/WITH 入口检查，拒绝 ATTACH/PRAGMA/连接控制；底层 readonly 约束负责拦截 WITH 包装的写入。
4. transaction 使用现有 `await beforeEffect(); BEGIN IMMEDIATE; synchronous body; final check; COMMIT`，撤权/取消/停用/删除后任何失败记账也不得写。回调异步、事务 handle 逃逸、嵌套独立事务都拒绝；业务需要的组合事务向下传同一个 tx。
5. 用户动作派生的后台任务使用现有 PluginBackgroundClient.start。它已经保留 scope.caller.project_id 并在 runInPluginAction 内执行 work；复用该 scope 选择分区，不从 job payload 重建 scope。用户任务结束后的其它任务不能借用同一份 authority。
6. 项目删除仍只走 ProjectDeletionService 与已登记 hook。hook 的 projectId 是 Host 验证输入，不能使插件获得 SQL 权限。顺序为同步禁止接纳并取消该项目任务 → await 原始工作 Promise 全部退出 → 关闭该项目连接与其它现有资源 → purge。项目 B 不受影响。

## Drain 与失败重试（必须先补）

DB transaction 计数不足以 drain：AI 等待、conversation-message 前台动作、worker、搜索资源都可能仍在 await。现有 runtime.close 只等 worker/draining，未等待 actionsInFlight；拒绝后的 lifetime.wait 也可能先于底层 work 退出。Host 和插件要追踪真正的 pending work Promise，而不是只追踪面向调用方的取消结果。正常取消马上拒绝新写，但 close 必须等待实际持有资源的工作退出。

使用简单的 active → draining → closed 状态。draining 时新 scope/读/写即拒绝；重复 close 共享进行中的 closePromise。失败清除本次 promise，保留尚未释放的句柄与 draining 状态，允许下一次 close 重试。reader 与 writer 分别记录成功关闭，第二个失败时不重复操作已关闭的第一个。

现有必须改的具体问题：

- Alchemist studio eviction 不可在 cleanup 失败的 finally 里删除 studios 记录；否则第二次删除会绕过 drain 直接 rm。
- runtime.close 与 alchemist-search.shutdown 不可永久缓存 rejected Promise。
- Host closed 标志不能让 cleanup 的 alive 分支在仍有资源时落入 offline purge。
- HomePluginExecutor.stop 的 dispose/session.delete、HomePluginHost.release 的 releaseProjectOwners/database.close/platform=null 不能在 stop 失败后无条件遗忘资源。
- background.close 当前只 abort 并清空 active controller；需要保留原始 pending work 的完成性供 drain，不能把 active.clear 当作已退出。

项目删除 hook 保留现有同步 `onProjectDeleted` 取消通知；异步等待由 Host manager/executor 的内部生命周期完成，不把任意异步插件回调解释成已成功清理。若同步通知抛错，本次失败，不 purge；再次删除继续清理。资源已经全部关闭但 purge 失败时，重试 purge，不重新开库。Home stop 与项目删除交错时复用同一分区 drain 状态，直到清理成功才移除 owner/session/manager 记录。

## Repository 与 transaction 改造

所有 Alchemist repository 直接改为 PluginDatabaseReader / PluginDatabaseTransaction；查询由 get/all 返回行后在插件内解码。写服务在最外层开 transaction 并向下传 tx。createExploration → jobs.enqueue、startLensRun → jobs.enqueue、worker commit → jobs.withLease → result/report save 都应成为一个显式 tx；不要为减少调用改动新增 savepoint 协议。取消链中当前内层错误向外重新抛出，可用外层整体回滚保持语义；若实施中发现真正捕获后继续提交的 savepoint 语义，先单独报告证据。

`readEvents` 目前在驱动 transaction 中读取 jobs 后再取 events，但属于 query，不能迁成需要写权限的 PluginDatabase.transaction。可用一条 SELECT 保持同一快照：

```sql
SELECT j.id AS job_id, j.status AS job_status,
       e.sequence, e.type, e.payload_json, e.created_at
FROM jobs AS j
LEFT JOIN job_events AS e
  ON e.job_id = j.id AND e.sequence > ?
WHERE j.id = ?
ORDER BY e.sequence
```

无行＝job 不存在，保留原错误；一行且 sequence 为 NULL＝job 存在但无后续事件；否则映射事件。cursor 保持最后 sequence 或 afterSequence。不可把过滤放 WHERE，否则会丢失“存在但无事件”。不得加未在旧行为中的 limit。验收需覆盖同一快照、未知 job、无事件、after 游标高于末尾、普通多事件序列。

## 恢复授权：用户决定已明确

用户已选择：Alchemist 迁 Runtime 后，重启保留任务与进度，由用户点击“继续”重新授权执行。不自动续跑，不实现持久后台授权。此决定取代前版“恢复方式待选”，主 Session 负责写唯一 accepted spec。

当前进程的新任务与用户明确继续的任务使用 PluginBackgroundClient.start 派生本次授权；任务 actorId、workerId/lease 不能变成 authority。插件启动不 recoverExpired、不消费 queued。启动 seedLocalIdentity、settings.ensureDefaults、pulse.ensureDefaultSources 仍属于业务写入，须独立落实到有写授权的首次 command 或已接受维护入口，不能混入 schema baseline。

## 验收与拒绝测试

- ALC-PDB-01：同一 Home 一个实例交错接受项目 A/B，数据分别落既有文件；路径含点/斜杠字符的 id 编码正确，不能越目录；无第二份空根库。
- ALC-PDB-02：伪造输入 project_id、无 action scope、其它 install scope、query 写入、WITH 写入、ATTACH、逃逸 tx、异步 tx 均拒绝，原始库与其它项目均无变化。
- ALC-PDB-03：在 beforeEffect 等待期间撤权/停用/删项目，恢复后拒绝，包含失败记录也不落库；在旧 scope 下不得自动 reopen 已删除分区。
- ALC-PDB-04：模型前台动作与后台 worker 真正阻塞时删除 A：立即停止接纳，purge 尚未发生；释放工作后关闭并 purge；B 同时继续可用。
- ALC-PDB-05：注入一次 search close / reader close / writer close / purge 失败；第一次不遗忘未释放资源，第二次完成；与 Home.stop 交错也不能跳过 drain。
- ALC-PDB-06：组合业务事务中途失败时 job、事件、业务结果全部回滚；成功恰一次；不依赖测试里的另一路数据库实现。
- ALC-PDB-07：readEvents 上述边界结果与旧合同一致，只有一条 readonly SELECT，不要求写权限。
- ALC-PDB-08：背景当前授权可被撤销；重启零模型调用、零自动续跑，任务和 checkpoint 保留，只有 user 继续 command 获得的新授权可执行，不用旧 actor/lease 的模拟授权证明通过。

优先扩展现有 home-plugin-project-cleanup、security-invariants-plugin-background、action-background-authority 与 Alchemist 生命周期/仓库用例。按源码影响先 pnpm build，再定向；共享 contracts/runtime 改动由主集成 Session 安排一次全量。同步 api/actions 快照（动作形状若变则按合同升级）、安全不变量表与使用文档；此只读任务未运行上述测试。

## 实施边界与交接

允许实现范围：contracts/platform/plugin-database.ts 与其公开 API 快照；storage 的通用 Home/project 库定位；Host plugin-database、home-plugin-executor、home-plugins、plugin-project-cleanup、home-stores、可信 database entries；plugin-runtime 的背景生命周期；Alchemist database repositories、事务服务、local-runtime/actor-actions/search 生命周期；现有相关测试与对应 spec/docs。共享文件由唯一 writer 串行修改。

不做 Manifest 任意路径、Alchemist Host 专用 opener、跨插件 SQL、borrowedSql、自动兼容旧结构、真实 Home 迁移、第二个 Home 实例、独立持久任务平台。直接保留现行布局，不涉及数据搬迁；基线不匹配仍拒绝，不能用读时 fallback 兼容。

建议顺序：生命周期修复与失败重试 → 明确维护/恢复合同 → 分区声明和 Host manager → repositories 显式 tx → 整体切换删除旧 opener → 针对拒绝/真实交错验证 → 集成回归与实际 Home 隔离启动。回退以整个原子改动为单位且不得双开同一文件；仅修改代码前后不改存量库形状，避免额外迁移回退协议。

## 用户手动继续：源码核对与最小完整路径（2026-10-18 补充）

### 现行状态与缺口

- `studio/domain/kernel/run.ts`、`shared/contracts/actions.ts:runStatusSchema` 及 schema 的 jobs/exploration_runs/lens_runs/pulse_runs CHECK 都已有 interrupted。无需新建 paused/waiting 值，也无需为“等待继续”改 SQL schema。
- SQL baseline 是 version 1；schema.ts 明确十份历史 migration 已合为一个现行 baseline，错版拒绝、不开机升级。没有可借用的 Alchemist 读时迁移机制。不能恢复旧 migration 或自动填补旧 JSON。
- `sqlite-job-runner.ts:recoverExpired` 当前把过期 running 先写 interrupted，再立即写 queued；local-runtime 在构造时与每个 runPending tick 都调用它，start 立即执行并每 250 ms 扫 queued。必须删除这条自动继续链。
- `LocalWorker.runNext` 是全队列 claimNext，不能让某个 job 的新授权顺便跑同项目其它 job。改为只接受已绑定当前授权的 jobId；原 job.id、业务 run.id、input_json、checkpoint_json、事件序列保留。
- 没有现成 retry/resume action。research.start 对同 plan 已有 run 直接 lens_run_exists；direction explore 的 reuseExisting 只是返回原 run，不启动 worker；Pulse start 新建 run。都不能冒充继续入口。
- `followedJob` 把 interrupted 放在 failed[]，这是“本次执行跟随结束”的分类，不能据此把业务数据改 failed。若沿用此分类，展示必须为“已中断，等待继续”，明确任务可继续；不要让通用 UI 写“任务失败”。可新增独立恢复 query，不必扩大平台后台状态合同。

### 推荐无 SQL 迁移的状态表达

持久 job.status 保留事实：重启时可仍为 queued/running，不在无授权启动期批量改业务行。恢复 query 用当前安装 generation 的活跃执行登记（含已受理尚未 claim 的 job）判断：非终态且无本实例执行 authority ⇒ `state:"awaiting_continue"`。这是“当前执行是否受理”的派生视图，不声称历史 status 已变更；返回 `persistedStatus`，保留原数据。已有 interrupted 同样可显示等待继续。不要只用 lease 到期时间；旧进程剩余 lease 不代表仍在执行，Host 单执行进程/generation 才是依据。

如果主 Session 选择持久状态也一律改 interrupted，可在有权 command 内与 claim 原子进行，或走已明确授权维护入口；不能借 query/startup 写入。优先使用派生恢复视图，避免为了展示增设写授权。

终态 completed/partial/failed/cancelled 不自动变等待继续；一般模型失败的“重新研究”继续保持新研究行为，用户此次决定针对中断保留任务，不隐式扩大成重试所有失败。

### 建议新 action（名称是设计建议，由 accepted spec 定稿）

`alchemist.runs.pending@1`：project query，user audience，alchemist:read；输入空对象。输出 `runs:[{jobId,kind,runId,persistedStatus,executionState:"awaiting_continue"|"accepted"|"running",attempt,eventCursor,stage,recovery:"checkpoint"|"repeat_call"|"review_required",reason?}]`。只列未终结任务，可显示同项目多个待继续任务；按 job 的业务引用生成 runId，不能依赖最新一条 run，否则旧未完任务被新研究遮住。query 不写库、不延长 lease、不执行网络/模型。

`alchemist.runs.continue@1`：project concurrent command，audience 仅 user，输入 `{id:jobId,expectedAttempt,expectedEventCursor}`；输出 `{jobId,runId,accepted:boolean}`，background_job 指向现有 runs.events。按 job.kind 需要 generate 或 collect 权限，最小清晰实现可拆 `explorations.continue`、`research.continue`、`pulse.continue` 三个动作以复用各类原权限，避免一个统一动作过度要求/漏掉权限。不允许调用者传 project/actor、payload、checkpoint、模型或新计划替换原工作。

重复点击：同 job 的已接受本实例 continuation 返回同一引用，不再次 retain/start；事务 CAS 同时核对 attempt 和 max(event sequence)，只在没有本实例受理任务、读视图仍匹配时 claim 指定 job、attempt+1、清旧 lease、追加一次 resumed/running 事件。过期页面给 conflict 并刷新，不悄悄启动另一个 attempt。安装 generation 内待受理登记必须在异步前 reservation，失败释放；最终 authority.beforeEffect/同步检查之后才写 claim；没有写权限的失败不写“失败记账”。

claim 和 background start 的窗口要明确：先由已受理 command 创建带本次 authority 的后台工作，再在该 work 内原子 claim；不要先写 running 再尝试 retain authorization。授权成功后进程崩溃但未 claim，重启仍显示待继续；claim 后崩溃也同理，无持久授权。

### start / stop / restart / continue 调用链

新 start command → 冻结业务输入并写原 run/job → 本次 background.start → claim(jobId) → 原 handler/checkpoint → transaction beforeEffect + lease/generation 检查 → 完成。不能让周期队列消费旧 job。

stop/停用/删除 → 先关闭接纳与撤权、abort → 等前台和原始 handler Promise → 关闭 DB/搜索等资源。撤权后不补写 interrupted/failed；已保存 checkpoint 和原 status 留存。显式用户取消仍与“暂停待继续”不同，保留 cancelled 终态；本次需求不增加暂停按钮。

restart → 构造 façade，不开机 recover/claim → 页面读取 pending 派生状态 → 用户点继续 → 新动作重新校验项目/权限、模型可用性及复用事实 → 用同 jobId 受理 → CAS claim → 恢复。缺失/过期 plan、模型不可用、复用版本变化都保留任务并明确拒绝，不回退到默认模型或新计划。

### checkpoint 能做到什么

1. Exploration：无 checkpoint 尚未生成；ready_to_persist 保存理解、卡片内容与固定 card ids，继续可直接存结果。generating 只证明已派发模型、无返回结果；现代码遇此 marker 会写 failure。必须改成恢复 query 标 repeat_call，继续前明确“上一调用结果未知，重试可能再次计费”。不能假装能接上丢失的 token 流。
2. Lens：planning_complete、collecting_complete、cross_checking_complete、ready_to_persist 有阶段数据，按 checkpoint 恢复。call_dispatched 已保存 operation、callsUsed、previous；现 handler 会失败，不能原样复用。经用户明确确认后从 previous 重做不确定阶段，同时保留派发计数/事件；不能删除 marker 后把调用预算归零。现 callsUsed 按阶段传固定 1/2/3，直接重试会低估已派出调用，这是必须修的行为缺口。
3. Pulse：按 source collections 跳过已保存来源，checkpoint 已有 completedSourceIds/阶段/报告。未保存的来源请求可重抓；已保存失败来源目前也在 collection 表，当前恢复会跳过，不隐式把“继续”改成重试失败来源。报告与机会阶段需验证同 run 的唯一性和事务，不重新创建 run。
4. 完成落库与 jobs.complete 是两个步骤。若崩溃在业务结果已完成但 job 未终结，继续必须识别现存业务结果/同 id，并只补终结，不重复模型、卡片、报告、复用 receipt。应优先同一业务 transaction 合并最后结果与 job terminal，覆盖现存切口。

### 输入冻结的实际边界

现 Exploration input_json 已冻结方向 title/description，但生成时 taste 动态读取、模型来自当前运行配置；不能宣称完整原输入冻结。Lens 固定 planId、Idea version、scope key、modelId、budget 和 reuse snapshot；仍要校验引用版本与权限。Pulse 固定 run.sourceIds、periodStart，但连接/来源可用性是继续时现行授权检查，凭据不能写进快照。

最小实现保持 job.input_json 和 plan 不变，同一次 continue 在 await 前复制解析值、模型选择、taste 等将被使用的上下文，不让 UI 修改对象或并发设置改变在途输入。若要求“跨重启所有原始提示上下文逐字相同”，现 Exploration 的旧记录缺 taste/model 快照，无法恢复；不得自动伪造原快照。新的快照字段即使放 JSON 不改 SQL，也属于持久数据合同变化，需写 accepted spec 并明确旧任务处理，不可当作无需决策的小实现。

### UI 最小路径

client.ts 的 load 同时取 pending，views 现有研究/探索/脉搏状态区叠加“等待继续”；Lens footer 不能再把所有非 active 状态都变“开始/重新研究”。已有模型对话框可复用作继续前展示：原任务、已完成阶段、原模型/预算；安全 checkpoint 一次“继续”，不确定调用明确“重试未完成调用并继续”及计费说明。旧任务快照不完整或预算用尽显示具体原因和审阅入口，不把它显示成失败。

需要一个紧凑的“待继续”列表入口承载不是 latest 的任务，仍在 Alchemist 已有工作台内容中，不另页/新 tab。继续 accepted 后刷新同 run，活动状态才轮询；awaiting_continue 不无限轮询。按钮 busy 只防本页连点，幂等依赖服务端 CAS。英文翻译、资源字节约束同步，不新建 UI 框架。

### 需要 root 定稿的剩余点（不是重复询问恢复方式）

A. **不确定调用的预算**：按 root 最新边界，继续 UI 说明从最近可恢复 checkpoint 重新调用可能重复计费，保留已派发 callsUsed，不做外部请求去重保证。初版只在原预算剩余额度内重试，额度用尽保留待审阅；root 需在 spec 定稿额度不足的 UI 行为，不能暗自增加预算或将调用计数归零。
B. **旧 Exploration 输入不完整**：选择沿用原方向+继续时明确展示并冻结当前模型/taste，还是要求新任务才可全快照恢复。缺失历史上下文是数据事实；增加新 JSON shape 并读取旧 shape 会触及兼容约束。优先不要为了此次恢复新造 SQL schema；若确定补 snapshot，须明确旧数据维护/拒绝方案。
C. **若坚持 persisted paused/waiting 新值或新列**：现 schema CHECK 与 baseline version 1 不支持，必须升版及获准的离线维护，不得在打开真实 Home 时 ALTER/兼容；目前“interrupted + 派生 executionState”已能表达，因此无必要。

新增验收：重启后 queued/running/interrupted 全部零自动执行且原 checkpoint 不变；同一 job 两个点击/两个窗口只 claim 一次；继续 A 不跑 B；旧 lease 未到期也可在已确认前进程退出的单 Host 下继续；unknown-call 不会直接变 failed、不静默再次收费/越预算；ready_to_persist 不二次调用；完成提交切口重开不重复产物；原方向被编辑、模型被移除/停用、复用版本变化、当前 authority 撤销分别验证冻结或明确拒绝。以上均未运行，待 accepted spec 实施。

### Images 窄启动恢复模式核对与建议修正

只读核对 `wt-model-selection/plugins/native/images/src/plugin.ts:createImagesPlugin`：start 构造 current service，局部 recovering=true；check 同时要求 recovering、service===current、context.requireGrant(storage:private)。recover 经 service.write → PluginDatabase.transaction(beforeEffect) → 同步 assert_authority_current，store 把旧 running 标 interrupted，清孤儿文件，无供应商派发。Home executor 的 requireGrant 还检查 activeRecord/generation 与当前 grants。因此已有可信生命周期可支持有限维护，不必补通用维护平台；前文强调的是不要把普通 query 或原 job actor 当维护授权。

Alchemist 的额外约束是按项目分区：Home 插件 start 没有项目 caller，不能遍历插件随意提供的 projectId 并授予数据库能力。推荐初版沿现有业务 command 做惰性初始化：首次写 command 已获得 caller.project_id/当前权限；在其 transaction 中确保 workspace/actor/default settings/default pulse source 存在，再写实际业务。query 对未初始化项目返回只读默认值/空列表，不能 INSERT actor 或 defaults。当前 `bootstrap/actor-actions.ts:bindAlchemistActor` 在每次 invoke（包含 query）经过 beforeEffect 后 INSERT actor，须按 operation 分流并移除 query 写入；不是仅换驱动即可。

恢复 interrupted 可同样在首次继续 command 的 transaction 整理该 job 与业务 run，保留 checkpoint/输入/事件/已保存产物，清旧 lease，再 claim 同一个 job；所有初次恢复页面用上述只读派生 executionState。这样无需新增 public lifecycle 合同，Images 模式作为已有许可依据，不机械照搬 Home 整库扫描。

若 root 选择项目打开时就持久标 interrupted，能沿 Images 的同类窄模式，但必须让 Host 从真实项目目录/生命周期绑定项目分区及安装 generation，临时恢复 control 不可从普通输入构造；只允许中断标记/清 lease，不派模型、不扫 queued 执行，不在查询回调里夹写。该方案需要一个受限分区激活入口，复杂度高于首 command 初始化，因此本提案仍优先后一种。

具体 checkpoint 缺口不以 schema 隐藏：Exploration generating 必须重新执行整次生成，保留方向快照、原 run/job、旧事件；Lens call_dispatched 必须重做 operation 对应阶段，保留 previous 内 evidence/claims/报告中已经存在的部分、原 plan/model/budget、callsUsed；Pulse 只重做没有保存 collection 的来源。新的继续尝试对原 checkpoint 结构的更新属于正常业务状态转换，不是读取兼容迁移；不能伪造旧任务不存在的 taste/model 快照。
