import { createMcpContextPresenter, createMcpRuntimeContextHandlers, type McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsHostActions, readGoalResumeFacts } from "./goal-callers.js";
import type { McpRuntimeContextPorts } from "@molis-ai/molis-work-app-mcp";
import { createPresentationError } from "./mcp-v1-tool.js";

/** Both embedded and resident MCP use the same conversions and catalog scope. */
export function localMcpContextTools(ports: Omit<McpRuntimeContextPorts, "createError" | "presentResolution"> & {
  contextSignal(): AbortSignal;
  contextActions(): Promise<BoundActionClient>;
}) {
  return createMcpRuntimeContextHandlers({ ...ports, createError: createPresentationError,
    presentResolution: createMcpContextPresenter({ connection: ports.connection, createError: createPresentationError,
      contextSignal: ports.contextSignal,
      readGuidance: async () => (await ports.contextActions()).invoke(goalsHostActions.guidanceRead, {}),
      readResumeFacts: async (_connection, focus) => readGoalResumeFacts(await ports.contextActions(), focus),
    }),
  });
}

export function lookupContextTool(tools: ReturnType<typeof localMcpContextTools>, name: string):
  ((input: Record<string, unknown>, context: McpToolCallContext) => Promise<string>) | undefined {
  return Object.hasOwn(tools, name) ? tools[name as keyof typeof tools] : undefined;
}
