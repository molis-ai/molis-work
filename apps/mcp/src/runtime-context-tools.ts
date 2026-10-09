import type { RuntimeProjectCatalogProvider, RuntimeProjectConnectionState, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkRuntimeContextResolution } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import type { McpPresentationErrorFactory } from "./goal-presentation.js";
import type { McpToolCallContext } from "./protocol.js";

/** What a request to delete a project says; who asks is the Host's to say. */
export interface McpProjectDeletionRequest {
  project_id: string;
  delete_confirmed: boolean;
  idempotency_key: string;
}

export interface McpRuntimeContextPorts {
  catalogs: RuntimeProjectCatalogProvider;
  connection: RuntimeProjectConnectionState;
  createError: McpPresentationErrorFactory;
  requireHost(context: McpToolCallContext): MolisWorkRuntimeContextHost;
  /** Who these tools act as: the MCP client and the Runtime Session of this call, taken from the host and never from the arguments. */
  actorFor(host: MolisWorkRuntimeContextHost, context: McpToolCallContext): string;
  /** Deleting a project is the Host's one deletion service; it records `actorFor` as the actor. */
  deleteProject(request: McpProjectDeletionRequest, host: MolisWorkRuntimeContextHost, context: McpToolCallContext): Promise<ProjectDeletionResult>;
  presentResolution(resolution: MolisWorkRuntimeContextResolution, host: MolisWorkRuntimeContextHost, bound?: boolean): Promise<string>;
}

const IDENTITY_FIELDS = ["actor_id", "actor_kind", "audit_actor_id", "runtime_actor_id"];

async function resolveRuntimeContext(ports: McpRuntimeContextPorts, callContext: McpToolCallContext): Promise<string> {
  const host = ports.requireHost(callContext);
  // A later resolve must never keep using an earlier in-process answer.
  ports.connection.clear(false);
  return ports.catalogs.withCatalog(host.homeDirectory, (catalog) => {
    return ports.presentResolution(
      catalog.resolveRuntimeContext(host.runtimeContext, host.projectSuggestionClues),
      host,
    );
  });
}

async function listRuntimeProjects(ports: McpRuntimeContextPorts, callContext: McpToolCallContext): Promise<string> {
  const host = ports.requireHost(callContext);
  return ports.catalogs.withCatalog(host.homeDirectory, (catalog) => {
    const current = catalog.resolveRuntimeContext(host.runtimeContext, host.projectSuggestionClues);
    if (current.status !== "bound") {
      ports.connection.clear();
    }
    return JSON.stringify(
      {
        context: current.context,
        status: current.status,
        reason: current.reason,
        next_action: current.next_action,
        current_project: current.project,
        suggested_projects: current.suggested_projects,
        projects: catalog.listProjects().map((project) => ({
          project_id: project.project_id,
          display_name: project.display_name,
          source: project.source,
        })),
      },
      null,
      2,
    );
  });
}

/** The schemas name no actor: a caller that still sends one is told so instead of being recorded as it asked. */
function refuseIdentity(ports: McpRuntimeContextPorts, arguments_: Record<string, unknown>): void {
  const named = IDENTITY_FIELDS.filter(field => Object.hasOwn(arguments_, field));
  if (named.length) {
    throw ports.createError("mcp.unexpected_field", `不能使用未许可字段：${named.join("、")}。操作者由宿主从 MCP 客户端与当前 Session 取得，参数里不要带身份`, { fields: named });
  }
}

