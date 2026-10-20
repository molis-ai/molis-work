/** Portable business collections, not SQL tables or executable plugin packages. */
export interface PluginSyncCollection {
  readonly id: string;
  readonly title: string;
  readonly schema_version: number;
  /** Required collections in this same plugin; cross-owner record refs stay in the payload. */
  readonly requires: readonly string[];
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
  readonly collection_id: string;
  readonly replica: import('./sync-transport.js').SyncReplicaAdapter;
  readonly content?: import('./sync-transport.js').SyncContentCodec;
}

/** Only a trusted personal Home activation provides this context. It grants no network access. */
export interface PluginSyncContext {
  readonly spaceId: string;
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
