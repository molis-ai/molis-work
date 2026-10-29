import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsFailure, goalsRoute } from "./failure.js";
import { randomUUID } from "node:crypto";
import { goalsActions } from "../actions.js";
import type { GoalsRoutePorts } from "./types.js";

/** `goals.event-decision`: the person's own conclusion on a Goal, from the page. */
export function goalEventDecisionRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [goalsRoute("goals.event-decision", ports, async (context) => {
    const body = context.body;
    const allowed = new Set([
      "idempotency_key", "request_id", "selected_option_id", "conclusion",
      "accepts_requirements", "effects", "authorized_change", "scope",
    ]);
    const unexpected = Object.keys(body).filter((key) => !allowed.has(key));
    if (unexpected.length) {
      return goalsFailure({ code: "goals.event_http.unexpected_field", message: `不能使用未许可字段：${unexpected.join("、")}`, details: { fields: unexpected } });
    }
    const conclusion = typeof body.conclusion === "string" ? body.conclusion.trim() : "";
    if (!conclusion) return goalsFailure(new ActionError("actions.input_invalid", "用户决定需要结论"));
    const idempotencyKey = String(body.idempotency_key ?? `web-event-decision-${randomUUID()}`);
    const result = await context.actions.invoke(goalsActions.decide, {
      goal_id: context.params.goalId!,
      idempotency_key: idempotencyKey,
      request_id: typeof body.request_id === "string" ? body.request_id : undefined,
      selected_option_id: typeof body.selected_option_id === "string" ? body.selected_option_id : undefined,
      conclusion,
      accepts_requirements: body.accepts_requirements === true ? true : body.accepts_requirements === false ? false : undefined,
      effects: Array.isArray(body.effects) ? body.effects as never : undefined,
      authorized_change: body.authorized_change && typeof body.authorized_change === "object"
        ? body.authorized_change as never
        : undefined,
      scope: body.scope && typeof body.scope === "object" ? body.scope as Record<string, unknown> as never : undefined,
    });
    return { status: 200, body: result };
  })];
}
