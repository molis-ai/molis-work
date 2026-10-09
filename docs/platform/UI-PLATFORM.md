# UI Platform

## 1. 分工

- `apps/workbench`：产品 Shell、导航、页面装配和 Host Client。
- `packages/ui-host`：UI Contribution、Slot、Embed、隔离、权限桥接和生命周期。
- `packages/design-system`：token、基础组件、图标、可访问性、主题和视觉基线。
- Native/Integration Plugin UI：实际产品页面、Inspector、设置和嵌入内容。

Workbench 不直接访问 SQLite、Module implementation、Node-only API 或 Tauri command；用户操作转换为强类型 Capability 调用。

## 2. 控件原语

产品控件、色板、图标、字体的用法和文件表在 [`packages/design-system/README.md`](../../packages/design-system/README.md)。视觉规范是 [`DESIGN.md`](../../DESIGN.md) 的 Soft Workbench：珍珠灰桌面上一张连续白色工作面，石墨主操作，铜色焦点与链接，字重 400/500/600，动效约 130/250/420ms。开发预览组件板是 `/__ui/catalog`（真实底栏标本在 `/__ui/catalog/bar`）。改共享控件、状态或微动效**要**对照这块板；达标标本**要**补进 Catalog。不准把系统下拉、系统色盘、系统确认框当产品控件。动效、图标色是切片内工作。过程说明见 [CLI 与开发](../cli-and-development.md#前端与控件板) 与 [ui-craft-floor](../../specs/ui-craft-floor/spec.md)。

合同是 HTML Slot：从 `@molis-ai/molis-work-design-system` 导入 `render*` / `icon`，产出 `mw-*` + `data-slot`。不迁 React，不另起 class 填充。颜色、圆角、高度和时长只取 `palette.ts` 的共享 token，不写 hex、不用 `!important` 或按插件覆盖去压前面的层。壳层选中走 `--nav-*`；石墨 `--action` 只给主操作和选中的选项；铜色 `--accent`（`--blue*` / `--focus` 的实际值）给焦点、链接和进行中；插件没有身份色。

### 全局导航

没有全局左侧栏。全局入口只有一处：窗口底部的常驻栏——左侧 Dock 菜单与 Dock（项目首页 + 用户选定常驻的插件），中间统一对话栏（Assistant 输入胶囊，前面是插件切换器，⌘K 搜索也从这里开），右侧 Shelf / 灵光、讨论和项目按钮。插件贡献的 `navigator` Slot id 不变，含义是「出现在插件切换器、可被放进 Dock 的入口」；`island` 是底栏右侧的个人常驻入口。插件自己的目录（`workbench.directory`）是工作面里的一列，不是第二套全局导航。

## 3. 嵌入

被插入内容的 Plugin 必须显式开放 Slot，声明接受的 Contribution Contract。贡献方声明自己提供的 view/command 与权限；UI Host 决定是否装载、放在哪里、何时销毁，并隔离错误和权限。

不允许：

- 直接传内部组件实例或 Store handle；
- 通过 Artifact 假装页面 RPC；
- Plugin 修改宿主导航/页面而没有 Slot Contract；
- 页面组合字段反写成新的中央事实。

### 页面里的事件与状态归属

工作台是一页：外壳、插件界面和几个 iframe。它们不共享对象（上一节），页面内跨模块说话只有一条通道，DOM `CustomEvent`。这条通道的词汇登记在一份合同里：[`packages/contracts/src/platform/dom-events.ts`](../../packages/contracts/src/platform/dom-events.ts)（子路径 `@molis-ai/molis-work-contracts/platform/dom-events`）。

- **事件**（`DOM_EVENTS`，按名字排序）：名字、种类、主人、发在哪里、载荷、含义。种类只有两种：`announcement`（主人报告自己状态的变化或自己做的决定，主人发、别人听）和 `request`（别人请主人去改它的状态，主人听、别人发）。发在哪里是 `window`、`document` 或某个元素（`bubbles` 说明它是否冒泡）；`window` 上的监听器听不到发在 `document` 上的、不冒泡的事件，两个模块对不上多半就是这一条。`cancelable` 的请求由接住它的一方调用 `preventDefault()`，发的一方读结果决定要不要另想办法。
- **页面状态的主人**（`PAGE_STATE_OWNERS`）：持有一块页面状态的客户端模块和它持有什么。工作台客户端由许多片段文件拼成一个程序，所以一个主人可以是几个文件。别的模块不碰这块状态的内部变量，只发 request、听 announcement。登记的范围是「别的模块要通过事件看到或请它改」的状态；模块内部的变量、只有一处用的存储键不在其中。
- **前缀**（`DOM_EVENT_PREFIXES`）：现在有四种写法（`molis-work:`、`molis:`、`molis-shelf-`、`workbench-`）。合成一种是后续单独的改动；在那之前，新名字必须落在列表里的某个前缀上，不会出现第五种。

加一个事件：在 `DOM_EVENTS` 里按名字顺序加一条，与发它的代码在同一个改动里；浏览器代码里把名字写成字符串字面量，不拼接、不放进变量（浏览器程序是模板字符串，不能 import 这份合同，门禁只能读源码）。合同的公开 API 快照随之变，跑 `pnpm api:update`，并在 PR 里说明新事件对插件和调用方意味着什么。

门禁 `scripts/gates/dom-events.mjs`（`pnpm health:check` 里跑，CI 里同样）在下面几种情况失败，没有基线、从 0 起算：创建了没登记的 `CustomEvent`（或带页面前缀的 `Event`）；`CustomEvent` 的名字读不出来；`addEventListener`、`removeEventListener` 或 `.listen` 监听一个带页面前缀却没登记的名字（拼错的监听器永远听不到）；登记了的事件没有任何代码发或听；主人不持有它名下的事件（`announcement` 要从主人的文件里发出，`request` 要在主人的文件里被听到）；条目重复、乱序、字段不对。测试文件不扫（测试可以对自己驱动的页面发自己的事件）。`node scripts/gates/dom-events.mjs --report` 按事件列出谁发、谁听，并指出对不上的接收方；那是线索，不是失败。

这份登记不覆盖浏览器自己的事件、外壳与 iframe 之间的 `postMessage` 类型、存储键，以及没有事件宣布的状态；它们是另外的通道，还没有登记。

## 4. 迁移

Goals 的结构提案（新建 Goal 与关系）与最近结果是 Goals Native Plugin 的正式 Contribution，Workbench 经 UiHost 挂载。`apps/workbench/src/decision-center.ts` 只组合各 owner 已生成的内容；`decision-groups.ts` / `decision-results.ts` 归 Goals Plugin。客户端确认/退回归 `proposal-client.ts`，Workbench 保留跨 Feed/Goal 的刷新、receipt 和共享状态。提案 CSS 在原层叠位置与 media query 内插入，英文文案由共享 catalog 组合。调用清单与 209 项验收见 `specs/molis-work-architecture-reorganization/dd2-caller-audit.md` 和 `dd2-validation.md`（当时的验收记录）。

旧 `src/web/render.ts` 已删除，职责归 Workbench Shell、Design System、UI Host 和 Native Plugin UI；各产品内容由各 Native Plugin 提供。GW5 的 Goals 页面、交互、route descriptor 和就近文案已完成工程验收；Workbench 仅装配，GW4 的写入口边界保持不变。Cutover 已将跨 Decision/Feed 的具名 UI 组合归 Workbench，Native Goals 持有对应 Contribution，旧 renderer caller 清零。

### AP3 当前实现

- `apps/workbench` 已拥有稳定 HTML 文档 Shell 和 `workbench.directory`、`workbench.main`、`workbench.overlay`、`workbench.settings`、`workbench.side` 五个命名 Slot；插件视图按 Manifest 的 `navigator`、`stage`、`settings`、`island`、`side` 声明位置。`settings-page` contribution 只能挂到 `workbench.settings`，由全局设置目录列出；插件工作台仍走 directory/main/overlay。
  - 设置分类只有一张表（`apps/workbench/src/settings-sections.ts`）：宿主分类有固定 order（10–90），插件设置页按 Manifest 里 `settings` view 的 `order` 插入，并跟随它前面那个宿主分类的分组；不写 order（默认 100）的进「插件」组。宿主不按插件名排位置。
  - 页面由项目里运行的插件渲染、又要作为设置页出现时（如 Characters 的「角色」），插件把工作台页面声明为 `stage` view（不进导航），在渲染出的根元素上标 `data-settings-page="<设置分类 id>"`，再另外声明一个 `settings` view；工作台的设置覆盖层会直接挂载这块已绑定的页面，独立设置页则由宿主转回带项目的工作台（`/projects/<id>/?settings=<id>`）。
- `packages/ui-host` 在 mount 时校验 contribution、surface、目标 Slot 与 format；Plugin 不能向未声明或不兼容的 Slot 插入内容。
- Feed Native Plugin 已按 surface 显式声明可装载位置，Workbench 通过 UI Host mount，不直接调用 Plugin renderer。
- `packages/design-system` 已接管主题、密度、browser bootstrap 和分层视觉样式；旧 `src/web/visual-foundation.ts` 已删除。
- Workbench 浏览器 CSS/JS 按样式层和客户端职责拆分，旧静态内容保持逐字节兼容；全局 i18n runtime 已缩成语言选择/fallback 边界，现有 EN 产品文案暂存于 Workbench compatibility catalog，后续随各 Native Plugin UI Goal 就近迁出。
- AP3 只迁 Shell/UI 平台职责，不替 AR3、EX4、WK3、AP4 或已接受的 GW5 搬产品页面。Cutover 已完成其余 owner 迁移，旧 `src/web/render.ts` 已 retired。

GW5 已提供全部 Goals contribution、专属客户端、集合/导航投影与 route descriptor，包括项目工作规则页面。Workbench 接管 full/refresh page、read/page/fragment 与 Planning 请求装配，共享刷新和跨 owner 状态仍在 Host。Module 保有事实和权限规则，Artifact/Companion/Decision HTML 由各自 owner 显式输入。175 项串行回归及边界/caller 对账见 `specs/molis-work-architecture-reorganization/gw5-validation.md`；不替代最终全产品 E2E。

### FD4 参考实现

- `packages/ui-host` 已有真实 Contribution registry 和 surface render，不再只是目录占位。
- `apps/workbench` 是 composition root，注册 `io.molis.work.native.feed.ui.v1`；它不读取 Feed Store。
- `plugins/native/feed` 声明 Feed 页面、Source 页面、overlays 和 detail Slot。Goal 决定仍由 Goals owner 生成，再通过 `detail_slot_html` 挂入 Feed 声明的详情位置。
- 旧 `src/web/feed-native-plugin-ui.ts` 已随根 `src/` 删除；Feed UI model 由 Workbench 的 `feed-projection-ui.ts` 投影，图标、i18n、安全链接和富文本由 Host primitives 提供。

Planning contribution 通过显式 renderPage 原语使用原设置页外框，不复制全局导航。根 HTTP host 经 Workbench 调用 Plugin 的页面 matcher，仍自己负责 GET/控制权限、项目解析、读取与响应。Plugin 不导入根 Web view 或 Store；方法组合由公开 Goals Module 产出。

### 原生客户端生命周期

UI Host 的 `UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT` 由 Workbench 或独立页面实例化，提供 `mountPluginClient(root)`。它拥有挂载去重、文档/祖先 hidden 变化、卸载取消与资源清理；不拥有插件状态。Images、Coding 及子面板、Files/Git 伴随面板和独立 Diff/Text Stats、Host 审查视图、Builder 两套界面、Shelf 及结果面板已接入。同源 iframe 还观察父页面的隐藏与移除。API、隐藏/卸载差异及异步响应检查见 [UI Host README](../../packages/ui-host/README.md#浏览器生命周期)。浏览器回归覆盖真实请求中止、SSE 断开重连、隐藏轮询停止及同一 DOM 重新挂载。

轻量刷新提示可用 `scope.watchRevision(read, refresh)`：可见时每两秒查询 revision，首次进入、变化及断线恢复后重新读取事实，隐藏/卸载清理。`refresh` 在业务交互忙碌时返回 false，保留未消费 revision 待下次读取。Host 按项目提供当前运行插件的 `/api/plugins/<id>/view-revision`，进程更换 epoch；只含不透明 revision，不包含事件正文或授权。Files/Git 已实际接入，固定 Artifact 差异仍保留原版本。
