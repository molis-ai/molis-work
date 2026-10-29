import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsRoute } from "./failure.js";
import { goalsActions } from "../actions.js";
import { randomUUID } from "node:crypto";
import { goalRelationTypes, type GoalRelationType } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsRouteContext, GoalsRoutePorts } from "./types.js";

/** A relation the person draws from one Goal to another (`goals.relation-add`), or stops (`goals.relation-deactivate`); both need a reason. */
export function goalRelationRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [
    goalsRoute("goals.relation-add", ports, async (context) => {
      const { body, write } = relationWrite(context);
      if (body.direction !== "outgoing" && body.direction !== "incoming") throw new ActionError("actions.input_invalid", "请选择准确关系方向");
      if (typeof body.type !== "string" || !goalRelationTypes.includes(body.type as GoalRelationType)) throw new ActionError("actions.input_invalid", "请选择有效关系类型");
      const goalId = context.params.goalId!;
      const target = typeof body.target_goal_id === "string" ? body.target_goal_id.trim() : "";
      if (!target) throw new ActionError("actions.input_invalid", "请选择另一个 Goal");
      const result = await context.actions.invoke(goalsActions.relationAdd, { ...write,
        from_goal_id: body.direction === "outgoing" ? goalId : target,
        to_goal_id: body.direction === "outgoing" ? target : goalId,
        type: body.type as GoalRelationType,
      });
      return { status: 200, body: result };
    }),
    goalsRoute("goals.relation-deactivate", ports, async (context) => {
      const { write } = relationWrite(context);
      const result = await context.actions.invoke(goalsActions.relationDeactivate, { ...write, relation_id: context.params.relationId! });
      return { status: 200, body: result };
    }),
  ];
}

/** Both relation writes need a reason first; the key the caller sent outside the body comes before one inside it. */
function relationWrite(context: GoalsRouteContext) {
  const body = context.body;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) throw new ActionError("actions.input_invalid", "请填写关系变更原因");
  return { body, write: { idempotency_key: String(body.idempotency_key || randomUUID()), reason } };
}
