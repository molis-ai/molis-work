import type { GoalEventAcknowledgementBy, GoalEventAcknowledgementCategory, GoalEventSystemPayload } from "@molis-ai/molis-work-contracts/modules/goals";
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
  const sentence = L("{who} 在游标 {cursor} 读到了{what}「{title}」", {
    who: whoRead(payload.by, context.actorId, L),
    cursor: String(payload.read_cursor),
    what: whatRead(payload.reference.category, context.acknowledgedActorKind === "user", L),
    title: payload.reference.title,
  });
  const treatment = L("处理方式：{treatment}", { treatment: L(RECEIPT_WORDS.TREATMENT[payload.treatment]) });
  return `${heading}<p>${escapeHtml(sentence)}</p><p>${escapeHtml(treatment)}</p><p>${escapeHtml(payload.note)}</p>`
    + `<p class="form-note">${L("AI 自己说的，Molis 没有核对")}</p>`
    + `<p><button type="button" class="mw-btn mw-btn--link" data-locate-event="${escapeHtml(payload.reference.event_id)}">${L("定位到被说明的记录")}</button></p></article>`;
}

function whatRead(category: GoalEventAcknowledgementCategory, mine: boolean, L: Translate): string {
  if (category === "note") return mine ? L("你的笔记") : L("这条笔记");
  if (category === "requirement") return mine ? L("你的要求") : L("这条要求");
  return mine ? L("你的决定") : L("这条决定");
}

function whoRead(by: GoalEventAcknowledgementBy, actorId: string, L: Translate): string {
  const session = by.session_id ? by.session_id.slice(0, SESSION_ID_SHOWN) : "";
  if (by.channel === "assistant") return session ? L("助理会话 {session}", { session }) : L("助理");
  if (by.channel === "agent") return L("Agent（{actor}）", { actor: actorId });
  const runtime = by.runtime_id === null ? L("外部 AI") : runtimeName(by.runtime_id);
  return session ? L("{runtime} 会话 {session}", { runtime, session }) : L("{runtime} 会话", { runtime });
}

function runtimeName(runtimeId: string): string {
  return Object.hasOwn(RUNTIME_DISPLAY_NAMES, runtimeId) ? RUNTIME_DISPLAY_NAMES[runtimeId as keyof typeof RUNTIME_DISPLAY_NAMES] : runtimeId;
}
