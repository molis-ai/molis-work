# C7 插件一半（PG-062）计划

写于 2026-10-23。依据：
- #1024 的 diff（`feat/c7-public-packages` @ `87f1e1bfc`，OPEN、CLEAN、未合）；
- `privileges.md` 的 PG-062、PG-037、PG-091 三行与 V-16；
- `specs/coding-plugin/spec.md` §K（#1024 新增）；
- 本目录 `coding-migration-plan.md` 的 §2.10、「C7 结果装饰」、T5；
- origin/main @ `0964ea25b` 上的源码。

**开片条件：#1024 合进 main。** 之后每片从最新 origin/main 开新分支，一片一个 PR，交 ⑩。

## 裁定（2026-10-23，① 经 ③ 转）

- 编号 PG062-01…13；§K 那句改指 PG062。#1018 由 ⑤ 留评论请作者删 `decorateCompanionState`，S1 不等它。
- S3 选 A：SDK 新开 `/diff-view`，算共享核心、进集成批次。只搬通用视图（输入是 `{path, before, after}` 一类的变更集，不带「轮次」）；`compareRunChangeSet` 里 Coding 语义留在 Coding；零第三方依赖（plugin-sdk-subpaths 测试证明）；escape、text、icon 由调用方注入；与 `text-diff.ts` 合成一套；PG062-10＝Diff 包与 SDK 只有一份 `renderDiff`；跑 `pnpm api:update`，PR 写对插件作者的影响并注明「改共享核心，进集成批次」。
- S4 选 B：平台给所有插件一个无副作用的渲染服务（如 `services.interaction`），出问题卡、建议卡、下一步行的 html；语言取调用上下文；不要新权限；沙箱经 broker 也拿得到；输入复用 contracts/SDK 已有的问卷、操作卡类型；必须有转义测试（先找 SECURITY-INVARIANTS 里「宿主用插件给的字符串拼 html」那行并入，没有才开新 S 行并核空号）。分 S4a（平台服务，共享核心，进批，② 评审合同）与 S4b（Coding 改用，删 `decorateCodingResult`、`decorateRuntimeResult`、`codingNextSteps`、`afterDispatch`）。PG062-11..13 不变。
- 第 4 节：BL-381（成果库预览改 `/rich-text`）、BL-382（Pages 编辑器改 `/highlight`）由 ③ 在 S5 的 PR 里自己加（③ 10-23 更正），本线的 PR 不加；其余几项不开。
- 顺序：S1 → S2 → S3（A）→ S4a → S4b，一片交出去立刻接下一片。

## 0. 先要 ③（必要时 ①）定的三件事

1. **验收编号。**
   - ③ 这次说用 `PG062-xx`。#1024 的 §K 和 `coding-migration-plan.md` 里写的是「W5-01-CODING-64～69 留给 ③」。
   - 这一半有 Diff、Text Stats，不只是 Coding；仓库里也已有 `PG037-01` 这种写法（`tests/plugin-route-operations.test.ts:132`）。
   - 所以我按 `PG062-01…13` 写。第一片顺手把 §K 末尾那句改成指向 PG062。不同意就换回 64～69（只有 6 个号，不够 13 条，要再分段）。
2. **第 3 片：Coding 的变更阅读器拿什么画 diff**（见 §1 S3）。我推荐 A，它改共享核心。
3. **第 4 片：问题卡、建议卡、下一步行的 html 放到哪**（见 §1 S4）。推荐 A，不碰共享核心。

另有一处要协调：
- **草稿 PR #1018**（`feature/system-review-fixes`，作者 yijunw0212，300+ 文件）在 `coding-surface.ts` 新增 `decorateCompanionState`。它在 `plugin-page-http.ts:55` 的页面动作路径上也替 `diff.state`、`text-stats.state` 补 html，等于把 PG-062 要拆的特权又扩了一处。
- 第 1 片落地后，这两个动作自己就带 html，#1018 那段就不用了。
- 谁先合、怎么接，请 ③ 或 ① 跟 #1018 的作者对一下。我不动 #1018。

## 1. 现状

`apps/local-host/src/coding-surface.ts`，origin/main 上的行号：

