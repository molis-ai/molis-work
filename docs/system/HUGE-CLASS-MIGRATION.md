# 巨大单元清单与判定

当前所有超过阈值的文件、类和函数，各自的 owner（包）、判定和计划。快照取自 main `4d59cd4d`（2026-10-08），之后 W1-05 把 `evaluateImportBoundary` 拆到阈值以下、从清单删去，W3-03 的 B2 把 `inspectActionDeclarations` 与 `inspectAgentDeclaration` 拆成按声明段的小函数、搬进 `packages/plugin-sdk` 并从清单删去，W4-06 把 `prologue-node.ts` 的文件与两个函数拆成九个模块、从清单删去，W4-07 把 Coding 的 `routes.ts` 文件与 `codingRouteBindings` 按资源拆成路由组、从清单删去，CHR-0 把 Characters 的 `createCharactersPlugin` 与 `start` 两个函数拆到阈值以下（处理器搬进 `modules/characters`，插件只绑定）、从清单删去，SC-3 把 Work 的 `handleWorkPanelHttp`、`startWorkTerminalClient`、`createTerminalPanels` 搬出 Work 并拆到阈值以下（面板路由进 Host 的 `web-panel-routes.ts`，终端进 `apps/workbench/src/terminal/`）、从清单删去，W5-10 的 `modules/feed` 与 `modules/functions` 两个批次（随 W5-08 的 R5 PR 一起做）把 `FeedModule`、`FunctionsStore` 与 `store.ts` 拆到阈值以下、从清单删去，共 148 个单元，分布在 35 个包的 120 个文件里（2026-10-26 W5-10 逐个判定后，当时在册的 72 个里 45 个新标明为例外、24 个列入下面“判拆”的九批，见 §2「2026-10-26 W5-10 逐个判定」）；实时数字以 `node scripts/check-health-gates.mjs --report` 为准，本表只在判定或计划变化时改。每个单元都有判定（拆、归线或例外），没有“待排期”。2026-09 的迁移记录（列的是已不存在的 `src/v1/coordinator.ts` 等）已移到 [归档](../archive/huge-class-migration-2026-09.md)。

## 1. 规则

阈值在 `tooling/gates/limits.json`，只许收紧：文件超过 800 行；类超过 300 行或超过 25 个方法；函数超过 150 行。统计 `apps/`、`horizontal/`、`modules/`、`packages/`、`plugins/`、`server/`、`tooling/` 下的 `.ts`、`.mts`，不含测试、`dist`、`fixtures`；类的行数与方法数分开记。

门禁 `pnpm health:check`（CI 用 `scripts/ci-health-base.mjs` 选定的基准：PR 上是 CI 检出的合并提交的第一个父提交，push 到 main 时是推送前的末端，其余情况退回 origin/main；本机用 `--base origin/main`。规则见 `AGENTS.md` 的构建与测试一节）：

- 未有效登记的新巨大单元失败：对 merge-base 不是巨大单元的都算新，包括原来在阈值以下、这次长过阈值的文件、类和函数。未有效登记的已有单元只许变小，变大即失败；有效登记的按下述规则处理。
- 把巨大函数搬到别的文件，门禁按“新单元”算（只有整个文件被 git 识别为改名，才算原来的单元），所以搬的同时要拆到阈值以下。
- 同一段代码会被计几次：文件里的类、类里的方法、函数里的内嵌函数各算一个单元。现在有 19 个函数落在另一个巨大单元里。
- 看不见模板字符串里的浏览器脚本和样式：超过 150 行的模板字符串共 107 个、约 55,700 行（样式、HTML、脚本都算），其中 86 个在不超过 800 行的文件里，不在下表里。这部分归 §4.8 的打包与类型检查：W4-04 的 Form 样板同时加 `*_SCRIPT` 模板常量的计数指标，W5-04 逐个插件推开。
- 匿名函数和 `#私有` 方法的键是“所在的具名函数 + 第几个回调”（`ownerOf` 只认标识符名字），顺序一变键就变，会被当作新单元。例如 `PrologueAgentAdapter` 的私有方法 `#start`（187 行）在门禁里记作 `function horizontal/agent-host/src/adapters/prologue.ts#(module) callback 1`。动这类单元时先看 `--report` 里的键有没有变。
- 具名函数在同文件只有一个实现时保留原键；出现同名的多个实现时，按具名词法 owner 区分，例如 `Big.handle`、`Small.handle` 或 `left.handle`。重载签名不算第二个实现。两实现仍不能用具名 owner 区分时，门禁明确拒绝，不能默默取最大值，也不用行号或序号作身份；仅在上方插行不改变键。
- 新增第二个同名实现会把已有函数的 flat 键改为带 owner 的键，比较时保守地视为新单元；没有自动别名放行，合理的每个单元仍可按实测分别标明。此规则在 base/head 用同一份生产脚本，不统一迁移现有的唯一函数名。2026-10-25 在 `54437998` 盘点，无涉及巨大函数的同名具名实现组，现有巨大函数键不变。匿名回调仍有上一条所述的顺序限制；同名类的聚合也是独立的测量局限，本片只修具名函数。

判定有三种，每个单元必有其一：

| 判定 | 含义 |
| --- | --- |
| 拆 | 路线（`specs/repository-anti-corruption/roadmap-2026-10-07.md`）里有一片负责拆它，写片号；大多数是 W5-10，见 §2 |
| 归线 | 路线里别的整改线会让它消失或换形态，写任务书的节号和片号：§4.8（改需求、修 bug、调交互的便利：浏览器代码打包、删旧皮肤）、§4.7（多人并行：热点聚合文件改成各主人自己登记，如翻译词典按主人分）、§4.6（扩展点与插件装配）、§4.3（分层与边界：能力机制、宿主瘦身） |
| 例外 | 本身合理、只做一件事而很长（文案表、样式表、静态数据、生成代码，或内聚的状态机、解析器、协议适配这类拆开反而把一件事散到几处的单元）；在 `tooling/gates/giant-exceptions.json` 标明，带理由和实测大小，由门禁校验。巨大单元不硬拆（用户 2026-10-25 定）：只有混了几件事的才判“拆” |

**例外的门禁规则**（`scripts/check-health-gates.mjs`，用例在 `tests/health-gates-merge-base.test.ts`）：

- 条目的键与 `baseline.json` 里的单元键相同（`file …`、`class …#名`、`function …#名`），值是 `{ kind, reason, size }`。`kind` 取 `translation-table`、`stylesheet`、`static-data`、`generated-code`、`cohesive-unit` 之一（最后一个给内聚而很长的代码单元）；`reason` 至少 20 个非空白字符，写明这个单元做的是哪一件事、为什么拆开反而更糟；`size` 是门禁量出的大小：文件与函数写行数，类只能写包含且仅包含两个字段的非数组对象 `{ "lines": …, "methods": … }`，两值都与实测严格相等，多字段或字符串数字均拒绝。
- 条目必须对应一个现存的巨大单元。拆小了、改名了、删了，条目要在同一个 PR 里跟着改，否则门禁报“条目已过期”；所以登记表随清单一起缩小。文件改名时条目改成新键；搬动的同时又大改，git 认不出改名，会被算成新单元，所以先搬后改，分两个 PR。
- **标明的单元放行新增与变大**（用户 2026-10-25 定）：条目齐全、`size` 等于实测的单元，对 merge-base 是新的也好、变大了也好，门禁都放行。`size` 与实测不等的条目什么都不放行，并且按绝对规则失败（不看 merge-base）：所以单元每变一次大小，PR 里都要把新数字写进条目，大小的变化落在 `tooling/gates/` 的 diff 里、由评审看见，不会悄悄长大。
- `--base` 输出以真实 merge-base 的登记表为准，列出本次新增登记与 `size` 变更、单元键和前后大小；即使其他门禁失败或 `--update` 拒绝也会显示。文本报告同样展示，JSON 报告用 `giantExceptionChanges` 保持结构化输出。该列表服务评审，不改变准入规则。
- 没有标明的巨大单元照旧：对 merge-base 是新的就失败，变大了也失败；拆到阈值以下也仍是出路。
- 条目的增删和 `limits.json` 一样落在 `tooling/gates/` 下，在 CODEOWNERS 里请求负责人评审（不强制）。评审按改门禁的标准看：理由里写的事实要能在代码里查到，“懒得拆”不是理由，混了几件事的单元要拆。

## 2. 现状

原迁移快照扣除已低于阈值的 Coding 样式后为 146 个单元：31 个文件、37 个类、78 个函数。以下分类数字保留用于追溯任务分配，不是当前总数；当前完整度量以 `--report` 为准。判定分布（历史快照）：

| 判定 | 文件 | 类 | 函数 | 合计 |
| --- | ---: | ---: | ---: | ---: |
| 拆 | 13 | 36 | 75 | 124 |
| 归线 | 15 | 1 | 3 | 19 |
| 例外 | 3 | 0 | 0 | 3 |
| 合计 | 31 | 37 | 78 | 146 |

- **例外**（原 3 个，2026-10-26 起共 40 个，新增的 37 个见下节）已登记在 `tooling/gates/giant-exceptions.json`：样式表 2 份（动量、基础控件）、连接器声明表 1 份。Coding 的样式表 `plugins/native/coding/src/styles.ts` 已拆出编辑条与时间线两份样式、降到 748 行，不再是巨大单元，条目与下表的行都已删。`--report` 在这些单元后面标 `[exception: …]`。看起来像例外、但没有登记的两处：Pages 的样式表只超 12 行，开头 12 行是用 `PAGES_TONES` 生成的色调规则，移到 `tone.ts` 就回到 800 行；组件规格板 `primitives/catalog.ts` 里有一段 175 行带分支的演示脚本，不是静态数据，脚本归 W5-04，剩下的样例标记已有章节函数的雏形，照样拆。英文词典 `en.ts` 也不是例外：决定 #16 已定词典按主人分，它归 W5-03（见下），所以 `translation-table` 这一类现在没有条目。
- **归线**（19 个）：浏览器脚本模板、旧皮肤和英文词典 `en.ts`（决定 #16，W5-03）等，路线里别的线会让它消失或换形态。归线的单元都有片号。Characters 的两个函数（`createCharactersPlugin`、`start`）曾挂在 W5-01 下，CHR-0 已把它们拆到阈值以下，不在清单里了（见下）。
- **拆**（124 个，95 个文件）：其中 117 个归 W5-10（89 个文件，30 个批次；助理的 3 个单元 W4-05 已抽出提醒与跟进样板，仍超限，也在这 117 个里），其余 7 个归 W5-04、W5-07、W5-09（SC-3 的三个已搬出 Work 并拆完，W3-03 的两个已由 B2 拆完并搬进 SDK，W4-06 的三个、W4-07 的两个、W5-09 的一个、W5-07 的两个已拆完）。
- 全部单元里，42 个只超出阈值不到 20%（8 个文件、26 个函数、8 个类；类按行数与方法数里超得多的那一项算），其中 34 个在 W5-10；5 个类只因方法数超标（行数没超）；这些超出不多，是 W5-10 里最便宜的一批。

### 2026-10-26 W5-10 逐个判定

用户 2026-10-25 定“本身合理的标明、不硬拆，职责混杂的才拆”，W5-10 把当时的 72 个巨大单元逐个看过（`--report`，量的是工作树，比 `baseline.json` 新）：3 个原有例外不动，**37 个新标明为例外**（条目、种类、理由和实测 `size` 在 `tooling/gates/giant-exceptions.json`，理由是对着代码写的），**32 个混了几件事、判“拆”**（其中批 G 的六个已拆，见 §3 对应四行），不在这里硬拆，下面写清楚混了什么、怎么拆、归谁。登记后例外共 40 个。评审（#1310）退回了 8 个原判例外的仓储和命令类，改判“拆”，见批 E、J、K。大小以统筹在合成树上重量为准（Goals、记忆、助理、Runtime 几条线仍在改这些文件），条目里的 `size` 随之重写。§3 各行里这 37 个单元的“拆 · W5-10”以本节为准，行不逐条改；单元拆到阈值以下或再变化时，同一个 PR 里改条目和本节。

判例外的标准（逐个对着成员的行数分布看过）：一个类只管一个聚合或一组表（仓储，成员各自只有一两条 SQL）、一条事务或流水线、一个状态机、一个解析器或算法、一个组合根、一个页面模板或一个协议适配；这些拆开会把同一件事散到几处。“一张表只由建它的包读写”（`tooling/gates/table-owners.json`）不是不拆的理由：它约束的是包与包之间，同一个包里把一个仓储类按表族拆成几个类不违反它。判“拆”的标准：成员分成至少两组、服务不同调用方、几乎不共享状态，且别处已有同样的拆法可照。

**标明为例外的 37 个单元**（种类：36 个内聚单元，1 个翻译表）：

