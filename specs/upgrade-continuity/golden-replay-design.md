# U2 金样 Home 与回放：设计

状态：设计稿（2026-11-03，2026-11-06 按第 05 批核账第三节修订，路线书第 05 批第 1 项里可以并行先做的那一半）；尚未实现。U0 规则已合入（#1786）；统一起点已登记（#1914，2026-11-07，`docs/releases/CHECKLIST.md` 第 4 节），各库已回到第 1 版，第一份金样不再等 02；脚本已合入（#1912，`7a7fecb81`），带第三方时 `check` 还过不了，留给 U2-c；第 5、6 节按用户 2026-11-07 的决定更新。2026-11-07 按合入 main 的 #1877 勘误一轮：金样多了账号 Home、`storage-space.json`、`sync/`、`plugin-packages/`，随机值的做法写在 §2。「改建库语句必须带升级段」的门禁要等 U1 合入才打开。§5 的门禁与 CI 用户 2026-11-06 同意全开。N41 的 `scripts/gates/initial-versions.mjs` 在 U1 首次接手持久化版本时由连续升级与回放接替，做法见 [U1 设计](upgrade-chain-design.md) §11.1。行为与验收以[升级后持续可用](spec.md) §6、§9 为准，本文只写怎么做。

验收编号沿用 `UPG-01`、`UPG-10`、`UPG-11`、`UPG-14`（§9）；本文新增的检查用 `UPG2-` 前缀，在 §7 列出。

## 0. 给人讲清楚

以后每发一个版本，我们就把「那一版用了一阵子的 Home」原样存一份，叫金样。里面的数据都是编出来的，但每个库、每个插件、每种要升级的文件都有。之后每改一次代码，CI 就把每份金样拿出来，用新代码打开、升级、读写一遍，哪一步不过，这个改动就合不进去。第三方插件的沙箱只有 macOS 有，所以只有改到插件运行、沙箱、存储这些相关部分时，才在合并前跑第三方插件，其余靠每天的定时作业。这样「装了新版本，旧数据打不开」这种事，在你碰到之前就会被拦下。

这一步你在界面上看不到变化。真实 Home 已重建，所有版本已回到 1，第一份金样不再等 02，还差脚本合入和几项决定；金样在隔离 Home 里编数据生成，不从真实 Home 取。§5 里新开的 CI 检查和门禁，用户 2026-11-06 已同意全开。「金样放在哪里」按推荐的方案 A 定了，统筹 2026-11-04 审过。

## 1. 现在已有的，可以直接接上

| 已有 | 在哪里 | U2 怎么用 |
| --- | --- | --- |
| 每个库和文件的主人、版本、备份分类 | `docs/system/HOME-DATA.md` §2～§6 | 金样要覆盖的清单就从这张表来，表里多一项就要求金样也多一项（§5 第 3 条） |
| 离线 Home 快照，带清单与摘要 | `apps/local-host/src/home-snapshot{,-capture,-contract,-inventory,-publication}.ts`、`home-store-snapshot.ts`，SQLite 备份在 `packages/storage/src/snapshot-sqlite.ts`；`molis-work home snapshot`（`docs/cli-and-development.md`「Home 离线快照」） | 金样就是一份快照：同一套店铺登记、同一种清单格式，不另写打包代码 |
| 所有无参数读取跑一遍 | `tests/action-read-compatibility.test.ts:35` 的 `probe`（未导出，绑着 `serveHomeRuntime`、`LocalSqliteStorage` 和目录库登记，抽的时候一起带走；`:83` 标题里的「historical v35」已陈旧，顺手改） | 抽成回放用的公共函数，从「一个项目库」扩到「整份 Home、所有项目、Home 级与项目级的读取」 |
| 插件回放 | `scripts/replay-plugins.mjs`、`tests/fixtures/replay-plugins/corpus.json` | 金样里装的第三方插件就取语料里的签名包样本；回放时对升级后的 Home 再跑一遍 |
| 演示种子、历史 Goal 数据 | `seedDemoBoard`（`apps/local-host/src/demo-seed.ts:102`）、`tests/fixtures/goal-event-history/*.sql` 与加载器 `tests/goal-event-history-fixture.ts` | 生成金样时用它们填项目库，不另编一套 Goal 数据。这组文件是「当前基线加 Goal 场景」的冻结转储：main 上现在是 `user_version=17`，#1837 改回 1（头 `b977224cf` 上已核）。所以它只在版本等于当前基线时能用：生成脚本先比版本，不等就失败并提示刷新，不做转换。`seedDemoBoard` 是一个 538 行的函数，`docs/system/HUGE-CLASS-MIGRATION.md` 登记的拆分对象，只调用它，不依赖它的内部形状 |
| 各库版本表与代码一致 | `docs/releases/CHECKLIST.md` §3、`scripts/verify-release-versions.mjs` | 金样清单里记下的每库版本，与这张表同源 |

