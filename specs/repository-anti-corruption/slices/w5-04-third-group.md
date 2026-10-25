# W5-04 第三组 A：Files、Git、Diff、Text Stats 各带自己的客户端包与样式，不再借 Coding 的

状态：执行中（2026-10-24）。Coding 一族的第一段：Files、Git、Diff、Text Stats 四个插件各出一份自己的客户端包（`/assets/molis-work-plugins/<插件>.js`），样式随各自的插件包交付，`clientFrom` 从合同里删掉（PG-070）；Coding 自己的 24 个客户端文件（3b）还没有搬，不在本片。叠在 #1243（第二组）上，#1243 合入后只剩本片的差异；本地构建、定向用例与健康门禁通过，待统筹集成全量。

验收编号：RAC-169（Diff 与 Text Stats 的客户端）、RAC-540～542（PG-070 的组合层）；遗留 BL-605。

## 范围

### 一个客户端一个包（PG-070）

- 原来 Files、Git、Diff、Text Stats 的客户端都折进 Coding 的包（`registration` 里 `clientFrom: "coding"`），打开任何一个伙伴页面都要先下载 372 KB 的 Coding 包。现在每个插件各自一份包：Files 11 KB、Git 29 KB、Diff 1.5 KB、Text Stats 1.3 KB；伙伴页面只读自己的一份。
- 合同 `PluginWorkbenchRegistration` 去掉 `clientFrom`；`clientUses`（用别的插件的客户端）改成运行时拼：被用的插件各出一份自己的包，使用方的页面在挂载前先加载它们（`clientAssets` 里加进被用插件的包地址），`host.clients[<短 id>]` 是 `ports => 被用插件的工厂({ ...host, ...ports, pluginId, pluginRoute })`，被用的客户端问的永远是它自己的插件，不会以使用方的身份发请求。
- Coding 的工作台客户端改成只调 `host.clients.git` 与 `host.clients.files`；伙伴页面外壳（返回、状态、刷新）原来由 Coding 的包画，现在各插件自己的客户端画，不再借 Coding 的 `companionPage`、`request`、图标。

### Files、Git（RAC-161、RAC-168 的现有断言更新）

- 请求只经 `request.ts` 一处：嵌在 Coding 页面里时（`embedded`）走页面动作，独立页面走 `host.pluginRoute`。Git 的操作表（`/diff`、`/results`、`/operations`、冲突）放在 `request.ts`。
- `mount.ts` 是工厂的挂载入口，图标由 `src/client.ts` 在服务端取好交给包（Files）。新增两个键：`files.directory.back`、`files.error.workspace-unreadable`；`git.list.back`、`git.error.workspace-unreadable`。

### Diff、Text Stats（RAC-169）

- 两个插件原来没有自己的客户端；现在各有 `src/browser/`（`types`、`dom`、`page`、`factory`），`tsconfig.browser.json` 类型检查，esbuild 打成 `dist/diff-client.js`、`dist/text-stats-client.js`，`src/client.ts` 读包。页面做的事和原来 Coding 里的伙伴页面一样：读 `/state` 画 Host 给的 HTML、刷新、点链接打开别的插件；Diff 还回应 `diff.show-file`。
- 页面文字是稳定键（`diff.stage.reading`、`diff.stage.retry`、`diff.error.unreadable`，`text-stats` 同三个）。

### 样式随插件包

- `registration.stylesheet`：Files、Git、Diff 用各自包里已有的 `*_STYLES`，Text Stats 新增 `TEXT_STATS_STYLES`（原来是工作台 `coding-companions.ts` 里的 `.stats-*` 四条）；Coding 用 `CODING_STYLES`。`apps/workbench/src/page-assets.ts` 不再自己 import 这几份，页面样式序列是 `pluginWorkbenchStyles()` 加伙伴页面共用的布局和审阅样式。
- 设置页的样式表仍带 `CODING_STYLES`（PG-072 另算）。按需加载样式要多出一个资源（要先问统筹），本片不做。

不动：Goals/Work 的符号、Artifacts 的客户端、各插件的动作与路由、Coding 的 24 个客户端文件（3b）。

## 英文显示的变化

Diff、Text Stats 的三句话原来用中文原文当键、由工作台的英文词典翻译，现在是稳定键，英文与原来完全一样；`renderer-gap-en.ts` 删去已经没人用的 4 条（返回改动列表、正在读取固定内容…、。请点击刷新重试。、无法读取文件工作区）。

## 对插件和调用方的影响

- `contracts/platform/plugin-registration` 的快照变了一处：`clientFrom` 删除，`clientUses` 的说明改写。没有第三方插件用过 `clientFrom`（只有这四个内置插件）。
- 动作合同、Manifest、路由没动；`tooling/gates/actions/` 没有变化。
- 页面资源：`coding.js` 少 40,678 字节；新增 4 个资源（`git.js`、`files.js`、`diff.js`、`text-stats.js`）。合计约 +2.8 KB，但每个伙伴页面现在只加载 30 KB 以内，原来是 372 KB。新增资源按页面资源规则先问统筹，批准后放进 `APPROVED_NEW_ASSETS`。

## 验收

- RAC-540：`pluginSurfaceClients()` 里 Coding、Files、Git、Diff、Text Stats 的 `bundle` 都是自己的 id，宿主都发得出这份包；四个伙伴插件的客户端工厂各不相同；Coding 的资源里加载 Git、Files 的包（`tests/builtin-plugin-composition.test.ts`）。
- RAC-541：`clientUses` 的客户端拿到 `host.clients[<短 id>]`，以被用插件自己的身份挂载，缺客户端时报错（`tests/builtin-plugin-composition.test.ts`）。
- RAC-542：每个浏览器页面按需加载的包在隔离文档里只加载一次、重开时保留，Coding 的页面同时加载 Git、Files 的包（`tests/workbench-deferred-clients.e2e.test.ts`）。
- RAC-161、RAC-168：Files、Git 的请求只在 `request.ts` 里，其余规则不变（`tests/files-client-bundle.test.ts`、`tests/git-client-bundle.test.ts`）。
- RAC-169：Diff 与 Text Stats 的页面文字每个键都有中英文、没有中文键与动态键；浏览器代码不直接 `fetch`、无 `any`、`as unknown as`、空 `catch`、浏览器弹窗，不写插件 id 与 `/api/plugins/`；构建跑浏览器类型检查并用 esbuild 打包，esbuild 与根同版本；包是 `(host) => {…}` 函数表达式，页面根不是伙伴页面时什么也不挂（`tests/diff-text-stats-client-bundle.test.ts`）。
- 行为不变：`tests/companion-client-lifecycle.e2e.test.ts`（四个伙伴页面在隐藏、拆下、重挂载时的查询与监听，Git/Files 的刷新与恢复）、`tests/coding-workbench.e2e.test.ts`、`tests/plugin-page-reviews.e2e.test.ts`。

## 登记的遗留

- BL-605：3b，Coding 自己的 24 个客户端文件（只有 4 个已在 `src/browser/`）改成打包、类型检查的 TypeScript；体量约 355 KB，单独一个 PR，先搬子客户端、再搬主客户端（同一 PR 的两个提交）。
- 伙伴页面的外壳（返回、状态、刷新）在四个插件里各写了一份：统筹 10-24 定伙伴舞台不公开（PG-055 的 D3），各插件用公开的舞台外壳、图标、按钮自己写，不合成一份。
- 设置页样式表里的 `CODING_STYLES`（PG-072）。
