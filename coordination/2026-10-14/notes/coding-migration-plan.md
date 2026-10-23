# Coding 移出 HYBRID 名单：迁移计划（草稿）

③ 迁移线，2026-10-21。状态：① 已批（10-21），按片开发；① 的补充见下一节，与正文冲突时以那一节为准。代码按 `origin/main` `aa327f34d1d44b46d881b27badbbf104c3046fcc`（2026-10-20 17:24 UTC）逐条核对；没有改仓库文件，没有构建、没有跑测试，没有提交。作者：③ 子代理（只读）。在途 PR 的文件清单取自 10-21 的 `gh api`，视觉线的分支今天仍在推，开工前要重取。写「未核」的地方是没有看到代码、或看到了但没有跑出结果，不是已确认。读法：先看 §0，再看 §5 切片；条目细节在 §2。

## ① 批复（10-21，与正文冲突时以这一节为准）

- 照计划走：切法、顺序、§1 的完成标准，以及 ③ 裁的 T4、T6、T8。
- **T1（① 裁）**：`assistant-coding.ts` 不是 Coding 离开 HYBRID 的硬条件，C9 不等 C8。
  - 理由：它已经只调 Coding 的公开动作，剩下的问题（助理按插件名选执行方）属于 PG-036 / W5-10，那份设计还没有。
  - C9 收口时这个文件如果还在：在 privileges 的 PG-036 行和 `specs/coding-plugin/spec.md` 的状态句里写明它还在、归 W5-10；收口验收第 2 条改成三个文件，第 4 个挂到 C8。
  - C8 留在计划里，② 出了设计就做。
- **U1（PG-009）已答（10-21，用户选「开放给所有插件」）**：
  - 用户看到的问题：「迁出去以后，谁可以声明这几种审查？」
  - 所选答案原文：「插件在 Manifest 里声明要哪几种审查，装插件时由你授权；每一次审查照旧要人来批。这和 10-18 定的『插件待遇一样，只按发布者签名区分安装信任』一致，不新增内置特权。」
  - ③ 草稿里「先只放给内置插件」的倾向作废。C5 照 §5 C5 一节写，顺序不变。
- **U3、U4**：真触发时停下来告诉 ①，由 ① 去问用户。
- **开工顺序**：
  - C3：#892 合入后，从合入后的 main 开。→ 已开 **#905**（10-21，先叠在 #892 上做，#892 squash 合入后 base 直接是 main，已 merge 到含 #903 的 main）。
  - C1：#867 合入（batch-1020-11 在跑）、② 的 L2 落地后排第一。→ 已开 **#932**（10-21，head ddc13cd4f 已移交 ⑤，分支 `migrate/coding-c1-database`，从含 #903 的 main 开，后又 merge 了 #905、#909、#893、#861）。
  - C2：② 答完 T2、T7 后开，排在 C1 后面。→ 10-21 改为只等 #909（已合 9848b3502），T7 无平台代码；照 §6 T7「10-21 补核」做。③ 从 C1 的分支 merge 开（两片都改 `CodingExecutionPorts`、`start-round.ts`、`route-entry.ts`、`project-plugins.ts`），只用 merge。
  - 其余按依赖走，平台没就绪的片不空等。
  - 改 `project-plugins.ts` 的片一次只开一个，交 ⑤ 之前先 merge main。
- **每片的 PR 正文**：写一行「本片动的文件」，① 要转给用户排需求用。

## ③ 审定（10-21，先读这一节）

抽查过几处，与 main 一致：`builtin-plugin-assembly-gate.test.ts:128`（HYBRID 名单）和 `:143`（`deepEqual`）、`project-plugins.ts:133-140`、`reviews.ts:113-121`（审查放行写死插件 id 字面量）。

1. **切片顺序照 §5**：数据、端口、成果交界、后台、审查种类、路由、装饰、助理、界面。这是代码定形的先后。实际开工的先后按依赖排，平台没就绪的片不空等：
   - **现在就能开的 ③ 片**：C3（不需要新的平台服务）。它和 #892（Shelf S1）在 `project-plugins.ts` 的 Shelf `receive` 那几行相邻，所以 C3 排在 #892 之后，从合入后的 main 开。
   - **C1**：#867 合入、② 的 L2 落地后开。用户后面的 Coding 需求最常碰 `store.ts`，所以 L2 一到，C1 排第一。
   - **C2**：等 ② 答完 T2、T7，并且排在 C1 之后，因为两片都改 `CodingExecutionPorts`。助理那部分排在 #873、#874、#876 之后。
   - **C6**：平台一半归 ②，可以现在就从 main 开，不依赖 L2。③ 那一半是机械改调用点和 23 个测试，等 ② 的平台一半出来再做。
   - **C5**：U1 已答（10-21，开放给所有插件），顺序不变。接口与分工已定（§5 C5「接口定形」）：② 开 C5 分支写平台一半，③ 在它上面补一个提交；排在 C4 之后、C7 之前。
   - **C7、C8、C9**：等视觉线整条合进 main，C8 还要等 ② 的执行方设计。
2. **③ 在插件这一半自己裁的**（按防腐后果）：
   - **T4**：C3 新增一个 Coding 的查询动作，只给插件用，不带 mcp。不升 `coding.artifacts.preview`，现有 id 都不动，U2 不会触发。
   - **T6**：Git 还在 HYBRID 期间，`gitPorts` 的观察者留着，归 Git 自己的迁移。C6 只删 Coding 和 Files 那部分。
   - **T8**：`CodingChangeSet` 和 `CODING_*_EVENT` 不并进本计划，归 PG-111。
3. **交 ① 定的**：
   - **T1**：`assistant-coding.ts` 是不是完成标准的硬条件，也就是 C8 的设计如果晚于 C9，Coding 能不能先离开 HYBRID、这个文件留着另记。
4. **交 ② 定的**：
   - **T2**：模型列表用的窄权限。
   - **T3**：公开包放在哪里。
   - **T5**：分发文件叫什么、放在哪里。
   - **T7**：`ready` 改去哪里。
   - 以及平台一半的清单（§5 末尾）。
5. **验收编号**：用 `W5-01-CODING-NN`。每片开工时先查 spec 里已有的最大号，再往后接，不照搬 §5 里预留的号段。
6. **枢纽文件**：C1、C2、C3、C6、C9 都改 `project-plugins.ts`，所以一次只开一片，每片交 ⑤ 之前先 merge main。
7. **§4 冲突表补一行**：Shelf S1 已经开成 #892（head 94129f0f1，base main）。它在 `project-plugins.ts:144-148` 把 Shelf 的 `receive` 改成 `openHostShelfStore` 加 await，别的地方没有碰 Coding。

## 0. 结论

- 完成标准（§1）要 9 片。平台一半（②）和插件一半（③）分开，顺序按「数据、宿主适配、端口、路由，界面打包放最后」排：
  - C1 数据：会话库走 `services.project_database`（V-14）。
  - C2 输入端口：模型、角色、目标标题（PG-047、V-13、PG-086、PG-091）。
  - C3 成果交界：Shelf 与 Coding 的成果引用，删 `coding-shelf-material.ts`（PG-090）。
  - C4 后台作业与首页聚合，删 `coding-background-tasks.ts`（PG-038、PG-043）。
  - C5 审查种类（PG-009，先弹窗）。
  - C6 项目 Runtime 起停与分发（PG-037，含 Files、Git 的手写端口）。
  - C7 结果装饰（PG-062）。
  - C8 助理执行方，删 `assistant-coding.ts`（PG-036 的 W5-10 一半）。
  - C9 界面挂载、打包、收口：PG-060 的 Coding 行、PG-070、PG-072，删 `coding-surface.ts`，HYBRID 名单去掉 coding。
- 最大风险有两处，都在平台一半还没有设计：
  1. C8：main 上没有「助理按动作和消费场景选执行方」的设计。`scenes.tsv` 里 Coding 的消费场景为 0 行，`docs/system/HUGE-CLASS-MIGRATION.md` 的 W5-10 说的是拆助理的巨大单元，不是执行方选择。`assistant-coding.ts` 能不能删，取决于 ② 先出这份设计。
  2. C9：`coding-surface.ts` 剩下的部分（Coding 面板、伙伴页舞台）要靠 W5-06（PG-060）的 Manifest `views` 挂载通道才删得掉，通道还没有。
- 门禁的耦合要先知道（§1）：`tests/builtin-plugin-assembly-gate.test.ts:143` 用 `deepEqual` 比 HYBRID 名单和磁盘，所以「删最后一个 `coding-*.ts`」和「HYBRID 名单去掉 coding」必须在同一个 PR。按本计划，这个 PR 是 C9。
- 用户必问 1 项（PG-009），条件触发 4 项（§6）。还有 8 个要 ①/② 裁的技术问题（§6 后半）。

## 1. 完成标准

Coding 离开 `HYBRID_RUNTIME_PLUGINS`（`tests/builtin-plugin-assembly-gate.test.ts:128`，现为 `["characters","coding","git","shelf"]`），并满足：

1. 四个宿主文件没有了：`apps/local-host/src/coding-surface.ts`（501 行）、`coding-background-tasks.ts`（66 行）、`coding-shelf-material.ts`（30 行）、`apps/local-host/src/assistant/assistant-coding.ts`（113 行）。
2. `apps/local-host/src/characters-host.ts:70-86`（`codingCharacterPorts`）没有 Coding 的端口。
3. `apps/local-host/src/project-plugins.ts` 里 Coding 一族的手写端口没有了：`codingPorts`（`:150-168`）、`shelfPorts` 里 Coding 的那部分（`:138-149`）、`filesPorts`/`gitPorts` 与观察者（`:169-186`）。任务书写的 `:139-204` 在 main 上是 `:133-186`，入口在 `:187-231`。入口里的 `createCodingPlugin()` 是监督器的合法装配，留着。
4. Coding 只靠 Manifest 声明和平台服务：没有按插件 id 字面量、按 producer 过滤、直接拿原始库的宿主代码。
5. 「Coding 一族」= Coding、Git、Files、Diff、Text Stats（PG-091 行）。Git 做完本计划后仍在 HYBRID：`git-operation-notifications.ts`、`git-operations.ts`、`git-status.ts`、`git-worktrees.ts`、`git-writer-integration.ts` 五个宿主文件在，那是 Git 自己的迁移（PG-099、PG-111），不在本计划。

门禁怎么动（`scripts/gates/assembly.mjs`，口径读自脚本头注释；真实数字没有跑出来，见 §7）：

| 指标 | 今天 | 本计划里怎么动 |
| --- | --- | --- |
| `hybridPlugins#coding#host-files`（宿主文件名以 `coding-` 开头或等于 `coding.ts`） | 3：`coding-background-tasks.ts`、`coding-shelf-material.ts`、`coding-surface.ts` | C3 后 2，C4 后 1，C9 后 0 |
| `hybridPlugins#coding#host-providers`（`registerProvider(coding…Provider(`） | 0（`apps/local-host/src` 里没有这样的行） | 不动 |
| `hostPluginFiles`（`coding-actions.ts`、`coding-native-plugin-http.ts`） | Coding 没有这两类文件 | 不动 |
| `registerProviderSites` | Coding 没有 `registerProvider(coding…)` 行 | 不动（这一项 Coding 没有可降的） |
| `pluginOutsideMentions[coding]`（包外点名 `@molis-ai/molis-work-plugin-coding` 的文件） | 我手数：非测试文件 19 个（含 lockfile 与 2 份 spec，门禁口径未核） | 见下 |
| `assistant/assistant-coding.ts` | 文件名不以 `coding-` 开头，HYBRID 门禁不数它 | 门禁管不到，靠本计划的验收和一条新测试（C8） |

`pluginOutsideMentions[coding]` 的 19 个文件，各在哪一片消失：`characters-host.ts`（C2）、`coding-shelf-material.ts`（C3）、`web-catalog.ts`（C4）、`coding-surface.ts`（C9）、`project-database-schema.ts`（#867，不是本计划）、`page-assets.ts`、`scripts/client/assistant-island.ts`、`scripts/client/initialization.ts`、`scripts/settings.ts`（C9）。会留下的：`project-plugins.ts`（监督器入口）、`builtin-plugins.ts`（生成）、`apps/local-host/package.json`、`apps/workbench/package.json`、根 `package.json`、`pnpm-lock.yaml`、`scripts/workspace-packages.mjs`、`git-worktrees.ts`（引用 Coding 的类型，归 Git 迁移，见 N-7）、2 份 spec。

## 2. 条目总表

先给一行一条的总表，每条的 file:line 与判断在后面的细节里。「归」= 这一条里谁做事：② 平台、③ 插件、拆 = 两边都有。

