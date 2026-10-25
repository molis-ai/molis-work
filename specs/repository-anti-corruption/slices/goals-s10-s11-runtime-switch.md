# Goals S10+S11：Goals 切到 Plugin Runtime，个人规划进 Home 实例（PG-094，设计稿）

状态：已审定、开工（2026-10-25，迁移线 ac-sc3，叠在 S9-1 分支上；统筹 10-25 审过设计稿并给了七条条件，已写进本稿：§3.4、§3.6、§5.2、§5.3、§7、§8）。统筹 10-25 裁定走「一条链」：S10 与 S11 合成一片（Home 半 + 项目半切 Runtime + 个人规划表搬进 Home 库），之后 S12 删私路，最后 S9-3 纯搬家；每片只推分支、叠着做，不开 PR，等用户维护窗口一起落；不申请 `pluginOutsideMentions` 放行。

## 1. 为什么 S10 与 S11 不能分开

| 事实 | 后果 |
| --- | --- |
| `apps/local-host/src/local-owner-permissions.ts` 的 `NATIVE_OWNER_PERMISSIONS` 取 `kind === "native" && !runtime` 的目录条目的动作权限；「Runtime 装配的插件不是宿主自己的，动作只凭运行中安装的授权到达本机这个人」 | 给 Goals 的目录条目加 `runtime`（Home 半）的那一刻，`goals:*` 从本机所有者权限里消失，仍由宿主装配的项目半立刻失去权限。Home 半必须与项目半一起进 Runtime |
| 双实例（`specs/dual-instance-plugins` U1/U2）要求 Manifest 全部权限 `required: true`、宿主装配的目录条目才可声明、Home 半与项目半共用 `install_id` | 两半同时出现才是一个完整的双实例；只有 Home 半没有检查要证明的东西 |
| 个人规划表 `personal_planning_method_packs` 在目录库（`catalog-schema.ts`），项目半同步读它（`GoalsPlanningEngine.readPersonalMethods()`） | 搬进 Home 库后项目半只能经动作异步取（§5），读取方式随项目半一起改 |

## 2. 目标形状

| 位置 | 内容 |
| --- | --- |
| `plugins/native/goals/src/plugin.ts`（新） | `createGoalsPlugin(): PluginDefinition`：`start(context)` 里 `requireGrant` 全部必需权限，拿 `services.project_database`、`attention`、`contextLedger`、`actions`，建一次对象图（§3），返回 `{ kind: "app", views, actions, routes }`；动作处理器全部按 §3.5 包进「调用窗口」。`projectOpened`（补建看板、补对账 Attention）在 `start()` 里做（`start` 没有动作范围，`assertPluginActionCurrent` 直接放行，写入走 `transaction`） |
| `plugins/native/goals/src/home-plugin.ts`（新） | `createHomeGoalsPlugin()`：只提供 Home 作用域的两个个人规划动作（`goals.planning.personal.list/save`），数据在 `services.database` 的 Goals Home 库 |
| `plugins/native/goals/src/home-database.ts`（新） | `GOALS_HOME_DATABASE: PluginDatabaseDeclaration`：`store_name: "goals"`、`version: 1`、一张 `personal_planning_method_packs`（列与现表相同）、读写权限为 `storage:private` |
| `plugins/native/goals/src/manifest.ts` | `databases: { project, home }`；权限加 `attention:read/write`、`context-ledger:read/write`、`journal:project`（`PROJECT_JOURNAL_PERMISSION`），全部 `required: true`；`attention: { subjects: ["goal_decision"] }`；去掉「仍在构建期装配」的注释 |
| `plugins/native/goals/src/registration.ts` | 加 `runtime: { scope: "home", create: createHomeGoalsPlugin, dual_instance: true, package_name, factory_export }` |
| `apps/local-host/src/project-plugins.ts` | 项目监督器条目 `createGoalsPlugin` |

项目半与 Home 半是同一个 Manifest、两个 `PluginDefinition`，与 Shelf 同形（`plugins/native/shelf/src/home-plugin.ts`）。

