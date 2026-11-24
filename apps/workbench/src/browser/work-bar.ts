/**
 * The foot of the workbench and the information column's lists (specs/screen-polish §4「底栏第十三版」; specs/work-line §2, §4):
 * from what the page's one attention read (`molis-work:attention`, scripts/client/attention.ts) says is on this project's line it
 * counts 办完, 在办 and 接下来 — inside the input while the conversation is closed, on the information column's tabs while it is
 * open — draws the list each opens (one row per event, the tasks behind it under it, a sub-agent's step one level further in),
 * puts what waits for the person in the card stack, marks the key that opens the conversation, and gives the first place in the
 * top strip its amber count. It has no beat of its own (contract-design §11): when something here needs a newer answer it asks
 * for the read again (`molis-work:attention-refresh`). Nothing is kept between reads: an event's name and state are what its
 * owner said this time, and a source that could not be read heads each list and can be asked again. The page is served with an
 * empty foot, so nothing here runs before the shell is drawn.
 *
 * The tasks behind the events are in work-tasks.ts and an event's information in work-event-card.ts; they paint from the same read.
 *
 * The project home browser entry carries this program in workbench.js so both share the SDK's text and renderers.
 */
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { StateRingState, UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { BackgroundTasksReadResult, MainlineIssue, WorkLineEvent, WorkLineReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { format, t as uiText, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { EARLIER_AFTER, WORK_LISTS, renderLineChecking, renderLineEvent, renderLineUnreadable, renderListEarlier, glyphOfEvent, renderListGroup, renderParkedList, renderStateGlyph, renderPlaceCard, renderReplyPlaced, renderReplyWaiting, renderStackCard, renderStackEmpty, renderStackLook, renderStackMain, renderStackOtherItems, type LineEventState, type LineEventView, type LineOwnerView, type WorkListId } from "../work-line-parts.js";
import { installAcceptance } from "./work-acceptance.js";
import { installEventCards, type EventCardHandle, type EventCardOpen, type PositionViews } from "./work-event-card.js";
import { ASKS, FAILED, installTasks, type SubtaskRef } from "./work-tasks.js";
import { installWorkLineLayout } from "./work-line-layout.js";

type WorkLineDisplay = Pick<WorkLineReadResult, "events" | "issues">;

/** What the workbench gives the foot: where its routes are, how a thing opens in the work area, and the conversation an event is talked about in. */
export interface WorkBarHost {
  route(path: string): string;
  /** A press on an event: its conversation in the conversation column and its page in the work area (specs/work-line §4.4). `mark` is its owner's mark as the foot draws it. */
  openEvent(event: { subject: ActionSubject; title: string; mark: string; owner: string }, quiet?: boolean): void;
  /** Back to now: the main conversation in front and the caret in the one input (`quiet`: without the caret). */
  toNow(quiet?: boolean): void;
  openItem(surface: string, id: string, title: string): void;
  openSurface(surface: string): void;
  /** An object known only by reference opens where its owner's reader says (`objects.open@1`); false when it has no page or cannot be read. */
  openObject?(subject: ActionSubject): Promise<boolean>;
  /** The platform's composed displays, for an event card's body: the page part and the read it asks through. */
  positions?(): PositionViews | null | undefined;
  positionRead?(path: string, body: unknown, signal: AbortSignal): Promise<unknown>;
  /** A card was parked in the side panel: the dialog puts that event's tab away and closes. */
  parked?(subject: ActionSubject): void;
  /** The conversation put away or brought back as it was: the requirement column takes its place while it is open. */
  dialog?(open: boolean): void;
  /** The steps given to sub-agents that the Assistant's page knows of, and a press on one: its own conversation in the float. */
  subtasks?(): readonly SubtaskRef[];
  openSubtask?(key: string): void;
  /** The Assistant's main conversation waits for the person's confirmation: what it asks, in one line; null when it does not (or it is in front). */
  mainWaiting?(): { ask: string } | null;
  /** That conversation, opened and in front. */
  openMain?(): void;
  /** The objects that want a look, as the page last read them (the bell's objects). */
  attention?(): readonly ActionSubject[];
  /** Their list, opened over the key that asked. */
  openAttention?(from: HTMLElement, only: readonly ActionSubject[]): void;
  /** Where things said here are kept, by its name: the project (the work item, once one is chosen — batch 37). */
  placeName?(): string;
  /** What is in front in the focused pane: an object's tab or a surface's own page, or a system view; null under a cover. */
  front?(): { surface: string; id: string } | { owner: string; id: string } | null;
}

/** The owner name of the pages the platform draws for events that have none of their own (system-tabs: `[data-system-view-owner]`). */
const EVENT_PAGES = "event";

const RUNNING: ReadonlySet<StateRingState> = new Set(["doing", "starting", "running", "generating", "saving", "indexing", "syncing", "retrying"]);
const QUEUED: ReadonlySet<StateRingState> = new Set(["queued", "waiting"]);
const STOPPED: ReadonlySet<StateRingState> = new Set(["paused", "stopped", "cancelled", "interrupted"]);
const CHECK: ReadonlySet<StateRingState> = new Set(["verify", "conflict", "partial", "disconnected"]);
const DONE: ReadonlySet<StateRingState> = new Set(["done", "saved", "round-ended", "staged"]);

/** The event's state: what waits for the person first, then what the line read says is behind the event; an event that says nothing of itself while a task is running for it is being done. */
function stateOf(event: WorkLineEvent): LineEventState {
  const ring = event.line_state;
  if (event.waiting || (ring && ASKS.has(ring))) return "wait";
  if (!ring) return event.tasks.running > 0 ? "running" : "";
  return FAILED.has(ring) ? "failed" : CHECK.has(ring) ? "verify" : STOPPED.has(ring) ? "stopped" : RUNNING.has(ring) ? "running" : QUEUED.has(ring) ? "queued" : DONE.has(ring) ? "done" : "";
}

/** A plugin's hue on the tab strip is its hue on the line; one that declares none is drawn in the neutral ink. */
function hues(): Map<string, string> {
  try {
    const entries = JSON.parse(document.querySelector("script[data-plugin-directory]")?.textContent || "[]") as Array<{ id: string; hue: string | null }>;
    return new Map(entries.flatMap(entry => entry.hue ? [[entry.id, entry.hue] as const] : []));
  } catch { return new Map(); }
}

/** What the foot takes back and gives the conversation. */
export interface WorkBarHandle {
  /** Which event the conversation column is about (none: the main conversation). `said`: a reply is there to be read. */
  focus(subject: ActionSubject | null): void;
  /** The Assistant's works changed (a reply came, the main conversation came to wait or no longer does): the expand key and the stack follow. */
  conversation(state: { unread: boolean }): void;
  /** The event of this object on the line as last read, as a press on it would open it; null when the line does not show it. */
  /** The event as a press on it would hand it over, with where it stands now (`group`: in the stack, or one of the lists). */
  event(subject: ActionSubject): (LineEventPress & { group: WorkListId | "you" }) | null;
  /** Every event the line last showed, as a press on it would open it: what 「发给」 lists (specs/work-line §4.4). */
  events(): LineEventPress[];
  /** Under a reply that handed a task to the background: where the task stands on the line as last read, with 「改」 (WLN-32). */
  placed(task: { subject: ActionSubject; title: string; serves: readonly ActionSubject[]; own: boolean }): string;
  /** 「改」 was pressed: the task's card in the information column's place, with where it can go. */
  place(subject: ActionSubject): void;
  /**
   * The rows the main conversation shows for tasks that wait on the person (WLN-06): one per task and decision, from when this
   * page first heard it wait (`at`), folded once it no longer waits. Kept for this page only: the table is what says it waits.
   */
  waiting(): { key: string; at: string; settled: boolean; html: string }[];
  /** 「去处理」 on such a row: the event, as a press on it opens it. */
  goWaiting(key: string): void;
  /** What is known about an event, in a place the caller gives (the information column). Parked cards are the foot's own, in the side panel. */
  card(slot: HTMLElement, card: EventCardOpen): EventCardHandle;
}
export type LineEventPress = Parameters<WorkBarHost["openEvent"]>[0];

/** How many wait is the first place's amber count (POLISH-15); the Assistant's bell reads the same attribute. */
function paintWaiting(waiting: number): void {
  const cell = document.querySelector<HTMLElement>("[data-top-corner-toggle]");
  if (!cell) return;
  const project = cell.querySelector(".top-corner-project-name")?.textContent?.trim();
  const page = cell.querySelector(".top-corner-page-name")?.textContent?.trim();
  const tip = cell.getAttribute("title")?.trim();
  const name = project && page
    ? `${project} › ${page}${tip ? ` · ${tip}` : ""}`
    : cell.dataset.name ?? (cell.dataset.name = cell.getAttribute("aria-label") ?? "");
  const label = waiting > 0 ? uiText.text("workbench.work-line.head-with-waiting", { name, n: waiting }) : name;
  cell.setAttribute("aria-label", label);
  cell.dataset.waiting = String(waiting);
  let count = cell.querySelector<HTMLElement>(".top-corner-count");
  if (waiting > 0 && !count) {
    count = document.createElement("span");
    count.className = "top-corner-count";
    count.setAttribute("aria-hidden", "true");
    cell.querySelector(".top-corner-page-name")?.after(count);
  }
  if (count) {
    count.textContent = String(waiting);
    count.hidden = waiting === 0;
  }
}

interface FootParts { readonly line: HTMLElement; readonly counts: HTMLElement }
interface ListParts extends FootParts { readonly column: HTMLElement; readonly tabs: HTMLElement; readonly lists: HTMLElement; readonly body: HTMLElement; readonly sources: HTMLElement | null; readonly heading: HTMLElement; readonly dialog: HTMLElement }
interface ListReads {
  wing(id: WorkListId): WorkLineEvent[];
  /** The sources that could not be read, drawn. */
  issues(): string;
  row(event: WorkLineEvent, fresh: boolean): string;
  /** What closes 在办: the tasks that belong to no event, drawn; empty when there are none. */
  unplaced(): string;
  /** Whether this event is the one the conversation column is about. */
  current(id: string): boolean;
  /** How many wait for the person here (the number in the top-left place). */
  waiting(): number;
  /** Bring the conversation up (a key inside the input was pressed while it was closed) or ask whether it is. */
  dialog(open?: boolean): boolean;
  /** Another tab was chosen: the float that stood in the column's place goes. */
  closeFloat(): boolean;
  /** A list was parked in the side panel or taken out of it. */
  parkedChanged(): void;
  /** The shared motion of one thing going to a new place (DESIGN.md Motion, `molisCraft.carry`), where the page has it. */
  carry?: ((from: Element, change: () => unknown) => unknown) | undefined;
}
type InfoTab = "info" | WorkListId;

/**
 * The information column's tabs and the three lists (§4「底栏第十三版」第 4 条): 信息 is what is known about the thing in front;
 * 办完, 在办 or 接下来 puts its list in the column's place — one row per event, the tasks behind it under it, 办完 cut at
 * `EARLIER_AFTER` with 更早 N, 在办 closed by the tasks that belong to no event; a source that cannot be read stands above what
 * scrolls, whichever list is open (WLN-37). While the conversation is closed the same three are keys inside the input: a press
 * opens the conversation on that list. A list can be parked in the side panel (the pin): it stays there, drawn from the same read.
 * Keys (WLN-17): ← → move between the tabs, ↑ ↓ between the rows, Enter is the row's own press, Esc goes back to 信息.
 */
function installLists({ line, counts, column, tabs, lists, body, sources, heading, dialog }: ListParts, read: ListReads) {
  let open: InfoTab = "info", earlier = false, lastHtml = "";
  const counted = new Map<WorkListId, number>(), place = column.querySelector<HTMLElement>("[data-info-place]"), foot = lists.querySelector<HTMLElement>("[data-work-lists-foot]")!;
  const baseKey = `molis.work-line.parked-lists:${document.body.dataset.projectId ?? ""}`;
  let parkedKey = baseKey;
  const side = document.querySelector<HTMLElement>("[data-side-parked]");
  const readParked = (storageKey: string): WorkListId[] => {
    try {
      const kept = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown;
      return Array.isArray(kept) ? WORK_LISTS.map(one => one.id).filter(id => kept.includes(id)) : [];
    } catch { return []; }
  };
  let parked: WorkListId[] = readParked(parkedKey);
  const rowsShown = () => open === "info" ? [] : [...body.querySelectorAll<HTMLElement>(`[data-work-list-rows="${open}"] :is([data-work-event],[data-task-open],[data-subtask-open],[data-work-lists-earlier]):not([disabled])`)];
  const focus = () => { for (const node of document.querySelectorAll<HTMLElement>("[data-work-lists] [data-work-event], [data-parked-list] [data-work-event]")) { if (read.current(node.dataset.workEvent ?? "")) node.setAttribute("aria-current", "true"); else node.removeAttribute("aria-current"); } };
  const rowsOf = (id: WorkListId, all: boolean, fresh: (event: WorkLineEvent) => boolean) => {
    const events = read.wing(id), cut = id === "done" && !all ? events.slice(0, EARLIER_AFTER) : events, loose = id === "now" ? read.unplaced() : "";
    return `${events.length ? cut.map(event => read.row(event, fresh(event))).join("") : loose ? "" : `<p class="work-lists-empty">${uiText("workbench.work-line.list-empty")}</p>`}`
      + `${events.length > cut.length ? renderListEarlier(events.length - cut.length) : ""}${loose ? renderListGroup(uiText.text("workbench.work-line.no-event")) + loose : ""}`;
  };
  const paintParked = () => {
    if (!side) return;
    for (const node of side.querySelectorAll<HTMLElement>(":scope > [data-parked-list-slot]")) if (!parked.includes(node.dataset.parkedListSlot as WorkListId)) node.remove();
    for (const id of parked) {
      let slot = side.querySelector<HTMLElement>(`:scope > [data-parked-list-slot="${id}"]`);
      if (!slot) {
        slot = document.createElement("div");
        slot.className = "side-parked-card";
        slot.dataset.parkedListSlot = id;
        side.prepend(slot);
        slot.innerHTML = renderParkedList({ id, rows: "" });
      }
      const rows = slot.querySelector<HTMLElement>("[data-parked-rows]")!, html = rowsOf(id, true, () => false);
      if (rows.dataset.drawn !== html) {
        rows.dataset.drawn = html;
        rows.innerHTML = html;
      }
    }
    read.parkedChanged();
  };
  const keepParked = () => {
    try { localStorage.setItem(parkedKey, JSON.stringify(parked)); } catch { /* this viewer's convenience only */ }
    paintParked();
  };
  const setParkedItem = (itemId: string | null) => {
    const nextKey = itemId ? `${baseKey}:${itemId}` : baseKey;
    if (nextKey === parkedKey) return;
    parkedKey = nextKey;
    parked = readParked(parkedKey);
    paintParked();
  };
  const draw = (fresh: (event: WorkLineEvent) => boolean = () => false) => {
    const active = document.activeElement instanceof HTMLElement && body.contains(document.activeElement) ? document.activeElement : null;
    const focused = active ? (["workEvent", "taskOpen", "subtaskOpen"] as const).flatMap(key => active.dataset[key] ? [`[data-${key.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase())}="${CSS.escape(active.dataset[key]!)}"]`] : [])[0] : undefined;
    const focusedEarlier = active?.hasAttribute("data-work-lists-earlier") ?? false;
    if (sources) sources.innerHTML = read.issues();
    const nextHtml = WORK_LISTS.map(({ id }) => `<div class="work-list" data-work-list-rows="${id}">${rowsOf(id, earlier, fresh)}</div>`).join("");
    if (nextHtml !== lastHtml) {
      lastHtml = nextHtml;
      body.innerHTML = nextHtml;
      for (const rows of body.querySelectorAll<HTMLElement>("[data-work-list-rows]")) rows.hidden = rows.dataset.workListRows !== open;
      if (focused) body.querySelector<HTMLElement>(`[data-work-list-rows="${open}"] ${focused}`)?.focus({ preventScroll: true });
      else if (focusedEarlier && open !== "info") body.querySelector<HTMLElement>(`[data-work-list-rows="${open}"] [data-work-lists-earlier]`)?.focus({ preventScroll: true });
    }
    const handed = read.wing("now").some(fresh);
    for (const key of [...counts.querySelectorAll<HTMLElement>("[data-work-list]"), ...tabs.querySelectorAll<HTMLElement>("[data-info-tab]:not([data-info-tab=info])")]) {
      const id = (key.dataset.workList ?? key.dataset.infoTab) as WorkListId, n = read.wing(id).length, name = uiText.text(`workbench.work-line.list-${id}`);
      key.querySelector("[data-n]")!.textContent = String(n);
      key.toggleAttribute("data-zero", n === 0);
      key.setAttribute("aria-label", uiText.text("workbench.work-line.list-count", { name, n }));
      // Something came into this group: the key that can be seen lights once; a piece of work just handed out travels from the send key to 在办.
      if (n > (counted.get(id) ?? n) && key.offsetParent) {
        const light = () => {
          key.setAttribute("data-arrived", "");
          setTimeout(() => key.removeAttribute("data-arrived"), 700);
        };
        const send = id === "now" && handed ? line.querySelector<HTMLElement>("[data-composer-send]") : null;
        if (send?.offsetParent && read.carry) read.carry(send, () => {
          key.setAttribute("data-craft-carried", "");
          setTimeout(() => key.removeAttribute("data-craft-carried"), 700);
          light();
        });
        else light();
      }
    }
    for (const { id } of WORK_LISTS) counted.set(id, read.wing(id).length);
    // 信息 with no event in front says how the place stands, from the same read.
    if (place) {
      const html = renderPlaceCard({ waiting: read.waiting(), counts: { done: read.wing("done").length, now: read.wing("now").length, next: read.wing("next").length }, tasks: read.unplaced() });
      if (place.dataset.drawn !== html) {
        place.dataset.drawn = html;
        place.innerHTML = html;
      }
    }
    titled();
    paintParked();
    focus();
  };
  // The list's head says how many it holds.
  const titled = () => { if (open !== "info") heading.textContent = uiText.text("workbench.work-line.list-total-n", { n: read.wing(open).length }); };
  const show = (id: InfoTab, give = false) => {
    if (id !== open) read.closeFloat();
    open = id;
    if (id !== "done") earlier = false;
    column.dataset.info = open;
    lists.hidden = open === "info";
    if (open !== "info") {
      lists.setAttribute("aria-labelledby", `info-tab-${open}`);
      foot.textContent = uiText.text(`workbench.work-line.list-${open}-hint`);
    }
    titled();
    for (const rows of body.querySelectorAll<HTMLElement>("[data-work-list-rows]")) rows.hidden = rows.dataset.workListRows !== open;
    for (const tab of tabs.querySelectorAll<HTMLElement>("[data-info-tab]")) {
      const on = tab.dataset.infoTab === open;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    for (const key of counts.querySelectorAll<HTMLElement>("[data-work-list]")) key.setAttribute("aria-expanded", String(key.dataset.workList === open && read.dialog()));
    if (give) (open === "info" ? tabs.querySelector<HTMLElement>('[data-info-tab="info"]') : rowsShown()[0] ?? tabs.querySelector<HTMLElement>(`[data-info-tab="${open}"]`))?.focus();
  };
  // A key inside the input (the conversation is closed): the conversation opens on that list.
  counts.addEventListener("click", event => {
    const key = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-work-list]") : null;
    if (!key) return;
    line.removeAttribute("data-stack-open");
    counts.querySelector("[data-work-stack-toggle]")?.setAttribute("aria-expanded", "false");
    read.dialog(true);
    show(key.dataset.workList as WorkListId, true);
  });
  column.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null, tab = target?.closest<HTMLElement>("[data-info-tab]");
    // A press on the list's own tab while it shows goes back to 信息 (POLISH-68).
    if (tab) show(tab.dataset.infoTab === open ? "info" : tab.dataset.infoTab as InfoTab, tab.dataset.infoTab === open);
    else if (target?.closest("[data-place-list]")) show(target.closest<HTMLElement>("[data-place-list]")!.dataset.placeList as WorkListId, true);
    else if (target?.closest("[data-work-lists-earlier]")) { earlier = true; draw(); rowsShown()[EARLIER_AFTER]?.focus(); }
    else if (target?.closest("[data-work-lists-pin]") && open !== "info") {
      // Parked: the list stays in the side panel, the column goes back to what is known about the thing in front.
      if (!parked.includes(open)) parked = [...parked, open];
      keepParked();
      show("info");
      document.dispatchEvent(new CustomEvent("molis:side-open", { detail: { tab: "conversation", focus: false }, cancelable: true }));
    }
  });
  side?.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null, back = target?.closest<HTMLElement>("[data-list-unpark]"), close = target?.closest<HTMLElement>("[data-list-close]");
    const id = (back?.dataset.listUnpark ?? close?.dataset.listClose) as WorkListId | undefined;
    if (!id) return;
    parked = parked.filter(one => one !== id);
    keepParked();
    if (back) {
      read.dialog(true);
      show(id, true);
    }
  });
  tabs.addEventListener("keydown", event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const all = [...tabs.querySelectorAll<HTMLElement>("[data-info-tab]")], at = all.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const to = all[(at + (event.key === "ArrowRight" ? 1 : -1) + all.length) % all.length]!;
      show(to.dataset.infoTab as InfoTab);
      to.focus();
    }
    else if (event.key === "ArrowDown" && open !== "info") {
      event.preventDefault();
      rowsShown()[0]?.focus();
    }
  });
  lists.addEventListener("keydown", event => {
    if (event.metaKey || event.ctrlKey || event.altKey || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    const all = rowsShown(), at = all.indexOf(document.activeElement as HTMLElement), to = all[at + (event.key === "ArrowDown" ? 1 : -1)];
    event.preventDefault();
    (to ?? (event.key === "ArrowUp" ? tabs.querySelector<HTMLElement>(`[data-info-tab="${open}"]`) : null))?.focus();
  });
  // Esc, innermost first: a list goes back to 信息 before the conversation closes. A task's card standing in the column's
  // place, or the list of all works, is further in: this leaves the key to it (their own listeners come after this one).
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || open === "info" || dialog.hidden) return;
    if (document.querySelector("dialog[open], [data-work-task-float], [data-assistant-works]:not([hidden])")) return;
    event.preventDefault();
    event.stopPropagation();
    show("info", column.contains(document.activeElement));
  });
  // The conversation closed: the next time it opens on what is known about the thing in front.
  new MutationObserver(() => {
    line.toggleAttribute("data-dialog-open", !dialog.hidden);
    if (dialog.hidden) {
      read.closeFloat();
      show("info");
    } else show(open);
  }).observe(dialog, { attributes: true, attributeFilter: ["hidden"] });
  const retitle = () => {
    if (open !== "info") foot.textContent = uiText.text(`workbench.work-line.list-${open}-hint`);
    if (side) {
      for (const slot of side.querySelectorAll<HTMLElement>(":scope > [data-parked-list-slot]")) {
        slot.innerHTML = renderParkedList({ id: slot.dataset.parkedListSlot as WorkListId, rows: "" });
      }
    }
    draw();
  };
  line.toggleAttribute("data-dialog-open", !dialog.hidden);
  return { draw, retitle, show, shown: () => open, setParkedItem };
}

