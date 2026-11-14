import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { relative } from "node:path";
import { pluginErrors, type PluginDatabaseVersionSwitch, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertUpgradeDiskSpace, captureUpgradeSnapshot, openHomeSqliteFile, restoreUpgradeSnapshot, retainStorageOwner } from "@molis-ai/molis-work-storage";
import { hostLog } from "./host-log.js";
import { diagnosticId } from "./home-unavailable-owners.js";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import type { PluginPlatformHome } from "./home-side.js";
import { installedLibraryUpgradeFile } from "./installed-plugin-libraries.js";
import { ProjectStatementProcess, type StatementLimits } from "./project-statement-process.js";
import type { DatabaseUpgradeCall } from "./project-statement-protocol.js";

/** Upgrades can rewrite entire tables. Use a separate bound from ordinary, interactive writes (S-59). */
export const INSTALLED_UPGRADE_LIMITS: Partial<StatementLimits> = { transactionMs: 45_000, rssMb: 512, heapMb: 128 };

export async function commitInstalledDatabaseUpgrade(request: DatabaseUpgradeCall, authorize: () => void,
  limits: Partial<StatementLimits> = INSTALLED_UPGRADE_LIMITS): Promise<void> {
  const worker = new ProjectStatementProcess("", null, limits);
  try {
    const result = await worker.prepareHome(request, undefined, authorize);
    if (!result.ok) throw result.error;
  } finally { await worker.close(); }
}

/** A Home library has its own file, so preserve its exact checkpointed bytes before a version switch. */
export async function withInstalledHomeSnapshot(home: PluginPlatformHome, change: PluginDatabaseVersionSwitch,
  read: () => PluginInstanceRecord | null, apply: () => Promise<void>): Promise<void> {
  change.assertCurrent();
  const root = realpathSync(home.directory), lockDirectory = agentRuntimeDirectory(root), owner = home.assertStorageOwner();
  const retained = retainStorageOwner(lockDirectory, owner);
  try {
    const previous = change.previous.databases?.home;
    if (!previous) throw pluginErrors.upgrade_validation_failed("缺少已装 Home 库的清单");
    const file = installedLibraryUpgradeFile(root, change.current, previous, home.stores);
    const relativePath = relative(root, file);
    assertUpgradeDiskSpace(root, [relativePath]);
    const unit = { home: root, lockDirectory, owner, runId: randomUUID(), relativePath };
    captureUpgradeSnapshot(unit, openHomeSqliteFile);
    try { await apply(); }
    catch (error) {
      // The worker has exited. A lost reply after COMMIT has the target row; a rollback must never replace its committed file.
      const current = read();
      hostLog.warn("host", "installed_plugin_upgrade_failed", undefined, { diagnostic_id: diagnosticId("none", `home#${change.current.plugin_id}`), owner: change.current.plugin_id });
      if (current?.installation_generation === change.current.installation_generation && current.manifest_digest === change.current.manifest_digest) {
        restoreUpgradeSnapshot(unit);
      }
      throw error;
    }
  } finally { retained.release(); }
}
