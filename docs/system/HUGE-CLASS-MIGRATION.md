# 巨大单元清单与判定

当前所有超过阈值的文件、类和函数，各自的 owner、判定和计划。快照取自 main `35d7f320`（2026-10-08），共 165 个单元；实时数字以 `node scripts/check-health-gates.mjs --report` 为准，本表只在判定或计划变化时改。2026-09 的迁移记录（列的是已不存在的 `src/v1/coordinator.ts` 等）已移到 [归档](../archive/huge-class-migration-2026-09.md)。

## 1. 规则

阈值在 `tooling/gates/limits.json`，只许收紧：文件超过 800 行；类超过 300 行或超过 25 个方法；函数超过 150 行。统计 `apps/`、`horizontal/`、`modules/`、`packages/`、`plugins/`、`server/`、`tooling/` 下的 `.ts`、`.mts`，不含测试、`dist`、`fixtures`；类的行数与方法数分开记。

门禁 `pnpm health:check`（CI 用 `--base origin/main`，对照 merge-base，规则见 `AGENTS.md` 的构建与测试一节）：

- 新出现的巨大单元失败；已有的只许变小，变大即失败。
- 把巨大函数搬到别的文件，门禁按「新单元」算（只有整个文件被 git 识别为改名，才算原来的单元），所以搬的同时要拆到阈值以下。
- 同一段代码会被计几次：文件里的类、类里的方法、函数里的内嵌函数各算一个单元。现在有 19 个函数落在另一个巨大单元里。
- 看不见模板字符串里的浏览器脚本和样式：超过 150 行的模板字符串共 107 个、约 55,700 行（样式、HTML、脚本都算），其中 86 个在不超过 800 行的文件里，不在下表里。这部分归 §4.8 的打包与类型检查：W4-04 的 Form 样板同时加 `*_SCRIPT` 模板常量的计数指标，W5-04 逐个插件推开。

判定有四种：

| 判定 | 含义 |
| --- | --- |
| 拆 | 路线（`specs/repository-anti-corruption/roadmap-2026-10-07.md`）里有一片负责拆它，写片号 |
| 归线 | 路线里别的整改线会让它消失或换形态，写任务书的节号和片号：§4.8（改需求、修 bug、调交互的便利：浏览器代码打包、删旧皮肤）、§4.6（扩展点与插件装配）、§4.3（分层与边界：能力机制、宿主瘦身） |
| 例外 | 单一职责而必然很长（文案表、样式表、静态数据、生成代码）；登记在 `tooling/gates/giant-exceptions.json`，带理由，由门禁校验 |
| 待排期 | 路线里没有片负责它；单元冻结，不许变大 |

**例外的门禁规则**（`scripts/check-health-gates.mjs`，用例在 `tests/health-gates-merge-base.test.ts`）：

- 条目的键与 `baseline.json` 里的单元键相同（`file …`、`class …#名`、`function …#名`），值是 `{ kind, reason }`。`kind` 取 `translation-table`、`stylesheet`、`static-data`、`generated-code` 之一；`reason` 至少 20 个非空白字符，写明为什么拆开反而更糟。
- 条目必须对应一个现存的巨大单元。拆小了、改名了、删了，条目要在同一个 PR 里跟着改，否则门禁报「条目已过期」；所以登记表随清单一起缩小。
- 登记让一个超限的单元可以存在，包括对 merge-base 来说是新增的；存在之后它和所有巨大单元一样只许变小，变大即失败。登记没有别的效力：已记录单元的增长不因它放行。
- 条目的增删要过评审，和 `limits.json` 一样是改门禁的入口，不是改数字的入口。

## 2. 现状

165 个单元：35 个文件、41 个类、89 个函数。判定分布：

| 判定 | 文件 | 类 | 函数 | 合计 |
| --- | ---: | ---: | ---: | ---: |
| 拆 | 6 | 1 | 10 | 17 |
| 归线 | 15 | 2 | 3 | 20 |
| 例外 | 7 | 0 | 1 | 8 |
| 待排期 | 7 | 38 | 75 | 120 |
| 合计 | 35 | 41 | 89 | 165 |

- **例外**（8 个）已登记在 `tooling/gates/giant-exceptions.json`：英文词典 1 份、样式表 4 份、连接器声明表 1 份、组件规格板的文件和它的一个函数。`--report` 在这些单元后面标 `[exception: …]`。
- **拆**（17 个）和**归线**（20 个）有片号；这些片在路线的第 2 至 5 波，快照时对应的单元都还是原样。
- **待排期**（120 个）占 73%。路线里拆分类的片只点名了助理、Prologue 适配器初始化、Coding 路由、Pages 编辑器与命令、宿主路由分发、`agent-host` 合同和清单校验器，其余的没有片。其中 39 个只超出阈值不到 20%，5 个类只因方法数超标（行数没超）；这两类超出不多，是最便宜的一批。

### 待排期里先看哪些

