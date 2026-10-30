import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

// Goals' actions as Coding calls them (PG-111): by id and version, with the fields Coding reads. What a Goal is belongs to Goals;
// `tests/goals-contract-ownership.test.ts` holds each handle here to the action Goals registers, so a change there shows up as a red test.

/**
 * The handle Coding calls a Goals action by: its id and version, whether it reads or writes, and the one permission Coding's Manifest
 * declares for that (`goals:read`, `goals:write`). It is not Goals' contract: the Host resolves the registered action from the id and
 * version, and runs that action's own schema, audience and permission checks, so nothing here is checked in its place.
 */
function consumed<Input, Output>(capability_id: string, version: number, operation: "query" | "command"): ActionDefinition<Input, Output> {
  return { capability_id, version, operation, action: { title: capability_id, description: `Goals action ${capability_id}, called by Coding`,
    kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["plugin"], subject_kinds: ["goal"], input_schema: { type: "object" },
    permissions: [operation === "query" ? "goals:read" : "goals:write"] } };
}

export const GOALS_ACTIONS = {
  list: consumed<{ limit: number; after_cursor?: string }, GoalDirectoryFacts>("goals.list", 1, "query"),
  contract: consumed<{ goal_id: string }, { goal: GoalFacts | null }>("goals.contract.read", 2, "query"),
  state: consumed<{ goal_id: string }, GoalStateFacts & { observed_event_cursor: number }>("goals.state.read", 1, "query"),
  progress: consumed<Record<string, unknown>, { event_id: string; replayed: boolean }>("goals.progress.record", 1, "command"),
  receipt: consumed<{ goal_id: string; idempotency_key: string }, { event_id: string; replayed: boolean } | null>("goals.progress.receipt", 1, "query"),
};

/** One page of the project's Goals: the ids and titles Coding shows, and where the next page starts. */
export interface GoalDirectoryFacts {
  goals: { goal_id: string; title: string }[];
  next_cursor: string | null;
  observed_event_cursor: number;
}

/** The Goal facts Coding checks before it pins a Goal; the rest of the record travels with them unread. */
export interface GoalFacts {
  goal_id: string;
  project_id: string;
  title: string;
  trashed_at?: string | null;
  archived_at?: string | null;
  [field: string]: unknown;
}

/** The Goal's current state as Coding reads it: whose it is, how far its events have come, and the agreement version. */
export interface GoalStateFacts {
  goal_id: string;
  project_id: string;
  goal_event_cursor: number;
  agreement: { version: number; [field: string]: unknown };
  [field: string]: unknown;
}

/** Read-only, scoped by the Host's project: the Goal and its state as they were when Coding pinned them. */
export interface GoalContextSnapshot {
  goal: GoalFacts;
  state: GoalStateFacts;
}
