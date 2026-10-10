# 变更记录

每个版本一节，最新的在最上面，写法参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。版本怎么选、什么时候改，见 [POLICY.md](POLICY.md)；每个版本的故事在 `v<版本>.md`，发布前要过 [CHECKLIST.md](CHECKLIST.md)。发布时把 `[Unreleased]` 改成 `[<版本>] - <日期>`，上面另起一个空的 `[Unreleased]`。

## [Unreleased]

下一个版本是 0.3.0（用户 2026-10-08 的决定，见 [POLICY.md](POLICY.md)）。以下是 v0.2.0（2026-09-11）之后合入 main 的变化，按 PR 编号可在 GitHub 上查到。这是第一次整理，发布 0.3.0 时要对着 `git log v0.2.0..` 补全再定稿。

### 升级须知（需要动手）

- **改名。** 产品名从 GoalBoard 改为 Molis Work（`9824f6e6`，2026-09-15；v0.2.0 的 tag 仍是旧名）。npm 包 `@adeptify/goalboard` 现在是 `@molis-ai/molis-work`；命令 `goalboard`、`goalboard-mcp`、`goalboard-web` 现在是 `molis-work`、`molis-work-mcp`、`molis-work-web`；默认 Home `~/.goalboard` 现在是 `~/.molis-work`；环境变量 `GOALBOARD_*` 现在是 `MOLIS_WORK_*`，代码不再认旧名；MCP 工具名前缀 `goalboard_v1_` 现在是 `molis_work_v1_`。按旧名写的 Runtime 接入配置不再有效（MCP 会报「MCP 宿主没有提供 Runtime 标识」），要用产品自己的 Runtime 接入流程重写（「设置 → AI 与执行工具」）。
- **每个库只认一个当前版本，不就地升级。** 项目库、目录库、会话库和 Home 级的库各留一份当前建库代码加版本号，版本不符就拒绝打开（#255、#260、#261、#264、#265、#267；有特殊处理的见检查清单）；v0.2.0 里按序执行的数据库迁移链和 V3 导入已经删除。v0.2.0 的目录库是 10、会话库是 5，现在分别是 22 和 7；各库现行版本见 [CHECKLIST.md](CHECKLIST.md) 第 3 节。所以 v0.2.0 的 Home 不能直接用新版本打开，产品里也没有随发行的升级工具：要保留数据，发布者按检查清单第 4 节先备份、在副本上演练，再做一次性维护。
- **`board_id` 全部改为 `project_id`**（#287）：存储列、平台自己存的 JSON 键、索引名（项目库 v6、Functions v3、目录库 v21）、命令行参数 `--board-id` 改为 `--project-id`。Casebook 导出合同里的合同修订号保持 1，不改外部合同版本。
- **MCP 只留一套工具**（#269）：连接工具加用户授权的动作工具。动作工具只在用户给这个客户端、这个范围逐项授权后出现，授权存在 `config/mcp-tools.json`（`version` 2；其他版本读成空，授权需要重新给）。工具清单见 [docs/mcp.md](../mcp.md)。Runtime 要加载新版 MCP 与 `goal-advance` Skill 并新开 Session。
- **根包不再导出代码**（#262）：v0.2.0 的 0.1.x 根 SDK 已删，`@molis-ai/molis-work` 只提供命令和打包内容。
- **凭据只在「连接」里**（#273、#275）：模型、图片服务、TypeSafe 的密钥只从连接读取；Feed 的 Gmail 按邮箱安装、单账号默认安装、旧引用镜像、Notion 旧槽位删除。
- **旧历史删除。** 事件模型之前的运行、领取、依据、评审等旧历史连表带显示删除（#268）；治理的旧提案三张表删除（#263）；Goal 的风险、合同修订与退役提案条目删除（#272）。
- **内置插件一律跟宿主的构建**（#237 起，2026-10-08 补全）：随宿主发布的内置插件（监督器条目标 `bundled`）启动时，安装记录和宿主这个构建的清单只要有一点不同，Runtime 就把记录改成当前构建的清单，保留 `install_id` 与私有数据，也不再恢复旧发行物。不同包括版本更高（#237 起）、版本更低、版本相同而清单内容（摘要）变了；后两种以前 Runtime 不跟，已装的旧代码继续悄悄跑，旧发行物的存档不在时插件启动失败。授权按向上跟的规则收敛：新清单仍声明的保留，必需的补上（同版本改清单时新增的必需权限像新装一样自动授予），不再声明的去掉。为旧版本写的「可从旧版本升级」名单已删除；第三方与生成的插件不变，规则一字没改。0.3.0 的发布 PR 再把内置清单版本改成产品版本，见 [POLICY.md](POLICY.md) 第 7 节。

