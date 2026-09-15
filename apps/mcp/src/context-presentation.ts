import type { MolisWorkRuntimeContextHost, RuntimeProjectConnectionState } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkRuntimeContextResolution, RuntimeSessionReadResult } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";
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
}

/** Compose the existing response in its original order; no binding or recovery decisions. */
export function createMcpContextPresenter(ports: McpContextPresentationPorts) {
  return async function presentResolution(
    resolution: MolisWorkRuntimeContextResolution,
    host: MolisWorkRuntimeContextHost,
    reconcileLegacy: boolean = false,
  ): Promise<string> {
    const webBaseUrl = host.webBaseUrl ?? "http://127.0.0.1:4173";
    const projectUrl = resolution.connection
      ? mcpWebUrl(`/projects/${encodeURIComponent(resolution.connection.project_id)}`, webBaseUrl, ports.createError)
      : null;
    const connection = resolution.connection
      ? { ...resolution.connection, web_base_url: webBaseUrl, project_url: projectUrl }
      : null;
    const projectGuidance = connection ? await ports.readGuidance(connection) : null;
    ports.connection.accept(connection ? {
      projectId: connection.project_id, databasePath: connection.database_path,
      boardId: connection.board_id, webBaseUrl,
    } : null, host.runtimeContext);
    const { sessionRegistry, sessionGoalId } = await ports.readSession(host, reconcileLegacy);
    const hostFocus = host.goalId?.trim() || null;
    const sessionFocus = sessionGoalId?.trim() || null;
    const resume = connection
      ? buildMcpResumeView(
        await ports.readResumeFacts(connection, uniqueFocusGoalIds(hostFocus, sessionFocus)),
        hostFocus,
        sessionFocus,
      )
      : { focus: null, next_goals: [], auto_claimed: false };
    return JSON.stringify({
      ...resolution, connection, session_registry: sessionRegistry, project_guidance: projectGuidance,
      runtime_prompt_prefix: projectGuidance?.runtime_prompt_prefix ?? null, resume,
    }, null, 2);
  };
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