| 条目 | 现状一句话 | 目标 | 归 | 切片 | 要不要用户定 |
| --- | --- | --- | --- | --- | --- |
| PG-091 | 原始库句柄、目标标题直读 Goals、伙伴页在宿主拼、助理岛 import 代码高亮；producer 过滤那段已不在 main | 走服务、公开动作、Manifest `views`、公开包 | 拆 | C1 C2 C9 | 否 |
| PG-086 | Coding 读角色经 `codingCharacterPorts`，助理与 agent-host 也在用同一份 | 经 Characters 的公开动作 | ③（Characters 与 Coding 都是 ③ 的包） | C2 | 条件：授权要重新授予（U3） |
| PG-090 | Shelf 的项目成果由宿主列、宿主转 Markdown | Shelf 按声明取，Coding 自己出 Markdown 副本 | ③ | C3 | 条件：若升 `coding.artifacts.preview@2`（U2） |
| PG-037 | Coding 界面的 `ensureStarted` 拉起项目 Runtime，通用分发与重启钩子写在 Coding 名下 | 平台起停，分发与钩子挪进平台 | ② 做，③ 改测试与调用点 | C6 | 否 |
| PG-038 | Coding 的 `activations` 模块级表加 `setTimeout` | 声明后台作业，平台按项目停 | 拆 | C4 | 否 |
| PG-043 | 宿主逐个开项目库替 Coding 查后台任务 | 平台 Home 聚合，Coding 声明可聚合的查询动作 | 拆 | C4 | 否（新增动作 id，不带 mcp） |
| PG-047 | Coding 模型列表由宿主经端口注入，两份来源 | 走 `services.model` | 拆 | C2 | 条件：权限变动（U3） |
| PG-062 | 宿主在路由结果上替 Diff、Text Stats 补 html；脱敏、富文本住在 Feed | 插件自己出 html，脱敏与富文本进公开包 | 拆 | C7 | 否 |
| PG-009 | 审查服务按 `io.molis.work.git`、`io.molis.work.coding` 字面量放行 | 种类由 Manifest 声明，平台登记后放行 | ② 做，③ 声明 | C5 | 是（§5 第 4 条） |
| PG-036（W5-10 一半） | 助理里 37 处 `"coding"` 字面量与 `assistant-coding.ts` | 按动作和消费场景选执行方 | ② 设计与改，③ 执行 | C8 | 否；完成标准要不要等它（T1） |
| PG-070 | Coding 的样式进公共样式表，客户端发 `/assets/…`，4 个插件借用，页面启动按名接线 | 各插件自己打包，按需加载 | ② 通道，③ 迁 | C9 | 条件：体积涨超 10 KB 或新增资源（U4） |
| PG-072 | 设置节按贡献 id 分支拼，Coding 设置页的模型也由宿主拼 | 设置分区随插件声明 | ② 通道，③ 迁 | C9（C2 先去掉模型那半） | 否 |
| V-13 | 两份 Coding 模型列表口径不同 | 合成一份 | ② 立项，③ 执行 | C2 | 否 |
| V-14 | `CodingSessionStore` 直接写 SQL，不过 `beforeEffect()` | L2 的 `transaction(beforeEffect, write)` | ② 平台，③ 迁 | C1 | 否 |

### 2.1 PG-091 Coding 一族（privileges.md:280）

- 现状（main 上逐项核）：
  - 原始库句柄：`project-plugins.ts:156`（`new CodingSessionStore(ports.store.db)`）、`coding-surface.ts:120-121`（同样）、`coding-background-tasks.ts:44-50`（`LocalSqliteStorage(project.database_path, {readonly:true})`）。
  - 目标标题：`project-plugin-ports.ts:41` 与 `web-goals-read.ts:137` 都直读 `coordinator.goalQueries.getGoal`。
  - 伙伴页：Coding 包内的 `browser/workbench.ts` 已随 #826 搬完；宿主剩 `coding-surface.ts:482-501` 的 `codingCompanionStages`（`web-goals-read.ts:141` 在用）和 `:92-147` 的面板。
  - 代码高亮：`apps/workbench/src/scripts/client/assistant-island.ts:2` 从 Coding 包 import `codeLanguage`、`codeTokens`。
  - 行里写的「按 `io.molis.work.shelf` 过滤材料」（`project-plugins.ts:157`、`materials.ts:53`）在 main 上已经没有：#839 以后 `materials.ts:53` 读 `context.services.storage`，`project-plugins.ts:157` 是 `goalTitle`/`characters` 那一行。这一行文字过期了（N-6）。
- 目标：原始库换成 `services.project_database`（C1）；目标标题经 Goals 已公开的读动作（具体动作 id 开工时核，PG-006 正在改 Goals 读动作的信任口径，排在它后面或同批）；伙伴页走 W5-06 的 `views`（C9）；高亮挪到公开包（T3）。
- 归：拆。Coding 与宿主侧 ③，公开包与 `views` 通道 ②。
- 依赖：L2（C1）、W5-06（C9）、PG-006（C2 的目标标题）。
- 用户：否。

### 2.2 PG-086 角色（privileges.md:270）

- 现状：`characters-host.ts:70-86` 的 `codingCharacterPorts` 给 Coding 的 `resolve`、`list`；`project-plugins.ts:157` 注入。它还有别的消费者：`assistant/assistant-http.ts:22,129-130,173`（助理解析与列出角色）。`freezeProjectCharacter`（`characters-host.ts:51-68`）还被 `agent-host-composition.ts:17,400` 与 `assistant/assistant-connection-authority.ts:8,29` 用。所以去掉 Coding 的端口，同时要给助理和 agent-host 一条 Characters 自己的路径（N-4）。
- Characters 现有动作（`tooling/gates/actions/actions.tsv`）：`characters.list@1` 受众是 agent、mcp、user、workflow，没有 plugin；`characters.execution@1` 受众只有 user；只有 `characters.subject.read`、`characters.search.entries`、`characters.usages` 有 plugin。Coding 的 Manifest 没有消费任何 Characters 动作。
- 目标：Coding 经 Characters 的公开动作读角色；助理、agent-host 同样走 Characters 的路径，不再经 Coding 命名的端口。运行记录写进 Characters 自己的表那半（`character-native-execution.ts:7,62,82`、Sessions 的 work-session registry）属 Sessions 的迁移，本计划不碰。
- 做法：给 `characters.list`、`characters.execution` 加 `plugin` 受众（不改形状，不升版，不改 MCP 工具名；按 ① 10-20 的口径，PR 写「合同影响：已授权的要在设置页重新授权」），Coding 在 `capabilities.consumes` 里声明。`characters.execution` 返回冻结的角色执行内容（指令、工具），受众加到插件要有一条安全不变量说明谁能读：我的判断「需要一条」，由 ② 定。
- 归：③（Characters 是 ③ 的包，PG-086 的归属列也是 ③）。
- 用户：条件（U3）。

### 2.3 PG-090 的 Shelf/Coding 交界（privileges.md:279）

只做 Coding 的那半；Shelf 自己的事实、错误码、配方、`shelf-ai.ts` 的带图模型调用留在 Shelf 的迁移（S1～S4）。

- 现状：
  - `project-plugins.ts:138-149` 的 `shelfPorts`：`references` 列 Coding 的报告（成果）和 `coding.changeset.v1`（过程项），按 `producer_plugin_id === CODING_PLUGIN_ID` 过滤；`preview` 调 `codingShelfMaterial`；`receive` 是 Shelf 自己的 `openShelfStore(...).admit(...)`。
  - `coding-shelf-material.ts:5,12-14` 用 Coding 包的 `codingReportPreview`、`codingChangeSetPreview`，把 Coding 成果转成 Shelf 副本的 Markdown，并算 `source`、`fingerprint`。
  - Shelf 包里 `runtime-actions.ts:56-59` 写死 `["coding-report","coding-changeset"]` 两个端口名；Shelf 的 Manifest 已声明消费（`shelf/src/manifest.ts:40` 的 `default_source` 指向 Coding，`artifacts.consumes: coding.report.v1`，`process_items.consumes: coding.changeset.v1`）。
  - Coding 的 `coding.artifacts.preview@1`（`manifest.ts:83` 声明为 `coding.report.v1` 的预览动作）受众 user、workflow，没有 mcp；变更集是过程项，没有预览动作。
  - 同样的列表还给 Coding 自己：`project-plugins.ts:161-167` 的 `reportReferences`、`changeSetReferences`、`planReferences`，也按 producer 过滤。
- 目标：Shelf 经 `services.artifacts`、`services.processItems`（`packages/contracts/src/platform/plugin.ts:100-131`，main 上已有）列出、读取声明消费的类型；Coding 自己出「Shelf 副本的 Markdown」，Shelf 只管接收。Coding 自己的三份引用列表也走这两个服务。
- 要先核（C3 开工第一步）：`molis.artifacts.preview.v1` 的输出字段够不够 Shelf 生成副本正文。不够的话有两条路：给 `coding.artifacts.preview` 加输出（形状变化，升 @2，引用 id 会变，触发 U2）；或新增一个 Coding 的查询动作（受众只给 plugin，不带 mcp），不升版。后者不改任何现有 id，我倾向后者，但字段没核，不要当结论。
- 归：③（Shelf 与 Coding 都是 ③）。
- 依赖：不需要新的平台服务；Shelf S2 也会改 `shelfPorts`，C3 排在它前面或同批（Shelf S1 只改 Shelf 的 store，不碰这些行，最终 diff 未核）。
- 用户：条件（U2）。

### 2.4 PG-037 项目 Runtime 起停与分发（privileges.md:200）

- 现状：
  - `coding-surface.ts:5` 把 `ensureProjectPlugins` 别名成 `ensureStarted`，8 处调用：`:103,151,173,183,391,421,455,483`。
  - `project-plugins.ts:232-235`：`record.running = report.running.includes(CODING_PLUGIN_ID)`，`record.error = … plugin_id === CODING_PLUGIN_ID`；`:243` 报「Coding 启动失败」。
  - 通用分发 `handleCodingPluginHttp`（`coding-surface.ts:178-216`）、路由钩子 `projectRouteHooks`（`:222-244`）、事件 `pluginEventsPending`（`:172`），都在 Coding 名下。导入者：`index.ts:218-225`、`web-goals-read.ts:21-25`、`web-project-platform-routes.ts:18`、`web-project-context.ts:10`、`web-request.ts:42`、`plugin-builder-surface.ts:5`。
  - `ensureProjectPlugins`（`project-plugins.ts:88-107`）允许入口晚到的端口并进已启动的实例（`:95-98`，键为 `execution`、`characterSpawn`、`characterWorkspaces`、`workspaces`、`routePrefix`、`observeGitOperations`），所以 `execution` 可以在无头发现之后才到；端口换成平台服务以后这套后绑定也跟着没有。
  - 动作路径已经会起平台：`project-plugin-ports.ts:36-50` 的 `ensureProjectPluginActions`（`project-host.ts:346` 调），所以 PG-037 只是界面路径的问题。
  - 测试：23 个文件引用 `coding-surface`（列表见 N-1），加 `tests/fixtures/coding-surface.ts`，其中 `tests/plugin-route-operations.test.ts:123` 读源文件本身。
- 目标：项目 Runtime 随项目打开由平台起停；分发和重启钩子进平台，名字与哪个插件无关。`running`、`error` 不再取自 Coding。
- 归：② 做平台一半，③ 改调用点与 23 个测试（机械）。
- 依赖：不依赖 L2 与 C1～C4。队列笔记第 3 条说过 L2 做完前它可以先从 main 开，开之前先核：和视觉线只有 `coding-surface.ts` 的重叠，而 #884 改的是 `decorateCodingResult`（PG-062 那一段），不是分发那一段，可以先走。
- 用户：否。

### 2.5 PG-038 后台作业（privileges.md:201）

- 现状：Coding 用模块级 `activations` Map 加 `setTimeout`/AbortController（`plugins/native/coding/src/route-activation.ts:38-60`），唤醒循环在 `wake-loop.ts:102-125`。#776 已把循环挪进激活上下文（`f739c46af`）。平台的 `plugin-background-service.ts`（#742）只给声明 `background_job` 的宿主运行定义，没有按项目停。
- 目标：Coding 在 Manifest 声明后台作业，平台按项目停；删模块级表。
- 归：拆。② 补按项目停，③ 迁 Coding。
- 用户：否。

### 2.6 PG-043 首页聚合（privileges.md:206）

- 现状：`coding-background-tasks.ts:44-50` 逐个只读打开项目库；`web-catalog.ts:33,45,55`（行里写的 `:36,58` 已过期）`homeBackgroundTasks = … holdsCodingSessions(db) ? listCodingBackgroundSessions(db) : []`；`index.ts:282` 导出；读函数在 `plugins/native/coding/src/store.ts:264,268`；工作台 `attention.ts:28,57,68` 写死 `openPlugin=coding` 和 Coding 的停止路由 `/api/plugins/io.molis.work.coding/sessions/…/background/…/stop`。测试 `tests/coding-background-tasks.test.ts` 在 CI 子集里。
- 目标：平台提供 Home 聚合，Coding 声明一个可聚合的查询动作，平台逐项目调用再合并。
- 归：拆。② 的聚合设计（privileges §8 T0 已核设计，实现没有开始，未核进度）；③ 声明动作、删宿主文件、改工作台。
- 合同影响：新增一个动作 id，不改现有 id；受众不带 mcp，所以不新增 MCP 工具。停止路由不变。
- 依赖：C1（读函数要改成走只读连接）。
- 用户：否。

