import type { ArtifactReference } from "./artifacts.js";
import type { GoalEventExtraRequirementInput } from "./goal-events.js";

export const goalEventWorkStatuses = ["open", "completed", "cancelled"] as const;
export type GoalEventWorkStatus = (typeof goalEventWorkStatuses)[number];

export const goalEventConcernStatuses = ["open", "resolved", "accepted", "overturned"] as const;
export type GoalEventConcernStatus = (typeof goalEventConcernStatuses)[number];

export const goalEventConcernActions = ["open", "resolve", "accept", "overturn"] as const;
export type GoalEventConcernAction = (typeof goalEventConcernActions)[number];

export const goalEventClosureKinds = ["complete", "cancel"] as const;
export type GoalEventClosureKind = (typeof goalEventClosureKinds)[number];

export const goalEventTrustedAuthoritySources = ["web", "management"] as const;
export type GoalEventTrustedAuthoritySource = (typeof goalEventTrustedAuthoritySources)[number];

export const goalEventDecisionEffectKinds = [
  "accept_requirements",
  "reject_requirements",
  "accept_concerns",
  "reject_concerns",
  "authorize_action",
  "deny_action",
  "authorize_agreement_change",
] as const;
export type GoalEventDecisionEffectKind = (typeof goalEventDecisionEffectKinds)[number];

export const goalEventDecisionPurposes = [
  "suggestion",
  "requirement_acceptance",
  "action",
  "agreement_change",
] as const;
export type GoalEventDecisionPurpose = (typeof goalEventDecisionPurposes)[number];

export const goalEventRequirementCurrentStatuses = ["active", "retired"] as const;
export type GoalEventRequirementCurrentStatus = (typeof goalEventRequirementCurrentStatuses)[number];

export const goalEventSystemOperations = [
  "progress_summary",
  "concern_opened",
  "concern_resolved",
  "concern_accepted",
  "concern_overturned",
  "decision_requested",
  "user_decision",
  "decision_cited",
  "agreement_set",
  "closure_submitted",
  "completion_reopened",
  "work_resumed",
  "event_owner_continued",
  "observation_note",
  "intent_created",
  "legacy_completion_imported",
] as const;
export type GoalEventSystemOperation = (typeof goalEventSystemOperations)[number];

export const goalEventUserConclusionVerdicts = ["accepted", "rejected"] as const;
export type GoalEventUserConclusionVerdict = (typeof goalEventUserConclusionVerdicts)[number];

export interface GoalEventStateOwnerView {
  kind: "event_work";
  adopted_at: string;
  adopted_by: string;
  source: "intent" | "configuration" | "continue" | "migration";
}

export interface GoalEventScope {
  requirement_ids: string[];
  event_ids: string[];
  concern_ids: string[];
  action: string | null;
}

/** Exact saved evidence; opening it navigates only, never executes work. */
export interface GoalProgressArtifactSource extends ArtifactReference {
  title: string;
  origin: { plugin_id: string; item_id: string };
}

export interface GoalEventProgressSummaryView {
  source?: GoalProgressArtifactSource;
  summary_id: string;
  event_id: string;
  summary: string;
  based_on_cursor: number;
  next_step: string | null;
  next_actor: string | null;
  recorded_at: string;
  actor_id: string;
  stale: boolean;
  stale_because_cursor: number | null;
}

export interface GoalEventConcernView {
  concern_id: string;
  event_id: string;
  title: string;
  statement: string;
  scope: GoalEventScope;
  blocks_closure: boolean;
  status: GoalEventConcernStatus;
  resolution_reason: string | null;
  resolution_event_id: string | null;
  cited_decision_id: string | null;
  previous_status: GoalEventConcernStatus | null;
  created_at: string;
  updated_at: string;
}

export interface GoalEventDecisionOption {
  option_id: string;
  label: string;
  impact: string;
}

export interface GoalEventDecisionEffect {
  kind: GoalEventDecisionEffectKind;
  action?: string | null;
}

export interface GoalEventRequirementCommitment {
  requirement_id: string;
  statement: string;
  human_decision_required: boolean;
  bound_type_ids: string[];
}

export interface GoalEventDecisionCommitment {
  outcome: string;
  requirements: GoalEventRequirementCommitment[];
}

export interface GoalEventRequirementRevisionInput {
  requirement_id: string;
  statement?: string;
  human_decision_required?: boolean;
}

export interface GoalEventAgreementChange {
  outcome?: string;
  new_requirements?: GoalEventExtraRequirementInput[];
  revise_requirements?: GoalEventRequirementRevisionInput[];
  retire_requirement_ids?: string[];
}

