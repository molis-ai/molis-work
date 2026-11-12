import type { PluginTextReader } from "@molis-ai/molis-work-ui-host";
import { namedProjectDataLabel, projectDataLabel } from "./project-deletion-words.js";
import { rm } from "node:fs/promises";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration, PluginDefinition, PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { homeSqlitePartitionDirectory } from "@molis-ai/molis-work-storage";
import { hasPluginBackground } from "./plugin-background-service.js";
import { clearProjectRows } from "./plugin-project-rows.js";
import { projectDeletedHooksFor, type ProjectDeletedOwner } from "./project-deleted-hooks.js";

/**
 * What the Host's start list says of a shipped plugin's data of a project: the owner's id in the deletion receipt (its
 * `project_plugin_id`). What goes is what the Manifest declares (PG-024), and no code of the plugin's clears it. Project owner
 * identity comes from the trusted catalog, never from a plugin contribution.
 */
export interface PluginProjectCleanup {
  readonly owner_id: string;
}

/** A Home plugin as the deletion sees it: who owns its data of a project, and its library when that is partitioned by project. */
export interface PluginProjectCleanupEntry {
  readonly definition: PluginDefinition;
  readonly localePacks: PluginTextReader | null;
  readonly project_data?: PluginProjectCleanup;
}

/** An owner id the start list gives is the Host's to give: one per plugin, and never for a plugin run in the sandbox. */
export function assertProjectCleanupEntries(entries: readonly Pick<PluginProjectCleanupEntry, "definition" | "project_data">[]): void {
  const owners = new Set<string>();
  for (const owner of entries.flatMap(entry => entry.project_data ? [{ ...entry.project_data, sandbox: entry.definition.execution === "sandbox" }] : [])) {
    if (owner.sandbox || !owner.owner_id || owners.has(owner.owner_id)) {
      throw new ActionError("actions.forbidden", "项目清理只接受可信且唯一的 Home 插件数据主人");
    }
    owners.add(owner.owner_id);
  }
}

/**
 * What the deletion asks of the executor (`HomePluginExecutor`): stop the installation's background executions accepted in the project,
 * and close and refuse its library of the project.
 */
export interface PluginProjectLibraries {
  stopProjectBackground(installId: string, projectId: string): Promise<void> | undefined;
  blockProjectLibrary(installId: string, projectId: string): () => void;
  clearProjectLibrary(installId: string, projectId: string): () => void;
}

/**
 * The wrapper lives until all activations stop; each delivery reads the currently installed record. In one turn, as the deletion needs
 * (W5-01-RPC-01): the platform stops the background executions the installation accepted in the project (PG-038), then its data of the
 * project goes: the rows its library declares, deleted by the platform on its own connection, waiting for a write the instance has in
 * progress; or, for a library partitioned by project, the library is closed and refused to every call already under way and the
 * project's library is removed, and only then may a call begun after the deletion open
 * it again (specs/archive/plugin-project-partition §2.5). A plugin with background work and no data of a project gets a step of its own that
 * only stops that work; the confirmation lists the work that will stop.
 */
export function registerPluginProjectCleanup(home: string, runtime: PluginRuntime, entries: readonly PluginProjectCleanupEntry[],
  libraries: PluginProjectLibraries): () => void {
  const hooks = projectDeletedHooksFor(home);
  const dispose = entries.flatMap(entry => {
    const pluginId = entry.definition.manifest.plugin_id, signature = entry.definition.manifest.publisher.signature;
    const stopBackground = (projectId: string) => {
      const record = runtime.list().find(item => item.plugin_id === pluginId && item.publisher_signature === signature && item.state !== "uninstalled");
      return { record, settled: record ? libraries.stopProjectBackground(record.install_id, projectId) : undefined };
    };
    const owner = cleanupOwner(home, entry, stopBackground, libraries);
    return owner ? [hooks.register(owner)] : [];
  });
  return () => { for (const release of dispose.reverse()) release(); };
}

type StopBackground = (projectId: string) => { record: PluginInstanceRecord | undefined; settled: Promise<void> | undefined };

function cleanupOwner(home: string, entry: PluginProjectCleanupEntry, stopBackground: StopBackground, libraries: PluginProjectLibraries): ProjectDeletedOwner | null {
  const { manifest } = entry.definition, library = manifest.databases?.home;
  if (library?.project_rows) return declaredRowsOwner(home, entry, library, stopBackground);
  if (library?.partition === "project") {
    const store = library.store_name;
    return {
      id: entry.project_data?.owner_id ?? manifest.plugin_id, ...namedProjectDataLabel("workbench.project-deletion.partition", manifest, entry.localePacks),
      async clear(projectId) {
        const { record, settled } = stopBackground(projectId);
        // Keep the same-turn refusal even while a cancelled activation job is still unwinding.
        const unblock = settled && record ? libraries.blockProjectLibrary(record.install_id, projectId) : undefined;
        try {
          if (settled) await settled;
          const release = record ? libraries.clearProjectLibrary(record.install_id, projectId) : undefined;
          try { await rm(homeSqlitePartitionDirectory(home, store, projectId), { recursive: true, force: true }); } finally { release?.(); }
        } finally { unblock?.(); }
      },
    };
  }
  return hasPluginBackground(entry.definition) ? { id: `plugin-background:${manifest.plugin_id}`, ...namedProjectDataLabel("workbench.project-deletion.background", manifest, entry.localePacks), async clear(projectId) { await stopBackground(projectId).settled; } } : null;
}

/**
 * The rows a library declares of a project. Every entry here is on the Host's start list, so its library is the one the Home's store
 * registry holds as its own (`assertDatabaseEntries`). A shipped plugin's step goes under its catalog id with its own words; any other
 * (a fixture the Host was given) goes under its plugin id. The platform supplies only the enclosing sentence.
 */
function declaredRowsOwner(home: string, entry: PluginProjectCleanupEntry, library: HomePluginDatabaseDeclaration, stopBackground: StopBackground): ProjectDeletedOwner {
  const { manifest } = entry.definition, rows = library.project_rows!, shipped = entry.project_data;
  return {
    id: shipped?.owner_id ?? manifest.plugin_id,
    ...(shipped ? projectDataLabel(rows.label, manifest, entry.localePacks)
      : namedProjectDataLabel("workbench.project-deletion.external-rows", manifest, entry.localePacks, rows.label)),
    async clear(projectId) {
      const { settled } = stopBackground(projectId);
      if (settled) await settled;
      clearProjectRows(home, library, manifest.plugin_id, projectId, manifest.owner_files);
    },
  };
}
