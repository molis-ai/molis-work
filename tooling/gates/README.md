# 门禁数据（tooling/gates）

状态：现行；门禁脚本是 `scripts/check-health-gates.mjs`（入口）、`scripts/gates/`（各门禁的实现），规格在 [specs/repository-anti-corruption](../../specs/repository-anti-corruption/spec.md) §5a。

`pnpm health:check` 与 CI 的「Health gates」步骤读这里的文件。比较的规则、`--base`、`--update`、`--report` 的用法见 `AGENTS.md`「构建与测试」和 `scripts/check-health-gates.mjs` 开头的注释，这里只说有哪些文件，以及两类门禁的口径。

| 路径 | 是什么 | 谁改 |
| --- | --- | --- |
| `baseline.json` | 各项数字的本地快查基线；CI 不读它，只对照 merge-base 比 | `node scripts/check-health-gates.mjs --update --base origin/main`（数字变小时） |
| `limits.json` | 巨大单元与 vendored SDK 的阈值，只许收紧 | 人，过评审 |
| `api/<包>/<subpath>.txt` | contracts 每个 subpath、插件 SDK 的公开 API 快照 | `pnpm api:update`（见下） |
| `actions/*.tsv` | 内置 Manifest 声明的动作与消费场景、宿主另外登记的动作的合同快照（提供方、宿主登记用的提供方 id、谁能调、输入输出 schema 的哈希） | `pnpm actions:update`（见「动作合同快照」） |
| `secret-allowlist.txt` | 密钥扫描的已知测试值 | 人，过评审 |

## 按文件计数、只许减少的项

每一项是 `{ 文件: 个数 }`；没有记录的文件从 0 开始，所以新文件不许带。CI 用同一份脚本量当前树和 merge-base 再比，改 `baseline.json` 放不过变大的。文件改名后记录跟着走。

| 项（baseline.json 的键） | 口径 |
| --- | --- |
| `emptyCatches` | TypeScript 代码里的空 `catch`：块里既没有语句也没有注释，如 `catch {}`、`catch (error) { }`。块里写了注释的不算（那是写明了的取舍），有任何语句的也不算。不算 promise 的 `.catch(() => {})`（那是回调，不是 catch 子句）和 `finally`。在语法树里找，所以注释、字符串里的字样不算 |
| `emptyCatchesInScripts` | 同一个形状（`catch`、可选的 `( … )`、`{`、只有空白、`}`），在**源码**文件的**字符串和模板字符串**文本里找（测试里的字符串是夹具，不数）。宿主把浏览器程序（工作台、插件的 client 脚本）写成模板字符串，TypeScript 和 lint 都不看里面，普查找到的 141 处空 catch 里有 137 处在这里。**这类算在内**，单独一个计数：把脚本从模板字符串搬进真正的 TypeScript 时，数字从这一项挪到上一项 |
| `unknownCasts` | 经 `unknown` 的双重断言：`value as unknown as T`、`(value as unknown) as T`、`<T><unknown>value`。单独的 `as unknown` 和 `as any as T` 不算。**含测试**（规格 §9.3 的 R-12 口径是含测试的） |
| `oldNames` | 只数源码，不数测试。旧产品名：单个词 `goalboard`，不分大小写（`GoalBoard`、`goalboard-v1-demo`、`GOALBOARD_HOME`）。旧 id 名：`board_id`、`boardId`、`BoardId`、`BOARD_ID`，含复数，可以是整个名字或长名字的结尾（`conflicting_board_id`、`existingBoardId`），不数别的词里的（`dashboard_id`、`dashboardId`、`DASHBOARD_ID`）。只数这两种写法：`goal-board`（连字符，目标看板视图的样式类和 CSS 容器名）不是旧名，不数；`GOAL_BOARDS_SCHEMA_SQL`（每个项目 `boards` 表的建表语句）也不数，但不是因为它是看板视图，而是它属于另一类「Board 当项目」的旧名（`getBoard`、`initializeBoard` 等，见 `docs/system/GLOSSARY.md` R-A1，改名在路线图 W5-14），这条规则看不到也不守它们。测试不数，因为测试要写出旧名来断言它被拒绝。**看不到的（已知限制，换回来不会被抓）**：连字符写法 `board-id`（#287 之前的 CLI 参数 `--board-id`），以及不在上述源码范围里的文件，如 `examples/draft-goal.json`、`examples/leaf-goal.json`（仍带 `"board_id"`，随根 `package.json` 的 `files` 发布）；要覆盖得按文件类型各写一条规则，不是改正则能做到的。基线里现在保留的例外：派生密钥的盐 `goalboard-feed-secretstore-v1`（`packages/storage/src/adapters/file-secret-store.ts`，那里的注释写明改了字符串会让已有密文失效）、`apps/local-host/src/project-capabilities.ts` 里的局部函数 `checkGoalBoard`、`plugins/native/goals/src` 里两处没用到的 `_boardId`（`document-collection.ts` 的解构改名、`goal-tree-materialization-order.ts` 的参数）。它们和别的计数一样，只能减少 |
| `compatMarkers`、`testImports`、`giant` | 见 `AGENTS.md` 与 `scripts/check-health-gates.mjs` |

