# 项目库里的插件表

状态：执行中（2026-10-21）。L1a、L1b（#867）、S8（#881）已合：Manifest 的 `databases.project`、账本和打开函数；项目库升 v8，项目的身份是 `project_root`；宿主开库时为声明了表的内置插件（Coding、Feed、Goals、Schedule）建表、记账本、再打开时核对，被拒的插件只停它自己；Goals 的 31 张表由它自己声明；有 v7 项目库的 Home 要先做维护八。L2、L3 待审（同一个 PR，进集成批）：`services.project_database` 与 Home 库共用一份客户端，每一句过了关键字再对照账本逐句检查；经 Plugin Runtime 启动的插件启动时建表或核对；沙箱插件经 broker 的 `sdk.projectDatabase` 读写，检查相同。还没有的：Coding 的代码改用这个服务（③ 的 C1）；创作台写不出 `databases.project`（创作台防腐收尾后删除，BL-377）；Home 库的声明搬进 `databases.home`（L4）已在 `claude/ac-pg022-manifest-declarations` 做好、未合入（片稿 `specs/repository-anti-corruption/slices/pg022-manifest-declarations.md`，只给宿主启动名单上的插件，发布者账本是 P1b）；Goals 上 Runtime（S9）之前，宿主仍替它调打开函数、建看板。

依据：

- `specs/repository-anti-corruption/spec.md` §1 2026-10-18「项目库里的插件表」（X-5）和 2026-10-19 的两条用户决定。
- `specs/repository-anti-corruption/privileges.md` PG-020、PG-021，以及 PG-022 的项目一半。
- 统筹 D15、D23 对计划的裁定（决策记录见第 4 节）。

## 1. 要做什么

插件自己的表（Coding 的会话、Feed 的出口规则、Schedule 的三张、Goals 的全部表）不再写进宿主的项目库基线，改由插件在 Manifest 里声明。平台第一次在某个项目里打开这个插件时建表，在项目库的一张账本里记下来：表是谁的、哪个发布者、第几版。读写走与 Home 库同一个接口的平台服务。

项目库的身份改成项目本身：平台表 `project_root`，一库一行。原来指向 `boards` 的外键改指它，`boards` 归 Goals 自己声明。

不分官方、随宿主发布、装上的还是创作台生成的插件，都走同一条路。

## 2. 设计

### 2.1 声明（L1a）

```ts
interface PluginManifest { …; databases?: PluginManifestDatabases }
interface PluginManifestDatabases { readonly project?: PluginDatabaseDeclaration; readonly home?: HomePluginDatabaseDeclaration }   // home 一半是 L4（PG-022）
```

- 按范围的对象，不用数组：每个范围结构上最多一份。每份仍是 `PluginDatabaseDeclaration`（`store_name`、`version`、`schema`、`read_permission`、`write_permission`），`scripts/verify-release-versions.mjs` 照样认得。
- SDK 的形状检查（`packages/plugin-sdk/src/database-declarations.ts`，`parsePluginManifest` 调它），任一项不合，整份 Manifest 拒绝（`plugin.manifest_invalid`）：
  - `databases` 是对象，认 `project` 和 `home`（L4，PG-022）；`home` 比 `project` 多一个可选的 `partition`，只许 `"project"`。
  - `project` 只有上面五个字段。
  - `store_name` 合 Home 库同一条名字规则（小写字母开头，只含小写字母、数字、连字符）。
  - `version` 是正整数，`schema` 不是空白。
  - 两个权限都在这份 Manifest 的 `permissions` 里。自己的表推荐两项都写 `storage:private`。

### 2.2 建表语句的规则（L1a）

`inspectPluginProjectSchema`（`packages/plugin-runtime/src/project-database.ts`）。SQLite 由宿主借来：一个空的内存库，加上 storage 的 `listSqliteObjects` 和 `describeSqliteSchema`。plugin-runtime 不依赖任何 SQLite 库。拒绝码是 `plugin.project_database.declaration_invalid`。

