import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { trustedReviewActions } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { withCallId } from "@molis-ai/molis-work-kernel";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { actionGatewayHomeId, isGatewayCallId } from "./action-gateway.js";
import { MANAGEMENT_ACTION_PATH, catalogManagementProject } from "./management-action-client.js";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { recordedCallIdField } from "./call-id-response.js";
import { readLocalWebBody, sendLocalWebJson as sendJson } from "./web-http.js";
import { invokeProjectReviewManagement } from "./project-review-entry.js";

/** Mounted only after the resident service's Origin/token/one-time-key gate. */
export async function handleManagementActionHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  home: string, host: MolisWorkLocalHost, accountCurrent?: () => void): Promise<boolean> {
  if (url.pathname !== MANAGEMENT_ACTION_PATH) return false;
  if (request.method !== "POST") { sendJson(response, 405, { error: "只支持本机 POST 调用" }); return true; }
  const controller = new AbortController();
  const disconnected = () => { if (!response.writableFinished) controller.abort(new ActionError("actions.cancelled", "管理调用连接已断开")); };
  response.once("close", disconnected);
  try {
    const body = await readLocalWebBody(request, 16 * 1024 * 1024);
    const fields = ["home_id", "database_path", "project_id", "call_id", "capability", "input", "evidence"];
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key))
      || typeof body.database_path !== "string" || typeof body.project_id !== "string" || !body.project_id.trim()
      || !isGatewayCallId(body.call_id)) throw new ActionError("actions.input_invalid", "管理动作传输参数无效");
    if (body.home_id !== actionGatewayHomeId(home)) throw new ActionError("actions.home_mismatch", "管理调用属于另一个 Home");
    const capability = body.capability;
    if (!capability || typeof capability !== "object" || Array.isArray(capability) || Object.keys(capability).some(key => !["capability_id", "version"].includes(key))
      || !("capability_id" in capability) || typeof capability.capability_id !== "string"
      || !("version" in capability) || typeof capability.version !== "number" || !Number.isSafeInteger(capability.version)) throw new ActionError("actions.input_invalid", "管理能力引用无效");
    // Only the platform's protected review operations (44B: no plugin declares management actions).
    const review = (Object.keys(trustedReviewActions) as Array<keyof typeof trustedReviewActions>).find(name =>
      trustedReviewActions[name].capability_id === capability.capability_id && trustedReviewActions[name].version === capability.version);
    if (!review) throw new ActionError("actions.missing", "这个管理动作或版本不可用");
    const project = catalogManagementProject(home, body.database_path);
    if (!project || project.project_id !== body.project_id) throw new ActionError("actions.scope_mismatch", "管理调用的项目数据库不属于当前 Home");
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    await withCallId(body.call_id, async () => {
      try {
        if (body.evidence !== undefined) throw new ActionError("actions.input_invalid", "本人决定的出处由当前管理入口提供");
        const result = await invokeProjectReviewManagement(host, reference, review, body.input, String(body.call_id), controller.signal, accountCurrent);
        if (!response.destroyed) sendJson(response, 200, { result, ...recordedCallIdField() });
        else if (!response.writableEnded) {
          response.statusCode = 200;
          response.end();
        }
      }
      catch (error) { const refused = actionErrorResponse(error); if (!response.destroyed) sendJson(response, refused.status, { ...refused.body, ...recordedCallIdField() }); }
    });
  } catch (error) { const refused = actionErrorResponse(error); if (!response.destroyed) sendJson(response, refused.status, refused.body); }
  finally { response.off("close", disconnected); }
  return true;
}
