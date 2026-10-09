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
| `emptyCatches` | TypeScript 代码里的空 `catch`：块里既没有语句也没有注释，如 `catch {}`、`catch (error) { }`。块里写了注释的不算（那是写明了的取舍），有任何语句的也不算。不算 promise 的 `.catch(() => {})`（那是回调，不是 catch 子句）和 `finally`。**由静态检查数**（Biome 插件 `tooling/gates/lint/no-empty-catch.grit`，见下面「静态检查」），键和逐文件数字与 W1-04 的语法树计数一致 |
| `emptyCatchesInScripts` | 同一个形状（`catch`、可选的 `( … )`、`{`、只有空白、`}`），在**源码**文件的**字符串和模板字符串**文本里找（测试里的字符串是夹具，不数）。宿主把浏览器程序（工作台、插件的 client 脚本）写成模板字符串，TypeScript 和 lint 都不看里面，普查找到的 141 处空 catch 里有 137 处在这里。**这类算在内**，单独一个计数：把脚本从模板字符串搬进真正的 TypeScript 时，数字从这一项挪到上一项 |
| `unknownCasts` | 经 `unknown` 的双重断言：`value as unknown as T`、`(value as unknown) as T`、`<T><unknown>value`。单独的 `as unknown` 和 `as any as T` 不算。**含测试**（规格 §9.3 的 R-12 口径是含测试的）。**由静态检查数**（`tooling/gates/lint/no-double-cast.grit`），口径同上 |
| `oldNames` | 只数源码，不数测试。旧产品名：单个词 `goalboard`，不分大小写（`GoalBoard`、`goalboard-v1-demo`、`GOALBOARD_HOME`）。旧 id 名：`board_id`、`boardId`、`BoardId`、`BOARD_ID`，含复数，可以是整个名字或长名字的结尾（`conflicting_board_id`、`existingBoardId`），不数别的词里的（`dashboard_id`、`dashboardId`、`DASHBOARD_ID`）。只数这两种写法：`goal-board`（连字符，目标看板视图的样式类和 CSS 容器名）不是旧名，不数；`GOAL_BOARDS_SCHEMA_SQL`（每个项目 `boards` 表的建表语句）也不数，但不是因为它是看板视图，而是它属于另一类「Board 当项目」的旧名（`getBoard`、`initializeBoard` 等，见 `docs/system/GLOSSARY.md` R-A1，改名在路线图 W5-14），这条规则看不到也不守它们。测试不数，因为测试要写出旧名来断言它被拒绝。**看不到的（已知限制，换回来不会被抓）**：连字符写法 `board-id`（#287 之前的 CLI 参数 `--board-id`），以及不在上述源码范围里的文件，如 `examples/draft-goal.json`、`examples/leaf-goal.json`（仍带 `"board_id"`，随根 `package.json` 的 `files` 发布）；要覆盖得按文件类型各写一条规则，不是改正则能做到的。基线里现在保留的例外：派生密钥的盐 `goalboard-feed-secretstore-v1`（`packages/storage/src/adapters/file-secret-store.ts`，那里的注释写明改了字符串会让已有密文失效）、`apps/local-host/src/project-capabilities.ts` 里的局部函数 `checkGoalBoard`、`plugins/native/goals/src` 里两处没用到的 `_boardId`（`document-collection.ts` 的解构改名、`goal-tree-materialization-order.ts` 的参数）。它们和别的计数一样，只能减少 |
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

## 静态检查（Biome）

W1-09。工具是 Biome（根 `biome.jsonc`，锁文件里一个精确版本的 devDependency）；门禁是 `scripts/gates/lint.mjs`，随 `pnpm health:check` 跑，对照 merge-base，口径与上面的「按文件计数」完全一样：每个文件每条规则一个数，新文件从 0 开始，只许减少，PR 里改 `baseline.json`、`--update` 都放不过变大的。只做检查：不开格式化，也不整理 import，所以不会有整仓重排。

**为什么是 Biome，不是 ESLint**：一个二进制，锁文件只多一个包（ESLint 要 eslint、typescript-eslint、解析器一整棵树）；整仓约 2 秒（ESLint 要类型信息的规则得先给七十多个 tsconfig 建程序，还要先 build）；merge-base 没有检出目录可以跑，Biome 能在一个只放被跟踪文件的临时目录里跑，两边用同一份配置量，ESLint 的类型感知规则做不到；仓库自己的两条规则用 GritQL 插件写（`tooling/gates/lint/`），不需要写 JS 插件。代价：没有浮动 promise 的类型检查器级别精度，见「看不到的」。

