# FI-6 Feed、Inbox 进 Plugin Runtime 设计稿（PG-093、PG-089 余半，并关 PG-040、PG-080、PG-045 的余项）

状态：设计稿（2026-10-25），等统筹审；审过再实现，本稿不改代码。事实在 `claude/ac-feed-inbox-designs`（含 batch-37、S9-0b）上读代码核的，没跑过；读了没验证的地方都标「未验证」。父稿 [feed-inbox-runtime.md](feed-inbox-runtime.md) §2、§4 定了目标形状，前置 FI-1（已进 batch-35）、FI-2、FI-3 已实现，FI-5 设计稿 [feed-inbox-store-into-feed.md](feed-inbox-store-into-feed.md)，FI-4 设计稿 [feed-inbox-home-reference-ledger.md](feed-inbox-home-reference-ledger.md)。

**先说五件事**：

1. **父稿 §4 里一处写错了**：「互斥用 `services.background` 的锁」——`PluginBackgroundClient` 只有 `start`（一次并发执行）和 `keep`（随激活存活的任务），**没有锁**（`plugin-background.ts`）。来源同步的互斥改成 Feed 实例自己的（§3.6）；父稿那一行实现时改掉。
2. **这一片和 FI-5 合起来动真实 Home 的数据**：基线 v10 → v11（FI-5）之外，Feed 与 Inbox 改用平台服务以后，**存量的 Attention 条目没有归属、情境账的键没有命名空间**，不维护的话 Inbox 一上来是空的、已关联的 Goal 全部看不见（§3.5）。这两件事和 FI-5 的 v11 做在**同一次维护**里，整组（FI-3～FI-6）一个 PR 也正好是一个落地单元。PR 开头必须写「合入前要用户定维护时段」。
3. **FI-4 的实现不能早于本片**（它自己的设计稿开头就这么写：事件订阅要项目实例是 Runtime 实例，Home 一半要 `registration.runtime.scope = "home"`）。统筹 10-25 说 FI-4 直接实现；我的理解是：FI-4 的**平台侧前置**（`host.connection.changed@1` 事件类型与启动对账、「某插件在本 Home 的全部安装」的只读服务）可以先做，Feed 一侧的订阅与 Home 引用账随本片的骨架一起做。若统筹要的是别的次序，请回我。
4. **有五项要统筹裁**（§4 的 D6-1～D6-5）：来源拉取的 SEL 组装放哪、平台通知怎样落到 Feed、情境账键和旧归属的维护、Inbox 对 Feed 的检查走谁、HTTP 边在哪一片删。每项我写了推荐，审完我照做。
5. **体量**：这一片是整组最大的，按 §5 的 7 个提交顺序做，每个提交单独跑得通，整组一个 PR；不能拆成两个独立可发布的 PR，因为 Feed 的动作要么全由 Runtime 提供、要么全由宿主提供（`BUILD_TIME_ASSEMBLED` 里一个名字）。

## 1. 现状（只写父稿 §1.1 之外、这次新核的）

### 1.1 今天的组装与它的替换（`createLocalFeedApplication`）

`apps/local-host/src/feed-application.ts` 对着项目库的**原连接** `db` 一次组装整个 Feed 应用；8 个宿主文件各自再构造一份（`content-action-providers.ts`、`demo-plugin-seed.ts`、`feed-connector-sync.ts`、`feed-goal-promotion.ts`、`feed-source-service.ts`、`plugin-notification-service.ts`、`project-host.ts`、`workflow-feed-options.ts`）。组装里每一块的去处：

