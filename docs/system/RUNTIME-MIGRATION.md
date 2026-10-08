# 内置插件迁到 Plugin Runtime：计划

状态：计划，2026-10-08 按 origin/main `35d7f320` 核实。还没有合入的迁移样板：第一个样板 Form 是路线图 W4-04，依赖 W3-06 的平台服务，两者都未开始。这份文档回答「迁哪些、不迁哪些、什么顺序、迁之前要补什么、每个插件一个 PR 怎么做、怎样量进展」。

任务来源：`docs/prompts/repository-anti-corruption.md` §4.6「装配统一」；路线图 W1-15、W3-06、W4-01、W4-04、W5-01、W5-02、W6-01、W6-02（`specs/repository-anti-corruption/roadmap-2026-10-07.md`）；扩展点清单见 [EXTENSION-POINTS.md](EXTENSION-POINTS.md)。

## 白话说明

内置插件现在有两种装配方式。**经 Plugin Runtime**：监督器启动，有安装记录、升级检查、崩溃恢复，HTTP 由 Manifest 声明；有 7 个。**构建期组合**：宿主里手写一行 `registerProvider`、一个 `<插件>-native-plugin-http.ts`、`web-request.ts` 里的一段路由，没有安装记录和升级检查；有 19 个，名单冻结，只许减少。两种方式的插件在工作台里都有目录条目。迁移就是把这 19 个里能迁的逐个搬到第一种方式，每搬一个，删掉它在宿主里的文件和接线。数据不动：库留在原处，用户看到的界面不变。

## 1. 用户已定的决定

来自 `specs/repository-anti-corruption/spec.md` §1：

| 日期 | 决定 | 内容 |
| --- | --- | --- |
| 2026-10-07 | 插件平台范围 | 个人插件装在一个 Home 级 Runtime 实例，按项目启用照旧；数据留在 `{home}/<id>/<id>.db`，由平台的库服务打开；Goals、Artifacts、Sessions、插件创作台列为批准的构建期例外，其余 15 个逐族迁移；界面不变 |
| 2026-10-07 | 第一个样板 | Form 先、Todo 第二；Form 同时作浏览器代码打包与类型检查的样板 |
| 2026-10-07 | 两套能力机制收敛 | 对外的只走动作；typed 注册表只留作 Runtime 插件的宿主内服务通道，不许再加新项 |
| 2026-10-04 | 内置插件随宿主升级 | 监督器条目标 `bundled: true`，启动时把安装记录升到宿主的版本，保留新 Manifest 仍声明的授权、补上它要求的授权；不再恢复旧发行物 |
| 2026-10-08 | 版本与发布策略 | 内置插件 Manifest 跟宿主版本；工作区包保持私有 0.0.0（第四批决定，记在 spec §1 的 2026-10-08 行） |

AGENTS.md 的硬约束同时有效：新的内置插件只走 Runtime；不再新增 `apps/local-host/src/<插件>-native-plugin-http.ts`；冻结名单只许减少。

## 2. 现状（按代码）

### 2.1 26 个目录条目

`apps/workbench/src/builtin-plugins.ts` 的 `BUILTIN_PLUGIN_CATALOG` 有 26 条，在 `tests/builtin-plugin-assembly-gate.test.ts` 里分成：

- `RUNTIME_ASSEMBLED`（7）：characters、shelf、coding、files、git、diff、text-stats，由 `apps/local-host/src/project-plugins.ts` 的监督器启动。
- `BUILD_TIME_ASSEMBLED`（19）：alchemist、artifacts、cognia、dataset、experiments、feed、form、goals、images、inbox、jelly、lingguang、pages、plugin-builder、ppt、schedule、sessions、workflows、todo。

宿主里手写的接线（`apps/local-host/src` 下）：18 个 `*-native-plugin-http.ts`（共 960 行）；17 个以插件命名的 `*-actions.ts`（共 619 行：artifact、cognia、dataset、experiments、form、goals、images、inbox、jelly、lingguang、pages、ppt、schedule、shelf、todo、work、workflows）；`project-host.ts` 里 26 处 `registerProvider`，其中按插件逐个登记的 17 处；`web-request.ts` 和 `web-catalog.ts` 里各有 `handle*NativePluginHttp` 的引用（30 行、18 行）。这几个文件也是最挤的热点：自 2026-09-28 起合入 main 的次数，`web-request.ts` 22、`web-catalog.ts` 15、`project-host.ts` 13、`builtin-plugins.ts` 11。

