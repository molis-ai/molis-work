# 门禁数据（tooling/gates）

状态：现行；门禁脚本是 `scripts/check-health-gates.mjs`（入口）、`scripts/gates/`（各门禁的实现），规格在 [specs/repository-anti-corruption](../../specs/repository-anti-corruption/spec.md) §5a。

`pnpm health:check` 与 CI 的「Health gates」步骤读这里的文件。比较的规则、`--base`、`--update`、`--report` 的用法见 `AGENTS.md`「构建与测试」和 `scripts/check-health-gates.mjs` 开头的注释，这里只说有哪些文件，以及两类门禁的口径。

| 路径 | 是什么 | 谁改 |
| --- | --- | --- |
| `baseline.json` | 各项数字的本地快查基线；CI 不读它，只对照 merge-base 比 | `node scripts/check-health-gates.mjs --update --base origin/main`（数字变小时） |
| `limits.json` | 巨大单元与 vendored SDK 的阈值，只许收紧 | 人，过评审 |
| `api/<包>/<subpath>.txt` | contracts 每个 subpath、插件 SDK 的公开 API 快照 | `pnpm api:update`（见下） |
| `actions/*.tsv` | 内置 Manifest 声明的动作与消费场景、宿主另外登记的动作与消费场景的合同快照（提供方、宿主登记用的提供方 id、谁能调、输入输出 schema 的哈希） | `pnpm actions:update`（见「动作合同快照」） |
| `secret-allowlist.txt` | 密钥扫描的已知测试值 | 人，过评审 |
| `table-owners.json` | `shared`：几个包有意共用的表（今天是 `events`、`idempotency_records`）的 owner、用到它的包、理由；`same_name`：两个包各建一张的同名表（今天是 `workspaces`、`jobs`，不同库）的包与理由；其余的表只许 owner 包读写（`scripts/gates/table-owners.mjs`，说明在 `scripts/gates/README.md`） | 人，过评审；门禁两头核对，登记的包不再用就要删 |

## 按文件计数、只许减少的项

每一项是 `{ 文件: 个数 }`；没有记录的文件从 0 开始，所以新文件不许带。CI 用同一份脚本量当前树和 merge-base 再比，改 `baseline.json` 放不过变大的。文件改名后记录跟着走。

| 项（baseline.json 的键） | 口径 |
| --- | --- |
| `emptyCatches` | TypeScript 代码里的空 `catch`：块里既没有语句也没有注释，如 `catch {}`、`catch (error) { }`。块里写了注释的不算（那是写明了的取舍），有任何语句的也不算。不算 promise 的 `.catch(() => {})`（那是回调，不是 catch 子句）和 `finally`。**由静态检查数**（Biome 插件 `tooling/gates/lint/no-empty-catch.grit`，见下面「静态检查」），键和逐文件数字与 W1-04 的语法树计数一致 |
| `emptyCatchesInScripts` | 同一个形状（`catch`、可选的 `( … )`、`{`、只有空白、`}`），在**源码**文件的**字符串和模板字符串**文本里找（测试里的字符串是夹具，不数）。宿主把浏览器程序（工作台、插件的 client 脚本）写成模板字符串，TypeScript 和 lint 都不看里面，普查找到的 141 处空 catch 里有 137 处在这里。**这类算在内**，单独一个计数：把脚本从模板字符串搬进真正的 TypeScript 时，数字从这一项挪到上一项 |
| `unknownCasts` | 经 `unknown` 的双重断言：`value as unknown as T`、`(value as unknown) as T`、`<T><unknown>value`。单独的 `as unknown` 和 `as any as T` 不算。**含测试**（规格 §9.3 的 R-12 口径是含测试的）。**由静态检查数**（`tooling/gates/lint/no-double-cast.grit`），口径是 W1-04 的超集（见「静态检查」表里的混合写法），原有文件的逐文件数字相同；扫描范围比 W1-04 的语法树计数多了 `scripts/`（见「静态检查」的扫描范围），所以总数从 199 变成 202（`scripts/contextual-slice/client.ts` 2 处、`scripts/preview-contextual-interaction.mts` 1 处），其余文件的数字没变 |
| `oldNames` | 只数源码，不数测试。旧产品名：单个词 `goalboard`，不分大小写（`GoalBoard`、`goalboard-v1-demo`、`GOALBOARD_HOME`）。旧 id 名：`board_id`、`boardId`、`BoardId`、`BOARD_ID`，含复数，可以是整个名字或长名字的结尾（`conflicting_board_id`、`existingBoardId`），不数别的词里的（`dashboard_id`、`dashboardId`、`DASHBOARD_ID`）。只数这两种写法：`goal-board`（连字符，目标看板视图的样式类和 CSS 容器名）不是旧名，不数；`GOAL_BOARDS_SCHEMA_SQL`（每个项目 `boards` 表的建表语句）也不数，但不是因为它是看板视图，而是它属于另一类「Board 当项目」的旧名（`getBoard`、`initializeBoard` 等，见 `docs/system/GLOSSARY.md` R-A1，改名在路线图 W5-14），这条规则看不到也不守它们。测试不数，因为测试要写出旧名来断言它被拒绝。**看不到的（已知限制，换回来不会被抓）**：连字符写法 `board-id`（#287 之前的 CLI 参数 `--board-id`），以及不在上述源码范围里的文件（JSON 示例、shell、Rust）；要覆盖得按文件类型各写一条规则，不是改正则能做到的。基线里现在保留的例外：派生密钥的盐 `goalboard-feed-secretstore-v1`（`packages/storage/src/adapters/file-secret-store.ts`，那里的注释写明改了字符串会让已有密文失效）、`plugins/native/goals/src` 里两处没用到的 `_boardId`（`document-collection.ts` 的解构改名、`goal-tree-materialization-order.ts` 的参数）。它们和别的计数一样，只能减少 |
| `floatingPromises`、`explicitAny`、`consoleCalls`、`debuggerStatements`、`lintParseErrors`、`lintSuppressions`、`lintPolicy` | 静态检查新增的几项，见下面「静态检查」 |
| `compatMarkers`、`testImports`、`giant` | 见 `AGENTS.md` 与 `scripts/check-health-gates.mjs` |

