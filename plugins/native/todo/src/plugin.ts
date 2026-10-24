import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, type ActionAvailability, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createTodoActionHandlers, todoActions } from "./actions.js";
import { todoManifest } from "./manifest.js";
import { todoOrganizeActions } from "./organize-actions.js";
import { todoMethods, todoPrompts } from "./roles.js";
import { TODO_INSTRUCTIONS } from "./prompts.js";
import { TodoStore, type TodoStores } from "./store.js";
import { todoUiContribution } from "./ui.js";

/**
 * Todo as a Plugin Runtime plugin on the Home instance (docs/system/RUNTIME-MIGRATION.md 5.2): one library for the person, whichever
 * project they are in. Its library is the `todo` store its catalog entry declares; the model and the actions it routes come from the
 * Runtime's services. Inside a project the page calls its routes under that project's path, so the actions see the project (S-31).
 */
export function createTodoPlugin(): PluginDefinition {
  return { manifest: todoManifest, agent_prompts: todoPrompts, instructions: TODO_INSTRUCTIONS, methods: todoMethods, async start(context) {
    for (const permission of todoManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供待办库");
    const stores: TodoStores = {
      read: run => run(new TodoStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters),
        run: () => { throw new ActionError("actions.execution_failed", "待办的读取不写入"); } })),
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new TodoStore(transaction))),
    };
    const model = context.services?.model;
    return { kind: "app", views: [todoUiContribution], routes: todoRoutes(context),
      actions: createTodoActionHandlers({ ...stores,
        modelAvailability: (): ActionAvailability => model?.availability() ?? { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" },
        ...(model ? { completeText: async (prompt, options) => (await model.complete(prompt, { signal: options.signal })).text } : {}) }) };
  } };
}

/** The routes only map the request to an action; a `project_id` the page sends is dropped, the project is the path's. */
function todoRoutes(context: PluginStartContext) {
  const body = (request: PluginRouteRequest): Record<string, unknown> => {
    const value = request.body && typeof request.body === "object" ? { ...request.body as Record<string, unknown> } : {};
    delete value.project_id;
    return value;
  };
  const route = (definition: ActionDefinition, routeId: string, input: (request: PluginRouteRequest, fields: Record<string, unknown>) => unknown) =>
    bindPluginActionRoute(context, definition, request => input(request, body(request)) as never, routeId);
  const fields = (_: PluginRouteRequest, value: Record<string, unknown>) => value;
  const identified = (request: PluginRouteRequest, value: Record<string, unknown>) => ({ ...value, id: request.params.id });
  const id = (request: PluginRouteRequest) => ({ id: request.params.id });
  const flag = (value: string | undefined) => value === "1" || value === "true";
  return [
    route(todoActions.list, "todo.list", ({ query }) => ({
      ...(query.view ? { view: query.view } : {}), ...(query.q ? { query: query.q } : {}), ...(query.placement ? { placement: query.placement } : {}),
      ...(flag(query.archived) ? { archived: true } : {}), ...(flag(query.all) ? { all_projects: true } : {}), ...(query.today ? { today: query.today } : {}),
    })),
    route(todoActions.create, "todo.create", fields),
    route(todoActions.batch, "todo.batch", fields),
    route(todoActions.revert, "todo.revert", fields),
    route(todoActions.dueReminders, "todo.reminders", () => ({})),
    route(todoOrganizeActions.list, "todo.organize.list", ({ query }) => (query.status === "all" ? { status: "all" } : {})),
    route(todoOrganizeActions.get, "todo.organize.get", id),
    route(todoOrganizeActions.apply, "todo.organize.apply", identified),
    route(todoOrganizeActions.close, "todo.organize.close", id),
    route(todoActions.get, "todo.get", id),
    route(todoActions.update, "todo.update", identified),
    route(todoActions.status, "todo.status", identified),
    route(todoActions.archive, "todo.archive", identified),
    route(todoActions.remove, "todo.delete", identified),
    route(todoActions.link, "todo.link", identified),
    route(todoActions.acknowledgeReminder, "todo.acknowledge", id),
  ];
}
