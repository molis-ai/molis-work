import { bindPluginActionRoute, decodeMaterialUpload } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, type ActionAvailability, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { lingguangManifest } from "./manifest.js";
import { createLingguangActionHandlers, lingguangActions, type LingguangActionPorts } from "./actions.js";
import { createLingguangContentHandlers } from "./content-actions.js";
import { LingguangStore, type LingguangStores } from "./store.js";
import { lingguangUiContribution } from "./ui.js";
import { LINGGUANG_INSTRUCTIONS } from "./prompts.js";

/** One instance per project, using the existing Home library and the Runtime's model, material and action services. */
export function createLingguangPlugin(): PluginDefinition {
  return { manifest: lingguangManifest, instructions: LINGGUANG_INSTRUCTIONS, async start(context) {
    for (const permission of lingguangManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database, actions = context.services?.actions;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供灵光库");
    if (!actions) throw new ActionError("actions.unredeemed", "宿主未提供动作服务");
    const stores: LingguangStores = {
      read: run => run(new LingguangStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters),
        run: () => { throw new ActionError("actions.execution_failed", "灵光的读取不写入"); } })),
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new LingguangStore(transaction))),
    };
    const model = context.services?.model, materials = context.services?.materials;
    const ports: LingguangActionPorts = { ...stores,
      modelAvailability: (): ActionAvailability => model?.availability() ?? { available: false, code: "actions.connection_required", reason: "请先配置文字模型，再继续对话" },
      ...(model ? { completeText: async (prompt, options) => (await model.complete(prompt, { signal: options.signal, onText: options.onText })).text } : {}),
      ...(materials?.extract ? { readFile: async (input, caller) => {
        const source = decodeMaterialUpload(input);
        const material = await materials.extract!(source, { pdfMode: "ocr", allowModelDownload: input.allow_model_download,
          signal: caller.signal });
        return { text: material.text, coverage: material.coverage, file_name: source.file_name };
      } } : {}),
      ...(materials?.readSource ? { readSource: (input, caller) => materials.readSource!(input.url, {
        allowModelDownload: input.allow_model_download, signal: caller.signal,
      }) } : {}),
    };
    return { kind: "app", views: [lingguangUiContribution],
      actions: [...createLingguangActionHandlers(ports), ...createLingguangContentHandlers(actions)], routes: lingguangRoutes(context) };
  } };
}

/** Only transport mapping; project identity belongs to the Host's current instance. */
function lingguangRoutes(context: PluginStartContext) {
  const body = (request: PluginRouteRequest): Record<string, unknown> => {
    const value = request.body && typeof request.body === "object" ? { ...request.body as Record<string, unknown> } : {};
    for (const requested of [request.query.project_id, value.project_id]) {
      if (requested !== undefined && requested !== context.project_id) throw new ActionError("actions.scope_mismatch", "请求项目与当前项目不一致");
    }
    delete value.project_id;
    return value;
  };
  const route = (definition: ActionDefinition, routeId: string, input: (request: PluginRouteRequest, fields: Record<string, unknown>) => unknown) =>
    bindPluginActionRoute(context, definition, request => input(request, body(request)) as never, routeId);
  const fields = (_: PluginRouteRequest, value: Record<string, unknown>) => value;
  const identified = (request: PluginRouteRequest, value: Record<string, unknown>) => ({ ...value, id: request.params.id });
  return [
    route(lingguangActions.list, "lingguang.list", () => ({})),
    route(lingguangActions.create, "lingguang.create", fields),
    route(lingguangActions.get, "lingguang.get", request => ({ id: request.params.id })),
    route(lingguangActions.update, "lingguang.update", identified),
    route(lingguangActions.discard, "lingguang.discard", request => ({ ids: [request.params.id] })),
    route(lingguangActions.discard, "lingguang.discard_many", fields),
    route(lingguangActions.readFile, "lingguang.material_read", fields),
    route(lingguangActions.readSource, "lingguang.source_read", fields),
    route(lingguangActions.openConversation, "lingguang.conversation_open", fields),
    route(lingguangActions.message, "lingguang.conversation_message", identified),
  ];
}
