import { randomUUID } from "node:crypto";
import type { GoalsActorWrite as ActorWrite } from "@molis-ai/molis-work-contracts/modules/goals";
import { GoalsCommandContext, requestHash } from "./command-support.js";
/** Own Board creation and the current Goal pointer alongside Goal lifecycle facts. */
export class MolisWorkCommands {
   constructor(private readonly context: GoalsCommandContext) {}
  initializeBoard(input: {
    project_id: string;
    title: string;
    actor_id: string;
    idempotency_key: string;
  }): { project_id: string; replayed: boolean; observed_event_cursor: number } {
    if (!input.project_id.trim() || !input.title.trim()) {
      throw this.context.error("request.invalid", "Board ID 和名称不能为空");
    }
    const hash = requestHash({ project_id: input.project_id, title: input.title });
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<{ project_id: string; observed_event_cursor: number }>(
        input.project_id,
        input.actor_id,
        "initialize_board",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };

      const exists = this.context.repository.boardExists(input.project_id);
      if (exists) throw this.context.error("board.exists", `Board 已存在: ${input.project_id}`);

      const at = this.context.now().toISOString();
      this.context.repository.createBoard(input.project_id, input.title.trim(), at);
      let cursor = this.context.repository.appendEvent({
        eventId: randomUUID(),
        projectId: input.project_id,
        actorId: input.actor_id,
        type: "board.created",
        objectType: "board",
        objectId: input.project_id,
        reason: "创建 Molis Work 真相源",
        payload: { title: input.title.trim() },
        at,
      });
      const outcome = { project_id: input.project_id, observed_event_cursor: cursor };
      this.context.remember(
        input.project_id,
        input.actor_id,
        "initialize_board",
        input.idempotency_key,
        hash,
        outcome,
        at,
      );
      return { ...outcome, replayed: false };
    });
  }

  setActiveGoal(
    projectId: string,
    input: { goal_id: string; reason: string },
    write: ActorWrite,
  ): { active_goal_id: string; replayed: boolean; observed_event_cursor: number } {
    const hash = requestHash({ project_id: projectId, ...input });
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<{ active_goal_id: string; observed_event_cursor: number }>(
        projectId,
        write.actor_id,
        "set_active_goal",
        write.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      const goal = this.context.requireGoal(projectId, input.goal_id);
      if (goal.trashed_at) {
        throw this.context.error("goal.trashed", "回收站中的 Goal 需要先恢复，才能设为当前产品目标");
      }
      if (goal.archived_at) {
        throw this.context.error("goal.archived", "已归档 Goal 需要先恢复，才能设为当前产品目标");
      }
      if (goal.fulfillment_state === "satisfied") {
        throw this.context.error("goal.already_satisfied", "已完成的 Goal 不能成为当前进行中的 Goal");
      }
      const now = this.context.now().toISOString();
      this.context.repository.setActiveGoal(projectId, input.goal_id, now);
      const cursor = this.context.repository.appendEvent({
        eventId: randomUUID(),
        projectId,
        actorId: write.actor_id,
        type: "board.active_goal_changed",
        objectType: "goal",
        objectId: input.goal_id,
        reason: input.reason,
        payload: {},
        at: now,
      });
      const outcome = { active_goal_id: input.goal_id, observed_event_cursor: cursor };
      this.context.remember(projectId, write.actor_id, "set_active_goal", write.idempotency_key, hash, outcome, now);
      return { ...outcome, replayed: false };
    });
  }
}
