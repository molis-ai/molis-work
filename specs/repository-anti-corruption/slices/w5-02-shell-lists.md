# W5-02 PR-D 外壳与设置的手写名单、PG-063（ac-shell 接手）

状态：统筹 2026-10-25 已裁 Q1～Q4（见 §4），PR-D1 已实现（四个提交：PG-076 余项与 PG-073 ①②；PG-074；PG-072；本稿与门禁收尾），在 `claude/ac-shell-lists`，基线 batch-37（`batch/1025-37`）。PG-075 留给 PR-D2，等 PG-055 合入。PR-D（PG-072～076）从 ac-registry 移来，加 PG-063；设计依据是 ac-registry 分支 `w5-02-registry.md` §5，事实按本分支头重核。

验收编号：RAC-690～709（RAC-700 为 PG-060 余项）。BL：BL-656～665（暂未取用）；余项核对发现的记 BL-636。

## 0. 结论

- **PG-063 已经做完**，不用再做：R11（#1169，RAC-135～137）已把 Inbox、灵光的按钮改成 `data-context-intake="todo"`，工作台与宿主不再认识 Todo 的输入；`data-make-todo` 在源码里一处都没有（`tests/todo-from-inbox.test.ts` 断言它不出现），`plugin-page-todo.ts`、`plugin-frame/todo.ts` 已删。privileges.md 的 PG-063 行还写「待做」，是没改状态；`slices/r11-intake-generic-handoff.md` 开头写明「状态由统筹合入后统一改」。**本 PR 不碰它，请统筹改 PG-063 的状态列。**
- **PG-076 四项里三项已做**：目标输入的 `CREATE`（我的第 1 片，#1261）、助理设置的 `SURFACES`（`settings-assistant.ts` 里已没有）、Todo 的初始化接线（`initialization.ts` 里已没有，随 R11 删）。只剩 Pages 的 `searchRow` 借 Feed 的类名。
- **PG-072、073、074 还有活**，见 §1、§2；**PG-075 排在 PG-055（ac-clients-1）之后**，本稿只写它的设计与前提，不先做。
- 做法：**一个 PR（PR-D1）收 PG-076、073、074、072**，四个提交，每个提交单独可验；PG-075 单独一个 PR（PR-D2），PG-055 合入后开。

## 1. 重核：还剩什么，声明在哪，谁读

