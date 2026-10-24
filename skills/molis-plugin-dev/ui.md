# 插件 UI

产品气质：Soft Workbench——珍珠灰桌面上一张连续的白色工作面，石墨主操作，安静的层次。不要默认 Dashboard、表格、卡片墙、后台式布局。先找这个插件里「人盯着的那一块」，效率场景再保证信息密度。规范总表：仓库 `DESIGN.md`。

## 质量线（所有插件）

官方插件和插件创作台生成的插件用同一条线；生成插件由平台渲染器保证其中大部分，设计时仍要按它取舍。

- **只用 UI 目录里的组件**（组件板 `/__ui/catalog`，`mw-*`）。目录里没有的控件或交互不要自造；需要新组件先进目录。
- **三种状态都要有**：还没有内容（空态居中：图标、一句标题、下一步能做什么、一个主操作）、正在加载（骨架，不留白）、出错（说原因和下一步，输入保留）。
- **主操作一处**：一个画面只有一个石墨主按钮；次要操作是浅洗色的柔和按钮，不画外框；新建入口放在标题区或工具条右侧、或列表末尾；危险操作弱化，并在执行前确认。
- **文案**：按钮说人做的事，不说机制；时间说「今天 14:30」，原值保留；取值用人话（「想读」而不是 `unread`）。
- **层次先靠字**：标题 600、条目与控件 500、正文 400；再靠字号和 `--ink` / `--ink-soft` / `--muted`；最后才用间距和少量分隔线。不给舞台再画外框、不嵌套卡片、不堆装饰性标签。
- **颜色只表达状态和选中**：选中是中性的浅底（`--nav-active`）或石墨；铜色只给焦点、链接、进行中；插件没有身份色，图标保持中性。业务界面不用渐变；柔和的冷暖光只属于新手引导。
- **阴影只给抬起的东西**：菜单、弹层、对话框、Toast 用浮层阴影且不再描边；普通内容不加阴影。
- **位置不重复**：工作台标签条已经写了插件名，舞台里不再放一行插件名大标题；独立打开（预览、试用页）时才显示。
- **浅色和深色都成立**：颜色一律用 token，不写死；在两种主题下各看一眼。
- **反馈可见**：按下有回弹，保存后新记录可见（上浮进入），成功提示短暂出现后淡出，失败提示留下直到下次成功。
- **Toast 只有一种**：用设计系统的 `.mw-toast`（服务端用 `renderToast`）；成功或失败设 `data-mw-state`（`done`、`failed`）带标记，失败加 `is-error` 会轻摇一次；撤销或下一步是 `.mw-toast__action`。插件只写它放在哪里（居中用 `inset-inline: 0` 加 `margin-inline: auto`，不用 `transform`），不写颜色、圆角和动效。
- **共有机制直接用，不自己写**（组件板「视觉机制」有样例，工作台与侧栏页面都带着）：哪里都不画滚动条，设计系统一条规则管全部页面，插件不写 `scrollbar-width`、`scrollbar-color`、`::-webkit-scrollbar`（`tests/scrollbars-hidden.test.ts` 拦）；放不下的横向条（标签、chip、视图切换）标 `data-overflow-fade`，只在真有更多的一侧淡出；复制按钮调 `window.molisCopy(button, 文本, { done: "已复制", failed: "复制失败" })`，剪贴板真的收下才显示「已复制」、宽度不跳（只有图标的按钮换成对勾或叉，文字由读屏读出），返回是否成功，失败时再告诉人怎么手动复制；可折叠的明细写成 `<details class="mw-collapsible"><summary>…</summary><div class="mw-collapsible__body">…</div></details>`，按自然高度展开、途中反向接着走；会变的数字（计时、计数、序号）写成 `<span class="mw-num" data-num-ghost="取值范围里最宽的值">值</span>`，数字等宽，位数变化和字体切换都不推旁边的控件；会一直长的对话或日志用 `window.molisFollow(滚动容器)` 管滚动：到底就跟着，人往上滚、按键或选字就停，新内容来了调 `pin()`、「回到最新」调 `toLatest()`、跳到某张卡之前调 `release()`，切到另一段对话时放回记下的位置用 `restore(top)`、新对话用 `resume()`，客户端卸载时 `lifetime.own(() => follow.dispose())`；同一个容器只有一个主人，后来的调用者拿到的是同一个，它传的 `onChange` 不生效；页面自己的滚动不会被当成人的操作，不自己判断离底多少像素；很长的列表画完后调 `window.molisShowMore(列表, { key, label: "再显示 {n} 项", keep })`，先给前五项、其余收在一个按钮后面（只多一项就直接显示），`keep` 标出必须一直看得见的项（失败），人点开后同一个 `key` 重画也保持展开。
- **流式的代码块原地长**：边写边显示的回复用 `window.molisStreamText(容器, html, { reveal, grow })`；代码块交给 `grow`，用插件 SDK 的 `growCodeTokens`（`@molis-ai/molis-work-plugin-sdk/highlight`）从变了的那一行起着色（写的时候就是最后一行），块、复制按钮、已着色的片段和人打开的折叠都留着，复制取现在的原文；不要每次整块换掉、从头着色（1,000 行一次 19.5 ms，原地长 3.7 ms）。Diff 按块读：块里一行按首字符算，像文件头的行也是内容。
- **外来的文字用 SDK 显示和脱敏**：订阅、网页、模型回答这类不可信的文字，用 `@molis-ai/molis-work-plugin-sdk/rich-text` 的 `renderRichText` 显示成 Markdown 加白名单 HTML（结果一律清洗过，链接只留 http(s)），列表行和摘要用 `richPlainText`；这个子路径要的 `marked` 与 `sanitize-html` 由插件自己写进 `package.json`。把外来的文字交给模型或显示回屏幕之前，先过 SDK 根入口的 `redactSecrets` 遮住贴进来的密钥。不自己写第二套解析、清洗或着色。
- **窄屏可用**：可点目标约 44px，列表行在窄屏把操作换到下一行；工具条放不下时名称收成图标（名称仍是可访问名称）。
- **悬停才出现的操作，键盘和触控也拿得到**：行里平时藏起、指针停上去才出现的按钮，同一条规则也要写 `:focus-within`（焦点进到行里就出现），并在 `@media (hover: none)` 里一直显示；只有选中后才出现的（选中即点一下）可以不写。键盘停点之外的按钮（如标签上的关闭）在行上用 `aria-keyshortcuts` 写明等价的键。
- **被截的名字找得回来**：名称、路径、摘要可以用省略号或限定行数截短，但要放在能按下或能移到的控件或行里，平台的提示会在指针停留、键盘聚焦和触控按住时给出全文；不给被截的文字另写 `title` 或自己的提示，错误、状态与操作的标签不截在没有控件包着的地方。

