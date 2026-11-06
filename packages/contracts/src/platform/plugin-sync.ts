/** Portable business collections, not SQL tables or executable plugin packages. */
export interface PluginSyncCollection {
  readonly id: string;
  readonly title: string;
  readonly schema_version: number;
  /** Required when the plugin declares both Home and project libraries. */
  readonly database?: "home" | "project";
  /** Required collections in this same plugin; cross-owner record refs stay in the payload. */
  readonly requires: readonly string[];
  readonly tracking?: readonly SyncTrackedTable[];
  readonly sections?: import("./plugin-sync-sections.js").SyncSectionsDeclaration;
  readonly aggregates?: readonly SyncAggregateDeclaration[];
}

export interface PluginSyncDeclaration {
  readonly protocol_version: 1;
  readonly collections: readonly PluginSyncCollection[];
}

export interface PluginSyncIdentity {
  readonly plugin_id: string;
  readonly publisher_id: string;
  readonly publisher_signature: string;
}

/** Delivered by an active installation; identity and authorization come from the Host, not the payload. */
export interface PluginSyncBinding {
  /** Passive existence only, inside this owner and current project; grants no sync selection or content access. */
  readonly hasReference?: (projectId: string, assetId: string, version?: number) => boolean;
  /** Freeze derived owner exports before upload; failed business keys remain independently queued. */
  readonly prepareUploads?: () => Promise<readonly {key:string;error:unknown}[]>;
  readonly collection_id: string;
  readonly replica: import('./sync-transport.js').SyncReplicaAdapter;
  readonly content?: import('./sync-transport.js').SyncContentCodec;
  readonly copy?: (direction: 'source' | 'target') => import('../services/placement.js').ProjectCopyOwner;
  readonly locate?: (key: string) => string | null;
}

/** Only a trusted personal Home activation provides this context. It grants no network access. */
export interface PluginSyncContext {
  readonly spaceId: string;
  /** Fixed owner documents admitted by the Host registry, keyed by collection identity. */
  readonly documents?: Readonly<Record<string, import("./plugin-sync-registration.js").SyncDocumentStorage>>;
  assertActive(): void;
}

/** A replica-local revision is a CAS token, never a globally ordered version. */
export interface PluginSyncSnapshot extends PluginSyncIdentity {
  readonly protocol_version: 1;
  readonly spaceId: string;
  readonly projectId: string;
  readonly collection_id: string;
  readonly schema_version: number;
  readonly source_revision: string;
  readonly payload: unknown;
}

/** Local pilot interface. No transport, discovery, upload permission or incremental guarantee. */
export interface PluginSyncSnapshotAdapter {
  readonly declaration: PluginSyncDeclaration;
  read(collectionId: string): PluginSyncSnapshot;
  /** Full collection reconciliation; expectedRevision MUST come from the target replica's read. */
  apply(snapshot: PluginSyncSnapshot, expectedRevision: string): { status: "applied" | "unchanged"; revision: string };
}

export type SyncFailureReason = "invalid" | "unsupported" | "scope" | "conflict" | "dependencies" | "busy" | "limit" | "unavailable";

export type SyncPortableRow = Record<string, string | number | null>;
export interface SyncAggregateRecords { record: SyncPortableRow; children: Record<string, SyncPortableRow[]> }
/** Declarative business projection. The platform checks every table and column against this installation's library declaration. */
export interface SyncAggregateDefinition {
  kind: string;
  table: string;
  columns: readonly string[];
  children: readonly { table: string; parent: string; columns: readonly string[]; orderBy: string; identityColumns?: readonly string[] }[];
  versionColumn?: string;
  timestampVersionColumn?: string;
  busyColumn?: string;
  validate(value: SyncAggregateRecords): void;
  dependencies?(value: SyncAggregateRecords, context: import('./plugin-sync-registration.js').AggregateReplicaContext, projectId: string, database?: PluginSyncBusinessReader): void;
  copy?: {
    kind: string;
    references?(value: SyncAggregateRecords, projectId: string): readonly import('../services/placement.js').ProjectCopyReference[];
    rebase?(value: SyncAggregateRecords, identity: import('../services/placement.js').ProjectCopyIdentity): void;
  };
}
export type SyncAggregateDeclaration = Omit<SyncAggregateDefinition, 'validate' | 'dependencies' | 'copy'>;