扫描范围：`apps`、`horizontal`、`modules`、`packages`、`plugins`、`server`、`tooling` 下的 TypeScript 源码（不含测试、夹具、`dist`、`.d.ts`），加上 `tests/` 下任意深度的全部 `.ts`、`.mts`、`.mjs` 文件（含 `tests/fixtures/` 和各种测试辅助文件，与「测试引用包内部」用同一个判断 `isTestFile`）；`emptyCatchesInScripts` 与 `oldNames` 只数源码。定义的原文在 `scripts/gates/source-counts.mjs` 开头，那里是唯一的出处。

加一项新的按文件计数：在 `scripts/gates/source-counts.mjs` 的 `SOURCE_COUNT_RULES` 里加一条（口径写在文件开头），在 `tests/health-gates-source-counts.test.ts` 里加定义用例和突变用例，然后 `node scripts/check-health-gates.mjs --update --base origin/main`。静态检查工具（W1-09）接进来后，TypeScript 代码这部分由它接管，`emptyCatchesInScripts` 留到浏览器脚本都打成包为止。

## 公开 API 快照

`api/` 下每个 contracts 的 subpath（`packages/contracts/package.json` 的 `exports`）和插件 SDK 各一个文件，如 `api/contracts/platform/plugin.txt`、`api/plugin-sdk/index.txt`。

- 内容：用编译器对包自己的源码做声明输出（不需要先构建，`paths` 把包名指到 `src/`，旧的 `dist/` 不会被读到），**去掉注释**。每个导出名一段，按名字排序：函数签名、接口的每个字段、常量的类型或字面值都在里面。改注释或函数体不改变快照。
- 一个名字有几条声明就写几段，一条不漏：函数的每个重载（按源码里的先后写，因为重载的顺序决定调用落到哪一个）、同名的类型和常量（`export const X = [...] as const; export type X = …`）、同一个声明以两个名字导出（别名那一段末尾注明 `exported from this entry as`）。重载的实现签名不是 API，不记。
- 辅助声明：导出的声明提到、但没有任何 subpath 导出的名字，列在导出后面（`// Declarations the exports above refer to, which no entry exports itself:`），并顺着它们再提到的名字一直找下去。找的范围是声明所在文件能看见的：本文件的声明（导出的和没导出的）、本文件按名字 `import` 的别的文件的声明、编译器写出的 `import("./x.js").Name`。例：`GoalWorkEventBase` 在没有任何 subpath 导出的文件里，被三个导出的记录类型 `extends`，它加一个必填字段就是合同变了，所以列在 `contracts/modules/goals.txt` 里。某个 subpath 已经导出的名字不重复，它在那个 subpath 的快照里。
- 不记哪个文件声明了它，所以把代码在包内搬来搬去（W5-09 的纯搬动）不会改快照，辅助声明在文件里加不加 `export` 也不改；编译器写出的 `import("./actions.js").X` 记成 subpath 名。一个例外（误报，不是漏报）：被编译器这样引用、却不是任何 subpath 的源文件时，快照只能写相对包 `src/` 的路径，搬动那个文件会让快照变，跑一次 `pnpm api:update` 就清掉（diff 里只有路径）。现在入库的 33 处 `import(...)` 引用全部指向 subpath 名，没有这种情况。
- 插件 SDK 从 contracts 再导出的名字只写一行，指向承载声明的 contracts subpath（`export type { X } from "…/platform/plugin";`），所以合同变一次只在一处出现。
- 没覆盖：通过命名空间导入（`import * as ns`）到达的名字，以及这两个包以外的声明（zod、node 类型）。`tests/health-gates-api-snapshot.test.ts` 里有一条独立的核对：快照里出现的、包源码顶层声明过的大写名字，必须在某个快照里有声明。
- 校验：源码生成的内容和入库的文件有任何不同，`pnpm health:check` 就失败（新增、删除、改签名、新 subpath 没快照、已删 subpath 的快照还在、快照被手改）。`--base` 时还会在日志里列出相对 merge-base 的 API 变化，供评审读。
- 有意改 API：先改代码，再 `pnpm api:update`（即 `node scripts/gates/api-snapshot.mjs --update`），把 `tooling/gates/api/` 的变化提交，并在 PR 里写这个变化对插件和调用方意味着什么。`--update`（数字基线）不会改快照。
- 只查不写：`node scripts/gates/api-snapshot.mjs`。
- 目前只覆盖 contracts 与插件 SDK。插件还依赖 design-system 与 storage；要加就在 `scripts/gates/api-snapshot.mjs` 的 `API_PACKAGES` 里加一行。