| 今天 | 换成 | 备注 |
| --- | --- | --- |
| `db`（better-sqlite3 原连接），`db.transaction(op).immediate()` | `services.project_database`：读用同步读客户端，写用 `transaction(beforeEffect, tx => …)`；存储层经 FI-5 的 `FeedSql`（`fromPluginTransaction(tx)`） | 写回调是同步的；等模型的先 await，提交前 `beforeEffect()`，见 §3.2 |
| `LocalSqliteJournal(db).appendEvent` | `tx.journal.appendEvent`（S9-0） | 事件名与对象类型存成 `<plugin_id>:<名>`，插件只见裸名（`plugin-project-journal.ts`）；存量事件保持裸名 |
| `AttentionModule(db, { exists, eventSink })` | `services.attention`：`join(tx, writer => writer.create/setStatus/deleteSubject)`，读 `list/get/findActiveForSubject/findForSubject/events` | 与 Feed 的行同一个事务；`exists` 回调没有了——插件自己为主体存在负责；`eventSink` 改写 `tx.journal` |
| `createContextLedger(db, { authorize: module:feed })` | `services.contextLedger`：`join(tx, writer => writer.put/remove)`，读 `get/list/history` | 键存成 `<plugin_id>:<键>`；调用的人是 actor |
| `createGoalReadServices(db, journal).query`（只给 Attention 的 `exists` 查 Goal 在不在） | 删 | 跟着 `exists` 一起没有 |
| `projectVersionStores(…)` + `as unknown as ArtifactsSqliteDatabase` | `services.artifacts`（Manifest `artifacts.produces` 已声明 `feed.capture`） | 关 PG-080，并删 `feed-application.ts` 里那处 `as unknown as` |
| `FeedOutRuleStore(db)`，`projectPluginDatabaseRefusal(db, FEED_PLUGIN_ID)` | `FeedSql`；被拒由平台状态承担 | |
| `createFeedHistoryRelease(db)` | FI-4 的 Home 引用账 | |
| listener 七个函数（`saveListenerRun` 等） | `FeedSql` | FI-5 已搬进 Feed |
| `createFeedSourceRuntime`（SEL 组装，要 `secretStore`、`EvidenceContentStore`、`createSearchOpaqueBlobStore(db)`） | **D6-1** | 见 §4 |
| `plugin-notification-service.ts` 往 Feed 写事项 | **D6-2** | 见 §4 |
| `web-project-schedulers.ts` 每 30 秒替 Feed 调 `scheduler.tick()` | Feed 声明唤醒动作（PG-039，平台定时钟以插件安装身份调） | §3.6 |
| `feed-source-sync-lease.ts` 的全局 Map | Feed 实例自己的 Map，键 = 来源号 | §3.6 |
| `information-actions.ts`、`information-planner.ts` | 并进 Feed 包（PG-093） | 其提供方身份与调用方实现时核对，未验证 |
| `demo-plugin-seed.ts`、`workflow-feed-options.ts`、`feed-goal-promotion.ts` | 经公开动作（`services.actions.directory`，PG-027） | `feed-goal-promotion.ts` 现在直接构造 Feed 应用 |

### 1.2 Inbox 其实不拥有数据，它拥有的是对 Attention 的使用

`inbox-actions.ts`（71 行）的列表与状态来自 `FeedApplication.listInboxEntries/getInboxEntry/setInboxEntryStatus`，实质是 Attention 条目。Feed 与 Inbox 的耦合只有两处：Feed 创建 `feed_item`/`source_fault` 类的条目（`ensureInboxEntryForFeedItem`、`createInboxEntry`），Inbox 重开条目时要核对那件事项没有被「忽略」（`setInboxEntryStatus` 里的 `assertNotIgnored`，一个 Feed 的事实）。

### 1.3 已核对为「现成」的平台件

`PluginHostServices`（`plugin-host-services.ts`）已有：`project_database`、`attention`、`contextLedger`（S9-0b，已进 main）、`background`、`scheduler`、`artifacts`、`processItems`、`connections`、`materials`、`model`、`notifications`、`events`、`dependencies`/`directory`/`actions`（PG-027）、`ownerFiles`。**没有**：网络访问、文件/正文存储、密钥读取（密钥只给引用）、锁。

## 2. 目标形状（对父稿 §2 的补充）

