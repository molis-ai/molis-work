# 代码防腐审查（2026-10-16）

审查提交：`dfc81998a9cc17834034a254234ca18e2787fa4f`（短名 `dfc81998a`，2026-10-16 05:50:00 +0000）。
提交说明：`feat(plugins): input ports declare their default source in their own Manifest (W4-03 slice 1) (#565)`。
写入时的 `main`：`1cbe75f2d26590d73762f962350062a5250941e7`。此后四笔不在本次测量里：`cbf2341c5`（#568）、`0367ad33a`（#558，Form 页面改由类型检查过的 TypeScript 打包）、`9c75ff8e7`（#560）、`1cbe75f2d`（#572，规格 §10.15）。行号、门禁计数和文件长度都对 `dfc81998a`。规格 §10.15 是对另一批 PR 的独立复查，和本文分开。

测量：在该提交上运行 `node scripts/check-health-gates.mjs --base origin/main --report`。当时 HEAD 与 `origin/main` 相同，合并基线就是 `dfc81998`，这次是该提交对自己的只减比较。进程退出码 0。输出里没有 grew、FAIL 或 increased。

这次只读。没有改产品代码、门禁、规格或测试，没有跑全量产品测试、浏览器产品走查，也没有打开真实 Home。本地健康门禁退出码 0 是这次测量，远端 CI 对这个提交的结果另计。命名测试只核对名字在该提交的树上，没有执行。

清单按 category、scenario、feature、path 分组，137 项全部勾选。每一项是 pass，或点名下面的发现。F-15 没有使用。

## 总结论

树上仍有未关闭的防腐项。第 4 到第 6 波没有做完，RAC-19 开放（F-01）。RAC-01 在「获批计划并且样板已经合入」这一支上通过：Form 已由 Plugin Runtime 启动，其余 17 个构建期插件是获批计划里冻结的剩余部分。RAC-03 开放（F-39）：`docs/system/EXTENSION-POINTS.md` 第 37–51 行为 15 个方向写了路径，第 238–243 行的演练次数仍高于各自目标，方向 3、6、7、9、12、13 仍写「无切片」，第 299 行写明 X-1 到 X-7 在写进路线之前不算承诺。

只减家族在这一提交上全部等于基线。等于基线表示这一次比较没有增长。

## 只减健康门禁家族

限额（`tooling/gates/limits.json`，并印在健康报告第 3 行）：文件 800 行，类 300 行，类方法 25，函数 150 行，vendored Prologue SDK 2 份。

| 家族 | 裁决 | 这一提交的计数 | 基线 | 发现 |
| --- | --- | --- | --- | --- |
| giant units | partial | 144（16 class both，18 class lines，5 class methods，30 file，75 function）；登记例外 4；其余 140 待拆 | 144 | F-03 |
| test-internal imports | partial | 495，245 个文件 | 495 | F-04 |
| same-package source/build splits | pass | 0（健康报告原文：Packages test processes load from both source and build: 0 in 0 files） | 0 | — |
| compatibility markers | partial | 9，6 个文件 | 9 | F-05 |
| in-place schema patches | pass | 0 | 0 | — |
| old names | partial | 3，3 个文件 | 3 | F-06 |
| browser-script empty catches | partial | 136，52 个文件 | 136 | F-07 |
| raw fetch in browser programs | partial | 88，45 个文件；本次退出码 0，工作台必须为 0 | 88 | F-08 |
| error subclasses | partial | 28，28 个文件 | 28 | F-09 |
| error-code shape | pass | 0（不是 `<owner>.<reason>` 的错误码：0） | 0 | — |
| hand-chosen HTTP statuses | partial | 87，24 个文件 | 87 | F-10 |
| error-code ownership | partial | 前缀违规 0。所有者表：57 个 owner，覆盖 1625 个源文件，另有 429 个文件无人拥有 | 违规 0 | F-11 |
| typed host capabilities | partial | 190，24 条 | 190 | F-12 |
| hand assembly counts | partial | `registerProvider` 24 处、13 个文件；宿主插件文件 30；混合插件 16 处、5 条（characters、coding、git、shelf） | 均等于基线 | F-13 |
| translation conflicts | partial | 冲突键 192（基线 192）。缺英文 0。死键 2423 只报告、不失败 | 192 | F-14 |
| public API snapshots | pass | 64 个快照文件，2475 条声明 | — | — |