| 单元 | 大小 | 种类 |
| --- | --- | --- |
| `apps/local-host/src/assistant/assistant-store.ts#AssistantStore` | 267 行 / 39 方法 | 内聚单元 |
| `apps/local-host/src/browser/browser-host.ts#BrowserPage` | 443 行 / 45 方法 | 内聚单元 |
| `apps/local-host/src/browser/surface-driver.ts#createBrowserSurfaceDriver` | 166 行 | 内聚单元 |
| `apps/local-host/src/connector-mcp.ts#createConnectorMcpHost` | 246 行 | 内聚单元 |
| `apps/local-host/src/demo-seed.ts#seedDemoBoard` | 538 行 | 内聚单元 |
| `apps/local-host/src/home-actions.ts#homeActionProvider` | 182 行 | 内聚单元 |
| `apps/local-host/src/project-catalog.ts#MolisWorkProjectCatalog` | 267 行 / 40 方法 | 内聚单元 |
| `apps/local-host/src/web-server.ts#createLocalWebServerFactory` | 154 行 | 内聚单元 |
| `apps/local-host/src/web-server.ts#createMolisWorkWebServer` | 151 行 | 内聚单元 |
| `apps/workbench/src/capsule-items.ts#createCapsuleItemProjection` | 229 行 | 内聚单元 |
| `apps/workbench/src/i18n/en.ts` | 3266 行 | 翻译表 |
| `apps/workbench/src/shell-page-renderer.ts#createWorkbenchGoalsPageRenderer` | 176 行 | 内聚单元 |
| `apps/workbench/src/tab-workspace-ops.ts#createTabWorkspaceOps` | 425 行 | 内聚单元 |
| `horizontal/scheduler/src/index.ts#createScheduleService` | 215 行 | 内聚单元 |
| `modules/goals/src/event-state-effects.ts#GoalEventStateEffects` | 515 行 / 11 方法 | 内聚单元 |
| `modules/goals/src/event-state-effects.ts#recordTrustedDecision` | 152 行 | 内聚单元 |
| `modules/goals/src/lifecycle-archive.ts#setTrashed` | 155 行 | 内聚单元 |
| `packages/kernel/src/action-service.ts#ActionService` | 396 行 / 15 方法 | 内聚单元 |
| `packages/plugin-runtime/src/events.ts#PluginEventBus` | 420 行 / 23 方法 | 内聚单元 |
| `packages/plugin-runtime/src/index.ts#PluginRuntime` | 612 行 / 29 方法 | 内聚单元 |
| `packages/plugin-runtime/src/supervisor.ts#PluginSupervisor` | 567 行 / 30 方法 | 内聚单元 |
| `packages/plugin-runtime/src/wiring.ts#PluginInputGraph` | 455 行 / 26 方法 | 内聚单元 |
| `packages/plugin-sandbox/src/runner.ts#createSandboxRunner` | 173 行 | 内聚单元 |
| `packages/storage/src/adapters/text-search-index.ts#openTextSearchIndex` | 151 行 | 内聚单元 |
| `plugins/native/alchemist/src/studio/server/bootstrap/local-runtime.ts#createLocalRuntime` | 203 行 | 内聚单元 |
| `plugins/native/coding/src/timeline.ts#createCodingTimeline` | 224 行 | 内聚单元 |
| `plugins/native/coding/src/ui.ts#renderCodingWorkbench` | 209 行 | 内聚单元 |
| `plugins/native/cognia/src/store.ts#CogniaStore` | 120 行 / 27 方法 | 内聚单元 |
| `plugins/native/goals/src/goal-tree-decision.ts#decideGoalTreeProposal` | 269 行 | 内聚单元 |
| `plugins/native/goals/src/goal-tree-decision.ts#result callback 1` | 243 行 | 内聚单元 |
| `plugins/native/goals/src/momentum-view.ts#buildGoalMomentumView` | 245 行 | 内聚单元 |
| `plugins/native/goals/src/proposal-normalizer.ts#GoalTreeProposalNormalizer` | 417 行 / 13 方法 | 内聚单元 |
| `plugins/native/goals/src/proposal-ui.ts#createProposalRenderer` | 187 行 | 内聚单元 |
| `plugins/native/goals/src/tree-ui.ts#createTreeRenderer` | 236 行 | 内聚单元 |
| `plugins/native/plugin-builder/src/agent-authoring.ts#expandDesign` | 225 行 | 内聚单元 |
| `plugins/native/plugin-builder/src/agent-workflow.ts#AgentBuilderWorkflow` | 654 行 / 40 方法 | 内聚单元 |

**判“拆”的 32 个单元**（大小为本次实测）。按负责的线分十一批，统筹照批派发；每批只动自己的文件，拆到阈值以下后在同一个 PR 里删本节对应行。

| 批 | 归线 | 单元 | 混了哪几件事 | 怎么拆 |
| --- | --- | --- | --- | --- |
| A | W5-04（浏览器代码打包，原已归线） | `scripts/client/assistant-island.ts` 文件 2,046 行<br>`scripts/client/tab-workspace.ts` 文件 1,948 行<br>`functions/client.ts` 文件 1,274 行<br>`scripts/client/navigation-feed.ts` 文件 955 行 | 每个文件就是一个超长的浏览器脚本模板字符串（占 95% 以上的行），里面是多个互不相干的客户端功能挤在一个工厂里；门禁看不到字符串内部 | 不在字符串里拆：W5-04 把每个脚本改成打包并类型检查的 TS 模块，按功能一个模块，工厂只组合；打包后原文件降到 800 行以下，条目随之消失 |
| B | 助理线（ac-kernel，决定 #3） | `assistant/assistant-service.ts` 文件 1,842 行<br>`AssistantService` 类 1,491 行 / 90 方法 | 委派与派发（`dispatch` 72、`executorDispatch`、`handover`）、材料轮次（`roundMaterials` 106、`readReferences`、`objectBackground`）、记忆桥（`memoryTrail`）、建议与撤销（`undo`、`answer`）、工作对象读取（`workObjects` 42）、对话发送（`send`）；文件级还有展示用函数（`presentActivity` 43、`roundDiagnostics`、`whereNow`、`stopInWords`、`describeObjects`） | 照 §3 助理一行的清单抽协作者，只经端口依赖宿主，每个不超 25 方法、300 行；展示类函数搬到 `assistant-present.ts`；`AssistantFollowUps`、`AssistantJobs` 是样板。**已拆**（2026-10-25，ac-kernel，分支 `ac-kernel/pg031-pg057`）：服务类 256 行 / 16 方法，七个协作者都在 25 方法、300 行以内，见 §3 这一行 |
| C | 记忆线（#1064，已暂停，恢复后做） | `horizontal/memory/src/service.ts` 文件 1,259 行<br>`MemoryService` 类 1,079 行 / 51 方法 | 写路径（`commit` 108、`change` 77、`accept` 44、`propose` 34、`undo` 30、`write`）、读取（`recall` 59、`list`）、维护与学习（`upkeep` 91、`learnFromWork` 50、`signal`）、范围导入导出清除（`importScope`、`exportScope`、`clearScope`）；文件里还有九个端口接口 | 四个协作者：写入与审批、召回、维护与学习、范围搬运；端口接口移到 `ports.ts`；服务类只持有协作者并转发公开方法。决定 N-03：包内拆，不搬 |
| D | 平台侧（未认领，统筹派） | `modules/shelf/src/store.ts` 文件 1,061 行<br>`ShelfStore` 类 660 行 / 31 方法 | 作业运行（`runJob` 182、`fileResult` 43、`cancelJob`）、收纳入口（`addClipboard` 52、`admitFolder` 50、`admit`、`admitFile`、`admitCapturedText`、`captureUrl`）、副本存取（`writeCopy`、`deleteCopy`、`snapshot`）、目录文件读写与命名（`readCurrentCatalog`、`uniqueTitle`、`copyTree` 等文件级函数）；`runJob` 另见 `ShelfStore#runJob`，已标例外 | 三个协作者：作业运行器、收纳入口、副本存储；目录文件的读写命名函数移到 `catalog-file.ts`；`runJob` 本身是一条流水线，整体搬进作业运行器、不再拆 |
| E | Goals 线（S 系列，随 #1295 之后） | `modules/goals/src/event-facts.ts` 的 `GoalEventFacts` 类 545 行 / 34 方法<br>`modules/goals/src/event-facts-repository.ts` 的 `GoalEventFactsRepository` 类 371 行 / 29 方法<br>`modules/goals/src/event-state-repository.ts` 的 `GoalEventStateRepository` 类 408 行 / 30 方法<br>`modules/goals/src/guidance-commands.ts` 的 `GuidanceCommands` 类 328 行 / 3 方法、`update` 函数 177 行<br>`plugins/native/goals/src/event-document-forms.ts` 的 `createEventDocumentForms` 函数 348 行 | `GoalEventFacts`：配置事实（`configureInTransaction` 104、`configureRequested` 99、`configure`、`configView`）、汇报与事件读取（`report` 80、`listEvents`、`listLatestReports`、`latestWorkEventRows`）、意图与来源（`rememberIntent`、`recordIntentArtifacts`、`readIntentSourceKind`、`adoptOwner`）。两个仓储：`GoalEventFactsRepository` 的 29 个方法按表族分四组（类型与要求：`insertType`、`insertRequirement`、`updateRequirementCurrent`；配置：`insertConfigVersion`、`getConfig`、`upsertConfig`；工作事件：`insertWorkEvent`、`listLatestWorkEvents`、`getIntentCreatedEvent`、`maxGoalCursor`；判断：`listLatestJudgments`、`listJudgments`），`GoalEventStateRepository` 的 30 个方法分决定与收尾（`insertAppliedDecision`、`insertDecisionRequest`、`insertClosure`）、进度与结论（`insertProgress`、`insertConclusions`、`latest*`）、疑虑与约定（`insertConcern`、`updateConcern`、`insertAgreement`）三组，各被上面某个协作者独占。`GuidanceCommands.update` 一个 130 行的事务里按 `action`（`edit`、`deactivate`、`restore`）分支，`add` 137 行又重复同一尾部（写版本行、更新条目行、`UPDATE boards`、追加事件）。表单函数：决定、关切、变更提议、汇报、协议、类型、需求、收尾、采用各自一个渲染函数挤在一个工厂里 | 事实类拆成配置、汇报、意图三个，各带自己的表访问（仓储随各自的协作者一起按表族分开）；`update` 的校验与归一（172 到 215 行）一个函数，三个 `action` 各一个事务函数，共同的尾部抽成 `writeGuidanceRevision`，`add` 也调它；表单按文书种类一文件，工厂只组合 |
| F | Feed/Inbox 线（FI-6） | `plugins/native/feed/src/application.ts` 的 `FeedApplication` 类 493 行 / 44 方法<br>`apps/workbench/src/feed-projection-ui.ts` 的 `createWorkbenchFeedProjectionRenderer` 函数 251 行 | `FeedApplication`：条目摄入（`ingestItem` 54、`captureAfterIngest` 30）、来源与运行记录（`sourceRecord`、`upsertSource`、`upsertSourceRun`、`setSourceEnabled`）、收件箱条目（`createInboxEntry`、`setInboxEntryStatus`、`ensureInboxEntryForFeedItem`、`addToInbox`）、采集记账与失败（`recordCaptureJudgment`、`recordArtifactOutFailure`、`completeArtifactOutFailure`）。渲染函数：数据模型（`sourceModel` 83、`itemModel`、`feedEntries`、`buildFeedNativePluginModel`）与渲染（`renderFeedNativePluginSurface`、`…PersistedDetail`）混在一起 | 随 Feed 迁 Runtime（FI-6）按摄入、来源、收件箱、采集记账四个协作者拆；工作台这个函数随 Feed 离开工作台，搬走时模型函数与渲染函数分文件、拆到阈值以下（搬动的巨大函数按新单元算）。**`FeedApplication` 已拆**（T-059，按来源、捕捉规则、捕捉记账三个协作者；摄入与收件箱共用判断排队，留在门面），见 §3 这一行 |
| G | 宿主线（未认领，统筹派） | `local-host.ts` 的 `LocalHost` 类 515 行 / 24 方法<br>`character-import-discovery.ts` 的 `createCharacterDiscovery` 205 行、`discover` 176 行<br>`web-catalog.ts` 的 `handleLocalCatalogWebRequest` 201 行<br>`plugin-builder/agent-surface.ts` 的 `ensureStudio` 194 行、`created callback 1` 186 行 | `LocalHost`：场景客户端（`sceneClient` 98）、项目内操作队列（`enqueue`、`ensureEntry`）、可用性判定（`resolveActionAvailability`）、动作客户端与登记（`syncActionClient`、`actionClient`、`actionRegistry`）。发现：每个 Agent 运行时（codex、claude-code、cursor、opencode）的扫描挤在一个 `for…of`（165 行）。目录 HTTP：设置页（59）、插件设置（37）等一串 `if` 路由。创作台装配：模型与凭据、沙箱运行器与预览、交给工作流的端口对象 | `LocalHost`：场景客户端、操作队列（照 `HomeLine`）、可用性判定各成协作者（§3 的行已写，W3-01/W3-07 的新增写在新文件里）；发现：每个运行时一个扫描函数，目录解析一个函数；目录 HTTP：路由表，形态同 W5-07 的 `web-route-table.ts`；`ensureStudio`：三块各成 `create…` 函数（内嵌的 `created` 随之变短） |
| H | 工作台线（未认领，统筹派） | `renderer.ts` 的 `createWorkbenchRenderer` 284 行<br>`settings-renderer.ts` 的 `createWorkbenchSettingsRenderer` 181 行<br>`project-settings-pages.ts` 的 `createWorkbenchProjectSettingsPages` 174 行 | 都是“一个工厂里嵌着许多页面渲染函数再返回一张表”：目录、目标文档、终端面板、Feed 片段、设置总览、项目设置、运行时设置、MCP 设置、项目指导文档、规划页等互相只经返回表联系，不共享状态 | 渲染函数按页面种类移到模块级文件（设置总览 `renderMolisWorkSettings` 65 与 `renderProjectSettings` 47 各一个），依赖（`L`、`escapeHtml`、导航）显式传参；工厂只按页面种类组合 |
| I | 工作流线（未认领，统筹派） | `plugins/native/workflows/src/actions.ts` 的 `createWorkflowsActionHandlers` 函数 233 行 | 一张处理器表（`bind(workflowsActions.list, …)`，64 行）加三段运行逻辑：交接准备（`prepareHandoff` 49）、动作步骤执行（`runActionStep` 30）、步骤读取与判定（`readStep`、`judge`、`resolveAction`） | 运行逻辑搬进 `handoff.ts` 与 `step-runner.ts`，表里每个动作的处理器单独一个函数；`createWorkflowsActionHandlers` 只绑定 |

派发顺序建议：A、B、C、E、F 各挂在已有的线上，随那条线的下一个片做，不单开；D、G、H、I、J、K 是没有线认领的，每批一个片、一个 PR，G 先做（`LocalHost` 被 W3-01、W3-07 碰到），之后 H、D（已由 `5f52a8910` 做完）、I、J、K。没有给这些批编新的 BL 或 RAC 号：统筹派发时按批领号。

### W5-10 怎么做

