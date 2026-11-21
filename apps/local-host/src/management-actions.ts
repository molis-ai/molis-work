import { ActionError, type ActionClient, type ActionCallContext, type ActionDefinition, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { entryUserAction } from "./entry-user-action.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

interface ManagementActionEntry {
  readonly provider_id: string;
  readonly definition: ActionDefinition;
  readonly refused_identity_fields?: readonly string[];
}

/** An action as a management entry names it: by id and version, as the action directory lists it. The Host finds the definition. */
export type ManagementActionReference = Pick<ActionDefinition, "capability_id" | "version">;

/** What a management entry can do: registered actions as the person on this machine, origin management. */
export interface ManagementActions {
  readonly project_id: string;
  /** The protected project review service issues decision provenance. */
  invoke<Output = unknown>(reference: ManagementActionReference, input: object, evidence?: unknown): Promise<Output>;
  /** The business fields the action's input declares, from its definition; what a tool built over it may accept. */
  fields(reference: ManagementActionReference): readonly string[];
}

/** The host decides who writes (the person on this machine, or a plugin's own call context); the arguments carry no identity. */
export function refusePayloadIdentity(input: object, more: readonly string[] = []): void {
  const named = ["actor_id", "actor_kind", ...more].filter(field => Object.hasOwn(input, field));
  if (named.length) {
    throw new ActionError("actions.input_invalid", `写入者由宿主确定（管理入口是本机这个人，插件取自调用上下文），参数里不能带 ${named.join("、")}`);
  }
}

function managementUserAction(projectId: string, capabilityId: string, input: unknown, evidence: unknown): NonNullable<ActionCallContext["user_action"]> {
  const named = (input as { idempotency_key?: unknown } | null | undefined)?.idempotency_key;
  const id = typeof named === "string" && named ? named : capabilityId;
  if (evidence !== undefined) throw new ActionError("actions.input_invalid", "操作出处由当前管理入口提供");
  return entryUserAction("management", projectId, { id });
}

function findManagementEntry(reference: ManagementActionReference): ManagementActionEntry | undefined {
  for (const registration of PLATFORM_PLUGIN_REGISTRATIONS) {
    const declared = registration.management_actions?.find(
      item => item.capability_id === reference.capability_id && item.version === reference.version,
    );
    if (!declared) continue;
    const definition = registration.manifest.actions?.find(
      action => action.capability_id === reference.capability_id && action.version === reference.version,
    );
    if (!definition) continue;
    return {
      provider_id: registration.manifest.plugin_id,
      definition,
      ...(declared.refused_identity_fields !== undefined ? { refused_identity_fields: declared.refused_identity_fields } : {}),
    };
  }
  return undefined;
}

/**
 * Calls `definition` as `caller` on the exact built-in provider from the generated registry (BL-501). A third-party installation
 * registering the same capability id while the built-in plugin is absent must not receive management calls.
 */
async function invokeRegistered<Output>(client: ActionClient, caller: ActionCallContext, entry: ManagementActionEntry, input: unknown): Promise<Output> {
  const { provider_id, definition } = entry;
  return await client.invoke({ ...caller, allowed_actions: [{ capability_id: definition.capability_id, version: definition.version, provider_id }] },
    { ...definition, provider_id }, input) as Output;
}

/**
 * The caller of a management entry (the management-audience MCP), built by the Host after the entry's own check and never by the
 * entry: the person on this machine, origin management, one action at a time with that action's own permissions and exact provider.
 */
export function bindManagementActions(client: ActionClient, reference: LocalHostProjectReference, transport: { signal?: AbortSignal } = {}): ManagementActions {
  const projectId = reference.project_id;
  return {
    project_id: projectId,
    async invoke<Output = unknown>(actionReference: ManagementActionReference, input: object, evidence?: unknown): Promise<Output> {
      const entry = findManagementEntry(actionReference);
      if (!entry) throw new ActionError("actions.dependency_missing", "这个管理动作或版本不可用");
      return await invokeRegistered<Output>(client, managementContext(projectId, actionReference, input, evidence, transport.signal), entry, input);
    },
    fields: managementInputFields,
  };
}

/** The same identity/evidence refusal runs before starting a resident and at its actual management dispatch. */
export function managementContext(projectId: string, reference: ManagementActionReference, input: unknown, evidence?: unknown, signal?: AbortSignal): ActionCallContext {
  const entry = findManagementEntry(reference);
  if (entry?.refused_identity_fields !== undefined && typeof input === "object" && input !== null) {
    refusePayloadIdentity(input, entry.refused_identity_fields);
  }
  // The owner definition includes platform-service permissions; a transport cannot manufacture an extra grant.
  const registered = requireManagementDefinition(reference);
  return { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: projectId,
    permissions: registered.action.permissions, ...(signal ? { signal } : {}),
    user_action: managementUserAction(projectId, reference.capability_id, input, evidence) };
}

/** The existing MCP management action subset, resolved dynamically from plugin registrations. */
export function managementActionDefinition(reference: ManagementActionReference): ActionDefinition | undefined {
  return findManagementEntry(reference)?.definition;
}

/** The business fields the management action's input declares, in the order its schema lists them. */
export function managementInputFields(reference: ManagementActionReference): readonly string[] {
  return Object.keys((requireManagementDefinition(reference).action.input_schema.properties ?? {}) as Record<string, unknown>);
}

/** The definition a management entry's reference names; one that is not declared for management is refused, whatever its caller holds. */
export function requireManagementDefinition(reference: ManagementActionReference): ActionDefinition {
  const definition = managementActionDefinition(reference);
  if (!definition) throw new ActionError("actions.dependency_missing", "这个管理动作或版本不可用");
  return definition;
}

export { bindManagementActions as bindGoalsManagementActions };
