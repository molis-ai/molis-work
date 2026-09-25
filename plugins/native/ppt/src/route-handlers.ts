import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { pptActions } from "./actions.js";
import type { PptPluginRouteContext, PptPluginRouteHandler, PptPluginRouteResponse } from "./routes.js";

export interface PptRoutePorts {
  readonly actions: BoundActionClient;
  readonly projectId: string;
}

/** HTTP only maps parameters; the Host supplies project authority and the shared executor. */
export function createPptRouteHandlers(ports: PptRoutePorts): Record<string, PptPluginRouteHandler> {
  const call = (definition: ActionDefinition, args: (context: PptPluginRouteContext, body: Record<string, unknown>) => unknown): PptPluginRouteHandler => async context => {
    const { project_id, ...body } = context.request.body;
    for (const requested of [...context.request.query.getAll("project_id"), project_id]) {
      if (requested !== undefined && requested !== ports.projectId) throw new ActionError("actions.scope_mismatch", "演示稿项目与当前项目不一致");
    }
    return { status: 200, body: await ports.actions.invoke(definition, args(context, body)) };
  };
  const empty = () => ({});
  const input = (_: PptPluginRouteContext, body: Record<string, unknown>) => body;
  const identified = ({ params }: PptPluginRouteContext, body: Record<string, unknown>) => ({ ...body, id: params.id });
  return {
    "ppt.list": call(pptActions.list, empty),
    "ppt.get": call(pptActions.get, ({ params }) => ({ id: params.id })),
    "ppt.create": call(pptActions.create, input),
    "ppt.update": call(pptActions.update, identified),
    "ppt.delete": call(pptActions.delete, identified),
    "ppt.export": call(pptActions.export, ({ params, request }) => ({ id: params.id,
      ...(request.query.has("expected_version") ? { expected_version: Number(request.query.get("expected_version")) } : {}) })),
    "ppt.promote": call(pptActions.promote, identified),
  };
}

export function pptRouteErrorResponse(error: unknown): PptPluginRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "演示稿请求失败";
  const status = code === "ppt.not_found" ? 404 : ["ppt.unavailable", "ppt.conflict", "ppt.request_conflict", "ppt.publication_pending", "ppt.publication_conflict"].includes(code) ? 409
    : ["actions.forbidden", "actions.scope_mismatch", "ppt.publication_owner"].includes(code) ? 403 : 400;
  return { status, body: { error: message, ...(code ? { code } : {}) } };
}
