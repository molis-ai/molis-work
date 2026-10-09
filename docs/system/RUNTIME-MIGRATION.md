# 内置插件迁到 Plugin Runtime：计划

状态：计划，2026-10-08 按 origin/main `31c357df` 核实（行号与计数都在这个提交上重量过）。还没有合入的迁移样板：第一个样板 Form 是路线图 W4-04，依赖 W3-06 的平台服务，两者都未开始。这份文档回答「迁哪些、不迁哪些、什么顺序、迁之前要补什么、每个插件一个 PR 怎么做、怎样量进展」，并写明 Characters 反方向并进宿主（第 5.4 节）。

任务来源：`docs/prompts/repository-anti-corruption.md` §4.6「装配统一」；路线图 W1-15、W3-06、W4-01、W4-02、W4-04、W5-01、W5-02、W6-01、W6-02（`specs/repository-anti-corruption/roadmap-2026-10-07.md`）；扩展点清单见 [EXTENSION-POINTS.md](EXTENSION-POINTS.md)，第三方插件见 [THIRD-PARTY-PLUGINS.md](THIRD-PARTY-PLUGINS.md)。

## 白话说明

内置插件现在有两种装配方式。**经 Plugin Runtime**：监督器启动，有安装记录、升级检查、崩溃恢复，HTTP 由 Manifest 声明；有 7 个，其中 Characters 已定并进宿主、不再算（第 5.4 节）。**构建期组合**：宿主里手写一行 `registerProvider`、一个 `<插件>-native-plugin-http.ts`、`web-request.ts` 里的一段路由，没有安装记录和升级检查；有 19 个，名单冻结，只许减少。两种方式的插件在工作台里都有目录条目。迁移就是把这 19 个里的 15 个逐个搬到第一种方式（另 4 个是批准的例外），每搬一个，删掉它在宿主里的文件和接线。数据不动：库留在原处，用户看到的界面不变。迁完后经 Runtime 装配的是 21 个（现有 6 个加迁来的 15 个），构建期只剩 4 个例外。

## 1. 用户已定的决定

来自 `specs/repository-anti-corruption/spec.md` §1。2026-10-08 的第五批（后三行：Runtime 与安装插件声明的 methods、Characters 的代码身份、第三方插件的安装与信任）在 PR #312，合入前不在 main 上。

| 日期 | 决定 | 内容 |
| --- | --- | --- |
| 2026-10-07 | 插件平台范围 | 个人插件装在一个 Home 级 Runtime 实例，按项目启用照旧；数据留在 `{home}/<id>/<id>.db`，由平台的库服务打开；Goals、Artifacts、Sessions、插件创作台列为批准的构建期例外，其余 15 个逐族迁移；界面不变 |
| 2026-10-07 | 第一个样板 | Form 先、Todo 第二；Form 同时作浏览器代码打包与类型检查的样板 |
| 2026-10-07 | 两套能力机制收敛 | 对外的只走动作；typed 注册表只留作 Runtime 插件的宿主内服务通道，不许再加新项 |
| 2026-10-07 | 删除项目时别的主人存在 Home 里的该项目数据 | 各主人一起删、可重试：每个按项目分区的 Home 库主人加「项目已删」钩子，删项目提交后逐个清掉该项目的数据，每步记在删除收据里、失败可重试；删前确认框列出会一起删的插件数据 |
| 2026-10-04 | 内置插件随宿主升级 | 监督器条目标 `bundled: true`，启动时把安装记录升到宿主的版本，保留新 Manifest 仍声明的授权、补上它要求的授权；不再恢复旧发行物 |
| 2026-10-08 | 版本与发布策略 | 内置插件 Manifest 跟宿主版本；工作区包保持私有 0.0.0 |
| 2026-10-08 | Runtime 与安装插件声明的 methods | 和内置插件一样注册：启动时注册，停用、卸载、升级时收回（切片 W4-02） |
| 2026-10-08 | Characters 的代码身份 | 用户没选推荐。Characters 不再是 Runtime 插件：代码并进宿主或一个 Module，界面仍是设置里的一节；安装记录与 Runtime 条目一起删（第 4 波切片） |
| 2026-10-08 | 第三方插件的安装与信任 | 本地装、首次确认、沙箱里跑，只写计划（见 THIRD-PARTY-PLUGINS.md） |

AGENTS.md 的硬约束同时有效：新的内置插件只走 Runtime；不再新增 `apps/local-host/src/<插件>-native-plugin-http.ts`；冻结名单只许减少。

## 2. 现状（按代码）

### 2.1 26 个目录条目

`apps/workbench/src/builtin-plugins.ts` 的 `BUILTIN_PLUGIN_CATALOG` 有 26 条，在 `tests/builtin-plugin-assembly-gate.test.ts` 里分成：

- `RUNTIME_ASSEMBLED`（7）：characters、shelf、coding、files、git、diff、text-stats，由 `apps/local-host/src/project-plugins.ts` 的监督器启动。Characters 将移出（第 5.4 节），所以长期是 6。
- `BUILD_TIME_ASSEMBLED`（19）：alchemist、artifacts、cognia、dataset、experiments、feed、form、goals、images、inbox、jelly、lingguang、pages、plugin-builder、ppt、schedule、sessions、workflows、todo。

宿主里手写的接线（`apps/local-host/src` 下）：18 个 `*-native-plugin-http.ts`（共 962 行）；17 个以插件命名的 `*-actions.ts`（共 623 行：artifact、cognia、dataset、experiments、form、goals、images、inbox、jelly、lingguang、pages、ppt、schedule、shelf、todo、work、workflows）；`project-host.ts` 里 26 处 `registerProvider`，其中按插件逐个登记的 17 处；`web-request.ts` 和 `web-catalog.ts` 里各有 `handle*NativePluginHttp` 的引用（30 行、18 行）。这几个文件也是最挤的热点：自 2026-09-28 起合入 main 的次数（`git log --first-parent --since=2026-09-28 origin/main -- <文件>`），`web-request.ts` 22、`web-catalog.ts` 15、`project-host.ts` 14、`builtin-plugins.ts` 11。

### 2.2 19 个构建期插件的分类与放置

范围（个人或项目）取自目录条目的 `personal`；数据位置取自 `packages/storage/src/home-sqlite.ts` 的 `PERSONAL_HOME_SQLITE_STORES`、`apps/local-host/src/project-database-schema.ts` 和各包。

**批准的构建期例外（4）**：Goals、Artifacts、Sessions（包 `plugins/native/work`）、插件创作台（`plugin-builder`），见第 3 节。

**要迁的（15）**。「实例」一列是放置规则的结果（见表后），「项目分区的 Home 数据」一列说明有没有要在「项目已删」步骤里清的数据（见 4.2 和 6）：

