import { ActionError, type ActionDefinition, type ActionSubject } from "./actions.js";
import { ACTION_SUBJECT_SCHEMA } from "./action-subjects.js";

/**
 * Reminders the person set themselves in a Plugin (a time on a to-do, an alert on a calendar entry), read by the Host
 * to tell the person when one comes due. Only what the person asked to be reminded of: new items, unread counts or
 * overdue lists are not reminders. The Plugin keeps no timer: the Host asks, about once a minute, which reminders fall
 * due in a window. Read from the person's Home, so every reminder of theirs is included, each saying its project.
 */
export const DUE_REMINDERS_INPUT_TYPE = "molis.reminders.window.v1";
export const DUE_REMINDERS_OUTPUT_TYPE = "molis.reminders.due.v1";
export interface DueReminderWindow { from: string; to: string }
export interface DueReminder {
  /** Stable for this occurrence: the same reminder at a new time is a new id (the Host tells each id once). */
  reminder_id: string;
  due_at: string;
  /** What to be reminded of, in the person's words. */
  title: string;
  subject: ActionSubject | null;
  /** The project it belongs to, or null for the personal space. */
  project_id: string | null;
  /** Where the person opens it: the Plugin surface and item. */
  open: { surface: string; id: string } | null;
}
export interface DueReminderCollection { source: { surface: string; title: string }; reminders: DueReminder[] }

const id = { type: "string", minLength: 1 };
const token = { ...id, pattern: "^[a-zA-Z0-9_-]+$" };
const instant = { ...id, format: "date-time" };
export const DUE_REMINDER_WINDOW_SCHEMA = { type: "object", properties: { from: instant, to: instant }, required: ["from", "to"], additionalProperties: false };
export const DUE_REMINDER_SCHEMA = { type: "object", properties: { reminder_id: { ...id, maxLength: 200 }, due_at: instant, title: { ...id, maxLength: 300 },
  subject: { anyOf: [{ type: "null" }, ACTION_SUBJECT_SCHEMA] }, project_id: { type: ["string", "null"], maxLength: 120 },
  open: { anyOf: [{ type: "null" }, { type: "object", properties: { surface: token, id }, required: ["surface", "id"], additionalProperties: false }] } },
  required: ["reminder_id", "due_at", "title", "subject", "project_id", "open"], additionalProperties: false };
export const DUE_REMINDER_COLLECTION_SCHEMA = { type: "object", properties: {
  source: { type: "object", properties: { surface: token, title: id }, required: ["surface", "title"], additionalProperties: false },
  reminders: { type: "array", maxItems: 100, items: DUE_REMINDER_SCHEMA } }, required: ["source", "reminders"], additionalProperties: false };

export function defineDueRemindersAction(capabilityId: string, kinds: string[], title: string, permissions: string[]): ActionDefinition<DueReminderWindow, DueReminderCollection> {
  return { capability_id: capabilityId, version: 1, operation: "query", action: { title, description: "列出用户自己设的、到期时间落在窗口内的提醒；只读，不改变提醒状态。", kind: "query", scope: "home", scheduling: "concurrent",
    audiences: ["user"], permissions, subject_kinds: kinds,
    input_type: DUE_REMINDERS_INPUT_TYPE, output_type: DUE_REMINDERS_OUTPUT_TYPE, input_schema: DUE_REMINDER_WINDOW_SCHEMA, output_schema: DUE_REMINDER_COLLECTION_SCHEMA } };
}

/** Providers return reminders with `from <= due_at < to`; the window itself is checked here. */
export function assertDueReminderWindow(window: DueReminderWindow): void {
  const [from, to] = [window.from, window.to].map(Date.parse);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from! >= to!) throw new ActionError("actions.input_invalid", "提醒时间窗口无效");
}
export function withinDueReminderWindow(value: string, window: DueReminderWindow): boolean {
  const instant = Date.parse(value); return instant >= Date.parse(window.from) && instant < Date.parse(window.to);
}
