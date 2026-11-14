import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { mainlineActions } from "@molis-ai/molis-work-contracts/services/mainline";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const MAX_BODY_BYTES = 256 * 1024;
const ROUTES = new Map<string, ActionDefinition>([
  ["line", mainlineActions.line as ActionDefinition],
  ["waiting", mainlineActions.waiting as ActionDefinition],
  ["place", mainlineActions.place as ActionDefinition],
  ["tasks", mainlineActions.tasks as ActionDefinition],
  ["tasks/command", mainlineActions.command as ActionDefinition],
  ["tasks/decide", mainlineActions.decide as ActionDefinition],
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

/**
 * The workbench's own doors to the mainline service in one project: each route invokes its action as the person. The person's own
 * page request is the `user_action` (S-58); nothing in the body is read for it, and a plugin's page is refused: a plugin reads its
 * own tasks, and stops them, through its own actions.
 */
export async function handleMainlineHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  host: MolisWorkLocalHost, project: LocalHostProjectReference): Promise<boolean> {
  if (!url.pathname.startsWith("/api/mainline/")) return false;
  const controller = new AbortController(), cancel = () => controller.abort(new ActionError("actions.cancelled", "请求已经结束"));
  const disconnected = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel); response.once("close", disconnected);
  try { return await dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/mainline", maxBodyBytes: MAX_BODY_BYTES,
    async handle({ method, pathname, body }) {
      const definition = ROUTES.get(pathname.slice("/api/mainline/".length));
      if (!definition || method !== "POST") return null;
      if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", "插件页面不能代本人读取或操作后台任务");
      const message = `web:${randomUUID()}`;
      const client = bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS, { signal: controller.signal,
        user_action: () => ({ source: "web", conversation_ref: `web:${project.project_id}`, message_ref: message }) });
      return { status: 200, body: await client.invoke(definition, body) as object };
    } });
  } finally { request.off("aborted", cancel); response.off("close", disconnected); }
}
