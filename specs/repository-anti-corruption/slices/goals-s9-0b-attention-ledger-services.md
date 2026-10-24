# Goals S9-0b：Attention 与 Context Ledger 作为平台服务（PG-087，S-66）

状态：已开 [PR #1245](https://github.com/molis-ai/molis-work/pull/1245)，原实现固定 `f965b04a8`；一轮发现 Attention 对象只验种类、未隔离主人，统筹 10-24 升为本 PR 挡合并项。明确 owner、旧消费者隔离与候选 v10 已实现并通过定向回归，等待固定修复头复核及集成。S-66 为暂定号，正式号由唯一集成 carrier 按合并顺序处理。本片不迁移调用方到新服务；原验证保留各自适用范围，共享核心全量与实际合入仍由统筹接续。

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
- 条目的 `project_id` 是调用的；插件给的 `project_id` 被盖掉。Manifest 声明的对象种类（平台的封闭列表：`feed_item`、`goal_decision`、`source_fault`）只约束种类，不能证明对象归属；两个插件可以合法声明同一种类。`create`、`deleteSubject` 还必须按安装 Manifest 的插件号隔离对象（§2.1）。对象在不在由该插件担保（`exists` 恒真，Inbox 显示时由对象的主人解析，找不到就显示「不在了」）。`setStatus` 是任何持有 `attention:write` 的插件的（Inbox 关闭、重开别家的条目）。
- 条目写的事件（`inbox_entry.*`）用宿主的 journal 写在同一事务里，行为人是调用者的 `audit_actor_id ?? actor_id`（Goals 现在写的是本人），动作外是宿主给的行为人。
- 关联边的范围永远是本项目（`personal` + 项目号），行为人同上；插件给的别的范围的引用被模块拒绝（`context_ledger.scope_mismatch`）。

### 2.1 Attention 对象归属修复（Root 10-24 裁：事实 owner 明确存储）

原 `AttentionEntryRecord`、`AttentionEvent` 没有 owner 字段，条目的唯一键为 `(project_id, subject_type, subject_id, reason)`。仅验种类会让第二个声明同种类的插件触及第一个插件的对象。这一修复覆盖 Attention 主人包的事实与合同、新插件服务和旧消费者的必要隔离，不改 Context Ledger、其他权限或真实项目库。

- 输入：按对象操作使用带 `owner_plugin_id`、`subject_type`、裸 `subject_id` 的明确引用；`create`、`deleteSubject` 的目标 owner 必须等于当前安装 Manifest 的插件号，跨 owner 请求在进入模块写入前以 `actions.forbidden` 拒绝。输入是待操作的引用，不是可信身份；实际持久化 owner 仍从安装 Manifest 取。
- 存储：由 Attention 主人包在 `inbox_entries`、`attention_events` 两张现有表存 `owner_plugin_id TEXT`，明确归属为插件号，未指定为 `NULL`。`subject_id` 保持裸 ID；对象的逻辑命名空间是 `(owner_plugin_id, subject_type, subject_id)`，不解析字符串来认 owner。条目去重加上 `reason`，分为 owner 非空、owner 为空的两条部分唯一索引，避免 SQLite 的 NULL 语义破坏未归属条目的幂等性。创建、按对象查询和删除都把 owner 纳入 SQL 条件；继续经主人公开接口和原项目事务写，不建 Host 归属表。
- 输出与读取：Entry/Event 合同增加 `owner_plugin_id: string | null`；新服务 `list`、`get`、按对象查询及 `events` 只读明确 owner 的条目与事件，保持现有读取权限下跨插件可见，按对象查询可指定目标 owner。删除后的事件仍保存原 owner；journal payload 随条目记录实际 owner。owner 从事实字段读取，不从 kind、ID、输入或当前读取者推断。
- 状态：`setStatus` 保留全局 `entry_id` 与原跨 owner 关闭、重开规则，包括原未归属条目；写结果如实返回实际 owner 或 null，读取方法的可见性不因此扩大。仍逐次检查权限、取消、安装世代和原调用者，不重试、不增加另一份状态。
- 条目 ID：`entry_id` 仍为全局身份。插件自定 ID 若已属于异主、未归属旧条目或同主其他对象，创建本身以 `actions.forbidden` 拒绝，不能复用或改写原行；省略时仍由模块生成 ID。同 kind、同裸对象 ID 的不同 owner 可以各自创建、查询、删除，同 owner 的同对象与原因仍幂等，旧自定义字符串不会被改认成插件号。
- 调用方与快照：当前没有生产调用方迁到此服务；更新现有服务测试和公开 API 快照，原直接 `AttentionModule` 调用方不在本片迁移。PG-087、S 号和成熟数据维护不提前收口。
- 旧条目：旧 Goal ID 可由用户指定（`plugins/native/goals/src/dialogs-ui.ts`、`goal-event-application.ts`；`modules/goals/src/goal-commands.ts` 只 trim），`goal-decision-attention.ts` 原样写入 `subject_id`。合法旧 ID `io.molis.work.other:decision-1` 与字符串前缀相同，条目 ID 也允许自定。因此 Root 撤回纯字符串及双前缀判据，改为上述明确事实字段。未归属条目保留 null，经原直接模块路径可读写，S9-2 明确维护后才经新服务的读取方法展示；本片不猜 owner、不做兼容映射，不声称旧条目已全量可见。
- 项目 schema：`apps/local-host/src/project-database-schema.ts` 的版本从 9 改为 10，同步 `docs/releases/CHECKLIST.md` 与现行 schema fixture；沿用 `applySqliteBaseline` 严格拒绝其他版本，不运行时 ALTER、不自动迁移，不触真实 Home。真实 v9→v10 的备份、两表维护与验收仍留统一维护窗口；需要新增维护脚本时先给具体补丁和隔离演练，不以本片源码通过宣称真实维护完成。
- 既有调用者：原直接模块创建和按对象 find/delete 默认是明确未归属 null。旧 Feed/Inbox 尚不按 owner 解析对象，在 `FeedApplication` 共用的 snapshot/list/get 读取入口只接 null 条目，已知新条目 ID 也按原不存在码拒绝，由这些入口进入的 scene、workflow、search、home-events 同样不能误解析其他 owner 的同 kind/裸 ID；不在各 UI 文件分散判断。Goals 的 `GoalDecisionAttentionSync.reconcile` 只结算其现有 null 路径。原 Attention 模块及新服务的全局 `entry_id` 跨 owner setStatus 规则保留。本片不迁移调用方、不改动作权限或 Context Ledger。公开 API 快照同步 owner 字段及新服务对象引用，原测试断言按实际合同更新。

验收编号：`ATTN-OWNER-01` 同种类同裸对象 ID 的两安装互不覆盖，合法自身删除只影响自身；`ATTN-OWNER-02` 跨插件伪造 owner 的 create 本身带码拒绝、插件行/条目/事件均不写；`ATTN-OWNER-03` 跨插件 deleteSubject 本身带码拒绝且他人条目与全部业务状态不变；`ATTN-OWNER-04` 合法跨 owner 读取、事件和 setStatus 保留真实 owner、原修订与事务规则；`ATTN-OWNER-05` 新 owner 路径在取消、撤权、安装变化和事务失效时同样零业务写；`ATTN-OWNER-06` 原合法双前缀旧 ID 保留 null、原 owner 路径可读、新服务不认领，自定全局条目 ID 撞旧、异主或同主其他对象时带码拒绝且同事务插件行/条目/事件/journal 回滚；`ATTN-OWNER-07` v10 建库结构准确，v9 依原严格版本拒绝且原库无变化；`ATTN-OWNER-08` 真实旧 Feed/Inbox 读取链、自动 reconcile 与来源恢复不误取其他 owner 的同 kind/裸 ID 内容或代结算，旧 null 路径正常。测试走真实插件执行器、隔离项目库与公开服务，不用结构快照代替拒绝。

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

合同与 SDK 多了上述导出，`PluginManifest` 多一个可选的 `attention`（没写的不受影响），`PluginHostServices` 多两项可选服务。归属修复为 Attention entry/event 增加明确 owner 字段及对象约束，项目 schema 本分支为 v10；旧版本按现有机制拒绝，真实维护未执行。没有新动作、MCP 工具名、页面资源、权限种类或兼容读取。`pnpm api:update` 同步公开 API 快照。宿主多了 `plugin-attention-service.ts`，没有新增以内置插件命名的宿主文件。生产调用方迁移、真实 Home 维护和完整 S9-2 均未完成。

## 6. 10-24 修复验证

| 验收 | 结果与证据范围 |
| --- | --- |
| ATTN-OWNER-01 | 通过：同 kind/裸 ID 的三安装独立、同主重放幂等、自身删除及删后事件 owner。 |
| ATTN-OWNER-02 | 通过：伪造异主 create 当场带码拒绝，插件行、entry、event、journal 不变。 |
| ATTN-OWNER-03 | 通过：异主 deleteSubject 当场带码拒绝，受害记录与同事务业务状态不变。 |
| ATTN-OWNER-04 | 通过：跨主读取与全局状态、真实 owner/行为人、旧修订回滚、跨 null 重开。 |
| ATTN-OWNER-05 | 通过：原取消、撤权、安装变化、事务失效用例已改为明确 owner 写入。 |
| ATTN-OWNER-06 | 通过：真实自定旧 Goal/条目 ID 保持 null，三类全局 ID 冲突拒绝并回滚。 |
| ATTN-OWNER-07 | 通过：当前 v10 schema 精确对比、冻结 v9 被严格拒绝且无改写。 |
| ATTN-OWNER-08 | 通过：真实 Feed/Inbox 读取与 Goal reconcile、真实 RSS runtime 的受控来源恢复不串对象。 |

生产源码冻结后的整体 `pnpm build`、`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、`node scripts/verify-release-versions.mjs`、改动的 11 份 TS 文件 Biome 检查均通过，构建源码指纹一致。定向验证有效并集为 32 文件、524 项、无跳过；不是一轮全量。安全文件先两次因新 fixture 注册方式失败，各有效 29 项；按实际 Manifest 元数据修正后仅重跑受影响的一项通过，保留首败，不重复已有效的 29 项。相关 26 文件首批 25 通过，四份历史夹具仍为 v9 导致剩余文件严格拒绝；只更新批准的 DDL/版本后，历史与两个 Inbox DTO 的 7 文件回归全部通过，原业务 INSERT、行与 rowid 不变。

额外严格测试文件类型检查退出 2，仅报告未改的 `tests/fixtures/plugin-actions.ts` 三条类型诊断；未修改共享 helper，也不宣称这项检查通过。共享核心全量由唯一 carrier 接续，真实 Home 维护与用户验收未运行。一次性维护补丁只在临时合成 v9 库演练：保留旧值/rowid/journal，owner 为空；错版、意外结构与注入失败不改库。这不代表真实备份或真实维护。
