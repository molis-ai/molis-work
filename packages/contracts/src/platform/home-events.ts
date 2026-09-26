import { ActionError, type ActionDefinition, type ActionReference, type ActionSubject } from "./actions.js";
import { ACTION_SUBJECT_SCHEMA } from "./action-subjects.js";

export const HOME_EVENTS_INPUT_TYPE = "molis.home-events.window.v1";
export const HOME_EVENTS_OUTPUT_TYPE = "molis.home-events.collection.v1";
export interface HomeEventWindow { from: string; to: string; now: string }
export interface HomeOpenTarget { kind: "item" | "group" | "surface"; surface: string; id: string | null; title: string; label: string }
export interface HomeEvent {
  event_id: string; subject: ActionSubject; occurred_at: string; placement: "occurred" | "active" | "today";
  category: "personal" | "organization"; title: string; summary: string; content: string;
  facts: Array<[string, string]>; needs_attention: boolean; open: HomeOpenTarget | null;
}
export interface HomeEventCollection {
  source: { surface: string; title: string; icon: string };
  events: HomeEvent[];
}
export interface HomeEventView extends HomeEvent { id: string; source: ActionReference; origin: HomeEventCollection["source"]; suggested_behavior_ids: string[] }
const text = { type: "string" };
const id = { ...text, minLength: 1 };
const token = { ...id, pattern: "^[a-zA-Z0-9_-]+$" };
const instant = { ...id, format: "date-time" };
export const HOME_EVENT_WINDOW_SCHEMA = { type: "object", properties: { from: instant, to: instant, now: instant }, required: ["from", "to", "now"], additionalProperties: false };
export const HOME_OPEN_TARGET_SCHEMA = { type: "object", properties: { kind: { enum: ["item", "group", "surface"] }, surface: token,
  id: { type: ["string", "null"], minLength: 1 }, title: id, label: id }, required: ["kind", "surface", "id", "title", "label"], additionalProperties: false,
  anyOf: [{ properties: { kind: { const: "surface" }, id: { type: "null" } } }, { properties: { kind: { enum: ["item", "group"] }, id } }] };
export const HOME_EVENT_SCHEMA = { type: "object", properties: { event_id: id, subject: ACTION_SUBJECT_SCHEMA, occurred_at: instant,
  placement: { enum: ["occurred", "active", "today"] }, category: { enum: ["personal", "organization"] }, title: id, summary: text, content: text,
  facts: { type: "array", items: { type: "array", items: text, minItems: 2, maxItems: 2 } }, needs_attention: { type: "boolean" },
  open: { anyOf: [{ type: "null" }, HOME_OPEN_TARGET_SCHEMA] } },
  required: ["event_id", "subject", "occurred_at", "placement", "category", "title", "summary", "content", "facts", "needs_attention", "open"], additionalProperties: false };
export const HOME_EVENT_SOURCE_SCHEMA = { type: "object", properties: { surface: token, title: id, icon: token }, required: ["surface", "title", "icon"], additionalProperties: false };
export const HOME_EVENT_COLLECTION_SCHEMA = { type: "object", properties: { source: HOME_EVENT_SOURCE_SCHEMA, events: { type: "array", items: HOME_EVENT_SCHEMA } }, required: ["source", "events"], additionalProperties: false };
export function defineHomeEventsAction(capabilityId: string, kinds: string[], title: string, permissions: string[]): ActionDefinition<HomeEventWindow, HomeEventCollection> {
  return { capability_id: capabilityId, version: 1, operation: "query", action: { title, description: "从原数据提供当前窗口的首页事项及打开目标；不会执行目标动作。", kind: "query", scope: "project", scheduling: "concurrent",
    audiences: ["user", "agent", "workflow", "mcp", "plugin"], permissions, subject_kinds: kinds,
    input_type: HOME_EVENTS_INPUT_TYPE, output_type: HOME_EVENTS_OUTPUT_TYPE, input_schema: HOME_EVENT_WINDOW_SCHEMA, output_schema: HOME_EVENT_COLLECTION_SCHEMA } };
}
/** Providers filter ordinary events by instant; active/today placement can retain unresolved older items. */
export function withinHomeEventWindow(value: string, window: HomeEventWindow): boolean {
  const instant = Date.parse(value); return instant >= Date.parse(window.from) && instant < Date.parse(window.to);
}

/** JSON Schema validates timestamps; providers also validate the relationship between them. */
export function assertHomeEventWindow(window: HomeEventWindow): void {
  const [from, to, now] = [window.from, window.to, window.now].map(Date.parse);
  if (![from, to, now].every(Number.isFinite) || from! >= to! || now! < from! || now! >= to!) {
    throw new ActionError("actions.input_invalid", "首页时间窗口无效，请重新载入");
  }
}
