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
- **级联**：shelf.css/plugin-builder.css 仍排在工作台样式表（以及设置页的 settings.css）之后。离线核对把移出的规则与共用表里排在旧位置之后的规则逐条比（同特异性、属性重叠、可命中同一元素）：Shelf 里被 design-system `craft-finish` 点名同元素的只有五个类——`.shelf-stage-chrome`（`craft-finish-pages.ts:389-404` 的 ≥761px stage grid、`:432-450` 的 ≤760px flex，特异性 0,5,1）、`.shelf-search`（前者同段的最小宽度，0,5,1）、`.shelf-side-menu` 与 `.shelf-find`（`:240` 的暗色菜单背景，≈0,3,2）、`.shelf-drop`（`:472` 的拖拽过渡，0,2,1）——都高于 Shelf 自己的 `[data-shelf] .shelf-stage-chrome`(0,2,0)、`[data-shelf] .shelf-stage-chrome .shelf-search`(0,3,0)，没有同优先级平局；`plugin-stage.ts:82` 的 `> .shelf-stage` 本来就排在插件规则之前。因此 Shelf 整张搬出、`stylesheetShared` 留空，外观不变。创作台移出的规则点名自己的前缀，与共用规则同样没有同优先级平局。PR 评论里「Shelf 的 stage chrome 规则留共用」是核对前的保守说法，交付时已更正；这五个类在 craft 与 Shelf 之间的归属记在 `specs/BACKLOG.md` BL-657（owner 防腐统筹），改动 `craft-finish-pages.ts` 或 Shelf 的 stage chrome 结构时要重跑这条核对。
- **门禁（RAC-769）**：共用样式表里属于具体插件的规则按插件计数、只许减少，新文件/新插件从 0 开始；Feed 与 Goals（外壳直接 import 样式）按用户决定留数字。口径先在 PR #1302 评论说明、统筹 2026-10-25 回复批准后实现；评审 18:23 指出第一版对「有框架插件」跳过、并扣 `stylesheetShared`，等于声明共用就能藏规则，已改成**对每个有样式表的插件都量、不扣 `stylesheetShared`**：`scripts/gates/plugin-styles.mjs` 从构建产物用第 1 片 splitter 找出共用表里的部分（有框架取 `shared`，无框架整张），再不折扣地数其中点名该插件的规则块。记录在 `tooling/gates/plugin-styles.json`（首冻 **coding 9、feed 234、form 6、goals 321、plugin-builder 5，共 575 块**；coding/form 是注册里声明共用的属性/类规则，创作台是宿主预览页画的 `as-preview-page`/`pb-surface`，Feed/Goals 没有框架、由外壳画），只许下降；文件同时记住每个插件的 `stylesheetPrefixes`、只许增加，测量用「文件记的 ∪ 构建声明的」，删前缀会被判失败。`--update` 拒绝任何增长与新插件，CI 在 `architecture-boundaries` 里 page-assets 之后对 merge-base 比对。测试 `tests/plugin-styles-gate.test.ts`（增长、就地抬预算、`--update` 不掩盖、新插件、首冻结、缺构建退出 2、声明共用不能藏规则、前缀只许加、真实仓库逐项相等），口径与看不到的写在 `tooling/gates/README.md`。

### 验收（第 2 片）

| 编号 | 标准 | 证明 |
| --- | --- | --- |
| RAC-763 | Shelf 整张样式成为自己的页面资源：框架与外壳画的设置页都链接它，工作台/设置样式表不再带它的规则 | `tests/plugin-styles.test.ts` |
| RAC-764 | 创作台声明 `as-`/`pb-` 前缀后按前缀拆分；`pc-` 组件词汇与宿主画的那几类留在共用样式表 | 同上 |
| RAC-765 | Diff 的类归 SDK 组件自己的 `mw-diff-*` 名字空间、规则在工作台样式表里；Diff 没有自己的样式表，旧类名不再出现 | 同上 |
| RAC-766 | SDK diff 视图写的每个类都在宿主样式表里有规则（与 /ui 同一份合同） | `tests/sdk-ui-markup.test.ts` |
| RAC-767 | 宿主拒绝不是小写类前缀、占用平台前缀、重复插件 id、同目录重复或两个插件争用的额外前缀 | `tests/plugin-registry-generation.test.ts` |
| RAC-768 | 工作台设置面板在插入抓来的插件设置页之前，先加载它链接的插件样式表 | `tests/plugin-styles.test.ts` |
| RAC-769 | 共用样式表里属于具体插件的规则按插件计数、只许减少；新文件/新插件从 0 开始 | `tests/plugin-styles-gate.test.ts`、`scripts/gates/plugin-styles.mjs`（`tooling/gates/plugin-styles.json`） |

