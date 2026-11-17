import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { trustedReviewActions } from "@molis-ai/molis-work-contracts/services/project-approvals";
import type { McpPresentationErrorFactory } from "./goal-presentation.js";

/** Goals owns initialization. Review tools below use the platform's common references. */
export const MANAGEMENT_GOAL_ACTIONS = {
  initialize: { capability_id: "goals.board.initialize", version: /* @version action.goals.board.initialize */ 1 },
} as const;
export const MANAGEMENT_GOAL_TOOL_NAMES = {
  initialize: "molis_work_v1_initialize",
} as const satisfies Record<keyof typeof MANAGEMENT_GOAL_ACTIONS, string>;
export const MANAGEMENT_REVIEW_TOOL_NAMES = {
  read: "molis_work_v1_review_request", decide: "molis_work_v1_review_decide",
} as const satisfies Record<keyof typeof trustedReviewActions, string>;
type McpGoalActionReference = { readonly capability_id: string; readonly version: number };

/** The Host's management port: the entry chooses a Goals action and business input, never a caller or permissions. */
export interface McpManagementActions {
  readonly project_id: string;
  invoke<Output = unknown>(reference: McpGoalActionReference, input: Record<string, unknown>, evidence?: unknown): Promise<Output>;
  /** The business fields the action takes, as the Goals definition the Host ships declares its input; a tool accepts these and nothing else. */
  fields(reference: McpGoalActionReference): readonly string[];
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
    if (projectId !== actions.project_id) throw new ActionError("actions.scope_mismatch", "目标请求不属于当前项目");
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
  case MANAGEMENT_GOAL_TOOL_NAMES.initialize: {
    const actions = management(); bound(actions, String(arguments_.project_id));
    result = await actions.invoke(MANAGEMENT_GOAL_ACTIONS.initialize, { idempotency_key: String(arguments_.idempotency_key) });
    break;
  }
  default:
    throw ports.createError("mcp.tool_unknown", `未知 V1 tool: ${name}`);
  }
  return JSON.stringify(result, null, 2);
}
