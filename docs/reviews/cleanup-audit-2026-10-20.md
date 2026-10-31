# 系统清理检查报告（2026-10-20）

状态：只读检查。没有改产品代码、门禁、测试、规格或真实 Home；本报告只记录发现与建议的清理批次。2026-10-20 复查后修订了公开面口径与附录 A；第二轮复查（origin/main、23 个 open PR）见 §11，**P1/P2 的源码删除以 §11 为准，现在先不做**。
检查对象：本地 `main` 的 `c59172ffe` 工作树；`origin/main` 已是 `73ce89eb0`，本地落后 30 个提交（见 §11）。工作树另有 25 处未提交改动（其他会话在做的 macOS 签名、公证文档与评审材料），本报告把它们与代码问题分开记在 §7。
方法：`node scripts/check-package-boundaries.mjs`（`pnpm boundary:check` 的底层脚本）、`node scripts/check-health-gates.mjs`（报告模式与验证模式各一次）、`node scripts/gates/translations.mjs`，再加一个只读的 TypeScript AST 扫描（`.tmp/audit/analyze.mjs`，`.tmp/` 已忽略，不入库）。口径与局限见附录 B。

## 0. 结论

1. **结构健康，门禁没有代码性失败。** 72 个 workspace 包、251 条依赖边，`node scripts/check-package-boundaries.mjs` 0 违规；没有深导入，产品源码里没有跨包相对导入。健康门禁当前唯一失败是 `specs/BACKLOG.md` 指向一份尚未纳入 Git 的文档（两处断链，见 §7），不是代码。
2. **无用代码不多，但公开面很宽。** 产品入口走不到的 6 个文件里，3 个是真正的死文件；不在任何包公开入口上、且定义文件之外没有引用的导出里，54 个完全没人用（28 个运行时值、26 个类型），540 个只在本文件里用（可以收回 `export`）；另有 **约 1,251 个公开导出在生产代码里没有消费者**（去掉 `packageDescriptor` 约定后 1,136；静态口径的上限），这是“入口太宽”，不是死代码；4 个 workspace 依赖没有被包内代码导入；`plugins/official-integrations/web-query` 整包是登记在案的非产品包。
3. **重复实现集中在少数几类，不是大面积复制。** 逐字相同的函数体 8 组：`canonicalize` 7 份、路由 `handle` 6 份、`ledgerDatabase` 2 份、`writeResponse` 2 份、`deletionRecord` 2 份、`reopenCompletion` 2 份、`resolveSourceFaults` 2 份、Alchemist 的 idea 映射 2 份；小工具同名/同用途实现 `isRecord` 14 处、`parseJson` 11 处、`unique` 16 处。翻译词典是最大的冗余体：47 本、10,261 条，2,472 个死键、192 个冲突、476 个重复键。
4. **边界债主要已经在冻结清单和迁移线里，不能靠删几行解决。** 10 个构建期装配插件、9 个 `<plugin>-native-plugin-http.ts`、20 处 `registerProvider`、4 个 hybrid 插件、187 处 typed capability、381 处插件包外点名、10 条层间例外、8 个 Module Repository 导出、11 个宿主 `export *`。每一项都有门禁只许下降，清理应按 `specs/repository-anti-corruption` 与 W4/W5 的片推进，而不是临时开一条线。
5. **先做三件低风险的事，收益最大。** ① 删 3 个死文件、54 个无引用导出、4 个未用依赖；② 把 `canonicalize` 收进 Plugin SDK，顺带处理 `parseJson`/`isRecord` 中最值得的两三个；③ 修工作树卫生：469 MB 未忽略的 Jelly 构建产物、57 个可清理的 worktree、两处断链。

### 0.1 复查：修正了什么、置信度

这版经过一次复查。第一版只把 `packages/contracts` 与 `packages/plugin-sdk` 当成公开面，把其他包 `index.ts` 转出的导出也算成“定义文件之外没人引用”，所以 75 / 743 / 842 三个数字偏大。复查把每个包 `package.json` 的 `exports`（含 `export *` 链）都算作公开面后，得到 54 个死导出、540 个仅文件内使用、1,251 个公开面无生产消费者。复查同时补查了外部依赖（没有明确未使用的；两个看似未用的分别经动态 `resolve` 启动子进程和作为 `@prologue/sdk` 的传递依赖保留）、包元数据三处（4 个插件的 capabilities 不一致）、测试 fixture（1 个明确没人用）与工具链 `.mjs` 消费者（13 个公开导出因此从“无消费者”里移出）。

置信度按结论分：

| 结论 | 置信度 | 依据 / 还差什么 |
| --- | --- | --- |
| 边界门禁通过、依赖边 251、无深导入 | 高 | `node scripts/check-package-boundaries.mjs` 直接输出；可重跑 |
| 健康门禁数字与两处断链 | 高 | 官方门禁脚本；验证模式输出只有两处断链 |
| 逐字重复的 8 组函数体 | 高 | 去注释、压空白后的函数体哈希；已逐组看过位置和大小 |
| 翻译 2,472 死键 / 192 冲突 | 高 | 官方 `translations.mjs` 的输出 |
| 3 个死文件 | 高 | 可达性分析加人工 `git grep`；加载路径、vitest 配置、QA 脚本已排除 |
| 54 个完全无引用的导出 | 中高 | 文本级 + 二次全仓扫描；其中 2 个只在 specs 出现；动态反射风险低但不为零 |
| 540 个仅文件内使用的导出 | 中高 | 同上；批量去掉 `export` 前仍要逐包 `tsc` |
| 1,251 个公开面导出没有生产消费者 | 中 | 静态 import 观察，含类型导出；是“上限”不是精确删除数；不含模板字符串里的动态引用 |
| 6 个“入口走不到”的文件分类 | 中 | 入口根靠约定；3 个已人工确认，3 个保留（worker / vitest / QA） |

没有覆盖：CSS/DOM 选择器是否还有页面在用（要浏览器探针）、数据库表/列、动作 id 的实际调用、Rust/Swift、运行时反射与拼出来的动态 import、页面资产与字体、真实 Home、全量构建与全量测试、CI 的 `--base origin/main` 完整比较。下面的批次都按“先验证再删”写。

## 1. 现状规模

| 项 | 数量 |
| --- | ---: |
| workspace 包 | 72（6 app、10 foundation、14 module、9 horizontal、26 native plugin、6 integration、1 tooling） |
| 产品源码（`src`，不含测试） | 约 2,280 个 `.ts`/`.mts`、约 30.9 万行 |
| 根 `tests/` | 1,180 个测试文件、约 22.4 万行 |
| 包内测试（Alchemist 的 vitest） | 27 个测试文件、约 3,400 行 |
| 包依赖边 | 251 |
| 合同公开子路径 | 64（外加根入口） |
| 公开 API 快照 | 66 个文件、2,656 条声明 |

包的大小分布很不均：`apps/local-host` 约 5.4 万行、`apps/workbench` 约 4.4 万行，而 18 个包不到 800 行（`web-query` 54 行、`youtube` 136 行、`apps/cli` 170 行……）。小包大多是按事实所有权拆出来的，不建议只按行数合并；真正该讨论的是 §4.3 的“整包没有产品调用方”。

## 2. 门禁快照

本节数字是本地 `c59172ffe` 的快照；`origin/main` 的对应数字见 §11.1，合入前以新 main 为准。

本轮 `node scripts/check-health-gates.mjs` 以已提交的 `tooling/gates/baseline.json` 比较：除了 §7 的两处断链，没有增长项；`--report` 的数字如下（“10-16”列来自 `docs/reviews/anti-corruption-review-2026-10-16.md`，只作趋势参考）。

