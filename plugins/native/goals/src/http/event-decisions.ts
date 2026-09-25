import { randomUUID } from "node:crypto";
import { goalsActions } from "../actions.js";
import type { GoalsHttpContext } from "./types.js";

export async function handleGoalEventDecisionHttp(context: GoalsHttpContext): Promise<boolean> {
  const match = context.pathname.match(/^\/api\/goals\/([^/]+)\/event-decision$/);
  if (context.method !== "POST" || !match) return false;
  const body = await context.readBody();
  const allowed = new Set([
    "idempotency_key", "request_id", "selected_option_id", "conclusion",
    "accepts_requirements", "effects", "authorized_change", "scope",
  ]);
  const unexpected = Object.keys(body).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    context.respond(400, {
      error: `不能使用未许可字段：${unexpected.join("、")}`,
      code: "event_http.unexpected_field",
      details: { fields: unexpected },
    });
    return true;
  }
  const conclusion = typeof body.conclusion === "string" ? body.conclusion.trim() : "";
  if (!conclusion) {
    context.respond(400, { error: "用户决定需要结论" });
    return true;
  }
  const goalId = decodeURIComponent(match[1]);
  const idempotencyKey = String(body.idempotency_key ?? context.idempotencyHeader ?? `web-event-decision-${randomUUID()}`);
  try {
    const result = await context.actions.invoke(goalsActions.decide, {
      goal_id: goalId,
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
    context.changed();
    context.respond(200, result);
  } catch (error) {
    context.respond(400, { error: error instanceof Error ? error.message : String(error) });
  }
  return true;
}
