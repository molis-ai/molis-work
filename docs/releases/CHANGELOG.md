# 变更记录

每个版本一节，最新的在最上面，写法参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。版本怎么选、什么时候改，见 [POLICY.md](POLICY.md)；每个版本的故事在 `v<版本>.md`，发布前要过 [CHECKLIST.md](CHECKLIST.md)。发布时把 `[Unreleased]` 改成 `[<版本>] - <日期>`，上面另起一个空的 `[Unreleased]`。

## [Unreleased]

### 升级须知（需要动手）

- **项目库 v8：项目是自己的根，插件的表由插件声明**（`feat/project-library-l1b`，PG-020、PG-021，`specs/plugin-project-database` L1b）：项目库多一张 `project_root`（一库一行，项目本身）和插件的表的账本 `plugin_project_databases`；原来指向 Goals 看板 `boards` 的 11 张表改指 `project_root`；Coding、Feed、Goals、Schedule 的表不再在基线里，改由各自 Manifest 的 `databases.project` 声明，宿主开库时建表、记账本、再打开时核对，不符只停那个插件（Goals 的 31 张表含 `boards` 与治理的 4 张，S8）；`boards` 去掉 `title` 列，外键指 `project_root`，项目名只在项目目录里。新构建拒绝 v7 的项目库（`SqliteSchemaVersionError`），有 v7 项目库的 Home 在维护之前不装新构建：先做 `docs/releases/CHECKLIST.md` 4.3 维护八里的项目库一项（脚本 `tests/fixtures/project-maintenance-v8.sql`，演练 `tests/project-maintenance-v8.test.ts`），维护应用之后这两份文件与 v7 的建库快照一起删，这里写明哪个提交还有它们。
- **Goals 的看板不再有名字，四个动作升版本**（`feat/goals-s8-project-database`，S8，`specs/plugin-project-database`）：`boards` 去掉 `title` 列，项目的名字只在项目目录里；`goals.board.initialize` 由 v1 升 v2（输入只有 `idempotency_key`），输出里带看板的 `goals.snapshot.read`、`goals.contract.read`、`goals.collection.read` 也各升到 v2，直接替换，不留 v1，固定旧版本的客户端要重新发现：MCP 的动作工具名 `molis_work_v1_action_goals.snapshot.read__v1`、`…goals.contract.read__v1`、`…goals.collection.read__v1` 变成 `__v2`；管理 MCP 工具 `molis_work_v1_initialize` 名字不变，不再收 `title`；命令行 `v1 init` 不再收标题；Feed 的 `feed.goals.context` 所需的 `goals.contract.read` 固定到 v2（`feed.goals.context@1` 的输入输出不变，动作合同快照只在它的依赖声明一格上变了；它只给用户入口，仓库里没有固定它的引用，所以不升版本）。快照、目标约定、目标集合和 `board.created` 事件的内容里不再有看板名字，项目长期说明的提示词前缀不再有 “Project: …” 一行。
- **插件 Agent 的连接器接入按会话核对。** 一轮直接调用动作或人点该轮建议，都带宿主核过的原会话；同一插件的另一会话不能继续它准备的接入。升级前在会话里准备但尚未完成的接入，请回原会话重新准备，再继续连接。
- **插件 Agent 的 Goals 提议按会话区分幂等键。** 作者和提交会话取宿主核过的运行记录；同一个幂等键在不同会话里会分别产生提议。升级前已用过的幂等键不再回放旧提议，重新提交前先查看已有提议，避免把同一内容再提交一份。
- **Pages 迁到 Plugin Runtime**：每个项目一个实例；旧 `/api/pages/…` 路由返回 404。`pages.import.preview`、`pages.import`、`pages.artifacts.continue` 的权限集合变宽（加 `materials:read`），已经授权的 MCP 客户端需要在设置页重新授权；动作 id 与版本不变。见 [#847](https://github.com/molis-ai/molis-work/pull/847)。
- **Pages 新建动作升到 2**：`pages.create@2` 加入请求号重放与只在首次创建时返回的撤销版本，替换原来的严格返回合同。固定 `pages.create@1` 的工作流程、绑定和外部插件需重新发现并绑定当前动作；MCP 工具改为 `pages.create__v2`，不保留旧工具别名。HTTP `/pages` 路径不变。
- **签名包的安装预览动作升到 2**：`plugins.install.preview@2` 的输出里，每项权限多了插件写的理由和平台对这项权限的说明（`reason`、`meaning`），预览多了插件在后台常做的事（`jobs`），替换原来只有权限名和是否必需的形状。固定 `plugins.install.preview@1` 的引用须重新选择当前版本，旧版调用明确拒绝，不保留别名。这个动作只给本人（界面和 `plugin install` 命令调它），没有 MCP 工具，MCP 工具名不变；确认安装的 `plugins.install.confirm@1` 与发布者列表不变。
- **助理添加提醒规则动作升到 2**：`assistant.rules.add@2` 接受已安装插件的页面 id，每条规则最多指定 20 个页面。固定 `assistant.rules.add@1` 的动作引用须重新选择当前版本，旧版调用明确拒绝；现有规则、设置页 HTTP 接口和其他提醒动作的版本不变。
- **Agent 会话与一轮的四个读取动作升到 2**（BL-470，`specs/repository-anti-corruption/slices/w5-10-agent-host.md`）：`agent.run.read@2`、`agent.run.wait@2`、`agent.session.read@2`、`agent.subagents.list@2` 的输出里，嵌套对象（冻结的开始、轮次、活动、用量、待答的问题、步骤板、建议、待读输入等）按字段核对类型，不符合的返回被拒；@1 不再登记。固定 `@1` 的动作引用须重新选择当前版本，旧版调用明确拒绝；按合同描述符或 `capability_id` 调用的插件（Coding、插件创作台）不用改。四个动作只给插件调，不涉及 MCP 工具、工作流步骤与绑定。
- **插件的界面词随 Manifest 声明**（batch-40，PG-071）：插件自带的界面文字和英文译文写在 Manifest 的 `messages`、`translations` 里，作者和宿主用 `@molis-ai/molis-work-plugin-sdk` 的同一份 `messageDeclarationProblems()` 检查（上限 `PLUGIN_MESSAGE_LIMITS`）；工作台注册 `PluginRegistration` 不再接受 `messages`。自带界面词的外部插件要把这份表搬进 Manifest，再重新打包安装。
- **六个插件的合同类型从平台合同包移出**（batch-41，PG-111）：`@molis-ai/molis-work-contracts` 删掉 `./modules/form`、`./modules/lingguang`、`./modules/ppt`、`./modules/dataset`、`./modules/todo`、`./modules/pages` 六个子路径，不留转发。它们只是各插件动作的输入输出，现在只在各插件包自己的 `./contract` 里。外部插件不要再从平台合同包取这些类型：按动作 id 调这几个插件，自己声明要读的字段，以动作 schema 为准。
- **删项目时插件的数据只按插件自己的声明删**（batch-41，PG-024，S-86，`specs/repository-anti-corruption/slices/w5-02-registry.md` §2.1）：`PluginRegistration` 不再接受 `project_data`；分区的 Home 库由 Manifest 声明，删项目时平台删掉这个项目在库里的行；Manifest `project_rows` 新增 `files`，平台只删这个项目的行点名的、插件自己文件里的普通文件，别的项目还在点名的文件留着，查不了的文件让这一步失败、下次再删。`ProjectDataDeclaration.purge` 改为必填。自己在注册里写 `project_data` 的插件改成在 Manifest 里声明；内置插件已在本批改完。

### 变化

- **插件的可选权限能在项目设置里逐项开关**（PG-002，S-93）：新增动作 `plugins.permissions.set@1`（只给本人，非破坏性，已发布的动作都没有变形状）；同批新增的 `plugins.installed.list@1` 的每项权限带 `granted`。关掉一项会让运行中的插件重启一次，在途的调用在下一次写被拒；放宽 `actions:delegate`、`network:*`、`secret:*`、`model:invoke` 前页面先确认。
- **合作源码许可**：Molis Work 项目代码（含 SDK、contracts 与内置插件）从 MIT 声明切换为 [Molis AI Cooperation Source License](../../LICENSE)。合作方可在约定范围内阅读和参与开发；对外销售、提供收费服务或转授权须事先取得实际著作权人或其合法授权代表的明确书面授权。Molis AI 的主体公司尚未设立，未来公司须取得相应权利或授权。第三方许可、独立工作成果以及旧版本已合法授予的权利保留；本条不追溯改变过去的发行物。

## [0.3.0] - 2026-10-16

本版汇集 v0.2.0 之后至 main `aadce77ac` 的变化。发布范围与实际验证见 [v0.3.0.md](v0.3.0.md)。

### 升级须知（需要动手）

- **Goals 当前错误合同**：事件、目标、规划、树提案和决定错误统一以 `goals.` 开头；HTTP/MCP 保留消息、kind、owner 详情和真实调用编号。规划影响/关系图检查、树检查/决定动作改为 v2，固定旧动作版本的客户端须重新发现并授予当前动作；业务事件类型与历史事实不变。

- **改名。** 产品名从 GoalBoard 改为 Molis Work（`9824f6e6`，2026-09-15；v0.2.0 的 tag 仍是旧名）。npm 包 `@adeptify/goalboard` 现在是 `@molis-ai/molis-work`；命令 `goalboard`、`goalboard-mcp`、`goalboard-web` 现在是 `molis-work`、`molis-work-mcp`、`molis-work-web`；默认 Home `~/.goalboard` 现在是 `~/.molis-work`；环境变量 `GOALBOARD_*` 现在是 `MOLIS_WORK_*`，代码不再认旧名；MCP 工具名前缀 `goalboard_v1_` 现在是 `molis_work_v1_`。按旧名写的 Runtime 接入配置不再有效（MCP 会报「MCP 宿主没有提供 Runtime 标识」），要用产品自己的 Runtime 接入流程重写（「设置 → AI 与执行工具」）。
- **每个库只认一个当前版本，不就地升级。** 项目库、目录库、会话库和 Home 级的库各留一份当前建库代码加版本号，版本不符就拒绝打开（#255、#260、#261、#264、#265、#267；有特殊处理的见检查清单）；v0.2.0 里按序执行的数据库迁移链和 V3 导入已经删除。v0.2.0 的目录库是 10、会话库是 5，现在分别是 22 和 7；各库现行版本见 [CHECKLIST.md](CHECKLIST.md) 第 3 节。所以 v0.2.0 的 Home 不能直接用新版本打开，产品里也没有随发行的升级工具：要保留数据，发布者按检查清单第 4 节先备份、在副本上演练，再做一次性维护。
- **`board_id` 全部改为 `project_id`**（#287）：存储列、平台自己存的 JSON 键、索引名（项目库 v6、Functions v3、目录库 v21）、命令行参数 `--board-id` 改为 `--project-id`。Casebook 对接随后已移除，见本版「移除」。
- **MCP 只留一套工具**（#269）：连接工具加用户授权的动作工具。动作工具只在用户给这个客户端、这个范围逐项授权后出现，授权存在 `config/mcp-tools.json`（`version` 2；其他版本明确拒绝读取并保留原文件，须修复后恢复）。工具清单见 [docs/mcp.md](../mcp.md)。Runtime 要加载新版 MCP 与 `goal-advance` Skill 并新开 Session。
- **根包不再导出代码**（#262）：v0.2.0 的 0.1.x 根 SDK 已删，`@molis-ai/molis-work` 只提供命令和打包内容。
- **凭据只在「连接」里**（#273、#275）：模型、图片服务、TypeSafe 的密钥只从连接读取；Feed 的 Gmail 按邮箱安装、单账号默认安装、旧引用镜像、Notion 旧槽位删除。
- **旧历史删除。** 事件模型之前的运行、领取、依据、评审等旧历史连表带显示删除（#268）；治理的旧提案三张表删除（#263）；Goal 的风险、合同修订与退役提案条目删除（#272）。
- **内置插件一律跟宿主的构建**（#237 起，2026-10-08 补全）：随宿主发布的内置插件（监督器条目标 `bundled`）启动时，安装记录和宿主这个构建的清单只要有一点不同，Runtime 就把记录改成当前构建的清单，保留 `install_id` 与私有数据，也不再恢复旧发行物。不同包括版本更高（#237 起）、版本更低、版本相同而清单内容（摘要）变了；后两种以前 Runtime 不跟，已装的旧代码继续悄悄跑，旧发行物的存档不在时插件启动失败。授权：内置插件拿到新清单声明的全部权限，必需的和可选的都给，不再声明的去掉（用户 2026-10-10 的决定，W3-06 B；此前是「保留仍声明的、补上必需的」，可选权限不会自己补上）。安装时和每次启动时都是这样，条目自己传的 `grants` 对内置插件不起作用，记录缺了清单声明的任一权限就在启动时补齐，同一构建也一样；内置插件的权限不能逐项关掉，「可选」只表示缺它时插件仍能做一部分事。已装的 7 个 Runtime 内置插件权限本来都是必需的，没有变化。为旧版本写的「可从旧版本升级」名单已删除；第三方与生成的插件不变，规则一字没改。0.3.0 的发布 PR 再把内置清单版本改成产品版本，见 [POLICY.md](POLICY.md) 第 7 节。

- **目录库 v22：删除项目的所有者步骤**（`fix/project-deletion-owners`，#325）。目录库多一张表 `project_deletion_steps`，版本由 21 升到 22。新构建拒绝 v21 的目录库（`catalog.unsupported_schema`），做完维护后只认 21 的旧构建又拒绝 v22（`catalog.reader_too_old`）。真实 Home 已于 2026-10-09 维护（维护四）；别的 v21 Home 要先做一次一次性维护：`tests/fixtures/catalog-maintenance-v22.sql`（已删，从 Git 历史 `bccdcee17` 取），一个事务，版本或表不符就整体回滚；流程与演练记录见 [防腐整理 spec](../../specs/repository-anti-corruption/spec.md) §4.1 的维护四。
- **项目库 v7：删除 Casebook 的五张表**（`chore/delete-casebook`，#369；真实 Home 已于 2026-10-10 维护，Home 安装版同日用含它的 main 构建（`72137e89a`）重装，安装版 MCP 列出 18 个项目（只读目录库；新构建还没有打开过 v7 项目库），维护工具已删，从 Git 历史 `9fba2db43` 取）。项目库版本由 6 升到 7，少了 `casebook_interaction_scopes`、`casebook_interaction_facts`、`casebook_goal_contexts`、`casebook_interaction_audit_keys`、`casebook_interaction_actions`。新构建拒绝 v6 的项目库（`storage.schema_version_mismatch`；恢复报 `project_recovery_unsupported_schema`），只认 6 的旧构建拒绝 v7。**真实 Home 要先做维护六**：`tests/fixtures/project-maintenance-v7.sql`（一库一个事务，具名 CHECK：版本是 6、表正好是 v6 那一套、Casebook 的表列对、没有视图和触发器；删 5 张表、版本改 7，否则整体回滚），演练用例 `tests/project-maintenance-v7.test.ts`；做完以后这两份工具删除，要用从 Git 历史取。`config/casebook.json` 不再被读取，Home 里留着的是残留。
- **命令行和管理 MCP 不再有默认数据库路径**（`fix/orphan-resources`，#345）：以前不给路径就用按当前目录算的 `.molis-work/molis-work.db`，在 `$HOME` 下运行会在真实 Home 旁边悄悄建出一个多余的库。现在命令行的 `--db` 必须给（缺、空，或后面直接跟另一个参数，都在建任何文件之前报错），管理 MCP 的 `initialize`、`event_decide`、`goal_tree_decide` 必须给 `database_path` 或设置 `MOLIS_WORK_DATABASE`（否则 `mcp.path_required`）。依赖旧默认路径的脚本要显式写上路径；Web 服务找不到库时的提示也改为 `molis-work v1 init --db <路径>`。
- **炼金术士搜索库有了版本 1**（`refactor/version-unversioned-stores`，#346）。这个库原来没有版本（`CREATE TABLE IF NOT EXISTS`），现在和别的库一样经 `applySqliteBaseline`：新建的带版本 1，有表没有版本的旧文件新构建拒绝打开（`storage.schema_version_mismatch`，只影响该项目的炼金术士搜索，不影响宿主启动）。同一个 PR 也给实验插件的私有库盖了版本 1，实验插件随后在 2026-10-10 删除（见下条），那一份不再需要。真实 Home 已于 2026-10-09 维护（维护五）；别的 Home 若有 `alchemist/projects/*/search.sqlite`，要先做一次一次性维护再用新构建（工具已删，从 Git 历史 `bccdcee17` 取）：`tests/fixtures/store-maintenance-alchemist-search-v1.sql`；它只写 `PRAGMA user_version = 1`，不动表和行；窗口里的步骤由同目录的 `store-maintenance-run.sh`（先演练、再备份后盖章）和 `store-maintenance-verify-open.mjs` 承担，流程见 [防腐整理 spec](../../specs/repository-anti-corruption/spec.md) §4.1 的维护五。只认旧代码的构建不看这个版本，所以先维护、后升级最稳：唯一的窗口是新构建在维护之前打不开该搜索库。
- **工作区读取只剩一个 id，Files、Git、Coding 多了必需权限 `workspace:read`**（W2-09，#348）。typed 能力 `projects.workspace.file.read.v1`、`projects.workspace.git.read.v1` 已删，每个读只剩动作 `projects.workspace.files.read`、`projects.workspace.git.inspect`；Files、Git、Coding 在清单里声明并持有 `workspace:read`，经 `capabilities.consumes` 和 `services.actions` 调它们，Files 与 Git 里依赖读取的 10 个动作（`files.directory`、`files.open`、`files.capture`、`files.side.entries`、`files.side.content`、`git.state`、`git.select-diff`、`git.summary`、`git.pr-support`、`git.conflict`）多了 `required_actions` 和权限 `workspace:read`。已经装过这三个插件的 Home 不用动手：启动时清单跟当前构建，必需权限自动获得。**外部 MCP 客户端不用重新授权，也不受影响**：这 10 个动作绑定的是本机用户的个人浏览状态（`bindOwnerPluginAction`），调用者的 `actor_id` 不是本机用户时一律是 `actions.owner_mismatch`，改动前后 MCP 客户端都调不了它们（`tests/files-git-actions.test.ts`）；客户端读工作区只用上面那两个读动作，受众、权限（`workspace:read`，逐项精确授权）都没变。插件创作台的能力板不再把这 10 个动作列给生成插件（有 `required_actions` 的动作按「依赖其他能力」暂不开放），没有能用的功能被拿走：生成插件以 `plugin:<id>` 的身份调用，这些动作本来就拒绝它（`actions.owner_mismatch`）。读文件动作的入参 `kind` 多了 `bytes`（整份文件，图片与 PDF 预览），它对所有调用方的目录都可见，但宿主只放行宿主运行的、把这个动作写进 `consumes` 的插件，其他调用方（包括生成插件）收到 `actions.forbidden`。
- **实验插件删除**（2026-10-10 用户决定，`chore/delete-experiments`，#370；真实 Home 的维护六数据部分已于当天做完，新构建打开 v7 项目库的收尾核对还没做，见 [CHECKLIST.md](CHECKLIST.md) 第 4.3 节「做完核对」）：插件 `io.molis.work.experiments`（界面「实验」）整个移除，不留兼容读取；决定要求「删掉的 PR 合入后立刻维护」，所以带这个构建的 Home **必须先做维护六**（[CHECKLIST.md](CHECKLIST.md) 第 4.3 节的维护六）再装新构建。维护六把 Home 里的 `plugins/experiments/`（`private.sqlite`、`-wal`、`-shm`，里面是实验和多模型对比结果）整个搬到 `~/molis-work-backups`，并在备份拷贝上只读数它留在别处的残留行（连接器绑定、项目的插件隐藏记录与添加、移除事件、MCP 授权、工作流步骤、助理与放置里的关联、搜索索引），报告后经用户批准再清；没做维护就装新构建也能启动，新构建不再读这个目录，残留只是不再有用。历史调用记录 `logs/action-calls.jsonl` 里的 `experiments.*` 行保留。 本机跑过实验插件的检出里若还有 `.experiments-runtime/`（Laya 虚拟环境、隔离 Home 与私有结果），它不再被忽略，请手动删掉，别提交。
- **7 个运行平台内置插件的能力来源编号改成插件名**（用户 2026-10-10 的决定，W3-06 C）：Characters、Shelf、Coding、Files、Diff、Git、Text Stats 原来以安装编号 `plugin-install-<哈希>` 登记动作，现在和其他内置插件一样用插件名（`io.molis.work.coding` 这样）；创作台生成的、开发中未签名的和第三方插件仍用安装编号。“随宿主发布”只由宿主自己的启动名单说了算（标 `bundled` 的条目），插件的 Manifest 声明了内置插件的名字也拿不到它。合同上：`ActionProvider` 多一个可选字段 `plugin_install_id`（Runtime 的登记总带它，说明读哪一份安装的授权），`bindOwnerPluginAction` 的嵌套复查按它找插件自己的那条登记；动作合同快照里这 7 个插件 62 个动作的 `registered_provider` 由安装编号改成 `plugin_id`（动作 id 与版本不变）。`PluginRuntime` 的构造选项 `actions` 多一个可选的 `providerId`。**指向旧编号的存量记录对不上新动作，真实 Home 要先做维护七**（开发机的真实 Home 已于 2026-10-11 核对：没有要改的记录；维护工具已删，从 Git 历史 `9f9bda551` 取）：MCP 逐客户端授权、工作流步骤、角色草稿里选好的能力、Coding 会话里选好的能力，以及助理库里的卡片、可撤销操作、后台任务和两项能力设置；工具、范围和步骤见 [CHECKLIST.md](CHECKLIST.md) 第 4.3 节。已发布的角色版本是固定的，工具不改，草稿改好后在「设置 › 角色」重新发布一次；搜索索引会自己重建。工具还会列出它的规则不认识的地方（SQLite 库和所有 JSON、JSONL 文件里的旧编号），并点名它看不见的：加密的运行记录（Agent 轮次冻结的能力引用在里面）；所以进窗口前要让等批准或暂停的 Agent 轮次结束，否则它们窗口后恢复时调这 7 个插件的动作报 `actions.missing`。

### 新增

- **Issue**：个人问题记录、整理与重新整理，跨项目共享（#395、#396、#520、#521）。
- **助理与 Coding 的输入和上下文**：输入回执、同键重发、补充输入与恢复报告；输入上方的上下文条；Coding 回合可给出操作建议（#552、#554、#564、#571、#573）。
- **Pages 评论与上下文落点**：文档评论线程、把当前材料写入选定位置；Pages 库基线由 1 变为 2。

- **项目到达流程**：项目选择页、开场、Welcome 与新建项目引导（#159）；首页一屏（#147）。
- **插件切换器**：Feed 与 Coding 的添加、移除也就地生效，不再整页刷新（#171）；插件通知并入底栏「需要你看看」，标题栏不再有第二个铃铛（#140）。
- **系统助理**（#98）：页面带着准备好的操作卡开工作（#105）；开发者诊断页「助理与执行服务」（#121）。
- **记忆系统**（#130）、**系统级搜索**（#96）。
- **侧栏与情境交互**：平台侧栏（#118）；Pages 选中内容在底栏出动作，点击后按冻结范围预览并写回（#119）。
- **成果库**：从本地文件和已连接文档导入 Artifact（#80）；收尾时把成果库里的版本记为 Goal 的交付物（#205），助理、Coding 等可以提议交付物、由用户在收尾时确认（#208）；「被谁引用」列出助理工作和正文里链接了这一版的文档（#222、#225）；成果版本可以「交给助理」「交给 Coding」（#226），可以作为工作流一次运行的起点（#228）；Goal 只留一个「加输入」（#230）。
- **插件**：Coding App 与 FlyLeaf 的插件族（#62 起）；Alchemist、Cognia、插件创作台和 Coding 工作台（#81）；本机图片生成（Images）、Jelly 把日历、笔记和素材收成个人插件（#80）；项目能撤下插件（#82）。
- **模型设置**：在模型设置页填写钥匙，并从未配模型处直达（#90）。

### 变化

- **统一产品版本 0.3.0**：桌面端、宿主与全部内置插件 Manifest 同版；工作区包仍为私有 0.0.0，官方集成和第三方插件独立编号。
- **插件运行与 AI**：Form 接入 Plugin Runtime；Manifest 方法生效；Prologue 更新到 main `e4afd1a7` 的合成包，恢复按需发现工具（#551、#562、#581）。
- **工作台与宿主**：共用 Coding 客户端、减少注意力轮询、构建和浏览器测试按机器槽位排队、宿主部分启动失败时仍能正常关闭（#555、#578、#584）。

- **管理 MCP 复用 Goals 动作**（W3-07 PR-4）：`initialize`、`event_decide`、`goal_tree_decide` 经 Host 现有管理工厂，以本机这个人和原 management 出处各调用一个 Goals 动作，消除 typed 业务的重复结算。工具名/schema、成功 JSON、身份拒绝、显式路径与幂等键不变；真正进入动作才留单一行与 Host 编号，前置拒绝可无行、无号。

- **工作台是唯一的外壳**：插件只提供内容、挂在工作台的位置，不出自己的整页、不开第二个浏览器标签页（#176、#177、#186、#187、#193、#195、#197、#198）；门禁 `tests/shell-page-gate.test.ts` 在 CI 里跑（#196）。
- **Soft Workbench 全局升级**（#101）；页面动线与导航（#114）；Characters 只在「设置 › 角色」（#141）。
- **收想法只在灵光**：Jelly 去掉灵感页，灵光接上导入文件、读取链接和转成 Jelly 笔记（#153）。
- **删除项目时，各数据所有者一起清、可重试**（`fix/project-deletion-owners`，#325）：Pages、Form（含全部回答）、Dataset、PPT、Workflows、Todo、Functions、灵光、Images、炼金术士、插件创作台、记忆、助理工作各自清掉按项目保存的数据；删除回执里每个所有者一步，失败的步骤保持 pending，用同一个删除请求重试，运行中的 Web 服务也会接着做完；确认框列出会一起删的数据。
- **「卸载并清除用户数据」也清掉「讨论」库**（W2-12，防腐 spec 决定 4 与决定 20；`fix/im-home-registration`，#349）：右栏「讨论」页签的群聊与 Thread 存在 `server/server.sqlite`，以前它不在 `PERSONAL_HOME_SQLITE_STORES` 里，`uninstall --purge-user-data` 会留着它。现在 `server` 登记进这份名单，确认后的清除会永久删除整个 `server/` 目录（群聊正文、成员显示名、房间邀请令牌）；普通卸载仍保留。备份表同时登记这个库：必备份，副本因含明文房间邀请令牌按密钥对待，见 [HOME-DATA.md](../system/HOME-DATA.md) 3.4。`server` 包由基础包改归业务包，SSOT 对应行同步。
- **调用记录每行带诊断编号，被拒绝的调用也记一行「未执行」**（用户 2026-10-10 决定，W3-01 B）：`logs/action-calls.jsonl` 里每个命令一行，读取只在失败时记，处理器之前就被拒的调用（取消、撤权、停用、无权、输入不合、限流）记一行，只记谁、什么动作、结果与错误码，不记内容（输入、返回、动作给的错误信息都不记），失败的读取同；每行带这次操作的编号。没有编号的旧行不再显示，文件下次整理时去掉（不需要动手，也不写迁移）。硬规则「被取消、撤权、停用的调用不再写任何记录」改写为只管业务记录。页面自己找项目没有的插件的区域（Feed、Inbox、Schedule、Artifacts，含 Feed 的定时拉取）时得到的「未启用」是它要的答案，不记行，但只免这一次调用自己的拒绝，处理器再调的被拒了照常记，免记也只在页面自己那次调用还没结束时有效。执行过又失败的命令照旧另存一句错误信息（至多 200 字），其中带合同校验错误码（`actions.input_invalid`、`actions.output_invalid`、`actions.output_invalid_after_effect`）的只存到第一个「：」为止，不存字段路径。
- **插件的 HTTP 路由按失败的种类答，响应体只有一种**（W3-02 C，`refactor/route-binders-in-sdk`）：`bindPluginActionRoute` 与 `bindOwnerPluginAction` 从合同包 `@molis-ai/molis-work-contracts/platform/actions` 搬进插件开发包 `@molis-ai/molis-work-plugin-sdk`（签名不变；合同包不再导出它们，旧的导入路径直接失效）。经 `bindPluginActionRoute` 绑定的路由，动作失败时状态由错误的 kind 定，响应体是 `{ error, code, details? }`：`actions.scope_mismatch`、`actions.plugin_disabled` 等答 403，`actions.connection_required` 答 503，没有我们的码的错误答 500 `actions.execution_failed`（以前一律 400）；路由自己的请求映射函数拒绝请求答 400 `actions.input_invalid`；Files、Git、Diff 里「请求与当前状态对不上」的拒绝（工作目录变了、参数无效等）带主人码 `files.invalid`、`git.invalid`、`diff.invalid`，状态仍是 400，Shelf 的材料检查带 `shelf.invalid`（Host 里 Coding 成果进 Shelf 的检查带 `coding.shelf_material_invalid`）。Plugin Runtime 路由器自己的四种拒绝（以前是 `plugin_route_permission_denied`、`plugin_not_enabled`、`plugin_unavailable`、`plugin_route_unbound` 四个裸字符串）改答 `actions.forbidden`、`actions.plugin_disabled`（404 变 403）、`actions.plugin_unavailable`、`actions.execution_failed`，页面外层对「项目没有启用该插件」答同一个码和同一句话；Coding 设置页的「为当前项目启用 Coding」按钮据此判断。读 `plugin_not_enabled` 的插件页面脚本要改读 `actions.plugin_disabled`。
- **页面答复带诊断编号**（W3-01 C）：网页服务给每个请求、每次后台拉取和每个定时器各一个调用编号；JSON 答复只在这次操作在调用记录里留了行时带它——响应头 `x-molis-work-call-id`，状态码 400 以上且体带 `error` 或 `code` 时，体里再加 `call_id`。没留行的答复（鉴权拒绝、读成功后由路由自己判的 404）什么都不带；请求头里自带的同名头不读。只多了可选的头和可选的字段，调用方不用改；MCP、助理、Agent、命令行的编号和界面上的显示是 W3-01 的后续片。
- **「设置 › 诊断」按诊断编号查找调用，「能力 › 调用记录」每行显示诊断编号**（用户 2026-10-10 决定，W3-01 F）：诊断页最上面多了「按诊断编号查找」，粘贴诊断编号（六个字符起，不分大小写）就列出这次操作留下的每一行：时间、做了什么、谁做的、结果与错误码、所在项目和到该项目调用记录的链接；没填时列出各项目最近 20 条失败或未执行的调用。调用记录每行有「诊断编号 xxxxxxxx」按钮，点一下复制完整编号；宿主自己发的调用写「Molis Work」，不再写成「你」。错误详情里的「诊断编号」按钮随共用请求助手（W3-10）出现：设置、项目设置、引导等页面和工作台里已迁的部分（见下一条）有；工作台的导航、助理底栏和插件客户端的报错详情还没有，那里先从调用记录或响应头里复制编号。内核不再导出 `shortCallId`（只有测试用它），给人看的短形式在 `@molis-ai/molis-work-ui-host`。
- **设置、侧栏里的报错：断线时说人话，查得到的失败带诊断编号**（用户 2026-10-10 决定，W3-10-1b）：工作台里设置各页（模型、提示词、助理、记忆、诊断、常驻服务、项目与项目说明、Runtime 接入预览）、右栏（含浏览器与文件）、设置目录、后台任务和插件通知，请求改走同一个共用助手。连不上本机服务时，读取说「连不上 Molis Work 服务，请稍后重试」，保存说「不知道这次操作有没有完成，请刷新后核对」（填的内容保留、不自动重发），不再显示浏览器的英文原话；记忆页和项目说明里记进调用记录的操作失败，错误旁多一个「诊断编号 xxxxxxxx」按钮（点一下复制完整编号，到「设置 › 诊断」查），带编号的错误吐司停约 8 秒、指着时不消失；模型供应商、提示词、助理能力与用量、常驻服务等不进调用记录的设置修改失败不显示编号。「设置 › 诊断」「能力 › 调用记录」里的诊断编号按钮复制后变成「已复制」，不再另弹「引用已复制」。错误吐司不再缩成半个窗口宽：它按文字宽度、最宽到窗口两边各留 16px，手机上放不下时「诊断编号」按钮排到消息下面（用吐司自己的字色加下划线），在手机与粗指针下这个按钮（吐司里与错误区域里）是 44px 的点按目标；设置页单独打开时的吐司也从屏幕右半边的宽条改成贴右下角的窄条。工作台主程序的 `molis-work-workbench.js` 没有变大（比之前小 135 字节）。
- **MCP 的错误与命令结果带诊断编号**（W3-01 D）：MCP 进程给收到的每条消息一个调用编号，经本机网关转发的 `invoke` 把它写进请求体的 `call_id`，常驻 Host 在同一个编号下写调用记录；工具失败时错误文本末尾的 JSON 带 `call_id`，留了行的命令成功时结果的 `_meta["molis-work/callId"]` 带它，读成功不留行、什么都不带；客户端在 `_meta`、工具参数、请求头里自带的编号不读。**升级须知（不留兼容）**：网关的 `invoke` 现在必须带小写 UUID 的 `call_id`，`discover` 不许带，旧版本的 stdio MCP 进程调用动作会被新版常驻 Host 以 `actions.input_invalid` 拒绝，把 MCP 进程换成同版本重启即可；对 Runtime 和 MCP 客户端只多了错误 JSON 里可选的 `call_id` 与结果里可选的 `_meta`，不用改。助理、Agent 和命令行已由 W3-01 E 接通；调用记录与诊断页已有编号显示（W3-01 F），错误详情继续随 W3-10 的后续片。
- **助理、Agent、定时任务、命令行和生成插件的调用也有编号**（W3-01 E）：助理或 Agent 的每一轮开始时宿主给一个调用编号，这一轮的所有工具调用同号，也写进这一轮的冻结记录（`frozen.call_id`，记在 Molis Work 自己的记录里，不交给 Prologue）；人在页面发消息开的一轮与那次请求同号，定时任务到点跑的一轮与那次 tick 同号；命令行每条命令一个；创作台生成的插件在沙箱里发起的调用与调起它的操作同号。只多了可选字段，调用方不用改；MCP 的编号由 W3-01 D 接通；调用记录与诊断页已有编号显示（W3-01 F），错误详情继续随 W3-10 的后续片。
- **场景绑定一套模型**（#279）；会话表为唯一来源（#277）；判断方式四种、复审状态两种（#278）。
- **生成插件只走统一能力目录**：工作室目录之前的能力和内联模型要求删除（#284）。

### 移除

- **Casebook**（用户 2026-10-10 决定，以后重做）：宿主子系统 `apps/local-host/src/casebook/`、`/casebook/v1/` 通道、typed 能力 `io.molis.work.casebook.*`（5 个）、对外合同 `molis-work.casebook.*` 与它的 JSON Schema、参考客户端 `@molis-ai/molis-work-casebook-client` 的打包脚本与说明、`config/casebook.json` 的读取、`LocalHost` 的 observation 钩子、项目库里的 5 张表。外部 Casebook 插件不再有可对接的宿主接口。
- 类型化宿主能力 `projects.workspace.file.read.v1`、`projects.workspace.git.read.v1` 和合同里的 `readWorkspaceFileCapability`、`readWorkspaceGitCapability`（W2-09）：每个工作区读取只留动作 `projects.workspace.files.read`、`projects.workspace.git.inspect`。
- 0.1.x 根 SDK（#262）；数据库迁移链与 V3 导入；其他已确认不再需要的兼容路径，源码里的兼容标记按文件计数、只许减少（#283、#285、#289）。
- 实验插件（2026-10-10）：包 `@molis-ai/molis-work-plugin-experiments` 和它在宿主里的接线（15 个动作 `experiments.*`、`/api/experiments/*`、私有库打开代码与基线 `EXPERIMENTS_PRIVATE_BASELINE`）；本地 `grok` 命令行和 `laya` 检查点的调用（登记在 `docs/system/CALL-CHAINS.md` §10.1 的例外随之删除）、Python 工作进程 `apps/local-host/tooling/experiments/`、插件手册 `docs/experiments/`；目录条目、插件图标与调色、页面资源 `/assets/molis-work-plugins/experiments.js`。TypeSafe 连接现在只给 Functions 用。合同 `@molis-ai/molis-work-contracts/modules/functions` 的 `TypeSafeEvaluateResult` 去掉可选字段 `usage`（只有实验插件读它；`@molis-ai/molis-work-module-functions` 的提供方不再解析 TypeSafe 响应里的 `usage`），Functions 自己的调用方不受影响。

### 开发流程

- 健康门禁：巨大单元、测试引用包内部、vendored SDK 份数、就地补表、spec 状态句、兼容标记，CI 里对照 merge-base 比较（#179、#293）。
- 本节所属的版本与发布策略：[POLICY.md](POLICY.md)、[CHECKLIST.md](CHECKLIST.md)，`scripts/verify-release-versions.mjs` 在 CI 里跑。

## [0.2.0] - 2026-09-11

事件工作流与 Runtime 简化：Goal 详情收敛为当前整体进展、时间线和事件阅读；Runtime 工具从 57 个收敛为 35 个，移除旧 Claim、Run、Evidence、Review、Draft Dialogue 入口；事件类型可以演化，人工验收要求真实保存；安装器校验源码与构建产物一致。完整说明见 [v0.2.0.md](v0.2.0.md)（正文里「旧项目有数据库升级路径」一句对今天的 main 已不成立，见上面 `[0.3.0]` 的升级须知）。公开 macOS 安装包尚未提供，需要 Developer ID 签名与 Apple 公证。

[Unreleased]: https://github.com/molis-ai/molis-work/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/molis-ai/molis-work/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/molis-ai/molis-work/compare/v0.1.14...v0.2.0
