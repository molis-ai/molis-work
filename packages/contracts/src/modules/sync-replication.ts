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

/** A device preference is never part of the shared cloud policy. */
export interface SyncDevicePreference {
  /** Local to this device and authenticated space; null means no choice has been made. */
  readonly automatic: boolean | null;
}

/** Server-authoritative logical bytes, including retained structured versions. */
export interface SyncQuotaStatus {
  readonly limitBytes: number;
  readonly usedBytes: number;
}

/** Current device observation, limited to the explicitly selected collections. Not a cloud revision receipt. */
export interface SpaceSyncProgress {
  readonly selected: number;
  readonly pending: number;
  readonly conflicts: number;
  readonly waiting: number;
  readonly failures: number;
  readonly unavailable: number;
  /** All selected content settled at the last successful check, not a promise that remote writers are idle. */
  readonly complete: boolean;
}

/** Authenticated round hint. Revisions never acknowledge local mutations or advance download cursors. */
export interface SyncRoundSummary {
  readonly format: 1;
  readonly policy: SpaceSyncPolicy;
  readonly quota: SyncQuotaStatus;
  readonly heads: readonly { readonly namespace: string; readonly revision: number }[];
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
