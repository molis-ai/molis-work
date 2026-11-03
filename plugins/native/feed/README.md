# 信息流用例与原生界面

把来源配置、同步、Signal、Feed 处置和注意事项接成完整的信息处理流程，并提供页面与路由。

包名：`@molis-ai/molis-work-plugin-feed`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

FeedApplication 组合注入的 Module API；FeedSourceService、FeedConnectorSync 和 FeedSourceScheduler 处理来源同步用例。用户将条目推进为 Goal 时，promoteFeedItemToGoal 经 Host 提供的端口调用 Goals 的动作（`goals.create`、`goals.inputs.confirm`，以调用者自己的身份），再记下 Feed 自己的关联；Feed 不写 Goals 的数据，项目里没有 Goals 时升格不可用，「升格为 Goal」的入口（`feed.items.offers` 的清单、阅读页的按钮）跟着升格动作的可用性走、不可用时不出现；持精确动作授权的客户端（MCP）要同时授权 `goals.directory.read`、`goals.create`、`goals.inputs.confirm`（在对外接入设置里先授权这三项再授权升格，或一次请求带 `with` 一起授权；只授权升格会被拒并点出缺哪几个），经 MCP 调用还须有稳定 Session（升格声明 `authorship: "session"`，Goal 与输入回执记在 Session 名下；没有稳定 Session 的客户端经 `home.actions.execute` 这类包装动作也到不了它，动作服务在派发处拒绝）。升格出的输入只有本人升格时记为已确认，助理、Agent、工作流和外部工具升格只记为待确认，回执的理由也不写成用户确认。本人丢弃了升格中途失败留下的 Goal 之后，再升格会换同一版本的下一个幂等键另建一个，不会卡在被丢弃的那个上。Host 提供文件、凭据和网络适配。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/application.ts](src/application.ts) | 信息流应用组合 |
| [src/source-service.ts](src/source-service.ts) | 来源操作 |
| [src/connector-sync.ts](src/connector-sync.ts) | Connector 同步 |
| [src/goal-promotion.ts](src/goal-promotion.ts) | Feed 推进为 Goal |
| [src/route-handlers.ts](src/route-handlers.ts) | HTTP 用例适配 |

Runtime 里的装配方式见 [src/plugin.ts](src/plugin.ts)（平台服务做端口）；演示数据的装配见 [apps/local-host/src/demo-feed-library.ts](../../../apps/local-host/src/demo-feed-library.ts)。

## 接入与边界

本包不拥有 Source/Signal/Feed 数据表，也不直接实现 GitHub/Gmail 协议。正文渲染用插件 SDK 的 `/rich-text`（`renderRichText`、`richPlainText`），送模型的上下文先过 SDK 的 `redactSecrets`；Provider 失败、部分接收与重试不能混成同一个成功状态。

`research_library` 来源由 Host 注入 `syncRepository`（Feed 自己的 `syncResearchLibrary`，读仓库的一步由注入的读取端口做：宿主版是宿主自己的读取器，Runtime 版是平台的 `repository.read`），沿用 Sources 的 `public_source` 同步入口与计划。GitHub integration 验证固定提交上的发布包和哈希，Feed 每条研究发现保存正文、原始引用、阅读范围与包版本。来源规则默认 `admission: "suggest"`；明确选 `inbox` 时，Feed 将匹配内容或需复核的判断结果写入 Attention。`evaluateItems` 可对最近至多 20 条消息重新运行规则；Functions 本身不执行写入。

入箱后的下一步判断走 `inboxJudgment` 注入端口，Host 将它接到统一 `inbox.next` 场景。`subscribeInboxCreated` 连接 Attention 的实际创建事件，覆盖直接携带 attention 的导入及来源故障；去重后在业务提交后的 `flushPendingJudgments` 中执行。已回滚或关闭的事项不触发判断。每个应用实例拥有自己的队列，来源、连接器、定时器和工作流须传入绑定可信调用上下文的 `feedOptions`；仅传 Home 路径不产生 Inbox 调用授权。首页建议通过 homeJudgment 接到共同 Home 场景。Feed 筛选通过 captureJudgment 接到本插件声明的 feed.capture 场景；手动处理和工作流向后续判断传递原调用者；等判断的并发动作（工作流收取 `ingestItemJudged`、试跑 `evaluateItems`、入箱）只判断自己导入的消息和由此产生的 Inbox 事项，不排空其他生产方的队列。捕捉结果由常驻实例入箱时，该实例立即消费新 Inbox 事件，避免把事件留在另一实例的队列。

