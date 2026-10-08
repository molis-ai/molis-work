# 巨大单元清单与判定

当前所有超过阈值的文件、类和函数，各自的 owner（包）、判定和计划。快照取自 main `4d59cd4d`（2026-10-08），共 164 个单元，分布在 38 个包的 130 个文件里；实时数字以 `node scripts/check-health-gates.mjs --report` 为准，本表只在判定或计划变化时改。每个单元都有判定（拆、归线或例外），没有“待排期”。2026-09 的迁移记录（列的是已不存在的 `src/v1/coordinator.ts` 等）已移到 [归档](../archive/huge-class-migration-2026-09.md)。

## 1. 规则

阈值在 `tooling/gates/limits.json`，只许收紧：文件超过 800 行；类超过 300 行或超过 25 个方法；函数超过 150 行。统计 `apps/`、`horizontal/`、`modules/`、`packages/`、`plugins/`、`server/`、`tooling/` 下的 `.ts`、`.mts`，不含测试、`dist`、`fixtures`；类的行数与方法数分开记。

门禁 `pnpm health:check`（CI 用 `scripts/ci-health-base.mjs` 选定的基准：PR 上是 CI 检出的合并提交的第一个父提交，push 到 main 时是推送前的末端，其余情况退回 origin/main；本机用 `--base origin/main`。规则见 `AGENTS.md` 的构建与测试一节）：

- 新出现的巨大单元失败：对 merge-base 不是巨大单元的都算新，包括原来在阈值以下、这次长过阈值的文件、类和函数。已有的只许变小，变大即失败。
- 把巨大函数搬到别的文件，门禁按“新单元”算（只有整个文件被 git 识别为改名，才算原来的单元），所以搬的同时要拆到阈值以下。
- 同一段代码会被计几次：文件里的类、类里的方法、函数里的内嵌函数各算一个单元。现在有 19 个函数落在另一个巨大单元里。
- 看不见模板字符串里的浏览器脚本和样式：超过 150 行的模板字符串共 107 个、约 55,700 行（样式、HTML、脚本都算），其中 86 个在不超过 800 行的文件里，不在下表里。这部分归 §4.8 的打包与类型检查：W4-04 的 Form 样板同时加 `*_SCRIPT` 模板常量的计数指标，W5-04 逐个插件推开。
- 匿名函数和 `#私有` 方法的键是“所在的具名函数 + 第几个回调”（`ownerOf` 只认标识符名字），顺序一变键就变，会被当作新单元。例如 `PrologueAgentAdapter` 的私有方法 `#start`（187 行）在门禁里记作 `function horizontal/agent-host/src/adapters/prologue.ts#(module) callback 1`。动这类单元时先看 `--report` 里的键有没有变。
- 同名的单元共用一个键，取其中最大的数：同一个文件里名字相同的函数（顶层函数和对象字面量里的同名方法、不同类里的同名方法）合并成一个单元，名字相同的类也是。所以新写的巨大函数只要和同一文件里一个已有的巨大单元同名、又不比它大，门禁就看不出来。在临时仓库里验过：已有一个 14 行的 `handle`，再在 `routes` 对象里加一个 12 行的 `handle` 方法（函数上限 8 行），`--base` 照样通过，改个名字就报“新增”。现有的巨大单元里，`web-project-settings.ts` 的 `handle` 和 `characters/src/plugin.ts` 的 `start` 都是这种容易重名的名字。这是门禁自己的缺口，不在本清单里改；后续要另开一项，让键能区分同名单元。在那之前，评审改到这些文件的 PR 时留意同名的函数。

判定有三种，每个单元必有其一：

| 判定 | 含义 |
| --- | --- |
| 拆 | 路线（`specs/repository-anti-corruption/roadmap-2026-10-07.md`）里有一片负责拆它，写片号；大多数是 W5-10，见 §2 |
| 归线 | 路线里别的整改线会让它消失或换形态，写任务书的节号和片号：§4.8（改需求、修 bug、调交互的便利：浏览器代码打包、删旧皮肤）、§4.7（多人并行：热点聚合文件改成各主人自己登记，如翻译词典按主人分）、§4.6（扩展点与插件装配）、§4.3（分层与边界：能力机制、宿主瘦身） |
| 例外 | 单一职责而必然很长（文案表、样式表、静态数据、生成代码）；登记在 `tooling/gates/giant-exceptions.json`，带理由，由门禁校验 |

**例外的门禁规则**（`scripts/check-health-gates.mjs`，用例在 `tests/health-gates-merge-base.test.ts`）：

- 条目的键与 `baseline.json` 里的单元键相同（`file …`、`class …#名`、`function …#名`），值是 `{ kind, reason }`。`kind` 取 `translation-table`、`stylesheet`、`static-data`、`generated-code` 之一；`reason` 至少 20 个非空白字符，写明为什么拆开反而更糟。
- 条目必须对应一个现存的巨大单元。拆小了、改名了、删了，条目要在同一个 PR 里跟着改，否则门禁报“条目已过期”；所以登记表随清单一起缩小。文件改名时条目改成新键；搬动的同时又大改，git 认不出改名，会被算成新单元，所以先搬后改，分两个 PR。
- **登记不放行新增**：对 merge-base 不是巨大单元的，不管有没有登记都按新增失败。登记表和代码在同一个 PR 里，登记要是能放行，那个 PR 加一个超长单元再加一条理由就过了，而评审请求并不强制（决定：SSOT 与 CODEOWNERS 的负责人，spec §1 2026-10-07）。登记只记“这个已经超限的单元必须长”的理由，不是通行证；所以新写的、必然很长的单元在 PR 里没有登记这条路，见 §4。
- 已登记的单元和所有巨大单元一样，只许变小；已记录单元的增长不因登记放行。
- 条目的增删和 `limits.json` 一样落在 `tooling/gates/` 下，在 CODEOWNERS 里请求负责人评审（不强制）；但它不是改数字的入口：登记既不放行新增，也不放行增长。

## 2. 现状

164 个单元：35 个文件、40 个类、89 个函数。判定分布：

| 判定 | 文件 | 类 | 函数 | 合计 |
| --- | ---: | ---: | ---: | ---: |
| 拆 | 16 | 39 | 84 | 139 |
| 归线 | 15 | 1 | 5 | 21 |
| 例外 | 4 | 0 | 0 | 4 |
| 合计 | 35 | 40 | 89 | 164 |

- **例外**（4 个）已登记在 `tooling/gates/giant-exceptions.json`：样式表 3 份（动量、基础控件、Coding）、连接器声明表 1 份。`--report` 在这些单元后面标 `[exception: …]`。看起来像例外、但没有登记的两处：Pages 的样式表只超 12 行，开头 12 行是用 `PAGES_TONES` 生成的色调规则，移到 `tone.ts` 就回到 800 行；组件规格板 `primitives/catalog.ts` 里有一段 175 行带分支的演示脚本，不是静态数据，脚本归 W5-04，剩下的样例标记已有章节函数的雏形，照样拆。英文词典 `en.ts` 也不是例外：决定 #16 已定词典按主人分，它归 W5-03（见下），所以 `translation-table` 这一类现在没有条目。
- **归线**（21 个）：浏览器脚本模板、旧皮肤和英文词典 `en.ts`（决定 #16，W5-03）等，路线里别的线会让它消失或换形态。归线的单元都有片号。Characters 一项挂在 W5-01 下：路线 W5-01 原有“Shelf 和 Characters 混合插件”一项，决定 #26 把其中 Characters 的部分提到第 4 波，那个切片在路线里还没有自己的片号（见下）。
- **拆**（139 个，106 个文件）：其中 123 个归 W5-10（94 个文件，32 个批次；助理的 3 个单元由 W4-05 先抽样板，也在这 123 个里），其余 16 个归 W1-05、W3-03、W4-06、W4-07、W5-04、W5-07、W5-09。
- 全部单元里，46 个只超出阈值不到 20%（9 个文件、28 个函数、9 个类；类按行数与方法数里超得多的那一项算），其中 37 个在 W5-10；5 个类只因方法数超标（行数没超）；这些超出不多，是 W5-10 里最便宜的一批。

### W5-10 怎么做

路线里 W5-10 的标题是“其余巨大单元拆分”，原文点名了助理协作者、Pages 编辑器的 `mount`、`hoverHandlePlugin` 与 `commands.ts`，之后“按决定搬助理包”。本清单把它的范围定为所有判定为“拆 · W5-10”的单元（123 个，94 个文件），做成一串 PR：**每个包一个 PR**，先做任务书 §4.5 第 3 条点名的助理、平台记忆服务、Pages 编辑器（Prologue 节点适配器的初始化函数与 Coding 的路由绑定已有 W4-06、W4-07），其余按窗口内被改动得最多的先做（并列的，单元多的在前，再按路径；窗口的定义在下表后面）。每个 PR 只拆自己包里的单元，拆完就在同一个 PR 里改本表对应的行并更新本地快查。下表是这一串的顺序：

