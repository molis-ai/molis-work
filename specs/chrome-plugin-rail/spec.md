# 工作台：插件栏 + 插件目录 + 通栏 titlebar

状态：已实现。行位置已被 `specs/project-chrome-titlebar-row/spec.md` 改写（项目条与 titlebar 同一行）。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

本文件是这次壳层栏位重组的唯一需求书。它覆盖：

- `specs/directory-plugin-sections/spec.md` 里「所有插件列表叠在同一列、可同时展开」；
- `specs/directory-title-toolbar/spec.md` 里项目切换/搜索/设置住在目录头顶；
- `specs/linear-workbench-density/spec.md` 里目录列通顶、titlebar 只盖内容列（`tree-pane` `grid-row: 1 / 3`）。

右边标签、分栏、单击添加、各插件主表面与领域事实仍以 `specs/workbench-tab-workspace/spec.md`、`specs/additive-tabs/spec.md`、`specs/pane-local-split-tabs/spec.md` 为准。快捷方式仍在项目首页，见 `specs/home-shortcuts-return/spec.md`。

## 背景与目标

左边现在是一整列：项目切换、搜索、设置压在头顶，Goals / Sessions / Feed 等列表再分段塞进同一滚动口。桌面 Overlay 红绿灯落在这列头顶（`trafficLightPosition.y = 24`），网页没有红绿灯却共用同一套左上布局。要对齐参考图（通栏 titlebar；项目条横跨插件栏+目录；插件栏与目录从项目条下面同高）：

1. 最左：只放插件入口的图标栏；
2. 第二栏：只显示**当前插件**的内部目录；
3. 最上通栏只放标签和上一步/下一步，把窗口红绿灯和标签浏览留给 titlebar；
4. 项目切换、搜索、项目设置、收起目录放在 titlebar **下面**，横跨插件栏与目录的合计宽度。首页/市场或收起目录时这条通到内容区。详见 `specs/project-chrome-span-rail/spec.md`。

## 当前行为

- `.immersive-workspace` 两列：目录通顶（`grid-row: 1 / 3`），titlebar 只在第 2 列。
- 目录头 `navigator-project` 放收起、项目名、搜索、项目设置；桌面用 `--desktop-window-safe-inline-start` 给红绿灯让位。
- 插件分段可同时展开，账号在目录底。
- 单栏时工作区标签已在 `.immersive-titlebar`；分栏后每栏自己一条。

## 范围与非目标

### 做

- 工作区改成「通栏 titlebar + 其下三栏」：插件栏 | 插件目录 | 内容。
- 插件栏：首页、已启用插件、插件市场。当前插件高亮。市场钉在入口卡（`.plugin-rail-items`）底，见 `specs/plugin-rail-market-anchor/spec.md`。底栏是设置齿轮 + 账号头像；全局设置进目录，见 `specs/settings-directory-panel/spec.md`。
- 第二栏只挂当前插件已有 directory panel。点插件栏切换当前插件并换这一栏。
- 首页、插件市场没有内部目录：第二栏收起，内容区吃掉那列宽度。
- 用户仍可手动收起第二栏；插件栏留下。收起状态按项目记住。
- 收起/展开目录跟项目设置走，在 titlebar 下面那条工具条里；目录头不再放这颗按钮。首页/市场（无第二栏）桌面隐藏收起。≤600px 仍用同一位置开关抽屉。
- **titlebar 通栏只放：** 上一步、下一步、工作区标签（加号、布局与分屏仍在标签条上）。项目切换、项目设置、全局搜索不进 titlebar，避免和桌面 Overlay 红绿灯抢位。
- **桌面：** Overlay 红绿灯只占 titlebar 左侧；插件栏不与红绿灯重叠。红绿灯垂直居中于 32px titlebar。标签从上一步/下一步之后、红绿灯让位之后开始。
- **网页：** 没有红绿灯留白。上一步/下一步贴 titlebar 左，标签在它们右边。
- 上一步/下一步按当前焦点栏的标签激活栈前进后退；没有上一页或下一页时按钮禁用。
- 插件目录：**标题单独一行，该插件操作在标题下方**，不再和标题挤同一行。Goals 目录的新建横条、筛选位置和归档/回收站百叶窗见 `specs/goals-directory-collection-folds/spec.md`。没有操作的插件不留空工具行。Feed 左边仍是来源任务，条目在右边。
- 点插件栏图标：切到该插件默认工作面，不新开标签。同时把第二栏切到该插件。
- 点目录 item：现有添加合同不变。
- ≤600px：插件栏 + 第二栏仍作为同一抽屉；选一条 item 后关抽屉。Titlebar 保留标签和上一步/下一步；搜索仍在下面那条。桌面抽屉打开时仍不得挡住红绿灯点击。
- 分栏后仍是每栏自己一条标签，不把所有栏的标签都塞进窗口 titlebar。
- 「布局与分屏」和加号成组靠 titlebar / 当前标签条右缘，不跟在最后一个标签后面。桌面实现见 `specs/tab-split-right-align/spec.md`。

