import type { PlanningMethodPack, PlanningMethodPackInput } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsSqliteDatabase } from "../repository.js";
import Database from "better-sqlite3";
import { normalizePlanningMethodPack } from "./method-packs.js";

/** The App supplies a location; only the owner opens and reads its stored facts. */
export function readPersonalPlanningMethods(databasePath: string): PlanningMethodPack[] {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { return new PersonalPlanningMethods(db).list(); }
  finally { db.close(); }
}

/** The host calls this inside its existing catalog creation/upgrade transaction. */
export function createPersonalPlanningMethodSchema(db: { exec(sql: string): unknown }): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS personal_planning_method_packs (
      method_id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      pack_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

/** Personal scope shares Planning semantics, but never writes project method facts. */
export class PersonalPlanningMethods {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  list(): PlanningMethodPack[] {
    // Older catalogs legitimately have no personal library. Reading is never migration.
    if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'personal_planning_method_packs'").get()) return [];
    return (this.db.prepare("SELECT pack_json FROM personal_planning_method_packs ORDER BY method_id")
      .all() as Array<{ pack_json?: unknown }>)
      .map(row => parsePack(row.pack_json))
      .filter((pack): pack is PlanningMethodPack => pack != null);
  }

  save(input: PlanningMethodPackInput, at: string): PlanningMethodPack {
    return this.db.transaction(() => {
      const current = this.list().find(pack => pack.method_id === input.method_id) ?? null;
      const saved = normalizePlanningMethodPack(input, "personal", current, at);
      this.db.prepare(`
        INSERT INTO personal_planning_method_packs (
          method_id, version, enabled, pack_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(method_id) DO UPDATE SET
          version = excluded.version,
          enabled = excluded.enabled,
          pack_json = excluded.pack_json,
          updated_at = excluded.updated_at
      `).run(saved.method_id, saved.version, saved.enabled ? 1 : 0,
        JSON.stringify(saved), saved.created_at, saved.updated_at);
      return saved;
    }).immediate();
  }

  delete(methodId: string): boolean {
    return this.db.prepare("DELETE FROM personal_planning_method_packs WHERE method_id = ?").run(methodId).changes > 0;
  }
}

function parsePack(value: unknown): PlanningMethodPack | null {
  if (typeof value !== "string" || !value) return null;
  try { return JSON.parse(value) as PlanningMethodPack; }
  catch { return null; }
}
