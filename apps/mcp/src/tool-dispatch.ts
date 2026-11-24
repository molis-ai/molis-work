import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { trustedReviewActions } from "@molis-ai/molis-work-contracts/services/project-approvals";
import type { McpPresentationErrorFactory } from "./goal-presentation.js";

/** The platform's own review tools, over the common review references. */
export const MANAGEMENT_REVIEW_TOOL_NAMES = {
  read: "molis_work_v1_review_request", decide: "molis_work_v1_review_decide",
} as const satisfies Record<keyof typeof trustedReviewActions, string>;
type McpActionReference = { readonly capability_id: string; readonly version: number };


/**
 * The Host's management port: the platform's two protected review operations on the bound project, as the person on this machine. No
 * plugin declares management tools (44B): a client that wants a plugin's actions calls the action tools its grant gives, like any other.
 */
export interface McpManagementActions {
  readonly project_id: string;
  invoke<Output = unknown>(reference: McpActionReference, input: Record<string, unknown>, evidence?: unknown): Promise<Output>;
}

export interface McpToolDispatchPorts {
  audience: "runtime" | "management";
  createError: McpPresentationErrorFactory;
}

/** Adapt the protected management tool wires over the port the Host built. */
export async function dispatchMcpProjectTool(
  actions: McpManagementActions | null, name: string, arguments_: Record<string, unknown>, ports: McpToolDispatchPorts,
): Promise<string> {
  const management = () => {
    if (ports.audience !== "management" || !actions) throw ports.createError("mcp.authority_denied",
      "用户决定只能由受保护的管理入口或 Web 记录。Runtime 可以请求或引用已保存决定，不能自行批准。");
    return actions;
  };
  const bound = (actions: McpManagementActions, projectId: unknown) => {
    if (projectId !== actions.project_id) throw new ActionError("actions.scope_mismatch", "请求不属于当前项目");
  };
  let result: unknown;
  switch (name) {
  case MANAGEMENT_REVIEW_TOOL_NAMES.read:
  case MANAGEMENT_REVIEW_TOOL_NAMES.decide: {
    const actions = management();
    const { database_path: _database, project_id, ...input } = arguments_;
    bound(actions, project_id);
    result = name === MANAGEMENT_REVIEW_TOOL_NAMES.read
      ? await actions.invoke(trustedReviewActions.read, input)
      : await actions.invoke(trustedReviewActions.decide, input);
    break;
  }
  default:
    throw ports.createError("mcp.tool_unknown", `未知 V1 tool: ${name}`);
  }
  return JSON.stringify(result, null, 2);
}
