# PG-022 / PG-102 / PG-103 / PG-104：宿主条目上的声明搬进 Manifest

状态：统筹已裁（2026-10-24，见 §6「统筹 10-24 裁」）；P1（Home 库）已在分支 `claude/ac-pg022-manifest-declarations` 实现并过相关测试，已推送，PR 排在 §8 列的在途 PR 和本线 #1119、#1139 合入之后；顺序 P1 → P1b → P2 → P3；P2 拆成 P2a（`owner_files` 进 Manifest，已在同一分支实现）和 P2b（`files` 合并、Images 迁移、删 `initialize_owner_files`，等 R1～R3 的裁定）；P1b 等统筹答 A/B；P3 还没写代码。代码按 main `abc052bcb` 核过。

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
- 为什么拒绝码只在 `homeLibraryFor` 上观察得到：Runtime 的 `start` 把启动失败对外报成 `plugin.executor_failed`，但安装记录的 `last_error_code` 存的是拒绝本身的码；测试走 #1139 的路：装一个不在名单上的定义、启动、读 `platform.runtime.get(install_id).last_error_code`，不给宿主入口加测试缝（统筹 10-24 裁）。
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

### 5.1 P2 开工后查到的（2026-10-24）

开工前核对（§8）没看到、写代码时才露出来的三件事，和审定稿的假设不符：

1. **`initialize_owner_files` 有生产使用者：Shelf**（`initializeShelfFiles`，`modules/shelf/src/store.ts`）往新架子里放「试用示例.pdf」并写 `catalog.json`。`catalog.json` 里是条目 id、哈希、时间，静态的 Manifest 种子（路径加字节）写不出来。
2. **Images 的 `files` 读写权限都是 `storage:private`**，而 ownerFiles 要求调用它的**动作**自己声明文件权限（`owner-files-service.ts` 的 `scope.definition.action.permissions.includes(permission)`）。Images 的动作带的是 `images:read`、`images:generate`、`images:delete`，所以直接迁移过去，写文件的动作都被拒。
3. **Images 在 `start` 里恢复**（`ImagesService.recover` 列出并删除没人引用的图片文件）。start 里没有动作作用域，而 ownerFiles 在动作之外一律拒绝。

待统筹裁（推荐在前，已发给统筹）：

- **R1 动作之外怎么办（管 1 和 3）。** 推荐：ownerFiles 在动作之外（`start`、定时器）也开，条件是安装的现行授权覆盖 `storage:private` 与文件权限，这是其他服务（`assertPluginActionCurrent`）一贯的规矩；动作里不变；不再有 `control` 参数。这样 Shelf 在自己的 `start` 里放示例，Images 在自己的 `start` 里回收，钩子删掉。另一条路是写仍只在动作里：Shelf 在第一个动作里才放示例，Images 把回收挪进 `jobs.start`，两者都改行为。
- **R2 Images 的权限（管 2）。** 推荐：加一项 Images 权限 `images:files:write`（Manifest 里，可选），加进 `images.jobs.start`（版本 2→3）与 `images.jobs.delete`（1→2）；读用每个读动作本来就有的 `images:read`。这改两个动作合同：动作快照、升版本、MCP 客户端要重新授权。另一条是只对 Images 去掉「动作要声明文件权限」这一检查，我不想自己削弱 S-15。
- **R3 名字。** 留 `ownerFiles` / Manifest `owner_files`，删 `files`：GLOSSARY 里没有这个词，文档已把另一套叫「旧 files」，所有 S 行和测试已经叫 owner files。要改叫 `files` 是机械改名。

我自己定的两点：

- 项目插件的 Manifest 声明了 `owner_files`：除非它是 Home 那一半的双实例的项目一半（与 Home 一半共用 Manifest，不拿服务），一律以 `plugin.declaration_invalid` 拒绝启动。这也关掉了 PG-104 说的「项目执行器的 files 不按项目分区」：项目实例拿不到文件，就无从谈分区；真要给项目实例分区的文件是以后的功能，要先定。
- 文件根可以和同一个插件自己的库共用（Images 的 `images.db` 与 `assets/` 都在 `images` 下），条目决定服务能碰哪些，不然 Images 要搬真实 Home 里已有的图片。到 P2b 才用得上，现在 `assertOwnerFilesEntries` 仍拒绝共根。

