# W5-02 登记线（ac-registry）：平台读自己的登记、删项目按声明删、依赖与外壳名单改成声明

状态：统筹 2026-10-24 审过方向，§8 的裁定已写进各节（PR-A 加三条必改、B 拆成两个 PR）；PR-A 已交（#1262，进 batch-37）；PR-B 的设计要点（§3.0）统筹 10-25 审过，叠着写、等 batch-35 再开 PR。事实按 main `df5527f27` 重核；PR-1a（#840）、PG-051（#1124、#1138、#1147）、W5-06 链（#1098、#1107、#1112）已合入。

依据：`privileges.md` 的 PG-024、065～069、072～076、095、105、111；§4 a、m；§5 第 7 条。10-19 的 PR-1 计划（协调分支 `notes/w5-02-pr1-plan.md`）的取舍与用户决定照旧有效（§9 抄了要用的几条），事实和拆片以本稿为准。

验收编号：RAC-560～579。BL：BL-615～624。安全不变量只写暂定号（S-暂A），统筹落地时定。

## 0. 结论：六个 PR，按这个先后（统筹 10-24 定）

| PR | 做什么 | 收哪些 PG | 行为变不变 | 前置 |
| --- | --- | --- | --- | --- |
| **A：删项目按声明删** | Home 库里按项目的行改成 Manifest 声明（`databases.home.project_rows`），平台按声明删；删掉各插件的 `purge` 和登记上的 `project_data` | PG-024（插件那一半）、PG-066 | 不变（同样的行被删） | #1251（ac-artifacts A2b）合入或与它同批 |
| **B：PR-1b 平台读自己的登记** | 三个提交：B1 平台生成物、全部平台派生点切换；B2 Manifest 加 `summary`、`developer`；B3 #679 | PG-105、PG-065、PG-068（PR-1b 部分） | 只 B3 变（S-31） | A；batch-35（#1258，已含 #1243）落地 |
| **B4：项目级监督器条目改成生成** | 单独一个 PR（统筹 10-24 拆） | PG-067 | 不变 | B；`project-plugins.ts` 还会被 FI-6（ac-sandbox-sched）、ac-clients-1 碰，冻结只从推送到合入，同批照 §1a 一起落 |
| **C：PR-2 依赖改成生成，门禁 7→0** | 两个应用与根 `package.json` 的插件依赖由生成器写；`workspace-packages.mjs` 不再点名插件包；`NEW_PLUGIN_OUTSIDE_FILES` 7→0 | PG-069、PG-068（收尾的额度）、§5 第 7 条 | 不变 | B |
| **D：PR-3 外壳与设置的手写名单**（D 移交 ac-shell（统筹 10-25）） | 设置节、搜索标签、外壳分组与常驻、图标与色相、几张选项清单改成声明 | PG-072～076 | 不变（同样的界面） | B；与 W5-04 在途片错开 |
| **E：W4-01 探针插件夹具** | 一个只有声明的探针插件，走安装→发现→调用→升级→停用→卸载，id 只在自己的包里 | W4-01（W6-02 的前置） | 不变（只加测试） | C |

为什么 A 排第一（派单写「能提前就提前」）：ac-artifacts 的 A3、A6 要等「PG-024 片」，因为 A6 要删成果库的目录条目，而成果库的项目数据今天挂在登记的 `project_data` 上；A 把这条路换成声明以后，A6 不用再往 Host 的名单里加一行。A 只改删除这条链，不依赖 B 的生成物：它照旧经今天的目录读 Manifest，B1 再统一换成平台生成物。A 和 B 都改合同、SDK，各自是共享核心，按批跑全量。

D 移交 ac-shell（统筹 10-25），本线的顺序变成 B → B4 → C → E；原来给 D 的 RAC-576～578 留给本线在 B、C、E 用（§10）。

PG-095、PG-111 不进这几个 PR，评估与统筹的裁定见 §7。

## 1. 重核的事实（main `df5527f27`）

| 项 | 10-19 计划里 | 现在 |
| --- | --- | --- |
| 内置登记 | 26 | **24**（Characters 并入 `modules/characters`，Sessions 已下线）；目录 `apps/workbench/src/builtin-plugins.ts` 由生成器写，55 行 |
| 登记类型 | 带 `instructions`、`agent`、`methods` | PG-051 已删这三项；类型在 `packages/contracts/src/platform/plugin-registration.ts` |
| 平台层读目录 | 18 个文件 | **21** 个 local-host 文件 import `BUILTIN_PLUGIN_CATALOG`（含 `functions-host.ts`、`plugin-page-http.ts`、`plugin-page-workspaces.ts`、`project-plugin-databases.ts`、`project-plugin-enablement.ts`、`project-plugin-http.ts`、`project-plugin-stages.ts`）；另有读派生值的：`availableProjectPluginIds`、`PROJECT_SCOPED_PLUGIN_IDS`、`BUILTIN_PLUGIN_REGISTRY`、`shownProjectPlugins`、`pluginTabTitles`、`sideOpenedPlugins`、成果类型那五项（`artifactTypeDeclarations`、`artifactContinuers`、`artifactReferrerActions`、`HOST_ARTIFACT_PRODUCERS`、`declaredArtifactTypes`） |
| 项目级监督器 | 11 条，6 条没有端口 | **13 条**（`project-plugins.ts`：schedule、shelf、coding、files、diff、git、text-stats，加 `homeLibraryPlugins()` 的 dataset、form、lingguang、pages、ppt、workflows），**只有 files 带端口**（`filesPorts.readable`），其余 12 条都是 `factory()`；PG-067 的描述过时 |
| Home 路由 | 4 处查目录 | 照旧 4 处（`home-plugin-http.ts:35,142,164,186`）；`routeProject` 对目录里没有的 Home 插件，只要不是双实例就放行，不核项目是否显示它（#679） |
| Manifest | 没有 `summary`、`developer` | 照旧没有（`packages/contracts/src/platform/plugin-manifest.ts:83`） |
| 应用依赖 | workbench 26、local-host 25 | workbench **24**、local-host **23**（只差 `plugin-issues`）；另有根 `package.json` 列了全部插件包 |
| 新插件在包外被点名 | 7 | 照旧 7（`scripts/gates/assembly.mjs:36`）；一个项目级小插件（text-stats）今天被点名 6 处：两个应用的 `package.json`、根 `package.json`、`workspace-packages.mjs`、`builtin-plugins.ts`、`project-plugins.ts` |
| 删项目 | 目录上 8 条 `project_data` | 9 条（加了 artifacts）；8 个插件的 `project-data.ts` 各写一段 `DELETE … WHERE project_id = ?`，宿主进程直接跑；Images 另由 Runtime 回调先取消作业（PG-106）；Host 另点名 characters、functions（模块）、alchemist、plugin-builder |
| 外壳名单 | PG-072～076 | 一部分已由 W5-06 2b 收掉（设置页图标、外壳分组按视图的 `group`、搜索标签按 `objectTabPlugins()`、助理设置的 SURFACES）。还在：Coding 设置页的模型由宿主拼（`web-catalog.ts:172,181`）、`RAIL_CORE_ORDER`、`RAIL_EXTEND_PLUGIN_IDS`（`immersive-shell.ts:91,100`）、`DOCK_DEFAULT_PINS`（`plugin-catalog.ts:110`）、搜索标签里的 `"artifacts"` 字面量（`global-search.ts:33`）、`MW_PLUGINS`、`PLUGIN_ICON`（design-system）、目标输入的 `CREATE`（`goal-inputs-html.ts:22`）。D 开工前逐条再核 |

