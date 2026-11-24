/**
 * What is known about an event (specs/work-line §2「这件事的信息」, §4.8; WLN-08, WLN-09, WLN-14): what the information column
 * shows under 信息 for the event the conversation is about, and what stays open in the side panel once it is parked there. One
 * card, wherever it stands: 该你做的 — what the tasks behind it ask, or the owner's display when the owner says the event waits —
 * then 这件事现在怎样 — who registered it and how it stands (the line's own read), the display the platform composes from what the
 * event's owner declared (the same route and the same page part as a conversation's objects), and 在办 — every task of the task
 * table that is done for it, with the row and the stop a list gives the same task. Something done shows its result instead: the
 * owner's words or display, 「打开」 as a tab, 「放到 Shelf」, and how it was done folded under it (WLN-11). Nothing here knows a
 * kind of event or a plugin.
 *
 * Which cards are parked is this viewer's own, per project. A part of the work bar's bundle (work-bar.ts).
 */
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { WorkLineEvent } from "@molis-ai/molis-work-contracts/services/mainline";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { objectLink } from "@molis-ai/molis-work-contracts/platform/object-link";
import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { renderCardOwn, renderCardProcess, renderCardResult, renderEventCard, renderEventPage, renderStateGlyph, type StateGlyph } from "../work-line-parts.js";
import type { createPositionViews } from "./project-position.js";
import type { LineEventPress, WorkBarHost } from "./work-bar.js";
import type { AcceptanceOverview } from "./work-acceptance.js";
import { keepNote } from "./work-tasks.js";

export type PositionViews = ReturnType<typeof createPositionViews>;
/** `composed`: the event's owner declared a display for it (false for the Assistant's own works, whose tab is the conversation). */
export type EventCardOpen = LineEventPress & { composed: boolean };
export interface EventCardHandle { update(): void; destroy(): void }

/** What the line gives its cards: the event as last read, what its head says, and the rows of the tasks done for it. */
export interface EventCardLine {
  event(subject: ActionSubject): WorkLineEvent | undefined;
  keyOf(subject: ActionSubject): string;
  facts(event: WorkLineEvent): string;
  /** The same two facts apart, for the page the platform draws: who registered it, and how it stands. */
  parts(event: WorkLineEvent): { owner: string; state: string; glyph: StateGlyph };
  rows(subject: ActionSubject): string;
  /** What those tasks ask the person to decide, drawn (WLN-10). */
  decisions(subject: ActionSubject): string;
  /** What was asked of the event and of the tasks done for it, and how each item stands: the summary and the way into the requirement column (PWA-144). */
  acceptance(slot: HTMLElement, subject: ActionSubject): AcceptanceOverview;
  press(event: WorkLineEvent): LineEventPress;
}