**片 D 开工前发现的缺口（2026-10-25，未解决，已报统筹）**：上面的 `plugin.ts` 和 `home-plugin.ts` 都要在插件包里用到 `modules/goals`、`modules/governance-collaboration` 的代码（`GoalsModule`、`GovernanceCollaborationModule`、`GoalInputBindings`、`resolvePlanningMethodPacks` 与内置方法包、`PersonalPlanningMethods`），而边界规则 `plugin-upward-dependency` 不许插件包依赖 Module 包（名单 `PLUGIN_MODULE_IMPORT_ALLOWLIST` 只许减少，Goals 不在其中）。项目半还能勉强由宿主经 `createGoalsPlugin(kit)` 把构造器递进来（`nativePluginReleaseArtifact` 的 `restore` 本来就是这样注入端口的）；**Home 半不行**：`registration.runtime.create` 是无参的 `() => PluginDefinition`，宿主递不进东西，而 `goals.planning.personal.list` 的合同是返回「内置 + 个人」合成后的方法（要内置方法包和合成逻辑，`method-packs.ts` 352 行、`personal-methods.ts` 66 行，`GoalsPlanningEngine` 自己也在用）。所以片 D/E 在 S9-3（两个模块纯搬进 `plugins/native/goals`）之前做不成：要么 S9-3 提前到 D 之前，要么只为 Home 半把方法包代码复制一份。取舍交统筹。

## 3. 适配层：同步 SQL 怎样跑在插件事务回调里（核心）

### 3.1 要适配的表面（读完两个模块全部源码后的数字）

| 用法 | 处数 | 说明 |
| --- | --- | --- |
| `db.prepare(sql).get/all/run(...params)` | 全部语句 | 参数都是字符串、数字、`null`（`better-sqlite3` 本来不收布尔和 `undefined`）。`lastInsertRowid`、`pragma` 只在接口类型里声明，没有调用 |
| `db.transaction(op).immediate()` | 5（Goals 的 `repository.immediate`、`input-bindings`；Governance 的 `repository`、`decision-transactions`） | 在嵌套时 `better-sqlite3` 用保存点，语义是「内层失败只回滚内层」 |
| `db.exec("SAVEPOINT / ROLLBACK TO / RELEASE …")` | 6（`governance-collaboration/src/decision-transactions.ts` 的两个预检：整份物化预检和逐条预检） | 在保存点里真的写一遍再回滚，算出冲突和预览 |
| 其余 `exec`/`pragma` | 0 | `personal-methods.ts` 的建表 `exec` 随个人规划搬走 |

插件的数据库客户端（`apps/local-host/src/plugin-database-client.ts`）：读 `get/all` 同步，走只读连接；写只在 `transaction(beforeEffect, write)` 里，`beforeEffect` 异步、`write` 同步体；只放行 `SELECT/WITH` 与 `INSERT/UPDATE/DELETE`；每句先问授权、调用者与表名检查。S9-1 的 `tests/fixtures/plugin-legal-sql.ts` 已证明 Goals 与 Governance 的所有字面量 SQL 过这套检查（132 句，被拒的只有日志端口和六条保存点）。

### 3.2 做法：一个只建一次、按调用换底座的 `GoalsSqliteDatabase`

对象图（`GoalsModule`、`GovernanceCollaborationModule`、各 Application）仍在 `start()` 里只建一次，建在一个适配器 `PluginSqlite` 上；`PluginSqlite` 实现两个模块现有的 `GoalsSqliteDatabase`/`GovernanceSqliteDatabase`，自己不存数据，只指向「当前窗口」：

```
class PluginSqlite {
  prepare(sql) → { get/all/run }        // 转给当前窗口的 get/all/run；没有窗口就抛 goals.storage.no_window
  transaction(op) → () => T & { immediate(): T }
                                        // 窗口是写事务：用平台保存点包 op（见 §3.4），语义同 better-sqlite3 的嵌套事务
                                        // 窗口是只读：抛 goals.storage.read_only
  within(handle, body)                  // 打开窗口，同步执行 body，finally 关窗口；同一窗口重入放行，换模式重入抛错
}
```

`get` 的 `null` 转 `undefined`（模块沿用 better-sqlite3 的习惯），`run` 回 `{ changes }`。所有读写都发生在同步体里，所以一次只有一个窗口，不会交错；窗口外的任何访问（异步续体、被留住的句柄）直接抛，不静默读旧的。

### 3.3 窗口怎么开

| 动作种类 | 窗口 |
| --- | --- |
| 命令（写） | `await db.transaction(caller.beforeEffect, tx => sqlite.within(tx, body))`；Goals 的命令包括 `tree.check`（它要写幂等记录，并在预检里写了再回滚）和 `tree.decide` |
| 查询 | `sqlite.within(db /* 只读 reader */, body)`，写和 `transaction` 一律抛 |
| 页面路由 | 已经是 `context.actions.invoke`（S7b），不碰数据库，不需要窗口 |
| `start()` | 补建看板和 Attention 对账用写事务窗口 |

异步处理器只有三个：`deliverables.pin`、`artifact_inputs.pin`、`deliverables.candidates`（`deliverable-actions.ts`）。它们的 `await ports.pin(...)` 在窗口之外，之后同步的写再各自开窗口；处理器内的顺序（先拉成果、再 `beforeEffect`、再写）保持不变。

