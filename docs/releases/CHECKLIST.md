# 发布前检查清单

每次发布把这份清单复制进发布 PR 的描述，逐项勾选；做不到的项写明原因，不删项。规则出处是 [POLICY.md](POLICY.md)。

## 1. 定版本，写材料

- [ ] 对照上个 tag 以来的变化选次版本或补丁（[POLICY.md](POLICY.md) 第 2 节）。库版本有没有变，看第 3 节的表：`git diff <上个 tag> -- <表里的定义处文件>`。
- [ ] 这个版本会装到开发机之外吗？用户 2026-10-08 的决定 #15：「不留兼容」到第一个装到开发机之外的版本为止，1.0 或更早出现的第一个外部用户，哪个先发生，它就是那个版本（`specs/repository-anti-corruption/spec.md` §1）。会的话，发布 PR 把版本号、日期和提交写进 [docs/system/CONTRACT-CHANGES.md](../system/CONTRACT-CHANGES.md) 顶部的「起点日期」，并把它的第 3 节标为已结束；从那以后合同变更走那份文件第 4 节的读取兼容流程，库的版本变更要带升级路径，不再是拒绝加一次性维护（[POLICY.md](POLICY.md) 第 2、5 节和本清单第 4.3 节写的做法只到这一版为止）。那份文件第 5 节列的前置（公开 API 快照、动作合同快照、插件回放工具等）要在发这个版本之前就位；库的升级机制现在也没有，方案见 `specs/repository-anti-corruption/c-end-readiness.md` §3.2。不会的话，在这一项写明「不是外部版本」，仍按「不留兼容」办。
- [ ] 改版本号：根 `package.json`；`apps/desktop/src-tauri/` 的 `tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 里的 `molis-work-desktop`；`apps/local-host/src/feed-source-runtime.ts` 的 `APP_VERSION`；`horizontal/runtime-host/src/adapters/codex-app-server.ts` 的 `clientInfo.version`（[POLICY.md](POLICY.md) 第 1 节）。
- [ ] 内置插件清单的版本与摘要（监督器的 7 个：Characters、Shelf、Coding、Files、Diff、Git、TextStats，名单以第 4.5 节的命令为准）。用户 2026-10-08 选了 [POLICY.md](POLICY.md) 第 7.5 节的做法 A（第 7.6 节），已经实现（第 7.8 节）：Runtime 对内置插件一律跟当前构建，清单的版本被改低、或摘要变了而版本没变，都不会再让已装的旧代码悄悄继续跑，也不会因为旧发行物的存档不在而启动失败（`plugin_release_artifact_missing`），所以这一项不再是拦发布的人工兜底。要做三件事。（1）确认这个构建里有 A：`node scripts/run-tests.mjs tests/plugin-release-artifact.test.ts` 通过，其中「a bundled Manifest below the installed version is followed」「a bundled Manifest changed without a new version is followed」两条是它的固定点。（2）7 份清单的 `version` 等于产品版本，脚本 `verify-release-versions.mjs` 的「内置清单版本等于产品版本」通过（这一条由 0.3.0 的发布 PR 加进脚本，现在还没有）。（3）在构建好的仓库根目录跑第 4.5 节的命令，得到每个清单的 `plugin_id`、版本、摘要，把这张表写进发布说明的「兼容与升级」，作为这个版本带的是哪份清单的记录；它不再用来拦发布，第 4.5 节对开发机 Home 的核对拿同一条命令的结果比对，不用再构建旧 tag。不要用 `git diff <上个 tag> -- 'plugins/native/*/src/manifest.ts'` 代替：清单里的 `actions`、`consumes` 来自插件别的文件和 contracts，改它们不碰 `manifest.ts`，摘要照样变。**v0.2.0 里还没有这 7 个插件，所以 0.3.0 没有可比的上一张表。**
- [ ] [CHANGELOG.md](CHANGELOG.md)：`[Unreleased]` 改成 `[<版本>] - <日期>`，上面另起一个空的 `[Unreleased]`，页尾比较链接（若有）跟着改。
- [ ] 写 `docs/releases/v<版本>.md`，包含「兼容与升级」（哪些库的版本变了、旧 Home 要做什么、Runtime 要不要重新接入）和「发布范围与验证」（真实的回归数字、已知失败、没验证的东西）。
- [ ] `node scripts/verify-release-versions.mjs` 通过（打 tag 时再加 `--tag v<版本>`）。

## 2. 验证

- [ ] `pnpm install --frozen-lockfile`，整体 `pnpm build`，`pnpm test`。全量只在本地跑，CI 只跑子集（`.github/workflows/ci.yml` 的注释）；浏览器用例需要本机 Chrome。全量回归期间不改源码、脚本、`package.json` 和 `skills/`（`AGENTS.md`「构建与测试」）。
- [ ] 失败的用例逐个分清：产品回归、预期变化、测试缺陷、环境与时序；对照干净基线工作树的结果。发布说明里写数字，不写「通过」两个字。
- [ ] `node scripts/check-health-gates.mjs --base origin/main` 通过。
- [ ] 构建安装包：`pnpm desktop:build:macos`（先跑版本核对，产物在 `release/macos/`，附 SHA256）。公开发行需要 Developer ID 签名与 Apple 公证，缺凭据时 tag 构建会失败（`.github/workflows/release-macos.yml`）；没有公证的本机构建不叫公开发行包。
- [ ] 安装器：源码与 `dist` 不一致会停止（`apps/local-host/src/installer/fingerprint.ts`）；所以发布构建前整体 `pnpm build`，不复用旧的 `dist`。

## 3. 各库版本表

每个库只认一个当前版本，不符时的处理在最后一列。表里有两类东西：Home 里的 SQLite 库，和两个版本不符就让全部凭据或授权失效的 JSON 文件（`feed/secrets.json` 拒绝读取，`config/mcp-tools.json` 读成空）。其他带版本字段的小 JSON 文件（`shelf/catalog.json`、`browser/sites.json`、`jelly/preferences.json`、`config/` 下的各个文件，包括 `config/installation.json`）不在表里：它们的版本见 [docs/system/HOME-DATA.md](../system/HOME-DATA.md) 第 6 节的「种类 · 版本」列，版本不符时各自怎样没有逐个核对过，改其中任何一个的版本，就在发布说明的「兼容与升级」里写明。每个库的 owner、表、备份与卸载规则也在 HOME-DATA.md。位置都相对 Home（默认 `~/.molis-work`，`MOLIS_WORK_HOME` 可改）。

`scripts/verify-release-versions.mjs` 对照代码核对这张表，下面几种情况 CI 会失败：某行的版本和定义处的代码不一致；定义处不存在；包的 `src/` 里有一个 `SqliteBaseline` 常量（`const X: SqliteBaseline = {…}`、`const X = {…} satisfies SqliteBaseline`、`… as SqliteBaseline` 三种写法都算）没有列进表，或者它的版本不是对象里写成数字的 `version: N`（引用别的常量，脚本读不出来）；`applySqliteBaseline`、`openBaselineHomeSqlite` 收到的不是一个已声明的常量（内联对象不行）；标「无」的库的定义处文件加上了版本标记。它找不到的是完全不经 `applySqliteBaseline` 的新库（比如又一个只靠 `CREATE TABLE IF NOT EXISTS` 的库）和表以外的 JSON 文件，这类只能靠 HOME-DATA.md 的清单和评审发现。

| 库 | 位置 | 版本 | 记在 | 定义处 | 版本不符时 |
| --- | --- | --- | --- | --- | --- |
| 项目库 | `projects/<project_id>/molis-work.db` | 6 | `user_version` | `apps/local-host/src/project-database-schema.ts#PROJECT_DATABASE_BASELINE` | 拒绝 |
| 目录库 | `projects/catalog.db` | 22 | `catalog_meta.schema_version` | `apps/local-host/src/project-catalog-contract.ts#CATALOG_SCHEMA_VERSION` | 拒绝 |
| 会话库 | `sessions/sessions.db` | 7 | `session_meta.schema_version` | `modules/private-work-context/src/session-schema.ts#SESSION_REGISTRY_SCHEMA_VERSION` | 拒绝 |
| Functions | `functions/functions.db` | 3 | `user_version` | `modules/functions/src/store.ts#FUNCTIONS_STORE_BASELINE` | 拒绝 |
| 助理 | `assistant/assistant.db` | 2 | `user_version` | `apps/local-host/src/assistant/assistant-store.ts#ASSISTANT_STORE_BASELINE` | 拒绝 |
| 记忆 | `memory/memory.db` | 2 | `user_version` | `packages/storage/src/adapters/memory-ledger.ts#MEMORY_LEDGER_BASELINE` | 拒绝 |
| Form | `form/form.db` | 2 | `user_version` | `plugins/native/form/src/store.ts#FORM_STORE_BASELINE` | 拒绝 |
| 放置 | `placement/placement.db` | 1 | `user_version` | `apps/local-host/src/placement-actions.ts#PLACEMENT_BASELINE` | 拒绝 |
| Agent 定义 | `agent-definitions/agent-definitions.db` | 1 | `user_version` | `apps/local-host/src/agent-definitions/agent-definitions.ts#AGENT_DEFINITIONS_BASELINE` | 拒绝 |
| 连接 | `connectors/connectors.db` | 1 | `user_version` | `apps/local-host/src/connectors-store.ts#CONNECTORS_BASELINE` | 拒绝 |
| 引导 | `context-onboarding/context-onboarding.db` | 1 | `user_version` | `apps/local-host/src/context-onboarding-store.ts#CONTEXT_ONBOARDING_BASELINE` | 拒绝 |
| Cognia | `cognia/cognia.db` | 1 | `user_version` | `plugins/native/cognia/src/store.ts#COGNIA_STORE_BASELINE` | 拒绝 |
| Dataset | `dataset/dataset.db` | 1 | `user_version` | `plugins/native/dataset/src/store.ts#DATASET_STORE_BASELINE` | 拒绝 |
| Images | `images/images.db` | 1 | `user_version` | `plugins/native/images/src/store.ts#IMAGES_STORE_BASELINE` | 拒绝 |
| Jelly | `jelly/jelly.db` | 1 | `user_version` | `plugins/native/jelly/src/store.ts#JELLY_STORE_BASELINE` | 拒绝 |
| 灵光 | `lingguang/lingguang.db` | 1 | `user_version` | `plugins/native/lingguang/src/store.ts#LINGGUANG_STORE_BASELINE` | 拒绝 |
| Pages | `pages/pages.db` | 1 | `user_version` | `plugins/native/pages/src/store.ts#PAGES_STORE_BASELINE` | 拒绝 |
| PPT | `ppt/ppt.db` | 1 | `user_version` | `plugins/native/ppt/src/store.ts#PPT_STORE_BASELINE` | 拒绝 |
| Todo | `todo/todo.db` | 1 | `user_version` | `plugins/native/todo/src/store.ts#TODO_STORE_BASELINE` | 拒绝 |
| Workflows | `workflows/workflows.db` | 1 | `user_version` | `plugins/native/workflows/src/store.ts#WORKFLOWS_STORE_BASELINE` | 拒绝 |
| 炼金术士工作室 | `alchemist/projects/<编码后的 project_id>/studio.sqlite` | 1 | `user_version` | `plugins/native/alchemist/src/studio/server/db/schema.ts#ALCHEMIST_STUDIO_BASELINE` | 拒绝 |
| server（IM 实验线） | `server/server.sqlite` | 1 | `user_version` | `server/src/database.ts#SERVER_DATABASE_BASELINE` | 拒绝 |
| 角色 | `characters/characters.sqlite` | 1 | `user_version`（自己读写） | `modules/characters/src/open.ts#PRAGMA user_version` | 只拒绝更高的版本 |
| 搜索索引（可重建的派生库） | `search/search.db` | 2 | `search_meta.schema` | `packages/storage/src/adapters/text-search-index.ts#SCHEMA_VERSION` | 清空重建 |
| 密钥与凭据（JSON 文件，不是库） | `feed/secrets.json` | 2 | 文件里的 `version` | `packages/storage/src/adapters/file-secret-store.ts#FORMAT_VERSION` | 拒绝读取（报错 `secrets file format N is not supported`），模型 API Key、连接器凭据和 Feed 证据密钥全部读不出 |
| MCP 授权（JSON 文件，不是库） | `config/mcp-tools.json` | 2 | 文件里的 `version` | `apps/local-host/src/mcp-settings-store.ts#MCP_TOOL_PREFERENCE_VERSION` | 读成空，所有 MCP 动作授权失效 |
| 实验插件私有库 | `plugins/experiments/private.sqlite` | 1 | `user_version` | `apps/local-host/src/experiments-private-store.ts#EXPERIMENTS_PRIVATE_BASELINE` | 拒绝 |
| 炼金术士搜索缓存 | `alchemist/projects/<编码后的 project_id>/search.sqlite` | 1 | `user_version` | `apps/local-host/src/alchemist-search.ts#ALCHEMIST_SEARCH_BASELINE` | 拒绝 |