/** Named tool conversions over the Host's public catalog scope; no binding algorithm or Store. */
export function createMcpRuntimeContextHandlers(ports: McpRuntimeContextPorts) {
  async function rejectRuntimeContextSuggestion(
    arguments_: Record<string, unknown>,
    callContext: McpToolCallContext,
  ): Promise<string> {
    refuseIdentity(ports, arguments_);
    const host = ports.requireHost(callContext);
    const actorId = ports.actorFor(host, callContext);
    return ports.catalogs.withCatalog(host.homeDirectory, (catalog) => {
      const result = catalog.rejectRuntimeContextSuggestion({
        context: host.runtimeContext,
        project_id: typeof arguments_.project_id === "string" ? arguments_.project_id : "",
        actor_id: actorId,
        user_confirmed: arguments_.user_confirmed === true,
        suggestion_clues: host.projectSuggestionClues ?? [],
      });
      // A rejection only applies while unbound. Do not let an earlier process
      // connection survive a new suggestion-first routing decision.
      ports.connection.clear();
      return JSON.stringify(result, null, 2);
    });
  }

  async function bindRuntimeContext(
    arguments_: Record<string, unknown>,
    callContext: McpToolCallContext,
  ): Promise<string> {
    refuseIdentity(ports, arguments_);
    const host = ports.requireHost(callContext);
    const actorId = ports.actorFor(host, callContext);
    return ports.catalogs.withCatalog(host.homeDirectory, (catalog) => {
      const resolution = catalog.bindRuntimeContext({
        context: host.runtimeContext,
        project_id: typeof arguments_.project_id === "string" ? arguments_.project_id : "",
        actor_id: actorId,
        user_confirmed: arguments_.user_confirmed === true,
        rebind_confirmed: arguments_.rebind_confirmed === true,
        binding_scope: arguments_.binding_scope === "workspace_default" || arguments_.binding_scope === "session"
          ? arguments_.binding_scope
          : undefined,
      });
      return ports.presentResolution(resolution, host, true);
    });
  }

  async function unbindRuntimeContext(
    arguments_: Record<string, unknown>,
    callContext: McpToolCallContext,
  ): Promise<string> {
    refuseIdentity(ports, arguments_);
    const host = ports.requireHost(callContext);
    const actorId = ports.actorFor(host, callContext);
    return ports.catalogs.withCatalog(host.homeDirectory, (catalog) => {
      const result = catalog.unbindRuntimeContext({
        context: host.runtimeContext,
        actor_id: actorId,
        user_confirmed: arguments_.user_confirmed === true,
        binding_scope: arguments_.binding_scope === "workspace" ? "workspace" : "session",
        project_id: typeof arguments_.project_id === "string" ? arguments_.project_id : undefined,
      });
      ports.connection.clear();
      return JSON.stringify(result, null, 2);
    });
  }

  async function createAndBindRuntimeContext(
    arguments_: Record<string, unknown>,
    callContext: McpToolCallContext,
  ): Promise<string> {
    refuseIdentity(ports, arguments_);
    const host = ports.requireHost(callContext);
    const actorId = ports.actorFor(host, callContext);
    return ports.catalogs.withCatalog(host.homeDirectory, async (catalog) => {
      const resolution = await catalog.createProjectAndBindRuntimeContext({
        context: host.runtimeContext,
        display_name: typeof arguments_.display_name === "string" ? arguments_.display_name : "",
        actor_id: actorId,
        user_confirmed: arguments_.user_confirmed === true,
        rebind_confirmed: arguments_.rebind_confirmed === true,
        binding_scope: arguments_.binding_scope === "workspace_default" || arguments_.binding_scope === "session"
          ? arguments_.binding_scope
          : undefined,
        idempotency_key: typeof arguments_.idempotency_key === "string" ? arguments_.idempotency_key : "",
      });
      return ports.presentResolution(resolution, host, true);
    });
  }

  async function deleteRuntimeProject(
    arguments_: Record<string, unknown>,
    callContext: McpToolCallContext,
  ): Promise<string> {
    refuseIdentity(ports, arguments_);
    const host = ports.requireHost(callContext);
    const result = await ports.deleteProject({
      project_id: typeof arguments_.project_id === "string" ? arguments_.project_id : "",
      delete_confirmed: arguments_.delete_confirmed === true,
      idempotency_key: typeof arguments_.idempotency_key === "string" ? arguments_.idempotency_key : "",
    }, host, callContext);
    await ports.catalogs.withCatalog(host.homeDirectory, (catalog) => {
      if (catalog.resolveRuntimeContext(host.runtimeContext, host.projectSuggestionClues).status !== "bound") {
        ports.connection.clear();
      }
    });
    return JSON.stringify(result, null, 2);
  }

  return {
    molis_work_v1_context_resolve: (_arguments_: Record<string, unknown>, context: McpToolCallContext) => resolveRuntimeContext(ports, context),
    molis_work_v1_context_list_projects: (_arguments_: Record<string, unknown>, context: McpToolCallContext) => listRuntimeProjects(ports, context),
    molis_work_v1_context_reject_suggestion: (arguments_: Record<string, unknown>, context: McpToolCallContext) => rejectRuntimeContextSuggestion(arguments_, context),
    molis_work_v1_context_bind: (arguments_: Record<string, unknown>, context: McpToolCallContext) => bindRuntimeContext(arguments_, context),
    molis_work_v1_context_unbind: (arguments_: Record<string, unknown>, context: McpToolCallContext) => unbindRuntimeContext(arguments_, context),
    molis_work_v1_context_create_and_bind: (arguments_: Record<string, unknown>, context: McpToolCallContext) => createAndBindRuntimeContext(arguments_, context),
    molis_work_v1_project_delete: (arguments_: Record<string, unknown>, context: McpToolCallContext) => deleteRuntimeProject(arguments_, context),
  };
}
