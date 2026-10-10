import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * The one place `authorship: "session"` is enforced. The trusted MCP adapter marks the call context of an external Runtime that
 * has no stable Session; every dispatch passes through here with its own context, so a call a wrapper action makes on that
 * client's behalf (an offer the Home runs, a workflow step) is refused like the client's own.
 */
export function assertSessionAuthorship(action: ActionDefinition["action"], context: Pick<ActionCallContext, "runtime_session_missing">): void {
  if (action.authorship !== "session" || !context.runtime_session_missing) return;
  throw new ActionError("mcp.runtime_identity_missing",
    "MCP 宿主没有稳定 Session 身份。请重新连接 Molis Work MCP，由宿主提供 runtime_id 以及稳定 Session（会话元数据、nativeRuntimeSessionId 或已声明的 stable_work_context_id）；不要在工具参数里填用户身份。");
}
