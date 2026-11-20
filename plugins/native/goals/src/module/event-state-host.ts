import type {
  GoalAcceptanceReading,
  GoalEventScope,
  GoalRequirementLink,
  GoalEventSystemPayload,
  GoalRecord,
  GoalSystemWorkEventRecord,
} from "../contract/goals.js";
import type { GoalEventCompletionContext } from "./event-state-completion.js";
import type { GoalRequirementTerm } from "./event-facts-requirements.js";

export interface GoalEventStateHost {
  requireWritableGoal(projectId: string, goalId: string): GoalRecord;
  actorKind(kind: "user" | "runtime" | undefined): "user" | "runtime" | null;
  configVersion(projectId: string, goalId: string): number;
  /** The requirements Goals hung on the Goal (its own record). */
  requirementLinks(projectId: string, goalId: string): GoalRequirementLink[];
  /** The Goal's requirements as the platform had them in `reading`, with Goals' bindings; refused without a reading. */
  requirementTerms(projectId: string, goalId: string, reading: GoalAcceptanceReading | undefined): GoalRequirementTerm[];
  readCompletionContext(projectId: string, goalId: string): GoalEventCompletionContext;
}

export interface GoalEventStateCore {
  mutate<T extends { event_id: string; observed_event_cursor: number; recorded: true }>(
    input: { project_id: string; goal_id: string; actor_id: string; actor_kind?: "user" | "runtime"; idempotency_key: string },
    operation: string,
    hash: string,
    write: (goal: GoalRecord, actorKind: "user" | "runtime" | null) => T,
  ): T & { replayed: boolean };
  insertSystem(
    goal: GoalRecord,
    actorId: string,
    actorKind: "user" | "runtime" | null,
    title: string,
    payload: GoalEventSystemPayload,
  ): GoalSystemWorkEventRecord;
  requireOwnedWritable(projectId: string, goalId: string): GoalRecord;
  /** The scope as named, each event, concern and requirement checked to be this Goal's; a requirement by the platform's `reading`. */
  requireLocalScope(goal: GoalRecord, raw: Partial<GoalEventScope> | undefined, reading: GoalAcceptanceReading | undefined): GoalEventScope;
  assertConfigVersion(goal: GoalRecord, expected: number): void;
  assertAgreementVersion(goal: GoalRecord, expected: number, code: "goals.event_closure.stale_version" | "goals.event_agreement.stale_version"): void;
}
