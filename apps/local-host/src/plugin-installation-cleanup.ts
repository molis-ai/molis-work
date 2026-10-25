import { pluginErrors, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { forgetDeclaredRulesIn } from "@molis-ai/molis-work-module-functions";
import { forgetInstallationProjectBindings } from "./connector-plugin-requests.js";
import { forgetInstallationOriginalFiles } from "./material-original-files.js";
import { hostLog } from "./host-log.js";
import { pluginHeldElsewhere } from "./plugin-holders.js";
import { removeSandboxOwnerFiles, type SandboxOwnerFilesScope } from "./plugin-sandbox-owner-files.js";

/**
 * An installation's authorization in this project (or its Home-level activation): original-file registrations, and in a project the
 * accounts bound to its records (BL-356). Every uninstall drops these even when private data is kept; a reinstall needs a new file
 * selection and binding. Files and accounts themselves stay. Installation slots and a Home installation's project bindings stay (BL-596).
 */
export function forgetInstallationRecords(scope: SandboxOwnerFilesScope, record: PluginInstanceRecord): void {
  if (!scope.home) return;
  forgetInstallationOriginalFiles(scope.home.directory, record.plugin_id, record.install_id, scope.project_id ?? "");
  if (scope.project_id) forgetInstallationProjectBindings(scope.home.directory, record.install_id, scope.project_id);
  forgetInstallationRules(scope.home.directory, record, scope.project_id ?? null);
}

/**
 * The scene bindings that name the default rules the plugin's scenes declared go with this installation's data: the person chose to keep
 * none of it. The rules go only with the last installation: while the plugin is still installed (or kept) in another project or the Home,
 * they stay with whatever that installation put on them. A plugin that keeps its data leaves everything (the provider is gone, so nothing
 * calls them); a reinstall registers it again and finds them.
 */
function forgetInstallationRules(home: string, record: PluginInstanceRecord, projectId: string | null): void {
  const forgotten = forgetDeclaredRulesIn(home, record.plugin_id, projectId, pluginHeldElsewhere(home, record.plugin_id, { scope: projectId === null ? { kind: "home" } : { kind: "project", project_id: projectId }, install_id: record.install_id }));
  if (forgotten && (forgotten.removed.length || forgotten.kept.length || forgotten.bindings)) hostLog.debug("functions", "declared_rules_forgotten", { plugin_id: record.plugin_id, project_id: projectId, ...forgotten });
}

/** The synchronous install boundary: verify the KV owner is available before touching files, then finish the person's non-retaining cleanup. */
export function discardInstallationOwnerData(scope: SandboxOwnerFilesScope, record: PluginInstanceRecord, deleteInstallationData?: (installId: string) => void): void {
  if (!record.retain_private_data && !deleteInstallationData) throw pluginErrors.state_invalid("Plugin 的宿主没有本安装的 KV 数据清理能力，暂不能重装");
  if (record.execution === "sandbox") removeSandboxOwnerFiles(scope, record.install_id);
  if (!record.retain_private_data) deleteInstallationData?.(record.install_id);
  forgetInstallationRecords(scope, record);
}
