import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { lingguangActions } from "./actions.js";
import type { LingguangPluginRouteContext, LingguangPluginRouteHandler, LingguangPluginRouteResponse } from "./routes.js";

export interface LingguangRoutePorts {
  readonly actions: BoundActionClient;
  readonly projectId: string;
}

/** The old HTTP paths only translate parameters; project authority is already bound by the Host. */
export function createLingguangRouteHandlers(ports: LingguangRoutePorts): Record<string, LingguangPluginRouteHandler> {
  const call = (definition: ActionDefinition, args: (context: LingguangPluginRouteContext, body: Record<string, unknown>) => unknown): LingguangPluginRouteHandler => async context => {
    const { project_id, ...body } = context.request.body;
    for (const requested of [...context.request.query.getAll("project_id"), project_id]) {
      if (requested !== undefined && requested !== ports.projectId) throw new ActionError("actions.scope_mismatch", "请求项目与当前项目不一致");
    }
    return { status: 200, body: await ports.actions.invoke(definition, args(context, body)) };
  };
  return {
    "lingguang.list": call(lingguangActions.list, () => ({})),
    "lingguang.create": call(lingguangActions.create, (_, body) => body),
    "lingguang.get": call(lingguangActions.get, ({ params }) => ({ id: params.id })),
    "lingguang.update": call(lingguangActions.update, ({ params }, body) => ({ ...body, id: params.id })),
    "lingguang.discard": call(lingguangActions.discard, ({ params }) => ({ ids: [params.id] })),
    "lingguang.discard_many": call(lingguangActions.discard, (_, body) => body),
    "lingguang.conversation_open": call(lingguangActions.openConversation, (_, body) => body),
    "lingguang.conversation_message": call(lingguangActions.message, ({ params }, body) => ({ ...body, id: params.id })),
  };
}

export function lingguangRouteErrorResponse(error: unknown): LingguangPluginRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "灵光请求失败";
  const status = code === "lingguang.not_found" ? 404 : code === "lingguang.conflict" ? 409
    : ["actions.forbidden", "actions.scope_mismatch"].includes(code) ? 403 : 400;
  return { status, body: { error: message, ...(code ? { code } : {}) } };
}