## 槽：人从哪进来

合同 `ui.views[].slot`：

| 槽 | 放哪 | 例子 |
| --- | --- | --- |
| `navigator` | 一级入口：出现在底栏的插件切换列表里，可以被人钉进 Dock（技术标识沿用 `navigator`） | Feed、Inbox、Pages、Goals、Sessions |
| `stage` | 工作区里的工具面，不进插件切换列表 | Diff、Text stats |
| `settings` | 全局设置目录 | Shelf、Coding 偏好 |
| `island` | 个人常驻入口：底栏右侧，项目圆钮旁 | 灵光 |
| `side` | 侧栏里的一个标签：在工作旁边打开，与讨论、浏览器、文件并列（specs/archive/side-panel） | 需要边工作边看的小工具面 |

视图上还有几项可选的声明，宿主照着放，不另写名单（W5-06 第 2b 片，合同在 `packages/contracts/src/platform/ui.ts`）：

- `icon`：图标名（设计系统里登记的名字）。`settings` 视图的 `icon` 是设置目录里这一页的图标；没写、或宿主不认识这个名字，就用 `settings`。
- `group`（只用于 `navigator`、`island`）：插件切换列表里归哪一组，取 `advance`（推进）、`make`（写与做）、`personal`（个人）、`research`（研究）、`code`（编码）之一。组名和组的顺序归宿主；组内先是 `island` 视图，再按视图的 `order`、同 `order` 按插件 id 排。不写就在「更多」里。
- `creates`（只用于 `navigator`、`island`）：`{ station, title }`，在目标的「材料」里给一个「新建」入口。`station` 必须是本 Manifest 里一个能新建的工作流内容站（`defineWorkflowContentActions({ …, create: true })` 的 `id`）；新建出来的默认标题是「未命名」加 `title`（如「未命名文档」）。不写就没有新建入口。
- `start`（只用于 `navigator`、`island`）：`{ title, hint, icon? }`，项目首页当天没有事件时给的一个起点，点了打开这个插件；`icon` 不写就用视图的 `icon`。不写就不出现在首页。

