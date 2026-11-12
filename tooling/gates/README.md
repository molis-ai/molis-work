# 门禁数据（tooling/gates）

状态：现行；门禁脚本是 `scripts/check-health-gates.mjs`（入口）、`scripts/gates/`（各门禁的实现）。本文管现行口径和命令；历史方案与演进证据在 [specs/archive/repository-anti-corruption](../../specs/archive/repository-anti-corruption/spec.md) §5a。

`pnpm health:check` 与 CI 的「Health gates」步骤读这里的文件。比较的规则、`--base`、`--update`、`--report` 的用法见 `AGENTS.md`「构建与测试」和 `scripts/check-health-gates.mjs` 开头的注释，这里只说有哪些文件，以及两类门禁的口径。

| 路径 | 是什么 | 谁改 |
| --- | --- | --- |
| 工作树 Git 元数据中的本地快查 | CI 不读，不入库；没有时默认对照 origin/main | `node scripts/check-health-gates.mjs --update --base origin/main` |
| `page-asset-allowances/*.json` | 每项任务必要增长的独立一次性许可；不写绝对预算 | 经审阅后记录 reason、review、assets；大额或新资源加用户批准出处，见开发手册 |
| `giant-exceptions/**/*.json` | 按源码文件分开的巨大单元登记；重复 key 拒绝 | 保留 kind、reason、精确 size，仍须评审 |
| `limits.json` | 巨大单元与 vendored SDK 的阈值，以及 `docs/` 下一个 `.json` 最多多少字节（`docsJsonBytes`，依据见 `scripts/gates/README.md`「文档里的原始数据」），只许收紧 | 人，过评审 |
| `api/<包>/<subpath>.txt` | contracts 每个 subpath、插件 SDK，以及别的工作区包的 `./contract` 的公开 API 快照 | `pnpm api:update`（见下） |
| `actions/*.tsv` | 内置 Manifest 声明的动作与消费场景、宿主另外登记的动作与消费场景的合同快照（提供方、宿主登记用的提供方 id、谁能调、输入输出 schema 的哈希） | `pnpm actions:update`（见「动作合同快照」） |
| `schemas/stores.tsv` | 这个构建会建的每个库的结构快照（位置、主人、版本、结构哈希、升级段的 `from`） | `pnpm schemas:update`（见「库的结构快照」） |
| `secret-allowlist.txt` | 密钥扫描的已知测试值 | 人，过评审 |
| `table-owners.json` | `shared`：几个包有意共用的表（今天没有；`events`、`idempotency_records` 原先在里面，PG-094 S9-1 后已删）的 owner、用到它的包、理由；`same_name`：两个包各建一张的同名表（今天是 `workspaces`、`jobs`，不同库）的包与理由；`areas`：包里自己当 owner 的目录（今天是 Feed 的 `src/store`，BL-802）与理由；其余的表只许 owner 包读写（`scripts/gates/table-owners.mjs`，说明在 `scripts/gates/README.md`） | 人，过评审；门禁两头核对，登记的包不再用就要删 |
| `error-owners.json` | 错误码的主人表：`platform.prefixes`（平台自己的前缀，今天是 `actions`、`placement`、`search`、`files`）和 `owners.<名字>`（主人名、它名下的目录、glob 或文件、理由）。每个错误码以所在文件的主人名开头，平台码（`ACTION_ERROR_KINDS` 里有行的）除外；`plugins/native/<目录>/` 下的文件不用登记，主人就是目录名（连字符变下划线）。表自己的规则没有基线，表只许变严（`scripts/gates/error-owners.mjs`，口径见下面「错误模型」） | 人，过评审；新增一个包或区域要先加一条 |
| `golden-coverage.json` | 金样覆盖面：`uncovered`（必须备份、今天金样里没有的路径和理由）、`writes`（每个必备份的库由 `tests/golden-writes/` 哪几个用例写，或为什么没有）、`other_writes`（不对应某个库的用例和它写什么）。见下「金样」 | 人，过评审；每条都双向核对，过期就失败 |
| `sqlite-driver-owners.json` | 允许直接 import `better-sqlite3` 的目录（以 `/` 结尾）和理由：今天只有 `plugins/native/alchemist/`（已有审批的私有驱动，BL-377 重做前保留；其余项目库连接已由 storage 统一走 `node:sqlite`）。文件缺失、形状或理由不合格时 `pnpm boundary:check` 直接失败（`scripts/gates/project-sqlite-driver.mjs`） | 人，过评审；新增一个例外要加一条带理由的目录 |

## 宿主源码行数报告（A2）

`pnpm health:check` 显示 `apps/local-host/src/` 的总行数。有实际 merge-base 时，同时显示基点行数和净变化。按用户 2026-11-01 的决定，增长只报告。本地快查不保存这项数字。

在 Git 跟踪的文件里统计 `.ts`、`.mts`、`.cts`、`.tsx`、`.js`、`.mjs`、`.cjs` 和 `.jsx`，各级目录中的生成源码、夹具、测试和声明都计入。空行、注释和未以换行结束的末行各算一行。LF 和 CRLF 都只换一次行，尾换行不多算一行，空文件是零行。

`node scripts/check-health-gates.mjs --base origin/main --report` 按行数变化幅度列出变更文件，可以用 `--top N` 收窄。Git 识别到范围内的改名时，同时显示两个路径。省略 `--base` 则列当前文件的行数。再加 `--json` 可从 `hostLines` 读取两份总量与逐文件计数、净变化和变更明细。JSON 的明细完整输出。

## 按文件计数、只许减少的项

每一项是 `{ 文件: 个数 }`；没有记录的文件从 0 开始，所以新文件不许带。CI 用同一份脚本量当前树和 merge-base 再比，改 本地快查 放不过变大的。文件改名后记录跟着走。

`rawFetchInScripts`（W3-10-5）也使用这一份比较，另要求 Workbench 始终为零：即使与 base 相等，或执行 `--update`，仍拒绝写基线。实现分为 [模块与绑定图](../../scripts/gates/browser-graph.mjs)、[浏览器程序展开](../../scripts/gates/browser-programs.mjs)、[fetch 调用检查](../../scripts/gates/browser-fetch.mjs)，接在 `SOURCE_COUNT_RULES` 中。按实际程序 AST 数裸、成员、静态计算属性、局部别名、赋值/解构/bind、call/apply；普通字符串、注释、HTML 文本及 JSON 数据脚本不算。计数仍归原文件，同一片段多次装配不重复计；插件现存计数随 W5-04 只降。打包生成的程序（W4-04）：常量写成 `readFileSync(new URL("./<名>.js", import.meta.url), "utf8")`，所在包 `package.json` 的 build 里有 `esbuild <入口>.ts … --outfile=dist/<名>.js` 时，入口和它 import 的文件按类型源码数（计数记在各自文件上）；对不上任何构建步骤的读取不能展开，直接失败。

程序从 SCRIPT/CLIENT 字符串声明、HTML 中执行的 script，以及 Workbench 的 terminal-client/browser-client TypeScript 入口识别。静态字符串/模板、拼接、数组 join 和已声明函数的 toString 按语法展开，相对 import 与 workspace export 跟到源文件；函数由 AST 去掉 TypeScript 类型，没有执行仓库模块。现行端口传递的脚本按字段的声明来源展开为静态候选；候选重复去掉后至多 256 种组合，不能展开或解析的已识别程序报位置，不当零。UiRequest 的 native port、scope/ports 选择以及 lifecycle 的 native transport 各只放现有一个站点；相邻或复制的新调用仍计数，文件和目录没有整段豁免。副作用 import 与执行性 export-from 进入 typed 闭包，纯类型边不进入；静态 String/替换与条件返回保持或明确展开，只有现行缩进/整行注释删除的精确正则可用，其他变换拒绝。删除或替换仍保留未改字符的片段来源，不能把多个输入重记到同一格式化节点。

这是静态检查的边界：动态属性/反射、任意运行期程序生成、新的非 terminal-client/browser-client TypeScript 构建入口不是已证明的识别能力；同名端口字段按声明候选保守展开，别名赋值按可能取值保守检查，不做通用跨过程运行分析。增加新的浏览器装配方式时须同步扩识别与对抗用例。验证 [health-gates-browser-fetch.test.ts](../../tests/health-gates-browser-fetch.test.ts) 通过真实临时 Git 与 CLI 制造增长、新文件、跨片段、toString、精确例外、typed subpath 和基线篡改；不只验证计数函数。

