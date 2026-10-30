import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { McpPresentationErrorFactory } from "./goal-presentation.js";

/** The three Goals actions the management tools call, by the id and version Goals registers them under. */
export const MANAGEMENT_GOAL_ACTIONS = {
  initialize: { capability_id: "goals.board.initialize", version: 2 },
  decide: { capability_id: "goals.decisions.record", version: 1 },
  treeDecide: { capability_id: "goals.tree.decide", version: 2 },
} as const;
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

/** Adapt the three management tool wires over the port the Host built; Runtime callers are given no management port. */
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
  case "molis_work_v1_initialize": {
    const actions = management(); bound(actions, String(arguments_.project_id));
    result = await actions.invoke(MANAGEMENT_GOAL_ACTIONS.initialize, { idempotency_key: String(arguments_.idempotency_key) });
    break;
  }
  case "molis_work_v1_event_decide": {
    const actions = management();
    // Event decisions accept the declared business fields plus the transport's project and database, with no authority or identity.
    const eventFields = new Set(["database_path", "project_id", ...actions.fields(MANAGEMENT_GOAL_ACTIONS.decide)]);
    const unexpected = Object.keys(arguments_).filter(key => !eventFields.has(key));
    if (unexpected.length) throw ports.createError("mcp.unexpected_field", `不能使用未许可字段：${unexpected.join("、")}`, { fields: unexpected });
    bound(actions, String(arguments_.project_id));
    result = await actions.invoke(MANAGEMENT_GOAL_ACTIONS.decide, {
      goal_id: String(arguments_.goal_id), idempotency_key: String(arguments_.idempotency_key ?? ""),
      request_id: arguments_.request_id == null ? undefined : String(arguments_.request_id),
      selected_option_id: arguments_.selected_option_id == null ? undefined : String(arguments_.selected_option_id),
      conclusion: String(arguments_.conclusion ?? ""),
      accepts_requirements: arguments_.accepts_requirements === true ? true : arguments_.accepts_requirements === false ? false : undefined,
      effects: arguments_.effects, authorized_change: arguments_.authorized_change, scope: arguments_.scope,
    });
    break;
  }
  case "molis_work_v1_goal_tree_decide": {
    if (ports.audience === "runtime") throw ports.createError("mcp.runtime_decide_unsupported",
      "Runtime 不能写入 Goal Tree 决定。请让用户在 Web 或管理入口批准已保存的提案。");
    const actions = management();
    const { database_path: _database, web_base_url: _url, project_id, authority, ...decision } = arguments_;
    bound(actions, project_id);
    result = await actions.invoke(MANAGEMENT_GOAL_ACTIONS.treeDecide, decision, authority);
    break;
  }
  default:
    throw ports.createError("mcp.tool_unknown", `未知 V1 tool: ${name}`);
  }
  return JSON.stringify(result, null, 2);
}
