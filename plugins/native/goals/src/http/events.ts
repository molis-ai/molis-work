import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding, PluginRouteResponse } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsFailure, goalsRoute } from "./failure.js";
import { randomUUID } from "node:crypto";
import type { GoalsRouteContext, GoalsRoutePorts } from "./types.js";
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
      code: "goals.event_http.unexpected_field",
      details: { fields: unexpected },
    });
  }
}

/** A Goal's event document: read its state, timeline, one event or one history item (GET), and write to it (`goals.event-*`, POST). */
export function goalEventRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [
    goalsRoute("goals.history-read", ports, async (context) => {
      const result = await context.actions.invoke(goalsActions.historyItem, { goal_id: context.params.goalId!, item_id: context.params.itemId! });
      if (!result) return { status: 404, body: { error: "历史记录不存在", code: "goals.event.not_found" } };
      return { status: 200, body: result };
    }),
    goalsRoute("goals.event-read", ports, async (context) =>
      ({ status: 200, body: await context.actions.invoke(goalsActions.event, { goal_id: context.params.goalId!, event_id: context.params.eventId! }) })),
    goalsRoute("goals.event-state", ports, async (context) =>
      ({ status: 200, body: await context.actions.invoke(goalsActions.state, { goal_id: context.params.goalId! }) })),
    goalsRoute("goals.event-timeline", ports, async (context) =>
      ({ status: 200, body: await context.actions.invoke(goalsActions.history, { goal_id: context.params.goalId!, ...readTimelineQuery(context) }) })),
    ...EVENT_WRITE_ACTIONS.map((action) => goalsRoute(`goals.${action}`, ports, (context) => writeEvent(action, context))),
  ];
}

type EventWriteCommon = { goal_id: string; idempotency_key: string };
type EventWriter = (actions: BoundActionClient, common: EventWriteCommon, body: Record<string, unknown>) => Promise<unknown>;

async function writeEvent(action: EventWriteAction, context: GoalsRouteContext): Promise<PluginRouteResponse> {
  const body = context.body;
  rejectUnknownHttp(action, body);
  const idempotencyKey = String(body.idempotency_key ?? `${action}-${randomUUID()}`);
  if (action === "event-close" && body.kind !== "complete" && body.kind !== "cancel") {
    return goalsFailure({ code: "goals.event_closure.invalid_kind", message: "收尾类型只能是 complete 或 cancel" });
  }
  const result = await EVENT_WRITERS[action](context.actions, { goal_id: context.params.goalId!, idempotency_key: idempotencyKey }, body);
  return { status: 200, body: result };
}

/** Each write to the event document, its own fields read from the page's form. */
const EVENT_WRITERS = {
  "event-configure": (actions, common, body) => actions.invoke(goalsActions.configure, {
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
  }),
  "event-report": (actions, common, body) => actions.invoke(goalsActions.report, {
    ...common,
    events: Array.isArray(body.events) ? body.events as never : [],
    ...(Object.hasOwn(body, "progress") ? { progress: body.progress as never } : {}),
  }),
  "event-progress": (actions, common, body) => actions.invoke(goalsActions.progress, {
    ...common,
    based_on_cursor: Number(body.based_on_cursor),
    summary: String(body.summary ?? ""),
    next_step: optionalText(body.next_step),
    next_actor: optionalText(body.next_actor),
  }),
  "event-concern": (actions, common, body) => actions.invoke(goalsActions.concern, {
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
  }),
  "event-decision-request": (actions, common, body) => actions.invoke(goalsActions.requestDecision, {
    ...common,
    question: String(body.question ?? ""),
    options: Array.isArray(body.options) ? body.options as never : [],
    purpose: body.purpose as never,
    proposed_change: body.proposed_change && typeof body.proposed_change === "object" ? body.proposed_change as never : undefined,
    scope: body.scope && typeof body.scope === "object" ? body.scope as never : undefined,
  }),
  "event-agree": (actions, common, body) => actions.invoke(goalsActions.agree, {
    ...common,
    expected_agreement_version: requiredInt(body.expected_agreement_version, "expected_agreement_version"),
    expected_config_version: requiredInt(body.expected_config_version, "expected_config_version"),
    outcome: optionalText(body.outcome),
    new_requirements: Array.isArray(body.new_requirements) ? body.new_requirements as never : undefined,
    revise_requirements: Array.isArray(body.revise_requirements) ? body.revise_requirements as never : undefined,
    retire_requirement_ids: Array.isArray(body.retire_requirement_ids)
      ? body.retire_requirement_ids.map((value) => String(value))
      : undefined,
  }),
  // Its kind was checked before it runs (`writeEvent`).
  "event-close": (actions, common, body) => actions.invoke(goalsActions.close, {
    ...common,
    kind: body.kind as "complete" | "cancel",
    result: optionalText(body.result),
    reason: String(body.reason ?? ""),
    expected_config_version: requiredInt(body.expected_config_version, "expected_config_version"),
    expected_agreement_version: requiredInt(body.expected_agreement_version, "expected_agreement_version"),
  }),
  "event-resume": (actions, common, body) => actions.invoke(goalsActions.resume, {
    ...common,
    reason: String(body.reason ?? ""),
  }),
  "event-note": (actions, common, body) => actions.invoke(goalsActions.note, {
    ...common,
    body: String(body.body ?? body.note ?? ""),
  }),
} satisfies Record<string, EventWriter>;
type EventWriteAction = keyof typeof EVENT_WRITERS;
const EVENT_WRITE_ACTIONS = Object.keys(EVENT_WRITERS) as EventWriteAction[];

function readTimelineQuery(context: GoalsRouteContext): { before_cursor?: string; limit?: number } {
  const before = context.query.before_cursor;
  const limit = Number(context.query.limit);
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
  if (!Number.isInteger(number)) throw Object.assign(new Error(`${name} 必须是整数`), { code: "goals.event_http.invalid_version" });
  return number;
}