### 2.2 19 个构建期插件的分类

范围（个人或项目）取自目录条目的 `personal`；数据位置取自 `packages/storage/src/home-sqlite.ts` 的 `PERSONAL_HOME_SQLITE_STORES`、`apps/local-host/src/project-database-schema.ts` 和各包。

**批准的构建期例外（4）**：Goals、Artifacts、Sessions（包 `plugins/native/work`）、插件创作台（`plugin-builder`），见第 3 节。

**要迁的（15）**：

| 插件 | 范围 | 数据在哪 | 宿主适配文件（行数） | 提供方怎么登记 |
| --- | --- | --- | --- | --- |
| Form | 个人 | `{home}/form/form.db`，按 `project_id` 分区 | `form-actions.ts` 29、`form-native-plugin-http.ts` 19 | 每个项目一次 |
| Dataset | 个人 | `{home}/dataset/dataset.db` | 29、19 | 每个项目一次 |
| PPT | 个人 | `{home}/ppt/ppt.db` | 39、19 | 每个项目一次 |
| Pages | 个人 | `{home}/pages/pages.db` | 39、22 | 每个项目一次 |
| 灵光 | 个人 | `{home}/lingguang/lingguang.db` | 30、38 | 每个项目一次 |
| Workflows | 个人 | `{home}/workflows/workflows.db` | 30、23 | 每个项目一次 |
| Todo | 个人 | `{home}/todo/todo.db` | 26、22 | Home 一次 |
| Jelly | 个人 | `{home}/jelly/jelly.db` | 36、32 | Home 一次 |
| Cognia | 个人 | `{home}/cognia/cognia.db` | 21、14 | Home 一次 |
| Images | 个人 | `{home}/images/images.db`，另有运行锁 | 7、61；另有 `ImagesHostService` | Home 一次 |
| Experiments | 个人 | `plugins/experiments/private.sqlite` | 30、54 | Home 一次 |
| Alchemist | 个人 | `{home}/alchemist/alchemist.db`，每项目另有 `alchemist/projects/<id>/studio.sqlite` | 没有 `*-actions.ts`（`AlchemistHostService`）、51 | Home 一次 |
| Inbox | 项目 | 项目库，表由 Attention 模块建（`ATTENTION_SCHEMA_SQL`） | 70、92 | 每个项目一次 |
| Schedule | 项目 | 项目库，表由插件包自建（`SCHEDULE_*_SCHEMA_SQL`） | 26、92；另有 `scheduleReminderActionProvider` | 每个项目一次 |
| Feed | 项目 | 项目库，表由 Feed、Sources、Signals 模块和插件的 `FEED_OUT_RULES_SCHEMA_SQL` 建 | 没有 `feed-actions.ts`；`feed-native-plugin-http.ts` 113 | 在 `content-action-providers.ts` 的 `nativeContentProviders` 里登记，每个项目一次；Feed 被 26 个宿主文件 import，单独成案 |

**两个混合插件**（在 `RUNTIME_ASSEMBLED` 里，宿主却仍留着手写文件，门禁看不出来）：Shelf 仍有 `shelf-native-plugin-http.ts`、`personal-native-plugin-http.ts`、`shelf-actions.ts`、`shelf-ai.ts`，并在 `project-host.ts` 里登记两个提供方（项目一份、Home 一份）；Characters 在宿主里有 `characters-host.ts` 等文件。它们的收拢在 W5-01 的最后一组。

## 3. 批准的构建期例外

四个例外都是 2026-10-07 用户批准的。spec 里只记了结论，没有逐条记理由；下面的原因是从代码里读出的事实。