| 插件 | 目录 `personal` | 实例 | 数据在哪 | 项目分区的 Home 数据 | 宿主适配文件（行数） |
| --- | --- | --- | --- | --- | --- |
| Form | 是 | 每个项目一个 | `{home}/form/form.db` | 有：表带 `project_id`（`plugins/native/form/src/store.ts`） | `form-actions.ts` 29、`form-native-plugin-http.ts` 19 |
| Dataset | 是 | 每个项目一个 | `{home}/dataset/dataset.db` | 有（`plugins/native/dataset/src/store.ts`） | 29、19 |
| PPT | 是 | 每个项目一个 | `{home}/ppt/ppt.db` | 有（`plugins/native/ppt/src/store.ts`） | 39、19 |
| Pages | 是 | 每个项目一个 | `{home}/pages/pages.db` | 有（`plugins/native/pages/src/store.ts`） | 39、22 |
| 灵光 | 是 | 每个项目一个 | `{home}/lingguang/lingguang.db` | 有（`plugins/native/lingguang/src/store.ts`） | 30、38 |
| Workflows | 是 | 每个项目一个 | `{home}/workflows/workflows.db` | 有（`plugins/native/workflows/src/store.ts`） | 30、23 |
| Todo | 是 | Home 级 | `{home}/todo/todo.db` | 有：条目与批次带可空的 `project_id`，个人待办不带项目（`plugins/native/todo/src/store.ts`） | 26、22 |
| Jelly | 是 | Home 级 | `{home}/jelly/jelly.db` | 没有（包里没有 `project_id`） | 36、32 |
| Cognia | 是 | Home 级 | `{home}/cognia/cognia.db` | 没有 | 21、14 |
| Images | 是 | Home 级 | `{home}/images/images.db`，另有运行锁 | 有：`jobs` 表带 `project_id`（`plugins/native/images/src/store.ts`） | 7、61；另有 `ImagesHostService` |
| Experiments | 是 | Home 级 | `plugins/experiments/private.sqlite` | 没有 | 30、54 |
| Alchemist | 是 | Home 级 | `{home}/alchemist/alchemist.db`，每项目另有 `alchemist/projects/<id>/studio.sqlite` | 有：每个项目一个工作室库（`alchemist-service-host.ts`），决定里的「工作室与密钥」 | 没有 `*-actions.ts`（`AlchemistHostService`）、51 |
| Inbox | 否 | 每个项目一个 | 项目库，表由 Attention 模块建（`ATTENTION_SCHEMA_SQL`） | 不需要：项目库随项目目录一起移走 | 70、92 |
| Schedule | 否 | 每个项目一个 | 项目库，表由插件包自建（`SCHEDULE_*_SCHEMA_SQL`） | 不需要 | 26、92；另有 `scheduleReminderActionProvider` |
| Feed | 否 | 每个项目一个 | 项目库，表由 Feed、Sources、Signals 模块和插件的 `FEED_OUT_RULES_SCHEMA_SQL` 建 | 项目库部分不需要；Home 里的 Feed 安全目录（`resolveFeedSecurityDirectory`，`packages/storage/src/adapters/local-security-paths.ts`）放密钥文件，有没有按项目分区的内容由 Feed 自己的计划核 | 没有 `feed-actions.ts`；`feed-native-plugin-http.ts` 113；在 `content-action-providers.ts` 的 `nativeContentProviders` 里登记；Feed 被 29 个宿主文件 import（`git grep -l "@molis-ai/molis-work-plugin-feed" -- apps/local-host/src`），单独成案 |

**放置规则（落实 2026-10-07「个人插件装在一个 Home 级实例，按项目启用照旧」）。** 本计划按「提供方今天怎么登记」放：

- **Home 级实例**：提供方今天在 Home 级登记一次的（`apps/local-host/src/project-host.ts` 第 231–245 行用 `this.host.actionRegistry()`，不带项目；其中第 243 行 Shelf 个人库的提供方属混合插件，另算）：Todo、Jelly、Cognia、Experiments、Images、Alchemist，共 6 个。
- **每个项目一个实例**：提供方今天按项目登记的（同文件第 189–206 行，`this.host.actionRegistry(reference)`）：Form、Dataset、PPT、Pages、灵光、Workflows、Inbox、Schedule、Feed，共 9 个。监督器条目放在 `project-plugins.ts` 的 `startPlatform`，和 Shelf、Coding 一族一样。
- **与决定原文的差别，要用户确认（第 10 节第 3 项）。** 目录里 Form、Dataset、PPT、Pages、灵光、Workflows 也标了 `personal: true`，字面读决定会把它们也放进 Home 级实例。这里没有那样读，原因有二：一是路线图决定 10 的选项把 Form 描述为 project-scoped，推荐理由写明 Form 不必等 Home 级服务（`roadmap-2026-10-07.md` 决定 10），用户选了这一项；二是目录的 `personal` 标志在代码里只表示「每个项目都可用，不进项目启用列表」（`apps/local-host/src/project-action-availability.ts` 对 `personal` 返回不检查项目启用，`web-request.ts` 的 `enablePlugin` 拒绝 `personal` 条目，`skills/molis-plugin-dev/elements.md` 第 48 行同义），并不等于「Home 级登记」。如果用户的意思是字面读法，这 6 个也上 Home 级实例，结果只有两处变：Form 样板（W4-04）要等 W3-06 的 Home 级实例（它本来就依赖 W3-06 这一片，所以顺序不变），以及这 6 个的监督器条目从 `project-plugins.ts` 的 `startPlatform` 挪到 Home 级实例的装配处。

**混合插件**（在 `RUNTIME_ASSEMBLED` 里，宿主却仍留着手写文件，门禁看不出来）：Shelf 仍有 `shelf-native-plugin-http.ts`、`personal-native-plugin-http.ts`、`shelf-actions.ts`、`shelf-ai.ts`，并在 `project-host.ts` 里登记两个提供方（项目一份、Home 一份）。它的收拢在 W5-01 的最后一组。Characters 原来也是混合插件（宿主里有 `characters-host.ts` 等文件），现在走另一条路：并进宿主（第 5.4 节）。

## 3. 批准的构建期例外

四个例外都是 2026-10-07 用户批准的。spec 里只记了结论，没有逐条记理由；下面的原因是从代码里读出的事实。

