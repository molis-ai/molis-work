import type { IncomingMessage, ServerResponse } from "node:http";
import { isRuntimeContextMcpTool } from "@molis-ai/molis-work-app-mcp";
import { ActionError, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { RuntimeProjectApplicationApi, RuntimeProjectConnectionState } from "@molis-ai/molis-work-contracts/platform/app-host";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { withCallId } from "@molis-ai/molis-work-kernel";
import { actionGatewayHomeId, isGatewayCallId } from "./action-gateway.js";
import { closedRecord, MCP_CONTEXT_PATH, readContextMetadata, readProtocolContext, type ContextCacheUpdate } from "./mcp-context-envelope.js";
import { localMcpContextTools, lookupContextTool } from "./mcp-context-tools.js";
import { requireMcpRuntimeContextHost } from "./mcp-authority.js";
import { runtimeConnectionIdentity } from "./mcp-event-identity.js";
import { authorizeMcpActions } from "./mcp-action-client.js";
import { RuntimeProjectConnection } from "./runtime-project-connection.js";
import { createRuntimePanelSessionLinker } from "./runtime-panel-session.js";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { ProjectDeletionService, type ProjectDeletionPorts } from "./project-deletion-service.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";

interface ContextGatewayOwner {
  home: string; host: MolisWorkLocalHost; withCatalog: LocalWebCatalogRunner; deletion: ProjectDeletionPorts;
}

/** Mounted after the existing Home token, Origin and one-time-key gate. No catalog opens during describe or validation. */
export async function handleMcpContextHttp(request: IncomingMessage, response: ServerResponse, url: URL, owner: ContextGatewayOwner): Promise<boolean> {
  if (url.pathname !== MCP_CONTEXT_PATH) return false;
  if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "只支持本机 POST 调用" }); return true; }
  const abort = new AbortController(), instance = owner.host.instanceId;
  const disconnect = () => { if (!response.writableFinished) abort.abort(new ActionError("actions.cancelled", "Runtime 上下文连接已断开")); };
  response.once("close", disconnect);
  let cache: ContextCacheUpdate = { kind: "none" };
  const check = () => {
    abort.signal.throwIfAborted();
    if (owner.host.instanceId !== instance || owner.host.lifecycle() !== "running") throw new ActionError("actions.host_closed", "原常驻服务已关闭");
  };
  try {
    const body = closedRecord(await readLocalWebBody(request, 64 * 1024), ["operation", "home_id", "instance_id", "metadata", "protocol", "tool", "call_id"]);
    if (body.home_id !== actionGatewayHomeId(owner.home)) throw new ActionError("actions.home_mismatch", "连接的常驻服务属于另一个 Home");
    check();
    if (body.operation === "describe") {
      if (Object.keys(body).some(key => !["operation", "home_id"].includes(key))) throw new ActionError("actions.input_invalid", "上下文发现参数无效");
      sendLocalWebJson(response, 200, { instance_id: instance }); return true;
    }
    if (typeof body.operation !== "string" || !["tool", "restore", "alias"].includes(body.operation) || !isGatewayCallId(body.call_id)) throw new ActionError("actions.input_invalid", "上下文操作无效");
    if (body.instance_id !== instance) throw new ActionError("actions.host_replaced", "常驻服务已重启，请重新解析上下文");
    const host = readContextMetadata(body.metadata, owner.home), protocol = readProtocolContext(body.protocol);
    // Identity is derived before any owner storage is opened, never read from a tool argument.
    runtimeConnectionIdentity(requireMcpRuntimeContextHost({ runtimeContextHost: host }, protocol), protocol);
    await withCallId(body.call_id, async () => {
      try {
        const result = await executeContext(owner, body, host, protocol, abort.signal, check, update => { cache = update; });
        check();
        sendLocalWebJson(response, 200, { instance_id: instance, result, cache });
      } catch (error) {
        const failed = actionErrorResponse(error);
        if (!response.destroyed) sendLocalWebJson(response, failed.status, { ...failed.body, instance_id: instance, cache });
      }
    });
  } catch (error) {
    const failed = actionErrorResponse(error);
    if (!response.destroyed) sendLocalWebJson(response, failed.status, { ...failed.body, instance_id: instance, cache });
  } finally { response.off("close", disconnect); }
  return true;
}