路线里 W5-10 的标题是“其余巨大单元拆分”，原文点名了助理协作者、Pages 编辑器的 `mount`、`hoverHandlePlugin` 与 `commands.ts`，之后“按决定搬助理包”。本清单把它的范围定为所有判定为“拆 · W5-10”的单元（117 个，89 个文件），做成一串 PR：**每个包一个 PR**，先做任务书 §4.5 第 3 条点名的助理、平台记忆服务、Pages 编辑器（Prologue 节点适配器的初始化函数与 Coding 的路由绑定已有 W4-06、W4-07），其余按窗口内被改动得最多的先做（并列的，单元多的在前，再按路径；窗口的定义在下表后面）。每个 PR 只拆自己包里的单元，拆完就在同一个 PR 里改本表对应的行并更新本地快查。下表是这一串的顺序：

| 顺序 | 批次（包） | 文件 | 单元 | 窗口内改动它的合并数 | 备注 |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | `apps/local-host/src/assistant` | 2 | 3 | 18 | 决定 #3：W4-05 已拆出提醒与跟进作样板，W5-10 拆其余协作者，最后搬成独立包 |
| 2 | `horizontal/memory` | 1 | 2 | 3 | 任务书 §4.5 点名“平台记忆服务”；N-03 之后路线里没有别的片拆它，代码不搬、包内拆 |
| 3 | `plugins/native/pages` | 4 | 10 | 12 | 任务书点名“Pages 编辑器的挂载函数”；路线原文点名的 `mount`、`hoverHandlePlugin`、`commands.ts` 都在这里 |
| 4 | `apps/local-host` | 16 | 20 | 41 | 不含助理目录；web-* 路由文件的形态与 W5-07 的注册表一致 |
| 5 | `apps/workbench` | 5 | 6 | 30 |  |
| 6 | `horizontal/agent-host` | 11 | 15 | 18 | `prologue-node.ts` 已由 W4-06 拆完 |
| 7 | `plugins/native/goals` | 7 | 8 | 10 |  |
| 8 | `packages/plugin-runtime` | 4 | 5 | 9 | W3-06、W4-02 之前或同一 PR 先拆被它们碰到的类 |
| 9 | `plugins/native/feed` | 0 | 0 | 7 | `FeedApplication` 已拆完（W5-10 批 F，T-059：来源、捕捉规则、捕捉记账各成协作者）；上面的总数没有随之重算 |
| 10 | `plugins/native/workflows` | 0 | 0 | 6 | `createWorkflowsActionHandlers` 已拆完（233 → 107 行，运行逻辑在 `handoff.ts` 与 `step-runner.ts`）；上面的总数没有随之重算 |
| 11 | `plugins/native/work` | 2 | 2 | 5 | SC-3 已把面板路由与终端面板搬出 Work 并拆完 |
| 12 | `plugins/native/plugin-builder` | 2 | 2 | 5 | 创作台属构建期例外清单，不迁 Runtime，就地拆（2026-10-18 改：不算插件、并进平台能力，仍就地拆） |
| 13 | `horizontal/listener-host` | 1 | 1 | 5 |  |
| 14 | `packages/storage` | 2 | 2 | 4 |  |
| 15 | `horizontal/search` | 1 | 1 | 4 | 按需搜索来源已删（W2-03），可直接拆 |
| 16 | `plugins/native/todo` | 1 | 1 | 4 |  |
| 17 | `modules/goals` | 6 | 9 | 3 |  |
| 18 | `packages/design-system` | 1 | 2 | 3 |  |
| 19 | `packages/kernel` | 1 | 1 | 3 | `registerProvider` 已在 W3-01 降到阈值下；W3-05 的交叉校验在 SDK 的 `action-cross-references.ts`，`registerProvider` 只在原有的一行里多调一个函数，没有加行 |
| 20 | `horizontal/placement` | 1 | 1 | 3 | 决定 N-03：代码不搬，包内拆 |
| 21 | `plugins/official-integrations/gmail` | 4 | 5 | 2 |  |
| 22 | `modules/private-work-context` | 3 | 3 | 2 | `RuntimeProjectBindingCommands` 已拆完（333 → 235 行，周边读写在 `runtime-binding-records.ts`）；上面的总数没有随之重算 |
| 23 | `modules/shelf` | 0 | 0 | 2 | 已拆完（2026-10-26）：`ShelfStore` 只留设置、运行环境探测、快照与转发，收件、副本、作业、剪贴板各成协作者（`admissions.ts`、`copies.ts`、`jobs.ts`、`clipboard-store.ts`），`runJob` 按阶段拆成计划、暂存、生成、提交、记失败 |

| 24 | `horizontal/scheduler` | 1 | 1 | 2 |  |
| 25 | `modules/projects` | 0 | 0 | 2 | `ProjectsRepository` 已拆完（按表族三个类：项目记录、工作区、删除回执）；上面的总数没有随之重算 |
| 26 | `plugins/native/coding` | 1 | 1 | 2 |  |
| 27 | `plugins/native/cognia` | 1 | 1 | 2 |  |
| 28 | `packages/im-ui` | 2 | 3 | 1 | 决定 #4：IM 继续迭代，所以拆 |
| 29 | `plugins/native/alchemist` | 1 | 1 | 1 | 两个仓储已拆完（Pulse 四个类、Research 三个类，原类名留作组合体）；上面的总数没有随之重算 |
| 30 | `packages/plugin-sandbox` | 1 | 1 | 1 |  |

合并数是窗口 `f955605c..4d59cd4d` 里改动过该批次任一文件的 first-parent 提交数（一个提交算一次）。窗口固定在这两个提交之间，共 223 个提交，全部是 PR 合并：起点是 PR #90 的合并 `f955605c`（不含），它是 main 上 2026-09-28T00:00:00-07:00 之前的最后一个提交；终点 `4d59cd4d` 就是本快照。不用 `--since=2026-09-28`：裸日期会补上运行那一刻的钟点，同一个终点上早晚跑出来的数差好几个。命令：

```
git log --first-parent --format=%h f955605c..4d59cd4d -- <文件…> | wc -l
```

不带 `-- <文件…>` 得窗口总数 223，带上 `apps/workbench/src/i18n/en.ts` 得 24。等价的时间写法是 `--since='2026-09-28T00:00:00-07:00'`（必须带时区；在这个终点上结果与范围写法一致）。每一行的 PR 列同一口径，是该文件在这个窗口里的合并数，随快照走，不随后来的合并更新。这些数只用来排 W5-10 的先后，窗口的起点是约定，不是门禁。

路线和本清单还差四处需要 spec 跟上（spec 与路线由 W1-01 管，本文不改）：W5-10 的描述要写成“按本清单，每个包一个 PR”；W4-08 末尾的“再拆 MemoryService”要删（决定 N-03：改在包内由 W5-10 拆）；W5-03 的描述里“（或稳定键，按决定）”已经定了，要改成决定 #16 的结论；决定 #26（Characters 并进宿主）的第 4 波切片要有片号。

### W5-10 里先看哪些

下表是 W5-10 的文件里，窗口内被至少 7 个 PR 改动的 12 个（并列的按路径排；第 6 名起四个并列 8 个，第 10 名起三个并列 7 个）：

| 文件 | PR | W5-10 的单元 | 最大单元 |
| --- | ---: | ---: | ---: |
| `apps/local-host/src/assistant/assistant-service.ts` | 15 | 2 | 2,656 行 |
| `apps/local-host/src/web-catalog.ts` | 15 | 1 | 336 行 |
| `apps/workbench/src/renderer.ts` | 14 | 1 | 381 行 |
| `apps/workbench/src/shell-page-renderer.ts` | 11 | 2 | 227 行 |
| `apps/local-host/src/assistant/assistant-store.ts` | 10 | 1 | 282 行 / 44 方法 |
| `apps/local-host/src/plugin-builder/agent-surface.ts` | 8 | 2 | 196 行 |
| `apps/local-host/src/web-goals-read.ts` | 8 | 1 | 175 行 |
| `horizontal/agent-host/src/adapters/prologue.ts` | 8 | 3 | 1,026 行 |
| `horizontal/agent-host/src/index.ts` | 8 | 2 | 409 行 / 12 方法 |
| `apps/local-host/src/agent-host-composition.ts` | 7 | 1 | 261 行 |
| `apps/local-host/src/web-server.ts` | 7 | 2 | 241 行 |
| `plugins/native/feed/src/application.ts` | 7 | 1 | 503 行 / 44 方法 |

### 路线里与这些单元有关的片

| 片 | 内容 | 单元数 | 对应的单元 |
| --- | --- | ---: | --- |
| W3-03 | 把运行时 helper 移出 contracts，其中声明校验器放进 plugin-sdk（路线写移到 plugin-runtime，做不到，见 spec §1）；B2 已把 `inspectActionDeclarations`、`inspectAgentDeclaration` 按声明段拆开搬入 SDK | 0 | 已做（B2），清单里不再有 |
| W4-04 | Form 样板：迁到 Runtime，浏览器代码改成打包并类型检查的 TS；删宿主里 Form 的 `registerProvider` 站点 | 2 | `form/src/client.ts`、`project-host.ts` |
| W4-05 | 助理服务拆分样板：在原处按包形边界抽出提醒与跟进协作者 `AssistantFollowUps`（`assistant-followups.ts`），带自己的表与测试（决定 #3 已定） | 0 | 已做；`AssistantService`、`AssistantStore` 变小，仍是巨大单元，归 W5-10 |
| W4-06 | 拆 `initializePrologueNodeAdapter`：`startAgentRun` 按阶段进 `prologue-run.ts`；轮次状态与资源读写进 `prologue-node-kit.ts`，会话索引、定时、待批与审查卡、恢复、Runtime 端口、项目工作与推理各成模块（`prologue-session-index.ts`、`prologue-schedule.ts`、`prologue-review-documents.ts`、`prologue-recovery.ts`、`prologue-node-port.ts`、`prologue-node-parts.ts`），`prologue-node.ts` 只剩组合（199 行） | 0 | 已做，清单里不再有 |
| W4-07 | 拆 `codingRouteBindings`：激活的共享状态与恢复进 `route-activation.ts`，开一轮进 `start-round.ts`，路由按资源分成七组（`routes-writers.ts`、`routes-changesets.ts`、`routes-goals.ts`、`routes-setup.ts`、`routes-sessions.ts`、`routes-timeline.ts`、`routes-delegations.ts`），`routes.ts` 只剩组合（51 行） | 0 | 已做，清单里不再有 |
| W5-01 | 插件族逐个迁到 Runtime，每迁一族就删宿主里它的文件和 `registerProvider` 站点；Feed 另有专项计划（尚未写出） | 4 | `project-host.ts`、Feed 投影的页面渲染、Characters 的 `createCharactersPlugin` 与内嵌的 `start`（决定 #26 把这一项提到第 4 波） |
| W5-02 | 声明式登记：目录和监督器名单由各包声明生成 | 1 | `project-host.ts`（与 W5-01 同） |
| W5-03 | 翻译按主人分词典（决定 #16 改成稳定键），删无引用的键 | 1 | `en.ts` 变小，降到 800 行以下时删这一行 |
| W5-04 | 浏览器代码逐个插件打包、类型检查，再做工作台客户端分段 | 17 | 11 个浏览器脚本模板、`toString` 注入的函数（`createTabWorkspaceOps`、`createPluginComponentClient`、`createCodingTimeline`）、`craft-finish.ts` 与 `primitives/catalog.ts` 里的脚本 |
| W5-05 | 逐个删旧皮肤，并降低页面预算和巨大单元基线 | 0 | 已做（第 1～5 片）：`personal-workbench-v3.ts`、`calm-desktop.ts` 都已删 |
| W5-06 | 声明式贡献挂载器代替 15 个 Goals 挂载适配器；`goals-page-renderer.ts` 改名，留在工作台 | — | 第 1 片已做：UiHost `mountDeclared` 按 surface 声明的 slot 挂，`createSurfaceRenderers` 按 Goals 自己导出的「方法→surface」表造渲染方法，11 个 `goals-*-ui.ts` 转接文件与 9 张 surface→slot 表删掉；文件改名 `shell-page-renderer.ts`，函数名 `createWorkbenchGoalsPageRenderer` 留到 W5-10 拆它时再改（巨大单元按函数名记，改名会被当成新的巨大单元）。不拆那两个函数（适配器是别的文件）。第 2 片已做：舞台按 Manifest `views` 挂（新文件 `declared-stages.ts`），外壳里九行手写舞台和目录的空占位键删掉，两个函数都变短了 |
| W5-07 | `handleMolisWorkWebRequest` 改成注册表 | 2 | 已拆完：按顺序尝试的路由表（`web-route-table.ts`），表写在宿主里、`*-http` 模块不动（统筹 10-17 定，理由见防腐 spec §4.5 一行） |
| W5-09 | `contracts` 的 `services/agent-host.ts` 按领域拆，纯搬移，由 API 快照守着 | 1 | `agent-host.ts` 合同；已拆完：入口留描述符、错误码、`AgentHostApi` 与 `agentHostCapabilities`，其余按领域放进旁边的 `agent-host-*.ts`（运行时、启动、会话、运行视图、审查、端口、创作台），子路径与 API 快照不变 |
| W5-10 | 其余巨大单元拆分（范围见上） | 117 | 117 个，含助理协作者、Pages 编辑器与命令 |
| W5-11 | 宿主瘦身：每插件 AI 绑定改 `services.model`（已做，只剩 Alchemist 登记的例外）；连接器提供方设置与 OAuth 移进官方连接器插件（Codex C4，回调路径留在平台），飞书 CLI 与 Lark MCP 留作登记的例外 | 0 | `web-connectors-settings.ts` 已不是巨大单元（2026-10-26 核：文件 135 行，函数约 115 行） |
| W2-08、W3-07 | 删 Goals 无生产调用方的类型化桥；管理入口改走动作并删剩余桥（工作区读取只留一个 id 已由 W2-09 做完，函数仍 270 行：删了两处登记，补了整份文件只给宿主运行的插件的判断） | 1 | `project-capabilities.ts` |
| W2-06 | 删四处跨主人 SQL（含 `demo-seed.ts` 一处） | — | 只删几行，不改判定 |

已定的决定对判定的影响（决定的编号是 `specs/repository-anti-corruption/spec.md` §10 用户决定表里的序号，N-03 是 10-07 的“记忆、放置与情境启发式的层次”）：

