# 页面客户端生命周期（Page Client Lifecycle）

状态：实现完成，待合入（2026-11-21 立项，分支 `fix/b44-shell-goals-state`）。来源 BL-b44-shell-goals-state（已结清，见 [已删除的 BL](../../docs/backlog-removed.md)；[插件同等地位](../plugin-equal-standing/spec.md) H4 未达成）。用户 2026-11-21 定：H4 单独一个 PR，先写这份通用接口的短需求。

需求维护与实现：Claude（本会话）。类型：底层与架构。

## 白话说明

**这件事做什么。** 工作台外壳里还有一大段代码在替 Goals 管状态：记住选中哪个 Goal、画布还是列表、后台刷新 Goal 页面、Goal 的画布与看板框、键盘和前进后退。这份需求先定一个所有插件通用的「页面客户端」接口：外壳只按接口通知「页面开了、要存状态、要还原、有点击、标签切过来了」，插件自己决定怎么做。然后把 Goals 的这些代码整段搬回 Goals 包。

**做完能看到什么。** 用户看到的行为不变：选中、画布、看板、框、刷新、深链、前进后退和刷新后还原都跟以前一样。没装 Goals 的项目照常打开。开发者能看到外壳的页面脚本里不再出现 Goals。

**需要你做什么。** 不需要。

## 1. 接口

插件登记 `workbench.pageClient`：一个函数表达式 `(host) => client | null` 的源码。外壳在页面启动时对每个登记了它的插件各调一次。如果这一页没有该插件的页面数据，返回 `null`。外壳不点名任何插件，只按登记表遍历。它取代第 44 批按名字取工厂的 `pageClients`，按「合同只认现行取值」不留旧字段。

这段源码按插件的浏览器代码写法来：在包的 `src/browser/` 里写带类型的 TypeScript，由包的构建用 esbuild 打成一个文件，登记时读出来交给外壳（Goals：`src/browser/page.ts` 打成 `dist/goals-page-client.js`，`src/page-client.ts` 读它）。不写成模板字符串里的页面脚本。用户 2026-11-21 定：健康门禁的「脚本文本常量」只许变少，搬出来的 Goals 页面脚本整体改成打包的 TypeScript，不改名绕开、不塞进已有文件。

外壳给的 `host`（只有外壳自己的东西，见 `apps/workbench/src/scripts/client/editing-graph.ts` 的 `pageHost`；Goals 用到的部分在 `plugins/native/goals/src/browser/page-host.ts` 写成类型）：

- **区域**：`workspace`、`directoryPane`、`terminalPane`。
- **服务**：`route`、`translate`、`showToast`、`isAbortError`、`requireFormFacts`、`lifetime()`（页面的取消与轮询范围）、`frameAssets()`。
- **外壳导航**：`getSurface`、`setWorkSurface`、`setDirectory`、`setDirectoryCollapsed`、`setWorkspaceMode`、`setMobileView`、`applyMobilePanePresence`、`tabs()`、`immersive()`、`revealDeepLinkTarget`、`revealDeepLinkFromId`、`openEntryItem`。
- **状态**：`queueSave`、`saveUiState`、`readUiState`、`applyUiState`、`restoreDisclosures`、`searchBusy()`、`searchQuietAt()`、`pageChanged()`（插件页面数据换过一次后，让外壳的首页与位置读取作废）、`localPathname()`、`uiStorageKey`、`navigationVersion`、`surfaceScroll(surface)`。

插件返回的 `client`（除 `surface` 外都可省）：

