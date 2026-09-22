# WI03 技术方案：MCP 收敛与日常记录闭环

完成等级：4 的本项切片。主裁决优先。权威是事件当前状态。不新增万能 JSON 工具，不保留旧工作协议，不新增 CLI 事件命令。

## 1. Runtime 身份与最终名单

普通 Runtime = `RUNTIME_MCP_TOOLS` 里除 `context_*` 与 `project_delete` 以外的全部工具。

Discovery：从 inputSchema 删除 `board_id` / `database_path` / `web_base_url` / `actor_id` / `actor_kind` / `runtime_actor_id`。`assertMcpToolAllowed` 对普通工具用 `Object.hasOwn` 拒绝上述字段（含相同值、`null`、`undefined`），不再用 `board_id === connection` 当通过条件。随后 `callV1Tool` 从已绑定 connection 注入 `board_id`，从稳定 Session 注入写操作者（`runtime:{runtime_id}:{session}`）；`goal_intent_create` 另注 `source_kind=runtime`；`goal_tree_propose` 另注 `submitted_session_id`。缺连接或 Session 不猜测，沿用现有 `context_resolve` / `refresh_required` 原键重试。

`context_*` 与 `project_delete` 维持现有独立合同：提前分支、不注入 board、保留 `actor_id` / `user_confirmed` / `delete_confirmed`。普通工具不可自填 `user_confirmed` / `authority` / `source_kind` 来批准树或约定；`project_guidance_*`、`planning_method_save`、`goal_trash` / `goal_restore` 的 `user_confirmed` 仍是各自确认协议。管理入口显式 board/actor 不变。`event_decide` / `goal_tree_decide` 仍仅管理/Web。

**Runtime 保留（按用途，无数量目标）**

| 用途 | 工具 |
| --- | --- |
| 项目选择 | `context_resolve/list_projects/reject_suggestion/bind/unbind/create_and_bind`，`project_delete` |
| 发现/创建/状态 | `goal_list`，`goal_intent_create`，`goal_state` |
| 日常与正式记录 | `event_note`（新），`event_configure/report/progress/list/read/concern/decision_request/cite_decision/agree/close/resume` |
| 结构 | `goal_tree_propose/read/check`（decide 不在 Runtime） |
| 规划 | `planning_methods/method_save/analyze_change/graph_check` |
| 指导 | `project_guidance_get/add/update` |
| 回收站 | `goal_trash/trash_list/restore` |

`snapshot` 退出 Runtime：它是全量板转储，不是当前工作入口。管理 MCP + CLI `snapshot` + Host `snapshotBoardCapability` 保留给诊断/备份；Web 继续直接 `store.snapshot()`，不经该工具。

**管理额外保留：** `initialize`，`import_v3`，`snapshot`，`event_decide`，`goal_tree_decide`，`active_goal`。`active_goal` 是产品当前 Goal 指针（Web `/api/goals/:id/active`、CLI `active-goal`、管理 MCP），不是 Claim；保留。

**CLI 保留：** `init`，`snapshot`，`import-v3`，`goal-tree-propose/read/check/decide`，`active-goal`。没有、也不新增 `event_note/report/resume` 等 CLI。

## 2. note / report+progress / resume

**`event_note`**：接现有 `recordNote`。Runtime 最短参数 `{goal_id, body, idempotency_key}`。无 types/config 可写、可读、重启重放。不经 report 伪装空类型。

**`event_report`**：仍先 `prepareReport` 全部事实再同一 `immediate` 写入。新增可选 `progress?: {summary, next_step?, next_actor?}`（无 `based_on_cursor`）。`requestHash` 纳入完整 `events` 与规范化 `progress`（缺省为 `null`）；同键不同 progress 走现有 hash 冲突。非法事实或非法 progress 在任何写入前拒绝，本批无副作用；其它已成功批次保留。顺序：校验 → 写事实 → `reassessAfterReports` → 若有 progress，用事务内 `maxGoalCursor` 作为 `based_on_cursor` 插入 `progress_summary`（不另起 `recordProgress` 幂等）。`event_progress` 保留为**仅进展**入口，仍要 `based_on_cursor`（过期语义）；不是 report 别名，也不要求 events。

