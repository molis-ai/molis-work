# Goals S9-0：项目事件日志与幂等记录的端口（PG094-11 前置，S-61）

状态：已实现（2026-10-24，迁移线 ac-sc3 片，与 S8b（#1182）互不依赖，直接从 main 开）。统筹 10-23 裁：S9 存储搬迁之前先做；表仍属 `packages/storage`，`tooling/gates/table-owners.json` 不变；登记 S-61（取消、撤权之后日志端口不写）并带拒绝测试；号按合并顺序取：原先暂定 S-63，10-24 统筹裁定释放，取开 PR 时 main 之后的下一个空号。草稿见 `goals-s8b-s9-runtime.md` 第 4 节。

## 1. 目标

Goals 搬进 Plugin Runtime 之后，它的动作仍要写项目的 `events`（时间线）和 `idempotency_records`（幂等键）。这两张表由 `packages/storage` 建、Goals 与 Governance 共写（`table-owners.json` 登记了理由），`services.project_database` 的语句检查（只放行插件自己的表和 `project_root`）按设计拒绝它们。本片给插件一个不经语句的端口，让日志行和插件自己的行在同一个 SQLite 事务里落下，并且被取消、被撤权、被换提供方的调用一行也写不进去。

## 2. 做法

| 位置 | 内容 |
| --- | --- |
| `packages/contracts/src/platform/plugin-database.ts` | `PROJECT_JOURNAL_PERMISSION = "journal:project"`；`PluginJournalReader`（`eventCursor`、`readEventsDescending`）、`PluginJournalWriter`（再加 `appendEvent`、`getIdempotency`、`putIdempotency`）、`PluginProjectDatabase`（`PluginDatabase` 加只读的 `journal`）、`PluginProjectDatabaseTransaction`（事务句柄加可写的 `journal`）；`PluginHostServices.project_database` 改成 `PluginProjectDatabase`。SDK 同步导出类型。 |
| `apps/local-host/src/plugin-project-journal.ts`（新） | `projectJournalBinding`：包住 `packages/storage` 的 `LocalSqliteJournal`（写在宿主的写连接上，读在只读连接上）。项目号由库给，不取输入里的 `projectId`（输入里多带的会被盖掉）。 |
| `plugin-database-client.ts` | `pluginDatabaseClient` 多一个可选的 `journal` 绑定（重载：有它返回 `PluginProjectDatabase`，没有仍是 `PluginDatabase`，Home 库不受影响）。日志的读问「读自己的表」问的那一套；日志的写只在事务句柄上，问「事务里写一条语句」问的那一套（授权、`assertPluginActionCurrent`、事务仍在）。 |
| `plugin-project-library.ts` / `plugin-platform.ts` | `ProjectLibrary.journal`（项目号、宿主给插件用的行为人、写连接上的 journal）由平台把 `PluginPlatformOptions.journal` 带下去；没有 journal 的库，每个方法都以 `actions.service_unavailable` 拒绝，类型上它仍在。 |
| `docs/system/SECURITY-INVARIANTS.md` | 新增 S-61 一行；`tests/security-invariants-plugin-project-journal.test.ts` 逐条断言「拒绝」。 |

行为人规则：在动作里，一行日志或一条幂等记录的行为人只能是该动作调用者的 `actor_id` 或 `audit_actor_id`（Goals 现在写事件用的正是 `audit_actor_id ?? actor_id`）；不在任何动作里（`start`、路由、定时器），只能是宿主给这个项目的插件用的行为人。幂等记录的键含行为人，所以插件读不到、也占不了别的行为人的记录。

授权：声明并被授予 `journal:project` 的插件才有（权限串由 Manifest 声明、安装时授予，和 `storage:private` 一样）；没有授予时每个方法抛 `plugin.grant_denied`。沙箱里的插件（`packages/plugin-sandbox` 的桥只转 `get/all/transaction/run`）暂时拿不到 `journal`。

## 3. 验收