- 「拒绝」是 `applySqliteBaseline` 的行为（`packages/storage/src/sqlite-baseline.ts`）：空文件建基线并写版本，版本相同照常打开，其他一律报错，带路径、找到的版本和期望的版本，不就地升级。目录库与会话库用自己的 meta 表，同样只认当前版本（`apps/local-host/src/catalog-schema.ts` 的 `assertCurrentCatalog`、`modules/private-work-context/src/session-schema.ts`）。
- 实验插件私有库和炼金术士搜索缓存原来没有版本（`CREATE TABLE IF NOT EXISTS`，旧库和新库没有区别），路线图 W2-05（用户 2026-10-08 决定 #21）给它们各一份基线，版本 1。新建的文件带版本；已经存在的旧文件有表没有版本，新构建拒绝打开，所以真实 Home 的实验库要先盖版本 1：一次性维护 `tests/fixtures/store-maintenance-experiments-private-v1.sql`（炼金术士搜索库对应 `store-maintenance-alchemist-search-v1.sql`，对每个 `search.sqlite` 各跑一次；2026-10-08 的真实 Home 里没有这种文件），每份一个事务，库不是未盖版本且与基线逐项一致就整体回滚，只写 `PRAGMA user_version = 1`、不动任何表和行。`tests/store-version-maintenance.test.ts` 是它们的演练，真实 Home 做完后这个用例和两份 SQL 一起删。「无」只留给没有任何版本标记的库，现在这张表里没有；表里的行由 `verify-release-versions.mjs` 对着基线常量核对。
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

