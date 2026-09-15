# Goal 回收站 Runtime MCP 入口

## 背景与目标

上一项已提供 `MolisWorkCoordinator.setGoalTrashed`：它在一个事务中保护活动工作、移入/恢复 Goal、维护 Relation，并保留历史。本 Work Item 让用户正在对话的 Runtime 能通过 Molis Work Skill 和 MCP 完成同一流程，不必打开 Web，也不让 MCP 或 Runtime 复制删除规则。

## 当前行为与问题证据

- 回收站领域服务和 SQLite 事实已存在，但 Runtime MCP 没有移入回收站、列出回收站或恢复 Goal 的工具。
- Runtime MCP 已有当前项目连接：宿主固定数据库与 `board_id`，拒绝 `database_path`、Web 地址和不同 Board 的覆盖。
- Runtime Skill 尚未告诉模型何时可以删除、如何处理活动工作阻塞或两端尚未恢复的 Relation。

## 范围

- 新增 Runtime 可见的 MCP 工具：
  - `molis_work_v1_goal_trash`：将当前项目的一条 Goal 移入回收站；
  - `molis_work_v1_goal_trash_list`：读取当前项目的回收站；
  - `molis_work_v1_goal_restore`：恢复一条回收站 Goal。
- 写工具必须带 `goal_id`、当前 Runtime `actor_id`、非空 `reason`、稳定 `idempotency_key` 和 `user_confirmed=true`。
- MCP 只校验当前对话的明确用户意图、项目连接和参数，再调用 `setGoalTrashed`；返回领域结果、派生工作状态和面向 Skill 的下一步提示。
- 更新 `goal-advance` Skill/协议：清楚说明“删除”是可恢复的、何时需要询问、何时可以调用、怎样解释 `blocked` 和待恢复 Relation。
- 测试完整 Runtime 流程、用户意图拒绝、幂等和共享服务调用路径。

## 非目标

- 新增或重写删除、Relation、Claim、Run 或 SQLite 事务规则。
- Web 删除/恢复按钮或回收站页面（属于 `MOLIS_WORK-GOAL-TRASH-UI`）。
- 永久删除 Goal、历史、项目数据库或 Runtime 配置。
- 用 MCP 代替当前项目连接、任意指定数据库路径或任意 Board。

## 接口与调用链

```text
用户在当前 Runtime 明确说“删除/恢复某个 Goal”
  → Skill 确认目标和可恢复含义（含糊时先追问）
  → Runtime MCP（固定当前项目连接；user_confirmed=true）
  → MolisWorkServer 参数/意图适配
  → MolisWorkCoordinator.setGoalTrashed（唯一业务规则）
  → SQLite 回收记录、Relation、Board active Goal、事件（同一事务）
  → MCP 返回状态、Relation 摘要、阻塞 IDs、派生 work_state / next_action
  → Skill 在当前对话用人话说明成功、阻塞或待恢复关系
```

`user_confirmed` 不是让 Runtime 自行授权；它只能表示当前用户已经清楚表达要对指定 Goal 执行该操作。用户说“清理一下”“可能不需要”之类含糊内容时，Skill 必须先澄清，不能调用写工具。

## 关键决策

- 写操作分成显式 trash/restore 工具，而不是一个隐含动词的通用更新接口；这样 Skill 与 MCP 记录都清楚显示用户想做的是哪种可恢复操作。
- `molis_work_v1_goal_trash_list` 只读，因此不要求用户确认；它用于用户主动问“回收站里有什么”。
- 只有服务层决定 `blocked`、停用/恢复哪些 Relation、是否清除 Active Goal，以及重复请求是否重放。MCP 不检查或写这些事实。
- Runtime 工具保留现有项目连接护栏：服务端拒绝数据库/Web 覆盖和不同 `board_id`，因此模型不能跨项目操作。
- MCP 的 `next_action` 只是结果呈现：活动工作阻塞时提示先结束工作；另一端仍在回收站时提示恢复关联 Goal；不会修改任何业务状态。

## 文件边界

- `src/mcp/server.ts`：工具 schema、Runtime 工具白名单、意图检查、共享服务调用和结果呈现。
- `skills/goal-advance/SKILL.md`：Runtime 的简明入口说明。
- `skills/goal-advance/references/protocol.md`：删除/恢复的对话步骤和受阻处理。
- `tests/mcp.test.ts`：Runtime MCP 集成、意图、幂等、连接护栏和共享服务回归。

## 验收标准

- `TRASH-MCP-COMPLETE-FLOW`：Runtime 不打开 Web，也能移入回收站、列出目标、恢复同一 `goal_id`，并读到恢复后的 Contract。
- `TRASH-MCP-SHARED-SERVICE`：handler 只调用 `setGoalTrashed`；测试确认 MCP 操作与直接服务调用得到同样的 Relation/状态事实。
- `TRASH-MCP-USER-INTENT`：`user_confirmed` 缺失或为 false 时写操作被拒绝且没有数据变化；恢复与相同幂等键重试保持幂等。

## 验证

```text
node --import tsx --test tests/mcp.test.ts
pnpm typecheck
pnpm test
git diff --check
```

## 开放问题

- 后续 UI Goal 必须调用同一个 `setGoalTrashed`，并在其自身交互里取得同等明确的用户确认。
