# WI03 A 交回：日常闭环与 Runtime 身份注入

完成等级：4 的 **A 切片**。未宣称整个 03 完成。未改主 spec/progress/acceptance。未改主探针。未 commit/push。未动真实用户库。B/C 未开始。

## 用户现在能做什么

绑定项目后，Runtime 用不带 board/actor 的最短参数即可 `goal_list` / `goal_intent_create` / `goal_state` / `event_note` / `event_configure` / `event_report` / `event_agree` / `event_close` / `event_resume`。普通笔记无需登记类型。一批事实可附带可选进展；回执给冻结的本批 `events` 和现读 `work_status/gaps/cursors/progress_summary/completion_effect/can_record`。completed 与 cancelled 用同一个 `event_resume`，必须有原因。Web HTTP 同一套 report/resume。覆盖字段（含相同值、null、undefined）拒绝且无写入。

## 最终行为（A）

### 身份

普通 Runtime schema 去掉并运行时 `Object.hasOwn` 拒绝 `board_id` / `database_path` / `web_base_url` / `actor_id` / `actor_kind` / `runtime_actor_id`。Host 从已绑定 connection 注入 `board_id`，从稳定 Session 注入写操作者；指导/规划/回收站写入同样注入 actor。`context_*` 与 `project_delete` 保持独立合同。`user_confirmed` 只承担该工具自己的确认，不能批准树或约定。goal_id 仍须显式给出。

### report + progress

`event_report.progress?: {summary, next_step?, next_actor?}`。完整 `events`+规范化 progress 进入同一 `requestHash` 与同一事务。未知/错误类型 progress 在写入前拒绝。顺序：校验 → 事实 → `reassessAfterReports` → 可选 progress（`based_on_cursor` 为当时 Goal `maxGoalCursor`）。独立 `event_progress` 仍要调用方提供 `based_on_cursor`。

HTTP `event-report` 原样把 `progress` 交给 Module 解析；标量非法进展返回 400，整批无事实/进展/状态副作用。

回执：`events` 为首次成功冻结结果；`observed_event_cursor` / `goal_event_cursor` / `work_status` / `gaps` / `progress_summary` / `completion_effect` / `can_record` 每次从 `readState` 现读。重放不重复写事实。

### resume

`resumeWork` 统一 completed/cancelled。`reason` 必填。同键先 replay。open 新键 `event_resume.already_open`。持久 payload 仍按当时状态写 `completion_reopened` 或 `work_resumed`。Web 去掉 `resume_kind`。`continueWithEventWork` / `reopenCompletedEventWork` 入口胶水留给 B。

### Session

`event_note` / `event_report` / `event_resume` 记入当前 Session。`source_id = tool:idempotency_key` 幂等，普通重试不重复。Goal 主写成功而 Registry 失败时，主事实保留、`context_resolve` 报 unavailable；恢复目录后原键重试补记恰好一条 Session 活动与焦点，不新增 Goal 事实。不在 replay 时提前丢掉提取。

## 调用链

Runtime MCP → `assertMcpToolAllowed` → `injectRuntimeIdentity` → `dispatchMcpProjectTool` → Host capability → `GoalEventApplication`（report 叠 `readState`）→ Module `event-facts` / `event-state-effects`。

Web POST `/api/goals/:id/event-report|event-note|event-resume` → 同一 Application。

## 文件

- 合同：`packages/contracts/src/modules/goal-events.ts`、`goals.ts`
- Module：`event-facts.ts`、`event-facts-validation.ts`、`event-facts-mapping.ts`、`event-state.ts`、`event-state-effects.ts`
- Native：`goal-event-application.ts`、`goal-event-entry-capabilities.ts`、`http/events.ts`、`event-document-forms.ts`、`event-document-client.ts`
- MCP/Host：`tool-catalog.ts`、`goal-event-tools.ts`、`tool-schemas.ts`、`goal-event-commands.ts`、`tool-dispatch.ts`、`session-activity.ts`、`mcp-authority.ts`、`mcp-event-identity.ts`、`mcp-server.ts`
- 测试：`mcp-goal-events*.test.ts`、`goal-events-state.test.ts`、`goal-event-http.test.ts`、`mcp-session-activity.test.ts`、`goal-events-planning.test.ts`

## 验证

| 命令 | 结果 |
| --- | --- |
| `pnpm build` | EXIT 0 |
| `pnpm boundary:check` | EXIT 0；`03-a-boundary.log` errors `[]` |
| 定向 A 测试 6 个文件 | 50 pass / 0 fail / 0 skip；`03-a-tests.log` |
| stdin `03-web-acceptance.mjs` | PASS 非法标量 progress 400 无写入；completed/cancelled resume；`03-a-web.log` |
| `MOLIS_WORK_ACCEPT_INJECTED=1` stdin `03-session-repair-acceptance.mjs` | PASS 原键补记一条 Session 活动；`03-a-session-repair.log` |
| stdin `03-runtime-core-acceptance.mjs` | PASS 最短 Runtime 闭环/身份/原子 report/resume；`03-a-runtime-core.log` |

未跑：主 `03-runtime-acceptance.mjs` 退役断言（B/C）、全仓、Skill、UI 走查。根已独立跑过 01/02 保护探针，本组未重跑。

## 未完项（B/C）

- 旧 MCP/CLI/HTTP/Host 写入口退役（claim/select/draft/legacy proposal/ready/available/create_goal 及 relation/policy/risk/impact 写）
- 删除无新职责实现；旧测试映射或历史 fixture
- `demo-seed` 改为当前事件故事
- 不新增 CLI `event_*`

旧协议测试（如 `mcp.test.ts` 大量 claim/select、`runtime-skill-flow.test.ts`）未在 A 改写；Runtime 现已拒绝 board/actor 覆盖，那些夹具留给 B/C 映射，不在 A 重建旧工作流。