| PG | main 上还在的 | 改成：声明在哪、谁读 |
| --- | --- | --- |
| 076 | `plugins/native/pages/src/registration.ts:21` 的 `searchRow: { selector: "button.feed-stage-entry[data-page-id]" }` 借用 Feed 的 `feed-stage-entry` 类（Pages 行的类名也是 `feed-stage-entry`，`browser/list.ts:24`，`styles.ts` 里的样式也按这个类写） | Pages 的行选择器只用自己的属性：`[data-page-id]`（`idDataset: "pageId"`）。类名保留（样式不动，界面不变），选择器不再靠它。读的人不变：`pluginSearchRows()` |
| 073 | ① `tab-workspace.ts:1168` 的 `SEARCH_ROWS` 与 `global-search.ts` 的 `RECORD_ROWS` 在声明之外手加了 `["feed", "[data-feed-task-toggle]", …]` 与 `["characters", "[data-character-id]", …]` 两行；② `tab-workspace.ts:199` 的标题查找写死 `[data-feed-entry-id]`、`[data-inbox-row][data-inbox-entry-id]`；③ `tab-workspace.ts:249` 的 `plugin === "feed"` 分支；④ `global-search.ts:248` 的 `surface === "artifacts"` | ① 两行手加的行从两个脚本里拿出来，写在一处具名常量（`apps/workbench/src/search-rows.ts`）：Characters 不是插件（`modules/characters`，没有 `PluginRegistration`），它的行是**平台自己的一行**（平台事实归平台，统筹 10-25 裁）；Feed 的行（来源开关）**不进 Feed 的登记**——我原想声明成 Feed 的 `searchRow`，但 `placement.ts` 用 `pluginSearchRows()` 判断「按行开记录」，Feed 一进名单，从来源引用打开的 Feed 条目就从开条目标签变成按行开记录，行为会变；所以它留作具名的「FI 线待迁」一行，随 Feed 来源目录迁到 Runtime（PG-034、PG-093）一起进 Feed 的登记。② 标题查找读已声明的行（`pluginRecordRows()` 加 `pluginSearchRows()`），不点 Feed、Inbox。③ 只剩 Feed 的任务切换，属 FI 线（PG-034/093），**不在本 PR**，留作登记。④ 随 ac-artifacts A6（平台面），**不在本 PR** |
| 074 | `immersive-shell.ts:97` 的 `RAIL_CORE_ORDER = ["goals","inbox","feed"]`；`:106` 的 `RAIL_EXTEND_PLUGIN_IDS = {"plugin-builder"}`；`plugin-catalog.ts:111` 的 `DOCK_DEFAULT_PINS = ["goals","inbox","feed"]`（`navigation-presentation.ts`、`primitive-catalog.ts` 也读）。`SURFACE_OVERRIDES = { goals: "goal" }`（改名表，不是分组）与 `locked = plugin.id === "goals"`（Goals 不能移除）属 Goals S11（ac-sc3），**不在本 PR** | `UiViewDeclaration` 加两个可选字段，只给 `navigator` 视图：`rail?: "core" \| "extend"`（骨干；扩展入口）和 `pinned_default?: true`（Dock 默认固定）。骨干顺序按视图的 `order`；三个骨干、三个默认固定、Plugin Studio 的扩展入口都在各自的 Manifest 视图里写。读的人：`renderPluginRail`、Dock 脚本、规格板样本；用户设置（Dock 里自己固定的）照旧覆盖 |
| 072 | `web-catalog.ts:168-206` 的插件设置页：`SHELF_SETTINGS_UI_CONTRIBUTION_ID` 与 `CODING_SETTINGS_UI_CONTRIBUTION_ID` 两个按 id 分支，宿主自己取 Shelf 的快照（`shelfActions.snapshot`）、自己拼 Coding 的模型（角色、方法读 `codingAgentManifest`，运行时读 `codingRuntimes()`，再加项目列表）。宿主因此 import `plugin-coding`、`plugin-shelf` | 设置页的视图在 Manifest 里声明它的**读动作**：`UiViewDeclaration.settings_data?: { action: string }`（`slot: "settings"` 才有）。宿主走一条通用路：找到该视图 → 用调用者身份调这个动作 → 把结果交给贡献渲染。平台自己能给的（项目列表、当前项目、Agent 运行时列表）由宿主按**固定形状**交给所有设置页（`SettingsPageContext`），不按插件分支。Shelf 的快照是它自己的动作，声明即可；Coding 的角色、方法是 Manifest 里的静态事实，由 Coding 的读动作返回，运行时列表来自上面的固定上下文。删 `web-catalog.ts` 里两条分支和对两个插件包的 import。读的人：`web-catalog.ts` 那一条通用路 |
| 075 | `packages/design-system/src/palette.ts` 的 `MW_PLUGINS`（27 条，id、标签、色相，读它的有 `tab-workspace.ts:49`、`plugin-tab-groups.ts:4`）与 `icons.ts` 的 `PLUGIN_ICON`（读它的有规格板 `primitive-catalog.ts`、`tests/soft-workbench-refinement.test.ts`） | **等 PG-055**（ac-clients-1 正在把图标名单挪进 SDK 的 `PluginIconName`）。图标读 Manifest 视图已有的 `icon`；色相加一项 Manifest 声明（限定在 design-system 的色名里，`hue`）。两张表删掉，「每个插件图标唯一」的测试改读 Manifest。PR-D2 |
| 063 | 无（见 §0） | 已做，只改状态 |

## 2. 验收（草稿，RAC-690～709）