1. **先切句，什么都不执行。** 在引号和注释之外的每个分号处切开（和 SQLite 自己读语句一样，括号里的分号也切）。每句必须以 `CREATE TABLE` 或 `CREATE [UNIQUE] INDEX` 开头，名字不带库名，表后紧跟列定义，括号配对。所以下面这些连内存库都不会碰：`ATTACH`、`PRAGMA`、视图、触发器、虚表、`TEMP` 表、`temp.x` / `main.x`、`CREATE TABLE … AS SELECT`、增删改、`DROP`，以及没闭合的引号或注释。
2. **在空的内存库里试建。** 执行失败就拒绝，比如语法错、建在不存在的表上的索引、重复建表。
3. **看试建出了什么。**
   - 只能有表和索引。
   - 不能有 `sqlite_` 开头的名字（SQLite 为主键和唯一约束自动建的索引除外）。
   - 不能用 `AUTOINCREMENT`：它用的 `sqlite_sequence` 是全库共用的。
   - 外键只能指向本插件自己的表，或 `project_root(project_id)`。只写 `REFERENCES project_root`、默认指它的主键的，也算。

### 2.3 账本与打开函数（L1a）

账本 `plugin_project_databases`，建表语句是 `PLUGIN_PROJECT_DATABASES_SCHEMA_SQL`，L1b 放进 v8 基线。每个插件一行，列如下：

- `plugin_id`：主键。
- `publisher_signature`。
- `store_name`：唯一。
- `version`。
- `tables_json`：声明建出的表和索引的名字，不含 SQLite 自动建的索引。
- `created_at`。

`openPluginProjectDatabase(connection, { plugin_id, publisher_signature, declaration }, inspector, { path })` 先按 2.2 检查，再在一个 `BEGIN IMMEDIATE` 写事务里做下面的事。任何拒绝都回滚，库原样不动：

| 情况 | 结果 |
| --- | --- |
| 没有账本行，声明的名字在库里一个都没有，库名也没归别的插件 | 执行建表语句，核对建出来的正是试建的那些，写账本行，`created: true` |
| 没有账本行，库里已有同名的表或索引（名字比较时 ASCII 不分大小写），或库名已归别的插件 | `plugin.project_database.object_taken` |
| 账本行的发布者签名与这次不同 | `plugin.project_database.publisher_mismatch`。卸载不删表也不删行，同一个 id 换了发布者拿不走数据 |
| 版本不同 | `plugin.project_database.version_mismatch`。报错写库路径、插件、库名和两个版本（`details` 里也有）。只拒这个插件，项目和别的插件照常 |
| 版本相同，但库名、对象名单或表的形状与声明不同（比如库被手改过） | `plugin.project_database.shape_mismatch` |
| 版本相同，形状一致 | 打开，`created: false` |

版本仍是「记在库里、平台核对、不符就拒、靠一次性维护」（`docs/releases/POLICY.md` 第 5 节），不写就地升级。

### 2.4 项目根行与 `boards`（L1b、S8）

- 平台表 `project_root(project_id TEXT PRIMARY KEY, created_at TEXT NOT NULL)`，一库正好一行，归 `modules/projects`。
- 8 个包里 11 张原来指向 `boards(project_id)` 的表，外键改指它，`ON DELETE CASCADE` 不变。
- `boards` 是 Goals 声明的表（S8 已做）。`boards.title` 是建项目时从显示名抄来的副本，声明里去掉了：项目的名字只在项目目录的 `display_name`，Goals 的看板、快照、合同、指引都不再带它。`boards.project_id` 是主键，外键指 `project_root(project_id)`，`ON DELETE CASCADE`；Goals 的其余 30 张表仍指 `boards(project_id)`，不动。声明的版本仍是 1。
- 建项目改成：开库套 v8 → 对启动名单上声明了 `databases.project` 的插件逐个调打开函数 → 在一个事务里写根行、Goals 建自己的看板 → checkpoint。L1b 的启动名单是工作台目录里项目级、声明了 `databases.project` 的内置插件（`apps/local-host/src/project-plugin-databases.ts` 的 `projectDatabasePlugins`），不另写名单。
- Goals 上 Runtime 之前，由宿主替它调打开函数、建看板，这是过渡特权，在 privileges.md 登记一行（PG-020、PG-021），到 S9 删掉。
- Goals 被拒（发布者、版本或形状与它的账本行不符）只停 Goals：宿主在装配每个提供方的那一处按开库结果去掉被拒的插件（`apps/local-host/src/project-host.ts`、`project-plugins.ts` 用的 `withoutRefusedPlugins`），所以 Goals 的动作不进项目的目录，调用得 `actions.missing`；平台记下的拒绝码在 `LocalProjectDatabase.pluginDatabases` 里。库本身照常打开，别的插件照常。库不修补、不重建、不补账本。宿主里直接读 Goals 的表的页面和 Module 路径不是动作，到 S9 前仍读那些表。
- 基线升 v8，现有项目库做一次维护：先在一次性 Home 演练，维护前整份备份。真实 Home 什么时候做，到时弹窗问用户。

