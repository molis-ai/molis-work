import { actionFieldInput, actionFieldLabel, actionFieldOptions, actionFieldValue } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantCard } from "@molis-ai/molis-work-contracts/services/assistant";
import { renderInteractionOperation, type InteractionField } from "@molis-ai/molis-work-design-system";
import type { StoredCard } from "./assistant-store.js";

/**
 * An action card as the person sees it (specs/ai-interaction-experience H2): its fields as they read them, and the card
 * drawn on the Host with the design system's operation card, so the page only binds its buttons. What the card's
 * controls send back is turned into the strings its input takes here, beside the card that drew them.
 */
export type SchemaProperties = Record<string, { title?: string; description?: string; properties?: SchemaProperties; type?: unknown }>;
const labelOf = (properties: SchemaProperties | undefined, key: string) => actionFieldLabel(key, properties?.[key]);
/**
 * A field with declared choices is shown by its label and edited by picking one; a day or a moment is picked too. The raw
 * value is what runs.
 */
const choices = (declared: unknown, value: unknown) => {
  const raw = typeof value === "string" ? { raw: value } : {};
  const options = actionFieldOptions(declared);
  if (options) return { options, ...raw };
  const input = actionFieldInput(declared);
  return input ? { input, ...raw } : {};
};
export const allowsNull = (declared: unknown): boolean => {
  if (!declared || typeof declared !== "object") return false;
  const schema = declared as { type?: unknown; oneOf?: unknown; anyOf?: unknown };
  if (schema.type === "null" || Array.isArray(schema.type) && schema.type.includes("null")) return true;
  return ([schema.oneOf, schema.anyOf].find(Array.isArray) as unknown[] | undefined)?.some(allowsNull) ?? false;
};
export const plainObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value) && (value as { type?: unknown }).type !== "doc";

export function cardView(card: StoredCard): AssistantCard {
  const properties = (card.input_schema.properties ?? {}) as SchemaProperties;
  const input = plainObject(card.input) ? card.input : null;
  const missingField = (key: string) => card.missing.some(item => item.field === key);
  const fields: AssistantCard["fields"] = [];
  if (input || card.missing.length) {
    for (const key of [...new Set([...(input ? Object.keys(input) : []), ...card.missing.map(item => item.field)])]) {
      const value = input?.[key];
      const editable = card.editable.includes(key) || missingField(key);
      // One level of nesting is shown field by field, the way the person reads it; the parent's permission carries down.
      if (plainObject(value)) {
        for (const [child, inner] of Object.entries(value)) {
          if (inner === undefined || inner === null || inner === "") continue;
          fields.push({ key: `${key}.${child}`, label: labelOf(properties[key]?.properties, child), value: actionFieldValue(child, inner, properties[key]?.properties?.[child]), editable: editable || card.editable.includes(`${key}.${child}`),
            ...choices(properties[key]?.properties?.[child], inner) });
        }
        continue;
      }
      // The object it acts on reads by its title, not by its identifier.
      const target = !editable && card.target?.title && value === card.target.id ? card.target.title : null;
      fields.push({ key, label: labelOf(properties, key), value: target ?? (value !== undefined ? actionFieldValue(key, value, properties[key]) : ""), editable, ...choices(properties[key], value) });
    }
  } else fields.push({ key: "", label: "内容", value: actionFieldValue("", card.input), editable: false });
  return { card_id: card.card_id, revision: card.revision, run_id: card.run_id, title: card.title, summary: card.summary, provider: card.provider,
    capability_title: card.capability_title, capability_id: card.reference.capability_id, effect: card.effect, fields, missing: card.missing, status: card.status,
    ...(card.outcome ? { outcome: card.outcome } : {}), ...(card.from ? { from: { ...card.from } } : {}), ...(card.source_object ? { source_object: { ...card.source_object } } : {}),
    created_at: card.created_at, updated_at: card.updated_at };
}

const EFFECT = { read: "只读取，不改数据", write: "会修改，可在原处撤回", irreversible: "会修改，不能撤回" } as const;
const STATUS: Partial<Record<AssistantCard["status"], string>> = { running: "正在执行…", done: "已完成", failed: "没有完成", unknown: "结果未确认，请到原处核对，不会自动重试",
  stale: "已失效", dismissed: "已忽略", "needs-input": "还需要你填写" };

/** A moment's wall clock in a zone (the Host's own when none is set): its day, its time and the zone's offset. */
function wallClock(at: number, zone: string | undefined): { day: string; time: string; offset: string; utc: number } {
  const part = Object.fromEntries(new Intl.DateTimeFormat("en-US", { ...(zone ? { timeZone: zone } : {}), hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset" }).formatToParts(at).map(item => [item.type, item.value]));
  return { day: `${part.year}-${part.month}-${part.day}`, time: `${part.hour}:${part.minute}`, offset: String(part.timeZoneName ?? ""),
    utc: Date.UTC(Number(part.year), Number(part.month) - 1, Number(part.day), Number(part.hour), Number(part.minute)) };
}

/** The instant a day and a time name in a zone, or null when they name none (a malformed value, or a time the clock skips). */
export function instantIn(day: string, time: string, zone: string | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim()), clock = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match || !clock) return null;
  const wanted = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(clock[1]), Number(clock[2]));
  // Date.UTC rolls a 25th hour or a 32nd day over into the next one: a value that does not read back as written names nothing.
  if (new Date(wanted).toISOString().slice(0, 16) !== `${match[1]}-${match[2]}-${match[3]}T${clock[1]!.padStart(2, "0")}:${clock[2]}`) return null;
  let at = wanted;
  for (let step = 0; step < 2; step += 1) at += wanted - wallClock(at, zone).utc;
  return Number.isFinite(at) && wallClock(at, zone).utc === wanted ? new Date(at).toISOString() : null;
}