### 第 2 片非阻塞收尾工单（F2，2026-10-25）

状态：已接受，作者实现与定向验证通过，候选待双核及采用。固定父 `d8e4b8b19c4af8de67e22fce760db560d73dd744`；仅承接 FIRST `6401423505` 的三项 nonblock，Claude `6401430781` 及作者 `6401554290` 已明确交修复队列。目标是堵住已知命名空间漏拒绝、消除测试顺序依赖，并准确声明量测盲区；不重新评审或实现原片四项 blocker，不扩成 PG-071、产品发布或组合验收。

| 编号 | 行为与验收 |
| --- | --- |
| PG070-NB-01 | 前缀对应拆分器按完整名字或连字符边界识别的名字空间。除原有完全相等拒绝，`catalogProblems` 也拒绝插件 id 以完整前缀（含尾部 `-`）开头的情形：`text-` 不得覆盖 `text-stats`。用生产目录校验与实际 splitter 验证反例；`tex-`、`stats-`、`textstats-` 等不相交正控通过，现有 `as-`/`pb-` 保持合法。保留格式、平台前缀、重复声明等拒绝，不增加注册字段或产品合同。 |
| PG070-NB-02 | first-freeze 使用既有 `run(dir)` 支持，在自己独立的临时 Git 仓库与计数输入上执行真实门禁，不再删除共享夹具 `main` 的预算。将该场景排到共享夹具的基线用例前，并在其他场景后重复执行；每次验证共享夹具的 refs、预算、计数保持原值，原门禁断言保持。 |
| PG070-NB-03 | 脚本头的已知限制和本 slice 明确：Goals 只量硬编码的 `GOALS_DOCUMENT_STYLES`、`TRASH_GOAL_STYLES`、`PLANNING_SETTINGS_STYLES`；page-assets 新引入第四个常量不会自动计入。新增常量时必须同步 `measureFromBuild` 的枚举并补充/更新真实量测验证，再跑 `plugin-styles-gate.test.ts` 及 `plugin-styles --base`；当前不新增常量、解析器、量测规则或预算。 |

允许修改仅限宿主 `plugin-registry.ts` 的前缀拒绝、两份现有 registry/styles-gate 测试、`plugin-styles.mjs` 的已知限制注释与本 slice。写前核原 DeepSeek `/private/tmp/pg070-slice2` 为 clean；新分支独立实现，保留所有现有树，不写正在 PG-071 返修的 ac-clients 树。必要整体构建走公共 FIFO，一次攒齐改动后构建；定向运行 registry、styles-gate、styles，另核真实 plugin-styles、boundary、health 与推送前 secrets；不重 full 或浏览器批。

父 d8e 的 page-assets 增长及真实仓库用例红保留为未通过，原作者「171/171 通过」与真实用例失败的计数矛盾由原 owner 校正。本单如实核对资源门禁，不增加 ceiling，不改预算、baseline、CI、translations、Memory；原片的源审、组合 CI/full 和采用仍归原链。

作者验证：一次公共 FIFO 整体构建通过，公开重算与 `18:53:13.201Z` 构建的 `1e66c855d75d9c2e87301c079754da6b68222f02fb2a48cfd18050a0099eb341` 一致。registry 13/13、styles-gate 15/15、styles 11/11，自然退出 0；补强 id 中间子串的正控后，仅重跑 registry 13/13。有效覆盖并集 39，first-freeze 排前一次、其他场景后连续两次，均核共享 refs/预算/计数未变。真实 plugin-styles（5 插件、575 块）、boundary、最终 health（merge-base `54437998`）通过；本增量不改 API。

资源门禁自然退出 1：coding.js 289351→289396（+45），workbench.js 1124811→1125453（+642），保留原片红灯，不写成全绿。原父树当前 clean，但尝试复用其现存构建时，清单 `57063e0c…39dbd0` 与现场公开重算 `c2371482…a51258` 不一致，探针在进入业务断言前停止；该准备失败原件保留，不作为有效父源码产品反例，不改或重建原树。二轮复审 `6401640865` 新增的两项 nonblock 由 Root 另定范围，本单不并入。

### 第 2 片前缀冻结工单（F2，2026-10-25）

