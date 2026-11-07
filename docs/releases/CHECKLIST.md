# 发布前检查清单

每次发布把这份清单复制进发布 PR 的描述，逐项勾选；做不到的项写明原因，不删项。规则出处是 [POLICY.md](POLICY.md)。

当前准备 [0.1.0 统一起点候选](v0.1.0.md)：N34 已在源码中复位产品与全部内置 Manifest，旧同名 release/tag 已按 2026-11-06 追加授权删除并核实释放；最终构建、登记与隔离安装另验。新版本未发布。真实 Home 已于 2026-11-07 干净重建，统一起点已登记（第 4 节）。旧 0.3.0 候选的构建和产物证据不能替代本次检查。

## 1. 定版本，写材料

- [ ] 对照上个 tag 以来的变化选次版本或补丁（[POLICY.md](POLICY.md) 第 2 节）。库版本有没有变，看第 3 节的表：`git diff <上个 tag> -- <表里的定义处文件>`。
- [ ] 这个版本是 1.0.0 或之后、并且会装到开发机之外吗？用户 2026-10-08 的决定 #15：「不留兼容」到第一个装到开发机之外的版本为止；用户 2026-10-29 又定「1.0.0 之前都是开发版本」，所以 1.0.0 之前的版本都不是它（`specs/archive/repository-anti-corruption/spec.md` §1）。两样都是的话，发布 PR 把版本号、日期和提交写进 [docs/system/CONTRACT-CHANGES.md](../system/CONTRACT-CHANGES.md) 顶部的「起点日期」，并把它的第 3 节标为已结束；从那以后合同变更走那份文件第 4 节的读取兼容流程。那份文件第 5 节列的前置（公开 API 快照、动作合同快照、插件回放工具等）要在发这个版本之前就位。有一样不是的话，在这一项写明「不是外部版本」，仍按「不留兼容」办。存储结构变更另从第 4 节真实 Home 重建核实的统一起点开始，须升版本并带连续升级步骤，不等到首次外部安装；见 [POLICY.md](POLICY.md) 第 5 节。
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
- [ ] 发 npm 归档（`pnpm package:npm` 的产物对外发出）时，飞书/Lark 连接器带来的两件已接受的事要如实写出（用户 2026-10-10 决定：接受，两件事写进安装说明和这份清单，不加 `overrides`，不打包依赖树；`specs/archive/repository-anti-corruption/spec.md` §1、`apps/local-host/README.md` 的飞书/Lark 连接器一条）。（1）`docs/installation.md` 与 `docs/installation.en.md` 的「npm 路径上的飞书/Lark 连接器」一节还成立，发布说明的「兼容与升级」写同样两条：归档里的 `basic-ftp` 是带高危公告 GHSA-c475-qrg2-pj4r 的 5.x（只有用户自己把代理配成指向 FTP 上的 PAC 文件才会走到）；`keytar` 的安装脚本要联网或编译工具链，装好后连接器每次启动都读写钥匙串里服务名 `lark-mcp` 的一项并建 `lark-mcp-nodejs` 数据目录，都在 Home 之外（Home 之外的状态清单见 [HOME-DATA.md](../system/HOME-DATA.md) 第 8 节；该包的日志目录 `~/Library/Logs/lark-mcp-nodejs/` 不限于 npm 路径，安装说明同一小节末尾也写了）。（2）决定的前提还在：`npm view @larksuiteoapi/lark-mcp version` 仍是归档里固定的版本（有新版本就看它的依赖有没有升到 `basic-ftp` 6.2.1 以上；`basic-ftp` 5.x 线发了修复版本、或 `get-uri` 声明的范围已能解析到 6.2.1 以上，也算前提变了），归档的 `package.json` 没有 `overrides`，`bundledDependencies` 里没有 `@larksuiteoapi/lark-mcp` 及其依赖树（里面本来有工作区包，不算），连接器没有改成别的接法；前提变了就重新弹窗问，不沿用这条决定。`node scripts/run-tests.mjs tests/npm-package.test.ts` 把（1）（2）里能机器核对的部分固定下来。

## 3. 各库版本表

