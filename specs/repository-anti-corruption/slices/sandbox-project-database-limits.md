# 沙箱插件项目库语句的上限

状态：执行中（2026-10-23）。BL-395 的一半：行数、字节与递归的上限已做；耗时与单个值内存的上限没有可靠的主线程做法，记为 BL-480。

验收编号：RAC-200～RAC-205（本文件第 3 节）。

## 1. 目标与事实

沙箱插件经 broker 的 `sdk.projectDatabase` 语句，交给宿主的 `services.project_database` 客户端后，由 better-sqlite3 在宿主主线程上同步执行。逐句检查（S-46）只管语句碰得到哪些表，不管跑多久、结果多大。

核过的事实（better-sqlite3 12.8.0，SQLite 3.51.3）：

- 编译选项带 `SQLITE_OMIT_PROGRESS_CALLBACK`，包装里没有 `sqlite3_interrupt`、`sqlite3_limit`、授权回调（`Object.getOwnPropertyNames(Database.prototype)` 里没有）。主线程里没有办法在语句跑着时停它，也没有办法把单个值限在 1 GB 以下（`SELECT length(zeroblob(500000000))` 直接成功，`hex(zeroblob(1e8))` 让进程常驻内存涨到约 350 MB）。
- `Worker.terminate()` 停不了原生调用（实测：工作线程里跑一句 40 亿次的递归计数，300 ms 后 `terminate()`，4 秒后 `exit` 事件仍没来），语句会一直占着一个核，所以 BL-395 原先写的“工作线程加终止”不成立。
- 可以由 SQLite 自己说出来的、能证明的：`EXPLAIN QUERY PLAN` 对递归查询（CTE 读自己，写不写 `RECURSIVE` 都一样）固定输出 `SETUP` 与 `RECURSIVE STEP`。外层 `LIMIT` 会让子查询只被取到那么多行（不带聚合与排序时递归也在那里停）。

## 2. 做什么

1. **递归查询一律拒**（`packages/plugin-runtime/src/project-database-statements.ts` 的 `recurses`）：逐句检查在步骤名单之后再读一次 `EXPLAIN QUERY PLAN`，有 `RECURSIVE STEP` 就以 `plugin.project_database.statement_refused` 拒绝，语句不运行。对所有拿 `services.project_database` 的插件一样（宿主进程里的插件挂住主线程和沙箱插件一样严重）；今天 Schedule、Coding 的语句没有递归。
2. **沙箱的读把行数限在语句里**（`packages/plugin-sandbox/src/database.ts` 的 `bounded`、`sandboxDatabase.all`）：以 `SELECT`/`WITH` 开头的读被包成 `SELECT * FROM (<语句>\n) LIMIT 1001`，宿主至多建 1001 行；超过 1000 行或 512 KiB（文本与数字的字节）是 `sandbox.database_result_too_large`。不以读开头的语句不包，原样交给客户端，被关键字拒，和以前一样。
3. **读语句里不带 `/* */`**：块注释能吞掉包装的括号和 `LIMIT`（`SELECT 1) UNION ALL SELECT … /*`），所以读里出现就在通道一侧以 `sandbox.invalid_request` 拒；需要这段文字的，用参数传。`--` 行注释没有这个问题（包装在注释后面换行再收括号）。
4. 一个能看到的变化：重复的列名在子查询里被 SQLite 改成 `名字:1`，沙箱读 `SELECT a.id, b.id …` 得到 `{ id, "id:1" }`，不再是后一个盖前一个。

## 3. 验收

`tests/security-invariants-sandbox-project-database-limits.test.ts`（进 `pnpm test:security`，S-46 一行引用；真文件库，不用 Seatbelt，Linux 也跑）：

| 编号 | 断言 |
| --- | --- |
| RAC-200 | 1500 行的表，`SELECT … ` 被拒（`sandbox.database_result_too_large`），宿主只建了 1001 行；自带 `LIMIT 1000` 通过且顺序不变；`LIMIT 1001` 被拒；结尾的 `;` 与 `--` 注释不破坏包装 |
| RAC-201 | 6 行各 100 KiB 的结果被拒，同一表 `LIMIT 4` 通过 |
| RAC-202 | 递归 CTE（带不带 `RECURSIVE`）在读（`all`、`get`，直接与跨通道）和写（`INSERT … WITH`）里都以 `statement_refused` 拒绝且不运行；子查询里的递归也拒；不读自己的 CTE 照常通过 |
| RAC-203 | `/*` 在宿主被问到之前就被拒（`sandbox.invalid_request`）；提前收括号的语句仍在同一个 `LIMIT` 里，宿主至多建 1001 行 |
| RAC-204 | `DELETE`、`PRAGMA`、以注释开头的语句、`INSERT` 经 `all` 原样到宿主、被关键字拒（`sandbox.database_error`），表不变 |
| RAC-205 | 重复的列名回成 `名字:1`（这一条钉住那个唯一可见的变化） |

RAC-206～209 空着。

## 4. 没做的（BL-480）

非递归语句的耗时（大表的多次自连接）和单个值的内存（`replace`、`hex` 套 `hex`、`zeroblob`、`printf` 造出接近 1 GB 的值）仍没有上限。不为它写函数黑名单：名单挡不住 `hex(hex(…))` 这样的套用，也是“头疼医头”。要补就得让语句跑在能被停掉的地方：

- 可 kill 的子进程：只读连接开在子进程（SQLite 在别的进程里不违反 PLIB-08），超时就 `SIGKILL`；写走子进程里的事务，宿主一句一句驱动，每句之间照旧查原调用者（`assertPluginActionCurrent`），被杀的事务由 SQLite 回滚。
- 或换一个带中断和 `sqlite3_limit` 的驱动（影响整个项目库）。

两条都动信任边界，BL-395 原文要求动手前问用户，所以这一片不做，开 BL-480，要在第一个能给沙箱插件开项目库的生产路径之前决定。
