# FI-6 Feed、Inbox 进 Plugin Runtime 设计稿（PG-093、PG-089 余半，并关 PG-040、PG-080、PG-045 的余项）

状态：批 C 于2026-10-27续做：C03–07、RAC-808 的 Runtime Inbox 证明、SYS52 修复已完成并有作者定向验证（SYS52 浏览器例未在本机跑）；合成树的包登记、断链、类型断言、巨大单元与 API/动作快照已按门禁修好或刷新。边界检查已按用户批准跟上删掉的文件；四个红文件在 main 上是绿的，已在 C 里修（一处产品回归：Feed Manifest 缺 `attention.inbox`）。FI7 Feed 一半已做（页面请求进 Manifest routes，两段 HTML 归外壳舞台，宿主 Feed 边删除；健康门禁对 merge-base 通过，工作台脚本比预算小 186 B、不需放行；改到的浏览器例只写未在本机跑），槽账号绑定 UI 移到单独切片 FI7b；D-4e3-1 按用户 10-10 的决定改回（本人经 Feed 升格记已确认，Goals 只从 Host 设的委托字段认本人，且只认来源主人 Feed 的委托，暂定 S-99；收窄到具体动作记 BL-803），Feed Manifest 回 0.3.0、发版核对补 Feed 正文引用账，desktop-tui 转绿；inbox-automatic-scenes 改走 Runtime 的 `feed.sources.sync` 后查出 Runtime Feed 没接成果服务，统筹批了方案 A：RAC-510 已做（`services.artifacts.join`，捕捉的成果与事项同一次提交，暂定 S-100；6 个动作多要 `artifact:write`，不留兼容期；存量记 R-69），该例第 166 行原断言转绿，顺带修了 FI-C-08；FI7 评审（`d96bd692d`）的四处跟进已做（W3-01 C 补回「进了门、被拒、留行、带编号」的 HTTP 用例，PG-060 位置、PG-057 与迁移文档跟上现状），边界检查的余漏记 BL-802；受影响文件逐个跑时又修了 feed-promote-mcp 的夹具（项目缺 Feed）；C02 Notion 复审无必修项；最终独立验证与 Full 未做，见 §13。C未合入；真实 Home、维护和本人验收未执行。父稿与历史设计、逐片记录保留。

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
| `projectVersionStores(…)` + `as unknown as ArtifactsSqliteDatabase` | `services.artifacts`（Manifest `artifacts.produces` 已声明 `feed.capture`）；捕捉经 `join` 进 Feed 自己的事务（RAC-510，§3.7） | 关 PG-080，并删 `feed-application.ts` 里那处 `as unknown as`（已做，10-27） |
| `FeedOutRuleStore(db)`，`projectPluginDatabaseRefusal(db, FEED_PLUGIN_ID)` | `FeedSql`；被拒由平台状态承担 | |
| `createFeedHistoryRelease(db)` | FI-4 的 Home 引用账 | |
| listener 七个函数（`saveListenerRun` 等） | `FeedSql` | FI-5 已搬进 Feed |
| `createFeedSourceRuntime`（SEL 组装，要 `secretStore`、`EvidenceContentStore`、`createSearchOpaqueBlobStore(db)`） | **D6-1** | 见 §4 |
| `plugin-notification-service.ts` 往 Feed 写事项 | **D6-2** | 见 §4 |
| `web-project-schedulers.ts` 每 30 秒替 Feed 调 `scheduler.tick()` | Feed 声明唤醒动作（PG-039，平台定时钟以插件安装身份调） | §3.6 |
| `feed-source-sync-lease.ts` 的全局 Map | Feed 实例自己的 Map，键 = 来源号 | §3.6 |
| `information-actions.ts`、`information-planner.ts` | 并进 Feed 包（PG-093） | 其提供方身份与调用方实现时核对，未验证 |
| `demo-plugin-seed.ts`、`workflow-feed-options.ts`、`feed-goal-promotion.ts` | 经公开动作（`services.actions.directory`，PG-027） | `feed-goal-promotion.ts` 现在直接构造 Feed 应用 |

### 1.2 Inbox 不是 `services.attention` 上的薄壳；场景与判断的真实调用面（2026-10-25 夜更正，统筹同日裁定选 A）

**更正的前提。** 本稿原写「`inbox-actions.ts`（71 行）的列表与状态来自 `FeedApplication`，实质是 Attention 条目，耦合只有两处」。读代码后不成立：`inbox-actions.ts` 只是壳，Inbox 的动作背后接着 ①Pages 生成（经动作，可行）②读材料时核对 Feed 事项与来源（`feed.getFeedItem/getSource`，以及两个宿主函数 `inspectSourceAuthorization`、`hydrateFeedItemContent`）③下一步判断场景（`createInboxSceneRuntime`）④内容动作（`feed.ensureInboxEntryForFeedItem/setInboxEntryStatus/flushPendingInboxJudgments`）⑤Home 事件处理。Feed 一侧同样有捕获场景、三个判断回调和 `linked-context.ts`。`PluginHostServices` 里**没有**场景客户端、判断账、Functions 绑定服务。

**统筹裁定（2026-10-25 夜）：选 A。** 跨插件的数据走 Feed 的公开动作，不进平台服务；平台本来拥有的事实（场景与判断账、Functions 绑定）各做一片平台服务（ac-platform 做），每片带安全不变量行与「拒绝」测试，只作用于调用方插件在自己 Manifest 里声明的场景与函数，不放宽任何边界；做不到不放宽时停下回统筹，由统筹问用户。不开「临时私路」例外（与 2026-10-18 同等待遇冲突）。本节给平台片的需求（1.2.6 的 P1–P4）。

#### 1.2.1 先分清：谁拥有什么

| 事实 | 现在在哪 | 主人 | 在 Runtime 里 |
| --- | --- | --- | --- |
| Feed 捕获场景的绑定（规则 → 判断函数） | Feed 的 `feed_out_rules`（`judgment_json`），`bind` 经 `saveOutRuleUpdate` 写 | Feed | 不变，仍在 Feed 自己的表里 |
| Inbox 下一步场景的绑定（项目 → 判断函数） | Functions 持有者的 `function_scene_bindings(scene_id, project_id)`（Home 库，`modules/functions/src/judgments.ts`），经 `actionSceneBinding/saveActionSceneBinding` | **平台（Functions）**；Inbox 只是消费方 | 需要平台服务（P3），或把这一行搬回 Inbox（见 P3 备选） |
| 判断账（每次判断的结果记录） | Functions 持有者的 `function_judgments`（Home 库），`recordSceneJudgment` / `latestSceneJudgments(projectId, sceneId)` | **平台（Functions）** | 需要平台服务（P2） |
| 已发布规则清单与 `functionKey` | `FunctionsService.list()`；`publishedFunctionKey(reference)` 是纯函数 | 平台（Functions） | **不需要服务**：Inbox 的 `readJudgment` 已用 `actions.discover` 过滤 `kind === "judgment"`，规则名取自发现到的动作的 `title`，`function_key` 由引用推出 |
| 场景的运行（`usages`/`runScene`/`bind`/`discoverScenes`/`targets`） | 内核 `ActionService`；宿主给每个项目一个 `ActionSceneClient`（`project-host.ts`） | 平台（内核） | 需要一个给插件用的场景客户端（P1） |
| 项目日志里的 `judgment/judgment_completed` 事件 | 宿主（`project-host.ts:194`）与 Feed 应用（`application.ts:317,376`）各写 | 写它的插件 | 各自的 `tx.journal`；全仓库没有读它的地方，无兼容问题 |

#### 1.2.2 Feed 捕获场景 `feed.capture@1`（场景与处理器都是 Feed 的；Runtime 已支持插件登记场景处理器：`contribution.action_scenes`）

`scene-provider.ts pluginSceneHandler` 给各方法的作用域：`bindings/availability/targets/prepare` 是**只读场景作用域**，`bind/consume/failed` 是**可写场景作用域**。

| 方法 | 读 | 写 | 作用域 |
| --- | --- | --- | --- |
| `bindings(caller)` | `outRules.list` | — | 只读 |
| `targets(caller)` | `outRules.list` | — | 只读 |
| `prepare(caller, {item_id, rule_id})` | `feed_items`（含证据正文，见下）、`outRules.list` | — | 只读 |
| `bind(caller, binding, options)` | `outRules.list` | `feed_out_rules` 一行（`prepareOutRuleUpdate` + `saveOutRuleUpdate(expected_revision)`） | 可写；项目库事务 |
| `consume` → `record` | `feed_items`、`outRules.list`、项目 Attention | ①判断账一行（Home 库，P2）②`ensureInboxEntryForFeedItem`（Attention 写；规则 `admission === "inbox"` 且结果为 `needs_review` 或建议 `inbox.admit`，且事项未被忽略）③日志事件 `judgment_completed`（`tx.journal`）④之后 `flushPendingInboxJudgments` 再触发 Inbox 下一步判断（1.2.4） | 可写场景作用域 |
| `failed` | 同 `consume` | 同 `consume`（`needs_review`、带错误码） | 可写场景作用域 |

**平台现状会拒绝 `consume`/`failed` 里的 Attention 与情境账写入。** `plugin-attention-service.ts` 的 `gate.write` 对 `"scene" in scope` 一律抛 `actions.forbidden`（「写入需要声明了这项权限的可等待并行动作」）；情境账同一道门；`plugin-action-dependencies.ts`、`plugin-notification-service.ts`、`connections-service.ts`、`plugin-agent-service.ts` 同样拒绝场景作用域。`project_database` 与 `tx.journal` 不拒场景（`plugin-database-partitions.ts`）。所以捕获场景第②项（入箱）今天在 Runtime 里写不进去 → P4。

捕获场景读证据正文（今天是 `hydrateFeedItemContent(feed.getFeedItem(...))`，正文是 Home 里的加密文件，宿主函数 `feed-content.ts`）：Feed 进 Runtime 后读自己证据正文的口，与 D6-1 的 `services.sourcePull`（写正文）和 FI-4 的 Home 引用账配对，**在 Feed 一侧的设计里解**，不进场景/判断的平台片，ac-platform 不用管（1.2.6 的「留在 Feed 一侧」第 2 项）。

规则页的判断选择（`createFeedSceneRuntime` 的 `selection`：`recommendations/catalog/preview/validate`）另用：`actions.discover(caller)`（过滤 `kind === "judgment"` 和 `subject_kinds`）、`scenes.discoverScenes(caller, reference)`、`scenes.usages(caller)`、`actions.invoke(caller, reference, {content})`（试跑一条判断函数）；以及读判断账 `latest(sceneId)`（P2）。

#### 1.2.3 Inbox 下一步场景 `inbox.next@1`（场景与处理器是 Inbox 的）

| 方法 | 读 | 写 | 作用域 |
| --- | --- | --- | --- |
| `bindings(caller)` | Functions 绑定表（P3） | — | 只读 |
| `targets(caller)` | 同上（含 `revision`） | — | 只读 |
| `prepare(caller, {entry_id})` | Attention 条目（`attention.get`）、条目指向的 Feed 事项含正文、来源 | — | 只读 |
| `bind(caller, binding, options)` | — | Functions 绑定表一行（`saveActionSceneBinding(projectId, binding, expected_revision)`，P3） | 可写场景作用域 |
| `consume` → `record` | 同 `prepare`（`checkedSubject` 再读一遍核对） | ①判断账一行（P2）②日志 `judgment_completed`（今天经 `feed.recordInboxJudgmentEvent`，实际是 `appendEvent`；Inbox 进 Runtime 后写自己的 `tx.journal`） | 可写场景作用域 |
| `failed` | 同上 | 同上 | 可写场景作用域 |

Inbox 的动作面另用（`createInboxSceneRuntime` 的 `ports`）：`readJudgment` = `actions.discover(caller)` + `scenes.discoverScenes(caller, ref)` + `scenes.usages(caller)`；`recommendations` = `scenes.usages(caller)` + `latest(sceneId)`（P2）+ 对每条重新 `resolve`；`writeJudgment` = `scenes.bind(caller, binding)`（停用时 `{...binding, enabled: false}`）；`evaluateJudgment` = `scenes.runScene(caller, inboxNextScene, bindingId, {entry_id})`（并发动作）。

#### 1.2.4 三个判断回调（`captureJudgment` / `inboxJudgment` / `homeJudgment`，Feed 应用在排队、在 `judgeOwn/flush` 里调用）

三者都是「`scenes.usages(caller)` 找出绑定，可用且启用就 `scenes.runScene(caller, 场景, bindingId, 事件)`，对一张固定的错误码表静默放过，其余再 `usages` 看绑定是否还在，不在也放过，否则抛」。差别只在场景是谁的：

| 回调 | 场景 | 事件 | 场景的主人 | 在 Runtime 里 Feed 怎样触发 |
| --- | --- | --- | --- | --- |
| `captureJudgment({project_id, item_id, rule_ids})` | `feed.capture@1`，每条规则一个 binding（`feed.capture:<rule_id>`） | `{item_id, rule_id}` | **Feed 自己** | Feed 用 P1 的场景客户端跑**自己的**场景 |
| `inboxJudgment({project_id, entry_id})` | `inbox.next@1`，binding `inbox.next:<project>` | `{entry_id}` | **Inbox** | 走 Inbox 的公开动作 `inbox.judgment.evaluate`（输入 `{entry_ids}`，已存在，`scheduling: "concurrent"`，要 `inbox:read` + `model:invoke`）；Feed 在 Manifest 声明可选依赖，不让 Feed 的场景客户端去跑别人的场景 |
| `homeJudgment({kind, id, project_id})` | `home.dock@1`，binding `home.dock:<project>` | `{kind, id}`，`kind ∈ feed_item / inbox_entry` | **平台（宿主）** | 走 `home.judgment.evaluate`（输入 `{subjects}`，1–20 件，已存在，`concurrent`），Feed 声明可选依赖 |

两处语义差要在实现里对齐（读代码得出，尚未用测试验证）：触发函数对「已完成或已忽略的条目」静默返回，而 `inbox.judgment.evaluate` 对非开放条目**抛** `actions.subject_unavailable`（`scene-runtime.ts evaluateJudgment`）；触发函数跑一个 binding 并容忍一串错误码，评估动作逐条跑并抛。Feed 一侧的触发器要在调用前自己过滤开放条目、并按同一张错误码表容忍。

后台生产者（来源同步、定时 tick）没有人的调用者：今天宿主给 `workflow-events` 身份和固定权限（`workflow-feed-options.ts`）；Runtime 里是 Feed 的安装身份，它要调用得了这两个动作，即 Manifest `consumes`、权限，以及动作的 `audiences` 含 `plugin`。这一块归 Feed 一侧（1.2.6 第 1 项）。

#### 1.2.5 `ContextMaterializationApi`：不需要平台服务

`linked-context.ts` 的 `readLinkedFeedContext` 只做一件事：以一个 Goal 为根，取 `feed.goal` 类型的**入边**、深度 1，再逐个读事项。这正是 Feed 自己的边：`FeedLedgerPort.list(projectId, {type: "feed.goal", target: <goal>})`（`FeedGoalLinks.find` 已经在做），不需要图遍历。所以去掉 `createContextMaterializer`，直接用 `goalLinks.find(goalId)` + `getItem`；Goal 本身由 `services.actions` 调 Goals 的 `contract` 动作取（今天就是这样取的）。**无平台件。**

#### 1.2.6 给 ac-platform 的需求（P1–P4）与留在 Feed 一侧的事

| # | 平台件 | 必须做到的调用面（签名） | 读写什么，在什么事务里 | 约束（统筹的口径） |
| --- | --- | --- | --- | --- |
| **P1** | 给插件的场景客户端 `services.scenes`（Manifest 声明权限；场景要先在 Manifest `action_scenes` 里声明） | `usages(judgment?): Promise<Array<ActionSceneBinding & {availability}>>`；`runScene(scene: {scene_id, version}, bindingId, event): Promise<unknown>`；`bind(binding, options?: ActionSceneConfigureOptions): Promise<void>`；`discoverScenes(judgment?): ActionSceneView[]`；`targets(judgment?, selection?): Promise<ActionSceneTarget[]>`。调用者一律取当前 Runtime 动作的调用者（同 `services.actions` 的绑定调用，插件传不进调用者）。 | 不写项目库；`runScene` 走内核 `ActionService.runScene`，场景处理器的 `consume/failed` 在可写场景作用域里跑（见 P4）；`bind` 经场景处理器写。 | **只作用在调用方插件自己在 Manifest 声明的场景**（`scene_id` 不在自己声明里 → 拒绝）；调用者权限只减不增；判断函数与场景的兼容性、提供方身份、`validate_authority`、`beforeEffect` 全沿用内核现有检查，一条不放宽。要 SI 行与拒绝测试：别人的场景被拒、无声明被拒、调用者撤权后被拒。 |
| **P2** | 判断账 `services.judgments`（或并进 P1 的 `services.scenes.judgments`） | `latest(sceneId): JudgmentRecord[]`（等价 `latestSceneJudgments(projectId, sceneId)`，项目取自调用，每个主体只给最新一条）；`record(input): JudgmentRecord`（等价 `recordSceneJudgment`，输入见 `RecordJudgmentInput`：`function` 引用、`subject{kind,id,project_id}`、`scene_id`、`scene_provenance`、`outcome`、`suggested_behavior_ids`、`error_code`；`function_key` 由平台从 `function` 推出，插件不传） | 写、读 Home 库的 `function_judgments`（Functions 持有者的表；**不在项目库事务里**，是另一个 SQLite 文件，不能与 `tx` 合一次提交）。`consume` 里的顺序：先 `record`，再写项目库（入箱、日志）；项目库一步失败时判断账那一行已经落了。这与今天一致（今天也是 Home 库先写、`recordCaptureJudgment` 在后），不是新退步，但设计稿不再声称原子。 | 只许读写**自己声明的场景**的判断（`scene_id` 必须是调用方 Manifest 声明的场景）；`subject.project_id` 取自调用，不接受别的项目；`record` 要求调用在可写作用域（`consume/failed` 或可写并发动作），并走 `beforeEffect`。SI 行加拒绝测试：别的场景、别的项目、只读调用。 |
| **P3** | Functions 绑定（仅 Inbox 这类「绑定存在 Functions 表里」的消费场景） | `binding(sceneId): ActionSceneBinding \| null`（等价 `actionSceneBinding(sceneId, projectId)`，含 `revision`）；`saveBinding(binding, expectedRevision?: string \| null): ActionSceneBinding`（等价 `saveActionSceneBinding`；`revision` 过期 → `functions.conflict`） | 读写 Home 库 `function_scene_bindings`；单行乐观并发，不在项目库事务里。 | 只许对自己声明的场景读写；项目取自调用。**备选（请 ac-platform 或统筹定）：把 Inbox 的绑定搬进 Inbox 自己的项目表。** 它是 Inbox 的事实，放在 Functions 表里是历史遗留；这样 P3 不需要，代价是一次维护：把 `function_scene_bindings` 里 `scene_id = 'inbox.next'` 的行搬走，同时核对 Functions 的 `declared-rules.ts:119`（卸载规则时清绑定）与首页 dock 的读取。**我的推荐是备选**（少一个平台服务、事实回到主人），但这是你们的地盘，我不替定。 |
| **P4** | 场景可写作用域里的 Attention 与情境账写入 | 不是新 API：放开 `plugin-attention-service.ts`（及情境账）`gate.write` 对 `"scene" in scope` 的一刀切拒绝，改为：场景**声明了**该权限（场景定义的 `permissions`/`configuration_permissions` 含 `attention:write`）、作用域是可写的（`!read_only`），且 `ActionSceneExecutionContext.beforeEffect()` 已在写前过过 | 写进插件当前的项目库事务（`project_database.transaction(beforeEffect, tx => attention.join(tx, …))`，与插件自己的行同一次提交）；场景作用域里这个事务目前已经允许（`plugin-database-partitions.ts`）。 | 不放宽：没声明的场景仍拒；`bindings/prepare/targets/availability`（只读作用域）仍只读；SI 行加拒绝测试：只读场景回调写被拒、未声明权限的场景被拒、撤权后被拒。**若发现必须放宽（比如要让场景不声明权限也能写），停下回统筹。** |

**留在 Feed 一侧、不是平台片的事（我做）：**

1. 后台生产者（来源同步、定时 tick）触发判断的调用者身份与权限：Feed 的安装身份调 `inbox.judgment.evaluate`、`home.judgment.evaluate` 所需的 Manifest `consumes`、权限与动作 `audiences`，以及两张错误码容忍表。
2. 证据正文读口，以及 `hydrateFeedItemContent`、`inspectSourceAuthorization` 的去处：Feed 把它们声明成公开动作（来源授权由 Feed 用 `services.connections` 自核），Inbox 在 Manifest `consumes` 里声明、经 `services.actions` 调；平台不认识 Feed 的证据内容。
3. Inbox 的 `ensure/reopen/flush`：Feed 的公开动作（添加到 Inbox、重开、冲刷判断），加上 D6-4 的 `feed.items.admission`。
4. `linked-context.ts` 去掉材料化器（1.2.5）。

**顺序。** 提交 3（Inbox 进 Runtime）和 4（Feed 进 Runtime）依赖 P1、P2、P4（以及 P3 或其备选）落地；落地前我做：Feed 一侧的公开动作（上面第 2、3 项）、tick/互斥、维护夹具（RAC-514）。

### 1.3 已核对为「现成」的平台件

`PluginHostServices`（`plugin-host-services.ts`）已有：`project_database`、`attention`、`contextLedger`（S9-0b，已进 main）、`background`、`scheduler`、`artifacts`、`processItems`、`connections`、`materials`、`model`、`notifications`、`events`、`dependencies`/`directory`/`actions`（PG-027）、`ownerFiles`。**没有**：网络访问、文件/正文存储、密钥读取（密钥只给引用）、锁，以及场景客户端、判断账、Functions 绑定（见 §1.2.6 的 P1–P3）。

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

**已做（RAC-510，统筹 10-27 批方案 A，暂定 S-100）。** 成果服务加了与 `services.attention.join` 同一机制的 `join(tx, write)`（`apps/local-host/src/plugin-artifact-join.ts`）：成果库就在插件写事务所用的那条项目库连接上，成果版本是这次事务里的一个保存点，和 Feed 自己的行一起提交或一起回滚，日志事件也写在同一个事务里。

- **认权**：`join` 和写入器的每一次 `head`、`publish` 都问 attention 用的同一道门（`gateFor`，S-68）：安装仍在跑、持有 `artifact:write`，原调用方当前有效，动作是声明了 `artifact:write` 的并发动作。被取消、撤权、停用、替换的调用拒绝本身，不算捕捉失败；事务结束后留下的写入器、别的安装的事务、在别的安装的动作里借来的 `join` 都拒为 `actions.forbidden`。
- **身份**：产出者（插件 id、版本、发布者签名）由平台照 Manifest 盖，作者是原调用方，项目与范围也是平台的，输入里给了也不认；类型不在 `produces` 里拒为 `artifacts.plugin_incompatible`。
- **Feed 一侧**：`FeedArtifactProducer` 只剩 `capture(projectId, write)`，Runtime 端口经 `join` 绑到这一次的事务上；宿主常量 `FEED_ARTIFACT_PRODUCER` 删除，离线演示库也改用同一个写入器（不再有 `registerVersion:`）。捕捉时只有调用本身被拒的五个平台码（`actions.cancelled`、`actions.forbidden`、`actions.plugin_unavailable`、`actions.expired`、`plugin.grant_denied`）和取消（`AbortError`）往上抛、整次提交回滚；其余错误照 main 接住，记成事项的 `artifact_out_failed`（没有码的记 `feed_artifact_register_failed`），事项照常入库。
- **动作权限**：会跑捕捉规则的 6 个动作（`feed.sources.sync`、`feed.sources.tick`、`feed.notifications.receive`、`feed.content.receive`、`feed.rules.evaluate` 与唤醒）多声明 `artifact:write`，调用方要持有它；不留兼容期。`feed.content.receive` 另补 `attention:write`（FI-C-08，见 §13）。
- **存量**：main 上 Feed 的成果以宿主常量的身份记（`native:feed`、版本 `0.0.0`），改到 Feed Manifest 名下是真实 Home 维护，登记在 `docs/releases/CHECKLIST.md` 的 R-69，没做。

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

## 6. 验收（暂定号：RAC-499、500、506～518）

