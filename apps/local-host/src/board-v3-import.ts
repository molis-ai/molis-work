import { importLegacyV3Board, type LegacyV3ImportInput, type V3ImportReport } from "@molis-ai/molis-work-plugin-goals";
import type { GoalProjectApplication } from "./goal-project-application.js";
import type { LocalProjectDatabase } from "./project-database.js";

/** Retain the public SDK signature while Native Goals owns the import and its transaction. */
export function importV3Board(
  store: LocalProjectDatabase,
  coordinator: GoalProjectApplication,
  legacy: LegacyV3ImportInput,
  input: { target_board_id: string; actor_id: string; idempotency_key: string },
): V3ImportReport {
  return importLegacyV3Board({
    immediate: operation => store.immediate(operation),
    query: store.goalsQuery,
    initializeBoard: input => coordinator.initializeBoard(input),
    commands: coordinator.goals.commands,
    adoptOwner: input => coordinator.goalEvents.adoptOwner(input),
  }, legacy, input);
}
