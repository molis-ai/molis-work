# WI03 B 交回：删除公共旧入口

完成等级：4 的 **B 切片**。未宣称整个 03 完成。未改主 spec/progress/acceptance。未改主探针。未 commit/push。未动真实用户库。C 未开始。

## 用户现在能做什么

绑定项目后，Runtime 与管理入口的 **discovery、dispatch、Host、CLI、HTTP** 都只认当前事件/树/指导协议。旧 Claim/select/Run/Evidence/Review/draft/legacy proposal/ready/available/contract/explain/create_goal 以及 relation/policy/risk/impact 写入口既不出现在名单里，也不能经 dispatch、Host capability、CLI 或 HTTP 执行。Capsule 读当前事件目录。Demo 用 intent/约定/报告/笔记/收尾讲当前故事。

回收站 `goal_trash` / `goal_restore` / `goal_trash_list` 与其它普通工具一样是扁平参数：Runtime 无 board/actor、无 `payload` 包裹；嵌套 `payload.actor_id` 在写入前被拒绝且无副作用；实际写入使用 Host 注入的 Session 操作者。

## 最终公开接口

### Runtime MCP（`RUNTIME_MCP_TOOLS`）

| 用途 | 工具 |
| --- | --- |
| 项目选择 | `context_resolve/list_projects/reject_suggestion/bind/unbind/create_and_bind`，`project_delete` |
| 发现/创建/状态 | `goal_list`，`goal_intent_create`，`goal_state` |
| 日常与正式记录 | `event_note`，`event_configure/report/progress/list/read/concern/decision_request/cite_decision/agree/close/resume` |
| 结构 | `goal_tree_propose/read/check`（decide 不在 Runtime） |
| 规划 | `planning_methods/method_save/analyze_change/graph_check` |
| 指导 | `project_guidance_get/add/update` |
| 回收站 | `goal_trash/trash_list/restore`（扁平；`user_confirmed` 仅这组确认） |

普通 Runtime schema 去掉并拒绝 `board_id` / `database_path` / `web_base_url` / `actor_id` / `actor_kind` / `runtime_actor_id` / `payload`。`snapshot` 不在 Runtime。

### 管理额外保留

`initialize`，`import_v3`，`snapshot`，`event_decide`，`goal_tree_decide`，`active_goal`。管理旧名字同样 unknown。管理回收站使用同一扁平表单，显式 board/actor。

### CLI 保留

`init`，`snapshot`，`import-v3`，`goal-tree-propose/read/check/decide`，`active-goal`。无 CLI `event_*`。

### 已退役的实际公开入口（无数量目标，按真实注册）

Host 30 个快照 + 5 个 candidate 全部 `kernel.capability_missing`：claim/renew/select/release/revoke、start-run/report-run/submit-evidence/correct-evidence/submit-review/request-rework、draft-dialogue 三个、legacy contract/candidate/dependency/rewire、revalidate/evaluate-completion、`local-host.goals.create`、`local-host.goals.contract`、ready/available/explain/available-with-projections、events.continue/reopen-completed、commands.add-relation/set-policy/add-risk/set-risk-state、impacts.add。

CLI unknown：create-goal、draft-dialogue-*、claim/select-goal/release/revoke、run-start/run-report、evidence-submit/review-submit、revalidate/complete、contract/candidate/dependency/rewire、ready/available/contract/explain、relation-add/impact-add/policy-set/risk-add/risk-state。

HTTP 404 且无副作用：`/draft`、`/review-obligations/.../review`、`/evidence`、contract/candidate/rewire 决定、`/event-continue`、relations 写、policy-bindings POST、risks 写、impacts 写。`event-state` 仍 200。

已删除无其它职责的入口文件：MCP/CLI execution/draft/legacy/availability handlers、CLI `goal-commands.ts`、HTTP `draft.ts`/`verification.ts`/`relations.ts`/`risk-impact.ts`/`input.ts`。

## 调用链选择

- Runtime MCP → `assertMcpToolAllowed`（含 `payload` 拒绝）→ `injectRuntimeIdentity`（顶层 actor/board）→ `dispatchMcpProjectTool` → 当前 Host capability → Application。
- 回收站：扁平 `goal_id/user_confirmed/reason/idempotency_key`；handler 读顶层字段，不再走 `mcpBoardPayload`。
- Web 当前事件 POST 仍进 `GoalEventApplication`；不再传入 execution/legacy 决定 adapter。
- Capsule `GET /api/capsule`：`goalEvents.listGoals({ limit: 100 })` 作为目录顺序，不再 `queryAvailable`。
- Demo：全部 `createIntent`（含 parent/depends）；CORE 先配置类型，再 `setAgreement` 写入绑定 `lifecycle` 的 `CORE-C1`，再 report/note/close。