扫描范围：`apps`、`horizontal`、`modules`、`packages`、`plugins`、`server`、`tooling` 下的 TypeScript 源码（不含测试、夹具、`dist`、`.d.ts`）；`emptyCatchesInScripts` 与 `oldNames` 只数源码。静态检查那几项的扫描范围更宽，见下面。定义的原文在 `scripts/gates/source-counts.mjs`（`emptyCatchesInScripts`、`oldNames`）和 `scripts/gates/lint.mjs`（其余）开头，那里是唯一的出处。

加一项新的按文件计数：在 `scripts/gates/source-counts.mjs` 的 `SOURCE_COUNT_RULES` 里加一条（口径写在文件开头），在 `tests/health-gates-source-counts.test.ts` 里加定义用例和突变用例，然后 `node scripts/check-health-gates.mjs --update --base origin/main`。能用静态检查规则表达的（TypeScript 语法层面的东西）走下面的「静态检查」，不要再加正则；`emptyCatchesInScripts` 留到浏览器脚本都打成包为止。

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

内置插件的动作是别人固定引用的合同：工作流程步骤、判断绑定、MCP 工具名都写成 `capability_id@version` 加提供方（`docs/system/CONTRACT-CHANGES.md` 第 1 节）；消费场景同理，判断绑定存的是 `scene_id`、`version` 和登记它的提供方 id。同一个 `capability_id@version`（或 `scene_id@version`）下输入输出变了，固定了它的引用就遇到另一份合同，而没有任何提示。`actions/` 下四个 TSV 把这些合同写下来，让这种变化在 PR 的 diff 里露面。实现是 `scripts/gates/action-contract-snapshot.mjs`（行、比较、文字）和 `scripts/gates/action-contract-host.mjs`（读内置 Manifest、在临时 Home 里启动宿主）；核对跑在 `pnpm test:contracts` 的 `tests/action-contract-snapshot.test.ts`（CI「Action and plugin contracts」步骤），不在 `pnpm health:check` 里，因为它要读已构建的包和一个宿主，而健康门禁不构建。

