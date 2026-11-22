# 统一工作分区：废除个人插件与项目插件之分、星型单向 Push、清零双轨（Unified Partition Plugins）

状态：需求书已定稿，U1～U13 用户已于 2026-11-22 弹窗拍板（结果见第 14 节末）；尚未改任何业务代码，待按第 12 节开独立工作树分片推进。盘点取自 main `1d38f73928`（2026-11-22），行号以该提交为准；在途 [#2239](https://github.com/molis-ai/molis-work/pull/2239)（第 47 批，创作台归平台 `horizontal/plugin-studio`）按其分支 `origin/batch/47` 计入。

需求维护：Claude（本会话）；实现：待分配，获批后另开独立工作树分片推进。类型：底层与架构（主）、横向能力（放置、同步、搜索、MCP、Agent）、产品线（全部 24 个内置插件）。来源：用户 2026-11-22 在[特殊逻辑平民化](../plugin-specials-demotion/spec.md) D4 弹窗里给出的需求原文（下称「原文」）；本文按原文补遗漏、对照现行代码校正、给出可执行方案。

## 白话说明

**这件事做什么。** 今天插件分两种：「个人插件」（每个项目都开着、只能隐藏，有的跑在 Home 一层、数据混在一个库里按 `project_id` 分）和「项目插件」（每个项目一份）。这件事把这种分法取消：插件包在 Home 装一次；每个**分区**——一个固定的「个人空间」加上你的各个项目——自己决定开哪些插件，各自一套库、一套文件。个人空间里的东西可以「推送」到项目里成为副本，以后再推就按版本更新那份副本；项目里改过的，覆盖前先问你。

**解决什么问题。** ① 同一个插件今天有三种跑法（Home 一份、每个项目一份、两半都有），宿主为此有两套几乎一样的装配代码，第三方插件只能用其中受限的一部分；② 「个人」这个词在代码里有五种意思，`project_id: null`（Home 级业务位置）和 `"personal"`（个人空间分区）并存，放置、同步、搜索各自分支；③ 个人插件拿不掉，只能隐藏；④ 想把个人空间里写好的东西交给项目，今天只能一次性复制，没有版本、没有更新、没有冲突保护。

**做完能看到什么。** 用户：左上角切换器顶上固定「个人空间」，下面是项目和新建；第一次打开直接进个人空间；任何插件都能在个人空间或任何项目里添加和移除（移除后数据保留）；个人空间里的文档、目标、表格等可以推给项目，再推就更新，项目里有人改过会先问你；插件市场不再有「个人 · 所有项目共用」这一组。开发者：一种插件、一种装配、一种存储写法（单库增删改查，不写 `WHERE project_id = ?`）；第三方插件拿到和内置一样的分区能力。

**为什么现在做。** 首个外部安装（[REL-5](../post-anticorruption-roadmap/reference/batches/rel-5.md) M1）之前改合同和库结构不留兼容期，按发布前干净 v1 基线拍平；之后每一项都要带读取兼容。第 47、48 批正在定第三方插件的交付形态（Home 级沙箱包、`dual_instance`），不先收，这些会写进对外合同。

**需要你做什么。** U1～U13 已拍板（第 14 节末）。第 3 节写了现行代码和原文设想不一样的四处，按本文的处理推进。

## 1. 终态契约（在原文基础上补全）

### 1.1 术语（写进 GLOSSARY，取代今天的五种「个人」）

| 词 | 意思 | 代码名 | 不要混用 |
| --- | --- | --- | --- |
| **账号空间** | 登录账号隔离的整份 Home | `StorageSpace`、`<root>/spaces/<spaceId>/`（`packages/contracts/src/platform/storage.ts:5-12`、`packages/storage/src/space.ts`） | 不改；`kind: "personal"` 指账号，不指分区 |
| **分区** | 日常工作的上下文：个人空间或一个项目，二者同构 | `PartitionId = "personal" \| ProjectId`；合同里的字段仍叫 `project_id`（见 U3 的说明） | 不叫 space |
| **个人空间** | 保留分区 `personal` | `PERSONAL_SPACE_PROJECT_ID`（`packages/contracts/src/platform/placement.ts:18`） | 不是 Home 层 |
| **Home 软件层** | 装包、升级、发布者签名、本人级配置与凭据、系统与跨分区调度 | `scope: "home"` 只留给这些与 Shelf | 不放业务数据 |
| **启用** | 一个分区开着某插件（成员关系） | `partition_plugins`（由今天的 `project_plugins` 改名） | 取代「隐藏」 |
| **推送（Push）** | 同一插件把个人空间的原件按版本投递成某项目里的副本 | `horizontal/placement` 的推送账本 | 与「定版进成果库」正交；与一次性复制、移动不同 |

### 1.2 契约（编号供验收引用）

1. **C1 账号空间不动。** `StorageSpace` 与 `<root>/spaces/` 职责不变；新目录不得占用 `spaces/`。
2. **C2 个人空间是保留分区。** `"personal"` 是系统保留字：建项目、导入、同步接收、整项目复制、团队共享都不能产生或占用这个 id；它不进 `listProjects()`（用户项目列表），不能改名、进回收站、永久删除、对外共享，不计入卸载确认里的「N 个项目」；但它**启用了哪些插件**进个人云同步。
3. **C3 个人空间与项目同构。** 默认输出目录与可选输入目录、成果库与过程项、对象工作终端、要求与认可、可信决定、插件事件与端口连线、定时调度，个人空间与项目一样（今天大部分已有，见 3.1）。
4. **C4 插件平权。** 不再有个人插件、项目插件、Home 插件、双实例之分。内置与签名沙箱包同一模型：包与签名在 Home 软件层装一次；每个分区按需启用、移除（移除保留数据，重新启用恢复）。接收同步数据绝不隐式启用插件。
5. **C5 动作作用域。** 普通插件的业务动作一律是分区作用域（`scope: "project"`，调用上下文带可信分区 id）；`scope: "home"` 只留给系统、账号、包安装、跨分区调度与 Shelf。
6. **C6 存储对插件无感。** 宿主按调用所在分区注入该分区的 `services.project_database`（分区主库 `molis-work.db`）、`services.database`（插件独立库）与 `services.ownerFiles`；插件代码只写单库增删改查。
7. **C7 两类引擎各留所长。** 用分区主库的插件保留同连接原子事务（`scheduler.join`、`artifacts.join`、`attention.join`、`notifications.deliver`）与 SQL 操作码校验；用独立 SQLite 的插件每个分区一个库实例，保留同步触发器与原生 authorizer。
8. **C8 配置与连接归本人。** 模型供应商、生图配置、本机工具探测、连接器凭据（`connectors.db` + `SecretStore`）留在 Home 层归本机本人；连接槽支持「本人默认」绑定，`per_record` 绑定仍按分区隔离；共享项目的其他成员、未获准的 Agent、跨分区的外部客户端绝不继承本人凭据。
9. **C9 推送是星型单向。** 持续更新的血缘只有「个人空间原件 → 项目副本」；项目之间不建覆盖血缘；项目里的条目可以一次性「另存为个人空间里的新原件」（新建，不建反向边）。
10. **C10 跨分区总览不唤醒。** 个人空间里的「所有项目」总览只读平台的总览索引或有界只读查询，不唤醒休眠项目的 `PluginSupervisor` 与沙箱进程。
11. **C11 干净 v1。** 生产代码不留旧结构兼容读取与开发期过渡升级段；按发布前 v1 拍平（`tooling/gates/schemas/same-version-exceptions.json` 登记经用户批准，重生 `0.1.0` 金样）；真实 `~/.molis-work` 不迁移、清理干净重建（U13）。

### 1.3 白名单（只这几样保留各自定位，其余一律按 C4）

| 部件 | 保留什么 | 依据 |
| --- | --- | --- |
| Shelf | 唯一常开（`always_on`）；Home 全局单库（`home-document` 同步）；跨分区暂存与拖放中转；项目半是唯一允许的 `dual_instance`（U9） | 原文；[平民化 D1](../plugin-specials-demotion/spec.md) |
| 插件创作工作台 | 切换器顶部的扩展入口；#2239 起是平台框内页面，不是插件 | 原文；#2239 |
| Alchemist | 见 U10（原文与平民化 D2 不一致，要你定） | 原文；平民化 D2 |
| 内容包（`kind: "content"`） | 技能包、场景包的声明式机制不变 | 原文 |
| Characters、判断规则 | `modules/characters`、`modules/judgment-rules` 职责与存储归属不变 | 原文 |

## 2. 现状（盘点要点，细节见第 8 节矩阵）

### 2.1 三种插件跑法

| 跑法 | 插件 | 数据在哪 |
| --- | --- | --- |
| 每个项目一份（`project_runtime`），用分区主库 | Goals、Coding、Feed（项目半）、Inbox、Risk、Schedule、Git、Diff、Text Stats | `projects/<id>/molis-work.db`；几乎每张表仍带 `project_id`（例：Goals 约 20 张表 `REFERENCES boards(project_id)`，`plugins/native/goals/src/project-database-goals.ts:101`） |
| 每个项目一份，但用一个 Home 共用库 | Pages、PPT、Form、Dataset、灵光、Workflows | `{home}/<名>/<名>.db`，按 `project_id` 过滤，靠 `databases.home.project_rows` 随项目删行；Pages、PPT、Form、Dataset 还经 `artifact_join` 跨库写成果（`apps/local-host/src/plugin-artifact-row-sql.ts:1-45`，因此这些库被迫 `journal_mode=DELETE`） |
| Home 一份（`runtime.scope: "home"`） | Todo、Jelly、Cognia、Images、Issues | `{home}/<名>/<名>.db`；Todo 用 `placement = personal \| project \| unassigned` + 可空 `project_id` 自己建模个人与项目（`plugins/native/todo/src/contract.ts:16`、`database.ts:30-31`），30 个动作全是 Home 作用域、20 个声明 `project_reach: "person"` |
| 两半都有（`dual_instance`） | Feed（Home 半管证据正文引用 `feed-content.db`）、Work Brief（个人简报汇总各项目）、Shelf | Home 库 + 项目库 |
| 宿主手写 | Alchemist（自己的 `studio.sqlite`，用 `better-sqlite3`）、创作台（#2239 归平台） | 各自 |

另外 14 个内置插件带 `personal: true`（`apps/local-host/src/plugin-registry.ts:94-96`）：每个项目都开、只能隐藏（`ProjectPluginMembership.hidden`、`catalog.db` 的 `project_plugin_exclusions`），其中 8 个其实每个项目一份。

### 2.2 两套宿主装配

`HomePluginHost`（`apps/local-host/src/home-plugins.ts:57-399`）与项目侧 `createPluginPlatform`（`plugin-platform.ts:243`、`project-plugins.ts:136-227`）各一套；已装签名包也是两套：`HomeInstalledPlugins`（`home-installed-plugins.ts:70-217`）与 `installed-plugin-host.ts:~110-280`，约九成重复（`installedOffers`、`installedCatalog`、`capabilityCatalog`、`hostNetwork`、`pluginSecrets`、`registerPrompts`…），差在同意键、密钥与提示词作用域（`HOME_INSTALL_SCOPE` 与项目 id）。Home 包经 `HomePluginHost.outsideBuild()`（`home-plugins.ts:114-117`）→ `projectReachablePlugins`（`project-action-availability.ts:22-35`）默认送进每个项目；安装范围三态 `dual | home | project` 由 `assertScopeKept` 锁死（`plugin-install-service.ts:343-349`）。

### 2.3 Home 级业务位置与个人空间并存

- 放置：`HOME = "home"` 标记、`moveHome`、`belongs_to`/`belonged_to`（`horizontal/placement/src/index.ts:47-49,198-273`）；`project_id === null` 被当作「Home／由助理授权」，`"personal"` 被当作「私有」（`index.ts:227-238,498-499`）；从 Home 复制直接拒（`index.ts:641`）。
- 动作上下文：`project_id: null` 既表示 Home 系统作用域，也表示 Home 插件的业务位置（`packages/contracts/src/platform/actions.ts:115,187,569,606`），全仓约 660 处，要逐处分清（见 9.2）。
- 搜索把 `null` 当作「个人」（`packages/contracts/src/services/search.ts:46-47`）。

### 2.4 同步

`BuiltinSyncBinding.scope` 有 10 种（`packages/contracts/src/platform/plugin-sync-registration.ts:51-58`）；`projects` 范围在接收未知项目时会静默 `addProjectPlugin`（`apps/local-host/src/personal-plugin-sync.ts:44`，目前无内置插件用这个范围，属潜伏行为）；项目成员关系只以需求清单同步（`modules/projects/src/portable-project.ts:48,66-68`）；目录元数据同步排除个人空间（`project-catalog-replication.ts:25`），但内容同步会列到它（`personal-plugin-sync.ts:29`）；`placement.db` 不同步（血缘只在本机）。附件按（账号空间, SHA-256）去重，账号空间配额 100 MB（`server/src/sync/quota.rs:109`、`server/migrations/sync/0001_sync.sql:14-28`）。

## 3. 原文设想与现行代码不一样的四处（请确认）

| # | 原文 | 现行代码 | 本文的处理 |
| --- | --- | --- | --- |
| X1 | `personal` 存在 `<Home>/personal-space/` | 已经是 `catalog.db` 里的一行普通项目，库在 `<Home>/projects/personal/molis-work.db`，按需懒建（`personal-project-provisioner.ts:13-31`、`modules/projects/src/project-paths.ts:19`）；输出 `<Home>/outputs/personal/` 已是现状 | 按原文搬到 `<Home>/personal-space/`，全仓只经一个 `partitionRoot(id)` 解析，不散写分支；`home-stores.ts` 同步登记（否则备份、卸载清理、恢复会漏，`tests/personal-plugins-review-fixes.test.ts:107` 断言了清单）。是否搬由 **U1** 定 |
| X2 | 个人空间不进 `listProjects()` | 今天 `listProjects()` 返回它，约 18 处调用方，有的过滤、有的不过滤（切换器 `web-routing.ts:55-56` 不过滤；`onboarding.ts:132-133` 用项目数判断首次运行，个人空间一建就让首次运行判断失效——这是现存缺陷） | 拆成两个函数：`listProjects()` 只给用户项目列表；`listPartitions()`（个人空间 + 项目）给平台遍历（同步、观测、搜索、调度、MCP、外部会话、恢复）；18 处逐一归类（9.2 表） |
| X3 | 「个人插件」是要废除的分类 | 界面文案「个人 · 所有项目共用」指的是 **Home 层**，不是个人空间分区（`zh.json` 的 `tab-workspace-menus.personal-every-project`） | 文案与分组一起删；切换器按功能分组（见 6.4，先定样） |
| X4 | 包装一次 | 包文件已经只存一份（`<Home>/plugin-packages/`，`sandbox-package-store.ts`）；按范围分开的是**安装记录与运行实例**（Home 库一套、每个项目库一套） | 安装记录统一归 Home 软件层一张表，分区只存启用关系（第 4 节） |

另有一处与刚定的决定冲突：原文写 Alchemist「仅摘除目录 `personal: true` 特例，不提前重做构建期接线」，而[平民化 D2](../plugin-specials-demotion/spec.md) 已定「现在删 Alchemist 宿主接线与入口，数据原地保留」。由 **U10** 定。

## 4. 个人空间底座与宿主合并

### 4.1 底座

| 项 | 今天 | 要做 |
| --- | --- | --- |
| 分区根 | 项目根 `projects/<id>/` | `partitionRoot(id)`：`personal` → `<Home>/personal-space/`，项目 → `<Home>/projects/<id>/`；分区主库、独立库、插件文件、终端状态都在分区根下（U1、U2） |
| 建立 | 懒建（5 个入口：首个 `/projects/personal/*` 请求、空白开始、放置、搜索索引、简报页） | Home 初始化时一次建好（幂等），删掉 5 个懒建入口；保留 id 守卫进 `ProjectService.create`、同步接收、导入、整项目复制 |
| 成员关系 | `project_plugins` + `project_plugin_exclusions` + `personal` 推导 | `partition_plugins(partition_id, plugin_id, enabled_at, enabled_by)`；删 exclusions 表与 `hidden` |
| 保护 | 改名、删除、回收已拒（`project-catalog.ts:446-452`、`project-deletion-service.ts:45,121`、`project-sync-admission.ts:9`） | 加：团队共享拒绝；卸载确认不计入；统一写成一条安全不变量（S-141） |
| 同构项 | 成果库、过程项、终端、认可、事件、调度、目录都已按项目（`project-host.ts:255,317`、`project-catalog.ts:259`、`project-plugins.ts:174,192`） | 核一遍「资料（materials）」是否按分区（盘点未确认），缺的补齐 |
| 平台导航 | 成果库要项目上下文（`artifact-library-http.ts`）；外部会话两级都有（`web-catalog-routes.ts:105`、`web-project-platform-routes.ts:278`） | 个人空间下「成果」读写个人空间成果库；「外部会话」只列未归入任何项目或个人空间的会话 |
| 首屏 | 空 Home 走 `/onboarding`，选「空白开始」再进 `/projects/personal/` | 空 Home 直接进个人空间（U11 定引导放哪） |
| 切换器 | 个人空间是普通一行（`settings-navigation.ts:62-90`） | 顶部固定「个人空间」，下面项目列表与「新建项目」；需定样 |

### 4.2 宿主合并

1. **一张安装表。** 内置与签名包的安装记录、升级、发布者固定、同意都在 Home 软件层（今天的 `plugin-runtime` Home 库）；项目库里的安装记录表删除。
2. **一套装配。** 合并 `HomePluginHost` 与项目平台、`HomeInstalledPlugins` 与 `installed-plugin-host`：按（插件, 分区）启动实例，分区服务由 `partitionRoot` 给；Home 层只剩 Shelf（与系统能力）。
3. **删掉的链路：** `outsideBuild()` → `projectReachablePlugins` → `reachEntry({personal:true})`；`plugin-scope-entries.ts` 的两半配对；`assertScopeKept` 三态；`home-package-admission.ts` 的 Home 包限制；`plugin-declared-services.ts` 的「项目实例不得声明 `owner_files`、`model_configuration`、`image_generation`、`local_tools`」（C8）。`local_tools` 仍只给宿主信任（安全边界，按信任级别，不按插件名）。
4. **本人级服务（新增，补原文）。** 有的插件需要「跟人走、不跟分区走」的设置：Images 的生图连接（今天在 `images.db` 的 `connections` 表）、Jelly 的模型选择（`{home}/jelly/preferences.json`）、Cognia 的目录授权。加平台服务 `services.personSettings`：Home 层、按（安装, 键）存，只给本机本人的调用，不进项目同步、不给其他成员与 Agent；插件的业务数据仍在分区。
5. **连接槽。** `horizontal/connector-host/src/plugin-binding-scopes.ts` 加「本人默认」范围（`plugin-installation:<install>/person`），各分区不必重复绑账号；`per_record`（`…/project:<id>/record:<key>`）不变（S-71）。
6. **密钥与提示词作用域。** 今天按 `HOME_INSTALL_SCOPE` 或项目 id 分；合并后插件密钥按安装（Home 层），提示词按安装登记一次；牵动 S-80、S-84、S-87、S-91，同步改表与拒绝测试。

## 5. 存储

| 引擎 | 用的插件 | 改法 |
| --- | --- | --- |
| 分区主库 `molis-work.db` | Goals、Coding、Feed、Inbox、Risk、Schedule；第三方 `sdk.projectDatabase` | 个人空间的 `molis-work.db` 与项目同构建表；删业务表里冗余的 `project_id` 列与 `REFERENCES boards/project_root(project_id)`（U3）；同连接事务与操作码校验不变 |
| 分区独立库 | Pages、PPT、Form、Dataset、灵光、Todo、Jelly、Cognia、Images、Issues、Workflows、Work Brief；第三方（新开放） | 扶正现成的 `databases.home.partition: "project"` 机制（`packages/contracts/src/platform/plugin-database.ts:210-228`、`apps/local-host/src/plugin-database-partitions.ts:61-100`，今天只有测试夹具在用），改名 `databases.partition`；每个分区一个库，位置见 U2；删 `project_rows` 钩子（删分区就是删目录）；开放给签名沙箱包（取消 `installed-plugin-libraries.ts:189` 的拒绝）；`artifact_join` 改为同分区内的 ATTACH |
| 插件文件 | Images（`images/assets/`）、Shelf、沙箱 `owner_files` | 进分区根（Shelf 例外，留 Home） |
| 证据正文池 | Feed（`{home}/security/evidence/blobs/`，按 SHA-256 内容寻址，引用记在 Feed 的 Home 库 `feed_content_holds`） | 正文池仍在 Home、跨分区共享；**引用账本从 Feed 的 Home 半搬进平台证据服务**（`packages/storage` 的 evidence-content 旁，键 `(content_ref, partition_id, owner_install, holder_key)`），这样 Feed 不再需要 Home 半；只有持有 `evidence:collect` 的平台路径能回收无人引用的正文（S-98 改写） |
| 本人级设置 | 见 4.2 第 4 条 | `services.personSettings` |

## 6. 跨分区：总览、AI、MCP、搜索、界面

### 6.1 总览索引（补原文：今天的做法会唤醒项目）

今天：Todo「所有项目」读它自己的 Home 库（拆库后不再成立）；Work Brief 个人简报读共用 Home 库；运行总览走 `home_aggregate`，休眠项目要么回内存里的旧读数、要么在后台逐个唤醒（S-49，`apps/local-host/src/home-aggregate.ts:46-60`）。

方案（U4）：插件声明 `overview_projection`（种类、字段、显示名），分区实例在写入时把投影行交给平台；平台存在 Home 级、可重建的总览索引里（与搜索索引同类：只是缓存，不是第二份事实，扩展 `horizontal/search` 的存储与查询，不另起库）。个人空间里的 Todo、简报、日历、运行总览只读这个索引；点进某一行才打开那个分区。读取范围仍只给本机本人（S-74 的 `readable_project_ids`），Agent、MCP、工作流、插件调用一律拒。`call-budget` 加「个人空间总览」场景，门禁量开库次数为常数、与项目数无关。

### 6.2 AI 与 MCP

- 绑在某项目的外部 MCP 客户端、项目 Agent、以后的团队成员只能碰那个分区；个人空间对它们来说是另一个分区，今天的逐客户端逐项目授权（S-08，`config/mcp-tools.json`）已经能隔开。加一条：个人空间**永不作为默认分区**，外部 MCP 要碰个人空间必须在 MCP 管理页单独确认绑定（S-144）。
- `scope: "home"` 的 MCP 授权（`project_id: null`，`apps/local-host/src/mcp-action-grants.ts:39,85,108`）随普通插件动作改分区作用域而失效；干净 v1，不迁移授权，用户重新授权。
- 推送由本机本人发起，或由本人**按目标项目**授权过的助理直接执行（U7）：授权在设置里可随时撤回，每次推送留记录并通知本人；项目 Agent、外部 MCP、工作流不能推；覆盖已被别人改过的副本、撤回并删除副本仍要本人逐次确认。

### 6.3 搜索

结果已带 `project_id`（`search.ts:46-47`）；删掉 `null = 个人` 的含义，改为明确的分区标注（个人空间 / 项目名）；推送出来的副本标「来自个人空间 · v3」，原件标「已推送到 2 个项目」。

### 6.4 界面（先定样，按 `skills/molis-design-ui/SKILL.md`）

切换器（个人空间置顶）、插件市场按功能分组（插件在 Manifest 声明平台固定词表里的类别，取代「个人 · 所有项目共用」）、推送确认（含连带启用插件）、覆盖冲突、撤回两种语义、副本与原件的标注、移除插件「数据会保留」。按[界面通用规则](../../DESIGN.md)与组件板已有控件出高保真可点原型，确认后再写产品代码。

## 7. 推送（Push）契约

### 7.1 插件声明（可选；纯工具插件不声明）

```ts
// Manifest
push: {
  kinds: [{
    kind: "page",                        // 插件自己的对象种类
    export_action: "pages.push.export",  // 动作类型 molis.push.export.v1
    put_action: "pages.push.put",        // 动作类型 molis.push.put.v1
    local_refs: ["/folder_id", "/goal_id", "/artifact"],   // 分区局部引用：平台在投递前置空
    children: ["comments"],              // 随同的子记录（插件在 export 里给）
  }]
}
```

- `export`：输入 `{ source_id }`，输出快照 `{ kind, schema_version, source_id, source_rev, record, children[], files: [{ role, sha256, media_type, byte_length }] }`。附件只给摘要，字节经平台资料服务按 SHA-256 取。
- `put`：输入 `{ target_id, op_id, base_target_rev | null, snapshot, mode: "create" | "overwrite" }`，输出 `{ target_id, target_rev }`；按 `(target_id, op_id)` 幂等；`base_target_rev` 不等时拒（`push.target_changed`）。
- **快照禁止携带执行态与授权**：运行中的会话、后台作业、终端进程、闹钟开关、账号与连接绑定、`credential_ref`、审批与认可票。SDK 按字段类型（密钥引用、连接引用）校验并拒，平台再查一遍。
- 附件 SHA-256 不变，本机 CAS 与云端 R2 同账号空间去重（不重复占 100 MB 配额）。
- 现成的基础：Pages 的 `relocate`/`duplicate` 已清 `folder_id`、`goal_id`、`artifact_id`（`plugins/native/pages/src/store.ts:205-222`），PPT、Form、Dataset、灵光同类；`placement.copy` 的 `request_id` 幂等（`packages/contracts/src/platform/placement.ts:21-60`）；`placement.attach` 的 `read.revision`（`index.ts:146-177`）。

### 7.2 账本（归 `horizontal/placement`，U5）

存在个人空间的分区主库，随个人空间同步（否则换一台设备再推会生成双胞胎副本）。

```sql
CREATE TABLE push_lineage (
  push_id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL, kind TEXT NOT NULL, source_id TEXT NOT NULL,
  target_project_id TEXT NOT NULL CHECK (target_project_id <> 'personal'),
  target_id TEXT NOT NULL,
  last_pushed_source_rev INTEGER, last_pushed_target_rev INTEGER,
  state TEXT NOT NULL CHECK (state IN ('active','detached','upstream_deleted','withdrawn')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (plugin_id, kind, source_id, target_project_id)
);
CREATE TABLE push_operations (
  op_id TEXT PRIMARY KEY, push_id TEXT NOT NULL REFERENCES push_lineage(push_id),
  source_rev INTEGER NOT NULL, base_target_rev INTEGER, mode TEXT NOT NULL CHECK (mode IN ('create','overwrite')),
  phase TEXT NOT NULL CHECK (phase IN ('pending','settled','failed')),
  snapshot_digest TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL, settled_at TEXT
);
```

目标分区主库里另有平台表（同属 placement）：`push_upstream(target_id PRIMARY KEY, plugin_id, kind, source_rev, pushed_at, upstream_state)` 用来显示「来自个人空间 · v3／上游已删除」；`push_superseded(target_id, target_rev, snapshot, files_json, superseded_at)` 存被覆盖的版本，**全部保留**、可逐版恢复（U6）；占用计入该分区的存储显示，用户可在副本的历史里手动删旧版，平台不自动淘汰。

同一原件可以把 v1 推给项目 A、v3 推给项目 B：每个目标项目一行，各记各的版本。

### 7.3 三步幂等提交

1. **预记**：在个人空间库写 `push_operations(phase='pending')`，首次推送同时写 `push_lineage` 并定下确定性的 `target_id`（由 `push_id` 派生，SDK 给 `pushTargetId()`，插件的 `put` 必须接受指定 id）。
2. **投递**：`beforeEffect()` 复核授权与版本（撤权、停用、取消就零写入，只留一行无内容诊断）；目标分区未启用该插件时，确认框里已经写明「将在项目 X 启用 Pages」，此时启用并建库；调用目标分区的 `put`（幂等）。
3. **收口**：回写 `last_pushed_*` 与 `phase='settled'`；目标库写 `push_upstream`。

中断后重试从 `pending` 那一行接着做：`put` 按 `(target_id, op_id)` 幂等，不会生成双胞胎，也不会把自己上次的写入误判成别人的改动。

### 7.4 再推、冲突、撤回、删除

- **再推**：定位原 `target_id` 原地更新，不断项目里对它的关联（Goal、讨论、主线）。读目标当前版本：等于 `last_pushed_target_rev`（没人动过）→ 直接覆盖；不等 → 弹窗二选一：「覆盖项目当前版本（被覆盖的版本留在项目里，可恢复）」或「在项目里另存为新条目」（新 `target_id`，旧副本改为 `detached`）。绝不静默覆盖。
- **局部引用**：按 `local_refs` 置空或落根目录（例：Pages 的个人文件夹 → 目标项目根目录），避免目标库 `SQLITE_CONSTRAINT_FOREIGNKEY`。
- **删除原件**：不级联删副本，只把各行标 `upstream_deleted`。
- **原件侧两个不同的操作**：「仅断开推送关联」（`detached`，副本留着变成项目自己的）与「撤回并删除项目副本」（按目标项目的删除权限与版本门禁调用插件自己的删除动作；版本变了再确认一次；`withdrawn`）。
- **另存为个人空间的新原件**（项目 → 个人空间）：一次性 export → put 成新原件，不写 `push_lineage`，只记一条 `derived_from` 说明来源。
- **和现有操作的关系**：`placement.move`（分区之间移动）与项目之间的一次性 `placement.copy` 保留；个人空间 → 项目的复制由推送取代。

## 8. 24 个内置插件与第三方沙箱包的改造矩阵

引擎：主库 = 分区主库 `molis-work.db`；独立库 = 每分区一个 `databases.partition` 库。工作量 S／M／L。

| 插件 | 现在 | 目标引擎 | 动作作用域变化 | 要清的项 | 推送声明（种类 · 要剥离的局部引用） | 特殊 | 量 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Goals | 项目一份，主库 | 主库 | 不变（约 77 个，项目） | 约 20 张表的 `project_id` 与 `REFERENCES boards(project_id)`；`boards.project_id` 主键改单例 | Goal · 关系 `from/to_goal_id`、`input_bindings`、`boards.active_goal_id`、要求链接、上下文账本引用、回收站记录 | 要求与认可在平台表（`acceptance_*`），推送不带认可票 | L |
| Coding | 项目一份，主库 + KV | 主库 | 不变（约 42） | 5 张表 `project_id`（`store.ts:47-323`） | 不声明（会话推送没意义） | 必需 `goals:read/write` 改为可选发现；个人空间以 `outputs/personal` 为工作目录 | M |
| Git | 项目一份，只有 KV | — | 不变（10） | 无 | 不声明 | 个人空间输出目录不是仓库时如实显示不可用 | S |
| Diff | 项目一份，无存储 | — | 不变（2） | 无 | 不声明 | — | S |
| Text Stats | 项目一份，无存储 | — | 不变（2） | 无 | 不声明 | — | S |
| Feed | 双实例：项目主库 13 张表 + Home 库 `feed-content` | 主库 | Home 半 3 个动作删除，改平台证据服务 | 13 张表 `project_id`；`companions:["inbox"]` 改 Manifest 依赖声明 | 来源、外发规则 · `credential_ref`、`connection_ref`（per_record 绑定，绝不带）、`signal_id`、判断规则引用 | 证据正文引用账本收归平台（第 5 节）；必需 `goals:*`、`inbox:*` 改可选 | L |
| Inbox | 项目一份，主库 1 张表 + 平台 Attention | 主库 | 不变（约 15） | `inbox_scene_bindings.project_id` | 不声明（条目归 Attention） | 作为 Feed 的依赖在同一分区 | S |
| Risk | 项目一份，主库 | 主库 | 不变（16） | `risk_items.project_id` | 风险 · `risk_links` 指向的分区内对象、Schedule 里的复查任务 | — | M |
| Schedule | 项目一份，主库（`scheduler.join`、`notifications.deliver`） | 主库 | 不变（约 22） | 4 张表 `project_id` | 不声明（任务绑安装与调度作业，属执行态） | 唯一 `default_enabled`：个人空间与新项目初值都开 | M |
| Shelf | 常开 + 双实例；Home 文件目录 `shelf/catalog.json` | Home（白名单） | Home 约 28、项目半 6 个保留（U9） | 去掉 `personal: true`；`projects:exist` 用法改分区 | 不声明（它自己就是跨分区中转，「存入项目知识」走目标分区的动作） | 平民化 D1 的其余私路改声明 | M |
| Work Brief | 双实例，Home 共用库，`scope` 枚举 `home\|topic\|personal` | 独立库 | Home 半 `personal.get/refresh` 删除，个人空间里的简报改读总览索引 | `briefs.project_id`、`scope` 枚举、`brief_requests`/`brief_editor_versions` 的 `project_id`、`project_rows` | 简报 · `brief_versions.brief_id`、固定版本的 `artifact_id` | 每个分区的「首页简报」各一份；个人简报 = 个人空间的简报 + 总览索引 | M |
| Workflows | 项目一份，Home 共用库，`personal:true` | 独立库 | 不变（16） | 4 张表 `project_id`；`project_rows` | 流程定义 · `chain_json` 里的站点能力引用（目标分区没装的插件标为不可用） | — | M |
| Pages | 项目一份，Home 共用库，`personal:true` | 独立库 | 不变（约 44） | 4 张表 `project_id`；`project_rows` 与 `artifact_join`；同步键里的 `project_id` | 文档 · `folder_id`、`goal_id`、`artifact_id/version` | 必需 `goals:read` 改可选发现（只给 Goal 选择器用，`browser/menus.ts:105`） | M |
| PPT | 同上 | 独立库 | 不变（约 23） | 2 张表 `project_id`；`artifact_join` | 演示稿 · `artifact_id/version` | 必需 `actions:delegate`（读 Pages 大纲）保留，目标分区没有 Pages 时如实说 | S-M |
| Form | 同上 | 独立库 | 不变（约 23） | 2 张表 `project_id` | 问卷（不带答卷）· `artifact_id/version`；`share_id` 与 `status` 重置为草稿 | 公开填写链接绝不随推送 | S-M |
| Dataset | 同上 | 独立库 | 不变（约 23） | 3 张表 `project_id`（含 `dataset_source_bindings` 主键） | 数据表 · `artifact_id/version`（含 `snapshot_json` 里的）、来源绑定 | — | S-M |
| 灵光 | 同上 | 独立库 | 不变（约 16） | 3 张表 `project_id`（`conversations` 的 `UNIQUE(project_id, spark_key)`） | 灵感 · `conversations.spark_ids_json` | 跨多条灵感的对话不随推送（与今天 `relocate` 的拒绝一致） | S-M |
| Todo | Home 一份，`placement` 三态 + 可空 `project_id`，跨项目读 | 独立库 | 30 个动作从 Home 改分区；20 个 `project_reach` 动作删除，「所有项目」改读总览索引 | `placement` 枚举、`project_id`、`todo_deleted_projects` 墓碑表、`todo.placement.move` 的 Home 处理器 | 待办 · `links_json`（goal、material、work 等分区内引用）、`sources_json`、`batch_id` | 最大的一项：它自己建模了个人与项目之分 | L |
| Jelly | Home 一份，一行工作区 JSON | 独立库 | 约 52 个从 Home 改分区 | 无 `project_id`；模型选择从 `{home}/jelly/preferences.json` 搬到 `personSettings` | 笔记、日程项 · `category_id`、`relations`、`task_links`、`applied_plan_ids` | 个人空间默认启用；项目里启用就是项目自己的日历与笔记 | M-L |
| Cognia | Home 一份 | 独立库 | 约 25 个从 Home 改分区 | 无 `project_id`；目录授权 `grant:<id>` 搬到 `personSettings` | 来源与资料、知识域 · `source_id`、`domain_id`、`locator = grant:*`（本机授权，必剥） | — | M |
| Images | Home 一份，`jobs.project_id` + 全局 `connections` + `images/assets/` | 独立库 + 分区插件文件 | Home 4 个连接动作改用 `personSettings`；其余已是项目作用域 | `jobs.project_id`；`connections` 表搬走；`project_rows.files` | 生成任务与图片 · `connection_id`、`runner_id` | 声明 `owner_files`、`image_generation` 在分区实例上放开（C8） | M-L |
| Issues | Home 一份，按 `submitter_id` | 独立库 | 11 个从 Home 改分区 | 无 | 不声明（个人问题记录） | 全局快捷键 `Mod+Shift+I` 打开个人空间里的 Issues；个人空间默认启用 | S |
| Alchemist | 宿主手写，`studio.sqlite`（`better-sqlite3`） | 见 U10 | — | `personal: true`；宿主接线（平民化 P4） | 见 U10 | 选「删接线」则本矩阵这一行只剩数据原地保留 | — |
| 创作台 | #2239 起是平台框内页面 | 平台 | — | 去掉 `personal: true`（#2239 已移出目录）；草稿按 `agent-studio:<projectId>` 存，换成分区 id 即可 | 不声明 | 切换器顶部入口 | S |
| 第三方签名沙箱包 | `runtime.scope: home` 用 `sdk.homeDatabase`；项目包用 `sdk.projectDatabase`；双实例只给固定公钥 | 主库（`sdk.projectDatabase`）或独立库（新开放 `sdk.database`） | Home 作用域只留系统用途，普通包一律分区 | `sbxdb-*` Home 库、`assertScopeKept`、`dual_instance`（只白名单 Shelf） | 可声明，同一套 `molis.push.*` 动作类型 | `SANDBOX_SERVICE_FATE` 里拒绝的服务不在本需求放开 | M |

## 9. 清零清单

### 9.1 删除的标识与结构

- 登记：全部 `personal: true`、`PERSONAL_PLUGIN_IDS`、`PROJECT_SCOPED_PLUGIN_IDS`（`plugin-registry.ts:89-96`）、`ProjectPluginRegistry.isPersonal`（`packages/contracts/src/modules/projects.ts:73`）、`ProjectPluginMembership.hidden`（`:94-96`）、`catalog.db` 的 `project_plugin_exclusions`（`modules/projects/src/repository.ts:104-109`）、`companions`（改 Manifest 依赖声明）、登记层 `runtime.dual_instance`。
- 外壳：`isPersonalPlugin`（`apps/workbench/src/plugin-directory.ts:91-93`）、`ClientDirectoryEntry.personal`、`PluginMarketCard.personal`（`plugin-catalog.ts:17-25,349`）、`data-market-personal`、「个人 · 所有项目共用」分组与文案、`immersive-shell.ts:288-289` 没人读的隐藏 Goals 顶栏节点。
- Manifest：普通插件的 `runtime.scope: "home"` 与 `dual_instance`（Shelf 除外）；`databases.home.project_rows`；`databases.home` 对普通插件改 `databases.partition`。
- 宿主：`outsideBuild`、`projectReachablePlugins`、`reachEntry` 的 `personal` 合成、`plugin-scope-entries.ts`、`assertScopeKept`、`home-package-admission.ts` 的 Home 包规则、`plugin-declared-services.ts` 的分区实例限制、项目库里的安装记录表、Feed 与 Work Brief 的 Home 半。
- 插件：各业务表的 `project_id` 列（U3）、Todo 的 `placement` 枚举与墓碑表、Work Brief 的 `scope` 枚举；Pages 等的必需 `goals:read` 改可选发现。
- 放置：`HOME` 标记、`moveHome`、`belongs_to`/`belonged_to`、`project_id === null` 的各分支（`horizontal/placement/src/index.ts:47-81,198-348,355-466`）、`placement-actions.ts:71` 的 `homeClient()`、外壳 `placement.ts:54,320-321`、合同 `nullable(projectRef)`（`packages/contracts/src/services/placement.ts:100-104`）。
- 同步：10 种 `scope` 收成按分区的 4 种（分区主库集合、分区独立库、分区文件、分区固定版本）+ Home 的 2 种（`home-document` 给 Shelf、`home-store` 给系统）；删 `personal-plugin-sync.ts:44` 接收时的 `addProjectPlugin`；个人空间的启用清单进同步（今天 `project-catalog-replication.ts:25` 排除了它）。
- 门禁与测试：`scripts/gates/dual-instance.mjs` 改为「只有白名单 Shelf」；`tests/` 里写死个人插件清单的 11 个文件（`plugin-directory-marks`、`plugin-directory`、`images-plugin`、`pages-plugin`、`todo-plugin`、`lingguang-plugin`、`workflows-plugin`、`creative-tools-plugins`、`declared-stages`、`shell-declared-placement-rows`、`view-placement-declarations`）；`skills/molis-plugin-dev/host.md:115`、`authoring.md:107`。

### 9.2 `project_id: null` 逐处归类

约 660 处，分三类改：① **Home 系统作用域**（包安装、账号、系统动作、Shelf）保留 `null`，字段名不变；② **Home 级业务位置**（Todo、Jelly、Cognia、Images、Issues 的数据、放置的 `HOME`、搜索的 `null = 个人`、Characters 角色 `roles.ts:29`、Feed `held_in`、助理 `assistant-service-shared.ts:134`）一律改 `"personal"`；③ **平台记录里的可空项目**（记忆、观测、评测、外部会话归属等 `project_id: string | null`）按含义改：「不属于任何分区」保留 `null`，「属于个人空间」改 `"personal"`。片 1 先出一张逐文件归类表进 PR，评审按表核。`listProjects()` 的 18 处调用同样逐处归到 `listProjects` 或 `listPartitions`。

### 9.3 防回流门禁

新增一组 `pnpm health:check`（只许变小）：登记、合同、库结构里不得再出现个人插件分类、`hidden` 排除表、白名单外的 `dual_instance`、普通插件的 `runtime.scope: "home"`、业务表的 `project_id` 列（分区主库里）、`project_rows`；改门禁本身按 AGENTS 先问用户——本需求一并请批。

## 10. 开工前检查（15 项）

| # | 回答 |
| --- | --- |
| 1 事实主人 | 安装记录与签名归 Plugin Runtime（Home 层一张表）；分区启用关系归 `modules/projects`（`partition_plugins`）；推送账本与上游标记归 `horizontal/placement`；证据正文引用归平台证据服务（`packages/storage` + 平台动作，取代 Feed 的 Home 半）；总览索引归 `horizontal/search`（可重建缓存，不是第二份事实）；本人级设置归新的平台服务（放 `horizontal/` 下）；业务对象仍归各插件 |
| 2 插件同等待遇 | 本需求的目的：一种插件、一种装配；不新增构建期接线；第三方沙箱包得到独立分区库与推送声明 |
| 3 能力注册 | 推送的 export/put 是插件动作，经动作目录发现，页面、助理、MCP 同一份；推送本身是平台动作 `placement.push.*`，只给本人与本人按目标项目授权过的助理（S-143）；等外部的动作照旧 `scheduling: "concurrent"` + `beforeEffect()` |
| 4 合同 | 大改：`plugin-registration`、`plugin-manifest`（`runtime`、`databases`、`push`、`overview_projection`、类别）、`plugin-database`、`plugin-sync-registration`、`placement`、`search`、`actions`（分区上下文）、`modules/projects`、SDK 沙箱清单；M1 之前不留兼容；合同先行，片 1 单独成 PR，一次改完消费者 |
| 5 放在哪个包 | 推送进 `horizontal/placement`；本人级设置、证据引用平台动作进 `horizontal/` 新包或既有服务；不进宿主 |
| 6 表与存储 | 新表：`partition_plugins`（catalog.db）、`push_lineage`/`push_operations`（个人空间主库）、`push_upstream`/`push_superseded`（分区主库）、证据引用账本、总览索引、本人级设置；删表：`project_plugin_exclusions`、项目库安装记录表、`feed_content_holds`、Todo 墓碑表；登记 `tooling/gates/table-owners.json`；库结构按 v1 拍平，`same-version-exceptions.json` 逐条经用户批准 |
| 7 兼容与迁移 | 生产代码不加兼容读取与迁移逻辑；真实 Home 不迁移、清理干净重建（U13）；`docs/system/CONTRACT-CHANGES.md` 记「存储版本变更登记」 |
| 8 安全边界 | 碰：保留分区（S-141 新）、分区隔离与跨分区读取（S-142 新，扩 S-74）、推送授权（S-143 新）、MCP 个人空间绑定（S-144 新，扩 S-08）、本人凭据不外溢（S-145 新，扩 S-71/S-70/S-95）、同步接收不启用（S-146 新）；改写或退役：S-31、S-48、S-49、S-72、S-80、S-91、S-98；每条配拒绝测试 |
| 9 调用次数 | 总览只读索引（开库次数常数）；推送一次 = 读源 1 次 + 写目标 1 次 + 账本 2 次；进入分区只开该分区的库；`call-budget` 加个人空间总览与推送两个场景 |
| 10 升级与数据 | v1 拍平，金样 `0.1.0` 重生；每个插件的金样写入改按分区（`tests/golden-writes/*.ts`）；回放证明个人空间与项目的数据、引用、设置都在 |
| 11 成果与过程项 | 推送不是成果：推送的是活对象副本；定版仍进成果库；个人空间有自己的成果库 |
| 12 页面、外壳与文字 | 切换器、插件市场分组、推送确认、冲突、撤回、标注都先定样；新文字归 placement、projects 与各插件；不拿译文做判断 |
| 13 错误 | `push.*`、`partition.*` 用 `defineErrorCodes`，前缀登记 `tooling/gates/error-owners.json` |
| 14 冲突面 | 枢纽文件：`plugin-registry.ts`、`project-plugins.ts`、`home-plugins.ts`、`installed-plugin-host.ts`、`web-request.ts`、`horizontal/placement/src/index.ts`、`personal-plugin-sync.ts`、`plugin-registration.ts`、`plugin-manifest.ts`；在途 #2239（第 47 批）先合；与[平民化](../plugin-specials-demotion/spec.md)片 4（Shelf）、片 7（受信标记，由本需求取代）合并排期；第 48 批（新插件创建）生成的插件形态跟本需求走；SRV-2/SRV-5（个人同步）、SRV-6（团队）按本需求的分区口径 |
| 15 全局最优 | 插件：一种写法，第三方同路；平台：两套宿主合一，放置与同步去掉 null 分支；助理：分区上下文明确，跨分区只读本人总览；各类平台能力：资料、成果库、搜索、同步、MCP 都按分区，推送复用放置的幂等与版本思路；后续开发：再加一个插件不用想「个人还是项目」。比较过：保持三种跑法只清标记（省事但双轨永存）；全部塞进分区主库（毁掉独立库插件的同步触发器与 authorizer，原文已否）。代价：插件迁移一次性工作量大（3 个 L、约 10 个 M），由片 4 分波次摊 |

### 10.1 平台能力检查

1. 别的插件也要做：是，全部 24 个。2. 现成的：`partition: "project"` 独立库机制、`placement.copy` 幂等、`attach` 的版本、个人空间分区、`readable_project_ids`、搜索索引——都复用。3. 是插件之间协作的问题：推送与总览都做成平台统一方案。4. 第三方同样能做：是（独立库开放、推送声明）。5. 助理与 Agent 能发现：export/put 与总览经动作目录；推送执行只给本人。结论：**现在收进平台**。

## 11. 安全不变量（编号暂定，合入时由统筹核连续；现最大 S-140）

| 编号 | 内容 | 拒绝测试 |
| --- | --- | --- |
| S-141 | `personal` 是保留分区：建项目、导入、同步接收、整项目复制、团队共享不能产生或占用；不能改名、回收、删除、共享 | 每条入口用 `personal` 调用被拒 |
| S-142 | 插件实例只拿到它所在分区的主库、独立库与文件；跨分区读取只经总览索引，只给本机本人的调用（取代 S-49、扩 S-74） | 分区 A 的实例读 B 的库被拒；Agent／MCP 读总览被拒 |
| S-143 | 推送只由本机本人或本人按目标项目授权过的助理发起（授权可撤）；项目 Agent、外部 MCP、工作流一律拒；覆盖已被改过的副本与撤回删除只认本人逐次确认；`beforeEffect()` 复核；目标版本不符拒；快照带执行态、绑定或密钥引用被拒 | 未授权的助理推被拒、撤销授权后被拒；项目 Agent／MCP 推被拒；助理覆盖已改副本被拒；撤权后零写入；带 `credential_ref` 的快照被拒 |
| S-144 | 个人空间不作为任何外部客户端的默认分区；外部 MCP 碰个人空间需单独确认绑定 | 未单独绑定的客户端调个人空间被拒 |
| S-145 | 本人级配置与凭据（`personSettings`、连接器凭据、本人默认连接槽）不给其他成员、未获准 Agent、跨分区客户端；`per_record` 绑定按分区 | 项目 Agent 读本人设置被拒；分区 B 找不到分区 A 的记录绑定 |
| S-146 | 同步接收不启用插件、不建分区启用关系；未启用插件的数据挂起等本人启用 | 接收含未启用插件数据的变更后启用关系不变 |

改写：S-31（Home 插件路由 → 分区路由）、S-48（双实例只剩 Shelf）、S-72（隐藏个人插件 → 删除，改「未启用的插件在该分区被拒」）、S-80、S-91（沙箱 Home 库 → 分区库）、S-98（证据回收归平台）。

## 12. 分片 PR 计划（按依赖拓扑）

按 U12 推荐拆成三批，每批一个 PR、批内子分支（决定 31）；每批开独立工作树、从最新 `origin/main` 起。

| 批 | 片 | 内容 | 依赖 |
| --- | --- | --- | --- |
| **A 底座与合同** | A1 | 合同片：分区词表、Manifest（去 `runtime.scope`、`databases.partition`、`push`、`overview_projection`、类别、依赖声明）、动作分区上下文、同步范围收敛、`placement` 与 `search` 去 `null` 含义；一次改完消费者，`api:update`、`actions:update` | #2239 合入 |
| | A2 | 个人空间底座：`partitionRoot`、`personal-space/` 目录（U1）、`listProjects`/`listPartitions` 拆分与 18 处归类、首次运行判断修正、Home 初始化建个人空间、保留 id 守卫（S-141） | A1 |
| | A3 | 宿主合并：一张安装表、`partition_plugins`、合一的装配、删 `outsideBuild` 链与个人分类、`personSettings`、本人默认连接槽、密钥与提示词作用域（S-145） | A2 |
| | A4 | 存储：`databases.partition` 扶正并开放给沙箱、`project_rows` 退役、`artifact_join` 同分区、证据引用账本归平台（S-98 改写） | A3 |
| **B 插件迁移** | B1 | 无库与工具：Git、Diff、Text Stats、Inbox、Issues、创作台的分区 id | A |
| | B2 | 主库插件：Goals、Coding、Risk、Schedule、Feed（删 Home 半）——删 `project_id` 列（U3） | A |
| | B3 | 独立库插件：Pages、PPT、Form、Dataset、灵光、Workflows、Cognia、Jelly、Images | A |
| | B4 | 特殊：Todo（去 `placement` 三态）、Work Brief（去 Home 半）、Shelf（白名单收口，与平民化片 4 合并） | A、B3 |
| | B5 | 总览索引与个人空间总览（Todo、简报、日历、运行总览），S-142、S-49 退役 | B4 |
| | B6 | 放置与同步去双轨：删 `HOME` 分支、同步 6 种范围、接收不启用（S-146）、个人空间启用清单同步 | B2、B3 |
| **C 推送与收尾** | C1 | 推送：账本、三步幂等、局部引用剥离、冲突与撤回（先定样）、搜索标注、S-143、S-144；所有有持久业务对象的插件一次做完推送声明（U8：第 8 节矩阵「推送声明」列里不是「不声明」的全部，含 Risk、Feed、Work Brief、Jelly、Cognia、Images；工作量约为只做 8 个时的两倍，C1 内再按插件分子分支） | B |
| | C2 | 界面：切换器个人空间置顶、首屏、插件市场按类别分组、移除提示（先定样） | B |
| | C3 | 文档（`PRODUCT.md`、`AGENTS.md`、`docs/SSOT-MATRIX.md`、`docs/system/GLOSSARY.md`、`docs/system/HOME-DATA.md`、`docs/system/SECURITY-INVARIANTS.md`、插件开发 Skill）、防回流门禁、`same-version-exceptions.json`、`0.1.0` 金样重生；`api:update`、`actions:update`、`schemas:update`、`health:check`、`boundary:check`、`page-assets:check` | C1、C2 |

全量回归交 CI `full-suite`；本机只跑改到的文件（`node scripts/affected-tests.mjs`、`--jobs 1`）。

## 13. 验收（编号 UPP-xx；证明的测试在名字或注释写编号）

| 编号 | 标准 |
| --- | --- |
| UPP-01 | 空 Home 首次启动落在个人空间；切换器顶部固定「个人空间」，其下项目与新建；`listProjects()` 不含个人空间，`listPartitions()` 含 |
| UPP-02 | 用 `personal` 建项目、导入、同步接收、整项目复制、共享、改名、回收、删除均被拒（S-141） |
| UPP-03 | 24 个内置插件（Alchemist 按 U10）都能在个人空间与任一项目里添加、移除；移除后数据保留，重新添加恢复；没有「隐藏」 |
| UPP-04 | 插件市场与切换器没有「个人 · 所有项目共用」，按类别分组 |
| UPP-05 | 插件业务代码里没有 `WHERE project_id = ?`（门禁量，Shelf 与平台表除外） |
| UPP-06 | 分区 A 的插件实例读不到分区 B 的库与文件（S-142） |
| UPP-07 | 个人空间总览在 20 个项目、其中 19 个休眠时，不启动任何休眠项目的监督器与沙箱进程；开库次数与项目数无关 |
| UPP-08 | 首次推送生成独立 `target_id`；中断在三步任一步后重试，结果只有一个副本、账本一致 |
| UPP-09 | 副本未被改动时再推直接覆盖；改动过时弹窗，选覆盖后被覆盖版可在项目里恢复，选另存则生成新条目 |
| UPP-10 | 局部引用（Pages 的个人文件夹、Goal 引用）被剥离，目标库没有外键失败 |
| UPP-11 | 删除原件不删副本，副本显示「上游已删除」；「仅断开」与「撤回并删除」行为不同，后者走目标项目权限与版本门禁 |
| UPP-12 | 推送快照不带执行态、连接绑定与密钥引用（S-143）；附件 SHA-256 不变，云端不重复计配额 |
| UPP-13 | 同一原件 v1 推项目 A、v3 推项目 B，两边各自正确 |
| UPP-14 | 绑在项目 X 的 MCP 客户端与项目 Agent 读不到个人空间；未单独绑定的客户端调个人空间被拒（S-144） |
| UPP-15 | 本人级设置与凭据不被项目 Agent、其他分区客户端读取（S-145） |
| UPP-16 | 接收同步不启用插件；个人空间的启用清单在两台设备一致（S-146） |
| UPP-17 | ⌘K「本项目与个人」的结果标明分区；副本与原件互相标注 |
| UPP-18 | 金样 `0.1.0` 回放：个人空间与项目的数据、引用、设置都在 |
| UPP-19 | 防回流门禁：重新引入个人分类、`hidden`、白名单外 `dual_instance` 均失败 |

## 14. 要用户拍板（一次列全）

| # | 事项 | 方案（推荐在前） |
| --- | --- | --- |
| U1 | 个人空间的存储位置 | A 按原文搬到 `<Home>/personal-space/`，全仓只经 `partitionRoot()`（推荐）；B 留在 `projects/personal/`，靠目录表排除（零搬家，但「项目目录下有个不是项目的东西」会继续诱发遍历 `projects/*` 的代码出错） |
| U2 | 独立库放哪 | A 分区根下 `<分区根>/libraries/<库名>.db`：删分区就是删一个目录，备份与恢复按分区（推荐）；B 沿用库名目录 `{home}/<库名>/partitions/<分区>/<库名>.db`（今天 `partition: "project"` 的路径） |
| U3 | 分区主库里业务表的 `project_id` 列 | A 删（单库里是冗余，按原文「不写 `WHERE project_id = ?`」）（推荐）；B 留列不再过滤（Goals 约 20 张表少改） |
| U4 | 跨分区总览 | A 平台总览索引（插件声明投影、写时更新、可重建，扩展 `horizontal/search`），休眠分区不唤醒（推荐）；B 沿用 S-49 的 `home_aggregate` 静息读（重启后要唤醒） |
| U5 | 推送账本放哪 | A 归 `horizontal/placement`，存在个人空间主库、随个人空间同步，目标库留上游标记（推荐）；B 放 Home 级 `placement.db`（不同步，换设备再推会出双胞胎） |
| U6 | 被覆盖的版本 | A 平台在目标分区保留每个副本最近 5 个被覆盖版，可恢复（推荐）；B 要求声明推送的插件自带版本历史；C 全部保留 |
| U7 | 谁能执行推送 | A 只有本机本人；助理可以提议，本人确认后执行（推荐）；B 助理获准后可直接推 |
| U8 | 首批声明推送的插件 | A Pages、PPT、Form、Dataset、灵光、Goals、Todo、Workflows（已有 relocate/duplicate 基础）（推荐）；B 所有有业务对象的插件一次做完 |
| U9 | Shelf 的项目半 | A 作为唯一白名单 `dual_instance` 保留（推荐）；B 去掉项目半，动作改 Home 作用域、带目标分区参数 |
| U10 | Alchemist | A 按平民化 D2：现在删宿主接线与入口，数据原地保留，第 82 批重做（推荐，D2 已定）；B 按原文：只摘 `personal: true`、保留可用到第 82 批 |
| U11 | 首次启动与引导 | A 直接进个人空间，引导（一问一答）作为个人空间里的第一张卡（推荐）；B 先走引导再进个人空间 |
| U12 | PR 粒度（决定 31 是一批一个 PR） | A 拆成三批 A／B／C，每批一个 PR、批内子分支（推荐）；B 整件事一批一个 PR；C 每片一个 PR |
| U13 | 本机真实 Home 的存量 | A 不迁移，按 2026-10-30 先例干净重建（旧目录搬开不删），开工前再弹窗确认时间（推荐）；B 写离线迁移方案给你批 |

另：[平民化](../plugin-specials-demotion/spec.md)的 D5～D8 一并请定；它的片 7（受信标记）由本需求取代。

### 14.1 拍板结果（用户 2026-11-22 弹窗）

| # | 结果 |
| --- | --- |
| U1 | A：搬到 `<Home>/personal-space/`，全仓只经 `partitionRoot()` |
| U2 | A：独立库放 `<分区根>/libraries/<库名>.db` |
| U3 | A：删分区主库业务表里的 `project_id` 列 |
| U4 | A：平台总览索引（扩展 `horizontal/search`），休眠分区不唤醒 |
| U5 | A：推送账本归 `horizontal/placement`，存个人空间主库并随个人空间同步 |
| U6 | **C：被覆盖的版本全部保留**，可逐版恢复；平台不自动淘汰，用户可手动删（7.2 已改） |
| U7 | **B：助理获准后可直接推**；追问后定为「按目标项目授权、可撤回、每次留记录并通知」；项目 Agent、外部 MCP 不能推；覆盖别人改过的副本与撤回删除仍要本人确认（6.2、S-143 已改） |
| U8 | **B：所有有业务对象的插件一次做完推送声明**（C1 已改） |
| U9 | A：Shelf 项目半作为唯一白名单 `dual_instance` 保留 |
| U10 | A：按平民化 D2，现在删 Alchemist 宿主接线与入口，数据原地保留，第 82 批重做 |
| U11 | A：空 Home 直接进个人空间，引导作为里面的第一张卡 |
| U12 | A：三批 A／B／C，每批一个 PR、批内子分支 |
| U13 | 用户另给：「旧的不管，可以清理，现在没有真实用户，清理干净，也不考虑迁移」。不写迁移脚本、不留兼容；真实 Home 在批 C 合入后清理重建（动手前告知时点） |

平民化 D5～D8 的结果记在[平民化需求书](../plugin-specials-demotion/spec.md)第 7 节；其中 D7 定为：平民化片 0（Characters 保留 id）现在单独做，平民化其余片作为 44B 在 #2239 合入后开工，本需求的 A→B→C 接在后面，REL-5 前全部合完。