- `createFeedPlugin()`、`createInboxPlugin()` 两个 `PluginDefinition`，`start(context)` 只用 `context.services`；`apps/local-host/src/project-plugins.ts` 里各一个监督器条目；`tests/builtin-plugin-assembly-gate.test.ts` 的 `BUILD_TIME_ASSEMBLED` 删 `feed`、`inbox`（只许减少）。`NATIVE_PLUGIN_HTTP_FILES` 的两个条目随 HTTP 边在 FI-7 删（D6-5）。
- Feed 的 Manifest 新增：`attention.subjects: ["feed_item", "source_fault"]`、权限 `attention:read/write`、`context-ledger:read/write`、日志权限、`background.jobs`（来源拉取）、唤醒动作；Inbox 的 Manifest：`attention:read`（读全部）、`attention:write`（只关/开，不创建；不声明主体类型），以及对 Feed 的依赖动作（§3.4）。
- 两个包都只 import `contracts` 与 `plugin-sdk`（硬约束）。
- 宿主文件消失的清单：`feed-application.ts`、`content-action-providers.ts` 的 Feed 部分、`inbox-actions.ts`、`feed-source-scheduler.ts`、`feed-source-sync-lease.ts`、`information-actions.ts`、`information-planner.ts`、`workflow-feed-options.ts`、`feed-goal-promotion.ts`；`feed-source-service.ts`、`feed-connector-sync.ts`、`plugin-notification-service.ts`、`demo-plugin-seed.ts`、`project-host.ts` 里与 Feed 相关的部分。

## 3. 设计

### 3.1 一个应用，两种适配器

FI-5 的存储层只依赖 `FeedSql`；本片给它第二个适配器 `fromPluginTransaction(tx)`（读用读客户端的同一形状）。`FeedApplication` 的构造改成「给我四个端口：`sql`、`attention`、`ledger`、`journal`」，宿主不再出现；`plugins/native/feed/src/` 里的 `FeedApplication` 保持今天的方法名与行为（529 行的 `application.ts` 不拆，不在本稿范围）。

### 3.2 一次写 = 一次事务；等模型的先等，提交前再认一次权

- 今天写路径分两种：**同步写**（`ingestItem`、`setDisposition`、`markRead`、`linkGoal`、`upsertSource`、`addToInbox` 等）整个方法在 `db.transaction(op).immediate()` 里；**要等模型的写**（`ingestItemJudged`、`evaluateItems`、`flushPendingJudgments`）已经是「先 await 判断、再同步提交」。后一种在 Runtime 里就是 `scheduling: "concurrent"` 动作：await 之后 `beforeEffect()`，再按读取时的版本提交（硬约束）。
- 每个动作处理器的形状统一为：`const prepared = await …（读 + 等模型）; await database.transaction(() => beforeEffect(), tx => { const app = assemble(tx); return app.<同步方法>(…); })`。assemble 在每次事务里新建（构造器只存引用，FI-5 §3.2 已定），不得跨事务保留 `tx`。
- Attention 和情境账的写通过 `join(tx, …)` 并入**同一个事务**：事项行写成功而条目没写成功的半成品不会出现。写事项而 Attention 写失败时，整个事务回滚——这不是行为变化（今天也是同一个连接的同一个事务，一样回滚），但要用测试钉住（RAC-506）。
- 被取消、撤权、停用的调用在 `beforeEffect()` 抛出，不写任何业务记录（含事项、条目、情境账、日志；失败记账也不写）；这是硬约束，验收 RAC-509。

### 3.3 Attention：`exists` 没有了，owner 有了

