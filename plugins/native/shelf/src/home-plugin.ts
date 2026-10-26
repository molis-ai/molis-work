import { ActionError, type ActionAvailability, type BoundActionClient, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ARTIFACT_FILE_IMPORT_ACTION } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";
import type { PluginDefinition, PluginMaterialsClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MaterialWebsiteReader } from "@molis-ai/molis-work-contracts/services/materials";
import type { ShelfArtifactPreview, ShelfDeviceSettings, ShelfMaterialPorts, ShelfModelSelection } from "@molis-ai/molis-work-module-shelf/contract";
import { initializeShelfFiles, openShelfStore, type ShelfStore } from "@molis-ai/molis-work-module-shelf";
import { createShelfActionHandlers, createShelfProjectActionHandlers, SHELF_PROJECT_ACTIONS, shelfActions, type ShelfActionPorts } from "./actions.js";
import { shelfAiPorts } from "./ai.js";
import { shelfManifest } from "./manifest.js";
import { shelfUiContribution } from "./ui.js";
import { shelfSettingsUiContribution } from "./settings-ui.js";
import { shelfReceiveCopy, shelfRuntimeActions } from "./runtime-actions.js";
import { createShelfRouteHandlers } from "./route-handlers.js";
import { SHELF_HOME_ROUTES } from "./routes.js";
import { SHELF_INSTRUCTIONS } from "./prompts.js";

/** A page on this machine is read by `readLocalPage`, any other by `readSource`; the Host refuses what neither may reach. */
function websiteReader(materials: PluginMaterialsClient): MaterialWebsiteReader {
  return async (url, options = {}) => {
    await options.beforeDispatch?.();
    if (URL.canParse(url) && isLoopbackHttpUrl(new URL(url))) return materials.readLocalPage!(url, { signal: options.signal });
    const source = await materials.readSource!(url, { signal: options.signal });
    return { text: source.text, ...(source.title ? { title: source.title } : {}), extractor: source.extractor, pages: source.pages ?? [], coverage: source.coverage };
  };
}

/** The original the person handed in is registered, read and forgotten by the platform, under the Shelf item's id. */
function shelfMaterialPorts(materials: PluginMaterialsClient): ShelfMaterialPorts {
  const { claimOriginal, readOriginal, releaseOriginal } = materials;
  return { readWebsite: websiteReader(materials), extract: (source, options) => materials.extract!(source, options),
    imageTextAvailable: () => materials.imageTextAvailable?.() ?? false,
    ...(claimOriginal ? { claimOriginal: (itemId: string) => claimOriginal(itemId) } : {}),
    ...(readOriginal ? { readOriginal: (itemId: string, request?: { signal?: AbortSignal }) => readOriginal(itemId, { signal: request?.signal }) } : {}),
    ...(releaseOriginal ? { releaseOriginal: (itemId: string) => releaseOriginal(itemId) } : {}) };
}

