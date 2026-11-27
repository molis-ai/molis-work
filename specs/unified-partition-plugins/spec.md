# 统一工作分区：废除个人插件与项目插件之分、星型单向 Push、清零双轨（Unified Partition Plugins）

状态：设计已定，按[决定 66](../post-anticorruption-roadmap/reference/decisions.md#decision-66)与[合并实施总纲](../plugin-specials-demotion/implementation-plan.md)分批实施。本文描述目标合同；今天的插件与数据位置见[事实归属表](../../docs/SSOT-MATRIX.md)。11 月 24 日本人确认个人助理跨项目读取的边界，见[总览读取权限](#overview-readers)。初审时的代码基线与候选 PR 保留在修订记录。

需求维护：Claude / Antigravity；实现：待分配，获批后另开独立工作树分片推进。类型：底层与架构（主）、横向能力（放置、同步、搜索、MCP、Agent）、产品线（全部 **20 个平等内置插件**，注：`text-stats` 已于 `#2243` 删除，创作台于 `#2239` 归平台，Shelf 于 `44B` 归纯平台 `modules/shelf`，旧 Alchemist 于 `44B` 彻底删除）。来源：用户 2026-11-22 在[特殊逻辑平民化](../plugin-specials-demotion/spec.md) D4 弹窗里给出的需求原文及后续终审拍板。

## 白话说明

**这件事做什么。** 今天插件分两种：「个人插件」（每个项目都开着、只能隐藏，有的跑在 Home 一层、数据混在一个库里按 `project_id` 分）和「项目插件」（每个项目一份）。这件事把这种分法取消：插件包在 Home 装一次；每个**分区**——一个固定的「个人空间」加上你的各个项目——自己决定开哪些插件，各自一套库、一套文件。个人空间里的东西可以「推送」到项目里成为副本，以后再推就按版本更新那份副本；项目里改过的，覆盖前先问你。

**解决什么问题。** ① 同一个插件今天有三种跑法（Home 一份、每个项目一份、两半都有），宿主为此有两套几乎一样的装配代码，第三方插件只能用其中受限的一部分；② 「个人」这个词在代码里有五种意思，`project_id: null`（Home 级业务位置）和 `"personal"`（个人空间分区）并存，放置、同步、搜索各自分支；③ 个人插件拿不掉，只能隐藏；④ 想把个人空间里写好的东西交给项目，今天只能一次性复制，没有版本、没有更新、没有冲突保护。

**做完能看到什么。** 用户：左上角切换器顶上固定「个人空间」，下面是项目和新建；第一次打开直接进个人空间；任何插件都能在个人空间或任何项目里添加和移除（移除后数据保留）；个人空间里的文档、目标、表格等可以推给项目，再推就更新，项目里有人改过会先问你；插件市场不再有「个人 · 所有项目共用」这一组。开发者：一种插件、一种装配、一种存储写法（单库增删改查，不写 `WHERE project_id = ?`）；第三方插件拿到和内置一样的分区能力。

**为什么现在做。** 首个外部安装（[REL-5](../post-anticorruption-roadmap/reference/batches/rel-5.md) M1）之前改合同和库结构不留兼容期，按发布前干净 v1 基线拍平；之后每一项都要带读取兼容。第 47、48 批正在定第三方插件的交付形态（Home 级沙箱包、`dual_instance`），不先收，这些会写进对外合同。

**需要你做什么。** U1～U13、V1～V15 已拍板（第 14 节）。第 3 节写了现行代码和原文设想不一样的四处，按本文的处理推进。

## 1. 终态契约（在原文基础上补全）

### 1.1 术语（写进 GLOSSARY，取代今天的五种「个人」）

| 词 | 意思 | 代码名 | 不要混用 |
| --- | --- | --- | --- |
| **账号空间** | 登录账号隔离的整份 Home | `StorageSpace`、`<root>/spaces/<spaceId>/`（`packages/contracts/src/platform/storage.ts:5-12`、`packages/storage/src/space.ts`） | 不改；`kind: "personal"` 指账号，不指分区 |
| **分区** | 日常工作的上下文：个人空间或一个项目，二者同构 | `PartitionId = "personal" \| ProjectId`；合同里的字段仍叫 `project_id`（见 U3 的说明） | 不叫 space |
| **个人空间** | 保留分区 `personal` | `PERSONAL_SPACE_PROJECT_ID`（`packages/contracts/src/platform/placement.ts:18`） | 不是 Home 层 |
| **Home 软件层** | 装包、升级、发布者签名、本人级配置与凭据、系统与跨分区调度、纯平台全局部件（如 `system.shelf`） | `scope: "home"` 只留给系统与纯平台能力（普通插件为 0） | 不放插件业务数据 |
| **启用** | 一个分区开着某插件（成员关系） | `partition_plugins`（由今天的 `project_plugins` 改名） | 取代「隐藏」 |
| **推送（Push）** | 同一插件把个人空间的原件按版本投递成某项目里的副本 | `horizontal/placement` 的推送账本 | 与「定版进成果库」正交；与一次性复制、移动不同 |
| **本人级** | 跟人走、不跟分区走的东西：本人记忆与偏好、角色的个人层、模型与连接、`personSettings` | 记忆的 `MemoryScope "personal"`（`packages/contracts/src/services/memory.ts:32`）、Characters 角色的个人层（`modules/characters/src/roles.ts:29`）保留原义，**改名注释为「本人级」**，与个人空间分区区分 | 不是个人空间分区；搜索的 `SearchScope "personal"`（`search.ts:32`）改指个人空间分区 |

### 1.2 契约（编号供验收引用）

1. **C1 账号空间不动。** `StorageSpace` 与 `<root>/spaces/` 职责不变；新目录不得占用 `spaces/`。
2. **C2 个人空间是保留分区。** `"personal"` 是系统保留字：建项目、导入、同步接收、整项目复制、团队共享都不能产生或占用这个 id；它不进 `listProjects()`（用户项目列表），不能改名、进回收站、永久删除、对外共享，不计入卸载确认里的「N 个项目」；但它**启用了哪些插件**进个人云同步。
3. **C3 个人空间与项目同构。** 默认输出目录与可选输入目录、成果库与过程项、对象工作终端、要求与认可、可信决定、插件事件与端口连线、定时调度，个人空间与项目一样（今天大部分已有，见 3.1）。
4. **C4 插件平权。** 不再有个人插件、项目插件、Home 插件、双实例之分。内置与签名沙箱包同一模型：包与签名在 Home 软件层装一次；每个分区按需启用、移除（移除保留数据，重新启用恢复）。接收同步数据绝不隐式启用插件。
5. **C5 动作作用域。** 普通插件的业务动作一律是分区作用域（`scope: "project"`，调用上下文带可信分区 id）；`scope: "home"` 只留给系统、账号、包安装、跨分区调度与纯平台全局部件（普通插件 `scope: "home"` 与 `dual_instance` 归零）。
6. **C6 存储对插件无感。** 宿主按调用所在分区注入该分区的 `services.project_database`（分区主库 `molis-work.db`）、`services.database`（插件独立库）与 `services.ownerFiles`；插件代码只写单库增删改查。
7. **C7 两类引擎各留所长。** 用分区主库的插件保留同连接原子事务（`scheduler.join`、`artifacts.join`、`attention.join`、`notifications.deliver`）与 SQL 操作码校验；用独立 SQLite 的插件每个分区一个库实例，保留同步触发器与原生 authorizer。
8. **C8 配置与连接归本人。** 模型供应商、生图配置、本机工具探测、连接器凭据（`connectors.db` + `SecretStore`）留在 Home 层归本机本人；连接槽支持「本人默认」绑定，`per_record` 绑定仍按分区隔离；共享项目的其他成员、未获准的 Agent、跨分区的外部客户端绝不继承本人凭据。
9. **C9 推送是星型单向。** 持续更新的血缘只有「个人空间原件 → 项目副本」；项目之间不建覆盖血缘；项目里的条目可以一次性「另存为个人空间里的新原件」（新建，不建反向边）。
10. **C10 跨分区总览不唤醒。** 个人空间里的「所有项目」总览只读平台的总览索引或有界只读查询，不唤醒休眠项目的 `PluginSupervisor` 与沙箱进程。
11. **C11 干净 v1。** 生产代码不留旧结构兼容读取与开发期过渡升级段；开发前阶段（[决定 69](../post-anticorruption-roadmap/reference/decisions.md#decision-69)）所有持久化库与格式直接固定为 v1、原地修改基线，零 `upgrades`、零开发金样；旧开发 `~/.molis-work` 直接删掉干净重建（U13）。

### 1.3 纯平台部件定位（零插件形态特例）

以下部件在 `44B` 后均为**纯平台系统部件或内容包机制**，不再拥有插件特例身份；其余全部 **20 个内置插件**与第三方签名沙箱包一律按 C4 享受完全同等的分区插件契约：

| 部件 | 定位 | 依据 |
| --- | --- | --- |
| Shelf | **纯平台模块 `modules/shelf`（`system.shelf`，`kind:"system"`，`/api/platform/shelf`）**：右栏常驻全局中转架（经 `HostSurfaceRegistration`），Home 级 `home-document` 同步；**终审覆写 D1/U9：`always_on = 0`、`dual_instance = 0`** | [平民化 D1 终审](../plugin-specials-demotion/spec.md)、决定 66 |
| 插件创作工作台 | 切换器顶部的扩展入口；`#2239` 起是平台框内页面（`horizontal/plugin-studio`），不是插件 | 原文；`#2239` |
| Alchemist | **按 U10/D2+U13 终审**：`44B` 彻底删除旧包、宿主接线与磁盘豁免；第 82 批在创作台上按纯 UPP 场景插件从零重写 | 平民化 D2 + U13 |
| 系统技能与内容包 | `planning-methods` 在 `44B` 迁入纯平台 `packages/system-skills/`；其余普通内容包（`kind: "content"`，如技能包、场景包）声明式机制不变 | 原文；决定 66 |
| Characters、判断规则 | `modules/characters`（`system.characters`）、`modules/judgment-rules` 职责与存储归属不变；无项目标记按 9.2 归类到「本人级」或「个人空间」 | 原文；复查 |

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

<a id="3-原文设想与现行代码不一样的四处请确认"></a>

## 3. 原始设想与立项时的代码差异

| # | 原文 | 现行代码 | 本文的处理 |
| --- | --- | --- | --- |
| X1 | `personal` 存在 `<Home>/personal-space/` | 已经是 `catalog.db` 里的一行普通项目，库在 `<Home>/projects/personal/molis-work.db`，按需懒建（`personal-project-provisioner.ts:13-31`、`modules/projects/src/project-paths.ts:19`）；输出 `<Home>/outputs/personal/` 已是现状 | 按原文搬到 `<Home>/personal-space/`，全仓只经一个 `partitionRoot(id)` 解析，不散写分支；`home-stores.ts` 同步登记（否则备份、卸载清理、恢复会漏，`tests/personal-plugins-review-fixes.test.ts:107` 断言了清单）。**U1** 已选迁移分区根 |
| X2 | 个人空间不进 `listProjects()` | 今天 `listProjects()` 返回它，约 18 处调用方，有的过滤、有的不过滤（切换器 `web-routing.ts:55-56` 不过滤；`onboarding.ts:132-133` 用项目数判断首次运行，个人空间一建就让首次运行判断失效——这是现存缺陷） | 拆成两个函数：`listProjects()` 只给用户项目列表；`listPartitions()`（个人空间 + 项目）给平台遍历（同步、观测、搜索、调度、MCP、外部会话、备份、恢复、升级、卸载清理）。复查实数：`listProjects()` 54 处（38 个文件），另有 `host.projects()` 44 处，以及直接列 `projects/` 目录的 `artifact-row-storage-policy.ts:25-27`、`plugin-holders.ts:96`、`local-uninstall.ts:23`、`installer/uninstall.ts:82-90`；逐处归类（9.2 表），并加门禁：平台循环不得直接列目录或只用 `listProjects()` |
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
| 保护 | 改名、删除、回收已拒（`project-catalog.ts:446-452`、`project-deletion-service.ts:45,121`、`project-sync-admission.ts:9`） | 加：团队共享拒绝；卸载确认不计入；统一写成一条安全不变量（`S-personal-partition-reserved`）。个人空间仍是 `catalog.db` 里的一行（`partition_plugins` 外键要它），目录表照 W5-17 只存 id 不存路径（`project-paths.ts:7-16`），路径只由 `partitionRoot()` 算 |
| 一个算路径的地方 | 项目主库与库名目录的路径散写在快照策略（`home-store-snapshot.ts:51-62`、`home-snapshot-inventory.ts:108` 遇未登记的 SQLite 直接拒绝快照）、恢复（`home-restore-projects.ts:39-55` 要求每行目录都有 `projects/<id>/molis-work.db`）、升级枚举（`platform-upgrade-stores.ts:49,57-59`）、已装库升级（`installed-database-upgrade.ts:57`）、成果行连接（`plugin-artifact-row-library.ts:42-46`）、卸载清理 | 全部改成只经 `partitionRoot()` 与分区库登记求路径；加「个人空间 + 独立库」的快照与恢复往返测试 |
| 到期的工作 | 今天 Home 插件常驻，Todo 提醒（`todo.reminders`，`plugins/native/todo/src/plugin.ts:57`）、Jelly 日程、Images 后台队列都由常驻实例跑；调度器只在项目主库里有到期项时唤醒项目（`web-project-schedulers.ts:39-66`） | 平台在 Home 层保留一张**到期登记**：分区实例把「某时刻要做的事」登记给平台调度器（`horizontal/scheduler`），到点只唤醒那个分区的那个插件实例，不起整套监督器；登记随禁用、卸载、删分区清除 |
| 同构项 | 成果库、过程项、终端、认可、事件、调度、目录都已按项目（`project-host.ts:255,317`、`project-catalog.ts:259`、`project-plugins.ts:174,192`）；已实核 `system-materials-actions.ts` 已按分区，但 `material-original-files.ts:19-48` 与 `material-attachments.ts:24-49` 仍用 `project_id = ""` | 将 `material-original-files.ts` 与 `material-attachments.ts` 改为全分区存储（含 `personal`），清零 `project_id = ""`；**个人空间保留右栏「讨论 / IM」作成员只有本人的群聊（与项目讨论同一套 IM，V12）（R21）；自写 Skill 保持双层——个人全局技能（Home 层，个人空间直接读写不建第二套）+ 项目专属分区技能（R22）** |
| 平台导航 | 成果库要项目上下文（`artifact-library-http.ts`）；外部会话两级都有（`web-catalog-routes.ts:105`、`web-project-platform-routes.ts:278`） | 个人空间下「成果」读写个人空间成果库；「外部会话」只列未归入任何项目或个人空间的会话 |
| 首屏 | 空 Home 走 `/onboarding`，选「空白开始」再进 `/projects/personal/` | 空 Home 直接进个人空间，引导是第一张卡（U11） |
| 初始启用哪些插件 | 个人插件处处开着；新项目只有 Schedule（`default_enabled`，`plugin-registry.ts:224`） | **按用户选的场景初始化**（V6）：引导与新建项目时挑场景包或说出目的、助理推荐一到三套，采用时启用场景声明的插件（[onboarding-coverage](../onboarding-coverage/spec.md) §3.8、§3.8.1，ONB-50～56；采用路径见 [scene-and-page-contract](../scene-and-page-contract/spec.md) 第 7 节）。平台不写默认名单；空白开始只有声明了 `default_enabled` 的插件（今天只有 Schedule；Shelf 已是纯平台 `system.shelf` 不计入插件列表）。助理可以帮你配置：它提出「给这个分区加/去掉这些插件」，以采用预览的形式给你确认后执行。启用与移除统一走平台动作 `partitions.plugins.set@1`（即 scene-and-page-contract P-3a 计划的 `projects.plugins.set@1`，扩到个人空间，归 `modules/projects`，带成员 revision）；场景包种类与各场景开哪些插件归 onboarding-coverage 与第 52 批，不在本需求里定 |
| 切换器 | 个人空间是普通一行（`settings-navigation.ts:62-90`） | 顶部固定「个人空间」，下面项目列表与「新建项目」；需定样 |

<a id="home-pages-owner"></a>

**首页数据的归属。** 按[第 37 批决定](../scene-and-page-contract/spec.md)，已采用的首页、版本、文件和本人批准回执继续由 `horizontal/home` 存在 Home 的 `home-pages/home-pages.db`，各键保留分区身份。个人空间以保留值 `personal` 占一份选择，和项目 A 各自保存、重启读回。首次引导按 U11 展示，不能覆盖此前已选的首页。项目的回收、恢复、永久清除沿现行项目生命周期处理，只作用于该项目；其他分区的页面与批准回执不能被读取、复用或清除。[平台磁盘清单](../../docs/system/HOME-DATA.md)继续登记这一座库。

### 4.2 宿主合并

1. **一张安装表。** 内置与签名包的安装记录、升级、发布者固定、同意都在 Home 软件层（今天的 `plugin-runtime` Home 库）；项目库里的安装记录表删除。
2. **一套装配。** 合并 `HomePluginHost` 与项目平台、`HomeInstalledPlugins` 与 `installed-plugin-host`：按（插件, 分区）启动实例，每个实例的 `services.database`、`services.project_database`、`services.ownerFiles` 绑定它自己分区的文件；**不沿用**今天 `databases.home.partition: "project"` 那种「一个 Home 实例按调用切库」的复用器（它拒绝路由、启停、事件与定时器，`plugin-database-partitions.ts:61-80`，Todo 的提醒路由会坏），复用器整个退役。休眠分区的实例不常驻：分区打开、有到期登记、收到推送或同步写入时才起，闲置按平台策略停（沙箱子进程同样），进程数与打开的分区数成正比而不是与项目总数成正比。**随着 Shelf 在 `44B` 收归纯平台 `modules/shelf`（`system.shelf`），普通插件不再有任何 `HomePluginHost` 或 `dual_instance` 路径**。
3. **删掉的链路：** `outsideBuild()` → `projectReachablePlugins` → `reachEntry({personal:true})`；`plugin-scope-entries.ts` 的两半配对；`assertScopeKept` 三态；`home-package-admission.ts` 的 Home 包限制；`plugin-declared-services.ts` 的「项目实例不得声明 `owner_files`、`model_configuration`、`image_generation`、`local_tools`」（C8）。`local_tools` 仍只给宿主信任（安全边界，按信任级别，不按插件名）。
4. **本人级服务（复用 `#2231` 个人配置同步通道）。** 有的插件需要「跟人走、不跟分区走」的设置：Images 的生图连接（今天在 `images.db` 的 `connections` 表）、Jelly 的模型选择（`{home}/jelly/preferences.json`）、Cognia 的目录授权。加平台服务 `services.personSettings`（归 `horizontal/person-settings`）：Home 层、按（安装, 键）存，只给本机本人的调用，不进项目同步、不给其他成员与 Agent；插件的业务数据仍在分区。每个键在 Manifest 声明 `portable`：只有可跨设备的偏好随本人同步，**直接复用 `#2231` 落地的 `personalConfigReplica` + `assertPortableConfig`**（不另造第二套个人配置同步机制），密钥、本机路径与授权一律留在本机（5.1）。
5. **连接槽。** 不新增「本人默认」范围：现有的按安装绑定 `plugin-installation:<install>`（`horizontal/connector-host/src/plugin-binding-scopes.ts:9`）本来就跨分区，就是「本人默认」。收紧谁能用它：只给本机本人、本人授权过的助理、本人建的工作流（用户 2026-11-26「可以，保持现状」）与插件自己的后台的调用；项目 Agent、外部 MCP、（以后）团队成员在共享项目里一律用不到，要用就在那个分区单独绑定。`per_record`（`…/project:<id>/record:<key>`）不变（S-71）。
6. **密钥与提示词作用域。** 今天按 `HOME_INSTALL_SCOPE` 或项目 id 分；合并后插件密钥按安装（Home 层），提示词按安装登记一次；牵动 S-80、S-84、S-87、S-91，同步改表与拒绝测试。

## 5. 存储

| 引擎 | 用的插件 | 改法 |
| --- | --- | --- |
| 分区主库 `molis-work.db` | Goals、Coding、Feed、Inbox、Risk、Schedule；第三方 `sdk.projectDatabase` | 个人空间的 `molis-work.db` 与项目同构建表；删业务表里冗余的 `project_id` 列与 `REFERENCES boards/project_root(project_id)`（U3）；同连接事务与操作码校验不变 |
| 分区独立库 | Pages、PPT、Form、Dataset、灵光、Todo、Jelly、Cognia、Images、Issues、Workflows、Work Brief；第三方（新开放） | 新声明 `databases.partition`：每个（插件, 分区）实例拿自己分区的库文件，位置 `<分区根>/libraries/<库名>.db`（U2）；今天的 `databases.home.partition: "project"` 复用器（`packages/contracts/src/platform/plugin-database.ts:210-228`、`apps/local-host/src/plugin-database-partitions.ts:61-100`，只有测试夹具在用）不沿用、删除（见 4.2 第 2 条）；删 `project_rows` 钩子（删分区就是删目录）；开放给签名沙箱包（取消 `installed-plugin-libraries.ts:189` 的拒绝）；需要与分区主库原子提交的操作由宿主在同分区连接内协调，旧的插件声明 `artifact_join` 随本波消费者退役，见[事务边界](#push-commit) |
| 插件文件 | Images（`images/assets/`）、沙箱 `owner_files` | 进分区根（Shelf 已是平台部件，自己的文件随 `modules/shelf` 留在 Home） |
| 证据正文池 | Feed（`{home}/security/evidence/blobs/`，按 SHA-256 内容寻址，引用记在 Feed 的 Home 库 `feed_content_holds`） | 正文池仍在 Home、跨分区共享；**引用账本从 Feed 的 Home 半搬进新的平台包 `horizontal/evidence`**（存储适配仍用 `packages/storage` 的 evidence-content；键 `(content_ref, partition_id, owner_install, holder_key)`），这样 Feed 不再需要 Home 半；只有持有 `evidence:collect` 的平台路径能回收无人引用的正文（S-98 改写） |
| 本人级设置 | 见 4.2 第 4 条 | `services.personSettings` |

### 5.1 同步：各类数据跟到哪里

三种数据流动互不替代：**同步**是同一个人的同一分区在自己几台设备间保持一致；**推送**是同一台设备上从个人空间往项目放副本（第 7 节）；**团队共享**是把项目给其他人（SRV-6，在演进，个人空间永不参与）。同步只在本人账号空间内进行（`StorageSpace`），附件按（账号空间, SHA-256）去重。

| 数据 | 存在哪 | 跟到本人的其他设备 |
| --- | --- | --- |
| 分区业务数据（主库集合、独立库） | 各分区 | 同步，按分区分开 |
| 分区插件文件、附件 | 分区根 | 同步，按 SHA-256 去重 |
| 固定版本（成果库） | 分区成果库 | 同步 |
| 分区启用了哪些插件 | `partition_plugins` | 同步，含个人空间，**到另一台设备自动照做**（V4）：启用清单是本人自己做的选择，按它自己的同步种类（「分区启用清单」，不是整项目的可移植记录）传，另一台设备收到后直接启用；没装的包提示安装，装好后生效。只有本人账号下的启用记录能触发启用，业务数据本身永远不能（S-sync-enablement-own-choice）。今天目录复制排除个人空间（`project-catalog-replication.ts:25`）、同步接纳拒绝 `personal`（`project-sync-admission.ts:9`），直接去掉排除会让 `personal-catalog-sync.ts:23` 的 `ensureSyncedProject('personal')` 每次失败——启用清单因此单独成种类，个人空间不走「接纳一个项目」的路 |
| 推送账本 | 个人空间主库 | 随个人空间同步 |
| 副本上游标记 | 目标分区主库 | 随目标分区同步 |
| 被覆盖的版本 | 目标分区主库（快照）＋分区附件（字节） | **全部留在发生覆盖的那台设备；只同步每个副本最近被覆盖的一版**（V3）。云端单条上限 512 KB、账号空间 100 MB（`server/migrations/sync/0001_sync.sql:29-31,62`），更早的版本不上云；另一台设备的副本历史里标「更早的版本在 某某电脑 上」 |
| Shelf | Home（`home-document`） | 同步 |
| 本人偏好（`personSettings` 里声明 `portable: true` 的键：如 Jelly 的模型选择、Images 默认用哪种生图服务、外观类偏好） | Home 层，按（安装, 键） | 同步，走本人账号空间的 Home 流，只给本人设备，不进任何项目、不进团队共享 |
| 模型供应商与生图的**非密钥**配置（选了哪家、哪个模型） | Home 层 | 同步，同上 |
| 密钥与凭据（`SecretStore`、连接器令牌、API Key、`credential_ref` 指向的内容） | 本机 `secrets.json` + 系统钥匙串主密钥 | **不同步**。另一台设备上显示「这台电脑还没连接，点此连接」，由本人在那台设备重新授权 |
| 连接与本人默认连接槽 | `connectors.db` | 连接**名称与用途**同步（让另一台设备知道该连哪个、显示待连接），令牌不同步；`per_record` 绑定随所在分区同步，但其凭据同样要在那台设备重新授权 |
| 本机目录授权（Cognia 的 `grant:*`、项目输入目录）、本机工具探测、设备同步开关 | Home 层 | **不同步**：路径与授权只对这台机器有意义（`docs/system/HOME-DATA.md` 第 6 节「不得因同步上传授权」） |
| 总览索引、搜索索引 | Home 层缓存 | 不同步，各设备本地重建 |
| 已装插件包与签名 | `plugin-packages/` | 不同步包本身；分区启用清单同步后，另一台设备提示「需要安装 X」，由本人确认安装，不自动装 |

同步的技术口径（复查补）：
- **种类清单。** 收敛后的范围不能丢现有的 `project-sections`、`project-private-values`（创作台草稿在用，`plugins/native/plugin-builder/src/registration.ts:12`）：二者并入按分区的范围；`home-with-projects` 在接收时也会自动建项目（`personal-plugin-sync.ts:33-39`），与 `projects` 范围一起删。平台自己的集合（成果、审批、指导、认可、Attention、Characters、外观、呈现、提示词覆盖、Blueprints、判断规则，`platform-sync-catalog.ts`）逐个标明按分区或本人级。新表各有同步身份：推送账本（随个人空间）、`push_upstream` 与最近一版 `push_superseded`（随目标分区）、分区启用清单（单独种类）、`personSettings` 的 `portable` 键（本人级 Home 流）。
- **线格式。** 今天同步键是 `[projectId|null, key]`（`runtime-sync-registration.ts`、`runtime-sync-scope.ts`），业务 `null` 改 `"personal"`、删 `project_id` 列后，开发前阶段按[决定 69](../post-anticorruption-roadmap/reference/decisions.md#decision-69)各同步集合与可移植格式统一保持版本 `1` 就地拍平，旧格式不读。
- **发现。** 同步发现今天会唤醒每个项目（`runtime-sync-discovery.ts:63-74`）；改为平台按分区直接读各分区库的同步出站表，不起监督器。
- **云端开发测试数据。** 账号空间 id 由账号确定性派生（`packages/storage/src/space.ts:34`），开发阶段重建本机 Home 若连向带旧开发事件的测试同步空间，一并清空测试同步空间即可（V5；操作线上账号前先向用户确认）。

规则：
1. 默认不同步。`personSettings` 的键不写 `portable: true` 就只在本机；SDK 拒绝把声明为密钥、连接引用或本机路径类型的键标为 `portable`。
2. 收到的业务数据不替本人开插件、不装包、不建连接、不建项目；只有本人账号下的「分区启用清单」记录能让另一台设备启用插件（V4，`S-sync-enablement-own-choice`）；未启用插件的数据挂起，启用后才出现。
3. 跨设备同步的本人偏好与连接名称只进本人账号空间，团队共享项目（以后）只同步项目分区，不带任何本人级数据（`S-person-settings-private`）。

## 6. 跨分区：总览、AI、MCP、搜索、界面

### 6.1 总览索引（补原文：今天的做法会唤醒项目）

今天：Todo「所有项目」读它自己的 Home 库（拆库后不再成立）；Work Brief 个人简报读共用 Home 库；运行总览走 `home_aggregate`，休眠项目要么回内存里的旧读数、要么在后台逐个唤醒（S-49，`apps/local-host/src/home-aggregate.ts:46-60`）。

方案（U4，11-23 按 V11 改）：**插件维护一张平台定格式的「总览表」**。平台按种类定好表结构——待办（标题、状态、截止、提醒时间、优先级、标签）、日程（开始、结束、全天、时区；重复日程由插件展开未来一段时间，如 90 天，到期前滚动续展）、通知（标题、级别、来源、时间）、简报（标题、摘要、更新时间）——插件在自己的分区库里建这张表，并在写业务数据的**同一事务**里顺手更新（SDK 给 `overviewRows.upsert/remove` 帮手与格式校验）。Manifest 只声明 `overview_projection: { kinds: ["task", "event"] }` 与显示名，不写列名映射、不写 SQL。平台用只读连接（`SQLITE_OPEN_READONLY`）读这张表——不运行插件代码；同步写进休眠分区或恢复时，平台把该分区标 `dirty = 1`，总览前台至多只读打开一个源库。多库脏时宿主后台逐库重建，界面显示「正在更新…」，期间只展示已经刷新且仍获授权的摘要，各休眠项目零唤醒；投影行的分区与安装由平台从可信上下文盖章，插件不能自报；禁用、卸载、删分区时平台立即删掉对应行；每分区每种类有行数上限（如 500，日程按展开窗口计）。**到期提醒也从这张表取**：平台在打开或同步写入分区后按「提醒时间」列更新到期登记（4.1），所以另一台电脑同步来的提醒不会漏响；已合入第 `95-3` 批（`#2151`）「错过执行自 `due_at` 起 7 天自动过期」的语义归到期登记，不归总览索引。平台存在 Home 级、可重建的总览索引里（与搜索索引同类：只是缓存，不是第二份事实，扩展 `horizontal/search` 的存储与查询，不另起库）。个人空间里的 Todo、简报、日历、运行总览与通知（`R13`）只读这个索引；点进某一行才打开那个分区。读取遵循下方的本人及个人助理授权规则。`call-budget` 加「个人空间总览」场景（**门禁 G4**），量开库次数为常数、与项目数无关。**写法要进插件开发文档**：`skills/molis-plugin-dev`（新增「总览表与到期提醒」「推送声明」「分区存储」「依赖与随启用」四节）、Manifest 字段说明与 SDK 类型注释同批写好，创作台生成插件时照此生成，改动跑 `pnpm studio:replay`。

<a id="main-overview-table"></a>

**主库摘要表与运行总览（第 108 批，用户 2026-11-26 定，V17）。** 「定时运行」「后台任务」两张跨项目清单今天靠 `home-aggregate.ts` 逐项目问提供方，休眠项目回 `#2254` 的静息读数。108 批起两张清单也只读总览索引，`home-aggregate.ts`、静息读数与动作合同的 `home_aggregate` 标记一并删除：

1. **两个新种类。** 总览种类加 `background_task`（标题、环状态、是否等你、开始与更新时间、打开位置、结束后是否报给助理）与 `scheduled_run`（标题、到期时间、错过时间、所需条件 `network`/`model`、打开位置）。表里只存数据与平台词表里的值，不存译文；一步一句的说明、可停的命令与待答的决定不进摘要，点进那一行才在它的分区里读全。错过的运行满 7 天算过期、首页说过几条，由 Home 按 `due_at` 与自己记的「上次说到」算，不归插件。
2. **分区独立库的插件**照旧在自己的库里写 `molis_overview_rows`（6.1）。
3. **分区主库的插件**（Coding、Schedule、Feed 等，U3 不迁库）写平台在每个分区主库 `molis-work.db` 里建的 `plugin_overview_rows`：与 `molis_overview_rows` 同列，多一列写入方安装 `install_id`，由平台从插件实例的可信身份盖章，插件不能自报、只能改自己那份。插件经 `services.overview.join(tx, rows => …)` 在写业务数据的同一事务里写（与 `services.attention.join` 同一套连接与撤权复核），SDK 的 `overviewRows` 帮手与格式校验两处共用；Manifest 照旧只声明 `overview_projection.kinds`。
4. **平台只读读取。** 总览索引用只读连接读主库这张表（按安装分开盖章），与读分区主库的「等你 / 通知」（`attention_entries`，R13）同路，休眠分区零唤醒；写入提交后标脏、立即只读刷新；同步写入或恢复时整分区标脏。禁用、卸载、删分区时平台删掉对应行。
5. **主人的宿主服务**（个人助理的跟进、主线的错过运行等，不是插件）不经摘要表，Home 直接问它们，与今天一样。

<a id="overview-readers"></a>

**总览读取权限（2026-11-24 本人确认）。** 本机本人可查当前有权读取的项目。个人助理在当前分区仍受项目 AI 许可与调用方读取范围约束；跨项目总览须本人显式授予项目和允许的摘要字段，两者与当前可读范围取交集，不能读取原文、附件或未授字段。授权由平台按真实调用身份读取；项目 Agent、MCP、工作流及插件调用均不可代用。推送许可独立裁决。查询、缓存命中以及等待后的结果交付都复核当前授权；撤回项目或字段立即生效，先前结果不能再次送入展示或模型上下文。

### 6.2 AI 与 MCP

- 绑在某项目的外部 MCP 客户端、项目 Agent、以后的团队成员只能碰那个分区；个人空间对它们来说是另一个分区，今天的逐客户端逐项目授权（S-08，`config/mcp-tools.json`）已经能隔开。加一条：个人空间**永不作为默认分区**，外部 MCP 要碰个人空间必须在 MCP 管理页单独确认绑定（`S-mcp-personal-binding`）。
- `scope: "home"` 的 MCP 授权（`project_id: null`，`apps/local-host/src/mcp-action-grants.ts:39,85,108`）随普通插件动作改分区作用域而失效；干净 v1，不迁移授权，用户重新授权。
- **个人助理的位置。** 助理是 Home 级系统调用方（今天以 `project_id: null` 运行，`assistant-followups.ts:463`、`assistant-memory-bridge.ts:67`），不是某个分区里的插件：你在哪个分区，它就以那个分区为当前工作分区；跨项目仅取[本人显式授予的项目和摘要字段](#overview-readers)；本人记忆跟人走、分区记忆留在分区；`assistant-service-shared.ts:132-135` 把 `"personal"` 当作通配的写法删掉，改为明确规则。项目 Agent 只在它的项目分区里。
- 推送由本机本人发起，或由本人**按目标项目**授权过的助理直接执行（U7）：授权在设置里可随时撤回，每次推送留记录并通知本人；项目 Agent、外部 MCP、工作流不能推；覆盖已被别人改过的副本、撤回并删除副本、**推送时需要在目标分区新启用插件**，都要本人逐次确认（助理获准推送不等于获准改项目的插件配置）。

### 6.3 搜索

结果已带 `project_id`（`search.ts:46-47`）；删掉 `null = 个人` 的含义，改为明确的分区标注（个人空间 / 项目名）；推送出来的副本标「来自个人空间 · v3」，原件标「已推送到 2 个项目」。

### 6.4 界面（先定样，按 `skills/molis-design-ui/SKILL.md`）

切换器（个人空间置顶）、插件市场按功能分组（插件在 Manifest 声明平台固定词表里的类别，取代「个人 · 所有项目共用」）、推送确认（含连带启用插件）、覆盖冲突、撤回两种语义、副本与原件的标注、移除插件「数据会保留」。按[界面通用规则](../../DESIGN.md)与组件板已有控件出高保真可点原型，确认后再写产品代码。

## 7. 推送（Push）契约

### 7.1 插件声明（可选；纯工具插件不声明）

``ts
// Manifest
push: {
  kinds: [{
    kind: "page",                        // 插件自己的对象种类
    export_action: "pages.push.export",  // 动作类型 molis.push.export.v1
    put_action: "pages.push.put",        // 动作类型 molis.push.put.v1
    revision: "/revision",              // 必填：单调递增的版本号所在字段（见下）
    local_refs: [{ path: "/folder_id", on_push: "strip" },     // 分区局部引用：置空或落根目录
                 { path: "/goal_id", on_push: "strip" },
                 { path: "/dataset_ref", on_push: "remap" }],  // 引用的对象也推到了同一项目时改指副本，否则置空
    children: ["comments"],              // 随同的子记录（插件在 export 里给）
  }]
}
``

- **版本号。** 声明推送的种类必须给一个单调递增的版本号字段：Form、Dataset、PPT、灵光现有 `version` 列可直接用；Jelly 按单条笔记的修订号，不按整份工作区；Images 推的是图片与成品，不推生成任务（任务是执行态）；没有版本号的种类要先补。
- **子记录。** 子记录在目标里的 id 由 `target_id` 与子记录源 id 确定性派生；覆盖时源里已删的子记录在目标里也删（被删的随被覆盖版本留存）。
- `export`：输入 `{ source_id }`，输出快照 `{ kind, schema_version, source_id, source_rev, record, children[], files: [{ role, sha256, media_type, byte_length }] }`。附件只给摘要，字节经平台资料服务按 SHA-256 取。**沙箱大快照分片（补防 1 MiB IPC 上限）**：`packages/plugin-sandbox/src/runner.ts:27` 限制单帧 JSON IPC 为 1 MiB；当快照体超过 `256 KiB` 时，`export` 与 `put` 自动经平台受控 **Platform Blob Handle 分片传输**，不走单帧 JSON。
- `put`：输入 `{ target_id, op_id, base_target_rev | null, snapshot, mode: "create" | "overwrite" }`，输出 `{ target_id, target_rev }`；按 `(target_id, op_id)` 幂等；宿主先按当前权限核对已提交的同一请求并回原回执，新操作才比较 `base_target_rev`，不等时拒（`push.target_changed`）。
- **快照禁止携带执行态与授权**：运行中的会话、后台作业、终端进程、闹钟开关、账号与连接绑定、`credential_ref`、审批与认可票。SDK 按字段类型（密钥引用、连接引用）校验并拒，平台再查一遍。
- **插件自己存的文件**（11-23 补）：不在平台资料库里的文件（如 Images 生成的图在插件自己的 `owner_files`）也要能推：`export` 的 `files` 每项注明 `store: "materials" | "owner_files"`；`owner_files` 的字节由平台从源分区该插件的文件区按 SHA-256 读出、写进目标分区同一插件的文件区，再由 `put` 引用；持有与回收同下一条。
- **大快照句柄**（11-23 补）：Platform Blob Handle 是新平台能力，句柄只对一次推送操作（`op_id`）与一个安装有效、用完或超时（如 10 分钟）即失效、不能跨分区复用，登记安全不变量 `S-push-blob-handle` 并配拒绝测试。
- **附件去重与 CAS GC 保护**：附件 SHA-256 不变，本机 CAS 与云端 R2 同账号空间去重（不重复占 100 MB 配额）。同时，每次推送写入副本及产生 `push_superseded` 被覆盖旧版时，平台必须在目标分区 `attachments` 表登记全部关联 `sha256` 持有行；仅当副本被删且用户在副本历史手动删除对应 `push_superseded` 旧版（`R19`）后才释放，确保本机 CAS GC 永不误删任何可恢复版本的附件。
- 现成的基础：Pages 的 `relocate`/`duplicate` 已清 `folder_id`、`goal_id`、`artifact_id`（`plugins/native/pages/src/store.ts:205-222`），PPT、Form、Dataset、灵光同类；`placement.copy` 的 `request_id` 幂等（`packages/contracts/src/platform/placement.ts:21-60`）；`placement.attach` 的 `read.revision`（`index.ts:146-177`）。

### 7.2 账本（归 `horizontal/placement`，U5）

存在个人空间的分区主库，随个人空间同步（否则换一台设备再推会生成双胞胎副本）。

```sql
-- push_id = hash(space_id, plugin_id, kind, source_id, target_project_id)，首次 target_id = hash(push_id)。
-- op_id = hash(push_id, target_id, source_rev, mode, base_target_rev)。各端使用同一有类型的元组编码。
-- create 的基准为 null；覆盖冻结用户所见（或自动更新开始时）的目标版本。重试沿用原基准。
CREATE TABLE push_lineage (
  push_id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL, kind TEXT NOT NULL, source_id TEXT NOT NULL,
  target_project_id TEXT NOT NULL CHECK (target_project_id <> 'personal'),
  target_id TEXT NOT NULL,
  last_pushed_source_rev INTEGER, last_pushed_target_rev INTEGER,
  state TEXT NOT NULL CHECK (state IN ('active','detached','upstream_deleted','withdrawn','target_deleted','target_removed')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (plugin_id, kind, source_id, target_project_id)
);
CREATE TABLE push_operations (            -- 只记已完成的操作（V2：不预记）
  op_id TEXT PRIMARY KEY, push_id TEXT NOT NULL REFERENCES push_lineage(push_id),
  target_id TEXT NOT NULL, target_rev INTEGER NOT NULL,
  source_rev INTEGER NOT NULL, base_target_rev INTEGER, mode TEXT NOT NULL CHECK (mode IN ('create','overwrite')),
  outcome TEXT NOT NULL CHECK (outcome IN ('settled','repaired')),
  snapshot_digest TEXT NOT NULL, actor_id TEXT NOT NULL, actor_kind TEXT NOT NULL CHECK (actor_kind IN ('person','assistant')),
  settled_at TEXT NOT NULL
);
```

状态 `target_deleted`：目标项目进回收站或被删（从回收站恢复回 `active`，永久删除后行保留为历史）；`target_removed`：目标分区移除了该插件并选了删除数据。目标分区主库里另有平台表（同属 placement）：`push_upstream(target_id, op_id, push_id, plugin_id, kind, source_rev, target_rev, pushed_at, upstream_state)` 用来显示「来自个人空间 · v3／上游已删除」，**不存原件标题与 id 明文**（R9）。每次已提交操作按 `(target_id, op_id)` 唯一保留；当前来源显示跟随对象实际接受的副本版本。历史标记使迟到重试和连续两次覆盖都可逐笔对账（7.3）；`push_superseded(target_id, target_rev, snapshot, files_json, superseded_at)` 存被覆盖的版本，**全部保留**、可逐版恢复（U6）；只有最近一版随分区同步，更早的留在发生覆盖的那台设备（V3）；占用计入该分区的存储显示，用户可在副本的历史里手动删旧版，平台不自动淘汰。

同一原件可以把 v1 推给项目 A、v3 推给项目 B：每个目标项目一行，各记各的版本。

### 7.3 三步幂等提交

<a id="push-commit"></a>

1. **冻结本次意图。** 读取源版本和目标基准，按 §7.2 算号。自动推送或本人再次确认时记录其所见基准；同一请求因超时重发，沿用原编号、基准和目标。重放须核对源版本、目标及快照摘要；两台设备对同号操作给出不同内容时按冲突处理。不能重新读取新版本替旧请求授权。原件 v3 覆盖目标 v5 后，用户针对手工改过的 v7 再次确认，会得到另一个操作编号。此步没有持久写入。
2. **一次本机提交。** 在写入前执行 `beforeEffect()` 并复核授权、启用、目标版本与分区状态，目标已归档、已删除或调用已撤销即退出。需要启用的先有本人的本次确认，旧结构先按现行规则打开该分区升级。宿主协调同一 SQLite 连接与写事务，原子提交插件内容、目标主库的逐操作来源标记及被覆盖版本，并在**推送人个人空间的账本库**留下该笔已提交操作的私有回执。回执保留补齐账本所需的源 ID、源与目标版本、操作模式与基准、快照摘要、可信操作者及提交时间；不留业务正文。不生成待执行记录。目标库与共享的项目数据均不含源 ID 明文或私有回执。
3. **结算个人账本。** placement 按同一 `op_id` 对照已提交标记与私有回执，将首次血缘、操作结果和最后接受的版本在个人空间一次写入，成功后回收该私有回执。已结算的重放直接取当时的目标版本；迟到的旧操作不能倒退血缘当前指针。回执与账本只走本人的个人空间流，目标标记走项目流。异机只收到一侧时等待相应事实，不能据推送编号猜原件或操作者。

**原生和签名插件共用的事务边界。** 主库型插件使用宿主的事务连接；独立库型（如 Pages）由宿主在同一事务加入该插件的分区库及本人的私有回执库。沿用 [Storage 已有的同卷、文件身份、回滚日志和事务检查](../../packages/storage/src/sqlite-library-transaction.ts)；现有工具只接一个附库，第 111 批须在 Storage 层兑现所需参与库、连接限制及故障验证。任一库不能安全参加时，在产生业务结果前拒绝。插件只经受限事务端口提交自己的数据，无权选择附库、修改平台表或独立提交。沙箱通过同一宿主端口完成最终提交；准备快照、等插件或外部服务在事务外完成。第 107 批退役的 `artifact_join` 是旧插件声明，不能成为新作者义务。

**中断与补齐（V2）。** 目标提交前中断，各库均无本次写入。提交之后、个人账本结算之前中断，启动或打开个人空间时核对两份匹配的事实，按原操作者和版本补 `outcome='repaired'`，不重跑插件、不改业务内容。缺一侧先等待；不匹配的事实交给诊断。该平台记账例外仍限原决定 `S-push-ledger-repair`。落地时将具体条件和断点用例登记在安全不变量与合同变更文档。

**两台设备。** 两台设备离线时各推一次同一原件到同一项目：算出同一 `push_id`、`target_id`，目标里只有一份副本；同步合并时按目标版本，后到的一次当作「更新副本」（有冲突照 7.4 问）。

### 7.4 再推、冲突、撤回、删除

- **再推**：定位原 `target_id` 原地更新，不断项目里对它的关联（Goal、讨论、主线）。读目标当前版本：等于 `last_pushed_target_rev`（没人动过）→ 直接覆盖；不等 → 弹窗二选一：「覆盖项目当前版本（被覆盖的版本留在项目里，可恢复）」或「在项目里另存为新条目」（用本次确认的请求标识派生新 `target_id`，重放复用；当前血缘指向新副本，旧副本标为 `detached`，个人操作回执保留原目标）。绝不静默覆盖。
- **局部引用**：按 `local_refs` 置空或落根目录（例：Pages 的个人文件夹 → 目标项目根目录），避免目标库 `SQLITE_CONSTRAINT_FOREIGNKEY`。
- **删除原件**：不级联删副本，只把各行标 `upstream_deleted`。
- **原件侧两个不同的操作**：「仅断开推送关联」（`detached`，副本留着变成项目自己的）与「撤回并删除项目副本」（按目标项目的删除权限与版本门禁调用插件自己的删除动作；版本变了再确认一次；`withdrawn`）。
- **另存为个人空间的新原件**（项目 → 个人空间）：一次性 export → put 成新原件，不写 `push_lineage`，只记一条 `derived_from` 说明来源。
- **批量推送**：多选（含整个文件夹）一次确认，逐件独立执行，结果逐件列出，一件失败不影响其他件。
- **原件移出个人空间**（移动到某项目）：移动前提示它有几个副本，移动后这些记录全部 `detached`。
- **目标的限制**：归档的项目不能作为推送目标；整项目复制不复制 `push_upstream`，复制出的条目没有上游。
- **执行态在目标里默认停着**：例如 Feed 的来源推过去是「已暂停」，要在项目里重新连接并开启。
- **和现有操作的关系**：`placement.move`（分区之间移动）与项目之间的一次性 `placement.copy` 保留；个人空间 → 项目的复制由推送取代。

## 8. 内置插件（**20 个平等内置插件**；`text-stats` 已于 `#2243` 删除，创作台 `#2239` 归平台，Shelf `44B` 归纯平台 `modules/shelf`，旧 Alchemist `44B` 彻底删除）与第三方沙箱包的改造矩阵

引擎：主库 = 分区主库 `molis-work.db`；独立库 = 每分区一个 `databases.partition` 库。工作量 S／M／L。

| 插件 | 现在 | 目标引擎 | 动作作用域变化 | 要清的项 | 推送声明（种类 · 要剥离的局部引用） | 特殊 | 量 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Goals | 项目一份，主库 | 主库 | 不变（约 77 个，项目） | 约 20 张表的 `project_id` 与 `REFERENCES boards(project_id)`；`boards.project_id` 主键改单例 | Goal · 关系 `from/to_goal_id`、`input_bindings`、`boards.active_goal_id`、要求链接、上下文账本引用、回收站记录 | 要求与认可在平台表（`acceptance_*`），推送不带认可票 | L |
| Coding | 项目一份，主库 + KV | 主库 | 不变（约 42） | 5 张表 `project_id`（`store.ts:47-323`，全插件约 111 处引用） | 不声明（会话推送没意义） | 必需 `goals:read/write` 已在 `#2258` 改可选；必需的 `review:git-worktree`／`review:git-integration`（`coding/src/manifest.ts:90-91`）在 `109` 随 D6=B 改为对 Git 插件的依赖：Manifest 声明 Git 为**随启用依赖**（`dependencies: [{ plugin_id: "io.molis.work.git", enable_with: true, required: false }]`，V9）——在任何分区启用 Coding 时一并启用 Git（确认框写明）；之后可以单独移除 Git，确认框先写明「Coding 只能一次一个地改、不能并行」（V10），移除后 Coding 降级为单工作区串行写，随时可再加回；保留第 99 批 `#2244` `install_id` 隔离。「随启用」是通用声明，任何插件都能用，平台不写插件名；个人空间以 `outputs/personal` 为工作目录 | M-L |
| Git | 项目一份，只有 KV | — | 不变（10）+ 迁入工作区 Git & Writers 动作 | 无 | 不声明 | 平民化 D6 定 B（`109` 迁入）：宿主 `workspace-git*.ts`（约 1,400 行）、`projects.workspace.writers.*`、SDK `git-porcelain.ts` 与 `git.*` 错误码搬进来；跑本机 `git` 走 argv-only、分区目录监禁的受限 VCS 执行能力（`S-git-plugin-command-scope`）；写入调度（谁在写、并行拷贝）随之归 Git 插件（V9）——工作终端、助理操作电脑、Characters 原生运行这些不经 Git 插件的写入方不参与它的协调，这是用户接受的取舍，界面上在这些写入方启动时提示「Coding 正在这个文件夹改动」；个人空间输出目录不是仓库时如实显示不可用 | M-L |
| Diff | 项目一份，无存储 | — | 不变（2） | 无 | 不声明 | 声明对 Git 插件的可选依赖；Git 未启用时降级为文件系统对比或如实提示不可用 | S |
| Feed | 双实例：项目主库 13 张表 + Home 库 `feed-content` | 主库 | Home 半 3 个动作删除，改平台证据服务 | 13 张表 `project_id`（全插件约 354 处引用）；`companions:["inbox"]` 改 Manifest 依赖声明 | 来源、外发规则 · `credential_ref`、`connection_ref`（per_record 绑定，绝不带）、`signal_id`、判断规则引用 | 证据正文引用账本收归平台（`horizontal/evidence`）；对接 `#2257` 精准唤醒槽位；推过去的来源默认「已暂停」 | L |
| Inbox | 项目一份，主库 1 张表 + 平台 Attention | 主库 | 不变（18） | `inbox_scene_bindings.project_id` | 不声明（条目归 Attention） | 作为 Feed 的依赖在同一分区；`44B` 修复 `#2231` `platform-sync-catalog.ts` 借用 Inbox 的缺陷 | S |
| Risk | 项目一份，主库 | 主库 | 不变（16） | `risk_items.project_id` | 风险 · `risk_links` 指向的分区内对象、Schedule 里的复查任务 | — | M |
| Schedule | 项目一份，主库（`scheduler.join`、`notifications.deliver`） | 主库 | 不变（约 22） | 4 张表 `project_id` | 不声明（任务绑安装与调度作业，属执行态） | 唯一 `default_enabled`：空白分区初值开，随时可移除 | M |
| **Shelf（非插件，已收归平台）** | 原常开 + 双实例插件 | **纯平台 `modules/shelf`（`44B` 完成）** | `system.shelf`（`kind:"system"`，`/api/platform/shelf`） | 删除 `plugins/native/shelf`、`always_on`、`dual_instance`、`PLUGIN_MODULE_IMPORT_ALLOWLIST` | 不声明（全局中转平台部件） | 终审覆写 D1/U9：零插件身份、免重写 ~3,150 行 Rust M5 协议 | `44B` 已收口 |
| Work Brief | 双实例，Home 共用库，`scope` 枚举 `home\|topic\|personal` | 独立库 | Home 半 `personal.get/refresh` 删除，个人空间里的简报改读总览索引 | `briefs.project_id`、`scope` 枚举、`brief_requests`/`brief_editor_versions` 的 `project_id`、`project_rows` | 简报 · `brief_versions.brief_id`、固定版本的 `artifact_id` | 每个分区的「首页简报」各一份；个人简报 = 个人空间的简报 + 总览索引 | M |
| Workflows | 项目一份，Home 共用库，`personal:true` | 独立库 | 不变（16） | 4 张表 `project_id`；`project_rows` | 流程定义 · `chain_json` 里的站点能力引用（目标分区没装的插件标为不可用） | — | M |
| Pages | 项目一份，Home 共用库，`personal:true` | 独立库 | 不变（48） | 4 张表 `project_id`；`project_rows` 与 `artifact_join`；同步键里的 `project_id` | 文档 · `folder_id`、`goal_id`、`artifact_id/version` | 必需 `goals:read` 改可选发现（只给 Goal 选择器用，`browser/menus.ts:105`） | M |
| PPT | 同上 | 独立库 | 不变（约 23） | 2 张表 `project_id`；`artifact_join` | 演示稿 · `artifact_id/version` | 必需 `actions:delegate`（读 Pages 大纲）保留，目标分区没有 Pages 时如实说 | S-M |
| Form | 同上 | 独立库 | 不变（27） | 2 张表 `project_id` | 问卷（不带答卷）· `artifact_id/version`；`share_id` 与 `status` 重置为草稿 | 公开填写链接绝不随推送 | S-M |
| Dataset | 同上 | 独立库 | 不变（27） | 3 张表 `project_id`（含 `dataset_source_bindings` 主键） | 数据表 · `artifact_id/version`（含 `snapshot_json` 里的）、来源绑定 | — | S-M |
| 灵光 | 同上 | 独立库 | 不变（20） | 3 张表 `project_id`（`conversations` 的 `UNIQUE(project_id, spark_key)`） | 灵感 · `conversations.spark_ids_json` | 跨多条灵感的对话不随推送（与今天 `relocate` 的拒绝一致） | S-M |
| Todo | Home 一份，`placement` 三态 + 可空 `project_id`，跨项目读 | 独立库 | 27 个 Home 动作改分区（另 2 个已是项目）；20 个 `project_reach` 动作删除，「所有项目」改读总览索引 | `placement` 枚举、`project_id`、`todo_deleted_projects` 墓碑表、`todo.placement.move` 的 Home 处理器；同步线格式 `format.todo.portable` 带 `project:{id,title}` 与 `belongsToProject`／`canUploadProject`（`todo/src/replication.ts:37-67,106`）要重写；`remind_at` 提醒改走平台到期登记（4.1） | 待办 · `links_json`（goal、material、work 等分区内引用）、`sources_json`、`batch_id` | 最大的一项：它自己建模了个人与项目之分 | L |
| Jelly（经 [`112-2`](../post-anticorruption-roadmap/reference/batches/112.md#batch-112-item-2) 瘦身为 4 张关系表） | 原 Home 单行 JSON，经 `112-2` 拆为 `jelly_categories`/`jelly_items`/`jelly_series`/`jelly_notes` 4 张关系表并清退私有 AI 与独立模型台 | 独立库 | 约 12～15 个强类型动作改分区 | 无 `project_id`；日程改走平台到期登记与总览投影 | 极简随手记（`jelly_notes`）、日程项（`jelly_items`/`jelly_series`）· `category_id` | 按场景包或手动在个人空间/项目启用（空白开始不设默认特例，对齐 V6/UPP-30）；项目里启用就是项目自己的日历与随手记 | S-M |
| Cognia | Home 一份 | 独立库 | 约 25 个从 Home 改分区 | 无 `project_id`；目录授权 `grant:<id>` 搬到 `personSettings` | 来源与资料、知识域 · `source_id`、`domain_id`、`locator = grant:*`（本机授权，必剥） | — | M |
| Images | Home 一份，`jobs.project_id` + 全局 `connections` + `images/assets/` | 独立库 + 分区插件文件 | Home 4 个连接动作改用 `personSettings`；其余已是项目作用域；后台生成队列改走平台到期登记 | `jobs.project_id`；`connections` 表搬走；`project_rows.files` | 生成任务与图片 · `connection_id`、`runner_id` | 声明 `owner_files`、`image_generation` 在分区实例上放开（C8） | M-L |
| Issues | Home 一份，按 `submitter_id` | 独立库 | 11 个从 Home 改分区 | 无 | 不声明（个人问题记录） | 全局快捷键 `Mod+Shift+I` 打开个人空间里的 Issues（个人空间未启用时弹出一键启用确认，空白开始不设默认特例，对齐 V6/UPP-30） | S |
| **Alchemist（已于 `44B` 彻底删除）** | 原宿主手写，`studio.sqlite`（`better-sqlite3`） | 不再存在（U10＝D2+U13） | — | `44B` 彻底删除 `plugins/native/alchemist`、全部 6 个宿主文件、`contracts/modules/alchemist.ts`、`sqlite-driver-owners.json` 与 `home-stores.ts` 条目（不留磁盘保留豁免） | 不声明 | 第 82 批在 `horizontal/plugin-studio` 上按纯 UPP 场景插件从零重写 | `44B` 已收口 |
| 创作台 | #2239 起是平台框内页面 | 平台 | — | 去掉 `personal: true`（#2239 已移出目录）；草稿按 `agent-studio:<projectId>` 存，换成分区 id；草稿同步走的 `project-private-values` 并入按分区的范围（5.1） | 不声明 | 切换器顶部入口；改了创作台挂载的 Skill 章节或生成提示要跑 `pnpm studio:replay` 与隔离 Home 冒烟 | S |
| 第三方签名沙箱包 | `runtime.scope: home` 用 `sdk.homeDatabase`；项目包用 `sdk.projectDatabase`；双实例只给固定公钥 | 主库（`sdk.projectDatabase`）或独立库（新开放 `sdk.database`） | Home 作用域只留系统用途，普通包一律分区 | `sbxdb-*` Home 库、`assertScopeKept`、`dual_instance`（归零）；`packages/plugin-sandbox` 的 `homeDatabase` 效果键与代理（`schema.ts:31,36`、`broker.ts:34,295`）；SDK `sandbox-actions.ts:148` 的 `dualInstance` 路由、`skill-folder.ts:83,111` 的 `scope:"home"`；`tooling/plugin-cli/src/pack-sandbox.ts:70,115` 的 `--scope home`、`--home-database`；`examples/`；`skills/molis-plugin-dev/elements.md:113`、`host.md`；创作台生成提示（跑 `pnpm studio:replay`） | 可声明，同一套 `molis.push.*` 动作类型 | 每个分区一个沙箱进程、闲置即停；已装包在另一分区首次启用时，可选权限按分区再问一次，必需权限沿用安装时的同意；`SANDBOX_SERVICE_FATE` 里拒绝的服务不在本需求放开 | M-L |
| 官方集成、内容包 | Home 级（平民化 D3：官方集成收成平台连接器驱动） | 不变 | 不变 | 无 | 不声明 | 连接器目录在 Home；按分区的来源拉取（如 Feed 的来源）随所在分区 | — |

## 9. 清零清单

### 9.1 删除的标识与结构

- 登记：全部 `personal: true`、`PERSONAL_PLUGIN_IDS`、`PROJECT_SCOPED_PLUGIN_IDS`（`plugin-registry.ts:89-96`）、`ProjectPluginRegistry.isPersonal`（`packages/contracts/src/modules/projects.ts:73`）、`ProjectPluginMembership.hidden`（`:94-96`）、`catalog.db` 的 `project_plugin_exclusions`（`modules/projects/src/repository.ts:104-109`）、`companions`（改 Manifest 依赖声明）、登记层 `runtime.dual_instance`。
- 外壳：`isPersonalPlugin`（`apps/workbench/src/plugin-directory.ts:91-93`）、`ClientDirectoryEntry.personal`、`PluginMarketCard.personal`（`plugin-catalog.ts:17-25,349`）、`data-market-personal`、「个人 · 所有项目共用」分组与文案、`immersive-shell.ts:288-289` 没人读的隐藏 Goals 顶栏节点。
- Manifest：普通插件的 `runtime.scope: "home"` 与 `dual_instance`（全部归零）；`databases.home.project_rows`；`databases.home` 对普通插件改 `databases.partition`。
- 宿主：`outsideBuild`、`projectReachablePlugins`、`reachEntry` 的 `personal` 合成、`plugin-scope-entries.ts`、`assertScopeKept`、`home-package-admission.ts` 的 Home 包规则、`plugin-declared-services.ts` 的分区实例限制、项目库里的安装记录表、Feed 与 Work Brief 的 Home 半。
- 插件：各业务表的 `project_id` 列（U3）、Todo 的 `placement` 枚举与墓碑表、Work Brief 的 `scope` 枚举；Pages 等的必需 `goals:read` 改可选发现。
- 放置：`HOME` 标记、`moveHome`、`belongs_to`/`belonged_to`、`project_id === null` 的各分支（`horizontal/placement/src/index.ts:47-81,198-348,355-466`）、`placement-actions.ts:71` 的 `homeClient()`、外壳 `placement.ts:54,320-321`、合同 `nullable(projectRef)`（`packages/contracts/src/services/placement.ts:100-104`）。
- 同步：10 种 `scope` 收成按分区的 4 种（分区主库集合、分区独立库、分区文件、分区固定版本）+ Home 的 2 种（`home-document` 给 Shelf、`home-store` 给系统）；删 `personal-plugin-sync.ts:44` 接收时的 `addProjectPlugin`；个人空间的启用清单进同步（今天 `project-catalog-replication.ts:25` 排除了它）。
- 可达性与同意：`project_reach`、`projects:reach`、同意账本里的对应条目、SDK 的 `sandbox-read-protocol`（S-74 的跨项目读取整套退役，由总览索引取代）。
- 门禁与测试：`scripts/gates/dual-instance.mjs` 归零后删除；测试影响按复查实数估：约 40 个文件碰个人插件或隐藏标记、170 个碰 Home 插件／`databases.home`／`dual_instance`、311 个引 `"personal"`／`PERSONAL_SPACE`、220 个用 `project_id: null`、466 个 e2e 里约 104 个碰受影响插件或个人空间，含 `tests/ci-product-subset.txt` 与隔离规则；其中写死个人插件清单的 11 个文件（`plugin-directory-marks`、`plugin-directory`、`images-plugin`、`pages-plugin`、`todo-plugin`、`lingguang-plugin`、`workflows-plugin`、`creative-tools-plugins`、`declared-stages`、`shell-declared-placement-rows`、`view-placement-declarations`）；`skills/molis-plugin-dev/host.md:115`、`authoring.md:107`。

### 9.2 `project_id: null` 逐处归类

约 660 处，分三类改：① **Home 系统作用域**（包安装、账号、系统动作、Shelf）保留 `null`，字段名不变；② **Home 级业务位置**（Todo、Jelly、Cognia、Images、Issues 的数据、放置的 `HOME`、搜索的 `null = 个人`、Characters 角色 `roles.ts:29`、Feed `held_in`、助理 `assistant-service-shared.ts:134`）一律改 `"personal"`；③ **平台记录里的可空项目**（记忆、观测、评测、外部会话归属等 `project_id: string | null`）按含义改：「不属于任何分区」保留 `null`，「属于个人空间」改 `"personal"`。复查补的、今天用别的写法表示「无项目」的平台记录，同样逐个归类：知识卡片（`NOT NULL`，`knowledge-cards.ts:19-28`）、主线（`mainline/src/store.ts:14-21`）、判断规则用 `''`（`store-schema.ts:40`、`judgments.ts:73,108`）、观测用 `?? ""`（`service.ts:44`、`cleanup.ts:290`、`lifecycle.ts:59`）、评测回放（`replay.ts:78`）、`plugin-originals` 用 `''` 表示「Home 激活、各项目共用」（`material-original-files.ts:12-21`）、文本搜索、Blueprints 的 `origin_project`、项目讨论 IM 的存储；记忆与偏好的个人层（`assistant-memory-tools.ts:43-86`、`settings-memory.ts`）与 Characters 的个人层归「本人级」（1.1）。片 A 的第一件事是出一张逐文件归类表进 PR，评审按表核。`listProjects()` 的 18 处调用同样逐处归到 `listProjects` 或 `listPartitions`。

### 9.3 防回流门禁

新增一组 `pnpm health:check`（只许变小）：登记、合同、库结构里不得再出现个人插件分类、`hidden` 排除表、任何 `dual_instance`、普通插件的 `runtime.scope: "home"`、业务表的 `project_id` 列（分区主库里）、`project_rows`；改门禁本身按 AGENTS 先问用户——本需求一并请批。

## 10. 开工前检查（15 项）

| # | 回答 |
| --- | --- |
| 1 事实主人 | 安装记录与签名归 Plugin Runtime（Home 层一张表）；分区启用关系归 `modules/projects`（`partition_plugins`）；推送账本与上游标记归 `horizontal/placement`；证据正文引用归平台证据服务（`packages/storage` + 平台动作，取代 Feed 的 Home 半）；总览索引归 `horizontal/search`（可重建缓存，不是第二份事实）；本人级设置归新的平台服务（放 `horizontal/` 下）；业务对象仍归各插件 |
| 2 插件同等待遇 | 本需求的目的：一种插件、一种装配；不新增构建期接线；第三方沙箱包得到独立分区库与推送声明 |
| 3 能力注册 | 推送的 export/put 是插件动作，经动作目录发现，页面、助理、MCP 同一份；推送本身是平台动作 `placement.push.*`，只给本人与本人按目标项目授权过的助理（`S-push-authority`）；等外部的动作照旧 `scheduling: "concurrent"` + `beforeEffect()` |
| 4 合同 | 大改：`plugin-registration`、`plugin-manifest`（`runtime`、`databases`、`push`、`overview_projection`、类别）、`plugin-database`、`plugin-sync-registration`、`placement`、`search`、`actions`（分区上下文）、`modules/projects`、SDK 沙箱清单；M1 之前不留兼容；合同先行，片 1 单独成 PR，一次改完消费者 |
| 5 放在哪个包 | 推送进 `horizontal/placement`；本人级设置进新包 `horizontal/person-settings`；证据引用账本进新包 `horizontal/evidence`（存储适配用 `packages/storage`）；到期登记进 `horizontal/scheduler`；总览索引进 `horizontal/search`；分区启用进 `modules/projects`；不进宿主。新包同步登记 `scripts/package-owners.mjs`、`scripts/workspace-packages.mjs`、CODEOWNERS 与 `docs/SSOT-MATRIX.md` |
| 6 表与存储 | 新表：`partition_plugins`（catalog.db）、`push_lineage`/`push_operations`（个人空间主库）、`push_upstream`/`push_superseded`（分区主库）、证据引用账本、总览索引、本人级设置；删表：`project_plugin_exclusions`、项目库安装记录表、`feed_content_holds`、Todo 墓碑表；登记 `tooling/gates/table-owners.json`；按[决定 69](../post-anticorruption-roadmap/reference/decisions.md#decision-69)全部库固定 v1 原地修改，零升级段 |
| 7 兼容与迁移 | 生产代码零兼容读取、零迁移逻辑；按[决定 69](../post-anticorruption-roadmap/reference/decisions.md#decision-69)全部库固定 v1，无一次性复位白名单，旧开发 Home 直接删掉干净重建（U13、V5）。**两批之间允许新旧两套代码短暂并存**（V1，用户批准）：只是代码同时在，不读旧数据，每波迁完在同一 PR 里删掉已无人用的旧机制，批 C 合入时归零 |
| 8 安全边界 | 碰：保留分区（`S-personal-partition-reserved` 新）、分区隔离与跨分区读取（`S-partition-isolation` 新，扩 S-74）、保留宿主前缀（`S-reserved-host-prefix` 新，`44B-0`）、大快照句柄（`S-push-blob-handle` 新，`111`）、推送授权（`S-push-authority` 新）、MCP 个人空间绑定（`S-mcp-personal-binding` 新，扩 S-08）、本人凭据不外溢（`S-person-settings-private` 新，扩 S-71/S-70/S-95）、同步接收不启用（`S-sync-enablement-own-choice` 新）；改写或退役：S-31、S-48、S-49、S-72、S-80、S-91、S-98；每条配拒绝测试 |
| 9 调用次数 | 总览只读索引（开库次数常数）；推送一次 = 读源 1 次 + 读目标版本 1 次 + 写目标 1 次（含上游标记）+ 账本 1 次，需启用插件时另加启用与建库，附件按 SHA-256 只拷贝目标分区没有的；进入分区只开该分区的库；`call-budget` 加个人空间总览与推送两个场景 |
| 10 数据与重启一致 | 开发前阶段（[决定 69](../post-anticorruption-roadmap/reference/decisions.md#decision-69)）所有库固定 v1、无开发金样；通过干净新建 v1、离线快照恢复与正常重启测试证明个人空间与项目的数据、引用、设置一致 |
| 11 成果与过程项 | 推送不是成果：推送的是活对象副本；定版仍进成果库；个人空间有自己的成果库 |
| 12 页面、外壳与文字 | 切换器、插件市场分组、推送确认、冲突、撤回、标注都先定样；新文字归 placement、projects 与各插件；不拿译文做判断 |
| 13 错误 | `push.*`、`partition.*` 用 `defineErrorCodes`，前缀登记 `tooling/gates/error-owners.json` |
| 14 冲突面 | 在途与已排（终审校准）：先消费在途待合前置 PR——`#2239`（47 批创作台）、`#2258`（44 批共享样式/演示种子/连续性协议）、`#2253`（RO/RW 池）、`#2254`（静息读数过渡，将被 `108` 总览索引取代）、`#2255`（`discoverOne`）、`#2257`（Feed 精准唤醒）、`#2250`（记忆精确绑定）、`#2260`（M1-B3 同步回归）；允许 `#2259`（决定 64/65、`91-0c` 统一列表-详情容器）并行/前置；`44B` 与本需求（`106`～`111`）按**决定 66** 排在 `91-2..4`、`91B`、`105`、`45`～`90`、`REL-4`、`SRV` 之前；第 `64-3` 跨项目个人视图并入 `108`；第 `57` 批后移至 `111` 之后；第 `48` 批新插件生成改走 UPP 形态；第 `63A` 批记忆按 `R15` 拆清本人级 vs 分区记忆；`SRV-2`/`SRV-5`/`SRV-6` 对齐本需求分区与推送口径 |
| 15 全局最优 | 插件：一种写法，第三方同路；平台：两套宿主合一，放置与同步去掉 null 分支；助理：分区上下文明确，跨分区只读本人总览；各类平台能力：资料、成果库、搜索、同步、MCP 都按分区，推送复用放置的幂等与版本思路；后续开发：再加一个插件不用想「个人还是项目」。比较过：保持三种跑法只清标记（省事但双轨永存）；全部塞进分区主库（毁掉独立库插件的同步触发器与 authorizer，原文已否）。代价：插件迁移一次性工作量大（3 个 L、约 10 个 M），由片 4 分波次摊 |

### 10.1 平台能力检查

1. 别的插件也要做：是，全部 20 个。2. 现成的：`partition: "project"` 独立库机制、`placement.copy` 幂等、`attach` 的版本、个人空间分区、`readable_project_ids`、搜索索引——都复用。3. 是插件之间协作的问题：推送与总览都做成平台统一方案。4. 第三方同样能做：是（独立库开放、推送声明）。5. 助理与 Agent 能发现：export/put 与总览经动作目录；推送执行只给本人。结论：**现在收进平台**。

## 11. 安全不变量（新增按 `S-<语义名称>.md` 命名，见 `docs/system/SECURITY-INVARIANTS.md` 第 15 行；不再争用连续编号）

| 编号 | 内容 | 拒绝测试 |
| --- | --- | --- |
| `S-personal-partition-reserved` | `personal` 是保留分区：建项目、导入、同步接收、整项目复制、团队共享不能产生或占用；不能改名、回收、删除、共享 | 每条入口用 `personal` 调用被拒 |
| `S-partition-isolation` | 插件实例只拿自己分区的库与文件。跨分区总览按[读取权限](#overview-readers)裁决（取代 S-49、扩 S-74） | 本人可读 A、B，个人助理仅获 A 的截止日期时不含标题或 B；撤 A 后缓存和在途交付均收回。项目 Agent／MCP／插件／工作流均拒；分区 A 的实例读 B 的库仍拒 |
| `S-push-authority` | 推送只由本机本人或本人按目标项目授权过的助理发起（授权可撤）；项目 Agent、外部 MCP、工作流一律拒；覆盖已被改过的副本与撤回删除只认本人逐次确认；`beforeEffect()` 复核；目标版本不符拒；快照带执行态、绑定或密钥引用被拒 | 未授权的助理推被拒、撤销授权后被拒；项目 Agent／MCP 推被拒；助理覆盖已改副本被拒；撤权后零写入；带 `credential_ref` 的快照被拒 |
| `S-mcp-personal-binding` | 个人空间不作为任何外部客户端的默认分区；外部 MCP 碰个人空间需单独确认绑定 | 未单独绑定的客户端调个人空间被拒 |
| `S-person-settings-private` | 本人级配置与凭据（`personSettings`、连接器凭据、本人默认连接槽）不给其他成员、未获准 Agent、跨分区客户端；`per_record` 绑定按分区 | 项目 Agent 读本人设置被拒；分区 B 找不到分区 A 的记录绑定；同步出站数据里没有密钥、令牌与本机路径；把密钥类键标 `portable` 被 SDK 拒绝 |
| `S-sync-enablement-own-choice` | 收到的业务数据不启用插件、不装包、不建项目；只有本人账号下的「分区启用清单」记录能在另一台设备启用插件（V4）；未启用插件的数据挂起等启用 | 接收含未启用插件数据的变更后启用关系不变；伪造的、非本人账号的启用记录被拒 |
| `S-push-ledger-repair` | 按[三步提交](#push-commit)，只有逐操作的已提交目标标记与同次私有回执匹配时可补个人账本，结果为 `repaired` | 目标提交前中断零写入；提交后中断只补平台账本，缺失、伪造或错配标记不补，恢复不写正文 |
| `S-partition-wake-scope` | 推送、同步写入、到期登记、总览重建只打开相关分区的库，不起其他分区的监督器与沙箱进程 | 20 个项目 19 个休眠时做上述四件事，休眠项目的进程数为零 |
| `S-git-plugin-command-scope` | `plugins/native/git`（D6=B）调用本机 `git` 仅经平台受限 argv-only VCS 执行器（固定二进制、禁锢于当前分区工作目录、禁止 shell 解析与外部 hook 注入、仅宿主信任签名包可用） | 非宿主包申请、越界路径参数、shell 元字符或注入 hook 参数均被拒 |
| `S-reserved-host-prefix` | `io.molis.work.` 前缀只给宿主自己的包（前提：插件命名已按 V16 放开）：非宿主安装（含创作台生成、固定公钥第三方）申请该前缀下任何 id 一律拒（`plugin.id_namespace_conflict`），不再靠容易漏项的散点名单（`44B-0`） | 非宿主包以 `io.molis.work.characters`、`io.molis.work.assistant`、`system.shelf`、`io.molis.work.artifacts` 与一个尚未发布的 `io.molis.work.*` 各安装一次，均被拒 |
| `S-push-blob-handle` | 大快照句柄只对一次推送操作（`op_id`）与一个安装有效，用完或超时即失效，不能跨分区、跨安装复用（`111`） | 拿别的安装、别的分区或已用过、已超时的句柄读写，均被拒 |

改写：S-31（Home 插件路由 → 分区路由）、S-48（**双实例整套退役归零**，Shelf 已于 `44B` 归纯平台 `system.shelf`）、S-49（休眠读数 → 总览索引，#2254 先合）、S-72（隐藏个人插件 → 删除，改「未启用的插件在该分区被拒」）、S-74（跨项目读取整套退役）、S-80、S-91（沙箱 Home 库 → 分区库）、S-98（证据回收归平台）。还要核对并按需改写：S-34（常开机制退役、Shelf 归平台）、S-35（推送与跨分区移动回滚的关系）、S-71（连接槽）、S-character-role-scope、S-mainline-own-line、S-evaluation-isolation、S-observation-records、S-plugin-data、S-directory-output-only。合入前对照 #2245、#2255 对 S-49、S-07 的改动。

## 12. 分批计划（正式路线书批号 `44B` + `106`～`111`，先加、后迁、再删）

按 V1 与路线书[决定 66](../post-anticorruption-roadmap/reference/decisions.md#decision-66)：采用**先加、后迁、再删**，每波编为独立正式批次（1 批 = 1 PR，批内子分支），保证每次合入 `main` 恒绿；两批之间允许新旧代码短暂并存（不读旧数据），每波在同一 PR 内删掉已无人用的旧机制，批 `111` 合入时旧机制与双轨归零（由 G1～G5 门禁焊死）。完整批次详情与 Goal Prompt 见 [`44b.md`](../post-anticorruption-roadmap/reference/batches/44b.md)、[`106.md`](../post-anticorruption-roadmap/reference/batches/106.md)～[`111.md`](../post-anticorruption-roadmap/reference/batches/111.md) 及[合并实施总纲](../plugin-specials-demotion/implementation-plan.md)。

<a id="author-delivery"></a>

**插件作者手册随合同交付。** 第 106 批发布声明、依赖与启用约束时给出 Manifest 和 SDK 用例；第 107 批交付独立库存储与事务示例；第 108 批补总览投影、到期提醒及授权读摘要的例子；第 111 批随推送合同交付原生、签名包两条可复用样例，核对旧写法退出。各批按实际发布的合同更新[插件开发手册](../../skills/molis-plugin-dev/SKILL.md)，并在影响创作台挂载时运行[回放与隔离冒烟](../../docs/platform/STUDIO-SKILL-REPLAY.md)。

**每批都要自带**（不留到最后）：`pnpm api:update`／`actions:update`／`versions:generate`（所有持久化库与格式固定 v1、零 `upgrades`，不再有开发金样与存储结构快照更新，见[决定 69](../post-anticorruption-roadmap/reference/decisions.md#decision-69)）；`OBSERVATION_COVERAGE_PLAN` 登记；新状态在 `docs/platform/STATE-VOCABULARY.md` 与 Manifest 申报；`node scripts/generate-plugin-registry.mjs`；新包的 owner 与成熟度登记；改到的界面跑首屏字节、`plugin-styles:check`、`visual:compare`、`audit-ui-copy` 与界面翻译门禁。

| 批号 | 内容 | 删掉什么 | 依赖 |
| --- | --- | --- | --- |
| **[`44B-0`](../post-anticorruption-roadmap/reference/batches/44b.md)** | P0 安全补洞（全局保留 `io.molis.work.` 前缀 `S-reserved-host-prefix` + 修第三方前缀正则），可立即提前切安全小 PR | — | 无 |
| **[`44B`](../post-anticorruption-roadmap/reference/batches/44b.md)** | 特殊逻辑平民化全量收口（含 **Shelf 纯平台收归 `modules/shelf` / `system.shelf`**、彻底删旧 Alchemist 与 `better-sqlite3`、D5 Clean v1 直接拍平、官方集成驱动化与 `youtube`→`rss`/`planning-methods`→`packages/system-skills/`、修 `#2231` Inbox 劫持、统一 `provider_id`/目录/设置、上线 G1） | `plugins/native/shelf`、`always_on`、`PLUGIN_MODULE_IMPORT_ALLOWLIST`、旧 Alchemist、`better-sqlite3`、构建期例外、连接器厂商硬编码 | `#2239`、`#2258`、`#2253`～`#2255`、`#2257`、`#2250`、`#2260`、`44B-0`（`91-0c` 可并行/前置） |
| **[`106`](../post-anticorruption-roadmap/reference/batches/106.md)（UPP-A 底座）** | ① 逐文件归类表（9.2）。② `partitionRoot()` 与 `personal-space/`（U1），快照/恢复/升级枚举/成果行/卸载清理全走它。③ `listPartitions()`、Home 初始化建 `personal`、保留 id 守卫、修首次运行判断。④ 单张安装表、`partition_plugins`、`partitions.plugins.set@1`（V6）、新每分区装配（短期并存）与闲置停。⑤ `horizontal/person-settings`（复用 `#2231` `personalConfigReplica`）、`horizontal/evidence`、平台到期登记（对齐 `#2257`）、平台定格式总览表 `overview_projection`（到期提醒从中取、`95-3` 7 天漏跑过期归到期登记、`dirty` 懒刷新，写法进插件开发文档）。⑥ Manifest 新字段、`material-original-files`/`material-attachments` 全分区化、个人空间保留 IM（R21）与双层自写 Skill（R22） | 无（只加不删保绿） | `44B` |
| **[`107`](../post-anticorruption-roadmap/reference/batches/107.md)（UPP-B1 独立库）** | 宿主全链路接通新每分区装配；Pages、PPT、Form、Dataset、灵光、Workflows 迁 `databases.partition`、删业务表与同步 `project_id` 并摘除各自 `personal:true` | `databases.home.partition` 复用器与 6 个插件顶层旧库登记（`project_rows`、`artifact_join` 机制留 `109`） | `106` |
| **[`108`](../post-anticorruption-roadmap/reference/batches/108.md)（UPP-B2 原 Home 插件与总览）** | Todo、`112-2` 瘦身分表后的 Jelly、Cognia、Images、Issues 改分区作用域与 `databases.partition`；提醒/日程/队列改到期登记；本人级设置迁 `personSettings`；个人空间总览上线（含原 `64-3` 跨项目个人视图）与门禁 G4 | `personal:true`、`hidden`/exclusions、Todo `placement`/墓碑表（`project_reach` 与 S-74 留 `109`） | `107`、`112` |
| **[`109`](../post-anticorruption-roadmap/reference/batches/109.md)（UPP-B3 主库、双实例归零与 Git 迁入）** | Goals、Coding、Risk、Schedule、Inbox、Feed（证据归 `horizontal/evidence`）、Work Brief、删主库业务表 `project_id`（Diff 无存储，不涉及）；**Workspace Git + `projects.workspace.writers.*` 迁入 `plugins/native/git`**（`S-git-plugin-command-scope`、开放审查种类保留第 99 批 `#2244` `install_id` 隔离、Coding/Diff 无 Git 降级）；第三方沙箱包开放 `databases.partition` | 分区主库业务表 `project_id`（U3）、**全部 `dual_instance`**、Feed/Work Brief Home 半、普通插件 `runtime.scope:"home"`、`outsideBuild`→`projectReachablePlugins`、`home-package-admission`、`databases.home.project_rows`、跨库 `artifact_join`、`project_reach`／S-74 跨项目读、旧双套装配、宿主 `workspace-git*.ts`、沙箱 `homeDatabase`/`--scope home` | `108` |
| **[`110`](../post-anticorruption-roadmap/reference/batches/110.md)（UPP-B4 放置/同步/搜索/MCP）** | 放置删 `HOME` 分支；个人助理在个人空间传真实 `"personal"` 分区号，记忆/角色拆清本人全局层 vs 个人空间分区；同步范围收敛为 4+2、Clean v1 保 v1 拍平、分区启用清单独立种类（V4）、基于 Home 单安装表的零唤醒发现与门禁 G5；搜索分区标注；MCP `S-mcp-personal-binding` | `project_id===null` 业务含义、`home-with-projects`/`projects` 同步范围、`personal-plugin-sync`/`personal-artifact-sync` 接收自动建项目/启用 | `109` |
| **[`111`](../post-anticorruption-roadmap/reference/batches/111.md)（UPP-C 推送、界面与收尾，允许拆 3 个串行 PR）** | 存储三库原子提交升级 + 推送全链路（不预记三步+`S-push-ledger-repair`、>256 KiB Blob Handle 分片、CAS 对副本与全部 `push_superseded` 持有保护、引用 `remap`/`strip`、仅同步最近 1 版旧版、助理按目标项目授权）；14 个有业务对象插件一次完成 `push` 声明与沙箱同路支持；界面先定样后落地（`36A` 左上角切换器置顶个人空间、首屏引导首卡壳层、8 类市场、按需懒加载推送/冲突/撤回弹窗与存储占用页、快捷记到个人空间）；焊死 **G1～G5** 门禁与文档更新；旧开发 Home 按[决定 69](../post-anticorruption-roadmap/reference/decisions.md#decision-69)直接删掉干净重建（操作线上个人云同步空间前先确认） | 剩余旧合同字段 | `110` |

门禁改动要用户批的（AGENTS 红线）：新增防回流门禁（9.3）、改写 `scripts/gates/dual-instance.mjs`、页面资源单次涨超 10 KB 或新增资源（推送与冲突确认框）。工作量提示：插件里 `WHERE … project_id = ?` 约 256 处；C 批的推送声明 14 个插件，本身就是 L。

全量回归交 CI `full-suite`；本机只跑改到的文件（`node scripts/affected-tests.mjs`、`--jobs 1`）。

## 13. 验收（编号 UPP-xx；证明的测试在名字或注释写编号）

| 编号 | 标准 |
| --- | --- |
| UPP-01 | 空 Home 首次启动落在个人空间；再次打开保留[各分区自己的首页选择](#home-pages-owner)，删项目不会清除个人首页或复用旧批准；切换器顶部固定「个人空间」，其下项目与新建；`listProjects()` 不含个人空间，`listPartitions()` 含 |
| UPP-02 | 用 `personal` 建项目、导入、同步接收、整项目复制、共享、改名、回收、删除均被拒（`S-personal-partition-reserved`） |
| UPP-03 | 全部 **20 个平等内置插件**（Goals、Coding、Git、Diff、Feed、Inbox、Risk、Schedule、Work Brief、Workflows、Pages、PPT、Form、Dataset、灵光、Todo、Jelly、Cognia、Images、Issues；`text-stats` 已于 `#2243` 删除，创作台 `#2239` 归平台，Shelf `44B` 归纯平台 `modules/shelf`，旧 Alchemist `44B` 彻底删除）都能在个人空间与任一项目里添加、移除；移除后数据保留，重新添加恢复；没有「隐藏」 |
| UPP-04 | 插件市场与切换器没有「个人 · 所有项目共用」，按类别分组 |
| UPP-05 | 插件业务代码里没有 `WHERE project_id = ?`（门禁量；平台模块自己的表——如 `modules/shelf`——不在此列） |
| UPP-06 | 分区 A 的插件实例读不到 B 的库与文件；按[总览权限](#overview-readers)验证本人、部分授权的个人助理、项目 Agent、MCP、工作流及插件，覆盖撤权时的缓存和在途读取 |
| UPP-07 | 个人空间总览在 20 个项目、其中 19 个休眠时，不启动任何休眠项目的监督器与沙箱进程；开库次数与项目数无关 |
| UPP-08 | 首次推送生成独立 `target_id`；中断在三步任一步后重试，结果只有一个副本、账本一致 |
| UPP-09 | 副本未被改动时再推直接覆盖；改动过时弹窗，选覆盖后被覆盖版可在项目里恢复，选另存则生成新条目；同一原件先覆盖 v5 再对 v7 确认有两份回执，两次各自重试都返回原版本 |
| UPP-10 | 局部引用（Pages 的个人文件夹、Goal 引用）被剥离，目标库没有外键失败 |
| UPP-11 | 删除原件不删副本，副本显示「上游已删除」；「仅断开」与「撤回并删除」行为不同，后者走目标项目权限与版本门禁 |
| UPP-12 | 推送快照不带执行态、连接绑定与密钥引用（`S-push-authority`）；附件 SHA-256 不变，云端不重复计配额 |
| UPP-13 | 同一原件 v1 推项目 A、v3 推项目 B，两边各自正确 |
| UPP-14 | 绑在项目 X 的 MCP 客户端与项目 Agent 读不到个人空间；未单独绑定的客户端调个人空间被拒（`S-mcp-personal-binding`） |
| UPP-15 | 本人级设置与凭据不被项目 Agent、其他分区客户端读取（`S-person-settings-private`） |
| UPP-16 | 接收同步不启用插件；个人空间的启用清单在两台设备一致（`S-sync-enablement-own-choice`） |
| UPP-17 | ⌘K「本项目与个人」的结果标明分区；副本与原件互相标注 |
| UPP-18 | 干净新建 v1、离线快照恢复与正常重启：个人空间与项目的数据、引用、设置都在（原 `0.1.0` 金样回放已随[决定 69](../post-anticorruption-roadmap/reference/decisions.md#decision-69)在开发前阶段移除） |
| UPP-19 | 防回流门禁：重新引入个人分类、`hidden`、任何 `dual_instance` 均失败 |
| UPP-20 | （依赖第 SRV-2 批的同步服务，或用本机同步服务测）两台设备同一账号：分区数据、启用清单、`portable` 偏好、连接名称一致；密钥、令牌、目录授权不出本机，另一台显示待连接；未装的包只提示不自动装（5.1） |
| UPP-21 | 只有一张安装表、一套装配；门禁量 Home 级与项目级的平行装配代码为零 |
| UPP-22 | 签名沙箱包能用分区独立库与推送声明，和内置插件一样 |
| UPP-23 | 证据正文引用由平台记账，Feed 与 Work Brief 没有 Home 半；无人引用的正文只由平台回收 |
| UPP-24 | 助理按目标项目获准后能直接推，撤销授权后不能；每次推送留记录并通知本人；需新启用插件或覆盖已改副本时仍要本人确认（`S-push-authority`） |
| UPP-25 | 被覆盖的版本全部可恢复、可手动删；只有最近一版到另一台设备，更早的标明在哪台电脑 |
| UPP-26 | 原生 Pages 与签名沙箱插件均验[提交断点](#push-commit)。首次推送在目标提交前中断零写入；提交后、记账前退出，重启按原身份和摘要补齐且只有一个副本；目标分区读不到源 ID，迟到重试不覆盖新改动 |
| UPP-27 | 两台设备离线各推一次同一原件到同一项目，同步后只有一份副本 |
| UPP-28 | 「另存到个人空间」生成新原件，记 `derived_from`，不建推送记录 |
| UPP-29 | 全仓 `always_on = 0`、`dual_instance = 0`（Shelf 已在 `44B` 收归纯平台 `modules/shelf` / `system.shelf`），零插件形态特例 |
| UPP-30 | 空 Home 首次启动，引导是个人空间里的第一张卡；按选的场景启用插件；空白开始只有声明 `default_enabled` 的插件（Schedule）；助理提出的插件配置经本人确认后执行 |
| UPP-31 | 资料（materials，含 `material-original-files` 与 `material-attachments`）、成果库、过程项、终端、认可、事件、调度与**右栏讨论/IM（R21）**在个人空间与项目里一样可用；自写 Skill 按双层（个人全局 + 项目分区，R22）工作 |
| UPP-32 | Todo 提醒、Jelly 日程、Images 队列在休眠分区到点照常执行，只唤醒那个分区的那个插件（`S-partition-wake-scope`） |
| UPP-33 | 个人空间与各分区独立库能离线快照并恢复，恢复后推送记录与副本对得上 |
| UPP-34 | 同步写进休眠分区后，总览索引更新且不唤醒该分区的监督器；重建索引同样不唤醒 |
| UPP-35 | 归档项目不能作推送目标、不进总览；项目进回收站后原件侧显示「目标项目已删除」，恢复后回到正常 |
| UPP-36 | 批量推送逐件独立；引用的对象也推到同一项目时改指副本，否则去掉并在确认框列出 |
| UPP-37 | 「定时运行」「后台任务」两张跨项目清单只读总览：分区独立库插件写 `molis_overview_rows`，分区主库插件经 `services.overview` 同事务写 `plugin_overview_rows`，安装由平台盖章、只能改自己那份、只写声明的种类；休眠分区零唤醒；禁用、卸载、删分区后行随之消失；`home-aggregate.ts`、静息读数与 `home_aggregate` 标记不再存在（[V17](#main-overview-table)） |

<a id="14-要用户拍板一次列全"></a>

## 14. 决定与原始备选

下列 U、V 编号保留拍板时的依据。实际开发按正文合同与第 13 节验收。

<details>
<summary>查看立项时的备选方案与理由（U1～U13 均已决定）</summary>

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

</details>

### 14.1 拍板结果（用户 2026-11-22 弹窗）

| # | 结果 |
| --- | --- |
| U1 | A：搬到 `<Home>/personal-space/`，全仓只经 `partitionRoot()` |
| U2 | A：独立库放 `<分区根>/libraries/<库名>.db` |
| U3 | A：删分区主库业务表里的 `project_id` 列 |
| U4 | A：平台总览索引（扩展 `horizontal/search`），休眠分区不唤醒 |
| U5 | A：推送账本归 `horizontal/placement`，存个人空间主库并随个人空间同步 |
| U6 | **C：被覆盖的版本全部保留**，可逐版恢复；平台不自动淘汰，用户可手动删（7.2 已改） |
| U7 | **B：助理获准后可直接推**；追问后定为「按目标项目授权、可撤回、每次留记录并通知」；项目 Agent、外部 MCP 不能推；覆盖别人改过的副本与撤回删除仍要本人确认（6.2、`S-push-authority` 已改） |
| U8 | **B：所有有业务对象的插件一次做完推送声明**（C1 已改） |
| U9 | **终审覆写为纯平台**：Shelf 在 `44B` 剥离插件外衣收归纯平台 `modules/shelf`（`system.shelf`，`/api/platform/shelf`），全仓 `always_on = 0`、`dual_instance = 0`，免重写 ~3,150 行 Rust M5 协议（见[决定 66](../post-anticorruption-roadmap/reference/decisions.md#decision-66)） |
| U10 | **终审按 U13 统一**：`44B` 彻底删除旧 Alchemist 包、宿主接线、`home-stores.ts` 豁免与 `better-sqlite3` 例外；第 82 批按纯 UPP 场景插件从零重写 |
| U11 | A：空 Home 直接进个人空间，引导作为里面的第一张卡 |
| U12 | 按 V1 与决定 66 编为正式连续批号 `44B` + `106(A) → 107(B1) → 108(B2) → 109(B3) → 110(B4) → 111(C)`，每批一个 PR、批内子分支，全部排在 `91-2..4`/`91B`/`105`/`45`～`90`/`REL-4`/`SRV` 之前（第 12 节） |
| U13 | 用户另给：「旧的不管，可以清理，现在没有真实用户，清理干净，也不考虑迁移」。不写迁移脚本、不留兼容；真实 Home 在批 C 合入后清理重建（动手前告知时点） |

平民化 D5～D8 的结果记在[平民化需求书](../plugin-specials-demotion/spec.md)第 7 节；其中 D7 定为：平民化片 0（Characters 保留 id）现在单独做，平民化其余片作为 44B 在 #2239 合入后开工，本需求的 A→B→C 接在后面，REL-5 前全部合完。

### 14.2 复查追加的拍板（用户 2026-11-22 弹窗）

| # | 事项 | 结果 |
| --- | --- | --- |
| V1 | 分批会让 main 在两批之间变红 | 先加、后迁、再删；两批之间允许新旧两套代码短暂并存（不读旧数据），每波在同一 PR 里删掉无人用的旧机制（第 12 节） |
| V2 | 推送被打断时账本与副本不一致 | 不预记；先写副本（同事务写上游标记），再记账；打断后平台按上游标记补记账本，新例外 `S-push-ledger-repair`（7.3） |
| V3 | 被覆盖版本全部保留与云端配额 | 全部留在发生覆盖的设备，只同步每个副本最近一版（5.1、7.2） |
| V4 | 另一台设备上的插件启用 | 自动一致：本人账号下的启用清单记录直接照做；业务数据本身永不触发启用（5.1、`S-sync-enablement-own-choice`） |
| V5 | 云端旧同步数据 | 随真实 Home 重建一起清空本人账号的云同步空间（含开发/测试同步服务），动手前弹窗 |
| V6 | 初始启用哪些插件 | 用户原话：「后续应该有需求，根据用户选择场景自动初始化，不同场景可能不一样，确认一下，也可以支持助理来帮助配置开启的插件」。已核实：[onboarding-coverage](../onboarding-coverage/spec.md) §3.8／§3.8.1（ONB-50～56，官方场景包、助理推荐一到三套、新建项目与已有项目都能加场景）已有这项需求，采用路径在 [scene-and-page-contract](../scene-and-page-contract/spec.md) 第 7 节，项目插件成员的动作 `projects.plugins.set@1`（P-3a）尚未实现。本需求据此：不写默认名单，按场景初始化；把 P-3a 扩为 `partitions.plugins.set@1`（含个人空间）在批 A 落地，场景采用与助理配置共用；助理的配置以采用预览给本人确认（4.1） |
| V7 | 决定 66 当时的九个版本键复位回 v1 | （**2026-11-26 已由[决定 69](../post-anticorruption-roadmap/reference/decisions.md#decision-69) 取代**：开发前阶段全部持久化库与格式直接固定 v1，不再使用一次性复位白名单） |
| V8 | 与已排批次的重叠 | 44B 与本需求进路线书依赖、作 57 与 REL-5 前置；第 64 批个人视图并入 B2；第 57 批后移；#2254 照常合入作过渡 |

<a id="v7-databases"></a>

**V7 历史注记（已由[决定 69](../post-anticorruption-roadmap/reference/decisions.md#decision-69) 取代）。** 2026-11-26 起开发前阶段全仓持久化库与带版本文件一律固定为 v1、零 `upgrades` 升级段，不再维护一次性复位白名单或 `memory.db` 1→2 迁移；旧开发 Home 直接删掉干净重建。

### 14.3 合并终审后的补充拍板（用户 2026-11-23 弹窗）

| # | 事项 | 结果 |
| --- | --- | --- |
| V9 | 写入调度（谁在写、并行拷贝）跟 Git 怎么分 | 用户定：**整个搬进 Git 插件**；「开 Coding 时默认一起开 Git」——Coding 声明 Git 为随启用依赖（通用声明 `enable_with`） |
| V10 | 单独移除 Git、留着 Coding | 允许，确认框先写明影响（Coding 只能一次一个地改）；随时可加回 |
| V11 | 总览表达不了重复日程、优先级、标签，同步来的提醒会漏 | 插件维护平台定格式的「总览表」，到期提醒也从中取（6.1）；用户追加：**这些能力要写进插件开发 Skill、Manifest 说明与 SDK**，创作台照此生成 |
| V12 | 个人空间五个随手记入口 | 按 15.1 定分工；用户补：**右栏讨论 = 只有自己的群聊**，与项目讨论同一套逻辑 |
| V13 | 个人全局技能在项目里谁能用 | 用户定：**项目 AI 也能用**（R22） |
| V14 | 排期 | 用户定：**按现在的顺序**（44B、106～111 串行，下游等 111） |
| V16 | 插件叫什么名字（复查发现 SDK 强制所有插件用官方前缀，保留前缀会挡住全部非宿主插件） | 用户定：**别人用自己的名字**——外部插件用自己的反向域名（如 `com.acme.todo`），创作台生成的叫 `studio.<编号>`（从开始做就定下、发布后不变，作者靠签名证明，用户 11-23 定）；SDK `PLUGIN_ID` 放开为通用反向域名形式，`io.molis.work.` 只给宿主自己的包（V16），归 `44B-0` |
| V15 | 旧 Alchemist 在本机的旧数据 | 用户定：**44B 合入后就把开发机本机的旧 Alchemist 目录搬开（不删）**，其余真实数据仍等 111 之后；动手前再弹窗确认 |
| V17 | 「定时运行」「后台任务」两张跨项目清单怎么接总览（主库插件 U3 不迁库，原规格没有主库插件出摘要的设计） | 用户定（2026-11-26 弹窗）：**108 批做主库摘要表**——每个分区主库一张平台管、平台盖章写入方的摘要表，主库插件同事务写；总览种类加 `scheduled_run`、`background_task`；108 删 `home-aggregate.ts` 与静息读数（[6.1 主库摘要表](#main-overview-table)） |
| V18 | 评审后四问（第 108 批，用户 2026-11-26 弹窗） | **G4 改成按比例断言**（`ownerResolutions` 按每分区每总览插件计，其余计数仍常数）；**Todo「所有项目」视图接受缺口、等 `64-3`**；**S-71 已绑定安装槽对工作流放行，保持现状**；**Cognia 目录授权照规格迁进本人设置**（实施：每分区插件的目录授权改为本人级，留在平台目录授权库、项目为空、各分区可读，见批次 108 的「用户拍板与实施记录」）；**撤权后会话历史里已交出的总览结果记为偏离**（用户 2026-11-27，等 Prologue 上游，见 BL-overview-revoke-model-context） |

## 15. 使用场景走查

每个场景写清：用户做什么 → 看到什么 → 背后哪条规则。走查补出的 R1～R20 与前面各节同等有效（「写进」列是它所属的章节），验收见 UPP-30～36 与各相关 UPP。

### 15.1 个人空间与项目怎么分工（给用户的心智模型）

| 放在 | 适合放什么 | 谁能看到 | 例子 |
| --- | --- | --- | --- |
| 个人空间 | 只跟你自己有关、跨项目用的东西；还没想好放哪的东西 | 只有你（和你授权的本机助理） | 个人待办与日程、读书笔记、草稿、个人知识库、问题反馈 |
| 项目 | 为一件事、一个交付、（以后）一个团队服务的东西 | 项目成员与项目 AI | 项目文档、目标、代码、数据表、评审 |
| Shelf | 临时中转：随手存、拖到别处 | 只有你 | 剪下来的一段话、一张图 |

个人空间里五个「随手记」的地方，各管一件事（V12，界面定样照此安排，每处入口旁一句话说明用途）：

| 地方 | 管什么 | 一句话 |
| --- | --- | --- |
| Shelf | 临时中转，等着拖到别处 | 「先放这，待会儿用」 |
| 右栏讨论 | **只有你自己的群聊**：和项目里的讨论是同一套 IM，只是成员只有你（以后可以拉助理进来）；想法流水，可以之后整理成笔记、待办或文档 | 「跟自己说一声」 |
| Jelly | 要留着的笔记与日程 | 「记下来、以后要看」 |
| Todo（含「记到个人空间」） | 要去做的事 | 「这件事要做」 |
| 个人助理 | 让它帮你做事 | 「帮我做」 |

一句话：**东西先写在个人空间，要交给项目时推送；项目里的东西是项目的。**

### 15.2 场景

| # | 场景 | 用户看到 | 规则 |
| --- | --- | --- | --- |
| S1 | 第一次打开 | 直接进个人空间；第一张卡是引导（一问一答）：说出想做什么或挑一张官方场景卡，助理推荐一到三套场景，采用后个人空间按场景开好插件；也可以空白开始 | U11、V6；R1 |
| S2 | 新建项目 | 新建时同样可以挑场景或让助理推荐（场景决定开哪些插件与初始内容），或空白开始；建好后随时添加，也可以让助理「帮我把这个项目配好」——助理给出要加、要去的插件，你确认后执行 | R1、R2 |
| S3 | 在项目里想用某插件但没开 | 插件切换器里「添加到这个项目」；添加只在本项目生效，不影响其他项目和个人空间 | C4 |
| S4 | 在项目里移除插件 | 确认框写「数据会保留，重新添加就回来」，另给「同时删除这个项目里它的数据」（列出条数与占用，需再次确认） | C4；R3 |
| S5 | 卸载插件包（Home 层） | 确认框列出「在个人空间和 N 个项目里启用着」；卸载后各分区都停用，数据保留；另给「同时删除所有分区里它的数据」 | R4 |
| S6 | 插件升级 | 包升级一次；每个分区的库在该分区下次打开时升级（休眠项目不被唤醒）；推送到尚未升级的分区前先升级它 | R5 |
| S7 | 个人空间里写好文档，推给项目 | 原件上「推送到项目…」→ 选项目（多选）→ 确认框写清：会在哪些项目新建副本、哪些要先启用插件、哪些引用会被去掉 → 完成后原件显示「已推送到 2 个项目」 | §7；R6 |
| S8 | 一次推一批（整个文件夹、多份文档） | 多选后推送，一次确认；每件一条记录，任一件失败不影响其他件，结果逐件列出 | R7 |
| S9 | 推送的东西互相引用（PPT 引用 Pages 大纲、文档里链着数据表） | 引用的对象若也推到了同一个项目，引用自动改指项目里的副本；没推的引用去掉并在确认框列出 | R8 |
| S10 | 原件改了，想更新项目副本 | 原件显示「有 1 个项目的副本比这里旧」；点「更新副本」；没人动过直接更新，有人动过先问 | §7.4 |
| S11 | 项目里有人改了副本 | 副本显示「已在项目里修改」；你再推时弹窗：覆盖（旧版留在副本历史）或另存为新条目 | §7.4、U6 |
| S12 | 项目里的人只想看来源 | 副本显示「来自个人空间 · v3」，不显示你个人空间的条目标题与 id；（以后的团队里）只显示「来自 某某 的个人空间」 | R9 |
| S13 | 原件删了 | 副本留着，显示「原件已删除」，变成项目自己的条目 | §7.4 |
| S14 | 项目删了 / 进回收站 | 原件上对应那条记录显示「目标项目已删除」；项目从回收站恢复后记录恢复 | R10 |
| S15 | 原件从个人空间移到某项目（不是推送） | 移动前提示「这份有 2 个项目副本，移走后它们与原件断开」；移动后所有记录变 `detached` | R11 |
| S16 | 项目里的好东西想留给自己 | 「另存到个人空间」：生成一份新的个人原件，不会反过来覆盖项目 | C9 |
| S17 | 项目之间 | 只能一次性复制或移动，不建更新关系 | C9 |
| S18 | 整项目复制、用项目做模板 | 复制出的项目里，来自推送的副本都变成普通条目（不继承推送记录） | R12 |
| S19 | 在个人空间看「我所有的待办／日程／通知」 | 总览列出个人空间和各项目的条目，标明在哪；点一条进那个分区；休眠项目不启动 | §6.1；R13 |
| S20 | 在项目里随手记一条给自己的待办 | 两种：记在本项目（项目 Todo，需项目开着 Todo）；或「记到个人空间」（快捷入口，不切换页面） | R14 |
| S21 | 助理在哪个上下文 | 你在哪个分区，助理就在哪个分区干活；要碰别的分区（含推送）按授权；跨项目总览只读[本人授权的项目和摘要字段](#overview-readers)；「记住我的偏好」这类本人记忆跟人走 | R15 |
| S22 | ⌘K 搜索 | 在项目里默认「本项目与个人空间」，在个人空间里默认「全部」；每条结果标所在分区 | §6.3 |
| S23 | 外部 AI 工具（MCP）接入 | 绑定时选分区；个人空间要单独勾选并确认；只能碰绑定的分区 | S-144 |
| S24 | 换一台电脑 | 登录同一账号：分区、插件启用、偏好、连接名称都在；连接要在这台电脑重新授权；没装的插件提示安装 | §5.1 |
| S25 | 两台电脑同时推同一份 | 同一原件推同一项目只会有一个副本（推送记录的编号由原件与目标决定，两台算出同一个）；后到的一次按「更新副本」处理 | R16 |
| S31 | 推送中途断电或被取消 | 要么什么都没发生，要么副本已在、重启后原件上的推送记录自动补上；不会出现两份 | §7.3、V2 |
| S32 | 你另一台电脑上开了插件 | 这台同步后自动开上；没装的提示安装 | V4 |
| S33 | 到点的提醒 | 休眠项目里的待办提醒、日程到点照常弹，只唤醒那一个插件 | §4.1 |
| S26 | 离线时推送 | 本机项目照常完成；同步恢复后副本随项目同步 | §7.3 |
| S27 | （以后）把项目共享给团队 | 只共享这个项目分区；你的个人空间、本人设置、连接都不跟过去；成员也可以从他们自己的个人空间推到这个项目 | R17 |
| S28 | 项目归档 | 归档的项目不进总览、不收推送（确认框里置灰）；取消归档恢复 | R18 |
| S29 | 看占用、清理 | 设置里按分区、按插件列占用（含被覆盖的旧版本）；可逐项清理 | R19 |
| S30 | 备份与恢复 | 离线快照按分区打包；恢复后推送记录与副本对得上 | R20 |

### 15.3 由走查补出的规则

| # | 规则 | 写进 |
| --- | --- | --- |
| R1 | 初始启用按场景（V6）：平台不写默认名单；场景采用与助理配置都调 `partitions.plugins.set@1`，助理的改动以采用预览给本人确认；空白开始只有声明 `default_enabled` 的插件（Shelf 已是平台部件，不算插件） | §4.1 |
| R2 | 场景包只是「启用这些插件 + 放这些初始内容 + 这些设置」，走 onboarding-coverage §3.8 与 scene-and-page-contract 的同一条采用路径，不是新机制；已有项目也能「加一个场景」 | §4.1 |
| R3 | 移除插件默认保留数据；「同时删除数据」单独确认，走插件声明的分区数据清理；推送到该分区的副本随之删除时，原件侧记录变 `target_removed` | §4.1、§7.2 |
| R4 | 卸载包 = 所有分区停用 + 数据保留；「删除所有数据」逐分区清理；卸载后再装，各分区的启用关系不自动恢复（列出「之前在这些分区启用过」让本人勾选） | §4.2 |
| R5 | 分区库升级按分区懒执行（打开时）；推送、总览投影写入前若目标分区未升级，先升级（只开该分区、不起整套监督器）；投影结构变了就重建总览索引 | §5、§6.1 |
| R6 | 推送确认框必须列：目标项目、要先启用的插件、会被去掉的引用、会覆盖的副本 | §6.4 |
| R7 | 批量推送是 N 个独立操作一次确认；结果逐件 | §7.3 |
| R8 | 引用改指：快照里指向「已推到同一目标项目的对象」的引用，平台按推送记录改写成目标 id；其余按 `local_refs` 剥离。插件在 `local_refs` 里给每个引用标 `remap`（可改指）或 `strip` | §7.1 |
| R9 | 副本侧的上游标记只存版本号与时间，不存原件标题与 id 的明文；原件 id 只在推送人的个人空间账本里 | §7.2 |
| R10 | 推送记录加状态 `target_deleted`；项目恢复则回 `active`；项目永久删除则记录保留为历史 | §7.2 |
| R11 | 原件被移出个人空间时，它的推送记录全部 `detached` | §7.4 |
| R12 | 整项目复制不复制 `push_upstream`；复制出的条目没有上游 | §7.2 |
| R13 | 总览包括通知与待处理（Attention）的投影，个人空间的「通知」看得到各项目的提醒而不唤醒项目 | §6.1 |
| R14 | 「记到个人空间」是平台快捷入口，调用个人空间分区里该插件的创建动作（个人空间未启用则提示启用）；不是 Home 插件，也不是推送 | §6 |
| R15 | 助理的工作上下文 = 当前分区；本人记忆（偏好、习惯）是本人级、跨分区；分区记忆（项目事实）留在分区；记忆合同里把今天的 `project_id: null` 拆清这两种 | §9.2 |
| R16 | `push_id` 由 `(space_id, plugin_id, kind, source_id, target_project_id)` 确定性派生，`target_id`、`op_id` 由它派生；两台设备并发产生同一记录，同步合并时按版本取后者为一次「更新」 | §7.2、§7.3（已写入） |
| R17 | 团队共享（SRV-6）只共享项目分区；推送是「每人一颗星」：每人的账本在自己的个人空间 | §5.1 |
| R18 | 归档的项目不进总览索引、不能作推送目标 | §6.1、§7 |
| R19 | 设置里有按分区、按插件的占用页；被覆盖的版本可在副本历史里删 | §6.4 |
| R20 | 离线快照与恢复按分区枚举（`listPartitions`），个人空间必在其中 | §4.1 |
| R21 | 个人空间保留右栏「讨论 / IM」：它就是成员只有本人的群聊，与项目讨论同一套 IM 逻辑，不另做「自对话」特例（V12） | §4.1、§15.1 |
| R22 | 自写 Skill（`my-skills`）保持双层：个人全局技能（Home 层，全分区可用；个人空间直接读写，不另建第二套）+ 项目专属分区技能。**项目 AI 也能用你的个人全局技能**（V13，用户定）；以后项目共享给别人时，项目 AI 替别人做事也可能用到它们——第 SRV-6 批（团队）落地前要在共享确认里写明「项目 AI 会用到你的个人技能」 | §4.1 |

## 16. 修订记录

- 2026-11-24 第 106 批实施中用户拍板（[实施记录](../post-anticorruption-roadmap/reference/batches/106.md#batch-106-record)）：市场八类；V7 一次全复位；G3 先上路径半；R13 的 Attention 投影随 108；三个新 Home 库的金样覆盖等写入方那一批补。
- 2026-11-24 本人明确个人助理的跨项目摘要读取需逐项目、字段显式授权，撤权立即生效。同步澄清推送重试与中断补账、V7 名单、第 37 批首页及各批作者手册责任。
- 终审的历史快照：当时对照 `5bfd52b87b`，#2239、#2250、#2253～#2258、#2260 在审，#2245、#2252、#2259 已合入。U、V 决定的原始选项和批次顺序保留在第 14 节及决定 66。

- 2026-11-22 初稿；同日 U1～U13 拍板；补 5.1 同步规则。
- 2026-11-22 复查修订（两路独立只读复查 + 使用场景走查）：V1～V8、R1～R20、UPP-21～36。
- 2026-11-22 合并终审修订（对齐 `origin/main` `5bfd52b87b`、在途 `#2239`/`#2245`/`#2250`/`#2252`～`#2260` 与路线书决定 66）：
  - Shelf 终审覆写为纯平台 `modules/shelf`（`system.shelf`，`44B` 完成），`always_on = 0`、`dual_instance = 0`、免重写 ~3,150 行 Rust M5 协议；
  - 删除已于 `#2243` 退役的 `text-stats`，内置平等插件校准为 **20 个**；Alchemist 与 D5 按 U13 统一为彻底 Clean v1；
  - 补全 Platform Blob Handle >256 KiB 分片推送、CAS 附件对副本与全部 `push_superseded` 持有保护、`material-original-files`/`material-attachments` 分区化、`horizontal/person-settings` 复用 `#2231` 同步流、`overview_projection` 纯标识符防注入校验与 `95-3` 7 天漏跑保留、`projects.workspace.writers.*` 随 D6=B 迁入 `plugins/native/git` 与 `S-git-plugin-command-scope`、保留第 99 批 `#2244` `install_id` 隔离、`R21` 个人空间保留 IM、`R22` 双层自写 Skill；
  - 正式编入路线书批号 **`44B` + `106`～`111`**，并同步优化全仓下游批次、现役原需求书与 Backlog。
- 2026-11-23 补充拍板 V9～V15（14.3）：Git 随 Coding 随启用、可单独移除；总览改为插件维护的平台定格式总览表、到期提醒从中取、写法进插件开发文档；五个随手记入口分工、右栏讨论即只有自己的群聊；项目 AI 可用个人全局技能；排期照旧；44B 后搬开本机旧 Alchemist 目录。另补插件自有文件的推送与大快照句柄 `S-push-blob-handle`，清理 Shelf 归平台后残留的「白名单 Shelf」与插件数量旧说法。
- 2026-11-23 合并前复查（独立只读评审 + 代码核对）：Coding 对 Git 全部改随启用依赖；`project_rows`/`artifact_join` 与 `scope:"home"`/`outsideBuild` 链的删除后移到 `109`；补 `S-reserved-host-prefix`、`S-push-blob-handle` 两行；漏派项归批；用户再定 V16（插件命名放开）。
