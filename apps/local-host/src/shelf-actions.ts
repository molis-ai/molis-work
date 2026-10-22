import { mkdirSync } from "node:fs";
import path from "node:path";
import { shelfAiPorts } from "./shelf-ai.js";
import { ActionError, requireSynchronous, retainActionAuthority, type ActionClient, type ActionExecutionContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginOwnerFilesClient, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { importThroughArtifacts } from "./artifact-document-import.js";
import { SHELF_ACTIONS, SHELF_OWNER_FILES, SHELF_PROJECT_ACTIONS, createShelfActionHandlers, createShelfProjectActionHandlers, shelfManifest, shelfProjectActions } from "@molis-ai/molis-work-plugin-shelf";
import { openShelfStore, SHELF_DOCUMENT_PATH, type ShelfRuntimeProbe, type ShelfStore } from "@molis-ai/molis-work-module-shelf";
import type { ShelfAiPorts, ShelfTextMaterial, ShelfMaterialPorts } from "@molis-ai/molis-work-contracts/modules/shelf";
import { openPluginOwnerFiles } from "./plugin-owner-files.js";
import { personalDocumentOptions } from "./personal-document-options.js";
import { shelfRuntimeProbe } from "./shelf-native-plugin-http.js";
import { readMaterialWebsite } from "./material-web.js";
import { extractMaterial } from "./material-extraction.js";
import { materialImageTextAvailable } from "./material-native.js";

const provider = (projectId?: string) => ({ provider_id: shelfManifest.plugin_id, plugin_id: shelfManifest.plugin_id, title: shelfManifest.name,
  kind: "plugin" as const, ...(projectId ? { project_id: projectId } : {}) });

/**
 * Transitional (PG-026 in specs/repository-anti-corruption/privileges.md): Shelf's host-composed actions run outside a Plugin Runtime action
 * scope, so the files client the platform builds for a plugin (which asks for that scope on every call) cannot serve them. This one is the
 * same client over the same Host port and the same declared entries (`SHELF_OWNER_FILES`): a write outside them, a link, a special node or
 * a path that is not strictly relative is refused by the port. It adds no action gate and waits for no `beforeEffect`: the callers keep the
 * ones they already make. Shelf's Runtime Home instance replaces it with `services.ownerFiles` and this function goes.
 */
export function openHostShelfFiles(home: string): PluginOwnerFilesClient {
  const port = openPluginOwnerFiles(home, SHELF_OWNER_FILES);
  return Object.freeze<PluginOwnerFilesClient>({
    stat: relative => port.stat(relative),
    read: relative => port.read(relative),
    list: relative => port.list(relative),
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
  return openShelfStore(path.join(resolved, SHELF_OWNER_FILES.store_name), openHostShelfFiles(resolved), probe, materials, ai, personalDocumentOptions(resolved,SHELF_DOCUMENT_PATH));
}

/** The personal Shelf belongs to this Home. Each call reads the current store and agent PATH, as the HTTP panel did. */
export function shelfActionProvider(home: string, materials: ShelfMaterialPorts = { readWebsite: readMaterialWebsite, extract: extractMaterial, imageTextAvailable: materialImageTextAvailable }): ActionProviderRegistration {
  const ai = shelfAiPorts(home, materials);
  const store = () => openHostShelfStore(home, shelfRuntimeProbe(), materials, ai);
  return { provider: provider(), definitions: SHELF_ACTIONS, handlers: createShelfActionHandlers({
    aiStatus: () => ai.status(store().settings().model_selection),
    snapshot: () => store().snapshot(),
    settings: () => store().settings(),
    saveSettings: patch => store().saveSettings(patch),
    admit: (input, control) => store().admitFile(input, control),
    admitText: (text, title, capture, control) => store().admitText(text, title, capture, control),
    admitFolder: input => store().admitFolder(input),
    readChild: (itemId, relative) => store().readChild(itemId, relative),
    seedSample: () => store().seedSample(),
    hide: itemId => store().hide(itemId),
    deleteCopy: itemId => store().deleteCopy(itemId),
    runJob: (job, control) => store().runJob(job, control),
    cancelJob: jobId => store().cancelJob(jobId),
    useAsMaterial: itemId => store().useAsMaterial(itemId),
    addClipboard: (text, extra) => store().addClipboard(text, extra),
    clipboardToMaterial: (clipId, control) => store().clipboardToMaterial(clipId, control),
    deleteClipboard: clipId => store().deleteClipboard(clipId),
    writeCopy: (itemId, text, expectedContentHash) => store().writeCopy(itemId, text, expectedContentHash),
    readFile: itemId => store().readFile(itemId),
  }) };
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