写错的（不认识的组、`creates` 指向本 Manifest 没有的站或不能新建的站、缺 `title` 或 `hint`、用在别的槽上）`parsePluginManifest` 当场拒绝（`molis-work-plugin validate` 同一套检查），每一种都有拒绝用例（`tests/view-placement-declarations.test.ts`）。工作台读这些声明的函数在 `apps/workbench/src/plugin-catalog.ts`。

全局只有一处导航与对话入口：底部常驻栏（左侧 Dock 菜单与常驻插件，中间插件切换 + Assistant 输入，右侧 Shelf、灵光、侧栏按钮与项目）。侧栏在工作右边打开，放讨论、浏览器、文件和插件声明的 `side` 标签。插件不要再做全局侧栏、第二个对话入口或自己的顶栏导航；插件内部的目录、树、列表与详情可以分栏。

Workbench HTML Slot（贡献挂载，不是 views.slot）：`workbench.directory`、`workbench.main`、`workbench.overlay`、`workbench.settings`、`workbench.side`。不能往未声明 Slot 塞 HTML。舞台页照 Manifest 挂：打开舞台的那个视图（有 `stage` 视图就是它，否则是 `navigator` 入口）用 `contribution_id` 指向一个贡献，工作台把这个贡献的 `workbench` surface 挂到它声明的 `workbench.main`（`apps/workbench/src/declared-stages.ts`），model 是 `{ primitives: { escape, text } }`；没有这个 surface 就没有舞台，宿主和工作台里不另写按插件名的行。不要把内部组件实例或 Store handle 传过边界。详情里嵌别人的内容，对方必须显式开放 Slot。

### 侧栏标签（`side`）

需要随当前文档变化的侧栏，在 view 上声明 `context_binding: "focused-object"`。复用工作台给出的对象上下文，不自行追踪全局选中项：经 `host.messages` 接收 `molis:side-context` 和递增的 `context_epoch`，启动时发 `molis:side-ready`，发回编辑器的请求携带所收 epoch。隔离页面使用宿主绑定的通道和当前对象，不读取父窗口；业务读写仍走对象所有者的动作授权。收起保持收起，选中的普通工具不因换文档被抢走。Pages 评论与备注使用这条协议，详情见 [统一规格](../../specs/archive/pages-assistant-surfaces/spec.md)。

