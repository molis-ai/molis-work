import { randomUUID } from "node:crypto";
import type { GoalsHttpContext } from "./types.js";
import { goalsActions } from "../actions.js";

export async function handleGoalCreateHttp(context: GoalsHttpContext): Promise<boolean> {
  if (context.method === "POST" && context.pathname === "/api/goals") {
    const body = await context.readBody();
    const unexpected = Object.keys(body).filter((key) => !CREATE_KEYS.has(key));
    if (unexpected.length) {
      context.respond(400, { error: `不能使用未许可字段：${unexpected.join("、")}` });
      return true;
    }
    const requiredText = (name: string, maximum = 4_000): string => {
      const result = typeof body[name] === "string" ? body[name].trim() : "";
      if (!result) throw new Error(`${name} 不能为空`);
      if (result.length > maximum) throw new Error(`${name} 内容过长`);
      return result;
    };
    const optionalText = (name: string): string | undefined => {
      const result = typeof body[name] === "string" ? body[name].trim() : "";
      return result || undefined;
    };
    const draftText = (name: string, maximum = 4_000): string => {
      const result = typeof body[name] === "string" ? body[name].trim() : "";
      if (result.length > maximum) throw new Error(`${name} 内容过长`);
      return result;
    };
    const priority = body.priority == null ? undefined : Number(body.priority);
    if (priority != null && (!Number.isFinite(priority) || priority < 0 || priority > 100)) {
      context.respond(400, { error: "priority 必须是 0 到 100 的数字" });
      return true;
    }
    const acceptanceStatements = [
      ...new Set(
        (Array.isArray(body.acceptance_criteria) ? body.acceptance_criteria : [])
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    try {
      const goalId = optionalText("goal_id"), parentGoalId = optionalText("parent_goal_id");
      const created = await context.actions.invoke(goalsActions.create, {
        ...(goalId ? { goal_id: goalId } : {}),
        title: requiredText("title", 120),
        outcome: draftText("outcome"),
        why: draftText("why"),
        business_logic: draftText("business_logic"),
        ...(priority !== undefined ? { priority } : {}),
        ...(parentGoalId ? { parent_goal_id: parentGoalId } : {}),
        dependency_goal_ids: [
          ...new Set(
            (Array.isArray(body.dependency_goal_ids) ? body.dependency_goal_ids : [])
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ],
        requirements: acceptanceStatements.map((statement) => ({ statement })),
        idempotency_key: String(body.idempotency_key ?? context.idempotencyHeader ?? `web-goal-${randomUUID()}`),
        source_kind: "web",
      });
      context.respond(201, {
        goal: created.goal,
        goal_path: `${context.options.routePrefix}/goals/${encodeURIComponent(created.goal.goal_id)}`,
        observed_event_cursor: created.observed_event_cursor,
        replayed: created.replayed,
      });
    } catch (error) {
      context.respond(400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }
  return false;
}

const CREATE_KEYS = new Set([
  "goal_id", "title", "outcome", "why", "business_logic", "priority",
  "parent_goal_id", "dependency_goal_ids", "acceptance_criteria", "idempotency_key",
]);
