import { inputSchemaFor } from "./action-input.js";
import { ActionError, type ActionDefinition, type ActionReference, type ActionSubject } from "./actions.js";
import { ACTION_SUBJECT_SCHEMA } from "./action-subjects.js";
import { STATE_RING_FAMILIES, type StateRingState } from "./ui-state-rings.js";

/**
 * The event registry (specs/work-line §5): what a plugin says is worth a person's eye right now, each with its own object, its
 * time, where it sits and how it opens. A plugin declares one project-scope query with these two types and the object kinds it
 * reports; the Host finds the registrants by the types, and the work line, the project home, the brief and the assistant's
 * material scan read the same answers. There is no other list of registrants.
 */
export const WORK_EVENTS_INPUT_TYPE = /* @version type.molis.work-events.window "molis.work-events.window.v{version}" */ "molis.work-events.window.v1";
export const WORK_EVENTS_OUTPUT_TYPE = /* @version type.molis.work-events.collection "molis.work-events.collection.v{version}" */ "molis.work-events.collection.v1";
export interface WorkEventWindow { from: string; to: string; now: string }
/** Where a person opens a thing on the workbench: an item or a group on a surface, or the surface itself (`id` is null). */
export interface OpenTarget { kind: "item" | "group" | "surface"; surface: string; id: string | null; title: string; label: string }
export interface WorkEvent {
  event_id: string; subject: ActionSubject;
  /** The name on the line, as the registrant gives it this time. Readers do not keep it as a fact. */
  title: string;
  /** The state word or one phrase beside the name ("due today"). */
  summary: string;
  /** For the home and the brief; the line does not show them. */
  content: string; facts: Array<[string, string]>;
  category: "personal" | "organization";
  /** `occurred` is behind now, `active` beside it, `today` ahead of it. */
  placement: "occurred" | "active" | "today";
  occurred_at: string;
  /** When it starts or falls due: what is ahead is ordered by it, and by `occurred_at` without it. */
  scheduled_at?: string;
  /** The state ring's current value for it; absent for an event with nothing behind it. */
  state?: StateRingState;
  /** It waits on the person. */
  needs_attention: boolean; open: OpenTarget | null;
}
export interface WorkEventCollection {
  source: { surface: string; title: string; icon: string };
  events: WorkEvent[];
}
export interface WorkEventView extends WorkEvent { id: string; source: ActionReference; origin: WorkEventCollection["source"]; suggested_behavior_ids: string[] }
const text = { type: "string" } as const;
const id = { ...text, minLength: 1 } as const;
const token = { ...id, pattern: "^[a-zA-Z0-9_-]+$" };
const instant = { ...id, format: "date-time" } as const;
export const WORK_EVENT_WINDOW_SCHEMA = { type: "object", properties: { from: instant, to: instant, now: instant }, required: ["from", "to", "now"], additionalProperties: false } as const;
export const OPEN_TARGET_SCHEMA = { type: "object", properties: { kind: { enum: ["item", "group", "surface"] }, surface: token,
  id: { type: ["string", "null"], minLength: 1 }, title: id, label: id }, required: ["kind", "surface", "id", "title", "label"], additionalProperties: false,
  anyOf: [{ properties: { kind: { const: "surface" }, id: { type: "null" } } }, { properties: { kind: { enum: ["item", "group"] }, id } }] } as const;
const WORK_EVENT_STATES: readonly StateRingState[] = STATE_RING_FAMILIES.flatMap(family => [...family.states]);
export const WORK_EVENT_SCHEMA = { type: "object", properties: { event_id: id, subject: ACTION_SUBJECT_SCHEMA, occurred_at: instant, scheduled_at: instant, state: { enum: WORK_EVENT_STATES },
  placement: { enum: ["occurred", "active", "today"] }, category: { enum: ["personal", "organization"] }, title: id, summary: text, content: text,
  facts: { type: "array", items: { type: "array", items: text, minItems: 2, maxItems: 2 } }, needs_attention: { type: "boolean" },
  open: { anyOf: [{ type: "null" }, OPEN_TARGET_SCHEMA] } },
  required: ["event_id", "subject", "occurred_at", "placement", "category", "title", "summary", "content", "facts", "needs_attention", "open"], additionalProperties: false };
export const WORK_EVENT_SOURCE_SCHEMA = { type: "object", properties: { surface: token, title: id, icon: token }, required: ["surface", "title", "icon"], additionalProperties: false };
export const WORK_EVENT_COLLECTION_SCHEMA = { type: "object", properties: { source: WORK_EVENT_SOURCE_SCHEMA, events: { type: "array", items: WORK_EVENT_SCHEMA } }, required: ["source", "events"], additionalProperties: false };
export function defineWorkEventsAction(capabilityId: string, version: number, kinds: string[], title: string, permissions: string[]): ActionDefinition<WorkEventWindow, WorkEventCollection> {
  return { capability_id: capabilityId, version: version, operation: "query", action: { title, description: "从原数据提供当前窗口里值得人看到的事件及每件的打开位置，供事项线、首页与简报读取；不会执行事件上的动作。", kind: "query", scope: "project", scheduling: "concurrent",
    audiences: ["user", "agent", "workflow", "mcp", "plugin"], permissions, subject_kinds: kinds,
    input_type: WORK_EVENTS_INPUT_TYPE, output_type: WORK_EVENTS_OUTPUT_TYPE, input_schema: inputSchemaFor<WorkEventWindow>()(WORK_EVENT_WINDOW_SCHEMA), output_schema: WORK_EVENT_COLLECTION_SCHEMA } };
}
/** Providers filter ordinary events by instant; active/today placement can retain unresolved older items. */
export function withinWorkEventWindow(value: string, window: WorkEventWindow): boolean {
  const instant = Date.parse(value); return instant >= Date.parse(window.from) && instant < Date.parse(window.to);
}

/** JSON Schema validates timestamps; providers also validate the relationship between them. */
export function assertWorkEventWindow(window: WorkEventWindow): void {
  const [from, to, now] = [window.from, window.to, window.now].map(Date.parse);
  if (![from, to, now].every(Number.isFinite) || from! >= to! || now! < from! || now! >= to!) {
    throw new ActionError("actions.input_invalid", "时间窗口无效，请重新载入");
  }
}
