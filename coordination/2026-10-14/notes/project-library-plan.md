# 项目库服务：计划（② 平台，2026-10-19 返工版，待 ① 批）

**状态**：按 D15（`coord-shared/DISPATCH-1019-0710.md`）和评审底稿 `coord-shared/review/plan-review-project-library-1019.md` 返工，写进了用户 10:20 UTC 的两项决定（升 v8 并维护；现在拆 `boards`）。事实由只读子代理按 main `8eedf2222` 清点，关键行号在 `fbc826b68` 上抽查过。批了以后改写成 `specs/plugin-project-database/spec.md`，随 L1a 入库。

**依据**：spec §1 2026-10-18「项目库里的插件表」一行（X-5）；privileges.md PG-020、PG-021、PG-022 的项目一半；§4 h（Goals 的表由 Goals 声明、X-5 建）、§4 k（Home 级实例按项目给服务，PG-025）；§10.29 裁定 2、8。

## 0. 结论

1. **声明写进 Manifest**：`PluginManifest.databases.project`。谁都能声明（随宿主发布的、装上的、创作台生成的一样），按安装授权。不新开只给可信条目的字段（§10.29 裁定 2）。Home 一半 `databases.home` 是 L4，同一份设计。
2. **平台建表、记账**：项目库里一张平台账本 `plugin_project_databases`，打开函数放在 plugin-runtime 的新文件。账本记发布者签名，同一个 id 换了发布者打不开旧表。
3. **项目库的身份改成项目本身**（用户决定 b）：平台表 `project_root`，一库一行。8 个包里 **11 张**表的外键改指它；`boards` 改为 Goals 自己声明的表，归 ③ 的 S8。
4. **基线升 v8，维护一次**（用户决定 a）：真实 Home 只动一次，所以 L1b 与 S8 同一批。
5. **插件怎样读写**：L2 给一份 Home 库和项目库共用的客户端包装，加逐句检查（`EXPLAIN` 操作码白名单，根页对照账本）。L3 让沙箱经 broker 拿库，与 L2 同批。
6. **切片**：L1a → L1b 加 S8（同批）→ L2、L3 加 Coding（同批）→ L4（排在 W5-02 PR-1b 的 PG-067 片之前）。

**D15 九点对照**

| D15 | 在哪 |
| --- | --- |
| 1 声明进 Manifest，并入 PG-017、PG-022 | §2.1；L3（PG-017 的数据库一半）、L4（PG-022 的 Home 一半） |
| 2 Goals 不进 L1，S8 接，不开边界例外；S5、S8 先后与 ③ 定 | §3、§3.4 |
| 3 逐句检查重做，每种拒绝一条测试 | §2.4 |
| 4 S-18 扩到项目库，测试进 `pnpm test:security`；客户端包装与 `openPluginDatabase` 共用；账本记发布者签名 | §2.4、§2.2、§2.8 |
| 5 列全建表点和跨主人事务；L2 合同给调度留口 | §1.2、§1.3、§2.6 |
| 6 新代码进新文件；`ensureProjectPlugins` 不加行；错误码 `plugin.` 开头；L2 跑 `api:update`，Skill、手册同 PR；两片都进批 | §2.2、§3 |
| 7 L1 拆成 L1a、L1b，同一批；L2 与 Coding 同批 | §3（L1b 另与 S8 同批，见下） |
| 8 Home 级插件的范围 | §2.7（挂 PG-025） |
| 9 PG-021 按用户决定写；更正事实 | §2.3、§1.13 |

L1a 与 L1b 我建议**不必同批**：L1a 只有合同、SDK、plugin-runtime 的新文件和夹具测试，不碰宿主基线，合进 main 后行为不变。L1b 必须与 S8 同批（v8 维护里要写 Goals 的账本行）。D15 第 7 条若仍要 L1a、L1b 同批，三片一起进批也可以，① 定（§4 第 7 条）。

## 1. 事实（main `8eedf2222`）

### 1.1 基线 v7

- `PROJECT_DATABASE_BASELINE`（`apps/local-host/src/project-database-schema.ts:36-68`，`version: 7` 在 `:37`）拼了 28 段建表语句，来自 16 个目录（`docs/system/HOME-DATA.md` §4.2 同一份清单）。
  - 插件包 3 个：Feed 的出口规则（`:25`，1 张）、Schedule（`:26`，5 张：`schedule_conversation_tasks`、`schedule_conversation_turns`、`schedule_plugin_reminders`、`schedule_operations`、`schedule_operation_occurrences`）、Coding（`:27`，2 张：`coding_sessions`、`coding_plan_drafts`）。
  - Goals 的 Module（`:2-8`）和 governance-collaboration（`:9`）。
  - 其余是平台与 Module：storage、plugin-runtime、artifacts、context-ledger、sources、signals、attention、feed Module、listener-host、scheduler，和 local-host 自己的浏览设置。
- 版本不符就拒，不就地升级：`packages/storage/src/sqlite-baseline.ts:32-47`，`:37` 抛 `storage.schema_version_mismatch`。
- 打开：`apps/local-host/src/project-database.ts:13-31`（`:20` 套基线）；连接是 better-sqlite3，开 WAL 和 `foreign_keys=ON`（`packages/storage/src/sqlite.ts:156-175`）。

### 1.2 在项目库连接上建表的地方