任务书要求先处理被最多 PR 改动的。下表是待排期的文件里，自 2026-09-28 起 main 上改动过它的合并数最多的前 10 个（`git log --first-parent --since=2026-09-28 origin/main -- <文件>`，窗口内 main 上共 204 个 first-parent 提交，基本都是 PR 合并）：

| 文件 | PR | 待排期的单元 | 最大单元 |
| --- | ---: | ---: | ---: |
| `apps/local-host/src/web-catalog.ts` | 15 | 1 | 336 行 |
| `apps/workbench/src/renderer.ts` | 13 | 1 | 381 行 |
| `apps/workbench/src/goals-page-renderer.ts` | 11 | 2 | 227 行 |
| `apps/local-host/src/assistant/assistant-store.ts` | 9 | 1 | 282 行 |
| `horizontal/agent-host/src/adapters/prologue.ts` | 8 | 3 | 1,026 行 |
| `horizontal/agent-host/src/index.ts` | 8 | 2 | 409 行 |
| `apps/local-host/src/plugin-builder/agent-surface.ts` | 8 | 2 | 196 行 |
| `apps/local-host/src/web-goals-read.ts` | 8 | 1 | 175 行 |
| `apps/local-host/src/agent-host-composition.ts` | 7 | 1 | 261 行 |
| `apps/local-host/src/web-server.ts` | 7 | 2 | 241 行 |

### 路线里与这些单元有关的片

| 片 | 内容 | 对应的单元 |
| --- | --- | --- |
| W4-05 | 助理服务拆分样板：在原处按包形边界抽出提醒与跟进协作者，带自己的测试（依赖助理去向的决定，待决第 3 条） | `AssistantService` |
| W5-10 | 其余巨大单元：助理协作者（委派、材料轮次、记忆桥、建议与撤销）、Pages 编辑器的 `mount`、`hoverHandlePlugin`、`commands.ts`；之后按决定搬助理包 | 助理，Pages 编辑器与命令 |
| W4-06 | 拆 `initializePrologueNodeAdapter`：`startAgentRun` 进 `prologue-run.ts`，memory、documents、sessions、schedule、recovery 端口各成模块，初始化只组合 | `prologue-node.ts` |
| W4-07 | `codingRouteBindings` 按资源拆（会话与轮次、变更集、写入者、Goal 上下文、时间线） | `coding/src/routes.ts` |
| W5-07 | `handleMolisWorkWebRequest` 改成注册表，每个 `*-http` 模块导出 `{match, handle}` | `web-request.ts` |
| W5-09 | `contracts` 的 `services/agent-host.ts` 按领域拆，纯搬移，由 API 快照守着 | `agent-host.ts` 合同 |
| W3-03 | 把运行时 helper 移出 contracts，其中清单校验器约 540 行移到 plugin-runtime | `inspectActionDeclarations`、`inspectAgentDeclaration` |
| W4-04 | Form 样板：迁到 Runtime，浏览器代码改成打包并类型检查的 TS | `form/src/client.ts` |
| W5-04 | 浏览器代码逐个插件打包、类型检查，再做工作台客户端分段 | 12 个浏览器模板里除 Form 外的 11 个 |
| W5-05 | 逐个删旧皮肤 quiet-paper、calm-desktop、personal-shell、personal-workbench-v2 与 v3，并降低页面预算和巨大单元基线 | `calm-desktop.ts`、`personal-workbench-v3.ts` |
| W5-01 | 插件族逐个迁到 Runtime，每迁一族就删宿主里它的文件和 `registerProvider` 站点；Feed 另有专项计划 | `project-host.ts`、Feed |
| W2-08、W2-09、W3-07 | 删 Goals 无生产调用方的类型化桥；工作区读取只留一个 id；管理入口改走动作并删剩余桥 | `project-capabilities.ts` |
| W5-11 | 宿主瘦身：连接器提供方设置与 OAuth 移进官方连接器插件，或登记为例外（待决第 7 条） | `web-connectors-settings.ts` |
| W5-06 | 声明式贡献挂载器代替 15 个 Goals 挂载适配器；`goals-page-renderer.ts` 改名，留在工作台 | 不拆那两个函数 |
| W2-06 | 删四处跨主人 SQL（含 `demo-seed.ts` 一处） | 只删几行 |
| W5-03 | 按主人分翻译词典，删无引用的键 | `en.ts` 变小 |

已定的决定对判定的影响：10-07 的「记忆、放置与情境启发式」决定把 W4-08 改成文档与边界规则、代码不搬，所以 `MemoryService`、`PlacementService` 目前没有拆分片（路线 W4-08 末尾的「再拆 MemoryService」没有对应的片）；10-07 的插件平台范围决定把 Goals、Artifacts、Sessions 与插件创作台列为构建期例外，它们不迁 Runtime，也就不会因 W5-01 缩小。

## 3. 清单

每行一个文件（同一个文件里判定不同的，分成两行）。PR 是上面那个窗口里改动过该文件的合并数。路径省略各节开头写明的前缀。

### 宿主 `apps/local-host`（唯一业务 composition root）