每个库只认一个当前版本，不符时的处理在最后一列。最后一列写的是升级链接好之后的行为（[U1 设计](../../specs/upgrade-continuity/upgrade-chain-design.md) §2.3、§2.6）：U1-c 接升级过程，U1-d 接平台的库，U1-e 接 JSON 文件，这三片现在都还没有合入。在那之前，低版本的库打开时报 `storage.upgrade_pending`，低版本的 JSON 文件也由各自的主人拒绝，报错各不相同（比如密钥文件报 `secrets file format N is not supported`），都只拒绝，还没有升级过程来升它们。三片里最后合入的那一片删掉这几句。表里有两类东西：Home 里的 SQLite 库，和需要在重建时核对的 JSON 文件（`feed/secrets.json`、`config/mcp-tools.json`、`shelf/catalog.json` 与安装/发行清单均由各 owner 拒绝错误格式）。其他带版本字段的小 JSON 文件（`browser/sites.json`、`jelly/preferences.json`、`config/` 下未列入本表的文件）不在表里：它们的版本见 [docs/system/HOME-DATA.md](../system/HOME-DATA.md) 第 6 节的「种类 · 版本」列，版本不符时各自怎样没有逐个核对过，改其中任何一个的版本，就在发布说明的「兼容与升级」里写明。每个库的 owner、表、备份与卸载规则也在 HOME-DATA.md。位置都相对 Home（默认 `~/.molis-work`，`MOLIS_WORK_HOME` 可改）。

`scripts/verify-release-versions.mjs` 对照代码核对这张表，下面几种情况 CI 会失败：某行的版本和定义处的代码不一致；定义处不存在；包的 `src/` 里有一个 `SqliteBaseline` 常量（`const X: SqliteBaseline = {…}`、`const X = {…} satisfies SqliteBaseline`、`… as SqliteBaseline` 三种写法都算）没有列进表，或者它的版本不是对象里写成数字的 `version: N`（引用别的常量，脚本读不出来）；`applySqliteBaseline`、`openBaselineHomeSqlite` 收到的不是一个已声明的常量（内联对象不行）；`runSqliteUpgrade` 收到内联对象（它转交描述符带的基线，名字或属性都可以）；标「无」的库的定义处文件加上了版本标记。它找不到的是完全不经 `applySqliteBaseline` 的新库（比如又一个只靠 `CREATE TABLE IF NOT EXISTS` 的库）和表以外的 JSON 文件，这类只能靠 HOME-DATA.md 的清单和评审发现。

插件自有库的 `PluginDatabaseDeclaration` 也按同一规则检查：必须具名、写出数字版本并列入下表。可信 Host 的连接服务仅转发这份声明；这一个类型化转发调用被单独识别，其余内联或未声明基线仍拒绝。

