import type { UiPageTaskGrants, UiTaskGrantsAreaState } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  TASK_GRANT_SUBJECT_KEY_PATTERN, type TaskGrantCategory, type TaskGrantCategoryReference, type TaskGrantCategoryState, type TaskGrantSetCategory,
} from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { escapeHtml as escape } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { FramedArea, FramedAreaRefusal, PageFramedAreas } from "./framed-area.js";
import { childPlaces } from "./over-frame.js";
import type { FrameScope, TaskGrantsDown, TaskGrantsUp, Translate } from "./types.js";

/**
 * The platform's 「能读的数据」 area on one of a page's own background tasks (specs/proactive-assistant/task-grants-platform-area.md):
 * the page gives an empty element and the task's key; the shell draws the categories and their switches outside the page, and
 * only a real, deliberate press there writes, as the person, through `agent.task_grants.set`.
 */

/** The one thing the page hears when an area cannot be shown, whatever the reason: the frame rejects with it, the shell sends it. */
export const TASK_GRANTS_UNAVAILABLE = "workbench.task-grants-area.cannot-display-this-right-now";
/** The area's two heights (§3.1), by width alone; set on the component board's specimens so five categories need no scrolling. */
export const TASK_GRANTS_AREA_HEIGHTS = { narrow: 468, wide: 396 } as const;

type Status = TaskGrantCategoryState["status"] | "off";
interface Row { readonly ref: TaskGrantCategoryReference; readonly name: string; readonly title: string; readonly description: string; readonly status: Status }
interface Reads { readonly categories: readonly TaskGrantCategory[]; readonly subject: { readonly revision: string; readonly categories: readonly TaskGrantCategoryState[] } }
/** What the person did, as `set` takes it (§3.6) and what the line says after it. */
type Change = { readonly kind: "on" | "off" | "allow" | "remove" | "undo"; readonly row: Row; readonly categories: TaskGrantSetCategory[]; readonly undo?: (now: Reads["subject"]) => TaskGrantSetCategory[] };
/** What the area's one line says now; `act` is its one button. */
export type TaskGrantsLine = { readonly text: string; readonly act?: "undo" | "retry" | "read"; readonly tone?: "danger" };
type LineText = Omit<TaskGrantsLine, "text"> & { readonly key: string; readonly category?: string; readonly name?: string };

export const taskGrantCategoryName = (ref: TaskGrantCategoryReference) => ref.provider_id + "\n" + (ref.group_id ?? "");
const refOf = (ref: TaskGrantCategoryReference): TaskGrantSetCategory => ref.group_id === undefined ? { provider_id: ref.provider_id } : { provider_id: ref.provider_id, group_id: ref.group_id };

export function taskGrantWords(categories: readonly TaskGrantCategory[]) {
  const words = new Map(categories.map(category => [taskGrantCategoryName(category), category]));
  return <T extends TaskGrantCategory>(category: T): T => {
    const next = words.get(taskGrantCategoryName(category));
    return next ? { ...category, title: next.title, description: next.description } : category;
  };
}

/** One row per category: what this project offers, then what the task holds that is no longer offered (unavailable or removed). */
export function taskGrantRows(reads: Reads): Row[] {
  const held = new Map(reads.subject.categories.map(category => [taskGrantCategoryName(category), category]));
  const row = (category: TaskGrantCategory, status: Status): Row => ({ ref: refOf(category), name: taskGrantCategoryName(category), status,
    title: category.title, description: category.description });
  const offered = reads.categories.map(category => row(category, held.get(taskGrantCategoryName(category))?.status ?? "off"));
  const seen = new Set(offered.map(item => item.name));
  return [...offered, ...reads.subject.categories.filter(category => !seen.has(taskGrantCategoryName(category))).map(category => row(category, category.status))];
}

/**
 * The `set` a change sends (§3.6): the base is every category the task holds records for, as read, whatever its status, so the
 * Host keeps those records as they are (R1); only the category changed is added, taken off or allowed again. Undo is given only
 * for turning a category on or turning a granted one off.
 */
