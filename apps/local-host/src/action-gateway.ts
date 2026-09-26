import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ActionError, type ActionClient, type ActionCallContext, type ActionReference, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { WEB_CONTROL_TOKEN_RELATIVE_PATH } from "./web-control-token.js";

export const ACTION_GATEWAY_PATH = "/api/internal/action-service";
export const actionGatewayHomeId = (home: string) => createHash("sha256").update(path.resolve(home)).digest("hex");

/** A transport, not an execution fallback. Invocation failures are never retried here. */
export class LocalActionGatewayClient implements ActionClient {
  private readonly origin: string;
  private instance?: string;
  constructor(private readonly options: { url: string; homeDirectory: string; clientId: string; projectId: string | null; controlToken?: string; runtimeSessionId?: string }) {
    const url = new URL(options.url);
    if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new ActionError("actions.transport_invalid", "系统动作连接必须是本机数字回环 HTTP 地址");
    }
    this.origin = url.origin;
  }
  async discover(caller: ActionCallContext): Promise<ActionView[]> {
    this.checkCaller(caller);
    const reply = await this.request({ operation: "discover" }, caller);
    if (typeof reply.instance_id !== "string" || !Array.isArray(reply.actions)) throw new ActionError("actions.transport_invalid", "系统动作目录响应无效");
    this.instance = reply.instance_id;
    return reply.actions as ActionView[];
  }
  async invoke<Output = unknown>(caller: ActionCallContext, reference: ActionReference, input: unknown): Promise<Output> {
    this.checkCaller(caller);
    if (!this.instance) throw new ActionError("actions.discovery_required", "请先发现当前系统服务的能力");
    const instance = this.instance;
    await caller.validate_authority?.(reference);
    caller.signal?.throwIfAborted();
    const reply = await this.request({ operation: "invoke", instance_id: instance,
      capability: { capability_id: reference.capability_id, version: reference.version, ...(reference.provider_id ? { provider_id: reference.provider_id } : {}) }, input }, caller);
    if (reply.instance_id !== instance) throw new ActionError("actions.host_replaced", "系统服务已更换，请重新发现；不会重发原调用");
    return reply.result as Output;
  }
  private checkCaller(caller: ActionCallContext) {
    if (caller.actor_id !== this.options.clientId || caller.project_id !== this.options.projectId || caller.audience !== "mcp") {
      throw new ActionError("actions.scope_mismatch", "动作连接不属于当前客户端或项目");
    }
    const auditActor = this.options.runtimeSessionId === undefined ? undefined : `${this.options.clientId}:${this.options.runtimeSessionId}`;
    if (caller.audit_actor_id !== auditActor || caller.runtime_session_id !== this.options.runtimeSessionId) throw new ActionError("actions.scope_mismatch", "审计作者不属于当前 Runtime 会话");
  }
  private async request(body: Record<string, unknown>, caller: ActionCallContext): Promise<Record<string, unknown>> {
    let token: string;
    try { token = this.options.controlToken ?? (await readFile(path.join(this.options.homeDirectory, WEB_CONTROL_TOKEN_RELATIVE_PATH), "utf8")).trim(); }
    catch { throw new ActionError("actions.service_unavailable", "尚未取得此 Home 的系统服务连接，请启动对应常驻服务"); }
    const serialized = JSON.stringify({ ...body, home_id: actionGatewayHomeId(this.options.homeDirectory), client_id: this.options.clientId,
      project_id: this.options.projectId, ...(this.options.runtimeSessionId === undefined ? {} : { runtime_session_id: this.options.runtimeSessionId }) });
    let response: Response;
    try {
      response = await fetch(this.origin + ACTION_GATEWAY_PATH, { method: "POST", redirect: "error", signal: caller.signal,
        headers: { origin: this.origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() }, body: serialized });
    } catch (error) {
      if (caller.signal?.aborted) throw caller.signal.reason;
      throw new ActionError(body.operation === "invoke" ? "actions.delivery_unknown" : "actions.service_unavailable",
        body.operation === "invoke" ? "系统服务连接中断，调用结果尚未确定；请核对原结果，不会自动重试" : "系统服务尚未连接，请启动对应 Home 的常驻服务");
    }
    let reply: Record<string, unknown>;
    try { reply = await response.json() as Record<string, unknown>; }
    catch { throw new ActionError("actions.delivery_unknown", "未收到完整的系统服务响应；不会自动重发调用"); }
    if (!reply || typeof reply !== "object" || Array.isArray(reply)) throw new ActionError("actions.transport_invalid", "系统服务响应无效");
    if (!response.ok) throw new ActionError(typeof reply.code === "string" ? reply.code : "actions.transport_denied", typeof reply.error === "string" ? reply.error : "系统服务拒绝调用");
    return reply;
  }
}