| 组 | 钩子 | 外壳什么时候调 |
| --- | --- | --- |
| 身份 | `surface` | 这个客户端画的工作面 |
| 界面状态 | `uiScope()`、`uiScopes`、`retiredUi(ui)`、`readUiState()`、`applyUiState(ui, phase, scroll)` | 存、取会话里的界面状态。插件字段与外壳字段并在同一条记录里，键名与字段不变；还原分 `start`、`tree`、`filters`、`surface`、`end` 几步 |
| 工作面 | `scrollPane()`、`surfaceSet()`、`open()`、`shown()`、`hidden()`、`workspaceMode()`、`mode(next, options)`、`modeShown(next)`、`graph()` | 切到或离开它的面。面不在本页时由插件自己跳转。它的面上的模式由插件接管 |
| 版面 | `presence(context)`、`panes()`、`immersivePresence()`、`layout()` | 窄屏的面板显隐，窗口与目录宽度改变 |
| 输入 | `click(target, event)`、`clickAfter(target)`、`keydown(event)`、`popstate(event)`、`anchor(id)`、`reveal(target)`、`searchActivity()` | 页面事件。返回真值表示已处理，外壳不再往下传 |
| 搜索 | `createCommand()`、`searchRoot`、`openSearchHit(id, title)` | 命令面板与全局搜索 |
| 标签 | `tabRoot(tab)`、`showTab(tab, keepFrame)`、`showDefault()`、`itemTitle(id, fallback)`、`itemView(view)`、`declare(tab)`、`focusItem(id)`、`withItem(id, run)`、`topLevel()`、`selected()` | 标签工作区切到它的条目、取标题 |
| 地址 | `addressed()`、`ownsAddress()`、`addressItem()` | 按地址打开条目 |
| 启动 | `fresh()`、`arrive(context)`、`receipts()`、`settle()`、`afterTabs(restored)`、`run()` | 外壳还原完版面以后，插件做自己的还原、回执与轮询 |

## 2. 验收

- **PCL-01** 登记合同只有 `pageClient` 一个字段，没有 `pageClients`。外壳从登记表取所有登记了它的插件，代码里不写插件名。
- **PCL-02** 外壳页面脚本（`apps/workbench/src/scripts/client/`）里不出现 Goals：除下面「不在本次」列出的 `placement.ts` 外，`goal` 计数为零，由测试断言。
- **PCL-03** Goals 的页面数据、选中项、画布或列表、归档与回收站视图、后台刷新、决定回执都在 Goals 的页面客户端里。
- **PCL-04** `frame-container.ts`（画布、看板与 Goal 框）搬进 Goals 包，外壳不再引用。
- **PCL-05** 会话里存的界面状态键名与字段不变，不加迁移。刷新、前进后退后还原的结果与改动前相同。
- **PCL-06** 没装 Goals 的项目照常启动，没有脚本错误，停在首页。
- **PCL-07** 现有 Goals 浏览器用例不改断言并通过（选中、画布与看板、框、刷新、决定回执、深链、前进后退、窄屏）。
- **PCL-08** 插件开发 Skill 的宿主一章写明 `pageClient` 怎么登记、`host` 与钩子各是什么。
- **PCL-09** Goals 的页面客户端是 `src/browser/` 里带类型的浏览器代码，由包的构建经 esbuild 打包；不直接调 `fetch`、不写插件 id 与插件路由前缀、不用 `any` 与空 `catch`、不打 `console`。页面说的每个字都是翻译扫描看得见的稳定键。由 `tests/goals-client-bundle.test.ts` 断言。
- **PCL-10** 页面请求平台记录的两项受保护决定（`goals.decisions.record`、`goals.tree.decide`）与 Goals 合同里的描述一致。页面打包不带合同，`src/browser/decision-actions.ts` 留一份，由测试对照合同。

## 3. 不在本次

外壳里还点名 Goals 的几处另记 [BL-shell-goals-leftovers](../backlog/BL-shell-goals-leftovers.md)：

- `placement.ts` 里「挂到 Goal、加为 Goal 输入」的放置流程，是放置服务替 Goals 开的专门入口，要改成插件声明的挂载目标。
- 成果交给 Goal 作输入的 `artifacts/goal-input-client.ts`，助理材料与侧栏按插件名写的 Goal 类型和图标。
- `shell-page-renderer.ts` 的函数名（巨型单元门禁按函数名记账）与目录栏的 `goal-tree-pane`，沉浸外壳里没人读的 Goal 工具按钮。