export function taskGrantChange(kind: "on" | "off" | "allow" | "remove", row: Row, subject: Reads["subject"]): Change {
  const base = subject.categories.map(refOf), without = base.filter(item => taskGrantCategoryName(item) !== row.name);
  if (kind === "on") return { kind, row, categories: [...without, refOf(row.ref)], undo: now => now.categories.map(refOf).filter(item => taskGrantCategoryName(item) !== row.name) };
  if (kind === "allow") return { kind, row, categories: base.map(item => taskGrantCategoryName(item) === row.name ? { ...item, confirm: true } : item) };
  const undo = kind === "off" && row.status === "granted"
    ? (now: Reads["subject"]) => [...now.categories.map(refOf).filter(item => taskGrantCategoryName(item) !== row.name), refOf(row.ref)] : undefined;
  return { kind, row, categories: without, ...(undo ? { undo } : {}) };
}

/** What the page may know after a write: two flags it could read from its own `agent.task_grants.list`. */
const summary = (subject: Reads["subject"]): UiTaskGrantsAreaState => ({
  granted: subject.categories.some(category => category.status === "granted"),
  attention: subject.categories.some(category => category.status === "needs_confirmation" || category.status === "removed"),
});

/** A row's note by its status, when it reads less than it is on for; translated where it is drawn. */
const NOTES: Partial<Record<Status, string>> = { needs_confirmation: "workbench.task-grants-area.new-data-is-offered-approve-it-before", unavailable: "workbench.task-grants-area.unavailable-for-now-access-is-still-granted", removed: "workbench.task-grants-area.this-category-is-no-longer-offered" };

/**
 * One category, one row (§3.5; the 授权与放行 page draws its rows with it too, §5): its name, what it is, and a note when it reads
 * less than it is on for. `end` is the row's controls, the area's switch or the page's buttons, already escaped.
 */
export function taskGrantRowHtml(t: Translate, row: Row, end: string): string {
  const note = NOTES[row.status];
  return `<li class="mw-item task-grants-area__row" data-task-grants-row="${escape(row.name)}" data-status="${row.status}"><span><strong title="${escape(row.title)}">${escape(row.title)}</strong><small title="${escape(row.description)}">${escape(row.description)}</small>${note ? `<em class="task-grants-area__note">${escape(t(note))}</em>` : ""}</span><span class="mw-item__end">${end}</span></li>`;
}

/** The area's markup: the platform's header, one row per category, and the one line that says what just happened. */
export function taskGrantsAreaHtml(t: Translate, owner: string, rows: readonly Row[], line: TaskGrantsLine, busy: boolean, fresh = false, languageFailed = false): string {
  /** A small button by its control name (§3.3): a row's 允许 or 移除 (secondary), or the line's act (ghost). */
  const control = (name: string, label: string, variant = "secondary") =>
    `<button type="button" class="mw-btn mw-btn--sm mw-btn--${variant}" data-framed-control="${escape(name)}">${escape(label)}</button>`;
  const item = (row: Row) => taskGrantRowHtml(t, row, row.status === "removed" ? control("remove:" + row.name, t("workbench.task-grants-area.remove"))
    : `${row.status === "needs_confirmation" ? control("allow:" + row.name, t("workbench.task-grants-area.allow")) : ""}<span class="mw-switch" data-slot="switch"><input type="checkbox" role="switch" aria-label="${escape(row.title)}"${row.status !== "off" ? " checked" : ""} data-framed-control="${escape("switch:" + row.name)}"><span class="mw-switch__track" aria-hidden="true"></span></span>`);
  const list = rows.length ? `<ul class="mw-items task-grants-area__rows">${rows.map(item).join("")}</ul>`
    : `<p class="task-grants-area__empty">${escape(t("workbench.task-grants-area.nothing-in-this-project-can-be-read"))}</p>`;
  // The line stays put (D2): a persistent status line, the design system's `mw-alert`, not a passing toast (DESIGN「Toasts」).
  const act = line.act ? control(line.act, t(line.act === "undo" ? "workbench.task-grants-area.undo" : "common.control.retry"), "ghost") : "";
  const warning = languageFailed ? `<div class="mw-alert mw-alert--danger" role="alert"><span>${escape(t("workbench.language.window-failed"))}</span> ${control("retry-language", t("workbench.language.retry"), "ghost")}</div>` : "";
  return `<header class="mw-platform-area__head" data-framed-area-head><span class="mw-platform-area__kicker"><svg aria-hidden="true"><use href="#icon-shield"></use></svg>${escape(t("workbench.task-grants-area.molis-work-only-you-can-change-this"))}</span><span class="mw-platform-area__owner" title="${escape(owner)}">${escape(owner)}</span>`
    + `<p class="mw-platform-area__lead">${escape(t("workbench.task-grants-area.read-only-never-change-for-this-task"))}</p>${warning}</header>`
    + `<div class="mw-platform-area__body" data-framed-scroll${busy ? ' aria-busy="true"' : ""}>${list}</div>`
    + `<footer class="mw-platform-area__foot" data-framed-area-foot><div class="mw-alert${line.tone === "danger" ? " mw-alert--danger" : ""}${fresh ? " is-fresh" : ""}" role="status"><span title="${escape(line.text)}">${escape(line.text)}</span>${act}</div></footer>`;
}

