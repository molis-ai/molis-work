import type { GoalsApplicationApi, GoalsCommandApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalEventApplication } from "../goal-event-application.js";
import type { BoardSnapshot } from "../goal-entry-contract.js";
import type { GoalReadApplication } from "../goal-query-application.js";
import type { GoalTreeWebDecisionInput } from "../goal-tree-web-decision-input.js";
import type { GoalTreeDecisionApplication } from "../goal-tree-decision.js";

/** Host authenticates the channel; Native Goals interprets only the selected product operation. */
export interface GoalsHttpContext {
  method: string | undefined;
  pathname: string;
  search: URLSearchParams;
  readBody(): Promise<Record<string, unknown>>;
  respond(status: number, body: unknown): void;
  options: { boardId: string; routePrefix: string; projectRoot?: string };
  idempotencyHeader: string | string[] | undefined;
  snapshot(): BoardSnapshot;
  changed(): void;
  commands: Pick<GoalsApplicationApi["commands"], "addProjectGuidance" | "updateProjectGuidance">;
  lifecycle: GoalsApplicationApi["lifecycle"];
  query: Pick<GoalReadApplication, "readGoalContract" | "readProjectGuidance">;
  setActiveGoal: GoalsCommandApi["setActiveGoal"];
  goalTreeWebInput: Pick<GoalTreeWebDecisionInput, "prepareDecision">;
  goalTreeDecision: Pick<GoalTreeDecisionApplication, "decideGoalTreeProposal">;
  goalEvents: Pick<GoalEventApplication,
    | "createIntent"
    | "listGoals"
    | "readState"
    | "configure"
    | "report"
    | "listLatestEvents"
    | "listLatestTimeline"
    | "readEvent"
    | "recordProgress"
    | "applyConcern"
    | "requestDecision"
    | "recordTrustedDecision"
    | "setAgreement"
    | "submitClosure"
    | "resumeWork"
    | "isEventStateOwner"
    | "recordNote"
  >;
  journalEvents(): import("../decision-view.js").GoalsDecisionEvent[];
}
