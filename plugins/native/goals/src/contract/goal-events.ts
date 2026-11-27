import type { AcceptanceSubject } from "@molis-ai/molis-work-contracts/modules/acceptance";
import type { GoalAcceptanceCriterion } from "./goals.js";
import type { GoalAcceptanceReading } from "./goal-event-state.js";
import type {
  ApplyGoalConcernInput,
  CiteGoalDecisionInput,
  GoalEventAgreementResult,
  GoalEventClosureResult,
  GoalEventConcernResult,
  GoalEventDecisionRequestResult,
  GoalEventDecisionResult,
  GoalEventMutationResult,
  GoalEventProgressResult,
  GoalEventResumeResult,
  GoalEventSystemPayload,
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

export const goalEventTypeSourceKinds = ["local", "runtime"] as const;
export type GoalEventTypeSourceKind = (typeof goalEventTypeSourceKinds)[number];

export interface GoalEventTypeSource {
  kind: GoalEventTypeSourceKind;
  label?: string;
}

export interface GoalEventFieldSource {
  kind: "local";
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

export interface GoalEventRequirementBinding {
  type_id: string;
  requirement_id: string;
}

export type GoalEventRequirementSource =
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

export interface GoalEventTypeDefinitionInput {
  type_id: string;
  version: number;
  name: string;
  purpose: string;
  semantic_family?: GoalEventSemanticFamily;
  source?: GoalEventTypeSource;
  fields: GoalEventFieldDefinition[];
}

/**
 * Where a requirement Goals hung on the platform came from (`goal_requirement_links`): its origin, and the event types bound to it.
 * What it says, its version and whether it is met are the platform's (`acceptance.read@1` for the Goal's `acceptance_subject`).
 */
export interface GoalRequirementLink {
  requirement_id: string;
  origin: GoalEventRequirementSource | null;
  bound_type_ids: string[];
  created_in_config_version: number;
  created_at: string;
}

export interface ConfigureGoalEventsInput {
  project_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  expected_version: number;
  idempotency_key: string;
  types?: GoalEventTypeDefinitionInput[];
  requirement_bindings?: GoalEventRequirementBinding[];
  /** The Goal's requirements as the platform has them, read by Goals itself before the call (never the caller's). */
  acceptance?: GoalAcceptanceReading;
}

export interface GoalEventConfigView {
  project_id: string;
  goal_id: string;
  version: number;
  types: GoalEventTypeDefinition[];
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

export interface ReportGoalWorkEventInput {
  type_id: string;
  type_version: number;
  title: string;
  fields: Record<string, string>;
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
}

export interface GoalEventConfigurationPayload {
  config_version: number;
  types: GoalEventTypeDefinition[];
  requirement_bindings: GoalEventRequirementBinding[];
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
}

export interface GoalReportWorkEventRecord extends GoalWorkEventBase {
  kind: "report";
  type: GoalEventTypeDefinition | null;
  payload: Record<string, string>;
}

export interface GoalSystemWorkEventRecord extends GoalWorkEventBase {
  kind: "system";
  type: null;
  payload: GoalEventSystemPayload;
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
  progress_summary: GoalEventWorkStateView["progress_summary"];
  completion_effect: boolean;
  can_record: boolean;
}

export interface ConfigureGoalEventsApplicationInput {
  project_id: string;
  goal_id: string;
  actor_id: string;
  actor_kind?: "user" | "runtime";
  expected_version: number;
  idempotency_key: string;
  types?: GoalEventTypeDefinitionInput[];
  requirement_bindings?: GoalEventRequirementBinding[];
  /** Set by Goals' own handler from its reading of the platform, never by a caller. */
  acceptance?: GoalAcceptanceReading;
}

export const goalIntentSourceKinds = ["web", "onboarding", "feed", "runtime", "tree"] as const;
export type GoalIntentSourceKind = (typeof goalIntentSourceKinds)[number];

export interface CreateGoalIntentRequirementInput {
  requirement_id?: string;
  statement: string;
  human_decision_required?: boolean;
}

/** A requirement a new Goal hangs on the platform's acceptance: its id (given, or derived from the Goal and its place), words, and need of the person. */
export interface GoalHungRequirement { requirement_id: string; statement: string; human_decision_required: boolean }

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
  /** The requirements Goals hung on the Goal; what they say and whether they are met is read from the platform for `acceptance_subject`. */
  requirements: GoalRequirementLink[];
  /** The Goal's requirements and acceptance on the platform (`acceptance.read@1`). */
  acceptance_subject: AcceptanceSubject;
  latest_reports: GoalEventReportSummary[];
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
  report(input: ReportGoalEventsInput): ReportGoalEventsRecordedResult;
  readConfig(projectId: string, goalId: string): GoalEventConfigView;
  listEvents(projectId: string, goalId: string, query?: GoalEventListQuery): GoalEventListPage;
  listLatestEvents(projectId: string, goalId: string, query?: GoalEventHistoryQuery): GoalEventHistoryPage;
  listLatestTimeline(projectId: string, goalId: string, query?: GoalEventHistoryQuery): GoalEventTimelinePage;
  listLatestReports(projectId: string, goalId: string, query?: GoalEventLatestReportsQuery): GoalEventLatestReports;
  readEvent(projectId: string, goalId: string, eventId: string): GoalWorkEventRecord;
  /** The requirements Goals hung on the Goal, in the order they were hung. */
  readRequirementLinks(projectId: string, goalId: string): GoalRequirementLink[];
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
  /** Only whether the Goal is open, completed or cancelled: one row, for a reader that asks about many Goals at once. */
  readWorkStatus(projectId: string, goalId: string): GoalEventWorkStateView["work_status"];
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
  }): GoalHungRequirement[];
}
