import type { GoalInputBindingsApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { BoardSnapshot } from "./goal-entry-contract.js";
import type { GoalReadApplication } from "./goal-query-application.js";
import type { GoalsDecisionEvent } from "./decision-view.js";
import type { GoalEventApplication } from "./goal-event-application.js";

export interface GoalsDocumentReadPorts {
  snapshot(boardId: string): BoardSnapshot;
  events(boardId: string): GoalsDecisionEvent[];
  goals: Pick<GoalReadApplication, "listPolicyHistory" | "listWorkEventGoalLinks" | "getResolvedGoalPolicy" | "listTrashedGoals">;
  inputs: Pick<GoalInputBindingsApi, "list" | "register" | "deactivate">;
  eventWork: Pick<GoalEventApplication, "readState">;
}
