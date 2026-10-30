# FI-5 Feed 的表和 Module 代码归 Feed 设计稿（PG-087 的 Feed 半、X-5 余半）

状态：设计稿（2026-10-25），等统筹审；审过再实现，本稿不改代码。事实在 `claude/ac-feed-inbox-designs`（含 batch-37）上读代码核的，没跑过。父稿 [feed-inbox-runtime.md](feed-inbox-runtime.md) §3 D1 已定走路 1（四个包并进 Feed，存储层吃最小的同步接口）；本稿只写这一片怎样做，不重开方向。

**先说两件事**：

1. **FI-5 不依赖 FI-6，可以先落**。Feed 的表声明和 Module 代码搬家，都不要求 Feed 先成为 Runtime 插件：内置 Manifest 的 `databases.project` 声明在项目库打开时由平台应用，不管插件是不是由监督器装配（`FEED_PROJECT_DATABASE` 今天就是这样生效的，Goals S8 同）。所以拆片稿 §4 里 FI-5 对 FI-6 的先后关系保持「FI-5 先、FI-6 后」，本稿的接口形状（§3.2）专门为 FI-6 留好接口。
2. **这一片动真实 Home 的库形状（基线 v10 → v11）**，要走一次用户安排的维护；PR 开头必须写「合入前要用户定维护时段」（§4）。

## 1. 现状

### 1.1 四个包与 11 张表

| 包 | 行数 | 表 | 访问方式 |
| --- | --- | --- | --- |
| `modules/feed`（`@molis-ai/molis-work-module-feed`） | 816（8 个文件） | `feed_items`、`feed_materials`、`feed_item_events`（后者外键指 `feed_items`） | 构造时 `db.exec(FEED_SCHEMA_SQL)`；`prepare(` 22 处；`FeedSqliteDatabase = { exec, prepare, transaction }` |
| `modules/sources`（`…-module-sources`） | 391 | `feed_sources`、`source_events` | 构造时 `db.exec(SOURCES_SCHEMA_SQL)`；`prepare(` 11 处，`transaction(` 2 处 |
| `modules/signals`（`…-module-signals`） | 371 | `signals`、`signal_revisions`、`signal_events` | 构造时 `db.exec`；`prepare(` 11 处 |
| `horizontal/listener-host`（`…-service-listener-host`） | 780 | `listener_instances`、`listener_deliveries`、`feed_source_runs` | 纯函数，没有构造器；`db.exec(LISTENER_HOST_SCHEMA_SQL)` 由 `feed-application.ts` 调；`prepare(` 24 处 |

合计 4 个包、约 2360 行、约 68 处 `prepare(`、11 张表加 11 条索引（其中 2 条唯一索引）。外键都只指 `project_root` 或本包自己的表，没有一条指别的所有者的表，所以能原样放进 `databases.project`（声明只允许 `CREATE TABLE/INDEX`，外键只许指自己的表和 `project_root`）。四份 schema 里没有触发器、视图、`PRAGMA`。

基线 `PROJECT_DATABASE_BASELINE`（版本 10，`apps/local-host/src/project-database-schema.ts`）今天用 `SOURCES_SCHEMA_SQL`、`SIGNALS_SCHEMA_SQL`、`LISTENER_HOST_SCHEMA_SQL`、`FEED_SCHEMA_SQL` 建这 11 张表。Feed 自己已声明的只有 `feed_out_rules`（`FEED_PROJECT_DATABASE`，`store_name: "feed"`，版本 1）。

### 1.2 谁在用这四个包（`git grep`，不含 `specs/`、`docs/`）

- 生产代码：只有 `apps/local-host` 的五个文件——`feed-application.ts`、`feed-connector-sync.ts`、`feed-history-release.ts`、`connector-source-state.ts`、`project-database-schema.ts`。`SignalsModule` 在生产里只有 `feed-connector-sync.ts` 一处，交给 `ListenerHost`。四个包除了 Feed 一族没有别的使用方。
- 11 张表的 SQL 在这四个包之外**没有**（`git grep` 在 `apps/`、`plugins/` 里零命中），所以没有别的包在直接写这些表。
- 登记处：`scripts/workspace-packages.mjs`（4 条）、`packages/test-kit/tests/boundaries.test.mjs`（第 366、401～402、486～492 行）、`scripts/check-package-boundaries.mjs:237`（listener-host 路径）、`tooling/gates/error-owners.json` 第 209～210 行（listener-host 的目录）、`apps/local-host/package.json` 与根 `package.json` 的依赖、`spec.md` §5.1 的包清单四行。
- 测试：9 个测试文件 import 这些包（`feed-receive-chain`、`feed-sync-authority`、`feed-module-repositories`、`functions-feed-module-exits`、`integration-pagination`、`owner-readers`、`plugin-runtime-integration`、`context-ledger`、`context-owner-isolation`），都是浏览器无关的，在 FI-5 里改 import 路径。

