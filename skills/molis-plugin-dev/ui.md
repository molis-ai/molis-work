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
- **窄屏可用**：可点目标约 44px，列表行在窄屏把操作换到下一行；工具条放不下时名称收成图标（名称仍是可访问名称）。

## 槽：人从哪进来

合同 `ui.views[].slot`：

| 槽 | 放哪 | 例子 |
| --- | --- | --- |
| `navigator` | 一级入口：出现在底栏的插件切换列表里，可以被人钉进 Dock（技术标识沿用 `navigator`） | Feed、Inbox、Pages、Goals、Sessions |
| `stage` | 工作区里的工具面，不进插件切换列表 | Diff、Text stats |
| `settings` | 全局设置目录 | Shelf、Coding 偏好 |
| `island` | 个人常驻入口：底栏右侧，项目圆钮旁 | 灵光 |
| `side` | 侧栏里的一个标签：在工作旁边打开，与讨论、浏览器、文件并列（specs/archive/side-panel） | 需要边工作边看的小工具面 |

全局只有一处导航与对话入口：底部常驻栏（左侧 Dock 菜单与常驻插件，中间插件切换 + Assistant 输入，右侧 Shelf、灵光、侧栏按钮与项目）。侧栏在工作右边打开，放讨论、浏览器、文件和插件声明的 `side` 标签。插件不要再做全局侧栏、第二个对话入口或自己的顶栏导航；插件内部的目录、树、列表与详情可以分栏。

Workbench HTML Slot（贡献挂载，不是 views.slot）：`workbench.directory`、`workbench.main`、`workbench.overlay`、`workbench.settings`、`workbench.side`。不能往未声明 Slot 塞 HTML。不要把内部组件实例或 Store handle 传过边界。详情里嵌别人的内容，对方必须显式开放 Slot。

### 侧栏标签（`side`）

- 声明：`ui.views` 里写 `{ view_id, slot: "side", title, contribution_id, icon }`；contribution 的 surface 目标是 `workbench.side`（格式 `declarative-html`）。插件在项目里启用才出现，停用或卸载就撤下，不留空标签。
- Host 在 `/projects/<id>/side/<project_plugin_id>/<view_id>` 用独立文档渲染它，侧栏用同源 iframe 装载：引用工作台同一份样式表（随页面缓存，插件在舞台上怎样显示，这里就怎样显示），并运行插件的 `clientFactory`（多一个 `side: true`）。contribution 收到的 model 只有位置：`{ project_id, route_prefix, view_id }`，数据仍经插件自己的动作与路由读取。
- 复用舞台外壳（`renderPluginStageShell`）没问题：外壳默认 `hidden`，侧栏文档作为宿主会在挂载客户端前显示它。个人插件（不按项目存的，如灵光）同样出现。
- 位置、宽度、打开与收起归 Host：插件不能自己定位、不能改侧栏尺寸，也不能借侧栏拿到别的权限。要让侧栏切到自己的标签，页面发 `molis:side-open { tab: "plugin", view: "<project_plugin_id>/<view_id>" }`（同源 iframe 用 `postMessage` 同名消息）。
- 只想让侧栏的“文件”标签列出你的文件，不需要 `side` 视图：声明一个文件来源即可，见 [files.md](files.md)。
- 插件的工作要在侧栏浏览器里打开或操作某些网站，就在 `permissions` 里声明 `{ permission: "surface:browser", required, reason, origins: ["https://shop.example.com"] }`。`origins` 必须是完整来源，不带路径、查询串或片段，否则 Manifest 当场被拒；其他权限不能带 `origins`。声明会出现在插件市场的卡片上（「会在侧栏浏览器里使用：…」），`molis-work-plugin validate` 的输出里也会列出 `browser_sites`。声明只是告诉用户，不代替每一步的确认：动手仍按侧栏浏览器的规则逐步确认，上传文件永远要确认。
- 门禁：`inspectManifest` 拒绝未知槽和未声明的 contribution；`tests/side-panel-platform.test.ts` 用一个未知插件只靠声明接入、停用后撤下。

