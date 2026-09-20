import { MolisWorkV1Error } from "@molis-ai/molis-work-plugin-goals";
import type { MolisWorkRuntimeConnection, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import { isRuntimeContextMcpTool, type McpToolCallContext } from "@molis-ai/molis-work-app-mcp";

export const GOAL_EVENT_WRITE_TOOLS = new Set([
  "molis_work_v1_goal_tree_propose",
  "molis_work_v1_goal_intent_create",
  "molis_work_v1_event_configure",
  "molis_work_v1_event_report",
  "molis_work_v1_event_note",
  "molis_work_v1_event_progress",
  "molis_work_v1_event_concern",
  "molis_work_v1_event_decision_request",
  "molis_work_v1_event_cite_decision",
  "molis_work_v1_event_agree",
  "molis_work_v1_event_close",
  "molis_work_v1_event_resume",
]);

export const GOAL_EVENT_TOOLS = new Set([
  ...GOAL_EVENT_WRITE_TOOLS,
  "molis_work_v1_goal_list",
  "molis_work_v1_goal_state",
  "molis_work_v1_event_list",
  "molis_work_v1_event_read",
  "molis_work_v1_event_decide",
]);

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

const RUNTIME_CONFIRMATION_TOOLS = new Set([
  "molis_work_v1_project_guidance_add",
  "molis_work_v1_project_guidance_update",
  "molis_work_v1_planning_method_save",
  "molis_work_v1_goal_trash",
  "molis_work_v1_goal_restore",
]);

const RUNTIME_READ_TOOLS = new Set([
  "molis_work_v1_project_guidance_get",
  "molis_work_v1_planning_methods",
  "molis_work_v1_planning_analyze_change",
  "molis_work_v1_planning_graph_check",
  "molis_work_v1_goal_state",
  "molis_work_v1_event_list",
  "molis_work_v1_event_read",
  "molis_work_v1_goal_list",
  "molis_work_v1_goal_tree_read",
  "molis_work_v1_goal_trash_list",
]);

export function assertRuntimeOrdinaryToolInput(
  name: string,
  arguments_: Record<string, unknown>,
  homeScopedNames: ReadonlySet<string> = new Set(),
): void {
  if (isRuntimeContextMcpTool(name) || homeScopedNames.has(name)) return;
  const connection = RUNTIME_CONNECTION_OVERRIDE_FIELDS.filter((field) => Object.hasOwn(arguments_, field));
  const actor = RUNTIME_ACTOR_OVERRIDE_FIELDS.filter((field) => Object.hasOwn(arguments_, field));
  const forged: string[] = RUNTIME_FORGED_AUTHORITY_FIELDS.filter((field) => Object.hasOwn(arguments_, field));
  if (Object.hasOwn(arguments_, "user_confirmed") && !RUNTIME_CONFIRMATION_TOOLS.has(name)) {
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

export function assertRuntimeGoalEventToolInput(
  name: string,
  arguments_: Record<string, unknown>,
): void {
  assertRuntimeOrdinaryToolInput(name, arguments_);
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

export function injectRuntimeIdentity(
  name: string,
  arguments_: Record<string, unknown>,
  host: MolisWorkRuntimeContextHost | null,
  callContext: McpToolCallContext,
  connection: MolisWorkRuntimeConnection,
  homeScopedNames: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
  if (isRuntimeContextMcpTool(name) || homeScopedNames.has(name)) return arguments_;
  const withBoard = { ...arguments_, board_id: connection.boardId };
  if (RUNTIME_READ_TOOLS.has(name)) return withBoard;
  const actor = runtimeEventActor(host, callContext);
  if (name === "molis_work_v1_goal_tree_propose") {
    const sessionId = actor.actor_id.split(":").slice(2).join(":") || actor.actor_id;
    return { ...withBoard, actor_id: actor.actor_id, actor_kind: actor.actor_kind, submitted_session_id: sessionId };
  }
  if (name === "molis_work_v1_goal_intent_create") {
    return { ...withBoard, actor_id: actor.actor_id, actor_kind: actor.actor_kind, source_kind: "runtime" };
  }
  if (GOAL_EVENT_WRITE_TOOLS.has(name)) {
    return { ...withBoard, actor_id: actor.actor_id, actor_kind: actor.actor_kind };
  }
  return { ...withBoard, actor_id: actor.actor_id };
}