捕捉规则的目录、创建、修改、删除和关键词预览由本插件的 `feed.rules.*` 能力提供，定义及处理器位于 [src/rule-actions.ts](src/rule-actions.ts)。Host 只提供原 FeedApplication、项目范围和原文读取；HTTP 将旧字段转换后调用同一能力，MCP 按具体动作与项目授权。读规则和预览需要 `feed:read`，修改配置另需 `feed:write`；输入不能指定其他项目。指定来源必须属于当前项目，已有失效来源引用在修改其他字段时仍保留。

关键词预览读取该来源最近五条原消息，不调用模型、不保存规则、不产生捕捉成果或 Inbox 条目。`feed.rules.judgments` 从共同目录返回带版本、提供方和可用状态的判断能力；`preview-judgment` 对原消息调用所选兼容能力，不保存捕捉结果或入箱；`evaluate` 才应用原规则并实际消费结果。界面不维护另一份 Functions 下拉名单，插件判断也使用相同预览、保存和运行路径。

规则与精确判断引用保存在原 `feed_out_rules`，每次编辑更新 revision，异步验证后以 revision 比较保存。未知或停用能力可保留并编辑其他字段；重新启用须通过当前共同兼容检查。

`feed.capture` 自己实现 prepare/consume/failed：用原消息准备内容，结果落地前复核规则 revision、消息内容、提供方和授权。只有 admission=inbox 时，inbox.admit 或 needs_review 才进入 Inbox。原判断历史增加绑定和消息版本依据，`feed.rules.recommendations` 只返回当前仍有效的建议；停用、改绑、内容变化或撤权后撤下建议，历史保留。系统“已用在哪”链接可直接打开来源内的具体捕捉规则。

工作区依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`。其他运行依赖见 [package.json](package.json)。

定时拉取失败也花掉当次计划：同步在失败时自己会把中断记在来源上（状态、错误码、更新时间），调度器随后只确认授权、来源未删除未暂停、配置与人改过的名称/说明/计划没有变化，再记录需要处理的故障并推进下次拉取；已被拒绝的执行仍然保持拒绝。删除来源并保留历史时，该来源未关闭的故障 Inbox 条目一并标为已忽略（来源再也无法同步），保留下来的消息各自的 Inbox 引用不动。插件提醒和定时操作结果由 Scheduler 的 wakeup 送进 Feed，项目装配时绑定与其他事件相同的判断触发器，投递提交后才执行；判断失败不撤销已投递的提醒。

连同本地历史删除来源时，同一次删除还清理拉取留在 Home 里的东西：先在事务内记下来源的 Material 与拉取收据所指的加密正文和各次拉取的 SEL 记录，提交后由 Host 注入的 `history` 端口删掉 SEL 记录，再把没有任何项目的 Material 或拉取收据引用的正文删掉；仍被别的来源或别的项目引用的正文保留，任何项目库读不出来时一律保留。每次拉取在运行收据的 `content_refs` 里记下它的 SEL 记录持有的正文（含没有留下 Item 的和中断的拉取），这是「SEL 记录引用什么」的 Molis 侧凭据。保留历史的删除不动它们。结果记在事件 `feed_source.history_released`。

来源拉取和规则判断在项目队列外等待。Host 为同一数据库/项目/来源提供共享活动租约；不同幂等键也不能并发拉取同一来源。来源配置改变或原调用取消/撤权后，旧响应不提交结果和失败状态，原运行可在新调用中恢复。账号链路把相同执行检查传到 Listener 的每个异步提交点。

`createFeedExactRouteResolver` 只负责 Feed 的 catalog RSS、自定义 RSS 和 YouTube 来源。公共 web query 路由、SEL intent 装配与证据密文保存由 Host/Storage 提供；Feed 通过注入端口使用它们，继续拥有来源策略、游标和同步提交。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-plugin-feed typecheck
pnpm --filter @molis-ai/molis-work-plugin-feed build
```

已有行为示例与回归：[feed-native-plugin.test.ts](../../../tests/feed-native-plugin.test.ts)、[feed-goal-promotion.test.ts](../../../tests/feed-goal-promotion.test.ts)。完成上述构建后运行：