28 个单元（拆 4、归线 3、待排期 21）。路径前缀 `apps/local-host/src/`。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `web-request.ts` | `handleMolisWorkWebRequest` 函数 441 行<br>`handleMolisWorkWebRequest callback 1` 函数 327 行 | 拆 · W5-07 | 改成注册表，每个 `*-http` 模块导出 `{match, handle}`；327 行的回调内嵌在该函数里。依赖 W5-01 的一部分 | 22 |
| `assistant/assistant-service.ts` | 文件 2,692 行<br>`AssistantService` 类 2,123 行 / 120 方法 | 拆 · W4-05、W5-10 | 助理服务：一个类占了文件的 2,123 行。W4-05 先抽提醒与跟进协作者，W5-10 再抽委派、材料轮次、记忆桥、建议与撤销，之后按决定搬包（待决第 3 条，路线推荐先在原处拆） | 14 |
| `project-host.ts` | `MolisWorkLocalHost` 类 367 行 / 24 方法 | 归线 · §4.6 · W4-04、W5-01 | 项目 composition owner；文件里有 26 处 `registerProvider`，插件族迁到 Runtime 时各删各的，没有单独的拆分片 | 13 |
| `project-capabilities.ts` | `registerProjectCapabilities` 函数 270 行 | 归线 · §4.3 · W2-08、W2-09、W3-07 | 里面登记 Goals 的类型化桥与工作区读取的两个 id，这三片要删；删完重量再判 | 4 |
| `web-connectors-settings.ts` | `handleLocalConnectorsSettingsHttp` 函数 227 行 | 归线 · §4.3 · W5-11 | 连接器提供方设置与 OAuth 的 HTTP；W5-11 把它们移进官方连接器插件，或登记为例外（宿主设置决定待定，待决第 7 条） | 1 |
| `web-catalog.ts` | `handleLocalCatalogWebRequest` 函数 336 行 | 待排期 | 目录级 HTTP 路由（项目选择、搜索、待办、角色、跨项目会话等），一个函数 46 条语句；形态可参照 W5-07 的注册表 | 15 |
| `assistant/assistant-store.ts` | `AssistantStore` 类 282 行 / 44 方法 | 待排期 | 助理自己的事实访问（作品、轮次、每次发送的结果），只因方法数超标（282 行）。两片都没点名它；随协作者拆分时判断各协作者带走哪些表 | 9 |
| `plugin-builder/agent-surface.ts` | `ensureStudio` 函数 196 行<br>`created callback 1` 函数 188 行 | 待排期 | 创作台 Agent 面的装配；188 行的回调内嵌在 `ensureStudio` 里 | 8 |
| `web-goals-read.ts` | `createLocalGoalsReadHttp` 函数 175 行 | 待排期 | Goals 只读 HTTP 的装配 | 8 |
| `agent-host-composition.ts` | `composeAgentHost` 函数 261 行 | 待排期 | 把 Agent Host 及其能力注册到宿主（外部 MCP 工具、git 审查、授权复查等） | 7 |
| `web-server.ts` | `createLocalWebServerFactory` 函数 241 行<br>`createMolisWorkWebServer` 函数 238 行 | 待排期 | Web 服务的装配、启动与关停（侧栏浏览器、助理定时跟进、SSE）；`createMolisWorkWebServer` 内嵌在 `createLocalWebServerFactory` 里（同一段代码计两次） | 7 |
| `home-actions.ts` | `homeActionProvider` 函数 185 行 | 待排期 | 首页判断动作的提供方（声明与处理） | 6 |
| `project-catalog.ts` | `MolisWorkProjectCatalog` 类 293 行 / 41 方法 | 待排期 | 项目目录的资源生命周期与各主人的显式装配，293 行、41 个方法，只因方法数超标 | 6 |
| `installed-plugin-host.ts` | `openInstalledPlugins` 函数 205 行 | 待排期 | 已安装插件宿主的打开与装配 | 5 |
| `local-host.ts` | `LocalHost` 类 582 行 / 24 方法 | 待排期 | 宿主调用核心：能力目录、项目内操作队列、并发动作的放行 | 4 |
| `browser/surface-driver.ts` | `createBrowserSurfaceDriver` 函数 166 行 | 待排期 | 助理观察并操作侧栏页面的驱动器，超出 16 行 | 3 |
| `web-project-settings.ts` | `createLocalProjectSettingsHttp` 函数 189 行<br>`handle` 函数 182 行 | 待排期 | 项目设置 HTTP；`handle` 内嵌在 `createLocalProjectSettingsHttp` 里（同一段代码计两次） | 3 |
| `browser/browser-host.ts` | `BrowserPage` 类 443 行 / 45 方法 | 待排期 | 侧栏浏览器里一个项目页面的封装（`BrowserPage`），45 个方法 | 2 |
| `connector-mcp.ts` | `createConnectorMcpHost` 函数 292 行 | 待排期 | 官方 MCP 连接器的连接与授权（服务白名单、账号隔离） | 1 |
| `demo-seed.ts` | `seedDemoBoard` 函数 541 行 | 待排期 | 示例项目的种子：固定的目标清单，后面接 `submitClosure`、`setArchived` 等演示收尾调用，不只是数据；其中一处直写 SQL 由 W2-06 删除 | 1 |
| `character-import-discovery.ts` | `createCharacterDiscovery` 函数 205 行<br>`discover` 函数 176 行 | 待排期 | 从共享 Agent Skills 目录发现可导入的角色候选；`discover` 内嵌在 `createCharacterDiscovery` 里 | 0 |
| `installer/runtime-integration.ts` | `RuntimeIntegrationService` 类 341 行 / 15 方法 | 待排期 | Runtime 接入的预览、写入、回滚与诊断 | 0 |

