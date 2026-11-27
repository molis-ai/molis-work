import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { projectGuidanceActions as a, type AddProjectGuidanceInput, type UpdateProjectGuidanceInput } from "@molis-ai/molis-work-contracts/modules/project-guidance";
import { entryUserAction, webEntryMessage } from "./entry-user-action.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { localizeWebErrorMessage } from "./ui-error-words.js";

const PREFIX = "/api/project-guidance";
const CONFIRMATIONS: Record<string, string> = { edit: "用户在项目说明页面直接提交修改", deactivate: "用户在项目说明页面直接停用", restore: "用户在项目说明页面直接恢复" };
const strings = (value: unknown) => Array.isArray(value) ? value.map(String) : undefined;

/**
 * The project settings' guidance section (contract-design §9): read it, add an entry (`POST /api/project-guidance`) or edit, stop or
 * restore one (`POST /api/project-guidance/<id>`), as the person at this machine. The page request is the `user_action`; a plugin's
 * page cannot write the person's guidance.
 */
export async function handleProjectGuidanceHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  host: MolisWorkLocalHost, reference: LocalHostProjectReference): Promise<boolean> {
  return await dispatchNativePluginJsonHttp(request, response, url, { prefix: PREFIX, async handle({ method, pathname, body }) {
    const rest = pathname.slice(PREFIX.length);
    let guidanceId = "";
    if (rest.startsWith("/")) {
      try {
        guidanceId = decodeURIComponent(rest.slice(1));
      } catch {
        throw new ActionError("actions.input_invalid", "项目说明编号格式无效");
      }
    }
    if (rest && (!guidanceId || guidanceId.includes("/"))) return null;
    const actions = bindLocalWebActions(host, reference, LOCAL_OWNER_PERMISSIONS,
      { user_action: () => entryUserAction("web", reference.project_id, webEntryMessage(request)) });
    if (method === "GET") return rest ? null : { status: 200, body: await actions.invoke(a.read, {}) };
    if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", "插件页面不能代本人修改项目长期说明");
    const common = { source_refs: strings(body.source_refs), reason: String(body.reason ?? ""), user_confirmed: body.user_confirmed === true };
    const result = guidanceId
      ? await actions.invoke(a.update, { ...common, guidance_id: guidanceId, action: String(body.action ?? "") as UpdateProjectGuidanceInput["action"],
        kind: body.kind == null ? undefined : String(body.kind) as UpdateProjectGuidanceInput["kind"],
        content: body.content == null ? undefined : String(body.content),
        confirmation_summary: CONFIRMATIONS[String(body.action ?? "")] ?? CONFIRMATIONS.restore!,
        idempotency_key: String(body.idempotency_key ?? `web-project-guidance-update-${randomUUID()}`) })
      : await actions.invoke(a.add, { ...common, source_refs: common.source_refs ?? [], kind: String(body.kind ?? "") as AddProjectGuidanceInput["kind"],
        content: String(body.content ?? ""), confirmation_summary: "用户在项目说明页面直接提交新增",
        idempotency_key: String(body.idempotency_key ?? `web-project-guidance-${randomUUID()}`) });
    return { status: 200, body: { ...result, ...await afterWrite(actions) } };
  } });
}

/** Saving has committed; a separately refused re-read must not falsify its receipt. */
async function afterWrite(actions: BoundActionClient) {
  try { return { project_guidance: await actions.invoke(a.read, {}) }; }
  catch (error) { return { project_guidance: null, project_guidance_error: localizeWebErrorMessage(error, "common.error.unavailable") }; }
}