`settings-page` 只能挂 `workbench.settings`。来源账号、Inbox 列表仍是插件内容，不进全局设置。 设置分类是一张表（`apps/workbench/src/settings-sections.ts`）：`settings` view 的 `order` 决定位置（宿主 10 界面与语言、20 模型、30 助理、40 提示词、50 AI 与执行工具、60 能力、90 诊断；不写为 100，进「插件」组）。页面由项目里运行的插件渲染时（Characters），根元素标 `data-settings-page="<id>"`，工作台设置覆盖层直接挂载它；页面里指向 `/settings/*` 的链接一律在覆盖层里打开，不离开外壳。

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

Pages 族：交互在插件包的 `CLIENT_FACTORY_SCRIPT`（常是 `src/client.ts` 导出的工厂字符串），在 `builtin-plugins.ts` 的同一插件条目声明 `workbench.clientFactory` / `settingsClient`，由 `plugin-workbench.ts` 自动派生并注入。

Feed / Inbox：没有这条 factory。列表、详情、来源对话框在 `apps/workbench/src/scripts/client/navigation-feed.ts`、`navigation-inbox.ts`、`events-primary.ts`。抄 Pages 的 client 到 Feed 不会接到现有画面。

要做：打开列表、点一行、主按钮、返回、空态、错误、搜索。只服务端渲 HTML、不写客户端，主路径点不动。

搜索：Pages 族用 `searchRow: { selector, idDataset }`，例如 `[data-page-id]`。Feed/Inbox/Goals 的全局搜索在 `global-search.ts` 写死，只配 searchRow 不会进那份名单。

确认用 `dialog.mw-dialog`，不要 `window.confirm` / `alert` / `prompt`。异步失败 `showNote`。

自动保存不得重挂正在编辑的 DOM、不得丢掉光标。`save()` 不要调用 `fillEditor`。增删改查成功后重新 GET 列表、保住滚动和当前选中（对照 `specs/archive/list-silent-refresh/spec.md`）。不要 `location.reload()`。

重编辑器（Pages 的 ProseMirror）打成浏览器 IIFE，不要塞进 factory 字符串。还要在 `apps/local-host/src/web-assets.ts` 挂 `/assets/…`，HTML 再 `<script src="…">`。

## 控件与视觉

从 `@molis-ai/molis-work-design-system` 导入 `renderButton` / `renderChoice` / `icon` / 已有 `render*`。class 用 `mw-btn`、`mw-input`、`mw-status`、`mw-choice`。标本与组合：`/__ui/catalog`（含底栏与浮层的真实样例）。

- 字体：系统无衬线 + 平台中文字体（`--font`），代码与终端用 `--font-mono`。字重用角色：`--weight-title` 600、`--weight-control` 500、`--weight-body` 400；不写 700，不用 `!important` 改字重。
- 面：桌面 `--page`，工作面 `--paper`，插件目录列与内层块 `--surface-soft`，局部分组洗色 `--rail`，分隔 `--line`。面板里的全幅画布用 `--canvas`（与工作面同色）。
- 动作与强调：主操作石墨 `--action`；选中用 `--nav-active` 或石墨；焦点、链接、进行中用铜色 `--accent`（历史名 `--blue` 同值）。不要蓝色、不要插件色铺底。
- 焦点：`--focus-stroke`（2px 铜色外描边）；输入框聚焦是加深的边和一圈淡铜色光晕，由 `mw-input` 提供。
- 状态色走 tone/status（文字 + 圆点或图标，不只靠颜色）。禁止系统下拉、系统色盘、`alert` / `confirm` / `prompt`、裸 `<select>`。
- 色用 token，组件规则里不要写死 hex。
- 尺寸：控件 32px（紧凑密度 28，窄屏/粗指针 44）；圆角 控件 8、行 10、卡片 12、工作面 14、对话框 16。
- 动效：`--dur-press` 130ms（按下与悬停）、`--dur-move` 250ms（状态移动）、`--dur-arrive` 420ms（到达），曲线 `--ease-quint`、`--ease-spring`。`mw-btn` 回弹、菜单从控件长出、对话框与侧边面板入场、列表到达都由 Host 提供，不要重写。`prefers-reduced-motion` 与自动化下全部静止。
- 不引入 React/shadcn。HTML Slot：`mw-*` + `data-slot`。
- 插件样式放包内 `styles.ts`，经 Workbench pack 的 `stylesheet` 注入；只写本插件的布局，不重画共享控件。

