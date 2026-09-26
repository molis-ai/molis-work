import type { MolisWorkRuntimeContextHost, RuntimeProjectConnectionState } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkRuntimeContextResolution, RuntimeSessionReadResult } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { mcpWebUrl } from "./goal-presentation.js";
import { buildMcpResumeView, type McpResumeFacts } from "./resume-view.js";
import type { McpPresentationErrorFactory } from "./query-presentation.js";

type ProjectConnection = NonNullable<MolisWorkRuntimeContextResolution["connection"]>;

export interface McpContextPresentationPorts {
  connection: RuntimeProjectConnectionState;
  readGuidance(connection: ProjectConnection): Promise<ProjectGuidanceView>;
  readResumeFacts(connection: ProjectConnection, focusGoalIds: readonly string[]): Promise<McpResumeFacts>;
  readSession(host: MolisWorkRuntimeContextHost, reconcileLegacy: boolean): Promise<RuntimeSessionReadResult>;
  createError: McpPresentationErrorFactory;
  contextSignal?(): AbortSignal;
}

/** Connection facts remain usable when optional project content is not authorized. */
export function createMcpContextPresenter(ports: McpContextPresentationPorts) {
  return async function presentResolution(
    resolution: MolisWorkRuntimeContextResolution,
    host: MolisWorkRuntimeContextHost,
    reconcileLegacy: boolean = false,
  ): Promise<string> {
    const contextSignal = ports.contextSignal?.();
    const webBaseUrl = host.webBaseUrl ?? "http://127.0.0.1:4173";
    const projectUrl = resolution.connection
      ? mcpWebUrl(`/projects/${encodeURIComponent(resolution.connection.project_id)}`, webBaseUrl, ports.createError)
      : null;
    const connection = resolution.connection
      ? { ...resolution.connection, web_base_url: webBaseUrl, project_url: projectUrl }
      : null;
    ports.connection.accept(connection ? {
      projectId: connection.project_id, databasePath: connection.database_path,
      boardId: connection.board_id, webBaseUrl,
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
    const { sessionRegistry, sessionGoalId } = await ports.readSession(host, reconcileLegacy);
    checkContext();
    const hostFocus = host.goalId?.trim() || null;
    const sessionFocus = sessionGoalId?.trim() || null;
    const facts = connection ? await readOptional(() => ports.readResumeFacts(connection, uniqueFocusGoalIds(hostFocus, sessionFocus))) : { value: null };
    checkContext();
    const resume = connection ? facts.value ? buildMcpResumeView(facts.value, hostFocus, sessionFocus) : null
      : { focus: null, next_goals: [], auto_claimed: false };
    return JSON.stringify({
      ...resolution, connection, session_registry: sessionRegistry, project_guidance: projectGuidance,
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

function uniqueFocusGoalIds(...ids: Array<string | null>): string[] {
  const result: string[] = [];
  for (const id of ids) {
    if (!id || result.includes(id)) continue;
    result.push(id);
    if (result.length === 2) break;
  }
  return result;
}
