import type {
  GoalEventExtraRequirementInput,
  GoalEventRequirementRevisionInput,
  GoalEventRequirementStatus,
  GoalEventScope,
  GoalEventSystemPayload,
  GoalRecord,
  GoalSystemWorkEventRecord,
} from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalEventCompletionContext } from "./event-state-completion.js";

export interface GoalEventStateHost {
  requireWritableGoal(projectId: string, goalId: string): GoalRecord;
  actorKind(kind: "user" | "runtime" | undefined): "user" | "runtime" | null;
  configVersion(projectId: string, goalId: string): number;
  readCurrentRequirements(projectId: string, goalId: string): GoalEventRequirementStatus[];
  applyAgreementChange(input: {
    actor_id: string;
    new_requirements: GoalEventExtraRequirementInput[];
    revise_requirements: GoalEventRequirementRevisionInput[];
    retire_requirement_ids: string[];
    expire_requirement_ids: string[];
    journal_seq: number;
  }, goal: GoalRecord): void;
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
  requireLocalScope(goal: GoalRecord, raw?: Partial<GoalEventScope>): GoalEventScope;
  assertConfigVersion(goal: GoalRecord, expected: number): void;
  assertAgreementVersion(goal: GoalRecord, expected: number, code: string): void;
  error: (code: string, message: string, details?: Record<string, unknown>) => Error;
}