### 工作台 `apps/workbench`（页面组合与浏览器脚本）

14 个单元（归线 6、例外 1、待排期 7）。路径前缀 `apps/workbench/src/`。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `scripts/client/assistant-island.ts` | 文件 2,813 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（2,803/2,813 行在一个模板字符串里）；工作台客户端分段打包并类型检查 | 18 |
| `scripts/client/tab-workspace.ts` | 文件 2,049 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（2,014/2,049 行） | 11 |
| `scripts/client/events-primary.ts` | 文件 810 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（808/810 行） | 6 |
| `scripts/client/navigation-feed.ts` | 文件 1,025 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,020/1,025 行），里面写死了 Feed 的客户端 | 5 |
| `feed-projection-ui.ts` | `createWorkbenchFeedProjectionRenderer` 函数 401 行 | 归线 · §4.6 · W5-01 | Feed 投影的页面渲染，写在工作台里；Feed 迁 Runtime 的专项计划决定它的去处 | 3 |
| `functions/client.ts` | 文件 1,299 行 | 归线 · §4.8 · W5-04 | 判断编辑器的浏览器脚本模板（1,297/1,299 行） | 1 |
| `i18n/en.ts` | 文件 3,619 行 | 例外 · 翻译表 | 英文词典：一个对象字面量加 `Object.assign(EN, …)` 块，没有逻辑。W5-03 会把插件自有词条移给主人并删无引用的键，使它变小；此后若降到 800 行以下，条目随之删除。理由在 `giant-exceptions.json` | 23 |
| `renderer.ts` | `createWorkbenchRenderer` 函数 381 行 | 待排期 | 把各 UI 主人的页面组合成应用页面 | 13 |
| `goals-page-renderer.ts` | `createWorkbenchGoalsPageRenderer` 函数 227 行<br>`renderMolisWorkWeb` 函数 191 行 | 待排期 | 外壳页面渲染器（名字不对）。W5-06 只改名并换掉 15 个挂载适配器，不拆这两个函数；`renderMolisWorkWeb` 内嵌在 `createWorkbenchGoalsPageRenderer` 里 | 11 |
| `settings-renderer.ts` | `createWorkbenchSettingsRenderer` 函数 235 行 | 待排期 | 设置页渲染 | 5 |
| `capsule-items.ts` | `createCapsuleItemProjection` 函数 229 行 | 待排期 | Capsule 条目投影 | 2 |
| `project-settings-pages.ts` | `createWorkbenchProjectSettingsPages` 函数 179 行 | 待排期 | 项目设置页面组合 | 2 |
| `tab-workspace-ops.ts` | `createTabWorkspaceOps` 函数 461 行 | 待排期 | 标签工作区的纯规则，文件头 `// @ts-nocheck`，`toString` 序列化后注入浏览器。W5-04 改它的交付形式，不会拆这个 461 行的函数 | 2 |

### Agent Host `horizontal/agent-host`（唯一直接依赖 `@prologue/sdk` 的包）

18 个单元（拆 3、待排期 15）。路径前缀 `horizontal/agent-host/src/`。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `adapters/prologue-node.ts` | 文件 1,764 行<br>`initializePrologueNodeAdapter` 函数 1,436 行<br>`startAgentRun` 函数 418 行 | 拆 · W4-06 | `startAgentRun` 移到 `prologue-run.ts`，memory、documents、sessions、schedule、recovery 端口各成模块，`initializePrologueNodeAdapter` 只剩组合；`startAgentRun` 内嵌在它里面 | 15 |
| `adapters/prologue.ts` | 文件 1,026 行<br>`PrologueAgentAdapter` 类 658 行 / 18 方法<br>`(module) callback 1` 函数 187 行 | 待排期 | Prologue 适配器类（18 个方法）；类里还有一个 187 行的回调。W4-06 不含它 | 8 |
| `index.ts` | `AgentHost` 类 409 行 / 12 方法<br>`start` 函数 267 行 | 待排期 | `AgentHost` 类（12 个方法）；`start` 267 行在类里 | 8 |
| `adapters/prologue-stream.ts` | `applyPrologueEvent` 函数 304 行 | 待排期 | 把 Prologue 事件流投影成合同形状（`applyPrologueEvent` 按事件种类分支） | 6 |
| `adapters/plugin-builder.ts` | `createPluginBuilderAgent` 函数 204 行<br>`run` 函数 153 行 | 待排期 | 创作台的 Builder 会话；`run` 内嵌在 `createPluginBuilderAgent` 里 | 5 |
| `adapters/prologue-action-gateway.ts` | `prologueActionGateway` 函数 174 行 | 待排期 | 宿主动作网关：三个工具代替每个动作一个工具 | 4 |
| `adapters/prologue-git.ts` | `createPrologueGitReviews` 函数 188 行 | 待排期 | commit、branch、push、PR 的审查记录（宿主只留来源与诊断文字） | 2 |
| `adapters/prologue-mcp.ts` | `createPrologueMcpLibrary` 函数 232 行 | 待排期 | 项目的外部 MCP 配置库 | 2 |
| `adapters/prologue-taskboard.ts` | `createPrologueTaskBoards` 函数 220 行 | 待排期 | 任务板的准入与范围限定（图的改动归 SDK） | 2 |
| `capability-registration.ts` | `registerAgentHostCapabilities` 函数 393 行 | 待排期 | 把 Agent Host 能力登记到宿主注册表 | 2 |
| `adapters/prologue-checkpoints.ts` | `createPrologueCheckpoints` 函数 221 行 | 待排期 | 检查点与回退的宿主侧来源记录 | 1 |
| `adapters/prologue-messages.ts` | `createSessionMessages` 函数 170 行 | 待排期 | 同一项目里会话之间的消息 | 0 |