## 动作合同快照

内置插件的动作是别人固定引用的合同：工作流程步骤、判断绑定、MCP 工具名都写成 `capability_id@version` 加提供方（`docs/system/CONTRACT-CHANGES.md` 第 1 节）。同一个 `capability_id@version` 下输入输出变了，固定了它的引用就遇到另一份合同，而没有任何提示。`actions/` 下三个 TSV 把这些合同写下来，让这种变化在 PR 的 diff 里露面。实现是 `scripts/gates/action-contract-snapshot.mjs`（行、比较、文字）和 `scripts/gates/action-contract-host.mjs`（读内置 Manifest、在临时 Home 里启动宿主）；核对跑在 `pnpm test:contracts` 的 `tests/action-contract-snapshot.test.ts`（CI「Action and plugin contracts」步骤），不在 `pnpm health:check` 里，因为它要读已构建的包和一个宿主，而健康门禁不构建。

| 文件 | 内容 |
| --- | --- |
| `actions/actions.tsv` | 内置 Manifest（工作台的 `BUILTIN_PLUGIN_CATALOG`）声明的每个动作，一行一个 `capability_id@version`。`provider` 列是 Manifest 的 `plugin_id`；`registered_provider` 列是宿主登记这个动作用的提供方 id（从宿主的动作目录读出） |
| `actions/scenes.tsv` | 它们声明的消费场景（`action_scenes`），一行一个 `scene_id@version`，同样有 `provider` 与 `registered_provider` 两列 |
| `actions/host-actions.tsv` | 所有内置插件在一个项目里启用时，宿主登记着、却没有任何内置 Manifest 声明的动作：`system.*` 提供方、每个 Runtime 插件的 SDK 服务、写在代码里而不在自己 Manifest 里的插件动作（Shelf 的 27 个、Experiments 的 15 个）和由场景派生的开关动作（Feed、Inbox 各 3 个 `scenes.*`）。一行一个 `capability_id@version via 提供方`；提供方列是宿主登记用的 id |

**一行写什么。** 可读列：`capability_id`、`version`、`provider`、`registered_provider`（只在 `actions.tsv` 与 `scenes.tsv`）、`operation`、`kind`、`scope`、`effect`（声明的，或像 `actionEffect` 那样从 id 推断：删除类 id 不可撤销）、`scheduling`、`audiences`、`permissions`、`subjects`（主体种类）都排了序，顺序不是合同；`input_type`、`output_type` 是工作流程按它匹配的语义类型。哈希列（sha256 前 12 位）：`input`、`output` 是 JSON Schema 的规范形（键排序、数组顺序保留）的哈希，**先去掉 `title`、`description`、`$comment`、`examples` 这些注解**，因为改一个标签或一句帮助不是改形状；`const`、`default`、`enum` 下面的值是数据，原样算进去，名叫 `title` 的属性是属性不是注解。`traits` 是动作声明里其余的结构化部分（依赖的动作、撤销、后台任务、搜索与文件来源、执行策略、署名、工作流内容，以及以后加进动作元数据的任何新字段）去掉文字与呈现（`title`、`description`、`result_view`、受理选项的 `title` 与 `hint`）后的哈希。`-` 表示没有。