| 编号 | 内容 |
| --- | --- |
| RAC-499 | Feed、Inbox 经 Plugin Runtime 装配：`BUILD_TIME_ASSEMBLED` 无这两项，监督器有两个条目，两个包只 import `contracts` 与 `plugin-sdk`；所有 Feed、Inbox 动作的提供方是 Runtime 安装身份，不是宿主 |
| RAC-500 | 存储只经 `project_database`：Feed 代码没有原连接；受检客户端拒绝 Feed 对未声明表的语句（对 `goals_*` 表写被拒）；Feed 被项目库拒绝时只停 Feed |
| RAC-506 | Attention 经 `services.attention`：条目与事项在同一事务（在事项写入后、条目写入前让事务失败，两者都不存在）；条目 owner 是 Feed；Inbox 只能 `setStatus`，`create/deleteSubject` 被拒；`exists` 回调与 #1245 的 `owner_plugin_id = null` 直写路径已删 |
| RAC-507 | 情境账经 `services.contextLedger`：`feed.goal` 边带命名空间；别的插件读不到、写不了 Feed 的边；维护后「事项关联 Goal」原样可见 |
| RAC-508 | 日志经 `tx.journal`：Feed 的新事件名带命名空间，Feed 读不到别的插件的事件；不能以别人的名义写 |
| RAC-509 | 提交前再认权：模型返回后、`beforeEffect()` 前把调用取消、撤权、停用，各自之后 Feed 不写事项、条目、情境账、日志、失败记账；处理器开始前就被拒的，只留一行「未执行」诊断行 |
| RAC-510 | 成果经 `services.artifacts`：`feed.capture` 写入成功，与捕捉它的事项同一次提交，产出者是 Feed 的 Manifest、作者是调用方；写未声明的类型被拒；调用在提交前被取消、撤权时事项与成果都不留；成果库拒的记 `artifact_out_failed`，调用本身被拒的往上抛；Feed 代码无 `projectVersionStores`、无 `as unknown as ArtifactsSqliteDatabase` |
| RAC-511 | tick 由平台以 Feed 安装身份唤醒：Feed 没装或停用的项目没有 tick；`web-project-schedulers.ts` 无 Feed 调用 |
| RAC-512 | 来源互斥：同一来源同时第二次同步被拒；不同项目同名来源互不影响；`feed-source-sync-lease.ts` 已删；崩溃后的中断运行被恢复 |
| RAC-513 | 平台通知落点（按 D6-1、D6-2 裁定）：通知能到 Feed，Feed 没装时不写别处也不丢 |
| RAC-514 | 存量维护演练：v10 夹具库经维护后按 v11 打开，Feed、Inbox 经公开动作读到的结果与维护前逐项相等（含事项关联的 Goal、未完成条目）；不认识的主体类型保持无主并列报告；没维护的库被拒 |
| RAC-515 | Inbox 对 Feed 的依赖只经公开动作：重开被忽略事项的条目被 Feed 的动作拒；Feed 没装时条目仍列出、重开被拒并说明 |
| RAC-516 | `createLocalFeedApplication` 与 8 个宿主构造点已没有（门禁：宿主无此符号）；演示数据、工作流选项、Goal 提升都经公开动作 |
| RAC-517 | 同等待遇：Feed、Inbox 的定义没有宿主私有 import；`registerProvider(` 里没有这两个提供方；外部插件用同一批 SDK 件能写出同样结构 |
| RAC-518 | `inbox.next` 的绑定是 Inbox 自己的行（`inbox_scene_bindings`，Manifest 声明 `databases.project` 与 `storage:private`）：读回带修订号；按读到的修订号才能替换，旧修订与「已有绑定时再新建」都是 `inbox.revision_conflict` 且什么都不改；只存绑定的字段；别的项目的行不是本项目的。存量维护（`tests/fixtures/inbox-binding-maintenance.mjs`）把项目的绑定连修订号一起从 Functions 库搬到项目库，Home 的 dock 与别的项目的行不动，重跑无变化，新表不在或项目库已有另一份绑定时整笔不写；场景客户端的端到端见 `inbox-action-scenes`、`functions-scene-configuration` |
| RAC-1010 | Manifest 的 `notifications.receive` 只能指向自己声明的、只给 `workflow` 受众的 command；多余字段、别的受众、别的操作、未声明的动作都被拒（`security-invariants-plugin-notification-delivery.test.ts`，4a） |
| RAC-1011 | 平台的通知队列：同一发送安装、世代与键是同一条通知；没有接收方时留着不算失败，接收方出错留着并记错误码，成功后只交一次、释放正文，键仍算用过 |
| RAC-1012 | 项目里没有 Feed 时通知留在队列、不写别处；Feed 加进项目、项目重新打开后交到 Feed（来源用发送方的名字，进 Inbox） |
| RAC-1013 | 接收方动作只认平台的通知身份：别的工作流身份、人、Agent 调它都被拒，伪造的通知不进 Feed |
| RAC-1014 | 首页 dock 判断对插件的可达性（`home.judgment.evaluate@1`，测试用真实的项目 Home 与一个自己的 Runtime 插件）：插件没有 dock 所推荐动作的权限（Inbox 状态动作的 `inbox:write`、`attention:write`）时 dock 对它不可用（`actions.binding_invalid`），什么都不读不判；没有场景的模型权限（`model:invoke`）时不会碰到模型；默认规则不覆盖的 Feed 事项被 `actions.subject_incompatible` 拒；入箱条目要经 Inbox 去读背后的 Feed 事项，而这是委托（S-43）：调用者是插件自己的授权时，委托仍是它自己的调用（用户 2026-10-26 定 A），用它自己的授权读到 Feed 事项，判断做出并记账（`outcome: ok`）；委托不放大，见 S-43 的两条拒绝用例 |
| RAC-1015 | Feed 一侧的首页判断触发器（`feedHomeJudgmentTrigger`，经 `home.judgment.evaluate`）：dock 没有绑定规则、或对该调用者不可用，静默放过；规则不覆盖的事项、绑定或提供方变了、事项变了等同一张错误码表静默放过；这些之外的失败在 dock 仍可用时照抛，不被吞掉；dock 覆盖的入箱条目被判断并记账；事件的项目与触发器的项目不一致是 `actions.scope_mismatch` |

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
- **决定记录：§1.2 的前提改了（统筹 2026-10-25 夜裁定选 A）。** 原前提「Inbox 是 `services.attention` 上的薄壳、与 Feed 只有两处耦合」不成立（见上一条与新 §1.2）。裁定：①跨插件的数据（证据正文、来源授权、`ensure/reopen/flush`、准入检查）走 **Feed 的公开动作**，Inbox 在 Manifest `consumes` 里声明、经 `services.actions` 调，不进平台服务（Feed 的一侧，我做）；②平台本来拥有的事实各做一片平台服务（场景客户端 P1、判断账 P2、Functions 绑定 P3 或把 Inbox 的绑定搬回 Inbox、场景可写作用域的 Attention/情境账写入 P4），ac-platform 做，签名与事务边界见 §1.2.6；每片带 SI 行与拒绝测试，只作用于调用方在自己 Manifest 声明的场景与函数，不放宽边界，做不到不放宽就停下回统筹；③不开「临时私路」例外（与 2026-10-18 同等待遇冲突）。`ContextMaterializationApi` 不需要平台件（§1.2.5）。提交 3、4 等 P1/P2/P4 落地；之前做 Feed 公开动作、tick/互斥、维护夹具。
- **Feed 给 Inbox 的公开动作已做（`plugins/native/feed/src/inbox-actions.ts`，4 个新动作，动作快照已刷新）。** `feed.items.admission`（D6-4，只读：事项能不能进入或重新进入 Inbox，已忽略则不能；找不到事项抛 `feed.item_not_found`，比今天「事项不存在则放行」更严）、`feed.items.material`（只读：来源仍然有效、没被忽略、检查期间事项和来源没变、有正文；`inspectSourceAuthorization` 与 `hydrateFeedItemContent` 的去处，由 Feed 的端口 `authorize`/`hydrate` 提供，宿主模式接 `inspectSourceAuthorization`，Runtime 模式接 `services.connections`）、`feed.briefs.read`（只读：按编号给事项标题与来源名，用于 Inbox 列表与搜索，不含正文）、`feed.items.admit`（命令：加入并必要时重开，再冲刷这条判断；受众只有 `workflow`，因为 Inbox 经 `actions.directory` 替工作流调用，目标看到的受众就是 `workflow`；`added_by` 由 Feed 从可信的调用受众得出，不再由 Inbox 传）。三个只读动作受众 `user/agent/workflow/mcp`，因为 Inbox 经 `invokeQuery` 以原调用者的受众发问，Inbox 自己的动作就是这四个受众。`inbox-admission.ts` 的 `admitToInbox`、`isIgnored` 是「加入并必要时重开」与「已忽略」的唯一定义，`FeedApplication.addToInbox`、`assertNotIgnored` 与这几个动作共用（`FeedApplication` 是巨大单元，不加方法）。**Inbox 还没改用它们**：宿主的 `inbox-actions.ts` 仍直接调 `FeedApplication`，提交 3（Inbox 进 Runtime）时一起换，并在 Inbox 的 Manifest 声明 `capabilities.consumes` 与 `actions:delegate`。验收：`tests/feed-inbox-actions.test.ts`（RAC-515 的 Feed 一半；Inbox 一半——Feed 没装时条目仍列出、重开被拒并说明——随提交 3）。
- **来源互斥的 Feed 一半已做。** `createFeedSourceSyncLease()`（`source-sync-lease.ts`）：实例内的 `Map<(项目,来源), 令牌>`，第二次同步被拒（`feed.source_sync_interrupted`），重复的释放不会放掉后来那次拉取的占用；宿主的 `feed-source-sync-lease.ts` 已删，`feed-source-service.ts` 里只剩「哪个库文件用哪一份」的登记，不再自己记占用。「新旧实例并存的窗口里互斥是否靠 `feed_source_runs` 兜得住」仍未验证，留到提交 4（Feed 进 Runtime）。tick 的唤醒动作 `feed.sources.tick` 早已存在，改成由平台定时钟以 Feed 安装身份唤醒（Manifest `background.wakeups`）要等 Feed 进 Runtime，在提交 4。验收：`tests/feed-source-sync-lease.test.ts`（RAC-512 的实例一半）。
- **维护夹具已做（RAC-514 的库一半）。** `tests/fixtures/project-maintenance-v11.sql` 在 FI-5 的那一次里多做两件：`inbox_entries` 与 `attention_events` 里没有 owner 的行按主体类型写上 owner，`context_edges` 里 `feed.goal:` 开头的键加上 `io.molis.work.feed:`；多两条核对（没有任何条目已有 owner、账本里没有已加前缀的键，否则整笔回滚）。日志历史不改写。`tests/project-maintenance-v11.test.ts` 新增两个用例，第一个用例的断言按实际改动收窄到「除这三张表外每行不变」，v8、v9、v10 的维护链用例照旧通过。CHECKLIST 两行已同步。**还没做、要随提交 3 一起做**：Goals 的 `GoalDecisionAttentionSync`（`plugins/native/goals/src/goal-decision-attention.ts`）今天创建和结算的都是 owner 为 null 的条目，维护把 Goal 决定指给 Goals 之后它必须带 `owner_plugin_id: Goals` 创建、按 Goals 查找与结算，否则会在旧条目之外又建一份无主的；而宿主里的 Inbox 在提交 3 之前只列 owner 为 null 或 Feed 的条目，所以这处 Goals 改动要和 Inbox 改成列全部 owner 的条目同在提交 3，不单独先做。这是和 Goals S9-2（它的维护也要给条目归属）的重叠，PR 说明里单独写。
- **维护范围里「不认识的主体类型」不会出现。** Attention 的 `inbox_entries.subject_type` 有 CHECK 约束，只有 `feed_item`、`goal_decision`、`source_fault` 三种（`modules/attention-resumption`），所以 §3.5 第 1 项的归属表是完整的：`feed_item`、`source_fault` → Feed，`goal_decision` → Goals，没有留作无主的。
- **统筹 2026-10-25 夜对 §1.2.6 的裁定。** ①P1（场景客户端）、P2（判断账）交 ac-platform，从 §1.2.6 起手。②P3 按本稿推荐的备选：`inbox.next` 的绑定搬进 Inbox 自己的表，Inbox 一侧做，排在 Feed 公开动作之后；因此平台不做 Functions 绑定服务。③P4（场景可写作用域里放开 Attention 与情境账写入）是放宽安全边界，统筹弹窗问用户，答复前提交 3、4 里依赖它的部分不动（场景 `consume/failed` 里的入箱与情境账写）。④我的顺序：Feed 公开动作 → tick/互斥 → 维护夹具 → P3；前三项已完成（提交 02b06f430、c78e437c7），tick 的唤醒部分随 Feed 进 Runtime（提交 4）。
- **P3 已做（RAC-518）。** `inbox.next` 的绑定不再在 Functions 库的 `function_scene_bindings` 里，而是 Inbox 声明的项目库表 `inbox_scene_bindings`（`plugins/native/inbox/src/database.ts`、`scene-bindings.ts`；`InboxSceneBindings.get/save`，`save` 的第三个参数：不给就替换，`null` 只在没有时新建，字符串要等于当前修订号）。宿主里的场景（`inbox-scene.ts`）的 `binding`、`saveBinding` 读写这张表，不再调 Functions 的 `actionSceneBinding`；乐观并发的冲突码是新增的 `inboxErrors.revision_conflict`（`inbox.revision_conflict`，类别 conflict；contracts 快照已刷新）。三处后果：①Functions 对这个场景的绑定记录没有了，卸载 Inbox 不留数据时清理改由项目库里 Inbox 自己的表随插件库一起走（`forgetDeclaredRules` 不再碰 Inbox 的行）；②删除项目时这行随项目库一起没有（`ON DELETE CASCADE` 于 `project_root`）；③存量项目库里的绑定要在维护窗口搬一次（`tests/fixtures/inbox-binding-maintenance.mjs`，CHECKLIST 里有一行，与 v11 同一个窗口，先停宿主、先备份）。测试：`inbox-scene-bindings.test.ts`、`inbox-binding-maintenance.test.ts`，既有的 `inbox-action-scenes`、`functions-scene-configuration` 改为经 Inbox 的绑定读写。
- **P4 用户已定（统筹 2026-10-25 夜转达）：有条件放开。** 场景可写作用域里允许写 Attention 与情境账，条件是三条同时满足：场景自己在声明里写了这项写权限、作用域本身可写（`bind/consume/failed`）、写之前的 `beforeEffect` 已经过；满足才许写，并且并进这一次的项目事务，不另开提交。这一片交 ac-platform，叠在 `claude/ac-platform-scenes` 上，与 P1（场景客户端）、P2（判断账）一起做。提交 3、4 里依赖它的部分（场景 `consume/failed` 里的入箱与情境账写）等这三片落地后接上；那之前这些部分仍不动。
- **第 3 步（Inbox 进 Plugin Runtime）已做（2026-10-26）。** `createInboxPlugin()`（`plugins/native/inbox/src/plugin.ts`）在登记上写 `project_runtime`，`BUILD_TIME_ASSEMBLED` 去掉 `inbox`；宿主的 `inbox-actions.ts`、`inbox-scene.ts` 删；`inboxJudgment` 触发器改为调 Inbox 自己的动作 `inbox.judgment.evaluate`（`plugins/native/inbox/src/judgment-trigger.ts`）。条目读写经 `services.attention`，绑定行经 `project_database`，场景与判断账经 `services.scenes`、`services.judgments`，Feed 与 Pages 的事实经动作目录（`actions:delegate`）。`inbox-native-plugin-http.ts` 当时仍是页面路由的薄转发（FI-7 已删，见下），加了「项目没有 Inbox 就答 `actions.plugin_disabled`」。
- **取舍一：场景回调里没有动作作用域，目录不可用。** Feed 条目的正文由 `inbox.judgment.evaluate` 先经 `feed.items.content`（新动作，只读，不查来源是否可用）读到，用插件内的 `AsyncLocalStorage` 交给这一次 `runScene` 的 `prepare/consume`（`withStagedFeedContent`）；没有动作启动的回调拿不到正文，对 Feed 条目答 `actions.subject_unavailable`。所以**宿主或别的调用者直接 `runScene` 一个 Feed 条目的 `inbox.next` 不再可行**，唯一入口是 `inbox.judgment.evaluate`。评估返回前再读一次条目与正文，变了答 `actions.subject_changed`（判断已记账，但 `recommendations` 比对的是条目内容，对不上就永远不会被采纳）。写账前先跑发起动作自己的 `validate_authority`，所以撤权的动作不记账。
- **取舍二：可选规则只含「工作流受众看得见」的判断动作。** 目录调用以工作流受众运行（2026-10-20 用户定），原先是调用者自己的受众；`audiences` 里没有 `workflow` 的判断动作不再出现在 Inbox 的规则选择里。
- **取舍三：调用者要有的权限变多。** `inbox.entry.status` 要 `attention:write`（写 Attention 的闸门看动作声明），且变成并行动作；`inbox.judgment.evaluate`、`recommendations` 要 `feed:read`；`inbox.content.receive` 的写权限里加 `feed:read`；场景 `inbox.next` 的 `permissions` 加 `judgments:write`，所以 `scenes.enable:inbox.next` 与绑定它的调用者都要这一项（动作快照 `host-actions.tsv`、`scenes.tsv` 已刷新）。`INBOX_ACTION_PERMISSIONS` 与宿主触发上下文已补；MCP 客户端与别的页面调用者按各自授权另给。
- **错误码有变。** 过期版本由 Attention 答 `attention.revision_conflict`（原 `feed.revision_conflict`）；被忽略的 Feed 消息重开答 `inbox.invalid`（原 `feed.invalid_transition`）；找不到条目仍是 `inbox.entry_not_found`。Feed 没装时：条目照常列出（名字缺），重开被拒并说明（RAC-515 的 Inbox 一半）。
- **委托调用保留发起它的那个动作的受众（合同加一个字段）。** 目录把嵌套调用改成工作流受众，Feed 凭受众记「谁交进来的」（`hand-in-sources`、`added_by`），人经 Inbox 交内容会被记成工作流。`ActionCallContext` 新增只读的 `delegated_audience`（只在 `delegated_by` 同时出现，只用于归属，不授权）：它是委托插件**正在跑的那个动作**被调用时的受众，不沿链往上追——人直接调 `inbox.content.receive` 是 `user`（记 `web_user`），工作流程交接经 Workflows 委托到 Inbox 再委托到 Feed 是 `workflow`（记 `workflow`）。Feed 的两处归属读 `caller.delegated_audience ?? caller.audience`。W4-6-05 的测试（`tests/content-station-request-id.test.ts`、`tests/workflows-plugin.test.ts`）通过。
- **Attention 的 owner。** 宿主装配的 Feed 把条目 owner 记成 Feed（`feedOwnedAttention`），因为 Runtime 的 Inbox 只列有 owner 的条目；Goals 的决定提醒条目 owner 记成 Goals（`GOALS_PLUGIN_ID`），与 Goals S9-2 的搬迁重叠，谁后合谁对齐。无主的存量条目在 v11 维护前不可见，没维护的库照旧被拒。
- **测试。** 重写：`inbox-action-scenes`（规则选择经动作、判断经 `inbox.judgment.evaluate`）、`feed-inbox-scene-runtime`（Inbox 一半改在新的 `createInboxSceneRuntime` 选项上，并补「没有动作启动的回调不判断」）、`functions-scene-configuration`、`goal-decision-attention`；其余改的是调用者权限、项目要启用 Inbox、Runtime 插件移除后动作不再登记（`actions.missing`）。
- **`feed.items.admit` 的受众加 `user`。** 目录调用沿用发起者的 `allowed_actions`，而人的网页上下文只列「用户受众看得见」的动作，只给工作流受众的动作永远走不到：Workflows 交接 → Inbox 收下 → 去 Feed 入箱会答 `actions.dependency_missing`。所以入箱命令的受众是 `user`、`workflow`（人自己「加入 Inbox」本来就能在 Feed 页面做，没有放宽能做的事）。这是平台层的一个缺口（只给工作流受众的动作，经人发起的插件委托到不了），这里不改规则，只改这一个新动作的声明。
- **Inbox 读 Feed 要有 Feed 的授权，MCP 客户端也一样。** 事项名字走 `feed.briefs.read`，判断的正文走 `feed.items.content`：MCP 客户端只授权 Inbox 的动作时，事项照常列出但没有名字（`inbox.home.events` 的来源标签退回「Feed」）；`inbox.judgment.evaluate` 在声明里写了 `required_actions: [feed.items.content]`，授权它必须一并授权正文动作（授权页会说「此能力还要同时授权」），而不是调用时才答 `actions.dependency_missing`。`tests/home-mcp-actions.test.ts` 按这个口径授权。
- **场景判断记账前的发起动作复核用精确引用。** 复核发起动作自己的授权时，传的是调度器解出的 `current_action`（带提供方），不是裸的动作定义：MCP 的授权比较要求提供方一致，裸引用会被当成已撤销。
- **Inbox 的判断触发器搬进插件包。** `inboxJudgmentTrigger`（`plugins/native/inbox/src/judgment-trigger.ts`）由包导出，宿主不再有以 `inbox-` 命名的触发器文件。
- **门禁：混合插件检查（FI-7 的 Inbox 一半已变绿）。** 「hybrid plugin inbox host-files 0 → 1」曾是 `inbox-native-plugin-http.ts` 这层薄转发（D6-5）；FI-7 的 Inbox 一半把它删了，`NATIVE_PLUGIN_HTTP_FILES` 里 `inbox` 条目同时去掉（名单只许减少，剩 `alchemist`、`artifact`、`feed`）。`docs/system/SECURITY-INVARIANTS.md` 的编号序缺口（S-85～S-87）来自与 ac-platform 合并时的编号，等 ac-trust 的批落地后补齐，不是这一步引入的。
- **FI-7 顺带修的一个平台缺陷：依赖环的守卫按调用上下文分开（`packages/kernel/src/action-service.ts`，共享核心）。** 第 3 步起 Inbox 的 `inbox.pages.generate` 经动作目录调 Pages（同样是 Runtime 插件的动作），页面上「整理成文稿」答「能力之间存在循环依赖」：目录的委托调用发现可用动作时，读 `inbox.pages.generate` 的依赖，Pages 动作的可用性检查要复核委托调用者的授权，那就是回头检查 `inbox.pages.generate` 自己的当前授权——同一个动作换了一个上下文再读一遍它的依赖，原先按 `[项目, 能力, 版本]` 一把键记「正在读依赖」，把这次复核误判成环。现在「正在读依赖」按调用上下文各记各的（`WeakMap<ActionCallContext, Set>`），沿着声明的依赖边走仍是同一个上下文，真环照旧被拦（`tests/action-dependencies.test.ts` 原有的环用例仍过），换上下文的复核不再误判；`tests/action-dependencies.test.ts` 新增一条钉住它，撤掉修复就红。授权没有放宽：复核照做，只是不被误拦。
- **测试里要知道的两点。** Runtime 插件的场景和动作在项目打开后异步挂上，刚打开就 `sceneClient(...).bind()` 会赶在 Inbox 起来之前答 `actions.scene_missing`；测试先调一个 Inbox 自己的动作（`inboxActions.readJudgment`）再绑（`capabilities-page`、`inbox-current.e2e`）。直接用 `AttentionModule` 的测试要带上条目的 owner（Feed 的条目 owner 是 Feed，见上）：`attention-atomic-effects`。
- **页面字节（`pnpm page-assets:check`）：`/assets/molis-work-workbench.js` 涨 35 字节**（1,129,446 → 1,129,481）。原因：Inbox 的请求路径从 `/api/inbox` 变成 `/api/plugins/io.molis.work.inbox`（多 22 字符），客户端用一个常量 `inboxApi` 复用，已是最省的写法；舞台片段路径 `/api/stage/inbox` 比旧的 `/api/inbox/workbench` 短 4 字节。没有别处可省，等统筹审定后按 `APPROVED_CEILINGS` 一次性放行（本片没改它）。
- **FI-7 的 Inbox 一半已做（2026-10-26）。** 删 `apps/local-host/src/inbox-native-plugin-http.ts` 与 `index.ts` 的导出。Inbox 的页面请求改成插件自己的路由：Manifest 声明 `routes`（`inbox.list GET /entries`、`inbox.entry.status POST /entries/:entry_id/status`、`inbox.pages.results|generate GET|POST /pages`、`inbox.judgment.read|write GET|POST /judgment`、`inbox.judgment.evaluate POST /judgment/evaluate`），`createInboxPlugin` 返回对应的 `routes` 绑定，处理器（`route-handlers.ts`）只把 HTTP 转成插件自己的动作，经 `own.invoke(定义, 输入, request.execution)` 以发请求的人的权限跑；服务在 `/api/plugins/io.molis.work.inbox/<路径>`。`routes.ts` 缩成类型。舞台 HTML 片段不是 JSON，Runtime 的路由层只回 JSON，所以宿主多一个通用的 `GET /api/stage/inbox`（`plugin-stage-fragment-http.ts`，按「Inbox 已启用」放行，渲染 Inbox 的 UI contribution），不以插件命名文件；它是平台路由，Feed 一半做完后 Feed 的舞台片段走同一条（`/api/stage/<插件>`）。客户端 `navigation-inbox.ts`、`events-secondary.ts` 的 `/api/inbox*` 改到新路径。`scripts/check-package-boundaries.mjs` 的 Inbox 规则改成「Host 没有 `/api/inbox`、Manifest 声明 `routes`」。测试：`inbox-plugin`、`desktop-tui`、`home-offers`、`live-product-integration`、`long-content-viewport`、`project-user-journey`、`web-route-table`（要启用 Inbox 才有路由，快照里 `inbox_*` 的键换了名并多一个 stage 探针）、`list-silent-refresh`、`feed-inbox-schedule-error-model`（Inbox 现在和 Schedule 一样是 Runtime 边，普通 Error 映射成通用文案）、`inbox-native-plugin` 按新路径改。`tests/fixtures/inbox-http.ts` 是这些测试共用的、把请求交给 Inbox 路由的小夹具。

