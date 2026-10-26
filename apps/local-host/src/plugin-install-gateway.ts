import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { actionGatewayHomeId } from "./action-gateway.js";
import { pluginInstallActions } from "./plugin-install-actions.js";
import type { PluginInstallPreviewResult } from "./plugin-install-service.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { readLocalWebBody, sendLocalWebJson as sendJson } from "./web-http.js";

export const PLUGIN_INSTALL_PATH = "/api/internal/plugin-install";
/** A sandbox package carries its code as base64, so the body is larger than the 8 MiB code it may hold. */
const MAX_BODY = 24 * 1024 * 1024;
const ref = (action: { capability_id: string; version: number }): ActionReference => ({ capability_id: action.capability_id, version: action.version });

/**
 * The command line's way to install a signed package: the person's own act at this computer, made to the resident Host (the one process
 * that runs this Home's plugins), never in the command's own process. It is the same two actions the interface uses. Without `confirm`
 * the Host only previews; with it the Host previews and confirms in this one call, so what was confirmed is what was checked.
 * Mounted only after the resident service's Origin/token/one-time-key gate.
 */
export async function handlePluginInstallHttp(request: IncomingMessage, response: ServerResponse, url: URL, home: string, host: MolisWorkLocalHost): Promise<boolean> {
  if (url.pathname !== PLUGIN_INSTALL_PATH) return false;
  if (request.method !== "POST") { sendJson(response, 405, { error: "只支持本机 POST 调用" }); return true; }
  const controller = new AbortController();
  const disconnected = () => { if (!response.writableFinished) controller.abort(new ActionError("actions.cancelled", "安装调用连接已断开")); };
  response.once("close", disconnected);
  try {
    const body = await readLocalWebBody(request, MAX_BODY);
    const fields = ["home_id", "project_id", "bundle", "confirm", "pin_label"];
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key))
      || typeof body.project_id !== "string" || !body.project_id.trim() || typeof body.bundle !== "object" || body.bundle === null
      || (body.confirm !== undefined && typeof body.confirm !== "boolean") || (body.pin_label !== undefined && typeof body.pin_label !== "string")) {
      throw new ActionError("actions.input_invalid", "安装传输参数无效");
    }
    if (body.home_id !== actionGatewayHomeId(home)) throw new ActionError("actions.home_mismatch", "安装调用属于另一个 Home");
    const reference = host.projects().find(row => row.project_id === body.project_id);
    if (!reference) throw new ActionError("actions.scope_mismatch", "这个 Home 里没有这个项目");
    const client = host.actionClient(reference, false);
    // The person at this computer, by the command they ran: the Host fixes who acts and where it came from.
    const person = async (step: string) => ({ ...(await host.localPersonContext(reference, controller.signal)),
      user_action: { source: "management" as const, conversation_ref: `management:${reference.project_id}`, message_ref: `management:plugin-install:${step}` } });
    const preview = await client.invoke(await person("preview"), ref(pluginInstallActions.preview), { bundle: body.bundle }) as PluginInstallPreviewResult;
    if (body.confirm !== true) { sendJson(response, 200, { preview }); return true; }
    const installed = await client.invoke(await person("confirm"), ref(pluginInstallActions.confirm),
      { preview_id: preview.preview_id, consent: true, ...(typeof body.pin_label === "string" ? { pin_label: body.pin_label } : {}) });
    sendJson(response, 200, { preview, installed });
  } catch (error) { const refused = actionErrorResponse(error); if (!response.destroyed) sendJson(response, refused.status, refused.body); }
  finally { response.off("close", disconnected); }
  return true;
}
