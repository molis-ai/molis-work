import { pluginErrors, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { removeSandboxOwnerFiles } from "./plugin-sandbox-owner-files.js";
import { removeInstalledPluginLibrary } from "./installed-plugin-libraries.js";
import type { PluginPlatformHome } from "./home-side.js";

/** Verify the KV owner before touching files; finish owner files, the ledger-owned Home library, then KV before publishing a reinstall. */
export function discardInstallationOwnerData(scope: { home?: PluginPlatformHome | null; project_id: string | null }, record: PluginInstanceRecord, deleteInstallationData?: (installId: string) => void): void {
  if (!deleteInstallationData) throw pluginErrors.state_invalid("Plugin 的宿主没有本安装的 KV 数据清理能力，暂不能丢弃数据");
  if (record.execution === "sandbox") removeSandboxOwnerFiles(scope, record.install_id);
  if (scope.home) removeInstalledPluginLibrary(scope.home.directory, record, scope.home.stores);
  deleteInstallationData(record.install_id);
}