### 1.3 不搬的

- **Attention**（`ATTENTION_SCHEMA_SQL`）和**情境账**（`CONTEXT_LEDGER_SCHEMA`）：S9-0b 之后它们是平台服务（`services.attention`、`services.contextLedger`，已进 main），表仍在基线，归平台。Feed 的 Module 代码里对它们的调用（`AttentionModule`、`createContextLedger`）FI-5 **不动**，等 FI-6 换成服务。
- **公开合同**（`packages/contracts` 里的 `modules/feed`、`modules/sources`、`modules/signals`、`services/listener-host`）：形状是对外的，留在 contracts；Feed 插件包今天已经在 import 它们。已由 [pg111-feed-contracts](pg111-feed-contracts.md) 取代：合同搬进了 Feed 插件包，平台只留拉取与适配器的形状。

## 2. 目标形状

- `plugins/native/feed/src/store/` 下四块：`items/`（原 `modules/feed`）、`sources.ts`、`signals.ts`、`listener.ts`。四个 workspace 包删除。
- 存储层不拿 `better-sqlite3` 的 `db`，拿一个最小的同步接口（§3.2），**构造时不再 `exec` 任何建表语句**——表由平台按 Manifest 声明建。
- Feed 的 `databases.project` 声明从只有 `feed_out_rules` 扩成 12 张表（版本 1 → 2）。基线不再建那 11 张表（版本 10 → 11）。
- 项目库里这 12 张表被拒（版本或形状不符）时，只停 Feed，不拖别的插件（`projectPluginDatabaseRefusal` 已是这样）。

## 3. 设计

### 3.1 搬家的顺序（一个 PR 里的几步，每步都能单独测）

1. 先把四个包的源文件原样搬进 `plugins/native/feed/src/store/`，import 路径改完，**不改任何一行 SQL 和逻辑**，现有测试原样过（只换 import）。这一步是纯搬迁，评审时可以只看 `git diff -M` 的重命名。
2. 再把存储访问换成最小接口（§3.2），去掉构造时的 `db.exec(…SCHEMA_SQL)`。
3. 再写声明（§3.3），删基线里的四份 schema 引用，基线升到 11（§3.4）。
4. 最后删四个包、清登记处（§1.2 的清单），用 `node scripts/gates/package-inventory.mjs --table` 重生 `spec.md` §5.1 的行，`node scripts/package-owners.mjs --write`，`pnpm api:update`（若包名出现在公开 API 快照里）。

### 3.2 最小的同步接口

```ts
/** What Feed's store reads and writes through. Synchronous, like both sides of it. */
export interface FeedSql {
  get<Row = Record<string, unknown>>(sql: string, ...params: unknown[]): Row | undefined;
  all<Row = Record<string, unknown>>(sql: string, ...params: unknown[]): Row[];
  run(sql: string, ...params: unknown[]): { changes: number };
  /** Runs `operation` atomically; nested calls join the outer one. */
  transaction<T>(operation: () => T): T;
}
```

- **FI-5 里的适配器只有一个**：`fromBetterSqlite(db)`，`prepare(sql).get/all/run`、`db.transaction(op).immediate()`，宿主今天的 `createLocalFeedApplication(db)` 和 9 个测试用它。对外行为不变。
- **FI-6 再加第二个**：`fromPluginTransaction(tx)`，`PluginDatabaseTransaction` 的 `get/all/run` 同样是同步的。这就是为什么接口只有这四个：是 `PluginDatabaseTransaction` 与 better-sqlite3 的交集。`transaction()` 在这一个适配器里是「已经在事务里，直接执行」，因为平台的事务由 `database.transaction(beforeEffect, write)` 在 Module 之外开。
- **一个 FI-6 的约束先在这里定下**：今天的 `FeedModule`、`SourcesModule`、`SignalsModule` 是长生命周期对象（构造一次，持有 `db`）。`project_database` 的写只能在 `write(tx)` 回调里，读也只在受检客户端上。所以 Module 的类要能在每次调用时用一个 `FeedSql` 现建（构造器应只存引用、不做 I/O），不得在字段里缓存语句或连接。FI-5 的存储层就按这个写：构造器只收 `FeedSql` 和选项。我只数了 `prepare(` 的个数，没逐个核对哪些语句或对象在构造时就建好并缓存；实现第 2 步时逐个核对，结果列在 PR 里。
- 受检客户端只放行声明过的对象（S-46）：Module 里**所有**引用的表名必须都在声明里。四个包里读 `sqlite_master` 的只有一处：`modules/sources/src/index.ts:84`（`SELECT name FROM sqlite_master … 'feed_sources'`，判断表在不在）。`sqlite_master` 不在声明里，受检客户端会拒；FI-5 把这句换掉——声明保证表一定在，要么去掉，要么由平台的拒绝状态（`projectPluginDatabaseRefusal`）承担。