### 3.4 保存点：平台补一个原语

插件的事务句柄没有保存点，而 §3.1 的 5 处嵌套事务和 6 条预检都靠它。做法是给 `PluginDatabaseTransaction` 加一个方法（合同改动，`pnpm api:update`，安全不变量 S-?? 一行）：

```
savepoint<T>(body: () => { keep: boolean; value: T }): T
// 平台执行 SAVEPOINT <平台生成的名字>、body、keep 为 false 或 body 抛错时 ROLLBACK TO，最后 RELEASE；每一步先问 check()
```

名字由平台生成、插件传不进 SQL（所以不放行任意 `exec`）；`body` 必须同步；窗口句柄结束后失效。**它是平台对所有插件同样提供的通用原语，不是给 Goals 开的特例**（统筹条件 2）：声明在 `PluginDatabaseTransaction`（`packages/contracts`），插件 SDK 的合同快照随之更新（`pnpm api:update`），`docs/system/CONTRACT-CHANGES.md` 写明对插件的影响（只增一个可选方法，既有插件不受影响；沙箱插件的语句通道没有它）；安全不变量新开一行，S 号先用暂定号（落地时由统筹编）；拒绝用例要断言「插件传不进 SQL」「`body` 写成异步被拒」「事务结束后句柄用不了」。适配器里：`transaction(op).immediate()` 在写窗口里 = `savepoint(() => ({ keep: true, value: op() }))`；`previewMaterialization`/`previewMaterializationItem` 由 Governance 的 `GovernanceDecisionTransactions` 改成调适配器的 `preview(op, keep)`，不再写 `exec("SAVEPOINT …")`，`GovernanceSqliteDatabase` 去掉 `exec` 与 `pragma`。沙箱插件的语句通道（`project_statements`）不加这个原语：沙箱插件拿不到（`SANDBOX_SERVICE_FATE`），Goals 是受信的宿主条目。

### 3.5 其余端口

| 端口 | 做法 |
| --- | --- |
| 日志（S9-0/S9-1 的 `GoalsJournal`、`GovernanceJournal`） | 窗口是写事务时用 `tx.journal`（追加、读、幂等），只读窗口用 `db.journal` 的读 |
| Attention（`AttentionApi` 的 `commands`/`query`，`GoalDecisionAttentionSync` 在用） | 小门面：`query.*` 转 `services.attention` 的读；`commands.create/setStatus` 在写窗口里转 `attention.join(tx, w => w.create(...))`。`owner_plugin_id` 由平台记（S9-0b），门面不传 |
| Context Ledger（`GoalInputBindings`、`deliverables.ledger`） | 同上，转 `services.contextLedger`；键是 Goals 自己的裸键（S9-0b 已按插件号加前缀） |
| `clock`、`randomUUID`、`now` | 不变 |
| 成果库的读 `readArtifact`、`pin`、`pinnableKinds` | **片 A 核对结果：不需要补成果库的动作。** 成果库已有公开动作 `artifacts.read`（输入 `reference`，输出 `selected`：整条 `ArtifactVersionRecord`，含 `title`、`artifact_type_id`、`availability`、`lifecycle_state`，Goals 要的四个字段都在）；固定与可固定种类本来就是动作（各主人的 `*.pin`，`pinActionSubject`/`pinnableSubjectKinds` 只是发现 + 调用）。Goals 的 Manifest 声明 `actions:delegate`（Workflows 的先例）并用 `services.actions.directory`：以原调用者的权限发现和调用，权限不到的在目标运行前被拒（S-43）。宿主进程内的 `runtime.artifacts.query` 和宿主的 `ActionClient` 都不再用 |

## 4. 为什么不在每次调用时重建对象图

比较过：每次动作用 `tx` 重建 `GoalsModule` 与全部 Application（几十个类）。对象图建一次成本为零，但每次调用重建约几十个实例并重复读配置；更重要的是模块里没有可变缓存，换底座在行为上没有区别，所以选「建一次 + 窗口」，换来对象图和今天的 `GoalProjectApplication` 一一对应，宿主装配可以原样搬进 `start()`。

## 5. 个人规划

### 5.1 Home 半

`createHomeGoalsPlugin()` 的两个动作：`list` 读 Goals Home 库，返回 `resolvePlanningMethodPacks(个人方法)`；`save` 在 `transaction` 里 `PersonalPlanningMethods.save`（把现在的类改成吃 `PluginDatabaseTransaction`/`PluginDatabaseReader`）。`userAvailability`（受保护的用户操作）、动作合同和 `home()` 的 scope 都不变。宿主的 `PersonalPlanningActions`（系统提供方 `io.molis.work.goals.home`）、`personal-planning-methods.ts`、`MolisWorkLocalHostOptions.planningMethods`、`readPersonalPlanningMethodPacks` 的导出整条删除。

