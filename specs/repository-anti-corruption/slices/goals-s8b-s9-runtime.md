# Goals S8 另一半与 S9：项目库身份归项目，Goals 上 Plugin Runtime（PG094-10 余项、PG094-11）

状态：草稿，第 6 节九问统筹已裁（10-23），可以开工（2026-10-24，迁移线 ac-sc3；只读 main `27bb3c212` 和在途 PR 写成，没有改代码、没有跑构建或测试）；标「推断」的地方是读代码得出、没有运行验证的，开工前要核。

## 1. 目标

PG-094 的最后两步：

- **S8 另一半（PG094-10 余项，PG-021）**：项目库的身份是 `project_root`，不再是 Goals 的看板。宿主建库、验库、开发门不再因为 Goals 才能做。
- **S9（PG094-11，含 BL-386）**：Goals 以 `createGoalsPlugin`、`kind:"app"` 由 Plugin Runtime 监督器启动；宿主不再替它装配；页面操作经 Runtime 分发。之后 Goals 和别的插件待遇一样（用户 2026-10-18 定）。

## 2. 现状（main 对账）

| 片 | 状态 | 证据 |
| --- | --- | --- |
| S1 内置调用者名单 | 已做 | #812 |
| S4 宿主不碰协调器 | #1146 待合 | 余下持有者冻结在 `tests/goals-host-no-direct-reads.test.ts`，每条写了由哪一片删 |
| S5 内部类收进包内工厂 | 已做（10-22） | `createGoalsApplication` |
| S6 决定提醒对账 | 已做（10-23） | PG-033 第一步 |
| S7 请求助手、31 条路由进 Manifest | 已做（10-23） | `goalsRoutes`；宿主 `web-request.ts` 的 `goals` 条目按旧地址改写分发（BL-386） |
| S8 表那一半 | 已做 | #881：31 张表由 Goals 的 Manifest 声明，基线 v8 不再带；`boards` 没有 `title`、外键指 `project_root` |
| 平台 X-5 L1/L2/L3 | 已做 | #867、#881、#903（`services.project_database`） |
| 先例 | Coding C1、C2 已做 | #932、`5d8e4f643`：会话库走 `services.project_database`，宿主不再递原始库句柄 |
| PG-029 可信 `user_action` | 平台一半在途 | #1117；Goals 转接里手写的 web 与管理出处随 S9 删，受保护入口的幂等消息身份和整份确认依据仍归 S9 |
| PG-087 attention、context-ledger 服务 | 未做 | `PluginHostServices` 没有这两项 |
| PG-012 双实例 | 平台一半已做（#891、#893、#1050） | Goals 一半未做：`registration.ts` 没有 `runtime`，个人规划两个 home 动作在 Manifest 已声明、实现仍走 `personal-planning-actions.ts` 的私路 |
| W5-06 / PG-060 | 在途 | #1098、#1107、#1112；PG-094 一行把它列为迁 Goals 的前提，原计划却把「删手写舞台」放在 S11 |
| T1（动 `project-plugins.ts` 与装配门禁的冻结） | 无书面解冻记录 | #840 之后两处又被改过多次，事实上能改（推断） |

## 3. S8 另一半

**已实现为独立一片（分支 `migrate/goals-s8b-library-identity`，叠在 #1146 上），以 `goals-s8b-library-identity.md` 为准，本节留作背景；实现与本节的差别：开发门不改（它是显式建根行和看板的调用方，和管理入口的 `initialize` 同类，S9 改调动作）；看板只在库「有根行却没看板」时由打开项目建，没有根行的新库仍由 `goals.board.initialize` 一并建根行和看板，所以管理入口的第一次调用仍是 `replayed: false`。**

**要改什么**（四个文件，加一个测试清单项）：

| 位置 | 现在 | 改成 |
| --- | --- | --- |
| `managed-project-database.ts` `initializeProjectDatabase` | 建库时调 `GoalProjectApplication.initializeBoard`：同一事务里写根行和看板 | 只写根行（`modules/projects` 的 `writeProjectRoot`），不建看板 |
| 同文件 `validateManagedBoard` / `readManagedBoard` | 要求恰好一个看板、根行与它同 id、再读 Goals 的快照 | 只认根行：恰好一行、与记录的 `project_id` 相同、完整性检查通过；不读 Goals 的表（名字随 GLOSSARY R-A1 的 Board 改名一起定） |
| `local-plugin-development.ts` | 开发门起库先 `initializeBoard` | 不建看板；开发插件需要 Goals 的事实时经动作 |
| `demo-plugin-seed.ts` | 先问「演示项目的看板在不在」 | 问根行在不在 |
| `project-database.ts` | `LocalProjectDatabase` 带 `goalsQuery` 和 `snapshot()` | 留到 S9（第 4 节），本片不动 |

