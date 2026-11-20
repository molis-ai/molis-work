import type { MolisWorkRuntimeContextHost, RuntimeProjectConnectionState } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkRuntimeContextResolution } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { ActionError, objectLink, type ActionSubject, type ResumeItem, type ResumeSummary } from "@molis-ai/molis-work-contracts/platform/actions";
import { mcpWebUrl } from "./goal-presentation.js";
import type { McpPresentationErrorFactory } from "./goal-presentation.js";

/** What a Runtime is told of the project's guidance: the confirmed text its first turn starts with. */
export interface McpGuidanceFacts { readonly runtime_prompt_prefix: string }

type ProjectConnection = NonNullable<MolisWorkRuntimeContextResolution["connection"]>;

/** One plugin's resume summary (`defineResumeSummaryAction`), or why it could not be read. */
export type McpResumeSection = { plugin_id: string; plugin: string } & ({ summary: ResumeSummary } | { error: { code: string; message: string } });

export interface McpContextPresentationPorts {
  connection: RuntimeProjectConnectionState;
  readGuidance(connection: ProjectConnection): Promise<McpGuidanceFacts>;
  /** Every resume summary declared in the project, by plugin, each asked with the host's focus when it is of a kind that plugin names. */
  readResumeSections(connection: ProjectConnection, focus: ActionSubject | null): Promise<readonly McpResumeSection[]>;
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
    const connection = resolution.connection ? { ...resolution.connection, web_base_url: webBaseUrl, project_url: projectUrl } : null;
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
    const hostFocus = host.focus ?? null;
    const facts = connection ? await readOptional(() => ports.readResumeSections(connection, hostFocus)) : { value: null };
    checkContext();
    // Each item carries the address that opens it, written by the one address writer; a Runtime never composes one.
    const item = (projectId: string, entry: ResumeItem) => ({ ...entry,
      url: mcpWebUrl(objectLink(projectId, { surface: entry.open.surface, id: entry.open.id, title: entry.title }), webBaseUrl, ports.createError) });
    const resume = connection ? facts.value ? { sections: facts.value.map(section => "error" in section ? section : {
      plugin_id: section.plugin_id, plugin: section.plugin, title: section.summary.title,
      focus: section.summary.focus ? { ...item(connection.project_id, section.summary.focus),
        source: hostFocus && section.summary.focus.subject.kind === hostFocus.kind && section.summary.focus.subject.id === hostFocus.id ? "host_focus" : "owner_order" } : null,
      next: section.summary.next.map(entry => item(connection.project_id, entry)) }) } : null
      : { sections: [] };
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