| 文件 | 内容 |
| --- | --- |
| `actions/actions.tsv` | 内置 Manifest（工作台的 `BUILTIN_PLUGIN_CATALOG`）声明的每个动作，一行一个 `capability_id@version`。`provider` 列是 Manifest 的 `plugin_id`；`registered_provider` 列是宿主登记这个动作用的提供方 id（从宿主的动作目录读出） |
| `actions/scenes.tsv` | 它们声明的消费场景（`action_scenes`），一行一个 `scene_id@version`，同样有 `provider` 与 `registered_provider` 两列 |
| `actions/host-actions.tsv` | 所有内置插件在一个项目里启用时，宿主登记着、却没有任何内置 Manifest 声明的动作：`system.*` 提供方、每个 Runtime 插件的 SDK 服务、写在代码里而不在自己 Manifest 里的插件动作（Shelf 的 27 个）和由场景派生的开关动作（Feed、Inbox 各 3 个 `scenes.*`）。一行一个 `capability_id@version via 提供方`；提供方列是宿主登记用的 id |
| `actions/host-scenes.tsv` | 宿主登记着、却没有任何内置 Manifest 声明的消费场景：现在只有首页的 `home.dock@1`（提供方 `system.home`，由 `apps/local-host/src/home-actions.ts` 里的首页提供方登记）。一行一个 `scene_id@version via 提供方`，列与 `scenes.tsv` 相同、没有 `registered_provider`（`provider` 列本身就是宿主登记用的 id）。绑定存下这个场景的 `scene_id`、`version` 和提供方 id，内核重新绑定时比对提供方（`actions.provider_changed`），规则的适用范围也按它认 |

**一行写什么。** 可读列：`capability_id`、`version`、`provider`、`registered_provider`（只在 `actions.tsv` 与 `scenes.tsv`）、`operation`、`kind`、`scope`、`effect`（声明的，或像 `actionEffect` 那样从 id 推断：删除类 id 不可撤销）、`scheduling`、`audiences`、`permissions`、`subjects`（主体种类）都排了序，顺序不是合同；`input_type`、`output_type` 是工作流程按它匹配的语义类型。哈希列（sha256 前 12 位）：`input`、`output` 是 JSON Schema 的规范形（键排序、数组顺序保留）的哈希，**先去掉 `title`、`description`、`$comment`、`examples` 这些注解**，因为改一个标签或一句帮助不是改形状；`const`、`default`、`enum` 下面的值是数据，原样算进去，名叫 `title` 的属性是属性不是注解。`traits` 是动作声明里其余的结构化部分（依赖的动作、撤销、后台任务、搜索与文件来源、执行策略、署名、工作流内容，以及以后加进动作元数据的任何新字段）去掉文字与呈现（`title`、`description`、`result_view`、受理选项的 `title` 与 `hint`）后的哈希。`-` 表示没有。

**失败信息怎么读。** 源码生成的内容和入库的文件有任何不同就失败（新增、删除、改任何一格、行被手改或重排、文件缺了），并把变化分开列：

| 列出的 | 意思 | 该怎么办 |
| --- | --- | --- |
| 同一版本下形状变了 | `capability_id@version` 不变，而 `input`、`output`、`traits`、`subjects`、`input_type`、`output_type` 里有一格变了 | 升版本，或在 PR 里写明为什么没有固定它的引用会坏（合同变更流程第 3 节第 3 条）。评审拦这一类 |
| 谁能调、怎么调变了 | 权限、受众、`kind`、`scope`、`effect`、`scheduling`、`operation`、`provider`（Manifest 的 `plugin_id`）变了，形状没变 | 写进 PR 的合同影响 |
| 登记用的提供方变了 | `registered_provider` 变了，无论别的列变没变：改名、从原生装配迁到 Runtime 装配（或反过来）、换了发布签名，都会让这个插件每个动作的这一格变，逐个列出 | 已固定的引用（工作流程步骤存的 `provider_id`、`allowed_actions`、Feed 与 Inbox 场景的引用）带着旧 id，内核比对不上就抛 `actions.provider_changed`，旧引用不会自动换成新提供方。同一个 PR 里列出这些引用并迁完，或写明为什么没有 |
| 换了新版本 | 同一提供方的 id 少了 `@旧` 多了 `@新` | 旧版本的固定引用不再能解析：列出消费者 |
| 新增、删除 | 一个动作多了或少了 | 删除同样会让固定它的引用失效 |

