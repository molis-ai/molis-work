import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginPlatform } from "./plugin-platform.js";

/** The parts of a platform that closing it touches. */
type ClosingPlatform = Pick<PluginPlatform, "runtime" | "supervisor">;

/**
 * Closes one plugin of a platform that is closing. Closing a Home, a project or the Host is not switching a plugin off: it is stopped with its record
 * kept enabled (`preserve_enabled`), so the next start runs it, and then revoked (the supervisor's own revoke would stop it as disabled).
 *
 * Only a record the Runtime itself reports as running is stopped. The Supervisor does not see everything the Runtime records: a plugin it counts as
 * running may have crashed there, or been stopped with `preserve_enabled` by someone else (now `installed`). The Runtime refuses a shutdown stop of
 * either (`state_invalid`), as it does of a quarantined one, so those are left as they are, and still revoked.
 *
 * Only this installation's record is read, so one that cannot be read does not keep another from being closed. A record that is gone is still
 * stopped: the instance it activated in this process is let go, and the stop reports the missing record (T-124). A record that cannot be read for
 * any other reason is not stopped. Either is one entry of `failures`, not the end of the loop; the caller throws them together once every plugin
 * has been closed.
 */
export async function closePlugin(platform: ClosingPlatform, pluginId: string, installId: string | null, failures: unknown[]): Promise<void> {
  if (installId) await shutdownStop(platform, installId, failures);
  platform.supervisor.revoke(pluginId);
}

/**
 * Closes every plugin of a Home, which has no plugin list of its own: what is closed is what the Runtime records and what the Supervisor runs.
 * Each plugin is closed as closePlugin closes one, except that every installation the Runtime records for it is stopped before it is revoked,
 * once. A plugin can have two records (a package uninstalled, then installed again under another signature), and revoking it on the older one
 * would have the Supervisor stop the installation it runs as switched off (T-227).
 *
 * The installation the Supervisor runs is read by its own id. A list the Runtime cannot give (one stored record it cannot parse) is one entry of
 * `failures`; the plugins the Supervisor runs are closed all the same, and only the records it does not run are left unvisited.
 */
export async function closeHomePlugins(platform: ClosingPlatform, failures: unknown[]): Promise<void> {
  let records: readonly PluginInstanceRecord[] = [];
  try { records = platform.runtime.list(); } catch (error) { failures.push(error); }
  // In record order, as before; a plugin the Supervisor runs whose record is gone comes last.
  for (const pluginId of new Set([...records.map(record => record.plugin_id), ...platform.supervisor.enabledPluginIds()])) {
    const installs = new Set([supervisedInstall(platform, pluginId), ...records.filter(record => record.plugin_id === pluginId).map(record => record.install_id)]);
    for (const installId of installs) if (installId) await shutdownStop(platform, installId, failures);
    platform.supervisor.revoke(pluginId);
  }
}

/** The installation the Supervisor counts as running for the plugin; none when it counts it as anything else. */
export function supervisedInstall(platform: ClosingPlatform, pluginId: string): string | null {
  const state = platform.supervisor.state(pluginId);
  return state?.status === "running" ? state.install_id : null;
}

/** The shutdown stop of one installation, when shutdownStops says so. The read is inside the try: a record the Runtime cannot give is one failure of this close, not the end of the loop. */
async function shutdownStop(platform: ClosingPlatform, installId: string, failures: unknown[]): Promise<void> {
  try { if (shutdownStops(platform, installId)) await platform.runtime.stop(installId, { preserve_enabled: true }); } catch (error) { failures.push(error); }
}

/** Whether a close stops this installation: one that is running, or one whose record is gone (the stop lets its instance go). */
function shutdownStops(platform: ClosingPlatform, installId: string): boolean {
  try { return platform.runtime.get(installId).state === "running"; } catch (error) {
    if ((error as { code?: unknown }).code === "plugin.definition_missing") return true;
    throw error;
  }
}
