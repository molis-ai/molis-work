import { pluginErrors, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { forgetInstallationProjectBindings } from "./connector-plugin-requests.js";
import { forgetInstallationOriginalFiles } from "./material-original-files.js";
import { removeSandboxOwnerFiles, type SandboxOwnerFilesScope } from "./plugin-sandbox-owner-files.js";

/**
 * What the Host keeps in the Home beside an installation's data, for this project (or its Home-level activation): the original files it
 * registered, and in a project the accounts bound to its records there (BL-356). They go when the data goes, so a reinstall under the same
 * installation id reads none of them back. The account bound to its installation slot is every project's and stays (BL-596).
 */
export function forgetInstallationRecords(scope: SandboxOwnerFilesScope, record: PluginInstanceRecord): void {
  if (!scope.home) return;
  forgetInstallationOriginalFiles(scope.home.directory, record.plugin_id, record.install_id, scope.project_id ?? "");
  if (scope.project_id) forgetInstallationProjectBindings(scope.home.directory, record.install_id, scope.project_id);
}

/** The synchronous install boundary: verify the KV owner is available before touching files, then finish the person's non-retaining cleanup. */
export function discardInstallationOwnerData(scope: SandboxOwnerFilesScope, record: PluginInstanceRecord, deleteInstallationData?: (installId: string) => void): void {
  if (!record.retain_private_data && !deleteInstallationData) throw pluginErrors.state_invalid("Plugin 的宿主没有本安装的 KV 数据清理能力，暂不能重装");
  if (record.execution === "sandbox") removeSandboxOwnerFiles(scope, record.install_id);
  if (!record.retain_private_data) deleteInstallationData?.(record.install_id);
  forgetInstallationRecords(scope, record);
}
