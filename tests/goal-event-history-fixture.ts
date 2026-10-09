import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const goalEventHistoryKinds = ["legacy", "mixed", "approved", "approved-completed"] as const;
export type GoalEventHistoryKind = (typeof goalEventHistoryKinds)[number];

/**
 * A project whose Goals carry history from before the event workflow — criteria and policies it imported as event
 * requirements, approvals and completions — as a project database at the current baseline. The dumps were made once
 * from the 0.2 (v35) project dumps the way a real Home was carried over (repository-anti-corruption §4.1); see
 * `fixtures/goal-event-history/README.md`. Callers open the file with LocalProjectDatabase.
 */
export function materializeGoalEventHistory(kind: GoalEventHistoryKind): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), `molis-work-goal-event-history-${kind}-`));
  const path = join(directory, "molis-work.db");
  const raw = new DatabaseSync(path);
  try { raw.exec(readFileSync(new URL(`./fixtures/goal-event-history/${kind}.sql`, import.meta.url), "utf8")); }
  finally { raw.close(); }
  return { directory, path };
}
