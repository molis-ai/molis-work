## 做了什么（W5-06 余项第一片，PG-060）

工作台外壳里三处按插件名手写的表，改成读插件 Manifest 里已有的字段（① 10-23 分片：只读现有字段，加字段归 ② 的 2b）。

- **标签标题**（`apps/workbench/src/tab-workspace-ops.ts`）：兜底表删掉 14 个插件行，只留宿主自己的「项目首页」和 Characters。插件标签一直由页面传入的 `pluginTabTitles()`（各插件导航或常驻入口视图的 `title`，按界面语言）命名，兜底表里的插件行在页面上早已不起作用。
- **按对象开标签的名单**（`apps/workbench/src/scripts/client/global-search.ts` 的 `SEARCH_ITEM_TAB_SURFACES`，搜索、放置卡、侧栏文件三处共用）：改为平台自己的 Sessions 与成果，加上 Manifest 有视图声明 `accepts_objects: true` 的插件（新函数 `objectTabPlugins()`，`apps/workbench/src/plugin-catalog.ts`）。Goals、Inbox、Feed、Pages、灵光、工作流程、Coding 在打开舞台的视图上加了 `accepts_objects: true`（有 `stage` 视图的是它，否则是 `navigator` 入口，与 #1087 的说法一致）。`accepts_objects` 原来只有 `packages/ui-host/src/view-registry.ts` 抄进 `UiPlacedView`，没人消费，加声明不带出别的行为。
- **规格板**（`apps/workbench/src/primitive-catalog.ts` 的 `CATALOG_PLUGINS`）：改为目录里有导航或常驻入口视图的内置插件，按目录顺序。① 说的是「有 navigator 视图的」；灵光只有常驻入口（island），只取 navigator 会让规格板上的灵光变灰，所以把 island 也算上，底栏照工作台的样子画。

侧栏文件「打开」的分流从 `initialization.ts` 的行内表达式抽成 `SIDE_FILE_OPENER_SCRIPT`（`global-search.ts`），从工作台包入口导出，用例直接调它。

## 行为变化（① 10-23 裁定：照读 Manifest，变化写进 PR）

| 入口 | 改前 | 改后 |
| --- | --- | --- |
| 侧栏文件预览的「打开」，文件属于 Files | `openPluginRecord("files", id)`：打开 Files 页；Files 没有 `searchRow`，`jumpToRecord` 直接返回，文件**没有选中** | `openItem("files", id, title)`：开这个文件的对象标签，Files 收到 `molis-work:select-item` 打开它（`plugins/native/files/src/client.ts:103`） |
| ⌘K 搜索命中 Files | Files 不是搜索来源，没有命中 | 不变 |
| 放置卡指向 Files | Files 既不在名单里也没有记录行，本来就走 `openItem` | 不变 |
| Coding | 手写在名单里 | 由 Coding 的 `conversation`（stage）视图声明 `accepts_objects: true` 进名单，行为不变；手写名单只剩 Sessions 与成果 |

**Git、Diff 的声明删掉了**（`plugins/native/git/src/manifest.ts`、`plugins/native/diff/src/manifest.ts`）。两边的 `src` 都不收 `molis-work:select-item`，registration 里也没有 `searchRow`、`recordRow` 让工作台去点一行，按 id 打开的对象它们接不住，声明与代码不符。现在没有任何入口发出 `surface: "git"` 或 `"diff"` 的打开目标，删掉不改变行为。

**局限**：`objectTabPlugins()` 默认读构建期的 `BUILTIN_PLUGIN_CATALOG`，只覆盖内置插件；开发中的插件和第三方插件即使声明了 `accepts_objects`，也进不了名单。这不是回退（原来的手写名单同样只有内置插件），记为 BL-388：以后改成从运行时目录读已启用插件的 Manifest，和 ② 的 2b 一起做。

## 还没做

`goal-inputs-html.ts:22` 的 `CREATE`、`placement.ts:532` 的 `names`、`project-home.ts:217-221` 的 `starts` 要的字段 Manifest 现在没有，等 ② 的 2b，记为 BL-387。名单只覆盖内置插件，记为 BL-388（见上）。

## 文档

`skills/molis-plugin-dev/`（`elements.md`、`host.md`、`ui.md`）：按标签打开对象的插件改为在视图上声明 `accepts_objects`，不再改 `global-search.ts`。`docs/system/EXTENSION-POINTS.md`：内置插件的「按需」少一处（2 → 1），搜索来源一项到 0，§3.8 写明名单只剩 Sessions 与成果、只读内置目录（BL-388）。`docs/system/HUGE-CLASS-MIGRATION.md`：`createTabWorkspaceOps` 461 → 425 行。BACKLOG 加 BL-387、BL-388。

## 测试改动

- `tests/tab-workspace-ops.test.ts`：Feed 那条改为显式传入标题；新增一条：页面没传的插件标题就是它的 id，只有宿主自己的面有名字（PG-060）。
- `tests/plugin-declarative-mounting.test.ts`：新增 `objectTabPlugins()` 用非内置夹具与随附插件各断言一次（随附的是 Goals、Inbox、Feed、Pages、灵光、工作流程、Files、Coding，没有 Git、Diff），`pluginTabTitles()` 的中英文标题来自视图（PG-060）。
- 同一文件新增：侧栏「打开」对 Files 走 `openItem`、对 Todo（只有记录行）走 `openPluginRecord`，页面还没有标签工作区时不抛错（PG-060）。旧行为（Files 走 `openPluginRecord`）原来没有断言，没有要改的旧用例。

## 本机延后验证

按 ① 10-23 的开发优先规则，测试与门禁没有在本机跑。

- `node scripts/affected-tests.mjs --base origin/main --json` 的 `full`：命中 `assembly`（`apps/workbench/src/plugin-catalog.ts`、`apps/workbench/src/scripts/client/initialization.ts`）与 `spans-packages`（10 个包：工作台，Goals、Inbox、Feed、Pages、灵光、工作流程、Coding、Git、Diff）。**要进 ⑤ 的集成批次。** 选中 309 个文件（单元 265、浏览器 44），本机都没跑。
- 本机跑过：`pnpm build`（local-host 的 Swift 那步照旧失败，按恢复步骤补齐）、`tsc --noEmit -p tsconfig.json`、`node scripts/gates/page-assets.mjs --update --base origin/main`（只有 `molis-work-workbench.js` 变了：1186715 → 1186532，少 183 字节）、推送前 `pnpm secrets:check`。
- 没跑：上面的测试、`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`。`createTabWorkspaceOps` 由 441 降到 425 行，本地快查用的 `tooling/gates/baseline.json` 没刷新（CI 对照 merge-base，不读它）。
- 要在浏览器里看的：侧栏文件预览点「打开」（Files 的文件，应开出这个文件的标签并显示内容）；Coding 的会话从搜索与放置卡打开照旧；⌘K 搜索命中 Goals、Inbox、Feed、Pages、灵光、工作流程的对象后开对象标签；`/__ui/catalog#bar` 的底栏样张。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
