import { pluginErrors, type PluginCleanupResult, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { clearPluginProjectRows } from "@molis-ai/molis-work-plugin-runtime";
import { forgetInstallationProjectBindings } from "./connector-plugin-requests.js";
import { forgetInstallationOriginalFiles } from "./material-original-files.js";
import { removeSandboxOwnerFiles, type SandboxOwnerFilesScope } from "./plugin-sandbox-owner-files.js";
import { hasInstalledPluginLibrary, removeInstalledPluginLibrary } from "./installed-plugin-libraries.js";
import type { PluginPlatformHome } from "./home-side.js";
import type { ProjectLibrary } from "./plugin-project-library.js";

/** Original-file registrations and project record bindings are authorization, removed on every uninstall even if private data is kept.
 * The files, accounts, shared installation slots and a Home installation's project bindings stay (BL-356 / BL-596). */
export function forgetInstallationRecords(scope: SandboxOwnerFilesScope, record: PluginInstanceRecord): void {
  if (!scope.home) return;
  forgetInstallationOriginalFiles(scope.home.directory, record.plugin_id, record.install_id, scope.project_id ?? "");
  if (scope.project_id) forgetInstallationProjectBindings(scope.home.directory, record.install_id, scope.project_id);
}

/** Project cleanup preserves Home shared libraries; a stopped unique Home installation removes files, its ledger row, then KV. */
export function discardInstallationOwnerData(scope: { home?: PluginPlatformHome | null; project_id: string | null; projectLibrary?: ProjectLibrary | null }, record: PluginInstanceRecord,
  deleteInstallationData?: (installId: string) => void): PluginCleanupResult | undefined {
  if (!deleteInstallationData) throw pluginErrors.state_invalid("Plugin 的宿主没有本安装的 KV 数据清理能力，暂不能丢弃数据");
  const kept = scope.project_id !== null && scope.home && hasInstalledPluginLibrary(scope.home.directory, record);
  if (record.execution === "sandbox") removeSandboxOwnerFiles(scope, record.install_id);
  if (scope.project_id !== null && scope.projectLibrary) clearPluginProjectRows(scope.projectLibrary.db, record);
  if (scope.project_id === null && scope.home) removeInstalledPluginLibrary(scope.home.directory, record, scope.home.stores);
  deleteInstallationData(record.install_id);
  forgetInstallationRecords(scope, record);
  return kept ? { notes: ["Home 共享库保留（其他项目可能在用）"] } : undefined;
}