都用 `IF NOT EXISTS`，每次构造或调用都再执行一遍。

**插件表的，L1b 删掉：**

| 执行点 | 表 | 谁调 |
| --- | --- | --- |
| `apps/local-host/src/schedule-runtime.ts:119,124,125`（`scheduleServiceFor`，`:115-145`） | Schedule 的 5 张 | `installed-plugin-host.ts:121`、`project-schedulers.ts:57`、`schedule-actions.ts:14,30`、`project-capabilities.ts:75` |
| `plugins/native/schedule/src/tasks.ts:112,123,134,150`、`reminders.ts:47`、`reminder-management.ts:26`、`operation-management.ts:25`、`operations.ts:98`、`service.ts:36` | 同上 | 宿主包装 `schedule-reminders.ts:11-28`、`schedule-operations.ts:14-24`、`schedule-runtime.ts` |
| `plugins/native/coding/src/store.ts:105`（`CodingSessionStore` 构造） | Coding 的 2 张 | `apps/local-host/src/coding-surface.ts:119`、`project-plugins.ts:156` |
| `plugins/native/feed/src/out-rules.ts:70`（`FeedOutRuleStore` 构造） | `feed_out_rules` | `apps/local-host/src/feed-application.ts:114` |

**平台与 Module 的，留在 v8 基线，本计划不动**：scheduler（`horizontal/scheduler/src/index.ts:180`）、listener-host（`feed-application.ts:53` 和 `horizontal/listener-host/src/index.ts:260`）、sources（`:149`）、attention（`:149`）、feed Module（`:180`）、context-ledger（`repository.ts:36-37,52-53`）、signals（`:107`）、plugin-runtime 的 5 个仓库、浏览设置（`project-browsing-settings.ts:15`）。Goals 的 Module 不在项目库上执行建表语句；`createGovernanceSchema` 只在测试里跑；`GOAL_EVENT_TRUSTED_DECISIONS_SQL`（`governance-collaboration/src/event-decisions.ts:16-36`）从没执行过，是 `schema.ts:72-90` 的重复。

### 1.3 跨主人的同一事务（项目库上）

调度器的表归 `horizontal/scheduler`（`index.ts:135-166`）；Schedule 只经它的接口（`register`、`cancel`、`setEnabled`）写，不写 SQL。

| 位置（`plugins/native/schedule/src` 简写 SN） | 主人甲 | 主人乙 |
| --- | --- | --- |
| SN `operations.ts:118-132` 加；`:135-139` 取消（`remove` `:105-110`）；`:142-146` 按安装取消；`:152-168` 对账；`:174-185` 开关 | Schedule 的操作与发生 | 调度器 |
| SN `operations.ts:230-240` 执行操作的收尾事务 | 同上 | feed、sources、attention 和 storage 的 `events`，经 `ports.deliver`（`apps/local-host/src/schedule-operations.ts:60-71`） |
| SN `reminders.ts:67-79` 加；`:82-88` 取消；`:92-97` 按安装取消 | Schedule 的提醒 | 调度器 |
| SN `reminders.ts:107-116` 投递提醒 | 同上 | feed、sources、attention、`events`（`schedule-reminders.ts:54-64`） |
| SN `reminder-management.ts:51-68`、`operation-management.ts:36-77` 恢复 | Schedule | 调度器 |
| SN `service.ts:77-83` 改任务；`:87-92` 归档 | Schedule 的任务 | 调度器 |
| **反方向**：调度器领作业 `horizontal/scheduler/src/index.ts:323-345`（事务 `:328-344`） | 调度器 | `wakeupIndex.prepare`（`:341`，必须同步）→ `schedule-runtime.ts:70-74` → SN `operations.ts:83-89` 写发生记录 |
| Feed 的端口 `transaction: db.transaction(op).immediate()`（`feed-application.ts:123`，另有 `feed-connector-sync.ts:70`、`feed-goal-promotion.ts:39`、`feed-source-service.ts:58`），用在 `plugins/native/feed/src/connector-sync.ts:115`、`goal-promotion.ts:74,101`、`source-history.ts:102`、`source-service.ts:162`、`source-sync.ts:95,143` | Feed 插件的 `FeedApplication` | sources、listener-host、feed Module、attention、`events` |
| `modules/goals/src/board-commands.ts:18-55` 建看板 | `boards` | storage 的 `events`、`idempotency_records` |

不在事务里、却写两个主人的：SN `service.ts:70-74` 建任务，SN `wakeup.ts:130-151` 暂停与恢复任务。Module 在自己的事务里顺手写 storage 的 `events`，是常态。

L1b 不改这些：宿主仍在同一条连接上替它们跑。它们约束的是 L2 的合同（§2.6）和 ③ 迁 Schedule、Feed、Goals 的方式。

### 1.4 指向 `boards(project_id)` 的外键（全是 `ON DELETE CASCADE`）

Goals 之外：**8 个包，11 张表**（D15 写的是 10 张，artifacts 的模板一次建两张）。