终层（`packages/design-system/src/styles/craft-finish.ts`，最后加载）：

- 舞台已经在连续的白色工作面上。不要再给自己的舞台画外框、圆角卡片或整页阴影；需要分区用间距、字重和分隔线。
- 插件自己的「完成」和「新到达」可以调用 `molisCraft.celebrate(元素)` / `molisCraft.land(元素)`（只做呈现，减少动效时自动静止）。只在真实完成或真实到达时调用，首次渲染不要调用。
- 位置由标签条最前的插件芯片说明，舞台不需要再放一行「插件名」大标题。

硬规则与用法：`packages/design-system/README.md`。

## 文案与 i18n

- UI 字符串用中文当 key：`p.text("加入 Inbox")`。英文写插件 `src/en.ts`，**还要**在 `apps/workbench/src/i18n/en.ts` 里 `import { X_EN }` 并展开进总表。只写插件文件，英文界面仍是中文 key。
- 按钮说人做的事，不说机制（不要「提交 Attention Command」）。
- 空态说明下一步能做什么，不要空讲架构。

## 验收

改了可见 UI：用浏览器把「打开插件 → 点一行 → 主按钮 → 返回」走完。只截一张静态图不算验过。相关列表/详情共享状态的，两边都看一眼。空态、错误、窄屏返回一起做。

## 客户端挂载与异步资源

原生插件 factory 使用 Host 注入的 `mountPluginClient(root)`，返回 null 就退出，避免同一 DOM 重复绑定。用 scope 的 listen、timeout、frame、observe、own 管理资源；不要留下全局监听、SSE 或观察器。Workbench 和独立页面都由 UI Host 提供同一实现。

进度查询放在 `whenVisible(signal => cleanup)` / `poll` 中：隐藏停止轮询与订阅，再次显示读取权威状态。请求用 `scope.fetch`，读取 body 后 `scope.assertCurrent(signal)` 才消费结果。普通写入只绑定挂载取消，不因隐藏页面重放命令；UI 卸载不等于服务端业务任务已取消。保留业务幂等和结果未知的提示。参考 Images、Coding、Builder 与 Shelf 当前客户端、`packages/ui-host/README.md`；用真实浏览器验证隐藏祖先、重复挂载、卸载、延迟返回与恢复。

Files/Git 的目录子树独立挂载，避免和 Coding 根节点争用同一个挂载。Host 审查组件接收调用方生命周期和当前可见性 signal，并以自己的容器管理监听与卸载；不要用审查容器因空数据而 hidden 来判断是否该读取，也不要让旧显示世代的决定回调操作重新进入的界面。普通刷新不使同一显示世代的在途决定失效，过期回执只可触发读取当前状态，不能重放命令。

需要事件刷新时复用 `scope.watchRevision(read, refresh)`；可见时只查轻量 revision，变化后读原状态，隐藏/卸载停止，重连重新读当前事实。忙碌时 refresh 返回 false，避免丢失发生在当前读取期间的通知。revision 不是业务执行身份或成功回执，不能重放写命令。参考 Files/Git。

## 生成插件的页面组合

生成插件使用 design-system 的 `PluginPresentation` v1：stack/split/grid 树引用已有部件，kind、密度、阅读宽度、主操作与选中详情都是语义属性。结构由 `validatePluginPresentation` 严格校验；旧插件没有 presentation 时沿用旧布局。可操作示例在 `/__ui/catalog#plugin-composition`，由正式渲染器运行，示例数据只在该页内存。

详情从当前集合记录读取，宽屏并排、窄屏返回目录；移动布局保留输入与选中。不要另复制操作和绑定，也不要写自有 CSS 或脚本。流程与输出见 [generated-ui.md](generated-ui.md)。
