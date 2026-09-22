# WI03 C1 交回：导入转换、规划当前状态、Host 测试与文案

完成等级：4 的 **C1 切片**。未宣称整个 03 或 C 完成。未改主 spec/progress/acceptance。未改主探针。未 commit/push。未动真实用户库。C2 删除未开始。

## 用户现在能做什么

管理 `import_v3` 导入含父子、输入输出、约束、coverage 的 V3 数据后，Goal 立刻有当前事件归属（`event_work` / `open`），可用 Runtime `goal_state` / `event_note`，重启后重放笔记不重复。不要求已退役的接受/领取。`planning_analyze_change` 的可复用候选和 unlock 计数跟当前 `goal_event_work_status`，不再被历史 `closed_compound` 挡住。规划方法正文是可选规划，不是创建门禁。

## 精确映射（已写入 technical-plan.md §6）

同一 `immediate` 事务：`initializeBoard` → 内部 `createGoal` → `addRelation(part_of)` → `adoptOwner(source=migration)` → `importLegacyCoverage` → `completeLegacyBoardImport`。

| 原 V3 | 当前写入 | 明确不写 |
| --- | --- | --- |
| `one_liner` | `title` + `outcome` | 假验收承诺 |
| `covers` | `in_scope` | — |
| `inputs` / `outputs` | `required_inputs` / `promised_outputs` | — |
| `root_goal.constraints` | 每个 Goal 的 `constraints` | — |
| `parent` | `part_of`（V3 无 depends_on，不发明依赖） | `closed_leaf` / `closed_compound` |
| coverage ledger | 现有 disposition | — |
| source identity | `completeLegacyBoardImport` | 接受/领取 |
| 结构形状 | `draft` + `abstract` + 空 `acceptance_criteria` | human_decision 再生条目 |
| 出处 | `why` 迁入说明；`business_logic=""` | 「补全后才能接受和领取」 |
| 当前状态 | `adoptOwner(source=migration)` → owner=`event_work`，work_status=`open`，`intent.source_kind=migration` | 新 Web `intent_created`、假 requirements |

规划：`reusable_open_goal_ids` = 相关且未回收且 work_status=`open`（无行视为 open）。`planningMetrics.unlock_count` 排除 `completed`。祖先/下游/相邻上游/拓扑/循环不变。`analyzeChange` 读同一库 `goal_event_work_status`。

## 改动文件

- `specs/archive/goal-event-workflow-cleanup/work-items/03-mcp-closure/technical-plan.md` — C1 映射
- `tests/host-entry-consistency.test.ts` — 恢复基线 LocalHost.withScope 测试，保留新 event/trash 测试
- `plugins/native/goals/src/board-v3-import.ts`、`apps/local-host/src/board-v3-import.ts`、`plugins/native/goals/src/goal-event-application.ts` — 导入事务内 conversion
- `modules/goals/src/planning/{goal-graph,engine}.ts`、`modules/goals/src/index.ts` — 当前事件状态端口
- `apps/mcp/src/goal-tools.ts`、`modules/goals/src/planning/method-packs.ts`、`modules/governance-collaboration/src/provenance.ts` — 规划/来源文案
- `tests/planning-engine.test.ts`、`tests/goals-storage-migration.test.ts`、`tests/goals-storage-migration.e2e.test.ts` — 当前导入/规划/历史 revision/浏览器笔记

未改：`skills/goal-advance/**`、主 spec/progress/acceptance、主探针、四份 `tests/fixtures/goal-event-v35/*.sql`、desktop 已删 jpg、依赖/lockfile。生产拒绝语义未改。

## 根已独立验收（本轮不再重跑）

`03-c1-root-{planning,metrics,migration,host,tree}.log` 与 `03-c1-root-import-final.log`：规划候选/open-completed-cancelled 计数、四份历史迁移库、两个 Host 测试、Runtime/Web 树回归、管理导入字段/树/coverage/拒绝覆盖、Runtime `source=migration`/无假要求/笔记、规划切换、Host/SQLite 重启与原笔记重放。

