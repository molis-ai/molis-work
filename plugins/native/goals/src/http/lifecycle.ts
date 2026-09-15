import { randomUUID } from "node:crypto";
import type { GoalsHttpContext } from "./types.js";

export async function handleGoalLifecycleHttp(context: GoalsHttpContext): Promise<boolean> {
  const activeGoalMatch = context.pathname.match(/^\/api\/goals\/([^/]+)\/active$/);
  if (context.method === "POST" && activeGoalMatch) {
    const body = await context.readBody();
    const goalId = decodeURIComponent(activeGoalMatch[1]);
    const reason = String(body.reason ?? "用户从 Molis Work 设为当前 Goal").trim();
    if (!reason) {
      context.respond( 400, { error: "设为当前 Goal 时必须说明原因" });
      return true;
    }
    try {
      const result = context.setActiveGoal(
        context.options.boardId,
        { goal_id: goalId, reason },
        {
          actor_id: "web-user",
          idempotency_key: String(body.idempotency_key ?? `web-active-goal-${randomUUID()}`),
        },
      );
      context.respond( 200, result);
    } catch (error) {
      context.respond( 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }
  const goalArchiveMatch = context.pathname.match(/^\/api\/goals\/([^/]+)\/archive$/);
  if (context.method === "POST" && goalArchiveMatch) {
    const body = await context.readBody();
    if (typeof body.archived !== "boolean") {
      context.respond( 400, { error: "archived 必须是 boolean" });
      return true;
    }
    const goalId = decodeURIComponent(goalArchiveMatch[1]);
    try {
      const result = context.lifecycle.setArchived(
        context.options.boardId,
        {
          goal_id: goalId,
          archived: body.archived,
          reason: String(
            body.reason ??
              (body.archived ? "用户从 Molis Work 归档已完成 Goal" : "用户从 Molis Work 恢复归档 Goal"),
          ),
        },
        {
          actor_id: "web-user",
          idempotency_key: String(body.idempotency_key ?? `web-archive-${randomUUID()}`),
        },
      );
      context.respond( 200, result);
    } catch (error) {
      context.respond( 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }
  const goalTrashMatch = context.pathname.match(/^\/api\/goals\/([^/]+)\/trash$/);
  if (context.method === "POST" && goalTrashMatch) {
    const body = await context.readBody();
    if (typeof body.trashed !== "boolean") {
      context.respond( 400, { error: "trashed 必须是 boolean" });
      return true;
    }
    if (body.user_confirmed !== true) {
      context.respond( 400, { error: "请先在 Molis Work 中确认此操作" });
      return true;
    }
    const goalId = decodeURIComponent(goalTrashMatch[1]);
    try {
      const result = context.lifecycle.setTrashed(
        context.options.boardId,
        {
          goal_id: goalId,
          trashed: body.trashed,
          reason: String(body.reason ?? "").trim(),
        },
        {
          actor_id: "web-user",
          idempotency_key: String(body.idempotency_key ?? `web-trash-${randomUUID()}`),
        },
      );
      context.respond( 200, result);
    } catch (error) {
      context.respond( 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }
  return false;
}