- **目录库 v22：删除项目的所有者步骤**（`fix/project-deletion-owners`，#325）。目录库多一张表 `project_deletion_steps`，版本由 21 升到 22。新构建拒绝 v21 的目录库（`catalog.unsupported_schema`），做完维护后只认 21 的旧构建又拒绝 v22（`catalog.reader_too_old`）。真实 Home 已于 2026-10-09 维护（维护四）；别的 v21 Home 要先做一次一次性维护：`tests/fixtures/catalog-maintenance-v22.sql`（已删，从 Git 历史 `bccdcee17` 取），一个事务，版本或表不符就整体回滚；流程与演练记录见 [防腐整理 spec](../../specs/repository-anti-corruption/spec.md) §4.1 的维护四。
- **项目库 v7：删除 Casebook 的五张表**（`chore/delete-casebook`）。项目库版本由 6 升到 7，少了 `casebook_interaction_scopes`、`casebook_interaction_facts`、`casebook_goal_contexts`、`casebook_interaction_audit_keys`、`casebook_interaction_actions`。新构建拒绝 v6 的项目库（`storage.schema_version_mismatch`；恢复报 `project_recovery_unsupported_schema`），只认 6 的旧构建拒绝 v7。**真实 Home 要先做维护六**：`tests/fixtures/project-maintenance-v7.sql`（一库一个事务，具名 CHECK：版本是 6、表正好是 v6 那一套、Casebook 的表列对、没有视图和触发器；删 5 张表、版本改 7，否则整体回滚），演练用例 `tests/project-maintenance-v7.test.ts`；做完以后这两份工具删除，要用从 Git 历史取。`config/casebook.json` 不再被读取，Home 里留着的是残留。
- **命令行和管理 MCP 不再有默认数据库路径**（`fix/orphan-resources`，#345）：以前不给路径就用按当前目录算的 `.molis-work/molis-work.db`，在 `$HOME` 下运行会在真实 Home 旁边悄悄建出一个多余的库。现在命令行的 `--db` 必须给（缺、空，或后面直接跟另一个参数，都在建任何文件之前报错），管理 MCP 的 `initialize`、`event_decide`、`goal_tree_decide` 必须给 `database_path` 或设置 `MOLIS_WORK_DATABASE`（否则 `store.path_required`）。依赖旧默认路径的脚本要显式写上路径；Web 服务找不到库时的提示也改为 `molis-work v1 init --db <路径>`。
- **实验插件私有库和炼金术士搜索库有了版本 1**（`refactor/version-unversioned-stores`，#346）。这两个库原来没有版本（`CREATE TABLE IF NOT EXISTS`），现在和别的库一样经 `applySqliteBaseline`：新建的带版本 1，有表没有版本的旧文件新构建拒绝打开（`storage.schema_version_mismatch`，只影响 Experiments 或该项目的炼金术士搜索，不影响宿主启动）。真实 Home 已于 2026-10-09 维护（维护五）；别的 Home 若有 `plugins/experiments/private.sqlite`，要先做一次一次性维护再用新构建（工具已删，从 Git 历史 `bccdcee17` 取）：`tests/fixtures/store-maintenance-experiments-private-v1.sql`（炼金术士搜索库对应 `store-maintenance-alchemist-search-v1.sql`）；它们只写 `PRAGMA user_version = 1`，不动表和行；窗口里的步骤由同目录的 `store-maintenance-run.sh`（先演练、再备份后盖章）和 `store-maintenance-verify-open.mjs` 承担，流程见 [防腐整理 spec](../../specs/repository-anti-corruption/spec.md) §4.1 的维护五。只认旧代码的构建不看这个版本，所以先维护、后升级最稳：唯一的窗口是新构建在维护之前打不开实验库。
- **工作区读取只剩一个 id，Files、Git、Coding 多了必需权限 `workspace:read`**（W2-09，#348）。typed 能力 `projects.workspace.file.read.v1`、`projects.workspace.git.read.v1` 已删，每个读只剩动作 `projects.workspace.files.read`、`projects.workspace.git.inspect`；Files、Git、Coding 在清单里声明并持有 `workspace:read`，经 `capabilities.consumes` 和 `services.actions` 调它们，Files 与 Git 里依赖读取的 10 个动作（`files.directory`、`files.open`、`files.capture`、`files.side.entries`、`files.side.content`、`git.state`、`git.select-diff`、`git.summary`、`git.pr-support`、`git.conflict`）多了 `required_actions` 和权限 `workspace:read`。已经装过这三个插件的 Home 不用动手：启动时清单跟当前构建，必需权限自动获得。**外部 MCP 客户端不用重新授权，也不受影响**：这 10 个动作绑定的是本机用户的个人浏览状态（`bindOwnerPluginAction`），调用者的 `actor_id` 不是本机用户时一律是 `actions.owner_mismatch`，改动前后 MCP 客户端都调不了它们（`tests/files-git-actions.test.ts`）；客户端读工作区只用上面那两个读动作，受众、权限（`workspace:read`，逐项精确授权）都没变。插件创作台的能力板不再把这 10 个动作列给生成插件（有 `required_actions` 的动作按「依赖其他能力」暂不开放），没有能用的功能被拿走：生成插件以 `plugin:<id>` 的身份调用，这些动作本来就拒绝它（`actions.owner_mismatch`）。读文件动作的入参 `kind` 多了 `bytes`（整份文件，图片与 PDF 预览），它对所有调用方的目录都可见，但宿主只放行宿主运行的、把这个动作写进 `consumes` 的插件，其他调用方（包括生成插件）收到 `actions.forbidden`。

