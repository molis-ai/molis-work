import { escapeHtml, icon, renderButton, renderMenu, renderMenuItem, renderStateRing, t as uiText, type PluginIconName, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The markup of the work line's parts (specs/work-line §4, scheme E of docs/design/work-line-32; rules in styles/work-line.ts).
 * Each function draws one part from plain values, so the component board and the product draw the same thing: the board gives
 * sample values (work-line-specimens.ts), the product will give what the line read, the task table and the conversation hold.
 * Nothing here reads a Home, knows a plugin by name or decides a state: the caller says what state a thing is in. Where a
 * drawn part rests or floats is browser/work-line-layout.ts, run after each draw.
 */

/** Who registered an event: the glyph and hue its Manifest declares (no hue: the neutral ink), and its name for a title. */
export interface LineOwnerView { readonly name: string; readonly glyph: PluginIconName; readonly hue: string }

/**
 * The states a capsule is drawn in. "" is an event with nothing behind it; `queued` and `running` have tasks waiting their turn
 * or being worked on; `done` ended. The others ask for attention and show their state as a word, at every width: `wait` needs the
 * person, `failed`, `stopped` (by the person), `verify` (it ended while disconnected, so the result is to be checked), `gone` (its
 * source no longer has it), `denied` (the person may not view it; it has no name here).
 */
export type LineEventState = "" | "queued" | "running" | "wait" | "failed" | "stopped" | "verify" | "done" | "gone" | "denied";

const ATTENTION: ReadonlySet<LineEventState> = new Set(["wait", "failed", "stopped", "verify", "gone", "denied"]);

export interface LineEventView {
  readonly id: string;
  /** Empty for a `denied` event. */
  readonly title: string;
  readonly owner: LineOwnerView;
  /** What sort of thing it is, in the owner's words (a to-do, a change, a meeting): read out with the name (WLN-17), not drawn. */
  readonly kind: string;
  readonly state: LineEventState;
  /** The state in the owner's own words, as the line read gave it this time: read out always, and drawn for a state that asks for attention. */
  readonly stateLabel: string;
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
const attr = (name: string, value: string | undefined) => value ? ` ${name}="${escapeHtml(value)}"` : "";
const text = (className: string, value: string) => `<span class="${className}">${escapeHtml(value)}</span>`;

/** The mark of who registered a thing: its glyph on its hue. */
export const renderOwnerMark = (owner: LineOwnerView) => `<span class="work-event-mark"${owner.hue ? ` style="--event-hue:var(--hue-${escapeHtml(owner.hue)})"` : ""} aria-hidden="true">${icon(owner.glyph)}</span>`;

/** One event on the line. Its accessible name is the owner, the kind, the title, the state and the note, so a reader hears more than a sighted person sees, never less. */
export function renderLineEvent(event: LineEventView): string {
  const attention = ATTENTION.has(event.state);
  const tasks = event.tasks && event.tasks.count > 0
    ? `<span class="work-event-tasks">${ring(event.tasks.lead)}${event.tasks.count > 1 ? event.tasks.count : ""}</span>`
    : event.state === "done" ? `<span class="work-event-tasks">${ring("done")}</span>` : "";
  const label = [event.owner.name, event.kind, event.title, event.stateLabel, event.note].filter(Boolean).join(" · ");
  return `<button type="button" class="work-event" data-work-event="${escapeHtml(event.id)}" data-state="${event.state}"${attention ? " data-attn" : ""}${event.fresh ? " data-fresh" : ""}${event.current ? ' aria-current="true"' : ""} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">`
    + `${renderOwnerMark(event.owner)}${event.state === "denied" ? icon("lock") : text("work-event-name", event.title)}${attention ? text("work-event-state", event.stateLabel) : ""}${event.note ? text("work-event-note", event.note) : ""}${tasks}</button>`;
}

/** A source that could not be read stands beside the head as its own dashed item, never scrolled out of sight: the rest of the line is unaffected, and it can be tried again. */
export function renderLineUnreadable(source: string): string {
  const label = uiText.text("workbench.work-line.source-unreadable-retry", { source });
  return `<button type="button" class="work-event" data-work-line-retry data-state="unreadable" data-attn aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon("circle-alert")}${text("work-event-name", source)}${text("work-event-state", uiText.text("workbench.work-line.unreadable-retry"))}${icon("refresh")}</button>`;
}

/** What the line shows is the last it knew and is being checked (WLN-29): since when, and a press asks again. */
export function renderLineChecking(since: string): string {
  const label = since ? uiText.text("workbench.work-line.checking-as-of", { time: since }) : uiText.text("workbench.work-line.checking");
  return `<button type="button" class="work-event" data-work-line-checking data-state="verify" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon("refresh")}${text("work-event-name", label)}</button>`;
}

/** The line's head (WLN-19): the work item the line belongs to, its state ring when it has one, and how many of its events wait for the person. With a `menu` (the id of the menu it opens, empty while that menu is not mounted) it opens that menu; without one (a project's own line, which has nothing to switch to yet) a press goes to what the line belongs to. */
export function renderLineHead(head: { readonly name: string; readonly waiting: number; readonly ring?: StateRingState; readonly menu?: string }): string {
  const waiting = head.waiting > 0 ? `<span class="work-line-count" aria-hidden="true">${head.waiting}</span>` : "";
  const label = head.waiting > 0 ? uiText.text("workbench.work-line.head-with-waiting", { name: head.name, n: head.waiting }) : head.name;
  return `<button type="button" class="work-line-head" data-work-line-head data-waiting="${head.waiting}"${head.menu !== undefined ? ` aria-haspopup="menu" aria-expanded="false"${attr("aria-controls", head.menu || undefined)}` : ""} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">`
    + `${head.ring ? ring(head.ring) : icon("folder")}${text("work-line-head-name", head.name)}${waiting}${head.menu !== undefined ? icon("chevron-down") : ""}</button>`;
}

/**
 * The whole line. `past` are the events that happened, `active` the ones being worked on or waiting for the person (they sit
 * next to now, at the end of the left wing), `next` what comes after; `slot` is what stands in the middle (the composer and
 * what floats above it), drawn by the caller. When the left wing cannot hold its events the oldest go out of sight first, and
 * the button after the head says how many (and whether one of them asks for attention) and brings them back; the layout script
 * counts and shows it. The head and any unreadable source are the line's lead: they stay put while the rest scrolls.
 */
export function renderWorkLine(line: {
  readonly head: string; readonly past: readonly LineEventView[]; readonly active: readonly LineEventView[]; readonly next: readonly LineEventView[];
  readonly unreadable?: readonly string[]; readonly slot: string;
}): string {
  const run = (events: readonly LineEventView[]) => events.map(renderLineEvent).join("");
  const earlier = `<button type="button" class="work-line-earlier" data-work-line-earlier aria-label="${uiText("workbench.work-line.earlier-events")}" hidden>`
    + `${icon("chevron-left")}<span data-count></span><span class="work-line-earlier-attn" data-attn-count hidden>${icon("circle-alert")}<span data-n></span></span></button>`;
  const latest = `<button type="button" class="work-line-earlier work-line-latest" data-work-line-latest aria-label="${uiText("workbench.work-line.back-to-now")}" title="${uiText("workbench.work-line.back-to-now")}" hidden>${icon("chevron-right")}</button>`;
  return `<div class="work-line" data-work-line role="region" aria-label="${uiText("workbench.work-line.work-line")}">`
    + `<div class="work-line-row"><div class="work-line-track" data-work-line-track><div class="work-line-wing" data-wing="past"><div class="work-line-lead">${line.head}${(line.unreadable ?? []).map(renderLineUnreadable).join("")}</div>${earlier}`
    + `<div class="work-line-run" role="group" aria-label="${uiText("workbench.work-line.done-and-in-progress")}">${run(line.past)}${run(line.active)}</div>${latest}</div>`
    + `<span class="work-line-now" aria-hidden="true">${uiText("workbench.work-line.now")}</span>`
    + `<div class="work-line-wing" data-wing="next"><div class="work-line-run" data-overflow-fade role="group" aria-label="${uiText("workbench.work-line.next")}">${run(line.next)}</div><span class="work-line-label" aria-hidden="true">${uiText("workbench.work-line.next")}</span></div></div>`
    + `<div class="work-line-slot" data-work-line-slot>${line.slot}</div></div></div>`;
}

/** Who a reply is from: the Assistant's glyph, or a Character's initial. */
export function renderReplyWho(who: { readonly name: string; readonly character?: boolean }): string {
  return who.character ? `<span class="work-reply-who" aria-hidden="true">${escapeHtml(Array.from(who.name)[0] ?? "")}</span>` : `<span class="work-reply-who" data-who="assistant" aria-hidden="true">AI</span>`;
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
  return `<button type="button" class="work-task-mark" data-task-mark aria-expanded="${Boolean(view.expanded)}"${attr("aria-controls", view.panel)}${view.needsYou ? " data-needs-you" : ""}${view.failed ? " data-failed" : ""}${view.offline ? " data-offline" : ""} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">`
    + `${view.offline ? icon("circle-alert") : view.lead ? ring(view.lead) : icon("activity")}${view.count > 0 ? `<span class="work-task-mark-count" data-background-tasks-count>${view.count}</span>` : ""}</button>`;
}

export interface TaskRowView {
  readonly id: string;
  readonly title: string;
  readonly ring: StateRingState;
  /** The step it is on first, then who is doing it; or why it waits. */
  readonly step: string;
  /** The event it is done for; null when it belongs to none. Left out inside an event's own card. */
  readonly serves?: string | null;
  readonly done?: boolean;
  /** The one control the row offers in place: stop while it runs, retry once it failed, "decide" where it waits on the person. */
  readonly control?: "stop" | "retry" | "decide";
}

/** One task: its ring, its name, the step it is on, which event it is done for (each on its own line, so none squeezes another), and the control it offers in place. */
export function renderTaskRow(row: TaskRowView): string {
  const none = row.serves === null ? uiText.text("workbench.work-line.no-event") : "";
  const serves = row.serves === undefined ? ""
    : `<span class="work-task-serves"${row.serves === null ? ' data-serves="none"' : ""} title="${escapeHtml(row.serves ?? none)}">${row.serves === null ? "" : icon("link")}${text("work-task-serves-name", row.serves ?? none)}</span>`;
  const control = row.control ? renderButton({ variant: row.control === "decide" ? "primary" : "secondary", size: "sm", label: uiText.text(`workbench.work-line.${row.control === "decide" ? "go-handle" : row.control}`), attrs: { "data-task-control": row.control, "data-task": row.id } }) : "";
  return `<div class="work-task-row" data-state="${row.done ? "done" : "live"}"><button type="button" class="work-task-row-main" data-task-open="${escapeHtml(row.id)}">${ring(row.ring)}`
    + `<span class="work-task-row-text"><span class="work-task-row-title" title="${escapeHtml(row.title)}">${escapeHtml(row.title)}</span><span class="work-task-row-step" title="${escapeHtml(row.step)}">${escapeHtml(row.step)}</span>${serves}</span></button>${control}</div>`;
}

export interface TaskDecisionView {
  /** The task that asks, and the owner's id of what it asks. */
  readonly task: string; readonly id: string;
  readonly ask: string; readonly why?: string;
  /** The asking task's name, where the card is not that task's own. */
  readonly from?: string;
  readonly changes: readonly { readonly label: string; readonly value: string }[];
  /** The answers the owner offers; none: the person decides where the task opens. */
  readonly answers: readonly ("approve" | "revise" | "reject")[];
  /** The first decision a card lists carries its one primary button. */
  readonly lead: boolean;
  /** 「改一下」 was pressed: the field for the words stands in place of the answers. */
  readonly revising: boolean;
  readonly busy: boolean;
}

/**
 * What a task that stopped asks the person (specs/work-line §4.4, WLN-10): the question, why, what agreeing would change — one
 * place a line — and the answers. Agreeing is the card's one primary button; a waiting state is said by the ring and the words.
 */
export function renderTaskDecision(view: TaskDecisionView): string {
  const say = (key: string, values?: Record<string, string | number>) => uiText.text(`workbench.work-line.${key}`, values);
  const button = (role: string, variant: "primary" | "secondary", attrs: Record<string, string>) => renderButton({ variant, size: "sm", label: say(`decision-${role}`), attrs: { ...attrs, ...(view.busy ? { disabled: "" } : {}) } });
  const why = [view.from ? say("decision-from", { task: view.from }) : "", view.why ?? ""].filter(Boolean).join(" · ");
  const changes = view.changes.map(line => `<div><dt title="${escapeHtml(line.label)}">${escapeHtml(line.label)}</dt><dd title="${escapeHtml(line.value)}">${escapeHtml(line.value)}</dd></div>`).join("");
  const answers = view.revising
    ? `<textarea class="work-decision-note" data-decision-note rows="2" maxlength="2000" aria-label="${escapeHtml(say("decision-how"))}" placeholder="${escapeHtml(say("decision-how"))}"${view.busy ? " disabled" : ""}></textarea>`
      + `<div class="work-card-actions">${button("send", "primary", { "data-decision-send": "" })}${button("cancel", "secondary", { "data-decision-cancel": "" })}</div>`
    : `<div class="work-card-actions">${view.answers.length
      ? view.answers.map(role => button(role, role === "approve" && view.lead ? "primary" : "secondary", { "data-decision-answer": role })).join("")
      : renderButton({ variant: view.lead ? "primary" : "secondary", size: "sm", label: say("go-handle"), attrs: { "data-decision-go": "" } })}</div>`;
  return `<section class="work-decision" data-task-decision="${escapeHtml(view.id)}" data-task="${escapeHtml(view.task)}" aria-label="${escapeHtml(view.ask)}"${view.busy ? ' aria-busy="true"' : ""}>`
    + `<div class="work-decision-ask">${ring("approval")}<strong title="${escapeHtml(view.ask)}">${escapeHtml(view.ask)}</strong></div>`
    + (why ? `<p class="work-decision-why" title="${escapeHtml(why)}">${escapeHtml(why)}</p>` : "")
    + (changes ? `<dl class="work-decision-changes" aria-label="${escapeHtml(say("decision-changes"))}">${changes}</dl>` : "") + answers + `</section>`;
}

const iconButton = (glyph: PluginIconName, label: string, attrs: Record<string, string>) => renderButton({ variant: "ghost", size: "sm", icon: glyph, iconOnly: true, label, attrs });

export interface TaskCountsView { readonly working: number; readonly needsYou: number; readonly failed: number }

/** How many wait for the person, failed, or are being worked on (in the list's order); "all done" when none is left. */
export function renderTaskCounts(counts: TaskCountsView): string {
  // A ring and a number each, so the head holds them in any language; the words are the title and what a reader hears.
  const one = (kind: string, state: StateRingState, n: number) => {
    const words = escapeHtml(uiText.text(`workbench.work-line.n-${kind}`, { n }));
    return n ? `<span data-count="${kind}" role="img" aria-label="${words}" title="${words}">${ring(state)}<span aria-hidden="true">${n}</span></span>` : "";
  };
  const parts = one("need-you", "answer", counts.needsYou) + one("failed", "failed", counts.failed) + one("working", "running", counts.working);
  return `<span class="work-task-counts">${parts || uiText("workbench.work-line.all-done")}</span>`;
}

/**
 * The task panel as a list: the tasks that have not ended (those waiting for the person first, then the failed ones — the
 * caller orders them), then the ones just handed back. With nothing at all it says so. When the connection is lost every
 * state is only what was last heard: each row says so and offers no control, and a banner at the foot has the way to reconnect.
 */
export function renderTaskPanel(panel: {
  readonly id?: string; readonly live: readonly TaskRowView[]; readonly returned: readonly TaskRowView[];
  readonly counts?: TaskCountsView; readonly offlineSince?: string;
}): string {
  const any = panel.live.length + panel.returned.length > 0, offline = panel.offlineSince !== undefined;
  const row = (view: TaskRowView) => renderTaskRow(offline && !view.done
    ? { id: view.id, title: view.title, ring: "verify", step: uiText.text("workbench.work-line.state-unverified-was", { step: view.step }), ...(view.serves === undefined ? {} : { serves: view.serves }) } : view);
  const rows = any
    ? panel.live.map(row).join("") + (panel.returned.length ? `<div class="work-task-group">${uiText("workbench.work-line.just-handed-back")}</div>${panel.returned.map(row).join("")}` : "")
    : `<div class="work-task-empty">${uiText("workbench.work-line.nothing-running-background-tasks-show-here")}</div>`;
  const banner = offline ? `<div class="work-task-banner" role="status">${icon("circle-alert")}${text("work-task-banner-text", uiText.text("workbench.work-line.disconnected-states-as-of", { time: panel.offlineSince ?? "" }))}${renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.work-line.reconnect"), attrs: { "data-task-reconnect": "" } })}</div>` : "";
  return `<section class="work-task-panel"${attr("id", panel.id)} data-task-panel role="dialog" aria-label="${uiText("workbench.work-line.background-tasks")}">`
    + `<header class="work-task-panel-head">${icon("activity")}<span class="work-task-panel-title">${uiText("workbench.work-line.background-tasks")}</span>${any && panel.counts && !offline ? renderTaskCounts(panel.counts) : ""}${iconButton("x", uiText.text("workbench.work-line.close"), { "data-task-panel-close": "" })}</header>`
    + `<div class="work-task-panel-body">${rows}</div>${banner}</section>`;
}

/** One step of a task's breakdown: done, the one being worked on (with its ring), or still to do; `who` says who does it where a card lists several doers. */
export interface TaskStepView { readonly name: string; readonly at: "done" | "current" | "todo"; readonly ring?: StateRingState; readonly who?: string }

/** A task's breakdown, one step a row. */
export function renderTaskSteps(steps: readonly TaskStepView[]): string {
  return steps.map(step => `<div class="work-task-step" data-step="${step.at}">${ring(step.at === "done" ? "done" : step.at === "current" ? step.ring ?? "running" : "idle")}${text("work-task-step-name", step.name)}${step.who ? text("work-task-step-who", step.who) : ""}</div>`).join("");
}

export interface TaskCardView {
  readonly id: string;
  /** The panel's element id, when the task mark names what it controls. */
  readonly panel?: string;
  readonly title: string;
  readonly owner: LineOwnerView;
  readonly ring: StateRingState;
  readonly state: string;
  readonly who: string;
  /** The event it is done for, in words (a new event, none, or for which event). */
  readonly serves: string;
  readonly returnsTo: string;
  readonly steps: readonly TaskStepView[];
  /** The buttons at the card's foot, drawn by the caller: stop, add a note, retry this step, open in its plugin. */
  readonly actions: string;
  /** What it asks the person to decide, drawn by the caller with `renderTaskDecision`; it stands first. */
  readonly decisions?: string;
}

/** One task's card, in the panel's place, with the way back to the list. The head holds only its name; its state stands with the other facts. */
export function renderTaskCard(card: TaskCardView): string {
  const steps = renderTaskSteps(card.steps);
  const fact = (key: string, value: string, more = "") => `<dt>${uiText(`workbench.work-line.${key}`)}</dt><dd>${more}<span title="${escapeHtml(value)}">${escapeHtml(value)}</span>`;
  return `<section class="work-task-panel"${attr("id", card.panel)} data-task-panel data-task-card="${escapeHtml(card.id)}" role="dialog" aria-label="${escapeHtml(card.title)}">`
    + `<header class="work-task-panel-head">${renderOwnerMark(card.owner)}<span class="work-task-panel-title" title="${escapeHtml(card.title)}">${escapeHtml(card.title)}</span>${iconButton("back", uiText.text("workbench.work-line.back-to-list"), { "data-task-panel-list": "" })}${iconButton("x", uiText.text("workbench.work-line.close"), { "data-task-panel-close": "" })}</header>`
    + `<div class="work-task-panel-body" data-card>${card.decisions ?? ""}<dl class="work-task-facts">${fact("state", card.state, ring(card.ring))}</dd>${fact("who", card.who)}</dd>`
    + `${fact("for-event", card.serves)}${renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.work-line.change"), attrs: { "data-place-change": card.id, "aria-haspopup": "menu" } })}</dd>`
    + `${fact("returns-to", card.returnsTo)}</dd></dl><div data-task-acceptance hidden></div>`
    + `<div class="work-card-section"><h4>${uiText("workbench.work-line.steps")}</h4>${steps}</div>${card.actions ? `<div class="work-card-actions">${card.actions}</div>` : ""}</div></section>`;
}

/** Where a task can go from its card (specs/work-line §4.5): an event of the line, an event of its own, or none. The one it is on now is ticked. */
export function renderPlaceMenu(menu: { readonly task: string; readonly events: readonly { readonly id: string; readonly title: string; readonly current: boolean }[]; readonly own: boolean; readonly none: boolean }): string {
  const to = (kind: string, label: string, checked: boolean, event?: string) => renderMenuItem({ label, checked, attrs: { "data-place-to": kind, ...(event ? { "data-place-event": event } : {}) } });
  return renderMenu({ className: "work-place-menu", attrs: { "data-place-menu": menu.task, "aria-label": uiText.text("workbench.work-line.for-event") },
    items: menu.events.map(event => to("event", event.title, event.current, event.id)).join("")
      + to("new_event", uiText.text("workbench.work-line.register-as-event"), menu.own) + to("none", uiText.text("workbench.work-line.no-event"), menu.none) });
}

/** The task panel in its place by a dialog: beside it, or over its right side where there is no room (the layout script decides). `dialog` is the dialog's element id. */
export const renderTaskFloat = (dialog: string, panel: string) => `<div class="work-task-float" data-work-task-float="${escapeHtml(dialog)}">${panel}</div>`;

/**
 * Where the Assistant put a piece of work (WLN-32): added to a task of an event that exists, done for an event, a new event on
 * the line, another work item, or no event at all (then it is only in the background tasks). `name` is the event's, or the
 * other work item's.
 */
export type ReplyPlacement = { readonly kind: "supplement" | "for-event" | "new-event" | "other-item"; readonly name: string } | { readonly kind: "none" };

const PLACED_GLYPH = { "supplement": "pin", "for-event": "pin", "new-event": "plus", "other-item": "folder", "none": "list" } as const satisfies Record<ReplyPlacement["kind"], PluginIconName>;

/** Under a reply: where the work was placed, with "change". */
export function renderReplyPlaced(placed: { readonly task: string; readonly where: ReplyPlacement }): string {
  const where = placed.where.kind === "none" ? uiText.text("workbench.work-line.placed-none") : uiText.text(`workbench.work-line.placed-${placed.where.kind}`, { name: placed.where.name });
  return `<div class="work-reply-placed" data-placed="${placed.where.kind}">${icon(PLACED_GLYPH[placed.where.kind])}<span class="work-reply-placed-where" title="${escapeHtml(where)}">${escapeHtml(where)}</span>`
    + `${renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.work-line.change"), attrs: { "data-place-change": placed.task, "aria-haspopup": "menu" } })}</div>`;
}

/**
 * In the main conversation, where a task done for an event on the line waits on the person (WLN-06; user decision 2026-11-15):
 * the platform writes this row itself, with no model, at once — one per task and decision — with 「去处理」, which opens the
 * event's tab. Once the task no longer waits it folds into a line that says so, with nothing to press.
 */
export function renderReplyWaiting(row: { readonly key: string; readonly task: string; readonly event: string; readonly settled: boolean }): string {
  const words = row.settled ? uiText.text("workbench.work-line.waiting-settled", { task: row.task }) : uiText.text("workbench.work-line.waiting-on-you", { task: row.task, event: row.event });
  return `<div class="work-reply-waiting" role="status" data-waiting="${row.settled ? "settled" : "open"}">${ring(row.settled ? "done" : "answer")}<span class="work-reply-waiting-text" title="${escapeHtml(words)}">${escapeHtml(words)}</span>`
    + (row.settled ? "" : renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.work-line.go-handle"), attrs: { "data-waiting-go": row.key, "aria-label": uiText.text("workbench.work-line.go-handle-task", { task: row.task }) } })) + "</div>";
}

/** Above a reply the Assistant gave by itself: which task handed back, or which task failed. */
export function renderReplyReturned(task: string, failed = false): string {
  return `<span class="work-reply-returned"${failed ? ' data-state="failed"' : ""}>${icon(failed ? "circle-alert" : "refresh")}${text("work-reply-returned-name", uiText.text(failed ? "workbench.work-line.task-failed" : "workbench.work-line.handed-back-task", { task }))}</span>`;
}

/** Under a reply: the Assistant carried on within what was asked, and how many times it may still do so by itself. */
export function renderReplyCarried(round: number, most: number): string {
  return `<div class="work-reply-carried">${icon("zap")}<span>${escapeHtml(uiText.text("workbench.work-line.carried-within-request-n-of-most", { n: round, most }))}</span></div>`;
}

/** The dot on a main conversation's tab that is not the current one, when a task handed back there. */
export function renderTabUnread(): string {
  return `<i class="work-tab-unread" role="img" aria-label="${uiText("workbench.work-line.result-came-back")}"></i>`;
}

/**
 * The event card: who registered the event and its state, then the body the caller draws. In an event's tab it carries "park in
 * the side panel"; parked there (`parked`) it names the event, since no tab does, and carries the way back to the dialog and its close.
 */
export function renderEventCard(card: { readonly id: string; readonly facts: string; readonly body: string; readonly parked?: boolean; readonly title?: string; readonly mark?: string }): string {
  const id = escapeHtml(card.id), name = card.parked ? `<span class="work-card-name" data-card-name>${card.mark ?? ""}<strong title="${escapeHtml(card.title ?? "")}">${escapeHtml(card.title ?? "")}</strong></span>` : "";
  const buttons = card.parked
    ? iconButton("message", uiText.text("workbench.work-line.back-to-dialog"), { "data-event-unpark": card.id }) + iconButton("x", uiText.text("workbench.work-line.close"), { "data-event-close": card.id })
    : iconButton("sidebar", uiText.text("workbench.work-line.park-side-panel"), { "data-event-park": card.id });
  return `<article class="work-card" data-event-card="${id}"${card.parked ? " data-parked" : ""}><div class="work-card-head">${name}<span class="work-card-facts" title="${escapeHtml(card.facts)}">${escapeHtml(card.facts)}</span>${buttons}</div>${card.body}</article>`;
}

/**
 * What the card of something done offers (WLN-11): the result in its owner's own words where the owner declared no display, the
 * way to open it as a tab, and the way to put it on the Shelf (said as done once it is there).
 */
export function renderCardResult(result: { readonly id: string; readonly preview: string; readonly open: boolean; readonly shelf: "" | "busy" | "done" }): string {
  const say = (key: string) => uiText.text(`workbench.work-line.${key}`), id = escapeHtml(result.id);
  return `${result.preview ? `<div class="work-card-quote work-card-preview">${escapeHtml(result.preview)}</div>` : ""}<div class="work-card-actions">`
    + (result.open ? renderButton({ variant: "secondary", size: "sm", icon: "external", label: say("open-as-tab"), attrs: { "data-event-open": id } }) : "")
    + renderButton({ variant: "secondary", size: "sm", icon: result.shelf === "done" ? "check" : "bookmark", label: say(result.shelf === "done" ? "on-shelf" : "put-on-shelf"), attrs: { "data-event-shelve": id, ...(result.shelf ? { disabled: "" } : {}) } }) + "</div>";
}

/** How it was done, under what was done: the rows of the tasks behind a finished event, folded until asked for (WLN-11). */
export function renderCardProcess(rows: string): string {
  return `<details class="work-card-section work-card-process"><summary>${uiText("workbench.work-line.process")}</summary>${rows}</details>`;
}

/** With the dialog closed: the latest reply above the composer, with the task mark and the way to open the dialog. Only the reply itself is announced. */
export function renderReplyPeek(peek: { readonly who: { readonly name: string; readonly character?: boolean }; readonly returned?: string; readonly body: string; readonly mark: string }): string {
  return `<div class="work-reply-peek" data-reply-peek><div class="work-reply-peek-head">${renderReplyWho(peek.who)}<span>${escapeHtml(peek.who.name)}</span>${peek.returned ? renderReplyReturned(peek.returned) : ""}<span class="work-reply-peek-fill"></span>${peek.mark}`
    + `${iconButton("chevron-up", uiText.text("workbench.work-line.open-conversation"), { "data-dialog-open": "" })}</div><div class="work-reply-peek-body" role="status">${peek.body}</div></div>`;
}

/** Once the person has clicked the work surface the reply folds away: only the task mark and the way to open the dialog stay. */
export function renderReplyMini(taskMark: string): string {
  return `<div class="work-reply-mini" data-reply-mini>${taskMark}${iconButton("chevron-up", uiText.text("workbench.work-line.open-conversation"), { "data-dialog-open": "" })}</div>`;
}