- 今天 `AttentionModule` 构造时要一个 `exists(projectId, subjectType, subjectId)` 回调，宿主按类型分发查 Feed 事项、来源、Goal。服务版 `create(input)` 注释写明「The plugin vouches for the subject's existence」：创建条目的插件为主体存在负责，不查别人。Feed 创建 `feed_item`/`source_fault` 条目时，事项/来源就在同一个事务里刚写过或刚读过，自然存在。
- Goal 类型的条目由谁创建：**未验证**。`exists` 里有 Goal 分支，说明库里可能有 Goal 主体的条目；实现前 grep 找创建点（我只核了 Feed 一侧）。若是 Goals 插件自己建，它要在 Manifest 声明那个主体类型；若今天由宿主直接调 Attention 写 `owner_plugin_id = null`（#1245 那条路径），**这条路径要随本片删**（拆片稿 §4 FI-6 验收里写的），不删就留了一条宿主私路。
- `ensureFeedItem`（找活动条目，没有就建）用 `findActiveForSubject` 加 `create` 在同一个 `join` 里实现。
- Inbox 读全部（`list/get/events`），写只许 `setStatus`（开、进行中、完成、忽略）；它没有声明任何主体类型，所以 `create/deleteSubject` 对它被拒（RAC-506）。

### 3.4 Inbox 对 Feed 的检查：走公开动作（D6-4）

重开 `feed_item` 类条目前要核对事项没被忽略。推荐：Feed 公开一个只读动作 `feed.items.admission`（输入事项号，输出「可以重开 / 已被忽略」，Inbox 在 Manifest 里声明依赖），Inbox 经 `services.actions.directory` 调。Feed 没装或没启用时：Inbox 仍列出条目，重开被拒并说明原因（RAC-515）。备选：把「忽略」状态放进条目的 `detail` 里让 Inbox 自己读——否决：那是把 Feed 的事实复制到 Attention 里，改动「每项事实只有一个主人」。

### 3.5 存量数据的维护（并入 FI-5 的那一次）

**基线 v10 → v11（FI-5）之外，还要三件，都在同一个事务里**（照 `tests/project-maintenance-v10.test.ts` 的夹具做法）：

1. **Attention 条目与事件的归属**：`owner_plugin_id` 现在对旧行是 `null`（v10 的「未归属旧行保持 null」），服务版的 `list()` 只显示明确有主的条目（plugin-attention.ts 注释：未归属的「remain accessible through their existing direct owner paths until explicit maintenance assigns them」）。所以维护必须把 `subject_type IN ('feed_item','source_fault')` 的条目与它们的事件指给 Feed，其余主体类型指给声明它们的插件（Goal 类指 Goals；**未验证**有哪些类型、各归谁，要对着真实库的 `SELECT subject_type, COUNT(*)` 核）。不认识的类型保持 `null` 并列进维护报告，由用户决定，不猜。
2. **情境账的键**：Feed 的 `feed.goal:<事项>` 边今天的键是裸名；服务版只认并只列 `<plugin_id>:<键>`。维护把键改成 `io.molis.work.feed:feed.goal:<事项>`（插件号用 Feed 的 `FEED_PLUGIN_ID`）。不改的话所有「事项关联 Goal」会消失，用户看见的是丢数据。
3. **日志里的 Feed 事件名**：存量事件的 `type`、`object_type` 是裸名（`feed_item.created`、`feed_item`、`inbox_entry`…），新事件会是命名空间名。我在 `apps`、`plugins`、`modules`、SDK 里 grep 过，按 `feed_item`/`inbox_entry` 对象类型读日志的地方零命中；**因此推荐不改写历史事件**，只让新事件带命名空间（日志是追加式历史，不为命名改写）。**未验证**的是工作台客户端脚本与时间线/搜索有没有靠事件类型过滤；实现第 1 个提交时再 grep 一次，若有读取者，要么让它们认两种名（读取兼容要先经用户确认，见 `AGENTS.md`），要么改写历史，到时再弹窗问。

维护演练：`tests/fixtures/project-maintenance-v10-feed.sql`（含 Feed 事项、条目、来源、`feed.goal` 边、未归属条目）→ 维护后 Feed、Inbox 经公开动作读到的结果与维护前逐项相等（RAC-514）；没维护的库被 v11 宿主拒绝。时段归用户。

### 3.6 来源 tick、互斥与后台

