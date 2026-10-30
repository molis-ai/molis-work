import type { GoalInputBindingsApi } from "./contract/goals.js";
import type { BoardSnapshot } from "./goal-entry-contract.js";
import type { GoalReadApplication } from "./goal-query-application.js";
import type { GoalsDecisionEvent } from "./decision-view.js";
import type { GoalEventApplication } from "./goal-event-application.js";

export interface GoalsDocumentReadPorts {
  snapshot(projectId: string): BoardSnapshot;
  events(projectId: string): GoalsDecisionEvent[];
  goals: Pick<GoalReadApplication, "listPolicyHistory" | "listWorkEventGoalLinks" | "getResolvedGoalPolicy" | "listTrashedGoals">;
  inputs: Pick<GoalInputBindingsApi, "list" | "register" | "deactivate" | "accept">;
  eventWork: Pick<GoalEventApplication, "readState">;
}