没有变化的发布跳过这一节。这一节的做法（版本不符就拒绝，旧 Home 先一次性维护）只适用到第一个装到开发机之外的版本为止（第 1 节第 2 项）。

- [ ] 把备份再拷一份作演练副本，维护流程先在副本上跑完。演练脚本只许打开副本里的路径：目录库存的是真实 Home 的绝对路径，照着它去开会打到真库——2026-10-07 的演练就误开过一个项目库，靠版本不符被拒绝才没改动文件（`specs/repository-anti-corruption/spec.md` §4.1）。
- [ ] 副本上逐库核对：结构与当前基线逐项相同（表、列顺序、索引、外键、CHECK，`packages/storage/src/sqlite-baseline.ts` 的 `describeSqliteSchema`），版本等于第 3 节的数，`PRAGMA integrity_check` 为 `ok`，`PRAGMA foreign_key_check` 没有行，行数与搬之前一致。
- [ ] 演练通过后，在真库上按同一份流程做：被换下的原库不删，也不留在 Home 里，搬到 `~/molis-work-backups` 下（用户 2026-10-08 的决定，「真实 Home 的残留物」一行），建议目录名 `<日期>-replaced-by-<事项>/`、权限 700（维护三留下的 `maintenance-3-replaced/` 就是 700）；2026-10-07 维护三留在 Home 里的 `~/.molis-work/maintenance-3-replaced/` 在 4.5 的一次性清理里按同一规则搬走。密钥文件（如 `feed/secrets.json`）不读值：要改就只按键名改，原文件先原样备份（2026-10-07 的做法，`specs/repository-anti-corruption/spec.md` §1）。
- [ ] 维护流程和演练记录（日期、副本、每库行数与核对结果）写进发布说明的「兼容与升级」或对应 spec。流程里用到的一次性脚本要么入库，要么在记录里写清它的输入输出，不让「怎么做的」只留在会话里。

