# Goals S9-0b：Attention 与 Context Ledger 作为平台服务（PG-087，S-66）

状态：已实现（2026-10-24，迁移线 ac-sc3 片，叠在 S9-0 的分支上，不开 PR）。统筹 10-23 裁：PG-087 的 attention、context-ledger 服务移给本线，作 S9-0b，在 S9 存储搬迁之前做；Feed 与 Inbox 之后复用。本片只提供服务，不迁移任何调用方。

## 1. 目标

`inbox_entries`、`attention_events`（Attention）和 `context_edges`（Context Ledger）是项目库基线里平台的表（`PROJECT_DATABASE_BASELINE`），Goals、Feed、Inbox 都要用：Goals 为待决事项加 Inbox 条目、用关联边记输入绑定，Feed 为条目和来源故障加条目，Inbox 列出并关闭它们。今天各家在宿主里各 `new AttentionModule(db, 自己的存在性检查, 自己的事件接收)`，插件拿不到。`services.project_database` 的语句检查按设计拒绝这些表，所以 Goals 一搬进 Plugin Runtime 就没有办法再写。本片给插件两项平台服务，PG-087 的口径是「Attention、ContextLedger 由平台经 services 提供」。

## 2. 做法

| 位置 | 内容 |
| --- | --- |
| `packages/contracts/src/platform/plugin-attention.ts`（新） | 权限 `attention:read`/`attention:write`、`context-ledger:read`/`context-ledger:write`；`PluginAttentionClient`（读 + `join(事务, 写入者)`）、`PluginAttentionWriter`（`create`、`setStatus`、`deleteSubject`）、`PluginContextLedgerClient`/`Writer`（`get`、`list`、`history`；`put`、`remove`）；Manifest 的 `attention: { subjects }`。`PluginHostServices` 多 `attention`、`contextLedger`；`PluginManifest` 多 `attention`。`ATTENTION_SUBJECT_TYPES` 由合同导出（类型 `AttentionSubjectType` 由它推出，取值不变）。 |
| `packages/plugin-sdk/src/attention-declarations.ts`（新） | `parsePluginManifest` 检查 `attention`：只认 `subjects`；要同时声明 `attention:write`；种类必须是平台的、不重复、至少一种。SDK 同步导出类型。 |
| `apps/local-host/src/plugin-attention-service.ts`（新） | `pluginAttentionFor`、`pluginContextLedgerFor`：包住 `AttentionModule`、`createContextLedger`（在宿主自己的项目连接上，所以写入和插件自己的行同一个事务）。照 `services.scheduler`、`services.notifications` 的写法：写入者由 `join(事务, …)` 给，用 `joinPluginTransaction` 绑定到那一个事务，事务一结束就失效。 |
| `plugin-host-services.ts` | `projectServices` 把两项服务放进 `services`；插件没有声明对应权限、没有项目库时没有这项服务。 |

每次调用问的话（`gateFor`）：插件实例仍在运行、授权没被撤、安装世代没变、记录仍持有这项权限；调用在本项目；`assertCapturedPluginActionCurrent`（取消、撤权、换提供方、另一个安装的动作拒绝）。写还要求：不是只读调用，是可写、可等待并行、且自己的 `action.permissions` 声明了这项权限的动作（或带该权限的保留作业），场景不行（同 `services.notifications`）。

对象与行为人：
- 条目的 `project_id` 是调用的；插件给的 `project_id` 被盖掉。`create`、`deleteSubject` 只能用 Manifest 声明的对象种类（平台的封闭列表：`feed_item`、`goal_decision`、`source_fault`），所以一个插件只能为自己的对象加条目；对象在不在由声明它的插件担保（`exists` 恒真，Inbox 显示时由对象的主人解析，找不到就显示「不在了」）。`setStatus` 是任何持有 `attention:write` 的插件的（Inbox 关闭、重开别家的条目）。
- 条目写的事件（`inbox_entry.*`）用宿主的 journal 写在同一事务里，行为人是调用者的 `audit_actor_id ?? actor_id`（Goals 现在写的是本人），动作外是宿主给的行为人。
- 关联边的范围永远是本项目（`personal` + 项目号），行为人同上；插件给的别的范围的引用被模块拒绝（`context_ledger.scope_mismatch`）。

## 3. 验收