- **tick**：Feed 的 Manifest 声明一个唤醒动作（PG-039，`#1123`、`#1131`），平台定时钟以 Feed 的安装身份在每个装了它的项目里调用；`web-project-schedulers.ts` 里替 Feed 调 `scheduler.tick()` 的代码删。唤醒动作内调用 Feed 自己的 `scheduler.tick()`（`feed-source-scheduler.ts` 的内容并进来）。Feed 没装或被停用的项目不再有 tick（RAC-511）。
- **互斥**：今天 `feed-source-sync-lease.ts` 是宿主进程里一个全局 Map。改成 Feed 实例自己的 `Map<来源号, 开始时刻>`：一个项目一个 Feed 实例、一个 Home 一个执行进程，所以键只需来源号；同一来源同时第二次同步被拒（沿用现有的 `feedErrors.source_sync_interrupted`）。今天的锁按（库文件，项目，来源）记，能跨「同一个库的多个工厂实例与连接」；Runtime 里一个项目一个实例，够用，但实例被替换（重装、更新）时新旧实例有短暂并存的窗口，这个窗口里的互斥是否靠 `feed_source_runs` 里的运行中记录兜得住，**未验证**，实现第 5 个提交时核并写测试。进程崩溃由 `recoverInterruptedSourceRuns` 恢复（已存在）；实例停用时 Map 随实例消失。不同项目的同名来源号互不影响（RAC-512）。
- **后台**：来源拉取是并发动作（等网络），写前 `beforeEffect()`。需要超过一次调用寿命的长拉取用 `background.keep` 声明的 job，Manifest `background.jobs` 里写明理由与所需权限。

### 3.7 成果

`feed.capture` 的版本写入改用 `services.artifacts`，类型 `feed.capture` 已在 `artifacts.produces` 声明；未声明的类型被宿主拒绝（`artifact-type-gate`）。`FeedArtifactProducer` 端口保留，生产端换成服务。`feed-application.ts` 里的 `as unknown as ArtifactsSqliteDatabase` 随文件删。

## 4. 需要统筹裁的（推荐都写了；统筹 10-25 已逐项裁定，写在各项末尾）