### 5.2 项目半怎样读（不改引擎的同步签名）

引擎的 `effectiveMethods`、`projectComposition`、`resolveEventAdoption` 是同步的，在 Goal 的事务里被调（四个动作入口：`planning.catalog/read/apply`、`goal.document`、`events.configure`）。把它们改成异步或加参数会连带 `GoalsPlanningApi`、`goalEvents.configure`（测试里 40 多处调用）。所以：

- 引擎仍注入 `personalMethods: () => readonly PlanningMethodPack[]`，实现是一个**调用快照**：这五个入口的处理器先 `await` 调自己的 Home 半 `goals.planning.personal.list`（经 `services.actions`），把结果放进快照，再同步执行体；快照只在这次同步执行内有效，窗口外读它抛 `goals.planning.personal_not_loaded`（不静默读旧的）。其余动作不取，不增加开销。
- `list` 返回的是合成后的（内置 + 个人），快照取 `scope === "personal"` 的并去掉 `overridden_scopes`，与原先读到的原始个人列表逐项相同（`resolvePlanningMethodPacks` 里个人版本的权重高于内置，个人项一定被选中）。
- Home 半停用或不可用时，这五个入口以 `goals.planning.personal_unavailable` 拒绝，不退成「没有个人方法」（那是静默丢数据）。两个错误码按 `defineErrorCodes("goals", …)` 声明（`goals.planning.personal_not_loaded`、`goals.planning.personal_unavailable`），不新写 Error 子类。

### 5.3 数据与维护（要用户维护窗口，与 W5-17 同一版本号）

| 项 | 做法 |
| --- | --- |
| 目录库版本 | **取落地时 main 的下一个号，不把 23 写死成前提**（统筹条件 4）。W5-17（`claude/ac-w517-catalog-paths`，目录库 22→23）和本片共用同一个新版本号，只升一次；#1101（`codex/memory-management-pages`，别的作者）也把版本设成 23，我们不碰它的分支：它先合，我们就是 v24，维护时段按版本顺序跑（风险登记 R-52）。本片的变化「目录库不再有 `personal_planning_method_packs`」跟着那一个版本走 |
| 脚本 | `scripts/maintenance/goals-personal-planning-move.mjs`（`list`、`move`）：先全读目录库该表，再用与平台同一个 Home 库打开函数（`@molis-ai/molis-work-storage` 的 `openBaselineHomeSqlite`，基线取 `GOALS_HOME_DATABASE`）建出 Home 库并写入，写完逐行读回比对，最后在一个事务里 `DROP TABLE`；幂等（表不在就什么都不改）、真实 Home 要 `--maintenance-window` 并查占用、只在一次性 Home 里演练 |
| 与 W5-17 的顺序 | 同一窗口先跑 W5-17 的 `rewrite`（旧版 → 新版），再跑本脚本 `move`（新版带表 → 新版不带表）；若 #1101 先合，按版本顺序先跑它的维护。两者谁后合入谁在自己的脚本里调用另一个的 `list` 先检查，不各升一次 |
| 防漏跑（必须写清） | 两次维护落在同一个版本号上，版本号本身分不出「搬过没有」，所以 `assertCurrentCatalog` 加一条：目录库里还有 `personal_planning_method_packs` 就拒绝（`catalog.unsupported_schema`，提示先跑维护），避免版本号相同却没搬数据、个人方法静默消失 |
| 建表 | `initializeCatalog` 不再调 `createPersonalPlanningMethodSchema`；`project-catalog.ts` 去掉 `personalPlanningMethods`；`HOME-DATA.md` 4.1 目录库表删一行，4.x 加 Goals Home 库；`table-owners.json` 随之 |

## 6. S12：宿主私路删除

**已删（同一批）**：`goals-actions.ts` 的 `goalsActionProvider`（调用方绑定 `bindGoalsWebActions`、`bindGoalsManagementActions` 留在宿主，改名 `goal-callers.ts`，它们是动作的调用者）、`goal-project-application.ts`、`project-database.ts` 里的 `createGoalReadServices`/`createGovernanceReadServices`（`LocalProjectDatabase.snapshot`/`goalsQuery`）、`demo-seed.ts`（走插件动作，Shelf S4 的做法：一次性 Host 在临时 Home 里跑 Goals 自己的插件）、`feed-application.ts` 对 `getGoal` 的读（Feed 只认自己的对象，Goal 决定的提醒归 Goals 经平台提醒服务写）、`workbench` 从插件包取 `DEFAULT_GOAL_POLICY`/`composePlanningMethodPacks`。测试里直接用 Goals 的两个模块和应用的地方，一律经 `tests/fixtures/goal-application.ts`（plugin 同样的名字空间写日志、幂等记录和引用账本，所以同一个库上的 Host 读得到）。

