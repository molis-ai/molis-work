import type { ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { TRUSTED_REVIEW_COMMAND_SCHEMA, TRUSTED_REVIEW_READ_SCHEMA } from "@molis-ai/molis-work-contracts/services/project-approvals";
import type { McpToolDefinition } from "./protocol.js";
import { V1_COMMON } from "./tool-schemas.js";
import { MANAGEMENT_GOAL_TOOL_NAMES, MANAGEMENT_REVIEW_TOOL_NAMES, type MANAGEMENT_GOAL_ACTIONS } from "./tool-dispatch.js";

/** What a management tool takes from the action's definition: its own description and the schema of its business input. */
export interface McpManagementActionText {
  readonly description: string;
  readonly input_schema: ActionSchema;
}

/**
 * Where the Host reads the Goals initialization action it ships with (the same one registered in the
 * action directory, the provider pinned as in BL-501), matched by id and version. It needs no open Home.
 */
export type McpManagementActionSource = (name: keyof typeof MANAGEMENT_GOAL_ACTIONS) => McpManagementActionText;

/**
 * The initialization tool. Its project and database are transport fields. The description and the
 * business fields are the action's, read by the Host from the Goals definition it ships, never written here a second time.
 */
export function managementGoalTools(read: McpManagementActionSource): McpToolDefinition[] {
  const initialize = read("initialize");
  return [
    {
      name: MANAGEMENT_GOAL_TOOL_NAMES.initialize,
      description: initialize.description,
      inputSchema: {
        type: "object",
        properties: {
          ...V1_COMMON,
          ...initialize.input_schema.properties as Record<string, unknown>,
        },
        required: ["project_id", "idempotency_key"],
      },
    },
  ];
}

export const MANAGEMENT_REVIEW_TOOLS: readonly McpToolDefinition[] = [
  { name: MANAGEMENT_REVIEW_TOOL_NAMES.read, description: "读取原项目、原动作与安装仍可决定的请求。此调用不批准也不执行。",
    inputSchema: { ...TRUSTED_REVIEW_READ_SCHEMA, properties: { ...V1_COMMON, ...TRUSTED_REVIEW_READ_SCHEMA.properties },
      required: ["project_id"] } },
  { name: MANAGEMENT_REVIEW_TOOL_NAMES.decide, description: "本人选择上一条请求返回的已阅版本及选项。相同操作编号返回原决定。",
    inputSchema: { ...TRUSTED_REVIEW_COMMAND_SCHEMA, properties: { ...V1_COMMON, ...TRUSTED_REVIEW_COMMAND_SCHEMA.properties },
      required: ["project_id", ...TRUSTED_REVIEW_COMMAND_SCHEMA.required] } },
];
