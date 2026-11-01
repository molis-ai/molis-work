# 发布前检查清单

每次发布把这份清单复制进发布 PR 的描述，逐项勾选；做不到的项写明原因，不删项。规则出处是 [POLICY.md](POLICY.md)。

## 1. 定版本，写材料

- [ ] 对照上个 tag 以来的变化选次版本或补丁（[POLICY.md](POLICY.md) 第 2 节）。库版本有没有变，看第 3 节的表：`git diff <上个 tag> -- <表里的定义处文件>`。
- [ ] 这个版本是 1.0.0 或之后、并且会装到开发机之外吗？用户 2026-10-08 的决定 #15：「不留兼容」到第一个装到开发机之外的版本为止；用户 2026-10-29 又定「1.0.0 之前都是开发版本」，所以 1.0.0 之前的版本都不是它（`specs/repository-anti-corruption/spec.md` §1）。两样都是的话，发布 PR 把版本号、日期和提交写进 [docs/system/CONTRACT-CHANGES.md](../system/CONTRACT-CHANGES.md) 顶部的「起点日期」，并把它的第 3 节标为已结束；从那以后合同变更走那份文件第 4 节的读取兼容流程，库的版本变更要带升级路径，不再是拒绝加一次性维护（[POLICY.md](POLICY.md) 第 2、5 节和本清单第 4.3 节写的做法只到这一版为止）。那份文件第 5 节列的前置（公开 API 快照、动作合同快照、插件回放工具等）要在发这个版本之前就位；库的升级机制现在也没有，方案见 `specs/repository-anti-corruption/c-end-readiness.md` §3.2。有一样不是的话，在这一项写明「不是外部版本」，仍按「不留兼容」办。
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

每个库只认一个当前版本，不符时的处理在最后一列。表里有两类东西：Home 里的 SQLite 库，和需要在重建时核对的 JSON 文件（`feed/secrets.json`、`config/mcp-tools.json` 和 `shelf/catalog.json` 均由各 owner 拒绝错误格式）。其他带版本字段的小 JSON 文件（`browser/sites.json`、`jelly/preferences.json`、`config/` 下的各个文件，包括 `config/installation.json`）不在表里：它们的版本见 [docs/system/HOME-DATA.md](../system/HOME-DATA.md) 第 6 节的「种类 · 版本」列，版本不符时各自怎样没有逐个核对过，改其中任何一个的版本，就在发布说明的「兼容与升级」里写明。每个库的 owner、表、备份与卸载规则也在 HOME-DATA.md。位置都相对 Home（默认 `~/.molis-work`，`MOLIS_WORK_HOME` 可改）。

`scripts/verify-release-versions.mjs` 对照代码核对这张表，下面几种情况 CI 会失败：某行的版本和定义处的代码不一致；定义处不存在；包的 `src/` 里有一个 `SqliteBaseline` 常量（`const X: SqliteBaseline = {…}`、`const X = {…} satisfies SqliteBaseline`、`… as SqliteBaseline` 三种写法都算）没有列进表，或者它的版本不是对象里写成数字的 `version: N`（引用别的常量，脚本读不出来）；`applySqliteBaseline`、`openBaselineHomeSqlite` 收到的不是一个已声明的常量（内联对象不行）；标「无」的库的定义处文件加上了版本标记。它找不到的是完全不经 `applySqliteBaseline` 的新库（比如又一个只靠 `CREATE TABLE IF NOT EXISTS` 的库）和表以外的 JSON 文件，这类只能靠 HOME-DATA.md 的清单和评审发现。

插件自有库的 `PluginDatabaseDeclaration` 也按同一规则检查：必须具名、写出数字版本并列入下表。可信 Host 的连接服务仅转发这份声明；这一个类型化转发调用被单独识别，其余内联或未声明基线仍拒绝。

