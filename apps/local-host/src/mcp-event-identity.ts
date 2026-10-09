import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import type { MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { McpToolCallContext } from "@molis-ai/molis-work-app-mcp";

/** The MCP client and, when the Runtime host declares one, the Session of the call: the actor a receipt names. */
export const runtimeActorId = (clientId: string, runtimeSessionId: string | null): string => runtimeSessionId ? `${clientId}:${runtimeSessionId}` : clientId;

export function runtimeEventActor(
  host: MolisWorkRuntimeContextHost | null,
  callContext: McpToolCallContext,
): { actor_id: string; actor_kind: "runtime" } {
  const runtimeId = host?.runtimeContext.runtime_id?.trim();
  if (!host || !runtimeId) {
    throw new MolisWorkV1Error(
      "mcp.runtime_identity_missing",
      "MCP 宿主没有可信 Runtime 身份。请重新连接 Molis Work MCP，由宿主提供 runtime_id 与稳定 Session；不要在工具参数里填用户身份。",
    );
  }
  const sessionId = stableRuntimeSessionId(host, callContext);
  if (!sessionId) {
    throw new MolisWorkV1Error(
      "mcp.runtime_identity_missing",
      "MCP 宿主没有稳定 Session 身份。请重新连接 Molis Work MCP，由宿主提供 runtime_id 以及稳定 Session（会话元数据、nativeRuntimeSessionId 或已声明的 stable_work_context_id）；不要在工具参数里填用户身份。",
    );
  }
  return {
    actor_id: `runtime:${runtimeId}:${sessionId}`,
    actor_kind: "runtime",
  };
}

/** The Session a Runtime call is made in, as an audit actor; null when the host declares no stable Session. */
export function runtimeSessionActor(host: MolisWorkRuntimeContextHost | null, callContext: McpToolCallContext): string | null {
  const runtimeId = host?.runtimeContext.runtime_id?.trim();
  const sessionId = host && runtimeId ? stableRuntimeSessionId(host, callContext) : null;
  return runtimeId && sessionId ? `runtime:${runtimeId}:${sessionId}` : null;
}

/**
 * Who a connection tool (bind, unbind, reject a suggestion, create and bind, delete a project) acts as: the MCP client
 * (`runtime:<runtime_id>`) and, when the host declares a stable Session for the call, that Session after it. These tools
 * also work from a workspace alone, before any Session is known, so the Session is not required; the arguments never name
 * an actor. `client_id` and `runtime_session_id` are what a resident Host is sent so it derives the same actor.
 */
export function runtimeConnectionIdentity(
  host: MolisWorkRuntimeContextHost | null,
  callContext: McpToolCallContext,
): { client_id: string; runtime_session_id: string | null; actor_id: string } {
  const runtimeId = host?.runtimeContext.runtime_id?.trim();
  if (!host || !runtimeId) {
    throw new MolisWorkV1Error(
      "mcp.runtime_identity_missing",
      "MCP 宿主没有可信 Runtime 身份。请重新连接 Molis Work MCP，由宿主提供 runtime_id；不要在工具参数里填身份。",
    );
  }
  const clientId = `runtime:${runtimeId}`;
  const sessionId = stableRuntimeSessionId(host, callContext);
  return { client_id: clientId, runtime_session_id: sessionId, actor_id: runtimeActorId(clientId, sessionId) };
}

function stableRuntimeSessionId(
  host: MolisWorkRuntimeContextHost,
  callContext: McpToolCallContext,
): string | null {
  const fromCall = callContext.runtimeSessionId?.trim();
  if (fromCall) return fromCall;
  const fromNative = host.nativeRuntimeSessionId?.trim();
  if (fromNative) return fromNative;
  if (host.runtimeContext.host_declares_stable) {
    const stable = host.runtimeContext.stable_work_context_id?.trim();
    if (stable) return stable;
  }
  return null;
}