### 3.3 声明

`plugins/native/feed/src/database.ts` 的 `FEED_PROJECT_DATABASE`：

```ts
export const FEED_PROJECT_DATABASE: PluginDatabaseDeclaration = {
  store_name: "feed",
  version: 2,
  schema: [FEED_OUT_RULES_SCHEMA_SQL, FEED_ITEMS_SCHEMA_SQL, SOURCES_SCHEMA_SQL, SIGNALS_SCHEMA_SQL, LISTENER_SCHEMA_SQL].join("\n"),
  read_permission: "storage:private",
  write_permission: "storage:private",
};
```

- **一个声明、一个 `store_name`**。Manifest 的 `databases.project` 是单个对象，Feed 本来就是一份；12 张表的所有权都是 Feed 的，没有理由拆。
- 表名、列、约束、索引、`IF NOT EXISTS` 与原来**逐字相同**；数据不动，不重命名任何表（Goals S8 同法）。唯一允许的差别是 schema 字符串的拼接位置。
- 权限：`storage:private`，与现有 `feed_out_rules` 一致。Feed 的 Manifest 里本来就声明了。

### 3.4 基线 v10 → v11 与真实 Home 的维护

- `PROJECT_DATABASE_BASELINE.version` 10 → 11，数组里去掉 `SOURCES_SCHEMA_SQL`、`SIGNALS_SCHEMA_SQL`、`LISTENER_HOST_SCHEMA_SQL`、`FEED_SCHEMA_SQL`；文件头注释加「Feed 的表也不在这里：Feed 声明它们（FI-5）」。
- **新库**：以 v11 出生，Feed 的声明在第一次打开时由平台建表、写 `plugin_project_databases` 的 `feed` 行（版本 2，`tables_json` 列 12 张表）。
- **存量库（真实 Home）**：基线只认现行版本，不读取时兜底（`AGENTS.md` 硬约束）。所以 v10 库要**维护一次**：停宿主、整份备份后，对每个项目库在一个事务里：把 `PRAGMA user_version`（基线版本存在这里，`packages/storage/src/sqlite-baseline.ts`）改为 11，把 `plugin_project_databases` 里 `feed` 那一行从版本 1 改为 2、`tables_json` 改为 12 张表。**表和数据一行都不动**，因为 11 张表本来就在库里。这是一次只改两处记录的维护，没有数据搬迁。
- 夹具与演练，照 `tests/project-maintenance-v10.test.ts`、`tests/fixtures/project-maintenance-v9.sql` 的做法：`tests/fixtures/project-maintenance-v10.sql`（一个真实形状的 v10 库，含 Feed 的各类行）、`tests/project-maintenance-v11.test.ts`（维护后库按 v11 打开，Feed 的数据逐行相等，`feed` 声明行是版本 2，Feed 不被拒，其余插件的声明行不变；维护前的库被 v11 的宿主拒绝打开，而不是被悄悄升级）。
- `docs/releases/CHECKLIST.md` 加一行「项目库 v10 → v11（Feed 的表归 Feed 声明，FI-5）」，措辞与已有 v8/v10 两行同口径；**时段归用户**，与 W5-17 同一次维护窗口排（见 §5 要用户定的事）。
- **版本号 v11 是暂定的**：Goals S9-2、PG-017 P2e 等分支也可能动基线。合入顺序决定最终号，号冲突时后合入的顺延，测试文件名与 CHECKLIST 行跟着改。

### 3.5 其余清理

