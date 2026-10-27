# 发布前检查清单

每次发布把这份清单复制进发布 PR 的描述，逐项勾选；做不到的项写明原因，不删项。规则出处是 [POLICY.md](POLICY.md)。

## 1. 定版本，写材料

- [ ] 对照上个 tag 以来的变化选次版本或补丁（[POLICY.md](POLICY.md) 第 2 节）。库版本有没有变，看第 3 节的表：`git diff <上个 tag> -- <表里的定义处文件>`。
- [ ] 这个版本会装到开发机之外吗？用户 2026-10-08 的决定 #15：「不留兼容」到第一个装到开发机之外的版本为止，1.0 或更早出现的第一个外部用户，哪个先发生，它就是那个版本（`specs/repository-anti-corruption/spec.md` §1）。会的话，发布 PR 把版本号、日期和提交写进 [docs/system/CONTRACT-CHANGES.md](../system/CONTRACT-CHANGES.md) 顶部的「起点日期」，并把它的第 3 节标为已结束；从那以后合同变更走那份文件第 4 节的读取兼容流程，库的版本变更要带升级路径，不再是拒绝加一次性维护（[POLICY.md](POLICY.md) 第 2、5 节和本清单第 4.3 节写的做法只到这一版为止）。那份文件第 5 节列的前置（公开 API 快照、动作合同快照、插件回放工具等）要在发这个版本之前就位；库的升级机制现在也没有，方案见 `specs/repository-anti-corruption/c-end-readiness.md` §3.2。不会的话，在这一项写明「不是外部版本」，仍按「不留兼容」办。
- [ ] 改版本号：根 `package.json`；`apps/desktop/src-tauri/` 的 `tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 里的 `molis-work-desktop`；`apps/local-host/src/product-version.ts` 的 `PRODUCT_VERSION`（Feed、搜索运行时、MCP 客户端、Codex 会话传输的版本都从它取；[POLICY.md](POLICY.md) 第 1 节）。
- [ ] 内置插件清单的版本与摘要：`BUILTIN_PLUGIN_CATALOG` 中现行的内置 Manifest（不在这里写死个数）均等于产品版本；`verify-release-versions.mjs` 核对源码，`tests/builtin-manifests-contract.test.ts` 核对构建后的目录。官方集成、示例与第三方插件独立编号。跑 `tests/plugin-release-artifact.test.ts` 验证 `bundled` 清单降版及同版本摘要变化仍跟随宿主。按第 4.5 节方法取得实际清单摘要并写入发布说明；表应覆盖整个目录，不只覆盖早期 7 个项目 Runtime 插件。
- [ ] [CHANGELOG.md](CHANGELOG.md)：`[Unreleased]` 改成 `[<版本>] - <日期>`，上面另起一个空的 `[Unreleased]`，页尾比较链接（若有）跟着改。
- [ ] 写 `docs/releases/v<版本>.md`，包含「兼容与升级」（哪些库的版本变了、旧 Home 要做什么、Runtime 要不要重新接入）和「发布范围与验证」（真实的回归数字、已知失败、没验证的东西）。
- [ ] `node scripts/verify-release-versions.mjs` 通过（打 tag 时再加 `--tag v<版本>`）。

## 2. 验证

- [ ] `pnpm install --frozen-lockfile`，整体 `pnpm build`，`pnpm test`。全量优先在 `full-suite.yml` 的 CI 分片运行，本机补 macOS 专属路径（见 [并行开发规范](../system/PARALLEL-DEVELOPMENT.md) 第 7 节）；浏览器用例需要本机 Chrome。全量回归期间不改源码、脚本、`package.json` 和 `skills/`（`AGENTS.md`「构建与测试」）。
- [ ] 失败的用例逐个分清：产品回归、预期变化、测试缺陷、环境与时序；对照干净基线工作树的结果。发布说明里写数字，不写「通过」两个字。
- [ ] `node scripts/check-health-gates.mjs --base origin/main` 通过。
- [ ] 构建安装包：`pnpm desktop:build:macos`（先跑版本核对，产物在 `release/macos/`，附 SHA256）。公开发行需要 Developer ID 签名与 Apple 公证，缺凭据时 tag 构建会失败（`.github/workflows/release-macos.yml`）；没有公证的本机构建不叫公开发行包。
- [ ] 安装器：源码与 `dist` 不一致会停止（`apps/local-host/src/installer/fingerprint.ts`）；所以发布构建前整体 `pnpm build`，不复用旧的 `dist`。
- [ ] 发 npm 归档（`pnpm package:npm` 的产物对外发出）时，飞书/Lark 连接器带来的两件已接受的事要如实写出（用户 2026-10-10 决定：接受，两件事写进安装说明和这份清单，不加 `overrides`，不打包依赖树；`specs/repository-anti-corruption/spec.md` §1、`dependencies-and-sdk-plan.md` §3.5）。（1）`docs/installation.md` 与 `docs/installation.en.md` 的「npm 路径上的飞书/Lark 连接器」一节还成立，发布说明的「兼容与升级」写同样两条：归档里的 `basic-ftp` 是带高危公告 GHSA-c475-qrg2-pj4r 的 5.x（只有用户自己把代理配成指向 FTP 上的 PAC 文件才会走到）；`keytar` 的安装脚本要联网或编译工具链，装好后连接器每次启动都读写钥匙串里服务名 `lark-mcp` 的一项并建 `lark-mcp-nodejs` 数据目录，都在 Home 之外（Home 之外的状态清单见 [HOME-DATA.md](../system/HOME-DATA.md) 第 8 节；该包的日志目录 `~/Library/Logs/lark-mcp-nodejs/` 不限于 npm 路径，安装说明同一小节末尾也写了）。（2）决定的前提还在：`npm view @larksuiteoapi/lark-mcp version` 仍是归档里固定的版本（有新版本就看它的依赖有没有升到 `basic-ftp` 6.2.1 以上），归档的 `package.json` 没有 `overrides`，`bundledDependencies` 里没有 `@larksuiteoapi/lark-mcp` 及其依赖树（里面本来有工作区包，不算），连接器没有改成别的接法；前提变了就重新弹窗问，不沿用这条决定。`node scripts/run-tests.mjs tests/npm-package.test.ts` 把（1）（2）里能机器核对的部分固定下来。

## 3. 各库版本表

每个库只认一个当前版本，不符时的处理在最后一列。表里有两类东西：Home 里的 SQLite 库，和两个版本不符就让全部凭据或授权失效的 JSON 文件（`feed/secrets.json` 拒绝读取，`config/mcp-tools.json` 明确拒绝读取）。其他带版本字段的小 JSON 文件（`shelf/catalog.json`、`browser/sites.json`、`jelly/preferences.json`、`config/` 下的各个文件，包括 `config/installation.json`）不在表里：它们的版本见 [docs/system/HOME-DATA.md](../system/HOME-DATA.md) 第 6 节的「种类 · 版本」列，版本不符时各自怎样没有逐个核对过，改其中任何一个的版本，就在发布说明的「兼容与升级」里写明。每个库的 owner、表、备份与卸载规则也在 HOME-DATA.md。位置都相对 Home（默认 `~/.molis-work`，`MOLIS_WORK_HOME` 可改）。

`scripts/verify-release-versions.mjs` 对照代码核对这张表，下面几种情况 CI 会失败：某行的版本和定义处的代码不一致；定义处不存在；包的 `src/` 里有一个 `SqliteBaseline` 常量（`const X: SqliteBaseline = {…}`、`const X = {…} satisfies SqliteBaseline`、`… as SqliteBaseline` 三种写法都算）没有列进表，或者它的版本不是对象里写成数字的 `version: N`（引用别的常量，脚本读不出来）；`applySqliteBaseline`、`openBaselineHomeSqlite` 收到的不是一个已声明的常量（内联对象不行）；标「无」的库的定义处文件加上了版本标记。它找不到的是完全不经 `applySqliteBaseline` 的新库（比如又一个只靠 `CREATE TABLE IF NOT EXISTS` 的库）和表以外的 JSON 文件，这类只能靠 HOME-DATA.md 的清单和评审发现。

插件自有库的 `PluginDatabaseDeclaration` 也按同一规则检查：必须具名、写出数字版本并列入下表。可信 Host 的连接服务仅转发这份声明；这一个类型化转发调用被单独识别，其余内联或未声明基线仍拒绝。

| 库 | 位置 | 版本 | 记在 | 定义处 | 版本不符时 |
| --- | --- | --- | --- | --- | --- |
| 项目库 | `projects/<project_id>/molis-work.db` | 10 | `user_version` | `apps/local-host/src/project-database-schema.ts#PROJECT_DATABASE_BASELINE` | 拒绝 |
| 项目库里 Coding 的表 | `projects/<project_id>/molis-work.db#coding` | 4 | `plugin_project_databases.version` | `plugins/native/coding/src/database.ts#CODING_PROJECT_DATABASE` | 拒绝（只停 Coding） |
| 项目库里 Feed 的表 | `projects/<project_id>/molis-work.db#feed` | 1 | `plugin_project_databases.version` | `plugins/native/feed/src/database.ts#FEED_PROJECT_DATABASE` | 拒绝（只停 Feed） |
| 项目库里 Goals 的表 | `projects/<project_id>/molis-work.db#goals` | 1 | `plugin_project_databases.version` | `plugins/native/goals/src/project-database.ts#GOALS_PROJECT_DATABASE` | 拒绝（只停 Goals） |
| 项目库里 Schedule 的表 | `projects/<project_id>/molis-work.db#schedule` | 1 | `plugin_project_databases.version` | `plugins/native/schedule/src/database.ts#SCHEDULE_PROJECT_DATABASE` | 拒绝（只停 Schedule） |
| 目录库 | `projects/catalog.db` | 23 | `catalog_meta.schema_version` | `apps/local-host/src/project-catalog-contract.ts#CATALOG_SCHEMA_VERSION` | 拒绝 |
| Functions | `functions/functions.db` | 4 | `user_version` | `modules/functions/src/store-schema.ts#FUNCTIONS_STORE_BASELINE` | 拒绝 |
| 助理 | `assistant/assistant.db` | 3 | `user_version` | `apps/local-host/src/assistant/assistant-store.ts#ASSISTANT_STORE_BASELINE` | 拒绝 |
| Home Plugin Runtime | `plugin-runtime/plugin-runtime.db` | 3 | `user_version` | `apps/local-host/src/home-plugin-store.ts#HOME_PLUGIN_RUNTIME_BASELINE` | 拒绝 |
| 装进来的插件的 Home 库账本 | `plugin-libraries/plugin-libraries.db` | 1 | `user_version` | `apps/local-host/src/installed-plugin-libraries.ts#LEDGER_BASELINE` | 拒绝 |
| 插件的本机目录授权 | `plugin-directories/plugin-directories.db` | 1 | `user_version` | `apps/local-host/src/plugin-directory-store.ts#DIRECTORY_GRANTS_BASELINE` | 拒绝 |
| 插件原文件登记 | `plugin-originals/plugin-originals.db` | 1 | `user_version` | `apps/local-host/src/material-original-files.ts#ORIGINAL_FILES_BASELINE` | 拒绝 |
| Issue | `issues/issues.db` | 2 | `user_version` | `plugins/native/issues/src/database.ts#ISSUES_DATABASE` | 拒绝 |
| Goals 的个人方法 | `goals/goals.db` | 1 | `user_version` | `plugins/native/goals/src/home-database.ts#GOALS_HOME_DATABASE` | 拒绝；目录库中的旧个人方法须显式维护移入，真实 Home 尚未执行 |
| 记忆 | `memory/memory.db` | 4 | `user_version` | `packages/storage/src/adapters/memory-ledger.ts#MEMORY_LEDGER_BASELINE` | 拒绝；旧有效偏好需显式采用，不在启动时重设 |
| 项目资料 | `knowledge/knowledge.db` | 3 | `user_version` | `packages/storage/src/adapters/knowledge-cards.ts#KNOWLEDGE_CARDS_BASELINE` | 拒绝 |
| Form | `form/form.db` | 2 | `user_version` | `plugins/native/form/src/database.ts#FORM_DATABASE` | 拒绝 |
| 放置 | `placement/placement.db` | 1 | `user_version` | `apps/local-host/src/placement-actions.ts#PLACEMENT_BASELINE` | 拒绝 |
| Agent 定义 | `agent-definitions/agent-definitions.db` | 1 | `user_version` | `apps/local-host/src/agent-definitions/agent-definitions.ts#AGENT_DEFINITIONS_BASELINE` | 拒绝 |
| 插件的 Agent 声明 | `agent-declarations/agent-declarations.db` | 1 | `user_version` | `apps/local-host/src/agent-definitions/agent-declarations.ts#AGENT_DECLARATIONS_BASELINE` | 拒绝 |
| 连接 | `connectors/connectors.db` | 2 | `user_version` | `apps/local-host/src/connectors-store.ts#CONNECTORS_BASELINE` | 拒绝 |
| 引导 | `context-onboarding/context-onboarding.db` | 1 | `user_version` | `apps/local-host/src/context-onboarding-store.ts#CONTEXT_ONBOARDING_BASELINE` | 拒绝 |
| Cognia | `cognia/cognia.db` | 1 | `user_version` | `plugins/native/cognia/src/database.ts#COGNIA_DATABASE` | 拒绝 |
| Dataset | `dataset/dataset.db` | 1 | `user_version` | `plugins/native/dataset/src/database.ts#DATASET_DATABASE` | 拒绝 |
| Images | `images/images.db` | 1 | `user_version` | `plugins/native/images/src/database.ts#IMAGES_DATABASE` | 拒绝 |
| Jelly | `jelly/jelly.db` | 1 | `user_version` | `plugins/native/jelly/src/database.ts#JELLY_DATABASE` | 拒绝 |
| 灵光 | `lingguang/lingguang.db` | 1 | `user_version` | `plugins/native/lingguang/src/database.ts#LINGGUANG_DATABASE` | 拒绝 |
| Pages | `pages/pages.db` | 2 | `user_version` | `plugins/native/pages/src/database.ts#PAGES_DATABASE` | 拒绝 |
| PPT | `ppt/ppt.db` | 1 | `user_version` | `plugins/native/ppt/src/database.ts#PPT_DATABASE` | 拒绝 |
| Todo | `todo/todo.db` | 1 | `user_version` | `plugins/native/todo/src/database.ts#TODO_DATABASE` | 拒绝 |
| Workflows | `workflows/workflows.db` | 1 | `user_version` | `plugins/native/workflows/src/database.ts#WORKFLOWS_DATABASE` | 拒绝 |
| 炼金术士工作室 | `alchemist/projects/<编码后的 project_id>/studio.sqlite` | 1 | `user_version` | `plugins/native/alchemist/src/studio/server/db/schema.ts#ALCHEMIST_STUDIO_BASELINE` | 拒绝 |
| server（讨论） | `server/server.sqlite` | 2 | `user_version` | `server/src/database.ts#SERVER_DATABASE_BASELINE` | 拒绝 |
| 角色 | `characters/characters.sqlite` | 2 | `user_version` | `modules/characters/src/open.ts#CHARACTERS_STORE_BASELINE` | 拒绝 |
| 搜索索引（可重建的派生库） | `search/search.db` | 3 | `search_meta.schema` | `packages/storage/src/adapters/text-search-database.ts#TEXT_SEARCH_SCHEMA_VERSION` | 清空重建 |
| 密钥与凭据（JSON 文件，不是库） | `feed/secrets.json` | 2 | 文件里的 `version` | `packages/storage/src/adapters/file-secret-store.ts#FORMAT_VERSION` | 拒绝读取（报错 `secrets file format N is not supported`），模型 API Key、连接器凭据和 Feed 证据密钥全部读不出 |
| MCP 授权（JSON 文件，不是库） | `config/mcp-tools.json` | 3 | 文件里的 `version` | `apps/local-host/src/mcp-settings-store.ts#MCP_TOOL_PREFERENCE_VERSION` | 拒绝读取并报告配置错误；保留原文件，明确修复后恢复 |
| 炼金术士搜索缓存 | `alchemist/projects/<编码后的 project_id>/search.sqlite` | 1 | `user_version` | `apps/local-host/src/alchemist-search.ts#ALCHEMIST_SEARCH_BASELINE` | 拒绝 |