| 插件 | 为什么现在不能是 Runtime 插件（代码事实） | 例外期间仍要守的 |
| --- | --- | --- |
| Goals | 每个项目都带、工作台里不能移除（`PRODUCT.md`）；Goal 的表在项目库基线里（`GOALS_SCHEMA_SQL` 等）；是被点名最多的插件，包外有 70 个文件引用它；`apps/cli`、`apps/mcp` 直接依赖它的包（`scripts/workspace-packages.mjs` 里两处 `extraWorkspaceDependencies`）；工作台里它的界面由 `apps/workbench/src/goals-page-renderer.ts` 和一组 Goals 渲染器接口挂载（W5-06 要换成通用挂载器） | 不新增 `<插件>-native-plugin-http.ts`（`NATIVE_PLUGIN_HTTP_FILES` 的冻结继续有效）；动作仍在统一目录里；不得因为是例外就从插件包里 import 别的插件实现 |
| Artifacts | `project-plugins.ts` 和 `installed-plugin-host.ts` 先构造 `ArtifactsModule`、`ProcessItemsModule`，再交给 `createPluginPlatform`，Runtime 给所有插件的 `services.artifacts`、`services.processItems` 就建在它上面；它自己再当 Runtime 插件，就要靠自己提供的服务启动自己（推断）。`artifact-native-plugin-http.ts` 206 行 | 同上；成果库规则不变（`artifacts.produces` 声明，宿主拒绝未声明的写入） |
| Sessions | 宿主持有会话注册表（`project-host.ts` 的 `this.sessions`），传给 `workActionProvider` 和 `projectWorkspaceActionProvider` | 同上 |
| 插件创作台 | 它创建并管理其他插件的安装：`installed-plugin-host.ts` 依赖 `AgentBuilderStore`；宿主侧 `apps/local-host/src/plugin-builder/` 有 16 个文件 2,181 行 | 同上；生成插件仍走统一目录与沙箱 |

**复审**：路线图 W6-01 把冻结名单写成「空，或只留已批准的例外」。建议在那一片合入前，对这四项各复核一次：只要 Runtime 的平台服务仍然表达不了它依赖的宿主内部对象，就继续留在例外里，并在 SSOT 对应行写明原因；理由消失才迁，不为迁而迁。这条建议是本计划提出的，不是用户的决定。

## 4. 迁移前必须补的平台缺口

调研列出三项服务缺口，另外核对代码又发现几处迁移会改变的行为。前一类由 W3-06 补，后一类要在样板 PR 之前定。

### 4.1 平台服务（W3-06）

`PluginHostServices`（`packages/contracts/src/platform/plugin.ts`）现在只有 `actions`、项目库键值 `storage`、`artifacts`、`processItems`、`ui`、`events`、`inputs`、`outputs`、`capabilities`。缺：

1. **模型服务**：`services.model`，由 `horizontal/agent-host` 支撑，带登记的指令、`scheduling: "concurrent"` 和 `beforeEffect()`；是 Runtime 插件服务，不是 typed 宿主能力。
2. **插件自有的 Home 库服务**：按 `{home}/<id>/<id>.db` 打开已有的库，表不变。
3. **Home 级 Runtime 实例**：`createPluginPlatform` 现在只在每个项目里创建，Home 级的个人插件（Todo、Jelly、Cognia、Images、Experiments、Alchemist）要有一个 Home 级实例，按项目启用照旧。

### 4.2 要在 W3-06 设计稿里定的事

这些是读代码发现的、迁移会改变的行为，设计稿必须回答，否则样板会悄悄改了用户看得见的东西：

