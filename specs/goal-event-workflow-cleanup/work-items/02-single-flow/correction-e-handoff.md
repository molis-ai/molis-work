# WI02 修正 E 交回

Writer 完成「分页锚点变化与明确恢复焦点」。未宣称 WI02 或主验收通过。A–D 已主验收；F/03 仍待主调度。未改身份绑定、Session 写入、A–D 或 F。

## 分页规则

`GoalEventApplication.listGoals` 仍按 `updated_at` 降序、`goal_id` 升序。`after_cursor` 是该排序上的 `updated_at|goal_id`，不是事件日志或整板 cursor。

下一页用游标里**已经保存的排序值**做 keyset：`updated_at` 更旧，或同时间且 `goal_id` 更大。不再 `findIndex` 当前列表。锚点被更新、移入可恢复回收站或不在当前过滤结果中时，仍从原排序位置继续，不因找不到锚点而回到第一页。同时间戳并列按 `goal_id` 稳定，不重复、不丢失仍在锚点之后的目标。无关新笔记不钉死整板 cursor。

非法输入明确拒绝、无写入：

- 游标缺 `|`、时间不是 ISO、或 `goal_id` 为空 → `goal_list.invalid_cursor`（「列表游标无效」）
- `work_status` 不是 `open|completed|cancelled` → `goal_list.invalid_status`（「不支持的工作状态」）
- `limit` 仍是 1–100

公开 `goal_list` 的 100 上限未改。

## 焦点按 ID 实际调用链

`presentResolution` 先 `readSession`，再把 trim 后的 Host `goalId` 与 Session `current_goal_id` 去空/去重、最多两项，作为内部焦点 ID 传入 `readResumeFacts`。

真实链：

1. `apps/mcp/src/context-presentation.ts`：`readSession` → `readResumeFacts(connection, focusGoalIds)` → `buildMcpResumeView(..., hostFocus, sessionFocus)`
2. `apps/local-host/src/mcp-server.ts`：`projectResumeFactsCapability({ board_id, focus_goal_ids })`
3. `plugins/native/goals/src/board-entry-capabilities.ts`：输入合同增加可选 `focus_goal_ids`
4. `apps/local-host/src/project-capabilities.ts`：普通目录仍 `listGoals({ limit: 100 })`；每个焦点 ID 走 `readDirectoryItem`（`getGoal` 校验同板、未删未归档），与 100 项目录合并去重
5. `buildMcpResumeView` 仍按 Host → Session → 项目推荐排序；不在 facts 中的 ID 不能强行选中

`readDirectoryItem` 复用与列表相同的 `directoryItem` / `nextHint` / `can_record`，没有第二套完成判断。不写 Session、不改终端绑定、不发 Runtime 消息。不存在、其它 Board、已删/归档的焦点被跳过；无效 Host 才回退有效 Session。

## 验证证据

主探针未改。生产改动后先 build，再从仓库 stdin 运行：

```
pnpm_config_verify_deps_before_run=warn pnpm build
  → /private/tmp/molis-work-flow-cleanup/02-e-build.log  EXIT 0

node --import tsx --input-type=module < /private/tmp/molis-work-flow-cleanup/02-e-pagination-acceptance.mjs
  → /private/tmp/molis-work-flow-cleanup/02-e-pagination-after.log  EXIT 0
    PASS real MCP pagination follows original sort values with tied timestamps, updated anchor and trashed anchor; no first-page restart or missing later Goals
    PASS invalid pagination and status inputs reject without writes

node --import tsx --input-type=module < /private/tmp/molis-work-flow-cleanup/02-e-focus-acceptance.mjs
  → /private/tmp/molis-work-flow-cleanup/02-e-focus-after.log  EXIT 0
    PASS explicit Host focus outranks the real Session focus beyond 100 goals
    PASS real Session focus remains usable beyond 100 goals
    PASS invalid Host focus falls back to the valid saved Session target
    PASS Host restart retains saved Session focus and priority

pnpm_config_verify_deps_before_run=warn pnpm boundary:check
  → /private/tmp/molis-work-flow-cleanup/02-e-boundary.log  EXIT 0  errors: []

env -u FORCE_COLOR NODE_NO_WARNINGS=1 node --import tsx --test --test-concurrency=1 \
  tests/goal-event-create-flow.test.ts tests/mcp-resume-view.test.ts \
  tests/runtime-context-entry.test.ts
  → /private/tmp/molis-work-flow-cleanup/02-e-tests.log  7 pass / 0 fail / 0 skip
```

仓库回归覆盖：`listGoals` 同时间戳、更新/回收锚点后继续、非法 cursor/status 无写入；`molis_work_v1_context_resolve` 经 `openWorkSessionRegistry.explicitlyLinkSession` 保存 `current_goal_id`，Host/Session 均在 100 外时 Host 优先、无效 Host 回退 Session、Host 重启一致，且 Session 关联与消息事件不变。原 `buildMcpResumeView` 数组排序语义保留。

未跑 `02-tree-acceptance.mjs` 全文件（含 F）。未跑全仓。未 commit/push。未改主 spec/progress/acceptance。

## 未完 F

第 6 组：完成有限类型与相关删除。新提交 input 必须真正引用 `goal/create` 与 `relation/create|deactivate` 的 discriminated union；旧 MCP tree payload 无消费者的定义和 glue 删除。03 仍负责全局旧协议退役。仓库树测试 `whole_confirmation_ambiguous` 仍是 F 的旧测试输入，未在本项放宽。
