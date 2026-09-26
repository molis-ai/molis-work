import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import type { MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import { isRuntimeContextMcpTool, LEGACY_GOALS_MCP, type McpToolCallContext } from "@molis-ai/molis-work-app-mcp";

export const RUNTIME_CONNECTION_OVERRIDE_FIELDS = [
  "board_id",
  "database_path",
  "web_base_url",
] as const;

export const RUNTIME_ACTOR_OVERRIDE_FIELDS = [
  "actor_id",
  "actor_kind",
  "runtime_actor_id",
] as const;

const RUNTIME_FORGED_AUTHORITY_FIELDS = [
  "authority",
  "user_approval",
  "user_approved",
  "source_kind",
  "payload",
] as const;

export function assertRuntimeOrdinaryToolInput(
  name: string,
  arguments_: Record<string, unknown>,
  homeScopedNames: ReadonlySet<string> = new Set(),
): void {
  if (isRuntimeContextMcpTool(name) || homeScopedNames.has(name)) return;
  const connection = RUNTIME_CONNECTION_OVERRIDE_FIELDS.filter((field) => Object.hasOwn(arguments_, field));
  const actor = RUNTIME_ACTOR_OVERRIDE_FIELDS.filter((field) => Object.hasOwn(arguments_, field));
  const forged: string[] = RUNTIME_FORGED_AUTHORITY_FIELDS.filter((field) => Object.hasOwn(arguments_, field));
  const alias = LEGACY_GOALS_MCP.find(binding => binding.name === name);
  const declaresConfirmation = alias && Object.hasOwn(alias.action.action.input_schema.properties as object, "user_confirmed");
  if (Object.hasOwn(arguments_, "user_confirmed") && !declaresConfirmation) {
    forged.push("user_confirmed");
  }
  if (name === "molis_work_v1_goal_tree_propose") {
    for (const field of ["submitted_session_id", "discovered_in_run_id"]) {
      if (Object.hasOwn(arguments_, field) && !forged.includes(field)) forged.push(field);
    }
  }
  if (connection.length) {
    throw new MolisWorkV1Error(
      "mcp.connection_override_denied",
      `MCP 连接拒绝：Runtime 不能覆盖宿主固定的项目或地址字段：${connection.join("、")}`,
      { fields: connection },
    );
  }
  const impersonation = [...actor, ...forged];
  if (impersonation.length) {
    throw new MolisWorkV1Error(
      "mcp.user_impersonation_denied",
      `MCP 权限拒绝：Runtime 不能通过 ${impersonation.join("、")} 自填用户身份、批准、权威来源或创建渠道`,
      { fields: impersonation },
    );
  }
}

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
