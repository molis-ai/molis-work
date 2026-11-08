# SQLite 第二步：项目库换到 node:sqlite（路线书 05 第 3 项）

状态：实现中，SQLD-a、c、d、e 在分支 `claude/05-sqlite-switch` 上，合成一个 PR（用户 2026-11-08 定，§10）。SQLD-b（锁 Node）已随 #1917 合入。桌面打包那半的两个文件归 F 轨，用户 2026-11-08 同意由本批写手放进同一个 PR，F 轨事后审；打包冒烟在本机经 `tests/runtime-payload.test.ts` 跑过，正式包没有打（§6、SQLD-11）。本文已按实现改过：和当初设计不一样的地方写在原处，并汇总在 §14。要不要换用户已定（台账 C3，分两步）；第一步（驱动收拢到窄接口）已随 #1790 合入（`a942bd9c3`）。

验收编号前缀 `SQLD`，见 §12。

## 0. 给人讲清楚

现在同一个程序里有两份 SQLite：项目库用第三方的 `better-sqlite3`，别的库用 Node 自带的 `node:sqlite`。两份库同时开一个文件会互相放掉文件锁，所以一直靠规矩隔开，第三方包还是原生模块，打包麻烦。这一步把项目库也换到 Node 自带的那份。

用户感觉不到变化。文件格式一样，换回去也不用动数据。**要知道的一个代价：** 换完之后 SQLite 的版本跟着 Node 走，而平台检查插件 SQL 的那份规则是对着一个确切版本写的，版本一变就全部拒绝。所以换之前要把 Node 升到一个对得上的版本，并且锁住（§2）。

## 1. 核账标「没核实」的项