- `codingRouteHooks.afterDispatch` → `decorateRuntimeResult`（:140）：
  - `/state` 结果替 Diff 补 `renderDiff` 的 html，替 Text Stats 补 `renderTextStats` 的 html；
  - 然后对 Coding 调 `decorateCodingResult`（:170）。
- `decorateCodingResult` 往 Coding 的路由结果上写九样东西：

| # | 字段 | 宿主用的渲染 | 交给插件的难点 |
|---|---|---|---|
| a | `runs[].turns[].html` | `renderFeedRichText`（#1024 后为 SDK `renderRichText`）；去掉开头的 `[retained…]/[historical…]` 标签，跳过摘要轮 | 无：Coding 直接用 SDK `/rich-text` |
| b | `subagents[].children[].result_html` | 同上 | 无 |
| c | `report.html` | Coding 自己的 `renderCodingReport` 加 `renderRichText` | 无：escape、icon 用 design-system，Coding 已依赖；词用 Coding 自己的词典按 locale 取 |
| d | `runs[].awaiting_input[].html` | 宿主的 `agentQuestionHtml`（`agent-question-card.ts`，147 行） | 宿主渲染器，词在工作台词典里 |
| e | `runs[].cards[].html` | 宿主的 `cardView` 与 `assistantCardHtml`（`assistant/assistant-card-view.ts`，112 行） | 同上 |
| f | `runs[].next_html` | `codingNextSteps`（宿主），内部用 `cardOutcomeSteps`、`interactionNextSteps`（`agent-next-steps.ts`，88 行）和 design-system 的 `renderInteractionNextSteps` | 同上 |
| g | `change` 阅读器的 `html`、`patch`、`view_mode`、`net_groups` | **Diff 插件的** `compareRunChangeSet`、`renderDiff`、`unifiedPatch`，加 Coding 的 `codingNetChange` | Coding 不能 import Diff 的实现 |
| h | `/integration` 的 `files[].diff_html` | 同 g | 同 g |
| i | Diff、Text Stats 的 `/state` 的 `html` | Diff 的 `renderDiff`、Text Stats 的 `renderTextStats` | 两个插件各自在动作里画；icon 要 design-system |

合同核对（`coding-migration-plan.md` 里「未核」的那一项）：
- Coding 的路由动作 `output_schema` 是开放的 `{ type: "object" }`（`route-actions.ts:11`）。a～h 由 Coding 自己写，不改动作形状。
- `diff.state@1`、`text-stats.state@1` 的 `output_schema` 只有 `{ view }`（V-16 记的不一致）。i 要给它们加**可选**的 `html`：
  - 按 `CONTRACT-CHANGES.md` 第 48 行，「只加可选字段…不算破坏性」，版本留 @1；
  - 动作合同快照的哈希会变，`pnpm actions:update` 后在 PR 里写明。
- 语言：动作上下文有 `locale`（`zh`|`en`，宿主按页面语言解析）。
  - Diff 有 `DIFF_MESSAGES {zh,en}`，Coding 有 `CODING_*MESSAGES`，Text Stats 有 `messages.ts`；
  - 插件在动作里按 `caller.locale` 取词，不需要宿主的 `L`。

## 2. 切片

### S1：Diff、Text Stats 的 state 动作自己带 html（PG062-01～04）

- 改动：
  - `diff.state`、`text-stats.state` 的处理器在调用方是页面（`audience: "user"`）时，按 `caller.locale` 用本插件的 `renderDiff`、`renderTextStats` 加上 `html`；
  - Agent、MCP、工作流调用不带 html，免得把标记塞给模型；
  - `output_schema` 加可选 `html: string`。
- `route_prefix` 是 `renderDiff` 用的；动作上下文里没有。开片第一步核它画了什么：
  - 只用于页面内链接的话，改成由页面补前缀，或者插件按 `execution.project_id` 拼 `/projects/<id>`。
  - 不让宿主再传进来。