### 2.5 插件怎样读写（L2）

- 合同 `PluginHostServices.project_database?: PluginDatabase`，与 Home 库同一个接口。
- 一份客户端包装，Home 库和项目库共用：
  - 读只经只读连接；写只经 `transaction(beforeEffect, write)`；
  - 异步写体拒绝并回滚；
  - 每次调用核授权，停用后句柄失效，写前核原调用者仍有效。
  - 沙箱插件用的是它的异步孪生 `PluginProjectStatements`（`services.project_statements`）：同样的规则，一步一步问，语句在子进程里。
- 逐句检查：在关键字过滤之外，加 `EXPLAIN` 操作码白名单，带根页的步骤对照账本里本插件的表。
- Coding 是第一个使用者：服务在 L2 里给到它，代码改用它、删掉宿主给 Coding 的那条路是 ③ 的 C1（决策记录 2026-10-21）。

### 2.6 沙箱（L3）、Home 库（L4）

- **L3**：沙箱插件经 broker 拿库，逐句检查和授权与 L2 那份包装相同。与 L2 同批合入。2026-10-23 起（BL-395，S-59）：沙箱插件的语句不在宿主的线程上跑，宿主给声明 `execution: "sandbox"` 的插件 `services.project_statements`（不给 `project_database`），语句跑在宿主能杀的子进程里；授权与原调用者的复查在宿主，一步一步地问。
- **L4**：可信条目上的 `database:` 搬进 `databases.home`，Home 库也记发布者，换了发布者就拒；沙箱插件的 Home 库也在这时经 broker 开（决策记录 2026-10-21）。

### 2.7 安全不变量

- S-18 扩到项目库：取消、撤权、换了提供方、别的安装、停用之后都不写（L2）。
- 表的所有权和发布者绑定另开一个 S 号，拒绝测试进 `pnpm test:security`（D23 第 5 条）。L1b 宿主开始调打开函数时登记（L1b 的 PR 里接在它所在 main 的末号之后；与在途 PR 撞号时，后合的顺延，⑤ 合并时再核），逐句检查那一半在 L2 补进同一行。L1a 不登记，因为宿主还不调用，没有在生效的边界。拒绝测试：`tests/plugin-project-database-ledger.test.ts`（平台的拒绝）与 `tests/project-plugin-database-refusal.test.ts`（宿主开库时只停被拒的插件），都进 `pnpm test:security`。

## 3. 切片

都动共享核心或项目库基线，全部进集成批。

| 片 | 归属 | 做什么 | 同批要求 |
| --- | --- | --- | --- |
| L1a | ② | 合同 `databases.project`；SDK 形状检查；storage `listSqliteObjects`；plugin-runtime 账本、规则、打开函数、`plugin.project_database.*` 错误码；夹具测试；本 spec；`pnpm api:update` | 无，可以先合（D23 第 7 条） |
| L1b | ② | v8 基线、`project_root`、Coding / Feed / Schedule 写 `databases.project`、宿主开库时调打开函数、建项目与校验、CHECKLIST 与维护清单、维护脚本与演练、文档与 Skill | 与 ③ 的 S8 同批 |
| S8 | ③ | Goals 声明自己的项目库（含 `boards` 和 governance 的 4 张），过渡期由宿主替它调打开函数；基线去掉 Goals 的表；`board.title` 删掉，输出变了的动作升版本；维护八加 `boards` 改建与 Goals 账本行两步 | 与 L1b 同批（已叠在 L1b 上） |
| L2 | ② | `services.project_database`、共用客户端包装、逐句检查、S-18 扩展（Coding 改用它是 ③ 的 C1） | 与 L3 同批 |
| L3 | ② | 沙箱经 broker 拿库 | 与 L2 同批 |
| L4 | ② | `databases.home`，删掉可信条目上的 `database:` | 排在 W5-02 PR-1b 的 PG-067 片之前 |

## 4. 决策记录

