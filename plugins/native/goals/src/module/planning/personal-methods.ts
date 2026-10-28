import type { PlanningMethodPack, PlanningMethodPackInput } from "@molis-ai/molis-work-contracts/modules/goals";
import { parseJson, type GoalsSqliteDatabase } from "../repository.js";
import { normalizePlanningMethodPack } from "./method-packs.js";

/** Personal scope shares Planning semantics, but never writes project method facts. */
export class PersonalPlanningMethods {
  constructor(private readonly db: GoalsSqliteDatabase) {}

  list(): PlanningMethodPack[] {
    return (this.db.prepare("SELECT pack_json FROM personal_planning_method_packs ORDER BY method_id")
      .all() as Array<{ pack_json?: unknown }>)
      .map(row => parseJson<PlanningMethodPack | null>(row.pack_json, null))
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