- **提供方身份会变。** 构建期插件的提供方 `provider_id` 是 `manifest.plugin_id`（例如 `todo-actions.ts`、`form-actions.ts`）；Runtime 插件的提供方 `provider_id` 是安装的 `install_id`（`packages/plugin-runtime/src/action-provider.ts`）。而逐客户端的 MCP 授权按 `provider_id` 匹配（`apps/local-host/src/mcp-action-grants.ts`），工作流的动作步骤也存 `provider_id`（`plugins/native/workflows/src/actions.ts`）。不处理的话，迁移后这些存量授权和步骤会失配。选项：对内置实例让 `provider_id` 保持 `plugin_id`（倾向这个；范围要在设计稿里量，因为 `local-web-actions.ts` 等处用 `provider_id` 去查安装记录，要一起改）；或在真实 Home 维护里改写存量引用（需要用户批准，走备份和拷贝演练）；或接受一次重新授权。
- **授权规则会变。** 用户在网页里调动作时，构建期插件的动作权限由 `apps/local-host/src/local-owner-permissions.ts` 从 `manifest.kind === "native"` 的目录条目读出，直接算本机所有者的；非 native 的插件要求运行中安装的 `grants` 覆盖动作的全部权限（`local-web-actions.ts` 的 `localWebActionContext`）。监督器安装时只授予 `required: true` 的权限（`packages/plugin-runtime/src/supervisor.ts` 的 `#activate`）。Todo 的动作权限里只有 `todo:read` 是必需（另有必需的 `storage:private`），Form 把除 `model:invoke` 外的都标为必需。所以迁 Todo 时，要么像 Shelf 那样保持 `kind: "native"`（Shelf 的先例），要么先定 `bundled` 安装的授予规则。
- **项目库里的表。** Inbox、Schedule、Feed 的表在项目库基线里，W3-06 的库服务只写了 Home 库。这一族要么先保持表由 Module 或包自建（现状），只迁动作和界面，要么另设项目库服务；建议先按现状。这也是扩展点清单的 X-5。
- **舞台页怎么渲染。** Runtime 插件的舞台页今天由 `web-goals-read.ts` 拼 `plugin_stages`，每个插件一个具名函数。过渡期 Form 沿用这条路；通用挂载器是 W5-06。

### 4.3 浏览器代码（W4-04、W5-04）

Form 同时是浏览器代码打包与类型检查的样板：客户端改成带类型检查的 TypeScript，用 esbuild 打成 IIFE，请求改到 `/api/plugins/io.molis.work.form/`。现在文档族客户端写的是 `/api/plugins/<短名>/…`，由 `native-plugin-api.ts` 改写成 `/api/<短名>/…`；Shelf、Jelly、Todo、Feed、Workflows、Schedule、Cognia、Inbox、Images、Experiments、Alchemist 的客户端直接请求 `/api/<短名>/…`（`git grep -F "/api/<短名>" -- plugins apps/workbench/src` 分别 30、27、24、24、9、8、7、6、3、2、1 行）。迁一个，改一个。

## 5. 顺序

```text
W3-06 平台服务 ──► W4-01 探针插件夹具 ──► W4-04 Form 样板 ──► W5-01 逐族迁移 ──► W6-01 删别名与旧路由
 (model / Home 库 /        (声明驱动的探针走               (含 Todo 第二)           (名单只剩例外)
  Home 级实例)              安装→停用→卸载)
```

### 5.1 Form（W4-04，第一个样板）

选 Form 的理由（调研评估，用户 2026-10-07 采纳）：项目范围的动作、宿主适配很薄（`form-actions.ts` 29 行、`form-native-plugin-http.ts` 19 行）、包里已经有 `routes.ts`、`route-handlers.ts`、`content-actions.ts`，和 Dataset、PPT 同形，样板能直接迁给三个兄弟。

这个 PR 做什么：

1. 删：`apps/local-host/src/form-actions.ts`、`form-native-plugin-http.ts`；`index.ts` 里 `handleFormNativePluginHttp` 的导出；`project-host.ts` 里 `formActionProvider` 的 import 和 `registerProvider` 一行；`web-request.ts`、`web-catalog.ts` 里 `handleFormNativePluginHttp` 的 import 和调用段；`FORM_ACTION_PERMISSIONS` 的两处 import（权限由 Manifest 推出）。
2. 改：`apps/workbench/src/ui-composition.ts`、`renderer.ts`、`goals-page-renderer.ts` 里 Form 的挂载（`FORM_SURFACE_SLOTS`、`renderFormContribution`、`renderFormNativePluginSurface`）改为 Runtime 视图；`creative-artifacts.ts` 里 Form 的成果发布与读取端口（`registerFormArtifactVersion`、`readFormArtifactVersion`）换成 `services.artifacts`，还是保留为宿主端口，由样板设计定。
3. 加：包里 `plugin.ts`（`createFormPlugin`，`start()` 兑现 Manifest 的每条视图、路由、动作）；`project-plugins.ts` 的监督器条目（`bundled: true`）；`tests/builtin-plugin-assembly-gate.test.ts` 里从 `BUILD_TIME_ASSEMBLED` 和 `NATIVE_PLUGIN_HTTP_FILES` 移到 `RUNTIME_ASSEMBLED`。
4. 保持：`plugin_id`、`{home}/form/form.db` 的位置与结构、界面外观、动作 id 与版本。不碰真实 Home 的数据。