### 其他横向与平台产品服务 `horizontal/*`

6 个单元（待排期 6）。路径前缀 `horizontal/`。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `listener-host/src/index.ts` | `ListenerHost` 类 373 行 / 18 方法 | 待排期 | 监听的 cursor、lease、重试与接收回执 | 5 |
| `memory/src/service.ts` | 文件 1,338 行<br>`MemoryService` 类 1,101 行 / 56 方法 | 待排期 | 平台记忆服务（56 个方法）。路线的 W4-08 末尾写“再拆 MemoryService”，但 10-07 的决定已把 W4-08 改成文档与边界规则、代码不搬，所以现在没有对应的片 | 3 |
| `placement/src/index.ts` | `PlacementService` 类 419 行 / 28 方法 | 待排期 | 放置服务（28 个方法）；同上，代码不搬的决定后没有对应的片 | 3 |
| `search/src/index.ts` | `SearchService` 类 444 行 / 30 方法 | 待排期 | 系统搜索服务（30 个方法） | 3 |
| `scheduler/src/index.ts` | `createScheduleService` 函数 282 行 | 待排期 | 一次性唤醒的持久调度服务 | 2 |

### 业务事实 Module `modules/*`

22 个单元（待排期 22）。路径前缀 `modules/`。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `artifacts/src/service.ts` | `ArtifactsService` 类 342 行 / 12 方法 | 待排期 | 成果库服务：版本的登记、读取、标不可用、归档 | 5 |
| `feed/src/index.ts` | `FeedModule` 类 510 行 / 16 方法 | 待排期 | Feed 模块（`FeedApi` 的实现） | 4 |
| `functions/src/store.ts` | 文件 939 行<br>`FunctionsStore` 类 336 行 / 22 方法 | 待排期 | 判断函数库：草稿、预览、样例、发布、删除 | 3 |
| `goals/src/event-state.ts` | `GoalEventState` 类 365 行 / 21 方法 | 待排期 | Goals 事件状态：工作状态、进展回执、顾虑、决定请求与引用、约定、收尾、恢复 | 3 |
| `goals/src/event-facts.ts` | `GoalEventFacts` 类 576 行 / 35 方法 | 待排期 | Goals 事件事实：配置、事件类型与要求、报告，以及事件与时间线的读取 | 2 |
| `goals/src/event-state-repository.ts` | `GoalEventStateRepository` 类 408 行 / 30 方法 | 待排期 | 事件状态的表访问：工作状态、约定、进展、顾虑等（30 个方法） | 2 |
| `goals/src/lifecycle-archive.ts` | `setTrashed` 函数 185 行<br>`setTrashed callback 1` 函数 174 行 | 待排期 | 归档与回收站；174 行的回调内嵌在 `setTrashed` 里 | 2 |
| `private-work-context/src/session-registry.ts` | `MolisWorkSessionRegistry` 类 174 行 / 29 方法 | 待排期 | 对外门面（174 行、29 个方法），只因方法数超标 | 2 |
| `projects/src/repository.ts` | `ProjectsRepository` 类 287 行 / 29 方法 | 待排期 | 项目仓库：项目、项目插件、隐藏插件、改名、库路径；只因方法数超标 | 2 |
| `shelf/src/store.ts` | 文件 1,176 行<br>`ShelfStore` 类 748 行 / 35 方法<br>`runJob` 函数 199 行 | 待排期 | 置物架存储：文件 1,176 行，`ShelfStore` 748 行、35 个方法；`runJob` 内嵌在类里 | 2 |
| `goals/src/event-facts-repository.ts` | `GoalEventFactsRepository` 类 371 行 / 29 方法 | 待排期 | 事件事实的表访问：配置、事件类型、要求等（29 个方法） | 1 |
| `goals/src/event-state-effects.ts` | `GoalEventStateEffects` 类 539 行 / 12 方法<br>`recordTrustedDecision` 函数 155 行 | 待排期 | 事件状态的效果：顾虑、决定请求与引用、约定、收尾、恢复、报告后复评；`recordTrustedDecision` 155 行在类里 | 1 |
| `goals/src/guidance-commands.ts` | `GuidanceCommands` 类 368 行 / 3 方法<br>`update` 函数 201 行 | 待排期 | 项目指导的写入命令；`update` 201 行在类里 | 1 |
| `private-work-context/src/project-binding-commands.ts` | `RuntimeProjectBindingCommands` 类 333 行 / 12 方法 | 待排期 | 会话绑定命令（确认、改动与日志在同一事务里） | 0 |
| `private-work-context/src/session-handoffs.ts` | `SessionHandoffRepository` 类 325 行 / 14 方法 | 待排期 | 会话交接的状态：草稿、发送中、已送达、失败、取消、恢复中断 | 0 |
| `private-work-context/src/session-records.ts` | `SessionRecordRepository` 类 320 行 / 15 方法 | 待排期 | 会话记录：创建、发现、关联、状态，按 Runtime 会话或界面查找 | 0 |