| 插件 | 为什么现在不能是 Runtime 插件（代码事实） | 例外期间仍要守的 |
| --- | --- | --- |
| Goals | 每个项目都带、工作台里不能移除（`PRODUCT.md`）；Goal 的表在项目库基线里（`GOALS_SCHEMA_SQL` 等）；是被点名最多的插件，包外有 70 个源码或配置文件引用它（与 EXTENSION-POINTS.md 第 1 节同一条命令，换成 `@molis-ai/molis-work-plugin-goals|plugins/native/goals/|GOALS_(PROJECT_)?PLUGIN_ID`）；`apps/cli`、`apps/mcp` 直接依赖它的包（`scripts/workspace-packages.mjs` 里两处 `extraWorkspaceDependencies`）；工作台里它的界面由 `apps/workbench/src/goals-page-renderer.ts` 和一组 Goals 渲染器接口挂载（W5-06 要换成通用挂载器） | 不新增 `<插件>-native-plugin-http.ts`（`NATIVE_PLUGIN_HTTP_FILES` 的冻结继续有效）；动作仍在统一目录里；不得因为是例外就从插件包里 import 别的插件实现 |
| Artifacts | `project-plugins.ts` 和 `installed-plugin-host.ts` 先构造 `ArtifactsModule`、`ProcessItemsModule`，再交给 `createPluginPlatform`，Runtime 给所有插件的 `services.artifacts`、`services.processItems` 就建在它上面；它自己再当 Runtime 插件，就要靠自己提供的服务启动自己（推断）。`artifact-native-plugin-http.ts` 208 行 | 同上；成果库规则不变（`artifacts.produces` 声明，宿主拒绝未声明的写入） |
| Sessions | 宿主持有会话注册表（`project-host.ts` 的 `this.sessions`），传给 `workActionProvider` 和 `projectWorkspaceActionProvider` | 同上 |
| 插件创作台 | 它创建并管理其他插件的安装：`installed-plugin-host.ts` 依赖 `AgentBuilderStore`；宿主侧 `apps/local-host/src/plugin-builder/` 有 16 个文件 2,181 行 | 同上；生成插件仍走统一目录与沙箱 |

**复审**：路线图 W6-01 把冻结名单写成「空，或只留已批准的例外」。建议在那一片合入前，对这四项各复核一次：只要 Runtime 的平台服务仍然表达不了它依赖的宿主内部对象，就继续留在例外里，并在 SSOT 对应行写明原因；理由消失才迁，不为迁而迁。这条建议是本计划提出的，不是用户的决定。

## 4. 迁移前必须补的平台缺口

调研列出三项服务缺口；核对代码后又发现另一项服务缺口（项目已删步骤的送达）和几处迁移会改变的行为。服务缺口由 W3-06 补，改变行为的几处要在 W3-06 的设计稿里定，其余前置切片见 4.4。

### 4.1 平台服务（W3-06）

`PluginHostServices`（`packages/contracts/src/platform/plugin.ts`）现在只有 `actions`、项目库键值 `storage`、`artifacts`、`processItems`、`ui`、`events`、`inputs`、`outputs`、`capabilities`。缺：

1. **模型服务**：`services.model`，由 `horizontal/agent-host` 支撑，带登记的指令、`scheduling: "concurrent"` 和 `beforeEffect()`；是 Runtime 插件服务，不是 typed 宿主能力。
2. **插件自有的 Home 库服务**：按 `{home}/<id>/<id>.db` 打开已有的库，表不变。
3. **Home 级 Runtime 实例**：`createPluginPlatform` 现在只在每个项目里创建，Home 级的个人插件（Todo、Jelly、Cognia、Images、Experiments、Alchemist）要有一个 Home 级实例，按项目启用照旧。
4. **「项目已删」步骤的送达**：见 4.2 末项。这是 2026-10-07 删除项目决定带来的缺口，路线图的 W3-06 描述里没有，需要补进去。

### 4.2 要在 W3-06 设计稿里定的事

这些是读代码发现的、迁移会改变的行为，设计稿必须回答，否则样板会悄悄改了用户看得见的东西：

