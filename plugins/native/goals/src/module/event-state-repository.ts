import { GoalEventConcernRecords } from "./event-state-concern-records.js";
import { GoalEventDecisionRecords } from "./event-state-decision-records.js";
import { GoalEventOutcomeRecords } from "./event-state-outcome-records.js";
import { GoalEventOwnerRecords } from "./event-state-owner-records.js";
import type { GoalsSqliteDatabase } from "./repository.js";

/** The Goal event state's four table families, each written by its own class. */
export class GoalEventStateRepository {
  readonly owner: GoalEventOwnerRecords;
  readonly concerns: GoalEventConcernRecords;
  readonly decisions: GoalEventDecisionRecords;
  readonly outcomes: GoalEventOutcomeRecords;

  constructor(db: GoalsSqliteDatabase) {
    this.owner = new GoalEventOwnerRecords(db);
    this.concerns = new GoalEventConcernRecords(db);
    this.decisions = new GoalEventDecisionRecords(db);
    this.outcomes = new GoalEventOutcomeRecords(db);
  }
}