| 编号 | 验收 | 证明 |
| --- | --- | --- |
| RAC-690 | Pages 的行选择器只用 `[data-page-id]`；类名不变，行为不变（点行、⌘/Ctrl 点开新标签、搜索命中跳到行） | `tests/` 里 Pages 的搜索与标签用例（非浏览器的声明断言；点击由统一浏览器批证明） |
| RAC-691 | 两个页面脚本里没有按插件写的搜索行；Characters 行（平台）与 Feed 来源行（FI 线待迁）具名写在 `search-rows.ts`，仍写进页面 | 源码扫描 + `pluginSearchRows()` 的断言 |
| RAC-692 | 标签标题查找不点 Feed、Inbox 的选择器，读声明的行 | 脚本文本断言 |
| RAC-693 | `UiViewDeclaration.rail`（`core` \| `extend`）、`pinned_default`（`true`）存在，只许 `navigator` 视图用，别处写了、取值不对被 Manifest 检查拒绝（拒绝本身有测试）。只有项目选择的内置插件的声明被采信：运行时装的插件（`chosen: false`）在 `sanitizePluginDirectory` 里被去掉 | `tests/view-placement-declarations.test.ts`（RAC-693）+ `tests/plugin-picker-pins.test.ts`（RAC-695 的第二条）+ 快照（`pnpm api:update`） |
| RAC-694 | `RAIL_CORE_ORDER`、`RAIL_CORE_PLUGIN_IDS`、`RAIL_EXTEND_PLUGIN_IDS`、`DOCK_DEFAULT_PINS` 四个名字删除（`dockDefaultPins()`、`extendPluginIds()` 读视图声明）；骨干顺序（goals 10、inbox 30、feed 40）、扩展入口（Plugin Studio）、默认固定与改之前相同 | `tests/shell-declared-lists.test.ts`（源码扫描与 Manifest 声明）、`tests/plugin-picker-pins.test.ts`（画出的导航） |
| RAC-695 | 一个新插件只靠 Manifest 视图的声明就能出现在骨干 / 扩展位、能被设为默认固定；只写 `rail: "extend"` 不等于固定 | `tests/plugin-picker-pins.test.ts` 的探针目录 |
| RAC-696 | `UiViewDeclaration.settings_data` 存在，只许 `settings` 槽的视图用；声明的动作必须是本 Manifest 自己的、只有一个版本的、只读的、受众含 `user` 的查询，否则被 Manifest 检查拒绝 | `tests/view-placement-declarations.test.ts`（RAC-696 十条）+ 快照 |
| RAC-697 | `web-catalog.ts` 的插件设置页只有一条通用路（`SettingsPageContext` + `settings_data` 的结果），没有 Shelf、Coding 两个分支，宿主不再 import `plugin-coding`、`plugin-shelf` 做设置页；Shelf 声明 `shelf.snapshot`，Coding 只用平台上下文 | `tests/shell-declared-lists.test.ts`（RAC-697）+ `pnpm boundary:check` |
| RAC-698 | Shelf、Coding 的设置页内容与改之前相同（同样的输入画出逐字相同的页面） | `tests/shell-declared-lists.test.ts`（RAC-698，对拍旧模型直接渲染）；整条路由由 `tests/coding-product-http.test.ts` 与 `tests/plugin-global-settings.test.ts` 过 |
| RAC-699 | 外壳与设置的源码里，按插件名列的表只剩登记的例外（Goals S11、FI 线、A6 各一行，带理由），门禁数字对 merge-base 只许减少 | `node scripts/check-health-gates.mjs --base origin/main`（宿主文件里点名内置插件包的文件数少一份：`web-catalog.ts` 不再 import `plugin-shelf`、`plugin-coding`） |
| RAC-700 | 舞台的「类型」标签（`.plugin-stage-kind`）没有按插件写的行：表单、数据集、PPT、页面、灵光五行都解析成 `--ink-soft`，与中性的那一条重复，删掉；样式表里只剩 `.plugin-stage-kind[data-kind]` 一条 | `tests/visual-foundation.test.ts`（RAC-700） |
| RAC-701 | `UiViewDeclaration.hue`（`UI_VIEW_HUES`，设计系统的 14 个色名）存在，任何槽的视图都可写；写了不认识的名字（或色值、非字符串）被 Manifest 检查拒绝；合同的色名与设计系统的 `MW_HUES` 是同一份 | `tests/view-placement-declarations.test.ts`（hue 四行）、`tests/plugin-hue-declaration.test.ts` |
| RAC-702 | 23 个带颜色的内置插件在自己的 Manifest 里声明与删表前相同的色相（逐个钉死，issues 本来就没有） | `tests/plugin-hue-declaration.test.ts` |
| RAC-703 | 目录只采信设计系统的色名，别的丢掉；页面数据 `data-plugin-directory` 给每个插件它第一个写了 `hue` 的视图的色，没有写 `null` | 同上 |
| RAC-704 | 设计系统不再导出 `MW_PLUGINS`、`PLUGIN_ICON`；主题令牌与三份样式表里没有任何按插件的 `--plugin-<id>` | 同上 |
| RAC-705 | 中性色规则（`--plugin-tint: var(--ink-soft)`）的选择器不点任何插件的 id；设置目录里没有按插件写的行 | 同上、`tests/primitives.test.ts` |
| RAC-706 | 标签条的组色：插件取页面目录里它的 `hue`，工作台自己的几个面（home、characters、workspace、settings）取工作台的小表，其余按 id 在备用色里挑一个且稳定；标签页脚本里没有按插件的色表 | 同上（跑真实的组工厂）、`tests/plugin-tab-groups-multiselect.test.ts` |
| RAC-707 | 规格板的图标清单与「每个插件图标唯一」读 Manifest（`pluginTabGlyphs()`），设计系统不留插件图标表 | 同上、`tests/soft-workbench-refinement.test.ts` |
| RAC-708 | 运行时装进项目的插件（`chosen: false`）与内置插件待遇一样：它的 `hue` 同样进页面数据 | 同上 |
| RAC-709 | 留给实现里发现的 | |