回执不发明第二套完成算法。`GoalEventApplication.report` 在 `facts.report` 之后调用现有 `readState`：

```text
{
  replayed,
  events,                 // 首次成功冻结的本批事实
  observed_event_cursor,  // 当前 readState（板日志）
  goal_event_cursor,      // 当前 readState（本 Goal，含 reassess/progress）
  work_status, gaps, progress_summary, completion_effect, can_record
}
```

`gaps` 即 `readState.gaps`（`requirement_id/statement/current_verdict/human_decision_required`）。不附全量 requirements、latest_reports、agreement 副本、旧 projection。重放：`events` 为 remember 原结果；紧凑当前字段每次现读，表示「现在」，不是第一次写入的冻结完成结论。

**`event_resume`**：统一 `work_status∈{completed,cancelled}`。`reason` 必填。同键先 `replay`。新键且已 `open`：`event_resume.already_open`，无写入。持久 payload 按**当时**状态仍写 `completion_reopened` 或 `work_resumed`，不改历史行，不改 owner `source`（`continue`/`migration` 只读）。删除入口 glue：`continueWithEventWork`、`reopenCompletedEventWork`、HTTP `event-continue`、`resume_kind` 分支与表单 hidden。Web/管理走同一 `resumeWork`。无关 `event_note` 不重开。迁移 36 不重写。

## 3. 退役图（同职责同义入口一并退）

主快照 30 个 Host capability（含 continue/reopen 别名）全部退出注册。另外 5 个 candidate 也退：`commands.add-relation/set-policy/add-risk/set-risk-state`、`impacts.add`。它们写旧 relation/policy/risk/impact，不再参与事件完成判断；新结构只走 tree，人工门禁走 event 要求/Concern/决定。

链：MCP schema/catalog/dispatch/handler → Host `register` → NativeGoals 构造与 `web-request.ts` 传入的 execution/legacy 决定 adapter → CLI `command-dispatch.ts` → HTTP POST。只藏 discovery 不算完成。

**MCP/CLI 删除：** claim/select_goal/claim_renew/release/revoke_claim（CLI 为 `revoke`）/run_start/run_report/evidence_submit/correct/review_submit/revalidate/rework_request/complete；draft_dialogue_*；contract/candidate/dependency/rewire 旧提案；ready/available/contract/explain；`create_goal`/`create-goal`（唯一创建仍是 intent）；`relation-add`/`impact-add`/`policy-set`/`risk-add`/`risk-state`。

**HTTP 404（主探针路径 + 同义写）：** `/draft`、`/review-obligations/.../review`、`/evidence`、`/contract-proposals|candidates|rewires/.../decision`、`/event-continue`；以及 `/api/goals/:id/relations`、`/api/relations/:id/deactivate`、`/api/policy-bindings`（POST）、`/api/goals/:id/risks`、`/api/risks/:id/{update,state}`、`/api/impacts*` 写。保留：intent 创建、事件读写、统一 resume、tree decide、`/active`、archive/trash、`/api/project-guidance`。`/api/capsule` 的 `queryAvailable` 改为 `listGoals` 事件目录。旧 Web 表单 03 会 404；视觉清扫归 04。

**C 可删实现（B 之后确无生产调用者）：** `ExecutionValidationApplication` 及 ready/available/explain 组合、`DraftDialogueApplication`、legacy proposal 提交/决定应用、MCP/CLI `execution|draft-dialogue|legacy-proposal|availability` handlers、`continueWithEventWork`/`reopenCompleted*` 写 API 与 capability。`createGoal` 模块方法留给 `createIntent`；Host `createGoalCapability` 随 30 个快照一起卸。

**必须保留：** 事件/约定仓储与迁移 36；Execution **查询/表**（历史 Claim/Run/Evidence 阅读、`assertProjectHasNoActiveWork` 仍拦历史未结束行，不是工作入口）；journal/document history 映射；Artifacts 与文件阅读；真实 Runtime Session / 终端 / PTY；planning 方法库；tree 提交/检查/受保护决定。