| 文件:行 | 包 | 表 |
| --- | --- | --- |
| `horizontal/listener-host/src/index.ts:90` | listener-host | `feed_source_runs` |
| `modules/artifacts/src/repository.ts:51`（模板 `:44-45`） | artifacts | `library_artifacts`、`process_items` |
| `modules/attention-resumption/src/index.ts:64` | attention | `inbox_entries` |
| `modules/feed/src/index.ts:62`、`:94` | feed Module | `feed_items`、`feed_materials` |
| `modules/sources/src/index.ts:39` | sources | `feed_sources` |
| `packages/storage/src/sqlite.ts:131`、`:144` | storage | `idempotency_records`、`events` |
| `plugins/native/coding/src/store.ts:53` | Coding | `coding_sessions` |
| `plugins/native/feed/src/out-rules.ts:48` | Feed 插件 | `feed_out_rules` |

Goals 一侧：modules/goals 的 23 张、governance 的 4 张（`schema.ts:4,27,55,74`）指向 `boards`；governance 另有 2 处指向 `goals(`（`schema.ts:5` SET NULL，`:75` CASCADE）。7 个测试文件里也写着 `REFERENCES boards`（例如 `plugins/native/alchemist/tests/work-reuse/fixture.ts:20`）。

只有 storage 的 `events` 用 `AUTOINCREMENT`（`sqlite.ts:142`），所以项目库里有共用的 `sqlite_sequence`；Coding、Feed、Schedule、Goals 的表都不用。

### 1.5 `boards` 和项目的身份

- 建表在 `modules/goals/src/schema.ts:158-166`：`project_id` 主键、`title`、`active_goal_id`、`created_at`、`updated_at`；没有 `IF NOT EXISTS`，没有外键。
- 读写它的 SQL 全在 modules/goals（写：`repository.ts:62,67,72`、`guidance-commands.ts:146,319`；读：`repository.ts:58,77`、`guidance-commands.ts:29`、`query-facts-repository.ts:16`）。Goals 之外没有一处 SQL 碰它。没有一处改 `title`。
- 经接口用它的：`getBoard`（`apps/local-host/src/demo-plugin-seed.ts:35`、`demo-seed.ts:92`，Goals 插件的 `goal-tree-decision.ts:51,300-301`、`goal-tree-submission.ts:56,172-173`、`goal-tree-query.ts:18,25`）；`validateManagedBoard`（`demo-project-lifecycle.ts:64,98`、`managed-project-files.ts:48,60,67`）；`initializeBoard`（`managed-project-database.ts:14`、`demo-seed.ts:94`、`local-plugin-development.ts:45`、`goal-project-application.ts:203-209`、`goals-actions.ts:20`、`server/tooling/continuity-demo.mts:40`，动作 `goals.board.initialize`）。
- 建项目的顺序（`apps/local-host/src/managed-project-database.ts`）：开库套 v7（`:12`）→ `initializeBoard`，`title` 取显示名（`:14-19`）→ checkpoint → 关闭；然后 `validateManagedBoard`（`:26-54`）：看板正好一个且等于 id，`integrity_check`，快照。调用方是 `managed-project-files.ts:54` 的 `provisionCreatedProject`（`:32-77`）。
- 项目的身份真正在 `projects/catalog.db` 的 `projects` 表（`modules/projects/src/repository.ts:324-333`），`ProjectService.register`（`project-service.ts:67-75`）在同一个目录库事务里登记项目并启用 `goals`。`boards.title` 只是建项目时抄的一份，之后从不同步。

### 1.6 Home 库服务（样板）

- `openPluginDatabase(home: string, declaration: PluginDatabaseDeclaration, authorize)`（`apps/local-host/src/plugin-database.ts:6`；main 上还没有 `installId`，#797 加）：
  - 库名正则（`:9`），先要 `storage:private`（`:10`）；写连接 `openBaselineHomeSqlite`，读连接 `openReadOnlyHomeSqlite`（`:11-15`）。
  - 每次调用 `permit`（`:18-21`）：关了就 `actions.plugin_unavailable`，再按授权核权限。
  - 读只认 `SELECT`、`WITH`（`:61-63`）；写只经 `transaction(beforeEffect, write)`（`:29-55`）：先等 `beforeEffect`，再核一次，`BEGIN IMMEDIATE`；`run` 只认 `INSERT`、`UPDATE`、`DELETE`（`:43`）；事务结束后再用句柄拒（`actions.forbidden`）；异步写体回滚并拒（`requireSynchronous`，`:47`）。
- 可信条目的整单检查 `assertDatabaseEntries`（`plugin-database-entries.ts:24-47`）：没有 Home、沙箱、库名不合、库不在 `home.stores`、不是库、主人不是自己、版本或建表语句与登记不同、重名、Manifest 缺权限，都拒。调用在 `home-plugins.ts:123`、`plugin-platform.ts:220`。
- 失效：Home 侧 `home-plugin-executor.ts:45-71,110-115`（停之前先 `revoke()`）；项目侧 `plugin-host-services.ts:40-90`。
- `pnpm test:security` 含 `tests/home-plugin-platform.test.ts`、`issue-home.test.ts`、`issue-home-runtime.test.ts`；不含 `plugin-project-database.test.ts`、`project-database-baseline.test.ts`、`home-plugin-private-store.test.ts`。S-18 在 `docs/system/SECURITY-INVARIANTS.md:32`。

### 1.7 Manifest、权限和今天的数据库声明