| 日期 | 事 | 定了什么 | 谁定 |
| --- | --- | --- | --- |
| 2026-10-18 | 项目库里的插件表 | 做项目库服务，插件声明、平台建表与核对版本，宿主基线不再点名插件 | 用户（弹窗，§1 X-5） |
| 2026-10-19 | 基线升 v8 并维护现有项目库 | 升并维护。先演练、整份备份，真实 Home 的时间由用户定；L1b、S8 合入后到维护之前，4207 的服务不重启到新的 main | 用户（D15 转问） |
| 2026-10-19 | `boards` 什么时候拆 | 现在拆：身份改成 `project_root`，`boards` 归 Goals 声明，11 张表的外键改指根行，数据迁移随 v8 一起跑，不留兼容读取 | 用户（D15 转问） |
| 2026-10-19 | `project_root` 归谁 | `modules/projects`，它已经拥有项目的身份 | 统筹 D23 第 1 条 |
| 2026-10-19 | Manifest 字段的形状 | 按范围的对象 `databases.project` / `databases.home` | 统筹 D23 第 2 条 |
| 2026-10-19 | 自己的表用什么权限 | `storage:private`，已有安装不用补授权 | 统筹 D23 第 3 条 |
| 2026-10-19 | Coding 改用新服务 | L2 里由 ② 做，请 Coding 的 CODEOWNERS 评审 | 统筹 D23 第 4 条 |
| 2026-10-19 | 安全不变量 | 表的所有权与发布者绑定另开 S 号，S-18 扩到项目库 | 统筹 D23 第 5 条 |
| 2026-10-19 | Home 库的绑定 | L4 里也记发布者，换了就拒 | 统筹 D23 第 6 条 |
| 2026-10-19 | L1a 是否先合 | 可以先合；L1b 之前文档和 Skill 不介绍字段，状态句写明宿主还不建表 | 统筹 D23 第 7 条 |
| 2026-10-19 | v8 在真实 Home 上何时维护、是否与 Characters 清理合并 | 到时弹窗问用户 | 统筹 D23 第 8 条 |
| 2026-10-20 | 切句的位置（日常取舍） | 在引号和注释之外的**每个**分号处切，括号里的也切，与 SQLite 读语句的方式一致；计划原写「括号之外」，现在的写法更严，不会让一句里藏着的第二句漏过开头检查 | ② |
| 2026-10-20 | `IF NOT EXISTS`（日常取舍） | 允许写（Coding、Schedule 现在的语句都带），但第一次建表前库里有同名对象就拒，所以它不会悄悄沿用别人的表 | ② |
| 2026-10-20 | 声明里的未知字段（日常取舍） | 拒绝，免得作者以为写了 `tables` 之类的字段平台会照做 | ② |
| 2026-10-20 | 错误码前缀（日常取舍） | `plugin.project_database.*`，不新写 Error 子类；plugin-runtime 的主人是 `plugin` | ② |
| 2026-10-20 | 根行几时写、几行（L1b 日常取舍） | 一库正好一行。建项目时与 Goals 的看板在同一个写事务里写（`GoalProjectApplication.initializeBoard` 先写根行），已有根行的项目保留它；项目目录读库时核对根行正好一行、与看板同 id，否则按库无效拒绝 | ② |
| 2026-10-20 | 宿主替哪些插件开库（L1b 日常取舍） | 从工作台的内置插件目录里取项目级、声明了 `databases.project` 的条目，不另写名单；Home 级插件不在项目库建表。装进项目的插件到 L2 随服务一起开 | ② |
| 2026-10-20 | 恢复路径开不开插件的表（L1b 日常取舍） | 不开。`existingOnly` 只读已经在这一版的库，恢复不该给库建表或写账本 | ② |
| 2026-10-20 | 宿主装配的插件被拒时停什么（L1b 日常取舍） | 只停它自己的部分：它的动作提供方不登记，用它的表的 system 提供方（Schedule 的提醒、定时操作）也不登记；Coding 不进 Runtime 启动，页面说明原因；Schedule 被拒时项目的 Scheduler 一个任务也不认领（这里登记的叫醒都是 Schedule 的，认领会先把任务往后推或关掉），到点的任务原样等库修好，叫醒在碰表之前仍抛出这条拒绝作兜底（⑤ 评审改）；Feed 没有出口规则，Feed 里属于 Modules 的部分照常。库不修补、不重建 | ② |
| 2026-10-20 | Feed 的权限（L1b 日常取舍） | Feed 原来没有 `storage:private`，补上并标必需（2.1 要求两个读写权限都在 Manifest 里），与 Coding、Schedule 一样 | ② |
| 2026-10-20 | 账本行与 S8 的分工（L1b 日常取舍） | L1b 的维护写 Coding、Feed、Schedule 三行；Goals 一行和 `boards` 的改建随 S8 加进同一份维护脚本，与 ③ 对齐 | ② |
| 2026-10-20 | CHECKLIST 里插件库的位置怎么写（L1b 日常取舍） | `projects/<project_id>/molis-work.db#<store_name>`，每个插件一行，版本门禁按位置区分各行；项目库这次的维护并进维护八，不另起名字 | ② |
| 2026-10-20 | `boards` 的声明（S8） | 去掉 `title`；`project_id` 外键指 `project_root`，`ON DELETE CASCADE`；声明版本仍 1；`tooling/gates/table-owners.json` 照 Coding、Feed、Schedule 的做法 | ③ 裁定 |
| 2026-10-20 | Goals 被拒时停什么（S8） | 只停 Goals：在提供方的装配边界去掉被拒的插件，一条路径；库和别的插件照常；测试断言动作被拒且平台记下的拒绝码保留 | ③ 裁定 |
| 2026-10-20 | `board.title` 删掉后的动作版本（S8） | `goals.board.initialize` 由 v1 升 v2（输入没有 `title`）；输出哈希变了的动作各升一版，直接替换，不留兼容期；管理类 MCP 工具 `molis_work_v1_initialize` 名字不变，去掉 `title`；CLI `v1 init` 去掉标题参数 | ③ 裁定 |
| 2026-10-20 | 指引里的「Project：…」行（S8） | 删掉，不为它在宿主加一层；工作台初始化脚本也不再回退读 `board.title` | ③ 裁定 |
| 2026-10-20 | S8 并进维护八的两步 | `boards` 改建（去 `title`、外键指 `project_root`、行与 rowid 不变）和 Goals 的账本行，加进 `tests/fixtures/project-maintenance-v8.sql` 同一个事务，放在「正好一个看板」那句检查和它的临时表删掉之后；开头仍先核对 v7 的 73 张表；演练要证明维护后的库与新建的 v8 库（四个插件的声明都已打开）逐表相同，再打开不往账本添一行 | ③ 裁定，② 补充 |
| 2026-10-20 | 建看板的请求哈希改成空请求，维护八换掉旧回执的哈希 | S8 的建看板请求不再带看板名，版本 7 的回执哈希里有它：不换的话，维护前用过的键重试会被当成键被别的请求用过（`goals.request.idempotency_key_reused`）。请求哈希按空请求算（回执的主键里已经有项目，请求里没有别的），是一个常量，维护八在重建 `idempotency_records` 之后把 `initialize_board` 的回执换成它；SQLite 里没有 sha256，按 `{project_id}` 算 SQL 写不出来。读取时不兜底旧哈希 | ⑤ 评审修，③ 认 |
| 2026-10-21 | 沙箱插件的 Home 库（L3 日常取舍） | L3 只接项目库。沙箱定义拿 Home 库今天由 `assertDatabaseEntries` 拒绝（只有可信条目带 `database:`），等 L4 把声明搬进 `databases.home` 时一起开；broker 的服务写成通用的 `SandboxDatabaseService`，L4 接 Home 库时照用。计划原把两者都放在 L3 | ② |
| 2026-10-21 | 创作台写不写 `databases.project`（L3 日常取舍） | 不在 L3 里写。`generatedPluginManifest` 不带它，设计答卷也没有声明表的地方；改答卷、Manifest 生成和创作台挂载的 Skill 章节要跑回放语料，记成一条 BACKLOG（10-21 作废删行：创作台不迁，防腐收尾后删除，见 BL-377）。L3 的用例按宿主装进项目的样子在定义上加声明 | ② |
| 2026-10-21 | 通道上的值（L3 日常取舍） | 参数只许 null、有限数、字符串；返回的 BLOB、无穷与超出 2^53 的整数以 `sandbox.database_error` 拒绝，不悄悄改值。沙箱的 JSON 通道带不了字节 | ② |
| 2026-10-21 | 拒绝码过不过通道（L3 日常取舍） | 宿主的 `ActionError` 带着码过通道（如 `plugin.project_database.statement_refused`），插件能按码处理；别的错误一律 `sandbox.database_error`，说明截到 2048 字 | ② |
| 2026-10-21 | 逐句检查放在哪（L2 日常取舍） | 关键字过滤之后才 `EXPLAIN`：SQLite 准备语句时就执行设标志的 `PRAGMA` 与 `REINDEX`，准备之前必须先挡住。`EXPLAIN` 带着真实参数；判过的语句按文本缓存，`schema_version` 一变全部重判 | ② |
| 2026-10-21 | 步骤名单和 SQLite 版本（L2 日常取舍） | 名单按 SQLite 3.51.3 写成，宿主的 SQLite 不是这一版就全拒，直到有人照新版本重新核对名单：宁可停，也不放过没核过的步骤 | ② |
| 2026-10-21 | JSON 函数（L2 日常取舍） | 虚表只放行 `json_each`、`json_tree`，按每个连接上的实例认，不按名字；写成表的 `pragma_*`、`dbstat` 等一律拒 | ② |
| 2026-10-21 | 没有文件的项目库（L2 日常取舍） | 插件平台的库不是宿主自己连到文件的 better-sqlite3 连接（内存库、别的驱动）时，声明了 `databases.project` 的插件不启动，不退回到别的路 | ② |
| 2026-10-21 | Coding 什么时候改用新服务 | 服务在 L2 里给到 Coding（它已声明表，启动时拿到）；Coding 的代码改用它、删掉宿主给 Coding 的那条路是 ③ 的 C1，排在 L2 之后，按统筹 10-20 的派单。改了 2026-10-19「L2 里由 ② 做」那一行 | 统筹派单 |
| 2026-10-21 | Home 级插件拿不拿项目库（L2） | 不拿：`HomePluginExecutor` 不给 `project_database`；Home 级插件按项目的数据放在 S0a 分区后的 Home 库里 | ② |
| 2026-10-21 | 沙箱插件的语句跑多久（L3 评审） | 逐句检查只管碰得到哪些表；沙箱插件的语句原先在宿主主线程上同步跑，没有时间与结果大小的上限。L3 记成已知缺口与 BL-395，修法动信任边界，要问用户。**2026-10-23 用户在统筹会话弹窗定：做完子进程执行**（没选“先限量并关住入口”）：沙箱插件的语句跑在宿主能 SIGKILL 的子进程里，超时、超内存就杀、答带码的错误，结果在读的时候按行数与字节停，递归查询不开始；见 `specs/repository-anti-corruption/slices/sandbox-project-database-limits.md`，S-59 | ⑤ 评审、用户 |

