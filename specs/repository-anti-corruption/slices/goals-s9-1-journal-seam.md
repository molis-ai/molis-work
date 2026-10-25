# Goals S9-1：Goals 与 Governance 的日志读写改经注入端口（PG-094）

状态：已实现（2026-10-24，迁移线 ac-sc3 片），PR #1260，叠在 #1245（S9-0b）上，不能先于该依赖单独合入。S9 存储搬迁的第一片，真实 Home 不碰。本片读完 `modules/goals`、`modules/governance-collaboration` 的全部语句之后，把原先按表组拆的三片改成按机制拆（第 1 节），分组改动写给统筹。#1260 首评的三项非阻塞修复由 Codex FIX15 承接：状态、执行覆盖表述与测试夹具未支持方法的拒绝；增量验证见第 3 节。

## 1. 为什么这一片是这样切的（读出来的事实）

S9 草稿（`goals-s8b-s9-runtime.md` §4、§5）设想「每片把一组表的 SQL 换成 `services.project_database`，Goals 仍由宿主装配」。读完语句之后：

| 事实 | 数据 |
| --- | --- |
| 用插件的语句检查（`pluginStatementGuard`，Goals 登记的表）检查两个模块里可独立提取的字面量 SQL；另人工审阅构造语句 | 132 句通过检查；被拒的 11 句：`events`（读游标 2、追加 2）、`idempotency_records`（读 2、写 2）共 8 句，另 3 句是 `personal_planning_method_packs`；另 13 句数组里的字符串或带条件的模板仅静态人工审阅，判断引用的是 Goals 自己的表，未在 guard 下执行，不计入执行覆盖 |
| `personal_planning_method_packs` | 在**目录库（Home）**里（`catalog-schema.ts`、`project-catalog.ts`），不在项目库；属于「个人规划」那一块，不是项目存储 |
| 日志的 8 句 | 与 `packages/storage` 的 `LocalSqliteJournal` 里的语句**逐字相同**（Goals 与 Governance 各抄了一份，理由是模块只依赖 contracts，见旧的 `table-owners.json` 登记） |
| `SAVEPOINT`/`ROLLBACK TO`/`RELEASE`（Goal Tree 的预检） | 6 条 `exec`，不是读也不是写，插件的 API 里没有对应的 |
| 宿主装配的 Goals 直接用插件的 `services.project_database` 客户端 | 不行：同步的 `prepare().all/get/run` 与客户端「事务入口异步」不是一个形状；客户端在别的插件的动作范围里被拒（`inPluginInstance`）。语句检查会按模式、SQL 与 schema 版本缓存通过结果；本片仍保留宿主直接连接，客户端切换留到 Runtime 切片 |

所以「表组」不是真分界：已检查的语句与对 Goals 自己 31 张表的人工审阅未发现搬迁时需要改写表内 SQL；这不代表全部构造语句都已在 guard 下执行。真正要改的是**日志端口**（本片）、**名字前缀与游标**（下一片）、**预检的保存点**与代码**搬进插件包**（切到 Runtime 时）。分片因此改成按机制：

| 片 | 做什么 | 要用户确认吗 |
| --- | --- | --- |
| **S9-1（本片）** | 两个模块里指向 `events`、`idempotency_records` 的语句换成宿主注入的日志端口；七个既有模块用例接入真实的语句检查，只证明其实际执行路径；删 `table-owners.json` 的两条 `shared` | 不要 |
| S9-2 | 名字前缀（事件类型、对象类型、幂等操作名、关联边 key）、Goals 自己的游标、维护脚本与一次性 Home 里的演练 | **要**（改存量数据，统筹把它与 W5-17 并成同一批问题）；确认前不合入 |
| S9-3 | `modules/goals`、`modules/governance-collaboration` 的代码搬进 `plugins/native/goals`（纯搬家，两个模块包删除） | 不要 |
| 之后 | 个人规划（等 #1083）、切到 Runtime（客户端改用 `services.project_database`、保存点预检换法、`goal-project-application.ts` 等私路删除） | |

## 2. 做法

