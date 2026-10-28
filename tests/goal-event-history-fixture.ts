import { mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";

export const goalEventHistoryKinds = ["legacy", "mixed", "approved", "approved-completed"] as const;
export type GoalEventHistoryKind = (typeof goalEventHistoryKinds)[number];

/**
 * A project whose Goals carry history from before the event workflow — criteria and policies it imported as event
 * requirements, approvals and completions — as a project database at the current baseline. The dumps were made once
 * from the 0.2 (v35) project dumps the way a real Home was carried over (repository-anti-corruption §4.1); see
 * `fixtures/goal-event-history/README.md`. Callers open the file with LocalProjectDatabase.
 *
 * Every journal row in the dumps is Goals' (events, receipts), written before Goals was a plugin, so it carries the names the modules use
 * and not the plugin's namespace that the platform gives a plugin's journal rows. Loading puts the namespace on, the way the maintenance
 * for a real Home does (PG-094 S9-2): the plugin reads its own rows by that prefix and sees no others.
 */
export function materializeGoalEventHistory(kind: GoalEventHistoryKind, directory = mkdtempSync(join(tmpdir(), `molis-work-goal-event-history-${kind}-`))): { directory: string; path: string } {
  const path = join(directory, "molis-work.db");
  const staging = mkdtempSync(join(realpathSync(directory), "history-adoption-"));
  const home = join(staging, "offline-home"), prepared = join(home, "molis-work.db");
  mkdirSync(home);
  try {
    const raw = new DatabaseSync(prepared), namespace = `${GOALS_PLUGIN_ID}:`;
    try {
      raw.exec(readFileSync(new URL(`./fixtures/goal-event-history/${kind}.sql`, import.meta.url), "utf8"));
      raw.prepare("UPDATE events SET type = ? || type, object_type = ? || object_type").run(namespace, namespace);
      raw.prepare("UPDATE idempotency_records SET operation = ? || operation").run(namespace);
    } finally { raw.close(); }
    // Keep the historical SQL unchanged. Adopt its unopened copy through the approved maintenance owner before the Host reads it.
    execFileSync(process.execPath, [fileURLToPath(new URL("./fixtures/coding-knowledge-maintenance.mjs", import.meta.url)), "apply",
      "--home", home, "--project-database", prepared, "--project-identity", "--backup", join(staging, "backup")], { stdio: "pipe" });
    renameSync(prepared, path);
  } finally { rmSync(staging, { recursive: true, force: true }); }
  return { directory, path };
}