| 库 | 位置 | 版本 | 记在 | 定义处 | 版本不符时 |
| --- | --- | --- | --- | --- | --- |
| 安装与发行清单 | `config/installation.json、releases/molis-work-<version>/release.json` | 1 | `schema_version` | `apps/local-host/src/installer/home-contract.ts#SCHEMA_VERSION` | 低版本由安装器升级；高版本在修改前拒绝，保留文件 |
| 项目库 | `projects/<project_id>/molis-work.db` | 1 | `user_version` | `apps/local-host/src/project-database-schema.ts#PROJECT_DATABASE_BASELINE` | 低版本升级，高版本拒绝 |
| 项目库里 Coding 的表 | `projects/<project_id>/molis-work.db#coding` | 1 | `plugin_project_databases.version` | `plugins/native/coding/src/database.ts#CODING_PROJECT_DATABASE` | 低版本升级，高版本拒绝（只停 Coding） |
| 项目库里 Feed 的表 | `projects/<project_id>/molis-work.db#feed` | 1 | `plugin_project_databases.version` | `plugins/native/feed/src/database.ts#FEED_PROJECT_DATABASE` | 低版本升级，高版本拒绝（只停 Feed） |
| 项目库里 Goals 的表 | `projects/<project_id>/molis-work.db#goals` | 1 | `plugin_project_databases.version` | `plugins/native/goals/src/project-database.ts#GOALS_PROJECT_DATABASE` | 低版本升级，高版本拒绝（只停 Goals） |
| 项目库里 Inbox 的表 | `projects/<project_id>/molis-work.db#inbox` | 1 | `plugin_project_databases.version` | `plugins/native/inbox/src/database.ts#INBOX_PROJECT_DATABASE` | 低版本升级，高版本拒绝（只停 Inbox） |
| 项目库里 Schedule 的表 | `projects/<project_id>/molis-work.db#schedule` | 1 | `plugin_project_databases.version` | `plugins/native/schedule/src/database.ts#SCHEDULE_PROJECT_DATABASE` | 低版本升级，高版本拒绝（只停 Schedule） |
| 目录库 | `projects/catalog.db` | 1 | `catalog_meta.schema_version` | `apps/local-host/src/project-catalog-contract.ts#CATALOG_SCHEMA_VERSION` | 低版本升级，高版本拒绝 |
| Functions | `functions/functions.db` | 1 | `user_version` | `modules/judgment-rules/src/store-schema.ts#FUNCTIONS_STORE_BASELINE` | 低版本升级，高版本拒绝 |
| 助理 | `assistant/assistant.db` | 1 | `user_version` | `apps/local-host/src/assistant/assistant-store.ts#ASSISTANT_STORE_BASELINE` | 低版本升级，高版本拒绝 |
| 个人同步队列 | `spaces/<spaceId>/sync/sync.db` | 1 | `user_version` | `modules/sync-replication/src/database.ts#SYNC_STORE_BASELINE` | 低版本升级，高版本拒绝 |
| Home Plugin Runtime | `plugin-runtime/plugin-runtime.db` | 1 | `user_version` | `apps/local-host/src/home-plugin-store.ts#HOME_PLUGIN_RUNTIME_BASELINE` | 低版本升级，高版本拒绝 |
| 装进来的插件的 Home 库账本 | `plugin-libraries/plugin-libraries.db` | 1 | `user_version` | `apps/local-host/src/installed-plugin-libraries.ts#LEDGER_BASELINE` | 低版本升级，高版本拒绝 |
| 插件的本机目录授权 | `plugin-directories/plugin-directories.db` | 1 | `user_version` | `apps/local-host/src/plugin-directory-store.ts#DIRECTORY_GRANTS_BASELINE` | 低版本升级，高版本拒绝 |
| 插件原文件登记 | `plugin-originals/plugin-originals.db` | 1 | `user_version` | `apps/local-host/src/material-original-files.ts#ORIGINAL_FILES_BASELINE` | 低版本升级，高版本拒绝 |
| Issue | `issues/issues.db` | 1 | `user_version` | `plugins/native/issues/src/database.ts#ISSUES_DATABASE` | 低版本升级，高版本拒绝 |
| Goals 的个人方法 | `goals/goals.db` | 1 | `user_version` | `plugins/native/goals/src/home-database.ts#GOALS_HOME_DATABASE` | 低版本升级，高版本拒绝；旧数据搬迁已取消，干净Home创建当前库 |
| Feed 的正文引用账 | `feed-content/feed-content.db` | 1 | `user_version` | `plugins/native/feed/src/content-ledger.ts#FEED_HOME_DATABASE` | 低版本升级，高版本拒绝 |
| 记忆 | `memory/memory.db` | 1 | `user_version` | `packages/storage/src/adapters/memory-ledger.ts#MEMORY_LEDGER_BASELINE` | 低版本升级，高版本拒绝；旧采用路线取消，新Home创建完整reviewed偏好，不重设已有设置 |
| 项目资料 | `knowledge/knowledge.db` | 1 | `user_version` | `packages/storage/src/adapters/knowledge-cards.ts#KNOWLEDGE_CARDS_BASELINE` | 低版本升级，高版本拒绝 |
| Form | `form/form.db` | 1 | `user_version` | `plugins/native/form/src/database.ts#FORM_DATABASE` | 低版本升级，高版本拒绝 |
| 放置 | `placement/placement.db` | 1 | `user_version` | `apps/local-host/src/placement-actions.ts#PLACEMENT_BASELINE` | 低版本升级，高版本拒绝 |
| Agent 定义 | `agent-definitions/agent-definitions.db` | 1 | `user_version` | `apps/local-host/src/agent-definitions/agent-definitions.ts#AGENT_DEFINITIONS_BASELINE` | 低版本升级，高版本拒绝 |
| 插件的 Agent 声明 | `agent-declarations/agent-declarations.db` | 1 | `user_version` | `apps/local-host/src/agent-definitions/agent-declarations.ts#AGENT_DECLARATIONS_BASELINE` | 低版本升级，高版本拒绝 |
| 连接 | `connectors/connectors.db` | 1 | `user_version` | `apps/local-host/src/connectors-store.ts#CONNECTORS_BASELINE` | 低版本升级，高版本拒绝 |
| 引导 | `context-onboarding/context-onboarding.db` | 1 | `user_version` | `apps/local-host/src/context-onboarding-store.ts#CONTEXT_ONBOARDING_BASELINE` | 低版本升级，高版本拒绝 |
| Cognia | `cognia/cognia.db` | 1 | `user_version` | `plugins/native/cognia/src/database.ts#COGNIA_DATABASE` | 低版本升级，高版本拒绝 |
| Dataset | `dataset/dataset.db` | 1 | `user_version` | `plugins/native/dataset/src/database.ts#DATASET_DATABASE` | 低版本升级，高版本拒绝 |
| Images | `images/images.db` | 1 | `user_version` | `plugins/native/images/src/database.ts#IMAGES_DATABASE` | 低版本升级，高版本拒绝 |
| Jelly | `jelly/jelly.db` | 1 | `user_version` | `plugins/native/jelly/src/database.ts#JELLY_DATABASE` | 低版本升级，高版本拒绝 |
| 灵光 | `lingguang/lingguang.db` | 1 | `user_version` | `plugins/native/lingguang/src/database.ts#LINGGUANG_DATABASE` | 低版本升级，高版本拒绝 |
| Pages | `pages/pages.db` | 1 | `user_version` | `plugins/native/pages/src/database.ts#PAGES_DATABASE` | 低版本升级，高版本拒绝 |
| PPT | `ppt/ppt.db` | 1 | `user_version` | `plugins/native/ppt/src/database.ts#PPT_DATABASE` | 低版本升级，高版本拒绝 |
| Todo | `todo/todo.db` | 1 | `user_version` | `plugins/native/todo/src/database.ts#TODO_DATABASE` | 低版本升级，高版本拒绝 |
| Workflows | `workflows/workflows.db` | 1 | `user_version` | `plugins/native/workflows/src/database.ts#WORKFLOWS_DATABASE` | 低版本升级，高版本拒绝 |
| 炼金术士工作室 | `alchemist/projects/<编码后的 project_id>/studio.sqlite` | 1 | `user_version` | `plugins/native/alchemist/src/studio/server/db/schema.ts#ALCHEMIST_STUDIO_BASELINE` | 低版本升级，高版本拒绝 |
| server（讨论） | `server/server.sqlite` | 1 | `user_version` | `server/src/database.ts#SERVER_DATABASE_BASELINE` | 低版本升级，高版本拒绝 |
| 角色 | `characters/characters.sqlite` | 1 | `user_version` | `modules/characters/src/open.ts#CHARACTERS_STORE_BASELINE` | 低版本升级，高版本拒绝 |
| 搜索索引（可重建的派生库） | `search/search.db` | 1 | `search_meta.schema` | `packages/storage/src/adapters/text-search-index.ts#SCHEMA_VERSION` | 清空重建 |
| 密钥与凭据（JSON 文件，不是库） | `feed/secrets.json` | 1 | 文件里的 `version` | `packages/storage/src/adapters/file-secret-store.ts#FORMAT_VERSION` | 拒绝读取高版本（报错 `secrets file format N is not supported`），模型 API Key、连接器凭据和 Feed 证据密钥全部读不出；低版本升级 |
| MCP 授权（JSON 文件，不是库） | `config/mcp-tools.json` | 1 | 文件里的 `version` | `apps/local-host/src/mcp-settings-store.ts#MCP_TOOL_PREFERENCE_VERSION` | 拒绝读取高版本并报告配置错误，保留原文件，明确修复后恢复；低版本升级 |
| Shelf 目录（JSON 文件，不是库） | `shelf/catalog.json` | 1 | `version` | `modules/shelf/src/catalog-shape.ts#CATALOG_VERSION` | 低版本升级，高版本拒绝 |
| 炼金术士搜索缓存 | `alchemist/projects/<编码后的 project_id>/search.sqlite` | 1 | `user_version` | `apps/local-host/src/alchemist-search.ts#ALCHEMIST_SEARCH_BASELINE` | 拒绝 |