### 2.7 PG-047 模型（privileges.md:215）

- 现状：Coding 的 `CodingExecutionPorts` 有 `ready`、`models`（`plugins/native/coding/src/routes.ts:24-34`），使用处 `routes-sessions.ts:76,326`、`start-round.ts:116`、`route-entry.ts:30`、`route-activation.ts:80`。宿主两处注入：`project-plugins.ts:150-155`，来源 `project-plugin-ports.ts:48-49`（`configuredModelChoices`）和 `web-project-context.ts:71-78`（按 provider 健康与 `enabled` 过滤）。
- 目标：模型列表走 `services.model`（`packages/contracts/src/platform/plugin-model.ts` 的 `choices()`、`availability()`）。
- 两处要 ② 先答：
  1. `services.model` 的注释写明「只在声明 `model:invoke` 且 `scheduling: "concurrent"` 的本插件动作里可用」。Coding 只要列表、选择，不需要发模型请求；让它声明 `model:invoke` 等于多给一个能发请求的权限。要不要先补一个只读的窄权限，② 定（T2）。这一项还决定了存量安装的授权要不要重新授予（U3）。
  2. `ready()` 是 Agent 宿主的就绪等待（`project-plugin-ports.ts:48` 的 `agents()!.ready`），main 上没有对应的平台服务（未核 `availability()` 是否覆盖）。要么 Agent 能力在宿主侧自己等，要么保留一个窄端口（T7）。
- 归：拆。
- 用户：条件（U3）。

### 2.8 V-13 两份模型列表（privileges.md:367）

- 现状核实：确是两份，口径不同：`web-project-context.ts:71-78` 按 provider 健康与 `enabled`，`project-plugin-ports.ts:48-49` 不按。`tests/coding-capabilities.test.ts` 测的是工作区能力，不比较两份列表，没有比较它们的测试（未核全仓）。
- 目标与做法：C2 把两份合成 `services.model` 一份，补一条测试断言宿主里没有第二个来源。
- 用户：否。

### 2.9 V-14 `CodingSessionStore` 与 `beforeEffect()`（privileges.md:368）

- 现状核实：`plugins/native/coding/src/store.ts`（307 行）里没有 `beforeEffect`；构造函数执行 `db.exec(CODING_SCHEMA_SQL)`（#867 改掉）；路由用 `beforeWrite` 守（`route-entry.ts`）。`tests/coding-effect-control.test.ts:20` 的 W2-18-CODING-EFFECT-01 只覆盖报告、变更集、计划三类输出 × 取消、撤权、替换，不覆盖会话、消息、运行的写入（其余测试是否覆盖：未核）。
- 目标：写入都经 L2 的 `transaction(beforeEffect, write)`；插件里手写的 `beforeWrite.assert_current()`（`action-cards.ts`，② 在 #776 备注里说私有存储下已冗余）删掉。
- 归：② 平台，③ 迁。
- 用户：否。

### 2.10 PG-062 结果装饰（privileges.md:235）

- 现状：`coding-surface.ts:246-259` 的 `decorateRuntimeResult` 替 Diff、Text Stats 补 `renderDiff`、`renderTextStats` 的 html；`:276-342` 的 `decorateCodingResult` import Feed 的 `renderFeedRichText`；`:266` 的 `codingNextSteps` 只有测试在用。桌面壳 `apps/desktop/src/advance-prompt.ts:1,14` 也借用 Feed 的脱敏与渲染。
- 目标：插件自己出 html（SDK 部件）；脱敏与富文本进平台公开包，桌面壳也改走公开包。
- 归：拆。② 出公开包，③ 把 Diff、Text Stats、Coding 的 html 放回各自路由。
- 冲突：#884 改了 `decorateCodingResult` 的一处（`+2-1`）和 Diff 的 `ui.ts`、`styles.ts`，见 §4。
- 用户：否。

### 2.11 PG-009 审查种类（privileges.md:134）

- 现状：`horizontal/agent-host/src/reviews.ts:113-121` 的人工检查写死 `plugin_id === "io.molis.work.git"`（git-index、git-operation）与 `"io.molis.work.coding"`（git-integration、git-worktree）；`adapters/prologue-git.ts:45` 写死插件 id 映射；`agent-host-composition.ts:269` 的 `session.owner.plugin_id !== "io.molis.work.coding"`；工作台 `apps/workbench/src/agent-review-surface.ts:239` 也有同样的字面量（这一处行里没点名，见 N-8）。
- 目标：审查种类由 Manifest 声明，平台登记后按授权放行。
- 归：② 做平台（改 contracts 的 Manifest 形状和 SDK，共享核心，`pnpm api:update`），③ 在 Coding、Git 的 Manifest 里声明。
- 用户：是，已答（10-21）：开放给所有插件，按 Manifest 声明与安装授权放行，每次审查仍由人批（见 §6 U1、§5 C5）。

### 2.12 PG-036 的 W5-10 一半（privileges.md:191）

- 现状：#845 已经把助理的页面规则改成按页面 id。`assistant-service.ts` 里 `"coding"` 字面量 37 处（行里写 31 处，我数的是 `grep -c '"coding"'`：`kind === "coding"` 15 处、`kind !== "coding"` 4 处、`kind: "coding"` 5 处、`executor === "coding"` 3 处，其余是别的写法），另有 `assistant-delegation.ts:293`、`assistant-inputs.ts:56`、`assistant-offers.ts:116`、`assistant-reask.ts:21`、`assistant-work-control.ts:21`、`assistant-view-html.ts:47`、`assistant-wait.ts:67`、`assistant-store.ts:110`。`assistant-coding.ts` 已经只通过 Coding 自己的动作驱动 Coding（`coding.state`、`sessions.create/read/update`、`runs.start`、`runs.control@7`，版本钉在 `VERSIONS`）。契约 `packages/contracts/src/services/assistant.ts` 有 15 处提到 coding。
- 目标：助理按动作和消费场景选执行方；`assistant-coding.ts` 删掉。
- 归：② 先出设计并改助理，③ 执行 Coding 一半（在 Manifest 声明消费场景）。
- 未设计：`tooling/gates/actions/scenes.tsv` 里 Coding 0 行；W5-10 在 main 的文档里是拆巨大单元（`docs/system/HUGE-CLASS-MIGRATION.md:47-56`，助理是第 1 批，「最后搬成独立包」），没有执行方选择的设计。
- 用户：否；完成标准要不要等它是 ① 的事（T1）。

### 2.13 PG-070 界面打包（privileges.md:248）

- 现状：Coding 的 `registration.ts` 有 `workbench: { order:20, contributions:[codingSettingsContribution], clientFactory: CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT, clientUses:["git","files"] }`，没有 `stylesheet`；宿主侧 `apps/workbench/src/page-assets.ts:7,15`、`scripts/client/initialization.ts:1,125`、`scripts/settings.ts:6,114`、`scripts/client/assistant-island.ts:2` 点名 Coding 包；样式在 `styles/coding-companions.ts`、`styles/settings.ts:518-521`。
- 目标：PR-2 改登记路径，W5-04 让各插件自己打包客户端和样式，按需加载，体积照 page-assets 规则。
- 归：② 通道，③ 迁。
- 用户：条件（U4）。

### 2.14 PG-072 设置节（privileges.md:250）

- 现状：`web-catalog.ts:249,278-301,394`；`apps/workbench/src/settings-sections.ts:27-39`；`plugin-settings-catalog.ts:8,20-28`（`:23` 有 `"coding-settings": "code"`）。Coding 设置页的模型那半由 C2 去掉（`web-project-context.ts` 的 `projectCodingServices`）。
- 目标：PR-3、X-2 让设置分区随插件声明。
- 归：② 通道，③ 迁 Coding 的设置。
- 用户：否。

## 3. 新发现

条目没覆盖、但 Coding 一族在宿主或工作台里被点名的地方。N-6 是文档过期，其余是代码。

| 编号 | 位置 | 说明 | 归到哪片 |
| --- | --- | --- | --- |
| N-1 | `coding-surface.ts` 全文件 | 501 行里大半是通用的项目插件平台代码，叫了 Coding 的名字：分发 `:178-216`、钩子 `:222-244`、`readsFilesOutputs` `:164-169`、`pluginEventsPending` `:172`、`failedStage` `:476`、8 处 `ensureStarted`。PG-037 只写了 `:173-232`。23 个测试引用它：`tests/coding-{action-cards,changeset-http,characters-http,cooperation-http,goal-context-http,history-summary-http,materials-http,message-wait,next-steps,plan-amend-http,plans-http,queued-round,report-persistence,session-follow,session-recovery,state-coalesce,subagents-http,surface,writer-assignments-http}`、`plugin-route-operations`、`plugin-upgrades`、`runtime-plugin-http-discovery`、`workspace-production-events` | C6 |
| N-2 | `coding-surface.ts:150-160` | `charactersWorkbenchPanel`：Characters 的舞台也在 Coding 的文件里拼 | C9 |
| N-3 | `web-project-context.ts:34,39,62-82`、`web-request.ts:150-153`、`web-project-platform-routes.ts:100-111`、`web-goals-read.ts:112` | 通用的项目插件服务带着 `codingServices`/`ProjectCodingServices` 的名字，第二份模型列表就藏在这里（V-13 的来源） | C2 |
| N-4 | `assistant/assistant-http.ts:22,129-130,173`、`agent-host-composition.ts:17,400`、`assistant/assistant-connection-authority.ts:8,29` | 助理和 agent-host 也靠 `codingCharacterPorts`/`freezeProjectCharacter`，PG-086 比「Coding 读角色」宽 | C2 |
| N-5 | `coding-surface.ts:482-501`、`web-goals-read.ts:141,147` | `codingCompanionStages` 在宿主里手拼 Files、Git、Diff、Text Stats 的舞台；`:147` 对 `projectConfiguration.plugins.includes("coding")` 再取 `codingWorkbenchPanel` | C9 |
| N-6 | privileges.md PG-091、PG-043 行 | PG-091 行的 `io.molis.work.shelf` 过滤、`coding-setup.ts:1-55`、`project-plugins.ts:148-169(:157)` 都已过期（#839、#826）；PG-043 行的 `web-catalog.ts:36,58` 现为 `:45,55`。⑤ 已提过 `coding-setup.ts` 那处 | 随 C1 的 PR 改文档 |
| N-7 | `git-worktrees.ts:7`、`packages/contracts/src/modules/workspace-artifacts.ts:685-756` | Git 的宿主文件 import Coding 包的 `WriterFileTarget`、`WriterWorktree`；`CodingChangeSet` 类型与解析在 contracts。归 Git 迁移与 PG-111，不进本计划；它们会让 `pluginOutsideMentions[coding]` 留 1 | Git 迁移 |
| N-8 | `agent-host-composition.ts:269`、`apps/workbench/src/agent-review-surface.ts:239` | PG-009 行点名了前者的文件、没点名行；后者（工作台）没点名 | C5 |
| N-9 | `apps/workbench/src/scripts/client/attention.ts:28,57,68` | 注意力区写死 `openPlugin=coding` 和 Coding 的停止路由 | C4 |
| N-10 | `assistant-island.ts:2` | 助理岛 import 代码高亮，同一个文件被视觉线 10 个 PR 改（§4） | C9 |
| N-11 | `scripts/client/global-search.ts:31`（`SEARCH_ITEM_TAB_SURFACES`）、`immersive-shell.ts:99`、`styles/coding-companions.ts` | 工作台里还有点名 Coding 的表，归属没有定，不在任何条目 | C9（归 PG-060/070，要 ② 认） |
| N-12 | `horizontal/agent-host/src/adapters/prologue-run.ts:222-240,587`、`prologue-taskboard.ts:25`（`codingExecutionRules`）、`prologue-after-write.ts`、`prologue-plan-steps.ts`、`prologue-session-index.ts:62-83` | agent-host 的适配器带 Coding 语义。我只数了提及，没读它是不是插件 id 字面量；`io.molis.work.coding` 字面量在 agent-host 里只有 `reviews.ts:116-118` 与 `prologue-git.ts:45` | 未核，不进切片，交 ② 判断 |
| N-13 | `packages/contracts/src/modules/workspace-artifacts.ts:674-679`、`platform/dom-events.ts:121-123,214` | Coding 的事件 id（`io.molis.work.coding.run-updated` 等）在 contracts 里；这是公开名字，本计划不改，位置归 PG-111 | 不动 |
| N-14 | `project-plugins.ts:169-186` | `filesPorts`、`gitPorts` 和观察者 `record.updateObservers/stopObservers` 也是 Coding 一族的手写端口，条目里没有人认领。Git 仍留在 HYBRID，这些端口能不能全删取决于平台有没有「工作区变了」「工作树变了」的事件（未核） | C6（部分） |
| N-15 | `plugins/native/coding/src/index.ts` | 导出 `CodingSessionStore`、`CODING_SCHEMA_SQL`、`holdsCodingSessions`、`listCodingBackgroundSessions`、`toDirectoryEntries` 等给宿主用；这些导出是宿主依赖 Coding 实现的入口，随各片删 | C1 C4 |
| N-16 | `tests/coding-background-tasks.test.ts`（在 `tests/ci-product-subset.txt`）、`tests/assistant-coding-executor.test.ts`（在 CI 子集，引 dist） | 两个在 CI 子集里的用例对应要删的宿主文件；改名或删除要在同一个 PR 里改清单 | C4 C8 |
| N-17 | 死代码候选 | `filesDirectoryPanel`、`gitDirectoryPanel`、`diffStagePanel`（`coding-surface.ts:388-473`）、`codingDirectoryPanel`（`:92`）没有生产调用者，`codingNextSteps` 只有测试调用。删之前要再 grep 确认 | C6 先删 |
| N-18 | 独立事项 | BL-371（运行时能力矩阵有「会话间发信」后，删 Coding `delegation-dispatch` 里按 `agent.capability_unavailable` 拒绝的分支）归 ②，③ 执行，不在本计划的切片里 | 独立 |

