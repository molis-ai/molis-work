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
  ["tasks", mainlineActions.tasks as ActionDefinition],
  ["tasks/command", mainlineActions.command as ActionDefinition],
]);

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
