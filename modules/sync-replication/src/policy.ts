import type { SpaceSyncPolicy } from "@molis-ai/molis-work-contracts/modules/sync-replication";
import { syncError } from "./sync-errors.js";
/** Wire validation only, not authorization or persistence. Unknown but well-formed selections are retained. */
export function parseSpaceSyncPolicy(input: unknown, expectedSpaceId: string): SpaceSyncPolicy {
  const value = object(input, ["spaceId", "revision", "selections"]);
  if (typeof value.spaceId !== "string" || !value.spaceId || value.spaceId !== expectedSpaceId) {
    throw syncError("scope", "同步配置不属于当前空间");
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
function invalid(): never { throw syncError("invalid", "同步配置格式不合法"); }