- **第 4 步 4a 已做：平台通知接收方（D6-2，2026-10-26）。** 合同：`PluginNotificationReceipt.item_id` 换成 `notification_id`；`PluginNotificationDelivery`、`PluginNotificationDeliveryReceipt`、`PLUGIN_NOTIFICATION_DELIVERY_ACTOR`（`platform-notifications`）、Manifest 字段 `notifications.receive`（SDK `notification-declarations.ts` 检查）。平台：`plugin_notifications` 表（`plugin-runtime` 的 `notification-queue.ts`，进项目库基线 v11，`project-maintenance-v11.sql` 里为 v10 的库建表）；`plugin-notification-service.ts` 只在发送方事务里入队，`plugin-notification-delivery.ts` 提交后找项目里声明了接收的插件（内置登记的与已装的 Manifest），以工作流受众 + 平台通知身份调它，没有接收方（`actions.missing`/`plugin_disabled`/`dependency_missing`/`unavailable`）留着，别的错误记码留着，成功标已交并清掉正文；每次交付和项目打开时 `flush`。Feed：`feed.notifications.receive@1`（`plugins/native/feed/src/notification-actions.ts`，只认平台身份），搬来旧的来源与条目写法，判断仍用 `workflowEventsFeedOptions`，但只取发起调用的 `signal` 与授权复核，不取它的身份与权限（见下条）。
- **4a 的一个坑：把调用上下文整个当 `control` 传，会盖掉判断的身份。** `workflowEventsFeedOptions(…, control)` 里 `...control` 展开在后，传整个 `caller` 会把判断的 `actor_id`、`permissions` 换成接收方动作的；`pluginNotificationFeedOptions` 因此只挑 `signal`、`validate_authority`、`assert_authority_current`。`inbox-automatic-scenes` 的「提醒得到保存的 Inbox 下一步」测试抓到的。
- **4a 的语义变化（测试已按此改）。** 通知不再与业务记录同事务写进 Feed，而是同事务写进平台队列；Feed 那一头的失败不再让发送方的事务失败，而是留在队列里记码、下次再交（`agent-built-plugins-reminders` 的回滚用例改成拒绝队列行的写入；Schedule 的测试夹具项目启用 Feed 与 Inbox）。`SYS-15-N1/N2` 读队列行而不是 Feed 条目。
- **4a 顺手补的 FI-6 第 3 步遗漏。** 第 3 步起 Inbox 声明项目库表（`inbox_scene_bindings`），`project-database-baseline`（PLIB-02/09）与 `project-maintenance-v8`（v7 排练库要先去掉它与通知表，v8 期的账本只有四个插件）没跟着改，这次一起改了。
- **第 4 步 4b 已做：首页 dock 判断（2026-10-26）。** Home 不需要新动作：`home.judgment.evaluate@1`（1–20 件，`concurrent`，受众含 `agent`，所以插件受众也到得了）本来就是公开的。Feed 一侧新增 `plugins/native/feed/src/home-judgment.ts` 的 `feedHomeJudgmentTrigger({ projectId, directory(caller?) })`：与旧的 `createHomeJudgmentTrigger` 同一套静默与容忍（先看动作对调用者可不可用，不可用放过；跑；容忍码表放过；其余再看一次可不可用，仍可用才抛）；不碰场景客户端，Feed 并不声明 dock 场景。`directory(caller?)` 由 4e 接线：带调用者的事件（人的或工作流的动作）走 `services.actions.directory`（委托、该调用者的授权），没有调用者的生产者（来源 tick、唤醒）走 `services.actions.dependencies`（本安装、本安装的授权）。
- **4b 发现一（用户 2026-10-26 弹窗定 A，已改）：后台生产者（插件受众）经委托嵌套读取别的插件。** 用真实 Home 实验（`tests/home-judgment-plugin-caller.test.ts`）：Feed 以自己的安装身份调 `home.judgment.evaluate`，Home 读入箱条目要调 `inbox.subject.read`，Inbox 读条目背后的 Feed 事项走 `services.actions.directory`（委托），而 S-43 规定原调用者是 `plugin` 的拒绝（「别的插件用它自己的授权调进来的调用不能借此放宽成工作流受众」），于是 `actions.forbidden`，判断在到模型之前就停了。今天的宿主给后台 `workflow-events` 身份（受众 `workflow`），所以这条路能走；Runtime 里没有这个身份。同一限制也会落在 Inbox 的 `inbox.judgment.evaluate`（它经 `directory` 读 Feed 的正文）。**定 A 之后的做法：** 原调用者的受众是 `plugin` 时，`pluginActionDirectory` 不拒绝也不放宽成工作流，嵌套调用保持那个插件自己的调用（受众 `plugin`、它的授权、`plugin_install_id` 与 `host_plugin`、`allowed_actions` / `allowed_capability_ids`），只过它自己直接调目标会过的检查；`retainAuthority` 不改受众。S-43 那一句改了（不开新号）；`tests/home-judgment-plugin-caller.test.ts` 原来钉死的 `actions.forbidden` 改成判断做出并记账；`tests/security-invariants-plugin-action-delegation.test.ts` 的 `W5-01-DELEGATE-03` 原用例改写成「目标不在发起插件消费的动作里被拒」，另加「委托的插件有、发起插件没有的权限用不上」，后一条在补上权限后到达目标，目标看到受众 `plugin`、发起插件的安装身份与授权、`delegated_by` 为委托的插件。
- **4b 发现二：dock 的自动判断对今天的宿主身份其实是空操作（读代码与探针得出，不是本片引入）。** 宿主给触发器的权限是 `HOME_ACTION_PERMISSIONS` 去掉 `home:write`（`feed:read`、`inbox:read`、`home:read`、`model:invoke`、`functions:invoke`）；默认规则推荐「做完了」「忽略」，而这两个选项指向 `inbox.entry.status`，调用者要持有它的权限才算可用——`inbox:write`，第 3 步之后还要 `attention:write`。身份没有这两个权限，dock 对它不可用，触发器静默放过，没有模型调用、没有判断账。探针里给身份补上这两个权限后判断就跑了。第 3 步之前是 `inbox:write`，身份同样没有，所以不是第 3 步引入的。4e 保持对等（Feed 的授权不多给），除非统筹另有裁定；这件事要告诉产品负责人。
- **4b 顺手补的第 3 步遗漏。** `home-action-scenes` 的调用者要带 `attention:write`（Inbox 状态动作第 3 步起要它），否则「做完了」选项不可用、绑定被拒（`actions.scene_incompatible`）。
- **第 4 步 4d 已做：Home 引用账的逻辑一半（2026-10-26，RAC-494、495）。** `plugins/native/feed/src/content-ledger.ts` 的 `createFeedContentLedger(store, evidence)`：账是 `feed-content` 库里的行（`feed_content_holds(content_ref, project_id, source_id)`），不是计数，所以加与减都幂等；`hold` 是 `INSERT OR IGNORE`，`release` 先删本来源的行，再对候选逐个看还有没有别人持有，没有就删文件，**文件在写事务提交前删完**（同一把写锁，后来的 `hold` 要么看到行与文件都在、要么看到文件已不在而重写）。没有回填标记时 `release` 一份也不删（标记行的键叫 `complete_since`；设计稿里的 `backfilled_at` 改了名，因为门禁把 `backfill` 当兼容标记数，包源码里不能出现这个词；维护脚本与测试不在此列，命令仍叫 `backfill`）。只认 `molis-work-feed/sha256/<64 位十六进制>` 的引用，研究笔记等别的引用不是它的。动作 `feed.content.hold@1`、`feed.content.release@1`（`content-ledger-actions.ts`，范围 home、受众 plugin、权限 `feed:write`）与 Feed 的 Home 一半 `createFeedHomePlugin`（`home-plugin.ts`）已写并带测试（`tests/feed-content-ledger.test.ts`，7 例，用真实的 `createEvidenceContentStore`）；**还没登记**：Manifest 没加这两个动作、`databases.home` 与 `runtime.scope:"home"`，因为双实例的门禁（DUAL-12）要求带标记的 Home 条目有对应的项目一半，而项目一半在 4e 才有；Manifest 与登记随 4e 一起改。
- **4d 的维护脚本（RAC-495）。** `tests/fixtures/feed-content-ledger-maintenance.mjs`（`list` 只读、`backfill` 幂等、`--all-projects` 才写标记；退出码 0/1/2；测试 `tests/feed-content-ledger-maintenance.test.ts`，4 例）和 CHECKLIST 里的一行。动真实 Home 的维护窗口归用户定，合入前在 PR 正文里写明。
- **4d 给 4c 的一条约束：`hold` 必须在写正文之前返回。** 账的超集不变式要求「先加后写」。`services.sourcePull` 现在若在一次调用里拉取并写正文，就没有地方插入 `hold`。所以 4c 的形状是两段式：`pull()` 只取回并缓存正文、返回引用与摘要，Feed 用这些引用 `hold`，再 `commit()` 写正文（或 `discard()` 丢掉缓存）。这要在 4c 的设计稿里请统筹确认，不是 4d 的内容。
- **4d 与 RAC-492、493、518 的关系。** 这三条是项目一半的事（连接事件订阅、启动时对账、启动时对 `hold`），随 4e 的 `createFeedPlugin()` 做，不在 4d。
- **第 4 步 4c-1 已做：`services.sourcePull`（2026-10-26，RAC-1016～1019，暂定 S-97）。** 合同 `plugin-source-pull.ts`；运行时客户端 `packages/plugin-runtime/src/source-pull-service.ts`（权限来自当前调用，和 `services.connections` 同一套规矩；请求闭合）；宿主一半 `plugin-source-pull-service.ts` 的 `createSourcePullPort`（复用 `createFeedSourceRuntime`，所以传输仍是 RSS 允许名单 + 自定义公网地址 + AnySearch，没有新的网络代码）与 `source-pull-intent.ts`（`buildExactRequest` 的宿主一份，与 Feed 那份逐字节一致；4e 删 Feed 的那份）。`createSearchContentPort` 加 `beforeWrite`，`createFeedSourceRuntime` 加 `beforeContentWrite`/`assertCurrent`/`beforeDispatch`（都可选，宿主版 Feed 不传）；存储包导出 `evidenceContentRef`。沙箱：`SANDBOX_SERVICE_FATE.sourcePull = 'refused'` 加 `SANDBOX_NOT_GIVEN` 一行。测试 `tests/security-invariants-plugin-source-pull.test.ts`（8 例，真实项目库 + 假 fetch）。与初稿的差别：不暂存、不 `commit()`，见上面「改定的做法」。
- **第 4 步 4c-2 已做：`services.sourcePull.repository.read`（2026-10-26，RAC-1019，仍是 S-97）。** 权限 `sources:read_repository`；请求只有 `repository`（`owner/name`）与 `source_id`；宿主一半 `research-repository-read.ts`（`researchRepositorySnapshot` 是原 `research-library-source.ts` 里的 Git 缓存读取原样搬出，`readResearchRepository` 在它上面跑 `readResearchLibrary`，返回仓库、修订号与条目）。**条目写入搬进 Feed 随 4e**：今天宿主的 `syncResearchLibrarySource`（仍在 `research-library-source.ts`，已改成调 `readResearchRepository`，行为不变）在 4e 翻转时由 Feed 自己用 `repository.read` 的结果写条目与运行账，宿主那份删掉。Git 缓存读取共享同一次快照（同仓库并发读共用），所以调用的取消在快照前后检查，不传给共享的 `git`。测试 `tests/security-invariants-plugin-source-pull.test.ts` 加 2 例（假 `git` 经 `sourcePullGit` 接缝）。

## 9. 第 4 步（Feed 进 Runtime）的拆法与缺口清单（2026-10-26，开工前读代码核的）

Feed 的动作要么全由宿主提供、要么全由 Runtime 提供（`BUILD_TIME_ASSEMBLED` 里一个名字），所以「翻转」那一个提交要等下面每一块都有了去处。读了宿主里 Feed 的全部接线，依赖分三类：

| 类别 | 项 | 去处 |
| --- | --- | --- |
| 现成 | 项目库、Attention、情境账、成果、场景/判断账（P1/P2）、`services.connections.request`（FI-3 已给 Feed 声明 per-record 槽）、目录调 Goals 提升、目录调 Inbox 的 `inbox.judgment.evaluate` | 直接用 |
| 缺平台件（每件带 SI 行与拒绝测试） | ① 公开来源拉取（rss/youtube/自定义 rss 的 SEL、条件头、允许名单）、研究库的 git 取数、证据正文的写与读（`hydrateFeedItemContent` 读加密正文） → D6-1 的 `services.sourcePull`；② 平台通知落到 Feed（今天 `plugin-notification-service.ts` 在发送方的项目事务里直接写 Feed 事项，D6-2 改成按声明找接收方，事务语义要变）；③ Feed 调首页 dock 判断（`createHomeJudgmentTrigger` 跑宿主的 `home.dock` 场景，Feed 不能自己跑）→ 首页公开一个工作流受众的判断动作；④ Home 引用账（FI-4 Home 一半，双实例 + `databases.home`，正文释放） | 各一片 |
| 宿主构造点（8 个）与边 | `content-action-providers.ts`、`demo-plugin-seed.ts`、`feed-connector-sync.ts`、`feed-goal-promotion.ts`、`feed-source-service.ts`、`plugin-notification-service.ts`、`project-host.ts`、`workflow-feed-options.ts`；`feed-native-plugin-http.ts` 与客户端的 `/api/feed*`（FI-7 Feed 一半，路由进 Manifest，舞台片段走 `/api/stage/feed`） | 翻转提交里一起 |

建议的次序（每步单独绿、单独推；翻转之前宿主版 Feed 照常工作）：
1. **4a 平台通知接收方（D6-2）**：Manifest 声明接收、通知服务按声明找、没有接收方留队列。宿主版 Feed 先当接收方，删 `plugin-notification-service.ts` 里的 Feed 构造。
2. **4b 首页 dock 判断动作 ③**（做完，见 §8：没有新增 Home 动作，现成的 `home.judgment.evaluate` 就是公开动作；Feed 一侧的触发器已写；发现一个要统筹裁定的缺口，决定前 4e 的后台判断不能翻转）。
3. **4c `services.sourcePull` 与证据正文 ①**（4c-1 做完，见 §8 与 §10：`pull`/`plan`/`evidence.read`/`forget`；4c-2 `repository.read` 未做；沿用 S-10 的地址校验与允许名单，不放宽；S 号暂定 S-97）。
4. **4d Home 引用账 ④**（做完一半，见 §8：账的逻辑、两个动作、Home 一半与维护脚本已写，RAC-494、495；登记与项目一半的 RAC-492、493、518 随 4e）。
5. **4e 翻转**：`createFeedPlugin()`、监督器条目、`background.wakeups` 的 tick、8 个构造点换成公开动作、删 `feed-native-plugin-http.ts` 与客户端迁移、`BUILD_TIME_ASSEMBLED` 与 `NATIVE_PLUGIN_HTTP_FILES` 去掉 `feed`（RAC-499、500、510～512、516、517）。

这是 FI 线最大的一块：4c、4e 各自都比 FI-6 第 3 步（Inbox）大。次序与「4c 一个服务覆盖公开来源 + 研究库 + 证据读写」这一取舍若统筹有不同意见，开工前请回。

## 10. 第 4 步 4c 设计稿：`services.sourcePull` 与证据正文（2026-10-26，只读代码核的，未实现，等统筹确认）

**现状的切缝。** Feed 包早已把取数收成端口：`FeedSourcePorts.createRuntime(source)` 给出 `PublicFeedRuntime`（`intelligenceCollect.executeExact`、`content.has`、`writtenContentRefs`、`publicFeedReceipt`、`shutdown`），研究库另有 `syncRepository`。宿主这一侧是四块：`feed-source-runtime.ts`（RSS 允许名单传输 + SEL 运行时 + 条件头）、`search-evidence-runtime.ts`（AnySearch 传输与密钥；检索记录经 `createSearchOpaqueBlobStore(db)` 写进项目库，该表归 `packages/storage` 的 `search-storage.ts`；证据正文写 Home 的加密文件）、`research-library-source.ts`（`git` 子进程取数）、`feed-content.ts`（`hydrateFeedItemContent` 解密读正文）。这四块开网络、开子进程、读密钥、读写 Home 文件，插件自己都不能做，所以是平台服务；Feed 一侧只留「来源登记、计划、运行账、事项写入」。

**形状（4c-1 实现时改定，比上面初稿简单）：一个服务、四个方法，公开合同里没有 `@adeptify/*` 的类型**（`packages/contracts/src/platform/plugin-source-pull.ts`；回答 §9 末尾的取舍：一个服务，因为 Manifest 声明、授权、取消与审计是同一套）。

```ts
interface PluginSourcePullClient {            // 每个方法只在 Manifest 声明了它的权限时才有
  plan?(request): Promise<{ intent_fingerprint }>;                 // 不取不写，只算指纹（幂等冲突检查用）
  pull?(request, { hold(content_refs), signal? }): Promise<SourcePullResult>;
  evidence?: { read(content_ref): Promise<string | null> };
  forget?(operation_ids): Promise<{ records_deleted }>;
}
type SourcePullRequest =                       // 闭合：多一个字段就拒
  | { kind: "rss"; definition_id } | { kind: "custom_rss"; feed_url } | { kind: "youtube_channel"; channel_id }   // 都带 operation_id、source_name、cursor?
  | { kind: "web_query"; query };                                   // 带 operation_id、source_name
```

**改定的做法：「先 hold 后写」不靠暂存目录，靠写之前回调。** 初稿设想 `pull` 只缓冲、Feed 再 `hold`、最后 `commit()` 才落盘（暂存根目录 + 暂存检索库）。实现时发现更简单且不变式更强：证据正文按内容寻址（`molis-work-feed/sha256/<正文的 sha256>`，写之前就能算出，新增 `evidenceContentRef`），SEL 的内容端口 `write` 本来就是异步的，所以**端口在写每一份正文之前先 `await` 插件给的 `hold(refs)`**，`hold` 返回了才写。`hold` 是必填项，插件没法忘记；`hold` 失败、调用被取消、撤权、停用，整次取数失败，后面的正文不再写（SEL 把写失败变成局部结果，平台自己记下 `hold` 的失败并在 SEL 返回后重抛）。结果：不要暂存目录，不要 `commit()/discard()`，检索记录照旧直接写项目库，**初稿里的「行为变化」（崩溃后不能重放）也没有了**。崩溃在「hold 之后、写之前」只会让账多一行（超集，安全）。

**不放宽任何边界（D6-1 的停下条件一条都没碰）：** 目的地只经现有的传输——`createAllowlistedRssTransport`（目录里的订阅源 + YouTube 公共频道 + 自定义公网订阅地址，S-10 的固定到已检查地址的 socket）与 `anysearch-transport.ts`（密钥留在平台，插件看不到）；请求里只有地址 / 查询词 / 数量，**没有请求头、方法、重定向、代理字段**（schema 闭合，多一个字段直接拒）；条件头来自 `cursor`，仍由 `readRssHttpState` 只取 etag 与 last-modified 两个字符串；私网 / 回环等地址的拒绝原样生效（经服务再跑一遍 S-10 的表）。

**授权与声明（改定：不加 Manifest 块，只用权限，和 `services.materials` 一样）：** 权限 `sources:pull_feed`（订阅源类）、`sources:pull_query`（网页查询）、`evidence:read`（读正文，命名空间固定为存量的 `molis-work-feed/`）；没声明的种类、命名空间之外的引用、缺权限一概拒；取消、撤权、停用、卸载后的调用既不 commit 也不写（硬约束）。`evidence.read` 的命名空间今天只有 `molis-work-feed/`（存量数据的前缀，存储不是多命名空间的，本片不改）。沙箱里的插件本片拿不到这项服务（broker 不暴露；待核：现有 `services.*` 在沙箱里的暴露规则，实现时照同类服务做）。

**要统筹确认的（我的推荐在前）：**
1. 一个服务四个方法，实现分两个提交：4c-1 = `open` + `evidence.read` + `forget`；4c-2 = `repository.read`（研究库条目的写入从宿主 `syncResearchLibrarySource` 搬进 Feed，宿主只留 git 读取）。
2. （已改定）不做暂存与 `commit()`：`hold` 回调在每份正文写之前被等待，见上。
3. `evidence.read` 的范围：命名空间内任意引用（等于今天宿主的行为，引用是 256 位哈希、只能从本项目的行里得知）。更强的备选是平台再记一张「本安装在本项目写过 / 收到过哪些引用」，要读先查——那是第二本账，且要与 4d 的账对齐，推荐不做，SI 行里写明这个限度。
4. （已无）没有行为变化：崩溃后检索记录与正文照旧留下、可重放。
5. S 号用暂定 `S-97`（以合入时表的末号为准，不占 #1255 的 S-91）。

| 验收 | 内容 |
| --- | --- |
| RAC-1016 | 每份正文写之前，插件先被告知它的引用（用例里 `hold` 被调用时磁盘上还没有这份正文）；`hold` 抛错则整次取数失败、正文不写；取消在 `hold` 中途发生，后面的正文不写；同一来源同一键，平台算出的指纹与 Feed 自己记在运行账里的相同 |
| RAC-1017 | 拒绝：没声明权限的插件没有这项服务、方法按权限给；启动函数里 / 别的安装的调用 / 已结束的动作 / 非并行动作 / 只读调用 / 没声明权限的动作都拒；请求多一个头 / 方法 / 重定向 / 代理 / 供应商 / 预算字段、未知 kind、缺 `hold`、一种 kind 缺它的权限都拒；私网回环、非 https、带账号的地址在到传输之前就拒（用例里 fetch 一次都没被调用） |
| RAC-1018 | `evidence.read`：命名空间之外、格式不对、没有 `evidence:read` 的调用都拒；读回的明文与今天 `hydrateFeedItemContent` 读到的相同；不存在的引用返回 `null` |
| RAC-1019 | `forget`：只忘本项目里这几次取数的检索记录，别的操作号答 0；操作号格式、数量越界、非数组都拒。`repository.read`（4c-2，已做）：只返回仓库、修订号与条目，不返回目录路径与 Git 输出；仓库名不是 `owner/name`、含 `..`、以非字母数字开头一律拒，请求多一个字段拒；Git 参数里来自插件的文本只有固定地址 `https://github.com/<仓库>.git` 里的仓库名；没有权限的插件没有这个方法，不在并行动作 / 只读调用 / 动作外都拒；来源未开放、包文件被改过整次失败；调用已取消时不返回 |

**统筹 10-26 对 4c-1 的三个条件（#1311 评论 6410517262），做法与证明。**

- **① 失败、取消、撤权后已 hold 的引用**：选「由 4d 的整理收回没人引用的 hold」。先 hold 后写意味着任何失败（取数失败、取消、撤权、崩溃）之后，来源可能多持有若干正文，它的行并不指向它们；多持有是安全的一侧（超集）。账新增 `reclaim`（`content-ledger.ts`，动作 `feed.content.reclaim`，只给 Feed 自己的项目实例）：调用者给出「我登记过、但我的行不引用」的引用，账只放掉**这个来源**对它们的登记，再删没有别的来源或项目持有的正文；没有完整标记时什么都不动；调用者的前提是持有来源同步租约（同一来源同时只有一次取数在写）。Feed 在 4e-2 里：取数失败后、以及每次同步开始时，用「`hold` 回调记下的引用 − 来源的行实际引用的引用」调用它。测试：`tests/feed-content-ledger.test.ts` 的「holds a failed pull left behind are taken back」（只收本来源的、只收点名的、别人还持有的正文保留、重复收回不变、没有完整标记不动、调用被拒绝则不写）。
- **② 检索记录写在哪、失败时留不留**：检索记录是 SEL 的运行与结果记录，写在**项目库**的 `feed_runtime_blobs`（不透明存储，命名空间 `…/data/operation/v1` 等），由平台的内容端口与存储端口写，不经插件的事务。取数中途失败、被取消或撤权后，**已经写下的记录留着**（与今天宿主版 Feed 一样：它们按操作号可重放，同一操作号再取一次接着用），不留半条的保证来自存储端口每次写之前复核调用。要删有两条路：`forget(operation_ids)`（只删本项目这几次取数自己的记录）和来源删除时 Feed 的 `history.release`。
- **③ 取消或撤权之后不再写**：正文写之前，`hold` 之后端口再复核一次调用（`assertCurrent`）；检索记录每次插入、更新、删除之前同样复核。平台还把「调用已经不在」作为取数的失败原因返回（而不是搜索层包出来的 `persistence_failed`）。测试：`tests/security-invariants-plugin-source-pull.test.ts` 的「loses its authority once a body is held」（撤权发生在第一份正文已 hold 之后：后面的正文不写、检索记录的行数不再增加、取数失败码是 `actions.forbidden`）与既有的取消用例。
- **S 号**：暂用 S-97（S-92 是 batch-43 里 P2e 的），合批时由统筹按表末给号，测试名跟着改。