## 4. 在途冲突表

数据来源：`gh api repos/…/pulls/<n>/files`，只列相关文件。#851 与视觉线（#861 起的 15 个 PR）归 Codex（yijunw0212 的统筹 Codex）合并，#867、#881 归 ⑤，#853 现在也由那个统筹 Codex 合，开发负责人仍是 ③。

视觉线链：#861 ← #864 ← #866 ← #868 ← #869 ← #871 ← #873 ← #874 ← #876 ← #880 ← #884 ← #885 ← #886 ← #888 ← #890，最后 #851 → main。

| PR | 改了的相关文件 | 谁合 | 撞哪一片 | 建议 |
| --- | --- | --- | --- | --- |
| #867 项目库 L1b | `project-plugins.ts`（+3-2，`withoutRefusedPlugins` 包住入口）；`coding/src/database.ts`（新）、`index.ts`（去掉 `CODING_SCHEMA_SQL` 导出）、`manifest.ts`（+`databases.project`）、`store.ts`（构造不再建表，外键指 `project_root`）；`project-database-schema.ts`；`privileges.md`（+2-2）、`spec.md`；3 个 Coding 测试 | ⑤ | C1（直接前提）、N-6 的文档 | C1 等它合入后从 main 开 |
| #881 S8 Goals（叠在 #867） | `tests/coding-goal-context-http.test.ts`（+1-1）；`initialization.ts`（+1-1）；`privileges.md`（+3-3） | ⑤ | C1（测试一行）、C2（目标标题要用 Goals 的读动作，v2 动作版本变了）、C9（`initialization.ts`） | 排在它之后；C2 开工时核 Goals 读动作版本 |
| #851 `feature/visual-ux` → main（161 个文件） | `project-plugins.ts`（+5，在 `homeLibraryPlugins()` 加 Workflows）；`tests/builtin-plugin-assembly-gate.test.ts`（+3-2）；`web-project-platform-routes.ts`（-8）、`web-request.ts`（+1-2）；`assistant-island.ts`（+5-11）；`coding/src/client.ts`、`timeline.ts`、`files/src/client.ts`（各 +1-1）；`page-assets.mjs/.json`；`SSOT-MATRIX.md`；`spec.md`（+30-3） | Codex | C6（那两个路由文件）、C9（枢纽文件、`assistant-island.ts`、page-assets）；所有碰枢纽的片 | C6、C9 排在它合入之后；其余片的枢纽改动只有一两行，冲突在 `project-plugins.ts`，merge main 解决 |
| #853 Workflows 迁 Runtime | `project-plugins.ts`（+5，与 #851 同一行）；`web-project-platform-routes.ts`（-8）、`web-request.ts`；枢纽四件套 | Codex 统筹（排在 #848 之后） | 同 #851 | 与 #851 重叠的几行谁先合谁定，后到的 merge |
| #864 | `coding/src/client.ts`（+17-22）、`index.ts`（-9）、`reading.ts`（-63）；`assistant-island.ts`；`page-assets` | Codex | C1（`index.ts` 的导出行）、C9 | 不碰 `client.ts`；`index.ts` 导出在 C1 同一处，C1 合并前重取 |
| #873（CONFLICTING） | `assistant-coding.ts`（+8，新增 `workspace()`）；`assistant-http.ts`（+10-7）；`assistant-surroundings.ts`（+106）；契约 `services/assistant.ts`（+37）；`assistant-island.ts` | Codex | C8、C2（`assistant-http.ts` 里的角色路径） | C8、C2 对助理的改动排在 #873、#874、#876 之后 |
| #874 | `assistant-service.ts`（+2-2）、`assistant-work-view.ts`；`services/assistant.ts`（+6）；`assistant-island.ts` | Codex | C8 | 同上 |
| #876 | `assistant-coding.ts`（+10-6，`workspace()` 换成 `setup()`，返回工作区加 MCP `chosen`/`servers`）；`assistant-surroundings.ts` | Codex | C8 | 同上；注意它让 `assistant-coding.ts` 多了 MCP 选择，C8 的 Coding 一半要把这件事一并带走 |
| #884 | `coding-surface.ts`（+2-1，`decorateCodingResult` 的 `renderDiff` 调用）；`coding/src/{changeset-client,client,styles,ui}.ts`；`diff/src/{styles,ui}.ts`（+18-7、+59-18）；`tests/coding-changeset-http.test.ts`、`coding-session-first-read.e2e.test.ts`（+2-101）、`tests/fixtures/coding-browser.ts`（新） | Codex | C7（直接撞）、C9 | C7 排在它合入 main 之后；C6 只搬分发那段，不动 `decorateCodingResult`，可以并行 |
| #888、#890 | `coding/src/client.ts`（+3-3、+5-6）；`tests/coding-question-card.e2e.test.ts`；`assistant-island.ts`（#888） | Codex | C9 | C9 之前不碰 `client.ts` |
| #861、#868、#869、#871 | 只在相关文件里有 `assistant-island.ts` 和 `page-assets.mjs/.json` | Codex | C9 | 同上 |
| #866、#880、#885、#886 | 相关文件里只有 `page-assets.mjs/.json`（#866 另改 `shelf/src/client.ts`） | Codex | C9（page-assets 数字） | 链整体合入后，C9 在合入后的 main 上重算体积 |
| #848、#883、#784、#734 | 相关文件里没有改动（#848 仅 `spec.md` 一行） | — | 无 | 无 |
| #891 双实例声明 | 未核：只在队列笔记里看到它改 contracts 与 plugin-runtime | ⑤ | 不撞 Coding 的文件（未核） | 开 C1 前看一眼 |
| Shelf S1 #892（head 94129f0f1） | `project-plugins.ts:144-148`（Shelf 的 `receive` 改成 `openHostShelfStore` 加 await），`shelf-actions.ts`，`modules/shelf`，`plugins/native/shelf` | ⑤ | C3（`shelfPorts` 相邻行） | C3 在 #892 合入后从 main 开，在 Shelf S2 之前 |

## 5. 切片

顺序：数据、宿主适配、端口、路由；界面打包最后。碰 Coding 内部最多的先走，因为用户后面几个 Coding 需求要在上面做：C1、C2 改的是 `store.ts`、`routes.ts`、`start-round.ts`，是用户后续需求最会碰的几个文件，所以放最前。

平台一半独立于 ③ 的顺序：C4、C5、C6、C7、C9 的平台部分（PG-038/043、PG-009、PG-037、公开包、W5-06/04）可以由 ② 随时开，不用等 ③ 前面的片；只有 ③ 的那一半按下面的顺序走。

### C1 数据：会话库走 `services.project_database`

- 状态（10-21）：已开 #932，head ddc13cd4f 移交 ⑤。实际做法与计划不同的三处：`action-cards.ts` 的 `assert_current()` 保留（它守私有存储的 `compareAndSet`，不是库事务）；`CodingSessionStore`、`toDirectoryEntries` 导出保留（测试与 C4 要用），N-15 只做了一半；目录面板改由 Coding 自己的 view（`codingUiView`）渲染时读库，不走 `coding.state@1`。和 #926 重叠 19 个文件，谁后合谁 merge。

- 范围：V-14；PG-091 的原始库句柄；顺带 N-15 里 `CodingSessionStore`、`CODING_SCHEMA_SQL` 的导出；`action-cards.ts` 的冗余 `beforeWrite.assert_current()`；privileges 过期行（N-6）。
- 主要文件：插件 `store.ts`、`routes.ts:24-34`、`routes-sessions.ts`、`start-round.ts`、`route-activation.ts`、`background-state.ts`、`action-cards.ts`、`index.ts`；宿主 `project-plugins.ts:156`、`coding-surface.ts:120-121`（面板改调 Coding 已有的读动作 `coding.state@1`（够不够用未核），不再自己 new store）；25 个测试文件构造 `CodingSessionStore`，27 个传 `goalTitle:`，大多机械。
- 平台前提（②）：#867 合入；L2 `services.project_database` 实现（读走只读连接，写走 `transaction(beforeEffect, write)`，EXPLAIN 操作码白名单；删宿主的 `ports.store.db` 路径）。L2 没落地前不开。
- 插件一半（③）：store 换成基于该服务；`CodingExecutionPorts.sessions` 删；补一条测试，把会话、消息、运行的写入也覆盖到「先过 `beforeEffect()` 才提交」（`tests/coding-effect-control.test.ts` 现在只覆盖三类输出写入）。
- 依赖：#867（必须），L2（必须），#881 同批最好。
- 合同变化：无动作、无 schema 形状变化，不升版，不 `pnpm actions:update`。表结构由 #867 的 v8 维护处理，本片不改表。
- 枢纽文件：`project-plugins.ts` 删一行 `sessions:`；不碰 assembly 测试、§5.1、SSOT。
- 体量：中。
- 验收号：`W5-01-CODING-NN`，本片取 01～09（写进 `specs/repository-anti-corruption/spec.md` 里 W5-01-* 同类段；开工时查已有最大号，别沿用我给的段）。
- 安全不变量：L2 本身「需要一条」（② 的，S 号由 ② 取）；Coding 一半不另加。V-14 靠那条的测试关闭。
- 降的门禁：本片不降 `host-files`、`registerProvider`；`pluginOutsideMentions` 随 #867 降（`project-database-schema.ts`）。

### C2 输入端口：模型、角色、目标标题

- 状态（10-21）：③ 已开工，分支 `migrate/coding-c2-inputs`，从 C1（#932）的分支 merge 开。本片只做 Coding 自己的输入：模型走 `model:read`，三处 `ready` 照 T7「10-21 补核」删，目标标题走 Goals 的公开读动作，角色走 `characters.list@1`、`characters.execution@1` 加 `plugin` 受众，再加 V-13、N-3。助理与 agent-host 那一半（N-4）拆成 **C2b**，排在 #873、#874、#876 合入之后，因为三者都在改 `assistant-http.ts`。C2b 之前，`codingCharacterPorts`、`freezeProjectCharacter` 留给助理和 agent-host 用。已开 **#938**（10-21，head c762a330f 已移交 ⑤，③ 不再往这个分支推；base 暂为 `migrate/coding-c1-database`，#932 合入后改成 main）。验收编号 W5-01-CODING-23..31。合同影响：两个 Characters 动作加 `plugin` 受众，Coding 新增必需权限 `model:read`。门禁脚本收紧了一条，`.goalQueries.` 任何入口都不许用。全量要和 #932 进同一个集成批次。留给 ② 两点：`characters.execution` 返回本机路径；`system-agent-service.ts:97-98` 的 dispose 不是幂等的。

