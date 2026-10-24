# Goals S9-2：日志里 Goals 的名字有了自己的命名空间，游标只数自己的事件（PG-094）

状态：已实现，等用户确认后才合入（2026-10-24，迁移线 ac-sc3 片，叠在 S9-1 的分支上，不开 PR）。S9 存储搬迁的第二片。**改存量数据**：每个项目库的 `events`、`idempotency_records`、`context_edges`、`input_bindings` 里 Goals 写的名字要加前缀，Goals 的库版本 1 → 2；用户确认之前不合入，真实 Home 不碰（统筹 10-24 裁定「维护脚本只在一次性 Home 里演练」）。

## 1. 为什么要改

日志端口（S9-1）之后，Goals 通过 `journal:project` 写 `events`、`idempotency_records`，而这两张表是整个项目库共用的日志：平台对插件事件的规则是 `ownsEventType(pluginId, name)`，即名字以 `<插件 id>.` 开头才是它的（统筹 10-24 裁定：Goals 用自己的命名空间，不加 Manifest 字段、不加 `events.subscribes`）。Goals 原来写的 `goal.created`、`board.created`、`relation.added`……没有前缀，既不属于 Goals 也无从分辨；游标 `eventCursor` 数的是整个项目库的事件，别的插件的写入也会让 Goals 的游标前进。

| 名字 | 现在 | 之后 |
| --- | --- | --- |
| 事件类型、对象类型 | `goal.created` / `goal` | `io.molis.work.goals.goal.created` / `io.molis.work.goals.goal` |
| 幂等记录的操作名 | `create_goal` | `io.molis.work.goals.create_goal` |
| 关联边的 key | `goal.input:<绑定>`、`goal.output:<Goal>:<成果>`、`goal.input.proposal:…` | 同上加前缀（`input_bindings.source_edge_key` 随之） |
| Goals 的游标 | 全项目库事件的最大 `seq` | 只数前缀内的事件 |

前缀常量：`@molis-ai/molis-work-contracts/modules/goals` 的 `GOALS_JOURNAL_NAMESPACE`，值恒为 `GOALS_PLUGIN_ID + "."`（RAC-286 钉住）。点号结尾的 id 前缀问题（BL-506）属于 ac-trust，这一片不碰。

## 2. 做法

| 位置 | 内容 |
| --- | --- |
| `modules/goals`、`modules/governance-collaboration` 的仓库 | 在端口处加前缀：`appendEvent` 的 `type` 与 `objectType`、`getIdempotency`/`putIdempotency` 的 `operation`；调用方（命令、测试里的原文）仍写短名，前缀只在一处 |
| `modules/goals/src/input-bindings.ts`、`plugins/native/goals/src/deliverable-actions.ts`、`apps/local-host/src/demo-plugin-seed.ts` | 台账边的 key 加前缀 |
| `packages/storage` `eventCursor(projectId, objectType?, typePrefix?)` | 多一个前缀参数，只数前缀内的事件 |
| `apps/local-host/src/goals-journal.ts`（新） | `goalsJournal(journal)`：Goals 与治理拿到的日志，游标是自己的；`goalsEventCursor` 给页面与动作用 |
| `plugins/native/goals/src/journal-events.ts`（新） | `goalsJournalEvents`：只留前缀内的事件并去掉前缀，Goals 的事件读取与日志读取都过它 |
| `goals-actions.ts`、`web-project-platform-routes.ts` | `/api/board/cursor` 与动作的游标改用 Goals 自己的；注意力的游标（`attention-http`）仍是全局的 |
| `plugins/native/goals/src/project-database.ts` | `GOALS_PROJECT_DATABASE.version` 1 → 2。旧版本的库不改名字就打开 Goals，读不到历史、重放不到幂等记录，所以版本不符时 Goals 单独被拒（PLIB-14），不静默读错 |
| `scripts/maintenance/goals-namespace-prefix.mjs`（新） | `list <库>`（只读）、`rewrite <库>`（一事务）。规则、冲突与保护见第 3 节 |
| 夹具 | `tests/fixtures/goal-event-history/*.sql` 按脚本规则改一遍并写明（与脚本对原件的输出逐字相同，已核对） |
| 检查清单第 3 节、spec §4.1 库版本维护清单、检查清单维护八 | Goals 的库 1 → 2 各一行 |

## 3. 维护脚本

事务内 `BEGIN IMMEDIATE`，忙则退出码 2、不等待。改什么：

