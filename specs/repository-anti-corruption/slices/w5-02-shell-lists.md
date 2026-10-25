# W5-02 PR-D 外壳与设置的手写名单、PG-063（ac-shell 接手）

状态：统筹 2026-10-25 已裁 Q1～Q4（见 §4），PR-D1 开工：第 1 个提交（PG-076 余项、PG-073 的 ①②）已实现，PG-074、PG-072 等 batch-37（`batch/1025-37`）推送后从它开。PR-D（PG-072～076）从 ac-registry 移来，加 PG-063；设计依据是 ac-registry 分支 `w5-02-registry.md` §5，事实按本分支头（`claude/ac-shell-slice4`，已含 #1261、#1272、#1274、#1275）重核。

验收编号：RAC-690～709。BL：BL-656～665（暂未取用）。

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
| RAC-693 | `UiViewDeclaration.rail`、`pinned_default` 存在，只许 `navigator` 视图用，别处写了被 Manifest 检查拒绝（拒绝本身有测试） | 合同测试 + 快照（`pnpm api:update`） |
| RAC-694 | `RAIL_CORE_ORDER`、`RAIL_EXTEND_PLUGIN_IDS`、`DOCK_DEFAULT_PINS` 三张表删除；骨干顺序、扩展入口、默认固定都读视图声明；三个骨干与 Plugin Studio 的页面与改之前一致 | `tests/` 的导航断言，对改之前的输出逐项相等 |
| RAC-695 | 一个新插件只靠 Manifest 视图的声明就能出现在骨干 / 扩展位、能被设为默认固定 | 探针 Manifest 的断言 |
| RAC-696 | `UiViewDeclaration.settings_data` 存在，只许 `settings` 槽的视图用；声明的动作必须是只读、受众含 `user` 的动作，否则被 Manifest 检查拒绝 | 合同测试 + 快照 |
| RAC-697 | `web-catalog.ts` 的插件设置页只有一条通用路，没有 Shelf、Coding 两个分支，宿主不再 import `plugin-coding`、`plugin-shelf` 做设置页 | 源码扫描 + `pnpm boundary:check` |
| RAC-698 | Shelf、Coding 的设置页内容与改之前相同（模型字段逐项相等） | 渲染前后对拍测试 |
| RAC-699 | 外壳与设置的源码里，按插件名列的表只剩登记的例外（Goals S11、FI 线、A6 各一行，带理由），数字只许减少 | 源码计数脚本 |
| RAC-700～709 | 留给 PR-D2（PG-075）和实现里发现的 | |

## 3. 开工前核对

- **碰同一批文件的在途 PR**：#1280（`web-catalog.ts`，ac-kernel）、#1278（`plugin-catalog.ts`、`plugin-workbench.ts`，W5-04 第三组）、#1277（`plugin-workbench.ts`、`contracts/platform/ui.ts`、`coding/src/ui.ts`，平台零散特权行第 2 组）、#1262（`pages/src/registration.ts`，W5-02 PR-A）、#1259（`immersive-shell.ts`、`plugin-catalog.ts`，ac-trust T3）、#1101（`coding/src/manifest.ts`、`ui.ts`）、#1274/#1275/#1272（我的前几片，随 batch-37）。`contracts/platform/ui.ts` 是共享核心：RAC-693、696 改合同，按共享核心跑批；按 §1a 与 #1277 同批落。
- **#1281（ac-registry PR-B）** 改 `BUILTIN_PLUGIN_CATALOG` 的消费方，D 的 `plugin-catalog.ts` 改动要在它之后；我开工前再看它的头。
- 本机只做：`pnpm build`、`pnpm api:update`（改合同）、`check-health-gates --base origin/main`、`boundary:check`、`page-assets` 检查、`secrets:check`，以及直接改到的非浏览器用例；不跑浏览器批、全量。

## 4. 统筹的裁定（2026-10-25，已定）

- **Q1（PG-072 的数据怎么来）**：视图声明读动作 + 宿主给固定的平台上下文（照推荐）。
- **Q2（PG-074 字段形状）**：`rail` + `pinned_default` 两个字段（照推荐）：默认固定是用户可改的偏好，骨干是平台排版，分开不会以后拆。
- **Q3（Characters 行）**：平台模块，不是插件，它的搜索行留作平台自己的具名一行（照推荐）；理由：平台事实归平台。
- **Q4（范围）**：同意。feed 切换分支 → FI 线（ac-sandbox-sched）、artifacts 字面量 → A6（ac-giants）、Goals `locked` / `SURFACE_OVERRIDES` → S11（ac-sc3），在 privileges 对应行写明归属，由统筹在批里改状态列；PG-075 单独 PR-D2，等 PG-055 合入后做。PG-063 的状态列统筹在 batch-37 里改成「已做（R11 #1169，RAC-135～137）」。
