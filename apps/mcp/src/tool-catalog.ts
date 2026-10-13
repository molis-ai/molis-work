import type { McpToolDefinition } from "./protocol.js";
import { V1_TOOLS } from "./goal-tools.js";
import { EVENT_TOOLS } from "./goal-event-tools.js";
import { CONTEXT_TOOLS } from "./context-tools.js";

/**
 * Platform MCP tools only: connecting a Runtime to a project, and the trusted management entry's own tools. Every
 * capability is an action tool, discovered from the action catalog and granted per client (Local Host assembles them).
 */
const SERVER_INFO = { name: "molis-work-mcp", version: "1.0.0" };

const TOOLS: McpToolDefinition[] = [...V1_TOOLS, ...EVENT_TOOLS, ...CONTEXT_TOOLS];

const RUNTIME_CONTEXT_TOOL_NAMES = new Set([
  "molis_work_v1_context_resolve",
  "molis_work_v1_context_list_projects",
  "molis_work_v1_context_reject_suggestion",
  "molis_work_v1_context_bind",
  "molis_work_v1_context_unbind",
  "molis_work_v1_context_create_and_bind",
  "molis_work_v1_project_delete",
]);

const RUNTIME_TOOLS = TOOLS.filter((tool) => RUNTIME_CONTEXT_TOOL_NAMES.has(tool.name));

/** Platform schema names, including management-only tools the Runtime must not treat as unknown. */
export function isPlatformMcpTool(name: string): boolean {
  return TOOLS.some((tool) => tool.name === name);
}

/** The platform tools a Runtime may call: the connection tools, which run before a project has been resolved. */
export function isRuntimeContextMcpTool(name: string): boolean {
  return RUNTIME_CONTEXT_TOOL_NAMES.has(name);
}

export { TOOLS as MCP_TOOLS, RUNTIME_TOOLS as RUNTIME_MCP_TOOLS, SERVER_INFO as MCP_SERVER_INFO };
