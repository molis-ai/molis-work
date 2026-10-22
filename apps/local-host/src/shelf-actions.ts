import { mkdirSync } from "node:fs";
import path from "node:path";
import { ActionError, requireSynchronous, retainActionAuthority, type ActionClient, type ActionExecutionContext, type ActionProviderRegistration, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginOwnerFilesClient, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { importThroughArtifacts } from "./artifact-document-import.js";
import { SHELF_OWNER_FILES, SHELF_PROJECT_ACTIONS, createShelfProjectActionHandlers, shelfActions, shelfManifest, shelfProjectActions } from "@molis-ai/molis-work-plugin-shelf";
import { openShelfStore, shelfRuntimeProbe, type ShelfRuntimeProbe, type ShelfStore } from "@molis-ai/molis-work-module-shelf";
import type { ShelfAiPorts, ShelfTextMaterial, ShelfMaterialPorts, ShelfSnapshot } from "@molis-ai/molis-work-contracts/modules/shelf";
import { openPluginOwnerFiles } from "./plugin-owner-files.js";

const provider = (projectId?: string) => ({ provider_id: shelfManifest.plugin_id, plugin_id: shelfManifest.plugin_id, title: shelfManifest.name,
  kind: "plugin" as const, ...(projectId ? { project_id: projectId } : {}) });

/**
 * Transitional (PG-026-S1 in specs/repository-anti-corruption/privileges.md): Shelf's project half is still composed here and runs outside
 * a Plugin Runtime action scope, so the files client the platform builds for a plugin (which asks for that scope on every call) cannot
 * serve it. This one is the same client over the same Host port and the same declared entries (`SHELF_OWNER_FILES`): a write outside
 * them, a link, a special node or a path that is not strictly relative is refused by the port. It adds no action gate and waits for no
 * `beforeEffect`: the callers keep the ones they already make. The Home actions are Shelf's Runtime Home instance on `services.ownerFiles`
 * since S2; when the project half reads them (S4), this function goes.
 */
export function openHostShelfFiles(home: string): PluginOwnerFilesClient {
  const port = openPluginOwnerFiles(home, SHELF_OWNER_FILES);
  return Object.freeze<PluginOwnerFilesClient>({
    stat: relative => port.stat(relative),
    read: relative => port.read(relative),
    list: relative => port.list(relative),
    location: () => port.location(),
    // The body runs before the first await, so a write never yields between its reads and its changes.
    async write<Result>(run: (writer: PluginOwnerFilesWriter) => Result): Promise<Result> {
      let active = true;
      const current = () => { if (!active) throw new ActionError("actions.expired", "文件写入作用域已结束"); };
      const writer = Object.freeze<PluginOwnerFilesWriter>({
        stat(relative) { current(); return port.stat(relative); },
        read(relative) { current(); return port.read(relative); },
        list(relative) { current(); return port.list(relative); },
        mkdir(relative) { current(); port.mkdir(relative); },
        writeFile(relative, bytes, mode) { current(); port.writeFile(relative, bytes, mode); },
        replaceFileAtomic(relative, bytes) { current(); port.replaceFileAtomic(relative, bytes); },
        copyFile(source, target) { current(); port.copyFile(source, target); },
        removeTree(relative) { current(); port.removeTree(relative); },
        setAccess(relative, access) { current(); port.setAccess(relative, access); },
      });
      try { return requireSynchronous(run(writer), "文件写入回调必须同步完成"); }
      finally { active = false; }
    },
  });
}

/** The Shelf of this Home, opened over its declared files. The Home folder is made if it is not there yet, as opening the shelf always did. */
export function openHostShelfStore(home: string, probe: ShelfRuntimeProbe = {}, materials: ShelfMaterialPorts = {}, ai?: ShelfAiPorts): ShelfStore {
  const resolved = path.resolve(home);
  mkdirSync(resolved, { recursive: true });
  return openShelfStore(path.join(resolved, SHELF_OWNER_FILES.store_name), openHostShelfFiles(resolved), probe, materials, ai);
}

/**
 * Transitional (PG-113): the person's Shelf actions as the Host's own pages call them, through Shelf's Home instance. The instance
 * keeps the folder behind its files to itself, so its snapshot names none; these pages still drag copies out of it and open a
 * terminal there, so the Host names it here until they move to the plugin's routes.
 */
export function shelfPageActions(client: BoundActionClient, home: string): BoundActionClient {
  const root = path.join(path.resolve(home), SHELF_OWNER_FILES.store_name);
  return { discover: () => client.discover(), invoke: async (definition, input, control, transport) => {
    const result = await client.invoke(definition, input, control, transport);
    return definition.capability_id === shelfActions.snapshot.capability_id ? { ...result as ShelfSnapshot, root } as typeof result : result;
  } };
}

/** Saving a personal copy into a project goes through that project's Artifact store, owned by the confirming caller. */
export function shelfProjectActionProvider(projectId: string, home: string, client: ActionClient): ActionProviderRegistration {
  return { provider: provider(projectId), definitions: SHELF_PROJECT_ACTIONS, handlers: createShelfProjectActionHandlers(projectId, {
    readFile: itemId => openHostShelfStore(home, shelfRuntimeProbe()).readFile(itemId),
    publish: (payload, caller) => saveShelfToProject(client, payload, caller),
  }) };
}

/**
 * Saves a personal Shelf copy into the project's knowledge (specs/project-knowledge §9) through the 成果库's own import, as the
 * confirming caller: an imported document the project's agents find and read like any other, refused where the 成果库 is off,
 * as the side panel's import is. The Shelf item is its source, so saving it again after it changed is a new version of the same
 * document, and the same text keeps its version.
 */
async function saveShelfToProject(client: ActionClient, payload: ShelfTextMaterial, caller: ActionExecutionContext): Promise<{ artifact_id: string; version: number }> {
  const name = payload.title.replace(/[\\/\u0000-\u001f]/gu, " ").trim().slice(0, 240) || "Shelf";
  const nested = retainActionAuthority(caller, { ...shelfProjectActions.saveMaterial, provider_id: shelfManifest.plugin_id });
  const saved = await importThroughArtifacts(client, nested,
    { source: "file", filename: `${name}.md`, title: payload.title.slice(0, 500), content: payload.text, source_id: `shelf:${payload.source.item_id}` });
  return { artifact_id: saved.artifact_id, version: saved.version };
}