| 项（本地快查的键） | 口径 |
| --- | --- |
| `emptyCatches` | TypeScript 代码里的空 `catch`：块里既没有语句也没有注释，如 `catch {}`、`catch (error) { }`。块里写了注释的不算（那是写明了的取舍），有任何语句的也不算。不算 promise 的 `.catch(() => {})`（那是回调，不是 catch 子句）和 `finally`。**由静态检查数**（Biome 插件 `tooling/gates/lint/no-empty-catch.grit`，见下面「静态检查」），键和逐文件数字与 W1-04 的语法树计数一致 |
| `emptyCatchesInScripts` | 同一个形状（`catch`、可选的 `( … )`、`{`、只有空白、`}`），在**源码**文件的**字符串和模板字符串**文本里找（测试里的字符串是夹具，不数）。宿主把浏览器程序（工作台、插件的 client 脚本）写成模板字符串，TypeScript 和 lint 都不看里面，普查找到的 141 处空 catch 里有 137 处在这里。**这类算在内**，单独一个计数：把脚本从模板字符串搬进真正的 TypeScript 时，数字从这一项挪到上一项 |
| `unknownCasts` | 经 `unknown` 的双重断言：`value as unknown as T`、`(value as unknown) as T`、`<T><unknown>value`。单独的 `as unknown` 和 `as any as T` 不算。**含测试**（规格 §9.3 的 R-12 口径是含测试的）。**由静态检查数**（`tooling/gates/lint/no-double-cast.grit`），口径是 W1-04 的超集（见「静态检查」表里的混合写法），原有文件的逐文件数字相同；扫描范围比 W1-04 的语法树计数多了 `scripts/`（见「静态检查」的扫描范围），所以总数从 199 变成 202（`scripts/contextual-slice/client.ts` 2 处、`scripts/preview-contextual-interaction.mts` 1 处），其余文件的数字没变 |
| `oldNames` | 只数源码，不数测试。旧产品名：单个词 `goalboard`，不分大小写（`GoalBoard`、`goalboard-v1-demo`、`GOALBOARD_HOME`）。旧 id 名：`board_id`、`boardId`、`BoardId`、`BOARD_ID`，含复数，可以是整个名字或长名字的结尾（`conflicting_board_id`、`existingBoardId`），不数别的词里的（`dashboard_id`、`dashboardId`、`DASHBOARD_ID`）。只数这两种写法：`goal-board`（连字符，目标看板视图的样式类和 CSS 容器名）不是旧名，不数；`GOALS_BOARDS_SQL`（每个项目 `boards` 表的建表语句）也不数，但不是因为它是看板视图，而是它属于另一类「Board 当项目」的旧名（`getBoard`、`initializeBoard` 等，见 `docs/system/GLOSSARY.md` R-A1，改名在路线图 W5-14），这条规则看不到也不守它们。测试不数，因为测试要写出旧名来断言它被拒绝。**看不到的（已知限制，换回来不会被抓）**：连字符写法 `board-id`（#287 之前的 CLI 参数 `--board-id`），以及不在上述源码范围里的文件（JSON 示例、shell、Rust）；要覆盖得按文件类型各写一条规则，不是改正则能做到的。基线里现在没有例外，计数是 0，和别的计数一样只能减少 |
| `scriptConstants` | 只数源码。名字以 `_SCRIPT` 结尾、值是字符串或模板字符串（含括号、`as const`、用 `+` 连起来的几段）的变量：写成文本、没有类型检查读它的浏览器程序（规格 §3 R-07，路线图 W4-04；普查时 130 个，散在 100 个文件）。把程序改成 TypeScript 再由打包生成（样例是 Forms：`plugins/native/form/src/browser/`，`package.json` 的 build 里 esbuild 带 banner/footer 直接生成 `(host) => {…}` 工厂，常量只是 `readFileSync(new URL("./form-client.js", import.meta.url), "utf8")`），这一项就少一个。**看不到的**：不叫 `*_SCRIPT` 的程序文本（`CLIENT`、`*_CLIENT`、`*_SCRIPT_FACTORY` 一类名字 `rawFetchInScripts` 会展开、这里不数），以及用函数调用拼出来的文本；它们只能在改到时顺手迁 |
| `handlerInputCasts` | 处理器输入上的 `as`：N22 迁移期间的过渡（验收编号 AIC-20，路线书决定 29），N22-G 开绝对门禁时删掉，所以和下一行合一个小模块（`scripts/gates/action-input-counts.mjs`，只读语法树，不用类型信息，两边用同一份脚本量）。**数的**：`handle` 的第二个参数（`handle: (ctx, input) => run(input as X)`、方法写法、类字段、各包自己的 `define`／`bind` 里写的 `handle`），以及就地传给 `bindActionHandler`、`bindOwnerPluginAction` 的函数的输入参数（第一个参数）；操作数必须是这个参数本身，括号、`!`、`<X>input` 同算，`input as unknown as X` 算一处。**范围**：静态检查的文件范围（含 `scripts/`、`examples/`），测试不数（`tests/`、`test/` 目录和 `*.test.*`）。处理器转调的函数不是处理器，所以 Jelly 的 `store` 那层不数（`specs/action-input-contracts/spec.md` §5.4）。`handle` 只认名字，不分对象是不是动作：别的对象上叫 `handle` 的方法也算，今天没有这样的 `as`。**看不到的（已知限制，数字量于 2026-11-08）**：操作数是含输入的表达式：`(input ?? {}) as X`（1 处，`plugins/native/goals/src/input-actions.ts:130`）、`read(input) as X`（0）、`(input satisfies T) as X`（0）；输入上的字段：`input.action as "stage"`（2 处，都在 `plugins/native/git/src/actions.ts`）；先赋给别的变量再 `as`（0）；解构或 rest 的参数（0）；默认值 `(c, input = {} as X)`（0）；`arguments[1] as X`（0）；参数上直接写类型注解 `(ctx, input: X)`，那不是 `as`。键或值的形状：计算键 `["handle"]`（0）、`get handle()`（0）、`handle: on ? f : g`（0）、`handle: wrap(…)`（0）、`handle: run` 和 `handle` 简写（19 处，多数不是动作处理器）、`bindActionHandler(def, run)`（0）、后来赋值的 `binding.handle = …`（1 处，`plugins/native/schedule/src/runtime-actions.ts:55` 的 `given as ScheduledOperationInput`）。处理器经包自己的包装传入、写处没有 `handle` 这个名字：`binding(def, (ctx, input) => input as X)`（9 处：`apps/local-host/src/connector-management-actions.ts` 8 处、`modules/artifacts/src/artifact-actions.ts` 1 处）；SDK 的 `defineAction(def, (ctx, input) => …)`（0）。调用的写法：`sdk["bindActionHandler"](…)`（0）、改名导入 `bindActionHandler as bind`（0）。写在字符串里的程序（`tooling/plugin-cli/src/sample-source.ts`）。这些都靠评审，N22-G 开绝对门禁时再核 |
| `handwrittenActionInputs` | 定义处手写的输入类型，同一个过渡、同一个模块（AIC-20，用户 2026-11-08 定）。**数的**：`createActionDefinition` 的第一个类型参数，或转交给它的包装函数的类型参数，不是 `InferActionInput<…>` 的（`define<{ id: string }, O>(…)`、`createActionDefinition<X, O>(…)`）。**包装的判定只有一条**：有名字的函数（函数声明，或值是函数的变量），自己的类型参数原样传给 `createActionDefinition` 的第一个类型参数；或者原样写在声明的返回类型 `ActionDefinition<…>` 的第一位（自己拼定义字面量的 `define`，今天 `modules/judgment-rules` 两个，共 18 处，#1933 把它们改走 `createActionDefinition` 时数字不变）。导出的包装按名字跟具名导入，改名导入也跟。今天不止 `goalAction`：`plugins/native/goals/src/action-contract.ts:38` 的 `usingServices`、`plugins/native/goals/src/contract/goal-action-definition.ts:17` 的 `inGoalRelation` 这类「拿定义又返回定义」的帮手，类型参数落在返回类型 `ActionDefinition<…>` 的第一位，也会被认成包装；今天靠推导不多数，以后 `withX<X, O>(def)`、`lookup<X, O>(id)` 这种写法会被数上，这是已知代价。同名导入也算，今天没有这种。**不数的**：`InferActionInput<…>`、不带类型参数、`define<O>()(…)`、只是同名而不转交类型参数的函数、外层函数自己的类型参数。`packages/contracts` 不数：公开合同有意留手写接口（`specs/action-input-contracts/spec.md` §4.4）。范围同上一行。**新写定义**：`define<InferActionInput<typeof schema>, O>(…)`，schema 带 `as const`，或者 §5.4 的 `define<O>()(…)`。**看不到的（已知限制，数字量于 2026-11-08）**：命名空间导入的包装（0）、挂在对象上的包装（0）、包装再包一层（0）、经别的包转出或 `export … from` 改了名的包装（0）；把 `InferActionInput` 起个别名再传算手写（0）；一个文件里两个同名函数只有一个是包装时按名字都算（0）；默认导出的包装经默认导入（0）；类方法上的包装（0）；`createActionDefinition<Foo<I>, O>` 这种嵌套调用（包装算 1 处，调用处不数，0）。不经 `createActionDefinition` 也没有返回类型标注的定义：标了 `ActionDefinition<X>` 的变量 14 个（如 `apps/local-host/src/action-usage-actions.ts`、`plugins/native/goals/src/contract/goal-entry-actions.ts`），N22-G 查这一种；把定义 cast 成 `ActionDefinition<X, O>`（`expr as ActionDefinition<X, O>`）也不会被这两项计数，N22-G 按设计稿 §9.2 一并查（第 05 批留下 12 处，归第 55 批 T11/S 片迁） |
| `floatingPromises`、`explicitAny`、`consoleCalls`、`debuggerStatements`、`lintParseErrors`、`lintSuppressions`、`lintPolicy` | 静态检查新增的几项，见下面「静态检查」 |
| `errorSubclasses`、`errorCodeShape`、`errorStatusDecisions`、`errorCodeOwner` | 错误模型的四项，见下面「错误模型」；`errorOwnerTable` 是错误码主人表本身（不进 本地快查） |
| `compatMarkers`、`testImports`、`giant` | 见 `AGENTS.md` 与 `scripts/check-health-gates.mjs` |
| `testImportSplits` | 每个测试文件（一个测试进程），以及每个没有测试读它、由测试起成子进程的 `tests/` 文件（夹具）里，既从源码（`../P/src/…`，tsx 直接跑）又从构建（包名、`../P/dist/…`）加载的包的个数。绝对零规则（W2-10-E），口径与办法见下面「测试进程里的两份包」 |

扫描范围：`apps`、`horizontal`、`modules`、`packages`、`plugins`、`server`、`tooling` 下的 TypeScript 源码（不含测试、夹具、`dist`、`.d.ts`）；`emptyCatchesInScripts`、`oldNames` 与 `scriptConstants` 只数源码。静态检查那几项的扫描范围更宽，见下面。定义的原文在 `scripts/gates/source-counts.mjs`（`emptyCatchesInScripts`、`oldNames`、`scriptConstants`）和 `scripts/gates/lint.mjs`（其余）开头，那里是唯一的出处。

加一项新的按文件计数：在 `scripts/gates/source-counts.mjs` 的 `SOURCE_COUNT_RULES` 里加一条（口径写在文件开头），在 `tests/health-gates-source-counts.test.ts` 里加定义用例和突变用例，然后 `node scripts/check-health-gates.mjs --update --base origin/main`。能用静态检查规则表达的（TypeScript 语法层面的东西）走下面的「静态检查」，不要再加正则；`emptyCatchesInScripts` 留到浏览器脚本都打成包为止。

## 测试进程里的两份包（`scripts/gates/test-import-splits.mjs`，W2-10 绝对零规则）

一个测试进程里同一个包被加载两次——一次从源码（`../P/src/…`，tsx 直接跑），一次从构建（包名、`../P/dist/…`，或别的包的构建里的包名）——就有两份模块实例：`instanceof` 跨两份失败，模块级缓存各一份，`AsyncLocalStorage` 的状态对不上。测试既可能改的是源码那份、被测代码用的是构建那份，也可能反过来。