- Pages 评论线程将库基线从 1 改为 2，新增 `page_comments`，正文与块备注保持原结构。旧 Home 仍拒绝直接打开；真实 Home 尚未执行这一项维护，发布前须在副本演练并取得维护授权。实现与隔离验证见 [Pages 与助理规格](../../specs/archive/pages-assistant-surfaces/spec.md)。
- 统一服务接入将连接库基线从 1 改为 2，授权结果增加接入方案与发起者字段，并由连接 owner 保存最近检查和调用观察。原连接、协议、绑定及凭据引用保留；隔离副本维护已演练，真实 Home 尚未维护，不能直接用新构建打开旧库。维护与回退边界见[统一服务接入规格](../../specs/assistant-service-connections/spec.md) §9.3。
- W5-16 B1 将讨论库从 1 升至 2，邀请只存 SHA-256，生成/更换回执不含原文；新建群尚无邀请，页面只在本人明确操作时生成。旧 v1 由运行时拒绝，不自动升级。一次性维护与 W5-17、Goals S9 进入同一个批准窗口：先在副本 `node tests/fixtures/im-invite-maintenance.mjs list --home <副本> --json`，再在已停写的副本 `apply --home <副本> --backup <Home 外的新目录> --json`；原链接仍有效，其他业务事实保持，新文件及 backup API 副本无已知邀请原文字节。原件和 WAL 留在私有备份，不进新快照。若留下 `server/.invite-maintenance.json`，宿主拒绝打开，先按 HOME-DATA 3.4 恢复原件；真实 Home 本项尚未执行，不能勾为完成。演练：`tests/im-invite-maintenance.test.ts`。

