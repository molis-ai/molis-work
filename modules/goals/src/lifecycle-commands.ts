import type {
  GoalArchiveResult,
  GoalRecord,
  GoalTrashResult,
  GoalsActorWrite,
  GoalsLifecycleApi,
} from "@molis-ai/molis-work-contracts/modules/goals";

import type { GoalsCommandContext } from "./command-support.js";
import { GoalArchiveCommands } from "./lifecycle-archive.js";

export class GoalLifecycleCommands implements GoalsLifecycleApi {
  private readonly archive: GoalArchiveCommands;

  constructor(context: GoalsCommandContext) {
    this.archive = new GoalArchiveCommands(context);
  }

  setArchived(
    projectId: string,
    input: { goal_id: string; archived: boolean; reason: string },
    write: GoalsActorWrite,
  ): GoalArchiveResult {
    return this.archive.setArchived(projectId, input, write);
  }

  setTrashed(
    projectId: string,
    input: { goal_id: string; trashed: boolean; reason: string },
    write: GoalsActorWrite,
  ): GoalTrashResult & { replayed: boolean; observed_event_cursor: number } {
    return this.archive.setTrashed(projectId, input, write);
  }

  listTrashed(projectId: string): GoalRecord[] {
    return this.archive.listTrashed(projectId);
  }
}

