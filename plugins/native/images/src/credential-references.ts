import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface ImageCredentialReference {
  id: string;
  name: string;
  credential_ref: string;
}

/** Inspect old credentials without starting a runner, recovering jobs, or reading secrets. */
export function inspectImageCredentialReferences(homeDirectory: string): ImageCredentialReference[] {
  const path = join(homeDirectory, "images", "images.db");
  if (!existsSync(path)) return [];
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'connections'").get()) return [];
    const rows = db.prepare("SELECT id, name FROM connections").all() as Array<{ id: string; name: string }>;
    return rows.map(row => ({ ...row, credential_ref: `images:${row.id}` }));
  } finally { db.close(); }
}