- 宿主删 `decorateRuntimeResult` 的 `/state` 分支，以及 `DIFF_PLUGIN_ID`、`TEXT_STATS_PLUGIN_ID`、`renderTextStats`、`TextStatsView` 的 import。`DIFF_UI_CONTRIBUTION_ID`、`TEXT_STATS_UI_CONTRIBUTION_ID` 留给舞台用（PG-060 的事）。
- 文件：
  - `plugins/native/diff/src/{actions.ts,ui.ts,package.json,README.md}`
  - `plugins/native/text-stats/src/{actions.ts,ui.ts,package.json,README.md}`
  - 两个 `package.json` 加 `@molis-ai/molis-work-design-system`，只为 `icon` 和 `escapeHtml`。另 19 个内置插件已经这么依赖；不想加的话，图标改由页面画，开片时二选一。
  - `apps/local-host/src/coding-surface.ts`
  - `tooling/gates/actions/actions.tsv`
  - `pnpm-lock.yaml`
  - `specs/repository-anti-corruption/privileges.md`：PG-062 记进度，V-16 结论
  - `specs/coding-plugin/spec.md` §K：编号改指 PG062
- 验收：
  - **PG062-01**：页面调 `diff.state`，返回的 `html` 等于用该语言画的 `renderDiff`（zh、en 各一）。
  - **PG062-02**：`text-stats.state` 同上。
  - **PG062-03**：Agent 调用只得 `{ view }`。两个动作的 `output_schema` 都声明可选 `html`，返回与 schema 一致（V-16）。
  - **PG062-04**：`coding-surface.ts` 不再点名 Diff、Text Stats 的插件 id，也不 import `renderTextStats`（源码断言）。
- 测试：
  - 新增断言写进 `tests/diff-plugin.test.ts`、`tests/text-stats-plugin.test.ts`；
  - 另跑 `tests/coding-companion-http.test.ts`、`tests/coding-companion-inputs.test.ts`、`tests/companion-actions.test.ts`、`tests/coding-git-diff-product.test.ts`、`tests/plugin-route-operations.test.ts`、`tests/action-contract-snapshot.test.ts`；
  - 浏览器的 `companion-client-lifecycle.e2e`、`english-surfaces.e2e` 暂停中，不跑，PR 里写明。
- 体量：小。不碰共享核心。

### S2：Coding 自己画富文本：轮次、子代理结果、报告（PG062-05～07）

- 改动：
  - 把 a、b、c 挪进 Coding 的服务端：
    - `routes-timeline.ts`（runs、turns）
    - 子代理路由（`routes-writers.ts` 或 subagents 所在处，开片时核）
    - 报告路由
  - 新开一个只在服务端的模块（如 `src/rich-html.ts`），用 SDK 的 `/rich-text`。去掉开头标签的正则和「摘要轮不画」的规则原样搬过去。
  - Coding 的 `package.json` 加 `marked@^18.0.11`、`sanitize-html@^2.17.7`，开发依赖加 `@types/sanitize-html`。
  - 宿主不再用 `/rich-text`（开片时 `git grep` 再核），从 `apps/local-host/package.json` 删这两个依赖。
  - `tests/plugin-sdk-subpaths.test.ts` 的 W5-01-CODING-61 跟着改：「声明 peer 范围的使用方」从「工作台、宿主」改成「工作台、Coding」。消费者搬了，断言不放宽。也可以改成「凡 import `/rich-text` 的包都声明同一范围」，更硬。
- 文件：
  - `plugins/native/coding/src/{routes-timeline.ts,<子代理路由>,<报告路由>,rich-html.ts(新),README.md}`
  - `plugins/native/coding/package.json`
  - `apps/local-host/src/coding-surface.ts`
  - `apps/local-host/package.json`
  - `pnpm-lock.yaml`
  - `tests/plugin-sdk-subpaths.test.ts`
  - `packages/plugin-sdk/README.md`：「工作台和宿主声明的就是这两个范围」一句要改。这是共享核心的 README，只改文字，不改代码；PR 里写明。
- 验收：
  - **PG062-05**：轮次的 html 与原来相同。摘要轮不画；助理回复开头的 `[retained…]/[historical…]` 标签去掉，中间的保留。
  - **PG062-06**：子代理结果的 `result_html`、报告的 `html` 由 Coding 给出，与原来相同。
  - **PG062-07**：Coding 的浏览器产物（`dist/workbench-bundle.js`、`dist/draft-bundle.js`）不含 `marked`、`sanitize-html`。宿主不再声明这两个依赖。
