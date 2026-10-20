# 项目库里的插件表

状态：执行中（2026-10-20）。L1a 已做：声明已有，宿主还不按它建表。Manifest 可以写 `databases.project`，SDK 检查它的形状，plugin-runtime 有账本和打开函数，但宿主还没有在任何地方调用它们。L1b 合入之前，Skill、手册和 `docs/` 都不介绍这个字段（统筹 D23 第 7 条），插件作者不要依赖它。

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
interface PluginManifestDatabases { readonly project?: PluginDatabaseDeclaration }   // home 一半在 L4 加
```

- 按范围的对象，不用数组：每个范围结构上最多一份。每份仍是 `PluginDatabaseDeclaration`（`store_name`、`version`、`schema`、`read_permission`、`write_permission`），`scripts/verify-release-versions.mjs` 照样认得。
- SDK 的形状检查（`packages/plugin-sdk/src/database-declarations.ts`，`parsePluginManifest` 调它），任一项不合，整份 Manifest 拒绝（`plugin.manifest_invalid`）：
  - `databases` 是对象，现在只认 `project`；`home` 到 L4 才认。
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
- `boards` 改为 Goals 声明的表（S8）。`boards.title` 是建项目时从显示名抄来的副本，S8 的声明里去掉，读者改读项目目录的 `display_name`。
- 建项目改成：开库套 v8 → 写根行 → 对启动名单上声明了 `databases.project` 的插件逐个调打开函数 → Goals 建自己的看板 → checkpoint。
- Goals 上 Runtime 之前，由宿主替它调打开函数、建看板，这是过渡特权，在 privileges.md 登记一行，到 S9 删掉。
- 基线升 v8，现有项目库做一次维护：先在一次性 Home 演练，维护前整份备份。真实 Home 什么时候做，到时弹窗问用户。

### 2.5 插件怎样读写（L2）

- 合同 `PluginHostServices.project_database?: PluginDatabase`，与 Home 库同一个接口。
- 一份客户端包装，Home 库和项目库共用：
  - 读只经只读连接；写只经 `transaction(beforeEffect, write)`；
  - 异步写体拒绝并回滚；
  - 每次调用核授权，停用后句柄失效，写前核原调用者仍有效。
- 逐句检查：在关键字过滤之外，加 `EXPLAIN` 操作码白名单，带根页的步骤对照账本里本插件的表。
- Coding 是第一个使用者，改用它之后删掉宿主给 Coding 的那条路。

### 2.6 沙箱（L3）、Home 库（L4）

- **L3**：沙箱插件经 broker 拿库，逐句检查和授权走 L2 那份包装。与 L2 同批合入。
- **L4**：可信条目上的 `database:` 搬进 `databases.home`，Home 库也记发布者，换了发布者就拒。

### 2.7 安全不变量

- S-18 扩到项目库：取消、撤权、换了提供方、别的安装、停用之后都不写（L2）。
- 表的所有权和发布者绑定另开一个 S 号，拒绝测试进 `pnpm test:security`（D23 第 5 条）。L1b 宿主开始调打开函数时登记，号取那时 main 上的下一个空号，逐句检查那一半在 L2 补进同一行。L1a 不登记，因为宿主还不调用，没有在生效的边界。

## 3. 切片

都动共享核心或项目库基线，全部进集成批。

| 片 | 归属 | 做什么 | 同批要求 |
| --- | --- | --- | --- |
| L1a | ② | 合同 `databases.project`；SDK 形状检查；storage `listSqliteObjects`；plugin-runtime 账本、规则、打开函数、`plugin.project_database.*` 错误码；夹具测试；本 spec；`pnpm api:update` | 无，可以先合（D23 第 7 条） |
| L1b | ② | v8 基线、`project_root`、Coding / Feed / Schedule 写 `databases.project`、宿主开库时调打开函数、建项目与校验、CHECKLIST 与维护清单、维护脚本与演练、文档与 Skill | 与 ③ 的 S8 同批 |
| S8 | ③ | Goals 声明自己的项目库（含 `boards` 和 governance 的 4 张），过渡期由宿主替它调打开函数 | 与 L1b 同批 |
| L2 | ② | `services.project_database`、共用客户端包装、逐句检查、S-18 扩展、Coding 改用它 | 与 L3 同批 |
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

## 5. 验收标准

| 编号 | 内容 | 片 | 测试 |
| --- | --- | --- | --- |
| PLIB-01 | 宿主项目库基线不 import 任何插件包（测试读源码断言，不改门禁脚本） | L1b | |
| PLIB-02 | 插件第一次打开时，平台在一个事务里建它声明的表并写账本，再打开时认出同一份；L1b 起，表、列、索引与 v7 完全相同 | L1a、L1b | L1a：`tests/plugin-project-database-ledger.test.ts` |
| PLIB-03 | 声明的各条规则逐条拒绝（2.1、2.2），拒绝时一张表也不建，开头检查不过的连内存库里也不执行 | L1a | `tests/plugin-project-database-ledger.test.ts` |
| PLIB-04 | 账本的各种不符逐条拒绝：同名对象已在、库名已归别人、发布者不同、库名或形状不同；版本不同只拒这个插件 | L1a | `tests/plugin-project-database-ledger.test.ts` |
| PLIB-05 | v7 库经维护后每一行不变，结果与新建的 v8 库逐项相同 | L1b | |
| PLIB-06 | 逐句检查的每种拒绝各一条，外键读 `project_root` 放行 | L2 | |
| PLIB-07 | 取消、撤权、换了提供方、别的安装、停用之后不写任何记录（S-18） | L2 | |
| PLIB-08 | 同一文件只用一份 SQLite 库（测试断言客户端的连接类型） | L2 | |
| PLIB-09 | 项目的身份是 `project_root`：正好一行；11 张表的外键指向它；`boards` 由 Goals 声明 | L1b、S8 | |
| PLIB-10 | 沙箱插件经 broker 读写，检查与原生插件相同 | L3 | |
| PLIB-11 | Home 库的声明只在 Manifest 的 `databases.home`，可信条目上不再有 `database:` | L4 | |

## 6. 证据

**L1a（2026-10-20，分支 `feat/project-library-l1a`）**

- 测试：`tests/plugin-project-database-ledger.test.ts` 6 条全过。它不碰宿主基线：内存库里只有账本、一张代替根行的表，和一张别人的表。
- 同时跑的 `tests/plugin-manifest-v2.test.ts`、`tests/verify-release-versions.test.ts` 也通过。
- 共享核心的全量交集成批。
