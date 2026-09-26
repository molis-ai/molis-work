import type { ActionHandlerBinding, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalEventClosureKinds, goalEventConcernActions, goalEventDecisionPurposes,
  type ConfigureGoalEventsApplicationInput, type ConfigureGoalEventsResult, type ReportGoalEventsInput, type ReportGoalEventsResult,
  type RecordGoalProgressSummaryInput, type GoalEventProgressResult, type ApplyGoalConcernInput, type GoalEventConcernResult,
  type RequestGoalDecisionInput, type GoalEventDecisionRequestResult, type CiteGoalDecisionInput, type GoalEventDecisionResult,
  type SetGoalEventAgreementInput, type GoalEventAgreementResult, type SubmitGoalEventClosureInput, type GoalEventClosureResult,
  type ResumeGoalEventWorkInput, type GoalEventResumeResult } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalEventApplication } from "./goal-event-application.js";
import { goalAction as action, goalActor } from "./action-contract.js";
import { text, identifier, count, boolean, object, array, enumeration, nullable, goalConfigSchema, goalStateSchema, goalReportEventSchema,
  eventType, binding, scope, artifactSource, progress, concern, option, change, decisionRequest, decision, reason, closure, judgment, agreement } from "./event-action-schemas.js";

type BusinessInput<Input> = Omit<Input, "board_id" | "actor_id" | "actor_kind">;
const version = { type: "integer", minimum: 1 };
const base = { goal_id: identifier, idempotency_key: identifier };
const required = Object.keys(base);
const partialScope = { ...scope, required: [] };
const mutation = { event_id: text, observed_event_cursor: count, replayed: boolean, recorded: { const: true } };
export const goalProgressResultSchema = object({ ...mutation, progress_summary: progress });
const changeProperties = change.properties as Record<string, ActionSchema>;
const stateProperties = goalStateSchema.properties as Record<string, ActionSchema>;

/** Work operations retain the original domain's transaction and user-decision checks. */
export const goalsEventActions = {
  configure: action<BusinessInput<ConfigureGoalEventsApplicationInput>, ConfigureGoalEventsResult>("goals.events.configure", "配置目标记录", "登记当前目标的事件类型、规划及要求绑定；保留规划来源版本，按 expected_version 比较配置版本", "command",
    object({ ...base, expected_version: count, expected_agreement_version: count,
      types: array({ ...eventType, properties: { ...eventType.properties as Record<string, ActionSchema>, version }, required: ["type_id", "version", "name", "purpose", "fields"] }),
      adopted_planning: array(object({ method_id: identifier, version, source: enumeration(["built_in", "personal", "project"]) }, ["method_id"])),
      adopt_default_requirement_ids: array(text), requirement_bindings: array(binding) }, [...required, "expected_version"]),
    object({ config: goalConfigSchema, event_id: text, observed_event_cursor: count, replayed: boolean })),
  report: action<BusinessInput<ReportGoalEventsInput>, ReportGoalEventsResult>("goals.events.report", "报告目标工作", "按已登记类型一次保存多条工作事实，可附进展；整批校验后保存，报告不代替用户决定或收尾", "command",
    object({ ...base, events: { type: "array", minItems: 1, items: object({ type_id: identifier, type_version: version, title: identifier,
      fields: { type: "object", additionalProperties: text }, judgments: array(judgment) }, ["type_id", "type_version", "title", "fields"]) },
      progress: object({ summary: identifier, next_step: text, next_actor: text }, ["summary"]) }, [...required, "events"]),
    object({ events: array(goalReportEventSchema), observed_event_cursor: count, replayed: boolean, goal_event_cursor: count,
      work_status: stateProperties.work_status!, gaps: stateProperties.gaps!, progress_summary: nullable(progress), completion_effect: boolean, can_record: boolean })),
  progress: action<BusinessInput<RecordGoalProgressSummaryInput>, GoalEventProgressResult>("goals.progress.record", "记录目标进展", "记录基于当前目标事件游标的进展与下一步；事务内核对预期 Goal 版本。可附成果引用，引用不代表成果内容已验证", "command",
    object({ ...base, based_on_cursor: count, summary: identifier, next_step: text, next_actor: text,
      source: artifactSource, expected_goal_cursor: count, expected_contract_revision: count }, [...required, "based_on_cursor", "summary"]),
    goalProgressResultSchema),
  concern: action<BusinessInput<ApplyGoalConcernInput>, GoalEventConcernResult>("goals.concerns.apply", "处理目标问题", "提出问题须填标题、说明和影响范围；解决/撤销须引用问题后的实际事件或用户决定，接受风险须引用适用的用户决定", "command",
    object({ ...base, action: enumeration(goalEventConcernActions), concern_id: text, title: text, statement: text, scope: partialScope,
      blocks_closure: boolean, reason: text, supporting_event_ids: array(text), cited_decision_id: text }, [...required, "action"]),
    object({ ...mutation, concern })),
  requestDecision: action<BusinessInput<RequestGoalDecisionInput>, GoalEventDecisionRequestResult>("goals.decisions.request", "请求目标决定", "提出问题、至少两个选项及各自影响，等待用户作出决定；请求本身不表示批准", "command",
    object({ ...base, question: identifier, options: { ...array(option), minItems: 2 }, purpose: enumeration(goalEventDecisionPurposes), proposed_change: change, scope: partialScope },
      [...required, "question", "options", "purpose"]), object({ ...mutation, decision_request: decisionRequest })),
  citeDecision: action<BusinessInput<CiteGoalDecisionInput>, GoalEventDecisionResult>("goals.decisions.cite", "引用已有决定", "引用当前目标中已保存的可信决定；业务层核对适用范围和当前有效性，不能借引用生成新批准", "command",
    object({ ...base, decision_id: identifier, scope: partialScope }, [...required, "decision_id"]), object({ ...mutation, decision })),
  agree: action<BusinessInput<SetGoalEventAgreementInput>, GoalEventAgreementResult>("goals.agreement.set", "修改目标约定", "按配置及约定版本修改结果与要求；Runtime 放宽或替换已有约定时仍须引用用户授权", "command",
    object({ ...base, expected_config_version: count, expected_agreement_version: count, ...changeProperties, cited_decision_id: text },
      [...required, "expected_config_version", "expected_agreement_version"]), object({ ...mutation, agreement })),
  close: action<BusinessInput<SubmitGoalEventClosureInput>, GoalEventClosureResult>("goals.closure.submit", "提交目标收尾", "显式请求完成或取消并说明理由；只有 completion_applied 为 true 才表示完成成立，未满足原因保留在回执中", "command",
    object({ ...base, kind: enumeration(goalEventClosureKinds), result: text, reason: identifier, expected_config_version: count, expected_agreement_version: count },
      [...required, "kind", "reason", "expected_config_version", "expected_agreement_version"]),
    object({ ...mutation, completion_applied: boolean, work_status: stateProperties.work_status!, unmet_reasons: array(reason), closure })),
  resume: action<BusinessInput<ResumeGoalEventWorkInput>, GoalEventResumeResult>("goals.work.resume", "继续目标工作", "显式继续已经完成或取消的目标，必须说明原因；普通笔记不会自动重开", "command",
    object({ ...base, reason: identifier }, [...required, "reason"]), object({ ...mutation, work_status: { const: "open" } })),
} as const;

