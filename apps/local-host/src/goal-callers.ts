import type { IncomingMessage } from "node:http";
import { ActionError, type ActionClient, type ActionCallContext, type ActionDefinition, type BoundActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { entryUserAction, webEntryMessage } from "./entry-user-action.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import type { MolisWorkLocalHost } from "./project-host.js";

/**
 * The person at this machine's page, for one request, after the request's origin and control-token checks. Who may do what is the
 * request's authority snapshot (`localWebActionContext`: each action's declared permissions against the running installations' grants,
 * the owners' pin actions included), and where the act came from is the page entry's to say (`entryUserAction`): the request's key and
 * the whole-confirmation header, never the action's input.
 */
export function bindGoalsWebActions(host: MolisWorkLocalHost, reference: LocalHostProjectReference, request: IncomingMessage): BoundActionClient {
  const message = webEntryMessage(request);
  return bindLocalWebActions(host, reference, LOCAL_OWNER_PERMISSIONS, { user_action: () => entryUserAction("web", reference.project_id, message) });
}

interface RegisteredActionEntry {
  readonly provider_id: string;
  readonly definition: ActionDefinition;
}

function findRegisteredAction(capabilityId: string, version?: number): RegisteredActionEntry | undefined {
  for (const registration of PLATFORM_PLUGIN_REGISTRATIONS) {
    for (const action of registration.manifest.actions ?? []) {
      if (action.capability_id === capabilityId && (version === undefined || action.version === version)) {
        return { provider_id: registration.manifest.plugin_id, definition: action };
      }
    }
  }
  return undefined;
}

/** Look up an action definition from the generated built-in plugin registry without importing the plugin package. */
export function registeredHostAction<I = unknown, O = unknown>(capabilityId: string, version?: number): ActionDefinition<I, O> | undefined {
  return findRegisteredAction(capabilityId, version)?.definition as ActionDefinition<I, O> | undefined;
}

/**
 * Calls `definition` as `caller` on the exact built-in provider from the generated registry (BL-501). A third-party installation
 * registering the same capability id while the built-in plugin is absent must not receive management calls.
 */
async function invokeRegistered<Output>(client: ActionClient, caller: ActionCallContext, entry: RegisteredActionEntry, input: unknown): Promise<Output> {
  const { provider_id, definition } = entry;
  return await client.invoke({ ...caller, allowed_actions: [{ capability_id: definition.capability_id, version: definition.version, provider_id }] },
    { ...definition, provider_id }, input) as Output;
}

/** An action as a management entry names it: by id and version, as the action directory lists it. The Host finds the definition. */
export type GoalsActionReference = Pick<ActionDefinition, "capability_id" | "version">;

/** What a management entry can do: registered actions as the person on this machine, origin management. */
export interface GoalsManagementActions {
  readonly project_id: string;
  /** The protected project review service issues decision provenance. */
  invoke<Output = unknown>(reference: GoalsActionReference, input: object, evidence?: unknown): Promise<Output>;
  /** The business fields the action's input declares, from its definition; what a tool built over it may accept. */
  fields(reference: GoalsActionReference): readonly string[];
}

/** The host decides who writes (the person on this machine, or a plugin's own call context); the arguments carry no identity. */
export function refusePayloadIdentity(input: object, more: readonly string[] = []): void {
  const named = ["actor_id", "actor_kind", ...more].filter(field => Object.hasOwn(input, field));
  if (named.length) {
    throw new ActionError("actions.input_invalid", `写入者由宿主确定（管理入口是本机这个人，插件取自调用上下文），参数里不能带 ${named.join("、")}`);
  }
}

const MANAGEMENT_ACTION_IDS: ReadonlySet<string> = new Set([
  "goals.board.initialize",
  "goals.active.set",
  "goals.snapshot.read",
  "goals.tree.submit",
  "goals.tree.read",
  "goals.tree.check",
]);

/**
 * Besides `actor_id` and `actor_kind`, the identity fields a management entry's arguments may not carry for each write that takes an
 * identity from the Host, refused in these words before the authority is built.
 */
const MANAGEMENT_REFUSED_IDENTITY: Readonly<Record<string, readonly string[]>> = {
  "goals.tree.submit": ["submitted_session_id"],
  "goals.tree.check": [],
};

function managementUserAction(projectId: string, capabilityId: string, input: unknown, evidence: unknown): NonNullable<ActionCallContext["user_action"]> {
  const named = (input as { idempotency_key?: unknown } | null | undefined)?.idempotency_key;
  const id = typeof named === "string" && named ? named : capabilityId;
  if (evidence !== undefined) throw new ActionError("actions.input_invalid", "操作出处由当前管理入口提供");
  return entryUserAction("management", projectId, { id });
}

function findManagementEntry(reference: GoalsActionReference): RegisteredActionEntry | undefined {
  if (!MANAGEMENT_ACTION_IDS.has(reference.capability_id)) return undefined;
  return findRegisteredAction(reference.capability_id, reference.version);
}

/**
 * The caller of a management entry (the management-audience MCP), built by the Host after the entry's own check and never by the
 * entry: the person on this machine, origin management, one action at a time with that action's own permissions and exact provider.
 */
export function bindGoalsManagementActions(client: ActionClient, reference: LocalHostProjectReference, transport: { signal?: AbortSignal } = {}): GoalsManagementActions {
  const projectId = reference.project_id;
  return {
    project_id: projectId,
    async invoke<Output = unknown>(actionReference: GoalsActionReference, input: object, evidence?: unknown): Promise<Output> {
      const entry = findManagementEntry(actionReference);
      if (!entry) throw new ActionError("actions.dependency_missing", "这个管理动作或版本不可用");
      return await invokeRegistered<Output>(client, goalsManagementContext(projectId, actionReference, input, evidence, transport.signal), entry, input);
    },
    fields: managementInputFields,
  };
}

/** The same identity/evidence refusal runs before starting a resident and at its actual management dispatch. */
export function goalsManagementContext(projectId: string, reference: GoalsActionReference, input: unknown, evidence?: unknown, signal?: AbortSignal): ActionCallContext {
  const refused = MANAGEMENT_REFUSED_IDENTITY[reference.capability_id];
  if (refused && typeof input === "object" && input !== null) refusePayloadIdentity(input, refused);
  // The owner definition includes platform-service permissions; a transport cannot manufacture an extra grant.
  const registered = requireManagementDefinition(reference);
  return { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: projectId,
    permissions: registered.action.permissions, ...(signal ? { signal } : {}),
    user_action: managementUserAction(projectId, reference.capability_id, input, evidence) };
}

/** The existing MCP management action subset, resolved against the generated registry's definitions and exact version. */
export function managementActionDefinition(reference: GoalsActionReference): ActionDefinition | undefined {
  return findManagementEntry(reference)?.definition;
}

/** The business fields the management action's input declares, in the order its schema lists them. */
export function managementInputFields(reference: GoalsActionReference): readonly string[] {
  return Object.keys((requireManagementDefinition(reference).action.input_schema.properties ?? {}) as Record<string, unknown>);
}

/** The definition a management entry's reference names; one that is not in the subset above is refused, whatever its caller holds. */
export function requireManagementDefinition(reference: GoalsActionReference): ActionDefinition {
  const definition = managementActionDefinition(reference);
  if (!definition) throw new ActionError("actions.dependency_missing", "这个管理动作或版本不可用");
  return definition;
}