- 决定 #3（系统助理）：先在原处按包形边界拆，再搬成独立包。所以助理是“拆 · W4-05、W5-10”，搬包是 W5-10 的最后一步，不是例外；拆的时候就要让协作者只经端口依赖宿主。
- 决定 #4（IM 与“讨论”页签）：保留并继续迭代，只修三处账目。所以 `im-ui` 的两个单元判“拆”，不冻结。
- 决定 #26（Characters 并进宿主，成为设置的一节）：原判“归线 · §4.6 · W5-01”的 `createCharactersPlugin` 与 `start` 已由 CHR-0 拆到阈值以下（处理器搬进 `modules/characters`，插件定义只剩绑定与路由），从清单删去；Runtime 条目与界面的去向仍按决定 #26，见 `specs/repository-anti-corruption/spec.md` 的 W5-01 Characters 一节；第 4 波的承接切片在路线里还没有自己的片号，要 W1-01 补。（CHR-1 已做，2026-10-22：插件包与 Runtime 条目已删，界面是宿主的一节。）
- 决定 N-03（记忆、放置、搜索、情境启发式归“平台产品服务”，代码不搬）：路线 W4-08 末尾的“再拆 MemoryService”不再执行，`MemoryService`、`PlacementService`、`SearchService` 改在包内由 W5-10 拆。
- 决定 #7（宿主设置写入只走 HTTP，登记为管理接口的例外）：那份例外写在 CALL-CHAINS 的例外表里，和本文的巨大单元例外是两回事；它说连接器路由以后搬进各自的官方接入插件，所以 `web-connectors-settings.ts` 判“归线 · W5-11”。2026-10-26 核：它的处理函数已缩到约 115 行，低于阈值，不再是巨大单元，搬迁时不用再为它拆。
- 决定 #16（界面翻译全部换成稳定键，词典按主人分）：`en.ts` 不是例外，判“归线 · §4.7 · W5-03”。词典按主人分已经定了，这张表不再是“必须一整块”的东西；W5-03 把插件自有词条移给主人、删无引用的键，它随之变小。
- 决定 #19（删按需搜索来源）：`SearchService.onDemand` 一支已随之去掉（W2-03），W5-10 直接拆删后的 `SearchService`。
- 10-07 的插件平台范围决定把 Goals、Artifacts、Sessions 与插件创作台列为构建期例外，它们不迁 Runtime，也就不会因 W5-01 缩小；它们的巨大单元都判“拆 · W5-10”。2026-10-18 改：用户取消了这四个例外（Goals 迁 Runtime，插件创作台并进平台，成果库与 Sessions 归平台事实、Sessions 清理）；拆分判断不变，迁移或清理那一片按新的归属重判。

## 3. 清单

各分组总数承接 §2 的迁移快照，逐行的已拆/已改判结果另行更新，不当作当前巨大单元总数。每行一个文件（同一个文件里的单元一起判）。PR 是上面那个窗口里改动过该文件的合并数。路径省略各节开头写明的前缀；多个包的区另有“包”一列，按包排在一起。

### 宿主 `apps/local-host`（唯一业务 composition root）

26 个单元（拆 23、归线 3），21 个文件。路径前缀 `apps/local-host/src/`。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `agent-host-composition.ts` | `composeAgentHost` 函数 261 行 | 已在阈值以下（W5-10 agent-host 份核对，2026-10-25） | 各类能力的登记已在此前的改动里移成独立函数，现 87 行（函数阈值 150），门禁 `--report` 已不列，不再拆 | 7 |
| `assistant/assistant-service.ts` | 文件 2,081 行<br>`AssistantService` 类 1,663 行 / 99 方法 | 已拆 · W5-10 批 B | 2026-10-25 批 B 已在原处拆完：服务只剩装配与对外入口（`list`、`read`、`send`、`control`、归档改名、恢复、角色），其余是七个协作者，各在自己的文件、只经 `AssistantServicePorts` 与自己的 `link` 往来、不 import 别的协作者的代码：读取工作（`AssistantWorkReads`，`assistant-work-reads.ts`）、派发与交接（`AssistantDispatch`，`assistant-dispatch.ts`）、建议与撤销（`AssistantOutcomes`，`assistant-outcomes.ts`）、一轮的材料（`AssistantRoundMaterials`，`assistant-round-materials.ts`）、记忆桥（`AssistantMemoryBridge`，`assistant-memory-bridge.ts`）、预算与用量（`AssistantBudget`，`assistant-budget.ts`）、通知与扫描（`AssistantNotices`，`assistant-notices.ts`）；展示用函数在 `assistant-present.ts`，共用的端口与检查在 `assistant-service-shared.ts`。store 按各自用到的方法收窄，`assistant-material-scan.ts` 的 `ScanEnvironment` 也只拿 store 的几项和 `identity`。形状由 `tests/assistant-collaborators-shape.test.ts`（RAC-917）看住。剩搬成独立包。原记录：决定 #3 已定：先在原处按包形边界拆，再搬成独立包。W4-05 已做：提醒与跟进协作者 `AssistantFollowUps`（`assistant-followups.ts`：到期提醒、定时轮次、关注规则，带自己的表 `AssistantFollowUpRecords`，只经 `AssistantFollowUpPorts` 依赖宿主，测试 `tests/assistant-followups-collaborator.test.ts`）是样板；W5-10 再抽委派（`delegation`）、材料轮次（`roundMaterials`）、记忆桥（`memory*`）、建议与撤销（`recordOffer`、`runCard`、`undo`）；其余成组的方法也要有去处：通知与扫描（一次扫描新材料的逻辑已抽到 `assistant-material-scan.ts` 的 `scanNewMaterialOnce`，这只是第一步，还不是包形：`ScanEnvironment` 里放的是整个 `AssistantStore` 类，模块还直接导入兄弟文件 `assistant-relations.js` 的 `identity`；单次运行的保护 `#scanning` 和 `material_scan` 设置的写入仍在服务的 `scanNewMaterial` 里。别的通知方法照这个形状抽出，同时把 store 收窄成端口、去掉对兄弟实现的导入）、作业跟踪（prologue-adoption A3 已抽成 `AssistantJobs`，`assistant-jobs.ts`，作业的事实在工作图上）、派发与交接、预算与用量、工作对象读取、方法选择、恢复、角色、诊断。目标是每个协作者不超过 25 个方法、300 行。“包形”的意思是：协作者只通过自己的端口类型依赖宿主，不 import 兄弟协作者的实现，所以最后搬包是整目录移动。拆完后 W5-10 末尾搬成独立包。 | 15 |
| `assistant/assistant-store.ts` | `AssistantStore` 类 267 行 / 39 方法 | 拆 · W5-10 | W4-05 已带走提醒与跟进的表（`store.followUps`）。其余方法按表分组：回合与卡片、通知（`raiseNotice`、`settleNotices`）、提醒与跟进（`followUps`、`saveFollowUp`、`unsettled`）、作业与撤销（`jobs`、`undos`）、用量（`recordUsage`、`usageOf`）、设置。每个协作者带走自己的表访问，随 `AssistantService` 的拆分一起切开。 | 10 |
| `browser/browser-host.ts` | `BrowserPage` 类 443 行 / 45 方法 | 拆 · W5-10 | `BrowserPage` 的 45 个方法分四组：连接与目标（`attach`、`listenTo`、`targetGone`、`adoptPopup`）、视口与画面（`refreshScreencast`、`applyViewport`、`resize`、`capture`）、导航与历史、输入与对话框/文件/下载（`input`、`answerDialog`、`chooseFiles`、`download*`）。各成协作者，页面类只持有它们。 | 2 |
| `browser/surface-driver.ts` | `createBrowserSurfaceDriver` 函数 166 行 | 拆 · W5-10 | 只超 16 行。`createBrowserSurfaceDriver` 返回的驱动器对象占 141 行（`identity`、`scope`、`observe` 等方法）；各方法抽成函数，返回对象只列出它们。 | 3 |
| `character-import-discovery.ts` | `createCharacterDiscovery` 函数 205 行<br>`discover` 函数 176 行 | 已拆 · W5-10（批 G） | 已做：路径与目录检查搬到 `character-import-paths.ts`，受限读取（`CharacterScan`）搬到 `character-import-scan.ts`，五个运行时各一个扫描函数放进 `character-import-runtimes.ts` 的 `RUNTIME_SCANS` 表；`createCharacterDiscovery` 现 72 行文件里只剩装配。拆之前先录了一份五个运行时的发现结果作基准（`tests/fixtures/character-discovery-sources.json`），拆后逐字相同。 | 0 |
| `connector-mcp.ts` | `createConnectorMcpHost` 函数 292 行 | 拆 · W5-10 | `createConnectorMcpHost` 内的 `useClient`（52）、`provider`（45）、`startMcpConnection`（43）、`completeMcpAuthorization`（28）各自成函数或文件，服务白名单 `MCP_SERVERS`（40 行数据）另放；主函数只装配。 | 1 |
| `demo-seed.ts` | `seedDemoBoard` 函数 541 行 | 拆 · W5-10 | `seedDemoBoard` 的 536 行在一个 `try` 里：先是一份目标清单（`goals` 数组，纯数据），后面接一串演示调用（`reportProgress`、`requestDecision`、`applyConcern`、`submitClosure`、`setArchived`），不只是数据，所以不登记例外。清单移到 `demo-seed-data.ts`；演示调用按目标分组，每组一个函数；`seedDemoBoard` 只剩初始化、遍历清单、依次调用。其中一处直写 SQL（`UPDATE boards`）由 W2-06 删除。 | 2 |
| `home-actions.ts` | `homeActionProvider` 函数 185 行 | 拆 · W5-10 | `homeActionProvider` 的返回里，`createHomeTalkHandlers`、`createHomeOfferHandlers`、`createHomeEventHandlers` 三族处理器已经抽出；其余内联的处理器（`readJudgment`、`writeJudgment` 等，返回共 78 行）照此各成 `createHome…Handlers`，`record`（34）、`handler`（27）随各自的族。 | 6 |
| `installed-plugin-host.ts` | `openInstalledPlugins` 函数 205 行 | 拆 · W5-10 | `openInstalledPlugins` 37 条语句，其中 `lifecycle`（46）、`expose`（19）、`catalog`（17）、`definition`（17）、`generate`（13）、`close`（13）各成函数，主函数只组合。 | 6 |
| `installer/runtime-integration.ts` | `RuntimeIntegrationService` 类 341 行 / 15 方法 | 拆 · W5-10 | `confirm` 一个方法 136 行：先验证已应用的计划，再分连接分支与移除分支，失败时还原配置文件与技能快照并写“已回滚”的尝试记录。四步（验证、连接、移除、回滚）各成函数；回执与备份的读写（`readReceipt`、`writeReceipt`、`writeAttempt`、`receiptPath`、`backupPath`）移到回执存取类，服务类只编排。 | 0 |
| `local-host.ts` | `LocalHost` 类 570 行 / 23 方法 | 已拆 · W5-10（批 G） | 已做：项目内操作队列与项目表搬到 `local-host-project-line.ts` 的 `ProjectLine`（与 `HomeLine` 同一套机制，执行范围 `executionScope` 归它），可用性判定搬到 `local-host-availability.ts`，场景客户端搬到 `local-host-scenes.ts`，同步客户端搬到 `local-host-sync-client.ts`，调用者快照与授权上下文搬到 `local-host-caller.ts`，类型搬到 `local-host-types.ts`（`local-host.ts` 原样转出）。`LocalHost` 现 230 行，文件 272 行；关闭顺序（`closeProject`、`close`）与 HOST-CLOSE 语义不变。 | 5 |
| `plugin-builder/agent-surface.ts` | `ensureStudio` 函数 196 行<br>`created callback 1` 函数 188 行 | 已拆 · W5-10（批 G） | 已做：`ensureStudio` 只管按项目登记与失败时撤销，装配在 `openStudio`；模型选择与凭据搬到 `studio-models.ts`，沙箱运行器与预览搬到 `studio-preview.ts`，提案的效果图搬到 `studio-images.ts`，交给工作流的端口对象搬到 `studio-ports.ts`；类型、`builderPrompts`、`builderInstructions` 留在 `agent-surface.ts`，所以内置插件包 `plugin-builder` 在宿主里被点名的文件数不变（门禁 `pluginOutsideMentions`）。 | 8 |
| `project-capabilities.ts` | `registerProjectCapabilities` 函数 270 行 | 归线 · §4.3 · W2-08、W3-07 | 里面登记 Goals 的类型化桥，这两片要删（工作区读取的两个 typed id 已由 W2-09 删掉）；删完重量，仍超限就在 W3-07 的同一个 PR 里按能力族拆。 | 5 |
| `project-catalog.ts` | `MolisWorkProjectCatalog` 类 293 行 / 41 方法 | 拆 · W5-10 | 41 个方法里约三十个是三行的转发（项目与插件、运行上下文绑定、桌面面板、工作区成员、示例项目），`constructor` 72 行是装配。按资源分子门面，调用方拿自己要的那个，转发层随之去掉。 | 6 |
| `project-host.ts` | `MolisWorkLocalHost` 类 361 行 / 24 方法 | 归线 · §4.6 · W4-04、W5-01、W5-02 | 项目 composition owner。`constructor` 153 行，文件里 26 处 `registerProvider`，插件族迁到 Runtime 时各删各的（W4-04 先删 Form 的），W5-02 再把名单改成由声明生成。这几片之后类仍超限，W6-04 重量时在门禁里会看到，同一片补拆。宿主自己的服务装配不随插件名单消失（例如 `connectorAccountActionProvider` 那一行连接器装配，#762 记），W6-04 把它们提成按服务分的装配函数，连接器那一段放到连接器的文件旁边。 | 14 |
| `web-catalog.ts` | `handleLocalCatalogWebRequest` 函数 336 行 | 已拆 · W5-10（批 G） | 已做：路由分支改成 `web-catalog-routes.ts` 里按原顺序排的 `CATALOG_ROUTES` 条目（`{id, handle}`，由 W5-07 的 `dispatchWebRoutes` 依次试），设置页与插件设置页两个大分支搬到 `web-catalog-settings.ts`；`web-catalog.ts` 现 28 行，只建请求上下文、分发、再给 `/api` 的 400 与 404。 | 15 |
| `web-connectors-settings.ts` | 已不是巨大单元：`handleLocalConnectorsSettingsHttp` 函数约 115 行（2026-10-26 核，原 227 行） | 已低于阈值 · W5-11 | 连接器提供方设置与 OAuth 的 HTTP。决定 #7 说连接器路由以后搬进各自的官方接入插件，那是 W5-11（Codex C4）。函数已在阈值以下，不再冻结；搬迁时仍按路由或按服务商分开搬，不整体搬进新文件。 | 0 |
| `web-goals-read.ts` | `createLocalGoalsReadHttp` 函数 175 行 | 拆 · W5-10 | `createLocalGoalsReadHttp` 内的 `page`（91）、`settings`（43）、`fragments`（30）三个路由处理各成函数，装配函数只列出它们。 | 8 |
| `web-project-settings.ts` | `createLocalProjectSettingsHttp` 函数 189 行<br>`handle` 函数 182 行 | 拆 · W5-10 | `handle` 的 `if` 路由分支（最大 47、32、24 行）改成路由表，每个路由一个函数。`handle` 内嵌在 `createLocalProjectSettingsHttp` 里（同一段计两次）。 | 3 |
| `web-server.ts` | `createLocalWebServerFactory` 函数 241 行<br>`createMolisWorkWebServer` 函数 238 行 | 拆 · W5-10 | `createMolisWorkWebServer` 49 条语句：HTTP 服务（`server` 74）、本机宿主（`localHost` 16）、周期调度（`schedulerTimer` 14，每 30 秒推进 Feed 与 Schedule）、侧栏浏览器登记（`unregisterSurfaces` 13）、PTY 挂接（12）、关停（`server.once("close")` 12）各成启动函数，装配函数只按顺序调用并登记关停。它内嵌在 `createLocalWebServerFactory` 里（同一段计两次）。 | 7 |

