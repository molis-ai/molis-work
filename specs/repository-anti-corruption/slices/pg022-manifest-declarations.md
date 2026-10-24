# PG-022 / PG-102 / PG-103 / PG-104：宿主条目上的声明搬进 Manifest

状态：设计待统筹审（2026-10-23，防腐线 ac-sandbox-sched 片）；P1（Home 库）已在本地分支 `claude/ac-pg022-manifest-declarations` 实现并过相关测试，未推送、PR 排在 §8 列的在途 PR 合入之后；P2、P3 只有设计，审定前不写代码。代码按 main `abc052bcb` 核过。

## 1. 现状

一项服务只能写在宿主的可信启动条目上，Manifest 写不了，沙箱插件拿不到（privileges.md「宿主条目独有的服务」一组）。六项声明，代码里是四种形状：

| 声明 | 现在写在哪 | 谁用 | 检查在哪 |
| --- | --- | --- | --- |
| Home 库 `database`（`HomePluginDatabaseDeclaration`，可带 `partition: "project"`） | 项目级插件：`apps/local-host/src/project-plugins.ts` 条目 6 个（dataset、form、lingguang、pages、ppt、workflows）；Home 级插件：`registration.runtime.database` 5 个（cognia、images、issues、jelly、todo） | `services.database` | `plugin-database-entries.ts` 的 `assertDatabaseEntries`（库名、登记、基线、分区、权限）；宿主 `plugin-entry-identity.ts` 按**定义对象**记住（`WeakMap`），别的定义对象即使同 `plugin_id` 也拿不到 |
| 私有文件 `files`（`PluginFilesDeclaration`） | 条目 `files`（Images 一个） | `services.files` | `plugin-files-entries.ts` |
| 主人文件 `owner_files` + 钩子 `initialize_owner_files` | 条目（现在生产里没有使用者，Shelf 将用） | `services.ownerFiles` | `plugin-owner-files-entries.ts` |
| 模型设置 `model_configuration`、生图 `image_generation` | 条目（Jelly 模型设置；Images 生图） | `services.model.configuration`、`services.imageGeneration` | `model-configuration-entries.ts`、`plugin-image-generation-entries.ts` |

Home 的存储登记（`home-stores.ts`，`uninstall --purge-user-data` 靠它清）里，插件的库另从两处拼出来：目录条目的 `home_store`（含 `library` 基线）和 `runtime.database`。同一个库的基线因此写了两遍：声明一遍，登记里一遍，`assertDatabaseEntries` 再比一遍。

项目库那一半已经走 Manifest（`databases.project`，PG-020，#867）：声明在 Manifest、SDK 查形状、账本记发布者、平台按声明建表。本稿让 Home 库、文件、模型设置、生图走同一条路。

## 2. 规则（四项共用）

1. **声明只有一个地方：Manifest。** 宿主的启动名单与目录条目不再带 `database`、`files`、`owner_files`、`model_configuration`、`image_generation`、`initialize_owner_files`。条目和 Manifest 不会同时有，也就没有两份要对齐。
2. **给不给服务，由三样东西一起决定**：Manifest 声明了、安装时人批准了对应权限（`context.requireGrant`，现有）、这项资源在宿主一侧登记在这个插件名下（Home 的存储登记，同基线）。缺一样，启动被拒，**带码的错误**，不是静默没有这项服务。
3. **登记不由插件写。** 存储登记仍是宿主的一张表：内置插件的从目录条目的 Manifest 推出（`home_store` 不再写 `library`，库名和基线就是 `databases.home`），其他插件的登记在 P1b（见 §6 Q1）。没有登记的库，任何 Manifest 都开不出来；别人登记的库名，声明了也被拒。
4. **沙箱插件**一样在 Manifest 声明；broker 方法在 PG-017 的 BL-490/491 加，两道门（合同 `effects` ∩ 批准的 `grants`，再加宿主服务自己的检查）照 PG-017 设计的第 2 条，到那时宿主一侧的 `execution === "sandbox"` 拒绝才去掉。P1 里沙箱定义声明 `databases.home` 仍被拒：在名单上被 `assertDatabaseEntries` 拒，不在名单上被 `homeLibraryFor` 拒。

## 3. 分期

| 期 | 内容 | 依赖 |
| --- | --- | --- |
| **P1** Home 库（PG-022） | `databases.home`；五个 Home 级和六个项目级插件的声明搬进各自 Manifest；`runtime.database` 与条目 `database` 删除；存储登记从 Manifest 推；PLIB-11 | 无 |
| P1b Home 库的发布者账本与非内置插件 | 登记从已安装插件的 Manifest 推；首次打开记发布者，换了就拒（D23 第 6 条） | P1；Q1 |
| **P2** 文件合成一套（PG-102 文件一半、PG-103、PG-104） | `files` 并进 `owner_files` 的授权口径；Manifest 声明（配额）；删 `initialize_owner_files`，初始文件改成 Manifest 里的种子；Images 迁移，项目执行器的 files 按项目分区、删项目时清 | P1 的登记推导；Q2 |
| **P3** 模型设置与生图（PG-102 余下） | `model_configuration`、`image_generation` 搬进 Manifest | P1；Q3 |