```bash
node scripts/run-tests.mjs tests/feed-native-plugin.test.ts tests/feed-goal-promotion.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：Feed 导航、来源工作台、界面、处置与模块组合。
- 不负责：Attention 事实（平台服务）、Provider 实现。Feed Item、Source、Signal 与 Listener 的表和存取是本包的（`src/store/`，FI-5 前是 `modules/feed`、`modules/sources`、`modules/signals`、`horizontal/listener-host` 四个包）。
- 公开入口：`@molis-ai/molis-work-plugin-feed`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`；第三方依赖见 `package.json`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 捕捉场景的判断（规则可用哪些判断、哪些建议仍成立、怎样记录）在本包的 `createFeedSceneRuntime`；Host 的 `feed-scene.ts` 只接判断账本与可读的消息，不写判断（`tests/feed-inbox-scene-runtime.test.ts`）。
  - 拥有 `src/store/` 里的 11 张表和 `feed_out_rules`，不拥有 Attention 与情境账的表；不直接实现 GitHub 或 Gmail 协议。
  - 失败都是 `ActionError`：码是 `feed.<原因>`（`feedErrors`，声明在本插件的公开合同 `./contract`；RSS、YouTube 集成和平台的来源拉取用各自的码 `rss.*`、`youtube.*`、`actions.input_invalid`），Inbox 事项找不到是 `inbox.entry_not_found`（`inboxErrors`，合同 `modules/attention-resumption`）；状态只由 kind 推出，本插件没有错误类和状态表。提供方报告的失败是 `feed.connector_failed`，提供方自己的码（`connector.rate_limited` 等，运行与来源故障里存的就是它）放在 `details.error_code`。模块自己的 `FeedError`、`AttentionError` 在 `callFeed`、`callAttention` 处换成上面的码。
  - Provider 失败、部分接收与重试不能混成同一个成功状态；指定来源必须属于当前项目。
  - 关键词预览读最近五条原消息，不调模型、不保存规则、不入箱。
  - 已忽略（归档）的 Item 只能先恢复：不能被加入 Inbox、不能重开它已关闭的条目，捕捉失败也不为它记条目。
  - 连同本地历史删除来源时，只删没有任何项目的 Material 或拉取收据引用的加密正文；数不清引用（有项目库读不出来）就一律保留。
  - 停用、改绑、内容变化或撤权后撤下建议，历史保留；外部内容是不可信输入。
