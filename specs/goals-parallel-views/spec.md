# Goals 三种并行视图：列表 / 画布 / 看板

状态：执行中。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次内容区改挂的唯一需求书。它改写：

- `specs/archive/goal-kanban-view/spec.md` 里母页只有「画布 | 看板」、点卡片展开工作框；
- `specs/archive/goals-directory-collection-folds/spec.md` 里当前/归档/回收站百叶窗挂在目录。

双击 Goal 进 Frame 仍走现有 tab-workspace / Frame 合同。单击进 `.goal-node-workspace`，见 `specs/goals-list-workspace-split/spec.md`。

## 背景目标

Goals 左目录是压缩 Goal 列表，内容区母页只有画布和看板。列表、画布、看板应是同一内容区的三种并行视图。目录不再出 Goal Item。

完成等级 **3：功能可用**：内容区列表可点进工作区，三视图能切。单击/双击合同见 `specs/goals-list-workspace-split/spec.md`。

## 当前行为与问题证据

- 左目录渲染压缩行、当前/归档/回收站百叶窗、新建、筛选。目录点 Goal 已走 `openDirectorySurface("goal")`，会开 Goal Frame。
- 内容区母页只有 **画布 | 看板**（`goal-board-switch`），`frame-container.ts` 记住 `lastBoardView`，默认画布。
- 画布单击节点只选中谱系；Frame 要另点节点上的 Frame 按钮。看板单击卡片只 `selectGoal`，展开旧工作框。
- 目录里还有一套已隐藏的 `navigator-view-switch`（目标工作区 / 关系画布），和内容区切换是两套。

## 范围与非目标

做：

- 内容区三种并行视图：列表、画布、看板，都铺满标签下面的舞台。切换条是左上 chrome 里的三个图标，紧挨筛选，不跟 titlebar 里已打开的 Frame 标签抢位置。
- 列表：同一套目录树行拉满内容区宽度，露出编号、状态、标题、子进度、前置依赖。行内四列对齐与单行合同见 `specs/archive/goals-stage-list-row/spec.md`。不编造负责人头像。当前/归档/回收站百叶窗跟着 Item 进内容区。
- 目录只留 Goals 名称、新建 Goal、筛选。不再渲染任何 Goal Item。
  已改由 `specs/archive/goals-stage-chrome/spec.md`：Goals 不占第二栏，筛选和新建在舞台左上。
- 列表行、画布节点、看板卡片单击打开该 Goal 的工作区（Runtime 左、信息/时间线右），并同步选中；双击才开 Frame。画布空白处仍平移缩放。节点上旧「展开工作框」maximize 先不动。
- `lastBoardView` 加上 `list`。第一次进 Goals 默认列表。打开 Frame 后关掉，回到刚才那个视图。刷新记住上次视图。
- 删掉目录里隐藏的 `navigator-view-switch`。

不做：不改 Goal 事件、用户库、画布算法、看板六列合同；不引入 Coss React；不把列表做成 Dashboard 卡片。

## 使用场景

1. 打开 Goals，内容区是 Linear 宽行列表，目录里没有 Goal 行。点一行打开工作区；双击打开 Frame。
2. 切到画布，点节点打开同一条 Goal 的工作区；空白处仍可平移缩放。
3. 切到看板，点卡片打开工作区。
4. 刷新后仍停在上次的列表/画布/看板。

## 方案与关键决策

- 目录树从 `renderGoalDirectory` 抽到 `renderGoalStageList`，挂在 `.goal-canvas-shell` 的 `[data-goal-stage-list][data-tree-scroll]`。刷新片段继续带 `[data-tree-scroll]`，避免刷新把树塞回目录。
- `frame-container.ts` 的 board tab 从 `canvas|kanban` 扩成 `list|canvas|kanban`；shell `data-board-view` 驱动显示哪一块。body 上的 `data-board-view` 仍是 current/archive/trash/decisions，不混用。
- 看板卡片和画布节点单击走 `selectGoal` 工作区；双击走已有 `openFrame` / `openGoalTab`。
- 列表宽行样式只挂在内容区。目录密度规则继续藏 meta。

## 输入输出与依赖

- 输入：现有 Goal 树、画布、看板模型和 Frame/tab-workspace。
- 输出：内容区三视图；目录 chrome；单击进工作区，双击进 Frame。
- 依赖：`lastBoardView` 本地存储、tree refresh 的 `[data-tree-scroll]`。

## 文件 / 模块边界

- `plugins/native/goals/src/tree-ui.ts`：目录只出 chrome；新增 stage-list；刷新树与目录拆开。
- `apps/workbench/src/goals-page-renderer.ts`：shell 放入列表和三颗开关，默认 list。
- `apps/workbench/src/scripts/client/frame-container.ts`：记忆 `list|canvas|kanban`。
- `plugins/native/goals/src/momentum-client.ts`：节点/卡片单击开 Frame。
- `apps/workbench/src/styles/goal-canvas.ts`：列表铺满舞台、宽行露出字段。

## 验收标准

1. Goals 内容区能切 列表 / 画布 / 看板，三者都铺满舞台；目录没有 Goal Item。
2. 列表行是现有树行拉宽，能看到编号和更多字段；展开、筛选、新建仍可用。
3. 三种视图单击 Goal 打开工作区，双击打开对应 Goal Frame；关 Frame 回到刚才的视图。
4. 刷新记住上次视图。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-tree-ui.test.ts tests/goal-kanban.e2e.test.ts tests/immersive-directory.e2e.test.ts tests/workbench-frame-container.e2e.test.ts
```

再在 4180 点三种视图：单击进工作区，双击进 Frame。

## 假设与开放问题

- `/archive`、`/trash` 文档路由仍存在；百叶窗在母页列表里，不把归档页重做成第三套目录。
- 节点 maximize 仍开旧工作框，本切片不删。
