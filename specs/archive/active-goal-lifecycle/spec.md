# Active Goal Lifecycle

## 背景与目标

我们已经确认 Active Goal 表示 Board 当前正在推进的 Goal，而不是永久置顶或推荐的下一份工作。真实 Board 的全部有效 Goal 已完成、Available 为空，但 `boards.active_goal_id` 仍指向一个 `satisfied` Goal，说明完成调用链没有收口这个指针。

目标是让 Active Goal 始终符合“当前仍在推进”的含义：已完成、已归档或已进入回收站的 Goal 不能被设为 Active；当前 Active Goal 一旦完成，就在同一事务自动清空；历史遗留指针通过一次迁移修复。

## 当前行为和问题证据

- `setActiveGoal()` 只校验 accepted、非回收站、非归档，没有拒绝 `satisfied` Goal。
- 归档和回收站路径会清空 Active Goal，但各自复制了一段查询和更新 SQL。
- 叶子 Goal 在 `evaluateLeafCompletion()` 完成、复合父 Goal 在 `satisfyClosedCompoundGoalIfReady()` 完成时，只更新 `fulfillment_state`，不清空 Active Goal。
- 真实 Board 当前 `active_goal_id = GOAL-RUNTIME-REVIEWER-SKILL-WORKFLOW`，而该 Goal 已 `satisfied`。

## 范围与非目标

范围：

- 禁止把 `satisfied`、回收站或归档 Goal 设为 Active。
- 叶子 Goal 和复合父 Goal 完成时，若正是 Active Goal，则同事务清空。
- 归档和回收站路径复用同一个私有清空入口，删除重复 SQL。
- 增加 migration 13，清除历史上指向 satisfied、归档、回收站或不存在 Goal 的 Active 指针。
- 完成、归档、回收站和迁移事件明确记录是否清空了 Active Goal。

非目标：

- 不把 Active Goal 改成“系统自动选出的下一份 Available”；选择仍由用户明确完成。
- 不因 Goal 暂时 blocked、等待子 Goal 或需要 revalidation 就清空；这些仍是可能正在推进的状态。
- 不自动设置新的 Active Goal，不修改 Runtime Session 绑定或用户项目配置。
- 不新增第二套工作状态。

## 用户与调用场景

1. 用户把一个未完成、已接受的 Goal 设为 Active；它验收完成后，Board 自动回到“当前没有进行中 Goal”。
2. Active 复合父 Goal 的最后一个子 Goal 完成，父 Goal 自动 satisfied，同时 Active 指针清空。
3. 用户尝试把已完成 Goal 设为 Active，得到清楚错误；如要继续工作，应新建/恢复需要推进的 Goal，而不是把完成事实改成进行中。
4. 升级历史数据库时，旧的 satisfied Active 指针被清空并留下审计事件；重复打开数据库不重复修复。

## 方案与关键决策

1. 在 Coordinator 增加 `clearActiveGoalIfMatches()`，用一条带条件的 UPDATE 原子清空并返回是否发生变化。
2. 叶子和复合父级完成路径在写入 satisfied 后调用该入口，并把结果放进原有完成事件 payload。
3. 归档和回收站继续维持现有公开返回值，但改为复用统一入口。
4. `setActiveGoal()` 在写入前拒绝 `fulfillment_state = satisfied`。
5. migration 13 只修复不可能代表进行中工作的历史指针，并为每个修复 Board 写 `board.active_goal_cleared` 事件。

## 输入、输出与依赖

- 输入：Board 当前 `active_goal_id` 和目标 Goal 的 canonical 生命周期字段。
- 输出：有效或为空的 `active_goal_id`，以及完成/迁移事件中的 `active_goal_cleared` 事实。
- 依赖：现有 Coordinator 事务、Store migration 和 events ledger。

## 文件与模块边界

- `src/v1/coordinator.ts`：设置校验、统一清空入口和完成调用链。
- `src/v1/store.ts`：migration 13 历史修复。
- `tests/v1.test.ts`：设置、叶子完成、复合完成、归档/回收站和迁移回归。
- 不改 MCP、CLI、Web、Runtime Skill 或公开类型。

## 验收标准

1. `setActiveGoal()` 拒绝 satisfied、归档和回收站 Goal。
2. Active 叶子 Goal 完成后 `active_goal_id` 为 null，`goal.satisfied` 事件记录 `active_goal_cleared: true`。
3. Active 复合父 Goal 自动完成后 `active_goal_id` 为 null，`goal.compound_satisfied` 事件记录 `active_goal_cleared: true`。
4. 非 Active Goal 完成不影响当前 Active Goal，事件记录 `active_goal_cleared: false`。
5. 归档和回收站行为不回归，并复用统一清空入口。
6. migration 13 清除真实和测试历史脏指针，重跑不重复写事件。
7. 定向测试、类型检查、完整测试和 `git diff --check` 通过。
8. 真实 Board 升级后 `active_goal_id` 为 null，Available 仍为空，所有非回收站 Goal 仍为 satisfied。

## 验证命令

```bash
node --import tsx --test tests/v1.test.ts
pnpm typecheck
pnpm test
git diff --check
```

## 假设与开放问题

- Active Goal 是用户选择的单个当前工作焦点；它可以处于澄清、执行、Review、等待子 Goal、blocked 或 revalidation，但不能已经结束。
- 当前没有开放问题阻塞实现。
