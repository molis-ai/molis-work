# 发布前检查清单

每次发布把这份清单复制进发布 PR 的描述，逐项勾选；做不到的项写明原因，不删项。规则出处是 [POLICY.md](POLICY.md)。

当前处于**开发前阶段（2026-11-26 定）**：产品与内置插件版本为 0.1.0（未公开发布），零存量外部用户、零旧 Home 保留、零数据迁移、零开发金样。所有持久化 SQLite 库与带版本文件一律固定为干净 v1 基线，结构调整直接原地修改基线；旧本机开发 Home 直接删除并干净重建。原 [0.3.0 候选](v0.3.0.md)只作历史记录。

## 1. 定版本，写材料

- [ ] 对照上个 tag 以来的变化选次版本或补丁（[POLICY.md](POLICY.md) 第 2 节）。自有版本变动看 `git diff <上个 tag> -- tooling/versions.json`；各库与带版本文件清单见第 3 节。
- [ ] 这个版本是 1.0.0 或之后、并且会装到开发机之外吗？用户 2026-10-08 的决定 #15：「不留兼容」到第一个装到开发机之外的版本为止；用户 2026-10-29 又定「1.0.0 之前都是开发版本」，2026-11-26 进一步明确开发前阶段零存量、零迁移、全量 v1。两样都是的话，发布 PR 把版本号、日期和提交写进 [docs/system/CONTRACT-CHANGES.md](../system/CONTRACT-CHANGES.md) 顶部的「起点日期」，把第 3 节标为已结束，并启用第 4 节的读取兼容与持久化升级链（第 5 节的前置须在发版前就位）。有一样不是的话，在这一项写明「不是外部版本」，所有合同与持久化库继续保持干净 v1、不写升级段。
- [ ] 改版本号：只改 `tooling/versions.json` 的 `product.release`，再跑 `pnpm versions:generate`。它会把新值写进根 `package.json`、`apps/desktop/src-tauri/` 的 `tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 里的 `molis-work-desktop`，以及代码里所有标了 `@version product.release` 的地方：`apps/local-host/src/product-version.ts` 的 `PRODUCT_VERSION`（Feed、搜索运行时、MCP 客户端、Codex 会话传输的版本都从它取）、各内置插件的 Manifest 和成果库的生产者身份（[POLICY.md](POLICY.md) 第 1 节）。这些地方都不要手改：`pnpm build` 发现生成结果过期就失败。
- [ ] 内置插件清单的版本与摘要：`BUILTIN_PLUGIN_CATALOG` 中现行的内置 Manifest（不在这里写死个数）均等于产品版本；`verify-release-versions.mjs` 核对源码，`tests/plugin-declaration-rules.test.ts` 核对构建后的目录。官方集成、示例与第三方插件独立编号。跑 `tests/plugin-release-artifact.test.ts` 验证 `bundled` 清单降版及同版本摘要变化仍跟随宿主。按第 4.5 节方法取得实际清单摘要并写入发布说明；表应覆盖整个目录，不只覆盖早期 7 个项目 Runtime 插件。
- [ ] [CHANGELOG.md](CHANGELOG.md)：`[Unreleased]` 改成 `[<版本>] - <日期>`，上面另起一个空的 `[Unreleased]`，页尾比较链接（若有）跟着改。
- [ ] 写 `docs/releases/v<版本>.md`，包含「兼容与升级」（开发前阶段说明干净 v1 与需手动重接的 Runtime；1.0 起列库版本变更与升级说明）和「发布范围与验证」（真实的回归数字、已知失败、没验证的东西）。
- [ ] `node scripts/verify-release-versions.mjs` 通过（打 tag 时再加 `--tag v<版本>`）。

## 2. 验证

- [ ] `pnpm install --frozen-lockfile`，整体 `pnpm build`，`pnpm test`。全量优先在 `full-suite.yml` 的 CI 分片运行，本机补 macOS 专属路径（见 [并行开发规范](../system/PARALLEL-DEVELOPMENT.md) 第 7 节）；浏览器用例需要本机 Chrome。全量回归期间不改源码、脚本、`package.json` 和 `skills/`（`AGENTS.md`「构建与测试」）。
- [ ] 失败的用例逐个分清：产品回归、预期变化、测试缺陷、环境与时序；对照干净基线工作树的结果。发布说明里写数字，不写「通过」两个字。
- [ ] `node scripts/check-health-gates.mjs --base origin/main` 通过。
- [ ] 构建安装包：`pnpm desktop:build:macos`（先跑版本核对，产物在 `release/macos/`，附 SHA256）。公开发行需要 Developer ID 签名与 Apple 公证，缺凭据时 tag 构建会失败（`.github/workflows/release-macos.yml`）；没有公证的本机构建不叫公开发行包。
- [ ] 安装器：源码与 `dist` 不一致会停止（`apps/local-host/src/installer/fingerprint.ts`）；所以发布构建前整体 `pnpm build`，不复用旧的 `dist`。
- [ ] 发 npm 归档（`pnpm package:npm` 的产物对外发出）时，飞书/Lark 连接器带来的两件已接受的事要如实写出（用户 2026-10-10 决定：接受，两件事写进安装说明和这份清单，不加 `overrides`，不打包依赖树；`specs/archive/repository-anti-corruption/spec.md` §1、`apps/local-host/README.md` 的飞书/Lark 连接器一条）。（1）`docs/installation.md` 与 `docs/installation.en.md` 的「npm 路径上的飞书/Lark 连接器」一节还成立，发布说明的「兼容与升级」写同样两条：归档里的 `basic-ftp` 是带高危公告 GHSA-c475-qrg2-pj4r 的 5.x（只有用户自己把代理配成指向 FTP 上的 PAC 文件才会走到）；`keytar` 的安装脚本要联网或编译工具链，装好后连接器每次启动都读写钥匙串里服务名 `lark-mcp` 的一项并建 `lark-mcp-nodejs` 数据目录，都在 Home 之外（Home 之外的状态清单见 [HOME-DATA.md](../system/HOME-DATA.md) 第 8 节；该包的日志目录 `~/Library/Logs/lark-mcp-nodejs/` 不限于 npm 路径，安装说明同一小节末尾也写了）。（2）决定的前提还在：`npm view @larksuiteoapi/lark-mcp version` 仍是归档里固定的版本（有新版本就看它的依赖有没有升到 `basic-ftp` 6.2.1 以上；`basic-ftp` 5.x 线发了修复版本、或 `get-uri` 声明的范围已能解析到 6.2.1 以上，也算前提变了），归档的 `package.json` 没有 `overrides`，`bundledDependencies` 里没有 `@larksuiteoapi/lark-mcp` 及其依赖树（里面本来有工作区包，不算），连接器没有改成别的接法；前提变了就重新弹窗问，不沿用这条决定。`node scripts/run-tests.mjs tests/npm-package.test.ts` 把（1）（2）里能机器核对的部分固定下来。

## 3. 各库版本表

开发前阶段（2026-11-26 定）：所有持久化 SQLite 库与带版本 JSON 文件一律固定为干净版本 `1`，零 `upgrades` 升级步骤、零读时兼容、零开发金样。自有版本统一由 `tooling/versions.json` 维护，并由 `scripts/gates/initial-versions.mjs` 与 `scripts/verify-release-versions.mjs` 核对代码与版本表一致；本表作各库与带版本文件的现行参考清单（不再作为门禁自动解析表）。每个库的 owner、表、备份与卸载规则见 [docs/system/HOME-DATA.md](../system/HOME-DATA.md)。位置都相对 Home（默认 `~/.molis-work`，`MOLIS_WORK_HOME` 可改）。

| 库 | 位置 | 版本 | 记在 | 定义处 | 版本或结构不符时 |
| --- | --- | --- | --- | --- | --- |
| 安装与发行清单 | `config/installation.json、releases/molis-work-<version>/release.json` | 1 | `schema_version` | `apps/local-host/src/installer/home-contract.ts#SCHEMA_VERSION` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建（高版本在修改前拒绝并保留文件） |
| 项目库（每个分区一份：`projects/<project_id>/` 或个人空间 `personal-space/`） | `<partition>/molis-work.db` | 1 | `user_version` | `apps/local-host/src/project-database-schema.ts#PROJECT_DATABASE_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 场景草稿与采用记录 | `blueprints/blueprints.db` | 1 | `user_version` | `horizontal/blueprints/src/schema.ts#BLUEPRINTS_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 项目库里 Coding 的表 | `<partition>/molis-work.db#coding` | 1 | `plugin_project_databases.version` | `plugins/native/coding/src/database.ts#CODING_PROJECT_DATABASE` | 开发前阶段固定 v1，不兼容拒绝（只停 Coding，旧开发库直接清空重建） |
| 项目库里 Feed 的表 | `<partition>/molis-work.db#feed` | 1 | `plugin_project_databases.version` | `plugins/native/feed/src/database.ts#FEED_PROJECT_DATABASE` | 开发前阶段固定 v1，不兼容拒绝（只停 Feed，旧开发库直接清空重建） |
| 项目库里 Goals 的表 | `<partition>/molis-work.db#goals` | 1 | `plugin_project_databases.version` | `plugins/native/goals/src/project-database.ts#GOALS_PROJECT_DATABASE` | 开发前阶段固定 v1，不兼容拒绝（只停 Goals，旧开发库直接清空重建） |
| 项目库里 Inbox 的表 | `<partition>/molis-work.db#inbox` | 1 | `plugin_project_databases.version` | `plugins/native/inbox/src/database.ts#INBOX_PROJECT_DATABASE` | 开发前阶段固定 v1，不兼容拒绝（只停 Inbox，旧开发库直接清空重建） |
| 项目库里风险的表 | `<partition>/molis-work.db#risk` | 1 | `plugin_project_databases.version` | `plugins/native/risk/src/database.ts#RISK_PROJECT_DATABASE` | 开发前阶段固定 v1，不兼容拒绝（只停风险，旧开发库直接清空重建） |
| 项目库里 Schedule 的表 | `<partition>/molis-work.db#schedule` | 1 | `plugin_project_databases.version` | `plugins/native/schedule/src/database.ts#SCHEDULE_PROJECT_DATABASE` | 开发前阶段固定 v1，不兼容拒绝（只停 Schedule，旧开发库直接清空重建） |
| 目录库 | `projects/catalog.db` | 1 | `catalog_meta.schema_version` | `apps/local-host/src/project-catalog-contract.ts#CATALOG_SCHEMA_VERSION` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Functions | `functions/functions.db` | 1 | `user_version` | `modules/judgment-rules/src/store-schema.ts#FUNCTIONS_STORE_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 助理 | `assistant/assistant.db` | 1 | `user_version` | `apps/local-host/src/assistant/assistant-store.ts#ASSISTANT_STORE_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 个人同步队列 | `spaces/<spaceId>/sync/sync.db` | 1 | `user_version` | `modules/sync-replication/src/database.ts#SYNC_STORE_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Home Plugin Runtime | `plugin-runtime/plugin-runtime.db` | 1 | `user_version` | `apps/local-host/src/home-plugin-store.ts#HOME_PLUGIN_RUNTIME_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 装进来的插件的 Home 库账本 | `plugin-libraries/plugin-libraries.db` | 1 | `user_version` | `apps/local-host/src/installed-plugin-libraries.ts#LEDGER_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 插件的本机目录授权 | `plugin-directories/plugin-directories.db` | 1 | `user_version` | `apps/local-host/src/plugin-directory-store.ts#DIRECTORY_GRANTS_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 插件原文件登记 | `plugin-originals/plugin-originals.db` | 1 | `user_version` | `apps/local-host/src/material-original-files.ts#ORIGINAL_FILES_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 对话附件 | `conversation-attachments/conversation-attachments.db` | 1 | `user_version` | `apps/local-host/src/material-attachments.ts#ATTACHMENTS_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Issue | `<partition>/libraries/issues.db` | 1 | `user_version` | `plugins/native/issues/src/database.ts#ISSUES_DATABASE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Feed 的正文引用账 | `feed-content/feed-content.db` | 1 | `user_version` | `plugins/native/feed/src/content-ledger.ts#FEED_HOME_DATABASE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 分区到期登记 | `due-registry/due-registry.db` | 1 | `user_version` | `horizontal/scheduler/src/due-registry.ts#DUE_REGISTRY_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 证据正文持有账 | `evidence/evidence.db` | 1 | `user_version` | `horizontal/evidence/src/index.ts#EVIDENCE_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 随本人设置 | `person-settings/person-settings.db` | 1 | `user_version` | `horizontal/person-settings/src/index.ts#PERSON_SETTINGS_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 记忆 | `memory/memory.db` | 1 | `user_version` | `packages/storage/src/adapters/memory-ledger.ts#MEMORY_LEDGER_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 项目资料 | `knowledge/knowledge.db` | 1 | `user_version` | `packages/storage/src/adapters/knowledge-cards.ts#KNOWLEDGE_CARDS_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 工作记录 | `observation/observation.db` | 1 | `user_version` | `horizontal/observation/src/schema.ts#OBSERVATION_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 端到端评测 | `evaluation/evaluation.db` | 1 | `user_version` | `horizontal/evaluation/src/schema.ts#EVALUATION_BASELINE` | 开发前阶段固定 v1，不兼容拒绝（只停工作记录／评测设置面，旧开发库直接清空重建） |
| 外部会话 | `external-sessions/external-sessions.db` | 1 | `user_version` | `horizontal/sessions/src/schema.ts#EXTERNAL_SESSIONS_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Form | `<partition>/libraries/form.db` | 1 | `user_version` | `plugins/native/form/src/database.ts#FORM_DATABASE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 放置 | `placement/placement.db` | 1 | `user_version` | `apps/local-host/src/placement-actions.ts#PLACEMENT_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Agent 定义 | `agent-definitions/agent-definitions.db` | 1 | `user_version` | `apps/local-host/src/agent-definitions/agent-definitions.ts#AGENT_DEFINITIONS_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 插件的 Agent 声明 | `agent-declarations/agent-declarations.db` | 1 | `user_version` | `apps/local-host/src/agent-definitions/agent-declarations.ts#AGENT_DECLARATIONS_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 连接 | `connectors/connectors.db` | 1 | `user_version` | `apps/local-host/src/connectors-store.ts#CONNECTORS_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 网页搜索设置 | `web-search/web-search.db` | 1 | `user_version` | `apps/local-host/src/web-search-store.ts#WEB_SEARCH_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 网页搜索单次运行的证据表 | `:memory:` | 1 | `user_version` | `apps/local-host/src/connector-web-search.ts#SEARCH_RUN_BASELINE` | 不落盘：每次搜索新建、结束即丢，没有可不符的旧库 |
| 引导 | `context-onboarding/context-onboarding.db` | 1 | `user_version` | `apps/local-host/src/context-onboarding-store.ts#CONTEXT_ONBOARDING_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Cognia | `<partition>/libraries/cognia.db` | 1 | `user_version` | `plugins/native/cognia/src/database.ts#COGNIA_DATABASE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Dataset | `<partition>/libraries/dataset.db` | 1 | `user_version` | `plugins/native/dataset/src/database.ts#DATASET_DATABASE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Images | `<partition>/libraries/images.db` | 1 | `user_version` | `plugins/native/images/src/database.ts#IMAGES_DATABASE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Jelly | `<partition>/libraries/jelly.db` | 1 | `user_version` | `plugins/native/jelly/src/database.ts#JELLY_DATABASE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 灵光 | `<partition>/libraries/lingguang.db` | 1 | `user_version` | `plugins/native/lingguang/src/database.ts#LINGGUANG_DATABASE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Pages | `<partition>/libraries/pages.db` | 1 | `user_version` | `plugins/native/pages/src/database.ts#PAGES_DATABASE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| PPT | `<partition>/libraries/ppt.db` | 1 | `user_version` | `plugins/native/ppt/src/database.ts#PPT_DATABASE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Todo | `<partition>/libraries/todo.db` | 1 | `user_version` | `plugins/native/todo/src/database.ts#TODO_DATABASE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Work Brief | `work-brief/work-brief.db` | 1 | `user_version` | `plugins/native/work-brief/src/database.ts#WORK_BRIEF_DATABASE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| Workflows | `<partition>/libraries/workflows.db` | 1 | `user_version` | `plugins/native/workflows/src/database.ts#WORKFLOWS_DATABASE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| server（讨论） | `server/server.sqlite` | 1 | `user_version` | `server/src/database.ts#SERVER_DATABASE_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 角色 | `characters/characters.sqlite` | 1 | `user_version` | `modules/characters/src/open.ts#CHARACTERS_STORE_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 主线 | `mainline/mainline.db` | 1 | `user_version` | `horizontal/mainline/src/store.ts#MAINLINE_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 首页服务 | `home-pages/home-pages.db` | 1 | `user_version` | `horizontal/home/src/store.ts#HOME_PAGES_BASELINE` | 开发前阶段固定 v1，不兼容旧开发库直接拒绝并清空重建 |
| 搜索索引（可重建的派生库） | `search/search.db` | 1 | `search_meta.schema` | `packages/storage/src/adapters/text-search-index.ts#SCHEMA_VERSION` | 清空重建 |
| 总览索引（同一文件里可重建的派生表） | `search/search.db#overview` | 1 | `overview_meta.schema` | `packages/storage/src/adapters/overview-index.ts#OVERVIEW_INDEX_VERSION` | 清空重读 |
| 密钥与凭据（JSON 文件，不是库） | `security/secrets.json` | 1 | 文件里的 `version` | `packages/storage/src/adapters/file-secret-store.ts#FORMAT_VERSION` | 开发前阶段固定 v1；版本或结构不符拒绝读取与写入（`assertSecretStoreWritable`），保留原文件 |
| MCP 授权（JSON 文件，不是库） | `config/mcp-tools.json` | 1 | 文件里的 `version` | `apps/local-host/src/mcp-settings-store.ts#MCP_TOOL_PREFERENCE_VERSION` | 开发前阶段固定 v1；版本或结构不符拒绝读取并报告配置错误，保留原文件 |
| Shelf 目录（JSON 文件，不是库） | `shelf/catalog.json` | 1 | `version` | `modules/shelf/src/catalog-shape.ts#CATALOG_VERSION` | 开发前阶段固定 v1，不兼容拒绝并清空重建 |
| 外观选择（JSON 文件） | `interface/state.json` | 1 | `schema_version` | `horizontal/appearance/src/state.ts#APPEARANCE_STATE_VERSION` | 开发前阶段固定 v1，高版本或非法结构拒绝覆盖 |
| 上次使用语言（JSON 文件，不是库） | `config/ui-locale.json` | 1 | 文件里的 `schema_version` | `horizontal/appearance/src/locale-memory.ts#SCHEMA_VERSION` | 开发前阶段固定 v1；高版本或非法结构读成「没有记录」且不覆盖原文件 |
| 新用户引导（JSON 文件，不是库） | `config/onboarding.json` | 1 | `schema_version` | `apps/local-host/src/onboarding.ts#ONBOARDING_SCHEMA_VERSION` | 开发前阶段固定 v1；高版本或读不了时按未引导展示且拒绝保存（`storage.store_too_new`／`storage.schema_version_mismatch`），原文件不变 |
| 项目到达记录（JSON 文件，不是库） | `config/project-arrival.json` | 1 | `schema_version` | `apps/local-host/src/project-arrival.ts#PROJECT_ARRIVAL_SCHEMA_VERSION` | 开发前阶段固定 v1；高版本或读不了时当作空且拒绝覆盖原文件 |
| 侧栏浏览器的网站决定（JSON 文件，不是库） | `browser/sites.json` | 1 | `version` | `apps/local-host/src/browser/browser-surfaces.ts#BROWSER_SITES_VERSION` | 开发前阶段固定 v1；高版本或读不了时 fail-closed（关闭助理使用侧栏浏览器并阻断全部网站）且拒绝保存，原文件不变 |
| 电脑操作设置（JSON 文件，不是库） | `computer/settings.json` | 1 | `version` | `apps/local-host/src/computer/computer-settings.ts#COMPUTER_SETTINGS_VERSION` | 开发前阶段固定 v1；高版本或读不了时总开关关且拒绝保存，原文件不变 |
| 电脑操作记录（JSON 文件，不是库） | `computer/records/<id>/record.json` | 1 | `version` | `apps/local-host/src/computer/computer-records.ts#COMPUTER_RECORD_VERSION` | 开发前阶段固定 v1；高版本或读不了的记录不列出且拒绝改写，原文件不变 |
| 插件的模型选择（JSON 文件，不是库） | `plugin-files/<install_id>/.model-settings/preference.json` | 1 | `schema_version` | `apps/local-host/src/model-configuration.ts#MODEL_PREFERENCE_SCHEMA_VERSION` | 开发前阶段固定 v1；版本不是 1 或字段不对报 `host.model_configuration_invalid`，写入前拒绝并不改原文件 |
| 常驻 Web 服务的收据（JSON 文件，不是库） | `config/web-service.json` | 1 | `schema_version` | `apps/local-host/src/installer/web-service-contract.ts#schema_version` | 读的时候核对 `owner`、`label`、`plist_path`、`plist_hash`；文件不在或不是 JSON 时当作没有收据，已有的同名 LaunchAgent 算不是自己的，不覆盖（报 `conflict`） |
| 本机 Runtime 接入收据（JSON 文件，不是库） | `runtime-integrations/<runtime>.json` | 1 | `schema_version` | `apps/local-host/src/installer/runtime-integration-receipt.ts#CURRENT` | 开发前阶段固定 v1；版本或结构不符拒绝读取且不覆盖原文件 |

