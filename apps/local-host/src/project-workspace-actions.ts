import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { PROJECT_WORKSPACE_PROVIDER_ID, projectDirectoryActions as a, type DirectoryChange, type ProjectDirectories } from "@molis-ai/molis-work-contracts/modules/projects";
import type { MolisWorkProjectCatalog } from "./project-catalog.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

export { PROJECT_WORKSPACE_PROVIDER_ID };

/** The Home catalog owner the platform injected at startup; project folders are kept there. */
type ProjectCatalogOwner = () => { home: string; run: LocalWebCatalogRunner } | undefined;

/** Tells the project's plugins that its folder settings changed, with the folder it concerns (BL-521); called after the change is committed. */
export type WorkspaceSettingsAnnouncer = (workspaceId: string) => Promise<void>;

/** The folders a change concerns, so each one's readers look again: what was added or went, and every folder whose role changed. */
function touched(before: ProjectDirectories, after: ProjectDirectories): string[] {
  const roles = (directories: ProjectDirectories) => new Map(directories.directories.map(item => [item.workspace_id, `${item.roles.join(",")}:${item.canonical_path}`]));
  const links = (directories: ProjectDirectories) => new Map(directories.source_links.map(link => [link.source_workspace_id, link.workspace_id]));
  const old = roles(before), now = roles(after), ids = new Set<string>();
  for (const [id, value] of now) if (old.get(id) !== value) ids.add(id);
  for (const id of old.keys()) if (!now.has(id)) ids.add(id);
  const oldLinks = links(before), newLinks = links(after);
  for (const [source, target] of newLinks) if (oldLinks.get(source) !== target) { ids.add(target); const previous = oldLinks.get(source); if (previous) ids.add(previous); }
  for (const [source, target] of oldLinks) if (!newLinks.has(source)) ids.add(target);
  return [...ids];
}

/**
 * A project's inputs and output (specs/shared-sources-and-surfaces §3): `projects.directories.get@1` and its six changes. These are project
 * settings, not a Plugin's: they stay whichever Plugins the project enables, and change only the catalog's rows, never a folder. Each change
 * is committed from the revision the person read, after the call's authority is checked again (`beforeEffect`, inside the catalog commit).
 */
export function projectWorkspaceActionProvider(projectId: string, catalogOwner: ProjectCatalogOwner, announce: WorkspaceSettingsAnnouncer): ActionProviderRegistration {
  const owner = (caller: ActionCallContext) => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "调用不属于当前项目");
    const catalog = catalogOwner();
    if (!catalog) throw new ActionError("actions.service_unavailable", "项目目录服务尚未装配");
    return catalog;
  };
  const withCatalog = <Result>(caller: ActionCallContext, operation: (value: MolisWorkProjectCatalog) => Result | Promise<Result>) => {
    const catalog = owner(caller);
    return catalog.run({ homeDirectory: catalog.home }, operation);
  };
  /** One change: offered to the local user alone, the audience that stands for the person's confirmation. */
  const change = (definition: ActionDefinition<unknown, ProjectDirectories>, read: (input: Record<string, unknown>) => DirectoryChange): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version,
    handle: async (caller, value) => {
      const { expected_revision: expectedRevision, ...rest } = value as Record<string, unknown> & { expected_revision: string };
      await caller.beforeEffect();
      const { before, after } = await withCatalog(caller, catalog => catalog.commit(() => {
        const current = catalog.projectDirectories(projectId);
        return { before: current, after: catalog.changeDirectories({ project_id: projectId, actor_id: caller.actor_id, change: read(rest), expected_revision: expectedRevision }) };
      }, () => caller.beforeEffect()));
      for (const workspaceId of touched(before, after)) await announce(workspaceId);
      return after;
    },
  });
  const target = (input: Record<string, unknown>) => "workspace_id" in input ? { workspace_id: String(input.workspace_id) }
    : "workspace_path" in input ? { workspace_path: String(input.workspace_path) } : { default_output: true as const };
  const handlers: ActionHandlerBinding[] = [
    { ...a.get, handle: caller => withCatalog(caller, catalog => catalog.projectDirectories(projectId)) },
    change(a.addInput as ActionDefinition<unknown, ProjectDirectories>, input => ({ kind: "add_input", workspace_path: String(input.workspace_path) })),
    change(a.removeInput as ActionDefinition<unknown, ProjectDirectories>, input => ({ kind: "remove_input", workspace_id: String(input.workspace_id) })),
    change(a.setOutput as ActionDefinition<unknown, ProjectDirectories>, input => ({ kind: "set_output", target: target(input) })),
    change(a.repair as ActionDefinition<unknown, ProjectDirectories>, input => ({ kind: "repair", workspace_id: String(input.workspace_id), workspace_path: String(input.workspace_path) })),
    change(a.mapSource as ActionDefinition<unknown, ProjectDirectories>, input => {
      const { source_workspace_id: source, ...rest } = input;
      return { kind: "map_source", source_workspace_id: String(source), target: target(rest) };
    }),
    change(a.unmapSource as ActionDefinition<unknown, ProjectDirectories>, input => ({ kind: "unmap_source", source_workspace_id: String(input.source_workspace_id) })),
  ];
  return { provider: { provider_id: PROJECT_WORKSPACE_PROVIDER_ID, title: "项目工作目录", kind: "system", project_id: projectId },
    definitions: Object.values(a), handlers,
    availability: () => catalogOwner() ? { available: true } : { available: false, code: "actions.service_unavailable", reason: "项目目录服务尚未装配" } };
}