- Sessions 收尾 SC-2 将角色库基线从 1 改为 2，新增 `character_runs`（角色的原生执行记录：谁、哪个项目、哪个版本、任务、目录、是否派发成功；不存终端输出），草稿表不变。旧 Home 仍拒绝直接打开；真实 Home 尚未执行这一项维护，发布前须在停宿主、整份备份后按 `tests/fixtures/characters-maintenance-v2.sql` 维护（演练 `tests/characters-maintenance-v2.test.ts`，维护清单见 `specs/repository-anti-corruption/spec.md` §4.1）。以前记在会话库里的角色运行不迁。
- 「拒绝」是 `applySqliteBaseline` 的行为（`packages/storage/src/sqlite-baseline.ts`）：空文件建基线并写版本，版本相同照常打开，其他一律报错，带路径、找到的版本和期望的版本，不就地升级。目录库用自己的 meta 表，同样只认当前版本（`apps/local-host/src/catalog-schema.ts` 的 `assertCurrentCatalog`）。
- Sessions 下线（SC-4，2026-10-23）：`sessions/sessions.db`（v7）从上表删去——业务运行不再打开它，也没有升级路径；W5-16 离线技术备份只按 registry 的固定 owner/meta v7 声明用 backup API 保存，不恢复业务读者；旧库与 `sessions/content/` 留在 Home 里，备份与 `uninstall --purge-user-data` 仍按存储登记处理，清理另做（SC-5，在备份副本上，经用户批准）。
- （实验插件已在 2026-10-10 删除，它的私有库不在上表里，Home 里残留的目录由第 4.3 节的维护六移出；下面是维护五当时的写法，作为历史保留。）实验插件私有库和炼金术士搜索缓存原来没有版本（`CREATE TABLE IF NOT EXISTS`，旧库和新库没有区别），路线图 W2-05（用户 2026-10-08 决定 #21）给它们各一份基线，版本 1。新建的文件带版本；已经存在的旧文件有表没有版本，新构建拒绝打开，所以真实 Home 的实验库要先盖版本 1：一次性维护 `tests/fixtures/store-maintenance-experiments-private-v1.sql`（炼金术士搜索库对应 `store-maintenance-alchemist-search-v1.sql`，对每个 `search.sqlite` 各跑一次；2026-10-08 的真实 Home 里没有这种文件），每份一个事务，库不是未盖版本且与基线逐项一致就整体回滚，只写 `PRAGMA user_version = 1`、不动任何表和行。窗口里用同目录的 `store-maintenance-run.sh` 跑（先演练再 `--apply`，会先整份备份），`store-maintenance-verify-open.mjs` 用新构建打开盖过的拷贝；逐步命令与演练记录见 [防腐整理 spec](../../specs/repository-anti-corruption/spec.md) §4.1 的维护五。真实 Home 已于 2026-10-09 做完（维护五：`plugins/experiments/private.sqlite` 盖到 1，备份 `~/molis-work-backups/2026-10-09-before-maint5-r2`），这两份 SQL、两个脚本和演练用例 `tests/store-version-maintenance.test.ts` 随后删除；别的 Home 若还有未盖版本的文件，从 Git 历史取（`git show bccdcee17:tests/fixtures/store-maintenance-run.sh` 等）。「无」只留给没有任何版本标记的库，现在这张表里没有；表里的行由 `verify-release-versions.mjs` 对着基线常量核对。
- 项目库 v7（2026-10-10，用户决定删除 Casebook）比 v6 少 Casebook 的 5 张表（`casebook_interaction_scopes`、`casebook_interaction_facts`、`casebook_goal_contexts`、`casebook_interaction_audit_keys`、`casebook_interaction_actions`），别的表没变。新构建拒绝 v6 的项目库，只认 6 的旧构建（Home 安装版、已开着的会话里的 MCP）拒绝 v7，所以带这一行的发布要先做真实 Home 的维护六，见第 4.3 节。
- 项目库 v8（2026-10-20，PG-020，`specs/plugin-project-database` L1b）：基线只剩平台与 Module 的表，多两张平台表——项目根 `project_root`（每库正好一行，id 与 Goals 的 Board 相同）和插件库账本 `plugin_project_databases`——11 张表的外键由 `boards` 改指 `project_root`。Coding、Feed、Goals、Schedule 的表不在基线里了（Coding、Feed、Schedule 的 8 张；Goals 的 31 张，含 `boards` 与治理的 4 张，S8）：各插件在 Manifest 的 `databases.project` 声明，Host 打开项目库时由平台第一次建表并记账本，以后按账本核对，发布者、版本或形状不符只停这个插件（Goals 被拒也只停 Goals），库和别的插件照常打开（上表 `#coding`、`#feed`、`#goals`、`#schedule` 四行；`位置` 里 `#` 后面是声明的 `store_name`）。Goals 的 `boards` 去掉了 `title` 列（项目名只在项目目录里），`project_id` 的外键指 `project_root`、随它删除，Goals 的其余 30 张表仍指 `boards`。新构建拒绝 v7 的项目库，只认 7 的旧构建拒绝 v8，所以带这一行的发布要先做第 4.3 节维护八里的项目库一项，有 v7 项目库的 Home 在维护之前不装新构建。
- 项目库 v9（SYS-15）新增 scheduler 拥有的 `schedule_action_bindings`，将定时动作绑定到安装 id、世代和动作版本。旧任务不会由新安装自动执行。v8 拒绝直接打开；维护需在副本上建表并将缺少安装绑定的旧闹钟暂停，保留任务和历史，由人明确恢复。临时副本维护与失败回滚演练已通过（`tests/project-maintenance-v9.test.ts`，脚本 `tests/fixtures/project-maintenance-v9.sql`）；真实 Home 尚未维护，不能安装此构建到现有 Home。进度见[系统评审修复规格](../../specs/archive/system-review-fixes/spec.md)。
- 项目库 v10 与 Home Plugin Runtime 库 v3（ac-trust T1，`specs/repository-anti-corruption/slices/ac-trust-install.md`）：安装记录表 `plugin_runtime_installs` 多一列 `publisher_trust`（`host`、`pinned`、`unsigned`，记录自己的 JSON 里也有同名字段），Home Runtime 库另多同意账本 `plugin_consents` 与发布者固定表 `plugin_publishers`。旧版本拒绝直接打开；维护按安装记录的 `execution` 补证据（`host` → `host`，`sandbox` → `unsigned`，两者之外的整笔回滚），演练是 `tests/project-maintenance-v10.test.ts`、`tests/plugin-runtime-maintenance-v3.test.ts`。内置插件的同意行由宿主启动时按当前 Manifest 幂等补上，不在维护里写。
- 每次发布把这张表和上个版本的对比写进发布说明的「兼容与升级」，标出变了的行。上个版本没有这张表时，用 `git show <上个 tag>:<定义处文件>` 逐行取旧值。