**看板由谁建**：Goals 打开项目时自己建（幂等，键固定）。S9 之前是宿主的 Goals 装配（`goalsActionProvider`，已经在这里调 `projectOpened`），之后是 Goals 的 `start()`。**依据**：`goals.board.initialize` 已是 v2，输入只有 `idempotency_key`；建库发生在项目登记之前的暂存目录里，那时没有项目运行时，调不了动作，所以不能让宿主改调动作，只能把「建看板」从建库挪到打开。

**为什么先于 S9 单做**：S9 要把看板的创建、读取全部交给 Goals，库的身份先不依赖它，两步才不互相卡住。另一个理由（推断）：`managed-project-files.ts` 在建项目重试、领养已有的稳定 id 库时，和样例项目的生命周期（`demo-project-lifecycle.ts`）对已有的库调 `validateManagedBoard`，它读 Goals 的表；Goals 的库被拒（PLIB-14：只停 Goals，库和别的插件照常开）时表可能读不到，这些路径就因为 Goals 的状态失败。单做这一片能让 PLIB-14 对建库、验库也成立。

**验收（草稿，RAC 号开工时从 261 起顺排）**：

- S8b-1：新建项目后库里恰好一行根记录，没有看板；打开项目后 Goals 建出看板且重复打开不再写。
- S8b-2：Goals 的库被拒（缺表）时，`validateManagedProject` 仍通过，项目照常打开，Goals 页说明原因。
- S8b-3：`demo-plugin-seed`、开发门、`managed-project-database` 不再名 `goalsQuery`、`initializeBoard`；`tests/goals-host-no-direct-reads.test.ts` 里对应条目删掉（清单只许减少）。
- S8b-4：已有项目（已有看板）打开后行为不变，看板没有重复。

## 4. S9

**做什么**（六块，顺序见第 5 节）：

1. **Goals 的存储搬进插件**：`modules/goals`（顶层约 9,400 行）和 `modules/governance-collaboration`（约 970 行）里读写那 31 张表的 SQL 改走 `services.project_database`（逐句检查，写只在 `transaction` 里），搬进 `plugins/native/goals`，两个模块包删除。`tooling/gates/table-owners.json` 里 Goals 表的 `shared` 条目同时删（`events`、`idempotency_records` 的 Goals 与 Governance 使用者也删，见第 6 节第 3 问）。`createGoalReadServices`、`readMolisWorkSnapshot` 的宿主使用者（Feed、`LocalProjectDatabase`、`project-catalog`）改读动作。
2. **`createGoalsPlugin`**：`kind:"app"`，`start()` 里拿服务；项目级加监督器条目（`apps/local-host/src/project-plugins.ts`）；个人规划的 Home 一半按双实例（`registration.runtime`）装配；`manifest.ts` 的 `native` 与注释改掉。
3. **路由走 Runtime**：删 `web-request.ts` 的 `goals` 条目里的改写；客户端改打 `/api/plugins/io.molis.work.goals/…`；声明了权限的路由对照安装授权（现在传空，一律拒）；执行由平台给；通用分发函数没有别的使用者时一起删；`scripts/check-package-boundaries.mjs` 的 goals-command-owner 规则改认新的挂载点（BL-386）。短路径 `/api/goals…` 同时删，不留兼容层（D2；已核：CLI 与 MCP 管理入口走动作客户端，不走这条 HTTP，仍在用它的是工作台与成果库插件自己的页面脚本，`apps/workbench/src/goal-inputs-html.ts`、`scripts/client/placement.ts`、`terminal/client-prompt.ts` 和 `plugins/native/artifacts/src/goal-input-client.ts` 要一起改）。
4. **删宿主私路**：`goals-actions.ts` 整个删；`web-request.ts` 里 Goals 的行删；`project-host.ts` 的协调器、`goal-project-application.ts`、`demo-seed.ts` 的直接写（样例项目改经动作）、第 2 节冻结清单里剩下的持有者删到零。CLI 与 MCP 管理入口的绑定（`bindGoalsManagementActions`、`readProjectGuidance`）挪出被删的文件：钉死 `GOALS_PLUGIN_ID` 是 2026-10-10 选 (a) 后认可的内置规则，Runtime 里的 Goals 同样成立，所以不必等 BL-501；挪出来的绑定文件不点名 Goals，按 Manifest 声明的能力绑定（统筹 10-23 裁的条件）；通用化归 BL-501。
5. **身份与出处**：Goals 转接里手写的 web、管理 `user_action` 删，改由入口给（#1117）；旧语义里的**幂等消息身份**（重试用同一键）和**整份确认依据**（`whole_confirmation_prompted`）不能在替换中丢，要在 S9 里写成入口上下文的一部分并有拒绝测试。
6. **登记**：`tests/builtin-plugin-assembly-gate.test.ts` 冻结名单去掉 `goals`；以插件命名的宿主文件减一（`goals-actions.ts`）；`node scripts/gates/package-inventory.mjs --table` 重生包清单；privileges.md 的 PG-004、PG-012、PG-020、PG-021、PG-029、PG-031、PG-058、PG-094 状态更新；删 BL-386。

