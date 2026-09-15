import {
  goalEventDecisionPurposes,
  goalEventSystemOperations,
  type GoalEventAgreementChange,
  type GoalEventConcernStatus,
  type GoalEventDecisionEffect,
  type GoalEventDecisionOption,
  type GoalEventDecisionPurpose,
  type GoalEventScope,
  type GoalEventSystemPayload,
  type GoalEventUnmetReason,
  type GoalEventWorkStatus,
} from "@molis-ai/molis-work-contracts/modules/goals";

export function parseGoalEventSystemPayload(raw: Record<string, unknown>): GoalEventSystemPayload {
  const operation = raw.operation;
  if (typeof operation !== "string" || !(goalEventSystemOperations as readonly string[]).includes(operation)) {
    return emptyProgress();
  }
  switch (operation) {
    case "progress_summary":
      return {
        operation,
        summary: text(raw.summary),
        based_on_cursor: Number(raw.based_on_cursor) || 0,
        next_step: nullable(raw.next_step),
        next_actor: nullable(raw.next_actor),
      };
    case "concern_opened":
      return {
        operation,
        concern_id: text(raw.concern_id),
        title: text(raw.title),
        statement: text(raw.statement),
        scope: asScope(raw.scope),
        blocks_closure: raw.blocks_closure === true,
      };
    case "concern_resolved":
    case "concern_accepted":
    case "concern_overturned":
      return {
        operation,
        concern_id: text(raw.concern_id),
        status: operation === "concern_resolved" ? "resolved" : operation === "concern_accepted" ? "accepted" : "overturned",
        reason: text(raw.reason),
        supporting_event_ids: asStringArray(raw.supporting_event_ids),
        cited_decision_id: nullable(raw.cited_decision_id),
        previous_status: asConcernStatus(raw.previous_status),
      };
    case "decision_requested":
      return {
        operation,
        request_id: text(raw.request_id),
        question: text(raw.question),
        options: Array.isArray(raw.options) ? raw.options as GoalEventDecisionOption[] : [],
        scope: asScope(raw.scope),
        purpose: asPurpose(raw.purpose),
        proposed_change: asChange(raw.proposed_change),
      };
    case "user_decision":
      return {
        operation,
        decision_id: text(raw.decision_id),
        governance_decision_id: text(raw.governance_decision_id),
        request_id: nullable(raw.request_id),
        selected_option_id: nullable(raw.selected_option_id),
        conclusion: text(raw.conclusion),
        accepts_requirements: raw.accepts_requirements === true,
        effects: Array.isArray(raw.effects) ? raw.effects as GoalEventDecisionEffect[] : [],
        scope: asScope(raw.scope),
        authorized_change: asChange(raw.authorized_change),
        config_version: Number(raw.config_version) || 0,
        agreement_version: Number(raw.agreement_version) || 0,
      };
    case "decision_cited":
      return {
        operation,
        decision_id: text(raw.decision_id),
        scope: asScope(raw.scope),
      };
    case "agreement_set":
      return {
        operation,
        outcome: text(raw.outcome),
        version: Number(raw.version) || 0,
        config_version: Number(raw.config_version) || 0,
        change: asChange(raw.change) ?? {},
      };
    case "closure_submitted":
      return {
        operation,
        kind: raw.kind === "cancel" ? "cancel" : "complete",
        result: nullable(raw.result),
        reason: text(raw.reason),
        completion_applied: raw.completion_applied === true,
        unmet_reasons: Array.isArray(raw.unmet_reasons) ? raw.unmet_reasons as GoalEventUnmetReason[] : [],
        expected_config_version: Number(raw.expected_config_version) || 0,
        expected_agreement_version: Number(raw.expected_agreement_version) || 0,
        config_version: Number(raw.config_version) || 0,
        agreement_version: Number(raw.agreement_version) || 0,
      };
    case "completion_reopened":
      return {
        operation,
        requirement_ids: asStringArray(raw.requirement_ids),
        reason: text(raw.reason),
        previous_work_status: asWorkStatus(raw.previous_work_status, "completed"),
      };
    case "work_resumed":
      return {
        operation,
        reason: text(raw.reason),
        previous_work_status: asWorkStatus(raw.previous_work_status, "cancelled"),
      };
    case "event_owner_continued":
      return {
        operation,
        previous_fulfillment: raw.previous_fulfillment === "satisfied" ? "satisfied" : "unmet",
        reopened: raw.reopened === true,
        previous_work_status: raw.previous_work_status == null
          ? null
          : asWorkStatus(raw.previous_work_status, "open"),
      };
    case "observation_note":
      return {
        operation,
        body: text(raw.body),
      };
    case "intent_created":
      return {
        operation,
        source_kind: asSourceKind(raw.source_kind),
      };
    case "legacy_completion_imported":
      return {
        operation,
        journal_type: nullable(raw.journal_type),
        journal_seq: raw.journal_seq == null ? null : Number(raw.journal_seq),
        journal_at: nullable(raw.journal_at),
        evidence_ids: asStringArray(raw.evidence_ids),
        review_ids: asStringArray(raw.review_ids),
        contract_accepted_at: nullable(raw.contract_accepted_at),
        contract_accepted_by: nullable(raw.contract_accepted_by),
      };
    default:
      return emptyProgress();
  }
}

function emptyProgress(): GoalEventSystemPayload {
  return {
    operation: "progress_summary",
    summary: "",
    based_on_cursor: 0,
    next_step: null,
    next_actor: null,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullable(value: unknown): string | null {
  if (value == null) return null;
  const next = String(value).trim();
  return next ? next : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function asPurpose(value: unknown): GoalEventDecisionPurpose {
  if (typeof value === "string" && (goalEventDecisionPurposes as readonly string[]).includes(value)) {
    return value as GoalEventDecisionPurpose;
  }
  return "suggestion";
}

function asChange(value: unknown): GoalEventAgreementChange | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as GoalEventAgreementChange;
}

function asScope(value: unknown): GoalEventScope {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    requirement_ids: asStringArray(raw.requirement_ids),
    event_ids: asStringArray(raw.event_ids),
    concern_ids: asStringArray(raw.concern_ids),
    action: raw.action == null || raw.action === "" ? null : String(raw.action),
  };
}

function asConcernStatus(value: unknown): GoalEventConcernStatus {
  if (value === "resolved" || value === "accepted" || value === "overturned" || value === "open") return value;
  return "open";
}

function asWorkStatus(value: unknown, fallback: GoalEventWorkStatus): GoalEventWorkStatus {
  if (value === "open" || value === "completed" || value === "cancelled") return value;
  return fallback;
}

function asSourceKind(value: unknown): "web" | "onboarding" | "feed" | "runtime" | "tree" {
  if (value === "web" || value === "onboarding" || value === "feed" || value === "runtime" || value === "tree") {
    return value;
  }
  return "web";
}