## 3. 开工前核对

- **碰同一批文件的在途 PR**：#1280（`web-catalog.ts`，ac-kernel）、#1278（`plugin-catalog.ts`、`plugin-workbench.ts`，W5-04 第三组）、#1277（`plugin-workbench.ts`、`contracts/platform/ui.ts`、`coding/src/ui.ts`，平台零散特权行第 2 组）、#1262（`pages/src/registration.ts`，W5-02 PR-A）、#1259（`immersive-shell.ts`、`plugin-catalog.ts`，ac-trust T3）、#1101（`coding/src/manifest.ts`、`ui.ts`）、#1274/#1275/#1272（我的前几片，随 batch-37）。`contracts/platform/ui.ts` 是共享核心：RAC-693、696 改合同，按共享核心跑批；按 §1a 与 #1277 同批落。
- **#1281（ac-registry PR-B）** 改 `BUILTIN_PLUGIN_CATALOG` 的消费方，D 的 `plugin-catalog.ts` 改动要在它之后；我开工前再看它的头。
- 本机只做：`pnpm build`、`pnpm api:update`（改合同）、`check-health-gates --base origin/main`、`boundary:check`、`page-assets` 检查、`secrets:check`，以及直接改到的非浏览器用例；不跑浏览器批、全量。

## 4. 统筹的裁定（2026-10-25，已定）

- **Q1（PG-072 的数据怎么来）**：视图声明读动作 + 宿主给固定的平台上下文（照推荐）。
- **Q2（PG-074 字段形状）**：`rail` + `pinned_default` 两个字段（照推荐）：默认固定是用户可改的偏好，骨干是平台排版，分开不会以后拆。
- **Q3（Characters 行）**：平台模块，不是插件，它的搜索行留作平台自己的具名一行（照推荐）；理由：平台事实归平台。
- **Q4（范围）**：同意。feed 切换分支 → FI 线（ac-sandbox-sched）、artifacts 字面量 → A6（ac-giants）、Goals `locked` / `SURFACE_OVERRIDES` → S11（ac-sc3），在 privileges 对应行写明归属，由统筹在批里改状态列；PG-075 单独 PR-D2，等 PG-055 合入后做。PG-063 的状态列统筹在 batch-37 里改成「已做（R11 #1169，RAC-135～137）」。

## 5. 实现时与草稿不同的地方（PR-D1）

- **Coding 的设置页不声明 `settings_data`。** 草稿写「Coding 的读动作返回角色、方法」；实现时发现 Coding 是项目级插件，设置页在 Home 下打开（没有项目），给它加一个 Home 范围的读动作只为返回它自己的常量是多余的登记。角色、方法本来就是 Coding 自己的 `codingAgentManifest`，由它的贡献（`codingSettingsModel`）自己读；宿主只给平台的固定上下文（项目、当前项目、Agent 运行时）。输出逐字相同（RAC-698）。`settings_data` 留给真正有自己数据的页，Shelf 声明 `shelf.snapshot`。
- **`SettingsPageContext` 的 `project` 带宿主算好的工作台地址**（`/projects/<id>/`），页面不拼地址。运行时列表对每个插件设置页都取一次（以前只在 Coding 页取）；该函数读的是宿主已有的运行时目录。
- **`rail` / `pinned_default` 只采信 `chosen` 的内置条目**：`sanitizePluginDirectory` 对 `chosen: false`（运行时装的插件）把两个字段去掉，`dockDefaultPins()` 与 `extendPluginIds()` 也只看 `chosen`。
- 顺手删掉 `ui-composition.ts` 里没人调用的 `renderShelfSettingsContribution`（它的参数类型是旧的 Shelf 模型）。