**失败信息怎么读。** 源码生成的内容和入库的文件有任何不同就失败（新增、删除、改任何一格、行被手改或重排、文件缺了），并把变化分开列：

| 列出的 | 意思 | 该怎么办 |
| --- | --- | --- |
| 同一版本下形状变了 | `capability_id@version` 不变，而 `input`、`output`、`traits`、`subjects`、`input_type`、`output_type` 里有一格变了 | 升版本，或在 PR 里写明为什么没有固定它的引用会坏（合同变更流程第 3 节第 3 条）。评审拦这一类 |
| 谁能调、怎么调变了 | 权限、受众、`kind`、`scope`、`effect`、`scheduling`、`operation`、`provider`（Manifest 的 `plugin_id`）变了，形状没变 | 写进 PR 的合同影响 |
| 登记用的提供方变了 | `registered_provider` 变了，无论别的列变没变：改名、从原生装配迁到 Runtime 装配（或反过来）、换了发布签名，都会让这个插件每个动作的这一格变，逐个列出 | 已固定的引用（工作流程步骤存的 `provider_id`、`allowed_actions`、Feed 与 Inbox 场景的引用）带着旧 id，内核比对不上就抛 `actions.provider_changed`，旧引用不会自动换成新提供方。同一个 PR 里列出这些引用并迁完，或写明为什么没有 |
| 换了新版本 | 同一提供方的 id 少了 `@旧` 多了 `@新` | 旧版本的固定引用不再能解析：列出消费者 |
| 新增、删除 | 一个动作多了或少了 | 删除同样会让固定它的引用失效 |

**两层要一致。** 核对还要求：Manifest 声明的每个动作，宿主都登记着（在某个提供方下）；它的插件登记它时，用的就是 Manifest 里那份声明（不是另一份）；同一个 `capability_id@version` 在同一提供方下，各受众和各范围看到的声明相同。Goals 的 `goals.planning.personal.*` 是现在唯一的例外：Manifest 声明了它们，宿主却登记在 Home 级提供方 `io.molis.work.goals.home` 下（`host-actions.tsv` 里有这两行，`actions.tsv` 里也有），这是登记位置与 Manifest 不一致的现状，快照把两边都固定下来。Runtime 装配的插件，宿主登记用的提供方是 `plugin-install-<sha256(plugin_id, publisher.signature) 前 32 位>`，已固定的引用里写的就是它，所以 `actions.tsv` 把它写在 `registered_provider` 列（`provider` 列仍是 `plugin_id`，Manifest 与宿主靠 `provider.plugin_id` 对上）。换了 `publisher.signature`，或把原生插件迁到 Runtime 装配，会改变这个 id：`actions.tsv` 里这个插件每个动作的 `registered_provider` 变化，逐个列在「登记用的提供方变了」下，`host-actions.tsv` 里各 `sdk.artifacts.plugin-install-…` 行跟着变。同一个动作在不同受众、范围下被登记在两个提供方 id 下，核对直接失败（引用只写一个）。`goals.planning.personal.*` 的 `registered_provider` 是 `io.molis.work.goals.home`，因为插件自己没登记它们，只有 Home 级提供方登记了。消费场景一样：宿主登记它的提供方 id 记在 `scenes.tsv`。

**有意改。** 先 `pnpm build`，再 `pnpm actions:update`（即 `node scripts/gates/action-contract-snapshot.mjs --update`；约 10 秒，宿主跑在临时 Home 里），提交 `tooling/gates/actions/` 的变化，并把命令打印出来的那几组变化写进 PR「公开合同与 API 影响」一栏。只查不写：`node scripts/gates/action-contract-snapshot.mjs`。`pnpm health:check` 的 `--update` 与基线不碰这三个文件。

