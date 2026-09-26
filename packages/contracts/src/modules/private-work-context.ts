export * from "./session-messages.js";
import type { ContractDescriptor } from "../platform/package.js";
export * from "./runtime-project-context.js";

export const modulesPrivateWorkContextContract = {
  contractId: "io.molis.work.module.private-work-context.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/private-work-context.md",
} as const satisfies ContractDescriptor;

export interface RuntimeWorkContext {
  runtime_id: string;
  stable_work_context_id: string | null;
  host_declares_stable: boolean;
  /** Canonical host workspace, independent from the optional Session ID. */
  workspace?: RuntimeWorkspaceContext | null;
}

export interface NormalizedRuntimeWorkContext {
  runtime_id: string;
  stable_work_context_id: string | null;
  workspace?: NormalizedRuntimeWorkspaceContext;
}

export interface RuntimeWorkspaceContext {
  canonical_path: string;
  realpath_verified: boolean;
}

export interface NormalizedRuntimeWorkspaceContext extends RuntimeWorkspaceContext {
  workspace_id: string;
  display_name: string;
}

export interface RuntimeProjectSuggestionClue {
  kind: RuntimeProjectSuggestionClueKind;
  value: string;
}

export type RuntimeProjectSuggestionClueKind =
  | "workspace"
  | "path"
  | "directory"
  | "repository"
  | "session_title"
  | "runtime"
  | "recent_project"
  | "project_name";

export interface RuntimeSessionHostSignals {
  runtime_id: string;
  molis_work_session_id: string | null;
  native_runtime_session_id: string | null;
  legacy_work_context_id: string | null;
  surface_id: string | null;
  goal_id: string | null;
  runtime_context: RuntimeWorkContext;
  project_suggestion_clues: RuntimeProjectSuggestionClue[];
}

export type PrivateWorkContextJsonValue =
  | null
  | boolean
  | number
  | string
  | PrivateWorkContextJsonValue[]
  | { [key: string]: PrivateWorkContextJsonValue };

/**
 * Runtime adapters may attach opaque, local-only metadata. The owner filters
 * sensitive event metadata before persistence, but does not reinterpret an
 * adapter's session metadata during this compatibility migration.
 */
export type PrivateWorkContextMetadata = Record<string, unknown>;

export type WorkSessionProvenance =
  | "molis_work_created"
  | "runtime_discovered"
  | "explicitly_linked"
  | "legacy_migrated";

export type WorkSessionStatus = "discovered" | "active" | "closed";

export interface WorkSessionRecord {
  session_id: string;
  runtime_id: string;
  native_runtime_session_id: string | null;
  correlation_token: string | null;
  correlation_expires_at: string | null;
  surface_id: string | null;
  project_id: string | null;
  current_goal_id: string | null;
  workspace_id: string | null;
  workspace_path: string | null;
  title: string | null;
  status: WorkSessionStatus;
  provenance: WorkSessionProvenance;
  metadata: PrivateWorkContextMetadata;
  created_at: string;
  updated_at: string;
}

export interface WorkSessionGoalLink {
  link_id: string;
  session_id: string;
  goal_id: string;
  relation: "current" | "history";
  linked_by: string;
  created_at: string;
  ended_at: string | null;
}

export const WORK_SESSION_EVENT_SOURCES = ["molis_work_tui", "molis_work"] as const;
export type WorkSessionEventSource = (typeof WORK_SESSION_EVENT_SOURCES)[number];

export const WORK_SESSION_EVENT_KINDS = [
  "user_message",
  "runtime_message",
  "tool",
  "approval",
  "status",
  "artifact",
  "terminal_output",
] as const;
export type WorkSessionEventKind = (typeof WORK_SESSION_EVENT_KINDS)[number];

/** A successful Goal operation's existing secondary Session activity. */
export interface RuntimeSessionReadResult {
  sessionGoalId: string | null;
  sessionRegistry:
    | { status: "unavailable"; message: string; session: null }
    | { status: "ready"; session: Pick<WorkSessionRecord,
        "session_id" | "runtime_id" | "native_runtime_session_id" | "surface_id" | "project_id"
        | "current_goal_id" | "workspace_id" | "status" | "provenance"> | null };
}

export interface RuntimeGoalSessionActivity {
  goal_id: string;
  actor_id: string;
  event: Omit<AppendWorkSessionEventInput, "session_id">;
}

export interface WorkSessionEventRecord {
  event_id: string;
  session_id: string;
  source: WorkSessionEventSource;
  kind: WorkSessionEventKind;
  source_id: string;
  source_order: number;
  occurred_at: string;
  content: string | null;
  content_available: boolean;
  metadata: PrivateWorkContextMetadata;
  created_at: string;
}