在途：batch-35 改了 `project-plugins.ts`（`capabilities` 端口换成 `dependencyCheck`）和 schedule、shelf 的 `registration.ts`；#1243（W5-04 第二组）改 schedule、shelf 的 `registration.ts` 和 files 的 Manifest；#1251（ac-artifacts A2b）改 `plugins/native/artifacts/src/original-store.ts`（成果库的 `project_data` 在这里）。没有在途 PR 碰 `builtin-plugins.ts`、`generate-plugin-registry.mjs`、`plugin-catalog.ts`、`home-plugin-http.ts`、`project-deleted-owners.ts`、`assembly.mjs`、装配门禁测试。

## 2. PR-A：删项目按声明删（PG-024、PG-066）

**口径**（§4 a）：平台按插件声明的分区和文件删，删之前先经后台作业服务停掉该项目的作业，不加 Runtime 钩子，插件的代码不在宿主进程里跑。

**做法**：

- `PluginManifestDatabases` 的 `home` 加 `project_rows`：这个库里按项目存的行，平台删项目时删掉。

  ```ts
  project_rows?: {
    readonly label: string;   // 确认框里的单行说明；随宿主发布的词条显示时翻译
    readonly order?: number;  // 在各主人里的先后，照旧
    readonly tables: readonly (
      | { readonly table: string; readonly column: string }                                   // WHERE <column> = 项目
      | { readonly table: string; readonly column: string; readonly parent: string; readonly key?: string } // 子表：<column> IN (SELECT <key|id> FROM <parent> WHERE …)
    )[];                       // 按声明的顺序删，子表写在父表前面
  };
  ```

  `partition: "project"` 的库不写它（平台删整个分区，今天已有）。
- SDK 的数据库声明检查（`packages/plugin-sdk/src/database-declarations.ts`）认它：标识符是 `^[a-z_][a-z0-9_]*$`；`tables` 非空；表名都在 `schema` 基线里建过；`parent` 指向排在它后面的一行；与 `partition: "project"` 互斥。平台启动时用同一个检查。
- 平台的删除（`project-deleted-owners.ts`）对每个声明了 `project_rows` 的库，用平台自己的连接在一个事务里按顺序跑 `DELETE`；库还没建就什么也不做（今天 `clearInExistingHomeSqlite` 的语义）。SQL 由平台按声明拼，标识符只来自通过检查的声明，值只经参数。
- **只删声明它的插件自己那份库**（统筹 10-24 必改 a）：连接由平台按这个插件的库路径打开（与 `services.database` 给它的是同一个文件），不 `ATTACH` 别的库；表名不许带库限定（`main.`、`temp.` 或任何 `<库>.`），SDK 检查与平台启动都拒绝；声明里的表必须在这个插件自己的 `schema` 基线里，别的插件的表名即便同名也不认。
- **沙箱插件的 Home 库**（BL-619，依赖 #1255 / BL-490；必改 b）：今天声明 `project_rows` 在启动前以 `plugin.declaration_invalid` 明确拒绝，不静默跳过；#1255 合入不自动解除这条拒绝。未来 BL-619 改成照声明删之前，必须复用 #1255 的 PLIB-03 schema 预检（`inspectPluginProjectSchema`），逐句拒绝非建表/索引语句，早于 `projectRowsStatements` / `describeSqliteBaseline` 在宿主内存 SQLite 中 `exec` schema；不能先执行再检查，也不另写 checker。完成预检和按声明删除后，才把拒绝用例改成删除用例。
- **启动名单以外的两个未支持入口**（修复17）：项目平台启动名单中带 Home 库、却没有目录现成删除 owner 的插件，以及经安装账本启动的 Home 插件，声明 `project_rows` 均在任何 schema 执行、插件库或账本准备及插件代码执行前以 `plugin.declaration_invalid` 拒绝。目录中已有 `project_rows` owner 的项目插件由 `declaredProjectOwners` 清除，必须保留：只认目录本身的 Manifest 对象，不按插件 id、名称或作者给的 `bundled` 标记放行；同 id 的另一份声明仍拒绝。Home 启动名单内已有支持路径也保留。本片不实现 BL-620 的账本项目清除；沙箱仍按 BL-619 拒绝。
- **`label` 是不可信文本**（必改 c）：SDK 要求非空、至多 200 字的一行，沿用 S-32 的拒绝集合：控制字符（Unicode `Cc`）和 U+2028、U+2029；保留其他合法 Unicode 与原有长度口径，不另加字符白名单。装上的插件的 detail 不查翻译，放进「{name} 的项目数据：{detail}」模板后由确认框以 `textContent` 显示；随宿主发布的插件的词条照旧翻译。
- **实例运行中持有写连接时**（必改 c）：先经运行中实例的主人替换那一段（`plugin-project-cleanup.ts`：运行中的 Home 实例替换声明主人，先停这个项目的作业再删），删除仍由平台按声明在平台自己的连接上跑，连接设 `busy_timeout`，与实例的写事务排队而不是报错；超时就让这一步在回执里留作待重试（与今天 `purge` 抛错时的回执语义相同）。开工时核实现状再定落在哪一段，写进 PR。
- 删之前取消这个项目在后台作业服务里受理的执行（§4 m）。今天只有 Images 有作业，它的取消是 Runtime 回调（`onProjectDeleted`，PG-106）。本片**不动** Images 的作业：Images 的项目数据还有文件（`owner_files`），文件按声明删要等 PG-104 的文件服务合成一份。所以 Images 留在今天的路上，开 BL-615 跟 PG-104、PG-106。
- 7 个插件（dataset、form、lingguang、pages、ppt、todo、workflows）的 `project-data.ts` 删掉，改成 Manifest 里的声明；登记上的 `project_data` 字段只剩 Images 用。
- 成果库：#1251 把 `original-store.ts` 搬进 `modules/artifacts`，它的项目数据随之成为模块的主人，和 functions、characters 一样由 Host 点名（模块不是插件，不算名单）。A 不碰成果库，排在 #1251 之后，或与它同批。
- Alchemist（BL-376，不迁）、plugin-builder（防腐收尾后删）照旧。

**验收**：

