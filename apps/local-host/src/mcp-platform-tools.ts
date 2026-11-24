import { isPlatformMcpTool as isOwnPlatformTool, platformMcpTools, type McpToolDefinition } from "@molis-ai/molis-work-app-mcp";

/** Every platform tool a management client lists: the review tools and the connection tools. No plugin declares management tools (44B). */
export const MCP_TOOLS: readonly McpToolDefinition[] = platformMcpTools();

/** A tool the platform lists itself, which a Runtime must not take for an unknown action tool. */
export function isPlatformMcpTool(name: string): boolean {
  return isOwnPlatformTool(name);
}