| 位置 | 内容 |
| --- | --- |
| `modules/goals/src/repository.ts` | `GoalsJournal`（`eventCursor`、`appendEvent`、`getIdempotency`、`putIdempotency`）；`GoalsRepository(db, journal)`，原来的四段 SQL 换成委托 |
| `modules/goals/src/index.ts` | `GoalsModule(db, journal, hooks, options)`、`createGoalReadServices(db, journal)`；导出 `GoalsJournal` |
| `modules/governance-collaboration/src/*` | `GovernanceJournal`；`GovernanceRepository(db, journal)`；`GovernanceRecordStore`、`GovernanceGoalTreeRecords`、`GovernanceProposalOperationStore` 往下传；提案的幂等记录的读写换成 `getIdempotency`/`putIdempotency`；`GovernanceDecisionTransactions` 只要事务，不再借仓库 |
| 宿主 | `goal-project-application.ts`、`project-database.ts`、`feed-application.ts` 把 `LocalSqliteJournal`（项目库本身）传进去；语义不变，语句与之前逐字相同 |
| `tests/fixtures/plugin-legal-sql.ts`（新） | `pluginLegalSql(store)`：用 `pluginStatementGuard` 包住项目库连接，statement 只支持模块现有合同的 `all/get/run`，先检查再执行；`iterate`、配置/链式方法及其他未支持成员明确抛错，不透传原 statement 或连接。七个消费者不需要 statement 元数据，故不另开放。`exec` 只放过 6 条预检保存点；`stats.checked` 计检查尝试次数，`savepoints` 只记用例实际执行到的保存点。它是测试接缝，不是产品路径（原因见第 1 节最后一行） |
| 既有测试 | `goal-events`、`goals-command-module`、`goals-query-module`、`goals-query-facts`、`project-policy-save`、`planning-engine`、`governance-collaboration-module` 的模块都改成建在 `pluginLegalSql(store).db` 上：这些用例（目标事件、规划、治理的树提案与决定、命令、查询）整套在真实的检查下通过 |
| `tooling/gates/table-owners.json` | 删 `events`、`idempotency_records` 两条 `shared`（登记里写明「后续步骤做完就删」；门禁两头核对，用到的包不在了就失败） |
| `docs/system/HOME-DATA.md` | 4.5 与待办两处改成现状 |

## 3. 验收

- **RAC-283**：两个模块的源码里没有指向 `events` 或 `idempotency_records` 的语句（静态扫描）；运行时 Goals 的事件追加、游标、幂等记录读写都经注入的日志端口，同一个键重放不再追加事件。（`tests/goals-storage-plugin-legal-sql.test.ts`；变异：把 `eventCursor` 改回直接 SQL，静态扫描和整套 `goal-events` 用例都失败）
- **RAC-284**：模块跑在其下的语句检查是真的：Goals 自己的表通过 `all/get/run` 正常读写，`events`、`idempotency_records`、别的主人的表和自由的 `exec` 都被拒。真实坏语句的 `iterate` 与其他未支持 statement 方法明确抛错，不读取结果、不执行 SQL 函数、不修改行；合法事务提交、失败回滚仍成立。（同上）
- **RAC-285**：在这套用例实际执行到的 SQL 中，绕过插件语句检查的已知例外限定为 Goal Tree 预检的六条保存点语句，测试钉住实际观察到的集合与预检回滚效果。该运行时夹具不证明所有分支或全部 SQL 已执行；第 1 节的 13 句构造语句只有静态人工审阅证据。切到 Runtime 时换掉预检的做法再删保存点例外。（同上）

FIX15 增量验证：整体 `pnpm build`；本文件对应回归与上述七个 fixture 消费用例（`node scripts/run-tests.mjs --jobs 2` 点名文件）；`pnpm boundary:check`；`node scripts/check-health-gates.mjs --base origin/main`；推送前鲜取 main 并 `pnpm secrets:check`。新增量验证待运行，原作者的 11/60 文件结果只保留其原范围；全量及 #1245 的合并冲突由 Claude 在批次处理，不在本片另跑。

## 4. 不做、留给后续

- 日志事件、幂等记录的名字不加前缀、游标不换成自己事件的末尾：S9-2（要用户确认）。
- 不在产品里启用语句检查：见第 1 节，切到 Runtime 时由平台的客户端做。
- 目录库里的 `personal_planning_method_packs`：个人规划那一块。
- 保存点的预检：切到 Runtime 时处理（预检要在事务里算再回滚；插件 API 没有保存点）。
