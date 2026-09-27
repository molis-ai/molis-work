import { ActionError, type ActionCallContext, type ActionExecutionContext, type ActionHandlerBinding, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectWorkspaceActions as a } from "@molis-ai/molis-work-contracts/modules/projects";
import { MolisWorkWorkspaceActionError, repairProjectWorkspace, sessionWorkspaceId, unlinkProjectWorkspace, type ProjectWorkspaceActionRecord } from "@molis-ai/molis-work-plugin-work";
import { normalizeRuntimeWorkContext } from "./project-catalog.js";
import type { SessionRuntimeService } from "./session-runtime-resources.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

/** The Home catalog owner the platform injected at startup; project folders are kept there. */
export type ProjectCatalogOwner = () => { home: string; run: LocalWebCatalogRunner } | undefined;

const normalize = (canonicalPath: string) => normalizeRuntimeWorkContext({ runtime_id: "molis-work-web", stable_work_context_id: null,
  host_declares_stable: false, workspace: { canonical_path: canonicalPath, realpath_verified: false } }).workspace;

/**
 * Adding, repairing and unlinking a project folder. These are project settings, not a Plugin's: they stay available
 * whichever Plugins the project enables. Repair and unlink also move the sessions that used the folder, and roll back together.
 */
export function projectWorkspaceActionProvider(projectId: string, sessions: SessionRuntimeService, catalogOwner: ProjectCatalogOwner): ActionProviderRegistration {
  const owner = (caller: ActionCallContext) => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "调用不属于当前项目");
    const catalog = catalogOwner();
    if (!catalog) throw new ActionError("actions.service_unavailable", "项目目录服务尚未装配");
    return catalog;
  };
  const withCatalog = <Result>(catalog: ReturnType<typeof owner>, operation: Parameters<LocalWebCatalogRunner>[1] extends (value: infer Catalog) => unknown ? (value: Catalog) => Result : never) =>
    catalog.run({ homeDirectory: catalog.home }, operation);
  /** The folder as the project page lists it: its catalog entry, or the path this project's sessions use. */
  const current = async (catalog: ReturnType<typeof owner>, workspaceId: string): Promise<ProjectWorkspaceActionRecord> => {
    const listed = await withCatalog(catalog, value => value.listWorkspaceDirectory(projectId));
    const hit = listed.find(workspace => workspace.workspace_id === workspaceId);
    if (hit) return { id: hit.workspace_id, path: hit.canonical_path, projectLinked: hit.project_ids.includes(projectId) };
    for (const session of (await sessions.resources()).registry.list({ project_id: projectId })) {
      const normalized = session.workspace_path ? normalize(session.workspace_path) : null;
      if (!normalized || listed.some(workspace => workspace.canonical_path === normalized.canonical_path)) continue;
      if (sessionWorkspaceId(normalized.canonical_path, normalize) === workspaceId) return { id: workspaceId, path: normalized.canonical_path, projectLinked: false };
    }
    throw new ActionError("projects.workspace_not_found", "找不到当前 Project 的这条工作目录");
  };
  const changing = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
    try { return await operation(); }
    catch (error) { throw error instanceof MolisWorkWorkspaceActionError ? new ActionError(error.code, error.message) : error; }
  };
  const handlers: ActionHandlerBinding[] = [
    { ...a.add, handle: async (caller, value) => {
      const input = value as { workspace_path: string };
      const catalog = owner(caller);
      await (caller as ActionExecutionContext).beforeEffect?.();
      // Offered to the local user only; that audience is what stands for the person's confirmation.
      return { workspace: await withCatalog(catalog, value => value.addWorkspaceProject({ canonical_path: input.workspace_path.trim(), project_id: projectId,
        actor_id: caller.actor_id, user_confirmed: caller.audience === "user" })) };
    } },
    { ...a.repair, handle: async (caller, value) => {
      const input = value as { workspace_id: string; workspace_path: string };
      const catalog = owner(caller);
      const folder = await current(catalog, input.workspace_id);
      const next = normalize(input.workspace_path.trim());
      if (!next) throw new ActionError("actions.input_invalid", "新的工作目录必须是绝对路径");
      const { registry } = await sessions.resources();
      await (caller as ActionExecutionContext).beforeEffect?.();
      const result = await changing(() => withCatalog(catalog, value => repairProjectWorkspace({ catalog: value, registry, current: folder, canonicalPath: next.canonical_path, projectId, actorId: caller.actor_id })));
      return { workspace: result.workspace, updated_session_count: result.sessions.length };
    } },
    { ...a.unlink, handle: async (caller, value) => {
      const input = value as { workspace_id: string };
      const catalog = owner(caller);
      const folder = await current(catalog, input.workspace_id);
      const { registry } = await sessions.resources();
      await (caller as ActionExecutionContext).beforeEffect?.();
      const result = await changing(() => withCatalog(catalog, value => unlinkProjectWorkspace({ catalog: value, registry, current: folder, projectId, actorId: caller.actor_id })));
      return { changed: result.changed, updated_session_count: result.sessions.length };
    } },
  ];
  return { provider: { provider_id: "system.project-workspaces", title: "项目工作目录", kind: "system", project_id: projectId },
    definitions: Object.values(a), handlers,
    availability: () => catalogOwner() ? { available: true } : { available: false, code: "actions.service_unavailable", reason: "项目目录服务尚未装配" } };
}