## 2. 一份金样里有什么

一份金样对应一个产品版本（或开发期间一次升了某个库版本的中间点），目录名就是版本号：

```text
tests/fixtures/golden-homes/<版本>/
  manifest.json          生成它的提交、产品版本、每个库与文件的路径、结构版本、逐表行数、摘要
  stores/<库的相对路径>.sql   每个 SQLite 库的文本转储（稳定排序，转储器自写，见下）
  files/<文件的相对路径>     带版本的 JSON 文件、加密文件的密文，原样保存
  README.md              这份金样怎么来的、用哪个命令重新生成、不含真实内容的说明
```

覆盖面以 `HOME-DATA.md` 为准，必须有：

1. **平台库**：`projects/catalog.db`、至少两个项目的 `molis-work.db`（一个演示种子，一个带 Goal 事件历史）、§3.2 的全部 Home 级库、§3.4 的 `plugin-runtime.db`、`plugin-libraries.db`。
2. **内置插件库**：§3.3 的每一个个人插件库都有至少一行数据，项目级插件的表在项目库里都有数据。
3. **带版本的文件**：`config/mcp-tools.json`、`shelf/catalog.json`、`browser/sites.json`、`jelly/preferences.json`、`config/installation.json`、`feed/secrets.json` 及其测试密钥，再加核账第二节补出来的 `computer/settings.json`、`computer/records/<id>/record.json`、`config/onboarding.json`、`config/project-arrival.json`。`config/installation.json` 在离线快照的 `snapshotExclusions` 里（它是这次安装的收据），所以金样单独放它，不靠快照带。`computer/` 现在不在 `homeStores()` 里，有这个目录的 Home 离线快照会报 `unknown_data`，要先登记才能生成（[U1 设计](upgrade-chain-design.md) §15.2）。
4. **一个装上的第三方插件**：语料里的签名包样本，装上、启用、写过数据，有自己的库和主人文件。
5. **Prologue 的存储**：`agent-runtime/records/` 里至少一段会话、一条记忆条目，用脚本化的假模型生成，不调真模型（§4.5 要求换包前回放它）。
6. **Home 自己的身份**：`storage-space.json`，每个库里的 `molis_storage_space` 与它一致。这是核对归属的依据，少了它库打不开。
7. **已安装的插件包**：第 4 条那个插件在 `plugin-packages/` 下的已校验包，原样放进 `files/`。
8. **一个账号 Home**：`spaces/<固定的 spaceId>/`，本身就是一个完整的 Home，有自己的 `storage-space.json`、记忆库和至少一个项目。个人同步库 `sync/sync.db` 只在账号 Home 里有，同步日志的技术表和触发器也靠它覆盖到。生成时不连云：用 `personalStorageSpace` 按固定的 issuer、应用和用户算出 spaceId，写好 `storage-space.json`，再对这个目录跑同样的生成步骤。同步库没有写入动作，用 `tests/fixtures/home-store-schemas/` 的现行结构导入，在清单里注明（§3 第 2 步的例外）。

第 6～8 条和 `config/installation.json` 一样，离线快照不带：`homeStores()` 把 `spaces`、`storage-space.json`、`plugin-packages`、`sync` 都登记成 `omittedSnapshot(…, "preserve")`（`home-stores.ts:44-48`）。所以金样单独放它们，生成和覆盖面都不能只靠快照的结果。

不放进去的：可重建的派生库与锁（HOME-DATA §5）、临时目录、日志、浏览器用户数据目录、模型缓存，还有账号桥的凭据 `config/native-session-token`（金样不登录，也不该有凭据）。这些在金样清单里记成「不收」，并写原因，与离线快照的排除规则一致。

