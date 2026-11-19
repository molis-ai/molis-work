import type { AssistantCard } from "@molis-ai/molis-work-contracts/services/assistant";
import { automationAdoptionActions } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { renderInteractionOperation, type InteractionField } from "@molis-ai/molis-work-design-system";
import { actionCardView, wallClockIn } from "@molis-ai/molis-work-plugin-sdk";
import { say as stored } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { StoredCard } from "./assistant-store.js";
import { CARD_RESULT_OPEN } from "../agent-next-steps.js";

/**
 * An action card as the person sees it (specs/ai-interaction-experience H2): its fields as they read them (the SDK's
 * `actionCardView`, which every keeper of cards uses), and the card drawn on the Host with the design system's operation card, so
 * the page only binds its buttons. What the card's controls send back is turned into the strings its input takes here, beside the
 * card that drew them.
 */
export const cardView = (card: StoredCard): AssistantCard => actionCardView(card);

const EFFECT = { read: "workbench.assistant-card-view.reads-only-changes-nothing", write: "workbench.assistant-card-view.changes-data-can-be-taken-back", irreversible: "workbench.assistant-card-view.changes-data-cannot-be-undone" } as const;
const CARD_RING = { ready: "ready", running: "running", done: "done", failed: "failed", unknown: "verify", stale: "stale", dismissed: "cancelled", "needs-input": "answer" } as const;
const STATUS: Partial<Record<AssistantCard["status"], string>> = {
  running: "workbench.assistant-card-view.status-running", done: "workbench.assistant-card-view.status-done", failed: "workbench.assistant-card-view.status-failed",
  unknown: "workbench.assistant-card-view.status-unknown", stale: "workbench.assistant-card-view.status-stale", dismissed: "workbench.assistant-card-view.status-dismissed",
  "needs-input": "workbench.assistant-card-view.status-needs-input",
};


/** The weekday beside a day, as the page's client writes it while the person types. */
const WEEKDAYS = ["workbench.assistant-card-view.sun", "workbench.assistant-card-view.mon", "workbench.assistant-card-view.tue", "workbench.assistant-card-view.wed", "workbench.assistant-card-view.thu", "workbench.assistant-card-view.fri", "workbench.assistant-card-view.sat"] as const;
const weekdayOf = (day: string, say: (text: string, values?: Record<string, string | number>) => string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) ? say(WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]!) : "";