export function installEventCards(host: WorkBarHost, line: EventCardLine): { mount(slot: HTMLElement, card: EventCardOpen): EventCardHandle; page(slot: HTMLElement, card: EventCardOpen): EventCardHandle; park(card: EventCardOpen): void; paint(): void; setItem(item: string | null): void; sideChanged(): void } {
  const { molisWorkRequest: request } = globalThis as typeof globalThis & { molisWorkRequest?: UiRequest };
  const live = new Set<() => void>(), baseKey = `molis.work-line.parked:${document.body.dataset.projectId ?? ""}`;
  let key = baseKey;
  const side = document.querySelector<HTMLElement>("[data-side-parked]"), tab = document.querySelector<HTMLElement>('[data-side-tab="conversation"]');
  const draw = (slot: HTMLElement, card: EventCardOpen, parked: boolean, page = false): EventCardHandle => {
    // (`park` is declared below: a card in a tab is parked by its own button.)
    slot.innerHTML = page ? renderEventPage({ id: line.keyOf(card.subject), place: host.placeName?.() ?? "" }) : renderEventCard({ id: line.keyOf(card.subject), facts: "", parked, ...(parked ? { title: card.title, mark: card.mark } : {}),
      body: `<div class="work-card-body" data-card-body></div><div class="work-card-own" data-card-own hidden></div><div class="work-card-result" data-card-result hidden></div><div data-card-tasks hidden></div><div data-card-acceptance hidden></div>` });
    const facts = slot.querySelector<HTMLElement>(".work-card-facts")!, tasks = slot.querySelector<HTMLElement>("[data-card-tasks]")!, decisions = slot.querySelector<HTMLElement>("[data-card-decisions]")!;
    const askTitle = slot.querySelector<HTMLElement>("[data-card-ask-title]");
    const ask = slot.querySelector<HTMLElement>("[data-card-ask]")!, askBody = slot.querySelector<HTMLElement>("[data-card-ask-body]")!, now = slot.querySelector<HTMLElement>(".work-card-now")!;
    const objects = card.composed ? host.positions?.()?.mount(slot.querySelector<HTMLElement>("[data-card-body]")!, ((body, signal) => host.positionRead!("/api/mainline/event/surfaces", body, signal)) as Parameters<PositionViews["mount"]>[1], { source: () => ({ subject: card.subject }) }) : undefined;
    const name = slot.querySelector<HTMLElement>("[data-card-name]"), gone = new AbortController();
    const accepting = line.acceptance(slot.querySelector<HTMLElement>("[data-card-acceptance]")!, card.subject);
    const result = slot.querySelector<HTMLElement>("[data-card-result]")!, body = slot.querySelector<HTMLElement>("[data-card-body]")!;
    const rest = slot.querySelector<HTMLElement>("[data-card-body-home]"), own = slot.querySelector<HTMLElement>("[data-card-own]")!, nothing = slot.querySelector<HTMLElement>("[data-card-nothing]");
    const factOwner = slot.querySelector<HTMLElement>("[data-fact-owner]"), factState = slot.querySelector<HTMLElement>("[data-fact-state]");
    let rows = "", named = "", asks = "", offered = "", owned = "", composed = !card.composed, shelf: "" | "busy" | "done" = "";
    // 「打开」 is the event's own place, as a tab; 「放到 Shelf」 puts its name, its words and its address there, as the person (WLN-11).
    slot.addEventListener("click", pressed => {
      const target = pressed.target instanceof Element ? pressed.target : null, event = line.event(card.subject);
      if (!event) return;
      if (target?.closest("[data-event-open]") && event.open) { if (event.open.kind === "surface" || !event.open.id) host.openSurface(event.open.surface); else host.openItem(event.open.surface, event.open.id, event.open.title); }
      else if (target?.closest("[data-event-shelve]") && !shelf && request) {
        const to = event.open && event.open.kind !== "surface" && event.open.id ? { surface: event.open.surface, id: event.open.id, title: event.open.title } : event.subject;
        const address = location.origin + objectLink(document.body.dataset.projectId ?? "", to);
        shelf = "busy"; paint();
        void request(host.route("/api/mainline/shelve"), { body: { title: event.title.slice(0, 200), text: [event.title, event.content, address].filter(Boolean).join("\n") } })
          .then(() => { shelf = "done"; }, (error: unknown) => { shelf = ""; request.toast?.(document.querySelector("[data-toast]") as never, error); }).finally(paint);
      }
    }, { signal: gone.signal });
    // 「停到侧边」: the card goes to the side panel and the conversation closes (WLN-14).
    if (!parked && !page) slot.addEventListener("click", event => { if (event.target instanceof Element && event.target.closest("[data-event-park]")) {
      park(card);
      host.parked?.(card.subject);
    } }, { signal: gone.signal });
    const paint = () => {
      const event = line.event(card.subject), said = event ? line.facts(event) : uiText.text("workbench.work-line.not-on-line-now");
      // Under the name: who registered it, then how it stands in the colour of its mark (amber: your turn; red: it failed).
      const stands = event ? line.parts(event) : null;
      // (Drawn again when any of it moves: the same words can stand for another state, an event with no summary going from 在办 to 办完.)
      const stood = stands ? [said, stands.owner, stands.state, stands.glyph].join("\n") : said;
      if (facts.dataset.drawn !== stood) {
        facts.dataset.drawn = stood;
        facts.title = said;
        if (page || !stands) facts.textContent = said;
        else {
          const owner = document.createElement("span"), state = document.createElement("span");
          owner.textContent = stands.owner;
          state.textContent = stands.state;
          state.dataset.g = stands.glyph;
          facts.replaceChildren(owner, state);
        }
      }
      const nowHead = now.querySelector<HTMLElement>(":scope > .work-card-part-head > h4");
      const nowLabel = uiText.text("workbench.work-line.how-it-stands");
      if (nowHead && nowHead.textContent !== nowLabel) nowHead.textContent = nowLabel;
      if (nothing) {
        const nothingLabel = uiText.text("workbench.work-line.event-page-nothing-more");
        if (nothing.textContent !== nothingLabel) nothing.textContent = nothingLabel;
      }
      if (factOwner && factState) {
        const { owner, state } = stands ?? { owner: "", state: said };
        if (factOwner.textContent !== owner) factOwner.textContent = factOwner.title = owner;
        if (factState.textContent !== state) factState.textContent = factState.title = state;
        if (stands) factState.dataset.g = stands.glyph; else delete factState.dataset.g;
      }
      // A parked card names its event as the line does now (its owner's mark is the line's own drawing, never what was stored);
      // an event no longer on the person's line, or one they can no longer read, shows no name at all (WLN-28).
      const shown = name && event ? line.press(event) : null, mark = page || !stands ? "" : renderStateGlyph(stands.glyph);
      if (name && named !== (shown ? mark + shown.title : "")) {
        named = shown ? mark + shown.title : "";
        if (!shown) name.replaceChildren();
        else if (page) name.textContent = shown.title;
        else {
          const title = document.createElement("strong");
          title.textContent = title.title = shown.title;
          name.innerHTML = mark;
          name.append(title);
        }
      }
      // What the tasks behind it ask stands first; words being written into 「改一下」 stay through a redraw.
      const asked = line.decisions(card.subject);
      if (asked !== asks) { asks = asked; keepNote(decisions, () => { decisions.hidden = !asked; decisions.innerHTML = asked; }); }
      // The owner says the event itself waits: its display, with the actions it declared, is what is asked (该你做的); else it says how the event stands.
      const owners = Boolean(event?.needs_attention) && body.childElementCount > 0, home = owners ? askBody : rest ?? now;
      if (body.parentElement !== home) { if (owners) askBody.append(body); else if (rest) rest.prepend(body); else facts.after(body); }
      // Something done: what came of it, and what can be done with it; the owner's display, where it declared one, is the preview.
      const slim = composed && !body.querySelector(".mw-presentation:not(.mw-presentation--chip)");
      const done = event?.wing === "done", offer = done ? renderCardResult({ id: line.keyOf(card.subject), preview: slim ? event.content.trim() : "", open: Boolean(event.open), shelf }) : "";
      if (offer !== offered) { offered = offer; result.hidden = !offer; result.innerHTML = offer; }
      // In the column what can be done with a finished thing stands first, where an answer would (办完了); the page keeps it with the owner's words.
      const finished = Boolean(offer) && !asked && !owners && !page;
      if (finished) { if (result.parentElement !== ask) ask.append(result); } else if (result.parentElement === ask) own.after(result);
      ask.hidden = !asked && !owners && !finished;
      // What it asks is named by its kind: something failed, changes to agree to, a choice to make — or that it is done.
      const tone = finished ? "done" : stands?.glyph === "bad" ? "failed" : asked.includes("work-decision-changes") ? "approve" : "decide";
      if (askTitle) {
        const askLabel = uiText.text(`workbench.work-line.asked-${tone}`);
        if (ask.dataset.tone !== tone) ask.dataset.tone = tone;
        if (askTitle.textContent !== askLabel) askTitle.textContent = askLabel;
      }
      // Where the owner declared no fuller display than its name (a chip), what it registered about the event stands in its own
      // words — what it says and its facts (POLISH-22) — once the display has been read; with nothing at all, one quiet line says so.
      const registered = event && !done && slim ? renderCardOwn({ words: event.content.trim(), facts: event.facts }) : "";
      if (registered !== owned) {
        owned = registered;
        own.hidden = !registered;
        own.innerHTML = registered;
      }
      // The name alone repeats the head: it stays only where it is what is asked (its 打开 is the way to answer).
      body.hidden = slim && !owners && body.childElementCount > 0 && Boolean(registered);
      if (nothing) nothing.hidden = Boolean(registered) || done || (body.childElementCount > 0 && !body.hidden) || !ask.hidden;
      const next = line.rows(card.subject);
      const tasksHead = done ? `done:${uiText.text("workbench.work-line.process")}:` : `${uiText.text("workbench.work-line.tasks-behind")}:`;
      const drawn = tasksHead + next;
      if (drawn === rows) return;
      rows = drawn;
      tasks.hidden = !next;
      tasks.className = done ? "" : "work-card-tasks";
      tasks.innerHTML = !next ? "" : done ? renderCardProcess(next) : `<small>${uiText("workbench.work-line.tasks-behind")}</small>${next}`;
    };
    // The owner's words are the preview only where it declared no display: drawn once the display has been read.
    const read = () => { void objects?.update().then(() => {
      composed = true;
      paint();
    }, () => {
      composed = true;
      paint();
    }); };
    // With nothing drawn for it (an event its conversation is not about any more, an Assistant's work the line has not read) the place stays empty.
    slot.hidden = false;
    live.add(paint); paint(); read(); accepting.update();
    return { update() {
      paint();
      read();
      accepting.update();
    }, destroy() {
      gone.abort();
      live.delete(paint);
      objects?.destroy();
      accepting.destroy();
      slot.replaceChildren();
      if (!parked && !page) slot.hidden = true;
    } };
  };

  // Parked cards (WLN-14): kept open in the side panel's 「对话」 page, the latest on top; the same card, so a press there is the press in the dialog.
  let parked: Array<{ card: EventCardOpen; slot: HTMLElement; handle: EventCardHandle }> = [];
  // Only which events were parked is kept, never their names: after a reload a card is named once the line shows its event again (WLN-28).
  const keep = () => { try { localStorage.setItem(key, JSON.stringify(parked.map(one => ({ subject: one.card.subject, composed: one.card.composed })))); } catch { /* this viewer's convenience only */ } };
  // The page is offered while a card is parked, and until the person leaves it once it is empty.
  // (Lists parked there are the lists' own: they stand in the same page, so the page counts what stands in it.)
  const showSide = () => {
    const none = !side?.querySelector(":scope > .side-parked-card");
    if (tab) tab.hidden = none && tab.getAttribute("aria-selected") !== "true";
    if (side) side.dataset.empty = String(none);
  };
  // A composed display is read while it can be seen: the cards read theirs when the page they stand on is shown.
  document.addEventListener("molis:side-shown", event => { showSide(); if ((event as CustomEvent<{ tab?: string }>).detail?.tab === "conversation") for (const one of parked) one.handle.update(); });
  const park = (card: EventCardOpen, open = true) => {
    if (!side || !tab) return;
    const at = line.keyOf(card.subject);
    if (!parked.some(one => line.keyOf(one.card.subject) === at)) {
      const slot = document.createElement("div");
      slot.className = "side-parked-card"; side.prepend(slot);
      parked.unshift({ card, slot, handle: draw(slot, card, true) });
      if (open) keep();
      showSide();
    }
    if (open) { document.dispatchEvent(new CustomEvent("molis:side-open", { detail: { tab: "conversation", focus: false }, cancelable: true })); }
  };
  const leave = (at: string) => {
    const found = parked.find(one => line.keyOf(one.card.subject) === at);
    if (!found) return undefined;
    found.handle.destroy(); found.slot.remove(); parked = parked.filter(one => one !== found); keep(); showSide();
    return found.card;
  };
  side?.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null, at = target?.closest<HTMLElement>("[data-event-card]")?.dataset.eventCard ?? "";
    // Back in the conversation: the event, as a press on it opens it.
    if (target?.closest("[data-event-unpark]")) { const card = leave(at); if (card) host.openEvent(card); }
    else if (target?.closest("[data-event-close]")) leave(at);
  });
  function restoreParked() {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<Partial<EventCardOpen>>;
      for (const card of [...saved].reverse()) if (typeof card?.subject?.kind === "string" && typeof card.subject.id === "string") park({ subject: { kind: card.subject.kind, id: card.subject.id }, title: "", mark: "", owner: "", composed: card.composed === true }, false);
    } catch { /* nothing was parked */ }
    showSide();
  }
  function setItem(item: string | null) {
    const next = item ? baseKey + ":" + item : baseKey;
    if (key === next) return;
    for (const one of parked) { one.handle.destroy(); one.slot.remove(); }
    parked = [];
    key = next;
    restoreParked();
  }
  restoreParked();
  return { mount: (slot, card) => draw(slot, card, false), page: (slot, card) => draw(slot, card, false, true), park: card => park(card), paint() { for (const paint of live) paint(); }, setItem, sideChanged: showSide };
}
