import { rm } from "node:fs/promises";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { homeSqlitePartitionDirectory } from "@molis-ai/molis-work-storage";
import { hasPluginBackground } from "./plugin-background-service.js";
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
}

/**
 * A library partitioned by project needs an owner of the project's data: the confirmation dialog says what goes, and the deletion
 * removes the project's library. Any other owner clears its data itself (`purge`).
 */
export function assertProjectCleanupEntries(entries: readonly PluginProjectCleanupEntry[]): void {
  const owners = new Set<string>();
  for (const entry of entries) {
    const owner = entry.project_data;
    const partitioned = entry.definition.manifest.databases?.home?.partition === "project";
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

/**
 * What the deletion asks of the executor (`HomePluginExecutor`): stop the installation's background executions accepted in the project,
 * and close and refuse its library of the project.
 */
export interface PluginProjectLibraries {
  stopProjectBackground(installId: string, projectId: string): void;
  clearProjectLibrary(installId: string, projectId: string): () => void;
}

/**
 * The wrapper lives until all activations stop; each delivery reads the currently installed record. In one turn, as the deletion needs
 * (W5-01-RPC-01): the platform stops the background executions the installation accepted in the project (PG-038), then its library of
 * the project is closed and refused to every call already under way, then its own `purge` begins. Once that has settled the project's
 * library is removed, and only then may a call begun after the deletion open it again (specs/plugin-project-partition §2.5). A plugin
 * with background work and no data of a project gets a step of its own that only stops that work; the confirmation lists
 * the work that will stop.
 */
export function registerPluginProjectCleanup(home: string, runtime: PluginRuntime, entries: readonly PluginProjectCleanupEntry[],
  libraries: PluginProjectLibraries): () => void {
  const hooks = projectDeletedHooksFor(home);
  const dispose = entries.flatMap(entry => {
    const owner = entry.project_data;
    const pluginId = entry.definition.manifest.plugin_id, signature = entry.definition.manifest.publisher.signature;
    const stopBackground = (projectId: string) => {
      const record = runtime.list().find(item => item.plugin_id === pluginId && item.publisher_signature === signature && item.state !== "uninstalled");
      if (record) libraries.stopProjectBackground(record.install_id, projectId);
      return record;
    };
    if (!owner) {
      return hasPluginBackground(entry.definition) ? [hooks.register({ id: `plugin-background:${pluginId}`, label: "{name} 的后台工作（将停止）", label_values: { name: entry.definition.manifest.name }, clear(projectId) { stopBackground(projectId); } })] : [];
    }
    const library = entry.definition.manifest.databases?.home;
    const partitioned = library?.partition === "project" ? library.store_name : undefined;
    return [hooks.register({
      id: owner.owner_id, label: owner.declaration.label,
      clear(projectId) {
        const record = stopBackground(projectId);
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