- `events`：对象类型在 Goals 的名单里（含旧版本留下的 `policy`）且事件类型属于 Goals 的族时，类型与对象类型一起加前缀；只有一个是旧名，或 Goals 的对象类型下出现名单外的类型，是冲突；
- `idempotency_records`：所有没有前缀的操作名；新名字已存在是冲突；
- `context_edges`：Goals 的三种关联边类型的 `edge_key`（各修订一起；同一条边的修订有的改有的没改是冲突）；`input_bindings.source_edge_key` 随之；
- Goals 其余表的文本列里还残留旧名（没人改的）：冲突，不带着写；
- Goals 的账本行：版本 1 在同一事务里写成 2；已是 2 却还有旧名是冲突；没有账本行却有要改的是冲突。

保护：改之前后各做一份「去掉名字的行」的指纹，必须相同；`integrity_check`、`foreign_key_check` 不过整笔回滚；改之前 `VACUUM INTO` 一份备份；有冲突什么都不写（退出码 1）；重跑什么都不改（`nothing to rename`）；`afterUpdate` 钩子供测试在第 n 次更新后注入故障。

## 4. 验收

- **RAC-286**：前缀在端口处加一次：`GOALS_JOURNAL_NAMESPACE === GOALS_PLUGIN_ID + "."`；Goals 与治理写进日志的事件类型、对象类型、幂等操作名、台账边 key 都以它开头；Goals 的游标不被别的插件的事件推进，页面传来的全局游标不会因游标不一致被拒（6b 第 5 条）。（`tests/goals-journal-namespace.test.ts`）
- **RAC-287**：`list` 只读：按旧名报行数，列出前缀改不到的名字（别的主人的事件、边），文件字节不变。（`tests/goals-names-prefix-maintenance.test.ts`）
- **RAC-288**：`rewrite` 之后，旧形状的库与当前构建新建的库名字逐行相同；重跑不写任何东西、不再做备份。
- **RAC-289**：改过的库能被当前构建打开并正常工作：历史读得到、绑定的来源边找得到、旧幂等记录在新名下重放、新写入落在前缀下。
- **RAC-290**：五类冲突一个字都不写，文件字节不变，退出码 1，不做备份。
- **RAC-291**：第 n 次更新后注入故障，对每个 n 都回滚；库忙时退出码 2。
- **RAC-292**：账本行仍是版本 1 的库，Goals 单独被拒（`plugin.project_database.version_mismatch`），库本身与别的插件照常。（`tests/goals-project-database-refusal.test.ts`）
- **RAC-293**：真实 Home 的试跑里出现的两种形状：旧的 Goals 合同事件（`contract.` 开头、挂在 goal 对象上）和改名一起改；Feed 的迁移事件（`feed.` 开头、挂在 board 对象上）保持原名并算「别人的」，不再让整笔停下。（`tests/goals-names-prefix-maintenance.test.ts`）

## 5. 不做、留给后续

- 真实 Home 的维护：用户定在与 W5-17 同一个维护窗口、由用户选时间（10-24）；在停宿主、整份备份之后做。顺序：先项目库 v7 → v8（`tests/fixtures/project-maintenance-v8.sql`，同时写下 Goals 版本 1 的账本行）、v8 → v9（`project-maintenance-v9.sql`），即 BL-413；再 W5-17；最后本脚本。当前 main 的项目库基线是 9，版本 7 的库打开即被拒、文件不动，从不原地升级。
- 2026-10-24 对真实 Home 的一次性副本（SQLite 备份接口，用户在对话里同意，副本已删）只读试跑，只记数：18 个项目库**都是库版本 7**，没有 `plugin_project_databases`，所以脚本要在 v8→v9 的项目库维护（BL-413）之后才能跑；给副本补一行 Goals 版本 1 的账本后，`events` 5,408 行（29 种类型/对象类型）、`idempotency_records` 5,580 行（34 个操作名，含已下线功能的 `claim_goal`、`start_run`、`submit_evidence`、`report_run`、`submit_review` 等）、`context_edges` 0、`input_bindings` 0；两种名单外的形状（共 68 行）使脚本停下，已在 RAC-293 里处理。幂等记录「旧名都是 Goals 的」这条假设成立：统筹 10-24 核对过 main 上只有 `modules/goals` 与 `modules/governance-collaboration`（`putIdempotency`、`proposal-operation-store.ts`）写 `idempotency_records`，已下线功能的操作（`claim_goal` 等）都是旧 Goals 写的。裁定：**全部改名，一条不删**（删真实 Home 的数据要用户批准，留着没有代价）；理由也写在脚本里。脚本遇到名单外的形状仍然退出 1、什么都不写。
- 代码搬进 `plugins/native/goals`、保存点预检换法、客户端改用 `services.project_database`：切到 Runtime 时一并做（搬家会抬高「插件包名在自己包之外被点名」的计数，要等装配改成 Runtime 才一并降）。
- `personal_planning_method_packs`（目录库）：个人规划那一块。