P2a（已做）：`PluginManifest.owner_files`（SDK `ownerFilesDeclarationProblems` 查形状）；`plugin-owner-files-entries.ts` 的 `assertOwnerFilesEntries` 读 Manifest，`ownerFilesGiven` 对「声明了却不在名单上」以 `plugin.declaration_invalid` 拒绝；条目与 `PluginRegistration.runtime` 去掉 `owner_files`；Shelf 把 `SHELF_OWNER_FILES` 搬进 `owner-files.ts` 并写进自己的 Manifest；`setAccess` 的权限位收紧（V-30）。`initialize_owner_files` 和旧 `files` 还在，等 R1～R3。

## 6. 要统筹定的

- **Q1 非内置插件的 Home 库（P1b）什么时候做？** 推荐：P1 合入后紧接着做，不等沙箱。做法：登记从已安装插件的 Manifest 推出（卸载并清理用户数据时才清得到），首次打开在库文件里记一张账本表（`plugin_id`、发布者签名、版本、基线哈希），换了发布者、版本或形状就拒，这与项目库账本同一种规则。P1 先把「只有内置定义」写成带码的拒绝，不留静默缺席。
- **Q2 文件合成一套，`services.files` 保留名字还是删掉？** 原推荐：保留名字作薄委托。**统筹 10-24 裁推翻：不留第二个名字、不做薄委托**，见下。
- **Q3 `model_configuration` 与 `image_generation` 要不要等 PG-017 的模型 broker 方法？** 推荐：不等。声明搬位置与沙箱拿服务是两件事（PG-017 §3.7）。
- **Q4 拆几个 PR？** 推荐 P1、P2、P3 各一个，P1b 单独一个。P1 改动面大（十一个插件的 Manifest、十来个测试夹具）但都是搬位置，没有行为改动。
- **Q5 验收编号。** 已改成 RAC-300～305（本线号段 RAC-300～329、BL-525～534）。PLIB-11 由本稿的测试证明。

### 统筹 10-24 裁

- 推送：`claude/ac-pg022-manifest-declarations` 和此后每个本地分支都推到远端；PR 暂不开，等本线 #1119、#1139 合入。
- 号段：本线用 RAC-300～329、BL-525～534；PG022-NN 已改成 RAC-300～305；要 S 号先问统筹。
- `homeLibraryFor` 不从宿主入口导出。拒绝启动要落到安装记录的 `last_error_code`，码是它自己的 `plugin.declaration_invalid`，不被压成 `plugin.executor_failed`（#1139 对 `sandbox.service_not_given` 已是这样）；Runtime 若压平，在本 PR 里修传递。RAC-304 现在装一个不在名单上的定义、启动、断言 `last_error_code`。
- Q1 / P1b：同意，紧接 P1。发布者身份取自安装记录（签名或发布者字段），不取自 Manifest 自述；换发布者拒绝。安装记录里若没有可信的发布者字段，停下来问统筹（连着 ac-trust 线的 PG-001）。
- Q2：文件合成一套之后只留一个名字、一个服务（名字按 `docs/system/GLOSSARY.md`），同一个 PR 改所有调用方，不留兼容期、不做薄委托（别名反正在 W6-01 删）。沙箱永远拿不到 `ownerFiles`（这条「不做」在等用户确认）。
- Q3：同意，不等模型 broker。Q4：同意，四个 PR：P1、P1b、P2、P3。
- 顺序：P1 修正（错误码传递、去掉导出、RAC 号）→ 推送 → P1b → P2 → P3，全部本地并推送；本线两个在途 PR（#1119、#1139）合入后才开 PR。

## 7. 验收（P1）

