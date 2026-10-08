# 门禁数据（tooling/gates）

状态：现行；门禁脚本是 `scripts/check-health-gates.mjs`（入口）、`scripts/gates/`（各门禁的实现），规格在 [specs/repository-anti-corruption](../../specs/repository-anti-corruption/spec.md) §5a。

`pnpm health:check` 与 CI 的「Health gates」步骤读这里的文件。比较的规则、`--base`、`--update`、`--report` 的用法见 `AGENTS.md`「构建与测试」和 `scripts/check-health-gates.mjs` 开头的注释，这里只说有哪些文件，以及两类门禁的口径。

| 路径 | 是什么 | 谁改 |
| --- | --- | --- |
| `baseline.json` | 各项数字的本地快查基线；CI 不读它，只对照 merge-base 比 | `node scripts/check-health-gates.mjs --update --base origin/main`（数字变小时） |
| `limits.json` | 巨大单元与 vendored SDK 的阈值，只许收紧 | 人，过评审 |
| `api/<包>/<subpath>.txt` | contracts 每个 subpath、插件 SDK 的公开 API 快照 | `pnpm api:update`（见下） |
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
