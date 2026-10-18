import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";

/** Project owner identity comes from the trusted catalog, never from a plugin contribution. */
export interface PluginProjectCleanup {
  readonly owner_id: string;
  readonly declaration: ProjectDataDeclaration;
}

export function assertProjectCleanupEntries(entries: readonly { definition: PluginDefinition; project_data?: PluginProjectCleanup }[]): void {
  const owners = new Set<string>();
  for (const entry of entries) {
    const owner = entry.project_data;
    if (!owner) continue;
    if (entry.definition.execution === "sandbox" || !owner.owner_id || owners.has(owner.owner_id)) {
      throw new ActionError("actions.forbidden", "项目清理只接受可信且唯一的 Home 插件数据主人");
    }
    owners.add(owner.owner_id);
  }
}

/** The wrapper lives until all activations stop; each delivery reads the currently published generation. */
export function registerPluginProjectCleanup(home: string, runtime: PluginRuntime,
  entries: readonly { definition: PluginDefinition; project_data?: PluginProjectCleanup }[]): () => void {
  const hooks = projectDeletedHooksFor(home);
  const dispose = entries.flatMap(entry => {
    const owner = entry.project_data;
    if (!owner) return [];
    const pluginId = entry.definition.manifest.plugin_id;
    return [hooks.register({
      id: owner.owner_id, label: owner.declaration.label,
      clear(projectId) {
        const record = runtime.list().find(item => item.plugin_id === pluginId && item.state !== "uninstalled");
        const contribution = record && runtime.contribution(record.install_id);
        if (contribution?.kind === "app" && contribution.onProjectDeleted) {
          requireSynchronous(contribution.onProjectDeleted(projectId), "项目清理前必须同步停止后台工作");
        }
        return owner.declaration.purge(home, projectId);
      },
    })];
  });
  return () => { for (const release of dispose.reverse()) release(); };
}
