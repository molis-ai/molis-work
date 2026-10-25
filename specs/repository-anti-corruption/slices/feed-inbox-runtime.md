# Feed 与 Inbox 迁到 Plugin Runtime（PG-093、PG-089 余半、PG-040 余半、PG-034、PG-046、PG-057、PG-080、PG-010 余项）

状态：拆片稿（2026-10-24），统筹已裁 D1～D4（§3，统筹 10-24 定）；FI-1 已实现在分支 `claude/ac-feed-fi1-scenes`（见 §4），FI-2 已实现（`claude/ac-fi2-rules-manifest`，见 §4 的 FI-2 一节），FI-3、FI-4 先写设计稿。事实都是在 `origin/main` `584112c65` 上读代码核的，没跑过。

派单：防腐线统筹，`ac-sandbox-sched` 线。号段：RAC-300～329 已用完（PG-022 等占了）；**RAC-480～499 归本稿**（统筹 10-24 定），BL-525～534 放后续待办（统筹 10-24 定）。

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
| PG-010 余项（BL-465） | **FI-2 已做**：三条默认规则随声明它们的场景（Feed、Inbox 的 Manifest 与宿主自己的首页场景）提供，`modules/functions` 没有规则文件；剩「装上的插件的事项动作还不参与首页规则的目标映射」转 BL-531 | FI-2 |
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

## 3. 统筹裁定（统筹 10-24 定，依据用户 10-23 的授权：优先不留隐患、功能友好可用）

- **D1：走路 1，Module 的代码并进 Feed（统筹 10-24 定）。**
  - `modules/feed`、`modules/sources`、`modules/signals`、`horizontal/listener-host` 四个包并进 `plugins/native/feed`；存储层吃一个最小的同步接口 `{ get, all, run, transaction }`，生产用 `PluginDatabaseTransaction` 适配，测试用 better-sqlite3 适配。
  - 路 2（平台给 Runtime 插件一个原 `SqliteDatabase`）是私路，不做；路 3（宿主继续组装，只把表声明搬进 Manifest）关不了 PG-093，不做。
  - 并包会删 workspace 包：同一 PR 用 `node scripts/gates/package-inventory.mjs --table` 重生 `spec.md` §5.1 的对应行；**动手前再 grep 一次**，确认这四个包除了 Feed 没有别的使用方（2026-10-24 在 `584112c65` 上 grep 过，使用方只有 `apps/local-host` 的 Feed 文件与基线）。
- **D2：FI-6 等 `ac-sc3` 的 S9-0b（统筹 10-24 定）。** 注意力与情境账的平台服务由它做（分支 `migrate/goals-s9-0b-attention-ledger`，统筹已让它现在开 PR）。FI-6 不自带这两个服务，不和它撞。
- **D3：集成登记（PG-046）方向由统筹定，不弹窗（统筹 10-24 定）。**
  - 集成由插件在 Manifest 里声明，平台按已装插件的声明生成登记，同一个 Home 一份。这是「能力注册一次」加「插件同等待遇」，外部插件声明了一样生效。
  - 连接器目录不另当主人。
  - 外部文档来源（notion、feishu、lark、google-docs）并进同一张登记，用 `kind` 区分：来源或文档导入。
  - 每个来源各开一个内存 Runtime 的做法，改成共用一个。
  - FI-3 先写设计稿，统筹审过再实现。W5-11（OAuth 移进官方集成插件，统筹 10-23 定）是 Codex C4，也动 `official-integrations.ts`：设计稿要写清 OAuth 在登记里放在哪里，让 C4 照这份设计做，本线不做 OAuth 那一半。
- **D4：Feed 的两处跨项目读写，两条分开（统筹 10-24 定）。**
  - `connector-source-state.ts` 走 (b)：各项目里的 Feed 订阅连接变化事件，自己刷新来源状态，宿主不再打开每个项目库去写。
  - `feed-history-release.ts` 不选 (a) 也不选 (b)：(a)「读所有项目库」的权，同等待遇下外部插件也会拿到，是隐患；(b)「只数已打开的项目」会在没打开的项目引用正文时误删，「保守不删」实际是永远不释放。改成 **Feed 的 Home 一半自己记引用账**：项目一侧写引用之前先在 Home 账上加，删引用之后再从账上减，账总是引用的超集，只会漏释放、不会误删；漏释放只发生在崩溃时，有界，维护时补。释放时只查 Home 账，不打开任何项目库。
  - Home 一半照双实例的做法（PG-012 的平台一半已有，Shelf 是样板）。存量的账由维护一次补齐（开每个项目一次），不在读取时兜底；时段跟 W5-17 同一次，归用户。
  - FI-4 先写这一段的设计，统筹审过再写代码。