| 顺序 | 批次（包） | 文件 | 单元 | 窗口内改动它的合并数 | 备注 |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | `apps/local-host/src/assistant` | 2 | 3 | 18 | 决定 #3：W4-05 先拆出提醒与跟进作样板，W5-10 拆其余协作者，最后搬成独立包 |
| 2 | `horizontal/memory` | 1 | 2 | 3 | 任务书 §4.5 点名“平台记忆服务”；N-03 之后路线里没有别的片拆它，代码不搬、包内拆 |
| 3 | `plugins/native/pages` | 4 | 10 | 12 | 任务书点名“Pages 编辑器的挂载函数”；路线原文点名的 `mount`、`hoverHandlePlugin`、`commands.ts` 都在这里 |
| 4 | `apps/local-host` | 16 | 20 | 41 | 不含助理目录；web-* 路由文件的形态与 W5-07 的注册表一致 |
| 5 | `apps/workbench` | 5 | 6 | 30 |  |
| 6 | `horizontal/agent-host` | 11 | 15 | 18 | `prologue-node.ts` 由 W4-06 先拆 |
| 7 | `plugins/native/goals` | 7 | 8 | 10 |  |
| 8 | `packages/plugin-runtime` | 4 | 5 | 9 | W3-06、W4-02 之前或同一 PR 先拆被它们碰到的类 |
| 9 | `plugins/native/feed` | 1 | 1 | 7 | 不依赖 Feed 迁 Runtime 的专项计划 |
| 10 | `plugins/native/workflows` | 1 | 1 | 6 |  |
| 11 | `plugins/native/work` | 4 | 4 | 5 |  |
| 12 | `plugins/native/plugin-builder` | 2 | 2 | 5 | 创作台属构建期例外清单，不迁 Runtime，就地拆 |
| 13 | `horizontal/listener-host` | 1 | 1 | 5 |  |
| 14 | `modules/feed` | 1 | 1 | 5 |  |
| 15 | `packages/storage` | 2 | 2 | 4 |  |
| 16 | `horizontal/search` | 1 | 1 | 4 | 决定 #19 删按需搜索来源后再拆更省 |
| 17 | `plugins/native/todo` | 1 | 1 | 4 |  |
| 18 | `modules/goals` | 7 | 10 | 3 |  |
| 19 | `modules/functions` | 1 | 2 | 3 |  |
| 20 | `packages/design-system` | 1 | 2 | 3 |  |
| 21 | `packages/kernel` | 1 | 2 | 3 | W3-05 之前或同一 PR 先拆 `registerProvider` |
| 22 | `horizontal/placement` | 1 | 1 | 3 | 决定 N-03：代码不搬，包内拆 |
| 23 | `plugins/official-integrations/gmail` | 4 | 5 | 2 |  |
| 24 | `modules/private-work-context` | 4 | 4 | 2 |  |
| 25 | `modules/shelf` | 1 | 3 | 2 |  |
| 26 | `horizontal/scheduler` | 1 | 1 | 2 |  |
| 27 | `modules/projects` | 1 | 1 | 2 |  |
| 28 | `plugins/native/coding` | 1 | 1 | 2 |  |
| 29 | `plugins/native/cognia` | 1 | 1 | 2 |  |
| 30 | `packages/im-ui` | 2 | 3 | 1 | 决定 #4：IM 继续迭代，所以拆 |
| 31 | `plugins/native/alchemist` | 3 | 3 | 1 |  |
| 32 | `packages/plugin-sandbox` | 1 | 1 | 1 |  |

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
| `apps/workbench/src/goals-page-renderer.ts` | 11 | 2 | 227 行 |
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
| W1-05 | 结构门禁：边界规则（模块→横向/插件/应用，插件→应用/横向/模块，应用→应用白名单）；加规则的同一 PR 先拆 | 1 | `evaluateImportBoundary`（只超 2 行） |
| W3-03 | 把运行时 helper 移出 contracts，其中清单校验器移到 plugin-runtime（路线写约 540 行） | 2 | `inspectActionDeclarations`、`inspectAgentDeclaration` |
| W4-04 | Form 样板：迁到 Runtime，浏览器代码改成打包并类型检查的 TS；删宿主里 Form 的 `registerProvider` 站点 | 2 | `form/src/client.ts`、`project-host.ts` |
| W4-05 | 助理服务拆分样板：在原处按包形边界抽出提醒与跟进协作者，带自己的测试（决定 #3 已定） | 3 | `AssistantService`、`AssistantStore` |
| W4-06 | 拆 `initializePrologueNodeAdapter`：`startAgentRun` 进 `prologue-run.ts`，memory、documents、sessions、schedule、recovery 端口各成模块 | 3 | `prologue-node.ts` |
| W4-07 | `codingRouteBindings` 按资源拆（会话与轮次、变更集、写入者、Goal 上下文、时间线） | 2 | `coding/src/routes.ts` |
| W5-01 | 插件族逐个迁到 Runtime，每迁一族就删宿主里它的文件和 `registerProvider` 站点；Feed 另有专项计划（尚未写出） | 4 | `project-host.ts`、Feed 投影的页面渲染、Characters 的 `createCharactersPlugin` 与内嵌的 `start`（决定 #26 把这一项提到第 4 波） |
| W5-02 | 声明式登记：目录和监督器名单由各包声明生成 | 1 | `project-host.ts`（与 W5-01 同） |
| W5-03 | 翻译按主人分词典（决定 #16 改成稳定键），删无引用的键 | 1 | `en.ts` 变小，降到 800 行以下时删这一行 |
| W5-04 | 浏览器代码逐个插件打包、类型检查，再做工作台客户端分段 | 18 | 11 个浏览器脚本模板、`toString` 注入的函数（`createTabWorkspaceOps`、`createPluginComponentClient`、`createCodingTimeline`）、Work 终端客户端、`craft-finish.ts` 与 `primitives/catalog.ts` 里的脚本 |
| W5-05 | 逐个删旧皮肤，并降低页面预算和巨大单元基线 | 2 | `calm-desktop.ts`、`personal-workbench-v3.ts` |
| W5-06 | 声明式贡献挂载器代替 15 个 Goals 挂载适配器；`goals-page-renderer.ts` 改名，留在工作台 | — | 不拆那两个函数（适配器是别的文件） |
| W5-07 | `handleMolisWorkWebRequest` 改成注册表，每个 `*-http` 模块导出 `{match, handle}` | 2 | `web-request.ts` |
| W5-09 | `contracts` 的 `services/agent-host.ts` 按领域拆，纯搬移，由 API 快照守着 | 1 | `agent-host.ts` 合同 |
| W5-10 | 其余巨大单元拆分（范围见上） | 123 | 123 个，含助理协作者、Pages 编辑器与命令 |
| W5-11 | 宿主瘦身：连接器提供方设置与 OAuth 移进官方连接器插件，或按决定 #7 作为宿主管理接口留下 | 1 | `web-connectors-settings.ts` |
| W2-08、W2-09、W3-07 | 删 Goals 无生产调用方的类型化桥；工作区读取只留一个 id；管理入口改走动作并删剩余桥 | 1 | `project-capabilities.ts` |
| W2-06 | 删四处跨主人 SQL（含 `demo-seed.ts` 一处） | — | 只删几行，不改判定 |

已定的决定对判定的影响（决定的编号是 `specs/repository-anti-corruption/spec.md` §10 用户决定表里的序号，N-03 是 10-07 的“记忆、放置与情境启发式的层次”）：

- 决定 #3（系统助理）：先在原处按包形边界拆，再搬成独立包。所以助理是“拆 · W4-05、W5-10”，搬包是 W5-10 的最后一步，不是例外；拆的时候就要让协作者只经端口依赖宿主。
- 决定 #4（IM 与“讨论”页签）：保留并继续迭代，只修三处账目。所以 `im-ui` 的两个单元判“拆”，不冻结。
- 决定 #26（Characters 并进宿主，成为设置的一节）：`createCharactersPlugin` 随 Runtime 条目一起删，判“归线 · §4.6 · W5-01”（路线 W5-01 里 Characters 那一项，决定 #26 把它提到第 4 波）；第 4 波的承接切片在路线里还没有自己的片号，要 W1-01 补。
- 决定 N-03（记忆、放置、搜索、情境启发式归“平台产品服务”，代码不搬）：路线 W4-08 末尾的“再拆 MemoryService”不再执行，`MemoryService`、`PlacementService`、`SearchService` 改在包内由 W5-10 拆。
- 决定 #7（宿主设置写入只走 HTTP，登记为管理接口的例外）：那份例外写在 CALL-CHAINS 的例外表里，和本文的巨大单元例外是两回事；它说连接器路由以后搬进各自的官方接入插件，所以 `web-connectors-settings.ts` 判“归线 · W5-11”，搬的时候要在同一个 PR 里拆到阈值以下。
- 决定 #16（界面翻译全部换成稳定键，词典按主人分）：`en.ts` 不是例外，判“归线 · §4.7 · W5-03”。词典按主人分已经定了，这张表不再是“必须一整块”的东西；W5-03 把插件自有词条移给主人、删无引用的键，它随之变小。
- 决定 #19（删按需搜索来源）：`SearchService.onDemand` 一支随之去掉，W5-10 在它之后拆 `SearchService` 更省。
- 10-07 的插件平台范围决定把 Goals、Artifacts、Sessions 与插件创作台列为构建期例外，它们不迁 Runtime，也就不会因 W5-01 缩小；它们的巨大单元都判“拆 · W5-10”。

## 3. 清单

每行一个文件（同一个文件里的单元一起判）。PR 是上面那个窗口里改动过该文件的合并数。路径省略各节开头写明的前缀；多个包的区另有“包”一列，按包排在一起。

### 宿主 `apps/local-host`（唯一业务 composition root）

