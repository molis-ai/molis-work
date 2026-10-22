import { ActionError, type ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";
import type { PluginDefinition, PluginMaterialsClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MaterialWebsiteReader } from "@molis-ai/molis-work-contracts/services/materials";
import type { ShelfDeviceSettings, ShelfMaterialPorts, ShelfModelSelection } from "@molis-ai/molis-work-contracts/modules/shelf";
import { openShelfStore, shelfRuntimeProbe, type ShelfStore } from "@molis-ai/molis-work-module-shelf";
import { createShelfActionHandlers, type ShelfActionPorts } from "./actions.js";
import { shelfAiPorts } from "./ai.js";
import { shelfManifest } from "./manifest.js";

/** A page on this machine is read by `readLocalPage`, any other by `readSource`; the Host refuses what neither may reach. */
function websiteReader(materials: PluginMaterialsClient): MaterialWebsiteReader {
  return async (url, options = {}) => {
    await options.beforeDispatch?.();
    if (URL.canParse(url) && isLoopbackHttpUrl(new URL(url))) return materials.readLocalPage!(url, { signal: options.signal });
    const source = await materials.readSource!(url, { signal: options.signal });
    return { text: source.text, ...(source.title ? { title: source.title } : {}), extractor: source.extractor, pages: source.pages ?? [], coverage: source.coverage };
  };
}

function shelfMaterialPorts(materials: PluginMaterialsClient): ShelfMaterialPorts {
  return { readWebsite: websiteReader(materials), extract: (source, options) => materials.extract!(source, options),
    imageTextAvailable: () => materials.imageTextAvailable?.() ?? false };
}

/**
 * The store's methods as the actions call them; each call opens the store fresh, so it reads the current agent PATH.
 * Availability is asked outside any action (a workflow listing its steps asks it inside its own), where Shelf's files cannot be
 * read: it answers from the model choice the last action read or saved (this instance is the files' only writer), and before any
 * has, from whether any model is configured.
 */
export function shelfStorePorts(store: () => ShelfStore, availability: (selection: ShelfModelSelection | null) => ActionAvailability): ShelfActionPorts {
  let selection: ShelfModelSelection | null = null;
  const remember = (settings: ShelfDeviceSettings) => { selection = settings.model_selection ?? null; return settings; };
  return {
    aiAvailability: () => availability(selection),
    snapshot: async () => { const snapshot = await store().snapshot(); remember(snapshot.settings); return snapshot; },
    settings: () => remember(store().settings()),
    saveSettings: async patch => remember(await store().saveSettings(patch)),
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
    writeCopy: (itemId, text) => store().writeCopy(itemId, text),
    readFile: itemId => store().readFile(itemId),
  };
}

/**
 * Shelf's Home instance: the person's shelf, kept in its own files and offered as the `shelf.*` Home actions. The folder behind
 * the files stays the runtime's, so the snapshot names none.
 */
export function createShelfHomePlugin(): PluginDefinition {
  return { manifest: shelfManifest, async start(context) {
    for (const permission of shelfManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const { ownerFiles, model, materials } = context.services ?? {};
    if (!ownerFiles || !model || !materials) throw new ActionError("actions.unredeemed", "宿主未提供置物架运行服务");
    const ports = shelfMaterialPorts(materials), ai = shelfAiPorts(model, ports);
    const store = () => openShelfStore("", ownerFiles, shelfRuntimeProbe(), ports, ai);
    return { kind: "app", actions: createShelfActionHandlers(shelfStorePorts(store, selection => model.availability(selection ?? undefined))) };
  } };
}
