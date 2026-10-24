# Feed 与 Inbox 迁到 Plugin Runtime（PG-093、PG-089 余半、PG-040 余半、PG-034、PG-046、PG-057、PG-080、PG-010 余项）

状态：拆片稿（2026-10-24），摸底完成、待统筹看过再开工；没有实现。事实都是在 `origin/main` `584112c65` 上读代码核的，没跑过。

派单：防腐线统筹，`ac-sandbox-sched` 线。号段：RAC-300～329 已用完（PG-022 等占了），本稿**暂用 RAC-480～499**，BL-525～534 放后续待办，两处都等统筹确认。

## 1. 现状

### 1.1 Feed 和 Inbox 今天怎么跑

两个都在 `tests/builtin-plugin-assembly-gate.test.ts` 的 `BUILD_TIME_ASSEMBLED` 与 `NATIVE_PLUGIN_HTTP_FILES` 冻结名单里：不经 Plugin Runtime，由宿主手工装配。

| 宿主文件 | 行数 | 做什么 |
| --- | --- | --- |
| `feed-application.ts` | 137 | 用 `SourcesModule`、`FeedModule`、`AttentionModule`、`createContextLedger`、`createGoalReadServices`、listener-host 的函数，对着项目库的原连接组装 `FeedApplication`；`registerVersion` 经 `projectVersionStores` 直接写成果（PG-080） |
| `content-action-providers.ts` | 83 | 手写把 Feed 的动作处理器拼成一个 provider（`provider(feedManifest, …)`），含场景处理器 |
| `inbox-actions.ts` | 71 | 手写 Inbox 的 provider；Inbox 自己没有数据，列表与状态来自 Feed 应用的 `listInboxEntries` / `setInboxEntryStatus`（attention 条目） |
| `feed-scene.ts`、`inbox-scene.ts` | 71、101 | Manifest 声明了 `action_scenes`，场景判断的实现在宿主（PG-034） |
| `feed-native-plugin-http.ts`、`inbox-native-plugin-http.ts` | 92、66 | `/api/feed*`、`/api/inbox*` 私有 HTTP 边，返回 HTML 片段与 JSON，由 `web-request.ts` 挂（PG-057） |
| `web-project-schedulers.ts`、`feed-source-scheduler.ts`、`feed-source-runtime.ts` | 78、19、79 | 30 秒的 `projects.schedules` 定时钟里，宿主替 Feed 调 `scheduler.tick()`（PG-040 Feed 半） |
| `feed-source-sync-lease.ts` | 19 | 来源同步的互斥是宿主进程里一个全局 Map（PG-093） |
| `information-actions.ts`、`information-planner.ts` | 40、41 | `information.plan` 写在宿主（PG-093） |
| `official-integrations.ts`、`feed-connector-sync.ts`、`github-/gmail-/catalog-connector.ts` | 146、78 | 只认三个写死的官方集成，每个来源各开一个内存 `PluginRuntime`（PG-046） |
| `feed-history-release.ts`、`connector-source-state.ts` | 78、29 | 释放证据正文前逐个打开 Home 里**所有**项目库读引用；连接变化时打开目录库和所有项目库写来源状态（PG-043 的 Feed 半） |
| `workflow-feed-options.ts`、`plugin-notification-service.ts`、`feed-goal-promotion.ts`、`feed-source-service.ts`、`feed-connector-sync.ts`、`demo-plugin-seed.ts`、`project-host.ts` | — | 都各自 `createLocalFeedApplication(db, …)`：加上 `content-action-providers.ts` 两处，Feed 的应用在宿主里有 9 处构造点 |

客户端：`/api/feed`、`/api/inbox` 在工作台脚本里共 29 行引用（`events-primary.ts` 12、`navigation-inbox.ts` 5、`feed-rule-authoring.ts` 4、`navigation-feed.ts` 3、`events-secondary.ts` 2，另有 `connectors-settings.ts`、`frame-container.ts`、`bootstrap.ts` 各 1）；`apps/desktop` 没有直接引用这两个前缀。

宿主文件里**没有** typed 登记（`HostCapabilityDefinition`、`registerCapability`、`.register(` 在上表所有文件里零命中），所以和 #1242 在这些文件上不重叠；本稿的实现片都基于 #1242 之后的 main。

