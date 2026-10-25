import { actionReachesAudience, type ActionAvailability, type ActionReference, type ActionRegistryPort } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectSettingsCapabilities, type ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import type { pluginActions } from "./plugin-actions.js";

type Read<T> = () => T | Promise<T>;
type ProjectSettings = {
  workspaces: Read<readonly ProjectWorkspaceRef[]>;
  browsingWorkspace: Read<ProjectWorkspaceRef | null>;
  runtime: Read<string | null>;
};
const registered = new WeakSet<ActionRegistryPort>();

/** FULL35-FIXTURE-01/02: opt in to actual settings actions on the project's own registry, with live readers. */
export function registerProjectWorkspaceActions(actions: { registry: ActionRegistryPort; project_id: string }, read: ProjectSettings) {
  if (!registered.has(actions.registry)) {
    actions.registry.registerProvider({ provider: { provider_id: "project-settings-fixture", title: "项目设置", kind: "system", project_id: actions.project_id },
      definitions: [projectSettingsCapabilities.workspaces, projectSettingsCapabilities.browsingWorkspace, projectSettingsCapabilities.runtime],
      handlers: [
        { ...projectSettingsCapabilities.workspaces, handle: () => read.workspaces() },
        { ...projectSettingsCapabilities.browsingWorkspace, handle: () => read.browsingWorkspace() },
        { ...projectSettingsCapabilities.runtime, handle: () => read.runtime() },
      ] });
    registered.add(actions.registry);
  }
  return { workspacesFor: async () => await read.workspaces() };
}

/** Standalone ActionService fixtures use the registered descriptor and its real availability, including provider and project scope. */
export function withProjectWorkspaceActions<H extends { actions: ReturnType<typeof pluginActions>; projectId: string }>(host: H, read: ProjectSettings) {
  const ports = registerProjectWorkspaceActions(host.actions, read);
  return { ...host, ...ports, dependencyCheck: (reference: ActionReference): ActionAvailability => {
    const registry = host.actions.registry.registry, definition = registry.descriptor(reference, host.projectId);
    if (!definition || (reference.provider_id && reference.provider_id !== definition.action_provider?.provider_id)) {
      return { available: false, code: "actions.dependency_missing", reason: "Fixture action is not registered for this project and provider" };
    }
    const action = definition.action && actionReachesAudience(definition.action, definition.capability_id, "plugin") ? definition.action : undefined;
    return registry.availability({ actor_id: "local-host", project_id: host.projectId, audience: action ? "plugin" : "user", permissions: action ? [...action.permissions] : [] }, definition);
  } };
}