## 4. 真实 Home 的处理

真实 Home 是用户每天在用的数据，任何一步都先问「改坏了能不能退回去」。产品里没有备份和升级命令：备份是离线整份拷贝（`docs/installation.md`「离线备份与恢复边界」），升级库结构靠发布者提供的一次性维护流程。用户 2026-10-08 在 `specs/repository-anti-corruption/spec.md` §1 里定了两件事，落在下面：升级前的快照（「备份范围与卸载并清除数据」一行，第 4.2 节）；真实 Home 的维护与残留（「真实 Home 的残留物」一行，第 4.3 与 4.5 节）。

### 4.1 动手前

- [ ] 没有人在写这个 Home。一个 Home 只有一个执行进程（`AGENTS.md`）：常驻服务 4173、开发用的 4207/4208 都停掉，`"$HOME/.molis-work/bin/molis-work" service status --home "$HOME/.molis-work" --json` 和 `ps` 确认没有连着这个 Home 的 Web、MCP 进程；Runtime 里已经开着的 MCP 进程跑的是旧代码，按 pid 精确停止，不要杀不认识的进程。
- [ ] 确认这次要装的构建：tag 构建写版本号，其他构建写提交和 `content_digest`（[POLICY.md](POLICY.md) 第 3 节）。
- [ ] 对真实 Home 的任何写入，包括维护、重装、替换 Runtime 配置，时间和范围都先得到用户同意（过去每次都是弹窗逐项问：维护的时间、要不要重装、配置怎么换）；发布者不自己决定。

### 4.2 升级前的快照（备份）

- [ ] 动真实 Home 之前，先拍一份可恢复的快照，放在 Home 之外。用户 2026-10-08 的决定：做成一条离线快照命令，经常驻宿主暂停写入后对每个登记的库拍一致快照（带清单与版本核对），「卸载并清除数据」覆盖所有登记的库；定时的在线备份不在这里，留给 C 端就绪方案（`docs/prompts/repository-anti-corruption.md` §4.19）。路线图 W5-16 把它具体化为：清单记路径、版本、校验值，恢复时版本不符就拒绝。这条命令 `molis-work home snapshot --to <目录>` 依赖 W4-11 的统一库登记表，**现在仓库里没有它**；有了以后，这一项改成跑命令，并把快照清单里的各库版本和第 3 节的表对一遍，清单附在发布 PR 里。
- [ ] 现在的做法是离线整份备份 Home（`docs/installation.md`「离线备份与恢复边界」）：先退出 App、停止常驻服务和其他写入进程，再把整个 Home 拷到 Home 之外（过去用 `~/molis-work-backups/<日期>-before-<事项>`；APFS 上可以用克隆，逻辑大小不变、实际占用少）。不要只拷单个 `.db`：目录库、会话库、加密正文和密钥必须是同一时点。外部工作区文件不在 Home 里，另行备份。
- [ ] 服务已停的情况下，备份与原 Home 逐个比对一致（库和配置文件），记下路径、大小和比对方式，写进发布 PR。
- [ ] Keychain 或环境变量里的密钥不随 Home 文件复制，另行确认还在（`docs/installation.md`）。
- [ ] 恢复只能恢复到原来的绝对路径：目录库保存了项目库的绝对路径（`ProjectService.prepareRecord` 里的 `database_path`，`modules/projects/src/project-service.ts:61`）。路线图 W5-17 把目录库改成由 Home 和 `project_id` 推导路径（目录库 v23，用户 2026-10-08 的决定；v22 是删除收据的所有者步骤表，见 spec §4.1 的维护四），那一版之后这一条和 `docs/installation.md` 里的同一句一起改。
- [ ] 旧备份删不删由用户定，发布者不自行清理；2026-10-08 用户已经定了一次性清理的范围，见第 4.5 节「Home 里没有来路不明的东西」一项。

### 4.3 第 3 节有库的版本变了：先演练再动真库

没有变化的发布跳过这一节，但第一项每次都做。这一节的做法（版本不符就拒绝，旧 Home 先一次性维护）只适用到第一个装到开发机之外的版本为止（第 1 节第 2 项）。