**两层要一致。** 核对还要求：Manifest 声明的每个动作，宿主都登记着（在某个提供方下）；它的插件登记它时，用的就是 Manifest 里那份声明（不是另一份）；同一个 `capability_id@version` 在同一提供方下，各受众和各范围看到的声明相同。Goals 的 `goals.planning.personal.*` 是现在唯一的例外：Manifest 声明了它们，宿主却登记在 Home 级提供方 `io.molis.work.goals.home` 下（`host-actions.tsv` 里有这两行，`actions.tsv` 里也有），这是登记位置与 Manifest 不一致的现状，快照把两边都固定下来。Runtime 装配的插件，宿主登记用的提供方是 `plugin-install-<sha256(plugin_id, publisher.signature) 前 32 位>`，已固定的引用里写的就是它，所以 `actions.tsv` 把它写在 `registered_provider` 列（`provider` 列仍是 `plugin_id`，Manifest 与宿主靠 `provider.plugin_id` 对上）。换了 `publisher.signature`，或把原生插件迁到 Runtime 装配，会改变这个 id：`actions.tsv` 里这个插件每个动作的 `registered_provider` 变化，逐个列在「登记用的提供方变了」下，`host-actions.tsv` 里各 `sdk.artifacts.plugin-install-…` 行跟着变。同一个动作在不同受众、范围下被登记在两个提供方 id 下，核对直接失败（引用只写一个）。`goals.planning.personal.*` 的 `registered_provider` 是 `io.molis.work.goals.home`，因为插件自己没登记它们，只有 Home 级提供方登记了。消费场景一样：Manifest 声明的场景，宿主登记它的提供方 id 记在 `scenes.tsv`；宿主自己登记的场景（首页的 `home.dock@1`）单独记在 `host-scenes.tsv`，按 `scene_id@version via 提供方` 一行，各受众与范围看到的声明不同、或没有提供方 id，核对直接失败。同一场景被插件和宿主的提供方各登记一次，是各自的一行。

**有意改。** 先 `pnpm build`，再 `pnpm actions:update`（即 `node scripts/gates/action-contract-snapshot.mjs --update`；约 10 秒，宿主跑在临时 Home 里），提交 `tooling/gates/actions/` 的变化，并把命令打印出来的那几组变化写进 PR「公开合同与 API 影响」一栏。只查不写：`node scripts/gates/action-contract-snapshot.mjs`。`pnpm health:check` 的 `--update` 与基线不碰 `actions/` 下的文件。

**宿主那一半从不碰真实 Home。** `withIsolatedHome` 在运行期间把 `HOME`、`MOLIS_WORK_HOME` 指向新建的临时目录、`MOLIS_WORK_SECRET_BACKEND` 设成 `file`、清空 `MOLIS_WORK_ENCRYPTION_KEY`；`collectHost` 第一步调 `assertThrowawayHome`，找不到恰好这个环境就拒绝启动：Home 在（解开符号链接后的）临时目录里、`MOLIS_WORK_HOME` 与 `HOME` 解开后都指向它、后端是 `file`、没有加密密钥，缺哪一项都拒绝（后端没设时，非测试环境的 macOS 会选全机共用的钥匙串）。`tests/action-contract-snapshot.test.ts` 逐项试过：另一个存在的临时目录、变量没设、后端 `env`/`keychain`/没设、设了密钥、临时目录之外、指向临时目录之外的符号链接。在别处直接启动一个宿主列目录，没有设 `MOLIS_WORK_HOME` 时有的代码路径会解析到默认的 `~/.molis-work`（`resolveMolisWorkHome`），所以要列动作目录就走这两个函数，或者用 `scripts/run-tests.mjs`。

**看不到的。**
- 函数体与行为，以及动作的 `title`、`description`、`result_view` 的文字。
- 每类受众此刻能不能在目录里看到它：那取决于授权、生命周期和连接，是宿主动态给出的；快照只记声明的 `audiences`。步骤一的快照记过这个矩阵。
- MCP 默认工具（`apps/mcp` 的 `MCP_TOOLS`、`RUNTIME_MCP_TOOLS`，步骤一记了 12 个）的名字与参数；运行时才有的动作（用户发布的判断函数，即 `functions.published.*` 里除下面三个以外的；外部 MCP 与服务连接的工具、创作台生成的插件、有配置的 Coding 外部 MCP）：空 Home 里没有它们。系统自己发布的三个判断函数（`functions.published.system_admit_inbox`、`system_pick_home_dock`、`system_pick_inbox_next`）空 Home 里就有，已在 `host-actions.tsv` 里。
- 场景目录只列给持有场景所要权限的调用者（内核 `sceneVisible`：场景的 `permissions` 全持有，或持有它的 `configuration_permissions` 且有可配置的目标）。列场景用的调用者持有三处权限的并集：本机用户持有的（`LOCAL_OWNER_PERMISSIONS`）、宿主列出的每个动作所要的、每个 Manifest 场景所要的。只取 Manifest 场景所要的不够：首页的 `home.dock@1` 要 `home:read`，没有一个 Manifest 场景要它。没盖到的：某个场景若要这三处都没有的权限，没有人能在目录里看到它，快照也就看不到。`tests/action-contract-snapshot.test.ts` 把 `home.dock@1` 的权限和代码里的 `homeDockScene` 对着核，宿主场景目录不再列它时会红。
- `traits` 只去掉已知的文字类字段（受理选项的 `title`、`hint`）：以后在别处加的说明性字段会让哈希变，刷新即可。这是多报，不会漏报。

