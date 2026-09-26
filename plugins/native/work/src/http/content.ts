import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { workActions } from "../actions.js";
import type { WorkSessionHttpContext } from "./types.js";

/** Public Session queries and resume share the same authorization and original owner. */
export async function handleSessionContentHttp(context: WorkSessionHttpContext): Promise<boolean> {
  const { method, pathname, respond, actions } = context;
  const match = pathname.match(/^\/api\/sessions\/([^/]+)\/(content|resume)$/);
  if (!match && !(method === "GET" && pathname === "/api/sessions")) return false;
  try {
    if (!actions) throw new ActionError("actions.service_unavailable", "Session 动作服务不可用");
    if (!match) { respond(200, await actions.invoke(workActions.list, {})); return true; }
    let sessionId: string;
    try { sessionId = decodeURIComponent(match[1]!); }
    catch { respond(400, { error: "Session ID 无效" }); return true; }
    if (method === "GET" && match[2] === "content") {
      respond(200, await actions.invoke(workActions.content, { session_id: sessionId }));
    } else if (method === "POST" && match[2] === "resume") {
      const result = await actions.invoke(workActions.resume, { session_id: sessionId });
      respond(result.status === "ok" ? 200 : result.status === "unsupported" ? 409 : 503, result);
    } else respond(405, { error: "Session 操作不支持这个请求方法" });
  } catch (error) {
    const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
    respond(code === "session.not_found" || code === "sessions.not_found" || code === "actions.plugin_disabled" || code === "actions.missing" ? 404 : code === "actions.forbidden" ? 403
      : code === "actions.service_unavailable" ? 503 : 400, { error: error instanceof Error ? error.message : String(error), ...(code ? { code } : {}) });
  }
  return true;
}
