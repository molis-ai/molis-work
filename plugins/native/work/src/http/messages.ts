import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PrepareSessionMessage, SessionMessageRecord } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { workActions } from "../actions.js";
import type { WorkSessionHttpContext } from "./types.js";

/** Transport only: receipt persistence, deduplication and delivery belong to the common actions. */
export async function handleSessionMessageHttp(context: WorkSessionHttpContext): Promise<boolean> {
  const send = context.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  const receipt = context.pathname.match(/^\/api\/session-messages\/([^/]+)(\/retry)?$/);
  if (!send && !receipt) return false;
  const { respond, actions } = context;
  try {
    if (!actions) throw new ActionError("actions.service_unavailable", "Session 动作服务不可用");
    let id: string;
    try { id = decodeURIComponent((send ?? receipt)![1]!); }
    catch { respond(400, { error: "消息或会话 ID 无效" }); return true; }
    let result: SessionMessageRecord;
    if (send && context.method === "POST") {
      result = await actions.invoke(workActions.messageSend, { ...await context.readBody(), session_id: id } as Omit<PrepareSessionMessage, "actor_id" | "project_id">);
    } else if (receipt && !receipt[2] && context.method === "GET") {
      respond(200, await actions.invoke(workActions.messageRead, { request_id: id })); return true;
    } else if (receipt?.[2] && context.method === "POST") {
      result = await actions.invoke(workActions.messageRetry, { request_id: id });
    } else { respond(405, { error: "消息操作不支持这个请求方法" }); return true; }
    respond(result.state === "accepted" ? 200 : result.state === "failed" ? 409 : 202, result);
  } catch (error) {
    const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "session.message_failed";
    const status = ["session.message_not_found", "session.not_found", "sessions.not_found", "actions.plugin_disabled", "actions.missing"].includes(code) ? 404
      : code === "session.message_failed" ? 500 : code === "actions.forbidden" ? 403 : ["session.message_conflict", "session.message_target_changed"].includes(code) ? 409
      : ["session.message_unavailable", "session.message_content_unavailable", "actions.service_unavailable"].includes(code) ? 503 : 400;
    respond(status, { code, error: code === "session.message_failed" ? "消息请求失败，请保留原请求并查询送达状态" : error instanceof Error ? error.message : "消息请求失败" });
  }
  return true;
}