验收：Form 的现有用例全过；`tests/builtin-plugin-assembly-gate.test.ts` 的名单缩短；浏览器里把问卷创建、填写、看结果走一遍；W4-01 的探针夹具对 Form 同样成立（安装、发现、调用、升级、停用、卸载）。

### 5.2 Todo（第二个样板）

Todo 打开 Home 级路径：Home 级实例、Home 库服务、`services.model`（`todo-actions.ts` 注入 `completeText`）。迁之前要先回答 4.2 的提供方身份和授权规则，因为 Todo 既是第一个 Home 级的迁移对象，又有 `required: false` 的写权限。

### 5.3 其余各族（W5-01，一个 PR 一族）

建议顺序（W5-01 的描述：Dataset/PPT/Pages；Todo；个人插件；Schedule/Workflows/Inbox；Feed 单独；Shelf 与 Characters 混合；Alchemist 与例外）：

1. 文档创作族：Dataset、PPT、Pages。与 Form 同形，样板之后最稳。
2. 个人族：Jelly、Cognia、灵光、Images、Experiments。依赖 Home 级实例；Images 有长驻的 `ImagesHostService`，Experiments 的库在 `plugins/experiments/` 下，各有一处额外适配。
3. 流程族：Schedule、Workflows、Inbox。Schedule 的提醒和定时操作与宿主调度器相连，Workflows 要通过动作目录调其他插件，Inbox 与 Feed 有判断场景绑定；碰到 4.2 的项目库表问题。
4. Feed：被 26 个宿主文件 import，来源、信号、连接器、Inbox 都和它相连，单独写计划再迁。
5. 混合插件收拢：Shelf（删 `shelf-native-plugin-http.ts`、`personal-native-plugin-http.ts`、两处 `registerProvider`）、Characters（`characters-host.ts` 等）。
6. Alchemist：最后迁，它有自己的宿主服务和每项目工作室库。

## 6. 每个插件迁移 PR 的清单

1. 先确认 W3-06 的服务够用，不够就停下补服务，不要在这个 PR 里补。
2. 加 `plugin.ts`，`start()` 兑现 Manifest 的每条声明；缺一条或多一条都是启动失败。
3. 在 `project-plugins.ts` 加监督器条目（`bundled: true`，`nativePluginReleaseArtifact`）。
4. 删：宿主的 `<插件>-actions.ts`、`<插件>-native-plugin-http.ts`、`project-host.ts` 的 `registerProvider`、`web-request.ts` 与 `web-catalog.ts` 里的处理段和 import、`index.ts` 里的导出。
5. 目录条目（`builtin-plugins.ts`）保留：Runtime 装配的插件同样有目录条目，门禁的第二项断言要求它们有，不要删；工作台里这个插件的挂载改为 Runtime 视图。
6. 客户端请求改到 `/api/plugins/<plugin_id>/…`。
7. 门禁名单：从 `BUILD_TIME_ASSEMBLED`、`NATIVE_PLUGIN_HTTP_FILES` 移走，加进 `RUNTIME_ASSEMBLED`。
8. 提供方身份、授权规则、`kind` 按 4.2 的结论办。
9. 跑受影响用例；浏览器里走一遍主路径；W6-02 之后再加生命周期用例（升级、停用、卸载）。
10. 一个 PR 只迁一个插件或一族，串行合入：它们都改 `project-host.ts`、`web-request.ts`、`web-catalog.ts`、`builtin-plugins.ts`。

