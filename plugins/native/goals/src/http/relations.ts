import { goalsActions } from "../actions.js";
import { randomUUID } from "node:crypto";
import { goalRelationTypes, type GoalRelationType } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsHttpContext } from "./types.js";

export async function handleGoalRelationsHttp(context: GoalsHttpContext): Promise<boolean> {
  if (context.method !== "POST") return false;
  const create = context.pathname.match(/^\/api\/goals\/([^/]+)\/relations$/);
  const deactivate = context.pathname.match(/^\/api\/relations\/([^/]+)\/deactivate$/);
  if (!create && !deactivate) return false;
  const body = await context.readBody();
  try {
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) throw new Error("请填写关系变更原因");
    const write = { idempotency_key: String(context.idempotencyHeader || body.idempotency_key || randomUUID()) };
    let result;
    if (create) {
      if (body.direction !== "outgoing" && body.direction !== "incoming") throw new Error("请选择准确关系方向");
      if (typeof body.type !== "string" || !goalRelationTypes.includes(body.type as GoalRelationType)) throw new Error("请选择有效关系类型");
      const goalId = decodeURIComponent(create[1]);
      const target = typeof body.target_goal_id === "string" ? body.target_goal_id.trim() : "";
      if (!target) throw new Error("请选择另一个 Goal");
      result = await context.actions.invoke(goalsActions.relationAdd, { ...write,
        from_goal_id: body.direction === "outgoing" ? goalId : target,
        to_goal_id: body.direction === "outgoing" ? target : goalId,
        type: body.type as GoalRelationType, reason,
      });
    } else {
      result = await context.actions.invoke(goalsActions.relationDeactivate, { ...write,
        relation_id: decodeURIComponent(deactivate![1]), reason,
      });
    }
    context.changed();
    context.respond(200, result);
  } catch (error) {
    context.respond(400, { error: error instanceof Error ? error.message : String(error) });
  }
  return true;
}