- **提供方身份会变，而且不只是存量数据会失配。** 构建期插件的提供方 `provider_id` 是 `manifest.plugin_id`（例如 `apps/local-host/src/todo-actions.ts`、`form-actions.ts`、`pages-actions.ts`）；Runtime 插件的提供方 `provider_id` 是安装的 `install_id`（`packages/plugin-runtime/src/action-provider.ts`）。`install_id` 是 `plugin-install-` 加 plugin_id 与发布者签名的哈希前 32 位（`packages/plugin-runtime/src/index.ts` 的 `installIdentity`）；签名写在各插件自己的 Manifest 里（例如 `plugins/native/pages/src/manifest.ts` 第 20 行），不在公开合同 `packages/contracts` 里，别的插件的代码拿不到它，除非 import 对方的实现，而这是被禁止的。凡是拿 `provider_id` 做精确匹配的地方，迁移后都会失配，已知有三类后果：
  1. **MCP 授权。** 逐客户端的授权按 `provider_id` 匹配（`apps/local-host/src/mcp-action-grants.ts` 第 24、36 行），失配后这些存量授权不再对应任何动作。
  2. **存储里的引用。** 工作流的动作步骤存 `provider_id`，执行时按它在目录里找动作（`plugins/native/workflows/src/actions.ts` 的 `reachFor`，第 200–209 行，其中 `find` 在第 206 行）；判断规则在 Functions 库里存场景提供方 `scene_provider_id`（`modules/functions/src/store.ts` 第 39 行），内核按它比对，不符就报「此规则仅适用于选定的场景版本和提供方」（`packages/kernel/src/action-service.ts` 第 465 行）。声明场景的插件是 Feed（`plugins/native/feed/src/manifest.ts` 第 39 行）和 Inbox（`plugins/native/inbox/src/manifest.ts` 第 31 行）。
  3. **代码里写死的 `provider_id`。** 插件和宿主的源码把 `<插件>_PLUGIN_ID`（值就是 `plugin_id`）或字面量直接写成 `provider_id`，都是精确匹配，有三种用法：
     - **依赖声明 `required_actions`**：内核每次判断可用性时，若依赖里写了 `provider_id` 而登记的提供方不是它，就报 `actions.provider_changed`，整个动作不可用（`packages/kernel/src/action-service.ts` 第 427–428 行）。有 `plugins/native/inbox/src/actions.ts` 第 67 行（`inbox.pages.results` 依赖 Pages 的 `pages.generations.list`）和第 78 行（`inbox.pages.generate` 依赖 Pages 的三个动作），都钉 `PAGES_PLUGIN_ID`；还有 `apps/local-host/src/information-actions.ts` 第 15 行（`information.plan` 依赖 Feed 的快照与 `inbox.list`），钉 `FEED_PLUGIN_ID`、`INBOX_PLUGIN_ID`。
     - **保留调用权限 `retainActionAuthority` 与 `validate_authority`**：嵌套调用把原动作的 `provider_id` 钉住（`packages/contracts/src/platform/actions.ts` 第 386 行，这里的 `provider_id` 必填），入口再逐个核对。已查到的三类入口都要求与当前登记的完全相等，否则拒绝：本地网页（`apps/local-host/src/local-web-actions.ts` 第 34–44 行，`actions.forbidden`）、MCP（`mcp-action-client.ts` 第 19–24 行经 `mcp-action-grants.ts` 第 45–50 行，`mcp.action_revoked`）、助理（`apps/local-host/src/assistant/assistant-authority.ts` 第 69–76 行，`assistant.action_revoked`）。写死处：Feed 自己的四个文件 `plugins/native/feed/src/content-actions.ts` 第 40 行、`item-actions.ts` 第 79 行、`rule-actions.ts` 第 93 行、`source-actions.ts` 第 72 行，另有宿主的 `apps/local-host/src/content-action-providers.ts` 第 44 行（钉 `feedManifest.plugin_id`）；Inbox 自己的 `plugins/native/inbox/src/actions.ts` 第 141 行、`content-actions.ts` 第 58 行；Inbox 钉 Pages 的 `plugins/native/inbox/src/pages.ts` 第 69 行（`pages.generate`）；Workflows 自己的 `plugins/native/workflows/src/actions.ts` 第 213 行。
     - **算键的字面量**：`apps/local-host/src/functions-host.ts` 第 16 行用 `"io.molis.work.inbox"` 算内置首页规则的推荐选项键；键里含源提供方的 `provider_id`，并且没有它就不给算（`packages/kernel/src/subject-offer-choices.ts` 第 35–39 行），Inbox 迁后这个键就对不上 Inbox 实际给出的选项。
     - 指向批准的构建期例外的不受影响，例外期间它们的 `provider_id` 不变：Goals（`apps/local-host/src/project-capabilities.ts` 第 64、66 行，`plugins/native/feed/src/query-actions.ts` 第 25 行）、Sessions（`apps/local-host/src/work-actions.ts` 第 10 行，`home-talk-actions.ts` 第 16、29 行）。
     - **还没逐个核对的**：下列地方也读写带 `provider_id` 的引用，本文没有确认它们迁移后会不会失配，设计稿要查全：搜索索引的 `search_sources` 表（`packages/storage/src/adapters/text-search-index.ts` 第 148 行）和搜索命中编号（`horizontal/search/src/index.ts` 第 110 行的 `encodeSearchHitId`）、角色可选能力的引用（`plugins/native/characters/src/actions.ts` 第 10 行、`plugin.ts` 第 59 行）。
     - **清点命令**：`git grep -n -E 'provider_id: *([A-Za-z_.]*(PLUGIN_ID|plugin_id)|"io\.molis\.work\.[a-z.]+")' -- apps packages plugins modules horizontal ':!tests' ':!*.md' | grep -v -E 'provider_id: [A-Za-z]+\.plugin_id, plugin_id:'`。`grep -v` 滤掉的是各 `*-actions.ts` 登记自己提供方的行，形状是 `provider_id: <X>Manifest.plugin_id, plugin_id: …`。在 origin/main `31c357df` 上输出 20 行：`personal-planning-actions.ts` 那行登记的是系统提供方，不是钉死；指向例外的 6 行不受影响；剩 13 行，分布在 11 个文件，就是上面逐条列的。命令只认 `provider_id: …` 的写法，经变量传递的要在设计稿里另查。
  - **选项。**
    - (a) **对内置实例让 `provider_id` 保持 `plugin_id`（倾向这个）。** 上面三类后果都不出现：存量授权、步骤、规则和代码里的钉死值都仍然等于登记的 `provider_id`，迁 Pages 也不会让 Inbox 的动作失效，迁移顺序不受牵制。要改的是把 `provider_id` 当 `install_id` 用的查找：`apps/local-host/src/local-web-actions.ts` 第 13 行按 `install_id` 建表，第 17、27、41 行再用 `view.provider.provider_id` 去查；范围要在设计稿里量。
    - (b) **在真实 Home 维护里改写存量引用**（需要用户批准，走备份和拷贝演练）。只覆盖第 1、2 类的数据，改不了第 3 类写死在代码里的值，这些代码也要改：Feed、Inbox、Workflows 对自己的钉死（`retainActionAuthority` 的 `provider_id` 必填）要改成不写死，自身身份从哪来，例如 `ActionCallContext.plugin_install_id`（`packages/contracts/src/platform/actions.ts` 第 70 行）是否够用，要在设计稿里核，可能要宿主或合同补一项；跨插件的钉死（Inbox 对 Pages、`information.plan` 对 Feed 与 Inbox）可以去掉 `provider_id`，因为合同里它是可省略的（`ActionReference.provider_id` 可选，同文件第 34–39 行），代价是放弃「固定原提供方」的保证（该字段的合同注释写的就是这个用途）；首页规则的推荐选项键要改成运行时按目录里 Inbox 的实际提供方算。
    - (c) **接受一次重新授权。** 同样盖不到第 3 类，要做 (b) 里的全部代码改动；另外用户要重新授权 MCP 客户端，工作流步骤和判断规则也要重选。
  - **(b)(c) 带来的顺序约束。** 迁 Pages（W5-01 第 1 组）会让 Inbox 的 `inbox.pages.results`、`inbox.pages.generate` 不可用（`actions.provider_changed`），`pages.ts` 第 69 行的权限核对也被拒；而 Inbox 在第 3 组，且写不出 Pages 的 `install_id`。迁 Feed、Inbox 或 Workflows，会让各自文件里的自钉死核对失败。所以选 (b) 或 (c) 时，对应钉死处的改动必须先于（或在同一个 PR 里跟着）被钉的插件迁移。(a) 没有这个约束，这也是倾向它的原因之一。
