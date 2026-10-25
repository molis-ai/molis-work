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

### 插件页面隔离与公共服务（SYS-15，迁移中）

已迁移的插件客户端在不透明来源的 `sandbox="allow-scripts allow-forms"` iframe 中运行；表单由页面 JavaScript 处理，CSP 的 `form-action 'none'` 拒绝原生表单导航，`connect-src 'none'` 拒绝直接网络连接。可信外壳持有控制令牌、页面授权和 MessageChannel，子页面不能读父 DOM、原生 IPC 或其他插件页面。页面授权绑定实际激活、安装、项目与 actor，生命周期由 Host 撤销。当前迁移范围及未完成页面见 [系统修复 spec](../../specs/archive/system-review-fixes/spec.md)。

客户端的 `host` 提供同一组受限服务（类型在 contracts 的 `platform/ui`，SDK 重导出）：`invokeAction(reference,input)` 调用自身或 Manifest 声明消费的动作，服务端使用实际定义、当前 grants 与 audience；`messages.send/listen` 承接已登记的主区与侧栏上下文消息；`download`、`printDocument`、`loadMedia` 负责导出、无脚本打印与经授权读取的图片/PDF；`terminal.send/listen` 只连接本安装、本项目在服务端创建的终端，返回事件确认结果，不能提交启动命令。直接读父窗口、拼接控制头、任意 URL 代理与从页面传入可信身份都不属于公共服务。

`host.reviews.show` 在页面占位处显示宿主审查区；只回传尺寸和决定完成通知，正文、回执与决策入口留在宿主，批准经过真实宿主确认。

被插入内容的 Plugin 必须显式开放 Slot，声明接受的 Contribution Contract。贡献方声明自己提供的 view/command 与权限；UI Host 决定是否装载、放在哪里、何时销毁，并隔离错误和权限。

不允许：

- 直接传内部组件实例或 Store handle；
- 通过 Artifact 假装页面 RPC；
- Plugin 修改宿主导航/页面而没有 Slot Contract；
- 页面组合字段反写成新的中央事实。

### 页面里的事件与状态归属

工作台是一页：外壳、插件界面和几个 iframe。目标规则是：模块之间不传内部对象（上一节），页面内的状态变化用 DOM `CustomEvent` 宣布、请别的模块改状态也用它。这条通道的词汇登记在一份合同里：[`packages/contracts/src/platform/dom-events.ts`](../../packages/contracts/src/platform/dom-events.ts)（子路径 `@molis-ai/molis-work-contracts/platform/dom-events`）。登记只覆盖这一条通道，页面今天也不是处处守着这条规则；差距写在本节末的「现状与例外」里，不要把规则读成现状。

- **事件**（`DOM_EVENTS`，按名字排序）：名字、种类、主人、发在哪里、载荷、含义。种类只有两种：`announcement`（主人报告自己状态的变化或自己做的决定，主人发、别人听）和 `request`（别人请主人去改它的状态，主人听、别人发；一个界面把自己的情况报给持有共同状态的主人，也是 `request`，如 `molis:surface-focus`、`molis:assistant-surface-changed`）。发在哪里是 `window`、`document` 或某个元素（`bubbles` 说明它是否冒泡）；`window` 上的监听器听不到发在 `document` 上的、不冒泡的事件，两个模块对不上多半就是这一条。带 `cancelable` 的事件（登记里现在三个：请求 `molis:side-open`、`molis:context-panel-open`，公告 `molis:assistant-context-action-chosen`）由接住它的一方调用 `preventDefault()`，发的一方读结果决定要不要另想办法。代码里还有第三处这样用、却没有登记也没有人接住的：见「现状与例外」里的 `molis-work:open-settings-section`。
- **页面状态的主人**（`PAGE_STATE_OWNERS`）：持有一块页面状态的客户端模块和它持有什么。工作台客户端由许多片段文件拼成一个程序，所以一个主人可以是几个文件。目标规则：一块状态一个主人，别的模块不去改它的内部变量，只发 request、听 announcement。门禁查的只有主人这一侧（announcement 从它的文件里发出、request 在它的文件里被听到），不查别的模块有没有绕过去。登记的范围是「别的模块要通过事件看到或请它改」的状态；模块内部的变量和存储键都不在其中（`state` 的描述里提到某个存储键，只是说明主人持有什么，那个键本身没有登记）。
- **前缀**（`DOM_EVENT_PREFIXES`）：平台自己的前缀现在有三种写法（`molis-work:`、`molis:`、`workbench-`）。合成一种是后续单独的改动；在那之前，平台事件的名字必须落在列表里的某个前缀上。插件拥有的事件不进这张表，走一条通用规则：名字以 `molis-<主人>-` 开头，且该事件登记的 `owner` 正是 `<主人>`（`molis-shelf-notice` 的主人是 `shelf`），所以每个插件同样待遇，表里不为某个插件开专用前缀（ac-artifacts A4，PG-096）；前缀和登记的主人对不上，门禁直接失败。

