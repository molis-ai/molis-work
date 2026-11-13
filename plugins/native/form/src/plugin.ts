import { syncBindings } from './sync-binding.js';
import { bindPluginActionRoute, projectRouteFields } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, type ActionAvailability, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { formManifest } from "./manifest.js";
import { createFormActionHandlers, formActions, type FormActionPorts } from "./actions.js";
import { createFormContentHandlers } from "./content-actions.js";
import { FormStore, type FormStores } from "./store.js";
import { formUiContribution } from "./ui.js";
import { promoteForm } from "./promote.js";
import { FORM_INSTRUCTIONS } from "./prompts.js";

/**
 * Forms as a Plugin Runtime plugin, one instance per project (docs/system/RUNTIME-MIGRATION.md 5.1). Its library is the
 * `form` store its Host entry declares; the 成果 it pins, the model and the actions it routes come from the Runtime's services.
 */
export function createFormPlugin(): PluginDefinition {
  return { manifest: formManifest, instructions: FORM_INSTRUCTIONS, async start(context) {
    for (const permission of formManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database, artifacts = context.services?.artifacts;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供问卷库");
    if (!artifacts) throw new ActionError("actions.unredeemed", "宿主未提供成果服务");
    const stores: FormStores = {
      read: run => run(new FormStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters),
        run: () => { throw new ActionError("actions.execution_failed", "问卷的读取不写入"); } })),
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new FormStore(transaction))),
    };
    const model = context.services?.model;
    const ports: FormActionPorts = { ...stores,
      ...(database.transactionProjectRow && artifacts.join ? {
        promote: (id: string, expectedVersion?: number) => promoteForm(database, artifacts, id, expectedVersion),
      } : {}),
      modelAvailability: (): ActionAvailability => model?.availability() ?? { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" },
      ...(model ? { completeText: async (prompt, options) => (await model.complete(prompt, { signal: options.signal })).text } : {}) };
    return { kind: "app", sync: syncBindings(context), views: [formUiContribution],
      actions: [...createFormActionHandlers(ports), ...createFormContentHandlers(stores)],
      routes: formRoutes(context) };
  } };
}

/** The routes only map the request to an action; a `project_id` the page sends must be this project's. */
function formRoutes(context: PluginStartContext) {
  const route = (definition: ActionDefinition, routeId: string, input: (request: PluginRouteRequest, fields: Record<string, unknown>) => unknown) =>
    bindPluginActionRoute(context, definition, request => input(request, projectRouteFields(request, context.project_id, "问卷项目与当前项目不一致")) as never, routeId);
  const empty = () => ({}), fields = (_: PluginRouteRequest, value: Record<string, unknown>) => value;
  const identified = (request: PluginRouteRequest, value: Record<string, unknown>) => ({ ...value, id: request.params.id });
  const id = (request: PluginRouteRequest) => ({ id: request.params.id });
  return [
    route(formActions.list, "form.list", empty),
    route(formActions.create, "form.create", fields),
    route(formActions.get, "form.get", id),
    route(formActions.update, "form.update", identified),
    route(formActions.publish, "form.publish", identified),
    route(formActions.promote, "form.promote", identified),
    route(formActions.delete, "form.delete", identified),
    route(formActions.generate, "form.generate", identified),
    route(formActions.draft, "form.draft", identified),
    route(formActions.submit, "form.submit", identified),
    route(formActions.results, "form.results", id),
    route(formActions.close, "form.close", identified),
    route(formActions.importAnswers, "form.answers.import", identified),
    route(formActions.csv, "form.csv", id),
    route(formActions.fillPage, "form.fillpage", id),
  ];
}