### 工作台 `apps/workbench`（页面组合与浏览器脚本）

14 个单元（拆 7、归线 7），13 个文件。路径前缀 `apps/workbench/src/`。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `capsule-items.ts` | `createCapsuleItemProjection` 函数 229 行 | 拆 · W5-10 | 22 条语句：`stateFromItem`（26）加六个条目构造（决定 19、可做 17、阻塞 15、进行中 14、等待 14、最近完成 17）。每种条目一个函数，投影函数只做组合。 | 2 |
| `feed-projection-ui.ts` | `createWorkbenchFeedProjectionRenderer` 函数 401 行（W5-10 前已降到 251 行） | 已拆 · W5-10（批 F），离开工作台归 BL-880 | 已做（T-058，统筹 2026-10-28 批「原地拆」）：工厂里嵌着的模型函数（`buildFeedModel`、`feedEntries`、`itemModel`、`sourceModel`、`sourceStatusLabel`、`provider`）和界面原语（`feedUiPrimitivesFor`）提到模块级，译文与日期区域经 `FeedText` 显式传入；工厂只建一次原语、组合三个出口，现约 40 行。没有另开文件：新文件要再点名 Feed 包，插件被外部点名的文件数只许减少。随 Feed 离开工作台（让 Feed 自己读数据、改门禁 `checkMigratedFeedUiOwnership` 与枢纽 `renderer.ts`）记为 BL-880。 | 3 |
| `functions/client.ts` | 已在阈值以下（W5-10 批 A，2026-10-26） | 过渡拆分 | 脚本模板按原顺序拆成 `client.ts`（404 行）和 `client-render.ts`、`client-records.ts`、`client-events.ts` 三个部件，拼回后与原脚本逐字节相同；打包成 TS 仍归 W5-04 | 1 |
| `shell-page-renderer.ts`（原 `goals-page-renderer.ts`，W5-06 改名） | `createWorkbenchGoalsPageRenderer` 函数 227 行<br>`renderMolisWorkWeb` 函数 191 行 | 拆 · W5-10 | 外壳页面渲染器（名字不对）。W5-06 改名、换掉 15 个挂载适配器（它们是别的 `goals-*.ts` 文件），第 2 片删掉手写的舞台行，不拆这两个函数。`renderMolisWorkWeb` 191 行里 `html` 模板 109 行、`goalStage` 25 行、`frameStage` 13 行：页面骨架、目标舞台、框架舞台各成函数。它内嵌在 `createWorkbenchGoalsPageRenderer` 里（同一段计两次）。 | 11 |
| `i18n/en.ts` | 文件 3,380 行 | 归线 · §4.7 · W5-03 | 英文词典：一个对象字面量（1,458 行）加几块 `Object.assign(EN, …)`，没有逻辑，没有函数要拆。它也不是例外：决定 #16（全部换成稳定键，词典按主人分）已定，W5-03（§4.7，翻译词典、路由登记这类聚合点改成各主人自己登记）把插件自有词条移给主人、删无引用的键，它随之变小，降到 800 行以下时这一行删除。它是窗口里被改得最多的文件，还从 17 个插件包 import 各自的词条表。在那之前它和所有巨大单元一样只许变小。 | 24 |
| `scripts/client/assistant-island.ts` | 文件 2,813 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（2,803/2,813 行在一个模板字符串里）；工作台客户端分段打包并类型检查。 | 18 |
| `scripts/client/events-primary.ts` | 文件 810 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（808/810 行）。 | 7 |
| `scripts/client/navigation-feed.ts` | 已在阈值以下（W5-10 批 A，2026-10-26） | 过渡拆分 | 脚本模板按原顺序拆成 `navigation-feed.ts`（177 行）和 `navigation-feed-sources.ts`、`navigation-feed-stage.ts` 两个部件，拼回后与原脚本逐字节相同；里面写死的 Feed 客户端随 Feed 迁 Runtime（FI-6）离开，打包成 TS 仍归 W5-04 | 5 |
| `scripts/client/tab-workspace.ts` | 已在阈值以下（W5-10 批 A，2026-10-27，按职责重拆） | 按职责拆 | 脚本模板里 110 条“只定义一个函数”的语句（常量箭头函数，求值时不执行任何东西）中，105 条按职责搬进六个部件；有副作用或有求值顺序的 103 条语句（取值、状态、监听、守卫）留在主文件原位原序，主文件 565 行。部件：`tab-workspace-panes.ts`（窗格对账、挂载内容、分栏树与几何，以及保存状态、通知父页面，320 行）、`tab-workspace-strip.ts`（标签条的标记、宽度分配、绘制、按键与点击，374 行）、`tab-workspace-places.ts`（每个窗格的历史、盖层、回退与所在位置，262 行）、`tab-workspace-plugins.ts`（插件页面与记录、打开条目，205 行）、`tab-workspace-menus.ts`（标签、分组与布局菜单，连同 `placeLayoutMenu`，127 行）、`tab-workspace-drag.ts`（拖动标签，121 行）。另外 5 条定义含空 `catch`（`restore`、`collapsePluginStage`、`saveRecords`、`persistHistory`、`paintResultPreview`），不搬，留在主文件，所以空 `catch` 仍是主文件的 8 处、新文件为 0，没有往模板里加注释。渲染出的浏览器程序与原来逐字节相同（167,467 字节；各行的多重集相同；103 条原位语句顺序一致；搬动的 105 条函数定义里 104 条只往前移、1 条相对位置没动，没有往后的），做法是把两个版本各自渲染出的程序按语句逐条比对；宿主发出前经 esbuild 压缩，相邻的 `const` 声明合并得更多，`/assets/molis-work-workbench.js` 因此少 52 字节（1,147,241 → 1,147,189，预算同一个 PR 里降到实测）。`dom-events.ts` 里 `tab-workspace` 主人的文件表按谁发谁听改成主文件、panes、places、plugins。打包成 TS 仍归 W5-04 | 11 |
| `tab-workspace-ops.ts` | `createTabWorkspaceOps` 函数 461 行 | 拆 · W5-04 | 标签工作区的纯规则，文件头 `// @ts-nocheck`，用 `toString` 序列化后注入浏览器。50 条语句里 `splitPane`（33）、`moveTab`（30）、`normalizeLayout`（22）、`ensureHome`（21）、`openBeside`（21）等本来就各自独立。W5-04 把交付形式改成打包的类型检查模块时，这些变成各自的模块导出，同一个 PR 拆到阈值以下。（本清单对 W5-04 的范围解释：凡在浏览器里跑的代码，不论模板字符串还是 `toString` 注入的函数。） | 2 |

### Agent Host `horizontal/agent-host`（唯一直接依赖 `@prologue/sdk` 的包）

15 个单元（拆 15），11 个文件。路径前缀 `horizontal/agent-host/src/`。

R-38 第 1 片的本轮评审修复（PR #1226，2026-10-24，Codex）：只修 `prologue-git.ts` 抽出的 `settleReview` 解构 `readDecision` 后丢失 Ports 接收者的问题，保留 `ports.readDecision(...)` 方法调用；不改变四文件拆分、权限、取消、SDK Effects 或公共 API。目标是这条既有端口合同的定向工程验证通过，之后交独立增量复查与共同集成，不代表 R-38 整线完成。

验收：**R38-GIT-RECEIVER-01** 通过生产 `createPrologueGitReviews → queue.refresh → settleReview`、真实 SDK Effect 和依赖 `this` 保存决定的 Ports，旧解构应失败，修后投影出原存储决定及核对依据；**R38-GIT-RECEIVER-02** 同路径的无 `this` 实现结果不变；**R38-GIT-RECEIVER-03** 决定读取在收口阶段失败时，原错误对象继续传播，不伪装成功。回归放在 `tests/prologue-git.test.ts`；原两条暂存区真实恢复用例连同全部原断言归入已持有同一实现依赖的 `tests/workspace-git-index.test.ts`，不新增公开测试 API 或增加逐文件内部导入数。整体构建后运行这两份用例、Agent Host README 必跑和受影响的 Git/审查用例；原四文件拆分的其他有效逐片证据复用，浏览器与 full 仍由统筹按共同集成排期。

本轮定向结果（2026-10-24）：原 `ef71a03c1` 实现上三项新回归为 1/3，无接收者依赖的正控通过，两项实例方法用例均在真实生产 `settleReview` 丢接收者失败；最小修复后同三项 3/3，通过真实决定与原错误对象验证。整体构建、24 个必要回归文件、边界及对合并基点 `112114f23` 的健康检查通过；未增加内部导入、未改公共 API、基线或门禁，也未重新拆其他单元。原四文件的逐片证据保留，本轮结果交独立复查与共同集成，不代替 full 或实际合并。

R-38 第 2 片的恢复守卫补修（PR #1273 FIRST 第 2 项，2026-10-25，Codex，恢复守卫定向工程验证通过，待独立复查与集成）：固定源 `d97df5ab75fb21dc445d1aea0abf56ea117d61aa` 在装配 `guardedRecovery` 时展开 Runtime，丢失原型 getter 并冻结当时的 `checkpoints` 引用，可能让随后正在回退的会话被关闭。只改 `adapters/prologue.ts` 装配、`prologue-adapter-capabilities.ts` 参数与读取、现有 `tests/prologue-recovery.test.ts` 及本段；保留原 Runtime 对象，恢复能力单独传入，`close` 决策当刻读取原对象的 `checkpoints.busy(session)`。不改公开 API、SDK、Memory、其他 FIRST 项或上述拆分表状态。

输入仍为原会话引用、轮次 id 与预期版本；忙碌时返回原 `agent.session_busy`，不调用底层关闭、不写恢复状态或重载缓存；解除忙碌后返回底层报告，并按原顺序清除会话缓存、重载现状。会话/子任务归属、`startingSessions` 互斥与 `try/finally` 释放、原错误及失败状态保持。目标仅为该问题的定向工程修复，独立复查与共同集成后再裁决，不代表 R-38、W5-10 或整条防腐线完成。