- 声明：`ui.views` 里写 `{ view_id, slot: "side", title, contribution_id, icon }`；contribution 的 surface 目标是 `workbench.side`（格式 `declarative-html`）。插件在项目里启用才出现，停用或卸载就撤下，不留空标签。
- Host 在 `/projects/<id>/side/<project_plugin_id>/<view_id>` 用独立文档渲染它，侧栏用同源 iframe 装载：引用工作台同一份样式表（随页面缓存，插件在舞台上怎样显示，这里就怎样显示），并运行插件的 `clientFactory`（多一个 `side: true`）。contribution 收到的 model 只有位置：`{ project_id, route_prefix, view_id }`，数据仍经插件自己的动作与路由读取。
- 复用舞台外壳（`renderPluginStageShell`）没问题：外壳默认 `hidden`，侧栏文档作为宿主会在挂载客户端前显示它。个人插件（不按项目存的，如灵光）同样出现。
- Home Runtime 插件的侧栏使用 `/plugins/<project_plugin_id>?side=<view_id>`，仅接受 Manifest 声明的 `side` 视图，并从正在运行的 contribution 渲染。首页和项目共用同一 Home 实例；首页侧栏只放 Home 工具。客户端同样收到 `side: true`，可决定初次进入时的内容，不决定侧栏位置。
- 位置、宽度、打开与收起归 Host：插件不能自己定位、不能改侧栏尺寸，也不能借侧栏拿到别的权限。要让侧栏切到自己的标签，页面发 `molis:side-open { tab: "plugin", view: "<project_plugin_id>/<view_id>" }`（同源 iframe 用 `postMessage` 同名消息）。
- 只想让侧栏的“文件”标签列出你的文件，不需要 `side` 视图：声明一个文件来源即可，见 [files.md](files.md)。
- 插件的工作要在侧栏浏览器里打开或操作某些网站，就在 `permissions` 里声明 `{ permission: "surface:browser", required, reason, origins: ["https://shop.example.com"] }`。`origins` 必须是完整来源，不带路径、查询串或片段，否则 Manifest 当场被拒；其他权限不能带 `origins`。声明会出现在插件市场的卡片上（「会在侧栏浏览器里使用：…」），`molis-work-plugin validate` 的输出里也会列出 `browser_sites`。声明只是告诉用户，不代替每一步的确认：动手仍按侧栏浏览器的规则逐步确认，上传文件永远要确认。
- 门禁：`inspectManifest` 拒绝未知槽和未声明的 contribution；`tests/side-panel-platform.test.ts` 用一个未知插件只靠声明接入、停用后撤下。

`settings-page` 只能挂 `workbench.settings`。来源账号、Inbox 列表仍是插件内容，不进全局设置。 设置分类是一张表（`apps/workbench/src/settings-sections.ts`）：`settings` view 的 `order` 决定位置（宿主 10 界面与语言、20 模型、30 助理、35 角色、40 提示词、50 AI 与执行工具、60 能力、90 诊断；不写为 100，进「插件」组）。宿主的一节自己渲染成工作面时（角色，`apps/workbench/src/characters/ui.ts`；Characters 不是插件），根元素标 `data-settings-page="<id>"`，工作台设置覆盖层直接挂载它；页面里指向 `/settings/*` 的链接一律在覆盖层里打开，不离开外壳。

不是所有一等入口都是「列表点开详情」：Goals 是树、画布和 Goal 文档；Feed 是文章列 + 阅读页；判断规则编辑器在「能力」；Sessions 是会话/终端；Shelf 是置物架。抄最近的同类，不要强套 plugin-stage。

## 舞台（列表 + 详情）

一级入口用 Host 壳，不要自绘第二套外框：

```ts
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";

renderPluginStageShell({
  surface: "pages",
  label: "Pages",
  dataset: "pages",
  body: `... plugin-stage-list + plugin-stage-workspace ...`,
});
```

约定：

- `plugin-stage-shell` + `plugin-stage-list`（`feed-stage-list feed-stage-tree`）+ `plugin-stage-workspace`。
- 点插件条：`is-plugin-directory-empty`，不要 `data-directory-open` 第二栏（来源管理等隐藏 panel 除外）。
- 列表页由 Host 画成原型的页：居中 960px 一栏，页标题取自 `label`（Host 写进 `--stage-title`，插件不要自己再画标题），`plugin-stage-chrome` 里的动作排在标题右侧，其中第一个 `tree-create` 是本页唯一的石墨按钮。行至少 44px。分组用 `goal-collection-fold`：caret + 状态 mark（勾=安好，三角=要盯）+ 标题 + 计数。点分组头只开合，不自动打开第一行。
- `label` 写界面语言的原文（中文），并在插件的英文表里给出对应；Host 用 `L()` 取当前语言的标题。
- 编辑器是单个表单时，放进全宽滚动容器里的居中一栏（参考 Forms 52rem、Dataset 72rem）；写作类（灵光）是写作页：文档标题 + 阅读字号正文。
- 宽屏点行：`data-expanded="true"`，列表收成 `--tree-width` 的浅色侧栏（`--surface-soft`），右边详情。窄屏只看正文，`plugin-stage-back` 回列表。
- 行：`feed-stage-entry directory-list-row`，不要 `mw-dir-row` 当主列表。
- 舞台根节点带 `data-<id>="workbench"`（如 `data-pages="workbench"`）。测试和客户端靠它认面。
- 详情底栏放下一步处置；打开原文 / 返回是导航，不是判断池里的动作。
- 不要自动选中第一条。