/** Semantic selector for restoring focus across a card stack redraw when button positions shift (e.g. `more` drops to 0). */
function stackFocusTarget(active: Element | null, stack: HTMLElement): string | null {
  if (!(active instanceof HTMLElement) || !stack.contains(active)) return null;
  if (active.hasAttribute("data-work-stack-next")) return "[data-work-stack-next]";
  if (active.dataset.decisionAnswer) return `[data-decision-answer="${CSS.escape(active.dataset.decisionAnswer)}"]`;
  if (active.hasAttribute("data-work-stack-open")) return "[data-work-stack-open]";
  return "button";
}

/** A card of the stack: by the id the stack keeps its place with, drawn with how many wait behind it. */
interface StackItem { readonly id: string; draw(more: number): string }

/**
 * The card stack (§4「底栏第十三版」第 5 条): what waits for the person, one card in front, 该你 · 还有 N 件 › bringing the next;
 * under 960px it is 该你 N inside the input, and its card opens above the input (第 6 条). A card the person is on is not swapped
 * under them (POLISH-42).
 */
function installStack({ line, counts, stack }: FootParts & { readonly stack: HTMLElement }, read: { waiting(): StackItem[]; counted(): void }) {
  let front = "";
  const close = (give = false) => {
    if (!line.hasAttribute("data-stack-open")) return;
    line.removeAttribute("data-stack-open");
    const chip = counts.querySelector<HTMLElement>("[data-work-stack-toggle]");
    chip?.setAttribute("aria-expanded", "false");
    if (give) chip?.focus();
  };
  const paint = (prefer?: string) => {
    // The first place's number is said with every drawing of the stack: the two count the same things (WLN-39).
    read.counted();
    const all = read.waiting(), chip = counts.querySelector<HTMLElement>("[data-work-stack-toggle]");
    if (chip) { chip.hidden = !all.length; chip.querySelector("[data-n]")!.textContent = String(all.length); chip.setAttribute("aria-label", uiText.text("workbench.work-line.your-turn-n", { n: all.length })); }
    if (!all.length) {
      const hadFocus = stack.contains(document.activeElement);
      front = ""; close(); stack.innerHTML = renderStackEmpty(); stack.removeAttribute("data-count");
      // The keys inside the input are away while the conversation is open: then the column's chosen tab, else the input.
      const seen = (node: HTMLElement) => node.getClientRects().length > 0;
      if (hadFocus) ([...counts.querySelectorAll<HTMLElement>("[data-work-list]"), ...line.querySelectorAll<HTMLElement>('[data-info-tab][aria-selected="true"]')].find(seen) ?? line.querySelector<HTMLElement>(".mw-composer__input"))?.focus({ preventScroll: true });
      return;
    }
    const held = stack.contains(document.activeElement) || stack.matches(":hover");
    const item = (!held && prefer ? all.find(one => one.id === prefer) : undefined) ?? all.find(one => one.id === front) ?? all[0]!;
    front = item.id;
    const focusSelector = stackFocusTarget(document.activeElement, stack), html = item.draw(all.length - 1);
    if (stack.dataset.drawn !== html) {
      stack.dataset.drawn = html;
      stack.innerHTML = html;
    }
    stack.dataset.count = String(all.length);
    if (focusSelector && !stack.contains(document.activeElement)) (stack.querySelector<HTMLElement>(focusSelector) ?? stack.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
  };
  line.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null, toggle = target?.closest("[data-work-stack-toggle]");
    if (toggle) {
      const on = !line.hasAttribute("data-stack-open");
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
    if (event.key === "Escape" && !event.defaultPrevented && line.hasAttribute("data-stack-open") && !document.querySelector("dialog[open]")) {
      event.preventDefault();
      close(true);
    }
  });
  document.addEventListener("molis-work:place-changed", () => close());
  window.addEventListener("molis:surface-interaction", () => close());
  window.addEventListener("blur", () => close());
  return { paint, close };
}