同一次运行里，这些门禁为 pass：debugger 0，lint 解析错误 0，biome-ignore 0，根目录越界 0，vendored Prologue SDK 份数 1（上限 2），每个 `specs/` 根目录都有状态行，文档引用没有断链。显式 `any` 515（F-16），`as unknown as` 188（F-17），未等待的 Promise 3（F-18），console 88（F-19），TypeScript 空 catch 4（F-20），合同纯度 6（F-21），宿主入口 `export *` 11（F-22），层例外 10（F-23），模块仓库导出 21（F-24），插件包外点名 419（F-25）。验收编号是只报告项：30 份规格里 15 份有编号，373 条标准里 34 条被测试引用，305 个问题（F-26）。

## RAC-01 到 RAC-19

RAC-01：pass。标准是「内置只剩 Plugin Runtime」，或者「获批迁移计划并且样板已经合入」。样板 Form 已合入。`tests/builtin-plugin-assembly-gate.test.ts` 的 `RUNTIME_ASSEMBLED`（第 27–36 行）把 `form` 映到 `@molis-ai/molis-work-plugin-form`。`apps/local-host/src/project-plugins.ts` 第 16 行导入 `createFormPlugin`，第 204–206 行以 `database: FORM_DATABASE` 启动它。`plugins/native/form/src/plugin.ts` 在树上。`apps/local-host/src/form-actions.ts` 与 `form-native-plugin-http.ts` 不在树上。`BUILD_TIME_ASSEMBLED`（第 42–47 行）还有 17 个 id，含 `todo`，不含 `form`：alchemist、artifacts、cognia、dataset、feed、goals、images、inbox、jelly、lingguang、pages、plugin-builder、ppt、schedule、sessions、workflows、todo。这 17 个是获批计划里冻结的剩余部分，记为 F-01。迁移文档的状态句是 F-40。规格书 §12.4 第 1892 行仍写「Form 样板未合，8/18」，那一句是 F-41。

RAC-02：open finding F-02。`scripts/replay-plugins.mjs` 与 `plugins/native/probe` 不在树上。`docs/system/CONTRACT-CHANGES.md` 第 56 行写明回放工具现在还没有。

RAC-03：open finding F-39。判据是扩展点清单和它的演练。`docs/system/EXTENSION-POINTS.md` 第 2 节方向表第 37–51 行写下 15 个方向。方向 1 的「现在」是 11（另有 2 处按需；外加 2），目标是 1（外加 2），路径写着 W3-06、W4-03、W5-02、W5-06 加 X-1，并写 W4-04 先做样板。方向 5（第 41 行）现在 0、目标 0，已达到。方向 3（第 39 行，公开来源型）、方向 6（第 42 行，设置）、方向 7（第 43 行，标题栏）、方向 9（第 45 行，记忆）、方向 12（第 48 行，外部 Agent Runtime）、方向 13（第 49 行，界面插槽）仍写「无切片」。方向 10（第 46 行）的路径仍是「表登记靠 W4-11、X-5」；W4-11 的 Home 登记已经在代码里，这一行的「现在」仍是 6（有项目库表 7），目标 4，路径还在。演练表第 238–243 行没有在方向 1 改成 11 之后重测：F1 现在 12（带 AI 建议时 13），外加 2，目标 1，外加 2；F2 现在 2，目标 0；F3 现在 12，目标 1；F4 约 52，目标 10；F5 约 21，外加 2，目标 6，外加 2；F6 约 12，目标 3。第 291–297 行的 X-1 到 X-7 是建议。第 299 行写：没有写进路线之前，上面带 X 的「目标」不算承诺。

RAC-04：open finding F-03。热点文件仍是巨大单元。`plugins/native/pages/src/editor-browser.ts` 3854 行。`apps/local-host/src/assistant/assistant-service.ts` 文件 2081 行，类 `AssistantService` 1663 行、99 个方法。