- **授权有两层，都会变，而且对所有迁来的插件一样，不是 Todo 一个的事。**
  1. **动作可不可用，与 `kind` 无关。** 每个经 Plugin Runtime 安装的提供方，都要求安装的 `grants` 覆盖该动作的全部 `permissions`，否则报 `actions.plugin_permission`（`packages/plugin-runtime/src/action-provider.ts` 第 10–20 行）。内核在发现（`packages/kernel/src/action-service.ts` 第 215 行）和每次调用（`action-service.ts` 第 230 行，经 `CapabilityRegistry.invoke` 的 `requireCapability`，`packages/kernel/src/index.ts` 第 152–163 行）时检查，副作用前再检查一次（`action-service.ts` 第 112 行）。构建期插件没有安装记录，所以今天不受这条约束。
  2. **安装时授予什么。** 监督器只授予 Manifest 里 `required: true` 的权限，除非条目传 `grants`（`packages/plugin-runtime/src/supervisor.ts` 第 37–38 行、第 559–561 行）；内置插件跟宿主的构建时（版本更高、更低或同版本改了清单都一样），安装记录保留「仍声明的旧授权加新的必需授权」，不看条目的 `grants`（`packages/plugin-runtime/src/install-rules.ts` 的 `followBundledBuild`）。
  3. **`kind` 只决定用户在网页里调动作时的调用者权限**：`apps/local-host/src/local-owner-permissions.ts` 把 `kind: "native"` 的目录条目的动作权限算作本机所有者的，非 native 的要求安装的 `grants` 覆盖（`local-web-actions.ts` 的 `localWebActionContext`）。保持 `kind: "native"` 不能让第 1 层放行。
  4. **后果。** 动作用到的权限里有不是 `required: true` 的，迁移后这些动作就不可用：Todo 的 `todo:write`（`plugins/native/todo/src/manifest.ts` 第 20 行只把 `todo:read` 标必需，写动作要 `todo:read` 加 `todo:write`），Form 的 `model:invoke`（`plugins/native/form/src/manifest.ts` 第 26 行）。Shelf 能用，是因为它的三项权限都是 `required: true`，它的 Runtime 动作只用这三项（`plugins/native/shelf/src/manifest.ts`、`runtime-actions.ts`），不是因为它是 `native`。Form 是第一个样板，所以这一条要在 W4-04 之前定。
  5. **选项。** (a) 把动作用到的权限都标 `required: true`：不动平台；但 `required` 同时表示「撤销它整个提供方就不可用」（`action-provider.ts` 第 47–49 行）且不能在安装时拒绝，`model:invoke` 被 Form 有意标成可选，改成必需等于装上就允许调模型。(b) 监督器条目传显式 `grants`：只对第一次安装生效，之后宿主升级走上面第 2 点的路径，新版本新增的权限拿不到，第一次升级就又坏一次，还要改那条路径。(c) 改 bundled 的授予规则：`bundled: true` 的条目安装和升级时都授予 Manifest 声明的全部权限。这复现的是今天的行为（构建期插件的权限都算本机所有者的，且没有逐项撤销），代价是内置插件的授权不能再被逐项撤销，要在设计稿里写明。倾向 (c)，由 W3-06 设计稿拍板；它改的是授权语义，需要评审。
- **放置。** 见 2.2 的放置规则：6 个 Home 级、9 个每项目；与决定原文的差别待用户确认（第 10 节第 3 项）。
- **项目库里的表。** Inbox、Schedule、Feed 的表在项目库基线里，W3-06 的库服务只写了 Home 库。这一族要么先保持表由 Module 或包自建（现状），只迁动作和界面，要么另设项目库服务；建议先按现状。这也是扩展点清单的 X-5。
- **舞台页怎么渲染。** Runtime 插件的舞台页今天由 `web-goals-read.ts` 拼 `plugin_stages`，每个插件一个具名函数。过渡期 Form 沿用这条路；通用挂载器是 W5-06。
- **「项目已删」步骤怎么送达。** 2026-10-07 决定：删除项目时，每个按项目分区的 Home 库的主人加一个「项目已删」步骤，删项目提交后逐个清掉该项目的数据，每步记在删除收据里、失败可重试，删前确认框列出会一起删的插件数据。今天的做法（`fix/project-deletion-owners` 合入后）：`apps/local-host/src/managed-project-deletion.ts` 先把项目目录改名暂存，在目录库的同一个事务里清会话绑定、面板、工作区成员和项目事实，并为 `ProjectDeletedHooks`（`apps/local-host/src/project-deleted-hooks.ts`，每个 Home 一份、进程内共享）里登记的每个主人记一步（目录库表 `project_deletion_steps`）；提交后逐个运行主人的 `clear(projectId)`，某一步失败、被主人推迟（服务属于另一个进程）或主人不在收尾的进程里，就保持 pending 并带着错误，同一个删除请求再来时重试。各插件库的主人由插件包自己声明：插件包导出一份 `ProjectDataDeclaration`（标签 `label`、清除函数 `purge`，调用包里已有的 `purge*Project`，可选的 `order` 决定先后），内置插件把它写在目录条目的 `project_data` 上，宿主在 `apps/local-host/src/project-deleted-owners.ts` 的 `homeProjectOwners` 里遍历目录登记，不点名任何插件（Alchemist 不是靠声明：宿主自己列它，清除是删掉它的项目目录）；按 Home 文件清除，不要求插件实例在运行；确认框里的名单来自各主人登记的 `label`。下面的 (a)–(e) 今天都做得到，靠的是宿主直接调用插件包里的函数。按 2.2 的表，迁移范围内有 9 个插件有这样的数据：Form、Dataset、PPT、Pages、灵光、Workflows、Todo、Images、Alchemist。它们迁到 Runtime 之后，宿主不再直接调用插件包里的代码，所以必须规定这一步怎么送达。要求：(a) 不依赖插件正在运行：插件被停用、卸载后，它库里的该项目数据照样要清；(b) 重复执行无副作用，失败可重试；(c) 结果进删除收据；(d) 不绕过库的主人去写别人的表；(e) 能给确认框提供「会一起删的插件数据」的名称。倾向的做法：把这一步做成「库登记项」的一部分，即插件在声明自己的 Home 库时（W4-11 的统一登记表、W3-06 的 Home 库服务）同时声明一个「按 Home 文件清除某个项目」的函数，由删除服务读登记表逐个调用；函数留在插件包里，不要求实例在运行。备选是 Runtime 向运行中的实例投递「项目已删」事件，它满足不了 (a)。由 W3-06 与 W4-11 的设计稿定。

### 4.3 浏览器代码（W4-04、W5-04）

Form 同时是浏览器代码打包与类型检查的样板：客户端改成带类型检查的 TypeScript，用 esbuild 打成 IIFE，请求改到 `/api/plugins/io.molis.work.form/`。现在文档族客户端写的是 `/api/plugins/<短名>/…`，由 `native-plugin-api.ts` 改写成 `/api/<短名>/…`；Shelf、Jelly、Todo、Feed、Workflows、Schedule、Cognia、Inbox、Images、Experiments、Alchemist 的客户端直接请求 `/api/<短名>/…`（`git grep -F "/api/<短名>" -- plugins apps/workbench/src` 分别 31、27、24、24、9、9、7、6、3、2、1 行）。迁一个，改一个。

### 4.4 其他前置切片

- **W4-01 探针插件夹具**：用一个声明式的探针插件走完安装、发现、调用（含 `/api/plugins/<id>/`）、升级、停用、卸载，证明平台本身通了，再迁真实插件。
- **W4-02 `methods` 随 Runtime 生效**（2026-10-08 决定）：今天只有目录条目里的 `methods` 在宿主启动时登记（`apps/local-host/src/agent-definitions/builtin-agents.ts` 的 `builtinRegistrations`），`packages/plugin-runtime`、`installed-plugin-host.ts` 和 `plugin-builder/` 里没有登记 `methods` 的代码。迁来的插件保留目录条目（第 6 节第 5 项），它们的 `methods` 仍由 `builtinRegistrations` 登记；W4-02 让登记跟着安装的生命周期走（启动时登记，停用、卸载、升级时收回），迁移 PR 要加一个用例：停用迁来的插件后，它的方法不再出现在 Agent 定义里。W4-02 的设计要避免对「既有目录条目又有 Runtime 安装」的内置插件登记两次。
- **W4-11 Home 库统一登记表**：插件的库由插件声明、宿主库集中列出；卸载、维护、基线读它。「项目已删」步骤（4.2 末项）的登记也落在这里。