/**
 * What a card's controls hold, as the strings its input takes: a pick by its value, a day as it is, a moment as the exact
 * instant it names in the person's zone. A moment that names none is sent as written, so the input's check says what is wrong.
 */
export function cardInputValues(values: unknown, zone: string | undefined): Record<string, string> {
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  return Object.fromEntries(Object.entries(values as Record<string, unknown>).map(([key, value]) => {
    if (typeof value === "string") return [key, value];
    if (Array.isArray(value)) return [key, String(value[0] ?? "")];
    const held = (value ?? {}) as { date?: unknown; time?: unknown; picked?: unknown };
    if (typeof held.date === "string" && typeof held.time === "string") {
      return [key, held.date.trim() || held.time.trim() ? instantIn(held.date, held.time, zone) ?? `${held.date} ${held.time}`.trim() : ""];
    }
    return [key, Array.isArray(held.picked) ? String(held.picked[0] ?? "") : ""];
  }));
}

/** The weekday beside a day, as the page's client writes it while the person types. */
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;
const weekdayOf = (day: string, say: (text: string, values?: Record<string, string | number>) => string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) ? say(WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]!) : "";

/** One field the person may still change: picked from its choices, a day typed, a moment as a day and a time in their zone. */
function cardField(field: AssistantCard["fields"][number], question: string | undefined, say: (text: string, values?: Record<string, string | number>) => string, zone: string | undefined): InteractionField {
  const label = question ?? say(field.label);
  if (field.options) return { id: field.key, label, control: { kind: "choice", options: field.options.map(option => ({ value: option.value, label: option.label, selected: option.value === field.raw })) } };
  if (field.input === "date") return { id: field.key, label, control: { kind: "date", value: field.raw ?? "", weekday: weekdayOf(field.raw ?? "", say) } };
  if (field.input === "datetime") {
    const at = Date.parse(field.raw ?? ""), clock = wallClock(Number.isFinite(at) ? at : Date.now(), zone);
    return { id: field.key, label, control: { kind: "datetime", date: Number.isFinite(at) ? clock.day : "", time: Number.isFinite(at) ? clock.time : "", zone: clock.offset,
      weekday: Number.isFinite(at) ? weekdayOf(clock.day, say) : "",
      dateLabel: say("日期"), timeLabel: say("时刻（24 小时制）") } };
  }
  return { id: field.key, label, control: { kind: "text", value: field.value, multiline: field.value.includes("\n") || field.value.length > 60 } };
}

/**
 * The card drawn: what it does and to what, the fields the person may change while it can run, the rest as the exact
 * values that would run, and once it ran (or could not), how it stands. A stale card offers only a fresh preparation.
 */
export function assistantCardHtml(card: AssistantCard, say: (text: string, values?: Record<string, string | number>) => string, zone?: string): string {
  const open = card.status === "ready" || card.status === "needs-input" || card.status === "failed";
  const asked = (key: string) => card.missing.find(item => item.field === key)?.question;
  const editable = open ? card.fields.filter(field => field.editable) : [];
  const shown = card.fields.filter(field => !editable.includes(field));
  const state = STATUS[card.status];
  const actions = open ? [{ id: "run", label: card.status === "failed" ? `${say("再试一次")}：${card.title}` : card.title, variant: "primary" as const }, { id: "dismiss", label: say("忽略") }] : [];
  const origin = card.from ? say("来自「{title}」页面", { title: card.from.title || card.from.surface })
    + (card.source_object?.title ? ` · ${say("选中自《{title}》", { title: card.source_object.title })}` : "") : "";
  return renderInteractionOperation({
    id: card.card_id, kicker: open ? say("可以执行") : say("操作"), title: card.title,
    badge: { label: say(EFFECT[card.effect]), tone: card.effect === "irreversible" ? "failed" : "quiet" },
    target: { prefix: card.provider, label: card.capability_title }, ...(origin ? { about: origin } : {}), impact: card.summary,
    ...(editable.length ? { fields: editable.map(field => cardField(field, asked(field.key), say, zone)) } : {}),
    // The buttons come after everything that would run: under the exact values when there are any, else under the fields.
    ...(shown.length ? { preview: { title: say("将使用这些内容"), rows: shown.map((field): [string, string] => [asked(field.key) ?? say(field.label), field.value]), ...(actions.length ? { actions } : {}) } }
      : actions.length ? { actions } : {}),
    ...((state && !open) || card.outcome ? { status: { text: (state ? say(state) : "") + (card.outcome ? `${state ? "：" : ""}${card.outcome}` : ""), busy: card.status === "running",
      ...(card.status === "failed" ? { tone: "failed" as const } : ["unknown", "stale", "needs-input"].includes(card.status) ? { tone: "waiting" as const } : {}) } } : {}),
    ...(card.status === "stale" ? { recovery: [{ id: "redo", label: say("请助理按最新状态重新准备") }] } : {}),
  });
}