### 不做

- 不改 MCP、Goal 事件、Runtime、各插件列表领域行为。
- 不把快捷方式搬回目录。
- 不恢复「所有插件列表同时展开」。
- 不把 Frame、市场、设置做成插件栏可卸载项。
- 不新开系统窗口、不改分栏几何。
- 不伪造参考图里的对话/绘图功能。

## 使用场景

1. 打开项目：titlebar 有上一步/下一步和首页标签；插件栏高亮首页；第二栏收着；项目名/搜索/设置在 titlebar 下一行通栏；内容是诗意首页。
2. 点插件栏 Goals：第二栏出现 Goal 树；标题「Goals」在上，筛选/新建等在标题下一行；项目名/搜索/设置横跨插件栏+目录、titlebar 下面；右边是 Goals 默认面（画布），不另开标签。
3. 再点 Sessions：第二栏换成 Session 列表，Goals 树不再占着。
4. 桌面：左上红绿灯可点、可拖窗口（titlebar 空白和 drag region）；插件栏第一颗图标在红绿灯下方，不被挡住。项目切换在 titlebar 同一行、红绿灯让位之后，见 `specs/project-chrome-titlebar-row/spec.md`。
5. 网页：左上没有红绿灯空位，上一步/下一步贴 titlebar 左，标签在右边。
6. 收起第二栏：点设置旁边的收起；插件栏还在，内容变宽；同一位置变成展开。项目名/搜索/设置仍在 titlebar 下面。
7. 窄屏拉开抽屉：插件栏 + 当前目录从工具条下面滑出；点 Goal 后抽屉关，titlebar 标签还在。
8. 目录头只剩插件名，操作在它下面一行，不再有收起按钮。
9. 从首页点进 Goals 后，上一步回到首页标签；下一步再回到 Goals。

## 方案与关键决策

1. **Titlebar 通栏只服务窗口和标签。** 桌面红绿灯只和 titlebar 抢位；项目级按钮全部在下一行，不再分网页左/桌面右两套 titlebar 簇。
2. **当前插件独占第二栏。** 取代分段叠列表。高亮跟焦点栏当前插件走；用户点插件栏可先换目录再决定是否钉标签。
3. **无目录的入口不留空列。** 首页/市场不出现空白第二栏；项目工具条通栏，插件栏从它下面开始，不跟着 `display:none` 的目录一起消失。
4. **上一步/下一步是标签激活栈。** 不是浏览器 URL，也不是插件栏顺序。
5. **账号在插件栏底，设置齿轮在它上方。** 全局设置进第二栏目录，不跳页；合同见 `specs/settings-directory-panel/spec.md`。账号管理未接入。
6. **插件栏宽度约 48px**，目录仍 240px（≤1050px 为 220px）。触控/窄屏热区 44px。
7. **目录内部滚动仍一个口、不画滚动条。** 只滚当前插件列表。

## 输入输出与依赖

