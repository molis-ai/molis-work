import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SKILLS_PERMISSIONS, skillCatalogActions } from "@molis-ai/molis-work-contracts/services/skills";
import { withSkillSelection } from "./skill-selection.js";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { dispatchNativePluginJsonHttp } from "../native-plugin-http.js";
import { localWebActionContext } from "../local-web-actions.js";
import { pluginPageRequest } from "../plugin-page-authority.js";
import type { MolisWorkLocalHost } from "../project-host.js";

/** Both settings scopes invoke the same catalog, through the authenticated person's transport. */
export async function handleSkillSettingsHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  host: MolisWorkLocalHost, project?: LocalHostProjectReference): Promise<boolean> {
  if (!url.pathname.startsWith("/api/skills/")) return false;
  const controller = new AbortController(), cancel = () => controller.abort(new ActionError("actions.cancelled", "技能设置请求已经结束"));
  const disconnected = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel); response.once("close", disconnected);
  try { return await dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/skills", maxBodyBytes: 32_000,
    async handle({ method, pathname, body }) {
      const definition = pathname === "/api/skills/list" ? skillCatalogActions.list : pathname === "/api/skills/set" ? skillCatalogActions.setState : pathname === "/api/skills/body" ? skillCatalogActions.readBodies : undefined;
      if (!definition || method !== "POST") return null;
      if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", "插件页面不能代本人管理技能");
      const caller = { ...await localWebActionContext(host, project, SKILLS_PERMISSIONS, controller.signal),
        user_action: { source: "web" as const, conversation_ref: `web:${project?.project_id ?? "home"}`, message_ref: `web:${randomUUID()}` } };
      const client = project ? host.actionClient(project) : host.homeActionClient();
      const invoke = () => client.invoke(caller, { capability_id: definition.capability_id, version: definition.version }, body);
      if (definition === skillCatalogActions.readBodies && Array.isArray(body.refs) && body.refs.length === 1) {
        // The person's protected click names exactly this Skill: the read checks that reference against the catalog in its one snapshot,
        // so a `manual` Skill's body can be shown. It is not a round: nothing is enabled and no use is recorded.
        return { status: 200, body: await withSkillSelection({ actor_id: caller.actor_id, project_id: caller.project_id, named: [body.refs[0]] }, invoke) };
      }
      return { status: 200, body: await invoke() };
    } });
  } finally { request.off("aborted", cancel); response.off("close", disconnected); }
}