**S12 实测发现（改测试时撞到的，行为变化都在这里记一笔）**：

- **Inbox 读取入口**：Goals 以插件运行后，待决定提醒的 `owner_plugin_id` 是 Goals 的插件号，而 S9-0b 起 Feed 的 Inbox 读取入口只接未归属条目，提醒会从 Inbox 里消失。统筹 2026-10-25 定的做法是按声明经平台，Feed 与宿主里不点名任何插件：Manifest 的 `attention` 加可选的 `inbox`（`subjects` 的子集），Goals 声明 `inbox: ["goal_decision"]`；`AttentionModule.query` 加 `listInbox`/`getInbox`（未归属条目，加主人声明了该种类的有主条目）；宿主 `plugin-inbox-declarations.ts` 从项目库里运行中的安装、按发行物归档里的 Manifest 读声明，Feed 经 `FeedApplicationPorts.inboxDeclarations` 调这两个查询（RAC-716～719）。其它种类、其它主人照旧隔离，声明只对声明者自己的条目生效。Feed 自己不再能开 `goal_decision` 条目（它不读 Goals 的表）：`createInboxEntry` 对任何 Goal 都以 `feed.invalid_transition` 拒绝，条目由 Goals 开。（此前一版是 Feed 里一张点名 Goals 插件号的表；统筹否决了它，也否决了「先隐藏提醒」的备选。）
- **没有 Home 的 Host**：项目插件名单里声明了 Home 库的插件（Goals）不再进名单，其余插件照常启动（`project-plugins.ts` 的 `startPlatform`）。原先整张名单因 `assertDatabaseEntries` 拒绝而全部起不来。产品里的 Host 都有 Home，只影响测试和单独起的 Host；这样的 Host 不提供 Goals 动作。
- **第一次调用才启动项目插件**：入门、CLI、管理入口对项目的第一次调用现在会启动项目的 Runtime 插件（Goals 在其中），Feed 的来源定时任务随之留下一行 `feed.sources.tick` 调用记录；测试里只看 Goals 的行。
- **演示项目的种入**：走 Goals 的动作，在临时 Home 的一次性 Host 里跑，比原来的直写慢几秒（机器负载高时到十几秒）；重置演示项目的锁超时用例的时限相应放宽。
- **测试迁移的机械规则**：Goals 的事件、幂等记录在日志里的类型带插件号前缀（`io.molis.work.goals:<类型>`）；孤立的项目库要先有根行（`ensureProjectRoot`）插件才能写；共用一个 Home 的两个 Host 不行，测试里让自己的 Host 带 `homeDirectory` 并用 `serveTestHost(null, { home, host })` 当授权端；Feed 提升调用者要 `context-ledger:write`，结构提案的提交与决定要 `attention:write`，`artifacts.links` 要 `goals:read`。

**余项（S12 里还要做）**：

1. `web-request.ts` 的 Goals 改写（BL-386）：按旧地址 `/api/<路径>` 经 `dispatchDeclaredPluginRoutes` 调 Goals 声明的路由，页面客户端改打插件前缀 `/api/plugins/io.molis.work.goals/…`，删改写，通用分发函数没有别的使用者时一起删；`scripts/check-package-boundaries.mjs` 的 goals-command-owner 规则对着新的挂载处。客户端有十来个文件、不能在没有浏览器批的环境里验证，所以单独一片，不跟这一批的代码混在一起。
2. **PG-029 剩下的一半（2026-10-25 统筹加，ac-kernel 不碰这几个文件）**：`goal-callers.ts` 的 `bindGoalsWebActions`、`bindGoalsManagementActions` 手写的 web 与管理出处，以及 `personal-planning-actions.ts` 那条，改成出处由宿主入口给（平台可信来源，#1117 已做内核一半：内核拒绝处理器里自写的 `user_action`，页面路由入口给 `web` 出处），删掉按动作手写的分支。做法：
   - 宿主一个通用函数 `entryUserAction(source, scope, message)`（`apps/local-host/src/entry-user-action.ts`，不含 Goals 的名字）：来源（`web` 或 `management`）、会话（`<来源>:<项目>`，管理入口带证据时用证据里的）、消息（Web 入口取这次请求头里的幂等键——传输层已要求所有改动请求带它，重试同一个键；管理入口取证据里的消息或幂等键）、整份确认依据（Web 入口取请求头 `x-molis-work-whole-confirmation`，只有页面里「整份确认」的控件会发；管理入口取证据）。重试保留的消息身份和整份确认依据都来自入口，不读动作的普通输入（#1117 的 S9 后续要求）。
   - 删：`bindGoalsWebActions` 里关系、策略、结构决定、事件决定四处按动作的分支，宿主对 `hostEventDecisionAuthority`/`managementEventDecisionAuthority`/`managementTreeAuthority` 的使用（后两个从包的导出里删）；Goals 一侧本来只读 `caller.user_action`，不改。管理入口对证据里带身份的拒绝仍在，错误码不变。
   - 对调用方的影响：存下来的决定记录里的 `message_ref` 文字从 `web-decision:<键>`、`web-event-decision:<键>`、`management-tree-decision:<键>`、`management-event-decision:<键>` 变成 `web:<键>`、`management:<键>`（只是审计文字，读它的代码没有）；页面客户端「整份确认」多发一个请求头。