- 输入：已启用插件、各插件现有 directory HTML、按项目 UI 状态、焦点栏当前插件、`data-desktop-shell` / `data-native-desktop`。
- 输出：新栅格、插件栏、单插件目录、项目工具条下移、titlebar 上一步/下一步、桌面红绿灯位置。
- 依赖：现有 directory panel、tab-workspace、预览/钉住、全局搜索 dialog、项目切换菜单。
- 不改用户库、不新协议。

## 文件边界

- `apps/workbench/src/immersive-shell.ts`、`settings-navigation.ts`、`goals-page-renderer.ts`（或实际组壳的 renderer）
- `apps/workbench/src/styles/immersive-navigation.ts`、`immersive-directory.ts`、`linear-density.ts`
- `apps/workbench/src/scripts/client/immersive-navigation.ts`、`tab-workspace.ts`（目录当前插件与栏位显隐）
- `packages/design-system/src/styles/desktop-titlebar.ts` 及导航所有权里依赖「目录通顶」的规则
- `apps/desktop/src-tauri/tauri.conf.json` 的 `trafficLightPosition`
- 测试：`tests/desktop-tui.test.ts`、`tests/immersive-directory.e2e.test.ts`、`tests/immersive-workbench.e2e.test.ts`、`tests/workbench-tab-workspace.e2e.test.ts`、相关导航/搜索断言
- 不改 `docs/design/` 历史原型。

## 验收

1. 桌面/网页都能看到：通栏 titlebar，其下插件栏、（有列表时）插件目录、内容。
2. 同一时刻第二栏最多一个插件的目录；切插件栏即换目录。
3. 首页/市场无第二栏空壳。
4. 桌面：红绿灯在 titlebar 左且可点；插件栏图标在其下方；titlebar 没有项目切换/搜索/设置；标签不伸进红绿灯热区。
5. 网页：无红绿灯留白；titlebar 左是上一步/下一步，然后是标签。
6. 点插件栏、点目录 item 的预览/钉住与分栏行为与现合同一致。
7. 收起第二栏后插件栏仍在；刷新同一项目记住收起和当前插件。收起/展开在项目设置旁边，不在目录头，也不在 titlebar。
8. 390 抽屉可开可关；桌面抽屉不挡住红绿灯。
9. 「布局与分屏」和加号成组贴在 titlebar 右缘；标签少时，空隙在最后一个标签和加号之间。桌面不再把尾部 drag 和标签条对半分。
10. 项目切换、搜索、设置的顶边在 titlebar 底边之下；有目录时它们横跨插件栏+目录列，不再缩在目录列里。合同见 `specs/project-chrome-span-rail/spec.md`。
11. 从首页标签切到另一个标签后，上一步能回去，下一步能再过来；到头时按钮禁用。
12. 中英文、深浅色可阅读。完成等级 3，不宣称可发布。
13. 有操作的插件：操作顶边在插件名底边之下；没有操作的插件不出现空白第二行。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/desktop-tui.test.ts \
  tests/immersive-directory.e2e.test.ts \
  tests/immersive-workbench.e2e.test.ts \
  tests/workbench-tab-workspace.e2e.test.ts \
  tests/chrome-inner-scroll.e2e.test.ts
```

桌面红绿灯位置用 `tests/desktop-tui.test.ts` 对照 `tauri.conf.json`。Chrome e2e 用隔离项目，不写用户库。项目条与上一步/下一步都在 header 里，合同见 `specs/project-chrome-titlebar-row/spec.md`。

## 假设

- 分栏后标签仍每栏一条，不把多栏标签合并进窗口 titlebar。
- 插件栏当前项默认跟焦点栏插件走；用户刚点过栏上另一插件时，第二栏跟手，直到焦点栏插件再次变化。
- 全局设置从插件栏底齿轮进入目录，不从账号跳页；不在 titlebar 再放一颗系统设置。
- 上一步/下一步只走当前焦点栏还活着的标签；关掉的标签从栈里拿掉。
- 不在插件栏做可拖拽排序或用户隐藏插件。