对照：`inbox/src/ui.ts`、`pages/src/ui.ts`、`form/src/ui.ts`（Feed 现在是专门的阅读布局，不再是列表 + 详情的样板）。合同：`specs/archive/plugin-stage-master-detail/spec.md`，版式以根 `DESIGN.md`「Plugin stage lists」为准。

## 浏览器客户端

打包的 TypeScript 客户端使用 `@molis-ai/molis-work-contracts/platform/ui` 的 `UiPluginClientHost`，用 `Pick` 只取需要的字段，不另写一套宿主接口；DOM 类型由浏览器消费者传入泛型。`molisWorkRequest` 的形状也来自该合同；全局声明由 Plugin SDK 公共入口提供，浏览器文件用 `import type {} from "@molis-ai/molis-work-plugin-sdk"` 纳入，页面不重复声明、不另建请求实现。用 `host.pluginRoute(relativePath)` 请求自己的路由，用 `host.route(platformPath)` 请求已获准的平台路径；`host.pluginId` 来自 Manifest，仅作展示，授权仍由宿主绑定。生命周期 `scope.fetch` 与 `assertCurrent` 保留取消及迟到回应拒绝。打包器作为包的直接开发依赖，与根目录同版；词典和测试写法见 [逐插件客户端方案](../../specs/repository-anti-corruption/slices/w5-04-plugin-client-bundles.md)。

Pages 族：交互在插件包的 `CLIENT_FACTORY_SCRIPT`（常是 `src/client.ts` 导出的工厂字符串），在包 `registration` 里声明 `workbench.clientFactory` / `settingsClient`，由 `plugin-workbench.ts` 自动派生并注入。

Feed / Inbox：没有这条 factory。列表、详情、来源对话框在 `apps/workbench/src/scripts/client/navigation-feed.ts`、`navigation-inbox.ts`、`events-primary.ts`。抄 Pages 的 client 到 Feed 不会接到现有画面。

要做：打开列表、点一行、主按钮、返回、空态、错误、搜索。只服务端渲 HTML、不写客户端，主路径点不动。

搜索：内容来自系统搜索，插件声明搜索来源即可（见 [search.md](search.md)）。打开到对象时，用 `searchRow: { selector, idDataset }`（例如 `[data-page-id]`）让工作台点那一行；按标签打开（`molis-work:select-item`）的插件在打开舞台的视图上声明 `accepts_objects: true`，工作台的搜索、放置与侧栏文件都按它开对象标签。

确认用 `dialog.mw-dialog`，不要 `window.confirm` / `alert` / `prompt`。异步失败 `showNote`。

自动保存不得重挂正在编辑的 DOM、不得丢掉光标。`save()` 不要调用 `fillEditor`。增删改查成功后重新 GET 列表、保住滚动和当前选中（对照 `specs/archive/list-silent-refresh/spec.md`）。不要 `location.reload()`。

重编辑器（Pages 的 ProseMirror）打成浏览器 IIFE，不要塞进 factory 字符串。还要在 `apps/local-host/src/web-assets.ts` 挂 `/assets/…`，HTML 再 `<script src="…">`。

### 动作先问几个问题再接着做