/**
 * What the line says after a write, by what the person did (§3.6); it offers undo when the change has one (turning a category on,
 * or taking back one that was granted). The 授权与放行 page has no switch, so it says the lines that point at one in its own words.
 */
function doneLine(change: Change): LineText {
  const { kind, row } = change, status = row.status;
  return { key: kind === "undo" ? "workbench.task-grants-area.change-undone"
    : kind === "on" ? "workbench.task-grants-area.name-allowed-the-next-run-can-read"
    : kind === "allow" ? "workbench.task-grants-area.name-may-read-its-new-data"
    : kind === "remove" ? "workbench.task-grants-page.name-removed-no-longer-offered"
    : status === "needs_confirmation" ? "workbench.task-grants-area.name-withdrawn-turn-on-to-allow-current-data"
    : status === "unavailable" ? "workbench.task-grants-area.name-withdrawn-turn-on-after-plugin-returns"
    : "workbench.task-grants-area.name-withdrawn-the-next-run-cannot-read",
  ...(kind !== "undo" ? { category: row.name, name: row.title } : {}),
  act: change.undo ? "undo" : undefined };
}

interface Entry { readonly id: number; readonly key: string; readonly area: FramedArea; reads: Reads | null; line: LineText; busy: boolean;
  /** The last change, kept for its undo or for a retry after it failed. */ last: Change | null; drawn?: string; languageFailed?: boolean;
  /** This area has another read due when it is visible and no operation is in progress. */ stale?: "visibility" | "language" }

/** Replay the feedback only when its text changes, so a write's busy state does not make it flicker. */
function drawTaskGrantEntry(entry: Entry, t: Translate, owner: string): void {
  const rows = entry.reads ? taskGrantRows(entry.reads) : [];
  const { key, category, name, ...line } = entry.line;
  const title = category ? rows.find(row => row.name === category)?.title ?? name : name;
  const text = t(key, title === undefined ? undefined : { name: title }), fresh = entry.drawn !== undefined && entry.drawn !== text;
  entry.drawn = text;
  entry.area.surface.setAttribute("aria-label", t("workbench.task-grants-area.molis-work-only-you-can-change-this") + " · " + owner);
  entry.area.redraw(taskGrantsAreaHtml(t, owner, rows, { ...line, text }, entry.busy, fresh, entry.languageFailed));
}

/** A request from a hidden frame waits for visibility, unless the frame or its requested area closes first. */
function waitForAreaVisibility(scope: FrameScope) {
  const waiting = new Map<number, () => void>();
  scope.own(() => { for (const end of [...waiting.values()]) end(); });
  const wait = (id: number) => new Promise<boolean>(resolve => {
    let stop: (() => void) | undefined;
    const end = (shown: boolean) => { waiting.delete(id); queueMicrotask(() => stop?.()); resolve(shown); };
    waiting.set(id, () => end(false));
    stop = scope.whenVisible(() => end(true));
  });
  return { waiting, wait };
}

/**
 * The trusted half (§2–§3). The owner name comes from the shell. Every write is the person's own `set`
 * through the Host's page route, which takes the installation and project from the page's authority, never from here.
 */
