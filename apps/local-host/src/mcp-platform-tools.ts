import { MANAGEMENT_GOAL_ACTIONS, platformMcpTools, type McpToolDefinition } from "@molis-ai/molis-work-app-mcp";
import { requireManagementDefinition } from "./goal-callers.js";

/**
 * One of the three Goals actions the management tools call, as the Goals that ships with the Host defines it (its description and input
 * schema): the same definition registered in the action directory, read without one, so the tools are there before a Home is open.
 */
function managementAction(name: keyof typeof MANAGEMENT_GOAL_ACTIONS) {
  return requireManagementDefinition(MANAGEMENT_GOAL_ACTIONS[name]).action;
}

/** Every platform tool a management client lists: the MCP's own wire around each Goals action's description and business fields. */
export const MCP_TOOLS: readonly McpToolDefinition[] = platformMcpTools(managementAction);