- **顺序与规矩（统筹 10-24 定）。** FI-1 现在开工（不碰 contracts，和 #1242 不重叠）；FI-2 改 contracts，等 #1242 合入后基于 main 做，等的时候先写 FI-3、FI-4 的设计稿。每片一个完整 PR，没做完只推分支，同时只有一个 PR 在评审或修复；BL-490（#1241 合入后）和 FI-1 两条里本线自己排先后，建议先 BL-490。

## 4. 拆片

| 片 | 内容 | 前置 | 验收（暂定号） | 碰的枢纽文件 | 可开工 |
| --- | --- | --- | --- | --- | --- |
| **FI-1** 场景判断随插件（PG-034） | `feed-scene.ts`、`inbox-scene.ts` 的判断逻辑搬进两个插件包，导出 `createFeedSceneHandler(ports)`、`createInboxSceneHandler(ports)`；宿主只给端口（选项存取、判断触发），不写判断。此时 provider 仍由宿主拼，Runtime 化后同一个处理器经定义贡献 | 无 | RAC-480～483：宿主里没有场景判断逻辑（门禁：这两个宿主文件只剩接线）；处理器对未声明的场景、别的项目、撤权的调用逐个拒绝；行为与搬前一致（现有场景测试原样过） | `content-action-providers.ts`、`inbox-actions.ts`、两个插件的 `scenes.ts` | 已实现 |
| **FI-2** 三条默认规则随 Manifest（PG-010 余项，BL-465；已实现，见下一节） | 场景声明加字段，规则的文字、选项、用途写进声明它的插件（Feed 的采集判断、Inbox 的「是否进 Inbox」「挑下一步」），平台照声明种，`builtin.ts` 不再有这三条；装上的插件同样参与。**改合同**，`pnpm api:update` | 无（避开 FI-1 改的 `scenes.ts` 的同一行，两片先后合） | RAC-484～487：规则只来自声明；装上的插件声明的规则同样被种；声明冲突（同一个 offer id 两处）不猜；`builtin.ts` 无这三条 | contracts `plugin.ts`/`actions.ts`、`modules/functions`、两个 `manifest.ts`、`tooling/gates/api` | **现在** |
| **FI-3** 集成登记（PG-046） | `official-integrations.ts` 的三个写死项换成登记：集成由插件在 Manifest 里声明，平台按已装插件的声明生成登记（一个 Home 一份）；每个来源一个内存 Runtime 改成共用一个；外部文档来源并进同一张登记（`kind` 区分来源与文档导入）；OAuth 的位置写进设计，实现归 Codex C4 | 先出设计稿（D3），统筹审过再实现 | RAC-488～491 在设计里定 | contracts、`official-integrations.ts`、`artifact-document-import.ts`、`feed-connector-sync.ts` | 设计稿现在写；实现等统筹审 |
| **FI-4** Feed 的跨项目读写（PG-043 的 Feed 半） | `connector-source-state.ts` 改成各项目的 Feed 订阅连接变化事件自己刷新；`feed-history-release.ts` 改成 Feed 的 Home 一半记引用账（先加后减），释放只查 Home 账；存量账由维护补齐（归用户，同 W5-17 时段） | 先出设计稿（D4），统筹审过再实现；Home 一半要 PG-012 的平台一半（已有） | RAC-492～493 | `feed-history-release.ts`、`connector-source-state.ts` | 设计稿现在写；实现等统筹审 |
| **FI-5** Feed 的表和 Module 代码归 Feed（PG-087 的 Feed 半、X-5 余半） | D1 走路 1：四个包并进 Feed；Feed 的 `databases.project` 声明 `feed_*`、`sources`、`signals`、listener-host 的表（表名与数据不动，照 Goals S8 的做法，基线不再建，被拒只停 Feed）；Attention、ContextLedger 仍在基线，等 FI-6 的平台服务 | D1 已定（路 1） | RAC-494～496：声明与旧基线逐表同形；基线不再建这些表；被拒只停 Feed；Module 包不再被 `apps/local-host` 以外的东西 import | `project-database-schema.ts`、`project-plugins.ts`（若同批）、`scripts/workspace-packages.mjs`、`specs/…/spec.md` §5.1 包清单 | FI-6 的其余前置排好后（D1 已定）；并包同一 PR 重生 §5.1 |
| **FI-6** Feed、Inbox 进 Runtime（PG-093、PG-089 余半，并关 PG-040、PG-080、PG-045 的余项） | 两个 `PluginDefinition` 与监督器条目；`createLocalFeedApplication` 的 9 处构造点改成调公开动作；`/api/feed*`、`/api/inbox*` 边删（客户端见 FI-7）；来源 tick 用自己的唤醒；互斥用 `services.background` 的锁；成果走 `services.artifacts`；`information.plan` 并进插件；`inbox-actions.ts` 用 `services.attention` 取代 Feed 应用的拼 | FI-1、FI-2、FI-5、PG-087（D2）、FI-3（来源要走登记） | RAC-497～499 及后续（一批较大，进工作时再细拆） | `project-plugins.ts`、`web-request.ts`、`index.ts`（`export *`）、`builtin-plugin-assembly-gate.test.ts`（只减） | 等前置 |
| **FI-7** 客户端改走公开动作（PG-057 的 `/api/feed`、`/api/inbox`） | 29 行引用逐个换成经动作网关调公开动作；Feed、Inbox 的客户端脚本进插件客户端包；`/assets/` 字节数按 `page-assets` 规则处理（预算会涨，要写明） | FI-6 的动作都已公开 | 待拆 | `apps/workbench/src/scripts/client/*`、`tooling/gates/page-assets.json` | 与 FI-6 同批或之后 |

