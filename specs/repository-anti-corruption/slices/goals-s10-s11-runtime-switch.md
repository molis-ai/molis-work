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

## 6. S12（只列，不在本片）：宿主私路删除

`goals-actions.ts` 的 `goalsActionProvider`（`bindGoalsWebActions`、`bindGoalsManagementActions` 等调用方绑定留在宿主，它们是动作的调用者）、`goal-project-application.ts`、`project-database.ts` 里的 `createGoalReadServices`/`createGovernanceReadServices`（`LocalProjectDatabase.snapshot`/`goalsQuery`）、`demo-seed.ts`（走插件动作，Shelf S4 的做法）、`web-request.ts` 的 Goals 改写（BL-386）、`workbench-renderer.ts` 的 `DEFAULT_GOAL_POLICY`/`composePlanningMethodPacks`（改从插件包取）、`installer/home-release.ts` 的包名清单、`feed-application.ts:55` 对 `getGoal` 的读（Feed 判断 Goal 是否存在，要改成经 Goals 公开动作问，S12 里查清）。

## 7. 验收（编号 RAC-294～309，从 294 起；远端各分支都没用过）

- **RAC-294**：窗口纪律：窗口外访问、**异步续体里访问（处理器 `await` 之后的回调、被留住的语句句柄）**、窗口里再开窗口、`body` 异步，都抛（`goals.storage.no_window`、`window_conflict`、`async_body`），窗口随后关闭，异步的写事务整体回滚。（`tests/goals-plugin-sqlite.test.ts`）
- **RAC-295**：语句映射与写窗口：`get` 无行为 `undefined`、`all`、`run` 的 `changes`；参数只收字符串、数字、`bigint`、字节、`null`，布尔、`undefined`、对象在入口抛（`parameter_invalid`）；写窗口里内层事务是保存点（`keep: true`），内层抛错只回滚内层、外层继续并提交，整次调用抛错则整体回滚；只读窗口里写、保存点、事务里写都抛 `read_only`，窗口里的只读事务照常读。（同上）
- **RAC-296**：同一个适配器同时满足 Goals 与 Governance 两个仓库的接口形状（类型层面检查），Governance 的 `savepoint` 在写窗口里 `keep`、撤销、抛错各自只动自己的写，嵌套只撤内层；只读窗口里的预览被拒。（同上）
- **RAC-297**：平台保存点原语（通用，任何插件都可用）：插件传不进 SQL（名字、语句都由平台生成）、名字由平台生成、`body` 异步被拒、事务结束后句柄失效、撤权或取消在每一步被检查；`keep:false` 与抛错都回滚到保存点并释放。（安全不变量一行 + `tests/security-invariants-plugin-savepoint.test.ts`）
- **RAC-298**：两条预检（整份、逐条）经保存点跑，结果与原先逐条相同；Governance 的 `exec`/`pragma` 从接口里删除，静态扫描两模块源码没有 `exec(`。
- **RAC-299**：既有模块测试（`goal-events`、`goals-command-module`、`goals-query-*`、`governance-collaboration-module`、`planning-engine` 等）改建在「插件客户端 + 适配器」上仍通过，语句数与 S9-1 相同。
- **RAC-300**：Goals 以 `createGoalsPlugin` 在项目监督器里启动；`LOCAL_OWNER_PERMISSIONS` 不再含 `goals:*`，本机所有者与助手、MCP、页面经安装授权到达同一批动作；动作合同快照里 Goals 的提供方由宿主改为安装，其余逐行不变。
- **RAC-301**：双实例：Home 半与项目半共用 `install_id`，两半的服务调用互相区分（U3）；Manifest 全部权限 `required`。
- **RAC-302**：个人规划保存经 Home 半写进 Goals Home 库；项目半五个入口读到新版本（保存后立即生效），既有项目副本不变；Home 半不可用时以 `goals.planning.personal_unavailable` 拒绝；快照在窗口外读抛错。
- **RAC-303**：维护脚本在一次性 Home 上：`list` 不写；`move` 全读、写、读回、删表；中途失败原样；幂等；真实 Home 不带窗口参数被拒；不是本产品的目录库不动。（`tests/goals-personal-planning-move.test.ts`）
- **RAC-304**：目录库里还有个人规划表时拒绝打开；新建的目录库没有这张表；`personal-planning-actions` 等既有测试改走 Home 半后保持原有断言。
- **RAC-305**：Goals 的 Attention 与账本写入在同一个事务里：事务失败时 `goal_decision` 条目与 Goal 记录一起回滚。
- **RAC-306**：三个异步成果处理器：`pin` 在窗口外等，写在窗口内；取消在 `await` 之后、写之前生效，什么都没写。
- **RAC-307～309**：预留给 S12/S9-3（宿主私路删除的静态扫描、`pluginOutsideMentions` 实测、`table-owners` 登记）。

## 8. 风险与要先核对的

1. **只读场景里的写**：`assertPluginActionCurrent` 对 `query_only`/`read_only_effects`/只读场景拒绝写。助手、场景以只读方式调用 Goals 命令的现行行为，在切换前先列成断言（逐个命令：被拒的错误码与消息、有无半写入），切换前后必须一致；不一致就停下来问统筹（统筹条件 6）。
2. **每条语句的守卫开销**：客户端每句问授权、调用者、表名。RAC-299 里记下语句数最多的几个动作（快照、`history`、`tree.decide`）；测出来真慢就开一行性能 BL，不在本片优化（统筹条件 7）。
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