## 6. 余项核对（PG-060 余项、PG-088，2026-10-25，叠在 PR-D1 上）

统筹要求在 PG-074 之后再核一遍 BL-387 与 PG-060 还剩什么，以及 PG-088 的引导与 Pages 宿主装配。逐项事实：

| 项 | 结论 | 依据 |
| --- | --- | --- |
| BL-387（`goal-inputs-html.ts` 的 `CREATE`、`placement.ts` 的 `names`、`project-home.ts` 的 `starts`） | 已做，行早已不在 | W5-06 余项第 1 片 #1261（RAC-600～604），本分支的 `specs/BACKLOG.md` 没有 BL-387；`origin/main` 还有那一行是因为 batch-37 尚未落 |
| BL-388（对象标签名单）、BL-542（运行时安装的插件的 `group` / `creates` / `start`） | 已做 | 第 2 片 #1272（RAC-605～611），`plugin-directory.ts` |
| BL-430 | main 上没有这一行，无事可做 | `git grep BL-430 specs/BACKLOG.md` |
| PG-060 的「标签标题兜底表」「规格板」 | 已做 | #1112（batch-33） |
| PG-060 的 `global-search.ts`、`goal-inputs-html.ts` 里剩下的 `goals` / `artifacts` 字面量 | 不在本线 | Goals S11、成果库 A6，privileges PG-073 ④ / PG-074 已写明归属 |
| `.plugin-stage-kind[data-kind=…]` 五行（form、dataset、ppt、page、lingguang） | **本片删**（RAC-700）。五行都是 `--status-tone: var(--plugin-<id>)`，而 `--plugin-*` 全部定义为 `var(--ink-soft)`（`palette.ts` 的 `pluginCustomProperties`），与紧邻的中性规则重复；没有任何代码再发出这五个 `data-kind` | `tests/visual-foundation.test.ts`；`workbench.css` 变小 |
| `PLUGIN_ENGLISH_NAMES`（`plugin-catalog.ts`，七个内置插件的英文名） | **发现，不在本片做**：这是第三个按插件 id 手写的表，第三方插件没有同样待遇；但要改成 Manifest 声明需要一个合同新字段（字段名要定），也不能并进界面翻译词典（「成果」「图片」在词典里已有别的英文，会新增翻译冲突）。记 BL-636，可与 PG-075 的显示声明同一次改合同 | `specs/BACKLOG.md` BL-636 |
| `SAMPLE_PROJECT_PLUGINS`（`primitive-catalog.ts`，规格板的样例项目） | 留：是规格板自己的固定样例（开发工具，文件头写明），不是外壳行为；外壳画的目录读 `builtinPluginDirectory()` | 注释 |
| `page-plugin-visibility.ts` 的缺省 `["goals","inbox","feed","artifacts"]` | 留：只在没有宿主给 `shown_plugins`、`enabled_plugins` 的页面（规格板、夹具）生效，文件头写明；宿主页面一律给 `shown_plugins` | 注释 |
| PG-088 引导流程 | 已做，不再改 | W5-06 余项第 4 片 #1275（RAC-615～618）：`context-onboarding-service.ts` 不再 import `blocksFromMarkdown` 与 ProseMirror，Markdown→正文走 `pages.documents.body_from_markdown` |
| PG-088 的 Pages 宿主提供方、根路由、构建期装配 | 已删，不需要再做 | #847 删宿主四个 Pages 文件与根路由；本分支 `apps/local-host/src` 里没有 `/api/pages`、没有 Pages 的提供方、没有 `resolveModelPrompt` 的 Pages 调用；宿主对 Pages 包的其余点名都在别的行（监督器条目与生成登记表是正路，`content-action-providers.ts` 的权限点名单是 PG-007，`inbox-actions.ts` 是 Inbox 线，`artifact-native-plugin-http.ts` 是 A6，`apps/local-host/src/web-assets.ts:115` 仍用 `requireAsset.resolve("@molis-ai/molis-work-plugin-pages/editor")` 为 `/assets/` 发放 Pages 编辑器资源，归 [PG-070](../privileges.md) / W5-04 的插件客户端包与页面资源职责） |