**验收（草稿，号从 RAC-261 起顺排，开工时定稿）**：Goals 在 Runtime 监督器下运行，被停用或被拒时只停自己；`goals-actions.ts`、`web-request.ts` 的 Goals 行、COORDINATOR_HOLDERS 与 TABLE_READERS 清单为空；31 张表的读写都过 `services.project_database`；旧短路径 404；管理入口、网页入口的 `user_action` 都由入口给，伪造的被拒；Goals 页输出与迁移前逐项相同。

## 5. 顺序

```
S4(#1146) ─▶ S8b ─▶ S9-0 journal 端口 ─▶ S9-0b attention / context-ledger 服务
          ─▶ S9 存储搬迁 ×3（Goals 仍由宿主装配）─▶ 个人规划（等 #1083）─▶ 切到 Runtime
平台前置里本线不做的：#1117（PG-029，ac-kernel 的）
```

S8b 不依赖平台前置，可以现在做。S9 存储搬迁拆三片，每片内 Goals 仍由宿主装配，每片都能独立回滚。**分法（2026-10-24 读完两个模块的全部语句后改，原先按表组拆）**：Goals 自己的 31 张表的 SQL 用插件的语句检查逐句跑过，全部放行，不用改写；不过的只有日志（`events`、`idempotency_records`，8 句）、保存点预检（6 条 `exec`）和目录库里的 `personal_planning_method_packs`（个人规划那一块）。所以按机制拆：**S9-1** 日志端口（模块里不再有指向那两张表的语句，测试里让模块用例跑在真实语句检查之下；`goals-s9-1-journal-seam.md`）；**S9-2** 名字前缀、Goals 自己的游标、维护脚本与一次性 Home 里的演练（改存量数据，等用户确认才合入）；**S9-3** 两个模块的代码搬进 `plugins/native/goals`（纯搬家，两个模块包删除）。保存点预检的换法、客户端改用 `services.project_database` 与私路删除，在个人规划之后切到 Runtime 时做。原先的「表组」三分（Goal 树与关系、事件与治理、输入与成果绑定）作废。

**T1 解冻仅限 Goals 条目，统筹 10-23。**

## 6. 统筹 10-23 裁（九问的答复，统筹同时代 ① ② 确认）