### 平台包 `packages/*`

25 个单元（拆 3、归线 3、例外 4、待排期 15）。路径前缀 `packages/`。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `contracts/src/platform/actions.ts` | `inspectActionDeclarations` 函数 158 行 | 拆 · W3-03 | 清单校验器随 W3-03 移出 contracts；原样搬到别处会被门禁当作新增，要边搬边按声明段拆 | 17 |
| `contracts/src/services/agent-host.ts` | 文件 1,734 行 | 拆 · W5-09 | 按领域拆合同文件，纯搬移，由 API 快照守着 | 13 |
| `contracts/src/platform/plugin-agent.ts` | `inspectAgentDeclaration` 函数 162 行 | 拆 · W3-03 | 同上 | 2 |
| `design-system/src/styles/craft-finish.ts` | 文件 2,313 行 | 归线 · §4.8 | 1,924 行样式加 `CRAFT_FINISH_CLIENT_SCRIPT` 323 行脚本，两个变化原因。路线把样式文件归 §4.8、删旧皮肤后再登记，没有单独提这段脚本；脚本移出后，剩下的样式在同一个 PR 登记为例外 | 14 |
| `design-system/src/styles/calm-desktop.ts` | 文件 1,392 行 | 归线 · §4.8 · W5-05 | 旧皮肤，整份删除（逐个过视觉比对） | 3 |
| `design-system/src/styles/personal-workbench-v3.ts` | 文件 1,422 行 | 归线 · §4.8 · W5-05 | 旧皮肤，整份删除 | 1 |
| `design-system/src/styles/momentum.ts` | 文件 1,171 行 | 例外 · 样式表 | `MOMENTUM_STYLES` 一个模板字符串，纯 CSS（Goals 动量视图）。理由在 `giant-exceptions.json` | 4 |
| `design-system/src/primitives/catalog.ts` | 文件 947 行<br>`renderPrimitiveCatalog` 函数 648 行 | 例外 · 静态数据 | `/__ui/catalog` 规格板的样例标记（`renderPrimitiveCatalog` 里没有分支和 IO）。理由在 `giant-exceptions.json` | 3 |
| `design-system/src/styles/primitives.ts` | 文件 1,276 行 | 例外 · 样式表 | `PRIMITIVE_STYLES` 一个模板字符串，纯 CSS。理由在 `giant-exceptions.json` | 1 |
| `plugin-runtime/src/events.ts` | `PluginEventBus` 类 420 行 / 23 方法 | 待排期 | 插件事件总线：先存后唤醒，重启后续投 | 4 |
| `plugin-runtime/src/index.ts` | 文件 886 行<br>`PluginRuntime` 类 664 行 / 30 方法 | 待排期 | 插件运行时：安装、激活、撤销与版本切换 | 4 |
| `plugin-runtime/src/wiring.ts` | `PluginInputGraph` 类 497 行 / 26 方法 | 待排期 | 插件输入图：消费方拿到完整固定的成果版本集，或什么都没有 | 4 |
| `design-system/src/plugin-component-client.ts` | `createPluginComponentClient` 函数 754 行 | 待排期 | 生成插件的宿主渲染器，按部件种类画；类型化函数，用 `toString` 序列化进浏览器（754 行），W5-04 改交付形式、不拆它 | 3 |
| `kernel/src/action-service.ts` | `ActionService` 类 418 行 / 15 方法<br>`registerProvider` 函数 155 行 | 待排期 | 统一动作服务；`registerProvider` 155 行在类里，超出 5 行 | 3 |
| `plugin-runtime/src/supervisor.ts` | `PluginSupervisor` 类 592 行 / 31 方法 | 待排期 | 批量启动插件并隔离各自的失败；重启、撤销、启用 | 3 |
| `storage/src/adapters/text-search-index.ts` | `openTextSearchIndex` 函数 153 行 | 待排期 | 本地全文索引，超出 3 行 | 2 |
| `im-ui/src/browser/controller.ts` | 文件 966 行<br>`startIm` 函数 957 行 | 待排期 | IM 浏览器编排（`startIm` 957 行）；IM 实验线去留未定（路线待决第 4 条） | 1 |
| `plugin-sandbox/src/runner.ts` | `createSandboxRunner` 函数 174 行 | 待排期 | 沙箱进程运行器 | 1 |
| `storage/src/adapters/search-storage.ts` | `createSearchOpaqueBlobStore` 函数 164 行 | 待排期 | 搜索的不透明块存储，超出 14 行 | 1 |
| `test-kit/src/boundaries.ts` | `evaluateImportBoundary` 函数 152 行 | 待排期 | 导入边界规则求值，超出 2 行 | 1 |
| `im-ui/src/views.ts` | `createViews` 函数 164 行 | 待排期 | IM 视图助手；同上 | 0 |

