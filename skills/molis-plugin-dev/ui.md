# 插件 UI

产品气质：中性、紧凑、连续工作面。不要默认 Dashboard、表格、卡片墙、后台式布局。先找这个插件里「人盯着的那一块」，效率场景再保证信息密度。

## 质量线（所有插件）

官方插件和插件创作台生成的插件用同一条线；生成插件由平台渲染器保证其中大部分，设计时仍要按它取舍。

- **只用 UI 目录里的组件**（`/__ui/catalog`，`mw-*`）。目录里没有的控件或交互不要自造；需要新组件先进目录。
- **三种状态都要有**：还没有内容（空态说下一步能做什么）、正在加载（骨架，不留白）、出错（说原因和下一步，输入保留）。
- **主操作一处**：一个画面只有一个主按钮（近黑），新建入口放在标题区右侧或列表末尾；危险操作弱化，并在执行前确认。
- **文案**：按钮说人做的事，不说机制；时间说"今天 14:30"，原值保留；取值用人话（"想读"而不是 `unread`）。
- **密度与层次**：层次靠字号和 `--ink` / `--muted` / `--faint`；分区用间距和发丝线，不给舞台再画外框、不用渐变；颜色只表达状态和选中，图标保持中性。
- **位置不重复**：工作台标签条已经写了插件名，舞台里不再放一行插件名大标题；独立打开（预览、试用页）时才显示。
- **浅色和深色都成立**：颜色一律用 token，不写死；在两种主题下各看一眼。
- **反馈可见**：保存后新记录可见（进入动画），成功提示短暂出现后淡出，失败提示留下直到下次成功。
- **窄屏可用**：可点目标约 44px，列表行在窄屏把操作换到下一行。

## 槽：人从哪进来

合同 `ui.views[].slot`：

| 槽 | 放哪 | 例子 |
| --- | --- | --- |
| `navigator` | 侧栏一级入口 | Feed、Inbox、Pages、Goals、Sessions |
| `stage` | 工作区里的工具面，不占侧栏 | Diff、Text stats |
| `settings` | 全局设置目录 | Shelf、Coding 偏好 |
| `island` | 项目卡片上方 | 灵光 |

Workbench HTML Slot（贡献挂载，不是 views.slot）：`workbench.directory`、`workbench.main`、`workbench.overlay`、`workbench.settings`。不能往未声明 Slot 塞 HTML。不要把内部组件实例或 Store handle 传过边界。详情里嵌别人的内容，对方必须显式开放 Slot。

`settings-page` 只能挂 `workbench.settings`。来源账号、Inbox 列表仍是插件内容，不进全局设置。

不是所有一等入口都是「列表点开详情」：Goals 是树和画布；判断规则编辑器在「能力」；Sessions 是会话/终端；Shelf 是置物架。抄最近的同类，不要强套 plugin-stage。

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
- 默认铺满列表。分组用 `goal-collection-fold`：caret + 状态 mark（勾=安好，三角=要盯）+ 标题 + 计数。点分组头只开合，不自动打开第一行。
- 宽屏点行：`data-expanded="true"`，列表收成 `--tree-width`，右边详情。窄屏只看正文，`plugin-stage-back` 回列表。
- 行：`feed-stage-entry directory-list-row`，不要 `mw-dir-row` 当主列表。
- 舞台根节点带 `data-<id>="workbench"`（如 `data-pages="workbench"`）。测试和客户端靠它认面。
- 详情底栏放下一步处置；打开原文 / 返回是导航，不是判断池里的动作。
- 不要自动选中第一条。

对照：`plugins/native/feed/src/ui.ts`、`inbox/src/ui.ts`、`pages/src/ui.ts`。合同：`specs/archive/plugin-stage-master-detail/spec.md`。

## 浏览器客户端

Pages 族：交互在插件包的 `CLIENT_FACTORY_SCRIPT`（常是 `src/client.ts` 导出的工厂字符串），在 `builtin-plugins.ts` 的同一插件条目声明 `workbench.clientFactory` / `settingsClient`，由 `plugin-workbench.ts` 自动派生并注入。

