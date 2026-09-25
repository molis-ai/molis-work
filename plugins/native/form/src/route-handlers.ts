import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { formActions } from "./actions.js";
import type { FormPluginRouteContext, FormPluginRouteHandler, FormPluginRouteResponse } from "./routes.js";

export interface FormRoutePorts {
  readonly actions: BoundActionClient;
  readonly projectId: string;
}

/** HTTP only maps parameters; the Host supplies project authority and the shared executor. */
export function createFormRouteHandlers(ports: FormRoutePorts): Record<string, FormPluginRouteHandler> {
  const call = (definition: ActionDefinition, args: (context: FormPluginRouteContext, body: Record<string, unknown>) => unknown): FormPluginRouteHandler => async context => {
    const { project_id, ...body } = context.request.body;
    for (const requested of [...context.request.query.getAll("project_id"), project_id]) {
      if (requested !== undefined && requested !== ports.projectId) throw new ActionError("actions.scope_mismatch", "问卷项目与当前项目不一致");
    }
    return { status: 200, body: await ports.actions.invoke(definition, args(context, body)) };
  };
  const empty = () => ({});
  const input = (_: FormPluginRouteContext, body: Record<string, unknown>) => body;
  const identified = ({ params }: FormPluginRouteContext, body: Record<string, unknown>) => ({ ...body, id: params.id });
  return {
    "form.list": call(formActions.list, empty),
    "form.get": call(formActions.get, ({ params }) => ({ id: params.id })),
    "form.create": call(formActions.create, input),
    "form.update": call(formActions.update, identified),
    "form.delete": call(formActions.delete, identified),
    "form.promote": call(formActions.promote, identified),
    "form.generate": call(formActions.generate, identified),
    "form.generate-ai": call(formActions.generateAi, identified),
    "form.publish": call(formActions.publish, identified),
    "form.submit": call(formActions.submit, identified),
    "form.results": call(formActions.results, ({ params }) => ({ id: params.id })),
  };
}

export function formRouteErrorResponse(error: unknown): FormPluginRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "问卷请求失败";
  const status = code === "form.not_found" ? 404 : ["form.unavailable", "form.conflict", "form.request_conflict", "form.publication_pending", "form.publication_conflict"].includes(code) ? 409
    : ["actions.forbidden", "actions.scope_mismatch", "form.publication_owner"].includes(code) ? 403 : 400;
  return { status, body: { error: message, ...(code ? { code } : {}) } };
}