## 5. 验收标准

| 编号 | 内容 | 片 | 测试 |
| --- | --- | --- | --- |
| PLIB-01 | 宿主项目库基线不 import 任何插件包（测试读源码断言，不改门禁脚本） | L1b | `tests/project-database-baseline.test.ts` |
| PLIB-02 | 插件第一次打开时，平台在一个事务里建它声明的表并写账本，再打开时认出同一份；L1b 起，表、列、索引与 v7 完全相同 | L1a、L1b | L1a：`tests/plugin-project-database-ledger.test.ts`；L1b：`tests/project-database-baseline.test.ts` |
| PLIB-03 | 声明的各条规则逐条拒绝（2.1、2.2），拒绝时一张表也不建，开头检查不过的连内存库里也不执行 | L1a | `tests/plugin-project-database-ledger.test.ts` |
| PLIB-04 | 账本的各种不符逐条拒绝：同名对象已在、库名已归别人、发布者不同、库名或形状不同；版本不同只拒这个插件。宿主开库时被拒的插件只停它自己：动作不进项目的目录，页面说明原因，库不修补、不重建，别的插件照常 | L1a、L1b | L1a：`tests/plugin-project-database-ledger.test.ts`；L1b：`tests/project-plugin-database-refusal.test.ts` |
| PLIB-05 | v7 库经维护后每一行不变（`boards` 只少了 `title` 的值，行与 rowid 不变；建看板的幂等回执换成现行的请求哈希，维护前用过的键重试照常重放），结果与新建的 v8 库（四个插件的声明都已打开）逐表相同，账本有四行，再打开不往账本添一行 | L1b、S8 | `tests/project-maintenance-v8.test.ts` |
| PLIB-06 | 逐句检查的每种拒绝各一条，外键读 `project_root` 放行 | L2 | `tests/security-invariants-plugin-project-database.test.ts` |
| PLIB-07 | 取消、撤权、换了提供方、别的安装、停用之后不写任何记录（S-18） | L2 | `tests/security-invariants-plugin-original-caller.test.ts`（目标 `project_database`）；沙箱一侧 `tests/installed-plugin-execution.test.ts`（PLIB-10） |
| PLIB-08 | 同一个进程里同一文件只用一份 SQLite 库（测试断言客户端的连接类型）；2026-10-23 用户定：沙箱插件的语句在另一个进程里，那个进程用自己的一份 better-sqlite3 开同一个文件（口径、锁与一致性、崩溃见 `specs/repository-anti-corruption/slices/sandbox-project-database-limits.md` 第 2.3 节），那个进程里同样只有一份库 | L2、BL-395 | `tests/security-invariants-plugin-project-database.test.ts`；`tests/security-invariants-sandbox-project-database-limits.test.ts`（S-59） |
| PLIB-09 | 项目的身份是 `project_root`：正好一行；11 张表的外键指向它；`boards` 由 Goals 声明，它的外键也指向 `project_root`，Goals 的其余表仍指向 `boards` | L1b、S8 | `tests/project-database-baseline.test.ts` |
| PLIB-10 | 沙箱插件经 broker 读写，检查与原生插件相同 | L3 | `tests/security-invariants-plugin-project-database.test.ts`；`tests/installed-plugin-execution.test.ts`（装进项目的沙箱插件，取消与撤权） |
| PLIB-11 | Home 库的声明只在 Manifest 的 `databases.home`，可信条目上不再有 `database:` | L4 | `tests/home-library-declaration.test.ts` |
| PLIB-12 | Goals 在 Manifest 里声明项目库：声明过 SDK 的形状检查和 SQL 规则；在空库里建出 Goals 与治理的全部表（31 张表、30 个索引）并写账本一行；再打开原样不变 | S8 | `tests/goals-project-database.test.ts` |
| PLIB-13 | 宿主基线不再带 Goals 与治理的表；声明的表与 v7 基线里 Goals 的那些相同，只有 `boards` 不同：没有 `title`，`project_id` 的外键指 `project_root`；存量的 v7 库、`goal-event-history` 的夹具都按这个形状 | S8 | `tests/goals-project-database.test.ts`、`tests/project-database-baseline.test.ts`、`tests/project-maintenance-v8.test.ts` |
| PLIB-14 | Goals 的发布者、版本或形状与账本不符时只停 Goals：动作不在项目的目录里，调用被拒，平台记下的拒绝码保留，库照常打开、别的插件照常、库里什么都不修补、不重建、不补账本 | S8 | `tests/goals-project-database-refusal.test.ts` |
| PLIB-15 | 看板没有名字：初始化动作 `goals.board.initialize` 是 v2、输入只有 `idempotency_key`；快照、约定、集合的输出里没有 `board.title`，这三个动作各升 v2；指引的提示词前缀没有 “Project:” 行；管理 MCP 工具与 CLI `v1 init` 不收标题 | S8 | `tests/goals-board-actions.test.ts`、`tests/goals-guidance-actions.test.ts`、`tests/resident-management-actions.test.ts`、`tests/cli-goals-actions.test.ts`；动作合同快照 `tests/action-contract-snapshot.test.ts` 钉住版本与形状 |

