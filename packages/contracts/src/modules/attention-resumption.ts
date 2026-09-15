import type { ContractDescriptor } from "../platform/package.js";

export const modulesAttentionResumptionContract = {
  contractId: "io.molis.work.module.attention-resumption.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/attention-resumption.md",
} as const satisfies ContractDescriptor;

export type AttentionSubjectType = "feed_item" | "goal_decision" | "source_fault";
export type AttentionReason = "manual" | "source_rule" | "goal_decision" | "source_fault" | "artifact_out_failed";
export type AttentionStatus = "open" | "in_progress" | "done" | "dismissed";

/**
 * The minimal durable Attention fact migrated in FD2. It stores a reference and
 * a reason, never a copy of the referenced Feed, Goal, or Source content.
 */
export interface AttentionEntryRecord {
  project_id: string;
  entry_id: string;
  subject_type: AttentionSubjectType;
  subject_id: string;
  reason: AttentionReason;
  status: AttentionStatus;
  detail: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateAttentionEntryInput {
  project_id: string;
  subject_type: AttentionSubjectType;
  subject_id: string;
  reason: AttentionReason;
  detail?: Record<string, unknown>;
  entry_id?: string;
  at?: string;
}

export interface AttentionSubjectResolver {
  exists(projectId: string, subjectType: AttentionSubjectType, subjectId: string): boolean;
}

export interface AttentionQuery {
  list(projectId: string): AttentionEntryRecord[];
  get(projectId: string, entryId: string): AttentionEntryRecord;
  findActiveForSubject(
    projectId: string,
    subjectType: AttentionSubjectType,
    subjectId: string,
  ): AttentionEntryRecord | null;
  findForSubject(
    projectId: string,
    subjectType: AttentionSubjectType,
    subjectId: string,
  ): AttentionEntryRecord[];
}

export interface AttentionCommands {
  create(input: CreateAttentionEntryInput): { entry: AttentionEntryRecord; created: boolean };
  ensureFeedItem(
    projectId: string,
    itemId: string,
    reason: Extract<AttentionReason, "manual" | "source_rule">,
    detail?: Record<string, unknown>,
  ): { entry: AttentionEntryRecord; created: boolean };
  setStatus(
    projectId: string,
    entryId: string,
    status: AttentionStatus,
    expectedRevision?: number,
  ): AttentionEntryRecord;
  deleteSubject(projectId: string, subjectType: AttentionSubjectType, subjectId: string): number;
}

export interface AttentionEvent {
  event_id: string;
  project_id: string;
  entry_id: string;
  type: `inbox_entry.${"created" | AttentionStatus | "deleted"}`;
  subject_type: AttentionSubjectType;
  subject_id: string;
  at: string;
}

export interface AttentionEvents {
  list(projectId: string, entryId?: string): AttentionEvent[];
}

export interface LegacyAttentionEntryInput extends AttentionEntryRecord {}

/** Narrow migration surface used only while old inbox_message rows are reconciled. */
export interface AttentionMigrationApi {
  countEntries(): number;
  importLegacy(entry: LegacyAttentionEntryInput): AttentionEntryRecord;
  listFeedItemReferences(): Array<{ project_id: string; subject_id: string }>;
}

export interface AttentionApi {
  readonly query: AttentionQuery;
  readonly commands: AttentionCommands;
  readonly events: AttentionEvents;
  readonly migrations: AttentionMigrationApi;
}

export class AttentionError extends Error {
  constructor(
    readonly code:
      | "attention_entry_not_found"
      | "attention_revision_conflict"
      | "attention_invalid_reference"
      | "attention_invalid_transition",
    message: string,
  ) {
    super(message);
    this.name = "AttentionError";
  }
}