- [ ] 发布前逐库对照上一个装出去的构建（看它的提交，不只看版本号：0.2.0 的 tag 是 9 月的，真实 Home 装的是 10-11 用同一版本号构建的）：第 3 节表里每个库的版本，和那个提交里定义处的数比；升了的每一个都要在 [防腐整理 spec](../../specs/repository-anti-corruption/spec.md) §4.1 的「库版本维护清单」里有一行（哪个提交改的、怎么维护、做没做），没有的先补上再往下走；对 merge-base 的那一半由 `pnpm health:check` 拦（`scripts/gates/store-versions.mjs`），对上一个装出去的构建的这一半只能在这里查。
- [ ] 把备份再拷一份作演练副本，维护流程先在副本上跑完。演练脚本只许打开副本里的路径：目录库存的是真实 Home 的绝对路径，照着它去开会打到真库——2026-10-07 的演练就误开过一个项目库，靠版本不符被拒绝才没改动文件（`specs/repository-anti-corruption/spec.md` §4.1）。
- [ ] 副本上逐库核对：结构与当前基线逐项相同（表、列顺序、索引、外键、CHECK，`packages/storage/src/sqlite-baseline.ts` 的 `describeSqliteSchema`），版本等于第 3 节的数，`PRAGMA integrity_check` 为 `ok`，`PRAGMA foreign_key_check` 没有行，行数与搬之前一致。
- [ ] 演练通过后，在真库上按同一份流程做：被换下的原库不删，也不留在 Home 里，搬到 `~/molis-work-backups` 下（用户 2026-10-08 的决定，「真实 Home 的残留物」一行），建议目录名 `<日期>-replaced-by-<事项>/`、权限 700（维护三留下的 `maintenance-3-replaced/` 就是 700）；2026-10-07 维护三留在 Home 里的 `~/.molis-work/maintenance-3-replaced/` 在 4.5 的一次性清理里按同一规则搬走。密钥文件（如 `feed/secrets.json`）不读值：要改就只按键名改，原文件先原样备份（2026-10-07 的做法，`specs/repository-anti-corruption/spec.md` §1）。
- [ ] 维护流程和演练记录（日期、副本、每库行数与核对结果）写进发布说明的「兼容与升级」或对应 spec。流程里用到的一次性脚本要么入库，要么在记录里写清它的输入输出，不让「怎么做的」只留在会话里。

- [ ] **本发布要做的一次性维护：维护六（真实 Home 的数据部分和重装已于 2026-10-10 做完：18 个项目库 v6 → v7，实验插件目录移到 `~/molis-work-backups/2026-10-10-removed-experiments/`，残留行 5 条按用户决定清掉；同日 Home 安装版用 `72137e89a` 的干净构建重装、主检出同步并构建，安装版 MCP 列出全部 18 个项目；**没做完的是「做完核对」里新构建打开 v7 项目库那一项**，待办 BL-126；整份备份 `~/molis-work-backups/2026-10-10-before-maint6`；维护 SQL 与演练用例随后删除，从 Git 历史 `9fba2db43` 取）**（删掉 Casebook 与实验插件后真实 Home 的数据；用户 2026-10-10 决定「删除 PR 合入后立刻维护」，`specs/repository-anti-corruption/spec.md` §1、§4.1）。插件从产品里删掉后，已有 Home 里它的文件和别处的行不会自己消失，新构建也不再读它们；下面三件事在同一个维护窗口里做完，都在装新构建（第 4.4 节）之前：整份离线备份（第 4.2 节），先在备份的拷贝上演练和只读数，再经用户同意在真库上做；移出的东西搬到 `~/molis-work-backups`（目录权限 700），不直接删。新构建拒绝 v6 的项目库，所以没做就装，项目打不开；做完用新构建重装 Home 安装版并重开会话里的 MCP（只认 6 的旧构建拒绝 v7）。做完以后，这份 SQL 和演练用例删除，从 Git 历史取。
  - [x] **项目库 v6 → v7（Casebook 的 5 张表）。** 对每个项目目录里的 `projects/<id>/molis-work.db` 跑 `tests/fixtures/project-maintenance-v7.sql`：目录库列出的每个项目（含个人空间），以及磁盘上有、目录库没列出的项目库（先查，维护四找到过这种残留），一库一个事务，版本不是 6、表不是正好 v6 那一套、Casebook 的表列不对、有视图或触发器，整个脚本回滚，什么都不改。先在备份的拷贝上跑 `tests/project-maintenance-v7.test.ts` 的演练和同一份脚本，再对真库跑。`config/casebook.json`（Casebook 的服务端 Bearer 令牌和用户动作签名密钥，不再被读取）是残留，按密钥对待、不读值：维护窗口里问用户，搬进备份目录并从 Home 删掉（推荐，与第 4.5 节「Home 里没有来路不明的东西」同一规则），或留着；怎么处置以用户在窗口里的回答为准（`specs/repository-anti-corruption/spec.md` §4.1 维护六）。
  - [x] **移出实验插件（`io.molis.work.experiments`）的目录。** 把 `{home}/plugins/experiments/`（`private.sqlite` 与 `-wal`、`-shm`，里面是实验和多模型对比结果）整个搬到 `~/molis-work-backups/<日期>-removed-experiments/`；`{home}/plugins/` 空了就一并移除。记下搬走的文件和大小。新构建不会重建这个目录。
  - [x] **只读数实验插件留在别处的残留行，把数字报给用户，经同意再清**（真实 Home：连接绑定 1、项目隐藏记录 1、项目事件 3；用户 2026-10-10 定「连历史事件一起清」，5 条都删了）（决定里点名的只有上一项的目录，下面是同一个插件留下的东西；在备份拷贝上数，不碰真库）：`connectors/connectors.db` 的 `connector_bindings` 里 `scope_id = 'home' AND plugin_id = 'experiments' AND slot_id = 'typesafe'`（连接本身留着，Functions 在用）；`projects/catalog.db` 的 `project_plugins`、`project_plugin_exclusions` 里 `plugin_id = 'experiments'`（项目隐藏过它）；`projects/catalog.db` 的 `project_events` 里 payload 的 `plugin_id` 是 `experiments` 的添加与移除事件（真实 Home 只读数时发现的，原先的清单里没有）；`config/mcp-tools.json` 里属于实验提供方的 `action_grants`（`experiments.list`、`experiments.results`、`experiments.search.entries`、`experiments.subject.read` 对 MCP 可见过）；`workflows/workflows.db` 里动作是 `experiments.*` 的步骤（只报告，不改写，那个步骤以后会解析失败）；助理库与放置库（`placement/placement.db` 的 `context_edges`）里主体类型是 `experiment` 的关联，以及助理能力设置里点名 `experiments.*` 的项；`search/search.db` 是派生库，若其中来源是实验的条目没有随启动被丢掉，就重建它。`logs/action-calls.jsonl` 里的旧行是历史，留着。
  - [ ] **做完核对。** 要求：在拷贝上用新构建打开一次，工作台和插件切换器里没有「实验」；浏览器里存过的 `experiments` 页签或固定项不会让工作台报错（在隔离 Home 里验过：工作台正常打开，旧页签留在标签栏里，关掉即可；页签与固定项存在各浏览器的 `localStorage` 里，不属于 Home，不用处理）。第 4.5 节核对 `config/mcp-tools.json` 的授权条数时，期望值要扣掉被清掉的实验授权条数。2026-10-10 只做了下面第一项，第二项没做；两项都做完才把这一行打勾。记录见 `specs/repository-anti-corruption/spec.md` §4.1 维护六「做了什么」。
    - [x] **重装与列项目（2026-10-10 已做）。** Home 安装版用 `origin/main` `72137e89a` 的干净构建重装：`node dist/cli/main.js install --source .`，输出「同版本内容已刷新 0.2.0」；主检出同步到同一个提交并构建；用 Claude Code 启动 MCP 时的运行环境起安装版的 MCP，`molis_work_v1_context_list_projects` 列出 18 个项目，与维护前一致。这一项只说明新构建的安装版起得来、读得出目录库：这个工具只读 `projects/catalog.db`（`catalog.listProjects()`），不打开任何项目库。重装只写发布目录、启动脚本和安装清单，不碰库（`apps/local-host/src/installer/home.ts`）。
    - [ ] **新构建打开 v7 项目库，并重连旧会话的 MCP（待办 `specs/BACKLOG.md` BL-126，负责人：动真实 Home 的协调会话）。**（2026-10-11：①②已做——18 个项目库只读拷出（`immutable=1` 打开后 `VACUUM INTO`），用 `9f9bda551` 的新构建的 `LocalProjectDatabase` 打开（过基线检查，没有 `storage.schema_version_mismatch`）并读 Goal 快照：每个项目的 Goal 数与维护六前的备份 `2026-10-10-before-maint6` 相同（最多的一个 277 个）；各库 v7、无 Casebook 表、`integrity_check` ok，除 Casebook 的 5 张表外每张表的行数与维护六前相同；拷贝已删。没有在真实数据的拷贝上打开工作台界面看插件切换器：实验插件已不在构建里，界面一侧是在隔离 Home 里验的。只剩③，由用户重开会话） ①在安装版里绑定一个项目并读它的 Goal 数，与维护前一致；或在项目库的拷贝上用新构建打开一次，看到工作台和插件切换器里没有「实验」、没有 `storage.schema_version_mismatch`（没报错不能当证据：列项目不打开项目库，这个错误只在打开项目库时才出现）。②各库 v7、无 Casebook 表、`integrity_check` ok、行数不变，目前只有维护当时用 SQLite 对真库逐库核对的结果，重装之后没有重新核对，用新构建打开之后再核一次。③重装之前起的会话里的 MCP 进程（含维护窗口里自动重连起的两个）跑的仍是只认 v6 的旧代码，要重连或重开会话才换成新的。「插件切换器里没有实验」目前只是从代码读出来的（新构建里已没有实验插件），没有在浏览器里看过。做完在 spec §4.1 维护六「做了什么」补一行，删 BL-126，再把这一项和上一层打勾。