**宿主那一半从不碰真实 Home。** `withIsolatedHome` 在运行期间把 `HOME`、`MOLIS_WORK_HOME` 指向新建的临时目录、`MOLIS_WORK_SECRET_BACKEND` 设成 `file`、清空 `MOLIS_WORK_ENCRYPTION_KEY`；`collectHost` 第一步调 `assertThrowawayHome`，找不到恰好这个环境就拒绝启动：Home 在（解开符号链接后的）临时目录里、`MOLIS_WORK_HOME` 与 `HOME` 解开后都指向它、后端是 `file`、没有加密密钥，缺哪一项都拒绝（后端没设时，非测试环境的 macOS 会选全机共用的钥匙串）。`tests/action-contract-snapshot.test.ts` 逐项试过：另一个存在的临时目录、变量没设、后端 `env`/`keychain`/没设、设了密钥、临时目录之外、指向临时目录之外的符号链接。在别处直接启动一个宿主列目录，没有设 `MOLIS_WORK_HOME` 时有的代码路径会解析到默认的 `~/.molis-work`（`resolveMolisWorkHome`），所以要列动作目录就走这两个函数，或者用 `scripts/run-tests.mjs`。

**看不到的。**
- 函数体与行为，以及动作的 `title`、`description`、`result_view` 的文字。
- 每类受众此刻能不能在目录里看到它：那取决于授权、生命周期和连接，是宿主动态给出的；快照只记声明的 `audiences`。步骤一的快照记过这个矩阵。
- MCP 默认工具（`apps/mcp` 的 `MCP_TOOLS`、`RUNTIME_MCP_TOOLS`，步骤一记了 12 个）的名字与参数；运行时才有的动作（用户发布的判断函数，即 `functions.published.*` 里除下面三个以外的；外部 MCP 与服务连接的工具、创作台生成的插件、有配置的 Coding 外部 MCP）：空 Home 里没有它们。系统自己发布的三个判断函数（`functions.published.system_admit_inbox`、`system_pick_home_dock`、`system_pick_inbox_next`）空 Home 里就有，已在 `host-actions.tsv` 里。宿主登记、却没有任何 Manifest 声明的消费场景（目前没有）也不在快照里：`scenes.tsv` 只记 Manifest 声明的场景。
- `traits` 只去掉已知的文字类字段（受理选项的 `title`、`hint`）：以后在别处加的说明性字段会让哈希变，刷新即可。这是多报，不会漏报。

**首次入库（2026-10-09，main `11878059`）与步骤一快照的对账。** 步骤一的 `specs/archive/post-merge-review/capability-snapshot.tsv` 有 663 个动作（main `62cbc14d`，空 Home 加演示项目）。现在 Manifest 层 544 个动作与 2 个场景（26 份内置 Manifest 里 24 份有动作；plugin-builder 与 experiments 的 Manifest 没有动作声明），宿主层 156 行，按 `capability_id@version` 去重后共 698 个。对账（动作 id 为键）：

- 663 个里 646 个现在仍登记着，`kind` 一个没变；4 个的调度改成了 `concurrent`（`coding.runs.start`、`feed.content.receive`、`feed.items.inbox`、`inbox.content.receive`）。
- 646 个里 62 个提供方列不同，都是表示不同，不是变化：60 个是 Runtime 装配的 7 个插件（Characters 17、Coding 18、Git 10、Files 6、Shelf 5、Diff 2、Text Stats 2），步骤一写的是宿主登记用的 `plugin-install-…`，用 `sha256(plugin_id, publisher.signature)` 算出来逐个相同，本快照的 `provider` 列写 `plugin_id`，宿主登记用的 id 在 `registered_provider` 列；2 个是上面说的 `goals.planning.personal.*`。`actions.tsv` 里和步骤一重合的 502 个动作，`registered_provider` 与步骤一的提供方列逐个相同。
- 17 个已经不在：`alchemist.legacy.*` 3 个（6a6116d2，2026-10-02 删炼金术士历史演示记录）、`goals.board.import-v3`（c1d0b64a，2026-10-04，BL-083）、`jelly.inspiration.*`、`jelly.material.*`、`jelly.source.read` 共 13 个（faa85449，2026-10-01，Jelly 去掉灵感页，读取链接和文件改由灵光做）。
- 52 个是新的：42 个 Manifest 声明的（成果库的预览、固定、比较、从这一版继续，Goals 的交付物与成果输入，Jelly 的内容来源动作，灵光的 `lingguang.material.read` 与 `lingguang.source.read`，Pages 的引用方，Todo 的项目搜索），3 个 `platform` 提供方的工作目录读取动作，7 个每个 Runtime 插件一份的 `sdk.artifacts.…record`。
- 步骤一记的 12 个 MCP 默认工具这次没有对账（见上，不在快照里）。
