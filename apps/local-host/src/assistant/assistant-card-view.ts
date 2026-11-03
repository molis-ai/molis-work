import type { AssistantCard } from "@molis-ai/molis-work-contracts/services/assistant";
import { renderInteractionOperation, type InteractionField } from "@molis-ai/molis-work-design-system";
import { actionCardView, wallClockIn } from "@molis-ai/molis-work-plugin-sdk";
import type { StoredCard } from "./assistant-store.js";
import { CARD_RESULT_OPEN } from "../agent-next-steps.js";

/**
 * An action card as the person sees it (specs/ai-interaction-experience H2): its fields as they read them (the SDK's
 * `actionCardView`, which every keeper of cards uses), and the card drawn on the Host with the design system's operation card, so
 * the page only binds its buttons. What the card's controls send back is turned into the strings its input takes here, beside the
 * card that drew them.
 */
export const cardView = (card: StoredCard): AssistantCard => actionCardView(card);

const EFFECT = { read: "只读取，不改数据", write: "会修改，可在原处撤回", irreversible: "会修改，不能撤回" } as const;
const CARD_RING = { ready: "ready", running: "running", done: "done", failed: "failed", unknown: "verify", stale: "stale", dismissed: "cancelled", "needs-input": "answer" } as const;
const STATUS: Partial<Record<AssistantCard["status"], string>> = { running: "正在执行…", done: "已完成", failed: "没有完成", unknown: "结果未确认，请到原处核对，不会自动重试",
  stale: "已失效", dismissed: "已忽略", "needs-input": "还需要你填写" };


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
    const at = Date.parse(field.raw ?? ""), clock = wallClockIn(Number.isFinite(at) ? at : Date.now(), zone);
    return { id: field.key, label, control: { kind: "datetime", date: Number.isFinite(at) ? clock.day : "", time: Number.isFinite(at) ? clock.time : "", zone: clock.offset,
      weekday: Number.isFinite(at) ? weekdayOf(clock.day, say) : "",
      dateLabel: say("日期"), timeLabel: say("时刻（24 小时制）") } };
  }
  return { id: field.key, label, control: { kind: "text", value: field.value, multiline: field.value.includes("\n") || field.value.length > 60 } };
}

/**
 * The card drawn: what it does and to what, the fields the person may change while it can run, the rest as the exact
 * values that would run, and once it ran (or could not), how it stands, with its result's 「打开」 as the control the row's
 * outcome step presses (AC-06, `cardOutcomeSteps`). A stale card offers only a fresh preparation, where
 * its keeper can make one (`redo`; the Assistant can, a plugin's round card cannot).
 */
export function assistantCardHtml(card: AssistantCard, say: (text: string, values?: Record<string, string | number>) => string, zone?: string, redo = true): string {
  const open = card.status === "ready" || card.status === "needs-input" || card.status === "failed";
  const asked = (key: string) => card.missing.find(item => item.field === key)?.question;
  const editable = open ? card.fields.filter(field => field.editable) : [];
  const shown = card.fields.filter(field => !editable.includes(field));
  const state = STATUS[card.status];
  const result = card.status === "done" ? card.presentation : undefined;
  const actions = open ? [{ id: "run", label: card.status === "failed" ? `${say("再试一次")}：${card.title}` : card.title, variant: "primary" as const }, { id: "dismiss", label: say("忽略") }] : [];
  const origin = card.from ? say("来自「{title}」页面", { title: card.from.title || card.from.surface })
    + (card.source_object?.title ? ` · ${say("选中自《{title}》", { title: card.source_object.title })}` : "") : "";
  return renderInteractionOperation({
    id: card.card_id, kicker: open ? say("可以执行") : say("操作"), state: CARD_RING[card.status], title: card.title,
    badge: { label: say(EFFECT[card.effect]), tone: card.effect === "irreversible" ? "failed" : "quiet", state: null },
    target: { prefix: card.provider, label: card.capability_title }, ...(origin ? { about: origin } : {}), impact: card.summary,
    ...(editable.length ? { fields: editable.map(field => cardField(field, asked(field.key), say, zone)) } : {}),
    // The buttons come after everything that would run: under the exact values when there are any, else under the fields.
    ...(shown.length ? { preview: { title: say("将使用这些内容"), rows: shown.map((field): [string, string] => [asked(field.key) ?? say(field.label), field.value]), ...(actions.length ? { actions } : {}) } }
      : actions.length ? { actions } : {}),
    ...((state && !open) || card.outcome ? { status: { text: (state ? say(state) : "") + (card.outcome ? `${state ? "：" : ""}${card.outcome}` : ""), busy: card.status === "running",
      ...(card.status === "failed" ? { tone: "failed" as const } : ["unknown", "stale", "needs-input"].includes(card.status) ? { tone: "waiting" as const } : {}) } } : {}),
    ...(result ? { result: { title: result.title ?? say(result.summary), body: result.text ?? "",
      ...(result.link ? { actions: [{ id: "result", label: say(result.link.label), href: result.link.href, variant: "primary" as const, attrs: { "data-ix-press": CARD_RESULT_OPEN } }] } : {}) } } : {}),
    ...(card.status === "stale" && redo ? { recovery: [{ id: "redo", label: say("请助理按最新状态重新准备") }] } : {}),
  });
}
