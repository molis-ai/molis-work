import { defineErrorCodes } from "../platform/action-errors.js";
import type { ContractDescriptor } from "../platform/package.js";

export const modulesAttentionResumptionContract = {
  contractId: "io.molis.work.module.attention-resumption.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/attention-resumption.md",
} as const satisfies ContractDescriptor;

/** The platform's closed list of subject kinds; ownership is a separate fact, not implied by a kind. */
export const ATTENTION_SUBJECT_TYPES = ["feed_item", "goal_decision", "source_fault"] as const;
export type AttentionSubjectType = typeof ATTENTION_SUBJECT_TYPES[number];
export type AttentionReason = "manual" | "source_rule" | "goal_decision" | "source_fault" | "artifact_out_failed";
export type AttentionStatus = "open" | "in_progress" | "done" | "dismissed";

/**
 * The minimal durable Attention fact migrated in FD2. It stores a reference and
 * a reason, never a copy of the referenced Feed, Goal, or Source content.
 */
export interface AttentionEntryRecord {
  project_id: string;
  entry_id: string;
  /** The explicitly recorded plugin owner; null is an unassigned object, never inferred from its kind or id. */
  owner_plugin_id: string | null;
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
  /** A trusted owner's declaration. Omitting it creates an explicitly unassigned object. */
  owner_plugin_id?: string | null;
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

/**
 * What an owner declared the person's Inbox shows of its entries: the owner plugin's id → the kinds its trusted Manifest lists in
 * `attention.inbox`. It is the owner's own declaration for the owner's own rows (a kind another plugin declared never shows this
 * owner's), and the platform reads it from the installation, never from an id or a kind written in code.
 */
export type AttentionInboxDeclarations = ReadonlyMap<string, ReadonlySet<AttentionSubjectType>>;

export interface AttentionQuery {
  list(projectId: string): AttentionEntryRecord[];
  get(projectId: string, entryId: string): AttentionEntryRecord;
  /** The person's Inbox: the unassigned entries, and the owned ones whose owner declared that kind in `declared`. Nothing else. */
  listInbox(projectId: string, declared: AttentionInboxDeclarations): AttentionEntryRecord[];
  /** One entry of the person's Inbox; an owned entry its owner did not declare is "not found", as if it were not there. */
  getInbox(projectId: string, entryId: string, declared: AttentionInboxDeclarations): AttentionEntryRecord;
  findActiveForSubject(
    projectId: string,
    subjectType: AttentionSubjectType,
    subjectId: string,
    ownerPluginId?: string | null,
  ): AttentionEntryRecord | null;
  findForSubject(
    projectId: string,
    subjectType: AttentionSubjectType,
    subjectId: string,
    ownerPluginId?: string | null,
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
  deleteSubject(projectId: string, subjectType: AttentionSubjectType, subjectId: string, ownerPluginId?: string | null): number;
}

export interface AttentionEvent {
  event_id: string;
  project_id: string;
  entry_id: string;
  /** Recorded with the event, so deleting an entry does not erase its ownership. */
  owner_plugin_id: string | null;
  type: `inbox_entry.${"created" | AttentionStatus | "deleted"}`;
  subject_type: AttentionSubjectType;
  subject_id: string;
  at: string;
}

export interface AttentionEvents {
  list(projectId: string, entryId?: string): AttentionEvent[];
}

export interface AttentionApi {
  readonly query: AttentionQuery;
  readonly commands: AttentionCommands;
  readonly events: AttentionEvents;
}

export { attentionErrors } from "./attention-errors.js";

/**
 * Inbox's own error codes, every one `inbox.<reason>`. The Inbox entries are this module's facts, but the Feed plugin (which composes the module)
 * and the Inbox plugin (which lists and closes them) both refuse in the Inbox's name and share no other package, so the declaration is here.
 * Statuses are the ones the Inbox route answered for the codes' old names (`inbox_entry_not_found`, and the Pages code `pages.invalid` Inbox borrowed).
 */
export const inboxErrors = defineErrorCodes("inbox", {
  entry_not_found: "not_found",
  invalid: "invalid",
  /** The scene binding changed since the caller read it. */
  revision_conflict: "conflict",
});