3. **PG-008 的 Goals 部分（同上）**：`goal-callers.ts` 的 `pinPermissions`、`GOALS_ACTION_PERMISSIONS`，以及 `web-request.ts` 的 `goalActions`，改成按 Manifest 与安装授权求解，不再手写权限交给网关：人的调用者就是 `homeActions` 已经在用的、每次请求一份的 `localWebActionContext`（按各动作的声明和正在运行的安装的授权求出权限，成果所有者的固定动作也在其中），`goalActions` 是它加上入口给的出处。`GOALS_ACTION_PERMISSIONS` 保留给测试里造调用者用，宿主不再用它。

## 7. 验收（编号 RAC-700～716，从 700 起；原先写的 294～309 与 S9-0 已合入的 294～296、PG-022 的 300～329 撞号，10-25 改；700 以上远端各分支都没用过）

- **RAC-700**：窗口纪律：窗口外访问、**异步续体里访问（处理器 `await` 之后的回调、被留住的语句句柄）**、窗口里再开窗口、`body` 异步，都抛（`goals.storage.no_window`、`window_conflict`、`async_body`），窗口随后关闭，异步的写事务整体回滚。（`tests/goals-plugin-sqlite.test.ts`）
- **RAC-701**：语句映射与写窗口：`get` 无行为 `undefined`、`all`、`run` 的 `changes`；参数只收字符串、数字、`bigint`、字节、`null`，布尔、`undefined`、对象在入口抛（`parameter_invalid`）；写窗口里内层事务是保存点（`keep: true`），内层抛错只回滚内层、外层继续并提交，整次调用抛错则整体回滚；只读窗口里写、保存点、事务里写都抛 `read_only`，窗口里的只读事务照常读。（同上）
- **RAC-702**：同一个适配器同时满足 Goals 与 Governance 两个仓库的接口形状（类型层面检查），Governance 的 `savepoint` 在写窗口里 `keep`、撤销、抛错各自只动自己的写，嵌套只撤内层；只读窗口里的预览被拒。（同上）
- **RAC-703**：平台保存点原语（通用，任何插件都可用）：插件传不进 SQL（名字、语句都由平台生成）、名字由平台生成、`body` 异步被拒、事务结束后句柄失效、撤权或取消在每一步被检查；`keep:false` 与抛错都回滚到保存点并释放。（安全不变量一行 + `tests/security-invariants-plugin-savepoint.test.ts`）
- **RAC-704**：两条预检（整份、逐条）经保存点跑，结果与原先逐条相同；Governance 的 `exec`/`pragma` 从接口里删除，静态扫描两模块源码没有 `exec(`。
- **RAC-705**：既有模块测试（`goal-events`、`goals-command-module`、`goals-query-*`、`governance-collaboration-module`、`planning-engine` 等）改建在「插件客户端 + 适配器」上仍通过，语句数与 S9-1 相同。
- **RAC-706**：Goals 以 `createGoalsPlugin` 在项目监督器里启动；`LOCAL_OWNER_PERMISSIONS` 不再含 `goals:*`，本机所有者与助手、MCP、页面经安装授权到达同一批动作；动作合同快照里 Goals 的提供方由宿主改为安装，其余逐行不变。
- **RAC-707**：双实例：Home 半与项目半共用 `install_id`，两半的服务调用互相区分（U3）；Manifest 全部权限 `required`。
- **RAC-708**：个人规划保存经 Home 半写进 Goals Home 库；项目半五个入口读到新版本（保存后立即生效），既有项目副本不变；Home 半不可用时以 `goals.planning.personal_unavailable` 拒绝；快照在窗口外读抛错。
- **RAC-709**：维护脚本在一次性 Home 上：`list` 不写；`move` 全读、写、读回、删表；中途失败原样；幂等；真实 Home 不带窗口参数被拒；不是本产品的目录库不动。（`tests/goals-personal-planning-move.test.ts`）
- **RAC-710**：目录库里还有个人规划表时拒绝打开；新建的目录库没有这张表；`personal-planning-actions` 等既有测试改走 Home 半后保持原有断言。
- **RAC-711**：Goals 的 Attention 与账本写入在同一个事务里：事务失败时 `goal_decision` 条目与 Goal 记录一起回滚。
- **RAC-712**：三个异步成果处理器：`pin` 在窗口外等，写在窗口内；取消在 `await` 之后、写之前生效，什么都没写。
- **RAC-713**：宿主私路保持删除（静态扫描）：`goal-project-application.ts` 不存在，宿主源码里没有 `GoalProjectApplication`、`governanceSqlite`、`openGoalsStorage`；没有 `pinPermissions`、`managementTreeAuthority`、`managementEventDecisionAuthority`、`hostEventDecisionAuthority`；`goal-callers.ts` 与 `personal-planning-actions.ts` 不手写 `user_action`，`bindGoalsWebActions` 不按动作分支；`LOCAL_OWNER_PERMISSIONS` 不含 `goals:*`，宿主不再列 `GOALS_ACTION_PERMISSIONS`。（`tests/goals-host-private-paths.test.ts`）
- **RAC-714**：`pluginOutsideMentions`（健康门禁，对照 merge-base）实测：main 为 33，本批终态见 §9 的「收尾实测」；其余门禁都不大于 main。
- **RAC-715**：Goals 的表只有一个主人：`tooling/gates/table-owners.json` 里没有与 Goals 共用的表，`scripts/gates/table-owners.mjs` 通过。（同 RAC-713 的测试文件）
- **RAC-716**：Inbox 照常列出 Goals 的待决定提醒：Goals 以自己的插件号记的 `goal_decision` 条目，因 Goals 的 Manifest 声明了 `attention.inbox`，Feed 的 Inbox 读取入口（`listInboxEntries`、`getInboxEntry`、`setInboxEntryStatus`）认得；别的插件号记的同种类同裸 ID 条目仍不解析（S9-0b 的隔离不动），按原不存在码拒绝。（`tests/goal-decision-attention.test.ts`）
- **RAC-717**：Inbox 查询只给未归属条目和「主人声明了该种类」的有主条目：主人没声明的种类不出现（列表与直接读取一样）；A 声明的种类不让 B 的同种类条目出现，反之亦然；谁也没声明时只有未归属条目，完整列表不变。（`tests/attention-inbox-declarations.test.ts`）
- **RAC-718**：声明来自项目里运行中的安装：停用的安装、没有发行物归档的安装、声明了种类却没写 `inbox` 的安装都不贡献；Feed 的 Inbox 不点名任何插件。（同上）
- **RAC-719**：SDK 解析 Manifest 时，`attention.inbox` 必须是 `attention.subjects` 的非空、不重复的子集；多余字段拒绝。（同上）