| 项 | 说明 |
| --- | --- |
| 数什么 | 每个 `tests/*.test.{ts,mts,mjs}` 文件是一个进程（`scripts/run-tests.mjs` 一个文件跑一次）。它读的 `tests/` 帮手算进同一个进程；子进程（`fork`、`spawn`）是另一个进程，不连在一起。键是测试文件，值是它既从源码又从构建加载的包数；所有进程从0起，旧进程也不得保留混用。没有任何测试读到的 `tests/*.{ts,mts,mjs}` 文件（如 `tests/fixtures/*-mcp-server.ts`，测试用 `fork`、`spawn` 把它起成子进程）自己是一个进程，同样计数，键是它自己的路径：新夹具不许一开始就拆成两份，旧夹具也不许再多拆一个包 |
| 怎么走图 | 从测试文件出发，跟它的静态 `import`、`export … from`、`import()`、`require()`（`import type`、`export type`、每个具名元素都带 `type` 的声明不加载任何东西，跳过）。进到某个包的 `src/` 就是「源码」，并跟这个源码自己的静态 import（相对的留在源码，包名的进到那个包的构建）；包名或 `dist/` 路径就是「构建」，按每个包的统一布局（`tsc` 把 `src/x.ts` 写成 `dist/x.js`）把 `dist/x.js` 读成 `src/x.ts` 来跟它的静态 import。`apps/desktop/launchers` 这类包外、tsx 直接跑的代码当源码跟，不属于哪个包。图的写法在 `scripts/test-imports/graph.mjs` 开头，门禁和 `scripts/test-imports.mjs` 共用它 |
| 失败时说什么 | `packages one test process loads from both source (../P/src) and build (package name, ../P/dist) in <测试文件> 0 → 1; read each package from one place …. Now split: <包>: source via <文件:行 说明符>; build via <路径>`，路径写出每一步的文件、行和说明符 |
| 怎么办 | `node scripts/test-imports.mjs --check --chains` 列出每个拆成两份的进程和两条路径；`node scripts/test-imports.mjs --report [<文件>…]` 按规则出重写计划：包的公开名字改走包入口（`@molis-ai/…`），其余的相对路径从 `src/x.ts` 改到 `dist/x.js`（同一个模块，同一份实例）；`--write` 落地，并把必须一起改的文件带上，不让任何进程在改的过程中变成两份。只改说明符与 `type` 关键字，一行进一行出，文档里引用的测试行号不动 |
| 看不到的 | 包代码里的 `import()`（懒加载，不跟）；拼出来的说明符、`createRequire`；`run-tests.mjs` 不跑的包内测试；哪个文件被测试起成了子进程（图不认 `fork`、`spawn` 的参数）：一个夹具如果同时被某个测试 `import`，它按那个测试的进程算，作为子进程的那一份没有单独量到；一个夹具在最后一个读它的测试不再读它之后成为独立进程，若它是拆开的，就按新增失败（先重写或删掉它）；一个只靠 `import` 引用、运行时被擦掉的类型导入（没写 `type` 时门禁按语法算它是加载，`scripts/test-imports.mjs` 在计划里给它补上 `type`，R5） |
| 绝对零 | 任一进程混用都失败，旧基线、相等merge-base或数字下降均不授权。`--update`同样拒绝；本地快查不再写`testImportSplits`及Total。报告仍显示进程数与两边链路，沿用同一图口径 |

验证：`node scripts/run-tests.mjs tests/health-gates-test-imports-tool.test.ts`——在临时仓库里：每种拆成两份的写法（源码加包名、帮手、别的包的构建、动态 import、`dist` 换成 `src`、新测试、没人导入的夹具一开始就拆开或多拆一个包）在 `--base main` 下必须失败，`--update` 藏不住；类型导入、`dist` 孪生、只用源码、没人导入而只有一份的夹具必须不变红；删掉拆分（含夹具里的）会降低、改名保留记录。同一个文件也验证重写工具（公开名字走入口、别名、非公开走 `dist`、动态导入的解构、`apps/*` 的名字规则、没有构建孪生时不动、自检失败时不写）。

## 金样（`scripts/gates/golden-homes.mjs`，UPG2-04、UPG2-07、UPG2-08）

不比数字，出现一个就失败。设计见 [golden-replay-design.md](../../specs/upgrade-continuity/golden-replay-design.md) §5、§6。

- **覆盖面：** `docs/system/HOME-DATA.md` §3、§5、§6 里备份一栏以「必备份」开头的路径（§3.3 整节都是），加上设计额外要的（`storage-space.json`、`plugin-packages/`、`spaces/`、`feed/secrets.json`、`config/installation.json`、`agent-runtime/storage.key`），都要在最新一份金样的清单里，根 Home 或账号 Home 都算。路径里的 `<x>` 是一段，`**` 是任意，`{a,b}` 是其一，以 `/` 结尾是下面的任何东西。今天放不进金样的写进 `golden-coverage.json` 的 `uncovered`，带理由；已经进了金样、或不再是必备份的条目会失败，所以这张表过不了期。
- **最小写入：** §3 里每个必备份的库，`writes` 要说由哪几个 `tests/golden-writes/` 用例写，或者为什么没有；`tests/golden-writes/` 下每个文件要么被某个库用，要么在 `other_writes` 里。文件名和 `HOME-DATA.md` 的 owner 对不上（owner 常常是「宿主」），所以要这张对应表。
- **怎样生成的：** 最新一份的清单要有 `third_party`、`home_library`、`node`：没有样本、或不说用哪个 Node 生成的，不入库。Node 是否等于 `.nvmrc` 由 `scripts/golden-home.mjs create` 在写默认目录时拒绝，门禁不比，否则升 Node 就要重生成旧金样。
- **50 MB：** `tests/fixtures/golden-homes/` 下被跟踪文件的工作树字节不超过 50 MB。超了失败并点名最老的一份，不看年龄（用户 2026-11-08 定）。

读不到的：库里有没有行、文件里的内容读不读得回来。那是回放的事（`scripts/replay-golden-homes.mjs`）。

## 包清单（`scripts/gates/package-inventory.mjs`，W1-18）