**首次入库（2026-10-09，main `11878059`）与步骤一快照的对账。** 步骤一的 `specs/archive/post-merge-review/capability-snapshot.tsv` 有 663 个动作（main `62cbc14d`，空 Home 加演示项目）。入库时 Manifest 层 544 个动作与 2 个场景（26 份内置 Manifest 里 24 份有动作；plugin-builder 与实验插件的 Manifest 没有动作声明），宿主层 156 行动作和 1 个场景（`home.dock@1`，步骤一的快照没有记场景），动作按 `capability_id@version` 去重后共 698 个。2026-10-10 删实验插件后内置 Manifest 是 25 份（有动作的仍是 24 份、544 个动作不变），宿主层少了它的 15 行动作（现为 141 行）；下面的对账是入库时的记录，没有重算。对账（动作 id 为键）：

- 663 个里 646 个现在仍登记着，`kind` 一个没变；4 个的调度改成了 `concurrent`（`coding.runs.start`、`feed.content.receive`、`feed.items.inbox`、`inbox.content.receive`）。
- 646 个里 62 个提供方列不同，都是表示不同，不是变化：60 个是 Runtime 装配的 7 个插件（Characters 17、Coding 18、Git 10、Files 6、Shelf 5、Diff 2、Text Stats 2），步骤一写的是宿主登记用的 `plugin-install-…`，用 `sha256(plugin_id, publisher.signature)` 算出来逐个相同，本快照的 `provider` 列写 `plugin_id`，宿主登记用的 id 在 `registered_provider` 列；2 个是上面说的 `goals.planning.personal.*`。`actions.tsv` 里和步骤一重合的 502 个动作，`registered_provider` 与步骤一的提供方列逐个相同。
- 17 个已经不在：`alchemist.legacy.*` 3 个（6a6116d2，2026-10-02 删炼金术士历史演示记录）、`goals.board.import-v3`（c1d0b64a，2026-10-04，BL-083）、`jelly.inspiration.*`、`jelly.material.*`、`jelly.source.read` 共 13 个（faa85449，2026-10-01，Jelly 去掉灵感页，读取链接和文件改由灵光做）。
- 52 个是新的：42 个 Manifest 声明的（成果库的预览、固定、比较、从这一版继续，Goals 的交付物与成果输入，Jelly 的内容来源动作，灵光的 `lingguang.material.read` 与 `lingguang.source.read`，Pages 的引用方，Todo 的项目搜索），3 个 `platform` 提供方的工作目录读取动作，7 个每个 Runtime 插件一份的 `sdk.artifacts.…record`。
- 步骤一记的 12 个 MCP 默认工具这次没有对账（见上，不在快照里）。

## 静态检查（Biome）

W1-09。工具是 Biome（根 `biome.jsonc`，锁文件里一个精确版本的 devDependency）；门禁是 `scripts/gates/lint.mjs`，随 `pnpm health:check` 跑，对照 merge-base，口径与上面的「按文件计数」完全一样：每个文件每条规则一个数，新文件从 0 开始，只许减少，PR 里改 `baseline.json`、`--update` 都放不过变大的。只做检查：不开格式化，也不整理 import，所以不会有整仓重排。

**为什么是 Biome，不是 ESLint**：一个二进制，锁文件只多一个包（ESLint 要 eslint、typescript-eslint、解析器一整棵树）；整仓约 2 秒（ESLint 要类型信息的规则得先给七十多个 tsconfig 建程序，还要先 build）；merge-base 没有检出目录可以跑，Biome 能在一个只放被跟踪文件的临时目录里跑，两边用同一份配置量，ESLint 的类型感知规则做不到；仓库自己的两条规则用 GritQL 插件写（`tooling/gates/lint/`），不需要写 JS 插件。代价：没有浮动 promise 的类型检查器级别精度，见「看不到的」。

