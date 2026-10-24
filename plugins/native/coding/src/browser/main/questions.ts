import { errorMessage } from "../dom.js";
import { terminal } from "./composer-state.js";
import type { HostInteraction } from "./host.js";
import { questionAnswered } from "./answered.js";
import type { Page } from "./page.js";
import { api, sessionPath } from "./request.js";
import type { PendingQuestion, QuestionRun } from "./shapes.js";
import { continueRound } from "./composer.js";
import { refreshState } from "./configuration.js";
import { readCurrent } from "./read.js";
import { draftKey, toInput } from "./helpers.js";

/** A question card: the shared card the Host draws, and the Host's client bound to it. */
interface QuestionCard extends HTMLElement { ix?: HostInteraction }

/** What a question card needs to answer: where it is, and what it asks. */
interface Asking {
  readonly page: Page;
  readonly card: QuestionCard;
  readonly note: HTMLElement;
  readonly id: string;
  readonly key: string;
  readonly run: QuestionRun;
  readonly question: PendingQuestion;
  client: HostInteraction | null;
}

const answerable = (card: HTMLElement) => card.dataset.answerable === "true";
const lock = (card: HTMLElement, on: boolean) => card.querySelectorAll<HTMLButtonElement | HTMLFieldSetElement>("fieldset,button").forEach(node => {
  node.disabled = on;
});

/** Keeps what was written in the card, to restore after a reload. */
function remember(asking: Asking, values: Record<string, unknown> | null = asking.client?.read() ?? null) {
  const { page, id, key } = asking, { s } = page;
  const drafts = s.questionDrafts.get(id) || {};
  if (values) drafts[key] = values;
  else delete drafts[key];
  s.questionDrafts.set(id, drafts);
  try {
    sessionStorage.setItem(draftKey(page, id) + ":questions", JSON.stringify(drafts));
  } catch {
    // The browser keeps no session storage here: the draft lives for this page only.
  }
}

/** The card was answered: it becomes the receipt, and the session is read again. */
async function submit(asking: Asking) {
  const { page, card, note, id, key, run, question } = asking, { L, input, lifetime } = page, { draft } = page.refs, { s } = page, client = asking.client;
  if (!client || card.dataset.busy === "true" || !answerable(card)) return;
  remember(asking);
  card.dataset.busy = "true";
  lock(card, true);
  note.textContent = L("coding.question.sending");
  try {
    const { message } = await api<{ message: string }>(page, sessionPath(id) + "/control", "POST", { kind: "answer", run_id: run.ref.run_id, pending_id: question.pending_id, pending_revision: question.pending_revision, values: client.read() });
    s.answeredQuestions.add(key);
    remember(asking, null);
    client.destroy();
    questionAnswered(card, note, message, input, s.current === id && lifetime.visible && card.isConnected);
    void draft.save(id, draft.local(id) || "").catch(() => {
      // The draft is saved again with the next change.
    });
    if (s.current === id) {
      void readCurrent(page);
      void refreshState(page).catch(() => {
        // The session list is read again with the next poll.
      });
    }
  } catch (error) {
    if (lifetime.alive) refuse(asking, client, error);
  } finally {
    delete card.dataset.busy;
  }
}

/** The Host refused the answer: a round that ended closes the card; any other refusal leaves it to be corrected. */
function refuse(asking: Asking, client: HostInteraction, error: unknown) {
  const { page, card, note, id, key } = asking, { s } = page;
  const code = error !== null && typeof error === "object" && "code" in error ? String(error.code) : "";
  const closed = ["coding.round_ended", "agent.pending_not_open"].includes(code), at = document.activeElement;
  if (closed) {
    s.answeredQuestions.add(key);
    card.dataset.refused = "true";
    if (s.current === id) void readCurrent(page);
  }
  note.textContent = errorMessage(error);
  const locked = closed || !answerable(card);
  lock(card, locked);
  if (locked && s.current === id && page.lifetime.visible && card.isConnected && (card.contains(at) || at === document.body)) toInput(page);
  const details = error !== null && typeof error === "object" && "body" in error ? (error.body as { details?: { errors?: unknown } } | null)?.details : undefined;
  if (details?.errors) client.showErrors(details.errors, { focus: true });
}

