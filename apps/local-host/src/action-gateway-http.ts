import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { ACTION_GATEWAY_PATH, actionGatewayHomeId } from "./action-gateway.js";
import { authorizeMcpActions } from "./mcp-action-client.js";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";

/** Must be mounted after the existing local origin, control-token and one-time-key gate. */
export async function handleActionGatewayHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  home: string, host: MolisWorkLocalHost, withCatalog: LocalWebCatalogRunner): Promise<boolean> {
  if (url.pathname !== ACTION_GATEWAY_PATH) return false;
  if (request.method !== "POST") { sendJson(response, 405, { error: "只支持本机 POST 调用" }); return true; }
  const abort = new AbortController();
  const disconnected = () => { if (!response.writableFinished) abort.abort(new ActionError("actions.cancelled", "调用连接已断开")); };
  response.once("close", disconnected);
  try {
    const body = await readGatewayBody(request);
    const fields = ["operation", "home_id", "client_id", "project_id", "instance_id", "capability", "input", "runtime_session_id"];
    if (Object.keys(body).some(key => !fields.includes(key)) || !["discover", "invoke"].includes(String(body.operation))
      || typeof body.client_id !== "string" || !body.client_id.trim()
      || !(body.project_id === null || typeof body.project_id === "string" && body.project_id.trim())) throw new ActionError("actions.input_invalid", "动作传输参数无效");
    if (body.runtime_session_id !== undefined && (typeof body.runtime_session_id !== "string" || !body.runtime_session_id.trim()
      || !body.client_id.startsWith("runtime:"))) throw new ActionError("actions.input_invalid", "Runtime 会话元数据无效");
    if (body.home_id !== actionGatewayHomeId(home)) throw new ActionError("actions.home_mismatch", "连接的系统服务属于另一个 Home");
    const instance = host.status().instance_id;
    if (body.operation === "invoke" && body.instance_id !== instance) throw new ActionError("actions.host_replaced", "系统服务已重启，请重新发现能力");
    const projectId = body.project_id as string | null;
    const project = projectId ? await withCatalog({ homeDirectory: home }, catalog => catalog.getProject(projectId)) : null;
    const reference = project ? molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path }) : undefined;
    const caller: ActionCallContext = { actor_id: body.client_id, project_id: projectId, audience: "mcp", permissions: [], signal: abort.signal,
      ...(body.runtime_session_id === undefined ? {} : { audit_actor_id: `${body.client_id}:${body.runtime_session_id}`, actor_kind: "runtime", runtime_session_id: body.runtime_session_id as string }) };
    const { context, service } = await authorizeMcpActions(host, caller, home, reference, () => {
      abort.signal.throwIfAborted();
      if (host.status().instance_id !== instance || host.status().state !== "running") throw new ActionError("actions.host_closed", "原系统服务已关闭");
    });
    if (body.operation === "discover") { sendJson(response, 200, { instance_id: instance, actions: await service.discover(context) }); return true; }
    const capability = body.capability as ActionReference | undefined;
    if (!capability || typeof capability !== "object" || Array.isArray(capability)
      || Object.keys(capability).some(key => !["capability_id", "version", "provider_id"].includes(key))
      || typeof capability.capability_id !== "string" || !Number.isSafeInteger(capability.version) || capability.version < 1
      || (capability.provider_id !== undefined && typeof capability.provider_id !== "string")) throw new ActionError("actions.input_invalid", "能力引用无效");
    const result = await service.invoke(context, capability, body.input);
    sendJson(response, 200, { instance_id: instance, result });
  } catch (error) {
    if (!response.destroyed) sendJson(response, error instanceof ActionError && error.code === "actions.input_invalid" ? 400 : 403,
      { code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "actions.transport_failed",
        error: error instanceof Error ? error.message : "系统动作调用失败" });
  } finally { response.off("close", disconnected); }
  return true;
}

function readGatewayBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let bytes = 0;
    request.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes <= 16 * 1024 * 1024) chunks.push(chunk); });
    request.once("error", reject); request.once("aborted", () => reject(new Error("调用已中断")));
    request.once("end", () => {
      try {
        if (bytes > 16 * 1024 * 1024) throw new ActionError("actions.input_invalid", "动作请求超过 16 MiB");
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("动作请求必须是对象");
        resolve(body as Record<string, unknown>);
      } catch (error) { reject(error instanceof ActionError ? error : new ActionError("actions.input_invalid", "动作请求必须是有效的 JSON 对象")); }
    });
  });
}
