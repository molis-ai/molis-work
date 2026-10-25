# PG-070：插件自己的样式按需加载

状态：执行中（2026-10-25）。页面在框架里运行的插件，把名字空间下的规则作为 `/assets/molis-work-plugins/<id>.css` 单独发，只有要用的框架链接；工作台样式表因此少了 247,609 字节，15 个新样式表合计 247,526 字节，总量不增。与 PG-071 同一个 PR，叠在 #1288（PG-056）之上；浏览器用例在 PR 的全量里跑。

验收编号：RAC-756～762。

## 范围

- **拆分**（`apps/workbench/src/plugin-styles.ts`）：一条规则的每个选择器都点名了插件自己的类或 `data-` 属性（`.<id>`、`.<id>-…`、`[data-<id>…]`），且名字不在 `:not()`、`:is()`、`:where()` 里，规则才移出，所以它只能匹配到插件自己的元素；别的规则、`@keyframes`、`@font-face`、`@import` 原样留在共用样式表，`@media`/`@supports`/`@container` 里的规则在组内各自分开。拆分只看名字，不改任何一条规则适用的对象。
- **谁拆**：页面在框架里运行的插件（有客户端）。没有客户端的插件（Feed 等，外壳自己画）整张样式留在共用样式表。第 1 片时还有设置页的插件不拆（Shelf），第 2 片改成也拆、由外壳画设置页时链接它（见下）。
- **合同**：`PluginWorkbenchRegistration.stylesheetShared`（命名空间里宿主或共用库在框架之外也画的类，规则留在共用样式表）和 `stylesheetUses`（框架也画了别的插件的类，要链接它们的样式表；`clientUses` 里的已经算）。
- **接线**：`pluginSurfaceClients()` 的 `styles` 给出一个框架要链接的样式表（自己的在前，再是用到的）；`renderPluginFrameSurface` 把这些 `<link>` 放在交给框架的页面最前面，所以它们在框架里排在工作台样式表（框架 head 里链接）之后、页面自己的规则之前；框架的策略本来就允许 `/assets/` 下的样式表。宿主在 `/assets/molis-work-plugins/<id>.css` 发它们，没有自带规则的插件那个地址不发。组件板的「插件行视图」页画了有样例的插件的行，同样链接这些样式表。框架脚本和工作台脚本一个字节没加。
- **门禁**：页面资源门禁认 `.css` 的插件包路径，15 个新样式表按用户批准（2026-10-25）一次登记；`workbench.css` 的预算同时降下来。

## 级联顺序（本片定的）

共用样式表先到，插件自己的样式表后到：同样的优先级下，插件自己的规则排在宿主的规则之后。离线核对过（工具不入库）：移出的规则与排在它们后面的共用规则之间，没有「优先级相同、设置同一属性、选择器又能匹配同一元素」的情形，所以搬位置不改变任何一个元素的最终样式。

## 保留的限制

- 靠源码扫描找「框架之外也画的类」：运行时拼出来的类名找不到。`tests/plugin-styles.test.ts` 的精确对照挡的是漏列和多列，挡不住拼出来的类名；这类情形靠框架页面的浏览器用例兜底。
- 插件创作台与 Alchemist 不迁（绕过）——第 1 片的限制；第 2 片用 `stylesheetPrefixes` 搬走创作台的 `as-`/`pb-` 规则，逻辑与类名没改（见下）。Alchemist 仍只有 151 字节可以移出，留给它自己那片。
- Diff 的规则都点名了 SDK 的 diff 视图画的类——第 1 片的限制；第 2 片按 SDK 组件自己的名字空间处理（见下）。

## 对插件和调用方的影响

- 新增注册字段 `stylesheetShared`、`stylesheetUses`（合同 `plugin-registration`，API 快照已刷新）。没有改 Manifest、动作、路由和库结构。
- 新资源：`/assets/molis-work-plugins/<id>.css`（cognia、pages、form、dataset、ppt、lingguang、todo、workflows、coding、files、git、jelly、images、schedule、alchemist）。
- 测试里读工作台样式表的用例，要看插件规则的改读 `tests/workbench-renderer-fixture.ts` 的 `renderMolisWorkWorkbenchWithPluginStylesheets`；Pages 的八个浏览器用例在页面里多链接 `pages.css`。

## 验收

| 编号 | 标准 | 证明 |
| --- | --- | --- |
| RAC-756 | 只有每个选择器都点名插件自己的类或属性的规则才移出；`:not()`、`:is()`、`:where()` 里的名字、列为共用的类、别的类、`@keyframes`、`@font-face`、`@import` 都留下；组内规则各自分开 | `tests/plugin-styles.test.ts` |
| RAC-757 | 内置各插件的样式拆完不丢规则，移出的与留下的都再拆不动；没有框架的插件整张留在共用样式表；移出的合计有实质分量 | 同上 |
| RAC-758 | `stylesheetShared` 恰好是宿主、共用库和外壳自己画的插件用到的命名空间类；别的框架插件用到的类，要在 `stylesheetUses`（或 `clientUses`）里写上 | 同上 |
| RAC-759 | 框架页面最前面是它自己的样式表与用到的样式表，没有规则的插件不加链接；标准视图按 bundle 取样式表；链接在不透明数据里，不在外壳标记里 | 同上 |
| RAC-760 | 宿主在插件样式表的地址发它，没有样式表的插件那个地址不发，客户端包的地址照旧 | 同上 |
| RAC-761 | 框架 head 链接工作台样式表、页面里插件样式表在后；框架策略只允许 `/assets/` 下的样式表 | 同上 |
| RAC-762 | 组件板的插件行视图链接样例插件的样式表，在工作台样式表之后；回复部分不链接 | 同上 |


