import type { HostCapabilityDefinition } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { GoalEventApplication } from "./goal-event-application.js";

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

export const recordGoalUserDecisionCapability = {
  capability_id: "io.molis.work.goals.events.decide",
  version: 1,
  operation: "command",
  host_only: true,
} as HostCapabilityDefinition<
  Parameters<GoalEventEntryApi["recordTrustedDecision"]>[0],
  ReturnType<GoalEventEntryApi["recordTrustedDecision"]>
>;