- 「拒绝」在已有连接上是 `applySqliteBaseline` 的行为（`packages/storage/src/sqlite-baseline.ts`）：空文件建基线并写版本；版本相同且基线表齐全才放行；版本不符、有表无版本、同号缺表或基线表形状不同都报错并说明路径，不就地升级。`openBaselineHomeSqlite` 先只读预检再开可写连接。目录库用自己的 meta 表，同样只认当前版本（`apps/local-host/src/catalog-schema.ts` 的 `assertCurrentCatalog`）。

<a id="4-真实-home搬开后干净重建"></a>
## 4. 开发期 Home 处置（干净 v1 重建）

**开发前阶段（2026-11-26 定）：** 产品尚未对外发布，零存量外部用户、零旧 Home 保留、零数据迁移、零开发金样。

- 所有持久化库与带版本文件均由最新构建直接干净创建为第 1 版，无需执行旧 Home 迁移或维护窗口。
- 自动化测试与日常预览一律使用隔离 `MOLIS_WORK_HOME`；如需刷新本机开发 Home（`~/.molis-work`），按 pid 停止该 Home 的常驻进程后直接删除并干净重建即可。
- 历史 2026-11-07 的 0.1.0 复位重建记录保留在 Git 历史中，不再作为现行操作清单。

<a id="45-动完之后"></a>
### 4.5 内置插件清单摘要核对

