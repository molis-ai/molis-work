import { defineWorkExecutorActions, WORK_EXECUTOR_ROLES, type ActionDefinition, type ActionView, type WorkExecutorRole } from "@molis-ai/molis-work-contracts/platform/actions";

// A plugin that is not Coding and speaks the work-executor protocol v1 (specs/repository-anti-corruption PG-036, C8-3): the six role
// actions at ids of its own, which the Assistant finds by their types and never by the ids or the plugin's name.

/** The modes such an executor offers in its `state`. */
export const EXECUTOR_MODES = [{ id: "discuss", title: "讨论" }, { id: "plan", title: "规划" }, { id: "execute", title: "执行" }];

/** The six role declarations under `<prefix>.<role>` (a prefix is also the provider id of `roleViews`), for subject kind `kind`. */
export function roleDefinitions(prefix: string, kind: string, permissions: readonly string[] = []): ActionDefinition[] {
  const options = (role: WorkExecutorRole) => ({ capability_id: `${prefix}.${role}`, title: role, description: `${prefix} ${role}`, permissions, subject_kinds: [kind] });
  const defined = defineWorkExecutorActions(Object.fromEntries(WORK_EXECUTOR_ROLES.map(role => [role, options(role)])) as Parameters<typeof defineWorkExecutorActions>[0]);
  return WORK_EXECUTOR_ROLES.map(role => defined[role] as ActionDefinition);
}

/** The role named by a capability id of a provider, or the id itself when the prefix is not its. */
export const roleOfCapability = (prefix: string, capabilityId: string): WorkExecutorRole => capabilityId.slice(prefix.length + 1) as WorkExecutorRole;

/** The directory rows a provider of the six roles leaves, as the person's client discovers them; `skip` leaves one role out. */
export function roleViews(pluginId: string, title: string, kind: string, skip?: WorkExecutorRole): ActionView[] {
  return roleDefinitions(pluginId, kind).filter(definition => roleOfCapability(pluginId, definition.capability_id) !== skip)
    .map((definition): ActionView => ({ capability_id: definition.capability_id, version: definition.version, operation: definition.operation, action: definition.action,
      provider: { provider_id: pluginId, kind: "plugin", title, plugin_id: pluginId }, availability: { available: true } }));
}
