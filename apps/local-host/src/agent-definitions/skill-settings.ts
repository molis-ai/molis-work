import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { SkillState } from "@molis-ai/molis-work-contracts/services/skills";
import type { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { hostLog } from "../host-log.js";

// A Skill's state in a scope and the record of its uses (specs/skill-packs/contract-design.md §7, §8): two tables of the Agent definitions
// store, read and written only here. Each Skill is `off` until the person enables it, so `off` is no row; a use is recorded only after a
// round accepted the body, and keeps the reference and name of that moment, so it is still read after the installation is gone.

type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;

/** The two tables, as the store's baseline creates them and as the 1 → 2 step adds them (the step only creates them, empty). */
export const SKILL_TABLES_SQL = `
CREATE TABLE skill_settings (
  scope_ref TEXT NOT NULL, install_id TEXT NOT NULL, skill_id TEXT NOT NULL, state TEXT NOT NULL, enabled_at TEXT NOT NULL, enabled_by TEXT NOT NULL,
  revision INTEGER PRIMARY KEY AUTOINCREMENT, updated_at TEXT NOT NULL, actor_id TEXT NOT NULL,
  UNIQUE (scope_ref, install_id, skill_id)
);
CREATE TABLE skill_uses (
  install_id TEXT NOT NULL, skill_id TEXT NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL, ref TEXT NOT NULL, scope_ref TEXT NOT NULL,
  caller TEXT NOT NULL, run_ref TEXT, at TEXT NOT NULL
);
CREATE INDEX skill_uses_by_skill ON skill_uses(install_id, skill_id, at);`;

/** A stored setting: never `off`, which is the absence of a row. */
export type SkillSetting = {
  scope_ref: string;
  install_id: string;
  skill_id: string;
  state: Exclude<SkillState, "off">;
  enabled_at: string;
  enabled_by: string;
  revision: number;
  updated_at: string;
  actor_id: string;
};

/** Who read a Skill's body for a round, as the catalog shows it. */
export type SkillUseCaller = "assistant" | "coding" | "agent";

/** One accepted use, with the reference and name the round used. */
export interface SkillUse {
  ref: SkillRef;
  name: string;
  scope_ref: string;
  caller: SkillUseCaller;
  run_ref?: string;
  at: string;
}

/** Uses kept per Skill: the AI kit says its counts are of this many recent rows. */
export const USES_KEPT = 200;

export class SkillSettingsStore {
  constructor(private readonly db: DatabaseSync, private readonly now: () => Date) {}

  setting(scopeRef: string, installId: string, skillId: string): SkillSetting | undefined {
    return this.db.prepare("SELECT * FROM skill_settings WHERE scope_ref = ? AND install_id = ? AND skill_id = ?").get(scopeRef, installId, skillId) as SkillSetting | undefined;
  }

  settings(scopeRef: string): SkillSetting[] {
    return this.db.prepare("SELECT * FROM skill_settings WHERE scope_ref = ?").all(scopeRef) as SkillSetting[];
  }

  /**
   * Sets one Skill's state in one scope against the revision the person read (0 for `off`), or answers `conflict`. `off` deletes the
   * row; enabling from `off` records when and by whom, and switching between `auto` and `manual` keeps that.
   * SQLite allocates the new revision before the upsert, so a removed setting never reuses an active revision.
   */
  set(scopeRef: string, installId: string, skillId: string, state: SkillState, expected: number, actorId: string): "ok" | "conflict" {
    const current = this.setting(scopeRef, installId, skillId);
    if ((current?.revision ?? 0) !== expected) return "conflict";
    if (state === "off") {
      this.db.prepare("DELETE FROM skill_settings WHERE scope_ref = ? AND install_id = ? AND skill_id = ?").run(scopeRef, installId, skillId);
      return "ok";
    }
    const at = this.now().toISOString();
    this.db.prepare(`INSERT INTO skill_settings(scope_ref,install_id,skill_id,state,enabled_at,enabled_by,updated_at,actor_id) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(scope_ref,install_id,skill_id) DO UPDATE SET state=excluded.state, revision=excluded.revision, updated_at=excluded.updated_at, actor_id=excluded.actor_id`)
      .run(scopeRef, installId, skillId, state, current?.enabled_at ?? at, current?.enabled_by ?? actorId, at, actorId);
    return "ok";
  }

  scopes(installId: string): string[] {
    return (this.db.prepare("SELECT DISTINCT scope_ref FROM skill_settings WHERE install_id = ?").all(installId) as Array<{ scope_ref: string }>).map(row => row.scope_ref);
  }

  /** An installation's version declares only these Skills: the settings of any other leave with it (an upgrade that removed it). */
  keep(scopeRef: string, installId: string, skillIds: readonly string[]): void {
    const kept = new Set(skillIds);
    for (const row of this.db.prepare("SELECT skill_id FROM skill_settings WHERE scope_ref = ? AND install_id = ?").all(scopeRef, installId) as Array<{ skill_id: string }>) {
      if (!kept.has(row.skill_id)) this.db.prepare("DELETE FROM skill_settings WHERE scope_ref = ? AND install_id = ? AND skill_id = ?").run(scopeRef, installId, row.skill_id);
    }
  }

  /** An uninstalled installation's settings leave with it: installing again starts from `off`. Its uses stay. */
  forget(scopeRef: string, installId: string): void {
    this.db.prepare("DELETE FROM skill_settings WHERE scope_ref = ? AND install_id = ?").run(scopeRef, installId);
  }

  /** Records a use the round accepted. A use that fails to record never stops the round. */
  recordUse(use: SkillUse): void {
    try {
      this.db.prepare("INSERT INTO skill_uses(install_id,skill_id,version,name,ref,scope_ref,caller,run_ref,at) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(use.ref.install_id, use.ref.skill_id, use.ref.version, use.name, JSON.stringify(use.ref), use.scope_ref, use.caller, use.run_ref ?? null, use.at);
      this.db.prepare("DELETE FROM skill_uses WHERE install_id = ? AND skill_id = ? AND rowid NOT IN (SELECT rowid FROM skill_uses WHERE install_id = ? AND skill_id = ? ORDER BY at DESC LIMIT ?)")
        .run(use.ref.install_id, use.ref.skill_id, use.ref.install_id, use.ref.skill_id, USES_KEPT);
    } catch (error) { hostLog.warn("agents", "skill_use_unrecorded", error, { install_id: use.ref.install_id, skill_id: use.ref.skill_id }); }
  }

  latestUses(scopeRef: string): Map<string, SkillUse> {
    const rows = this.db.prepare("SELECT ref, name, scope_ref, caller, run_ref, at FROM skill_uses WHERE scope_ref = ? ORDER BY at DESC").all(scopeRef) as Array<{ ref: string; name: string; scope_ref: string; caller: SkillUseCaller; run_ref: string | null; at: string }>;
    const result = new Map<string, SkillUse>();
    for (const { ref: encoded, run_ref, ...row } of rows) {
      const ref = JSON.parse(encoded) as SkillRef, key = `${ref.install_id}\0${ref.skill_id}`;
      if (!result.has(key)) result.set(key, { ...row, ref, ...(run_ref ? { run_ref } : {}) });
    }
    return result;
  }

  /** How many uses each Skill has on record and the last one, by installation and Skill: one read for a whole list (the AI kit's usage). */
  useCounts(): Map<string, { count: number; last_at: string }> {
    const rows = this.db.prepare("SELECT install_id, skill_id, COUNT(*) AS count, MAX(at) AS last_at FROM skill_uses GROUP BY install_id, skill_id").all() as Array<{ install_id: string; skill_id: string; count: number; last_at: string }>;
    return new Map(rows.map(row => [`${row.install_id}\0${row.skill_id}`, { count: Number(row.count), last_at: row.last_at }]));
  }

  /** The uses of one Skill of one installation, newest first; read after the installation is gone too. */
  uses(installId: string, skillId: string, limit = 20): SkillUse[] {
    const rows = this.db.prepare("SELECT ref, name, scope_ref, caller, run_ref, at FROM skill_uses WHERE install_id = ? AND skill_id = ? ORDER BY at DESC LIMIT ?")
      .all(installId, skillId, limit) as Array<{ ref: string; name: string; scope_ref: string; caller: SkillUseCaller; run_ref: string | null; at: string }>;
    return rows.map(({ ref, run_ref, ...row }) => ({ ...row, ref: JSON.parse(ref) as SkillRef, ...(run_ref ? { run_ref } : {}) }));
  }
}