## 6. 证据

**L1a（2026-10-20，分支 `feat/project-library-l1a`）**

- 测试：`tests/plugin-project-database-ledger.test.ts` 6 条全过。它不碰宿主基线：内存库里只有账本、一张代替根行的表，和一张别人的表。
- 同时跑的 `tests/plugin-manifest-v2.test.ts`、`tests/verify-release-versions.test.ts` 也通过。
- 共享核心的全量交集成批。

**L1b（2026-10-20，分支 `feat/project-library-l1b`，叠在 L1a 上）**

- 新写和重写的用例全过：`tests/project-database-baseline.test.ts` 6 条，`tests/project-plugin-database-refusal.test.ts` 5 条，`tests/project-maintenance-v8.test.ts` 6 条。维护八只在一次性 Home 上演练。
- 相关用例 42 个文件全过。范围是：外键改到 `project_root` 的用例、三个插件和宿主装配、账本、Store 版本、发布核对。其中 Schedule 的两个恢复用例会开浏览器。
- API 快照和动作合同快照都与源码一致，不用刷新。
- 共享核心的全量和 ③ 的 S8 同一批跑。

**S8（2026-10-20，分支 `feat/goals-s8-project-database`，叠在 L1b 上，已合并 `origin/feat/project-library-l1b` 的 0b60c3a6a）**

