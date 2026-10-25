# W5-06 余项第一片：外壳里按插件名手写的表改读 Manifest（PG-060）

状态：执行中（2026-10-24）。按拆片评审 2026-10-23 的裁定 ①（标签标题兜底表、搜索的对象标签表）与规格板插件格 (b) 收口；规格板插件格按构建期插件目录画格，按样例项目的启用状态分亮格与灰格，developer 插件不进。真实运行时目录来源记在 BL-388，随 ② 的 2b 收口；本片不扩宿主路由、目录与 rail 的数据合同。

验收编号：RAC-80～84。

## 范围

- 标签标题兜底表：Tab 的标题按视图声明取，兜底表只留 Manifest 还没表达的标题。
- 搜索的对象标签：`SEARCH_ITEM_TAB_SURFACES` 的对象标签名单改读视图 `accepts_objects` 声明（`objectTabPlugins()`），搜索、放置卡、侧栏文件三处共用；没带声明的对象标签不再进名单，只保留平台自己的 artifacts。2026-10-24 同步保留主线 SC-4 已移除 Sessions 入口的结果，不恢复 sessions。
- `/__ui/catalog/bar`（底栏样张）的插件格：去掉手写的插件名单，改为复用 `pluginMarketCards()` 的当前构建期目录（developer 插件过滤照旧）；样例项目的启用状态决定亮格——新项目默认启用 = 现行 Dock 默认插件加个人插件，由 `shownProjectPlugins([...DOCK_DEFAULT_PINS])` 算，不写插件名；目录里其余插件是灰格「未添加」。格子数随目录增减。创作台（`plugin-builder`）声明为个人插件，新项目默认启用，rail 按同一机制把它画在选择器头部的「创作台」按钮（`renderPickerExtend`）与账号菜单（`renderAccountGlobalItems`）里，不是插件格；样张照此画，不新增手写名单。

不动 `manifest.ts`（#1098）与 `actions.ts`（#1117）；不改 privileges.md 状态列（统筹合后改账）。

## 验收

- RAC-80：底栏样张的亮格是样例项目默认启用的插件（现行 Dock 默认插件加个人插件），由 `shownProjectPlugins([...DOCK_DEFAULT_PINS])` 算出，不在外壳里写插件名单；每个亮格都在启用集合里，每个启用的目录插件都画成亮格，已移除的 Sessions 不得重新出现（`tests/primitive-catalog-bar.test.ts`）。
- RAC-81：灰格来自 `pluginMarketCards()` 的构建期目录，恰好是目录里样例项目未启用的插件，两种状态都出现在样张里；目录增减一个卡片，灰格跟着增减；灰格带 `is-available` 类（`tests/primitive-catalog-bar.test.ts`）。
- RAC-82：developer 插件（Text Stats）不进 `pluginMarketCards()`，也就不进样张的格子和添加控件（`tests/primitive-catalog-bar.test.ts`）。
- RAC-83：浏览器打开 `/__ui/catalog/bar`，亮格、灰格与「未添加」操作都能看到并可用；三宽度（1280/900/700）与明暗主题截图人工查看，无溢出、无错位（本机验证记录）。
- RAC-84：来源说明——样张与搜索/开标签名单读的都是构建期目录，真实运行时 Manifest 目录已由 `w5-06-shell-remainder.md` 第 2 片（RAC-605～611）收口；本片不新增宿主路由或页面数据合同（本篇「范围」与 PR 正文「行为变化」段）。

## 没做、交给后面

- BL-387：新建入口（`CREATE`）、默认标题（`names`）与项目首页起点（`starts`）三处手写行，已由 `w5-06-shell-remainder.md` 第 1 片（RAC-600～604）改读声明。
- BL-388、BL-542：按对象开标签的名单、rail 的 `group/icon/order`、新建入口与首页起点，改从运行时目录读运行中插件的 Manifest，已由 `w5-06-shell-remainder.md` 第 2 片（RAC-605～611）做完。