## 5. 顺序

```text
W3-06 平台服务 ──► W4-01 探针插件夹具 ──► W4-04 Form 样板 ──► Todo（第二）──► W5-01 其余各族 ──► W6-01 删别名与旧路由
 (model / Home 库 /        (声明驱动的探针走                                              (名单只剩例外)
  Home 级实例 /            安装→停用→卸载)
  项目已删步骤送达)
W4-02 methods、W4-11 库登记表 与上面并行，各自在被用到的迁移之前合入。
Characters 并进宿主（第 5.4 节）是第 4 波的另一片，不在这条链上。
```

### 5.1 Form（W4-04，第一个样板）

选 Form 的理由（调研评估，用户 2026-10-07 采纳）：项目范围的动作、宿主适配很薄（`form-actions.ts` 29 行、`form-native-plugin-http.ts` 19 行）、包里已经有 `routes.ts`、`route-handlers.ts`、`content-actions.ts`，和 Dataset、PPT 同形，样板能直接迁给三个兄弟。

这个 PR 做什么：

1. 删：`apps/local-host/src/form-actions.ts`、`form-native-plugin-http.ts`；`index.ts` 里 `handleFormNativePluginHttp` 的导出；`project-host.ts` 里 `formActionProvider` 的 import 和 `registerProvider` 一行；`web-request.ts`、`web-catalog.ts` 里 `handleFormNativePluginHttp` 的 import 和调用段；`FORM_ACTION_PERMISSIONS` 的两处 import（权限由 Manifest 推出）。
2. 改：`apps/workbench/src/ui-composition.ts`、`renderer.ts`、`goals-page-renderer.ts` 里 Form 的挂载（`FORM_SURFACE_SLOTS`、`renderFormContribution`、`renderFormNativePluginSurface`）改为 Runtime 视图；`creative-artifacts.ts` 里 Form 的成果发布与读取端口（`registerFormArtifactVersion`、`readFormArtifactVersion`）换成 `services.artifacts`，还是保留为宿主端口，由样板设计定。
3. 加：包里 `plugin.ts`（`createFormPlugin`，`start()` 兑现 Manifest 的每条视图、路由、动作）；`project-plugins.ts` 的监督器条目（`bundled: true`），放在每个项目一个的实例里（2.2 的放置规则）；`tests/builtin-plugin-assembly-gate.test.ts` 里从 `BUILD_TIME_ASSEMBLED` 和 `NATIVE_PLUGIN_HTTP_FILES` 移到 `RUNTIME_ASSEMBLED`。
4. 保持：`plugin_id`、`{home}/form/form.db` 的位置与结构、界面外观、动作 id 与版本。不碰真实 Home 的数据。
5. 开工前要已经定下的：授权规则（4.2，Form 的 `model:invoke` 是可选权限，不定就会让 Form 的 AI 动作全部不可用）、「项目已删」步骤的送达方式（Form 的表带 `project_id`）。

验收：Form 的现有用例全过；`tests/builtin-plugin-assembly-gate.test.ts` 的名单缩短；浏览器里把问卷创建、填写、看结果走一遍；W4-01 的探针夹具对 Form 同样成立（安装、发现、调用、升级、停用、卸载）；`model:invoke` 的动作在迁移后仍可用；删除一个有问卷的项目后，Form 的该项目数据被清掉。

### 5.2 Todo（第二个样板，紧接 Form）

**Todo 是第二个迁移，排在 Form 之后、其余各族之前**（2026-10-07 决定）。W5-01 的描述把「Dataset/PPT/Pages」列在「Todo」前面，只是那条描述的列举顺序，不改这个决定。

Todo 打开 Home 级路径：它是第一个在 Home 级实例上的插件，用到 Home 级实例、Home 库服务、`services.model`（`todo-actions.ts` 注入 `completeText`）。迁之前要先回答 4.2 的提供方身份和授权规则：Todo 的 `todo:write` 是 `required: false`，不处理，迁移后所有写动作不可用。它的表带可空的 `project_id`，「项目已删」步骤只清带项目的条目，个人待办留下。

### 5.3 其余各族（W5-01，一个 PR 一族）

建议顺序（W5-01 的描述：Dataset/PPT/Pages；Todo；个人插件；Schedule/Workflows/Inbox；Feed 单独；Shelf 混合；Alchemist 与例外）。Form、Todo 之后：

1. 文档创作族：Dataset、PPT、Pages。与 Form 同形，样板之后最稳。
2. 个人族：Jelly、Cognia、灵光、Images、Experiments。其中 Jelly、Cognia、Images、Experiments 依赖 Home 级实例；灵光按 2.2 的放置规则是每个项目一个。Images 有长驻的 `ImagesHostService`，Experiments 的库在 `plugins/experiments/` 下，各有一处额外适配。
3. 流程族：Schedule、Workflows、Inbox。Schedule 的提醒和定时操作与宿主调度器相连，Workflows 要通过动作目录调其他插件，Inbox 与 Feed 有判断场景绑定；碰到 4.2 的项目库表问题。Inbox 和 Workflows 还在代码里写死了自己的 `provider_id`，Inbox 还钉着 Pages（4.2 第 3 类后果）：如果 4.2 不选「保持 `plugin_id`」，这一族里 Inbox 的钉死处要在第 1 组的 Pages 迁移之前或同一个 PR 里改掉，顺序要跟着调。
4. Feed：被 29 个宿主文件 import，来源、信号、连接器、Inbox 都和它相连，单独写计划再迁。
5. 混合插件收拢：Shelf（删 `shelf-native-plugin-http.ts`、`personal-native-plugin-http.ts`、两处 `registerProvider`）。
6. Alchemist：最后迁，它有自己的宿主服务和每项目工作室库。

### 5.4 Characters：并进宿主，不是迁到 Runtime

2026-10-08 用户决定：Characters 不再是 Runtime 插件。代码并进宿主或一个 Module，界面仍是设置里的一节，安装记录与 Runtime 条目一起删，是第 4 波的一片。路线图 W5-01 里「Shelf 与 Characters 混合」一组因此只剩 Shelf。

现状：包 `plugins/native/characters` 有 13 个源文件、约 965 行（界面、14 条路由、动作、成果预览、导入）；Manifest `kind: "app"`，目录条目标 `personal: true`，有两个视图，设置里的 `settings`（`order: 35`，排在「助理」之后）和舞台页 `page`；数据和服务在 Module `modules/characters`；监督器条目在 `project-plugins.ts`；宿主里有 `characters-host.ts`（84 行，另含 Coding 用的 `codingCharacterPorts`）、`character-import-discovery.ts`、`character-import-plugins.ts`、`character-native-execution.ts`；`coding-surface.ts` 的 `charactersWorkbenchPanel` 拼它的舞台页；门禁的 `RUNTIME_ASSEMBLED` 有 `characters`。

