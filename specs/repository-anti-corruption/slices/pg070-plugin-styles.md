# PG-070：插件自己的样式按需加载

状态：执行中（2026-10-25）。页面在框架里运行的插件，把名字空间下的规则作为 `/assets/molis-work-plugins/<id>.css` 单独发，只有要用的框架链接；工作台样式表因此少了 247,609 字节，15 个新样式表合计 247,526 字节，总量不增。与 PG-071 同一个 PR，叠在 #1288（PG-056）之上；浏览器用例在 PR 的全量里跑。

验收编号：RAC-756～762。

## 范围

- **拆分**（`apps/workbench/src/plugin-styles.ts`）：一条规则的每个选择器都点名了插件自己的类或 `data-` 属性（`.<id>`、`.<id>-…`、`[data-<id>…]`），且名字不在 `:not()`、`:is()`、`:where()` 里，规则才移出，所以它只能匹配到插件自己的元素；别的规则、`@keyframes`、`@font-face`、`@import` 原样留在共用样式表，`@media`/`@supports`/`@container` 里的规则在组内各自分开。拆分只看名字，不改任何一条规则适用的对象。
- **谁拆**：页面在框架里运行的插件（有客户端、没有设置页客户端）。没有客户端的插件（Feed 等，外壳自己画）和有设置页的插件（Shelf，设置页在外壳里画）整张样式留在共用样式表。
- **合同**：`PluginWorkbenchRegistration.stylesheetShared`（命名空间里宿主或共用库在框架之外也画的类，规则留在共用样式表）和 `stylesheetUses`（框架也画了别的插件的类，要链接它们的样式表；`clientUses` 里的已经算）。
- **接线**：`pluginSurfaceClients()` 的 `styles` 给出一个框架要链接的样式表（自己的在前，再是用到的）；`renderPluginFrameSurface` 把这些 `<link>` 放在交给框架的页面最前面，所以它们在框架里排在工作台样式表（框架 head 里链接）之后、页面自己的规则之前；框架的策略本来就允许 `/assets/` 下的样式表。宿主在 `/assets/molis-work-plugins/<id>.css` 发它们，没有自带规则的插件那个地址不发。组件板的「插件行视图」页画了有样例的插件的行，同样链接这些样式表。框架脚本和工作台脚本一个字节没加。
- **门禁**：页面资源门禁认 `.css` 的插件包路径，15 个新样式表按用户批准（2026-10-25）一次登记；`workbench.css` 的预算同时降下来。

## 级联顺序（本片定的）

共用样式表先到，插件自己的样式表后到：同样的优先级下，插件自己的规则排在宿主的规则之后。离线核对过（工具不入库）：移出的规则与排在它们后面的共用规则之间，没有「优先级相同、设置同一属性、选择器又能匹配同一元素」的情形，所以搬位置不改变任何一个元素的最终样式。

## 保留的限制

- 靠源码扫描找「框架之外也画的类」：运行时拼出来的类名找不到。`tests/plugin-styles.test.ts` 的精确对照挡的是漏列和多列，挡不住拼出来的类名；这类情形靠框架页面的浏览器用例兜底。
- 插件创作台与 Alchemist 不迁（绕过）：创作台的类前缀是 `pb-`/`as-`，不在它的 id 名字空间里，样式整张留在共用样式表；Alchemist 只有 151 字节的规则移出。两者没有改任何逻辑。
- Diff 的规则都点名了 SDK 的 diff 视图和评审面也画的类，所以全部留在共用样式表，它没有自己的样式表。

## 对插件和调用方的影响

- 新增注册字段 `stylesheetShared`、`stylesheetUses`（合同 `plugin-registration`，API 快照已刷新）。没有改 Manifest、动作、路由和库结构。
- 新资源：`/assets/molis-work-plugins/<id>.css`（cognia、pages、form、dataset、ppt、lingguang、todo、workflows、coding、files、git、jelly、images、schedule、alchemist）。
- 测试里读工作台样式表的用例，要看插件规则的改读 `tests/workbench-renderer-fixture.ts` 的 `renderMolisWorkWorkbenchWithPluginStylesheets`；Pages 的八个浏览器用例在页面里多链接 `pages.css`。

## 验收

| 编号 | 标准 | 证明 |
| --- | --- | --- |
| RAC-756 | 只有每个选择器都点名插件自己的类或属性的规则才移出；`:not()`、`:is()`、`:where()` 里的名字、列为共用的类、别的类、`@keyframes`、`@font-face`、`@import` 都留下；组内规则各自分开 | `tests/plugin-styles.test.ts` |
| RAC-757 | 内置各插件的样式拆完不丢规则，移出的与留下的都再拆不动；没有框架的插件整张留在共用样式表；移出的合计有实质分量 | 同上 |
| RAC-758 | `stylesheetShared` 恰好是宿主、共用库和外壳自己画的插件用到的命名空间类；别的框架插件用到的类，要在 `stylesheetUses`（或 `clientUses`）里写上 | 同上 |
| RAC-759 | 框架页面最前面是它自己的样式表与用到的样式表，没有规则的插件不加链接；标准视图按 bundle 取样式表；链接在不透明数据里，不在外壳标记里 | 同上 |
| RAC-760 | 宿主在插件样式表的地址发它，没有样式表的插件那个地址不发，客户端包的地址照旧 | 同上 |
| RAC-761 | 框架 head 链接工作台样式表、页面里插件样式表在后；框架策略只允许 `/assets/` 下的样式表 | 同上 |
| RAC-762 | 组件板的插件行视图链接样例插件的样式表，在工作台样式表之后；回复部分不链接 | 同上 |