Pages当前结构1保留 `page_comments`；原1→2维护及BL-157已被2026-10-30干净重建取代。实现历史见 [Pages与助理规格](../../specs/archive/pages-assistant-surfaces/spec.md)。
当前版本只以上表和代码核对为准。2026-10-30用户决定统一为现行结构的第1版、旧Home搬开后重建；真实 Home 的统一起点已于 2026-11-07 生效（第 4 节）；本次合流保留 Personal 的个人同步技术表与高水位，将现行完整基线及本机持久化文件归一为 1（具体以上表为准）。现行同步集合也归一为 1；新 Home 不继承旧同步授权、游标或远端数据的采用结论。不增加读取兼容或请求内补表，不触及真实 Home。

版本号相同、结构不同的库**不一律拒绝**：`openBaselineHomeSqlite` 的只读结构核对只要求当前基线的每张表都在、且形状与基线一致，**允许额外的表**（项目库会带内置插件自己的表）；缺表或基线表形状不同才报 `storage.schema_structure_mismatch`；有表无版本报 `storage.schema_version_mismatch`，低版本报 `storage.upgrade_pending`，高版本报 `storage.store_too_new`。所以「同号旧形状」既不能推成必拒，也不能推成必收：已知旧同号形状（旧角色库为1但没有 `character_runs`；#661之前的连接库为1；记忆账本旧1带 `facts` 表；MCP授权、Shelf目录、`feed/secrets.json` 和讨论库以前也有过版本1）里，带额外表的不一定被这套结构核对拒掉；其他 owner 自己的路径、权限、密钥与 JSON 检查也不是这个函数的保证，仍由各自入口负责；数字重新从1起算不证明这些旧形状会被接受。重建前不要用新构建打开旧 Home。这里只引用既有记录，没有重新读取真实Home。

