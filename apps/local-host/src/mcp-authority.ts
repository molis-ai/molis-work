import { isRuntimeMcpTool, isRuntimeContextMcpTool, MCP_TOOLS, type McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import type { MolisWorkRuntimeConnection, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { RuntimeProjectConnection } from "./runtime-project-connection.js";
import { assertRuntimeOrdinaryToolInput } from "./mcp-event-identity.js";
import type { AssembledMcpCatalog } from "./mcp-catalog.js";

type MolisWorkMcpToolCallContext = McpToolCallContext;
export interface McpAuthorityState {
  audience: "runtime" | "management";
  connectionState: RuntimeProjectConnection;
  runtimeConnection: MolisWorkRuntimeConnection | null;
  runtimeContextHost: MolisWorkRuntimeContextHost | null;
}
const EMPTY_TOOL_CALL_CONTEXT: McpToolCallContext = { runtimeSessionId: null, runtimeSessionIdSource: null };

function homeScoped(name: string, catalog: AssembledMcpCatalog | undefined): boolean {
  return isRuntimeContextMcpTool(name) || (catalog?.home_scoped_names.has(name) ?? false);
}

function runtimeSurface(name: string, catalog: AssembledMcpCatalog | undefined): boolean {
  return isRuntimeMcpTool(name) || (catalog?.tools.some((tool) => tool.name === name) ?? false);
}

function isPlatformMcpTool(name: string): boolean {
  return MCP_TOOLS.some((tool) => tool.name === name);
}

export function assertMcpToolAllowed(
  state: McpAuthorityState,
  name: string,
  arguments_: Record<string, unknown>,
  callContext: MolisWorkMcpToolCallContext,
  catalog?: AssembledMcpCatalog,
): void {
  if (catalog && !catalog.tools.some((tool) => tool.name === name)) {
    const known = catalog.known_names.has(name) || isPlatformMcpTool(name);
    if (!known) {
      throw new MolisWorkV1Error("mcp.tool_unknown", `未知 MCP 方法：${name}`);
    }
    if (state.audience === "runtime" && isPlatformMcpTool(name) && !isRuntimeMcpTool(name)) {
      throw new MolisWorkV1Error(
        "mcp.authority_denied",
        `MCP 权限拒绝：${name} 只允许用户或管理入口调用；Runtime 应使用当前事件工具，或把决定交给用户`,
      );
    }
    throw new MolisWorkV1Error("mcp.tool_disabled", `MCP 方法已关闭或当前连接不可用：${name}`);
  }
  if (state.audience === "management") return;
  if (!runtimeSurface(name, catalog)) {
    throw new MolisWorkV1Error(
      "mcp.authority_denied",
      `MCP 权限拒绝：${name} 只允许用户或管理入口调用；Runtime 应使用当前事件工具，或把决定交给用户`,
    );
  }
  if (homeScoped(name, catalog)) {
    requireMcpRuntimeContextHost(state, callContext);
    return;
  }
  // Registered actions validate their own business schema and receive authority separately.
  // Legacy event payload/actor heuristics must not reject an unrelated plugin's declared fields.
  if (catalog?.entries.find(entry => entry.definition.name === name)?.source !== "action") {
    assertRuntimeOrdinaryToolInput(name, arguments_, catalog?.home_scoped_names ?? new Set());
  }
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