- 新写和改写的用例全过：`tests/goals-project-database.test.ts` 4 条（PLIB-12 三条、PLIB-13 一条），`tests/goals-project-database-refusal.test.ts` 5 条（PLIB-14：一条正向，发布者、版本、两种形状不符各一条拒绝），`tests/project-maintenance-v8.test.ts` 6 条（四个插件的账本行、`boards` 改建、与新建的 v8 库逐表相同、再打开不加账本），`tests/project-database-baseline.test.ts` 6 条，`tests/goals-board-actions.test.ts` 2 条、`tests/goals-guidance-actions.test.ts`、`tests/cli-goals-actions.test.ts`、`tests/security-invariants-management.test.ts`（PLIB-15）。
- 相关用例 175 个文件按 `node scripts/affected-tests.mjs` 选出（浏览器用例按规则不跑）；合并 L1b 之后，S8 自己的 37 个文件在合并后的树上重跑全过。一批并发跑里有几个文件因机器负载超时，单独重跑通过；两个超时的（`tests/images-mcp.test.ts`、`tests/resident-management-actions.test.ts`）单独跑仍超时，探针量到子进程冷启动要 10 到 21 秒，把超时放宽后的临时副本全过，临时副本已删。
- `tests/npm-package.test.ts` 在这台机器上因为没有 `npm` 而 `spawn npm ENOENT`，与本次改动无关。
- 动作合同快照刷新：`goals.board.initialize`、`goals.snapshot.read`、`goals.contract.read`、`goals.collection.read` 各由 v1 升 v2；`feed.goals.context@1` 的依赖声明一格（固定到 `goals.contract.read` v2）变了，它的输入输出不变，仓库里没有固定它的引用。公开 API 快照刷新了 `contracts/modules/goals` 与 `contracts/modules/goal-actions` 两份。
- 门禁：`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、`pnpm secrets:check`、`node scripts/verify-release-versions.mjs` 通过；`node scripts/check-spec-coverage.mjs` 只报 PLIB-06、07、08、10、11（L2 到 L4 的行）还没有证明。

**L2 + L3（2026-10-21，分支 `feat/project-library-l2`，从 main 开，合并了 main 的 `37aa59b20`：#883、#892、#881）**

- 新写和改写的用例全过：
  - `tests/security-invariants-plugin-project-database.test.ts` 16 条：PLIB-06 十四条，PLIB-08 一条，PLIB-10 S-46 一条（要 macOS 的沙箱）。
  - `tests/security-invariants-plugin-original-caller.test.ts` 17 条：PLIB-07，目标加 `project_database`。
  - `tests/installed-plugin-execution.test.ts` 7 条：PLIB-10 S-18，取消、撤权各一条。
- 合并 main 时，分区库的 `refuse` 接进了共用客户端，S-18、S-46 两行保留 main 的文字再加本片的。合并后整体 `pnpm build` 通过。
- 相关用例 180 个文件，用 `node scripts/run-tests.mjs --jobs 2` 跑，浏览器用例按规则不跑。范围：
  - 用到 `project_database`、沙箱、`createPluginPlatform` 的用例；
  - 分区库与删除、Home 级插件；
  - 创作台装的插件；
  - Coding 的非 e2e 用例。
  - 结果：180 个文件全过，1231 条里 1225 条通过，6 条按环境跳过：真实模型的 P3c 评测 4 条，真实 npm 与网络各 1 条。
- 公开 API 快照刷新了 `contracts/platform/plugin` 与 `contracts/platform/plugin-sandbox` 两份。动作合同快照不变。
- 门禁：`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、`pnpm secrets:check` 通过。`node scripts/check-spec-coverage.mjs` 只报 PLIB-11（L4）还没有证明。
- `node scripts/affected-tests.mjs` 建议全量：动了共享核心，交集成批跑。