统一起点之前版本不符仍整体拒绝，不做历史读取转换、不自动升级；读路径任何时候都不转换，升级只由升级过程做。旧版本的逐段维护、采用、搬迁和残留清理计划全部取消；历史记录从Git查，不再作为安装步骤。待删的其他维护入口由[干净Home分片](../../specs/archive/repository-anti-corruption/slices/home-maintenance-window.md)收口。
- 角色当前结构1保留character_runs原生执行记录、草稿与同步日志；既有检查记录的旧1没有character_runs，本单未重新读取旧Home；现行基线仍检查同号库的所属表是否齐全且形状一致；旧Home整体搬开后新建，不从Sessions或旧角色库迁移，原SQL与演练删除。
- 「拒绝」在已有连接上是 `applySqliteBaseline` 的行为（`packages/storage/src/sqlite-baseline.ts`）：空文件建基线并写版本；版本相同且基线表齐全才放行；版本不符、有表无版本、同号缺表或基线表形状不同都报错并说明路径；版本错误另带找到的版本和期望的版本，结构错误说明与当前基线结构不符，不就地升级。**先只读核对再开可写连接**只是 `openBaselineHomeSqlite` 这个 wrapper 的顺序，公开 `applySqliteBaseline` 本身不做只读预检。目录库用自己的 meta 表，同样只认当前版本（`apps/local-host/src/catalog-schema.ts` 的 `assertCurrentCatalog`）。
- Home Plugin Runtime当前结构1保留项目访问同意范围、批准能力及publisher_trust、plugin_consents与plugin_publishers；新Home启动按Manifest幂等登记常开同意，撤销不复活。旧项目/Runtime升级路线已取消，相关片删除工具。
- Sessions已下线，用户2026-10-30确认删除其离线技术登记与reader；新Home不建sessions目录，未知旧目录不被快照读取，旧Home整体搬开后保留。
- 每次发布把这张表和上个版本的对比写进发布说明的「兼容与升级」，标出变了的行。上个版本没有这张表时，用 `git show <上个 tag>:<定义处文件>` 逐行取旧值。

## 4. 真实 Home：搬开后干净重建

**统一起点的记录**由维护者在本节各项实操通过后填写：日期、提交、构建版本、各库与带版本文件的实际版本，以及可恢复备份的验证结果。记录生效后，各库与带版本文件改结构须带逐版升级步骤。首次外部安装的日期另记在[合同变更流程](../system/CONTRACT-CHANGES.md)。

下面这一行是门禁读的（`scripts/gates/store-versions.mjs`），写法不能改，也改不回去。登记之后，第 3 节的版本只许升不许降，升版本要指向升级段。

统一起点登记：2026-11-07，main 提交 `1b69dcb222`

**统一起点：2026-11-07。** 操作者是第 02 批统筹会话，用户在场并确认开始。