### 新增

- **项目到达流程**：项目选择页、开场、Welcome 与新建项目引导（#159）；首页一屏（#147）。
- **插件切换器**：Feed 与 Coding 的添加、移除也就地生效，不再整页刷新（#171）；插件通知并入底栏「需要你看看」，标题栏不再有第二个铃铛（#140）。
- **系统助理**（#98）：页面带着准备好的操作卡开工作（#105）；开发者诊断页「助理与执行服务」（#121）。
- **记忆系统**（#130）、**系统级搜索**（#96）。
- **侧栏与情境交互**：平台侧栏（#118）；Pages 选中内容在底栏出动作，点击后按冻结范围预览并写回（#119）。
- **成果库**：从本地文件和已连接文档导入 Artifact（#80）；收尾时把成果库里的版本记为 Goal 的交付物（#205），助理、Coding 等可以提议交付物、由用户在收尾时确认（#208）；「被谁引用」列出助理工作和正文里链接了这一版的文档（#222、#225）；成果版本可以「交给助理」「交给 Coding」（#226），可以作为工作流一次运行的起点（#228）；Goal 只留一个「加输入」（#230）。
- **插件**：Coding App 与 FlyLeaf 的插件族（#62 起）；Alchemist、Cognia、插件创作台和 Coding 工作台（#81）；本机图片生成（Images）、Jelly 把日历、笔记和素材收成个人插件（#80）；项目能撤下插件（#82）。
- **模型设置**：在模型设置页填写钥匙，并从未配模型处直达（#90）。

### 变化

