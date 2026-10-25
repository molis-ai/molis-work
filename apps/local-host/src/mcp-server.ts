import { DEFAULT_RESIDENT_HOST_URL } from "./resident-host-request.js";
import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ensureSystemAgentService } from "./system-agent-service.js";
import { projectActionAvailability } from "./project-action-availability.js";
import type { MolisWorkRuntimeConnection, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import { bindActionClient, ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  MCP_SERVER_INFO as SERVER_INFO,
  createActionMcpPorts, isPlatformMcpTool, isRuntimeContextMcpTool, molisWorkActionToolName,
  type McpToolResult, type McpToolCallContext, type McpRuntimeContextPorts } from "@molis-ai/molis-work-app-mcp";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { createRuntimePanelSessionLinker } from "./runtime-panel-session.js";
import { RuntimeProjectConnection } from "./runtime-project-connection.js";
import { runtimeContextHostFromEnvironment } from "./runtime-context.js";
import { assertMcpToolAllowed, requireMcpRuntimeContextHost } from "./mcp-authority.js";
import { runtimeConnectionIdentity, runtimeSessionActor } from "./mcp-event-identity.js";
import { ProjectDeletionService } from "./project-deletion-service.js";
import { assembleMcpCatalog, findAssembledMcpTool, type AssembledMcpCatalog } from "./mcp-catalog.js";
import { readProductEnv } from "@molis-ai/molis-work-storage";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { LocalActionGatewayClient } from "./action-gateway.js";
import { authorizeMcpActions } from "./mcp-action-client.js";
import { callMcpV1Tool } from "./mcp-v1-tool.js";
import { handleLocalMcpRequest, mcpRequestSignal, ensureMcpRequestResident, mcpResidentManagement } from "./mcp-request-lifetime.js";
import { assertMcpStartInput, mcpResidentUnavailable } from "./mcp-start-preflight.js";
import type { EnsureMcpResidentHost } from "./mcp-resident-start.js";
import { localMcpContextTools, lookupContextTool } from "./mcp-context-tools.js";
import { frozenRuntimeHost, type ContextCacheUpdate } from "./mcp-context-envelope.js";
import { forwardMcpContext } from "./mcp-context-client.js";

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
      this.currentRuntimeHost = value ? frozenRuntimeHost(value) : null;
    }
  }
  private readonly contextTools: ReturnType<typeof localMcpContextTools>;
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
    private readonly ensureResident?: EnsureMcpResidentHost,
  ) {
    this.audience =
      audience ?? (readProductEnv("MCP_AUDIENCE") === "management" ? "management" : "runtime");
    this.withCatalog = withMolisWorkProjectCatalog;
    // Explicit constructor injection is reserved for tests and embedding. A
    // production Runtime never inherits a static project DB from environment.
    this.connectionState = new RuntimeProjectConnection(runtimeConnection ?? null);
    this.contextTools = localMcpContextTools({
      catalogs: { withCatalog: (homeDirectory, operation) => withMolisWorkProjectCatalog({ homeDirectory }, operation) },
      connection: this.connectionState,
      requireHost: (context) => this.requireRuntimeContextHost(context),
      actorFor: (host, context) => runtimeConnectionIdentity(host, context).actor_id,
      deleteProject: (request, host, context) => this.deleteProject(request, host, context),
      contextSignal: () => mcpRequestSignal(this.transportLifetime.signal),
      contextActions: () => this.contextActions(),
    });
    this.runtimeContextHost =
      runtimeContextHost ?? (this.runtimeConnection ? null : runtimeContextHostFromEnvironment());
    this.ownsLocalHost = !localHost;
    this.localHost = localHost ?? createMolisWorkLocalHost(this.actionServiceUrl ? {} : {
      homeDirectory: this.runtimeContextHost?.homeDirectory,
      sceneAvailability: this.runtimeContextHost?.homeDirectory
        ? projectActionAvailability(this.withCatalog, this.runtimeContextHost.homeDirectory) : undefined,
      actionAvailability: this.runtimeContextHost?.homeDirectory
        ? projectActionAvailability(this.withCatalog, this.runtimeContextHost.homeDirectory) : undefined,
      ...(this.runtimeContextHost?.homeDirectory ? { workspacesFor: (projectId: string) => this.withCatalog(
        { homeDirectory: this.runtimeContextHost!.homeDirectory }, catalog => catalog.listWorkspaceDirectory(projectId)) } : {}),
    });
    if (!this.actionServiceUrl && this.runtimeContextHost?.homeDirectory) this.localHost.configurePersonalPlanning(this.runtimeContextHost.homeDirectory, this.withCatalog);
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
   * Embedded MCP uses the same deletion service over its own resources. Forwarding MCP invokes the resident context
   * handlers instead; it never enters this local path or opens a catalog to prepare a request.
   */
  private async deleteProject(request: Parameters<McpRuntimeContextPorts["deleteProject"]>[0], host: MolisWorkRuntimeContextHost, callContext: McpToolCallContext) {
    const identity = runtimeConnectionIdentity(host, callContext);
    const home = host.homeDirectory;
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
    const signal = mcpRequestSignal(this.connectionState.signal, this.transportLifetime.signal);
    const checkContext = () => { signal.throwIfAborted();
      if (this.runtimeConnection !== connection || this.currentActions().context.actor_id !== current.context.actor_id
        || (sessionCall && sessionActor(sessionCall) !== auditActor))
        throw new ActionError("mcp.context_changed", "调用等待期间客户端或项目连接已变化，或会话身份不再一致，请重新发现能力");
    };
    const home = this.runtimeContextHost?.homeDirectory;
    if (this.actionServiceUrl) {
      if (!home) throw new ActionError("actions.home_required", "跨进程动作需要明确的 Runtime Home");
      await ensureMcpRequestResident(this.ensureResident, home, this.actionServiceUrl, signal); checkContext();
      const service = new LocalActionGatewayClient({ url: this.actionServiceUrl, homeDirectory: home,
        clientId: current.context.actor_id, projectId: current.context.project_id, runtimeSessionId });
      const context: ActionCallContext = { ...current.context,
        signal,
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
    try { await this.restoreBoundSessionConnection(); }
    catch (error) {
      if (!this.actionServiceUrl || !mcpResidentUnavailable(error)) throw error;
    }
    let discovered;
    let localGrants: ActionCallContext["allowed_actions"];
    let actionServiceError: ActionError | undefined;
    try {
      const actions = await this.authorizedActions();
      discovered = await actions.service.discover(actions.context);
      localGrants = actions.context.allowed_actions;
    }
    catch (error) {
      // Management platform tools use their protected factory; granted action tools keep the same gateway and never run locally on its refusal.
      if (!this.actionServiceUrl || !(error instanceof ActionError) || (this.audience === "runtime" && !mcpResidentUnavailable(error))) throw error;
      actionServiceError = error;
      discovered = [];
    }
    const catalog = assembleMcpCatalog({
      audience: this.audience,
      actions: discovered,
      actionToolName: molisWorkActionToolName,
      authorized_actions: this.actionServiceUrl ? discovered.map(view => ({ capability_id: view.capability_id,
        version: view.version, provider_id: view.provider.provider_id })) : localGrants,
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
    if (this.actionServiceUrl) { await this.forwardContext("restore", EMPTY_TOOL_CALL_CONTEXT); return; }
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
    mcpRequestSignal(this.transportLifetime.signal).throwIfAborted();
    if (this.ensureResident) assertMcpStartInput(this.audience, name, arguments_);
    if (this.actionServiceUrl && isRuntimeContextMcpTool(name)) {
      assertMcpToolAllowed({ audience: this.audience, connectionState: this.connectionState,
        runtimeConnection: this.runtimeConnection, runtimeContextHost: this.runtimeContextHost }, name, callContext);
      const result = await this.forwardContext("tool", callContext, { name, arguments: arguments_ });
      if (result === null) throw new ActionError("actions.transport_invalid", "常驻连接工具缺少结果");
      return result;
    }
    const managementTool = !!this.ensureResident && this.audience === "management" && isPlatformMcpTool(name) && !isRuntimeContextMcpTool(name);
    const catalog: AssembledMcpCatalog & { actionServiceError?: ActionError } = managementTool ? assembleMcpCatalog({ audience: this.audience, actions: [], actionToolName: molisWorkActionToolName }) : await this.ensureCatalog();
    if (catalog.actionServiceError && !isRuntimeContextMcpTool(name) && !(this.audience === "management" && isPlatformMcpTool(name))) throw catalog.actionServiceError;
    const connection = this.runtimeConnection;
    assertMcpToolAllowed({ audience: this.audience, connectionState: this.connectionState,
      runtimeConnection: this.runtimeConnection, runtimeContextHost: this.runtimeContextHost }, name, callContext, catalog);
    if (!managementTool && this.actionServiceUrl && this.runtimeContextHost?.panelId && callContext.runtimeSessionId) await this.forwardContext("alias", callContext);
    else if (!managementTool) await this.linkPanelSession(this.runtimeContextHost, callContext.runtimeSessionId);
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
      ...(this.audience === "management" && (this.ownsLocalHost || this.actionServiceUrl) ? { resident: mcpResidentManagement(this.ensureResident,
        this.runtimeContextHost?.homeDirectory ?? resolveMolisWorkHome(), this.actionServiceUrl ?? readProductEnv("WEB_URL") ?? DEFAULT_RESIDENT_HOST_URL,
        mcpRequestSignal(this.transportLifetime.signal)) } : {}) }, name, arguments_);
  }

  private requireRuntimeContextHost(context: MolisWorkMcpToolCallContext = EMPTY_TOOL_CALL_CONTEXT): MolisWorkRuntimeContextHost {
    return requireMcpRuntimeContextHost(this, context);
  }

  private async forwardContext(operation: "tool" | "restore" | "alias", context: McpToolCallContext,
    tool?: { name: string; arguments: Record<string, unknown> }): Promise<string | null> {
    const host = this.runtimeContextHost;
    if (!host) throw new ActionError("mcp.context_host_missing", "MCP 宿主没有提供 Runtime 标识");
    const signal = mcpRequestSignal(this.transportLifetime.signal, this.connectionState.signal);
    if (!host.homeDirectory) throw new ActionError("actions.home_required", "MCP 自动启动需要明确的 Runtime Home");
    await ensureMcpRequestResident(this.ensureResident, host.homeDirectory, this.actionServiceUrl!, signal); signal.throwIfAborted();
    const cacheContext = operation === "restore" ? host.runtimeContext : requireMcpRuntimeContextHost({ runtimeContextHost: host }, context).runtimeContext;
    return forwardMcpContext({ url: this.actionServiceUrl!, host, context, operation, tool, signal,
      checkCurrent: () => { signal.throwIfAborted(); if (this.runtimeContextHost !== host) throw new ActionError("mcp.context_changed", "MCP 调用主体已变化"); },
      updateCache: (update: ContextCacheUpdate) => {
        if (update.kind === "clear") this.connectionState.clear(update.clearRefresh);
        else if (update.kind === "accept") this.connectionState.accept(update.connection, cacheContext);
      },
    });
  }

  async close(): Promise<void> {
    this.transportLifetime.abort(new ActionError("actions.cancelled", "MCP 入口已关闭"));
    if (this.ownsLocalHost) await this.localHost.close();
  }

  async handleMessage(message: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
    return handleLocalMcpRequest(message, signal, {
      tools: async () => (await this.ensureCatalog()).tools,
      callTool: (name, input, context) => this.callToolResult(name, input, context),
    });
  }
}