### 1.2 前置核对

| 前置 | main 上的状态 | 缺什么 |
| --- | --- | --- |
| PG-027 嵌套动作客户端 | **已做**（#843，`services.actions.directory`） | — |
| PG-039 唤醒改成动作 | **已做**（#1123、#1131）。平台定时钟以插件安装身份调它声明的动作 | Feed 要有安装身份才能声明唤醒，所以 PG-040 的 Feed/Inbox 半要等它们进 Runtime |
| PG-020 X-5 项目库服务 | **部分**。L1a/L1b 已做，`services.project_database` 有（受 S-46 语句检查，只放行声明过的对象）。Feed 只声明了 `feed_out_rules`（`FEED_PROJECT_DATABASE`）；`project-database-schema.ts` 的基线仍在建 Sources、Signals、Listener-host、Attention、Feed、ContextLedger 的表 | Feed 的 Module 表要进它的 Manifest 声明（FI-5）；注意力与情境账不归 Feed，见下一行 |
| PG-087 注意力与情境账做成平台服务 | **没做**。`PluginHostServices` 里没有 attention、context ledger。归 `ac-sc3`（S9-0b，排在 S9-0 之后） | Feed 和 Inbox 进 Runtime 之前必须有。这是 FI-6 的硬前置 |
| PG-043 Home 聚合 | 平台半**已做**（S-49 `home_aggregate`：只在**已打开**的项目里逐个调，各项目答案分开）；Coding 半已做；`ac-kernel` 还在做其余 | Feed 的两处跨项目读不一定能用它，见 §3 D4 |
| PG-046 集成登记 | **没做**。`official-integrations.ts` 写死 GitHub、Gmail、Catalog 三个；`plugins/official-integrations/` 下六个包（catalog、github、gmail、rss、web-query、youtube）没有登记入口 | FI-3 |
| PG-010 余项（BL-465） | **没做**。三条默认规则仍在 `modules/functions/src/builtin.ts`；`functions-host.ts` 只做到不钉 Inbox 的 id。Inbox 迁移要等它（PG-089 原文） | FI-2 |
| PG-045 连接 | `services.connections` 已有（S-57）；`feed-connector-auth.ts` 只剩 11 行 | 在 FI-6 里收 |
| PG-080 成果由插件自写 | **没做**。`services.artifacts` 已有，Feed 还是宿主 `projectVersionStores` 写；`feed-application.ts` 里有 `as unknown as ArtifactsSqliteDatabase` | 在 FI-6 里收（Feed 的 `produces` 已在 Manifest 声明 `feed.capture`） |

没验证的：Feed 的 Module 代码（`modules/feed`、`modules/sources`、`modules/signals`、`horizontal/listener-host`，合计约 2300 行，同步、直接用 `db.prepare`/`db.transaction`）能否在 `services.project_database` 的受检客户端上原样跑——我只读了接口（`transaction(beforeEffect, tx => …)`，`tx.get/all/run` 同步），没试，见 §3 D1。

## 2. 目标形状

- `createFeedPlugin()`、`createInboxPlugin()` 两个 `PluginDefinition`，`start(context)` 只用 `context.services` 建自己的应用；在 `apps/local-host/src/project-plugins.ts` 里各是一个监督器条目，`BUILD_TIME_ASSEMBLED` 与 `NATIVE_PLUGIN_HTTP_FILES` 删掉 `feed`、`inbox`（只许减少）。
- 场景处理器经定义的 `action_scenes` 贡献（`plugin-runtime/src/action-provider.ts` 已支持），宿主不写判断。
- 来源 tick 与互斥：Feed 声明唤醒、用 `services.background` 的锁；用 Feed 自己的安装身份调用，不再借用 `workflow-events`（关 PG-040）。
- 成果经 `services.artifacts`，按 Manifest `produces` 检查（关 PG-080）。
- 工作台的 `/api/feed*`、`/api/inbox*` 边删掉，客户端调公开动作，片段与脚本走插件客户端包（`slices/w5-04-plugin-client-bundles.md` 的做法）。
- 宿主文件全删：上表除 `official-integrations` 一族（改成登记，FI-3）和跨项目两个文件（FI-4）外都消失。