## 11. 第 4 步 4e：翻转的实现方案（2026-10-26，读 8 个宿主构造点与 Feed 的七组处理器后定，等统筹确认）

**范围的实测。** Feed 的处理器是七组小文件（`content`、`query`、`rule`、`inbox`、`item`、`notification`、`source` 的 `*-actions.ts`，各 54～125 行）；宿主一侧它们的端口都在 `content-action-providers.ts` 里接（正文解密 `hydrate`、连接器授权状态、Goals 的 `linkedContext`、场景选择、来源授权、通知里的 Feed 应用、`promote`、来源服务与连接器同步），`project-host.ts` 的 `eventFeed` 与 `workflow-feed-options.ts` 的三种判断身份（捕获、首页 dock、Inbox 下一步）、`feed-source-service.ts`、`feed-connector-sync.ts`、`feed-goal-promotion.ts`、`plugin-notification-service.ts`、`demo-plugin-seed.ts` 都经 `createLocalFeedApplication` 共用同一个宿主应用。

**事务形状（这一片最关键的一处，设计稿 §3.2 的落地）。** 运行时端口 `createFeedRuntimePorts().within(tx, actor, body)` 要求写发生在 `services.project_database.transaction(beforeEffect, body)` 的同步 body 里。今天多数处理器是 `async handle` 里同步调 `FeedApplication` 的写方法（`markRead`、`setDisposition`、`restoreToFeed`、`addToInbox` 等）；少数是「等网络或等别的服务之后再写」。

- **一个通用包装 `writing(handlers)`，不逐个改写同步写处理器。** 命令类处理器的同步前缀跑在 `database.transaction(() => caller.beforeEffect(), tx => ports.within(tx, actor, …))` 里：开事务前先等 `beforeEffect`，提交前由事务再认一次权；这段之后的 `await` 里端口是未绑定的，**写会以 `actions.execution_failed` 失败，而不是悄悄写到别处**（端口早就是这样设计的）。所以「写在 await 之后」的处理器会在测试里响亮地红，再逐个改成「先读、先等，再进事务提交」。
- **预期要改的（待核，翻转时由测试确认）：** `feed.item.promote`（等 Goals 之后写关联）、来源同步（`FeedSourceService.sync`/`source-sync.ts`：取回在前、写条目与运行账在后）、连接器同步（`connector-sync.ts`）、通知接收（判断之后写）。来源同步按「每个批次一个事务」提交，取数经 `services.sourcePull`，`hold` 回调里先在 Home 账里记账（4d 的 `feed.content.hold`）再写正文；条目与运行账的写入在每个批次的事务里。
- **判断触发器**：捕获、首页 dock、Inbox 下一步三种判断都在写之后启动，不进事务：捕获走 Feed 自己的场景（`createFeedSceneRuntime` + `services.scenes`/`services.judgments`，P1/P2 已有），dock 走 `feedHomeJudgmentTrigger`（4b，选项 A 已开路），Inbox 走 `inbox.judgment.evaluate` 目录调用（`inboxJudgmentTrigger`）。

**拆法（同一分支、同一个 PR，每步单独绿、单独推；翻转之前宿主版 Feed 照常工作）：**

1. **4e-1：Manifest 与 `createFeedPlugin()` 的骨架（不登记）。** Manifest 补平台权限（`attention:read/write`、`context-ledger:read/write`、`scenes:use`、`judgments:*`、`journal:project`、`actions:delegate`、`connections:request`、`sources:pull_feed/pull_query/read_repository`、`evidence:read`、`artifacts` 声明）、`background.wakeups`（tick）、`databases.home` 与 `runtime.scope:"home"` 的 Home 一半登记、Home 引用账两个动作；`createFeedPlugin()` 用 `assembleFeedApplication` + `createFeedRuntimePorts` + `writing()` 提供读类与同步写类处理器。用平台夹具（项目没启用宿主版 Feed）起这个插件，测同步写与取消不写（RAC-509）。
2. **4e-2：来源、连接器、通知与判断。** 来源同步与研究库改用 `sourcePull`/`repository.read`，tick 用唤醒动作，来源互斥用 `createFeedSourceSyncLease`，连接器同步走 `services.connections`，通知接收动作，三种判断触发器；项目一半的 RAC-492（连接事件订阅）、493（启动对账）、518（启动时对 `hold`）。
3. **4e-3：翻转与删除。** `registration` 加 `project_runtime`（与 Home 一半的 `runtime`），`BUILD_TIME_ASSEMBLED` 删 `feed`；`content-action-providers.ts` 的 Feed 部分、8 个构造点逐个改成公开动作，`createLocalFeedApplication` 及 `feed-application.ts`、`feed-source-scheduler`、`feed-source-sync-lease`、`workflow-feed-options.ts`、`feed-goal-promotion.ts`、宿主的 `syncResearchLibrarySource` 删；FI-7 的 Feed 一半（`feed-native-plugin-http.ts` 删，路由进 Manifest，舞台片段走 `/api/stage/feed`）同在这一步，因为它也是 `feed` 的最后一个宿主私有文件。门禁的混合名单与 `NATIVE_PLUGIN_HTTP_FILES` 同步减。

**请统筹确认或另裁：** ① 事务形状用「通用包装 + 响亮失败 + 逐个改写 await 之后才写的处理器」，而不是把 `FeedApplication` 的写方法改成异步；② 三步拆法，且 4e-1 与 4e-2 不登记、对外无变化；③ 4e-3 一步里同时翻转并做 FI-7 的 Feed 一半，会是一个大提交（Inbox 的翻转 55 个文件），我会把翻转前能单独落的删除（如 `syncResearchLibrarySource` 之外的死代码）先拆出去。

**4e-1 实现记录（2026-10-26，已做，未登记）。** `plugins/native/feed/src/plugin.ts` 的 `createFeedPlugin()` 与 `feedRuntimeManifest`、`runtime-writes.ts` 的 `createFeedWriter()`、`item-hydration.ts` 的 `FeedHydrate`；测试 `tests/feed-runtime-plugin.test.ts`（6 例，真实项目平台，不带宿主版 Feed）。与上面方案的差别和新发现：

- **事务体必须同步返回**（平台的 `requireSynchronous` 拒绝返回 promise 的事务体），所以 `writing()` 不能把整个 `async` 处理器放进事务。做法是：处理器的同步前缀在事务体里跑，它的返回值（可能是 promise）被记下，提交之后再 `await`。前缀里抛错整个回滚；`await` 之后的写以 `actions.execution_failed` 失败，不写到别处。另给了 `commit(caller, body)`，写在 `await` 之后的处理器（4e-2 的规则保存、来源同步、升格）先等完、再 `commit` 一次。
- **处理器的 `bind` 辅助改成透传**（`query`、`inbox`、`item`），不再外包一层 `async`，同步结果仍是同步；`hydrate` 改为可等待的 `FeedHydrate`（宿主传同步函数照旧），读类处理器 `await` 它。Runtime 的 `hydrate` 经 `services.sourcePull.evidence.read`，读不到的正文标 `content_available: false`，调用被取消或撤权则失败。
- **只声明这一步用到的平台权限**：必需的是 `attention:read/write`、`context-ledger:read/write`、`journal:project`，可选的是 `evidence:read`。§11 第 1 点列的其余（`scenes:use`、`judgments:*`、`actions:delegate`、`connections:request`、`sources:pull_*`、`background.wakeups`、`databases.home`、`runtime.scope`）随用到它们的件在 4e-2、4e-3 加，不先要用不上的权限。Manifest 由 `feedManifest` 派生（少了来源动作、通知接收、`feed.connections.status`、`feed.goals.context`，这些要等 4e-2），翻转时它就是 `feedManifest`。
- **读路径里的写，测试里第一次暴露：** `readListenerCheckpoint` 读一个没有检查点行的来源时会 `INSERT OR IGNORE` 一行，`feed.snapshot` 因此在只读客户端上失败。改成返回「第一次写会建的那行」（idle、空游标），读不再写；宿主版 Feed 的行为变化只是列来源不再顺带建行，写路径（`writeListenerCursor`、租约）仍先建行。
- 来源授权（`feed.items.material` 的 `authorize`）对账号型来源先关闭（失败即拒绝，理由「来源连接暂不可用」），手动与公开来源照旧；4e-2 接上 `services.connections` 后与宿主版对齐。
- `feed.content.receive`（来源、条目、日志事件）是一次提交：测试把调用者的授权在第 1～25 次检查处依次撤掉，每次结果只有「全部写入」或「什么都没有」，两边都出现。

**R-65（用户 2026-10-26 弹窗决定：首页自动判断推荐的动作「能不能用」，由之后点它的那个人判断，不由后台触发器判断）的可行性结论（2026-10-26，4e 前先查）：这一片不做，退到「保持现状，界面里说明」；不给触发器加 `inbox:write`/`attention:write`。**

- 现状（读 `apps/local-host/src/home-actions.ts`）：触发器（`feedHomeJudgmentTrigger`，没有调用者时以插件自己的安装、用人授予的权限判断）经 `home.judgment.evaluate` → `prepare` 里 `prepareOffers(callerDirectory(actions, 触发器))`，只留**触发器**看得到、可用的动作；`record()` 又对触发器逐条 `validate_authority(offer.action)` 与 `assert_authority_current(offer.action)`。读的一侧（`recommendations`）已经用读的人重新核对，显示是对的。
- 要改成「按点的人判断」，只有两条路：① 触发器合成一个 user 受众的调用者来看目录——后台触发器自造身份，违反「可信身份从调用上下文来」（S-43 的同一类问题），点的人在写入时也未知；② 放松 `record()` 对 `offer.action` 的授权检查——动的是动作服务的授权语义，不是 Feed 的事，得单独过安全评审。两条都不是「4e 顺手」的量，也都比「保持现状」更宽。
- 保持现状的后果：Feed 安装未被授予 `inbox:write`（它的权限全是可选，由人授予）时，要 `inbox:write` 的动作不会进判断的候选；一条没有任何可推荐动作的条目，自动判断得到 `actions.subject_unavailable`，被触发器吞掉，不记判断。手动点「判断」（调用者是人）不受影响。**宿主版现在没有这个后果**（触发器是宿主身份）；它在 4e-3 翻转时才出现，所以界面说明（首页下一步空状态写明「自动判断只看 Feed 已被授予的动作，需要更多请到权限里授予或手动判断」）归 4e-3，不在这一片加。
- 要走 ①/② 的话是平台的单独一片（动作服务的 offers 可用性语义），不属于 Feed 线；已写进 #1311 的汇报，由统筹决定要不要开。

## 12. 第 4 步 4e-2 的设计（2026-10-26，读 `source-sync.ts`、`source-service.ts`、宿主的 `feed-source-service.ts` 后定；有一处要统筹确认）

**缺口一：来源的「词汇」Feed 进 Runtime 后拿不到。** 宿主版的 `FeedSourceService` 由宿主注入 `providers`：RSS 目录（`listRegisterableFeeds`，也是平台传输的允许名单）、自定义 RSS 地址与 YouTube 频道的规范化、RSS 的 HTTP 游标（`readRssHttpState`、`withRssHttpSuccess/Failure`，游标格式与平台发条件请求读的是同一份）、Gmail 范围。它们在 `plugins/official-integrations/{rss,youtube,gmail}`，Feed 是插件，边界规则不许它导入另一个插件的实现（`plugin-upward-dependency` 之外的同类规则），自己抄一份会让目录与允许名单、游标格式出现两处。**推荐（4c-3）：这些纯函数由平台经 `services.sourcePull.vocabulary` 给，宿主用现有的集成包实现，Feed 一侧的 `FeedSourceProviders` 照旧同步，不改签名。** 只含纯函数、不联网、不写；权限沿用 `sources:pull_feed`；Gmail 范围是连接器来源的词汇，跟 `services.connections` 那一步（4e-2e）走，不放进这里。另一条路是把这些函数搬进 Feed 自己的包，但目录必须与平台的允许名单同源，游标格式必须与平台的条件请求同源，所以不推荐。

**缺口二：写要全部走 `commit`，包括 await 之后的几处。** `PublicSourceSync` 里写的地方有五处（开始同步的运行行、失败的中断行、终态提交、RSS 故障的 Inbox 条目、`resolveSourceFaults`），其中三处在 `await` 之后；`ports.transaction` 现在是同步的。做法：端口改成 `commit<T>(operation: () => T): Promise<T>`，宿主版实现是 `async op => db.transaction(op).immediate()`（行为不变），Runtime 版是 `writer.commit(caller, op)`。判断队列（`flushPendingJudgments`）里判断的结果写回（分类、入箱）同样要走 `commit`，在 4e-2f。

**缺口三：`hold` 要经 Home 账。** 先 hold 后写：`sourcePull.pull` 的 `hold` 回调里，项目实例经动作目录调 `feed.content.hold`（Home 实例），所以来源同步需要 `actions:delegate`，且 hold 的持有者是「项目 + 来源」。

**4e-2 的小片（每片单独绿、单独推；翻转前宿主版 Feed 不变）：**

| 片 | 内容 | 平台件 |
| --- | --- | --- |
| 4c-3 | `services.sourcePull.vocabulary`（目录、规范化、游标）；SI 行并入 S-97；`SANDBOX_SERVICE_FATE` 沿用 | 合同 + Runtime 客户端 + 宿主构造 |
| 4e-2a（做完，见下） | 来源管理里只写不等的三个动作（`enabled`、`schedule`、`disconnect`）进 `createFeedPlugin()`，直接用 `writing()`；`register`、`update` 要词汇（等 4c-3），`delete` 之后要释放来源的正文和检索记录（`history.release` 是同步端口，Runtime 里要经 Home 账与 `forget`，归 4e-2b） | 无 |
| 4e-2b | 公开来源 `sync`：`PublicSourceSync` 改用 `commit` 端口，拉取经 `sourcePull.pull` 并 `hold`，结果映射回 `IntelligenceCollectResult`；失败后调 `feed.content.reclaim`（4c-1 的条件①） | 无 |
| 4e-2c | `tick` 用唤醒动作（`background.wakeups`）、研究库经 `repository.read` | 无 |
| 4e-2d | `feed.goals.context`（做完）；连接器同步与 `feed.connections.status`（查出要平台件，等裁定，见 4e-2d 记录） | 连接器那半要 |
| 4e-2e | 通知接收动作（`FEED_NOTIFICATION_ACTIONS`） | 无 |
| 4e-2f | 三种判断触发器与判断队列的写回走 `commit`；`feed.content.receive` 改成一次提交（现在的手动投递来源 + 入条目不是原子的）；项目一半的 RAC-492/493/518 | 无 |

**请统筹确认或另裁：** 缺口一用 4c-3（平台给词汇）还是把函数搬进 Feed。我先按推荐做 4e-2a（不依赖这个裁定），4c-3 等回复再动。

**4e-2a 实现记录（2026-10-26）。** `source-actions.ts` 的 `bind` 分成两个：只写不等的（`register`、`update`、`delete`、`schedule`、`enabled`、`disconnect`）直接返回同步结果、不再外包 `async`，这样 Runtime 的事务能整个装下；会等的（`sync`、`tick`）用 `bindWaiting`，先 `await caller.beforeEffect()`，行为同前。`createFeedPlugin()` 起一个 `FeedSourceService`（事务端口直接 `operation()`，因为已在动作自己的写事务里；`providers` 是「来源词汇」的占位，调用即失败，4c-3 接上），`enabled`、`schedule`、`disconnect` 加进 Runtime Manifest；`register`、`update`、`delete`、`sync`、`tick` 仍在 `NOT_YET`。测试（`feed-runtime-plugin`）：暂停与排程的日志事件是调用者的、类型带命名空间；公开来源 `disconnect` 报 `feed.source_invalid_state`；调用者在各检查点被撤权时，启停状态与事件同进同退。宿主版 Feed 的 52 个来源相关用例照旧通过。

**4c-3 实现记录（2026-10-26，统筹同意，条件：纯函数、`sources:pull_feed`、并进同一行 SI、宿主那份到 4e-3 删）。** `services.sourcePull.vocabulary`（合同 `PluginSourceVocabulary`、`SourceCatalogEntry`）：目录（含 `enabled`、分类与分类名、限制说明）、自定义订阅地址与 YouTube 频道的规范化、订阅源的 HTTP 游标三个函数、三个固定名；宿主一侧 `apps/local-host/src/source-vocabulary.ts` 用 rss/youtube 集成包构造（宿主版 Feed 在翻转前仍用自己注入的那一份）。Runtime 客户端 `source-pull-service.ts`：随 `sources:pull_feed` 才有，调用要在本插件自己的调用里、动作声明并且调用者持有该权限，只读调用也可以问；参数是 1～2048 字符的文本或普通数据（超长、非文本、函数以 `plugin.source_pull_request_invalid` 拒绝），每个答案 `structuredClone` 一份。临时号改为 **S-97**（S-93、S-94 已被别的分支占用，S-20 的门禁要求数字号，所以不写字面的 S-9X；合批时统筹给号，文里、测试名、spec 里一起改）。
**这带来一个产品后果：** Runtime Feed 的 `feed.sources.register` / `update` 在 Runtime Manifest 里声明了 `sources:pull_feed`（宿主版的定义不动），调用者要持有它才能调；翻转时这两个动作（和 4e-2b 的 `sync`）的合同权限列表会多这一项，`pnpm actions:update` 与 PR 说明里要写。Feed 的 Runtime 实例：`register`、`update` 已接上（`update` 的账号连接部分等 4e-2d）；测试：同一来源不重复登记、规范化为平台的正常形、被拒的地址不留痕迹。

**4e-2b 实现记录（2026-10-26）。** 公开来源的 `sync` 与 `delete` 接进未登记的 Runtime Feed（`register`、`update`、`delete`、`sync` 已在 Runtime Manifest 里，`tick` 仍在 `NOT_YET`）。
- **两处与设计稿不同。** ① 不再「失败后调 `reclaim`」：拉取在写正文**之前**先把引用写进这次运行的行（`hold` 回调：`beforeEffect` → 一次 `commit` 把 `content_refs` 记进运行行 → 再告诉 Home 的引用账 `feed.content.hold`），所以任何地方被切断，已写的正文都有一个运行在指着它，删除来源时能找到；`reclaim` 留作维护工具，不在失败路径上调。② 删除来源的顺序是**先释放、后提交**：`feed.content.release` 与 `sourcePull.forget` 是别的服务的写，进不了 Feed 的事务，所以在删行的那次提交之前做；它们对重复调用幂等，释放中途被切断的删除，再删一次就做完。释放的结果由 `retire` 带进同一次提交，`history_released` 事件与删除同进同退（`source-removal.ts`；`FeedSourcePorts.releaseHistory` 只收项目和来源，Feed 自己从快照读它持有什么，`holdingsOfSnapshot`）。
- **一个平台缺口，补了。** Feed 的 Home 一半在 Runtime 里收到的调用者没有 `host_plugin`（回调上下文按设计去掉了宿主签发的对象），原先「调用者必须是 Feed 自己的项目实例」的检查永远过不了。新增 `ActionCallContext.calling_plugin_id`（合同 API 快照已刷新）：插件受众的调用上，由宿主按签发的调用者在每次调用时给出，调用自带的会被去掉，人、Agent、工作流的调用没有；账本动作改读它（S-15，测试 PG110-18）。这是平台合同的新增，临时放在 S-15 里，统筹复核时请看这一条。
- **Runtime Manifest 的差别（翻转时的产品后果，PR 说明里要写）：** `delete` 多声明 `sources:pull_feed`、`attention:write`、`context-ledger:write`（删来源会删它的条目、Inbox 条目和与 Goal 的关联，平台只许声明了权限的并行动作写这些账本），并成为 `concurrent`；`sync` 多声明 `sources:pull_feed` 与 `sources:pull_query`；Manifest 多了 `attention.subjects: ["feed_item", "source_fault"]`、可选的 `actions:invoke`（向 Home 的引用账登记和释放）。调用者要持有这些权限才能调这些动作。
- **仍然开着的：** 带 hydrate 的读动作（snapshot、item、content、rule、inbox）经 `sourcePull.evidence.read` 读正文，平台要求动作声明 `evidence:read` 且调用者持有，翻转前要裁（动作声明，还是安装的授权就够读自己的证据）；`tick`、Gmail 范围、连接器、通知接收、判断触发器、`feed.content.receive` 的原子化是 4e-2c～f。
- **测试**（`feed-runtime-plugin` 12/12，均走真实的项目平台与一个读真实表的账本替身）：同步一次，条目、运行行与事件是一次提交，引用账里的持有就是运行行里点名的那几个；同一幂等键不再取数；读不到来源得到「失败」终态运行、不留半截；账本拒绝时拉取中断、不写正文、运行行仍点名引用；调用者在各检查点被撤权后，每个已写的正文都被某个运行点名；删除来源并清历史时，账本、正文、搜索记录都清掉，事件同提交。

**4e-2c 实现记录（2026-10-26）。** `tick`（经平台的定时器）与研究库同步进未登记的 Runtime Feed；`NOT_YET` 里只剩通知接收、`feed.connections.status`、`feed.goals.context`。
- **研究库：** 同步逻辑从宿主搬进 Feed 包（`research-library-sync.ts` 的 `syncResearchLibrary`，读仓库与写入都是注入的端口：Runtime 版是 `sourcePull.repository.read` 与 `writer.commit`，宿主版 `apps/local-host/src/research-library-source.ts` 只剩一层薄壳，保留它自己的「同一幂等键并入进行中的拉取」）。只有一份实现。导入条目是一次提交；之后判断队列照旧（4e-2f）。
- **tick：** 平台的定时器唤醒的是一个插件受众的命令，所以 Runtime Manifest 多了一个动作 `feed.sources.wake`（输入是唤醒的输入，输出 `{status, detail}`；权限与 tick 相同），`background.wakeups` 声明它，`background.jobs` 声明 `feed-wakeup`：Feed 启动时保留这个作业，作业在安装被记为 running 之后向 `services.scheduler` 登记一个 30 秒一次的循环（已有同形、有效的就不再登记，重登会重置间隔；没有 `schedule:read/write` 授权就不登记，Feed 仍可手动拉取）。唤醒与 `tick` 共用同一个调度闭包（`source-actions.ts`），`wake` 经 `ports.wake` 传入，只在 Runtime 版有。`FeedSourceScheduler` 的两处等待之后的写（推进下次拉取时间、来源故障的 Inbox 条目）改走 `commit`。
- **为让 tick 的「钉住来源版本」的守卫与 Runtime 的提交相容：** `PublicSourceSync` 里原来紧跟在终态提交之后的两次提交（拉取成功后解除来源故障、失败后登记来源故障）并进了同一次提交（成功或失败的结果与它的故障记账现在是一次写入）。宿主版同样受益，行为差别只是这两步与结果同进同退。
- **翻转时的产品后果（PR 说明里要写）：** `sync` 多声明 `sources:read_repository`（任何同步的调用者都要持有，即使来源是 RSS）；`tick` 与 `wake` 声明 `sources:pull_feed`、`sources:pull_query`、`sources:read_repository`、`attention:write`；`wake` 是一个新动作（`pnpm actions:update` 会多一行）；Manifest 多了三项可选权限 `sources:read_repository`、`schedule:read`、`schedule:write`，和 `background`。宿主自己的 30 秒时钟（`project-schedulers.ts`、`web-project-schedulers.ts` 里 Feed 的那一路）到 4e-3 翻转时删。
- **仍然开着：** 账号连接器来源的 tick/同步仍报 `actions.dependency_missing`（4e-2d）；判断队列在拉取之后的写回（4e-2f）。
- **测试**（`feed-runtime-plugin` 15/15）：tick 只拉到期的、拉完把下次拉取推到将来、再 tick 不再到期；研究库经平台读取（一个已发布包一条条目，同键重放、新键不重复，读不到时中断且不留半截）；平台的定时器：Feed 启动后恰好登记一个唤醒，唤醒拉取到期来源且成功。

**4e-2d 实现记录（2026-10-26）。** 只有 `feed.goals.context` 做完；连接器同步与 `feed.connections.status` 查出来**不是「无平台件」**，停在裁定上（下面第 2 点）。