export function pageTaskGrants(port: MessagePort, scope: FrameScope, areas: PageFramedAreas, pageId: string, route: (path: string) => string, t: Translate, ownerName: () => string) {
  const entries = new Map<number, Entry>(), pattern = new RegExp(TASK_GRANT_SUBJECT_KEY_PATTERN, "u");
  const { waiting, wait } = waitForAreaVisibility(scope);
  const send = (message: TaskGrantsDown) => { if (scope.alive) port.postMessage(message); };
  const request = <T>(entry: Entry, body: Record<string, unknown>) => molisWorkRequest<T>(route("/api/host/plugin-page-task-grants"),
    { body: { key: entry.key, ...body }, headers: { "x-molis-context-page": pageId }, scope });
  const draw = (entry: Entry) => drawTaskGrantEntry(entry, t, ownerName());
  const close = (id: number) => { entries.get(id)?.area.close(); entries.delete(id); };
  scope.own(() => { for (const id of [...entries.keys()]) close(id); });
  const idle = (): LineText => ({ key: "workbench.task-grants-area.a-switch-takes-effect-at-once-the" });
  const unread = (): LineText => ({ key: "workbench.task-grants-area.cannot-read-what-this-task-may-read", act: "read", tone: "danger" });

  const read = async (entry: Entry) => {
    const current = await request<Reads>(entry, { mode: "read" });
    scope.assertCurrent();
    return current;
  };
  /** A change, sent once; the answer is the task's new state, shown as it is without reading again (§6). */
  const write = async (entry: Entry, change: Change) => {
    const subject = entry.reads!.subject;
    entry.busy = true; draw(entry);
    try {
      const answer = await request<{ subject: Reads["subject"] }>(entry, { mode: "set", categories: change.categories, expected_revision: subject.revision });
      if (entries.get(entry.id) !== entry) return;
      entry.reads = { categories: entry.reads!.categories, subject: answer.subject };
      entry.last = change.undo ? change : null; entry.line = doneLine(change);
      send({ type: "task-grants-changed", id: entry.id, state: summary(answer.subject) });
    } catch (error) {
      if (entries.get(entry.id) !== entry || !scope.alive) return;
      // Changed elsewhere (the same task open beside, or the grants page): read again, and the undo no longer applies.
      if ((error as { code?: string }).code === "actions.conflict") {
        entry.last = null; entry.line = { key: "workbench.task-grants-area.changed-elsewhere-refreshed" };
        try { entry.reads = await read(entry); } catch { entry.line = unread(); }
      } else {
        // The switch goes back as it was; an undo that failed is spent (§3.6 「失败」).
        entry.last = change.kind === "undo" ? null : change;
        entry.line = { key: "workbench.task-grants-area.not-saved-the-permissions-are-as-they", act: change.kind === "undo" ? undefined : "retry", tone: "danger" };
      }
    } finally {
      if (entries.get(entry.id) === entry) { entry.busy = false; draw(entry); catchUp(entry); }
    }
  };

  /** A press on one of the area's controls: the six checks of §3.3, then at most one write. */
  const press = (entry: Entry, event: MouseEvent) => {
    const control = (event.target as Element).closest<HTMLElement>("[data-framed-control]");
    if (!control || !entry.area.surface.contains(control)) return;
    const name = control.dataset.framedControl!, act = name.split(":", 1)[0];
    // A switch shows the answer, not the press: the browser does not flip it. A scripted click that cannot be cancelled flips it
    // anyway, so a refused press draws the area again from what the task holds (an area already closed is drawn to nothing seen).
    event.preventDefault();
    const refusal: FramedAreaRefusal | null = entry.area.gate(event, control);
    // ①⑤⑥ are said nowhere: a scripted press, a press while a write is under way, a page that has moved on.
    if (refusal?.reason === "silent" || entry.busy || !scope.alive || entries.get(entry.id) !== entry || !entry.reads) { draw(entry); return; }
    if (refusal) {
      if (act !== "retry-language") entry.line = { key: refusal.reason === "moved" ? "workbench.task-grants-area.this-just-moved" : "workbench.task-grants-area.show-this-whole-area-first" };
      if (refusal.reason === "partial") {
        if (refusal.reveal) send({ type: "task-grants-reveal", id: entry.id });
        else control.closest("li")?.scrollIntoView({ block: "nearest" });
      }
      draw(entry); return;
    }
    // A control's name is its act, then the category it is for: `switch:`, `allow:` or `remove:` and the row's name.
    const subject = entry.reads.subject;
    if (act === "read") { void reread(entry); return; }
    if (act === "retry-language") { entry.stale = "language"; catchUp(entry); return; }
    if (act === "undo" || act === "retry") {
      const last = entry.last; if (!last) return;
      void write(entry, act === "undo" && last.undo ? { kind: "undo", row: last.row, categories: last.undo(subject) } : taskGrantChange(last.kind as "on", last.row, subject));
      return;
    }
    // A switch turns its category the other way from what the task holds now; the drawn markup does not decide it.
    const switched = act === "switch", row = taskGrantRows(entry.reads).find(item => name === act + ":" + item.name);
    const fits = switched ? row?.status !== "removed" : act === "allow" ? row?.status === "needs_confirmation" : act === "remove" && row?.status === "removed";
    if (!row || !fits) return;
    void write(entry, taskGrantChange(switched ? (row.status === "off" ? "on" : "off") : act as "allow" | "remove", row, subject));
  };
  const currentLanguage = () => document.documentElement.dataset.uiLanguageTag ?? document.documentElement.lang;
  const reread = async (entry: Entry) => {
    const language = entry.stale === "language" ? currentLanguage() : null;
    entry.busy = true; entry.stale = undefined; draw(entry);
    try {
      const current = await read(entry), held = entry.reads;
      if (language !== null && held) {
        if (language !== currentLanguage()) return;
        // Undo still belongs to the revision it was offered on, even if another window wrote since then.
        const words = taskGrantWords([...current.categories, ...current.subject.categories]);
        entry.reads = { categories: held.categories.map(words), subject: { ...held.subject, categories: held.subject.categories.map(words) } };
      } else { entry.reads = current; entry.line = idle(); }
      entry.languageFailed = false;
    } catch {
      if (entries.get(entry.id) !== entry) return;
      if (language === null) entry.line = unread();
      else if (language === currentLanguage()) entry.languageFailed = true;
    }
    finally { if (entries.get(entry.id) === entry) { entry.busy = false; draw(entry); catchUp(entry); } }
  };
  /** The one read again a return into view asks for, once nothing is under way (for an area still open); none while hidden. */
  const catchUp = (entry: Entry) => { if (entry.stale && entry.reads && !entry.busy && scope.visible) void reread(entry); };
  // Back in view, each area reads once (§3.6): a read or a write under way may have started before what changed while it was hidden,
  // so it reads after that one ends. Every area here was opened in view, so this runs only after the page was hidden.
  scope.whenVisible(() => { for (const entry of entries.values()) { entry.stale = "visibility"; catchUp(entry); } });
  let language = currentLanguage();
  scope.listen(document, "molis-work:language-changed", () => {
    if (language === currentLanguage()) return;
    language = currentLanguage();
    for (const entry of entries.values()) { entry.stale ??= "language"; catchUp(entry); }
  });

  /** The page's area could not be shown: it is told so, with the one plain reason. */
  const unshown = (id: number) => send({ type: "task-grants-shown", id, error: TASK_GRANTS_UNAVAILABLE });
  const open = async (message: Extract<TaskGrantsUp, { type: "task-grants-open" }>) => {
    // An open names an id and a key, nothing more: a category list, a state, an installation is not the page's to give.
    const shaped = Object.keys(message).length === 3 && Number.isSafeInteger(message.id) && message.id > 0 && !entries.has(message.id)
      && !waiting.has(message.id) && typeof message.key === "string" && pattern.test(message.key);
    // A page out of sight is not refused: its area waits and is drawn when the page shows, so a plugin need not try again. A close
    // in the meantime ends the wait.
    const visible = shaped && (scope.visible || await wait(message.id));
    if (shaped && !visible) return;
    const valid = visible && scope.alive && scope.visible && !entries.has(message.id);
    const area = valid ? areas.open({ heights: TASK_GRANTS_AREA_HEIGHTS, onHeight: height => send({ type: "task-grants-size", id: message.id, height }) }) : null;
    if (!area) { if (Number.isSafeInteger(message.id) && !entries.has(message.id)) unshown(message.id); return; }
    const { surface, holder } = area;
    surface.className = "mw-platform-area";
    surface.dataset.taskGrantsArea = "";
    // Shown again (its page back in view, a dialog closed, its frame wide enough again), the area fades in with the shared
    // `craft-fade-in` (DESIGN「Motion」), not its first reveal's `craft-rise`. It is marked as it hides, never while in sight.
    let seen = false;
    new MutationObserver(() => { if (!holder.hidden) seen = true; else if (seen) surface.dataset.shown = ""; }).observe(holder, { attributeFilter: ["hidden"] });
    const entry: Entry = { id: message.id, key: message.key, area, reads: null, line: idle(), busy: false, last: null };
    entries.set(entry.id, entry);
    surface.addEventListener("click", event => press(entry, event));
    try {
      entry.reads = await read(entry);
      if (entries.get(entry.id) !== entry) return;
      draw(entry); send({ type: "task-grants-shown", id: entry.id }); catchUp(entry);
    } catch {
      close(entry.id); unshown(entry.id);
    }
  };
  return (message: TaskGrantsUp) => {
    if (!message || !Number.isSafeInteger(message.id) || message.id < 1) return;
    if (message.type === "task-grants-open") { void open(message); return; }
    if (message.type === "task-grants-close") { waiting.get(message.id)?.(); close(message.id); return; }
    if (message.type === "task-grants-layout") entries.get(message.id)?.area.layout(message.box);
  };
}