## 3. 要统筹定的

- **D1：Module 的代码怎么在 Runtime 的受检客户端下跑。** 三条路：
  1. 把 `modules/feed`、`sources`、`signals`、listener-host 并进 `plugins/native/feed`（§4 l：只有 Feed 用的并进 Feed——grep 过，这四个包只有 `apps/local-host` 的 Feed 文件在用），存储层改成吃一个最小的同步接口 `{ get, all, run, transaction }`，生产用 `PluginDatabaseTransaction` 适配、测试用 better-sqlite3 适配。改动面大（2300 行），但完全符合「插件拿声明的表、走一份受检客户端」。**推荐。**
  2. 平台给 Runtime 插件一个原 `SqliteDatabase`：等于给内置插件开私路，和 10-18 同等待遇相反，不做。
  3. 宿主继续组装，只把表声明搬进 Manifest：这是 FI-5 的前半，**不是**迁进 Runtime，PG-093 不会关。
- **D2：FI-6 等 PG-087 的平台服务（`ac-sc3` 的 S9-0b）。** 如果它短期不到，FI-6 排不了；请告诉我预计落地的位置，或者让 FI-6 自己带这两个服务（会和 `ac-sc3` 撞，不建议）。
- **D3：集成登记（PG-046）的形状要先问用户。** 登记的主人是谁（插件 Manifest 声明 `integrations`，还是连接器目录）、外部文档来源（notion、feishu、lark、google-docs）是不是同一张表，决定 contracts 与 SDK 的形状。FI-3 动工前先出设计，弹窗问。
- **D4：Feed 的两处跨项目读写不一定能用 Home 聚合。** `feed-history-release.ts` 要证明「Home 里没有任何项目引用某个正文」才删，必须看**所有**项目库（含没打开的）；S-49 的聚合只在已打开的项目里调。`connector-source-state.ts` 是**写**（连接变化后刷新每个项目里来源的状态），聚合只读。两条路：(a) 平台加一个「所有项目、只读」的聚合变体；(b) 证据正文的释放改成只在打开的项目里引用计数 + 保守不删，连接状态改成「各项目的 Feed 订阅连接变化事件自己刷新」。(b) 不用新平台能力，但释放变保守，是产品语义，要你定。

## 4. 拆片