RAC-05：pass（结构）。SSOT 与 CODEOWNERS 的生成、合同变更文档、CI 里的产品子集作业都在。这次审查不把远端 CI 对 `dfc81998a` 的结果当成已测得的结论。

RAC-06：pass。`docs/system/PARALLEL-DEVELOPMENT.md` 是 AGENTS.md 指向的协作规则。

RAC-07：partial，F-02。静态、API 与预算门禁在这次健康检查里跑过。插件版本回放语料不在树上。

RAC-08：partial，F-12。类型化宿主能力仍是 190 处。

RAC-09：partial，F-10 与 F-27。调用编号和 `effectGuard` 在共享路径上。仍有 87 处按错误测试自行选择 HTTP 状态。

RAC-10：pass（只减规则）。巨大单元 144 与测试内部引用 495 都等于基线。剩余单位是 F-03 与 F-04。

RAC-11：open finding F-28。没有一份隔离 Home 的技能冒烟来补上缺失的回放脚本。

RAC-12：partial，F-05 与 F-29。就地补表是 0。兼容标记还有 9 处。派生搜索索引在模式版本不一致时重建。

RAC-13：partial，F-29 与 F-30。统一登记已经存在：`apps/local-host/src/home-stores.ts` 的 `homeStores()`，`docs/system/HOME-DATA.md` 第 7 行写明这一点（W4-11，2026-10-15）。使用 `applySqliteBaseline` 的库在版本不对时拒绝。第 7 行同时写明还没有的两件事：产品里的备份命令（W5-16），以及备份类在登记里的记录。派生搜索索引仍会重建（第 30 行，并写明不属于拒绝）。规格书第 1904 行仍写「W4-11 未交付」，那一句是 F-41。

RAC-14：open finding F-30。`docs/system/HOME-DATA.md` 第 6 行写：第 10 节的真实 Home 清单只用 `ls`、`stat`、`find`、`du`，没有打开任何库或数据文件，所以真实库当前盖的版本没有核对。第 293 行重复这一点。这次审查也没有打开真实 Home。

RAC-15：pass（现有机器）。这次健康运行用合并基线 `dfc81998` 比较并退出码 0。未标记的兼容逻辑仍是 F-05 与 F-29。

RAC-16：open finding F-31。规格完成节仍有这一棵树没有关上的行（F-02、F-30、F-39）。`specs/repository-anti-corruption/spec.md` 第 3 行状态是「执行中，整线未完成」，下一步写的是第 4–6 波。迁移状态句是 F-40。§12.4 有两行和当前树不一致，是 F-41。

RAC-17：partial，F-27 与 F-32。不变量表的形状由这次健康运行检查。拒绝测试作业是 `continue-on-error`，并且不在 `Verify` 的 `needs` 里。Vendored 包的提交是 `e5123369`。

RAC-18：open finding F-33。这次审查只跑了健康门禁。

RAC-19：open finding F-01。第 4 到第 6 波没有结束。Form 的 Runtime 启动、W4-11 的登记、W4-03 的第一片已经在树上。Todo 和另外 16 个构建期插件、回放脚本、扩展演练、巨大单元拆分都还在。

## 发现清单

F-01。构建期装配还剩 17 个 id：alchemist、artifacts、cognia、dataset、feed、goals、images、inbox、jelly、lingguang、pages、plugin-builder、ppt、schedule、sessions、workflows、todo。第二个样板 Todo 仍在这张名单上。对应 RAC-19。

F-02。`scripts/replay-plugins.mjs` 不在树上。`docs/system/CONTRACT-CHANGES.md` 第 56 行写明回放工具现在还没有。对应 RAC-02、RAC-07、RAC-11。

F-03。巨大单元 144，其中 140 个待拆。文件头几名：`editor-browser.ts` 3854，`en.ts` 3324，`assistant-island.ts` 2384，`pages/commands.ts` 2241，`craft-finish.ts` 2173，`assistant-service.ts` 2081，`tab-workspace.ts` 2019，shelf `client.ts` 1708，coding `client.ts` 1642，workflows `client.ts` 1358，form `client.ts` 900。类 `AssistantService` 1663 行、99 个方法。登记例外只有四条，都在 `tooling/gates/giant-exceptions.json`：`momentum.ts`、`primitives.ts`、`plugins/native/coding/src/styles.ts`（样式表），`plugins/official-integrations/catalog/src/catalog.ts`（静态数据）。例外只许不增长。#558 在这次测量之后把 Form 的 `client.ts` 拆开，该文件长度以 `dfc81998a` 的门禁计数为准。

