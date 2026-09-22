# Chrome 式预览标签与手动分组

状态：部分被取代。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不发布、不安装新 App。

**标签打开：** 单击添加、不替代、不再使用预览页，以 `specs/archive/additive-tabs/spec.md` 为准。本文件仍管用户手动分组。

本文件曾是标签打开与分组行为的需求书。分组部分仍有效。打开部分已被 additive-tabs 取代。它取代：

- `specs/workbench-tab-workspace/spec.md` 里「点 item 就开标签、插件自动成组」；
- `specs/archive/chrome-tab-group-underline/spec.md` 里按插件画的彩色底线；
- `specs/archive/directory-plugin-sections/spec.md` 里「点 item 打开/激活标签」；
- `specs/compact-icon-tabs/spec.md` 里「折叠时露出当前标签、颜色来自插件」。

分栏几何、固定、市场/设置独占仍以 `specs/workbench-tab-workspace/spec.md` 和 `specs/pane-local-split-tabs/spec.md` 为准。

## 背景目标

标签条按插件自动成组，单击目录就会开一张标签。组太多，打开也太勤。要对齐 Chrome：单击只看预览，双击才留下标签；分组由用户自己拉，不按插件归类。

## 当前行为与问题证据

- `openInPane` 把新标签插到同插件最后一张后面，渲染时按 `tab.plugin` 切组并画插件色底线。
- 点插件名或列表 item 都走 `openPlugin` / `openItem`，立刻成普通标签。
- 组折叠仍露出当前标签，和 Chrome 不同。

## 范围与非目标

### 做

- 每栏最多一张预览标签：单击目录 item / 插件名复用它；双击或把它钉成普通标签。
- 标签默认平铺。用户可手动分组：命名、选色、折叠、拖进拖出。
- 分屏、固定、空栏、同一 item 多栏、刷新恢复、窄屏不分栏全部保留。

### 不做

- 不按插件或域名自动分组。
- 不改分屏几何、MCP、Goal 事件、各插件列表领域行为。
- 不新开系统窗口，分组不同步到其他设备。
- 不提交、不发布、不改用户真实库。

## 使用场景

1. 进项目：只有首页普通标签。
2. 单击 Goals：一条斜体「画布」预览。再单击某个 Goal：还是那一张预览，内容换成该 Goal。
3. 双击该 Goal：预览变成普通标签。再单击另一个 Goal：新预览出现，刚才那张还在。
4. 本栏已打开的 Goal 再单击只激活。
5. Goals 和 Sessions 默认不相邻成组。用户可以右键放进一个命名组；折叠后组内标签都藏起。
6. 向右分屏、关回一栏、刷新后预览/普通标签/用户组/分栏都在。
7. 390 / 触屏：单击即钉住。

## 方案与关键决策

- 标签带 `preview?: boolean`。每栏一张预览；同身份若已有普通标签则只激活。
- 双击预览标签或同一目标：去掉 `preview`，保留 tab id。
- 首页、`+` 菜单、搜索、深链、键盘触发（click.detail === 0）、触屏/≤760px：直接普通标签。
- `pane.groups` 是用户组；`tab.groupId` 可选。固定标签不能进组。
- 新标签插在当前标签后，但不插进已有组中间。
- 旧 localStorage 的插件折叠表丢掉，不还原成用户组。

## 文件 / 模块边界

允许改：`tab-workspace-ops.ts`、`tab-workspace.ts` 客户端、目录点击（`navigation-feed` / `events-secondary`）、标签样式与 i18n、本 spec 指向的测试和 `DESIGN.md` 相关句。

不改：Goal / Session / Feed 领域写入、MCP、项目选择页。

## 验收

1. 进项目只有首页普通标签，没有 Goals 组。
2. 单击 Goals 出现斜体画布预览；再单击 Goal 仍是一张预览。
3. 双击 Goal 钉住；再单击另一 Goal 出现新预览。
4. 已打开的 Goal 再单击不复制。
5. 默认无插件色底线；用户组折叠后组内标签都藏起。
6. 分屏、空栏、刷新恢复仍可用。
7. 390 单击即打开普通标签。

## 验证

```bash
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/tab-workspace-ops.test.ts \
  tests/workbench-tab-workspace.e2e.test.ts \
  tests/compact-icon-tabs.e2e.test.ts \
  tests/workbench-pane-feed.e2e.test.ts \
  tests/workbench-frame-container.e2e.test.ts \
  tests/attention-journey.e2e.test.ts
```

## 假设

- 画布节点上的「打开 Frame」是明确打开，走普通标签。
- 页内跳转（iframe `workbench-pane-open`）走普通标签。
- 预览被替换时不自动钉住未提交表单。

## 验收结果

- 通过：工作台 `tsc` 构建。
- 通过：`tests/tab-workspace-ops.test.ts` 20/20（预览复用同 id、已打开只激活、无插件自动组、用户组连续/折叠/固定脱组、旧插件折叠表丢弃、分栏不带组）。
- 通过：Chrome e2e 8 项 — 单击预览斜体画布、同一预览换成 Goal、双击钉住、390 抽屉单击即普通标签、手动分组折叠藏起组内标签、分屏/关栏、图标标签、Feed 分栏、Frame 引用、attention Frame picker。
