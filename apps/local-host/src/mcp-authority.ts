import { isRuntimeMcpTool, isRuntimeContextMcpTool, type McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import { MolisWorkV1Error } from "@molis-ai/molis-work-plugin-goals";
import type { MolisWorkRuntimeConnection, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { RuntimeProjectConnection } from "./runtime-project-connection.js";
import { assertRuntimeOrdinaryToolInput } from "./mcp-event-identity.js";

type MolisWorkMcpToolCallContext = McpToolCallContext;
export interface McpAuthorityState {
  audience: "runtime" | "management";
  connectionState: RuntimeProjectConnection;
  runtimeConnection: MolisWorkRuntimeConnection | null;
  runtimeContextHost: MolisWorkRuntimeContextHost | null;
}
const EMPTY_TOOL_CALL_CONTEXT: McpToolCallContext = { runtimeSessionId: null, runtimeSessionIdSource: null };

export function assertMcpToolAllowed(
  state: McpAuthorityState,
  name: string,
  arguments_: Record<string, unknown>,
  callContext: MolisWorkMcpToolCallContext,
): void {
  if (state.audience === "management") return;
  if (!isRuntimeMcpTool(name)) {
    throw new MolisWorkV1Error(
      "mcp.authority_denied",
      `MCP 权限拒绝：${name} 只允许用户或管理入口调用；Runtime 应使用当前事件工具，或把决定交给用户`,
    );
  }
  if (isRuntimeContextMcpTool(name)) {
    requireMcpRuntimeContextHost(state, callContext);
    return;
  }
  assertRuntimeOrdinaryToolInput(name, arguments_);
  if (!state.connectionState.explicit) {
    const host = requireMcpRuntimeContextHost(state, callContext);
    if (state.connectionState.observe(host.runtimeContext) === "refresh_required") {
      throw new MolisWorkV1Error(
        "mcp.context_refresh_required",
        "MCP 当前调用的 Session 身份与已解析的项目连接不连续。请只读调用 molis_work_v1_context_resolve；若返回 bound，请使用原 idempotency_key 原样重试失败调用。不要调用 context_bind，也不要再次询问用户；若未返回 bound，则按 context_resolve 的 next_action 处理。",
        {
          next_action: "context_resolve_then_retry",
          requires_bind: false,
          requires_user_confirmation: false,
          retry_same_idempotency_key: true,
          retry_when_context_status: "bound",
        },
      );
    }
  }
  if (!state.runtimeConnection) {
    throw new MolisWorkV1Error(
      "mcp.connection_incomplete",
      "MCP 尚未连接项目：请先由统一 Molis Work Skill 调用 molis_work_v1_context_resolve，或由宿主提供固定连接",
    );
  }
}

export function requireMcpRuntimeContextHost(
  state: Pick<McpAuthorityState, "runtimeContextHost">,
  callContext: MolisWorkMcpToolCallContext = EMPTY_TOOL_CALL_CONTEXT,
): MolisWorkRuntimeContextHost {
  if (!state.runtimeContextHost) {
    throw new MolisWorkV1Error(
      "mcp.context_host_missing",
      "MCP 宿主没有提供 Runtime 标识；无法解析 Session 或项目目录关联",
    );
  }
  if (!callContext.runtimeSessionId) return state.runtimeContextHost;
  return {
    ...state.runtimeContextHost,
    nativeRuntimeSessionId: callContext.runtimeSessionId,
    runtimeContext: {
      ...state.runtimeContextHost.runtimeContext,
      stable_work_context_id: callContext.runtimeSessionId,
      host_declares_stable: true,
    },
  };
}