- `PluginManifest`（`packages/contracts/src/platform/plugin.ts:210-285`）没有任何数据库或存储声明字段。`services.database` 的注释在 `:96`（「只给声明了库的可信宿主条目」）；privileges.md PG-022、PG-025 引的 `:83-84`、`:89` 已过时。
- 今天的 `database:` 只由可信条目带：
  - Home 级 5 条：`apps/workbench/src/builtin-plugins.ts:110`（issues）、`:116`（cognia）、`:145`（images）、`:162`（jelly）、`:279`（todo）。
  - 项目级 4 条：`apps/local-host/src/project-plugins.ts:254`（dataset）、`:258`（form，`database: FORM_DATABASE`）、`:262`（lingguang）、`:266`（ppt）。它们开的仍是 **Home** 库（`plugin-host-services.ts:89`），不是项目库。
  - 声明本身有 10 份（cognia `store.ts:150`、dataset `:316`、form `:350`、images `:17`、issues `:27`、jelly `:111`、lingguang `:275`、ppt `:249`、todo `:496`、workflows `:240`）；Workflows 那份由谁带，L4 再核。
- Coding 的权限（`plugins/native/coding/src/manifest.ts:50-60`）已有 `storage:private`，没有库声明。

### 1.8 体量与锚点

- `packages/plugin-runtime/src/index.ts` 763 行（上限 800）；`PluginRuntime` 类 637 行、30 个方法，是登记的巨大单元，不许变大。
- `apps/local-host/src/project-plugins.ts` 282 行：`ensureProjectPlugins` `:88-107`；`startPlatform` `:109-249`，141 行（函数上限 150）。

### 1.9 Goals

- 不是 `always_on`（全仓只有 Shelf，`plugins/native/shelf/src/manifest.ts:29`）；在冻结的 `BUILD_TIME_ASSEMBLED` 里（`tests/builtin-plugin-assembly-gate.test.ts:45-48`），不在 Plugin Runtime 上，处理器在 `apps/local-host/src/goals-actions.ts` 接线。
- Goals 插件包只依赖 contracts、plugin-sdk、design-system；依赖 `module-goals` 的只有 local-host。
- 表：modules/goals 27 张（不算 `boards` 26 张），governance 4 张。

### 1.10 版本门禁

- `scripts/verify-release-versions.mjs`：
  - `:207` 认 `const X: SqliteBaseline | PluginDatabaseDeclaration =`，每个都要列进 CHECKLIST §3（`checkDatabaseTable` `:299-319`）。
  - `checkBaselineCalls`（`:277-297`）：每个 `applySqliteBaseline`、`openBaselineHomeSqlite` 调用的第三个参数是具名的已声明常量。`plugin-database.ts` 的唯一豁免（`:287-289`）按原文匹配 `function openPluginDatabase(home: string, declaration: PluginDatabaseDeclaration,`：改这两个参数的名字或类型，门禁就红。
- `scripts/gates/store-versions.mjs`：CHECKLIST §3 的版本一变，spec §4.1「库版本维护清单」（`spec.md` 标题 `:1297`）里要有一行「旧 → 新」；新增或删除行不要。
- `docs/releases/CHECKLIST.md`：§3 项目库一行在 `:34`（v7）；§4.3 在 `:90`，维护六在 `:100-106`。
- v7 的维护脚本和演练（`tests/fixtures/project-maintenance-v7.sql`、`tests/project-maintenance-v7.test.ts`）在 main 上已删，样板从 `9fba2db43` 取。spec §4.1 维护六在 `:1440-1452`，维护八（候选）在 `:1465`。

### 1.11 Home 级插件

5 个 Home 级 Runtime 插件（issues、cognia、images、jelly、todo）都不开项目库。Images、Todo 在自己的 Home 库里按 `project_id` 存行，删项目时经 `project_data` 清（`apps/local-host/src/plugin-project-cleanup.ts:26-45`）；Cognia 一个库所有项目共用。PG-025（privileges.md:165）：Home Runtime 不给成果、端口、事件（`home-plugin-executor.ts:38-40` 抛错）。

### 1.12 表的主人门禁

`tooling/gates/table-owners.json`：`shared` 里只有 storage 的 `events`、`idempotency_records`（使用者 modules/goals、governance-collaboration）。规则（`scripts/gates/table-owners.mjs:1-25`）：源码里有 `CREATE TABLE <名>` 的包是主人，别的包的 SQL 字面量读写它就失败，`REFERENCES` 不算。所以把 `boards` 的建表搬进 `plugins/native/goals`、而 `modules/goals` 还读写它，门禁会红，除非一起搬或加 `shared` 条目。

### 1.13 对 D15 和旧计划的更正

- 指向 `boards` 的是 **11 张**表（8 个包），不是 10 张。
- `CodingSessionStore` 在 `project-plugins.ts:156`（旧稿 `:154`），`database: FORM_DATABASE` 在 `:258`（旧稿 `:252`）。
- Goals 不是 `always_on`。
- 账本 4 行（Coding、Feed、Schedule、Goals），对。
- 旧稿 2.4「`boards` 留在宿主基线」和 PLIB-09 按用户决定 b 作废；旧稿 §4 第 5 条「`boards` 进 Goals 的声明不可行」，有了 `project_root` 之后可行。

## 2. 设计

### 2.1 Manifest 声明（L1a；PG-022 的项目一半）

```ts
interface PluginManifest { …; readonly databases?: PluginManifestDatabases }
interface PluginManifestDatabases {
  readonly project?: PluginDatabaseDeclaration;  // L1a
  readonly home?: PluginDatabaseDeclaration;     // L4
}
```