- **工作台是唯一的外壳**：插件只提供内容、挂在工作台的位置，不出自己的整页、不开第二个浏览器标签页（#176、#177、#186、#187、#193、#195、#197、#198）；门禁 `tests/shell-page-gate.test.ts` 在 CI 里跑（#196）。
- **Soft Workbench 全局升级**（#101）；页面动线与导航（#114）；Characters 只在「设置 › 角色」（#141）。
- **收想法只在灵光**：Jelly 去掉灵感页，灵光接上导入文件、读取链接和转成 Jelly 笔记（#153）。
- **Casebook 对外合同改用 Molis Work 的名字**（#248）。
- **删除项目时，各数据所有者一起清、可重试**（`fix/project-deletion-owners`，#325）：Pages、Form（含全部回答）、Dataset、PPT、Workflows、Todo、Functions、灵光、Images、炼金术士、插件创作台、记忆、助理工作各自清掉按项目保存的数据；删除回执里每个所有者一步，失败的步骤保持 pending，用同一个删除请求重试，运行中的 Web 服务也会接着做完；确认框列出会一起删的数据。
- **「卸载并清除用户数据」也清掉「讨论」库**（W2-12，防腐 spec 决定 4 与决定 20；`fix/im-home-registration`，#349）：右栏「讨论」页签的群聊与 Thread 存在 `server/server.sqlite`，以前它不在 `PERSONAL_HOME_SQLITE_STORES` 里，`uninstall --purge-user-data` 会留着它。现在 `server` 登记进这份名单，确认后的清除会永久删除整个 `server/` 目录（群聊正文、成员显示名、房间邀请令牌）；普通卸载仍保留。备份表同时登记这个库：必备份，副本因含明文房间邀请令牌按密钥对待，见 [HOME-DATA.md](../system/HOME-DATA.md) 3.4。`server` 包由基础包改归业务包，SSOT 对应行同步。
- **场景绑定一套模型**（#279）；会话表为唯一来源（#277）；判断方式四种、复审状态两种（#278）。
- **生成插件只走统一能力目录**：工作室目录之前的能力和内联模型要求删除（#284）。

### 移除

- **Casebook**（用户 2026-10-10 决定，以后重做）：宿主子系统 `apps/local-host/src/casebook/`、`/casebook/v1/` 通道、typed 能力 `io.molis.work.casebook.*`（5 个）、对外合同 `molis-work.casebook.*` 与它的 JSON Schema、参考客户端 `@molis-ai/molis-work-casebook-client` 的打包脚本与说明、`config/casebook.json` 的读取、`LocalHost` 的 observation 钩子、项目库里的 5 张表。外部 Casebook 插件不再有可对接的宿主接口。
- 类型化宿主能力 `projects.workspace.file.read.v1`、`projects.workspace.git.read.v1` 和合同里的 `readWorkspaceFileCapability`、`readWorkspaceGitCapability`（W2-09）：每个工作区读取只留动作 `projects.workspace.files.read`、`projects.workspace.git.inspect`。
- 0.1.x 根 SDK（#262）；数据库迁移链与 V3 导入；其他已确认不再需要的兼容路径，源码里的兼容标记按文件计数、只许减少（#283、#285、#289）。

### 开发流程

- 健康门禁：巨大单元、测试引用包内部、vendored SDK 份数、就地补表、spec 状态句、兼容标记，CI 里对照 merge-base 比较（#179、#293）。
- 本节所属的版本与发布策略：[POLICY.md](POLICY.md)、[CHECKLIST.md](CHECKLIST.md)，`scripts/verify-release-versions.mjs` 在 CI 里跑。

## [0.2.0] - 2026-09-11

事件工作流与 Runtime 简化：Goal 详情收敛为当前整体进展、时间线和事件阅读；Runtime 工具从 57 个收敛为 35 个，移除旧 Claim、Run、Evidence、Review、Draft Dialogue 入口；事件类型可以演化，人工验收要求真实保存；安装器校验源码与构建产物一致。完整说明见 [v0.2.0.md](v0.2.0.md)（正文里「旧项目有数据库升级路径」一句对今天的 main 已不成立，见上面 `[Unreleased]` 的升级须知）。公开 macOS 安装包尚未提供，需要 Developer ID 签名与 Apple 公证。

[Unreleased]: https://github.com/molis-ai/molis-work/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/molis-ai/molis-work/compare/v0.1.14...v0.2.0