28 个单元（拆 25、归线 3），22 个文件。路径前缀 `apps/local-host/src/`。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `agent-host-composition.ts` | `composeAgentHost` 函数 261 行 | 拆 · W5-10 | `composeAgentHost` 的 30 条语句里，大块是一段段“登记一类能力并留下撤销函数”：git 操作（19 和 20 行）、git 结果（25）、准备写入者（24），另有 `integrationSource`（27）。每一类各成一个 `register…` 函数，主函数按顺序调用并收集撤销函数。 | 7 |
| `assistant/assistant-service.ts` | 文件 2,656 行<br>`AssistantService` 类 2,098 行 / 119 方法 | 拆 · W4-05、W5-10 | 决定 #3 已定：先在原处按包形边界拆，再搬成独立包。W4-05 先抽提醒与跟进协作者（`sweepReminders`、`saveFollowUp`、`runFollowUp`、`schedule*`、`saveRule`）作样板；W5-10 再抽委派（`delegation`）、材料轮次（`roundMaterials`）、记忆桥（`memory*`）、建议与撤销（`recordOffer`、`runCard`、`undo`）；其余成组的方法也要有去处：通知与扫描（一次扫描新材料的逻辑已抽到 `assistant-material-scan.ts` 的 `scanNewMaterialOnce`，这只是第一步，还不是包形：`ScanEnvironment` 里放的是整个 `AssistantStore` 类，模块还直接导入兄弟文件 `assistant-relations.js` 的 `identity`；单次运行的保护 `#scanning` 和 `material_scan` 设置的写入仍在服务的 `scanNewMaterial` 里。别的通知方法照这个形状抽出，同时把 store 收窄成端口、去掉对兄弟实现的导入）、作业跟踪（`watchJob`、`checkJob`）、派发与交接、预算与用量、工作对象读取、方法选择、恢复、角色、诊断。目标是每个协作者不超过 25 个方法、300 行。“包形”的意思是：协作者只通过自己的端口类型依赖宿主，不 import 兄弟协作者的实现，所以最后搬包是整目录移动。拆完后 W5-10 末尾搬成独立包。 | 15 |
| `assistant/assistant-store.ts` | `AssistantStore` 类 282 行 / 44 方法 | 拆 · W4-05、W5-10 | 44 个方法按表分组：回合与卡片、通知（`raiseNotice`、`settleNotices`）、提醒与跟进（`followUps`、`saveFollowUp`、`unsettled`）、作业与撤销（`jobs`、`undos`）、用量（`recordUsage`、`usageOf`）、设置。每个协作者带走自己的表访问，随 `AssistantService` 的拆分一起切开；W4-05 先带走提醒与跟进那一组。 | 10 |
| `browser/browser-host.ts` | `BrowserPage` 类 443 行 / 45 方法 | 拆 · W5-10 | `BrowserPage` 的 45 个方法分四组：连接与目标（`attach`、`listenTo`、`targetGone`、`adoptPopup`）、视口与画面（`refreshScreencast`、`applyViewport`、`resize`、`capture`）、导航与历史、输入与对话框/文件/下载（`input`、`answerDialog`、`chooseFiles`、`download*`）。各成协作者，页面类只持有它们。 | 2 |
| `browser/surface-driver.ts` | `createBrowserSurfaceDriver` 函数 166 行 | 拆 · W5-10 | 只超 16 行。`createBrowserSurfaceDriver` 返回的驱动器对象占 141 行（`identity`、`scope`、`observe` 等方法）；各方法抽成函数，返回对象只列出它们。 | 3 |
| `character-import-discovery.ts` | `createCharacterDiscovery` 函数 205 行<br>`discover` 函数 176 行 | 拆 · W5-10 | `discover` 里一个 `for…of` 逐个 Agent 运行时（codex、claude-code、cursor、opencode）扫描候选，占 165 行；每个运行时的扫描抽成函数，目录解析（`manualRoot`、`projectRoot`、`codexHome`、`configHome`）抽成一个函数。`discover` 内嵌在 `createCharacterDiscovery` 里（同一段计两次）。决定 #26 把 Characters 并进宿主，这个文件随之留在宿主或搬进承接它的 Module，拆分不依赖那一步。 | 0 |
| `connector-mcp.ts` | `createConnectorMcpHost` 函数 292 行 | 拆 · W5-10 | `createConnectorMcpHost` 内的 `useClient`（52）、`provider`（45）、`startMcpConnection`（43）、`completeMcpAuthorization`（28）各自成函数或文件，服务白名单 `MCP_SERVERS`（40 行数据）另放；主函数只装配。 | 1 |
| `demo-seed.ts` | `seedDemoBoard` 函数 541 行 | 拆 · W5-10 | `seedDemoBoard` 的 536 行在一个 `try` 里：先是一份目标清单（`goals` 数组，纯数据），后面接一串演示调用（`reportProgress`、`requestDecision`、`applyConcern`、`submitClosure`、`setArchived`），不只是数据，所以不登记例外。清单移到 `demo-seed-data.ts`；演示调用按目标分组，每组一个函数；`seedDemoBoard` 只剩初始化、遍历清单、依次调用。其中一处直写 SQL（`UPDATE boards`）由 W2-06 删除。 | 2 |
| `home-actions.ts` | `homeActionProvider` 函数 185 行 | 拆 · W5-10 | `homeActionProvider` 的返回里，`createHomeTalkHandlers`、`createHomeOfferHandlers`、`createHomeEventHandlers` 三族处理器已经抽出；其余内联的处理器（`readJudgment`、`writeJudgment` 等，返回共 78 行）照此各成 `createHome…Handlers`，`record`（34）、`handler`（27）随各自的族。 | 6 |
| `installed-plugin-host.ts` | `openInstalledPlugins` 函数 205 行 | 拆 · W5-10 | `openInstalledPlugins` 37 条语句，其中 `lifecycle`（46）、`expose`（19）、`catalog`（17）、`definition`（17）、`generate`（13）、`close`（13）各成函数，主函数只组合。 | 6 |
| `installer/runtime-integration.ts` | `RuntimeIntegrationService` 类 341 行 / 15 方法 | 拆 · W5-10 | `confirm` 一个方法 136 行：先验证已应用的计划，再分连接分支与移除分支，失败时还原配置文件与技能快照并写“已回滚”的尝试记录。四步（验证、连接、移除、回滚）各成函数；回执与备份的读写（`readReceipt`、`writeReceipt`、`writeAttempt`、`receiptPath`、`backupPath`）移到回执存取类，服务类只编排。 | 0 |
| `local-host.ts` | `LocalHost` 类 570 行 / 23 方法 | 拆 · W5-10 | `LocalHost` 的大头是 `sceneClient`（95）、项目内操作队列 `enqueue`（54）、可用性判定 `resolveActionAvailability`（44）、`register`（38）。场景客户端、操作队列、可用性判定各成协作者；家目录的那条操作线已经是独立的 `HomeLine`（`home-line.ts`），项目内的 `enqueue` 是同一套机制，照它拆。W3-01（调用编号进调用上下文）和 W3-07（`host_only` 变成可用性策略）预计会碰这里的调用上下文与可用性判定；类已冻结，它们的新增部分先写在新文件里。 | 5 |
| `plugin-builder/agent-surface.ts` | `ensureStudio` 函数 196 行<br>`created callback 1` 函数 188 行 | 拆 · W5-10 | `ensureStudio` 里的 `created` 异步回调 188 行，是创作台的整套装配：模型选择与凭据（`selected`、`models`、`access`）、沙箱运行器与预览（`runnerFor`、`previewFor`、`inTrial`）、交给工作流的端口对象（约 90 行）。三块各成 `create…` 函数。`created` 内嵌在 `ensureStudio` 里（同一段计两次）。 | 8 |
| `project-capabilities.ts` | `registerProjectCapabilities` 函数 270 行 | 归线 · §4.3 · W2-08、W2-09、W3-07 | 里面登记 Goals 的类型化桥和工作区读取的两个 id，这三片要删；删完重量，仍超限就在 W3-07 的同一个 PR 里按能力族拆。 | 5 |
| `project-catalog.ts` | `MolisWorkProjectCatalog` 类 293 行 / 41 方法 | 拆 · W5-10 | 41 个方法里约三十个是三行的转发（项目与插件、运行上下文绑定、桌面面板、工作区成员、示例项目），`constructor` 72 行是装配。按资源分子门面，调用方拿自己要的那个，转发层随之去掉。 | 6 |
| `project-host.ts` | `MolisWorkLocalHost` 类 361 行 / 24 方法 | 归线 · §4.6 · W4-04、W5-01、W5-02 | 项目 composition owner。`constructor` 153 行，文件里 26 处 `registerProvider`，插件族迁到 Runtime 时各删各的（W4-04 先删 Form 的），W5-02 再把名单改成由声明生成。这几片之后类仍超限，W6-04 重量时在门禁里会看到，同一片补拆。 | 14 |
| `web-catalog.ts` | `handleLocalCatalogWebRequest` 函数 336 行 | 拆 · W5-10 | 目录级 HTTP（项目选择、搜索、待办、角色、跨项目会话等）：`handleLocalCatalogWebRequest` 46 条语句，主要是 `if` 路由分支，最大的两个 77 和 60 行。按路由族拆成 `{match, handle}` 条目，形态与 W5-07 的注册表一致。 | 15 |
| `web-connectors-settings.ts` | `handleLocalConnectorsSettingsHttp` 函数 227 行 | 归线 · §4.3 · W5-11 | 连接器提供方设置与 OAuth 的 HTTP。决定 #7 说连接器路由以后搬进各自的官方接入插件，那是 W5-11。搬的时候不能整体搬进新文件（搬到新文件的巨大函数按新单元算），要在同一个 PR 里按路由或按服务商拆到阈值以下；在 W5-11 之前这个函数冻结。 | 1 |
| `web-goals-read.ts` | `createLocalGoalsReadHttp` 函数 175 行 | 拆 · W5-10 | `createLocalGoalsReadHttp` 内的 `page`（91）、`settings`（43）、`fragments`（30）三个路由处理各成函数，装配函数只列出它们。 | 8 |
| `web-project-settings.ts` | `createLocalProjectSettingsHttp` 函数 189 行<br>`handle` 函数 182 行 | 拆 · W5-10 | `handle` 的 `if` 路由分支（最大 47、32、24 行）改成路由表，每个路由一个函数。`handle` 内嵌在 `createLocalProjectSettingsHttp` 里（同一段计两次）。 | 3 |
| `web-request.ts` | `handleMolisWorkWebRequest` 函数 441 行<br>`handleMolisWorkWebRequest callback 1` 函数 327 行 | 拆 · W5-07 | 改成注册表，每个 `*-http` 模块导出 `{match, handle}`；327 行的回调内嵌在该函数里。路线写明部分依赖 W5-01。 | 22 |
| `web-server.ts` | `createLocalWebServerFactory` 函数 241 行<br>`createMolisWorkWebServer` 函数 238 行 | 拆 · W5-10 | `createMolisWorkWebServer` 49 条语句：HTTP 服务（`server` 74）、本机宿主（`localHost` 16）、周期调度（`schedulerTimer` 14，每 30 秒推进 Feed 与 Schedule）、侧栏浏览器登记（`unregisterSurfaces` 13）、PTY 挂接（12）、关停（`server.once("close")` 12）各成启动函数，装配函数只按顺序调用并登记关停。它内嵌在 `createLocalWebServerFactory` 里（同一段计两次）。 | 7 |

