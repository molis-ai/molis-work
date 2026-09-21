export { createMcpContextPresenter } from "./context-presentation.js";
export type { McpContextPresentationPorts } from "./context-presentation.js";
export { createMcpGoalTrashHandlers } from "./goal-trash-commands.js";
export { mcpWebUrl, mcpGoalContractResponse } from "./goal-presentation.js";
export { createMcpGoalTreeHandlers, runtimeGoalTreeDecisionInput } from "./goal-tree-commands.js";
import type { GoalsApplicationApi } from "@molis-ai/molis-work-contracts/modules/goals";

export { handleMcpMessage } from "./protocol.js";
export { mcpRuntimeSessionActivity } from "./session-activity.js";
export { createMcpRuntimeContextHandlers } from "./runtime-context-tools.js";
export type { McpRuntimeContextPorts } from "./runtime-context-tools.js";
export { planningMethodResponse } from "./query-presentation.js";
export type { McpPresentationErrorFactory } from "./query-presentation.js";
export { createMcpGoalToolHandlers } from "./goal-commands.js";
export { createMcpGoalEventHandlers } from "./goal-event-commands.js";
export { EVENT_TOOLS } from "./goal-event-tools.js";
export { mcpBoardPayload } from "./payload.js";
export { buildMcpResumeView } from "./resume-view.js";
export type { McpResumeFacts } from "./resume-view.js";
export {
  MCP_TOOLS,
  RUNTIME_MCP_TOOLS,
  MCP_SERVER_INFO,
  isRuntimeMcpTool,
  isPlatformMcpTool,
  isRuntimeContextMcpTool,
  canonicalMcpToolName,
} from "./tool-catalog.js";
export type { McpProtocolPorts, McpToolCallContext, McpToolDefinition } from "./protocol.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-app-mcp",
  packagePath: "apps/mcp",
  kind: "app",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/app-host",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-dv1", "goal-reorg-dv2", "goal-reorg-gw4", "goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["mcp.goals-command-adapter.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export type McpGoalsAdapter = GoalsApplicationApi;

/** Bind MCP tools to the public Goals Contract without copying Module rules. */
export function createMcpGoalsAdapter(
  goals: GoalsApplicationApi,
): McpGoalsAdapter {
  return {
    impacts: goals.impacts,
    commands: goals.commands,
    lifecycle: goals.lifecycle,
    planning: goals.planning,
  };
}

export { validateMolisWorkMcpLauncher } from "./launcher-validation.js";
export type { McpLauncherValidationContext } from "./launcher-validation.js";
export { dispatchMcpProjectTool } from "./tool-dispatch.js";
export type { McpToolDispatchPorts } from "./tool-dispatch.js";
