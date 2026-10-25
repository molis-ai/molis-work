import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPlatform } from "./plugin-platform.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { pluginCatalogFor } from "./home-side.js";
import { pluginReachable, projectReachablePlugins } from "./project-action-availability.js";

/** The catalog remains the only project enablement fact; standalone fixtures have no such catalog. */
export async function projectPluginEnablement(home: string | undefined, projectId: string): Promise<ReadonlyMap<string, boolean> | undefined> {
  const catalog = home ? pluginCatalogFor(home) : undefined;
  if (!catalog) return undefined;
  // The one list actions and routes read (PG-013), so what a project runs and what it may call never disagree.
  const reachable = await catalog({ homeDirectory: home }, value => projectReachablePlugins(value, projectId));
  if (!reachable) return undefined;
  return new Map(PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => !entry.personal).map(entry => [entry.manifest.plugin_id, pluginReachable(entry, reachable)]));
}

/** Serialize reads with activation changes, so an earlier enable cannot outlive a later disable. */
export function projectPluginEnablementRefresh(platform: PluginPlatform, home: string | undefined, projectId: string): () => Promise<void> {
  let tail = Promise.resolve();
  return () => {
    const next = tail.then(async () => {
      const enabled = await projectPluginEnablement(home, projectId);
      if (!enabled) return;
      const active = new Set(platform.supervisor.enabledPluginIds());
      for (const state of platform.supervisor.states()) {
        const wanted = enabled.get(state.plugin_id);
        if (wanted === false && active.has(state.plugin_id)) {
          platform.supervisor.revoke(state.plugin_id);
          if (state.install_id) await platform.runtime.stop(state.install_id);
        } else if (wanted === true && !active.has(state.plugin_id)) await platform.supervisor.enable(state.plugin_id);
      }
    });
    tail = next.catch(() => {}); return next;
  };
}

/** Settings finish only after an already-open project has stopped or enabled its Runtime owners. */
export async function refreshOpenProjectPlugins(host: MolisWorkLocalHost, projectId: string): Promise<void> {
  const project = host.projects().find(item => item.project_id === projectId && item.state !== "closing");
  if (project) await host.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience: "user", permissions: [] }, project);
}