- **按范围的对象，不用数组**：每个范围结构上最多一份；每份仍是 `const X: PluginDatabaseDeclaration = {…}`，`verify-release-versions.mjs:207` 照样认得，CHECKLIST §3 的版本表要列出每个插件的项目库。门禁不用改。
- L1a 只认 `project`，SDK 拒 `home` 到 L4 为止。
- `read_permission`、`write_permission` 必须在这份 Manifest 的 `permissions` 里，每次调用按安装的授权核。自己的表推荐两项都写 `storage:private`：Coding 已经声明了它，已有安装不用补授权；Images 的 Home 库也这么写。要分读写的插件自己声明一对。
- **检查两层**，安装和每次启动都做，任一项不过整份拒绝、不建任何表：
  - **形状**（SDK，只依赖 contracts）：字段齐、类型对，`store_name` 合 Home 库同一条正则，`version` 是正整数，权限在 `permissions` 里。
  - **SQL**（plugin-runtime 新文件里的纯函数；SQLite 由宿主注入，plugin-runtime 不加 SQLite 依赖）：
    1. 先把 `schema` 按语句切开（引号、注释、括号之外的分号）。每句只能以 `CREATE TABLE` 或 `CREATE [UNIQUE] INDEX` 开头，否则**不执行任何一句**就拒。这样 `ATTACH`、`PRAGMA`、触发器、视图、虚表连内存库里都不会跑。
    2. 宿主在内存库里执行，交回描述：storage 的 `describeSqliteSchema`（`sqlite-baseline.ts:92`）加一份对象清单（类型和名字）。storage 在 L1a 加一个函数。
    3. 规则：只有表和索引；名字不以 `sqlite_` 开头；不用 `AUTOINCREMENT`（`sqlite_sequence` 是全库共用的，见 1.4）；外键只指向自己的表或 `project_root(project_id)`。
  - 名字撞了基线或别的插件，在打开时对照真库查（2.2）。
- 改合同注释：`plugin-database.ts:19` 的「Selected by the trusted Host entry」在 L1a 改成按 Manifest 声明；`services.database`（`plugin.ts:96`）到 L4 之前标「2026-10-18 改」（#786 已在加这类标记，L1a 排在它之后）。

### 2.2 账本与打开函数（L1a）

- 账本 `plugin_project_databases`，建表语句由 plugin-runtime 导出，进 v8 基线（和它已有的 `plugin_runtime_installs` 等一样）：`plugin_id` 主键、`publisher_signature`、`store_name` 唯一、`version`、`tables_json`（表与索引名）、`created_at`。
- `openPluginProjectDatabase(connection, { plugin_id, publisher_signature, declaration }, describe)`，放在 plugin-runtime 的新文件（`index.ts` 已 763/800，`PluginRuntime` 类不许变大）：

  | 情况 | 结果 |
  | --- | --- |
  | 没有账本行，声明的表一张都不在 | 一个写事务里执行 `schema`、写账本行 |
  | 没有账本行，同名对象已在（基线的、别的插件的、来历不明的） | 拒 |
  | 账本行的发布者签名与 Manifest 不同 | 拒。卸载不删表也不删行，同一个 id 换了发布者拿不走数据 |
  | 版本相同，表的形状与声明一致 | 打开 |
  | 版本相同，形状不一致（库被手改过） | 拒 |
  | 版本不同 | 拒，只拒这个插件的启动，项目和别的插件照常；报错写库路径、库名和两个版本 |

- 错误码用 `defineErrorCodes("plugin", …)`，全以 `plugin.` 开头（plugin-runtime 的主人是 `plugin`），不新写 Error 子类。
- 版本仍是「记在库里、平台核对、不符就拒、靠一次性维护」（POLICY 第 5 节），不写就地升级。删项目时整个目录一起走。

### 2.3 项目根行与 `boards`（用户决定 b）

- 平台表 `project_root(project_id TEXT PRIMARY KEY, created_at TEXT NOT NULL)`，一库正好一行，就是「项目本身」。标题不放这里：真相是目录库的 `display_name`（1.5）。
- **主人推荐 `modules/projects`**：它已经拥有项目的身份（`ProjectService.register`、目录库）。它导出建表语句和 `writeProjectRoot(db, project_id, created_at)`，v8 基线把它排在第一段。表的主人门禁只数 SQL 字面量，别人的 `REFERENCES` 和外键检查不算。
- 11 张表的外键改指 `project_root(project_id)`，`ON DELETE CASCADE` 不变。
- `boards` 改为 Goals 声明的表（S8），外键指 `project_root`；Goals 其余 26 张和 governance 的 4 张照旧指 `boards` 或 `goals`。
- 建项目（`managed-project-database.ts`）改成：开库套 v8 → 写根行 → 对启动名单上声明了 `databases.project` 的插件逐个调打开函数（含 Goals 的 `boards`）→ Goals 建自己的看板（Goals 上 Runtime 之前由宿主替它调，过渡写法归 S8）→ checkpoint。校验改核根行：正好一行、等于 id、`integrity_check`、快照；看板那条检查随 S8 交给 Goals。`validateManagedBoard` 的三个调用方一起改。

### 2.4 插件怎样读写（L2）