1. **`feed.goals.context` 进 Runtime Feed（未登记）。** 先经 `services.actions.invokeQuery` 以调用者身份读 `goals.contract.read@2`（Manifest 多了 `capabilities.consumes: ["goals.contract.read"]`；读不到或无权就什么材料都不给），再用 Feed 自己的 `findLinkedGoalItem`（`feed.goal` 边经 `services.contextLedger`，排序仍是更新时间倒序、事项号升序）取正文。`readLinkedFeedContext` 因此改成 `(feed, projectId, input, hydrate)`，**不再用 Context Ledger 的材料化器**（本稿 1.2.5 要去掉的那一块）；宿主版同样改用它，`content-action-providers.ts` 少了 `createContextLedger/createContextMaterializer`。原来的「Runtime Feed context uses live Ledger links」用例随函数一起搬到 `feed-runtime-plugin`（RAC-507：命名事项、没命名取最新、未关联不能靠点名注入、Goal 不存在或调用者不能读 Goals 都不给材料、重连/改内容/删边实时反映）；`context-materialization` 里只剩材料化器自己的用例。宿主版 `plugin-query-consumers`（含 Goals 停用时 `actions.plugin_disabled`）照旧通过。
2. **连接器同步与连接状态为什么停下。** 本稿 §11/§12 假设「连接器同步走 `services.connections`」，读代码后不成立：
   - 宿主的账号同步（`apps/local-host/src/feed-connector-sync.ts`）从 **Home 的集成登记**（`homeIntegrationRegistry(home).bind(key, "source", binding)`，gmail/github/catalog 三类集成插件）拿 `connector_driver` 与 `signal_adapter` 两个**代码对象**，驱动由宿主的连接层取凭据（`defaultIntegrationProvider`，PG-045 之前的过渡写法）。`services.connections` 只有 `request/describe/release`，按**声明的槽**（`per_record` 用记录名）发请求；它给不出驱动，也给不出适配器。Feed 的 Manifest **没有声明任何 `connections` 槽**（§10 说 FI-3 已声明是错的，`grep` 无），来源的账号现在存在来源行的 `config.connection_id`，由宿主连接页选。
   - `feed.connections.status` 是「这个 Home 有没有未断开的 GitHub/Gmail 连接」（`feed-connector-auth.ts`，读连接元数据）；`describe(slot)` 回答的是「这个槽有没有被人绑定」，意思不同。
   - Feed 一侧还有一半：`ListenerHost`（`store/listener.ts`）在 `await` 的间隙里同步写租约、运行行、投递行、检查点，`FeedConnectorSync` 在 `await` 之后写条目与来源，要像 `PublicSourceSync` 那样全部改走 `commit`；这一半不依赖裁定，但没有平台件它没有用处，所以没先做。
   - **建议（需统筹/用户定，是平台片，暂记 4c-4）：** 平台给一个 `services.sourcePull.connector`（权限 `sources:pull_connector`，随 `sources:pull_*` 同一套规矩）：`pull({source_id, integration_key, mode, cursor, intent})` 由宿主用登记里的集成与**该来源已绑定的连接**去取，返回已适配的原始事件（载荷是 `IntegrationProviderItem`、信号草稿、`cursor_after`）或失败回执，**凭据不出平台**；`status()` 返回 Home 级的 GitHub/Gmail 是否已连接；`authorize(source_id)` 对应 `inspectSourceAuthorization`。信任来源必须是**人选的绑定**（S-57 的 `per_record` 槽，记录名 = 来源号），不能是插件传来的 `connection_id`/`credential_ref`（否则任何插件可以点名别人的连接）；所以 Feed 要声明 `connections` 槽，现有来源的 `config.connection_id` 要在翻转时由维护步骤搬成槽绑定（进用户维护窗口清单）。工作量：合同 + Runtime 客户端 + 宿主构造（复用登记）+ SI 一行 + 拒绝测试，约一片 4c-3 的 1.5 倍。备选：等 PG-045（集成插件自己经 `services.connections` 取）再做，但 Feed 的翻转不能把 Gmail/GitHub 来源落下，所以会卡住 4e-3。
3. **依旧未接：** 通知接收（4e-2e）、判断触发器与队列写回、`feed.content.receive` 原子化、RAC-492/493/518 项目一半（4e-2f）。Runtime Feed 的 `NOT_YET` 现在是通知接收与 `feed.connections.status`；账号来源的同步/tick 仍报 `actions.dependency_missing`，`feed.items.material` 对账号来源仍「来源连接暂不可用」。

**4c-4 设计（2026-10-26，用户同意按 4e-2d 记录的建议做；读 `connector-plugin-requests.ts`、`connector-plugin-slot-actions.ts`、`integration-registry.ts`、`feed-connector-sync.ts`、`store/listener.ts`、`source-pull-service.ts`、`connections-service.ts` 后定）。**

**信任来源。** 一个来源用哪个账号，只由**人**定：S-57 的 `per_record` 连接槽（`connectors.plugin_slot.bind@2`，audience 只有 `user`，记录名 = 来源号，作用域 = 安装 + 项目 + 记录）。平台取数时自己从绑定表读连接，插件不传 `connection_id`、`credential_ref`、`token_refs`，请求里也没有这些字段。没绑定、已断开、绑定的连接不是这个服务的，都不取数：回一个 `needs_auth` 的失败回执（来源因此停在「授权失效」，和今天一样），提供方一次都不调用。

**新的平台件：`services.sourcePull.connector`（权限 `sources:pull_connector`，暂记 S-97 并入同一行）。** 随 `sources:pull_*` 同一套规矩：调用必须是本安装自己的动作或保留作业，动作声明并且调用者持有权限；会取数的方法还要 `scheduling: "concurrent"`、不能在只读调用里；使用人的账号还要同时声明并持有 `connections:use`，槽必须是 Manifest 里声明的 `per_record` 槽。沙箱插件安装时拒绝（沿用 S-60）。

| 方法 | 作用 | 备注 |
| --- | --- | --- |
| `open(integration_id)` | 这个集成是不是已登记的 `source` 类，适配器的身份 `{plugin_id, version}` | 纯读；与槽的服务必须一致 |
| `pull({slot_id, integration_id, record_key, cursor, intent?, settings?}, {signal})` | 宿主按绑定的账号用登记里的集成取一次，回 `{receipt_id, driver_id, started_at, completed_at, result}`（`result` 是 `ConnectorPollResult`：原始事件与 `cursor_after`，或失败） | 回执不含连接号；取数前后各核一次绑定（连接号、`updated_at`、凭据引用），变了就以 `connection_changed` 拒绝，对应宿主版的 `source_connection_changed` |
| `adapt({slot_id, integration_id, record_key, event})` | 登记里的信号适配器把一条原始事件变成信号草稿 | 纯函数，不碰账号；重试隔离中的投递要用 |
| `accounts(service_ids)` | 这些服务（只限 Manifest 声明了槽的）在这个 Home 里有没有未断开的连接，只回 `{bound}` | 对应 `feed.connections.status` |

- 请求封闭：`settings` 是至多 8 个 `键: 短文本`（现在只有 Gmail 的 `scope`），保留键（`token_refs`、`connection_id`、`credential_ref`、以 `_` 开头）直接拒绝；Gmail 的令牌引用由平台从绑定的连接读，不由来源行带。`integration_id` 必须是登记里 `kind: "source"` 的集成，且它声明的 `service_id` 等于槽的服务。
- 宿主一半（`plugin-source-pull-service.ts` 的端口多一个 `connector`）：登记用 `homeIntegrationRegistry(home, providerFactory?)`（测试可注入提供方），连接生命周期用 `withConnectorRequest`（连接被撤销或断开会中止在途取数）。绑定表读法与 `services.connections` 同一份（`targetScope`、`store.binding`），不另写第二份。
- 验收（暂记 RAC-1017～1019 之外另开，号要统筹给）：缺权限、缺 `connections:use`、槽没声明、槽不是 `per_record`、只读调用、别的安装、请求里多字段或保留设置键都在取数前被拒；没绑定的槽不调用提供方且得 `needs_auth`；槽的服务与集成的服务不同被拒；取数中途换绑被拒；回执里没有连接号、凭据引用、令牌引用；被撤权/取消后不再写；`accounts` 只回声明过的服务且只有布尔。

**Feed 一半（同一批，分步）。**
1. `ListenerHost` 与 `FeedConnectorSync` 所有 `await` 之后的写全部走 `commit`（像 `PublicSourceSync`）；`RawEventAdapter` 在 Feed 自己的监听器里允许返回 promise（Runtime 的适配器是 `connector.adapt`）；宿主版行为不变。
2. Runtime Feed：`createListener` 用 `connector.open/pull/adapt`；`connectorSync` 接上；`authorize`（账号型来源）用 `services.connections.describe(slot, 来源号)`，只认 `connected`（宿主版还会实时解析令牌，Runtime 版把「令牌能否刷新」留给取数本身，取数失败就是 `needs_auth`）；`feed.connections.status` 用 `accounts(["github","gmail"])`；账号型来源的 `update` 里「断开」也走这里。
3. Manifest：`connections.slots` 为 `CONNECTOR_REQUEST_SERVICES`（合同里的平台请求来源表，唯一一份）里每个服务各一个 `per_record` 槽，槽号 = 服务号；权限 `connections:use`、`sources:pull_connector` 可选；`sync`、`tick`、`wake` 加这两项，`feed.items.material` 加 `connections:use`，`feed.connections.status` 加 `sources:pull_connector`（翻转时调用者要持有，PR 说明里写）。

**不在这一片、但翻转前必须有（记在这里，不假装做完）：**
- **界面**：Feed 页选来源账号时，除了写 `feed.sources.update`，还要由人的这次操作调 `connectors.plugin_slot.bind@2`；这在 FI-7 Feed 一半的页面改动里做。`config.connection_id` 翻转后只是展示用的记录，取数与授权只认槽绑定。
- **维护**：现有账号型来源的 `config.connection_id` 要搬成槽绑定（安装身份 + 项目 + 来源号 + 服务号 → 连接号），进用户维护窗口清单；搬不过去的（连接已不在、服务不是该槽的）列出来，不静默丢。
- **平台请求来源表里没有的目录连接器**（`feishu`、`lark`、`wechat`、`bitbucket`、`loom`、`adobe`）不能声明槽，Runtime Feed 不支持它们的来源；翻转前要先确认真实 Home 里有没有这样的来源，有就先给表加条目或另裁。

**4c-4 平台一半实现记录（2026-10-26）。** 按上面的设计做完 `services.sourcePull.connector`；Feed 一半（设计第 1～3 步）还没动。

1. **合同**（`packages/contracts/src/platform/plugin-source-pull.ts`）：权限 `sources:pull_connector`（`PLUGIN_SOURCE_PULL_CONNECTOR_PERMISSION`）；`ConnectorPullRequest`（`slot_id`、`integration_id`、`record_key`、`cursor`，可选 `intent.sync_mode`、`settings`）、`ConnectorPullReceipt`（五个字段）、`ConnectorSignalDraft`、`PluginConnectorSourceClient`（`open`、`pull`、`adapt`、`accounts`），`PluginSourcePullClient.connector?`。API 快照已刷新。
2. **Runtime 客户端**（`packages/plugin-runtime/src/source-pull-connector.ts`）：权限要求是 `connections:use` 与 `sources:pull_connector` **都**声明并持有（`accounts` 只要后者，因为它不指记录、只回布尔）；`pull` 还要并行动作、不在只读调用里；槽必须是 Manifest 的 `per_record` 槽，记录与项目的规矩直接用 `services.connections` 的 `slotTarget`（已导出），不另写。请求闭合，`settings` 至多 8 项、键 `^[a-z][a-z0-9_]{0,31}$`、保留名 `token_refs`、`connection_id`、`credential_ref`、`config` 直接拒绝；游标 ≤ 64 KB 的普通数据；原始事件逐字段检查后重建（不用 `as unknown as`）。回执、适配器身份、`accounts` 的答案都由 Runtime 重建，Host 端多带的字段到不了插件。错误码 `plugin.source_pull_connector_*` 六个。
3. **Host 端口**（`apps/local-host/src/connector-source-pull.ts`，`createConnectorSourcePort`）：集成只认 Home 登记里 `kind: "source"` 且 `service_id` 等于槽服务的那个（`connector.source_pull.integration_unavailable`）；账号由 `store.binding(targetScope(target), plugin_id, slot_id)` 读（与 `services.connections` 同一份读法），服务不符、已停用、已断开、授权失效都当没有，回 `needs_auth` 的回执，提供方不被调用；Home 里从没存过账号时不建连接库；取数前后各核一次账号标记（连接号、`updated_at`、三个凭据引用），变了抛 `connector.source_pull.connection_changed`，在途请求挂在 `withConnectorRequest` 下，断开会中止；Gmail 的令牌引用由平台从绑定的连接读成 `token_refs`，不由来源行带；`settings` 里的保留名在宿主端也丢掉。`adapt` 用登记里的适配器，不碰账号。`accounts` 回「Home 里有没有未断开的该服务连接」（与 `feed.connections.status` 同义）。`plugin-source-pull-service.ts` 把端口挂上，`sourcePullIntegrations` 测试接缝经 `createPluginPlatform` → 执行器 → `openHostSession` 传到；沙箱插件拿不到（S-60 的 `sourcePull` 行多列一项权限）。
4. **验收**：`tests/security-invariants-plugin-source-connector.test.ts` 19 个用例，号暂记 RAC-1020（Runtime 在 Host 被问之前拒绝什么）、RAC-1021（取消、撤权、停用、动作拒绝）、RAC-1022（Host 端：绑定、登记、回执、中途换绑）、RAC-1023（经真实平台：只认人绑的、没权限没有 connector、别的安装的绑定不是自己的、晚到的取数被拒）。**号是暂记，RAC-1010～1019 已用完，统筹给范围后改**；SI 表 S-97 行已并入这些规则与测试名。
5. **验证**：新用例 19/19；`security-invariants-plugin-source-pull`、`-plugin-connections`、`-connection-records`、`-sandbox-services`、`-sandbox-background(-host)`、`plugin-host-services`、`feed-runtime-plugin` 过；合同、plugin-runtime、plugin-sandbox、local-host 构建过；`pnpm boundary:check`、错误模型扫描干净；health 只剩已知的 SI 编号缺口。
6. **没做、要接着做的：** Feed 一半（设计第 1～3 步：`ListenerHost`/`FeedConnectorSync` 的写走 `commit`、Feed 里的异步适配器、Runtime Feed 的 `createListener`/`connectorSync`/`authorize`/`feed.connections.status`、Manifest 槽与权限、`PLATFORM_NEEDS`），然后 4e-2e/4e-2f/4e-3。翻转前的三项（界面经 `connectors.plugin_slot.bind@2` 绑账号、`config.connection_id` 搬槽绑定的维护、目录里不在请求来源表的六个连接器）不变。

**4c-4 Feed 一半实现记录（2026-10-26）。** 按上面设计的第 1～3 步，把 Runtime Feed（仍未登记）的账号来源同步接到 `services.sourcePull.connector`；翻转前的三项不变。

1. **写走 `commit`**：`ListenerHost`（`store/listener.ts`）与 `FeedConnectorSync`（`connector-sync.ts`）各多一个可选的 `commit`。Host 不给它，行为与改前逐字节相同（同步写、同一个事务）；Runtime 给调用自己的 `createFeedWriter(...).commit(caller, …)`，等待之后的每一处写都进一次提交：一条信号的接收（`afterSignalAccepted` 在这次提交里同步跑，条目入库与信号一起落或一起不落）、运行开始、运行结束、失败记账与 Inbox 的来源故障。终态写会放掉租约。
2. **异步适配器**：`FeedRawEventAdapter` 把 `toSignalDraft` 做成可等待的，Host 用同步实现，Runtime 用 `connector.adapt`。
3. **Runtime Feed 的接线**（新文件 `runtime-connector.ts`）：`createRuntimeConnectorSync` 把连接器宿主换成平台的 `connector.pull`（账号只认人给这个来源的槽绑定，记录键是来源号），监听器、适配器与账号的显示名都来自连接器服务；`authorizeRuntimeSource`（`feed.items.material` 用）问槽绑定是否还在、账号是否还连着；`runtimeConnectorStatus`（`feed.connections.status`）问 Home 里有没有该服务的账号，只回有无；`releaseRuntimeAccount`（断开来源）把人的绑定从这个来源上取下来。同步中途账号被换、断开、改名，由 `connectionAuthority` 在每个落点前核对，变了就抛 `feed.source_connection_changed`，且不再写任何东西。
4. **Manifest 与权限**：`connections.slots` 由平台请求来源表 `CONNECTOR_REQUEST_SERVICES` 逐项生成，每个服务一个 `per_record` 槽（槽号 = 服务号 = 集成号）；两个可选权限 `connections:use`、`sources:pull_connector`。动作上的权限（`PLATFORM_NEEDS`）：`sync`、`tick` 要 `connections:use`、`sources:pull_connector`、`attention:write`（账号要人时在 Inbox 记来源故障）；`disconnect` 与 `feed.items.material` 要 `connections:use`；`feed.connections.status` 要 `sources:pull_connector`（它不指来源，只回有无，所以不要 `connections:use`）。**翻转时要写进 PR 正文的后果**：这些动作的调用方（工作流程、Agent、MCP 授权、场景）都要持有对应权限，现有授权要补。`feed.connections.status` 不再列在 `NOT_YET`。
5. **验收**：`tests/feed-runtime-plugin.test.ts` 多 7 个用例，号暂记 RAC-1024（按人绑的账号同步、Feed 不留连接/凭据/令牌；没绑账号时要人、提供方不被问）、RAC-1025（账号状态只回有无、材料读取随账号状态、断开取下绑定、Manifest 的槽与权限）、RAC-1026（同步中途换账号、撤权扫描：撤权后不再写，同一个键再问一次只完成一次、条目不重复）。**号是暂记**（1020～1023 已给平台一半，统筹给范围后改）。
6. **已知差别（翻转前要认）**：
   - 账号显示名只来自连接器服务的 `describe().display_name`；Host 版 GitHub 的登录名、范围等展示附加信息暂时没有。
   - `resolveConnection` 在 Runtime 里不再解析账号，`config.connection_id` 只剩展示用的记录。
   - 来源被删除后，人给它的槽绑定不会自动取下（孤儿绑定），翻转前补一个清理，或进用户维护窗口清单。
   - 撤权时被打断的同步会留下一个未结束的运行与已接受的条目（与 Host 里进程中断一样）；同一个键再问一次会把它做完，不重复。
   - Runtime Feed 还没有创建账号来源的路径（`feed.sources.register` 只管公开来源）；账号来源的创建与绑定在 FI-7 Feed 一半的页面里做，测试里直接按 Host 的写法放一行来源。
7. **验证**：`feed-runtime-plugin` 23/23；Host 一侧的 `feed-connectors`、`feed-sync-authority`、`feed-receive-chain`、`feed-sync-concurrency`、`feed-store-declaration`、`inbox-automatic-scenes`、`plugin-runtime-integration`，以及 `security-invariants-plugin-source-connector`、`-plugin-connections` 全过；`pnpm boundary:check` 干净；health 只剩已知的 SI 编号缺口。Runtime Feed 仍未登记，所以 `pnpm actions:update` 与页面资源门禁都没有变化。
8. **没做、要接着做的：** 4e-2e（通知接收）、4e-2f（判断/队列写走 `commit`、`feed.content.receive` 原子化、RAC-492/493/518 项目一半、`evidence:read` 的取舍）、4e-3（翻转 + FI-7 Feed 一半：界面经 `connectors.plugin_slot.bind@2` 绑账号、删 Host 副本、`pnpm actions:update`、PR 正文写权限后果）；翻转前三项：`config.connection_id` 搬槽绑定的维护、孤儿绑定、请求来源表外的六个目录连接器。

**4e-2e 实现记录（2026-10-26）。** `feed.notifications.receive@1` 进了未登记的 Runtime Feed；`NOT_YET` 清单没有了，Runtime Manifest 与 Host 版的差别只剩 `action_scenes`（场景随 4e-2f/4e-3）。

1. **Manifest**：Runtime Manifest 现在带 `notifications.receive`（原来在派生时去掉），指向 `feed.notifications.receive@1`。平台通知服务按这条声明找接收方，取的权限是动作 Manifest 里声明的那些（`declaredNotificationReceivers`），所以动作的 `PLATFORM_NEEDS` 加了 `attention:write`（通知一收到就进 Inbox，写 Attention 条目要动作声明并持有它）；投递方身份与受众不变：工作流受众 + `platform-notifications`。
2. **处理器**（`notification-actions.ts`）：Host 与 Runtime 共用同一份。改动只有一处：它不再是 `async` 函数，来源、条目、Inbox 条目、日志事件都在第一次等待之前写完，错误（身份不对、调用被取消）是**抛出**而不是返回的 rejected promise。这样 Runtime 的 `writing()` 把这一段当作一次提交，抛出就整体回滚；原来的写法下，同步段里一抛错，`writing()` 看到的是 promise，会把已经写的部分提交。等判断（`flushPendingJudgments`）仍在提交之后，Runtime 里还没接判断端口，所以它什么也不做，4e-2f 接上时判断的写自己走 `commit`。`judgmentFailed` 在 Runtime 是空操作，原因同上。
3. **一次提交**：来源（`plugin-notifications:<发送方>`）、条目、Inbox 条目、日志事件同一次提交，日志的操作者是平台通知身份；同一个键再投递回 `created: false`，不重复。
4. **验收**：`tests/feed-runtime-plugin.test.ts` 多 4 个用例，号暂记 RAC-1027（一次提交与按键去重；只认平台的通知服务：用户、别的工作流、别的身份、权限不全都被拒且什么都没写）、RAC-1028（任一检查点撤权：来源、条目、Inbox 条目要么都在要么都不在，两侧都覆盖；平台自己的 `createNotificationDelivery` 把排队的通知交给 Runtime Feed，Feed 停用时通知留在队列里）；Manifest 用例多断言 `notifications.receive`、受众只有 `workflow`、权限含 `attention:write`。
5. **验证**：`feed-runtime-plugin` 27/27；Host 一侧的 `security-invariants-plugin-notification-delivery`、`-plugin-notifications`、`plugin-notification-bell`、`agent-built-plugins-reminders`、`inbox-automatic-scenes`、`schedule-task-runner`、`schedule-operations`、`feed-connectors`、`feed-sync-authority`、`feed-receive-chain`、`plugin-runtime-integration` 全过；`pnpm boundary:check` 干净；health 只剩已知的 SI 编号缺口。Runtime Feed 仍未登记，动作快照与页面资源门禁没有变化。
6. **翻转时要写进 PR 正文的后果**：通知发送方不需要任何新权限；变化只在接收方的权限清单里多了 `attention:write`，由平台投递时按 Manifest 自动带上。
7. **没做、要接着做的：** 4e-2f（判断触发器与队列写走 `commit`、`feed.content.receive` 原子化、RAC-492/493/518 项目一半、`evidence:read` 的取舍）、4e-3（翻转 + FI-7 Feed 一半）；翻转前三项（`config.connection_id` 搬槽绑定、孤儿绑定、请求来源表外的六个目录连接器）不变。

**4e-2f 实现记录（2026-10-26）。** 判断、原子收件、账号来源状态与引用账的补记，都进了未登记的 Runtime Feed；Runtime Manifest 与 Host 版的差别还是只剩 `action_scenes`（场景现在也在，随翻转一起登记）。三个提交：f-1 `4a3d4d496`、f-2 `194221770`、f-3 见下。

**f-1：`feed.content.receive` 原子化，`evidence:read` 的取舍**
1. 处理器不再是 `async`：来源、条目、Inbox 条目、日志事件在第一次等待之前写完，错误是抛出而不是 rejected promise，`writing()` 把这一段当一次提交，抛出整体回滚；收件后的判断在提交之后才开始（RAC-1029）。
2. **`evidence:read` 的取舍（统筹要的那一条）**：读取留存正文要走 `services.sourcePull.evidence`，平台要求动作声明、调用者持有这项权限。做法是给读正文的动作都在 `PLATFORM_NEEDS` 里加 `evidence:read`（`feedQueryActions.snapshot/item`、`feedInboxActions.content/material`、`feedRuleActions.preview/previewJudgment`、`feedContentActions.read`、`feedSubjectAction`、`feedHomeEventsAction`），判断会读正文的动作（`feedSourceActions.sync/tick`、`feedContentActions.receive`、`feedNotificationActions.receive`、`feedRuleActions.evaluate`）同样加；Manifest 里它仍是**可选**权限，没有它的安装读不到正文，条目的正文标成「不可用」，不会让条目读不出来（RAC-1030）。
3. **翻转时要写进 PR 正文的后果**：凡是调这些动作的调用者（Feed 页的人、所有者权限集、MCP 工具、工作流程、Inbox 与 Home 的判断）都得带上 `evidence:read`，否则被拒；这些权限集的更新进 4e-3，不在这一片改。