### FI-2 实现：默认规则随场景声明（2026-10-25）

- **合同**：`ActionSceneDefinition` 加可选 `default_rule`（`ActionSceneDefaultRule`：`function_key`、`name`、`instructions`、`options`（`{key, description}`，2 至 20 个）、`subject_kinds`）。SDK 的场景声明检查（`inspectActionDeclarations`，Manifest 解析与 Kernel 登记共用）拒绝：键格式不符、说明为空或过长、选项少于 2 个或重复、场景有 `recommendation_labels` 而选项不在其中、同一份声明里两个场景用同一个 `function_key`。
- **谁声明**：Feed 的 `feed.capture`（`system_admit_inbox`）、Inbox 的 `inbox.next`（`system_pick_inbox_next`）、宿主自己的 `home.dock`（`system_pick_home_dock`，宿主是首页场景的主人，同在 `home-actions.ts`）。规则的文字、选项、对象类型与原来逐字相同。
- **谁来种**：`modules/functions/src/builtin.ts` 删除，换成 `declared-rules.ts` 的 `seedDeclaredRules`，库打开时不再播种。`LocalHost` 新增观察口 `actionScenesRegistered`，`actionRegistry()` 登记任何提供方（内置、装上的、沙箱的）带场景时调用；`project-host.ts` 接到 `seedSceneRules`（`functions-host.ts`），只有场景带 `default_rule` 才打开 Functions 库。播种失败只记 `hostLog.warn("functions", "scene_rule_seed_failed")`，不挡登记。
- **规矩**：同一个 `function_key` 已在库里就原样保留——先声明的赢，用户改过的、后来别的插件声明同名键的都不覆盖（RAC-486）。新写的规则 id 是 `declared-<function_key>`（以前是 `builtin-…`；已有 Home 里的行不动，按键查找）。
- **选项目标**：`declaredRuleTargets` 不再认 `HOME_DOCK_SCENE_ID`，改按场景的 `recommendation_source === "subject-offers"`，仍只看内置插件目录；两处声明同一个 offer id 仍不猜（RAC-176）。装上的插件的事项动作参与目标映射转 BL-531。
- **行为变化**：规则以前在 Functions 库第一次打开就全有；现在在对应场景登记时才写（Home 级的首页场景随宿主启动，Feed 与 Inbox 的随项目准备）。没有任何提供方登记过的场景，它的规则也就不在列表里。
- **验收**：RAC-484（规则只来自声明，模块里没有规则；Feed、Inbox 声明各自的规则，宿主启动后首页规则被种）、RAC-485（装上的插件的场景声明的规则同样被种，文字与选项原样）、RAC-486（先声明的赢，用户改过的与后声明同名键的都不被覆盖）、RAC-487（畸形的 `default_rule` 在登记时被拒、什么都不写）；`tests/scene-default-rules.test.ts`；RAC-171/172/173/176 改走声明后仍成立（`tests/functions-feed-module-exits.test.ts`）。
- **API 与动作合同快照**：contracts `platform/actions`、`platform/plugin` 各多一个导出类型和一个可选字段（`pnpm api:update`），插件 SDK 的场景声明检查多一类问题。动作合同快照里 `feed.capture@1`、`inbox.next@1`、`home.dock@1` 和引用首页场景的 `home.judgment.evaluate@1` 的 `traits` 哈希变了（`default_rule` 与 `required_scene` 都算进 traits），输入、输出、事件 schema 的哈希没变；没有升版本：已存的绑定固定的是场景 id、版本与提供方，不读 `default_rule`，升版本反而让现有绑定全部失效。快照用 `pnpm actions:update` 刷新。

