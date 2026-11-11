import type { GoalAcceptanceCriterion } from "./goals.js";
import type {
  ApplyGoalConcernInput,
  CiteGoalDecisionInput,
  GoalEventAgreementResult,
  GoalEventRequirementCurrentStatus,
  GoalEventClosureResult,
  GoalEventConcernResult,
  GoalEventDecisionRequestResult,
  GoalEventDecisionResult,
  GoalEventMutationResult,
  GoalEventProgressResult,
  GoalEventResumeResult,
  GoalEventSystemPayload,
  GoalEventUserConclusion,
  GoalEventWorkStateView,
  RecordGoalProgressSummaryInput,
  RecordGoalUserDecisionInput,
  RequestGoalDecisionInput,
  ResumeGoalEventWorkInput,
  RecordGoalNoteInput,
  SetGoalEventAgreementInput,
  SubmitGoalEventClosureInput,
  GoalEventTrustedDecisionRecord,
} from "./goal-event-state.js";

export * from "./goal-event-state.js";

export const goalEventSemanticFamilies = [
  "progress",
  "delivery",
  "verification",
  "concern",
  "observation",
  "decision",
  "closure",
  "custom",
] as const;
export type GoalEventSemanticFamily = (typeof goalEventSemanticFamilies)[number];

export const goalEventFieldFormats = ["text", "longtext"] as const;
export type GoalEventFieldFormat = (typeof goalEventFieldFormats)[number];

export const goalEventJudgmentVerdicts = ["supports", "contradicts", "unknown"] as const;
export type GoalEventJudgmentVerdict = (typeof goalEventJudgmentVerdicts)[number];

export const goalEventTypeSourceKinds = ["local", "planning", "runtime"] as const;
export type GoalEventTypeSourceKind = (typeof goalEventTypeSourceKinds)[number];

export interface GoalEventPlanningMethodRef {
  method_id: string;
  version: number;
  source: "built_in" | "personal" | "project";
  name?: string;
}

export interface GoalEventTypeSource {
  kind: GoalEventTypeSourceKind;
  method_id?: string;
  method_version?: number;
  label?: string;
  contributing_methods?: GoalEventPlanningMethodRef[];
}

export interface GoalEventFieldSource {
  kind: "local" | "planning";
  method_id?: string;
  label?: string;
}

export interface GoalEventFieldDefinition {
  field_id: string;
  name: string;
  purpose: string;
  format: GoalEventFieldFormat;
  required: boolean;
  source?: GoalEventFieldSource;
}

export interface GoalEventTypeDefinition {
  type_id: string;
  version: number;
  name: string;
  purpose: string;
  semantic_family?: GoalEventSemanticFamily;
  source: GoalEventTypeSource;
  fields: GoalEventFieldDefinition[];
}

export interface GoalEventAdoptedPlanningRef {
  method_id: string;
  version: number;
  source: "built_in" | "personal" | "project";
}

export interface GoalEventRequirementBinding {
  type_id: string;
  requirement_id: string;
}

export type GoalEventRequirementSource =
  | {
      kind: "planning";
      template_requirement_id: string;
      methods: GoalEventPlanningMethodRef[];
    }
  | { kind: "create_input" }
  | {
      kind: "imported_acceptance_criterion";
      decision_method: GoalAcceptanceCriterion["decision_method"];
      pass_condition: string;
    }
  | {
      kind: "imported_human_approval";
      policy_binding_ids: string[];
    };

export interface GoalEventExtraRequirement {
  requirement_id: string;
  statement: string;
  bound_type_id?: string;
  created_in_config_version: number;
  actor_id: string;
  source?: GoalEventRequirementSource;
  human_decision_required: boolean;
  current_status: GoalEventRequirementCurrentStatus;
  revision: number;
  support_valid_after_seq: number;
}

export interface GoalEventTypeDefinitionInput {
  type_id: string;
  version: number;
  name: string;
  purpose: string;
  semantic_family?: GoalEventSemanticFamily;
  source?: GoalEventTypeSource;
  fields: GoalEventFieldDefinition[];
}

export interface GoalEventExtraRequirementInput {
  requirement_id: string;
  statement: string;
  bound_type_id?: string;
  human_decision_required?: boolean;
  source?: GoalEventRequirementSource;
}

export interface ConfigureGoalEventsInput {
  project_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  expected_version: number;
  idempotency_key: string;
  types?: GoalEventTypeDefinitionInput[];
  adopted_planning?: GoalEventAdoptedPlanningRef[];
  requirement_bindings?: GoalEventRequirementBinding[];
}