| 项 | 实际 |
| --- | --- |
| main 提交 | `1b69dcb222` |
| 产品版本 | 0.1.0 |
| 新构建 | `content_digest` `cc7b599b…`，`source_digest` `709bc5fc…` |
| 旧构建 | 0.3.0，`content_digest` `47884c43…`，在旧 Home 的 `releases/` 里；没有单独的安装包 |
| 真实 Home | `~/.molis-work` |
| 备份 | `~/.molis-work-rebuild-20261107/backup` |
| 搬开的旧 Home | `~/.molis-work-rebuild-20261107/moved` |
| 旧服务文件 | 同目录的 `com.molis.work.web.plist.moved` |

**各库与带版本文件的实际版本：全部是 1。**

| 记在哪里 | 范围 | 版本 |
| --- | --- | --- |
| `user_version` | 26 个库，含项目库、`characters/characters.sqlite`、Alchemist 的 `studio.sqlite` | 1 |
| `catalog_meta.schema_version` | `projects/catalog.db` | 1 |
| `search_meta.schema` | `search/search.db` | 1 |
| `plugin_project_databases.version` | 项目库里 Goals、Inbox、Schedule、Feed、Coding 的表 | 1 |
| 文件内的版本字段 | `config/installation.json`、`release.json`、`config/onboarding.json`、`config/web-service.json`、`config/project-arrival.json`、`feed/secrets.json`、`shelf/catalog.json` | 1 |

按需才建的库这次没有生成，例如 `server/server.sqlite` 和 Alchemist 搜索缓存。

**备份验证。** 搬动前的旧 Home、备份和搬开后的原件逐项比对路径、权限、大小、修改时间和 SHA-256：28,487 项，0 处差异。旧构建在备份的拷贝上能启动，离线快照通过。随后把备份拷回原路径，用旧构建启动并读到项目列表，回退路径走通，这份拷贝已删除。

**原密钥。** 钥匙串条目 `com.molis.work.feed.secretstore` 建于 11-07 02:19，晚于旧 Home 最后一次写入（01:20，一次 `service stop`）。旧 Home 没有 `feed/secrets.json`，也没有密封数据，回退不依赖密钥。条目保留，未改动。

**旧 Home 的内容。** 0 个项目、0 个连接、0 轮助理，所以 BL-937 没有旧轮次可删。

**隔离演练（同一提交）。** `initial-versions.mjs` 和 `verify-release-versions.mjs` 通过。新建、重启、建项目、快照恢复通过。错版本被拒绝：Home 库和项目库报 `storage.schema_version_mismatch`，目录库报 `catalog.reader_too_old`。新构建打开旧 Home 的拷贝，25 秒内没有就绪（`/health` 一直是 503）。

**新 Home 核对（停服务后，在拷贝上只读）。**

- 所有库 `integrity_check` 为 ok，`foreign_key_check` 为空。
- 17 条内置插件安装记录的版本和摘要与构建清单一致，状态都是 `installed`。
- 离线快照通过。它会拒绝无归属、错版本和损坏的内容。
- 助理轮次、请求、工作都是 0。
- 项目「第一个项目」建好，常驻服务重启后项目还在，`service status` 为 `running`。
- 首次连接：假密钥只以 `keychain+aes-gcm` 密文存在本机，全目录搜不到明文，重启后能解密，断开后密文清除。用户 2026-11-07 定：首次连接用本机假密钥走产品路径算通过，真实账号连接放进 BL-929。

**未验证。**

- 真实账号的连接和 OAuth 授权。
- MCP 授权：旧 Home 没有，新 Home 也没建。
- 助理界面没有目视打开，轮次为零来自数据库和接口。
- 桌面 App：本机没有安装版，不需要重装 0.1.0。
- 本人体验按 BL-929 单独验。

