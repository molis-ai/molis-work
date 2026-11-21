/**
 * The foot of the workbench as the bottom bar's thirteenth version drew it (specs/screen-polish §4「底栏第十三版」; specs/work-line
 * §16): from what the page's one attention read (`molis-work:attention`, scripts/client/attention.ts) says is on this project's
 * line it counts 办完, 在办 and 接下来 inside the input, draws the list each opens (one row per event, the tasks behind it under
 * it; the smallest piece, where the info bar will stand), puts what waits for the person in the card stack, and gives the first
 * place in the top strip its amber count. It has no beat of its own (contract-design §11): when something here needs a newer
 * answer it asks for the read again (`molis-work:attention-refresh`). Nothing is kept between reads: an event's name and state are
 * what its owner said this time, and a source that could not be read heads each list and can be asked again. The page is served
 * with an empty foot, so nothing here runs before the shell is drawn.
 *
 * The background-task mark and the panel it opens are in work-task-panel.ts; they paint from the same read.
 *
 * Bundled by esbuild into dist/work-bar-client.js and carried in workbench.js; the workbench's start calls the page global
 * `molisWorkBar` once its shell is drawn (not in a pane-embedded page, which has no bar).
 */
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { StateRingState, UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { BackgroundTasksReadResult, MainlineIssue, WorkLineEvent, WorkLineReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { escapeHtml, format, renderStateRing, t as uiText, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { EARLIER_AFTER, WORK_LISTS, renderLineChecking, renderLineEvent, renderLineUnreadable, renderListEarlier, renderOwnerMark, renderReplyPlaced, renderReplyWaiting, renderStackCard, renderStackEmpty, type LineEventState, type LineEventView, type WorkListId } from "../work-line-parts.js";
import { installAcceptance } from "./work-acceptance.js";
import { installEventCards, type EventCardHandle, type EventCardOpen, type PositionViews } from "./work-event-card.js";
import { ASKS, FAILED, installTaskPanel } from "./work-task-panel.js";
import { installWorkLineLayout } from "./work-line-layout.js";

/** What the workbench gives the line: where its routes are, how a thing opens in the work area, and the dialog an event's tab opens in. */
export interface WorkBarHost {
  route(path: string): string;
  /** A press on an event: its tab in the Assistant's dialog (specs/work-line §4.4). `mark` is its owner's mark as the line draws it. */
  openEvent(event: { subject: ActionSubject; title: string; mark: string }): void;
  /** Back to now: the main conversation in front and the caret in the one input. */
  toNow(): void;
  openItem(surface: string, id: string, title: string): void;
  openSurface(surface: string): void;
  /** An object known only by reference opens where its owner's reader says (`objects.open@1`); false when it has no page or cannot be read. */
  openObject?(subject: ActionSubject): Promise<boolean>;
  /** The platform's composed displays, for an event card's body: the page part and the read it asks through. */
  positions?(): PositionViews | null | undefined;
  positionRead?(path: string, body: unknown, signal: AbortSignal): Promise<unknown>;
  /** A card was parked in the side panel: the dialog puts that event's tab away and closes. */
  parked?(subject: ActionSubject): void;
  /** The dialog put away or brought back, its tabs as they were: the requirement column takes its place while it is open. */
  dialog?(open: boolean): void;
}

const RUNNING: ReadonlySet<StateRingState> = new Set(["doing", "starting", "running", "generating", "saving", "indexing", "syncing", "retrying"]);
const QUEUED: ReadonlySet<StateRingState> = new Set(["queued", "waiting"]);
const STOPPED: ReadonlySet<StateRingState> = new Set(["paused", "stopped", "cancelled", "interrupted"]);
const CHECK: ReadonlySet<StateRingState> = new Set(["verify", "conflict", "partial", "disconnected"]);
const DONE: ReadonlySet<StateRingState> = new Set(["done", "saved", "round-ended", "staged"]);

/** The capsule's state: what waits for the person first, then what the line read says is behind the event. */
function stateOf(event: WorkLineEvent): LineEventState {
  const ring = event.line_state;
  if (event.waiting || (ring && ASKS.has(ring))) return "wait";
  if (!ring) return "";
  return FAILED.has(ring) ? "failed" : CHECK.has(ring) ? "verify" : STOPPED.has(ring) ? "stopped" : RUNNING.has(ring) ? "running" : QUEUED.has(ring) ? "queued" : DONE.has(ring) ? "done" : "";
}

/** A plugin's hue on the tab strip is its hue on the line; one that declares none is drawn in the neutral ink. */
function hues(): Map<string, string> {
  try {
    const entries = JSON.parse(document.querySelector("script[data-plugin-directory]")?.textContent || "[]") as Array<{ id: string; hue: string | null }>;
    return new Map(entries.flatMap(entry => entry.hue ? [[entry.id, entry.hue] as const] : []));
  } catch { return new Map(); }
}

/** What the line takes back: which event's tab is the dialog's current one (none at "now"). */
export interface WorkBarHandle {
  focus(subject: ActionSubject | null): void;
  /** The event of this object on the line as last read, as a press on it would open it; null when the line does not show it. */
  event(subject: ActionSubject): LineEventPress | null;
  /** Every event the line last showed, as a press on it would open it: what 「发给」 lists (specs/work-line §4.4). */
  events(): LineEventPress[];
  /** Under a reply that handed a task to the background: where the task stands on the line as last read, with 「改」 (WLN-32). */
  placed(task: { subject: ActionSubject; title: string; serves: readonly ActionSubject[]; own: boolean }): string;
  /** 「改」 was pressed: the task's card in the background-task panel, with where it can go. */
  place(subject: ActionSubject): void;
  /**
   * The rows the main conversation shows for tasks that wait on the person (WLN-06): one per task and decision, from when this
   * page first heard it wait (`at`), folded once it no longer waits. Kept for this page only: the table is what says it waits.
   */
  waiting(): { key: string; at: string; settled: boolean; html: string }[];
  /** 「去处理」 on such a row: the event's tab, as a press on the event opens it. */
  goWaiting(key: string): void;
  /** The event card in a place the caller gives (an event's tab). Parked cards are the line's own, in the side panel. */
  card(slot: HTMLElement, card: EventCardOpen): EventCardHandle;
}
export type LineEventPress = Parameters<WorkBarHost["openEvent"]>[0];

/** How many wait is the first place's amber count (POLISH-15); the Assistant's bell reads the same attribute. */
function paintWaiting(waiting: number): void {
  const cell = document.querySelector<HTMLElement>("[data-top-corner-toggle]");
  if (!cell) return;
  const name = cell.dataset.name ?? (cell.dataset.name = cell.getAttribute("aria-label") ?? "");
  const label = waiting > 0 ? uiText.text("workbench.work-line.head-with-waiting", { name, n: waiting }) : name;
  cell.setAttribute("aria-label", label); cell.dataset.waiting = String(waiting);
  let count = cell.querySelector<HTMLElement>(".top-corner-count");
  if (waiting > 0 && !count) { count = document.createElement("span"); count.className = "top-corner-count"; count.setAttribute("aria-hidden", "true"); cell.querySelector(".top-corner-page-name")?.after(count); }
  if (count) { count.textContent = String(waiting); count.hidden = waiting === 0; }
}

/** The account bar's 通知 opens the Assistant's notices (the bell beside the input) and says the same count. */
function installNoticesKey(): void {
  const notices = document.querySelector<HTMLElement>("[data-bar-notices]"), bell = document.querySelector<HTMLElement>("[data-assistant-attention]");
  if (!notices || !bell) return;
  notices.addEventListener("click", () => { notices.focus({ preventScroll: true }); bell.click(); });
  const mirror = () => {
    const count = notices.querySelector<HTMLElement>("[data-bar-notices-count]"), n = Number(/\d+/.exec(bell.querySelector("[data-assistant-attention-count]")?.textContent ?? "")?.[0] ?? 0);
    if (count) { count.hidden = !n; count.textContent = String(n); }
    notices.setAttribute("aria-expanded", bell.getAttribute("aria-expanded") ?? "false");
  };
  new MutationObserver(mirror).observe(bell, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-expanded", "hidden"] });
  mirror();
}

interface FootParts { readonly line: HTMLElement; readonly counts: HTMLElement }
interface ListParts extends FootParts { readonly lists: HTMLElement; readonly body: HTMLElement; readonly sources: HTMLElement | null; readonly heading: HTMLElement }
interface ListReads {
  wing(id: WorkListId): WorkLineEvent[];
  /** The sources that could not be read, drawn. */
  issues(): string;
  row(event: WorkLineEvent, fresh: boolean): string;
  /** Whether this event is the dialog's current tab. */
  current(id: string): boolean;
}

/**
 * The three lists (§4「底栏第十三版」第 4 条, the smallest piece until the info bar comes): 办完, 在办 or 接下来 opens its list above
 * the card stack, one row per event, 办完 cut at `EARLIER_AFTER` with 更早 N; a source that cannot be read stands above what
 * scrolls, whichever list is open (WLN-37). Keys (WLN-17 as §16 rewrote it): ↑ ↓ move between the rows, Enter is the row's own
 * press, Esc closes the list and gives the focus back to its key.
 */
function installLists({ line, counts, lists, body, sources, heading }: ListParts, read: ListReads) {
  let open: WorkListId | "" = "", earlier = false;
  const rowsShown = () => open ? [...body.querySelectorAll<HTMLElement>(`[data-work-list-rows="${open}"] :is([data-work-event],[data-work-lists-earlier])`)] : [];
  const focus = () => { for (const node of body.querySelectorAll<HTMLElement>("[data-work-event]")) { if (read.current(node.dataset.workEvent ?? "")) node.setAttribute("aria-current", "true"); else node.removeAttribute("aria-current"); } };
  const draw = (fresh: (event: WorkLineEvent) => boolean = () => false) => {
    if (sources) sources.innerHTML = read.issues();
    body.innerHTML = WORK_LISTS.map(({ id }) => {
      const all = read.wing(id), cut = id === "done" && !earlier ? all.slice(0, EARLIER_AFTER) : all;
      return `<div class="work-list" data-work-list-rows="${id}"${open === id ? "" : " hidden"}>${all.length ? cut.map(event => read.row(event, fresh(event))).join("") : `<p class="work-lists-empty">${uiText("workbench.work-line.list-empty")}</p>`}`
        + `${all.length > cut.length ? renderListEarlier(all.length - cut.length) : ""}</div>`;
    }).join("");
    for (const key of counts.querySelectorAll<HTMLElement>("[data-work-list]")) {
      const id = key.dataset.workList as WorkListId, n = read.wing(id).length, name = uiText.text(`workbench.work-line.list-${id}`);
      key.querySelector("[data-n]")!.textContent = String(n);
      key.toggleAttribute("data-zero", n === 0);
      key.setAttribute("aria-label", uiText.text("workbench.work-line.list-count", { name, n }));
    }
    focus();
  };
  const show = (id: WorkListId | "", give = false) => {
    const was = open;
    open = id;
    if (id !== "done") earlier = false;
    lists.hidden = !open; line.toggleAttribute("data-list-open", Boolean(open));
    if (open) {
      heading.textContent = uiText.text(`workbench.work-line.list-${open}`);
      line.removeAttribute("data-stack-open"); counts.querySelector("[data-work-stack-toggle]")?.setAttribute("aria-expanded", "false");
    }
    for (const rows of body.querySelectorAll<HTMLElement>("[data-work-list-rows]")) rows.hidden = rows.dataset.workListRows !== open;
    for (const key of counts.querySelectorAll<HTMLElement>("[data-work-list]")) key.setAttribute("aria-expanded", String(key.dataset.workList === open));
    if (give && open) rowsShown()[0]?.focus();
    if (give && !open && was) counts.querySelector<HTMLElement>(`[data-work-list="${was}"]`)?.focus();
  };
  line.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null, key = target?.closest<HTMLElement>("[data-work-list]");
    if (key) show(open === key.dataset.workList ? "" : key.dataset.workList as WorkListId);
    else if (target?.closest("[data-work-lists-close]")) show("", true);
    else if (target?.closest("[data-work-lists-earlier]")) { earlier = true; draw(); rowsShown()[EARLIER_AFTER]?.focus(); }
  });
  lists.addEventListener("keydown", event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); show("", true); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const all = rowsShown(), at = all.indexOf(document.activeElement as HTMLElement), to = all[at + (event.key === "ArrowDown" ? 1 : -1)];
    if (to) { event.preventDefault(); to.focus(); }
  });
  counts.addEventListener("keydown", event => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); show("", true); }
    else if (event.key === "ArrowDown" && open && event.target instanceof Element && event.target.closest("[data-work-list]")) { event.preventDefault(); rowsShown()[0]?.focus(); }
  });
  document.addEventListener("click", event => {
    if (!open) return;
    const path = event.composedPath(), target = event.target instanceof Element ? event.target : null;
    if (!path.includes(lists) && !target?.closest("[data-work-list]")) show("");
  });
  return { draw, focus, close: () => { if (open) show(""); } };
}

