import type { SqliteDatabase } from "./open-database.js";
import { SqliteResearchPlanRepository } from "./research-plan-repository.js";
import { SqliteResearchReportRepository } from "./research-report-repository.js";
import { SqliteResearchRunRepository } from "./research-run-repository.js";

/** The research tables, each family read and written by its own class. */
export class SqliteResearchRepository {
  readonly plans: SqliteResearchPlanRepository;
  readonly runs: SqliteResearchRunRepository;
  readonly reports: SqliteResearchReportRepository;

  constructor(database: SqliteDatabase) {
    this.plans = new SqliteResearchPlanRepository(database);
    this.runs = new SqliteResearchRunRepository(database);
    this.reports = new SqliteResearchReportRepository(database, this.runs);
  }
}
