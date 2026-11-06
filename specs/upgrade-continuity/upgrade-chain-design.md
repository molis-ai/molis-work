# U1 升级链：设计

状态：设计稿（2026-11-06，路线书第 05 批第 1 项）；尚未实现，机制代码等第 02 批的 #1790 合入后再动。用户 2026-11-06 定：升级链写进「当前保留机制」（§12）、四份门禁按 §11 改；真实 Home 重建不等 05② C-1，第一批真实升级段见 §14。行为与验收以[升级后持续可用](spec.md) §4、§9 和 §10 决策记录为准，本文只写怎么做。依据是 main `242d75d03` 和 #1790 头 `3585974c5`、#1837 头 `6feebb2ae`（只读），另有几条本机实测，都在正文里写明。

验收编号沿用 `UPG-01`～`UPG-21`；本文新增的检查用 `UPG1-` 前缀，在 §13 列出。

## 0. 给人讲清楚

现在程序一改库的结构，旧 Home 就打不开，只能重建。做完这件事以后，新程序启动时先看一眼每个库的版本：旧的就一步步升上来，升之前留一份原样的备份，升完检查，查出问题就放回备份；只有这一个库暂时不能用，别的照常。比程序还新的库，不读也不写。平时启动几乎没有额外开销，因为只有换了版本才扫一遍。

这一步在界面上只多一行进度（显示归 U3）。U1 合入时不改任何真实库的版本，所以用户感觉不到；它是后面第一次改库结构的前提。用户 2026-11-06 同意了两件事：这算新增迁移逻辑，写进「当前保留机制」（§12）；四份门禁在第一段真实升级之前改（§11）。

## 1. 现状里决定设计的几条

核账第二节已列的不重复，这里只写它没提、或者要改口的。

| 事实 | 依据 | 对设计的影响 |
| --- | --- | --- |
| `schemaPatches` 门禁数 `ALTER TABLE`，基线是 0，只许减少 | `scripts/check-health-gates.mjs:426-434`，核账没提 | 第一段真实升级写 `ALTER TABLE` 就红。要改的门禁是四份，不是三份（§11.4） |
| 没有统一的开库序列，首次打开点散在各处 | 核账第二节；`always-on-plugins.ts:34`、N45 进项目首页开连接库 233 次 | 升级不能挂在打开路径上（§3） |
| Home 的存储主人锁有 6 个取锁点，另有 4 处不取锁读目录库；`ensureHomeStorageOwner` 只是其中一个，不是汇合处 | 取锁：`home-storage-lifetime.ts:52`（调用 `project-host.ts:269,279,291,463`、`cli-project.ts:51`、`installer/uninstall-owner.ts:23`）、`project-catalog.ts:244`、`installer/uninstall-owner.ts:12`、`prologue-storage-owner.ts:9`、`home-snapshot.ts:34`、`home-restore.ts:39`。不取锁：`management-action-client.ts:16`、`configured-models.ts:19`、`local-uninstall.ts:20`、`plugin-holders.ts:77` | 升级接在「取锁后要开业务库」的三处，用一个函数；不取锁的读者只读、只拒绝，由入口决定拒绝之后怎么办。逐入口见 §4.3。#1790 不改这些文件 |
| 桌面只等 8 秒，到点杀掉服务；`/health` 要 200 且 `status==="ok"` | `web_service.rs:253,263-269`、`web_identity.rs`（`verify_response`）、`web-service-platform.ts:129` | 长升级不能放在服务监听之前不声不响地做。否则桌面每 8 秒杀一次，单个大库永远做不完（§4.2）。这是 U1 的硬约束 |
| `homeStores()` 能枚举大多数 Home 库，但项目库、目录库、Alchemist 不带 `library` | `home-stores.ts`，逐行核过 | 枚举用 `homeStores()` 加三类特殊描述符，不另列全名单（§2.3） |
| 只读打开 WAL 库会留下 `-wal`、`-shm`；放回备份时如果留着旧 `-wal`，库会「升回去」 | 本机实测（Node 24.22.2）：只读开关后两个文件都在；旧 `-wal` 配回放的主文件，`user_version` 读出 2、`integrity_check` 仍是 ok | §5 的放回步骤必须先删旁路文件，且要有拒绝测试。查不出来的错，最危险 |
| 结构比较按 `PRAGMA table_info` 的顺序逐列比 | #1790 `describeSqliteSchema`、`baselineShapePresent` 用 `JSON.stringify` | `ALTER TABLE ADD COLUMN` 把列加在末尾，所以基线里新列也要写在末尾，否则要重建表。写进升级段规则（§8.1） |
| `backupSnapshotSqlite` 的副本和源文件字节不同 | 它把副本改成 `journal_mode=DELETE`；模块级 `backup` 副本的头字节也保留 WAL 标记 | 做不到 UPG-03 的逐字节，升级快照不能用它（§5） |
| `snapshot-sqlite.ts:87-90`：给了基线或版本就核，要求等于它 | #1790 同 | 不放开，改成把「读到的版本」传进去（§5.3） |
| `home restore` 的 journal 一存在，所有入口都被 `assertNoPendingHomeRestore` 挡住 | `home-restore-guard.ts` | 升级记录不能复用这个 marker，否则违反「不挡启动」；只复用写法（原子写、严格解析、绑身份）（§6） |
| `preflightMemoryHome` 把非空但没有记忆库的 Home 当坏 Home | `memory-initialization.ts` | 空 Home 不能写升级戳记，否则第二次启动被它拦下（§3.3） |
| 核账的 8 处手写版本检查要勘误 | `project-statement-sql-worker.ts:26` 只是把错误映射成 `preparationError`，不是检查；漏了 `installed-plugin-libraries.ts:65`、`project-catalog.ts:231`、`home-store-snapshot.ts:53` | 按 §2.5 的 10 处收 |
| `verify-release-versions.mjs` 读基线版本不用改 | `objectVersion` 只读字面量深度 1 的 `version`，`upgrades` 嵌在里面不影响；核账说要同步改解析，不准 | §11.3 只改入口名单 |

## 2. 接口

### 2.1 基线

挂在 #1790 的 `SqliteBaseline` 和 `checkSqliteBaselineVersion` 上：

```ts
export interface SqliteUpgradeStep {
  readonly from: number;                       // 到 from + 1，机械校验连续，不写 to
  readonly sql?: string;                       // 只有 SQL 的段（插件只能用这种，§2.4）
  readonly run?: (db: SqliteBaselineDatabase) => void; // 平台与 Module 的回填，只用 exec/prepare
  readonly reduces_rows?: readonly string[];   // 明确会减行的表，其余表行数不许变少
  readonly rebuilds_tables?: boolean;          // 要 foreign_keys=OFF；只能在事务外设，见下
  readonly verify?: (db: SqliteBaselineDatabase) => void; // 主人的业务检查，事务内、提交前
}
export interface SqliteBaseline {
  readonly version: number;
  readonly schema: string;                     // 永远是当前版本的完整建库语句
  readonly upgrades?: readonly SqliteUpgradeStep[]; // from = 1..version-1，各一次；到时候可以裁掉太旧的段（§14）
}
```

`checkSqliteBaselineVersion` 只负责分类，**永远不升级**：

| 读到的版本 | 无表 | 有表 |
| --- | --- | --- |
| `0` | 返回 `false`，走建库路径（现状） | `storage.schema_version_mismatch`（现状：无版本却有表，不是升级对象） |
| `1 ≤ found < version` | 同右 | **`storage.upgrade_pending`**（新）。打开路径拒绝，等升级过程处理 |
| `found === version` | 同右 | 返回 `true`，继续比结构（现状） |
| `found > version` | 同右 | **`storage.store_too_new`**（新） |

只读预检与可写打开的先后不变：`inspectSqliteBaseline` 只读查版本和结构，再可写打开，`applyBaseline` 在 `BEGIN IMMEDIATE` 里建库。升级过程不走这条路，它自己开连接（§4.1）。

### 2.2 升级过程怎样升一个库

```text
前提：持主人锁；这个进程还没有打开任何业务库。
1. 校验段连续（from 从 found 起到 version-1 各一次），缺段记 failed，不碰文件。
2. 可写打开，PRAGMA wal_checkpoint(TRUNCATE)，关闭。确认 -wal、-shm、-journal 都不在了，否则记 failed。
3. 原样拷进升级快照，记下大小、sha256、mode、user_version、结构摘要（§5）。记录写 snapshotted。
4. 可写打开。段里有 rebuilds_tables 就在事务外 foreign_keys=OFF；插件的段一律 OFF（§2.4）。
5. BEGIN IMMEDIATE
     依次执行各段，PRAGMA user_version = version（插件表是写记账行，§2.4）
     PRAGMA integrity_check；PRAGMA foreign_key_check（插件的段按段结束时的范围逐表跑，§2.4）
     describeSqliteSchema 与 describeSqliteBaseline 逐表比（项目库只比基线有的表，现状如此）
     各表行数不少于升级前（reduces_rows 除外）；各段 verify
   COMMIT（任何一步失败：ROLLBACK，走 §5.2）
6. 关闭，记录写 committed。
```

实测（Node 24.22.2、WAL 库）：事务内 `ALTER TABLE`、回填、写 `user_version` 之后，`integrity_check`、`foreign_key_check`、`table_info` 都能看到新状态；`ROLLBACK` 后主文件字节不变；事务内设 `foreign_keys=OFF` 不生效，所以第 4 步必须在事务外。

### 2.3 每类存储走什么

