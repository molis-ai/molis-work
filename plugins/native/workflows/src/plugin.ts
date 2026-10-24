import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, type ActionAvailability, type ActionDefinition, type ActionExecutionContext, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionDirectory, PluginDefinition, PluginExecutionControl, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { workflowsManifest } from "./manifest.js";
import { createWorkflowsActionHandlers, workflowsActions, type WorkflowsActionPorts } from "./actions.js";
import { createWorkflowContentPorts } from "./content-client.js";
import { WorkflowsStore, type WorkflowsStores } from "./store.js";
import { workflowsUiContribution } from "./ui.js";
import { WORKFLOWS_INSTRUCTIONS } from "./prompts.js";

/**
 * Workflows as a Plugin Runtime plugin, one instance per project (docs/system/RUNTIME-MIGRATION.md 5.3). Its library is the
 * `workflows` store its Host entry declares; the text model comes from the Runtime's model service. Every station, action step and
 * judgment rule is reached through the action directory (`actions:delegate`) as the person or client that started the call, so the
 * authority of each nested call is theirs, never the plugin's own.
 */
export function createWorkflowsPlugin(): PluginDefinition {
  return { manifest: workflowsManifest, instructions: WORKFLOWS_INSTRUCTIONS, async start(context) {
    for (const permission of workflowsManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const projectId = context.project_id;
    if (!projectId) throw new ActionError("actions.scope_mismatch", "工作流程只属于一个项目");
    const database = context.services?.database, directory = context.services?.actions?.directory;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供流程库");
    if (!directory) throw new ActionError("actions.unredeemed", "宿主未提供动作目录");
    const stores: WorkflowsStores = {
      read: run => run(new WorkflowsStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters),
        run: () => { throw new ActionError("actions.execution_failed", "流程的读取不写入"); } })),
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new WorkflowsStore(transaction))),
    };
    const model = context.services?.model;
    const ports: WorkflowsActionPorts = { ...stores,
      content: caller => createWorkflowContentPorts(delegated(directory, caller)),
      actions: caller => ({ discover: () => directory.discover(), invoke: (reference, input) => directory.invoke(reference, input, controlOf(caller)),
        check: (reference, input) => directory.check(reference, input) }),
      textModel: (): ActionAvailability => model?.availability() ?? { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" },
      ...(model ? { complete: async (prompt, options) => { await options.beforeDispatch(); return model.complete(prompt, { signal: options.signal }); } } : {}) };
    return { kind: "app", views: [workflowsUiContribution], actions: createWorkflowsActionHandlers(projectId, ports), routes: workflowsRoutes(context) };
  } };
}

/**
 * What a nested call carries of the running one: its stop signal, its checks before an effect (a stopped run is refused there) and its
 * final authority check. The directory adds the original caller's own checks and the installation's grant.
 */
function controlOf(caller: ActionExecutionContext): PluginExecutionControl {
  return { ...(caller.signal ? { signal: caller.signal } : {}), beforeEffect: caller.beforeEffect,
    ...(caller.assert_authority_current ? { assert_authority_current: caller.assert_authority_current } : {}) };
}

/** The directory as the client the content protocol reads: one running call's, so a station is reached with that call's authority. */
function delegated(directory: PluginActionDirectory, caller: ActionExecutionContext): BoundActionClient {
  return { discover: () => directory.discover(),
    invoke: <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => directory.invoke<Output>(definition, input, controlOf(caller)) };
}

/** The routes only translate the request to an action: the project and every operation belong to the Workflows actions. */
function workflowsRoutes(context: PluginStartContext) {
  const fields = (request: PluginRouteRequest): Record<string, unknown> => request.body && typeof request.body === "object" ? { ...request.body as Record<string, unknown> } : {};
  const text = (value: unknown) => typeof value === "string" ? value : undefined;
  const integer = (value: unknown) => value === undefined || value === null || value === "" ? undefined : Number(value);
  const id = (request: PluginRouteRequest) => request.params.id ?? "";
  const route = <Input, Output>(definition: ActionDefinition<Input, Output>, routeId: string, input: (request: PluginRouteRequest, body: Record<string, unknown>) => Input) =>
    bindPluginActionRoute(context, definition, request => input(request, fields(request)), routeId);
  return [
    route(workflowsActions.list, "workflows.list", () => ({})),
    route(workflowsActions.create, "workflows.create", (_, body) => ({ ...(text(body.title) !== undefined ? { title: text(body.title) } : {}),
      ...(body.chain !== undefined ? { chain: body.chain } : {}) })),
    route(workflowsActions.judgments, "workflows.judgments", () => ({})),
    route(workflowsActions.actionSteps, "workflows.step_actions", () => ({})),
    route(workflowsActions.stationItems, "workflows.station_items", request => ({ plugin: request.params.plugin ?? "" })),
    route(workflowsActions.instance, "workflows.instance_get", request => ({ id: id(request) })),
    route(workflowsActions.preview, "workflows.instance_preview", (request, body) => ({ id: id(request),
      ...(integer(body.from) !== undefined ? { from: integer(body.from) } : {}) })),
    route(workflowsActions.continue, "workflows.instance_continue", (request, body) => ({ id: id(request),
      ...(integer(body.from) !== undefined ? { from: integer(body.from) } : {}),
      ...(text(body.updated_at) !== undefined ? { updated_at: text(body.updated_at) } : {}),
      ...(text(body.title) !== undefined ? { title: text(body.title) } : {}),
      ...(text(body.body) !== undefined ? { body: text(body.body) } : {}),
      ...(body.retry_action === true ? { retry_action: true } : {}) })),
    route(workflowsActions.stop, "workflows.instance_stop", request => ({ id: id(request) })),
    route(workflowsActions.get, "workflows.get", request => ({ id: id(request) })),
    route(workflowsActions.update, "workflows.update", (request, body) => ({ id: id(request), revision: Number(body.revision),
      ...(text(body.title) !== undefined ? { title: text(body.title) } : {}),
      ...(body.chain !== undefined ? { chain: body.chain } : {}) })),
    route(workflowsActions.delete, "workflows.delete", request => ({ id: id(request) })),
    route(workflowsActions.start, "workflows.instance_start", (request, body) => ({ id: id(request),
      ...(text(body.item_id) ? { item_id: text(body.item_id) } : {}),
      ...(text(body.title) ? { title: text(body.title) } : {}) })),
  ];
}