| 库 | 位置 | 版本 | 记在 | 定义处 | 版本不符时 |
| --- | --- | --- | --- | --- | --- |
| 项目库 | `projects/<project_id>/molis-work.db` | 1 | `user_version` | `apps/local-host/src/project-database-schema.ts#PROJECT_DATABASE_BASELINE` | 拒绝 |
| 项目库里 Coding 的表 | `projects/<project_id>/molis-work.db#coding` | 1 | `plugin_project_databases.version` | `plugins/native/coding/src/database.ts#CODING_PROJECT_DATABASE` | 拒绝（只停 Coding） |
| 项目库里 Feed 的表 | `projects/<project_id>/molis-work.db#feed` | 1 | `plugin_project_databases.version` | `plugins/native/feed/src/database.ts#FEED_PROJECT_DATABASE` | 拒绝（只停 Feed） |
| 项目库里 Goals 的表 | `projects/<project_id>/molis-work.db#goals` | 1 | `plugin_project_databases.version` | `plugins/native/goals/src/project-database.ts#GOALS_PROJECT_DATABASE` | 拒绝（只停 Goals） |
| 项目库里 Inbox 的表 | `projects/<project_id>/molis-work.db#inbox` | 1 | `plugin_project_databases.version` | `plugins/native/inbox/src/database.ts#INBOX_PROJECT_DATABASE` | 拒绝（只停 Inbox） |
| 项目库里 Schedule 的表 | `projects/<project_id>/molis-work.db#schedule` | 1 | `plugin_project_databases.version` | `plugins/native/schedule/src/database.ts#SCHEDULE_PROJECT_DATABASE` | 拒绝（只停 Schedule） |
| 目录库 | `projects/catalog.db` | 1 | `catalog_meta.schema_version` | `apps/local-host/src/project-catalog-contract.ts#CATALOG_SCHEMA_VERSION` | 拒绝 |
| Functions | `functions/functions.db` | 1 | `user_version` | `modules/judgment-rules/src/store-schema.ts#FUNCTIONS_STORE_BASELINE` | 拒绝 |
| 助理 | `assistant/assistant.db` | 1 | `user_version` | `apps/local-host/src/assistant/assistant-store.ts#ASSISTANT_STORE_BASELINE` | 拒绝 |
| Home Plugin Runtime | `plugin-runtime/plugin-runtime.db` | 1 | `user_version` | `apps/local-host/src/home-plugin-store.ts#HOME_PLUGIN_RUNTIME_BASELINE` | 拒绝 |
| 装进来的插件的 Home 库账本 | `plugin-libraries/plugin-libraries.db` | 1 | `user_version` | `apps/local-host/src/installed-plugin-libraries.ts#LEDGER_BASELINE` | 拒绝 |
| 插件的本机目录授权 | `plugin-directories/plugin-directories.db` | 1 | `user_version` | `apps/local-host/src/plugin-directory-store.ts#DIRECTORY_GRANTS_BASELINE` | 拒绝 |
| 插件原文件登记 | `plugin-originals/plugin-originals.db` | 1 | `user_version` | `apps/local-host/src/material-original-files.ts#ORIGINAL_FILES_BASELINE` | 拒绝 |
| Issue | `issues/issues.db` | 1 | `user_version` | `plugins/native/issues/src/database.ts#ISSUES_DATABASE` | 拒绝 |
| Goals 的个人方法 | `goals/goals.db` | 1 | `user_version` | `plugins/native/goals/src/home-database.ts#GOALS_HOME_DATABASE` | 拒绝；旧数据搬迁已取消，干净Home创建当前库 |
| Feed 的正文引用账 | `feed-content/feed-content.db` | 1 | `user_version` | `plugins/native/feed/src/content-ledger.ts#FEED_HOME_DATABASE` | 拒绝 |
| 记忆 | `memory/memory.db` | 1 | `user_version` | `packages/storage/src/adapters/memory-ledger.ts#MEMORY_LEDGER_BASELINE` | 拒绝；旧采用路线取消，新Home创建完整reviewed偏好，不重设已有设置 |
| 项目资料 | `knowledge/knowledge.db` | 1 | `user_version` | `packages/storage/src/adapters/knowledge-cards.ts#KNOWLEDGE_CARDS_BASELINE` | 拒绝 |
| Form | `form/form.db` | 1 | `user_version` | `plugins/native/form/src/database.ts#FORM_DATABASE` | 拒绝 |
| 放置 | `placement/placement.db` | 1 | `user_version` | `apps/local-host/src/placement-actions.ts#PLACEMENT_BASELINE` | 拒绝 |
| Agent 定义 | `agent-definitions/agent-definitions.db` | 1 | `user_version` | `apps/local-host/src/agent-definitions/agent-definitions.ts#AGENT_DEFINITIONS_BASELINE` | 拒绝 |
| 插件的 Agent 声明 | `agent-declarations/agent-declarations.db` | 1 | `user_version` | `apps/local-host/src/agent-definitions/agent-declarations.ts#AGENT_DECLARATIONS_BASELINE` | 拒绝 |
| 连接 | `connectors/connectors.db` | 1 | `user_version` | `apps/local-host/src/connectors-store.ts#CONNECTORS_BASELINE` | 拒绝 |
| 引导 | `context-onboarding/context-onboarding.db` | 1 | `user_version` | `apps/local-host/src/context-onboarding-store.ts#CONTEXT_ONBOARDING_BASELINE` | 拒绝 |
| Cognia | `cognia/cognia.db` | 1 | `user_version` | `plugins/native/cognia/src/database.ts#COGNIA_DATABASE` | 拒绝 |
| Dataset | `dataset/dataset.db` | 1 | `user_version` | `plugins/native/dataset/src/database.ts#DATASET_DATABASE` | 拒绝 |
| Images | `images/images.db` | 1 | `user_version` | `plugins/native/images/src/database.ts#IMAGES_DATABASE` | 拒绝 |
| Jelly | `jelly/jelly.db` | 1 | `user_version` | `plugins/native/jelly/src/database.ts#JELLY_DATABASE` | 拒绝 |
| 灵光 | `lingguang/lingguang.db` | 1 | `user_version` | `plugins/native/lingguang/src/database.ts#LINGGUANG_DATABASE` | 拒绝 |
| Pages | `pages/pages.db` | 1 | `user_version` | `plugins/native/pages/src/database.ts#PAGES_DATABASE` | 拒绝 |
| PPT | `ppt/ppt.db` | 1 | `user_version` | `plugins/native/ppt/src/database.ts#PPT_DATABASE` | 拒绝 |
| Todo | `todo/todo.db` | 1 | `user_version` | `plugins/native/todo/src/database.ts#TODO_DATABASE` | 拒绝 |
| Workflows | `workflows/workflows.db` | 1 | `user_version` | `plugins/native/workflows/src/database.ts#WORKFLOWS_DATABASE` | 拒绝 |
| 炼金术士工作室 | `alchemist/projects/<编码后的 project_id>/studio.sqlite` | 1 | `user_version` | `plugins/native/alchemist/src/studio/server/db/schema.ts#ALCHEMIST_STUDIO_BASELINE` | 拒绝 |
| server（讨论） | `server/server.sqlite` | 1 | `user_version` | `server/src/database.ts#SERVER_DATABASE_BASELINE` | 拒绝 |
| 角色 | `characters/characters.sqlite` | 1 | `user_version` | `modules/characters/src/open.ts#CHARACTERS_STORE_BASELINE` | 拒绝 |
| 搜索索引（可重建的派生库） | `search/search.db` | 1 | `search_meta.schema` | `packages/storage/src/adapters/text-search-index.ts#SCHEMA_VERSION` | 清空重建 |
| 密钥与凭据（JSON 文件，不是库） | `feed/secrets.json` | 1 | 文件里的 `version` | `packages/storage/src/adapters/file-secret-store.ts#FORMAT_VERSION` | 拒绝读取（报错 `secrets file format N is not supported`），模型 API Key、连接器凭据和 Feed 证据密钥全部读不出 |
| MCP 授权（JSON 文件，不是库） | `config/mcp-tools.json` | 1 | 文件里的 `version` | `apps/local-host/src/mcp-settings-store.ts#MCP_TOOL_PREFERENCE_VERSION` | 拒绝读取并报告配置错误；保留原文件，明确修复后恢复 |
| Shelf 目录（JSON 文件，不是库） | `shelf/catalog.json` | 1 | `version` | `modules/shelf/src/catalog.ts#CATALOG_VERSION` | 拒绝 |
| 炼金术士搜索缓存 | `alchemist/projects/<编码后的 project_id>/search.sqlite` | 1 | `user_version` | `apps/local-host/src/alchemist-search.ts#ALCHEMIST_SEARCH_BASELINE` | 拒绝 |