`demo-seed.ts` 改为 `createIntent` + 约定/报告/笔记/收尾的当前事件故事，去掉 Claim/Run/Evidence/Review 种子。

## 4. 三个串行步骤

**A — 日常闭环与 Runtime 注入。** 允许：`mcp-authority.ts`、`mcp-event-identity.ts`、`mcp-server.ts` callV1Tool、`tool-catalog.ts` runtime schema、event tools/commands、`session-activity.ts`、`event-facts.ts` report hash/事务、`event-state-effects.ts` 统一 resume、`goal-event-application.ts` 紧凑回执、`http/events.ts` 与 resume 表单 glue、contracts 输入输出。不删旧工具名。验收：最短无 board/actor 的 note/report/resume；覆盖字段拒绝且无写入；progress 同键冲突；非法整批回滚；`goal_event_cursor` 覆盖 reassess 后状态；completed/cancelled 继续；open 新键拒绝；context/project_delete 仍按原合同。命令：改动包 `pnpm build`，定向 `mcp-goal-events*.test.ts`、`goal-events-state.test.ts`、`mcp-session-activity.test.ts`、`goal-event-http.test.ts`。

**B — 删除公共旧入口。** 允许：catalog/dispatch、Host `project-capabilities.ts`、CLI dispatch 与 help 最小失真、`web-request.ts` 停止传入 execution/legacy 决定、上列 HTTP 写路由、`demo-seed.ts`、capsule。验收：主 `03-retirement-acceptance.mjs` 的 30 个 capability `kernel.capability_missing`、所列 CLI unknown、所列 HTTP 404 且 `event-state` 200 无副作用；5 个 candidate 同样 missing（主 JSON 未列入时在 handoff 报告，不改主探针）。不宣称已有 CLI `event_*`。

**C — 删除无新职责实现并改测试。** 允许：上列已无调用者的 application/adapter/exports、受影响测试与历史 fixture。验收：build、`boundary:check`、A/B 定向回归；引用已删符号的测试改为新行为或历史只读 fixture。全仓/Skill/UI 归 04。包 exports 指 dist，改 source 后先 build 再测。

三步都完成后才交回 03。不以工具不显示代替 Host/CLI/HTTP 卸注册。

## 5. 测试映射（不 skip、不弱化、不造 hash）

| 现测 | 去向 |
| --- | --- |
| `mcp-session-activity` 的 select/run/evidence | 改为新写入：`event_note`/`event_report` 设置 Session `current_goal_id`（focus）；同幂等键只一条 session 事件（duplicate）；主写成功而 Registry 目录损坏时无新 session 事件且 `context_resolve` 报 unavailable（index failure）。提取测试改为忽略 `goal_state`、非法 JSON、有界嵌套 `event_id`。 |
| `mcp.test.ts` / `runtime-skill-flow.test.ts` / `command-entry-chain.test.ts` 的 claim/select/draft/available | 旧协议退役；需要工作闭环的改为 intent/state/note/report/agree/close/resume。 |
| `goal-events-state` 的 continue/reopen | 写路径改统一 `resumeWork`；`event_owner_continued` 只当历史阅读。 |
| `goal-event-migration` 的 `reopenCompletedEventWork` | 改 `resumeWork`；不改迁移 36 语义。 |
| `web.test.ts` 与 relation/safety e2e 的旧 POST | 断言 404 无副作用；结构改走已有 tree；风险/政策改 Concern/要求。 |
| 仍读 snapshot.claims/runs/risks 的历史断言 | 改为明确历史 fixture，不留生产写协议。 |

主 `03-runtime-acceptance.mjs` 在本计划字段上补紧凑回执断言；writer 不改该探针。

**请主即刻裁决后下发：** 本计划把 `event_progress` 留在 Runtime（仅进展 + `based_on_cursor`，与 report 可选 progress 分工）。若主要求 Runtime 只留 report 组合进展，A 改为 Runtime catalog/dispatch 去掉 `event_progress`，Web/管理 HTTP `event-progress` 仍保留。其余项按上文执行，不再问用户。

