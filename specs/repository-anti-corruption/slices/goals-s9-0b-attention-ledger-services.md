# Goals S9-0b：Attention 与 Context Ledger 作为平台服务（PG-087，S-64）

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
| `apps/local-host/src/plugin-namespace.ts`（新） | 名字的命名空间：插件写进项目共享表的名字都以 `<plugin_id>.` 开头，与事件总线给插件的命名空间同一条规则（`ownsEventType`）。用在 S-64 的关联边 key，也用在 S9-0 的日志端口（事件的 `type`、`objectType`，幂等记录的 `operation`）。插件号取自这个安装的 Manifest，建服务时就定了，不从输入读；别的名字拒绝，码是已有的 `plugin.storage_denied`。 |

每次调用问的话（`gateFor`）：插件实例仍在运行、授权没被撤、安装世代没变、记录仍持有这项权限；调用在本项目；`assertCapturedPluginActionCurrent`（取消、撤权、换提供方、另一个安装的动作拒绝）。写还要求：不是只读调用，是可写、可等待并行、且自己的 `action.permissions` 声明了这项权限的动作（或带该权限的保留作业），场景不行（同 `services.notifications`）。

对象与行为人：
- 条目的 `project_id` 是调用的；插件给的 `project_id` 被盖掉。`create`、`deleteSubject` 只能用 Manifest 声明的对象种类（平台的封闭列表：`feed_item`、`goal_decision`、`source_fault`），所以一个插件只能为自己的对象加条目；对象在不在由声明它的插件担保（`exists` 恒真，Inbox 显示时由对象的主人解析，找不到就显示「不在了」）。`setStatus` 是任何持有 `attention:write` 的插件的（Inbox 关闭、重开别家的条目）。
- 条目写的事件（`inbox_entry.*`）用宿主的 journal 写在同一事务里，行为人是调用者的 `audit_actor_id ?? actor_id`（Goals 现在写的是本人），动作外是宿主给的行为人。
- 关联边的范围永远是本项目（`personal` + 项目号），行为人同上；插件给的别的范围的引用被模块拒绝（`context_ledger.scope_mismatch`）。

## 3. 验收

- **RAC-273**：插件自己的等待不能代替调用者；调用在等待期间被撤权、取消或换了提供方，插件自己的行、条目、事件和关联边都不在。（S-64；`tests/security-invariants-plugin-project-services.test.ts`）
- **RAC-274**：十一个调用（`create`、`setStatus`、`deleteSubject`、`put`、`remove` 与六个读）每个都在事务里再问原调用者：失效后调用本身拒绝，事务回滚（同一事务里插件自己的行也不在）；同一次 `join` 里的第二次写在调用者中途失效后同样拒绝，连第一次写也一起没有。（同上）
- **RAC-275**：留过了事务的写入者和句柄、动作返回后仍在跑的工作，都写不进去；别的安装的动作拿本安装的服务写，拒绝。（同上）
- **RAC-276**：没有权限的插件没有这项服务；只有读权限的插件写被拒（`plugin.grant_denied`）；动作自己没声明这项权限也被拒。（同上）
- **RAC-277**：条目只能为 Manifest 声明的对象种类添加或删除；项目是调用的，事件的行为人是调用者；关联边的行为人是调用者记录的作者，别的范围的引用被拒且什么都没留下。（同上）
- **RAC-278**：条目与插件自己的行同事务：同一对象、同一原因只有一条条目；失败的服务调用把插件同一事务里的行一起回滚。（同上）
- **RAC-279**：Manifest 的 `attention` 只认 `subjects`，要同时声明 `attention:write`，种类必须是平台的、不重复、至少一种。（同上）
- **RAC-280**（统筹 10-23 裁，补 S9-0）：日志端口的名字是插件自己的：事件的 `type`、`objectType` 和幂等记录的 `operation` 不以 `<plugin_id>.` 开头（无前缀、别的插件的、更长插件号的、光秃的插件号）一律 `plugin.storage_denied`，写入时连同插件同一事务里的行一起回滚；别的插件的幂等操作既认领不了、也读不了，别家的记录原样不动。（S-63；`tests/security-invariants-plugin-project-journal.test.ts`）
- **RAC-281**（同上）：关联边的 key 是插件自己的：`put`、`remove`、`get`、`history` 用不以 `<plugin_id>.` 开头的 key 拒绝（`plugin.storage_denied`），什么都没写，插件同一事务里的行一起回滚；`list` 只列自己命名空间的边；别家的边原样不动。（S-64；`tests/security-invariants-plugin-project-services.test.ts`）
- **RAC-282**（统筹 10-24 裁，补 S9-0）：日志的读是插件自己命名空间的：`readEventsDescending` 只返回 `type` 以 `<plugin_id>.` 开头的事件，别的插件的和平台的事件不显示；`eventCursor()` 是自己事件的末尾，不是日志的末尾；`eventCursor(objectType)` 用别人的、无前缀的、光秃插件号的对象类型都拒绝（`plugin.storage_denied`）；写事务的句柄上同样。（S-63；`tests/security-invariants-plugin-project-journal.test.ts`）