| 存储 | 数量（main） | 版本放哪 | 怎样进升级过程 |
| --- | --- | --- | --- |
| 基线库：平台和 Module 的 Home 库 | 18 个 `SqliteBaseline` 里除项目库以外的 | `user_version` | `homeStores()` 的 `library.baseline`，`upgrades` 随基线带；声明写在库的主人那里（`table-owners.mjs` 也按此要求） |
| 内置插件的 Home 库 | 13 个 | `user_version` | Manifest `databases.home`，随 `homeStores()` 带入；`partition: "project"` 的库按 `homeSqlitePartitionDirectory` 枚举（内置目前没有，代码支持，按实际枚举） |
| `server/server.sqlite` | 1 | `user_version` | `DISCUSSION_HOME_STORE` |
| 目录库 `projects/catalog.db` | 1 | `catalog_meta.schema_version` | 同一个跑法，换一个版本读写适配（`CatalogVersionAccess`），`assertOwnedCatalog`、`assertCurrentCatalog` 收成分类同 §2.1。**第一个升**，因为要从它枚举项目 |
| 项目库 `projects/<id>/molis-work.db` | 每项目 1 | `user_version` | `PROJECT_DATABASE_BASELINE` 带段，按目录库枚举；连接用项目库的同一驱动（S-46）。基线里只比基线的表，插件表另算 |
| 项目库里内置插件的表 | 5 组 | `plugin_project_databases.version` 记账 | 紧接平台段之后，每个插件一个事务，见 §2.4 |
| 项目库里装上的插件的表、装上的插件的 Home 库 | 不定 | 记账 | **开关归 U4**（§2.4）。U1 只读版本：不符时现状不变（只停这个插件），不执行声明 |
| Alchemist `studio.sqlite` | 每项目 0～1 | `user_version` | 同基线库，按 `alchemist/projects/` 枚举；驱动留 `better-sqlite3`，接口只用 `exec/prepare`，两边都合。升级过程调 Alchemist 自己的打开函数，宿主不直接 import 旧驱动：SQLite 第二步之后门禁只放行 Alchemist（用户 2026-11-06 定）。`openDatabase`（`open-database.ts`）现在不在包的出口，`plugins/native/alchemist/src/index.ts` 加导出（E 轨预警）。`home-upgrade*.ts` 不点名 Alchemist（`pluginOutsideMentions`，`scripts/gates/assembly.mjs:173`，按文件只许减少）：放进已经点名的 `alchemist-search.ts`，经描述符把打开函数交给通用跑法。**不变量：同一个进程里，同一个文件不同时被两份 SQLite 开着**，开 `studio.sqlite` 时读版本用的通用连接已经关了，U1-d 用例钉住 |
| 搜索库 `search/search.db` | 1 | `search_meta` | **不进链**：可重建，版本不符清空重建，这是现行合同；快照 `omit`。比程序新的同样清空（它不是用户数据，UPG-05 不适用） |
| Alchemist `search.sqlite` | 每项目 0～1 | `user_version` | 可重建的缓存，现在走基线拒绝（`alchemist-search.ts:35`）。U1-d 改成与搜索库同样的「不符就清空」，开工时核实它确实没有不可重建的内容 |
| Prologue 的存储 `agent-runtime/records` | - | 上游 | 不进链（spec §4.5），靠金样回放 |

### 2.4 插件的表

`PluginDatabaseDeclaration`（`packages/contracts/src/platform/plugin-database.ts:150`）加可选字段：

```ts
readonly upgrades?: readonly { readonly from: number; readonly sql: string; readonly reduces_rows?: readonly string[] }[];
```