**f-2：判断（RAC-1031～1035）**
1. **谁判、何时判**：判断在启动它的那个动作里、提交结束之后开始（`JudgmentQueue` 里的 `afterTheStep()`，一个微任务）。不这样，场景的第一次调用会借提交的事务读，被只读场景作用域拒绝。`judgeOwn` 不再是 `async`，步骤自己的错误同步抛出，Runtime 才能整体回滚。
2. **捕捉场景在 Feed 自己手里**：`services.scenes`（绑定、运行）与 `services.judgments`（判断账在 Home 的 Functions 库）；场景回调（`bind`、`consume`、`failed`）经 `beforeEffect` 之后各自是一次提交；`prepare`、`bindings`、`targets` 只读。场景声明了 `attention:write` 与 `judgments:write`（`feedRuntimeCaptureScene`），平台要求调用者持有场景的全部权限，所以**没有这两项权限的调用者不会得到判断**（场景悄悄不可用），不是报错。
3. **正文只能在动作里读**：场景回调里读不了证据，所以启动判断的动作先读好条目的正文，经 `AsyncLocalStorage` 暂存给它起的回调，条目在中途变了（修订号不同）就拿新的、不带正文的条目，判断自己看到它动了，什么都不记录（RAC-1032）。
4. **Home 与 Inbox 的判断走动作目录**：用当前动作的调用者问 `home.judgment.evaluate`（已有）与 `inbox.judgment.evaluate`（新文件 `inbox-judgment.ts`），不用 Host 的「workflow-events」身份。因为场景回调碰不到目录，场景里新开的 Inbox 条目留在队列里，由启动它的动作（`judgeOwn` 的 `takeEntriesOfItems`）接着判。
5. **规则保存是提交**：`feedRuleActions.create/update` 先等（判断预览）后写，所以改成自提交动作（`SELF_COMMITTING`），保存走 `writer.commit`；场景配置的 `bind`/`save` 也是回调内的一次提交，按调用者看到的修订号提交，修订号不对被拒（RAC-1034）。
6. **会写 Attention 的条目动作补了声明**：`feedInboxActions.admit`、`feed.items.inbox/disposition/restore` 原先写 Attention 却没声明 `attention:write`（Host 里没人查），现在声明；`disposition`、`restore` 还要判断，所以并行（`CONCURRENT`）。
7. **新增 Manifest 必需权限**：`scenes:use`、`judgments:read`、`judgments:write`、`actions:delegate`。
8. **验收**：`tests/feed-runtime-plugin.test.ts` 多 7 个用例，号暂记 RAC-1031（收件判断：判断账一行、Inbox 条目、Inbox 与 Home 的判断都被问到、日志事件）、RAC-1032（同步用暂存的正文判断；判断途中改了规则什么都不记）、RAC-1033（任一检查点撤权：条目与事件绝不先于判断账出现，之后不再写）、RAC-1034（经平台场景配置保存绑定，旧修订号被拒）、RAC-1035（admit → Inbox 与 Home 判条目；归档关条目；恢复）；RAC-509 的撤权扫描同时覆盖收件与规则保存。

**f-3：RAC-493、RAC-518 的项目一半**
1. **为什么用常驻作业**：事件投递（`onEvent`）只有同步的 `beforeEffect()`，没有动作作用域：用不了 `services.connections`，写不了 Attention。能做的只有常驻作业（`services.background.keep`，可以在 `start()` 里起；作业权限 = Manifest `background.jobs` 里声明的，这里是 `connections:use`、`actions:invoke`）。先例是 Schedule 的 `runtime-reconcile.ts`。
2. **作业 `feed-reconcile`**（新文件 `runtime-reconcile.ts`）：启动时先把项目库留着的每个来源的所有正文引用补登记到 Home 的引用账（`feed.content.hold`，幂等，RAC-518 项目一半：库是拷进来的、账里没有也补上）；然后对每个账号来源问槽绑定的账号现状（`connections.describe(槽, 来源号)`），账号不可用就把「活动」的来源改成 `disconnected`（`last_error_code = sources.connector_disconnected`），可用了就改回，人暂停的保持暂停，没绑账号的不动（同步时会告诉人）；之后每次 `host.connection.changed@1` 再看一遍。事件到来时作业忙着也不会丢（`createConnectionWatch`）。写走 `writer.commitAs(control, 插件号, …)`，只改读到的那一版来源。
3. **Manifest**：可选权限 `connections:observe`；`events.subscribes` 加 `host.connection.changed@1`；`background.jobs` 加 `feed-reconcile`。没有 `connections:observe` 时作业仍在启动时跑一次，只是不会随事件醒来。
4. **和 Host 版的差别**：Host 的 `refreshSourceConnectionState` 按 `config.connection_id` 找来源；Runtime 按槽绑定找，账号被整个删掉（绑定没了）的来源保持原状态，下一次同步变成「要人」；这一点和翻转前的「`config.connection_id` 搬槽绑定」维护一起核。
5. **验收**：`tests/feed-runtime-plugin.test.ts` 多 3 个用例，号暂记 RAC-1036（启动时就跟上账号，包括 Feed 停着时发生的变化）、RAC-1037（连接变更唤醒：账号不可用 → disconnected，可用 → active，暂停的保持，没绑账号的不动）、RAC-518（启动补登记引用账，重复启动不重复登记）。

**验证**：`feed-runtime-plugin` 37/37（4e-2e 后是 27）；Host 一侧 20 个文件全过（`feed-capture-scenes`、`feed-inbox-lifecycle`、`feed-inbox-scene-runtime`、`feed-out-rules`、`feed-inbox-pages-loop`、`feed-sync-concurrency`、`home-event-actions`、`home-action-scenes`、`home-judgment-plugin-caller`、`home-mcp-actions`、`inbox-automatic-scenes`、`inbox-action-scenes`、`security-invariants-plugin-judgments`、`content-station-request-id`、`feed-sync-authority`、`feed-receive-chain`、`feed-connectors`、`plugin-runtime-integration`、`functions-scene-configuration`、`security-invariants-connection-changed`）；`pnpm boundary:check` 干净；health 只剩已知的 SI 编号缺口（`FeedApplication` 没有变大：作业用 `snapshot()` 列来源，不加新方法）。Runtime Feed 仍未登记，所以动作快照与 API 快照没有变。

**号码**：RAC-1031～1035（判断）、1036～1037（账号状态）暂记，加上之前的 1029、1030，统筹给真实号段；S 号这一片没有新增。

**没做、要接着做的：** 4e-3（翻转 + FI-7 Feed 一半：界面经 `connectors.plugin_slot.bind@2` 绑账号；删 Host 副本，含 `connector-source-state.ts` 与 `refreshFeedConnectionState`；所有者权限集、MCP、工作流程补 `evidence:read` 等；`pnpm actions:update`；PR 正文写权限后果）；翻转前三项不变（`config.connection_id` 搬槽绑定、孤儿绑定、请求来源表外的六个目录连接器）。

## 13. 固定 WIP 的批 C 接续合同（2026-10-27）

本节替代上文历史记录中的“等统筹”“尚未登记”作为本次执行状态，不改已经确认的产品决定。唯一输入是 `0ea746bc2e2092abc4210b05ee3a1b513191f5d8` 与 Root 2026-10-26 14:37 的149项固定 WIP（combined一次、五个未跟踪原文）；本地来源检查点 `3c5f557e06d6aaaf7a2224952f3ec214dd1ac0c9` 保存原贡献。基于准确 A+B `0c37d1c3c078b9c9dc911967de9018023234b9a1` 只组合 FI 增量，原 source 栈不成为最终候选祖先。来源原件、首败与既有正式评审保持各自范围；旧9/14不当作新组合运行结果。

目标是既有 FI 动线在临时真实 Host/HTTP 与独立浏览器中完整可用，并满足相应工程门禁；不宣称真实 Home 或本人验收完成。Feed 项目实例拥有行、材料、来源、规则和运行记录，Home 实例拥有引用账与 collector；同 install_id 不能合并两份库或授权。保当前 Goals/Memory/PG111/W5-15、S89、BL530、BL755、PG077及 Inbox 按实际运行归档 Manifest 的 owner 投影；不恢复旧 Goals 模块、宿主 Feed 私路或内置特权。FI7 收完插件 Manifest/routes、页面插件前缀、槽账号 UI、舞台和新路由后才减装配冻结表。来源账号仅由本人经 `connectors.plugin_slot.bind@2` 按项目/安装/来源绑定，不把 connection_id 写进 Feed 配置。

平台 sourcePull 安全号统一 S-97、Home collector 为 S-98；源分支 S-97/S-98 的暂定号不能覆盖别条现义。既有接受的六个 P1 与一个有效 P2 按以下验收修复，编号写入实际测试名或注释：

| 验收 | 最小行为与独立期待 |
| --- | --- |
| FI-C-01（平台 P1-1） | 连接绑定 owner 的成功 bind/unbind/删项目/删安装通知已有在途登记，读绑定后、首个 await 前登记本次账号与槽；解绑/换绑/ABA使旧调用永久失效，最后 await 后同步 current 再发请求及交回结果。同账号其他槽不被误杀。 |
| FI-C-02（平台 P1-2） | 本次控制经 Host/driver/SDK/provider、health、真实 fetch、Gmail与通用 OAuth、BL530 call connections到底；组合取消与超时，后续请求和刷新/拒绝标记持久化前重核调用与原账号 revision。只有取消原动作、账号不变时仍零后续发送/零刷新写回，失效错误不吞成认证失败。 |
| FI-C-03（业务 P1-1） | promote、goals.context、rules.recommendations三动作声明 evidence:read，实际Web/Agent/MCP/工作流程/Inbox/Home调用方与安装授权同时核。真实有证据正文的同步材料可读/可升格，缺权限在入口拒绝，平台三重检查不削弱。 |
| FI-C-04（业务 P1-2） | hydrate按正文引用 owner 读取；research引用沿研究库已有body/preview/provenance，只有证据库引用交 evidence 客户端。真实Runtime研究库同步后公开条目/snapshot/content/subject与规则的下一次读有效；取消与撤权不能被吞。 |
| FI-C-05（业务 P1-3） | caller最后一次认权 await 后，在同步事务体核本次固定来源版本/配置/生命周期，再写材料、游标、投递和成功/失败终态。公开源、研究库、Listener adapter、账号源与scheduler均守住；自己已提交的版本按各步骤实际预期推进。确定性交错改配置/暂停/删除后旧结果不落库。 |
| FI-C-06（业务 P1-4） | release每批不超过5000、forget每批不超过1000；真实清理失败保来源及引用/operation IDs供幂等重试，删除事件仅成功删除提交一次。无complete_since主动保留正文与异常失败分开；共享引用不误删，不假称跨Home/项目原子回滚。 |
| FI-C-07（有效 P2恢复） | 启动补hold同样分批，Home暂不可用后有限重试并保留恢复依据；后续连接变化/重启能继续，而非吞异常后永久缺登记。缺完整标记仍保正文。 |

实现顺序：先保完整来源、按 owner 合并当前 A+B，再修既有绑定失效及透传控制，再补业务权限/引用 owner/最终事务版本与可重试清理，最后完成 FI7 真实入口和共用生成物。保持同步事务前缀与 await 后显式 commit；Goal动作已提交而Feed后续被取消时，重试不能重复创建Goal/输入。允许路径限既有 FI 相关 Host、contracts/SDK/Runtime、connector/transport/OAuth、Feed/Inbox消费者、对应测试与现有规格；不新建协调框架、schema迁移或兼容旁路。

核验沿现有 `scripts/run-tests.mjs` 的具名定向文件与原第一失败，必须测试实际生产 provider/refresh resolver/runner/owner调用链；自制port stub不能证明发送或写回已停。真实临时Host覆盖Feed两半重启、槽换号、hold/正文/共享保留、删除重试、Inbox/Pages/Goal、规则排程与权限不足；真实测试Chrome验新路由/刷新/失败恢复。独立TEST不改断言，SOURCE只评新增修复和未覆盖4e2/collector/翻转。构建、API/actions、registry/inventory/table-owner、health/security/assets及唯一最终CI/Full按Root资源队列接续；当前阶段仅源码，不占独立TEST的build/browser槽。

不启动 R62/R63 等新需求、六种未支持连接器、真实Home/4207、旧库回填或完整性标记、安装/发版、BL739/RAC999维护。fa04仅取既有RAC482读取路径段；公共文件和准确资源额度只在真实合成树上更新，不沿旧源预算或放宽门禁。必须修、非阻塞恢复和验证缺口逐项保实际owner、提交、独立复审/验证与真实采用，登记不代表闭环。

组合检查点 `d7da3e05c9f36a111261c0a431a6c6152dc71edd` 已保全固定来源与72处冲突解决；`11bf8bbba23a9107085c003d2e3c794565db5feb` 普通合并准确 AB `63d7b896`，包含0c之后11路径末尾修正，尚不代表工程通过。Inbox 的 #1295 投影通过现有平台 Attention query 暴露 `listInbox/getInbox`：每次从可信项目连接读取实际 running 安装及确切归档 digest 的 `attention.inbox`，保留未分配条目，普通 list/get 语义不变。Inbox 列表、详情、场景与 Pages 共用该投影，状态变更在原异步 admission/认权之后的同步事务体再次读投影；Feed 只拥有自己的事项，不读取 Goals 私表。Pages 消费形状沿 Inbox 已有 pages-shapes，不恢复删除的公共 Pages 合同或增加插件实现依赖。此适配沿现有 RAC-807/808 与运行安装/归档/owner 反例验证。

FI-C-02 的控制是必需参数：Host test/invoke、driver health/poll、SDK binding、Provider health/sync 和 OAuth resolver 都不能在缺控制时联网。现有独立账号读取组合账号当前修订与已有调用者控制，动作入口传原 caller 的 signal/beforeEffect；FI sourcePull 和 BL530 保原调用、槽、账号及安装整组控制。沿现有 serialized 刷新顺序，不新增队列；刷新后先认权，再同步核账号 revision 与当前令牌后落盘，拒绝标记也受同样控制。超时和请求结束使本次控制失效。Public HTTPS 固定合法 DNS 后最后认权、同步 current，随后才构造请求，原地址、来源、方法、大小及凭据限制保留。

SOURCE `1dad39c1` 的 Notion 并发取消 P1 随本片修复：保留原 Home/账号共享刷新去重，每个调用以自身控制认权后参与；取消一方只退出该调用，最后有效调用退出才中止共享传输。发送及持久化前重核有效参与者与原账号 revision/refresh 值，已结束或中止的共享项不接纳新调用；每方返回或抛错仍重核自己的控制，不能把另一方的取消转成认证失败。定向反例沿真实 Catalog 接线到 Notion resolver，覆盖两个已等待调用的两种取消顺序及全取消零后续请求/零落盘，原同 Home 去重与跨 Home 隔离正控保留。

Root 追加的既有 SYS52 首败随 C 收口：Full `40440700816/63d7b896` 原始快照显示 Goal 标题 Text 已断开、选区为空而 frame 仍正确。修复只在标题或结果字符串变化时替换内容；同值生产重绘保原 Text 与真实选区，真实变化仍更新。补实际生产 Frame DOM 路径的确定性反例，保原 More、10秒超时及全部原断言，不修改冻结 AB。Owner PIPE，原件由 Root/TEST 持有，最终 C Full 核验；重试通过不等于已修。

**2026-10-27 暂停交接（用户要求推送最新工作后暂停；下述均为候选，不能记成整批完成）。** 当前分支 `feature/anticorruption-closeout-c`，最后生产/测试改动检查点 `009b773f060ac61ceaa041b68d7681e075709b0a`，tree `0d716a408bb6de3f8ff1303c3050c66af2377678`。该点工作树干净；随后仅补本节交接文字。已采用 main 的祖先关系：`7f8358aecca1e5b0e9c1b593da440dc868554b5f` 的两父为 `1dad39c1efb00ddfee64e4c3c0b4e54dde84c9dd` 与 A+B 实际合入 `9efbf8d044b580c054b93229f9d99264383ea476`，该次合并前后 C tree 严格相同。A+B 最终 `63d7b896` 与 main `9efbf8d0` 的 tree 相同；不得据此声称 main 已采用 C。

| 固定检查点 | 已完成与证据边界 |
| --- | --- |
| `028a952e68eda35cdd6d7fa8817dc7c3663d4bc0` | C01绑定owner在成功bind/unbind及三种批量删除后通知原在途登记；同槽ABA永久使旧调用失效。同账号旁槽隔离、bulk通知及原拒绝断言作者文件33/33（含子项）通过，整体build通过；SOURCE接受。该轮“其他槽”原例只是变更后新拉取，真正两条在途例在C02后补；不据此声称Host close已等待所有底层子任务。 |
| `1dad39c1efb00ddfee64e4c3c0b4e54dde84c9dd` | C02必需控制贯通Host/SDK/provider/OAuth/BL530/DNS发送边界。真实Runtime→默认registry→生产Gmail取消、双在途ABA与tokenRefs刷新取消；通用OAuth等待取消保原凭据/拒绝状态；真实runner→broker→Host TLS401→生产OAuth取消及DNS最终等待拒绝，已保原件。整体build通过；SOURCE确认这些主要修复，但发现同账号Notion共享刷新取消P1，不能关闭C02。 |
| `2b8c8ccc3e3f7a2f5e3b824afa584099fb3288a0` | 仅三处测试适配：Listener账号展示取实际绑定integration.account；RAC890指向现行connector-source-pull；S70取消以真实fresh-access落盘为相位，断言自身原错误、零第二次TLS发送。SOURCE接受适配，未改生产或放宽业务断言。 |
| `009b773f060ac61ceaa041b68d7681e075709b0a` | Notion保原Home/账号去重，改为有效参与调用共同维持共享刷新；单方取消不误伤旁调用，最后参与者退出才abort。发送及落盘前仍核有效调用、原revision/refresh值；结束项不再接纳新调用。真实Catalog接线反例覆盖取消首个/第二个调用、全取消零写回，原同Home去重/跨Home隔离保留。整体build及两整文件作者验证通过；最新源码复审没有必修项，补测与取舍见下文「FI-C-02 Notion 复审与补测」。 |

原始本机证据目录 `/tmp/molis-verify-2026-10-26/closeout-c/` 保留01–31日志、命令、自然退出码和固定检查点patch/json；原失败没有覆盖。18整体build自然0/43.3706秒；19三个首败文件重跑自然0/7.7349秒（Runtime Gmail5/5、通用OAuth20/20、Gmail边界5/5）；20真实沙箱OAuth/DNS文件7/7、自然0/2.6875秒（此次Darwin实际执行、不是Linux证明）；22消费者14文件有6红，适配后的24仅复跑这6文件均通过（S70 11/11、registry17/17、Feed connectors13/13、connections9/9、catalog trust4/4、pagination7/7）。18之后Notion生产改动的最新整体build是29，自然0/17.3320秒；30运行 `node scripts/machine-slot.mjs run browser --label "C Notion shared refresh author" -- node scripts/run-tests.mjs --jobs 1 --browser-jobs 1 --retries 0 tests/connector-oauth-choice.test.ts tests/security-invariants-connection-refresh.test.ts`，自然0/5.0448秒，两文件分别9/9与11/11，无跳过/取消/重试。27是新fixture缺access导致账号建档拒绝，不能当产品反例；修正fixture后28在旧生产实现准确因取消首个调用导致共享signal误abort而红。作者验证不冒充独立TEST、完整security或最终Full。

业务基线26在 `2b8c8ccc` 上运行 `tests/feed-runtime-plugin.test.ts`：35/38通过、自然1/21.5691秒、无跳过/取消/重试。三红仍未修改：RAC509规则保存测试caller仅WRITE，缺动作已声明的attention:write/judgments:write；RAC518“held body exists”读取默认runner Home而实际sourcePull写fixture Home；RAC1030删除正文也删默认Home，实际fixture正文未删除。这些是当前代码与失败定位得到的fixture根因候选，尚未修复/复跑确认；后续须按真实owner绑定修测试，不放松权限和正文断言。26原文件38项没有覆盖C03遗漏的三动作正文成功链，也没有覆盖C04研究库同步后的下一次读取。

接手顺序为：先核Notion准确head复审，如有must-fix先修；随后完成C03–07，再补Inbox和FI7/SYS52的实际运行及最终合成验证。C03当前仅安装声明evidence:read，动作级promote、linkedContext、recommendations仍缺；须三处加声明并用真实同步正文证明推荐、升格、Goal上下文和缺权限入口拒绝。C04 hydrate仍把所有content_ref送证据库；只将`molis-work-feed/sha256/`交原evidence客户端，`research:<id>`沿已有item.body/material.preview/provenance，补Runtime同步后item/snapshot(include_contents)/content/subject/规则读取。C05各来源最后await→同步事务仍须核固定来源版本/配置/生命周期；C06真实清理失败须保来源/refs/operation IDs可重试、release≤5000与forget≤1000分批；C07启动补hold须分批及有限恢复，不能吞异常后永久缺登记。以上均未因本次登记而算实现。

Inbox的listInbox/getInbox投影及状态提交重读已在028实现，但运行拒绝矩阵未完成；`tests/security-invariants-attention-inbox.test.ts` RAC808仍导入已删除createLocalFeedApplication并将Feed当全局Inbox，须迁到实际Runtime Inbox/平台投影，保owner/同kind隔离、未分配条目和停用/归档digest/最后admission之后停用拒绝。FI7 Feed一半仍留`feed-native-plugin-http.ts`与Host调用，须迁Manifest/routes/插件前缀，UI账号绑定用`connectors.plugin_slot.bind@2`真实来源record key，保刷新错误及冻结列表；Inbox一半不重做。SYS52最小DOM同值重绘修复尚未开始，不能将AB Full一次重试过算已修。

最终C合成树尚未统一刷新API/actions、registry/inventory、table-owner/S号、SSOT、baseline和页面资源；不得取旧源数字或开门禁例外，必要health/security及唯一CI/Full由全线统筹排期。当前没有C PR、云Full或最终独立验证通过结论。暂停前最后一批本地测试30已自然退出；build/browser公共槽空闲，没有待取消命令。主checkout、真实Home4207、旧库维护和用户验收均未操作。恢复须从本分支准确新head与最新main/在途事实接续，保原贡献与失败证据，不重放旧原始WIP，不继续旧逐层共用文件同步流程。

**2026-10-27 续做（统筹 10-27 负载控制下：只跑非浏览器用例、一次一个文件、`--jobs 1`，只构建改到的包；作者验证，不冒充独立 TEST 或最终 Full）。** 基线工作树 `fe93d322f`（`../baseline-fe93-c`，用后删除）。下表各点都在本分支上，推送头见统筹回报；日志在工作树 `.impeccable/qa/c-*.log`（已忽略，不入库）。

