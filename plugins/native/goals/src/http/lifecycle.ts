import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsFailure, goalsRoute } from "./failure.js";
import { randomUUID } from "node:crypto";
import type { GoalsRoutePorts } from "./types.js";
import { goalsActions } from "../actions.js";

/** Making a Goal the current one (`goals.active`), archiving or restoring it (`goals.archive`), and moving it to or out of the trash (`goals.trash`). */
export function goalLifecycleRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [
    goalsRoute("goals.active", ports, async (context) => {
      const body = context.body;
      const reason = String(body.reason ?? "用户从 Molis Work 设为当前 Goal").trim();
      if (!reason) return goalsFailure(new ActionError("actions.input_invalid", "设为当前 Goal 时必须说明原因"));
      const result = await context.actions.invoke(goalsActions.active, { goal_id: context.params.goalId!, reason,
        idempotency_key: String(body.idempotency_key ?? `web-active-goal-${randomUUID()}`) });
      return { status: 200, body: result };
    }),
    goalsRoute("goals.archive", ports, async (context) => {
      const body = context.body;
      if (typeof body.archived !== "boolean") return goalsFailure(new ActionError("actions.input_invalid", "archived 必须是 boolean"));
      const result = await context.actions.invoke(goalsActions.archive, {
        goal_id: context.params.goalId!,
        archived: body.archived,
        reason: String(
          body.reason ??
            (body.archived ? "用户从 Molis Work 归档已完成 Goal" : "用户从 Molis Work 恢复归档 Goal"),
        ),
        idempotency_key: String(body.idempotency_key ?? `web-archive-${randomUUID()}`),
      });
      return { status: 200, body: result };
    }),
    goalsRoute("goals.trash", ports, async (context) => {
      const body = context.body;
      if (typeof body.trashed !== "boolean") return goalsFailure(new ActionError("actions.input_invalid", "trashed 必须是 boolean"));
      if (body.user_confirmed !== true) return goalsFailure(new ActionError("actions.input_invalid", "请先在 Molis Work 中确认此操作"));
      const result = await context.actions.invoke(goalsActions.trash, {
        goal_id: context.params.goalId!,
        trashed: body.trashed,
        reason: String(body.reason ?? "").trim(),
        user_confirmed: true,
        idempotency_key: String(body.idempotency_key ?? `web-trash-${randomUUID()}`),
      });
      return { status: 200, body: result };
    }),
  ];
}
