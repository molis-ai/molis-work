import { ensureSystemAgentService } from "./system-agent-service.js";
import { callLegacyFunctionsMcp } from "./mcp-functions-tools.js";
import { projectActionAvailability } from "./project-action-availability.js";
import type { MolisWorkRuntimeConnection, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import { bindActionClient, ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsActions, readGoalResumeFacts } from "@molis-ai/molis-work-plugin-goals";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import { createMcpRuntimeContextHandlers, createMcpContextPresenter, dispatchMcpProjectTool, handleMcpMessage,
  mcpRuntimeSessionActivity, MCP_SERVER_INFO as SERVER_INFO,
  canonicalMcpToolName, createActionMcpPorts, isRuntimeContextMcpTool, LEGACY_GOALS_MCP, callLegacyGoalsMcp,
  type McpToolResult, type McpToolCallContext, type McpPresentationErrorFactory } from "@molis-ai/molis-work-app-mcp";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { MolisWorkProjectCatalogError } from "./project-catalog.js";
import { reconcileLegacySessionCatalog } from "./session-migration.js";
import { createRuntimePanelSessionLinker } from "./runtime-panel-session.js";
import { prepareLocalProjectStorage } from "./project-storage.js";
import { RuntimeSessionHost } from "./runtime-session.js";
import { RuntimeProjectConnection } from "./runtime-project-connection.js";
import { runtimeContextHostFromEnvironment } from "./runtime-context.js";
import { assertMcpToolAllowed, requireMcpRuntimeContextHost } from "./mcp-authority.js";
import { runtimeEventActor } from "./mcp-event-identity.js";
import { assembleMcpCatalog, findAssembledMcpTool, type AssembledMcpCatalog } from "./mcp-catalog.js";
import { createNativeMcpPluginAdapters, dispatchNativeMcpPluginTool, type NativeMcpDispatchEntry } from "./mcp-native-plugins.js";
import { readProductEnv } from "@molis-ai/molis-work-storage";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { hostActionToolName } from "./mcp-action-grants.js";
import { LocalActionGatewayClient } from "./action-gateway.js";
import { readMcpToolPreference } from "./mcp-settings-store.js";
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
  private readonly sessionFoundationReady: Promise<void>;
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
      requireHost: (context) => this.requireRuntimeContextHost(context),
      presentResolution: createMcpContextPresenter({
        connection: this.connectionState,
        createError: createPresentationError,
        contextSignal: () => this.transportLifetime.signal,
        readGuidance: async () => (await this.contextActions()).invoke(goalsActions.guidanceRead, {}),
        readResumeFacts: async (_connection, focusGoalIds) => readGoalResumeFacts(await this.contextActions(), focusGoalIds),
        readSession: (host, reconcileLegacy) => this.runtimeSessions.read(host, reconcileLegacy),
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
        reconcileSessions: (registry) => { reconcileLegacySessionCatalog(catalog, registry); },
      })),
      isMissingPanel: (error) => error instanceof MolisWorkProjectCatalogError && error.code === "catalog.panel_not_found",
    });
    this.runtimeSessions = new RuntimeSessionHost(async (homeDirectory, registry) => {
      await withMolisWorkProjectCatalog({ homeDirectory }, (catalog) => {
        reconcileLegacySessionCatalog(catalog, registry);
      });
    });
    // An explicitly injected Board connection is already fully scoped. Tests
    // and embedders that omit homeDirectory must not accidentally migrate the
    // user's global catalog just because they also provide audit metadata.
    this.sessionFoundationReady = this.runtimeContextHost?.homeDirectory
      ? this.runtimeSessions.reconcile(this.runtimeContextHost.homeDirectory).catch((error: unknown) => {
          this.runtimeSessions.recordFailure(error);
        })
      : Promise.resolve();
  }

  private currentActions(scope?: "home") {
    const connection = this.runtimeConnection;
    const reference = connection && scope !== "home" ? molisWorkHostProjectReference(connection) : null;
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

  private async authorizedActions(scope?: "home", legacyCall?: McpToolCallContext) {
    const connection = this.runtimeConnection;
    const current = this.currentActions(scope);
    const auditActor = legacyCall ? runtimeEventActor(this.runtimeContextHost, legacyCall).actor_id : undefined;
    const runtimeSessionId = auditActor?.slice(current.context.actor_id.length + 1);
    if (auditActor) current.context = { ...current.context, audit_actor_id: auditActor, actor_kind: "runtime", runtime_session_id: runtimeSessionId };
    const checkContext = () => {
      if (this.runtimeConnection !== connection || this.currentActions().context.actor_id !== current.context.actor_id
        || (legacyCall && runtimeEventActor(this.runtimeContextHost, legacyCall).actor_id !== auditActor))
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
      const preference = await readMcpToolPreference(home);
      return { service, context, preference,
        ports: createActionMcpPorts({ service, context: () => context, serverInfo: SERVER_INFO, toolName: hostActionToolName }) };
    }
    const reference = this.runtimeConnection && scope !== "home" ? molisWorkHostProjectReference(this.runtimeConnection) : undefined;
    const { context, preference } = await authorizeMcpActions(this.localHost, current.context, home, reference, checkContext);
    return { ...current, context, preference,
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
      preference: actions.preference,
      enabled_project_plugins: await this.loadEnabledProjectPlugins(),
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
    await this.sessionFoundationReady;
    const resolution = await this.withCatalog({ homeDirectory: host.homeDirectory }, (catalog) =>
      catalog.resolveRuntimeContext(host.runtimeContext, host.projectSuggestionClues ?? []),
    );
    if (resolution.status !== "bound" || !resolution.connection) return;
    this.connectionState.accept({
      projectId: resolution.connection.project_id,
      databasePath: resolution.connection.database_path,
      boardId: resolution.connection.board_id,
      webBaseUrl: host.webBaseUrl ?? "http://127.0.0.1:4173",
    }, host.runtimeContext);
  }

  private async loadEnabledProjectPlugins(): Promise<readonly string[] | null> {
    if (!this.runtimeConnection) return null;
    const homeDirectory = this.runtimeContextHost?.homeDirectory;
    const projectId = this.runtimeConnection.projectId;
    if (!homeDirectory || !projectId) return [];
    try {
      return await this.withCatalog({ homeDirectory }, (catalog) => catalog.listProjectPlugins(projectId));
    } catch {
      return [];
    }
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
    await this.sessionFoundationReady;
    name = canonicalMcpToolName(name);
    const catalog = await this.ensureCatalog();
    if (catalog.actionServiceError && !isRuntimeContextMcpTool(name)) throw catalog.actionServiceError;
    const connection = this.runtimeConnection;
    assertMcpToolAllowed({ audience: this.audience, connectionState: this.connectionState,
      runtimeConnection: this.runtimeConnection, runtimeContextHost: this.runtimeContextHost }, name, arguments_, callContext, catalog);
    await this.linkPanelSession(this.runtimeContextHost, callContext.runtimeSessionId);
    const entry = findAssembledMcpTool(catalog, name);
    if (!entry) {
      throw new MolisWorkV1Error("mcp.tool_unknown", `未知 MCP 方法：${name}`);
    }
    if (entry.source === "action") {
      if (this.runtimeConnection !== connection) throw new ActionError("mcp.context_changed", "客户端项目连接已变化，请重新发现能力");
      const actions = await this.authorizedActions();
      return actions.ports.callTool(name, arguments_, callContext);
    }
    if (entry.source === "system") {
      this.requireRuntimeContextHost(callContext);
      if (this.runtimeConnection !== connection) throw new ActionError("mcp.context_changed", "客户端项目连接已变化，请重新发现能力");
      const actions = await this.authorizedActions();
      await actions.service.discover(actions.context);
      return callLegacyFunctionsMcp(bindActionClient(actions.service, () => actions.context), name, arguments_ ?? {});
    }
    if (entry.source === "plugin") {
      return this.callPluginTool(entry, arguments_ ?? {}, callContext);
    }
    if (entry.source === "alias") {
      if (!connection || this.runtimeConnection !== connection) throw new ActionError("mcp.context_changed", "请先连接具体项目并重新发现能力");
      const binding = LEGACY_GOALS_MCP.find(item => item.name === name)!;
      const actions = await this.authorizedActions(undefined, binding.session_actor ? callContext : undefined);
      await actions.service.discover(actions.context);
      const response = await callLegacyGoalsMcp(bindActionClient(actions.service, () => actions.context), name, arguments_ ?? {}, {
        projectId: connection.projectId, webBaseUrl: connection.webBaseUrl,
      });
      if (this.runtimeConnection === connection) await this.recordRuntimeSessionActivity(name, arguments_, response, callContext);
      return response;
    }
    const contextHandler = lookupContextTool(this.contextTools, name);
    if (contextHandler) return contextHandler(arguments_ ?? {}, callContext);
    const response = await this.callV1Tool(
      name,
      arguments_,
      this.audience === "runtime" ? this.runtimeConnection : null,
    );
    await this.recordRuntimeSessionActivity(name, arguments_, response, callContext);
    return response;
  }

  private async callPluginTool(entry: NativeMcpDispatchEntry, arguments_: Record<string, unknown>, context: McpToolCallContext): Promise<string> {
    const actions = await this.authorizedActions(entry.scope === "home" ? "home" : undefined);
    await actions.service.discover(actions.context);
    const adapters = createNativeMcpPluginAdapters(bindActionClient(actions.service, () => actions.context));
    return dispatchNativeMcpPluginTool(adapters, entry, arguments_ ?? {}, context);
  }

  private async recordRuntimeSessionActivity(
    name: string,
    arguments_: Record<string, unknown>,
    response: string,
    callContext: MolisWorkMcpToolCallContext,
  ): Promise<void> {
    const host = this.runtimeContextHost;
    if (this.audience !== "runtime" || !host?.homeDirectory || !this.runtimeConnection) return;
    const activity = mcpRuntimeSessionActivity(name, arguments_, response);
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
    const storage = prepareLocalProjectStorage(
      String(
        this.audience === "runtime"
          ? runtimeConnection!.databasePath
          : arguments_.database_path ?? readProductEnv("DATABASE") ?? ".molis-work/molis-work.db",
      ),
      name === "molis_work_v1_initialize" || name === "molis_work_v1_import_v3" ? "create" : "existing",
    );
    const { databasePath } = storage;
    if (storage.status === "missing") {
      throw new MolisWorkV1Error("store.not_found", `Molis Work 数据库不存在: ${databasePath}`);
    }
    const boardId = String(
      this.audience === "runtime"
        ? runtimeConnection!.boardId
        : arguments_.board_id ?? `database:${databasePath}`,
    );
    const reference = molisWorkHostProjectReference({
      databasePath,
      boardId,
      projectId: this.audience === "runtime" ? runtimeConnection!.projectId : undefined,
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
