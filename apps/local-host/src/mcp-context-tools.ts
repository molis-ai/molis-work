import { createMcpContextPresenter, createMcpRuntimeContextHandlers, type McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsHostActions, readGoalResumeFacts } from "./goal-callers.js";
import type { McpRuntimeContextPorts } from "@molis-ai/molis-work-app-mcp";
import { homeHostUrl } from "./host-endpoint.js";
import { createPresentationError } from "./mcp-v1-tool.js";

/** Both embedded and resident MCP use the same conversions and catalog scope. */
export function localMcpContextTools(ports: Omit<McpRuntimeContextPorts, "createError" | "presentResolution"> & {
  contextSignal(): AbortSignal;
  contextActions(): Promise<BoundActionClient>;
}) {
  const present = createMcpContextPresenter({ connection: ports.connection, createError: createPresentationError,
    contextSignal: ports.contextSignal,
    readGuidance: async () => (await ports.contextActions()).invoke(goalsHostActions.guidanceRead, {}),
    readResumeFacts: async (_connection, focus) => readGoalResumeFacts(await ports.contextActions(), focus),
  });
  return createMcpRuntimeContextHandlers({ ...ports, createError: createPresentationError,
    // A Runtime host that did not name its URL still points at this Home's Host, which may be on a
    // port the address file names (resident-runtime-design §6): fall back to it, not to 4173.
    presentResolution: (resolution, host) => present(resolution,
      host.webBaseUrl || !host.homeDirectory ? host : { ...host, webBaseUrl: homeHostUrl(host.homeDirectory) }),
  });
}

export function lookupContextTool(tools: ReturnType<typeof localMcpContextTools>, name: string):
  ((input: Record<string, unknown>, context: McpToolCallContext) => Promise<string>) | undefined {
  return Object.hasOwn(tools, name) ? tools[name as keyof typeof tools] : undefined;
}