/** Installed-library synchronization. It exposes neither physical connections nor platform metadata. */
export interface PluginSyncClient {
  sections(collectionId: string, definition: import("./plugin-sync-sections.js").SyncSectionsDefinition): PluginSyncBinding;
  collectionCopy(collectionId: string, definition: PluginSyncCollectionDefinition, direction: 'source' | 'target'): import('../services/placement.js').ProjectCopyOwner;
  collection(collectionId: string, definition: PluginSyncCollectionDefinition): import("./sync-transport.js").SyncReplicaAdapter;
  /** Called only inside the same authorized library transaction that removes the business record. */
  retain(collectionId: string, transaction: import('./plugin-database.js').PluginDatabaseTransaction, key: string, value: unknown): void;
  aggregate(collectionId: string, definitions: readonly SyncAggregateDefinition[]): import('./sync-transport.js').SyncReplicaAdapter;
  copy(collectionId: string, definitions: readonly SyncAggregateDefinition[], direction: 'source' | 'target'): import('../services/placement.js').ProjectCopyOwner;
}

export type SyncKeyPart = { readonly column: string } | { readonly literal: string | number | null } | { readonly scope: "projectId" };
export interface SyncTrackedTable {
  /** Mark only while an owner row in one of these same-partition relations exists. */
  readonly existsAny?: readonly {readonly table:string;readonly match:readonly {readonly column:string;readonly rowColumn:string}[]}[];
  /** UPDATE marks only when one branch changed and all of its NEW-row conditions hold. */
  readonly updateAny?: readonly {readonly changed: readonly string[]; readonly where?: readonly {readonly column: string; readonly op: "in" | "not-null"; readonly values?: readonly string[]}[]}[];
  readonly table: string;
  readonly key: readonly SyncKeyPart[];
  readonly lookup?: { readonly table: string; readonly match: readonly {column: string; rowColumn: string}[] };
  readonly where?: readonly {column: string; op: 'eq' | 'gt'; value: string | number | null | {readonly actorId: true}}[];
  readonly revision?: { readonly table: string; readonly key: readonly {column: string; rowColumn: string}[]; readonly column: string; readonly rowColumn: string };
}
/** Borrowed owner-only SQL surface; writes only during the platform's receiving transaction, never a connection or schema API. */
export interface PluginSyncBusinessReader {
  prepare(sql: string): {
    get(...parameters: import('./plugin-database.js').PluginSqlValue[]): import('./plugin-database.js').PluginSqlRow | undefined;
    all(...parameters: import('./plugin-database.js').PluginSqlValue[]): import('./plugin-database.js').PluginSqlRow[];
  };
}
export interface PluginSyncBusinessDatabase extends PluginSyncBusinessReader {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...parameters: import('./plugin-database.js').PluginSqlValue[]): import('./plugin-database.js').PluginSqlRow | undefined;
    all(...parameters: import('./plugin-database.js').PluginSqlValue[]): import('./plugin-database.js').PluginSqlRow[];
    run(...parameters: import('./plugin-database.js').PluginSqlValue[]): unknown;
  };
}
export type PluginSyncOwnerContext = import('./plugin-sync-registration.js').AggregateReplicaContext & { readonly actorId: string };
export interface PluginSyncCollectionOwner {
  authorizeKey(key:string,value?:unknown):void;
  read(key: string): unknown | null;
  apply(key: string, value: unknown | null): void;
  canUpload?(key: string): boolean;
  belongsToProject?(key: string, projectId: string, retained: () => readonly import('./sync-transport.js').SyncMutation[]): boolean;
  locate?(key: string): string | null;
}
export interface PluginSyncCollectionDefinition {
  readonly copy?: PluginSyncCollectionCopy;
  readonly tracking: readonly SyncTrackedTable[];
  create(database: PluginSyncBusinessDatabase, context: PluginSyncOwnerContext): PluginSyncCollectionOwner;
}

export type { SyncSectionTable, SyncSectionDeclaration, SyncSectionDefinition, SyncSectionsDeclaration, SyncSectionsDefinition } from "./plugin-sync-sections.js";

export interface PluginSyncCollectionCopy {
  readonly kind: string;
  keys(database: PluginSyncBusinessReader, projectId: string): readonly string[];
  key(reference: import('../services/placement.js').ProjectCopyReference): string;
  validate(asset: import('../services/placement.js').ProjectCopyAsset, context: import('./plugin-sync-registration.js').AggregateReplicaContext): void;
  references(asset: import('../services/placement.js').ProjectCopyAsset): readonly import('../services/placement.js').ProjectCopyReference[];
  fork(asset: import('../services/placement.js').ProjectCopyAsset, identity: import('../services/placement.js').ProjectCopyIdentity): import('../services/placement.js').ProjectCopyAsset;
  equivalent(left: unknown, right: unknown): boolean;
}