内置插件的版本与摘要按 [POLICY.md](POLICY.md) 第 7.8 节核对（`HOST_BUILD_TRUST` 随构建跟随）。可在构建好的仓库根目录打印当前构建的清单摘要：

```sh
node --input-type=module -e '
import { pluginManifestDigest } from "@molis-ai/molis-work-plugin-runtime";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
for (const { manifest } of BUILTIN_PLUGIN_CATALOG) {
  console.log(manifest.plugin_id, manifest.version, pluginManifestDigest(manifest));
}'
```

在只读拷贝中，分别对各分区主库与 `plugin-runtime/plugin-runtime.db` 执行：`SELECT json_extract(record_json,'$.plugin_id'), json_extract(record_json,'$.version'), json_extract(record_json,'$.manifest_digest'), json_extract(record_json,'$.state') FROM plugin_runtime_installs;`。只打开拷贝里的路径，不沿用目录库里指向真实 Home 的路径；逐条确认实际启动的内置插件记录与上面构建清单的版本、摘要一致，`state` 和监督器报告没有启动失败。

## 5. 发布后

- [ ] 合并后在合并提交上打 tag `v<版本>`，再在这个 tag 上手动运行 Release macOS Desktop 工作流（`.github/workflows/release-macos.yml` 现在只有 `workflow_dispatch`，推 tag 不会触发它；选 tag 运行才会做 `--tag` 核对并发布 GitHub Release）。Release 资产和校验和来自同一提交（`docs/installation.md`「发布后的最终产物验收」第 1 条）。
- [ ] 按同一节的第 2 至 5 条逐层验收常驻服务、Runtime 接入、新 Session 和真实项目的用户可见结果，之后才能把消费者可见的修复标成「已安装」。
- [ ] 发布 PR 里补上发布记录位置和上面各项的结果。
