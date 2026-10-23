# 沙箱插件项目库语句：跑在能杀掉的子进程里，有时间、内存与结果上限

状态：执行中（2026-10-23）。BL-395。用户 2026-10-23 在统筹会话弹窗里定了「这一轮就做完子进程执行」（没选「先限量并关住入口」）；本片是整片：沙箱插件的项目库语句不在宿主的线程上跑，时间、内存、结果大小与递归都有上限，安全不变量 S-59。

验收编号：RAC-200～205、RAC-207～209（第 4 节）；RAC-206 是 PG-039（#1123）用的。

## 1. 目标与事实

沙箱插件经 broker 的 `sdk.projectDatabase` 语句，原先交给宿主的 `services.project_database` 客户端，由 better-sqlite3 在宿主主线程上同步执行。逐句检查（S-46）只管语句碰得到哪些表，不管跑多久、结果多大、占多少内存。

核过的事实（better-sqlite3 12.8.0，SQLite 3.51.3）：

- 编译选项带 `SQLITE_OMIT_PROGRESS_CALLBACK`，包装里没有 `sqlite3_interrupt`、`sqlite3_limit`、授权回调（`Object.getOwnPropertyNames(Database.prototype)` 里没有）。主线程里没有办法在语句跑着时停它。
- `Worker.terminate()` 停不了原生调用（实测：工作线程里跑一句 40 亿次的递归计数，300 ms 后 `terminate()`，4 秒后 `exit` 事件仍没来），语句会一直占着一个核。
- 编译选项 `SQLITE_DEFAULT_MEMSTATUS=0`，`PRAGMA hard_heap_limit` 设得进去但不生效（实测：设成 128 MB 后 `hex(zeroblob(1e8))` 照样成功，常驻内存涨到 378 MB）；`SQLITE_MAX_LENGTH` 是 1e9，一个值能到 1 GB。SQLite 的内存是 malloc，不在 V8 的堆里，`--max-old-space-size` 管不到。
- `EXPLAIN QUERY PLAN` 对递归查询（CTE 读自己，写不写 `RECURSIVE` 都一样）固定输出 `SETUP` 与 `RECURSIVE STEP`。

所以唯一可靠的做法是：让语句跑在宿主能杀的地方。宿主杀进程（SIGKILL）是操作系统做的，不要求被杀的一方配合。

## 2. 做什么

### 2.1 递归查询一律拒

`packages/plugin-runtime/src/project-database-statements.ts` 的 `recurses`：逐句检查在步骤名单之后再读一次 `EXPLAIN QUERY PLAN`，有 `RECURSIVE STEP` 就以 `plugin.project_database.statement_refused` 拒绝，语句不运行。对所有拿 `services.project_database` 的插件一样（宿主进程里的插件挂住主线程和沙箱插件一样严重）；今天 Schedule、Coding 的语句没有递归。子进程不能限制递归的耗时以外的东西（它能被杀，但一句递归永远不停的语句不该先占 2 秒再被杀），所以拒绝仍在检查里。

### 2.2 子进程执行

**谁**：`apps/local-host/src/project-statement-process.ts` 的 `ProjectStatementProcess`，每个插件安装一个，第一条语句来时才起，闲置 30 秒后收掉（`idleMs`），插件停止（`openPluginProjectLibrary` 返回的 `close`）时杀掉。子进程是 `fork` 的 `project-statement-worker.js`（同一个 Node，`--max-old-space-size=96`，环境变量只有 `TMPDIR`，stdio 全关，只有 IPC 通道），宿主一端通道关了它自己退出。选一个插件一个而不是每句一个：起一个 Node 加载 better-sqlite3 要一百来毫秒；选一个插件一个而不是全宿主一个：一个插件的失控语句杀的只是它自己的进程，别的插件的排队不受影响。

**怎么说话**：`project-statement-protocol.ts`，JSON 请求 `open`（路径与账本记录）、`get`、`all`（带行数与字节上限）、`begin`、`run`、`commit`、`rollback`，每个答一条 `{ ok: true, … }` 或 `{ ok: false, kind: refused | too_large | error, message }`。一个进程一次只有一个请求在途；排队的请求在宿主一侧等（`exclusive`），等的时间不算它的时限。写事务从 `BEGIN IMMEDIATE` 到 `COMMIT` 占着进程，别的请求等它完。

**子进程里做什么**：`project-statement-engine.ts`。自己开两个连接（`LocalSqliteStorage` 的只读连接和写连接，pragma 与宿主的一样：WAL、`synchronous=FULL`、`foreign_keys=ON`、`busy_timeout=5000`），各配一个 `pluginStatementGuard`（S-46 的逐句检查，与宿主进程里一样的代码，不另写一份）。读：关键字过滤（`SELECT`/`WITH`）→ 逐句检查 → 在只读连接上按行读（`stmt.iterate()`），第 1001 行或第 512 KiB 字节处停下，答 `too_large`，所以不会先建出整个结果再切；行里只许文本、有限数、null（BLOB、无穷、超过 2^53 的整数在子进程里就拒，因为 JSON 带不过去）。写：关键字过滤（`INSERT`/`UPDATE`/`DELETE`）→ 逐句检查 → `run`。