F-04。测试内部引用 495，245 个测试文件。

F-05。兼容标记 9 处、6 个文件：`apps/local-host/src/plugin-builder/installed.ts` 3 处（`compatibleFrom`，第 45 与 52 行），`packages/plugin-runtime/src/index.ts` 2 处（第 146 行 `compatibleSameVersion`），`material-pdf-worker.ts` 第 6 行与 `pdf-document-parser.ts` 第 10 行都导入 `pdfjs-dist/legacy/build/pdf.mjs`，`apps/workbench/src/i18n/en.ts` 第 677 行英文含 backfill，`plugins/native/goals/src/planning-presentation.ts` 第 12 行含 legacy cleanup。

F-06。旧名 3 处：`packages/storage/src/adapters/file-secret-store.ts` 第 65 行 `ENV_KEY_SALT = "goalboard-feed-secretstore-v1"`；`plugins/native/goals/src/document-collection.ts` 第 11 行与 `goal-tree-materialization-order.ts` 第 5 行的未使用 `_boardId`。

F-07。浏览器脚本空 catch 136 处、52 个文件。最多的是 coding `client.ts` 13，`tab-workspace.ts` 9，shelf `client.ts` 8，shelf `settings-client.ts` 8。

F-08。可执行浏览器程序里的原始 fetch 88 处、45 个文件。本次门禁退出码 0。`scripts/gates/browser-fetch.mjs` 把 `apps/workbench/` 下的原始 fetch 当成问题，工作台的零容忍没有被这次运行打破。

F-09。错误子类 28 个、28 个文件。其中 `CodingUnavailable` 在 `apps/local-host/src/assistant/assistant-coding.ts` 第 32 行。`packages/contracts/src/platform/action-errors.ts` 第 17 行的 `ActionError` 是 `scripts/gates/error-scan.mjs` 里的模型类（`MODEL_CLASS`），不计入这 28。

F-10。按错误测试选择的 HTTP 状态 87 处、24 个文件。最多的是 `plugins/native/alchemist/src/studio/server/services/action-operations.ts` 14 处，其次 work `handoff.ts` 8、`messages.ts` 6、coding `routes.ts` 5、work `workspaces.ts` 5。

F-11。错误码前缀违规 0。所有者表 57 个 owner、1625 个源文件，另有 429 个文件无人拥有。平台前缀是 actions、files、placement、search。

F-12。类型化宿主能力引用 190 处、24 条。

F-13。手写装配：宿主插件文件 30，`registerProvider` 24 处、13 个文件（其中 `project-host.ts` 9 处），混合插件 16 处、5 条。`HYBRID_RUNTIME_PLUGINS`（装配门禁测试第 126 行）是 characters、coding、git、shelf。

F-14。翻译冲突键 192，基线 192。44 份词典、9953 条、9182 个不同键、471 个键被定义多次、稳定键 0。缺英文 0，未服务词典 0。死键 2423 只报告。

F-16。显式 `any` 515 处、153 个文件。

F-17。`as unknown as` 188 处、116 个文件。

F-18。未等待的 Promise 3 处、2 个文件。

F-19。console 调用 88 处、27 个文件。

F-20。TypeScript 空 catch 4 处、4 个文件。

F-21。合同纯度 6 条长辅助函数，都在基线上。

F-22。宿主入口 `export *` 11 处，都在 `apps/local-host/src/index.ts`。

F-23。层例外 10。

F-24。模块入口导出 Repository 或 Store、以及公开 `repository` 成员：21。

F-25。内置插件包外点名 419，26 条。

F-26。验收编号只报告：15/30 份规格有编号，34/373 条被测试引用，10 份有验收节但没有编号，0 份豁免，305 个问题，4 份归档规格仍占用编号。