每期一个 PR。P1 是后几期的前提（登记推导、条目检查改读 Manifest 的那一段代码），所以先做。

## 4. P1 设计与实现

### 4.1 合同与 SDK

- `PluginManifestDatabases` 增 `home?: HomePluginDatabaseDeclaration`。`partition` 只许写在 `home` 上（项目库本来就在项目里）。
- 合同注释里「只归宿主条目，不归 Manifest」「2026-10-18 改」的话改成现行写法（privileges.md §7 第 7 条）。
- `PluginRegistration.runtime` 去掉 `database`；`PluginPlatformEntry`、`PluginOwnerFilesEntry`、`PluginProjectCleanupEntry`、Home 条目去掉 `database`。
- SDK `databaseDeclarationProblems`：认 `project` 与 `home`；`home` 比 `project` 多一个可选 `partition`（只许 `"project"`）；其余规则同（名字、版本、`schema` 非空白、两个权限在 `permissions` 里）。
- 因为是合同改动：`pnpm api:update`，PR 里写对调用方的影响（外部作者新增了一个可选字段；条目那边没有外部调用方）。

### 4.2 宿主

- `plugin-entry-identity.ts`：`databases` 的 `WeakMap` 换成「名单上列出的定义对象」的 `WeakSet`；`databaseFor(definition)` 对名单上的定义返回它自己 Manifest 的 `databases.home`，对其他定义返回空。这还是原来「按定义对象记」那道防线：没有它，任何装进来的插件拿一个内置插件的 `plugin_id` 与基线写同样的 `databases.home` 就能开别人的库。
- `plugin-database-entries.ts`：`assertDatabaseEntries(entries, home, scope)` 改读 `definition.manifest.databases?.home`。检查项不变（库名、Home 在、登记在、主人是它、基线相同、分区一致、同名不重复、两个权限在 Manifest 里、沙箱定义拒绝）。新增 `homeLibraryFor(definition, given)`：Manifest 没声明就不给；声明了而名单没给它（`given` 为空），以 `plugin.declaration_invalid` 拒绝启动，不是静默没有这项服务。
- 执行器（项目的 `openDeclaredLibrary`、Home 的 `HomePluginExecutor`）：库 = `homeLibraryFor(definition, options.databaseFor(definition))`。
- 为什么拒绝码只在 `homeLibraryFor` 上观察得到：Runtime 把启动失败统一报成 `plugin.executor_failed`，原因只落在日志里，所以测试直接问这条规则（`homeLibraryFor` 从宿主入口导出，仅此一处是测试缝）。
- `home-stores.ts`：插件的库登记从 `entry.manifest.databases?.home` 推，替掉 `entry.runtime?.database` 和 `home_store.library` 两处；`home_store` 只留路径（`{ path }`），库的基线不再写第二遍。
- `plugin-project-cleanup.ts`、`project-deleted-owners.ts`：读 Manifest 的 `databases.home.partition`（后者只对 Home 级的 `runtime` 条目算分区）。
- 十一个插件：`databases: { home: X_DATABASE }` 加进各自 Manifest（常量原样不动，`verify-release-versions.mjs` 认得它们），从 `registration.ts` 与 `project-plugins.ts` 删 `database`、`home_store` 里的 `library`。

### 4.3 不改的

- 库的名字、版本、`schema`、权限、分区、路径、迁移——声明的**内容**一个字不变，只搬位置。
- 项目库（`databases.project`）、账本、`openPluginDatabase` 与分区库的开库代码。
- 真实 Home 的数据：库的位置、文件、版本都不变，没有维护。

## 5. P2、P3 轮廓（审定前不写代码）

**P2 文件（PG-102 文件一半、PG-103、PG-104）**

- Manifest 增 `files`：一份声明（`store_name`、目录、`max_file_bytes`、读写权限），合并 `PluginFilesDeclaration` 与 `PluginOwnerFilesDeclaration` 的共同部分；不再有两套服务（§4 n：以 `ownerFiles` 的授权为准，写入只认当前动作的作用域，不接受插件自己拼的 control）。`services.files` 改为委托给同一份实现，Images 随之迁移。
- 删 `initialize_owner_files`：初始文件改成 Manifest 里声明的种子（名字、字节上限、内容用 base64 或引用包内文件），平台在首次启动按种子建，已存在不覆盖；插件也可以在 `start` 里自己写。没有生产里的使用者，所以不涉及存量。
- PG-104 同一片补：项目执行器的 `files` 现在落在 Home 存储、不按项目分区、删项目时不清——声明里加 `partition: "project"` 选项，登记和删项目清理按它走；S-18 的写法比代码严的地方对齐代码（以 S-18 为准）；新建文件和目录的权限位（0o644、0o755、0o555）收紧到只有本用户可读写（V-30）。
- `ownerFiles` 的 `rootPath()` 与 `write(run)` 回调不能变成 JSON，所以沙箱仍不给（PG-017 §3.6）；沙箱存文件走字节接口的 `files`（BL-491）。

**P3 模型设置与生图（PG-102 余下）**

