import { PROCESS_ITEM_TABLES, type ArtifactsSqliteDatabase } from "./repository.js";
import type { PortableProcessItem } from "./replication.js";
import { fixedVersionInvalid } from "./fixed-version-replication-shape.js";

/** One producer identity as a process item records it: the plugin id and the publisher signature, compared together. */
export interface ProcessItemProducer { readonly plugin_id: string; readonly signature: string }

/** What the old producer left in one project library, and why it cannot move as it is. */
export interface ProcessItemReassignmentPlan {
  /** Identities recorded under exactly the old producer, in id order. */
  readonly items: readonly string[];
  readonly versions: number;
  /** Each refusal names the item and the reason; any refusal keeps the whole library as it is. */
  readonly refused: readonly string[];
}

const typeKey = (type: { readonly artifact_type_id: string; readonly schema_version: number }) => `${type.artifact_type_id}@${type.schema_version}`;

/**
 * Read-only preflight of moving a retired producer's process items to the producer that replaces it (Files retirement,
 * specs/batch-06-shared-tools/spec.md「项目库 v2 同版本采用与交接」). Only identities recorded under the exact old plugin id and signature
 * move; every version of each must be one of the declared types, so a line never carries versions the new producer does not write.
 */
export function planProcessItemReassignment(db: Pick<ArtifactsSqliteDatabase, "prepare">, from: ProcessItemProducer,
  types: readonly { readonly artifact_type_id: string; readonly schema_version: number }[]): ProcessItemReassignmentPlan {
  const allowed = new Set(types.map(typeKey));
  const t = PROCESS_ITEM_TABLES;
  const items = (db.prepare(`SELECT artifact_id FROM ${t.identities} WHERE producer_plugin_id=? AND producer_binding_signature=? ORDER BY artifact_id`)
    .all(from.plugin_id, from.signature) as { artifact_id: string }[]).map(row => row.artifact_id);
  const refused: string[] = [];
  let versions = 0;
  for (const id of items) {
    const rows = db.prepare(`SELECT version, artifact_type_id, schema_version FROM ${t.versions} WHERE artifact_id=? ORDER BY version`).all(id) as
      { version: number; artifact_type_id: string; schema_version: number }[];
    if (!rows.length) refused.push(`${id}: no version`);
    for (const row of rows) if (!allowed.has(typeKey(row))) refused.push(`${id}@${row.version}: ${typeKey(row)} is not a type the new producer writes`);
    versions += rows.length;
  }
  // Same plugin id under another signature is another publisher's line: it is never taken over, and its presence is reported.
  const foreign = db.prepare(`SELECT COUNT(*) AS n FROM ${t.identities} WHERE producer_plugin_id=? AND producer_binding_signature<>?`).get(from.plugin_id, from.signature) as { n: number };
  if (foreign.n > 0) refused.push(`${foreign.n} item(s) under ${from.plugin_id} with another signature`);
  return { items, versions, refused };
}

/**
 * Move the planned identities to the new producer inside the caller's transaction. Versions keep everything they recorded: the producing
 * plugin version, author, scope, owner, payload, digest, state, supersedes and times; `artifact_id@version` stays the reference.
 * Returns the number of identities moved; the caller compares it with its plan.
 */
export function reassignProcessItems(db: Pick<ArtifactsSqliteDatabase, "prepare">, from: ProcessItemProducer, to: ProcessItemProducer): number {
  const result = db.prepare(`UPDATE ${PROCESS_ITEM_TABLES.identities} SET producer_plugin_id=?, producer_binding_signature=? WHERE producer_plugin_id=? AND producer_binding_signature=?`)
    .run(to.plugin_id, to.signature, from.plugin_id, from.signature);
  return Number(result.changes);
}

/**
 * The same rule for one carried item (the sync cutover's adoption of an old stream value, sync-cutover.md): an item under exactly the
 * old producer moves to the new one, with every version of a declared type; its versions keep what they recorded. Any other item is
 * returned as it was. A version of an undeclared type refuses the item, as it refuses the library. The carried form repeats the line's
 * producer on each version (the library keeps it once, on the line), so those copies move with it; each version's producing plugin
 * version, author, body and times stay as recorded.
 */
export function reassignPortableProcessItem(item: PortableProcessItem, from: ProcessItemProducer, to: ProcessItemProducer,
  types: readonly { readonly artifact_type_id: string; readonly schema_version: number }[]): PortableProcessItem {
  const identity = item.identity;
  if (identity.producer_plugin_id !== from.plugin_id || identity.producer_binding_signature !== from.signature) return item;
  const allowed = new Set(types.map(typeKey));
  if (!item.versions.length) fixedVersionInvalid(`${identity.artifact_id}: no version`);
  for (const version of item.versions) if (!allowed.has(typeKey(version))) fixedVersionInvalid(`${identity.artifact_id}@${version.version}: ${typeKey(version)} is not a type the new producer writes`);
  const producer = { producer_plugin_id: to.plugin_id, producer_binding_signature: to.signature };
  return { ...item, identity: { ...identity, ...producer }, versions: item.versions.map(version => ({ ...version, ...producer })) };
}