- **D6-1 来源拉取的 SEL 组装放哪。** FI-3 明确把 `public_source`（rss、web-query、youtube，无账号）留在 `feed-source-runtime.ts`/`feed-source-service.ts` 里，没进登记。它需要：公开网络抓取（带 `ETag`/`Last-Modified` 条件头和 RSS 允许名单）、证据正文存储（`createEvidenceContentStore`，写 Home 里的文件）、不透明块表（`createSearchOpaqueBlobStore(db)`，基线里存储包拥有的表，系统搜索也用）、密钥库。`services.materials.readSource` 只做公开 HTTP GET，没有条件头，也没有证据正文存储。三条路：（a）**推荐**：把「按来源拉取并写证据」做成平台服务（`services.sourcePull`，输入路由与游标，输出条目、回执、写过的正文引用），内部就是今天这套 SEL 组装，所有插件同样可用；写过的正文引用交给 FI-4 的 Home 账。（b）Feed 自己组装 SEL，缺的端口逐个补成平台服务（网络、正文存储、块表）——服务多、面大。（c）宿主保留这块、Feed 经私有端口调——这是私路，同等待遇下不做。 **统筹 10-25 定：选（a），新增平台服务（暂名 `services.sourcePull`），所有插件同等可用。约束是不放宽任何边界：地址校验、上限、允许名单沿用材料读取的 broker（S-57）；要凭据的只经 `services.connections`，插件拿不到密钥；证据正文写到 Home，其引用交给 FI-4 的 Home 账；Manifest 声明权限，新增 SI 行带拒绝测试（S 号到时问统筹）。实现时若发现必须放宽某条边界（私网、任意请求头、跟随跳转出允许名单等），停下回统筹，由统筹弹窗问用户**
- **D6-2 平台通知怎样落到 Feed。** `plugin-notification-service.ts` 今天直接构造 Feed 应用往里写事项并建 Attention 条目。Feed 进 Runtime 后宿主不能再直接写 Feed 的表。推荐：Feed 公开一个接收通知的动作（只许 Host 提供方的身份调，输入通知的最小字段），平台通知服务调它；Feed 没装或停用的项目里，通知保持在通知服务自己的队列里（不丢、不写别处），用户在通知面板里仍看得到。备选：通知写入时不进 Feed，Feed 另订阅通知事件——要改通知服务的合同，面更大。 **统筹 10-25 定：按推荐，但宿主不点名 Feed：插件在 Manifest 里声明「接收平台通知」，平台通知服务按声明在目录里找接收方，不写 Feed 的 plugin_id；调用方身份是平台（Host 提供方），受众只许平台；没有接收方，或接收方没装、停用时，通知留在通知服务自己的队列里，不丢、不写别处**
- **D6-3 维护的范围（§3.5 的三项）。** 推荐：Attention 归属和情境账键做；日志历史不改写。要用户确认的是「不认识的主体类型保持无主并列报告」这一条。 **统筹 10-25 定：Attention 归属和情境账键随同一次维护改；日志历史不改写，只让新事件带命名空间。「不认识的主体类型保持无主并列进维护报告」一条由统筹约维护时段时一并弹窗问用户，实现照推荐写。第 1 个提交前再 grep 一次按事件类型读日志的地方：有读取者就停下回统筹（读取兼容要用户确认），不自己加兼容**
- **D6-4 Inbox 对 Feed 的检查。** 推荐 §3.4 的公开只读动作。 **统筹 10-25 定：同意，公开只读动作 `feed.items.admission`**
- **D6-5 HTTP 边在哪一片删。** 父稿 §4 把 `/api/feed*`、`/api/inbox*` 边放在 FI-6，客户端放 FI-7。但边不能比客户端先删（29 行引用还在用）。推荐：FI-6 只让 Feed、Inbox 的**动作**由 Runtime 提供，边保留为一层薄转发（调同一批公开动作，不再碰 Feed 应用）；边的删除与门禁 `NATIVE_PLUGIN_HTTP_FILES` 的两个条目随 FI-7 在同一个 PR 里。整组仍是一个 PR。 **统筹 10-25 定：同意。FI-6 里 HTTP 边留一层薄转发，删边连同 `NATIVE_PLUGIN_HTTP_FILES` 的两条随 FI-7；FI-3～FI-7 整组一个 PR**

## 5. 提交顺序（一个 PR 里，每个提交单独跑得通）

1. 把 Feed、Inbox 的存储与应用端口化（`FeedApplication` 吃四个端口），仍用原连接适配器，宿主行为不变；既有测试原样过。
2. 加 `fromPluginTransaction` 适配器和每次事务新建应用的包装；Attention/情境账/日志三个端口各有服务版实现，加拒绝测试（RAC-506～508）。
3. Inbox 的 `createInboxPlugin()`，用 `services.attention` 与 §3.4 的动作；`inbox-actions.ts` 删。
4. Feed 的 `createFeedPlugin()`、Manifest 新增项、监督器条目；`BUILD_TIME_ASSEMBLED` 删 `feed`、`inbox`；`content-action-providers.ts` 的 Feed 部分、8 个构造点逐个改成公开动作（RAC-499、500、516）。
5. tick、互斥、后台、成果（RAC-509～512）。
6. D6-1、D6-2 裁定的件（RAC-513）。
7. 维护夹具、演练与 CHECKLIST 行（RAC-514），连同 FI-5 的 v11 一起；FI-4 的 Feed 一侧随第 4 个提交之后加（它的验收是 RAC-492～495、518）。

## 6. 验收（暂定号：RAC-499、500、506～517）

