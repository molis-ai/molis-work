import { TRUSTED_REVIEW_COMMAND_SCHEMA, TRUSTED_REVIEW_READ_SCHEMA } from "@molis-ai/molis-work-contracts/services/project-approvals";
import type { McpToolDefinition } from "./protocol.js";
import { V1_COMMON } from "./tool-schemas.js";
import { MANAGEMENT_REVIEW_TOOL_NAMES, type McpDeclaredManagementTool } from "./tool-dispatch.js";

/**
 * The plugin-declared management tools. Project and database are transport fields; the description and the business fields are the
 * action's, read by the Host from the definition it ships, never written here a second time.
 */
export function declaredManagementTools(declared: readonly McpDeclaredManagementTool[]): McpToolDefinition[] {
  return declared.map(tool => {
    const properties = (tool.input_schema.properties ?? {}) as Record<string, unknown>;
    const required = (tool.input_schema as { required?: readonly string[] }).required ?? [];
    return { name: tool.name, description: tool.description,
      inputSchema: { type: "object", properties: { ...V1_COMMON, ...properties }, required: ["project_id", ...required] } };
  });
}

export const MANAGEMENT_REVIEW_TOOLS: readonly McpToolDefinition[] = [
  { name: MANAGEMENT_REVIEW_TOOL_NAMES.read, description: "读取原项目、原动作与安装仍可决定的请求。此调用不批准也不执行。",
    inputSchema: { ...TRUSTED_REVIEW_READ_SCHEMA, properties: { ...V1_COMMON, ...TRUSTED_REVIEW_READ_SCHEMA.properties },
      required: ["project_id"] } },
  { name: MANAGEMENT_REVIEW_TOOL_NAMES.decide, description: "本人选择上一条请求返回的已阅版本及选项。相同操作编号返回原决定。",
    inputSchema: { ...TRUSTED_REVIEW_COMMAND_SCHEMA, properties: { ...V1_COMMON, ...TRUSTED_REVIEW_COMMAND_SCHEMA.properties },
      required: ["project_id", ...TRUSTED_REVIEW_COMMAND_SCHEMA.required] } },
];
