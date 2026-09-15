import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { createGoalReadServices } from "@molis-ai/molis-work-module-goals";
import { createExecutionQueryApi } from "@molis-ai/molis-work-module-execution";
import { createEvidenceQueryApi } from "@molis-ai/molis-work-module-evidence-verification";
import { createGovernanceReadServices } from "@molis-ai/molis-work-module-governance-collaboration";
import type { GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { readMolisWorkSnapshot, type BoardSnapshot, type MolisWorkSnapshotPorts } from "@molis-ai/molis-work-plugin-goals";
import { migrateLocalProjectDatabase } from "./project-migrations.js";

/** One local connection, owner migrations and public read services for a Project. */
export class LocalProjectDatabase extends LocalSqliteStorage {
  readonly goalsQuery: GoalsQueryApi;
  private readonly snapshotQueries: MolisWorkSnapshotPorts;

  constructor(path: string) {
    super(path);
    migrateLocalProjectDatabase(this);
    const goals = createGoalReadServices(this.db);
    const governance = createGovernanceReadServices(this.db);
    this.goalsQuery = goals.query;
    this.snapshotQueries = {
      goals: goals.query, impacts: goals.impacts,
      execution: createExecutionQueryApi(this.db), evidence: createEvidenceQueryApi(this.db),
      governance: governance.query, clarification: governance.clarification,
    };
  }

  snapshot(boardId: string): BoardSnapshot {
    return readMolisWorkSnapshot(this.snapshotQueries, boardId);
  }
}