| 编号 | 内容 | 证明 |
| --- | --- | --- |
| RAC-560 | 7 个插件声明 `project_rows` 后，删项目删掉的行与改之前 `purge` 删的完全相同：每个库造两个项目的数据，删一个，另一个原样（逐表逐行比） | 新测试，非浏览器 |
| RAC-561 | SDK 检查拒绝：不合法的标识符、空 `tables`、`schema` 里没有的表、带库限定的表名、声明的表属于别的插件的库、悬空或顺序错的 `parent`、与 `partition: "project"` 同写；平台启动对同样的声明拒绝；删除只打开声明者自己的库文件 | SDK 单测、平台单测 |
| RAC-562 | 删项目时不执行任何插件代码；Home 启动名单内非随宿主发布的夹具照声明删。目录已有删除 owner 的真实项目插件可以启动，同 id 的另一份声明仍拒绝。沙箱声明 `project_rows` 明确拒绝（BL-619）；没有目录现成 owner 的项目平台 Home 库声明与 Home Runtime 中不在启动名单、经安装账本启动的声明，也明确拒绝。后两项分别调用真实 `platform.start`、Home `runtime.install/start`，断言错误码、未运行、schema 未执行、未建插件库/账本及无插件业务副作用，不只调共同 helper | `tests/project-rows-deletion.test.ts`（S-暂A；正式 SI 行与编号由 Claude batch-37 载体统一入库） |
| RAC-563 | 确认框主人、顺序、翻译与 HTML 文字显示不变；经真实外部插件安装声明路径拒绝空白、CR/LF、控制字符、U+2028/U+2029 与超过 200 字的标签，合法 Unicode（含组合字符与 emoji）及 200 字边界仍接受；实例写事务排队后删除，超时仍留待重试 | `tests/project-rows-deletion.test.ts`，保留现有确认与写锁断言 |