## 4. 不做、留给后续

- 迁移调用方：Goals 的协调器、Feed 的 `feed-application.ts`、Inbox 的 `inbox-actions.ts` 仍各自 `new AttentionModule(…)`。它们随各自插件迁到 Runtime 时改调服务（Goals 在 S9 的三个 PR，Feed 与 Inbox 在各自的迁移片）。迁移后宿主里的这些装配才能删。
- 没有自己项目表的插件没有事务可 `join`，写不了。归 S9 与 Inbox 的迁移片：声明一张最小的表，或平台另给无表插件的事务入口（先问再做，会改合同）。
- 命名空间（RAC-280、281）带来的 S9 工作：Goals 现有的关联边 key 与事件类型、对象类型（`board.created` 一类）、幂等操作名没有插件前缀，迁入 Runtime 时要改成带前缀的，已有的行与读它们的地方一并迁移，先写进保留机制、经用户确认。
- **统筹 10-24 裁（日志的读）**：日志的读不是整个项目的（一个插件读别的插件的事件是隐蔽的风险），只给自己命名空间的事件，再加 Manifest 里声明消费的事件类型，规则同事件总线的订阅。Goals 的事件游标或活动流要别的插件的事件，就在 Goals 的 Manifest 里声明。**声明消费的事件类型这一半还没做，等统筹答复**：Manifest 里现有的 `events.subscribes` 写的是事件总线的事件（带版本、必须写 `from_plugin_ids`、保留类型要宿主登记过），不是项目日志里的行（`goal.created`、`inbox_entry.created` 一类没有版本、不经总线发布），拿它声明日志的类型会把两种东西混在一起；统筹要求没有现成对应字段就问、不自己加。现在做的是更严的那一半：只读自己的命名空间。关联边的读同样按命名空间（RAC-281），所以「指向我的对象的、别的插件写的边」读不到，需要时再加声明的读权限。
- **统筹 10-24 裁（BL-506）**：前缀规则与事件总线同一条，插件号互为点前缀（`io.molis.work.a` 与 `io.molis.work.a.b`）时，前者的命名空间盖住后者的，**事件总线本来就有同样的问题**；现在内置的 27 个插件号没有这样的一对。BL-506 保留，归 ac-trust 线：安装处拒绝互为点前缀的插件号。
- **统筹 10-24 裁（S9 的改名与存量维护）**：Goals 现有名字不带前缀，S9 要改成带前缀的并迁移存量行；这改真实 Home 的数据，要用户确认，统筹与 W5-17 的目录维护并成一批、建议同一个维护窗口。维护脚本的设计与演练测试写在 S9 切片（`goals-s8b-s9-runtime.md` 第 6a 节），只在一次性 Home 里实现，用户确认之前不碰真实 Home。
- 沙箱里的插件拿不到这两项服务和日志端口（桥只转 `get/all/transaction/run`）。#1139 合入后，`SANDBOX_SERVICE_FATE` 里要给 `attention`、`contextLedger` 和 `project_database.journal` 各一条「暂不给沙箱」并写原因；等沙箱化的插件需要时经代理转发，记在 BL-505。#1139 在这条分支开 PR 之前还没合，就把这一条写进 PR 说明作后续。
- Feed 的 `ledger`（行为人 `module:feed`）和 `placement-actions`、`artifact-actions` 等宿主动作对 ledger 的直接使用不在本片内。

## 5. 对调用方的影响

合同与 SDK 多了上述导出，`PluginManifest` 多一个可选的 `attention`（没写的不受影响），`PluginHostServices` 多两项可选服务。没有动作、MCP 工具名、页面资源、表的变化，没有兼容或迁移逻辑。S9-0 的日志端口因 RAC-280 多了名字的前缀要求，行为变严；它还没有调用方，所以没有谁被破坏，S9 迁 Goals 时按上面的第三条处理。`pnpm api:update` 刷新了公开 API 快照。宿主多了 `plugin-attention-service.ts`，没有新增以内置插件命名的宿主文件。