/**
 * The card stack (§4「底栏第十三版」第 5 条): what waits for the person, one card in front, 该你 · 还有 N 件 › bringing the next;
 * under 960px it is 该你 N inside the input, and its card opens above the input (第 6 条). A card the person is on is not swapped
 * under them (POLISH-42).
 */
function installStack({ line, counts, stack }: FootParts & { readonly stack: HTMLElement }, read: { waiting(): WorkLineEvent[]; card(event: WorkLineEvent, more: number): string; closeLists(): void }) {
  let front = "";
  const close = (give = false) => {
    if (!line.hasAttribute("data-stack-open")) return;
    line.removeAttribute("data-stack-open");
    const chip = counts.querySelector<HTMLElement>("[data-work-stack-toggle]");
    chip?.setAttribute("aria-expanded", "false");
    if (give) chip?.focus();
  };
  const paint = (prefer?: string) => {
    const all = read.waiting(), chip = counts.querySelector<HTMLElement>("[data-work-stack-toggle]");
    if (chip) { chip.hidden = !all.length; chip.querySelector("[data-n]")!.textContent = String(all.length); chip.setAttribute("aria-label", uiText.text("workbench.work-line.your-turn-n", { n: all.length })); }
    if (!all.length) { front = ""; close(); stack.innerHTML = renderStackEmpty(); stack.removeAttribute("data-count"); return; }
    const held = stack.contains(document.activeElement) || stack.matches(":hover");
    const event = (!held && prefer ? all.find(one => one.id === prefer) : undefined) ?? all.find(one => one.id === front) ?? all[0]!;
    front = event.id;
    const onButton = document.activeElement instanceof HTMLElement && stack.contains(document.activeElement) ? [...stack.querySelectorAll("button")].indexOf(document.activeElement as HTMLButtonElement) : -1;
    stack.innerHTML = read.card(event, all.length - 1); stack.dataset.count = String(all.length);
    if (onButton >= 0) stack.querySelectorAll<HTMLElement>("button")[onButton]?.focus();
  };
  line.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null, toggle = target?.closest("[data-work-stack-toggle]");
    if (toggle) {
      const on = !line.hasAttribute("data-stack-open");
      if (on) read.closeLists();
      line.toggleAttribute("data-stack-open", on); toggle.setAttribute("aria-expanded", String(on));
    } else if (target?.closest("[data-work-stack-next]")) {
      const all = read.waiting(), at = all.findIndex(one => one.id === front);
      front = all[(at + 1) % all.length]?.id ?? ""; paint(); stack.querySelector<HTMLElement>("[data-work-stack-next]")?.focus();
    }
  });
  document.addEventListener("click", event => {
    const path = event.composedPath(), target = event.target instanceof Element ? event.target : null;
    if (line.hasAttribute("data-stack-open") && !path.includes(stack) && !target?.closest("[data-work-stack-toggle]")) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.defaultPrevented && line.hasAttribute("data-stack-open")) { event.preventDefault(); close(true); }
  });
  return { paint, close };
}