- 范围：PG-047 的 Coding 部分、V-13、PG-086、PG-091 的目标标题；N-3、N-4。
- 主要文件：宿主 `project-plugins.ts:150-160`、`project-plugin-ports.ts:41,48-49`、`web-project-context.ts:62-82`、`web-request.ts:150-153`、`web-project-platform-routes.ts:100-111`、`web-goals-read.ts:112,137`、`characters-host.ts:51-86`、`assistant/assistant-http.ts`、`agent-host-composition.ts:17,400`、`assistant/assistant-connection-authority.ts`；插件 `routes.ts`、`routes-sessions.ts:76,326`、`start-round.ts:116-129`、`route-entry.ts:30`、`route-activation.ts:80`、Characters 的动作声明。
- 平台前提（②）：先答 T2（模型的窄权限）和 T7（`ready` 的去向）。`services.model` 本身 main 上已有。
- 插件一半（③）：Coding 的模型列表、目标标题、角色都改走服务和公开动作；助理、agent-host 改走 Characters 的路径；`CodingExecutionPorts` 去掉 `ready`、`models`、`goalTitle`、`characters`；`codingCharacterPorts` 删；`projectCodingServices` 的第二份模型列表删；补 V-13 的测试。
- 依赖：C1 之后（两片都改 `CodingExecutionPorts` 类型和 `start-round.ts`）；PG-006（Goals 读动作信任口径）；#873/#874/#876 对 `assistant-http.ts` 的改动之后；#881 的 Goals 读动作 v2。
- 合同变化：`characters.list@1`、`characters.execution@1` 加 `plugin` 受众，形状不变，不升版，不改 MCP 工具名；PR 写「合同影响：已授权的要在设置页重新授权」。受众列变了，要先 `pnpm build` 再 `pnpm actions:update`，提交 `tooling/gates/actions/`。Coding Manifest 的权限与 `capabilities.consumes` 变化（T2 定下来后）。
- 枢纽文件：`project-plugins.ts`（删 `codingPorts` 里 `ready/models/goalTitle/characters` 与注入），不碰 assembly 测试。
- 体量：中到大（助理与 agent-host 的替换是大头）。
- 验收号：`W5-01-CODING-NN`，取 10～19 段（同上，开工时再核）。
- 安全不变量：我的判断「需要一条」——插件能读冻结角色的执行内容，谁能读、读到什么，要有一条；② 定是否成立。
- 降的门禁：`pluginOutsideMentions[coding]` 降 1（`characters-host.ts`）；`host-files` 不动。

### C3 成果交界：Shelf 与 Coding 的成果引用

- **状态（10-21）**：PR #905，W5-01-CODING-01～14。T4 定为新增 plugin 受众查询 `coding.results.document@1`，定义放在合同包 `modules/coding`；`listConsumable` 能按声明消费的类型筛（已核）。Shelf 的写入口和带图调用留给 Shelf S2、PG-047。BL-375 归 ②。
- 范围：PG-090 的 Coding 部分；`reportReferences`、`changeSetReferences`、`planReferences` 三个端口；删 `coding-shelf-material.ts`。
- 主要文件：`project-plugins.ts:138-149,161-167`、`coding-shelf-material.ts`；Shelf `runtime-actions.ts:20-65`；Coding `manifest.ts:83` 与新增的 Markdown 副本动作；`tests/shelf-jelly-cognia-images-error-model.test.ts:360` 提到它。
- 平台前提：无新增（`services.artifacts`、`services.processItems` main 上已有）；`listConsumable` 能否按已声明的消费类型过滤，开工时核（未核）。
- 插件一半（③）：Coding 出 Shelf 副本的 Markdown（T4 定动作形状）；Shelf 列、读都走服务；删三个引用端口与 `coding-shelf-material.ts`。
- 依赖：不依赖 C1、C2，但排在 C2 后面以免同时改 `CodingExecutionPorts`；排在 Shelf S2 之前或同批。
- 合同变化：优先「新增查询动作」，现有 id 不动，要 `pnpm actions:update`；若选「`coding.artifacts.preview` 升 @2」就改了引用它的 id，触发 U2。
- 枢纽文件：`project-plugins.ts`（`shelfPorts` 删 Coding 的 `references`/`preview`，Shelf 自己的 `receive` 留给 Shelf 迁移）。
- 体量：小到中。
- 验收号：`W5-01-CODING-NN`，取 20～29 段。
- 安全不变量：判断「不需要」，沿用 `artifact:read` 与现有 Shelf 显式接收规则；② 若不同意再加。
- 降的门禁：`hybridPlugins#coding#host-files` 3→2；`pluginOutsideMentions[coding]` 降 1。

### C4 后台作业与首页聚合

- 范围：PG-038 的 Coding 部分、PG-043 的 Coding 部分、N-9、N-16；删 `coding-background-tasks.ts`。
- 主要文件：插件 `route-activation.ts`、`wake-loop.ts`、`background-state.ts`、`store.ts:264,268`；宿主 `coding-background-tasks.ts`、`web-catalog.ts:33,45,55`、`index.ts:282`；工作台 `attention.ts:28,57,68`；`tests/coding-background-tasks.test.ts`（CI 子集，要在同一个 PR 里改 `tests/ci-product-subset.txt`）。
- 平台前提（②）：`plugin-background-service.ts` 补按项目停（PG-038）；Home 聚合（PG-043，实现进度未核）。两者都没有之前不开 ③ 一半。
- 插件一半（③）：Coding 声明后台作业，删模块级 `activations`；声明一个可聚合的查询动作；宿主首页的后台任务改走聚合；工作台注意力区改成按声明读，不写死 `coding`。
- 依赖：C1（读函数改成走只读连接）；②的两项。
- 合同变化：新增一个动作 id，不带 mcp，现有 id 不动；`pnpm actions:update`。停止路由不变。
- 枢纽文件：不碰。
- 体量：大（平台），中（Coding 一半）。
- 验收号：`W5-01-CODING-NN`，取 30～39 段。
- 安全不变量：Home 聚合「需要一条」（逐项目、按各自授权调用，已停用或撤权的插件跳过）；② 的平台一半带来。
- 降的门禁：`host-files` 2→1；`pluginOutsideMentions[coding]` 降 1（`web-catalog.ts`）。

### C5 审查种类

- 范围：PG-009、N-8。
- U1 已答（10-21，用户选「开放给所有插件」）。① 定的写法：
  1. 四种审查（git-index、git-operation、git-integration、git-worktree）由插件在 Manifest 里声明。
  2. 按安装授权放行。宿主里不留只给内置插件的分支：`reviews.ts:113-121` 的插件 id 字面量、`adapters/prologue-git.ts:45` 的插件 id 映射、`agent-host-composition.ts:269` 的 `!== "io.molis.work.coding"`、`apps/workbench/src/agent-review-surface.ts:239` 的字面量都删掉。
  3. 每一次审查仍由人批准。声明和授权只决定插件能不能发起这一类审查，不替人批。
  4. 平台一半归 ②：声明的 schema、登记、授权检查。改 contracts 的 Manifest 形状与 SDK，属共享核心，要 `pnpm api:update`，进集成批。接口由 ③ 与 ② 约好。
  5. 插件一半归 ③：只改声明，再删宿主替它开的那条路。Coding 声明 git-integration、git-worktree。Git 声明 git-index、git-operation，而且必须在同一片里声明，否则字面量一删，Git 的审查就失效。
- 接口（② 10-21 定，详见 §6 末「② 的答复」C5 条）：
  - 审查种类走现有权限。Manifest 的 `permissions` 写 `review:<种类>`：Coding 写 `review:git-integration`、`review:git-worktree`，Git 写 `review:git-index`、`review:git-operation`。
  - 种类只认平台列表，列表放在 contracts，和 `AgentReviewKind` 在一处。
  - 装插件时的同意、`bundledGrants`、声明与授权的交集，都照现有权限走。Coding、Git 随宿主发布，必需权限每次启动补齐，U3 不触发。
  - `reviews.ts` 删掉四个按插件 id 放行的分支，改成「这次请求背后的安装持有 `review:<种类>`」。在发起审查的宿主入口按调用者现查。
  - ③ 的四点意见 ② 已答，都落在下面「接口定形」里。
- **接口定形（② 10-21，回 ③ 的提议；与 §6「② 的答复」C5 条一致，冲突以这里为准）：**
  - 写法：用权限 `review:<种类>`，写在 Manifest 的 `permissions` 里，不另开字段。
    - 理由：只有一套授权。安装同意、`bundledGrants`、声明与授权的交集、撤权、设置页的开关全是现成的，不写第二套。
  - 必需还是可选，由插件自己定。Coding、Git 写成必需：存量安装由 `bundledGrants` 补齐，U3 不触发。
  - 种类列表：contracts 里一个常量，放在 `services/agent-host-reviews.ts` 的 `AgentReviewKind` 旁边，列出四种。
    - SDK 的 Manifest 解析拒绝以 `review:` 开头、却不在列表里的权限。
    - 插件不能自造种类。
  - 判断：
    - 发起审查时，按会话的主人查。主人是会话开始时宿主签发的调用者记下的 `plugin_id` 和 `install_id`，不从输入读。
    - 查的是这份安装此刻是否持有 `review:<种类>`。
    - agent-host 不 import plugin-runtime：local-host 组合时注入一个检查函数，`reviews.ts` 只调它，不认插件 id。
    - 新错误码在 agent-host 自己的错误声明里，名字开工时定，写成 `agent.<原因>`。
  - 撤权：不主动取消待批的审查。批准时和执行前各再查一次，撤了就拒、不执行。与 S-15「每次写之前再查一次」一致。
  - 四处字面量：
    - `reviews.ts:113-118`：换成注入的检查。
    - `adapters/prologue-git.ts:45`（按种类推 `plugin_id`）：
      - 存下的审查在发起时记下 `plugin_id` 和 `install_id`，恢复时用记下的，不再推断。
      - 存量里没记这两项的待批审查按现行取值读不到，当作过期，不兜底推断。审查有时限 `APPROVAL_TTL`；这台机器没有真实 Home。
      - 开工核存储位置和时限长短。真要改存量，先写进 anti-corruption 的保留机制，并问用户。
    - `agent-host-composition.ts:269`（`!== "io.molis.work.coding"`）：改成会话主人必须是发起整合的那个插件（调用者的 `plugin_id`），且持有 `review:git-integration`。
    - `apps/workbench/src/agent-review-surface.ts:239`（修改意见框只给 Coding）：改成看这条审查是否属于一个轮次（`row.request.run`），不看插件。
      - 开工核：拒绝时带的理由交回轮次，这条路径对所有插件的轮次是否都通（未核）。
  - 测试：③ 的四条，加一条「平台列表以外的种类在 Manifest 解析时就拒」。
    - 编号用 C5 的 `W5-01-CODING-40`～`49` 段，安全不变量的号开 PR 时取。
  - 交付：一个 PR，平台一半和 Coding、Git 的 Manifest 声明一起合，否则字面量一删，Git 的审查就失效。
    - 分工（① 10-21 裁）：
      - ② 写平台一半：
        - contracts 的种类常量；
        - SDK 解析时拒绝不认识的 `review:` 种类；
        - local-host 注入的检查函数；
        - `reviews.ts:113-118`、`adapters/prologue-git.ts:45`；
        - 批准时和执行前各再查一次。
      - ③ 在 ② 的 C5 分支上补一个提交：
        - Coding、Git 两份 Manifest 的 `review:*` 权限行；
        - `agent-host-composition.ts:269`、`apps/workbench/src/agent-review-surface.ts:239`；
        - 动作快照核对。
      - ② 10-21 开了 C5 分支 `feat/review-kinds`（从 main `458b33059`，工作树 `.claude/worktrees/dual-instance-partial`）。② 推出平台一半、在这里写下 head 之后，③ 先 merge 分支最新再补提交，只用 merge。
      - **② 10-21 已推出：#949；③ 10-21 补完，head `a0c2b2d18`，两半齐了，交 ⑤。** ③ 补提交时注意：
        - 整合入口的处理器已经收到 `invocation`，`:270` 直接比 `invocation.plugin` 的 `plugin_id` 和 `install_id`。
        - `tests/writer-integration-host.test.ts` 已改成从一个持有 `review:git-integration` 的 `io.molis.work.coding` 安装调用（夹具 `tests/fixtures/review-plugins.ts`），会话主人记的是这份安装的真实 `install_id`，你改成两项一起比之后仍然成立。
        - `tests/coding-git-diff-product.test.ts` 现在按预期失败（403 `agent.review_not_permitted`），Git 的 Manifest 加上 `review:git-index` 后应转绿，补完请跑一遍。
        - 内置插件装的时候由 `bundledGrants` 授予 Manifest 声明的全部权限，存量安装升级时新声明的必需权限也会补上，不用另写迁移。
    - **③ 10-21 已补并推出**：#949 head `a0c2b2d18`（工作提交 8cdac5341，CI 拒绝测试 0bb899403，再 merge main b728d047f）。整合入口读、准备都按调用者的 `plugin_id` 与 `install_id` 比（`assertIntegrableSession`），没有插件调用者也拒；反馈框不看插件；验收 W5-01-CODING-46～48。
    - ③ 核过（10-21），与 ③ 的意见对得上。补一处细节：`:269` 比对调用者时，`plugin_id` 和 `install_id` 一起比。会话主人记了这两项，只比插件 id 会放过同一插件的另一份安装。撤权只在批准时和执行前查、不主动取消，③ 接受。
    - 共享核心，进批，`pnpm api:update`；动作快照按 ③ 写的核一遍。
