import type { ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalEventClosureKinds, goalEventConcernStatuses, goalEventDecisionEffectKinds, goalEventDecisionPurposes,
  goalEventFieldFormats, goalEventJudgmentVerdicts, goalEventRequirementCurrentStatuses, goalEventSemanticFamilies,
  goalEventTrustedAuthoritySources, goalEventTypeSourceKinds, goalEventUserConclusionVerdicts, goalEventWorkStatuses,
  goalIntentSourceKinds } from "@molis-ai/molis-work-contracts/modules/goals";

export const text = { type: "string" };
export const identifier = { type: "string", minLength: 1 };
export const count = { type: "integer", minimum: 0 };
export const boolean = { type: "boolean" };
export const nullable = (schema: ActionSchema): ActionSchema => ({ anyOf: [schema, { type: "null" }] });
export const array = (items: ActionSchema): ActionSchema => ({ type: "array", items });
export const enumeration = (values: readonly unknown[]): ActionSchema => ({ enum: [...values] });
export const object = (properties: Record<string, ActionSchema>, required = Object.keys(properties)): ActionSchema => ({
  type: "object", properties, required, additionalProperties: false,
});
const strings = array(text), maybeText = nullable(text), maybeCount = nullable(count);
const actorKind = enumeration(["user", "runtime", null]);
const workStatus = enumeration(goalEventWorkStatuses), concernStatus = enumeration(goalEventConcernStatuses);
const verdict = enumeration(goalEventJudgmentVerdicts), planningSource = enumeration(["built_in", "personal", "project"]);
const method = object({ method_id: text, version: count, source: planningSource, name: text }, ["method_id", "version", "source"]);
const planningRequirement = object({ kind: { const: "planning" }, template_requirement_id: text, methods: array(method) });
const requirementSource: ActionSchema = { anyOf: [planningRequirement, object({ kind: { const: "create_input" } }),
  object({ kind: { const: "imported_acceptance_criterion" }, decision_method: text, pass_condition: text }),
  object({ kind: { const: "imported_human_approval" }, policy_binding_ids: strings })] };
const fieldSource = object({ kind: enumeration(["local", "planning"]), method_id: text, label: text }, ["kind"]);
const typeSource = object({ kind: enumeration(goalEventTypeSourceKinds), method_id: text, method_version: count, label: text,
  contributing_methods: array(method) }, ["kind"]);
const field = object({ field_id: text, name: text, purpose: text, format: enumeration(goalEventFieldFormats), required: boolean, source: fieldSource },
  ["field_id", "name", "purpose", "format", "required"]);
export const eventType = object({ type_id: text, version: count, name: text, purpose: text, semantic_family: enumeration(goalEventSemanticFamilies),
  source: typeSource, fields: array(field) }, ["type_id", "version", "name", "purpose", "source", "fields"]);
const extraRequirement = object({ requirement_id: text, statement: text, bound_type_id: text, created_in_config_version: count, actor_id: text,
  source: requirementSource, human_decision_required: boolean, current_status: enumeration(goalEventRequirementCurrentStatuses), revision: count,
  support_valid_after_seq: count }, ["requirement_id", "statement", "created_in_config_version", "actor_id", "human_decision_required", "current_status", "revision", "support_valid_after_seq"]);
const requirementInput = object({ requirement_id: text, statement: text, bound_type_id: text, human_decision_required: boolean, source: requirementSource }, ["requirement_id", "statement"]);
export const binding = object({ type_id: text, requirement_id: text });
const adopted = object({ method_id: text, version: count, source: planningSource });
const configFields = { types: array(eventType), adopted_planning: array(adopted), extra_requirements: array(extraRequirement), requirement_bindings: array(binding) };
export const goalConfigSchema = object({ board_id: text, goal_id: text, version: count, ...configFields, updated_at: maybeText, updated_by: maybeText });
export const scope = object({ requirement_ids: strings, event_ids: strings, concern_ids: strings, action: maybeText });
export const artifactSource = object({ artifact_id: text, version: count, title: text, origin: object({ plugin_id: text, item_id: text }) });
const progressFields = { summary: text, based_on_cursor: count, next_step: maybeText, next_actor: maybeText };
export const progress = object({ ...progressFields, summary_id: text, event_id: text, recorded_at: text, actor_id: text, stale: boolean, stale_because_cursor: maybeCount,
  source: artifactSource }, [...Object.keys(progressFields), "summary_id", "event_id", "recorded_at", "actor_id", "stale", "stale_because_cursor"]);