| 键（baseline.json） | 规则 | 口径 | 关掉的地方 |
| --- | --- | --- | --- |
| `emptyCatches` | 插件 `molis/no-empty-catch` | 块里既没有语句也没有注释的 `catch` 子句。Biome 自带的 `noEmptyBlockStatements` 不用：它还报每个空函数（481 处对 4 处），是另一件事 | 无 |
| `unknownCasts` | 插件 `molis/no-double-cast` | `x as unknown as T`、`(x as unknown) as T`（括号层数不限）、`<T><unknown>x`，也包括混合写法 `<T>(x as unknown)`、`(<unknown>x) as T`（W1-04 的语法树计数不数这两种，现有文件里一处也没有，所以那些文件的逐文件数字不变）；单独的 `as unknown`、`as any as T` 不算 | 无 |
| `floatingPromises` | `nursery/noFloatingPromises` | 没有 `await`、没有返回、没有 `.catch`/`.then` 处理、也没写 `void` 的 promise。有意丢掉就写 `void` | 无 |
| `explicitAny` | `suspicious/noExplicitAny` | 显式写出的 `any`（含 `as any`、`Array<any>`）；要用 `unknown` 再收窄 | 无 |
| `consoleCalls` | `suspicious/noConsole` | `console.*` 调用（遗留的调试输出）。宿主里需要日志的地方以后走结构化日志（路线图 W5-13） | `scripts/**`、`apps/cli/**`、`apps/desktop/launchers/**`、`tooling/plugin-cli/**`、`server/tooling/**`：这些程序的工作就是往终端打印 |
| `debuggerStatements` | `suspicious/noDebugger` | `debugger` 语句 | 无 |
| `lintParseErrors` | Biome 的解析错误 | 有语法错误的文件（每个文件记 1，不管报了几处）。Biome 遇到语法错误会恢复并继续检查读得懂的部分，别的规则照样在这个文件上跑（`continuity-demo.mts` 就同时有一处解析错误和一处空 `catch` 记录）；但恢复可能跳过一段：没有结束的模板字符串会把后面整个文件吞成一个词，之后的内容什么规则都看不到。所以记数，不让它当作干净的文件通过。已知的限制：一个已经带着记录的有语法错误的文件，每个文件只记 1，所以它再多一处语法错误（比如没有结束的模板字符串，把后面的内容吞掉）数字不变、后面的内容也没人查；遇到这种文件要把它修好并从基线里去掉，不要在它上面继续写。现在有 `server/tooling/continuity-demo.mts`：`const` 里 `projectId` 声明了两次，是 `board_id` 改名时留下的坏演示脚本 | 无 |
| `lintSuppressions` | `biome-ignore` 注释 | 压制规则的注释本身。每条规则都有不用压制的写法，所以压制也不许增加 | 无 |
| `lintPolicy` | `biome.jsonc` 的形状 | 与 merge-base 的比较：见下面「规则集只许变严」 | |

**扫描范围**：被 Git 跟踪的 `.ts`、`.mts`、`.mjs`，在 `apps`、`horizontal`、`modules`、`packages`、`plugins`、`server`、`tooling`、`tests`、`scripts`、`examples` 之下（不含 `.d.ts`、`dist`、`node_modules`）；`docs/` 里的原型和 `specs/archive/` 不是交付的代码，不查。门禁把这些文件和 `biome.jsonc`、插件文件拷进一个临时目录再跑 Biome，所以结果只取决于被跟踪的文件和锁定的 Biome 版本，在哪台机器、CI 里、merge-base 上都一样，不依赖 `node_modules` 或构建产物。

**规则集只许变严**（`lintPolicy`）：头和 merge-base 都用头的 `biome.jsonc` 去量，所以规则一松，两边的数字一起“降”（有时到 0），数字本身看不出来，像是改善。因此配置要单独比：门禁把 `biome.jsonc` 读成一份摘要（哪条规则在哪里是 error、哪些目录把它关了、排除了哪些文件、检查范围的正向列表、有哪些插件），与 merge-base 的摘要比。去掉一条规则、改成 `warn`、给某个目录新关一条规则、在 `overrides` 里用 `linter.enabled: false` 给某个目录整个关掉检查（那一个设置就让该目录所有规则的数字归零，两边一起）、新加排除、把全局规则改成只对某个包生效、从 `files.includes` 里去掉一个目录的写法、给 `linter.includes` 加上限制或去掉里面的一项（检查到的文件变少）、删掉插件，都失败。换成更宽的写法也算“去掉了旧的”：保留旧的再加新的，或者改门禁。`files.includes` 的正向条目还必须正好是门禁拷进检查的那几个目录（`LINT_ROOTS`，一项不多一项不少；`!` 开头的排除不算），不然 `pnpm lint`（原地跑，查每一个正向条目）和门禁（只数 `LINT_ROOTS`）看到的文件不一样；多出来的条目或少一个都直接失败，不论 merge-base 怎么写。要新增一个代码目录，`LINT_ROOTS` 和 `files.includes` 一起改。

