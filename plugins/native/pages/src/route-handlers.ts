import { pagesCommentActions } from "./comment-actions.js";
import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesActions } from "./actions.js";
import type { PagesPluginRouteContext, PagesPluginRouteHandler } from "./routes.js";

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
    "pages.comments.list": call(pagesCommentActions.list, ({ params }) => ({ page_id: params.id })),
    "pages.comments.append": call(pagesCommentActions.append, ({ params }, body) => ({ ...body, page_id: params.id })),
    "pages.list": call(pagesActions.list, empty),
    "pages.templates": call(pagesActions.templates, empty),
    "pages.get": call(pagesActions.get, ({ params }) => ({ id: params.id })),
    "pages.create": call(pagesActions.create, input),
    "pages.update": call(pagesActions.update, identified),
    "pages.delete": call(pagesActions.delete, identified),
    "pages.discard": call(pagesActions.discard, identified),
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