A 按根目录 spec 的技术方案主裁决执行：保留独立 `event_progress`；回执用顶层紧凑字段；普通 Runtime 全部去掉并拒绝项目/身份覆盖，指导/规划/回收站写入也注入 Host actor；Session 覆盖 note/report/resume 且重放不重复记活动。

## 6. C 实现（C1 先行，C2 删除留后）

C 分两刀。C1 只接通当前导入/规划/文案；C2 再删无职责旧实现。本节写 C1 的保留/删除职责和精确映射。不在 C1 重做 C2。

### C1 保留职责

- `import_v3`：同一 `immediate` 事务里 `initializeBoard` + 内部 `createGoal` + `addRelation` + `importLegacyCoverage` + `completeLegacyBoardImport`，并立刻走现有 `adoptOwner(source=migration)` 转换。
- 规划图：祖先、下游消费者、直接上游、拓扑、循环仍由 `goal-graph.ts` 计算。
- 规划方法库、事件采用、当前树 goal/relation 提案。
- 现有项目删除只读 Claim/Run 守卫不动。

### C1 导入字段映射（同一事务，不另写完成算法）

| 原 V3 | 当前写入 | 不写 |
| --- | --- | --- |
| `one_liner` | `title` 与 `outcome` | 合成验收承诺 |
| `covers` | `in_scope` | — |
| `inputs` / `outputs` | `required_inputs` / `promised_outputs` | — |
| `root_goal.constraints` | 每个导入 Goal 的 `constraints` | — |
| `parent` | `addRelation` `part_of`（V3 无 depends_on 字段，不发明依赖） | 旧 `closed_leaf` / `closed_compound` |
| coverage ledger | 现有 `importLegacyCoverage` disposition | — |
| source identity | 现有 `completeLegacyBoardImport` | 旧接受/领取 |
| — | `definition_state=draft`，`decomposition_state=abstract`，`acceptance_criteria=[]`（与 `createIntent` 相同） | 假 human_decision 验收条目 |
| — | `why` 只作迁入出处说明；`business_logic=""` | 「补全后才能接受和领取」 |
| — | 现有 `adoptOwner(source=migration)`：owner=`event_work`，work_status=`open`，有 outcome 则写当前约定；`goal_state.intent.source_kind=migration`，不是新 Web 意图 | 合成 `intent_created`/`source_kind=web`、假验收要求、迁移 36 后再写一套完成算法 |

导入后立即、以及重新打开应用后，可用当前 `goal_state` / `event_note`。覆盖保护仍是目标 Board 已存在则拒绝。四份 `tests/fixtures/goal-event-v35/*.sql` 原事实不动。

### C1 规划当前状态

- `reusable_open_goal_ids`：相关、未回收、当前 `goal_event_work_status=open`（无行视为 open）。**不**按 `decomposition_state` 叶子种类过滤。
- `planningMetrics.unlock_count`：可达且当前不是 `completed`。cancelled 不算可复用 open，但仍是未完成。
- 祖先/下游/相邻上游/拓扑/循环算法不变。
- `GoalsPlanningEngine.analyzeChange` 从同一库读取 `goal_event_work_status`，不另造完成投影。
- 旧 candidate/contract/dependency 任意 payload 分支本刀不删（C2）。

### C1 文案

- `planning_methods`：完整阅读方法正文只适用于实际可选规划，不是每次 create 的门禁。
- method-packs 持续运行：保留专业 recurring-operation 判断，改成当前笔记/报告/意图/树，不再教 Evidence/Candidate 操作。
- `normalizeProposalSource` 的 source_refs 恢复示例改为已保存 Goal 事件 `event_id`；非空来源要求保留。

### C2 删除与保留（C1 已验收，不重做导入/规划）

自上而下：先卸 Host 构造与 Native 应用，再删 Module 无职责写实现与合同，再用编译/定向回归清剩余引用。不保留可调用写方法去喂旧测试。不造 no-op adapter。

