import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GoalsRepository, type GoalsSqliteDatabase } from "@molis-ai/molis-work-module-goals";
import type { GoalRecord, GoalPolicy, PlanningMethodPack, ProjectGuidanceEntryRecord, ProjectGuidanceRevisionRecord } from "@molis-ai/molis-work-contracts/modules/goals";

/** Legacy root SDK read methods. Production runtimes use LocalProjectDatabase. */
export class SqliteMolisWorkStore extends LocalProjectDatabase {
  getGoal(goalId: string): GoalRecord | null {
    return new GoalsRepository(this.db as unknown as GoalsSqliteDatabase).getGoal(goalId);
  }

  listGoals(boardId: string): GoalRecord[] {
    return this.goalsQuery.listGoals(boardId);
  }

  listTrashedGoals(boardId: string): GoalRecord[] {
    return this.goalsQuery.listTrashedGoals(boardId);
  }

  listPlanningMethodPacks(boardId: string): PlanningMethodPack[] {
    return new GoalsRepository(this.db as unknown as GoalsSqliteDatabase)
      .listPlanningMethodPacks(boardId);
  }

  listProjectGuidanceEntries(boardId: string, includeInactive = false): ProjectGuidanceEntryRecord[] {
    return new GoalsRepository(this.db as unknown as GoalsSqliteDatabase)
      .listProjectGuidanceEntries(boardId, includeInactive);
  }

  listProjectGuidanceRevisions(boardId: string): ProjectGuidanceRevisionRecord[] {
    return new GoalsRepository(this.db as unknown as GoalsSqliteDatabase)
      .listProjectGuidanceRevisions(boardId);
  }

  activePolicyRows(boardId: string, goalId: string): Array<{
    scope: string;
    goal_id: string | null;
    policy: Partial<GoalPolicy>;
  }> {
    return new GoalsRepository(this.db as unknown as GoalsSqliteDatabase)
      .listActivePolicyBindings(boardId, goalId);
  }

  activePolicyRowsForBoard(boardId: string): Array<{
    scope: string;
    goal_id: string | null;
    policy: Partial<GoalPolicy>;
  }> {
    return new GoalsRepository(this.db as unknown as GoalsSqliteDatabase)
      .listActivePolicyBindings(boardId);
  }
}
