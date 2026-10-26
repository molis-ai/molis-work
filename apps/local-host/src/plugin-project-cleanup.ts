import { rm } from "node:fs/promises";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import type { HomePluginDatabaseDeclaration, PluginDefinition, PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { homeSqlitePartitionDirectory } from "@molis-ai/molis-work-storage";
import { hasPluginBackground } from "./plugin-background-service.js";
import { clearProjectRows } from "./plugin-project-rows.js";
import { projectDeletedHooksFor, type ProjectDeletedOwner } from "./project-deleted-hooks.js";

/**
 * What the Host's start list says of a shipped plugin's data of a project: the owner's id in the deletion receipt (its
 * `project_plugin_id`), and, for a plugin whose data is not rows its Manifest declares (`project_rows`), how to clear it. Project owner
 * identity comes from the trusted catalog, never from a plugin contribution.
 */
export interface PluginProjectCleanup {
  readonly owner_id: string;
  readonly declaration?: ProjectDataDeclaration;
}

/** A Home plugin as the deletion sees it: who owns its data of a project, and its library when that is partitioned by project. */
export interface PluginProjectCleanupEntry {
  readonly definition: PluginDefinition;
  readonly project_data?: PluginProjectCleanup;
}

/**
 * A library partitioned by project needs an owner of the project's data: the confirmation dialog says what goes, and the deletion
 * removes the project's library. Rows a library declares (`project_rows`) the platform deletes; any other owner the start list names
 * clears its data itself (`purge`). One of the two, never both.
 */
export function assertProjectCleanupEntries(entries: readonly PluginProjectCleanupEntry[]): void {
  const owners = new Set<string>();
  for (const entry of entries) {
    const owner = entry.project_data, id = entry.definition.manifest.plugin_id;
    const library = entry.definition.manifest.databases?.home, partitioned = library?.partition === "project";
    if (library?.project_rows && owner?.declaration) throw new Error(`插件 ${id} 的项目数据要么在 Manifest 里声明（project_rows），要么由启动名单给清理办法，不能两样都有`);
    if (owner) {
      if (entry.definition.execution === "sandbox" || !owner.owner_id || owners.has(owner.owner_id)) {
        throw new ActionError("actions.forbidden", "项目清理只接受可信且唯一的 Home 插件数据主人");
      }
      owners.add(owner.owner_id);
    }
    if (!owner?.declaration && !library?.project_rows && partitioned) throw new Error(`插件 ${id} 的库按项目分开，要声明项目数据（project_data），删项目时才清得到`);
    if (owner?.declaration && !owner.declaration.purge && !partitioned) throw new Error(`插件 ${id} 的项目数据没有清理办法（purge）`);
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
 * (W5-01-RPC-01): the platform stops the background executions the installation accepted in the project (PG-038), then its data of the
 * project goes: the rows its library declares, deleted by the platform on its own connection, waiting for a write the instance has in
 * progress; or, for a library partitioned by project, the library is closed and refused to every call already under way, its own
 * `purge` begins, and once that has settled the project's library is removed, and only then may a call begun after the deletion open
 * it again (specs/plugin-project-partition §2.5). A plugin with background work and no data of a project gets a step of its own that
 * only stops that work; the confirmation lists the work that will stop.
 */
export function registerPluginProjectCleanup(home: string, runtime: PluginRuntime, entries: readonly PluginProjectCleanupEntry[],
  libraries: PluginProjectLibraries): () => void {
  const hooks = projectDeletedHooksFor(home);
  const dispose = entries.flatMap(entry => {
    const pluginId = entry.definition.manifest.plugin_id, signature = entry.definition.manifest.publisher.signature;
    const stopBackground = (projectId: string) => {
      const record = runtime.list().find(item => item.plugin_id === pluginId && item.publisher_signature === signature && item.state !== "uninstalled");
      if (record) libraries.stopProjectBackground(record.install_id, projectId);
      return record;
    };
    const owner = cleanupOwner(home, entry, stopBackground, libraries);
    return owner ? [hooks.register(owner)] : [];
  });
  return () => { for (const release of dispose.reverse()) release(); };
}

type StopBackground = (projectId: string) => PluginInstanceRecord | undefined;

function cleanupOwner(home: string, entry: PluginProjectCleanupEntry, stopBackground: StopBackground, libraries: PluginProjectLibraries): ProjectDeletedOwner | null {
  const { manifest } = entry.definition, owner = entry.project_data, library = manifest.databases?.home;
  if (library?.project_rows) return declaredRowsOwner(home, entry, library, stopBackground);
  if (!owner?.declaration) {
    return hasPluginBackground(entry.definition) ? { id: `plugin-background:${manifest.plugin_id}`, label: "{name} 的后台工作（将停止）", label_values: { name: manifest.name }, words_of: manifest.plugin_id, clear(projectId) { stopBackground(projectId); } } : null;
  }
  const declaration = owner.declaration;
  const partitioned = library?.partition === "project" ? library.store_name : undefined;
  return {
    id: owner.owner_id, label: declaration.label, words_of: manifest.plugin_id,
    clear(projectId) {
      const record = stopBackground(projectId);
      if (!partitioned) return declaration.purge!(home, projectId);
      const release = record ? libraries.clearProjectLibrary(record.install_id, projectId) : undefined;
      let purged: void | Promise<void>;
      try { purged = declaration.purge?.(home, projectId); } catch (error) { release?.(); throw error; }
      return removeAfter(purged, homeSqlitePartitionDirectory(home, partitioned, projectId), release);
    },
  };
}

/**
 * The rows a library declares of a project. Every entry here is on the Host's start list, so its library is the one the Home's store
 * registry holds as its own (`assertDatabaseEntries`). A shipped plugin's step goes under its catalog id with its own words; any other
 * (a fixture the Host was given) goes under its plugin id, its words shown as written beside its name, never looked up for a translation.
 */
function declaredRowsOwner(home: string, entry: PluginProjectCleanupEntry, library: HomePluginDatabaseDeclaration, stopBackground: StopBackground): ProjectDeletedOwner {
  const { manifest } = entry.definition, rows = library.project_rows!, shipped = entry.project_data;
  return {
    id: shipped?.owner_id ?? manifest.plugin_id, words_of: manifest.plugin_id,
    ...shipped ? { label: rows.label } : { label: "{name} 的项目数据：{detail}", label_values: { name: manifest.name, detail: rows.label } },
    clear(projectId) {
      stopBackground(projectId);
      clearProjectRows(home, library, manifest.plugin_id, projectId);
    },
  };
}

async function removeAfter(purged: void | Promise<void>, directory: string, release: (() => void) | undefined): Promise<void> {
  try {
    await purged;
    await rm(directory, { recursive: true, force: true });
  } finally { release?.(); }
}