**数据一律合成。** 文字是生成脚本里写死的样例；没有真实的人名、邮箱、密钥。密钥文件用一把只用于金样的测试钥匙，写进清单并标「测试」；`pnpm secrets:check` 的例外按开发手册的写法，写确切值和理由。

**转储器要自写。** `.dump` 是 sqlite3 命令行的功能，`better-sqlite3` 和 `node:sqlite` 都没有。写在 `packages/storage`，只用 `SqliteBaselineDatabase` 的 `exec`、`prepare` 和 `sqlite_master`，这样换驱动不用碰它：SQLite 第二步不是它的前置，它也不是第二步的前置，只是同包，文件不重叠（路线书第 05 批第 3 项）。

**稳定可比。** 生成时固定时钟和 ID 种子（能注入的都注入）；转储按表名、主键排序；仍然会变的字段（如 SQLite 内部页序）不进摘要。随机值分两种做：

| 随机值 | 在哪里 | 做法 |
| --- | --- | --- |
| 空间号（`storage-space.json`、`molis_storage_space`） | `ensureStorageSpace` 没有文件才生成（`space.ts:42`），库里的跟着文件走 | 生成前先写好固定内容的 `storage-space.json`（`ensureStorageSpace(home, expected)` 本来就收这个参数）。不用改产品代码 |
| 设备号（`<命名空间>_replica_state.device`、`replica_state.device`） | 写在建库 SQL 的 `randomblob(16)` 里（`plugin-sync-database.ts:42`），另一处是 `randomUUID()`（`replica.ts:44`）。不该为了测试开注入口 | 转储器把这一列换成 `sha256("golden-device:" + 库的相对路径 + ":" + 表名)` 的前 32 位。值还是合法的十六进制，每个库各不相同，还原后 `initializeReplica` 照常认 |

要归一的列写成转储器里的一张短表（表名模式、列、规则），不做通配。新出现的随机列会让 `UPG2-02` 失败，要么注入，要么进这张表，看得见。同一个提交生成两次，`manifest.json` 与所有转储逐字节相同（`UPG2-02`），比的是归一之后的转储。

## 3. 怎样生成

一个脚本，在构建好的工作区上跑，只用临时 Home：

```text
node scripts/golden-home.mjs create --version <版本> [--out tests/fixtures/golden-homes/<版本>]
node scripts/golden-home.mjs check  --version <版本>     # 重新生成到临时目录，与入库的逐字节比较
```

步骤：

1. 新建一个临时 Home，用脚本化的假模型启动常驻宿主（与 `replay-plugins.mjs` 相同的入口）。
2. 建项目、启用全部内置插件，**经各主人自己的动作**写数据；不直接写 SQL，这样数据的形状就是主人真实会写出的形状。少数还没有写入动作的（如历史 Goal 事件），用已有的转储导入，并在清单里注明。知识库是另一种例外：卡片编号取决于后台定时器顺序，又被无内容 FTS 记住，事后无法归一，所以生成结束时删掉 `knowledge/knowledge.db`，由主人按目录逐项目重建，同样记在 `imports`；代价是金样里的知识库没有编辑过的卡（#1912）。
3. 装第三方插件样本，调一次写入动作。
4. 写带版本的文件：经各自的设置入口写，不手工拼 JSON。
5. 对账号 Home 重复第 1～4 步（§2 第 8 条），根 Home 和账号 Home 各用各的固定 `storage-space.json`。
6. 停宿主，走离线快照的同一套枚举（`homeStores()`、inventory 分类），用自写的转储器导出成 §2 的目录形状，算清单；快照不带的（§2 第 6～8 条）单独收。快照本身是二进制备份，不能直接入库。

生成在三个时候做：

- **统一起点**：第 02 批重建、版本回到 1 之后，生成第一份（`0.1.0`）。
- **每次发版**：发布检查单里加一步「生成本版金样并入库」，由 F 轨在发布 PR 里做。
- **开发中升了某个库的版本**：那个 PR 自己加一份中间金样，目录名写成 `<下一个版本>-dev.<序号>`。

## 4. 怎样回放