- Manifest 增 `model_configuration`（偏好存放、自定义提供方、读与存两个动作）和 `image_generation`（动作与权限）；形状取自现有 `PluginModelConfigurationDeclaration`、`PluginImageGenerationDeclaration`，宿主两处条目检查改读 Manifest，权限要安装时批准。
- 这两项会把宿主的模型凭据引用交给插件的服务对象（不是明文），所以动作作用域与花钱的口径照 `services.model`：只在本插件自己的并发动作里调用。

## 6. 要统筹定的

- **Q1 非内置插件的 Home 库（P1b）什么时候做？** 推荐：P1 合入后紧接着做，不等沙箱。做法：登记从已安装插件的 Manifest 推出（卸载并清理用户数据时才清得到），首次打开在库文件里记一张账本表（`plugin_id`、发布者签名、版本、基线哈希），换了发布者、版本或形状就拒，这与项目库账本同一种规则。P1 先把「只有内置定义」写成带码的拒绝，不留静默缺席。
- **Q2 文件合成一套，`services.files` 保留名字还是删掉？** 推荐：保留名字，作为 `ownerFiles` 的薄委托，Images 不改调用，只改声明。理由：一次改一处；调用方改名另算一片。
- **Q3 `model_configuration` 与 `image_generation` 要不要等 PG-017 的模型 broker 方法？** 推荐：不等。声明搬位置与沙箱拿服务是两件事（PG-017 §3.7）。
- **Q4 拆几个 PR？** 推荐 P1、P2、P3 各一个，P1b 单独一个。P1 改动面大（十一个插件的 Manifest、十来个测试夹具）但都是搬位置，没有行为改动。
- **Q5 验收编号。** 本稿先用 `PG022-NN`（P1）；若统筹要 `RAC-NNN` 号段请给，我改。PLIB-11 由本稿的测试证明。

## 7. 验收（P1）

| 编号 | 断言 | 测试 |
| --- | --- | --- |
| PG022-01 | Manifest 的 `databases.home` 形状逐条拒绝：名字、版本、`schema`、权限不在 `permissions`、不认的字段、`partition` 不是 `"project"`；`databases.project` 带 `partition` 被拒 | `tests/plugin-project-database-ledger.test.ts` |
| PG022-02 | 十一个内置插件的库都在 Manifest 的 `databases.home`；启动名单、目录条目与入口类型上不再有 `database`；读写同原来一样 | `tests/home-library-declaration.test.ts`、`tests/home-plugin-platform.test.ts`、`tests/dataset-promote-authority.test.ts` |
| PG022-03 | 存储登记的插件库全部从 Manifest 推出，与迁移前逐项相同（路径、主人、基线、分区），目录条目的 `home_store` 不再带 `library` | `tests/plugin-project-database.test.ts` |
| PG022-04 | 拒绝：声明了库名但登记在别人名下、基线与登记不同、分区与登记不同、登记里没有这个库、Home 里别的条目名（`feed`、`config`）、沙箱定义、没有 Home 的平台——都拒绝启动，一个库都不建 | `tests/plugin-project-database.test.ts`、`tests/plugin-database-partition.test.ts`（PART-01） |
| PG022-05 | 不在宿主启动名单上的定义（装进来的、带着内置插件的 `plugin_id` 与同样的 `databases.home`）被拒，码 `plugin.declaration_invalid`，什么都没运行，打不开别人的库 | `tests/plugin-project-database.test.ts` |
| PG022-06 | 分区库的 `project_data` 清理仍成立（读 Manifest 的 `partition`）；删项目时库被清 | `tests/plugin-database-partition.test.ts`（PART-03）、`tests/plugin-database-partition-deletion.test.ts` |
| PLIB-11 | Home 库的声明只在 Manifest 的 `databases.home`，可信条目上不再有 `database:` | `tests/home-library-declaration.test.ts`（读源码断言条目类型没有 `database`） |

## 8. 开工前核对（2026-10-23，`gh pr list` 的文件清单）

P1 动到的文件里，在途 PR 也动的：

- #1147（PG-051 P2b）：`plugin-registration.ts` 与十个插件的 `registration.ts`（删 `runtime.database`、`home_store.library` 的行在同一个文件里，行不同，合并时手工并）。
- #1098（W5-06 视图声明）：十个插件的 `manifest.ts`（本片在每份 Manifest 加一行 `databases`）。#1112：lingguang、pages、workflows 的 `manifest.ts`。
- #1139（PG-017 P0）：`home-plugin-executor.ts`、`plugin-host-services.ts`（本片改 `openDeclaredLibrary` 与 `databaseFor` 一带）。#1119：`plugin-host-services.ts`、`plugin-database.ts`（合同注释）。#1138：`home-plugin-executor.ts`、`home-stores.ts`、`plugin-executor.ts`。#1130：`home-stores.ts`、`project-deleted-owners.ts`。#1107：`project-plugins.ts`。#1129、#1132、#1137：Todo、Issues 的 `registration.ts`。

所以 P1 排在这些合入之后开 PR，开之前先合 main 解冲突；写代码可以现在做，因为冲突都在单行搬位置的地方。