不经 Agent 运行、自己调模型的动作，信息不够时不要猜，也不要自己画问卷：
- 动作返回 `{ status: "needs_input", interaction }`（合同 `InteractionRequest`，`@molis-ai/molis-work-contracts/services/agent-interaction`）：`interaction_id`、`why`（一句话，卡片标题）、`questions`（现在只用选择题）、`note`（回答后会发生什么，本插件的话，英文写进本插件词典）。输出 schema 写成一个对象，MCP 工具才不会把结果包一层。
- 动作自己记住问过的题。人回答后，页面带着 `interaction: { interaction_id, values }` 再调一次动作；动作用 SDK 的 `questionAnswer` 读答案，用 `questionProblems` 对照问过的题检查。有问题就抛本插件的错误码，`details.problems` 放这些原因。
- 宿主对任何插件路由的回答都会做两件事：给 `needs_input` 加上共享问卷卡的 `interaction.html`；给 `details.problems` 加上逐字段的 `details.errors`。页面只要把 html 放进去，用 `host.interaction(card, { onSubmit })` 绑定，出错时调 `showErrors(details.errors)`。
- 样例：Form 的「AI 生成题目」（`plugins/native/form/src/drafting.ts`、`draft-client.ts`）。

## 控件与视觉

从 `@molis-ai/molis-work-design-system` 导入 `renderButton` / `renderChoice` / `icon` / 已有 `render*`。class 用 `mw-btn`、`mw-input`、`mw-status`、`mw-choice`。标本与组合：`/__ui/catalog`（含底栏与浮层的真实样例）。

- 字体：系统无衬线 + 平台中文字体（`--font`），代码与终端用 `--font-mono`。字重用角色：`--weight-title` 600、`--weight-control` 500、`--weight-body` 400；不写 700，不用 `!important` 改字重。
- 面：桌面 `--page`，工作面 `--paper`，插件目录列与内层块 `--surface-soft`，局部分组洗色 `--rail`，分隔 `--line`。面板里的全幅画布用 `--canvas`（与工作面同色）。
- 动作与强调：主操作石墨 `--action`；选中用 `--nav-active` 或石墨；焦点、链接、进行中用铜色 `--accent`（历史名 `--blue` 同值）。不要蓝色、不要插件色铺底。
- 焦点：`--focus-stroke`（2px 铜色外描边）；输入框聚焦是加深的边和一圈淡铜色光晕，由 `mw-input` 提供。
- 状态色走 tone/status（文字 + 圆点或图标，不只靠颜色）。禁止系统下拉、系统色盘、`alert` / `confirm` / `prompt`、裸 `<select>`。
- 色用 token，组件规则里不要写死 hex。
- 尺寸：控件 32px（紧凑密度 28，窄屏/粗指针 44）；圆角 控件 8、行 10、卡片 12、工作面 14、对话框 16。
- 秩序（DESIGN「Order」）：状态环、圆点与字等高——`renderStateRing` 不传 `size` 就跟随所在文字（`1em + 2px`），不要在自己的行里给环定尺寸；图标与文字同号或大一级（12–15px 字旁 12–16px）。并排的按钮同一尺寸（变体不改变高度）、同一行、间距 8（紧凑组 4，只有图标按钮或工具条 2）；页头的动作在标题那一行。字号只用 11/12/13/15/17/20/24/30。圆角只用 4（比控件小的标记）、6（标签）、8（控件）、10（行）、12（卡片）、14、16 与胶囊或圆；套着圆角零件的框取零件的圆角加内距，两条曲线同心；紧凑密度和暗色不改圆角、不把状态词改画成描边胶囊。列表里就地增删、上移下移的条目用 `window.molisReflow(列表, 改动)`（类型 `Reflow` 从设计系统引用），改动要保留元素、不整体重画，否则所有条目都算新来的。空状态用 `mw-empty`：居中、标题 15px/600、动作用次按钮（页头已有石墨的新建，空状态不再放第二个）。`tests/visual-order.e2e.test.ts` 会拦。
- 动效：`--dur-press` 130ms（按下与悬停）、`--dur-move` 250ms（状态移动）、`--dur-arrive` 420ms（到达），曲线 `--ease-quint`、`--ease-spring`。`mw-btn` 回弹、菜单从控件长出、对话框与侧边面板入场、列表到达都由 Host 提供，不要重写。自己的元素要入场时只用共有的关键帧名：到达 `craft-rise`、再显示 `craft-fade-in`、控件下方的菜单 `craft-drop`、上方的 `craft-rise-from-bar`；不写自己的 `@keyframes`（`tests/one-motion.test.ts` 会拦）。时长用 `--dur-*`，不用旧的 `--motion-*`。`prefers-reduced-motion` 与自动化下全部静止。
- 不引入 React/shadcn。HTML Slot：`mw-*` + `data-slot`。
- 插件样式放包内 `styles.ts`，经 Workbench pack 的 `stylesheet` 注入；只写本插件的布局，不重画共享控件。

