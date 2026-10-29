import type { MolisWorkRuntimeContextHost, RuntimeProjectConnectionState } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkRuntimeContextResolution } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { mcpWebUrl } from "./goal-presentation.js";
import { buildMcpResumeView, type McpResumeFacts } from "./resume-view.js";
import type { McpPresentationErrorFactory } from "./goal-presentation.js";

/** What a Runtime is told of the project's guidance: the confirmed text its first turn starts with. */
export interface McpGuidanceFacts { readonly runtime_prompt_prefix: string }

type ProjectConnection = NonNullable<MolisWorkRuntimeContextResolution["connection"]>;

export interface McpContextPresentationPorts {
  connection: RuntimeProjectConnectionState;
  readGuidance(connection: ProjectConnection): Promise<McpGuidanceFacts>;
  readResumeFacts(connection: ProjectConnection, focusGoalIds: readonly string[]): Promise<McpResumeFacts>;
  createError: McpPresentationErrorFactory;
  contextSignal?(): AbortSignal;
}

/** Connection facts remain usable when optional project content is not authorized. */
export function createMcpContextPresenter(ports: McpContextPresentationPorts) {
  return async function presentResolution(
    resolution: MolisWorkRuntimeContextResolution,
    host: MolisWorkRuntimeContextHost,
  ): Promise<string> {
    const contextSignal = ports.contextSignal?.();
    const webBaseUrl = host.webBaseUrl ?? "http://127.0.0.1:4173";
    const projectUrl = resolution.connection
      ? mcpWebUrl(`/projects/${encodeURIComponent(resolution.connection.project_id)}`, webBaseUrl, ports.createError)
      : null;
    // Action results carry IDs only; a Runtime fills `{goal_id}` here instead of composing a URL itself.
    const connection = resolution.connection
      ? { ...resolution.connection, web_base_url: webBaseUrl, project_url: projectUrl, goal_url_template: `${projectUrl}/goals/{goal_id}` }
      : null;
    ports.connection.accept(connection ? {
      projectId: connection.project_id, databasePath: connection.database_path, webBaseUrl,
    } : null, host.runtimeContext);
    const accepted = ports.connection.connection;
    const checkContext = () => {
      if (contextSignal?.aborted || ports.connection.connection !== accepted)
        throw ports.createError("mcp.context_changed", "读取连接摘要期间客户端或项目连接已变化，请重新解析");
    };
    checkContext();
    const guidance = connection ? await readOptional(() => ports.readGuidance(connection)) : { value: null };
    checkContext();
    const projectGuidance = guidance.value;
    const hostFocus = host.goalId?.trim() || null;
    const facts = connection ? await readOptional(() => ports.readResumeFacts(connection, hostFocus ? [hostFocus] : [])) : { value: null };
    checkContext();
    const resume = connection ? facts.value ? buildMcpResumeView(facts.value, hostFocus) : null
      : { focus: null, next_goals: [] };
    return JSON.stringify({
      ...resolution, connection, project_guidance: projectGuidance,
      runtime_prompt_prefix: projectGuidance?.runtime_prompt_prefix ?? null, resume,
      ...(guidance.error ? { project_guidance_error: guidance.error } : {}),
      ...(facts.error ? { resume_error: facts.error } : {}),
    }, null, 2);
  };
}

async function readOptional<T>(read: () => Promise<T>): Promise<{ value: T | null; error?: { code: string; message: string } }> {
  try { return { value: await read() }; }
  catch (error) {
    if (!(error instanceof ActionError) || ["mcp.context_changed", "actions.cancelled", "actions.scope_mismatch", "actions.transport_invalid"].includes(error.code)) throw error;
    return { value: null, error: { code: error.code, message: error.message } };
  }
}