加一个事件：在 `DOM_EVENTS` 里按名字顺序加一条，与发它的代码在同一个改动里；浏览器代码里把名字写成字符串字面量，不拼接、不放进变量（浏览器程序是模板字符串，不能 import 这份合同，门禁只能读源码；TypeScript 的类型实参 `new CustomEvent<T>("名字")` 照常读）。合同的公开 API 快照随之变，跑 `pnpm api:update`，并在 PR 里说明新事件对插件和调用方意味着什么。

门禁 `scripts/gates/dom-events.mjs`（`pnpm health:check` 里跑，CI 里同样；它自己的规则由 `tests/dom-events-contract.test.ts` 逐条突变验证，CI 里单独一步跑）在下面几种情况失败，没有基线、从 0 起算：创建了没登记的 `CustomEvent`（或带页面前缀的 `Event`）；`CustomEvent` 的名字读不出来；`addEventListener`、`removeEventListener` 或 `.listen` 监听一个带页面前缀却没登记的名字（拼错的监听器永远听不到）；登记了的事件没有任何代码发或听；主人不持有它名下的事件（`announcement` 要从主人的文件里发出，`request` 要在主人的文件里被听到）；条目重复、乱序、字段不对。测试文件不扫（测试可以对自己驱动的页面发自己的事件）。`node scripts/gates/dom-events.mjs --report` 按事件列出谁发、谁听，并指出对不上的地方：接收方对不上、发了没人听、听了没人发、公告被主人以外的文件发；那是线索，不是失败，但它在真实代码里指出的每一条都要写进下面的「现状与例外」（`tests/dom-events-contract.test.ts` 核对，按事件名和文件名），所以报告发现了死路而没人记录，会在 CI 里失败。

#### 现状与例外

登记只覆盖 DOM `CustomEvent`。页面里还有下面这些通道，没有登记，门禁也不看：

- 外壳与 iframe 之间的 `postMessage`（`type` 如 `workbench-surface-focus`、`molis:side-open`、`molis:im-visibility`）；
- `data-assistant-context` 属性：界面把自己的对象写在属性里，情境动作从那里读（常量 `ASSISTANT_CONTEXT_ATTRIBUTE`，在 `services/assistant` 合同里）；
- 传给插件客户端脚本的 `host` 对象（`translate`、`mountPluginClient` 等宿主能力）；
- 存储键（`localStorage` 等）和浏览器自己的事件；
- 跨标签页的 `BroadcastChannel`：目前只有一条，名字 `molis-work:model-ready`，由模型设置脚本（`apps/workbench/src/scripts/settings-models.ts`）在第一个能用的模型出现时发，开始使用页（`apps/workbench/src/scripts/context-onboarding.ts`）收；它是同名页面事件 `molis-work:model-ready` 的跨标签延伸，说明记在那个事件的登记项里。

工作台客户端的片段文件共用一个函数作用域，片段之间可以直接读变量、直接调函数，绕过事件。把登记和代码对照后，已知没有守住「别的模块不碰主人的状态」的有两处（文件都在 `apps/workbench/src/scripts/client/`）。它们不是批准的例外，是待清的差距，清的时候把状态收进主人的文件、改成发 request 或听 announcement：

