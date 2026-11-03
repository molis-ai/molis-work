import type { SqliteDatabase } from "./open-database.js";
import { SqlitePulseOpportunityRepository } from "./pulse-opportunity-repository.js";
import { SqlitePulseReportRepository } from "./pulse-report-repository.js";
import { SqlitePulseRunRepository } from "./pulse-run-repository.js";
import { SqlitePulseSourceRepository } from "./pulse-source-repository.js";

/** The pulse tables, each family read and written by its own class. */
export class SqlitePulseRepository {
  readonly sources: SqlitePulseSourceRepository;
  readonly runs: SqlitePulseRunRepository;
  readonly reports: SqlitePulseReportRepository;
  readonly opportunities: SqlitePulseOpportunityRepository;

  constructor(database: SqliteDatabase) {
    this.sources = new SqlitePulseSourceRepository(database);
    this.runs = new SqlitePulseRunRepository(database);
    this.reports = new SqlitePulseReportRepository(database);
    this.opportunities = new SqlitePulseOpportunityRepository(database);
  }
}