| 键（baseline.json） | 规则 | 口径 | 关掉的地方 |
| --- | --- | --- | --- |
| `emptyCatches` | 插件 `molis/no-empty-catch` | 块里既没有语句也没有注释的 `catch` 子句。Biome 自带的 `noEmptyBlockStatements` 不用：它还报每个空函数（481 处对 4 处），是另一件事 | 无 |
| `unknownCasts` | 插件 `molis/no-double-cast` | `x as unknown as T`、`(x as unknown) as T`（括号层数不限）、`<T><unknown>x`；单独的 `as unknown`、`as any as T` 不算 | 无 |
| `floatingPromises` | `nursery/noFloatingPromises` | 没有 `await`、没有返回、没有 `.catch`/`.then` 处理、也没写 `void` 的 promise。有意丢掉就写 `void` | 无 |
| `explicitAny` | `suspicious/noExplicitAny` | 显式写出的 `any`（含 `as any`、`Array<any>`）；要用 `unknown` 再收窄 | 无 |
| `consoleCalls` | `suspicious/noConsole` | `console.*` 调用（遗留的调试输出）。宿主里需要日志的地方以后走结构化日志（路线图 W5-13） | `scripts/**`、`apps/cli/**`、`apps/desktop/launchers/**`、`tooling/plugin-cli/**`、`server/tooling/**`：这些程序的工作就是往终端打印 |
| `debuggerStatements` | `suspicious/noDebugger` | `debugger` 语句 | 无 |
| `lintParseErrors` | Biome 的解析错误 | Biome 读不了的文件（每个文件记 1）：读不了就没有任何规则在它上面跑，所以记数而不是悄悄跳过。现在有 `server/tooling/continuity-demo.mts`：`const` 里 `projectId` 声明了两次，是 `board_id` 改名时留下的坏演示脚本 | 无 |
| `lintSuppressions` | `biome-ignore` 注释 | 压制规则的注释本身。每条规则都有不用压制的写法，所以压制也不许增加 | 无 |
| `lintPolicy` | `biome.jsonc` 的形状 | 与 merge-base 的比较：见下面「规则集只许变严」 | |

**扫描范围**：被 Git 跟踪的 `.ts`、`.mts`、`.mjs`，在 `apps`、`horizontal`、`modules`、`packages`、`plugins`、`server`、`tooling`、`tests`、`scripts`、`examples` 之下（不含 `.d.ts`、`dist`、`node_modules`）；`docs/` 里的原型和 `specs/archive/` 不是交付的代码，不查。门禁把这些文件和 `biome.jsonc`、插件文件拷进一个临时目录再跑 Biome，所以结果只取决于被跟踪的文件和锁定的 Biome 版本，在哪台机器、CI 里、merge-base 上都一样，不依赖 `node_modules` 或构建产物。

**规则集只许变严**（`lintPolicy`）：门禁把 `biome.jsonc` 读成一份小摘要（哪条规则在哪里是 error、哪些目录把它关了、排除了哪些文件、有哪些插件），与 merge-base 的摘要比。去掉一条规则、改成 `warn`、给某个目录新关一条规则、新加排除、删掉插件、把全局规则改成只对某个包生效，都失败（不然规则一松，数字就“降”到 0，像是改善）。嵌套的 `biome.json[c]` 一律拒绝（门禁只读根配置）。`biome.jsonc` 里开了一条没有对应计数的规则也失败：先在 `scripts/gates/lint.mjs` 的 `LINT_RULES` 里加计数。

**按包开一条新规则**：不要一次开全仓。先在 `LINT_RULES` 里加计数，再在 `biome.jsonc` 的 `overrides` 里只对一个包把它设成 `error`（`"includes": ["packages/storage/**"]`），该包现有的违规按文件冻结进基线（`--update --base origin/main`），之后每个包清理完或确认没有违规就加进来；全部包都开了之后把规则挪到 `linter.rules` 的顶层并删掉 override。反过来，要对某个目录关一条规则，是 `overrides` 里的一项，写明理由，并且是改门禁本身，要过评审。

**看明细**：`pnpm health:check` 失败时会写出文件和行号。`pnpm lint` 直接跑 Biome（在工作树里原地跑，列出每一处，含基线已接受的；编辑器装 Biome 扩展读同一份 `biome.jsonc`），原地跑能看到临时目录里看不到的（见下）。加一条定义要同时改：`scripts/gates/lint.mjs`（`LINT_RULES`）、`biome.jsonc`、本节的表，并在 `tests/health-gates-lint.test.ts` 里加定义用例和突变用例。

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
| Swift 包构建 | `swift build --package-path apps/local-host/native/materials/whisper`（加 `--package`） | `jelly-whisper` 的 SwiftPM 包，`swift-tools-version: 6.2`（要 Xcode 26），冷编译约 7 分钟，要联网拉 `argmax-oss-swift`。CI 里先作为不挡合并的步骤跑（`continue-on-error`），确认有 Swift 6.2 的 runner 后去掉 |
| shell | `shellcheck --severity=warning` | 所有被跟踪的 `.sh`，和第一行是 sh/bash 的无后缀文件。告警和错误失败，风格提示不失败 |
| Python | `python3 -I`，`ast.parse` | 被跟踪的 `.py`（现在只有 `apps/local-host/tooling/experiments/laya-worker.py`，实验执行器启动的工作进程）必须能解析；不写 `__pycache__`。只查语法，没有 linter |

工具缺失是退出码 2，不是通过。规则本身在 `tests/native-checks.test.mjs`（纯 `node:test`，不需要装依赖）里各被故意违反一次；本机没有的工具对应的用例会跳过并说明（shell 用例另有一个替身 shellcheck，验证“交了哪些文件、严重度参数、失败的退出码”）。

本机的 Rust 测试 `cargo test` 不在 CI 里：有两个测试用纳秒时间戳给临时目录命名，并行时偶尔撞名（`shelf_http`、`context_directory_files`）。
