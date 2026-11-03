import type { DatabaseSync } from "node:sqlite";
import { clearInExistingHomeSqlite } from "@molis-ai/molis-work-storage";
import { FUNCTIONS_STORE_BASELINE } from "./store-schema.js";

/**
 * A plugin installation's judgments in one project go when the installation's data goes (uninstalled without keeping its data, or kept
 * data discarded): the ones it recorded through `services.judgments`. The Host's own judgments and other installations' are not touched;
 * an installation that keeps its data leaves them, and a reinstall of the same signed plugin (the same installation id) finds them.
 */
export function forgetInstallJudgments(db: DatabaseSync, installId: string, projectId: string): number {
  const removed = db.prepare("DELETE FROM function_judgments WHERE install_id = ? AND project_id = ?").run(installId, projectId);
  return Number(removed.changes);
}

/** The same on the Home's Functions library file, without opening a service; nothing happens when there is no library yet. */
export function forgetInstallJudgmentsIn(homeDirectory: string, installId: string, projectId: string): number | undefined {
  return clearInExistingHomeSqlite(homeDirectory, "functions", FUNCTIONS_STORE_BASELINE, (db) => forgetInstallJudgments(db, installId, projectId));
}
