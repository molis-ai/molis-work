import type { StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalDisplayStatus, GoalPresentationState } from "./tree-order.js";

export const STATUS_MARKS: Record<GoalPresentationState, StateRingState> = {
    waiting_for_human: "answer", executing: "running", execution_blocked: "blocked", execution_pending: "idle",
    satisfied: "done", invalidated: "cancelled", trashed: "trashed", archived: "archived",
};
export const DISPLAY_STATUS_MARKS: Record<GoalDisplayStatus, StateRingState> = {
    continue: "ready", in_progress: "doing", waiting_user: "answer", waiting: "waiting", blocked: "blocked", completed: "done",
};