export interface GoalEventConfigView {
  project_id: string;
  goal_id: string;
  version: number;
  types: GoalEventTypeDefinition[];
  adopted_planning: GoalEventAdoptedPlanningRef[];
  extra_requirements: GoalEventExtraRequirement[];
  requirement_bindings: GoalEventRequirementBinding[];
  updated_at: string | null;
  updated_by: string | null;
}

export interface ConfigureGoalEventsResult {
  config: GoalEventConfigView;
  event_id: string;
  observed_event_cursor: number;
  replayed: boolean;
}

/**
 * What a judgment's basis points at, kept as a reference only: the record stays with its owner (the 成果库, the Agent Host) and is
 * read there. A new kind of evidence is a new member here; nothing else changes (specs/proactive-assistant PWA-144).
 */
export const goalEventEvidenceKinds = ["artifact_version", "command_receipt"] as const;
export type GoalEventEvidenceRef =
  | { kind: "artifact_version"; artifact_id: string; version: number }
  | { kind: "command_receipt"; run_id: string; call_id: string };
export const GOAL_EVENT_EVIDENCE_MAX = 8;

/** What the reporter says it checked and how: an exact version in the 成果库 (never "the latest"), two sentences for people, and references. */
export interface GoalEventJudgmentBasisInput {
  checked: { artifact_id: string; version: number };
  method: string;
  observed: string;
  evidence?: GoalEventEvidenceRef[];
}

/**
 * How far a judgment is backed, worked out by Goals when the report arrives and never taken from the reporter:
 * `self_reported` is the reporter's own word; `machine_verified` is a command the platform itself ran in the round that made the
 * checked version, which ended normally with nothing written after it; `peer_reviewed` is a session other than the one that did
 * the work, known to the platform, saying it checked that version.
 */
export const goalEventBasisTiers = ["self_reported", "machine_verified", "peer_reviewed"] as const;
export type GoalEventBasisTier = (typeof goalEventBasisTiers)[number];
/** Why a basis that names evidence stayed the reporter's own word. */
export const goalEventBasisGaps = ["evidence_missing", "evidence_unreadable", "subject_mismatch", "check_failed"] as const;
export type GoalEventBasisGap = (typeof goalEventBasisGaps)[number];

export interface GoalEventJudgmentBasis extends GoalEventJudgmentBasisInput {
  evidence: GoalEventEvidenceRef[];
}

export interface GoalEventJudgmentInput {
  requirement_id: string;
  verdict: GoalEventJudgmentVerdict;
  basis?: GoalEventJudgmentBasisInput;
}

/**
 * What Goals found when it weighed one judgment's basis, before anything is written. Made only by Goals' own check of the call
 * (`verifyReportEvidence`): no action input carries it, so a caller cannot state its own tier.
 */
export interface GoalEventJudgmentAssessment {
  tier: GoalEventBasisTier;
  gap: GoalEventBasisGap | null;
}

export interface ReportGoalWorkEventInput {
  type_id: string;
  type_version: number;
  title: string;
  fields: Record<string, string>;
  judgments?: GoalEventJudgmentInput[];
}

export interface GoalEventReportProgressInput {
  summary: string;
  next_step?: string;
  next_actor?: string;
}

export interface ReportGoalEventsInput {
  project_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  events: ReportGoalWorkEventInput[];
  progress?: GoalEventReportProgressInput;
  /**
   * Set by Goals' own action handler from the call, never by a caller: the session the Host bound the reporting round to, and what
   * the check of each judgment's basis found, by event index and requirement. Absent means every judgment is the reporter's own word.
   */
  trusted?: { reporter_session: string | null; assessments: ReadonlyMap<string, GoalEventJudgmentAssessment> };
}

/** The key of one judgment in `ReportGoalEventsInput.trusted.assessments`. */
export const goalEventAssessmentKey = (eventIndex: number, requirementId: string): string => `${eventIndex}:${requirementId}`;

export interface GoalWorkEventJudgment {
  requirement_id: string;
  verdict: GoalEventJudgmentVerdict;
  /** What the reporter said it checked; null for a judgment that names nothing. */
  basis: GoalEventJudgmentBasis | null;
  tier: GoalEventBasisTier;
  gap: GoalEventBasisGap | null;
}

export interface GoalEventConfigurationPayload {
  config_version: number;
  types: GoalEventTypeDefinition[];
  extra_requirements: GoalEventExtraRequirement[];
  requirement_bindings: GoalEventRequirementBinding[];
  adopted_planning: GoalEventAdoptedPlanningRef[];
}