export function installWorkBar(host: WorkBarHost): WorkBarHandle | undefined {
  const bar = document.querySelector<HTMLElement>("[data-work-bar]"), line = bar?.querySelector<HTMLElement>("[data-work-line]");
  const counts = line?.querySelector<HTMLElement>("[data-work-counts]"), stack = line?.querySelector<HTMLElement>("[data-work-stack]");
  const dialog = document.querySelector<HTMLElement>("[data-assistant-panel]"), column = dialog?.querySelector<HTMLElement>("[data-assistant-side]"), tabs = column?.querySelector<HTMLElement>("[data-info-tabs]");
  const lists = column?.querySelector<HTMLElement>("[data-work-lists]"), body = lists?.querySelector<HTMLElement>("[data-work-lists-body]"), sources = lists?.querySelector<HTMLElement>("[data-work-lists-sources]") ?? null, heading = lists?.querySelector<HTMLElement>("[data-work-lists-title]");
  const { molisWorkRequest: request } = globalThis as typeof globalThis & { molisWorkRequest?: UiRequest };
  // The shared motion (DESIGN.md Motion) is set once the page has loaded, after this bar is mounted: it is read when it is used.
  const craft = () => (globalThis as typeof globalThis & { molisCraft?: { ask?(node: Element | null): void; carry?(from: Element, change: () => unknown): unknown } }).molisCraft;
  if (!bar || !line || !counts || !stack || !dialog || !column || !tabs || !lists || !body || !heading || !request) return undefined;
  installWorkLineLayout(bar);
  const hue = hues();
  let events = new Map<string, WorkLineEvent>(), issues: readonly MainlineIssue[] = [], shown = "", focused = "", pressing = "", paged = "", followed = false;
  let activeItemId: string | null = null, otherItemsWaiting = 0;
  let taskItems: Readonly<Record<string, { readonly item_id: string; readonly name: string }>> = {};
  const scopeGroup = lists.querySelector<HTMLElement>("[data-work-lists-scope]");
  const paintScopeToggle = () => {
    if (!scopeGroup) return;
    scopeGroup.hidden = !activeItemId;
    const mode = document.body.dataset.workLineScope === "project" ? "project" : "item";
    for (const btn of scopeGroup.querySelectorAll<HTMLElement>("[data-work-scope]")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.workScope === mode));
    }
  };
  scopeGroup?.addEventListener("click", event => {
    const btn = (event.target as Element)?.closest<HTMLElement>("[data-work-scope]");
    if (!btn?.dataset.workScope) return;
    document.body.dataset.workLineScope = btn.dataset.workScope;
    restoreScopeLine();
    paintScopeToggle();
    again();
  });
  const keyOf = (subject: ActionSubject) => `${subject.kind}:${subject.id}`;
  const again = () => document.dispatchEvent(new CustomEvent("molis-work:attention-refresh"));
  // The last line this tab knew, kept for this tab only: after a reload it stands at once, said to be checked, until the read confirms it (WLN-29).
  const projectCache = `molis.work-line.last:${document.body.dataset.projectId ?? ""}`;
  const cacheKey = () => itemScope() ? projectCache + ":item:" + activeItemId : projectCache;
  const focusKey = () => projectCache + ":focus:" + (activeItemId ?? "");
  const restoreFocus = () => { try { focused = sessionStorage.getItem(focusKey()) ?? ""; } catch { focused = ""; } };
  let knownAt: string | null = null;
  let checkingSince: string | null = null;
  const checking = (since: string | null, repaintStack = true) => {
    const was = line.hasAttribute("data-checking");
    const next = since !== null;
    checkingSince = since;
    for (const chip of counts.querySelectorAll("[data-work-line-checking]")) chip.remove();
    line.toggleAttribute("data-checking", next);
    if (next) counts.insertAdjacentHTML("afterbegin", renderLineChecking(since ? format.date(since, "time") : ""));
    if (repaintStack && was !== next) cardStack.paint();
  };

  const ownerOf = (from: { title: string; icon: string; surface: string }): LineOwnerView => ({ name: from.title, glyph: from.icon as PluginIconName, hue: hue.get(from.surface) ?? "" });
  const view = (event: WorkLineEvent, fresh: boolean): LineEventView => {
    const state = stateOf(event), behind = event.tasks.running + event.tasks.waiting, quiet = state === "" || state === "running" || state === "queued";
    // The owner's one line about the event is said once: as the note of a quiet event, as the state of one that asks for a look.
    return {
      id: event.id, title: event.title, kind: "", state, stateLabel: quiet ? "" : state === "wait" && !event.needs_attention ? uiText.text("workbench.work-line.waiting-for-you") : event.summary,
      owner: ownerOf(event.origin),
      ...(quiet && event.summary ? { note: event.summary } : {}),
      ...(behind > 0 ? { tasks: { count: behind, lead: event.tasks.waiting > 0 ? "answer" as const : "running" as const } } : {}),
      ...(fresh ? { fresh: true } : {}), ...(focused === keyOf(event.subject) ? { current: true } : {}), ...(event.suggestion ? { suggestion: true } : {}),
    };
  };
  // What a press on an event hands the conversation: its name, its state mark as the lists draw it, and who registered it.
  const press = (event: WorkLineEvent): LineEventPress => ({ subject: event.subject, title: event.title, mark: renderStateGlyph(glyphOfEvent(view(event, false))), owner: event.origin.title });
  // Where a thing stands is its state family alone (POLISH-40): what asks for the person — an answer, a failure, something to
  // check, an interruption — is a card of the stack and in no list; what is being done or waits its turn is 在办; what is done
  // is 办完; the rest (not begun, paused, a suggestion) is 接下来. Being opened or talked about moves nothing.
  const asksYou = (event: WorkLineEvent) => {
    const state = stateOf(event);
    return state === "wait" || state === "failed" || state === "verify" || event.line_state === "interrupted";
  };
  const groupOf = (event: WorkLineEvent): WorkListId | "you" => {
    const state = stateOf(event);
    return asksYou(event) ? "you" : state === "done" || event.wing === "done" ? "done" : (state === "running" || state === "queued") && !event.suggestion ? "now" : "next";
  };
  const wing = (id: WorkListId) => [...events.values()].filter(event => groupOf(event) === id).sort((a, b) => Number(a.wing !== id) - Number(b.wing !== id) || a.rank - b.rank);

  // A row of a list: the event, then the tasks behind it under it, a sub-agent's step one level further in.
  const rowOf = (event: WorkLineEvent, fresh: boolean) => `<div class="work-list-item"${event.suggestion ? " data-suggested" : ""}>${renderLineEvent(view(event, fresh))}${tasks.rows(event.subject)}</div>`;
  const list = installLists({ line, counts, column, tabs, lists, body, sources, heading, dialog }, {
    wing, row: rowOf, unplaced: () => tasks.unplaced(), waiting: () => waitingCount(), current: id => {
      const event = events.get(id);
      return event ? keyOf(event.subject) === focused : false;
    },
    issues: () => [...new Set(issues.map(issue => issue.title))].map(renderLineUnreadable).join(""),
    dialog: open => {
      if (open && dialog.hidden) host.dialog?.(true);
      return !dialog.hidden;
    },
    closeFloat: () => tasks.close(), parkedChanged: () => cards.sideChanged(), carry: (from, change) => (craft()?.carry ?? ((_from: Element, run: () => unknown) => run()))(from, change),
  });
  // What waits for the person, in the stack's order: the events (the ones beside now first), the tasks that belong to no event,
  // then the Assistant's main conversation when it waits for a confirmation and is not the one in front.
  // POLISH-44: direct answers only when one single-step decision asks with <=2 approve/reject choices, no revise input, and no pending changes list.
  const directOf = (qs: ReturnType<typeof tasks.questions>) => {
    const ask = qs[0];
    return qs.length === 1 && ask && !ask.hasChanges && !ask.answers.includes("revise") && ask.answers.length > 0 && ask.answers.length <= 2 ? ask : undefined;
  };
  const decisionOf = (qs: ReturnType<typeof tasks.questions>) => {
    const direct = directOf(qs);
    return direct ? { decision: { task: direct.task, id: direct.id, busy: direct.busy || line.hasAttribute("data-checking"), answers: direct.answers as ("approve" | "reject")[] } } : {};
  };
  const waitingEvents = () => [...events.values()].filter(asksYou).sort((a, b) => Number(a.wing !== "now") - Number(b.wing !== "now") || a.rank - b.rank);
  // What wants a look and is not already a card here: one object is never two cards. (An event about another object — an
  // Inbox entry about a source — does not cover that object: its row in the list is where it is corrected or put away.)
  const covered = (subject: ActionSubject) => waitingEvents().some(event => keyOf(event.subject) === keyOf(subject)) || tasks.loose().some(task => keyOf(task.subject) === keyOf(subject));
  const itemScope = () => Boolean(activeItemId && document.body.dataset.workLineScope !== "project");
  const toLook = () => (host.attention?.() ?? []).filter(subject =>
    (!itemScope() || taskItems[keyOf(subject)]?.item_id === activeItemId) && !covered(subject));
  const waitingItems = (): StackItem[] => {
    const main = host.mainWaiting?.() ?? null;
    const look = toLook().length;
    const other = itemScope() && otherItemsWaiting > 0 ? otherItemsWaiting : 0;
    return [
      ...waitingEvents().filter(event => dialog.hidden || keyOf(event.subject) !== focused).map(event => ({ id: event.id, draw: (more: number) => { const qs = tasks.questions(event.subject), said = view(event, false);
        return renderStackCard({ id: event.id, title: event.title, owner: said.owner, more, ask: qs[0]?.ask ?? (said.stateLabel || event.summary || uiText.text("workbench.work-line.waiting-for-you")), ...decisionOf(qs) }); } })),
      ...tasks.loose().map(task => ({ id: `task:${task.id}`, draw: (more: number) => { const qs = tasks.questions(task);
        return renderStackCard({ id: `task:${task.id}`, title: task.title, owner: ownerOf(task.origin), more, ask: qs[0]?.ask ?? (task.step?.text || uiText.text("workbench.work-line.waiting-for-you")), ...decisionOf(qs) }); } })),
      ...(main ? [{ id: "main", draw: (more: number) => renderStackMain({ ask: main.ask, more }) }] : []),
      ...(look ? [{ id: "look", draw: (more: number) => renderStackLook({ n: look, more }) }] : []),
      ...(other ? [{ id: "other-items", draw: (more: number) => renderStackOtherItems({ n: other, more }) }] : []),
    ];
  };
  const cardStack = installStack({ line, counts, stack }, { waiting: waitingItems, counted: () => paintWaiting(waitingCount()) });
  // The key that opens the conversation: a dot when a reply came while it was closed, amber when the Assistant waits for a confirmation.
  const expand = counts.querySelector<HTMLElement>("[data-dialog-open]"), dot = expand?.querySelector<HTMLElement>("[data-work-expand-dot]");
  let unread = false;
  const paintExpand = () => {
    if (!expand || !dot) return;
    const open = !dialog.hidden, waits = !open && Boolean(host.mainWaiting?.()), said = !open && unread;
    dot.hidden = !waits && !said;
    dot.toggleAttribute("data-waits", waits);
    expand.setAttribute("aria-expanded", String(open));
    const name = uiText.text(open ? "workbench.work-line.close-conversation" : waits ? "workbench.work-line.open-conversation-waits" : said ? "workbench.work-line.open-conversation-reply" : "workbench.work-line.open-conversation");
    expand.setAttribute("aria-label", name);
    expand.title = name;
  };
  expand?.addEventListener("click", () => host.dialog?.(dialog.hidden));
  // POLISH-21: a press in the work — the sheet, the tab strip, the side panel; a plugin's own page says so itself — puts the
  // conversation away whole, and so does a cover (settings) coming over the work. What opened from the conversation and stands
  // over the work (a task's card, a menu, a dialog) is not the work.
  const putAway = () => { if (!dialog.hidden) host.dialog?.(false); };
  document.addEventListener("pointerdown", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (dialog.hidden || !target?.closest("[data-tab-workspace], .immersive-titlebar, [data-side-panel]") || target.closest("[data-work-line], [data-work-task-float], [popover], dialog, .mw-menu, .mw-ctx, .mw-ctx-menu")) return;
    // After the press has ended and its click has gone out, not on the press: putting the conversation away lays the page
    // out again (a side panel that shared the width takes it back), and a key that moved from under the pointer between
    // press and release gets no click.
    const ended = new AbortController();
    const end = () => { ended.abort(); setTimeout(putAway); };
    for (const type of ["pointerup", "pointercancel"]) document.addEventListener(type, end, { capture: true, signal: ended.signal });
  });
  window.addEventListener("molis:surface-interaction", putAway);
  const sheet = document.querySelector<HTMLElement>("[data-tab-workspace]");
  if (sheet) new MutationObserver(() => { if (sheet.dataset.exclusive) putAway(); }).observe(sheet, { attributes: true, attributeFilter: ["data-exclusive"] });
  // Closed on an event that still waits: its card is the one in front again — the person was just on it (POLISH-43).
  new MutationObserver(() => {
    if (!dialog.hidden) unread = false;
    paintExpand();
    cardStack.paint(dialog.hidden ? [...events.values()].find(one => keyOf(one.subject) === focused)?.id : undefined);
  }).observe(dialog, { attributes: true, attributeFilter: ["hidden"] });

  const adopt = (result: WorkLineDisplay) => {
    const before = events;
    events = new Map(result.events.map(event => [event.id, event]));
    issues = result.issues;
    return before;
  };
  // What waits for the person, as the stack holds it with nothing in front: the events and loose tasks, the main conversation
  // when it waits, and one for whatever wants a look. An event the conversation is about still counts (POLISH-40).
  function waitingCount(): number { return waitingEvents().length + tasks.loose().length + (host.mainWaiting?.() ? 1 : 0) + (toLook().length ? 1 : 0); }
  const draw = (result: WorkLineDisplay, before = adopt(result)): boolean => {
    // The same events in the same states are the same lists: nothing is redrawn, so a press or a scroll under way is not lost.
    const drawn = JSON.stringify([result.events.map(event => [event.id, event.title, event.summary, event.wing, event.rank, stateOf(event), event.tasks.running, event.tasks.waiting, Boolean(event.suggestion)]), result.issues.map(issue => issue.title)]);
    if (drawn === shown) return false;
    const first = shown === "";
    shown = drawn;
    list.draw(event => !first && !before.has(event.id));
    const arrived = first ? [] : result.events.filter(event => asksYou(event) && (!before.get(event.id) || !asksYou(before.get(event.id)!)));
    cardStack.paint(arrived[0]?.id);
    // An event that came to wait for the person since the last read says so once (the shared "your turn" ring) on the stack.
    if (arrived.length) craft()?.ask?.(stack);
    return true;
  };

  // The tasks this page heard wait on the person, by task and decision (WLN-06): the row stays, folded, once the task no longer waits.
  const asked = new Map<string, { at: string; provider: string; title: string; event: WorkLineEvent; settled: boolean }>();
  // An event opened from a task's card or a parked card is the press on it anywhere: its conversation and its page.
  const withPage: WorkBarHost = { ...host, openEvent(event, quiet) {
    const found = quiet ? undefined : eventOf(event.subject);
    if (found) pressing = keyOf(found.subject);
    host.openEvent(event, quiet);
    if (found) openPage(found);
  } };
  const tasks = installTasks(withPage, {
    events: () => events.values(), press, keyOf, hue, again, request,
    repaint: () => {
      cards.paint();
      list.draw();
      cardStack.paint();
    },
    acceptance: (slot, target) => acceptance.overview(slot, () => [target]),
    subtasks: () => host.subtasks?.() ?? [],
    itemName: (subject, serves) => taskItems[keyOf(subject)]?.name ?? serves.map(one => taskItems[keyOf(one)]?.name).find(Boolean),
  });

  const eventOf = (subject: ActionSubject) => [...events.values()].find(one => keyOf(one.subject) === keyOf(subject));
  // Requirements hang on the event's own object or on the tasks done for it; the information asks about both.
  const acceptance = installAcceptance(host.route, request, open => host.dialog?.(open));
  const cards = installEventCards(withPage, { event: eventOf, keyOf, press, rows: tasks.rows, decisions: tasks.decisions,
    acceptance: (slot, subject) => acceptance.overview(slot, () => {
      const event = eventOf(subject);
      return [...(event ? [{ provider_id: event.source.provider_id, subject }] : []), ...tasks.subjects(subject)];
    }),
    // Who registered it, then how it stands: the owner's own line about it, or that it waits for the person.
    parts: event => {
      const said = view(event, false), group = groupOf(event);
      return { owner: event.origin.title, state: said.stateLabel || said.note || uiText.text(group === "you" ? "workbench.work-line.waiting-for-you" : `workbench.work-line.list-${group}`), glyph: glyphOfEvent(said) };
    },
    facts: event => { const { stateLabel, note } = view(event, false); return [uiText.text("workbench.work-line.registered-by", { plugin: event.origin.title }), stateLabel || note].filter(Boolean).join(" · "); } });

  // A press on an event, wherever it is drawn (a list in the column or parked, a card of the stack): its conversation and its
  // page. From a list the list stays (the pressed row is marked); from anywhere else the column shows what is known about it.
  // The event's page, at the top (POLISH-68): where its owner says it opens; an owner with no page for it gets the one the
  // platform draws from what it declared — a tab of the work area like any other, kept with the layout.
  const pages = new Map<string, { root: HTMLElement; handle: EventCardHandle }>();
  line.dataset.systemViewOwner = EVENT_PAGES;
  line.dataset.systemViewIcon = "flag";
  const openPage = (event: WorkLineEvent) => {
    const to = event.open;
    if (to) {
      if (to.kind === "surface" || !to.id) host.openSurface(to.surface); else host.openItem(to.surface, to.id, to.title);
      return;
    }
    document.dispatchEvent(new CustomEvent("molis-work:system-view-open", { detail: { owner: EVENT_PAGES, id: JSON.stringify([event.subject.kind, event.subject.id]), title: event.title }, cancelable: true }));
  };
  document.addEventListener("molis-work:system-view-changed", changed => {
    const open = ((changed as CustomEvent<{ open?: Array<{ owner: string; id: string; tab_id: string }> }>).detail?.open ?? []).filter(tab => tab.owner === EVENT_PAGES);
    for (const [id, page] of pages) if (!open.some(tab => tab.tab_id === id) || !page.root.isConnected) {
      page.handle.destroy();
      pages.delete(id);
    }
    for (const tab of open) {
      const root = document.querySelector<HTMLElement>(`[data-system-tab="${CSS.escape(tab.tab_id)}"]`);
      if (!root || pages.has(tab.tab_id)) continue;
      let subject: ActionSubject | null = null;
      try {
        const [kind, id] = JSON.parse(tab.id) as unknown[];
        if (typeof kind === "string" && typeof id === "string") subject = { kind, id };
      } catch { /* not a page of ours */ }
      if (!subject) continue;
      const slot = document.createElement("div");
      slot.className = "work-event-page-slot";
      root.replaceChildren(slot);
      pages.set(tab.tab_id, { root, handle: cards.page(slot, { subject, title: "", mark: "", owner: "", composed: true }) });
    }
  });
  // The tab in front and the thing the words go to are the same (POLISH-66): when an event's page comes in front — its owner's
  // tab or the page drawn here — the conversation follows it without opening; when the page of the event talked about gives way
  // to something that is no event, the words go to the main conversation again. A cover and the Assistant's own stage change nothing.
  const pageKey = (event: WorkLineEvent) => JSON.stringify([event.subject.kind, event.subject.id]);
  const follow = () => {
    const front = host.front?.();
    if (!front || ("owner" in front && front.owner !== EVENT_PAGES)) return;
    const found = [...events.values()].find(one => "owner" in front ? pageKey(one) === front.id : Boolean(front.id) && one.open?.kind !== "surface" && one.open?.surface === front.surface && one.open?.id === front.id);
    if (found) {
      const at = keyOf(found.subject);
      paged = at;
      if (at !== focused && at !== pressing) {
        list.show("info");
        host.openEvent(press(found), true);
      }
    }
    // Only the event whose page was in front gives way: a conversation opened another way (a work chosen in 全部工作, the one a
    // reload comes back to) stays where the person left it.
    else {
      if (paged && paged === focused) host.toNow(true);
      paged = "";
    }
  };
  document.addEventListener("molis-work:place-changed", () => queueMicrotask(follow));
  const pressEvent = (pressed: WorkLineEvent, from: Element) => {
    if (from.closest("[data-work-stack]")) cardStack.close();
    if (!from.closest("[data-work-lists]")) list.show("info");
    pressing = keyOf(pressed.subject);
    host.openEvent(press(pressed));
    openPage(pressed);
  };
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null, within = target?.closest("[data-work-line],[data-work-lists],[data-parked-list]");
    if (!target || !within) return;
    if (target.closest("[data-work-line-retry]")) { again(); return; }
    if (target.closest("[data-work-line-checking]")) { again(); return; }
    const looked = target.closest<HTMLElement>("[data-work-stack-look]");
    if (looked) {
      host.openAttention?.(looked, toLook());
      return;
    }
    if (target.closest("[data-work-stack-other]") || (!target.closest("button,a,input,textarea") && target.closest('[data-work-stack-card="other-items"]'))) {
      cardStack.close();
      document.dispatchEvent(new CustomEvent("molis-work:work-item-switch", { detail: { open_switcher: true } }));
      return;
    }
    if (target.closest("[data-work-stack-main]") || (!target.closest("button,a,input,textarea") && target.closest("[data-work-stack-card][data-main]"))) {
      cardStack.close();
      list.show("info");
      host.openMain?.();
      return;
    }
    const openId = target.closest<HTMLElement>("[data-work-event]")?.dataset.workEvent
      ?? target.closest<HTMLElement>("[data-work-stack-open]")?.dataset.workStackOpen
      ?? (!target.closest("button,a,input,textarea") ? target.closest<HTMLElement>("[data-work-stack-card]")?.dataset.workStackCard : undefined);
    if (openId?.startsWith("task:")) {
      cardStack.close();
      tasks.open(openId.slice(5));
      return;
    }
    const pressed = events.get(openId ?? "");
    if (pressed) pressEvent(pressed, target);
  });
  // Keyboard (WLN-17): Alt+L puts focus on the card in front, else on the first of the three — a key inside the input, or a tab of the column while the conversation is open.
  document.addEventListener("keydown", event => {
    if (event.code !== "KeyL" || !event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || (event.target instanceof Element && event.target.closest(".xterm"))) return;
    event.preventDefault();
    const stackButton = stack.offsetParent ? stack.querySelector<HTMLElement>("button") : null;
    (stackButton ?? counts.querySelector<HTMLElement>("[data-work-stack-toggle]:not([hidden])") ?? (dialog.hidden ? counts.querySelector<HTMLElement>("[data-work-list]") : tabs.querySelector<HTMLElement>('[aria-selected="true"]')))?.focus();
  });
  // A part the read could not get is null: adopt events first so the tasks see them, then paint the lists & cards with live tasks.
  document.addEventListener("molis-work:attention", event => {
    const { line: read, tasks: table, started, sequence } = (event as CustomEvent<{ line?: WorkLineReadResult | null; tasks?: BackgroundTasksReadResult | null; started?: number; sequence?: number }>).detail;
    const before = read ? adopt(read) : events;
    const wasChecking = line.hasAttribute("data-checking");
    if (read) {
      checking(null, false);
      knownAt = new Date().toISOString();
      try {
        const display: WorkLineDisplay = { events: read.events, issues: read.issues };
        sessionStorage.setItem(cacheKey(), JSON.stringify({ at: knownAt, line: display }));
      } catch {
        /* a convenience of this tab */
      }
    }
    // A page restored with the layout: the conversation follows the event whose page is in front, once the line is read.
    if (read && !followed) {
      followed = true;
      follow();
    }
    const resumed = table ? tasks.offline(null) : false;
    const tasksChanged = table ? tasks.take(table, started ?? 0, sequence) : false;
    const lineDrawn = read ? draw(read, before) : false;
    if (!lineDrawn && (tasksChanged || resumed || (read && wasChecking))) {
      if (tasksChanged || resumed) list.draw();
      cardStack.paint();
    }
    cards.paint();
    acceptance.refresh();
  });
  // Not heard: what is shown stays, said to be as of the last read; nothing is redone or restarted from here (WLN-05, WLN-29).
  document.addEventListener("molis-work:attention-unreachable", event => {
    // Not heard since this page opened: as of the line it kept.
    const since = (event as CustomEvent<{ since?: string | null }>).detail?.since ?? knownAt;
    checking(since ?? "");
    tasks.offline(since ? format.date(since, "time") : "");
    list.draw();
  });
  function restoreScopeLine() {
    knownAt = null;
    shown = "";
    tasks.take({ tasks: [], issues: [] }, 0);
    draw({ events: [], issues: [] });
    checking("");
    try {
      const last = JSON.parse(sessionStorage.getItem(cacheKey()) ?? "null") as { at: string; line: WorkLineDisplay } | null;
      if (last?.line && Array.isArray(last.line.events)) { draw(last.line); knownAt = last.at; checking(last.at); }
    } catch { /* nothing kept */ }
  }
  document.addEventListener("molis-work:work-item-changed", event => {
    const detail = (event as CustomEvent<{ item_id?: string | null; other_waiting?: number; task_items?: Readonly<Record<string, { readonly item_id: string; readonly name: string }>> }>).detail;
    const prevItem = activeItemId;
    activeItemId = detail?.item_id ?? null;
    otherItemsWaiting = typeof detail?.other_waiting === "number" ? detail.other_waiting : 0;
    taskItems = detail?.task_items ?? {};
    if (prevItem !== activeItemId) {
      delete document.body.dataset.workLineScope;
      cards.setItem(activeItemId);
      restoreFocus();
      restoreScopeLine();
      list.setParkedItem(activeItemId);
    }
    paintScopeToggle();
    list.draw();
    cardStack.paint();
  });
  document.addEventListener("molis-work:language-changed", () => {
    if (checkingSince !== null) {
      checking(checkingSince, false);
      tasks.offline(checkingSince ? format.date(checkingSince, "time") : "");
    }
    list.retitle();
    cardStack.paint();
    paintExpand();
    cards.paint();
    tasks.retitle();
  });
  restoreScopeLine();
  paintExpand();
  return {
    event(subject) {
      const found = eventOf(subject);
      return found ? { ...press(found), group: groupOf(found) } : null;
    },
    card: cards.mount,
    events: () => [...events.values()].map(press),
    placed(task) {
      const served = task.serves.map(subject => [...events.values()].find(one => keyOf(one.subject) === keyOf(subject))).find(Boolean);
      return renderReplyPlaced({ task: keyOf(task.subject), where: served ? { kind: "for-event", name: served.title } : task.own ? { kind: "new-event", name: task.title } : { kind: "none" } });
    },
    place: subject => tasks.place(subject),
    waiting() {
      const now = tasks.waiting(), live = new Set(now.map(one => one.key));
      for (const one of now) asked.set(one.key, { at: asked.get(one.key)?.at ?? new Date().toISOString(), provider: one.provider, title: one.title, event: one.event, settled: false });
      // A task that is not in the table because its provider could not be read is not known to wait no longer: its row stays as it was.
      const unread = tasks.unreadable();
      for (const [key, one] of asked) if (!live.has(key) && !unread.has(one.provider)) one.settled = true;
      return [...asked].map(([key, one]) => ({ key, at: one.at, settled: one.settled, html: renderReplyWaiting({ key, task: one.title, event: one.event.title, settled: one.settled }) }));
    },
    goWaiting(key) {
      const one = asked.get(key);
      if (one && !one.settled) {
        const event = events.get(one.event.id) ?? one.event;
        list.show("info");
        pressing = keyOf(event.subject);
        host.openEvent(press(event));
        openPage(event);
      }
    },
    // The outline moves with the event the conversation is about; the event keeps its place in its list (WLN-07).
    focus(subject) {
      focused = subject ? keyOf(subject) : "";
      try { sessionStorage.setItem(focusKey(), focused); } catch { /* this window only */ }
      pressing = "";
      list.draw();
      cardStack.paint();
    },
    conversation(state) {
      if (state.unread && dialog.hidden) unread = true;
      paintExpand();
      cardStack.paint();
    },
  };
}
