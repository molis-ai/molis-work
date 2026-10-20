import { rm } from "node:fs/promises";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import type { HomePluginDatabaseDeclaration, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { homeSqlitePartitionDirectory } from "@molis-ai/molis-work-storage";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";

/** Project owner identity comes from the trusted catalog, never from a plugin contribution. */
export interface PluginProjectCleanup {
  readonly owner_id: string;
  readonly declaration: ProjectDataDeclaration;
}

/** A Home plugin as the deletion sees it: who owns its data of a project, and its library when that is partitioned by project. */
export interface PluginProjectCleanupEntry {
  readonly definition: PluginDefinition;
  readonly project_data?: PluginProjectCleanup;
  readonly database?: HomePluginDatabaseDeclaration;
}

/**
 * A library partitioned by project needs an owner of the project's data: the confirmation dialog says what goes, and the deletion
 * removes the project's library. Any other owner clears its data itself (`purge`).
 */
export function assertProjectCleanupEntries(entries: readonly PluginProjectCleanupEntry[]): void {
  const owners = new Set<string>();
  for (const entry of entries) {
    const owner = entry.project_data;
    const partitioned = entry.database?.partition === "project";
    if (!owner) {
      if (partitioned) throw new Error(`插件 ${entry.definition.manifest.plugin_id} 的库按项目分开，要声明项目数据（project_data），删项目时才清得到`);
      continue;
    }
    if (entry.definition.execution === "sandbox" || !owner.owner_id || owners.has(owner.owner_id)) {
      throw new ActionError("actions.forbidden", "项目清理只接受可信且唯一的 Home 插件数据主人");
    }
    if (!owner.declaration.purge && !partitioned) throw new Error(`插件 ${entry.definition.manifest.plugin_id} 的项目数据没有清理办法（purge）`);
    owners.add(owner.owner_id);
  }
}

/** What the deletion asks of the running instance: close its library of the project (`HomePluginExecutor.clearProjectLibrary`). */
export interface PluginProjectLibraries {
  clearProjectLibrary(installId: string, projectId: string): (() => void) | undefined;
}

/**
 * The wrapper lives until all activations stop; each delivery reads the currently published generation. In one turn, as the deletion
 * needs (W5-01-RPC-01): the Plugin's `onProjectDeleted`, then its library of the project closed and refused to every call already under
 * way, then its own `purge` begun. Once that has settled the project's library is removed, and only then may a call begun after the
 * deletion open it again (specs/plugin-project-partition §2.5).
 */
export function registerPluginProjectCleanup(home: string, runtime: PluginRuntime, entries: readonly PluginProjectCleanupEntry[],
  libraries: PluginProjectLibraries): () => void {
  const hooks = projectDeletedHooksFor(home);
  const dispose = entries.flatMap(entry => {
    const owner = entry.project_data;
    if (!owner) return [];
    const pluginId = entry.definition.manifest.plugin_id, signature = entry.definition.manifest.publisher.signature;
    const partitioned = entry.database?.partition === "project" ? entry.database.store_name : undefined;
    return [hooks.register({
      id: owner.owner_id, label: owner.declaration.label,
      clear(projectId) {
        const record = runtime.list().find(item => item.plugin_id === pluginId && item.publisher_signature === signature && item.state !== "uninstalled");
        const contribution = record && runtime.contribution(record.install_id);
        if (contribution?.kind === "app" && contribution.onProjectDeleted) {
          requireSynchronous(contribution.onProjectDeleted(projectId), "项目清理前必须同步停止后台工作");
        }
        if (!partitioned) return owner.declaration.purge!(home, projectId);
        const release = record ? libraries.clearProjectLibrary(record.install_id, projectId) : undefined;
        let purged: void | Promise<void>;
        try { purged = owner.declaration.purge?.(home, projectId); } catch (error) { release?.(); throw error; }
        return removeAfter(purged, homeSqlitePartitionDirectory(home, partitioned, projectId), release);
      },
    })];
  });
  return () => { for (const release of dispose.reverse()) release(); };
}

async function removeAfter(purged: void | Promise<void>, directory: string, release: (() => void) | undefined): Promise<void> {
  try {
    await purged;
    await rm(directory, { recursive: true, force: true });
  } finally { release?.(); }
}