export function createGoalsEventActionHandlers(events: GoalEventApplication, boardId: string): ActionHandlerBinding[] {
  return [
    { ...goalsEventActions.configure, handle: (caller, input) => events.configure({ ...input as BusinessInput<ConfigureGoalEventsApplicationInput>, board_id: boardId, ...goalActor(caller) }) },
    { ...goalsEventActions.report, handle: (caller, input) => events.report({ ...input as BusinessInput<ReportGoalEventsInput>, board_id: boardId, ...goalActor(caller) }) },
    { ...goalsEventActions.progress, handle: (caller, input) => events.recordProgress({ ...input as BusinessInput<RecordGoalProgressSummaryInput>, board_id: boardId, ...goalActor(caller) }) },
    { ...goalsEventActions.concern, handle: (caller, input) => events.applyConcern({ ...input as BusinessInput<ApplyGoalConcernInput>, board_id: boardId, ...goalActor(caller) }) },
    { ...goalsEventActions.requestDecision, handle: (caller, input) => events.requestDecision({ ...input as BusinessInput<RequestGoalDecisionInput>, board_id: boardId, ...goalActor(caller) }) },
    { ...goalsEventActions.citeDecision, handle: (caller, input) => events.citeDecision({ ...input as BusinessInput<CiteGoalDecisionInput>, board_id: boardId, ...goalActor(caller) }) },
    { ...goalsEventActions.agree, handle: (caller, input) => events.setAgreement({ ...input as BusinessInput<SetGoalEventAgreementInput>, board_id: boardId, ...goalActor(caller) }) },
    { ...goalsEventActions.close, handle: (caller, input) => events.submitClosure({ ...input as BusinessInput<SubmitGoalEventClosureInput>, board_id: boardId, ...goalActor(caller) }) },
    { ...goalsEventActions.resume, handle: (caller, input) => events.resumeWork({ ...input as BusinessInput<ResumeGoalEventWorkInput>, board_id: boardId, ...goalActor(caller) }) },
  ];
}
