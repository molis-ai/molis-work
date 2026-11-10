import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import { pluginErrors, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginSupervisorState } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginPlatform } from "./plugin-platform.js";
import { pluginCatalogFor } from "./home-side.js";
import { pluginReachable, projectMembershipReach, projectReachablePlugins } from "./project-action-availability.js";
import { homePluginsOutsideBuild } from "./home-registration.js";

/** The catalog remains the only project enablement fact; standalone fixtures have no such catalog. */
export async function projectPluginEnablement(home: string | undefined, projectId: string): Promise<ReadonlyMap<string, boolean> | undefined> {
  const catalog = home ? pluginCatalogFor(home) : undefined;
  if (!catalog) return undefined;
  // The one list actions and routes read (PG-013), so what a project runs and what it may call never disagree.
  const reachable = await catalog({ homeDirectory: home }, value => projectReachablePlugins(value, projectId, homePluginsOutsideBuild(home)));
  if (!reachable) return undefined;
  return new Map(PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => !entry.personal).map(entry => [entry.manifest.plugin_id, pluginReachable(entry, reachable)]));
}

/** Compare what the supervisor is expected to run on either side of the committed Catalog change. */
export function changedProjectPluginEnablement(before: ProjectPluginMembership, after: ProjectPluginMembership): ReadonlyMap<string, boolean> {
  const previous = projectMembershipReach(before), saved = projectMembershipReach(after);
  const changed = new Map<string, boolean>();
  for (const entry of PLATFORM_PLUGIN_REGISTRATIONS) {
    if (!entry.project_runtime || entry.personal) continue;
    const desired = pluginReachable(entry, saved);
    if (desired !== pluginReachable(entry, previous)) changed.set(entry.manifest.plugin_id, desired);
  }
  return changed;
}

/** Only uninstall suppresses project startup (BL-755, Root choice A). Stored disabled records are retried under their existing grants. */
export function installationSwitchedOff(platform: Pick<PluginPlatform, "runtime">, pluginId: string): boolean {
  return platform.runtime.list().some(record => record.plugin_id === pluginId && record.state === "uninstalled");
}

/** Serialize reads with activation changes, so an earlier enable cannot outlive a later disable. */
export function projectPluginEnablementRefresh(platform: PluginPlatform, home: string | undefined, projectId: string): () => Promise<ProjectPluginRefreshResult | null> {
  const pending = new Map<string, { desired: boolean; install: InstallIdentity | null }>();
  let tail = Promise.resolve();
  return () => {
    const next = tail.then(async () => {
      const enabled = await projectPluginEnablement(home, projectId);
      if (!enabled) return null;
      const active = new Set(platform.supervisor.enabledPluginIds());
      const unfinished: ProjectPluginRefreshFailure[] = [];
      for (const { plugin_id } of platform.supervisor.states()) {
        const previous = pending.get(plugin_id);
        const desired = enabled.get(plugin_id);
        if (!previous && (desired === undefined || desired === active.has(plugin_id))) continue;
        // An earlier switch may await plugin code while the Catalog changes.
        const latest = await projectPluginEnablement(home, projectId);
        if (!latest) return null;
        const wanted = latest.get(plugin_id);
        const state = platform.supervisor.state(plugin_id);
        if (wanted === undefined || !state) { pending.delete(plugin_id); continue; }
        const install = readInstallation(platform, plugin_id, state.install_id);
        const resuming = previous?.desired === wanted && sameInstallation(previous.install, install);
        if (!resuming) pending.delete(plugin_id);
        const isActive = platform.supervisor.enabledPluginIds().includes(plugin_id);
        if (!resuming && wanted === isActive) continue;
        // Membership alone cannot restart an explicitly uninstalled plugin (BL-755).
        if (wanted && (install?.state === "uninstalled" || (!install && installationSwitchedOff(platform, plugin_id)))) {
          pending.delete(plugin_id);
          continue;
        }
        const refusal = wanted ? enableRefusal(state, install) : undefined;
        if (refusal !== undefined) { unfinished.push({ plugin_id, desired_enabled: wanted, reason: refusal }); continue; }
        pending.set(plugin_id, { desired: wanted, install: installationIdentity(install) });
        const reason = wanted ? await enableProjectPlugin(platform, plugin_id) : await disableProjectPlugin(platform, plugin_id, install, isActive);
        if (reason === undefined) { pending.delete(plugin_id); continue; }
        unfinished.push({ plugin_id, desired_enabled: wanted, reason });
        const current = readInstallation(platform, plugin_id, platform.supervisor.state(plugin_id)?.install_id);
        if (!install) pending.set(plugin_id, { desired: wanted, install: installationIdentity(current) });
        else if (!sameInstallation(install, current)) pending.delete(plugin_id);
      }
      return unfinished;
    });
    tail = next.then(() => undefined, () => undefined);
    return next;
  };
}

/** One switch a refresh could not finish; only `ProjectPluginRefreshResult` leaves this module. */
interface ProjectPluginRefreshFailure {
  readonly plugin_id: string;
  readonly desired_enabled: boolean;
  readonly reason: string;
}

export type ProjectPluginRefreshResult = readonly ProjectPluginRefreshFailure[];

type InstallIdentity = Pick<PluginInstanceRecord, "install_id" | "installation_generation">;

function installationIdentity(install: PluginInstanceRecord | null): InstallIdentity | null {
  return install && { install_id: install.install_id, installation_generation: install.installation_generation };
}

function sameInstallation(first: InstallIdentity | null, current: InstallIdentity | null): boolean {
  return first?.install_id === current?.install_id && first?.installation_generation === current?.installation_generation;
}

function readInstallation(platform: PluginPlatform, pluginId: string, installId: string | null | undefined): PluginInstanceRecord | null {
  if (!installId) return null;
  const record = platform.runtime.get(installId);
  if (record.install_id !== installId || record.plugin_id !== pluginId) throw pluginErrors.install_replaced("项目插件的运行实例与安装记录不一致");
  return record;
}

function enableRefusal(state: PluginSupervisorState, install: PluginInstanceRecord | null): string | undefined {
  if (state.status === "blocked") return state.message ?? "插件的依赖未满足";
  if (install?.state === "quarantined") return "插件已隔离，需要解除隔离后才能启用";
}

async function enableProjectPlugin(platform: PluginPlatform, pluginId: string): Promise<string | undefined> {
  const state = await platform.supervisor.enable(pluginId);
  if (state.status !== "running") return state.message ?? "插件启用未完成";
}

function alreadyStopped(install: PluginInstanceRecord): boolean {
  return install.state === "disabled" || install.state === "uninstalled" || install.state === "quarantined";
}

async function disableProjectPlugin(platform: PluginPlatform, pluginId: string, install: PluginInstanceRecord | null, active: boolean): Promise<string | undefined> {
  if (active) platform.supervisor.revoke(pluginId);
  // A crashed or never-started installation still needs its disabled record. A quarantine stays in place (RAC-1120).
  if (!install || alreadyStopped(install)) return;
  try {
    const { install: stopped } = await platform.runtime.stop(install.install_id);
    if (!sameInstallation(install, stopped) || stopped.plugin_id !== pluginId) throw pluginErrors.install_replaced("停用的插件安装已变化");
  } catch (error) {
    if (error instanceof ActionError) {
      if (error.code === "plugin.state_invalid") {
        const current = readInstallation(platform, pluginId, install.install_id);
        if (current && sameInstallation(install, current) && alreadyStopped(current)) return;
      } else if (error.code !== "plugin.executor_failed") {
        throw error;
      }
      return error.message;
    }
    return "插件停用未完成";
  }
}
