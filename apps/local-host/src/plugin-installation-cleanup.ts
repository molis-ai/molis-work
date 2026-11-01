import { pluginErrors, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { forgetDeclaredRulesIn, forgetInstallJudgmentsIn } from "@molis-ai/molis-work-module-functions";
import { forgetInstallationBindings, forgetInstallationProjectBindings, installationIdsWithBindings } from "./connector-plugin-requests.js";
import { forgetInstallationOriginalFiles } from "./material-original-files.js";
import { hostLog } from "./host-log.js";
import { installedIdentities, pluginHeldElsewhere, type InstallScope } from "./plugin-holders.js";
import { forgetSandboxImageBindings } from "./sandbox-image-generation.js";
import { removeSandboxOwnerFiles, type SandboxOwnerFilesScope } from "./plugin-sandbox-owner-files.js";

/**
 * An installation's authorization in this project (or its Home-level activation): original-file registrations, and in a project the
 * accounts bound to its records (BL-356). Every uninstall drops these even when private data is kept; a reinstall needs a new file
 * selection and binding. Files and accounts themselves stay. The installation slots go with the last installation of the same identity (BL-596).
 * The default rules the plugin declared and the judgments it recorded are data, not authorization: they go only when the data goes
 * (`dataGoes`, by default what the record says; the discard of kept data says it does), never with an uninstall that keeps the data (RAC-503).
 */
export function forgetInstallationRecords(scope: SandboxOwnerFilesScope, record: PluginInstanceRecord, dataGoes: boolean = !record.retain_private_data): void {
  if (!scope.home) return;
  forgetInstallationOriginalFiles(scope.home.directory, record.plugin_id, record.install_id, scope.project_id ?? "");
  forgetInstallationConnections(scope.home.directory, record.install_id, scope.project_id ? { kind: "project", project_id: scope.project_id } : { kind: "home" });
  if (dataGoes) forgetInstallationRules(scope.home.directory, record, scope.project_id ?? null);
  // The judgments it recorded in this project are its data too (S-90); a Home-level activation records none.
  if (dataGoes && scope.project_id) forgetInstallJudgmentsIn(scope.home.directory, record.install_id, scope.project_id);
}

/**
 * The accounts an uninstalled installation was bound to: in a project, the ones it used for each of its records there; and, when no other
 * place has the same installation (`install_id`, the same in every project and the Home) still installed, all the rest, its installation
 * slots and its record bindings under every project (BL-596). While one place keeps it, the slots stay: they are shared. A Home that cannot
 * be read all the way through keeps them (a binding left is an unused row; one taken from an installation still in use is not).
 */
export function forgetInstallationConnections(home: string, installId: string, scope: InstallScope): void {
  if (scope.kind === "project") forgetInstallationProjectBindings(home, installId, scope.project_id);
  const installed = installedIdentities(home, { scope, install_id: installId });
  if (installed && !installed.has(installId)) forgetInstallationBindings(home, installId);
}

/**
 * A first install of an identity in a scope. Bindings an earlier last uninstall could not take (it kept them because the Home could not be
 * read all the way through) must not come back to the new installation: when no place has the identity installed they go first; while
 * one place has it installed, its slots are that place's and stay (BL-596). Nothing is read unless the identity has a binding. A Home that
 * still cannot be read refuses the install, as the installs that name things do: it is not guessed whether the old bindings are in use.
 * The refusal says why, so the person mends the library rather than retrying: every attempt is refused until it can be read.
 */
export function forgetLeftoverInstallationBindings(home: string, installId: string, scope: InstallScope): void {
  if (!installationIdsWithBindings(home).includes(installId)) return;
  const installed = installedIdentities(home, { scope, install_id: installId });
  if (!installed) throw pluginErrors.executor_failed("Home 里有插件库读不了（日志 installation_holders_unreadable），不能确认这个插件早先留下的连接绑定还有没有安装在用；修好那个库后再装");
  if (!installed.has(installId)) forgetInstallationBindings(home, installId);
}

/**
 * After a project's deletion: the bindings of every installation that is no longer installed anywhere. The deleted project is already out of
 * the catalog, so its installations do not count, and its library is never read. Bindings an earlier uninstall left behind go in the same pass.
 */
export function forgetOrphanedInstallationBindings(home: string): void {
  const bound = installationIdsWithBindings(home);
  if (bound.length === 0) return;
  const installed = installedIdentities(home);
  if (installed) for (const installId of bound) if (!installed.has(installId)) forgetInstallationBindings(home, installId);
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
  if (record.execution === "sandbox") {
    removeSandboxOwnerFiles(scope, record.install_id);
    if (scope.home && scope.project_id === null) forgetSandboxImageBindings(scope.home.directory, record.install_id);
  }
  if (!record.retain_private_data) deleteInstallationData?.(record.install_id);
  forgetInstallationRecords(scope, record, true);
}
