import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionGatewayHomeId } from "./action-gateway.js";
import { runtimeActorId } from "./mcp-event-identity.js";
import { MolisWorkProjectCatalogError } from "./project-catalog-contract.js";
import type { ProjectDeletionService } from "./project-deletion-service.js";
import { postToResidentHost, residentHostOrigin } from "./resident-host-request.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";

/**
 * How a process that only forwards (the stdio MCP) deletes a project: the resident Host has the project's terminals and
 * runtime, so it runs the deletion and answers with the receipt. Same trust as the action gateway: the Home's own control
 * token, a numeric loopback address, no redirect.
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
    if (!answer.ok) throw new ActionError(typeof body.code === "string" ? body.code : "actions.transport_denied", typeof body.error === "string" ? body.error : "常驻服务拒绝了这次删除");
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

/** Must be mounted after the existing local origin, control-token and one-time-key gate, with the action gateway. */
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
    const failure = deletionFailure(error);
    sendJson(response, failure.status, { code: failure.code, error: error instanceof Error ? error.message : "删除项目失败" });
  }
  return true;
}

/**
 * How the Host answers a deletion that did not happen. The failure keeps the code it has (the catalog's and the actions' codes
 * are namespaced); one without a namespaced code, such as a file system error, is the deletion's own failure. Only the cases
 * the caller can act on have their own status: a live terminal conflicts (409), a request that cannot be a deletion is
 * malformed (400), a Host of another Home refuses (403); anything else went wrong inside the Host (500).
 */
function deletionFailure(error: unknown): { code: string; status: number } {
  const own = error instanceof Error && "code" in error && typeof error.code === "string" && /^[a-z_]+\.[a-z_]+/.test(error.code) ? error.code : null;
  const code = own ?? "project_deletion.failed";
  if (code === "catalog.project_terminal_live") return { code, status: 409 };
  if (code === "actions.home_mismatch") return { code, status: 403 };
  if (code === "actions.input_invalid" || error instanceof MolisWorkProjectCatalogError) return { code, status: 400 };
  return { code, status: 500 };
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