## 8. 风险与要先核对的

1. **只读场景里的写**：`assertPluginActionCurrent` 对 `query_only`/`read_only_effects`/只读场景拒绝写。助手、场景以只读方式调用 Goals 命令的现行行为，在切换前先列成断言（逐个命令：被拒的错误码与消息、有无半写入），切换前后必须一致；不一致就停下来问统筹（统筹条件 6）。
2. **每条语句的守卫开销**：客户端每句问授权、调用者、表名。RAC-705 里记下语句数最多的几个动作（快照、`history`、`tree.decide`）；测出来真慢就开一行性能 BL，不在本片优化（统筹条件 7）。
3. **成果库依赖**：`readArtifact`、`pinActionSubject` 现在是宿主进程内的对象；切 Runtime 后只经成果库的公开动作。形状不够就先在成果库的主人那里补动作（合同改动，按 CONTRACT-CHANGES），作为本链最前面的小片，不留私路。
4. **Goals 停用或卸载**：Goals 是每个项目都带的内置插件；Home 半停用对个人规划的影响见 §5.2。项目半被停用后的页面、助手行为沿用其它内置 Runtime 插件的既有规则，不为 Goals 单独开路。
5. **体量**：约 30 个文件的实质改动（适配层 + 保存点 + 两个插件定义 + 删宿主装配 + 脚本 + 测试 5 个改写）。内部提交顺序：①平台保存点原语 ②适配器与两模块接口收窄（宿主仍装配，测试在适配器上跑）③`createGoalsPlugin` 与 Manifest/注册/监督器条目，删宿主装配 ④个人规划 Home 半与读取快照 ⑤数据搬迁脚本与目录库检查 ⑥文档、门禁、快照。
6. **不能在本机验证的**：真实 Home 的维护只在统筹问到时段后由用户做；演练只用一次性 Home。浏览器批与全量不跑（统筹要求），依赖 CI 全量。

