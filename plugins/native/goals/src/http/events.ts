import { randomUUID } from "node:crypto";
import type { GoalsHttpContext } from "./types.js";
import { goalsActions } from "../actions.js";

const HTTP_ALLOWED: Record<string, readonly string[]> = {
  "event-configure": [
    "idempotency_key", "expected_version", "expected_agreement_version",
    "types", "adopted_planning", "adopt_default_requirement_ids", "requirement_bindings",
  ],
  "event-report": ["idempotency_key", "events", "progress"],
  "event-progress": ["idempotency_key", "based_on_cursor", "summary", "next_step", "next_actor"],
  "event-concern": [
    "idempotency_key", "action", "concern_id", "title", "statement", "scope",
    "blocks_closure", "reason", "supporting_event_ids", "cited_decision_id",
  ],
  "event-decision-request": [
    "idempotency_key", "question", "options", "purpose", "proposed_change", "scope",
  ],
  "event-agree": [
    "idempotency_key", "expected_agreement_version", "expected_config_version",
    "outcome", "new_requirements", "revise_requirements", "retire_requirement_ids",
  ],
  "event-close": ["idempotency_key", "kind", "result", "reason", "expected_config_version", "expected_agreement_version"],
  "event-note": ["idempotency_key", "body", "note"],
  "event-resume": ["idempotency_key", "reason"],
};

function rejectUnknownHttp(action: string, body: Record<string, unknown>): void {
  const allowed = new Set(HTTP_ALLOWED[action] ?? []);
  const unexpected = Object.keys(body).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    throw Object.assign(new Error(`不能使用未许可字段：${unexpected.join("、")}`), {
      code: "event_http.unexpected_field",
      details: { fields: unexpected },
    });
  }
}

