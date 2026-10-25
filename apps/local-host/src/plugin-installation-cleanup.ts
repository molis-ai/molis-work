import { pluginErrors, type PluginCleanupResult, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { clearPluginProjectRows } from "@molis-ai/molis-work-plugin-runtime";
import { removeSandboxOwnerFiles } from "./plugin-sandbox-owner-files.js";
import { hasInstalledPluginLibrary, removeInstalledPluginLibrary } from "./installed-plugin-libraries.js";
import type { PluginPlatformHome } from "./home-side.js";
import type { ProjectLibrary } from "./plugin-project-library.js";

/** Project cleanup never removes a shared Home library. A unique Home installation closes first, then removes files, its ledger row and KV. */
export function discardInstallationOwnerData(scope: { home?: PluginPlatformHome | null; project_id: string | null; projectLibrary?: ProjectLibrary | null }, record: PluginInstanceRecord,
  deleteInstallationData?: (installId: string) => void): PluginCleanupResult | undefined {
  if (!deleteInstallationData) throw pluginErrors.state_invalid("Plugin 的宿主没有本安装的 KV 数据清理能力，暂不能丢弃数据");
  const kept = scope.project_id !== null && scope.home && hasInstalledPluginLibrary(scope.home.directory, record);
  if (record.execution === "sandbox") removeSandboxOwnerFiles(scope, record.install_id);
  if (scope.project_id !== null && scope.projectLibrary) clearPluginProjectRows(scope.projectLibrary.db, record);
  if (scope.project_id === null && scope.home) removeInstalledPluginLibrary(scope.home.directory, record, scope.home.stores);
  deleteInstallationData(record.install_id);
  return kept ? { notes: ["Home 共享库保留（其他项目可能在用）"] } : undefined;
}
