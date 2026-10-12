import type { ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { todoActions } from "./actions.js";
import { todoOrganizeActions } from "./organize-actions.js";
import type { TodoPluginRouteContext, TodoPluginRouteHandler } from "./routes.js";

export interface TodoRoutePorts {
  /** Bound by the Host to the person and, inside a project, to that project; never taken from the request. */
  readonly actions: BoundActionClient;
}

/** HTTP only maps parameters; authority, scope and the executor come from the Host. */
export function createTodoRouteHandlers(ports: TodoRoutePorts): Record<string, TodoPluginRouteHandler> {
  const call = (definition: ActionDefinition, args: (context: TodoPluginRouteContext, body: Record<string, unknown>) => unknown): TodoPluginRouteHandler => async context => {
    const { project_id: _ignored, ...body } = context.request.body;
    return { status: 200, body: await ports.actions.invoke(definition, args(context, body)) };
  };
  const identified = ({ params }: TodoPluginRouteContext, body: Record<string, unknown>) => ({ ...body, id: params.id });
  const flag = (value: string | null) => value === "1" || value === "true";
  return {
    "todo.list": call(todoActions.list, ({ request: { query } }) => ({
      ...(query.get("view") ? { view: query.get("view") } : {}),
      ...(query.get("q") ? { query: query.get("q") } : {}),
      ...(query.get("placement") ? { placement: query.get("placement") } : {}),
      ...(flag(query.get("archived")) ? { archived: true } : {}),
      ...(flag(query.get("all")) ? { all_projects: true } : {}),
      ...(query.get("today") ? { today: query.get("today") } : {}),
    })),
    "todo.create": call(todoActions.create, (_context, body) => body),
    "todo.batch": call(todoActions.batch, (_context, body) => body),
    "todo.revert": call(todoActions.revert, (_context, body) => body),
    "todo.get": call(todoActions.get, ({ params }) => ({ id: params.id })),
    "todo.update": call(todoActions.update, identified),
    "todo.status": call(todoActions.status, identified),
    "todo.archive": call(todoActions.archive, identified),
    "todo.delete": call(todoActions.remove, identified),
    "todo.link": call(todoActions.link, identified),
    "todo.reminders": call(todoActions.dueReminders, () => ({})),
    "todo.acknowledge": call(todoActions.acknowledgeReminder, ({ params }) => ({ id: params.id })),
    "todo.organize.list": call(todoOrganizeActions.list, ({ request: { query } }) => (query.get("status") === "all" ? { status: "all" } : {})),
    "todo.organize.get": call(todoOrganizeActions.get, ({ params }) => ({ id: params.id })),
    "todo.organize.apply": call(todoOrganizeActions.apply, identified),
    "todo.organize.close": call(todoOrganizeActions.close, ({ params }) => ({ id: params.id })),
  };
}