- `navigation-feed`：选中的 Feed 任务 `selectedFeedTask` 声明在 `bootstrap.ts`，读它的有 `documents-state.ts`；`setFeedTask` 定义在 `navigation-feed.ts`，却被 `events-primary.ts`、`events-secondary.ts` 直接调用，`events-primary.ts` 还直接给 `selectedFeedTask` 赋值，`tab-workspace.ts` 拿到的也是这个函数。
- `goal-selection`：选中的 Goal `selected` 声明在 `bootstrap.ts`（不在主人的文件里），`documents-state.ts`、`editing-graph.ts` 直接读它，`immersive-navigation.ts` 经 `getSelected` 回调读它。

其余的主人没有逐一核对过：登记写的是谁应该持有，不是已经证明只有它碰。

门禁对公告也只查「主人的文件里有人发」，不查「只有主人发」，所以下面两条登记为公告、却有主人以外的文件在发的事件它拦不住（`--report` 会列出）。它们同样是待清的差距，不是批准的例外；清的时候改成经主人发，或者改登记的种类：

- `molis-work:goal-document-loaded`（主人 `tab-workspace`）：`plugins/native/goals/src/navigation-client.ts` 在自己装完 Goal 文档后也直接发它，不经 `tab-workspace`。
- `molis-work:select-item`（主人 `tab-workspace`）：`apps/workbench/src/functions/client.ts`（判断规则页）在自己的行被点击、或地址指定了某条规则时，给自己的界面根发它；`apps/workbench/src/scripts/client/deferred-plugin-client.ts` 在按需装载的界面装好之后，把先前被它截住的那一次补发出去。前者不是工作台在宣布「打开了某项」，后者是重放，都不是主人的决定。

（`molis:surface-focus` 登记为 `request`，不是公告：发它的是各个界面，听它的是主人 `context-actions`。主人自己在 `context-actions.ts` 里也发它，那是替只声明了对象、不自己上报焦点的界面，按人的文字选区代发。）

（情境浮条的三个事件，主人是 `context-toolbar`（设计系统的页面程序）：`molis:context-tools` 与 `molis:context-panel-open` 是 `request`，发的是拥有内容的插件，听的是浮条；`molis:context-tool-invoke` 是公告，浮条在插件发布工具的那个元素上发，插件自己执行。工作台已经采用它，Pages 是第一个真实的发送方；组件板的示范是另一个。`molis:context-panel-open` 带 `cancelable`：浮条接住了（有这个情境的浮条在）就 `preventDefault()`，没接住时插件自己把表单放在原处。）

另有四处也是 `--report` 提示出来、门禁不拦的：发了没人收的，或收不到的。它们是现状，不是设计：

- `molis-work:open-settings-section`：Assistant 在记忆变更卡片上的「去设置查看」（`apps/workbench/src/scripts/client/assistant-island.ts`）在 `window` 上发它并带 `cancelable: true`，没人接住就整页跳到记忆设置页（变更属于项目时跳项目的设置页）。设置目录只在 `document` 上听（`settings-directory.ts`），听不到发在 `window` 上的事件，听到了也不调用 `preventDefault()`，所以这个按钮今天永远是整页跳转。登记里这条是发在 `document`、不带 `cancelable`（真正走通的是 `tab-workspace.ts` 打开「页面放在设置里的插件」时发的那一处），所以登记没有把这第三处 `cancelable` 的用法算进去。要修，不能只把发送改到 `document`：设置目录对这条事件只打开全局设置分类，而项目范围的记忆变更要去的是项目的设置页，那个走 `molis-work:open-settings-path`，按地址打开。
- `molis-work:place-changed`：`scripts/contextual-slice/client.ts`（情境交互的评估用脚本，不进产品页面）在 `window` 上听它，而它发在 `document` 且不冒泡，那个监听器永远不会触发。
- `molis-work:work-mode-changed`：`immersive-navigation.ts` 发了，树里没有任何监听者。
- `molis:side-toggle`：`side-panel.ts` 在听，树里没有任何地方发它。

## 4. 迁移

