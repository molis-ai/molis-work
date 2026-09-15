# Goal 回收站共享服务

## 背景与目标

Molis Work 已有“归档”：它只整理已完成 Goal，仍保留在归档视图中。用户要求的“删除”是不同概念：任何不在活动工作中的 Goal 可被移入回收站，保留原 `goal_id`、所有事实和事件，之后可恢复。UI 与 MCP 不得各自实现删除规则，必须共享一个领域服务。

本 Work Item 只实现领域服务、SQLite 事实、工作流过滤和普通 Web 读取过滤；删除/恢复按钮和 MCP 工具留给后续 `MOLIS_WORK-GOAL-TRASH-UI`、`MOLIS_WORK-GOAL-TRASH-MCP`。

## 当前行为与问题证据

- `setGoalArchived` 使用 `archived_at` / `archived_by`，只允许已经 `satisfied` 的 Goal 归档；它不能满足“未完成工作可恢复删除”的需求。
- `goal_relations` 只有 `state`、`deactivated_at`，没有记录某次删除究竟停用了哪些原本 active 的 Relation，因此不能安全恢复。
- `queryReady`、`queryAvailable`、`claimGoal`、Run、Review、Revalidate、Web 普通列表仅理解归档状态，尚不理解回收站。

## 范围

- 为 Goal 增加 `trashed_at`、`trashed_by` 和可查询的回收记录。
- 提供唯一 `setGoalTrashed(boardId, { goal_id, trashed, reason }, actor)` 领域接口：`trashed=true` 移入回收站，`false` 恢复。
- 删除时在同一 SQLite immediate transaction 中：检查活动工作、标记 Goal、停用其全部 active 入向/出向 Relation、记录哪些 Relation 原本 active、必要时清除 Board Active Goal、追加事件。
- 恢复时保留原 `goal_id` 和所有历史；只重新激活由回收站操作停用、当前仍 inactive、且两端 Goal 均存在且不在回收站的 Relation。
- 允许两端分开恢复：若另一端暂时仍在回收站，Relation 保持待恢复；最后一个相关 Goal 恢复时再安全激活。
- 将回收站 Goal 从 Ready / Available / Claim / Run / Review / Revalidation / Completion 与 Web 普通 Tree 过滤出去；提供领域层的回收站查询。
- 防止新增 active Relation 指向回收站 Goal。
- 为既有数据库提供一次性迁移；不重写或删除任何既有 Goal、Relation、Claim、Run、Evidence、Candidate、Risk 或事件。

## 非目标

- 永久物理删除 Goal 或任意历史。
- 删除整个项目、项目 DB 或 Runtime 配置。
- 回收站 UI、删除确认文案、MCP tool schema 和宿主用户确认逻辑。
- 修改现有“已完成 Goal 归档”语义。
- 为所有历史提案重新设计权限模型。

## 调用链与边界

```text
未来 UI / MCP（分别验证用户意图）
  → MolisWorkCoordinator.setGoalTrashed（唯一领域规则）
    → SQLite goals + goal_trash_records + goal_trash_relation_records
    → goal_relations / boards / events（同一事务）
    → queryReady / Available / Claim / Run / Review / Revalidate / Web read model
```

`setGoalTrashed` 不信任或解释用户对话；适配层负责确认意图，再调用同一领域接口。这样 UI 和 MCP 不会分叉出不同的关系停用、恢复或活动工作保护逻辑。

## 数据与状态设计

- `goals.trashed_at` / `goals.trashed_by`：当前是否在回收站的 canonical 状态。
- `goal_trash_records`：每次移入回收站的操作记录，保留 trashed/restored 时间、操作者和理由；同一 Goal 同时最多一个未恢复记录。
- `goal_trash_relation_records`：只记录该次删除前为 `active` 的 Relation。它是恢复白名单，避免原本 inactive 的 Relation 被误激活。
- Relation 恢复前检查：Relation 仍为 inactive、两端 Goal 都存在且 `trashed_at IS NULL`。成功后标记该 Relation 的未完成回收记录已恢复；否则保留记录，供另一端后续恢复时再次检查。

## 关键行为

1. 有有效 Claim（未过期 active）或 `started` / `blocked` Run 时，返回结构化 `blocked`，Goal 与 Relation 不变。
2. 重复移入返回 `already_trashed`；重复恢复返回 `already_active`。幂等键重放原结果，不产生新事件。
3. 删除不物理删除任何事实；恢复只清除当前回收状态，不更改 archive、completion、Contract 或历史。
4. 回收 Goal 后不存在 active Relation 指向它；恢复不会让 Relation 指向仍在回收站的另一端。
5. 非回收站工作入口不能领取或继续该 Goal；读取其回收事实必须走 `listTrashedGoals` / 低层 snapshot 或后续专用 UI/MCP。

## 文件边界

- `src/v1/types.ts`：回收状态、结果类型和工作状态定义。
- `src/v1/store.ts`：Schema migration、Goal mapping、回收记录查询。
- `src/v1/coordinator.ts`：唯一回收/恢复服务、活动工作保护、关系规则与工作流排除。
- `src/web/server.ts`、`src/web/render.ts`：普通 Tree 不返回回收站 Goal；不添加删除 UI。
- `tests/v1.test.ts`、`tests/web.test.ts`：服务、迁移、事务、工作流和普通读取回归。

## 验收标准

- `TRASH-SERVICE-ACTIVE-WORK-GUARD`：有效 Claim 或未结束 Run 时返回 `blocked`，无数据变化；工作结束后可删除。
- `TRASH-SERVICE-RECOVERABLE`：删除后 Goal、Claim、Run、Evidence、Candidate、Risk 和事件仍在；恢复后同一 `goal_id` 可重新进入状态机。
- `TRASH-SERVICE-RELATION-ROUNDTRIP`：所有 incident active Relation 原子停用；只恢复本次停用且两端可用的 Relation；数据库故障时 Goal 与 Relation 一并回滚。
- `TRASH-SERVICE-WORKFLOW-EXCLUSION`：普通 Ready、Available、Claim、Run、Review、Revalidate 和 Web Tree 不包含回收站 Goal；专用查询仍可读取。

## 验证

```text
node --import tsx --test tests/v1.test.ts tests/web.test.ts
pnpm typecheck
pnpm test
git diff --check
```

## 开放问题

- 后续 UI/MCP Goal 要规定各自的明确用户确认交互，但不得复制本服务的状态机。
- 已归档 Goal 若被移入回收站，恢复后仍保留原归档状态；两个概念不相互覆盖。