### 工作台 `apps/workbench`（页面组合与浏览器脚本）

14 个单元（拆 7、归线 7），13 个文件。路径前缀 `apps/workbench/src/`。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `capsule-items.ts` | `createCapsuleItemProjection` 函数 229 行 | 拆 · W5-10 | 22 条语句：`stateFromItem`（26）加六个条目构造（决定 19、可做 17、阻塞 15、进行中 14、等待 14、最近完成 17）。每种条目一个函数，投影函数只做组合。 | 2 |
| `feed-projection-ui.ts` | `createWorkbenchFeedProjectionRenderer` 函数 401 行 | 归线 · §4.6 · W5-01 | Feed 投影的页面渲染，写在工作台里；Feed 迁 Runtime 时随 Feed 离开工作台。路线把 Feed 列为“自有计划”，该计划还没有写出。搬走时要同时拆到阈值以下（搬到新文件的巨大函数按新单元算）：`sourceModel`（84）、`demoFeedEntries`（78）、`demoSourceModels`（55）、`buildFeedNativePluginModel`（40）已是内嵌的独立函数，演示数据共 133 行单独成文件。 | 3 |
| `functions/client.ts` | 文件 1,299 行 | 归线 · §4.8 · W5-04 | 判断编辑器的浏览器脚本模板（1,297/1,299 行）。 | 1 |
| `goals-page-renderer.ts` | `createWorkbenchGoalsPageRenderer` 函数 227 行<br>`renderMolisWorkWeb` 函数 191 行 | 拆 · W5-10 | 外壳页面渲染器（名字不对）。W5-06 只改名并换掉 15 个挂载适配器（它们是别的 `goals-*.ts` 文件），不缩短这两个函数。`renderMolisWorkWeb` 191 行里 `html` 模板 109 行、`goalStage` 25 行、`frameStage` 13 行：页面骨架、目标舞台、框架舞台各成函数。它内嵌在 `createWorkbenchGoalsPageRenderer` 里（同一段计两次）。 | 11 |
| `i18n/en.ts` | 文件 3,380 行 | 归线 · §4.7 · W5-03 | 英文词典：一个对象字面量（1,458 行）加几块 `Object.assign(EN, …)`，没有逻辑，没有函数要拆。它也不是例外：决定 #16（全部换成稳定键，词典按主人分）已定，W5-03（§4.7，翻译词典、路由登记这类聚合点改成各主人自己登记）把插件自有词条移给主人、删无引用的键，它随之变小，降到 800 行以下时这一行删除。它是窗口里被改得最多的文件，还从 17 个插件包 import 各自的词条表。在那之前它和所有巨大单元一样只许变小。 | 24 |
| `project-settings-pages.ts` | `createWorkbenchProjectSettingsPages` 函数 179 行 | 拆 · W5-10 | `renderProjectGuidanceDocument`（43）、`renderMolisWorkProjectSettingsHub`（31）、`renderHubSection`（19）各成文件，其余三个页面函数各 9 行留在组合函数里。 | 3 |
| `renderer.ts` | `createWorkbenchRenderer` 函数 381 行 | 拆 · W5-10 | `createWorkbenchRenderer` 68 条语句，内嵌了 `renderTuiPane`（20）、`dataJson`（17）、`prefixLocalLinks`（15）、`formatDate`（13）、`renderGoalDocument`（13）、`renderShelfNativePluginSurface`（10）等小函数，加 29 行的返回。小函数按页面种类移到模块级文件，主函数只组合各 UI 主人的渲染器。 | 14 |
| `scripts/client/assistant-island.ts` | 文件 2,813 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（2,803/2,813 行在一个模板字符串里）；工作台客户端分段打包并类型检查。 | 18 |
| `scripts/client/events-primary.ts` | 文件 810 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（808/810 行）。 | 7 |
| `scripts/client/navigation-feed.ts` | 文件 1,025 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,020/1,025 行），里面写死了 Feed 的客户端。 | 5 |
| `scripts/client/tab-workspace.ts` | 文件 2,049 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（2,014/2,049 行）。 | 11 |
| `settings-renderer.ts` | `createWorkbenchSettingsRenderer` 函数 235 行 | 拆 · W5-10 | 13 条语句，其中 `renderMolisWorkSettings`（65）、`renderDiagnosticsSettings`（49）、`renderProjectSettings`（47）、`renderRuntimeSettings`（16）各是一个设置页；每个页面一个文件，主函数只做组合。 | 5 |
| `tab-workspace-ops.ts` | `createTabWorkspaceOps` 函数 461 行 | 拆 · W5-04 | 标签工作区的纯规则，文件头 `// @ts-nocheck`，用 `toString` 序列化后注入浏览器。50 条语句里 `splitPane`（33）、`moveTab`（30）、`normalizeLayout`（22）、`ensureHome`（21）、`openBeside`（21）等本来就各自独立。W5-04 把交付形式改成打包的类型检查模块时，这些变成各自的模块导出，同一个 PR 拆到阈值以下。（本清单对 W5-04 的范围解释：凡在浏览器里跑的代码，不论模板字符串还是 `toString` 注入的函数。） | 2 |

### Agent Host `horizontal/agent-host`（唯一直接依赖 `@prologue/sdk` 的包）

18 个单元（拆 18），12 个文件。路径前缀 `horizontal/agent-host/src/`。

| 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | ---: |
| `adapters/plugin-builder.ts` | `createPluginBuilderAgent` 函数 204 行<br>`run` 函数 153 行 | 拆 · W5-10 | `run` 里 `execution` 一段 127 行，另有 `guard`（5）、`record`（3）；`createPluginBuilderAgent` 里 `authority` 16 行。执行体、守卫、记录、权限各成函数。`run` 内嵌在 `createPluginBuilderAgent` 里（同一段计两次）。 | 5 |
| `adapters/prologue-action-gateway.ts` | `prologueActionGateway` 函数 174 行 | 拆 · W5-10 | `executors` 表（51 行）、`invoke`（30）、`tools` 装配（24）各成函数；`memoryExecutors`、`delegationExecutors` 已是模块级函数，和 `executors` 放进同一个目录。 | 4 |
| `adapters/prologue-checkpoints.ts` | `createPrologueCheckpoints` 函数 221 行 | 拆 · W5-10 | `capability` 对象 125 行：`busy`、`restore`、`context` 等方法各抽成函数，`context` 里拼“宿主的实际操作记录”提示文字的一段单独成文件；`restore`（30）、`document`、`settle`（各 15）已是独立块。 | 1 |
| `adapters/prologue-git.ts` | `createPrologueGitReviews` 函数 188 行 | 拆 · W5-10 | 返回的对象 72 行、`bindRecovery` 50 行、`restore` 23 行；操作各成函数，恢复绑定独立成文件。 | 2 |
| `adapters/prologue-mcp.ts` | `createPrologueMcpLibrary` 函数 232 行 | 拆 · W5-10 | `library` 对象 165 行：`list`、`save` 等方法各成函数，`save` 里按传输方式（stdio、http）的分支各成校验函数；`refreshSelected`（13）、`view`（10）随各自的操作。 | 2 |
| `adapters/prologue-messages.ts` | `createSessionMessages` 函数 170 行 | 拆 · W5-10 | 只超 20 行。返回对象 85 行、钩子注册 33 行、`unsubscribe` 21 行；把钩子注册与返回对象分成两个函数。 | 0 |
| `adapters/prologue-node.ts` | 文件 1,764 行<br>`initializePrologueNodeAdapter` 函数 1,436 行<br>`startAgentRun` 函数 418 行 | 拆 · W4-06 | `startAgentRun` 移到 `prologue-run.ts`，memory、documents、sessions、schedule、recovery 端口各成模块，`initializePrologueNodeAdapter` 只剩组合；`startAgentRun` 内嵌在它里面。 | 15 |
| `adapters/prologue-stream.ts` | `applyPrologueEvent` 函数 304 行 | 拆 · W5-10 | `applyPrologueEvent` 是一个 298 行的 `switch`；每种事件一个处理函数，`switch` 只分发。 | 6 |
| `adapters/prologue-taskboard.ts` | `createPrologueTaskBoards` 函数 220 行 | 拆 · W5-10 | 返回对象 147 行、钩子 31 行、`unsubscribe` 17 行：钩子注册、跟随（`following`/`stopFollowing`）、返回的任务板操作各成函数。 | 2 |
| `adapters/prologue.ts` | 文件 1,026 行<br>`PrologueAgentAdapter` 类 658 行 / 18 方法<br>`(module) callback 1` 函数 187 行 | 拆 · W5-10 | 文件、类、私有方法三个单元互相包含：文件 1,026 行 > `PrologueAgentAdapter` 658 行/18 方法 > 私有方法 `#start` 187 行（门禁里记作 `(module) callback 1`，见 §1）。`#start` 按阶段拆；类里还有 `constructor`（81）、`#publish`（63）；会话读写（`createSession`、`readSession`、`#loadSession`、`#restoreSession`）与运行控制（`start`、`control`、`observe`）分成两个协作者；类型与端口声明另放文件，文件回到 800 行以下。W4-06 不含它。 | 8 |
| `capability-registration.ts` | `registerAgentHostCapabilities` 函数 393 行 | 拆 · W5-10 | `registerAgentHostCapabilities` 的 `disposers` 数组占 326 行；按能力族分成几个 `register…` 函数，主函数合并它们的撤销函数。 | 2 |
| `index.ts` | `AgentHost` 类 409 行 / 12 方法<br>`start` 函数 267 行 | 拆 · W5-10 | `start` 267 行、53 条语句，`if` 块最大 22 行：预算与执行计划冻结、提示词解析、角色与运行时能力检查、工作区模式检查（含无工作区推理的限制）、起运行并回收（`handle` 23 行）各成函数；`AgentHost` 的 12 个方法其余部分（`availableRoles` 27、`createSession` 20）随之。`start` 在类里（类和方法各计一次）。 | 8 |

