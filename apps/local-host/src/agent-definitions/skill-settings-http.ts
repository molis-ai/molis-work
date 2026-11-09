import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SKILLS_PERMISSIONS, skillCatalogActions, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { isDeepStrictEqual } from "node:util";
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
      const invoke = (context = caller) => client.invoke(context, { capability_id: definition.capability_id, version: definition.version }, body);
      if (definition === skillCatalogActions.readBodies && Array.isArray(body.refs) && body.refs.length === 1) {
        // The person's protected click names exactly this Skill, so the Host freezes it as the named list of this one read (§2.3): a
        // `manual` Skill's body can be shown. The read is for the consumer the Skill applies to, which the catalog says; nothing is
        // enabled and no use is recorded (only a round's owner records one).
        const named = body.refs[0] as SkillRef;
        const listed = await client.invoke(caller, { capability_id: skillCatalogActions.list.capability_id, version: skillCatalogActions.list.version }, {}) as { skills: SkillCatalogEntry[] };
        const appliesTo = listed.skills.find(skill => isDeepStrictEqual(skill.ref, named))?.applies_to;
        return { status: 200, body: await invoke({ ...caller, skill_round: { consumer: appliesTo === "coding" ? "coding" : "assistant", named: [named] } }) };
      }
      return { status: 200, body: await invoke() };
    } });
  } finally { request.off("aborted", cancel); response.off("close", disconnected); }
}