- 改动后必跑：`node scripts/run-tests.mjs tests/feed-contract.test.ts tests/feed-item-actions.test.ts tests/feed-capture-scenes.test.ts tests/feed-connectors.test.ts tests/feed-goal-promotion.test.ts tests/feed-promote-mcp.test.ts tests/feed-promote-reader.test.ts tests/feed-native-plugin.test.ts tests/mcp-action-settings.test.ts tests/feed-inbox-lifecycle.test.ts tests/feed-local-history-delete.test.ts tests/feed-inbox-pages-loop.test.ts tests/local-web-actions.test.ts tests/feed-source-actions.test.ts tests/feed-inbox-scene-runtime.test.ts tests/feed-inbox-schedule-error-model.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/feed-capture.e2e.test.ts`
- 相关手册：[docs/modules/feed.md](../../../docs/modules/feed.md)、[skills/molis-plugin-dev/integrations.md](../../../skills/molis-plugin-dev/integrations.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 存储层（`src/store/`）

四块，原来是四个包（FI-5 并进来），表由本包的 `FEED_PROJECT_DATABASE` 声明，不在项目库基线里：

| 文件 | 内容 | 表 |
| --- | --- | --- |
| `store/items/` | `FeedModule`（`query` / `commands` / `events`）、导入与材料写入、处置/已读/升格/随来源删除、Feed/Goal 关联端口 | `feed_items`、`feed_materials`、`feed_item_events` |
| `store/sources.ts` | `SourcesModule`：来源身份、期望的监听状态、范围、计划意图与 Provider 绑定引用 | `feed_sources`、`source_events` |
| `store/signals.ts` | `SignalsModule`：规范化的外部事件、去重身份、修订与来源 | `signals`、`signal_revisions`、`signal_events` |
| `store/listener.ts` | `ListenerHost`：持久游标、租约、重试、隔离、原始事件投递与运行收据 | `listener_instances`、`listener_deliveries`、`feed_source_runs` |

- 存取只经 `FeedSql`（`store/sql.ts`：`get`/`all`/`run`/`transaction`，同步，和 better-sqlite3 与平台的 `PluginDatabaseTransaction` 的交集）。存储层不 import 数据库驱动或 `@molis-ai/molis-work-storage` 的连接；`fromBetterSqlite(db)` 包 better-sqlite3 的连接，现在只给 `createDemoFeedApplication`（`apps/local-host/src/demo-feed-library.ts`）和测试用；Runtime 里的 Feed 在 `runtime-ports.ts` 用 `fromPluginReader(services.database)`（只读，写和事务都直接拒绝）和 `fromPluginTransaction(transaction)`（平台已开的写事务）包平台给的库。
- 构造器只存引用：不执行建表语句、不缓存语句或连接、不读 `sqlite_master`。表由声明建（`FEED_PROJECT_DATABASE` 的 `schema` 是 `out-rules.ts` 与 `store/` 下四份建表语句的拼接，与本插件现行结构一致），所以每次调用现建一个 Module 是安全的（FI-6 的 `fromPluginTransaction` 依赖这一点）。测试要自己造库时，先执行对应的 `*_SCHEMA_SQL`。
- 不变量：
  - `FeedModule` 是 `feed_items`、`feed_materials`、处置与 Feed 事件的唯一写入者；入口不导出 Repository 或 Store，也不转出 Storage 的证据正文库（RAC-170）。别的包不读写 `feed_materials`（`scripts/gates/table-owners.mjs`）。
  - 凭据正文不进 Source 记录，只存引用；来源想怎样被听（Sources）与实际游标、租约（Listener）是不同事实，不混。
  - Integration Adapter 只产出 Draft，正式校验与去重在 `SignalsModule`；不同 Source 的事件身份不能混为同一事件；Signals 不判断事件是否进入 Feed、Inbox 或 Goal。
  - 收到 Signals 回执之前 Listener 不推进游标、不确认投递；同一来源的有效租约阻止重复消费，多次转换失败进入隔离，终态重放不再调用 Provider。
  - 运行账本 `feed_source_runs` 只由 `store/listener.ts` 读写；Listener 的表按来源 id 指向来源，不对 `feed_sources` 加外键，一个来源的运行记录经 `deleteListenerSourceState` 显式清掉。
  - 不直接创建 Goal，升格经 Goals 的公开入口；`linked_goal_id` 等兼容输出由 Ledger 推导，不恢复旧字段双写；外部标题、正文与链接是不可信输入，不成为指令。
- 改动后必跑：`node scripts/run-tests.mjs tests/feed-store-declaration.test.ts tests/feed-module-repositories.test.ts tests/feed-goal-query.test.ts tests/feed-receive-chain.test.ts tests/feed-sources.test.ts tests/plugin-runtime-integration.test.ts tests/plugin-contract-ownership.test.ts`
- 合同在本插件的公开入口 `@molis-ai/molis-work-plugin-feed/contract`（`src/contract/`：条目、来源、Signal 与 Listener 的状态，PG-111，T-110）；`sourceErrors`、`listenerErrors` 声明在主人是 `sources`、`listener` 的 `store/sources.ts`、`store/listener.ts`，经 `./store` 出口可见。集成插件交出的 `RawEventAdapter` 与订阅源回执 `RssFetchReceipt` 是平台的，在 `@molis-ai/molis-work-contracts/platform/plugin-source-pull`。

## 进一步阅读

- [职责与接入说明](../../../docs/modules/feed.md)
- [架构与当前实现索引](../../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

首页通过 `feed.home.events` 读取 Feed 的原事项与来源状态。已进入 Inbox 的材料或来源故障由 Inbox 提供，完成或忽略后不会作为原始 Feed 事项重复出现。普通材料按请求窗口筛选；需要处理的来源放到今天，并提供“查看来源”的分组导航。断连和同步异常分别说明，不把任意错误称为需要重新授权。关联 Goal 名称通过共同对象查询读取；无权读取 Goal 时保留 Feed 自己拥有的关联 ID。首页不再持有 Feed 分类或数据拼装分支。

连接使用位置查询 `feed.connection.usages` 仅投影当前项目来源的 `config.connection_id`，给出已有来源同步动作与 source id，不返回邮件正文、游标或凭据。公开来源没有账号引用；暂停与原连接失效后不可据此执行同步。