媒体预览缩放用 `window.molisMediaZoom(viewport, image, { onChange })`（VUX-32），不要自己写 pan/zoom；缩放围绕实际看的位置、平移有边界。

终层（`packages/design-system/src/styles/craft-finish.ts`，最后加载）：

- 舞台已经在连续的白色工作面上。不要再给自己的舞台画外框、圆角卡片或整页阴影；需要分区用间距、字重和分隔线。
- 插件自己的「完成」和「新到达」可以调用 `molisCraft.celebrate(元素)` / `molisCraft.land(元素)`（只做呈现，减少动效时自动静止）；服务端渲染的新行也可以直接带 `data-craft-new`，是同一层淡去的底色。只在真实完成或真实到达时调用，首次渲染不要调用。
- 位置由标签条最前的插件芯片说明，舞台不需要再放一行「插件名」大标题。

硬规则与用法：`packages/design-system/README.md`。

## 文案与 i18n

- UI 字符串用中文当 key：`p.text("加入 Inbox")`。英文写插件 `src/en.ts`，**还要**在 `apps/workbench/src/i18n/en.ts` 里 `import { X_EN }` 并展开进总表。只写插件文件，英文界面仍是中文 key。两种漏写都由 `pnpm health:check` 拦下（CI 也跑）：调用的中文原文没有英文，和 `X_EN` 写了却没并进总表；`node scripts/gates/translations.mjs --missing` 列出缺哪句、该加到哪个词典，哪本词典没接上。检查靠变量名以 `_EN` 结尾认词典。
- 带数的句子整句当一个 key，数用 `{name}` 填（`L("已选 {count} 项", { count })`），不要把数和半句拼起来。英文里跟着数变的词写成 `{count|one|other}`：`"{count} {count|file|files} selected"`，数是 1 时取前一个；同一个名字还要照常写一次 `{count}` 让数本身出现。填值只有一份写法，插件 SDK 的 `fillMessage`（Host 的 `L`、页面的 `L` 和 Coding 的 `codingText` 都用它），自己填值的地方也调它，不另写替换。`tests/fill-message.test.ts` 查英文里没有「{count} 名词s」这种不论单复数都用复数的写法。
- 路由与动作送回页面显示的字（错误、说明、状态名）跟页面语言走（用户 2026-10-20 定）：宿主按请求（页面的语言 cookie，没有就看 Accept-Language）把语言放在调用上下文的 `locale`（`"zh" | "en"`），处理器用自己的词典按它写出要显示的字。`locale` 只选字、不授予任何东西，也从不从输入里读；没有页面的调用（模型的工具调用、定时器、后台工作）没有它，用插件自己的默认语言。存进库里的记录照原样，不按读取者的语言改写。写给模型的话不跟页面语言走。Coding 的写法见 `plugins/native/coding/src/words.ts`：深处抛出的错误用 `codingError`/`codingFailure` 从稳定键写成中文，离开路由时 `codingErrorIn` 按调用方的语言重写，类、码、kind 与 details 不变。
- 按钮说人做的事，不说机制（不要「提交 Attention Command」）。
- 空态说明下一步能做什么，不要空讲架构。

## 验收