/** The page's half: places an empty element, reports where it is, and keeps the element at the height the shell gives it. */
export function childTaskGrants(port: MessagePort, scope: FrameScope): UiPageTaskGrants<HTMLElement> {
  let sequence = 0;
  const entries = new Map<number, { element: HTMLElement; onChange?: (state: UiTaskGrantsAreaState) => void;
    pending?: { resolve(): void; reject(error: Error): void }; stop?: () => void }>();
  const send = (message: TaskGrantsUp) => port.postMessage(message);
  const close = (id: number, error: Error = new DOMException("Area closed", "AbortError")) => {
    const entry = entries.get(id); if (!entry) return;
    entries.delete(id); places.untrack(id); entry.stop?.(); entry.pending?.reject(error);
    entry.element.style.removeProperty("height"); send({ type: "task-grants-close", id });
  };
  const places = childPlaces(scope, (id, box) => send({ type: "task-grants-layout", id, box }), id => close(id));
  scope.own(() => { for (const id of [...entries.keys()]) close(id); });
  port.addEventListener("message", (event: MessageEvent<TaskGrantsDown>) => {
    const message = event.data, entry = entries.get(message.id);
    if (!entry || !message.type.startsWith("task-grants-")) return;
    if (message.type === "task-grants-size") entry.element.style.height = Math.max(0, message.height) + "px";
    else if (message.type === "task-grants-reveal") entry.element.scrollIntoView({ block: "nearest" });
    else if (message.type === "task-grants-changed") entry.onChange?.({ granted: message.state.granted === true, attention: message.state.attention === true });
    else if (message.error) close(message.id, new Error(TASK_GRANTS_UNAVAILABLE));
    else { entry.pending?.resolve(); entry.pending = undefined; }
  });
  return {
    place(element, key, options = {}) {
      if (!scope.alive || !(element instanceof HTMLElement) || typeof key !== "string") return Promise.reject(new Error(TASK_GRANTS_UNAVAILABLE));
      if (options.signal?.aborted) return Promise.reject(new DOMException("Area closed", "AbortError"));
      // The same element placed again changes its key: its area closes first.
      for (const [id, entry] of entries) if (entry.element === element) close(id);
      const id = ++sequence, signal = options.signal;
      return new Promise<void>((resolve, reject) => {
        const entry = { element, onChange: options.onChange, pending: { resolve, reject }, stop: undefined as (() => void) | undefined };
        entries.set(id, entry);
        if (signal) { const abort = () => close(id); signal.addEventListener("abort", abort, { once: true }); entry.stop = () => signal.removeEventListener("abort", abort); }
        send({ type: "task-grants-open", id, key });
        places.track(id, element);
      });
    },
  };
}
