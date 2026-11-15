/**
 * The event card (specs/work-line §4.4, §4.8; WLN-08, WLN-09, WLN-14): what heads an event's tab in the Assistant's dialog and
 * what stays open in the side panel once it is parked there. One card, wherever it stands: who registered the event and how it
 * stands (the line's own read), the display the platform composes from what the event's owner declared (the same route and the
 * same page part as a conversation's objects), and 「在办」 — every task of the task table that is done for it, with the row and
 * the stop the background-task panel gives the same task. Something done shows its result instead: the owner's words or display,
 * 「打开」 as a tab, 「放到 Shelf」, and how it was done folded under it (WLN-11). Nothing here knows a kind of event or a plugin.
 *
 * Which cards are parked is this viewer's own, per project. A part of the work bar's bundle (work-bar.ts).
 */
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { WorkLineEvent } from "@molis-ai/molis-work-contracts/services/mainline";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { objectLink } from "@molis-ai/molis-work-contracts/platform/object-link";
import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { renderCardProcess, renderCardResult, renderEventCard } from "../work-line-parts.js";
import type { createPositionViews } from "./project-position.js";
import type { LineEventPress, WorkBarHost } from "./work-bar.js";
import type { AcceptanceOverview } from "./work-acceptance.js";
import { keepNote } from "./work-task-panel.js";

export type PositionViews = ReturnType<typeof createPositionViews>;
/** `composed`: the event's owner declared a display for it (false for the Assistant's own works, whose tab is the conversation). */
export type EventCardOpen = LineEventPress & { composed: boolean };
export interface EventCardHandle { update(): void; destroy(): void }

/** What the line gives its cards: the event as last read, what its head says, and the rows of the tasks done for it. */
export interface EventCardLine {
  event(subject: ActionSubject): WorkLineEvent | undefined;
  keyOf(subject: ActionSubject): string;
  facts(event: WorkLineEvent): string;
  rows(subject: ActionSubject): string;
  /** What those tasks ask the person to decide, drawn (WLN-10). */
  decisions(subject: ActionSubject): string;
  /** What was asked of the event and of the tasks done for it, and how each item stands: the summary and the way into the requirement column (PWA-144). */
  acceptance(slot: HTMLElement, subject: ActionSubject): AcceptanceOverview;
  press(event: WorkLineEvent): LineEventPress;
}