### 内置插件 `plugins/native/*`

46 个单元（拆 7、归线 8、例外 2、待排期 29）。路径前缀 `plugins/native/`。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `coding/src/routes.ts` | 文件 1,564 行<br>`codingRouteBindings` 函数 1,356 行 | 拆 · W4-07 | `codingRouteBindings` 按资源拆（会话与轮次、变更集、写入者、Goal 上下文、时间线） | 9 |
| `pages/src/editor-browser.ts` | 文件 4,043 行<br>`mount` 函数 1,024 行<br>`hoverHandlePlugin` 函数 798 行<br>`view` 函数 676 行 | 拆 · W5-10 | 路线点名 `mount`（1,024）与 `hoverHandlePlugin`（798，其中 `view` 676 行内嵌）；两者移走后文件仍约 2,200 行，其余要另切 | 5 |
| `pages/src/commands.ts` | 文件 2,241 行 | 拆 · W5-10 | 编辑命令文件：114 个顶层函数声明（94 个导出） | 0 |
| `pages/src/client.ts` | 文件 1,153 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,149/1,153 行） | 12 |
| `coding/src/client.ts` | 文件 1,656 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,631/1,656 行） | 8 |
| `form/src/client.ts` | 文件 930 行 | 归线 · §4.8 · W4-04 | Form 样板：浏览器代码改成类型检查的打包 TS（模板 928/930 行） | 6 |
| `ppt/src/client.ts` | 文件 806 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（804/806 行） | 6 |
| `feed/src/application.ts` | `FeedApplication` 类 542 行 / 44 方法 | 归线 · §4.6 · W5-01 | Feed 应用（44 个方法）；Feed 迁 Runtime 另有专项计划 | 5 |
| `shelf/src/client.ts` | 文件 1,708 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,704/1,708 行） | 4 |
| `todo/src/client.ts` | 文件 1,245 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,240/1,245 行）；Todo 是第二个迁 Runtime 的样板 | 3 |
| `workflows/src/client.ts` | 文件 1,387 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,378/1,387 行） | 3 |
| `pages/src/styles.ts` | 文件 812 行 | 例外 · 样式表 | `PAGES_STYLES`，纯 CSS（色调规则由 `PAGES_TONES` 生成），超出 12 行。理由在 `giant-exceptions.json` | 5 |
| `coding/src/styles.ts` | 文件 851 行 | 例外 · 样式表 | `CODING_STYLES` 一个模板字符串，纯 CSS。理由在 `giant-exceptions.json` | 2 |
| `characters/src/plugin.ts` | `createCharactersPlugin` 函数 161 行<br>`start` 函数 159 行 | 待排期 | 角色插件定义；`start` 内嵌在 `createCharactersPlugin` 里（同一段代码计两次）。W5-01 列有 Characters 混合插件的迁移，没有拆分片 | 5 |
| `pages/src/editor-browser.ts` | `renderMenu` 函数 173 行<br>`findPlugin` 函数 169 行<br>`slashPlugin` 函数 160 行 | 待排期 | `renderMenu` 内嵌在 `view` 里；`findPlugin`、`slashPlugin` 是各自的编辑器插件 | 5 |
| `pages/src/store.ts` | `PagesStore` 类 376 行 / 28 方法 | 待排期 | Pages 库的表访问（28 个方法） | 5 |
| `plugin-builder/src/agent-workflow.ts` | `AgentBuilderWorkflow` 类 654 行 / 40 方法 | 待排期 | 创作台的持久工作流状态机（40 个方法）；创作台属构建期例外清单，不迁 Runtime，也没有拆分片 | 5 |
| `workflows/src/actions.ts` | `createWorkflowsActionHandlers` 函数 268 行 | 待排期 | 工作流动作处理 | 5 |
| `goals/src/goal-tree-submission.ts` | `submitGoalTreeProposal` 函数 162 行 | 待排期 | 提交目标树提案，超出 12 行 | 4 |
| `plugin-builder/src/agent-authoring.ts` | `expandDesign` 函数 225 行 | 待排期 | 把设计稿展开成严格合同（`expandDesign`，按种类逐条规范化） | 3 |
| `todo/src/store.ts` | `TodoStore` 类 381 行 / 28 方法 | 待排期 | Todo 库的表访问（28 个方法） | 3 |
| `coding/src/ui.ts` | `renderCodingWorkbench` 函数 214 行 | 待排期 | Coding 工作台的服务端渲染 | 2 |
| `goals/src/event-document-forms.ts` | `createEventDocumentForms` 函数 348 行 | 待排期 | 事件文档表单的渲染 | 2 |
| `goals/src/goal-tree-decision.ts` | `decideGoalTreeProposal` 函数 272 行<br>`result callback 1` 函数 246 行 | 待排期 | 目标树提案的决定；246 行的回调内嵌在 `decideGoalTreeProposal` 里 | 2 |
| `goals/src/momentum-view.ts` | `buildGoalMomentumView` 函数 245 行 | 待排期 | 动量视图的只读投影 | 2 |
| `goals/src/proposal-normalizer.ts` | `GoalTreeProposalNormalizer` 类 453 行 / 13 方法 | 待排期 | 目标树提案的线格式规范化 | 2 |
| `work/src/actions.ts` | `createWorkActionHandlers` 函数 169 行 | 待排期 | Work 动作处理 | 2 |
| `work/src/http/panels.ts` | `handleWorkPanelHttp` 函数 164 行 | 待排期 | Work 面板 HTTP | 2 |
| `alchemist/src/studio/server/bootstrap/local-runtime.ts` | `createLocalRuntime` 函数 243 行 | 待排期 | 炼金术士本地运行时装配 | 1 |
| `coding/src/timeline.ts` | `createCodingTimeline` 函数 263 行 | 待排期 | 一轮的对话时间线；`toString()` 注入浏览器，必须自包含 | 1 |
| `cognia/src/store.ts` | `CogniaStore` 类 123 行 / 28 方法 | 待排期 | 123 行、28 个方法，每个方法很短；只因方法数超标 | 1 |
| `goals/src/proposal-ui.ts` | `createProposalRenderer` 函数 187 行 | 待排期 | 提案渲染 | 1 |
| `goals/src/tree-ui.ts` | `createTreeRenderer` 函数 236 行 | 待排期 | 目标树渲染 | 1 |
| `work/src/terminal/client.ts` | `startWorkTerminalClient` 函数 438 行 | 待排期 | Work 终端浏览器端 | 1 |
| `work/src/terminal/panels.ts` | `createTerminalPanels` 函数 365 行 | 待排期 | 终端面板的加载、拉起、重连状态 | 1 |
| `alchemist/src/studio/server/db/pulse-repository.ts` | `SqlitePulseRepository` 类 381 行 / 23 方法 | 待排期 | Pulse 仓库（381 行） | 0 |
| `alchemist/src/studio/server/db/research-repository.ts` | `SqliteResearchRepository` 类 343 行 / 19 方法 | 待排期 | Research 仓库（343 行） | 0 |
| `work/src/ui/render.ts` | `renderWorkSessionSurface` 函数 350 行 | 待排期 | Work 会话面的渲染 | 0 |

