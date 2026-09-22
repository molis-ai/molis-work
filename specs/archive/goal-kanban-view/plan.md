# Goal 看板 Implementation Plan

> 按 `specs/archive/goal-kanban-view/spec.md` 实现。用户已批准，本会话 inline 执行。不提交。

**Goal:** Goals 顶栏钉住「Goal 画布 | 看板」，看板只读六列，点卡片走现有 Goal 工作框。

**Architecture:** Goals 插件渲染看板 HTML（与 momentum 同一批当前树 Goal）。Workbench Frame Container 把 `activeTab` 扩成 `canvas | kanban | goalId`，按项目记住 `lastBoardView`。看板挂在 `goal-canvas-shell` 里与画布互斥，工作框仍盖在上面。

**Spec:** `specs/archive/goal-kanban-view/spec.md`

## Global Constraints

- 完成等级 3；不写用户库、不提交、不发布。
- 只读：不拖、不写状态、不新开 Frame。
- 无说明腔。英文 Tab 用 `Board`。
- 覆盖 Frame spec「点目录一律回画布」：停在当前板。

### Task 1: 看板 HTML

- Create: `plugins/native/goals/src/kanban-ui.ts`
- Modify: `momentum-ui.ts`、`goals-momentum-ui.ts`、`workspace-en.ts`
- Test: `tests/goals-kanban-ui.test.ts`

六列固定顺序、空列保留、字段与画布节点一致、归档不进 `items`、无教程空态、无 Frame 按钮。

### Task 2: 挂到主区并刷新

看板与 momentum 同一次 `/api/board/momentum` 响应；shell 内并列；刷新时一并替换。

### Task 3: Container

`KANBAN_TAB`、双钉住 Tab、`lastBoardView` 持久化、`closeFrame` / `locateGoal` / `isFrameTabActive`。

### Task 4: 点卡片 = 展开

`data-kanban-card` → `selectGoal`；选中态与目录共用；收起后仍在看板。

### Task 5: 样式 / 验

横滑六列；更新 frame-container e2e 的 Tab 计数；新增看板 e2e。
