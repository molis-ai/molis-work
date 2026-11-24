import type { ActionSubject } from "../platform/action-subjects.js";
import type { ContractDescriptor } from "../platform/package.js";

export const modulesAttentionResumptionContract = {
  contractId: /* @version contract.io.molis.work.module.attention-resumption "io.molis.work.module.attention-resumption.v{version}" */ "io.molis.work.module.attention-resumption.v1",
  kind: "module",
  schemaVersion: /* @version contract.io.molis.work.module.attention-resumption */ 1,
  maturity: "partial",
  ssot: "docs/modules/attention-resumption.md",
} as const satisfies ContractDescriptor;

/**
 * The shape of a subject type and of a reason. Both are the owner plugin's own words, declared in its Manifest (`attention.subjects`,
 * `PluginAttentionDeclaration`); the platform keeps no list of them, and ownership is a separate fact, never implied by a type.
 */
export const ATTENTION_NAME_PATTERN = "^[a-z][a-z0-9_]{0,63}$";
export const isAttentionName = (value: unknown): value is string => typeof value === "string" && new RegExp(ATTENTION_NAME_PATTERN, "u").test(value);
/** A subject type its owner declared (`attention.subjects[].type`). */
export type AttentionSubjectType = string;
export const ATTENTION_CONTENT_REPLICA_ID = 'attention_content';
/** Why the subject needs the person, one of the reasons its owner declared for that type (`attention.subjects[].reasons`). */
export type AttentionReason = string;
export type AttentionStatus = "open" | "in_progress" | "done" | "dismissed";

/**
 * The minimal durable Attention fact migrated in FD2. It stores a reference and
 * a reason, never a copy of the referenced object's content.
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

/** The owner's active references for composition. The caller still needs permission to read each object. */
export interface AttentionSurfaceEntry {
  owner_plugin_id: string;
  subject: ActionSubject;
  reason: AttentionReason;
  /** What the owner declared the reason asks of the person, when it did (`attention.subjects[].reasons[].attention`). */
  attention?: AttentionCategory;
  revision: number;
  entered_at: string;
}

/** What a waiting entry asks of the person; the same words a presentation's status map uses (要你决定／要你验收／失败). */
export type AttentionCategory = "needs_decision" | "needs_acceptance" | "failed";
export const ATTENTION_CATEGORIES: readonly AttentionCategory[] = ["needs_decision", "needs_acceptance", "failed"];

/**
 * How the platform reads one owner's entries for composition, from that owner's trusted Manifest: a subject type's object kind, and the
 * category a reason declares. A type the owner did not declare is not composed.
 */
export interface AttentionSubjectDeclarations {
  objectKind(ownerPluginId: string, subjectType: AttentionSubjectType): string | undefined;
  subjectType(ownerPluginId: string, objectKind: string): AttentionSubjectType | undefined;
  category(ownerPluginId: string, subjectType: AttentionSubjectType, reason: AttentionReason): AttentionCategory | undefined;
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
 * `attention.waiting`. It is the owner's own declaration for the owner's own rows (a kind another plugin declared never shows this
 * owner's), and the platform reads it from the installation, never from an id or a kind written in code.
 */
export type AttentionWaitingDeclarations = ReadonlyMap<string, ReadonlySet<AttentionSubjectType>>;

export interface AttentionQuery {
  list(projectId: string): AttentionEntryRecord[];
  get(projectId: string, entryId: string): AttentionEntryRecord;
  /** The person's Inbox: the unassigned entries, and the owned ones whose owner declared that kind in `declared`. Nothing else. */
  listWaiting(projectId: string, declared: AttentionWaitingDeclarations): AttentionEntryRecord[];
  /** One entry of the person's Inbox; an owned entry its owner did not declare is "not found", as if it were not there. */
  getWaiting(projectId: string, entryId: string, declared: AttentionWaitingDeclarations): AttentionEntryRecord;
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
  type: `attention_entry.${"created" | AttentionStatus | "deleted"}`;
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
