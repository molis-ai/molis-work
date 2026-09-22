# Molis Work 可恢复删除 UI

## 背景与目标

Goal 的可恢复删除已经由 `MolisWorkCoordinator.setGoalTrashed` 实现，Runtime MCP 也能调用它；Web 目前只会在普通 Tree 和归档列表中隐藏回收站 Goal，用户不能从 UI 发起、查看或恢复。

本项让用户在现有 Molis Work 工作区中完成“确认移入回收站 → 在回收站找到同一 Goal → 恢复”的闭环。它不要求 Runtime 打开 Web；Web 只是和 MCP 一样的可选维护入口。

## 当前行为与问题证据

- `buildMolisWorkWebView` 过滤 `goal.trashed_at`，因此普通 Tree / Archive 不泄漏回收站 Goal。
- `MolisWorkCoordinator.setGoalTrashed` 已统一处理活跃 Claim / Run 阻止、Relation 临时停用、恢复和历史。
- Web 没有 `/trash` 路由、删除确认入口或恢复入口。

## 范围

- Goal 正文顶部提供“移入回收站”入口，并使用明确确认对话框收集原因。
- 提供 `/trash` 和 `/trash/goals/:goalId`，显示回收站 Goal、状态、删除事实与恢复操作。
- Web API 只适配并调用 `coordinator.setGoalTrashed`；返回该共享服务结果。
- 活跃 Claim / Run 阻止删除时，UI 在对话框中显示可读原因、阻塞 ID 和下一步。
- 普通 Tree、归档页、回收站页和 `/api/board` 都从同一份 canonical state 刷新。
- 覆盖 HTTP 测试：确认门槛、阻止反馈、移入、隐藏、回收站定位、恢复同一 ID。

## 非目标

- 不实现永久删除、清空回收站或删除项目数据库。
- 不在 UI 或 HTTP route 中复制 Relation / 工作状态迁移逻辑。
- 不改变 Runtime、MCP 或项目配置的安装/连接行为。
- 不把回收站 Goal 重新混入普通 Tree 或 Archive。

## 方案与关键决策

1. `MolisWorkWebView` 增加 `trashed_goals`；该集合由 `coordinator.listTrashedGoals` 选出，再复用现有的完整 Goal View 映射，普通 `goals` 和 `archived_goals` 保持过滤。
2. 增加 `POST /api/goals/:goalId/trash`。请求必须带 `user_confirmed: true`、`trashed: boolean` 和非空 `reason`；route 只调用 `setGoalTrashed`，成功与 `blocked` 均原样返回 service result。
3. `renderMolisWorkWeb` 增加 trash 视图模式。它沿用现有 Tree + 连续文档布局：左侧是回收站列表，右侧是只读的删除事实和恢复动作，而不是做一套新的垃圾桶页面。
4. 复用原生 `<dialog>` 模式做删除/恢复确认。文案明确说明可恢复、历史保留、关系暂时停止；被阻止时不关闭对话框。

## 模块边界与调用链

```text
Goal 页面 / 回收站页面
  -> POST /api/goals/:id/trash (确认与输入校验)
  -> MolisWorkCoordinator.setGoalTrashed (唯一状态转换)
  -> SQLite Goal / Relation / history facts
  -> buildMolisWorkWebView /trash、/、/archive、/api/board
```

## 验收标准

- `TRASH-UI-ACTIVE-WORK-FEEDBACK`：有有效 Claim 或执行中 Run 时，确认提交不改变 Goal；UI 能展示阻塞原因、相关 ID 与“先结束或释放工作后重试”。
- `TRASH-UI-COMPLETE-FLOW`：从 Goal 页面确认移入回收站后，普通 Tree 不再显示；`/trash` 能找到同一 ID；恢复后回到 `/goals/:id` 且 ID 不变。
- `TRASH-UI-SHARED-SERVICE`：Web route 不直接写 Goal、Relation、Claim 或 Run 表；唯一写入口为 `coordinator.setGoalTrashed`。
- UI 文案明确：操作可恢复、历史保留、关联关系会临时停止。
- 空回收站、API 失败、阻止反馈和恢复成功均有清楚状态。

## 验证

- `pnpm exec tsx --test tests/web.test.ts`
- `pnpm test`
- `git diff --check`
- 用本地 Web server 查看桌面与移动视图，验证确认对话框、空状态、阻止状态与恢复入口。

## 假设与开放问题

- Web 是可选入口；Runtime 工作流仍通过 Skill + MCP 维护，不会被 Web 自动拉起。
- 回收站恢复遵循共享服务当前的安全 Relation 恢复规则：只有两端都不在回收站的 Relation 才自动恢复。