Feed / Inbox：没有这条 factory。列表、详情、来源对话框在 `apps/workbench/src/scripts/client/navigation-feed.ts`、`navigation-inbox.ts`、`events-primary.ts`。抄 Pages 的 client 到 Feed 不会接到现有画面。

要做：打开列表、点一行、主按钮、返回、空态、错误、搜索。只服务端渲 HTML、不写客户端，主路径点不动。

搜索：Pages 族用 `searchRow: { selector, idDataset }`，例如 `[data-page-id]`。Feed/Inbox/Goals 的全局搜索在 `global-search.ts` 写死，只配 searchRow 不会进那份名单。

确认用 `dialog.mw-dialog`，不要 `window.confirm` / `alert` / `prompt`。异步失败 `showNote`。

自动保存不得重挂正在编辑的 DOM、不得丢掉光标。`save()` 不要调用 `fillEditor`。增删改查成功后重新 GET 列表、保住滚动和当前选中（对照 `specs/archive/list-silent-refresh/spec.md`）。不要 `location.reload()`。

重编辑器（Pages 的 ProseMirror）打成浏览器 IIFE，不要塞进 factory 字符串。还要在 `apps/local-host/src/web-assets.ts` 挂 `/assets/…`，HTML 再 `<script src="…">`。

## 控件与视觉

从 `@molis-ai/molis-work-design-system` 导入 `renderButton` / `icon` / 已有 `render*`。class 用 `mw-btn`、`mw-input`、`mw-status`。标本：`/__ui/catalog`。

- 字重默认 400。层级靠字号和 `--ink` / `--ink-soft` / `--muted` / `--faint`。
- 壳层 hover/当前走 `--nav-*`。主操作近黑（`--action`）。靛只给链接、选区、进行中。
- 焦点：`--focus-stroke` 内侧 1px `--ink`。不要蓝描边。
- 状态色走 tone/status。禁止系统下拉、系统色盘、`alert` / `confirm` / `prompt`、裸 `<select>`。
- 色用 token，组件规则里不要写死 hex。
- 动效用 `--motion-*` / `--ease-*`。`prefers-reduced-motion` 去掉位移。
- 窄屏/粗指针可点目标约 44px；桌面控件约 28，表单主操作 36。
- 不引入 React/shadcn。HTML Slot：`mw-*` + `data-slot`。
- 插件样式放包内 `styles.ts`，经 Workbench pack 的 `stylesheet` 注入。

质感层（`craft-finish.ts`，最后加载，标本 `/__ui/catalog#craft`）：

- 舞台已经在一张圆角纸页上。不要再给自己的舞台画外框、圆角卡片或整页阴影；需要分区用间距和发丝线。
- 纯色、扁平：任何背景、卡片、按钮、徽标都不用渐变。页面内的层次只用发丝线：`--lift-1`（1px `--line` 线环，静止卡片）/ `--lift-2`（1px `--line-strong`，悬停）；只有真正浮起的菜单、对话框、拖动中的元素用 `--lift-3` 阴影。圆角用 `--r-row` 8、`--r-card` 12、`--r-dialog` 16。
- 颜色只表达状态和选中。图标、来源标签、时间线圆点保持中性；选中用 `--nav-active`，不要用插件色铺底。
- 时长用 `--dur-press` / `--dur-hover` / `--dur-move` / `--dur-arrive`，曲线 `--ease-quint`（到达）、`--ease-spring`（回弹）、`--ease-swift`（色调）。`mw-btn` 的按下回弹、对话框和菜单的入场已由 Host 提供，不要重写。
- 插件自己的「完成」和「新到达」可以调用 `molisCraft.celebrate(元素)` / `molisCraft.land(元素)`（只做呈现，减少动效时自动静止）。只在真实完成或真实到达时调用，首次渲染不要调用。
- 位置由标签条最前的插件芯片说明，舞台不需要再放一行「插件名」大标题。

意图总表：仓库 `DESIGN.md`。硬规则：`packages/design-system/README.md`。

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