| # | 问题 | 裁定 |
| --- | --- | --- |
| 1 | S8b 单做，「建看板」从建库挪到打开项目 | 同意。S9 之前由宿主的 Goals 装配建，之后是 `start()` |
| 2 | T1 对 S9 解冻吗 | **T1 解冻仅限 Goals 条目，统筹 10-23**：Goals 从旧路径搬到 `project-plugins.ts` 的监督器，冻结名单只减不增。合入后统筹更新 privileges.md 的 T1 行 |
| 3 | 日志与幂等记录的端口 | 同意：事务句柄上的方法（`append`、`getIdempotency`、`putIdempotency`），表仍在 `packages/storage`，主人不变。**由本线做，是 S9 的第一个 PR（S9-0 journal 端口）**，带 S-63（取消、撤权之后端口什么都不写）和各种拒绝的测试 |
| 4 | 存储搬迁按表组拆三个 PR | 同意。Goals 在最后一个 PR 之前仍由宿主装配 |
| 5 | S9 不等 BL-501 | 同意，附一条：**挪出来的管理入口绑定文件不点名 Goals，按 Manifest 声明的能力绑定**；通用化仍归 BL-501 |
| 6 | 个人规划放进 S9 | 同意。照 Shelf 的双实例写法（#1083 S4，加 #1147 的 RAC-198：一个安装号只对应一个插件）。**在 #1083 合入之后才开始这一块** |
| 7 | 页面拼装不变，S11 在 #1107 之后 | 同意 |
| 8 | PG-087 的 attention、context-ledger 服务 | 由本线做，原先在 ac-sandbox-sched 的 Feed/Inbox 批里，现移来，作 **S9-0b**，在存储搬迁之前完成；Feed 与 Inbox 之后复用 |
| 9 | 编号 | 本线 **RAC-260～299**（BL-384 用 RAC-260）、**BL-505～519**、**S-62**（`user_action` 由入口上下文给）、**S-63**（journal 端口在取消、撤权之后不写） |

另（统筹 10-24）：命名空间改名与存量维护见第 6a 节。

另：`/api/goals/:id/advance-prompt` 现在不动，S9 时和别的 Goals 路由一起进 Goals Manifest 声明的路由。

**顺序**（全部本地做，PR 按序在 #1130 或 #1146 合入后开，同时最多开两个；每片做完就推分支）：sc4b → BL-385 → SC-5 → BL-383 → BL-384 → S8b → S9-0 journal 端口 → S9-0b PG-087 服务 → S9 存储搬迁 ×3 → 个人规划 → 切到 Runtime。

## 6a. 统筹 10-24 裁：命名空间改名与存量维护

**起因**：S9-0、S9-0b（RAC-280、281）定了插件写进项目共享表的名字都以 `<plugin_id>.` 开头：日志事件的 `type`、`objectType`，幂等记录的 `operation`，关联边的 key；日志的读也只看自己命名空间的事件。Goals 现有的名字不带前缀（事件类型如 `board.created`、`goal.created`、`goal_tree_proposal.decided`、`relation.added`，对象类型如 `goal`、`relation`、`project_guidance`、`goal_work_event`、`board`，还有幂等操作名和输入绑定用的关联边 key），Goals 经 `services.project_database` 写它们之前必须改成带前缀的，已有的行要一并改。

**这会改真实 Home 里的存量数据，要用户确认。** 统筹把它与 W5-17 的目录维护并成同一批问题，建议同一个维护窗口。用户确认之前，本线只做设计（下）和在一次性 Home 里的实现与演练，不碰真实 Home，也不对真实 Home 的库做拷贝演练（那也要问）。

**落在哪一片**：随 S9-2（S9-1 先把 Goals 的事件、幂等记录接到日志端口，见 `goals-s9-1-journal-seam.md`）：名字改成带前缀的，维护在这个版本发布前后的窗口跑。代码只认现行名字（不兜底旧名，`CONTRACT-CHANGES.md`、AGENTS 的「合同读写都只认现行取值」），所以数据和代码同一个版本。

**维护脚本的设计**（`scripts/maintenance/` 下，开工时定名；先读后写，默认只列不写）：

