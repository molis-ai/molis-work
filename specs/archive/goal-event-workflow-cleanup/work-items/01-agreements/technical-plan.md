# WI01 技术方案：约定、人工验收与版本演化

完成等级：4（内部完整）的本项切片。不兼容旧入口、不保留别名。权威是当前约定，不是 `definition_state`。

## 1. 两个版本与 typed 变更

| 版本 | 职责 | 写入入口 |
| --- | --- | --- |
| `config_version` | 类型登记与新版本、当前采用规划、类型-要求绑定 | `configure` |
| `agreement_version` | 当前结果文本、当前要求集合（新增/修订/退休）、`human_decision_required` | `setAgreement` |

二者各比各的当前值，禁止互相当缺省：`setAgreement` / `submitClosure` 的 `expected_agreement_version` 与 `expected_config_version` 均为必填整数；缺一、非整数或与当前不符，在任何写入前拒绝。`configure` 的 `expected_version` 只表示配置版本。删掉今日 `setAgreement` 用 config 版本顶替约定版本、以及 close 省略约定版本仍放行的分支。

`configure` 去掉自由文本 `new_requirements`。规划默认要求仍用已有的 `adopt_default_requirement_ids`：一旦带上，同请求必须带 `expected_agreement_version`，并在同一事务里走与 `setAgreement` 相同的「新增当前要求」写入且约定版本 +1。Web 类型表单「同时加要求」、独立「增加完成要求」改为 `POST /event-agree`。

约定请求的唯一形状（未知键拒绝）：

```text
SetGoalEventAgreementInput {
  expected_agreement_version, expected_config_version,   // 必填
  outcome?,                                              // 省略=结果不变
  new_requirements?: [{ requirement_id, statement, bound_type_id?, human_decision_required?, source? }]
  revise_requirements?: [{ requirement_id, statement?, human_decision_required? }]  // 至少改一项
  retire_requirement_ids?: string[]
  cited_decision_id?                                     // Runtime 保护性变更必填
}
```

`human_decision_required` 默认 `false`。规范化后做 canonical JSON（键排序、数组排序、默认值物化），作为请求、决定与引用的唯一比较值。不新增万能 JSON 工具，不把 `authorize_action` 或结论原文当成这份变更的授权。

## 2. 当前要求持久化与过期

`goal_event_requirements` 身份行保留，不删历史。迁移 35 增列：

- `human_decision_required INTEGER NOT NULL DEFAULT 0`
- `current_status TEXT NOT NULL DEFAULT 'active'`（`active` | `retired`）
- `revision INTEGER NOT NULL DEFAULT 1`
- `support_valid_after_seq INTEGER NOT NULL DEFAULT 0`

当前状态读：`readCurrentRequirements` 只返回 `active`（外加仍在用的 acceptance criterion）。`current_report` / `user_conclusion` 只取 `journal_seq > support_valid_after_seq` 的最新一条；更早判断留在 `goal_work_event_judgments` / `goal_event_requirement_conclusions`。修订/退休的 typed change 写入 `agreement_set` payload，先前约定事件与报告保留，不另建修订总表。

过期规则（更换结果影响全部要求；单要求修订不动其它要求）：

| 变化 | 过期对象 |
| --- | --- |
| 非空结果被换成不同文本 | 已生效完成退出（`supersedeAppliedClosures` + work_status=open / unmet）；全部当前要求的支持与人工结论 |
| 修订某要求的 statement 或人工门禁 | 仅该要求的支持与人工结论（抬高其 `support_valid_after_seq`） |
| 退休某要求 | 它退出当前判断与完成检查；历史行与旧报告仍在 |
| 仅新增要求 / 仅类型 v2 / 规划退出当前使用 | 已有要求的支持与结论不变 |

`currently_satisfied`：`human_decision_required=true` 必须有仍有效的 `user_conclusion.verdict=accepted`，且之后无更新的 `unknown` 或 `contradicts`；`false` 则当前有效报告为 `supports` 即可。禁止从 statement 推断门禁。

## 3. 保护性变更的最小授权

保护性（Runtime 不得自写）：(1) 当前非空结果换成不同文本；(2) 退休当前要求；(3) `human_decision_required` true→false。
不保护：空结果首次补全、只追加要求、只改 statement、false→true、授权范围内的普通备注。请求中任一段保护，则整份 change 走保护路径。

接法沿用现有 Governance + Host 用户入口，不造对话确认：

1. Runtime `requestDecision` 增加必填 `purpose`（`suggestion` | `requirement_acceptance` | `action` | `agreement_change`）与可选 `proposed_change`（即上一节 canonical 对象）。`agreement_change` 必须带 `proposed_change`，并保存请求时原结果/受影响要求承诺。空 scope 仍拒绝。批准时比较这份原文，相关变过则整笔拒绝。
2. 用户 Web `POST /event-agree` 或管理 `event_decide`：可信 `actor_kind=user` + `authority_source=web|management`，直接应用 typed change，不伪造 Runtime 确认。
3. Runtime 保护性 `setAgreement` 必须带 `cited_decision_id`。该决定须含效果 `authorize_agreement_change`，且 `authorized_change` 与本次 change 字节级 canonical 相等、同 Goal、未被更新决定覆盖、其上记录的约定/配置版本仍是当前值。`authorize_action`（含 complete）、`accepts_requirements`、结论文本、另一份 delta/另一 Goal 的批准一律不够。
4. 用户回答带 `proposed_change` 的请求时，`authorized_change` 从请求拷贝，调用者不能加宽。同范围、change 仍相等的当前决定可被再次 `cited_decision_id` 引用，不重复审批。保护性变更的应用入口只有 `setAgreement.cited_decision_id`，`citeDecision` 不第二套落地。