/**
 * The store's methods as the actions call them; each call opens the store fresh, so it reads the current agent PATH.
 * Availability is asked outside any action (a workflow listing its steps asks it inside its own), where Shelf's files cannot be
 * read: it answers from the model choice the last action read or saved (only this instance's actions save that choice), and before
 * any has, from whether any model is configured.
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
    captureUrl: (url, control) => store().admitUrl(url, control),
    claimOriginal: itemId => store().claimOriginal(itemId),
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

/** The personal Shelf uses the public services and lifecycle of a Home plugin. */
export function createHomeShelfPlugin(): PluginDefinition {
  return { manifest: shelfManifest, instructions: SHELF_INSTRUCTIONS, async start(context) {
    for (const grant of shelfManifest.permissions) if (grant.required) context.requireGrant(grant.permission);
    const { store, model, actions, files } = shelfServices(context);
    // The sample goes on a shelf that has never held anything, once: the instance writes it itself, under its own current grants.
    await files.write(initializeShelfFiles);
    const handlers = createShelfActionHandlers(shelfStorePorts(store, selection => model.availability(selection ?? undefined)));
    return { kind: "app", views: [shelfUiContribution, shelfSettingsUiContribution], actions: [...handlers,
      { ...shelfActions.terminal, async handle(caller) {
        await caller.beforeEffect();
        const runtime = (await store().snapshot()).runtime;
        if (!runtime.executable || !context.services?.terminal) throw new ActionError("actions.unavailable", "未发现终端 Agent。");
        return context.services.terminal.open({ key: "conversation", command: runtime.executable, title: runtime.title });
      } },
      { ...shelfReceiveCopy, async handle(caller, input) {
        const preview = input as ShelfArtifactPreview;
        const providers = await actions.dependencies!.discover();
        const source = providers.find(row => row.capability_id === shelfRuntimeActions.results.capability_id
          && row.provider.plugin_id === context.plugin_id && row.provider.plugin_install_id === caller.plugin_install_id
          && row.provider.project_id === caller.project_id && row.availability.available);
        if (caller.audience !== "plugin" || !source || !caller.project_id || caller.project_id !== preview.source.project_id)
          throw new ActionError("actions.forbidden", "只接收当前项目 Shelf 实例校验的成果");
        await caller.beforeEffect();
        const shelf = store(), item = await shelf.admit({ filename: `${preview.title}.md`, bytes: Buffer.from(preview.text), mime: "text/markdown", artifact_source: preview.source });
        return { item, snapshot: await shelf.snapshot() };
      } },
      ...SHELF_PROJECT_ACTIONS.map(definition => ({ ...definition, handle: (caller: ActionExecutionContext, input: unknown) => {
        if (!caller.project_id) throw new ActionError("actions.project_required", "请在项目中打开 Shelf，再保存项目资料");
        return createShelfProjectActionHandlers(caller.project_id, { readFile: id => store().readFile(id), async publish(payload, control) {
          const name = payload.title.replace(/[\\/\u0000-\u001f]/gu, " ").trim().slice(0, 240) || "Shelf";
          const result = await actions.dependencies!.invoke<{ artifact_id: string; version: number }>(ARTIFACT_FILE_IMPORT_ACTION,
            { source: "file", filename: `${name}.md`, title: payload.title.slice(0, 500), content: payload.text, source_id: `shelf:${payload.source.item_id}` },
            { signal: control.signal, beforeEffect: () => control.beforeEffect(), assert_authority_current: control.assert_authority_current });
          return { artifact_id: result.artifact_id, version: result.version };
        } }).find(binding => binding.capability_id === definition.capability_id)!.handle(caller, input);
      } })),
    ], routes: SHELF_HOME_ROUTES.map(({ route_id }) => ({ route_id, async handle(request) {
      const bound: BoundActionClient = { discover: async () => [], invoke: (definition, input) => actions.invoke(definition, input, request.execution) };
      const handlers = createShelfRouteHandlers({ actions: bound, ...(request.execution?.project_id ? {
        project: { title: request.execution.project_title ?? request.execution.project_id, actions: bound },
      } : {}) });
      return handlers[route_id]!({ params: request.params, request: { method: request.method as "GET" | "POST", pathname: request.pathname,
        query: new URLSearchParams(request.query), body: request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {} } });
    } })) };
  } };
}

/** The store opens on each call, inside the action that asks: the files service, and the folder behind it, answer only there. */
function shelfServices(context: PluginStartContext) {
  const services = context.services, files = services?.ownerFiles, model = services?.model, materials = services?.materials, actions = services?.actions, tools = services?.localTools;
  if (!files || !model || !materials?.extract || !materials.readSource || !materials.readLocalPage || !actions?.dependencies) throw new ActionError("actions.unredeemed", "Shelf 需要公共文件、模型、材料与动作服务");
  const readers = shelfMaterialPorts(materials), ai = shelfAiPorts(model, readers);
  return { actions, model, files, store: () => openShelfStore(files.rootPath(), files, { ...(tools ? { tools } : {}) }, readers, ai) };
}