export interface GoalEventDecisionRequestView {
  request_id: string;
  event_id: string;
  question: string;
  options: GoalEventDecisionOption[];
  scope: GoalEventScope;
  purpose: GoalEventDecisionPurpose;
  proposed_change: GoalEventAgreementChange | null;
  commitment: GoalEventDecisionCommitment | null;
  status: "pending" | "decided";
  created_at: string;
}

export interface GoalEventAppliedDecisionView {
  decision_id: string;
  governance_decision_id: string;
  request_id: string | null;
  selected_option_id: string | null;
  conclusion: string;
  accepts_requirements: boolean;
  effects: GoalEventDecisionEffect[];
  scope: GoalEventScope;
  commitment: GoalEventDecisionCommitment;
  authorized_change: GoalEventAgreementChange | null;
  config_version: number | null;
  agreement_version: number | null;
  actor_id: string;
  authority_source: GoalEventTrustedAuthoritySource;
  recorded_at: string;
}

export interface GoalEventAgreementView {
  version: number;
  outcome: string;
  has_minimum_result_agreement: boolean;
  missing: string[];
  updated_at: string | null;
  updated_by: string | null;
}

export interface GoalEventUnmetReason {
  code: string;
  message: string;
  requirement_id?: string;
  concern_id?: string;
  goal_id?: string;
  risk_id?: string;
  request_id?: string;
}

export interface GoalEventClosureView {
  closure_id: string;
  event_id: string;
  kind: GoalEventClosureKind;
  result: string | null;
  reason: string;
  recorded: true;
  completion_applied: boolean;
  expected_config_version: number;
  expected_agreement_version: number;
  config_version: number | null;
  agreement_version: number | null;
  unmet_reasons: GoalEventUnmetReason[];
  superseded: boolean;
  superseded_reason: string | null;
  recorded_at: string;
}

export interface GoalEventTrustedAuthority {
  actor_id: string;
  actor_kind: "user";
  authority_source: GoalEventTrustedAuthoritySource;
  conversation_ref: string;
  message_ref: string;
}

export interface GoalEventTrustedDecisionRecord {
  decision_id: string;
  board_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind: "user";
  authority_source: GoalEventTrustedAuthoritySource;
  conversation_ref: string;
  message_ref: string;
  request_id: string | null;
  selected_option_id: string | null;
  conclusion: string;
  accepts_requirements: boolean;
  scope: GoalEventScope;
  authorized_change: GoalEventAgreementChange | null;
  recorded_at: string;
}

export interface GoalEventUserConclusion {
  decision_id: string;
  actor_id: string;
  verdict: GoalEventUserConclusionVerdict;
  received_at: string;
  journal_seq: number;
}

export interface RecordGoalProgressSummaryInput {
  source?: GoalProgressArtifactSource;
  /** When supplied, compare inside the same transaction after idempotency replay. */
  expected_goal_cursor?: number;
  expected_contract_revision?: number;
  board_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  based_on_cursor: number;
  summary: string;
  next_step?: string;
  next_actor?: string;
}

export interface ApplyGoalConcernInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  action: GoalEventConcernAction;
  concern_id?: string;
  title?: string;
  statement?: string;
  scope?: Partial<GoalEventScope>;
  blocks_closure?: boolean;
  reason?: string;
  supporting_event_ids?: string[];
  cited_decision_id?: string;
}

export interface RequestGoalDecisionInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  question: string;
  options: GoalEventDecisionOption[];
  purpose: GoalEventDecisionPurpose;
  proposed_change?: GoalEventAgreementChange;
  scope?: Partial<GoalEventScope>;
}

export interface CiteGoalDecisionInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  decision_id: string;
  scope?: Partial<GoalEventScope>;
}

export interface RecordGoalUserDecisionInput {
  board_id: string;
  goal_id: string;
  idempotency_key: string;
  authority: GoalEventTrustedAuthority;
  request_id?: string;
  selected_option_id?: string;
  conclusion: string;
  accepts_requirements?: boolean;
  effects?: GoalEventDecisionEffect[];
  authorized_change?: GoalEventAgreementChange;
  scope?: Partial<GoalEventScope>;
}

export interface SetGoalEventAgreementInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  expected_config_version: number;
  expected_agreement_version: number;
  outcome?: string;
  new_requirements?: GoalEventExtraRequirementInput[];
  revise_requirements?: GoalEventRequirementRevisionInput[];
  retire_requirement_ids?: string[];
  cited_decision_id?: string;
}

export interface SubmitGoalEventClosureInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  kind: GoalEventClosureKind;
  result?: string;
  reason: string;
  expected_config_version: number;
  expected_agreement_version: number;
}

export interface ResumeGoalEventWorkInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  reason: string;
}

export interface GoalEventMutationResult {
  event_id: string;
  observed_event_cursor: number;
  replayed: boolean;
  recorded: true;
}

export interface GoalEventProgressResult extends GoalEventMutationResult {
  progress_summary: GoalEventProgressSummaryView;
}

