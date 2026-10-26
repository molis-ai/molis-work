import type {
  AttentionEntryRecord, AttentionEvent, AttentionReason, AttentionStatus, AttentionSubjectType,
} from "../modules/attention-resumption.js";
import type { ContextEdge, ContextEdgeInput, ContextEdgeQuery } from "../modules/context-ledger.js";
import type { PluginDatabaseTransaction } from "./plugin-database.js";

/**
 * The project's Attention (the Inbox's entries: a reference to a subject and why it needs the person) and its Context Ledger
 * (the reference edges between objects) as services of the platform (PG-087, PG-094 S9-0b). Their tables are the platform's
 * (`PROJECT_DATABASE_BASELINE`), so a plugin's own `project_database` cannot reach them; these are the way that can. A write joins
 * the plugin's current write transaction like `services.scheduler` does, and every call asks the grants and the original caller again.
 */
export const PLUGIN_ATTENTION_READ_PERMISSION = "attention:read";
export const PLUGIN_ATTENTION_WRITE_PERMISSION = "attention:write";
export const PLUGIN_CONTEXT_LEDGER_READ_PERMISSION = "context-ledger:read";
export const PLUGIN_CONTEXT_LEDGER_WRITE_PERMISSION = "context-ledger:write";

/**
 * Which kinds of subject a plugin's own objects are, for Attention (`attention` in the Manifest). Only a plugin that declares a
 * kind may add or delete its own objects of it; different plugins may declare the same kind. The owner is recorded separately.
 */
export interface PluginAttentionDeclaration {
  readonly subjects: readonly AttentionSubjectType[];
  /**
   * Which of `subjects` are the person's Inbox: the entries the plugin writes about them show in the Inbox beside the unassigned ones.
   * A kind left out stays the plugin's own (read through `services.attention`); declaring a kind never shows another plugin's entries.
   */
  readonly inbox?: readonly AttentionSubjectType[];
}

/** A subject to address. A write checks this target against the installation's trusted Manifest, never treating it as caller identity. */
export interface PluginAttentionSubjectReference {
  readonly owner_plugin_id: string;
  readonly subject_type: AttentionSubjectType;
  readonly subject_id: string;
}

export type PluginAttentionEntryRecord = AttentionEntryRecord & { owner_plugin_id: string };
export type PluginAttentionEvent = AttentionEvent & { owner_plugin_id: string };

/** An entry to add; its project and stored owner come from the call and installation. The plugin vouches for the subject's existence. */
export interface PluginAttentionEntryInput extends PluginAttentionSubjectReference {
  readonly reason: AttentionReason;
  readonly detail?: Record<string, unknown>;
  readonly entry_id?: string;
  readonly at?: string;
}

export interface PluginAttentionWriter {
  create(input: PluginAttentionEntryInput): { entry: PluginAttentionEntryRecord; created: boolean };
  /** The global entry id still allows closing/reopening another owner or an unassigned entry; returns its actual owner or null. */
  setStatus(entryId: string, status: AttentionStatus, expectedRevision?: number): AttentionEntryRecord;
  deleteSubject(subject: PluginAttentionSubjectReference): number;
}

/**
 * Reads need attention:read and show every explicitly owned entry in this project, with its recorded owner. Unassigned entries
 * remain accessible through their existing direct owner paths until explicit maintenance assigns them; ids and kinds never infer an owner.
 */
export interface PluginAttentionClient {
  list(): PluginAttentionEntryRecord[];
  get(entryId: string): PluginAttentionEntryRecord;
  findActiveForSubject(subject: PluginAttentionSubjectReference): PluginAttentionEntryRecord | null;
  findForSubject(subject: PluginAttentionSubjectReference): PluginAttentionEntryRecord[];
  events(entryId?: string): PluginAttentionEvent[];
  /** Runs `write` inside the plugin's current project transaction (`PluginDatabase.transaction`); the writer is refused once it ends. */
  join<T>(transaction: PluginDatabaseTransaction, write: (writer: PluginAttentionWriter) => T): T;
}

export interface PluginContextLedgerWriter {
  put(input: ContextEdgeInput): ContextEdge;
  remove(key: string, cause: string, recordedAt?: string): ContextEdge | null;
}

/**
 * The edges of this project's ledger; the person the call runs for is the actor of a write and the scope is always this project. The
 * keys are the plugin's own: it passes and reads back bare keys, the platform stores them under the plugin's id, `get`/`history` reach
 * only that plugin's edges and `list` shows only those (S-68).
 */
export interface PluginContextLedgerClient {
  get(key: string): ContextEdge | null;
  list(query?: ContextEdgeQuery): ContextEdge[];
  history(key: string): ContextEdge[];
  join<T>(transaction: PluginDatabaseTransaction, write: (writer: PluginContextLedgerWriter) => T): T;
}