- **RAC-273**：插件自己的等待不能代替调用者；调用在等待期间被撤权、取消或换了提供方，插件自己的行、条目、事件和关联边都不在。（S-66；`tests/security-invariants-plugin-project-services.test.ts`）
- **RAC-274**：十一个调用（`create`、`setStatus`、`deleteSubject`、`put`、`remove` 与六个读）每个都在事务里再问原调用者：失效后调用本身拒绝，事务回滚（同一事务里插件自己的行也不在）；同一次 `join` 里的第二次写在调用者中途失效后同样拒绝，连第一次写也一起没有。（同上）
- **RAC-275**：留过了事务的写入者和句柄、动作返回后仍在跑的工作，都写不进去；别的安装的动作拿本安装的服务写，拒绝。（同上）
- **RAC-276**：没有权限的插件没有这项服务；只有读权限的插件写被拒（`plugin.grant_denied`）；动作自己没声明这项权限也被拒。（同上）
- **RAC-277**：条目只能为 Manifest 声明的对象种类添加或删除；项目是调用的，事件的行为人是调用者；关联边的行为人是调用者记录的作者，别的范围的引用被拒且什么都没留下。（同上）
- **RAC-278**：条目与插件自己的行同事务：同一对象、同一原因只有一条条目；失败的服务调用把插件同一事务里的行一起回滚。（同上）
- **RAC-279**：Manifest 的 `attention` 只认 `subjects`，要同时声明 `attention:write`，种类必须是平台的、不重复、至少一种。（同上）
- **RAC-280**：关联边的键存在插件号之下（`<plugin_id>:<key>`），插件传入和读回的是不带前缀的键；两个插件用同一个键是两条边，一个插件指名另一个插件存下的键什么也碰不到，删自己的边不动另一个的。（S-66；同上）
- **RAC-281**：插件号互为点前缀的两个安装（`io.molis.work.a` 与 `io.molis.work.a.b`）对关联边互为陌生人：谁也列不到、读不到、删不到对方的边。（同上）

## 4. 不做、留给后续

- 迁移调用方：Goals 的协调器、Feed 的 `feed-application.ts`、Inbox 的 `inbox-actions.ts` 仍各自 `new AttentionModule(…)`。它们随各自插件迁到 Runtime 时改调服务（Goals 在 S9 的三个 PR，Feed 与 Inbox 在各自的迁移片）。迁移后宿主里的这些装配才能删。
- 没有自己项目表的插件没有事务可 `join`，写不了。Inbox 迁移时决定：声明一张最小的表，或平台另给无表插件的事务入口（先问再做，会改合同）。
- 关联边的键在插件号的命名空间里（RAC-280、RAC-281，S-66）：平台把键存成 `<plugin_id>:<key>`，插件传入和读回的是不带前缀的键；插件号取自安装的 Manifest，不从输入读。冒号做分隔，因为插件号里没有冒号，一个插件的命名空间不会盖住另一个的（与 S9-0 的日志端口同一条规则，BL-506）。`get`、`history`、`put`、`remove` 只碰自己的边，`list` 只列自己的。**现有的键没有插件前缀**（Goals 的输入绑定等，由 Goals 的协调器直接写）：在 S9-2 的名字维护给它们加上 `io.molis.work.goals:` 之前，经服务读不到它们；本片不迁任何调用方，所以没有行为变化。`context-ledger:write` 仍是要明示授予的权限。
- 沙箱里的插件拿不到这两项服务：`SANDBOX_SERVICE_FATE` 记「暂不给」，Manifest 声明了 `attention:*` 或 `context-ledger:*` 的沙箱包启动就被拒（`sandbox.service_not_given`，BL-505）；日志端口同样（S9-0）。
- Feed 的 `ledger`（行为人 `module:feed`）和 `placement-actions`、`artifact-actions` 等宿主动作对 ledger 的直接使用不在本片内。

## 5. 对调用方的影响

合同与 SDK 多了上述导出，`PluginManifest` 多一个可选的 `attention`（没写的不受影响），`PluginHostServices` 多两项可选服务。没有动作、MCP 工具名、页面资源、表的变化，没有兼容或迁移逻辑。`pnpm api:update` 刷新了公开 API 快照。宿主多了 `plugin-attention-service.ts`，没有新增以内置插件命名的宿主文件。
