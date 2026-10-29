import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsFailure, goalsRoute } from "./failure.js";
import { randomUUID } from "node:crypto";
import type { GoalsRoutePorts } from "./types.js";
import { goalsActions } from "../actions.js";

/** `goals.create`: a new Goal from the page's form, answered with its address. */
export function goalCreateRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [goalsRoute("goals.create", ports, async (context) => {
    const body = context.body;
    const unexpected = Object.keys(body).filter((key) => !CREATE_KEYS.has(key));
    if (unexpected.length) return goalsFailure(new ActionError("actions.input_invalid", `不能使用未许可字段：${unexpected.join("、")}`));
    const requiredText = (name: string, maximum = 4_000): string => {
      const result = typeof body[name] === "string" ? body[name].trim() : "";
      if (!result) throw new ActionError("actions.input_invalid", `${name} 不能为空`);
      if (result.length > maximum) throw new ActionError("actions.input_invalid", `${name} 内容过长`);
      return result;
    };
    const optionalText = (name: string): string | undefined => {
      const result = typeof body[name] === "string" ? body[name].trim() : "";
      return result || undefined;
    };
    const draftText = (name: string, maximum = 4_000): string => {
      const result = typeof body[name] === "string" ? body[name].trim() : "";
      if (result.length > maximum) throw new ActionError("actions.input_invalid", `${name} 内容过长`);
      return result;
    };
    const priority = body.priority == null ? undefined : Number(body.priority);
    if (priority != null && (!Number.isFinite(priority) || priority < 0 || priority > 100)) {
      return goalsFailure(new ActionError("actions.input_invalid", "priority 必须是 0 到 100 的数字"));
    }
    const acceptanceStatements = [
      ...new Set(
        (Array.isArray(body.acceptance_criteria) ? body.acceptance_criteria : [])
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
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
      idempotency_key: String(body.idempotency_key ?? `web-goal-${randomUUID()}`),
      source_kind: "web",
    });
    return { status: 201, body: {
      goal: created.goal,
      goal_path: `/goals/${encodeURIComponent(created.goal.goal_id)}`,
      observed_event_cursor: created.observed_event_cursor,
      replayed: created.replayed,
    } };
  })];
}

const CREATE_KEYS = new Set([
  "goal_id", "title", "outcome", "why", "business_logic", "priority",
  "parent_goal_id", "dependency_goal_ids", "acceptance_criteria", "idempotency_key",
]);
