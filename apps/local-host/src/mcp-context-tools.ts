import { createMcpContextPresenter, createMcpRuntimeContextHandlers, type McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import { ActionError, isResumeSummaryAction, type ActionDefinition, type ActionSubject, type BoundActionClient, type ResumeSummary, type ResumeSummaryInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { McpResumeSection, McpRuntimeContextPorts } from "@molis-ai/molis-work-app-mcp";
import { homeHostUrl } from "./host-endpoint.js";
import { createPresentationError } from "./mcp-v1-tool.js";
import { pinnedProjectGuidanceRead } from "./project-guidance-actions.js";

/** Both embedded and resident MCP use the same conversions and catalog scope. */
export function localMcpContextTools(ports: Omit<McpRuntimeContextPorts, "createError" | "presentResolution"> & {
  contextSignal(): AbortSignal;
  contextActions(): Promise<BoundActionClient>;
}) {
  const present = createMcpContextPresenter({ connection: ports.connection, createError: createPresentationError,
    contextSignal: ports.contextSignal,
    readGuidance: async () => (await ports.contextActions()).invoke(pinnedProjectGuidanceRead, {}),
    readResumeSections: async (_connection, focus) => readResumeSections(await ports.contextActions(), focus),
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

/**
 * Every resume summary in the project's directory (batch 44 C7), one section a plugin: none is named here. A plugin is told the host's
 * focus only when it names that kind; one that cannot answer shows its refusal in its own section and the others still answer.
 */
async function readResumeSections(actions: BoundActionClient, focus: ActionSubject | null): Promise<McpResumeSection[]> {
  const views = (await actions.discover()).filter(view => view.availability.available && isResumeSummaryAction(view.action));
  return Promise.all(views.map(async (view): Promise<McpResumeSection> => {
    const plugin = { plugin_id: view.provider.plugin_id ?? view.provider.provider_id, plugin: view.provider.title };
    try {
      const summary = await actions.invoke({ ...view, provider_id: view.provider.provider_id } as ActionDefinition<ResumeSummaryInput, ResumeSummary>,
        focus && view.action.subject_kinds.includes(focus.kind) ? { focus } : {});
      return { ...plugin, summary };
    } catch (error) {
      if (!(error instanceof ActionError) || ["actions.cancelled", "actions.scope_mismatch", "actions.transport_invalid"].includes(error.code)) throw error;
      return { ...plugin, error: { code: error.code, message: error.message } };
    }
  }));
}