```text
node scripts/replay-golden-homes.mjs [--latest N | --all] [--json]
```

对每一份金样：

1. **还原**：把转储和文件还原到一个新的临时 Home，路径、权限与原来一致，账号 Home 也还原到 `spaces/` 下。
2. **升级**：用当前代码启动常驻宿主。U1 合入以前，各库版本必须与当前代码相同，打开时的结构检查就是唯一的检查；U1 合入以后，启动时的升级过程把每个库升到当前版本（[U1 设计](upgrade-chain-design.md) §3、§4）。还原时不写升级戳记，所以这一步必定全量扫，账号 Home 同样（U1 设计 §4.2）。
3. **结构**：每个库的结构与当前基线逐表一致，触发器逐字一致（`applySqliteBaseline` 已有的检查）；带版本的文件经各自的读取入口读成功。
4. **读**：所有不需要参数的读取，在 Home 级和每个项目里各跑一遍，沿用 `probe` 的判断：除了金样里本就没配置的依赖（列在一张带确切错误码的表里），任何错误都算失败。
5. **行数不减**：清单里记下的逐表行数，升级后不能变少；主人在升级段里明确声明会删除或合并的表除外，声明写在升级段旁边。
6. **写**：每个库的主人提供一个「最小写入」用例（新建一条、改一条），在升级后的 Home 上跑，再读回来。**靠约定的文件位置发现，不改合同**：内置的主人在 `tests/golden-writes/<主人>.ts` 放一个文件，默认导出一个函数，参数是回放脚本给的动作客户端与调用者，只经动作写读；`<主人>` 用 `HOME-DATA.md` 里的 owner 名。装上的第三方插件不进仓库，沿用插件回放语料已有的 `write` 字段（`tests/fixtures/replay-plugins/corpus.json`），第三方作者在自己的样本里声明，不需要平台新字段。不在插件的 `registration`、Manifest 或 SDK 上加声明；以后要让第三方插件随包自带写入用例，那是合同改动，先单独开合同 PR（轨道规则 1）。覆盖面门禁按同一约定核对：`HOME-DATA.md` 里每个必备份库的主人，`tests/golden-writes/` 下都要有它的文件。
7. **插件回放**：对升级后的 Home 跑 `replay-plugins.mjs` 的同一组检查，确认装上的第三方插件还能加载、调用、再升级。只有 macOS 能跑（§5）：只有相关改动才在合并前跑，其余靠定时作业。
8. **重启**：关掉宿主再开一次，第 3、4 步再跑一遍，确认升级不是只在内存里生效。

失败时输出：哪份金样、哪个库或哪个动作、哪一步、错误码。不打印数据内容。

## 5. 门禁

| 门禁 | 什么时候开 | 拦什么 |
| --- | --- | --- |
| 金样回放（挡合并） | 第一份金样入库即开 | 最近 3 份金样有任何一份回放不过。U1 之前这已经能拦住「同版本改了结构」，因为打开时的结构检查会拒绝。平台改同步技术表也归这一条（U1 设计 §2.4） |
| 金样回放（定时） | 同上 | 全部金样，每天一次；失败开 issue，不挡合并 |
| 建库语句与版本（UPG-01） | U1 合入后（U2-d 已做） | 每个库的基线结构算一个哈希，入库在 `tooling/gates/schemas/stores.tsv`（与动作合同快照同一种做法，`pnpm schemas:update` 刷新；文件与构建出的产品一致由 `pnpm test:contracts` 的 `tests/store-schema-snapshot.test.ts` 看住，和 merge-base 比的三条在 `pnpm health:check`，`scripts/gates/store-schemas.mjs`）。哈希变了而版本没升，失败；版本升了却没有对应的升级段，失败；升了版本却没有新的中间金样或回放没过，失败。哈希是 SQLite 跑完建库语句后报的结构（`describeSqliteSchema`，加上触发器和视图的语句，空白归一），所以只改排版不算，改触发器算。「中间金样」读金样清单里这个库的 `schema_version`：要有一份金样存着旧版本；「回放没过」由挡合并的 `golden-replay` 作业管。目录库的版本在 `catalog_meta`、插件的项目表版本在项目库里，金样清单都还没记，这两类升版本现在过不了，等金样记下它们再说。带版本的文件没有建库语句，不在这一条里，版本连续归 `initial-versions.mjs`。`tests/fixtures/home-store-schemas/`（#1877 加的各库冻结结构，配 `tests/home-store-baselines.test.ts`）只比当前结构，没有这三条，不代替它；它的历史样本（`sync-v2`～`v5` 等）可以当 U1 用例的真实输入 |
| 覆盖面 | 第一份金样入库即开 | `HOME-DATA.md` 里登记的每个「必备份」库和带版本的文件，在最新一份金样里都存在；少一项就失败。新库在登记表里加一行，就要在同一个 PR 里让金样也有它。开工时先把 `HOME-DATA.md` 缺的 `feed-content/feed-content.db`、`computer/` 补上（核账第二节），否则覆盖面本身有洞。登记成不进快照、却是用户数据的（`spaces`、`sync`、`plugin-packages`、`storage-space.json`）也算，不只看「必备份」 |
| 换 Prologue 包（UPG-11） | 第一份金样入库即开 | 改了 `vendor/prologue-sdk/` 的 PR 回放全部金样，不只最近 3 份 |