### 其他横向服务 `horizontal/*`（含平台产品服务：记忆、放置、搜索）

6 个单元（拆 6），5 个文件、5 个包。路径前缀 `horizontal/`。

| 包 | 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | --- | ---: |
| `listener-host` | `src/index.ts` | `ListenerHost` 类 373 行 / 18 方法 | 拆 · W5-10 | `ListenerHost` 的 18 个方法分三组：运行（`run` 144 行、`saveRun`、`recoverInterruptedRuns`）、投递（`acceptDelivery` 61、`persistDeliveries` 35、`pendingDeliveries`）、检查点与租约（`ensureCheckpoint`、`acquireLease`、`advanceCursor`、`updateCheckpointFailure`）。投递与检查点各成协作者，`run` 本身按步骤拆。 | 5 |
| `memory` | `src/service.ts` | 文件 1,338 行<br>`MemoryService` 类 1,101 行 / 56 方法 | 拆 · W5-10 | 决定 N-03：代码不搬，只在包内拆。`MemoryService` 56 个方法分组：偏好、召回与使用（`recall` 57）、写入与候选（`commit` 107、`change` 71、`propose`、`accept`）、从工作中学习（`learnFromWork`）、维护（`upkeep` 91、`pairs`）、范围操作（`previewScope`、`clearScope`、`exportScope`、`importScope`）。每组一个协作者；声明与类型另放，文件回到 800 行以下。路线 W4-08 末尾写“再拆 MemoryService”，但 N-03 决定把 W4-08 改成文档与边界规则，所以拆分改归这一片。 | 3 |
| `placement` | `src/index.ts` | `PlacementService` 类 419 行 / 28 方法 | 拆 · W5-10 | 决定 N-03：代码不搬。`PlacementService` 28 个方法分四组：位置读取（`locate`、`describe` 69、`readIn` 27、`location`）、关系（`link`、`unlink`、`related`）、目标绑定（`goals`、`bindGoal`、`goalBindings`）、移动复制转换（`move`、`moveHome`、`copy`、`convert` 40）。 | 3 |
| `scheduler` | `src/index.ts` | `createScheduleService` 函数 282 行 | 拆 · W5-10 | `createScheduleService` 里 `fire` 86 行、`register` 38、`claim` 23、`setEnabled` 20、`toRecord` 20、`tick` 19、`renewExecutions` 16：触发（`fire`、`claim`、`tick`、`renewExecutions`）与登记管理（`register`、`setEnabled`、`toRecord`）分成两个文件。 | 2 |
| `search` | `src/index.ts` | `SearchService` 类 436 行 / 28 方法 | 拆 · W5-10 | `SearchService` 28 个方法分三组：查询（`query`、`open` 46、`entrySources`、`scoped`、`matchesFilter`）、同步（`runSync` 67、`reconcile`、`needsSync`、`catchUp`、`scheduleRefresh`、`refreshKnown`）、登记与状态（`markRegistration`、`markChanged`、`announce`、`status`、`statuses`、`purgeDisabled`）。决定 #19 删按需搜索来源，`onDemand` 与 `querySources` 随之去掉，先做那一步再拆更省。 | 4 |

### 业务事实 Module `modules/*`

21 个单元（拆 21），15 个文件、6 个包。路径前缀 `modules/`。

| 包 | 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | --- | ---: |
| `feed` | `src/index.ts` | `FeedModule` 类 501 行 / 16 方法 | 拆 · W5-10 | `FeedModule`（`FeedApi` 的实现）：`ingest` 137 行按阶段拆，`upsertMaterial`（53）、`setDisposition`（46）、`linkGoal`（32）分到读取、摄入、状态变更三个协作者；`FEED_SCHEMA_SQL`（72 行）另放。 | 5 |
| `functions` | `src/store.ts` | 文件 939 行<br>`FunctionsStore` 类 336 行 / 22 方法 | 拆 · W5-10 | 文件 939 行：`FUNCTIONS_STORE_BASELINE`（50）、`buildRecord`（56）、`fromRow`、`normalize*`、`mapJudgment` 等建表与行映射移到 `records.ts`，文件回到 800 行以下。`FunctionsStore` 336 行/22 方法按草稿（`create`、`updateDraft`、`savePreview`、`addSample`、`publish`）、动作场景绑定、判断记录（`recordJudgment`、`listJudgments`、`latest*`）三组拆。 | 3 |
| `goals` | `src/event-facts-repository.ts` | `GoalEventFactsRepository` 类 371 行 / 29 方法 | 拆 · W5-10 | 29 个方法按表分组：配置、事件类型、要求、绑定、工作事件、判断。每组一个表访问类。 | 1 |
| `goals` | `src/event-facts.ts` | `GoalEventFacts` 类 576 行 / 35 方法 | 拆 · W5-10 | `configureRequested`（106）和 `configureInTransaction`（109）、`report`（83）三块最大。`applyConcern`、`requestDecision`、`citeDecision`、`recordTrustedDecision`、`setAgreement`、`submitClosure`、`resumeWork` 在 `GoalEventFacts`、`GoalEventState`、`GoalEventStateEffects` 三层各有一份，前两层的是三到六行的转发：让调用方直接拿 `GoalEventState` 的入口，转发层去掉；配置、报告、读取各成协作者。 | 2 |
| `goals` | `src/event-state-effects.ts` | `GoalEventStateEffects` 类 539 行 / 12 方法<br>`recordTrustedDecision` 函数 155 行 | 拆 · W5-10 | `recordTrustedDecision`（155，在类里，类和方法各计一次）、`submitClosure`（118）、`requestDecision`（82）三个大方法各成命令类，`resumeWork`、`citeDecision`、`reopenCompletion`、`reassessAfterReports` 随各自的主题。 | 1 |
| `goals` | `src/event-state-repository.ts` | `GoalEventStateRepository` 类 408 行 / 30 方法 | 拆 · W5-10 | 30 个方法按表分组：所有者与工作状态、约定与进度、顾虑、决定请求、已应用决定、结论与收尾。每组一个表访问类。 | 2 |
| `goals` | `src/event-state.ts` | `GoalEventState` 类 365 行 / 21 方法 | 拆 · W5-10 | `insertSystem`（52）、`writeProgress`（46）、`recordProgress`（38）、`readWorkState`（30）、`adoptOwner`（28）是实际逻辑；`applyConcern`、`requestDecision` 等七个是对 `GoalEventStateEffects` 的三行转发（见 `event-facts.ts` 一行）。进度与工作状态一组，所有者与作用域检查一组，转发层去掉。 | 3 |
| `goals` | `src/guidance-commands.ts` | `GuidanceCommands` 类 368 行 / 3 方法<br>`update` 函数 201 行 | 拆 · W5-10 | 只有 3 个方法但 `update` 201 行、`add` 149 行。`update` 依次是读取并规范化输入、校验（确认、动作、必填）、`edit` 分支、构造请求与哈希、事务（141 行的 `return`），各成函数；`add`、`update` 成两个命令类。`update` 在类里（类和方法各计一次）。 | 1 |
| `goals` | `src/lifecycle-archive.ts` | `setTrashed` 函数 185 行<br>`setTrashed callback 1` 函数 174 行 | 拆 · W5-10 | `setTrashed` 的返回里是 174 行的事务回调（同一段计两次），按步骤拆；`GoalArchiveCommands` 其余方法留在类里。 | 2 |
| `private-work-context` | `src/project-binding-commands.ts` | `RuntimeProjectBindingCommands` 类 333 行 / 12 方法 | 拆 · W5-10 | `bindRuntimeContextInTransaction` 102 行、`unbindRuntimeContext` 57、`rejectRuntimeContextSuggestion` 51：绑定、解绑、拒绝建议各一个命令类，成员关系与日志助手（`upsertWorkspaceMembership`、`removeSessionBinding`、`appendRuntimeContextBindingEvent`）单独成文件。 | 0 |
| `private-work-context` | `src/session-handoffs.ts` | `SessionHandoffRepository` 类 325 行 / 14 方法 | 拆 · W5-10 | 草稿（`createDraft*`、`updateDraft*`）、发送状态（`markSending`、`attachDestination`、`markFailed`、`markSent`、`cancel`）、恢复中断与行映射（`recoverInterrupted`、`map`）三组。 | 0 |
| `private-work-context` | `src/session-records.ts` | `SessionRecordRepository` 类 320 行 / 15 方法 | 拆 · W5-10 | 创建与发现（`createSession`、`discoverSession`、`explicitlyLinkSession`、`linkNativeRuntimeSession`）、关联更新（`updateAssociations*`、`setAssociationReferences`、`reassignWorkspaceSessions`）、查找（`get`、`find*`、`list`、`goalHistory`）三组。 | 0 |
| `private-work-context` | `src/session-registry.ts` | `MolisWorkSessionRegistry` 类 174 行 / 29 方法 | 拆 · W5-10 | 对外门面：29 个方法几乎都是转发，只因方法数超标。按会话、交接、事件三组拆成子门面，调用方拿自己要的那个。 | 2 |
| `projects` | `src/repository.ts` | `ProjectsRepository` 类 287 行 / 29 方法 | 拆 · W5-10 | 29 个方法分四组：项目（`insertProject`、`renameProject`、`updateDatabasePath`）、项目插件与隐藏插件、工作区与成员关系、删除记录（`insertDeletion`、`findDeletion`）。每组一个表访问类；删除记录这组预计会被 W2-07（项目删除统一）碰到，那一片的新增部分先写在新文件里。 | 2 |
| `shelf` | `src/store.ts` | 文件 1,176 行<br>`ShelfStore` 类 748 行 / 35 方法<br>`runJob` 函数 199 行 | 拆 · W5-10 | 文件 1,176 行；`ShelfStore` 748 行/35 方法分组：收件（`admitFile`、`admit`、`admitFolder`、`admitText`、`admitUrl`、`captureUrl`）、作业（`runJob`、`storeResult`、`cancelJob`、`writeCopy`、`useAsMaterial`）、剪贴（`addClipboard`、`deleteClipboard`、`clipboardToMaterial`）、目录文件读写（`readCatalog`、`writeCatalog`、`update`）。`runJob` 199 行（`try` 83 行）按阶段拆，它在类里（类和方法各计一次）。`normalizeCatalog`、`clipTitleFor`、`normalizeClip` 等移出。 | 2 |