- 合同 `PluginHostServices.project_database?: PluginDatabase`，与 Home 库同一个接口；`pnpm api:update`；Skill 与手册同 PR 改（CONTRACT-CHANGES §3 第 2 条）。
- **一份客户端包装**：把 `openPluginDatabase` 的规则抽进新文件：读只经只读连接；写只经 `transaction(beforeEffect, write)`；异步写体拒绝并回滚；每次调用核授权；停用后句柄失效；写前 `assertPluginActionCurrent(installId)`（#776、#797）。Home 库和项目库都用它，两边只换驱动和逐句检查。`openPluginDatabase(home: string, declaration: PluginDatabaseDeclaration, …)` 的前两个参数原样保留，免得动 `verify-release-versions.mjs:287-289` 的豁免（那要改门禁）。
- **同一文件只用一份 SQLite 库**：项目库的客户端用宿主那份 better-sqlite3，写用宿主的连接（写体是同步的，不会和宿主交错），读另开一条 `readonly` 连接。不能像 Home 库那样用 `node:sqlite` 另开：同一进程里两份库关连接会互相释放 POSIX 锁。
- **逐句检查**（better-sqlite3 没有 authorizer）：
  1. Home 库那两道关键字过滤原样保留（`plugin-database.ts:43,62`）：读只认 `SELECT`、`WITH`，写只认 `INSERT`、`UPDATE`、`DELETE`。一次只许一句（better-sqlite3 的 `prepare` 本来就拒多句，测试钉住）。
  2. 再 `EXPLAIN`，按**操作码白名单**判，名单外的一律拒：建删表、`ParseSchema`、`Vacuum`、`JournalMode`、`AutoCommit`、`Savepoint`、虚表的 `V*` 都不在名单里，schema 步和 `PRAGMA` 步也就拒了。
  3. 凡带根页的步骤（`OpenRead`、`OpenWrite`、`ReopenIdx`、`Clear` 等）都对照账本里本插件的表与索引的 `rootpage`。库号不是 0 的拒（`temp` 和附加库）。读方法里出现写游标或写事务步也拒。
  4. 放行一处别人的读：`project_root` 和它的主键索引。外键检查要读它，写事务里也放行。
  5. `Program`（外键动作的子程序）放行。理由：声明规则保证引用本插件表的只有本插件的表，基线的表只引用 `project_root`，所以级联只落在本插件的表上。
  6. 白名单按 better-sqlite3 自带的 SQLite 版本定，测试钉住版本号，换版本要重审。结果按 SQL 文本缓存，`schema_version` 变了失效。
- **每种拒绝一条测试**：读方法里非读语句；写里非 DML；schema 步；`PRAGMA`；读别的插件的表；写别的插件的表；写平台的表（`project_root`、基线表）；`temp` 或附加库；读方法里的写步；多句；异步写体；事务结束后再用句柄。正向两条：写事务里外键读 `project_root`；读自己的表。
- **Coding 是第一个使用者**（§10.29 裁定 8）：`CodingSessionStore` 改用 `services.project_database`，删掉宿主给它的 `ports.store.db` 那条路（`project-plugins.ts:156`、`coding-surface.ts:119`）。

### 2.5 沙箱（L3）

沙箱插件经 broker 拿库，异步，按语句批提交：`all`、`get`，以及 `transaction(statements[])` 在宿主一侧的一个写事务里跑完。逐句检查、授权和 S-18 都走 L2 那份包装。Home 库同一片接上，这是 PG-017 的数据库一半。L3 与 L2 同批合入，免得 main 上出现一个沙箱拿不到的新服务（§10.29 裁定 2）。

### 2.6 跨主人的同一事务：L2 合同留口

插件的事务只含自己的表。1.3 那些事务在迁 Schedule、Feed、Goals 时要换写法，L2 的合同先留两个口子，具体 API 在 ③ 迁 Schedule（PG-089）时一起定：

- 插件的 `PluginDatabaseTransaction` 是平台服务加入插件写事务的唯一句柄。例如 `scheduler.register(tx, job)`：平台核对它是同一条连接上正在进行的写事务，在里面写调度器的表。storage 的日志（`events`、`idempotency_records`）也照此加入。
- 反方向（调度器领作业时同步调 `prepare`）：平台在自己的事务里，给插件登记的同步回调一份只含它自己表的事务视图。

### 2.7 Home 级插件

本计划只管项目级实例。Home 级实例按调用所在的项目拿项目库，是 PG-025（§4 k，阶段 3）的事；到时复用同一个账本和客户端包装（按安装加项目给），本计划不另做。今天 5 个 Home 级插件都不开项目库（1.11）。

### 2.8 安全不变量

- S-18 那一行扩到项目库：取消、撤权、换了提供方、别的安装、停用之后都不写。测试加进 `tests/security-invariants-plugin-original-caller.test.ts` 的写入点表，那个文件已在 `pnpm test:security` 里（L2）。
- 表的所有权（逐句检查）和发布者绑定（账本）是另一条边界：原生插件在宿主进程里本来什么都能做，但 L3 之后，对沙箱插件这就是真的边界。推荐另开一个 S 号（取 main 上下一个空号，今天是 S-41），测试进 `pnpm test:security`。只扩 S-18 也行，① 定（§4 第 5 条）。

## 3. 切片、先后与分工

都动共享核心或项目库基线，全部进集成批。