改了可见 UI：用浏览器把「打开插件 → 点一行 → 主按钮 → 返回」走完。只截一张静态图不算验过。相关列表/详情共享状态的，两边都看一眼。空态、错误、窄屏返回一起做。

## 客户端挂载与异步资源

原生插件 factory 使用 Host 注入的 `mountPluginClient(root)`，返回 null 就退出，避免同一 DOM 重复绑定。用 scope 的 listen、timeout、frame、observe、own 管理资源；不要留下全局监听、SSE 或观察器。Workbench 和独立页面都由 UI Host 提供同一实现。

进度查询放在 `whenVisible(signal => cleanup)` / `poll` 中：隐藏停止轮询与订阅，再次显示读取权威状态。请求用 `scope.fetch`，读取 body 后 `scope.assertCurrent(signal)` 才消费结果。普通写入只绑定挂载取消，不因隐藏页面重放命令；UI 卸载不等于服务端业务任务已取消。保留业务幂等和结果未知的提示。参考 Images、Coding、Builder 与 Shelf 当前客户端、`packages/ui-host/README.md`；用真实浏览器验证隐藏祖先、重复挂载、卸载、延迟返回与恢复。

Files/Git 的目录子树独立挂载，避免和 Coding 根节点争用同一个挂载。Host 审查组件接收调用方生命周期和当前可见性 signal，并以自己的容器管理监听与卸载；不要用审查容器因空数据而 hidden 来判断是否该读取，也不要让旧显示世代的决定回调操作重新进入的界面。普通刷新不使同一显示世代的在途决定失效，过期回执只可触发读取当前状态，不能重放命令。

需要事件刷新时复用 `scope.watchRevision(read, refresh)`；可见时只查轻量 revision，变化后读原状态，隐藏/卸载停止，重连重新读当前事实。忙碌时 refresh 返回 false，避免丢失发生在当前读取期间的通知。revision 不是业务执行身份或成功回执，不能重放写命令。参考 Files/Git。服务端让自己的页面重新读取，调 `context.services.ui.invalidate()`：不带参数，只推自己的 revision；Manifest 声明了 `ui.views` 就能调，不要权限；动作里、事件回调或定时器里都行。`start()` 里还没运行时调用什么也不做，激活停了（停用、重启）再调被拒，版本号不动。`stop` 钩子里被拒是同步抛错（`ui_host.plugin_denied`）；钩子返回以后，留下的定时器、监听器再调什么也不做、不抛错，在还没返回的动作或还没答复的路由里调照常抛错（BL-411，见 [host.md](host.md)「停止以后」）。会调它的定时器、监听器仍要在 `stop` 一开始清掉：它们停用后白跑，日志里留下这个插件。

## 生成插件的页面组合

生成插件使用 design-system 的 `PluginPresentation` v1：stack/split/grid 树引用已有部件，kind、密度、阅读宽度、主操作与选中详情都是语义属性。结构由 `validatePluginPresentation` 严格校验；旧插件没有 presentation 时沿用旧布局。可操作示例在 `/__ui/catalog#plugin-composition`，由正式渲染器运行，示例数据只在该页内存。

详情从当前集合记录读取，宽屏并排、窄屏返回目录；移动布局保留输入与选中。不要另复制操作和绑定，也不要写自有 CSS 或脚本。流程与输出见 [generated-ui.md](generated-ui.md)。

### 工作台按需客户端

已有构建期登记的 `workbench.clientFactory` 通过同一目录投影为独立脚本，`clientAssets` 声明必须先准备的 UI 资源。首次打开后才挂载；factory 不能依赖工作台闭包内的私有变量，所需能力通过 Host 参数或原声明的页面全局提供。保持同一 surface 根和已打开实例，加载期间最新 select-item 意图在挂载后传递；资源失败只重试 UI 资源。保留原 mountPluginClient 可见性与取消合同，不从隐藏页面停止后台任务。涉及此路径时运行 `tests/workbench-deferred-clients.e2e.test.ts` 和 `tests/client-script-undeclared.test.ts`。