- 测试：
  - `tests/coding-experience.test.ts`、`tests/coding-report-persistence.test.ts`、`tests/coding-runtime-regressions.test.ts`、`tests/coding-subagents-http.test.ts`、`tests/coding-goal-context-http.test.ts`、`tests/plugin-sdk-subpaths.test.ts`、`tests/feed-rich-content.test.ts`；
  - 新断言放进 `tests/coding-experience.test.ts` 或新开 `tests/coding-rich-html.test.ts`。新测试文件内部 import 从 0 起，只走 dist 与 fixture。
- 体量：中。不碰共享核心代码。

### S3：Coding 的变更阅读器和整合差异不借 Diff 的实现（PG062-08～10）——先定方案

- **A（推荐）**：把 Diff 的纯视图部分搬进 SDK 的新子路径 `/diff-view`，Diff 和 Coding 都从 SDK 取。
  - 搬的东西：`compareRunChangeSet`、`renderDiff`、`unifiedPatch`、`DiffView` 类型、`DIFF_MESSAGES`。
  - SDK 里已有 `text-diff.ts`（`compareTexts`、`alignSplitRows`），这就是 PG-062 目标栏写的「插件自己出 html（用 SDK 部件）」，第三方插件也能画同样的 diff。
  - `renderDiff` 的 escape、text、icon 本来就是注入的，不依赖 design-system。样式留在 Diff 和工作台的样式表，类名不变。
  - 代价：
    - **改共享核心**：plugin-sdk 的新子路径与 API 快照、`pnpm api:update`，要进集成分支跑全量批，PR 里写明，① 认可；
    - 工作量比 B 大。
- **B**：Diff 新增一个只给页面的查询动作（例如 `diff.change-view@1`，`audiences: ["user"]`），输入 Coding 已备好的变更内容（含 net 合并后的文件）与显示选项，返回 `html`、`patch`。Coding 的路由经 `services.actions.invoke` 调它，走公开合同。
  - 不碰共享核心。
  - 代价：
    - Coding 的阅读器运行时依赖 Diff 已装、已启用（Manifest 要声明依赖，Diff 没启用时要有空状态）；
    - 多一个动作进快照；
    - 第三方插件还是画不了 diff。
- 两个方案都要做的：
  - 搬过去的是 g、h；`codingNetChange`（Coding 自己的）留在 Coding；
  - 宿主删 g、h 两段，以及 `compareRunChangeSet`、`renderDiff`、`unifiedPatch`、`DiffView` 的 import。
- 文件（按 A）：
  - `packages/plugin-sdk/{src/diff-view.ts(新),src/index?,package.json exports,README.md}`
  - `tooling/gates/api/plugin-sdk/diff-view.txt`（新）
  - `plugins/native/diff/src/{ui.ts,comparison.ts,changeset.ts,patch.ts,messages.ts,index.ts}`：删掉搬走的，改从 SDK 取
  - `plugins/native/coding/src/routes-changesets.ts` 加整合差异的路由
  - `apps/local-host/src/coding-surface.ts`
  - 相关 import 改动的测试
- 验收：
  - **PG062-08**：变更阅读器的 `html`、`patch`、`view_mode`、`net_groups` 由 Coding 给出，与原来逐字段相同（unified、split、net 三种）。
  - **PG062-09**：整合的 `diff_html` 由 Coding 给出。
  - **PG062-10**：Coding 不 import Diff 包的实现（`pluginOutsideMentions` 的计数下降）。按 A 再加一条：Diff 包和 SDK 里只有一份 `renderDiff`。
- 测试：
  - `tests/coding-changeset-http.test.ts`、`tests/coding-git-diff-product.test.ts`、`tests/coding-artifacts.test.ts`、`tests/diff-plugin.test.ts`、`tests/runtime-integration.test.ts`、`tests/writer-integration-host.test.ts`、`tests/integration-pagination.test.ts`；
  - 按 A 另加 `tests/plugin-sdk-subpaths.test.ts`（`/diff-view` 零第三方依赖）、`tests/plugin-sample.e2e.test.ts`；
  - 浏览器的 `code-diff-scale.e2e` 暂停中。
