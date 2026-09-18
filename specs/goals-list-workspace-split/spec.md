# Goals 列表主从：单击工作区，双击 Frame

状态：执行中（浏览器已验证单击工作区、双击 Frame）。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件改写 `specs/goals-parallel-views/spec.md` 里「三种视图单击都打开 Frame、列表铺满舞台」的合同。行内四列仍见 `specs/goals-stage-list-row/spec.md`，只在列表已展开工作区时收成窄栏。

## 背景目标

Goal 列表要留着，但不能再点一行就进 Frame。单击进画布节点上那套工作区：Runtime 在左，Goal 信息和时间线在右。双击才开 Frame。

## 当前行为与问题证据

- 舞台列表铺满内容区；单击 `[data-select-goal]` 走 `openDirectorySurface("goal")`，开 Frame 标签。
- 画布节点 / 看板卡片单击同样 `openFrame`；节点上的 maximize（`data-graph-open`）才 `selectGoal` 进 `.goal-node-workspace`。
- `data-expanded="true"` 会把列表和舞台 chrome 藏掉，工作区盖住整块舞台。

## 范围与非目标

做：

- 列表视图未选 Goal：列表仍铺满舞台，四列不变。
- 列表视图单击一行：`selectGoal` + `setWorkspaceMode("focus")`。宽屏（≥761px）列表收成左栏，宽度与目录列相同（`--tree-width`，未拖过默认 240px），右侧是 `.goal-node-workspace`；列表和切换条不藏。窄屏仍是工作区铺满。
- 列表 / 画布节点 / 看板卡片双击（`click.detail > 1`）开该 Goal 的 Frame。画布空白处仍平移缩放。节点上的 Frame 按钮仍直接开 Frame；maximize 仍开工作区。
- 全局搜索、时间线关系行等不在舞台列表里的 `[data-select-goal]` 仍开 Frame。
- `/goals/:id` 深链停在母页列表+工作区，不自动开 Frame；双击或节点 Frame 按钮才开 Frame。

不做：不改用户库、画布算法、看板六列、Frame 内部、目录栏；不把列表改成卡片。

## 使用场景

1. 打开 Goals，内容区仍是宽列表。点一行，左边留下窄列表，右边出现 Runtime + 时间线。
2. 再点另一行，工作区换成那条 Goal；母页标签仍是「画布」。
3. 双击一行（或画布节点、看板卡片）打开 Frame；关掉回到刚才的列表/画布/看板。
4. 切到画布或看板，单击进同一套工作区；空白画布仍可拖。

## 方案与关键决策

- 列表单击不再走 `openDirectorySurface`。
- 画布 / 看板单击要等约 220ms 再展开工作区，避免双击的第二下落在已经盖住的工作区上。列表也不立即 `selectGoal`：改 URL / 重绘会拆掉同一行节点，真实双击的第二次 click 到不了 `detail > 1`。列表同样 220ms，并额外听 `dblclick` 开 Frame。
- 宽屏列表展开时：shell 两列 grid；进度/前置/编号在窄栏里藏掉，只留标题簇和状态。
- `/goals/:id` 深链 `openPlugin("goals")` 后 `setWorkspaceMode("focus")`，不再 `openItem` 开 Frame。切回母页只恢复 list/canvas/kanban，不再强制收起工作区。

## 输入输出与依赖

- 输入：现有树、画布、看板、`selectGoal`、`openFrame`。
- 输出：列表主从；三视图单击工作区、双击 Frame。
- 依赖：`lastBoardView`、tab-workspace Frame 合同。

## 文件 / 模块边界

- `apps/workbench/src/styles/goal-canvas.ts`：列表展开后的主从布局。
- `apps/workbench/src/scripts/client/initialization.ts`：深链进母页工作区。
- `apps/workbench/src/scripts/client/tab-workspace.ts`、`frame-container.ts`：母页恢复舞台时不强制 graph。
- `apps/workbench/src/scripts/client/events-secondary.ts`：舞台列表单击/双击。
- `plugins/native/goals/src/momentum-client.ts`、`momentum-viewport-client.ts`：节点/卡片手势。
- 测试：`tests/goal-kanban.e2e.test.ts`、`tests/workbench-tab-workspace.e2e.test.ts` 及仍假定单击开 Frame 的用例。

## 验收标准

1. 宽屏列表单击后，列表仍可见且宽度等于目录列（`--tree-width`），右缘与 titlebar 项目条右缘对齐；`.goal-node-workspace` 在右侧且 `hidden === false`；母页标签仍是 current；不出现该 Goal 的 Frame 标签。
2. 同一行双击后出现 Frame 标签，`[data-goal-frame-surface]` 对应该 Goal。
3. 画布节点、看板卡片单击进工作区；双击或节点 Frame 按钮进 Frame。画布空白不打开 Goal。
4. 未展开时列表仍是四列 28px 行，跨层状态对齐合同不变。
5. 完成等级 3。不改用户真实库。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-kanban-ui.test.ts tests/goal-kanban.e2e.test.ts tests/workbench-tab-workspace.e2e.test.ts tests/immersive-directory.e2e.test.ts tests/goals-tree.e2e.test.ts tests/goals-navigation.e2e.test.ts
```

再在 4180 用宽屏点列表进工作区、双击进 Frame。

## 假设与开放问题

- 收起工作区（`data-goal-collapse`）在列表里回到铺满列表，行为保持。
- 节点 maximize 仍立即开工作区，不走 220ms 延迟。
- 刷新 `/goals/:id` 仍恢复母页工作区，不把深链当成 Frame 标签。