### 4.4 装新构建

- [ ] 用干净构建装：`pnpm install:local`（先整体构建再安装），或安装 DMG。版本相同而内容不同也会原子刷新程序与 Skill，失败恢复上一份 release（`docs/installation.md`）。
- [ ] 常驻服务：`service status` 返回 `needs_repair` 就直接 `service install --confirm`，不要先 `restart`（`docs/installation.md`）。
- [ ] 已接入的 Runtime 在「设置 → AI 与执行工具」里预览并确认修复，再新开 Runtime Session；旧 Session 不能当作新版本的验收证据（`docs/installation.md`「发布后的最终产物验收」）。

### 4.5 动完之后

- [ ] 只读核对第 3 节每个库在真实 Home 里的版本、`integrity_check`、`foreign_key_check`；项目数与动之前一致；抽查一个项目的 Goal、成果版本和会话内容能读。
- [ ] 核对 `config/mcp-tools.json` 的授权条数没有莫名变少（版本不符时它读成空，不报错）。
- [ ] 内置插件的安装记录等于这个构建的清单，版本和摘要都要一致（[POLICY.md](POLICY.md) 第 7 节；第 1 节也用这条命令）。对开发机的真实 Home，在 A 落地后的第一次启动之后查，确认记录已经跟上：在新拷贝上查（只打开拷贝里的路径，见第 4.3 节第一项），不碰真库；查拷贝也是真实 Home 的数据操作，照例先问用户。先在构建好的仓库根目录打出这个构建里每个内置插件清单的版本与摘要：

  ```sh
  node --input-type=module -e '
  import { pluginManifestDigest } from "@molis-ai/molis-work-plugin-runtime";
  const keys = { characters: "charactersManifest", shelf: "shelfManifest", coding: "codingManifest", files: "filesManifest", diff: "diffManifest", git: "gitManifest", "text-stats": "textStatsManifest" };
  for (const [name, key] of Object.entries(keys)) {
    const manifest = (await import(`@molis-ai/molis-work-plugin-${name}`))[key];
    console.log(manifest.plugin_id, manifest.version, pluginManifestDigest(manifest));
  }'
  ```

  （Characters 并进宿主、不再交给监督器之后，从上面的 `keys` 和下面的名单里去掉它。）再对每个项目库取安装记录（只读，停写时在快照拷贝上做最稳妥）：`SELECT json_extract(record_json,'$.plugin_id'), json_extract(record_json,'$.version'), json_extract(record_json,'$.manifest_digest'), json_extract(record_json,'$.state') FROM plugin_runtime_installs;`。`apps/local-host/src/project-plugins.ts` 交给监督器的 Characters、Shelf、Coding、Files、Diff、Git、TextStats 每个项目最多一条（项目撤下的插件除外），记录的版本与摘要要和上面打出的相同。做法 A 已经落地（[POLICY.md](POLICY.md) 第 7.8 节），内置插件启动时 Runtime 把记录改成当前构建的清单，不论版本更高、更低还是同版本摘要不同，所以这一项是 A 的验收：记录版本比清单高，或版本相同而摘要不同，说明这个构建里没有 A，或这个插件这次启动失败了（看 `plugin_runtime_installs` 里记录的 `state` 和监督器报告的失败码）；记录的 `install_id` 应该和以前一样，私有数据才还在。一个项目撤下的插件没有被启动，它的记录停在上次启动时的样子，不算没跟上，启动一次再查。
