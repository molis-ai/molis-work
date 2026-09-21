# UI Platform

## 1. 分工

- `apps/workbench`：产品 Shell、导航、页面装配和 Host Client。
- `packages/ui-host`：UI Contribution、Slot、Embed、隔离、权限桥接和生命周期。
- `packages/design-system`：token、基础组件、图标、可访问性、主题和视觉基线。
- Native/Integration Plugin UI：实际产品页面、Inspector、设置和嵌入内容。

Workbench 不直接访问 SQLite、Module implementation、Node-only API 或 Tauri command；用户操作转换为强类型 Capability 调用。

## 2. 控件原语

产品控件、色板、图标、字体的用法和文件表在 [`packages/design-system/README.md`](../../packages/design-system/README.md)。视觉意图在 [`DESIGN.md`](../../DESIGN.md)。开发预览标本是 `/__ui/catalog`。改共享控件、状态或微动效**要**对照这块板；达标标本**要**补进 Catalog。不准把系统下拉、系统色盘、系统确认框当产品控件。动效、图标色是切片内工作。过程说明见 [CLI 与开发](../cli-and-development.md#前端与控件板) 与 [ui-craft-floor](../../specs/ui-craft-floor/spec.md)。

合同是 HTML Slot：从 `@molis-ai/molis-work-design-system` 导入 `render*` / `icon`，产出 `mw-*` + `data-slot`。不迁 React，不另起 class 填充。壳层选中走 `--nav-*`；靛只做链接、选区和进行中，不是焦点描边。

## 3. 嵌入

被插入内容的 Plugin 必须显式开放 Slot，声明接受的 Contribution Contract。贡献方声明自己提供的 view/command 与权限；UI Host 决定是否装载、放在哪里、何时销毁，并隔离错误和权限。

不允许：

- 直接传内部组件实例或 Store handle；
- 通过 Artifact 假装页面 RPC；
- Plugin 修改宿主导航/页面而没有 Slot Contract；
- 页面组合字段反写成新的中央事实。

## 4. 迁移

DD2 的原生/历史提案与最近结果现在是 Goals Native Plugin 的三个正式 Contribution，Workbench 经 UiHost 挂载。`apps/workbench/src/decision-center.ts` 只组合各 owner 已生成的内容；`decision-groups.ts` / `decision-results.ts` 归 Goals Plugin。客户端确认/退回/风险修订归 `proposal-client.ts`，Workbench 保留跨 Feed/Goal 的刷新、receipt 和共享状态。提案 CSS 在原层叠位置与 media query 内插入，英文文案由共享 catalog 组合。调用清单与 209 项验收见 `specs/molis-work-architecture-reorganization/dd2-caller-audit.md` 和 `dd2-validation.md`；不是整个 root renderer 已退休。

旧 `src/web/render.ts` 已删除，职责归 Workbench Shell、Design System、UI Host 和 Native Plugin UI；各产品内容由各 Native Plugin 提供。GW5 的 Goals 页面、交互、route descriptor 和就近文案已完成工程验收；Workbench 仅装配，GW4 的写入口边界保持不变。Cutover 已将跨 Execution/Decision 的具名 UI 组合归 Workbench，Native Goals 持有对应 Contribution，旧 renderer caller 清零。

### AP3 当前实现

- `apps/workbench` 已拥有稳定 HTML 文档 Shell 和 `workbench.directory`、`workbench.main`、`workbench.overlay`、`workbench.settings` 四个命名 Slot。`settings-page` contribution 只能挂到 `workbench.settings`，由全局设置目录列出；插件工作台仍走 directory/main/overlay。
- `packages/ui-host` 在 mount 时校验 contribution、surface、目标 Slot 与 format；Plugin 不能向未声明或不兼容的 Slot 插入内容。
- Feed Native Plugin 已按 surface 显式声明可装载位置，Workbench 通过 UI Host mount，不直接调用 Plugin renderer。
- `packages/design-system` 已接管主题、密度、browser bootstrap 和分层视觉样式；`src/web/visual-foundation.ts` 只保留 15 行 public compatibility re-export。
- Workbench 浏览器 CSS/JS 按样式层和客户端职责拆分，旧静态内容保持逐字节兼容；全局 i18n runtime 已缩成语言选择/fallback 边界，现有 EN 产品文案暂存于 Workbench compatibility catalog，后续随各 Native Plugin UI Goal 就近迁出。
- AP3 只迁 Shell/UI 平台职责，不替 AR3、EX4、WK3、AP4 或已接受的 GW5 搬产品页面。Cutover 已完成其余 owner 迁移，旧 `src/web/render.ts` 已 retired。

GW5 已提供全部 Goals contribution、专属客户端、集合/导航投影与 route descriptor，包括项目工作规则页面。Workbench 接管 full/refresh page、read/page/fragment 与 Planning 请求装配，共享刷新和跨 owner 状态仍在 Host。Module 保有事实和权限规则，Artifact/Companion/Decision HTML 由各自 owner 显式输入。175 项串行回归及边界/caller 对账见 `specs/molis-work-architecture-reorganization/gw5-validation.md`；不替代最终全产品 E2E。

### FD4 参考实现

- `packages/ui-host` 已有真实 Contribution registry 和 surface render，不再只是目录占位。
- `apps/workbench` 是 composition root，注册 `io.molis.work.native.feed.ui.v1`；它不读取 Feed Store。
- `plugins/native/feed` 声明 Feed 页面、Source 页面、overlays 和 detail Slot。Goal 决定仍由 Goals owner 生成，再通过 `detail_slot_html` 挂入 Feed 声明的详情位置。
- 当前 `src/web/feed-native-plugin-ui.ts` 只负责把旧 `MolisWorkWebView` 映射成公开 Feed UI model，并提供图标、i18n、安全链接和富文本等 Host primitives；后续 Local Host Query 接通后删除这层旧 View 适配。

Planning contribution 通过显式 renderPage 原语使用原设置页外框，不复制全局导航。根 HTTP host 经 Workbench 调用 Plugin 的页面 matcher，仍自己负责 GET/控制权限、项目解析、读取与响应。Plugin 不导入根 Web view 或 Store；方法组合由公开 Goals Module 产出。