### 平台包 `packages/*`

25 个单元（拆 21、归线 2、例外 2），21 个文件、8 个包。路径前缀 `packages/`。

| 包 | 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | --- | ---: |
| `contracts` | `src/platform/actions.ts` | `inspectActionDeclarations` 函数 158 行 | 拆 · W3-03 | 清单校验器随 W3-03 移出 contracts（路线写约 540 行移到 plugin-runtime；contracts 里 `inspect*Declarations` 一族共约 660 行，这是其中最大的两个函数之一）。原样搬到别处会被门禁当作新增，要边搬边按声明段拆。 | 17 |
| `contracts` | `src/platform/plugin-agent.ts` | `inspectAgentDeclaration` 函数 162 行 | 拆 · W3-03 | 同上：`inspectAgentDeclaration` 是 `inspect*Declarations` 一族里第二大的函数。 | 2 |
| `contracts` | `src/services/agent-host.ts` | 文件 1,734 行 | 拆 · W5-09 | 按领域拆合同文件（运行能力、冻结的启动字段、运行视图、记忆能力、错误码、`agentHostCapabilities` 等），纯搬移，由 API 快照守着。 | 13 |
| `design-system` | `src/plugin-component-client.ts` | `createPluginComponentClient` 函数 754 行 | 拆 · W5-04 | 生成插件的宿主渲染器，按部件种类画；类型化函数，用 `toString` 序列化进浏览器（754 行、73 条语句：`createPart` 142、`output` 137、`figures` 36、`showDetail` 32、`control` 32）。W5-04 改成打包的类型检查模块时，各部件成各自的模块，同一个 PR 拆到阈值以下。（对 W5-04 范围的解释同 `tab-workspace-ops.ts`。） | 3 |
| `design-system` | `src/primitives/catalog.ts` | 文件 947 行<br>`renderPrimitiveCatalog` 函数 648 行 | 拆 · W5-04、W5-10 | `/__ui/catalog` 规格板。页尾 `<script>` 175 行（第 771–945 行，带分支的演示脚本）是浏览器代码，归 W5-04，移出后文件 772 行、不再超限。剩下的 `renderPrimitiveCatalog` 约 470 行是样例标记，除 `.map` 拼接外没有分支和 IO，但不登记例外：它已经有 `arrivalSection`、`craftSection`、`paletteSection` 等章节函数，其余章节（`sections` 数组 116 行，`catalogDirRows` 36、`catalogShellDirectory` 35、`catalogCompact` 27 行等）照此各成章节函数，W5-10 完成。 | 3 |
| `design-system` | `src/styles/calm-desktop.ts` | 文件 1,392 行 | 归线 · §4.8 · W5-05 | 旧皮肤，整份删除（逐个过视觉比对）。 | 3 |
| `design-system` | `src/styles/craft-finish.ts` | 文件 2,313 行 | 拆 · W5-04 | 1,924 行样式（`CRAFT_BASE_STYLES`）加 323 行 `CRAFT_FINISH_CLIENT_SCRIPT` 浏览器脚本，两个变化原因。脚本在 W5-04 里移出并打包；同一个 PR 把剩下的 1,924 行样式表登记为例外 · 样式表。现在不登记：文件里除样式外还有一段浏览器脚本，不是单一职责，写不出成立的理由；脚本移出后剩下的才是单一职责的样式表。（对 W5-04 范围的解释同 `tab-workspace-ops.ts`。） | 14 |
| `design-system` | `src/styles/momentum.ts` | 文件 1,171 行 | 例外 · 样式表 | `MOMENTUM_STYLES` 一个模板字符串，纯 CSS（Goals 动量视图）。 | 4 |
| `design-system` | `src/styles/personal-workbench-v3.ts` | 文件 1,422 行 | 归线 · §4.8 · W5-05 | 旧皮肤，整份删除。 | 1 |
| `design-system` | `src/styles/primitives.ts` | 文件 1,276 行 | 例外 · 样式表 | `PRIMITIVE_STYLES` 一个模板字符串，纯 CSS，开头只有几个共用的 CSS 片段常量。 | 1 |
| `im-ui` | `src/browser/controller.ts` | 文件 966 行<br>`startIm` 函数 957 行 | 拆 · W5-10 | “讨论”页签与 IM 是在用、还会迭代的功能（决定 #4），所以按职责拆，不是冻结：`startIm` 957 行、86 条语句，启动（`startup` 72）、房间（`selectRoom` 62、`refresh` 60）、线程（`newThread` 60、`selectThread` 48）、发送（`send` 48）、document 级点击监听（一段 111 行）各成模块，`startIm` 只组合。 | 1 |
| `im-ui` | `src/views.ts` | `createViews` 函数 164 行 | 拆 · W5-10 | `createViews` 里 `stream` 84 行、`context` 16、`markup` 12、`restoreScroll` 12：流、上下文、滚动保持各成视图函数。 | 0 |
| `kernel` | `src/action-service.ts` | `ActionService` 类 418 行 / 15 方法<br>`registerProvider` 函数 155 行 | 拆 · W5-10 | `registerProvider` 的 `try` 块 122 行有两个循环：动作登记（每个动作的 `execute` 闭包里是限速、生命周期、`beforeEffect` 检查、输出校验、结算记录）和场景登记（逐项校验、登记）。两个循环各成函数，`execute` 的各步再各成助手；类里场景相关的 `discoverScenes`、`bind`、`runScene`、`requireScene` 为一组，动作相关的 `discover`、`inspect`、`directory`、`invoke` 为另一组。`registerProvider` 在类里（类和方法各计一次）。W3-05 要在注册时加交叉校验：这个函数已冻结，校验代码放在新文件由它调用，不要加在函数里。 | 3 |
| `plugin-runtime` | `src/events.ts` | `PluginEventBus` 类 420 行 / 23 方法 | 拆 · W5-10 | `PluginEventBus` 的 23 个方法分三组：发布与匹配（`publish` 72、`#match`、`#enqueue`）、投递（`#deliver` 99、`#fail`、`#resume`、`drain`）、游标与恢复（`#saveCursor`、`recover`、`recoveryHistory`、`cursors`）。 | 4 |
| `plugin-runtime` | `src/index.ts` | 文件 886 行<br>`PluginRuntime` 类 664 行 / 30 方法 | 拆 · W5-10 | 文件 886 行：`PluginRuntimeError`、`MemoryPluginRuntimeRepository`、`validateManifest` 等声明移出。`PluginRuntime` 664 行/30 方法分三组：安装与卸载（`install` 115、`uninstall*`）、版本切换（`upgrade`、`rollback`、`changeVersion` 117）、生命周期（`start*`、`stop*`、`recover*`、`reportCrash*`，各有 `…Once` 版本）。W3-06 要加 Home 级实例，类已冻结，它的新增部分先写在新文件里。 | 4 |
| `plugin-runtime` | `src/supervisor.ts` | `PluginSupervisor` 类 592 行 / 31 方法 | 拆 · W5-10 | `PluginSupervisor` 31 个方法分三组：启动与重启（`start` 56、`#restart` 39、`#activate` 37、`ensureStarted`）、升级回滚（`#changeVersion` 57、`upgrade`、`rollback`、`#resolveInstalledEntry` 51）、撤销与启用（`revoke` 30、`enable`）。W4-02 要在监督器里登记和收回 Manifest methods，类已冻结，它的新增部分先写在新文件里。 | 3 |
| `plugin-runtime` | `src/wiring.ts` | `PluginInputGraph` 类 497 行 / 26 方法 | 拆 · W5-10 | `PluginInputGraph` 26 个方法：解析（`#resolve` 134 行）抽成求值器；绑定与选择（`bind` 46、`bindArtifact`、`unbind`、`selectInputGroup`）、发布与失效（`publish`、`invalidate`、`retain`）、视图与状态（`status`、`view`、`reference`、`currentVersion`）各成协作者。 | 4 |
| `plugin-sandbox` | `src/runner.ts` | `createSandboxRunner` 函数 174 行 | 拆 · W5-10 | `createSandboxRunner` 39 条语句：消息接收 `receive`（42）、返回对象（42）、子进程启动（`try` 14）、看门狗（12）、关停（9）各成函数。 | 1 |
| `storage` | `src/adapters/search-storage.ts` | `createSearchOpaqueBlobStore` 函数 161 行 | 拆 · W5-10 | 只超 11 行。返回的对象 125 行，其中的 CAS 操作与 `trustedNowUnixMs`（8）移到模块级；`inImmediate` 已在模块级。 | 2 |
| `storage` | `src/adapters/text-search-index.ts` | `openTextSearchIndex` 函数 153 行 | 拆 · W5-10 | 只超 3 行。返回对象 90 行，其中 `if` 块 17 行抽成函数即可。 | 2 |
| `test-kit` | `src/boundaries.ts` | `evaluateImportBoundary` 函数 152 行 | 拆 · W1-05 | 只超 2 行。W1-05 要在导入边界里加规则（模块→横向/插件/应用，插件→应用/横向/模块，应用→应用白名单），任何增长门禁都不放行：同一个 PR 先把 `evaluateImportBoundary` 按规则种类拆开（它已有 18 条语句，`if` 块各 9–13 行），再加规则。 | 1 |

