import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityDefinition } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { GoalEventTrustedAuthority, RecordGoalUserDecisionInput } from "@molis-ai/molis-work-contracts/modules/goals";
import { hostEventDecisionAuthority, type GoalEventApplication } from "./goal-event-application.js";
import { evidenceText, managementEvidence } from "./management-evidence.js";

/** Management writes take no caller identity. The host records the person on this machine. */
type WithoutActor<T> = Omit<T, "actor_id" | "actor_kind">;

/**
 * The two typed event entries that still have a caller in the product: the first-run setup that creates the first Goal
 * (`web-onboarding`) and the management MCP's recorded decision. Every other event read and write of Goals is a registered
 * action (`goalsActions`); a test that needs to write as the person on this machine calls that action as a management caller.
 */
export interface GoalEventEntryApi {
  createIntent: GoalEventApplication["createIntent"];
  recordTrustedDecision: GoalEventApplication["recordTrustedDecision"];
}

// Both writes are management entries, so each is `host_only`: the person on this machine is recorded as the writer, and a plugin
// that lists one under capabilities.consumes is refused (`actions.host_only`) instead of being recorded as that person. A plugin
// writes through a registered action, which takes its identity from the call context. tests/goal-management-identity.test.ts
// fails when a typed event write is exported without the flag.
export const createGoalIntentCapability = {
  capability_id: "io.molis.work.goals.events.create-intent",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  WithoutActor<Parameters<GoalEventEntryApi["createIntent"]>[0]>,
  ReturnType<GoalEventEntryApi["createIntent"]>
>;

/**
 * The conversation a management decision came from. It does not say who decides or through which entry: the Host builds the
 * authority (the person on this machine, origin management) and refuses an `actor_id`, `actor_kind` or `authority_source` carried
 * here (`managementEventDecisionAuthority`). Without it the decision points at the management entry itself.
 */
export type GoalEventDecideEvidence = Partial<Pick<GoalEventTrustedAuthority, "conversation_ref" | "message_ref">>;

/**
 * What the Host entry takes to record the person's decision. It names no one, the structure decision's way: the domain method
 * (`recordTrustedDecision`) takes a full `authority`, and here that is only evidence.
 */
export type GoalEventDecideEntryInput = Omit<RecordGoalUserDecisionInput, "authority"> & { authority?: GoalEventDecideEvidence };

export const recordGoalUserDecisionCapability = {
  capability_id: "io.molis.work.goals.events.decide",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  GoalEventDecideEntryInput,
  ReturnType<GoalEventEntryApi["recordTrustedDecision"]>
>;

/**
 * The Host builds the authority of an event decision taken at a management entry (the typed Host client and the management
 * MCP), the way `managementTreeAuthority` does for a structure decision: the person on this machine, origin management. The
 * caller may point at the conversation the decision came from; who decides is refused when the caller names it
 * (repository-anti-corruption §9.5 #6). The defaults are the references this entry has always recorded.
 */
export function managementEventDecisionAuthority(projectId: string, idempotencyKey: string, evidence?: unknown): GoalEventTrustedAuthority {
  const given = managementEvidence(evidence, "goals.event_decision_authority_invalid");
  const fixed = hostEventDecisionAuthority("management", projectId, LOCAL_PERSON_ACTOR_ID, idempotencyKey);
  return { ...fixed, conversation_ref: evidenceText(given.conversation_ref) ?? fixed.conversation_ref,
    message_ref: evidenceText(given.message_ref) ?? fixed.message_ref };
}
