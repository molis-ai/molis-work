import { readPluginRuntimeRecords, SqlitePluginRuntimeRepository, type PluginRuntimeDatabase } from "./repository.js";

/** A retired plugin's identity: its id and the publisher signature of the official package that used to ship it. */
export interface RetiredPlugin { readonly plugin_id: string; readonly signature: string }

/** What retiring a plugin's leftovers would change in one project library. */
export interface RetiredInstallPlan {
  /** Its official installs not yet marked uninstalled. */
  readonly installs: readonly string[];
  /** Event cursors it still holds as a subscriber; with no package left they would never be read again. */
  readonly cursors: number;
}

const hasTable = (db: Pick<PluginRuntimeDatabase, "prepare">, name: string) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);

/**
 * Read-only: the leftovers of a plugin the Host no longer ships (specs/batch-06-shared-tools/spec.md, the project step's install cleanup).
 * Only installs of the official package count, as for every adoption step; a third party cannot take a retired id (HOST_PLUGIN_IDS).
 */
export function planRetiredInstalls(db: Pick<PluginRuntimeDatabase, "prepare">, plugin: RetiredPlugin): RetiredInstallPlan {
  const installs = readPluginRuntimeRecords(db).filter(record => record.plugin_id === plugin.plugin_id && record.publisher_signature === plugin.signature
    && record.publisher_trust === "host" && record.state !== "uninstalled").map(record => record.install_id);
  const cursors = hasTable(db, "plugin_event_cursors")
    ? (db.prepare("SELECT COUNT(*) AS n FROM plugin_event_cursors WHERE subscriber_plugin_id = ?").get(plugin.plugin_id) as { n: number }).n : 0;
  return { installs, cursors };
}

/**
 * Mark the planned installs uninstalled the way an uninstall records it, keeping their private values (nothing is deleted on the
 * retirement's behalf; the values stay for the deletion step), and drop the retired plugin's event cursors. Runs inside the caller's
 * transaction; returns what it changed, for the caller's read-back.
 */
export function retireInstalls(db: PluginRuntimeDatabase, plugin: RetiredPlugin, plan: RetiredInstallPlan, at: string): { installs: number; cursors: number } {
  const repository = new SqlitePluginRuntimeRepository(db);
  for (const installId of plan.installs) {
    const record = repository.get(installId);
    if (!record || record.plugin_id !== plugin.plugin_id || record.state === "uninstalled") throw new Error(`install ${installId} changed while it was retired`);
    repository.save({ ...record, state: "uninstalled", retain_private_data: true, last_error_code: null, updated_at: at, uninstalled_at: at });
  }
  const cursors = plan.cursors ? Number((db.prepare("DELETE FROM plugin_event_cursors WHERE subscriber_plugin_id = ?").run(plugin.plugin_id) as { changes?: number | bigint }).changes) : 0;
  return { installs: plan.installs.length, cursors };
}
