import { ensureSystemAgentService } from "./system-agent-service.js";
import { projectActionAvailability } from "./project-action-availability.js";
import type { MolisWorkRuntimeConnection, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import { bindActionClient, ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions, readGoalResumeFacts } from "@molis-ai/molis-work-plugin-goals";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import { createMcpRuntimeContextHandlers, createMcpContextPresenter, dispatchMcpProjectTool, handleMcpMessage,
  mcpRuntimeSessionActivity, MCP_SERVER_INFO as SERVER_INFO,
  createActionMcpPorts, isRuntimeContextMcpTool,
  type McpToolResult, type McpToolCallContext, type McpPresentationErrorFactory } from "@molis-ai/molis-work-app-mcp";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { MolisWorkProjectCatalogError } from "./project-catalog.js";
import { createRuntimePanelSessionLinker } from "./runtime-panel-session.js";
import { namedDatabasePath, prepareLocalProjectStorage } from "./project-storage.js";
import { RuntimeSessionHost } from "./runtime-session.js";
import { RuntimeProjectConnection } from "./runtime-project-connection.js";
import { runtimeContextHostFromEnvironment } from "./runtime-context.js";
import { assertMcpToolAllowed, requireMcpRuntimeContextHost } from "./mcp-authority.js";
import { runtimeConnectionIdentity, runtimeEventActor, runtimeSessionActor } from "./mcp-event-identity.js";
import { LocalProjectDeletionGatewayClient, type ProjectDeletionGatewayRequest } from "./project-deletion-gateway.js";
import { ProjectDeletionService } from "./project-deletion-service.js";
import { assembleMcpCatalog, findAssembledMcpTool, type AssembledMcpCatalog } from "./mcp-catalog.js";
import { readProductEnv } from "@molis-ai/molis-work-storage";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { hostActionToolName } from "./mcp-action-grants.js";
import { LocalActionGatewayClient } from "./action-gateway.js";
import { authorizeMcpActions } from "./mcp-action-client.js";

export type MolisWorkMcpAudience = "runtime" | "management";
export type MolisWorkMcpToolCallContext = McpToolCallContext;
const createPresentationError: McpPresentationErrorFactory = (code, message, details) => new MolisWorkV1Error(code, message, details);
const EMPTY_TOOL_CALL_CONTEXT: MolisWorkMcpToolCallContext = { runtimeSessionId: null, runtimeSessionIdSource: null };

/** Sole outbound MCP process. Host owns project lifetimes and protocol adapters own transport. */
export class LocalMcpServer {
  audience: MolisWorkMcpAudience;
  private readonly connectionState: RuntimeProjectConnection;
  get runtimeConnection(): MolisWorkRuntimeConnection | null { return this.connectionState.connection; }
  set runtimeConnection(connection: MolisWorkRuntimeConnection | null) { this.connectionState.connection = connection; }
  private currentRuntimeHost: MolisWorkRuntimeContextHost | null = null;
  private transportLifetime = new AbortController();
  get runtimeContextHost(): MolisWorkRuntimeContextHost | null { return this.currentRuntimeHost; }
  set runtimeContextHost(value: MolisWorkRuntimeContextHost | null) {
    if (value !== this.currentRuntimeHost) {
      this.transportLifetime.abort(new ActionError("mcp.context_changed", "MCP 调用主体已变化"));
      this.transportLifetime = new AbortController();
      this.currentRuntimeHost = value;
    }
  }
  private readonly contextTools: ReturnType<typeof createMcpRuntimeContextHandlers>;
  private readonly runtimeSessions: RuntimeSessionHost;
  private readonly linkPanelSession: ReturnType<typeof createRuntimePanelSessionLinker>;
  private readonly localHost: MolisWorkLocalHost;
  private readonly ownsLocalHost: boolean;
  private readonly withCatalog: LocalWebCatalogRunner;

  constructor(
    withMolisWorkProjectCatalog: LocalWebCatalogRunner,
    audience?: MolisWorkMcpAudience | null,
    runtimeConnection?: MolisWorkRuntimeConnection | null,
    runtimeContextHost?: MolisWorkRuntimeContextHost | null,
    localHost?: MolisWorkLocalHost,
    private readonly actionServiceUrl?: string,
  ) {
    this.audience =
      audience ?? (readProductEnv("MCP_AUDIENCE") === "management" ? "management" : "runtime");
    this.withCatalog = withMolisWorkProjectCatalog;
    // Explicit constructor injection is reserved for tests and embedding. A
    // production Runtime never inherits a static project DB from environment.
    this.connectionState = new RuntimeProjectConnection(runtimeConnection ?? null);
    this.contextTools = createMcpRuntimeContextHandlers({
      catalogs: { withCatalog: (homeDirectory, operation) => withMolisWorkProjectCatalog({ homeDirectory }, operation) },
      connection: this.connectionState,
      createError: createPresentationError,
      requireHost: (context) => this.requireRuntimeContextHost(context),
      actorFor: (host, context) => runtimeConnectionIdentity(host, context).actor_id,
      deleteProject: (request, host, context) => this.deleteProject(request, host, context),
      presentResolution: createMcpContextPresenter({
        connection: this.connectionState,
        createError: createPresentationError,
        contextSignal: () => this.transportLifetime.signal,
        readGuidance: async () => (await this.contextActions()).invoke(goalsActions.guidanceRead, {}),
        readResumeFacts: async (_connection, focusGoalIds) => readGoalResumeFacts(await this.contextActions(), focusGoalIds),
        readSession: (host, boundProjectId) => this.runtimeSessions.read(host, boundProjectId),
      }),
    });
    this.runtimeContextHost =
      runtimeContextHost ?? (this.runtimeConnection ? null : runtimeContextHostFromEnvironment());
    this.ownsLocalHost = !localHost;
    this.localHost = localHost ?? createMolisWorkLocalHost({
      homeDirectory: this.runtimeContextHost?.homeDirectory,
      sceneAvailability: this.runtimeContextHost?.homeDirectory
        ? projectActionAvailability(this.withCatalog, this.runtimeContextHost.homeDirectory) : undefined,
      actionAvailability: this.runtimeContextHost?.homeDirectory
        ? projectActionAvailability(this.withCatalog, this.runtimeContextHost.homeDirectory) : undefined,
      ...(this.runtimeContextHost?.homeDirectory ? { workspacesFor: (projectId: string) => this.withCatalog(
        { homeDirectory: this.runtimeContextHost!.homeDirectory }, catalog => catalog.listWorkspaceDirectory(projectId)) } : {}),
    });
    if (this.runtimeContextHost?.homeDirectory) this.localHost.configurePersonalPlanning(this.runtimeContextHost.homeDirectory, this.withCatalog);
    if (!this.actionServiceUrl && this.runtimeContextHost?.homeDirectory) {
      ensureSystemAgentService(this.localHost, this.runtimeContextHost.homeDirectory, this.withCatalog);
    }
    this.linkPanelSession = createRuntimePanelSessionLinker({
      withCatalog: (homeDirectory, operation) => withMolisWorkProjectCatalog({ homeDirectory }, (catalog) => operation({
        aliasPanelSession: (input) => catalog.desktopPanels.aliasSession(input),
      })),
      isMissingPanel: (error) => error instanceof MolisWorkProjectCatalogError && error.code === "catalog.panel_not_found",
    });
    this.runtimeSessions = new RuntimeSessionHost();
  }

  /**
   * Deleting a project is the Host's one deletion service. With a resident Host to forward to, that Host runs it: the
   * terminals and the project's runtime are its own. Without one there are neither, and this process deletes with the
   * same service over what it has. Either way the actor is this call's MCP client and Session, not anything the Runtime said.
   */
  private async deleteProject(request: ProjectDeletionGatewayRequest, host: MolisWorkRuntimeContextHost, callContext: McpToolCallContext) {
    const identity = runtimeConnectionIdentity(host, callContext);
    const home = host.homeDirectory;
    if (this.actionServiceUrl && home) {
      const databasePath = await this.withCatalog({ homeDirectory: home }, catalog => catalog.listProjects().find(project => project.project_id === request.project_id.trim())?.database_path);
      const forwarded = await new LocalProjectDeletionGatewayClient({ url: this.actionServiceUrl, homeDirectory: home, clientId: identity.client_id,
        runtimeSessionId: identity.runtime_session_id }).delete(request, this.transportLifetime.signal);
      if (forwarded) {
        // This process may hold the project's runtime too (the v1 management tools open it); the resident Host has deleted it, so let go.
        if (databasePath) await this.localHost.closeProject(databasePath);
        return forwarded;
      }
    }
    return new ProjectDeletionService(this.withCatalog, { isPanelAlive: () => false, releaseProject: async databasePath => { await this.localHost.closeProject(databasePath); } })
      .deleteProject(home, { ...request, actor_id: identity.actor_id });
  }

  private currentActions() {
    const connection = this.runtimeConnection;
    const reference = connection ? molisWorkHostProjectReference(connection) : null;
    const context: ActionCallContext = { actor_id: this.runtimeContextHost
      ? `runtime:${this.runtimeContextHost.runtimeContext.runtime_id}` : "local-mcp",
      project_id: reference?.project_id ?? null, audience: "mcp", permissions: [] };
    const service = reference ? this.localHost.actionClient(reference) : this.localHost.homeActionClient();
    return { service, context };
  }

  private async contextActions() {
    const actions = await this.authorizedActions();
    // The gateway pins discovery to the current Host instance; no local fallback.
    await actions.service.discover(actions.context);
    return bindActionClient(actions.service, () => actions.context);
  }

  /** `sessionCall` names the Runtime Session a call is made in; it becomes the call's audit actor, and a write requires it. */
  private async authorizedActions(sessionCall?: McpToolCallContext, requireSession = false) {
    const connection = this.runtimeConnection;
    const current = this.currentActions();
    const sessionActor = (call: McpToolCallContext) => requireSession
      ? runtimeEventActor(this.runtimeContextHost, call).actor_id : runtimeSessionActor(this.runtimeContextHost, call) ?? undefined;
    const auditActor = sessionCall ? sessionActor(sessionCall) : undefined;
    const runtimeSessionId = auditActor?.slice(current.context.actor_id.length + 1);
    if (auditActor) current.context = { ...current.context, audit_actor_id: auditActor, actor_kind: "runtime", runtime_session_id: runtimeSessionId };
    const checkContext = () => {
      if (this.runtimeConnection !== connection || this.currentActions().context.actor_id !== current.context.actor_id
        || (sessionCall && sessionActor(sessionCall) !== auditActor))
        throw new ActionError("mcp.context_changed", "调用等待期间客户端或项目连接已变化，或会话身份不再一致，请重新发现能力");
    };
    const home = this.runtimeContextHost?.homeDirectory;
    if (this.actionServiceUrl) {
      if (!home) throw new ActionError("actions.home_required", "跨进程动作需要明确的 Runtime Home");
      const service = new LocalActionGatewayClient({ url: this.actionServiceUrl, homeDirectory: home,
        clientId: current.context.actor_id, projectId: current.context.project_id, runtimeSessionId });
      const context: ActionCallContext = { ...current.context,
        signal: AbortSignal.any([this.connectionState.signal, this.transportLifetime.signal]),
        validate_authority: checkContext,
      };
      return { service, context,
        ports: createActionMcpPorts({ service, context: () => context, serverInfo: SERVER_INFO, toolName: hostActionToolName }) };
    }
    const reference = this.runtimeConnection ? molisWorkHostProjectReference(this.runtimeConnection) : undefined;
    const { context } = await authorizeMcpActions(this.localHost, current.context, home, reference, checkContext);
    return { ...current, context,
      ports: createActionMcpPorts({ service: current.service, context: () => context, serverInfo: SERVER_INFO, toolName: hostActionToolName }) };
  }

  private async ensureCatalog(): Promise<AssembledMcpCatalog & { actionServiceError?: ActionError }> {
    await this.restoreBoundSessionConnection();
    const actions = await this.authorizedActions();
    let discovered;
    let actionServiceError: ActionError | undefined;
    try { discovered = await actions.service.discover(actions.context); }
    catch (error) {
      if (!this.actionServiceUrl || !(error instanceof ActionError) || error.code !== "actions.service_unavailable") throw error;
      actionServiceError = error;
      discovered = [];
    }
    const catalog = assembleMcpCatalog({
      audience: this.audience,
      actions: discovered,
      actionToolName: hostActionToolName,
      authorized_actions: this.actionServiceUrl ? discovered.map(view => ({ capability_id: view.capability_id,
        version: view.version, provider_id: view.provider.provider_id })) : actions.context.allowed_actions,
    });
    if (actionServiceError) return { ...catalog, actionServiceError,
      tools: catalog.tools.filter(tool => isRuntimeContextMcpTool(tool.name)),
      entries: catalog.entries.filter(entry => isRuntimeContextMcpTool(entry.definition.name)) };
    return catalog;
  }

  private async restoreBoundSessionConnection(): Promise<void> {
    if (this.runtimeConnection || this.audience !== "runtime") return;
    const host = this.runtimeContextHost;
    if (!host?.homeDirectory) return;
    const resolution = await this.withCatalog({ homeDirectory: host.homeDirectory }, (catalog) =>
      catalog.resolveRuntimeContext(host.runtimeContext, host.projectSuggestionClues ?? []),
    );
    if (resolution.status !== "bound" || !resolution.connection) return;
    this.connectionState.accept({
      projectId: resolution.connection.project_id,
      databasePath: resolution.connection.database_path,
      webBaseUrl: host.webBaseUrl ?? "http://127.0.0.1:4173",
    }, host.runtimeContext);
  }

  async callTool(
    name: string,
    arguments_: Record<string, unknown>,
    callContext: MolisWorkMcpToolCallContext = EMPTY_TOOL_CALL_CONTEXT,
  ): Promise<string> {
    const result = await this.callToolResult(name, arguments_, callContext);
    return typeof result === "string" ? result : JSON.stringify(result.structuredContent ?? result.content);
  }

  private async callToolResult(name: string, arguments_: Record<string, unknown>, callContext: McpToolCallContext): Promise<string | McpToolResult> {
    const catalog = await this.ensureCatalog();
    if (catalog.actionServiceError && !isRuntimeContextMcpTool(name)) throw catalog.actionServiceError;
    const connection = this.runtimeConnection;
    assertMcpToolAllowed({ audience: this.audience, connectionState: this.connectionState,
      runtimeConnection: this.runtimeConnection, runtimeContextHost: this.runtimeContextHost }, name, callContext, catalog);
    await this.linkPanelSession(this.runtimeContextHost, callContext.runtimeSessionId);
    const entry = findAssembledMcpTool(catalog, name);
    if (!entry) {
      throw new MolisWorkV1Error("mcp.tool_unknown", `未知 MCP 方法：${name}`);
    }
    if (entry.source === "action") {
      if (this.runtimeConnection !== connection) throw new ActionError("mcp.context_changed", "客户端项目连接已变化，请重新发现能力");
      // Every Runtime call carries its Session when there is one (a receipt query finds the write it made); an action whose
      // records are authored by a Session refuses a call without one.
      // A Home action called from a bound project still runs in that project's context (e.g. a judgment records where it was asked).
      const runtimeCall = this.runtimeContextHost ? callContext : undefined;
      const actions = await this.authorizedActions(runtimeCall, entry.action?.action.authorship === "session");
      const result = await actions.ports.callTool(name, arguments_, callContext);
      if (entry.action && this.runtimeConnection === connection && typeof result !== "string" && result.structuredContent) {
        await this.recordRuntimeSessionActivity(entry.action.capability_id, name, arguments_, result.structuredContent, callContext);
      }
      return result;
    }
    const contextHandler = lookupContextTool(this.contextTools, name);
    if (contextHandler) return contextHandler(arguments_ ?? {}, callContext);
    return this.callV1Tool(name, arguments_, this.audience === "runtime" ? this.runtimeConnection : null);
  }

  private async recordRuntimeSessionActivity(
    capabilityId: string,
    name: string,
    arguments_: Record<string, unknown>,
    result: Record<string, unknown>,
    callContext: MolisWorkMcpToolCallContext,
  ): Promise<void> {
    const host = this.runtimeContextHost;
    if (this.audience !== "runtime" || !host?.homeDirectory || !this.runtimeConnection) return;
    const activity = mcpRuntimeSessionActivity(capabilityId, name, arguments_, result);
    if (!activity) return;
    const activeHost = this.requireRuntimeContextHost(callContext);
    await this.runtimeSessions.record(activity, activeHost, this.runtimeConnection.projectId);
  }

  private requireRuntimeContextHost(context: MolisWorkMcpToolCallContext = EMPTY_TOOL_CALL_CONTEXT): MolisWorkRuntimeContextHost {
    return requireMcpRuntimeContextHost(this, context);
  }

  private async callV1Tool(
    name: string,
    arguments_: Record<string, unknown>,
    runtimeConnection: MolisWorkRuntimeConnection | null,
  ): Promise<string> {
    const location = this.audience === "runtime"
      ? runtimeConnection!.databasePath
      : namedDatabasePath(arguments_.database_path) ?? namedDatabasePath(readProductEnv("DATABASE"));
    if (!location) {
      throw new MolisWorkV1Error("store.path_required",
        "管理入口需要明确的数据库路径：在参数 database_path 里给出，或设置环境变量 MOLIS_WORK_DATABASE。没有默认路径，不会按当前目录猜一个。");
    }
    const storage = prepareLocalProjectStorage(location, name === "molis_work_v1_initialize" ? "create" : "existing");
    const { databasePath } = storage;
    if (storage.status === "missing") {
      throw new MolisWorkV1Error("store.not_found", `Molis Work 数据库不存在: ${databasePath}`);
    }
    const projectId = String(
      this.audience === "runtime"
        ? runtimeConnection!.projectId
        : arguments_.project_id ?? `database:${databasePath}`,
    );
    const reference = molisWorkHostProjectReference({
      databasePath,
      projectId,
    });
    const client = this.localHost.client(reference);
    return dispatchMcpProjectTool(client, name, arguments_, {
      audience: this.audience,
      webBaseUrl: () => String(this.audience === "runtime" ? runtimeConnection!.webBaseUrl
        : arguments_.web_base_url ?? readProductEnv("WEB_URL") ?? "http://127.0.0.1:4173"),
      projectId: runtimeConnection?.projectId,
      createError: createPresentationError,
    });
  }

  async close(): Promise<void> {
    this.transportLifetime.abort(new ActionError("actions.cancelled", "MCP 入口已关闭"));
    if (this.ownsLocalHost) await this.localHost.close();
  }

  async handleMessage(
    message: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const catalog = message.method === "tools/list" ? await this.ensureCatalog() : null;
    return handleMcpMessage(message, {
      serverInfo: SERVER_INFO,
      tools: catalog?.tools ?? [],
      callTool: (name, arguments_, context) => this.callToolResult(name, arguments_, context),
      formatToolError: formatMcpToolError,
    });
  }
}

function lookupContextTool(
  tools: ReturnType<typeof createMcpRuntimeContextHandlers>,
  name: string,
): ((arguments_: Record<string, unknown>, context: McpToolCallContext) => Promise<string>) | undefined {
  const candidate = (tools as Record<string, unknown>)[name];
  return typeof candidate === "function"
    ? candidate as (arguments_: Record<string, unknown>, context: McpToolCallContext) => Promise<string>
    : undefined;
}

function formatMcpToolError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ActionError) return `错误: ${message}\n${JSON.stringify({ code: error.code })}`;
  if (error instanceof MolisWorkV1Error) {
    return `错误: ${message}\n${JSON.stringify({ code: error.code, ...(error.details ?? {}) })}`;
  }
  if (!(error instanceof MolisWorkProjectCatalogError)) return `错误: ${message}`;
  return `错误: ${message}\n${JSON.stringify({ code: error.code, ...error.details })}`;
}
