# Goals 不占第二栏；筛选和新建在舞台左上

状态：已完成。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件改写 `specs/goals-parallel-views/spec.md` 里「目录只留 Goals 名称、新建 Goal、筛选」。列表行合同仍以 `specs/archive/goals-stage-list-row/spec.md` 为准。

## 背景目标

Goal Item 已经在内容区列表里。左边再留一栏空 Goals 目录，只放筛选和新建，是重复的第二栏。Goals 不需要目录栏。筛选、新建和列表/画布/看板切换都放在内容区左上；切换是三个图标，不再用文字、也不再单独贴右上。

Host 仍按「插件有没有贡献 `data-directory-panel`」决定第二栏，不新增 `needsDirectory` 布尔。设置齿轮照旧打开 Host 设置目录。

## 当前行为与问题证据

- 点插件条 Goals 会 `data-directory-open="goals"`，第二栏展开，里面是标题 + 新建 + 筛选，没有 Goal 行。
- 内容区已经是列表/画布/看板；目录栏是空壳。
- Feed 已经不带 `data-directory-open`；Goals 还在用目录栏挂 chrome。

## 范围与非目标

做：

- Goals 不再渲染 `data-directory-panel="goals"`。点 Goals 只开工作面，第二栏保持收起（`is-plugin-directory-empty`）。
- 筛选、「新建 Goal」和三视图切换挂在 `.goal-canvas-shell` 左上，叠在内容纸面上，不要单独一条灰底工具条；进 Frame / 展开工作区时整组 chrome 一起藏。切换是图标按钮，`aria-label` / `title` 仍是列表、画布、看板。
- Host：没有对应 `data-directory-panel` 的插件不打开第二栏。设置/项目设置齿轮仍打开目录。
- 刷新仍走 `[data-tree-filter]` / `[data-open-create]`。

不做：不改 Goal 关系、三视图切换、Frame、MCP、用户库。不给插件加新的目录布尔。不改 Sessions/Inbox/Feed/Artifacts 自己的目录。

## 使用场景

1. 打开 Goals：左边只有插件条，没有第二栏；内容区左上是新建、筛选，紧挨筛选是三个视图图标。
2. 点筛选、新建，行为与原来目录里的控件相同。
3. 点 Sessions：第二栏出现 Session 列表。再点 Goals：第二栏收起。
4. 点设置齿轮：第二栏打开设置。再点 Goals：设置关掉，第二栏收起。

## 方案与关键决策

- 不贡献目录 HTML；`setDesktopDirectory("goals")` 因没有 panel 落到 `root`。
- `directoryOf` / 点工作面：只在 DOM 里找得到 `data-directory-panel` 时才打开该栏。
- `renderTreeChrome` 和 `goal-board-switch` 都放进 `.goal-stage-chrome`，绝对定位 `top: 16px; left: 20px`。切换条不再 `right: 20px`。
- 三个按钮只出图标（列表 / 画布 / 看板），`data-board-view-tab` 不变。
- 窄屏点 Goals 进内容区（`mobileView=document`），不打开空目录抽屉；点 Inbox/Sessions 仍打开有内容的目录。

## 文件 / 模块边界

- `plugins/native/goals/src/tree-ui.ts`：目录 contribution 不再产出 panel。
- `apps/workbench/src/goals-page-renderer.ts`：不往目录塞 Goals；chrome 进舞台。
- `apps/workbench/src/immersive-shell.ts`：空 panel 不生成 plugin-section；Goals 轨道不带 `data-directory-open`。
- `apps/workbench/src/scripts/client/tab-workspace.ts`、`events-secondary.ts`：按 panel 有无开栏。
- `apps/workbench/src/styles/goal-canvas.ts`：左上 chrome。

## 验收标准

1. 点 Goals：工作区带 `is-plugin-directory-empty`，没有 `[data-directory-panel=goals]`；`[data-open-create]`、`[data-tree-filter-trigger]` 和 `[data-board-switch]` 在舞台左上，切换条紧挨筛选右侧。列表视图顶部没有第二条灰底，控件叠在纸面上。
2. 点 Sessions 后第二栏出现；再点 Goals 第二栏收起。
3. 筛选弹出层、新建 dialog 仍可用。
4. 设置齿轮仍打开设置目录。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-tree-ui.test.ts tests/desktop-tui.test.ts tests/immersive-directory.e2e.test.ts tests/chrome-inner-scroll.e2e.test.ts tests/project-home-start.e2e.test.ts tests/goals-narrow-navigation.e2e.test.ts
```

再在 4180 点 Goals / Sessions / 设置，确认第二栏和左上控件。

## 假设与开放问题

- 归档/回收站独立页没有 canvas shell，本期不挂这组 chrome。
- 窄屏从 Goal Frame 换另一条 Goal，走内容区列表或标签，不再走空目录。
