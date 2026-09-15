import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GoalsRepository, type GoalLifecycleMigrationDatabase } from "@molis-ai/molis-work-module-goals";
import type { GoalRecord, GoalPolicy, PlanningMethodPack, ProjectGuidanceEntryRecord, ProjectGuidanceRevisionRecord } from "@molis-ai/molis-work-contracts/modules/goals";

/** Legacy root SDK read methods. Production runtimes use LocalProjectDatabase. */
export class SqliteMolisWorkStore extends LocalProjectDatabase {
  getGoal(goalId: string): GoalRecord | null {
    return new GoalsRepository(this.db as unknown as GoalLifecycleMigrationDatabase).getGoal(goalId);
  }

  listGoals(boardId: string): GoalRecord[] {
    return this.goalsQuery.listGoals(boardId);
  }

  listTrashedGoals(boardId: string): GoalRecord[] {
    return this.goalsQuery.listTrashedGoals(boardId);
  }

  listPlanningMethodPacks(boardId: string): PlanningMethodPack[] {
    return new GoalsRepository(this.db as unknown as GoalLifecycleMigrationDatabase)
      .listPlanningMethodPacks(boardId);
  }

  listProjectGuidanceEntries(boardId: string, includeInactive = false): ProjectGuidanceEntryRecord[] {
    return new GoalsRepository(this.db as unknown as GoalLifecycleMigrationDatabase)
      .listProjectGuidanceEntries(boardId, includeInactive);
  }

  listProjectGuidanceRevisions(boardId: string): ProjectGuidanceRevisionRecord[] {
    return new GoalsRepository(this.db as unknown as GoalLifecycleMigrationDatabase)
      .listProjectGuidanceRevisions(boardId);
  }

  activePolicyRows(boardId: string, goalId: string): Array<{
    scope: string;
    goal_id: string | null;
    policy: Partial<GoalPolicy>;
  }> {
    return new GoalsRepository(this.db as unknown as GoalLifecycleMigrationDatabase)
      .listActivePolicyBindings(boardId, goalId);
  }

  activePolicyRowsForBoard(boardId: string): Array<{
    scope: string;
    goal_id: string | null;
    policy: Partial<GoalPolicy>;
  }> {
    return new GoalsRepository(this.db as unknown as GoalLifecycleMigrationDatabase)
      .listActivePolicyBindings(boardId);
  }
}
