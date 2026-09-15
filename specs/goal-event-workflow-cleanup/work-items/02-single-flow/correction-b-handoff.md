# WI02 修正 B 交回

Writer 完成「迁移保留仍有效、同范围用户批准的作用」，并把仓库迁移测试改成可复现的 v35 SQL fixture。未宣称 WI02 或主验收通过。A 已主验收；C–F 仍待主调度。

## 适用规则

一次性迁移 36 在写入 `imported-policy:{goalId}` 后，仅当存在**当前完成决定**且承诺仍适用时，才给该迁入人工要求补一条 `accepted` 结论：

1. 当前完成决定 = 该 Goal 已应用决定中 `scope.action === "complete"` 的最后一条（`currentActionDecision(..., "complete")`）。后来的 `deny complete` 会盖掉更早的 `authorize complete`，即使 requirement_ids 不同，也不会让旧授权重新生效。
2. 该条必须仍是 `authorize_action/complete`，不能是 `deny_action/complete`。
3. `commitment.outcome` 必须等于迁入后的当前结果约定。
4. `scope.requirement_ids` 为空：不核对要求承诺（原四份真实批准属于这类，仍可复用）。
5. `scope.requirement_ids` 非空：对照迁入后**当前 active** 事件要求。每条须仍存在；若承诺里记录了 statement / `human_decision_required` / `bound_type_ids`，用现有 `commitmentsMatch` 比较。已退休、缺失、原文变化、人工门禁变化或绑定变化则不套用。承诺里没有要求快照时，只要求这些 ID 当前仍在。
6. `bound_type_ids` 与生产 `readCurrentGoalEventRequirements` 相同：`goal_event_requirement_bindings` 与每条要求自己的 `bound_type_id` 去重合并后再排序。只写在 direct 字段、未复制到绑定表的类型也算当前绑定。

结论引用原 `decision_id`、`actor_id`、`recorded_at` 和原事件 `journal_seq`。不写新可信决定、不改已应用决定、不改 owner/closure、不把 Evidence/Review 转 supports、不覆写已有结论。重启因迁移 36 已记名而不重复。

## 样本与负例

- 仓库 fixture：`tests/fixtures/goal-event-v35/{legacy,mixed,approved,approved-completed}.sql`（主导出的未改 v35 dump）。
- 加载：`tests/goal-event-v35-fixture.ts` 把 dump 写入临时 SQLite，再由 `LocalProjectDatabase` 首次打开升级。
- 原四份 `/private/tmp/molis-work-flow-cleanup/02-*-source.sqlite` 只复制、不改。
- 独立负例：主 `02-b-scope-acceptance.mjs` 与仓库测试 `scoped complete approval is reused only while recorded requirement commitments still match`。在 approved v35 临时副本上把原完成批准改成 MIXED-C1 范围承诺；statement 不变则仍复用，改 statement 后 `imported-policy` 不得 `currently_satisfied`。
- 直接绑定：主 `02-b-binding-acceptance.mjs` 与仓库测试 `direct bound_type_id is part of the current commitment snapshot`。在 approved v35 临时副本新增 `B-TYPED`（`bound_type_id=check`，绑定表无行）。原承诺含 `check` 则仍复用；原承诺无绑定、当前已有 `check` 则不复用。

## 验证

本轮（direct `bound_type_id` 合并进 snapshot）在完整 build 之后：

```
pnpm_config_verify_deps_before_run=warn pnpm build
  → /private/tmp/molis-work-flow-cleanup/02-b-binding-build.log  EXIT 0

pnpm_config_verify_deps_before_run=warn pnpm boundary:check
  → /private/tmp/molis-work-flow-cleanup/02-b-binding-boundary.log  EXIT 0  errors: []

env -u FORCE_COLOR NODE_NO_WARNINGS=1 node --import tsx --test --test-concurrency=1 \
  tests/goal-event-migration.test.ts tests/goal-event-create-flow.test.ts
  → /private/tmp/molis-work-flow-cleanup/02-b-binding-tests.log  10 pass / 0 fail

node --import tsx --input-type=module < /private/tmp/molis-work-flow-cleanup/02-migration-acceptance.mjs
  → /private/tmp/molis-work-flow-cleanup/02-b-binding-migration.log  EXIT 0  18 PASS

node --import tsx --input-type=module < /private/tmp/molis-work-flow-cleanup/02-b-scope-acceptance.mjs
  → /private/tmp/molis-work-flow-cleanup/02-b-binding-scope.log  EXIT 0
    PASS unchanged scoped commitment retains original approval
    PASS changed scoped requirement needs a current decision

node --import tsx --input-type=module < /private/tmp/molis-work-flow-cleanup/02-b-binding-acceptance.mjs
  → /private/tmp/molis-work-flow-cleanup/02-b-binding-acceptance.log  EXIT 0
    PASS unchanged direct binding retains valid approval
    PASS changed direct binding needs a current approval
```

先前 `02-b-final-*` 已通过四份源库和 scope statement 负例。本轮只补 snapshot 漏读的 direct `bound_type_id`。未跑全仓、未改主探针、未 commit/push。A 的 Runtime 未授权不能放宽检查仍在。

未跑全仓、未改主探针、未 commit/push。A 的 Runtime 未授权不能放宽检查仍在。

## 交给主

- 独立确认 B；不要把整个 WI02 标完成。
- 继续调度 C–F。
