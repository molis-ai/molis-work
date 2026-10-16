/** Public F2 sync configuration boundary; implementation remains outside contracts. */
import type { ContractDescriptor } from "../platform/package.js";
import type { PluginSyncIdentity } from "../platform/plugin-sync.js";
import { PluginSyncError } from "../platform/plugin-sync.js";

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

/** Wire validation only, not authorization or persistence. Unknown but well-formed selections are retained. */
export function parseSpaceSyncPolicy(input: unknown, expectedSpaceId: string): SpaceSyncPolicy {
  const value = object(input, ["spaceId", "revision", "selections"]);
  if (typeof value.spaceId !== "string" || !value.spaceId || value.spaceId !== expectedSpaceId) {
    throw new PluginSyncError("sync.scope", "同步配置不属于当前空间");
  }
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || !Array.isArray(value.selections) || value.selections.length > 1000) invalid();
  const keys = new Set<string>();
  const selections = value.selections.map(item => {
    const row = object(item, ["plugin_id", "publisher_id", "publisher_signature", "collection_id", "schema_version"]);
    const fields = ["plugin_id", "publisher_id", "publisher_signature", "collection_id"] as const;
    for (const field of fields) if (typeof row[field] !== "string" || !row[field].trim() || row[field].length > 500 || row[field] !== row[field].trim()) invalid();
    if (!Number.isSafeInteger(row.schema_version) || Number(row.schema_version) < 1) invalid();
    // One approved schema per publisher/collection; changing versions requires an explicit policy update.
    const key = JSON.stringify(fields.map(field => row[field]));
    if (keys.has(key)) invalid();
    keys.add(key);
    return Object.freeze({ plugin_id: row.plugin_id as string, publisher_id: row.publisher_id as string,
      publisher_signature: row.publisher_signature as string, collection_id: row.collection_id as string,
      schema_version: Number(row.schema_version) });
  });
  return Object.freeze({ spaceId: value.spaceId, revision: Number(value.revision), selections: Object.freeze(selections) });
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key)) || keys.some(key => !(key in record))) invalid();
  return record;
}
function invalid(): never { throw new PluginSyncError("sync.invalid", "同步配置格式不合法"); }

export const modulesSyncReplicationContract = {
  contractId: "io.molis.work.module.sync-replication.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/sync-replication.md",
} as const satisfies ContractDescriptor;