| 项 | 做法 |
| --- | --- |
| 映射 | 一份映射表：旧名 → `io.molis.work.goals.` + 旧名，类型、对象类型、幂等操作名、关联边 key 各一栏；映射表由 Goals 代码里实际写过的名字生成并和库里扫出来的名字对照，**不凭记忆列**（上面的例子只是例子） |
| 涉及的列 | `events.type`、`events.object_type`、`idempotency_records.operation`、`context_edges` 的 key（含这个 key 的所有历史行）、以及引用这些名字的 Goals 自己的列（如 `goal_input_bindings.source_edge_key`、事件状态表里存的类型名）；`list` 模式扫全库里 Goals 的表，找出所有存着这些名字的列，漏的列比多的列危险 |
| `list` | 只读：按表、按列、按旧名统计行数，列出会冲突的项，列出库里**不在映射里**的名字（不属于 Goals 的平台名如 `inbox_entry.*` 不动；Goals 的表里出现映射外的名字当作冲突） |
| 冲突即整体不写 | 以下任一项就退出码非 0、**一行都不写**：新名已存在（同一条记录新旧两份都在）；Goals 的表里有映射外的名字；同一个 key 的历史行里新旧混用；库正被别的进程占用（4207/4208 的 Home 锁，必须先停服务）。已经带前缀的行跳过，所以重跑是空操作 |
| 一个事务 | `BEGIN IMMEDIATE`，所有 `UPDATE` 在一个事务里，之后在同一事务里校验：旧名行数为 0、各表总行数与前相等、被改的只有名字列（其余列的校验和不变）、`PRAGMA integrity_check` 与 `foreign_key_check` 通过；任一项不过就 `ROLLBACK`。写之前先 `VACUUM INTO` 出一份备份放在库旁边，脚本打印它的路径 |
| 演练测试 | `tests/goals-names-prefix-maintenance.test.ts`，一次性 Home（`seedDemoBoard` 加覆盖每张表每个名字的合成行）：`list` → `rewrite` → 再 `list` 为空；行数不变、除名字外内容不变；第二次运行不写；冲突（新名已存在、映射外的名、新旧混用、库被占用）都整体不写且库文件逐字节相同；在第 N 个 `UPDATE` 之后注入故障，回滚后库逐字节相同；新构建的 Goals 用改后的库读写通过 |
| 不做 | 不在启动时自动跑（用户确认的窗口里手动跑）；不留旧名兼容读 |

**待用户确认的问题**（统筹汇总）：是否做这次改名；与 W5-17 同窗口；是否允许先对真实 Home 的备份拷贝演练一次。回答之前 S9-2 的名字改动不合入。

## 6b. 统筹 10-24 裁：Goals 读日志的现状清单与跨插件数据的通道

**裁定**：日志是各主人自己的存储，插件只读自己命名空间的事件（S-63，RAC-282，已推送），不加 Manifest 字段，也不借 `events.subscribes` 声明日志类型。数据要跨到别的插件，走公开通道：对方在事件总线上发布事件，Goals 用 `events.subscribes`（带版本、`from_plugin_ids`）订阅；是事实就调对方的查询动作。S9 之前 Goals 只读得到自己的事件没有用户可见的变化（Goals 还是宿主装配的）。

**今天 Goals 的游标和活动流读到什么**（读了 `modules/goals`、`modules/governance-collaboration`、`plugins/native/goals`、`apps/local-host/src/goals-actions.ts`、`apps/workbench` 里所有读日志与游标的地方，并扫了所有非 Goals 的 `appendEvent` 写入点）：

