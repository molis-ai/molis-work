import type {
  GoalArchiveResult,
  GoalRecord,
  GoalTrashResult,
  GoalsActorWrite,
  GoalsLifecycleApi,
} from "@molis-ai/molis-work-contracts/modules/goals";

import type { GoalsCommandContext } from "./command-support.js";
import { GoalArchiveCommands } from "./lifecycle-archive.js";
import type { GoalsLifecycleHooks } from "./lifecycle-ports.js";

export class GoalLifecycleCommands implements GoalsLifecycleApi {
  private readonly archive: GoalArchiveCommands;

  constructor(
    context: GoalsCommandContext,
    hooks: GoalsLifecycleHooks,
  ) {
    this.archive = new GoalArchiveCommands(context, hooks);
  }

  setArchived(
    boardId: string,
    input: { goal_id: string; archived: boolean; reason: string },
    write: GoalsActorWrite,
  ): GoalArchiveResult {
    return this.archive.setArchived(boardId, input, write);
  }

  setTrashed(
    boardId: string,
    input: { goal_id: string; trashed: boolean; reason: string },
    write: GoalsActorWrite,
  ): GoalTrashResult & { replayed: boolean; observed_event_cursor: number } {
    return this.archive.setTrashed(boardId, input, write);
  }

  listTrashed(boardId: string): GoalRecord[] {
    return this.archive.listTrashed(boardId);
  }
}

export type { GoalsLifecycleHooks } from "./lifecycle-ports.js";