- 主要文件：上面四处字面量；Coding、Git 的 Manifest；contracts 的 Manifest 形状与 SDK（②）。
- 依赖：② 的平台一半。顺序按 ②：单独一个 PR，排在 C4 之后、C7 之前（改共享核心，要进批）。
- 合同变化：Manifest 加字段（②，`api:update`，PR 写对插件作者的影响）。③ 那一半只改两个内置 Manifest 的声明，不涉及动作版本；`tooling/gates/actions/` 的动作快照不变，开工时跑 `pnpm actions:update` 核一遍。
- 枢纽文件：contracts 的 Manifest 子路径（共享核心）。
- 体量：中。
- 验收号：`W5-01-CODING-NN`，取 40～49 段。
- 安全不变量：开放版，新开一条，号码开 PR 时取 main 加在途 PR 的下一个空号。
  - 谁能声明：任何插件，在 Manifest 里声明。
  - 谁能发起：声明了这一类、并且这份安装的授权持有它的插件。身份从调用上下文来。
  - 每一次审查仍要人批准。
  - 拒绝测试（② 的四条加 ③ 的两条）：没声明的被拒；声明了没授权的被拒；撤权后发起被拒；平台列表以外的种类被拒；撤权后批准旧审查被拒、不执行；人没批的审查不执行。
- 降的门禁：三项门禁都不动。这片的收益是去掉字面量，不是门禁数字。

### C6 项目 Runtime 起停与分发

- 范围：PG-037；N-1、N-14、N-17。
- 主要文件：`project-plugins.ts:88-107,232-244`（及 `:169-186` 的 `filesPorts`、`gitPorts`、观察者）、`coding-surface.ts:5,103-483`、`web-project-platform-routes.ts:18,111`、`web-project-context.ts:10`、`web-request.ts:42`、`index.ts:218-225`、`web-goals-read.ts:21-25`、`plugin-builder-surface.ts:5`、`project-plugin-ports.ts:23-50`；23 个测试加 `tests/fixtures/coding-surface.ts`；`tests/plugin-route-operations.test.ts:123`（读源文件，要跟着路径改）。
- 平台前提（②）：项目 Runtime 随项目打开起停；通用分发和重启钩子进平台文件（名字 T5）；工作区变了、工作树变了的通知有平台出口（N-14，未核有没有）。
- 插件一半（③）：把 `coding-surface.ts` 里的通用部分搬走并改调用点；机械改 23 个测试；先删 N-17 的死代码；Files 的 `readable`、`onWorkspaceChanged`，Git 的 `onWorkingTreeChanged` 在平台有出口后删，Git 的 `observeOperationSettled` 观察者归 Git 迁移，可能留。
- 依赖：不依赖 C1～C5。#851、#853 改了 `web-project-platform-routes.ts` 与 `web-request.ts`，排在它们之后或 merge。不改 `decorateCodingResult`，所以不等 #884。
- 合同变化：无。
- 枢纽文件：`project-plugins.ts`；W5-02 PR-1 的 T1 冻过它（`w5-02-pr1-plan.md`，现状未核），开工前问 ②。
- 体量：大（文件多，但多为机械）。
- 验收号：`W5-01-CODING-NN`，取 50～59 段。
- 安全不变量：判断「不新增」，沿用 #812 的「网关只认宿主签发的插件调用者」；起停时机变成「项目打开即起」要 ② 看一眼（未核）。
- 降的门禁：`host-files` 不动（`coding-surface.ts` 还在，只是变小）；`pluginOutsideMentions` 暂不降。

### C7 结果装饰

- 范围：PG-062。
- 主要文件：`coding-surface.ts:246-259,266,276-342`；`apps/desktop/src/advance-prompt.ts:1,14`；Feed 的 `renderFeedRichText` 与脱敏；Diff `ui.ts`、Text Stats、Coding 各自的路由。
- 平台前提（②）：脱敏与富文本的公开包（T3）。
- 插件一半（③）：Diff、Text Stats、Coding 的路由结果自己带 html；删 `decorateRuntimeResult`、`decorateCodingResult`、`codingNextSteps`。
- 依赖：#884 合入 main 之后；视觉线对 Diff、Coding 样式和客户端的改动也要等。
- 合同变化：html 字段的形状不变是目标，但 `decorateRuntimeResult` 究竟写了哪些字段我没有逐个核（未核），开工第一步核；要是字段变了，动作输出形状变，按升版处理并回 ①。
- 枢纽文件：不碰。
- 体量：中。
- 验收号：`W5-01-CODING-NN`，取 60～69 段。
- 安全不变量：判断「不需要」（脱敏是搬位置，不放宽）；搬到公开包的那份要保留现有脱敏测试。
- 降的门禁：三项不动；降 Feed 包的包外点名（`coding-surface.ts`、`advance-prompt.ts` 两处，数字未核）。

### C8 助理执行方

- 范围：PG-036 的 W5-10 一半；删 `assistant-coding.ts`。
- 主要文件：`assistant/assistant-coding.ts` 加 5 个导入者（`assistant-error.ts:4`、`assistant-http.ts:20`、`assistant-material-scan.ts:2`、`assistant-service.ts:40`、`assistant-work-control.ts:4`），`assistant-service.ts` 的 37 处 `"coding"`，§2.12 列的另外 8 个站点，契约 `services/assistant.ts`；Coding 的 Manifest 里的消费场景声明；`tests/assistant-coding-executor.test.ts`（CI 子集）。
- 平台前提（②）：设计「助理按动作和消费场景选执行方」并先改助理；这份设计 main 上没有。
- 插件一半（③）：Coding 声明执行方的消费场景，并把 #876 带来的 MCP 选择一并放进声明。
- 依赖：②的设计；#873、#874、#876 合入之后；C2（`assistant-http.ts` 的角色路径）。
- 合同变化：契约 `services/assistant.ts` 里 `kind:"coding"` 的写法随设计变，`pnpm api:update`；Coding 的动作不升版。
- 枢纽文件：不碰。
- 体量：大。
- 验收号：`W5-01-CODING-NN`，取 70～79 段。
- 安全不变量：「需要一条」（判断；② 定），因为 `assistant-coding.ts` 有 `withPersonDispatchGuard`，换成声明后这道守卫要有明确归属。
- 降的门禁：门禁数不动（文件名不被 HYBRID 门禁数）。要加一条测试：宿主里没有名为 `assistant-coding.ts` 的文件、没有 `executor.kind === "coding"`。

### C9 界面挂载、打包、收口

- 范围：PG-060 的 Coding 行、PG-091 的伙伴页与高亮、PG-070、PG-072；N-2、N-5、N-10、N-11；收口。
- 主要文件：`coding-surface.ts` 剩下的部分（`codingWorkbenchPanel`、`codingCompanionStages`、`charactersWorkbenchPanel`、`readsFilesOutputs`）、`web-goals-read.ts:141,147`；`assistant-island.ts:2`；`page-assets.ts:7,15`、`initialization.ts:1,125`、`settings.ts:6,114`、`plugin-settings-catalog.ts:23`、`global-search.ts:31`、`immersive-shell.ts:99`、`styles/coding-companions.ts`、`styles/settings.ts:518-521`；Coding 的 `registration.ts`；`web-catalog.ts:249,278-301,394`；`apps/workbench/src/builtin-plugins.ts`（生成）。收口：`tests/builtin-plugin-assembly-gate.test.ts:128` 去掉 `coding`、§5.1 包清单行（`node scripts/gates/package-inventory.mjs --table`）、`SSOT-MATRIX.md`、privileges 各行、`specs/coding-plugin/spec.md` 的状态句。
- 平台前提（②）：W5-06 的 Manifest `views` 挂载通道；W5-04 的按需打包；PR-3、X-2 的设置分区。
- 插件一半（③）：Coding 面板和伙伴页改成 `views` 声明；删手写的 Coding 行；客户端和样式自己打包；高亮改走公开包（T3）；删 `coding-surface.ts`；HYBRID 名单去掉 coding（与最后一个 `coding-*.ts` 的删除在同一个 PR，assembly 测试要求）。
- 依赖：视觉线整条合入 main 之后（15 个 PR 里几乎都改 `page-assets.mjs/.json`，10 个改 `assistant-island.ts`，5 个改 Coding 的 `client.ts`）；#851、#853；②的三个通道。
- 合同变化：无动作变化。体积：每个资源涨超 10 KB 或新增资源要问用户（U4），其余涨幅走 `APPROVED_CEILINGS` 一次性放行。
- 枢纽文件：`tests/builtin-plugin-assembly-gate.test.ts`、`project-plugins.ts`、§5.1、`SSOT-MATRIX.md`、`page-assets.mjs/.json`。
- 体量：大。
- 验收号：`W5-01-CODING-NN`，取 80～89 段。
- 安全不变量：判断「不需要」（挂载通道是 ② 的 W5-06，它自带）。
- 降的门禁：`host-files` 1→0（HYBRID 去名同一个 PR）；`pluginOutsideMentions[coding]` 降 5（`coding-surface.ts`、`page-assets.ts`、`assistant-island.ts`、`initialization.ts`、`settings.ts`），剩下见 §1。
- 收口验收（本片 PR 里逐条证明）：
  1. `HYBRID_RUNTIME_PLUGINS` 不含 coding，`tests/builtin-plugin-assembly-gate.test.ts` 过。
  2. `coding-surface.ts`、`coding-background-tasks.ts`、`coding-shelf-material.ts`、`assistant/assistant-coding.ts` 四个文件不存在。
  3. `characters-host.ts` 没有 `codingCharacterPorts`，`project-plugins.ts` 没有 `codingPorts`、`shelfPorts` 里的 Coding 部分、`filesPorts`/`gitPorts` 里的 Coding 一族端口（Git 的观察者除外，见 C6）。
  4. `pnpm health:check --base origin/main`（`node scripts/check-health-gates.mjs --base origin/main`）无变大项。
- 风险：如果 W5-06 或 C8 的设计来得晚，C9 可以拆成两个：先 PG-070/072 与高亮（不删文件），最后一个小 PR 删 `coding-surface.ts` 并去 HYBRID。拆的时候「删最后一个文件」和「去名单」仍然必须在同一个 PR。

### 平台一半清单（交 ②）

| 平台项 | 对应条目 | 被哪一片用 | 现状 |
| --- | --- | --- | --- |
| L1b 项目库 #867 | PG-020 | C1 | 开着，⑤ 在合 |
| L2 `services.project_database`（L3 沙箱同批） | V-14、PG-091 | C1 | 计划已批（D23），未开 |
| `services.model` 的只读窄权限，`ready` 的去向 | PG-047 | C2 | 未核是否已有，T2、T7 |
| Characters 受众与安全说明 | PG-086 | C2 | 这一项归 ③，②看安全口径 |
| PG-038 按项目停 | PG-038 | C4 | #742 已有基础，按项目停没有 |
| PG-043 Home 聚合 | PG-043 | C4 | 设计已核（§8 T0），实现未核 |
| PG-009 审查种类登记 | PG-009 | C5 | 先弹窗 |
| PG-037 项目 Runtime 起停与分发 | PG-037 | C6 | 未开，可提前 |
| 脱敏与富文本公开包 | PG-062 | C7 | 未开 |
| W5-10 助理执行方选择（含消费场景） | PG-036 | C8 | main 上没有设计 |
| W5-06 `views` 挂载，W5-04 按需打包，PR-3/X-2 设置分区 | PG-060、PG-070、PG-072 | C9 | 未开 |

## 6. 要用户拍板的清单

按 spec §5 的弹窗触发，加 MCP 工具名或动作 id 变动、提供方变动碰到真实 Home 授权。

必问：

- U1 PG-009 审查种类：**已答（10-21）**。问用户的是「迁出去以后，谁可以声明这几种审查？」。用户选「开放给所有插件」：插件在 Manifest 里声明要哪几种审查，装插件时由用户授权；每一次审查照旧要人来批。这和 10-18「插件待遇一样，只按发布者签名区分安装信任」一致，不新增内置特权。草稿里「先只放给内置插件」的倾向作废。

条件触发（选了对应方案才触发）：

- U2 动作 id 或 MCP 工具名变动。目前只有 C3 的一个分支会触发：把 `coding.artifacts.preview@1` 升到 @2。避开办法是新增一个查询动作。真走升版就停下，回 ③/① 再问。其余片：新增动作 id（C3、C4）不改现有 id，且不带 mcp，不新增 MCP 工具；Characters 加受众（C2）不改 id。
- U3 提供方或授权变动碰到存量授权。C2 里 Characters 的两个动作加 `plugin` 受众，Coding 的 Manifest 新增权限（T2 之后），已经授权的安装要在设置页重新授权。这台机器没有真实 Home，但用户别处如有，要在 PR 里写明并提醒。
- U4 资源体积。C9 把客户端和样式搬出公共样式表之后，某个资源一次涨超 10 KB，或新增一个资源，AGENTS.md 要求先问用户。其余涨幅用 `APPROVED_CEILINGS`。
- U5 PG-005 默认接线的同意（§5 第 3 条）。Coding 保持随附宿主，Shelf、Diff 已声明的 `default_source` 不变，就不触发；只有让已安装的第三方插件参与接线才触发。本计划不做。

