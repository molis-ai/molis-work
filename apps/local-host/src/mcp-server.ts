import type { MolisWorkRuntimeConnection, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import { projectResumeFactsCapability, readProjectGuidanceCapability } from "@molis-ai/molis-work-plugin-goals";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import { createMcpRuntimeContextHandlers, createMcpContextPresenter, dispatchMcpProjectTool, handleMcpMessage,
  mcpRuntimeSessionActivity, MCP_SERVER_INFO as SERVER_INFO,
  canonicalMcpToolName,
  type McpToolCallContext, type McpPresentationErrorFactory } from "@molis-ai/molis-work-app-mcp";
import { readPersonalPlanningMethodPacks } from "./personal-planning-methods.js";
import { runtimeGoalTreeDecisionAuthority } from "./runtime-decision.js";
import { createMolisWorkLocalHost, molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { MolisWorkProjectCatalogError } from "./project-catalog.js";
import { reconcileLegacySessionCatalog } from "./session-migration.js";
import { createRuntimePanelSessionLinker } from "./runtime-panel-session.js";
import { prepareLocalProjectStorage } from "./project-storage.js";
import { RuntimeSessionHost } from "./runtime-session.js";
import { RuntimeProjectConnection } from "./runtime-project-connection.js";
import { runtimeContextHostFromEnvironment } from "./runtime-context.js";
import { assertMcpToolAllowed, requireMcpRuntimeContextHost } from "./mcp-authority.js";
import { injectRuntimeIdentity } from "./mcp-event-identity.js";
import { assembleMcpCatalog, findAssembledMcpTool, type AssembledMcpCatalog } from "./mcp-catalog.js";
import { createNativeMcpPluginAdapters, dispatchNativeMcpPluginTool } from "./mcp-native-plugins.js";
import { registerPagesArtifactVersion } from "./pages-artifact.js";
import { LocalProjectDatabase } from "./project-database.js";
import { GoalProjectApplication } from "./goal-project-application.js";
import { readMcpToolPreference } from "./mcp-settings-store.js";
import { readProductEnv } from "@molis-ai/molis-work-storage";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

export type MolisWorkMcpAudience = "runtime" | "management";
export type MolisWorkMcpToolCallContext = McpToolCallContext;
const createPresentationError: McpPresentationErrorFactory = (code, message, details) => new MolisWorkV1Error(code, message, details);
const EMPTY_TOOL_CALL_CONTEXT: MolisWorkMcpToolCallContext = { runtimeSessionId: null, runtimeSessionIdSource: null };

/** Sole outbound MCP process. Catalog assembly and gates stay in Host; apps/mcp owns platform schema and project-tool dispatch. */
export class LocalMcpServer {
  audience: MolisWorkMcpAudience;
  private readonly connectionState: RuntimeProjectConnection;
  get runtimeConnection(): MolisWorkRuntimeConnection | null { return this.connectionState.connection; }
  set runtimeConnection(connection: MolisWorkRuntimeConnection | null) { this.connectionState.connection = connection; }
  runtimeContextHost: MolisWorkRuntimeContextHost | null;
  private readonly contextTools: ReturnType<typeof createMcpRuntimeContextHandlers>;
  private readonly nativePlugins: ReturnType<typeof createNativeMcpPluginAdapters>;
  private readonly sessionFoundationReady: Promise<void>;
  private readonly runtimeSessions: RuntimeSessionHost;
  private readonly linkPanelSession: ReturnType<typeof createRuntimePanelSessionLinker>;
  private readonly localHost: MolisWorkLocalHost;
  private readonly ownsLocalHost: boolean;
  private readonly withCatalog: LocalWebCatalogRunner;
  private catalogSnapshot: AssembledMcpCatalog | null = null;

  constructor(
    withMolisWorkProjectCatalog: LocalWebCatalogRunner,
    audience?: MolisWorkMcpAudience | null,
    runtimeConnection?: MolisWorkRuntimeConnection | null,
    runtimeContextHost?: MolisWorkRuntimeContextHost | null,
    localHost?: MolisWorkLocalHost,
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
        readGuidance: (connection) => this.localHost.client(molisWorkHostProjectReference({
          databasePath: connection.database_path, boardId: connection.board_id, projectId: connection.project_id,
        })).invoke(readProjectGuidanceCapability, { board_id: connection.board_id }),
        readResumeFacts: (connection, focusGoalIds) => this.localHost.client(molisWorkHostProjectReference({
          databasePath: connection.database_path, boardId: connection.board_id, projectId: connection.project_id,
        })).invoke(projectResumeFactsCapability, { board_id: connection.board_id, focus_goal_ids: [...focusGoalIds] }),
        readSession: (host, reconcileLegacy) => this.runtimeSessions.read(host, reconcileLegacy),
      }),
    });
    this.nativePlugins = createNativeMcpPluginAdapters({
      requireHost: (context) => this.requireRuntimeContextHost(context),
      boundProjectId: () => this.runtimeConnection?.projectId ?? null,
      publishPagesArtifact: (input) => {
        const connection = this.runtimeConnection;
        if (!connection) {
          throw new MolisWorkV1Error("pages.unavailable", "当前环境不能发出 Artifact");
        }
        const store = new LocalProjectDatabase(connection.databasePath);
        try {
          return registerPagesArtifactVersion(new GoalProjectApplication(store), connection.boardId)(input);
        } finally {
          store.close();
        }
      },
    });
    this.runtimeContextHost =
      runtimeContextHost ?? (this.runtimeConnection ? null : runtimeContextHostFromEnvironment());
    this.ownsLocalHost = !localHost;
    this.localHost = localHost ?? createMolisWorkLocalHost({
      planningMethods: () => this.runtimeContextHost?.homeDirectory
        ? readPersonalPlanningMethodPacks(this.runtimeContextHost.homeDirectory)
        : [],
    });
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

  private async ensureCatalog(refresh: boolean): Promise<AssembledMcpCatalog> {
    if (!refresh && this.catalogSnapshot) return this.catalogSnapshot;
    await this.restoreBoundSessionConnection();
    const homeDirectory = this.runtimeContextHost?.homeDirectory;
    const preference = homeDirectory
      ? await readMcpToolPreference(homeDirectory)
      : { version: 1 as const, overrides: {} };
    this.catalogSnapshot = assembleMcpCatalog({
      audience: this.audience,
      preference,
      enabled_project_plugins: await this.loadEnabledProjectPlugins(),
    });
    return this.catalogSnapshot;
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
    await this.sessionFoundationReady;
    name = canonicalMcpToolName(name);
    const catalog = await this.ensureCatalog(false);
    assertMcpToolAllowed({ audience: this.audience, connectionState: this.connectionState,
      runtimeConnection: this.runtimeConnection, runtimeContextHost: this.runtimeContextHost }, name, arguments_, callContext, catalog);
    await this.linkPanelSession(this.runtimeContextHost, callContext.runtimeSessionId);
    const entry = findAssembledMcpTool(catalog, name);
    if (!entry) {
      throw new MolisWorkV1Error("mcp.tool_unknown", `未知 MCP 方法：${name}`);
    }
    if (entry.source === "plugin") {
      return dispatchNativeMcpPluginTool(this.nativePlugins, entry, arguments_ ?? {}, callContext);
    }
    const contextHandler = lookupContextTool(this.contextTools, name);
    if (contextHandler) return contextHandler(arguments_ ?? {}, callContext);
    const response = await this.callV1Tool(
      name,
      arguments_,
      this.audience === "runtime" ? this.runtimeConnection : null,
      callContext,
    );
    await this.recordRuntimeSessionActivity(name, arguments_, response, callContext);
    return response;
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
    callContext: MolisWorkMcpToolCallContext,
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
    const trustedArguments = this.audience === "runtime"
      ? injectRuntimeIdentity(
        name,
        arguments_,
        this.runtimeContextHost,
        callContext,
        runtimeConnection!,
        (await this.ensureCatalog(false)).home_scoped_names,
      )
      : arguments_;
    return dispatchMcpProjectTool(client, name, trustedArguments, {
      audience: this.audience,
      webBaseUrl: () => String(this.audience === "runtime" ? runtimeConnection!.webBaseUrl
        : arguments_.web_base_url ?? readProductEnv("WEB_URL") ?? "http://127.0.0.1:4173"),
      projectId: runtimeConnection?.projectId,
      createError: createPresentationError,
      decisionAuthority: (confirmation) => runtimeGoalTreeDecisionAuthority(
        this.runtimeContextHost ? this.requireRuntimeContextHost(callContext) : null, callContext, confirmation,
      ),
    });
  }

  async close(): Promise<void> {
    if (this.ownsLocalHost) await this.localHost.close();
  }

  async handleMessage(
    message: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const catalog = await this.ensureCatalog(message.method === "initialize");
    return handleMcpMessage(message, {
      serverInfo: SERVER_INFO,
      tools: catalog.tools,
      callTool: (name, arguments_, context) => this.callTool(name, arguments_, context),
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
  if (error instanceof MolisWorkV1Error) {
    return `错误: ${message}\n${JSON.stringify({ code: error.code, ...(error.details ?? {}) })}`;
  }
  if (!(error instanceof MolisWorkProjectCatalogError)) return `错误: ${message}`;
  return `错误: ${message}\n${JSON.stringify({ code: error.code, ...error.details })}`;
}