async function executeContext(owner: ContextGatewayOwner, body: Record<string, unknown>,
  host: ReturnType<typeof readContextMetadata>, protocol: ReturnType<typeof readProtocolContext>, signal: AbortSignal,
  check: () => void, update: (cache: ContextCacheUpdate) => void): Promise<string | null> {
  const withCatalog: LocalWebCatalogRunner = (options, operation) => owner.withCatalog(options, catalog => { check(); return operation(catalog); });
  const link = createRuntimePanelSessionLinker({ withCatalog: (homeDirectory, operation) => withCatalog({ homeDirectory }, catalog => operation({
    aliasTerminalSession: async input => { check(); await catalog.commit(() => { check(); catalog.terminalPanels.aliasSession(input); }); },
  })), isMissingPanel: error => error instanceof ActionError && error.code === "actions.missing" });
  let linking: Promise<void> | undefined;
  const alias = () => linking ??= link(host, protocol.runtimeSessionId);
  if (body.operation === "alias") {
    if (body.tool !== undefined) throw new ActionError("actions.input_invalid", "面板关联不能携带工具参数");
    await alias();
    return null;
  }
  const state = new RuntimeProjectConnection(), connection = recordedConnection(state, update);
  const requiredHost = () => requireMcpRuntimeContextHost({ runtimeContextHost: host }, protocol);
  if (body.operation === "restore") {
    if (body.tool !== undefined) throw new ActionError("actions.input_invalid", "恢复连接不能携带工具参数");
    const resolution = await withCatalog({ homeDirectory: owner.home }, catalog => catalog.resolveRuntimeContext(host.runtimeContext, host.projectSuggestionClues ?? []));
    if (resolution.status === "bound" && resolution.connection) connection.accept({ projectId: resolution.connection.project_id,
      databasePath: resolution.connection.database_path, webBaseUrl: host.webBaseUrl ?? "http://127.0.0.1:4173" }, host.runtimeContext);
    return null;
  }
  const tool = closedRecord(body.tool, ["name", "arguments"]);
  if (typeof tool.name !== "string" || !isRuntimeContextMcpTool(tool.name)) throw new ActionError("actions.input_invalid", "这里只接受现有 Runtime 连接工具");
  if (!tool.arguments || typeof tool.arguments !== "object" || Array.isArray(tool.arguments)) throw new ActionError("actions.input_invalid", "连接工具参数必须是对象");
  const deletion = new ProjectDeletionService(withCatalog, { isPanelAlive: panel => { check(); return owner.deletion.isPanelAlive(panel); },
    releaseProject: async database => { check(); await owner.deletion.releaseProject(database); check(); } });
  const tools = localMcpContextTools({ catalogs: { withCatalog: async (homeDirectory, operation) => {
    // The original factory refuses tool-supplied identity before it requests this scope. A rejected actor cannot write an alias first.
    await alias(); return withCatalog({ homeDirectory }, catalog => operation(guardedContextCatalog(catalog, check)));
  } },
    connection, requireHost: requiredHost, actorFor: runtimeHost => runtimeConnectionIdentity(runtimeHost, protocol).actor_id,
    deleteProject: async (input, runtimeHost, context) => { await alias(); return deletion.deleteProject(owner.home, { ...input, actor_id: runtimeConnectionIdentity(runtimeHost, context).actor_id }); },
    contextSignal: () => signal,
    contextActions: async () => {
      check();
      const reference = state.connection ? molisWorkHostProjectReference(state.connection) : undefined;
      const caller: ActionCallContext = { actor_id: `runtime:${host.runtimeContext.runtime_id}`, audience: "mcp", project_id: reference?.project_id ?? null, permissions: [], signal };
      const { service, context } = await authorizeMcpActions(owner.host, caller, owner.home, reference, check, check, check);
      await service.discover(context); check();
      return bindActionClient(service, () => context);
    },
  });
  const handler = lookupContextTool(tools, tool.name);
  if (!handler) throw new ActionError("actions.input_invalid", "连接工具未登记处理器");
  return handler(tool.arguments as Record<string, unknown>, protocol);
}

function guardedContextCatalog(catalog: Parameters<Parameters<LocalWebCatalogRunner>[1]>[0], check: () => void): RuntimeProjectApplicationApi {
  return {
    resolveRuntimeContext: (...input) => { check(); return catalog.resolveRuntimeContext(...input); },
    listProjects: () => { check(); return catalog.listProjects(); },
    bindRuntimeContext: input => { check(); return catalog.bindRuntimeContext(input); },
    unbindRuntimeContext: input => { check(); return catalog.unbindRuntimeContext(input); },
    rejectRuntimeContextSuggestion: input => { check(); return catalog.rejectRuntimeContextSuggestion(input); },
    createProjectAndBindRuntimeContext: input => { check(); return catalog.createProjectAndBindRuntimeContext(input, check); },
    deleteProject: input => { check(); return catalog.deleteProject(input); },
  };
}

function recordedConnection(state: RuntimeProjectConnection, update: (cache: ContextCacheUpdate) => void): RuntimeProjectConnectionState {
  return {
    get connection() { return state.connection; }, set connection(value) { state.connection = value; },
    get explicit() { return state.explicit; }, observe: context => state.observe(context),
    clear: (clearRefresh = true) => { state.clear(clearRefresh); update({ kind: "clear", clearRefresh }); },
    accept: (connection, context) => { state.accept(connection, context); update({ kind: "accept", connection }); },
  };
}