验收：**R38-RECOVERY-LIVE-01** 通过真实 `PrologueAgentAdapter.recovery.close`，原型 getter 提供的当前 busy 状态必须拒绝，底层关闭零调用、恢复状态零写；**R38-RECOVERY-LIVE-02** 同一 adapter 构造后替换 `runtime.checkpoints` 为 busy 也必须拒绝，不能读构造时快照；**R38-RECOVERY-LIVE-03** 两种端口解除 busy 后均可合法关闭并重载当前会话，原错误会话/轮次拒绝、并发互斥及恢复失败投影回归保持。先在固定源运行新增回归并保留首次失败，再做最小修复；整体 `pnpm build` 后运行恢复、检查点和 Agent Host README/Skill 要求的定向用例，执行 `pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、`pnpm secrets:check`。构建与浏览器批次遵循公共 FIFO，不启动 full 或真实 Home。

本轮验证：最终同版三项回归在独立 `d97` 源码上 1 通过 / 2 失败（均为应拒绝却放行），候选 3/3 通过；修后首次两次运行另暴露新增断言误把即时 busy 当固定值、把空轮次当 `undefined`，按现行合同改为 busy 为真、空轮次为 `null`，原失败日志保留，生产补丁未再改。整体构建、边界及对合并基点 `3817f875` 的健康检查通过，无门禁或基线改动。README/Skill 的 84 个非浏览器文件通过（574 项通过、2 项既有 npm/MiniMax opt-in 跳过）；4 个浏览器文件首次 2 通过 / 2 失败，完整日志保留。升级授权的本地 HTTPS 400/TLS 断开在 `d97` 同样失败；`W2-18-BUILDER-LATE-01` 首次等待 ready 超时，而 `d97` 同文件 42/42 通过，原因未确定，不以时序概括，也不把扩展回归记为全绿。独立复查与统一 full 另行裁决。

R-38 第 2 片的 Store 状态归属整理（PR #1273 FIRST 第 3 项，2026-10-25，Codex，原行为的定向工程验证通过，待独立复查与集成）：接已双核、统筹释放的 `9f8338a5e4bb5258a72f3919069b03c681a2e51d`，只收拢 `PrologueRunStore` 已持有的三个集合与现有持有期、缓存重载。集合变为私有，消费者只读观察；创建会话与登记运行通过必要窄入口写入。三个操作的原拒绝检查留在各自入口、保持同步求值顺序；占用会话、等待、finally 释放统一由 Store 执行，不加第二把锁、新状态、排队、错误分类或通用框架。

恢复关闭成功及回答结果为 queued 时，仍先等原操作成功，再由同一 Store 方法删除会话缓存并等待原 loadSession 重载；起跑失败则仍只在 Runtime 支持 restore 时失效缓存，不当场重载，不误当成功。运行登记仍先入运行表、再加入原会话，随后 follow/publish；恢复能力保留原接收者，动态 busy 仍在原决定点读取。范围限于 `prologue-run-store.ts`、`prologue-run-start.ts`、`prologue.ts`、`prologue-adapter-capabilities.ts`、必要现有真实 adapter 回归与本段；不改 Memory、SDK/公共合同、时限、安全拒绝、FIRST 第 1/4 项或原表状态。PIPE 已核承接顺序为 d97 → 9f → 本 Store 后继 → #1064（430f65b）→ #1101（8506bac）；Memory 原作者后到处理 prologue.ts/Cache 融合，真实 WIP 由 Root/Claude 交 fixed 头，仅同处串行，不整文件覆盖。

验收：**R38-STORE-01** 真实 adapter 起跑在异步等待中同会话排他、不同会话可并发；拒绝后 finally 释放，支持 restore 的失败只失效且下次读取才重载，不支持 restore 的原缓存保留。**R38-STORE-02** 关闭/准备回退的异步持有期同样排他，throw/reject 后可再尝试；非本会话轮次/子任务仍先拒绝，失败零恢复写、零成功重载，合法关闭只在成功后重载一次，准备回退不借机重载。**R38-STORE-03** 原动态 busy、queued 回答重载、控制失败/恢复投影、检查点真实 SDK 与运行登记/观察/关闭合同保持；源码与构建核对集合外无写入及三处 add/finally/delete、两处删除重读已归唯一 Store，无新巨大单元或公开 API 变化。

目标仅为现有行为保持的定向工程整理。新增并发/失败回归先在冻结 9f 的构建上通过，再在整理后通过；复用已核红绿与原 91 文件阶段证据，不机械重跑其全体。按本次调用影响运行 Agent Host README 必跑、Skill 三个通用检查及恢复、检查点、状态/控制/起跑必要文件，整体构建、boundary、merge-base health、提交前 secrets；公共 FIFO 单构建/单浏览器，作者不启动 full 或真实 Home。双核及统筹释放前不接下一项，carrier/full/main 与产品验收另由对应阶段核收。

本轮结果：新增四项在冻结 9f 构建及候选均 4/4，候选含原动态 busy 三项的重点组 7/7，完整恢复 21 + 检查点 4 = 25/25；无跳过。整体构建、边界、对合并基点 3817f875 的健康检查通过，集合外无写入、无新公开 API 或巨大单元。28 文件首批 27 文件通过（195 项通过、1 项取消、零跳过），唯一文档资源释放用例达到原 120 秒 deadline，首记录保留；同文件、原 36 次 8 MiB 和断言不变，在 9f 与候选的独立单跑均 1/1 自然退出 0（约 53/35 秒），不把首批改成全绿，原因仍 UNKNOWN。后到 Memory 的实际恢复批次、生命周期投影清除及单份恢复合并适配清单已交 PIPE，当前未实施 Memory 或声明整合完成。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `adapters/plugin-builder.ts` | `createPluginBuilderAgent` 函数 204 行<br>`run` 函数 153 行 | 已拆（W5-10，R-38 第 1 片） | 已做：代码角色的权限钩子（`frozenAuthority`）、`plugin-checks`（`pluginChecks`）、Skill 挂载、截图入库、事件记账、重启时标记中断的记录各成模块级函数，`run` 只剩执行顺序。原计划：`run` 里 `execution` 一段 127 行，另有 `guard`（5）、`record`（3）；`createPluginBuilderAgent` 里 `authority` 16 行。执行体、守卫、记录、权限各成函数。`run` 内嵌在 `createPluginBuilderAgent` 里（同一段计两次）。 | 5 |
| `adapters/prologue-action-gateway.ts` | `prologueActionGateway` 函数 174 行 | 已在阈值以下（R-38 收尾核对，2026-10-25） | 现 148 行（函数阈值 150），门禁 `--report` 已不列，不再拆；以后再长超过阈值时照原计划拆。原计划：`executors` 表（51 行）、`invoke`（30）、`tools` 装配（24）各成函数；`memoryExecutors`、`delegationExecutors` 已是模块级函数，和 `executors` 放进同一个目录。 | 4 |
| `adapters/prologue-checkpoints.ts` | `createPrologueCheckpoints` 函数 221 行 | 已拆（W5-10，R-38 第 2 片） | 已做：审查预览（`rewindDocument`）、结果收口（`settleRewind`）、给下一轮的回退记录（`rewindContext`）、列检查点（`sessionCheckpoints`）、把人的决定送到 SDK（`answerRewind`）各成模块级函数，主函数只留会话状态与恢复。原计划：`capability` 对象 125 行：`busy`、`restore`、`context` 等方法各抽成函数，`context` 里拼“宿主的实际操作记录”提示文字的一段单独成文件；`restore`（30）、`document`、`settle`（各 15）已是独立块。 | 1 |
| `adapters/prologue-git.ts` | `createPrologueGitReviews` 函数 188 行 | 已拆（W5-10，R-38 第 1 片） | 已做：人工核对的绑定搬到 `prologue-git-recovery.ts`（`bindGitRecovery`），`requestOf`、读审查归属、结果收口成模块级函数。原计划：返回的对象 72 行、`bindRecovery` 50 行、`restore` 23 行；操作各成函数，恢复绑定独立成文件。 | 2 |
| `adapters/prologue-mcp.ts` | `createPrologueMcpLibrary` 函数 232 行 | 已拆（W5-10，R-38 第 1 片） | 已做：读配置、关连接、视图、凭据解析、按传输方式建配置、连接、两种校验、已连接工具各成模块级函数，共用状态经 `McpState` 传入。原计划：`library` 对象 165 行：`list`、`save` 等方法各成函数，`save` 里按传输方式（stdio、http）的分支各成校验函数；`refreshSelected`（13）、`view`（10）随各自的操作。 | 2 |
| `adapters/prologue-messages.ts` | `createSessionMessages` 函数 170 行 | 已拆（W5-10，R-38 第 1 片） | 已做：发信钩子（`guardSessionSend`）、给收信轮的文字、给人看的视图成模块级函数。原计划：只超 20 行。返回对象 85 行、钩子注册 33 行、`unsubscribe` 21 行；把钩子注册与返回对象分成两个函数。 | 0 |
| `adapters/prologue-stream.ts` | `applyPrologueEvent` 函数 304 行 | 已拆（W5-10，R-38 第 2 片） | 已做：每种事件一个处理函数，全部登记在 `HANDLERS` 表里，`applyRunEvent` 按类型分发，表里没有的计为未知帧；三种用量事件与用量汇总搬到 `prologue-stream-usage.ts`；结束类事件共用 `endRound`。原计划：`applyPrologueEvent` 是一个 298 行的 `switch`；每种事件一个处理函数，`switch` 只分发。 | 6 |
| `adapters/prologue-taskboard.ts` | `createPrologueTaskBoards` 函数 220 行 | 已在阈值以下（R-38 收尾核对，2026-10-25） | 协作包搬进 Prologue 之后（P3a，#534）现 129 行（函数阈值 150），门禁 `--report` 已不列，不再拆。原计划：返回对象 147 行、钩子 31 行、`unsubscribe` 17 行：钩子注册、跟随（`following`/`stopFollowing`）、返回的任务板操作各成函数。 | 2 |
| `adapters/prologue.ts` | 文件 1,026 行<br>`PrologueAgentAdapter` 类 658 行 / 18 方法<br>`(module) callback 1` 函数 187 行 | 已拆（W5-10，R-38 第 2 片） | 已做：端口与类型声明搬到 `prologue-ports.ts`（`prologue.ts` 原样转出），会话与运行的持有、恢复、跟随与发布搬到 `prologue-run-store.ts`（`PrologueRunStore`），起一轮（原 `#start`）搬到 `prologue-run-start.ts`，能力矩阵与恢复、回退、子任务的守卫搬到 `prologue-adapter-capabilities.ts`；`prologue.ts` 剩 321 行，适配器只留各能力入口与会话读写。原计划：文件、类、私有方法三个单元互相包含：文件 1,026 行 > `PrologueAgentAdapter` 658 行/18 方法 > 私有方法 `#start` 187 行（门禁里记作 `(module) callback 1`，见 §1）。`#start` 按阶段拆；类里还有 `constructor`（81）、`#publish`（63）；会话读写（`createSession`、`readSession`、`#loadSession`、`#restoreSession`）与运行控制（`start`、`control`、`observe`）分成两个协作者；类型与端口声明另放文件，文件回到 800 行以下。W4-06 不含它。 | 8 |
| `capability-registration.ts` | `registerAgentHostCapabilities` 函数 393 行 | 已拆（W5-10，R-38 第 2 片） | 已做：方法库与 MCP（`library-actions.ts`）、跟随与控制一轮及项目排队（`run-actions.ts`）、会话间的信与后台命令（`message-actions.ts`）、命令回执、中断核对、检查点与审查（`recovery-actions.ts`）各成 `register…` 函数，共用的调用端口在 `capability-ports.ts`；主函数只留身份解析、会话与运行时的读写。原计划：`registerAgentHostCapabilities` 的 `disposers` 数组占 326 行；按能力族分成几个 `register…` 函数，主函数合并它们的撤销函数。 | 2 |
| `index.ts` | `AgentHost` 类 409 行 / 12 方法<br>`start` 函数 267 行 | 已拆（W5-10，R-38 第 2 片） | 已做：角色与工作区检查、会话核对、Character 选择、授权守卫、逐项能力与能力网关、MCP、整理与收尾提示、子任务、冻结结果核对各成 `run-start.ts` 的函数，`start` 只按顺序调用并起跑；`composeRolePrompts` 等角色规则随之搬过去。原计划：`start` 267 行、53 条语句，`if` 块最大 22 行：预算与执行计划冻结、提示词解析、角色与运行时能力检查、工作区模式检查（含无工作区推理的限制）、起运行并回收（`handle` 23 行）各成函数；`AgentHost` 的 12 个方法其余部分（`availableRoles` 27、`createSession` 20）随之。`start` 在类里（类和方法各计一次）。 | 8 |

### 其他横向服务 `horizontal/*`（含平台产品服务：记忆、放置、搜索）

6 个单元（拆 6），5 个文件、5 个包。路径前缀 `horizontal/`。

| 包 | 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | --- | ---: |
| `listener-host` | `src/index.ts` | `ListenerHost` 类 289 行 / 18 方法 | 已拆 · W5-10 | `584112c6` 实测 361→289 行（原表 373 为旧值）；投递转换/Signal 回执提交和批量持久化提为同文件函数，显式传原 db/signals/options 与晚取的时钟/cursor 操作。运行、租约与 checkpoint 留在原实例，最大函数 `run` 135 行，文件 760 行。 | 5 |
| `memory` | `src/service.ts` | 文件 1,338 行<br>`MemoryService` 类 1,101 行 / 56 方法 | 拆 · W5-10 | 决定 N-03：代码不搬，只在包内拆。`MemoryService` 56 个方法分组：偏好、召回与使用（`recall` 57）、写入与候选（`commit` 107、`change` 71、`propose`、`accept`）、从工作中学习（`learnFromWork`）、维护（`upkeep` 91、`pairs`）、范围操作（`previewScope`、`clearScope`、`exportScope`、`importScope`）。每组一个协作者；声明与类型另放，文件回到 800 行以下。路线 W4-08 末尾写“再拆 MemoryService”，但 N-03 决定把 W4-08 改成文档与边界规则，所以拆分改归这一片。 | 3 |
| `placement` | `src/index.ts` | `PlacementService` 类 286 行 / 20 方法 | 已拆 · W5-10 | `584112c6` 实测 399/28→286/20（原表 419 为旧值）；同包同文件拆出 Goal 查询、复制/转换及位置/可用操作投影函数。读取、定位、记账与打开按原实例晚绑定；移动及 S-35 恢复原实现保留，不增加提交间隙或共享 caller。最大函数 `describe` 69 行，文件 540 行。 | 3 |
| `scheduler` | `src/index.ts` | `createScheduleService` 函数 282 行 | 拆 · W5-10 | `createScheduleService` 里 `fire` 86 行、`register` 38、`claim` 23、`setEnabled` 20、`toRecord` 20、`tick` 19、`renewExecutions` 16：触发（`fire`、`claim`、`tick`、`renewExecutions`）与登记管理（`register`、`setEnabled`、`toRecord`）分成两个文件。 | 2 |
| `search` | `src/index.ts` | `SearchService` 类 283 行 / 21 方法 | 已拆 · W5-10 | `584112c6` 实测 392/25→283/21（原表 407/26 为旧值）；同步索引、正文读取、来源/状态投影与范围判断提为同文件函数，最大 67 行，文件 597 行。map/timer/inflight/close 留在实例，changeSeq/closed 在原位置晚取，时钟保原接收者；query 的 ACA005 授权复核和同步尾检保留。 | 4 |

### 业务事实 Module `modules/*`

17 个单元（拆 17），12 个文件、4 个包。路径前缀 `modules/`。

