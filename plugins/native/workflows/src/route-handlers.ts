import type { ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { workflowsActions } from "./actions.js";
import type { WorkflowsPluginRouteHandler, WorkflowsPluginRouteResponse } from "./routes.js";

/** The old paths only translate parameters; project authority and every operation belong to the Workflows actions. */
export function createWorkflowsRouteHandlers(actions: BoundActionClient): Record<string, WorkflowsPluginRouteHandler> {
  const run = <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => async (): Promise<WorkflowsPluginRouteResponse> =>
    ({ status: 200, body: await actions.invoke(definition, input) });
  const optional = (value: unknown) => typeof value === "string" ? value : undefined;
  const integer = (value: unknown) => value === undefined || value === null || value === "" ? undefined : Number(value);
  return {
    "workflows.list": () => run(workflowsActions.list, {})(),
    "workflows.create": ({ request }) => run(workflowsActions.create, { ...(optional(request.body.title) !== undefined ? { title: optional(request.body.title) } : {}),
      ...(request.body.chain !== undefined ? { chain: request.body.chain } : {}) })(),
    "workflows.get": ({ params }) => run(workflowsActions.get, { id: params.id! })(),
    "workflows.update": ({ params, request }) => run(workflowsActions.update, { id: params.id!, revision: Number(request.body.revision),
      ...(optional(request.body.title) !== undefined ? { title: optional(request.body.title) } : {}),
      ...(request.body.chain !== undefined ? { chain: request.body.chain } : {}) })(),
    "workflows.delete": ({ params }) => run(workflowsActions.delete, { id: params.id! })(),
    "workflows.station_items": ({ params }) => run(workflowsActions.stationItems, { plugin: params.plugin! })(),
    "workflows.instance_start": ({ params, request }) => run(workflowsActions.start, { id: params.id!,
      ...(optional(request.body.item_id) ? { item_id: optional(request.body.item_id) } : {}),
      ...(optional(request.body.title) ? { title: optional(request.body.title) } : {}) })(),
    "workflows.instance_get": ({ params }) => run(workflowsActions.instance, { id: params.id! })(),
    "workflows.instance_preview": ({ params, request }) => run(workflowsActions.preview, { id: params.id!,
      ...(integer(request.body.from) !== undefined ? { from: integer(request.body.from) } : {}) })(),
    "workflows.instance_continue": ({ params, request }) => run(workflowsActions.continue, { id: params.id!,
      ...(integer(request.body.from) !== undefined ? { from: integer(request.body.from) } : {}),
      ...(optional(request.body.updated_at) !== undefined ? { updated_at: optional(request.body.updated_at) } : {}),
      ...(optional(request.body.title) !== undefined ? { title: optional(request.body.title) } : {}),
      ...(optional(request.body.body) !== undefined ? { body: optional(request.body.body) } : {}) })(),
    "workflows.instance_stop": ({ params }) => run(workflowsActions.stop, { id: params.id! })(),
  };
}

export function workflowsRouteErrorResponse(error: unknown): WorkflowsPluginRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "工作流程请求失败";
  if (code === "workflows.not_found" || code === "actions.missing") return { status: 404, body: { error: message, code } };
  if (code === "workflows.conflict") return { status: 409, body: { error: message, code } };
  if (code.startsWith("actions.")) return { status: code.includes("forbidden") || code === "actions.scope_mismatch" ? 403 : 400, body: { error: message, code } };
  if (code.startsWith("workflows.")) return { status: 400, body: { error: message, code } };
  return { status: 400, body: { error: message } };
}