修复17验证：固定父 `5be32d0f03265e029b419bf6c3d0920e6a17e866` 上保留新增拒绝测试的修前红原件，修后整体 `pnpm build`，运行上述直接回归及 SDK / Host README 的必跑文件；`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、`pnpm secrets:check`。公共机器槽位、隔离 Home 与专用测试浏览器；不跑全量，最终组成树由 Claude 统一验证。只改声明校验与两处启动边界，不改清除 SQL、数据形状、权限、动作、版本门禁、BL-620 或沙箱支持；不增加公共 API。

**碰的文件**：`packages/contracts/src/platform/plugin-database.ts`、`plugin-registration.ts`（`project_data` 的说明）、`modules/projects.ts`（`ProjectDataDeclaration` 只剩 Images 与模块用）、SDK `database-declarations.ts`、7 个插件的 `manifest.ts`、`database.ts`、删 `project-data.ts`、`registration.ts` 去 `project_data`；`apps/local-host/src/project-deleted-owners.ts`、`plugin-project-cleanup.ts`；`tooling/gates/api/`。`builtin-plugins.ts` 生成结果不变。

**开工前核对**：#1251 的状态；`project-deleted-owners.ts` 与 `plugin-project-cleanup.ts` 在宿主运行与不运行两种情况下的主人替换（运行中的实例替换声明主人那一段）；7 个库的 `schema` 基线里确有这些表；`docs/system/CALL-CHAINS.md` 链 2 步骤 7 跟着改。

## 3. PR-B（B1～B3，三个提交）与 PR-B4：平台读自己的登记

### 3.0 PR-B 设计要点（开工前，2026-10-25，统筹已审）

基于 `5be32d0f0`（PR-A 最后一个头）重核。#1258（batch-35）、#1243、#1261（ac-shell 的 `plugin_directory`）都还开着；信任 T6（BL-560，S-68）未实现。

**事实**

- local-host 有 27 个文件从工作台取平台事实：`BUILTIN_PLUGIN_CATALOG` 21 个，`shownProjectPlugins` 4 个，`availableProjectPluginIds` 3 个，`PROJECT_SCOPED_PLUGIN_IDS` 1 个，`BUILTIN_PLUGIN_REGISTRY` 1 个（`project-catalog.ts`）。成果类型的五项留给 A3。别的约 40 个从工作台 import 的名字是渲染（`createWorkbenchRenderer`、`render*`、`MolisWorkWebView` 等），宿主本来就由它渲染页面，不在本片范围。
- 工作台自己也用平台事实：
  - `renderer.ts`、`shell-page-renderer.ts` 算 `shownProjectPlugins`；
  - `immersive-shell.ts` 用 `BUILTIN_PLUGIN_REGISTRY.companions` 算添加插件时一并带上的；
  - `plugin-settings-catalog.ts` 用 `PERSONAL_PLUGIN_IDS`、`PROJECT_SCOPED_PLUGIN_IDS`；
  - 客户端 `scripts/client/plugin-workbench.ts` 在构建时把 `PERSONAL_PLUGIN_IDS` 写进脚本；
  - `primitive-catalog.ts` 的样例。
- `MolisWorkLocalHost` 现为 361 行、24 个方法。

**做法**

1. **同一批登记，两份生成物。** 生成器在 `apps/workbench/src/builtin-plugins.ts` 之外再写 `apps/local-host/src/plugin-registry.generated.ts`（`PLATFORM_PLUGIN_REGISTRATIONS`），输入和顺序相同，`--check` 两份都核（RAC-567）。工作台那份只给外壳的资源：contributions、样式、客户端、样例、`messages`、`searchRow`。
2. **平台的派生只在一处：** `apps/local-host/src/plugin-registry.ts`。从 `plugin-catalog.ts` 原样搬过来：
   - `shownProjectPlugins`、`availableProjectPluginIds`；
   - 个人、常开、可启用三组 id；
   - 项目插件登记（今天的 `BUILTIN_PLUGIN_REGISTRY`，含 `requiredCompanions`）；
   - Home 级和项目级条目（从 `project-host.ts` 搬出，`MolisWorkLocalHost` 只会变短）。

   工作台的 `plugin-catalog.ts` 删掉这些导出。27 个文件在**同一个提交**里改读它（S-08、S-15 的启动名单只有一份）。
3. **工作台要的平台事实由宿主传下来，不再另算一份：**
   - `MolisWorkWebView.shown_plugins` 由宿主算。`renderer.ts`、`shell-page-renderer.ts` 读这个字段；字段在舞台模型里已经有了。
     - 有项目时，宿主每次请求都从 Catalog 读真实的启用与隐藏（`projectWebView`）。整页、refresh、文档片段读的是同一份视图，不跟着 Goals 游标缓存。
     - 没有项目时（fixture 服务器）：外壳的页面默认，加上宿主登记里的个人插件。
     - 这份默认只在工作台的 `page-plugin-visibility.ts` 定义一次（`PAGE_PLUGINS_WITHOUT_SELECTION`），宿主不另写名单（batch-37 修复，#1287 评审）。
     - RAC-712：项目隐藏 Pages 之后，整页、refresh、文档片段里都没有 Pages 的新建按钮；取消隐藏后三处都回来（`tests/project-page-shown-plugins.test.ts`）。
   - `plugin_directory` 的每一项（#1261）由宿主从可信登记标上 `personal`、`always_on`、`companions`（宿主按依赖算好的完整集合）。Manifest 里没有这些，所以也不经 Manifest。`immersive-shell.ts`、设置目录、市场卡片都读这里；客户端改成读页面里的目录 JSON，不再在构建时写死。
   - 组件板样例用固定的样例名单（开发工具）。
4. **哪些算外壳渲染：** `sideOpenedPlugins`、`objectTabPlugins`、`pluginTabTitles` 留在工作台。宿主里用到它们的地方（`home-plugin-http.ts`、`assistant-pages.ts`）是渲染或路由，把宿主自己的登记作参数传进去（`sideOpenedPlugins(entries)` 已经收参数），不读工作台的目录。RAC-564 的 import 图只许宿主从工作台 import 渲染函数和成果类型五项。
5. **门禁与 owner** 照 §3 B1：
   - `pluginOutsideMentions` 按确切路径豁免两份生成文件，只在 `--check` 通过时生效；
   - `catalog-entries.mjs` 删掉旧读法，补「旧写法被拒」的测试（RAC-566）；
   - local-host 加 `plugin-issues` 依赖，`--base` 不让数字变大就把 C 的豁免提前进来；
   - CODEOWNERS 加 `registration.ts` 的规则。
6. **RAC-565：** T6 没做，只断言结果：装进 Home 的包即使带着 `registration` 导出，也不进启动名单，拿不到 `bundled`，不能用内置 plugin id 作提供方。不另写提供方身份的检查。T6 落地时测试不用改。
7. B2、B3 照 §3。B3 改的 `home-plugin-http.ts` 正好也是第 4 条那一个宿主文件，放在同一个 PR 里，冲突只解一次。

**统筹 10-25 的裁定**（Q1～Q3 都按推荐）

- Q1：B1 叠在 #1261 上。基点是 #1261 + Codex 的 FIX3（48a00a979）+ ac-shell 第 2 片；`plugin_directory` 的字段定义归 ac-shell，B1 只往每一项加 `personal`、`always_on`、`companions` 三个可信标记，写第 3 条前先和 ac-shell 对字段形状。三者照 §1a 同批落。
- Q2：这次留两份生成物，C 再看。
- Q3：下发；宿主的判断永远不读回页面上的值（POST、动作、路由的授权只认宿主的 `ProjectPluginRegistry`）。加一条拒绝用例：页面把 `personal` 或 `companions` 改了再提交，宿主不认（RAC-564 之外另记，号在 RAC-56x 段里实现时定）。
- B 等 batch-35（#1258，含 #1243）落地后才开 PR；之前叠着写、只推分支。`MolisWorkLocalHost` 的数字用 `--base` 实测。

**与 ac-shell 定的字段（10-25）**：`PluginDirectoryEntry` 上平铺三个可选字段 `personal?: true`、`always_on?: true`、`companions?: readonly string[]`（项是项目键），只有 `chosen: true` 的条目带，缺省即没有。类型与清洗（只认 `=== true`；`companions` 逐项过 `KEY`、去重、至多 32 项；`chosen` 为 false 的三项都去掉）归 ac-shell 第 2 片；取值归 B1，在 `apps/local-host/src/plugin-directory.ts` 的 `runningPluginDirectory` 里 builtin 命中时从 `plugin-registry.ts` 写，Manifest 与运行时装的插件一律不带。三项不进 `data-plugin-directory`（页面体积不变），只在服务端渲染里用；客户端今天写死的个人插件 id（`scripts/client/plugin-workbench.ts`）改成读服务端渲染时标在市场卡片上的属性。基点 #1261 + FIX3 + 第 2 片，第 2 片推新分支后给头。

**当时的待裁**

- **Q1 B1 和 #1261 的先后。** 第 3 条要用 `plugin_directory`。推荐：B1 叠在 #1261 上做，#1261 合入后再开 PR；两个同时在评审就照 §1a 同批。另一种是 B1 先在 `MolisWorkWebView` 上加单独的字段，等 #1261 再并进去。这就是统筹 10-24 不要的平行端口，所以不推荐。
- **Q2 工作台那份生成物还要不要。** 宿主本来就调用工作台的渲染器，也可以把登记作参数传给它：这样工作台完全不 import 插件包，只留一份生成物。但工作台客户端的打包和 21 个测试按包名从工作台取目录，一起改会让 B 变大。推荐这次照稿留两份，C 再看能不能删掉工作台那份。
- **Q3 把 `personal`、`companions` 下发进页面。** 它们是可信字段，但只用来显示和帮着勾选；真正的判断还在宿主（`ProjectPluginRegistry`），页面上的值只影响显示。推荐下发。

### B1 平台生成物（PG-105、PG-065 平台那一半、PG-066、PG-068）

- 生成器多写一份 `apps/local-host/src/plugin-registry.generated.ts`：同一批 `registration`，同样的确定规则，`--check` 两份都核。平台各处只从它取。
- 平台事实在 local-host 里派生，一处：新文件 `apps/local-host/src/plugin-registry.ts` 导出 Home 级条目、项目级条目、`availableProjectPluginIds`、`PROJECT_SCOPED_PLUGIN_IDS`、项目插件登记（今天的 `BUILTIN_PLUGIN_REGISTRY`）、`shownProjectPlugins`。§1 那 21 个文件和读派生值的文件**一个提交**改读它，免得一半从工作台、一半从生成物取（S-08、S-15 的启动名单只有一份）。
- 工作台只留外壳的渲染（`pluginTabTitles`、`sideOpenedPlugins`、市场卡片、设置入口、客户端资源）。工作台需要平台事实的地方（例如 `shownProjectPlugins` 在工作台里也用），由 local-host 传入，不在工作台另算一份。**复用 ac-shell 第 2 片的 `plugin_directory`**（宿主下发页面要用的插件声明，来源是 Runtime 里运行中的 Manifest），不另开平行的端口（统筹 10-24）；两边谁后到谁重基，同时在评审就照 §1a 同批。逐处的走法实现时定，PR 正文列表。
- 成果类型那五项**留给 ac-artifacts 的 A3**：A3 本来就要把它们改成「有效安装的 Manifest 派生」，B1 先搬一次是白做。B1 的 import 图测试（RAC-564）把这五项列为唯一剩下的工作台 import，注明「A3 删」，只许减少；A3 合入时删掉这一行。要是统筹宁可 B1 一并搬走、A3 排在 B 之后，改这一条即可（§8 第 2 条）。
- `project-host.ts` 里 Home 条目的派生搬进 `plugin-registry.ts`，`MolisWorkLocalHost` 只变短。
- 门禁：`pluginOutsideMentions` 不数两个生成文件，按确切路径登记，只在 `--check` 通过时生效（用户 10-19 批）；`scripts/gates/catalog-entries.mjs` 删掉认手写目录的旧读法，加一条「旧写法被拒」的测试。
- local-host 加 `plugin-issues` 依赖（24 个里唯一缺的）。它让 issues 的点名数 4→5；用户 10-19 批的豁免（两个应用 `package.json` 里、生成文件需要的插件依赖，只在 `--check` 通过、且依赖清单正好等于生成文件 import 的那一组时生效）放在 C 里实现。B1 里先只改这一个依赖：要是门禁不让 issues 变 5，就把 C 的豁免提前进 B1（实现时看 `--base` 的结果，PR 正文写明）。
- `scripts/package-owners.mjs` 加规则：`plugins/native/*/src/registration.ts` 也请平台评审，`--write` 重生成 CODEOWNERS（10-19 计划 §12 第 5 条）。
- 文档：`SECURITY-INVARIANTS.md` 的 S-08、S-15 代码列；`HUGE-CLASS-MIGRATION.md` 里 `MolisWorkLocalHost` 的数字。

### B2 Manifest 的展示字段（PG-065 字段那一半）

- `PluginManifest` 加 `summary?: string`、`developer?: true`；SDK 的 Manifest 检查认它们（`summary` 非空、去首尾空白后不超过 120 字；`developer` 只能是 `true`）。登记删掉这两项，市场、页面标题、开发者模式的过滤改读 Manifest。没有 `summary` 的装上的插件，市场只显示名字。
- 影响信任的字段（`personal`、`default_enabled`、`companions`、`runtime` 各项、`home_store`、`messages`）照旧留在可信登记，注释标「2026-10-18 改」（裁定 m）。
- 随宿主发布的插件按裁定 b 跟宿主版本走，版本号不改。动作合同快照只哈希动作与场景，不受影响；先跑 `builtin-manifests-contract`、`plugin-declaration-rules`。

### B3 #679：Home 路由按 Home 登记判断（S-31）

`home-plugin-http.ts` 的 4 处改查宿主的 Home 登记（`host.homePlugins`）而不是目录：页面按短 id 找已登记的 Home 插件；`routeProject` 对每个 Home 插件（含装上的）都核「项目存在且显示它」，键对随宿主发布的是 `project_plugin_id`，对装上的是 plugin id（`PLUGIN_ID` 带点、短 id 不带，不撞）；`homePageContext`、`renderHomePluginStages` 遍历 Home 登记。项目里存的插件清单不改键。

**统筹 10-25 定①**（插件同等待遇，用户 10-18）：不随宿主发布的 Home 插件按个人插件算，每个项目都显示，项目隐藏了才不显示。做法：宿主的 Home 登记（`HomePluginHost.outsideBuild()`：起动名单之外、没有项目一半的，按 plugin id）经 `apps/local-host/src/home-registration.ts` 交给目录的 `isPersonal`（隐藏清单只收登记里有的 id，请求给的不算）和 #1266 的同一个判断：`projectReachablePlugins` 加可选的 `outsideBuild`（默认空，不传就到不了），`reachEntry` 对这类插件给 `{ personal: true, project_plugin_id: <plugin id> }`；动作可用性、`homeProjectReach`、`homeRouteProjectPlugins` 都用它，不另写判断。双实例的照旧经项目一半。RAC-569 另加：别的项目隐藏它不影响这个项目；登记里没有的 id 不能隐藏。

### PR-B4 项目级监督器条目改成生成（PG-067，单独一个 PR）

- 登记加 `project_runtime?: { create; package_name; factory_export }`（与 `runtime` 分开：Shelf 是双实例，两半都要）。12 条不带端口的条目写进各自的登记；生成的平台文件带出它们；`project-plugins.ts` 只留 Files 一条手写（它要 `readable` 端口，等 PG-005 与 X-5，BL-616），其余按登记生成，库在 Home 的（`manifest.databases.home`）只在有 Home 目录时加，与今天的 `homeLibraryPlugins()` 一致。
- 起停顺序按 `catalog_order`；与今天的顺序不同的地方实现前先核是否有依赖（今天的注释说伴随插件「一起启动」，不靠顺序）。
- `tests/builtin-plugin-assembly-gate.test.ts` 的 `RUNTIME_ASSEMBLED` 改读生成物；`home-runtime-entries.mjs`、`assembly.mjs`、`package-inventory.mjs` 认 `project_runtime`，同样要求字面量的包名与工厂名。`node scripts/gates/package-inventory.mjs --table` 重生成 §5.1 的行。
- 文档：`AGENTS.md` 硬约束里「项目级的是 `project-plugins.ts` 的监督器条目」改成写在包的登记上；`skills/molis-plugin-dev/host.md`。
- 实现时核过（10-25）：项目监督器的激活顺序由 `resolvePluginActivation` 按依赖排，名单顺序只决定没有依赖关系的几个谁先；`ProjectPluginState.plugins` 只当集合用（`project-plugin-stages.ts`）。所以名单改成「登记按 `catalog_order`，再接手写的 Files」，与之前的差别（Home 库六个之间、Diff 与 Git 互换、Files 挪到最后）不影响谁能启动。双实例门禁（`scripts/gates/dual-instance.mjs`）同样认 `project_runtime` 为项目一半；Files 一条记 BL-616，`tests/builtin-plugin-assembly-gate.test.ts` 的 `HAND_STARTED` 冻结、只许减少。

### B 的验收

| 编号 | 内容 | 提交 |
| --- | --- | --- |
| RAC-564 | 平台层（`apps/local-host/src`）没有文件从工作台取目录或它派生的平台事实，按 AST 读 import/export（含 named alias、type import 与 namespace 成员）；继续允许外壳渲染两项与成果类型五项（A3 删），拒绝字面量路径的运行时动态导入、相对路径伸入工作台、无法确定成员的 namespace 转交。`tests/registry-host-imports.test.ts` 用真实源码及同一扫描入口的定向变体证明允许项通过、目录与平台事实的别名读取失败。#1279 的 `host-plugin-ids.ts` 改读平台登记仍归身份线与 Claude carrier 组合，不在此项测试修复中改生产源 | B1 |
| RAC-565 | 装进 Home 的包带着 `molis-work.registration` 和 `registration` 导出，不进启动名单、不拿 `bundled`、不能用内置 plugin id 作提供方（S-08、S-15，进 `pnpm test:security`）。「提供方身份」与 ac-trust T6（S-68、BL-506）重叠：实现前看 T6 的状态，只留一处检查，这里只断言结果 | B1 |
| RAC-566 | 门禁的旧读法被拒：手写数组形式的目录、手写的平台名单，`catalog-entries.mjs` 与 `--check` 都失败 | B1 |
| RAC-567 | `--check` 对两份生成文件都核：任一份过期、手改、缺一份都失败 | B1 |
| RAC-710 | Q3 的拒绝用例：页面把 `personal`、`companions`、`always_on` 改了再提交（加、移除），宿主照自己的登记办：加 Text Stats 仍带上 Files，移除 Pages 仍是在这个项目隐藏，Goals 仍不能移除（`catalog.plugin_always_on`） | B1 |
| RAC-711 | 目录上的标记只由宿主按自己的登记写：内置插件的 `personal` 与 `companions` 与登记相同；`always_on` 只认这个 Home 同意过的；跑着的插件只有 plugin id 与发布者都与内置相同时才带标记 | B1 |
| RAC-568 | `summary`、`developer` 从 Manifest 读；SDK 检查拒绝空 `summary`、超长、`developer: false` 与非布尔；登记里再写这两项，`--check` 报不认识的键 | B2 |
| RAC-569 | #679：夹具登记一个目录里没有的 Home 级插件，项目路径下能路由；项目隐藏它后是 `actions.plugin_disabled`；`/plugins/<键>` 能打开（S-31，进 `pnpm test:security`） | B3 |
| RAC-570 | 生成的项目级条目与改之前手写的逐条相等（包名、工厂名、`bundled`、有无 Home 目录时的取舍），一次性比对贴进 PR | PR-B4 |
| RAC-571 | 新的项目级插件只在自己的登记上写 `project_runtime` 再重生成，就由监督器装配，`project-plugins.ts` 不变 | PR-B4 |

**碰的枢纽文件**：`builtin-plugins.ts`（生成，内容不变）、`project-plugins.ts`（PR-B4 大改；FI-6、ac-clients-1 也会碰）、各包 `registration.ts`（B2 去两项、PR-B4 加 `project_runtime`）、`tests/builtin-plugin-assembly-gate.test.ts`、`scripts/workspace-packages.mjs`（只加 issues 依赖）、`.github/CODEOWNERS`。冻结只从推送到合入为止，同批的照 `MERGE-QUEUE.md` §1a 一起落。

**开工前核对**：batch-35、#1243 已合；`MolisWorkLocalHost` 的现行行数与方法数；21 个文件逐个确认走哪条（平台事实 / 外壳渲染 / 成果类型）；`page-assets` 字节不许变（B 不动客户端）；`action-contract-host.mjs`、`page-assets.mjs`、`affected-tests/rules.mjs` 读目录的地方是否跟着改。

## 4. PR-C：PR-2，依赖改成生成，门禁 7→0（PG-069）

- **应用依赖**：生成器把两个应用 `package.json` 的插件依赖写成生成文件 import 的那一组（workbench 读外壳那份，local-host 读平台那份），`--check` 核对：多一个、少一个各失败（用户 10-19 批的豁免条件，每种不符一条门禁测试）。`pnpm install --frozen-lockfile --offline` 照常过（锁文件同 PR 更新）。
- **登记表不点名插件**：`scripts/workspace-packages.mjs` 里 24 条插件的 `entry(...)` 改成从 `plugins/native/*/package.json` 的 `molis-work` 块读（`path`、`kind`、`maturity`、`contract`、`migrationGoals` 已经在里面；把说明、不负责、`capabilities`、`extraWorkspaceDependencies`、`extraDependencies` 也搬进去）。两个应用条目的插件依赖由生成器给，不再手写。这接上 X-1 的插件依赖声明：插件自己的依赖写在自己的 `package.json`。`kind` 与 `maturity` 不随包自报：`plugins/native/*` 由路径定为 `native-plugin`、`partial`，包里写别的就报错（#1299 一轮评审，RAC-576）；层规则与 CODEOWNERS 角色都按 `kind` 判断，自报就能绕开它们。
- **根 `package.json`**：今天列了全部插件包，测试按包名取它们。用户 10-25 定（统筹弹窗）：根的插件依赖也由生成器写，和两个应用用同样的豁免：只在 `--check` 通过、且依赖清单正好等于生成文件 import 的那一组时生效。根对应的那一组是两份生成文件（外壳那份与平台那份）import 的并集；`--check` 对根同样「多一个、少一个各失败」。
- **门禁 7→0**：`NEW_PLUGIN_OUTSIDE_FILES` 改成 0（统筹 10-23 定，§5 第 7 条）。改门禁脚本本身，PR 正文写理由。
- PG-070 的客户端打包那一半归 `ac-clients-1`，C 不碰 `page-assets.ts`、`initialization.ts`。

| 编号 | 内容 |
| --- | --- |
| RAC-572 | 两个应用与根的 `package.json`，插件依赖与生成文件 import 的那一组（根是两份的并集）不符时 `--check` 失败：三份各有多一个、少一个两条测试；相符时豁免生效、不符时不生效 |
| RAC-573 | `workspace-packages.mjs` 不含任何插件包名；登记表从各插件 `package.json` 读出的条目与改之前逐字段相等（一次性比对贴进 PR） |
| RAC-574 | 新插件只改自己的包（`registration.ts`、`package.json`、源码）再跑生成器与 `pnpm install`，就进目录、进监督器、进依赖，外壳与宿主一个文件不改（W5-02-REG-03 的完整版：在临时仓库副本里加一个最小包，跑 `--check` 与 `pluginOutsideMentions`，点名数为 0） |
| RAC-575 | 门禁对新插件的额度是 0：临时副本里新插件被包外任一个手写文件点名，门禁失败 |
| RAC-576 | `plugins/native/*` 的 `kind`、`maturity` 由路径定：仓库副本里把一个插件 `package.json` 的 `kind` 改成 `foundation`、或 `maturity` 改成别的，`scripts/check-package-boundaries.mjs`（`pnpm boundary:check`）失败并点名该插件 |

**碰的枢纽文件**：`scripts/workspace-packages.mjs`（大改；冻结）、两个应用与根的 `package.json`、`pnpm-lock.yaml`、24 个插件的 `package.json`、`scripts/gates/assembly.mjs`、`scripts/generate-plugin-registry.mjs`、`scripts/package-owners.mjs`（若它读登记表的字段）。

**开工前核对**：谁读 `WORKSPACE_PACKAGES` 的插件字段（`package-owners.mjs`、`check-package-boundaries.mjs`、`package-inventory.mjs`、`module-repository-exports.mjs`）；README「开发要求」检查是否依赖条目上的说明文字。

**实现（2026-10-25，叠在 B4 上）**：

- 24 个插件的 `molis-work` 块补进说明、不负责、`legacySources`、`capabilities`、`extraWorkspaceDependencies`、`extraDependencies`（`owner` 仍按目录由 `package-owners.mjs` 的规则得出）；`workspace-packages.mjs` 读 `plugins/native/*/package.json` 得出这 24 条，导出 `REGISTERED_PLUGINS`，两个应用条目用 `registeredPluginDependencies: true` 由它推出插件依赖。RAC-573：改前改后逐字段比对，24 条无一字段不同。`capabilities` 以登记表那份为准（插件 `package.json` 里原有的旧单子没人读，一并换掉）。
- 生成器的 `PLUGIN_DEPENDENCY_MANIFESTS`（workbench → 外壳那份、local-host → 平台那份、根 → 两份的并集）：`--check` 报多一个、少一个、不是 `workspace:*`；写模式只在插件依赖不对时改写，依赖按码点排序（三份 `package.json` 这次按它重排了一遍，内容不变）。门禁的豁免读同一张表，不另写名单。
- 门禁：`NEW_PLUGIN_OUTSIDE_FILES = 0`，超额的提示写「a new plugin may be named in none」。`tests/health-gates-structure.test.ts` 里原来「8 个超额、7 个通过」两条是预期变化，改成新语义：包外 1 个文件（宿主源码、脚本各一条）就失败，0 个通过。
- RAC-574 写在 `tests/plugin-registry-generation.test.ts`：以 text-stats 为样本在仓库树上加一个带 `project_runtime` 的新包，只跑生成器，包外变的只有两份生成文件和三份 `package.json`，项目监督器读得到它，门禁的量法（放宽到全部受跟踪的文本文件）点名数为 0；再加一个手写文件或让一份 `package.json` 偏离生成结果，点名数变 1（RAC-575）。没有拷整个仓库：生成器与门禁都是读快照的纯函数，在快照上改与在副本上改等价，又快得多。

### PR-C 补充工单（#1299，2026-10-25，F2）

状态：已接受，作者实现与定向验证通过，候选待独立双审及采用。固定起点 `301e13bdeddb5522bd2a817a58f9c58737d09269`；对应 FIRST `6400258584`、作者修订 `6400447721`、增量评审 `6400500866` 的三项非阻塞建议。完成目标是声明准确、真实门禁夹具可重复运行，以及现有 Files/Git/Diff 用户动线实操通过；不把它扩成整条防腐线或发布验收。

- 核对 Schedule、Shelf、PPT 的包声明、公开 `packageDescriptor` 与实际处理器。Schedule 补已实现的对话任务及动作，Shelf 补已实现的动作；当前 PPT 两处均声明 `ppt.pptx-export.v1`，且导出处理器调用 `buildPptx`，保留有效声明。只修缺漏元数据，不增加能力、动作、导出或版本。
- RAC-576 以 `git ls-files -z` 的受跟踪文件建立干净副本，仅链接真实检查需要的已安装依赖（TypeScript 和 test-kit 的公开构建入口）；不复制检出里的未跟踪目录、其他工作树、缓存或构建输出。先跑未修改副本的正控制，再分别修改 kind 与 maturity，保留真实检查器、插件专属错误与 120 秒用例时限。用一个很小的未跟踪嵌套哨兵证明复制边界，结束时清理自建目录。
- 读取目录、监督器依赖启动、就绪与默认端口绑定链，核实顺序变化。复用现有有限用户动线验证实际文件内容、固定快照和 Git 差异；浏览器使用隔离 Home、独立资料目录及公共 FIFO，结束时关闭本次浏览器。若发现真实启动回归，先报告根因和影响，再做必要修复。

接线核对：`projectRuntimeDeclarations()` 按目录列出条目，`projectPluginEntries()` 末尾加 Files；`PluginSupervisor.start()` 先录取条目，再由 `resolvePluginActivation()` 按插件 ID 排序、解析并排序能力依赖，逐个等待实际激活。`platform.start()` 等监督器返回后重算 wiring、恢复事件；项目随后执行 `bindDeclaredDefaults()`，按已运行的 Manifest、端口类型与已选来源建立默认连线并再次求值。Files/Git 在自己的动作中读取当前项目工作区，Diff 读取固定版本或已绑定输入；三者的 `start()` 不要求另一个伴随插件已按名单的相邻位置启动。因此当前实现中目录顺序不决定最终激活顺序，端口也在启动完成后统一连线；真实可用性仍以本工单的用户动线为准。

| 编号 | 验收与证据 |
| --- | --- |
| W5-02-REG-04 | 三个插件的包能力清单与已核实实现的公开描述一致；`tests/plugin-registry-generation.test.ts` 直接读取包声明并比较公开导出，相关 Schedule/Shelf/PPT 现有用例验证处理器。PPT 不因旧评审提示而删除有效导出。 |
| W5-02-REG-05 | RAC-576 的未修改副本通过真实 `scripts/check-package-boundaries.mjs`；kind→foundation、maturity→contract-only 各自只报 text-stats 对应的精确错误；未跟踪嵌套哨兵未进入副本，原 120 秒时限保持。 |
| W5-02-REG-06 | 记录真实启动/就绪/默认连线顺序；`tests/coding-workbench.e2e.test.ts` 在本次同源构建上实际读取 Files 内容、捕获前后快照、显示 Diff 变化及 Git 差异，`tests/coding-companion-http.test.ts` 补独立启用和真实端口内容验证；不得仅以名单或状态存在认定可用。 |

允许修改：本 slice、Schedule/Shelf/PPT 的必要包能力声明、现有 registry 测试及有证据需要的相关验证。保留路径决定的 kind/maturity、可信 `project_runtime` 身份与 PG-069 的生成依赖唯一来源；不碰 #1301 存储声明、Images 在途字段或其他切片。源代码与包元数据准备完后只做一次必要的公共 FIFO 整体构建，再运行上述定向用例、生成器 `--check`、真实边界检查、health 与推送前 secrets；不跑全量，不改生产门禁、阈值、CI 或 Verify，不新建 PR。

作者验证（2026-10-25）：公共 FIFO 整体构建通过，后续公开指纹计算与该次构建一致。registry 最终 16/16；Schedule actions、conversation tasks、Shelf actions、PPT actions、companion HTTP 五文件 23/23；专用测试浏览器的现有 Coding workbench 动线 1/1、未跳过，含实际前后文本、暂存/未暂存文本与嵌入 Files 读取。真实边界检查、生成器检查、最终 health 与 31 项资源预算通过。首轮 registry 因复制目录符号链接失败，改为显式复制链接或普通文件后重跑通过；首轮失败保留，未改拒绝语义或时限。全仓 lint 仍退出 1（649 项）；准确父源码临时副本有 644 项，额外 5 项来自本次未修改的两个文件，未建立完全等价的全仓 lint 环境，不能据此宣称全仓 lint 通过。改动范围内的 4 项原有 `any` 与父源码对照一致；未放宽规则或做无关清理。

## 5. PR-D：PR-3，外壳与设置的手写名单（PG-072～076）

D 移交 ac-shell（统筹 10-25）：下面是移交时的核对与拆法，验收号由 ac-shell 从自己的号段给，不再用 RAC-576～578。

开工前逐条再核（W5-06 2b 已收掉一部分），每条写成「声明在哪、谁读」：

| PG | 还剩的 | 改成 |
| --- | --- | --- |
| 072 | Coding 设置页的模型由宿主拼（`web-catalog.ts`），宿主按贡献 id 分支 | 设置页的数据经 Coding 自己的动作取（设置视图声明它的读动作），宿主不再点 Coding；平台自己的项目设置节另成一份（§4 i，A2-3 的检查器放那里） |
| 073 | 搜索标签里的 `"artifacts"` 字面量；选中记录靠工作台拿选择器认 | 成果库那一项随 A6（平台面）走；选中记录由插件发登记过的选中事件（`dom-events.ts` 登记） |
| 074 | `RAIL_CORE_ORDER`、`RAIL_EXTEND_PLUGIN_IDS`、`DOCK_DEFAULT_PINS` | 视图声明加 `pinned_default`、`rail: "core" | "extend"`（名字实现时定），平台给的顺序按 Manifest；用户设置覆盖 |
| 075 | `MW_PLUGINS`（色相）、`PLUGIN_ICON` | 图标读 Manifest 视图已有的 `icon`；色相加一项 Manifest 声明（限定在 design-system 的色名里），两张表删掉；保留「每个插件图标唯一」的测试，改读 Manifest |
| 076 | 目标输入的 `CREATE` 归 ac-shell 第 1 片关掉（统筹 10-24）；D 只做 PG-076 余下的三项（Pages 的 searchRow 借用 Feed 的选择器、Todo 的初始化接线、开工前重核的第三项） | 改从登记表或消费场景读 |

移交时写的验收（ac-shell 按上表细化、另给号）：外壳与设置里不再有按插件名列的表（按源码扫描，只许减少到 0）；一个新插件只靠声明就出现在正确的分组、带图标与色相、能被设成默认固定；界面与改之前相同（组件板 `/__ui/catalog` 的快照与几张现有截图不变，浏览器部分交统一验证窗口）。

**碰的文件**：`apps/workbench/src/immersive-shell.ts`、`plugin-catalog.ts`、`goal-inputs-html.ts`、`scripts/client/global-search.ts`、`tab-workspace.ts`、`apps/local-host/src/web-catalog.ts`、`packages/design-system/src/palette.ts`、`icons.ts`、`packages/contracts/src/platform/ui.ts`（视图声明）、相关插件的 Manifest。改合同，`pnpm api:update`。与 W5-04 在途片（客户端打包）错开：它们改各插件的 `registration.ts` 与客户端，D 只改 Manifest 视图声明与外壳。

## 6. PR-E：W4-01 探针插件夹具

spec 10-15 定 W4-01 推迟到 W5-02 之后：bundled 插件得在 `project-plugins.ts` 里点名，探针做不到「id 只在自己的包里」。C 合入后这条不再成立。

- 探针放在 `examples/probe-plugin/`（不进产品构建，不进目录）。测试在临时仓库副本里把它放进 `plugins/native/`、跑生成器、构建本插件与 local-host，再在临时 Home 里走安装→发现→调用（含 `/api/plugins/<id>/`）→升级→停用→撤权→卸载；同时作为装上的插件走一遍同样的生命周期，两边结果一样（同等待遇）。
- 声明新合同：搜索与文件来源、撤销、到期提醒、`background` 作业、方法、放置。
- `scripts/replay-plugins.mjs` 的语料（plugin-sample、2～3 个创作台产物、一个打包的 Runtime 内置插件）：创作台产物从哪来，spec 10-15 第二行已定（隔离 Home 里用 MiniMax 真跑）。
- 验收 RAC-579；号不够时向统筹要。E 的细节在 C 合入后补进本稿，再请统筹审。

**统筹 10-25 定（方案 1）**：查实「装上的插件」今天没有安装入口（没有 `plugin install`，安装服务是 ac-trust T2，未合入），所以 E 分两步、叠在本地分支 `claude/ac-registry-w401` 上，整组补齐才推送、开 PR：先按内置在一次性 Home 里跑完整生命周期并加 `replay-plugins.mjs`；装上的那一半等 T2 合入再补。B4 + C 先开一个 PR。装上的插件声明不了的两项先不进探针，各记一行后续：到期提醒（只能是 Home 范围的动作，装上的插件没有 Home 一半，BL-621）、放置（要带 `project_rows` 的 Home 库，BL-620，BL-622）。

## 7. PG-095、PG-111 的评估（插件合同放在平台 contracts 里）

登记这条线不依赖它们：`registration.ts` 只引用插件自己的 Manifest 与常量，不读 `contracts/modules/<插件>`。所以不进上面五个 PR。

| 合同 | 包外谁用 | 评估 |
| --- | --- | --- |
| `modules/images.ts` | 只有 Images 自己和 1 个测试 | 挪进 Images 的公开入口（新子路径 `./contract`），小，一个 PR |
| `modules/jelly.ts` | 只有 Jelly 自己和 2 个测试 | 同上，可与 Images 同一个 PR |
| `modules/shelf.ts` | `modules/shelf`（8 个文件）、Images（2 个，`SHELF_ADMIT_ACTION`）、1 个脚本、5 个测试 | 先定主人：Shelf 的事实在 `modules/shelf`，合同跟模块走（挪进模块的公开入口）；Images 改成按动作 id 经动作目录调用，不 import。要统筹定主人 |
| `modules/alchemist.ts` | — | 不迁（BL-376） |
| PG-111 其余（lingguang、todo、ppt、pages、dataset、form、feed、characters、goals 等） | goals 146 个文件、characters 38、feed 36、pages 34…… | 照 PG-111 原定：随各插件迁 Runtime 的那一片挪（③），不单独排期 |

统筹 10-24 定：Images、Jelly 两份合同挪进各自的插件，不必等 C，作独立片写进 `CODEX-TASKS.md` 派给 Codex（BL-617）；Shelf 合同的主人是 `modules/shelf`，Images 改成按动作 id 调用、不再 import（BL-618）。本线不做这两项。

## 8. 统筹的裁定（2026-10-24）

1. 先后照稿：A → B → B4 → C → D → E。A 与 #1251 同批或排在它后面；B 等 batch-35（#1258，已含 #1243）落地后开工。
2. 成果类型五项留给 A3（照推荐）。
3. 根 `package.json` 由生成器写、加同样的豁免；统筹弹窗问过用户，用户 10-25 定：照做（§4）。
4. `project_rows` 按表声明照稿批准，S-暂A 批准；加三条必改（只删自己的库、沙箱库、`label` 与运行中的写连接），已写进 §2 与 RAC-561～563。
5. B 拆成两个 PR：B1～B3 一个，B4 单独一个。
6. PG-095：Images、Jelly 派 Codex（BL-617）；Shelf 合同归 `modules/shelf`（BL-618）。
7. 对齐：B1 复用 ac-shell 第 2 片的 `plugin_directory`；RAC-565 的提供方身份与 ac-trust T6 只留一处检查；PG-076 的 `CREATE` 归 ac-shell 第 1 片。

## 9. 沿用的决定（10-19，摘自协调分支的 PR-1 计划 §11、§14）

- 影响信任的字段留在可信登记，`summary`、`developer` 进 Manifest；范围只在 `runtime.scope`。
- 生成物的豁免按确切路径登记，只在 `--check` 通过时生效；扩到两个应用 `package.json` 里生成文件需要的插件依赖，只在 `--check` 通过、且依赖清单正好等于生成文件 import 的那一组时生效（用户 10-19 11:37 UTC）。
- 项目里插件的键保持短 id，装上的插件用 plugin id。
- 登记写唯一的 `catalog_order`。

## 10. 号段

- RAC：A 560～563；B 564～569；B4 570～571；C 572～575；576～578 原给 D，D 移交 ac-shell 后留给本线；E 579。统筹 10-25 续给 RAC-710～729：B 的目录标记两条用 710、711。
- BL（随各 PR 写进 `specs/BACKLOG.md`）：BL-615 Images 的项目数据按声明删（等 PG-104、PG-106）；BL-616 Files 的监督器条目（等 PG-005、X-5）；BL-617 Images、Jelly 合同挪进插件（Codex）；BL-618 Shelf 合同挪进 `modules/shelf`、Images 按动作 id 调用；BL-619 沙箱插件的 `project_rows`（#1255 落地后把拒绝改成删除）；BL-620 启动名单之外的 Home 插件与带 Home 库的项目插件的 `project_rows`（PR-A 中发现）；BL-621～624 留给实现中发现的。
- 安全不变量：S-暂A（删项目只按声明删、不跑插件代码，PR-A）；S-08、S-15（B1）、S-31（B3）改代码列。

## 11. privileges.md 状态（合入后由统筹改）

| PG | 合入后 |
| --- | --- |
| PG-024 | A 后：部分（插件按声明删；Images 等 BL-615）；BL-615 合入后已做 |
| PG-065 | B 后：已做 |
| PG-066 | A 后：已做（Alchemist 照 BL-376） |
| PG-067 | PR-B4 后：已做（Files 一条等 BL-616）；描述改成 13 条、只有 Files 带端口 |
| PG-068 | B 后：部分；C 后：已做（额度 0）；W6-01 收冻结名单 |
| PG-069 | C 后：已做 |
| PG-072～076 | D 后：已做 |
| PG-105 | B 后：已做（成果类型五项随 A3） |
| PG-095 | 不在本线；见 §7 |
| PG-111 | 不在本线；见 §7 |