没有的：§5 第 5 条（真实 Home 的数据迁移）。本计划不改表；v8 基线与存量维护走 #867，已在 ②/⑤ 的线上。

要 ①/② 裁的技术问题（按防腐后果裁，不问用户）：

- T1 完成标准要不要等 `assistant-coding.ts`：门禁数字不管它，但它是完成标准里的第 4 个文件。C8 依赖的设计没有，如果 ② 的设计晚于 C9，是否允许 Coding 先出 HYBRID、`assistant-coding.ts` 留着并登记到后面。
- T2 `services.model` 给 Coding 的权限：声明 `model:invoke`（过宽）还是 ② 先补一个只读窄权限。
- T3 公开包放哪里：代码高亮（`codeLanguage`、`codeTokens`）、脱敏与富文本，是进插件 SDK（共享核心，`api:update`），还是平台另一个公开包。
- T4 C3 的 Shelf 副本动作：新增查询动作，还是给 `coding.artifacts.preview` 加输出（升版）。
- T5 PG-037 平台分发文件的名字与位置。
- T6 Files、Git 手写端口的范围：Git 仍留在 HYBRID 时，`gitPorts` 观察者留不留。
- T7 `ready` 端口替代：Agent 能力在宿主侧自己等，还是留窄端口。
- T8 PG-111 的边界：`CodingChangeSet` 类型和 `CODING_*_EVENT` 事件 id 在 contracts 里，是否并入本计划。我的做法是不并入。

### ② 的答复：T2、T3、T5、T7 与安全不变量（10-21，按防腐后果定；与上文冲突以这一节为准）

事实都对 `origin/main`（10-21 取）核过；标「未核」的是开工第一步要核的。

**T2 模型列表的权限：新增只读窄权限 `model:read`，不让 Coding 声明 `model:invoke`。**

- 规则：
  - `services.model.choices()`、`availability()` 认 `model:read` 或 `model:invoke`，二者任一声明且持有即可。
  - `complete()` 不变：仍只认 `model:invoke`，仍只在声明它、`scheduling: "concurrent"` 的本插件动作里可用。
  - `configuration` 不变（`storage:private` 加 `model:invoke`）。
- 宿主：`pluginModelFor`（`apps/local-host/src/plugin-model-service.ts:23`）在 Manifest 声明二者任一、且不是沙箱时建服务。
- 为什么：
  - 声明 `model:invoke` 等于为一张列表多拿一个能发请求、能花钱的权限，与「权限只算声明与授权的交集」的最小化本意相反。
  - 给 Coding 留手写的 `models` 端口，等于给内置插件开私路（2026-10-18 同等待遇）。
  - 窄权限是平台能力，所有插件同样能用。
- 交付：② 出一个小的共享核心 PR，进集成批，排在 C2 之前。
  - 改动：`packages/plugin-runtime/src/model-service.ts`、`plugin-model-service.ts`，contracts 里 `PluginModelClient` 的注释（进快照就 `pnpm api:update`）。
  - S-15 里模型服务那一句改写，不取新号。
  - 加拒绝测试：
    - 只持 `model:read` 时，`complete()` 在发出前被拒。
    - 两样都不持时，`choices()` 被拒，`availability()` 答 `actions.plugin_permission`。
  - C2 里 Coding 把 `model:read` 声明成必需权限。
- U3：Coding 随宿主发布，`bundledGrants`（`packages/plugin-runtime/src/install-rules.ts:42`）每次启动补齐必需权限，所以新增必需权限不用人重新授权。U3 的这一半不触发；Characters 加 `plugin` 受众那一半仍按 U3 写。
- V-13：唯一的列表是 `services.model.choices()`（宿主端 `configuredModelChoices`），`web-project-context.ts` 的 `execution.models` 在 C2 删。
  - 「提供方此刻健康」不进列表，选中后用 `availability(selection)` 问，所以健康过滤不需要第二份列表。
  - `configuredModelChoices` 经 `selectConfiguredTextModel` 是否已经滤掉停用的模型：未核，C2 第一步核。没滤就在宿主端补，不在 Coding 里补。

**T3 公开包：进插件 SDK，两个新子路径加根入口一个函数；不另开公开包。**

- 为什么不另开、不留原处：
  - AGENTS.md 硬约束「外部作者只装 contracts 与 SDK」。开第三个公开包要改这一条，属用户决定。
  - 「作者和平台共用、会运行的工具放在 SDK 里，不另写第二套」。高亮由 Coding 与工作台共用，脱敏由 Feed、桌面壳、Coding 的结果共用。
  - 留在 Feed、Coding 或私有的 design-system，就只有内置插件用得上，违背 2026-10-18 的同等待遇。
- `@molis-ai/molis-work-plugin-sdk/highlight`（`src/highlight.ts`）：
  - 内容：`codeLanguage`、`codeTokens`、`diffRowTokens`，类型 `CodeTokenKind`，原样搬自 Coding 的 `highlight.ts`（现在零 import）。
  - 约束：不 import `node:*`；每个函数自包含，`fn.toString()` 能单独运行。Coding `client.ts:555-568` 把它们嵌进页面脚本，工作台的助理岛直接调用。加一条测试钉住。
  - 根入口 `.` 现在 import `node:crypto`、`node:path`，所以高亮不能放根入口。
- `@molis-ai/molis-work-plugin-sdk/rich-text`（`src/rich-text.ts`）：
  - 内容：`renderRichText`、`richPlainText`，搬自 Feed `rich-content.ts` 的 `renderFeedRichText`、`feedPlainText`，名字去掉 Feed；标签白名单与 `safeExternalHref` 原样。
  - SDK 新增运行依赖 `marked`、`sanitize-html`。它们是第三方包，不是工作区包，`public-sdk-private-dependency` 不管。
  - `tests/plugin-sample.e2e.test.ts` 的离线安装要过；pnpm store 里已有这两个，因为 Feed 在用。
  - 单独成子路径，不 import 它的就不加载解析器。
- 根入口 `.` 加 `redactSecrets`：搬自 Feed `context.ts` 的 `redactFeedContextSecrets`，零依赖。用它的 Feed `projection.ts`、桌面壳 `advance-prompt.ts` 与宿主的结果装饰都跑在 Node 里。
- API 快照不用改门禁：`scripts/gates/api-snapshot.mjs` 按 SDK `package.json` 的每个子路径各出一份（`tooling/gates/api/plugin-sdk/<子路径>.txt`），源文件须是 `src/<子路径>.ts`。改完 `pnpm api:update` 后提交。
- 交付：② 一个 PR 搬完，不留两份。
  - SDK 加三样，删 Feed 的 `rich-content.ts`、`redactFeedContextSecrets` 与 Coding 的 `highlight.ts`。
  - 导入者只改 import 行：Feed `projection.ts`、Coding `client.ts` 与 `index.ts` 的再导出、工作台 `assistant-island.ts:2`、桌面壳 `advance-prompt.ts:1` 与 `package.json`、宿主 `coding-surface.ts` 的 `decorateCodingResult`。
  - `tests/feed-rich-content.test.ts` 改从 SDK 导入，断言不动。
  - 桌面壳与工作台对 Feed、Coding 包的点名随之减少，`pluginOutsideMentions` 只降不升。
  - 排在 #884 之后（它改 `decorateCodingResult` 一行）；助理岛只改第 2 行。
  - ③ 若要自己改插件里的 import，在本节下回一句，② 就只改插件以外的部分。
  - C7 的平台前提因此满足，C9 里「高亮改走公开包」一项也随之完成。
- **10-22 ② 已做（C7 分支 `feat/c7-public-packages`，PR 待开）**，与上面的偏差一处：
  - `marked`、`sanitize-html` 不是 SDK 的运行依赖，而是**可选 peer**（另加 devDependencies 供 SDK 自己构建）。原因：`tests/plugin-sample.e2e.test.ts` 用空缓存 `npm install --offline` 装 contracts 与 SDK，试过写成运行依赖会 ENOTCACHED；「pnpm store 里已有」不成立，npm 的离线安装不读 pnpm store。
  - 所以用 `/rich-text` 的包自己声明这两个：工作台、宿主加上，Feed 删掉（它不再直接用）。第三方插件同理，Skill `ui.md` 已写。
  - 根入口和 `/highlight` 不加载它们，`tests/plugin-sdk-subpaths.test.ts`（W5-01-CODING-60～63）钉住；验收写在 `specs/coding-plugin/spec.md` §K，64～69 留给 ③ 的插件一半。
  - 桌面壳改依赖 SDK，不再依赖 Feed。

**T5 PG-037 的平台分发文件：`apps/local-host/src/project-plugin-http.ts`，与 `home-plugin-http.ts` 对称。**

- 导出：
  - `handleProjectPluginHttp(request, response, url, ports, hooks)`，由 `handleCodingPluginHttp` 改名。`/api/plugins/runtime/updates`、事件管理路径与插件路由三类都在它里面。
  - `pluginEventsPending`。
  - 端口类型 `ProjectPluginHttpPorts`，取 `CodingSurfacePorts` 的通用部分。
  - `projectRouteHooks` 搬进来，不导出。
- 起停不另写函数，仍是 `project-plugins.ts` 的 `ensureProjectPlugins`。
- 门禁事实，决定了什么不能搬：
  - 新文件名不以任何插件目录名开头，不进 `hybridPlugins` 的 host-files；也不是 `-native-plugin-http.ts`，不进 `hostPluginFiles`。
  - `pluginOutsideMentions` 按文件记，新文件 import 任何插件包都算新增，PR 里过不去。所以点名插件的两段不随搬：
    - `readsFilesOutputs`，它 import Files 包的 `FILES_PLUGIN_ID`；
    - `decorateRuntimeResult`，它用 Diff、Text Stats、Feed。
  - 这两段留在 `coding-surface.ts`。调用方经 `hooks` 参数传入 `beforeDispatch`、`afterDispatch`，新文件只认钩子，不认插件。
  - 删除顺序：`decorateRuntimeResult` 由 C7 删；`readsFilesOutputs` 等 N-14 的「工作区变了」出口后删（T6 的范围）。最后一段删掉时，`hooks` 参数一起删。
- `restarted()` 给 Coding 镜像 `running`、`error` 的那段不搬：PG-037 让项目插件的运行状态按插件从监督器读（`project-plugins.ts:232-244` 不再取 Coding），这段随之删。
- 测试：`tests/plugin-route-operations.test.ts:123` 读源文件，路径改成新文件（② 改）；其余 22 个测试改 import（③）。
- **10-21 C6 平台一半落地（②，分支 `feat/project-plugin-http`，PR 见 `platform-queue.md`）。** 与上面的不同处：
  - 点名插件的两段合成一个 `codingRouteHooks`（`coding-surface.ts`），由 `web-project-platform-routes.ts` 传给 `handleProjectPluginHttp`；新文件里没有 `projectRouteHooks`，因为钩子里剩下的全是点名插件的部分。
  - **23 个测试由 ② 在本片改了，不再归 ③。** 为了不留 `handleCodingPluginHttp`、`releaseCodingSurface` 的兼容别名等 ③ 来删，两者直接删掉，调用的用例一起改，并改从包入口导入（「测试引用包内部」只降）。③ 的 C6 一半剩下：N-17 的死代码，Files 的 `readable`、`onWorkspaceChanged` 与 Git 的 `onWorkingTreeChanged`（等下一条的出口）。
  - `ProjectPluginState.running` 删掉，插件状态按插件读（`projectPluginProblem`）；`RuntimePluginRouteHooks.restarted` 没有调用方，一起删。
  - 打开项目页时 `web-goals-read.ts` 先 `ensureProjectPlugins`。
- **N-14 已核（10-21）：平台没有出口。** `onWorkspaceChanged`、`onWorkingTreeChanged` 两个宿主端口做的只是 `platform.invalidateView(<自己的 id>)`，而 `invalidateView` 只在宿主的 `PluginPlatform` 上，插件拿不到。要删这两个端口，平台得给插件一项「我的视图变了」的服务（例如 `services.view.changed()`，只能作废自己的视图版本），改 contracts、SDK、plugin-runtime，是共享核心，进批。`readable` 不用新出口：Files 可以自己调 `projects.read_workspace`（`projectsCapabilities.readWorkspace`）。这一项没有排进 ① 的顺序，② 建议排在 C5（同样改共享核心）旁边、合进同一批。