**当前文档视图（纠正）：** 禁止用空 `GoalActionProjection`/`GoalWorkStateView` 当兼容层。删除 `current-work-view.ts`。`document-collection`/`document-projection` 每个 Goal **读一次** `eventWork.readState`（生产调用者必给，非 optional phantom），用已有 `eventDirectoryPresentation` 的 status/label/summary；回收站/归档用 Goal 自己的 `trashed_at`/`archived_at`。历史 Claim/Run/Review **记录**仍可从 snapshot 阅读。不造 action_token、空 actions、fulfillment 完成算法。

**Host/Native 删除：** `ExecutionValidationApplication` 及 claim/run/evidence/review 写命令；`DraftDialogueApplication`；legacy Contract/Candidate/Rewire 提交与决定；`GoalAvailability` / ready/available/explain 可执行协议；action projection 可执行协议；`continueWithEventWork` / `reopenCompletedEventWork` 入口胶水；`GoalsPlanningEngine.metrics` 包装及其唯一生产消费者 `goal-availability`。Goal Tree 决定不再挂 executionValidation/legacy 写路径。

**Module 删除：** Execution/Evidence 写 lifecycle（claim/run/submit/correct）；Goals 仅服务旧 accepted-contract/risk/policy/rewire 的写命令与 lifecycle hooks（completion gate、revalidation run、action token、risk authorize、contract revision 写）；Governance review/clarification **写**路径；planning `contract-structure` / `proposal-coordination` / `decomposition-validation` 无当前调用者的写守卫；`validatePlanningProposalGraph` 的 candidate/contract/dependency 任意 payload 分支。

**必须保留及实际调用者：**
- Execution/Evidence **query/storage/schema/migrations**；`assertProjectHasNoActiveWork` 读历史未结束 Claim/Run（项目删除守卫，不改设计）。
- Governance：`eventDecisions`、有限 Goal Tree records/decisions/provenance/history 读、必要 schema/migrations。
- Goals：`createIntent`/`createGoal`/`addRelation`（intent、当前树、import）；事件 note/report/agree/close/resume；archive/trash/restore；guidance；planning methods + `analyzeChange` 当前 work_status；图完整性 `validatePlanningGraph`；历史升级。
- 导入仍 `adoptOwner(source=migration)`，不发明验收承诺。
- 真实 Runtime Session / 终端 / PTY / 文件服务。
- 历史 Review/Claim/Run **记录类型与 journal 映射**可只读复用；不可调用退役写 API。

**测试：** `goal-event-document-history` 改为明确历史 fixture，保留有界 journal 与 self-review 标签；Host withScope 保留；四份 v35 SQL 原事实不动。旧协议测试删除或改当前 API，在 `c-handoff.md` 逐文件映射。

### C2a Goals 模块删除映射（本批只改 Goals 合同与 `modules/goals`）

C2 串行第一刀。不改 Native/Host、Execution/Evidence/Governance、测试或文档。下游暂时编不过是预期，留给 C2b/C2c。