| 数字 | 当前 | 10-16 | 说明 |
| --- | ---: | ---: | --- |
| 巨大单元 | 127 | 144 | 已拆掉 17 个；其中 4 个登记为例外，123 个待拆 |
| 测试引用包内部 | 483 | 495 | 239 个测试文件 |
| 源码兼容标记 | 9 | 9 | 6 个文件 |
| 旧名（`goalboard`、`board_id`） | 3 | 3 | 3 个文件 |
| 合同包纯度（长函数等） | 6 | 6 | 6 个条目 |
| 宿主入口 `export *` | 11 | 11 | 1 个文件 |
| 层间例外 | 10 | 10 | 9 条 app 启动器边 + 1 条 Shelf→Module |
| Module Repository/Store 导出 | 8 | 21 | 已明显下降 |
| typed 宿主能力 | 187 | 190 | 24 个条目 |
| 宿主插件专属文件 | 16 | 30 | 16 个文件 |
| `registerProvider` 调用 | 20 | 24 | 13 个文件 |
| hybrid 插件 | 16 处 / 5 条 | 16 处 / 5 条 | 4 个插件 |
| 插件包外点名 | 381 | 419 | 26 个条目 |
| 翻译冲突键 | 192 | 192 | 47 本词典 |
| 翻译死键（只报告） | 2,472 | 2,423 | **增加 49**，见 §5.4 |
| 错误子类 | 28 | 28 | 28 个文件 |
| 按错误自选 HTTP 状态 | 87 | 87 | 24 个文件 |
| 显式 `any` | 491 | 515 | 149 个文件 |
| `as unknown as` | 179 | 188 | 113 个文件 |
| 未处理的 Promise | 3 | 3 | 2 个文件 |
| `console` 调用 | 28 | 88 | 17 个文件 |
| TypeScript 空 `catch` | 3 | 4 | 3 个文件 |
| 浏览器脚本空 `catch` | 130 | 136 | 50 个文件 |
| 浏览器程序里的裸 `fetch` | 63 | 88 | 33 个文件 |
| 根目录越界文件 | 0 | 0 | — |
| 入库 `.impeccable` 文件 | 318 / 31 组 | 318 / 31 组 | 全部仍有文档或测试引用，见 §7 |
| vendored Prologue SDK | 1 | 1 | 上限 2 |

结论：门禁在下降，但仍有 123 个巨大单元、483 处测试内部引用、381 处插件包外点名等“只能减”的存量。清理 PR 只要不新增这些数字，就不会被门禁挡住。

## 3. 无用代码

### 3.1 产品入口走不到的文件

以下是本地 `c59172ffe` 的 6 个；`origin/main` 是 7 个，多 `apps/local-host/src/artifact-line-head.ts`（见 §11.1）。

从包入口、app 启动器、根脚本里的 esbuild 入口出发做可达性分析，2,280 个产品源文件里有 6 个走不到。逐个核对后的判定：

