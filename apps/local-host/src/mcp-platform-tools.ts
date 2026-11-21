import { isPlatformMcpTool as isOwnPlatformTool, MOLIS_WORK_ACTION_TOOL_PREFIX, platformMcpTools, type McpDeclaredManagementTool, type McpToolDefinition } from "@molis-ai/molis-work-app-mcp";
import { requireManagementDefinition } from "./management-actions.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

/**
 * The management tools plugins declare on their management actions (`mcp_tool`), each with the description and input schema of the
 * definition the Host ships: the same one registered in the action directory, read without it, so the tools are there before a Home is
 * open. A name must be `molis_work_v1_<name>`, outside the action tools' prefix and the platform's own tools, and unique.
 */
function declaredTools(): readonly (McpDeclaredManagementTool & { opens_new_database: boolean })[] {
  const tools: (McpDeclaredManagementTool & { opens_new_database: boolean })[] = [];
  for (const registration of PLATFORM_PLUGIN_REGISTRATIONS) {
    for (const declared of registration.management_actions ?? []) {
      if (!declared.mcp_tool) continue;
      const { name } = declared.mcp_tool;
      if (!/^molis_work_v1_[a-z][a-z0-9_]*$/u.test(name) || name.startsWith(MOLIS_WORK_ACTION_TOOL_PREFIX) || isOwnPlatformTool(name) || tools.some(tool => tool.name === name))
        throw new Error(`${registration.manifest.plugin_id}: management tool name ${name} is invalid or already taken`);
      const action = { capability_id: declared.capability_id, version: declared.version };
      const definition = requireManagementDefinition(action).action;
      tools.push({ name, action, description: definition.description, input_schema: definition.input_schema, opens_new_database: declared.mcp_tool.opens_new_database === true });
    }
  }
  return tools;
}

export const MANAGEMENT_MCP_TOOLS = declaredTools();
const DECLARED_NAMES: ReadonlySet<string> = new Set(MANAGEMENT_MCP_TOOLS.map(tool => tool.name));

/** Every platform tool a management client lists: the plugin-declared management tools, the review tools and the connection tools. */
export const MCP_TOOLS: readonly McpToolDefinition[] = platformMcpTools(MANAGEMENT_MCP_TOOLS);

/** A tool the platform lists itself or for a plugin's management action, which a Runtime must not take for an unknown action tool. */
export function isPlatformMcpTool(name: string): boolean {
  return isOwnPlatformTool(name) || DECLARED_NAMES.has(name);
}

/** Whether a standalone management call of this tool may create the project database it names (the plugin declared so). */
export function managementToolOpensNewDatabase(name: string): boolean {
  return MANAGEMENT_MCP_TOOLS.some(tool => tool.name === name && tool.opens_new_database);
}