### 内置插件 `plugins/native/*`

46 个单元（拆 36、归线 9、例外 1），37 个文件、14 个包。路径前缀 `plugins/native/`。

| 包 | 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | --- | ---: |
| `alchemist` | `src/studio/server/bootstrap/local-runtime.ts` | `createLocalRuntime` 函数 243 行 | 拆 · W5-10 | `createLocalRuntime` 50 条语句：`dependencies`（34）、返回（31）、`handlers`（18）、`pulseSources`（12）、`calibrationMemory`（12）、`createResearchPlan`（11）、`runPending`（10）各成 `create…` 函数。 | 1 |
| `alchemist` | `src/studio/server/db/pulse-repository.ts` | `SqlitePulseRepository` 类 381 行 / 23 方法 | 拆 · W5-10 | 23 个方法按表分组：来源设置、运行、采集与信号（`saveSourceCollection`、`listSignals`）、报告与机会（`saveReport` 69、`persistOpportunity`、`convertOpportunity`）。每组一个仓库。 | 0 |
| `alchemist` | `src/studio/server/db/research-repository.ts` | `SqliteResearchRepository` 类 343 行 / 19 方法 | 拆 · W5-10 | 19 个方法按表分组：计划、运行、报告与证据（`saveReport` 85、`mapReport` 26、`linkClaimEvidence`）、MVP 范围（`ensureMvpScope` 35）。 | 0 |
| `characters` | `src/plugin.ts` | `createCharactersPlugin` 函数 161 行<br>`start` 函数 159 行 | 归线 · §4.6 · W5-01（Characters 一项，决定 #26 提到第 4 波） | 决定 #26：Characters 不再是 Runtime 插件，代码并进宿主或一个 Module，界面仍是设置里的一节，安装记录与 Runtime 条目一起删。这个插件定义函数随之消失，不用拆；第 4 波的承接切片取代 W5-01 里“Shelf 和 Characters 混合插件”一项中 Characters 的部分，片号待 W1-01 写进路线。`start` 内嵌在 `createCharactersPlugin` 里（同一段计两次）。 | 5 |
| `coding` | `src/client.ts` | 文件 1,656 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,631/1,656 行）。 | 8 |
| `coding` | `src/routes.ts` | 文件 1,556 行<br>`codingRouteBindings` 函数 1,348 行 | 拆 · W4-07 | `codingRouteBindings` 按资源拆（会话与轮次、变更集、写入者、Goal 上下文、时间线）。 | 10 |
| `coding` | `src/styles.ts` | 文件 851 行 | 例外 · 样式表 | `CODING_STYLES` 一个模板字符串，纯 CSS。 | 2 |
| `coding` | `src/timeline.ts` | `createCodingTimeline` 函数 263 行 | 拆 · W5-04 | 对话时间线：`toString()` 注入浏览器，必须自包含（263 行，`renderFooter` 65、`renderGroup` 27、`KIND` 26、`FAILURES` 21）。W5-04 打包 Coding 的浏览器代码时，各块成模块并拆到阈值以下。（对 W5-04 范围的解释同 `tab-workspace-ops.ts`。） | 1 |
| `coding` | `src/ui.ts` | `renderCodingWorkbench` 函数 214 行 | 拆 · W5-10 | `renderCodingWorkbench` 的返回里有一段 205 行的 HTML 模板。文件里已有 `renderCodingDirectory`、`renderCodingSettings`、`renderPendingQuestionCard`、`renderCodingIdentity` 这样的区块函数，工作台主体的其余区块照此各成函数。 | 2 |
| `cognia` | `src/store.ts` | `CogniaStore` 类 122 行 / 28 方法 | 拆 · W5-10 | 122 行、28 个方法，每个方法很短；类不属于例外的四种。按表分四个仓库：域（`createDomain`、`renameDomain`、`deleteDomain`）、来源（`sources`、`renameSource`、`deleteSource`）、材料（`materials`、`preview`、`commit`、`createMaterial`、`updateMaterial`）、草稿（`drafts`、`addDraft`、`archiveDraft`、`saveDraft`；草稿的视图与采纳规则已在 `drafts.ts`，这一组只需带走表访问）。 | 2 |
| `feed` | `src/application.ts` | `FeedApplication` 类 503 行 / 44 方法 | 拆 · W5-10 | `FeedApplication` 44 个方法分五组：来源（`upsertSource`、`retireSource`、`upsertSourceRun`、`recoverInterruptedSourceRuns`）、收件箱（`createInboxEntry`、`addToInbox`、`setInboxEntryStatus`）、摄入与判断（`ingestItem` 54、`ingestItemJudged`、`evaluateItems`、`flushPending*`、`captureAfterIngest`；待判断的排队与逐条判断已在 `judgment-queue.ts` 的 `JudgmentQueue`，类里的 `ingestItemJudged`、`flushPending*` 只是转发给它，拆摄入时照这个形状）、捕捉规则（`*OutRule*`）、外送失败（`recordArtifactOutFailure`、`completeArtifactOutFailure`）。路线 W5-01 把 Feed 迁 Runtime 列为“自有计划”（尚未写出）；这个类不论迁不迁都要拆，这五组正是迁移要用的边界，拆分不依赖那份计划。 | 7 |
| `form` | `src/client.ts` | 文件 930 行 | 归线 · §4.8 · W4-04 | Form 样板：浏览器代码改成类型检查的打包 TS（模板 928/930 行）。 | 7 |
| `goals` | `src/event-document-forms.ts` | `createEventDocumentForms` 函数 348 行 | 拆 · W5-10 | `createEventDocumentForms` 20 条语句，每种表单一个内嵌函数：决定（`renderDecisionForm` 43）、顾虑（32）、提议变更（32）、报告（25）、规划（20）、约定（19）。每种表单一个模块。 | 2 |
| `goals` | `src/goal-tree-decision.ts` | `decideGoalTreeProposal` 函数 272 行<br>`result callback 1` 函数 246 行 | 拆 · W5-10 | `decideGoalTreeProposal` 里 `result` 回调 246 行（同一段计两次），依次是：逐条决定（拒绝、修订、规划冲突、基线冲突）、按组落实（`goalTreeMaterializationGroups`）、图校验、修订提案、语义复核、记录决定并组结果；各成函数。 | 3 |
| `goals` | `src/goal-tree-submission.ts` | `submitGoalTreeProposal` 函数 162 行 | 拆 · W5-10 | 只超 12 行。`result` 回调 131 行，把条目的规范化与摘要摘出去。 | 5 |
| `goals` | `src/momentum-view.ts` | `buildGoalMomentumView` 函数 245 行 | 拆 · W5-10 | `buildGoalMomentumView` 44 条语句：依赖边（`dependencyEdges` 13）、分组（`groupRootFor` 14、`downstreamFor` 15）、节点（`nodes` 28）、动作（`actions` 30）四步，各成函数。 | 2 |
| `goals` | `src/proposal-normalizer.ts` | `GoalTreeProposalNormalizer` 类 453 行 / 13 方法 | 拆 · W5-10 | 13 个方法但 453 行：`normalizeGoalTreeProposalItems` 101、`goalCreatePayload` 72、`parseGoalTreeWriteItem` 57、`normalizeGoalTreeProposalNarrative` 51。按条目种类拆成目标创建、关系创建与停用、叙述与解释三个规范化器。 | 2 |
| `goals` | `src/proposal-ui.ts` | `createProposalRenderer` 函数 187 行 | 拆 · W5-10 | `renderGoalTreeProposalDecision` 一个内嵌函数 126 行，按区块拆；`goalTreeRelationScenario`、`renderGoalTreeProposalScenario` 已独立。 | 1 |
| `goals` | `src/tree-ui.ts` | `createTreeRenderer` 函数 236 行 | 拆 · W5-10 | `createTreeRenderer` 里 `renderGoalTree`（70）、`renderTreeDependencies`（42）、`renderCollectionFold`（27）、`renderTreeStatusFilter`（17）各成模块。 | 1 |
| `pages` | `src/client.ts` | 文件 1,153 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,149/1,153 行）。 | 12 |
| `pages` | `src/commands.ts` | 文件 2,241 行 | 拆 · W5-10 | 编辑命令文件：114 个顶层函数声明（94 个导出）。按命令族拆成几个文件（块转换与 Markdown：`markdownBlock` 59、`turnSpanInto` 48；列表：`listItemSpan`、`outdentFromContainer`；折叠与分栏：`collapseSelectedBlock`、`collapseEmptyColumn`、`enterInToggle`；代码行：`leaveEmptyCodeLine` 等），每个文件不超过 800 行。 | 0 |
| `pages` | `src/editor-browser.ts` | 文件 4,043 行<br>`mount` 函数 1,024 行<br>`hoverHandlePlugin` 函数 798 行<br>`view` 函数 676 行<br>`renderMenu` 函数 173 行<br>`findPlugin` 函数 169 行<br>`slashPlugin` 函数 160 行 | 拆 · W5-10 | 路线点名 `mount`（1,024 行：`new EditorView` 一段 215、`plugins` 数组 183、`openAi` 78、`runAiCommand` 56、`openCalloutStyle` 55）和 `hoverHandlePlugin`（798 行，其中 `view` 676 行，`view` 里的 `renderMenu` 173 行；三者重叠计数，一并处理）。两者移走后文件仍约 2,200 行，其余的编辑器插件（`findPlugin` 169、`slashPlugin` 160、`mentionPlugin`、`chromePlugin`）与节点视图（`imageNodeView`、`codeNodeView`、`bookmarkNodeView`）各成文件。 | 5 |
| `pages` | `src/store.ts` | `PagesStore` 类 376 行 / 28 方法 | 拆 · W5-10 | `PagesStore` 28 个方法分五组：页面（`create`、`importDocuments`、`update`、`relocate`、`duplicate`、`delete`）、发布（`beginPublication`、`completePublication`）、生成（`beginGeneration`、`completeGeneration`、`failGeneration`、`saveGeneration`）、变更审阅（`keepChange`、`revertChange`、`discard`）、文件夹。 | 6 |
| `pages` | `src/styles.ts` | 文件 812 行 | 拆 · W5-10 | 只超 12 行，不登记例外：开头 12 行用 `PAGES_TONES` 生成色调规则（`CALLOUT_TONE_RULES`、`TONE_RULES`），它们的主人是 `tone.ts`；移过去文件正好回到 800 行。此后再往里加样式就要按界面分文件；登记不放行新增或变大，另一条路只有单独开 PR 改门禁本身。 | 5 |
| `plugin-builder` | `src/agent-authoring.ts` | `expandDesign` 函数 225 行 | 拆 · W5-10 | `expandDesign` 45 条语句，8 个 `for…of` 块各 11–17 行逐类规范化设计稿条目；每个循环一个规范化函数。 | 3 |
| `plugin-builder` | `src/agent-workflow.ts` | `AgentBuilderWorkflow` 类 654 行 / 40 方法 | 拆 · W5-10 | `AgentBuilderWorkflow` 40 个方法：设计与样稿（`designer`、`propose`、`drawMockups`、`acceptDesign`、`pickCapabilities`、`revise`）、实现与验收（`implement`、`implementOne`、`codeAttempt`、`acceptance`、`repairAcceptance`）、审阅（`reviewPresentation`、`reviseVisual`）、生命周期（`create`、`launch`、`pause`、`close`）。创作台属构建期例外清单，不迁 Runtime，就地拆。 | 5 |
| `ppt` | `src/client.ts` | 文件 806 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（804/806 行）。 | 6 |
| `shelf` | `src/client.ts` | 文件 1,708 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,704/1,708 行）。 | 4 |
| `todo` | `src/client.ts` | 文件 1,245 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,240/1,245 行）；Todo 是第二个迁 Runtime 的样板。 | 3 |
| `todo` | `src/store.ts` | `TodoStore` 类 381 行 / 28 方法 | 拆 · W5-10 | `TodoStore` 28 个方法分三组：读（`list`、`get`、`backlinks`、`history`、`dueReminders`）、写（`create` 48、`update`、`move`、`setStatus`、`setArchived`、`delete`、`batch`、`revert` 38）、链接与来源（`link` 30、`addSource`、`normalizeLink`）。 | 4 |
| `work` | `src/actions.ts` | `createWorkActionHandlers` 函数 169 行 | 拆 · W5-10 | 只超 19 行。`createWorkActionHandlers` 返回的处理器表 143 行，每个动作一个处理函数；`workActions` 声明（57 行）不动。 | 2 |
| `work` | `src/http/panels.ts` | `handleWorkPanelHttp` 函数 163 行 | 拆 · W5-10 | `handleWorkPanelHttp` 的 `try` 块 153 行，按 `panelsMatch`、`promptMatch`、`panelMatch`、`exitedMatch`、`reopenMatch` 等路由分支，每个路由一个处理函数。 | 3 |
| `work` | `src/terminal/client.ts` | `startWorkTerminalClient` 函数 438 行 | 拆 · W5-04 | 浏览器里跑的终端客户端，整个函数在一个 `if` 里（430 行）。W5-04 把 Work 的浏览器代码打包成类型检查的模块时拆开。（对 W5-04 范围的解释同 `tab-workspace-ops.ts`。） | 1 |
| `work` | `src/terminal/panels.ts` | `createTerminalPanels` 函数 365 行 | 拆 · W5-10 | `createTerminalPanels` 里 `spawnPanel`（87）、`handlePtyMessage`（48）、`openPanel`（35）、`loadPanels`（33）、`reconnectLivePanels`（27）、`reopenPanel`（19）各成模块。 | 1 |
| `work` | `src/ui/render.ts` | `renderWorkSessionSurface` 函数 350 行 | 拆 · W5-10 | `renderWorkSessionSurface` 里 `renderSessionDetail`（85）、`renderOverlays`（81）、`renderSessionRow`（29）、`groupSessionRecords`（19）、`renderRuntimeFold`（15）各成模块。 | 0 |
| `workflows` | `src/actions.ts` | `createWorkflowsActionHandlers` 函数 268 行 | 拆 · W5-10 | `createWorkflowsActionHandlers` 里 `prepareHandoff`（44）、`runActionStep`（28）、`readStep`（15）、`judge`（12）、`reachFor`、`resolveAction`（各 10）和 100 行的返回表；按步骤种类各成函数。 | 6 |
| `workflows` | `src/client.ts` | 文件 1,387 行 | 归线 · §4.8 · W5-04 | 浏览器脚本模板（1,378/1,387 行）。 | 3 |

