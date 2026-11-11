import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { kitCatalogActions } from "@molis-ai/molis-work-contracts/services/kit";
import { promptOverrideActions } from "./agent-definitions/prompt-overrides.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { localWebActionContext } from "./local-web-actions.js";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { PLUGIN_INSTALL_PROVIDER_ID } from "./plugin-install-actions.js";
import { pluginPackageExport } from "./plugin-package-export.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { MolisWorkLocalHost } from "./project-host.js";

/** A prompt edits file at its limit: 200 rows of 20,000 characters, three bytes each in UTF-8, and the JSON around them. */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/** The 「能力包」 page's actions (specs/capability-pack/contract-design.md §4.7, §4.9), each by its own path; the provider only where two could answer. */
type Route = { capability_id: string; version: number; provider_id?: string };
const ROUTES = new Map<string, Route>([
  ["list", kitCatalogActions.list],
  ["package-export", { ...pluginPackageExport, provider_id: PLUGIN_INSTALL_PROVIDER_ID }],
  ["prompt-overrides/export", promptOverrideActions.export],
  ["prompt-overrides/preview", promptOverrideActions.preview],
  ["prompt-overrides/confirm", promptOverrideActions.confirm],
]);

/**
 * The 「能力包」 settings page, in a project or in the personal space: every route invokes its action as the person, through the same
 * client the page's scope has. The person's own page request is the `user_action` (S-58); nothing in the body is read for it, and a
 * plugin's page is refused (S-kit-catalog 10).
 */
export async function handleKitSettingsHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  host: MolisWorkLocalHost, project?: LocalHostProjectReference): Promise<boolean> {
  if (!url.pathname.startsWith("/api/kit/")) return false;
  const controller = new AbortController(), cancel = () => controller.abort(new ActionError("actions.cancelled", "能力包请求已经结束"));
  const disconnected = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel); response.once("close", disconnected);
  try { return await dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/kit", maxBodyBytes: MAX_BODY_BYTES,
    async handle({ method, pathname, body }) {
      const definition = ROUTES.get(pathname.slice("/api/kit/".length));
      if (!definition || method !== "POST") return null;
      if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", "插件页面不能代本人管理能力包");
      const caller = { ...await localWebActionContext(host, project, LOCAL_OWNER_PERMISSIONS, controller.signal),
        user_action: { source: "web" as const, conversation_ref: `web:${project?.project_id ?? "home"}`, message_ref: `web:${randomUUID()}` } };
      const client = project ? host.actionClient(project) : host.homeActionClient();
      return { status: 200, body: await client.invoke(caller, definition, body) as object };
    } });
  } finally { request.off("aborted", cancel); response.off("close", disconnected); }
}