/** Binds the Host's client to a new card; what was written before a reload comes back. */
function bind(page: Page, card: QuestionCard, key: string, run: QuestionRun, question: PendingQuestion) {
  const { L, host } = page, { draft } = page.refs, { s } = page;
  const id = s.current, note = card.querySelector<HTMLElement>("[data-ix-note]");
  if (!note) return;
  const asking: Asking = { page, card, note, id, key, run, question, client: null };
  asking.client = card.ix = host.interaction(card, {
    onAction: () => void continueRound(page, null, { run_id: run.ref.run_id, pending_id: question.pending_id }),
    onChange: () => {
      remember(asking);
      draft.later(() => {
        void draft.save(id, draft.local(id) || "").catch(error => {
          note.textContent = L("coding.question.unsaved", { reason: errorMessage(error) });
        });
      });
    },
    onSubmit: () => submit(asking),
  });
  const saved = s.questionDrafts.get(id)?.[key];
  if (saved && typeof saved === "object") asking.client.write(saved as Record<string, unknown>);
}

/** The card for a waiting question: kept while its definition is the same, drawn again when the definition changed. */
function questionCard(page: Page, block: HTMLElement, run: QuestionRun, question: PendingQuestion, key: string): QuestionCard | null {
  const cards = [...block.querySelectorAll<QuestionCard>("[data-coding-question]")];
  let form = cards.find(node => node.dataset.questionKey === key) ?? null;
  if (form && question.html && form.dataset.questionDefinition !== question.html) {
    form.ix?.destroy();
    form.remove();
    form = null;
  }
  if (form || !question.html) return form;
  const template = document.createElement("template");
  template.innerHTML = question.html;
  const made = template.content.firstElementChild;
  if (!(made instanceof HTMLElement)) return null;
  made.dataset.codingQuestion = "";
  made.dataset.questionKey = key;
  made.dataset.questionDefinition = question.html;
  block.append(made);
  bind(page, made, key, run, question);
  return made;
}

/** Whether the card can still be answered, and what it says if not. */
function syncCard(page: Page, form: HTMLElement, run: QuestionRun, question: PendingQuestion) {
  const { L } = page, canAnswer = (question.parked || !terminal(run.phase)) && question.answerable !== false;
  form.dataset.answerable = String(canAnswer);
  const ring = form.querySelector<HTMLElement>(".mw-ix-kicker .mw-state-ring");
  if (ring) ring.dataset.mwState = canAnswer ? "answer" : "unavailable";
  if (form.dataset.busy === "true") return;
  form.querySelectorAll<HTMLButtonElement | HTMLFieldSetElement>("fieldset,button:not([data-ix-action=reask])").forEach(node => {
    node.disabled = !canAnswer;
  });
  const note = form.querySelector("[data-ix-note]");
  if (!canAnswer && note) note.textContent = question.unavailable_reason || L("coding.question.closed");
}

/**
 * A waiting question is the shared question card the Host draws (A2); the page restores its draft, binds it with the shared client
 * and answers with what it holds. A card that can no longer be answered keeps what was written, to check.
 */
export function renderQuestions(page: Page, block: HTMLElement, run: QuestionRun) {
  const { s } = page, live = new Set<string>();
  for (const question of run.awaiting_input || []) {
    const key = JSON.stringify([run.ref.run_id, question.pending_id, question.pending_revision]);
    live.add(key);
    if (s.answeredQuestions.has(key)) continue;
    const form = questionCard(page, block, run, question, key);
    if (form) syncCard(page, form, run, question);
  }
  for (const form of block.querySelectorAll<QuestionCard>("[data-coding-question]")) {
    if (live.has(form.dataset.questionKey ?? "") || form.dataset.busy || form.dataset.refused) continue;
    const had = form.contains(document.activeElement);
    form.ix?.destroy();
    form.remove();
    if (had) toInput(page);
  }
}