| 编号 | 内容 |
| --- | --- |
| RAC-499 | Feed、Inbox 经 Plugin Runtime 装配：`BUILD_TIME_ASSEMBLED` 无这两项，监督器有两个条目，两个包只 import `contracts` 与 `plugin-sdk`；所有 Feed、Inbox 动作的提供方是 Runtime 安装身份，不是宿主 |
| RAC-500 | 存储只经 `project_database`：Feed 代码没有原连接；受检客户端拒绝 Feed 对未声明表的语句（对 `goals_*` 表写被拒）；Feed 被项目库拒绝时只停 Feed |
| RAC-506 | Attention 经 `services.attention`：条目与事项在同一事务（在事项写入后、条目写入前让事务失败，两者都不存在）；条目 owner 是 Feed；Inbox 只能 `setStatus`，`create/deleteSubject` 被拒；`exists` 回调与 #1245 的 `owner_plugin_id = null` 直写路径已删 |
| RAC-507 | 情境账经 `services.contextLedger`：`feed.goal` 边带命名空间；别的插件读不到、写不了 Feed 的边；维护后「事项关联 Goal」原样可见 |
| RAC-508 | 日志经 `tx.journal`：Feed 的新事件名带命名空间，Feed 读不到别的插件的事件；不能以别人的名义写 |
| RAC-509 | 提交前再认权：模型返回后、`beforeEffect()` 前把调用取消、撤权、停用，各自之后 Feed 不写事项、条目、情境账、日志、失败记账；处理器开始前就被拒的，只留一行「未执行」诊断行 |
| RAC-510 | 成果经 `services.artifacts`：`feed.capture` 写入成功；写未声明的类型被拒；Feed 代码无 `projectVersionStores`、无 `as unknown as ArtifactsSqliteDatabase` |
| RAC-511 | tick 由平台以 Feed 安装身份唤醒：Feed 没装或停用的项目没有 tick；`web-project-schedulers.ts` 无 Feed 调用 |
| RAC-512 | 来源互斥：同一来源同时第二次同步被拒；不同项目同名来源互不影响；`feed-source-sync-lease.ts` 已删；崩溃后的中断运行被恢复 |
| RAC-513 | 平台通知落点（按 D6-1、D6-2 裁定）：通知能到 Feed，Feed 没装时不写别处也不丢 |
| RAC-514 | 存量维护演练：v10 夹具库经维护后按 v11 打开，Feed、Inbox 经公开动作读到的结果与维护前逐项相等（含事项关联的 Goal、未完成条目）；不认识的主体类型保持无主并列报告；没维护的库被拒 |
| RAC-515 | Inbox 对 Feed 的依赖只经公开动作：重开被忽略事项的条目被 Feed 的动作拒；Feed 没装时条目仍列出、重开被拒并说明 |
| RAC-516 | `createLocalFeedApplication` 与 8 个宿主构造点已没有（门禁：宿主无此符号）；演示数据、工作流选项、Goal 提升都经公开动作 |
| RAC-517 | 同等待遇：Feed、Inbox 的定义没有宿主私有 import；`registerProvider(` 里没有这两个提供方；外部插件用同一批 SDK 件能写出同样结构 |

## 7. 不在本稿，以及未验证项

- 不在：`application.ts`（529 行）、`ui.ts` 的拆分；FI-7 的客户端迁移；Goals 的 Attention 使用（`ac-sc3`）；Observer 去重与规则 `subject_kinds ⊂ 场景` 校验（归 Codex）。
- 未验证（实现第 1 个提交前核，结果写进 PR）：Goal 类主体条目由谁创建（§3.3）；真实库里 Attention 的主体类型分布（§3.5）；工作台脚本、时间线、搜索有没有按 Feed 的事件类型过滤（§3.5）；`information.plan` 的提供方身份与调用方（§1.1）；FI-5 的存储层有没有构造时缓存语句的地方（FI-5 §3.2）；`fromPluginTransaction` 对「读到自己未提交的写」的行为（`PluginDatabaseTransaction` 的 `get/all` 在事务内读到本事务已写的行吗，要看 `plugin-database.ts` 的实现与一条测试）。
- 基线号与维护号：v11 暂定（FI-5 §3.4），与 Goals S9-2 等同批时按落地顺序顺延。
- 号段：RAC-499、500、506～517（本线号段内，RAC-501～505 是 FI-2，518 是 FI-4，519 是 FI-3）。BL：新增待办时从 BL-534 起。