| 包 | 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | --- | ---: |
| `goals` | `src/event-facts-repository.ts` | `GoalEventFactsRepository` 类 371 行 / 29 方法 | 已拆 · W5-10（批 E） | 已做（文件现在在 `plugins/native/goals/src/module/`）：按表族三个类，配置与事件类型 `GoalEventConfigRecords`（158 行）、要求与绑定 `GoalEventRequirementRecords`（124 行）、工作事件与判断 `GoalWorkEventRecords`（196 行）；原类名留作组合体（17 行，属性 `config`、`requirements`、`workEvents`），方法体逐字搬过去，调用点只多一层属性。 | 1 |
| `goals` | `src/event-facts.ts` | `GoalEventFacts` 类 576 行 / 35 方法 | 已拆 · W5-10（批 E），门面标为例外 | 已做（文件现在在 `plugins/native/goals/src/module/`）：配置（`configure`、`configureRequested`、`readConfig`）搬到 `event-facts-configure.ts` 的 `GoalEventConfiguration`（266 行），汇报（`report`）搬到 `event-facts-report.ts` 的 `GoalEventReporting`（107 行），分页读取与意图来源搬到 `event-facts-reads.ts` 的 `GoalEventReads`（106 行）；`GoalEventFacts` 只留装配和合同 `GoalEventFactsApi` 要求的转发（193 行 / 30 方法，行数在阈值以下，方法数超 5，已在 `giant-exceptions.json` 标为 cohesive-unit）。原计划里“去掉转发层、让调用方直接拿 `GoalEventState` 的入口”要把 `GoalEventFactsApi` 拆成事实与状态两个接口，是合同改动，没有做，等用户定（BL-781）。 | 2 |
| `goals` | `src/event-state-effects.ts` | `GoalEventStateEffects` 类 539 行 / 12 方法<br>`recordTrustedDecision` 函数 155 行 | 拆 · W5-10 | `recordTrustedDecision`（155，在类里，类和方法各计一次）、`submitClosure`（118）、`requestDecision`（82）三个大方法各成命令类，`resumeWork`、`citeDecision`、`reopenCompletion`、`reassessAfterReports` 随各自的主题。 | 1 |
| `goals` | `src/event-state-repository.ts` | `GoalEventStateRepository` 类 408 行 / 30 方法 | 已拆 · W5-10（批 E） | 已做：按表族四个类，所有者、工作状态与约定 `GoalEventOwnerRecords`（119 行）、顾虑 `GoalEventConcernRecords`（93 行）、决定请求与已应用决定 `GoalEventDecisionRecords`（185 行）、进度、结论与收尾 `GoalEventOutcomeRecords`（191 行）；范围的归一与包含判断放进 `event-state-scope.ts`；原类名留作组合体（20 行，属性 `owner`、`concerns`、`decisions`、`outcomes`）。 | 2 |
| `goals` | `src/guidance-commands.ts` | `GuidanceCommands` 类 368 行 / 3 方法<br>`update` 函数 201 行 | 已拆 · W5-10（批 E） | 已做（文件现在在 `plugins/native/goals/src/module/`）：`GuidanceCommands` 只留 `read` 和对 `add`、`update` 的转发（33 行）；`add` 在 `guidance-add.ts`（164 行），`update` 在 `guidance-update.ts`（246 行：读取并规范化输入、动作与状态校验、条目更新、事务各成函数，最长的 `applyGuidanceUpdate` 约 55 行）；两者共同的尾部（版本行、`UPDATE boards`、追加事件）抽成 `guidance-write.ts` 的 `writeGuidanceRevision`（76 行）。校验顺序、SQL、幂等回执与事务边界不变。 | 1 |
| `goals` | `src/lifecycle-archive.ts` | `setTrashed` 函数 185 行<br>`setTrashed callback 1` 函数 174 行 | 拆 · W5-10 | `setTrashed` 的返回里是 174 行的事务回调（同一段计两次），按步骤拆；`GoalArchiveCommands` 其余方法留在类里。 | 2 |
| `private-work-context` | `src/session-handoffs.ts` | `SessionHandoffRepository` 类 325 行 / 14 方法 | 拆 · W5-10 | 草稿（`createDraft*`、`updateDraft*`）、发送状态（`markSending`、`attachDestination`、`markFailed`、`markSent`、`cancel`）、恢复中断与行映射（`recoverInterrupted`、`map`）三组。 | 0 |
| `private-work-context` | `src/session-records.ts` | `SessionRecordRepository` 类 320 行 / 15 方法 | 拆 · W5-10 | 创建与发现（`createSession`、`discoverSession`、`explicitlyLinkSession`、`linkNativeRuntimeSession`）、关联更新（`updateAssociations*`、`setAssociationReferences`、`reassignWorkspaceSessions`）、查找（`get`、`find*`、`list`、`goalHistory`）三组。 | 0 |
| `private-work-context` | `src/session-registry.ts` | `MolisWorkSessionRegistry` 类 174 行 / 29 方法 | 拆 · W5-10 | 对外门面：29 个方法几乎都是转发，只因方法数超标。按会话、交接、事件三组拆成子门面，调用方拿自己要的那个。 | 2 |


### 平台包 `packages/*`

23 个单元（拆 19、归线 2、例外 2），19 个文件、6 个包。路径前缀 `packages/`。

| 包 | 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | --- | ---: |
| `design-system` | `src/plugin-component-client.ts` | `createPluginComponentClient` 函数 754 行 | 已拆（W5-10 R4a） | 渲染器按层拆成十个函数（`pcKit`、`pcRelations`、`pcRecords`、`pcDetail`、`pcControls`、`pcOutput`、`pcQuery`、`pcSubmit`、`pcPart`、`pcLifecycle`），分在 `plugin-component-{kit,records,controls,output,part,client}.ts`，各层是 `(state + 前面各层) → 本层函数` 的纯函数，仍用 `toString` 拼成同一个工厂脚本（`PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT` 的求值结果不变）。可变的标量（`view`、`selection`、`epoch`…）放在共享状态上，别的与原闭包同文。最大一层 143 行。W5-04 改成打包模块时可把层间交接改成 import（BL-551）。 | 3 |
| `design-system` | `src/primitives/catalog.ts` | 文件 947 行<br>`renderPrimitiveCatalog` 函数 648 行 | 已拆（W5-10 R4a） | 章节搬到 `catalog-controls.ts`（控件）、`catalog-layout.ts`（目录与外壳）、`catalog-compose.ts`（选项与组合）、`catalog-parts.ts`（`section`/`mark`/`specimen`），`renderPrimitiveCatalog` 只列章节；页尾演示脚本改成 `src/browser/catalog.ts` 打包进 `dist/catalog-client.js`（`page-clients.ts` 读）。除脚本外，板子的 HTML 与拆分前逐字节相同。 | 3 |
| `design-system` | `src/styles/calm-desktop.ts` | 文件 1,392 行 | 归线 · §4.8 · W5-05 | 已删（W5-05 第 5 片）：还在决定计算值的声明挪进各自主人的样式表，记录见 `specs/repository-anti-corruption/spec.md` §W4-12。 | 3 |
| `design-system` | `src/styles/craft-finish.ts` | 文件 2,313 行 | 已拆样式，脚本留 W5-04（R4a） | 1,720 行样式拆成 `craft-finish-bar.ts`、`craft-finish-assistant.ts`、`craft-finish-pages.ts` 三份（按小节切、级联顺序不变，拼出的 `CRAFT_FINISH_STYLES` 与拆分前逐字节相同），共用的选择器片段在 `craft-finish-selectors.ts`；不登记例外。235 行 `CRAFT_FINISH_CLIENT_SCRIPT` 仍在 `craft-finish.ts`：搬到新文件会让「文本程序」计数在新文件 0→1，所以留到 W5-04 打包成 TypeScript（BL-550）。 | 14 |
| `design-system` | `src/styles/momentum.ts` | 文件 819 行（门禁量） | 例外 · 样式表 | `MOMENTUM_STYLES` 一个模板字符串，纯 CSS（Goals 动量视图）。2026-10-25 复核（用户「本身合理可以不硬拆，标明即可」）：维持例外，`kind: stylesheet`；#1289 合入后在 `giant-exceptions.json` 补 `size: 819`。 | 4 |
| `design-system` | `src/styles/personal-workbench-v3.ts` | 文件 1,422 行 | 归线 · §4.8 · W5-05 | 已删（W5-05 第 4 片）：还在决定计算值的声明挪进各自主人的样式表，记录见 `specs/repository-anti-corruption/spec.md` §W4-12。 | 1 |
| `design-system` | `src/styles/primitives.ts` | 文件 1,258 行（门禁量） | 例外 · 样式表 | `PRIMITIVE_STYLES` 一个模板字符串，纯 CSS，开头只有几个共用的 CSS 片段常量。2026-10-25 复核：维持例外，`kind: stylesheet`；#1289 合入后补 `size: 1258`。 | 1 |
| `im-ui` | `src/browser/controller.ts` | 文件 966 行<br>`startIm` 函数 957 行 | 已拆（W5-10） | `startIm` 剩约 35 行装配：页面状态收进一个 `ImState`（原来 29 个闭包变量），元素与服务放进 `ImCtx`，十层各一个自包含工厂 `controller-{shell,composer,sync,rooms,topics,navigate,dialogs,startup,page,clicks}.ts`（最大 126 行），层与层经 `c.<名字>` 后绑定调用，仍由 `client.ts` 用 `toString` 序列化进页面。函数体逐字搬动，只把变量引用改成 `s.<名字>`/`c.<名字>`；一处原有的空 `catch` 补了说明。浏览器用例交集成批。 | 1 |
| `im-ui` | `src/views.ts` | `createViews` 函数 149 行 | 已拆 · W5-10 | `584112c6` 实测 162→149 行（原表 164 为旧值）；chrome 的 markup/cache/focus 操作提为同文件私有装配函数，由 client 显式捕获进序列化闭包。根节点与两 WeakMap 仍按实例持有，controller/交互规则不变；相关说明移到函数外仍保留，实际下发脚本 81,646→81,448 字节。 | 0 |
| `kernel` | `src/action-service.ts` | `ActionService` 类 413 行 / 15 方法 | 拆 · W5-10 | `registerProvider` 的 `try` 块有两个循环：动作登记（每个动作的 `execute` 闭包里是限速、生命周期、`beforeEffect` 检查、输出校验）和场景登记（逐项校验、登记）。W3-01 把结算搬出 `execute`（到 `action-settlement.ts`，由 `invoke` 与 `invokeSync` 做），`registerProvider` 因此降到阈值下、不再是巨大单元；两个循环各成函数、`execute` 的各步再各成助手仍是 W5-10 的做法。类里场景相关的 `discoverScenes`、`bind`、`runScene`、`requireScene` 为一组，动作相关的 `discover`、`inspect`、`directory`、`invoke` 为另一组。W3-05 的交叉校验已做：校验代码在 SDK 的 `action-cross-references.ts`，`registerProvider` 只在原有的一行里多调一个函数，没有加行（它离阈值不远，以后也这样加）。 | 3 |
| `plugin-runtime` | `src/events.ts` | `PluginEventBus` 类 420 行 / 23 方法 | 拆 · W5-10 | `PluginEventBus` 的 23 个方法分三组：发布与匹配（`publish` 72、`#match`、`#enqueue`）、投递（`#deliver` 99、`#fail`、`#resume`、`drain`）、游标与恢复（`#saveCursor`、`recover`、`recoveryHistory`、`cursors`）。 | 4 |
| `plugin-runtime` | `src/index.ts` | `PluginRuntime` 类 660 行 / 30 方法（文件 886 行，W3-06 A 把 `MemoryPluginRuntimeRepository`、`NativePluginExecutor` 和 `validateManifest` 等模块级函数移到 `memory-repository.ts`、`native-executor.ts`、`runtime-rules.ts`，文件 760 行，已不是巨大单元） | 拆 · W5-10 | `PluginRuntime` 660 行/30 方法分三组：安装与卸载（`install` 115、`uninstall*`）、版本切换（`upgrade`、`rollback`、`changeVersion` 117）、生命周期（`start*`、`stop*`、`recover*`、`reportCrash*`，各有 `…Once` 版本）。W3-06 要加 Home 级实例，类已冻结，它的新增部分先写在新文件里。 | 4 |
| `plugin-runtime` | `src/supervisor.ts` | `PluginSupervisor` 类 592 行 / 31 方法 | 拆 · W5-10 | `PluginSupervisor` 31 个方法分三组：启动与重启（`start` 56、`#restart` 39、`#activate` 37、`ensureStarted`）、升级回滚（`#changeVersion` 57、`upgrade`、`rollback`、`#resolveInstalledEntry` 51）、撤销与启用（`revoke` 30、`enable`）。W4-02 要在监督器里登记和收回 Manifest methods，类已冻结，它的新增部分先写在新文件里。 | 3 |
| `plugin-runtime` | `src/wiring.ts` | `PluginInputGraph` 类 497 行 / 26 方法 | 拆 · W5-10 | `PluginInputGraph` 26 个方法：解析（`#resolve` 134 行）抽成求值器；绑定与选择（`bind` 46、`bindArtifact`、`unbind`、`selectInputGroup`）、发布与失效（`publish`、`invalidate`、`retain`）、视图与状态（`status`、`view`、`reference`、`currentVersion`）各成协作者。 | 4 |
| `plugin-sandbox` | `src/runner.ts` | `createSandboxRunner` 函数 174 行 | 拆 · W5-10 | `createSandboxRunner` 39 条语句：消息接收 `receive`（42）、返回对象（42）、子进程启动（`try` 14）、看门狗（12）、关停（9）各成函数。 | 1 |
| `storage` | `src/adapters/search-storage.ts` | `createSearchOpaqueBlobStore` 函数 161 行 | 拆 · W5-10 | 只超 11 行。返回的对象 125 行，其中的 CAS 操作与 `trustedNowUnixMs`（8）移到模块级；`inImmediate` 已在模块级。 | 2 |
| `storage` | `src/adapters/text-search-index.ts` | `openTextSearchIndex` 函数 153 行 | 拆 · W5-10 | 只超 3 行。返回对象 90 行，其中 `if` 块 17 行抽成函数即可。 | 2 |

### 内置插件 `plugins/native/*`

40 个单元（拆 33、归线 7），33 个文件、14 个包。路径前缀 `plugins/native/`。