完成门禁补丁：pending `purpose=requirement_acceptance`（且 `requirement_ids` 与当前有效要求相交）或 `purpose=action` 且 `scope.action=complete` 阻塞 `event_close`；`suggestion` 不阻塞。拒绝不能变通过。

## 4. Web / MCP 输入输出

MCP：`additionalProperties: false` + 现有 `rejectUnknown`。`GOAL_EVENT_NEW_REQUIREMENT` 增加 `human_decision_required`。`event_agree` / `event_close` 的两个 expected 版本改为 required。`event_decision_request` 增加 `purpose`、`proposed_change`；`event_decide` 增加 `authorized_change`，仍仅 management。`event_configure` 去掉 `new_requirements`，有 `adopt_default_requirement_ids` 时才要求 `expected_agreement_version`。

HTTP：对 `event-agree` / `event-configure` / `event-close` / `event-decision` / `event-decision-request` 同样拒绝未知顶层键；嵌套对象在 Module `assertAllowedKeys` 拒绝（修 F2 静默丢弃）。Web 直接改约定不需要 `cited_decision_id`。约定变更表单用互斥、初始未选的批准/拒绝，业务选项只作背景；展示请求时原结果→拟改结果、原要求→拟改要求、取消人工与退休原文。要求表单增加「需要用户验收」。约定表单列出当前要求的修订/退休与错误。收尾表单已有双版本 hidden，保持必填提交。

## 5. 类型 v2 ≠ 取消当前要求

`assertAdditiveTypeVersion` 改为：同 `type_id`、版本必须 `latest+1`、禁止改已发布的同一 version。新版本可改 name/purpose/semantic_family，可增删字段、改字段 name/purpose/format/required。旧报告继续 `getType(type_id, 事件上的 type_version)` 读当时字段；新报告按所报版本校验。类型写入不得修改要求行、不得退休要求、不得改 `human_decision_required`。

`normalizeAdoptedPlanning` 允许当前列表不再包含旧采用；历史配置事件与 `goal_event_config_versions.adopted_planning_json` 不改写。

## 6. 文件、迁移、验收

规范化/比较/保护判定放进现有 `event-state-authorization.ts`；`setAgreement` 仍在 `event-state-effects.ts`；要求行列更新走 `event-facts-config` / repository。不为字段再拆一层编排器。

预计改动：`packages/contracts/src/modules/{goal-events,goal-event-state}.ts`；`modules/goals/src/event-{facts,facts-validation,facts-config,facts-schema,facts-repository,state-effects,state-authorization,state-completion,state-schema,state-repository,system-payload}.ts` 及 exports；`modules/governance-collaboration/src/event-decisions.ts`（trusted decision 增 `change_json`）；`plugins/native/goals/src/{goal-event-application,http/events,http/event-decisions,event-document-forms,event-document-client,event-document-ui}.ts`；`apps/mcp/src/{tool-schemas,goal-event-tools,goal-event-commands}.ts`；`apps/local-host/src/project-migrations.ts`。迁移 35：上列 ALTER + 旧行 `human_decision_required=0` / `current_status=active` / `support_valid_after_seq=0`；请求表另增 `commitment_json`。本项不碰用户正在使用的数据库；测试用临时 SQLite。

执行阶段定向（生产公共入口，断言持久状态与副作用）：`tests/goal-events.test.ts`、`goal-events-state.test.ts`、`mcp-goal-events-state.test.ts`、`goal-event-http.test.ts`，覆盖 WI01 spec 必须证明 1–7。反例须与审查相反：Draft 新意图替换非空结果无授权拒绝且无写入；授权后旧完成退出；close 缺/旧约定版本拒绝；人工要求往返且未知键失败；pending 验收挡住完成、suggestion 不挡；类型 v2 改字段而 v1 事件仍完整；修订只过期被改要求。全仓与 UI 截图留给 04 / 主。

## 7. 主裁决落地后的实际结果

已按主审阅裁决实现。独立验收后的三项修正如下。

- 已有 statement 任意实改、退休、true→false、替换非空结果：保护性。false→true 直接提高门禁并过期该要求旧支持/结论。
- 更换非空 outcome：全部当前要求的支持和人工结论过期，历史判断保留；仅修订某一要求时才保留其它要求的支持。过期后不能立刻用旧证明重新完成。
- `agreement_change` 请求在 `goal_event_decision_requests.commitment_json` 保存请求时的原结果和受影响要求（含绑定/人工责任）。批准前与当前实际承诺比较，相关变过则拒绝且无可信决定写入。无关类型发布不使请求失效。没有承诺快照时不以「同 ID 仍存在」兜底。
- 约定变更表单使用互斥、初始未选的批准/拒绝；业务选项只作背景。审阅展示原结果→拟改结果、原要求→拟改要求、取消人工与退休原文。过期请求页面提示刷新或重新请求，后端同时拒绝批准。
- 授权比较业务 delta + 请求时承诺；应用 CAS 仍双版本必填。空操作拒绝。
- 拆出 `event-agreement-change.ts`、`event-state-agreement.ts`、`event-facts-requirements.ts`。新库首次安装补记迁移 34/35；升级路径 `ensureGoalEventAgreementChangeColumns` 增 `commitment_json`。
- 修正后定向 52 pass / 0 fail。不把本项或总整改标为主验收通过。详见 `handoff.md`。