### 官方连接器 `plugins/official-integrations/*`

6 个单元（拆 5、例外 1），5 个文件、2 个包。路径前缀 `plugins/official-integrations/`。

| 包 | 文件 | 单元 | 判定 | 计划或理由 | PR |
| --- | --- | --- | --- | --- | ---: |
| `catalog` | `src/catalog.ts` | 文件 1,015 行 | 例外 · 静态数据 | 39 个连接器的声明表，条目互相独立（`CATALOG` 834 行），所以不为拆而拆。但文件冻结在现有行数，不能直接往里加：新增连接器要先把已有条目挪进各自的文件、腾出行数，再加新的。 | 1 |
| `gmail` | `src/oauth-pending.ts` | `createGmailPendingSessions` 函数 178 行 | 拆 · W5-10 | `createGmailPendingSessions` 把 `validatePendingGmailOAuthSession`（72）、`prunePendingIndex`（35）、`parsePending`（17）等做成内嵌函数；提到模块级，依赖显式传入。 | 1 |
| `gmail` | `src/oauth-token-lifecycle.ts` | `createGmailTokenLifecycle` 函数 170 行 | 拆 · W5-10 | 只超 20 行。`resolveUsableGmailAccessToken` 98 行等内嵌函数提到模块级。 | 1 |
| `gmail` | `src/oauth.ts` | `createGmailOAuth` 函数 177 行 | 拆 · W5-10 | 只超 27 行。`completeGmailOAuthFlow`（92）、`startGmailOAuthFlow`（65）两个内嵌函数提到模块级。 | 1 |
| `gmail` | `src/provider.ts` | 文件 957 行<br>`createGmailProvider` 函数 198 行 | 拆 · W5-10 | 文件 957 行：同步（`runFullSync` 61、`runIncremental` 120、`fetchBoundedDetails` 65、`fetchMessagesList`）、消息映射（`mapMessageDetailToItem` 53、`classifyGmailPath`）、夹具数据 `FIXTURE_MAIL` 分三个文件；`createGmailProvider` 198 行返回的 141 行对象里各操作抽成函数。 | 2 |

## 4. 维护

- 拆完一个单元：改这里对应的行（删行或改数字），在同一个 PR 里跑 `node scripts/check-health-gates.mjs --update --base origin/main` 更新本地快查；它如果有例外条目，同时删掉条目。
- 新写的东西超限：在功能 PR 里只有一条路，拆到每一块都在阈值以下（样式表按界面分文件，静态数据按条目分组分文件，别的按职责拆）。登记不是路：新增的超限单元，不管有没有登记，门禁都按新增失败，必然很长的也一样。真拆不开的，只能另起一个改门禁本身的 PR（脚本、`limits.json`、CI 步骤），那要过评审、先问用户。`tooling/gates/giant-exceptions.json` 只给**已经**超限的单元记理由（文案表、样式表、静态数据或生成代码），并在这里有一行；不要把“懒得拆”写成理由，理由里写的事实要能在代码里查到。
- 给已冻结的单元加功能：先把要加的部分抽到新文件，再接上去；门禁不会放行它变大。清单里点名的各片（W1-05、W3-01、W3-05、W3-06、W3-07、W4-02、W5-02）会碰到的类，也这样处理。
- 路线收尾（W6-04）重量这些数字，和 2026-10-02 开工时对比：当时 37 个超过 800 行的文件、43 个超过 300 行的类、25 个方法数超过 25 的类、99 个超过 150 行的函数（`specs/repository-anti-corruption/spec.md` §2.3）。