用户已于 2026-11-04 确认[第 02 批维护窗口](../../specs/post-anticorruption-roadmap/reference/batches/02.md#batch-02-item-3)。待 ① 遗留核账、② 共享代码与合同、④ 升级规则的 PR 合入后，按以下步骤在用户在场时执行，并记录实际构建、原 Home 路径和操作者。若需改期，由统筹提前一天与用户另约窗口。重建日期在实操通过后填写。

1. 统筹列出新旧构建、可回退的旧安装包、实际 Home 路径、备份位置，以及本次会使用的版本号。N34 涉及的旧 GitHub `v0.1.0` release（`375162104`，8 个附件）及指向 `60ca973e2b` 的同名标签，已按用户 2026-11-06 追加授权于 13:18 UTC 删除；随后发布查询返回 404，远端标签查询成功且为空。本次只释放这两个旧对象的名称，其他发布与标签保留。准备用于窗口的 0.1.0 构建仍须运行 `node scripts/verify-release-versions.mjs`，并另验构建和安装；这里不发布新版本。
2. 按 §4.1 在隔离 Home 演练新建、重启与恢复。维护当天由用户确认开始，停止原 Home 的所有写入者，再按 §4.2 完成可恢复备份。任何路径、所有权、旧构建或原密钥无法确认，停在搬开旧 Home 之前。
3. 按 §4.2 搬开整份旧 Home，§4.3–4.4 在原路径建立干净 Home 并安装已经验证的构建。依 [BL-937 的决定](https://github.com/molis-ai/molis-work/blob/29cec0f63b82935500c0950202ab689791c87567/specs/post-anticorruption-roadmap/reference/decisions.md#policy-bl-937)，重建时删除旧助理轮次。新助理库从空库开始，不补标、不导入旧轮次。
4. 按 §4.5 核对各库、安装清单、首次授权与重启，并在新助理界面核对旧轮次为零。失败时停止新进程，保留失败现场。将新 Home 移到另一未占用位置，把完整旧 Home 放回原路径，使用对应旧构建与原密钥，核对原项目可读后才恢复服务。
5. 统筹回填实际日期、main 提交、产品版本与各库版本，列清未通过项。上述步骤都通过才登记[统一起点](../../specs/upgrade-continuity/spec.md#3-起点库从统一起点开始升级链)，再交第 05 批接升级链。本人体验单独按 BL-929 验。

### 4.1 动手前

- [ ] 在与维护窗口相同的构建上运行 `node scripts/gates/initial-versions.mjs`，逐项处理仍高于 1 的自有版本，检查通过后再执行真实 Home 步骤。此命令只读临时 Home 的运行目录。

确认相关PR已按新起点收口并经验证/二审；在隔离Home验证新建、重启和错版本拒绝。确认真实Home路径与所有写入者，用户说“开始”后只按pid停常驻服务、4207/4208以及连接同一Home的Web/MCP；用service status和ps确认已无写入者。不要按进程名批量终止。

### 4.2 搬开旧 Home

先要有完整可恢复备份。记录真实 Home 的绝对路径，停写后在 Home 外以私有权限完整复制目录，保留文件权限与内容，核对可按原路径、原安装与原密钥取回。备份和搬开分别使用两个尚不存在的位置，权限限本人，已有目录不覆盖。另有已登记业务集合的[离线快照与恢复](../cli-and-development.md#home-离线快照)，其范围不含全部旧目录，且要求同机、原路径和原密钥。旧格式被快照拒绝时如实记录，不能把失败的快照当作备份。无法证实备份可恢复时，先解决问题再搬动原目录。

备份核实后才把整个原 Home 搬到预定位置，保留旧安装和 Keychain 主密钥。新 Home 不带入旧库。记录实际两处位置，不把备份内容或密钥写进仓库。

目录库1不再存项目库绝对路径，由当前Home与project_id推导。W5-17历史候选v23已于2026-10-30被当前起点1取代，不再执行该号迁移。W5-17迁移已取消；真实重建等用户另说“开始”。目录可推导不扩展跨Home/原key恢复承诺。旧v22目录库用新构建打开会以 `catalog.reader_too_old` 拒绝；其附带的新建或Fork Session、再 `context_resolve` 提示不能消除存储版本差异。重建前不要用新构建启动4207。

### 4.3 先验证干净 Home

使用现行结构直接创建每库第1版。项目/连接/授权不从旧Home继承；不运行旧迁移或残留清理。检查当前存储声明与版本表一致、没有按旧版本分支的启动建表；错版和已有owner合同覆盖的错结构仍拒绝；不推定同号旧形状全被识别。原维护八及其后候选已被2026-10-30干净重建取代：连接库、Pages、项目库/Runtime升级、角色运行表、Functions判断安装号、助理执行方转换、Shelf转换、Goals/Inbox/Feed搬迁与残留改写均取消，不能沿旧清单执行；取消项不保留待做勾选框。

- **目录库 W5-17（原迁移已被干净重建取代，真实重建未开始）。** 当前结构1没有projects.database_path，代码及S-102拒绝覆盖保留；catalog迁移脚本、旧结构夹具及演练删除。按统筹6517794305，旧Home整体搬开后新建当前Home，不逐库转换，具体执行等全部代码就绪后用户“开始”。

### 4.4 装新构建

用户批准开始且旧Home已搬开后，使用合入后的干净main构建执行 `pnpm install:local`；`service status` 是 `needs_repair` 才执行 `service install --confirm`。新Home需要的密钥条目由构建正常创建，保留旧条目；不人工清钥匙串。

装过 0.3.0 的开发机在本窗口手动重装经验证的 0.1.0 构建，不仅重开现有桌面 App，也不依赖常规版本更新检测完成降版。安装后核对实际运行的提交、`content_digest` 与版本，不能只看产品界面显示 0.1.0。

### 4.5 动完之后

新Home逐库只读核对版本都是1、`integrity_check` ok、`foreign_key_check`空，内置安装记录与清单一致，目录没有无归属内容。验证新项目、首次连接/授权和重启的当前产品路径；不从旧数据推定成功。记录日期、构建、实际版本和结果后才写维护完成。项目、连接和原MCP授权由用户在新Home重建，Runtime会话按需要重新打开。

内置插件的版本与摘要按 [POLICY.md](POLICY.md) 第 7.8 节核对。N4 的摘要与签名共用 SDK 的原始 UTF-16 键顺序，不随宿主语言变化；Goals 请求摘要也使用同一顺序，重建后的回执按新规则生成，不转换旧 Home 的幂等记录。定向回归见 `tests/canonical-json-consumers.test.ts` 和 `tests/plugin-package.test.ts`。先在构建好的仓库根目录打印当前构建的清单：

```sh
node --input-type=module -e '
import { pluginManifestDigest } from "@molis-ai/molis-work-plugin-runtime";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
for (const { manifest } of BUILTIN_PLUGIN_CATALOG) {
  console.log(manifest.plugin_id, manifest.version, pluginManifestDigest(manifest));
}'
```

在获准的只读拷贝中，分别对每个项目库和 `plugin-runtime/plugin-runtime.db` 执行：`SELECT json_extract(record_json,'$.plugin_id'), json_extract(record_json,'$.version'), json_extract(record_json,'$.manifest_digest'), json_extract(record_json,'$.state') FROM plugin_runtime_installs;`。只打开拷贝里的路径，不沿用目录库里指向真实 Home 的路径。项目监督器的名单以登记上的 `project_runtime` 为准，Home 监督器以 `runtime` 为准；逐条确认实际启动的内置插件记录与上面构建清单的版本、摘要一致，`state` 和监督器报告没有启动失败。重启后安装身份与私有数据仍在；本次新 Home 不继承旧安装记录。

出现版本/结构不符、服务异常或核对失败就停，交统筹决定；不改PRAGMA绕过、不自动搬回旧Home或删除旧目录。产品发布版本和读取兼容起算策略不因本次存储起点改变。

## 5. 发布后

- [ ] 合并后在合并提交上打 tag `v<版本>`，再在这个 tag 上手动运行 Release macOS Desktop 工作流（`.github/workflows/release-macos.yml` 现在只有 `workflow_dispatch`，推 tag 不会触发它；选 tag 运行才会做 `--tag` 核对并发布 GitHub Release）。Release 资产和校验和来自同一提交（`docs/installation.md`「发布后的最终产物验收」第 1 条）。
- [ ] 按同一节的第 2 至 5 条逐层验收常驻服务、Runtime 接入、新 Session 和真实项目的用户可见结果，之后才能把消费者可见的修复标成「已安装」。
- [ ] 发布 PR 里补上备份路径、维护记录位置和上面各项的结果。


T144 的当前 Agent 定义 schema 仍以版本 1 为干净起点：`prompt_overrides.default_ref`、`prompt_history.default_ref`、`prompt_uses.source_ref` 为 nullable TEXT。Native 行为显式存 NULL，签名角色存完整默认/使用来源引用；fixtures 与当前 baseline 同步。不提供旧库缺列读取或 ALTER-on-open；真实 Home 搬开与重建依发布授权执行，不能把私有干净 Home 的测试当成真实 Home 迁移证据。