| 片 | 归属 | 做什么 | 同批要求 |
| --- | --- | --- | --- |
| L1a | ② | 合同 `databases.project` 与注释；SDK 形状检查；storage 的对象清单函数；plugin-runtime 新文件：账本建表语句、打开函数、SQL 规则、`plugin.` 错误码；夹具测试（内存库、夹具 Manifest，不碰宿主基线）；spec 文件；§1 两条用户决定行（3.3）和本计划由 ① 定的决定行；`pnpm api:update` | 无（见 §4 第 7 条） |
| L1b | ② | v8 基线（3.1）；`project_root`；Coding、Feed、Schedule 的 Manifest 写 `databases.project`，删掉 1.2 那张表里的建表执行；宿主在开项目库时对启动名单逐个调打开函数（新文件，不进 `ensureProjectPlugins`、`startPlatform`）；建项目与校验（2.3）；CHECKLIST §3（项目库 7 → 8，加 4 个插件库行）与 §4.3；spec §4.1 维护清单加「7 → 8」（`store-versions` 门禁要）；维护脚本与演练（3.2）；文档（`HOME-DATA.md` §4.2、RUNTIME-MIGRATION 第 10 节） | 与 S8 同批 |
| S8 | ③ | Goals 在 Manifest 声明自己的项目库，含 `boards` 和 governance 的 4 张；Goals 上 Runtime 之前由宿主替它调打开函数和建看板；同步 `table-owners.json` | 与 L1b 同批 |
| L2 | ② | `services.project_database`、共用客户端包装、逐句检查、S-18 扩展（和新 S 号）、Coding 改用它；Skill 与手册；`pnpm api:update` | 与 L3 同批 |
| L3 | ② | 沙箱经 broker 拿库（Home 库和项目库） | 与 L2 同批 |
| L4 | ② | PG-022 的 Home 一半：可信条目上的 `database:`（Home 级 5 条、项目级 4 条，1.7）搬进 `databases.home`，删掉条目字段和 `assertDatabaseEntries` 的可信分支，改掉 `services.database` 的注释。Home 库也要和账本一样的绑定（库名 → plugin id 与发布者），今天这件事由可信的 `home.stores` 登记兜着 | 排在 W5-02 PR-1b 的 PG-067 片之前，那片只读 Manifest |

**先后与在途**：

- L1a 排在 #786（合同注释的标记）之后，别的不等。
- L1b 和 S8 在 W5-02 PR-1a 之后：S8 要改 `plugins/native/goals/package.json`，和 PR-1a 撞。
- L2 在 #776、#797 合入之后（`plugin-database.ts` 的 `installId`），也在 Coding 的在途 PR（#759、#793）之后，或者把它们 merge 进来。
- S5 与 S8 的先后由 ③ 排；L1b 只要求 S8 和它同批。

### 3.1 v8 基线（L1b）

- 去掉插件包的 import（Coding、Feed 的出口规则、Schedule），也去掉 Goals 和 governance 的表（改由 S8 的声明建）。
- 加两张平台表：`project_root`（modules/projects，第一段）和账本（plugin-runtime）。
- 剩下的是平台事实与 Module 的表；11 张表的外键改指 `project_root`。
- 宿主基线不 import 任何插件包，由测试读源码断言（PLIB-01）；门禁脚本不改。
- `applySqliteBaseline` 照旧以具名常量作第三个参数（`verify-release-versions.mjs:291-293`）。

### 3.2 维护：v7 → v8，真实 Home 只动一次

脚本 `tests/fixtures/project-maintenance-v8.sql`，演练 `tests/project-maintenance-v8.test.ts`，照 v6 → v7 的先例（`9fba2db43`）。每个项目库一个事务：

1. 在事务之外关 `foreign_keys`，开事务。
2. 核对 `user_version` 是 7，表和索引正好是 v7 那一套；任何一项不对，整库回滚。
3. 建 `project_root`，从 `boards` 抄唯一一行（`project_id`、`created_at`）；不是正好一行就回滚。
4. 按 SQLite 官方的改表流程（建新表、抄数据、删旧表、改名、重建索引）重建 11 张表，外键改指 `project_root`；`boards` 也重建，外键指 `project_root`。
5. 建账本，写 4 行：Coding、Feed、Schedule、Goals，`version` 都是 1，记发布者签名和表名。Goals 那行用 S8 定稿的声明，所以脚本在 L1b 和 S8 都定稿后才算完。
6. `PRAGMA foreign_key_check` 必须为空，再设 `user_version = 8`，提交；最后把 `foreign_keys` 开回去。

演练照 v7 的写法，用 `describeSqliteSchema` 比：

- v8 的构建打开 v7 库会拒绝，而且库原封不动。
- 脚本跑完和新建的 v8 库逐项相同：表、列、索引、外键、CHECK、全部对象。
- 每张表的每一行都不变；根行等于原来那个看板；账本 4 行。
- 下面几种情况整库回滚，版本、表和行都不变：版本不是 7、多出或缺了表、看板不是正好一个、外键检查不空。
- 重跑一遍会因为版本已是 8 而拒绝。

真实 Home：

- 先在一次性 Home 里演练：`MOLIS_WORK_HOME` 指向临时目录，用完删掉。
- 维护前整份备份。什么时候动由用户定，到时弹窗（HANDOFF §10）。
- L1b 与 S8 合入后、维护之前，4207 的服务不重启到新的 main（用户决定 a）。这一条写进 L1b 的 PR 正文和 CHECKLIST §4。
- 可以和 Characters 安装记录的清理（RUNTIME-MIGRATION 5.4 第 6 点，也是项目库上的一次性维护）合成一次，到时由用户定。