| 检查点 | 已完成与证据边界 |
| --- | --- |
| `f695bd1e1` | FI-C-03：`linkedContext`、`recommendations`、`promote` 三动作声明 `evidence:read`；FI-C-04：hydrate 只把 `molis-work-feed/sha256/` 交证据客户端，`research:<id>` 沿同步时的 body/preview/provenance。`tests/feed-runtime-plugin.test.ts` 的 FI-C-03（真实同步正文进推荐、升格、Goal 关联材料，缺 `evidence:read` 在入口拒）与 FI-C-04（研究库同步后各读动作）在下行整文件 46/46 里通过。同一提交按真实 owner 修了 2026-10-26 记的 RAC509/RAC518/RAC1030 三红的夹具根因（RAC-509 的 caller 补规则场景权限；ledger 替身的回收与正文读取绑到夹具 Home；启动顺序按集合比较），断言不放宽。 |
| `aa56bfeb1`、`a4aca4b90`、`1eb2b9075` | FI-C-05：同步事务体内按读取时的来源版本、配置与生命周期再核一次，公开源、研究库、账号源/Listener 与 tick 被交错改动（暂停、改配置、删除）后旧结果不落库；`1eb2b9075` 修了扫测找出的一处：来源检查拒掉的拉取不再留检索记录（扫测只放行被拒拉取自己的记录被忘）。四个 FI-C-05 扫测 4/4；把来源核对改成恒真后四例全红（变异证明）。 |
| `25c61a040`、`50ff43963` | FI-C-06：release 每批 ≤5000、forget 每批 ≤1000；中途失败保留来源与未到的引用/记录，可再删，删除事件只在真正删完后提交一次；无完整标记时保留全部正文，不算失败。FI-C-07：启动补登记分批，Home 引用账不应答时按 `FEED_HOLD_RETRY_DELAYS_MS` 有限重试，之后每次连接变化再试直到成功。`tests/feed-content-ledger.test.ts` 11/11（单元用例按次数等待，不靠墙钟）；`tests/feed-runtime-plugin.test.ts` 46/46，无跳过/取消/重试（含 FI-C-07 的 Runtime 启动例与 FI-C-03/04/05 各例）。 |
| `cd8b4fe52` | `tests/feed-sync-concurrency.test.ts` 改从夹具取 `createLocalFeedApplication`（local-host 在 `d7da3e05c` 改名为 `createDemoFeedApplication`，那之后的老红），7/7。相关同步文件：lease 4/4、actions 1/1、sources 11/11。`tests/feed-sync-authority.test.ts` 17/18：「public RSS grant-revoked」一例在基线 `fe93d322f` 上同样红（第 134 行得到 `reconciliation_required`/`ambiguous_transport`），不是本批引入，未修，原断言未动。 |
| `2c42a574e` | RAC-808：`tests/security-invariants-attention-inbox.test.ts` 改测真实 Runtime Inbox（平台投影按运行中安装的归档 Manifest；准入之后停用的主人，本次调用读不到也改不了），S-68 引用同步；4/4，把投影改回不看运行状态后两条 RAC-808 都红。 |
| `9dc5e3a91` | SYS-52：Goal Frame 重绘时标题与预期结果的字没变就不换 Text 节点（选区保留），字变了照常更新；删掉一处无用的 `setAttribute`。`tests/workbench-frame-container.e2e.test.ts` 新增确定性反例（真实 Frame DOM 路径、同值重绘保 Text 与选区、换 Goal 后更新），原 More、10 秒超时和全部原断言不动、冻结 AB 不动。浏览器用例在负载控制下没有在本机跑，留给 CI/最终 Full。 |
| `cb5f6e287` | 动作合同快照按合成树刷新（Feed 进 Runtime 后的声明、Home 引用账三动作、`feed.sources.wake`、宿主为 Feed 安装多出的 8 个 `sdk.artifacts.plugin-install-*`）；`tests/action-contract-snapshot.test.ts` 25/25。 |
| `21d0e40ef` | FI-5 删掉的 `modules/feed`、`modules/sources`、`modules/signals`、`horizontal/listener-host` 从 `scripts/workspace-packages.mjs`、SSOT 包表、§5.1 包清单删去（健康门禁原先在读 `modules/sources/package.json` 时崩溃）；§5.1 的 Feed、Inbox 两行按代码重测，状态为 Runtime。`package-inventory --check`、`package-owners` 通过。 |
| `cc74083d8` | 合成树带来的健康门禁问题：`native-content-permissions.ts` 改回 main 的做法（按 plugin_id 从构建登记读 Pages、灵光的工作流内容站，权限集合逐项相同 22 项），灵光不再在包外被点名；`error-owners.json` 删掉已不存在的 `research-library-source.ts`；两份 README 与 CALL-CHAINS 第 5 行的断链；S-73 的文字与测试名跟上用户 2026-10-26 的决定（S-43 已改）。 |
| `798004d7d` | 第三次健康门禁找出的本批问题：`demo-feed-library.ts` 直接把 `SqliteDatabase` 交给 `projectVersionStores`（与 `project-version-stores.ts` 同一类型），夹具的 Listener 回调改用 Feed 导出的 `providerItemOf` 收窄连接器事件，两处 `as unknown as` 去掉；`ConnectorConnectionStore` 的 `forgetBindings` 移到类外（方法数回到 merge-base 的 25），`FeedConnectorSync.run` 把来源能否拉取的检查拆成 `assertConnectorPullable`（153 → 145 行），没有登记巨大单元例外；`tooling/gates/api` 按合成树刷新 5 份公开 API 快照（见下）。connector-host、Feed 构建与 local-host `tsc` 通过；逐个文件：`security-invariants-connection-records` 18/18、`feed-runtime-plugin` 46/46、`feed-sync-concurrency` 7/7、`feed-connectors` 13/13、`feed-sync-authority` 17/18（同上一行的旧红）。之后 `node scripts/check-health-gates.mjs --base origin/main`（merge-base `9efbf8d04`）只剩 FI7 的 `hybrid plugin feed host-files 0 → 1` 一项，没有巨大单元例外的改动。 |
| 四个红文件对 `fe93d322f` | 两边测试文件逐字相同，一次一个文件、`--jobs 1 --retries 0`，本分支与基线 `fe93d322f` 结果一致：`home-mcp-actions` 两边 0/1，都在第 113 行 `assert.ok(homeItem)`（Home 事件里找不到该 Inbox 条目）；`plugin-query-consumers` 两边 0/3，第 39 行得到 `undefined`、期望 `null`，两条 information proposals 得到 `actions.forbidden`、期望 `actions.plugin_disabled`；`goals-mcp-grants-fixture` 两边 4/5，「an action the project cannot use is refused until its plugin is installed there」中夹具 `tests/fixtures/goals-mcp-grants.ts:48` 先查「是否提供」就抛普通 Error，请求到不了服务端的 `actions.plugin_disabled` 拒绝；`feed-item-actions` 两边 0/1，第 44 行缺 `context-ledger:write` 的调用方 `discover` 里根本没有 `feed.items.promote`（不是列出为不可用）。两边一致，说明不是 10-26 之后引入；`fe93d322f` 是本分支 10-26 暂停时的头，不是 main，与 main 的对比见下一行。 |
| `3c961464a` | 边界检查（用户 10-27 批准，统筹转达）：`scripts/check-package-boundaries.mjs` 读合成时删掉的三个宿主 Feed 文件而崩溃，三处改指向现在的位置——`legacyCallers` 两个已删文件换成 `demo-feed-library.ts`；Listener 一条改查 `plugins/native/feed/src/runtime-connector.ts` 经 `services.connector.open(` 打开；Goal 读 SQL 改查 `demo-feed-library.ts`。检查项一条不删，不加「文件不存在就跳过」。评审 `8800e07bf` 指出两处必须改（不改就比原来松），由 `a91f7bc25` 改完。第一处，SQL 主人线原先漏了生产装配的继任文件 `plugins/native/feed/src/application-assembly.ts`；现在扫 Feed 源码里 `store/` 以外的全部文件，点名的几个照旧逐个读。第二处，Listener 的宿主一半原先锚在 `home-plugins.ts` 的集成包登记，那条链管的是另一件事；现在锚到给 Feed 供连接器的 `plugin-source-pull-service.ts`，要求 `connector: createConnectorSourcePort({… homeIntegrationRegistry(home) })`，并钉住 `plugin.ts` 的 `connector = sourcePull?.connector`。评审的一条建议也一并做了：Goal 读 SQL 同样查 `application-assembly.ts`、`plugin.ts`、`goal-promotion.ts`。`node scripts/check-package-boundaries.mjs`：`errors: []`；对每条新规则都做过变异（写进违规的 SQL、换掉登记表、换掉连接器来源），各自报错。FI7 时 Feed 规则再照 Inbox 改成「宿主没有 `/api/feed`、Manifest 声明 routes」。 |
| 四个红文件对 main、`14612390b`、`a7b722fa9` | 干净的 main 工作树 `9efbf8d04`（`git worktree add --detach`，desktop 与 server 单独构建；整包构建在本机 Swift 步失败，环境问题），一次一个文件：四个在 main 上全绿（home-mcp-actions 1/1、plugin-query-consumers 3/3、goals-mcp-grants-fixture 5/5、feed-item-actions 1/1），所以都是批 C 的回归，在 C 里修，断言不放宽。根因与改法：① `home-mcp-actions` 是**产品回归**：Feed 进 Runtime 后用自己的 plugin id 写条目，平台只列主人在 `attention.inbox` 声明过的种类（PG-094 S12），Feed 的 Manifest 没声明，条目与来源故障都不进 Inbox 和 Home 事件；`14612390b` 声明 `attention.inbox: ["feed_item", "source_fault"]`。② `plugin-query-consumers`：Feed 动作带上所用平台服务的权限后（4e-2f），测试调用方缺 `evidence:read`、`attention:write`，`a7b722fa9` 按 4e-2f 补上，断言不动。③ `feed-item-actions`：缺 `context-ledger:write` 的调用方在目录里**看不到**升格（`visibleAction` 按声明权限隐藏），原断言「列出但不可用」改成断言升格声明了这项权限、且目录里不存在；直接调用被拒的原断言不动。④ `goals-mcp-grants-fixture`：没装 Feed 的项目不启动 Feed 的 Runtime，没有这个动作可给：夹具在「是否提供」处拒，直接授权得 404 `actions.missing`，且不留授权记录（原先期望 `actions.plugin_disabled`）。③④ 是 Feed 进 Runtime 带来的预期变化，请评审确认。修后：home-mcp-actions 1/1、plugin-query-consumers 3/3、goals-mcp-grants-fixture 5/5、feed-item-actions 1/1；Manifest 改动后的回归 `security-invariants-attention-inbox` 4/4、`feed-runtime-plugin` 46/46。 |
| `inbox-plugin` 对 main、`a7b722fa9` | Manifest 修好后 `tests/inbox-plugin.test.ts` 的 Attention 一例转红（第 268 行重开后列表为空；main `9efbf8d04` 上 2/2）。原因：Feed 的 companion 是 Inbox，`removeProjectPlugin(inbox)` 连带把 Feed 移出项目；测试只加回 Inbox，Feed 仍不在项目里，它的条目按 PG-094 S12 保留但不列出（main 上 Feed 是宿主模块，不受这条约束）。`a7b722fa9` 断言连带移除、断言只加回 Inbox 时列表为空，再加回 Feed，原断言「reopening registers actions and retains the real business state」不动；2/2。**用户看得见的变化**：在 main 上，移除 Inbox 再加回，Feed 的消息照样回来；在 C 上，要再加回 Feed 才回来。连带移除是现行设计，不挡合并，本稿不加新需求，提示记为 BL-800。按代码读（没在浏览器里看），提示现在有三种情况。项目 Dock 第一次点移除时写「再点一次移除；同时移除：Feed」，移除后再提示「同时移除了：Feed」。插件市场给当前项目移除时没有二次确认，移除后同样提示「同时移除了」。插件市场给别的项目移除时，只显示「已移除自 <项目>」，不提 Feed。加回 Inbox 时，哪里都不提 Feed。另：这个文件在本分支会记 17 条 `workspace-settings opened_announce_failed`（`actions.missing`），因为 Inbox 路由改走 `/api/plugins/…` 后触发 `announceProjectOpened`，而测试自建的宿主没注册 `projectSettingsCapabilities.browsingWorkspace`；只是告警日志，不影响结果，未改。 |
| `e5d3cdaeb`、`03eb459c9` | FI7 Feed 一半：15 条页面路由写进 Feed Manifest（`/api/plugins/io.molis.work.feed/…`），`createFeedPlugin` 照 Inbox 的写法绑定，以发请求的人的身份调 Feed 自己的动作；条目与来源的 `:action` 只认声明的几种，其余拒为 `feed.request_invalid`（原先落到归档、同步）。工作台与条目详情两段 HTML 归外壳舞台：`/api/stage/feed`、`/api/stage/feed/items/<id>`。来源目录回到 Feed 包。删 `feed-native-plugin-http.ts`、它在 index 的导出、`web-request` 的 `feedRoute` 和 `NATIVE_PLUGIN_HTTP_FILES` 的 `feed`（文件删了，冻结名单与磁盘逐项一致，跟着减）。Gmail OAuth 回调地址不动。`03eb459c9`：边界检查的 Feed 规则照 Inbox 改成「宿主没有 `/api/feed`、Manifest 声明 routes」（用户 10-27 批准）。 |
| `5fd4ecd77` | 改后定向跑出的问题与测试迁移。① **产品回归**：快照路由读来源目录，被 S-97 拒为 `plugin.source_pull_call_required`。原因是词表只能在 Feed 自己的动作或任务里读，路由不算。改法：快照不再回 `source_catalog`，页面用外壳的 `feed_source_catalog`。② 单库服务的 `runtimePluginsRoute` 只放行个人插件，到不了项目级 Runtime 路由。`feed-sources`、`plugin-query-consumers`、`web-home-isolation` 因此改用目录里的项目和 `/projects/<id>` 前缀，断言不放宽。③ OPTAREA-02 是预期变化，请评审确认：项目没装 Feed 时它的 Runtime 不启动，动作不在目录里，拒为 `actions.missing`（原先期望 `actions.plugin_disabled`），仍记一行未执行。④ 阅读页取数 `feedItemForReader` 从 local-host 导出，`feed-goal-promotion` 按外壳舞台的调用测按钮跟着升格动作走。⑤ 其余测试与 6 个浏览器用例改指新路径，浏览器用例只写未跑；路由表快照重生；skills 跟上 Feed、Inbox 已迁走。逐个文件 `--jobs 1 --retries 0` 都通过：feed-sources 11/11，以及 plugin-query-consumers、optional-areas-call-log、web-home-isolation、feed-native-plugin、feed-out-rules、feed-item-actions、feed-source-actions、builtin-plugin-assembly-gate、web-route-table。同一批之前已过：feed-inbox-schedule-error-model、feed-goal-promotion、feed-promote-reader、functions-system-capability、home-mcp-actions、inbox-plugin。 |
| `e8cab012f` | `node scripts/check-health-gates.mjs --base origin/main`（merge-base `9efbf8d04`）通过，原先那一项 `hybrid plugin feed host-files` 已消失。门禁要求删掉 `error-owners.json` 里已匹配不到文件的 `apps/local-host/src/feed-*`。`/assets/molis-work-workbench.js` 由 1147241 降到 1147055：FI7 省下的字节抵掉了 Inbox 一半的 +21 B，还少 186 B，按 `page-assets --update --base origin/main` 降预算，不需要 `APPROVED_CEILINGS`。本地快查 `baseline.json` 只有变小的项，例如宿主插件文件 6 → 3、`feed#outside-files` 29 → 16、`as unknown as` 154 → 150。 |
| 两个红文件对 main | 干净 main 工作树 `9efbf8d04` 上都绿：desktop-tui 34/34，inbox-automatic-scenes 2/2。本分支上 desktop-tui 32/34、inbox-automatic-scenes 1/2，是批 C 带来的，没修，待裁定（见下）。 |
| `0f4c83de4` | D-4e3-1、Feed 回 0.3.0 与发版核对、inbox-automatic-scenes 改写、FI7 评审四处跟进之后，受影响的文件一次一个、`--jobs 1 --retries 0`：feed-goal-promotion 16/16、local-web-actions 13/13、goals-input-confirm 2/2、goals-actions 4/4、goal-event-create-flow 3/3、feed-promote-reader 1/1、feed-native-plugin 13/13、feed-runtime-plugin 46/46、verify-release-versions 22/22、web-home-isolation 8/8、feed-promote-mcp 4/4（夹具补 Feed 后），desktop-tui 34 过 1 跳过（本机没装 grok CLI）；inbox-automatic-scenes 1/2，第 166 行 5≠4，是 RAC-510 未做，待裁定。根 `tsc --noEmit` 退出 0，但只查 launchers；改到的测试用临时配置另查，新报的都是 main 上就有的行。没跑：浏览器用例、security 全量、Full。 |

公开 API 快照（`798004d7d`，`node scripts/gates/api-snapshot.mjs --update` 生成）对插件和调用方的影响：`ConnectorDriver` 的 `health`/`poll`、`IntegrationProviderPort` 的 `health`/`sync`、`ConnectorHostApi` 的 `test`/`invoke` 多了必传的 `ConnectorCallControl`（取消信号、`beforeEffect`、`current`；FI-C-02），SDK 新增 `controlledConnectorFetch`，自写连接器驱动的插件要改签名；`PluginAttentionClient` 多 `listInbox`/`getInbox`，`PluginHostServices` 多可选的 `sourcePull`、`evidenceCollector`，`PluginInstallationClient` 多 `projects()`，`ActionCallContext` 多可选的 `delegated_audience`、`calling_plugin_id`；Manifest 多可选的 `notifications` 接收声明，`PluginNotificationReceipt` 的 `item_id` 改名 `notification_id`（改合同，按 `docs/system/CONTRACT-CHANGES.md` 不留兼容期）；另有 `HOST_CONNECTIONS_OBSERVE_PERMISSION`、`HOST_CONNECTION_CHANGED_EVENT`、`PLUGIN_NOTIFICATION_DELIVERY_ACTOR`、`FUNCTIONS_PROVIDER_ID`、`PUBLISHED_FUNCTION_PREFIX`、`publishedFunctionKey` 几个新导出。

仍未完成或未验证（照实记录；门禁数字只按 `--update` 往下降，不开例外）：

- **FI7b 移到单独切片（统筹 10-27 定）。** 槽账号绑定 UI 不进 C。FI7 在 C 里只做了 Feed 一半：页面路由进 Manifest，两段 HTML 归外壳舞台，宿主 Feed 文件删除。FI7 还缺的都归 FI7b：
  - 槽账号绑定 UI 接在 `connectors.plugin_slot.bind@2` 上，用真实来源 record key。缺三样：宿主给页面调 bind@2、read@2 的入口，页面拿得到的 `install_id`，Runtime 里创建账号来源的路径。
  - Feed 停止往来源配置里写 `connection_id`。
  - 做法：C 开 PR 之后从 C 的头开分支，C 合入后再开 PR。开工前先把要动的文件报给统筹，因为 W5-11 第 3 片也动连接器。
- **装配冻结名单为什么提前减（统筹 10-27 同意）。** 本节开头原定 FI7 全部收完才减装配冻结表。实际上 `e5d3cdaeb` 删 `feed-native-plugin-http.ts` 时，就在同一个提交里把 feed 移出了 `tests/builtin-plugin-assembly-gate.test.ts` 的名单。原因是门禁要求名单与磁盘逐项一致，又只许减少：文件删了、名单还留着，门禁就红；名单也不能先删后加。所以名单跟着删文件减，不等 FI7b。
- **D-4e3-1 按用户 2026-10-10 的决定改回（统筹 10-27 定）。**
  - **规则**：Goals 新增 `personAsked(caller)`（`plugins/native/goals/src/action-contract.ts`）。算本人的只有两种：本人直接调用；插件经动作目录转来的调用（S-43），且 Host 在嵌套调用上设了 `delegated_by`、`delegated_audience` 是 `user`、不在场景运行里（没有 `scene_binding`）。只读 Host 设的字段，不读输入，也不信 Feed 自报。
  - **两个动作**：`goals.create` 只许本人指定渠道，别人指定拒为 `actions.input_invalid`，不指定记成 `runtime`。`goals.inputs.confirm` 本人记已确认，别人记提议。Feed 只在本人直接调用、不在场景里时传 `source_kind: "feed"`，理由写「用户从…确认」。
  - **不改合同**：没有新的上下文字段，所以不跑 `api:update`。
  - **测试**：`tests/feed-goal-promotion.test.ts`、`tests/local-web-actions.test.ts` 恢复成用户的决定：本人升格是已确认，渠道是 feed。新增用例「Goals takes the person only from the Host's delegated caller…」断言拒绝本身。经 Feed 转来的 Agent、工作流、MCP 调用，场景运行，以及只自称本人（没有 `delegated_by`）的调用，都不能指定渠道，输入只记提议。Feed 自己的定时调用是 `plugin` 受众（S-73），两个动作都不收；伪造的插件调用者在受众检查之前就被 Host 拒（`host.plugin_caller_invalid`），什么都不写。
  - **变异**：在构建出的 Goals 上，`personAsked` 恒假时 9 例红，去掉场景检查 1 例红，去掉 `delegated_by` 检查 1 例红。构建产物已还原。
  - **局限**：Goals 看不出委托的插件当时在跑自己哪个动作。这有两类后果：
    - **来源主人自己**：如果 Feed 以后在本人直接调用的动作里、场景之外自动升格，也会记成已确认；现在 Feed 没有这样的代码。
    - **别的委托方**（C 批评审 7bb44456b 查出，统筹 10-27 定为必改，已修，见下一条）：原来 `personAsked` 不看委托方是哪个插件，本人点 Workflows 的「交给下一站」、下一站是 `goals.create` 时，Workflows 转来的调用也算本人：不填渠道记成 `web`，还能指定 `feed`、`onboarding`、`tree`。任何持有 `actions:delegate` 的插件都能这样做。
    - 要把「本人」收窄到具体动作，得由平台在调用上带出委托方的动作，登记为 BL-803，不进 C。另外，两跳委托的 `delegated_audience` 是 `workflow`，记提议。Goals 的交付物与输入释放仍按直接受众判断，不在这次范围。
  - **只认来源主人（统筹 10-27 定，C 批评审 7bb44456b 的必改项）**：
    - **规则**：`personAsked(caller, source)` 多一个参数，是这次调用涉及的来源。委托来的调用，只有 `delegated_by` 等于这条来源的主人插件才算本人；主人表写在 Goals 自己的 `SOURCE_OWNERS` 里：`feed` 渠道、`feed_item` 输入归 Feed（`io.molis.work.feed`，两者本来就写在 Goals 的公开合同里，不是新开的耦合）。别的插件转来的，指定渠道拒为 `actions.input_invalid`，不填记 `runtime`，确认的输入只记 `proposed`。Feed 自己转来却没指定渠道或指定了别的渠道，也不算本人。
    - **预期变化**：`feed-goal-promotion`「Goals takes the person only from the Host's delegated caller」那一行 person 不填渠道建的 Goal 从 `web` 变成 `runtime`。原来记成 `web` 本来就不对：经 Feed 转来的不是网页渠道，而 Feed 自己的升格对本人总是传 `feed`。同一个用例加了「别的插件转来」一行，断言拒绝。
    - **新的安全行与用例**：SECURITY-INVARIANTS 新加暂定 S-99（合并时按 main 和在途 PR 定号）。`tests/security-invariants-goals-person.test.ts` 两条：一条是 Feed、Workflows、第三方插件三种委托的矩阵；一条真走 Workflows 页面路由的 `instances.continue`，下一站是 `goals.create`，指定 `source_kind: "feed"` 被拒、什么都不建，不指定时记 `runtime`，调用记录里这一步是 `workflow` 受众、`delegated_by` 是 Workflows。
    - **变异**：构建产物里把判断改回「`delegated_by` 存在即可」，两条都红；产物已还原。
    - **统筹准合 `bc7c06c07` 时的三处小改（10-27）**：两条拒绝用例除了码，也核原话「只有本人可以指定 Goal 的创建渠道」：矩阵里的拒绝记成「码 + 原话」；Workflows 一条核答复的 `error` 里有这句。通过记录见本节 RAC-510 一条的「验证」。
  - **SECURITY-INVARIANTS**：原先作者判断不加新行；统筹 10-27 定加一行，暂定 S-99，写清 Goals 怎样认本人（见上一条）。
- **发版核对（统筹 10-27 定）。** Feed Manifest 退回 `0.3.0`。这是撤掉合成提交多改的，不算版本变更；升小版本归发版 PR。`docs/releases/CHECKLIST.md` 的各库版本表补了「Feed 的正文引用账」一行（`plugins/native/feed/src/content-ledger.ts#FEED_HOME_DATABASE`，Home 库 `feed-content`，版本 1）。`node scripts/verify-release-versions.mjs` 通过。
- **inbox-automatic-scenes 改走 Runtime 的 `feed.sources.sync`（统筹 10-27 定），查出一处产品回归，统筹定在 C 里修（RAC-510）。**
  - **改法**：公开来源一段改成经 `bindActionClient(host.actionClient(…))` 调 Feed 的 `feed.sources.sync`，只把 RSS 响应换成 `fetch` 替身，其余照旧。原断言一条没动。
  - **在 Runtime 路径上对的**：拉取 `created` 1、`completed`；capture 场景跑 1 次；Inbox 条目的判断失败记 `needs_review`；同键重放 `replayed`，不再判断。
  - **不对的**：Inbox 场景多跑了一次，`localCalls` 是 5，原断言是 4。多出来的是同一条 Feed 条目的 `artifact_out_failed` 条目（`feed_artifact_producer_missing`）。临时把计数改成 5 的草稿整文件 2/2（没入库，跑完即删），说明其余都对。
  - **原因**：main 上宿主装配 Feed 时给了成果写入端（`artifacts`），每条命中规则的消息登记一个 `feed.capture` 成果。C 删了宿主 Feed，而 Runtime Feed 装配时（`plugins/native/feed/src/plugin.ts` 调 `assembleFeedApplication`）没给 `artifacts`。结果每条命中规则的消息都不出成果，Inbox 里还多一条「捕获失败」。这就是 §6 的 RAC-510（经 `services.artifacts` 写 `feed.capture`），C 里没做，也没有用例。
  - **为什么不直接接上**：`services.artifacts.publish` 是一次单独的写入，不像 attention 那样有 `join` 进 Feed 的事务。直接在 Feed 的提交里调，能不能调、被取消的同步会不会留下成果，都要先定；也可以挪到提交之后写，像判断队列那样。统筹 10-27 定在 C 里修，先出方案：成果服务加一个与 attention 同一机制的 `join`，成果版本并进 Feed 自己的提交。统筹 10-27 批了这个方案（方案 A），做法见下一条与 §3.7。
  - **第 166 行在方案落地之前保持红**：原因是 RAC-510 没做完，不弯测试（不把 4 改成 5，也不跳过）。RAC-510 落地后，原断言（4）一字未改，整文件 2/2。
