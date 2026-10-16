/** Opaque, owner-validated item replication. Versions are server-issued, not timestamps. */
export interface SyncMutation {
  operationId: string;
  key: string;
  base: number;
  value: unknown | null;
}
export interface SyncEvent extends SyncMutation { revision: number }
export interface SyncReplicaAdapter {
  next(): SyncMutation | null;
  receive(event: SyncEvent): void;
  cursor(): number;
  counts(): { pending: number; conflicts: number };
  conflicts(): { key: string; reason: string; waiting?: boolean }[];
  /** Retry unapplied records whose owner reported missing dependencies, without overwriting local edits. */
  retryWaiting?(): void;
  resolve(key: string, choice: 'local' | 'remote'): void;
}

/** Trusted owner declarations for a project-consistent replication unit. Never supplied over the wire. */
export type ProjectReplicaRow = Record<string, string | number | null>;
export type ProjectReplicaRows = Record<string, ProjectReplicaRow[]>;
export interface ProjectReplicaTable {
  name: string;
  columns: readonly string[];
  keys: readonly string[];
  /** Owner-defined selection. Parameters are always the trusted project identity. */
  where?: string;
  projectColumn?: string;
  projectExpression?: string;
  journalCondition?: string;
  keepRoot?: boolean;
}
export interface ProjectReplicaDefinition {
  id: string;
  tables: readonly ProjectReplicaTable[];
  journalTypes: readonly string[];
  receiptOperations: readonly string[];
  /** Local sequence fields, including fields nested in owner JSON, are encoded as stable event anchors. */
  sequenceFields: readonly string[];
  validate(rows: ProjectReplicaRows, projectId: string): void;
}
export interface ProjectReplicaSection {
  read(): ProjectReplicaRows;
  validate(value: unknown): ProjectReplicaRows;
  clear(): void;
  write(rows: ProjectReplicaRows): void;
  installJournal(mark: (keyExpression: string) => string): void;
}
