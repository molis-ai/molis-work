export { createMcpContextPresenter } from "./context-presentation.js";
export type { McpContextPresentationPorts } from "./context-presentation.js";
export { mcpWebUrl, mcpGoalContractResponse } from "./goal-presentation.js";
export { LEGACY_GOALS_MCP, callLegacyGoalsMcp } from "./goal-action-aliases.js";

export { handleMcpMessage } from "./protocol.js";
export { mcpRuntimeSessionActivity } from "./session-activity.js";
export { createMcpRuntimeContextHandlers } from "./runtime-context-tools.js";
export type { McpRuntimeContextPorts } from "./runtime-context-tools.js";
export { planningMethodResponse } from "./query-presentation.js";
export type { McpPresentationErrorFactory } from "./query-presentation.js";
export { createMcpGoalEventHandlers } from "./goal-event-commands.js";
export { EVENT_TOOLS } from "./goal-event-tools.js";
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
export type { McpProtocolPorts, McpToolCallContext, McpToolDefinition, McpToolResult } from "./protocol.js";
export { createActionMcpPorts, actionMcpToolName, actionMcpToolDefinition } from "./action-tools.js";
export { serveMcpStdio } from "./stdio.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-app-mcp",
  packagePath: "apps/mcp",
  kind: "app",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/app-host",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-dv1", "goal-reorg-dv2", "goal-reorg-gw4", "goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { validateMolisWorkMcpLauncher } from "./launcher-validation.js";
export type { McpLauncherValidationContext } from "./launcher-validation.js";
export { dispatchMcpProjectTool } from "./tool-dispatch.js";
export type { McpToolDispatchPorts } from "./tool-dispatch.js";