- Manifest 是声明，**只有 SQL，没有函数**。这条对内置和装上的插件一样（插件同等待遇），也和 U4 将来的路相同。
- 这是合同改动，碰 `tooling/gates/api/contracts/platform/plugin.txt`、`plugin-sdk/index.txt`（`HomeStoreDeclaration.library.baseline` 同样加段，还碰 `platform/plugin-registration.txt`），单独一片排公共合同队列（U1-f）。
- **跑法和范围检查对所有插件同一份，差别只剩一个开关（用户 2026-11-06 定）。** 内置插件也过检查，不合规的段同样被拒。唯一的暂时例外：装上的插件在 Manifest 里写了 `upgrades`，安装时明确拒绝（`plugin.upgrade_steps_unsupported`）。这个例外只有一处判断，移除条件是 U4，由 U1-f 同一个 PR 记进 `AGENTS.md` 指向的「2026-10-18 改」清单（`specs/archive/repository-anti-corruption/spec.md` §1）。拒绝比悄悄不执行好。
- **段只能碰这个插件自己的表（S-115）。** 现有两层都不管段：`project-database.ts:153` 只管 `declaration.schema`，`pluginStatementGuard` 只放 `INSERT`、`UPDATE`、`DELETE` 这类语句。一段 `DROP TABLE` 就能动平台和别的插件的表，违反 S-46。所以加三层，都在 `packages/plugin-runtime`，不依赖宿主：
  1. **声明时，只看写法，读整句的形状。** 用现有的 `statements()` 分句（`project-database.ts:79`），每句只许下面的形状，其余一律拒绝，包括 `ATTACH`、`PRAGMA`、`VACUUM`、`REINDEX`、`CREATE TRIGGER`、`CREATE VIEW`、虚表和事务语句：
     - `ALTER TABLE n` 后面只能是 `ADD`、`DROP`、`RENAME`；`RENAME TO m` 后面不再有词。
     - `DROP TABLE n`、`DROP INDEX i` 后面不再有词。
     - `CREATE TABLE n` 后面只能是 `(`，所以没有 `AS SELECT`。
     - `CREATE [UNIQUE] INDEX i ON n` 后面只能是 `(`。
     - `INSERT`、`UPDATE`、`DELETE` 不读形状，到第 2 层过 `pluginStatementGuard`，它读语句的执行步骤，不读文字。
     - `IF [NOT] EXISTS` 一律拒绝。名字的位置上出现不带引号的 `IF` 也拒绝，真有张表叫 `if` 就写引号。
     - 名字带库名的，形状就过不了：`main . other`、`main/*x*/.other` 里，`main` 后面是点。

     只读第一个词不够，下面两段三层都能过（实测）：插件有张表叫 `main` 时，`ALTER TABLE main . other DROP COLUMN note` 再加回，`other.note` 全变 NULL；插件有张表叫 `if` 时，`DROP TABLE IF EXISTS other` 后同样文字重建，`other` 整张换掉。现有的 `CREATE_TABLE`、`CREATE_INDEX` 正则（`project-database.ts:69-70`）都允许 `IF NOT EXISTS`，不能照抄。Manifest 读入时就查，内置的不合规由 U1-f 的用例在 CI 拦下，装上的在安装时先过这一层，再到开关。
  2. **执行时，每句先按当前范围核目标。** 范围从账本里这个插件的表开始，随段变化。增删改过 `pluginStatementGuard` 同一份，范围传当前的；SQLite 版本不符同样全部拒绝，失败是关闭的。结构语句在执行前核：
     - `ALTER TABLE n`、`DROP TABLE n`、`CREATE [UNIQUE] INDEX i ON n`：`n` 必须在范围里。
     - `DROP INDEX i`：查 `sqlite_schema`，`i` 的 `tbl_name` 必须在范围里。
     - `CREATE TABLE n`：`n` 进范围。别人的表删不掉，所以没有「删了再建」；同名的表还在时 SQLite 自己报错。
     - `ALTER TABLE n RENAME TO m`：范围里 `n` 换成 `m`。`DROP TABLE n`：`n` 移出范围。
     - **名字要按词读，不能对原文跑正则。** `statements()` 现在把带引号的名字遮成 `Q`，要让它顺带交出每句的词：跳过注释，还原四种引号（`"`、`` ` ``、`[]`、转义的 `""`），按 `fold` 比，读不出来就拒绝。**词从扫描里直接取，不从压过空白的文字里取；词的边界按 SQLite，不按 JS 的 `\s`：** 空白只有空格、`\t`、`\n`、`\f`、`\r`；不带引号的名字只许 ASCII 字母、数字、`_`、`$`，碰到别的字符就拒绝，要用就写引号。这比 SQLite 严，是有意的，不用照抄它的规则：U+00A0 是名字的一部分，所以 `ALTER TABLE a1<U+00A0> ADD COLUMN c TEXT` 改的是另一张表。用这个读法对 13 种分隔、27 种名字、12 种语句的 4212 种写法跑对照：过了第 1、2 层的 392 种只动自己的表，没有一种逃出去；被拒的里有 464 种，不拦 SQLite 就会动别人的表。实测（`better-sqlite3@12.8.0`）：对原文跑正则时，`ALTER /*x*/ TABLE other`、`ALTER TABLE /*x*/ other`、`ALTER TABLE [other]`、`` ALTER TABLE `other` `` 都读不到目标，段照样改了别人的表；按词读全部拒绝，合法的段照常通过。
  3. **事务提交前，比结构，这一层是兜底。** 段开始前记下 `sqlite_schema` 里不属于这个插件的行（`type、name、tbl_name、sql`），提交前逐字比，有差别就回滚；这个插件的对象集合必须正好等于声明的目标集合，结构逐表比。「属于」按 `tbl_name` 算，和 `scopeOf` 同一个口径，否则 `CREATE UNIQUE INDEX 声明里有的名字 ON other(…)` 比不出来。这一层只比文字，比不出数据：`ALTER TABLE other DROP COLUMN note` 再 `ADD COLUMN note` 之后文字可以一字不差，数据已经没了，所以不能靠它。比全库内容摘要太贵，也只能事后发现。
- **插件的段一律 `foreign_keys=OFF`。** 段不写 PRAGMA，平台在事务外设。**恢复也在事务外：** `COMMIT` 或 `ROLLBACK` 之后再设 `ON`，读回来确认是 1，不是 1 就关掉这条连接、记 failed，成功和失败两条路都走这一步。事务里设 `ON` 是空操作（实测：设完读到 0，回滚后还是 0）；项目库的插件表是在长连接上打开的（`apps/local-host/src/project-database.ts:23`），写反了这个项目之后的外键都不再生效，而且什么都不报。段结束时**范围里**的每张表跑 `PRAGMA foreign_key_check(t)`，有违反就回滚。按范围不按账本：段删过的表会报 `no such table`，新建的表账本里还没有。不用给插件的段加 `rebuilds_tables`。不能用 `defer_foreign_keys=ON`：外键还开着，`DROP TABLE` 的隐式删除照样触发外键动作。实测重建 `ON DELETE SET NULL` 子表的父表，子表的列全变 NULL，行数不变，`foreign_key_check` 还是空，什么都比不出。真实的表就有这种：Goals 的 `goal_tree_proposals.root_goal_id`（`plugins/native/goals/src/project-database-governance.ts:10`）。关掉之后 `CASCADE` 和 `SET NULL` 都不跑，子表原值都在。真要依赖级联删除的段，留下的孤儿行由 `foreign_key_check` 挡下回滚，失败是安全的。
- **Home 库走同一份。** 库文件只归这个插件，第 3 层没有别人的行可比，第 1、2 层照旧，`ATTACH` 这类一样拒绝。
- **U4 要做的不只是打开开关。** 装上的插件的 SQL 要放进专属子进程的 Worker（S-59）才有超时和内存上限，内置的在升级过程里直接跑。所以这三层写成只收一个连接的函数，U4 把它放进 Worker，并和 `upgrade_compatibility` 合流。**U4 还要另定升级用的限额：** S-59 的限额是给日常语句定的（写句 2 秒，`BEGIN` 到 `COMMIT` 共 3 秒，超了整个进程结束），重建或回填一张大表一定超。
- 所以「首次改任何插件表的结构」要等 U1-f，不只是等机制。
- 项目库里的插件表：每个插件自己一个 `BEGIN IMMEDIATE`，做升级、更新 `plugin_project_databases.version`、查结构。失败只回滚这一个事务，这个插件走现有的 `plugin.project_database.*` 停用路径，项目库其余照常（`project-plugin-databases.ts` 已是这样）。**这里做不到文件级逐字节**：同一个文件里平台段已经提交了。保证的是这个插件的表内容和结构与升级前相同：升级前后比这个插件每张表的内容摘要（按主键顺序）和结构摘要，只比行数查不出内容被改。决策记录有一行，spec §9 UPG-03 旁有脚注。

### 2.5 手写版本检查收到哪里

| 位置 | 现在做什么 | 收成 |
| --- | --- | --- |
| `project-database.ts:33-37`、`server/src/database.ts:39-42` | #1790 已收到 `checkSqliteBaselineVersion` | 跟着 §2.1 的分类 |
| `home-plugin-store.ts:55-56` | 抛 `SqliteSchemaVersionError` | 改调 `checkSqliteBaselineVersion` |
| `memory-ledger.ts:108` | 自写 | 同上 |
| `installed-plugin-libraries.ts:65`（账本） | 自写，核账漏 | 同上 |
| `installed-plugin-libraries.ts:115`（已装的库） | 自写 | 留下，这是 U4 的版本；错误码改 §9.1 的码 |
| `catalog-schema.ts:33-36`、`project-catalog.ts:231` | `catalogSchemaCompatibilityError`、`catalog.reader_too_old` | 用适配读版本，走同一分类。`reader_too_old` 的提示语是 MCP 用的，保留文字改码 |
| `home-store-snapshot.ts:53` | 快照按现行版本核，核账漏 | 不改语义（§5.3） |
| `snapshot-sqlite.ts:86-90` | 恢复侧检查 | 不改语义（§5.3） |
| `project-statement-sql-worker.ts:26` | 错误映射，不是检查 | 映射新码，其余不动 |

`clearInExistingHomeSqlite` 也走同一分类：低版本的库不清。

### 2.6 带版本的文件

```ts
export interface VersionedFile<T> {
  readonly path: string;                 // 相对 Home
  readonly version: number;              // 当前版本
  readonly field: "version" | "schema_version";
  readonly upgrades: readonly { readonly from: number; readonly transform: (value: unknown) => unknown }[];
  readonly parse: (value: unknown) => T; // 主人现有的严格解析，升级后过一遍
}
export function readVersionedFile<T>(file, home): { status: "absent" } | { status: "current"; value: T } | { status: "too_new"; found: number } | { status: "upgrade_pending"; found: number };
```

升级过程：拷快照 → 按段变换 → `parse` 检查 → 写临时文件、fsync、rename、fsync 目录 → 记录 committed。读取路径不做变换。

| 文件 | 处理 | 片 |
| --- | --- | --- |
| `config/mcp-tools.json`、`shelf/catalog.json`、`jelly/preferences.json` | 进链，现有严格解析作 `parse`。`shelf/catalog.json` 的主人是 `modules/shelf`，升级过程用 Shelf 导出的文件定义，不把写权拿到宿主外（现在写走 `saveCatalog(writer, …)`，开工时核这条路在升级过程里怎么给 writer） | U1-e |
| `browser/sites.json` | **吞错要修**：`browser-surfaces.ts:65-72` 不看版本、`catch` 全吞成默认值，下次保存就覆盖。高版本文件被读成默认再写回，直接违反 UPG-05。改成：没有文件才是默认；版本高或读不了时用内存默认、**拒绝写**，并记诊断 | U1-e |
| `computer/settings.json`、`config/onboarding.json`、`config/project-arrival.json` | 读时不看版本或只整形，同样的问题，同样改 | U1-e |
| `computer/records/<id>/record.json` | 进链，按目录枚举 | U1-e |
| `feed/secrets.json` | 进链，规则见 §8.2 | U1-e |
| `config/installation.json`、`releases/*/release.json` | **同一接口，不同时机**：安装器读它们时程序还没有进宿主，所以由安装器（`installer/home-files.ts`）在读的地方调同一个升级函数；不在快照内（已在 `snapshotExclusions`），备份放在同目录 | U1-e |
| `config/web-service.json`、`config/uninstall.json`、`runtime-integrations/*.json`、`runtime-config-backups` | 机器收据或可再生成，版本不符时现状是拒绝。版本升了之前不用段；第一次要升时按同接口加 | 不做 |
| `config/external-mcp-actions.json`、`config/connector-mcp-actions.json` | 无版本字段，现在不是带版本文件；要改结构先加版本。它们不在 `homeStores()` 里，见 §15.2 | 不做 |

## 3. 什么时候升：启动时一次做

**推荐：启动时一次做完，打开路径永不升级。** UPG-02 的「打开时」解释成「宿主打开 Home 时」，验收原文不改，决策记录有一行。

### 3.1 为什么不在首次打开时做

| 看什么 | 启动时一次做（推荐） | 首次打开时做 |
| --- | --- | --- |
| 打开路径的成本 | 不变：只多一次整数分类 | 每次打开都可能要写、取写锁。N45 进项目首页开连接库 233 次，N48 页面不动 20 秒开 85 次，这条路上不能再加东西 |
| UPG-06 几个库一起升 | 一份记录一次排好，顺序（目录库第一）、分组（§8.2）都能写 | 按使用顺序零散发生，记录和分组都排不了；密钥文件加密文库这种跨库的做不到 |
| 快照、回退（U6） | 一轮一个目录，回退一步到位 | 东一个西一个，升级前到底是什么状态说不清 |
| 同步与等待 | 单独一个阶段，可以显示进度 | 打开路径多半是同步的，升级在某个请求里卡住整个事件循环，还没有进度可显示 |
| 启动耗时 | 换版本的那次多花时间（下面算了） | 启动快，但慢的部分摊到第一次点击上，而且不可预期 |

### 3.2 算账（N42～N56 口径）

实测：真实 27 表项目库（`tests/fixtures/project-database-schema.sql`），Node 24.22.2，本机。只读开库读 `user_version` 再关 **0.153 ms**；再加结构比较共 **0.956 ms**。有数据的库：`integrity_check` 占大头，随索引多少变化。评审台量的 414 MB（两表三索引）是 3.5 s/GB，这边量的 568 MB（一表三列索引、随机文本）是 6.9 s/GB；`quick_check` 约 0.35～0.5 s/GB，`foreign_key_check`、每表 `COUNT(*)` 可以不计。拷贝加 sha256 约 0.6～0.8 s/GB。合起来**每 GB 约 4.3～7.7 s**。

| 情形 | 开库次数 | 耗时 |
| --- | --- | --- |
| 平时启动（戳记相符，§3.3） | **0** | 读一个小文件，算一个摘要 |
| 换了版本，全部已是当前（只扫版本） | 约 27 个 Home 库，加项目数 N × 最多 3（项目库、Alchemist 两个） | N=100 约 50 ms；N=500 约 250 ms；N=2000（`project-arrival.ts` 的 `MAX_PROJECTS`）约 1 s。结构比较不做，只比版本 |
| 真要升某个库 | 每库额外 2 次可写打开 | 每库约 1 ms 结构比较，加每 GB 约 4.3～7.7 s（快照加 `integrity_check`），加段本身的耗时 |
| 项目库基线升一版（最贵） | 所有项目库各升一次 | 主要是 `integrity_check`：全部项目库总大小 × 4.3～7.7 s/GB。总大小 5 GB 约 21～39 s，50 GB 约 3.6～6.4 分钟。这是估算，U1 的回放量一次真实的 |

项目库很多时，单次启动的上限落在总大小上，不是数量上。总大小超过约 8～14 GB，这次升级就超过一分钟。这种升级是一次性的，有维护态和一行进度（§4.2、UPG-19），桌面不会杀进程，所以结论不变。

**第 5 步留 `integrity_check`，不换 `quick_check`。** `quick_check` 快 10 倍，但不核索引和表内容是否一致；升级段正好会改表、重建表，这一项是 UPG-03 判断要不要放回的依据，spec §4.2 也点名了它。只有真升的库才跑，平时零成本。如果金样或真实 Home 上这一次常常超过一分钟，再回来考虑项目库懒升级，现在不做。

一次运行内不重复：扫描结果留在内存里，升级过程结束即丢。

**N45 顺手能省的。** 打开路径每次都比结构（0.8 ms）。`inspectSqliteBaseline` 的结构比较按「进程＋文件身份（dev、ino、size、mtimeMs）＋`PRAGMA schema_version`」记忆，每个结构每个进程比一次；N45 一页省约 186 ms。`schema_version` 不能省：WAL 库里 `ALTER TABLE` 之后主文件的四项身份都不变（评审台实测），只有它变。多读一个 pragma，连接本来就开着。这样结构变了一定重比，「同号结构不符就拒绝」不削弱。这是单独一片（U1-j），不替代 N45 自己的那片，也不是 U1 必需，可以晚做。

### 3.3 戳记

`upgrade/state.json`（Home 身份的写法同 `home restore` journal）：

```json
{ "schema_version": 1, "home_identity": "…", "fingerprint": "<sha256>", "completed_at": "…" }
```

- `fingerprint` 由当前代码算：所有存储描述符的相对路径模式与 `version`，排序后算摘要。**不开任何库。**
- 相同就跳过全部扫描；不同就全量扫版本。
- 只是缓存，不是事实。手工放回旧库这类情况，戳记还相符，库却是旧的，要能自愈：
  - **谁发现：** `packages/storage` 的版本分类（`checkSqliteBaselineVersion`）。§2.5 收完之后所有打开路径都过它。它不知道 Home，只发信号：`onUpgradePending(listener)`，抛 `storage.upgrade_pending` 之前同步调用，把库路径交出去。
  - **谁删：** 宿主。§4.1 的 `acquireUpgradedHomeOwner` 取到锁后注册监听，放锁时注销；监听只认这个 Home 里的路径，删 `upgrade/state.json`（`rmSync(force)`），下次启动重新扫。删失败只记日志，不盖住原来的错误。
  - **不持锁的读者不删：** 这个进程没持锁就没有监听，所以 §4.3 里不取锁的读者不写任何东西（S-109）。Worker 和子进程里的打开也一样，它们不持有这把锁。
  - 这是打开路径上唯一的写，只在已经失败时发生，平时只多一次判空。
  - 有明确入口的（U6 的回退、§3.4 的恢复）在自己持锁的流程里直接删，不靠这个信号。
- `home restore` 时 `upgrade/` 按 `reset` 处理，恢复后必全量扫。
- 只有全部存储都是当前版本时才写；有 `too_new` 或 `failed` 的不写，下次还扫（代价就是上面那 50 ms）。
- **空 Home 不写戳记**：扫到没有任何库就不留文件，否则 `preflightMemoryHome` 会把「有 `upgrade/` 没有记忆库」当成坏 Home。

### 3.4 迟到的库

扫描之后才出现的旧库（恢复项目、`existingOnly` 分支 `catalog.project_recovery_unsupported_schema`）：恢复入口持锁，调 `upgradeOneStore(descriptor)`，同一个跑法，单独一条记录。这条路第一片不接，现状（拒绝）先留着，U1-d 写明。

## 4. 接在哪里、等的人怎么办

### 4.1 接在哪里

**规则：取锁之后要按现行版本开业务库的，取锁时升级；不开业务库的不升；没有锁的只读、只拒绝。** 不存在「所有入口都过」的一点，所以用一个函数，让三个取锁点都调它，每个入口的去向在 §4.3 逐行写。

```text
acquireUpgradedHomeOwner(home, beforeAcquire?)      // 放 home-storage-lifetime.ts，U1-c 核循环依赖
  assertNoPendingHomeRestore
  beforeAcquire?.(home)                    // preflightMemoryHome：只读、锁前，不查版本，互不影响
  owner = acquireStorageOwner
  注册戳记自愈的监听（§3.3）
  ensureHomeUpgraded(home)                 // 戳记相符零成本；不符就同步跑完
  出错：注销监听，放锁，往上抛
  return owner
```

调它的三处：`ensureHomeStorageOwner` 的首次取锁分支（`home-storage-lifetime.ts:52`）、`project-catalog.ts:244`、`installer/uninstall-owner.ts:12` 的非 purge 分支。之后才有 `prepareMemoryHome`、业务库打开。单库失败不算这里出错（§5.2），只有取不到锁、记录坏了这类整体问题才抛。

全部操作是同步的（`node:sqlite`、`better-sqlite3`、`copyFileSync`、`snapshotFileDigest`），放得进同步的 `createMolisWorkWebServer`。`copySnapshotFile`（异步）和 SQLite `backup` 进不来，也用不着（§5）。

新 Home 的关系：没有库，升级零动作，接着照旧 `prepareMemoryHome`。

### 4.2 维护态

只靠 §4.1，升级时服务没有监听，桌面等 8 秒后杀进程。所以 launcher 在创建服务之前先走一步：

```text
apps/desktop/launchers/web/server.ts：
  plan = planHomeUpgrade(home)             // 不取锁；读戳记，必要时只读扫版本
  if (plan.needed) await runUpgradeMaintenance({ home, port, plan })
  server = createMolisWorkWebServer(...)   // 走到 ensureHomeStorageOwner 时戳记已相符，零成本
```

`runUpgradeMaintenance`：

- 在 `127.0.0.1:port` 上起一个最小监听（守 S-01、S-02、S-21），只答两种请求：
  - `/health`：沿用 `sendWebHealth` 的挑战证明，**503**，体里 `status: "upgrading"`、`upgrade: { done, total, started_at }`，只有数字，没有库名和内容；
  - 其他：503，`Retry-After: 1`，错误码 `storage.upgrade_in_progress`。
  - U3 要显示开场那一行时，由这个监听提供页面，形式 U3 定。
- 用 Worker 线程跑 `runHomeUpgrade`（取锁、跑完、放锁），主线程不被同步 SQLite 卡住，能答 `/health`。Worker 里能否正常开关存储主人锁，U1-g 第一步先写用例证实；不行就换子进程，接口不变。
- 跑完关监听，接着 `createMolisWorkWebServer`、`listen`。中间有几毫秒端口空着，客户端都是重试的。
- 单库失败不算维护失败（§5.2）。取锁 `busy` 表示另一个宿主在用：直接走现状的报错。

**2 秒阈值**（UPG-19）：`/health` 的 `upgrade.started_at` 给出起点，显示方自己按 2 秒判断，不在服务端做两套。

### 4.3 每个入口怎样做

**取锁的点：**

| 入口 | 现在 | 怎么做 |
| --- | --- | --- |
| `ensureHomeStorageOwner` 首次分支（`home-storage-lifetime.ts:52`；调用 `project-host.ts:269,279,291,463`、`cli-project.ts:51`、`installer/uninstall-owner.ts:23`） | 取锁，不看版本 | 调 `acquireUpgradedHomeOwner`。维护态走完之后到这里戳记已相符，零成本 |
| 已持锁的再次调用（同一函数的 `held` 分支） | 只核身份 | 不动，这把锁取到时已经升过 |
| 维护态的 `runHomeUpgrade`（§4.2，U1-g 新增） | 没有 | 自己取锁，跑完放锁；之后 `createMolisWorkWebServer` 走第一行，戳记相符 |
| `project-catalog.ts:244`（没给 `storageOwner`，如 `cli-project-maintenance.ts:87`） | 自己取锁，目录库低就拒，别的库低继续往下开 | 调 `acquireUpgradedHomeOwner(home, preflightMemoryHome)`，前面两步正好和它重合。给了 `storageOwner` 的不动：那把锁是上面几处取到的 |
| `installer/uninstall-owner.ts:12`，非 purge、没有宿主 | 自己取锁；随后 `removeDemos` 按现行版本开目录库（`local-uninstall.ts:29`） | 调 `acquireUpgradedHomeOwner(home)`。比现状多一个拒绝：有未完成的 `home restore` 时被拒，和有宿主的分支一致。U1-c 写用例 |
| `installer/uninstall-owner.ts:12`，purge | 自己取锁，要把数据全删 | **不升。** 永久清除不该被升级失败或磁盘不够挡住。现状有一个坑：有演示项目时先走 `removeDemos`（`uninstall.ts:197`），它按现行版本开目录库，低版本会在删到一半时失败。purge 时跳过这一步，后面 `purgeDataPaths` 会整个删掉（U1-c 核它含 `projects/`，不含就回来问）。U1-c 用低版本目录库加演示项目写一条用例 |
| `prologue-storage-owner.ts:9`（`parent === undefined`） | 自己取锁 | **不升。** 真实 Home 上 parent 由宿主给（`project-host.ts`）；没有 parent 的是模型连接测试的临时目录（`model-provider-test.ts:13`），不是 Home |
| `home-snapshot.ts:34` | 自己取锁，不经 `ensureHomeStorageOwner` | **不升。** 见到未完成的升级记录用现有的 `home_snapshot.maintenance_pending` 拒绝（§6）。Home 是旧版本但记录已清（比如还没启动过新程序）：快照按现行基线核，失败，现状不变，提示先启动一次 |
| `home-restore.ts:39` | 同上 | **不升。** 见到未完成的升级记录同样拒绝。恢复之后 `upgrade/` 按 `reset` 处理，下次启动全量扫（§3.3） |

**不取锁读目录库的点：** 它们都只读、不写（S-109）。

| 入口 | 现在 | 低版本时怎么做 |
| --- | --- | --- |
| `catalogManagementProject`（`management-action-client.ts:16`）本身 | 只读，`assertOwnedCatalog`、`assertCurrentCatalog` | **语义不变：** 只读，见低版本抛 `storage.upgrade_pending`。升不升由调用方决定，见下面三行 |
| CLI，`cli-project.ts:57` | 直接抛，走不到 `:51` | 捕到 `storage.upgrade_pending`：无条件 `ensureHomeStorageOwner(localHost ??= createMolisWorkLocalHost({ homeDirectory: home }), home, preflightMemoryHome)`，就地升完，stderr 一行，再读一次。第二次仍然 pending 就报这个库升级失败。目录库已是现行、只有别的库低时，读目录库不报错，现有 `fallback` 取锁时升。**不能靠 `homeProject=false` 落到 `fallback`：** 它要 `homeProject \|\| homeDatabase` 才取锁，Home 外的项目库两个都为假，就不升了。取锁 `storage.owner.busy` 报 `storage.upgrade_in_progress`（「这份 Home 正被另一个进程使用，可能正在升级，稍后再试」） |
| MCP 生产路径，`mcp-v1-tool.ts:43`（有 `ensureResident`） | 全部转发给常驻宿主，不读目录库 | 不走 `catalogManagementProject`。`ensureResident`（`mcp-resident-start.ts:64`，20 秒）把 `/health` 的 `upgrading` 归 `starting`，继续等；超时报 `actions.service_unavailable`（「正在升级，稍后再试」），不加长工具调用的超时。宿主里 `management-action-gateway.ts:33` 读目录库时已经升完 |
| MCP 没有 `ensureResident` 的路径，`mcp-v1-tool.ts:65` | 直接抛 | 没有东西可拉，和 CLI 同样处理：用 `caller.localHost` 取锁升完，再读一次；`busy` 同样报 `storage.upgrade_in_progress` |
| `management-action-gateway.ts:33` | 在宿主里调 | 宿主取锁时已升完。见低版本说明这个库升级失败，照常报 |
| `configured-models.ts:19`、`plugin-holders.ts:77` | 宿主运行中调用；前者查版本，后者只查 owner | 升级已做完，不处理。前者见低版本就拒绝 |
| `local-uninstall.ts:20`（`listCatalogProjectsForUninstall`） | 只读，只查 owner，不查版本；出错报 conflict | 不升。预览不改东西。以后目录库改了 `projects` 表的列、旧库读不了时报 conflict，不写坏；这种情况先启动一次程序 |
| Home 之外的项目库（`--db`、`database:<路径>`，不在目录库登记） | 打开时比基线 | 不枚举、不升，打开报 `storage.upgrade_pending`。升级过程只管这个 Home 的存储。现状也是拒绝，这里不新增路径 |

三个调用方的错误处理写成一层薄包装（如 `catalogManagementProjectAfterUpgrade(home, path, upgrade)`），`store_too_new`、`upgrade_failed` 直接往上报，不取锁、不拉宿主。

**等的人：**

| 入口 | 现在 | 升级中 |
| --- | --- | --- |
| 桌面 Tauri（`web_service.rs:253`） | 等 8 秒后杀服务，报启动失败 | **要改，F 轨文件**：`web_identity` 能验证 503 的 `upgrading`，见到就继续等、不算超时；没有 `upgrading` 仍按 8 秒。启动画面读 `upgrade` 显示进度归 U3（U1-h） |
| 托管服务（`web-service-platform.ts:129`） | 1 秒一探，要 `ok` | 现有等待逻辑把 `upgrading` 看作还没好；若有总超时，同上放宽，U1-g 核 |
| 设置页（`settings-web-service.ts:32`） | 读 `/health` | 不会在升级中加载 |

`/health` 的新字段是本机接口，不是公开合同；MCP 与桌面的判断写在各自的片里。

## 5. 快照与失败恢复

### 5.1 复用什么、不用什么

| 现成的 | 用不用 | 为什么 |
| --- | --- | --- |
| `snapshotFileDigest`、`writeSnapshotJson`、`syncSnapshotPath` | 用 | 同步，正合适 |
| `HomeSnapshotFile` 的形状（`path, mode, size, sha256, sqlite`） | 用 | 清单每行同样字段 |
| `HomeSnapshotManifest` 整份 | 不用 | `source_inventory`、`stores`、`exclusions` 是整 Home 语义，硬套要填一堆假值 |
| `captureSnapshotStore` | 不用 | 粒度是 store，`projects` 一个 store 含目录库和全部项目库；`sealed` 处置会用主密钥重新封装，内容就变了 |
| `backupSnapshotSqlite` | 不用 | 异步，副本字节不同，做不到逐字节（§1） |
| `copySnapshotFile` | 不用 | 异步。用 `copyFileSync`，加上面的摘要 |
| `home restore` journal | 只用写法 | 原因见 §1 |

### 5.2 放回

基准定义：**checkpoint 之后、第一次写之前的主文件**。UPG-03 的「逐字节一致」就比这份。checkpoint 只是把 WAL 合进主文件，逻辑内容不变，决策记录有一行。

```text
目录 upgrade/<run-id>/（0700），文件 0600，manifest.json 记每个文件的原 mode。
失败时（持锁、无连接）：
  1. 记录写 restoring。
  2. 核快照的 sha256，不符就停：这个库保持现状，记 snapshot_invalid，等 U3。
  3. 先删目标的 -wal、-shm、-journal（实测：留着旧 -wal，库会读出升级后的状态）。
  4. 拷到同目录临时文件，fsync，rename，fsync 目录，恢复原 mode。
  5. 再算目标 sha256，与快照比。
  6. 记录写 failed，带错误码和这个库的主人。
```

每一步都可以重来：中断后从 `restoring` 接着做。失败的库打开时报 `storage.upgrade_failed`。同一 fingerprint 下不自动重试，免得每次启动都花时间；换版本或 U3 的操作才重试。

**磁盘空间**：开始前用 `statfsSync` 查：可用空间不足「要动的文件总大小 × 2」时，这一轮不动任何东西，全部记 `storage.upgrade_no_space`，下次启动再看。

### 5.3 `snapshot-sqlite.ts:87-90` 不放开

离线快照和恢复继续要求现行版本：放回一份旧快照让新程序直接读，正是恢复侧要拒绝的。旧快照怎样放回新程序，归 U6、U7。

升级快照不走这条路。要做结构核对时，调同一个 `inspectDatabase`，版本传「读到的版本」：`{ version: found }`。这是调用方传参，函数语义不动。放回时靠 sha256 核对，比结构比较更严。#1790 的文件这样一行不用为 U1 放松。

### 5.4 密文和权限

- 不解密，不重新封装，密文原样进快照（和 `sealed` 处置的区别就在这里）。
- 密钥不进快照目录。Home 主密钥、`feed` 文件密钥只在清单里记依赖（`keys.add` 的写法）。
- 路径从可信 Home 和描述符推导，**不读记录里写的路径**（S-111）。
- `upgrade/` 登记进 `homeStores()`：owner `apps/local-host`，快照 `omittedSnapshot("Upgrade snapshots and progress", "reset")`，`uninstall --purge-user-data` 随之删除，`HOME-DATA.md` 加一行。
- 保留期：保留到**下一次成功升级**，给 U6「回到上一版」用；更早的删掉。

## 6. 升级记录与中断

`upgrade/ledger.json`，`writeSnapshotJson` 的原子写，严格解析，绑 Home 身份：

```json
{ "schema_version": 1, "home_identity": "…", "run_id": "…", "from": "<fingerprint>", "to": "<fingerprint>",
  "started_at": "…", "units": [ { "kind": "sqlite|file|plugin_tables", "owner": "…", "relative_path": "…",
    "group": null, "from": 1, "to": 2, "state": "planned|snapshotted|committed|restoring|failed|too_new", "error": null } ] }
```

- `relative_path` 只是标识，用来和当前描述符对上；对不上的算记录无效（S-112）。真实路径永远现算。
- **中断后下次启动接着做**（决策记录已定，不挡启动，开场接着做完）。按 `state` 走：`snapshotted` 的**先读版本**，等于 `to` 就补记 `committed`（COMMIT 之后、记 `committed` 之前断电就是这种情形，重跑段会撞上重复列，再放回就把升好的库退掉了）；等于 `from` 才核快照、重新开始事务，事务没提交的 SQLite 自己丢了；都不是就记 `failed`。文件和插件表单元同样先读自己的版本号。`committed` 的不再动；`restoring` 的做完放回。
- **没有「一半新一半旧还被当成可用」**：每个单元都是完整的旧版或完整的新版；记录没完成就不写戳记；还没轮到的打开时是 `storage.upgrade_pending`。启动路径上升级总在业务库打开之前做完，所以用户看不到这个状态，除非这个单元失败了。
- **失败只算它自己**（UPG-04 的机制半）：其余接着做。主人之间有依赖的，单元写 `after`；前置失败，后面的记 `failed`，错误码写清原因。
- 记录在，`home snapshot`、`home restore` 用 `maintenance_pending` 拒绝。反过来，有未完成的 `home restore` 时 `assertNoPendingHomeRestore` 在最前面，不会进升级。
- 全部做完记录留着（U3 的结果卡要读），下一轮覆盖。

## 7. 比程序新的库

只拒绝这一个（UPG-05）。U1 保证不读不写，显示归 U3。

- 扫描只读版本。见到高版本记 `too_new`，不开可写连接，不快照，不写戳记。
- 打开路径 `storage.store_too_new`，主人照 UPG-04 的路处理。
- 文件同样：`readVersionedFile` 返回 `too_new`，**写路径拒绝**。§2.6 那几个吞错的文件就是为这条改的。
- 只读打开 WAL 库也会留旁路文件（§1），但不改主文件内容，算在「不写」之内，不去清理。
- 搜索库例外（§2.3）。

## 8. 写升级段的规则

### 8.1 一段里能做什么

- 只往前。不提供 `down`。
- **先扩后收**：这一版加新列或新表，读写都转到新的，同时回填；下一版再删旧的。验收看第一步之后的旧程序还能不能读（U6 回退靠它）。这条靠评审和金样，门禁查不了。
- 基线的 `schema` 永远是当前版本完整的样子。`ADD COLUMN` 的新列写在建表语句**末尾**；要插在中间、加约束、改类型，就按 SQLite 的 12 步重建表，段上写 `rebuilds_tables`。结构比较会拦下不一致的（§1）。**漏写 `rebuilds_tables` 比不出来：** 外键开着重建父表，`ON DELETE SET NULL` 子表的列会被清空，行数和 `foreign_key_check` 都没有变化（§2.4），靠评审和金样。
- 段放在表主人的包里（`table-owners.mjs` 也数 `ALTER TABLE`）。
- 回填要是确定的、可重复的结果：不调模型，不访问网络，不读别的库（要读的走 `after` 和主人导出的函数）。
- 段里不写业务错误恢复。失败就抛，由跑法统一放回。

### 8.2 密钥段（UPG-08）

- 段拿 `SecretStore` 引用，不拿明文通道：旧钥匙读、新钥匙写，写后全读验证一遍，再提交。
- 密钥文件和它加密的库写成一个 `group`：任何一个失败，整组放回。这是目前唯一需要跨文件原子的情形，`group` 也只给它用。
- **不留第二套恢复层**：段结束时旧钥匙不再被读。N36、N37 的绕行（`evidence-content.ts:14-16`、恢复目录、`search-intelligence-client.ts:36-39`）在重建时段清掉，#1837 正在收 `ENV_KEY_SALT` 和恢复层；这里的规则防止它们回来：段里不许写「新钥匙读不出就用旧的再试一次」。
- 写测试时用一把测试钥匙和假 `SecretStore`，不碰真实密钥。

## 9. 错误码、标记与门禁影响

### 9.1 错误码

`packages/storage` 已经有 `defineErrorCodes("storage", …)`，并进去：

| 码 | 类别 | 含义 |
| --- | --- | --- |
| `storage.schema_version_mismatch` | invalid | 无版本却有表 |
| `storage.schema_structure_mismatch` | invalid | 同号结构不符（已有） |
| `storage.upgrade_pending` | unavailable | 低版本，等升级过程 |
| `storage.upgrade_in_progress` | unavailable | 维护态拒绝的请求 |
| `storage.upgrade_failed` | internal | 这个库升级失败，已放回 |
| `storage.upgrade_no_space` | unavailable | 磁盘不够，没动 |
| `storage.store_too_new` | unavailable | 比程序新 |

插件的段另有两个码，声明在 `packages/plugin-runtime`：`plugin.project_database.upgrade_out_of_scope`（段碰了不该碰的，§2.4）；`plugin.upgrade_steps_unsupported`（装上的插件写了段，U4 移除）。

### 9.2 `SqliteSchemaVersionError`

**拆掉，不留。** #1790 给它写了 `extends Error`，字段 `path, found, expected`。Error 子类只许减少，所以 U1-a 把它换成 `storageErrors.schema_version_mismatch(…)`（`details` 带 `found`、`expected`，路径只放相对 Home 的），数字减 1。消费者 5 个源文件、约 10 个测试文件（`instanceof` 改成看 `code`，`isSqliteSchemaStructureMismatch` 同款）。碰 `project-database.ts`、`server/src/database.ts`，所以排在 02 之后。

### 9.3 兼容标记

`COMPAT_MARKERS` 数 `legacy`、`compat`、`@deprecated`、`backfill`，按文件只许减少（`check-health-gates.mjs:444`，现有 8 个全是误报）。

**机制本身不需要这些词，也不该绕开它们。** 升级段不是兼容读取：升完旧形状就没了，没有分支留在读路径上。词汇就是 `upgrade`、`step`、回填就叫 `run` 或写中文说明。新增标记 0 个，门禁本身验证，U1 不需要任何例外。

如果某一段碰到真的名为 `legacy_*` 的旧列要删：那个词就是事实，不改词、不拼字符串、不搬到 `.sql` 文件。这时回到 §11，由用户决定门禁怎么处理（比如只放过 `upgrades` 字面量内部，同 §11.4 的做法）。SQLite 的 `legacy_alter_table` 用不到，12 步重建不需要。

## 10. 安全不变量

暂定号，合入时按当时的最大号往后排。

| 暂定 | 不变量 | 拒绝测试断言什么 |
| --- | --- | --- |
| S-109 | 升级只在持存储主人锁时跑；没有锁的入口只读、只拒绝，不写库 | 另一个进程持锁时，`runHomeUpgrade` 报 `busy`，所有库文件 sha256 不变，没有 `upgrade/` 目录新增。逐入口：低版本目录库上，`catalogManagementProject`、`configured-models`、`plugin-holders`、`local-uninstall` 的读者不改任何文件、不删戳记；CLI 和 `project-catalog.ts:244` 在锁被占时报 `storage.upgrade_in_progress`，文件不变 |
| S-110 | 比程序新的库和文件不读业务内容、不写 | 版本 +1 的库经全部打开路径和升级过程，主文件 sha256 不变；`browser/sites.json` 版本 +1，保存被拒，文件 sha256 不变 |
| S-111 | 升级快照目录 0700、文件 0600，不含密钥；路径从可信 Home 和描述符推导 | 记录里写 `../../x`、绝对路径或符号链接，放回不发生、目标外文件不变；快照目录里搜不到测试密钥的值；mode 检查 |
| S-112 | 记录被改、外来（Home 身份不符）或指向不存在的单元时拒绝，不照着做 | 改 `home_identity`、改 `relative_path`、改 `to`：不放回，报 `upgrade_failed`，文件不变 |
| S-113 | 放回前核 sha256，放回时先删旁路文件 | 快照被改一个字节：不放回；目标留旧 `-wal`：放回后 `user_version` 是旧的（这条就是 §1 实测的那个坑） |
| S-114 | 维护态监听只绑回环，守 Host/Origin；只答 `/health`，其余 503，不泄露库名 | 非回环 Host、跨源 Origin 被拒；未带挑战的 `/health` 不给证明；业务路径在维护态一律 503 |
| S-115 | 插件的升级段只能碰这个插件自己的表，内置和装上的同一份检查（S-46 的延伸） | 内置插件的段写 `DROP TABLE` 平台表和别的插件的表、`ALTER TABLE "OTHER"`、`DELETE FROM` 别人的表、`CREATE INDEX` 建在别人的表上、`CREATE TABLE x AS SELECT`、`ATTACH`、`PRAGMA writable_schema`、`CREATE TRIGGER`；**文字不变、数据变了的四种：** `ALTER TABLE other DROP COLUMN note` 再 `ADD COLUMN note`，用改名把别人的表换成自己的名字再换回，`DROP TABLE other` 后同样文字重建再补行，删掉账本表 `plugin_project_databases` 后重建改写；**读名字的绕法：** 注释夹在中间、`[other]`、`` `other` ``、大小写不同、带 U+00A0 的名字；**只读第一个词会漏的两种：** `ALTER TABLE main . other DROP COLUMN note` 再加回（插件有张表叫 `main`），`DROP TABLE IF EXISTS other` 后同样文字重建（插件有张表叫 `if`）。全部报 `plugin.project_database.upgrade_out_of_scope`，平台和别的插件每张表的内容摘要、`sqlite_schema` 都不变，这个插件回滚并停用。装上的插件写了段：安装被拒（`plugin.upgrade_steps_unsupported`）；写了不合规的段，先报范围错误 |

## 11. 门禁改动方案（用户 2026-11-06 同意）

这四份都是「改门禁本身」。U1 机制（U1-a～e、g）用测试基线，不碰它们也能合入；第一次真实升版本之前必须改完（U1-i）。

### 11.1 `scripts/gates/initial-versions.mjs`

没接进 `pnpm health:check`，只有单测；不查基线的 `version:`。改法：

- `sourceVersionProblems` 里的常量分两类。持久化格式（`CATALOG_SCHEMA_VERSION`、`FORMAT_VERSION`、`MCP_TOOL_PREFERENCE_VERSION`、`CATALOG_VERSION`、`home-contract` 的 `SCHEMA_VERSION`、`text-search` 的 `SCHEMA_VERSION`、账本、Jelly 的 `schema_version`）：大于 1 只在升级链登记了连续段、并且回放通过时放行。
- 动作、Manifest、提示词、角色：继续全 1，不动（`initialVersionProblems`）。
- 这就是 `CONTRACT-CHANGES.md` §3 说的「由主人的连续升级与回放检查接替」。

### 11.2 `scripts/gates/store-versions.mjs`

- 统一起点之后，CHECKLIST 第 3 节的版本**不许降**。
- 升版本的行，「库版本维护清单」第 4 格从「维护」改成指向升级段：`定义处#from→to`。脚本校验 `old < new`，并且该文件的基线字面量里有 `from: old`。对不上就失败，读不懂也失败。
- CHECKLIST 第 3 节最后一列文字改成「低版本升级，高版本拒绝」（这列不被解析）。第 4 节回填统一起点。

### 11.3 `scripts/verify-release-versions.mjs`

- 读版本这半不改（§1）。
- `checkBaselineCalls` 只认 `applySqliteBaseline`、`openBaselineHomeSqlite`；新增接受基线的入口（升级过程的描述符）要进名单。
- 连续性不放在这里查。字面量解析遇到展开和常量引用很脆，放到 `tests/upgrade-chain-registry.test.ts`：加载真实登记，逐个断言 `from` 从 1 到 `version-1` 各一次。

### 11.4 `scripts/check-health-gates.mjs` 的 `schemaPatches`

- 现在按正则数整个源码里的 `ALTER TABLE|ensureSqliteColumn\(`，基线 0。
- 改成 AST 口径：字符串字面量里的 `ALTER TABLE`，**只有在基线 `upgrades` 属性（或 `PluginDatabaseDeclaration.upgrades`）的初始化表达式里才不算**。别处仍然出现一个就失败，`ensureSqliteColumn(` 不变。
- 这不是放宽就地补表：读路径上的 `ALTER TABLE` 照样红。拼字符串、搬到 `.sql` 这类绕法都不用。
- 带变异用例：把 `ALTER TABLE` 挪到 `upgrades` 之外，门禁必须失败。

`scripts/gates/table-owners.mjs` 也扫 `ALTER TABLE`，不用改：段写在主人的包里就过。

### 11.5 交接

U2-d 的 `tooling/gates/schemas/`（基线结构哈希）补上「改了建库语句却没升版本」这一半，见 [U2 设计](golden-replay-design.md) §5。U1-i 只管「升版本这条路走得通」。

## 12. 要写进「当前保留机制」的一行（成稿，用户 2026-11-06 同意）

`docs/system/CONTRACT-CHANGES.md` 的表要加下面这行，由 U1-a 同一个 PR 写入；本设计稿不改那份文件：

| 机制 | 目的与允许边界 | owner 与移除条件 |
| --- | --- | --- |
| 库与带版本文件的升级链（`SqliteBaseline.upgrades`、`VersionedFile.upgrades`、`PluginDatabaseDeclaration.upgrades`、升级记录、升级快照） | 统一起点之后，让 `n → n+1` 的结构变更不再要求重建 Home。只在持存储主人锁的升级过程里执行，读写路径只认现行版本，不做读时兼容、不做回写回退。比程序新的库只拒绝。起点：第 02 批的统一起点；段的跑法和范围检查对所有插件同一份，唯一的暂时例外是装上的插件写了段在安装时拒绝，移除条件是 U4（用户 2026-11-06 定） | `packages/storage` 负责机制，各库主人负责自己的段。某段在最早支持的金样都用不到时删段；机制随产品保留，不是过渡期 |

同一 PR 还要改 `AGENTS.md`「合同读写都只认现行取值」一条的最后半句（U0 已改过起点，这里补机制入口）。那个暂时例外由 U1-f 记进「2026-10-18 改」清单（§2.4）。

## 13. 证明与验收

### 13.1 UPG-01～21 归属

| 编号 | 归 | 本批交什么 |
| --- | --- | --- |
| UPG-01 | U2-d（门禁），U1-i 先让路走通 | 方案；门禁用户已同意，等重建和第一份金样 |
| UPG-02 | U1 | 交（测试基线上） |
| UPG-03 | U1 | 交；项目库内插件表按 §2.4 |
| UPG-04 | U1 机制，U3 显示 | 交「只有它不可用」的机制和错误码；说明卡归 U3 |
| UPG-05 | U1 不读不写，U3 显示 | 交不读不写 |
| UPG-06 | U1 | 交 |
| UPG-07 | U1 | 交 |
| UPG-08 | U1 规则与测试 | 交规则和假钥匙测试；真实的第一段在 N36、N37 之后 |
| UPG-09 | U4 打开开关，U1-f 交同一份跑法和范围检查 | 内置走通；装上的仍拒绝，移除条件是 U4（§2.4） |
| UPG-10、11、14 | U2 | 脚本（U2-a、b）；金样要等重建 |
| UPG-12、13 | U6 | 不交；U1 留快照和保留期 |
| UPG-15～18 | U5 | 不交 |
| UPG-19 | U1 进度来源，U3 开场那一行 | 交 `/health` 的 `upgrade` 字段和维护态；显示归 U3（D 轨部件，已定样 `mw-bar-status`），桌面的等待归 U1-h |
| UPG-20 | U7 | 不交 |
| UPG-21 | [人工]，跨 U1～U4、U6 | 不交，收尾时做 |

### 13.2 第一次真正升版本之前怎样证明

**不动任何真实基线的版本号。** 全部用测试里的基线（`tests/upgrade-chain.test.ts`），临时 Home：

| 编号 | 证明 |
| --- | --- |
| UPG1-01 | v1→v2→v3：SQL 段、函数段各一；结构与新基线逐表一致；`user_version`、数据都对（UPG-02） |
| UPG1-02 | 段失败、`verify` 失败、结构不符、外键不符、行数变少：都放回，主文件 sha256 等于基准（UPG-03） |
| UPG1-03 | 三个库，第二个失败：第一、三个是新版，第二个报 `upgrade_failed`，其余打开正常（UPG-04 机制半） |
| UPG1-04 | 版本 +1 的库和文件：sha256 不变，只有它报 `store_too_new`（UPG-05 不读不写半） |
| UPG1-05 | 子进程跑升级，在每个状态切换点 `kill -9`：下次启动做完，或放回；任何时刻不存在「戳记已写但还有旧库」（UPG-06）。切换点点名「COMMIT 之后、记 `committed` 之前」：下次启动补记 `committed`，不重跑段，不放回（§6） |
| UPG1-06 | 带版本文件 v1→v2，含失败放回；`browser/sites.json` 高版本不被覆盖（UPG-07） |
| UPG1-07 | 假 `SecretStore`：`group` 里密钥文件和密文库一起升，第二个失败时一起回去；升完全部读得出（UPG-08） |
| UPG1-08 | 戳记相符时 `runHomeUpgrade` 打开 0 个库（用计数连接工厂断言）；`too_new`、`failed` 时不写戳记；空 Home 不写戳记（§3.3）；手工放回旧库：持锁进程打开报 `upgrade_pending` 并删戳记，下次启动升完；不持锁的读者不删（§3.3）；N56 调用预算用例加一行 |
| UPG1-09 | `kill -9` 留下热 WAL 时、只读开过留旁路文件时，快照前的 checkpoint 把它们清干净；清不掉就 `failed` |
| UPG1-10 | 项目库：平台段成功、一个插件段失败：这个插件停，这个插件每张表的内容摘要和结构摘要都与升级前相同，其余插件和平台表是新版（§2.4） |
| UPG1-11 | 维护态：`/health` 503 带 `upgrading`，证明可验；业务路径 503；升级完 `/health` 变 `ok`（§4.2） |
| UPG1-12 | 真实基线的登记里 `from` 连续（现在全是空，测试仍然跑，第一次升版本时自动有内容） |
| UPG1-13 | 低版本目录库、宿主没起：CLI 就地升完并完成命令；`cli-project-maintenance` 升完并完成；MCP 生产路径拉起宿主、等到升完，20 秒没等到报「正在升级」；MCP `:65` 路径升完；purge 照常清除；`home snapshot` 被拒；Home 外的项目库报 `upgrade_pending`。`store_too_new` 的目录库：以上都不取锁升级、不拉宿主、文件不变（§4.3） |
| UPG1-14 | 插件的段：`ADD COLUMN`、回填、新表加索引、重建表（新表、拷贝、删旧表、改名）、改列名都走通，结构与声明一致；S-115 的每一种写法都在执行前被拒，含文字不变、数据变了的四种；重建 `ON DELETE SET NULL` 和 `CASCADE` 子表的父表，子表原值都在；段真的删了父表的行，`foreign_key_check` 回滚；段真的删一张表，`foreign_key_check` 不报 `no such table`，段新建的表也查得到；段成功和失败之后，这条连接的 `foreign_keys` 都回到 1；Home 库的段走同一个函数；只有一处判断区分内置和装上的（用例数这个判断的调用点） |

`tests/storage-baseline.test.ts`、`private-store-versions`、`characters-schema` 等断言「拒绝」的约 55 行／26 个文件，不删断言：低版本从 `SqliteSchemaVersionError` 改成断言 `storage.upgrade_pending`（打开路径确实还是拒绝）；高版本改成断言 `store_too_new`；无版本有表、同号结构不符不变。不放宽任何一条。

## 14. 第一段真实升级落下来的时候

第一段真实升级要同时满足：U1-a～e、g、h 合入；U1-i（门禁）合入；统一起点已做；第一份金样（U2-c）已在。从那时起，§8.1 的规则生效，段随基线走。

**第一批段是资料目录那几张表（用户 2026-11-06 定）。** 真实 Home 不等 05② C-1：#1837 合入就按检查单重建。所以 `workspaces.is_default` 改 `roles`、默认输出目录那一行、删 `project_browsing_settings`、新增 `material_recent_uses` 都不再进第 1 版，走本机制的升级段；这几段用户已同意，写的时候不用再问。它们由 05② 的实现片写，那一片排在 U1 和 U2-c 之后，等上面这些条件都满足。`modules/projects` 现在没有升级段（#1805 第 6 条），这一片先给它登记第一段。组合服务的纠正表属第 15 批，到时同样走升级段，同样不再问。

这也是机制的第一次实战，U1、U2 和四份门禁接不接得上，从这几段就能看出来。

**裁段**：某段在最早支持的金样都不再需要时可以删，删之后读到更旧的版本报 `upgrade_failed`。M1 之前没有外部用户，规则先写着不执行；M1 后另定最早支持的版本。

## 15. 分片

写手档位：机制片要拿主意，用 Opus 5.5 high；动共享核心、密钥和跨模块的（U1-d、U1-e）同样用 Opus 5.5 high；其余清单片照设计接线，用 Sonnet 5.5 high。

| 片 | 内容 | 主要文件 | 验收 | 档位 | 前置 |
| --- | --- | --- | --- | --- | --- |
| U1-a 分类与段 | `SqliteUpgradeStep`、`checkSqliteBaselineVersion` 分类、错误码、拆 `SqliteSchemaVersionError`、单库跑法（无快照） | `packages/storage/src/{sqlite-baseline,sqlite-upgrade,index}.ts`、`README`；消费者约 10 个文件；`docs/system/CONTRACT-CHANGES.md` 一行 | UPG1-01 | Opus | **#1790 合入** |
| U1-b 快照与放回 | 升级快照、放回、磁盘检查 | 新 `packages/storage/src/upgrade-snapshot.ts`；`snapshot-sqlite.ts` 不改语义 | UPG1-02、09；S-111、S-113 | Opus | U1-a |
| U1-c 过程、记录、戳记、入口 | `runHomeUpgrade`、`ensureHomeUpgraded`、`acquireUpgradedHomeOwner`、记录、戳记及自愈（§3.3）、`upgrade/` 登记；§4.3 三个取锁点和 CLI、MCP `:65` 的包装 | 新 `apps/local-host/src/home-upgrade*.ts`、`home-storage-lifetime.ts`、`project-catalog.ts`、`installer/{uninstall-owner,uninstall}.ts`、`cli-project.ts`、`mcp-v1-tool.ts`、`management-action-client.ts`、`home-stores.ts`、`docs/system/HOME-DATA.md`；`packages/storage` 的 `onUpgradePending` | UPG1-03、04、05、08、13（CLI、maintenance、purge、snapshot 部分）；S-109、S-110、S-112 | Opus | U1-b；**宿主启动是规则 4 枢纽，认领板预警** |
| U1-d 平台库接入 | 全部描述符；目录库适配；项目库；Alchemist；两个可重建库；收 §2.5 的手写检查；约 55 行测试改断言 | `apps/local-host/src/{project-database,catalog-schema,project-catalog,installed-plugin-libraries,home-plugin-store,alchemist-search}.ts`、`plugins/native/alchemist/src/index.ts`（E 轨预警）、`server/src/database.ts`、`memory-ledger.ts`、`tests/` | UPG1-12；§13.2 末段；§2.3 的两份 SQLite 不变量 | Opus 5.5 high | U1-c；**02 收尾**（#1837 还在改 `home-store-snapshot.ts`） |
| U1-e 带版本文件 | `VersionedFile`、§2.6 的文件；修四个吞错的读路径；密钥段规则与测试 | `packages/storage/src/versioned-file.ts`、`adapters/file-secret-store.ts`、`modules/shelf/src/catalog.ts`、`apps/local-host/src/{mcp-settings-store,model-configuration,browser/browser-surfaces,computer/computer-settings,computer/computer-records}.ts`、`installer/home-files.ts` | UPG1-06、07 | Opus 5.5 high | U1-c；Shelf 属 E 轨，Jelly 文件在宿主；预警 |
| U1-f 插件表合同与范围检查 | `PluginDatabaseDeclaration.upgrades`、`HomeStoreDeclaration` 的段；§2.4 的三层检查和跑法，对所有插件同一份；装上的插件写了就拒绝（唯一的开关）；记进「2026-10-18 改」清单 | `packages/contracts/src/platform/plugin-database.ts`；`tooling/gates/api/contracts/platform/{plugin,plugin-registration}.txt`、`plugin-sdk/index.txt`；`packages/plugin-runtime/src/project-database.ts`、新 `plugin-upgrade-steps.ts`、`apps/local-host/src/project-plugin-databases.ts`；`docs/system/SECURITY-INVARIANTS.md`（S-46、S-115）；`specs/archive/repository-anti-corruption/spec.md` §1 | UPG1-10、14；S-115 | Opus 5.5 high | U1-c；**公共合同队列**（§15.1）；用户 2026-11-06 已定 |
| U1-g 维护态 | `planHomeUpgrade`、`runUpgradeMaintenance`、Worker、`/health` 新状态、MCP 映射 | `apps/desktop/launchers/web/server.ts`、新 `apps/local-host/src/upgrade-maintenance.ts`、`mcp-resident-health.ts`、`mcp-resident-start.ts`、`installer/web-service-platform.ts` | UPG1-11、13（MCP 生产路径）；S-114 | Opus | U1-c |
| U1-h 桌面等待 | `web_identity` 验证 503 的 `upgrading`，`web_service.rs` 见到就不算超时 | `apps/desktop/adapters/tauri/src/{web_identity,web_service}.rs` | Rust 单测：`upgrading` 不被杀，无 `upgrading` 仍 8 秒 | Sonnet | U1-g；**F 轨独占**，由 F 落 |
| U1-i 门禁 | §11 四份 | `scripts/gates/{initial-versions,store-versions}.mjs`、`scripts/verify-release-versions.mjs`、`scripts/check-health-gates.mjs`、`docs/releases/CHECKLIST.md`、`tooling/gates/README.md` | 变异用例 | Opus | U1-a；用户 2026-11-06 已同意；在第一段真实升级之前 |
| U1-j 结构比较记忆 | §3.2，可晚做 | `packages/storage/src/sqlite-baseline.ts` | 文件变了就重比的拒绝测试；N56 预算 | Sonnet | U1-d |

U1 的机制代码（U1-a～c）不动任何真实基线的版本，合入时用户没有感觉。

### 15.1 和别的片的先后

核实过共用文件，不是抄「串行」：

- **C-1（05②）**：只改合同与快照（`contracts/modules/projects`、新 `platform/project-materials`、`services/agent-host`、`host-actions.tsv`）和 `modules/projects`。**不碰 `packages/storage`，和 U1-a～e 没有共用文件**，合同片不等 U1。U1-f 碰 `platform/plugin.txt`、`platform/plugin-registration.txt`、`plugin-sdk/index.txt`，和 C-1 也不撞。**动表的部分不随合同片落**：重建不等 C-1（用户 2026-11-06 定），`material_recent_uses` 等挪到 05② 的实现片，走升级段，那一片排在 §14 的条件之后。
- **08 C-1、05② C-2**：都碰 Manifest 和 `plugin-sdk/index.txt`。U1-f 排队列，共用的快照上不固定先后，同一时间一个 PR，谁先准备好谁先：`index.txt` 和这两片、N22-01 一前一后，`platform/plugin.txt` 和 N22-01、N22-02 一前一后（统筹 11-07 定，见[动作输入类型 §8.4](../action-input-contracts/spec.md)）。它们只共用生成的快照，没有语义依赖；首次改插件表结构才真的需要 U1-f，所以它不抢位，也不让别的片等它。
- **SQLite 第二步**：真实重叠是 `packages/storage/src/snapshot-sqlite.ts`、`sqlite-baseline.ts`。U1-a、b 先合，理由是第二步要换这两个文件里的驱动类型；反过来先换驱动，U1 要在新接口上重写错误判断。U1 新代码只用 `exec`、`prepare`（`SqliteBaselineDatabase`）和 errcode 判断，第二步几乎不用碰它。**U1-c 之后的片和第二步不共用文件，可以并行。**
- **U2**：U2-a、b 和 U1 共用同一份 `homeStores()` 枚举，改的文件不重叠（`scripts/`、`tests/`），但都读快照那套。U1-a 之前 U2-a 就能写，见 U2 设计 §8。转储器放 `packages/storage`，要写在窄接口上。
- **02**：U1-a 必须等 #1790。#1837 改 `home-store-snapshot.ts`、`file-secret-store.ts`，U1-d、e 排在它之后。

### 15.2 跟进（不在 U1）

- `computer/` 不在 `homeStores()` 里：现有 Home 有这个目录时，离线快照报 `unknown_data`。`config/external-mcp-actions.json`、`config/connector-mcp-actions.json` 同样没登记。这是现成缺陷，和升级无关，主会话记 BL；U2 的覆盖面也要管它们。
- `HOME-DATA.md` 与代码对不上的几处（核账第二节）在 U1-c 顺手只改升级相关的一行，其余另算。

## 16. 不在本设计里

- 说明卡、开场那一行、首页结果卡（U3）；打开装上的插件的开关（U4）；合同过渡期（U5）；副本演练、回到上一版（U6）；导出导入（U7）；金样（U2）。
- 真实基线的任何版本号变化；真实 Home。
- 换 `node:sqlite`（路线书第 05 批第 3 项，SQLite 第二步，设计另写）。
