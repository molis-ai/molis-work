import type { RuntimeProjectCatalogProvider, RuntimeProjectConnectionState, MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkRuntimeContextResolution } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { McpToolCallContext } from "./protocol.js";

export interface McpRuntimeContextPorts {
  catalogs: RuntimeProjectCatalogProvider;
  connection: RuntimeProjectConnectionState;
  requireHost(context: McpToolCallContext): MolisWorkRuntimeContextHost;
  presentResolution(resolution: MolisWorkRuntimeContextResolution, host: MolisWorkRuntimeContextHost, reconcileLegacy?: boolean): Promise<string>;
}

/** Named tool conversions over the Host's public catalog scope; no binding algorithm or Store. */
export function createMcpRuntimeContextHandlers(ports: McpRuntimeContextPorts) {
  async function resolveRuntimeContext(callContext: McpToolCallContext): Promise<string> {
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

  async function listRuntimeProjects(callContext: McpToolCallContext): Promise<string> {
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
            board_id: project.board_id,
            source: project.source,
          })),
        },
        null,
        2,
      );
    });
  }

  async function rejectRuntimeContextSuggestion(
    arguments_: Record<string, unknown>,
    callContext: McpToolCallContext,
  ): Promise<string> {
    const host = ports.requireHost(callContext);
    return ports.catalogs.withCatalog(host.homeDirectory, (catalog) => {
      const result = catalog.rejectRuntimeContextSuggestion({
        context: host.runtimeContext,
        project_id: typeof arguments_.project_id === "string" ? arguments_.project_id : "",
        actor_id: typeof arguments_.actor_id === "string" ? arguments_.actor_id : "",
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
    const host = ports.requireHost(callContext);
    return ports.catalogs.withCatalog(host.homeDirectory, (catalog) => {
      const resolution = catalog.bindRuntimeContext({
        context: host.runtimeContext,
        project_id: typeof arguments_.project_id === "string" ? arguments_.project_id : "",
        actor_id: typeof arguments_.actor_id === "string" ? arguments_.actor_id : "",
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
    const host = ports.requireHost(callContext);
    return ports.catalogs.withCatalog(host.homeDirectory, (catalog) => {
      const result = catalog.unbindRuntimeContext({
        context: host.runtimeContext,
        actor_id: typeof arguments_.actor_id === "string" ? arguments_.actor_id : "",
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
    const host = ports.requireHost(callContext);
    return ports.catalogs.withCatalog(host.homeDirectory, async (catalog) => {
      const resolution = await catalog.createProjectAndBindRuntimeContext({
        context: host.runtimeContext,
        display_name: typeof arguments_.display_name === "string" ? arguments_.display_name : "",
        actor_id: typeof arguments_.actor_id === "string" ? arguments_.actor_id : "",
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
    const host = ports.requireHost(callContext);
    return ports.catalogs.withCatalog(host.homeDirectory, async (catalog) => {
      const result = await catalog.deleteProject({
        project_id: typeof arguments_.project_id === "string" ? arguments_.project_id : "",
        actor_id: typeof arguments_.actor_id === "string" ? arguments_.actor_id : "",
        delete_confirmed: arguments_.delete_confirmed === true,
        idempotency_key: typeof arguments_.idempotency_key === "string" ? arguments_.idempotency_key : "",
      });
      if (catalog.resolveRuntimeContext(host.runtimeContext, host.projectSuggestionClues).status !== "bound") {
        ports.connection.clear();
      }
      return JSON.stringify(result, null, 2);
    });
  }

  return {
    molis_work_v1_context_resolve: (_arguments_: Record<string, unknown>, context: McpToolCallContext) => resolveRuntimeContext(context),
    molis_work_v1_context_list_projects: (_arguments_: Record<string, unknown>, context: McpToolCallContext) => listRuntimeProjects(context),
    molis_work_v1_context_reject_suggestion: (arguments_: Record<string, unknown>, context: McpToolCallContext) => rejectRuntimeContextSuggestion(arguments_, context),
    molis_work_v1_context_bind: (arguments_: Record<string, unknown>, context: McpToolCallContext) => bindRuntimeContext(arguments_, context),
    molis_work_v1_context_unbind: (arguments_: Record<string, unknown>, context: McpToolCallContext) => unbindRuntimeContext(arguments_, context),
    molis_work_v1_context_create_and_bind: (arguments_: Record<string, unknown>, context: McpToolCallContext) => createAndBindRuntimeContext(arguments_, context),
    molis_work_v1_project_delete: (arguments_: Record<string, unknown>, context: McpToolCallContext) => deleteRuntimeProject(arguments_, context),
  };
}
