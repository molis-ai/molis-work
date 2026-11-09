import { MATERIAL_RECENT_KEEP, type MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";

import type { ProjectsSqliteDatabase, Row } from "./sqlite.js";

/**
 * 「最近用过」 (specs/shared-sources-and-surfaces §2.1): the references one caller used in this project, newest first. It lives in the project
 * database, so it goes with the project when it is deleted and is in the project's snapshot. Only the reference is kept, never the content,
 * and its origin is read again each time it is shown. A reference used again moves to the front.
 */
export const MATERIAL_RECENT_USES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS material_recent_uses (
  caller_kind TEXT NOT NULL CHECK (caller_kind IN ('user', 'plugin')),
  caller_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  ref_json TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  used_at TEXT NOT NULL,
  PRIMARY KEY (caller_kind, caller_id, subject_kind, subject_id)
);
CREATE INDEX IF NOT EXISTS material_recent_uses_caller_idx
  ON material_recent_uses(caller_kind, caller_id, sequence);
`;

/** Who used it: the person (their actor id) or a plugin (its id), both from the call context, never from input. */
export interface MaterialRecentCaller { kind: "user" | "plugin"; id: string }

export class MaterialRecentUses {
  constructor(private readonly db: ProjectsSqliteDatabase) {}

  /** Newest first, at most `MATERIAL_RECENT_KEEP`. */
  list(caller: MaterialRecentCaller): MaterialRef[] {
    return (this.db.prepare(`SELECT ref_json FROM material_recent_uses WHERE caller_kind = ? AND caller_id = ? ORDER BY sequence DESC LIMIT ?`)
      .all(caller.kind, caller.id, MATERIAL_RECENT_KEEP) as Row[]).map(row => JSON.parse(String(row.ref_json)) as MaterialRef);
  }

  /** Puts the references in front in the order given (the last one ends up newest), and drops what falls past the twentieth, in one transaction. */
  record(caller: MaterialRecentCaller, refs: readonly MaterialRef[], at: string): void {
    this.db.transaction(() => {
      let sequence = Number((this.db.prepare("SELECT COALESCE(MAX(sequence), 0) AS top FROM material_recent_uses WHERE caller_kind = ? AND caller_id = ?")
        .get(caller.kind, caller.id) as Row).top);
      const write = this.db.prepare(`INSERT INTO material_recent_uses (caller_kind, caller_id, subject_kind, subject_id, ref_json, sequence, used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(caller_kind, caller_id, subject_kind, subject_id) DO UPDATE SET ref_json = excluded.ref_json, sequence = excluded.sequence, used_at = excluded.used_at`);
      for (const ref of refs) write.run(caller.kind, caller.id, ref.subject.kind, ref.subject.id, JSON.stringify(ref), ++sequence, at);
      this.db.prepare(`DELETE FROM material_recent_uses WHERE caller_kind = ? AND caller_id = ? AND sequence NOT IN (
        SELECT sequence FROM material_recent_uses WHERE caller_kind = ? AND caller_id = ? ORDER BY sequence DESC LIMIT ?)`)
        .run(caller.kind, caller.id, caller.kind, caller.id, MATERIAL_RECENT_KEEP);
    })();
  }
}