privileges.md 的 PG-088 状态格已按上面写清依据（统筹 10-25 要求）；PG-060 的状态格由统筹在合入后改（本片之后外壳里按插件手写的行只剩上表中归别线的几项和 BL-636）。

## 7. FIRST 后的设置数据修复（Codex 实现2）

Root 接受的 WO 绑定 #1293 的 `ec3e0c3ad5c4ca8f0a445a7259071e58b43ea7d4` 与首评 [6398256968](https://github.com/molis-ai/molis-work/pull/1293#issuecomment-6398256968)。修复在独立 `feature/codex-pr1293-settings-data`，不改原作者树，不接管全局状态、编号或资源预算；不另开 PR。

- 文档如实限定：`settings_data` 目前只对内置设置贡献兑现；已安装 Runtime 插件接入设置贡献与数据动作仍是缺口，本次不实现动态支持。
- 默认 contribution id 沿用 `declared-stages.ts` 的既有规则，将该规则供同层设置目录复用；不改其他层的重复处、不从工作台公共入口增加导出。显式 id 与默认 `<plugin_id>.<view_id>` 的结果不变。
- `web-catalog.ts` 写明设置数据查询有意以个人 `LOCAL_OWNER_PERMISSIONS` 执行；Home 调用者、只读约束、提供方上限与信任判断不变。
- `agentRuntimes` 的失败和慢查询须与无此依赖的设置数据页隔离，并保留可见失败。现有 `SettingsPageContext.runtimes` 是必填同步数组，贡献 `render` 同步返回字符串，视图没有上下文依赖声明；实际 provider 在 `web-catalog-index-routes.ts` 先 `await agentReady()` 再读目录。只加 catch 仍等待慢查询，按有无 `settings_data` 跳过查询会新增未约定的互斥语义。

**Root 2026-10-25 裁定**：允许为第四项增加唯一的现有上下文依赖声明 `UiViewDeclaration.settings_runtimes?: true`，取代本 WO 原先的“不增加公开接口”限制。不声明时不查询并给 `context.runtimes: []`（未请求），声明时只查询一次并给真实列表；查询拒绝由现有 ActionError/HTTP 错误链可见，不用空列表伪装成功。只许 `settings` 视图声明，值只能为 `true`；Coding 显式声明，Shelf 不声明。仍同步 render，不增加通用加载框架、超时、重试、兼容值或插件名分支。沿同一个 `viewContributionId` 读取动作与运行时依赖。所有当前 `context.runtimes` 生产消费者已查：仅 Coding；Shelf 不消费，现有渲染样本的数组形状不变。

允许修改 contracts/ui、SDK 既有视图校验、工作台的声明投影、Host 准备链、Coding Manifest、必要文档/测试，以及正式 `pnpm api:update` 生成的对应快照；动作 id/schema/权限不变。共享核心全量由 PIPE/Claude 在最终组合统一跑。

| 本 WO 验收 | 结果要求 | 验证 |
| --- | --- | --- |
| FIX-1 | 内置兑现范围与已安装 Runtime 缺口写清 | Skill 文档与实际目录核对 |
| FIX-2 | 显式和默认 contribution id 不变，动作与依赖都沿同一规则查到 | 生产 helper 与目录查询的定向断言 |
| FIX-3 | 个人 Home 调用者、原权限与提供方上限不变 | 原权限代码 diff、真实设置动作与既有授权用例 |
| FIX-4 | 无运行时依赖的页面对拒绝、永不落定 provider 均不调用；有依赖成功时显示原运行时且调用一次，拒绝时保留可见错误；错误取值/槽被 SDK 拒绝 | 真实 HTTP 路由与声明正反例，保留数据动作失败路径 |

验证：复用 `shell-declared-lists`、`declared-stages`、`plugin-global-settings`、`coding-product-http` 的生产渲染与真实 Home 设置动作路径，补正常/失败/未结束查询和 SDK 声明正反例；按影响面跑授权、合同与门禁。不触真实 Home、真实模型、不跑独立全量。构建走公共机器 FIFO；验证结果在固定修复头回填。

