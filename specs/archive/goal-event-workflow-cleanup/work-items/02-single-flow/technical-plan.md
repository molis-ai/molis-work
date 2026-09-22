# WI02 技术方案：统一新建、结构、发现与恢复

完成等级：4 的本项切片。主裁决（spec 七条）优先于草案。权威是事件当前状态。

## 1. 唯一创建：`createIntent` 整事务

`GoalEventApplication.createIntent` 是全部生产新建入口。底层 `createGoal` 只写身份行（title/why/business_logic/priority/goal_id，outcome 写入约定而非 intent 别名）。同一 `runImmediate`：createGoal → adoptOwner(`intent`) → 用户要求 → parent `part_of` / deps `depends_on` → 系统事件 `intent_created`（**保存** `source_kind`）。未知键拒绝。空字段不造默认值。幂等包整份输入。关系失败整笔回滚。

```text
CreateGoalIntentInput {
  board_id, title, actor_id, idempotency_key,
  actor_kind?, goal_id?,
  outcome?, why?, business_logic?, priority?,
  parent_goal_id?, dependency_goal_ids?,
  requirements?: [{ requirement_id?, statement, human_decision_required? }],
  source_kind?: web | onboarding | feed | runtime | tree
}
```

Web `acceptance_criteria: string[]` → `requirements[].statement`。Feed 仍在现事务内 `linkGoal` + `goalInputs.register`。树物化 `goal/create` 调 createIntent，不走 `createConfirmedGoal`。

读模型：当前结果只在 `agreement.outcome`。`intent` 仅 title/why/business_logic/source_kind。删除 `protocol`、`current_agreement`、`intent.outcome`。`can_record = owned && !trashed && !archived`，与 recordNote/report 准入一致；completed/cancelled 普通记录不自动重开。

## 2. 结构：只 `goal/create` 与 `relation/create|deactivate`

新写入 kind 仅 `goal`（create）与 `relation`（`part_of`|`depends_on`，create/deactivate）。无 `dependency` 同义 kind。有限 discriminated payload；未知键拒绝。旧 Contract/Policy/Risk/Candidate 万能 shape 只历史可读，新 check/decide 遇之 `kind_retired` 不落地。

去掉 Run/decomposition/role。Host 注入 Runtime actor 与 `submitted_session_id`（schema 不暴露、Runtime 不得覆盖）。`discovered_in_run_id` 新提交不填。Runtime `goal_tree_decide` 移出 discovery 且 dispatch 拒绝写入。批准只走 Web/管理，落地已存条目。

基线：相关 Goal 身份 + trash/archive，以及关系 from/to/type/state 内容；不用 Goal `updated_at` 或整板 cursor。无关笔记/不影响结构的 agreement 不冲突。确认所选集合时同一事务做最终图检查 + 全部相关基线，失败无部分写入。空项目可一次提多个新 Goal 及相互关系（提交时物化稳定 `goal_id` 写入已存 payload）。

## 3. 列表 / 恢复 / URL

`listGoals({ board_id, work_status?, limit 1–100 默认 20, after_cursor? })`：`after_cursor` 是列表分页（`updated_at|goal_id`），与 `observed_event_cursor`（板日志）、`goal_event_cursor`（单 Goal 工作事件）分开。摘要：id/title/work_status/completion_effect/can_record/next_hint/counts。

resume 与目录读同一摘要。Host 焦点 → Session 焦点 → 项目恢复序。`goal_url` 仅 MCP 呈现层。不改终端绑定。

## 4. 迁移 36（扫描所有 Goal）

缺 owner 才补 owner（`source=migration`）与 open/历史完成。**所有 Goal** 尚未转入的旧 criterion、`resolveGoalPolicy(listActivePolicyBindings).human_approval`（含 project_default）与 `completionRiskReasons`（含 `invalidate_on_trigger`）必须转入。已有事件要求（含退休）、类型、绑定、报告、结论、约定版本、owner、真实 closure **不覆盖**。同 ID 已有事件 supports 保留；Evidence/Review 不转新 supports。

- criterion → 事件要求，原 ID；已有行跳过。
- 人工 policy：每 Goal 一条 `imported-policy:{goalId}`，`human_decision_required=true`，source 含真实 `policy_binding_id` 列表。
- 风险 Concern：`imported-risk:{goalId}:{riskId}`，`blocks_closure`，`scope.action=complete`。
- 已完成且无事件 closure：`work_status=completed` + `legacy_completion_imported`，引用真实 `goal.satisfied`（或仅 fulfillment）及 Evidence/Review ID。`accepted_at/by` 只标旧 Contract 接受。UI「迁入的历史完成」。已有 event closure 不改成迁入完成。
- 迁入后完成检查不再读旧 policy/risk 闸。明确继续：`reopenCompletedEventWork`。
- 自动 reopen 仅针对已生效事件 closure，迁入完成必须显式继续。

源 fixture 只复制后升级。IDs 含 goal，避免共享 policy/risk 碰撞。

## 5. 本项可删 glue

`goal-tree-run-authority` 调用、decomposition/role/Risk-lifecycle submit 门槛、新路径 contract/policy/risk/candidate/rewire 落地、Runtime 自证 decide、`protocol`/`current_agreement`、criterion 拼接、resume 用 action projection 当当前状态。共享旧 MCP/CLI/execution 留给 03。
