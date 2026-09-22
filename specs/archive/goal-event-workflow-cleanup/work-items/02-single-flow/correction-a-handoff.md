# WI02 修正 A 交回

Writer 只完成「所有当前事件要求可修订/退休」。未宣称 WI02 或主验收通过。B–F 仍待主调度。

## 改动

生产两处，无新 schema / 迁移 / 权威模型：

1. `modules/goals/src/event-state-agreement.ts` `assertRequirementTargets`：可写集合改为当前事件要求 ID（`readCurrentRequirements` 已过滤 `current_status=active`），不再用 `origin.kind === "goal_event_requirement"`。01 的保护性变更、CAS、`cited_decision_id` 未改。
2. `plugins/native/goals/src/event-document-forms.ts` `renderAgreementForm`：约定表单列出全部当前要求，不再按来源隐藏新建/迁入项。

没有第三处同根因 helper。来源字段、历史行、legacy criterion 双读均未恢复。

## 用户现在能做什么

- Web 新建时写入的 `create_input` 要求：用户可修订原文；Runtime 无具体授权不能改。
- 迁入的 `imported_acceptance_criterion` / `imported_human_approval`：用户可修订或退休；Runtime 无具体授权不能放宽或退休。
- 修订/退休后 `origin.kind` 与退休行的 `source_json` 仍在。

完成等级：本项 A 切片功能可用。桌面/390px 表单由主用 `/private/tmp/molis-work-flow-cleanup/02-ui-requirements.mjs` 独立验。

## 验证

```
pnpm_config_verify_deps_before_run=warn pnpm build
  → /private/tmp/molis-work-flow-cleanup/02-a-build.log  EXIT 0

pnpm_config_verify_deps_before_run=warn pnpm boundary:check
  → /private/tmp/molis-work-flow-cleanup/02-a-boundary.log  EXIT 0  errors: []

env -u FORCE_COLOR NODE_NO_WARNINGS=1 node --import tsx --test --test-concurrency=1 \
  tests/goal-event-create-flow.test.ts tests/goal-event-migration.test.ts
  → /private/tmp/molis-work-flow-cleanup/02-a-tests.log  6 pass / 0 fail
```

新增回归：

- `user can revise a createIntent requirement; runtime cannot relax it without a cited decision`
- `imported criterion and policy requirements follow the same user revise and retire rules`

未跑全仓、未改主探针、未 commit/push。旧 `02-tests.log` 中 B–F 失败未处理。

## 交给主

- 独立跑 UI 探针（桌面 + 390px 真实表单）。
- 继续调度 B–F。不要把整个 WI02 标完成。