| 文件 | 行数 | 判定 |
| --- | ---: | --- |
| `server/src/auth.ts`（已于 PR #896 删除） | 4 | **死文件**：只是 `ImAuth`/`ImSession` 的兼容别名，没有任何包、测试或脚本导入，也没有从 `server/src/index.ts` 转出 |
| [`plugins/native/alchemist/src/studio/shared/contracts/bootstrap.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/bootstrap.ts#L1) | 68 | **死文件**：5 个 DTO（`DirectionDto`、`IdeaCardDto`、`ExplorationDto`、`IdeaSummaryDto`、`BootstrapDto`）没有任何引用 |
| [`plugins/native/alchemist/src/studio/shared/contracts/job.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/job.ts#L1) | 16 | **死文件**：两个 zod schema 与 `JobEventDto` 都没有引用 |
| [`packages/plugin-sandbox/src/worker.ts`](../../packages/plugin-sandbox/src/worker.ts#L1) | — | 保留：由 [`runner.ts`](../../packages/plugin-sandbox/src/runner.ts#L71) 按路径复制进沙箱，不是 import 入口 |
| [`plugins/native/alchemist/vitest.config.ts`](../../plugins/native/alchemist/vitest.config.ts#L1) | — | 保留：CI 的 `pnpm --filter …alchemist test` 用它 |
| [`server/tooling/continuity-demo.mts`](../../server/tooling/continuity-demo.mts#L1) | — | 保留：手工 QA 脚本，不属于产品入口 |

另有一个“只被测试走得到”的入口：[`apps/local-host/cloudflare/worker.ts`](../../apps/local-host/cloudflare/worker.ts#L1) 是单独的 Cloudflare Worker 部署入口（有自己的 `wrangler.jsonc`），不是死代码。

### 3.2 导出与公开面

以下数字是本地 `c59172ffe` 的快照；`origin/main` 为 55 / 556 / 约 1,266（见 §11.1）。

口径：一个导出只要能从某个包的 `package.json` `exports` 入口（含 `export *` / `export {…} from` 链）走到，它就是那个包的公开面。公开面没有消费者是“API 太宽”，不是死代码；两者要分开处理。按这个口径，非 `packages/contracts` / `packages/plugin-sdk` 的包分三层：

| 类别 | 数量 | 处理 |
| --- | ---: | --- |
| 不在公开面，定义文件之外没有任何引用 | 594 | 其中 54 个完全没人用、540 个只在本文件用 |
| 在公开面，生产代码没有消费者 | 1,251（上限） | 去掉 `packageDescriptor` / `MolisWorkPackageDescriptor` 约定后 1,136；再去掉 `test-kit` 与 `apps/server` 后 1,109；其中 328 个只有测试用（调整后 282）。收窄入口，不直接删定义 |
| 在别的文件里出现过名字、但没有 import | 145 | 动态访问或同名，不能当死代码 |

54 个完全没用的导出（28 值 + 26 类型）里，Alchemist 的 `shared/contracts/*` 占 38 个；其余是 `apps/local-host`（6）、`modules/goals`（4）、`apps/workbench`（3）、`packages/contracts`（1）、`plugins/native/feed`（1）、`apps/mcp`（1）。完整清单见附录 A。其中 `v1PayloadTool` 与 `renderPluginRailAccountFooter` 只在 `specs/` 里出现，后者已被现行 spec 点名为“没有调用方”；其余 52 个在代码、脚本、测试和文档里都没有引用。

公开面没有消费者的 1,251 个导出，最大的包是 `apps/local-host` 130、`plugins/native/coding` 101、`packages/design-system` 83、`plugins/native/feed` 51、`modules/shelf` 48、`plugins/native/goals` 47、`apps/workbench` 42（去掉三个约定项后的口径）。它们主要来自各包 `index.ts` 的 `export *`；宿主入口的 11 个 `export *` 已有门禁数字，插件和应用的入口没有同样的数字。建议先收窄 `apps/local-host` 与 `plugins/native/coding` 两个包，把入口改成显式导出，再逐包做；不要一次改 1,000 多个。

### 3.3 未使用的 workspace 依赖

| 包 | 依赖 | 现状 | 建议 |
| --- | --- | --- | --- |
| `apps/workbench` | `@molis-ai/molis-work-im-ui` | 包内没有导入；`im-ui` 由 `apps/local-host/src/im-server.ts` 使用 | 删除；先确认发布打包不靠它 |
| `apps/local-host` | `@molis-ai/molis-work-plugin-cognia` | 包内没有导入；Home 运行时插件由 Workbench 的目录条目装配 | 删除；先确认打包清单 |
| `apps/local-host` | `@molis-ai/molis-work-plugin-images` | 同上 | 同上 |
| `apps/local-host` | `@molis-ai/molis-work-plugin-jelly` | 同上 | 同上 |

`apps/local-host` 的三项在 `native-plugin-release-artifact.ts` 里可能按包名被 esbuild 解析，但那条路径只服务 `project-plugins.ts` 里明确启动的插件（characters、shelf、coding、files、diff、git、text-stats、dataset、form、lingguang、ppt），不含 cognia、images、jelly。删之前跑一次 `pnpm package:npm` 的打包检查即可。

外部依赖也按同一口径扫了一遍，没有明确未使用的：`@larksuiteoapi/lark-mcp` 经 `createRequire.resolve` 启动子进程（静态 import 看不到），`@tauri-apps/api` 是 `@prologue/sdk` 的传递依赖、安装器要求每个 `dependencies` 可解析，`@types/*` 映射到对应运行时包后都有导入。

### 3.4 整包没有产品调用方

- `plugins/official-integrations/web-query`：54 行、1 个文件。除自己的文件和登记表外，没有代码、脚本或测试按包名引用它，根 `package.json` 的依赖里也没有；Feed 的 `web_query` 来源由 [`plugins/native/feed/src/source-request.ts`](../../plugins/native/feed/src/source-request.ts#L1) 自己处理。`specs/repository-anti-corruption/spec.md` §5.2 已把它判为“非产品”，`specs/action-architecture/migration.md` 里“它驱动 Feed 来源服务”的说法与代码不符。
  - **建议**：删除整包，或明确写下“保留为未来外部集成骨架”的理由。删除会改动包数量（72→71），要同步 `scripts/workspace-packages.mjs`、SSOT §5.1 的表、`.github/CODEOWNERS`、根 `package.json`、`pnpm-lock.yaml`，并跑 `node scripts/gates/package-inventory.mjs --table`。这是一次需要用户确认的边界变更，不放进普通清理 PR。
- `apps/server`（约 180 行）与 `packages/test-kit`（约 1,180 行）也是“非产品”，但都是有意的：前者是独立的跨设备测试启动器，后者是测试工具。不要按“没人 import”删除。

## 4. 边界

### 4.1 通过的部分

- `node scripts/check-package-boundaries.mjs`：72 个包、2,283 个源文件、10,351 条 import、251 条依赖边，`errors: []`。
- 产品源码里**没有**深导入（`@…/src/...`）和跨包相对导入；测试里只有 2 处跨包相对导入（见 §4.3）。
- 没有依赖环；每个包有公开入口、README、独立 build/typecheck 和合同声明。
- 表所有权门禁通过：没有包直接读写别人的表；`events`、`idempotency_records` 的共写是登记过的例外。

### 4.2 冻结的边界债

这些数字由 `pnpm health:check` 对照 merge-base 守住，只许减少。它们不是“违规”，是正在还的债；清理不能新增，也不该在普通清理 PR 里顺手改门禁。

| 项 | 当前 | 含义 / 迁移方向 |
| --- | ---: | --- |
| 构建期装配的内置插件 | 10 | `alchemist`、`artifacts`、`feed`、`goals`、`inbox`、`pages`、`plugin-builder`、`schedule`、`sessions`、`workflows`；迁到 Plugin Runtime（[`tests/builtin-plugin-assembly-gate.test.ts`](../../tests/builtin-plugin-assembly-gate.test.ts#L45)） |
| 宿主里的插件 HTTP 文件 | 9 | `<plugin>-native-plugin-http.ts`；应改为插件 Manifest 的 routes（同文件 L51） |
| 宿主插件专属文件合计 | 16 | 上面 9 个加 7 个 `<plugin>-actions.ts` |
| `registerProvider` | 20 处 / 13 文件 | 构建期装配的入口；Runtime 插件不应再有 |
| hybrid 插件 | 4 | `characters`、`coding`、`git`、`shelf`：Runtime 启动，宿主又手工装配（`tests/builtin-plugin-assembly-gate.test.ts#L127`） |
| typed 宿主能力 | 187 / 24 条 | 2026-10-07 N-12：对外只走动作，不再新增 typed 条目 |
| 层间例外 | 10 | 9 条 app→app 启动器边 + `plugins/native/shelf → modules/shelf` |
| Module Repository/Store 导出 | 8 | `modules/feed`、`functions`、`private-work-context`、`shelf` 的 8 个公开项；Repository 应只对内 |
| 宿主入口 `export *` | 11 | [`apps/local-host/src/index.ts`](../../apps/local-host/src/index.ts#L40)；每个新 helper 都会变成公开面 |
| 插件包外点名 | 381 / 26 个内置插件 | 加一个插件要改的地方；目标 0（W4-01） |
| 合同包纯度 | 6 | `packages/contracts` 里 6 个 20 行以上的解析函数；应搬去所有者 |
| 测试引用包内部 | 483 | 239 个测试文件直接 import 包内实现；只许减少 |

`hybrid` 里的 characters 还叠加了 2026-10-08 的决定 26：它长期不再是 Runtime 插件，代码要并进宿主或某个 Module。Sessions（`work`）按 BL-177 这一轮只清理、不长期保留，所以 `BUILD_TIME_ASSEMBLED` 里的 `sessions` 也应在清理完成后删掉。

### 4.3 具体的边界问题

1. **Alchemist 的测试跨包拿源码。** [`plugins/native/alchemist/tests/work-reuse/fixture.ts`](../../plugins/native/alchemist/tests/work-reuse/fixture.ts#L9) 用相对路径直接 import `modules/artifacts/src/index.js`、`modules/context-ledger/src/index.js`，还 import 了根 `tests/fixtures/alchemist-output.js`；但 Alchemist 的 `package.json` 没有声明这两个 Module 的依赖。它现在能跑，是因为 vitest 从源码解析路径。改法：加 `devDependencies`，按包名从公开入口 import；或者把 fixture 移进共享测试工具。这是测试侧的边界债，生产代码没有同类问题。
2. **`server/src/auth.ts` 是残留的兼容别名。** 没有调用方、没有从入口转出，删掉即可；它不影响公开合同。
3. **`web-query` 整包非产品。** 见 §3.4。
4. **依赖版本不一致。** `@types/better-sqlite3` 在根是 `^9.6.0`、在 Alchemist 是 `^7.6.13`（运行时 `better-sqlite3` 是 12.8.0）；`node-pty` 一处 `^1.1.0`、一处 `1.1.0`；`marked` 一处 `18.0.11`、一处 `^18.0.11`。前两项值得统一，后两项只是写法差异。
5. **`im-server.ts` 的旧账已经不在代码里。** 本轮核对 `apps/local-host/src/im-server.ts` 只调用 `server` 包的 `Identity`/`ServerEvents`/`ContinuityService`/`createImDomain`，没有再直接读 `mw_projects`/`mw_members`；这两张表只在 `server/src`（表的主人）里读写。如果 SSOT 还写着 W2-06 未完成，可以更新那一句；不要按旧记录去改代码。
6. **包元数据有三份，校验方向不对称。** `scripts/workspace-packages.mjs` 的登记表、`package.json` 的 `molis-work` 块、`src/index.ts` 的 `packageDescriptor` 各写一遍；`checkWorkspacePackages` 会检查登记表到另外两处的一部分字段，但不检查另外两处多出来的 `capabilities`。当前 4 个插件的声明多出未登记项：`characters.actions.v1`、`schedule.actions.v1`、`schedule.conversation-tasks.v1`、`shelf.actions.v1`（以上 descriptor 与 `package.json` 都有）和 `workflows.actions.v1`（只有 descriptor 有）。先定哪一份是权威：若登记表是权威，删掉这些旧能力名；若它们仍是现行能力，补进登记表。不要三处各改一处。
7. **公开面比消费者宽。** 见 §3.2：非 contracts/SDK 的包约有 1,251 个公开导出在生产代码里没有消费者，最大的是 `apps/local-host` 130 与 `plugins/native/coding` 101。这不是死代码，是入口设计；先收窄 `index.ts` 的显式导出，再删定义。
8. **`gmail` 的 `./history-cursor` 子路径没有外部调用方。** 包内只有 `provider.ts` 从它 import，仓里没有代码或测试按 `@molis-ai/molis-work-integration-gmail/history-cursor` 导入；`GmailFixtureCursor` 又是这个子路径里唯一没人用的导出。若它不是留给外部测试的，删掉这个 `exports` 子路径比只删一个类型更彻底；先确认没有仓外消费者。
9. **开发脚本绕过包入口。** `scripts/preview-agent-studio.mts`、`scripts/preview-contextual-interaction.mts`、`scripts/studio-replay/stand-in.mts` 等直接 import `apps/local-host/src/*`、`apps/workbench/src/*`、`plugins/native/pages/src/*` 的实现文件；`scripts/ai-interaction-slice/*` 直接 import `packages/design-system/src/*`。产品源码没有这类导入（§4.1），这些是开发工具的耦合，不影响运行时，但内部重构会先把它们弄坏。如果这些预览/回放脚本要长期保留，应改成按包名从公开入口 import；如果只是一次性工具，归入 §7 的清理决定。

## 5. 重复实现与冗余

### 5.1 逐字相同的函数体

按“去注释、压空白后的函数体哈希”比较，跨文件、至少 8 行且 250 字符以上的重复共 8 组：

| 重复体 | 位置 | 大小 | 建议 |
| --- | --- | ---: | --- |
| `canonicalize` | `modules/goals` 3 份 + `plugins/native/goals` 4 份（`modules/goals/src/command-support.ts:86`、`plugins/native/goals/src/goal-tree-check.ts:106` 等） | 299 字符 × 7 | 收进 Plugin SDK，作为共享的规范化 JSON 工具；两处变体（`canonicalizeValue`、`proposal-baselines.ts`）一起评估 |
| 路由 `handle` | [`apps/local-host/src/functions-http/routes.ts:66`](../../apps/local-host/src/functions-http/routes.ts#L66)、[`plugins/native/feed/src/routes.ts:69`](../../plugins/native/feed/src/routes.ts#L69)、`inbox`、`pages`、`schedule`、`shelf` 各一份 | 435 字符 × 6 | 抽成 SDK 的通用路由表（`createRouteTable` 一类）；或先做宿主/插件内的共享 helper，避免改公开 API |
| `ledgerDatabase` | [`apps/local-host/src/assistant/assistant-relations.ts:16`](../../apps/local-host/src/assistant/assistant-relations.ts#L16)、[`apps/local-host/src/placement-actions.ts:39`](../../apps/local-host/src/placement-actions.ts#L39) | 485 字符 × 2 | 抽到宿主内一个 `context-ledger-database.ts`；两处都有 `as unknown as`，顺手消掉 |
| `writeResponse` | `apps/local-host/src/inbox-native-plugin-http.ts:54`（已随 FI-7 删；Schedule 入口已随 SYS-15 迁到 Runtime） | 285 字符 × 2 | 合并进已有的 `native-plugin-http.ts`，作为“可返回 HTML 的 JSON 响应” |
| `deletionRecord` | `modules/projects/src/repository.ts:452`、`modules/projects/src/project-service.ts:223` | 330 字符 × 2 | 一个 mapper 导出给另一个用 |
| `reopenCompletion` | `modules/goals/src/event-state-agreement.ts:192`、`event-state-effects.ts:567` | 427 字符 × 2 | 同一 Module 内收成一份 |
| `resolveSourceFaults` / `resolveRssSourceFaults` | `plugins/native/feed/src/connector-sync.ts:196`、`source-sync.ts:279` | 301 字符 × 2 | 同一插件内收成一份 |
| `mapIdeaCard` / `mapCard` | `plugins/native/alchemist/src/studio/server/db/exploration-repository.ts:220`、`idea-repository.ts:266` | 838 字符 × 2 | 同一插件的两个 Repository 共用一个映射器 |

### 5.2 小工具重复

| 工具 | 定义数 | 典型位置 | 评价 |
| --- | ---: | --- | --- |
| `isRecord` | 14 | 宿主、合同包、SDK、Kernel、若干插件 | 一行守卫，收益小；只在顺带改动时统一，不建议单独开 PR |
| `parseJson` | 11 | `modules/artifacts`、`modules/goals`、`modules/governance-collaboration`、宿主安装器等 | 都是“带 fallback 的 JSON.parse”；可考虑进 SDK 或 storage 的公共小工具 |
| `unique` | 16 | `modules/goals`、`governance-collaboration`、`functions`、`shelf` 等 | 大多是 `[...new Set()]` 的包装，收益小 |
| `nullableText` | 12 | 宿主与 Module 的 SQL 行映射 | 可在数据库适配层统一 |
| `ownCogniaStores` | 7 | `cognia`、`dataset`、`form`、`lingguang`、`ppt`、`todo`、`workflows` 的 `store.ts` | 逐字相同；可做插件 SDK 的私有存储 helper |
| `immediate` | 4 | `dataset`、`form`、`lingguang`、`ppt` 的 `store.ts` | 逐字相同；和上一条一起处理 |
| `requestHash` | 4 | `plugins/native/goals` 的 `goal-tree-check.ts`、`goal-tree-decision.ts`、`goal-tree-submission.ts`、`proposal-baselines.ts` | 逐字相同；和 `canonicalize` 一起收进 SDK |

优先级：`canonicalize` > `parseJson` > `ownCogniaStores` > 其余。前两个有真实的“同输入不同结果”风险；后几个只是代码体积。

### 5.3 路由与响应脚手架

- 9 个宿主 `<plugin>-native-plugin-http.ts` 里，`inbox` 与 `schedule` 的行集合相似度 65%，`feed` 与它们约 32%；`pages` 与 `workflows` 约 21%。这说明它们是同一套“查路由表、解参数、写响应”的脚手架，差异主要在插件特定的 handler。
- 10 个插件 `routes.ts` 的相似度在 24%–34%，主要是同一套路由表构造与匹配逻辑。逐字相同的 `handle` 已列在 §5.1。
- 这组重复不宜按文件合并（每个插件的路由仍归自己），适合抽一个通用的路由表与响应 helper；抽的时候要和 `bindPluginActionRoute` 的现有分工对齐，避免出现第三套路由机制。

### 5.4 翻译词典

`node scripts/gates/translations.mjs` 的当前数字：

- 47 本词典、10,261 条、9,479 个不同键；476 个键在不止一处定义。
- 2,472 个死键（源码里没有任何字面量调用提到它）；其中 `apps/workbench/src/i18n/en.ts` 一本占 1,740 个，其次是 `assistant-en.ts` 72、`gap-en.ts` 71、`plugins/native/goals/src/context-en.ts` 66。
- 192 个冲突键（同一中文键译成不同英文）；按主人统计，工作台 161、Goals 17、Shelf 18（同一冲突键可能计入多个主人，三项之和大于 192）。
- 工作台用了 1,343 个由其他主人词典定义的键，Goals 用了 436 个；这是跨主人词典的耦合，也是 W5-03/BL-118 “词典按主人分”要解决的东西。

死键只报告、不挡合并，所以从 10-16 的 2,423 涨到了 2,472。清理建议按既有计划做：先上稳定键与按主人分词典（BL-118/W5-03），再删死键；不要先按中文键名手删，动态键会误伤。

### 5.5 测试 harness

- 根 `tests/` 的 1,180 个文件里，50 个文件各自定义了 `request` 一类 HTTP 助手，39 个定义了 `post`；915 处直接 `fetch(`。
- `@molis-ai/molis-work-test-kit` 只被 28 个测试文件使用；`/local-host-http` 与 `/browser` 已经在用，但测试家目录、授权、请求助手仍有大量各自实现。
- 测试侧另有 1 个明确没人用的 fixture：[`tests/fixtures/artifact-browser.ts`](../../tests/fixtures/artifact-browser.ts#L1)（没有测试 import，也没有按路径启动）；其余 18 个“孤立”helper 是子进程入口或手工脚本，不是死代码。
- 这与“测试引用包内部 483 处”是同一类债：测试自己搭了太多宿主脚手架。清理方向不是删测试，而是把重复的 Home/HTTP/浏览器夹具迁进 `packages/test-kit`（SSOT 已记“时钟、fake capability 与其余重复 harness 待迁移”）。这是独立的一条工作线，建议不要和产品死代码混在一个 PR。

### 5.6 SQL 与数据

- `SELECT COALESCE(MAX(seq), 0) AS cursor FROM events WHERE project_id = ?` 在 `modules/goals`、`modules/governance-collaboration`、`packages/storage` 各有 1 份；`events` 与 `idempotency_records` 的共写已登记在 [`tooling/gates/table-owners.json`](../../tooling/gates/table-owners.json)。登记的理由是依赖方向（Module 只依赖 contracts，不能 import storage），后续方向是宿主注入 journal 端口；在那之前不要把这条当成新发现去改。
- 没有发现整文件逐字重复的源码（25 行以上的规范化文件哈希为 0 组）。

## 6. 结构质量债

这些不是“死代码”，但与清理相邻，做清理时不要新增：

- **巨大单元 127 个**，123 个待拆。最大的几个：`apps/workbench/src/i18n/en.ts` 3,323 行、`assistant-island.ts` 2,254、`craft-finish.ts` 2,136、`tab-workspace.ts` 1,993、`assistant-service.ts` 1,868 行（类 `AssistantService` 1,515 行、91 个方法）。计划与批次见 [`docs/system/HUGE-CLASS-MIGRATION.md`](../../docs/system/HUGE-CLASS-MIGRATION.md)。
- **错误模型**：28 个 `extends Error` 子类，87 处按错误测试自己选 HTTP 状态。新错误码应写 `defineErrorCodes`，类别到状态只留在 `packages/plugin-sdk/src/errors.ts` 一处；28 个子类里有 8 个在 Alchemist、2 个在 catalog、2 个在 contracts，是最集中的清理面。
- **兼容标记 9 处 / 6 文件**：`plugin-builder/installed.ts` 3 处、`plugin-runtime/src/index.ts` 2 处、两个 PDF worker 的 `pdfjs-dist/legacy` 导入、`i18n/en.ts` 里的 backfill 文案、Goals 的 legacy cleanup 注释。前两项是真正的兼容路径，后几项多半只是用词。
- **旧名 3 处**：`file-secret-store.ts` 的 `goalboard-feed-secretstore-v1` 盐值、Goals 两个未使用的 `_boardId` 参数。盐值改名会让旧密钥读不出来，不能当普通死代码删；`_boardId` 可以直接删。
- **浏览器脚本债**：130 个空 `catch`（Coding 10、`tab-workspace` 9、Shelf 8+8……）、63 处裸 `fetch`、129 个以 `*_SCRIPT` 模板字符串形式存在的浏览器程序、100 个文件。这是 W4-04/W5-04 的打包与类型检查线，不是本轮能顺手清的。
- **静态检查**：491 个显式 `any`、179 个 `as unknown as`、3 个未处理 Promise、28 个 `console`。都按文件只许下降；清理时按包做，不要用一个 PR 扫全仓。

## 7. 工作树与仓库卫生

当前工作树：3 个已修改文件、22 个未跟踪条目。它们大多是其他会话在做的 macOS 签名/公证工作（BL-354/355）和历史评审材料，**不要动**。

| 项 | 现状 | 建议 |
| --- | --- | --- |
| 健康门禁 | 以已提交基线比较，只失败两处：`specs/BACKLOG.md:186`、`:188` 指向 `docs/releases/APPLE-INDIVIDUAL-ACCOUNT.md`，该文件尚未被 Git 跟踪 | 与签名工作的负责人确认：把文档连同 `apps/desktop/tooling/entitlements/`、`sign-macos-runtime.sh` 一起提交；或在文档落地前先删掉 BACKLOG 的两条链接。不修的话，`pnpm health:check` 会一直红 |
| `plugins/native/jelly/native/` | 469 MB `whisper/.build` + 3.3 MB 两个 `bin/`，**没有被 `.gitignore` 忽略**，`git status` 里是未跟踪目录 | 确认是 `swift build` 产物后加进 `.gitignore`（或该目录自己的 `.gitignore`），并在 README 写重建命令；不要误提交 |
| worktree | 125 个，其中 57 个 prunable；`.claude/worktrees` 占 33 GB | `git worktree prune` 清元数据；目录删除要与其他会话协调，不要删还在用的工作树 |
| 未跟踪的评审/设计材料 | `work/codex-audit-archive-20261013.json`、`.grok/logic-sweep-2026-10-07.md`、`docs/design/folio-component-board/`（1.1 MB）、`docs/reviews/` 下 13 份历史审计 | 由各自的 owner 决定：入库为评审记录、移进 `docs/archive/`，或删除；不要留在根目录和未跟踪状态 |
| `.impeccable/` | 318 个文件、31 组，全部仍被 spec、文档或测试引用 | 本轮不删；要减就先改引用，再按组删 |
| 根目录 | 0 个越界跟踪文件 | 保持 |
| 文档 | `specs/BACKLOG.md` 新增了 BL-354/355/356（签名与账号迁移） | 与签名工作一起提交，顺带修 §7 的断链 |

注意：`git status` 里的 `apps/desktop/tooling/*.sh` 修改、`entitlements/`、`APPLE-INDIVIDUAL-ACCOUNT.md` 是同一组在途工作，不属于本报告的清理范围；改它们会打断别的会话。

## 8. 建议的清理批次

按“风险从低到高、每批可独立验收”排。所有批次都遵守：一次只跑一个构建；改过源码先 `pnpm build`；不并发改 `package.json`、`skills/`；全量回归期间不动源码。

### P0：工作树卫生（不改产品源码，建议先做）

1. 修 `specs/BACKLOG.md` 的两处断链：把 `docs/releases/APPLE-INDIVIDUAL-ACCOUNT.md` 纳入 Git，或暂时删掉两条链接。与签名工作的负责人确认，避免覆盖对方改动。
2. 给 `plugins/native/jelly/native/` 加忽略规则（确认是构建产物后），记录重建命令。
3. `git worktree prune`；列出可删的 57 个 prunable 工作树，交给各会话确认后删除。
4. 决定 `work/`、`.grok/`、`docs/design/folio-component-board/`、13 份未跟踪审计的去留。

**验收**：`node scripts/check-health-gates.mjs` 退出 0；`git status` 只剩有意的在途改动。

### P1：纯死代码删除（**暂停**，先看 §11；当前只剩 `server/src/auth.ts` 可安全做）

> 下面的 54 个和 540 个是本地快照；在当前 23 个 open PR 合入前不要按这个清单删。现在只做第 1 条，其余等 §11.5 的重新分类。

1. 删 `server/src/auth.ts`。
2. 删 Alchemist 的 `shared/contracts/bootstrap.ts` 与 `job.ts`；如果 `shared/contracts` 里还有只被这两个文件用的 DTO，一起删。
3. 删附录 A 的 54 个无引用导出（按包分 commit 更好审）；对 540 个“只在本文件使用”的导出，按包去掉 `export`。
4. 删 4 个未使用的 workspace 依赖；删完跑一次 `pnpm install --offline` 与 `pnpm package:npm` 的打包检查。
5. 处理 `web-query`：如果决定删，单独一个 PR，按 §3.4 同步包清单、SSOT、CODEOWNERS、锁文件；如果保留，在 README 和 SSOT 写明“保留原因”。

**验收**：`pnpm build`、`pnpm boundary:check`、`node scripts/affected-tests.mjs` 选出的相关用例、`node scripts/check-health-gates.mjs --base origin/main`；如果动了 contracts/SDK 的公开面，再跑 `pnpm api:update` 与 `pnpm test:contracts`。

### P2：重复实现收口（中风险，**等当前 23 个 PR 合入后再做**，见 §11）

> 下面列的文件都在 Goals、local-host、插件路由或视觉线的在途分支里；先做会冲突。

先单独做一批“公开面收窄”：`apps/local-host` 与 `plugins/native/coding` 的 `index.ts` 改成显式导出，按包统计真实消费者；约 1,251（本地）/1,266（origin/main）是上限，逐包做，不要全仓一次。这一批只改入口，不删除定义，和下面的重复收口分开审。

1. `canonicalize` → Plugin SDK：加一个纯函数、单元测试、`pnpm api:update`；迁移 9 处（先 7 处逐字相同的，再评估两处变体）。SDK 是共享核心，按共享核心跑全量。
2. `ledgerDatabase` → 宿主一个共享文件；`deletionRecord`、`reopenCompletion`、`resolveSourceFaults`、Alchemist 的 idea mapper 各自在包内收成一份。
3. `writeResponse` → `native-plugin-http.ts`；路由 `handle` → 先设计一个 SDK 路由表 helper，若涉及公开合同就按 `docs/system/CONTRACT-CHANGES.md` 评审，不要临时改 6 个插件。
4. `parseJson`、`ownCogniaStores`/`immediate`：收益中等，放在 P2 后段；`isRecord`/`unique`/`nullableText` 只在顺带改到相关文件时统一。
5. 修 Alchemist 测试的跨包相对导入：加 `devDependencies`、改包名入口，或把 fixture 移进 `test-kit`。

**验收**：逐包 `pnpm --filter <包> run build`、相关测试、`pnpm boundary:check`；SDK 变更再跑全量与 API 快照。

### P3：按既有迁移线推进（不要临时开新线）

| 线 | 当前 | 去向 |
| --- | ---: | --- |
| 巨大单元拆分 | 123 个待拆 | `docs/system/HUGE-CLASS-MIGRATION.md` 的 W5-10 批次，一个包一个 PR |
| 构建期插件 → Plugin Runtime | 10 个 | W4/W5 迁移；每迁一个，删对应的 `<plugin>-native-plugin-http.ts`、`<plugin>-actions.ts`、`registerProvider` 行 |
| typed capability → 动作 | 187 | N-12；按 `apps/local-host/src/project-capabilities.ts`、`horizontal/agent-host/src/capability-registration.ts` 分片 |
| 翻译死键/冲突 | 2,472 / 192 | BL-118/W5-03：稳定键、按主人分词典，再删死键 |
| 错误模型 | 28 子类 / 87 状态 | BL-221：`defineErrorCodes`，类别→状态只留 SDK 一处 |
| 测试内部引用 | 483 | 逐包把测试改到公开入口；`test-kit` 承接重复 harness |
| 浏览器脚本 | 130 空 catch / 63 裸 fetch / 129 个 `*_SCRIPT` | W4-04/W5-04 打包与类型检查线 |

这些线的共同点是：都要改门禁数字或有公开合同影响，不能混在“删死代码”里。按 `docs/system/PARALLEL-DEVELOPMENT.md` 排时段，一次只跑一个构建。

## 9. 不建议动的部分

- `packages/contracts` 与 `packages/plugin-sdk` 的公开导出：仓内没人用是正常的，它们是给外部插件作者的 API；删之前按 `docs/system/CONTRACT-CHANGES.md` 判断。
- 各插件 `manifest.ts` 的声明：manifest 本来就是声明式重复（每个插件自己写自己的），不是可合并的逻辑。
- 只被测试使用的导出：公开面里约 328 个导出只有测试用（调整口径后 282 个），其中很多是测试缝；修法是把测试改到公开入口，而不是直接删导出。
- 插件 `routes.ts`/宿主 HTTP 文件的相似结构：在 Plugin Runtime 迁移完成前，它们是冻结的构建期形状；单独合并文件会绕过装配门禁。
- `.impeccable/`：318 个文件全部仍被引用；先改引用再删，不要直接删目录。
- 在途的 macOS 签名/公证改动：不属于本轮，见 §7。

## 10. 验收命令

在干净的工作树上，按改动范围选：

```bash
pnpm boundary:check
node scripts/check-health-gates.mjs                 # 以已提交基线比较
node scripts/check-health-gates.mjs --base origin/main  # 推送前 / CI 口径
node scripts/affected-tests.mjs                     # 选相关用例
node scripts/run-tests.mjs <相关文件…>
pnpm build                                          # 改过 src/package.json 后、全量前
pnpm api:update                                     # 只有动 contracts/SDK 公开面时
pnpm actions:update                                 # 只有动动作/Manifest 时
pnpm page-assets:check                              # 只有动宿主下发的页面资源时
```

全量回归按 `AGENTS.md` 与 `docs/system/PARALLEL-DEVELOPMENT.md`：一次一个构建、不并发跑浏览器用例、失败先用干净基线工作树比对。

## 11. 第二轮复查：origin/main、在途 PR 与“不该删”清单

### 11.1 参照版本变了

第一版基于本地 `main` `c59172ffe`。复查时 `origin/main` 已是 `73ce89eb0`，本地落后 **30 个提交**；#837（Goals 事件确认）、#870（材料服务）、#847（Pages 迁 Runtime）、#840（内置插件自登记）、#857（项目库 L1a）、#826（Coding 装配）、#812/#797/#776（Runtime 授权）等已经在远端，但不在本地树里。

在临时工作树按 `origin/main` 重跑同一套扫描：

| 项 | 本地 c59172ffe | origin/main 73ce89eb0 |
| --- | ---: | ---: |
| 产品源文件 | 2,281 | 2,329 |
| 测试文件 | 1,313 | 1,343 |
| 完全无引用的导出（不在公开面） | 54 | **55**（多 `apps/local-host/src/artifact-line-head.ts:artifactLineHead`；其余 54 个相同） |
| 仅文件内使用（不在公开面） | 540 | **556** |
| 公开面无生产消费者 | 约 1,251 | **约 1,266**（去约定 1,151；再去 test-kit/apps-server 1,124；test-only 338/292） |
| 公开面最大包 | local-host 130 / coding 101 / design-system 83 | local-host 131 / coding 101 / design-system 83 / workbench 43 / plugin-runtime 34 |
| 产品入口走不到的文件 | 6（3 个死文件） | **7**（多 `apps/local-host/src/artifact-line-head.ts`，也是死文件；artifact/material 线活动，见 §11.3） |

结论：**候选集合本身是稳定的**（55 个里 54 个与本地相同），但 §2 的门禁数字、公开面的包分布和“可删”结论要以 `origin/main` 为准；合入前还要在新的 main 上再量一次。

### 11.2 当前在途的工作

截至 2026-10-20，仓库有 **23 个 open PR**，主要分四组：

- **视觉 UX 一批**（#851、#861、#864、#866、#868、#869、#871、#873、#874、#876、#880、#884、#885、#886、#888）：workbench、design-system、助理侧栏、Coding 与 Diff 界面。`apps/workbench/src/side-view-document.ts` 直接被 #864/#851 改。
- **项目库 / 插件库**（#857 已合、#867、#881、#883）：`apps/local-host` 的项目库与 Home 插件库、`modules/goals` 的 S8、Feed/Schedule/Coding 的数据库声明、Alchemist 测试夹具。
- **Runtime 迁移与授权**（#853 Workflows、#848 插件动作委托、#840 注册表、#847 Pages）：宿主里的 `*-native-plugin-http.ts`、`*-actions.ts`、`registerProvider` 正在被替换。
- **文档/CI**（#836、#784、#734）：不改产品代码。

此外还有未开 PR 的活动分支（`feature/anti-corruption-*`、`feature/visual-ux-*`、`receipts/*`、`context/*`、`feat/computer-use-*`）在改同一批文件。

### 11.3 不该删的清单

置信度：**高** = 有 open PR、现行 spec 或未合入提交的直接证据；**中** = 只有同包活动/间接证据，删前要 owner 确认。

本表是 2026-10-20 的快照：各行的“为什么现在不能删 / 再删的时点”写的是当时的状态，之后合入的改动不回改本表；要删时按各行的证据和现行 spec 重新核一遍。

| 候选 | 为什么现在不能删 | 证据 | 再删的时点 | 置信度 |
| --- | --- | --- | --- | --- |
| Alchemist 的 38 个死导出、`bootstrap.ts`、`job.ts` | Studio 的 `/bootstrap`、任务事件、ALC-LIFE/ALC-RES 和 Runtime 迁移仍在做；这些 DTO 是同一接口层的类型，今天没被 import 不等于接口不再要 | `specs/repository-anti-corruption/spec.md` W5-01 ALC-LIFE/ALC-RES；`plugins/native/alchemist/src/studio/server/api/action-routes.ts:28`；#867 改 Alchemist 测试夹具 | Alchemist Runtime/ALC-RES 合入、owner 确认后 | 高 |
| `gmail/history-cursor.ts`、`GmailFixtureCursor`、`./history-cursor` 子路径 | W2-18-GMAIL/P1 正在修“每页只留 25 个、超过的增量永久跳过”；这个文件/子路径是活动文件，不是死文件 | `specs/repository-anti-corruption/spec.md:3428`；未合入的 `5c4aa66f2`、`a0d442b86` 改过它 | W2-18-GMAIL 合入后，只删确实没用的类型，不删子路径 | 高 |
| Goals 的 4 个死导出、`GoalEventSystemOperation` | #881 正把 Goals 项目库改成声明式、四个动作升 v2；#837 已合入 origin/main；Goals 错误模型分支也改这些文件 | open PR #881；origin/main `ed090054e`；未合入的 `40b601a5f` | #881 与 Goals 错误模型线合入后 | 高 |
| `apps/local-host` 的 7 个死导出 | #867/#883/#881 都在改 local-host 的项目库、插件库与装配；材料服务、Computer Use、Onboarding、Connector 也各自有在途分支改这些文件 | open PR #867/#883/#881；未合入的 `1741b3b9c`、`391a983fd`、`5768d93ec` | 这一批 PR 合入后，逐文件确认 | 高 |
| `apps/workbench` 的 3 个死导出 | 15 个视觉 UX PR 正在改 workbench；`sideViewKeys` 所在文件被 #864/#851 直接改；`renderShelfSettingsContribution`/`ArrivalShell` 附近的页面还在视觉线里 | open PR #851/#864 等；未合入的 `a754b1b8f`、`fbb90b892` | 视觉线合入后；`renderPluginRailAccountFooter` 已被 spec 点名无调用方，可随那一批删 | 高 |
| Feed 的投影死导出 | #867 正改 Feed 的数据库、索引与注册；投影层与它们同包 | open PR #867 | #867 合入后 | 高 |
| `apps/mcp/src/tool-schemas.ts:v1PayloadTool` | #881 正改 `apps/mcp` 的 Goals 工具与分发；MCP 工具 schema 是同一块 | open PR #881 | #881 合入后，由 MCP owner 确认 | 中 |
| Jelly 的 `ownJellyStores` 等公开面无消费者导出 | 当时不删：`ownJellyStores` 已被 spec 记为死导出，但 Jelly 的 Runtime/数据库迁移（#743、PG-023）当时还在进行；它当时算公开面无消费者，不是 §3.2 的 54 个死导出 | `specs/repository-anti-corruption/privileges.md` PG-023；#743 | 已做（PG-023；`ownJellyStores` 到 T-194 #1492，2026-10-29 才删） | 中 |
| plugin-builder 的 `parseBuilderJson`、`BUILDER_PROJECT_PLUGIN_ID`（公开面无消费者） | 创作台/Studio 仍在线上，manifest 与 agent validation 还在改 | `specs/repository-anti-corruption` 的 Studio 线；open PR 无直接冲突，但属于活动包 | Studio 迁移/收口后 | 中 |
| `packages/design-system` 的 `validatePluginComponentNodes`（公开面无消费者） | 视觉 UX/设计系统 15 个 PR 正在改；组件校验属于这条线 | open PR #851/#861/#864 等 | 视觉线合入后 | 高 |
| RSS 的 3 个公开面无消费者导出 | 没有 open PR 直接改，但 integration 目录仍在维护；低优先，不是“绝对安全” | `plugins/official-integrations/rss/README.md`、SSOT 官方集成行 | 找 RSS owner 确认后 | 中 |
| `plugins/official-integrations/web-query` 整包 | SSOT 与 context-toolbar 把它列为官方集成；它是“非产品”骨架，不是普通死代码。删它会改包数量、SSOT §5.1、CODEOWNERS 与文档 | `docs/SSOT-MATRIX.md:161`；`specs/context-toolbar/spec.md:203,384`；`specs/repository-anti-corruption/spec.md:1610,1630` | 产品明确不要这个集成时，单独一个边界变更 PR | 高 |
| `apps/server` | 决定 #4 是保留并继续迭代；跨设备测试在用；它是非产品，但不是死代码 | `specs/repository-anti-corruption/spec.md` 决定 #4 | 产品决定放弃跨设备/服务器时 | 高 |
| `packages/test-kit` | SSOT 记着“时钟、fake capability 与其余重复 harness 待迁移”；它是迁移目标，不是清理对象 | `docs/SSOT-MATRIX.md` test-kit 行 | 测试 harness 迁移完成后 | 高 |
| `packages/im-ui` 与 `server` | 右栏“讨论”是现行功能；context-program F12 还要 im-ui 加输入落点与外部引文 | 决定 #4；`specs/context-program/spec.md:204,247` | 讨论/IM 功能改版后 | 高 |
| Sessions（`work`、`private-work-context` 的相关部分） | BL-177 明说这一轮只清理、以后重做；整包/整功能删除会打断重做 | `specs/BACKLOG.md` BL-177 | 清理片合入、重做需求书经用户审后 | 高 |
| Characters | 决定 26：长期要并进宿主或某个 Module，不再作为长期 Runtime 插件；现在删代码会打断迁移 | `specs/repository-anti-corruption/spec.md` 决定 26 | 合并进宿主/Module 的那一片 | 高 |
| 构建期插件装配（`*-native-plugin-http.ts`、`*-actions.ts`、`registerProvider`、catalog 条目） | #853 正在迁 Workflows，Pages 已由 #847 迁走，注册表已由 #840 改；其余按 W4/W5 迁移。先删会绕过装配门禁 | open PR #853；origin/main #847/#840；`tests/builtin-plugin-assembly-gate.test.ts` | 每个插件迁移完成时，随该 PR 删 | 高 |
| `tests/fixtures/artifact-browser.ts` | 它本身没人 import，但 artifact 测试仍在跑，#881 还改 `tests/artifact-browser.test.ts`；等 artifact 线合入后再判断 | open PR #881；`specs/archive/artifact-positioning/spec.md` | artifact 线合入后 | 中 |
| `scripts/preview-*.mts`、`studio-replay` | 视觉/创作台/回放线在用；它们是开发工具，不是死代码 | `specs/ai-development-handbook/spec.md`、`docs/platform/STUDIO-SKILL-REPLAY.md` | 工具被替换时 | 高 |
| `.impeccable/` 318 个文件 | 全部仍被 spec、文档或测试引用；删一组要先改引用 | §7；`scripts/gates/impeccable-files.mjs` | 引用清零后 | 高 |
| `plugins/native/jelly/native/` | 469 MB 是 Swift 构建产物；要加忽略规则，不是删除源码 | §7 | 只加 `.gitignore`，不删产物 | 高 |
| 4 个未使用依赖 | `workbench → im-ui` 可能被 context-program F12 重新需要；local-host 的三个插件依赖要先确认发布打包 | §3.3；`specs/context-program/spec.md:204` | 对应功能 PR 合入 + 打包检查后 | 中 |
| 公开面收窄（`apps/local-host` 131、`plugins/native/coding` 101、`packages/design-system` 83、`apps/workbench` 43、`packages/plugin-runtime` 34 等） | 23 个 open PR 正在加新导出（#883/#867/#881/视觉线）；现在收窄会和它们冲突 | §11.2 | 这一批合入、在新 main 上重测公开面后 | 高 |
| 重复实现（`canonicalize`、路由 `handle`、`ledgerDatabase`、`writeResponse` 等） | 这些文件正在被 Goals、local-host、插件路由的在途分支改；先收口会制造冲突 | §5.1；open PR #867/#881/#853 | 当前 PR 波次合入后，一个工具一个 PR | 高 |

### 11.4 现在可以安全做的

- **`server/src/auth.ts`**：4 行兼容别名，没有 open PR、没有活动分支、没有 spec 依赖；全仓 grep 只命中定义处。可以单独一个删除 PR。
- **P0 卫生**：`git worktree prune`、给 `plugins/native/jelly/native/` 加忽略规则、决定未跟踪审计材料的去留；这些不动产品源码。
- 两处断链要等签名/公证文档的负责人把那组文件提交，或由用户决定先删 BACKLOG 链接；不要单方面改别人的在途文档。

**置信度**：`server/src/auth.ts` 高（没有 open PR、活动分支或 spec 依赖，全仓 grep 只命中定义处）；P0 卫生高（不改产品源码）；两处断链的修法中（依赖签名/公证文档的负责人）。

### 11.5 推荐顺序（替换 §8 的 P1/P2 顺序）

1. **先不合入任何源码删除**，让当前 23 个 PR 合并或关闭；这期间只做 P0 卫生。
2. 以新的 `origin/main` 为基线，重跑本报告的门禁、边界与死代码扫描；把 55 个死导出、556 个仅文件内使用、约 1,266 个公开面导出重新分类。
3. 再删“没有被任何合入 PR 碰过”的那部分；先 `server/src/auth.ts`，其余按包，一个包一个 PR，每步跑 `pnpm --filter <包> run typecheck` 与相关用例。
4. 公开面收窄放在功能 PR 之后，先 `apps/local-host` 与 `plugins/native/coding`，再按包。
5. 重复实现收口最后做；先等 Goals/local-host/插件路由的在途分支合入。

**置信度**：origin/main 与本地 54/55 的集合几乎相同，说明“哪些是死代码”这一层是稳的；不稳的是“现在能不能删”，答案由在途 PR 决定。23 个 open PR 的文件交集与未合入分支的提交是判断依据，PR 合入/关闭后要重算。§2 的门禁数字与 §4 的边界债仍来自本地 `c59172ffe`，没有在 origin/main 上重跑 `pnpm health:check --base`；合并前要在新 main 上补这一次。

## 附录 A：54 个完全无引用的导出

口径：不在任何包的 `package.json` `exports` 公开面上，且定义文件之外没有任何引用；测试与脚本里的文本也算引用。这是本地 `c59172ffe` 的 54 个；`origin/main` 多一个 `apps/local-host/src/artifact-line-head.ts:artifactLineHead`（见 §11.1）。删前仍建议对每个名字做一次 `git grep`。

**plugins/native/alchemist**（38）

| 导出 | 文件 | 值/类型 |
| --- | --- | --- |
| `rejectActionProposal` | [`plugins/native/alchemist/src/studio/domain/calibration/calibration.ts`](../../plugins/native/alchemist/src/studio/domain/calibration/calibration.ts) | 值 |
| `TargetRef` | [`plugins/native/alchemist/src/studio/domain/kernel/revision.ts`](../../plugins/native/alchemist/src/studio/domain/kernel/revision.ts) | 类型 |
| `annotationParamsSchema` | [`plugins/native/alchemist/src/studio/shared/contracts/annotation.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/annotation.ts) | 值 |
| `AnnotationDto` | [`plugins/native/alchemist/src/studio/shared/contracts/annotation.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/annotation.ts) | 类型 |
| `BootstrapDto` | [`plugins/native/alchemist/src/studio/shared/contracts/bootstrap.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/bootstrap.ts) | 类型 |
| `ConversationMessageDto` | [`plugins/native/alchemist/src/studio/shared/contracts/conversation.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/conversation.ts) | 类型 |
| `decisionParamsSchema` | [`plugins/native/alchemist/src/studio/shared/contracts/decision.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/decision.ts) | 值 |
| `DecisionsSurfaceDto` | [`plugins/native/alchemist/src/studio/shared/contracts/decision.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/decision.ts) | 类型 |
| `directionIdParamsSchema` | [`plugins/native/alchemist/src/studio/shared/contracts/direction.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/direction.ts) | 值 |
| `ExplorationGeneration` | [`plugins/native/alchemist/src/studio/shared/contracts/exploration.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/exploration.ts) | 类型 |
| `IdeaCardDraft` | [`plugins/native/alchemist/src/studio/shared/contracts/exploration.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/exploration.ts) | 类型 |
| `KeepIdeaResponse` | [`plugins/native/alchemist/src/studio/shared/contracts/idea.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/idea.ts) | 类型 |
| `ideaCardParamsSchema` | [`plugins/native/alchemist/src/studio/shared/contracts/idea.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/idea.ts) | 值 |
| `ideaVersionParamsSchema` | [`plugins/native/alchemist/src/studio/shared/contracts/idea.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/idea.ts) | 值 |
| `jobEventsParamsSchema` | [`plugins/native/alchemist/src/studio/shared/contracts/job.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/job.ts) | 值 |
| `jobEventsQuerySchema` | [`plugins/native/alchemist/src/studio/shared/contracts/job.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/job.ts) | 值 |
| `JobEventDto` | [`plugins/native/alchemist/src/studio/shared/contracts/job.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/job.ts) | 类型 |
| `memoryRuleParamsSchema` | [`plugins/native/alchemist/src/studio/shared/contracts/memory.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/memory.ts) | 值 |
| `MemoryWorkspaceDto` | [`plugins/native/alchemist/src/studio/shared/contracts/memory.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/memory.ts) | 类型 |
| `TasteRuleDto` | [`plugins/native/alchemist/src/studio/shared/contracts/memory.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/memory.ts) | 类型 |
| `PlaybookRuleDto` | [`plugins/native/alchemist/src/studio/shared/contracts/memory.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/memory.ts) | 类型 |
| `ActionProposalDto` | [`plugins/native/alchemist/src/studio/shared/contracts/memory.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/memory.ts) | 类型 |
| `updatePulseSourceRequestSchema` | [`plugins/native/alchemist/src/studio/shared/contracts/pulse.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/pulse.ts) | 值 |
| `opportunityParamsSchema` | [`plugins/native/alchemist/src/studio/shared/contracts/pulse.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/pulse.ts) | 值 |
| `PulseWorkspaceDto` | [`plugins/native/alchemist/src/studio/shared/contracts/pulse.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/pulse.ts) | 类型 |
| `PulseRunDto` | [`plugins/native/alchemist/src/studio/shared/contracts/pulse.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/pulse.ts) | 类型 |
| `PulseReportDto` | [`plugins/native/alchemist/src/studio/shared/contracts/pulse.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/pulse.ts) | 类型 |
| `OpportunityDto` | [`plugins/native/alchemist/src/studio/shared/contracts/pulse.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/pulse.ts) | 类型 |
| `SupplySignalDto` | [`plugins/native/alchemist/src/studio/shared/contracts/pulse.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/pulse.ts) | 类型 |
| `SourceSettingDto` | [`plugins/native/alchemist/src/studio/shared/contracts/pulse.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/pulse.ts) | 类型 |
| `lensParamsSchema` | [`plugins/native/alchemist/src/studio/shared/contracts/research.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/research.ts) | 值 |
| `startLensRunRequestSchema` | [`plugins/native/alchemist/src/studio/shared/contracts/research.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/research.ts) | 值 |
| `ideaResearchParamsSchema` | [`plugins/native/alchemist/src/studio/shared/contracts/research.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/research.ts) | 值 |
| `RuntimeModelDto` | [`plugins/native/alchemist/src/studio/shared/contracts/research.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/research.ts) | 类型 |
| `ResearchPlanDto` | [`plugins/native/alchemist/src/studio/shared/contracts/research.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/research.ts) | 类型 |
| `LensRunDto` | [`plugins/native/alchemist/src/studio/shared/contracts/research.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/research.ts) | 类型 |
| `LensReportDto` | [`plugins/native/alchemist/src/studio/shared/contracts/research.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/research.ts) | 类型 |
| `EvidenceDto` | [`plugins/native/alchemist/src/studio/shared/contracts/research.ts`](../../plugins/native/alchemist/src/studio/shared/contracts/research.ts) | 类型 |

**apps/local-host**（6）

| 导出 | 文件 | 值/类型 |
| --- | --- | --- |
| `COMPUTER_PROVIDER_ID` | [`apps/local-host/src/computer/computer-record-source.ts`](../../apps/local-host/src/computer/computer-record-source.ts) | 值 |
| `liveConnectorIds` | [`apps/local-host/src/connector-directory.ts`](../../apps/local-host/src/connector-directory.ts) | 值 |
| `normalizeTrailingNewline` | [`apps/local-host/src/installer/runtime-config-text.ts`](../../apps/local-host/src/installer/runtime-config-text.ts) | 值 |
| `materialImageExtensions` | [`apps/local-host/src/material-native.ts`](../../apps/local-host/src/material-native.ts) | 值 |
| `readMaterialPublicSource` | [`apps/local-host/src/material-source-reader.ts`](../../apps/local-host/src/material-source-reader.ts) | 值 |
| `withoutPersonalSpace` | [`apps/local-host/src/personal-space.ts`](../../apps/local-host/src/personal-space.ts) | 值 |

**modules/goals**（4）

| 导出 | 文件 | 值/类型 |
| --- | --- | --- |
| `sameTypeDefinition` | [`modules/goals/src/event-facts-validation.ts`](../../plugins/native/goals/src/module/event-facts-validation.ts) | 值 |
| `resolveDecisionEffects` | [`modules/goals/src/event-state-authorization.ts`](../../plugins/native/goals/src/module/event-state-authorization.ts) | 值 |
| `decisionCoversScope` | [`modules/goals/src/event-state-authorization.ts`](../../plugins/native/goals/src/module/event-state-authorization.ts) | 值 |
| `contractInputFromGoal` | [`modules/goals/src/goal-contract-records.ts`](../../plugins/native/goals/src/module/goal-contract-records.ts) | 值 |

**apps/workbench**（3）

| 导出 | 文件 | 值/类型 |
| --- | --- | --- |
| `ArrivalShell` | [`apps/workbench/src/arrival/shell.ts`](../../apps/workbench/src/arrival/shell.ts) | 类型 |
| `renderPluginRailAccountFooter` | [`apps/workbench/src/settings-directory.ts`](../../apps/workbench/src/settings-directory.ts) | 值 |
| `sideViewKeys` | [`apps/workbench/src/side-view-document.ts`](../../apps/workbench/src/side-view-document.ts) | 值 |

**apps/mcp**（1）

| 导出 | 文件 | 值/类型 |
| --- | --- | --- |
| `v1PayloadTool` | [`apps/mcp/src/tool-schemas.ts`](../../apps/mcp/src/tool-schemas.ts) | 值 |

**packages/contracts**（1）

| 导出 | 文件 | 值/类型 |
| --- | --- | --- |
| `GoalEventSystemOperation` | [`plugins/native/goals/src/contract/goal-event-state.ts`](../../plugins/native/goals/src/contract/goal-event-state.ts)（PG-111 起；原在 `packages/contracts/src/modules/`） | 类型 |

**plugins/native/feed**（1）

| 导出 | 文件 | 值/类型 |
| --- | --- | --- |
| `isActiveAttention` | [`plugins/native/feed/src/application-projection.ts`](../../plugins/native/feed/src/application-projection.ts) | 值 |

合计：54 个。其中 `v1PayloadTool`、`renderPluginRailAccountFooter` 只在 `specs/` 里出现过（后者已被现行 spec 点名为“没有调用方”），其余在代码、脚本、测试和文档里都没有引用。

## 附录 B：口径与局限

**做了什么**

- `node scripts/check-package-boundaries.mjs`：包边界、依赖方向、公开入口、依赖环。
- `node scripts/check-health-gates.mjs`（报告模式）：全部只减数字与结构项。
- `node scripts/check-health-gates.mjs`（验证模式，以已提交基线比较）：当前唯一失败是两处断链。
- `node scripts/gates/translations.mjs --owners --dead`：翻译冲突、死键、跨主人复用。
- 只读 AST 扫描：2,281 个产品源文件、22,829 条 import/export 记录（含工具链 `.mjs` 消费者）；从包 `exports`、app 启动器、根脚本 esbuild 入口、worker 入口出发做可达性；按文件解析导出（含 `export *`/`export {…} from` 的追踪）；对每个导出用全仓标识符索引判断是否有外部提及；对函数体做去注释、压空白后的哈希，找跨文件逐字重复；对 25 行以上的源文件做整文件规范化哈希。

**看不到的**

- 没有类型检查器和跨文件数据流；“无引用”是文本级判断，动态拼出的名字、`Reflect`、字符串路由、模板字符串里的浏览器脚本都看不到。
- import 图扫了 `apps`、`horizontal`、`modules`、`packages`、`plugins`、`server`、`tooling` 的 `.ts`/`.mts`/`.tsx`，加根 `tests/`、包内测试、`scripts/`、各包 `tooling/` 与 `examples/` 的 `.mjs`；判断“有没有人提到”时另扫了全部 tracked 文本（含 `.md`、`.json`）。但不解析 Rust/Swift，也排除 `apps/desktop/src-tauri/resources/` 下的 vendored 运行时。
- 测试与工具链 `.mjs` 被当作“使用者”：只被它们引用的导出不会进“54 个无引用”；只被测试用的会进 §3.2 的公开面统计。
- 工作树包含其他会话的未提交改动；本报告没有改动它们，也没有在真实 Home 上运行任何东西。
- 没有跑整体构建、全量测试、浏览器用例或 `--base origin/main` 的完整健康门禁；这些留给执行清理的 PR。

**数字的复现**

本轮数字来自 `c59172ffe` 的工作树。门禁数字以 `node scripts/check-health-gates.mjs --report` 为准；包边界以 `node scripts/check-package-boundaries.mjs` 为准；死代码与重复的候选清单由本轮只读脚本生成，脚本与中间结果在 `.tmp/audit/`（已忽略，不入库）。合并前以 CI 的 `--base` 结果为准。
