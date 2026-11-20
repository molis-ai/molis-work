import { createHash } from "node:crypto";
import type { CreateGoalIntentRequirementInput, GoalHungRequirement } from "./contract/goals.js";

/**
 * The requirements a createIntent request hangs on the platform's acceptance, in its order. An id not given is derived from the Goal and
 * the requirement's place, so a replay of the same request hangs the very same list again (contract-design §10.3).
 */
export function goalIntentRequirements(goalId: string, requirements: readonly CreateGoalIntentRequirementInput[] | undefined): GoalHungRequirement[] {
  return (requirements ?? []).map((requirement, index) => ({
    requirement_id: requirement.requirement_id?.trim() || `req-${createHash("sha256").update(`${goalId}\u0000${index}`).digest("hex").slice(0, 16)}`,
    statement: requirement.statement.trim(),
    human_decision_required: requirement.human_decision_required === true,
  }));
}
