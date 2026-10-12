import { createHash } from "node:crypto";
import path from "node:path";
import { ActionError, type ActionClient, type ActionCallContext, type ActionReference, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { postToResidentHost, residentHostOrigin, type ResidentHostAnswer } from "./resident-host-request.js";

export const ACTION_GATEWAY_PATH = "/api/internal/action-service";
export const actionGatewayHomeId = (home: string) => createHash("sha256").update(path.resolve(home)).digest("hex");

/**
 * A transport, not an execution fallback. Invocation failures are never retried here. The request itself is the one POST
 * every process that forwards to the resident Host makes (`postToResidentHost`); this class keeps what is the action
 * gateway's own: the Home, client and project envelope, the Host instance, and how each failure is named.
 */
export class LocalActionGatewayClient implements ActionClient {
  private readonly origin: string;
  private instance?: string;
  constructor(private readonly options: { url: string; homeDirectory: string; clientId: string; projectId: string | null; controlToken?: string; runtimeSessionId?: string }) {
    this.origin = residentHostOrigin(options.url);
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
    const invoking = body.operation === "invoke";
    const unavailable = () => new ActionError("actions.service_unavailable", "系统服务尚未连接，请启动对应 Home 的常驻服务");
    let answer: ResidentHostAnswer | null;
    try {
      answer = await postToResidentHost({ origin: this.origin, homeDirectory: this.options.homeDirectory, controlToken: this.options.controlToken,
        path: ACTION_GATEWAY_PATH, signal: caller.signal, retryHint: "请核对原结果，不会自动重试",
        body: { ...body, home_id: actionGatewayHomeId(this.options.homeDirectory), client_id: this.options.clientId,
          project_id: this.options.projectId, ...(this.options.runtimeSessionId === undefined ? {} : { runtime_session_id: this.options.runtimeSessionId }) } });
    } catch (error) {
      // A discovery changes nothing: a connection that breaks or a reply that never completes is the service not being there, not an outcome to check.
      if (!invoking && error instanceof ActionError && error.code === "actions.delivery_unknown") throw unavailable();
      throw error;
    }
    // Nothing was sent: no control token in this Home, or nothing listens at the address.
    if (!answer) throw unavailable();
    const reply = answer.body;
    if (!answer.ok) throw new ActionError(typeof reply.code === "string" ? reply.code : "actions.transport_denied", typeof reply.error === "string" ? reply.error : "系统服务拒绝调用");
    return reply;
  }
}
