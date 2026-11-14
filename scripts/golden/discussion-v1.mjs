import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { openServerDatabase, SERVER_DATABASE_BASELINE } from "@molis-ai/molis-work-server";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { DISCUSSION_V1_SUBJECTS_CHANGE, goldenPathMatcher } from "../gates/store-schemas.mjs";
import { databaseStructureHash, structureHash } from "../gates/store-schema-snapshot.mjs";
import { goldenFailure } from "./failure.mjs";

const change = DISCUSSION_V1_SUBJECTS_CHANGE;
const matches = goldenPathMatcher(change.store);
const hash = file => {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return databaseStructureHash(db, describeSqliteSchema); } finally { db.close(); }
};
const readSidecar = file => existsSync(file) ? readFileSync(file) : null;
const savedBytes = file => [readFileSync(file), readSidecar(file + "-wal")];

/** Approved old discussion data must be refused by its real owner and stay untouched.
 * Retain it outside the temporary replay Home so the rest can open and a fresh discussion library can be exercised.
 */
export function retainRefusedDiscussion(manifest, restored) {
  const retained = new Map();
  if (SERVER_DATABASE_BASELINE.version !== change.version || structureHash(SERVER_DATABASE_BASELINE.schema, describeSqliteSchema) !== change.after)
    return retained;
  for (const entry of manifest.stores) {
    if (!matches(entry.path) || entry.schema_version !== change.version) continue;
    const file = path.join(restored.home, entry.path);
    const before = savedBytes(file), observed = hash(file);
    if (observed === change.after) continue;
    if (observed !== change.before) throw goldenFailure("golden.discussion_structure_unexpected", entry.path);
    let refusal;
    try { openServerDatabase(path.dirname(file)).close(); }
    catch (error) { refusal = error; }
    if (refusal?.code !== "im.database.structure_invalid") throw goldenFailure("golden.discussion_refusal_expected", entry.path);
    const assertKept = file => {
      if (!isDeepStrictEqual(savedBytes(file), before)) throw goldenFailure("golden.discussion_bytes_changed", entry.path);
    };
    assertKept(file);
    const kept = path.join(restored.scratch, "refused", entry.path);
    mkdirSync(path.dirname(kept), { recursive: true, mode: 0o700 });
    for (const suffix of ["", "-wal", "-shm"]) if (existsSync(file + suffix)) renameSync(file + suffix, kept + suffix);
    assertKept(kept);
    retained.set(entry.path, { file: kept, assertKept: () => assertKept(kept) });
    openServerDatabase(path.dirname(file)).close();
  }
  return retained;
}
