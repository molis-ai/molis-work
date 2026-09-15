# UI 维护闭环收口

## 背景与目标

`MOLIS_WORK-UI-AUTHORING-CLOSURE` 汇总了 Policy、Draft、关系、Risk、Impact、Evidence、决定中心、历史与归档等 UI 子 Goal。其十个子 Goal 已全部满足，但父 Goal 仍未完成，因为用户只能在页面中看到 `active_goal_id`，不能从 UI 把一条已接受的 Goal 设为当前 Goal。

本 Work Item 只补齐这一缺口，并用现有 Web 回归覆盖父 Goal 的 C8 验收项。

## 当前行为与问题证据

- `buildMolisWorkWebView` 将 Board 的 `active_goal_id` 提供给页面；页面据此默认选中一个 Goal。
- `MolisWorkCoordinator.setActiveGoal` 已是唯一的业务写入入口，会拒绝 Draft、回收站和已归档 Goal，并写入事件历史。
- `src/web/server.ts` 没有设置当前 Goal 的 API；`src/web/render.ts` 也没有对应的用户操作或客户端请求。
- `tests/web.test.ts` 仅断言了当前 Goal 的显示，没有覆盖从 UI 修改它。

## 范围

- 为 Goal 页面提供“设为当前 Goal”操作，仅对可用的 accepted Goal 显示。
- 已是当前 Goal 时明确显示状态而非再次提交相同写入。
- 新 Web API 只调用 `coordinator.setActiveGoal`，不直接写 SQLite，也不复制校验规则。
- API 和客户端刷新同一份 Board 视图，令树与正文即时反映新当前 Goal。
- 添加端到端 Web 测试，覆盖成功路径以及 Draft/已归档目标被 canonical 校验拒绝的行为。
- 为父 Goal 的 C8 提交测试 Evidence；其余 C1–C7、C9–C16 由已满足的专属子 Goal 和既有回归继续覆盖。

## 非目标

- 不改变 Runtime 的 Claim、Run、Available 或任务派发语义。
- 不把“当前 Goal”误写成“正在执行中的 Goal”。
- 不重做已完成的 Policy、Draft、关系、Risk、Impact、Evidence、决定中心或历史界面。
- 不新增第二套 active-goal 状态或绕过 Coordinator 的权限、归档、回收站校验。

## 用户与调用场景

1. 用户查看一条 accepted Goal，点击“设为当前 Goal”；页面刷新后它成为 Board 当前 Goal，事件历史可追溯。
2. 用户查看已是当前 Goal 的页面，看到“当前 Goal”状态，页面不再提供重复写入。
3. Draft 或已归档 Goal 不展示该操作；即使直接调用 API，也由 Coordinator 返回明确拒绝。

## 方案与关键决策

- 复用 `MolisWorkCoordinator.setActiveGoal(boardId, { goal_id, reason }, write)` 作为唯一状态变更边界。
- Web API 路径为 `POST /api/goals/:goalId/active`，由点击行为提供固定、可读的用户操作原因；请求使用唯一幂等键。
- UI 仅在 Goal 是 accepted、未归档且未在回收站时显示动作；当前 Goal 显示非交互标签。
- 前端成功后调用既有 `refreshBoard(true)`，避免局部维护 `active_goal_id` 导致 Tree 和正文不同步。

## 输入、输出与依赖

输入：当前 Board、用户在页面选中的 Goal、一次明确点击。

输出：更新后的 Board `active_goal_id`、`board.active_goal_changed` 事件和更新后的页面视图。

依赖：现有 Coordinator `setActiveGoal`、Web Board 刷新逻辑、已完成的 UI 子 Goal。

## 文件边界

- `src/web/server.ts`：薄 HTTP 入口与错误翻译。
- `src/web/render.ts`：操作渲染及提交后的刷新。
- `tests/web.test.ts`：端到端行为测试。
- `specs/ui-authoring-closure/spec.md`：本收口 Work Item 的唯一需求源。

## 验收标准

- accepted 的非归档、非回收站 Goal 可从 UI 被设为当前 Goal。
- 页面清楚区分“设为当前 Goal”和“当前 Goal”，不暗示它就是正在执行的 Goal。
- 变更经过 Coordinator，Draft、归档和回收站校验不在 Web 层复制或绕过。
- 成功后 `/api/board`、Goal 页面选择状态和事件历史均显示同一真相。
- `tests/web.test.ts`、类型检查和完整测试套件通过，且 `git diff --check` 无格式问题。

## 验证

```text
pnpm exec tsc --noEmit
node --import tsx --test tests/web.test.ts
pnpm test
git diff --check
```

## 假设与开放问题

- 点击“设为当前 Goal”就是用户对这一可逆 Board 视图偏好的明确操作，不需要另开确认对话。
- “当前 Goal”仅是 Board 的聚焦目标；Runtime 的真实工作阶段继续由 Claim、Run 和 work_state 表示。