| 项 | 结果 | 依据 |
| --- | --- | --- |
| CI、桌面用的 24.14.0 带哪版 SQLite | **3.51.2**。24.15.0 是 **3.51.3**，24.22.2 的官方源码是 3.53.4 | `nodejs/node` 各 tag 的 `deps/sqlite/sqlite3.h` |
| 本机 Node | Homebrew 的 24.22.2，`node_shared_sqlite=true`，链系统库，SQLite **3.54.1**，`brew upgrade` 就变 | `process.versions.sqlite`、`otool -L` |
| `node:sqlite` 的稳定度 | 24 线从 v24.15.0 起标 Stability 1.2 Release candidate | [Node 文档](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)、[PR #61262](https://github.com/nodejs/node/pull/61262) |
| `timeout` 选项最低版本 | v24.0.0／v22.16.0 | Node 文档。实测：30 ms 超时约 45 ms 返回 errcode 5 |
| ExperimentalWarning | 官方 24.15.0 不打（2026-11-08 实测，复现见 §8） | §8 |
| null 原型行影响多少测试 | 不用数：适配层转成普通对象，这一类直接消失（§3） | 实测 `deepStrictEqual` 确实报错 |
| 沙箱子进程有没有权限模型限制 | 没有 `--permission`、`--allow-addons`（查过全部源码） | §5 |

**§3 的表最早是在本机这个 Homebrew Node 上实测的。2026-11-08 起以官方 24.15.0 为准：`tests/sqlite-driver-conformance.test.ts` 在提交 `32ec02312` 上让同一组用例对两个驱动各跑一遍（47 个全过，差异都在表内），切换后留下新驱动一半。** 编译选项差异尤其如此：官方构建的选项从 `deps/sqlite/sqlite.gyp` 读（24.15.0），和 Homebrew 不完全一样。

## 2. 关键约束：插件语句检查钉死了 SQLite 版本

核账没有提这一条，它决定了切换的前置。

`packages/plugin-runtime/src/project-database-statements.ts:19`（`scripts/gates/initial-versions.mjs:35` 也登记这个常量）：

```ts
/** The SQLite the step list was read against. A Host on another version refuses every statement until the list is read again. */
export const PLUGIN_STATEMENT_SQLITE_VERSION = "3.51.3";
```

`pluginStatementGuard` 版本不等就拒绝这个插件的**每一条**语句（S-46，`:124`）。步骤清单是对着这一版 `EXPLAIN` 的输出写的，这个检查不能放宽。`tests/security-invariants-plugin-project-database.test.ts:259` 也钉着它。

现在 `better-sqlite3@12.8.0` 带的正好是 3.51.3，版本跟着锁文件走。换到 `node:sqlite` 以后，版本跟着 Node 走：

| Node | SQLite | 换驱动后插件语句 |
| --- | --- | --- |
| 24.14.0（现在的 CI、桌面） | 3.51.2 | **全部拒绝** |
| 24.15.0 | 3.51.3 | 通过 |
| 24.22.2 官方 | 3.53.4 | 全部拒绝 |
| Homebrew（本机，含真实 Home 的服务） | 3.54.1，随 `brew upgrade` 变 | 全部拒绝 |
| `engines: ">=24"` 下任何别的版本 | 不定 | 全部拒绝 |

失败是关闭的，不会放过不该放的语句。但项目里的插件表（Goals、Feed 等）都走这条路，等于这些插件全不能用。

### 2.1 Node 升到 24.15.x 并锁定（用户 2026-11-06 定）

| 方案 | 做法 | 代价 | 卡什么 |
| --- | --- | --- | --- |
| **A. 升到 24.15.x 并锁定（已定）** | CI（3 个 workflow；`ci.yml`、`full-suite.yml:75` 现在是 `24.14.0`，`release-macos.yml:29` 是浮动的 `24`，都改）、桌面（`prepare-macos-runtime.sh:7`）、新增 `.nvmrc` 都写确切的补丁版本（下面）；`engines` 收窄到同一条线；宿主启动时若 `process.versions.sqlite` 不是审过的版本，明确说明，不等到第一条语句才拒。开发机不能用 Homebrew 的 Node 跑服务 | 动 CI、打包、根目录白名单（用户已同意）；用户和开发机要换 Node；以后升 Node 要重读步骤清单 | 切换片（SQLD-d）；不卡别的 |
| B. 把清单重读到 24.14 的 3.51.2 | 只改常量，重读一遍清单，不动 CI | 把清单往旧版本重读一次；Node 还是 24.14（低于 RC 标记）；还是要锁，只是锁在旧版本 | 同上 |
| C. 清单支持多个版本 | 常量改成审过的版本表，CI 矩阵每版跑安全用例 | 每加一版都要读一遍步骤清单，CI 变慢；Homebrew 的版本追不上 | 不卡 Node，但工作量最大 |

用户选 A，否掉 B、C。它顺带拿到 RC 稳定度，不用把步骤清单往旧版本重读一次。C 留作以后真要支持多版本时再说。

**版本相同不等于步骤清单就成立。** 清单是对着 `better-sqlite3` 带的 3.51.3 读的，官方 Node 的编译选项不同（比如 STAT4 只有 `better-sqlite3` 有），`EXPLAIN` 的输出可能不一样。检查是失败关闭的，风险只是误拒，但要在切换之前知道：SQLD-c 让适配层在官方 24.15 上跑一遍 S-46 全部用例，过了才算数，不等 SQLD-09。

**24.10 的下限 main 已经在依赖。** Home 插件库的原生授权要 Node 24.10 以上（`sqlite-owner-boundary.ts:11,19-21`，低了就报 `actions.service_unavailable`，只在声明了 `databases.home` 的库上触发），根 `package.json` 的 `engines` 还写着 `>=24`，现在是错的。SQLD-b 把它收到 24.15.x 自然覆盖，这条不用另外处理。

**锁到确切的补丁版本。** 补丁也可能换 SQLite。`.nvmrc`、CI、桌面写同一个确切版本，现在是 `24.15.0`；SQLD-b 开工时看 24.15 线有没有新补丁，带的还是 3.51.3 才能用。`engines` 写 `24.15.x`（`>=24.15.0 <24.16.0`），它只挡大的错配，确切的判断靠启动说明和 `:124`。

**以后升 Node 补丁怎么办。** 先读新版本的 `deps/sqlite/sqlite3.h`。SQLite 没变：改版本号，CI 跑 S-46，过了就合。SQLite 变了：同一个 PR 重读步骤清单、改 `PLUGIN_STATEMENT_SQLITE_VERSION`，过评审。安全补丁要赶时也走这条路，没读完清单之前不换：换了插件语句就全部拒绝。**「宿主的 SQLite 版本由谁定」从锁文件变成了 Node，这是这次切换真正的代价**；决定 C3 时没有写到，用户定这一项时已经知道。开发机从此不能再用 Homebrew 的 Node 跑服务，以后升 Node 要重读步骤清单。

## 3. 做法：一个适配层

**第一步已经把项目库收到窄接口 `SqliteDatabase`（`packages/storage/src/sqlite-connection.ts`）。第二步只换这个文件里 `openSqliteConnection` 的实现**，返回包在 `DatabaseSync` 外面的适配对象，语义按 `better-sqlite3` 保持。调用方（生产 22 个文件以上）一行不动。词法扫描在 `sqlite-statement-shape.ts`。

差异逐条定。「实测」指本机 Node，`better-sqlite3@12.8.0` 与 `node:sqlite` 并排跑过。★ 是核账没列的。

### 3.1 连接

| 差异 | `better-sqlite3` | `node:sqlite` | 做法 |
| --- | --- | --- | --- |
| ★ 只读选项名 | `readonly` | `readOnly`；**写 `readonly: true` 被静默忽略，连接可写**（实测写成功） | 最危险的一条。适配层的选项名只在一处翻译；**未知选项抛错**。`node:sqlite` 其他直接调用处保持现状 |
| `fileMustExist` | 有 | 没有 | 只读打开缺文件本来就 errcode 14（实测）。可写用 `pathToFileURL(path)` 加 `?mode=rw`，缺文件 errcode 14（实测），没有 `existsSync` 的竞态 |
| ★ 默认 `timeout` | 5000 | 0（实测 `busy_timeout` 读出 0） | `timeout ?? 5000`。`snapshot-sqlite.ts` 明确传 0 的不变 |
| `name`、`open`、`inTransaction` | 属性 | `location()`、`isOpen`、`isTransaction` | 适配对象的 getter；`name` 存原路径。再给 `readonly`（`tests/…plugin-project-database.test.ts:285` 读它） |
| ★ 页缓存 | `-16000`（16 MB） | `-2000`（2 MB） | **第一条 `prepare` 之前**设 `PRAGMA cache_size=-16000`，不在打开时设，失败不算错。理由和吞掉的错见下面「设页缓存」 |
| ★ 防御模式 | 开（实测改 `sqlite_master` 被拒） | Homebrew 上也拒；官方默认未核实 | 打开时 `enableDefensive(true)`，明确写，有用例 |
| 外键、双引号字符串 | 编译期开、关 | 选项默认开、关（实测相同） | 不用做，用例钉住 |

**设页缓存（2026-11-08 按实测改，原写「打开时」）。** `PRAGMA cache_size` 要读库结构，所以会碰文件：官方 24.15.0 上对坏文件报 errcode 26，对已关闭的 WAL 库会建出 `-shm`。打开时做，就把「打开不碰文件」变成了「打开可能失败、可能等锁、可能写侧文件」，而调用方（`inspectSnapshotSqlite`、`openBaselineHomeSqlite` 等）是按打开不碰文件写的。所以放到第一条 `prepare` 之前，做的时候把 `busy_timeout` 临时设 0、之后恢复原值，不让这一步占等锁时间。

「失败不算错」只吞 SQLite 自己报的错（`sqliteErrorName` 认得的：`BUSY`、`LOCKED`、`NOTADB`、`CORRUPT`、`READONLY`（只读连接碰到热日志，extended 776）、`IOERR`、`CANTOPEN` 等），别的照抛。吞掉的代价只是这条连接的缓存还是 2 MB，下一条 `prepare` 再试。**接着的语句照样报同一个错**：它读的是同一个文件，紧接着做同样的读。坏文件上第一条 `prepare` 报 `SQLITE_NOTADB`，锁住的库上报 `SQLITE_BUSY`，等的时间只有这条语句自己的 `timeout`，不会翻倍。`tests/sqlite-driver-conformance.test.ts` 的「sizing the cache」钉住这几条。`pragma`、`exec` 不触发这一步：`pragma("busy_timeout = 0")` 这类不碰文件的调用保持不碰。

### 3.2 事务

`transaction(fn)` 生产 68 行／34 个文件，测试 24 行／17 个文件，加 `LocalSqliteJournal.immediate`（`sqlite.ts:36`）。自写，语义照抄：

```ts
function transaction(run) {
  const wrap = mode => (...args) => {
    const nested = db.isTransaction;
    const name = `_tx_${++depth}`;
    db.exec(nested ? `SAVEPOINT ${name}` : `BEGIN ${mode}`);
    try {
      const result = run(...args);
      if (result && typeof result.then === "function") throw new TypeError("Transaction function cannot return a promise");
      db.exec(nested ? `RELEASE ${name}` : "COMMIT");
      return result;
    } catch (error) {
      if (db.isTransaction) db.exec(nested ? `ROLLBACK TO ${name}; RELEASE ${name}` : "ROLLBACK");
      throw error;
    } finally { depth--; }
  };
  return Object.assign(wrap(""), { immediate: wrap("IMMEDIATE") });
}
```

- `if (db.isTransaction)`：SQLite 可能自己已回滚（磁盘满、`ON CONFLICT ROLLBACK`），再 `ROLLBACK` 会掩盖原错误。
- `COMMIT` 失败（如 BUSY）事务还开着，走 `catch` 回滚。
- 返回 promise 就抛错并回滚，和 `better-sqlite3@12.8.0`（`lib/methods/transaction.js`）相同。不抄这一句，`transaction(async …)` 就会在第一个 `await` 处提交，后面的写落在事务外，悄悄失去原子性。生产今天没有这种写法（`packages/plugin-sandbox/src/database.ts:67` 是插件客户端，不是驱动），这道防线要留。

### 3.3 语句

| 差异 | `better-sqlite3` | `node:sqlite` | 做法 |
| --- | --- | --- | --- |
| ★ 参数太少 | 抛 | **静默绑 NULL，写成功**（实测） | 会悄悄写坏数据。适配层在 `prepare` 时数参数（跳过字符串、引号标识符和注释，`?`、`?NNN`），`get/all/iterate/run` 时比，不符就抛。太多两边都抛 |
| ★ `?NNN` 给位置参数 | **当命名参数，给位置值抛 `Too many`／`Missing named parameters`**（2026-11-08 实测） | 按 SQLite 的位置绑 | 放宽：`?2` 就是第 2 个值。生产代码没有 `?NNN`，只有两个测试夹具（`desktop-tui`、`inbox-plugin`）从命名参数改写时用，同一个值用多次比重复写清楚 |
| ★ 一条 `prepare` 写了多句 | 抛 `more than one statement` | **只编译第一句，丢掉其余，第一句照常执行，不报错**（实测；v24.15.0 `node_sqlite.cc`） | 项目库现在就靠驱动拒绝：关键字过滤只看开头（`project-statement-protocol.ts:52-57`），`EXPLAIN` 也只看第一句，`PLIB-06`（`tests/security-invariants-plugin-project-database.test.ts:218`）和 `docs/platform/PLUGIN-DEVELOPMENT.md:205` 都写着一次一句。适配层数参数的词法扫描顺带做：第一句之后只许空白和注释，否则抛，文字保留 `more than one statement`。适配层不做语法分析，`CREATE TRIGGER` 这种中间带分号的写 `exec`（`exec` 不过这个检查）；Alchemist 之外的生产代码没有（评审台查过），有人写了就是报错，失败是关闭的 |
| ★ 命名参数缺一个 | 抛 | **静默绑 NULL**（实测） | 生产没有命名参数，只有 `tests/desktop-tui.test.ts`、`tests/inbox-plugin.test.ts`。适配层在 `prepare` 时一律拒绝（`:a`、`@a`、`$a`；文字、引号名字和 `a$b` 这样的名字不算），测试改成位置参数（SQLD-a） |
| ★ 数组当位置参数 | `.get([1,2])` 接受 | 抛 `Unknown named parameter '0'`（实测） | 适配层展开成位置参数，保持现状。main 上没有这种写法 |
| ★ `get`／`all`／`iterate` 跑写语句 | 抛（语句不返回数据） | **返回空，写成功**（实测） | 适配层在 `prepare` 时读 `columns()`，长度为 0 就抛，文字同 `better-sqlite3`。`INSERT … RETURNING` 有列，不受影响；`run` 不查，两边都允许。`pragma`（§3.4）的 `PRAGMA x=y` 也是 0 列，它走内部的原始语句，不过这个检查 |
| ★ `undefined` 参数 | 接受，绑 NULL（实测） | 抛 | 适配层转成 `null`，保持现状 |
| ★ 布尔、`Date` 等对象 | 抛 | **接受**（实测） | 适配层抛 `TypeError`，防止存进去一个意外的值 |
| ★ 行的原型 | 普通对象 | null 原型，`deepStrictEqual` 报错，`hasOwnProperty` 没有 | 适配层转普通对象。`packages/storage/src/adapters/search-storage.ts:286` 这类检查原型的也就不用动 |
| ★ BLOB | `Buffer` | `Uint8Array`，`.toString("utf8")` 会悄悄得到逗号串 | 同一次转换里包成 `Buffer`（不拷贝内容） |
| 超 2^53 的整数 | 丢精度的 double | 抛 `ERR_OUT_OF_RANGE` | 更严格，不转。`project-statement-engine.ts:137` 的 `carried` 本来就要拒绝过大的整数，结果都是拒绝，错误码按用例核（SQLD-c） |
| `pluck` | 有 | 没有 | 只有测试用（15 行／6 个文件），从窄接口删，改写法（SQLD-a） |
| `iterate` | 迭代中连接忙，`exec` 抛 | 可以继续 `exec`（实测） | 只有 `project-statement-engine.ts:86`，中途抛错时迭代器能关（实测）。放宽不影响 |
| `changes`、`lastInsertRowid` | number；超过 2^53 时丢精度，不抛（实测） | **官方 24.15.0 同：返回丢精度的 number，不抛（2026-11-08 实测，下面可复现）**。#1844 碰到过 FTS 写入后已成功的写入在取结果时抛 `ERR_OUT_OF_RANGE`，那是别的 Node 版本；24.15.0 上普通表和 FTS5 都不抛 | **不做 `setReadBigInts`**：要防的情况在锁定版本上不存在，多一个切换状态只会添错。用例钉住（「left a 64-bit rowid」），将来升 Node 这条红了再加。`adapters/fts-statement.ts` 是 Home 库的另一条路，不动 |
| `function` | 有 | 有 | 适配返回 `this`，测试 2 处 |

**复现（官方 24.15.0，`$HOME/.cache/molis-work/node-24.15.0/bin/node`）：**

```bash
node -e "const {DatabaseSync:D}=require('node:sqlite');const d=new D(':memory:');d.exec('create table t(id integer primary key,v);insert into t values(9007199254740993,1)');console.log(d.prepare('update t set v=2').run())"
# { changes: 1, lastInsertRowid: 9007199254740992 }
node -e "const {DatabaseSync:D}=require('node:sqlite');const d=new D(':memory:');d.exec('create virtual table f using fts5(x)');d.prepare(\"insert into f(rowid,x) values (9007199254740993,'a')\").run();console.log(d.prepare(\"update f set x='b' where rowid=9007199254740993\").run())"
# 不抛，lastInsertRowid 同样是丢精度的 number
node -e "const {DatabaseSync:D}=require('node:sqlite');require('fs').writeFileSync('/tmp/g.db','not a database, not a database');try{new D('/tmp/g.db').exec('PRAGMA cache_size=-16000')}catch(e){console.log(e.errcode,e.message)}"
# 26 file is not a database
```

实测转换的成本（10 列、10 万行）：`better-sqlite3` 65 ms，`node:sqlite` 裸 71 ms，加转换 103 ms。1000 次按主键 `get`：3.2 ms 对 4.0 ms。行多的读慢 50%，单行几乎没差。项目库的查询绝大多数是小结果集；不做按查询跳过转换这种优化，免得差异重新出现。写入 `node:sqlite` 略快（52 对 64 ms）。`prepare` 多一次词法扫描的成本 SQLD-c 顺手量。

Home 库今天就在 `node:sqlite` 上走同一个 `pluginDatabaseClient`（`home-sqlite.ts` 不经这个适配层）。**「丢第二句」确实存在**（2026-11-08 实测，用例「a library in the Home」钉住）：第二句从不编译、从不执行，所以不是越权，但插件写了两句只跑第一句且不报错。已报统筹记 BL，不在这里修，修法是同一个扫描（`readSqlStatementShape`）。

**连接上的两处小差异（§3.1 的补充）：** `close` 两次，`better-sqlite3` 什么也不做，`node:sqlite` 抛 `database is not open`（实测），适配层已关就直接返回。`exec`、`close` 窄接口返回 `this`，`node:sqlite` 返回 `undefined`（实测），适配层返回 `this`。

### 3.4 pragma

没有 `pragma` 方法。实现：`prepare("PRAGMA " + sql).all()`，`simple` 取第一行第一列。生产 12 行／3 个文件（`sqlite.ts`、`snapshot-sqlite.ts`、`catalog-commit.ts`）不动。实测 `integrity_check`、`journal_mode=WAL`、`user_version` 都能这样读，结果行数组和原来一样。

### 3.5 backup

模块级 `backup(db, path, { rate, progress })`。实现 `backup(destination, { progress })`：

- `rate: 128`（原来 `progress` 返回 128 决定每轮页数），窄接口改成把 `rate` 放进选项，`progress` 的返回值忽略。
- `progress` 只在**还有页没拷完**时才叫（2026-11-08 实测，旧驱动至少叫一次）。`signal.throwIfAborted()` 不能只靠它，`backupSnapshotSqlite` 在 `backup` 返回后本来就再查一次。
- `progress` 里抛错能中止（实测：Promise 拒绝，抛的是原错误），所以 `signal.throwIfAborted()` 这个用法不变。中止后目标文件留着，**这与原来相同与否按用例核**，`backupSnapshotSqlite` 现有清理兜底。
- 目标是已有的垃圾文件时报 `file is not a database`（实测）；只读连接能备份（实测）。
- 副本头字节仍带 WAL 标记（实测 `[2,2]`），`snapshot-sqlite.ts:175` 的 `journal_mode = DELETE` 正好接上，`inspect` 不用改。

### 3.6 错误形状

`better-sqlite3` 抛 `SqliteError`，`code: "SQLITE_BUSY"`。`node:sqlite` 抛 `code: "ERR_SQLITE_ERROR"`、`errcode: 5`、`errstr`。没有那个类。

`packages/storage` 导出一个函数 `sqliteErrorName(error)`：两种形状都认，按 `errcode & 0xff` 返回 `"SQLITE_BUSY"` 这样的名字。SQLD-a 先在旧驱动上换掉全部调用点，再切换：

- `apps/local-host/src/catalog-commit.ts:23`、`web-catalog-access.ts:24`；
- `packages/storage/src/snapshot-sqlite.ts:80-81,207-208`（同时去掉它的 `import Database from "better-sqlite3"`）。

**同样要去掉直接 import 的还有 `packages/storage/src/catalog-metadata.ts:3`（#1877 新增）。** `inspectCatalogFile` 在有 WAL 时用旧驱动读（`:33`，注释写明要和常驻连接共用一份锁记账），没有 WAL 时用 `node:sqlite` 的 immutable URI。§7 把 `ownsDriver` 收窄之后，不改它门禁就红。SQLD-a 把 `new Database(filename, { readonly: true, fileMustExist: true })` 换成 `openSqliteConnection(filename, { readonly: true, fileMustExist: true })`，语义不变；SQLD-d 切换时它跟着常驻连接一起换，两个分支都是 `node:sqlite`，「和常驻连接同一个驱动」这条仍然成立。

`project-plugin-databases.ts` 的 `TRANSIENT_DATABASE_ERROR` 正则匹配 `database is locked`，文字两边相同（实测），不用改。测试里断言 `.code` 的由全量找出。切换后函数只认 `node:sqlite` 这一种（`errcode`），随 SQLD-e 收。**Host 日志同样用它**（`host-log.ts` 的 `describe`）：`node:sqlite` 对任何失败都是 `ERR_SQLITE_ERROR`，不换的话日志里分不出忙和坏，这是切换会丢的诊断。

### 3.7 编译选项差异

`better-sqlite3` 有、官方 `node:sqlite` 没有的，逐个查过仓库：

| 选项 | 影响 | 结论 |
| --- | --- | --- |
| `ENABLE_UPDATE_DELETE_LIMIT` | `DELETE … LIMIT` 语法错 | 内置代码没有用（查过）。**装上的插件如果写了，切换后语法错**，升级须知写一条 |
| `SOUNDEX`、`ENABLE_FTS4` | 函数、虚表没有 | 查过，没人用 |
| `LIKE_DOESNT_MATCH_BLOBS` | `LIKE` 对 BLOB 的行为 | 项目库不对 BLOB 用 `LIKE`，符合性用例钉一条 |
| `DEFAULT_WAL_SYNCHRONOUS=1` | 默认比官方松 | `LocalSqliteStorage` 明确设 `FULL`，不受影响 |

FTS5（`trigram` 实测可用）、JSON、数学函数都在（`sqlite.gyp`）。官方 24.15 的 `PRAGMA compile_options` 记在用例里（`tests/sqlite-build-options.test.ts` 的 `OFFICIAL_COMPILE_OPTIONS`，单独一个文件，因为整张表只在 macOS 上比，别的符合性用例在产品子集里），将来 Node 升级看差异；只在 macOS 上比整张表（从这个构建读的），Linux 上只比代码依赖的几项。

**`setAuthorizer`。** 宿主用 SQLite 自己的授权回调的地方现在有两处，都在 `node:sqlite` 上（要 Node 24.10 以上）：Home 插件库的语句检查（`nativeSqliteOwnerBoundary`，S-112），和插件表升级段的第 2 层（U1-f：结构语句走 `nativeSqliteSchemaBoundary`，增删改走 `nativeSqliteOwnerBoundary`，`packages/storage` 的窄接口为此交出 `SqliteConnection.setAuthorizer`）。项目库原先用不了它，因为 `better-sqlite3` 没有把授权回调接出来；SQLD-d 把项目库换到 `node:sqlite` 之后条件相同，`project-database-statements.ts:6` 那句「宿主的 SQLite 没有 authorizer」随之删掉。U1-f 开工时 #1959 已经在它的分支上，所以升级段直接写成授权版，没有写按词读，并在锁定版本 24.15.0（SQLite 3.51.3）上跑过 S-147 的 4212 种写法和 UPG1-14：合法的段全部走通，会碰到别人的表的写法全部在执行前被拒（设计时只在 Node 24.22.2、SQLite 3.54.1 上量过；结论和实际写法见 [U1 设计](../upgrade-continuity/upgrade-chain-design.md) §2.4 末段）。**剩下的**是日常插件语句检查（项目库读写用的 `project-database-statements.ts` 的 `pluginStatementGuard`）改用它，去处不变：SQLD-d 之后单独一片，一次换所有插件，U4 打开开关之前必须换完（统筹 11-07 定）。这一步不归 SQLD-c，SQLD-c 只核插件语句检查（§2.1）。

## 4. 文件锁用例 PLIB-08／S-46

两份 SQLite 关连接会互相放掉 POSIX 锁，这是当初不换也不混用的理由（对照实测：写连接持 `BEGIN IMMEDIATE`，同进程另开一份 `better-sqlite3` 读连接再关掉，另一进程的 `BEGIN IMMEDIATE` 从 errcode 5 变成成功；同一份 SQLite 的读连接开关一次，仍是 5）。放掉锁只发生在同一个文件上，所以**要钉住的不变量是：同一个进程里，同一个文件不同时被两份 SQLite 开着。** 切换后这条还要守，因为 Alchemist 留着 `better-sqlite3`。只是范围变了：宿主进程里项目库和别的库都是同一份，第二份只开 Alchemist 自己的 `studio.sqlite`。离线快照也会检查 `studio.sqlite`（`home-store-snapshot.ts:65`），切换后用的是 `node:sqlite`，这不违反不变量：快照时 Alchemist 没在跑。

`tests/security-invariants-plugin-project-database.test.ts:319`（PLIB-08）不能只把断言翻过来。改成：

| 断言 | 现在 | 切换后 |
| --- | --- | --- |
| 读连接和宿主连接同一个驱动 | `reader.constructor === store.db.constructor` | 保留，适配对象同一个类 |
| 不是另一份 SQLite | `reader instanceof DatabaseSync === false` | 删（它现在就是这一份）。换成**实测锁**：写连接持 `BEGIN IMMEDIATE`，开关一次读连接，另一个进程 `BEGIN IMMEDIATE` 仍被挡（`errcode 5`）。这比断言类型直接，是 S-46 真正要的 |
| 只读 | `Reflect.get(reader, "readonly") === true` | 保留，再加：读连接 `INSERT` 被拒（防 §3.1 那条静默忽略） |
| 写走宿主连接 | `store.db.inTransaction` | 保留 |
| Alchemist 不碰项目库 | 没有 | 新增：Alchemist 的全部打开点只接受 `studio.sqlite`，别的文件名抛错，加拒绝用例。打开点现在有两个：`studio/server/db/open-database.ts:6`、`studio/server/sync/open.ts:25`（#1877 新增，只读查版本） |

**PLIB-06 切换前后不变：** `tx.run` 写两句仍然抛 `more than one statement`，靠的是 §3.3 的扫描；两句都不执行。

**切换之前就有一处两份 SQLite 碰同一个文件。** `inspectCatalogFile` 没有 WAL 文件时用 `node:sqlite` 开目录库（§3.6），按注释这是没人开着的库，代码按开头和结尾的文件状态核过；切换后这条分支也是同一个驱动，这处自然消失。

这样比现在更严。同步要改：`docs/system/SECURITY-INVARIANTS.md` S-46 的表述；`apps/local-host/src/plugin-project-library.ts:28-30` 的注释；`tests/security-invariants-plugin-terminal-launch.test.ts:596`（注释和它直接开的驱动）；`docs/platform/PLUGIN-DEVELOPMENT.md`（一次一句的说明不变，来源改成适配层）。

**这条不变量和 U1 无关。** 用户 2026-11-08 定 `studio.sqlite` 不接升级链（U1 设计 §2.3 的表），升级过程不开它，这里不产生第二份。升级过程新增的只读连接（`readUpgradeStore`，#1958）直接用 `DatabaseSync` 读目录库，切换后和项目连接是同一份 SQLite，不再有这条顾虑。重做 Alchemist 时再定（BL-377）。

Home 插件库：U1-f 的段用 `openSqliteConnection` 开 Home 库（U1 设计 §2.4），而 `home-sqlite.ts` 平时用 `node:sqlite` 开同一个文件。切换之后这两个是同一份 SQLite，这条顾虑随 SQLD-d 消失。

## 5. 沙箱子进程

`project-statement-sql-worker.ts` 在专属子进程的 Worker 里跑（S-59），用 `LocalSqliteStorage`，跟着切，不用单独改驱动。要核：

- **`node:sqlite` 在 Worker 里能用**（内置模块，可以），用例跑一遍现有 S-59 的超时、超内存、`SIGKILL`。
- **内存采样**：S-59 按进程 RSS 算，换驱动后 SQLite 的分配器不同，256 MB 的超限用例要过，不改数字。`hard_heap_limit` 换驱动后同样不生效（官方构建 `DEFAULT_MEMSTATUS=0`，2026-11-08 实测：限 20 MB，100 MB 的值照样构造），所以 S-59 仍只靠 RSS 采样。
- **第二份 SQLite 消失了**：归档稿 `slices/sandbox-project-database-limits.md` §2.3 说「子进程里只有 better-sqlite3 这一份库，不加载 node:sqlite」。切换后反过来，理由一样成立。这份归档不改，S-46 与 PLUGIN-DEVELOPMENT 写新的。
- `:26` 的错误映射跟着 `SqliteSchemaVersionError` 拆除改（U1-a），不是这里的事。

## 6. 打包与分发

| 位置 | 现在 | 切换后 |
| --- | --- | --- |
| `apps/desktop/tooling/prepare-runtime-payload.mjs:25`（已改用 `openSqliteConnection`） | 冒烟开内存库 | 不用改驱动。**加了**：`sqlite_version()` 和 `process.versions.sqlite` 都要等于 `PLUGIN_STATEMENT_SQLITE_VERSION`（从包里的 plugin-runtime 读，不另写一份），版本对不上打包就失败；包里的 storage 不带任何 SQLite 驱动依赖。F 轨文件，用户 2026-11-08 同意本批写手改，F 轨事后审（SQLD-11）。Alchemist 的 `better-sqlite3` 原生模块冒烟里不载：门禁 `project-sqlite-driver` 连 `-e` 程序也查，Alchemist 之外不许 import，留给 F 轨定 |
| `prepare-macos-runtime.sh:7` | `24.14.0` | §2.1。**改成 `24.15.0`**（同上，F 轨事后审）：不改的话 macOS 桌面包里的插件语句全部被拒（S-46）。调用方 `build-macos-release.sh` 不传 `MOLIS_WORK_NODE_VERSION`，默认值就是发出去的版本；`tests/sqlite-version-notice.test.ts` 钉住它等于 `.nvmrc` |
| CI 3 个 workflow | `ci.yml`、`full-suite.yml:75` 是 `24.14.0`，`release-macos.yml:29` 是浮动的 `24` | §2.1，写确切补丁版本。用户 2026-11-06 已定 |
| `packages/storage/package.json` | 依赖 `better-sqlite3`、`@types/better-sqlite3` | SQLD-e 删 |
| `tests/npm-package.test.ts:64`、`tests/npm-distribution-smoke.mjs:26` | 钉着「归档不带原生模块」 | 不用改：Alchemist 还要，注册表依赖仍由消费者装，见 §7 |
| `pnpm-workspace.yaml:43 allowBuilds`、`pnpm-lock.yaml:2035` | 有 | 仍有（Alchemist） |
| `node-pty` | 原生模块 | 不变，所以「要在目标架构上准备」的限制不会消失。别把这次切换说成去掉了原生依赖 |

## 7. Alchemist 例外保留后的样子

- `plugins/native/alchemist/package.json:36,52,58` 留依赖，`studio/server/db/open-database.ts:1`、`studio/server/sync/open.ts:1` 不动，25 处 `.transaction(` 不动。出处：`tests/builtin-plugin-assembly-gate.test.ts` 的批准例外（BL-377 重做）。
- 宿主侧的 `alchemist-search.ts` 走 `LocalSqliteStorage`，跟着切（`search.sqlite`）。
- **同一个进程里仍然有两份 SQLite**（Alchemist 在宿主里跑时）。今天也是这样，只是换了分工。安全靠 §4 那条不变量（同一个文件不同时被两份 SQLite 开着），§4 新增了拒绝用例；U1 的升级过程也算在内（§4 末段）。
- **门禁改严，切换后旧驱动只许 Alchemist 用（用户 2026-11-06 定）。** `scripts/gates/project-sqlite-driver.mjs` 的 `ownsDriver` 现在放行整个 `packages/storage/` 和 `plugins/native/alchemist/`，分两步收：
  - SQLD-d：`packages/storage/` 收窄到保留旧实现的那一个文件（`sqlite-connection.ts`）。符合性用例从 `packages/storage` 取旧实现，不直接 import。
  - SQLD-e：`packages/storage` 那一项删掉，只剩 Alchemist。符合性用例的旧驱动那一半同时删掉，期望值已经写在用例里。
  - 宿主也不许直接 import：`studio.sqlite` 不接升级链（用户 2026-11-08 定），宿主没有开它的路。门禁的变异用例：`packages/storage` 里别的文件、宿主、别的插件 import `better-sqlite3` 都失败。
- npm 和桌面产物：只要 Alchemist 还是内置插件，产物里就仍带 `better-sqlite3` 和它的原生模块。体积和准备流程这次省不下来。等 BL-377。

## 8. ExperimentalWarning

- 不新增抑制。现在 `scripts/replay-plugins.mjs:51` 和 4 个测试（`home-snapshot-errors`、`plugin-sample.e2e`、`probe-plugin`、`replay-plugins`）带 `--disable-warning=ExperimentalWarning`，`scripts/gates/page-assets.mjs:111-117` 是自己换 `process.emitWarning`，都保持。
- 生产今天就在用 `node:sqlite`，警告即使有也已经在打（写 stderr，不影响功能）。
- **官方 24.15.0 实测（2026-11-08）：不打。** 复现：`node -e "process.on('warning',w=>console.log(w.name));const {DatabaseSync:D}=require('node:sqlite');new D(':memory:').exec('select 1');setTimeout(()=>{},50)"` 什么也不输出，stderr 也是空的。用例「no ExperimentalWarning」在锁定版本上钉住，别的 Node 上只记一行诊断。
- 文档的说法不一：有的说 24.15 起没有警告，有的说要到 25.7。所以用实测，不引用。

## 9. 回滚

文件格式相同，WAL 相同，SQLite 版本差一点不影响读写（3.51.2/3 对 3.51.3），没有数据迁移。

用户 2026-11-08 定：产品还没有开发机之外的用户，**这次不考虑回退**，SQLD-e 不等 SQLD-d 稳定一轮，同一个 PR 做完（需求开发流程第 8.4 节）。真要回去就是 revert 这个 PR 再装依赖：文件格式相同，同一个库仍能打开。不加环境变量开关：两条代码路径长期并存，正是要消灭的东西。

## 10. 分片与先后

用户 2026-11-08 定：SQLD-a、c、d、e 一个分支一个 PR，一次开发、一次验收（需求开发流程第 8.4 节），一片一个提交。下表的先后是提交的先后；「前置」里「稳定一轮」那条不再适用（§9）。

| 片 | 内容 | 主要文件 | 验收 | 档位 | 前置 |
| --- | --- | --- | --- | --- | --- |
| SQLD-a 收口 | **还在旧驱动上**：窄接口删 `pluck`、命名参数；加 `readonly` 属性；`sqliteErrorName` 和全部调用点；`snapshot-sqlite.ts`、`catalog-metadata.ts` 去掉直接 import | `packages/storage/src/{sqlite-connection,snapshot-sqlite,catalog-metadata,index}.ts`、`catalog-commit.ts`、`web-catalog-access.ts`、约 6 个测试 | 全量（共享核心） | Opus 5.5 high | U1-a、U1-b（共用 `snapshot-sqlite.ts`） |
| SQLD-b 锁 Node | §2.1 | CI 3 个、`prepare-macos-runtime.sh`、`.nvmrc`、`tooling/gates/root-allowlist.json`、`package.json` `engines`；启动时的版本说明 | SQLD-06 | Sonnet 5.5 high | 用户 2026-11-06 已定（含改 CI）；F 轨文件由 F 落；原生模块在新 ABI 上重建要核 |
| SQLD-c 适配层与符合性 | §3 全部；符合性用例：同一张表对两个驱动各跑一遍，差异全在表内；含同一条语句先 `run` 再 `get`，`get` 读出的整数还是 number。在官方 24.15 上让适配层跑一遍 S-46 全部用例（§2.1）。**不切换** | `packages/storage/src/sqlite-connection.ts`（SQLD-e 时并回）、新 `sqlite-statement-shape.ts`、`tests/sqlite-driver-conformance.test.ts` | SQLD-01、02、03、04、11 | Opus 5.5 high | SQLD-a |
| SQLD-d 切换 | `openSqliteConnection` 换实现；启动说明里「插件语句不受影响」切驱动后是错的，改掉，`tests/sqlite-version-notice.test.ts` 钉的旧话一起改；`PLUGIN_STATEMENT_SQLITE_VERSION` 的注释写明版本跟 Node 走；PLIB-08 与 S-46；Alchemist 两个打开点的文件名检查；沙箱核对；打包版本断言（F 轨）；全量加浏览器 | `sqlite-connection.ts`、`tests/security-invariants-plugin-*.test.ts`、`docs/system/SECURITY-INVARIANTS.md`、`plugin-project-library.ts`、`sqlite-version-notice.ts`、`open-database.ts`、`sync/open.ts`、`prepare-runtime-payload.mjs`（F）、`scripts/gates/project-sqlite-driver.mjs`（门禁收紧第一步，§7；用户 2026-11-06 已定） | SQLD-05、07、08、09 | Opus 5.5 high | SQLD-b、c；**02③ 已做**（批次定的先后）；全量交 CI（统筹在评审后加 `full-suite`） |
| SQLD-e 清理 | 删 storage 的依赖；`ownsDriver` 只留 Alchemist（门禁收紧第二步，§7）；`sqliteErrorName` 只认一种 | `packages/storage/package.json`、`pnpm-lock.yaml`（枢纽）、`scripts/gates/project-sqlite-driver.mjs`、`tests/npm-*.{ts,mjs}`、`packages/storage/README.md` | SQLD-10 | Sonnet 5.5 high | SQLD-d（同一个 PR，§9） |

**和 U1 的先后（核过文件）。** 真实重叠只有 `packages/storage/src/snapshot-sqlite.ts`、`sqlite-baseline.ts`。U1-a、U1-b 先合，SQLD-a 接着。U1 新写的代码（升级跑法、升级快照）只用 `exec`、`prepare`、errcode，切换时不用碰。U1-c 以后和这里不共用文件，可以并行。

**和 U2。** 转储器放 `packages/storage`，也只用 `exec`、`prepare`，不依赖驱动，文件不重叠。

**02③ 其实不是技术前置。** 文件格式不变，切换不要求库是重建后的。批次写了它在重建之后，理由是别在重建窗口里叠风险，这里照旧；若 02③ 拖得很久，主会话可以重新掂量。

## 11. 开工前检查

| # | 项 | 回答 |
| --- | --- | --- |
| 1 | 事实主人 | 不新增事实；驱动归 `packages/storage` |
| 2 | 插件同等待遇 | 过。沙箱和内置同一份。Alchemist 的例外是用户批过的，不扩大 |
| 3 | 能力注册 | 不涉及：不加动作 |
| 4 | 合同 | 不改公开合同。窄接口 `SqliteDatabase` 不是公开合同（只在 `packages/storage` 和 test-kit）。`engines` 收窄对 npm 用户是外部影响，写升级须知 |
| 5 | 放在哪个包 | `packages/storage`，依赖方向不变 |
| 6 | 表与存储 | 不改表，不改版本 |
| 7 | 兼容与迁移 | 不加。没有数据迁移，没有并存开关 |
| 8 | 安全边界 | 碰 S-46（改断言，更严；PLIB-06 的拒绝由适配层接住）、S-59（核对不改）。`readonly` 静默忽略、参数静默绑 NULL、多句丢尾部、`get` 跑写语句都有拒绝测试 |
| 9 | 调用次数 | 不变。每行多一次转换，成本见 §3.3 |
| 10 | 升级与数据 | 文件格式相同，不用升级，已有的库照常打开（SQLD-09）。这次不考虑回退（§9） |
| 11 | 成果与过程项 | 不涉及 |
| 12 | 页面与外壳 | 不涉及 |
| 13 | 错误 | 不加错误码；`sqliteErrorName` 是读 SQLite 自己的错误，不是新码 |
| 14 | 冲突面 | `pnpm-lock.yaml`（枢纽）；F 轨 `apps/desktop/tooling/*`；CI（用户 2026-11-06 已同意）；门禁 `project-sqlite-driver` 收紧（用户 2026-11-06 已定，2026-11-08 批准和功能同一个 PR）；`packages/storage` 与 U1 串行；E 轨的 `plugins/native/alchemist` 只加一个文件名检查，开工前预警 |
| 15 | 全局最优 | **插件**：内置、沙箱、装上的第三方插件都走同一个连接和 S-46，同一份版本检查；第三方插件写了 `DELETE … LIMIT` 或依赖 `LIKE` 不匹配 BLOB 的，切换后行为变了，升级须知已写。Home 库的「丢第二句」对所有插件一样，统筹记 BL。**平台**：驱动归 `packages/storage`，宿主、外壳、运行时不动；比较过「只翻译接口，差异留给调用方」和「适配层接住拒绝」，选后者（§13）；代价是每行多一次转换、每个 `prepare` 多一次扫描（§3.3）。**助理**：不涉及：不加动作，助理和 Agent 调到的动作不变；Prologue 的存储另一条路（`storage-owner`）本来就在 `node:sqlite`。**平台能力**：MCP、工作流程、同步、成果库走的都是同一个连接，不用接；同步与团队的日志（`replica`）借连接，接口不变；观测采集只多一处：Host 日志的错误名（§3.6）。**后续开发**：U1 的升级跑法和转储器只用 `exec`、`prepare`、errcode，不受影响；第 U4 片之前项目库改用 `setAuthorizer`（§3.7）现在条件具备；BL-377 重做 Alchemist 时删掉第二份 SQLite 和它的文件名检查；以后升 Node 走 §2.1 那条路，SQLite 版本由 Node 定是这次切换留下的代价，每次升 Node 付一次 |

## 12. 验收

| 编号 | 证明 |
| --- | --- |
| SQLD-01 | 符合性：§3.1～3.5 每一行，两个驱动跑同一个用例，结果相同，差异只有表里写明不转的 |
| SQLD-02 | 拒绝：`{ readonly: true }` 后写被拒；未知选项抛错；参数太少、布尔、`Date` 抛错；命名参数抛错；`INSERT …; DELETE …` 抛 `more than one statement` 且两句都没执行，尾部只有空白和注释的不抛；`get`／`all`／`iterate` 跑写语句抛错且没写入 |
| SQLD-03 | 事务：提交、回滚、嵌套（SAVEPOINT）、`immediate`、SQLite 已自行回滚后原错误不被掩盖、`COMMIT` BUSY 后事务关闭；函数返回 promise 时抛 `Transaction function cannot return a promise`，写入已回滚 |
| SQLD-04 | 行是普通对象、BLOB 是 `Buffer`；`deepStrictEqual` 能过；官方 24.15 的 `compile_options` 记录在用例里 |
| SQLD-05 | 实测锁：写连接持事务，开关一次读连接后，另一进程 `BEGIN IMMEDIATE` 仍得 errcode 5（PLIB-08 新口径） |
| SQLD-06 | SQLite 版本不符时，启动说明明确，插件语句仍全部拒绝（不削弱 `:124`）；打包冒烟版本不符就失败 |
| SQLD-07 | S-59 的超时、超内存、SIGKILL 用例在新驱动上全过，数字不改 |
| SQLD-08 | Alchemist 的两个打开点都拒绝 `studio.sqlite` 以外的文件（`plugins/native/alchemist/tests/db/open-file-name.test.ts`；经宿主的路径，`tests/security-invariants-plugin-project-database.test.ts`）。检查写在 Alchemist 自己的打开点，旧驱动的 import、`.transaction(`、`package.json` 都不动，例外不扩大 |
| SQLD-09 | 全量（`full-suite.yml`）和浏览器用例通过；用切换前的库文件打开、读写一遍（一次性核对，结果在 PR 里：旧驱动写出 WAL 和回滚日志两种库，含 BLOB、索引和 trigram FTS5，新连接读写、`integrity_check` 通过，旧驱动再读回新写的行。旧驱动只留在 Alchemist，用例不能 import 它，所以不入库）。「revert 后同一个库仍能打开」用户 2026-11-08 定不考虑（§9） |
| SQLD-10 | `packages/storage` 不再依赖 `better-sqlite3`；门禁 `project-sqlite-driver` 只放行 Alchemist，别处 import 旧驱动的变异用例失败（SQLD-d 时只多放行 `sqlite-connection.ts`）；npm 冒烟通过；桌面冒烟（`tests/runtime-payload.test.ts` 跑 `prepare-runtime-payload.mjs`）在锁定版本上通过，包里的 storage 不带 SQLite 驱动 |
| SQLD-11 | 官方 24.15 上，适配层跑 S-46 全部用例（含 `tests/security-invariants-plugin-project-database.test.ts` 的 PLIB-06）全过；误拒的语句逐条写明（§2.1）；`.nvmrc`、CI 的确切版本一致，用例核对（`tests/sqlite-version-notice.test.ts`）；桌面那一项也在这个用例里：`prepare-macos-runtime.sh` 的默认版本等于 `.nvmrc`，打包冒烟比对 `sqlite_version()` 与 `PLUGIN_STATEMENT_SQLITE_VERSION` 且不另写版本号 |

## 13. 决策记录

| 日期 | 定了什么 | 否掉的 | 理由 |
| --- | --- | --- | --- |
| 2026-11-06 | **Node 升到 24.15.x 并锁定**（用户定）：`.nvmrc`、CI、桌面写确切补丁版本，现在是 `24.15.0`，`engines` 写 `24.15.x` | 把清单重读到 3.51.2 留在 24.14；清单支持多个版本 | §2.1。留在 24.14 要往旧版本重读一次清单，且低于 RC 标记；多版本工作量最大，Homebrew 也追不上。代价是 SQLite 版本从此跟 Node 走，开发机不能用 Homebrew 的 Node 跑服务 |
| 2026-11-06 | **以后补丁换 SQLite 时，同一个 PR 重读步骤清单，读完才换** | 跟着补丁自动升 | 版本不符就拒绝每一条插件语句（S-46） |
| 2026-11-06 | **适配层接住 `better-sqlite3` 的拒绝**：多句、参数太少、`get` 跑写语句、事务函数返回 promise 都照旧抛 | 只翻译接口，差异留给调用方 | 这几条都是把错误变成静默：丢第二句、写 NULL、丢原子性 |
| 2026-11-06 | **`project-sqlite-driver` 门禁改严**（用户定）：随 SQLD-d、SQLD-e 分两步收，切换后旧驱动只许 Alchemist 用 | 门禁不动，`packages/storage` 继续整包放行 | 不收的话，别的文件还能把第二份 SQLite 悄悄带回来，这正是这次切换要消灭的（§4、§7） |
| 2026-11-08 | **四片合一个 PR，不考虑回退**（用户定） | SQLD-e 等 SQLD-d 稳定一轮 | 产品还没有开发机之外的用户，回退没有要省的成本；拆开只多测一遍。需求开发流程第 8.4 节 |
| 2026-11-08 | **页缓存第一条 `prepare` 之前设，失败不算错**（统筹同意） | 打开时设 | 这条 pragma 会读文件（§3.1） |
| 2026-11-08 | **不做 `setReadBigInts`**（统筹同意） | 设计原文的条件做法 | 官方 24.15.0 上不抛（§3.3） |
| 2026-11-08 | **SQLD-08 要做**（统筹定） | 不动 Alchemist、去 BL-377 | 用户定的「这次不考虑」只说 Alchemist 的库不接升级链，没有免掉 S-46 这条验收 |

## 14. 和原设计不一样的地方

| 地方 | 原设计 | 现在 | 为什么 |
| --- | --- | --- | --- |
| §3.1 页缓存 | 打开时设 | 第一条 `prepare` 之前设，失败不算错 | 这条 pragma 会读文件 |
| §3.3 大整数 | 会抛就 `setReadBigInts` | 不做 | 24.15.0 上不抛，用例钉住 |
| §3.3 `?NNN` | 没写 | 按位置绑 | 旧驱动当命名参数，适配层跟 SQLite 走；生产没有 |
| §3.5 `progress` | 形状不变 | 只在还有页时叫 | `node:sqlite` 的行为，调用方后面本来就再查一次 |
| §3.6 错误名 | 只改三个调用点 | Host 日志也用 | 不换就丢诊断 |
| §4 文件 | 新文件放适配层 | SQLD-e 并回 `sqlite-connection.ts` | 旧实现删掉以后两个文件没有理由分开 |
| §4、§7 U1 | U1 在宿主里开 `studio.sqlite` | 不开 | 用户 2026-11-08 定不接升级链 |
| §9、§10 | 分四个 PR，SQLD-e 等稳定一轮 | 一个 PR | 用户 2026-11-08 定 |
| §6 打包 | F 轨落两个打包文件 | 本批写手放进同一个 PR，F 轨事后审 | 用户 2026-11-08 定 |
