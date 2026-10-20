/** Opaque, owner-validated item replication. Versions are server-issued, not timestamps. */
export interface SyncMutation {
  operationId: string;
  key: string;
  base: number;
  value: unknown | null;
}
export interface SyncEvent extends SyncMutation { revision: number }
/** Trusted comparison primitive supplied by composition; no dependency on a particular storage implementation. */
export type SyncConflictState = (event: SyncEvent, local: unknown, localRevision: number) => string;
/** Private, account-scoped content. Digest is SHA-256 of the exact bytes, never a local path. */
export interface SyncBlobReference { digest:string; size:number }
export interface SyncBlobSource extends SyncBlobReference { bytes:Uint8Array }
/** Owner-defined projection only; the common transport never inspects plugin payload fields. */
export interface SyncContentCodec {
  encode(key:string,value:unknown):{value:unknown;blobs:SyncBlobSource[]};
  decode(key:string,value:unknown,read:(reference:SyncBlobReference)=>Promise<Uint8Array>):Promise<unknown>;
}
export interface SyncConflictInspection {key:string;revision:number;state:string;reason:string;local:unknown;remote:unknown}
export interface SyncRecoveryRecord {id:string;key:string;choice:string;revision:number}
export interface SyncRecoveryInspection extends SyncRecoveryRecord {local:unknown;remote:unknown}
export interface SyncReplicaAdapter {
  /** Under a full account, keep positive uploads queued but allow independent tombstones. */
  next(options?:{deletionsOnly?:boolean;excludeKeys?:readonly string[]}): SyncMutation | null;
  /** A verified server receipt settles only its frozen prefix; it never advances the download cursor. */
  acknowledge(key:string,operationId:string,revision:number):void;
  /** Explicit retry may revisit an older collection cursor, never a newer head of this same asset. */
  receive(event: SyncEvent,options?:{retry?:boolean}): void;
  cursor(): number;
  /** Bounded owner cleanup only; retain unique originals and all current/recovery references, never execute tasks. */
  maintain?():void;
  counts(): { pending: number; conflicts: number };
  /** Owner-scoped observation of pending writes, frozen uploads and retained conflicts, including deleted records.
   * Absence is unsupported, never evidence that a project is settled. Does not acknowledge or authorize deletion. */
  hasProjectChanges?(projectId:string):boolean;
  /** Owner-declared local navigation only; never a path or authority received from the wire. */
  locate?(key:string):string|null;
  conflicts(): { key: string; reason: string; waiting?: boolean }[];
  /** Retry unapplied records whose owner reported missing dependencies, without overwriting local edits. */
  retryWaiting?(): void;
  /** User confirmations must pass the inspected state; trusted owner reconciliation may omit it. */
  resolve(key: string, choice: 'local' | 'remote', expectedRevision?:number, expectedState?:string): void;
  inspectConflict?(key:string):SyncConflictInspection|null;
  recoveries?():SyncRecoveryRecord[];
  inspectRecovery?(id:string):SyncRecoveryInspection|null;
  restoreRecovery?(id:string,choice:'local'|'remote',expectedRevision:number):void;
}

/** Local-only authenticated protection supplied by trusted composition. Keys never enter transport or owner payloads. */
export interface SyncLocalProtection {
  seal(plaintext: Uint8Array, binding: string): Uint8Array;
  open(sealed: Uint8Array, binding: string): Uint8Array;
}

/** Trusted owner declarations for a project-consistent replication unit. Never supplied over the wire. */
export type ProjectReplicaRow = Record<string, string | number | null>;
export type ProjectReplicaRows = Record<string, ProjectReplicaRow[]>;
/** A trusted host-owned KV namespace. The Runtime owns its table; the author owns only its JSON document. */
export interface PrivateValueReplicationOwner {
  id: string;
  assetKind: string;
  namespacePrefix: string;
  key: string;
  /** Trusted array/id selectors; Runtime derives per-item change keys in the original KV transaction. */
  journal: readonly { array: string; id: string }[];
  project(value: unknown, projectId: string, itemId: string): unknown | null;
  validate(value: unknown, projectId: string, itemId: string): void;
  beforeClear?(local: unknown | null, projectId: string, itemId: string): void;
  /** Return the target's local document, including retained editing floors; null means no record. */
  restore(value: unknown | null, local: unknown | null, projectId: string, itemId: string): unknown | null;
}
export interface ProjectReplicaTable {
  name: string;
  columns: readonly string[];
  keys: readonly string[];
  /** Owner-defined selection. Parameters are always the trusted project identity. */
  where?: string;
  projectColumn?: string;
  projectExpression?: string;
  journalCondition?: string;
  /** Only owner-declared portable columns wake UPDATE journaling; local execution caches need not enqueue uploads. */
  journalColumns?: readonly string[];
  /** Trusted UPDATE-only predicate; $old/$new refer to the owner row. Other operations retain their own condition. */
  journalUpdateCondition?: string;
  keepRoot?: boolean;
}
export interface ProjectReplicaDefinition {
  id: string;
  /** Exact aggregate identity chosen by the owner/composition root, not by wire data. */
  assetKind: string;
  tables: readonly ProjectReplicaTable[];
  journalTypes: readonly string[];
  receiptOperations: readonly string[];
  /** Local sequence fields, including fields nested in owner JSON, are encoded as stable event anchors. */
  sequenceFields: readonly string[];
  validate(rows: ProjectReplicaRows, projectId: string): void;
  /** Owner-selected projection, e.g. redact local connection state before export. */
  project?(rows: ProjectReplicaRows, projectId: string): ProjectReplicaRows;
  /** Owner checks fresh target facts inside the transaction, including tombstones, before any rows are removed. */
  beforeClear?(local: ProjectReplicaRows, projectId: string): void;
  /** Merge trusted target-only state before replacement. Local rows never enter the wire representation. */
  restore?(rows: ProjectReplicaRows, local: ProjectReplicaRows, projectId: string): ProjectReplicaRows;
  /** Exact content-addressed evidence references chosen and validated by this owner, not arbitrary JSON discovery. */
  contentRefs?(rows: ProjectReplicaRows, projectId: string): readonly string[];
}
export interface ProjectReplicaSection {
  read(): ProjectReplicaRows;
  validate(value: unknown): ProjectReplicaRows;
  clear(): void;
  write(rows: ProjectReplicaRows): void;
  installJournal(mark: (keyExpression: string) => string): void;
}
