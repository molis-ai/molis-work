import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import type { MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { McpToolCallContext } from "@molis-ai/molis-work-app-mcp";

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