## 7. 数据与真实 Home

- **数据不动**：库仍在 `{home}/<id>/<id>.db`，由平台库服务打开，表和版本号不变（2026-10-07 决定的主要好处就是这个）。迁移不触发任何真实 Home 维护。
- **安装记录是新的**：监督器首次启动一个迁来的插件时，会新建安装记录并授予必需权限（`#activate`）。项目里启用了哪些插件记在项目目录里（`packages/contracts/src/modules/projects.ts` 的 `plugins` 列表），迁移不应改变这份记录。
- **会变的是引用**：见 4.2 的提供方身份。如果选择改写存量引用，那是对真实 Home 的数据操作，必须先问用户，先备份、在拷贝上演练、逐项核对。
- 迁移完成后，`uninstall --purge` 列表（`PERSONAL_HOME_SQLITE_STORES`）不变。Runtime 插件卸载时「删除私有存储」今天指 `services.storage`（项目库里的键值）；W3-06 的库服务要保证卸载迁来的插件不删除 `{home}/<id>/<id>.db`，保留与否仍按 `uninstall --purge` 的现有规则。

## 8. 门禁怎么随迁移收紧

- `tests/builtin-plugin-assembly-gate.test.ts` 已经有三条：每个目录条目要么在 `RUNTIME_ASSEMBLED`，要么在冻结名单；Runtime 条目确实被监督器启动；不再出现名单外的 `*-native-plugin-http.ts`。W1-05 要加：名单与磁盘完全一致（删了文件的条目必须移出）、冻结以插件命名的 `*-actions.ts` 和 `registerProvider` 行数、识别混合插件、按插件统计包外点名次数只许减少。
- 每个迁移 PR 在同一个 PR 里缩短名单；`pnpm health:check` 与门禁用「与合并基点比对」，改不了数字。
- 迁完之后（W6-01）：删 `native-plugin-api.ts` 的别名和 `/api/<短名>` 路由；把 AGENTS.md 那条硬约束改写成「新的内置插件 = 自己的包 + 声明」；冻结名单为空，或只留第 3 节的四个例外。

## 9. 怎样量进展

| 指标 | 现在 | 全部迁完后的目标 |
| --- | --- | --- |
| `BUILD_TIME_ASSEMBLED`（构建期装配的内置插件） | 19 | 4（Goals、Artifacts、Sessions、插件创作台） |
| `apps/local-host/src/*-native-plugin-http.ts` | 18 个文件，960 行 | 1 个（`artifact-native-plugin-http.ts`，206 行） |
| 以插件命名的 `apps/local-host/src/*-actions.ts` | 17 个，619 行 | 3 个（`artifact-actions.ts`、`goals-actions.ts`、`work-actions.ts`，共 136 行） |
| `project-host.ts` 里按插件逐个登记的 `registerProvider` | 17 行 | 0 |
| 新增一个内置插件在包外的手改文件数 | 14（见 EXTENSION-POINTS.md 3.1） | 1 |

量法：前三项数文件与行数，`ls apps/local-host/src/*-native-plugin-http.ts`、`wc -l`，以及门禁测试里的名单；第四项数 `project-host.ts` 里 `registerProvider` 的行；W6-04 用同一套方法重量并记入 spec。

## 10. 待决事项

1. **提供方身份**（4.2）：内置实例保持 `plugin_id`（倾向）、改写存量引用、还是接受重新授权。涉及用户的真实 Home，要用户定。
2. **内置插件的授权与 `kind`**（4.2）：沿用 Shelf 的先例保持 `native`，还是改 `app` 并定 `bundled` 的授予规则。
3. **项目库内的插件表**（4.2）：Inbox、Schedule、Feed 先按现状只迁动作和界面，还是另设项目库服务。
4. **例外的复审**（第 3 节）：W6-01 前复核四个例外的建议是否采纳。
5. **应用依赖清单生成**（EXTENSION-POINTS.md X-1）：不属于现有的 W5-02 描述，需要用户同意把依赖清单交给脚本生成，新增插件的包外手改才能降到 1。