**`overrides` 的先后顺序门禁不建模，所以拒绝顺序会起作用的写法**：Biome 按书写顺序应用 `overrides`，后面的覆盖前面的；而摘要里的集合是排好序的，同样两条 override 换个顺序，对比较来说是同一份配置。于是一个 PR 在已有的例外后面加一条更严的 override（比较认为是变严），下一个 PR 把两条换位，例外就复活了，两边的数字一起降，什么都看不出来。因此两条 override 对同一条规则（或对 `linter.enabled`）设不同的级别、而它们的目录可能重叠时，直接失败，不论 merge-base 怎么写。判断“可能重叠”很保守：只有两个目录的字面路径前缀分叉（`scripts/**` 与 `apps/cli/**`）才算不重叠；第一段带通配符或花括号（`**/x`、`{apps,packages}/**`）、没有 `includes`（整个树）、一个目录在另一个里面（`packages/**` 与 `packages/a/**`）都算重叠。要收紧一个例外，就把目录从那条例外的 `includes` 里去掉，不要在后面再加一条 `error`；同一条规则设两次同样的级别、或两条不同的规则不受影响。

**门禁只认它读得懂的设置**：规则只写级别（`"error"`、`"off"` 或 `{ "level": … }`）。规则选项（`noConsole` 的 `options.allow` 列上所有方法就一个 `console` 也不数）、按语言的开关（`javascript.linter.enabled: false` 让 Biome 一条诊断也不出）、`domains`、`extends`、override 里的规则预设、插件的对象写法，以及其他没列出的设置，一律拒绝，不是忽略；要用其中一项，先改 `scripts/gates/lint.mjs` 的 `policyOf` 让门禁读懂并比较它。嵌套的 `biome.json[c]` 同样拒绝（门禁只读根配置）。`biome.jsonc` 里开了一条没有对应计数的规则也失败：先在 `LINT_RULES` 里加计数。插件文件（`tooling/gates/lint/*.grit`）的内容是计数的口径本身，和 `scripts/gates/*.mjs` 一样：改它就是改门禁，要过评审，`tests/health-gates-lint.test.ts` 的定义用例钉住它的行为。

**工作树**：其他会话的工作树都在 `.claude/worktrees/` 下，每份带一个 `"root": true` 的 `biome.jsonc`。`vcs` 是关的，Biome 不读 `.gitignore`，在主检出里会走进去、发现第二份根配置，报 `Found a nested root configuration` 然后一个文件都不检查（`pnpm lint` 和编辑器扩展都这样）。所以 `files.includes` 里有 `"!!.claude"`（强制忽略，扫描器根本不进这个目录）。写成不带 `**/` 的锚定写法是有意的：`"!!**/.claude"` 也能解决主检出的问题，却会匹配到本身就在 `.claude/worktrees/` 下的检出路径里的 `.claude`，在工作树里跑 `pnpm lint` 就变成检查 0 个文件（Biome 2.5.14 实测）。`tests/health-gates-lint.test.ts` 在两处都真跑一遍 Biome。这个条目是 `biome.jsonc` 入库时带来的，所以不算「新排除」；以后再加排除仍然失败。

**按包开一条新规则**：不要一次开全仓。先在 `LINT_RULES` 里加计数，再在 `biome.jsonc` 的 `overrides` 里只对一个包把它设成 `error`（`"includes": ["packages/storage/**"]`），该包现有的违规按文件冻结进基线（`--update --base origin/main`），之后每个包清理完或确认没有违规就加进来；全部包都开了之后把规则挪到 `linter.rules` 的顶层并删掉 override。反过来，要对某个目录关一条规则，是 `overrides` 里的一项，写明理由，并且是改门禁本身，要过评审。

**看明细**：`pnpm health:check` 失败时会写出文件和行号。`pnpm lint` 直接跑 Biome（`biome lint --max-diagnostics=none`，在工作树里原地跑，列出每一处，含基线已接受的；Biome 默认只打印前 20 条，所以脚本里关掉了这个上限。基线里有已接受的违规，所以它的退出码不是 0；编辑器装 Biome 扩展读同一份 `biome.jsonc`），原地跑能看到临时目录里看不到的（见下）。加一条定义要同时改：`scripts/gates/lint.mjs`（`LINT_RULES`）、`biome.jsonc`、本节的表，并在 `tests/health-gates-lint.test.ts` 里加定义用例和突变用例。