export const WORK_SESSION_HANDOFF_STATES = ["draft", "sending", "failed", "sent", "cancelled"] as const;
export type WorkSessionHandoffState = (typeof WORK_SESSION_HANDOFF_STATES)[number];
export type WorkSessionHandoffDeliveryMode = "native" | "molis_work_fallback";

export interface WorkSessionHandoffRecord {
  package_id: string;
  source_session_id: string;
  source_project_id: string;
  source_goal_id: string;
  target_runtime_id: string;
  target_project_id: string;
  target_workspace_id: string | null;
  target_workspace_path: string | null;
  destination_session_id: string | null;
  state: WorkSessionHandoffState;
  delivery_mode: WorkSessionHandoffDeliveryMode | null;
  content: string | null;
  content_available: boolean;
  content_digest: string;
  attempt_count: number;
  error_code: string | null;
  error_message: string | null;
  retryable: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface RuntimeContextBindingRecord {
  binding_id: string;
  runtime_id: string;
  stable_work_context_id: string;
  project_id: string;
  bound_by: string;
  created_at: string;
  updated_at: string;
}

export interface RuntimeContextBindingEventRecord {
  event_id: string;
  binding_id: string;
  runtime_id: string;
  stable_work_context_id: string;
  type: "context.bound" | "context.rebound" | "context.unbound";
  previous_project_id: string | null;
  project_id: string;
  actor_id: string;
  created_at: string;
}

export interface CreateWorkSessionInput {
  runtime_id: string;
  actor_id: string;
  user_confirmed: boolean;
  native_runtime_session_id?: string | null;
  surface_id?: string | null;
  project_id?: string | null;
  current_goal_id?: string | null;
  workspace_id?: string | null;
  workspace_path?: string | null;
  title?: string | null;
  provenance?: Exclude<WorkSessionProvenance, "runtime_discovered" | "legacy_migrated">;
  metadata?: PrivateWorkContextMetadata;
  correlation_ttl_seconds?: number;
}

export interface DiscoverWorkSessionInput {
  runtime_id: string;
  native_runtime_session_id: string;
  title?: string | null;
  metadata?: PrivateWorkContextMetadata;
}

export interface ExplicitlyLinkWorkSessionInput {
  runtime_id: string;
  native_runtime_session_id: string;
  actor_id: string;
  user_confirmed: boolean;
  project_id?: string | null;
  current_goal_id?: string | null;
  workspace_id?: string | null;
  workspace_path?: string | null;
  title?: string | null;
}

export interface LinkNativeWorkSessionInput {
  session_id: string;
  runtime_id: string;
  native_runtime_session_id: string;
  actor_id: string;
  correlation_token?: string | null;
  surface_id?: string | null;
}

export interface UpdateWorkSessionAssociationsInput {
  session_id: string;
  actor_id: string;
  user_confirmed: boolean;
  project_id?: string | null;
  current_goal_id?: string | null;
  workspace_id?: string | null;
  workspace_path?: string | null;
}

export interface SetWorkSessionStatusInput {
  session_id: string;
  actor_id: string;
  user_confirmed: boolean;
  status: Extract<WorkSessionStatus, "active" | "closed">;
}

export interface ReassignWorkSessionWorkspaceInput {
  project_id: string;
  actor_id: string;
  user_confirmed: boolean;
  previous_workspace_id?: string | null;
  previous_workspace_path?: string | null;
  workspace_id: string | null;
  workspace_path: string | null;
}

export interface WorkSessionListFilter {
  runtime_id?: string;
  project_id?: string;
  workspace_id?: string;
  status?: WorkSessionStatus;
}

export interface AppendWorkSessionEventInput {
  session_id: string;
  source: WorkSessionEventSource;
  kind: WorkSessionEventKind;
  source_id: string;
  source_order?: number;
  occurred_at?: string;
  content: string;
  metadata?: PrivateWorkContextMetadata;
}

export interface CreateWorkSessionHandoffDraftInput {
  source_session_id: string;
  source_project_id: string;
  source_goal_id: string;
  /** Exact revision used for a new package; omitted for legacy/unknown snapshots. */
  source_goal_version?: number | null;
  target_runtime_id: string;
  target_project_id: string;
  target_workspace_id?: string | null;
  target_workspace_path?: string | null;
  content: string;
  actor_id: string;
}

export interface UpdateWorkSessionHandoffDraftInput extends Omit<CreateWorkSessionHandoffDraftInput,
  "source_session_id" | "source_project_id" | "source_goal_id" | "source_goal_version"> {
  package_id: string;
}

export interface LegacyWorkSessionPanelInput {
  panel_id: string;
  project_id: string;
  goal_id: string;
  runtime_id: string;
  work_context_id: string;
  host_session_id: string | null;
  workspace_id: string | null;
  workspace_path: string | null;
  title: string;
  status: "open" | "exited";
  created_at: string;
  updated_at: string;
}

export interface LegacyRuntimeContextBindingInput {
  binding_id: string;
  runtime_id: string;
  stable_work_context_id: string;
  project_id: string;
  bound_by: string;
  created_at: string;
  updated_at: string;
}

export interface LegacyWorkSessionMigrationInput {
  panels: LegacyWorkSessionPanelInput[];
  bindings: LegacyRuntimeContextBindingInput[];
  before_step?: (step: "after_panels" | "after_bindings" | "before_commit") => void;
}

export interface LegacyWorkSessionMigrationReport {
  created_sessions: number;
  reused_sessions: number;
  receipts_written: number;
  session_ids: string[];
}

export interface LegacySessionMigrationApi {
  migrateLegacy(input: LegacyWorkSessionMigrationInput): LegacyWorkSessionMigrationReport;
}

export interface WorkSessionQueryApi {
  get(sessionId: string): WorkSessionRecord;
  findByNativeRuntimeSession(runtimeId: string, nativeId: string): WorkSessionRecord | null;
  findBySurface(surfaceId: string): WorkSessionRecord | null;
  list(filter?: WorkSessionListFilter): WorkSessionRecord[];
  goalHistory(sessionId: string): WorkSessionGoalLink[];
  events(sessionId: string): WorkSessionEventRecord[];
  eventCount(sessionId: string): number;
  getHandoff(packageId: string): WorkSessionHandoffRecord;
  latestPendingHandoff(sourceSessionId: string): WorkSessionHandoffRecord | null;
  handoffsForSession(sessionId: string): WorkSessionHandoffRecord[];
}

export interface WorkSessionCommandApi {
  createSession(input: CreateWorkSessionInput): WorkSessionRecord;
  discoverSession(input: DiscoverWorkSessionInput): WorkSessionRecord;
  explicitlyLinkSession(input: ExplicitlyLinkWorkSessionInput): WorkSessionRecord;
  linkNativeRuntimeSession(input: LinkNativeWorkSessionInput): WorkSessionRecord;
  updateAssociations(input: UpdateWorkSessionAssociationsInput): WorkSessionRecord;
  setStatus(input: SetWorkSessionStatusInput): WorkSessionRecord;
  reassignWorkspaceSessions(input: ReassignWorkSessionWorkspaceInput): WorkSessionRecord[];
  appendEvent(input: AppendWorkSessionEventInput): WorkSessionEventRecord;
  createHandoffDraft(input: CreateWorkSessionHandoffDraftInput): WorkSessionHandoffRecord;
  updateHandoffDraft(input: UpdateWorkSessionHandoffDraftInput): WorkSessionHandoffRecord;
  cancelHandoff(packageId: string): WorkSessionHandoffRecord;
  markHandoffSending(packageId: string): WorkSessionHandoffRecord;
  attachHandoffDestination(input: WorkSessionHandoffDestinationInput): WorkSessionHandoffRecord;
  markHandoffSent(input: WorkSessionHandoffDestinationInput): WorkSessionHandoffRecord;
  markHandoffFailed(input: {
    package_id: string;
    error_code: string;
    error_message: string;
    retryable: boolean;
    destination_session_id?: string | null;
    delivery_mode?: WorkSessionHandoffDeliveryMode | null;
  }): WorkSessionHandoffRecord;
}

export interface WorkSessionHandoffDestinationInput {
  package_id: string;
  destination_session_id: string;
  delivery_mode: WorkSessionHandoffDeliveryMode;
}

/** Public fact operations; excludes opening storage, SQL and repository internals. */
export interface WorkSessionApi extends WorkSessionQueryApi, WorkSessionCommandApi {}


export interface PrivateWorkContextApplicationApi {
  query: WorkSessionQueryApi;
  commands: WorkSessionCommandApi;
}

export type PrivateWorkContextErrorCode =
  | "session.message_content_unavailable"
  | "session.message_conflict"
  | "session.message_target_changed"
  | "session.message_unavailable"
  | "session.message_not_found"
  | "session.message_attempt_changed"
  | "session.not_found"
  | "session.confirmation_required"
  | "session.identity_conflict"
  | "session.runtime_mismatch"
  | "session.correlation_invalid"
  | "session.invalid_input"
  | "session.handoff_not_found"
  | "session.handoff_invalid_state"
  | "session.registry_unknown"
  | "session.registry_reader_too_old";

export class PrivateWorkContextError extends Error {
  constructor(
    readonly code: PrivateWorkContextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MolisWorkSessionError";
  }
}

/** Compatibility name retained while old Session callers move to the Module API. */
export { PrivateWorkContextError as MolisWorkSessionError };
