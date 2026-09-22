# 插件 UI

产品气质：中性、紧凑、连续工作面。不要默认 Dashboard、表格、卡片墙、后台式布局。先找这个插件里「人盯着的那一块」，效率场景再保证信息密度。

## 槽：人从哪进来

合同 `ui.views[].slot`：

| 槽 | 放哪 | 例子 |
| --- | --- | --- |
| `navigator` | 侧栏一级入口 | Feed、Inbox、Pages、Goals、Sessions |
| `stage` | 工作区里的工具面，不占侧栏 | Diff、Text stats |
| `settings` | 全局设置目录 | Functions Key、Shelf、Coding 偏好 |
| `island` | 项目卡片上方 | 灵光 |

Workbench HTML Slot（贡献挂载，不是 views.slot）：`workbench.directory`、`workbench.main`、`workbench.overlay`、`workbench.settings`。不能往未声明 Slot 塞 HTML。不要把内部组件实例或 Store handle 传过边界。详情里嵌别人的内容，对方必须显式开放 Slot。

`settings-page` 只能挂 `workbench.settings`。来源账号、Inbox 列表仍是插件内容，不进全局设置。

不是所有一等入口都是「列表点开详情」：Goals 是树和画布；Functions 是三栏写判断；Sessions 是会话/终端；Shelf 是置物架。抄最近的同类，不要强套 plugin-stage。

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

Pages 族：交互在插件包的 `CLIENT_FACTORY_SCRIPT`（常是 `src/client.ts` 导出的工厂字符串），由 Workbench `plugin-workbench.ts` 的 `clientFactory` / `settingsClient` 注入。

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

意图总表：仓库 `DESIGN.md`。硬规则：`packages/design-system/README.md`。

## 文案与 i18n

- UI 字符串用中文当 key：`p.text("加入 Inbox")`。英文写插件 `src/en.ts`，**还要**在 `apps/workbench/src/i18n/en.ts` 里 `import { X_EN }` 并展开进总表。只写插件文件，英文界面仍是中文 key。
- 按钮说人做的事，不说机制（不要「提交 Attention Command」）。
- 空态说明下一步能做什么，不要空讲架构。

## 验收

改了可见 UI：用浏览器把「打开插件 → 点一行 → 主按钮 → 返回」走完。只截一张静态图不算验过。相关列表/详情共享状态的，两边都看一眼。空态、错误、窄屏返回一起做。
