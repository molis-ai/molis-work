# WI02 修正 C 交回

Writer 完成「真实创建来源、干净新建回执、完整创建游标」。未宣称 WI02 或主验收通过。A/B 已主验收；D–F 仍待主调度。

## 来源读取

当前 Goal 创建渠道只读已持久的 `intent_created` 事实，不再扫最新 40 条 timeline。

- Goals 事件事实公开 API 增加窄读取 `readIntentSourceKind(boardId, goalId)`。
- 仓库按 `goal_work_events` 查询 `kind=system` 且 `payload.operation=intent_created` 的最早一条，不走分页窗口。
- 只接受已写入的 `web|onboarding|feed|runtime|tree`；没有这条事实时返回 `null`，不猜 `web`。
- `GoalEventApplication.readState` 消费该读取。owner 来源为 `migration` 时仍返回 `migration`，不要求存在 `intent_created`。
- 不新增 schema，也不另做来源缓存。

## 可信入口

普通 Runtime 不能自报渠道。Host/MCP 决定 `runtime`。

- MCP `molis_work_v1_goal_intent_create` schema 不再提供 `source_kind`。
- Runtime 边界：调用者只要自带 `source_kind`（含 `runtime`）即拒绝，无 Goal 副作用。错误码仍为 `mcp.user_impersonation_denied`。
- Host 在 Runtime 写入注入 `source_kind: "runtime"`；MCP Runtime 命令也按 audience 写入 `runtime`，不透传调用者字段。
- 受保护入口仍显式自己的渠道：Web `web`，onboarding `onboarding`，Feed `feed`，tree materializer `tree`。

## 新回执与游标

- `CreateGoalIntentResult.goal` 删除 `definition_state` / `decomposition_state` / `fulfillment_state`。HTTP/MCP 新建实际回执同样不再带这三键。历史 `GoalRecord` 列保留。
- onboarding HTTP 回执只返回 `goal_id` 与 `title`，不再复制旧两状态。
- 创建事务在身份、要求、父子/依赖全部写入后，读取 board `events` 最终 cursor，写入回执并保存到幂等 replay。同键重放返回原完整结果。输入、原子事务、失败回滚语义不变。

## 验证

```
pnpm_config_verify_deps_before_run=warn pnpm build
  → /private/tmp/molis-work-flow-cleanup/02-c-build.log  EXIT 0

pnpm_config_verify_deps_before_run=warn pnpm boundary:check
  → /private/tmp/molis-work-flow-cleanup/02-c-boundary.log  EXIT 0  errors: []

node --import tsx --input-type=module < /private/tmp/molis-work-flow-cleanup/02-c-runtime-acceptance.mjs
  → /private/tmp/molis-work-flow-cleanup/02-c-runtime-after.log  EXIT 0
    PASS real Runtime entry owns source and returns a clean complete creation receipt; replay has no extra writes
    PASS caller-supplied creation channel is rejected even when equal to runtime; no Goal side effects
    PASS creation provenance survives later history pages and Host/SQLite restart; original receipt stays stable

env -u FORCE_COLOR NODE_NO_WARNINGS=1 node --import tsx --test --test-concurrency=1 \
  tests/goal-event-create-flow.test.ts tests/mcp-goal-events.test.ts \
  tests/feed-goal-promotion.test.ts tests/goal-tree-event-flow.test.ts \
  tests/goal-event-http.test.ts
  → /private/tmp/molis-work-flow-cleanup/02-c-tests.log  18 pass / 1 fail / 0 skip
```

C 相关通过：create-flow 要求/关系回滚与完整游标；mcp-goal-events 新建无旧三状态、默认 runtime、伪造渠道拒绝、45 条后与重启仍为 runtime；Feed 升格 41 条后与 SQLite 重开仍为 feed；HTTP 新建与 onboarding 回执无旧别名且来源分别为 web/onboarding。

唯一失败：`tests/goal-tree-event-flow.test.ts` 在批准前被 `goal_tree_proposal.whole_confirmation_ambiguous` 拦住。这是 D 的树确认/message_ref 问题，不是 C 来源读取。tree materializer 仍显式写入 `source_kind: "tree"`，未改 D 批准路径。

未跑全仓。未改主 `02-entry-acceptance.mjs` / `02-tree-acceptance.mjs`；它们仍会因 D/E 失败，不能宣称整探针通过。未 commit/push。

## 未完 D–F

- D：Web 成功重试 409；树 Web `authority.message_ref` 不稳定；本次树单测已被该确认规则拦住。
- E：列表分页 anchor 与 Host/Session 焦点截断。
- F：树提交有限 discriminated union 与旧 MCP tree payload 清理。

## 交给主

- 独立确认 C。不要把整个 WI02 标完成。
- 继续调度 D–F。
- 主 `02-c-runtime-acceptance.mjs` 已可完整通过，与 D/E 无关。
