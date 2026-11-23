import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { mainlineActions, type WorkLineReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { SHELF_ADMIT_ACTION } from "@molis-ai/molis-work-module-shelf/contract";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { handlePersonActionRoutes, invokePersonPageAction } from "./person-action-http.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { webManagementAuthenticated } from "./web-sessions.js";

const ROUTES = new Map<string, ActionDefinition>([
  ["line", mainlineActions.line as ActionDefinition],
  ["waiting", mainlineActions.waiting as ActionDefinition],
  ["place", mainlineActions.place as ActionDefinition],
  ["tasks", mainlineActions.tasks as ActionDefinition],
  ["tasks/command", mainlineActions.command as ActionDefinition],
  ["tasks/decide", mainlineActions.decide as ActionDefinition],
  ["open", mainlineActions.open as ActionDefinition],
  // 「放到 Shelf」 on a card of something done (WLN-11): Shelf's own action, as the person; what is put there is what the page shows.
  ["shelve", SHELF_ADMIT_ACTION as ActionDefinition],
]);

const DAY = 86_400_000;

/**
 * The line, with the task table it was placed with, for the page's one attention read (`attention-http.ts`) and the event card's
 * check: one `mainline.line.read@1` as the person, in the window the bottom line shows (thirty days back, two ahead), so the table
 * is read once for both (N42). The attention response may present original reviews. The event existence check only needs the
 * line. A plugin's page gets neither, as on the routes below.
 */
export function mainlineAttention(request: IncomingMessage, host: MolisWorkLocalHost, project: LocalHostProjectReference, presentReviews = false): { line(): Promise<WorkLineReadResult> } | null {
  if (pluginPageRequest(request)) return null;
  return {
    line: () => {
      const now = Date.now(), window = { from: new Date(now - 30 * DAY).toISOString(), to: new Date(now + 2 * DAY).toISOString(), now: new Date(now).toISOString() };
      return presentReviews && webManagementAuthenticated(request) ? invokePersonPageAction(host, project, mainlineActions.line, window)
        : bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS).invoke(mainlineActions.line, window);
    },
  };
}

/** The workbench's own doors to the mainline service in one project (`person-action-http.ts`): a plugin reads its own tasks, and stops them, through its own actions. */
export function handleMainlineHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost, project: LocalHostProjectReference): Promise<boolean> {
  return handlePersonActionRoutes(request, response, url, host, project, { prefix: "/api/mainline", routes: ROUTES, refusal: "插件页面不能代本人读取或操作后台任务" });
}