- [ ] Home 里没有来路不明的东西。把 Home 的目录和 [HOME-DATA.md](../system/HOME-DATA.md) 对一遍，不在里面的文件夹、旧备份、没有表的空库、孤儿文件、旧的 `goalboard-*` 安装版，都算残留。残留先核对（谁写的、有没有引用、里面有没有数据），有用的搬到 `~/molis-work-backups`，确认没用的才删，不批量删。用户 2026-10-08 为开发机的真实 Home 定了一次性清理：保留 2026-10-07 维护前的整份备份和 `runtime-configs`，维护替换下来的旧文件搬到 `~/molis-work-backups`，其余旧备份、孤儿文件、空库、旧 `goalboard-*` 安装版核对后删；动手前先整份备份。同一个决定里还有目录库 v23 的路径派生（W5-17）和给实验库标版本 1（W2-05）；三件事都经用户批准，先在拷贝上演练再动真库。
- [ ] 版本不符被拒绝是正常的保护：不要回滚库，也不要用 SQLite 命令绕过；用与它相符的构建打开，或从备份恢复。

## 5. 发布后

- [ ] 合并后在合并提交上打 tag `v<版本>`，再在这个 tag 上手动运行 Release macOS Desktop 工作流（`.github/workflows/release-macos.yml` 现在只有 `workflow_dispatch`，推 tag 不会触发它；选 tag 运行才会做 `--tag` 核对并发布 GitHub Release）。Release 资产和校验和来自同一提交（`docs/installation.md`「发布后的最终产物验收」第 1 条）。
- [ ] 按同一节的第 2 至 5 条逐层验收常驻服务、Runtime 接入、新 Session 和真实项目的用户可见结果，之后才能把消费者可见的修复标成「已安装」。
- [ ] 发布 PR 里补上备份路径、维护记录位置和上面各项的结果。
