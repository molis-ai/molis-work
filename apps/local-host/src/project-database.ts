import { applySqliteBaseline, LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { createGoalReadServices } from "@molis-ai/molis-work-module-goals";
import { createGovernanceReadServices } from "@molis-ai/molis-work-module-governance-collaboration";
import type { GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { readMolisWorkSnapshot, type BoardSnapshot, type MolisWorkSnapshotPorts } from "@molis-ai/molis-work-plugin-goals";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";

/** A project database recovery cannot open: gone, or at another schema version than this build's baseline. */
export class ProjectRecoveryError extends Error {
  constructor(readonly code: string) { super(code); }
}

/** One local connection at the project database baseline, and public read services for a Project. */
export class LocalProjectDatabase extends LocalSqliteStorage {
  readonly goalsQuery: GoalsQueryApi;
  private readonly snapshotQueries: MolisWorkSnapshotPorts;

  constructor(path: string, options: { existingOnly?: boolean } = {}) {
    super(options.existingOnly ? inspectExistingDatabase(path) : path, { fileMustExist: options.existingOnly });
    try {
      if (!options.existingOnly) applySqliteBaseline(this.db, path, PROJECT_DATABASE_BASELINE);
      const goals = createGoalReadServices(this.db);
      const governance = createGovernanceReadServices(this.db);
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
    if (version !== PROJECT_DATABASE_BASELINE.version) throw new ProjectRecoveryError("project_recovery_unsupported_schema");
    return path;
  } finally { inspection.close(); }
}
