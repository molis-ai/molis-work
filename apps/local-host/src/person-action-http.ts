import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { withProtectedHostAction } from "./plugin-consent-settings-entry.js";
import { homePageRequestBound } from "./home-page-authority.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const MAX_BODY_BYTES = 256 * 1024;

/** Invoke an action from a workbench-owned request after its route has excluded plugin pages. */
export function invokePersonPageAction<Input, Output>(host: MolisWorkLocalHost, project: LocalHostProjectReference,
  definition: ActionDefinition<Input, Output>, input: Input, signal?: AbortSignal): Promise<Output> {
  const action = Object.freeze({ source: "web" as const, conversation_ref: `web:${project.project_id}`, message_ref: `web:${randomUUID()}` });
  const client = bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS, { signal, user_action: () => action });
  return withProtectedHostAction(action, () => client.invoke(definition, input));
}

/**
 * The workbench's own doors to a system service in one project: each route under `prefix` is a POST that invokes its action as the
 * person. The person's own page request is the `user_action` (S-58); nothing in the body is read for it, and a plugin's page is
 * refused with `refusal`: a plugin acts through its own actions, never as the person.
 */
export async function handlePersonActionRoutes(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost, project: LocalHostProjectReference,
  doors: { prefix: string; routes: ReadonlyMap<string, ActionDefinition>; refusal: string }): Promise<boolean> {
  if (!url.pathname.startsWith(`${doors.prefix}/`)) return false;
  const controller = new AbortController(), cancel = () => controller.abort(new ActionError("actions.cancelled", "请求已经结束"));
  const disconnected = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel); response.once("close", disconnected);
  try { return await dispatchNativePluginJsonHttp(request, response, url, { prefix: doors.prefix, maxBodyBytes: MAX_BODY_BYTES,
    async handle({ method, pathname, body }) {
      const definition = doors.routes.get(pathname.slice(doors.prefix.length + 1));
      if (!definition || method !== "POST") return null;
      if (pluginPageRequest(request) || homePageRequestBound(request)) throw new ActionError("actions.forbidden", doors.refusal);
      return { status: 200, body: await invokePersonPageAction(host, project, definition, body, controller.signal) as object };
    } });
  } finally { request.off("aborted", cancel); response.off("close", disconnected); }
}