## 测试映射

| 现测 | 去向 |
| --- | --- |
| `command-entry-chain` 的 CLI select/MCP run/evidence | 改为 Runtime intent/configure/agree/report/close + CLI snapshot；CLI `select-goal` unknown |
| `host-entry-consistency` 的 available 组合读 | `goal_list` 单次目录；trash 改扁平线并断言 journal `goal.trashed` 的 Host actor `runtime:entry:session` |
| `local-host` 三入口 create-goal | CLI init/snapshot + 管理 `goal_intent_create` + Host `createGoalIntentCapability` 同键重放；CLI `create-goal` unknown |
| `goal-command-wire` relation/risk | 改为 guidance add 的真实 `entry` + `readProjectGuidance` 持久化；graph_check 的 `issues=[]` |
| `goal-event-http` `/draft` 409/200 | 事件 Goal 与未转交草稿 POST `/draft` 均为 404 无写入 |
| `capsule.test` AvailableGoal | 第二参改为 `{ goal_id }` 事件目录项 |
| `mcp-goal-events*` Runtime `snapshot` | 改为 Host `snapshotBoardCapability`（snapshot 已退出 Runtime） |
| `mcp-session-activity` | 保持 A 的 note/report 焦点与 source_id 补记；去掉旧 select 特例 |
| `goal-event-document-history` 依赖 demo Review | **C**：demo 不再种 Claim/Review |

## 验证

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | EXIT 0；`03-b-build.log` |
| `pnpm boundary:check` | EXIT 0；`errors: []`；`03-b-boundary.log` |
| A + B 定向测试 | 67 pass / 1 fail：失败是 `goal-event-document-history` 仍找 demo Review（C）；其余 A 回归与入口/capsule/Host 测试通过；`03-b-tests.log` |
| demo 实际种子 | PASS：全部未回收 Goal 为 event-owned；CORE 完成且 `CORE-C1` 绑定 `lifecycle`；claims/runs/evidence/reviews 均为 0；`03-b-demo.log` |
| stdin `03-retirement-acceptance.mjs` | PASS 35 个 Host missing + CLI unknown + HTTP 404；`03-b-retirement.log` |
| stdin `03-runtime-acceptance.mjs` | PASS 含退役 discovery/dispatch、intent 立即写 Session 焦点与一条 create 活动、note/report/resume；`03-b-runtime.log` |
| stdin `03-auxiliary-identity-acceptance.mjs` | PASS 嵌套 payload 伪造 actor 拒绝无副作用；扁平 trash/restore 持久化 `runtime:aux:session`；`03-b-auxiliary.log` |
| stdin `03-tree-regression-acceptance.mjs` | PASS 当前树授权与结构；`03-b-tree.log` |

未跑：全仓、Skill、UI 走查（04）。未改主探针。

## 保留给 C 的具体职责

1. 删除已无生产调用者的 Module/Application：`ExecutionValidationApplication` 写命令、`DraftDialogueApplication`、legacy proposal 提交/决定、`continueWithEventWork` / `reopenCompletedEventWork` 写 API。
2. 能力对象仍从 plugin 导出但已不注册；C 删除定义/exports，或只留给历史只读。
3. `setTrashedWithWorkState` 仍读 `executionValidation.query.getGoalWorkState`（删除保护，不是工作入口）；C 按当前事件状态改或标明只读。
4. `import_v3` 导入后的 Goal 不得成为第二套可执行旧协议；核对待转换或历史只读，不另写完成算法。
5. 测试：`mcp.test.ts` / `v1.test.ts` / `runtime-skill-flow` / `web.test.ts` 旧 POST、`goal-event-document-history` 与其它仍假设 demo Claim/Review 的夹具。
6. 包内仍导出的 `createMcpExecutionValidationAdapter` / `createCliExecutionValidationAdapter` 无生产接线；C 删除或改为历史只读。
7. 公开文案：`project_delete` 描述仍写 Claim/Run；规划/树工具对历史 Contract 的只读映射可保留，但不得再当执行门禁。
8. 全仓与 Skill/UI 归 04。

规划方法库仍保留且有用。当前 `planning_methods` 不经 Host ready/available。若 C 发现方法正文仍引导旧角色门禁，按当前用途改写或退役，不当兼容借口。