export interface GoalWorkEventBase {
  event_id: string;
  project_id: string;
  goal_id: string;
  title: string;
  actor_id: string;
  actor_kind: "user" | "runtime" | null;
  received_at: string;
  journal_seq: number;
  config_version: number | null;
}

export interface GoalConfigurationWorkEventRecord extends GoalWorkEventBase {
  kind: "configuration";
  type: null;
  payload: GoalEventConfigurationPayload;
  judgments: GoalWorkEventJudgment[];
}

export interface GoalReportWorkEventRecord extends GoalWorkEventBase {
  kind: "report";
  type: GoalEventTypeDefinition | null;
  payload: Record<string, string>;
  judgments: GoalWorkEventJudgment[];
}

export interface GoalSystemWorkEventRecord extends GoalWorkEventBase {
  kind: "system";
  type: null;
  payload: GoalEventSystemPayload;
  judgments: GoalWorkEventJudgment[];
}

export type GoalWorkEventRecord =
  | GoalConfigurationWorkEventRecord
  | GoalReportWorkEventRecord
  | GoalSystemWorkEventRecord;

export interface ReportGoalEventsRecordedResult {
  events: GoalReportWorkEventRecord[];
  observed_event_cursor: number;
  replayed: boolean;
}

export interface ReportGoalEventsResult extends ReportGoalEventsRecordedResult {
  goal_event_cursor: number;
  work_status: GoalEventWorkStateView["work_status"];
  gaps: GoalEventWorkGap[];
  progress_summary: GoalEventWorkStateView["progress_summary"];
  completion_effect: boolean;
  can_record: boolean;
}

export interface GoalEventAdoptedPlanningRequest {
  method_id: string;
  version?: number;
  source?: "built_in" | "personal" | "project";
}

export interface PlanningMethodDefaultRequirement {
  requirement_id: string;
  statement: string;
  bound_type_id?: string;
  applies_when?: string;
  sources?: GoalEventPlanningMethodRef[];
}

export interface ConfigureGoalEventsApplicationInput {
  project_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  expected_version: number;
  expected_agreement_version?: number;
  idempotency_key: string;
  types?: GoalEventTypeDefinitionInput[];
  adopted_planning?: GoalEventAdoptedPlanningRequest[];
  adopt_default_requirement_ids?: string[];
  requirement_bindings?: GoalEventRequirementBinding[];
}

export const goalIntentSourceKinds = ["web", "onboarding", "feed", "runtime", "tree"] as const;
export type GoalIntentSourceKind = (typeof goalIntentSourceKinds)[number];

export interface CreateGoalIntentRequirementInput {
  requirement_id?: string;
  statement: string;
  human_decision_required?: boolean;
}

export interface CreateGoalIntentInput {
  project_id: string;
  title: string;
  outcome?: string;
  why?: string;
  business_logic?: string;
  priority?: number;
  goal_id?: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  idempotency_key: string;
  parent_goal_id?: string;
  dependency_goal_ids?: string[];
  requirements?: CreateGoalIntentRequirementInput[];
  source_kind?: GoalIntentSourceKind;
}

export interface CreateGoalIntentResult {
  goal: {
    goal_id: string;
    project_id: string;
    title: string;
    outcome: string;
  };
  replayed: boolean;
  observed_event_cursor: number;
  recorded: true;
  completion_effect: false;
}

export interface GoalEventReportSummary {
  event_id: string;
  title: string;
  type_id: string | null;
  type_version: number | null;
  received_at: string;
  journal_seq: number;
  judgments: GoalWorkEventJudgment[];
}

export interface GoalEventWorkGap {
  requirement_id: string;
  statement: string;
  current_verdict: GoalEventJudgmentVerdict | null;
  human_decision_required: boolean;
}

export interface GoalEventStateView {
  project_id: string;
  goal_id: string;
  intent: {
    title: string;
    why: string;
    business_logic: string;
    source_kind: GoalIntentSourceKind | null;
  };
  config: GoalEventConfigView;
  requirements: GoalEventRequirementStatus[];
  latest_reports: GoalEventReportSummary[];
  gaps: GoalEventWorkGap[];
  observed_event_cursor: number;
  /** Max work-event journal_seq on this Goal; 0 when the Goal has no work events yet. */
  goal_event_cursor: number;
  event_list_next_cursor: number | null;
  owner: GoalEventWorkStateView["owner"];
  work_status: GoalEventWorkStateView["work_status"];
  agreement: GoalEventWorkStateView["agreement"];
  progress_summary: GoalEventWorkStateView["progress_summary"];
  concerns: GoalEventWorkStateView["concerns"];
  pending_decisions: GoalEventWorkStateView["pending_decisions"];
  applied_decisions: GoalEventWorkStateView["applied_decisions"];
  current_decisions: GoalEventWorkStateView["current_decisions"];
  closure: GoalEventWorkStateView["closure"];
  can_record: boolean;
  recorded_not_completed: boolean;
  completion_effect: boolean;
}