Pages当前结构1保留 `page_comments`；原1→2维护及BL-157已被2026-10-30干净重建取代。实现历史见 [Pages与助理规格](../../specs/archive/pages-assistant-surfaces/spec.md)。
当前版本只以上表和代码核对为准。2026-10-30用户决定统一为现行结构的第1版、旧Home搬开后重建；本批已统一上表的存储起点，表、索引、权限和事实归属保持现行合同。

版本号相同、结构不同的旧库不在检查范围内；重建前不要用新构建打开旧 Home。已知例子：旧角色库曾为1但没有 `character_runs`；#661之前的连接库也曾为1；记忆账本旧1曾带 `facts` 表；MCP授权、Shelf目录、`feed/secrets.json` 和讨论库以前也有过版本1。数字重新从1起算不证明这些旧形状会被拒绝；原有明确的结构、路径、权限与密钥检查仍保留。这里只引用既有记录，没有重新读取真实Home。

版本不符仍整体拒绝，不做历史读取转换、不自动升级。旧版本的逐段维护、采用、搬迁和残留清理计划全部取消；历史记录从Git查，不再作为安装步骤。待删的其他维护入口由[干净Home分片](../../specs/repository-anti-corruption/slices/home-maintenance-window.md)收口。
- 角色当前结构保留character_runs原生执行记录与草稿，起点1；既有检查记录的旧1没有character_runs，同号旧形状不在检查范围内；旧Home整体搬开后新建，不从Sessions或旧角色库迁移，原SQL与演练删除。
- 「拒绝」是 `applySqliteBaseline` 的行为（`packages/storage/src/sqlite-baseline.ts`）：空文件建基线并写版本，版本相同照常打开，其他一律报错，带路径、找到的版本和期望的版本，不就地升级。目录库用自己的 meta 表，同样只认当前版本（`apps/local-host/src/catalog-schema.ts` 的 `assertCurrentCatalog`）。
- Home Plugin Runtime当前结构1保留publisher_trust、plugin_consents与plugin_publishers；新Home启动按Manifest幂等登记常开同意，撤销不复活。旧项目/Runtime升级路线已取消，相关片删除工具。
- Sessions已下线，用户2026-10-30确认删除其离线技术登记与reader；新Home不建sessions目录，未知旧目录不被快照读取，旧Home整体搬开后保留。
- 每次发布把这张表和上个版本的对比写进发布说明的「兼容与升级」，标出变了的行。上个版本没有这张表时，用 `git show <上个 tag>:<定义处文件>` 逐行取旧值。