**宿主一侧的复查**：`plugin-project-isolation.ts` 的 `isolatedProjectStatements`，规则同 `pluginDatabaseClient`（S-18），但语句是异步的，所以一步一步问：读之前与之后各查一遍授权（撤权了就不把结果给插件）；写事务在 `beforeEffect` 前后、每句之前、`COMMIT` 之前查授权与原调用者（`assertPluginActionCurrent`），取消信号也在这几处查。关键字过滤在宿主先做一遍，被拒的读根本不起进程。

**限制**（`DEFAULT_STATEMENT_LIMITS`）：

| 项 | 值 | 超了 |
| --- | --- | --- |
| 起进程并打开库 | 5 秒 | `process_failed`/`statement_timeout`，杀进程 |
| 一条读 | 5 秒 | `plugin.project_database.statement_timeout`，杀进程 |
| 一条写和 `BEGIN` | 各 2 秒 | 同上 |
| `BEGIN` 到 `COMMIT` 一共 | 3 秒 | 同上；事务不留 |
| `COMMIT` | 10 秒 | 同上；提交可能已生效，见 2.4 |
| 进程常驻内存 | 256 MB | `plugin.project_database.statement_memory`，杀进程 |
| 读的结果 | 1000 行、512 KiB | `plugin.project_database.result_too_large`，沙箱插件看到 `sandbox.database_result_too_large`；进程不杀 |

内存是宿主在请求在途时每 50 毫秒用 `ps -o rss= -p <pid>` 采一次（和沙箱运行器管插件进程的办法一样）。写事务的总时限 3 秒也是写锁的上限（2.3）。

**合同**：`PluginProjectStatements`（`packages/contracts/src/platform/plugin-database.ts`）是 `PluginDatabase` 的异步孪生：`get`、`all(…, limits, signal)`、`transaction(beforeEffect, statements, signal)`，语句与行只有文本、有限数、null。`PluginHostServices.project_statements` 新增（可选）；升级预检的上下文里也去掉它（只读）。宿主按插件定义的 `execution`：`"sandbox"` 的给 `project_statements`、不给 `project_database`，所以沙箱插件的适配器（`apps/local-host/src/plugin-builder/installed.ts`）拿不到宿主线程上同步跑的那一份；宿主自己跑的插件照旧只有 `project_database`。`sandboxDatabase(statements)` 接这个服务，原先包子查询的 `bounded`、读里不准 `/* */`、重复列名变成 `名字:1` 都不要了（行数在读的时候就停）。公开 API 快照 `contracts/platform/plugin` 因此刷新，影响：新增一个可选服务，没有现有插件受影响；只有声明了 `execution: "sandbox"` 又声明 `databases.project` 的定义会在 `services.project_statements` 而不是 `project_database` 上拿库。

**错误码**（`packages/plugin-runtime/src/project-database.ts` 的 `pluginProjectDatabaseErrors`）新增：`statement_timeout`（timeout）、`statement_memory`（too_large）、`result_too_large`（too_large）、`process_failed`（unavailable，进程起不来或自己退出了）。码原样交给沙箱插件，其余失败是 `sandbox.database_error`。

### 2.3 PLIB-08 的新口径

PLIB-08 原文是“同一文件只用一份 SQLite 库（测试断言客户端的连接类型）”，理由是同一个进程里两份 SQLite 库（node:sqlite 和 better-sqlite3）各管各的 POSIX 锁，其中一个关连接会放掉另一个的锁。新口径：**同一个进程里同一文件只用一份 SQLite 库**。