| 包 | 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | --- | ---: |
| `alchemist` | `src/studio/server/bootstrap/local-runtime.ts` | `createLocalRuntime` 函数 243 行 | 拆 · W5-10 | `createLocalRuntime` 50 条语句：`dependencies`（34）、返回（31）、`handlers`（18）、`pulseSources`（12）、`calibrationMemory`（12）、`createResearchPlan`（11）、`runPending`（10）各成 `create…` 函数。 | 1 |
| `coding` | `src/client.ts` | 文件 1,656 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,631/1,656 行）。 | 8 |
| `coding` | `src/timeline.ts` | `createCodingTimeline` 函数 263 行 | 拆 · W5-04 | 对话时间线：`toString()` 注入浏览器，必须自包含（263 行，`renderFooter` 65、`renderGroup` 27、`KIND` 26、`FAILURES` 21）。W5-04 打包 Coding 的浏览器代码时，各块成模块并拆到阈值以下。（对 W5-04 范围的解释同 `tab-workspace-ops.ts`。） | 1 |
| `coding` | `src/ui.ts` | `renderCodingWorkbench` 函数 214 行 | 拆 · W5-10 | `renderCodingWorkbench` 的返回里有一段 205 行的 HTML 模板。文件里已有 `renderCodingDirectory`、`renderCodingSettings`、`renderPendingQuestionCard`、`renderCodingIdentity` 这样的区块函数，工作台主体的其余区块照此各成函数。 | 2 |
| `cognia` | `src/store.ts` | `CogniaStore` 类 122 行 / 28 方法 | 拆 · W5-10 | 122 行、28 个方法，每个方法很短；类不属于例外的四种。按表分四个仓库：域（`createDomain`、`renameDomain`、`deleteDomain`）、来源（`sources`、`renameSource`、`deleteSource`）、材料（`materials`、`preview`、`commit`、`createMaterial`、`updateMaterial`）、草稿（`drafts`、`addDraft`、`archiveDraft`、`saveDraft`；草稿的视图与采纳规则已在 `drafts.ts`，这一组只需带走表访问）。 | 2 |
| `feed` | `src/application.ts` | `FeedApplication` 类 503 行 / 44 方法 | 已拆 · W5-10（批 F） | 已做（T-059）：来源与运行记录搬到 `application-sources.ts` 的 `FeedSources`（调用方写 `feed.sources.get` 等），捕捉规则搬到 `application-out-rules.ts` 的 `FeedOutRules`（`feed.outRules.*`），摄入后的捕捉、外送失败记账与判断回来后的入箱搬到 `application-capture.ts` 的 `FeedCapture`（`feed.capture.*`，经窄接口用门面的「已忽略」与收件箱方法）；没有调用方的 `recordInboxJudgmentEvent`、`recoverInterruptedSourceRuns` 删掉。条目、收件箱与摄入（连同判断排队）留在门面：两者共用 `JudgmentQueue` 与「已忽略」检查，门面现 247 行 / 21 方法。 | 7 |
| `form` | `src/client.ts` | 文件 930 行 | 归线 · §4.8 · W4-04 | Form 样板：浏览器代码改成类型检查的打包 TS（模板 928/930 行）。 | 7 |
| `goals` | `src/goal-tree-decision.ts` | `decideGoalTreeProposal` 函数 272 行<br>`result callback 1` 函数 246 行 | 拆 · W5-10 | `decideGoalTreeProposal` 里 `result` 回调 246 行（同一段计两次），依次是：逐条决定（拒绝、修订、规划冲突、基线冲突）、按组落实（`goalTreeMaterializationGroups`）、图校验、修订提案、语义复核、记录决定并组结果；各成函数。 | 3 |
| `goals` | `src/goal-tree-submission.ts` | `submitGoalTreeProposal` 函数 162 行 | 拆 · W5-10 | 只超 12 行。`result` 回调 131 行，把条目的规范化与摘要摘出去。 | 5 |
| `goals` | `src/momentum-view.ts` | `buildGoalMomentumView` 函数 245 行 | 拆 · W5-10 | `buildGoalMomentumView` 44 条语句：依赖边（`dependencyEdges` 13）、分组（`groupRootFor` 14、`downstreamFor` 15）、节点（`nodes` 28）、动作（`actions` 30）四步，各成函数。 | 2 |
| `goals` | `src/proposal-normalizer.ts` | `GoalTreeProposalNormalizer` 类 453 行 / 13 方法 | 拆 · W5-10 | 13 个方法但 453 行：`normalizeGoalTreeProposalItems` 101、`goalCreatePayload` 72、`parseGoalTreeWriteItem` 57、`normalizeGoalTreeProposalNarrative` 51。按条目种类拆成目标创建、关系创建与停用、叙述与解释三个规范化器。 | 2 |
| `goals` | `src/proposal-ui.ts` | `createProposalRenderer` 函数 187 行 | 拆 · W5-10 | `renderGoalTreeProposalDecision` 一个内嵌函数 126 行，按区块拆；`goalTreeRelationScenario`、`renderGoalTreeProposalScenario` 已独立。 | 1 |
| `goals` | `src/tree-ui.ts` | `createTreeRenderer` 函数 236 行 | 拆 · W5-10 | `createTreeRenderer` 里 `renderGoalTree`（70）、`renderTreeDependencies`（42）、`renderCollectionFold`（27）、`renderTreeStatusFilter`（17）各成模块。 | 1 |
| `pages` | `src/client.ts` | 文件 1,153 行 | 已拆（W5-10） | 浏览器脚本模板按职责切成五段源码 `client-{setup,menus,list,document,actions}.ts`，`client.ts` 只剩 24 行入口，用 `${…}` 片段拼回同一个工厂脚本（求值结果与拆前逐字节相同，64,196 字符）；原生 `fetch` 仍只在 `client.ts` 的 `request` 里一处。最大一段 297 行。W5-04 改成打包模块时可把片段交接改成 import。 | 12 |
| `pages` | `src/commands.ts` | 原文件 2,241 行 → 128 行；七个内部命令族最大 634 行 | 已拆 · W5-10（2026-10-17，本地定向通过，待 CI） | 选区与菜单、块变更、插入、容器、光标与代码、格式、Markdown 各归一个模块；保留原入口的 113 个导出与全部实现，调用方无须切换。构建、健康门禁和 29 文件 545 条非浏览器回归、七个 Chrome 文件 37 条全部通过；完整证据见防腐 spec 的 W5-10-PGC-01～03。mount/hover 与存储仍由对应行处理。 | 0 |
| `pages` | `src/editor-browser.ts` | 文件 719 行<br>`mount` 函数 451 行 | 已拆 · W5-10 | 现 271 行，`mount` 87 行，已在阈值以下；拆分过程与各片证据见防腐 spec 的 W5-10-PGV/PGF/PGI/PGM/PGH/PGP/PGK 与 R4d（`slices/w5-10-pages-giants.md`）。 | 12 |
| `pages` | `src/store.ts` | `PagesStore` 类 376 行 / 28 方法 | 已拆 · W5-10（2026-10-24 R4d，待 CI） | `PagesStore` 28 个方法分五组：页面（`create`、`importDocuments`、`update`、`relocate`、`duplicate`、`delete`）、发布（`beginPublication`、`completePublication`）、生成（`beginGeneration`、`completeGeneration`、`failGeneration`、`saveGeneration`）、变更审阅（`keepChange`、`revertChange`、`discard`）、文件夹。 2026-10-24 R4d：生成一组（`beginGeneration`、`completeGeneration`、`failGeneration`、`saveGeneration`、`generation(s)`、`releaseGenerationAttempt`、尝试键）搬到抽象基类 `PagesGenerationStore`（`store-generations.ts`，66 行），`PagesStore extends PagesGenerationStore`，公开方法与构造参数不变；`PagesStore` 376 → 288 行、方法数降到阈值以下。 | 6 |
| `pages` | `src/styles.ts` | 文件 812 行 | 已拆 · W5-10 | 色调规则搬到 `tone.ts` 后现 771 行，在阈值以下；此后再往里加样式要按界面分文件。 | 5 |
| `plugin-builder` | `src/agent-authoring.ts` | `expandDesign` 函数 225 行 | 拆 · W5-10 | `expandDesign` 45 条语句，8 个 `for…of` 块各 11–17 行逐类规范化设计稿条目；每个循环一个规范化函数。 | 3 |
| `plugin-builder` | `src/agent-workflow.ts` | `AgentBuilderWorkflow` 类 654 行 / 40 方法 | 拆 · W5-10 | `AgentBuilderWorkflow` 40 个方法：设计与样稿（`designer`、`propose`、`drawMockups`、`acceptDesign`、`pickCapabilities`、`revise`）、实现与验收（`implement`、`implementOne`、`codeAttempt`、`acceptance`、`repairAcceptance`）、审阅（`reviewPresentation`、`reviseVisual`）、生命周期（`create`、`launch`、`pause`、`close`）。创作台属构建期例外清单，不迁 Runtime，就地拆。 | 5 |
| `ppt` | `src/client.ts` | 文件 806 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（804/806 行）。 | 6 |
| `shelf` | `src/client.ts` | 文件 1,708 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,704/1,708 行）。 | 4 |
| `todo` | `src/client.ts` | 文件 1,245 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,240/1,245 行）；Todo 是第二个迁 Runtime 的样板。 | 3 |
| `todo` | `src/store.ts` | `TodoStore` 类 381 行 / 28 方法 | 已拆（W5-10） | 按层继承，导出名与构造参数不变：`store-base.ts` 的 `TodoStoreBase`（连接、读、插入/更新/记录/事务，12 个方法）← `store-writes.ts` 的 `TodoStoreWrites`（单件待办的创建、更新、移动、状态、归档、删除、关联、来源，12 个方法）← `store.ts` 的 `TodoStore`（到期提醒、确认、批量、撤销，4 个方法，约 90 行）。类型、行转换与校验、字段规范化分到 `store-types.ts`、`store-support.ts`、`store-normalize.ts`；`store.ts` 仍导出原来的类型与 `todoRequestKey`。搬出的 `as unknown as` 改成按行类型的 `itemRows`/`changeRows`，计数不增。 | 4 |
| `work` | `src/actions.ts` | `createWorkActionHandlers` 函数 169 行 | 拆 · W5-10 | 只超 19 行。`createWorkActionHandlers` 返回的处理器表 143 行，每个动作一个处理函数；`workActions` 声明（57 行）不动。 | 2 |
| `work` | `src/ui/render.ts` | `renderWorkSessionSurface` 函数 350 行 | 拆 · W5-10 | `renderWorkSessionSurface` 里 `renderSessionDetail`（85）、`renderOverlays`（81）、`renderSessionRow`（29）、`groupSessionRecords`（19）、`renderRuntimeFold`（15）各成模块。 | 0 |
| `workflows` | `src/client.ts` | 文件 1,387 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,378/1,387 行）。 | 3 |

### 官方连接器 `plugins/official-integrations/*`

6 个单元（拆 5、例外 1），5 个文件、2 个包。路径前缀 `plugins/official-integrations/`。

| 包 | 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | --- | ---: |
| `catalog` | `src/catalog.ts` | 文件 1,015 行 | 例外 · 静态数据 | 39 个连接器的声明表，条目互相独立（`CATALOG` 834 行），所以不为拆而拆。保持为一个单元须有真实理由并让登记 `size` 与实测相等；变大小要同步登记交评审，混入其他职责时按职责拆。 | 1 |
| `gmail` | `src/oauth-pending.ts` | `createGmailPendingSessions` 函数 8 行 | 已拆 · W5-10 | 基线实测 178 → 8 行；存取、清理与校验提到同文件模块级，显式传入实例 Ports 与捕获的配置函数。最大函数 72 行，保留 state/时间/身份校验、Secret 方法接收者与每次实例的独立会话。 | 1 |
| `gmail` | `src/oauth-token-lifecycle.ts` | `createGmailTokenLifecycle` 函数 8 行 | 已拆 · W5-10 | 基线实测 168 → 8 行（原表 170 为旧值）；同文件模块级函数处理凭据读取、刷新与写入，最大 101 行。保留 refresh-token 复查、原 opts 的同步 `beforePersist` 与连续凭据写入。 | 1 |
| `gmail` | `src/oauth.ts` | `createGmailOAuth` 函数 14 行 | 已拆 · W5-10 | 基线实测 177 → 14 行；start/complete 操作提到模块级，按实例绑定原 Ports 与函数引用，最大 93 行。先消耗 state 再交换，先核邮箱、解析 refs 再同步提交；公开参数与返回保持。 | 1 |
| `gmail` | `src/provider.ts` | 文件 263 行<br>`createGmailProvider` 函数 63 行 | 已拆 · W5-10 | 基线实测文件 910 → 263、factory 177 → 63 行（原表 957/198 为旧值）；health/sync 操作留在本文件模块级，实例 resolver 保留原 opts 接收者。私有 `provider-sync.ts` 446 行（最大函数 93）、`provider-message.ts` 176 行（最大函数 53）、`provider-fixture.ts` 38 行。分页、详情界限、映射与游标进度不变，无新增公开出口或例外。 | 2 |

## 4. 维护

- 文档清单由改动者人工维护：改登记或判定时，同步本节与 §2/§3 对应行，核对实际登记；历史分类总数与当前测量分开说明，不增设表格门禁。
- 拆完一个单元：改这里对应的行（删行或改数字），在同一个 PR 里跑 `node scripts/check-health-gates.mjs --update --base origin/main` 更新本地快查；它如果有例外条目，同时删掉条目。
- 新写的东西超限：先看它是不是只做一件事。混了几件事的，按职责拆到每一块都在阈值以下；本身合理的（文案表、样式表、静态数据、生成代码、内聚的状态机或解析器），在 `tooling/gates/giant-exceptions.json` 标明（`kind`、理由、门禁报错里给出的 `size`），并在这里加一行“例外”。不要把“懒得拆”写成理由，理由里写的事实要能在代码里查到。
- 给没有标明的单元加功能：先把要加的部分抽到新文件，再接上去，门禁不会放行它变大；它若本身合理，也可以在同一个 PR 里标明并写上新的 `size`，这里的判定改成“例外”。清单里点名的各片（W3-01、W3-05、W3-06、W3-07、W4-02、W5-02）会碰到的类，也这样处理。
- 判“拆”的单元（多数在 W5-10）照上面重新看一遍：本身合理的改判“例外”并标明，不为凑数字硬拆。
- 路线收尾（W6-04）重量这些数字，和 2026-10-02 开工时对比：当时 37 个超过 800 行的文件、43 个超过 300 行的类、25 个方法数超过 25 的类、99 个超过 150 行的函数（`specs/repository-anti-corruption/spec.md` §2.3）。
