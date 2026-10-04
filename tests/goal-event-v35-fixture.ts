import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const goalEventV35Kinds = ["legacy", "mixed", "approved", "approved-completed"] as const;
export type GoalEventV35Kind = (typeof goalEventV35Kinds)[number];

/**
 * Load a v35 dump into a temp SQLite file. Callers then open it with LocalProjectDatabase. The dumps are unaltered except
 * that their empty `feed_sources` table, from before the Sources reorganization, is dropped: Sources only creates its
 * current table and no longer upgrades old ones (repository-anti-corruption §9.5 #2), and these fixtures are about Goals.
 */
export function materializeGoalEventV35Fixture(kind: GoalEventV35Kind): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), `molis-work-02-v35-${kind}-`));
  const path = join(directory, "copy.sqlite");
  const sql = readFileSync(new URL(`./fixtures/goal-event-v35/${kind}.sql`, import.meta.url), "utf8");
  const raw = new DatabaseSync(path);
  try {
    raw.exec("PRAGMA foreign_keys = OFF");
    raw.exec("PRAGMA defer_foreign_keys = ON");
    raw.exec(sql);
    if ((raw.prepare("SELECT COUNT(*) AS count FROM feed_sources").get() as { count: number }).count) throw new Error("v35 dump has Sources rows");
    raw.exec("DROP TABLE feed_sources");
  } finally {
    raw.close();
  }
  return { directory, path };
}
