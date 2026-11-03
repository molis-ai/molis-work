import type { ProjectReplicaRows } from './sync-transport.js';

/** A relation is data, never a caller-provided SQL predicate. Both tables belong to this installation. */
export interface SyncSectionTable {
  readonly name: string;
  readonly columns: readonly string[];
  readonly keys: readonly string[];
  readonly keepRoot?: boolean;
  readonly projectColumn?: string;
  readonly parent?: { readonly table: string; readonly column: string; readonly key: string; readonly projectColumn?: string };
}
export interface SyncSectionDeclaration {
  readonly id: string;
  readonly tables: readonly SyncSectionTable[];
  readonly journalTypes: readonly string[];
  readonly receiptOperations: readonly string[];
  readonly sequenceFields: readonly string[];
}
export interface SyncSectionDefinition extends SyncSectionDeclaration {
  validate(rows: ProjectReplicaRows, projectId: string): void;
  project?(rows: ProjectReplicaRows, projectId: string): ProjectReplicaRows;
  beforeClear?(local: ProjectReplicaRows, projectId: string): void;
  restore?(rows: ProjectReplicaRows, local: ProjectReplicaRows, projectId: string): ProjectReplicaRows;
  contentRefs?(rows: ProjectReplicaRows, projectId: string): readonly string[];
}
export interface SyncSectionsDeclaration {
  readonly kind: string;
  readonly business: readonly SyncSectionDeclaration[];
  /** Narrow platform projections, admitted only with their corresponding service permissions. */
  readonly platform: readonly ('goal-context' | 'attention')[];
  readonly journal: boolean;
  /** Owner bootstrap events remain in snapshots but do not create an upload by themselves. */
  readonly journalIgnoredTypes?: readonly string[];
}
export interface SyncSectionsDefinition extends Omit<SyncSectionsDeclaration, 'business'> {
  readonly business: readonly SyncSectionDefinition[];
  validate?(facts: Readonly<Record<string, ProjectReplicaRows>>): void;
}