/** One field the person may still change: picked from its choices, a day typed, a moment as a day and a time in their zone. */
function cardField(field: AssistantCard["fields"][number], question: string | undefined, say: (text: string, values?: Record<string, string | number>) => string, zone: string | undefined): InteractionField {
  const label = question ?? field.label;
  if (field.options) {
    // Several may be picked when the field takes several: what it holds now (its prepared value) starts picked.
    let picked: unknown = field.raw;
    if (field.multiple) { try { picked = JSON.parse(field.raw ?? "[]"); } catch { picked = []; } }
    const on = (value: string) => Array.isArray(picked) ? picked.includes(value) : value === picked;
    return { id: field.key, label, control: { kind: "choice", ...(field.multiple ? { multiple: true } : {}),
      options: field.options.map(option => ({ value: option.value, label: option.label, ...(option.description ? { description: option.description } : {}), selected: on(option.value) })) } };
  }
  if (field.input === "date") return { id: field.key, label, control: { kind: "date", value: field.raw ?? "", weekday: weekdayOf(field.raw ?? "", say) } };
  if (field.input === "datetime") {
    const at = Date.parse(field.raw ?? ""), clock = wallClockIn(Number.isFinite(at) ? at : Date.now(), zone);
    return { id: field.key, label, control: { kind: "datetime", date: Number.isFinite(at) ? clock.day : "", time: Number.isFinite(at) ? clock.time : "", zone: clock.offset,
      weekday: Number.isFinite(at) ? weekdayOf(clock.day, say) : "",
      dateLabel: say("workbench.assistant-card-view.date"), timeLabel: say("workbench.assistant-card-view.time-24-hour") } };
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
  const state = STATUS[card.status], outcome = card.outcome ? stored.text(card.outcome) : "";
  const result = card.status === "done" ? card.presentation : undefined;
  const actions = open ? [{ id: "run", label: card.status === "failed" ? say("workbench.assistant-card-view.try-again") + say("common.punctuation.label-separator") + card.title : card.title, variant: "primary" as const }, { id: "dismiss", label: say("workbench.assistant-card-view.dismiss") }] : [];
  const origin = card.from ? say("workbench.assistant-card-view.title-page", { title: card.from.title || card.from.surface })
    + (card.source_object?.title ? ` · ${say("workbench.assistant-card-view.selected-title", { title: card.source_object.title })}` : "") : "";
  // A result that left a connection to finish gets the platform's connection card under it (ASC-69); the page fills it from the
  // request's real state, and until then, or when it cannot be drawn, the result's own 「继续接入」 link stays the way on.
  const pending = result?.pending_connection ? '<div class="mw-platform-area connection-need-area assistant-connection-need" data-assistant-connection hidden></div>' : "";
  const adoption = card.capability_id === automationAdoptionActions.adopt.capability_id;
  const confirmation = open && adoption ? adoptionConfirmation(card, say) : "";
  return renderInteractionOperation({
    id: card.card_id, kicker: open ? say("workbench.assistant-card-view.ready-run") : say("workbench.assistant-card-view.action"), state: CARD_RING[card.status], title: card.title,
    badge: { label: say(EFFECT[card.effect]), tone: card.effect === "irreversible" ? "failed" : "quiet", state: null },
    target: { prefix: card.provider, label: card.capability_title }, ...(origin ? { about: origin } : {}), impact: card.summary,
    ...(editable.length ? { fields: editable.map(field => cardField(field, asked(field.key), say, zone)) } : {}),
    // The buttons come after everything that would run: under the exact values when there are any, else under the fields.
    ...(shown.length ? { preview: { title: say("workbench.assistant-card-view.what-will-be-used"), rows: shown.map((field): [string, string] => [asked(field.key) ?? field.label, field.value]), ...(actions.length ? { actions } : {}) } }
      : actions.length ? { actions } : {}),
    ...((state && !open) || outcome ? { status: { text: (state ? say(state) : "") + (outcome ? `${state ? say("common.punctuation.label-separator") : ""}${outcome}` : ""), busy: card.status === "running",
      ...(card.status === "failed" ? { tone: "failed" as const } : ["unknown", "stale", "needs-input"].includes(card.status) ? { tone: "waiting" as const } : {}) } } : {}),
    ...(result ? { result: { title: result.title ?? result.summary, body: result.text ?? "",
      ...(result.link ? { actions: [{ id: "result", label: adoption ? say("workbench.automation-adoption.open-kit") : result.link.label,
        href: result.link.href, variant: "primary" as const, attrs: { "data-ix-press": CARD_RESULT_OPEN,
        // 继续接入 names what the settings must make true, so the way back waits for it (specs/draft-and-return §4, R4): never read from the address.
        ...(!adoption && result.pending_connection ? { "data-return-setup": result.pending_connection.authorization_id } : {}) } }] } : {}) } } : {}),
    ...(card.status === "stale" && redo ? { recovery: [{ id: "redo", label: say("workbench.assistant-card-view.ask-assistant-prepare-again-latest-state") }] } : {}),
  }) + confirmation + pending;
}

function adoptionConfirmation(card: AssistantCard, say: (text: string, values?: Record<string, string | number>) => string): string {
  const title = say("workbench.automation-adoption.review-title");
  return `<div data-assistant-adoption-confirm hidden>${renderInteractionOperation({
    id: `${card.card_id}-confirm`, kicker: "", title, target: { prefix: card.provider, label: card.capability_title },
    preview: { title: say("workbench.automation-adoption.review-changes"), rows: card.fields.map(field => [field.label, ""]),
      actions: [{ id: "edit-adoption", label: say("workbench.automation-adoption.review-back") },
        { id: "confirm-adoption", label: say("workbench.automation-adoption.review-confirm"), variant: "primary" }] },
  })}</div>`;
}