Goals 的结构提案（新建 Goal 与关系）与最近结果是 Goals Native Plugin 的正式 Contribution，Workbench 经 UiHost 挂载。`decision-groups.ts` / `decision-results.ts` 归 Goals Plugin（Workbench 里曾经把它们拼成独立「决定中心」页的 `decision-center.ts` 与 `/decisions` 页已随 2026-10-08 的死代码批删除；「最近处理结果」贡献仍在 Goals 注册，暂时没有挂载点）。客户端确认/退回归 `proposal-client.ts`，Workbench 保留跨 Feed/Goal 的刷新、receipt 和共享状态。提案 CSS 在原层叠位置与 media query 内插入，英文文案由共享 catalog 组合。调用清单与 209 项验收见 `specs/molis-work-architecture-reorganization/dd2-caller-audit.md` 和 `dd2-validation.md`（当时的验收记录）。

旧 `src/web/render.ts` 已删除，职责归 Workbench Shell、Design System、UI Host 和 Native Plugin UI；各产品内容由各 Native Plugin 提供。GW5 的 Goals 页面、交互、route descriptor 和就近文案已完成工程验收；Workbench 仅装配，GW4 的写入口边界保持不变。Cutover 已将跨 Decision/Feed 的具名 UI 组合归 Workbench，Native Goals 持有对应 Contribution，旧 renderer caller 清零。

### AP3 当前实现

- `apps/workbench` 已拥有稳定 HTML 文档 Shell 和 `workbench.directory`、`workbench.main`、`workbench.overlay`、`workbench.settings`、`workbench.side` 五个命名 Slot；插件视图按 Manifest 的 `navigator`、`stage`、`settings`、`island`、`side` 声明位置。`settings-page` contribution 只能挂到 `workbench.settings`，由全局设置目录列出；插件工作台仍走 directory/main/overlay。
  - 设置分类只有一张表（`apps/workbench/src/settings-sections.ts`）：宿主分类有固定 order（10–90），插件设置页按 Manifest 里 `settings` view 的 `order` 插入，并跟随它前面那个宿主分类的分组；不写 order（默认 100）的进「插件」组。宿主不按插件名排位置。
  - 一个插件在插件切换列表里归哪一组、在目标材料里能新建什么、在项目首页给什么起点、设置页用什么图标，都由它的视图声明（W5-06 第 2b 片，2026-10-23）：`navigator`/`island` 视图的 `group`、`creates`、`start`，`settings` 视图的 `icon`，都可选。宿主只管组名与组的顺序（`immersive-shell.ts` 的 `RAIL_GROUP_LABELS`，顺序是合同的 `UI_VIEW_GROUPS`）；没写分组的在「更多」，没写图标的设置页用 `settings`，没写 `creates`、`start` 的插件不出现在新建和首页起点里。工作台经 `plugin-catalog.ts` 的 `creatableKinds`、`homeStarts` 读，校验与拒绝在插件 SDK（`view-placement-declarations.ts`）。写法见 `skills/molis-plugin-dev/ui.md`。
  - 页面由项目里运行的插件渲染、又要作为设置页出现时，插件把工作台页面声明为 `stage` view（不进导航），在渲染出的根元素上标 `data-settings-page="<设置分类 id>"`，再另外声明一个 `settings` view；工作台的设置覆盖层会直接挂载这块已绑定的页面，独立设置页则由宿主转回带项目的工作台（`/projects/<id>/?settings=<id>`）。目前没有插件这样用：「角色」原来是这个例子，现在是宿主自己的一节设置（`settings-sections.ts` 的 `HOST_SECTIONS`，`order: 35`），页面由 `apps/workbench/src/characters/ui.ts` 渲染，根元素同样标 `data-settings-page="characters"`；Characters 不再是插件（CHR-1，2026-10-22）。
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