| # | 读到的 | 谁读 | 是不是跨插件 | S9 之后走的路 | 归 |
| --- | --- | --- | --- | --- | --- |
| 1 | Goals 自己写的事件类型：`goal.created`、`goal.updated`、`goal.accepted`、`goal.trashed`、`goal.restored_from_trash`、`goal.event_config.*`、`goal.event_state.*`（含 `closure_submitted`）、`goal.work_event.recorded`、`relation.*`、`goal_tree_proposal.*`（`decided` 等）、`board.*`、`planning.method_saved`、`policy.project_defaults_saved`、`project.guidance_added`；对象类型 `goal`、`relation`、`goal_work_event`、`goal_tree_proposal`、`board` 等 | 目标文档的历史与时间线（`mapJournalHistoryItems`、`createGoalDocumentIndex`）、动量（`goalActivityTimes` 按前缀 `goal.work_event.`、`goal.event_state.`、`goal.event_config.`、`relation.`）、决策结果（`goal_tree_proposal.decided`）、收尾判定（`isAppliedGoalCompletion`） | 不是，都是 Goals 自己写的 | 不需要通道。随第 6a 节的改名带上 `io.molis.work.goals.` 前缀，读成「自己命名空间的事件」 | ③ 本线，S9「事件与治理」那一组 |
| 2 | `contract_` 前缀（`momentum-cadence.ts` 的 `PROGRESS_EVENT_PREFIXES`） | 动量 | 没有任何写入点写这个前缀，是死前缀 | 删掉 | ③ 本线，同上 |
| 3 | `inbox_entry.*`（`inbox_entry.created` 等） | Goals 只写不读：现在由 `goal-project-application.ts` 经注意力模块写，S9-0b 之后由平台服务写；条目本身 Goals 经 `services.attention` 读，不读日志里的这些行 | 不是读 | 不需要通道 | ③ |
| 4 | 别的写入者的事件：`artifact.*`/`process_item.*`（成果库）、`feed_source` 和 Feed 条目、`judgment`（首页）、项目与工作区、上下文绑定、Work 的交接与终端记录 | 历史按 Goal 和关系的 id 取事件，只会取到 Goals 自己的行；没有别的写入者拿 Goal 或关系的 id 当 `object_id` | 现在不读 | 不需要通道。S9 加一条对照测试：把日志缩成只有自己命名空间的事件，历史、动量、决策结果、时间线的输出不变（演示项目） | ③ |
| 5 | 游标 `eventCursor`：全日志 `MAX(seq)`，约二十处，作 `observed_event_cursor`、`base_event_cursor`、确认有效性检查（`event-acknowledgement.ts` 拒绝大于当前游标的值） | Goals 的命令与查询、治理的提案基线、页面 | **是，实际上是**：任何插件的事件都推进它 | Goals 用自己的游标（日志端口 `eventCursor()`，自己事件的末尾）。混用风险要消掉：页面把宿主拼出来的 `view.snapshot.cursor`（全日志）当 `observed_event_cursor` 回传 Goals 的命令（`capsule.ts`），刷新判断拿 `/api/board/cursor`（宿主路由，全日志）对比 `snapshot.cursor`（`refresh-decisions.ts`）。所以三处要同一来源：`snapshot.cursor` 取 Goals 查询给的游标，`/api/board/cursor` 进 Goals Manifest 声明的路由并返回 Goals 的游标。通道是 **Goals 自己的查询动作**，不用总线 | ③ 本线（路由与查询）；拼页面的宿主端最小改动也由本线做，页面拼装整体归 S11 |
| 6 | `/api/attention` 的 `board_cursor`（`attention-http.ts`） | 客户端把它当「有变化」的提示，收到后再取 `/api/board/cursor` 精确对比（`initialization.ts`） | 是宿主读自己存储的全项目游标，不是插件读 | 保持全日志、不改：多一次空请求，不会误判 | 不动 |
| 7 | （不是日志，是关联边，同一条原则）Goals 写的 `goal.input`、`goal.output` 边，**成果库插件在读**：`plugins/native/artifacts/src/goal-context.ts` 的 `readGoalArtifactEmbeds` 经账本直接列出以某个 Goal 为源的边，给 Goal 页嵌入输入与交付物 | 成果库（`artifact-native-plugin-http.ts` 的 Goal 情境页） | **是**：别的插件读 Goals 命名空间的边 | `services.contextLedger` 只给自己命名空间的边（RAC-281），成果库迁到服务之后这个读就读不到。路径：**动作查询**，成果库调 Goals 的公开查询动作取某个 Goal 的输入与交付物（`deliverable-actions.ts` 一带的读动作，没有现成合适的就在 Goals Manifest 里加一个，那是合同变化，按 `CONTRACT-CHANGES.md`），成果库不再读边 | 成果库迁到服务的那一片的线（不在本线）；Goals 的查询动作由本线在 S9 里备好 |

**没有哪一项两条路都走不通**，所以没有要再问统筹的项。第 5 项是 S9-2 里最容易漏的一块：三处游标换成同一来源要和日志读一起改，并带一条拒绝测试（页面带全日志游标回传，Goals 的确认不会把它当作未来的游标拒掉，或者页面的游标就是 Goals 的）。

## 7. 门禁与风险

- 巨大单元只许变小：搬迁后 `GoalEventState`、`GoalEventFacts`、两个仓库类在新位置仍要在阈值内，不能因为搬家变成「新增的巨大单元」（对 merge-base 不是巨大单元的，登记也不放行）。
- page-assets：改客户端路径会改 `molis-work-workbench.js` 的字节；净增要在 PR 里写明，不预支额度（>10 KB 或新资源先问用户）。
- 动作合同快照：S9 不改动作；若第 1 块要升版本，按 `docs/system/CONTRACT-CHANGES.md`。
- 安全不变量：身份只从上下文来；不从输入读 `user_action`；撤权、取消、停用后不写业务记录（含 Goals 的失败记账）；新增或改动一条要同步 `docs/system/SECURITY-INVARIANTS.md`，向统筹要 S 号。
- 本机延后验证：存量项目库（有看板、有 31 张表）在新构建下打开、重开、关闭，要用真实 Home 的备份拷贝演练，不碰真实 Home。
