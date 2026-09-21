import type { McpToolDefinition } from "./protocol.js";
import { V1_TOOLS } from "./goal-tools.js";
import { EVENT_TOOLS } from "./goal-event-tools.js";
import { CONTEXT_TOOLS } from "./context-tools.js";

/** Platform MCP tools only. Plugin tools are Manifest `mcp_exports`, assembled by Local Host. */
const SERVER_INFO = { name: "molis-work-mcp", version: "1.0.0" };

const TOOLS: McpToolDefinition[] = [...V1_TOOLS, ...EVENT_TOOLS, ...CONTEXT_TOOLS];

const RUNTIME_V1_TOOL_NAMES = new Set([
  "molis_work_v1_project_guidance_get",
  "molis_work_v1_project_guidance_add",
  "molis_work_v1_project_guidance_update",
  "molis_work_v1_planning_methods",
  "molis_work_v1_planning_method_save",
  "molis_work_v1_planning_analyze_change",
  "molis_work_v1_planning_graph_check",
  "molis_work_v1_goal_intent_create",
  "molis_work_v1_goal_state",
  "molis_work_v1_event_configure",
  "molis_work_v1_event_note",
  "molis_work_v1_event_report",
  "molis_work_v1_event_list",
  "molis_work_v1_event_read",
  "molis_work_v1_event_progress",
  "molis_work_v1_event_concern",
  "molis_work_v1_event_decision_request",
  "molis_work_v1_event_cite_decision",
  "molis_work_v1_event_agree",
  "molis_work_v1_event_close",
  "molis_work_v1_event_resume",
  "molis_work_v1_goal_list",
  "molis_work_v1_goal_tree_propose",
  "molis_work_v1_goal_tree_read",
  "molis_work_v1_goal_tree_check",
  "molis_work_v1_goal_trash",
  "molis_work_v1_goal_trash_list",
  "molis_work_v1_goal_restore",
]);

const RUNTIME_CONTEXT_TOOL_NAMES = new Set([
  "molis_work_v1_context_resolve",
  "molis_work_v1_context_list_projects",
  "molis_work_v1_context_reject_suggestion",
  "molis_work_v1_context_bind",
  "molis_work_v1_context_unbind",
  "molis_work_v1_context_create_and_bind",
  "molis_work_v1_project_delete",
]);

const RUNTIME_TOOL_NAMES = new Set([...RUNTIME_V1_TOOL_NAMES, ...RUNTIME_CONTEXT_TOOL_NAMES]);

const RUNTIME_STRIPPED_FIELDS = [
  "board_id",
  "database_path",
  "web_base_url",
  "actor_id",
  "actor_kind",
  "runtime_actor_id",
  "submitted_session_id",
] as const;

function runtimeToolDefinition(tool: McpToolDefinition): McpToolDefinition {
  const clone = structuredClone(tool);
  if (!isRuntimeContextMcpTool(tool.name)) {
    const inputProperties = clone.inputSchema.properties as Record<string, unknown>;
    for (const field of RUNTIME_STRIPPED_FIELDS) delete inputProperties[field];
    const required = clone.inputSchema.required as string[] | undefined;
    if (required) {
      clone.inputSchema.required = required.filter((field) =>
        !(RUNTIME_STRIPPED_FIELDS as readonly string[]).includes(field),
      );
    }
  }
  return clone;
}

const RUNTIME_TOOLS = TOOLS
  .filter((tool) => RUNTIME_TOOL_NAMES.has(tool.name))
  .map(runtimeToolDefinition);

/** Current MCP tool names are already canonical. */
export function canonicalMcpToolName(name: string): string {
  return name;
}

/** Classify the same tool audience used by discovery before host execution. */
export function isRuntimeMcpTool(name: string): boolean {
  return RUNTIME_TOOL_NAMES.has(name);
}

/** Platform schema names, including management-only tools the Runtime must not treat as unknown. */
export function isPlatformMcpTool(name: string): boolean {
  return TOOLS.some((tool) => tool.name === name);
}

/** Connection tools run before a project has been resolved. */
export function isRuntimeContextMcpTool(name: string): boolean {
  return RUNTIME_CONTEXT_TOOL_NAMES.has(name);
}

export { TOOLS as MCP_TOOLS, RUNTIME_TOOLS as RUNTIME_MCP_TOOLS, SERVER_INFO as MCP_SERVER_INFO };