这一片必须覆盖的点（设计在片内定，不在本计划里预先定死）：

1. **代码放哪**：宿主还是 `modules/characters`。Module 已经拥有草稿、修订和启用状态；放进 `apps/local-host` 要遵守「apps 只装配与做 IO，不写业务规则」（`docs/system/DEVELOPMENT-REQUIREMENTS.md`）。
2. **设置里的一节**：并进宿主后，「角色」在 `apps/workbench/src/settings-sections.ts` 的 `HOST_SECTIONS` 里是第 12 项，位置（`order: 35`）不变；舞台页 `page` 也要有归宿。位置数见 [EXTENSION-POINTS.md](EXTENSION-POINTS.md) 3.6。
3. **要删的**：监督器条目与 `charactersPluginPorts`、目录条目、`RUNTIME_ASSEMBLED` 里的 `characters`、`charactersWorkbenchPanel` 对插件舞台的拼装；`characters-host.ts` 里 Coding 要用的 `codingCharacterPorts` 和导入相关的文件留下。
4. **「角色」成果类型的声明要换主人**：Manifest 的 `artifacts.produces` 现在声明了 `CHARACTER_ARTIFACT_TYPE` 和预览动作 `characters.artifacts.preview`；AGENTS.md 要求成果类型在 Manifest 声明、带 owner。插件没了，这个声明和预览动作要落到宿主或 Module 的声明里，`tests/artifact-type-gate.test.ts`、`tests/artifact-declaration-gate.test.ts` 要继续成立。
5. **动作的提供方会换**：`CHARACTERS_ACTIONS` 今天由 Runtime 安装提供（`provider_id` 是 `install_id`），并进宿主后换成宿主提供方。动作 id 与版本不变，但 `provider_id` 变，影响面同 4.2 的「提供方身份」里的存量引用（MCP 授权、工作流步骤按 `provider_id` 匹配），要在同一个决定里处理，不要在这一片里悄悄改。4.2 的清点命令在代码里没有查到写死 Characters `provider_id` 的行，所以它没有第 3 类后果。
6. **安装记录**：每个项目库的 `plugin_runtime_installs` 里有 `io.molis.work.characters` 的记录（监督器启动时建）。决定写的是「安装记录与 Runtime 条目一起删」。对真实 Home 的项目库，这是删数据，走第 7 节的流程：先备份，在拷贝上演练，逐库核对。
7. **路由**：14 条路由现在在 `/api/plugins/io.molis.work.characters/` 下；并进宿主后路径是否保留，由这一片定（保留则客户端不用改）。

## 6. 每个插件迁移 PR 的清单

1. 先确认 W3-06 的服务够用，不够就停下补服务，不要在这个 PR 里补。
2. 加 `plugin.ts`，`start()` 兑现 Manifest 的每一条声明；缺一条或多一条都是启动失败。
3. 在 `project-plugins.ts` 加监督器条目（`bundled: true`，`nativePluginReleaseArtifact`）；Home 级的插件放进 Home 级实例（2.2 的放置规则）。
4. 删：宿主的 `<插件>-actions.ts`、`<插件>-native-plugin-http.ts`、`project-host.ts` 的 `registerProvider`、`web-request.ts` 与 `web-catalog.ts` 里的处理段和 import、`index.ts` 里的导出。
5. 目录条目（`builtin-plugins.ts`）保留。**这一条偏离任务书**：`docs/prompts/repository-anti-corruption.md` §4.6 写的是迁一个就删掉对应的宿主 `<插件>-actions.ts`、`<插件>-native-plugin-http.ts` 和工作台目录条目。保留的原因：Runtime 装配的插件同样有目录条目，门禁的第二项断言要求它们有；目录条目还带着 Manifest 里没有的工作台字段（`summary`、`personal`、样式、客户端工厂、`searchRow`、`instructions`、`agent`、`methods` 的正文）。手写的目录条目由 W5-02 改成从各包的声明生成，到那时它就没了，意图与任务书一致，只是晚于单个迁移 PR。待用户确认（第 10 节第 9 项）。工作台里这个插件的挂载改为 Runtime 视图。
6. 客户端请求改到 `/api/plugins/<plugin_id>/…`。
7. 门禁名单：从 `BUILD_TIME_ASSEMBLED`、`NATIVE_PLUGIN_HTTP_FILES` 移走，加进 `RUNTIME_ASSEMBLED`。
8. 提供方身份、授权规则（动作用到的每一项权限在迁移后仍然授予）、`kind` 按 4.2 的结论办。**迁移前先清点写死的 `provider_id`**：跑 4.2 提供方身份第 3 类后果里的清点命令，凡指向被迁插件的行（它自己的、别的插件钉着它的）都要在这个 PR 里有交代：4.2 选保持 `plugin_id` 的，这些行不变，PR 描述里写明；选别的，这些行都要改，并加用例证明迁移后仍然走通（例如迁 Pages 后 Inbox 的 `inbox.pages.generate` 仍可用，迁 Feed 后 Feed 的嵌套调用仍过得了入口的权限核对）。
9. `methods`：插件有 `methods` 的，W4-02 之后加一个用例，停用后方法不再登记。
10. **「项目已删」步骤**：2.2 的表里标「有」的插件，按 4.2 末项定下的送达方式保持这一步可用，并加用例：删除一个有该插件数据的项目后，这个项目的数据没了、别的项目的还在；插件被停用时也成立；这一步失败后重试成功。
11. 跑受影响用例；浏览器里走一遍主路径；W6-02 之后再加生命周期用例（升级、停用、卸载）。
12. 一个 PR 只迁一个插件或一族，串行合入：它们都改 `project-host.ts`、`web-request.ts`、`web-catalog.ts`、`builtin-plugins.ts`。

## 7. 数据与真实 Home