唯一现行表在 [PACKAGE-BOUNDARIES.md「现行包清单」](../../docs/system/PACKAGE-BOUNDARIES.md#7-现行包清单)，包登记仍来自 `scripts/workspace-packages.mjs`。门禁按首个完全匹配的 11 列表头读取，守包的行集合、层、代码判定的状态、人工列词汇及数字写法；缺文档或缺表就失败。不比较数字列的当前实测值，也不根据默认生成值覆盖人工审查。`--table` 供核对机器列；原包的计划深度、审查及证据须保留。`--check` 和健康门禁只读新表，不回读历史 spec。完整负例在 `tests/package-inventory-gate.test.ts`。

## 自有版本的声明（`scripts/gates/version-declarations.mjs`，N34-VS）

`tooling/versions.json` 是自有版本唯一手改的地方，`scripts/generate-versions.mjs` 把值写到用它的地方（规则见 [POLICY.md 第 1 节](../../docs/releases/POLICY.md#1-一个产品版本和它的载体)）。这条门禁看没有经过这张表的声明，由 `node scripts/verify-release-versions.mjs` 调用，也可以单独跑 `node scripts/gates/version-declarations.mjs`。它不比数字，出现一条就失败。

| 查什么 | 口径 |
| --- | --- |
| 没有标记的当前版本 | 属性、变量、类字段、解构默认值、枚举成员里名字像版本的（`version`、`*_version`、`*Version`、`*VERSION`、`format`、`schema`、`v`、`protocol`，引号键也算）取数字或像版本的字符串；赋值、相等比较、`switch/case`、`{enum:[…]}`、`{const:…}`、`z.literal(…)`、三元与 `??` 的值；名为 version 的参数的默认值。0 表示「还没有」，不算 |
| 字符串里的版本 | 任何字符串和模板字符串按形状认：`.vN`、`-vN`、`_vN`、`/vN`、`@N`、整串的 `/N`；没有前缀名单；模板拼出来再看；字符串里的 `PRAGMA user_version = N` 和脚本文本也看。MCP 工具命名空间 `molis_work_v1_` 这一个字面量前缀不算版本：只放过前缀本身，名字其余部分照样读（`molis_work_v1_x_v2` 会报），不是按字段放行 |
| 借用别人的条目 | 只有 `action`、`event`、`format`、`type`、`artifact`、`manifest`、`host`、`protocol`、`product` 种类和 `sync.protocol` 可跨包共用，其他种类被第二个包用就失败。共用种类里的裸数字要放在叫得出自己是版本的名字上；`format.<插件>.*` 别的插件不许用 |
| 第一版规则 | `action.*`、`action-family.*`、`scene.*`、`manifest.schema`、`host.api` 在表里必须是 1。日常检查按登记的当前版本核对提示词、角色和方法。显式检查统一起点时，这些内容仍须是第 1 版 |
| 用错条目 | `capability_id`、`prompt_id`、`role_id`、`scene_id` 或工厂的 id 字面量旁边，标记的 key 不是这个 id 的条目 |
| 按位置引用的动作 | 表里有的动作 id 后面直接跟裸数字 |
| 非代码文件 | 方法 Markdown 的 `version:`、官方集成 Manifest 的版本字段不在 `carriers` 里；产品版本的几处载体没有从表里取；`.rs`、`.sql`、`.toml` 里写了 `@version` 标记（生成器不读这些文件，标记不会生效，要改走 `carriers`） |
| 动作与场景的对账 | `tooling/gates/actions/` 的每一行与 `action.*`、`scene.*`、`action-family.*`、`protocol.workflow-content.*` 条目双向一致；四个快照文件读不到就失败 |

**扫描范围。** `scripts/version-source.mjs` 的 `SOURCE_ROOTS` 下的代码文件。测试边界按包算：包顶层的 `tests/`、`test/`、`fixtures/`、`test.*` 和 `*.test.*`、`*.spec.*` 才算；`src/tests/`、`src/fixtures/` 随产品发出，照样扫。

**例外。** 只有 `tooling/gates/version-exceptions.json` 一处，按文件、名字、字面量和个数（`values`）登记，或按条目、快照行；不写 `values` 的整文件例外被拒；同名多一处、字面量变了都失败。每条理由至少 20 字；不再需要的例外本身也失败。依赖与上游协议的版本、运行时递增的修订号、盐和固定身份写在这里，不进版本表。

**读不到的（已知限制）。** 这是字面量的形状检查，版本放进变量再用、计算出来的值、不叫上面这些名字的属性都看不到；`src/dist/`、`get version(){return 2}`、`return 2`、`[1,2].includes(x.version)`、`new Map([["version",2]])`、JSX 的 `version={2}` 也看不到；是否该进表由评审判断。

验证：`node scripts/run-tests.mjs tests/version-source.test.ts tests/verify-release-versions.test.ts`。

## 库的版本与维护清单（`scripts/gates/store-versions.mjs`，BL-157）

每个权威 Home 库只认当前版本，错版拒绝；派生库按既有重建合同处理（`docs/releases/CHECKLIST.md` 第 3 节）。一个 PR 改了某个库的版本，必须记录变更及处置。2026-10-30 旧迁移已取消，当前干净重建和真实 Home 的边界归 `docs/system/HOME-DATA.md`；登记不代表已做维护或授权旧转换。10-13 Pages 由 1 升到 2，没有人写维护步骤，直到 10-17 只读核对真实 Home 才发现。这道门禁把它变成规则；它只会变严，不用基线。

| 项 | 说明 |
| --- | --- |
| 比什么 | 带 `--base` 时，读 head 与 merge-base 上检查清单第 3 节表的「版本」列，按「位置」一格对行。版本变了的行（升或降），要在 `docs/system/CONTRACT-CHANGES.md`「存储版本变更登记」内的「库版本维护清单」里有一行，位置相同、版本写 `旧 → 新`，不然失败，并说出要加的那一行。head 上新出现的行（Home 里新的库，第一次打开时按基线新建）和去掉的行不用登记。不带 `--base` 只检查两张表都读得出。读表不读代码：表和定义处的代码一致由 `scripts/verify-release-versions.mjs` 看住（CI 里跑）。JSON 文件的字段它按语法读：带不带引号的键、对象和类型里写的数字、字符串里的 `名字: 数字` 都读，值写成常量名或表达式就失败；注释、写成 `number` 的类型、在别处拼出来的版本不读（检查清单第 3 节表前那段） |
| 条目的写法 | 只认「存储版本变更登记」里（从固定标题「### 存储版本变更登记」到下一个一至三级标题）以「**库版本维护清单**」开头那一行后面的表。表要有「位置」「版本」两列：位置是检查清单同一行的位置，原样加反引号；版本是两个数字中间夹 `→`。正文里写同样的字不算，该节之外的同样一张表也不算 |
| 读不出就失败 | 检查清单（head 与 merge-base 两边都要）或维护清单（head）找不到、读不出，包括没有标题、没有表、缺列、版本不是整数（`无` 也不行，`verify-release-versions.mjs` 读同一列，同样不接受）、同一个位置写了两行、清单里的行不合写法，以及 head 上没有「统一起点登记：」那一行、有两行、写法不对，都以退出码 2 结束，不会当作通过（merge-base 上没有这一行算未登记，它是这道规则之前的提交）。只要 head 或 merge-base 上有检查清单，门禁就适用，所以在本仓库的 head 上删掉检查清单或登记文档也失败；两边都没有检查清单的仓库（别的门禁测试用的临时仓库和仓库布局拷贝，有的带着 PACKAGE-BOUNDARIES 的包清单表）不适用 |
| 统一起点之后 | 检查清单第 4 节有一行固定以「统一起点登记：」开头，值是「未登记」或形如「2026-11-08，main 提交 `abc1234`」。2026-11-07 已登记（#1914）。还没登记时只有上面几条，版本可以复位，「维护」一格是自由文字（两种状态都有用例）。head 或 merge-base 任一边登记了就生效：版本不许降（清单写了也不行）；升版本的那一行，「维护」一格要写成 `` `定义处#旧→新` ``，定义处和检查清单同一行的「定义处」完全相同，两个数字和「版本」一格相同（清单留历史，同样数字的旧行写着文字不碍事；写成指针的每一行都要站得住）；该文件的升级段字面量里要有从旧到新减一的每个 `from: n`。定义处是基线常量时只看那个对象的 `upgrades`；是普通版本常量（JSON 文件、目录库）或 JSON 文件的字段（`路径#schema_version`、`路径#version`，这些文件没有常量可指）时看文件里每个 `upgrades` 数组。`upgrades` 可以写在原处，也可以写成同一文件里一个 `const` 数组的名字（只跟这一层；两份门禁共用 `scripts/gates/upgrade-steps.mjs` 的读法）；写成展开、别处导入或用 `let` 声明的名字、名字再指向名字、同名声明了两次，`from` 不是数字字面量，都算读不懂，失败。已登记的不能改回「未登记」 |
| 看不到的 | 同一个 PR 里把某个库的「位置」改了名，看起来是一行去掉、一行新增，会通过；统一起点之后也一样，所以改名顺带升版本过得去，靠评审。它和 merge-base 比，不和 Home 里装着的构建比，几个 PR 的改动会叠起来，那一半是检查清单第 4.3 节的第一项，发布前由人对照。段有没有它查，段写得对不对它不查（用例和金样管），不查从 1 起的整条链连续（`tests/upgrade-chain-registry.test.ts` 在真实登记上查，那个文件由 U1-d 带来） |
| 可重建的库 | `search/search.db` 不进链（设计 §2.3），U1-d 之后 Alchemist 的 `search.sqlite` 也一样，但这道规则同样管它们：升到 2 不写指针、写文字、写指针没有段都失败，统一起点的版本检查也过不了。**第一次要升时不要写假的 `upgrades` 来过门禁，先问用户。** 重建型的库怎么升，第一次要升时再定，现在不加例外 |

验证：`node scripts/run-tests.mjs tests/health-gates-store-versions.test.ts`。在临时仓库里：版本升了、降了却没有那一行就失败；有对的那一行就通过；数字不对、库不对、只写在正文里、写在登记节之外，都不算；检查清单第 3 节之后的表不算第 3 节；新库和去掉的库不用登记；没有标题、缺列、版本不是数字或写 `无`、同一个位置两行、文件被删、没有登记节标题、没有清单开头那一行、清单里的行写法不对，以及 merge-base 上的检查清单没有标题，都以退出码 2 结束。真实数据的用例：这个仓库现在的表和清单直接通过；表里每一个版本是 1 的库，升到 2 带段、带指针就过，缺指针、缺段、版本降都失败；这条用的是合成的段，只证明规则读得懂每一行，不是说这些库都该这样升（上面「可重建的库」）。统一起点的用例：未登记时版本照旧能升能降；登记后版本降、「维护」一格还是文字、指向别的定义处、箭头数字对不上、基线字面量里没有 `from: 旧`、别的基线有但这个没有、跨两版缺中间一段、`upgrades` 写成读不懂的名字（没声明、`let`、名字指向名字、声明两次）或展开、登记后改回未登记都失败；写对就通过，写成本文件 `const` 数组的名字也通过；普通版本常量和 JSON 文件的字段看文件里的 `upgrades`，别的名字还是要有那一个常量。

## 库的结构快照（`scripts/gates/store-schemas.mjs`、`store-schema-snapshot.mjs`，UPG-01）

统一起点之后，改了库的建库语句就要升版本、带升级段（[升级后持续可用](../../specs/upgrade-continuity/spec.md) UPG-01）：正在用的 Home 留着旧结构，打开时只比表，同版本的库也不会就地修补。`schemas/stores.tsv` 把这个构建会建的每个库写下来，一行一个：项目目录库、项目库、宿主库登记表（`homeStores()`）里的每个 Home 库（含内置插件的 `databases.home`）、每个内置插件的项目表（`projects/*/molis-work.db#<plugin_id>`）和旧炼金术士的两个库。装上的插件的库是发布者的，不在这里。

**一行写什么。** `store`（位置，分项目的用 `*`）、`owner`、`version`、`structure`、`upgrades`（升级段的 `from`，没有写 `-`）。`structure` 是 sha256 前 16 位：建库语句在内存 SQLite 里跑完，`describeSqliteSchema` 报的表、列、检查、外键、索引（打开 Home 时比的那一份），加上每个触发器和视图的语句（空白归一）。只改排版和触发器外的注释不算，改触发器算：正在用的 Home 留着旧触发器。

**两半。** 文件和构建出的产品一致，由 `pnpm test:contracts` 的 `tests/store-schema-snapshot.test.ts` 看住（要构建，CI「Action and plugin contracts」步骤），不一致就跑 `pnpm schemas:update` 再提交。和 merge-base 比的规则在 `pnpm health:check`，不用构建：

- 同一个库版本没变、结构哈希变了：失败（UPG-01）。
- 版本降了：失败。
- 版本升了：每个 `from`（旧版本到新版本减 1）都要有升级段；还要有一份金样（`tests/fixtures/golden-homes/<版本>/manifest.json`）存着这个库的旧版本，账号 Home 里的也算。回放本身过没过由挡合并的 `golden-replay` 作业管。
- 新库、删掉的库这里不管。merge-base 有文件、头上没了，失败；两边都没有（别的门禁测试的草稿仓库）不查。

**金样记的版本。** 金样清单按主人存版本的地方记真实取值（`scripts/golden/formats.mjs`）：大多数库是 `PRAGMA user_version`，目录库读 `catalog_meta`，项目库另记每个插件项目表在 `plugin_project_databases` 账本里的版本（`plugin_tables`），`<库>#<插件>` 那一行读它。带版本的文件没有建库语句，不在这里，版本连续归下一节。某个库能不能升到 1 以上、维护清单那一行，分别归 `initial-versions.mjs` 与 `store-versions.mjs`，这里不重复。

## 统一起点的版本检查（`scripts/gates/initial-versions.mjs`，N41）

分两半，每一项都要是 1，差一个就失败。扫描范围与上面「自有版本的声明」是同一份（`scripts/version-source.mjs`）。测试文件只在两条边界都不扫时才跳过：那份共用的测试边界，和这个门禁原来的「任意深度的 `tests/`、`fixtures/` 目录」。所以包顶层 `tests/`、`fixtures/` 里的不扫；`*.test.*`、`test.*`、包顶层 `test/` 不在这两种目录里的照扫（如 `apps/sync-worker/*.test.mjs`），`src/tests/`、`src/fixtures/` 也扫。产品版本 `apps/local-host/src/product-version.ts#PRODUCT_VERSION` 是唯一不按 1 算的常量：要是这个文件这个名字，带 `product.release` 标记，字面量是字符串，值由生成器对表；别的常量带同样的标记也只能是 1。产品代码里的 `*VERSION` 常量和 `tooling/versions.json` 里下面那些持久化格式的条目不用构建，是 `pnpm health:check` 的绝对规则（用户 2026-11-07 定）：CI 里跑，不比 merge-base，干净的树上 0 个问题。动作、Manifest、提示词、方法、角色只有 `node scripts/gates/initial-versions.mjs` 查，只在有人跑时才查，现在是重建窗口手跑（检查清单 §4.1）。提示词和方法不进 CI 这半：它们的文字一变就要升版本（`tests/prompt-registration.test.ts`），不是数据文件。

持久化格式另算：`CATALOG_SCHEMA_VERSION`、`FORMAT_VERSION`（密钥文件）、`MCP_TOOL_PREFERENCE_VERSION`、`CATALOG_VERSION`（Shelf）、`home-contract` 的 `SCHEMA_VERSION`、`text-search` 的 `SCHEMA_VERSION`，以及设计稿 §2.6 说进链、用户 2026-11-07 单独同意加上的六个文件的常量：`ONBOARDING_SCHEMA_VERSION`、`PROJECT_ARRIVAL_SCHEMA_VERSION`、`BROWSER_SITES_VERSION`、`COMPUTER_SETTINGS_VERSION`、`COMPUTER_RECORD_VERSION`、`MODEL_PREFERENCE_SCHEMA_VERSION`（`jelly/preferences.json`），按 `文件#名字` 认，别处的同名常量不算；还有三项不是常量，从 `tooling/versions.json` 的条目读：`database.ledger_baseline`（插件 Home 库账本）、`database.memory_ledger_baseline`（记忆账本）、`format.jelly.workspace`（Jelly 的 `schema_version`）。它们大于 1 时，要有登记的升级链，版本相同、`from` 从 1 到版本减 1 各一次，回放通过（`{ version, froms, replay_passed }`），缺一样就失败。登记由 `registeredUpgradeChains` 从源码读（`X_VERSION` 配同一文件的 `const X_UPGRADES` 数组，基线对象读 `upgrades`，和上一节同一个读法 `upgrade-steps.mjs`，读不出来的算没有链），接在这两半；`replay_passed` 读金样（U2-d）：`tests/fixtures/golden-homes/<版本>/manifest.json` 的 `formats` 按 `tooling/versions.json` 的条目名记着每个持久化格式的版本（位置写在 `scripts/golden/formats.mjs`，生成时读主人存版本的地方），从 1 到链的版本减 1，每个都要有一份金样存着，才是真；缺哪几个，提示里写出来。库那条（UPG-01）只要升级前的那个版本，两边不一样是有意的：UPG-01 和 merge-base 比，知道这次从哪个版本升；这条只读一棵树，只有每个都要才漏不掉。清单里记的版本由回放核对：还原后用生成时的读法把记下的每一项重读一遍，不符、读不出来或没有读法就失败（`golden.recorded_version_mismatch`）；没记的不核，所以格式表以后加条目不会让老金样失败，条目换位置或改名则要给老位置留读法。回放本身是 `golden-replay` 作业，`Verify` 要它过，所以这里只证明有东西可回放，不证明回放过了。`config/installation.json`（安装器写的，金样是跑宿主生成的）和 `search/`（可重建，快照不收）金样存不了，`computer/` 的两个文件第一份金样还没有（BL-golden-computer-settings），这几项大于 1 现在都过不了；全部是 1 时用不到登记，窗口照常通过。其余基线的 `version:` 不归它查，归 `verify-release-versions.mjs` 和上一节。

不在名单上的常量给了链也只能是 1。Coding 计划、Feed 捕获、Dataset、Form、Pages、PPT 的 `schema_version` 是固定版本，写下之后不该再变：靠合同和 `content_digest`，库本身不拦，所以也不该让升级段改写。Gmail 的 `GMAIL_LIVE_CURSOR_VERSION` 是同步进度，版本不符时同步失败，跑一次全量就重建，用不着段。`workspace-artifacts.ts` 的六个 `*_SCHEMA_VERSION` 也不在名单上，它们的读取方没有查过。`format.jelly.workspace` 同样是行里的内容（`jelly_workspace.body`），留在名单上是因为那一行会变，丢了也重建不回来。现在的段改写不了它：这一行带 `checksum`（sha256），读的时候校验，内置插件的段只有 SQL，SQLite 算不出 sha256。第一次要升时再定。它和 `jelly/preferences.json` 的 `format.model.preference` 是两个版本。这道检查只看 `*VERSION` 常量和上面三个条目（手跑那半多看提示词、方法的条目），其余写成行内字面量的 `format.*` 它看不到；`format.web.service.receipt` 是机器收据，§2.6 说不做，也不在内。

验证：`node scripts/run-tests.mjs tests/health-gates-initial-versions.test.ts tests/initial-versions-check.test.ts`。后一个文件跑脚本本身，要先构建（CI 在 `test:contracts` 里跑）：经符号链接跑这个仓库要报告通过，用 `--root` 跑一个有问题的仓库要逐条列出并以退出码 1 结束。前一个文件不用构建：产品版本标记只放过上面那一个常量；`src/fixtures`、`src/tests` 照样扫；`checkRepository` 把运行中 Host 那一半换成给定的声明，走完两半和两张表，读不了表就报错。没有链、缺段、重复段、段超出范围、链的版本不同、回放没过或没有结果都失败；别的文件里的同名常量和普通常量，给了链也失败。不用构建的那一半直接读这个仓库，还测了读不了版本表、丢了版本表都算问题。

## 就地补表（`scripts/gates/schema-patches.mjs`，本地快查的键 `schemaPatches`）

全仓一个数，对照 merge-base 只许减少，现在是 0。数的是源码（`isSource`）里 `ALTER TABLE`（不分大小写，中间任意空白）和 `ensureSqliteColumn(` 的每一处，注释也算。

| 项 | 说明 |
| --- | --- |
| 不算的地方 | 只有一处：基线常量（`const X: SqliteBaseline`、`PluginDatabaseDeclaration`、`HomePluginDatabaseDeclaration`，或 `satisfies`、`as` 这三种）的 `upgrades` 数组字面量里，某一段 `sql` 的字符串或模板文字，和这一段 `run` 函数体里的字符串。它们只在持主人锁的升级过程里跑。同一个数组里别的位置（`verify`、模块加载时就求值的调用、`${}` 里的表达式、注释）照算；段写在基线外面再引用也算；`ensureSqliteColumn(` 没有例外 |
| 比旧口径多数的 | 旧口径只有正则。现在拼出来的也算（`"ALTER " + "TABLE"`、模板、数组 `join`、字符串以大写 `ALTER` 结尾），源码目录里入库的 `.sql` 也算，`server/migrations/` 除外（D1 迁移不是 Home 的库，也没有 `upgrades` 字面量可写）。同一棵树上这两项今天都是 0，所以新旧口径的数字相同 |
| 看不到的 | 只看文字在哪，不看谁执行它：读路径上写 `db.exec(X.upgrades[0].sql)` 看不出来（基线写在函数里时 `verify-release-versions.mjs` 会要求列进检查单，写在顶层不会）。另外这些写法也数不到：常量拼接跨了变量又不以大写 `ALTER` 结尾（`"ALTER " + noun + " t"`）；小写动词结尾（`"alter " + noun`）；两个词都被切开（`"ALT" + "ER TA" + "BLE"`）；SQL 注释夹在两词中间（`"ALTER/**/TABLE"`）；`replace`、`String.fromCharCode` 拼的；本地 `type SqliteBaseline = any`；不读的后缀（`.SQL`、`.ddl`、`.txt`、`.json`、`.js`、`.mjs`、`.cjs`、`.tsx`、`.cts`）和目录（`fixtures/`、`scripts/`、`examples/`、`vendor/`）。这些都得存心绕才写得出来，靠评审 |

**手跑的建表文字（本地快查的键 `schemaExecs`）。** 按文件计数，对照 merge-base 只许减少，新文件从 0 开始。数的是 `exec` 调用的参数里出现名字带 `SCHEMA` 这个词的常量（`db.exec(X_SCHEMA_SQL)`、`db.exec(BINDING_METADATA_SCHEMA)`，模板和拼接里也算）：它绕开基线建表，没有版本，也不用写 `ALTER TABLE`，上面那个数看不到。范围是 `SOURCE_ROOTS` 下所有代码文件，包自己的测试也算（`plugins/native/schedule/tests/replication.test.ts`）；顶层 `tests/` 不算，那里是用 owner 导出的文字建内存夹具。现在 7 个文件 8 处。看不到的：常量先赋给别的变量再传；小写名字（`db.exec(baseline.schema)`，`applySqliteBaseline` 自己就这样写）；`db.prepare(...)` 和别的执行方法。

验证：`node scripts/run-tests.mjs tests/health-gates-schema-patches.test.ts`，以及 `tests/health-gates-merge-base.test.ts` 里的「an in-place schema patch」和「VG-34」。

## 错误模型（`scripts/gates/error-scan.mjs`、`error-owners.mjs`、`error-metrics.mjs`，W3-02-B）

一个错误是代码、说明，可选的类别（kind）和细节；代码是 `<主人>.<原因>`，主人名在前（用户 2026-10-10 的决定），状态由类别在插件 SDK 的 `packages/plugin-sdk/src/errors.ts` 里一处推出。四项都按文件计数、只许减少，新文件从 0 开始，对照 merge-base 比；失败信息带行号（`line 12: "goal.not_found" in work's file`）。

| 项 | 数什么 | 怎么办 |
| --- | --- | --- |
| `errorSubclasses` | `class X extends …Error`：类声明或类表达式，基类名以 `Error` 结尾（`Error`、`TypeError`、`ActionError`、`errors.PluginError`）。合同里 `ActionError` 自己（`packages/contracts/src/platform/action-errors.ts`）是模型的基类，不数 | 主人的失败是一张代码表：用 SDK 的 `defineErrorCodes` 声明，抛 `ActionError`（带 kind），不另写类 |
| `errorCodeShape` | 代码字面量不是「小写词用点连接」：和合同的 `ACTION_ERROR_CODE` 是同一个表达式（`tests/health-gates-errors.test.ts` 钉住两者相等）。代码从错误类的构造函数里读：参数叫 `code` 的位置（构造函数写成 `(message, code)` 的类，`new SomeError(message, code)` 的代码在第二个，位置以构造函数为准、不靠类名），没有构造函数的类取基类的；另有 `defineErrorCodes("前缀", { 原因: kind })` 拼出的 `前缀.原因`，和错误工厂调用（`error`、`errorFactory`、`createError`、`fail`，第二个参数是说明、第一个是点连接的词；`console.error` 与 `logger` 不算）的第一个参数 | 写成 `<主人>.<原因>`，小写，不含空格和连字符 |
| `errorStatusDecisions` | 由「对错误的判断」选出的 400–599 数字：`error.code === "x" ? 404 : 400`、`if (error instanceof NotFound) return 404`、`switch (error.code) { case …: return 409 }`、`a && 404`，以及经变量取得的判断（`const conflict = /stale/.test(code); … conflict ? 409 : 400`，跟两层）；还有以字符串代码为键的状态表（`{ "todo.not_found": 404 }`）。判断指：`instanceof …Error`、`error instanceof 任何类`、读 `code`/`errorCode`/`error_code`。数字要在放状态的位置：返回值、属性或变量的值、赋值、`sendJson`/`respond`/`writeHead`/`status` 这类应答调用的参数、`new …Error(…)` 的参数；比较里的数字（`response.status === 404`）、数组里的、负数、`slice(0, 500)` 的不数。`packages/plugin-sdk/src/errors.ts`（类别到状态的唯一一处）不数 | 给错误一个 kind，让 SDK 的 `actionHttpStatus` / `actionErrorResponse` 选状态 |
| `errorCodeOwner` | 代码的第一个词不是所在文件的主人名，且不是平台码（`ACTION_ERROR_KINDS` 里有行）。没有主人的文件里除平台码外的任何代码都算。裸词（`timeout`）、全大写、`plugin.grant_denied` 的第一个词都不是主人名，都算 | 代码以主人名开头：`goals.event.not_found`，不是 `event_report.not_found`；新的包或区域先在 `error-owners.json` 加一条 |

**主人表**（`tooling/gates/error-owners.json`）：`owners.<名字>.paths` 是目录（以 `/` 结尾）、一个路径段内的 glob（`apps/local-host/src/jelly-*`，`*` 不跨 `/`）或单个文件；最具体的赢：文件 > glob > 目录，同类里更长的赢。`plugins/native/<目录>/` 下的文件不用登记，主人是目录名（`text-stats` → `text_stats`），表里可以写更长的路径盖过它；`apps/local-host/src/` 兜底归 `host`。`errorCodeOwner` 用工作树里的表量当前树和 merge-base **两边**，所以改表不会让数字变小。表自己的规则没有基线，出现一处就失败：不是合法的 JSON 或形状；主人名不是一个小写词、叫 `actions`、没有至少 20 个字符的理由；一个路径在两个主人名下，或不匹配任何被跟踪的文件；两个主人对同一个文件有同样具体的路径；`ACTION_ERROR_KINDS` 里有行的前缀不在 `platform.prefixes` 里（主人的码用 `defineErrorCodes` 声明，不进平台表），或 `platform.prefixes` 里的前缀没有行。**表只许变严**（对照 merge-base 的表，指标 `errorOwnerTable`，逐个仍在仓库里的源文件比）：一个文件在 merge-base 的表里有主人，现在换了主人失败，**现在没有主人也失败**（删掉一个主人的条目，或把一条路径改窄，使仍在仓库里的文件变成无主的）；新增平台前缀失败。文件改名搬家不算，由它自己的 `errorCodeOwner` 数字说话。没有主人是最松的一种改法，而且数字看不出来：`errorCodeOwner` 用工作树里的表量两边，文件一旦无主，它里面每个不是平台码的代码在两边都算，没有哪个数变大，只有这条比较能拦下；所以拿走主人和换主人一样失败。自由的：给新文件加主人、给原本没人要的文件加路径、条目随它的文件一起离开（文件已删除或搬走；路径不匹配任何被跟踪的文件的条目本来就必须删）。`--report` 在 `errorOwnerTable.assignment` 里列出每个仍在的源文件的主人（`files`）和没有主人的源文件（`unowned`）。更正一个给错的主人，走对门禁本身的评审改动，不在功能 PR 里。

**读不到的（已知限制，不是决定）**：**最大的一类是写成属性的代码**：对象字面量里的 `code: "plugin_revoked"`（结果对象、响应体、`Object.assign(new Error(…), { code })`），和参数是一个选项对象的构造函数（`new SearchError({ code: "provider_unavailable", … })`）。门禁只从错误类构造函数的位置参数、`defineErrorCodes` 和四个工厂里读代码，所以这一类一处也看不到（`plugin_revoked`、`provider_unavailable` 各 0 个站点，源码里分别有 4 处和 3 处属性字面量）。测于本 PR 的头、同样的扫描范围：`code: "…"` 属性字面量 298 处、101 个文件，其中 145 处不是点连接的写法，另有一部分根本不是错误码（键盘码 `KeyA`、`Escape`），所以不能直接数 `code:`，要先分清对象是不是一个错误。**同一类里还有两组**（测于同一个头、同样的扫描范围）：（一）**传给四个工厂、但不带点的代码。** 工厂里的代码要先过「像代码」的检查（至少一个点，用来和说明文字区分），所以工厂里写得不对的码恰好读不到，不进 `errorCodeShape`：实测 19 处、1 个文件，`plugins/native/alchemist/src/work-reuse/service.ts` 的 19 处 `fail("REUSE_HOST_UNAVAILABLE", …)` 一类（文件里的 `fail` 是本地的箭头函数，抛 `AlchemistOperationError`）；`plugins/official-integrations/catalog/src/document-import.ts` 的 30 处 `fail("invalid_url" | "needs_auth" | …, …)` 原来是另一处，W3-02-G2 起本地的 `fail` 抛的是 `externalDocumentErrors` 声明的 `catalog_integration.<原因>`，码由那份声明读到，不再是读不到的码；（二）**类字段 `code = "…"`。** 门禁只在构造函数里参数名叫 `code` 的位置读，字段初始化不读：3 处、3 个文件，`apps/local-host/src/project-deleted-deferred.ts`（`project_deleted.deferred`）、`packages/plugin-runtime/src/services.ts`（`plugin.capability_denied`）、`packages/ui-host/src/plugin-client.ts`（`plugin_ui_denied`）。其余读不到的：不是字面量的代码（变量、带替换的模板字符串、`prefix + "." + reason`）；别名下的错误工厂（`requireCognia(…)`）；名字不以 `Error` 结尾的错误类；基类不在仓库里声明的类；两个同名的类构造函数不同（取有 `code` 参数的第一个）；经 `error.kind` 或 `error.status` 选出的状态（`kind`、`status` 作为属性名太常见，不能当作「错误」）；先放进变量的数字（`const notFound = 404`）；模板字符串里的浏览器程序。Goals 的错误工厂注入（`errorFactory(code, …)` 的 `code` 是变量）在 PR-I 换成 `defineErrorCodes` 声明之前看不到。

**第一天的数字**（在 A 片 `feat/action-error-model` 之后；A 合入 `origin/main` 之前，与 `origin/main` 的合并基点上的数字是 110 / 543 / 226 / 1538，因为 A 的 Todo 转换和平台表还没进去）：`errorSubclasses` 108、`errorCodeShape` 543（82 个文件）、`errorStatusDecisions` 222（56 个文件）、`errorCodeOwner` 1162（181 个文件）。改名 PR（W3-02 R1–R6、J1–J7）每改一处就让后两项变小。**这两项归零不等于码都改好了**：它们只数上面读得到的写法，写成 `code:` 属性的那约 300 处和选项对象构造函数、历史工厂里不带点的 49 处（Alchemist 复用码在 J5C 迁为现行点码；官方集成目录 `catalog_integration` 的文档导入此前已收口）、类字段 `code = "…"` 的 4 处，归零与否它们都不知道。所以 W3-02 的收尾要另外清点这三类（在源码里找 `code: "`、工厂调用里不带点的第一个参数、`code = "`，分清错误码和键盘码等别的 `code`），或者先加一项数它们的新数字再说做完；把这两项换成没有基线的规则，要等那之后，由评审决定。

## 界面翻译（`scripts/gates/translations.mjs`）

随 `pnpm health:check` 检查源码与声明的词包，无须先构建。可静态识别的键必须在对应主人的默认语言与英文中存在；未声明文件、主人不符、重复键、参数不一致、已撤掉的翻译入口都失败。跨主人只能读平台公开的 `common.*`，平台代画则沿已验证的生产者来源。动态计算的键及未找到字面量的词条报告，不把静态扫描当运行证明。见 [工作台界面文字](../../apps/workbench/README.md#界面文字稳定键和翻译检查)。

## 插件样式预算（`scripts/gates/plugin-styles.mjs`，PG-070、RAC-769）

共用样式表里属于插件的规则按插件计数、只许减少；范围与口径见 `specs/archive/repository-anti-corruption/slices/pg070-plugin-styles.md`。单位是**规则块**，不是字节（字节归 `pnpm page-assets:check`）：对每个注册了 `stylesheet` 的插件，从构建产物 `apps/workbench/dist/plugin-workbench.js` 取包，用 `apps/workbench/dist/plugin-styles.js` 里第 1 片的 splitter 先找出共用表里的那部分（已经按需加载的插件取 `shared`，没有框架的插件整张都在共用表），再**不扣 `stylesheetShared`** 地数这部分里点名该插件（名字空间或 `stylesheetPrefixes`）的规则块；登记的 `settingsStylesheet` 不拆、整张进设置与工作台两张共用表，所以它的规则块全部加进该插件的数（T-115）。声明共用、或页面跑在框架里，都不能把数字变成 0（门禁第一版被评审指出的绕过口）。Goals 没有框架，登记的 `stylesheet` 与 `settingsStylesheet` 整张在共用表里；数的仍是一直数的 `GOALS_DOCUMENT_STYLES`、`TRASH_GOAL_STYLES`、`PLANNING_SETTINGS_STYLES` 三个常量（PG-060 起由登记带进共用表，不再由 `page-assets.ts` 直接拼）。现行冻结值见 `tooling/gates/plugin-styles.json`。Coding 和 Form 的共用规则来自注册声明，创作台的 `as-preview-page` 和 `pb-surface` 由宿主预览页绘制，Goals 由外壳绘制。

- 文件：`tooling/gates/plugin-styles.json`，`{ note, plugins: { "<project_plugin_id>": <rule blocks> }, prefixes: { "<project_plugin_id>": [<prefix>] } }`，只许下降。搬走规则后用 `node scripts/gates/plugin-styles.mjs --update --base origin/main` 在同一个 PR 里降数。
- 前缀：预算里的每个插件前缀集合须与构建的 `stylesheetPrefixes` 相等，新增声明不能漏记，记过的前缀只许增加。第一次拆分只用当前声明，与生产 `splitOf` 相同；只在共享余量计数时用每个插件的「reference 记的 ∪ 当前预算记的 ∪ 构建声明的」，头部数组不能覆盖历史数组。余量不增长时，`--update` 允许新增并记录前缀，即使插件仍有正计数；删除声明和预算前缀会被拒绝，回到共享表的规则也仍可计数。
- 防止就地改预算：check 和 `--update` 对完整候选使用相同约束；有 `--base` 时 reference 是真实 merge-base 的预算，无 `--base` 时是 HEAD 已提交的预算；reference 没有文件时允许首冻结。调大数字、添加 reference 未预算的正计数插件、丢弃历史前缀均失败；check 还要求当前文件逐项等于实测，删条目只在构建里真的不再计数后允许。被拒绝的 `--update` 不写文件，原字节不变。
- 位置：CI 的 `architecture-boundaries` 任务，在 `pnpm workspace:verify`（构建）与 Page asset budgets 之后；本机 `pnpm plugin-styles:check`。退出码 2 表示构建缺失或 git 读不了，不是通过。
- 看不到的（已知限制，不是决定）：只认注册的 `stylesheet` 与 `settingsStylesheet`；宿主模块里手抄的插件规则、以及没声明 `stylesheetPrefixes` 的插件（今天 Text Stats 的 `stats-`）都按 0。Goals 只枚举 `GOALS_DOCUMENT_STYLES`、`TRASH_GOAL_STYLES`、`PLANNING_SETTINGS_STYLES`，不会自动发现 Goals 登记的样式表新带进的其他规则；新增时须同步 `measureFromBuild` 的 `goalsStyles` 与真实构建验证。计数沿用 splitter 的全部选择器归属规则：`.feed-card,.other{color:red}` 留共享且不计数；只在 `:is(.feed-card){color:red}`、`:where(.feed-card){color:red}` 里出现的插件名会被剥去，也留共享且不计数。本轮不改变 splitter 或 CSS。插件规则只点名宿主元素的部分不计入；字节不在这里。
- 测试：`tests/plugin-styles-gate.test.ts` 保留增长、就地抬预算、`--update` 拒绝、新插件、删条目、缺构建、首冻结前后重复、缩小、声明共用不能藏规则。前缀场景通过最小合成 dist 数据调用生产量测和公开构建的实际 splitter/on-demand 选择，验证集合相等、合法新增、真实提交推进 main 后两步删除拒绝、历史并集，以及有/无 base 的无增长删除不写文件；最后一条跑真实仓库构建并断言实测与文件逐项相等。

## 公开 API 快照

`api/` 下每个 contracts 的 subpath（`packages/contracts/package.json` 的 `exports`）和插件 SDK 各一个文件，如 `api/contracts/platform/plugin.txt`、`api/plugin-sdk/index.txt`。别的工作区包（按根的 `pnpm-workspace.yaml` 找，测试根也一样，不写名单）只收它声明的精确 `./contract` 子路径，记在包目录下，如 `api/plugins/native/feed/contract.txt`、`api/modules/shelf/contract.txt`（BL-901）：插件或 Module 给调用方的合同；根入口、登记、样式等别的子路径不收。这些包都是 private，外部插件作者仍只装 contracts 与 SDK；快照只让工作区调用方依赖的合同变化不再悄悄发生。

- 内容：用编译器对包自己的源码做声明输出（不需要先构建，`paths` 把包名指到 `src/`，旧的 `dist/` 不会被读到），**去掉注释**。每个导出名一段，按名字排序：函数签名、接口的每个字段、常量的类型或字面值都在里面。改注释或函数体不改变快照。
- 一个名字有几条声明就写几段，一条不漏：函数的每个重载（按源码里的先后写，因为重载的顺序决定调用落到哪一个）、同名的类型和常量（`export const X = [...] as const; export type X = …`）、同一个声明以两个名字导出（别名那一段末尾注明 `exported from this entry as`）。重载的实现签名不是 API，不记。
- 辅助声明：导出的声明提到、但没有任何 subpath 导出的名字，列在导出后面（`// Declarations the exports above refer to, which no entry exports itself:`），并顺着它们再提到的名字一直找下去。找的范围是声明所在文件能看见的：本文件的声明（导出的和没导出的）、本文件按名字 `import` 的别的文件的声明、编译器写出的 `import("./x.js").Name`。例（PG-111 把 Goals 的合同搬进插件之前）：`GoalWorkEventBase` 在没有任何 subpath 导出的文件里，被三个导出的记录类型 `extends`，它加一个必填字段就是合同变了，所以列在 `contracts/modules/goals.txt` 里。某个 subpath 已经导出的名字不重复，它在那个 subpath 的快照里。
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
| `actions/actions.tsv` | 内置 Manifest（工作台的 `BUILTIN_PLUGIN_CATALOG`，由各插件的 `src/registration.ts` 生成）声明的每个动作，一行一个 `capability_id@version`。`provider` 列是 Manifest 的 `plugin_id`；`registered_provider` 列是宿主登记这个动作用的提供方 id（从宿主的动作目录读出） |
| `actions/scenes.tsv` | 它们声明的消费场景（`action_scenes`），一行一个 `scene_id@version`，同样有 `provider` 与 `registered_provider` 两列 |
| `actions/host-actions.tsv` | 所有内置插件在一个项目里启用时，宿主登记着、却没有任何内置 Manifest 声明的动作：`system.*` 提供方、每个 Runtime 插件的 SDK 服务、写在代码里而不在自己 Manifest 里的插件动作（Shelf 的 27 个）和由场景派生的开关动作（Feed、Inbox 各 3 个 `scenes.*`）。一行一个 `capability_id@version via 提供方`；提供方列是宿主登记用的 id |
| `actions/host-scenes.tsv` | 宿主登记着、却没有任何内置 Manifest 声明的消费场景：现在只有首页的 `home.dock@1`（提供方 `system.home`，由 `apps/local-host/src/home-actions.ts` 里的首页提供方登记）。一行一个 `scene_id@version via 提供方`，列与 `scenes.tsv` 相同、没有 `registered_provider`（`provider` 列本身就是宿主登记用的 id）。绑定存下这个场景的 `scene_id`、`version` 和提供方 id，内核重新绑定时比对提供方（`actions.provider_changed`），规则的适用范围也按它认 |

**一行写什么。** 可读列：`capability_id`、`version`、`provider`、`registered_provider`（只在 `actions.tsv` 与 `scenes.tsv`）、`operation`、`kind`、`scope`、`effect`（声明的，或像 `actionEffect` 那样从 id 推断：删除类 id 不可撤销）、`scheduling`、`audiences`、`permissions`、`subjects`（主体种类）都排了序，顺序不是合同；`input_type`、`output_type` 是工作流程按它匹配的语义类型。哈希列（sha256 前 12 位）：`input`、`output` 是 JSON Schema 的规范形（键排序、数组顺序保留）的哈希，**先去掉 `title`、`description`、`$comment`、`examples` 这些注解**，因为改一个标签或一句帮助不是改形状；`const`、`default`、`enum` 下面的值是数据，原样算进去，名叫 `title` 的属性是属性不是注解。`traits` 是动作声明里其余的结构化部分（依赖的动作、撤销、后台任务、搜索与文件来源、执行策略、署名、工作流内容，以及以后加进动作元数据的任何新字段）去掉文字与呈现（`title`、`description`、`result_view`、受理选项的 `title` 与 `hint`）后的哈希。`-` 表示没有。

**失败信息怎么读。** 源码生成的内容和入库的文件有任何不同就失败（新增、删除、改任何一格、行被手改或重排、文件缺了），并把变化分开列：

| 列出的 | 意思 | 该怎么办 |
| --- | --- | --- |
| 同一版本下形状变了 | `capability_id@version` 不变，而 `input`、`output`、`traits`、`subjects`、`input_type`、`output_type` 里有一格变了 | 升版本，或在 PR 里写明为什么没有固定它的引用会坏（合同变更流程第 3 节第 3 条）。评审拦这一类 |
| 谁能调、怎么调变了 | 权限、受众、`kind`、`scope`、`effect`、`scheduling`、`operation`、`provider`（Manifest 的 `plugin_id`）变了，形状没变 | 写进 PR 的合同影响 |
| 登记用的提供方变了 | `registered_provider` 变了，无论别的列变没变：改名（`plugin_id` 变）、内置插件不再被宿主名单标 `bundled`（或反过来），都会让这个插件每个动作的这一格变，逐个列出；从原生装配迁到 Runtime 装配（或反过来）、换发布签名不会，因为内置插件不论哪种装配都登记在 `plugin_id` 之下（用户 2026-10-10 的决定，W3-06 C；下面「两层要一致」） | 已固定的引用（工作流程步骤存的 `provider_id`、`allowed_actions`、Feed 与 Inbox 场景的引用）带着旧 id，内核比对不上就抛 `actions.provider_changed`，旧引用不会自动换成新提供方。同一个 PR 里列出这些引用并迁完，或写明为什么没有 |
| 换了新版本 | 同一提供方的 id 少了 `@旧` 多了 `@新` | 旧版本的固定引用不再能解析：列出消费者 |
| 新增、删除 | 一个动作多了或少了 | 删除同样会让固定它的引用失效 |

**两层要一致。** 核对还要求：Manifest 声明的每个动作，宿主都登记着（在某个提供方下）；它的插件登记它时，用的就是 Manifest 里那份声明（不是另一份）；同一个 `capability_id@version` 在同一提供方下，各受众和各范围看到的声明相同。Goals 的 `goals.planning.personal.*` 是现在唯一的例外：Manifest 声明了它们，宿主却登记在 Home 级提供方 `io.molis.work.goals.home` 下（`host-actions.tsv` 里有这两行，`actions.tsv` 里也有），这是登记位置与 Manifest 不一致的现状，快照把两边都固定下来。随宿主发布的内置插件（启动名单里标 `bundled`），不论是宿主手写装配还是 Runtime 装配，登记用的提供方都是 `plugin_id`（用户 2026-10-10 的决定，W3-06 C；此前 Runtime 装配的 7 个插件用 `plugin-install-<sha256(plugin_id, publisher.signature) 前 32 位>`）；Runtime 的登记另带 `plugin_install_id`，说明读哪一份安装的授权，所以 Shelf 的手写提供方和 Runtime 实例共用 `io.molis.work.shelf` 也分得清。创作台生成的、开发中未签名的和以后的第三方插件仍用 `plugin-install-…`，它们不在这张快照里。`actions.tsv` 把登记用的 id 写在 `registered_provider` 列（`provider` 列是 `plugin_id`，Manifest 与宿主靠 `provider.plugin_id` 对上）。内置插件不再被宿主名单标 `bundled`，或换了 `plugin_id`，会改变这个 id：`actions.tsv` 里这个插件每个动作的 `registered_provider` 变化，逐个列在「登记用的提供方变了」下；`host-actions.tsv` 里各 `sdk.artifacts.plugin-install-…` 行是 Runtime 的 SDK 服务，按安装编号命名，不随这条规则变。同一个动作在不同受众、范围下被登记在两个提供方 id 下，核对直接失败（引用只写一个）。`goals.planning.personal.*` 的 `registered_provider` 是 `io.molis.work.goals.home`，因为插件自己没登记它们，只有 Home 级提供方登记了。消费场景一样：Manifest 声明的场景，宿主登记它的提供方 id 记在 `scenes.tsv`；宿主自己登记的场景（首页的 `home.dock@1`）单独记在 `host-scenes.tsv`，按 `scene_id@version via 提供方` 一行，各受众与范围看到的声明不同、或没有提供方 id，核对直接失败。同一场景被插件和宿主的提供方各登记一次，是各自的一行。

**有意改。** 先 `pnpm build`，再 `pnpm actions:update`（即 `node scripts/gates/action-contract-snapshot.mjs --update`；约 10 秒，宿主跑在临时 Home 里），提交 `tooling/gates/actions/` 的变化，并把命令打印出来的那几组变化写进 PR「公开合同与 API 影响」一栏。只查不写：`node scripts/gates/action-contract-snapshot.mjs`。`pnpm health:check` 的 `--update` 与基线不碰 `actions/` 下的文件。

**宿主那一半从不碰真实 Home。** `withIsolatedHome` 在运行期间把 `HOME`、`MOLIS_WORK_HOME` 指向新建的临时目录、`MOLIS_WORK_SECRET_BACKEND` 设成 `file`、清空 `MOLIS_WORK_ENCRYPTION_KEY`；`collectHost` 第一步调 `assertThrowawayHome`，找不到恰好这个环境就拒绝启动：Home 在（解开符号链接后的）临时目录里、`MOLIS_WORK_HOME` 与 `HOME` 解开后都指向它、后端是 `file`、没有加密密钥，缺哪一项都拒绝（后端没设时，非测试环境的 macOS 会选全机共用的钥匙串）。`tests/action-contract-snapshot.test.ts` 逐项试过：另一个存在的临时目录、变量没设、后端 `env`/`keychain`/没设、设了密钥、临时目录之外、指向临时目录之外的符号链接。在别处直接启动一个宿主列目录，没有设 `MOLIS_WORK_HOME` 时有的代码路径会解析到默认的 `~/.molis-work`（`resolveMolisWorkHome`），所以要列动作目录就走这两个函数，或者用 `scripts/run-tests.mjs`。

**看不到的。**
- 函数体与行为，以及动作的 `title`、`description`、`result_view` 的文字。`result_view` 整个不入哈希，连同决定助理画不画连接卡的 `pending_connection`：它的形状由注册时的声明检查（`validActionResultView`）核，`connectors.setup.prepare@1` 声明了它、指针落在输出的必填字符串上，由 `tests/security-invariants-connector-scope.test.ts` 的 ASC-69 用例钉住。
- 每类受众此刻能不能在目录里看到它：那取决于授权、生命周期和连接，是宿主动态给出的；快照只记声明的 `audiences`。步骤一的快照记过这个矩阵。
- MCP 默认工具（`apps/mcp` 的 `MCP_TOOLS`、`RUNTIME_MCP_TOOLS`，步骤一记了 12 个）的名字与参数；运行时才有的动作（用户发布的判断函数，即 `functions.published.*` 里除下面三个以外的；外部 MCP 与服务连接的工具、创作台生成的插件、有配置的 Coding 外部 MCP）：空 Home 里没有它们。系统自己发布的三个判断函数（`functions.published.system_admit_inbox`、`system_pick_home_dock`、`system_pick_inbox_next`）空 Home 里就有，已在 `host-actions.tsv` 里。
- 场景目录只列给持有场景所要权限的调用者（内核 `sceneVisible`：场景的 `permissions` 全持有，或持有它的 `configuration_permissions` 且有可配置的目标）。列场景用的调用者持有三处权限的并集：本机用户持有的（`LOCAL_OWNER_PERMISSIONS`）、宿主列出的每个动作所要的、每个 Manifest 场景所要的。只取 Manifest 场景所要的不够：首页的 `home.dock@1` 要 `home:read`，没有一个 Manifest 场景要它。没盖到的：某个场景若要这三处都没有的权限，没有人能在目录里看到它，快照也就看不到。`tests/action-contract-snapshot.test.ts` 把 `home.dock@1` 的权限和代码里的 `homeDockScene` 对着核，宿主场景目录不再列它时会红。
- `traits` 只去掉已知的文字类字段（受理选项的 `title`、`hint`）：以后在别处加的说明性字段会让哈希变，刷新即可。这是多报，不会漏报。

**首次入库（2026-10-09，main `11878059`）与步骤一快照的对账。** 步骤一的 `specs/archive/post-merge-review/capability-snapshot.tsv` 有 663 个动作（main `62cbc14d`，空 Home 加演示项目）。入库时 Manifest 层 544 个动作与 2 个场景（26 份内置 Manifest 里 24 份有动作；plugin-builder 与实验插件的 Manifest 没有动作声明），宿主层 156 行动作和 1 个场景（`home.dock@1`，步骤一的快照没有记场景），动作按 `capability_id@version` 去重后共 698 个。2026-10-10 删实验插件后内置 Manifest 是 25 份（有动作的仍是 24 份、544 个动作不变），宿主层少了它的 15 行动作（现为 141 行）；下面的对账是入库时的记录，没有重算。对账（动作 id 为键）：

- 663 个里 646 个现在仍登记着，`kind` 一个没变；4 个的调度改成了 `concurrent`（`coding.runs.start`、`feed.content.receive`、`feed.items.inbox`、`inbox.content.receive`）。
- 646 个里 62 个提供方列不同，都是表示不同，不是变化：60 个是 Runtime 装配的 7 个插件（Characters 17、Coding 18、Git 10、Files 6、Shelf 5、Diff 2、Text Stats 2），步骤一写的是宿主登记用的 `plugin-install-…`，用 `sha256(plugin_id, publisher.signature)` 算出来逐个相同，本快照的 `provider` 列写 `plugin_id`，宿主登记用的 id 在 `registered_provider` 列；2 个是上面说的 `goals.planning.personal.*`。`actions.tsv` 里和步骤一重合的 502 个动作，`registered_provider` 与步骤一的提供方列逐个相同。（2026-10-10，W3-06 C：这 7 个插件改为用 `plugin_id` 登记，`actions.tsv` 里它们 62 行的 `registered_provider` 随之改成 `plugin_id`；上面的对账是入库时的记录，没有重算。）
- 17 个已经不在：`alchemist.legacy.*` 3 个（6a6116d2，2026-10-02 删炼金术士历史演示记录）、`goals.board.import-v3`（c1d0b64a，2026-10-04，BL-083）、`jelly.inspiration.*`、`jelly.material.*`、`jelly.source.read` 共 13 个（faa85449，2026-10-01，Jelly 去掉灵感页，读取链接和文件改由灵光做）。
- 52 个是新的：42 个 Manifest 声明的（成果库的预览、固定、比较、从这一版继续，Goals 的交付物与成果输入，Jelly 的内容来源动作，灵光的 `lingguang.material.read` 与 `lingguang.source.read`，Pages 的引用方，Todo 的项目搜索），3 个 `platform` 提供方的工作目录读取动作，7 个每个 Runtime 插件一份的 `sdk.artifacts.…record`。
- 步骤一记的 12 个 MCP 默认工具这次没有对账（见上，不在快照里）。

## 静态检查（Biome）

W1-09。工具是 Biome（根 `biome.jsonc`，锁文件里一个精确版本的 devDependency）；门禁是 `scripts/gates/lint.mjs`，随 `pnpm health:check` 跑，对照 merge-base，口径与上面的「按文件计数」完全一样：每个文件每条规则一个数，新文件从 0 开始，只许减少，PR 里改 本地快查、`--update` 都放不过变大的。只做检查：不开格式化，也不整理 import，所以不会有整仓重排。

**为什么是 Biome，不是 ESLint**：一个二进制，锁文件只多一个包（ESLint 要 eslint、typescript-eslint、解析器一整棵树）；整仓约 2 秒（ESLint 要类型信息的规则得先给七十多个 tsconfig 建程序，还要先 build）；merge-base 没有检出目录可以跑，Biome 能在一个只放被跟踪文件的临时目录里跑，两边用同一份配置量，ESLint 的类型感知规则做不到；仓库自己的两条规则用 GritQL 插件写（`tooling/gates/lint/`），不需要写 JS 插件。代价：没有浮动 promise 的类型检查器级别精度，见「看不到的」。

| 键（本地快查） | 规则 | 口径 | 关掉的地方 |
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

**`native-checks` 只在相关改动时跑**（用户 2026-11-04 在弹窗里批准；改 CI 属红线，已问过）。原因：GitHub 的 macOS arm64 托管机器容量不够，任务排了约 40 分钟也领不到机器（「The job was not acquired by Runner of type hosted even after multiple attempts」），随后被取消，`Verify` 跟着红，PR 和合并队列里的条目都被堵。做法照 `security-invariants`、`product-subset` 已有的写法：`test-selection` 作业（`scripts/ci-test-selection.mjs`）多出一个 `native_mode`（`whole` 或 `none`），`native-checks` 的条件和 `Verify` 都读它：

- **只有选择明确说 `none` 才放行**：事件是 `pull_request` 或 `merge_group`，`test-selection` 成功，`native_mode` 是 `none`，`native-checks` 被跳过，`Verify` 才算通过。选择作业失败、取消、被跳过，或 mode 为空、未知，`native-checks` 照旧要跑，跳过也不通过。直推 main、每晚和手动运行不看选择，照旧跑；合并队列已验过的 push main 照旧由 `queue-check` 放行（现行逻辑没动）。
- **合并队列里也按同样的规则跳过**：`test-selection` 因此也在 `merge_group` 上跑（队列里的 `security-invariants`、`product-subset` 不读它，照旧整套）。它对队列条目用 `--base HEAD^1`，比的是这一条自己的改动。
- **照旧要跑的改动**（`scripts/ci-test-selection.mjs` 的 `NATIVE_RUN_WHEN`；名单宁可宽，不可漏；改名按新旧两个路径都看；删除也算）：`apps/desktop/` 和 `apps/local-host/native/` 下任何文件；任何 `.rs`、`.swift`、`.sh`、`.py`；`.github/workflows/`；`scripts/gates/native-checks.mjs`、`tests/native-checks.test.mjs`、`scripts/ci-test-selection.mjs`、`scripts/script-paths.mjs`；`Cargo.toml`、`Cargo.lock`、`rust-toolchain(.toml)`、`clippy.toml`、`rustfmt.toml`（任何目录）和 `.cargo/`；仓库根目录下不是 Markdown 的文件。其余（文档、spec、原型、产品的 TypeScript、测试、技能）跳过。
- **要加新的触发路径**：改 `NATIVE_RUN_WHEN`，并在 `tests/ci-test-selection.test.ts`（RAC-1766）的清单里写出这个文件；工作流这一半钉在 `tests/ci-queue-verified.test.ts`（RAC-1907）。

| 检查 | 命令 | 范围与说明 |
| --- | --- | --- |
| Rust 格式 | `rustfmt --check` | 所有被跟踪的 `.rs`，按各 crate 的 edition 检查。只接受 `RUST_CRATES` 登记的 `apps/desktop`、`apps/sync-worker` 和 `server/src/sync`，其他位置直接失败 |
| Rust 静态检查 | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | 要编译 crate，所以在 macOS 上跑。CI 用 `RUSTUP_TOOLCHAIN` 固定 Rust 版本（clippy 每个版本都会新增 lint，`-D warnings` 跟着“stable”走会让每次发布变红）；换版本是单独的改动，同一个 PR 里清掉新告警。本机用已装的版本，新版本可能多报 |
| Rust 同步 Worker 与服务端模块 | `cargo clippy --manifest-path apps/sync-worker/Cargo.toml --target wasm32-unknown-unknown --all-targets --locked -- -D warnings` | 对 `server/Cargo.toml` 运行相同命令。使用实际部署的 WASM 编译目标，不回退为本机目标；CI 为同一固定 Rust 版本安装 WASM 标准库，并缓存三个 crate。缺少目标或编译告警均失败。不部署 Worker、不修改 D1 |
| Swift 类型检查 | `swiftc -typecheck -parse-as-library -target <arch>-apple-macosx14.0 JellyMaterial.swift` | 原生素材提取器。每个被跟踪的 `.swift` 都要登记在脚本的 `SWIFT_UNITS`，否则失败 |
| Swift 包构建 | `swift build --package-path apps/local-host/native/materials/whisper`（加 `--package`） | `jelly-whisper` 的 SwiftPM 包，`swift-tools-version: 6.2`（要 Xcode 26），冷编译约 7 分钟，要联网拉 `argmax-oss-swift`。CI 里先作为不挡合并的步骤跑（`continue-on-error`），所以现在挡合并的只有 `JellyMaterial.swift` 的类型检查，`jelly-whisper` 编译坏了不会让 CI 变红。收口记在待办 [BL-122](../../specs/BACKLOG.md)：确认有 Swift 6.2 的 runner（`macos-26` 或装 Xcode 26）后去掉 `continue-on-error` |
| shell | `shellcheck --severity=warning` | 所有被跟踪的 `.sh`，和第一行是 sh/bash 的无后缀文件。告警和错误失败，风格提示不失败 |
| Python | `python3 -I`，`ast.parse` | 被跟踪的 `.py`（现在没有；实验插件的工作进程 2026-10-10 随插件删除）必须能解析；不写 `__pycache__`。只查语法，没有 linter |

工具缺失是退出码 2，不是通过。规则本身在 `tests/native-checks.test.mjs`（纯 `node:test`，不需要装依赖）里各被故意违反一次；本机没有的工具对应的用例会跳过并说明（shell 用例另有一个替身 shellcheck，验证“交了哪些文件、严重度参数、失败的退出码”）。

本机的 Rust 测试 `cargo test` 不在 CI 里：有两个测试用纳秒时间戳给临时目录命名，并行时偶尔撞名（`shelf_http`、`context_directory_files`）。
