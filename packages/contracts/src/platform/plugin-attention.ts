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
 * kind may add an entry about it or delete the entries of it; the kinds are the platform's closed list, so a plugin cannot invent
 * one or put an entry about another plugin's object.
 */
export interface PluginAttentionDeclaration {
  readonly subjects: readonly AttentionSubjectType[];
}

/** An entry to add; the project is the call's and the existence of the subject is the declaring plugin's to vouch for. */
export interface PluginAttentionEntryInput {
  readonly subject_type: AttentionSubjectType;
  readonly subject_id: string;
  readonly reason: AttentionReason;
  readonly detail?: Record<string, unknown>;
  readonly entry_id?: string;
  readonly at?: string;
}

export interface PluginAttentionWriter {
  create(input: PluginAttentionEntryInput): { entry: AttentionEntryRecord; created: boolean };
  setStatus(entryId: string, status: AttentionStatus, expectedRevision?: number): AttentionEntryRecord;
  deleteSubject(subjectType: AttentionSubjectType, subjectId: string): number;
}

export interface PluginAttentionClient {
  list(): AttentionEntryRecord[];
  get(entryId: string): AttentionEntryRecord;
  findActiveForSubject(subjectType: AttentionSubjectType, subjectId: string): AttentionEntryRecord | null;
  findForSubject(subjectType: AttentionSubjectType, subjectId: string): AttentionEntryRecord[];
  events(entryId?: string): AttentionEvent[];
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
 * only that plugin's edges and `list` shows only those (S-66).
 */
export interface PluginContextLedgerClient {
  get(key: string): ContextEdge | null;
  list(query?: ContextEdgeQuery): ContextEdge[];
  history(key: string): ContextEdge[];
  join<T>(transaction: PluginDatabaseTransaction, write: (writer: PluginContextLedgerWriter) => T): T;
}
