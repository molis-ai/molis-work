import { createGoalsActionHandlers, goalsManifest, goalsActions, GOALS_ACTION_PERMISSIONS, hostEventDecisionAuthority } from "@molis-ai/molis-work-plugin-goals";
import type { ActionProviderRegistration, ActionClient, ActionCallContext, ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import { resolvePlanningMethodPacks } from "@molis-ai/molis-work-module-goals";
import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";

export function goalsActionProvider(runtime: MolisWorkProjectRuntime, personalMethods: () => readonly PlanningMethodPack[]): ActionProviderRegistration {
  return { provider: { provider_id: goalsManifest.plugin_id, plugin_id: goalsManifest.plugin_id,
    title: goalsManifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: goalsManifest.actions!.filter(definition => definition.action.scope === "project"), handlers: createGoalsActionHandlers({ events: runtime.coordinator.goalEvents, boardId: runtime.board_id,
      board: { immediate: operation => runtime.store.immediate(operation), query: runtime.store.goalsQuery,
        initializeBoard: input => runtime.coordinator.initializeBoard(input), commands: runtime.coordinator.goals.commands,
        adoptOwner: input => runtime.coordinator.goalEvents.adoptOwner(input) },
      collection: { snapshot: boardId => runtime.store.snapshot(boardId), events: boardId => runtime.store.readEventsDescending(boardId),
        goals: runtime.coordinator.goalQueries, inputs: runtime.coordinator.goalInputs, eventWork: runtime.coordinator.goalEvents,
        projectGoalLifecycle: (snapshot, goalId) => runtime.coordinator.projectGoalLifecycle(snapshot, goalId) },
      readGoal: goalId => runtime.coordinator.goalQueries.getGoal(runtime.board_id, goalId),
      readContract: goalId => runtime.coordinator.goalQueries.readGoalContract(runtime.board_id, goalId), history: {
      snapshot: () => runtime.store.snapshot(runtime.board_id), journalEvents: () => runtime.store.readEventsDescending(runtime.board_id),
    }, planning: { planning: runtime.coordinator.goals.planning, baseMethods: () => resolvePlanningMethodPacks(personalMethods()) },
    guidance: { commands: runtime.coordinator.goals.commands, read: boardId => runtime.coordinator.goalQueries.readProjectGuidance(boardId) },
    lifecycle: { lifecycle: runtime.coordinator.goals.lifecycle, setActiveGoal: (...args) => runtime.coordinator.setActiveGoal(...args),
      eventCursor: () => runtime.store.eventCursor(runtime.board_id) },
    configuration: { commands: runtime.coordinator.goals.commands, query: runtime.store.goalsQuery, eventCursor: () => runtime.store.eventCursor(runtime.board_id) },
    tree: { submitGoalTreeProposal: input => runtime.coordinator.goalTreeSubmission.submitGoalTreeProposal(input),
      listGoalTreeProposals: query => runtime.coordinator.goalTree.listGoalTreeProposals(query),
      checkGoalTreeProposal: input => runtime.coordinator.goalTreeCheck.checkGoalTreeProposal(input),
      decideGoalTreeProposal: input => runtime.coordinator.goalTreeDecision.decideGoalTreeProposal(input) } }) };
}

/** Called only after the local Web request's origin/control-token checks. */
export function bindGoalsWebActions(client: ActionClient, reference: LocalHostProjectReference): BoundActionClient {
  const caller: ActionCallContext = { actor_id: "web-user", actor_kind: "user", audience: "user",
    project_id: reference.project_id, permissions: GOALS_ACTION_PERMISSIONS };
  return {
    discover: async () => client.discover(caller),
    async invoke<Input, Output>(definition: ActionDefinition<Input, Output>, input: Input): Promise<Output> {
      if ([goalsActions.relationAdd.capability_id, goalsActions.relationDeactivate.capability_id, goalsActions.policySave.capability_id].includes(definition.capability_id)) {
        const key = String((input as { idempotency_key?: string }).idempotency_key ?? "");
        return await client.invoke({ ...caller, user_action: { source: "web", conversation_ref: `web:${reference.board_id}`,
          message_ref: `web:${definition.capability_id}:${key}` } }, definition, input) as Output;
      }
      if (definition.capability_id === goalsActions.treeDecide.capability_id) {
        const payload = input as { idempotency_key?: string; confirm_all_pending?: boolean };
        return await client.invoke({ ...caller, user_action: { source: "web", conversation_ref: `web:${reference.board_id}`,
          message_ref: `web-decision:${payload.idempotency_key ?? ""}`, whole_confirmation_prompted: payload.confirm_all_pending === true } }, definition, input) as Output;
      }
      if (definition.capability_id !== goalsActions.decide.capability_id) return await client.invoke(caller, definition, input) as Output;
      const authority = hostEventDecisionAuthority("web", reference.board_id, caller.actor_id, String((input as { idempotency_key?: unknown }).idempotency_key ?? ""));
      return await client.invoke({ ...caller, user_action: { source: authority.authority_source,
        conversation_ref: authority.conversation_ref, message_ref: authority.message_ref } }, definition, input) as Output;
    },
  };
}
