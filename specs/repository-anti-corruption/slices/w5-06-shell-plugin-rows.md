# W5-06 余项第一片：外壳里按插件名手写的表改读 Manifest（PG-060）

状态：源码已随 #1236 合入主线，三项文档与证据补充已获 FIRST 与独立 TEST 核收，现补 RAC-84 缺 Chrome 时的结果说明（2026-10-24）。按拆片评审 2026-10-23 的裁定 ①（标签标题兜底表、搜索的对象标签表）与规格板插件格 (b) 收口；规格板插件格按构建期插件目录画格，按样例项目的启用状态分亮格与灰格，developer 插件不进。真实运行时目录来源记在 BL-388，随 ② 的 2b 收口；本片不扩宿主路由、目录与 rail 的数据合同。

验收编号：RAC-80～84。

## 范围

- 标签标题兜底表：Tab 的标题按视图声明取，兜底表只留 Manifest 还没表达的标题。
- 搜索的对象标签：`SEARCH_ITEM_TAB_SURFACES` 的对象标签名单改读视图 `accepts_objects` 声明（`objectTabPlugins()`），搜索、放置卡、侧栏文件三处共用；没带声明的对象标签不再进名单，只保留平台自己的 artifacts。2026-10-24 同步保留主线 SC-4 已移除 Sessions 入口的结果，不恢复 sessions。
- `/__ui/catalog/bar`（底栏样张）的插件格：去掉手写的插件名单，改为复用 `pluginMarketCards()` 的当前构建期目录（developer 插件过滤照旧）；样例项目的启用状态决定亮格——新项目默认启用 = 现行 Dock 默认插件加个人插件，由 `shownProjectPlugins([...DOCK_DEFAULT_PINS])` 算，不写插件名；目录里其余插件是灰格「未添加」。格子数随目录增减。创作台（`plugin-builder`）声明为个人插件，新项目默认启用，rail 按同一机制把它画在选择器头部的「创作台」按钮（`renderPickerExtend`）与账号菜单（`renderAccountGlobalItems`）里，不是插件格；样张照此画，不新增手写名单。

不动 `manifest.ts`（#1098）与 `actions.ts`（#1117）；不改 privileges.md 状态列（统筹合后改账）。

本次只补 #1112 留下的三项：在插件开发 Skill 写清 `accepts_objects` 的当前消费范围；把原 PG-060 单元测试对应到 RAC-84 并说明它们只验证声明派生、标题兜底和脚本装配；在现有文件预览浏览器用例里补真实 Host 的侧栏「在插件中打开」路径。Files 只读项目当前选定的工作目录，因此用该目录内同名、不同路径的非空文件作合法对象 ID 对照，分别验证 Files 尚未打开与已经打开时的实际选择、正文和保存的阅读位置。不改 Files 的目录权限、对象 ID、客户端或宿主合同，不重跑已有有效证据的 RAC-83 六幅样张，也不实现 BL-388。

## 验收

- RAC-80：底栏样张的亮格是样例项目默认启用的插件（现行 Dock 默认插件加个人插件），由 `shownProjectPlugins([...DOCK_DEFAULT_PINS])` 算出，不在外壳里写插件名单；每个亮格都在启用集合里，每个启用的目录插件都画成亮格，已移除的 Sessions 不得重新出现（`tests/primitive-catalog-bar.test.ts`）。
- RAC-81：灰格来自 `pluginMarketCards()` 的构建期目录，恰好是目录里样例项目未启用的插件，两种状态都出现在样张里；目录增减一个卡片，灰格跟着增减；灰格带 `is-available` 类（`tests/primitive-catalog-bar.test.ts`）。
- RAC-82：developer 插件（Text Stats）不进 `pluginMarketCards()`，也就不进样张的格子和添加控件（`tests/primitive-catalog-bar.test.ts`）。
- RAC-83：浏览器打开 `/__ui/catalog/bar`，亮格、灰格与「未添加」操作都能看到并可用；三宽度（1280/900/700）与明暗主题截图人工查看，无溢出、无错位（本机验证记录）。
- RAC-84：来源与对象打开——样张与搜索/开标签名单读的都是构建期目录；`skills/molis-plugin-dev/elements.md` 与 `ui.md` 写清，当前消费者尚不读取动态安装插件的运行时目录，后者仍见 BL-388，随 ② 的 2b 收口。`tests/plugin-declarative-mounting.test.ts` 只证明声明派生、标题与侧栏脚本装配，`tests/tab-workspace-ops.test.ts` 只证明未提供标题时的兜底规则；它们不证明实际点击。实际 Files 选择由 `tests/shell-file-preview.e2e.test.ts` 经真实 Host 和侧栏按钮验证：冷打开及 Files 已打开后改选另一个完整 `workspace_id:path`，对象标签 ID、阅读正文与 Host 阅读位置均对应目标。同名不同路径的文件不能串选。本片不新增宿主路由或页面数据合同。

补证验证：`node scripts/run-tests.mjs tests/plugin-declarative-mounting.test.ts tests/tab-workspace-ops.test.ts tests/shell-file-preview.e2e.test.ts`。浏览器用例使用公共 test-kit 与隔离 Home / Chrome 资料目录；不碰真实 Home。本片补证通过也不等于 PG-060 全项、W5 或用户验收完成。

RAC-84 缺少 Chrome 时按公共 fixture 的 `t.skip()` 约定跳过，本例另写明「未验证 Files 选择」，不能计为行为通过；文件级退出成功也不能替代测试级 pass / skipped 数。FIRST 的这条非阻塞建议按本任务约定处理，不以「不改也行」留存。只改本例的 skip 原因，不改其他浏览器用例、公共 fixture 或汇总规则。

2026-10-24 作者验证：整体构建、包边界、对照 merge-base 的健康门禁与页面资源检查通过；上述三个文件与受 Skill 改动影响的安装、npm 打包、运行时载荷、Studio 回放用例共 7 个文件、119 个测试通过。浏览器文件 2/2 通过，其中 RAC-84 一例实际走完冷打开与已打开后改选两段；RAC-83 沿用原有效证据，没有重跑或扩称为本片的新验收。

上述实操证据绑定 `22537bd`，独立 TEST 见 [核收记录](https://github.com/molis-ai/molis-work/pull/1253#issuecomment-6390447468)，本次只补环境不足时的结果表达，不重复实操。该文件不在 CI 产品子集的五个浏览器冒烟里；全量运行器会选择它，CI 与全量的 Chrome 设置步骤都会在找不到 Chrome 时直接失败。因此 CI 或全量具备 Chrome 只能证明运行环境，是否执行并通过 RAC-84 仍须看该用例的实际 pass / skipped 记录。

## 没做、交给后面

- BL-387：新建入口（`CREATE`）、默认标题（`names`）与项目首页起点（`starts`）三处手写行，已由 `w5-06-shell-remainder.md` 第 1 片（RAC-600～604）改读声明。
- BL-388：按对象开标签的名单改从运行时目录读已启用插件的 Manifest；页面脚本在构建期把名单写成字面量，运行时目录要由宿主随页面下发，与 ② 的 2b 同一件事。