| 片 | 内容 | 前置 | 验收（暂定号） | 碰的枢纽文件 | 可开工 |
| --- | --- | --- | --- | --- | --- |
| **FI-1** 场景判断随插件（PG-034） | `feed-scene.ts`、`inbox-scene.ts` 的判断逻辑搬进两个插件包，导出 `createFeedSceneHandler(ports)`、`createInboxSceneHandler(ports)`；宿主只给端口（选项存取、判断触发），不写判断。此时 provider 仍由宿主拼，Runtime 化后同一个处理器经定义贡献 | 无 | RAC-480～483：宿主里没有场景判断逻辑（门禁：这两个宿主文件只剩接线）；处理器对未声明的场景、别的项目、撤权的调用逐个拒绝；行为与搬前一致（现有场景测试原样过） | `content-action-providers.ts`、`inbox-actions.ts`、两个插件的 `scenes.ts` | **现在** |
| **FI-2** 三条默认规则随 Manifest（PG-010 余项，BL-465） | 场景声明加字段，规则的文字、选项、用途写进声明它的插件（Feed 的采集判断、Inbox 的「是否进 Inbox」「挑下一步」），平台照声明种，`builtin.ts` 不再有这三条；装上的插件同样参与。**改合同**，`pnpm api:update` | 无（避开 FI-1 改的 `scenes.ts` 的同一行，两片先后合） | RAC-484～487：规则只来自声明；装上的插件声明的规则同样被种；声明冲突（同一个 offer id 两处）不猜；`builtin.ts` 无这三条 | contracts `plugin.ts`/`actions.ts`、`modules/functions`、两个 `manifest.ts`、`tooling/gates/api` | **现在** |
| **FI-3** 集成登记（PG-046） | `official-integrations.ts` 的三个写死项换成登记：集成由插件或连接器声明，平台照登记装；每个来源一个内存 Runtime 改成共用一个；外部文档来源并进同一登记（P3 半） | D3 先出设计并问用户 | RAC-488～491 在设计里定 | contracts、`official-integrations.ts`、`artifact-document-import.ts`、`feed-connector-sync.ts` | 设计稿可以现在写；实现等 D3 |
| **FI-4** Feed 的跨项目读写（PG-043 的 Feed 半） | `feed-history-release.ts`、`connector-source-state.ts` 不再自己打开 Home 里每个项目库 | D4 | RAC-492～493 | `feed-history-release.ts`、`connector-source-state.ts` | 等 D4 |
| **FI-5** Feed 的表和 Module 代码归 Feed（PG-087 的 Feed 半、X-5 余半） | D1 走路 1：四个包并进 Feed；Feed 的 `databases.project` 声明 `feed_*`、`sources`、`signals`、listener-host 的表（表名与数据不动，照 Goals S8 的做法，基线不再建，被拒只停 Feed）；Attention、ContextLedger 仍在基线，等 FI-6 的平台服务 | D1 | RAC-494～496：声明与旧基线逐表同形；基线不再建这些表；被拒只停 Feed；Module 包不再被 `apps/local-host` 以外的东西 import | `project-database-schema.ts`、`project-plugins.ts`（若同批）、`scripts/workspace-packages.mjs`、`specs/…/spec.md` §5.1 包清单 | 等 D1 |
| **FI-6** Feed、Inbox 进 Runtime（PG-093、PG-089 余半，并关 PG-040、PG-080、PG-045 的余项） | 两个 `PluginDefinition` 与监督器条目；`createLocalFeedApplication` 的 9 处构造点改成调公开动作；`/api/feed*`、`/api/inbox*` 边删（客户端见 FI-7）；来源 tick 用自己的唤醒；互斥用 `services.background` 的锁；成果走 `services.artifacts`；`information.plan` 并进插件；`inbox-actions.ts` 用 `services.attention` 取代 Feed 应用的拼 | FI-1、FI-2、FI-5、PG-087（D2）、FI-3（来源要走登记） | RAC-497～499 及后续（一批较大，进工作时再细拆） | `project-plugins.ts`、`web-request.ts`、`index.ts`（`export *`）、`builtin-plugin-assembly-gate.test.ts`（只减） | 等前置 |
| **FI-7** 客户端改走公开动作（PG-057 的 `/api/feed`、`/api/inbox`） | 29 行引用逐个换成经动作网关调公开动作；Feed、Inbox 的客户端脚本进插件客户端包；`/assets/` 字节数按 `page-assets` 规则处理（预算会涨，要写明） | FI-6 的动作都已公开 | 待拆 | `apps/workbench/src/scripts/client/*`、`tooling/gates/page-assets.json` | 与 FI-6 同批或之后 |

建议顺序：**FI-1、FI-2 现在做**（互相独立、都不等 X-5，都是完整的一片，各开一个 PR，先做 FI-1）；FI-3 先出设计稿问用户；D1、D2、D4 请统筹给答复后排 FI-5、FI-4；FI-6 最后，因为它依赖前面全部，且是体量最大的一片，进工作时再细拆。

## 5. 不在本稿

- Goals 的 Runtime 化（`ac-sc3`）、PG-087 的平台服务（`ac-sc3` S9-0b）、PG-043 的其余半（`ac-kernel`）。
- 巨大单元：`feed-application.ts`、`application.ts`（522 行）、`ui.ts`（646 行）在迁移里会被拆开，但不在这里立项。
- BL-377 创作台一侧、BL-490/491 沙箱 Home 库（BL-490 已在 `claude/ac-pg017-bl490-home-db`）。

## 6. 开工前核对

动 FI-1 前：`git log origin/main -- apps/local-host/src/{feed-scene,inbox-scene,content-action-providers,inbox-actions}.ts` 看有没有在途 PR 碰过；FI-2 前先看 #1098 之后 `manifest.ts` 与 `modules/functions` 有没有新变化，以及 contracts 的 `plugin.ts` 在途 PR。