- **数据不动**：库仍在 `{home}/<id>/<id>.db`，由平台库服务打开，表和版本号不变（2026-10-07 决定的主要好处就是这个）。迁移不触发任何真实 Home 维护。
- **安装记录是新的**：监督器首次启动一个迁来的插件时，会新建安装记录并授予必需权限（`#activate`）。项目里启用了哪些插件记在项目目录里（`packages/contracts/src/modules/projects.ts` 的 `plugins` 列表），迁移不应改变这份记录。
- **会变的是引用**：见 4.2 的提供方身份。如果选择改写存量引用，那是对真实 Home 的数据操作，必须先问用户，先备份、在拷贝上演练、逐项核对；而且改写只覆盖存储里的引用（MCP 授权、工作流步骤、判断规则的场景提供方），代码里写死的 `provider_id` 要另外改，改写数据不能让它们恢复。
- **删除项目的路径会变**：迁移不改变「项目已删」步骤清什么，但改变它怎么被调用（4.2 末项）。迁移之后第一次在真实 Home 上删项目会走新路径，所以每一族迁完，要在 Home 的拷贝上演练一次：删一个有各插件数据的项目，核对删除收据里每个插件一步，再逐库核对数据没了、别的项目的还在。
- **Characters 的安装记录**：并进宿主时删掉各项目库里的 `io.molis.work.characters` 安装记录（5.4 第 6 点），那是对真实 Home 的项目库删行，按同样的流程做，不在迁移 PR 里顺手做。
- 迁移完成后，`uninstall --purge` 列表（`PERSONAL_HOME_SQLITE_STORES`）不变。Runtime 插件卸载时「删除私有存储」今天指 `services.storage`（项目库里的键值）；W3-06 的库服务要保证卸载迁来的插件不删除 `{home}/<id>/<id>.db`，保留与否仍按 `uninstall --purge` 的现有规则。

## 8. 门禁怎么随迁移收紧

- `tests/builtin-plugin-assembly-gate.test.ts` 已经有三条：每个目录条目要么在 `RUNTIME_ASSEMBLED`，要么在冻结名单；Runtime 条目确实被监督器启动；不再出现名单外的 `*-native-plugin-http.ts`。W1-05 要加：名单与磁盘完全一致（删了文件的条目必须移出）、冻结以插件命名的 `*-actions.ts` 和 `registerProvider` 行数、识别混合插件、按插件统计包外点名次数只许减少。
- 每个迁移 PR 在同一个 PR 里缩短名单。两种名单的防回头机制不同：`pnpm health:check` 把当前数字和合并基点比对，改不了；而这个测试里的名单是写死在测试文件里的集合，由迁移 PR 直接编辑，缩短靠评审和 W1-05 加的「与磁盘完全一致」那一条，不靠比对基点。
- 迁完之后（W6-01）：删 `native-plugin-api.ts` 的别名和 `/api/<短名>` 路由；把 AGENTS.md 那条硬约束改写成「新的内置插件 = 自己的包 + 声明」；冻结名单为空，或只留第 3 节的四个例外。

## 9. 怎样量进展

| 指标 | 现在 | 全部迁完后的目标 |
| --- | --- | --- |
| 目录条目 | 26 | 25（Characters 并进宿主后少一条） |
| `RUNTIME_ASSEMBLED`（Runtime 装配的内置插件） | 7 | 21（现有 6 个，Characters 移出，加迁来的 15 个） |
| `BUILD_TIME_ASSEMBLED`（构建期装配的内置插件） | 19 | 4（Goals、Artifacts、Sessions、插件创作台） |
| `apps/local-host/src/*-native-plugin-http.ts` | 18 个文件，962 行 | 1 个（`artifact-native-plugin-http.ts`，208 行） |
| 以插件命名的 `apps/local-host/src/*-actions.ts` | 17 个，623 行 | 3 个（`artifact-actions.ts`、`goals-actions.ts`、`work-actions.ts`，共 136 行） |
| `project-host.ts` 里按插件逐个登记的 `registerProvider` | 17 行 | 0 |
| 新增一个内置插件在包外的手改文件数（外加门禁名单一行与 SSOT 一行，两端都要） | 12（见 EXTENSION-POINTS.md 3.1） | 1（要 X-1；没有 X-1 是 4） |

量法：目录条目和两份名单数 `tests/builtin-plugin-assembly-gate.test.ts` 里的集合与 `BUILTIN_PLUGIN_CATALOG` 的条数；两类 `*-native-plugin-http.ts`、`*-actions.ts` 数文件与行数，`ls apps/local-host/src/*-native-plugin-http.ts`、`wc -l`；按插件登记的 `registerProvider` 数 `project-host.ts` 里的行：`grep -c -E "registerProvider\((pages|ppt|form|dataset|lingguang|inbox|schedule|scheduleReminder|shelfProject|workflows|images|jelly|todo|cognia|shelf|experiments)ActionProvider|registerProvider\(this\.alchemist\.provider" apps/local-host/src/project-host.ts`（Feed 通过 `nativeContentProviders` 的循环登记，不在这一行数里）；包外手改文件数用 EXTENSION-POINTS.md 第 1 节的两条命令。W6-04 用同一套方法重量并记入 spec。

## 10. 待决事项

1. **提供方身份**（4.2）：内置实例保持 `plugin_id`（倾向）、改写存量引用、还是接受重新授权。后两项不只动用户的真实 Home，还要改写死 `provider_id` 的 13 行代码（11 个文件）：自钉死要改成不写死，跨插件的钉死要去掉 `provider_id` 或另想办法（4.2 选项 (b)），而且 Pages、Inbox 的迁移顺序受它约束；保持 `plugin_id` 则这些都不用动。涉及用户的真实 Home，要用户定。
2. **内置插件的授权规则**（4.2）：把动作用到的权限都标必需、监督器条目传显式 `grants`、还是改 bundled 的授予规则（倾向最后一个）。对所有迁来的插件一样，Form 样板之前必须定。由 W3-06 设计稿拍板，需要评审，因为它改的是授权语义。
3. **放置规则的读法**（2.2）：本计划按「提供方今天怎么登记」放（6 个 Home 级、9 个每项目一个），Form、Dataset、PPT、Pages、灵光、Workflows 因此在每个项目一个的实例里。如果决定「个人插件装在一个 Home 级实例」要按目录 `personal` 标志字面读，这 6 个也上 Home 级实例。要用户确认。
4. **项目库内的插件表**（4.2）：Inbox、Schedule、Feed 先按现状只迁动作和界面，还是另设项目库服务。
5. **「项目已删」步骤的送达**（4.2 末项）：倾向做成 Home 库登记项里的「按文件清除某个项目」函数。由 W3-06 与 W4-11 的设计稿定；要补进 W3-06 的描述。
6. **例外的复审**（第 3 节）：W6-01 前复核四个例外的建议是否采纳。
7. **应用依赖清单生成**（EXTENSION-POINTS.md X-1）：路线图普查已列入声明式注册要生成的东西，W5-02 的切片描述没有写；需要用户同意把依赖清单交给脚本生成，新增插件的包外手改才能降到 1。
8. **Characters 并进宿主的设计点**（5.4）：代码放宿主还是 Module、「角色」成果类型声明的新主人、路由路径是否保留、安装记录删除的做法（对真实 Home）。在那一片的设计里定。
9. **目录条目保留**（第 6 节第 5 项）：迁来的插件保留目录条目直到 W5-02 生成它们，这偏离任务书「迁一个就删掉目录条目」的写法。要用户确认。