状态：已接受，作者实现与定向验证通过，候选待双核及采用。唯一固定父 `aead2e0becc4417c56ec27516fe4280b4e86f2a7`；来源仅为 #1302 评审 `6401640865` 的 nonblock 1、2。本单交付可验证的门禁修复，不改生产 splitter、注册、CSS、资源预算或 PG-071。

| 编号 | 行为与验收 |
| --- | --- |
| PG070-PF-01 | 每个插件的预算前缀与构建声明按集合相等校验：拒绝漏记新增声明，也拒绝不再声明的已记前缀。首次按需拆分只用当前声明，与生产 `splitOf` 一致；共享余量计数才用每个插件的 reference、当前预算、当前声明的并集，任何集合不得覆盖历史记忆。 |
| PG070-PF-02 | check 与 update 用完整候选和同一 reference 约束：有 `--base` 时读真实 merge-base，无 `--base` 时读 HEAD 已提交预算；首次冻结仍允许。余量不增长时允许新增并记录前缀，即使该插件仍有正计数；两者均拒绝增长、reference 未登记的正计数插件、丢弃历史前缀。update 被拒绝时文件字节不变。 |
| PG070-PF-03 | 用最小合成 dist 数据、真实生产量测与公开包的实际 splitter 验证漏记拒绝、正余量合法新增 update 后 check 通过；真实提交并推进 main 后，再提交同时删除声明和预算前缀，`--base` 必须失败，report 量到回流规则。另验 base/head 前缀并集和有/无 base 的无增长删除拒绝且不写文件。保留原增长、洗预算、新插件、删条目、首冻结前后重复、缺构建和真实仓库用例；保存准确旧 aead 脚本的有限业务反例。 |
| PG070-PF-04 | 脚本头、README 与本 slice 明确已知盲区：混合选择器列表 `.feed-card,.other{…}` 因并非每项都点名插件而留共享且不计数；`:is(.feed-card){…}`、`:where(.feed-card){…}` 中唯一的名字空间会被剥去，同样不计数。本轮只补说明。Goals 仍只量 `GOALS_DOCUMENT_STYLES`、`TRASH_GOAL_STYLES`、`PLANNING_SETTINGS_STYLES` 三个枚举常量；第四个不会自动发现，新增时须同步量测与真实构建验证。 |

允许写入 `scripts/gates/plugin-styles.mjs`、`tests/plugin-styles-gate.test.ts` 及必要的仅测试夹具、`tooling/gates/README.md` 和本 slice。`tooling/gates/plugin-styles.json` 默认不改，数值与 prefixes 映射须字节不变。独立分支 `feature/pg070-prefix-freeze`，保留原作者与旧候选工作树。一次公共 FIFO 整体构建后，跑完整 styles-gate 与既有 styles 定向回归、真实 gate、boundary、health、导入与构建绑定检查；推送前 fresh fetch/secrets。实际仓库应保持 5 插件 / 575 块；变化如实报告，不能抬预算。

父片 page-assets 的 coding.js +45、workbench.js +642 红灯与旧 d8e 的构建绑定缺口继续保留；沿用已核实旧证据，不借本单改 ceiling、baseline、limits、CI 或重跑 171/full/浏览器/CSS 批。完成本候选后将精确 parent/head/diff、构建源绑定及 raw 交既有 REVIEW/TEST 双核；F2 亲读两份最终原文和 raw 后直接交 PIPE 与 Root，不等待载体 full/CI。

作者验证：一次公共 FIFO 整体构建自然退出 0，`2026-10-25T19:58:47.012Z` 清单的 `c37d3c0aea786fa41658210d9cb917aa63c18ce8786bf5228222c3c9e6291803` 与公开重算一致。完整 styles-gate 22/22、既有 styles 11/11，自然退出 0，共 33 个用例；旧 aead 精确脚本（Git blob `e9c96c8ed077d177d7e171e3045163cb0d4ac9f0`）在另存的五个有限业务探针中 0/5、自然退出 1，修复脚本同样探针 5/5、自然退出 0，未把重叠探针加进 33。探针使用未改的真实构建 splitter/on-demand 函数，没有省略准备检查。真实 gate 对实际 merge-base aead 通过 5 插件 / 575 块；boundary、health（同父比较）、导入无混用均通过。预算文件、生产 splitter/注册/CSS 和资源门禁输入完整未改；raw 位于 `/tmp/molis-verify-2026-10-25/pg070-prefix-freeze/`。