F-27。共享路径上仍有 87 处自选 HTTP 状态。安全表的形状由健康门禁经 `scripts/gates/doc-gates.mjs` 检查，这次退出码 0 表示表内部一致。这次没有跑拒绝测试。

F-28。没有隔离 Home 的技能冒烟。

F-29。`packages/storage/src/adapters/text-search-index.ts` 第 23 行 `SCHEMA_VERSION = "2"`。第 145–146 行在版本不一致时执行 `DROP TABLE IF EXISTS search_fts; DROP TABLE IF EXISTS search_documents; DROP TABLE IF EXISTS search_sources;`。第 160 行再写入 schema。`HOME-DATA.md` 第 30 行把派生的 `search/search.db` 标成不属于拒绝。

F-30。登记已有，备份命令和备份类记录还没有，真实 Home 的版本没有核对。`HOME-DATA.md` 第 7 行写 `homeStores()` 已列出每个有数据的条目和 owner，并写明产品备份命令（W5-16）与备份类在登记里的记录都还没有。第 6 行和第 293 行写真实 Home 清单没有打开任何库。清除读取登记的位置是 `apps/local-host/src/installer/uninstall.ts` 第 47 行：`existingPaths(homeStores().paths(this.homeDirectory))`。

F-31。规格第 3 行与 §12.4 的完成表仍把整线记为未完成。回放、真实 Home 版本、扩展演练都还开着。

F-32。包身份已经对齐：`vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-collaboration.tgz.provenance.json` 的 `source.commit` 是 `e51233699c1463e3c8f0a8b08658c5860c962769`，`SECURITY-INVARIANTS.md` 第 69 行写的是同一份 collaboration 包和 `e5123369`。份数 1，上限 2。还开着的是 CI 与第 4 节的范围：`.github/workflows/ci.yml` 第 374 行 `Verify` 的 `needs` 是 gates、health-gate-rules、architecture-boundaries、action-contracts、secret-scan、native-checks、shell-checks，不含 `security-invariants`。该作业在第 412 行，第 417 行 `continue-on-error: true`。第 405–407 行注释写明这是有意的。第 4 节第 65 行：桌面 IPC 可达范围没有实测。第 67 行：GET 路由没有只读断言。第 68 行：已存在的过宽令牌文件原样沿用。第 70 行：五处公网地址实现仍是五份。第 71 行：Seatbelt 用例永远不会在 Linux 上跑。第 72 行：Computer Use 的拒绝用例只在本机跑，真机四种拒绝没有记录。第 69 行点名的 `tests/prologue-memory-boundary.test.ts` 这次没有跑。

F-33。这次审查只跑了健康门禁。全量、`boundary:check`、`secrets:check` 和命名的端到端测试都没有跑。

F-34。公网地址检查仍是五份，和第 4 节第 70 行一致。`isPublicAddress` 在 `packages/plugin-sandbox/src/https-proxy.ts` 第 17 行。`publicAddress` 在 `apps/local-host/src/plugin-builder/network.ts` 第 32 行。`isJellyPublicAddress` 在 `apps/local-host/src/jelly-source-reader.ts` 第 10 行。AnySearch 的 `BlockList` 在 `apps/local-host/src/anysearch-transport.ts` 第 14 行。`isPublicDnsHostname` 在 `plugins/official-integrations/rss/src/custom-rss.ts` 第 102 行。只搜字符串 `isPublicAddress` 会漏掉后三处。

F-35。`apps/desktop/src-tauri/tauri.conf.json` 的 `security.csp` 是 `null`。第 4 节第 65 行写 `pty_spawn` 的 iframe 可达范围没有实测。

F-36。第 4 节第 68 行写已存在的过宽控制令牌文件不会收紧。S-06 点名的解析器是 `apps/local-host/src/web-control-token.ts`。

F-37。`plugins/native/issues/src/review-client.ts` 第 2 行仍导出 `ISSUE_REVIEW_CLIENT_SCRIPT`。Issues 的运行范围是 Home：`apps/workbench/src/builtin-plugins.ts` 第 94 行 `runtime.scope` 为 `"home"`。

F-38。characters 同时在 `RUNTIME_ASSEMBLED` 和 `HYBRID_RUNTIME_PLUGINS` 里。`apps/local-host/src/characters-host.ts` 仍在。健康报告记着决定 26：它长期不再是 Runtime 插件，代码要并进宿主或模块。