## 9. 分片与顺序（叠着做，只推分支，不开 PR，等维护窗口；不跑全量和浏览器批）

| 片 | 内容 |
| --- | --- |
| A | 成果库公开动作核对（已做，见 §3.5：`artifacts.read` 够用，不补动作）；`readArtifact` 与 `pin` 改走 `directory` 的两个差异在片 D 里按 §8.1 的断言验证：原来宿主直读不查权限，经 `directory` 要原调用者持有 `artifacts:read`，非用户调用者（助手、运行时提议成果）有没有这个权限要列成断言，不一致就停下来问统筹；`readArtifact` 是同步端口，改成「处理器先异步取好要用的几条成果头，再同步建视图」 |
| B | 平台保存点原语（合同、客户端、SDK 快照、CONTRACT-CHANGES、SI 暂定号、拒绝用例） |
| C | `PluginSqlite` 适配器与两模块接口收窄（Governance 去掉 `exec`/`pragma`），宿主仍装配，既有模块测试跑在适配器上 |
| D | `createGoalsPlugin`、Manifest 权限与库声明、项目监督器条目，删宿主装配；动作合同快照 |
| E | 个人规划 Home 半、调用快照、错误码、Home 库声明 |
| F | 搬迁脚本、目录库防漏跑检查、HOME-DATA 与 `table-owners`、文档 |

## 10. 收尾实测（S12 收尾时量的数，2026-10-25）

- **门禁（对照 merge-base 584112c65）**：`node scripts/check-health-gates.mjs --base origin/main` 全过。`pluginOutsideMentions` 的 goals 一项 32（main 33），其余各项都不大于 main；`pnpm api:update` 刷出 3 个快照（`attention-resumption`、`plugin-attention`、`plugin`，只加 `inbox` 与 `AttentionInboxDeclarations`、`listInbox`/`getInbox`），`pnpm actions:update` 刷出 Goals 的权限与调度形状（树决定与提交要 `attention:write`，意见确认、交付物与输入要 `context-ledger:write`、`artifacts:read`，`artifacts.links` 要 `goals:read`）和两条个人规划动作改归 Goals 的 Manifest（不再是宿主登记的行）。
- **测试**：改动涉及的 227 个单元用例文件（`affected-tests` 里按文件改动、共用夹具、包与命名点到的）加早先逐片跑的 81 个；浏览器用例（约 51 个文件用到被改的夹具）和全量不在这里跑，交批里的全量。清扫发现并改了的都是测试侧或文档计数：`project-database-baseline`（双实例的 Goals 项目半也声明项目库表）、`action-contract-snapshot`（没有宿主登记的 Home 层提供方了，改用合成的一条）、`affected-tests`（装配名单 26 → 25、local-host 半 13 → 12）、`artifact-links`（调用者要 `goals:read`）、`assistant-business-gateway`（Goals 要先启动，项目要有根行）、`desktop-tui`（夹具事件要写成 Goals 自己的名字才算进它的游标）、`artifact-browser`（演示样例的 CORE 交付物进了成果库，要看空库的用例改用只有板的夹具）、`personal-plugins-review-fixes`（Home 登记多一个 `goals`）、`goal-deliverable-proposals`（端口多了 `read`/`write`）。`npm-package` 与 `resident-management-actions`、`knowledge-*` 三个是构建过期或机器负载下超时，重建后单独重跑通过。
- **Inbox 声明（统筹 2026-10-25 的决定）**：见 §6 的「Inbox 读取入口」与 RAC-716～719；Feed/Inbox 迁 Runtime 线（FI-2 #1283、FI-3）不碰这几处，FI-4/FI-6 之后改 `createLocalFeedApplication` 的构造点时基于本栈合入后的样子。
- **S 号**：本栈的 S-66（Attention 与关联边服务的安全不变量）与保存点原语的 S-67 是暂定号，main 已有 S-67（后台服务）和 S-68（Attention 服务，#1245 落地时改的）；SI 文档门禁只认数字号，落地时由统筹改号，不要在本栈里抢。
- **没做的**：S9-2（名字、游标、Attention 主人的维护）等用户的维护时段，同 W5-17；真实 Home 一直没碰；目录库版本没升（分支留在 22，落地时取 main 上的下一个号）。