**这张表里的每一项都是改门禁本身，用户 2026-11-06 同意全开**：新的 CI 任务 `golden-replay`、定时作业、覆盖面门禁、`tooling/gates/schemas/` 与 `pnpm schemas:update`。否掉的是「只开回放、不开 schema 门禁」和「只在发版前跑」。升版本这条路要改的另外四份门禁在 [U1 设计](upgrade-chain-design.md) §11，同日同意。U2-c、U2-d、U2-e 开工不用再问，只按各自的前置等。

挡合并的作业放在 Linux，单独一个 CI 任务 `golden-replay`；时长目标是最近 3 份加起来不超过 5 分钟，超了就减少每份的项目数，不砍检查步骤。

**第三方插件（用户 2026-11-07 定）：** 第三方插件的沙箱只有 macOS 有，Linux 上回放报 `unsupported`。所以 `golden-replay` 在 Linux 上跑第三方之外的全部，并在结果里写明第三方这段没跑，不算通过；改到插件运行、沙箱、存储这些相关部分时，另一个 macOS 作业加跑第三方插件，不过就合不进去；每天的定时作业在 macOS 上跑全部，兜住路径清单漏掉的。路径清单写在 CI 里，和 `native-checks` 同一种做法，U2-c 列出来给评审看。

## 6. 金样放在哪里（按推荐先定）

| 方案 | 好处 | 代价 |
| --- | --- | --- |
| **A. 文本转储入库（推荐）** | CI 不用联网；改动能在 PR 里看 diff；与 `goal-event-history/*.sql` 的先例一致 | 仓库会慢慢变大。按每份 2～5 MB 估，一年十几份在可接受范围；`tests/fixtures/golden-homes/` 的工作树字节超过 50 MB 时，从最老的一份起移到发布附件，不看年龄（用户 2026-11-08 定），仓库里只留它们的 SHA-256 和下载地址 |
| B. 只放发布附件 | 仓库不长 | CI 要联网下载；开发中的中间金样没有发布可挂；看不到 diff |
| C. 另开一个仓库 | 主仓库不长，也能看 diff | 多一个仓库要维护权限和同步；PR 要跨仓库提交 |

按 A 写进本设计，统筹 2026-11-04 审阅同意。真实大小在第一份生成后量，超出估计时回到这张表重新定。

**量过了（用户 2026-11-07 定）：** 第一次生成 54.2 MB，其中 50.8 MB 是 `plugin_runtime_release_artifacts`：每个项目各存一份全部内置插件的代码，其余约 3.4 MB。方案 A 不变，这一列单独处理：`artifact_json` 里的 `module_source` 按内容摘要在金样里只存一份并压缩，放在 `files/` 下，转储里留摘要，还原时写回，`artifact_json` 这一列逐字节还原（库是从文本转储重建的，§2 的归一列本来就和原来不同，所以这里说的是这一列，不是整个库）。当时预计每份约 7 MB（估算）。

