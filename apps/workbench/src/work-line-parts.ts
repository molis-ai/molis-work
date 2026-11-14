import { escapeHtml, icon, renderButton, renderStateRing, t as uiText, type PluginIconName, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The markup of the work line's parts (specs/work-line §4, scheme E of docs/design/work-line-32; rules in styles/work-line.ts).
 * Each function draws one part from plain values, so the component board and the product draw the same thing: the board gives
 * sample values (work-line-specimens.ts), the product will give what the line read, the task table and the conversation hold.
 * Nothing here reads a Home, knows a plugin by name or decides a state: the caller says what state a thing is in.
 */

/** Who registered an event: the glyph and hue its Manifest declares, and its name for a title. */
export interface LineOwnerView { readonly name: string; readonly glyph: PluginIconName; readonly hue: string }

/** The states a capsule is drawn in; "" is an event with nothing running behind it. */
export type LineEventState = "" | "running" | "wait" | "failed" | "stale" | "done";

export interface LineEventView {
  readonly id: string;
  readonly title: string;
  readonly owner: LineOwnerView;
  readonly state?: LineEventState;
  /** The state in the owner's own words, as the line read gave it this time: read out with the name (WLN-17), not drawn. */
  readonly stateLabel?: string;
  /** One short phrase after the name: the step being worked on, what is waited for, when it is due. */
  readonly note?: string;
  /** The tasks behind it that have not ended: how many, and the ring of the one that matters most. */
  readonly tasks?: { readonly count: number; readonly lead: StateRingState };
  /** Its tab is the dialog's current tab. */
  readonly current?: boolean;
  /** Just arrived on the line: plays the arrival once. */
  readonly fresh?: boolean;
}

const ring = (state: StateRingState) => renderStateRing({ state, size: 14 });
const mark = (owner: LineOwnerView) => `<span class="work-event-mark" style="--event-hue:var(--hue-${escapeHtml(owner.hue)})" aria-hidden="true">${icon(owner.glyph)}</span>`;

/** One event on the line. Its accessible name is the owner, the title and the note, so a reader hears what a sighted person sees. */
export function renderLineEvent(event: LineEventView): string {
  const state = event.state ?? "";
  const tasks = event.tasks && event.tasks.count > 0
    ? `<span class="work-event-tasks">${ring(event.tasks.lead)}${event.tasks.count > 1 ? event.tasks.count : ""}</span>`
    : state === "done" ? `<span class="work-event-tasks">${ring("done")}</span>` : "";
  const label = [event.owner.name, event.title, event.stateLabel, event.note].filter(Boolean).join(" · ");
  return `<button type="button" class="work-event" data-work-event="${escapeHtml(event.id)}" data-state="${state}"${event.fresh ? " data-fresh" : ""} aria-current="${Boolean(event.current)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">`
    + `${mark(event.owner)}<span class="work-event-name">${escapeHtml(event.title)}</span>${event.note ? `<span class="work-event-note">${escapeHtml(event.note)}</span>` : ""}${tasks}</button>`;
}

/** A source that could not be read stands on the line as its own dashed item: the rest of the line is unaffected, and it can be tried again. */
export function renderLineUnreadable(source: string): string {
  const label = uiText.text("workbench.work-line.source-unreadable-retry", { source });
  return `<button type="button" class="work-event" data-work-line-retry data-state="unreadable" aria-label="${escapeHtml(label)}">${icon("circle-alert")}<span class="work-event-name">${escapeHtml(label)}</span></button>`;
}

/** The line's head (WLN-19): the work item the line belongs to, its state ring when it has one, and how many of its events wait for the person. Opens the head's menu. */
export function renderLineHead(head: { readonly name: string; readonly waiting: number; readonly ring?: StateRingState; readonly menu?: string }): string {
  const waiting = head.waiting > 0 ? `<span class="work-line-count" title="${uiText("workbench.work-line.needs-you")}">${head.waiting}</span>` : "";
  const label = head.waiting > 0 ? uiText.text("workbench.work-line.head-with-waiting", { name: head.name, n: head.waiting }) : head.name;
  return `<button type="button" class="work-line-head" data-work-line-head aria-haspopup="menu" aria-expanded="false"${head.menu ? ` aria-controls="${escapeHtml(head.menu)}"` : ""} aria-label="${escapeHtml(label)}">`
    + `${head.ring ? ring(head.ring) : icon("folder")}<span class="work-line-head-name">${escapeHtml(head.name)}</span>${waiting}${icon("chevron-down")}</button>`;
}

/**
 * The whole line. `past` are the events that happened, `active` the ones being worked on or waiting for the person (they sit
 * next to now, at the end of the left wing), `next` what comes after; `slot` is what stands in the middle (the composer and
 * what floats above it), drawn by the caller.
 */
export function renderWorkLine(line: {
  readonly head: string; readonly past: readonly LineEventView[]; readonly active: readonly LineEventView[]; readonly next: readonly LineEventView[];
  readonly unreadable?: readonly string[]; readonly slot: string;
}): string {
  const run = (events: readonly LineEventView[]) => events.map(renderLineEvent).join("");
  return `<footer class="work-line" data-work-line aria-label="${uiText("workbench.work-line.work-line")}">`
    + `<div class="work-line-track" data-work-line-track><div class="work-line-wing" data-wing="past">${line.head}<div class="work-line-run" role="group" aria-label="${uiText("workbench.work-line.done-and-in-progress")}">${(line.unreadable ?? []).map(renderLineUnreadable).join("")}${run(line.past)}${run(line.active)}</div></div>`
    + `<span class="work-line-now" aria-hidden="true">${uiText("workbench.work-line.now")}</span>`
    + `<div class="work-line-wing" data-wing="next"><div class="work-line-run" role="group" aria-label="${uiText("workbench.work-line.next")}">${run(line.next)}</div><span class="work-line-label" aria-hidden="true">${uiText("workbench.work-line.next")}</span></div></div>`
    + `<div class="work-line-slot" data-work-line-slot>${line.slot}</div></footer>`;
}

/** Who a reply is from: the Assistant's glyph, or a Character's initial. */
export function renderReplyWho(who: { readonly name: string; readonly character?: boolean }): string {
  return who.character ? `<span class="reply-who" aria-hidden="true">${escapeHtml(who.name.slice(0, 1))}</span>` : `<span class="reply-who" data-who="assistant" aria-hidden="true">AI</span>`;
}

export interface TaskMarkView {
  /** Tasks that have not ended. */
  readonly count: number;
  /** The ring of the task that matters most; absent when there is none. */
  readonly lead?: StateRingState;
  readonly needsYou?: boolean;
  readonly failed?: boolean;
  /** The connection to the local service is lost: states are as of the last update. */
  readonly offline?: boolean;
  readonly expanded?: boolean;
  readonly panel?: string;
}

/** The background-task mark: at the dialog's top right, and beside the one reply left when the dialog is closed. */
export function renderTaskMark(view: TaskMarkView): string {
  const title = uiText.text("workbench.work-line.background-tasks");
  const label = view.offline ? uiText.text("workbench.work-line.background-tasks-offline")
    : view.count > 0 ? uiText.text("workbench.work-line.background-tasks-n", { n: view.count }) : title;
  return `<button type="button" class="task-mark" data-task-mark aria-expanded="${Boolean(view.expanded)}"${view.panel ? ` aria-controls="${escapeHtml(view.panel)}"` : ""}${view.needsYou ? " data-needs-you" : ""}${view.failed ? " data-failed" : ""}${view.offline ? " data-offline" : ""} aria-label="${escapeHtml(label)}" title="${escapeHtml(title)}">`
    + `${view.offline ? icon("circle-alert") : view.lead ? ring(view.lead) : icon("activity")}${view.count > 0 ? `<span class="task-mark-count">${view.count}</span>` : ""}</button>`;
}

export interface TaskRowView {
  readonly id: string;
  readonly title: string;
  readonly ring: StateRingState;
  /** Who is doing it and the step it is on, or why it waits. */
  readonly step: string;
  /** The event it is done for; null when it belongs to none. Left out inside an event's own card. */
  readonly serves?: string | null;
  readonly done?: boolean;
  /** The one control the row offers in place: stop while it runs, retry once it failed. */
  readonly control?: "stop" | "retry";
}

/** One task: its ring, name and step, which event it is done for, and the control it offers in place. */
export function renderTaskRow(row: TaskRowView): string {
  const serves = row.serves === undefined ? ""
    : row.serves === null ? `<span class="task-serves" data-serves="none"><span class="task-serves-name">${uiText("workbench.work-line.no-event")}</span></span>`
      : `<span class="task-serves">${icon("link")}<span class="task-serves-name">${escapeHtml(row.serves)}</span></span>`;
  const control = row.control ? renderButton({ variant: "secondary", size: "sm", label: uiText.text(row.control === "stop" ? "workbench.work-line.stop" : "workbench.work-line.retry"), attrs: { "data-task-control": row.control, "data-task": row.id } }) : "";
  return `<div class="task-row" data-state="${row.done ? "done" : "live"}"><button type="button" class="task-row-main" data-task-open="${escapeHtml(row.id)}">${ring(row.ring)}`
    + `<span class="task-row-text"><span class="task-row-title">${escapeHtml(row.title)}</span><span class="task-row-meta"><span class="task-row-step">${escapeHtml(row.step)}</span>${serves}</span></span></button>${control}</div>`;
}

const iconButton = (glyph: PluginIconName, label: string, attrs: Record<string, string>) => renderButton({ variant: "ghost", size: "sm", icon: glyph, iconOnly: true, label, attrs });

/** How many wait for the person, failed, or are being worked on (in the list's order); "all done" when none is left. */
export function renderTaskCounts(counts: { readonly working: number; readonly needsYou: number; readonly failed: number }): string {
  // A ring and a number each, so the head holds them in any language; the words are the title and what a reader hears.
  const one = (kind: string, state: StateRingState, n: number, key: string) => {
    const words = escapeHtml(`${n} ${uiText.text(key)}`);
    return n ? `<span data-count="${kind}" role="img" aria-label="${words}" title="${words}">${ring(state)}<b aria-hidden="true">${n}</b></span>` : "";
  };
  const parts = one("you", "answer", counts.needsYou, "workbench.work-line.need-you") + one("failed", "failed", counts.failed, "workbench.work-line.failed") + one("working", "running", counts.working, "workbench.work-line.working");
  return `<span class="task-panel-counts">${parts || uiText("workbench.work-line.all-done")}</span>`;
}

/**
 * The task panel as a list: the tasks that have not ended (those waiting for the person first, then the failed ones — the
 * caller orders them), then the ones just handed back. With nothing at all it says so. When the connection is lost a banner
 * stands at its foot with the way to reconnect.
 */
export function renderTaskPanel(panel: {
  readonly id?: string; readonly live: readonly TaskRowView[]; readonly returned: readonly TaskRowView[];
  readonly counts?: { readonly working: number; readonly needsYou: number; readonly failed: number }; readonly offlineSince?: string;
}): string {
  const any = panel.live.length + panel.returned.length > 0;
  const rows = any
    ? panel.live.map(renderTaskRow).join("") + (panel.returned.length ? `<div class="task-panel-group">${uiText("workbench.work-line.just-handed-back")}</div>${panel.returned.map(renderTaskRow).join("")}` : "")
    : `<div class="task-panel-empty">${uiText("workbench.work-line.nothing-running-work-that-can-go-background-shows")}</div>`;
  const banner = panel.offlineSince ? `<div class="task-panel-banner" role="status">${icon("circle-alert")}<span class="task-panel-banner-text">${escapeHtml(uiText.text("workbench.work-line.disconnected-states-as-of", { time: panel.offlineSince }))}</span>${renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.work-line.reconnect"), attrs: { "data-task-reconnect": "" } })}</div>` : "";
  return `<section class="task-panel"${panel.id ? ` id="${escapeHtml(panel.id)}"` : ""} data-task-panel role="dialog" aria-label="${uiText("workbench.work-line.background-tasks")}">`
    + `<header class="task-panel-head">${icon("activity")}<span class="task-panel-title">${uiText("workbench.work-line.background-tasks")}</span>${any && panel.counts ? renderTaskCounts(panel.counts) : ""}${iconButton("x", uiText.text("workbench.work-line.close"), { "data-task-panel-close": "" })}</header>`
    + `<div class="task-panel-body">${rows}</div>${banner}</section>`;
}

export interface TaskCardView {
  readonly id: string;
  readonly title: string;
  readonly owner: LineOwnerView;
  readonly state: string;
  readonly who: string;
  /** The event it is done for, in words (a new event, none, or for which event). */
  readonly serves: string;
  readonly returnsTo: string;
  readonly steps: readonly { readonly name: string; readonly at: "done" | "current" | "todo"; readonly ring?: StateRingState }[];
  /** The buttons at the card's foot, drawn by the caller: stop, add a note, retry this step, open in its plugin. */
  readonly actions: string;
}

/** One task's card, in the panel's place, with the way back to the list. */
export function renderTaskCard(card: TaskCardView): string {
  const steps = card.steps.map(step => `<div class="task-step" data-step="${step.at}">${ring(step.at === "done" ? "done" : step.at === "current" ? step.ring ?? "running" : "idle")}<span class="task-step-name">${escapeHtml(step.name)}</span></div>`).join("");
  return `<section class="task-panel" data-task-panel data-task-card="${escapeHtml(card.id)}" role="dialog" aria-label="${escapeHtml(card.title)}">`
    + `<header class="task-panel-head">${mark(card.owner)}<span class="task-panel-title">${escapeHtml(card.title)}</span><span class="task-panel-counts">${escapeHtml(card.state)}</span>${iconButton("back", uiText.text("workbench.work-line.back-to-list"), { "data-task-panel-list": "" })}${iconButton("x", uiText.text("workbench.work-line.close"), { "data-task-panel-close": "" })}</header>`
    + `<div class="task-panel-body" data-card><dl class="task-facts"><dt>${uiText("workbench.work-line.who")}</dt><dd>${escapeHtml(card.who)}</dd>`
    + `<dt>${uiText("workbench.work-line.for-event")}</dt><dd><span>${escapeHtml(card.serves)}</span>${renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.work-line.change"), attrs: { "data-place-change": card.id, "aria-haspopup": "menu" } })}</dd>`
    + `<dt>${uiText("workbench.work-line.returns-to")}</dt><dd>${escapeHtml(card.returnsTo)}</dd></dl>`
    + `<div class="event-card-section"><h4>${uiText("workbench.work-line.steps")}</h4>${steps}</div>${card.actions ? `<div class="event-card-actions">${card.actions}</div>` : ""}</div></section>`;
}

/** Under a reply: where the work was placed, with "change". `kind` picks the glyph: a pin for an event, a list for none. */
export function renderReplyPlaced(placed: { readonly task: string; readonly where: string; readonly kind: "event" | "none" }): string {
  return `<div class="reply-placed">${icon(placed.kind === "none" ? "list" : "pin")}<span>${uiText("workbench.work-line.placed")}</span><span class="reply-placed-where">${escapeHtml(placed.where)}</span>`
    + `${renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.work-line.change"), attrs: { "data-place-change": placed.task, "aria-haspopup": "menu" } })}</div>`;
}

/** Above a reply the Assistant gave by itself: which task it came back from. */
export function renderReplyReturned(task: string): string {
  return `<span class="reply-returned">${icon("refresh")}<span class="reply-returned-name">${escapeHtml(uiText.text("workbench.work-line.returned-task", { task }))}</span></span>`;
}

/** Under a reply: the Assistant carried on within what was asked, and how many times it may still do so by itself. */
export function renderReplyCarried(round: number, most: number): string {
  return `<div class="reply-carried">${icon("zap")}<span>${escapeHtml(uiText.text("workbench.work-line.carried-within-request-n-of-most", { n: round, most }))}</span></div>`;
}

/** The dot on a main conversation's tab that is not the current one, when a task handed back there. */
export function renderTabUnread(): string {
  return `<i class="assistant-tab-unread" role="img" aria-label="${uiText("workbench.work-line.result-came-back")}"></i>`;
}

/** The event card that heads an event's tab: who registered it and its state, "park in the side panel", then the body the caller draws for its kind. */
export function renderEventCard(card: { readonly id: string; readonly facts: string; readonly body: string }): string {
  return `<article class="event-card" data-event-card="${escapeHtml(card.id)}"><div class="event-card-head"><span class="event-card-facts">${escapeHtml(card.facts)}</span>`
    + `${iconButton("sidebar", uiText.text("workbench.work-line.park-side-panel"), { "data-event-park": card.id })}</div>${card.body}</article>`;
}

/** With the dialog closed: the latest reply above the composer, with the task mark and the way to open the dialog. */
export function renderReplyPeek(peek: { readonly who: { readonly name: string; readonly character?: boolean }; readonly returned?: string; readonly body: string; readonly mark: string }): string {
  return `<div class="reply-peek" data-reply-peek role="status"><div class="reply-peek-head">${renderReplyWho(peek.who)}<span>${escapeHtml(peek.who.name)}</span>${peek.returned ? renderReplyReturned(peek.returned) : ""}<span class="reply-peek-fill"></span>${peek.mark}`
    + `${iconButton("chevron-up", uiText.text("workbench.work-line.open-conversation"), { "data-dialog-open": "" })}</div>${peek.body}</div>`;
}

/** Once the person has clicked the work surface the reply folds away: only the task mark and the way to open the dialog stay. */
export function renderReplyMini(taskMark: string): string {
  return `<div class="reply-mini" data-reply-mini>${taskMark}${iconButton("chevron-up", uiText.text("workbench.work-line.open-conversation"), { "data-dialog-open": "" })}</div>`;
}
