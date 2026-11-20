import { goalErrors } from "./errors.js";
import type { GoalAcceptanceReading, GoalRequirementLink } from "../contract/goals.js";
import type { GoalEventFactsRepository } from "./event-facts-repository.js";

/**
 * One current requirement of a Goal as a command weighs it: what the platform's acceptance says of it (its words, whether it needs the
 * person, whether it is satisfied) and the event types Goals bound to it. The platform lists every current requirement, those the person
 * added on the requirement column too; Goals adds only the bindings (contract-design §10.3).
 */
export interface GoalRequirementTerm {
  requirement_id: string;
  statement: string;
  human_decision_required: boolean;
  bound_type_ids: string[];
  satisfied: boolean;
  /** The person's word on it on the platform: `returned` when they turned it down. */
  returned: boolean;
}

export function readGoalRequirementLinks(records: GoalEventFactsRepository, projectId: string, goalId: string): GoalRequirementLink[] {
  return records.requirements.listLinks(projectId, goalId);
}

/**
 * The Goal's requirements as the reading Goals' own handler took just before the command, with Goals' bindings. A command that needs
 * them and was given no reading is refused: it cannot know what it would commit to.
 */
export function goalRequirementTerms(records: GoalEventFactsRepository, projectId: string, goalId: string, reading: GoalAcceptanceReading | undefined): GoalRequirementTerm[] {
  if (!reading) throw goalErrors["goals.event_requirement.unread"]("读不到这个 Goal 在平台上的要求，没有记下任何东西");
  const bindings = records.requirements.listBindings(projectId, goalId);
  return reading.requirements.map((item) => ({
    requirement_id: item.id,
    statement: item.statement,
    human_decision_required: item.requires_person,
    bound_type_ids: bindings.filter((binding) => binding.requirement_id === item.id).map((binding) => binding.type_id).sort(),
    satisfied: item.satisfied,
    returned: item.person === "returned",
  }));
}
