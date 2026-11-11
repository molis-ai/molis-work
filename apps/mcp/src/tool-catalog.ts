import type { McpToolDefinition } from "./protocol.js";
import { managementGoalTools, type McpManagementActionSource } from "./goal-tools.js";
import { MANAGEMENT_GOAL_TOOL_NAMES } from "./tool-dispatch.js";
import { CONTEXT_TOOLS } from "./context-tools.js";

/**
 * Platform MCP tools only: connecting a Runtime to a project, and the trusted management entry's own tools. Every
 * capability is an action tool, discovered from the action catalog and granted per client (Local Host assembles them).
 */
const SERVER_INFO = { name: "molis-work-mcp", version: /* @version identity.mcp.server */ "1.0.0" };


/** Every platform tool, in the order a management client lists them: the Goals management tools, then the connection tools. */
export function platformMcpTools(read: McpManagementActionSource): McpToolDefinition[] {
  return [...managementGoalTools(read), ...CONTEXT_TOOLS];
}

const PLATFORM_TOOL_NAMES: ReadonlySet<string> = new Set<string>([...Object.values(MANAGEMENT_GOAL_TOOL_NAMES), ...CONTEXT_TOOLS.map(tool => tool.name)]);

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

/** Platform schema names, including management-only tools the Runtime must not treat as unknown. */
export function isPlatformMcpTool(name: string): boolean {
  return PLATFORM_TOOL_NAMES.has(name);
}

/** The platform tools a Runtime may call: the connection tools, which run before a project has been resolved. */
export function isRuntimeContextMcpTool(name: string): boolean {
  return RUNTIME_CONTEXT_TOOL_NAMES.has(name);
}

export { RUNTIME_TOOLS as RUNTIME_MCP_TOOLS, SERVER_INFO as MCP_SERVER_INFO };