### 3.3 写进 spec §1 的用户决定行（L1a）

| 日期 | 要定的事 | 选项 | 选了 | 说明 |
| --- | --- | --- | --- | --- |
| 2026-10-19 | 项目库基线升 v8，维护现有项目库（X-5，D15，① 转问） | 升 v8 并维护（推荐）；不升 | 升 v8 并维护 | 先在一次性 Home 演练，维护前整份备份；真实 Home 什么时候维护由用户定；合入后到维护之前，4207 的服务不重启到新的 main |
| 2026-10-19 | `boards` 什么时候拆（PG-021，D15，① 转问） | 留在宿主基线作项目根行；现在按 PG-021 拆 | 现在拆 | 项目库的身份改成项目本身（平台表 `project_root`），`boards` 改为 Goals 自己声明的表，8 个包里 11 张表的外键改指根行；数据迁移随 v8 一起跑，不留兼容读取，真实 Home 尽量只动一次 |

### 3.4 S8 要对齐的（请 ① 转 ③）

- ③ 的 `goals-migration-plan.md` D1 假定 `boards` 留在宿主基线，用户决定 b 把它推翻了：S8 要声明 `boards`，外键指 `project_root`。
- S8 与 L1b 同一批；v8 维护里 Goals 的账本行用 S8 定稿的声明。
- 表的主人门禁（1.12）：哪个包里有 `CREATE TABLE`，哪个包就是主人。所以 Goals 的 SQL 要整体在声明它的那个包里，或者加带理由的 `shared` 条目。插件不能 import Module（`plugin-upward-dependency`），不开边界例外。
- Goals 的事务顺手写 storage 的 `events`、`idempotency_records`（`table-owners.json` 的 `shared` 里，使用者是 modules/goals）。SQL 换了包，`users` 要跟着改。建看板（`board-commands.ts:18-55`）就是这样一个事务。
- governance 的 4 张表按 §4 h 归进 Goals 的声明。从没执行过的重复语句 `GOAL_EVENT_TRUSTED_DECISIONS_SQL` 可以在 S8 删掉。
- Goals 的表都不用 `AUTOINCREMENT`，2.1 的规则不挡它。

## 4. 要 ① 定的（都给了推荐）

1. **`project_root` 归谁**：`modules/projects`（推荐，它拥有项目的身份）；local-host 的项目库文件；storage（它是通用层，不该知道「项目」）。
2. **Manifest 字段的形状**：按范围的对象 `databases.project` / `databases.home`（推荐：结构上一范围一份，版本门禁不用改）；数组加 `scope`（每份要额外查重，版本门禁也认不出）。
3. **自己的表用什么权限**：`storage:private`（推荐，已有安装不用补授权）；每个插件另起一对。
4. **L2 里 Coding 改用新服务**：② 做（推荐，正好证明服务；Coding 的评审照 CODEOWNERS 请），排在 #759、#793 之后；或交给 Coding 的主人。
5. **安全不变量**：S-18 管时间与调用者，另开一个 S 号管表的所有权和发布者绑定（推荐）；只扩 S-18。
6. **L4 的 Home 库绑定**：Home 库也记发布者，换了发布者拒（推荐），细节在 L4；或沿用可信登记，等第 3 段。
7. **L1a 与 L1b 是否同批**：L1a 先合（推荐，它不改行为）；按 D15 第 7 条三片（L1a、L1b、S8）同批。
8. v8 真实 Home 维护的时间、要不要与 Characters 清理合成一次：到时弹窗问用户（HANDOFF §10），不在本计划里定。

## 5. 验收编号（入 spec 时用）

| 编号 | 内容 | 片 |
| --- | --- | --- |
| PLIB-01 | 宿主项目库基线不 import 任何插件包（测试读源码断言，不改门禁脚本） | L1b |
| PLIB-02 | 插件第一次打开时，平台建它声明的表并写账本；表、列、索引与 v7 完全相同 | L1a、L1b |
| PLIB-03 | 声明的各条规则逐条拒绝（2.1），拒绝时一张表也不建，内存库里也不执行非建表语句 | L1a |
| PLIB-04 | 账本的各种不符逐条拒绝：来历不明的表、发布者不同、形状不同；版本不同只拒这个插件的启动 | L1a |
| PLIB-05 | v7 库经维护后每一行不变，结果与新建的 v8 库逐项相同（3.2） | L1b |
| PLIB-06 | 逐句检查的每种拒绝各一条，外键读 `project_root` 放行（2.4） | L2 |
| PLIB-07 | 取消、撤权、换了提供方、别的安装、停用之后不写任何记录（S-18） | L2 |
| PLIB-08 | 同一文件只用一份 SQLite 库（测试断言客户端的连接类型） | L2 |
| PLIB-09 | 项目的身份是 `project_root`：正好一行；11 张表的外键指向它；插件声明的外键只许指向自己的表和它；`boards` 由 Goals 声明 | L1b、S8 |
| PLIB-10 | 沙箱插件经 broker 读写，检查与原生插件相同 | L3 |
| PLIB-11 | Home 库的声明只在 Manifest 的 `databases.home`，可信条目上不再有 `database:` | L4 |