**看不到的**（已知限制，不是决定）：
- `noFloatingPromises` 沿着文件之间的相对 import 找 promise，不会穿过包名：调用另一个 workspace 包导出的 async 函数没有被 await，临时目录里看不到（要先 build 出 `.d.ts`，门禁不依赖构建）。构建之后原地跑 `pnpm lint` 能多看到 1 处（`prologue-node.ts` 里 Prologue SDK 的方法，类型来自 `node_modules`），其余都在树里。Biome 的这条规则还在 nursery，版本固定，升级前先在 `tests/health-gates-lint.test.ts` 里看定义用例。
- `async` 回调传给期望同步返回的位置（`noMisusedPromises`）不查：这个版本的 Biome 把 `if (pending) return pending` 这种“可能为空的 promise 缓存”也报成错误（27 处误报），没法用。
- 浏览器脚本（写成模板字符串的客户端程序）Biome 看不到：那里的空 catch 仍由 `emptyCatchesInScripts` 数，其余规则没有对应物。
- 没有检查未用变量与导入：`tsc` 的 `noUnusedLocals` 已经在每个包里查了；`tests/` 与 `scripts/` 不在任何 tsconfig 里，没有类型检查（路线图 §4.16 记了 798 处）。

## Rust、Swift、shell 与 Python

`scripts/gates/native-checks.mjs`（开头的注释是口径的出处）。这几项不是数字，没有基线：通过，或者失败，每个告警都算错误。CI 里 `native-checks` 任务（macOS）跑 Rust 和 Swift，`shell-checks` 任务（Linux）跑 shell 与 Python，两个都在 `Verify` 的 `needs` 里；本机 `node scripts/gates/native-checks.mjs rust|swift|shell|python`。

| 检查 | 命令 | 范围与说明 |
| --- | --- | --- |
| Rust 格式 | `rustfmt --check` | 所有被跟踪的 `.rs`。`apps/desktop` 之外的 `.rs` 文件直接失败（不在检查范围里的代码不许悄悄加进来） |
| Rust 静态检查 | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | 要编译 crate，所以在 macOS 上跑。CI 用 `RUSTUP_TOOLCHAIN` 固定 Rust 版本（clippy 每个版本都会新增 lint，`-D warnings` 跟着“stable”走会让每次发布变红）；换版本是单独的改动，同一个 PR 里清掉新告警。本机用已装的版本，新版本可能多报 |
| Swift 类型检查 | `swiftc -typecheck -parse-as-library -target <arch>-apple-macosx14.0 JellyMaterial.swift` | 原生素材提取器。每个被跟踪的 `.swift` 都要登记在脚本的 `SWIFT_UNITS`，否则失败 |
| Swift 包构建 | `swift build --package-path apps/local-host/native/materials/whisper`（加 `--package`） | `jelly-whisper` 的 SwiftPM 包，`swift-tools-version: 6.2`（要 Xcode 26），冷编译约 7 分钟，要联网拉 `argmax-oss-swift`。CI 里先作为不挡合并的步骤跑（`continue-on-error`），所以现在挡合并的只有 `JellyMaterial.swift` 的类型检查，`jelly-whisper` 编译坏了不会让 CI 变红。收口记在待办 [BL-122](../../specs/BACKLOG.md)：确认有 Swift 6.2 的 runner（`macos-26` 或装 Xcode 26）后去掉 `continue-on-error` |
| shell | `shellcheck --severity=warning` | 所有被跟踪的 `.sh`，和第一行是 sh/bash 的无后缀文件。告警和错误失败，风格提示不失败 |
| Python | `python3 -I`，`ast.parse` | 被跟踪的 `.py`（现在没有；实验插件的工作进程 2026-10-10 随插件删除）必须能解析；不写 `__pycache__`。只查语法，没有 linter |

工具缺失是退出码 2，不是通过。规则本身在 `tests/native-checks.test.mjs`（纯 `node:test`，不需要装依赖）里各被故意违反一次；本机没有的工具对应的用例会跳过并说明（shell 用例另有一个替身 shellcheck，验证“交了哪些文件、严重度参数、失败的退出码”）。

本机的 Rust 测试 `cargo test` 不在 CI 里：有两个测试用纳秒时间戳给临时目录命名，并行时偶尔撞名（`shelf_http`、`context_directory_files`）。