## 8. 实现记录（FI-6 进行中，2026-10-25 夜）

- **提交 1（端口化）已做。** `FeedApplication` 早就吃 `FeedApplicationPorts`；缺的是「组装」还在宿主。现在 `assembleFeedApplication`（`plugins/native/feed/src/application-assembly.ts`）在 Feed 包里建 Sources/Feed 事项两个 Module、监听函数和应用，吃四个端口：`sql`（`FeedSql`）、`attention`（`FeedAttentionPort`，Feed 用到的 Attention API 的子集，宿主的 `AttentionModule` 原样满足）、`ledger`（`FeedLedgerPort`，按项目号，不带 actor）、`appendEvent`（日志）。宿主的 `createLocalFeedApplication` 只造这些适配器。`attention` 是个工厂，因为宿主的 `exists` 回调要问「事项在不在」「来源在不在」（循环依赖，服务版忽略参数）。`FeedOutRuleStore` 改读 `FeedSql`，自己的数据库类型删了。
- **提交 2（服务版端口）已做。** `createFeedRuntimePorts`（`runtime-ports.ts`）把同样的四个端口接到 `services.project_database/attention/contextLedger`，外加 `within(tx, actorId, body)`：同步体内所有端口绑到这次写事务（事项、条目、情境账边、日志同一次提交），体外只读、写在发出语句前就被拒。应用只建一份（`JudgmentQueue` 的待判断队列跨调用保留），每次调用只绑定端口——所以不是「每次事务新建应用」（§3.2 原写法会丢队列，已更正）。`fromPluginReader/fromPluginTransaction` 在 `store/sql.ts`。端口守住项目（别的项目号被拒）与归属（条目一律是 Feed 的，替别的插件办事被拒）。`FeedApplication.listInboxEntries/getInboxEntry` 的过滤从「无主」改成「无主或 Feed 的」：宿主 Module 下行为不变，服务版下 Feed 只见自己的条目，别的插件的条目（Goals 的决定）Feed 找不到。验收：`tests/feed-runtime-ports.test.ts`（RAC-506～508 的端口一层；条目与事项同事务的真服务版证明随提交 4 的 Feed 真装配）。
- **Attention 事件仍是宿主服务写的**（`plugin-attention-service.ts` 的 `ports.journal`，对象类型 `inbox_entry`，不带命名空间），不经 `tx.journal`；只有 Feed 自己的事项事件（`feed_item`、`judgment`）走 `tx.journal`，存为 `<plugin_id>:<名>`。
- **§1.2 低估了 Inbox。** `inbox-actions.ts` 的 71 行只是壳：它还接着 Pages 生成（经动作，没问题）、读材料时核对 Feed 事项与来源、`inspectSourceAuthorization`（连接器授权）、`hydrateFeedItemContent`（正文解密）、下一步判断的 scene（`createInboxSceneRuntime`：`ActionSceneClient` 的 `usages/bind/runScene`，加 Functions 持有者的绑定表、已发布规则、判断账）、Home 事件处理与内容动作（`ensure/reopen/flush` 都是 Feed 应用的方法）。Feed 一侧同样：捕捉 scene（`createFeedSceneRuntime`）、`captureJudgment/homeJudgment/inboxJudgment` 三个回调、`linked-context.ts` 的 `ContextMaterializationApi`。**`PluginHostServices` 里没有场景客户端、判断账或 Functions 绑定的服务**（§1.3 的清单没列，也没写在「没有」里）。这些要么补成平台服务（同等待遇、各带 SI 行），要么留作缺口——不能留一条宿主私路。见提交 3 前向统筹提的问题。