export function installWorkBar(host: WorkBarHost): WorkBarHandle | undefined {
  const bar = document.querySelector<HTMLElement>("[data-work-bar]"), line = bar?.querySelector<HTMLElement>("[data-work-line]");
  const counts = line?.querySelector<HTMLElement>("[data-work-counts]"), stack = line?.querySelector<HTMLElement>("[data-work-stack]");
  const lists = line?.querySelector<HTMLElement>("[data-work-lists]"), body = lists?.querySelector<HTMLElement>("[data-work-lists-body]"), sources = lists?.querySelector<HTMLElement>("[data-work-lists-sources]") ?? null, heading = lists?.querySelector<HTMLElement>("[data-work-lists-title]");
  const { molisWorkRequest: request, molisCraft: craft } = globalThis as typeof globalThis & { molisWorkRequest?: UiRequest; molisCraft?: { ask?(node: Element | null): void } };
  if (!bar || !line || !counts || !stack || !lists || !body || !heading || !request) return undefined;
  installWorkLineLayout(bar);
  const hue = hues();
  let events = new Map<string, WorkLineEvent>(), issues: readonly MainlineIssue[] = [], shown = "", focused = "";
  const keyOf = (subject: ActionSubject) => `${subject.kind}:${subject.id}`;
  const again = () => document.dispatchEvent(new CustomEvent("molis-work:attention-refresh"));
  // The last line this tab knew, kept for this tab only: after a reload it stands at once, said to be checked, until the read confirms it (WLN-29).
  const kept = `molis.work-line.last:${document.body.dataset.projectId ?? ""}`;
  let knownAt: string | null = null;
  const checking = (since: string | null) => {
    for (const chip of counts.querySelectorAll("[data-work-line-checking]")) chip.remove();
    line.toggleAttribute("data-checking", since !== null);
    if (since !== null) counts.insertAdjacentHTML("afterbegin", renderLineChecking(since ? format.date(since, "time") : ""));
  };

  const view = (event: WorkLineEvent, fresh: boolean): LineEventView => {
    const state = stateOf(event), behind = event.tasks.running + event.tasks.waiting, quiet = state === "" || state === "running" || state === "queued";
    // The owner's one line about the event is said once: as the note of a quiet event, as the state of one that asks for a look.
    return {
      id: event.id, title: event.title, kind: "", state, stateLabel: quiet ? "" : state === "wait" && !event.needs_attention ? uiText.text("workbench.work-line.waiting-for-you") : event.summary,
      owner: { name: event.origin.title, glyph: event.origin.icon as PluginIconName, hue: hue.get(event.origin.surface) ?? "" },
      ...(quiet && event.summary ? { note: event.summary } : {}),
      ...(behind > 0 ? { tasks: { count: behind, lead: event.tasks.waiting > 0 ? "answer" as const : "running" as const } } : {}),
      ...(fresh ? { fresh: true } : {}), ...(focused === keyOf(event.subject) ? { current: true } : {}),
    };
  };
  const press = (event: WorkLineEvent): LineEventPress => ({ subject: event.subject, title: event.title, mark: renderOwnerMark(view(event, false).owner) });
  const wing = (id: WorkListId) => [...events.values()].filter(event => event.wing === id).sort((a, b) => a.rank - b.rank);

  // A row of a list: the event, then the tasks behind it under it.
  const rowOf = (event: WorkLineEvent, fresh: boolean) => `<div class="work-list-item"${event.suggestion ? " data-suggested" : ""}>${renderLineEvent(view(event, fresh))}`
    + `${panel.brief(event.subject).map(task => `<p class="work-list-task">${renderStateRing({ state: task.ring, size: 12 })}<span title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</span>${task.step ? `<small title="${escapeHtml(task.step)}">${escapeHtml(task.step)}</small>` : ""}</p>`).join("")}</div>`;
  const list = installLists({ line, counts, lists, body, sources, heading }, {
    wing, row: rowOf, current: id => { const event = events.get(id); return event ? keyOf(event.subject) === focused : false; },
    issues: () => [...new Set(issues.map(issue => issue.title))].map(renderLineUnreadable).join(""),
  });
  // The card in front: its first question, at most two answers on the card (a reason to write and the rest are behind 打开 ›).
  const waitingEvents = () => [...events.values()].filter(event => stateOf(event) === "wait").sort((a, b) => Number(a.wing !== "now") - Number(b.wing !== "now") || a.rank - b.rank);
  const cardOf = (event: WorkLineEvent, more: number) => {
    const ask = panel.questions(event.subject)[0], said = view(event, false);
    return renderStackCard({ id: event.id, title: event.title, owner: said.owner, more,
      ask: ask?.ask ?? (said.stateLabel || event.summary || uiText.text("workbench.work-line.waiting-for-you")),
      ...(ask ? { decision: { task: ask.task, id: ask.id, busy: ask.busy, answers: ask.answers.filter(role => role !== "revise").slice(0, 2) } } : {}) });
  };
  const cardStack = installStack({ line, counts, stack }, { waiting: waitingEvents, card: cardOf, closeLists: list.close });

  const draw = (result: WorkLineReadResult) => {
    const before = events;
    events = new Map(result.events.map(event => [event.id, event]));
    issues = result.issues;
    // The same events in the same states are the same lists: nothing is redrawn, so a press or a scroll under way is not lost.
    const drawn = JSON.stringify([result.events.map(event => [event.id, event.title, event.summary, event.wing, event.rank, stateOf(event), event.tasks.running, event.tasks.waiting, Boolean(event.suggestion)]), result.issues.map(issue => issue.title)]);
    if (drawn === shown) return;
    const first = shown === "";
    shown = drawn;
    list.draw(event => !first && !before.has(event.id));
    paintWaiting(result.events.filter(event => stateOf(event) === "wait").length);
    const arrived = first ? [] : result.events.filter(event => stateOf(event) === "wait" && (!before.get(event.id) || stateOf(before.get(event.id)!) !== "wait"));
    cardStack.paint(arrived[0]?.id);
    // An event that came to wait for the person since the last read says so once (the shared "your turn" ring) on the stack.
    if (arrived.length) craft?.ask?.(stack);
  };

  // The tasks this page heard wait on the person, by task and decision (WLN-06): the row stays, folded, once the task no longer waits.
  const asked = new Map<string, { at: string; provider: string; title: string; event: WorkLineEvent; settled: boolean }>();
  const panel = installTaskPanel(host, { events: () => events.values(), press, keyOf, hue, again, request, repaint: () => { cards.paint(); cardStack.paint(); }, acceptance: (slot, target) => acceptance.overview(slot, () => [target]) });

  const eventOf = (subject: ActionSubject) => [...events.values()].find(one => keyOf(one.subject) === keyOf(subject));
  // Requirements hang on the event's own object or on the tasks done for it; the card asks about both.
  const acceptance = installAcceptance(host.route, request, open => { if (open) { list.close(); cardStack.close(); } host.dialog?.(open); });
  const cards = installEventCards(host, { event: eventOf, keyOf, press, rows: panel.rows, decisions: panel.decisions,
    acceptance: (slot, subject) => acceptance.overview(slot, () => { const event = eventOf(subject); return [...(event ? [{ provider_id: event.source.provider_id, subject }] : []), ...panel.subjects(subject)]; }),
    // Who registered it, then how it stands: the owner's own line about it, or that it waits for the person.
    facts: event => { const { stateLabel, note } = view(event, false); return [uiText.text("workbench.work-line.registered-by", { plugin: event.origin.title }), stateLabel || note].filter(Boolean).join(" · "); } });

  line.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-work-line-retry]")) { again(); return; }
    if (target.closest("[data-work-line-checking]")) { again(); return; }
    const openId = target.closest<HTMLElement>("[data-work-event]")?.dataset.workEvent
      ?? target.closest<HTMLElement>("[data-work-stack-open]")?.dataset.workStackOpen
      ?? (!target.closest("button,a,input,textarea") ? target.closest<HTMLElement>("[data-work-stack-card]")?.dataset.workStackCard : undefined);
    const pressed = events.get(openId ?? "");
    if (pressed) { if (target.closest("[data-work-stack]")) cardStack.close(); if (target.closest("[data-work-lists]") && window.innerWidth < 960) list.close(); host.openEvent(press(pressed)); }
  });
  // Keyboard (WLN-17 as §16 rewrote it): Alt+L puts focus on the card in front, else on the first of the three (the lists' keys: installLists).
  document.addEventListener("keydown", event => {
    if (event.code !== "KeyL" || !event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || (event.target instanceof Element && event.target.closest(".xterm"))) return;
    event.preventDefault();
    const stackButton = stack.offsetParent ? stack.querySelector<HTMLElement>("button") : null;
    (stackButton ?? counts.querySelector<HTMLElement>("[data-work-stack-toggle]:not([hidden])") ?? counts.querySelector<HTMLElement>("[data-work-list]"))?.focus();
  });
  // A part the read could not get is null: what the bar shows stays.
  document.addEventListener("molis-work:attention", event => {
    const { line: read, tasks: table, started } = (event as CustomEvent<{ line?: WorkLineReadResult | null; tasks?: BackgroundTasksReadResult | null; started: number }>).detail;
    if (read) { draw(read); checking(null); knownAt = new Date().toISOString(); try { sessionStorage.setItem(kept, JSON.stringify({ at: knownAt, line: read })); } catch { /* a convenience of this tab */ } }
    if (table) panel.take(table, started);
    panel.offline(null);
    cards.paint();
    acceptance.refresh();
  });
  // Not heard: what is shown stays, said to be as of the last read; nothing is redone or restarted from here (WLN-05, WLN-29).
  document.addEventListener("molis-work:attention-unreachable", event => {
    // Not heard since this page opened: as of the line it kept.
    const since = (event as CustomEvent<{ since?: string | null }>).detail?.since ?? knownAt;
    checking(since ?? ""); panel.offline(since ? format.date(since, "time") : "");
  });
  installNoticesKey();
  try {
    const last = JSON.parse(sessionStorage.getItem(kept) ?? "null") as { at: string; line: WorkLineReadResult } | null;
    if (last?.line && Array.isArray(last.line.events)) { draw(last.line); knownAt = last.at; checking(last.at); }
  } catch { /* nothing kept */ }
  return {
    event(subject) { const found = eventOf(subject); return found ? press(found) : null; },
    card: cards.mount,
    events: () => [...events.values()].map(press),
    placed(task) {
      const served = task.serves.map(subject => [...events.values()].find(one => keyOf(one.subject) === keyOf(subject))).find(Boolean);
      return renderReplyPlaced({ task: keyOf(task.subject), where: served ? { kind: "for-event", name: served.title } : task.own ? { kind: "new-event", name: task.title } : { kind: "none" } });
    },
    place: subject => panel.place(subject),
    waiting() {
      const now = panel.waiting(), live = new Set(now.map(one => one.key));
      for (const one of now) asked.set(one.key, { at: asked.get(one.key)?.at ?? new Date().toISOString(), provider: one.provider, title: one.title, event: one.event, settled: false });
      // A task that is not in the table because its provider could not be read is not known to wait no longer: its row stays as it was.
      const unread = panel.unreadable();
      for (const [key, one] of asked) if (!live.has(key) && !unread.has(one.provider)) one.settled = true;
      return [...asked].map(([key, one]) => ({ key, at: one.at, settled: one.settled, html: renderReplyWaiting({ key, task: one.title, event: one.event.title, settled: one.settled }) }));
    },
    goWaiting(key) { const one = asked.get(key); if (one && !one.settled) host.openEvent(press(events.get(one.event.id) ?? one.event)); },
    // The outline moves with the dialog's current tab; the event keeps its place in its list (WLN-07).
    focus(subject) { focused = subject ? keyOf(subject) : ""; list.focus(); },
  };
}

(globalThis as { molisWorkBar?: (host: WorkBarHost) => WorkBarHandle | undefined }).molisWorkBar = installWorkBar;