- **RAC-265**：插件自己的等待（`beforeEffect`）不能代替调用者：调用在等待期间被撤权、取消或换了提供方，插件自己的行、事件、幂等记录都不在。（S-61；`tests/security-invariants-plugin-project-journal.test.ts`）
- **RAC-266**：事务写入体内，调用者在插件自己的语句之后、日志调用之前失效，`appendEvent`、`putIdempotency`、`getIdempotency`、`eventCursor`、`readEventsDescending` 五个方法每个都拒绝，事务整体回滚（插件同一事务里的行也不在）。（同上）
- **RAC-267**：事务结束后留着的句柄、动作返回之后仍在跑的工作，日志一行也写不进去（`actions.forbidden`、`actions.expired`）；另一个安装的动作拿本安装的服务写，拒绝（`actions.forbidden`）。（同上）
- **RAC-268**：没有 `journal:project` 授权的插件，日志的每个方法拒绝（`plugin.grant_denied`），并且语句仍读不到 `events`、`idempotency_records`；有授权的插件能读。（同上）
- **RAC-269**：行为人：动作里是调用者或其记录的作者，别的行为人（写、读幂等记录）都拒绝；动作外只认宿主给的行为人。（同上）
- **RAC-270**：项目号是库的：输入里带别的 `projectId` 也落在本项目；读只看本项目的事件，游标与按对象类型的游标正确。（同上）
- **RAC-271**：日志写和插件自己的行同事务：幂等键重复使该次事务整体回滚。（同上）
- **RAC-272**：`tooling/gates/table-owners.json` 不变，`apps/local-host` 里没有对 `events`、`idempotency_records` 的 SQL；`pnpm boundary:check`、`pnpm health:check --base origin/main` 通过。（门禁）
- **RAC-294**：只读自己的：两个插件（同一个项目库、都有 `journal:project`）各自 `appendEvent`，`readEventsDescending` 只返回自己的、是裸名，`eventCursor`（有无 `objectType`）只数自己的；一个插件读不到另一个的 payload；库里别的名字（宿主写的无前缀事件）同样不在答案里。（`tests/security-invariants-plugin-project-journal.test.ts`）
- **RAC-295**：幂等操作名带主人的命名空间：两个插件用同一个 `operation` 和 `key` 各存一条记录互不冲突，各自只取回自己的 `request_hash` 与结果；一个插件取另一个已经存过的 `operation`/`key` 得到 `null`；表里存的是「`plugin_id`、点、名字」。（同上）

## 4. 不做、留给 S9

- 命名空间现在就做（统筹 10-24 评审裁定，「不留隐患」：还没有 Manifest 声明它，现在改不花代价）：日志是项目里所有主人共用的，所以端口替每个插件加自己的命名空间。`appendEvent` 的 `type`、`objectType` 和 `putIdempotency`/`getIdempotency` 的 `operation` 由平台存成「`plugin_id`、一个点、名字」（与 S9-2 对 Goals 存量改的前缀同一个写法），读 `readEventsDescending`、数 `eventCursor` 只看类型与对象类型都在自己名下的事件，读回来去掉前缀；命名空间取自装配的安装，不是参数。所以别的主人（含存量里还没有前缀的事件，它们归宿主里的 Governance 等）的事件读不到、算不进游标，同一个操作名在两个主人名下是两条互不相干的记录；要别的主人的事件，调那个主人的动作。Goals 的存量事件在 S9-2 的维护改名之后才落在自己的命名空间里（S9-2 的 `GOALS_JOURNAL_NAMESPACE` 就由本端口给，Goals 的仓库不再自己加）。已知的限制：命名空间是前缀，`plugin_id` 若恰好是另一个插件 `plugin_id` 的点分段前缀（`a.b` 与 `a.b.c`），`a.b` 名下的裸名 `c.x` 与 `a.b.c` 名下的裸名 `x` 存成同一个字符串；跨发布者的这种 id 由 BL-506（ac-trust T6）在安装时拒绝，同发布者的不在其内，需要时在安装处另加同样的检查。
- 沙箱桥转发 `journal`：沙箱里的插件目前没有；有需要时在桥上加。
- Governance 的事件仍由 `modules/governance` 经 `LocalSqliteJournal` 写，不经这个端口。
- Goals 本体的迁移（S9 三个 PR）与 PG-087 的注意力、上下文账本服务（S9-0b）。

## 5. 对调用方的影响

`@molis-ai/molis-work-contracts/platform/plugin` 与插件 SDK 多了上述导出；`PluginHostServices.project_database` 的类型从 `PluginDatabase` 变为它的子类型 `PluginProjectDatabase`（读写自己的表的调用方不受影响）。没有动作、Manifest、MCP 工具名、页面资源的变化，没有表的变化，没有兼容或迁移逻辑。运行 `pnpm api:update` 刷新了公开 API 快照。
