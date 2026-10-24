import { createGoalsActionHandlers, goalsManifest, goalsActions, GOALS_ACTION_PERMISSIONS, GOALS_PLUGIN_ID, hostEventDecisionAuthority, managementEventDecisionAuthority, managementTreeAuthority } from "@molis-ai/molis-work-plugin-goals";
import { ActionError, pinActionSubject, pinnableSubjectKinds, type ActionProviderRegistration, type ActionClient, type ActionCallContext, type ActionDefinition, type BoundActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { artifactTypeDeclarations } from "@molis-ai/molis-work-app-workbench";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import { projectPluginDatabaseRefusal } from "./project-plugin-databases.js";
import { pluginActionProvider } from "./plugin-action-provider.js";
import { resolvePlanningMethodPacks } from "@molis-ai/molis-work-module-goals";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import type { PlanningMethodPack, ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";

/** Permissions of the owners' pin actions: the local person handing in a deliverable pins with each owner's own permissions (A5). */
const pinPermissions = () => [...new Set([...artifactTypeDeclarations().values()].flatMap(declaration => declaration.pin?.action.permissions ?? []))];

/** Goals' assembly for one opened project; 2026-10-18 改: S9 turns this into the plugin's own start(). */
export function goalsActionProvider(runtime: MolisWorkProjectRuntime, personalMethods: () => readonly PlanningMethodPack[], client: ActionClient): ActionProviderRegistration {
  // A refused Goals stops alone (PLIB-14): the catch-up would read the tables the platform refused, so it waits until they are put right.
  if (!projectPluginDatabaseRefusal(runtime.store.db, GOALS_PLUGIN_ID)) runtime.coordinator.projectOpened(runtime.project_id);
  return { provider: { provider_id: goalsManifest.plugin_id, plugin_id: goalsManifest.plugin_id,
    title: goalsManifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: goalsManifest.actions!.filter(definition => definition.action.scope === "project"), handlers: createGoalsActionHandlers({ events: runtime.coordinator.goalEvents, acknowledgements: runtime.coordinator.goalAcknowledgements, projectId: runtime.project_id,
      board: { initializeBoard: input => runtime.coordinator.initializeBoard(input) },
      collection: { snapshot: projectId => runtime.store.snapshot(projectId), events: projectId => runtime.store.readEventsDescending(projectId),
        goals: runtime.coordinator.goalQueries, inputs: runtime.coordinator.goalInputs, eventWork: runtime.coordinator.goalEvents },
      readGoal: goalId => runtime.coordinator.goalQueries.getGoal(runtime.project_id, goalId),
      readContract: goalId => runtime.coordinator.goalQueries.readGoalContract(runtime.project_id, goalId),
      deliverables: { readArtifact: reference => runtime.artifacts.query.getArtifactVersion(runtime.project_id, reference),
        ledger: createContextLedger(runtime.store.db, { authorize: access => access.scope.kind === "personal" && access.scope.id === runtime.project_id }),
        pin: async (caller, subject) => (await pinActionSubject(client, caller, subject)).artifact, pinnableKinds: caller => pinnableSubjectKinds(client, caller) },
      history: {
      snapshot: () => runtime.store.snapshot(runtime.project_id), journalEvents: () => runtime.store.readEventsDescending(runtime.project_id),
    }, planning: { planning: runtime.coordinator.goals.planning, baseMethods: () => resolvePlanningMethodPacks(personalMethods()) },
    guidance: { commands: runtime.coordinator.goals.commands, read: projectId => runtime.coordinator.goalQueries.readProjectGuidance(projectId) },
    lifecycle: { lifecycle: runtime.coordinator.goals.lifecycle, setActiveGoal: (...args) => runtime.coordinator.setActiveGoal(...args),
      eventCursor: () => runtime.store.eventCursor(runtime.project_id) },
    configuration: { commands: runtime.coordinator.goals.commands, query: runtime.store.goalsQuery, eventCursor: () => runtime.store.eventCursor(runtime.project_id) },
    tree: { submitGoalTreeProposal: input => runtime.coordinator.goalTreeSubmission.submitGoalTreeProposal(input),
      listGoalTreeProposals: query => runtime.coordinator.goalTree.listGoalTreeProposals(query),
      checkGoalTreeProposal: input => runtime.coordinator.goalTreeCheck.checkGoalTreeProposal(input),
      decideGoalTreeProposal: input => runtime.coordinator.goalTreeDecision.decideGoalTreeProposal(input) } }) };
}

/** Called only after the local Web request's origin/control-token checks. */
export function bindGoalsWebActions(client: ActionClient, reference: LocalHostProjectReference): BoundActionClient {
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user",
    project_id: reference.project_id, permissions: GOALS_ACTION_PERMISSIONS };
  return {
    discover: async () => client.discover(caller),
    async invoke<Input, Output>(definition: ActionDefinition<Input, Output>, input: Input): Promise<Output> {
      if ([goalsActions.relationAdd.capability_id, goalsActions.relationDeactivate.capability_id, goalsActions.policySave.capability_id].includes(definition.capability_id)) {
        const key = String((input as { idempotency_key?: string }).idempotency_key ?? "");
        return await client.invoke({ ...caller, user_action: { source: "web", conversation_ref: `web:${reference.project_id}`,
          message_ref: `web:${definition.capability_id}:${key}` } }, definition, input) as Output;
      }
      if (definition.capability_id === goalsActions.treeDecide.capability_id) {
        const payload = input as { idempotency_key?: string; confirm_all_pending?: boolean };
        return await client.invoke({ ...caller, user_action: { source: "web", conversation_ref: `web:${reference.project_id}`,
          message_ref: `web-decision:${payload.idempotency_key ?? ""}`, whole_confirmation_prompted: payload.confirm_all_pending === true } }, definition, input) as Output;
      }
      if ([goalsActions.deliverablesPin.capability_id, goalsActions.deliverablesCandidates.capability_id, goalsActions.artifactInputsPin.capability_id].includes(definition.capability_id)) {
        return await client.invoke({ ...caller, permissions: [...new Set([...caller.permissions, ...pinPermissions()])] }, definition, input) as Output;
      }
      if (definition.capability_id !== goalsActions.decide.capability_id) return await client.invoke(caller, definition, input) as Output;
      const authority = hostEventDecisionAuthority("web", reference.project_id, caller.actor_id, String((input as { idempotency_key?: unknown }).idempotency_key ?? ""));
      return await client.invoke({ ...caller, user_action: { source: authority.authority_source,
        conversation_ref: authority.conversation_ref, message_ref: authority.message_ref } }, definition, input) as Output;
    },
  };
}

/**
 * The project's confirmed guidance, read by the Host for the project layer of a Run or an Assistant turn. It is a read of one Goals
 * action as the person on this machine, with nothing else granted. A project whose Goals is removed or whose guidance cannot be
 * read refuses it, and the caller starts without the layer.
 */
export async function readProjectGuidance(client: ActionClient, reference: LocalHostProjectReference): Promise<ProjectGuidanceView> {
  const read = goalsActions.guidanceRead;
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: reference.project_id, permissions: read.action.permissions };
  return await invokeOneProvider(client, caller, read, {});
}

/**
 * Calls `definition` as `caller` on its one provider in the project's directory (BL-501): the Host names no plugin of its own; it pins the
 * provider it found, and the call reaches that provider and no other. None, or more than one, refuses with a code and calls nothing.
 */
async function invokeOneProvider<Input, Output>(client: ActionClient, caller: ActionCallContext, definition: ActionDefinition<Input, Output>, input: Input): Promise<Output> {
  const provider_id = await pluginActionProvider(client, caller, definition);
  return await client.invoke({ ...caller, allowed_actions: [{ capability_id: definition.capability_id, version: definition.version, provider_id }] },
    { ...definition, provider_id }, input) as Output;
}

/** What a management entry can do: Goals' actions as the person on this machine, origin management. */
export interface GoalsManagementActions {
  readonly project_id: string;
  /** `evidence` is for the two decisions only: the conversation and message a decision came from, never who made it. */
  invoke<Input, Output>(definition: ActionDefinition<Input, Output>, input: Input, evidence?: unknown): Promise<Output>;
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

/** The provenance a management call stores, in the format those entries have always recorded; the Host fixes the source and who acts. */
function managementUserAction(projectId: string, capabilityId: string, input: unknown, evidence: unknown): NonNullable<ActionCallContext["user_action"]> {
  const named = (input as { idempotency_key?: unknown } | null | undefined)?.idempotency_key;
  const key = typeof named === "string" && named ? named : capabilityId;
  if (capabilityId === goalsActions.treeDecide.capability_id) {
    const authority = managementTreeAuthority(projectId, key, evidence);
    return { source: "management", conversation_ref: authority.conversation_ref, message_ref: authority.message_ref,
      ...(authority.whole_confirmation_prompted ? { whole_confirmation_prompted: true } : {}),
      ...(authority.prompted_proposal_id ? { prompted_subject_id: authority.prompted_proposal_id } : {}) };
  }
  if (capabilityId === goalsActions.decide.capability_id) {
    const authority = managementEventDecisionAuthority(projectId, key, evidence);
    return { source: "management", conversation_ref: authority.conversation_ref, message_ref: authority.message_ref };
  }
  if (evidence !== undefined) throw new ActionError("actions.input_invalid", "只有结构提案和事件决定带出处");
  return { source: "management", conversation_ref: `management:${projectId}`, message_ref: `management:${key}` };
}

/**
 * The caller of a management entry (a `molis-work v1` command; the management-audience MCP), built by the Host after the entry's own
 * check and never by the entry: the person on this machine, origin management, one Goals action at a time with that action's own
 * permissions and nothing else pinned. The input names no one (an identity in the arguments of a write is refused first, in the words
 * the typed door used), and the entry cannot say who acts or through which entry it came. The
 * call number belongs to the operation the entry opened, which the kernel reads; it is not made here. Give it the client that does
 * not prepare the project's plugins (`actionClient(reference, false)`): Goals is registered when the project opens.
 */
export function bindGoalsManagementActions(client: ActionClient, reference: LocalHostProjectReference, transport: { signal?: AbortSignal } = {}): GoalsManagementActions {
  const projectId = reference.project_id;
  return {
    project_id: projectId,
    async invoke<Input, Output>(definition: ActionDefinition<Input, Output>, input: Input, evidence?: unknown): Promise<Output> {
      const refused = MANAGEMENT_REFUSED_IDENTITY[definition.capability_id];
      if (refused && typeof input === "object" && input !== null) refusePayloadIdentity(input, refused);
      return await invokeOneProvider(client, { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: projectId,
        permissions: definition.action.permissions, ...(transport.signal ? { signal: transport.signal } : {}),
        user_action: managementUserAction(projectId, definition.capability_id, input, evidence) }, definition, input);
    },
  };
}

/** The existing CLI/MCP management action subset, resolved against the owner's definitions and exact version. */
export function managementActionDefinition(reference: { capability_id: string; version: number }): ActionDefinition | undefined {
  return [goalsActions.initialize, goalsActions.active, goalsActions.snapshot, goalsActions.treeSubmit,
    goalsActions.treeRead, goalsActions.treeCheck, goalsActions.treeDecide, goalsActions.decide]
    .find(entry => entry.capability_id === reference.capability_id && entry.version === reference.version);
}
