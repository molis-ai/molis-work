import { ActionError, type BoundActionClient, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ARTIFACT_FILE_IMPORT_ACTION } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ShelfArtifactPreview, ShelfMaterialPorts } from "@molis-ai/molis-work-contracts/modules/shelf";
import { openShelfStore, type ShelfRuntimeProbe } from "@molis-ai/molis-work-module-shelf";
import { createShelfActionHandlers, createShelfProjectActionHandlers, SHELF_PROJECT_ACTIONS, shelfActions } from "./actions.js";
import { shelfManifest } from "./manifest.js";
import { shelfUiContribution } from "./ui.js";
import { shelfSettingsUiContribution } from "./settings-ui.js";
import { shelfRuntimeAi } from "./runtime-ai.js";
import { shelfReceiveCopy, shelfRuntimeActions } from "./runtime-actions.js";
import { createShelfRouteHandlers } from "./route-handlers.js";
import { SHELF_NATIVE_PLUGIN_ROUTES } from "./routes.js";

/** The personal Shelf uses the public services and lifecycle of a Home plugin. */
export function createHomeShelfPlugin(): PluginDefinition {
  return { manifest: shelfManifest, async start(context) {
    for (const grant of shelfManifest.permissions) if (grant.required) context.requireGrant(grant.permission);
    const { store, ai, actions } = shelfServices(context);
    const handlers = createShelfActionHandlers({
      aiStatus: () => ai.status(store().settings().model_selection), snapshot: () => store().snapshot(), settings: () => store().settings(),
      saveSettings: patch => store().saveSettings(patch), admit: (input, control) => store().admitFile(input, control),
      admitText: (text, title, capture, control) => store().admitText(text, title, capture, control),
      admitFolder: input => store().admitFolder(input), readChild: (id, relative) => store().readChild(id, relative),
      seedSample: () => store().seedSample(), hide: id => store().hide(id), deleteCopy: id => store().deleteCopy(id),
      runJob: (job, control) => store().runJob(job, control), cancelJob: id => store().cancelJob(id),
      useAsMaterial: id => store().useAsMaterial(id), addClipboard: (text, extra) => store().addClipboard(text, extra),
      clipboardToMaterial: (id, control) => store().clipboardToMaterial(id, control), deleteClipboard: id => store().deleteClipboard(id),
      writeCopy: (id, text) => store().writeCopy(id, text), readFile: id => store().readFile(id),
    });
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
    ], routes: SHELF_NATIVE_PLUGIN_ROUTES.map(({ route_id }) => ({ route_id, async handle(request) {
      const bound: BoundActionClient = { discover: async () => [], invoke: (definition, input) => actions.invoke(definition, input, request.execution) };
      const handlers = createShelfRouteHandlers({ actions: bound, ...(request.execution?.project_id ? {
        project: { title: request.execution.project_title ?? request.execution.project_id, actions: bound },
      } : {}) });
      return handlers[route_id]!({ params: request.params, request: { method: request.method as "GET" | "POST", pathname: request.pathname,
        query: new URLSearchParams(request.query), body: request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {} } });
    } })) };
  } };
}

function shelfServices(context: PluginStartContext) {
  const services = context.services, files = services?.ownerFiles, model = services?.model, materials = services?.materials, actions = services?.actions;
  if (!files || !model || !materials?.extract || !materials.readSource || !actions?.dependencies) throw new ActionError("actions.unredeemed", "Shelf 需要公共文件、模型、材料与动作服务");
  const ai = shelfRuntimeAi(files, model, materials);
  const readers: ShelfMaterialPorts = { extract: materials.extract, imageTextAvailable: materials.imageTextAvailable,
    readWebsite: async (url, control) => { await control?.beforeDispatch?.(); const result = await materials.readSource!(url, control); return { ...result, pages: result.pages ?? [] }; } };
  const probe: ShelfRuntimeProbe = process.env.MOLIS_WORK_SHELF_AGENT === "off" ? { disabled: true } : {
    pathEnvironment: process.env.MOLIS_WORK_SHELF_AGENT_PATH, preferred: process.env.MOLIS_WORK_SHELF_AGENT };
  return { actions, ai, store: () => openShelfStore(files.rootPath(), files, probe, readers, ai) };
}
