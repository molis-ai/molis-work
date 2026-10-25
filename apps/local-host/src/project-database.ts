import { catalogErrors } from "./project-catalog-contract.js";
import { applySqliteBaseline, LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { createGoalReadServices } from "@molis-ai/molis-work-plugin-goals/module";
import { createGovernanceReadServices, governanceSqlite } from "@molis-ai/molis-work-plugin-goals/governance";
import type { GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { readMolisWorkSnapshot, type BoardSnapshot, type MolisWorkSnapshotPorts } from "@molis-ai/molis-work-plugin-goals";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";
import { openProjectPluginDatabases, type ProjectPluginDatabaseOutcome } from "./project-plugin-databases.js";

/** A project database recovery cannot open: gone, or at another schema version than this build's baseline. */


/**
 * One local connection at the project database baseline, with the built-in plugins' own tables opened on it, and public read
 * services for a Project. Recovery (`existingOnly`) opens a library already at this version and leaves its plugins' tables as
 * they are.
 */
export class LocalProjectDatabase extends LocalSqliteStorage {
  readonly goalsQuery: GoalsQueryApi;
  /** What happened to each built-in plugin's tables when this library opened; a refused one stops only that plugin. */
  readonly pluginDatabases: ReadonlyMap<string, ProjectPluginDatabaseOutcome>;
  private readonly snapshotQueries: MolisWorkSnapshotPorts;

  constructor(path: string, options: { existingOnly?: boolean } = {}) {
    super(options.existingOnly ? inspectExistingDatabase(path) : path, { fileMustExist: options.existingOnly });
    try {
      if (!options.existingOnly) applySqliteBaseline(this.db, path, PROJECT_DATABASE_BASELINE);
      this.pluginDatabases = options.existingOnly ? new Map() : openProjectPluginDatabases(this.db, path);
      const goals = createGoalReadServices(this.db, this);
      const governance = createGovernanceReadServices(governanceSqlite(this.db), this);
      this.goalsQuery = goals.query;
      this.snapshotQueries = { goals: goals.query, governance: governance.query };
    } catch (error) { this.close(); throw error; }
  }

  snapshot(projectId: string): BoardSnapshot {
    return readMolisWorkSnapshot(this.snapshotQueries, projectId);
  }
}

/** Recovery opens only a database already at this build's version, and changes nothing before it knows. */
function inspectExistingDatabase(path: string): string {
  const inspection = new LocalSqliteStorage(path, { readonly: true });
  try {
    const { user_version: version } = inspection.db.prepare("PRAGMA user_version").get() as { user_version: number };
    if (version !== PROJECT_DATABASE_BASELINE.version) throw catalogErrors.project_recovery_unsupported_schema("catalog.project_recovery_unsupported_schema");
    return path;
  } finally { inspection.close(); }
}