- **RAC-510 方案 A 已做（统筹 10-27 批）。** 做法见 §3.7，这里记过程、对调用方的影响和验证。
  - **平台**：合同加 `PluginArtifactClient.join?` 与 `PluginArtifactWriter`（`pnpm api:update` 刷新 `tooling/gates/api/contracts/platform/plugin.txt`）。成果库的 `writer(permit)` 与 `publish` 共用一套校验（`modules/artifacts/src/plugin-operations.ts`），宿主的 `withArtifactJoin` 把它接到插件当前的项目事务上，门与 S-68 的 `attention.join` 是同一个 `gateFor`。
  - **Feed**：`FeedArtifactProducer` 只剩 `capture`，`FEED_ARTIFACT_PRODUCER` 删除；Runtime 端口经 `join` 绑在这一次的事务上。离线演示库（`demo-feed-library.ts`）没有调用可认，用同一个写入器、`permit` 为空，只给演示种子与夹具用，不是生产 Feed。
  - **动作权限（对调用方的影响，不留兼容期）**：`pnpm actions:update` 列出 6 个动作，形状、版本不变，只多要权限：`feed.sources.sync`、`feed.sources.tick`、`feed.sources.wake`、`feed.notifications.receive`、`feed.rules.evaluate` 多要 `artifact:write`；`feed.content.receive` 多要 `artifact:write` 和 `attention:write`。工作流步骤、MCP 客户端、Agent 调这几个动作，调用方没有这些权限就在入口拒为 `actions.forbidden`。
  - **FI-C-08（C 自己带来的回归，一并修）**：`feed.content.receive` 命中「直接进 Inbox」的规则时，在同一次提交里开 Inbox 条目，但动作没声明 `attention:write`，被 S-68 拒。补了声明，新用例「FI-C-08 a hand-in a plain rule admits to the Inbox…」断言缺这项权限的调用方在入口被拒。
  - **用例的预期变化**：
    - `feed-inbox-lifecycle`「an ignored Feed item … failing capture-out」的替身只换成新的 `capture(write)` 形状，码仍是 `artifact_store_down`，照 main 记成捕获失败。
    - `feed-out-rules` 的失败替身改成成果库拒（`artifacts.artifact.unavailable`）；另加两条：「RAC-510 a refusal of the call while capturing (…) goes up…」（撤权、取消两例，往上抛、不记失败）和「RAC-510 a capture that throws without a code is recorded as feed_artifact_register_failed…」（`TypeError` 照 main 记失败，事项留下）。
    - `feed-runtime-plugin` 的 RAC-1029 改用 `RECEIVE`，SYNC、JUDGING 加 `artifact:write`。
    - `inbox-action-scenes` 交给 `feed.content.receive` 的调用方另给 `artifact:write`：这个动作现在要它，缺这项时调用在入口被拒、用例等到超时；`bc7c06c07` 上 3/3，改后 3/3。
    - `artifact-host-writers` 的名单删掉 Feed 一项（只许减少）。这条在 C 的头上本来就红：`feed-application.ts` 已删，`demo-feed-library.ts` 还在替 Feed 调 `registerVersion:`。
    - 演示库那处的去留（统筹 10-27 问，按 PG-080 定）：`demo-feed-library.ts` 留下，但不再调 `registerVersion`，改用成果库给 `join` 的同一个写入器（`createPluginArtifactOperations(…).writer`，`permit` 为空），类型照 Feed Manifest 的 produces 核、产出者照样是 Feed Manifest，所以不进名单。它只给演示种子和夹具在插件没启动的库上排数据，不在任何调用里，作者是本机的人。PG-080 因此写「已做」。
  - **新的安全行与用例**：暂定 S-100（合并时按 main 和在途 PR 定号），用例在 `tests/security-invariants-plugin-artifact-join.test.ts`，12 条。设计稿第 1 项（等待中、写入中被取消撤权）由两部分一起证明：探针的 wait、mid、twice 三类，加上 Feed Runtime 的逐点撤权扫描（`feed-runtime-plugin` 的 RAC-510 用例，从第 1 次问询扫到最后一次之后）。调用本身被拒不记成捕捉失败，由 `feed-out-rules` 证明。
  - **变异**：在构建产物上逐个去掉一处，对应的用例变红：
    - `join` 的门（只剩事务检查）：「only a concurrent action…」变红。
    - 写入器每次重新认权（permit 换成空函数）：「twice」与「a writer … kept past」变红。
    - 事务存活检查：「a writer … kept past」变红。
    - 成果库的 produces 检查：「a type the Manifest does not produce」变红。
    - 产出者盖章（让输入覆盖）：「the producer, the author…」变红。
    - 去掉门时 mid 仍绿：事务自己的 `check()` 已经重新认原调用方，两层都在。构建产物已还原（sha 核对）。
  - **存量**：main 上 Feed 的成果记在宿主常量名下，改到 Feed Manifest 名下登记为 R-69（`docs/releases/CHECKLIST.md` §4.3），候选，没做。
  - catch 先 `beforeEffect()` 再核、盖住原错误一事，记为 BL-801。
  - **作者与演示数据**：Runtime 一路捕获的成果，作者记原调用方，不再是宿主写死的本机的人，这是预期变化。`join` 的写入器取的是 `audit_actor_id ?? actor_id`，与 attention 的 `join` 写 Inbox 行时一样（S-63），在每次 `permit` 通过时取；平常的 `services.artifacts.publish` 照旧记 `actor_id`，本片不改。离线演示库不在任何动作里，作者仍是本机的人。`demo-plugin-seed.ts` 经 `createDemoFeedApplication` 入库，`ingestItem` 照样跑捕捉规则，种子里的「目标树」规则照样捕获，产出者是 Feed Manifest。
  - **评审 `review-c-bc7c06c0-rac510.md` 的跟进**：
    - M1 即 FI-C-08，已做。
    - M2 采纳（统筹 10-27 定）：捕捉时只把调用本身被拒的五个平台码往上抛，其余照 main 接住记 `artifact_out_failed`，事项照常入库，不会因为一条消息的内容错误整次回滚、成为毒消息。另把取消（没有码的 `AbortError`）也算调用本身被拒：宿主取消时给的是 `actions.cancelled`，裸 `AbortError` 只在别的调用方取消时出现，记成捕获失败会让取消的调用写业务记录。名单里没有 `actions.provider_changed`：它只在动作引用的提供方变化时出现，捕获这一路碰不到；即使出现，事务提交前的 `check()` 也会再认一次原调用方，整次回滚。
    - M2 的第二处：插件事务句柄的 `check()` 多一条，`inTransaction` 为假就拒为 `actions.forbidden`「事务已被数据库回滚，不能继续访问」（`apps/local-host/src/plugin-database-client.ts`）。SQLite 遇到 `SQLITE_FULL`、`IOERR`、`NOMEM` 会自己回滚整个事务，之后的语句会落进自动提交，只留下插件写的一半。
    - M3 做了：S-100 用例按消息核是哪一层拒的。
      - 调用方那一层核原话；安装那一层：停用时库先关，核「插件数据库已关闭」；只改库里授权时由调度对提供方的复核先拒，核「插件所需授权已撤销」（见下一条）；动作那一层核「写入需要声明了这项权限的可等待并行动作」；事务那一层核「需要此插件当前项目库中仍在执行的事务」。没有授权的探针，核拒绝里点名 `artifact:write`。
      - 「插件持有自己的写权、只撤 `artifact:write`」：运行中的安装改授权会被 Runtime 拒（`plugin.state_invalid`），所以用两种做法合起来证明。一是先停、改成只缺 `artifact:write`；二是安装照跑，直接改库里的安装记录，只去掉 `artifact:write`（门读的是库里的现行记录）。停用会关掉插件的库，所以前一例（和只停用的一例）等待之后的写在库那一层就被拒为「插件数据库已关闭」，碰不到 `join`；后一例在事务体里、插件自己的行写进去之后才改库里的记录，`join` 被调到，但它的第一道检查先问事务、事务再问调用方，调度对提供方的复核看见所需授权没了，`join` 和调用都拒为「插件所需授权已撤销」（`actions.plugin_permission`），轮不到 `join` 的 S-68 门去读安装记录。都整个事务回滚。原先写的是在等待处改记录、由 `join` 的门拒为「所属安装已停止或撤权」，跑下来不对：等待之后库开写时就被同一处复核拒了，`join` 根本没被调到。`join` 的门读安装记录这一层在动作调用里排在调度复核之后，本文件没有走到它的用例；它与 attention 的 join 是同一道门（`gateFor`）。
      - 串行动作：探针的串行动作自己持有写权、开事务，不是并发的（核了 `scheduling` 与 `permissions`），被拒为「可等待并行动作」那句。
      - 只读调用：只读场景的调用连插件自己的库都写不了，在 `join` 之前就被库拒为「只读场景不能写入业务记录」，碰不到 `join` 的门。所以另加一例在任何调用之外写：`join` 的门拒为「写入需要当前项目中的可写插件调用」。两例都什么都不留。
      - 事务结束后留下的写入器或句柄、交给别的安装的 `join` 的事务：核「需要此插件当前项目库中仍在执行的事务」，不出成果。在别的安装的动作里借用这个安装的库：开事务时就被库拒为「这次写入属于另一个插件实例，不属于正在运行的动作」，碰不到 `join`，同样不出成果。
      - 另加两例：保存点里 `publish` 后插件 `keep: false` 丢掉，外层事务提交，没有成果；`join(tx, async w => …)` 被 `requireSynchronous` 拒为 `actions.async_required`，返回前钉的那一版随事务回滚。
      - Feed 一侧加「RAC-510 a sync cancelled after its pull and before its commit…」：同步拉取之后、提交之前取消（Home 账写完之后的可控延迟里），答 `actions.cancelled`，事项、Inbox 条目、成果、`artifact_out_failed` 四样都没有。调用记录里没有一行成功的 `sdk.artifacts.<安装>.publish`：这一点经宿主写 `logs/action-calls.jsonl` 用的同一个 `settled` 钩子核（`tests/fixtures/plugin-actions.ts` 多一个可选参数），不读文件。同一用例先跑一次不取消的对照，四样各 1、0、1、0。
    - M1 的正面用例：`feed.content.receive` 命中直接进 Inbox 的规则，事项、Inbox 条目、成果各一，没有 `artifact_out_failed`（FI-C-08 用例加断言）。
    - 评审要核的三件：`writer.head` 只看 Manifest 声明了 `artifact:write`，不要 `artifact:read`；作者见上一条；`demo-plugin-seed` 照样捕获，见上一条。
  - **老红（定向跑与逐个验证时查出，都不是 RAC-510 带来的）。** 认定办法：`git worktree add --detach` 在 `bc7c06c07` 开基线工作树，拷本工作树已构建的 dist，只重建本片改到的 contracts、module-artifacts、plugin-feed、local-host 四个包，跑同一批文件（`--jobs 1`），用后删除。
    - `content-station-request-id`：它的夹具只给调用者八个站静态声明的权限。C 的头上 `feed.content.receive` 登记时就多要 `evidence:read`（`d7da3e05c` 起，动作快照可查）。所以 Feed 一站、经 Inbox 交给 Feed 的两站、W4-6-05 的三例，在 C 的头上本来就被 `actions.forbidden` 或 `actions.dependency_missing` 拒。夹具改成另给 `FEED_ACTION_PERMISSIONS`，与 Feed 其他用例给本人的一样。基线上 12/21，改后 21/21。
    - 由此看到的跟进：`inbox.content.receive` 声明的权限（`inbox:write`、`feed:write`、`feed:read`）不含 Feed 的接收登记后要的那几项。只持有它声明的权限的调用方，嵌套到 Feed 时会被拒。这事在 C 的头上就有，本片不改 Inbox 的合同。
    - `feed-inbox-lifecycle`「syncing a research library again after a package was republished…」报 `feed.source_invalid_configuration`（研究库适配器不可用）。原因是 `d7da3e05c` 删了宿主的 `feed-source-service.ts`，演示来源服务从此不接研究库，C 的头上同样红。要么改走 Runtime 的 `feed.sources.sync`，要么删掉宿主那一路，留给接手 Feed 来源的切片。
    - `feed-sync-authority`「public RSS grant-revoked: real Host dispatch cannot commit stale data…」：来源运行答 `reconciliation_required`（`ambiguous_transport`），断言要 `completed`；基线上同样 17/18。
    - `action-model-scheduling`「every action that waits on a model runs beside the serial queue…」：`feed.notifications.receive` 没有声明 `metered` 的模型用量（`d7da3e05c` 起）；基线上同样 1/2。
    - `schedule-resident-runtime` 的 W2-18-SCHEDULE-01（自动服务的效果没有落定）与 W2-18-SCHEDULE-02（来源 tick 没走到 Home 准备）；基线上同样 3/5。
    - 这三个不在 RAC-510 的范围，C 里不修，列给统筹排。
  - **C 带来、本轮顺手修的：`plugin-project-database`「RAC-302 every shipped plugin's Home library is registered to that plugin…」。** C 给 Feed 加了 Home 库 `feed-content`（`d7da3e05c`，正文引用账，发版核对的各库版本表已登记），用例里写死的 Home 库名单没加。按代码看，`bc7c06c07` 上就红（它的 Feed Manifest 已声明 `databases.home`，名单没有），main 上 Feed 没有 Home 库、这条是绿的；两边都没在基线上跑。名单补上 `feed-content`（预期变化），其余断言不动，同一个用例照样核它登记给 Feed、基线是 Feed Manifest 声明的那一版：10/11 → 11/11。
  - **一次误跑**：定向跑时 `--test-name-pattern` 少写了 `=`，`run-tests` 把它当成文件名，node 就跑了默认匹配，也就是全部用例，跑了约 11 分钟。已按 pid 停下，删掉了它建的一份空的临时 Home，没有碰别的进程和 Home。
  - **验证（2026-10-27，照统筹的批测做法：一次 heavy.sh 预约、`--jobs 1`、不跑浏览器用例）。**
    - 一批：先重建 contracts、module-artifacts、plugin-feed、local-host，再逐个跑 37 个受影响的非浏览器文件，12.5 分钟，33/37 通过。红的四个：`feed-inbox-lifecycle` 12/13、`feed-sync-authority` 17/18（老红，见上）；`plugin-project-database` 10/11（C 带来，已修，见上）；`security-invariants-plugin-artifact-join` 10/12（M3 新写的断言核错了层，见 M3 那条）。
    - 通过的里面有：`feed-runtime-plugin` 49/49、`feed-out-rules` 14/14、`content-station-request-id` 21/21、`inbox-automatic-scenes` 2/2、`inbox-action-scenes` 3/3、`action-contract-snapshot` 25/25、`artifact-host-writers` 1/1。统筹准合 `bc7c06c07` 时要的通过记录：`security-invariants-goals-person` 2/2，在这一批里跑的。
    - 重跑：`plugin-project-database` 11/11；装配门禁改名单后 `builtin-plugin-assembly-gate` 9/9；S-100 改了两轮层级断言，12/12。
    - 测试文件的类型检查（临时配置，只含本轮改到的测试文件）：5 处错误，`tests/fixtures/plugin-actions.ts` 3 处、`inbox-action-scenes` 1 处、`plugin-project-database` 1 处，在 `bc7c06c07` 的基线工作树上是同样 5 处，不是本轮带来的；S-100 文件没有错误。
    - 门禁：`check-health-gates --base origin/main` 第一次红两处。一是 `FeedApplication` 从 491 行涨到 497 行（RAC-510 在类里加的捕捉包装和两处拒绝判断）；二是 S-100 引的 `feed-out-rules` 用例名是模板字符串，原文里没有那一整句。改法：逐条规则的捕捉和失败判断搬到 `out-rules.ts`（`captureFeedRules`、`feedCaptureFailure`），与 `registerFeedCaptureVersion` 同属捕捉，类回到 491 行以下；S-100 改引名字里固定的那一段，代码位置跟着改。重跑门禁通过，`pnpm boundary:check` 通过。Feed 重建后重跑：`feed-runtime-plugin` 49/49、`feed-out-rules` 14/14、`feed-capture-scenes` 2/2、`inbox-automatic-scenes` 2/2、`feed-inbox-lifecycle` 12/13（同一条老红）。
    - `tooling/gates/baseline.json` 没跑 `--update`：main 自 merge-base 起改过这个文件，C 一直没动它，现在改会在合并时撞上；CI 只对照 merge-base，不读它。合并后在合并结果上跑一次。
    - **本机延后验证**（本机没跑，由合并会话在 PR 前排）：全部浏览器用例、security 全量、最终 Full、Linux 上的 CI。`security-invariants-goals-person` 里 Workflows 那一条走的是真实的页面路由，Workflows 的浏览器界面没走。
- **FI7 评审（`8800e07bf..d96bd692d`）的四处跟进（统筹 10-27 定）。** 评审没有必须改的代码，下面四处是文档与用例跟上：
  - **W3-01 C 的变化统筹认了。** 没装 Feed 的项目里，Feed 的页面路由（`/api/plugins/io.molis.work.feed/…`）和舞台（`/api/stage/feed`）在门口就拒（403 `actions.plugin_disabled`），没有调用，不留行，答复不带编号；FI-7 之前人按名字调 `/api/feed` 会留一行「未执行」、带编号。现在和 Inbox、Schedule 等 Runtime 插件一样，用户 10-18 定插件一视同仁，给 Feed 单留一行反而是私路。`apps/local-host/README.md` 那句「人按名字调 `/api/feed` 也照常记」改成现行行为。「被拒且留行、答复带编号」这条保证补回一条 HTTP 用例（`tests/web-home-isolation.test.ts`「a plugin's route the door let through, whose call is refused before it runs…」）：项目里装了 Feed，`POST …/items/<201 个字符>/read` 进了门，路由以本人调 Feed 的 `feed.items.read`，条目编号超出动作的上限 200，调用在处理器之前被拒为 `actions.input_invalid`；答复 400，头和体带同一个编号，调用记录里这一行 `refused === true`、能力是 `feed.items.read`。同一个编号下还会有宿主那次读浏览工作区（BL-521 的 `announceProjectOpened`：项目的插件平台打开后，第一条插件路由前读一次，读成功就不再读）：这个夹具的宿主没有项目设置，读取答 `actions.missing`、留自己的一行，失败后下一条路由再读，所以用例认这一行，也只认这一行。测试夹具 `withRequestFixture` 多一个可选参数，给项目加插件。整文件 8/8。
  - **`feed_source_catalog` 仍是宿主按 Feed 命名的页面投影。** 页面视图的来源目录（`web-view.ts:111` 调 `listFeedSourceCatalog`）main 上就有，归 PG-060，等舞台归插件时一起搬。它取的是 `createSourceVocabulary()`，与 `services.sourcePull.vocabulary` 给插件的同一份，插件和路由都读不到它，所以不绕 S-97。
  - **4c-3 的条件「宿主那份到 4e-3 删」做到了没有。** 宿主版 Feed 自己注入的词表（main `9efbf8d04` 上 `apps/local-host/src/feed-source-service.ts:50` 的 `providers`）随 `feed-source-service.ts`、`feed-source-runtime.ts` 在合成提交 `d7da3e05c` 删了；Runtime Feed 只经 `services.sourcePull.vocabulary` 拿词表。宿主包里还剩一处同样的注入：离线演示库 `apps/local-host/src/demo-feed-library.ts:108-113`（`createDemoFeedSourceService` 的 `providers`），给演示项目的种子和测试夹具在插件没启动的库上排数据用，不是生产 Feed。它直接用 rss、youtube、gmail 集成包的同一批函数，目录、允许名单和游标格式仍同源。统筹若认为这处也要收，改法是让它的 `providers` 从 `createSourceVocabulary()` 取（Gmail 范围不在词表里，照旧），C 里没改。
  - **PG-060 位置列补了三处**：`web-view.ts:111`、`plugin-stage-fragment-http.ts:23,34-37`（舞台分派表按名字写死 `inbox`、`feed`、`feed/items/<id>`）、`web-request.ts:201`（`feed/items/<id>` 用 Feed 专用的 `feedItem` 端口）。归在已登记的 PG-060 下，不是新开的私路。
  - **过时文档**：`docs/system/RUNTIME-MIGRATION.md` 的 Feed 行不再写 `feed-native-plugin-http.ts` 113 和三个已删模块，改成现状（宿主仍 import Feed 的文件 12 个）；privileges PG-057 的「`/api/feed` 23 处、`/api/inbox` 6 处」改成现在客户端里都是 0 处，只剩 Gmail OAuth 回调地址这一个字符串。
  - **逐个跑受影响文件时又找出一个 C 带来的红：`tests/feed-promote-mcp.test.ts`。** 夹具建的项目没有 Feed；Feed 进 Runtime 后，项目没装它，`feed.items.promote` 就不提供给 MCP 客户端，夹具在授权一步就失败（四例都红，失败后宿主没关，进程挂住，按 pid 停了）。和 `home-mcp-actions` 同一种迁移：夹具给项目加 Feed 与 Inbox，断言不动。改后 4/4；断言本来就是 MCP 客户端升格记 `runtime`、输入 `proposed`，与 D-4e3-1 一致。
- **privileges 随 C 收口（统筹 10-27，按只读核查线的逐行核对）。**
  - **§3 的状态**：PG-040、043、087、089、031 写「已做」，PG-020 写「代码已做」、存量 v10→v11 待维护窗口，PG-045、058 写「部分」（余项各自写明），PG-080 见 RAC-510。T0 表这五行（031、043、045、058、089）各补一句「C 合入后…，见 §3」。原状态都留在「此前」后面。
  - **PG-093 没有写「已做」**：核查建议写已做，但这一行点名的「Feed 的客户端住在工作台里」还在（`apps/workbench/src/scripts/client/navigation-feed.ts` 与两个部件、`feed-rule-authoring.ts`），所以写「宿主一半已做」，客户端与 PG-060 的 Feed 部分一起收。`information-actions.ts` 是平台提供方，不算特权；它从 Feed、Inbox 插件包 import 的两处留给 C 合入后的一片。
  - **装配门禁**：`tests/builtin-plugin-assembly-gate.test.ts` 的 `HOST_FILES_NAMED_FOR` 删掉 C 已删的 `feed-goal-promotion.ts`。Goals 仍因 `goal-callers.ts`、`web-goals-read.ts` 留在 `HYBRID_RUNTIME_PLUGINS`，名单不变。
  - **main 的头部说明**：main 在 privileges 第 3 行加了 10-27 那句（BL-376 并入 BL-377），C 是从更早的 main（`9efbf8d04`）切的，所以没有。`git merge-tree` 试合 C 与 `origin/main`（`74f31c19e`）没有冲突，合出的文件第 3 行就是 main 那句。C 合 main 时再核一次。
- **边界检查的余漏记 BL-802（来源：C 批评审 `4353b5905`）。** `directFactSql` 只写了 3 张表、JOIN、加引号、库名前缀、ALTER、DROP 都能绕过；Listener 那条按子串匹配，注释里写了也算。改门禁要先问用户，C 接近 PR，不再加范围。
- **local-host 整包构建**：`tsc` 通过，随后的 `native/materials` Swift 构建在本机因 CommandLineTools 的 `SwiftBridging` 模块重复定义失败，与本批无关。
- **测试文件的类型检查**：根 `tsc --noEmit -p tsconfig.json` 通过，但这份配置只含 `apps/desktop/launchers`、排除 `tests`（CI 同样只查这些），所以不查测试。本轮改到的三个测试文件另用一份临时配置查（继承 `tsconfig.base.json`，只列这三个文件）。`feed-goal-promotion`、`inbox-automatic-scenes` 没有错。`local-web-actions` 有 5 处，都在与 main 逐字相同的行上（本分支只改了它的 import 和第 219 行附近）。
- **没跑的**：全部浏览器用例（含 FI7 改到的 6 个）、security 全量、最终 Full，由合并会话在 PR 前排。
- **FI-C-02 Notion 复审与补测。** 复审没有必修项。按统筹要求，在 `tests/connector-oauth-choice.test.ts` 补了两条非浏览器用例：
  - 「a call after both callers left starts a new shared refresh…」：两方都取消后，共享请求被中止。响应回来之前，第三个调用另起一个共享项，发出第二个请求。旧响应回来时，两方各按自己的原因被拒，什么都不写。第四个调用加入第三个调用的请求，最后只落第二个请求的结果，连接的 revision 不变。
  - 「a shared refresh a caller still awaits writes nothing when…」：一方取消，另一方还在等。刷新期间，refresh 值被换掉，或连接停用再启用（revision 变了）。留下的一方分别以「Notion 连接在刷新期间已改变，请重试」「连接在刷新期间已变化，请重试」被拒，什么都不写。
  - 作者验证：整文件 13/13（`--jobs 1 --retries 0`）。在构建出的 `notion-oauth.js` 上，分别去掉三处保护——已结束的共享项不再接纳新调用、落盘前比对 refresh 值、`finally` 只删自己那一项——新用例都会变红。构建产物已还原。
  - **取舍（统筹登记为 R-68）**：所有参与的调用都已取消、而请求已经发出时，Notion 轮换出的新 refresh token 不写盘。如果 Notion 立刻让旧值失效，用户就要重新授权。这是「被取消的调用不写记录」的代价。
  - **两条建议，这批不改**：① 被取消的一方仍要等共享刷新结束才返回，可以改成和自己的信号赛跑、先行返回。② 权限已被撤销、信号却没有中止的参与者，要到下一次检查才退出。