export const concern = object({ concern_id: text, event_id: text, title: text, statement: text, scope, blocks_closure: boolean, status: concernStatus,
  resolution_reason: maybeText, resolution_event_id: maybeText, cited_decision_id: maybeText, previous_status: nullable(concernStatus), created_at: text, updated_at: text });
export const option = object({ option_id: text, label: text, impact: text });
export const effect = object({ kind: enumeration(goalEventDecisionEffectKinds), action: maybeText }, ["kind"]);
export const change = object({ outcome: text, new_requirements: array(requirementInput),
  revise_requirements: array(object({ requirement_id: text, statement: text, human_decision_required: boolean }, ["requirement_id"])), retire_requirement_ids: strings }, []);
const commitment = object({ outcome: text, requirements: array(object({ requirement_id: text, statement: text, human_decision_required: boolean, bound_type_ids: strings })) });
const requestFields = { request_id: text, question: text, options: array(option), scope, purpose: enumeration(goalEventDecisionPurposes), proposed_change: nullable(change) };
export const decisionRequest = object({ ...requestFields, event_id: text, commitment: nullable(commitment), status: enumeration(["pending", "decided"]), created_at: text });
const decisionFields = { decision_id: text, governance_decision_id: text, request_id: maybeText, selected_option_id: maybeText, conclusion: text,
  accepts_requirements: boolean, effects: array(effect), scope, authorized_change: nullable(change) };
export const decision = object({ ...decisionFields, commitment, config_version: maybeCount, agreement_version: maybeCount, actor_id: text,
  authority_source: enumeration(goalEventTrustedAuthoritySources), recorded_at: text });
export const reason = object({ code: text, message: text, requirement_id: text, concern_id: text, goal_id: text, risk_id: text, request_id: text }, ["code", "message"]);
const closureFields = { kind: enumeration(goalEventClosureKinds), result: maybeText, reason: text, completion_applied: boolean,
  expected_config_version: count, expected_agreement_version: count, unmet_reasons: array(reason) };
export const closure = object({ ...closureFields, closure_id: text, event_id: text, recorded: { const: true }, config_version: maybeCount, agreement_version: maybeCount,
  superseded: boolean, superseded_reason: maybeText, recorded_at: text });
const historicalCompletion = { journal_type: maybeText, journal_seq: maybeCount, journal_at: maybeText, evidence_ids: strings, review_ids: strings,
  contract_accepted_at: maybeText, contract_accepted_by: maybeText };
export const judgment = object({ requirement_id: text, verdict });
const requirementReport = object({ event_id: text, actor_id: text, actor_kind: actorKind, verdict, received_at: text, journal_seq: count,
  independent_verification: { const: false }, substitutes_human_decision: { const: false } });
const conclusion = object({ decision_id: text, actor_id: text, verdict: enumeration(goalEventUserConclusionVerdicts), received_at: text, journal_seq: count });
const requirement = object({ requirement_id: text, goal_id: text, statement: text,
  origin: object({ kind: enumeration(["goal_event_requirement", "imported_acceptance_criterion", "imported_human_approval", "create_input"]),
    decision_method: enumeration(["automated_check", "measurement", "inspection", "human_decision"]), pass_condition: text, config_version: count,
    planning: planningRequirement, policy_binding_ids: strings }, ["kind"]), bound_type_ids: strings, human_decision_required: boolean,
  current_report: nullable(requirementReport), user_conclusion: nullable(conclusion), currently_satisfied: boolean });

export const agreement = object({ version: count, outcome: text, has_minimum_result_agreement: boolean, missing: strings, updated_at: maybeText, updated_by: maybeText });

export const goalStateSchema = object({ board_id: text, goal_id: text,
  intent: object({ title: text, why: text, business_logic: text, source_kind: enumeration([...goalIntentSourceKinds, "migration", null]) }),
  config: goalConfigSchema, requirements: array(requirement), latest_reports: array(object({ event_id: text, title: text, type_id: maybeText,
    type_version: maybeCount, received_at: text, journal_seq: count, judgments: array(judgment) })),
  gaps: array(object({ requirement_id: text, statement: text, current_verdict: nullable(verdict), human_decision_required: boolean })),
  observed_event_cursor: count, goal_event_cursor: count, event_list_next_cursor: maybeCount,
  owner: nullable(object({ kind: { const: "event_work" }, adopted_at: text, adopted_by: text, source: enumeration(["intent", "configuration", "continue", "migration"]) })),
  work_status: workStatus,
  agreement,
  progress_summary: nullable(progress), concerns: array(concern), pending_decisions: array(decisionRequest), applied_decisions: array(decision), current_decisions: array(decision),
  closure: nullable(closure), imported_completion: nullable(object({ source: { const: "legacy_fulfillment" }, imported_at: text, label: { const: "迁入的历史完成" },
    historical: object(historicalCompletion) })), can_record: boolean, recorded_not_completed: boolean, completion_effect: boolean });