| 删除 | 去向 |
| --- | --- |
| `lifecycle-compound.ts` / `GoalCompoundAncestorCommands` | 整文件删除。旧祖先 reopen 对事件归属 Goal 全部跳过，当前创建/树/导入/migration36 无职责。不抽成新类。 |
| `lifecycle-completion.ts` / `lifecycle-revalidation.ts` / `lifecycle-revisions.ts` / `lifecycle-reasons.ts` | 整文件删除。Lifecycle 只留 archive/trash/list。 |
| `updateDraftGoal` / `setPolicy` / 旧 accept/revalidate/risk-policy/rewire 写实现 | 从 `goal-commands` 与 Goals 公开合同拿掉。`GoalsCommandApi` 已收窄，实现与 exclusive 类型一并删。 |
| archive/trash 上的祖先 hook | 去掉 reopen/reconcile。保留回收站记录、关系暂停/恢复、active goal、`blockingWork` 只读守卫、同键回执/事务、`appendEvent` 游标。 |
| `addRelation`/`deactivateRelation`/`applyConfirmedRelations` 祖先写 | 去掉 compound 重开与 `coverage_contract_revisions` 现写。关系事实、图校验、事件仍在。 |
| `GoalsPlanningEngine.metrics` / `.contracts` / `.proposals` | 删除包装与 `contract-structure` / `proposal-coordination` / `decomposition-validation` / `decomposition-coverage`。根 `planningMetrics` / `analyzeGoalChangeImpact` 图 helper 保留。 |
| `validatePlanningProposalGraph` 的 candidate/contract/dependency 任意 payload | 只走当前有限 `goal` / `relation`。循环/拓扑/祖先/依赖/当前 work_status 不变。 |
| `continueWithEventWork` / `reopenCompletedEventWork` | 从事件合同与实现删除。当前继续只走 `resumeWork(reason)`；导入/迁移仍 `adoptOwner`。`event_owner_continued` 只读解码与 schema 不动。 |
| `validateGoalInput` 的 accepted/closed_leaf 完整合同门禁 | 删除。创建仍要求标题；不合成验收条目。 |

**暂时留在 Goals 合同（C2b 再收）：** `GoalLifecycleReason`、`GoalRevisionDependentTransition`，因 Execution 合同仍引用。不为此保留可调用写方法。

### C2b Execution / Evidence / Governance（本批只改这三模块与对应合同）

C2a 已验收。不改 Native/Host/测试。主复核纠正：repository 也按真实当前调用者判断；无当前职责的旧 insert/update/complete/waive 写方法须删除，不能以“不经 commands 出口”作为保留理由。保留真实 schema/migrations/历史读与当前树事务，不造 no-op commands。

| 删除 | 保留 |
| --- | --- |
| Execution `lifecycle.ts`、`contract-revision.ts`、`impact-policy.ts`；`ExecutionCommandApi` 与 exclusive 写输入/回执；`ExecutionImpactPolicyApi`；repository `insertClaim`/`updateClaim*`/`insertRun`/`updateRun`/`completeRun`/`abandonActiveRuns`；无调用者的 `ExecutionEventInput` | Claim/Run **记录类型**、`ExecutionQueryApi`（含历史 `latestCompletedWorkRunEventSeq` 与 active claim/run 查询）、schema/migrations、`mapExecutionClaim`/`mapExecutionRun` |
| Evidence `lifecycle.ts`、`coverage.ts` 旧完成投影；submit/correct/attach 写 API；`hasPassingEvidence` / `uncoveredCriterionIds` 门禁；repository `insertEvidence`/`insertCorrection`/`attachReview`、`StoredEvidenceInput`、`latestCriterionReworkSeq`/`passingEvidenceSubmissions`；无调用者的 `EvidenceEventInput` | Evidence/Correction **记录**、list/get、`getReviewReference`、`getProjectReferenceSource`、locator/文件阅读、schema/migrations、`mapEvidence*` |
| Governance Review 写、Clarification 写、Contract/Candidate/Rewire 写 store 与 state 转移；repository `insertReview*`/`updateReviewObligation`/`waivePendingObligationsForRevision`、`StoredReview*`、无调用者的 `passingReviewActorCountAfterEventSeq`/`latestCompletedWorkRunEventSeq` | `eventDecisions`、有限 Goal Tree records/check/decide/submit、`appendEvent`/`immediate`/`eventCursor`、`materializeAtomically`、provenance 当前树来源与可信决定、历史 Review/Candidate/Rewire/**clarification 读**、schema/migrations、legacy proposal 展示 |
| C2a 留给 Execution 的 `GoalLifecycleReason` / `GoalRevisionDependentTransition`，以及仅承载它们的 `GoalRevalidation*` / `GoalCompletionResult` | 历史 `GoalContractRevisionRecord.effect` 仍用 `GoalContractRevisionEffect` |

`GovernanceRecordsApi` 收成当前树写入 + 幂等 execute；历史 Candidate/Contract/Rewire 只走 query。Clarification 公开口只留 listSessions/listTurns。
