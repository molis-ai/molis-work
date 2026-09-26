import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesActions } from "./actions.js";
import type { PagesPluginRouteContext, PagesPluginRouteHandler, PagesPluginRouteResponse } from "./routes.js";

export interface PagesRoutePorts {
  readonly actions: BoundActionClient;
  readonly projectId: string;
}

/** HTTP only maps parameters; the Host supplies project authority and the shared executor. */
export function createPagesRouteHandlers(ports: PagesRoutePorts): Record<string, PagesPluginRouteHandler> {
  const call = (definition: ActionDefinition, args: (context: PagesPluginRouteContext, body: Record<string, unknown>) => unknown): PagesPluginRouteHandler => async context => {
    const { project_id, ...body } = context.request.body;
    for (const requested of [...context.request.query.getAll("project_id"), project_id]) {
      if (requested !== undefined && requested !== ports.projectId) throw new ActionError("actions.scope_mismatch", "文档项目与当前项目不一致");
    }
    return { status: 200, body: await ports.actions.invoke(definition, args(context, body)) };
  };
  const empty = () => ({});
  const input = (_: PagesPluginRouteContext, body: Record<string, unknown>) => body;
  const identified = ({ params }: PagesPluginRouteContext, body: Record<string, unknown>) => ({ ...body, id: params.id });
  return {
    "pages.list": call(pagesActions.list, empty),
    "pages.templates": call(pagesActions.templates, empty),
    "pages.get": call(pagesActions.get, ({ params }) => ({ id: params.id })),
    "pages.create": call(pagesActions.create, input),
    "pages.update": call(pagesActions.update, identified),
    "pages.delete": call(pagesActions.delete, identified),
    "pages.folders.create": call(pagesActions.createFolder, input),
    "pages.folders.update": call(pagesActions.updateFolder, identified),
    "pages.folders.delete": call(pagesActions.deleteFolder, identified),
    "pages.import.preview": call(pagesActions.previewImport, input),
    "pages.import": call(pagesActions.import, input),
    "pages.ai": call(pagesActions.ai, identified),
    "pages.promote": call(pagesActions.promote, identified),
    "pages.extract": call(pagesActions.extract, identified),
  };
}

export function pagesRouteErrorResponse(error: unknown): PagesPluginRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "文档请求失败";
  const status = code === "pages.not_found" ? 404 : ["pages.unavailable", "pages.conflict", "pages.publication_pending", "pages.publication_conflict"].includes(code) ? 409
    : ["actions.forbidden", "actions.scope_mismatch", "pages.publication_owner"].includes(code) ? 403 : 400;
  return { status, body: { error: message, ...(code ? { code } : {}) } };
}