const operation = (name: string | readonly string[], fields: Record<string, ActionSchema>, required = Object.keys(fields)) =>
  object({ operation: typeof name === "string" ? { const: name } : enumeration(name), ...fields }, ["operation", ...required]);
const systemPayload: ActionSchema = { anyOf: [
  operation("progress_summary", { ...progressFields, source: artifactSource }, Object.keys(progressFields)),
  operation("concern_opened", { concern_id: text, title: text, statement: text, scope, blocks_closure: boolean }),
  operation(["concern_resolved", "concern_accepted", "concern_overturned"], { concern_id: text, status: concernStatus, reason: text,
    supporting_event_ids: strings, cited_decision_id: maybeText, previous_status: concernStatus }),
  operation("decision_requested", requestFields),
  operation("user_decision", { ...decisionFields, config_version: count, agreement_version: count }),
  operation("decision_cited", { decision_id: text, scope }),
  operation("agreement_set", { outcome: text, version: count, config_version: count, change }),
  operation("closure_submitted", { ...closureFields, config_version: count, agreement_version: count }),
  operation("completion_reopened", { requirement_ids: strings, reason: text, previous_work_status: workStatus }),
  operation("work_resumed", { reason: text, previous_work_status: workStatus }),
  operation("event_owner_continued", { previous_fulfillment: enumeration(["unmet", "satisfied"]), reopened: boolean, previous_work_status: nullable(workStatus) }),
  operation("observation_note", { body: text }), operation("intent_created", { source_kind: enumeration(goalIntentSourceKinds) }),
  operation("legacy_completion_imported", historicalCompletion),
] };
const eventBase = { event_id: text, board_id: text, goal_id: text, title: text, actor_id: text, actor_kind: actorKind, received_at: text,
  journal_seq: count, config_version: maybeCount, judgments: array(judgment) };
export const goalReportEventSchema = object({ ...eventBase, kind: { const: "report" }, type: nullable(eventType), payload: { type: "object", additionalProperties: text } });
export const goalEventSchema: ActionSchema = { anyOf: [
  object({ ...eventBase, kind: { const: "configuration" }, type: { type: "null" }, payload: object({ config_version: count, ...configFields }) }),
  goalReportEventSchema,
  object({ ...eventBase, kind: { const: "system" }, type: { type: "null" }, payload: systemPayload }),
] };
export const goalEventPageSchema = object({ events: array(goalEventSchema), next_cursor: maybeCount, observed_event_cursor: count });
const timelineFields = { event_id: text, journal_seq: count, received_at: text, title: text, kind: enumeration(["configuration", "report", "system"]),
  type_id: maybeText, type_name: maybeText, semantic_family: nullable(enumeration(goalEventSemanticFamilies)), actor_id: text, actor_kind: actorKind };
export const goalTimelineSchema = object({ items: array(object({ ...timelineFields, system_operation: maybeText, lane: enumeration(["result", "decision", "problem", "other"]) },
  Object.keys(timelineFields))), next_cursor: maybeCount, observed_event_cursor: count });
export const goalDirectoryItemSchema = object({ goal_id: text, title: text, work_status: workStatus, completion_effect: boolean, can_record: boolean, next_hint: text,
  unmet_requirement_count: count, pending_decision_count: count, blocking_concern_count: count, updated_at: text });
const historyFields = { item_id: text, source: enumeration(["event_work", "legacy_run", "legacy_evidence", "legacy_review", "legacy_decision", "legacy_record"]),
  original_id: text, event_id: maybeText, journal_seq: count, received_at: text, title: text, type_label: text,
  lane: enumeration(["result", "decision", "problem", "other"]), actor_id: text, actor_kind: actorKind, status_label: maybeText };
export const goalHistoryItemSchema = object({ ...historyFields, relation: object({ type: text, label: text, from_id: text, from_title: text, to_id: text, to_title: text, removed: boolean }) }, Object.keys(historyFields));
export const goalHistoryPageSchema = object({ items: array(goalHistoryItemSchema), next_cursor: maybeText, observed_event_cursor: count });
