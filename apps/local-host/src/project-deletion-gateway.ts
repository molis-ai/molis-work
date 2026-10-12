import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorFromResponse, actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { actionGatewayHomeId } from "./action-gateway.js";
import { runtimeActorId } from "./mcp-event-identity.js";
import type { ProjectDeletionService } from "./project-deletion-service.js";
import { postToResidentHost, residentHostOrigin } from "./resident-host-request.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";

/**
 * How a process that only forwards (the stdio MCP) deletes a project: the resident Host has the project's terminals and
 * runtime, so it runs the deletion and answers with the receipt. It travels the action gateway's transport
 * (`postToResidentHost`: the Home's own control token, a numeric loopback address, no redirect) and is guarded at the Host by
 * the same gate; docs/system/SECURITY-INVARIANTS.md S-07 lists what the route refuses.
 */
export const PROJECT_DELETION_GATEWAY_PATH = "/api/internal/project-deletion";

export interface ProjectDeletionGatewayRequest {
  project_id: string;
  delete_confirmed: boolean;
  idempotency_key: string;
}

export class LocalProjectDeletionGatewayClient {
  private readonly origin: string;
  constructor(private readonly options: { url: string; homeDirectory: string; clientId: string; runtimeSessionId: string | null }) {
    this.origin = residentHostOrigin(options.url);
  }

  /**
   * The resident Host's receipt, or null when no Host answers at the address (the caller then deletes in its own process:
   * there are no terminals or runtime to ask about). A failure the Host reports is thrown with the code and message it gave.
   */
  async delete(input: ProjectDeletionGatewayRequest, signal?: AbortSignal): Promise<ProjectDeletionResult | null> {
    const answer = await postToResidentHost({ origin: this.origin, homeDirectory: this.options.homeDirectory, path: PROJECT_DELETION_GATEWAY_PATH, signal,
      retryHint: "用同一个幂等键再请求一次即可核对，不会重复删除",
      body: { ...input, home_id: actionGatewayHomeId(this.options.homeDirectory), client_id: this.options.clientId,
        ...(this.options.runtimeSessionId === null ? {} : { runtime_session_id: this.options.runtimeSessionId }) } });
    if (!answer) return null;
    const { body } = answer;
    if (!answer.ok) throw actionErrorFromResponse(answer.status, body);
    if (!isProjectDeletionResult(body)) throw new ActionError("actions.transport_invalid", "常驻服务的删除回执无效");
    return body;
  }
}

function isProjectDeletionResult(value: unknown): value is ProjectDeletionResult {
  if (!value || typeof value !== "object") return false;
  const { deletion, replayed } = value as { deletion?: unknown; replayed?: unknown };
  if (typeof replayed !== "boolean" || !deletion || typeof deletion !== "object") return false;
  const record = deletion as { deletion_id?: unknown; project_id?: unknown; cleanup_state?: unknown };
  return typeof record.deletion_id === "string" && typeof record.project_id === "string" && typeof record.cleanup_state === "string";
}

/**
 * Must be mounted after the existing local origin, control-token and one-time-key gate, with the action gateway. It refuses
 * anything but POST, a body over 64 KiB or that is not a JSON object, a field it does not name, a `client_id` that is not a
 * Runtime's and a Home id that is not this Host's Home (S-07). It takes no Host instance id, unlike the action gateway: the
 * catalog keeps the deletion's receipt by actor and `idempotency_key` and replays it (the same key for another project is
 * refused), so a Host that replaced the one the caller knew cannot delete twice.
 */
export async function handleProjectDeletionGatewayHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  home: string, service: ProjectDeletionService): Promise<boolean> {
  if (url.pathname !== PROJECT_DELETION_GATEWAY_PATH) return false;
  if (request.method !== "POST") { sendJson(response, 405, { error: "只支持本机 POST 调用" }); return true; }
  try {
    const body = await readGatewayBody(request);
    const fields = ["home_id", "client_id", "runtime_session_id", "project_id", "delete_confirmed", "idempotency_key"];
    if (Object.keys(body).some(key => !fields.includes(key)) || typeof body.client_id !== "string" || !body.client_id.startsWith("runtime:")
      || typeof body.project_id !== "string" || typeof body.idempotency_key !== "string" || typeof body.delete_confirmed !== "boolean"
      || (body.runtime_session_id !== undefined && (typeof body.runtime_session_id !== "string" || !body.runtime_session_id.trim()))) {
      throw new ActionError("actions.input_invalid", "删除项目的传输参数无效");
    }
    if (body.home_id !== actionGatewayHomeId(home)) throw new ActionError("actions.home_mismatch", "连接的系统服务属于另一个 Home");
    const result = await service.deleteProject(home, { project_id: body.project_id, delete_confirmed: body.delete_confirmed, idempotency_key: body.idempotency_key,
      actor_id: runtimeActorId(body.client_id, typeof body.runtime_session_id === "string" ? body.runtime_session_id : null) });
    sendJson(response, 200, result);
  } catch (error) {
    const failure = actionErrorResponse(error);
    sendJson(response, failure.status, failure.body);
  }
  return true;
}

function readGatewayBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let bytes = 0;
    request.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes <= 64 * 1024) chunks.push(chunk); });
    request.once("error", reject); request.once("aborted", () => reject(new Error("调用已中断")));
    request.once("end", () => {
      try {
        if (bytes > 64 * 1024) throw new ActionError("actions.input_invalid", "删除请求过大");
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("删除请求必须是对象");
        resolve(body as Record<string, unknown>);
      } catch (error) { reject(error instanceof ActionError ? error : new ActionError("actions.input_invalid", "删除请求必须是有效的 JSON 对象")); }
    });
  });
}
