import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { mainlineActions } from "@molis-ai/molis-work-contracts/services/mainline";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { handlePersonActionRoutes } from "./person-action-http.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const ROUTES = new Map<string, ActionDefinition>([
  ["line", mainlineActions.line as ActionDefinition],
  ["waiting", mainlineActions.waiting as ActionDefinition],
  ["place", mainlineActions.place as ActionDefinition],
  ["tasks", mainlineActions.tasks as ActionDefinition],
  ["tasks/command", mainlineActions.command as ActionDefinition],
  ["tasks/decide", mainlineActions.decide as ActionDefinition],
  ["open", mainlineActions.open as ActionDefinition],
]);

const DAY = 86_400_000;

/**
 * The line and the task table for the page's one attention read (`attention-http.ts`): each is read as the person, in the window the
 * bottom line shows (thirty days back, two ahead). A plugin's page gets neither, as on the routes below.
 */
export function mainlineAttention(request: IncomingMessage, host: MolisWorkLocalHost, project: LocalHostProjectReference): { line(): Promise<unknown>; tasks(): Promise<unknown> } | null {
  if (pluginPageRequest(request)) return null;
  const client = bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS);
  return {
    line: () => { const now = Date.now(); return client.invoke(mainlineActions.line as ActionDefinition, { from: new Date(now - 30 * DAY).toISOString(), to: new Date(now + 2 * DAY).toISOString(), now: new Date(now).toISOString() }); },
    tasks: () => client.invoke(mainlineActions.tasks as ActionDefinition, {}),
  };
}

/** The workbench's own doors to the mainline service in one project (`person-action-http.ts`): a plugin reads its own tasks, and stops them, through its own actions. */
export function handleMainlineHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost, project: LocalHostProjectReference): Promise<boolean> {
  return handlePersonActionRoutes(request, response, url, host, project, { prefix: "/api/mainline", routes: ROUTES, refusal: "插件页面不能代本人读取或操作后台任务" });
}