F-39。扩展演练未达目标，见 RAC-03。方向表第 37–51 行，演练第 238–243 行，建议扩展点第 291–299 行。F1 的演练仍写 12，方向 1 的「现在」已经写成 11，演练表没有随这一次重测。

F-40。`docs/system/RUNTIME-MIGRATION.md` 第 3 行（2026-10-08，对照 `31c357df`）仍写「还没有合入的迁移样板」和「Form 与 Todo 迁移尚未开始」。第 39–40 行仍把 `RUNTIME_ASSEMBLED` 写成 7 个且不含 form，并把 form 列在 `BUILD_TIME_ASSEMBLED` 的 18 个里面。`dfc81998a` 上 Form 已在 Runtime 名单上，两份宿主文件已不在。这是文档滞后。RAC-01 的代码裁决仍是 pass。

F-41。`specs/repository-anti-corruption/spec.md` §12.4 是 2026-10-12 的裁决表，有两行和 `dfc81998a` 的树不一致。第 1892 行 RAC-01 仍写「未通过；8/18 装配仍并存，Form 样板未合」。第 1904 行 RAC-13 仍写「登记门禁 W4-11 未交付」。该提交上 Form 由 `createFormPlugin` 启动，`homeStores()` 已存在。这两行不改变本文对 RAC-01（pass）和 RAC-13（partial）的代码裁决。

## 抽查过的路径

授权尾检查为 pass。`packages/kernel/src/action-settlement.ts` 第 22–24 行是 `assertCurrentAuthority`，第 40 行在等待之后调用 `assertAuthority()`。测试文件 `tests/mcp-effect-authority.test.ts` 与 `tests/action-authority-tail.test.ts` 在树上，没有执行。

助手发送为 pass。`apps/workbench/src/scripts/client/assistant-send.ts` 第 24 行先构成 `intent`，第 36 行才 `await draftWrite`。`tests/assistant-send-intent.e2e.test.ts` 含 `W2-18-SEND-01` 与 `W2-18-SEND-02`，没有执行。

Goals 恢复为 pass。`modules/goals/src/lifecycle-archive.ts` 第 264 行调用 `this.hooks.validateRelationGraph`。`tests/goals-lifecycle-actions.test.ts` 含 `W2-18-GOALS-01/02`，没有执行。

定时任务为 pass。`apps/local-host/src/web-project-schedulers.ts` 第 44 行登记 `id: "projects.schedules"`。`tests/host-periodic-tasks.test.ts` 在树上，没有执行。

Gmail 历史游标为 pass。`plugins/official-integrations/gmail/src/history-cursor.ts` 第 71 行保留 `position?: { historyId: string; offset: number }`。`tests/integration-pagination.test.ts` 第 20、64、94 行命名 `W2-18-GMAIL-01`，第 20、94、124 行命名 `W2-18-GMAIL-02`。这些测试这次没有执行。

准备拒绝、搜索撤销、Pages 停止回复、点击劫持响应头、密钥不回传，都以不变量行或已存在的测试文件名为 pass。这些测试没有执行，记在 F-32、F-33。模型切换的包身份对齐到 `e5123369`（F-32 的已对齐一半）。

插件装配：files、diff、text-stats 只在 Runtime 名单上，为 pass。Form 的 Runtime 样板为 pass，它的 `client.ts` 在该提交的门禁计数里是 900 行（F-03）。Issues 走 Home Runtime，审阅脚本仍是模板字符串（F-37）。characters、shelf、coding、git 仍是混合装配（F-13、F-38）。Todo 与其余构建期插件是 F-01。

两处文档按该提交逐行对过：`docs/system/HOME-DATA.md` 第 6–7 行（真实 Home 没有打开库；`homeStores()` 已有，备份命令和备份类记录还没有），`docs/system/EXTENSION-POINTS.md` 第 37–51 行、第 238–243 行与第 299 行（方向、演练和建议扩展点）。

把引用更正写进清单之后，再沿 category、scenario、feature、path 走了一遍。137 项都已勾选。这一遍没有新的范围内发现。