| 编号 | 断言 | 测试 |
| --- | --- | --- |
| RAC-300 | Manifest 的 `databases.home` 形状逐条拒绝：名字、版本、`schema`、权限不在 `permissions`、不认的字段、`partition` 不是 `"project"`；`databases.project` 带 `partition` 被拒 | `tests/plugin-project-database-ledger.test.ts` |
| RAC-301 | 十一个内置插件的库都在 Manifest 的 `databases.home`；启动名单、目录条目与入口类型上不再有 `database`；读写同原来一样 | `tests/home-library-declaration.test.ts`、`tests/home-plugin-platform.test.ts`、`tests/dataset-promote-authority.test.ts` |
| RAC-302 | 存储登记的插件库全部从 Manifest 推出，与迁移前逐项相同（路径、主人、基线、分区），目录条目的 `home_store` 不再带 `library` | `tests/plugin-project-database.test.ts` |
| RAC-303 | 拒绝：声明了库名但登记在别人名下、基线与登记不同、分区与登记不同、登记里没有这个库、Home 里别的条目名（`feed`、`config`）、沙箱定义、没有 Home 的平台——都拒绝启动，一个库都不建 | `tests/plugin-project-database.test.ts`、`tests/plugin-database-partition.test.ts`（PART-01） |
| RAC-304 | 不在宿主启动名单上的定义（装进来的、带着内置插件的 `plugin_id` 与同样的 `databases.home`）被拒，码 `plugin.declaration_invalid`，什么都没运行，打不开别人的库 | `tests/plugin-project-database.test.ts` |
| RAC-305 | 分区库的 `project_data` 清理仍成立（读 Manifest 的 `partition`）；删项目时库被清 | `tests/plugin-database-partition.test.ts`（PART-03）、`tests/plugin-database-partition-deletion.test.ts` |
| PLIB-11 | Home 库的声明只在 Manifest 的 `databases.home`，可信条目上不再有 `database:` | `tests/home-library-declaration.test.ts`（读源码断言条目类型没有 `database`） |

P2a：

| 编号 | 断言 | 测试 |
| --- | --- | --- |
| RAC-306 | V-30：新建的文件和目录、`setAccess` 的只读与读写，都只有 Host 的用户有权限位（0o600/0o700、0o400/0o500），umask 为 0 也一样 | `tests/security-invariants-plugin-owner-files.test.ts` |
| RAC-307 | 同 `plugin_id` 的另一个定义声明了文件、不在名单上：升级被拒，码 `plugin.declaration_invalid`，它的代码没运行、原来的继续运行；不声明文件的不继承服务 | `tests/security-invariants-plugin-owner-files-lifecycle.test.ts` |
| RAC-308 | 装在名单之外、声明了 `owner_files` 的定义：启动被拒，安装记录的 `last_error_code` 是 `plugin.declaration_invalid`，没读没写，没建根目录 | `tests/owner-files-declaration.test.ts` |
| RAC-309 | Manifest 的 `owner_files` 形状逐条拒绝：不认的字段、根名、没有条目、带路径或重名的条目、不认的种类、不在 permissions 里的权限、没有 `storage:private` | 同上 |
| RAC-310 | Shelf 的文件声明在它自己的 Manifest 里，登记里没有；内置插件里只有它声明 | 同上；`tests/dual-instance-services.test.ts`（双实例的项目一半不拿服务）、`tests/security-invariants-plugin-owner-files-registration.test.ts`（项目插件声明被拒） |

## 8. 开工前核对（2026-10-23，`gh pr list` 的文件清单）

P1 动到的文件里，在途 PR 也动的：

- #1147（PG-051 P2b）：`plugin-registration.ts` 与十个插件的 `registration.ts`（删 `runtime.database`、`home_store.library` 的行在同一个文件里，行不同，合并时手工并）。
- #1098（W5-06 视图声明）：十个插件的 `manifest.ts`（本片在每份 Manifest 加一行 `databases`）。#1112：lingguang、pages、workflows 的 `manifest.ts`。
- #1139（PG-017 P0）：`home-plugin-executor.ts`、`plugin-host-services.ts`（本片改 `openDeclaredLibrary` 与 `databaseFor` 一带）。#1119：`plugin-host-services.ts`、`plugin-database.ts`（合同注释）。#1138：`home-plugin-executor.ts`、`home-stores.ts`、`plugin-executor.ts`。#1130：`home-stores.ts`、`project-deleted-owners.ts`。#1107：`project-plugins.ts`。#1129、#1132、#1137：Todo、Issues 的 `registration.ts`。

所以 P1 排在这些合入之后开 PR，开之前先合 main 解冲突；写代码可以现在做，因为冲突都在单行搬位置的地方。
