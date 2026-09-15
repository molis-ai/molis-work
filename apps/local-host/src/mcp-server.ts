import type { MolisWorkRuntimeConnection, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import { MolisWorkV1Error, projectResumeFactsCapability, readProjectGuidanceCapability } from "@molis-ai/molis-work-plugin-goals";
import { createMcpRuntimeContextHandlers, createMcpContextPresenter, dispatchMcpProjectTool, handleMcpMessage,
  mcpRuntimeSessionActivity, MCP_TOOLS as TOOLS, RUNTIME_MCP_TOOLS as RUNTIME_TOOLS, MCP_SERVER_INFO as SERVER_INFO,
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
import { readProductEnv } from "@molis-ai/molis-work-storage";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

export type MolisWorkMcpAudience = "runtime" | "management";
export type MolisWorkMcpToolCallContext = McpToolCallContext;
const createPresentationError: McpPresentationErrorFactory = (code, message, details) => new MolisWorkV1Error(code, message, details);
const EMPTY_TOOL_CALL_CONTEXT: MolisWorkMcpToolCallContext = { runtimeSessionId: null, runtimeSessionIdSource: null };

export class LocalMcpServer {
  audience: MolisWorkMcpAudience;
  private readonly connectionState: RuntimeProjectConnection;
  get runtimeConnection(): MolisWorkRuntimeConnection | null { return this.connectionState.connection; }
  set runtimeConnection(connection: MolisWorkRuntimeConnection | null) { this.connectionState.connection = connection; }
  runtimeContextHost: MolisWorkRuntimeContextHost | null;
  private readonly contextTools: ReturnType<typeof createMcpRuntimeContextHandlers>;
  private readonly sessionFoundationReady: Promise<void>;
  private readonly runtimeSessions: RuntimeSessionHost;
  private readonly linkPanelSession: ReturnType<typeof createRuntimePanelSessionLinker>;
  private readonly localHost: MolisWorkLocalHost;
  private readonly ownsLocalHost: boolean;

  constructor(
    withMolisWorkProjectCatalog: LocalWebCatalogRunner,
    audience?: MolisWorkMcpAudience | null,
    runtimeConnection?: MolisWorkRuntimeConnection | null,
    runtimeContextHost?: MolisWorkRuntimeContextHost | null,
    localHost?: MolisWorkLocalHost,
  ) {
    this.audience =
      audience ?? (readProductEnv("MCP_AUDIENCE") === "management" ? "management" : "runtime");
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

  async callTool(
    name: string,
    arguments_: Record<string, unknown>,
    callContext: MolisWorkMcpToolCallContext = EMPTY_TOOL_CALL_CONTEXT,
  ): Promise<string> {
    await this.sessionFoundationReady;
    name = canonicalMcpToolName(name);
    assertMcpToolAllowed({ audience: this.audience, connectionState: this.connectionState,
      runtimeConnection: this.runtimeConnection, runtimeContextHost: this.runtimeContextHost }, name, arguments_, callContext);
    await this.linkPanelSession(this.runtimeContextHost, callContext.runtimeSessionId);
    if (name === "molis_work_v1_context_resolve") return this.contextTools[name](arguments_, callContext);
    if (name === "molis_work_v1_context_list_projects") return this.contextTools[name](arguments_, callContext);
    if (name === "molis_work_v1_context_reject_suggestion") return this.contextTools[name](arguments_, callContext);
    if (name === "molis_work_v1_context_bind") return this.contextTools[name](arguments_, callContext);
    if (name === "molis_work_v1_context_unbind") return this.contextTools[name](arguments_, callContext);
    if (name === "molis_work_v1_context_create_and_bind") return this.contextTools[name](arguments_, callContext);
    if (name === "molis_work_v1_project_delete") return this.contextTools[name](arguments_, callContext);
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
      ? injectRuntimeIdentity(name, arguments_, this.runtimeContextHost, callContext, runtimeConnection!)
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
    return handleMcpMessage(message, {
      serverInfo: SERVER_INFO,
      tools: this.audience === "management" ? TOOLS : RUNTIME_TOOLS,
      callTool: (name, arguments_, context) => this.callTool(name, arguments_, context),
      formatToolError: formatMcpToolError,
    });
  }
}

function formatMcpToolError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof MolisWorkV1Error && error.details) {
    return `错误: ${message}\n${JSON.stringify({ code: error.code, ...error.details })}`;
  }
  if (!(error instanceof MolisWorkProjectCatalogError)) return `错误: ${message}`;
  return `错误: ${message}\n${JSON.stringify({ code: error.code, ...error.details })}`;
}
