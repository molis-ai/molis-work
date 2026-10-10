import type { MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { McpToolCallContext } from "@molis-ai/molis-work-app-mcp";

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
