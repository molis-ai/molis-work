import type { AgentInputTreatment } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
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
  "input_acknowledged",
] as const;
export type GoalEventSystemOperation = (typeof goalEventSystemOperations)[number];

type MustBeTrue<T extends true> = T;

/**
 * How an AI session says it will treat a note, requirement or decision it read on a Goal. The same closed set as the words an Agent
 * round gives to the supplements it read (`AgentInputTreatment`), so a person sees one vocabulary on the receipt and on the Goal.
 * `satisfies` rejects a word the runtime does not have; the exhaustiveness check inside `GoalEventAcknowledgementTreatment` fails the
 * build when the runtime gains a word this list lacks.
 */
export const goalEventAcknowledgementTreatments = [
  "apply-now",
  "later-step",
  "new-task",
  "needs-clarification",
  "not-adopted",
  "answered",
  "noted",
  "merged",
] as const satisfies readonly AgentInputTreatment[];
type ListedAcknowledgementTreatment = (typeof goalEventAcknowledgementTreatments)[number];
export type GoalEventAcknowledgementTreatment =
  MustBeTrue<[AgentInputTreatment] extends [ListedAcknowledgementTreatment] ? true : false> extends true ? ListedAcknowledgementTreatment : never;

/** What kind of record an acknowledgement can point at: a note, a requirement (the agreement or a configuration), or the person's decision. */
export const goalEventAcknowledgementCategories = ["note", "requirement", "decision"] as const;
export type GoalEventAcknowledgementCategory = (typeof goalEventAcknowledgementCategories)[number];

/** Where an acknowledgement came from, all taken from the call's trusted context. `session_id` and `runtime_id` are what the transport named; Molis does not verify them further. */
export interface GoalEventAcknowledgementBy {
  channel: "mcp" | "assistant" | "agent";
  runtime_id: string | null;
  session_id: string | null;
}

/** The record an acknowledgement is about, copied by Goals from that record at the time; the caller names only its id. */
export interface GoalEventAcknowledgementReference {
  event_id: string;
  category: GoalEventAcknowledgementCategory;
  operation: string | null;
  title: string;
  journal_seq: number;
}

export const goalEventUserConclusionVerdicts = ["accepted", "rejected"] as const;
export type GoalEventUserConclusionVerdict = (typeof goalEventUserConclusionVerdicts)[number];

export interface GoalEventStateOwnerView {
  kind: "event_work";
  adopted_at: string;
  adopted_by: string;
  source: "intent" | "configuration" | "continue";
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
  project_id: string;
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
  project_id: string;
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
  project_id: string;
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
  project_id: string;
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
  project_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  decision_id: string;
  scope?: Partial<GoalEventScope>;
}

export interface RecordGoalUserDecisionInput {
  project_id: string;
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
  project_id: string;
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
  project_id: string;
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
  project_id: string;
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
      /** An AI session's own statement that it read the referenced record and how it will treat it. A claim: nothing here changes the Goal. */
      operation: "input_acknowledged";
      reference: GoalEventAcknowledgementReference;
      treatment: GoalEventAcknowledgementTreatment;
      /** One sentence on how it will be handled, 1 to 300 characters. */
      note: string;
      /** The project event cursor the session says it had read up to; Goals checks only that it is in range. */
      read_cursor: number;
      by: GoalEventAcknowledgementBy;
    };

export interface RecordGoalNoteInput {
  project_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  body: string;
}

/** What the call's trusted context gives (`by`); the caller's own input names the record, the way it will be treated, and the cursor it read to. */
export interface AcknowledgeGoalEventInput {
  project_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  /** The `gevt-` record read: a note, a requirement (agreement or configuration) or the person's decision. */
  event_id: string;
  treatment: GoalEventAcknowledgementTreatment;
  note: string;
  read_cursor: number;
  by: GoalEventAcknowledgementBy;
}

export interface GoalEventAcknowledgementsApi {
  acknowledge(input: AcknowledgeGoalEventInput): GoalEventMutationResult;
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
}
