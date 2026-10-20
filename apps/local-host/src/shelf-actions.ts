import { shelfAiPorts } from "./shelf-ai.js";
import { retainActionAuthority, type ActionClient, type ActionExecutionContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { importThroughArtifacts } from "./artifact-document-import.js";
import { SHELF_ACTIONS, SHELF_PROJECT_ACTIONS, createShelfActionHandlers, createShelfProjectActionHandlers, shelfManifest, shelfProjectActions } from "@molis-ai/molis-work-plugin-shelf";
import { openShelfStore, SHELF_DOCUMENT_PATH } from "@molis-ai/molis-work-module-shelf";
import { type ShelfTextMaterial, type ShelfMaterialPorts } from "@molis-ai/molis-work-contracts/modules/shelf";
import { personalDocumentOptions } from "./personal-document-options.js";
import { shelfRuntimeProbe } from "./shelf-native-plugin-http.js";
import { readMaterialWebsite } from "./material-web.js";
import { extractMaterial } from "./material-extraction.js";
import { materialImageTextAvailable } from "./material-native.js";

const provider = (projectId?: string) => ({ provider_id: shelfManifest.plugin_id, plugin_id: shelfManifest.plugin_id, title: shelfManifest.name,
  kind: "plugin" as const, ...(projectId ? { project_id: projectId } : {}) });

/** The personal Shelf belongs to this Home. Each call reads the current store and agent PATH, as the HTTP panel did. */
export function shelfActionProvider(home: string, materials: ShelfMaterialPorts = { readWebsite: readMaterialWebsite, extract: extractMaterial, imageTextAvailable: materialImageTextAvailable }): ActionProviderRegistration {
  const ai = shelfAiPorts(home, materials);
  const store = () => openShelfStore(home, shelfRuntimeProbe(), materials, ai,personalDocumentOptions(home,SHELF_DOCUMENT_PATH));
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
    readFile: itemId => openShelfStore(home, shelfRuntimeProbe(),{},undefined,personalDocumentOptions(home,SHELF_DOCUMENT_PATH)).readFile(itemId),
    publish: (payload, caller) => saveShelfToProject(client, payload, caller),
  }) };
}

/**
 * Saves a personal Shelf copy into the project's knowledge (specs/project-knowledge §9) through the 成果库's own import, as the
 * confirming caller: an imported document the project's agents find and read like any other, refused where the 成果库 is off,
 * as the side panel's import is. The Shelf item is its source, so saving it again after it changed is a new version of the same
 * document, and the same text keeps its version.
 */
export async function saveShelfToProject(client: ActionClient, payload: ShelfTextMaterial, caller: ActionExecutionContext): Promise<{ artifact_id: string; version: number }> {
  const name = payload.title.replace(/[\\/\u0000-\u001f]/gu, " ").trim().slice(0, 240) || "Shelf";
  const nested = retainActionAuthority(caller, { ...shelfProjectActions.saveMaterial, provider_id: shelfManifest.plugin_id });
  const saved = await importThroughArtifacts(client, nested,
    { source: "file", filename: `${name}.md`, title: payload.title.slice(0, 500), content: payload.text, source_id: `shelf:${payload.source.item_id}` });
  return { artifact_id: saved.artifact_id, version: saved.version };
}