- **谁能打开项目库**：宿主进程里的 better-sqlite3（写连接和只读连接，不变），以及每个沙箱插件安装各自的子进程里的 better-sqlite3（各两个连接）。子进程里只有 better-sqlite3 这一份库，不加载 node:sqlite，所以 PLIB-08 的理由在每个进程里都成立；不同进程之间 POSIX 锁是内核按进程管的，一个进程关连接不会放掉另一个进程的锁。
- **子进程怎么拿到库**：宿主在 `open` 请求里给路径和账本里这个插件的记录（插件 id、表和索引的名字），子进程自己 `new LocalSqliteStorage(path)`。它不创表、不改账本、不维护：建表、记账本、核对形状是宿主开库时做的（`openPluginTables`），子进程只在开好的库上执行逐句检查通过的语句。逐句检查按 `schema_version` 缓存，宿主那边改了结构后子进程下一句会重判。
- **WAL 下两个进程同开**：库是 WAL 模式（`LocalSqliteStorage` 设置，宿主已经在用）。读连接看到已提交的数据，不互相阻塞；写者只有一个：谁的 `BEGIN IMMEDIATE` 先拿到谁写，另一个等 `busy_timeout`（5 秒）。子进程等宿主的锁时受自己的 2 秒时限约束（超了是 `statement_timeout`，插件可以重试）；宿主的同步写入等子进程的锁最久是事务总时限 3 秒（宿主线程在这段时间停着，写进 `docs/system/SECURITY-INVARIANTS.md` 第 4 节）。持久性一样：`synchronous=FULL`。
- **子进程崩了、被杀了**：宿主收到 `exit`（或自己动手杀的），在途请求得到带码的错误（超时、超内存、`process_failed`），之后的请求起新进程，连接和事务状态是新的；宿主自己的连接与别的插件不受影响。被杀的写事务由 SQLite 回滚（WAL 里没提交的帧不算数，锁随进程结束释放），不会半提交；被杀的进程在检查点中途也没事（SQLite 的检查点本来就是崩溃安全的）。唯一不确定的是 `COMMIT` 正在途中被中断：提交可能已生效而宿主没收到答复，这时给插件的错误是 `outcome: 'unknown'` 的 `SandboxError`（沙箱运行器据此把这次操作当作“结果未知”），不说“没写入”。
- **宿主停、重启**：宿主退出时通道关闭，子进程自己退出（`disconnect`）；没有孤儿进程。

### 2.4 不做的、做不到的

- 内存上限是采样出来的，不是预先拒绝：两次采样之间一条语句能多分配多少就多超多少（一个值最大 1 GB），然后进程被杀，宿主不受影响。没有 `ps` 的平台没有内存上限（时间上限照旧）。写进 `docs/system/SECURITY-INVARIANTS.md` 第 4 节。
- 沙箱的写事务最长占写锁 3 秒，期间宿主自己的同步写入等着；只受 broker 每分钟操作数限制。要去掉得给沙箱插件的写另开库文件或排队限频，是后续设计。
- `COMMIT` 中断后结果未知（2.3）。没有测试：要稳定地在提交中途中断需要注入故障，现在只有代码审查。

## 3. 用户确认

用户 2026-10-23 在统筹会话弹窗里确认：这一轮做完子进程执行（统筹会话转述）。PR 正文写明。

## 4. 验收

`tests/security-invariants-sandbox-project-database-limits.test.ts`（进 `pnpm test:security`，S-59 一行引用；真文件库、真子进程，不用 Seatbelt，Linux 也跑）：

| 编号 | 断言 |
| --- | --- |
| RAC-200 | 1500 行的表，`SELECT` 被拒（`sandbox.database_result_too_large`）；225 万行的交叉连接在第 1001 行处停；自带 `LIMIT 1000` 通过且顺序不变；`LIMIT 1001` 被拒；结尾的 `;`、`--` 与 `/* */` 注释都只是注释 |
| RAC-201 | 6 行各 100 KiB 的结果被拒，同一表 `LIMIT 4` 通过 |
| RAC-202 | 递归 CTE（带不带 `RECURSIVE`）在读（`all`、`get`）和写（`INSERT … WITH`）里都以 `statement_refused` 拒绝且不运行；子查询里的递归也拒；宿主进程里的检查同样拒；不读自己的 CTE 照常通过 |
| RAC-203 | 写超时：`INSERT` 加一句停不下来的 `UPDATE` 的事务，超过写时限被杀（`statement_timeout`），表里一行没多、`UPDATE` 也没落，宿主自己的连接立刻能写（锁随进程走了），下一个事务在新进程里照常提交 |
| RAC-204 | `DELETE`、`PRAGMA`、以注释开头的语句、`INSERT` 经 `all` 在宿主就被关键字拒（`sandbox.database_error`），没起进程；事务里的 `SELECT`、`DROP TABLE` 被拒，整个事务回滚 |
| RAC-205 | 读超时：停不下来的读超过读时限被杀（`statement_timeout`），其间宿主的定时器照常走（线程没被占）；下一条读在新进程里跑，旧进程不在了 |
| RAC-207 | 内存：一句让进程内存一路涨的语句，在涨的时候被杀（`statement_memory`），下一句照常 |
| RAC-208 | 授权在提交前被收回：已跑过的语句一并回滚，表不变；取消信号：正在跑的语句被杀、事务不留、锁释放；开始前就取消：不起进程，表不变 |
| RAC-209 | 关项目库：进程被杀，之后的读与写得 `actions.plugin_unavailable`，也不会再起进程；同一插件的几条语句共用同一个进程 |

另：`tests/security-invariants-plugin-project-database.test.ts` 的 PLIB-10 用例（要 macOS 的沙箱）断言声明 `execution: "sandbox"` 的插件没有 `project_database`，语句经 `project_statements`。RAC-206 是 PG-039 的编号。