export function installEventCards(host: WorkBarHost, line: EventCardLine): { mount(slot: HTMLElement, card: EventCardOpen): EventCardHandle; park(card: EventCardOpen): void; paint(): void } {
  const { molisWorkRequest: request } = globalThis as typeof globalThis & { molisWorkRequest?: UiRequest };
  const live = new Set<() => void>(), key = `molis.work-line.parked:${document.body.dataset.projectId ?? ""}`;
  const side = document.querySelector<HTMLElement>("[data-side-parked]"), tab = document.querySelector<HTMLElement>('[data-side-tab="conversation"]');
  const draw = (slot: HTMLElement, card: EventCardOpen, parked: boolean): EventCardHandle => {
    // (`park` is declared below: a card in a tab is parked by its own button.)
    slot.innerHTML = renderEventCard({ id: line.keyOf(card.subject), facts: "", parked, ...(parked ? { title: card.title, mark: card.mark } : {}),
      body: `<div class="work-card-decisions" data-card-decisions hidden></div><div data-card-acceptance hidden></div><div class="work-card-body" data-card-body></div><div class="work-card-result" data-card-result hidden></div><div data-card-tasks hidden></div>` });
    const facts = slot.querySelector<HTMLElement>(".work-card-facts")!, tasks = slot.querySelector<HTMLElement>("[data-card-tasks]")!, decisions = slot.querySelector<HTMLElement>("[data-card-decisions]")!;
    const objects = card.composed ? host.positions?.()?.mount(slot.querySelector<HTMLElement>("[data-card-body]")!, ((body, signal) => host.positionRead!("/api/mainline/event/surfaces", body, signal)) as Parameters<PositionViews["mount"]>[1], { source: () => ({ subject: card.subject }) }) : undefined;
    const name = slot.querySelector<HTMLElement>("[data-card-name]"), gone = new AbortController();
    const accepting = line.acceptance(slot.querySelector<HTMLElement>("[data-card-acceptance]")!, card.subject);
    const result = slot.querySelector<HTMLElement>("[data-card-result]")!, body = slot.querySelector<HTMLElement>("[data-card-body]")!;
    let rows = "", named = "", asks = "", offered = "", shelf: "" | "busy" | "done" = "";
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
    // 「停到侧边」: the card goes to the side panel and the dialog puts its tab away (WLN-14).
    if (!parked) slot.addEventListener("click", event => { if (event.target instanceof Element && event.target.closest("[data-event-park]")) { park(card); host.parked?.(card.subject); } }, { signal: gone.signal });
    const paint = () => {
      const event = line.event(card.subject), said = event ? line.facts(event) : uiText.text("workbench.work-line.not-on-line-now");
      if (facts.textContent !== said) { facts.textContent = said; facts.title = said; }
      // A parked card names its event as the line does now (its owner's mark is the line's own drawing, never what was stored).
      const now = name && event ? line.press(event) : null;
      if (name && now && named !== now.mark + now.title) {
        named = now.mark + now.title;
        const title = document.createElement("strong"); title.textContent = title.title = now.title;
        name.innerHTML = now.mark; name.append(title);
      }
      // What the tasks behind it ask stands first; words being written into 「改一下」 stay through a redraw.
      const asked = line.decisions(card.subject);
      if (asked !== asks) { asks = asked; keepNote(decisions, () => { decisions.hidden = !asked; decisions.innerHTML = asked; }); }
      // Something done: what came of it, and what can be done with it; the owner's display, where it declared one, is the preview.
      const done = event?.wing === "done", offer = done ? renderCardResult({ id: line.keyOf(card.subject), preview: body.childElementCount ? "" : event.content.trim(), open: Boolean(event.open), shelf }) : "";
      if (offer !== offered) { offered = offer; result.hidden = !offer; result.innerHTML = offer; }
      const next = line.rows(card.subject), drawn = (done ? "done:" : "") + next;
      if (drawn === rows) return;
      rows = drawn; tasks.hidden = !next; tasks.className = done ? "" : "work-card-section";
      tasks.innerHTML = !next ? "" : done ? renderCardProcess(next) : `<h4>${uiText("workbench.work-line.in-progress")}</h4>${next}`;
    };
    // The owner's words are the preview only where it declared no display: drawn once the display has been read.
    const read = () => { void objects?.update().then(paint, () => {}); };
    live.add(paint); paint(); read(); accepting.update();
    return { update() { paint(); read(); accepting.update(); }, destroy() { gone.abort(); live.delete(paint); objects?.destroy(); accepting.destroy(); slot.replaceChildren(); } };
  };

  // Parked cards (WLN-14): kept open in the side panel's 「对话」 page, the latest on top; the same card, so a press there is the press in the dialog.
  let parked: Array<{ card: EventCardOpen; slot: HTMLElement; handle: EventCardHandle }> = [];
  const keep = () => { try { localStorage.setItem(key, JSON.stringify(parked.map(one => one.card))); } catch { /* this viewer's convenience only */ } };
  // The page is offered while a card is parked, and until the person leaves it once it is empty.
  const showSide = () => { if (tab) tab.hidden = parked.length === 0 && tab.getAttribute("aria-selected") !== "true"; if (side) side.dataset.empty = String(parked.length === 0); };
  // A composed display is read while it can be seen: the cards read theirs when the page they stand on is shown.
  document.addEventListener("molis:side-shown", event => { showSide(); if ((event as CustomEvent<{ tab?: string }>).detail?.tab === "conversation") for (const one of parked) one.handle.update(); });
  const park = (card: EventCardOpen, open = true) => {
    if (!side || !tab) return;
    const at = line.keyOf(card.subject);
    if (!parked.some(one => line.keyOf(one.card.subject) === at)) {
      const slot = document.createElement("div");
      slot.className = "side-parked-card"; side.prepend(slot);
      parked.unshift({ card, slot, handle: draw(slot, card, true) });
      keep(); showSide();
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
    // Back in the dialog: the event's tab, as a press on the line opens it.
    if (target?.closest("[data-event-unpark]")) { const card = leave(at); if (card) host.openEvent(card); }
    else if (target?.closest("[data-event-close]")) leave(at);
  });
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "[]") as EventCardOpen[];
    for (const card of [...saved].reverse()) if (card?.subject?.kind && card.subject.id && typeof card.title === "string") park({ subject: { kind: card.subject.kind, id: card.subject.id }, title: card.title, mark: "", composed: card.composed === true }, false);
  } catch { /* nothing was parked */ }

  return { mount: (slot, card) => draw(slot, card, false), park: card => park(card), paint() { for (const paint of live) paint(); } };
}