- `feed-application.ts` 里 `db.exec(LISTENER_HOST_SCHEMA_SQL)` 删。
- 四个包的 README（「开发要求」）随文件搬进 `plugins/native/feed/README.md` 的对应小节：负责与不负责、不变量、改完必跑的测试一并带过去，`pnpm boundary:check` 校验 README 的开发要求。
- `tooling/gates/error-owners.json` 的 listener-host 目录条目：listener 的错误码主人名随目录移到 `plugins/native/feed/`，按「`plugins/native/<目录>/` 的主人名就是目录名」，原来 `listener` 前缀的码要不要改名是个小问题，见 §5。
- `packages/test-kit/tests/boundaries.test.mjs` 列出这四个包的几处：包没有了，对应用例改成对 Feed 内部目录的断言（Feed 的 `store/` 不得 import `better-sqlite3`、`@molis-ai/molis-work-storage`）。

## 4. 验收（暂定号）

- **RAC-496**：声明与旧基线逐表同形。同一份 schema 两种建法——v10 基线建出的库，与 v11 基线加 Feed 声明建出的库——比较 `sqlite_master` 里 11 张表与 11 条索引的 `sql` 逐字相等（去掉声明新增的 `feed_out_rules` 之外的差别为零）；基线 v11 不再建这些表（只有基线的库里 `feed_items` 等不存在），声明建出的库里在；v10 库被 v11 宿主拒绝打开。`tests/feed-store-declaration.test.ts`。
- **RAC-497**：被拒只停 Feed。把一个项目库里 `feed` 声明行改成版本 1 或让表形状不符，Feed 的动作报「库被拒」，同一个库里 Goals 与别的插件不受影响，项目照常打开；基线不再有这 11 张表，所以没有「基线建了它又被声明覆盖」的情形。`tests/feed-store-declaration.test.ts`；维护演练 `tests/project-maintenance-v11.test.ts`（记录改动、数据逐行相等、旧库被拒）。
- **RAC-498**：四个包没有了，Feed 的存储层只经 `FeedSql`。`workspace-packages.mjs` 没有这四条，`apps/local-host`、测试不再 import 它们（门禁：包清单表与登记表一致，`package-inventory`）；`plugins/native/feed/src/store/` 不 import `better-sqlite3`、`@molis-ai/molis-work-storage` 的连接类型；存储层构造器不执行建表语句（测试：对一个**没有这些表**的 `FeedSql` 构造 Module 不报错、不建表）；9 个原 import 这些包的测试改路径后原样过（断言不放宽）。

另有搬迁等价性的证据，不单独编号：搬迁那一步（§3.1 第 1 步）完成时，跑一遍 §6 的必跑文件，之后每一步结束再跑，PR 里写每一步的结果。

## 5. 不在本片，以及要用户定的事

- **要用户定的事（一件）**：真实 Home 的项目库 v10 → v11 维护时段。与 W5-17 同一次，所以本 PR 与 W5-17 分支的 PR 都以「合入前要用户定维护时段」开头。维护脚本和夹具在本片里写好并演练，实际执行归用户。
- **不在本片**：Attention 与情境账的换成服务（FI-6）；Feed 成为 Runtime 插件、去掉 9 处构造点（FI-6）；`/api/feed*` 边与客户端（FI-6、FI-7）；Feed 的 Home 引用账（FI-4，随 FI-6）。
- **一个小问题，不挡审**：listener 的错误码前缀（`listener.*`）搬进 Feed 目录后，按错误模型「不以所在文件主人名开头的错误码」门禁要记数。推荐：这一片**只**让主人表把 `plugins/native/feed/` 的目录归 `feed`，listener 的码保留为平台码层面的 `listener.*`（`ACTION_ERROR_KINDS` 里有行的才算平台码，不在其中则要登记主人）。实现时先看门禁报什么，需要改名就改成 `feed.listener_*`，算合同改，按 `CONTRACT-CHANGES.md`。

## 6. 号段、必跑文件、开工前核对

