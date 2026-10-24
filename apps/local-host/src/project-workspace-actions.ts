import { hostErrors } from "./host-errors.js";
import { ActionError, type ActionCallContext, type ActionHandlerBinding, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectWorkspaceActions as a } from "@molis-ai/molis-work-contracts/modules/projects";
import { normalizeRuntimeWorkContext, type MolisWorkProjectCatalog } from "./project-catalog.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

export const PROJECT_WORKSPACE_PROVIDER_ID = "system.project-workspaces";

/** The Home catalog owner the platform injected at startup; project folders are kept there. */
type ProjectCatalogOwner = () => { home: string; run: LocalWebCatalogRunner } | undefined;

const normalize = (canonicalPath: string) => normalizeRuntimeWorkContext({ runtime_id: "molis-work-web", stable_work_context_id: null,
  host_declares_stable: false, workspace: { canonical_path: canonicalPath, realpath_verified: false } }).workspace;

/** A folder this project lists, and whether it is linked to this project. */
interface ProjectWorkspaceActionRecord { id: string; path: string; projectLinked: boolean }

/**
 * Adding, repairing and unlinking a project folder. These are project settings, not a Plugin's: they stay available
 * whichever Plugins the project enables. They change only the catalog's folder relations, never the folder itself.
 */
export function projectWorkspaceActionProvider(projectId: string, catalogOwner: ProjectCatalogOwner): ActionProviderRegistration {
  const owner = (caller: ActionCallContext) => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "调用不属于当前项目");
    const catalog = catalogOwner();
    if (!catalog) throw new ActionError("actions.service_unavailable", "项目目录服务尚未装配");
    return catalog;
  };
  const withCatalog = <Result>(catalog: ReturnType<typeof owner>, operation: (value: MolisWorkProjectCatalog) => Result | Promise<Result>) =>
    catalog.run({ homeDirectory: catalog.home }, operation);
  /** The folder as the project page lists it: its catalog entry. */
  const current = async (catalog: ReturnType<typeof owner>, workspaceId: string): Promise<ProjectWorkspaceActionRecord> => {
    const listed = await withCatalog(catalog, value => value.listWorkspaceDirectory(projectId));
    const hit = listed.find(workspace => workspace.workspace_id === workspaceId);
    if (hit) return { id: hit.workspace_id, path: hit.canonical_path, projectLinked: hit.project_ids.includes(projectId) };
    throw hostErrors.workspace_not_found("找不到当前 Project 的这条工作目录");
  };

  const handlers: ActionHandlerBinding[] = [
    { ...a.add, handle: async (caller, value) => {
      const input = value as { workspace_path: string };
      const catalog = owner(caller);
      await caller.beforeEffect();
      // Offered to the local user only; that audience is what stands for the person's confirmation.
      return { workspace: await withCatalog(catalog, value => value.commit(() => value.addWorkspaceProject({ canonical_path: input.workspace_path.trim(), project_id: projectId,
        actor_id: caller.actor_id, user_confirmed: caller.audience === "user" }), () => caller.beforeEffect())) };
    } },
    { ...a.repair, handle: async (caller, value) => {
      const input = value as { workspace_id: string; workspace_path: string };
      const catalog = owner(caller);
      const folder = await current(catalog, input.workspace_id);
      const next = normalize(input.workspace_path.trim());
      if (!next) throw new ActionError("actions.input_invalid", "新的工作目录必须是绝对路径");
      await caller.beforeEffect();
      const change = { canonical_path: next.canonical_path, project_id: projectId, actor_id: caller.actor_id, user_confirmed: true };
      return { workspace: await withCatalog(catalog, value => value.commit(() => folder.projectLinked
        ? value.repairWorkspaceProject({ ...change, workspace_id: folder.id })
        : value.addWorkspaceProject(change), () => caller.beforeEffect())) };
    } },
    { ...a.unlink, handle: async (caller, value) => {
      const input = value as { workspace_id: string };
      const catalog = owner(caller);
      const folder = await current(catalog, input.workspace_id);
      await caller.beforeEffect();
      if (folder.projectLinked) await withCatalog(catalog, value => value.commit(() => value.removeWorkspaceMembership({ workspace_id: folder.id,
        project_id: projectId, actor_id: caller.actor_id, user_confirmed: true }), () => caller.beforeEffect()));
      return { changed: folder.projectLinked };
    } },
  ];
  return { provider: { provider_id: PROJECT_WORKSPACE_PROVIDER_ID, title: "项目工作目录", kind: "system", project_id: projectId },
    definitions: Object.values(a), handlers,
    availability: () => catalogOwner() ? { available: true } : { available: false, code: "actions.service_unavailable", reason: "项目目录服务尚未装配" } };
}