### FI-1 一轮修复：绑定只取已发布规则的稳定引用（Codex FIX6，2026-10-24）

PR #1247 的一轮评审（`6389207529`、统筹 `6389275346`）指出，迁移后 `writeJudgment` 经宿主的 `publishedRules()` 为所有已发布规则构建完整动作，扩大了绑定一条规则的读取范围。目标仍是 FI-1 的行为不变：只消费已发布规则的 key、version、provider 身份，实际权限与场景相容性继续由原场景客户端校验。

Functions 目前没有生成纯引用的公开入口，只有完整的 `publishedFunctionAction` 与反向的 `publishedFunctionKey`。在 Functions 既有 `actions.ts` 增加最小 `publishedFunctionReference`，由包入口导出，完整动作构造器复用它；宿主用同一入口提供 `InboxSceneRule.reference`。这比在 Host 恢复旧的字符串拼法多一个 owner helper，但引用与完整动作始终由同一个主人定义，不复制 Functions 身份规则，也不改变发布合同。允许改动仅限这两处 Functions 文件、`inbox-scene.ts`、对应回归测试和本稿；不改 Feed、事项修订、持久化、Manifest、权限、场景合同或 PG-034 的整线状态。

- **RAC-482（补充）**：正常创建并发布的目标规则与无关规则共存时，绑定保持准确的 key、version、provider；宿主的 `publishedRules` 端口只读取稳定身份，不为绑定构建完整动作定义。Functions 动作目录原有的完整定义注册保持。字段访问监测只证明本端口的读取边界，不把人为损坏的记录声称成正常产品入口能产生的数据。
- **RAC-482（拒绝保持）**：草稿和不存在的规则不能绑定；无权或与 Inbox 场景不相容的规则仍由真实场景客户端拒绝，原绑定不变。
- **验证**：先在 `3cd354a5` 的生产路径上运行针对性回归记录失败，再改实现并整体 `pnpm build`，跑新增回归、原 FI-1 场景用例及被改包 README 的相关必跑用例。构建走机器公共槽；本片不另起全量或浏览器批次。原 PR 跨三个包触发的全量要求继续交统筹组批，独立复查仅收本题增量。

顺序（统筹 10-24 定）：**FI-1 现在做**；FI-2 等 #1242 合入后基于 main 做，等的时候写 FI-3、FI-4 的设计稿（统筹审过再实现，设计稿各一份文件：`feed-inbox-integration-registry.md`、`feed-inbox-home-reference-ledger.md`）；FI-5 在 FI-6 的其余前置排好后做；FI-6 最后，因为它依赖前面全部，且是体量最大的一片，进工作时再细拆。

## 5. 不在本稿

- Goals 的 Runtime 化（`ac-sc3`）、PG-087 的平台服务（`ac-sc3` S9-0b）、PG-043 的其余半（`ac-kernel`）。
- 巨大单元：`feed-application.ts`、`application.ts`（522 行）、`ui.ts`（646 行）在迁移里会被拆开，但不在这里立项。
- BL-377 创作台一侧、BL-490/491 沙箱 Home 库（BL-490 已在 `claude/ac-pg017-bl490-home-db`）。

## 6. 开工前核对

动 FI-1 前：`git log origin/main -- apps/local-host/src/{feed-scene,inbox-scene,content-action-providers,inbox-actions}.ts` 看有没有在途 PR 碰过；FI-2 前先看 #1098 之后 `manifest.ts` 与 `modules/functions` 有没有新变化，以及 contracts 的 `plugin.ts` 在途 PR。