export async function handleGoalEventHttp(context: GoalsHttpContext): Promise<boolean> {
  const goalMatch = context.pathname.match(/^\/api\/goals\/([^/]+)\/(event-state|event-timeline|event-configure|event-report|event-progress|event-concern|event-decision-request|event-agree|event-close|event-resume|event-note)$/);
  const eventMatch = context.pathname.match(/^\/api\/goals\/([^/]+)\/events\/([^/]+)$/);
  const historyMatch = context.pathname.match(/^\/api\/goals\/([^/]+)\/history\/([^/]+)$/);
  if (!goalMatch && !eventMatch && !historyMatch) return false;
  const goalId = decodeURIComponent((goalMatch ?? eventMatch ?? historyMatch)![1]!);
  try {
    if (historyMatch && context.method === "GET") {
      const itemId = decodeURIComponent(historyMatch[2]!);
      const result = await context.actions.invoke(goalsActions.historyItem, { goal_id: goalId, item_id: itemId });
      if (!result) {
        context.respond(404, { error: "历史记录不存在", code: "event.not_found" });
        return true;
      }
      context.respond(200, result);
      return true;
    }
    if (eventMatch && context.method === "GET") {
      context.respond(200, await context.actions.invoke(goalsActions.event, { goal_id: goalId, event_id: decodeURIComponent(eventMatch[2]!) }));
      return true;
    }
    if (!goalMatch) return false;
    const action = goalMatch[2]!;
    if (context.method === "GET" && action === "event-state") {
      context.respond(200, await context.actions.invoke(goalsActions.state, { goal_id: goalId }));
      return true;
    }
    if (context.method === "GET" && action === "event-timeline") {
      context.respond(200, await context.actions.invoke(goalsActions.history, { goal_id: goalId, ...readTimelineQuery(context) }));
      return true;
    }
    if (context.method !== "POST") return false;
    const body = await context.readBody();
    rejectUnknownHttp(action, body);
    const idempotencyKey = String(body.idempotency_key ?? context.idempotencyHeader ?? `${action}-${randomUUID()}`);
    const common = { goal_id: goalId, idempotency_key: idempotencyKey };
    if (action === "event-configure") {
      return writeOk(context, await context.actions.invoke(goalsActions.configure, {
        ...common,
        expected_version: Number(body.expected_version),
        types: Array.isArray(body.types) ? body.types as never : undefined,
        adopted_planning: Array.isArray(body.adopted_planning) ? body.adopted_planning as never : undefined,
        adopt_default_requirement_ids: Array.isArray(body.adopt_default_requirement_ids)
          ? body.adopt_default_requirement_ids.map((value) => String(value))
          : undefined,
        expected_agreement_version: body.expected_agreement_version == null
          ? undefined
          : requiredInt(body.expected_agreement_version, "expected_agreement_version"),
        requirement_bindings: Array.isArray(body.requirement_bindings) ? body.requirement_bindings as never : undefined,
      }));
    }
    if (action === "event-report") {
      return writeOk(context, await context.actions.invoke(goalsActions.report, {
        ...common,
        events: Array.isArray(body.events) ? body.events as never : [],
        ...(Object.hasOwn(body, "progress") ? { progress: body.progress as never } : {}),
      }));
    }
    if (action === "event-progress") {
      return writeOk(context, await context.actions.invoke(goalsActions.progress, {
        ...common,
        based_on_cursor: Number(body.based_on_cursor),
        summary: String(body.summary ?? ""),
        next_step: optionalText(body.next_step),
        next_actor: optionalText(body.next_actor),
      }));
    }
    if (action === "event-concern") {
      return writeOk(context, await context.actions.invoke(goalsActions.concern, {
        ...common,
        action: body.action as never,
        concern_id: optionalText(body.concern_id),
        title: optionalText(body.title),
        statement: optionalText(body.statement),
        scope: body.scope && typeof body.scope === "object" ? body.scope as never : undefined,
        blocks_closure: body.blocks_closure === true ? true : body.blocks_closure === false ? false : undefined,
        reason: optionalText(body.reason),
        supporting_event_ids: Array.isArray(body.supporting_event_ids) ? body.supporting_event_ids.map((value) => String(value)) : undefined,
        cited_decision_id: optionalText(body.cited_decision_id),
      }));
    }
    if (action === "event-decision-request") {
      return writeOk(context, await context.actions.invoke(goalsActions.requestDecision, {
        ...common,
        question: String(body.question ?? ""),
        options: Array.isArray(body.options) ? body.options as never : [],
        purpose: body.purpose as never,
        proposed_change: body.proposed_change && typeof body.proposed_change === "object" ? body.proposed_change as never : undefined,
        scope: body.scope && typeof body.scope === "object" ? body.scope as never : undefined,
      }));
    }
    if (action === "event-agree") {
      return writeOk(context, await context.actions.invoke(goalsActions.agree, {
        ...common,
        expected_agreement_version: requiredInt(body.expected_agreement_version, "expected_agreement_version"),
        expected_config_version: requiredInt(body.expected_config_version, "expected_config_version"),
        outcome: optionalText(body.outcome),
        new_requirements: Array.isArray(body.new_requirements) ? body.new_requirements as never : undefined,
        revise_requirements: Array.isArray(body.revise_requirements) ? body.revise_requirements as never : undefined,
        retire_requirement_ids: Array.isArray(body.retire_requirement_ids)
          ? body.retire_requirement_ids.map((value) => String(value))
          : undefined,
      }));
    }
    if (action === "event-close") {
      if (body.kind !== "complete" && body.kind !== "cancel") {
        context.respond(400, { error: "收尾类型只能是 complete 或 cancel", code: "event_closure.invalid_kind" });
        return true;
      }
      return writeOk(context, await context.actions.invoke(goalsActions.close, {
        ...common,
        kind: body.kind,
        result: optionalText(body.result),
        reason: String(body.reason ?? ""),
        expected_config_version: requiredInt(body.expected_config_version, "expected_config_version"),
        expected_agreement_version: requiredInt(body.expected_agreement_version, "expected_agreement_version"),
      }));
    }
    if (action === "event-note") {
      return writeOk(context, await context.actions.invoke(goalsActions.note, {
        goal_id: goalId, idempotency_key: idempotencyKey,
        body: String(body.body ?? body.note ?? ""),
      }));
    }
    if (action === "event-resume") {
      return writeOk(context, await context.actions.invoke(goalsActions.resume, {
        ...common,
        reason: String(body.reason ?? ""),
      }));
    }
    return false;
  } catch (error) {
    const responded = respondGoalEventError(context, error);
    return responded;
  }
}

function readTimelineQuery(context: GoalsHttpContext): { before_cursor?: string; limit?: number } {
  const before = context.search.get("before_cursor");
  const limit = Number(context.search.get("limit"));
  return {
    ...(before ? { before_cursor: before } : {}),
    ...(Number.isInteger(limit) && limit > 0 ? { limit: Math.min(limit, 100) } : {}),
  };
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
}

function requiredInt(value: unknown, name: string): number {
  const number = Number(value);
  if (!Number.isInteger(number)) throw Object.assign(new Error(`${name} 必须是整数`), { code: "event_http.invalid_version" });
  return number;
}

function writeOk(context: GoalsHttpContext, body: unknown): true {
  context.changed();
  context.respond(200, body);
  return true;
}

function respondGoalEventError(context: GoalsHttpContext, error: unknown): true {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  const details = error && typeof error === "object" && "details" in error ? (error as { details: unknown }).details : undefined;
  const conflict = /version_conflict|stale_version|already_adopted|completed_requires/.test(code);
  context.respond(conflict ? 409 : 400, {
    error: error instanceof Error ? error.message : String(error),
    ...(code ? { code } : {}),
    ...(details !== undefined ? { details } : {}),
  });
  return true;
}