## 第 2 片：Shelf、Diff、插件创作台（2026-10-25，RAC-763～769）

接着第 1 片，把最后三块整张留在共用样式表里的插件规则搬出去，并给「共用样式表里还剩多少插件的规则」加门禁。

- **Shelf**：`settingsClient` 不再阻止拆分（`plugin-workbench.ts` 的 `splitOf`），`SHELF_STYLES` 整个成为 `/assets/molis-work-plugins/shelf.css`。框架页照旧由 `pluginSurfaceClients()` 的 `styles` 链接；外壳画的设置页加两条：`GET /settings/shelf` 的文档在设置样式表之后链接它（`pluginSettingsStyleLinks(contribution_id)`，按贡献 id 找包），工作台里的设置面板把抓来的文档里 `/assets/molis-work-plugins/*.css` 的链接去重插进 `document.head` 并等加载后再插入页面（`scripts/client/settings-directory.ts` 的 `ensureStyleSheets`）。`renderMolisWorkSettingsStylesheet()` 不再包含插件样式。
- **Diff**：27 条规则只画 SDK `diff-view` 的类，Diff 插件自己没有独有标记，所以不新建 `diff.css`，而是把类名收到 SDK 组件的名字空间（`diff-*` → `mw-diff-*`，只改类名、不改逻辑），规则搬进 design-system 的 `DIFF_VIEW_STYLES`，由工作台样式表下发（`page-assets.ts` 里仍排在原共用样式的位置）。Diff 的登记删掉 `stylesheet`/`stylesheetShared`，Coding 的 `stylesheetUses: ["diff"]` 随之删掉，`plugins/native/diff/src/styles.ts` 删除。`data-*`、`--diff-*` 变量和动作 id 不变。
- **插件创作台**：`PluginWorkbenchRegistration` 新增 `stylesheetPrefixes`（额外类/属性前缀，`as-`、`pb-` 这种类名早于 id 的插件用），拆分按「id 名字空间 + 声明的前缀」判定；宿主在 `catalogProblems` 里拒绝不是小写前缀、占用平台前缀（`mw-`、`pc-`）、重复插件 id、同一条目录里重复或两个插件争用的前缀。创作台声明 `["as-", "pb-"]`，`stylesheetShared` 列 `as-preview-page`、`pb-surface`（宿主的预览页/舞台画它们）；`pc-` 组件词汇整张留在共用样式表（预览页与已装插件页只链工作台样式表）。逻辑与类名一个没改。
- **级联**：shelf.css/plugin-builder.css 仍排在工作台样式表之后。离线核对移出规则与排在旧位置之后的共用规则：Shelf 的 `[data-shelf] .shelf-stage-chrome`(0,2,0)、`.shelf-search` 与 design-system `craft-finish` 的同元素规则（0,5,1）等没有同优先级平局，`stylesheetShared` 因此留空；创作台的规则点名自己的前缀，与共用规则没有同优先级平局。PR 评论里「Shelf 的 stage chrome 规则留共用」是核对前的保守说法，交付时已更正。
- **门禁（RAC-769）**：共用样式表里属于具体插件的规则按插件计数、只许减少，新文件/新插件从 0 开始；Feed 与 Goals（外壳直接 import 样式）按用户决定留数字。写门禁代码前先在 PR #1302 评论说明「一条规则属于哪个插件」的口径并等统筹回复（2026-10-25 已发，等回复后落）。

### 验收（第 2 片）

| 编号 | 标准 | 证明 |
| --- | --- | --- |
| RAC-763 | Shelf 整张样式成为自己的页面资源：框架与外壳画的设置页都链接它，工作台/设置样式表不再带它的规则 | `tests/plugin-styles.test.ts` |
| RAC-764 | 创作台声明 `as-`/`pb-` 前缀后按前缀拆分；`pc-` 组件词汇与宿主画的那几类留在共用样式表 | 同上 |
| RAC-765 | Diff 的类归 SDK 组件自己的 `mw-diff-*` 名字空间、规则在工作台样式表里；Diff 没有自己的样式表，旧类名不再出现 | 同上 |
| RAC-766 | SDK diff 视图写的每个类都在宿主样式表里有规则（与 /ui 同一份合同） | `tests/sdk-ui-markup.test.ts` |
| RAC-767 | 宿主拒绝不是小写类前缀、占用平台前缀、重复插件 id、同目录重复或两个插件争用的额外前缀 | `tests/plugin-registry-generation.test.ts` |
| RAC-768 | 工作台设置面板在插入抓来的插件设置页之前，先加载它链接的插件样式表 | `tests/plugin-styles.test.ts` |
| RAC-769 | 共用样式表里属于具体插件的规则按插件计数、只许减少；新文件/新插件从 0 开始 | 门禁（统筹回复口径后写） |
