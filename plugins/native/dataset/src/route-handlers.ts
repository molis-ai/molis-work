import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { datasetActions } from "./actions.js";
import type { DatasetPluginRouteContext, DatasetPluginRouteHandler, DatasetPluginRouteResponse } from "./routes.js";

export interface DatasetRoutePorts {
  readonly actions: BoundActionClient;
  readonly projectId: string;
}

/** HTTP only maps parameters; the Host supplies project authority and the shared executor. */
export function createDatasetRouteHandlers(ports: DatasetRoutePorts): Record<string, DatasetPluginRouteHandler> {
  const call = (definition: ActionDefinition, args: (context: DatasetPluginRouteContext, body: Record<string, unknown>) => unknown): DatasetPluginRouteHandler => async context => {
    const { project_id, ...body } = context.request.body;
    for (const requested of [...context.request.query.getAll("project_id"), project_id]) {
      if (requested !== undefined && requested !== ports.projectId) throw new ActionError("actions.scope_mismatch", "数据表项目与当前项目不一致");
    }
    return { status: 200, body: await ports.actions.invoke(definition, args(context, body)) };
  };
  const empty = () => ({});
  const input = (_: DatasetPluginRouteContext, body: Record<string, unknown>) => body;
  const identified = ({ params }: DatasetPluginRouteContext, body: Record<string, unknown>) => ({ ...body, id: params.id });
  return {
    "dataset.list": call(datasetActions.list, empty),
    "dataset.get": call(datasetActions.get, ({ params }) => ({ id: params.id })),
    "dataset.create": call(datasetActions.create, input),
    "dataset.update": call(datasetActions.update, identified),
    "dataset.delete": call(datasetActions.delete, identified),
    "dataset.promote": call(datasetActions.promote, identified),
    "dataset.generate": call(datasetActions.generate, identified),
    "dataset.generate-ai": call(datasetActions.generateAi, identified),
    "dataset.import": call(datasetActions.import, identified),
    "dataset.export": call(datasetActions.export, ({ params }) => ({ id: params.id })),
    "dataset.versions": call(datasetActions.versions, ({ params }) => ({ id: params.id })),
    "dataset.snapshot": call(datasetActions.snapshot, identified),
    "dataset.rollback": call(datasetActions.rollback, identified),
  };
}

export function datasetRouteErrorResponse(error: unknown): DatasetPluginRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "数据表请求失败";
  const status = code === "dataset.not_found" ? 404 : ["dataset.unavailable", "dataset.conflict", "dataset.publication_pending", "dataset.publication_conflict"].includes(code) ? 409
    : ["actions.forbidden", "actions.scope_mismatch", "dataset.publication_owner"].includes(code) ? 403 : 400;
  return { status, body: { error: message, ...(code ? { code } : {}) } };
}
