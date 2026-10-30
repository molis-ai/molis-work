import type { IncomingMessage } from "node:http";
import { evidenceText, goalsActions, GOALS_PLUGIN_ID, managementEvidence } from "@molis-ai/molis-work-plugin-goals";
import { ActionError, type ActionClient, type ActionCallContext, type ActionDefinition, type BoundActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { entryUserAction, webEntryMessage } from "./entry-user-action.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
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

/** What the Host reads of a project's guidance: whether there is any, which revision it is at, and the text a Run starts with. */
export interface ProjectGuidanceFacts {
  readonly entries: readonly unknown[];
  readonly revisions: readonly unknown[];
  readonly runtime_prompt_prefix: string;
}

/**
 * The project's confirmed guidance, read by the Host for the project layer of a Run or an Assistant turn. It is a read of one Goals
 * action as the person on this machine, with nothing else granted. A project whose Goals is removed or whose guidance cannot be
 * read refuses it, and the caller starts without the layer.
 */
export async function readProjectGuidance(client: ActionClient, reference: LocalHostProjectReference): Promise<ProjectGuidanceFacts> {
  const read = goalsActions.guidanceRead;
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: reference.project_id, permissions: read.action.permissions };
  return await invokeGoals<ProjectGuidanceFacts>(client, caller, read, {});
}

/**
 * Calls `definition` as `caller` on the Goals that ships with the Host, pinned exactly (BL-501). These calls carry the person's decision
 * (management) or put what they read into prompts (guidance), and a capability id belongs to no publisher (R-45): a third-party
 * installation that registered `goals.*` while Goals is away must not receive them. The provider id `GOALS_PLUGIN_ID` is one only the Host
 * assigns (`plugin-entry-identity.ts`), so the dispatcher refuses any other provider before a handler runs, and records the call like any
 * other (a cancellation while it waits is settled there). Accepting a trusted publisher's installation instead is ac-trust's (BL-555 onwards).
 */
async function invokeGoals<Output>(client: ActionClient, caller: ActionCallContext, definition: ActionDefinition, input: unknown): Promise<Output> {
  const provider_id = GOALS_PLUGIN_ID;
  return await client.invoke({ ...caller, allowed_actions: [{ capability_id: definition.capability_id, version: definition.version, provider_id }] },
    { ...definition, provider_id }, input) as Output;
}

/** A Goals action as a management entry names it: by id and version, as the action directory lists it. The Host finds the definition. */
export type GoalsActionReference = Pick<ActionDefinition, "capability_id" | "version">;

/**
 * Goals' actions as the Host's own callers hold them, with their input and output types. The Host reaches Goals here and in no other file
 * (PG-031); what a transport entry (the command line, the MCP) calls it names by id and version through `GoalsManagementActions`.
 */
export const goalsHostActions = {
  initialize: goalsActions.initialize, create: goalsActions.create, guidanceRead: goalsActions.guidanceRead,
  directoryItem: goalsActions.directoryItem, list: goalsActions.list, state: goalsActions.state,
} as const;
export { readGoalResumeFacts } from "@molis-ai/molis-work-plugin-goals/contract";

/** What a management entry can do: Goals' actions as the person on this machine, origin management. */
export interface GoalsManagementActions {
  readonly project_id: string;
  /** `evidence` is for the two decisions only: the conversation and message a decision came from, never who made it. */
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

/**
 * Besides `actor_id` and `actor_kind`, the identity fields a management entry's arguments may not carry for each write that takes an
 * identity from the Host, refused in these words before the authority is built: the entry came through a typed capability that said
 * so, and the command line's wire keeps it. An action not listed here has no such rule (its contract refuses what it does not know).
 */
const MANAGEMENT_REFUSED_IDENTITY: Readonly<Record<string, readonly string[]>> = {
  [goalsActions.treeSubmit.capability_id]: ["submitted_session_id"],
  [goalsActions.treeCheck.capability_id]: [],
  [goalsActions.treeDecide.capability_id]: ["audit_actor_id", "runtime_actor_id"],
  [goalsActions.decide.capability_id]: [],
};

/** What a management entry's evidence may not carry, and the refusal code of the door it came through (the command line's wire keeps them). */
const EVIDENCE_REFUSAL: Readonly<Record<string, string>> = {
  [goalsActions.treeDecide.capability_id]: "goals.goal_tree_proposal.authority_source_invalid",
  [goalsActions.decide.capability_id]: "goals.event_decision_authority_invalid",
};

/**
 * The provenance a management call stores: the entry names itself, the project and the command's key, and passes on the evidence the
 * command was given (the conversation and message a decision came from, whether the person was asked to confirm the whole proposal).
 * Only the two decisions take evidence; the Host fixes the source and who acts, so evidence that names either is refused first.
 */
function managementUserAction(projectId: string, capabilityId: string, input: unknown, evidence: unknown): NonNullable<ActionCallContext["user_action"]> {
  const named = (input as { idempotency_key?: unknown } | null | undefined)?.idempotency_key;
  const id = typeof named === "string" && named ? named : capabilityId;
  const code = EVIDENCE_REFUSAL[capabilityId];
  if (!code) {
    if (evidence !== undefined) throw new ActionError("actions.input_invalid", "只有结构提案和事件决定带出处");
    return entryUserAction("management", projectId, { id });
  }
  const given = managementEvidence(evidence, code);
  const conversation_ref = evidenceText(given.conversation_ref), message_ref = evidenceText(given.message_ref);
  const confirmation = capabilityId === goalsActions.treeDecide.capability_id ? { whole_confirmation_prompted: given.whole_confirmation_prompted === true, prompted_subject_id: evidenceText(given.prompted_proposal_id) } : {};
  return entryUserAction("management", projectId, { id, ...(conversation_ref ? { conversation_ref } : {}), ...(message_ref ? { message_ref } : {}), ...confirmation });
}

/**
 * The caller of a management entry (a `molis-work v1` command; the management-audience MCP), built by the Host after the entry's own
 * check and never by the entry: the person on this machine, origin management, one Goals action at a time with that action's own
 * permissions and nothing else pinned. The input names no one (an identity in the arguments of a write is refused first, in the words
 * the typed door used), and the entry cannot say who acts or through which entry it came. The
 * call number belongs to the operation the entry opened, which the kernel reads; it is not made here. Give it the project's
 * client (`actionClient(reference)`): Goals is a plugin of the project, which that client starts.
 */
export function bindGoalsManagementActions(client: ActionClient, reference: LocalHostProjectReference, transport: { signal?: AbortSignal } = {}): GoalsManagementActions {
  const projectId = reference.project_id;
  return {
    project_id: projectId,
    async invoke<Output = unknown>(reference: GoalsActionReference, input: object, evidence?: unknown): Promise<Output> {
      return await invokeGoals<Output>(client, goalsManagementContext(projectId, reference, input, evidence, transport.signal),
        requireManagementDefinition(reference), input);
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

/** The existing CLI/MCP management action subset, resolved against the owner's definitions and exact version. */
export function managementActionDefinition(reference: GoalsActionReference): ActionDefinition | undefined {
  return [goalsActions.initialize, goalsActions.active, goalsActions.snapshot, goalsActions.treeSubmit,
    goalsActions.treeRead, goalsActions.treeCheck, goalsActions.treeDecide, goalsActions.decide]
    .find(entry => entry.capability_id === reference.capability_id && entry.version === reference.version);
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