## 本轮测试纠偏

1. `tests/goals-storage-migration.test.ts` migration30：不再用当前 demo 的空 accepted 循环。历史库改为不可变 `materializeGoalEventV35Fixture("approved")`。具体已知 Goal `CORE` 必须 `definition_state=accepted`，revision 保持 `changed_by=accepted_by`、`created_at=accepted_at`、原验收条件。migration30 失败注入、policy/guidance/coverage 与 imported revision 检查保留。未复活 accepted-contract 写协议，未改四份 fixture 文件。
2. `tests/goals-storage-migration.e2e.test.ts`：不再用 `goalEvents.recordNote` 代替 UI。按当前笔记表单点击 `[data-event-form-open="note"]`、填写 `name="note"`、提交、等 `data-goal-event-cursor` 前进；reload 后时间线仍可见该笔记，SQLite 重开可读到同一正文。保留导入说明/coverage 与 relation。测试名改为当前用户结果。未恢复 Draft 表单。
3. 仓库导入测试名与断言：`V3 import adopts migration event ownership...`；`state.intent.source_kind === "migration"` 且 `requirements === []`。未再改 `adoptOwner(source=migration)` 生产路径。

## 验证

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| 既有最终 build + `pnpm boundary:check` | EXIT 0，`errors: []`（本轮无生产改动，未重建） | `03-c1-boundary.log` |
| `tests/goals-storage-migration.test.ts` + `.e2e.test.ts` | 10 pass / 0 fail，含 CORE revision 与浏览器笔记 | `03-c1-import-tests-final.log` |
| stdin `03-import-planning-acceptance.mjs` | 四段全部 PASS：字段/树/coverage/拒绝覆盖；Runtime migration/空要求/笔记/旧工具不可用；规划 completed/resume/closed_compound；Host/SQLite 重启与原笔记重放 | `03-c1-import-planning-acceptance-final.log` |

未重跑：规划/metrics/migration/host/tree 根探针（根已验收且本轮未改那些生产路径）。未跑全仓、Skill、UI 走查、C2 删除。根已把导入探针旧工具断言改为实际 `mcp.authority_denied`；C1 未改生产拒绝语义。

## 最终名单

复用 B 实际 Runtime/管理/CLI 名单，C1 未增删公开工具。

## 留给 C2 的删除（不在本切片执行）

- 无职责 `ExecutionValidationApplication` / claim-run-evidence-review 写命令、availability/action projection 可执行协议、`DraftDialogue`、legacy Contract/Candidate/Dependency/Rewire 提交与决定、`continueWithEventWork` / `reopenCompletedEventWork` 入口胶水
- Native 导出/构造 hooks、Module lifecycle/commands/types/options 中已无当前职责的部分
- Goals 生命周期里只服务旧 Contract/Claim/Run/Risk 写协议的 hooks；保留历史查询、schema/migrations、项目删除只读守卫
- Governance 中只服务旧 Review/Clarification 写路径的部分；保留当前事件决定、有限 Goal Tree、provenance/history
- `validatePlanningProposalGraph` 旧 candidate/contract/dependency 任意 payload 分支（当前树只走 goal/relation）
- 无调用者的 contract-structure / proposal-coordination / decomposition-validation 写守卫
- 测试映射：`mcp.test.ts` / `v1.test.ts` / `runtime-skill-flow` 旧协议、`goal-event-document-history` 改为明确历史 fixture、仍引用已删 API 的测试
- 边界检查里仍强制存在 EX4 execution-validation 文件/构造的规则
- `GoalsPlanningEngine.metrics` 包装仍省略 `currentWork`，现仅旧 availability 消费；C2 删除该包装及其 availability 调用者，不得让 API 把当前工作一律当成 open。纯图 helper 与拓扑/影响检查在仍被使用处保留。

C1 可构建、导入 `source=migration` 与两处测试纠偏已验证。请根独立验收后立刻下发 C2。整个用户任务仍活动，不得标完成。