- [x] **本发布要做的一次性维护：维护七**（开发机的真实 Home 已于 2026-10-11 核对完：没有要改的记录，按用户的决定一个字都没写；工具与演练用例随后删除，从 Git 历史 `9f9bda551` 取，例如 `git show 9f9bda551:tests/fixtures/provider-identity-maintenance.mjs`；记录见 [防腐整理 spec](../../specs/repository-anti-corruption/spec.md) §4.1 维护七）（已在 Plugin Runtime 上的 7 个内置插件，能力的来源编号由安装编号改成插件名；用户 2026-10-10 的决定「内置插件一律用插件名」，W3-06 C，`specs/repository-anti-corruption/spec.md` §1）。Characters、Shelf、Coding、Files、Diff、Git、Text Stats 原来以 `plugin-install-<哈希>` 登记动作，新构建改用 `io.molis.work.coding` 这样的插件名（Shelf 的手写提供方本来就是这个名字）。凡是按来源编号精确认动作的存量记录，新构建里都对不上；动作 id 和版本没变。工具是 `tests/fixtures/provider-identity-maintenance.mjs`，演练用例是 `tests/provider-identity-maintenance.test.ts`：`list` 只读、不接受真实 Home 路径；`rewrite` 先把所有库读一遍、有问题就一个字都不写，再每个库一个事务、JSON 文件原子替换，写完再读一遍；真实 Home 要带 `--maintenance-window`（用户批准了窗口），并且 4173、4207、4208 端口和这些库都没人占着。它只改 `provider_id` 恰好是这 7 个旧编号的字段；目录库里存的项目路径指向真实 Home，工具不用它找库，只扫 Home 里的 `projects/*/molis-work.db`，也不跟符号链接，不进 `releases/`，不打开 `feed/secrets.json`。做完以后这两份文件删除，要用从 Git 历史取。
  - [x] **先列，给用户看。**（2026-10-10，整份克隆 `~/molis-work-backups/2026-10-10-before-maint7` 上：五类可改 0，`FIXED`、`derived`、`history`、`UNCLASSIFIED` 都是 0，问题 0；`NOT READ` 50 个加密目录。旧编号在 Home 里出现 168 次，全是创作台运行记录里的 `sdk.artifacts.<安装编号>`，是安装自己的身份，工具按规则不算引用。2026-10-11 弹窗报给用户） 整份离线备份（第 4.2 节），把备份再拷一份作演练副本，在副本上跑 `node tests/fixtures/provider-identity-maintenance.mjs list --home <副本>`，把输出贴进发布 PR。输出分五类会改的：`mcp-grants`（`config/mcp-tools.json` 的逐客户端授权）、`workflow-steps`（`workflows/workflows.db` 的流程定义与运行里存的步骤）、`character-drafts`（`characters/characters.sqlite` 的角色草稿里选好的能力）、`coding-selections`（每个项目库里 Coding 会话选好的能力）、`assistant-*`（助理库里的待确认卡片、可撤销操作、后台任务，以及「对助理关掉的能力」和「每次都要确认」两项设置）；另有四类只列不改：`FIXED`（项目成果库里已发布的角色版本，是固定版本，工具不改）、`derived`（搜索索引，会自己对账重建）、`history`（`logs/action-calls.jsonl` 的调用记录，是历史，留着，不用决定）、`UNCLASSIFIED`（SQLite 库的其他文本列，和 Home 里所有 `*.json`、`*.jsonl` 文件，凡是工具的规则不认识的旧编号；要逐条看，决定改还是留；`releases/`、符号链接和 `feed/secrets.json` 不看）。**还有一类 `NOT READ`，是工具看不见的**：带加密正文的记录（Prologue 的 `agent-runtime/records/<kind>/<id>.json`；Coding 会话索引 `molis-agent-index-*` 里每一轮冻结的能力引用就在加密正文里）按目录数条数，大于 64 MiB 的 JSON 文件点名。里面有没有旧编号，工具说不出，它也不改变退出码，下一条是为它而设的。`list` 和 `rewrite` 的退出码 3 就是「还有只列不改的东西」，不是失败。`UNCLASSIFIED` 的片段是旧编号前后各约 40 个字符，贴进发布 PR 之前看一眼，涉及私人内容的删掉。
  - [x] **进窗口前，没有轮次停在等批准或暂停上。**（用户 2026-10-11 定「不提前处理，遇到就重开」：没开窗口，重装前没有逐轮核对；重装后若有停住的轮次调这 7 个插件的动作报 `actions.missing`，取消后重开一轮） 工具看不见加密的运行记录（上一条的 `NOT READ`）：一轮在窗口前冻结了旧编号、窗口后才恢复，它对这 7 个插件动作的调用报 `actions.missing`（原来的能力找不到，因为它按旧编号找），要重新开一轮才用新编号。所以停 Host 之前，先在产品里把等批准的轮次批准或拒绝，把暂停的取消或让它跑完；已经结束的轮次里冻结的旧编号是历史，不用管。
  - [x] **在副本上改，核对。**（不需要：可改的是 0） `rewrite --home <副本>` 后再 `list`，五类可改的都是 0；`config/mcp-tools.json` 的授权条数不变（新旧编号撞成同一条的，工具拒绝并一个字都不写，第 4.5 节的授权条数核对是第二道）；对副本用新构建打开一次，设置里的 MCP 授权页、工作流、角色页能正常显示，已选能力没有「原能力已变化」。副本上的演练记录（日期、各类条数、核对结果）写进发布说明的「兼容与升级」。
  - [x] **经用户同意后在真库上做，并交代两件用户要自己做的事。**（用户 2026-10-11 定「不写真库，重装后复查一次」：#383–#385 合入后 Home 安装版用 `origin/main` `9f9bda551` 的干净构建重装（「同版本内容已刷新 0.2.0」，新装的 MCP 列出 18 个项目），再把五处——`config/mcp-tools.json`、`workflows/workflows.db`、`characters/characters.sqlite`、18 个项目库、`assistant/assistant.db`——只读拷出（`VACUUM INTO`；项目库没有 `-wal`、没有进程打开，用 `immutable=1`）跑 `list`：各类都是 0（拷贝里只有这五处，所以 `NOT READ` 也是 0）；拷贝随即删除。没有要重新发布的角色版本，助理卡片也没有要改的） 真库上跑 `rewrite --home ~/.molis-work --maintenance-window`，把输出的各类条数报给用户。`FIXED` 的已发布角色版本不能改（固定版本），指向旧编号的那些版本里选好的能力按新编号对不上：用户在「设置 › 角色」把对应草稿（工具已改好）重新发布一次，旧版本留着不删。助理的待确认卡片、可撤销操作、后台任务本来也会失效，这一步一并改了，不用重新准备。
  - [ ] **不做的后果**（写在这里是因为过去的维护都是因为没做才发现的）：MCP 客户端的授权读成「没有这个动作」，外部工具里这 7 个插件的工具消失，要逐个重新授权；工作流里这些步骤报 `actions.provider_changed`；角色草稿里选好的能力显示「原能力已变化」；Coding 会话里选好的能力丢掉；用户对助理关掉的这些能力悄悄变回开着；窗口前冻结了旧编号、窗口后才恢复的 Agent 轮次，调这 7 个插件的动作报 `actions.missing`。

