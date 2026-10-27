import { GoalEventConfigRecords } from "./event-facts-config-records.js";
import { GoalEventRequirementRecords } from "./event-facts-requirement-records.js";
import { GoalWorkEventRecords } from "./event-facts-work-event-records.js";
import type { GoalsSqliteDatabase } from "./repository.js";

/** The Goal event facts' three table families, each read and written by its own class. */
export class GoalEventFactsRepository {
  readonly config: GoalEventConfigRecords;
  readonly requirements: GoalEventRequirementRecords;
  readonly workEvents: GoalWorkEventRecords;

  constructor(db: GoalsSqliteDatabase) {
    this.config = new GoalEventConfigRecords(db);
    this.requirements = new GoalEventRequirementRecords(db);
    this.workEvents = new GoalWorkEventRecords(db);
  }
}
