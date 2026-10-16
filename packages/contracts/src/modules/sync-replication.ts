/** Public F2 sync configuration boundary; implementation remains outside contracts. */
import type { ContractDescriptor } from "../platform/package.js";
import type { PluginSyncIdentity } from "../platform/plugin-sync.js";

/** Persisted per-space selection. Host authenticates its editor separately. No device opt-in flag. */
export interface SpaceSyncPolicy {
  readonly spaceId: string;
  readonly revision: number;
  /** Effective selections include required dependencies at the versions explicitly approved. */
  readonly selections: readonly (PluginSyncIdentity & {
    readonly collection_id: string;
    readonly schema_version: number;
  })[];
}

/** A future policy owner must preserve unsupported selections for repair, never silently upgrade them. */
export type SyncCollectionAvailability = "available" | "adapter_missing" | "schema_unsupported" | "publisher_changed";

export const modulesSyncReplicationContract = {
  contractId: "io.molis.work.module.sync-replication.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/sync-replication.md",
} as const satisfies ContractDescriptor;