**实测与改正（用户 2026-11-08 定）：** 代码只存一份并压缩后整份 15.3 MB，其中 `stores/` 13.5 MB，`plugin_runtime_release_artifacts` 占 11.18 MB，大头是每行都带的 `manifest`，代码压缩后只有 1.58 MB。重复的 Manifest 也只存一份（统筹定，做法同 `module_source`），整份约 4.47 MB（评审台实做量的，以第一份入库时的数字为准）。

这里原来还写了一条理由，写错了：当时说不能只留校验值，因为「新版和已安装版本不兼容时，宿主要用存着的旧代码继续跑（`packages/plugin-runtime/src/supervisor.ts:500-532`），这条路回放要测」。用户 2026-10-08 已定内置插件一律跟当前构建（`packages/plugin-runtime/README.md:104`），这条路今天用不上。用户重新定：**回放不测这条路，代码照存**，这样金样才和真实 Home 的库一样。代价：这条路没人测，真要启用时再补。产品是否继续存这些代码登在 [`BL-plugin-release-module-source`](../backlog/BL-plugin-release-module-source.md)。

## 7. 本设计新增的检查

| 编号 | 检查 |
| --- | --- |
| UPG2-01 | 金样只经主人的动作和设置入口生成；回放脚本与生成脚本都只用临时 Home，不读写真实 Home（4207／4208、`~/.molis-work`） |
| UPG2-02 | 同一个提交生成两次，清单和归一之后的转储逐字节相同；归一表外的列出现随机值就失败 |
| UPG2-03 | 回放失败的输出只有位置和错误码，不含数据内容 |
| UPG2-04 | 覆盖面门禁：`HOME-DATA.md` 里每个必备份的库和带版本的文件，在最新金样里都有 |
| UPG2-05 | 升级后重启一次，结构检查和全部读取再过一遍 |
| UPG2-06 | 账号 Home 和根 Home 都被回放、都升到现行；金样里没有 `config/native-session-token`，生成和回放都不连云 |

## 8. 分片与顺序

| 片 | 内容 | 等什么 |
| --- | --- | --- |
| U2-a 生成脚本 | `scripts/golden-home.mjs`、§2 的目录形状、清单格式；先在当前版本上跑通，但不入库 | 可以在第 02 批进行中写，只要不入库金样，也不碰 02 在改的文件（`packages/storage/src/snapshot-sqlite.ts`、`sqlite-baseline.ts`、`home-store-snapshot.ts` 等，清单见核账第二节）。转储器放新文件 |
| U2-b 回放脚本 | `scripts/replay-golden-homes.mjs`；把 `probe` 抽成公共函数；按 §4 第 6 步的约定在 `tests/golden-writes/` 放各主人的最小写入用例（不改合同，第三方用语料的 `write`） | U2-a |
| U2-c 第一份金样与挡合并作业 | 生成 `0.1.0`，入库，开 `golden-replay` 任务和覆盖面门禁；相同代码只存一份的压缩（§6）；macOS 作业和它的路径清单（§5） | 第 02 批重建、版本回到 1；开任务与门禁用户已同意 |
| U2-d 建库语句门禁（已做） | `tooling/gates/schemas/stores.tsv`、`pnpm schemas:update`、UPG-01（§5） | U1 合入；门禁用户已同意 |
| U2-e 发布步骤 | 发布检查单加「生成本版金样」，定时作业回放全部；定时作业跑在 macOS，否则第三方这段每天也跑不到（`scripts/replay-golden-homes.mjs` 在 Linux 上报 `unsupported`） | U2-c；定时作业用户已同意 |

按[决定 26](../post-anticorruption-roadmap/reference/decisions.md#decision-26)，本批由主会话派子代理，轨道只管独占文件；`scripts/golden-home.mjs`、`tests/` 不归 C1 独占。U2-a、U2-b 和 U1 串着写，理由是两边读同一份快照枚举、都要往 `packages/storage` 加东西，不是因为同轨；文件不重叠，开工时看 U1 进度，错开也行（[U1 设计](upgrade-chain-design.md) §15.1）。U2-e 是 F 轨。

## 9. 不在本设计里

- 升级链本身（U1）、失败时只停主人的界面（U3）、插件声明升级段（U4）、合同过渡期（U5）、副本演练与回退（U6）。
- 整份导出与导入（U7）：金样不是给人用的导出格式。
