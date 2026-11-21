import type { McpToolDefinition } from "./protocol.js";
import { declaredManagementTools, MANAGEMENT_REVIEW_TOOLS } from "./management-tools.js";
import type { McpDeclaredManagementTool } from "./tool-dispatch.js";
import { CONTEXT_TOOLS } from "./context-tools.js";

/**
 * Platform MCP tools only: connecting a Runtime to a project, and the trusted management entry's own tools. Every
 * capability is an action tool, discovered from the action catalog and granted per client (Local Host assembles them).
 */
const SERVER_INFO = { name: "molis-work-mcp", version: /* @version identity.mcp.server */ "1.0.0" };


/** Every tool a management client lists: the plugin-declared management tools, the review tools, then the connection tools. */
export function platformMcpTools(declared: readonly McpDeclaredManagementTool[]): McpToolDefinition[] {
  return [...declaredManagementTools(declared), ...MANAGEMENT_REVIEW_TOOLS, ...CONTEXT_TOOLS];
}

const PLATFORM_TOOL_NAMES: ReadonlySet<string> = new Set<string>([...MANAGEMENT_REVIEW_TOOLS.map(tool => tool.name), ...CONTEXT_TOOLS.map(tool => tool.name)]);

const RUNTIME_CONTEXT_TOOL_NAMES = new Set([
  "molis_work_v1_context_resolve",
  "molis_work_v1_context_list_projects",
  "molis_work_v1_context_reject_suggestion",
  "molis_work_v1_context_bind",
  "molis_work_v1_context_unbind",
  "molis_work_v1_context_create_and_bind",
  "molis_work_v1_project_delete",
]);

const RUNTIME_TOOLS = CONTEXT_TOOLS.filter((tool) => RUNTIME_CONTEXT_TOOL_NAMES.has(tool.name));

/** The platform's own tool names (review and connection); the Host adds the plugin-declared management tools it lists. */
export function isPlatformMcpTool(name: string): boolean {
  return PLATFORM_TOOL_NAMES.has(name);
}

/** The platform tools a Runtime may call: the connection tools, which run before a project has been resolved. */
export function isRuntimeContextMcpTool(name: string): boolean {
  return RUNTIME_CONTEXT_TOOL_NAMES.has(name);
}

export { RUNTIME_TOOLS as RUNTIME_MCP_TOOLS, SERVER_INFO as MCP_SERVER_INFO };
