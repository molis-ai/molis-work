import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalEventAcknowledgementBy, GoalEventAcknowledgementCategory, GoalEventSystemPayload } from "./contract/goals.js";
import { RUNTIME_DISPLAY_NAMES } from "@molis-ai/molis-work-contracts/platform/app-host";
import { RECEIPT_WORDS } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";

type Acknowledgement = Extract<GoalEventSystemPayload, { operation: "input_acknowledged" }>;
type Translate = GoalsDocumentUiPrimitives["translate"];

/** What the timeline needs besides the payload: who wrote the record (its meta line already shows it) and who wrote the record answered. */
export interface AcknowledgementContext { actorId: string; acknowledgedActorKind: "user" | "runtime" | null }

const SESSION_ID_SHOWN = 8;

/**
 * One acknowledgement record on the Goal timeline: who read what, at which cursor, how it says it will be handled, and what it wrote.
 * It is the session's own word, so the card says so; 「你的」 appears only when the person wrote the record answered.
 */
export function renderAcknowledgementBody(
  heading: string,
  payload: Acknowledgement,
  context: AcknowledgementContext,
  L: Translate,
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
): string {
  const sentence = uiText.text("goals.event-acknowledgement-body.who-read-what-title-cursor-cursor", {
    who: whoRead(payload.by, context.actorId, L),
    cursor: String(payload.read_cursor),
    what: whatRead(payload.reference.category, context.acknowledgedActorKind === "user", L),
    title: payload.reference.title,
  });
  const treatment = uiText.text("goals.event-acknowledgement-body.how-will-be-handled-treatment", { treatment: L(RECEIPT_WORDS.TREATMENT[payload.treatment]) });
  return `${heading}<p>${escapeHtml(sentence)}</p><p>${escapeHtml(treatment)}</p><p>${escapeHtml(payload.note)}</p>`
    + `<p class="form-note">${uiText("goals.event-acknowledgement-body.what-ai-says-itself-molis-has-not-checked")}</p>`
    + `<p><button type="button" class="mw-btn mw-btn--link" data-locate-event="${escapeHtml(payload.reference.event_id)}">${uiText("goals.event-acknowledgement-body.locate-record-answers")}</button></p></article>`;
}

function whatRead(category: GoalEventAcknowledgementCategory, mine: boolean, _L: Translate): string {
  if (category === "note") return mine ? uiText.text("goals.event-acknowledgement-body.note") : uiText.text("goals.event-acknowledgement-body.note-2");
  if (category === "requirement") return mine ? uiText.text("goals.event-acknowledgement-body.requirement") : uiText.text("goals.event-acknowledgement-body.requirement-2");
  return mine ? uiText.text("goals.event-acknowledgement-body.decision") : uiText.text("goals.event-acknowledgement-body.decision-2");
}

function whoRead(by: GoalEventAcknowledgementBy, actorId: string, L: Translate): string {
  const session = by.session_id ? by.session_id.slice(0, SESSION_ID_SHOWN) : "";
  if (by.channel === "assistant") return session ? uiText.text("goals.event-acknowledgement-body.assistant-session-session", { session }) : uiText.text("goals.event-acknowledgement-body.assistant");
  if (by.channel === "agent") return L("Agent（{actor}）", { actor: actorId });
  const runtime = by.runtime_id === null ? uiText.text("goals.event-acknowledgement-body.external-ai") : runtimeName(by.runtime_id);
  return session ? uiText.text("goals.event-acknowledgement-body.runtime-session-session", { runtime, session }) : uiText.text("goals.event-acknowledgement-body.runtime-session", { runtime });
}

function runtimeName(runtimeId: string): string {
  return Object.hasOwn(RUNTIME_DISPLAY_NAMES, runtimeId) ? RUNTIME_DISPLAY_NAMES[runtimeId as keyof typeof RUNTIME_DISPLAY_NAMES] : runtimeId;
}