- 体量：A 中到大，B 中。

### S4：问题卡、建议卡、下一步行由 Coding 自己画；删宿主的装饰（PG062-11～13）——先定方案

- **A（推荐）**：把宿主的三层薄映射挪进 design-system，与它已有的 `renderInteractionQuestion`、`renderInteractionOperation`、`renderInteractionNextSteps` 放在一起。宿主的助理和 Coding 都从那里取。
  - 三层是：`agent-question-card.ts` 的 `agentQuestionHtml`；`assistant-card-view.ts` 的 `cardView`、`assistantCardHtml`；`agent-next-steps.ts` 的 `interactionNextSteps`、`cardOutcomeSteps`、`CARD_RESULT_OPEN`。
  - 这些函数里的中文词要带 `{zh,en}` 表，插件才能按 `caller.locale` 画；英文现在在工作台的 `ASSISTANT_EN` 一类词典里，要一起搬，`*_EN` 照样并进工作台的 `en.ts`（翻译门禁）。
  - `dateTimeLocale` 改成参数，不读宿主的 web-locale。
  - design-system 现在不依赖 SDK，而 `assistant-card-view` 用到 SDK 的 `wallClockIn`。要么给 design-system 加 SDK 依赖（SDK 只依赖 contracts，方向允许），要么把 `wallClockIn` 的调用留在调用方。开片时核。
  - 不碰共享核心，但调用方多：`assistant-offers.ts`、`assistant-outcome.ts`、`assistant-view-html.ts`、`plugin-interaction-answer.ts`、`index.ts`。
- **B**：平台给所有插件一个服务，例如 `services.interaction.html(...)`，宿主照旧画。
  - 要新的服务合同（contracts，共享核心）；
  - 好处是词典不搬。
- 两个方案都要做的：
  - Coding 在 `routes-timeline.ts` 画 d、e、f；
  - 宿主删 `decorateCodingResult`、`decorateRuntimeResult`、`codingNextSteps`，以及 `afterDispatch` 钩子；
  - `codingRouteHooks` 只剩 `beforeDispatch`（Files 刷新，等 N-14），PG037-01 的断言不变；
  - privileges.md：PG-062 记「已做」；PG-037 里「宿主替几个插件画结果」一句划掉；PG-091 的「助理岛从 Coding 包 import 代码高亮」一项 #1024 已做，标掉。
- 文件（按 A）：
  - `packages/design-system/src/{interaction-*.ts,index.ts}`
  - `apps/local-host/src/{agent-question-card.ts,agent-next-steps.ts,assistant/assistant-card-view.ts}`：删或改成转调
  - 上面五个调用方
  - `apps/workbench/src/i18n/{assistant-en.ts,en.ts}`
  - `plugins/native/coding/src/routes-timeline.ts`
  - `apps/local-host/src/coding-surface.ts`
  - specs
- 验收：
  - **PG062-11**：Coding 返回的问题卡 html 与助理同一张卡相同（zh、en）。
  - **PG062-12**：建议卡的 `html` 与 `next_html` 由 Coding 给出，与原来相同。
  - **PG062-13**：`coding-surface.ts` 里没有 `decorateCodingResult`、`decorateRuntimeResult`、`afterDispatch`、`codingNextSteps`。
- 测试：
  - `tests/coding-question-card.test.ts`、`tests/coding-next-steps.test.ts`、`tests/agent-next-steps.test.ts`、`tests/assistant-card-outcomes.test.ts`、`tests/assistant-interaction-html.test.ts`、`tests/assistant-step-row.test.ts`、`tests/assistant-delivery-page.test.ts`、`tests/coding-state-coalesce.test.ts`、`tests/plugin-route-operations.test.ts`；
  - 浏览器的 `coding-question-card.e2e` 暂停中。
- 体量：中到大。可以再切成「挪渲染器」和「Coding 改用、删装饰」两个 PR。

## 3. page-assets 预计