export interface GoalEventConcernResult extends GoalEventMutationResult {
  concern: GoalEventConcernView;
}

export interface GoalEventDecisionRequestResult extends GoalEventMutationResult {
  decision_request: GoalEventDecisionRequestView;
}

export interface GoalEventDecisionResult extends GoalEventMutationResult {
  decision: GoalEventAppliedDecisionView;
}

export interface GoalEventAgreementResult extends GoalEventMutationResult {
  agreement: GoalEventAgreementView;
}

export interface GoalEventClosureResult {
  event_id: string;
  observed_event_cursor: number;
  replayed: boolean;
  recorded: true;
  completion_applied: boolean;
  work_status: GoalEventWorkStatus;
  unmet_reasons: GoalEventUnmetReason[];
  closure: GoalEventClosureView;
}

export interface GoalEventResumeResult extends GoalEventMutationResult {
  work_status: "open";
}

export type GoalEventSystemPayload =
  | {
      operation: "progress_summary";
      source?: GoalProgressArtifactSource;
      summary: string;
      based_on_cursor: number;
      next_step: string | null;
      next_actor: string | null;
    }
  | {
      operation: "concern_opened";
      concern_id: string;
      title: string;
      statement: string;
      scope: GoalEventScope;
      blocks_closure: boolean;
    }
  | {
      operation: "concern_resolved" | "concern_accepted" | "concern_overturned";
      concern_id: string;
      status: GoalEventConcernStatus;
      reason: string;
      supporting_event_ids: string[];
      cited_decision_id: string | null;
      previous_status: GoalEventConcernStatus;
    }
  | {
      operation: "decision_requested";
      request_id: string;
      question: string;
      options: GoalEventDecisionOption[];
      scope: GoalEventScope;
      purpose: GoalEventDecisionPurpose;
      proposed_change: GoalEventAgreementChange | null;
    }
  | {
      operation: "user_decision";
      decision_id: string;
      governance_decision_id: string;
      request_id: string | null;
      selected_option_id: string | null;
      conclusion: string;
      accepts_requirements: boolean;
      effects: GoalEventDecisionEffect[];
      scope: GoalEventScope;
      authorized_change: GoalEventAgreementChange | null;
      config_version: number;
      agreement_version: number;
    }
  | {
      operation: "decision_cited";
      decision_id: string;
      scope: GoalEventScope;
    }
  | {
      operation: "agreement_set";
      outcome: string;
      version: number;
      config_version: number;
      change: GoalEventAgreementChange;
    }
  | {
      operation: "closure_submitted";
      kind: GoalEventClosureKind;
      result: string | null;
      reason: string;
      completion_applied: boolean;
      unmet_reasons: GoalEventUnmetReason[];
      expected_config_version: number;
      expected_agreement_version: number;
      config_version: number;
      agreement_version: number;
    }
  | {
      operation: "completion_reopened";
      requirement_ids: string[];
      reason: string;
      previous_work_status: GoalEventWorkStatus;
    }
  | {
      operation: "work_resumed";
      reason: string;
      previous_work_status: GoalEventWorkStatus;
    }
  | {
      operation: "event_owner_continued";
      previous_fulfillment: "unmet" | "satisfied";
      reopened: boolean;
      previous_work_status: GoalEventWorkStatus | null;
    }
  | {
      operation: "observation_note";
      body: string;
    }
  | {
      operation: "intent_created";
      source_kind: "web" | "onboarding" | "feed" | "runtime" | "tree";
    }
  | {
      operation: "legacy_completion_imported";
      journal_type: string | null;
      journal_seq: number | null;
      journal_at: string | null;
      evidence_ids: string[];
      review_ids: string[];
      contract_accepted_at: string | null;
      contract_accepted_by: string | null;
    };

export interface GoalEventImportedCompletion {
  source: "legacy_fulfillment";
  imported_at: string;
  label: "迁入的历史完成";
  historical: {
    journal_type: string | null;
    journal_seq: number | null;
    journal_at: string | null;
    evidence_ids: string[];
    review_ids: string[];
    contract_accepted_at: string | null;
    contract_accepted_by: string | null;
  };
}

export interface RecordGoalNoteInput {
  board_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  body: string;
}

export interface GoalEventWorkStateView {
  owner: GoalEventStateOwnerView | null;
  work_status: GoalEventWorkStatus;
  agreement: GoalEventAgreementView;
  progress_summary: GoalEventProgressSummaryView | null;
  concerns: GoalEventConcernView[];
  pending_decisions: GoalEventDecisionRequestView[];
  applied_decisions: GoalEventAppliedDecisionView[];
  current_decisions: GoalEventAppliedDecisionView[];
  closure: GoalEventClosureView | null;
  imported_completion: GoalEventImportedCompletion | null;
}
