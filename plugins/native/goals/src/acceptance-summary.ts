import type { AcceptanceSubject, AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import type { GoalAcceptanceReading, GoalEventStateView } from "./contract/goals.js";

/**
 * A Goal's requirements as the platform has them (`acceptance.read@1`), seen from Goals (contract-design §10.3). The Goal page shows it and
 * opens the platform's own review card for anything more; Goals draws no control that accepts or returns a requirement.
 */
export interface GoalAcceptanceSummary extends GoalAcceptanceReading {
  subject: AcceptanceSubject;
  counts: AcceptanceView["counts"];
  /** Requirements Goals hung on this Goal that the platform does not list: hanging them failed or was cut short (「要求未挂上」). */
  unhung: string[];
  /** The outcome was replaced after the person last accepted a requirement; the requirements were left as they were (§10.9 question 3). */
  outcome_changed_after_acceptance: boolean;
  /** The Goal is completed, and not every requirement is met any more; it stays completed until the person reopens it (§10.9 question 6). */
  changed_after_completion: boolean;
}

/** What a Goals command stands on: the round, whether everything is met, and each requirement's words and state. */
export function acceptanceReading(view: AcceptanceView): GoalAcceptanceReading {
  return {
    round: view.round,
    complete: view.complete,
    requirements: view.requirements.map(({ id, statement, requires_person, person, satisfied }) => ({ id, statement, requires_person, person, satisfied })),
  };
}

export function goalAcceptanceSummary(state: GoalEventStateView, view: AcceptanceView): GoalAcceptanceSummary {
  const listed = new Set(view.requirements.map(requirement => requirement.id));
  const accepted = view.requirements.flatMap(requirement => requirement.decision?.decision === "accepted" ? [requirement.decision.decided_at] : [])
    .sort().at(-1);
  return {
    ...acceptanceReading(view),
    subject: view.subject,
    counts: view.counts,
    unhung: state.requirements.map(link => link.requirement_id).filter(id => !listed.has(id)),
    outcome_changed_after_acceptance: accepted !== undefined && state.agreement.version > 1 && state.agreement.updated_at !== null
      && state.agreement.updated_at > accepted,
    changed_after_completion: state.work_status === "completed" && view.requirements.length > 0 && !view.complete,
  };
}