- S1～S4 改的都是服务端渲染（动作或路由的返回体），浏览器产物的入口不变。**预计 `/assets/` 下每一项都不变（0 字节）**，没有新增资源，也没有超过 10 KB 的增长。
- 风险只有一处：S2 要是让 Coding 的浏览器入口（`src/browser/*`）能走到 `/rich-text`，`coding.js`（376,592 B）会带进 `marked` 和 `sanitize-html`。估计涨 100 KB 以上。
  - 防法：渲染只放在服务端模块，PG062-07 断言浏览器产物不含它们；
  - 每片推前跑 `pnpm page-assets:check`。真变大就停下来问 ①。
- S4-A 往 design-system 加导出。工作台脚本是按字符串拼的，不打包 design-system 的入口，预计不变；同样用 `page-assets:check` 证明。

## 4. PG-062 之外还自带一份的地方

不进这几片，开片时也不碰。列给 ③ 决定要不要开 BL：

1. `packages/design-system/src/file-preview.ts:27` 的 `markdown()`：第二个手写的 Markdown 渲染器，转义、无消毒器。
   - 用在成果库预览（宿主 `artifact-native-plugin-http.ts:61`）和侧栏文件（浏览器 `side-panel-files.ts:269`）。
   - 宿主那一路可以换 SDK 的 `/rich-text`，但输出会变（GFM 表格等）。
   - 浏览器那一路换了会把 `marked`、`sanitize-html` 带进 `molis-work-workbench.js`，不建议。
2. `plugins/native/cognia/src/client.ts:38` 的 `markdown()`：浏览器端，带维基链接与 `[S1]` 引用按钮，是 Cognia 专用的。可以先在服务端用 `/rich-text` 出 html 再补链接，算设计改动。
3. `apps/workbench/src/scripts/context-onboarding.ts:271` 的 `markdown()`：只有标题、粗体、引用按钮十几行，不值得换。
4. Pages：
   - `plugins/native/pages/src/code-highlight.ts` 用 `highlight.js` 与 `lowlight` 给编辑器做装饰；`import-content.ts` 用 `marked` 把 Markdown 导入成文档节点，这一项不算「显示富文本」。
   - 编辑器要是改用 SDK 的 `/highlight`（返回 token 种类，要换成区间），`molis-work-pages-editor.js`（709,541 B）会去掉 highlight.js 与 lowlight，估计能小几十 KB。
   - 但颜色、支持的语言都会变，要设计决定。
5. 平台层的检测：`horizontal/memory/src/service.ts` 的 `looksLikeSecret`，`horizontal/agent-host` 的 `redactText`（Prologue screening）。
   - 一个是拒收判断，一个是 SDK 侧的屏蔽，都不是插件自带的脱敏副本，不动。
6. `apps/workbench/src/feed-projection-ui.ts`：工作台替 Feed 画界面（#1024 后已从 SDK 取富文本）。这是「工作台拼插件界面」的特权，归 PG-060 一族，不是 C7。
7. Files、Git：没有自己的着色、富文本或脱敏，`git grep` 没找到。Git 的差异经 Diff 伙伴页显示。无事可做。

## 5. 顺序与碰撞

- S1 → S2 → S3 → S4。S1、S2 不用等任何决定。
  - S1、S2 都改 `coding-surface.ts` 的不同段落，所以前一片交 ⑩ 后，下一片从合进去的 main 开，或者 merge 前一片的分支，不 rebase。
- S3、S4 等第 0 节的决定。
- 枢纽文件：只碰 `pnpm-lock.yaml`（S1、S2）与 `tooling/gates/actions/actions.tsv`（S1）。
- ③ 的 S5 文件一个不碰：`project-plugins`、`project-host`、`web-request`、`goal-project-application`、`project-version-stores`、`plugins/native/goals/`、`scripts/check-package-boundaries.mjs`。
- 在途 PR：
  - #1018（草稿）改了 `coding-surface.ts`，见第 0 节；
  - #1029（PG-038，已交 ⑩）只碰 `tests/fixtures/coding-surface.ts`，不冲突。
- 安全不变量：判断不需要新 S 行。脱敏只是搬位置，#1024 已带走测试；这几片只移动渲染的位置，转义和消毒规则不变。