本轮结果（2026-10-25）：FIX-1～4 已实现并通过对应定向验证。正式 `pnpm api:update` 只更新 `tooling/gates/api/contracts/platform/ui.txt` 的一个可选字段；最终公共 FIFO `pnpm build` 退出 0。16 个定向文件中 15 个全部通过（436/436），含新增 5 个真实 HTTP 场景、SDK 声明正反例、默认/显式 id、真实设置读取和持久化重读、Coding 项目设置及本地动作授权。`check-package-boundaries`、严格 test-imports、API check、page-assets 均退出 0；代码提交上的 secrets 检查退出 0，最终推送前按仓库要求再次检查。相对准确基线 `ec3e0c3ad` 的最终健康门禁退出 0；相对 `origin/main`（merge-base `54437998`）仍退出 1，仅为批里既有的 `PlacementService` 301 行/20 方法，不属于本修复。

**保留失败**：额外加跑的 `host-pages-error-model.test.ts` 在前 6 条通过后，于 MCP recorded 变体耗尽 Node 堆（原报告 6/7 + 进程失败，294 秒）；不能写成 16 文件全绿。该文件在 `ec3` 与本修复代码提交上是同一 Git blob `a8da73cf6fd7f121c40469829888328eccd94279`。已核测试阶段、MCP 将 runner 绑定给 Home 的路径，以及个人 Todo 的项目可达读取回到同一 Catalog 的链，与 A1 的夹具递归修复 `2593b69de26804b65aa3a45827573537c6c5a562` 一致（[#1287 的归属说明](https://github.com/molis-ai/molis-work/pull/1287#issuecomment-6399212516)）。本单没有改 MCP/Todo 链、夹带 A1 补丁、调整堆或放宽断言，也没有自行验证 A1 修复通过；其固定构建与最终组合覆盖由 PIPE/TEST 承接。Root 指示复用该准确证据后，尚未开工的自有基线构建已退出队列并移除临时树，原 OOM 原件保留。

原始命令、退出码与完整输出在 `/tmp/molis-pr1293-settings-data-20261025/`；未跑浏览器或独立全量，未改真实 Home、模型、PG-060/088 或 Memory。最终固定分支交 REVIEW/TEST 做本增量审验，合入与全局状态仍归 carrier。

## 8. PG-075：插件名单从设计系统删掉（2026-10-25，叠在 PR-D1、#1296 上）

等 #1284 的 `PluginIconName` 落进批后开工（batch-38 已含）。事实与做法：

| 项 | 做法 |
| --- | --- |
| `MW_PLUGINS`（27 条：id、标签、色相） | 删。色相成了 Manifest 视图的一项声明 `hue`（合同 `UI_VIEW_HUES`，任何槽的视图可写，插件取它第一个写了的）；23 个内置插件各写自己的色，值与删表前相同（RAC-702）。读它的两处改成读页面的插件目录（`data-plugin-directory` 多一个 `hue`） |
| 工作台自己的几个面（home、characters、workspace、settings） | 不是插件，没有 Manifest：标签条的组色放在 `plugin-tab-groups.ts` 的一张四行小表里（`SURFACE_HUES`），写明是工作台的 |
| `--plugin-<id>` 二十七个自定义属性 | 删。它们全都等于 `var(--ink-soft)`，所以 `var(--plugin-x)` 换成 `var(--ink-soft)` 结果逐字节同值（`--ink-soft` 只在亮、暗主题的根上定义，没有子范围重定义）。改了 8 个插件包共 38 处、工作台 1 处、设计系统 5 处（后者随五行一起删） |
| `renderPluginTintBindings()` | 不再按 27 个 id 展开，变成一条规则：画插件的地方（栏与灵光入口、目录区、市场卡、工作面、标签）`--plugin-tint` 一律 `--ink-soft`，选择器不带 id。Goals 的 `[data-goal-canvas-shell]` 一项留着，归 Goals S11 |
| 设置目录里 shelf、pages、form、dataset、ppt 五行 `--plugin-tint` | 删。它们本来就落在设置区上，区的规则已给同一个值 |
| `PLUGIN_ICON`、规格板的 `PLUGIN_NAMES` | 删。规格板的图标清单由工作台读 Manifest 填（`renderPrimitiveCatalog({ plugins })`，设计系统的参数默认空），平台自己的三个面（项目首页、Characters、插件市场）在 `primitive-catalog.ts` 里具名写 |
| 「每个插件图标唯一」的测试 | 读 `pluginTabGlyphs()`（Manifest），不再有第二张表可对 |

**接受的外观变化**（浏览器批请留意）：①原先不在表里的插件（第三方、issues，以及 `sources`、`market`、`root` 这几个面）此前的图标/标签用各处自己的备用色（`--faint`、`--muted`），现在与内置插件一样是 `--ink-soft`——这正是「待遇一样」；②标签页图标的 `--plugin-color` 不再按表查，一律 `--ink-soft`（原先表外的标签是 `--muted`）；③标签条上表外插件的组色改读目录，没写 `hue` 的仍按 id 在备用色里挑，与删表前一致。

**没做**：Goals 的 `[data-goal-canvas-shell]` 与 `locked`/`SURFACE_OVERRIDES`（S11）；插件包自己样式表里按插件写的 `--plugin-tint: var(--ink-soft)` 行（dataset、form、todo、jelly、workflows、灵光各一行）是插件自己的样式、值与通用规则相同，留给各插件自己清。

## 8. #1303 FIRST 后续（已接受 WO，2026-10-25）

Root 将 FIRST 的三个非阻塞余项交给 I1，基于 `4595b4c50a0ae245520f52f987e05efa2d24965c` 单独补齐；不改原 PR、原作者树和上述已实现范围。完成目标是工程验证通过，并交独立 REVIEW / TEST 和 PIPE 采用；不宣称整条防腐线或用户验收完成。

快捷键沿用实际渲染边界：候选只来自 `.dock-pins [data-dock-pin]` 与 `.plugin-rail-items [data-plugin-id]`，且必须可见。扩展入口在这两个容器之外；Dock 也只从插件列表取源按钮。因此删除设计系统的 `plugin-builder` 特判即可，不新增属性、不按 `rail: "extend"` 一概排除。保留现有编号、点击导航及输入/终端/菜单的按键边界。

base 的 hue 四例已通过 `manifestProblems → parsePluginManifest` 验证合法和非法字符串，保留复用。Root 增补授权后，公开解析探针确认 `["indigo"]` 及嵌套数组被旧 `HUES.has(String(view.hue))` 接受且原样返回，违反现行色名字符串合同。本 WO 因此补入 SDK 的最小字符串类型拒绝：只改 `view-placement-declarations.ts` 的 hue 条件，不改其他字段、枚举、错误模型和公开接口；所有合法色名正控及 JSON 非字符串反例经过同一个公开解析入口。标签组注释说明页面缺少 `script[data-plugin-directory]` 时使用现有按 id 稳定选色的备用路径，不改算法。合同、安装身份、FI / Goals 具名分支、固定样例及其他需求线均不在本片；既有 RAC605-KEY-01 红项照实保留。

| 编号 | 验收与证明 |
| --- | --- |
| SH1303-01 | 实际工作台的扩展入口不占 Alt/Option 1–9；可见普通插件与 Dock 仍按候选顺序触发原点击导航，隐藏项不占位。定向运行 `tests/plugin-picker-pins.e2e.test.ts` 的本编号，复用 `tests/plugin-picker-pins.test.ts` 的渲染约束。 |
| SH1303-02 | 公开 `parsePluginManifest` 保留全部合法色名，并以原声明错误拒绝数值、数组（含可转成合法色名的单元素与嵌套数组）、null、布尔值及对象；既有非法字符串四例保留。运行 `tests/view-placement-declarations.test.ts`。 |
| SH1303-03 | `plugin-tab-groups.ts` 注释准确说明目录脚本缺失时走备用色；算法不变，复用 `tests/plugin-hue-declaration.test.ts` 的 RAC-706。 |

首次改动进行一次必要的 FIFO 整体 `pnpm build`；数组误接受的实测触发 Root 增补授权后，SDK 出现新的生产输入，因此再刷新一次必要整体构建。新构建只验证 hue 公开解析、内置声明正控与相关检查；快捷键原件按未变的 UI 源码范围复用，最终独立 TEST 绑定新构建实操。保留定向验证、边界与相对基线健康检查、推送前密钥检查，不跑全量或原大批。资源只记录相对本片 parent 的实测变化并交采用载体，不在本片放宽预算或门禁。独立 TEST 复用已绑定源码的构建产物，补必要行为实操，不重跑原大批次。
