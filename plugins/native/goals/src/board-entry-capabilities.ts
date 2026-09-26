import type { HostCapabilityDefinition } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { CreateGoalInput, GoalsApplicationApi, GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { BoardSnapshot } from "./goal-entry-contract.js";
import type { LegacyV3ImportInput, V3ImportReport } from "./board-import-contract.js";

export interface InitializeBoardInput {
  board_id: string;
  title: string;
  actor_id: string;
  idempotency_key: string;
}
export type InitializeBoardOutput = { board_id: string; replayed: boolean; observed_event_cursor: number };
export interface CreateGoalCapabilityInput {
  board_id: string;
  goal: CreateGoalInput;
  actor_id: string;
  idempotency_key: string;
  reason?: string;
}

type CreateGoalCapabilityOutput = ReturnType<GoalsApplicationApi["commands"]["createGoal"]>;

export interface ImportV3CapabilityInput {
  legacy: LegacyV3ImportInput;
  target_board_id: string;
  actor_id: string;
  idempotency_key: string;
}

export const importV3Capability = {
  capability_id: "io.molis.work.local-host.board.import-v3",
  host_only: true,
  version: 1,
  operation: "command",
} as HostCapabilityDefinition<ImportV3CapabilityInput, V3ImportReport>;

export const projectResumeFactsCapability = {
  capability_id: "io.molis.work.local-host.project.resume-facts",
  version: 1,
  operation: "query",
} as HostCapabilityDefinition<{ board_id: string; focus_goal_ids?: string[] }, {
  goals: Array<{
    goal_id: string;
    title: string;
    work_status: "open" | "completed" | "cancelled";
    completion_effect: boolean;
    can_record: boolean;
    next_hint: string;
    unmet_requirement_count: number;
    pending_decision_count: number;
    blocking_concern_count: number;
    updated_at: string;
  }>;
  observed_event_cursor: number;
}>;

export const trashedGoalsCapability = {
  capability_id: "io.molis.work.local-host.goals.trashed",
  version: 1,
  operation: "query",
} as HostCapabilityDefinition<{ board_id: string }, { goals: GoalRecord[]; observed_event_cursor: number }>;

export const initializeBoardCapability = {
  capability_id: "io.molis.work.local-host.board.initialize",
  host_only: true,
  version: 1,
  operation: "command",
} as HostCapabilityDefinition<InitializeBoardInput, InitializeBoardOutput>;

export const snapshotBoardCapability = {
  capability_id: "io.molis.work.local-host.board.snapshot",
  version: 1,
  operation: "query",
} as HostCapabilityDefinition<{ board_id: string }, BoardSnapshot>;

export const createGoalCapability = {
  capability_id: "io.molis.work.local-host.goals.create",
  version: 1,
  operation: "command",
} as HostCapabilityDefinition<CreateGoalCapabilityInput, CreateGoalCapabilityOutput>;
