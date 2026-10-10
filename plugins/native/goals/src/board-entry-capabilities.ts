import type { HostCapabilityDefinition } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { BoardSnapshot } from "./goal-entry-contract.js";

/** The host acts as the person on this machine; no identity is carried in the input. */
export interface InitializeBoardInput {
  project_id: string;
  title: string;
  idempotency_key: string;
}
export type InitializeBoardOutput = { project_id: string; replayed: boolean; observed_event_cursor: number };

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
} as HostCapabilityDefinition<{ project_id: string }, BoardSnapshot>;
