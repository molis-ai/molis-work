import { AsyncLocalStorage } from "node:async_hooks";
import { observationPluginDataCleared } from "./observation-host.js";
import { reconcileSkillSettings } from "./agent-definitions/skill-settings-lifecycle.js";
import { pluginErrors, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { forgetDeclaredRulesIn, forgetInstallJudgmentsIn } from "@molis-ai/molis-work-module-judgment-rules";
import { forgetInstallationBindings, forgetInstallationProjectBindings, installationIdsWithBindings } from "./connector-plugin-requests.js";
import { forgetInstallationOriginalFiles } from "./material-original-files.js";
import { forgetInstallationAttachments } from "./material-attachments.js";
import { hostLog } from "./host-log.js";
import { heldInstalls, installedIdentities, sameInstallScope, type InstallScope } from "./plugin-holders.js";
import { forgetSandboxImageBindings } from "./sandbox-image-generation.js";
import { removeSandboxOwnerFiles, type SandboxOwnerFilesScope } from "./plugin-sandbox-owner-files.js";
import { HomeConsentLedger } from "./home-plugin-store.js";
import { noteRetained } from "./uninstall-retained.js";
import { forgetInstallationPlatformRecords, forgetRetainedPlatformRecords } from "./partition-platform-services.js";

export interface DiscardCleanupContext {
  /** All scopes whose kept data is being discarded in this confirmation transaction (prevents dual-instance mutual blocking). */
  readonly excludeScopes: readonly InstallScope[];
  /** Retained-record cleanups run once all replacement halves start and before exposure. */
  readonly preExpose: Array<() => Promise<void>>;
  /** Errors recorded during pre-expose retained-record cleanup (surfaced as `retained_cleanup_incomplete` without aborting install). */
  readonly errors: unknown[];
}

const discardCleanupStorage = new AsyncLocalStorage<DiscardCleanupContext>();

export function withDiscardCleanup<T>(excludeScopes: readonly InstallScope[], run: (ctx: DiscardCleanupContext) => Promise<T>): Promise<T> {
  const ctx: DiscardCleanupContext = { excludeScopes, preExpose: [], errors: [] };
  return discardCleanupStorage.run(ctx, () => run(ctx));
}

export function currentDiscardCleanup(): DiscardCleanupContext | undefined {
  return discardCleanupStorage.getStore();
}

export async function flushPreExposeDiscardCleanup(): Promise<void> {
  const ctx = discardCleanupStorage.getStore();
  if (!ctx || !ctx.preExpose.length) return;
  const tasks = ctx.preExpose.splice(0);
  const results = await Promise.allSettled(tasks.map(task => task()));
  for (const result of results) {
    if (result.status === "rejected") ctx.errors.push(result.reason);
  }
}

export interface RetainedCleanupOptions {
  readonly excludeScopes?: readonly InstallScope[];
}

function installedElsewhereExcluding(home: string, installId: string, excludeScopes: readonly InstallScope[]): boolean {
  try {
    return heldInstalls(home).some(held => held.record.state !== "uninstalled"
      && held.record.install_id === installId
      && !excludeScopes.some(scope => sameInstallScope(held.scope, scope)));
  } catch (error) {
    hostLog.warn("connections", "installation_holders_unreadable", error, { install_id: installId });
    return true;
  }
}

function pluginHeldElsewhereExcluding(home: string, pluginId: string, installId: string, excludeScopes: readonly InstallScope[]): boolean {
  try {
    return heldInstalls(home).some(held => held.record.plugin_id === pluginId
      && !(held.record.install_id === installId && excludeScopes.some(scope => sameInstallScope(held.scope, scope))));
  } catch (error) {
    hostLog.warn("functions", "plugin_holders_unreadable", error, { plugin_id: pluginId, install_id: installId });
    return true;
  }
}

/**
 * An installation's authorization in this project (or its Home-level activation): original-file registrations, and in a project the
 * accounts bound to its records (BL-356). Every uninstall drops these even when private data is kept; a reinstall needs a new file
 * selection and binding. Files and accounts themselves stay. The installation slots go with the last installation of the same identity (BL-596).
 * The default rules the plugin declared and the judgments it recorded are data, not authorization: they go only when the data goes
 * (`dataGoes`, by default what the record says; the discard of kept data says it does), never with an uninstall that keeps the data (RAC-503).
 */
export function forgetInstallationRecords(scope: SandboxOwnerFilesScope, record: PluginInstanceRecord, dataGoes: boolean = !record.retain_private_data): void {
  if (!scope.home) return;
  reconcileSkillSettings(scope.home.directory, scope.project_id ?? "home", record.install_id, null);
  if (scope.project_id === null) new HomeConsentLedger(scope.home.directory).revokeProjectReach({ install_id: record.install_id }, new Date().toISOString());
  forgetInstallationOriginalFiles(scope.home.directory, record.plugin_id, record.install_id, scope.project_id ?? null);
  forgetInstallationConnections(scope.home.directory, record.install_id, scope.project_id ? { kind: "project", project_id: scope.project_id } : { kind: "home" });
  forgetInstallationPlatformRecords(scope.home.directory, record.install_id, scope.project_id, { dataGoes: false, installedElsewhere: true });
  if (dataGoes) void forgetRetainedInstallationRecords(scope.home.directory, scope.project_id, record)
    .catch(error => hostLog.warn("plugins", "attachments_not_removed", error));
}

/** Retained data in platform services follows the old installation once its replacement has started and before exposure. */
export function forgetRetainedInstallationRecords(home: string, projectId: string | null, record: PluginInstanceRecord, options?: RetainedCleanupOptions): Promise<void> {
  const scope: InstallScope = projectId ? { kind: "project", project_id: projectId } : { kind: "home" };
  const excludeScopes = options?.excludeScopes?.length ? options.excludeScopes : [scope];
  observationPluginDataCleared(home, record, projectId ?? undefined);
  forgetInstallationRules(home, record, projectId, excludeScopes);
  if (projectId) forgetInstallJudgmentsIn(home, record.install_id, projectId);
  const installedElsewhere = installedElsewhereExcluding(home, record.install_id, excludeScopes);
  forgetRetainedPlatformRecords(home, record.install_id, projectId ?? undefined, installedElsewhere);
  return forgetInstallationAttachments(home, record.plugin_id, record.install_id, projectId);
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
  // Kept: said so to the person taking it off (BL-915), only when it has any binding to keep.
  else if (installationIdsWithBindings(home).includes(installId)) {
    noteRetained(scope.kind === "project" ? scope.project_id : null, installId, { kind: "installation_binding", reason: installed ? "other_holder" : "inventory_unavailable" });
  }
}

/**
 * A first install of an identity in a scope. Bindings an earlier last uninstall could not take (it kept them because the Home could not be
 * read all the way through) must not come back to the new installation: when no place has the identity installed they go first; while
 * one place has it installed, its slots are that place's and stay (BL-596). Nothing is read unless the identity has a binding. A Home that
 * still cannot be read refuses the install, as the installs that name things do: it is not guessed whether the old bindings are in use.
 * The refusal says why, so the person mends the library rather than retrying: every attempt is refused until it can be read.
 */
export function forgetLeftoverInstallationBindings(home: string, installId: string, scope: InstallScope): void {
  if (scope.kind === "home") new HomeConsentLedger(home).revokeProjectReach({ install_id: installId }, new Date().toISOString());
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
function forgetInstallationRules(home: string, record: PluginInstanceRecord, projectId: string | null, excludeScopes: readonly InstallScope[]): void {
  const forgotten = forgetDeclaredRulesIn(home, record.plugin_id, projectId, pluginHeldElsewhereExcluding(home, record.plugin_id, record.install_id, excludeScopes));
  if (forgotten && (forgotten.removed.length || forgotten.kept.length || forgotten.bindings)) hostLog.debug("functions", "declared_rules_forgotten", { plugin_id: record.plugin_id, project_id: projectId, ...forgotten });
  if (forgotten?.kept.length) noteRetained(projectId, record.install_id, { kind: "declared_rule", reason: "other_holder" });
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