- [ ] **本发布要做的一次性维护：维护八（候选，未做；动真实 Home 之前弹窗问用户）**，做 [防腐整理 spec](../../specs/repository-anti-corruption/spec.md) §4.1「库版本维护清单」里还没做的行，与装新构建同一步做。连接库 1 → 2、Pages 库 1 → 2 两行的做法写在那张表里；这里列项目库 v7 → v8（PG-020 项目库按插件分区，`specs/plugin-project-database/spec.md` §3 L1b 与 S8 同一批）。2026-10-20 本机没有真实 Home，旧机器的 Home 已退役；有 v7 项目库的 Home 才要做。
  - [ ] **项目库 v7 → v8。** 对每个项目目录里的 `projects/<id>/molis-work.db` 跑 `tests/fixtures/project-maintenance-v8.sql`（在事务外关外键，跑完开回），范围与维护六相同（目录库列出的项目，加磁盘上有、目录库没列出的项目库）。一库一个事务：版本不是 7、表不是正好 v7 那一套、有视图或触发器、Board 不是正好一个、`boards` 或 11 张表的列不对、外键检查不空、行数变了，整个脚本回滚，什么都不改。做的事：建 `project_root` 并抄 Board 的那一行；按 SQLite 的改表流程重建 `boards`（去掉 `title`，外键指 `project_root`，ON DELETE CASCADE；那一行与它的 rowid 不变，丢掉的只有 `title` 的值；Goals 其余 30 张表的外键仍写 `boards(project_id)`，不动）和 11 张表（外键改指 `project_root`），行（含 rowid 与自增序号）不变；建看板的幂等回执（`initialize_board`）换成现行的请求哈希（S8：请求不再带看板名，旧回执的哈希里有它，不换的话同一个键重试会被当成键被别的请求用过）；建账本并写 Coding、Feed、Goals、Schedule 四行（版本 1、发布者签名、表和索引名；Goals 那行是它的 31 张表与 30 个索引，S8）；`user_version` 写 8。先在一次性 Home 和备份的拷贝上跑 `tests/project-maintenance-v8.test.ts` 的演练和同一份脚本，再对真库跑；维护前整份备份（第 4.2 节）。可以和 Characters 安装记录的清理（`docs/system/RUNTIME-MIGRATION.md` 5.4 第 6 点）合成一次，到时由用户定。做完以后这份 SQL 和演练用例删除，从 Git 历史取。
  - [ ] **项目库 v9 → v10 与 Home Plugin Runtime 库 v2 → v3（ac-trust T1，候选，未做；动真实 Home 之前弹窗问用户，时段与 W5-17 同一次）。** 新构建只认新版本，所以和装新构建同一步做。停宿主、整份备份（第 4.2 节）后，在副本上演练：对每个项目库一个事务跑 `tests/fixtures/project-maintenance-v10.sql`，对 `plugin-runtime/plugin-runtime.db` 跑 `tests/fixtures/plugin-runtime-maintenance-v3.sql`；两个脚本都先核对版本（9、2），按每条安装记录的 `execution` 写 `publisher_trust`（`host` → `host`，`sandbox` → `unsigned`），遇到别的取值整笔回滚、什么都不改。跑之前先在副本上列出 `execution` 为 `host` 的记录：`SELECT json_extract(record_json,'$.plugin_id') FROM plugin_runtime_installs WHERE json_extract(record_json,'$.execution') = 'host'`，应当都是宿主启动名单里的内置插件，不是的先弄清楚再动。跑完用新构建启动，内置插件的同意行（`host_build`）由启动幂等补上。
  - [ ] **Shelf 目录 `shelf/catalog.json` 1 → 2（Shelf S3，① 裁定 D3；候选，未做）。** 新构建只认版本 2，打开版本 1 的目录会拒绝，所以和装新构建同一步做。工具是 `tests/fixtures/shelf-catalog-maintenance.mjs`：停宿主、整份备份（第 4.2 节）后，先在备份副本上跑 `list`（只报版本、条目数和带路径的条目数，不报路径），再在维护窗口里对真 Home 跑 `rewrite --home <Home> --maintenance-window`，跑完再 `list` 一次，应是版本 2、没有带路径的条目。做法和为什么这样做见 [防腐整理 spec](../../specs/repository-anti-corruption/spec.md) §4.1「真实 Home 维护八」下的「Shelf 目录」一行。目录是 JSON 文件，不在第 3 节的库版本表里，`verify-release-versions` 也不核对它，只靠这一项不漏。
  - [ ] **删掉 Characters 留下的安装记录（待做，CHR-1 之后）。** Characters 已不是插件（CHR-1，2026-10-22）：宿主自己登记它的动作，项目库 `plugin_runtime_installs` 里 `plugin_id` 为 `io.molis.work.characters` 的那条记录没人启动、也没人改（监督器只启动自己的条目），留着不影响打开项目，但它和它的授权已经是孤儿。对每个项目库先只读数一遍：这条安装记录（授权写在记录里）、`plugin_runtime_release_artifacts` 里同一 `plugin_id` 的发行物存档、按它的 `install_id` 存在别的 `plugin_*` 表里的行（私有值、事件游标等），把数字报给用户；再整份备份（第 4.2 节），在拷贝上删、核对其余插件的记录一行不变，经用户同意后对真库做。和上一项的 v8 维护合不合成一次，由用户定（`specs/plugin-project-database/spec.md` 决定表 2026-10-19「v8 在真实 Home 上何时维护、是否与 Characters 清理合并」）。产品代码里不写这一步。
  - [ ] **角色库 `characters/characters.sqlite` 1 → 2（Sessions 收尾 SC-2，#1080）。** 停宿主、整份备份（第 4.2 节）后，对这一个库在一个事务里跑 `tests/fixtures/characters-maintenance-v2.sql`：版本不是正好 1 就整个回滚，什么都不改；做的事只有建 `character_runs` 表与它的索引、`user_version` 写 2，`character_drafts` 一行不动。先在一次性 Home 和备份的拷贝上跑 `tests/characters-maintenance-v2.test.ts` 的演练和同一份脚本，再对真库跑。以前记在会话库里的角色运行不迁，留给 SC-5 随会话库一起处理。清单那一行见 [防腐整理 spec](../../specs/repository-anti-corruption/spec.md) §4.1「库版本维护清单」的 `characters/characters.sqlite` 行。做完以后这份 SQL 和演练用例删除，从 Git 历史取。