export interface GoalEventDirectoryItem {
  goal_id: string;
  title: string;
  work_status: GoalEventWorkStateView["work_status"];
  completion_effect: boolean;
  can_record: boolean;
  next_hint: string;
  unmet_requirement_count: number;
  pending_decision_count: number;
  blocking_concern_count: number;
  updated_at: string;
}

export interface GoalEventDirectoryQuery {
  project_id: string;
  work_status?: GoalEventWorkStateView["work_status"];
  limit?: number;
  /** List pagination cursor `updated_at|goal_id`, not a journal/event cursor. */
  after_cursor?: string;
}

export interface GoalEventDirectoryPage {
  goals: GoalEventDirectoryItem[];
  next_cursor: string | null;
  observed_event_cursor: number;
}

export interface ResolvedPlanningEventAdoption {
  adopted_planning: GoalEventAdoptedPlanningRef[];
  types: GoalEventTypeDefinitionInput[];
  default_requirements: PlanningMethodDefaultRequirement[];
}

export interface GoalEventListQuery {
  after_cursor?: number;
  limit?: number;
}

export interface GoalEventListPage {
  events: GoalWorkEventRecord[];
  next_cursor: number | null;
  observed_event_cursor: number;
}

export interface GoalEventHistoryQuery {
  before_cursor?: number;
  limit?: number;
}

export interface GoalEventHistoryPage {
  events: GoalWorkEventRecord[];
  next_cursor: number | null;
  observed_event_cursor: number;
}

export type GoalHistoryLane = "result" | "decision" | "problem" | "other";

export interface GoalEventTimelineItem {
  event_id: string;
  journal_seq: number;
  received_at: string;
  title: string;
  kind: "configuration" | "report" | "system";
  type_id: string | null;
  type_name: string | null;
  semantic_family: GoalEventSemanticFamily | null;
  system_operation?: string | null;
  lane?: GoalHistoryLane;
  actor_id: string;
  actor_kind: "user" | "runtime" | null;
}

export interface GoalEventTimelinePage {
  items: GoalEventTimelineItem[];
  next_cursor: number | null;
  observed_event_cursor: number;
}

export interface GoalEventRequirementReport {
  event_id: string;
  actor_id: string;
  actor_kind: "user" | "runtime" | null;
  verdict: GoalEventJudgmentVerdict;
  received_at: string;
  journal_seq: number;
  basis: GoalEventJudgmentBasis | null;
  tier: GoalEventBasisTier;
  gap: GoalEventBasisGap | null;
  /** True for `machine_verified` and `peer_reviewed`; a report is never the person's decision either way. */
  substitutes_human_decision: false;
}

/** What stands behind a requirement that is met: the person's acceptance, or an independently verified report where none is asked. */
export const goalEventSatisfactionGrounds = ["user_accepted", "machine_verified", "peer_reviewed"] as const;
export type GoalEventSatisfactionGround = (typeof goalEventSatisfactionGrounds)[number];

export interface GoalEventRequirementStatus {
  requirement_id: string;
  goal_id: string;
  statement: string;
  origin: {
    kind: "goal_event_requirement" | "imported_acceptance_criterion" | "imported_human_approval" | "create_input";
    decision_method?: GoalAcceptanceCriterion["decision_method"];
    pass_condition?: string;
    config_version?: number;
    planning?: Extract<GoalEventRequirementSource, { kind: "planning" }>;
    policy_binding_ids?: string[];
  };
  bound_type_ids: string[];
  human_decision_required: boolean;
  current_report: GoalEventRequirementReport | null;
  user_conclusion: GoalEventUserConclusion | null;
  currently_satisfied: boolean;
  /** What it is met by; null while it is not met. Execution, verification and the person's acceptance are never folded into one. */
  satisfied_by: GoalEventSatisfactionGround | null;
  /**
   * True when the person's conclusion was about another version than the one the latest report checked: the conclusion no longer
   * counts for this requirement until they decide again (user decision 2026-11-11: per requirement, by version).
   */
  conclusion_superseded: boolean;
}