UI Host 的 `UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT` 由 Workbench 或独立页面实例化，提供 `mountPluginClient(root)`。它拥有挂载去重、文档/祖先 hidden 变化、卸载取消与资源清理；不拥有插件状态。Images、Coding 及子面板、Files/Git 伴随面板和独立 Diff/Text Stats、Host 审查视图、Builder 两套界面、Shelf 及结果面板已接入，Pages 与灵光在离开时收回空白项这一处也用它（`whenVisible` 与 `own`）。同源 iframe 还观察父页面的隐藏与移除。API、隐藏/卸载差异及异步响应检查见 [UI Host README](../../packages/ui-host/README.md#浏览器生命周期)。浏览器回归覆盖真实请求中止、SSE 断开重连、隐藏轮询停止及同一 DOM 重新挂载。

轻量刷新提示可用 `scope.watchRevision(read, refresh)`：可见时每两秒查询 revision，首次进入、变化及断线恢复后重新读取事实，隐藏/卸载清理。`refresh` 在业务交互忙碌时返回 false，保留未消费 revision 待下次读取。Host 按项目提供当前运行插件的 `/api/plugins/<id>/view-revision`，进程更换 epoch；只含不透明 revision，不包含事件正文或授权。Files/Git 已实际接入，固定 Artifact 差异仍保留原版本。

revision 由插件自己推动：服务端在改了页面显示的内容以后调 `services.ui.invalidate()`（PG-061）。它不带参数，只推自己这一个安装，插件 id 取自启动上下文。不要权限，只要 Manifest 声明了 `ui.views`，没声明就以 `ui_host.plugin_denied` 拒绝。动作、随激活的作业、事件回调、定时器里都能调；它不进调用记录，页面重读用的是读的人自己的授权。`start()` 里调用不做任何事：插件还没运行，启动完页面本来就会读一次。停用或重启开始以后，这次激活拿到的 client 再调一律被拒，版本号不动。`stop` 钩子还在跑时，被拒照常同步抛错（激活在钩子之前就已撤下）；钩子返回以后，插件留下的定时器、监听器再调，什么也不做也不抛错（返回 `undefined`），宿主按安装与世代计数，每个方法第一次写一行 `stopped_service_call` 日志（BL-411，所有平台服务都这样，见 `skills/molis-plugin-dev/host.md`）。只有一种例外：调用发生在某个处理器还没返回的动作、消费场景、作业，或还没答复的路由里（BL-403）（停止前就在跑的那次调用，或重启后的新激活拿旧 client 调），被拒照常抛错，那次调用的发起方会收到。所以漏清的回调不会让宿主进程退出，但仍要在 `stop` 一开始清掉：它们白跑，日志里留下这个插件。Home 实例推的是 Home 路由的 revision；双实例两半各推各的。宿主自己只剩一处在推：Home 插件的命令成功以后推一次。Files 和 Git 都在事件回调里自己调；Git 另在宿主的操作回执监听里调，这个监听在 `stop` 一开始就清掉。沙箱插件的 SDK 还没有 `ui`。

### 浏览器请求

页面向宿主发请求只有一个助手：ui-host 的 `UI_REQUEST_CLIENT_SCRIPT`（`packages/ui-host/src/request-client.ts`），每页装一次，挂成 `globalThis.molisWorkRequest`；类型在合同 `@molis-ai/molis-work-contracts/platform/ui`（`UiRequest`）。插件客户端从 W5-04 起经宿主给的 `host.request` 用同一个，不再各写 `fetch` 包装。规则：

- **只发本页同源。** 地址先按页面的 origin 解析再检查，发出去的就是检查过的那一个；别的源、别的端口、协议相对地址、`data:` 和 `javascript:` 一律以 `ui_host.cross_origin` 拒绝，一次请求也不发（安全不变量 S-03 的浏览器一侧）。
- **头由助手定。** 变更带控制令牌、一次性键和 JSON 类型，读取什么都不带；调用方的 `headers` 盖不掉这三个。同一件事要重发时给同一个 `key`（宿主据此不重复执行），不给就每次新生成。每个请求都是 `cache: "no-store"`。
- **不自动重试。** 失败、没有回答都只发一次，要不要再试由人决定。
- **失败是带字段的 `Error`**（不是子类）：`message`、`code`（服务端的码；浏览器自己判定的以 `ui_host.` 开头）、`status`（没有回答是 0）、`callId`、`body`（原始回答）。错误体只认 `{ error, code?, call_id? }` 这一种形状。
- **没有回答时不显示浏览器英文原话。** 读取报 `ui_host.unreachable`「连不上 Molis Work 服务，请稍后重试」；写入报 `ui_host.outcome_unknown`「不知道这次操作有没有完成，请刷新后核对」，页面保留已填内容、不替人重发。已有自己重发设计的界面（助理输入框用同一 `request_id`、Goal 表单复用键）保持原样。
- **诊断编号只在查得到时出现。** 助手只读错误体里的 `call_id`，不读响应头；宿主只在这次调用在调用记录里留下了行时才往错误体写它，所以界面上出现的编号，在「设置 › 诊断」里一定查得到。管理类写入和入口的安全拒绝不进调用记录，没有编号。`show(目标, 错误, 兜底)` 把消息写进错误区域，有编号时加一个「诊断编号 xxxxxxxx」按钮（点一下复制完整编号）；`toast(...)` 是同样的错误吐司，带编号的停约 8 秒，指着或聚焦时不消失；吐司上换了新消息，旧按钮连同它的焦点就算没了，不等浏览器报「失去焦点」（有的浏览器引擎在聚焦的节点被删时不报）。
- **谁拥有什么。** 键、头、错误形状、编号按钮归助手；错误文案、放在页面哪里、要不要保留输入仍归各界面。

`molisWorkControlHeaders()` 留着，是同一助手只给头的入口，供还没迁的调用方使用（删除条件见 [UI Host README](../../packages/ui-host/README.md#浏览器请求)）。进度：W3-10-1a 把助手装到不进 `/assets/` 的内联页面（设置、项目设置、引导、新建项目旅程、选择页、侧栏独立页、创作台页）；W3-10-1b 让工作台主程序（`/assets/molis-work-workbench.js`）以助手开头，所以挂进工作台的页面（设置里的各页、侧栏）不用自带，并先迁了设置一组（模型、提示词、助理、记忆、诊断、常驻服务、项目与项目说明、Runtime 接入预览）、侧栏（含浏览器与文件）、设置目录、后台任务和插件通知；工作台的其余请求（导航、Feed、插件挂载、助理底栏、放置、搜索，W3-10-2～4）和插件客户端（W5-04）还在用各自的包装。挂进工作台的页面里的「诊断编号」按钮只有一个复制入口（`data-molis-call-id`，助手的点击处理），不再另挂 `data-copy-value`。

隔离视图另可调用 `host.confirm(message)`、`host.prompt(message, initial)` 和 `host.copyText(text)`：前两者是当前视图内可取消的异步组件对话框，后者只在真实用户操作后复制文字，不提供系统剪贴板读取。模型设置更新的通知由外壳传给各视图，再由插件按自身权限重读状态。

隔离页面的 `host.terminal.mount(element, { panelId, onEvent })` 按需加载平台已有终端资源。返回的视图提供 `focus()`、`fit()` 和 `dispose()`；卸载视图不停止已接受的进程，停止须显式发送 `kill`。共享滚动、流式文字与复制反馈在子页面中初始化；`navigator.clipboard.writeText` 也接到同一受限复制通道，宿主仍检查真实用户激活，不提供剪贴板读取。

服务端投影的页面使用 `host.view.readDocument(): Promise<string>` 获取自己当前贡献的 HTML。宿主固定读取页面来源，提取该贡献的惰性内容，并在读取前后验证页面授权；页面不能请求其他贡献或宿主整页。普通业务变更仍走自身声明的动作或路由。

页面要在自己的布局里展示另一个已启用插件的对象，使用 `host.view.embed(element, { surface, itemId, title? })`，得到 `ready` 与 `dispose()`。它只提交对象身份和区域坐标；宿主在该区域显示同项目的独立页面，内容 DOM、页面凭据和任意地址均不交给调用插件。区域受父页边界裁切，隐藏随父页隐藏，移除占位元素或关闭父页即释放；创建时复核父页授权，目标交互继续由目标页自己的授权处理。

`host.workspaces.add(path)` 在宿主显示插件、项目与路径，真实确认后关联；`host.workspaces.select(id)` 只切换当前项目已经授权的浏览目录。页面须有 `workspace:read`，不能通过普通请求伪造确认、项目或通用设置权限；隐藏取消尚未完成的关联。

页面收尾用 `host.view.onClosing({ reference, input })` 在页面活跃时登记，`null` 取消登记。宿主离开文档时以 keepalive 发送一次，先取消该页普通在途请求，再在同一激活、项目和权限下运行它自己声明的动作，最后撤销页面；消费别的插件动作不能登记为收尾。空白新建项使用原有带版本约束的撤销动作，任何待保存或非空输入都会取消登记。keepalive 仅保持浏览器传输，不延长撤权或项目删除后的写权限。
