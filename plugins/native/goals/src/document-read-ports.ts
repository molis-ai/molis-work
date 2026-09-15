import type { GoalInputBindingsApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { BoardSnapshot } from "./goal-entry-contract.js";
import type { GoalReadApplication, projectGoalLifecycle } from "./goal-query-application.js";
import type { GoalsDecisionEvent } from "./decision-view.js";
import type { GoalEventApplication } from "./goal-event-application.js";

export interface GoalsDocumentReadPorts {
  snapshot(boardId: string): BoardSnapshot;
  events(boardId: string): GoalsDecisionEvent[];
  goals: Pick<GoalReadApplication, "listLegacyCoverage" | "listPolicyHistory" | "listGoalRiskLinks" | "getResolvedGoalPolicy" | "listTrashedGoals">;
  inputs: Pick<GoalInputBindingsApi, "list">;
  projectGoalLifecycle(snapshot: Parameters<typeof projectGoalLifecycle>[0], goalId: string): ReturnType<typeof projectGoalLifecycle>;
  eventWork: Pick<GoalEventApplication, "readState">;
}