export interface GoalEventLatestReportsQuery {
  limit?: number;
}

export interface GoalEventLatestReports {
  reports: GoalReportWorkEventRecord[];
  observed_event_cursor: number;
}

export interface GoalEventFactsApi {
  /** The calls that change the event state of a Goal; the facade hands them out instead of forwarding each one. */
  readonly state: GoalEventStateApi;
  /** The calls that remember a createIntent request and the artifacts it recorded. */
  readonly intent: GoalEventIntentApi;
  configure(input: ConfigureGoalEventsInput): ConfigureGoalEventsResult;
  configureRequested(
    input: ConfigureGoalEventsApplicationInput,
    resolveAdoption: (projectId: string, requested: GoalEventAdoptedPlanningRequest[]) => ResolvedPlanningEventAdoption,
  ): ConfigureGoalEventsResult;
  report(input: ReportGoalEventsInput): ReportGoalEventsRecordedResult;
  readConfig(projectId: string, goalId: string): GoalEventConfigView;
  listEvents(projectId: string, goalId: string, query?: GoalEventListQuery): GoalEventListPage;
  listLatestEvents(projectId: string, goalId: string, query?: GoalEventHistoryQuery): GoalEventHistoryPage;
  listLatestTimeline(projectId: string, goalId: string, query?: GoalEventHistoryQuery): GoalEventTimelinePage;
  listLatestReports(projectId: string, goalId: string, query?: GoalEventLatestReportsQuery): GoalEventLatestReports;
  readEvent(projectId: string, goalId: string, eventId: string): GoalWorkEventRecord;
  readCurrentRequirements(projectId: string, goalId: string): GoalEventRequirementStatus[];
  /** The platform sessions that reported the requirement done on their own word alone. */
  selfSupportingSessions(projectId: string, goalId: string, requirementId: string): ReadonlySet<string>;
  /** Persisted createIntent channel; independent of timeline pagination. Null when no intent_created fact exists. */
  readIntentSourceKind(projectId: string, goalId: string): GoalIntentSourceKind | null;
  readObservedEventCursor(projectId: string): number;
  /** Whether the event state owns the Goal; a Goal that does not exist is refused first. */
  isEventStateOwner(projectId: string, goalId: string): boolean;
  runImmediate<T>(operation: () => T): T;
}

/** The writes and reads of a Goal's event state (its owner, work state, progress, concerns, decisions, agreement, closure, resume, notes). */
export interface GoalEventStateApi {
  readWorkState(projectId: string, goalId: string): GoalEventWorkStateView;
  adoptOwner(input: {
    project_id: string;
    goal_id: string;
    actor_id: string;
    source: "intent" | "configuration" | "continue";
    outcome?: string;
  }): void;
  recordNote(input: RecordGoalNoteInput): GoalEventMutationResult;
  recordProgress(input: RecordGoalProgressSummaryInput): GoalEventProgressResult;
  readProgressReceipt(projectId: string, goalId: string, actorId: string, key: string): GoalEventProgressResult | null;
  applyConcern(input: ApplyGoalConcernInput): GoalEventConcernResult;
  requestDecision(input: RequestGoalDecisionInput): GoalEventDecisionRequestResult;
  citeDecision(input: CiteGoalDecisionInput): GoalEventDecisionResult;
  recordTrustedDecision(
    input: RecordGoalUserDecisionInput,
    persistGovernance: (normalized: RecordGoalUserDecisionInput) => GoalEventTrustedDecisionRecord,
  ): GoalEventDecisionResult;
  setAgreement(input: SetGoalEventAgreementInput): GoalEventAgreementResult;
  submitClosure(input: SubmitGoalEventClosureInput): GoalEventClosureResult;
  resumeWork(input: ResumeGoalEventWorkInput): GoalEventResumeResult;
}

/** What a createIntent request leaves behind: the replay of an earlier answer, the answer to remember, and the artifacts it recorded. */
export interface GoalEventIntentApi {
  replay(projectId: string, actorId: string, idempotencyKey: string, hash: string): CreateGoalIntentResult | null;
  remember(projectId: string, actorId: string, idempotencyKey: string, hash: string, result: CreateGoalIntentResult, at: string): void;
  recordArtifacts(input: {
    project_id: string;
    goal_id: string;
    actor_id: string;
    actor_kind?: "user" | "runtime";
    source_kind?: GoalIntentSourceKind;
    outcome?: string;
    requirements?: CreateGoalIntentRequirementInput[];
  }): void;
}