- [ ] **项目库 v9 → v10（Attention 对象归属，S9-0b）。** Entry 和 event 增加明确的 `owner_plugin_id`，未归属旧行保持 null；唯一约束按 owner 区分。实际库沿用统一维护窗口，先备份、给出具体两表维护补丁并在隔离拷贝演练，再按当次授权处理真实 Home；不在启动时改表或猜旧 owner。本片源码与新库验证不等于真实维护完成，见 [S9-0b slice](../../specs/repository-anti-corruption/slices/goals-s9-0b-attention-ledger-services.md)。组合分支若同时改项目 schema，最终版本由集成 carrier 统一。

### 4.4 装新构建

- [ ] 用干净构建装：`pnpm install:local`（先整体构建再安装），或安装 DMG。版本相同而内容不同也会原子刷新程序与 Skill，失败恢复上一份 release（`docs/installation.md`）。
- [ ] 常驻服务：`service status` 返回 `needs_repair` 就直接 `service install --confirm`，不要先 `restart`（`docs/installation.md`）。
- [ ] 已接入的 Runtime 在「设置 → AI 与执行工具」里预览并确认修复，再新开 Runtime Session；旧 Session 不能当作新版本的验收证据（`docs/installation.md`「发布后的最终产物验收」）。

### 4.5 动完之后

- [ ] 只读核对第 3 节每个库在真实 Home 里的版本、`integrity_check`、`foreign_key_check`；项目数与动之前一致；抽查一个项目的 Goal、成果版本和会话内容能读。
- [ ] 核对 `config/mcp-tools.json` 的授权条数没有莫名变少（版本不符时明确拒绝并报告配置错误，原文件不改）。
- [ ] 内置插件的安装记录等于这个构建的清单，版本和摘要都要一致（[POLICY.md](POLICY.md) 第 7 节；第 1 节也用这条命令）。对开发机的真实 Home，在 A 落地后的第一次启动之后查，确认记录已经跟上：在新拷贝上查（只打开拷贝里的路径，见第 4.3 节第一项），不碰真库；查拷贝也是真实 Home 的数据操作，照例先问用户。先在构建好的仓库根目录打出这个构建里每个内置插件清单的版本与摘要：

  ```sh
  node --input-type=module -e '
  import { pluginManifestDigest } from "@molis-ai/molis-work-plugin-runtime";
  import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
  for (const { manifest } of BUILTIN_PLUGIN_CATALOG) {
    console.log(manifest.plugin_id, manifest.version, pluginManifestDigest(manifest));
  }'
  ```

  上述表覆盖所有内置插件；再对每个项目库取实际由监督器运行的插件安装记录（只读，停写时在快照拷贝上做最稳妥）：`SELECT json_extract(record_json,'$.plugin_id'), json_extract(record_json,'$.version'), json_extract(record_json,'$.manifest_digest'), json_extract(record_json,'$.state') FROM plugin_runtime_installs;`。`apps/local-host/src/project-plugins.ts` 交给监督器的插件（`projectPluginEntries()`，名单以登记上的 `project_runtime` 为准，不在这里写死）每个项目最多一条（项目撤下的插件除外；CHR-1 以前装过的项目库里还会有一条 Characters 的旧记录，见第 4.3 节维护八）；Home 监督器的插件另查 `plugin-runtime/plugin-runtime.db`。记录的版本与摘要要和上面打出的相同。做法 A 已经落地（[POLICY.md](POLICY.md) 第 7.8 节），内置插件启动时 Runtime 把记录改成当前构建的清单，不论版本更高、更低还是同版本摘要不同，所以这一项是 A 的验收：记录版本比清单高，或版本相同而摘要不同，说明这个构建里没有 A，或这个插件这次启动失败了（看 `plugin_runtime_installs` 里记录的 `state` 和监督器报告的失败码）；记录的 `install_id` 应该和以前一样，私有数据才还在。一个项目撤下的插件没有被启动，它的记录停在上次启动时的样子，不算没跟上，启动一次再查。
- [ ] Home 里没有来路不明的东西。把 Home 的目录和 [HOME-DATA.md](../system/HOME-DATA.md) 对一遍，不在里面的文件夹、旧备份、没有表的空库、孤儿文件、旧的 `goalboard-*` 安装版，都算残留。残留先核对（谁写的、有没有引用、里面有没有数据），有用的搬到 `~/molis-work-backups`，确认没用的才删，不批量删。用户 2026-10-08 为开发机的真实 Home 定了一次性清理：保留 2026-10-07 维护前的整份备份和 `runtime-configs`，维护替换下来的旧文件搬到 `~/molis-work-backups`，其余旧备份、孤儿文件、空库、旧 `goalboard-*` 安装版核对后删；动手前先整份备份。同一个决定里还有目录库 v23 的路径派生（W5-17）和给实验库标版本 1（W2-05）；三件事都经用户批准，先在拷贝上演练再动真库。
- [ ] 版本不符被拒绝是正常的保护：不要回滚库，也不要用 SQLite 命令绕过；用与它相符的构建打开，或从备份恢复。

## 5. 发布后

- [ ] 合并后在合并提交上打 tag `v<版本>`，再在这个 tag 上手动运行 Release macOS Desktop 工作流（`.github/workflows/release-macos.yml` 现在只有 `workflow_dispatch`，推 tag 不会触发它；选 tag 运行才会做 `--tag` 核对并发布 GitHub Release）。Release 资产和校验和来自同一提交（`docs/installation.md`「发布后的最终产物验收」第 1 条）。
- [ ] 按同一节的第 2 至 5 条逐层验收常驻服务、Runtime 接入、新 Session 和真实项目的用户可见结果，之后才能把消费者可见的修复标成「已安装」。
- [ ] 发布 PR 里补上备份路径、维护记录位置和上面各项的结果。

Coding 当前生命周期原件（COD-MEM-RESTORE，2026-10-25）：Coding自有声明version2，仅增加coding_sessions.lifecycle_json nullable列。version1严格拒绝、仅停Coding，不自动修复。真实Home安装前须停写、整份备份并在隔离非空副本核对本spec记录的会话维护命令与结果后，另获实际采用授权；只更新Coding所属ledger，不修改全局user_version9/其他owner。隔离演练不代表真实Home维护完成；本刀未操作真实Home。
