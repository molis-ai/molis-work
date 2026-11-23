import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { trustedReviewActions } from "@molis-ai/molis-work-contracts/services/project-approvals";
import type { McpPresentationErrorFactory } from "./goal-presentation.js";

/** The platform's own review tools, over the common review references. */
export const MANAGEMENT_REVIEW_TOOL_NAMES = {
  read: "molis_work_v1_review_request", decide: "molis_work_v1_review_decide",
} as const satisfies Record<keyof typeof trustedReviewActions, string>;
type McpActionReference = { readonly capability_id: string; readonly version: number };

/**
 * A management tool a plugin declares for one of its management actions (`PluginManagementActionDeclaration.mcp_tool`): the Host
 * reads the name from the registration and the description and business input from the action's own definition.
 */
export interface McpDeclaredManagementTool {
  readonly name: string;
  readonly action: McpActionReference;
  readonly description: string;
  readonly input_schema: { readonly properties?: unknown };
}

/** The Host's management port: the entry chooses a declared action and business input, never a caller or permissions. */
export interface McpManagementActions {
  readonly project_id: string;
  invoke<Output = unknown>(reference: McpActionReference, input: Record<string, unknown>, evidence?: unknown): Promise<Output>;
  /** The business fields the action takes, as the definition the Host ships declares its input; a tool accepts these and nothing else. */
  fields(reference: McpActionReference): readonly string[];
}

export interface McpToolDispatchPorts {
  audience: "runtime" | "management";
  createError: McpPresentationErrorFactory;
  /** The plugin-declared management tools the Host lists; a name outside these and the platform's own is unknown. */
  declared: readonly McpDeclaredManagementTool[];
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
  default: {
    const declared = ports.declared.find(tool => tool.name === name);
    if (!declared) throw ports.createError("mcp.tool_unknown", `未知 V1 tool: ${name}`);
    const actions = management();
    const { database_path: _database, project_id, ...input } = arguments_;
    bound(actions, project_id);
    // Only the action's own business fields are read; anything else in the arguments (an identity included) is ignored, never passed on.
    // A scalar given for a field the action declares as text is read as that text, as the tool has always taken it.
    const properties = (declared.input_schema.properties ?? {}) as Record<string, { type?: unknown } | undefined>;
    const read = (field: string, value: unknown) => properties[field]?.type === "string" && (typeof value === "number" || typeof value === "boolean") ? String(value) : value;
    const fields = actions.fields(declared.action);
    result = await actions.invoke(declared.action, Object.fromEntries(fields.filter(field => Object.hasOwn(input, field)).map(field => [field, read(field, input[field])])));
  }
  }
  return JSON.stringify(result, null, 2);
}
