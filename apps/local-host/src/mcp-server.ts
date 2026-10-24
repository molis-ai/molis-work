import { DEFAULT_RESIDENT_HOST_URL } from "./resident-host-request.js";
import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ensureSystemAgentService } from "./system-agent-service.js";
import { projectActionAvailability } from "./project-action-availability.js";
import type { MolisWorkRuntimeConnection, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import { bindActionClient, ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalEntryActions, readGoalResumeFacts } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { createMcpRuntimeContextHandlers, createMcpContextPresenter, handleMcpMessage,
  MCP_SERVER_INFO as SERVER_INFO,
  createActionMcpPorts, isPlatformMcpTool, isRuntimeContextMcpTool, molisWorkActionToolName,
  type McpToolResult, type McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { createRuntimePanelSessionLinker } from "./runtime-panel-session.js";
import { RuntimeProjectConnection } from "./runtime-project-connection.js";
import { runtimeContextHostFromEnvironment } from "./runtime-context.js";
import { assertMcpToolAllowed, requireMcpRuntimeContextHost } from "./mcp-authority.js";
import { runtimeConnectionIdentity, runtimeSessionActor } from "./mcp-event-identity.js";
import { LocalProjectDeletionGatewayClient, type ProjectDeletionGatewayRequest } from "./project-deletion-gateway.js";
import { ProjectDeletionService } from "./project-deletion-service.js";
import { assembleMcpCatalog, findAssembledMcpTool, type AssembledMcpCatalog } from "./mcp-catalog.js";
import { readProductEnv } from "@molis-ai/molis-work-storage";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { LocalActionGatewayClient } from "./action-gateway.js";
import { authorizeMcpActions } from "./mcp-action-client.js";
import { callMcpV1Tool, createPresentationError } from "./mcp-v1-tool.js";
import { formatMcpToolError, withCallIdMeta } from "./mcp-call-id.js";
import { newCallId, recordedCallId, withCallId } from "@molis-ai/molis-work-kernel";

export type MolisWorkMcpAudience = "runtime" | "management";
export type MolisWorkMcpToolCallContext = McpToolCallContext;
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
        readGuidance: async () => (await this.contextActions()).invoke(goalEntryActions.guidanceRead, {}),
        readResumeFacts: async (_connection, focusGoalIds) => readGoalResumeFacts(await this.contextActions(), focusGoalIds),
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
      isMissingPanel: (error) => error instanceof ActionError && error.code === "catalog.panel_not_found",
    });
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

  /** `sessionCall` names the Runtime Session a call is made in; it becomes the call's audit actor. A Runtime without one is marked on
   * the context, and dispatch refuses the actions that declare `authorship: "session"` (see `authorizeMcpActions`). */
  private async authorizedActions(sessionCall?: McpToolCallContext) {
    const connection = this.runtimeConnection;
    const current = this.currentActions();
    const sessionActor = (call: McpToolCallContext) => runtimeSessionActor(this.runtimeContextHost, call) ?? undefined;
    const auditActor = sessionCall ? sessionActor(sessionCall) : undefined;
    const runtimeSessionId = auditActor?.slice(current.context.actor_id.length + 1);
    if (auditActor) current.context = { ...current.context, audit_actor_id: auditActor, actor_kind: "runtime", runtime_session_id: runtimeSessionId };
    const checkContext = () => { this.connectionState.signal.throwIfAborted(); this.transportLifetime.signal.throwIfAborted();
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
        ports: createActionMcpPorts({ service, context: () => context, serverInfo: SERVER_INFO, toolName: molisWorkActionToolName }) };
    }
    const reference = this.runtimeConnection ? molisWorkHostProjectReference(this.runtimeConnection) : undefined;
    const { context } = await authorizeMcpActions(this.localHost, current.context, home, reference, checkContext, checkContext, () => { if (this.localHost.lifecycle() !== "running") throw new ActionError("actions.host_closed", "原系统服务已关闭"); });
    return { ...current, context,
      ports: createActionMcpPorts({ service: current.service, context: () => context, serverInfo: SERVER_INFO, toolName: molisWorkActionToolName }) };
  }

  private async ensureCatalog(): Promise<AssembledMcpCatalog & { actionServiceError?: ActionError }> {
    await this.restoreBoundSessionConnection();
    const actions = await this.authorizedActions();
    let discovered;
    let actionServiceError: ActionError | undefined;
    try { discovered = await actions.service.discover(actions.context); }
    catch (error) {
      // Management platform tools use their protected factory; granted action tools keep the same gateway and never run locally on its refusal.
      if (!this.actionServiceUrl || !(error instanceof ActionError) || (this.audience === "runtime" && error.code !== "actions.service_unavailable")) throw error;
      actionServiceError = error;
      discovered = [];
    }
    const catalog = assembleMcpCatalog({
      audience: this.audience,
      actions: discovered,
      actionToolName: molisWorkActionToolName,
      authorized_actions: this.actionServiceUrl ? discovered.map(view => ({ capability_id: view.capability_id,
        version: view.version, provider_id: view.provider.provider_id })) : actions.context.allowed_actions,
    });
    if (actionServiceError) {
      const platformAvailable = (name: string) => isRuntimeContextMcpTool(name) || (this.audience === "management" && isPlatformMcpTool(name));
      return { ...catalog, actionServiceError, tools: catalog.tools.filter(tool => platformAvailable(tool.name)),
        entries: catalog.entries.filter(entry => platformAvailable(entry.definition.name)) };
    }
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
    if (catalog.actionServiceError && !isRuntimeContextMcpTool(name) && !(this.audience === "management" && isPlatformMcpTool(name))) throw catalog.actionServiceError;
    const connection = this.runtimeConnection;
    assertMcpToolAllowed({ audience: this.audience, connectionState: this.connectionState,
      runtimeConnection: this.runtimeConnection, runtimeContextHost: this.runtimeContextHost }, name, callContext, catalog);
    await this.linkPanelSession(this.runtimeContextHost, callContext.runtimeSessionId);
    const entry = findAssembledMcpTool(catalog, name);
    if (!entry) {
      throw new ActionError("mcp.tool_unknown", `未知 MCP 方法：${name}`);
    }
    if (entry.source === "action") {
      if (this.runtimeConnection !== connection) throw new ActionError("mcp.context_changed", "客户端项目连接已变化，请重新发现能力");
      // Every Runtime call carries its Session when there is one (a receipt query finds the write it made); an action whose
      // records are authored by a Session is refused at dispatch for a call without one, wrapped or not.
      // A Home action called from a bound project still runs in that project's context (e.g. a judgment records where it was asked).
      const runtimeCall = this.runtimeContextHost ? callContext : undefined;
      const actions = await this.authorizedActions(runtimeCall);
      return actions.ports.callTool(name, arguments_, callContext);
    }
    const contextHandler = lookupContextTool(this.contextTools, name);
    if (contextHandler) return contextHandler(arguments_ ?? {}, callContext);
    return callMcpV1Tool({ localHost: this.localHost, audience: this.audience,
      runtimeConnection: this.audience === "runtime" ? this.runtimeConnection : null,
      ...(this.audience === "management" && (this.ownsLocalHost || this.actionServiceUrl) ? { resident: {
        home: this.runtimeContextHost?.homeDirectory ?? resolveMolisWorkHome(),
        origin: this.actionServiceUrl ?? readProductEnv("WEB_URL") ?? DEFAULT_RESIDENT_HOST_URL,
        signal: this.transportLifetime.signal } } : {}) }, name, arguments_);
  }

  private requireRuntimeContextHost(context: MolisWorkMcpToolCallContext = EMPTY_TOOL_CALL_CONTEXT): MolisWorkRuntimeContextHost {
    return requireMcpRuntimeContextHost(this, context);
  }

  async close(): Promise<void> {
    this.transportLifetime.abort(new ActionError("actions.cancelled", "MCP 入口已关闭"));
    if (this.ownsLocalHost) await this.localHost.close();
  }

  async handleMessage(
    message: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    // One message is one operation, and its number is made here, never read from the client: every call it causes, in this process or in the
    // resident Host, runs under it. The result and the error text show it only when the operation left a row in the call log.
    return withCallId(newCallId(), async () => {
      const catalog = message.method === "tools/list" ? await this.ensureCatalog() : null;
      return handleMcpMessage(message, {
        serverInfo: SERVER_INFO,
        tools: catalog?.tools ?? [],
        callTool: async (name, arguments_, context) => withCallIdMeta(await this.callToolResult(name, arguments_, context)),
        formatToolError: error => formatMcpToolError(error, recordedCallId()),
      });
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
