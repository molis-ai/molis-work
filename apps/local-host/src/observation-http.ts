import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { observationActions } from "@molis-ai/molis-work-contracts/services/observation";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { MolisWorkLocalHost } from "./project-host.js";

function routeDefinition(method: "GET" | "POST", pathname: string): ActionDefinition | undefined {
  switch (pathname) {
    case "/api/observation/settings":
      return observationActions.settingsGet as ActionDefinition;
    case "/api/observation/space":
      return observationActions.spaceGet as ActionDefinition;
    case "/api/observation/settings/set":
      return method === "POST" ? observationActions.settingsSet as ActionDefinition : undefined;
    case "/api/observation/coverage":
      return method === "POST" ? observationActions.coverageGet as ActionDefinition : undefined;
    case "/api/observation/records":
      return method === "POST" ? observationActions.recordsQuery as ActionDefinition : undefined;
    case "/api/observation/evidence":
      return method === "POST" ? observationActions.evidenceGet as ActionDefinition : undefined;
    case "/api/observation/cleanup/preview":
      return method === "POST" ? observationActions.cleanupPreview as ActionDefinition : undefined;
    case "/api/observation/cleanup/apply":
      return method === "POST" ? observationActions.cleanupApply as ActionDefinition : undefined;
    default:
      return undefined;
  }
}

/**
 * The person's local Web transport for reading and managing work records (`/api/observation/*`, except `/api/observation/ui`
 * which stays behind `observationShellDoor`). Isolated plugin pages are refused (`S-observation-records` 10).
 */
export async function handleObservationHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  host: MolisWorkLocalHost,
  project?: LocalHostProjectReference,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/observation/") || url.pathname === "/api/observation/ui") return false;
  const controller = new AbortController();
  const cancel = () => controller.abort(new ActionError("actions.cancelled", "工作记录请求已经结束"));
  const disconnected = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel);
  response.once("close", disconnected);
  try {
    return await dispatchNativePluginJsonHttp(request, response, url, {
      prefix: "/api/observation",
      maxBodyBytes: 64_000,
      async handle({ method, pathname, body }) {
        const definition = routeDefinition(method, pathname);
        if (!definition) return null;
        if (pluginPageRequest(request)) {
          throw new ActionError("actions.forbidden", "插件页面不能代本人读取或管理工作记录");
        }
        const actions = bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS, {
          signal: controller.signal,
          user_action: () => ({
            source: "web",
            conversation_ref: `web:${project?.project_id ?? "home"}`,
            message_ref: `web:${randomUUID()}`,
          }),
        });
        const answer = await actions.invoke(definition, body);
        return { status: 200, body: answer };
      },
    });
  } finally {
    request.off("aborted", cancel);
    response.off("close", disconnected);
  }
}