### 官方连接器 `plugins/official-integrations/*`

6 个单元（例外 1、待排期 5）。路径前缀 `plugins/official-integrations/`。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `catalog/src/catalog.ts` | 文件 1,015 行 | 例外 · 静态数据 | 39 个连接器条目的声明表，条目互相独立。理由在 `giant-exceptions.json` | 1 |
| `gmail/src/provider.ts` | 文件 957 行<br>`createGmailProvider` 函数 198 行 | 待排期 | Gmail Provider：文件 957 行，`createGmailProvider` 198 行 | 2 |
| `gmail/src/oauth-pending.ts` | `createGmailPendingSessions` 函数 178 行 | 待排期 | 授权中的会话 | 1 |
| `gmail/src/oauth-token-lifecycle.ts` | `createGmailTokenLifecycle` 函数 170 行 | 待排期 | 令牌刷新与轮换 | 1 |
| `gmail/src/oauth.ts` | `createGmailOAuth` 函数 177 行 | 待排期 | Gmail OAuth | 1 |

## 4. 维护

- 拆完一个单元：改这里对应的行（删行或改数字），在同一个 PR 里跑 `node scripts/check-health-gates.mjs --update --base origin/main` 更新本地快查；它如果有例外条目，同时删掉条目。
- 新写的东西超限：先拆。确实是文案表、样式表、静态数据或生成代码，才在 `tooling/gates/giant-exceptions.json` 登记，并在这里加一行。不要把「懒得拆」写成理由。
- 给待排期的单元加功能：先把要加的部分抽到新文件，再接上去；门禁不会放行它变大。
- 路线收尾（W6-04）重量这些数字，和 2026-10-02 开工时对比：当时 37 个超过 800 行的文件、43 个超过 300 行的类、25 个方法数超过 25 的类、99 个超过 150 行的函数（`specs/repository-anti-corruption/spec.md` §2.3）。