## 4. 真实 Home：搬开后干净重建

本节只在所有起点分片与产品PR已合入main、干净构建就绪后执行。旧Home仍由旧构建使用；合入代码不授权安装，也不授权停止4207。统筹取得用户本次“开始”前，不动真实Home、服务、安装或Keychain。

### 4.1 动手前

确认相关PR已按新起点收口并经验证/二审；在隔离Home验证新建、重启和错版本拒绝。确认真实Home路径与所有写入者，用户说“开始”后只按pid停常驻服务、4207/4208以及连接同一Home的Web/MCP；用service status和ps确认已无写入者。不要按进程名批量终止。

### 4.2 搬开旧 Home

本次用户允许不复制备份。把整个 `~/.molis-work` 搬到 `~/molis-work-backups/2026-10-30-replaced-by-clean-home/`，目录700，目标已存在则拒绝覆盖。搬开后不读取、迁移或删除旧数据；不是把旧库搬回新Home。Keychain里的旧Home主密钥不删不改；已存在的只读副本也保留，由用户决定以后处理。

目录库1不再存项目库绝对路径，由当前Home与project_id推导。W5-17历史候选v23已于2026-10-30被当前起点1取代，不再执行该号迁移。W5-17迁移已取消；真实重建等用户另说“开始”。目录可推导不扩展跨Home/原key恢复承诺。旧v22目录库用新构建打开会以 `catalog.reader_too_old` 拒绝；其附带的新建或Fork Session、再 `context_resolve` 提示不能消除存储版本差异。重建前不要用新构建启动4207。

### 4.3 先验证干净 Home

使用现行结构直接创建每库第1版。项目/连接/授权不从旧Home继承；不运行旧迁移或残留清理。检查当前存储声明与版本表一致、没有按旧版本分支的启动建表；错版和已有owner合同覆盖的错结构仍拒绝；不推定同号旧形状全被识别。原维护八及其后候选已被2026-10-30干净重建取代：连接库、Pages、项目库/Runtime升级、角色运行表、Functions判断安装号、助理执行方转换、Shelf转换、Goals/Inbox/Feed搬迁与残留改写均取消，不能沿旧清单执行；取消项不保留待做勾选框。

- **目录库 W5-17（原迁移已被干净重建取代，真实重建未开始）。** 当前结构1没有projects.database_path，代码及S-102拒绝覆盖保留；catalog迁移脚本、旧结构夹具及演练删除。按统筹6517794305，旧Home整体搬开后新建当前Home，不逐库转换，具体执行等全部代码就绪后用户“开始”。

### 4.4 装新构建

用户批准开始且旧Home已搬开后，使用合入后的干净main构建执行 `pnpm install:local`；`service status` 是 `needs_repair` 才执行 `service install --confirm`。新Home需要的密钥条目由构建正常创建，保留旧条目；不人工清钥匙串。

### 4.5 动完之后

新Home逐库只读核对版本都是1、`integrity_check` ok、`foreign_key_check`空，内置安装记录与清单一致，目录没有无归属内容。验证新项目、首次连接/授权和重启的当前产品路径；不从旧数据推定成功。记录日期、构建、实际版本和结果后才写维护完成。项目、连接和原MCP授权由用户在新Home重建，Runtime会话按需要重新打开。

内置插件的版本与摘要按 [POLICY.md](POLICY.md) 第 7.8 节核对。先在构建好的仓库根目录打印当前构建的清单：

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