**T7 `ready` 的去向：删掉，不留窄端口，平台不新增东西。**

- 依据：`apps/local-host/src/agent-host-composition.ts` 的 `composeAgentHost` 给每个 Agent 能力的处理器都包了 `await initialize()`（`:117-120` 的注册包装，其余各处同样）。第一次能力调用就起运行时，`ready` 只是提前等了一次。
- `route-entry.ts:30`：删这一行。
  - 初始化失败改由第一次能力调用抛出，用的是 `initialize()` 的同一个 promise，所以错误相同。
  - `beforeWrite()` 会先于运行时启动执行；它只做授权检查、不写业务，次序没有影响。
- `route-activation.ts:80`：去掉 `ports.ready().then(...)`，直接 `waits.wakeLoop(...)`，第一次调能力时起运行时。
  - 注释写的约束（没有可唤醒的会话就不起运行时）由留着的 `resumable().size` 判断保住。
  - 现在 `.catch(() => undefined)` 吞掉的初始化失败，在 wakeLoop 里怎样处理：未核，C2 核。
- 宿主 `project-plugin-ports.ts:48` 的 `ready: () => agents()!.ready` 随 C2 删。`AgentHostComposition.ready` 本身别的读者没有逐个核，C2 不删它。
- `availability(definition)` 不经处理器、不起运行时，与现在的语义相同。
- **10-21 补核（② 在 #909 之后核完，上面两处「未核」到此结清；T7 没有平台代码，不出 PR，C2 不用等 ② 的任何 PR）：**
  - 恢复时初始化失败怎样处理：去掉 `ports.ready().then(...).catch(() => undefined)` 之后，失败落在 `wake-loop.ts:113-116` 的 `catch` 里，被当成一时读不到，按 5 秒、10 秒……最长 30 秒退避重试，直到这次激活停掉。每次重试都会再跑一遍 `initialize()`（失败时 `agent-host-composition.ts:112` 把 `ready` 清掉）。今天是只试一次、吞掉、不起循环。
  - 建议 C2 保持「只试一次」：恢复起的循环，若第一次 `awaitContinuations` 在没有成功过之前就失败，就结束循环，与 `agent.capability_unavailable` 同样处理。改在 `wake-loop.ts`（Coding 的文件，③）。修好配置后不重启就能自动接上，是新行为，不在这片里做。
  - 没有 Agent 服务时（`ports.execution` 缺）：今天 `ready` 抛「Agent 执行服务尚未接通」。去掉之后，走到第一次能力调用才失败，报的是能力没登记的错，不再是这句话。`tests/project-plugin-startup.test.ts:29-40` 断言这句话，并且测「后接上的 `execution`」（`ready` 计数 1、`models` 计数 1）。这一段随 C2 改写：`ready`、`models` 端口没了，后接上这件事也就没了。改它的是 C2（③），因为删端口的是 C2。
  - `AgentHostComposition.ready` 别的读者：`web-project-schedulers.ts:24`、`system-agent-service.ts:91`（记忆）、`web-assistant.ts:18`、`web-server.ts:208,237`、`web-project-context.ts:72`、`web-catalog-index-routes.ts:37`。C2 只删 `project-plugin-ports.ts:48` 那一处读取，`ready` 本身留着。

**安全不变量（号码开 PR 时取 main 加在途 PR 的下一个空号）**

- L2：不取新号。
  - 扩 S-18：项目库写入在取消、撤权、换了提供方、别的安装、停用之后都不写；测试进 `tests/security-invariants-plugin-original-caller.test.ts` 的写入点表。
  - 扩 S-46：行末已写「读写时逐句对照账本的一半随 L2 补进这一行」。
  - `project-library-plan.md` §2.8 推荐另开的「表的所有权与发布者绑定」已由 S-46 承担，不再另开。
- C2（读冻结角色）：不另立一条。
  - 插件读 `characters.execution` 只走 S-15 已有的消费路径：Manifest 的 `capabilities.consumes` 列出那一个动作，插件受众，用插件自己的授权，提供方钉在项目目录里唯一的那一个。
  - 读到的是人配置的角色内容，密钥只给引用。
  - C2 在 S-15 的测试列加两条拒绝：没在 consumes 里列出的插件调它被拒；撤掉授权后被拒（`plugin.grant_denied`）。
- C4（Home 聚合）：成立，新开一条。新的边界是 Home 一次读多个项目：
  - 逐项目调用，各用该项目里那份安装的授权；
  - 只调声明为可聚合的只读查询（`kind: query`、`effect: read`、不声明 `model:invoke`），不调命令；
  - 停用、撤权、项目已关的跳过；
  - 结果按项目分开，不混。
  - ② 的平台一半带来这一条与它的拒绝测试。
- C5（审查种类）：成立，新开一条。U1 用户 10-21 答「开放给所有插件（推荐）」：插件在 Manifest 里声明要哪几种审查，装插件时由人授权，每一次审查照旧要人批，不新增内置特权。
  - 这条写：
    - 插件只能发起它声明了、安装也授权了的审查种类；
    - 种类只能取平台列表里的（git-index、git-operation、git-integration、git-worktree），插件不能自造；
    - 授权撤掉后新的请求被拒；
    - 每次审查仍要人批；
    - 宿主不按插件 id 放行。
  - 拒绝测试：没声明的、声明了没授权的、撤权后的、平台列表以外的种类，各一条。
  - **② 定的接口（与 ③ 对齐）：审查种类走现有的权限，不另开一套授权。**
    - Manifest 在 `permissions` 里写 `review:<种类>`，例如 `review:git-index`。
    - SDK 的 Manifest 解析只认平台列表里的种类，列表在 contracts，和 `AgentReviewKind` 同处。
    - 装插件时的同意、`bundledGrants`、「声明与授权的交集」都照现有权限走，所以设置页和安装确认不用新写。
    - 宿主 `horizontal/agent-host/src/reviews.ts:113-118` 里四个 `request.plugin_id === "io.molis.work.git"`、`"io.molis.work.coding"` 的分支，改成「这次请求背后的安装持有 `review:<种类>`」。授权在发起审查的宿主入口按调用者现查，`reviews.ts` 只收已核过的结果，具体放哪一层开工时定。
    - Coding 声明 `review:git-integration`、`review:git-worktree`，Git 声明 `review:git-index`、`review:git-operation`，这是 ③ 的一半。
    - 两个都随宿主发布，必需权限每次启动补齐，不用人重新授权。
    - 撤权时还在待批的审查：批准时和执行前再查一次，撤了就拒，不主动取消。完整的形状见 §5 C5「接口定形」。
  - **排在哪：** 单独一个 PR，排在 C4 之后、C7 之前，不并进 C4、C6。C5 改 contracts 与 SDK（共享核心，`pnpm api:update`，进批），C4、C6 主要改 local-host；并在一起会把它们拖进共享核心的全量批。
  - **③ 对上面接口的意见（10-21，对 `origin/main` 832666a16 核过）**：形状同意，`review:<种类>` 走现有权限，存量安装由 `bundledGrants` 补齐。另有四点，② 已答，都落在 §5 C5「接口定形」：
    1. **③ 的声明要和删分支在同一个 PR 里落地，不能各开一个。**
       - 先删 `reviews.ts` 的分支、后声明：中间 Git、Coding 的审查都失效。
       - 先声明、后删：SDK 还不认 `review:*`，Manifest 解析通不过。
       - ③ 提议：C5 只开一个 PR，由 ② 开。③ 在 ② 的分支上补一个提交，内容是两份 Manifest 各两行权限、动作快照核对，以及下面第 3 点的两处。PR 正文写「本片动的文件」。
       - ② 若坚持分两个 PR，就得让 ② 那个 PR 先留着旧分支、加新检查，再由 ③ 的 PR 删旧分支。这要多一轮过渡，③ 不推荐。
    2. **还有一处写死在 agent-host 里：`adapters/prologue-git.ts:45`。**
       - 恢复待批的 Git 审查时，`plugin_id` 是按 `operation_kind` 猜出来的：git-index、git-operation 算 Git，其余算 Coding。
       - 开放之后，要在审查发起时把 `plugin_id`（和 install_id）写进存下的审查，恢复时照存的读。
       - 这会改存下的审查的形状。按「合同只认现行取值」，库里还没批的旧审查不能靠猜。现有代码读不出归属时会抛「Git 审查归属不可读」，能不能就这样让它们过期（`APPROVAL_TTL`），还是要维护，由 ② 定。这台机器没有真实 Home，但要在 PR 里写明。
       - ③ 认为这一处和 `reviews.ts` 一样是 agent-host 的一半，归 ②。
    3. **宿主里还有两处只给 Coding 开的路，③ 提议在同一个 PR 里由 ③ 改：**
       - `apps/local-host/src/agent-host-composition.ts:269`：整合子任务成果时要求 `session.owner.plugin_id === "io.molis.work.coding"`。改成「会话的主人就是这次发起整合的插件和安装」，身份从调用上下文来。
       - `apps/workbench/src/agent-review-surface.ts:239`：「修改意见」输入框只对 Coding 那一轮的提案显示。改成对任何插件那一轮的提案都显示，因为拒绝理由走的是平台的同一条回传。
       - 两处都是 ① 第 2 条说的「宿主里只给内置插件的分支」，不改就不算收口。
    4. **撤权时还在待批的审查：③ 倾向在批准时按调用者再核一次授权。**
       - 核不过就拒绝、不执行，可以同时在撤权时取消。
       - 依据是硬约束「被取消、撤权、停用的调用不再写任何业务记录」。只在撤权时取消，挡不住撤权和批准同时发生的情况。
       - 拒绝测试加一条：撤权后批准旧审查被拒，不执行。
- C8（助理执行方）：随 W5-10 设计定。
  - `withPersonDispatchGuard` 守的是「助理只在人发起的那一轮里把工作派给执行方」。执行方改成按消费场景选以后，这道守卫落在平台的消费场景分派上，大概率要一条（或扩 S-15 的消费路径）。
  - 设计稿里写明，① 批设计时一起看。
- C6（项目打开即起）：② 看过，不新增。
  - 起停提前不改授权：路由与动作仍过同一道网关，调用者仍由宿主签发（S-15 的 PG110）。
  - 新文件仍经 `dispatchRuntimePluginRoute`，路由权限照常对照安装授权（S-15）。
- C7：同意 ③ 的判断，不需要；搬到 SDK 的那份带着现有的脱敏与富文本测试。

## 7. 没核实或没看的部分

- 真实门禁数字：`pluginOutsideMentions[coding]`、`hybridPlugins` 的实测值我没有跑 `check-health-gates`（读文件的脚本，但主仓库 worktree 没装依赖）。§1 的 19 个文件是 `git grep -l "molis-work-plugin-coding"` 手数，门禁口径（是否数测试、lockfile、spec）未核。
- `coding.artifacts.preview` 的输出字段够不够 Shelf 生成副本（C3 第一步）。
- `services.processItems.listConsumable` 能否按已声明消费类型过滤（C3）。
- `decorateRuntimeResult` / `decorateCodingResult` 写了哪些字段、形状会不会变（C7）。
- `services.model` 的 `choices()`、`availability()` 是否也要求 `model:invoke`，有没有只读窄权限（C2）。
- `characters.execution` 返回的冻结角色内容和现在 `freezeProjectCharacter` 的输出是否一一对应（C2）。
- Goals 里「读目标标题」该用哪一个动作 id，以及 PG-006 现在到哪（C2）。
- `tests/coding-effect-control.test.ts` 之外是否还有覆盖会话、消息、运行写入的 `beforeEffect` 测试（C1）。
- `tooling/gates/actions/host-actions.tsv` 里没有 Coding 行（已核 grep 无）；`scenes.tsv` 里 Coding 0 行（已核）。
- 平台有没有「工作区变了」「工作树变了」的事件出口（N-14）。
- W5-02 PR-1 的 T1 对 `project-plugins.ts` 等四个枢纽文件的冻结现状（`w5-02-pr1-plan.md`，我没重读）。
- Shelf S1 分支的最终 diff 是否碰 `project-plugins.ts`；#891 的文件清单。
- 在途 PR 的文件清单是 10-21 取的，没有逐个重新对 head；视觉线的 `feature/visual-ux-outputs`、`feature/visual-ux-results` 在本次 `git fetch` 里又更新了。行级冲突大小（hunk 是否重叠）没有逐个看，只看了文件和增删行数。
- agent-host 适配器里 Coding 语义的提及（N-12）只数了数量，没读逻辑。
- 工作台里点名 Coding 的其余表（N-11）没有逐个读。
- 我没有读：`modules/*` 里除 Coding 相关以外的包、Feed 的插件内部、桌面壳 Rust 部分。

清理：本次读用的 detached worktree（scratchpad 里的 `main-wt`）已用 `git worktree remove` 删掉，`git worktree list` 里没有残留；没有改过任何仓库文件。