- 号段：RAC-496～498（RAC-480～519 本线号段内，统筹 10-24 定）。BL 不新增。
- 必跑（非浏览器，测试槽、`--jobs 1`）：上面 9 个原 import 文件、`tests/feed-store-declaration.test.ts`、`tests/project-maintenance-v11.test.ts`、`tests/project-database-baseline.test.ts`、`tests/project-plugin-database-refusal.test.ts`、`tests/plugin-project-database.test.ts`、`tests/plugin-project-database-ledger.test.ts`、Goals S8 的先例用例 `tests/goals-project-database*.test.ts`、动作合同快照 `tests/action-contract-snapshot.test.ts`、内置装配门禁 `tests/builtin-plugin-assembly-gate.test.ts`；门禁 `boundary:check`、`check-health-gates --base origin/main`、`secrets:check`、`package-inventory --table`、`package-owners --write`。
- 开工前核对：`git log origin/main -- modules/feed modules/sources modules/signals horizontal/listener-host apps/local-host/src/project-database-schema.ts` 有没有在途 PR 碰；基线版本号现在是不是还是 10（别的分支可能已改）；§1.2 的 grep 再跑一次。

## 7. 实现记录（与上文的差别，FI-5 实现时补）

- **语句逐个核对（§3.2 欠的那一项）**：四个包里 `prepare(` 的真实调用共 63 处（Feed 条目 21、Sources 9、Signals 10、Listener Host 23，另有 4 处是接口声明、1 处是 `sqlite_master` 检查），全部改成 `db.get/all/run(sql, …params)`；没有任何一个语句或对象在构造器里建好并缓存（原来唯一的游离语句是 `persistListenerDeliveries` 里的 `insert`，现在是常量 `INSERT_LISTENER_DELIVERY_SQL` 加 `db.run`）。构造器不再 `db.exec` 建表（4 处）。
- **`fromBetterSqlite` 有两个签名**：带 `transaction` 的句柄得到完整的 `FeedSql`；只能 `prepare` 的句柄（`feed-history-release.ts` 的 `Pick<Database, "prepare">`）得到去掉 `transaction` 的读写接口。`transaction` 用 `.immediate()`，与原来的 `db.transaction(op).immediate()` 同。
- **`sqlite_master` 的检查搬到宿主**：`refreshSourceConnectionState` 不再自己问「`feed_sources` 在不在」（它按声明表一定在）；`apps/local-host/src/connector-source-state.ts` 遍历目录库里所有项目库，其中还没被 Feed 声明建出表的库（没打开过的新项目）在宿主那一侧跳过。这是宿主自己的连接，不经受检客户端。该文件随 FI-6、FI-4 删除。
- **被拒只停 Feed（RAC-497）曾靠 `feedSql(db)`**：`feed-application.ts` 导出的包装在每次读写前断言项目库拒绝（逐次断言函数，T-286 已删），库拒绝了 Feed 的声明就抛那个拒绝，而不是「no such table」。以前「出规则的表被拒、其余 Feed 照常」的写法（`projectPluginDatabaseRefusal(...) ? {} : { outRules }`）仍在：被拒时出规则列表是空，快照/来源/条目的路径抛拒绝。（2026-10-28 补：FI-6 删了 `feed-application.ts`，这一层随之没有了；被拒的 Feed 由项目插件监督器不启动，动作不进目录，由 `tests/project-plugin-database-refusal.test.ts` PLIB-04 的 Feed 一例证明，`feed-store-declaration` 的 RAC-497 只留库这一层。2026-10-30 补：T-286 删掉那个没有调用方的逐次断言函数，被拒只停它自己由启动时的 `withoutRefusedPlugins` 与 RAC-497 守着。）
- **常量改名**：`FEED_SCHEMA_SQL` → `FEED_ITEMS_SCHEMA_SQL`（与 `FEED_OUT_RULES_SCHEMA_SQL` 并排）、`LISTENER_HOST_SCHEMA_SQL` → `LISTENER_SCHEMA_SQL`，只在包内与声明里用。
- **原 import 这些包的 9 个测试**只改了 import 路径和 `fromBetterSqlite(…)` 的包装；`context-ledger.test.ts` 的测试台自己造库，所以多一行 `db.exec(FEED_ITEMS_SCHEMA_SQL)`（表是声明建的，存储层不再建）。断言一条没改。
- **随基线 v11 改的既有测试**：`project-database-baseline.test.ts`（版本 11、Feed 账本版本取声明的版本、PLIB-02 里 `boards → project_root` 改名后外键按表和列重排，否则 Feed 的两个外键顺序对不上）、`project-maintenance-v8/v9/v10.test.ts`（链子末端多一步 v11；v10 的结果拿 v10 夹具比，而不是现行基线）。
- **号**：RAC-496～498 用于 `tests/feed-store-declaration.test.ts`；维护演练的用例号是 RAC-497、RAC-514（FI-6 稿里的维护演练号）。
