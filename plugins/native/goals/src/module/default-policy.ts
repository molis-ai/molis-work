import type { GoalPolicy } from "../contract/goals.js";

/** The policy a project has before it saves one. A leaf of its own so the Goals page can read it without loading the query service. */
export const DEFAULT_GOAL_POLICY: GoalPolicy = { human_approval: false };
